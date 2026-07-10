# RESUME — session handoff (2026-07-09, marathon session)

Branch: `feature/unity-convo-ledger-0707`. Every fix cascaded + pushed to `origin/main`
(the deploy branch the dashboard Update button clones). Working tree holds the same
edits uncommitted on feature + ledger churn + untracked `server/shot-*.png`,
`selfie-test.html` (local all-ages preview artifact), `pubstate-check` temp files gone.

## ⚡ IMMEDIATE NEXT STEP
**Gee presses Update & Savestart ONE more time** — the box (booted ~20:5x) carries
everything through `cb205eb` but NOT `300bd0b` (shape-loop kill + experiments,
pushed after that boot). One press picks it up. After the press verify:
- minds-eye rotates: recalls / `canvas:scene:*` / `canvas:experiment:*` /
  `canvas:dream-mix:*` / colored abstract fields — NO shape stacks, NO dead air.
- donor rows green (busy-donor forgiveness live), DIRTY truthful.
- chat ask "selfie of you at nascar" → full-body, aged-5 K Unity, wardrobe outfit.

## origin/main commit stack (today, newest first)
- `300bd0b` shape-stack loop killed past shape-age (abstracts → colored field), schema
  vocab widened + MONSTER primitive (goth canon), EXP.1 mashup/wild-color experiments
  (~22% of schema draws), EXP.2 dream-mix (18% — morphs two RANDOM stored memories).
- `cb205eb` self-image round 2: body/exposure words drop the outfit, bare ask = selfie
  portrait / ANY scene = full-body photo, 7-piece rotating goth wardrobe, AGE PIN
  (`_selfImageAge`: pre-K=4 → phd=25 from live minGrade — "25 pin in and out per grade"),
  canon 18+ gate (under-18 self-images strip explicit/exposure + render clothed).
  Verified in a human-viewable window per directive (selfie-test.html, 8+23 renders PASS).
- `1ae6a33` self-image round 1: scene merge into constant identity core (was: fixed
  mug-shot string discarded the scene).
- `66fc145` SEE.1-4 minds-eye pollution purge: feeder dead-air gates (live track +
  variance + PIXEL-IDENTICAL frame dedup), server repeat rejection (cosine >0.995) +
  store bumped to `visual-memory-v2.json` (poisoned v1 orphaned), recall cooldown
  (`DREAM_VM_RECALL_COOLDOWN_MS` 3min), de-novo two-color palette gradients (green
  wash dead).
- `d2c91e3` DRAW.7-10 artist ladder: practice loop (draw→compare→adjust vs the memory's
  own percept, per-concept skill steadies the hand), grade-gated canvas 96→512
  (`_drawCanvasSide`), memory-painting (morph strokes onto the memory), underdrawing
  realization (`_realizeDrawing`, `DREAM_DRAW_REALIZE_GAP_MS` 5min).
- `817df90` busy-donor forgiveness: drained buffer (<8MB) + computing (Gn/s>0) donor is
  NOT red (its tab answers pings late because it's WORKING). Verified live post-deploy:
  Gee 8s RTT / buf 0 / 15.2 Gn/s / GREEN.
- `5b2786b` DRAW.4-6: draw-from-memory (35% of recall hits — contour from the stored
  percept dims 24-47, chroma crayons, texture hatches), practice evolution (layout
  seeds shift per attempt), schema cosine 0.42→0.34.
- `e8bc75b` DRAW.1-3 developmental composer: Lowenfeld stages by live vocab (scribble/
  shapes/figure/scene + written labels + "?" for her questions), crayon box (goth
  accents + real-thing colors), glyphStrokes (FONT5X7 → wobbly pencil strokes),
  sketch paper de-greened.
- `65aaa96` donor 3-bug fix: DIRTY latch (sheds set a brain-level flag nothing cleared —
  now `_armShadowResync` marks the clearable cortexCluster flag + arms the drain-gated
  resync; state.js reports the clearable flag), 64MB-parked socket (mirror + SWRR now
  gate at `DREAM_DF7_LINK_CAP_MB` 4MB; `_nextPoolDonor` skips backed-up sockets),
  flood stamp raised to >50% of cap (routine 16MB upload chunks no longer bench donors
  5min).

## The wedge incident (unresolved root, has a proven recovery)
One boot never came up: process ALIVE, socket accepting, event loop pinned 10+ min
(nginx 504s). Same code booted clean immediately after → NOT the code; the
update/restart choreography (TU.30 class). **Proven remote recovery:** from Gee's
logged-in dashboard tab console:
```js
window.__updSpam = setInterval(() => fetch('/admin/update', {method:'POST'})
  .then(r => r.text()).then(t => { console.log('LANDED:', t); clearInterval(window.__updSpam); })
  .catch(e => console.warn(e.message)), 45000);
```
One landed POST spawns the detached self-update.sh which PID-pins + SIGKILLs the wedged
process; systemd revives. **Open debt: journalctl tail from a wedge to name the root.**

## Env knobs added today
`DREAM_DF7_LINK_CAP_MB` (4) · `DREAM_VM_RECALL_COOLDOWN_MS` (180000) ·
`DREAM_DRAW_REALIZE_GAP_MS` (300000) · plus prior `DREAM_UPLOAD_PACE_LOWATER_MB` (8),
`DREAM_DF7_FLOOD_COOLDOWN_MS` (300000), `DREAM_DF7_REBALANCE_MS` (10000).

## Notes / follow-ups
- `_drawSkill` / `_drawPractice` are in-memory per boot — saveWeights persistence is a
  follow-up (needs brain-server.js full-read pass).
- `_imagineTick` passes `{arousal, valence}` mood — fear-passthrough for the SEE.4 dark
  palette family is a 2-line nicety pending a chat.js re-read.
- chat.js is CRLF — edit via CRLF-safe python patch scripts, NOT the Edit tool.
- Old open browser tabs run the pre-SEE.1 feeder until reloaded (SEE.2 server gate
  covers them).
- TheREV rejoined; solo-donor saturation (bounded 35MB + sheds) is expected shape when
  one residential card carries the whole brain — more donors is the real fix.
- TU.24 hard-lessons cron remains STOPPED — do not resume unless Gee asks.
- Docs synced same-commit throughout: WEBSOCKET.md WSQ.4-6, ADMIN-CONTROLS.md (resync +
  busy-donor), SENSORY.md SE.11/SE.12/SE.13 + self-image note. FINALIZED.md entries
  4c + 5-12 carry every verbatim.

## Where to pick up
1. Confirm Gee pressed Update & Savestart for `300bd0b`; run the verification sweep
   (public-state + minds-eye labels + donor rows).
2. Watch for `canvas:experiment:*` / `canvas:dream-mix:*` labels — her play drive live.
3. If a wedge recurs: console-spam recovery above + GET THE JOURNAL.
4. Pending niceties: skill persistence, fear-passthrough, and the feature-branch
   working tree is still uncommitted (cascades ship via checkout-to-main; the feature
   branch accumulates per the no-push-until-complete local posture).
