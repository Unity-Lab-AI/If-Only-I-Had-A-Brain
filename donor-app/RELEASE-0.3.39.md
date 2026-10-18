# donor v0.3.39 — a crash now writes its own reason down

**No protocol change. No new opcode. No behaviour change while connected.**
This release adds a crash log, keeps symbols in the build, and moves the
GUI's three page links to the site's own domain.

## Why

On 2026-10-18 the Windows donor died with exception `0xc0000409` (a Rust
abort) two seconds after the brain it was attached to went dark. Windows kept
a dump; the dump held no message; the binary was stripped, so the fault
offset named nothing; and the GUI build detaches from the console, so the
panic text Rust prints to stderr went nowhere. A donor that dies without a
word cannot be fixed.

## What changed

| | before | after |
|---|---|---|
| panic / abort reason | stderr only — lost in the GUI build | **`<data dir>/unity-donor/crash.log`** — time, version, message, source location, backtrace; appended, never truncated |
| symbols in the release build | `strip = true` (no `.pdb`, offsets unnameable) | line tables kept (`debug = "line-tables-only"`), so a dump maps to a file and line |
| GUI links (legend / dashboard / leaderboard) | `https://unity-lab-ai.github.io/If-Only-I-Had-A-Brain/html/…` | `https://theunitybrain.com/html/…` |

The data dir is the same one that holds `settings.json` and `donor-id`
(`%APPDATA%\unity-donor` on Windows, `~/.local/share/unity-donor` on Linux).
The hook runs before anything else in `main`, so a panic anywhere — the GPU
worker, the WebSocket loop, the GUI — lands in the file before the process
unwinds or aborts.

## Nothing else

Same wire contract, same capability gates, same `PROD_SERVER`
(`wss://dumbass.tailec58e0.ts.net/ws`), same self-exit-when-silent behaviour.
The brain's `DREAM_MIN_DONOR_VERSION` floor is unchanged (0.3.26).
