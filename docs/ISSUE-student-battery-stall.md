# ISSUE — Student-battery stall blocks the K→PhD walk at cell 1

> **Filed:** 2026-06-21 (Gee: *"make a write up of this issue before sponge make s the GPUcompute applicion.. so"*)
> **Severity:** ⛔ BLOCKER — the live deployed walk cannot leave kindergarten.
> **Surfaced on:** the live pre-alpha deploy (`https://if-only-i-had-a-brain.git.unityailab.com`), 51,130,559-neuron donor-fit brain, consolidation live.
> **Read before building the GPU-compute donor app** — the distributed donor path makes the root cause STRICTLY WORSE (see §5).

---

## 1. Symptom

The deployed brain is parked on the **first cell of the walk** — `ela/kindergarten` — and never advances.

- `cellsPassed: 0` on every subject (math/science/social/art never even started — `grade: null`, `teachEvents: 0`).
- `cellElapsedMs` ≈ **113 minutes** on that one cell and still climbing.
- No `✓ PASSED`, no `⤴ FORCE-ADVANCE` — the cell never reaches its gate.

She is **running, not idle** — but she is **stuck, not thinking productively**.

---

## 2. Evidence (live, off the public `/ws` lane)

Two state snapshots 18.2s apart, plus a third confirmation poll:

| Field | Snap A | Snap B (+18.2s) | 3rd poll (+~3min) |
|---|---|---|---|
| `activePhase.name` | `_runStudentBattery` | `_runStudentBattery` | `_runStudentBattery` |
| `activePhase.elapsedMs` | 918,244 | 936,487 | 1,102,574 |
| `cellElapsedMs` | 6,630,552 | 6,648,795 | 6,814,882 |
| `cellSubPhases` | 460,436 | **460,436** | — |
| `perSubject.ela.teachEvents` | 460,436 | **460,436** | 460,436 |
| `perSubject.ela.cellsPassed` | 0 | 0 | 0 |
| `eventLoopLagMs` | 11 | 11 | — |

**Interpretation:**
- `phaseElapsedMs` and `cellElapsedMs` increase by **exactly the wall-clock delta** — nothing else moves. The phase is a pure timer at this point.
- `teachEvents` / `cellSubPhases` are **frozen**. (On its own this is expected — a battery *tests*, it doesn't teach — but combined with an 18+ minute phase duration it confirms zero forward progress.)
- **`eventLoopLagMs` is healthy at 11ms** → this is **NOT** a CPU/event-loop block (not the old #35 consolidation hang). It is an **async stall**: the code is `await`-ing inside the battery and the awaited work is either glacially slow or never resolving.

---

## 3. Root cause

`js/brain/curriculum.js` — `_runStudentBattery(questions, label)` (line ~3917):

1. It runs **every question sequentially**:
   ```js
   for (const q of questions) {
     const r = await this._studentTestProbe({
       question: q.question,
       expectedAnswer: q.expectedAnswer,
       expectedVariants: q.expectedVariants || [q.expectedAnswer],
       maxTicks: q.maxTicks || 60,          // ← up to 60 cortex ticks PER question
       methodology: q.methodology || null,
     });
     ...
   }
   ```
2. There is a `const _batteryStart = Date.now()` at the top (line ~3920) but **nothing in the loop ever checks it** — there is **no battery-level wall-clock deadline** that breaks the loop.
3. `_studentTestProbe` (line ~4512) runs an emission probe with `maxTicks = 60` (default) and has **no per-question hard timeout** (no `Promise.race` against a wall-clock sentinel around the emission await).

So the battery's total wall-clock is:

```
battery_time  ≈  N_questions  ×  ~60 ticks/question  ×  per_tick_latency
```

with **no upper bound**. At biological scale (51M neurons) `per_tick_latency` is large because each emission tick is a GPU dispatch + spike readback. Multiply by 60 ticks × dozens-to-hundreds of questions and one cell's battery is tens of minutes to **indefinite**.

Two concrete failure shapes, both consistent with the evidence:
- **(a) Catastrophically slow grind** — the battery IS advancing question-by-question, but at WS-roundtrip-per-tick speed it would take hours per cell. Across 6 subjects × 19 grades, the walk never finishes.
- **(b) Hard hang on one probe** — a single emission await is blocked on a GPU readback/ACK that never returns (donor dropped mid-probe, or a readback timeout that isn't wired at this call site). Frozen counters + calm event loop + a phase timer that only counts wall-clock is the exact signature of an unresolved Promise.

This is the **T30 failure family** resurfacing at deploy scale (historically: a readiness/student probe running ~100× its intended budget = 23–116 min of silent grinding). The earlier T30 fix capped `maxTicks` per probe; it did **not** add a battery-level deadline or a per-question wall-clock timeout, which is what bites here.

---

## 4. Why the cell never gates

`cellsPassed` only increments after the battery returns and the aggregate gate (`#112.5`, 0.80 DIBELS-8 floor) is evaluated. Because the battery never returns, the gate never runs, `cellsPassed` stays 0, and the curriculum walk's outer loop never advances to the next cell. One stalled battery = the entire K→PhD walk wedged at cell 1.

---

## 5. ⚠ Why this matters BEFORE the GPU-compute donor app

The distributed donor-compute app (DF.7 data-parallel replicas) moves emission ticks **off the local GPU and onto remote browser donors over WebSocket**. That makes `per_tick_latency` **strictly worse** — a network roundtrip (+ donor jitter, + possible mid-probe disconnect) on every one of the 60 ticks per question.

If the battery has no time budget today on a same-box GPU, it will be **dramatically more broken** once each tick is a remote donor roundtrip. The probe/battery timeout architecture must be designed **with the donor path in mind**, not retrofitted after. Specifically the donor app needs to assume:
- any single emission probe can stall (donor drop mid-tick) → must be abortable with a timeout, never an unbounded await;
- per-tick latency is variable and network-bound → batteries need a wall-clock budget, not just a tick-count cap;
- a stalled probe must degrade to a scored-zero / skipped question, not wedge the whole walk.

---

## 6. Recommended fix surface (NOT yet implemented — pending Gee's go)

All in `js/brain/curriculum.js` unless noted:

1. **Per-question hard timeout** in `_studentTestProbe` — wrap the emission await in `Promise.race([emit, timeoutSentinel])`. On timeout: abort the probe (AbortSignal threaded into the emission loop), score it 0/budget-exhausted, log it, move on. (Mirror the per-word `Promise.race` pattern already shipped in `_teachWordDefinitions` per #er.)
2. **Battery-level wall-clock deadline** in `_runStudentBattery` — actually consume `_batteryStart`: if `Date.now() - _batteryStart > BATTERY_MAX_MS`, stop sampling further questions, score the remainder as not-attempted, and return what we have so the gate can still evaluate. Env-tunable (`DREAM_BATTERY_MAX_MS`).
3. **Per-tick latency budget on the donor path** — emission ticks that are remote GPU dispatches need a readback timeout per tick (the `readback_*` timeout pattern from the T18.19 family) so one slow/dead donor can't freeze a tick indefinitely.
4. **Surface battery progress to the dashboard** — add a per-question index (`batteryQ: i/N`) to the curriculum status broadcast so "stuck vs grinding" is visible at a glance instead of inferred from a frozen `teachEvents` counter. (Today there is no per-question progress field in the `/ws` state — this whole diagnosis had to be inferred from phase-duration vs wall-clock.)

**Suggested ordering:** 1 + 2 are the actual unblock (bounded battery → cell gates → walk advances). 3 is the donor-app prerequisite. 4 is observability so we never have to diff two polls by hand again.

---

## 7. Immediate operational options (no code change)

- **Confirm-and-wait:** if failure shape (a), the battery WILL eventually return — but at hours per cell it's not a viable walk. Not recommended.
- **Force-advance:** the `⤴ FORCE-ADVANCE` floor (0.2) exists precisely so a non-gating cell still advances — but it only fires *after* the battery returns, which it isn't doing. So force-advance can't rescue a hung battery without the timeout from §6.2.
- **Reduce battery size / maxTicks via env** if such knobs exist for the deployed unit (none confirmed wired today) — a stopgap, not a fix.

Bottom line: **the §6.1 + §6.2 timeouts are the real unblock**, and they need to land before the donor-compute app is built on top of the same probe path.
