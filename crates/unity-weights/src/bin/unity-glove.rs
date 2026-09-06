//! `unity-glove` — build and check the binary embedding table the brain boots from.
//!
//! Migration phase **B6(a)**, cutover half. The library half (`unity_weights::glove`)
//! proved the format; this is the thing the deploy actually runs and the thing
//! `js/brain/embeddings.js` names in its error message when the cache is absent.
//!
//! ## Why a separate binary and not a step inside the server
//!
//! The conversion is a **one-time, whole-file** job that must happen *before* the
//! Node process starts, because the Node process's first act is to read its
//! result. Doing it inside the server would mean the server can produce the file
//! it depends on — which is another way of saying the server has a slow path and
//! a fast path for the same data, and the slow one only ever runs when something
//! is already wrong.
//!
//! ⛔ **The text table stays the source of truth.** Everything here treats the
//! binary as a cache: `ensure` rebuilds it when the source's byte length no
//! longer matches the header, and refuses to leave a half-written file behind.
//!
//! ## Verbs
//!
//! ```text
//! unity-glove ensure  <text> <bin>   build if missing or stale; no-op if fresh
//! unity-glove convert <text> <bin>   build unconditionally
//! unity-glove verify  <bin>  <text>  re-read the text and compare every vector
//! unity-glove info    <bin>          print the header
//! ```
//!
//! ## Exit codes — these are what the deploy branches on
//!
//! | code | meaning |
//! |---|---|
//! | 0 | done, or already fresh |
//! | 1 | usage error |
//! | 2 | I/O failure (missing text table, unwritable destination) |
//! | 3 | the data is wrong — ragged row, corrupt cache, verification mismatch |
//!
//! ⚠ **2 and 3 are deliberately different.** *"I could not read the file"* and
//! *"I read it and it is wrong"* call for opposite responses from an operator,
//! and a single non-zero exit would collapse them into one.

use std::path::{Path, PathBuf};
use std::process::ExitCode;

use unity_weights::glove::{self, GloveMap};

const USAGE: &str = "\
unity-glove — build and check the brain's binary GloVe table

USAGE:
  unity-glove ensure  <text.txt> <out.bin>   build if missing or stale, else no-op
  unity-glove convert <text.txt> <out.bin>   build unconditionally
  unity-glove verify  <table.bin> <text.txt> compare every vector against the text
  unity-glove info    <table.bin>            print the header

EXIT: 0 ok · 1 usage · 2 I/O · 3 bad data
";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let verb = args.first().map(String::as_str).unwrap_or("");

    match verb {
        "ensure" | "convert" if args.len() == 3 => {
            let text = PathBuf::from(&args[1]);
            let out = PathBuf::from(&args[2]);
            run_build(&text, &out, verb == "ensure")
        }
        "verify" if args.len() == 3 => run_verify(Path::new(&args[1]), Path::new(&args[2])),
        "info" if args.len() == 2 => run_info(Path::new(&args[1])),
        "-h" | "--help" | "help" => {
            print!("{USAGE}");
            ExitCode::SUCCESS
        }
        _ => {
            eprint!("{USAGE}");
            ExitCode::from(1)
        }
    }
}

fn run_build(text: &Path, out: &Path, only_if_stale: bool) -> ExitCode {
    if !text.exists() {
        eprintln!(
            "unity-glove: the source table is missing at {} — this is the file the boot cannot start without (NO FALLBACKS). Fetch it from https://nlp.stanford.edu/data/glove.6B.zip",
            text.display()
        );
        return ExitCode::from(2);
    }

    if only_if_stale && out.exists() {
        // ⚠ A cache that cannot be checked against its source is a second
        // authority. The header carries the source's byte length precisely so
        // this check exists — and an unreadable cache counts as stale, not as a
        // failure, because the answer in both cases is "rebuild it".
        match GloveMap::open(out) {
            Ok(g) => match g.matches_source(text) {
                Ok(true) => {
                    println!(
                        "unity-glove: {} is fresh ({} vectors, {}d, source {} bytes) — nothing to do",
                        out.display(),
                        g.len(),
                        g.dim(),
                        g.header.src_bytes
                    );
                    return ExitCode::SUCCESS;
                }
                Ok(false) => {
                    let now = std::fs::metadata(text).map(|m| m.len()).unwrap_or(0);
                    println!(
                        "unity-glove: {} is STALE — built from a {}-byte source, the table on disk is now {} bytes. Rebuilding.",
                        out.display(),
                        g.header.src_bytes,
                        now
                    );
                }
                Err(e) => {
                    eprintln!("unity-glove: cannot stat the source table: {e}");
                    return ExitCode::from(2);
                }
            },
            Err(e) => {
                println!(
                    "unity-glove: {} exists but does not read as a table ({e}) — rebuilding rather than trusting it",
                    out.display()
                );
            }
        }
    }

    // ⛔ WRITE TO A TEMPORARY AND RENAME. The destination is boot-fatal, so a
    // conversion interrupted halfway (a kill, a full disk, a reboot mid-press)
    // must not leave a file that is present, plausibly sized, and truncated.
    // The deploy's own GloVe gate checks presence and size — exactly the two
    // things a half-written file would satisfy.
    let tmp = out.with_extension("bin.partial");
    let started = std::time::Instant::now();
    let header = match glove::convert(text, &tmp) {
        Ok(h) => h,
        Err(e) => {
            let _ = std::fs::remove_file(&tmp);
            let code = if e.kind() == std::io::ErrorKind::InvalidData { 3 } else { 2 };
            eprintln!("unity-glove: conversion failed: {e}");
            return ExitCode::from(code);
        }
    };
    if let Err(e) = std::fs::rename(&tmp, out) {
        let _ = std::fs::remove_file(&tmp);
        eprintln!("unity-glove: could not move the finished table into place: {e}");
        return ExitCode::from(2);
    }

    let bytes = std::fs::metadata(out).map(|m| m.len()).unwrap_or(0);
    println!(
        "unity-glove: wrote {} — {} vectors × {}d, {} bytes (source {} bytes, {} lines) in {:.1}s",
        out.display(),
        header.count,
        header.dim,
        bytes,
        header.src_bytes,
        header.src_lines,
        started.elapsed().as_secs_f64()
    );
    ExitCode::SUCCESS
}

fn run_verify(bin: &Path, text: &Path) -> ExitCode {
    let g = match GloveMap::open(bin) {
        Ok(g) => g,
        Err(e) => {
            eprintln!("unity-glove: {} does not read as a table: {e}", bin.display());
            return ExitCode::from(3);
        }
    };
    let started = std::time::Instant::now();
    match glove::verify_against_text(&g, text) {
        Err(e) => {
            eprintln!("unity-glove: cannot read the source table: {e}");
            ExitCode::from(2)
        }
        Ok(Err(mismatch)) => {
            eprintln!("unity-glove: VERIFICATION FAILED — {mismatch}");
            ExitCode::from(3)
        }
        Ok(Ok(n)) => {
            println!(
                "unity-glove: verified {n} vectors against {} in {:.1}s",
                text.display(),
                started.elapsed().as_secs_f64()
            );
            ExitCode::SUCCESS
        }
    }
}

fn run_info(bin: &Path) -> ExitCode {
    match GloveMap::open(bin) {
        Ok(g) => {
            println!("path        {}", bin.display());
            println!("version     {}", g.header.version);
            println!("vectors     {}", g.header.count);
            println!("dim         {}", g.header.dim);
            println!("vocabBytes  {}", g.header.vocab_bytes);
            println!("srcBytes    {}", g.header.src_bytes);
            println!("srcLines    {}", g.header.src_lines);
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("unity-glove: {} does not read as a table: {e}", bin.display());
            ExitCode::from(3)
        }
    }
}
