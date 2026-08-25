# donor-v0.3.30 — upgrade before reconnecting

> Gee: *"make sure the doner is properly deployed and when the pod disconnects after the update is pressed, it shall upgrade to the updated most updated doner version before reconnecting attempts"*

## What changed

**A donor now upgrades itself at its next disconnect instead of reconnecting on a stale binary.**

The brain names the build it wants in its `welcome` handshake. The donor remembers it, and when a session ends it checks that number *before* attempting to reconnect. If a newer build is named, the donor **exits** — and exiting is how a pod upgrades, because the supervising launcher's loop re-resolves `releases/latest`, downloads, and relaunches.

## Why it was needed

A brain restart — the **Update & Fresh Walk** press — drops every donor. Before this release:

- the donor's internal auto-reconnect rejoined **on the binary it already had**, and
- the launcher's supervisor loop only turns over when the donor **process exits**, so it never re-checked,
- leaving the 5-minute upgrade watchdog as the only path — a window in which the pod runs a stale build against a freshly-updated brain.

⚠ And that window got sharper the same day: the brain's hard floor `DREAM_MIN_DONOR_VERSION` moved `0.3.7 → 0.3.26`, so a sufficiently old donor is now **refused** at `gpu_register` rather than merely being behind.

## Design notes

**⭐ No new dependency, and no HTTP call.** The donor has no HTTP client — only a WebSocket — and adding one would fight the deliberate cross-compile simplicity in `Cargo.toml` (native-tls, no aws-lc-rs/cmake on the win-gnu target). It does not need one: it is **already talking to the authority**. The server knows which binary it wants, so it says so on connect.

**⛔ Never on a transient blip.** The check fires only when the brain has *named a newer version*. A half-open link, a proxy drop, a brain that is simply down — none of those set a newer wanted-version, so the donor reconnects normally and keeps its replica. Turning every wobble into a process restart would cost a full **17-matrix re-upload** for nothing. This is the same reasoning behind the 150s ping timeout: reconnect-cycling mid-teach was already paid for once.

**⛔ Never mid-session.** The version is learned during a session and acted on only *after* it ends. Yanking a working donor out from under a running teach to install a point release would be the same mistake in a different coat.

**⛔ Never backwards.** `version_is_newer` returns false for equal, older, and anything it cannot confidently parse — because a `true` ends the process, so an unparseable or hostile version string must not be able to bounce a working donor. Same principle the launcher already states: *a fallback should never be able to move you backwards.*

**⛔ And it cannot loop.** This is the failure mode the feature could otherwise cause, so it is guarded explicitly. If the brain ever names a version that is not actually downloadable — a typo, a staged rollout, a bump that landed before its tag — the donor would exit, the launcher would reinstall the same older `releases/latest`, and every pod would spend forever downloading instead of donating. **Silently, and all at once.** So the exit is recorded in `<data_dir>/upgrade-attempt.txt`. If the donor comes back on the same version and is told the same thing, it refuses to bounce again, logs it loudly, and keeps donating on the binary it has. **Working-and-behind beats looping-and-idle.** The marker clears as soon as it is running a build the brain is content with.

## Distinct from the hard floor

| | `DREAM_MIN_DONOR_VERSION` | `DREAM_RECOMMENDED_DONOR_VERSION` |
|---|---|---|
| Effect | Connection **refused** at `gpu_register` | Donor upgrades at its **next disconnect** |
| Below it | `incompatible_version` + close 4001 | Keeps working normally |
| Purpose | Protocol compatibility | Staying current |

⭐ A donor above the floor but below the recommendation **keeps donating** — nobody is kicked mid-walk for being one release behind.

## Compatibility

- **Older donors are unaffected.** `recommendedDonorVersion` is an added field on an existing message; a donor without this code ignores it and upgrades via the launcher watchdog exactly as before.
- **No wire-format change.** No new frame types, no change to `gpu_register`, no change to any SPRS type. A 0.3.29 donor and a 0.3.30 donor speak identically.
- **No brain restart required** to benefit — the field ships with the server and is read on the next connect.

## Verified

- `cargo test --no-default-features` — **6 passed, 0 failed**, including two new cases covering the version comparator: upgrades only forward (equal / older / mixed-length all refuse), and garbage is inert (`""`, `latest`, `0.3.x`, `../../etc` all return false).
- `cargo check` clean on **all three feature sets**: default (`gui`+`cuda`), `--no-default-features --features cuda`, and `--no-default-features`.
- ⚠ **Not verified against a live brain.** The handshake field and the exit path land together on the next press.

## Release

Push the `donor-v0.3.30` tag → `.forgejo/workflows/donor-release.yml` builds Linux + Windows, publishes, attaches both binaries, and bumps the site download links.

⚠ **`CURRENT_DONOR_VERSION` in `server/brain-server.js` is already `0.3.30`.** That is safe before the tag exists — only 0.3.30+ reads the field, and a donor can only run 0.3.30 if it was published. ⛔ But **bump it WITH the tag in future, never ahead of it**: the anti-loop guard is a net, not a licence.
