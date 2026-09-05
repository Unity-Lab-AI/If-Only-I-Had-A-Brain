//! Convert the Stanford text table to the binary layout, then verify it.
//!
//! `cargo run --release -p unity-weights --example glove_convert -- <text> <bin> [--verify]`
use std::path::Path;
use unity_weights::glove;

fn main() {
    let a: Vec<String> = std::env::args().skip(1).collect();
    let (txt, bin) = (Path::new(&a[0]), Path::new(&a[1]));
    let t0 = std::time::Instant::now();
    let h = glove::convert(txt, bin).expect("convert failed");
    println!("converted in {:?} — dim={} count={} srcBytes={} srcLines={}",
             t0.elapsed(), h.dim, h.count, h.src_bytes, h.src_lines);
    println!("text {} bytes -> binary {} bytes",
             std::fs::metadata(txt).unwrap().len(), std::fs::metadata(bin).unwrap().len());

    let t1 = std::time::Instant::now();
    let g = glove::GloveMap::open(bin).expect("open failed");
    println!("OPEN (mmap + index build): {:?}  for {} words", t1.elapsed(), g.len());

    let t2 = std::time::Instant::now();
    let mut n = 0usize;
    for w in ["the", "cat", "unity", "goth", "brain", "neuron"] {
        if g.get(w).is_some() { n += 1; }
    }
    println!("6 lookups: {:?} ({n} hit)", t2.elapsed());

    if a.iter().any(|x| x == "--verify") {
        let t3 = std::time::Instant::now();
        match glove::verify_against_text(&g, txt).expect("verify io") {
            Ok(c) => println!("VERIFIED {c} vectors against the text table in {:?}", t3.elapsed()),
            Err(e) => { eprintln!("VERIFY FAILED: {e}"); std::process::exit(1); }
        }
    }
}
