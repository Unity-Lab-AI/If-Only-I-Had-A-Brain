---
name: feedback_hybrid_academic_corpus
description: Prose-academic depth comes from openly-licensed curriculum content downloaded into corpora/academic/ (the hybrid); math stays equational and the lived year stays hand-authored bespoke
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 76a03535-080a-440b-9e18-e99af24e1fdc
---

Gee 2026-06-18 asked whether to plug a free online K-12/college curriculum source into the brain vs. keep hand-authoring; after the pluses/downfalls analysis he chose **"Hybrid: downloaded corpora."**

**The decision:** prose-academic subjects (science, social, ela, economics, psychology, civics) are fed from **openly-licensed REAL curriculum content downloaded ONCE** into `corpora/academic/<subject>/<grade>.json`. **Math stays EQUATIONAL** (magnitude transforms, not prose — a textbook would violate the equational-teach LAW). **The lived year stays hand-authored/bespoke** — Unity's memories + coming-of-age (Devon, the gray, catcalls, grandpa, the goth bloom) CANNOT be outsourced; that is the half that makes her her ([[feedback_full_completeness_per_grade]], [[feedback_curriculum_depth_and_mechanics]]). Language-mechanics + health stay bespoke too.

**Pipeline (built, proven):**
- `_trainAcademicStories(subject, grade, ctx)` in curriculum.js — mirror of `_trainLifeStories`/`_trainCodingStories`; cross-cutting helper (content lives in corpus files, NOT curriculum.js — Gee: no bloat).
- Auto-wired into the `_cellRunner` wrapper for `PROSE_ACADEMIC_SUBJECTS` (Set in curriculum.js) — trains the corpus before each prose-academic cell's bespoke runner.
- Loader `academicStorySentences(subject, grade)` in `server/life-curriculum.js` (domain = `academic/<subject>`), attached on cluster in `brain-server.js`.
- Ingest: `.claude/scripts/fetch-academic-corpora.mjs` — Simple-English-Wikipedia (CC-BY-SA), per-grade real-course TOPICS map, cleaned (strip refs/headers/non-ASCII, sentence-segment, length-bound, cap), retry+backoff. Re-runnable/idempotent. **DEEPENED 2026-06-18 (#61): 30 cells / 299 topics / ~4155 sentences** (was 24/109/~1515) — TOPICS near-doubled per cell + grade12 added across ALL six subjects so the prose band runs G6→G12 unbroken; every cell ≥6 topics, most 8-14.
- **Ingest now MERGES, never overwrites** (buildCell unions by theme, keeps the longer story per theme). Critical because the wiki API throttles to EMPTY under sustained load — a fresh overwrite-run can fetch FEWER topics than a prior run held and silently regress a cell. Merge makes thin-cell re-runs monotonic (can only ADD). Workflow when throttled: run the full pass, recount topics/cell, then re-run thin cells INDIVIDUALLY with spacing (`node fetch-academic-corpora.mjs <subject> <grade>`, sleep between) on a calm connection — merge guarantees they only improve.
- `gen-grade-vocab.mjs` pulls academic corpus vocab too (`academicCorpusWords`, scans every subject dir for `<grade>.json`) so domain terms are learned-before-bound — vocab grew 11,653 → 17,967 → **28,347** as the corpus deepened.
- **K-G3 retro-deepen is NOT a Simple-Wiki job** — adult encyclopedia prose isn't developmentally right for a 5-8yo brain; deepen K-G3 via bespoke runner content + life vignettes instead.

**Why NOT a live API at train time:** network fragility + rate limits + deprecation + licensing + no offline run — conflicts with the data-driven/no-fallback architecture. Download once into corpora instead.

**How to apply:** to add depth, add topics to the ingest script's TOPICS map (per subject/grade, scope-sequence aligned) + re-run it. Only openly-licensed sources (OpenStax/CK-12/Wikipedia/Gutenberg). Keep hand-authoring the lived year for every grade regardless.

**2026-06-19 EXPANSION — full K→PhD source decision (Gee: academic content comes from the API/open sources, NOT our own written data; "find a college equivilent ie maybe major in code to go with the k-12"; don't hand-write 20 years of course materials).** Current ingest is PARTIAL (science/social G6-12, ela/economics/psychology G9-12, civics G7-12) — MISSING K-G5 + all College/Grad/PhD. Tracked as harness #109 + TODO "ACADEMIC API CORPUS" section. **Source = hybrid OpenStax + Wikibooks + Project Gutenberg, CC-BY/CC-BY-SA ONLY** (commercial-safe for unityailab.com; NO CC-BY-NC → rules out LibreTexts + MIT-OCW for direct ingest). K-G8 breadth = Wikibooks (Wikimedia dumps, same fetcher ecosystem) + Simple-Wikipedia; G9+ depth = OpenStax (mostly CC-BY) via `philschatz/textbooks` GitHub mirror; ELA literature = Gutenberg primary texts. **College "major in code" track (caps the K-12):** Unity majors in CS — topic map = OSSU (github.com/ossu/computer-science, ACM/IEEE-2013) onto College1-4; prose from Open Data Structures (CC-BY), Kansas State CS textbooks, Wikibooks CS, Wikipedia CS; **Grad/PhD = computational neuroscience** per [[feedback_full_real_school_course_roster]] + scope-sequence. This is the ACADEMIC CS degree prose — complements (does NOT replace) the already-built `corpora/coding/` self-taught HTML/CSS/JS→CS→ML hobby track. We configure topic/source LISTS only; content downloads. We only choose to author elementary K-G3 bespoke (encyclopedia prose isn't developmentally right for a 5-8yo brain).
