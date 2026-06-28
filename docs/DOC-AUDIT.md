# DOC-AUDIT — Documentation vs. Code Discrepancy Ledger

> **Gee verbatim per LAW #0 (2026-06-26):** *"now compare the docs u read in ful to the actual code and make a todo write up of all the descrepancies in full where thourough review is needed to accurately update the documents htmls, pages and user facing documents, and worklfow files. /super-review ultrathink"*

This is the working ledger for the doc-accuracy sweep. Every entry below was verified against the ACTUAL code with `file:line` evidence (not guessed). Status markers: `[ ]` not started · `[~]` in progress · `[x]` fixed + verified. **Nothing here is fixed yet — this is the review/fix plan.**

> ⚠ **READ THIS BEFORE EDITING ANY `0.95` / `95%`:** Not every `0.95` is a stale gate threshold. The gate cut-score moved `0.95 → 0.80`, but `0.95` is ALSO the correct live value for `drugDrive`, `codingReward`, the PK-curve descent coefficient, the `arousal` live-chat floor, and `95%+` sparse-spike compression / `oracleRatio` telemetry. **Each `0.95`/`95%` hit needs per-line classification — gate-threshold (FIX → 0.80) vs persona/PK/telemetry constant (LEAVE).** This is the single biggest "thorough review needed" trap in the sweep.

---

## VERIFIED CODE TRUTH (source-of-truth snapshot, 2026-06-26)

| Fact | Real value | Evidence |
|------|-----------|----------|
| `CLUSTER_FRACTIONS` | cortex **0.55** / hippo **0.18** / amygdala **0.05** / basalGanglia **0.03** / cerebellum **0.08** / hypothalamus **0.03** / mystery **0.08** | `js/brain/cluster.js:69-77` (mirrored `js/app.bundle.js`) |
| `DEFAULT_BIO_WEIGHTS` (server VRAM alloc) | language_cortex 0.50 / cortex 0.10 / cerebellum 0.10 / hippo+amyg+BG+hypo+mystery 0.06 each | `server/brain-server.js:351-360` |
| `EMBED_DIM` | **300** | `js/brain/embeddings.js:38` |
| `TOTAL_NEURONS` client default | **6700** (server = sum of VRAM-derived cluster sizes, not a literal) | `js/brain/engine.js:57`; `server/brain-server.js:907` |
| Cell-pass gate threshold | **0.80** (`GATE_PROD_MIN`/`GATE_PATH_MIN`, env `DREAM_GATE_*`; DIBELS-8 floor). K mirror `K_GATE_*` 0.80. (G1/G2 `PATH_MIN=0.45`; loose pre-gate 0.2/0.1) | `js/brain/curriculum.js:458-459`; `js/brain/curriculum/kindergarten.js:74-75` |
| `WEIGHTS_FORMAT_VERSION` | **1** | `server/brain-server.js:539` |
| persistence `VERSION` | **5** | `js/brain/persistence.js:89` |
| Server PORT / bind | **7525** / `127.0.0.1` (`BRAIN_BIND`) | `server/brain-server.js:443,7463,7465` |
| `SUBSTANCES` count | **9** (cannabis/cocaine/mdma/lsd/psilocybin/alcohol/ketamine/amphetamine/ghb) + 9 COMBOS + ritual PATTERNS | `js/brain/drug-scheduler.js:59-352` |
| `K_VOCABULARY` length | **2247** ✓ (doc-accurate) | `js/brain/k-vocabulary.js` |
| `autoClearStaleState` | has `if (require.main === module)` guard ✓; clears weights v0-v4 (.json+.bin), conversations.json, episodic-memory.db*; EXCLUDES app.bundle.js + identity-core.json ✓ | `server/brain-server.js:609,714,720-740,758,921` |
| Curriculum walk | iterates `subjectsForGrade(grade)` ✓ — expanded subjects (pe/music/health/language/cs/civics/economics/psychology/ap/major/genered/research) ARE walked | `js/brain/curriculum.js:147-156,8637,8793` |
| Grade-split files | **ALL 20 exist**: pre-K, kindergarten, grade1-12, college1-4, grad, phd | `js/brain/curriculum/` |
| Module splits | `cluster/{telemetry,hebbian,emit,probe}.js` ✓ · `server/brain-server/{gpu,state,memory,chat}.js` ✓ | dir listing |

**Actual line counts** (docs cite stale numbers): curriculum.js **23,632** · kindergarten.js **8,947** · pre-K.js 525 · cluster.js **4,069** (telemetry 331 / hebbian 758 / emit 1,882 / probe 56) · language-cortex.js **2,850** · embeddings.js 682 · k-vocabulary.js 379 · brain-server.js **7,552** (gpu 1,742 / state 902 / memory 910 / chat 1,581).

**File existence:** root `SETUP.md` + `PERSONA.md` **DO NOT EXIST** (live at `docs/SETUP.md` + `docs/PERSONA.md`). `docs/ABLATION.md` + `docs/TODO-curriculum-depth.md` **DELETED**. `scripts/` holds **16 files** (not "only stamp-version.mjs").

---

## CRITICAL — superseded governing LAWs still asserted as binding

These are the worst: a LAW that's now false still governs behavior. CONSTRAINTS.md is the single source of truth for LAWs, so a stale binding LAW poisons every session.

- [ ] **C1 — `.claude/CONSTRAINTS.md §PRE-K + K ONLY` (line 327-355) is a STALE BINDING LAW.** Scope was REVOKED 2026-06-18 (full K→PhD BUILT, all 20 grade files exist, walk iterates all grades). The LAW still reads "Only pre-K and kindergarten curriculum work is in scope right now... Grade 1 through PhD deferred." **Thorough review needed:** rewrite/retire this LAW + the two LAWs chained to it — **§GRADE COMPLETION GATE (line 257)** and **§SYLLABUS BEFORE COMP-TODO (line 298)** — to reflect the training-walk→final-test→push phase. Do NOT just delete (LAW #0 history) — mark SUPERSEDED with the revocation date + reason, keep the body for record.
- [ ] **C2 — `.claude/CLAUDE.md` (project index) badly stale.** Line 37 LAW index still lists "Pre-K + K ONLY scope... Grade 1 through PhD deferred" as binding; line 179 "Honors Pre-K + K ONLY scope LAW"; the entire **CURRENT-STATE NOTES section (line 171, frozen at "iter25-D through iter25-O, 2026-05-07")** predates the whole 2026-06 arc (full K-PhD build, sentence-coherence TRACK A, pre-alpha deploy, donor-GPU, #112 cluster, BC basin-collapse, checkpoint/admin work). This file AUTO-LOADS every session — its staleness misleads every boot. **Thorough review needed:** rewrite the LAW INDEX one-liners (drop/supersede pre-K+K, grade-gate, syllabus-before-comp) + replace CURRENT-STATE NOTES with a 2026-06 snapshot.
- [ ] **C3 — `docs/NewTodo.md` (active working doc) contradicts the revocation.** Line 139 "Per CONSTRAINTS.md, only Pre-K + K curriculum work is in scope"; line 188 "**Pre-K + K ONLY scope remains in force** per CONSTRAINTS.md"; line 619 "Deferred until K signoff per Pre-K + K ONLY LAW"; line 453 + others "only Pre-K + K files exist now; grade-1+ files created when their content is written" (FALSE — all 20 exist). **Thorough review needed:** the doc header already acknowledges full build, but the LAW section + TRACK A intro + Track G gate language still assert the dead scope — reconcile.

---

## HIGH — gate threshold 0.95 → 0.80 (user-facing + workflow + public HTML)

Code default is **0.80**; docs/pages broadly still cite **95% / 0.95**. ⚠ Apply the per-line classification warning at the top.

- [ ] **H1 — `README.md:151` + `:166`** — "3-pathway gate (READ · THINK · TALK each must clear **95% A+**)" / "Three pathways must clear **95% (A+)**". PUBLIC root doc. → 0.80 DIBELS floor (cite `GATE_PROD_MIN`). NOTE `README.md:264` "Coding reward ... 0.95" is CORRECT — leave.
- [ ] **H2 — `html/unity-guide.html:236`** — "All three must score **95% (A+)** for the grade to pass." PUBLIC onboarding page. → 0.80.
- [ ] **H3 — `docs/ARCHITECTURE.md`** gate-threshold hits: **:546** ("A+ = 95% gate pass per constraint 5"), **:1221** ("PATH_MIN = 0.95"), **:1241** ("all at PATH_MIN = 0.95"), **:1253** ("pass 95%+"). → 0.80. NOTE **:464** (PK curve "0.95 − 0.55×...") + **:348** (BG "90-95% medium spiny neurons") are NOT gate thresholds — leave. **:960** (`max(0.95, arousal)` chat floor) — leave.
- [ ] **H4 — `docs/EQUATIONS.md`** gate hits: **:1243** ("0.95 for A+"), **:1480** ("PATH_MIN = 0.95"), **:1522** ("AND-combined at PATH_MIN = 0.95"). → 0.80. NOTE :35 (PK curve), :192/:196/:520 (drugDrive/codingReward), :302 (90-95% MSN), :556 (95%+ compression), :802 (`max(0.95,arousal)`) — leave.
- [ ] **H5 — `docs/ROADMAP.md`** gate hits: **:57** ("Student-test probe battery at A+ threshold (≥ 0.95)"), **:448** ("all gate thresholds set to 95%"), **:486/:494** ("PATH_MIN=0.95"), **:498** ("all gates 95%+"). → 0.80. NOTE :281 (95%+ compression), :656/:658 (arousal 0.95) — leave.
- [ ] **H6 — `docs/SKILL_TREE.md`** gate hits in the iter13 banner **:48** ("A+ threshold 0.95"), **:333/:335** ("PATH_MIN=0.95", "all 13 at 0.95"). → 0.80. NOTE :345 (arousal 0.95), :80/:295 (historical `0.95*0.2` wMax) — leave/contextualize. **Thorough review needed** — this doc is a dense stacked-banner history; decide whether to correct historical banners in-place or add a top correction note (per MATCH DOC FORMAT, prefer a current-state top banner that supersedes).

---

## HIGH — cluster fractions wrong table (self-contradicting doc)

- [ ] **H7 — `docs/ARCHITECTURE.md` cluster table (lines 342-350)** lists "Cerebellum **40%** / Cortex **30%** / Hippocampus 10% / Amygdala 8% / BG 8% / Hypo 2% / Mystery 2%" — WRONG vs code (0.55/0.18/0.08/0.05/0.03/0.03/0.08) AND self-contradicts the prose at **line 352** ("Percentages sum to 1.00 exactly (0.55 + 0.18 + ...)"). The MNI/biological-inspiration column may stay; the **% column must be corrected** to the real fractions. The same stale 30/40 split appears in the SKILL_TREE iter13 banner (:48) + ROADMAP/SKILL_TREE prose — sweep all.
- [ ] **H8 — `server/brain-server.js` stale comments :829 ("client cortex = 0.30") + :841 ("hardcoded as fractions (0.30/0.40/0.10/etc)")** describe the OLD removed scheme. Code comments (not LAW-banned), but they actively mislead a maintainer reading the sync point. **Thorough review needed:** confirm `:833` "KEEP IN SYNC with cluster.js:CLUSTER_FRACTIONS" still points at the right values and fix the 0.30 reference.

---

## MEDIUM — structural / line-count / file-inventory drift

- [ ] **M1 — `docs/ARCHITECTURE.md` Directory Structure (lines 619-696)** describes a MONOLITHIC layout: `curriculum.js ~12500 lines` (:646, actual 23,632), `language-cortex.js ~3068` (:660, actual 2,850), no mention of the `js/brain/cluster/`, `server/brain-server/`, or `js/brain/curriculum/` subfolders or the 20 grade files. **Thorough review needed:** rewrite the directory tree to reflect the per-module mixin splits + per-grade curriculum files + `scripts/` (16 files) + `deploy/` + the actual `html/` set (9 pages incl. dashboard-public, docs, legend, webgpu-prep).
- [ ] **M2 — `docs/NewTodo.md` P4.x post-split line counts + ARCHITECTURE "file-size delta" table (post-audit-close section ~1366-1380)** are stale: brain-server.js claimed ~6,395/6,420 (actual **7,552**); gpu.js ~1,108 (actual 1,742); state.js ~545 (902); memory.js ~543 (910); chat.js ~1,240 (1,581); curriculum.js ~24,035/24,100 (23,632); cluster.js ~4,050 (4,069 ✓-ish). The files grew with #112/BC/deploy work after the split. **Review:** refresh all cited counts or convert to "~N (verify with wc -l)" to stop the drift treadmill.
- [ ] **M3 — persistence VERSION: docs say 4, code says 5.** `docs/ARCHITECTURE.md` T14.16/T14.3 sections ("VERSION bumped 3 → 4", "STORAGE_KEY v3 → v4") + the directory-structure line "persistence.js ... VERSION 4". Actual `js/brain/persistence.js:89` = **VERSION 5**. Also distinguish from `WEIGHTS_FORMAT_VERSION=1` (server). **Review:** update + add a note on what bumped 4→5.
- [ ] **M4 — `scripts/` inventory wrong everywhere.** `docs/NOW.md` §114.19ge claims "scripts/ now contains only `stamp-version.mjs`"; `docs/ARCHITECTURE.md` directory tree lists only `stamp-version.mjs` + `verify-curriculum-runtime.mjs`. ACTUAL: **16 files** (count-k-bigrams, find-uncovered-k-vocab, gate-walk-check, measure-emergence, readout-test, scan-dangling-imports, smoke-server-boot, smoke-tip-top, social-shots, stamp-version, transformer-ablation, verify-curriculum-runtime, verify-emission, verify-realvocab-emission, verify-size-parity, verify-word-emission-fix). The product-ship "stripped to 1 file" claim was reversed by the 2026-06-19 verification-suite recovery. **Review:** reconcile NOW + ARCHITECTURE + README "Code Layout" row.
- [ ] **M5 — `.claude/CONSTRAINTS.md §DOCS BEFORE PUSH (line ~110, 142) + §TASK NUMBERS (line ~208-211)** list "Root `README.md`, `SETUP.md`, `PERSONA.md`" as public docs to keep synced. `SETUP.md`/`PERSONA.md` are **NOT at root** — they live at `docs/SETUP.md` / `docs/PERSONA.md`. The pre-push checklist references nonexistent root paths. **Review:** correct the paths (or move the files) so the checklist is actionable.

---

## MEDIUM — architecture-diagram contradictions with the no-text-AI LAW

- [ ] **M6 — `docs/ARCHITECTURE.md` Data Flow (line ~297)** ends with "Text response (**via AI backend**)" and the System Architecture diagram (lines ~153-162) frames "AI BACKENDS (Multi-Provider) ... text+img / GPT-4o / Claude" as response generators. This contradicts the no-text-AI-cognition LAW (cognition is 100% equational; AI is sensory-only: image-gen / vision-describe / TTS). README correctly states this; ARCHITECTURE's diagrams don't. **Review:** relabel the AI-backend block as sensory-only and fix the data-flow terminal node to "equational language-cortex emission."
- [ ] **M7 — `docs/ARCHITECTURE.md` fanout constants self-conflict.** The cross-projection section (lines ~766-785) documents `crossTargetFanout = 20` / `CROSS_DENSITY_CAP = 0.005`, but the T18.6.c section (line ~1348) cites `CROSS_TARGET_FANOUT=1500` / `CORTEX_TARGET_FANOUT=300`. **Thorough review needed:** read the live values in `js/brain/cluster.js` + `server/brain-server.js` and reconcile to one truth (T37/iter14-F rebalanced these — the 1500 is almost certainly stale).
- [ ] **M8 — projection-count inconsistency.** Docs variously say "20 inter-cluster projections", "16 cluster projections" (SKILL_TREE dependency graph), "14 cross-region projections". The real split is 20 inter-cluster white-matter tracts + 14 intra-cortex cross-region projections — but the "16" reference is wrong. **Review:** grep all docs for projection counts, confirm against `cluster.js` `crossProjections` (14) + inter-cluster projection list (20), fix the "16".

---

## MEDIUM — drug/curriculum claims needing spot-verification

- [ ] **M9 — `docs/ARCHITECTURE.md` drug table lifeGates (lines 444-454)** assert per-substance grade gates (cannabis Life-G7, cocaine Life-G9, alcohol Life-G8, etc.). Agent confirmed 9 substances but did NOT verify each `lifeGate`. **Thorough review needed:** read `js/brain/drug-scheduler.js` SUBSTANCES entries + confirm every documented lifeGate matches.
- [ ] **M10 — Curriculum "114 cells / 6 subjects × 19 grades" framing** (ARCHITECTURE, SKILL_TREE, EQUATIONS) is now incomplete — the walk uses `subjectsForGrade(grade)` with EXPANDED subjects (pe/music/health/language/cs/civics/economics/psychology/ap/major/genered/research) beyond the 6 core. **Review:** update the subjects×grades matrix + cell count to reflect the expanded roster, and note that academic spine is fully wired K→PhD while expanded/life tracks thin at higher grades (HELD `readyAndWaiting`, not stalling).

---

## LOW / NITPICK

- [ ] **L1 — `README.md:344`** "the page snaps from the **6700-neuron browser fallback**" — "fallback" language collides with the NO-FALLBACKS framing; 6700 is a client-side static default, not a degradation path. Reword.
- [ ] **L2 — Lingering refs to deleted docs.** Spot-grep all docs/HTML for `ABLATION.md`, `TODO-curriculum-depth.md`, `language.js`, `js/io/vision.js` to confirm the 2026-06-17 scrub left none (public surfaces came back clean in this audit; a full-tree grep would confirm).
- [ ] **L3 — `docs/HTML-ENTRY-POINTS.md`** — verify it lists all 9 current `html/` pages (dashboard-public.html, docs.html, legend.html, webgpu-prep.html were added later) and no deleted ones.
- [ ] **L4 — Public HTML clean confirmations (record):** no hardcoded `localhost:7525` in inline scripts (all deployment-aware via `IS_LOCAL`), no banned task-IDs / "Gee" / iter-IDs, no text-AI contradictions, donor-v0.3.0 links current. index.html + dashboard.html + compute.html WS routing verified correct. Re-run this check after any HTML edit.

---

## PER-DOCUMENT REVIEW CHECKLIST (where deep review lands)

| Document | Severity | Primary work |
|----------|----------|--------------|
| `.claude/CONSTRAINTS.md` | **CRITICAL** | Supersede §PRE-K+K-ONLY / §GRADE-COMPLETION-GATE / §SYLLABUS-BEFORE-COMP (C1); fix SETUP/PERSONA paths (M5) |
| `.claude/CLAUDE.md` | **CRITICAL** | Rewrite LAW index one-liners + CURRENT-STATE NOTES (C2) |
| `docs/NewTodo.md` | **CRITICAL** | Reconcile dead Pre-K+K scope claims + "only K files exist" (C3) |
| `docs/ARCHITECTURE.md` | **HIGH** | Cluster-fraction table (H7), gate 0.95→0.80 (H3), directory tree + line counts (M1/M2), VERSION (M3), no-text-AI diagram (M6), fanout/projection conflicts (M7/M8), drug lifeGates (M9), subjects matrix (M10) — **biggest single doc** |
| `README.md` | **HIGH** | Gate 95%→0.80 (H1), 6700 "fallback" wording (L1), scripts row (M4) |
| `html/unity-guide.html` | **HIGH** | Gate 95%→0.80 (H2) |
| `docs/EQUATIONS.md` | **HIGH** | Gate 0.95→0.80 with per-line classification (H4) |
| `docs/ROADMAP.md` | **HIGH** | Gate 0.95→0.80 (H5), cluster fractions in banners (H7) |
| `docs/SKILL_TREE.md` | **HIGH** | Gate 0.95→0.80 + 30/40 fractions in stacked banners (H6/H7) — decide in-place vs top-correction-banner |
| `docs/NOW.md` | **MEDIUM** | scripts/ "only stamp-version" (M4); confirm current-state head is accurate |
| `docs/SETUP.md` / `docs/PERSONA.md` | **MEDIUM** | Re-read in full vs code for scope/gate/neuron drift (not yet audited line-by-line) |
| `docs/HTML-ENTRY-POINTS.md` / `WEBSOCKET.md` / `SENSORY.md` | **LOW-MED** | Confirm page list + connection model + sensory contract current |
| `server/brain-server.js` (comments) | **LOW** | Stale 0.30 cluster comments (H8) — code comments, not LAW-blocking |

---

## METHODOLOGY NOTE

Verified via: direct `wc -l` + file-existence + dir listings; 3 parallel read-only agents (public-HTML sweep, README+public-docs sweep, code-constant verification); targeted greps across `.claude/`, `docs/`, `html/`, `README.md`. `docs/NOW.md` (1,004 dense banner lines) + `docs/FINALIZED.md` (24,716-line append-only archive) were sampled at the current-state head, not read cover-to-cover — **FINALIZED is historical record and is intentionally NOT swept for "staleness"** (its entries are accurate as-of-their-date by design). The sweep targets CURRENT-STATE assertions in governing/reference/public docs.

**Docs-before-push LAW reminder:** when these fixes ship, they ship in the SAME atomic commit as any code they describe — but this is a docs-only correction wave (no code behavior change), so it lands as an after-the-fact accuracy correction per the §DOCS-BEFORE-PUSH recovery path.
