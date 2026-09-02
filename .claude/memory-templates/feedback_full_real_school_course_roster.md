---
name: feedback_full_real_school_course_roster
description: "Curriculum must use REAL per-grade course names (Algebra I, Biology) + the full roster incl. PE/Health/Music as distinct trained courses, and Unity must LEARN each class name + what it entails, retroactively across ALL grades"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 76a03535-080a-440b-9e18-e99af24e1fdc
---

Gee 2026-06-18, three linked messages:
1. *"in scool they dont call the classes math.. its geomenty algebra arthmatic ect ect based on grade level determines whats taught"* + *"same with other courses"* — the internal subject keys (`math`/`science`/`ela`/`social`/`art`) are coarse department families; the actual class has a REAL grade-specific NAME.
2. *"Unity need to know and learn the names of the classes she teaches got to know what PE is to be able to learn wtf it entails"* — the course names + what each entails must be TRAINED into her brain (real vocabulary + meaning binding), not just labels in docs/UI.
3. *"that addition needs to encompass fixed to all grades once we do them all even retoractively the prek k grades"* — the course-name learning must apply to EVERY grade retroactively, including pre-K and K.

**Gee chose (AskUserQuestion): "Real names + full roster"** — real course NAMES per grade AND PE, Health, Music built as DISTINCT trained courses (own runner + gate + content) every grade, K-first (K is the template, retrofit required).

**Implemented (curriculum.js + kindergarten.js):**
- `COURSE_NAMES[subject][grade]` + `courseNameFor(subject, grade)` — real names from `docs/CURRICULUM-SCOPE-SEQUENCE.md` (math+G8="Algebra I", science+G9="Biology", pe+K="Physical Education", music+G6="Band and Choir"...). Band fallback + title-case default.
- `COURSE_BLURB[subject]` + `_teachCourseIdentity(subject, grade, ctx)` — teaches the class name + what it entails ("pe is short for physical education; in physical education we learn moving our bodies and running and playing games"), vocab-first.
- `_cellRunner` now WRAPS `_cellRunnerRaw` and prepends `_teachCourseIdentity` to EVERY cell — every subject, every grade, pre-K→PhD, retroactively. 'life' skipped; try/catch guarded.
- PE/Music/Health introduced at kindergarten in `SUBJECTS_INTRODUCED_AT` (`subjectsForGrade('kindergarten')` → 9 subjects). K runners built (`runMusicKReal`/`runPeKReal`/`runHealthKReal`), real K content, self-gate via `_gateSubjectProduction`. K = template for these 3 tracks.

**How to apply:** propagate PE/Music/Health runners K→G1→G2→…→PhD in STRICT order ([[feedback_full_completeness_per_grade]]); `courseNameFor`/`COURSE_NAMES` rows already exist for all grades. Health body-safety stays age-appropriate/non-graphic per [[feedback_content_boundary_minor_sexual_excluded]]. Keep it uniform — shared helpers, K is the template.
