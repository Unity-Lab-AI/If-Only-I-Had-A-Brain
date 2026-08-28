---
# DOCPROV.3 — provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ `last-verified` is the commit that last TOUCHED THIS PAGE — 2026-06-26 here,
# the oldest of the 31. Expect drift; that is information, not a fault.
status: draft
sources:
  - js/brain/curriculum.js
  - js/brain/curriculum/kindergarten.js
  # ADDED 2026-08-27: this page's central table counts runners and lines across
  # ALL 20 level files, and declared only two of them. grade1 and college1 are
  # listed as the representatives whose change most likely invalidates the
  # table; state.js is cited by line in the harness-mapping section.
  - js/brain/curriculum/grade1.js
  - js/brain/curriculum/college1.js
  - server/brain-server/state.js
verified-scope: |
  CHECKED 2026-08-27 (DOCPROV.4, 14 of 22) — the oldest baseline on the board
  (2026-06-26). The page's central claim is a 20-row COUNT table, so it was
  re-measured rather than re-read:
    - ⛔ THE -1 COVERAGE GAP ACROSS ALL TWELVE GRADES IS CLOSED. Every grade
      1-12 now has runners == roster. The build ledger still said "verify the
      -1 missing runner"; verified, there is none.
    - ⛔ The college rows (7 runners / -10) CONTRADICTED this page's own ledger
      entry recording an 8->10 expansion. The measurement agrees with the
      ledger: 10 runners each, gap -7.
    - ⛔ grad/phd 7 -> 8 runners, gap -11 -> -10.
    - ⛔ Line counts moved: pre-K 525 -> 915 (the ledger's own updated "525->738"
      is itself stale), kindergarten 8947 -> 9200, grade1 703 -> 747,
      college1-4 all grew ~25%.
    - ⭐ The page's CONCLUSION survives: college+ is still the real gap.
  ⚠ THE COUNTING METHOD TOOK THREE ATTEMPTS. `run[A-Za-z]*(` matched the word
  "runners (" in prose; `run[A-Z]*(` also matched CALL SITES, inflating
  kindergarten to 11 and phd to 14. Only definitions anchored at line start
  are stable, cross-checked by hand against grad.js (8) and college1.js (10).
  NOT CHECKED — do not read this page as authority on:
    - DEPTH. Only COVERAGE (does a runner exist) was measured. Whether any
      cell meets the Definition of Done was NOT assessed, and the page's own
      CRITICAL RECALIBRATION warns that line count is a bad depth proxy.
    - the per-subject rosters themselves (which subjects each grade should
      have). Roster sizes are carried forward from the old table unverified;
      only the RUNNER counts were measured, so a "gap 0" means runners match
      the roster as PREVIOUSLY RECORDED.
    - the DoD list, the strict build order, nomenclature and milestone-mapping
      sections.
  ⚠ SELF-DRIFT, restamped 2026-08-27: the only source that moved since the last
  stamp is server/brain-server/state.js, changed by BUCKETPUB.1 (publishing
  voice.wordsBucketed / bucketSubjects). That edit adds two published fields and
  touches no curriculum runner, roster or count, so it invalidates nothing on
  this page. Read as a diff before restamping.
  ⛔ AND A CORRECTION TO THIS PAGE'S OWN 2026-08-27 RE-MEASUREMENT: the roster
  column was carried forward from the old table and was WRONG. subjectsForGrade()
  was executed (not reasoned about) and returns 19 at college1-4 and 20 at
  grad/phd, not 17/18. So the real coverage gaps are -9 at college and -12 at
  grad/phd, not the -7/-10 recorded above. The nine missing at college are
  pe, music, health, language, cs, civics, economics, psychology, ap - i.e.
  EVERY track introduced between K and grade11 has no college runner, and `cs`
  is not a special case. ⭐ The page's CONCLUSION is unchanged and still right:
  college+ is the real gap.
last-verified: "cdfcf8b5 2026-08-27"
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

> ## ⛔ RE-MEASURED 2026-08-27 (DOCPROV.4) — THE −1 GAP ACROSS ALL TWELVE GRADES IS CLOSED
>
> The table above is a **2026-06-26 reading**, and the build ledger below it still says *"verify the −1 missing runner"*. ⭐ **Verified: there is no −1. Every grade 1-12 now has runners == roster.** Counted by grepping runner DEFINITIONS (`^\s*(async )?run[A-Z]…(`) across all 20 level files:
>
> | Level | lines then → **now** | runners then → **now** | gap then → **now** |
> |---|---|---|---|
> | pre-K | 525 → **915** | 6 → 6 | 0 |
> | kindergarten | 8947 → **9200** | 9 → 9 | 0 |
> | grade1 | 703 → **747** | 8 → **9** | −1 → **0** |
> | grade2 | 536 | 8 → **9** | −1 → **0** |
> | grade3 | 496 | 9 → **10** | −1 → **0** |
> | grade4 | 714 | 9 → **10** | −1 → **0** |
> | grade5 | 583 | 10 → **11** | −1 → **0** |
> | grade6 | 526 | 10 → **11** | −1 → **0** |
> | grade7 | 541 | 11 → **12** | −1 → **0** |
> | grade8 | 542 | 11 → **12** | −1 → **0** |
> | grade9 | 578 | 13 → **14** | −1 → **0** |
> | grade10 | 596 | 13 → **14** | −1 → **0** |
> | grade11 | 650 | 14 → **15** | −1 → **0** |
> | grade12 | 637 | 14 → **15** | −1 → **0** |
> | college1 | 327 → **407** | 7 → **10** | −10 → **−7** |
> | college2 | 292 → **369** | 7 → **10** | −10 → **−7** |
> | college3 | 294 → **370** | 7 → **10** | −10 → **−7** |
> | college4 | 286 → **362** | 7 → **10** | −10 → **−7** |
> | grad | 281 | 7 → **8** | −11 → **−10** |
> | phd | 310 | 7 → **8** | −11 → **−10** |
>
> ⛔ **THE TABLE CONTRADICTED THIS PAGE'S OWN LEDGER.** The college rows say 7 runners / −10, while the build ledger below records *"college1 Freshman → college4 Senior — `[x]` EXPANDED 2026-06-26 to a real CS degree (8→10 concurrent courses/year)"*. **The measurement agrees with the ledger, not the table** — 10 runners each (`Ela`, `Math`, `Sci`, `Soc`, `Art`, `Major`, `Genered`, `CsTheory`, `CsSystems`, `Life`). ⭐ **A page that corrects itself in one section and leaves its summary table stale is the shape found three times today** (`HTML-ENTRY-POINTS`' Status vs banner, `TRAJECTORY-CAPTURE`'s field table, and this).
>
> ⭐ **The page's CONCLUSION survives intact and that is worth saying:** *"the big remaining curriculum build is M4/M5 (college+) + targeted G1-12 gap-fills."* Still true — college+ is still the real gap at −7/−10. **Only the numbers moved; the plan was right.**
>
> ⚠ **Even the ledger's own updated figure is stale:** §pre-K records *"DEEPENED 2026-06-26 (525→738 lines)"* and the file now reads **915**. A line count is a reading, not a property — the third instance of that lesson today.
>
> ⚠ **The counting method took THREE attempts and the first two were wrong**, which is why the definition-anchor is spelled out above. `run[A-Za-z]*(` matched the word **"runners ("** in prose; `run[A-Z]*(` then also matched **call sites** (`this.runElaK(…)`), inflating kindergarten to 11 and phd to 14. Only definitions anchored at line start give a stable count — cross-checked by hand against `grad.js` (8) and `college1.js` (10). ⛔ **Do not re-derive these with a looser pattern and conclude the numbers changed.**

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

Within each level: build/deepen EVERY subject in `subjectsOwedAt(level, passedCells)` to the DoD before the level is marked complete. ⚠ **Changed 2026-08-27 from `subjectsForGrade(level)`** — that function is cumulative with no removal, so it kept the nine K-12 tracks rostered at college and grad. `subjectsOwedAt` retires them **only once the ledger shows their terminal cell passed**, so a subject that never ran still owes its cell and still appears here.

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
