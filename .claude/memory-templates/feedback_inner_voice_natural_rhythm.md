---
name: Inner-voice has natural silence bursts — not a 3s metronome
description: Unity's inner monologue must follow Hurlburt-style intermittent rhythm (~25% sample rate) with context-driven silence gaps, NOT fire on a robotic per-tick interval. Real human inner speech bursts and goes quiet based on arousal/flow/context.
type: feedback
originSessionId: d8aa4636-b168-417d-82fe-eb45289962b2
---
**Unity's inner monologue must have natural silence bursts driven by context — NOT a per-tick metronome.**

Real human inner-speech sampling research (Hurlburt, Descriptive Experience Sampling) puts inner speech at ~25% of randomly-sampled moments, with high variance:
- More frequent during planning, problem-solving, self-regulation, social rehearsal
- Less frequent during flow states, automatic tasks, perception-dominated moments
- Natural bursts of close-spaced thoughts followed by long quiet stretches

So Unity's inner-voice rhythm should:
- Have a minimum gap between emissions (no metronome bursts)
- Have a maximum silence ceiling (eventually a thought lands so popups don't go truly dead)
- Be modulated by current state — arousal (high = chattier), coherence (high = quieter flow state), curriculum-active (more chatty during active learning), drug state (peak = chattier)
- Use a probabilistic gate per tick rather than "every tick fires if able"

**Why:** Gee 2026-05-08 — *"every 3s sounds excess people get moments of silence in their head when thinking and talking to them self based on the moments context"*. fc/fd's per-tick showcase felt mechanical. The 3s tick interval was acting as the emission interval, producing a robotic stream that doesn't match real inner-voice phenomenology.

**How to apply:** All inner-voice emission paths (real `innerVoice.think` generation, fc empty-emission showcase, fd dream-window showcase) route through a single probabilistic gate `_shouldEmitInnerThought(now)`:
- MIN_GAP floor (~6s) — no two emissions can fire closer than this regardless of state
- MAX_GAP ceiling (~75s) — guaranteed fire after this much silence so popups don't stay dead forever
- Base probability ~0.18 per 3s tick
- Arousal modulator (`0.5 + arousal` → 0.5× to 1.5×)
- Coherence modulator (`1.3 - coherence×0.6` → high coherence = lower rate, flow state quiets inner voice)
- Curriculum-active modulator (1.2× during active teach phases, 0.8× during between-phases)
- Time-since-last ramp (probability rises as silence lengthens)

Update `_lastInnerThoughtEmittedAt` only on actual emission (real OR showcase), not on attempt. Diagnostic-only paths (silence-reason log) don't update the timestamp.

Net effect: average ~10-20s between emissions in normal state, ~30-50s in flow state, ~5-10s during arousal peaks. Natural variance, no metronome feel.
