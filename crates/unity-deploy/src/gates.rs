//! The two refusals that stand in front of a press.
//!
//! Ported from `deploy/self-update.sh`. Both exist for the same reason and it is
//! the reason this project keeps paying for: **a press that "succeeds" into a
//! brain that cannot boot is worse than a press that refuses.**
//!
//! ⛔⛔ **BOTH GATES ABORT *BEFORE* `.force-fresh` IS ARMED.** That ordering is
//! the whole safety property: a refusal leaves the service running the old code,
//! the trained weights untouched, and no pending wipe. A gate that refused
//! *after* arming would turn "I declined to deploy" into "the next restart from
//! any cause wipes her".
//!
//! ⭐ And they are checked against **the directory the server actually reads**,
//! never against the exit code of the step that was supposed to fill it. An exit
//! code says a command finished; it does not say the books are there.

use std::path::{Path, PathBuf};

/// The GloVe floor. The real table is ~1.04 GB; anything under this is a stub or
/// a truncated transfer.
pub const GLOVE_MIN_BYTES: u64 = 100_000_000;

/// A gate's answer. ⚠ `Refuse` carries the operator-facing reason, because the
/// person reading it has no shell and one line to work from.
#[derive(Debug, PartialEq, Eq)]
pub enum Gate {
    Pass(String),
    Refuse(String),
}

impl Gate {
    pub fn is_pass(&self) -> bool { matches!(self, Gate::Pass(_)) }
    pub fn message(&self) -> &str {
        match self { Gate::Pass(m) | Gate::Refuse(m) => m }
    }
}

/// ⛔ THE BOOKS GATE. Whether the data sync ran, was skipped, or failed, the one
/// thing that must be true before a restart is that there ARE books.
///
/// ⭐ A press that leaves her with an empty corpus produces **a walk of empty
/// cells and reports it as a successful deploy** — the exact *"instrument says
/// fine while nothing is there"* failure.
pub fn books_gate(corpora_dir: &Path) -> Gate {
    let academic = corpora_dir.join("academic");
    let n = count_files(&academic, "json");
    if n < 1 {
        Gate::Refuse(format!(
            "no corpus on the box ({} is empty or missing) and the data sync did not provide one. \
             ABORTING: the service keeps running the old code, the trained weights are untouched, \
             and no wipe is armed. Fix the data-repo pull and press again.",
            academic.display()))
    } else {
        Gate::Pass(format!("corpus: {n} academic cells present"))
    }
}

/// ⛔ THE GLOVE GATE. The boot reads this table before anything else and stops
/// hard without it (NO FALLBACKS), so restarting without it produces **a crash
/// loop rather than a walk**.
///
/// ⚠ **Existence is not the check.** A git-LFS pointer stub is a real file: it
/// exists, it is readable, and nothing else would notice. The boot reads it,
/// fails to parse a single vector, and stops by design.
///
/// ⭐ Three distinct verdicts, because they have three different fixes: missing
/// (the pull did not deliver), a **pointer stub** (install git-lfs, or un-LFS
/// the file upstream), and **truncated** (a partial transfer — press again).
pub fn glove_gate(path: &Path, min_bytes: u64) -> Gate {
    let meta = match std::fs::metadata(path) {
        Err(_) => return Gate::Refuse(format!(
            "the GloVe embedding table is MISSING at {}. The boot reads it before anything else and \
             stops hard without it (NO FALLBACKS), so restarting now would produce a crash loop \
             rather than a walk. ABORTING — weights untouched, no wipe armed.", path.display())),
        Ok(m) => m,
    };
    let bytes = meta.len();
    if bytes >= min_bytes {
        return Gate::Pass(format!("embeddings: GloVe present, {bytes} bytes"));
    }
    // ⚠ Read the HEAD, not the name. An LFS stub begins `version https://git-lfs…`.
    let head = read_head(path, 40);
    if head.windows(7).any(|w| w == b"git-lfs") {
        Gate::Refuse(format!(
            "{} is a GIT-LFS POINTER STUB ({bytes} bytes), not the embedding table. It is a real \
             file, so nothing else would have noticed; the boot would read it, fail to parse a \
             single vector, and stop by design. Install git-lfs on this box or un-LFS that file \
             upstream. ABORTING before any wipe is armed — weights untouched.", path.display()))
    } else {
        Gate::Refuse(format!(
            "{} is only {bytes} bytes against a {min_bytes}-byte floor; the real table is about \
             1.04 GB. This is a truncated or partial transfer, and the boot stops hard on it. \
             ABORTING — weights untouched, no wipe armed.", path.display()))
    }
}

/// A freshly downloaded GloVe table is only accepted when it is **both** big
/// enough **and** shaped right: the first row must be a word plus 300 numbers.
///
/// ⚠ Size alone would accept a 1 GB HTML error page. ⭐ Verifying before the
/// `mv` means a failed download is discarded rather than left as a file the boot
/// would die on — *"discarding it rather than leaving a file the boot would die
/// on"*.
pub fn glove_download_acceptable(path: &Path, min_bytes: u64) -> Gate {
    let bytes = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    let cols = first_row_fields(path);
    if bytes >= min_bytes && cols == 301 {
        Gate::Pass(format!("GloVe verified: {bytes} bytes, first row has 300 dimensions"))
    } else {
        Gate::Refuse(format!(
            "the downloaded table failed verification ({bytes} bytes, first row {cols} fields \
             against an expected 301). Discarding it rather than leaving a file the boot would \
             die on."))
    }
}

/// The overlay's `--delete` exclude set.
///
/// ⛔⛔ **THIS LIST IS LOAD-BEARING AND `--delete` IS WHY.** The overlay mirrors
/// a fresh clone over the backend, so anything not in the source and not
/// excluded is **deleted**. That is how a deploy can remove the trained weights,
/// the books, or the 114 GB of fields.
///
/// ⚠ `corpora` is deliberately **not** excluded wholesale — only
/// `corpora/glove.6B.*`. The books are repopulated by the data sync and then
/// verified by [`books_gate`], which is why a missing `--exclude 'corpora'` is
/// **not** the hazard it looks like. Checking for that exact string is how a
/// stale audit "confirms" a bug that does not exist.
pub fn overlay_excludes() -> Vec<&'static str> {
    vec![
        ".git", "node_modules", ".env", "server/.env",
        "brain-weights*", "server/brain-weights*",
        "schemas.json", "server/schemas.json",
        "identity-core.json", "server/identity-core.json",
        "episodic-memory.db*", "server/episodic-memory.db*",
        "conversations.json", "server/conversations.json",
        "fields",
        "corpora/glove.6B.*",
        ".claude",
        // ⛔ These two live UNDER the backend dir, so without them `--delete`
        // removes the staging directory the deploy is reading from, mid-deploy.
        ".staging",
        ".self-update.lock",
    ]
}

/// Would `--delete` remove this path? Used to assert the excludes actually cover
/// what they claim.
pub fn is_protected(rel: &str) -> bool {
    overlay_excludes().iter().any(|pat| glob_match(pat, rel))
}

/// rsync-ish match: a leading path is a prefix, `*` matches within a segment.
fn glob_match(pat: &str, path: &str) -> bool {
    if let Some(stem) = pat.strip_suffix('*') {
        if path.starts_with(stem) { return true; }
    }
    if path == pat { return true; }
    // A bare name matches the entry itself or anything under it.
    if !pat.contains('/') {
        if path == pat || path.starts_with(&format!("{pat}/")) { return true; }
        if let Some(stem) = pat.strip_suffix('*') {
            return path.split('/').next_back().is_some_and(|last| last.starts_with(stem));
        }
    }
    path.starts_with(&format!("{pat}/"))
}

fn count_files(dir: &Path, ext: &str) -> usize {
    let Ok(rd) = std::fs::read_dir(dir) else { return 0 };
    rd.filter_map(Result::ok)
        .filter(|e| e.path().extension().is_some_and(|x| x == ext))
        .count()
}

fn read_head(p: &Path, n: usize) -> Vec<u8> {
    use std::io::Read;
    let mut buf = vec![0u8; n];
    match std::fs::File::open(p).and_then(|mut f| f.read(&mut buf)) {
        Ok(got) => { buf.truncate(got); buf }
        Err(_) => Vec::new(),
    }
}

fn first_row_fields(p: &Path) -> usize {
    use std::io::{BufRead, BufReader};
    let Ok(f) = std::fs::File::open(p) else { return 0 };
    let mut line = String::new();
    if BufReader::new(f).read_line(&mut line).is_err() { return 0; }
    line.split_whitespace().count()
}

/// Convenience: run both gates in the order the script does.
pub fn preflight(corpora_dir: &Path, glove: &Path, min_bytes: u64) -> Result<Vec<String>, String> {
    let mut ok = Vec::new();
    match books_gate(corpora_dir) {
        Gate::Pass(m) => ok.push(m),
        Gate::Refuse(m) => return Err(m),
    }
    match glove_gate(glove, min_bytes) {
        Gate::Pass(m) => ok.push(m),
        Gate::Refuse(m) => return Err(m),
    }
    Ok(ok)
}

/// Where the deploy expects these, given a backend root.
pub fn default_paths(backend: &Path) -> (PathBuf, PathBuf) {
    (backend.join("corpora"), backend.join("corpora/glove.6B.300d.txt"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn workdir(name: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("unity-gates-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    // ── books gate ───────────────────────────────────────────────────────────
    #[test]
    fn books_gate_refuses_an_empty_or_missing_corpus() {
        let d = workdir("nobooks");
        let g = books_gate(&d.join("corpora"));
        assert!(!g.is_pass());
        assert!(g.message().contains("no corpus on the box"));
        assert!(g.message().contains("weights are untouched"),
            "the refusal must tell the operator what it did NOT do: {}", g.message());
    }

    #[test]
    fn books_gate_passes_once_academic_cells_exist() {
        let d = workdir("books");
        let a = d.join("corpora/academic");
        std::fs::create_dir_all(&a).unwrap();
        std::fs::write(a.join("cell-1.json"), b"{}").unwrap();
        std::fs::write(a.join("cell-2.json"), b"{}").unwrap();
        let g = books_gate(&d.join("corpora"));
        assert!(g.is_pass(), "{}", g.message());
        assert!(g.message().contains('2'));
    }

    #[test]
    fn books_gate_ignores_non_json_so_a_stray_readme_cannot_pass_it() {
        let d = workdir("stray");
        let a = d.join("corpora/academic");
        std::fs::create_dir_all(&a).unwrap();
        std::fs::write(a.join("README.md"), b"not a cell").unwrap();
        assert!(!books_gate(&d.join("corpora")).is_pass(),
            "a directory that merely EXISTS is not a corpus");
    }

    // ── GloVe gate ───────────────────────────────────────────────────────────
    #[test]
    fn glove_gate_refuses_a_missing_table_and_says_the_boot_would_crash_loop() {
        let d = workdir("noglove");
        let g = glove_gate(&d.join("glove.6B.300d.txt"), GLOVE_MIN_BYTES);
        assert!(!g.is_pass());
        assert!(g.message().contains("MISSING"));
        assert!(g.message().contains("crash loop"),
            "the reason matters more than the refusal: {}", g.message());
    }

    #[test]
    fn glove_gate_names_a_pointer_stub_specifically() {
        // ⛔ THE ONE THAT LOOKS LIKE A HEALTHY FILE. Existence is not the check.
        let d = workdir("stub");
        let p = d.join("glove.6B.300d.txt");
        std::fs::write(&p, b"version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 1037962819\n").unwrap();
        let g = glove_gate(&p, GLOVE_MIN_BYTES);
        assert!(!g.is_pass());
        assert!(g.message().contains("POINTER STUB"), "{}", g.message());
        assert!(g.message().contains("git-lfs"), "the FIX must be in the message: {}", g.message());
    }

    #[test]
    fn glove_gate_distinguishes_truncated_from_stub_because_the_fixes_differ() {
        let d = workdir("trunc");
        let p = d.join("glove.6B.300d.txt");
        std::fs::write(&p, vec![b'x'; 500]).unwrap();
        let g = glove_gate(&p, GLOVE_MIN_BYTES);
        assert!(!g.is_pass());
        assert!(g.message().contains("truncated or partial"), "{}", g.message());
        assert!(!g.message().contains("POINTER STUB"),
            "a truncated file is not a stub — reporting it as one sends the operator to install git-lfs for nothing");
    }

    #[test]
    fn glove_gate_passes_a_table_over_the_floor() {
        let d = workdir("goodglove");
        let p = d.join("glove.6B.300d.txt");
        std::fs::write(&p, vec![b'x'; 1024]).unwrap();
        assert!(glove_gate(&p, 512).is_pass());
    }

    // ── download verification ────────────────────────────────────────────────
    #[test]
    fn a_downloaded_table_must_be_both_big_enough_and_shaped_right() {
        let d = workdir("dl");
        let p = d.join("glove.txt");

        // 301 fields (word + 300 dims) and over the floor → accepted.
        let row = std::iter::once("word".to_string())
            .chain((0..300).map(|i| format!("{}.0", i)))
            .collect::<Vec<_>>().join(" ");
        std::fs::write(&p, format!("{row}\n")).unwrap();
        assert!(glove_download_acceptable(&p, 100).is_pass());

        // Big enough but WRONG SHAPE — e.g. a 1 GB HTML error page.
        std::fs::write(&p, "<html><body>404 Not Found</body></html>\n".repeat(50)).unwrap();
        let g = glove_download_acceptable(&p, 100);
        assert!(!g.is_pass(), "size alone must not accept a download");
        assert!(g.message().contains("Discarding it"),
            "a failed download must be DISCARDED, not left where the boot will die on it: {}", g.message());
    }

    // ── the exclude list ─────────────────────────────────────────────────────
    #[test]
    fn the_excludes_protect_everything_a_delete_could_destroy() {
        for p in [
            "brain-weights.json", "brain-weights.bin", "server/brain-weights.bin",
            "identity-core.json", "server/identity-core.json",
            "episodic-memory.db", "server/episodic-memory.db-wal",
            "fields", "fields/a/b.field.json",
            "corpora/glove.6B.300d.txt",
            ".staging", ".staging/bw/x",
            ".self-update.lock",
            ".env", "server/.env",
        ] {
            assert!(is_protected(p), "an overlay --delete would destroy {p}");
        }
    }

    #[test]
    fn the_books_are_deliberately_not_excluded_wholesale() {
        // ⚠ THE AUDIT TRAP. `--exclude 'corpora'` is ABSENT on purpose: the data
        // sync repopulates the books and the books gate then verifies them.
        // Grepping for that exact string is how a stale audit "confirms" a
        // corpus-deletion hazard that does not exist.
        assert!(!is_protected("corpora/academic/cell-1.json"),
            "the books are repopulated by the data sync, not preserved by the overlay");
        assert!(is_protected("corpora/glove.6B.300d.txt"),
            "but GloVe IS excluded — it is 1.04 GB and boot-fatal");
    }

    #[test]
    fn the_claude_tree_stays_out_of_the_overlay() {
        assert!(is_protected(".claude"));
        assert!(is_protected(".claude/CONSTRAINTS.md"));
    }

    // ── preflight ordering ───────────────────────────────────────────────────
    #[test]
    fn preflight_refuses_on_the_first_gate_and_reports_which() {
        let d = workdir("pre");
        let (corpora, glove) = default_paths(&d);
        let e = preflight(&corpora, &glove, GLOVE_MIN_BYTES).unwrap_err();
        assert!(e.contains("no corpus"), "books are checked first: {e}");

        // Give it books; now GloVe is the blocker.
        let a = corpora.join("academic");
        std::fs::create_dir_all(&a).unwrap();
        std::fs::write(a.join("c.json"), b"{}").unwrap();
        let e = preflight(&corpora, &glove, GLOVE_MIN_BYTES).unwrap_err();
        assert!(e.contains("MISSING"), "{e}");

        // And with both, it passes and reports both.
        std::fs::create_dir_all(glove.parent().unwrap()).unwrap();
        std::fs::write(&glove, vec![b'x'; 200]).unwrap();
        let ok = preflight(&corpora, &glove, 100).unwrap();
        assert_eq!(ok.len(), 2, "a passing preflight must say what it verified: {ok:?}");
    }
}
