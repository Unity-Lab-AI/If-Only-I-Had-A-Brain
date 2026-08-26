# RUNPOD DONOR — CREATE SPEC

> **Ready-to-run recipe for building the replacement donor pod.** Do not execute
> until the operator asks for it — a GPU is picked at creation time and the old
> pod may be gone by then.

---

## ⛔ WHY THIS FILE EXISTS

A pod's **launch args are immutable**. `update-pod` accepts `name`, `image`,
`containerDiskInGb`, `volumeInGb`, `volumeMountPath`, `ports` and `env` — and
nothing else. The command a pod runs is fixed at creation, forever.

The pod created **2026-08-21** proves the cost of that. Its args were baked from
the launcher as it stood that day, and they still carry:

```
PIN=.../releases/download/donor-v0.3.26/unity-donor-linux-x86_64
[ -n "$U" ] || U=$PIN
```

So one unreachable release API at start makes it **download 0.3.26 over a newer
binary and keep it** — a silent downgrade, which is exactly the failure
`deploy/runpod-donor-launcher.sh` was later rewritten to remove. The repo has
been correct since that rewrite; the pod could never receive the fix.

⚠ **Creation is the only chance to get the command right. That is the whole
point of this file.**

---

## MATCH THE OLD POD

Read off the live pod before it was stopped, so the replacement is like-for-like:

| field | value |
|---|---|
| name | `unity-donor-a40-48gb` |
| GPU | **NVIDIA A40**, count **1** |
| image | `ubuntu:24.04` |
| container disk | **20 GB** |
| volume | none (no mounts) |
| cloud | `SECURE` |
| data centre | `CA-MTL-1` |
| ports | none exposed |
| cost | ~**$0.44/hr** at the time |

⚠ **The GPU and data centre are availability-dependent.** If the A40 in CA-MTL-1
is unavailable, check capacity first and pick the nearest equivalent rather than
silently accepting whatever is offered — the donor's throughput is the brain's
throughput, and a quiet downgrade here reads as "the brain got slower" later.

### Environment

| var | value |
|---|---|
| `DONOR_GPUS` | `all` |
| `DONOR_UTIL` | `all` |
| `DONOR_NAME` | ⚠ **the operator's handle — ask, do not hardcode** (it is the leaderboard identity, and operator names are banned from committed files) |
| `NVIDIA_VISIBLE_DEVICES` | `all` |
| `NVIDIA_DRIVER_CAPABILITIES` | `all` |

---

## THE COMMAND TO USE

⛔ **Do NOT copy the old pod's args. Use the current launcher**, which differs in
three ways that all matter:

1. **No pin, ever.** An unreachable API means *keep the binary already on disk*;
   only a pod with **no** binary waits and retries. It can never downgrade.
2. **Atomic install.** Downloads to `$BIN.new`, then `mv -f` — a truncated
   transfer can never leave a half-written binary where a working one was.
3. **Upgrade watchdog.** Re-checks the release tag every 5 min and restarts the
   donor when a newer one appears, so a long-lived pod stays current.
   ⚠ It kills by **captured PID**, never `pkill -f unity-donor` — the
   supervisor's own command line contains that string, so `pkill -f` would kill
   the loop meant to restart the donor and the pod would go dark unnoticed.

The command is the body of **`deploy/runpod-donor-launcher.sh`** (below the
header comment) wrapped as:

```
bash -c '<contents of runpod-donor-launcher.sh from `set -x` to the final `done`>'
```

⚠ **Take it from the file at creation time, not from this document** — a copy
here would become its own stale pin the first time the launcher improves, which
is the exact class of bug this file exists to prevent.

---

## AFTER CREATION — VERIFY, DO NOT ASSUME

The pod logs are the proof. Look for, in order:

1. `DONOR_RESOLVED url=… tag=donor-v…` — the API answered and the tag is the
   **current latest**, not an older one.
2. `===VERSION===` — the binary reports the same version the tag claimed.
   ⚠ A tag and a `--version` that disagree means the asset is mismatched.
3. `===LIST_GPUS===` — the GPU is present and is the one that was paid for.
4. `===LAUNCH=== tag=…` then a registration line on the brain side.

⛔ **A pod that starts is not a pod that is donating.** Confirm the brain shows
the donor registered and matrices uploading before calling it done.

---

## ORDER OF OPERATIONS

⚠ **Brain first, pod second.** Starting the donor before the brain is up just
puts it in its reconnect loop burning money against nothing — measured on
2026-08-26, when the pod sat at 0% GPU / 0% CPU for **24.9 hours** because the
brain it donates to was down the whole time.
