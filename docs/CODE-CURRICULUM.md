---
# DOCPROV.3 — provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ `last-verified` is the commit that last TOUCHED THIS PAGE.
status: draft
sources:
  - js/brain/component-synth.js
  - docs/component-templates.txt
  - js/brain/curriculum.js
verified-scope: |
  CHECKED 2026-08-27 (DOCPROV.4, 15 of 22). Every countable and every named
  symbol on this page was looked up:
    - ⛔ SIX RUNNERS NAMED IN THE TABLE DO NOT EXIST. runCsCol1Real..Col4Real
      were SPLIT into runCsTheoryCol1-4Real + runCsSystemsCol1-4Real (8, not
      4) by the M4 college expansion, and there is NO runCs* at grad or phd at
      all. G5..G12 (8 of 8) are real and correctly named.
    - ⛔ THREE DIFFERENT COUNTS for one countable thing: "18 real programs",
      "22/30 templates", "All 30 parse". Measured: 31 PRIMITIVE blocks.
    - ✅ ANSWERED 2026-08-27 - `cs` RETIRES at grade12, and it was one of NINE,
      not one. The operator's ruling: retire them at the correct grade "once
      they have been trainined". SUBJECTS_RETIRED_AT now carries pe, music,
      health, language, cs, civics, economics, psychology and ap - all at
      grade12, because GRADE_ORDER puts college1 straight after grade12 where
      a separate roster (major/genered/cstheory/cssystems, then research)
      takes over. `cs` is superseded there by cstheory/cssystems/major.
      ⛔ RETIREMENT IS LEDGER-GATED, NOT GRADE-GATED. subjectsForGrade() is
      unchanged and still answers "what exists"; the new subjectsOwedAt(grade,
      passedCells) answers "what still owes work" and drops a track only on
      evidence its terminal cell actually passed. A subject that never ran
      stays rostered and stays owed - retiring on grade number alone would
      re-create WALKORDER.1, where Grade 1 finished with PE/Music/Health
      never taught. Measured: college 19 offered -> 10 owed, against 10
      runners; grad/phd 20 -> 11.
    - ✅ CLOSED 2026-08-27 - the operator ruled "retire": genered, cstheory and
      cssystems retire at college4, same ledger gate. gen-ed is definitionally
      undergraduate, and at grad level the CS tracks fold into research +
      major, both of which have real grad/phd runners. Measured: grad/phd owed
      is now exactly `ela math science social art life major research` - 8
      owed against 8 runners. The roster/runner gap is closed at EVERY grade.
    - VERIFIED PRESENT: .claude/scripts/fetch-code-corpora.mjs; corpora/coding
      with 14 files (grade5-12, college1-4, grad, phd - matching G5->PhD);
      generateMany / _deriveParams / _fillParams / _hueFromPattern in
      component-synth.js; _trainCodingStories; codingWords in
      .claude/scripts/gen-grade-vocab.mjs.
  NOT CHECKED — do not read this page as authority on:
    - how many of the 31 primitives are parameterized. Only the TOTAL was
      counted; the 22/8 split is carried forward unverified and at least one
      primitive is unaccounted for.
    - the "All 30 parse + JS-compile" claim. Not re-run this pass.
    - the per-grade TOPIC contents of either the ideal table or the
      "SOURCE OF TRUTH" coverage list - runner NAMES were checked, not what
      each runner teaches.
    - whether corpora/coding/*.json have real content. Files exist; unread.
last-verified: "38e19615 2026-08-27"
---

# CODE CURRICULUM — Unity's G5→PhD HTML / CSS / JS Proficiency Layout

> **Task #28** — "Unity learns to BUILD UI." This is the laid-out plan for the
> code training Unity needs to become **proficient in HTML, CSS, and JavaScript**,
> compounding every grade from first exposure (G5) to the brain-sim research (PhD).
>
> **Architecture (per `feedback_code_proficiency_trained_composition`):** Unity's
> equational word-sequence brain can't free-type arbitrary code. Proficiency =
> **(a) UNDERSTANDING** from concept-prose (trained — this doc's topics, via
> `.claude/scripts/fetch-code-corpora.mjs` → `corpora/coding/<grade>.json`,
> trained by `curriculum._trainCodingStories` in every cs cell) **+ (b)
> GENERATION** by composing the real-code exemplar library
> (`docs/component-templates.txt`, rendered in the Shadow-DOM sandbox via
> `ComponentSynth`). Math stays equational; this is the coding track. No code-LM.

---

## The three languages, the proficiency target

By PhD, Unity should **understand and reason fluently** about:
- **HTML** — structure: elements, attributes, semantic markup, forms, media, accessibility.
- **CSS** — presentation: selectors, box model, layout (fl/grid), responsive, animation, variables.
- **JavaScript** — behavior: types, control flow, functions, DOM, events, ES6+, async, OOP, closures.
- **CS foundations** — data structures, algorithms, complexity, paradigms, systems, the brain-sim.

…and **build** (via composition) the breadth her exemplar library spans — calculator → slot machine → games → tools → creative.

---

## Per-grade progression (compounds — each rung assumes the prior)

| Grade | HTML | CSS | JavaScript | CS / context | cs runner |
|-------|------|-----|------------|--------------|-----------|
| **G5** (intro) | — | — | — | what a *computer / program / code / software* IS; the internet; the keyboard | `runCsG5Real` ✅ |
| **G6** | tags, elements, attributes, document structure, headings, paragraphs, **links, images, lists**, URLs | — | — | what the **web / browser / markup** is | `runCsG6Real` |
| **G7** | **forms, inputs, tables**, semantic elements, div/span | **selectors, box model, color, typography, basic layout** | — | style sheets, web design, templates | `runCsG7Real` |
| **G8** | media, metadata | **display, flexbox, units, backgrounds, borders** | **variables, data types, operators, expressions, statements, control flow, conditionals** | source code, what running code means | `runCsG8Real` |
| **G9** | accessibility (alt/aria) | **grid, responsive, media queries, pseudo-classes** | **functions, parameters, scope, arrays, objects, strings, booleans, for/while loops** | — | `runCsG9Real` |
| **G10** | — | transitions, transforms | **DOM manipulation, events + listeners, querySelector, classList, JSON, fetch/Ajax, web storage, callbacks** | client–server, HTTP, web apps, APIs | `runCsG10Real` |
| **G11** | — | animations, **custom properties (variables)**, specificity/cascade | **ES6 (let/const, arrow fns, template literals, destructuring), higher-order fns + map/filter/reduce, closures, promises, async/await, modules** | **version control, Git, npm**, tooling | `runCsG11Real` |
| **G12** | — | (mastery review) | **classes, inheritance, prototypes, `this`, error/exception handling, functional patterns** | **algorithms, sorting, recursion, complexity, data structures**, OOP | `runCsG12Real` |
| **College 1** | — | — | (applied across projects) | CS core: data structures, algorithms, abstraction, paradigms, compilers, languages | `runCsCol1Real` |
| **College 2** | — | — | — | **discrete math, graph theory, Big-O, dynamic programming, hash tables, trees** | `runCsCol2Real` |
| **College 3** | — | — | — | **operating systems, networks, databases, SQL, concurrency, caching** | `runCsCol3Real` |
| **College 4** | — | — | — | **software engineering, testing, design patterns, cryptography, security, web frameworks, CI, distributed** | `runCsCol4Real` |
| **Grad** | — | — | — | **machine learning, numerical analysis, neural nets, optimization, gradient descent, simulation** | `runCsGradReal` |
| **PhD** | — | — | — | **computational neuroscience, deep learning, the neuron, Hebbian theory, spiking nets** — *building a brain (her thesis)* | `runCsPhdReal` |

*A `—` means that language has no NEW rung at that grade (prior mastery compounds); it does not mean she stops using it.*

> ## ⛔ RE-VERIFIED 2026-08-27 (DOCPROV.4) — SIX OF THE RUNNERS NAMED ABOVE DO NOT EXIST
>
> Every `runCs*` name in the table was looked up as a definition in `js/brain/curriculum/*.js`. ⭐ **G5→G12 are all real and correctly named** (`runCsG5Real` … `runCsG12Real`, 8 of 8). ⛔ **The six college-and-above names are wrong:**
>
> | this page said | reality |
> |---|---|
> | `runCsCol1Real` … `runCsCol4Real` | ⛔ **do not exist.** The college CS track was **SPLIT INTO TWO courses per year**: `runCsTheoryCol1Real`…`Col4Real` **and** `runCsSystemsCol1Real`…`Col4Real` — 8 runners, not 4 |
> | `runCsGradReal` | ⛔ **does not exist.** `grad.js` has no `runCs*` at all (its 8 runners are Ela/Math/Sci/Soc/Art/**Major**/**Research**/Life) |
> | `runCsPhdReal` | ⛔ **does not exist** either |
>
> ⭐ **The split is the M4 college expansion, and the roster confirms it:** `curriculum.js:152` registers `'college1': ['major', 'genered', 'cstheory', 'cssystems']`. **So this page predates the expansion and still names the old single-blob runner** — the same expansion `docs/DECOMPOSED-curriculum-build.md` records as `[x]` DONE (8→10 concurrent courses/year).
>
> ✅ **ANSWERED 2026-08-27 — RETIRED, and it was nine subjects rather than one.** The question above was correctly left for the operator, and the ruling was: *"those subject can be retired at the correct grade once they have been trainined"*. ⭐ **`SUBJECTS_RETIRED_AT` (`curriculum.js`) now retires `pe · music · health · language · cs · civics · economics · psychology · ap`, all at `grade12`** — `GRADE_ORDER` places `college1` immediately after `grade12`, where a separate roster takes over, which is exactly what real school does. `cs` is superseded there by `cstheory` / `cssystems` / `major`.
>
> ⛔ **THE CONDITION IS THE DESIGN, NOT A DETAIL: retirement is gated on the LEDGER, never on a grade number.** `subjectsForGrade()` is **unchanged and still pure** — it answers *"what subjects exist at this grade"*. The new **`subjectsOwedAt(grade, passedCells)`** answers the different question *"what still owes work"*, and drops a track **only on evidence that its terminal cell actually passed**. ⚠ **A subject that never ran stays rostered and stays owed.** ⛔ **Retiring on grade number alone would re-create `WALKORDER.1` by design** — the bug where Grade 1 finished with PE/Music/Health never taught, because a subject was skipped without its debt being cleared. `MAX_GRADE_ROUNDS` exhaustion makes that reachable: it lets the walk proceed past a grade whose cell never passed, and then **only the ledger remembers**.
>
> ⚠ **Deliberately two named functions, not one with an optional ledger argument** — the same call silently meaning two things is the capability-degradation branch the no-fallbacks rule exists to stop. ⚠ **And the ledger-floor rule is now shared** (`ledgerFloorIdx`), because `passedCells` recording postdates the pre-K era and two drifting copies of that rule is how a walk silently restarts from the bottom.
>
> **Measured after the change:** college **19 offered → 10 owed, against 10 runners**; grad/phd **20 → 11**. ⚠ **A DIFFERENT gap remains and is not covered by this ruling:** `genered`, `cstheory` and `cssystems` enter at `college1` and have **no grad/phd runner**, leaving grad/phd at 11 owed against 8 runners. Those three were not among the nine.
>
> ✅ **CLOSED 2026-08-27 — the operator ruled *"retire"*.** The three retire at `college4` under the same ledger gate. Grad/phd owed is now exactly `ela math science social art life major research` — **8 owed against 8 runners; the roster/runner gap is closed at every grade in the walk.**

### Implemented cs-runner coverage (SOURCE OF TRUTH — what actually trains)

The table above is the proficiency-target ideal. The **shipped `runCs*Real` runners** implement a valid **JS-early** variant (audited 2026-06-18) — together with the corpus + exemplars they deliver full HTML/CSS/JS proficiency by G12:
- **G5** — what a computer/program/code IS (intro).
- **G6** — HTML + web/browser/markup intro; touches css/js terms (tags, elements, attributes, headings, links, images, styles, selectors).
- **G7** — **JS basics** (variables, types, string/number/boolean, operators, if/else, for/while loops, functions, params, return, arrays, objects) + HTML forms + CSS layout.
- **G8** — functions/params/return/scope, arrays/objects/methods, **DOM** (events, listeners, select elements), CSS flexbox/responsive, debug/refactor, git.
- **G9** — **algorithms** (precise procedures, search/sort), recursion, decomposition into functions.
- **G10** — **OOP** (classes, methods, properties, inheritance, instances) + web APIs (DOM, API, JSON, fetch, async).
- **G11** — recursion/complexity, search/sort families, data structures (stack/LIFO, queue/FIFO, hash/lookup), git/branch/version, portfolio.
- **G12** — **professional**: build real apps end-to-end, frameworks, APIs, async, testing, deploy, optimize, open-source, github-as-resume, the portfolio that earned the scholarship.
- **College→PhD** — CS core → discrete/algorithms → systems/data → software engineering/security → ML/numerical → computational neuroscience (the brain-sim).

Every cs runner: teaches its band VOCAB + bespoke sentences + causal chains, calls `_trainCodingStories(grade)` (the downloaded concept-prose), runs `_teachProductionStack` + `_gateSubjectProduction('cs', grade, …)`. All verified to import clean.

---

## Build status (what trains this)

1. **Concept-prose corpus** (UNDERSTANDING) — `corpora/coding/<grade>.json`, populated by `.claude/scripts/fetch-code-corpora.mjs` (Simple/English-Wikipedia CC-BY-SA, merge-additive) per the TOPICS map above + hand-authored autobiographical coding memories. Trained by `_trainCodingStories(grade)` in every cs cell G5→PhD. ✅ pipeline live; corpus deepening ongoing (re-run ingest / add TOPICS to extend).
2. **Exemplar library** (GENERATION) — `docs/component-templates.txt`, ⛔ **31 real programs — counted 2026-08-27 (`grep -c '=== PRIMITIVE'`).** This line said **18** and the synth bullet below said **30** twice (*"22/30 templates parameterized"*, *"All 30 parse"*). **Three different numbers on one page for one countable thing, and none of them was right.** ⭐ **The library GREW past both figures** — which is the benign direction, and exactly why a count belongs in a command rather than in prose. Programs are games/tools/creative, parsed + composed by `ComponentSynth`, rendered in the Shadow-DOM sandbox. Extend by appending `=== PRIMITIVE: ===` blocks. ✅
3. **cs runners** — `runCsG5Real`…`runCsPhdReal` dispatch per (cs, grade); each teaches its rung's vocab + bespoke sentences + `_trainCodingStories`. ✅ wired G5→PhD.
4. **Vocab** — code terms folded into per-grade vocab (`gen-grade-vocab.mjs` pulls `codingWords`), anchored before binding. ✅
5. **Compositional + parametric synth (#71, DONE — coded right):**
   - **Multi-primitive composition** — `ComponentSynth.generateMany()` splits a request on conjunctions/commas, matches each part, and returns one spec per DISTINCT primitive (primary whole-match + stricter-threshold extras, deduped). "a clock and a calculator" → both; a single request → one; names with internal "and" (rock-paper-scissors) stay whole via the primary match. `engine.js _handleBuild` injects EACH spec, each in its own Shadow-DOM isolation boundary (no cross-component selector/JS collisions). Verified: synth+engine parse clean, split logic confirmed across single/and/comma/with/name cases.
   - **Parameterization** — `_deriveParams`/`_fillParams`/`_hueFromPattern` fill `{{word}}` from equational brain state: `{{accent}}` = a user-named color or a hue from the cortex activation pattern (her neural state colors the build). No-op on unparameterized templates. ⛔ **The "22/30" and "All 30" figures are STALE — the library holds 31 primitives as of 2026-08-27 (see the corrected bullet 2 above), so 22 + 8 = 30 no longer accounts for the set.** ⚠ **What is NOT re-measured: how many of the 31 are parameterized.** Only the total was counted; the 22/8 split is carried forward unverified, and **at least one primitive is now unaccounted for either way.** The reasoning behind the exclusions still stands and is worth keeping: the ones left fixed have *semantic* color (color-picker RGB, drawing-pad user-picked, reaction-timer red/green state, quiz right/wrong), so parameterizing them would break meaning. ⚠ "All 30 parse + JS-compile" is likewise a stale denominator — **the parse claim was not re-run this pass.**
   - **Runtime verification** of the live sandbox/synth/training loop happens at the K→PhD walk + final test (the terminal phase, per the no-test-until-finished rule) — the CODE is complete.

---

*Code track — trained understanding + composed generation, equationally, no code-LM. Calculator → slot machine → everything between.* 🖤
