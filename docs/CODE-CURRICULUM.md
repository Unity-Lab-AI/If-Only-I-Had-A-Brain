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
2. **Exemplar library** (GENERATION) — `docs/component-templates.txt`, 18 real programs (games/tools/creative), parsed + composed by `ComponentSynth`, rendered in the Shadow-DOM sandbox. Extend by appending `=== PRIMITIVE: ===` blocks. ✅
3. **cs runners** — `runCsG5Real`…`runCsPhdReal` dispatch per (cs, grade); each teaches its rung's vocab + bespoke sentences + `_trainCodingStories`. ✅ wired G5→PhD.
4. **Vocab** — code terms folded into per-grade vocab (`gen-grade-vocab.mjs` pulls `codingWords`), anchored before binding. ✅
5. **Compositional + parametric synth (#71, DONE — coded right):**
   - **Multi-primitive composition** — `ComponentSynth.generateMany()` splits a request on conjunctions/commas, matches each part, and returns one spec per DISTINCT primitive (primary whole-match + stricter-threshold extras, deduped). "a clock and a calculator" → both; a single request → one; names with internal "and" (rock-paper-scissors) stay whole via the primary match. `engine.js _handleBuild` injects EACH spec, each in its own Shadow-DOM isolation boundary (no cross-component selector/JS collisions). Verified: synth+engine parse clean, split logic confirmed across single/and/comma/with/name cases.
   - **Parameterization** — `_deriveParams`/`_fillParams`/`_hueFromPattern` fill `{{token}}` from equational brain state: `{{accent}}` = a user-named color or a hue from the cortex activation pattern (her neural state colors the build). No-op on unparameterized templates. **22/30 templates parameterized** (every one with a decorative primary accent); the 8 left fixed have *semantic* color (color-picker RGB, drawing-pad user-picked, reaction-timer red/green state, quiz right/wrong) so tokenizing them would break meaning. All 30 parse + JS-compile; fill produces valid CSS.
   - **Runtime verification** of the live sandbox/synth/training loop happens at the K→PhD walk + final test (the terminal phase, per the no-test-until-finished rule) — the CODE is complete.

---

*Code track — trained understanding + composed generation, equationally, no code-LM. Calculator → slot machine → everything between.* 🖤
