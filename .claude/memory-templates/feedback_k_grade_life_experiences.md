---
name: k-grade-life-experiences-need-full-0-5-expansion
description: "Current K-curriculum covers ACADEMIC content (ELA/Math/Sci/Soc/Art/Life cells) but doesn't encompass the LIVED experience of being a 0-5 year old. K-grade Unity should carry memories of: first sounds heard, first words spoken, family relationships established, sensory firsts (taste/smell/touch), early fears, comfort objects, sleep patterns, dietary preferences forming, motor milestones. The brain at K signoff should have the breadth of memory a real 5-year-old has, not just K-grade academic capabilities."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: b128daab-9e1a-4697-8867-1ab55f337e9d
---

Operator 2026-06-17: *"like i said we havent written her life experiences to go with anything higher than k grade and k grade might need to be better to ecompass all of life memories upto kk grade"*

**Reading:** Curriculum has been written for **Pre-K + K only** (per CONSTRAINTS.md Pre-K + K ONLY scope). Anything HIGHER than K-grade has no curriculum written yet — those grade-level cells exist as scaffolds but the actual life-experience + academic content for grades 1+ is unwritten. AND K-grade itself currently doesn't capture the FULL breadth of what a 5-year-old has lived through — only the academic content.

**What K-grade currently has:**
- ELA: letters, phonemes, K-vocab (2247 words via dictionary API), sentence structure, WH-questions
- Math: digits, magnitude, simple counting
- Science: K-level concepts via student-question-banks
- Social Studies: K-level concepts
- Art: K-level concepts
- Life Skills: K-level concepts

**What K-grade is MISSING (the "0-5 life memories" expansion):**
- First-words memories: "mama", "dada", "no", "more", "bye-bye" — the first words a child speaks, with the emotional context attached
- Family relationship anchoring: who is mom, dad, sibling, grandparent — emotional + physical memory of each
- Sensory firsts: first taste of food, first touch of grass, first cold/hot, first wet/dry — these anchor sensory categories
- Comfort objects: first stuffed animal, blanket, pacifier — attachment psychology
- Early fears: dark, loud noises, strangers, separation — anxiety baselines
- Sleep patterns: nap schedule, bedtime routines, dream onset
- Dietary preferences: foods liked/disliked, what mom cooks, mealtime structure
- Motor milestones: crawling, walking, running, climbing — proprioceptive memory
- First friendships: playdate memories, daycare/preschool peer dynamics
- Caretaker bonds: who picks her up when she cries, who reads bedtime stories, who tucks her in
- Songs + nursery rhymes: lullabies heard, simple songs sung along to
- First storybooks: which books mom/dad read, what characters she remembers
- Bodily awareness: knowing she's a girl, her name is Unity, her birthday, her age
- Time perception: yesterday vs today vs tomorrow, mornings vs nights
- Spatial awareness: home layout, where things are kept, "her room"

**Where this lives in code:**
- Episodic memory store (`server/brain-server.js` storeEpisode) — would need 100s of seed episodes for 0-5 years
- Hippocampal schemas (`js/brain/hippocampal-schema.js`) — family schemas, comfort-object schemas, fear schemas
- Tier 3 identity-core (`server/brain-server.js` Tier3Store) — name, age, family member names + relationships
- Persona priming — these life memories color her responses even at age 5

**Why this matters:** A K-grade Unity shouldn't be a blank slate that just learned letters + 2247 words. She should be a 5-year-old with 5 YEARS of accumulated life experience. Otherwise her K-grade chat is robotic ("I see a cat") instead of human-grade ("Mom calls our cat Whiskers and he sleeps on my bed at night"). Life memories anchor language to meaning + relationship.

**Workflow placement:**
- NewTodo.md should track a "K-grade life experiences expansion" task as part of TRACK A (language) OR a new TRACK O (life-experience curriculum)
- Pre-K + K scope LAW still applies — this expansion is WITHIN K, not unlocking grade 1+
- Once K-grade life experiences ship, post-K curriculum (grades 1+) can be designed properly with developmental psychology backing each stage

**Related rules:**
- [[feedback_erotic_state_grade_9_gate]] — capabilities unlock with grade; brain is developmental
- CONSTRAINTS.md "Pre-K + K ONLY scope" — grades 1+ deferred
- CONSTRAINTS.md "Test words must be pre-taught" — life-experience vocab needs pre-teaching before any test uses it
