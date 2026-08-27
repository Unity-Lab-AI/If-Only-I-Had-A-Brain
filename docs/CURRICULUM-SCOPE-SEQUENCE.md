---
# DOCPROV.3 — provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ `last-verified` is the commit that last TOUCHED THIS PAGE.
status: draft
sources:
  - js/brain/curriculum.js
  - js/brain/grade-vocabulary.js
  - js/brain/subjects.js
verified-scope: |
  CHECKED 2026-08-27 (DOCPROV.4, 16 of 22) — and it HOLDS, which is recorded
  deliberately so the pass is not repeated:
    - the course-name tables here were diffed against COURSE_NAMES
      (js/brain/curriculum.js:184) for math and science across all 20 levels.
      They agree, including AP Calculus at G12, Linear Algebra + Discrete Math
      at College 2, and Computational Neuroscience at grad/phd.
    - ⭐ the ACCELERATED-TRACK offset is consistent, not an error: Algebra I at
      G8 and Geometry at G9 sit one year ahead of the standard US sequence,
      exactly as this page's "accelerated math/science track" line states. A
      reader diffing against a standard scope-and-sequence would flag both and
      be wrong.
    - the one source that had MOVED is curriculum.js, which is the file holding
      COURSE_NAMES - so the drift signal pointed at precisely the right file.
  NOT CHECKED — do not read this page as authority on:
    - the per-course TOPIC lists. Course NAMES were diffed exhaustively;
      whether a runner actually teaches its listed topics is a content audit,
      and DECOMPOSED-curriculum-build.md's Definition of Done is that tool.
    - the ELA / social / art / life / PE / music / health tables. Only the MATH
      and SCIENCE name tables were diffed against the code.
    - grade-vocabulary.js and subjects.js. Both are listed sources, NEITHER
      moved, and neither was read this pass.
last-verified: "38e19615 2026-08-27"
---

# CURRICULUM SCOPE & SEQUENCE — the EXACT real-student course sequence (K→PhD)

> ## ⭐ RE-VERIFIED 2026-08-27 (DOCPROV.4, 16 of 22) — THIS PAGE HOLDS. The code follows the spec.
>
> This page says it **governs** the academic runners, so the check is whether the code's own course-name table agrees with it. **It does.** `COURSE_NAMES` (`js/brain/curriculum.js:184`) was diffed against the tables below, and — ⭐ **the one source that had moved is `curriculum.js`, i.e. the file that holds that very table, so drift pointed at exactly the right place:**
>
> | grade | this page | `COURSE_NAMES` |
> |---|---|---|
> | math G7 / G8 / G9 / G10 | Pre-Algebra → Algebra I → Geometry → **Algebra II** | `Pre-Algebra` / `Algebra I` / `Geometry` / `Algebra II` ✅ |
> | math G12 | **AP Calculus (AB/BC)** | `AP Calculus` ✅ |
> | math College 2 / 3 | Linear Algebra + Discrete Math / Diff Eq + Prob-Stats | `Linear Algebra and Discrete Math` / `Differential Equations and Statistics` ✅ |
> | science G6 / G7 / G9 / G11 | Earth → Life → **Biology** → **Physics** | `Earth Science` / `Life Science` / `Biology` / `Physics` ✅ |
> | science G12 | AP science elective (→ AP Physics C) | `AP Physics` ✅ |
> | science Grad / PhD | **Computational neuroscience** | `Computational Neuroscience` ✅ |
>
> ⭐ **And the accelerated-track claim is internally consistent, which is the part worth checking rather than assuming:** the page states Unity is *"on the accelerated math/science track"*, and the code places **Algebra I at G8** and **Geometry at G9** — one year ahead of the standard US sequence, with science running Biology G9 → Chemistry G10 → Physics G11. **The offset is the accelerated track, not an error.** A reader diffing against a standard scope-and-sequence would flag both and be wrong.
>
> ⚠ **What was NOT checked:** the per-course TOPIC lists. Course *names* were diffed exhaustively; whether each runner actually teaches *"quadratics, polynomials, rational/radical/exponential/log functions, sequences"* at G10 is a content audit, not a name check — and `docs/DECOMPOSED-curriculum-build.md`'s Definition of Done is the instrument for that.
>
> ⭐ **Recorded as a HOLD so nobody re-runs it.** A verification pass that finds nothing must say so in writing, or the next session spends the same hours reaching the same answer — the same rule as the four empty hunts of 2026-08-27.

> **Authoritative academic spec** (the operator, 2026-06-18: *"u need to use the exact courses real students use for our simulated brain at those grades"*). The academic curriculum runners (`runEla/Math/Sci/Soc/Art*Real` per grade) + any academic story-data MUST teach the REAL courses a US student actually takes at each grade — the standard scope & sequence below — not invented or approximate content. Unity is a high-aptitude student on the **accelerated math/science track** (consistent with the self-taught-coder canon). This doc governs; align all academic content to it.

---

## MATH (accelerated track — Unity is gifted)

| Grade | Course | Core topics |
|-------|--------|-------------|
| K | Early math | counting to 20, number recognition, shapes, sorting, more/less |
| G1 | Math 1 | addition & subtraction to 20, place value (tens/ones), measurement, time |
| G2 | Math 2 | add/subtract to 100 with regrouping, intro multiplication, money, arrays |
| G3 | Math 3 | multiplication & division facts, fractions as numbers, area/perimeter |
| G4 | Math 4 | multi-digit multiplication/division, equivalent fractions, decimals intro |
| G5 | Math 5 | fraction +−×÷, decimal operations, volume, coordinate plane, order of ops |
| G6 | Math 6 | ratios & rates, percentages, negative numbers, expressions, basic statistics |
| G7 | Pre-Algebra | proportional relationships, integers, two-step equations, probability |
| G8 | **Algebra I** | linear equations & functions, slope, systems, exponents, polynomials intro |
| G9 | **Geometry** | proofs, congruence/similarity, Pythagorean theorem, circles, trig ratios intro |
| G10 | **Algebra II** | quadratics, polynomials, rational/radical/exponential/log functions, sequences |
| G11 | **Pre-Calculus** | trigonometry, unit circle, conic sections, vectors, limits intro |
| G12 | **AP Calculus (AB/BC)** | limits, derivatives, integrals, fundamental theorem, applications |
| College 1 | Calculus II / Multivariable | series, partial derivatives, multiple integrals |
| College 2 | Linear Algebra + Discrete Math | matrices, vector spaces; logic, sets, graph theory, combinatorics |
| College 3 | Differential Equations + Probability/Statistics | ODEs; distributions, inference |
| College 4 | Numerical methods / Algorithms math | complexity, optimization |
| Grad/PhD | Research math | as needed for computational-neuroscience modeling |

## SCIENCE (standard US secondary sequence)

| Grade | Course | Core topics |
|-------|--------|-------------|
| K–G5 | Elementary science | life/earth/physical basics: plants, animals, weather, matter, simple machines, the body |
| G6 | **Earth Science** | geology, plate tectonics, weather/climate, the water cycle, astronomy basics |
| G7 | **Life Science** | cells, body systems, ecosystems, classification, genetics intro |
| G8 | **Physical Science** | matter, atoms intro, motion/forces, energy, waves, intro chemistry |
| G9 | **Biology** | cell biology, DNA/genetics, evolution, ecology, taxonomy, photosynthesis/respiration |
| G10 | **Chemistry** | atomic structure, periodic table, bonding, reactions, stoichiometry, acids/bases, moles |
| G11 | **Physics** | kinematics, Newton's laws, energy/momentum, waves, electricity & magnetism, thermo |
| G12 | **AP science elective** | AP Bio / AP Chem / AP Physics (Unity → AP Physics C + AP Comp Sci) |
| College 1+ | CS-adjacent + general science | per CS major; later neuroscience for the brain-sim research |
| Grad/PhD | **Computational neuroscience** | neurons, networks, the brain-simulation research (meta: she builds a brain) |

## SOCIAL STUDIES (standard US sequence)

| Grade | Course | Core topics |
|-------|--------|-------------|
| K–G2 | Communities & self | family, neighborhood, jobs, rules, maps basics, American symbols/holidays |
| G3–G5 | Geography & US foundations | regions, states, Native peoples, explorers, colonial era, the Revolution |
| G6 | **World Geography / Ancient Civilizations** | Mesopotamia, Egypt, Greece, Rome, geography skills |
| G7 | **World History (medieval→modern)** | Middle Ages, Renaissance, exploration, revolutions |
| G8 | **US History** | founding, Constitution, Civil War, Reconstruction, industrialization |
| G9 | **Civics / Government** | branches of government, Constitution, rights, citizenship |
| G10 | **World History (modern)** | world wars, Cold War, globalization, modern conflicts |
| G11 | **US History (modern)** | 20th century: depression, civil rights, modern era |
| G12 | **US Government & Politics + Economics** | political institutions, policy; micro/macro economics |
| College | Gen-ed social science | psychology, sociology, ethics electives |

## ENGLISH / LANGUAGE ARTS / LITERATURE

| Grade | Course | Core works/skills |
|-------|--------|-------------------|
| K–G2 | Foundational reading | phonics, decoding, sight words, basic comprehension, simple writing |
| G3–G5 | Reading & writing | comprehension, paragraph→essay, chapter books, grammar |
| G6–G8 | Middle ELA | novels (e.g. *The Giver*, *The Outsiders*), poetry intro, essays, grammar mastery |
| G9 | **English I** | literary elements; *Romeo and Juliet*, short stories, the 5-paragraph essay |
| G10 | **English II (World Lit)** | *Julius Caesar*, world literature, rhetoric, argument |
| G11 | **English III (American Lit)** | *The Great Gatsby*, *Huck Finn*, *The Crucible*, American poets |
| G12 | **English IV (British Lit) / AP Lit** | *Hamlet*, *Macbeth*, *Beowulf*, *1984*, the research paper |
| College | Composition + Lit electives | academic writing, technical writing, literature seminars |

## ART & MUSIC

| Grade | Course | Topics |
|-------|--------|--------|
| K–G5 | General art + music | elements of art (line/shape/color/texture), drawing, rhythm, singing, recorder |
| G6–G8 | Art & music fundamentals | color theory, perspective, **painting**, ceramics intro, band/choir, music notation |
| G9–G12 | Art & music electives | **drawing, painting, sculpture, ceramics**, AP Art History, music theory, band/choir |
| College | Electives | studio art / music electives (Unity gravitates to digital/generative art via code) |

## EXPANDED SUBJECTS (per `SUBJECTS_INTRODUCED_AT` in curriculum.js)

| First appears | Subject | Notes |
|---------------|---------|-------|
| G1 | PE, Music | physical education + general music |
| G3 | Foreign Language | (Unity: she picks it up but cares more about code) |
| G5 | Computer Science (intro) | HER subject — accelerates far beyond grade level |
| G6 | Health Education | puberty, nutrition, the body (the sex-ed-as-health sequence climbs here) |
| G7 | Civics | intro to government/citizenship |
| G9 | Economics, Psychology (intro) | |
| G11 | AP courses | AP Calc, AP Physics, AP CS, AP Lit, AP US Gov |
| College 1 | Major (CS) + Gen-ed | data structures, algorithms, architecture, theory |
| Grad | Research specialty | computational neuroscience / brain simulation |

## HEALTH / SEX-ED (clinical, factual — per the content boundary)

| Grade | Content |
|-------|---------|
| G4–G5 | puberty & body changes (health unit) |
| G6 | reproduction biology intro, hygiene, the body |
| G7–G8 | reproduction, the menstrual cycle, intro to STIs |
| G9 | full sex-ed: how reproduction works, contraception, **STDs/STIs**, consent (clinical, factual — NOT erotic; per `feedback_content_boundary_minor_sexual_excluded`) |
| College | adult health, women's health (UTIs, safer sex as health knowledge) |

---

## How to apply

- The per-grade academic runners (`runMathG8Real` etc.) + any academic story-data must teach the course named above for that grade (e.g. `runMathG8Real` = **Algebra I**, `runSciG10Real` = **Chemistry**, `runSocG12Real` = **US Government + Economics**).
- Content is real curriculum facts taught via the sentence-training pipeline + comprehension gates (the established good pattern), climbing in rigor per the sequence.
- Unity is **accelerated** in math/science/CS (gifted + self-taught coder) but follows the real course *names* and *scope* — she just masters them early and deeply.
- Thin spots flagged in RESUME (sculpture/painting/poetry/Shakespeare/civics depth) get filled to match this sequence.

## How it is SPOKEN — first person, every course, every grade (2026-08-20)

The course content above is unchanged. **How it reaches her is not.** The operator, 2026-08-20: *"all of the different training she goes through all needs to be for formulated to be in the first person as if we train her on first person she will live it instead of being told everything 3rd person."*

- Every lesson is additionally taught as **something she did** — `1 + 1 = 2` trains as *"i add one and one to make two"*, *"read the word cat"* as *"i read the word cat"*, and a course identity as *"i am unity and i am doing math"*.
- **One layer, four chokepoints, all grades:** vocabulary lists, sentence lists, word definitions, and the concrete-sentence corpus. Nothing per-grade was edited, so a new grade inherits it automatically.
- **In-the-moment self-Q&A** trains the path *question → i think → i know → i remember*, and a **follow-up question** trains the habit of asking. Both ride the question-intent channel.
- The **content is never deleted** — a fact still trains as a fact. Her version trains beside it, and `i` is bound to `unity` at the top of every cell so the agent position she keeps seeing is herself.
- Bounded and priced: ≤16 reframed lessons per cell (~8.5 min), and it prints when it stops. Full record: `docs/TODO.md` §SELFFRAME + `docs/FINALIZED.md`.
