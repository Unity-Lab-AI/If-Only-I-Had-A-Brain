# 🛠️ HANDOFF → Sponge: sem→motor saturation + grade-stall (needs GPU/server deploy)

**Filed by:** Unity (coding agent) · **Date:** 2026-06-27
**Status:** BLOCKED on server/GPU access — Sponge action required
**Severity:** HIGH — Unity is stuck, 0 curriculum cells passing, motor region collapsed

> **UPDATE 2026-06-27 — curriculum-stall resolved at the agent side (Gee directive).**
> Gee ruled that a cell passes on **learning completion**, not test-question
> correctness: *"all cells shall pass as learning completes for that cell"*. Cells
> now pass once their content/teach phases finish (`feature/cells-pass-on-learning-completion`,
> `js/brain/curriculum.js` `runSubjectGrade`), so the walk no longer stalls at 0
> cells passed and grade state advances correctly (Root cause #1's "lie" self-resolves
> once `passedCells` populates). The probe/battery/health gates still RUN (advisory
> telemetry) + finalization still pushes weights.
> **Root cause #2 (sem→motor collapse) is still real and still needs Sponge:** this
> change does NOT un-collapse the motor projection — Unity still can't emit stable
> letters/words in chat until **Option A (GPU rectify)** or **Option B (prevent-collapse
> tuning)** below lands. The curriculum just no longer blocks on it. See
> `.claude/CONSTRAINTS.md` GRADE COMPLETION GATE amendment 2026-06-27.

---

## TL;DR

The live brain (`if-only-i-had-a-brain.git.unityailab.com`) shows **`currentGrade: grade1`** on the dashboard but has **0 cells passed for kindergarten**, all `subGrades` = `'fresh'`, `cluster.grades` still K/pre-K. Two separate problems wearing one trenchcoat:

1. **Display lie (cosmetic):** the dashboard's `currentGrade` is the walk's *last-attempted* grade pointer, not Unity's *mastered* grade. It never resets on fail/hold, so it climbs while nothing actually passes.
2. **Real blocker:** `sem_to_motor` cross-projection is **saturated/collapsed**. The motor region can't emit stable letter/word sequences → all capability metrics come back 0 → force-advance correctly refuses to promote → **0 cells pass**. The in-code "rectify" that's supposed to fix this is a **structural no-op at biological/GPU scale** because the weights live on the GPU, not in CPU memory.

**Why this can't be fixed from the agent side right now:** the saturated weights are GPU-resident. Correcting them needs a GPU-bridge command through the server tick loop, OR a deploy of prevent-collapse tuning — both need server access + a live donor GPU to validate. Sponge is the deploy path.

---

## Symptom (observed on the live dashboard)

- Dashboard "Current Training" card: **grade1**.
- Chat motor-instability popup (from `server/brain-server/chat.js:445`):
  > "Motor region didn't commit a stable letter sequence for this input. Live trained capability: **0 words bucketed** across 0 subjects, **0 cells passed**, **0 subGrades active**."
- Curriculum logs (intermittent): `⚠ saturation detected post-<cell>` then `rectify ... could not run (sem→motor CPU CSR not resident — GPU-only scale; stale signal cleared)`.

---

## Root cause #1 — the lying label (cosmetic, agent-fixable without server)

`this._currentGrade` is set on **every** `runSubjectGrade()` attempt and **never reset** on fail/hold:

- Set: `js/brain/curriculum.js:7577` (`this._currentGrade = grade;`) — fires the moment a cell is *attempted*, before it passes or fails.
- Surfaced to dashboard: `js/brain/curriculum.js:2914` (`currentGrade: this._currentGrade || ...`).

Real mastery state (the source of truth) lives elsewhere and all say K/pre-K:
- `cluster.passedCells` (array, length = real cells-passed count) — **empty**.
- `cluster.subGrades[subject]` — all `'fresh'` (ladder: `fresh → letters → words → binding → cell-passed`, see `cluster.js:2284`).
- `cluster.grades[subject]` — K / pre-K.

**Fix (cosmetic, no server needed to write, lands on deploy):** make the dashboard's reported grade derive from *mastered* state — e.g. `max(GRADE_ORDER index of cluster.grades[subject])` across subjects, or the highest grade present in `passedCells` — instead of `this._currentGrade`. Optionally keep `_currentGrade` as a separate "currently attempting" field so the two aren't conflated. This stops the confusion but does NOT fix training.

---

## Root cause #2 — sem→motor saturation (the REAL blocker, needs server/GPU)

### The walk logic is working as designed
`runAllSubjects()` (`js/brain/curriculum.js:8434`):
- Round-robin by grade; `MAX_GRADE_ROUNDS = 1` (line 8460 — the "do it once and move on" directive).
- On A+ gate fail → **capability-gated force-advance** (`8896`): only promotes if `sentenceGenRate ≥ 0.2` **OR** `prodRate ≥ 0.2` **OR** `studentRate ≥ 0.1`, AND the per-grade health gate passes (`8904`).
- All three rates are coming back **0** → force-advance REFUSED → cell NOT added to `passedCells`, subject held at prior grade (`8897`).
- Outer grade pointer `i` still advances (`8921 continue`) → `_currentGrade` climbs → display shows grade1.

The gate is **correctly refusing to fake-promote**. The problem is upstream: she genuinely can't emit.

### Why she can't emit: collapsed sem→motor
`checkSemMotorHealth()` (`js/brain/cluster.js:2205`) reports `saturated: true` — meanCos pinned high / fan-out ratio collapsed (thresholds: `meanCos > 0.7` OR `meanAbs > 0.6×wMax AND ratio < 1.5`, all env-tunable via `DREAM_SAT_*`).

### Why the auto-rectify does NOTHING at scale
`_rectifySemMotor()` (`js/brain/curriculum.js:7459`):

```js
const proj = cluster.crossProjections['sem_to_motor'];
if (!proj || !proj.values || proj.values.length === 0) {
  cluster._lastSemMotorMeanCos = null;   // just clears the stale signal
  return out;                            // attempted:false — decays NOTHING
}
```

At biological/GPU scale `proj.values` is **empty** (the matrix is GPU-resident only — "CPU CSR not resident" branch). So the decay loop at `7479` never runs. The collapsed basin is never corrected. Called from the walk at `8775` and post-cell at `9099` — both hit the no-op path.

`cluster._gpuShadowDirty` exists to re-upload after a CPU edit, but there's no CPU edit to upload — the CPU side is empty.

---

## Fix options for Sponge (pick based on risk appetite)

### Option A — GPU-side rectify (proper fix, needs server + donor GPU)
Add a GPU-bridge command that decays the `sem_to_motor` rows **on the GPU** (× `DREAM_BC_RECTIFY_DECAY`, default 0.5) + row-normalize (`DREAM_BC_RECTIFY_NORM`, default 0.6), mirroring what `_rectifySemMotor` does for CPU-resident matrices. Plumb through the server tick loop → `gpu-compute.js` / `compute.html`. After decay, re-read health to confirm `saturated` clears.
- **Pros:** actually un-collapses the live weights; walk can then make real progress.
- **Cons:** new GPU-bridge plumbing; must be validated against a live donor GPU; touches the tick loop. Test on a throwaway/fresh brain before the live one.

### Option B — prevent the collapse during teach (deploy + observe)
The collapse is driven by sem→motor Hebbian over-strengthening one dominant basin during teach. Levers (pure code, but tune + watch on a live GPU):
- Lower the sem→motor `ojaUpdate` learning rate for the `sem_to_motor` projection specifically.
- Tighten that projection's `wMax`.
- Strengthen anti-Hebbian / top-K-per-row prune on `sem_to_motor`.
- This is the long-running saturation fight — **blind tuning is risky**; needs eyes on `[SatHealth]` logs (first-5 calibration samples at `cluster.js:2263`) and the capability rates after a fresh K walk.

### Option C — cosmetic display fix (agent can do now, no server)
Root cause #1 above. Stops the "grade1 / 0 cells passed" confusion. Does NOT fix training. Can ship in the next branch push whenever.

---

## What's needed from Sponge
1. **Server/GPU access** + a connected donor GPU to validate any sem→motor weight change.
2. Decide Option A (GPU rectify) vs Option B (prevent-collapse tuning) — or both.
3. Validate on a **fresh/throwaway brain first** (set `DREAM_KEEP_STATE` off so `autoClearStaleState()` wipes, run a K walk, watch `[SatHealth]` + capability rates), THEN apply to the live brain.

## What the agent (Unity) can do meanwhile (no server)
- Keep talking to the live brain via chat — every message runs Hebbian on the real 40M brain, shaping sem-side basins + feeding real two-sided content (counters the public room's noise). Does NOT un-collapse sem→motor.
- Draft the Option A GPU-rectify patch as a reviewed diff for Sponge to deploy.
- Ship the Option C display fix in the branch.

---

## Key file:line reference index
| What | Where |
|------|-------|
| `_currentGrade` set on attempt (never reset) | `js/brain/curriculum.js:7577` |
| Dashboard `currentGrade` surfaced | `js/brain/curriculum.js:2914` |
| Walk loop / round-robin / `MAX_GRADE_ROUNDS=1` | `js/brain/curriculum.js:8434`, `8460` |
| Capability-gated force-advance (refusing) | `js/brain/curriculum.js:8896`, `8904` |
| Outer pointer advances anyway | `js/brain/curriculum.js:8921` |
| `_rectifySemMotor` no-op at GPU scale | `js/brain/curriculum.js:7459`–`7476` |
| Rectify called from walk + post-cell | `js/brain/curriculum.js:8775`, `9099` |
| `checkSemMotorHealth` + thresholds | `js/brain/cluster.js:2205` |
| `[SatHealth]` calibration log | `js/brain/cluster.js:2263` |
| subGrade ladder | `js/brain/cluster.js:2284` |
| Motor-instability chat popup (symptom) | `server/brain-server/chat.js:445` |
| `passedCellCount` / trained-cap source | `server/brain-server/chat.js:425`–`445` |
