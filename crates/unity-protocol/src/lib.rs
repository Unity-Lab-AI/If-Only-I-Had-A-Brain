//! # unity-protocol — the donor wire contract, in one place
//!
//! Extracted from `donor-app/src/` on 2026-09-05 as phase B0 of the Rust
//! migration (`docs/RUST-MIGRATION.md` §5.1, *"Extract `donor-app/src/frames.rs`
//! + `protocol.rs` into a shared crate; make `donor-app` depend on it. Zero
//! behaviour change. Kills the duplicated protocol. Start here."*).
//!
//! ## Why this crate exists
//!
//! The wire protocol was defined **twice** — once here in Rust and once in the
//! JavaScript coordinator — and kept in step by hand. So was the Rulkov neuron
//! equation (`js/brain/gpu-compute.js` emits it as a WGSL string;
//! `donor-app/src/shaders/lif.wgsl` restates it with a comment saying it was
//! *"lifted from js/brain/gpu-compute.js to stay byte-compatible"*). **Every
//! duplicated definition is a drift risk**, and a drifting wire format does not
//! fail loudly — it misreads the frame after the one that changed.
//!
//! A Rust coordinator will depend on this crate instead of reimplementing it.
//! Until then the extraction is still worth its own commit: it is zero
//! behaviour change, so it can be verified by building, and everything later in
//! the migration depends on it.
//!
//! ## The boundary this crate must keep
//!
//! Per §5.2 it owns *"frame encode/decode, opcode enums, version negotiation"*
//! and must **not** own *"any I/O, any socket"*. Its only dependency is `serde`.
//! If something added here needs `tokio` or `wgpu`, it belongs in `unity-donor`.
//!
//! ## ⛔ Two couplings had to be broken to extract this, and both were traps
//!
//! **1. `env!("CARGO_PKG_VERSION")` — a silent wire lie waiting to happen.**
//! `GpuRegister::new` built `app_version` from that macro. It expands at compile
//! time to the version of *the crate the code lives in*, so the moment this file
//! moved here it would have reported **`unity-protocol`'s** version (`0.1.0`)
//! as the donor's `appVersion` instead of `unity-donor`'s `0.3.36`.
//!
//! ⚠ That is not cosmetic. The brain runs a **version gate** on the donor's
//! reported `appVersion`, and `.forgejo/workflows/donor-release.yml` refuses to
//! build when the tag and `Cargo.toml` disagree — precisely because a
//! mislabelled binary is a failure that looks like health. The macro would have
//! walked straight through both of those checks, since the file would have been
//! honestly reporting the version of the crate it now sits in.
//!
//! ⭐ Fixed by making it a **caller-supplied parameter**. The binary that IS the
//! donor is the only thing that knows what version the donor is.
//!
//! **2. `crate::mindspace::OPS` — the one cross-module reference.** The list of
//! mind-space ops the donor advertises was read from `mindspace.rs`. Moving the
//! constant here would have worked and would have been wrong: the list must
//! track the code that *implements* those ops, and this crate cannot see it.
//! Advertising a capability the donor does not have is worse than not
//! advertising one it does. So it is caller-supplied too, and stays declared
//! next to its implementation.
//!
//! ⭐ Both fixes are the same shape, and it is the shape this whole boundary
//! wants: **the protocol crate describes the message; it does not know the
//! facts that go in it.**

pub mod frames;
pub mod protocol;
