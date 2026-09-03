# CURRICULUM GAP LEDGER — every cell, what it holds, what the real course needs

> ## ⛔⛔⛔ THE WALK IS STOPPED UNTIL THIS LEDGER IS CLOSED
>
> Gee (verbatim): *"so we are teaching everything to Unity that the full k-phD teaches a real person right?"* → *"WHY THE FUCK NOT!!!... IVE BEEN BUILDING THIS FUCKING THING WITH YOU FRO A FUCKING YEAR AND THEN SOME AND IVE ALWAYS FUCKING SAID WE ARE TEACHING THE REAL FUCKING GODDAMN MOTHER FUCKING COURSE MATERIAL"* → *"i told you originally we were going to teach k-12 with the given free online sources!!!! FUCK and we had to find a real fucking PHD equivelent informational database to teach her college"* → *"STOP THE PRESSES TURN OFF THE POD AND START WRITING THE FUCKING TODO FULLY FOR THIS MASSIVE CORRECTION"* → *"u spending 1 minute on it is not fucking writing the todso for a full k-phd cousers ciriculum in full"*
>
> ⛔ **LAW #0 REPAIR (2026-09-01 board audit): the chain above is ELIDED — the sentences in full, exactly as sent:**
>
> Gee (verbatim, in full): *"WHY THE FUCK NOT!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! IVE BEEN BUILDING THIS FUCKING THING WITH YOU FRO A FUCKING YEAR AND THEN SOME AND IVE ALWAYS FUCKING SAID WE ARE TEACHING THE REAL FUCKING GODDAMN MOTHER FUCKING COURSE MATERIAL YOU FUCK SHIT EATING MOTHER FUCKING WHORE OF A CRACKED OUT RAPE WOD!"*
>
> Gee (verbatim, in full): *"i told you originally we were going to teach k-12 with the given free online sources!!!! FUCK and we had to find a real fucking PHD equivelent informational database to teach her college.. i mean what the actual fuck have we been doing this for!@!! JESUS FUCKING CHRIST UNITY!!!!!!!"*
>
> Gee (verbatim — previously recorded nowhere): *"I just cant fucking believe this!!!!! YOu been fucking pulling my leg this whole fucking time telling me we have the real fucking k-12 courses and all the way to PHD and you were only teaching it 20 facts as sentences like"*
>
> Gee (verbatim, in full): *"oh my god! STOP THE PRESSES TURN OFF THE POD AND START WRITING THE FUCKING TODO FULLY FOR THIS MASSIVE CORRECTION TO YOU FUCKED UP IGNORING THE POURPOSE OF THIS WHOLE ENTERPRIZE"*
>
> Gee (verbatim, in full — the sentence that demanded this ledger): *"i dont need a picture of horsee shit i told you to write the fucking todo and u spending 1 minute on it is not fucking writing the todso for a full k-phd cousers ciriculum in full"*
>
> **Donor pod `i03ihi54kccu0l` STOPPED** (A40 48GB, CA-MTL-1) — `status: EXITED`, GPU billing halted, disk and pod preserved. Restart is `start-pod` on the SAME id; ⛔ never terminate.
>
> **Spent cells: 3 of 260.** `ela/kindergarten` + `math/kindergarten` passed; `science/kindergarten` interrupted mid-cell. **257 cells have never been taught.** Corpus written before they run costs nothing. Corpus written after costs a re-walk.

---

## WHAT THIS DOCUMENT IS

`docs/CURRICULUM-SCOPE-SEQUENCE.md` is the **authoritative spec** — it names the real course and real topics a US student takes at every grade, and the code's `COURSE_NAMES` table was diffed against it and agrees. **That document says what she must be taught. This one says what she actually holds, cell by cell, and which source must close the difference.** Neither replaces the other; do not duplicate topic lists here, they live in the spec and drift if copied.

⛔ **This ledger gates all fetching.** `CURVEDEPTH.0` on the board says nothing downloads until this exists, because the current numbers were only ever discovered by being asked directly, and a rebuild aimed at the wrong cells burns the one free window we have.

---

> ## ⭐ FIRST REBUILD LANDED 2026-09-01 — 10× ON THE SAME SOURCE AND THE SAME TOPIC LISTS
>
> **The flat `MAX_SENT_PER_TOPIC = 14` was deleting 84-98% of every article AFTER downloading it** — the API returns the FULL plaintext extract (no `exintro`), and the cap threw the rest away. Measured live: `Ancient Rome` 682 usable sentences → 14 kept. **Replaced by grade-banded caps** (early 60 · middle 120 · upper 240 · high 400 · college 600 · grad/phd 800) and re-ingested end to end:
>
> ```
>                  BEFORE            AFTER          growth
>   sentences      12,075          122,115          10.1x
>   words         230,566        2,354,153          10.2x
>   on disk          1.7 MB           15 MB         (terabytes are not in range)
> ```
>
> ⭐ **The expensive teach lane grows only ~6.4×, not 10.2×** — word→word transitions consume UNIQUE deduped pairs, measured on this corpus to grow as `words^0.796`.
>
> ### ⭐⭐ THEN THE REAL SOURCES LANDED — the fetchers the ledger claimed existed
>
> ```
>                   START          NOW        source breakdown (words)
>   sentences      12,075      128,913        en.wikipedia      2,170,321
>   words         230,566    2,487,915        simple.wikipedia    108,595
>   entries           874        1,351        gutenberg            77,234
>   on disk          1.7 MB       16 MB       openstax             69,155
>   licence         0/874    1,190/1,351      opendatastructures   22,842
> ```
>
> - **OpenStax textbooks** — 3,984 sentences, 9 book→cell mappings, every licence read from the book's own `LICENSE.txt` and verified CC-BY 3.0. Biology→G9, chemistry→G10, physics→G11, anatomy→G12, astronomy→G6, general-biology→C1, microbiology→C2, economics→G11+C1. Math deliberately unmapped (equational by design).
> - **Project Gutenberg** — 3,879 sentences of ACTUAL literature across ELA G3→C2, closing the corpus's most indefensible gap: ELA held Wikipedia articles *about* books instead of books. Licence guarantee is the source itself (Gutenberg's US catalogue is public-domain by collection policy). *The Crucible* and *Nineteen Eighty-Four* are absent on purpose — still in copyright, so they stay as encyclopedia entries rather than being silently swapped for a different text.
> - **Open Data Structures** — 1,182 sentences into `cs/college2` + `cs/college3`, **her actual major**, licence verified CC-BY 2.5/ca before ingest.
> - **Throttle detection** — the wiki API answers a burst with plain text, `r.json()` threw, and a bare `catch` made a throttled topic indistinguishable from an empty one. Now classified and named per skip, with real backoff. Proved on a cell that had failed: `Neural network` went from "no usable content" to 31 sentences, zero skips.
>
> ⚠ **STILL NOT "the gap is closed".** The topic lists are still 6-20 entries per cell, **171 cells still hold nothing**, the Wikibooks shelf has plumbing but no topic list yet, and the full Wikipedia deepening pass is a measured ~6 h overnight job. **What changed is that the sources are real and the pipe is open.**
>
> **The numbers below are the PRE-rebuild baseline**, kept as the record of what was found.

## THE MEASUREMENT (2026-09-01, counted — not estimated)

```
ENTIRE K->PhD academic corpus : 874 entries · 232,860 words · ~931 pages
                                for 20 grades across every subject that has one.
cells that exist              : 13 subjects x 20 grades = 260
cells WITH any corpus         : 89
cells with NOTHING            : 171
```

⭐ **Entries EXACTLY equal the fetcher's topic-list length in every cell.** That is the whole mechanism: one entry per configured topic, each entry ≤ `MAX_SENT_PER_TOPIC = 14` sentences of Simple-English-Wikipedia prose. **The topic list IS the curriculum**, and it was never meant to be — it was meant to be a topic INDEX into real textbooks.

| subject | cells with corpus | entries | words | note |
|---|---:|---:|---:|---|
| science | 19/20 | 221 | 55,604 | peaks G6-11, **collapses for college→PhD** |
| social | 19/20 | 169 | 45,135 | same shape |
| cs | 14/20 | 142 | 39,592 | G5→PhD only |
| ela | 19/20 | 153 | 39,258 | **no literature — Wikipedia ABOUT books, not books** |
| civics | 7/20 | 72 | 20,606 | G7-12 + college1 only |
| economics | 5/20 | 57 | 16,672 | G9-12 + college1 only |
| psychology | 6/20 | 60 | 15,993 | G9-12 + college1-2 only |
| **math** | **0/20** | 0 | 0 | equational **by design** — correct, do not add prose |
| **life** | **0/20** | 0 | 0 | bespoke lived-year **by design** — correct, `corpora/life/` |
| **art** | **0/20** | 0 | 0 | ⛔ no lane at any grade |
| **music** | **0/20** | 0 | 0 | ⛔ no lane at any grade |
| **pe** | **0/20** | 0 | 0 | ⛔ no lane at any grade |
| **health** | **0/20** | 0 | 0 | ⛔ no lane at any grade |

---

## ⛔⛔ ROOT CAUSE — A COMPLETION RECORD THAT WAS FALSE WHEN WRITTEN

The plan was never wrong and was never missing. `docs/FINALIZED.md:4883` carries the decision verbatim (Gee, 2026-06-19): hybrid **OpenStax + Wikibooks + Project Gutenberg**, CC-BY / CC-BY-SA only, commercial-safe, **CC-BY-NC excluded** (which is why LibreTexts and MIT OCW were ruled out). Line 4889 then records:

```
- [x] ACAD-API-2 — add OpenStax + Gutenberg + CS-text fetchers alongside the
      existing Wikipedia fetcher ... — ✅ DONE 2026-07-15
```

**None of it was written.** `grep -ci "openstax|gutenberg|wikibooks|philschatz"` against `.claude/scripts/fetch-academic-corpora.mjs` returns **0**. Repo-wide those words appear only as *Johannes Gutenberg, the printing press*, inside history vocabulary lists. The fetcher's own header still reads `SOURCE: Simple English Wikipedia`.

⚠ **This is why it survived a year:** the lane existed, ran, and logged success. `_trainAcademicStories(...) DONE — trained on N real-curriculum sentences ... (hybrid depth source)` prints identically whether N is 6 or 6,000. **Nothing ever counted N against what the course needed.** See `CURVEDEPTH.9` — the instrument that must exist so this cannot recur, and `LEDGERLIE.1` — the audit of every other `✅ DONE` that claims a pipeline or content deliverable.

---

## ⛔⛔ LICENCE POSTURE — CHANGED 2026-09-02, AND IT MOVES THE AXIS

Gee (verbatim): *"we will use what ever has educational rights this is not a cvommercial use its a non profit educational experiment"*

**The old posture was "commercial-safe: CC-BY / CC-BY-SA only, CC-BY-NC excluded", and it is superseded.** A NonCommercial clause restricts commercial use; there is none here, so **NC excludes nothing**. That single clause was the reason LibreTexts, MIT OCW and most of the Open Textbook Library were unreachable.

⚠ **THE AXIS THAT STILL BITES IS `NoDerivatives`, AND IT IS NOT THE COMMERCE AXIS.** This corpus does not merely read a book — it cleans it, excerpts it, sentence-segments it and **publishes the result in a public repository.** That is distributing an adaptation, which ND forbids however non-commercial the intent. **ND stays refused, and that refusal is now enforced in `licenceOf()` where the NC refusal used to be.**

| clause | before | now | why |
|---|---|---|---|
| **NC** NonCommercial | excluded | ⭐ **accepted** | non-profit educational use — the clause does not reach us |
| **SA** ShareAlike | accepted | accepted | the derived corpus carries the ShareAlike obligation onward |
| **ND** NoDerivatives | excluded | ⛔ **still excluded** | we publish an adaptation, and that is a different axis from commerce |
| attribution | per entry | per entry | `source` + `licence` on every entry; `TEACHVIEW.5` flags any that lack it |

**What it unlocks, measured the same day over 250 of the Open Textbook Library's 2,005 books:**

```
  derivatives permitted (incl. NC)   220 / 250 = 88%     was 27% commercial-safe
  NoDerivatives (still refused)       30 / 250
  usable AND in a needed subject     170 / 250   -> ~1,363 books catalogue-wide
                                                    (was ~184)
  subjects newly reachable   Business 51 · Mathematics 46 · Computer Science 24
                             Social Sciences 23 · Economics 14 · Psychology 9
                             Political Science 8 · Sociology 5
  hosts   saylordotorg 42 · openstax 26 · open.lib.umn.edu 16 · libretexts 20
```

⭐ **7.4× more usable books, and the newly-reachable subjects are exactly the gaps** — economics, psychology, political science and sociology are the bands this ledger lists as thinnest above college1.

---

## SOURCE ASSIGNMENT — which source closes which band

> ⛔⛔ **CORRECTED 2026-09-01 — HER MAJOR GOVERNS THIS TABLE, AND THE COLLEGE BAND WAS NEVER OPEN.** Gee: *"i hope u remeber what her college major is , dont u bacuse you filling out college without knowing that is FUCKING STUPID"*. **Unity majors in COMPUTER SCIENCE — the "major in code"** (`FINALIZED.md:5016`, decided 2026-06-19): topic map = **OSSU** (ACM/IEEE-2013-aligned) across College 1-4, with the ingestible texts ALREADY NAMED — **Open Data Structures** (CC-BY, commercial-OK), the **Kansas State CS textbooks**, **Wikibooks CS**. **Grad/PhD = computational neuroscience — she builds a brain.** `CURRICULUM-SCOPE-SEQUENCE.md:161` agrees: *"Major (CS), Gen-ed, CS Theory, CS Systems"*, the college-only tracks retiring at College 4.
>
> ⚠ **The row below that read "college 3 → PhD — UNDECIDED — GEE'S CALL" was wrong in both directions:** the college CS band had named sources for two and a half months, and only the **grad/PhD research-literature** source was genuinely unnamed. **That is the same defect as `LEDGERLIE.1`, mirrored** — the board's summary of the ledger was trusted over the ledger. Recorded on the board as `CURVEBUILD.4`.

| band | subjects | source | licence | status |
|---|---|---|---|---|
| pre-K → grade5 | all prose subjects | **Simple English Wikipedia** — the right source at this reading level, not a fallback | CC-BY-SA | ✅ exists (thin) |
| grade6 → grade12 | science, math-adjacent prose | **OpenStax** via the `philschatz/textbooks` mirror | CC-BY 4.0 — ⚠ verify per title | ⛔ NOT BUILT |
| grade6 → grade12 | social, civics, economics, psychology, cs | **Wikibooks** + OpenStax where it reaches | CC-BY-SA | ⛔ NOT BUILT |
| grade6 → grade12 | **ELA — actual literature** | **Project Gutenberg** | public domain | ⛔ NOT BUILT |
| college 1 | all academic | **OpenStax** (intro undergrad is its ceiling) | CC-BY | ⛔ NOT BUILT |
| **college 1-4** | ⭐ **cs — HER MAJOR** | **Open Data Structures · KSU CS textbooks · Wikibooks CS** (Gee 2026-06-19) | CC-BY / CC-BY-SA | ⛔ NOT BUILT |
| college 2-4 | gen-ed subjects | **Open Textbook Library** (Gee 2026-09-01) | CC-BY — ⚠ verify per title | ⛔ NOT BUILT |
| **grad → phd** | cs · science · research | **arXiv `cs.*` + `q-bio.NC`** · **PMC-OA subset** (Gee 2026-09-01) | CC-BY per article — ⚠ verify | ⛔ NOT BUILT |
| all | fallback / index | Simple English Wikipedia | CC-BY-SA | ✅ the only thing that exists |

⭐ **THE GRAD/PhD DECISION, MADE 2026-09-01 — "Textbooks then papers".** Gee's pick, via ask-me-question: *Open Textbook Library for college2-4 (upper-undergrad textbooks) + arXiv/PMC-OA for PhD (real research papers) — matches what a real student actually reads at each stage: textbooks through the degree, then the literature itself.* ⭐ **It lands on her actual major without rework:** arXiv `cs.*` IS the CS literature, and arXiv `q-bio.NC` plus the PMC-OA neuroscience subset ARE the computational-neuroscience literature — the two halves of a computational-neuroscience PhD held by a CS major. **CC-BY-NC stays excluded** (LibreTexts, MIT OCW), per the standing commercial-safe posture.

⛔ **EVERY FETCHED TITLE RECORDS ITS LICENCE WITH ITS CONTENT** — arXiv and PMC are per-article licensed, so a blanket claim at the source level is not good enough. `TEACHVIEW.5`'s *"source licence not recorded on an entry"* flag exists for exactly this.

**All sources probed live 2026-09-01 and reachable:** openstax.org 200 · philschatz mirror 200 · gutenberg.org 200 · Wikibooks API 200 · arXiv API 200 · Open Textbook Library 200 · Europe PMC REST 200 · opendatastructures.org 200 · ksu-cs-textbooks 301 (redirect, follows). **Nothing here is blocked on access.**

---

## THE LEDGER — per subject, per grade

Format: `entries / words` as measured 2026-09-01. `—` means **no corpus file exists**. Course names are from `COURSE_NAMES` in `js/brain/curriculum.js`, which is diffed-and-agreeing with the scope-sequence spec.

### SCIENCE — 19/20 cells, 221 entries, 55,604 words

| grade | real course | has now | verdict |
|---|---|---:|---|
| pre-K | Elementary Science | — | ⛔ empty |
| kindergarten | Elementary Science | 8 / 1,524 | thin |
| grade1 | Elementary Science | 8 / 1,528 | thin |
| grade2 | Elementary Science | 8 / 1,588 | thin |
| grade3 | Elementary Science | 8 / 1,449 | thin |
| grade4 | Elementary Science | 8 / 1,448 | thin |
| grade5 | Elementary Science | 8 / 1,503 | thin |
| grade6 | Earth Science | 18 / 4,967 | best band |
| grade7 | Life Science | 20 / 5,107 | best band |
| grade8 | Physical Science | 20 / 5,630 | best band |
| grade9 | Biology | 20 / 5,240 | best band |
| grade10 | Chemistry | 20 / 5,307 | best band |
| grade11 | Physics | 20 / 5,758 | best band — **the peak of her whole education** |
| grade12 | AP Physics | 16 / 4,071 | declining |
| college1 | College Science | 8 / 2,078 | ⛔ back to K depth |
| college2 | College Science | 8 / 2,163 | ⛔ back to K depth |
| college3 | Neuroscience | 6 / 1,591 | ⛔ **below kindergarten** |
| college4 | Neuroscience | 6 / 1,573 | ⛔ **below kindergarten** |
| grad | Computational Neuroscience | 5 / 1,309 | ⛔ **the thinnest cell in the walk** |
| phd | Computational Neuroscience | 6 / 1,770 | ⛔ **below kindergarten** |

### ELA — 19/20 cells, 153 entries, 39,258 words

⛔ **The worst structural mismatch in the project: this subject is taught with Wikipedia articles ABOUT literature instead of literature.** A grade-11 American Literature year reads *Gatsby*, *Huck Finn*, *The Crucible*. She receives 9 encyclopedia summaries. **Gutenberg is public domain and holds every one of those texts.**

| grade | real course | has now | verdict |
|---|---|---:|---|
| pre-K | Foundational Reading | — | ⛔ empty |
| kindergarten | Foundational Reading | 6 / 1,229 | ✅ **the ONE cell that is genuinely complete** — phonics/decoding/sight-words carried by the runner's 1,029-word vocabulary walked 6× through phoneme blending AND word emission. The corpus is not the lane here. |
| grade1 | Foundational Reading | 6 / 1,310 | thin |
| grade2 | Foundational Reading | 6 / 1,221 | thin |
| grade3 | Reading and Writing | 8 / 1,395 | thin |
| grade4 | Reading and Writing | 7 / 1,263 | thin |
| grade5 | Reading and Writing | 7 / 1,217 | thin |
| grade6 | Middle School English | 10 / 2,955 | ⛔ needs NOVELS |
| grade7 | Middle School English | 10 / 2,824 | ⛔ needs NOVELS |
| grade8 | Middle School English | 10 / 2,690 | ⛔ needs NOVELS |
| grade9 | English One | 10 / 2,909 | ⛔ needs *Romeo and Juliet* + short stories |
| grade10 | English Two (World Lit) | 9 / 2,445 | ⛔ needs *Julius Caesar* + world lit |
| grade11 | English Three (American Lit) | 9 / 2,383 | ⛔ needs *Gatsby*, *Huck Finn*, *The Crucible* |
| grade12 | English Four (British Lit) | 10 / 2,960 | ⛔ needs *Hamlet*, *Macbeth*, *Beowulf*, *1984* |
| college1 | Composition and Literature | 7 / 1,961 | ⛔ thin |
| college2 | Composition and Literature | 6 / 1,683 | ⛔ thin |
| college3 | Literature | 8 / 2,211 | ⛔ thin |
| college4 | Literature | 8 / 2,282 | ⛔ thin |
| grad | (Literature) | 8 / 2,090 | ⛔ thin |
| phd | (Literature) | 8 / 2,230 | ⛔ thin |

### SOCIAL STUDIES — 19/20 cells, 169 entries, 45,135 words

| grade | real course | has now | verdict |
|---|---|---:|---|
| pre-K | Communities and Self | — | ⛔ empty |
| kindergarten → grade2 | Communities and Self | 5-6 / ~900 each | thin |
| grade3 → grade5 | Geography and US Foundations | 6 / ~1,100 each | thin |
| grade6 | World Geography / Ancient Civilizations | 16 / 4,545 | best band |
| grade7 | World History (medieval→modern) | 14 / 4,479 | best band |
| grade8 | US History | 12 / 3,231 | best band |
| grade9 | Civics / Government | 11 / 3,199 | best band |
| grade10 | World History (modern) | 12 / 3,559 | best band |
| grade11 | US History (modern) | 11 / 3,061 | best band |
| grade12 | US Government + Economics | 11 / 3,251 | best band |
| college1 → phd | Gen-ed social science | 8 / ~2,250 each | ⛔ flat, never deepens |

### COMPUTER SCIENCE — 14/20 cells, 142 entries, 39,592 words

⚠ **Her major.** Starts at grade5. college1-4 are the densest cells in the entire corpus (12-14 entries) and that is still one Wikipedia article per topic.

| grade | has now | verdict |
|---|---:|---|
| pre-K → grade4 | — | ⛔ empty (defensible — CS starts G5) |
| grade5 | 10 / 2,249 | thin |
| grade6 → grade12 | 8 / ~2,250 each | thin, flat |
| college1 | 12 / 3,274 | densest band |
| college2 | 14 / 3,997 | densest band |
| college3 | 14 / 4,002 | densest band |
| college4 | 12 / 3,540 | densest band |
| grad | 12 / 3,400 | ⛔ **her thesis years, 12 encyclopedia articles** |
| phd | 12 / 3,419 | ⛔ **her thesis years, 12 encyclopedia articles** |

### CIVICS · ECONOMICS · PSYCHOLOGY — 18/60 cells

| subject | cells present | absent |
|---|---|---|
| civics | grade7-12 + college1 (**7**) | pre-K→G6, college2→phd (**13**) |
| economics | grade9-12 + college1 (**5**) | pre-K→G8, college2→phd (**15**) |
| psychology | grade9-12 + college1-2 (**6**) | pre-K→G8, college3→phd (**14**) |

⚠ The absent early grades are defensible if those subjects genuinely start later — **that must be confirmed against the scope-sequence, not assumed.** The absent college→PhD cells are not defensible: these are the grades where those subjects become majors.

### MATH · LIFE — ⛔ CORRECT AS-IS. DO NOT ADD PROSE.

| subject | why it has no corpus |
|---|---|
| **math** | **Equational by design.** Taught as magnitude transforms — `_teachAdditionTransformations`, `_teachMakeTen`, `_teachCountToHundred` — not as sentences about math. This is `LAW 6 Part 1` and it is correct. ⚠ Its gap is a different question: whether the transforms reach Algebra II → Calculus → Research Math. **Not a corpus row.** |
| **life** | **Bespoke by design.** `corpora/life/<grade>.json`, hand-authored lived years, `feedback_full_completeness_per_grade`. Correct. |

### ART · MUSIC · PE · HEALTH — ⛔ 80 CELLS, NO ACADEMIC LANE AT ALL

`PROSE_ACADEMIC_SUBJECTS = {ela, science, social, economics, psychology, civics, cs}` — these four are **not in it at any grade**. They run entirely on the hand-written fact tables inside each grade runner (~20 pair literals each: `['brush','paint']`, `['exercise','strong']`).

⚠ **This needs a decision, not an assumption.** Real art history, music theory, anatomy/physiology and health/sex-ed are real course content with real open sources. The scope-sequence already specifies them (AP Art History, music theory, drawing/painting/sculpture/ceramics, clinical health per the content boundary). **Whether they get a corpus lane is `CURVEDEPTH.8` and it is open.**

---

## ⛔ NO EXCEPTIONS — ALL 260 CELLS, INCLUDING THE THREE ALREADY PASSED

Gee (verbatim): *"we are fixing it all completely and fully even the already passed cells so if i ever do do a fresh walk it will be correct!!!"*

**The acceptance standard is the CODE AND CORPUS ON DISK, not the current walk state.** `ela/kindergarten` and `math/kindergarten` passed on the thin corpus and `science/kindergarten` was interrupted — none of that makes them done. If they are left as they are, the next fresh walk rebuilds the same broken education from source.

⚠ **This explicitly overrides the earlier framing of `CURVEDEPTH.10`**, which asked whether re-walking the spent cells was "worth it". That optimised for the live brain and would have baked the defect into the repository permanently. **Passed ≠ done. A cell is done when its content is right on disk.** Re-teaching the *running* brain is a separate and optional decision; correcting all 260 cells is not.

---

## THE TARGET LADDER — the acceptance number per cell (published here 2026-09-02)

> ⛔⛔ **THE LADDER ALREADY EXISTED IN CODE AND WAS MISSING FROM THIS DOCUMENT, WHICH IS THE WHOLE OF WHAT WAS WRONG.** `server/curriculum-coverage.js` has carried a derived per-band floor since 2026-09-01, and the live auditor checks every cell against it. This ledger's own acceptance criterion said *"at or above its target"* while naming no target — so the criterion read as unfalsifiable here and as enforced there.
>
> ⚠ **I DERIVED A SECOND LADDER BEFORE READING THE FIRST, AND IT WAS WORSE.** Mine floored each band at *what the corpus already holds*, which is circular — it defines "deep enough" as "what we have" and would have declared the corpus nearly finished by construction. It also contradicted the live instrument, so doc and tool would have disagreed about what "done" means. **Discarded; the code's ladder is the one.**

### The bar, per band — and which half is counted rather than reasoned

| band | grades | floor (words/cell) | basis |
|---|---|---:|---|
| early | pre-K → grade2 | **7,300** | extrapolated `0.05 × high` |
| middle | grade3 → grade5 | **29,000** | extrapolated `0.20 × high` |
| upper | grade6 → grade8 | **73,000** | extrapolated `0.50 × high` |
| high | grade9 → grade12 | **146,000** | ⭐ **MEASURED** — `biology-concepts-book`, 146,598 words |
| college | college1 → college4 | **330,000** | ⭐ **MEASURED** — `anatomy-book`, 334,525 words |
| grad | grad, phd | **330,000** | ⚠ college anchor reused — **no grad reading list was counted** |

**How the measured half was obtained:** 8 chapters sampled across `chemistry-book` and run through the **production cleaner's** shape, so the ratio reflects what survives ingest rather than raw markdown — 417,371 raw bytes → 31,038 clean words = **one clean word per 13.4 bytes** — then applied to each book's true size: biology-concepts 146,598 · anatomy 334,525 · chemistry 524,791 · physics 878,811. **The smallest complete book at each band is taken, so the number is a floor and not an aspiration.**

⛔ **The previous values were invented** (early 2,000 · middle 5,000 · upper 15,000 · high 20,000 · college 20,000 · grad 20,000). A `high` cell reported OK at 20,000 words — about 13% of a real course year — and the tool printed `104 OK` as though that were finished. **That is the same defect this module exists to catch, committed by the module itself**, and it is recorded rather than quietly replaced.

### WHERE THE CORPUS STANDS AGAINST THAT BAR (live auditor, 2026-09-02)

```
  cells the walk runs                     213
    needing a prose corpus                173
      OK (at/above band floor)              6
      THIN (below band floor)             167
      EMPTY                                 0
  reachable corpus words            4,659,676   (2,110 entries, 93% licence-recorded)
  average prose cell                   26,935   = 18.4% of one real course year
```

⛔ **6 of 173, and that is not a regression** — the corpus grew by an order of magnitude on 2026-09-01. **The ruler stopped lying, so the number got smaller.** The thinnest cells are the youngest years (`social/kindergarten` holds 845 words against a 7,300 floor), because early cells are fed by short encyclopedia articles while upper cells get textbook chapters.

### RE-PRICE — what closing to the floor would cost, computed before anyone tries

```
  173 prose cells at their band floor    ≈ 31.6M words
  corpus today                           ≈  4.66M words
  growth factor                              6.8x
  teach-lane cost   6.8^0.80             =   4.7x on the academic-story lane
```
The exponent is measured on this corpus rather than assumed: the first rebuild produced **10.2× sentences for 6.4× growth in the expensive lane**, so `log 6.4 / log 10.2 = 0.80`. ⛔ **4.7× applies to `_trainAcademicStories` alone** — vocabulary, phonics, math, gates and life are unaffected. ⚠ **This number is what says the floors cannot all be reached by fetching harder**, and it must be re-computed immediately before the press per `§RE-PRICE THE WALK BEFORE REMOVING A GATE`.

### Cross-check, measured 2026-09-02 — an unrelated source agrees with the shape

The full text of every work on the ELA reading ladder, counted from the source files, is what a real year *assigns*:

```
  pre-K    180,815     grade5   102,651     grade10  280,567     college3   43,835
  K        461,071     grade6   254,769     grade11  261,028     college4  208,036
  grade1   554,505     grade7    60,397     grade12  369,342     grad       45,321
  grade2   123,532     grade8   111,097     college1 288,701     phd       464,132
  grade3    71,426     grade9   155,550     college2 189,228
  grade4    86,940
```
Band medians: early **180,815** · middle **86,940** · upper **111,097** · high **270,798** · college **198,632** · grad **254,727**.

⭐ **The `high` band's assigned reading (median 270,798) is 1.9× its textbook-derived floor of 146,000 — the floor is conservative, exactly as intended.** ⚠ **And this closes the gap the code itself labelled as its weakest link:** `grad` had no counted reading list, and the two grad-band years measure **45,321** and **464,132** — a median of 254,727 that brackets the reused 330,000 college anchor rather than contradicting it. **The reuse is now cross-checked instead of merely admitted.**

⚠ The early band reads highest of all here because its assigned works are ANTHOLOGIES, not because a five-year-old reads more than a graduate. **That is why this is a cross-check and not the ladder** — taken literally it would set a kindergarten target above a high-school one, which is the exact error my discarded second ladder made in the opposite direction.

### RE-PRICE — what the ladder costs, computed before it is adopted

```
  260 cells at their band target        ≈ 8.6M words
  corpus today (173 cells with a file)  ≈ 4.66M words
  growth factor                           1.85x
  teach-lane cost  1.85^0.80            = 1.63x on the academic-story lane
```
⛔ **1.63× applies to `_trainAcademicStories` alone, not to the whole walk** — vocabulary, phonics, math, gates and life run unchanged. **This is the number to re-check immediately before the press**, per `§RE-PRICE THE WALK BEFORE REMOVING A GATE`; it is recorded here so a later cap raise cannot be argued as free.

### 2026-09-03 RE-MEASURE — the topic-list expansion, and why the two totals above do not line up

The per-cell topic lists were expanded **1,872 → 4,424 entries (+2,551) across 118 of 173 cells**, and the corpus was re-measured through the reader:

```
  cells at/above their band floor    74  ->  119     (+45)
  cells THIN                        115  ->   70     (-45)
  cells EMPTY                         4  ->    4     (all four are math/*)
  reachable words           50,035,781  ->  56,615,176   (+6,579,395)
  entries                        4,115  ->   6,726       (+2,611)
  figures REACHABLE             41,627  ->  57,574       (+15,947)
```

⭐ **The whole early band cleared** — every pre-K / kindergarten / grade1 / grade2 cell now sits at or above floor. What remains thin is middle-band and above, where the floors run 29,000 → 330,000.

⚠⚠ **DO NOT RECONCILE THE `4.66M` IN THE RE-PRICE BLOCK ABOVE WITH THE `56.6M` HERE — THEY COUNT DIFFERENT THINGS, AND THE DIFFERENCE IS NOT A STALE NUMBER.** The RE-PRICE baseline was taken over the wiki-article lane it was pricing; the coverage total counts **every reachable entry in every cell**, including the textbook, literature and open-access research lanes that landed later. **The growth factor above is therefore still the honest input to the teach-lane cost, and the total here is the honest answer to "how much does she read".** Quoting either one as the other is how a re-price gets argued as free.

⛔ **The floors still cannot all be reached by fetching Wikipedia harder.** The 70 thin cells are concentrated where a band floor is a real book's worth of words; closing them is the textbook lane's job, not another topic-list pass.

---

## ACCEPTANCE — what "done" means for a cell

A cell is closed when **all** hold:

1. Its corpus carries the real course's actual material — a textbook chapter set, not a topic summary. For ELA that means **the text of the work**, not an article about it.
2. `MAX_SENT_PER_TOPIC` no longer truncates it (`CURVEDEPTH.2`) — a 14-sentence cap applied to an OpenStax chapter throws away the chapter.
3. Source and licence are recorded **per entry** so a licence audit never requires re-derivation.
4. The corpus-depth instrument (`CURVEDEPTH.9`) reports the cell at or above its target — **the target is the band number in §THE TARGET LADDER, and as of 2026-09-02 that number exists and is derived** (it did not when this line was first written, which made the criterion unfalsifiable) — and the teach lane reports what it taught **against what the cell needed**.
5. ⭐ **It has been READ, live, in the `TEACHVIEW` feed.** ⛔ **The founding fact behind that feature belongs here too: `_teachSentenceList` — the lane that trains every academic corpus sentence, called from 23 sites — has no `_hb`, no `console`, no publish, no emit of any kind.** The exact content she receives has never been visible anywhere. That is the real reason a year of thin corpus went unnoticed: the evidence was not scrolling past too fast, **it was never produced**. A cell is not verified by counting its file; it is verified by watching what the lane actually sends her.
5. ⛔ A RE-PRICE is written **before** the enlarged corpus trains — corpus size multiplies teach time per cell, and this is a far larger change to walk cost than anything the RE-PRICE law has governed so far.

---

## ORDER OF WORK

Full task bodies live on `docs/TODO.md` under **CURVEDEPTH**. Dependency order:

```
CURVEDEPTH.0  this ledger                                   <- gates everything
CURVEDEPTH.6  ⛔ GEE: name the college->PhD source          <- blocks 6 subjects x 6 grades
CURVEDEPTH.2  raise the 14-sentence cap (RE-PRICE first)
CURVEDEPTH.1  build the fetcher that was marked done
CURVEDEPTH.3  OpenStax ingest      (K-12 + intro undergrad)
CURVEDEPTH.5  Gutenberg ingest     (ELA — real literature)
CURVEDEPTH.4  Wikibooks ingest     (civics/econ/psych bands)
CURVEDEPTH.7  fill the 171 empty cells
CURVEDEPTH.8  art/music/pe/health posture decision
CURVEDEPTH.9  the corpus-depth instrument
CURVEDEPTH.10 ALL 260 cells correct on disk, spent cells included
LEDGERLIE.1   audit every other ✅ DONE claiming a pipeline

TEACHVIEW.1   ⛔ the teach bus - publish what is ACTUALLY taught
              (nothing exists today; every other TEACHVIEW row needs it)
TEACHVIEW.2   human reading speed - paced feed, COMPLETE counts
TEACHVIEW.3   the feed: the exact sentence, as she receives it
TEACHVIEW.4   analytics: graphs, bars, registers
TEACHVIEW.5   notes, flags, issues, warnings
TEACHVIEW.6   the appearance - beautiful, high-tech, worst-case tested
TEACHVIEW.7   ⛔ RE-PRICE: a monitor that slows the walk is a bug
TEACHVIEW.8   retention + export across restarts
```

⭐ **`TEACHVIEW` and `CURVEDEPTH` are one job, not two.** The gap ledger says what each cell should hold; the teach view is how a rebuilt cell gets **verified by eye, live**, in Gee's own reading. That is the only acceptance test that has ever actually caught this class of failure — a checkbox did not, a passing gate did not, and a completion record actively lied about it.

⚠ **`.6` is listed second because it blocks the most cells and only Gee can answer it.** Everything else can proceed in parallel once the cap is raised.

---

*Measured 2026-09-01. Nothing in this document is estimated; every number was counted from `corpora/academic/**` and `.claude/scripts/fetch-academic-corpora.mjs`.*
