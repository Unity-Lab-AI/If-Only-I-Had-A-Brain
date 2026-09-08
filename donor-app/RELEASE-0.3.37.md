# donor v0.3.37 — the donor ends itself when it is neither donating nor trying

**No protocol change. No new opcode. No behaviour change on any healthy donor.**
This adds one thing: a headless donor that has gone silent now *exits*, so the
supervisor that launched it reinstalls and relaunches it.

## Why

Twice now a pod has been alive, paid for, and donating nothing:

| when | what |
|---|---|
| **2026-08-26** | the pod sat at **0% GPU / 0% CPU for 24.9 hours** |
| **2026-09-08** | the donor process was alive, on the **correct** release, with the brain's WS lane handshaking cleanly — and **not attached**, printing nothing, for **53+ minutes** |

⛔ On the second one the brain read `donorCount 0` and `meanVoltageSource
no-gpu-donor-attached`, and because **the walk is donor-gated** she sat at
`frames 0 · spikes 0 · psi 0 · cellStatus idle` the entire time — while
`/health` answered 200 in under a millisecond and every memory and pressure
reading was green.

## What could not see it, and why

**The pod's supervisor watches the wrong thing.** `wait $DP` returns when the
donor process EXITS; `kill -0 $DP` asks only whether it EXISTS. **A donor that is
donating and a donor that is alive-but-wedged are identical to both.**

⛔ **And `run_donor_supervised` could not see it either.** That loop prints on
every retry, and the pod logs carried **no donor output at all** — so it was
never in the reconnect loop. It was pinned *inside* `run_donor`. This codebase
already names that class, on `WORKER_JOIN_PATIENCE`:

> *"blocked inside a wedged GPU call would otherwise pin run_donor forever and
> make the reconnect supervisor unreachable (the exact failure the supervisor
> exists to prevent)"*

⭐⭐ **So the check cannot live on the thing it is checking.** The watchdog is a
plain OS thread that only reads an atomic and sleeps, so it survives whatever the
tokio runtime, the GPU driver or a socket is doing. Same reasoning as the brain's
own loop watchdog, which runs off-thread precisely because *every diagnostic
channel rode the loop under investigation*.

## What it does

Progress is stamped at four points — a frame arriving from the brain,
registration, the **top of every supervisor reconnect attempt**, and **entry to /
exit from the GPU engine build**. If none of them has happened for
`DONOR_SELF_EXIT_SECS`, the process prints why and exits **17**.

⚠⚠ **IT REQUIRES BOTH SILENCES, AND THAT IS THE WHOLE DESIGN.** A brain that is
simply **down** keeps stamping, because the supervisor is still looping and its
backoff caps at **30 s** — twenty times faster than the default window. So a
brain outage can never be mistaken for a wedge. **Only "not receiving AND not
even trying" trips it**, and that state has no legitimate meaning.

⭐ **Exiting IS the fix, not a crash.** The launcher's supervisor already
reinstalls and relaunches on exit — that is exactly how `UPGRADE BEFORE
RECONNECT` has worked since 0.3.30. ⛔ **Which means this repairs the LIVE pod as
well**, whose baked-in `args` can never be changed (`update-pod` does not accept
them, by design).

## ⛔ The false positive I shipped and the harness caught

The first cut stamped progress only at the top of the supervisor loop. Run
against an unreachable brain at a 40 s window, it **killed the donor at 59 s** —
manufacturing exactly the failure it exists to prevent.

**Cause:** a healthy *first* session is legitimately silent for a while — engine
init is bounded at `ENGINE_INIT_TIMEOUT` (75 s) and the connect that follows has
its own timeout — and the loop-top stamp cannot help, because the loop has not
come back round yet. **Starting is not being stuck.**

**Two fixes, both from that measurement:**

1. The engine build now stamps on entry and on completion.
2. `DONOR_SELF_EXIT_SECS` is **floored at 300 s** (`0` still disables). ⭐ **The
   floor is a measured bound, not padding: a window shorter than a legal startup
   does not detect wedges, it manufactures them.** Same `max()` idiom the hang
   limit already uses.

## Verified

- `cargo check` clean on **both** feature sets (headless `--no-default-features`
  and the default GUI build).
- **False-fire test against an unreachable brain**, run on the real release
  binary: at the 300 s floor over a 360 s watch the donor kept retrying and
  **never exited**, with reconnect attempts observed throughout.
- **Floor test:** asking for 40 s arms at 300 s, printed in the arming line.
- The arming line names the window and the condition, so a pod log says what is
  armed rather than leaving it to be inferred.

## Config

| var | default | meaning |
|---|---|---|
| `DONOR_SELF_EXIT_SECS` | `600` | silence before self-exit. Floored at `300`; `0` disables |

⚠ **Headless/autostart only.** An interactive GUI user may sit deliberately idle,
and ending their process would be a bug rather than a fix — **an interactive idle
is a choice; an unattended silence is a fault.**
