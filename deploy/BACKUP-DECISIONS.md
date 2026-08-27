---
# DOCPROV.3 — provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ `last-verified` is the commit that last TOUCHED THIS PAGE.
# ⚠ Two POLICY decisions on this page are still the operator's and are not
# engineering drift: retention (`--keep-daily 3`) and the repo living on the same
# array as the brain.
status: draft
sources:
  - deploy/dropins/nightly-backup/10-fix-restic-password.conf
  - deploy/dropins/README.md
last-verified: "665a5cac 2026-08-26"
---

# Backup hardening — the two decisions left for Gee (2026-08-26)

Both came out of the 2026-08-26 wipe incident, where the search for a restore
point revealed that **`nightly-backup.service` had failed every night since
2026-05-20** (its own `ProtectHome=true` hid `/root/.restic-password` from it).
That bug is **already fixed and verified** — see
`deploy/dropins/nightly-backup/10-fix-restic-password.conf`; the weights are now
genuinely inside a snapshot for the first time since May.

What is left is not a bug, it is two **policy choices** about how much protection
the trained brain gets. I have deliberately not made them unilaterally, because
retention and off-box copies have cost/privacy implications that are yours, not
mine. Each is a one-liner.

---

## Decision 1 — retention is 3 days, and the brain takes weeks to train

`/usr/local/sbin/nightly-backup.sh` line 60:

```bash
restic forget --keep-daily 3 --prune
```

Three days of history for something that takes **weeks** of GPU donation to
train. A problem noticed on a Monday about a Friday is already unrecoverable.

**Why this is nearly free:** restic deduplicates, the staged brain state is
~22 MB per snapshot, the box has **717 GB free**, and the existing repo is 34 GB.
Ninety daily snapshots of brain state is well under 2 GB.

**Suggested change** (keeps a useful ladder instead of a 3-day window):

```bash
restic forget --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune
```

That is ~2 weeks of dailies, 2 months of weeklies and a year of monthlies. Apply
with:

```bash
sudo sed -i 's/--keep-daily 3 --prune/--keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune/' \
     /usr/local/sbin/nightly-backup.sh
sudo grep -n keep-daily /usr/local/sbin/nightly-backup.sh    # confirm
sudo systemctl start nightly-backup                          # prove it still succeeds
```

---

## Decision 2 — the backup lives on the same disk as the thing it backs up

```
repo:   /var/backups/restic     ->  /dev/md3
brain:  /opt/unity-brain        ->  /dev/md3     # same array
```

`md3` is a RAID array, so it survives a single disk failure — but **not** an array
loss, a filesystem corruption, an accidental `rm -rf`, or the box being
reprovisioned. Today a single bad event takes the brain *and* every backup of it.

This one I am not going to pick for you, because it costs money and involves
credentials:

- **cheapest:** `rclone`/`restic` to any S3-compatible bucket (OVH Object Storage
  is on the same account). ~22 MB/night deduped is pennies.
- **simplest:** a second restic repo on a different host you already control, and
  a `restic copy` after each nightly run.
- **manual floor:** even a periodic `restic snapshots` check plus an occasional
  copy of `brain-weights.bin` off-box is better than the current single point of
  failure.

Whatever you choose, the nightly script is the right place to add it (it already
stages the brain state), and the `ExecStopPost` from the drop-in will now shout
in the journal if it starts failing.

---

## Verify the backup is actually working (do this occasionally)

The whole reason the outage lasted three months is that nothing checked. A backup
you have never restored from is a hypothesis, not a backup.

```bash
# 1. did last night succeed?
systemctl show nightly-backup -p Result -p ExecMainStatus     # want success / 0

# 2. do snapshots exist, and is the newest recent?
sudo env RESTIC_REPOSITORY=/var/backups/restic \
     RESTIC_PASSWORD_FILE=/root/.restic-password \
     restic snapshots --no-lock | tail -5

# 3. THE ONE THAT MATTERS — is the brain actually in there?
sudo env RESTIC_REPOSITORY=/var/backups/restic \
     RESTIC_PASSWORD_FILE=/root/.restic-password \
     restic ls latest --no-lock | grep unity-brain/
#    expect brain-weights*.bin/.json, identity-core.json, schemas.json,
#    conversations.json, episodic-memory.db*

# 4. restore-test into a scratch dir (does NOT touch the live brain)
sudo env RESTIC_REPOSITORY=/var/backups/restic \
     RESTIC_PASSWORD_FILE=/root/.restic-password \
     restic restore latest --target /tmp/restore-test \
     --include '*/unity-brain/*'

# the staging dir name is random per run, hence the glob
ls -la /tmp/restore-test/var/backups/staging.*/unity-brain/

# and confirm a restored weight file is actually INTACT, not just present
python3 -c "import json,glob;p=glob.glob('/tmp/restore-test/var/backups/staging.*/unity-brain/brain-weights.json')[0];d=json.load(open(p));c=d.get('cortex') or {};print('parses OK, passedCells=%d grades=%s' % (len(c.get('passedCells') or []), (c.get('grades') or {}).get('ela')))"

sudo rm -rf /tmp/restore-test      # clean up (it restores ~10 GB of Forgejo too)
```

**This was actually run on 2026-08-26 and it works** — the restore returned
`brain-weights{,-v0}.{json,bin}` + `identity-core.json`, the JSON parsed, and the
contents matched the live brain's then-current state (`passedCells=0`,
`grades.ela=pre-K`). Note `--include` filters *paths within* the snapshot, so the
restore still walks the whole snapshot and writes ~10 GB — do it somewhere with
room, and clean up after.

⚠ A restored weight file only loads if its `WEIGHTS_FORMAT_VERSION` matches the
running code. That is exactly why the 2026-07-08 on-box backup was useless after
the 2026-08-16 12M geometry hop — it predated the format bump. So a snapshot from
before a geometry change is **not** a restore point; after any deliberate
geometry/format change, take a fresh backup and consider the older ones expired.
