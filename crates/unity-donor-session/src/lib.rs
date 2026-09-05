//! # unity-donor-session — donor sessions and readback assembly
//!
//! Migration phase **B3**. §5.2 gives this crate *"WebSocket sessions,
//! upload/readback lifecycle, `_gpuBound` state"* and forbids it *"HTTP routing,
//! checkpoint policy"* — so there are **no sockets and no save decisions here**.
//! This is the state machine those things drive, which is exactly what makes it
//! testable without a live donor.
//!
//! ⭐ That separation is the point of the phase. `gpu.js` is 5,702 lines mixing
//! transport, weight lifetime and checkpoint policy, *"which is exactly why a
//! dtype change could silently break persistence in a file nobody associated
//! with dtypes."*
//!
//! ⚠ **The crate is named `unity-donor-session`, not `unity-donor`.** §5.1 calls
//! it `unity-donor`, but `donor-app`'s binary already owns that name and two
//! things with one name in one workspace is precisely the drift this migration
//! exists to remove.
//!
//! ## What is here, and what is deliberately not
//!
//! | built | why it can be tested cold |
//! |---|---|
//! | [`readback`] — chunk assembly, ordering, overrun, FNV verification | pure byte logic; the donor is a stream of chunks |
//! | [`session`] — PRIMARY eligibility, `_gpuBound`, departures, version gates | pure state; a socket is not needed to decide who is eligible |
//!
//! **Not here:** dispatch scheduling and the wire itself. Those need a live
//! donor to mean anything, and a scheduler that has never scheduled is the same
//! artifact class as a deploy binary that has never deployed.

pub mod readback;
pub mod session;
