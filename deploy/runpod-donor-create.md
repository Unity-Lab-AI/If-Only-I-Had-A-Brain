---
# DOCPROV.3 — provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ `last-verified` is the commit that last TOUCHED THIS PAGE.
status: draft
sources:
  - deploy/runpod-donor-launcher.sh
  - donor-app/Cargo.toml
verified-scope: |
  CHECKED 2026-08-27 (DOCPROV.4) — and it HOLDS:
    - deploy/runpod-donor-launcher.sh carries the donor-v0.3.26 PIN ONLY inside
      a comment documenting its removal (:29); the live path resolves
      releases/latest (:56). The page's claim that "the repo has been correct
      since that rewrite" is verified, not assumed.
    - the only moved source is donor-app/Cargo.toml, bumped to 0.3.32.
  ADDED: an expectation-setter for the next recreate — donor-v0.3.32 reports
  mean_voltage on the WGPU backend only; the CUDA half is inert until
  src/kernels.ptx is regenerated, and a RunPod pod is a CUDA donor, so
  meanVoltage will still read null there. That is the instrument being honest,
  and it is exactly the shape that gets mis-read as "the fix didn't work".
  UPDATED 2026-08-27 (donor-v0.3.33): kernels.ptx regenerated (same CUDA
  12.0.140 build, same sm_75/ISA-8.0 envelope) — the expectation FLIPS; a pod
  recreated at 0.3.33+ reports mean_voltage, and a null there is now a real
  finding. Cargo.toml is at 0.3.33.
  UPDATED 2026-08-29: Cargo.toml is at 0.3.35 (v0.3.34 psi hemisphere gate +
  attention; v0.3.35 FIREMATH Rulkov-noise fix, kernels.ptx regenerated again
  on the same CUDA 12.0 toolchain). voltage_mean is still in the shipped PTX
  (checked donor-app/src/kernels.ptx), so the 0.3.33 expectation-flip above
  still HOLDS: a pod recreated on releases/latest reports mean_voltage.
  NOT CHECKED — do not read this page as authority on:
    - the LIVE pod's actual args. KI-35 records that they cannot be read back
      as mutable and that the pod runs the pre-fix launcher; nothing here
      re-probed the running pod.
    - the create-command steps themselves (image, disk, ports, env) - not
      exercised, since creating a pod costs money and drops the A40.
last-verified: "cd465955 2026-08-29"
---

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

> ## ⭐ RE-VERIFIED 2026-08-27 — this page HOLDS, and one expectation needs setting for the next recreate
>
> **Checked:** `deploy/runpod-donor-launcher.sh` carries the `donor-v0.3.26` PIN **only inside a comment** documenting its own removal (`:29`), and the live path resolves `releases/latest` (`:56`). ⭐ **So the claim *"the repo has been correct since that rewrite"* is true, verified rather than taken on trust.** The only source that moved is `donor-app/Cargo.toml`, bumped to **0.3.32** by the release below.
>
> ⛔ **THE EXPECTATION TO SET, because it will otherwise look like a regression.** `donor-v0.3.32` (GOTCHA.3b) makes `mean_voltage` report — **on the wgpu backend only.** The CUDA half is written but **inert**: the CUDA kernels load from a precompiled `src/kernels.ptx`, and `voltage_mean` is not in it, so the load is deliberately optional and returns "not reported".
>
> ⚠ **A RunPod pod is a CUDA donor.** So after a recreate on `releases/latest`, `clusters.<name>.meanVoltage` **will still read `null`** for the pod, and `meanVoltageSource` will read `unreported-by-this-donor`. ⭐ **That is the instrument being honest, not the fix failing** — and it is exactly the shape that gets mis-diagnosed as "GOTCHA.3b didn't work". **To actually enable it on the pod, `kernels.ptx` must be regenerated with the `voltage_mean` entry** (see `donor-app/RELEASE-0.3.32.md` for why that was not done in the same pass: the PTX targets `compute_60` and the available nvcc is CUDA 13.0, which dropped that arch).
>
> ✅ **SUPERSEDED BY `donor-v0.3.33` (2026-08-27) — the expectation above FLIPS.** The PTX was regenerated with the toolchain **matched rather than upgraded** — the same CUDA 12.0.140 compiler build in a container, same `sm_75` / ISA 8.0 envelope, eight pre-existing kernels byte-identical under label normalization — so `voltage_mean` is now in the shipped PTX and the compatibility floor moved nothing. ⭐ **A pod recreated on `releases/latest` at 0.3.33+ REPORTS `mean_voltage`.** If it still reads `unreported-by-this-donor` after a 0.3.33 recreate, **that is now a real finding, not the expected shape.** ⚠ The 0.3.32 note's `compute_60` claim was wrong against the PTX's own header (`.target sm_75`) — the real constraint was the PTX **ISA version** (the v0.3.21 r570-hosts fix), which is why the regeneration pinned the toolchain. Full story: `donor-app/RELEASE-0.3.33.md`.

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
