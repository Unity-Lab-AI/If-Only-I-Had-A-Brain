# `deploy/dropins/` — the box's systemd drop-ins, finally in git

These are verbatim copies of what actually lives in
`/etc/systemd/system/unity-brain.service.d/` on the OVH box, captured 2026-08-26.

**Why this directory exists.** For months these were box-only hand edits that the
repo knew nothing about. The 2026-08-26 recovery surfaced the problem: the briefed
follow-up was `cp deploy/unity-brain.service /etc/systemd/system/`, and running it
would have *silently reverted* live, load-bearing configuration — including a size
pin that only exists because a silent resize already wiped the trained brain once
(2026-06-30). A clean re-install from the repo alone would have lost all of it.

Drop-ins are the right mechanism (they layer over the main unit instead of
replacing it), so they are kept as drop-ins here rather than folded into
`unity-brain.service`. That also means overwriting the main unit stays safe.

## Install / refresh

```bash
sudo mkdir -p /etc/systemd/system/unity-brain.service.d
sudo install -o root -g root -m 644 deploy/dropins/*.conf \
     /etc/systemd/system/unity-brain.service.d/
sudo systemctl daemon-reload
```

`daemon-reload` alone is enough for these to take effect — **no brain restart
needed**, so this is safe to apply on a running brain. Verify with:

```bash
systemctl show unity-brain -p StartLimitIntervalUSec -p Restart \
  -p RestartPreventExitStatus -p SuccessExitStatus -p Environment
```

## What each one does

| file | effect | why it must not be lost |
|---|---|---|
| `10-pin-brain-size.conf` | `DREAM_DONOR_FIT_MB=4096` | Pins brain size so a change to the sizing default can't silently resize → `autoClearStaleState` wipes all weights. This already happened on 2026-06-30 (saved 39,999,995 vs computed 51,130,559). |
| `20-enable-consolidation.conf` | `DREAM_CONSOLIDATION_DISABLE=` (empty) | Overrides the main unit's `=1` kill-switch back **on**, so Tier 1→2→3 memory promotion actually runs. EL.1 chunked Hebbian + the 30s DEADLINE-ABORT made it safe again. |
| `30-no-start-limit.conf` | `StartLimitIntervalSec=0` | Disables systemd's default 5-starts-per-10s limiter, which would otherwise leave the unit **permanently dead** after a boot-time crash loop — stranding a box whose operator has no shell. Added during the 2026-08-26 recovery. |

## Caveat — the installed main unit may still be ahead of the repo

As of 2026-08-26 the installed `unity-brain.service` carried `RestartPreventExitStatus=42`
and `SuccessExitStatus=42` before the repo did (`main` has them now, at `9e10454b`).
Before overwriting the main unit on any box, diff it first:

```bash
diff /etc/systemd/system/unity-brain.service /opt/unity-brain/deploy/unity-brain.service
```
