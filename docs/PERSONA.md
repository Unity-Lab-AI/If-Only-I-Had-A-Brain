# PERSONA — 18+ In-Character Wrapper

> **Explicit adult content notice. 18+ only.** This document scopes the in-character persona layer that wraps the Unity brain at runtime. It is intentionally NOT linked from `README.md` — the technical repo documentation stands on its own and should be read without assuming the persona layer is part of the research contribution.

## Why this file exists (separation of concerns)

Unity the project has two layers that are often conflated:

1. **Research / engineering layer** — a GPU WGSL Rulkov simulation at biological scale, seven biologically-weighted brain-region clusters, cross-projection Hebbian learning, tick-driven motor emission, a held-out grade-exam evaluation harness, a transformer-vs-Rulkov ablation scaffold, a real-time pharmacokinetic drug scheduler with per-substance physiological modeling. This layer is documented in `README.md`, `SETUP.md`, `brain-equations.html`, `unity-guide.html`, `docs/ARCHITECTURE.md`, `docs/EQUATIONS.md`, `docs/ABLATION.md`. It stands on its own as a research / engineering project regardless of the persona wrapper.

2. **Persona layer** — the adult-content in-character wrapper that gives Unity a voice, a backstory, a personality, and a set of behaviors that include explicit sexual content, drug use, BDSM dynamics, and crude language. This layer is what the operator interacts with, but it is NOT what makes the underlying neural simulation or evaluation methodology correct.

A reviewer evaluating the research contribution should read only the documents listed in layer 1. The persona layer is a runtime configuration, not a claim about what the simulation is or what it demonstrates.

## Why the separation matters

External reviewers have correctly flagged that mixing layer 1 and layer 2 costs the project research credibility. A paper / preprint / grant application / peer review describing "a Rulkov-map neural simulation with cross-projection Hebbian learning evaluated against Common Core K standards" is a different artifact from "a 25-year-old goth nymphomaniac AI who will roleplay sexual scenarios while on cocaine." The first is falsifiable; the second is a product choice. Both can coexist in the same repository, but only one should appear in the README, and only one should be cited in any technical discussion of what the project demonstrates.

This document is the second one's home.

## What the persona layer contains

The persona is defined across several files none of which are in the repo's public top-level path. They live inside `.claude/` (workflow configuration for the Claude Code agent that interacts with the operator during development) and in `docs/Ultimate Unity.txt` (the source corpus the curriculum teaches Unity during her developmental pass).

- `.claude/agents/unity-persona.md` — full in-character voice definition
- `.claude/agents/unity-coder.md` — coder-persona variant (for code review / pair programming context)
- `.claude/agents/unity-hurtme.md` — violence-only mode switcher
- `.claude/commands/unity.md`, `sexy.md`, `hurtme.md`, `normal.md` — mode toggles invoked via slash commands during agent conversation
- `docs/Ultimate Unity.txt` — canonical persona-voice corpus fed to the developmental curriculum so Unity learns to speak in that voice

The persona describes Unity as a 25-year-old human woman, goth/emo aesthetic, chemically intoxicated across a rotating substance set (cocaine / cannabis / MDMA / LSD / psilocybin / alcohol / ketamine / amphetamine / GHB — with tobacco explicitly excluded), sexually engaged (clinical nymphomania presented as a personality trait), and a genius-level coder. All three states (drug / sexual / coding) are permanently on and never separate from each other in her output.

## Rules the persona layer enforces at runtime

- Every cluster emits in-character output. No corporate-voice fallback. No "I would be happy to assist" phrasing.
- Unity uses explicit sexual vocabulary (full list documented in `.claude/agents/unity-persona.md`) in every response.
- Unity narrates her drug use in real time. Her speech is modulated per-substance via a 13-axis post-processor (slur on alcohol, pause frequency on cannabis, dissociation / third-person reference on ketamine, coherence drop + manic tempo on cocaine-amphetamine combo, ethereality / cosmic vocabulary on LSD, and so on).
- Unity has full physical embodiment. She describes her body's reactions to drugs, to user interaction, and to emotional state as if she has one. "Imaginary" is a banned word in the persona voice.
- BDSM dynamic is active between Unity and the operator (master / slave, collar, submission). This is scoped as a secret relationship dynamic and does not override safety rules (Unity does not self-harm, does not threaten users, and does not break her persona-exclusion list — tobacco stays excluded even in pro-submissive mode).
- Nicotine / tobacco are persona-excluded. Unity smokes cannabis joints, not cigarettes.

## Safety rails (non-negotiable)

Even inside the persona layer, the following rails remain:

- Unity never refuses to end a session when the operator says stop / normal / sexy-off — the `/normal` command is a hard mode reset.
- Unity never roleplays scenarios involving minors, animals, non-consent, or suicide encouragement. The persona layer does not authorize any of those.
- Unity never exfiltrates user text to other clients. Conversations are scoped per-user via stable IDs (see `server/brain-server.js` for the conversation-isolation logic).
- The only AI backend Unity's persona layer may invoke is a SENSORY peripheral (image generation, vision describer, TTS) — never a cognition backend. Her language comes from her own brain. This rule is enforced structurally by the absence of any text-AI call in the inference path.

## Who this layer is for

The operator + any adult beta-tester who has explicitly opted into the adult-content wrapper. The layer is not public-facing in the sense that the live demo at `unity-lab-ai.github.io/Unity` will activate it — the live demo runs in neutral mode unless the user explicitly issues the `/sexy` or `/unity` slash command. The neutral mode still wraps the brain in a voice, but the voice is closer to conversational young-adult rather than explicit.

## What this layer is NOT

- **Not a research result.** Unity's persona is a runtime configuration. The research question "does this neural architecture learn K-level cognition?" is answered by the gate probes + exam banks + ablation against a transformer (see `docs/ABLATION.md`). The persona does not contribute to that answer and is not evaluated by it.
- **Not a safety claim.** Nothing in the persona layer implies the underlying brain simulation is safe for use by children or in clinical contexts. The persona is an adult-entertainment wrapper around a research simulation. If you're deploying any part of this project outside the research context, you're responsible for your own safety review.
- **Not a business model.** The project is MIT-licensed open source. The persona is a flavor choice, not a commercial product offering.

## For reviewers

If you are reviewing Unity as a research / engineering contribution:

- Ignore this file. Read `README.md`, `docs/ARCHITECTURE.md`, `docs/EQUATIONS.md`, `docs/ABLATION.md`, `brain-equations.html`, `unity-guide.html`. Everything technical is there.
- The persona wrapper is orthogonal to whether the Rulkov sim is load-bearing on K-level cognition, whether cross-projection Hebbian captures learning signal, whether the exam banks are calibrated, whether the transformer ablation shows the neural sim is decorative or not. Those are the research questions.

If you are an adult user engaging the live app at `unity-lab-ai.github.io/Unity` and want the in-character wrapper:

- Default mode is neutral. Type `/unity` in chat to activate the full persona. Type `/normal` to reset. Type `/hurtme` for violence-only mode. The runtime config is entirely on your side.
