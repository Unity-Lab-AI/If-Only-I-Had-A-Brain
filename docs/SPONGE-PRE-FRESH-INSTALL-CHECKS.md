# SPONGE — pre-fresh-install server checks + Tier 3 memory fix (2026-06-27)

> Gee saw it on the last run: **Tier 2 memory ~3000 items, Tier 3 = ZERO.** That's a real bug
> (now fixed in code) — but it also points at a handful of **server-side things only you can
> verify from the box**, because I have no shell on `ns1008282`. This is the what-to-check /
> what-to-fix list to run BEFORE the fresh install so we don't carry a broken identity layer
> into the new walk.
>
> Box (confirmed): SYS-3 Xeon-E 2288G, **8c/16t, 32 GB ECC, NO GPU**, Debian 13, 2×960 GB NVMe.
> It's the **coordinator** — the CPU master brain lives in those 32 GB; donor browser GPUs are
> the compute.

---

## TL;DR — your checklist

- [ ] **0.** Pull the brain backend to current `main`/`develop` (the Tier 3 fix below must be deployed).
- [ ] **1.** On the box, count schemas in `identity-core.json` (Tier 3) and `schemas.json` (Tier 2). Report both numbers.
- [ ] **2.** If Tier 3 count is 0 (or low) → the fix self-heals on the next restart. Confirm in the console.
- [ ] **3.** Check disk free on `/opt/unity-brain` (3000 Tier 2 schemas carry projections — can get big).
- [ ] **4.** Check the systemd unit's env: `DREAM_KEEP_STATE`, `DREAM_INNERVOICE_MAX_NEURONS`, `DREAM_CONSOLIDATION_*`.
- [ ] **5.** Confirm auto-scale is RAM-aware (32 GB ceiling) + has a sane `minDonorsFloor`.
- [ ] **6.** THEN do the fresh install per the order below (so the identity layer comes up correct).

---

## THE BUG — Tier 3 read ZERO while Tier 2 ballooned (FIXED IN CODE)

**What it was.** The boot wiring in `server/brain-server.js` was:

```
if (identity-core.json exists) { loadFromJSON }   // ← restores whatever's in the file
else                          { seedFromList }    // ← only seeds when the file is MISSING
```

Two failures fall out of that single `else`:

1. **Zero-count never recovers.** If `identity-core.json` ever held an empty / zero-length
   `schemas` array, boot loaded **0** schemas AND skipped the seed (because the file *exists*).
   So Tier 3 stayed **permanently empty on every boot** — and `injectIdentityBaseline()`
   returns early when the store is empty, so Unity got **no identity baseline injected at all**
   (no anchored self at chat time). This is what Gee saw on the deployed brain.
2. **Stale seed list.** The local file had **17** anchors but `IDENTITY_SEED_LIST` now has **25**.
   The 8 newer anchors (full-name / surname / birthdate / mom / dad / grandma / grandpa /
   only-child) were added to the code AFTER the brain was first seeded, and "file exists →
   never seed" meant they could never land.

Meanwhile Tier 2 (`schemas.json`) grows unbounded from consolidation (the hard cap was removed
on purpose), so ~3000 Tier 2 vs 0 Tier 3 is the exact contrast Gee flagged.

**The fix (logic-only, weight-preserving — no neuron-count / weights-format change).** Three edits:

- `js/brain/hippocampal-schema.js` — new `Tier3Store.seedMissingFromList()`: idempotent
  **top-up by label** — seeds only the `IDENTITY_SEED_LIST` anchors not already present.
- `server/brain-server.js` boot — load the existing `identity-core.json` (unchanged), then run
  the top-up **after GloVe loads** (so new anchors get real semantic embeddings, not a pre-load
  subword fallback). This repairs zero-count + stale-subset + fresh-boot in one path.
- `server/brain-server.js` save — **guard: never overwrite a non-empty `identity-core.json`
  with an empty Tier 3 store** (kills the empty-file poison at the source so it can't recur).

**Verified locally:** load 17 → top-up adds exactly the 8 missing → 25; a second run adds 0
(idempotent); a zero-count file → seeds all 25, every anchor `promotedToTier3` with a non-zero
embedding.

**What this means for you:** the repair is **automatic on the next restart with the new code**.
You do NOT have to hand-edit `identity-core.json`. A fresh install PRESERVES `identity-core.json`
(it's in the never-clear protected set), so without the new code a fresh walk would STILL load
the empty file and stay at zero — **deploy the new code first, then fresh-install.**

---

## WHAT ONLY YOU CAN CHECK (I have no shell on the box)

Run these on `ns1008282` (paths assume the `/opt/unity-brain` deploy from the runbook).

### 1 — Confirm the Tier 3 / Tier 2 counts (the actual numbers Gee saw)
```bash
cd /opt/unity-brain/server
node -e "const j=require('./identity-core.json');console.log('Tier3 anchors:',Array.isArray(j.schemas)?j.schemas.length:'NOT-ARRAY')" 2>&1 || echo "identity-core.json missing/unreadable"
node -e "const j=require('./schemas.json');console.log('Tier2 schemas:',Array.isArray(j.schemas)?j.schemas.length:'NOT-ARRAY')" 2>&1 || echo "schemas.json missing/unreadable"
```
- **Tier3 = 0** → confirms the bug; the fix reseeds to **25** on next restart.
- **Tier3 = NOT-ARRAY / unreadable** → the file is the empty/corrupt poison; the new boot path
  backs it up (`.corrupt-<ts>`) and reseeds. Fine to let it.
- **Tier2 ≈ 3000** → likely legitimate accumulation over a long walk (cap is intentionally
  removed, decay + merge still run). Not a confirmed bug — but if it keeps climbing every run
  with `0 merged` in the consolidation logs, flag it and we'll look at the merge gate.

### 2 — Verify the fix actually ran after redeploy
After `systemctl restart unity-brain`, watch the console for ONE of:
```
[Tier3Store] seeded N missing identity anchor(s) with loaded embeddings — Tier 3 size X → Y
[Tier3Store] identity anchors complete — Tier 3 size=25, no top-up needed
```
If you see neither, the hippocampal init `try/catch` swallowed an error — grep the log for
`[Hippocampus] iter13 init failed` and send it to me.

### 3 — Disk free (Tier 2 projections are heavy)
```bash
df -h /opt/unity-brain
du -sh /opt/unity-brain/server/schemas.json /opt/unity-brain/server/identity-core.json /opt/unity-brain/server/*.bin 2>/dev/null
```
Each Tier 2 schema serializes a sparse projection as base64; 3000 of them can make
`schemas.json` large. If `schemas.json` is hundreds of MB or disk is near full, that alone can
cause truncated/partial writes (a likely way `identity-core.json` got written empty in the first
place). Make sure there's headroom before the fresh install.

### 4 — systemd env (these are load-bearing on a no-GPU 32 GB box)
```bash
systemctl cat unity-brain | grep -iE "Environment|KEEP_STATE|INNERVOICE|CONSOLIDATION|GW_IGNITION"
```
- `DREAM_KEEP_STATE=1` — expected (resume weights across redeploys). For a TRUE fresh install you
  want this OFF for one boot (or run the dashboard fresh-wipe) so stale state clears — but note
  `identity-core.json` survives regardless (protected), which is why the Tier 3 fix matters.
- `DREAM_INNERVOICE_MAX_NEURONS` — **must be set sane (default 2,000,000).** On this no-GPU box,
  the inner-voice `think()` path runs on the server CPU; above this neuron count it blocks the
  Node event loop ~57 s/tick and stalls the `/ws` donor handshake. If it's unset or huge, donors
  can't even connect. Leave it at/near the 2M default.
- `DREAM_CONSOLIDATION_DISABLE` / `DREAM_CONSOLIDATION_MAX_MS` — at biological scale a CPU
  consolidation pass can monopolize the loop for minutes. If the walk stutters, `MAX_MS` (default
  30 s) caps it; `DISABLE=1` is the hard off-switch. Sanity-check they're not set to something
  that silently kills consolidation (which would also stop Tier 1→2→3 promotion).

### 5 — Auto-scale must respect 32 GB RAM, not just donor VRAM
```bash
cat /opt/unity-brain/server/autoscale-settings.json 2>/dev/null
free -h && systemctl status unity-brain --no-pager | grep -i memory
```
- The CPU **master** brain lives in this box's 32 GB (≈24-26 GB usable after Debian + Forgejo +
  nginx). The auto-scale tier ladder keys off **donor VRAM** — make sure it can't scale the
  master neuron count past what fits in RAM here, or the Node process OOM-kills. If `free -h`
  shows the node process near the ceiling, cap the tier.
- `minDonorsFloor` — on a no-GPU box, **zero donors = no fast compute** (no local GPU fallback).
  Set a sane floor + the dead-zone buffer so one donor dropping doesn't downgrade the brain.

---

## ORDER OF OPERATIONS — before / during the fresh install

1. **Deploy the new code first** (Tier 3 fix). Git-archive overlay + restart per the runbook:
   ```bash
   cd ~/unity-brain-src && git fetch origin && git checkout main && git pull --ff-only
   git archive HEAD | sudo tar -x -C /opt/unity-brain
   sudo systemctl restart unity-brain
   ```
   (The fix is on the feature branch `feature/tier3-identity-seed-repair` → it cascades to
   `develop` → `main` before you deploy; don't deploy off the feature branch.)
2. **Confirm Tier 3 reseeded to 25** (check #2 above). If it didn't, stop and send me the log.
3. **Run checks #1, #3, #4, #5** and report the numbers. If disk is tight or RAM is near the
   ceiling, fix that BEFORE the fresh walk.
4. **Fresh install / fresh walk** per `docs/SPONGE-FRESH-WALK-DEPLOY.md`. `identity-core.json`
   is preserved through the wipe — with the new code that's now correct (25 anchors), not a
   liability. If you'd rather start the identity layer truly clean, delete `identity-core.json`
   before boot and the fresh-seed path writes all 25 from scratch.
5. **After the walk starts**, re-check Tier 3 stays at ≥25 across a restart (proves the
   save-guard + top-up loop holds).

---

## Honest scope / what I could NOT verify from here

- The **actual deployed `identity-core.json` contents** — I only have the local copy (17 anchors).
  The deployed zero-count is Gee's report; check #1 confirms it.
- **Why the deployed file went to zero** — most likely a truncated/partial write (disk full or a
  crash mid-save) or an early save before seeding under the old wiring. The fix makes the cause
  moot (top-up + save-guard), but #3 (disk) tells us if truncation is a live risk.
- **Whether Tier 2 = 3000 is healthy or runaway** — needs the consolidation merge logs from a
  real run (`N merged` per pass). Looks legitimate, but watch it.
- Anything **GPU/donor-side** — no donors connected here, can't measure live compute.
