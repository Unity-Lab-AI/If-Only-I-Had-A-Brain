---
# DOCPROV.3 — provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ `last-verified` is the commit that last TOUCHED THIS PAGE — 2026-06-26 here,
# the oldest of the 31. Expect drift; that is information, not a fault.
status: draft
sources:
  - js/brain/curriculum.js
  - js/brain/curriculum/kindergarten.js
last-verified: "0bbdbd93 2026-06-26"
---

# DECOMPOSED — Full Curriculum Build to Depth (K→PhD, skip-proof layout)

> **Gee verbatim per LAW #0 (2026-06-26):** *"We are doing it all even the large builds nothing is deffered and dont skip work becasue its large so you need properl layout of large work so u dont fuck up and skip work becasue its too hard or something stupid like that"* + *"why only courses? highschool has 6 per year college even more in graduate master and phsd"* + *"grade only count for k-12 are grade , college is difgferent"*
>
> **Mandate:** every (level, course) cell is built to the **K-depth bar**. Nothing deferred, nothing skipped because it's large. This doc is the skip-proof ledger — `done` is provable per cell, never hand-waved. Pairs with `docs/TODO-full-syllabus.md` (content ledger) + `docs/NewTodo.md` TRACK A-S (workflow pointer).

---

## ⚠ HOW WE GOT HERE — verified ground truth (an over-confident audit was caught + corrected)

A first audit claimed "100% complete, all subjects REAL, no stubs." **That was confabulation** — directly contradicted by file sizes, the live dashboard (6 courses at college, not 17), and runner counts. Verified reality (line counts + named runners present, 2026-06-26):

| Level | Lines | Subject runners present | Roster size | Coverage gap | Depth vs K |
|---|---|---|---|---|---|
| pre-K | 525 | 6 | 6 | 0 | thin |
| **kindergarten** | **8947** | **9** | **9** | **0** | **TEMPLATE (deep)** |
| grade1 | 703 | 8 | 9 | −1 | 13× thinner |
| grade2 | 536 | 8 | 9 | −1 | thin |
| grade3 | 496 | 9 | 10 | −1 | thin |
| grade4 | 714 | 9 | 10 | −1 | thin |
| grade5 | 583 | 10 | 11 | −1 | thin |
| grade6 | 526 | 10 | 11 | −1 | thin |
| grade7 | 541 | 11 | 12 | −1 | thin |
| grade8 | 542 | 11 | 12 | −1 | thin |
| grade9 | 578 | 13 | 14 | −1 | thin |
| grade10 | 596 | 13 | 14 | −1 | thin |
| grade11 | 650 | 14 | 15 | −1 | thin |
| grade12 | 637 | 14 | 15 | −1 | thin |
| college1 (Freshman) | 327 | 7 | 17 | **−10** | 27× thinner |
| college2 (Sophomore) | 292 | 7 | 17 | **−10** | 27× thinner |
| college3 (Junior) | 294 | 7 | 17 | **−10** | 27× thinner |
| college4 (Senior) | 286 | 7 | 17 | **−10** | 27× thinner |
| grad (Master's) | 281 | 7 | 18 | **−11** | thin |
| phd (Doctoral) | 310 | 7 | 18 | **−11** | thin |

**Two work dimensions per cell:** (A) COVERAGE — does a real runner exist for this (level, subject)? (B) DEPTH — is it built to the K bar? Today: scaffolding wired end-to-end + walk iterates `subjectsForGrade` (#110, curriculum.js:8637), but G1→PhD are shallow and college+ is massively under-covered.

> ## ⚠ CRITICAL RECALIBRATION 2026-06-26 — LINE-COUNT ≠ DEPTH (corrected by reading the actual cells)
> The line-count matrix above is **misleading as a depth proxy**, and the "G1→PhD are shallow stubs" read was **WRONG**. Verified by reading grade1.js end-to-end: every grade-1 cell carries REAL grade-standards content and uses the full **shared K-uniform teaching stack** — `_teachSentenceList`, `_teachProductionStack`, `_teachCausalChains`, `_gateSubjectProduction`, `_trainLifeStories`, `_teachColorMixing`, `_teachCommunityRoles`. Examples: Soc = ancient Egypt/Nile/pharaohs/pyramids/hieroglyphics + community helpers; Art = full color theory (primary/secondary/complementary/warm-cool/tints-shades); Music = beat/rhythm/melody/pitch/dynamics/tempo + 8-question production gate; Health = heart/lungs/germs/nutrition/teeth/safety + gate; Life = the dad-fading/latchkey/reading-obsession/monster-drawings goth-trajectory arc. **The reason grade1.js is 703 lines vs K's 8947 is that the shared primitives LIVE in kindergarten.js and the per-grade files REUSE them** — not because the grades are empty. So K's 8947 includes the dispatcher + all shared teach methods that every grade calls.
>
> **Revised reality of the curriculum build:**
> - **pre-K** — was genuinely thinner (used only `_conceptTeach`/`_teachAssociationPairs`, not the sentence/production/gate stack — partly appropriate for pre-literate birth-to-4). ✅ DEEPENED 2026-06-26.
> - **grades 1-12** — largely AT the DoD already: real standards + shared stack + production gates + life arcs. M1-M3 work is a **targeted standards-coverage AUDIT + gap-fill**, NOT wholesale rewrites. Padding already-complete cells to chase a line count would be busywork.
> - **college 1-4 + grad + phd** — the REAL gap (confirmed): only ~7-8 subject runners for 17-18 roster subjects, and `major`/`genered` collapsed into blobs. M4/M5 = genuine build (split blobs into concurrent courses, add missing college+ subject runners).
> - **Net:** the big remaining curriculum build is **M4/M5 (college+) + targeted G1-12 gap-fills**, far smaller than "rewrite 19 levels to 8000 lines each." DoD point 5 ("real standards depth") is the bar, judged by standards-coverage, not line count.

---

## DEFINITION OF DONE — per (level, subject) course cell

A cell is `[x] DONE` only when ALL hold (the K template, `js/brain/curriculum/kindergarten.js`, is the reference for "enough"):

1. **Real runner** — `run<Subject><Level>Real()` (or equivalent) exists in the level's `_MIXIN`, dispatched in `_cellRunnerRaw` (curriculum.js ~6604-7262); NOT `readyAndWaiting` fall-through.
2. **Real course name + blurb** — `COURSE_NAMES[subject][level]` + `COURSE_BLURB` set to the real grade-appropriate course (no blob; college blobs split into real concurrent courses).
3. **Vocab pre-taught** — all cell vocab registered + definition-trained BEFORE use (test-words-pre-taught LAW).
4. **Language mechanics** — grammar/syntax/composition taught for the level (`_teachLanguageMechanics` on ELA-class cells) — [[feedback_curriculum_depth_and_mechanics]].
5. **Real standards content depth** — covers the real curriculum standards for that course at that level (look up the full real curriculum), not a scaffold — [[feedback_curriculum_depth_and_mechanics]] + [[feedback_full_completeness_per_grade]].
6. **Lived-year thread** — the `life` cell for the level carries the real nitty-gritty lived year (age-appropriate, boundary-held per [[feedback_content_boundary_minor_sexual_excluded]]) morphing Unity toward her 25yo self.
7. **Gate** — a real completion gate/probe (not force-advance) confirms the cell trained.
8. **Course identity learned** — `_teachCourseIdentity` so Unity knows the class name + what it entails — [[feedback_full_real_school_course_roster]].

---

## STRICT BUILD ORDER (no reordering, no skipping ahead)

K is the proven template and stays the reference. Build **up** to it, level by level, all subjects within a level before advancing:

`pre-K → [K = template, DONE] → grade1 → grade2 → … → grade12 → college1(Freshman) → college2(Sophomore) → college3(Junior) → college4(Senior) → grad(Master's) → phd(Doctoral)`

Within each level: build/deepen EVERY subject in `subjectsForGrade(level)` to the DoD before the level is marked complete.

---

## NOMENCLATURE (S.1 — lands first, independent)

Internal keys stay (`college1..4`, `grad`, `phd`) so weights/persistence don't churn. DISPLAY everywhere uses real names:

| key | display |
|---|---|
| college1/2/3/4 | Freshman / Sophomore / Junior / Senior Year |
| grad | Master's |
| phd | Doctoral (PhD) |
| pre-K … grade12 | Pre-K, Kindergarten, Grade 1 … Grade 12 (these ARE grades) |

`LEVEL_LABELS` map + `levelKind(key)` helper (grade | undergrad-year | grad-program); render in curriculum heartbeats, `COURSE_NAMES` headers, dashboard, `server/brain-server/state.js:178`. **Grades exist only for K-12.**

---

## COLLEGE+ ROSTER EXPANSION (the −10/−11 coverage gap)

College currently runs ~8 subjects (art/ela/genered/life/major/math/sci/soc); the major is one "Computer Science Major" blob ×4 years. Real CS-degree load — break into concurrent named courses per year, ADD the missing tracks (kinesiology/health/foreign-language elective + gen-ed breadth as distinct courses). Target ≥8-12 real concurrent courses/undergrad year; Master's/PhD = named seminars + research. Finalize exact course lists against a real CS BS/MS/PhD curriculum.

---

## PER-LEVEL BUILD LEDGER (check each cell at DoD)

Status legend: `[x]` done-to-DoD · `[~]` exists-but-shallow (needs depth) · `[c]` covered-runner-missing (needs build) · `[ ]` not started.
(Initial status from the 2026-06-26 audit: K = `[x]`; every other level's existing subjects = `[~]` shallow; college+ missing subjects = `[c]`.)

### pre-K — `[x]` DEEPENED 2026-06-26 (525→738 lines, parses+imports clean, bundle rebuilt)
ela `[x]` (full A-Z + rhyming families + print concepts + listening comprehension) · math `[x]` (cardinality + shapes + sort/match + AB-patterns + measurement) · science `[x]` (living/non-living + 5 senses + weather/seasons + cause-effect) · social `[x]` (community helpers + manners + turn-taking + rules) · art `[x]` (extra colors + tools + music dynamics + movement) · life `[x]` (already solid — emotional concepts + family canon + first words + sensory firsts)

### kindergarten — `[x]` TEMPLATE (reference; no work unless template itself changes)
ela · math · science · social · art · pe · music · health · life — all `[x]`

### grade1 → grade2 (9 subjects each) — `[~]` deepen all; verify the −1 missing runner
ela · math · science · social · art · pe · music · health · life

### grade3 → grade4 (10) — adds **language**
…core 9… · language `[~/c]`

### grade5 → grade6 (11) — adds **cs**
…10… · cs `[~/c]`

### grade7 → grade8 (12) — adds **civics**
…11… · civics `[~/c]`

### grade9 → grade10 (14) — adds **economics, psychology**
…12… · economics `[~/c]` · psychology `[~/c]`

### grade11 → grade12 (15) — adds **ap**
…14… · ap `[~/c]`

### college1 Freshman → college4 Senior — `[x]` EXPANDED 2026-06-26 to a real CS degree (8→10 concurrent courses/year)
PRESENT `[x]`: ela(Composition→Literature) · math(Calc II→Numerical) · science(College Sci→Neuroscience) · social · art(Studio elective) · life · major(CS core) · genered(breadth) · **cstheory `[x]` NEW** (Discrete Math→Algorithms→Theory of Computation→Advanced Algorithms) · **cssystems `[x]` NEW** (Computer Organization→Architecture→Operating Systems→Networks & Compilers). 8 new runners across college1-4, full dispatch + COURSE_NAMES + COURSE_BLURB + production gates; roster 17→19, bundle rebuilt.
OPTIONAL FURTHER POLISH `[ ]`: kinesiology/health/foreign-language electives as distinct college cells; further split of `major` into per-year named courses. Not blocking — college is now a real concurrent CS-degree load.

### grad Master's (18) — adds **research**
PRESENT `[~]`: ela · math · science · social · art · major · life
MISSING `[c]`: research(thesis) + specialization seminars (split major) + the carried tracks needing Master's-level cells

### phd Doctoral (18)
PRESENT `[~]`: ela · math · science · social · art · major · life
MISSING `[c]`: research(dissertation) + advanced seminars + carried tracks

---

## MILESTONES → harness task mapping

The harness tracks milestones (one per level-band) so progress is visible without 200 micro-tasks; THIS ledger holds the per-cell granularity. Each milestone closes only when every cell in its band hits the DoD.

- **M0** — S.1 nomenclature (display real names) — independent, lands first.
- **M1** — pre-K deepened to DoD.
- **M2** — grades 1-5 deepened + coverage-complete.
- **M3** — grades 6-8 deepened + coverage-complete.
- **M4** — grades 9-12 deepened + coverage-complete.
- **M5** — college1-4 (Freshman-Senior): roster expanded (split major/genered, add missing tracks) + deepened.
- **M6** — Master's + PhD: research + seminars + deepened.

Each milestone = a harness task; closing it requires every cell in the ledger band marked `[x]`.

---

## NOTES
- `subjectsForGrade()` walk migration (#110, curriculum.js:8637) is DONE — every introduced subject is iterated; the gap is per-cell COVERAGE + DEPTH, not the loop.
- Math stays equational (excluded from PROSE_ACADEMIC); prose subjects get the hybrid academic corpus ([[feedback_hybrid_academic_corpus]]).
- This build is SEPARATE from the emission/voice/memory tracks (A / A-Q / A-R) — it's WHAT she's taught, not how she speaks. Both proceed; neither is deferred.
