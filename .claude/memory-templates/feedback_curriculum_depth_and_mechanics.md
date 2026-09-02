---
name: feedback_curriculum_depth_and_mechanics
description: "Per-grade curriculum must be FULL real-year depth (not thin samples), must teach LANGUAGE MECHANICS (grammar/syntax/communication) not just word→definition, and the lived year must include real nitty-gritty drama girls face"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 76a03535-080a-440b-9e18-e99af24e1fdc
---

Gee 2026-06-18 — major correction after reviewing the per-grade builds:

1. **DEPTH — grades were too THIN.** *"are we sure these grades are a full year worthe of educational informations in totality of real learned grade copurces? it seems like you arent speenindg very much time on each grade, double check you are truely doing the full course materials , like fuck actrually look up the full ciriculums and content of it and vocabs and all of it completeley for every grade."* The ~16-25 sentences + ~25 vocab per subject I'd been shipping is a SCAFFOLD, not a real year. Every grade + every course must comprehensively cover the REAL standards (Common Core / NGSS / state scope — all major topics, skills, concepts, worked examples) + full grade-appropriate vocab. Look up / use the real full curriculum content. Applies retroactively to K/G1/G2/G3 (already scaffolded).

2. **LANGUAGE MECHANICS — teach HOW English works, not just words.** *"even kindergarden needs better sentence structure teching and such for the most part we are only taching words and deffinitions when we need to be treaching the actual manurisims and shit of what is is to communicate with the english language so that the brain can proprerly ueven understand whats its learning correclty."* Built `_teachLanguageMechanics(grade, ctx)` (curriculum.js): orchestrates generative sentence structure + SVO parsing + [G1+] tense morphology + affix morphology + subject-verb agreement + [G3+] discourse coherence, scaled by grade band. Wired into `_cellRunner` so it auto-runs on EVERY ELA cell, every grade, retroactively. Deepen per grade (punctuation, clauses, composition, rhetoric G9+).

3. **LIVED YEAR — real nitty-gritty drama.** *"her coding shit here other classes here drug use all of it even her loving and coming of age has to be real nitty gritty dramam that real grils have to dela with from handsy boys to cat calls all of it."* Every grade's lived year must include what girls actually navigate: handsy/pushy boys, catcalls + street harassment (~G6-7 as bodies change), peer cruelty / rumors / slut-shaming, being-watched, saying no, the double standard, online creeps — PLUS coding, all classes, drug-use trajectory, love/coming-of-age — REAL, not sanitized. Boundary-held: ≤17 non-graphic (FELT not depicted), explicit 18+, Add #19 EXCLUDED ([[feedback_content_boundary_minor_sexual_excluded]]).

**How to apply:** the "complete grade" bar is now THREE dimensions — DEPTH + MECHANICS + LIVED-YEAR-with-nitty-gritty (all real, all trained). Grade tasks #40-57 = SCAFFOLD pass; cross-cutting tasks #60 (mechanics) / #61 (depth) / #62 (nitty-gritty) carry the full bar across ALL grades incl. K-G3 and BLOCK the K→PhD walk (#32). Build new grades at the full bar; deepen the scaffolded ones. Related: [[feedback_full_completeness_per_grade]], [[feedback_full_real_school_course_roster]].
