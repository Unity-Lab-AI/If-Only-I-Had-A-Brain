//! Emit a `UBWT` checkpoint so the **JavaScript reader** can be pointed at it.
//!
//! ⛔ This exists because "byte-compatible with the JS writer" is a claim, and a
//! Rust round-trip cannot test it — a reader and writer that share a bug agree
//! perfectly. The only check that means anything is the *other* implementation
//! reading this file.
//!
//! `cargo run -p unity-weights --example emit_checkpoint -- <path>`

use unity_weights::checkpoint::{write, Section};
use unity_weights::Csr;

fn main() {
    let path = std::env::args().nth(1).expect("usage: emit_checkpoint <path>");

    // Deliberately awkward on purpose:
    //  - a name length that is NOT a multiple of 4, to exercise the padding
    //  - an EMPTY row, which is a legal CSR shape the loader must not skip
    //  - values that are exact in f32 so a comparison can be equality, not epsilon
    let sections = vec![
        Section {
            name: "cortex.synapses".into(),
            matrix: Csr {
                rows: 3,
                cols: 4,
                row_ptr: vec![0, 2, 2, 4],
                col_idx: vec![0, 3, 1, 2],
                values: vec![0.25, -0.5, 1.0, 0.125],
            },
        },
        Section {
            name: "cortex.crossProjections.sem_to_motor".into(),
            matrix: Csr {
                rows: 1,
                cols: 2,
                row_ptr: vec![0, 1],
                col_idx: vec![1],
                values: vec![-0.0625],
            },
        },
    ];

    write(std::path::Path::new(&path), 7, &sections).expect("write failed");
    println!("wrote {path}");
}
