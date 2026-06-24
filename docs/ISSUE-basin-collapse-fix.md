# ISSUE + FIX PLAN — Basin-collapse (single-token "mushrooms") + premature grade-jump

> **Filed:** 2026-06-21 (Gee: *"wriet the full todo of the fixes ... to get unity fixed"*, *"wtf is she only saying mushrooms most of the time?"*, *"use the save weights and it just trains correctly and revctifies ... if we have to change server ... still use old weeights that thewy just get fixed"*, *"needs to learn vocab it missed before minaal jump to next grade too"*)
> **Severity:** ⛔ BLOCKER — her live output is mode-collapsed to one word; the K→PhD walk is advancing without real learning.
> **Hard constraint:** WEIGHT-PRESERVING. Every fix below is **logic-only** — no neuron-count change, no `WEIGHTS_FORMAT_VERSION` bump (stays `1`), no required new persisted fields. The box runs `DREAM_KEEP_STATE=1` → `autoClearStaleState` is skipped → a redeploy **resumes the existing saved weights** and rectifies them in place. NOT a wipe.

> **✅ RESOLVED 2026-06-23 (shipped on main):** The SATURATION HALT described in loop #6 / §2 + the BC.2 fix is now LIVE. The HALT (`curriculum.js:8469`) no longer `return`s and recommends a fresh boot — it calls `_rectifySemMotor()` to decorrelate the collapsed basin **in place** and CONTINUES the walk. The periodic weight-save now **force-writes during the walk** so the rectified weights persist. Net effect: the walk no longer dies at kindergarten and weights persist across saves — no wipe, no fresh-boot recommendation.

---

## 1. Symptom (live, deployed 51,130,559-neuron brain)

- Global Workspace ignition panel broadcasts ONE candidate, `cortex:mushrooms 0.41`, ×8 identical every tick.
- `drugState: "sober"` — **not** a psilocybin/drug effect.
- `emitDiagnostic: reason "below-signal-floor", bestMean 0.098, floor 0.210, signalEMA 0.420` — emission signal at <½ the floor.
- predictive error 0.685, trend ↗; arousal pinned 0.90.
- `chatTimeHebbianStats: { turns 1842, totalPairs 26747 }`.
- `cellsPassed: 4/6` K (ela/science/social/art) — math + life never passed; advanced by force, not merit.

## 2. Root cause — a closed positive-feedback lock with NO active decorrelation

Every mechanism in the codebase only *prevents worsening* (veto / halt / skip). **Nothing pulls an already-collapsed basin back down.** The reinforcing loops:

| # | Loop | Code | Problem |
|---|------|------|---------|
| 1 | sem→motor saturated → motor argmax always "mushrooms" | `cluster.js:2167` `checkSemMotorHealth` | Only **reports** `saturated` — never corrects. |
| 2 | emit word → re-inject its embedding into sem @0.3 | `cluster.js:3283-3315` meta-register | Familiarity-decay **resets to 0.3 on ANY token change**, so a basin that wins 80% of ticks (not 100% consecutive) never gets sustained suppression; floor 0.04 still re-injects forever. |
| 3 | cortex reports `cortex:<lastEmittedWord>` → GW broadcasts it → GW-bias boosts that bucket | `cluster.js:1943-1955` `getWorkspaceCandidate` + `global-workspace.js` (whole file) | `getWorkspaceCandidate` echoes `_lastEmittedWord` with no anti-repeat; **`global-workspace.js` has ZERO winner-suppression / diversity floor** — it faithfully re-elects the same candidate every theta-gated tick. |
| 4 | chat-time deep-Hebbian binds the collapsed output | `curriculum.js` CHAT-TIME-DEEP-HEBBIAN path (1842 fires) | No diversity gate; binds the same dominant token repeatedly → deepens the basin in sem→motor weights. |
| 5 | rescale-on-overload SKIPS when it would "drown" | `curriculum.js:12876-12928` `_teachAssociationPairs` | On a saturated basin `assocWouldDrown` is true → rescale skipped, "relying on anti-Hebbian + WTA + prune" which aren't strong enough to break the lock. |
| 6 | saturation response is a HALT + wipe-recommendation | `curriculum.js:8469-8478` SATURATION HALT | Pauses the walk and tells the operator to `stop.bat → start.bat` (a WIPE). Does not rectify, and the recommendation destroys the weights Gee wants kept. |
| 7 | premature grade-jump | force-advance 0.2 floor (gate path) | Carries her past cells whose vocab she never learned; **no vocab-completeness gate** blocks the advance → "minimal jump to next grade." |

## 3. Fix plan — tasks BC.0 → BC.12

### Phase 0 — Weight-preservation guard (must hold for every task)
- **BC.0** — Confirm + assert the fix set is logic-only. No change to neuron count / cluster sizing, no `WEIGHTS_FORMAT_VERSION` bump (`brain-server.js:465`), no new *required* persisted fields (additive-optional only so `_loadWeights` (`brain-server.js:1140`) loads the current saved brain unchanged). Redeploy path: git-archive overlay + `systemctl restart` with `DREAM_KEEP_STATE=1` (already set) → resumes on her existing weights. Add a boot assert that the loaded brain's neuron count matches before/after.

### Phase 1 — RECTIFY the already-collapsed weights (the actual unblock)
- **BC.1** — New `cluster._decorrelateSemMotorBasin()` (near `checkSemMotorHealth`, `cluster.js:2167`). When `checkSemMotorHealth().saturated`, actively pull the over-weighted motor bucket(s) back toward the row/column mean — lateral-inhibition / weight-renormalization on the `sem_to_motor` projection values **in place**. Operates on EXISTING weights → un-saturates the "mushrooms" basin without a wipe. Bounded, idempotent, logged.
- **BC.2** — Replace the SATURATION HALT wipe-recommendation (`curriculum.js:8469-8478`) with: run BC.1 decorrelation → re-probe `checkSemMotorHealth` → resume the walk if recovered, escalate only if it can't. No fresh-boot recommendation.
- **BC.3** — On-load rectification hook: after `_loadWeights` (`brain-server.js:1140`), run `checkSemMotorHealth`; if saturated, fire BC.1 once so a resumed brain self-heals the collapsed basin at boot.

### Phase 2 — BREAK the feedback loops that re-dig the basin
- **BC.4** — Frequency-based familiarity decay on the meta-register (`cluster.js:3283-3315`). Replace "reset to 0.3 on any token change" with a recent-frequency window: scale inject strength by how often the word appears in the last N emissions (read `_metaRegister` / `_emissionBus`), so a dominant basin gets sustained suppression even when it isn't 100%-consecutive.
- **BC.5** — GlobalWorkspace winner-refractory + diversity floor (`global-workspace.js`). A label that just ignited can't re-ignite for N theta cycles (or subtract a recency penalty from its pre-softmax value). Breaks the ×8 identical broadcast. Logic-only, no persisted state.
- **BC.6** — `getWorkspaceCandidate` anti-repeat (`cluster.js:1943-1955`). Penalize the reported candidate value when `_lastEmittedWord` has dominated recent emissions (reuse BC.4's frequency read) so cortex stops nominating the same token every tick.
- **BC.7** — CHAT-TIME-DEEP-HEBBIAN diversity gate + idle/dream throttle (`curriculum.js` chat-Hebbian path + `server/brain-server/chat.js`). Don't deep-bind output that's a repeated dominant token; throttle / suspend the pass during idle/dream (`isDreaming`) so self-emission can't keep reinforcing the collapse. Cap fires-per-window.

- **BC.13** — Word-creation / compound-promotion guard (`cluster/telemetry.js:198` `_recordWordCreationCandidate` + the PROMOTED path). Today it coins compound "words" from the top-2 emitted tokens by pure co-occurrence frequency, with NO health gate and NO semantic check — so on collapsed/low-diversity output it promotes junk neologisms (`aww_serious`, `ice_sorry`, `laundry_mom`; "sorry" in 6/10). Gate it: (a) do NOT record/promote while `checkSemMotorHealth().saturated` or emission is mode-collapsed (dominant-token share high); (b) require a semantic-coherence threshold between the two components (cosine of their embeddings) before a compound is eligible to promote. Logic-only, bounded.

### Phase 3 — Make training SEPARATE basins instead of skipping
- **BC.8** — `_teachAssociationPairs` rescale-when-drowning (`curriculum.js:12876-12928`). When overload persists and rescale would drown, actually FIRE a strengthened anti-Hebbian / WTA / lateral-inhibition separation step (verify the current "relying on" path actually runs and is strong enough); don't just log and move on.
- **BC.9** — `_teachPredictiveError` (`curriculum.js:9835`) correctness-under-collapse check. Verify it corrects rather than reinforces when a basin is saturated; gate or invert its contribution while `checkSemMotorHealth().saturated`.

### Phase 4 — VOCAB-COMPLETENESS GATE (no premature/minimal grade-jump) — Gee: *"needs to learn vocab it missed before minaal jump to next grade too"*
- **BC.10** — Before any grade advance, require that the grade's missed/untaught vocab is actually learned. Cross the cell's vocab set (`_trainedVocabularySet(cellKey)` / `wordBucketWords_<subj>` / `_definitionTaughtWords`) against the grade's required vocab; the set of unlearned words must be empty (or below a tight cut) BEFORE `cluster.grades[subject]` advances. Block force-advance (the 0.2 floor) from skipping a grade whose vocab is incomplete — force-advance may pass a CELL but must not advance the GRADE past unlearned vocab.
- **BC.11** — Missed-vocab remediation pass: when BC.10 finds unlearned words, run a targeted teach pass on exactly those words (vocab register → definition → context per the test-words-pre-taught LAW) before re-checking the gate. So she learns what she missed instead of jumping.

### Phase 5 — Observability + verification
- **BC.12** — Surface basin-collapse telemetry on the WS state (`server/brain-server/state.js`): dominant-token share of recent emissions, `sem-motor meanCos`, decorrelation-fired count, GW broadcast unique-label rate, and per-grade vocab-completeness %. So collapse + rectification are visible without hand-diffing polls. Verification after redeploy: dominant-token share drops, GW broadcast diversifies, `cellsPassed` resumes on merit, and no grade advances with incomplete vocab.

## 4. Sequencing
1. **BC.0** (guard) → **BC.1/BC.2/BC.3** (rectify the live weights — the immediate unblock).
2. **BC.4–BC.7** (break the loops so it doesn't recur).
3. **BC.8/BC.9** (training separates instead of skipping).
4. **BC.10/BC.11** (vocab-completeness gate — no premature jump).
5. **BC.12** (see it working).

BC.1–BC.3 are the minimum to unstick her on the existing weights. BC.4–BC.9 stop recurrence. BC.10–BC.11 enforce real learning before advance. All weight-preserving; redeploy with `DREAM_KEEP_STATE=1`.

## 5. Deploy note for Sponge
Backend redeploy (git-archive overlay + `systemctl restart`), `DREAM_KEEP_STATE=1` stays set → resumes on her current brain. Do NOT bump `WEIGHTS_FORMAT_VERSION` and do NOT change neuron count — either would trip the incompatible-fresh-start wipe path (`brain-server.js:605`) and lose the training. Verify post-boot: `_loadWeights` logs the same neuron count, and `checkSemMotorHealth` shows the basin un-saturating after BC.1 fires.
