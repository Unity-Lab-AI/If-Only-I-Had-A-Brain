// fetch-academic-corpora.mjs — HYBRID academic-depth corpus builder.
//
// Gee 2026-06-18 chose the hybrid: feed prose-academic subjects (science,
// social, ela, economics, psychology, civics) from openly-licensed REAL
// curriculum content, downloaded ONCE into corpora/academic/<subject>/<grade>.json,
// then trained via curriculum._trainAcademicStories (mirror of life/coding).
// Math stays equational; the lived year stays hand-authored/bespoke.
//
// SOURCE: Simple English Wikipedia (CC-BY-SA), plain-text extracts per topic.
// Topics are curated to each grade's REAL course per docs/CURRICULUM-SCOPE-SEQUENCE.md.
// Cleaned: strip refs/headers/non-ASCII, sentence-segment, length-bound, cap per topic.
//
// RUN:  node .claude/scripts/fetch-academic-corpora.mjs            (all)
//       node .claude/scripts/fetch-academic-corpora.mjs science    (one subject)
//       node .claude/scripts/fetch-academic-corpora.mjs science grade9
// Network required. Re-runnable / idempotent (overwrites). Node 18+ (built-in fetch).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'corpora', 'academic');

const MAX_SENT_PER_TOPIC = 14;
const SENT_MIN = 30, SENT_MAX = 240;
const UA = 'UnityBrainCurriculum/1.0 (educational research; openly-licensed content)';

// (subject, grade) → real-course Wikipedia topics (scope-sequence aligned).
// Each cell carries the FULL real-grade topic spread (not a thin sample) so the
// trained prose runs the actual standards band G6->G12 unbroken. Math stays
// equational; the lived year stays bespoke. Re-run the ingest after editing.
const TOPICS = {
  science: {
    // Kindergarten — observing the world (concrete everyday objects)
    kindergarten: ['Animal', 'Plant', 'Water', 'Sun', 'Weather', 'Tree', 'Color', 'Season'],
    // Grade 1 — living things + sky
    grade1: ['Season', 'Rain', 'Cloud', 'Sky', 'Insect', 'Fish', 'Bird', 'Plant'],
    // Grade 2 — habitats + states of matter
    grade2: ['Habitat', 'Life cycle', 'Magnet', 'Solid', 'Liquid', 'Gas', 'Plant', 'Animal'],
    // Grade 3 — ecosystems + simple physical science
    grade3: ['Ecosystem', 'Food chain', 'Rock (geology)', 'Soil', 'Weather', 'Energy', 'Force', 'Matter'],
    // Grade 4 — energy, space, simple machines
    grade4: ['Solar System', 'Planet', 'Electricity', 'Magnetism', 'Sound', 'Light', 'Energy', 'Ecosystem'],
    // Grade 5 — cells, matter, systems (bridge to G6)
    grade5: ['Cell (biology)', 'Matter', 'Chemical reaction', 'Water cycle', 'Ecosystem', 'Force', 'Energy', 'Solar System'],
    // Grade 6 — Earth & Space Science
    grade6: ['Earth', 'Plate tectonics', 'Rock (geology)', 'Weather', 'Water cycle', 'Volcano', 'Earthquake', 'Mineral', 'Erosion', 'Atmosphere of Earth', 'Solar System', 'Planet', 'Moon', 'Ocean', 'Climate', 'Fossil', 'Soil', 'Natural disaster'],
    // Grade 7 — Life Science
    grade7: ['Cell (biology)', 'Ecosystem', 'Photosynthesis', 'Food chain', 'Organ (anatomy)', 'Bacteria', 'Genetics', 'Reproduction', 'Evolution', 'Microorganism', 'DNA', 'Mitosis', 'Human body', 'Nervous system', 'Circulatory system', 'Digestion', 'Virus', 'Plant', 'Animal', 'Fungus'],
    // Grade 8 — Physical Science
    grade8: ['Matter', 'Atom', 'Energy', 'Force', 'Chemical reaction', 'Motion', 'Wave', 'Electricity', 'Magnetism', 'Density', 'Chemical element', 'Molecule', 'Periodic table', 'Acid', 'Base (chemistry)', 'Heat', 'Light', 'Sound', 'Gravity', 'Speed'],
    // Grade 9 — Biology
    grade9: ['Cell (biology)', 'DNA', 'Evolution', 'Natural selection', 'Photosynthesis', 'Genetics', 'Ecosystem', 'Mitosis', 'Protein', 'Cellular respiration', 'Cell membrane', 'Chromosome', 'Gene', 'Enzyme', 'Bacteria', 'Virus', 'Homeostasis', 'Biome', 'Cell nucleus', 'Meiosis'],
    // Grade 10 — Chemistry
    grade10: ['Atom', 'Periodic table', 'Chemical bond', 'Chemical reaction', 'Acid', 'Molecule', 'Electron', 'Chemical element', 'Ion', 'Chemical compound', 'Chemical equation', 'Mole (unit)', 'Solution', 'Gas', 'Liquid', 'Solid', 'Metal', 'Nonmetal', 'Redox', 'PH'],
    // Grade 11 — Physics
    grade11: ['Force', 'Energy', 'Momentum', 'Electricity', 'Magnetism', 'Wave', 'Thermodynamics', 'Gravity', 'Velocity', 'Acceleration', 'Newton\'s laws of motion', 'Kinetic energy', 'Potential energy', 'Friction', 'Pressure', 'Power (physics)', 'Electric current', 'Voltage', 'Frequency', 'Light'],
    // Grade 12 — Anatomy / Physiology & Environmental Science
    grade12: ['Human body', 'Nervous system', 'Circulatory system', 'Respiratory system', 'Immune system', 'Human skeleton', 'Muscle', 'Brain', 'Ecology', 'Climate change', 'Biodiversity', 'Pollution', 'Ecosystem', 'Carbon cycle', 'Renewable energy', 'Endocrine system'],
    // College 1 — general science gen-ed (scientific method + the disciplines)
    college1: ['Scientific method', 'Biology', 'Chemistry', 'Physics', 'Scientific theory', 'Experiment', 'Hypothesis', 'Observation'],
    // College 3 — Neuroscience begins (toward the brain-sim research)
    // CORPUSGAP (2026-08-31) — C2 was the one hole in an otherwise complete
    // science spine (18 of 19 declared). It is the bridge year: general science
    // hands off to the neuroscience track C3/C4/grad/phd already carry.
    college2: ['Cell biology', 'Genetics', 'Organic chemistry', 'Thermodynamics', 'Electromagnetism', 'Molecular biology', 'Physiology', 'Biochemistry'],
    college3: ['Neuroscience', 'Neuron', 'Brain', 'Nervous system', 'Cognition', 'Cerebral cortex'],
    // College 4 — Neuroscience deepens
    college4: ['Neuroscience', 'Cerebral cortex', 'Synapse', 'Neural network', 'Memory', 'Action potential'],
    // Grad — Computational neuroscience (the brain-simulation domain)
    grad: ['Computational neuroscience', 'Neural network', 'Neuron', 'Synaptic plasticity', 'Hebbian theory'],
    // PhD — Computational neuroscience research (she builds a brain)
    phd: ['Computational neuroscience', 'Hebbian theory', 'Spiking neural network', 'Neural coding', 'Synaptic plasticity', 'Cerebral cortex'],
  },
  social: {
    // Kindergarten — self, family, community
    // ⚠ `Rule` was a DISAMBIGUATION PAGE and could never have worked. `CORPUSGAP.7`
    //   (2026-08-31): en gave 0 usable sentences from a 3,541-char extract and
    //   simple gave 2 — because `clean()` correctly drops `may refer to` lines,
    //   which is the entire body of a disambiguation page. It survived four
    //   ingest passes looking like a throttle casualty. ⭐ `Social norm` is the
    //   article the cell actually wanted — simple-wiki opens *"social norms are
    //   the unwritten rules of a social group or culture"*, 11 sentences, right
    //   reading level. **A title that resolves is not a title that has prose.**
    kindergarten: ['Family', 'Community', 'School', 'Friendship', 'Social norm'],
    // Grade 1 — neighborhood + belonging
    grade1: ['Neighborhood', 'Community', 'Map', 'Holiday', 'Family'],
    // Grade 2 — community, maps, the wider world
    grade2: ['Community', 'Map', 'Continent', 'Country', 'Citizen', 'Transport'],
    // Grade 3 — local government + geography
    grade3: ['Community', 'Geography', 'Map', 'Government', 'Native Americans in the United States', 'Continent'],
    // Grade 4 — US states + regions + exploration
    grade4: ['United States', 'State (polity)', 'Geography', 'Region', 'Exploration', 'Native Americans in the United States'],
    // Grade 5 — early US history (bridge to G6 ancient civ)
    grade5: ['United States', 'American Revolution', 'Thirteen Colonies', 'Christopher Columbus', 'Exploration', 'Colonialism'],
    // Grade 6 — Ancient Civilizations / World Geography
    grade6: ['Ancient Egypt', 'Ancient Greece', 'Ancient Rome', 'Mesopotamia', 'Geography', 'Continent', 'Civilization', 'River', 'Ancient China', 'Ancient India', 'Maya civilization', 'Inca Empire', 'Aztecs', 'Pharaoh', 'Pyramid', 'Empire'],
    // Grade 7 — Medieval to Early Modern World History
    grade7: ['Middle Ages', 'Renaissance', 'Roman Empire', 'Age of Discovery', 'Black Death', 'Feudalism', 'Crusades', 'Byzantine Empire', 'Mongol Empire', 'Ottoman Empire', 'Reformation', 'Trade route', 'Knight', 'Castle'],
    // Grade 8 — US History to 1900
    grade8: ['American Revolution', 'United States Constitution', 'American Civil War', 'Declaration of Independence', 'Industrial Revolution', 'Reconstruction era', 'Thirteen Colonies', 'George Washington', 'Abraham Lincoln', 'Slavery', 'Manifest destiny', 'Westward expansion'],
    // Grade 9 — Civics & Geography
    grade9: ['Government', 'Democracy', 'United States Constitution', 'Separation of powers', 'Citizenship', 'Election', 'Federalism', 'United States Bill of Rights', 'Supreme Court of the United States', 'United States Congress', 'Branches of government'],
    // Grade 10 — Modern World History
    grade10: ['World War I', 'World War II', 'Cold War', 'Imperialism', 'Russian Revolution', 'Great Depression', 'French Revolution', 'Industrial Revolution', 'Nationalism', 'Colonialism', 'United Nations', 'The Holocaust'],
    // Grade 11 — Modern US History
    grade11: ['Great Depression', 'World War II', 'Civil rights movement', 'Cold War', 'Vietnam War', 'New Deal', 'Progressive Era', 'World War I', 'Roaring Twenties', 'Civil Rights Act of 1964', 'Watergate scandal'],
    // Grade 12 — US Government & Economics / Globalization
    grade12: ['Federal government of the United States', 'Supreme Court of the United States', 'United States Congress', 'President of the United States', 'Political party', 'Democracy', 'Foreign policy', 'Globalization', 'United Nations', 'Rule of law', 'Constitution'],
    // ⛔ CORPUSGAP (2026-08-31) — SOCIAL IS A CORE SUBJECT AND THE MAP STOPPED
    //   AT GRADE 12. The scope-sequence's own line says the grad/PhD roster is
    //   "ela math science social art life major research" — social runs the
    //   whole way — so all SIX college-and-above cells were undeclared and
    //   trained on nothing. The scope-sequence names the band: "Gen-ed social
    //   science: psychology, sociology, ethics electives".
    // College 1 — the social sciences, introduced
    college1: ['Sociology', 'Anthropology', 'Social science', 'Political science', 'Ethics', 'Culture', 'Society', 'Psychology'],
    // College 2 — how groups actually work
    college2: ['Social psychology', 'Socialization', 'Social class', 'Social norm', 'Religion', 'Family', 'Community', 'Social group'],
    // College 3 — the large-scale forces
    college3: ['Globalization', 'Urbanization', 'Human migration', 'Social inequality', 'Public health', 'Natural environment', 'Human rights', 'Poverty'],
    // College 4 — how social claims are actually made and checked
    college4: ['Social research', 'Statistics', 'Survey methodology', 'Ethnography', 'Case study', 'Qualitative research', 'Quantitative research', 'Bias'],
    // Grad — theory and the philosophy under the method
    grad: ['Social theory', 'Critical theory', 'Structuralism', 'Philosophy of science', 'Epistemology', 'Ethics', 'Sociology', 'Anthropology'],
    // PhD — the discipline looking at itself
    phd: ['Philosophy of social science', 'Research ethics', 'Interdisciplinarity', 'Science and technology studies', 'Knowledge', 'Academic discipline', 'Scholarly method', 'Objectivity (philosophy)'],
  },
  economics: {
    // Grade 9 — Personal & Intro Economics
    grade9: ['Economics', 'Supply and demand', 'Scarcity', 'Money', 'Inflation', 'Market (economics)', 'Opportunity cost', 'Trade', 'Goods and services', 'Consumer', 'Profit (economics)', 'Budget', 'Saving', 'Bank'],
    // Grade 10 — Microeconomics
    grade10: ['Microeconomics', 'Supply and demand', 'Market (economics)', 'Competition (economics)', 'Price', 'Monopoly', 'Demand', 'Supply (economics)', 'Cost', 'Revenue', 'Profit (economics)', 'Market structure'],
    // Grade 11 — Macroeconomics
    grade11: ['Macroeconomics', 'Gross domestic product', 'Inflation', 'Unemployment', 'Money', 'Tax', 'Recession', 'Economic growth', 'Fiscal policy', 'Monetary policy', 'Central bank', 'Interest rate'],
    // Grade 12 — AP / International Economics
    grade12: ['International trade', 'Exchange rate', 'Globalization', 'Comparative advantage', 'Stock market', 'Investment', 'Economic system', 'Capitalism', 'Free market', 'Gross domestic product', 'Economic growth'],
    // College 1 — Principles of Economics (gen-ed)
    college1: ['Economics', 'Microeconomics', 'Macroeconomics', 'Market (economics)', 'Supply and demand', 'Gross domestic product', 'Inflation', 'Economic system'],
  },
  psychology: {
    // Grade 9 — Intro Psychology
    grade9: ['Psychology', 'Memory', 'Emotion', 'Learning', 'Brain', 'Behavior', 'Perception', 'Mind', 'Consciousness', 'Sleep', 'Dream', 'Intelligence', 'Motivation', 'Sensation'],
    // Grade 10 — Cognitive & Developmental
    grade10: ['Cognition', 'Personality psychology', 'Social psychology', 'Developmental psychology', 'Motivation', 'Classical conditioning', 'Operant conditioning', 'Reinforcement', 'Attachment theory', 'Self-esteem', 'Identity (social science)'],
    // Grade 11 — Abnormal / Clinical
    grade11: ['Mental disorder', 'Major depressive disorder', 'Anxiety', 'Psychotherapy', 'Stress (biology)', 'Cognitive bias', 'Bipolar disorder', 'Schizophrenia', 'Phobia', 'Psychiatry', 'Coping'],
    // Grade 12 — AP Psychology capstone
    grade12: ['Neuron', 'Nervous system', 'Brain', 'Cognition', 'Perception', 'Learning', 'Memory', 'Personality psychology', 'Consciousness', 'Behaviorism', 'Sigmund Freud'],
    // College 1 — Cognitive science (gen-ed, toward the brain-sim interest)
    college1: ['Cognitive science', 'Cognitive psychology', 'Neuroscience', 'Perception', 'Memory', 'Attention', 'Cognition'],
    // College 2 — Biopsychology / neuroscience bridge
    college2: ['Behavioral neuroscience', 'Neuron', 'Brain', 'Nervous system', 'Neurotransmitter', 'Synapse'],
  },
  civics: {
    // Grade 7 — Foundations of Government
    grade7: ['Government', 'Democracy', 'Constitution', 'Law', 'Citizenship', 'Voting', 'Rights', 'Justice', 'Court', 'Election', 'Political party', 'Citizen'],
    // Grade 8 — US Constitution & Federalism
    grade8: ['United States Constitution', 'United States Bill of Rights', 'Federalism', 'Separation of powers', 'Checks and balances', 'Constitutional amendment', 'Supreme Court of the United States', 'United States Congress', 'President of the United States'],
    // Grade 9 — Rights & Participation
    grade9: ['Government', 'Democracy', 'Separation of powers', 'Civil and political rights', 'Election', 'Voting', 'Political party', 'Jury', 'Rule of law', 'Civil rights movement'],
    // CORPUSGAP (2026-08-31) — G10 and G11 were the hole in this band. Civics
    // runs G7->G12 per SUBJECTS_INTRODUCED_AT/RETIRED_AT, and the map declared
    // 7, 8, 9, 12 — so two of the six offered grades had no corpus at all and
    // `_trainAcademicStories` was a silent no-op for them.
    // Grade 10 — Law, courts and the citizen
    grade10: ['Law', 'Court', 'Judiciary', 'Jury', 'Criminal law', 'Civil law (legal system)', 'Due process', 'Local government', 'Legislature', 'Trial', 'Lawyer', 'Prison'],
    // Grade 11 — Rights, policy and participation
    grade11: ['Civil liberties', 'United States Bill of Rights', 'Judicial review', 'Public policy', 'Political campaign', 'Lobbying', 'Freedom of speech', 'Freedom of religion', 'Suffrage', 'Referendum', 'Interest group', 'Taxation'],
    // Grade 12 — Government (capstone)
    grade12: ['Federal government of the United States', 'Supreme Court of the United States', 'United States Congress', 'President of the United States', 'Judiciary', 'Rule of law', 'Constitution', 'Democracy', 'Federalism'],
    // College 1 — American Government (gen-ed)
    college1: ['Government', 'Politics', 'Democracy', 'Constitution', 'Rule of law', 'Separation of powers', 'Civil and political rights', 'Public policy'],
  },
  ela: {
    // Kindergarten — letters, sounds, first stories
    kindergarten: ['Alphabet', 'Letter (alphabet)', 'Word', 'Rhyme', 'Story', 'Vowel'],
    // Grade 1 — words to sentences
    grade1: ['Sentence (linguistics)', 'Noun', 'Verb', 'Story', 'Vowel', 'Consonant'],
    // Grade 2 — parts of speech + paragraphs
    grade2: ['Sentence (linguistics)', 'Noun', 'Verb', 'Adjective', 'Paragraph', 'Punctuation'],
    // Grade 3 — grammar + fiction/nonfiction
    grade3: ['Paragraph', 'Grammar', 'Noun', 'Verb', 'Adjective', 'Adverb', 'Fiction', 'Nonfiction'],
    // Grade 4 — composition + figurative language
    grade4: ['Essay', 'Grammar', 'Metaphor', 'Simile', 'Paragraph', 'Fiction', 'Poetry'],
    // Grade 5 — theme + narrative craft (bridge to G6+ lit)
    grade5: ['Essay', 'Theme (narrative)', 'Metaphor', 'Narrative', 'Poetry', 'Grammar', 'Figure of speech'],
    // Grade 9 — English I (intro lit + craft)
    // CORPUSGAP (2026-08-31) — G6-G8 is "Middle ELA" in the scope-sequence and
    // the map jumped G5 -> G9, so the three middle-school years trained on no
    // prose at all. ELA is a CORE subject: it is offered at every grade, so an
    // undeclared cell here is a hole in the spine, not an optional elective.
    // Grade 6 — novels, poetry intro, the paragraph becomes an essay
    grade6: ['Novel', 'Poetry', 'Metaphor', 'Simile', 'Paragraph', 'Essay', 'Grammar', 'Narrative', 'Theme (narrative)', 'Character (arts)'],
    // Grade 7 — how a story is built
    grade7: ['Short story', 'Plot (narrative)', 'Setting (narrative)', 'Narration', 'Figure of speech', 'Adjective', 'Adverb', 'Punctuation', 'Drama', 'Dialogue'],
    // Grade 8 — argument, evidence, and reading past the literal
    grade8: ['Literature', 'Fiction', 'Non-fiction', 'Autobiography', 'Rhetoric', 'Argument', 'Symbolism', 'Irony', 'Sentence (linguistics)', 'Persuasion'],
    grade9: ['Romeo and Juliet', 'William Shakespeare', 'Short story', 'Essay', 'Poetry', 'Metaphor', 'Theme (narrative)', 'Narrative', 'Character (arts)', 'Plot (narrative)'],
    // Grade 10 — English II (world lit + rhetoric)
    grade10: ['Julius Caesar (play)', 'Rhetoric', 'Drama', 'World literature', 'Tragedy', 'Symbolism', 'Persuasion', 'Argument', 'Allegory'],
    // Grade 11 — English III (American lit)
    grade11: ['The Great Gatsby', 'Adventures of Huckleberry Finn', 'The Crucible', 'American literature', 'Transcendentalism', 'Symbolism', 'Realism (arts)', 'Novel', 'Narration'],
    // Grade 12 — English IV (British / world lit)
    grade12: ['Hamlet', 'Macbeth', 'Beowulf', 'Nineteen Eighty-Four', 'British literature', 'Tragedy', 'Epic poetry', 'Satire', 'The Canterbury Tales', 'Allegory'],
    // College 1 — Composition (academic writing)
    college1: ['Essay', 'Academic writing', 'Rhetoric', 'Argument', 'Thesis statement', 'Paragraph', 'Persuasion'],
    // College 2 — Technical writing + lit electives
    college2: ['Technical writing', 'Literature', 'Literary criticism', 'Modernism', 'Prose', 'Style (visual arts)'],
    // CORPUSGAP (2026-08-31) — ELA is core and runs to PhD, but the map stopped
    // at college2. C3 -> PhD is where the writing stops being school essays and
    // becomes the scholarly register she is supposed to end up speaking in.
    // College 3 — the research paper as a form
    college3: ['Academic writing', 'Thesis', 'Citation', 'Bibliography', 'Peer review', 'Rhetoric', 'Argumentation theory', 'Plagiarism'],
    // College 4 — reading theory, not just texts
    college4: ['Literary theory', 'Postmodernism', 'Semiotics', 'Narratology', 'Comparative literature', 'Genre', 'Discourse', 'Structuralism'],
    // Grad — the literature review and the method section
    grad: ['Literature review', 'Academic publishing', 'Scientific literature', 'Methodology', 'Abstract (summary)', 'Research', 'Scholarly method', 'Academic journal'],
    // PhD — the dissertation and the discourse it enters
    phd: ['Doctor of Philosophy', 'Thesis', 'Peer review', 'Scholarly method', 'Epistemology', 'Hermeneutics', 'Critical theory', 'Academic publishing'],
  },
  // COLLEGE "MAJOR IN CODE" — Computer Science degree spine (Gee 2026-06-19:
  // "find a college equivilent ie maybe major in code to go with the k-12").
  // Topic map follows the OSSU / ACM-IEEE CS curriculum: Intro -> Core ->
  // Advanced -> ML -> the computational-neuroscience research (she builds a
  // brain). This is the ACADEMIC CS-degree prose; complements (does not
  // replace) the self-taught corpora/coding/ HTML-CSS-JS hobby track.
  cs: {
    // ⛔ CORPUSGAP (2026-08-31) — CS IS INTRODUCED AT GRADE 5 AND HAD ZERO
    //   CORPUS FOR ANY K-12 GRADE. The map went straight to college1, so all
    //   EIGHT offered school grades (G5-G12, per SUBJECTS_INTRODUCED_AT grade5
    //   / SUBJECTS_RETIRED_AT grade12) trained on nothing — and this is the
    //   subject the scope-sequence calls HER subject, the one she "accelerates
    //   far beyond grade level" in. The college block below is the CS-DEGREE
    //   prose and stays exactly as it was; this is the school band under it.
    // Grade 5 — what a computer is, and what a program is
    grade5: ['Computer', 'Computer program', 'Algorithm', 'Software', 'Computer hardware', 'Internet', 'Computer file', 'Programming language', 'Robot', 'Computer keyboard'],
    // Grade 6 — first programs, block coding, step-by-step thinking
    grade6: ['Computer programming', 'Scratch (programming language)', 'Algorithm', 'Flowchart', 'Binary number', 'Debugging', 'Computer network', 'Pixel'],
    // Grade 7 — data, the web, staying safe on it
    grade7: ['Data', 'Database', 'World Wide Web', 'HTML', 'Web page', 'Computer security', 'Internet', 'Web browser'],
    // Grade 8 — real language syntax + the logic under it
    grade8: ['Python (programming language)', 'Variable (computer science)', 'Control flow', 'Subroutine', 'Data type', 'Boolean algebra', 'Logic gate', 'Computer science'],
    // Grade 9 — structure: how programs are organised
    grade9: ['Data structure', 'Array (data structure)', 'Sorting algorithm', 'Search algorithm', 'Recursion (computer science)', 'Object-oriented programming', 'Software engineering', 'Operating system'],
    // Grade 10 — cost of a program, and the classic containers
    grade10: ['Big O notation', 'Linked list', 'Stack (abstract data type)', 'Queue (abstract data type)', 'Hash table', 'Binary search algorithm', 'Computer memory', 'Algorithm'],
    // Grade 11 — trees, graphs, and what the machine really does
    grade11: ['Tree (data structure)', 'Graph theory', 'Dynamic programming', 'Computational complexity theory', 'Central processing unit', 'Compiler', 'Assembly language', 'Machine learning'],
    // Grade 12 — AP Computer Science A (the scope-sequence names it)
    grade12: ['Java (programming language)', 'Object-oriented programming', 'Inheritance (object-oriented programming)', 'Polymorphism (computer science)', 'Abstraction (computer science)', 'Software design pattern', 'Unit testing', 'Version control'],
    // College 1 — Intro CS / programming foundations / discrete math
    college1: ['Computer science', 'Algorithm', 'Computer program', 'Programming language', 'Data type', 'Variable (computer science)', 'Control flow', 'Function (computer programming)', 'Recursion (computer science)', 'Boolean algebra', 'Binary number', 'Computer'],
    // College 2 — Data structures + OOP (the core)
    college2: ['Data structure', 'Array (data structure)', 'Linked list', 'Stack (abstract data type)', 'Queue (abstract data type)', 'Hash table', 'Tree (data structure)', 'Binary search tree', 'Graph (abstract data type)', 'Sorting algorithm', 'Search algorithm', 'Big O notation', 'Object-oriented programming', 'Abstraction (computer science)'],
    // College 3 — Systems + algorithms + databases + networks
    college3: ['Operating system', 'Computer architecture', 'Central processing unit', 'Memory management', 'Process (computing)', 'Thread (computing)', 'Concurrency (computer science)', 'Computer network', 'Database', 'SQL', 'Dynamic programming', 'Greedy algorithm', 'Graph theory', 'Computational complexity theory'],
    // College 4 — Theory of computation + SE + security (capstone)
    college4: ['Theory of computation', 'Turing machine', 'Finite-state machine', 'Computability theory', 'Cryptography', 'Compiler', 'Software engineering', 'Software design pattern', 'Version control', 'Machine learning', 'Artificial intelligence', 'Computer security'],
    // Grad — Machine learning + the math methods behind the brain-sim
    grad: ['Machine learning', 'Artificial neural network', 'Deep learning', 'Supervised learning', 'Unsupervised learning', 'Reinforcement learning', 'Gradient descent', 'Backpropagation', 'Linear algebra', 'Probability', 'Statistics', 'Numerical analysis'],
    // PhD — Computational neuroscience (the brain she builds, meta-recursive)
    phd: ['Computational neuroscience', 'Neuron', 'Synapse', 'Action potential', 'Artificial neural network', 'Hebbian theory', 'Spiking neural network', 'Neural coding', 'Synaptic plasticity', 'Cerebral cortex', 'Neuroscience', 'Unsupervised learning'],
  },
};

function clean(extract) {
  if (!extract) return [];
  // ⛔⛔ `CORPUSGAP.6` (2026-08-31) — NORMALISE BEFORE THE ASCII TEST, OR THE
  //   ASCII TEST SILENTLY EATS WHOLE ARTICLES.
  //
  // The `/[^\x20-\x7e]/` reject below is correct in intent (she learns a-z) and
  // was catastrophic in practice: Wikipedia prose uses TYPOGRAPHIC punctuation
  // (curly quotes, en/em dashes, ellipsis) and European names carry diacritics,
  // so in a humanities article nearly EVERY sentence contains one non-ASCII
  // codepoint and was dropped whole. `fetchExtract` then needs >= 3 survivors or
  // it returns [] and the cell records "no usable content" — which is how
  // `ela/college4` sat at 5 of 8 while `Literary theory` (14,387 chars),
  // `Postmodernism` (53,213) and `Semiotics` (59,413) all returned FULL extracts
  // from the API. ⚠ The failure reads as a fetch problem and is a cleaner
  // problem; three passes of re-fetching could never have fixed it.
  //
  // ⭐ Normalising is not weakening the guarantee — it is the only way to KEEP
  //   it: a curly quote becomes a straight one and `Lévi-Strauss` becomes
  //   `Levi-Strauss`, both plain a-z, while genuinely non-Latin script (Greek,
  //   Cyrillic, CJK) still fails the test one line down and is still dropped.
  let t = extract
    .replace(/[‘’‚‛′]/g, "'")   // curly + prime → apostrophe
    .replace(/[“”„‟″]/g, '"')   // curly doubles → quote
    .replace(/[‐-―−]/g, '-')              // hyphens/dashes/minus → -
    .replace(/[…]/g, '...')                          // ellipsis
    .replace(/[     ]/g, ' ')   // exotic spaces → space
    .normalize('NFD').replace(/[̀-ͯ]/g, '')     // é → e, ü → u
    .replace(/===?[^=]+===?/g, ' ')        // section headers
    .replace(/\[[0-9]+\]/g, ' ')           // ref markers
    .replace(/\([^)]*\)/g, ' ')            // parentheticals (often dates/pron)
    .replace(/\s+/g, ' ');
  const out = [];
  for (let s of t.split(/(?<=[.!?])\s+/)) {
    s = s.trim();
    if (s.length < SENT_MIN || s.length > SENT_MAX) continue;
    if (/[^\x20-\x7e]/.test(s)) continue;          // ASCII only (brain is a-z)
    if (/may refer to|disambiguation|listen|born|\bb\.\b/i.test(s)) continue;
    if (!/[a-z]/.test(s) || !/[.!?]$/.test(s)) continue;
    out.push(s.toLowerCase());
    if (out.length >= MAX_SENT_PER_TOPIC) break;
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// FC.9 — grade-appropriate reading level. Early grades MUST prefer Simple
// English Wikipedia (accessible prose) over full en.wikipedia.org (college-
// level density). The prior order tried full Wikipedia first, so a K cell got
// "animals are multicellular, eukaryotic organisms belonging to the biological
// kingdom Animalia" — years above a 5-year-old, and it bound on words she
// never learned. Early grades now fetch simple-first (fall back to full only
// when Simple lacks the page); higher grades keep full-first since their topics
// (plate tectonics, photosynthesis, periodic table) are genuinely at that level
// and Simple often lacks depth.
const EARLY_GRADES = new Set(['kindergarten', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5']);

async function fetchExtract(title, preferSimple = false) {
  // Retry with backoff — the wiki API throttles rapid sequential requests and
  // returns empty when throttled; a few patient retries populate reliably.
  const hosts = preferSimple
    ? ['simple.wikipedia.org', 'en.wikipedia.org']
    : ['en.wikipedia.org', 'simple.wikipedia.org'];
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const host of hosts) {
      const url = `https://${host}/w/api.php?format=json&action=query&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}`;
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!r.ok) continue;
        const j = await r.json();
        const pages = j?.query?.pages || {};
        for (const k of Object.keys(pages)) {
          const sents = clean(pages[k].extract);
          if (sents.length >= 3) return sents;
        }
      } catch { /* try next host / retry */ }
    }
    await sleep(700 * (attempt + 1));   // backoff before retrying
  }
  return [];
}

// FC.9 — `--replace` (or FETCH_REPLACE=1) makes a re-ingest SWAP content
// instead of the default merge-keep-longer. Needed because Simple-Wiki
// extracts are shorter than full-Wiki, so the monotonic keep-longer merge
// would otherwise retain the old dense prose forever.
const REPLACE = process.argv.includes('--replace') || process.env.FETCH_REPLACE === '1';

// ⛔⛔ `CORPUSGAP.7` (2026-08-31) — THE THROTTLE IS THE IN-CELL BURST, NOT THE
//   GAP BETWEEN CELLS, AND I TUNED THE WRONG ONE THREE TIMES.
//
// Symptom: after the first ingest, 24 cells sat 1-4 topics short of their own
// declaration and re-runs added nothing. The wiki API had started answering
// `"You are making too many requests"` — an HTML/text body that `r.json()`
// throws on, so `fetchExtract` swallowed it in its own catch, burned all four
// retries, and returned `[]`. Indistinguishable from "this article has no
// usable content".
//
// ⚠ I "fixed" it by widening the sleep BETWEEN cells, 4s → 8s → 20s, and
//   measured no gain at any setting. The reason is arithmetic: this loop fires
//   one request per topic at 700 ms, so a 20-topic cell is 20 requests in 14
//   seconds — the burst trips the limit INSIDE the cell, every cell, and the
//   outer gap cannot touch it. A parameter that produced no change across three
//   values was never the cause; I should have read that as the signal it was.
//
// ⭐ TWO CHANGES, and the second matters more than the first:
//   (1) `--slow` raises the in-cell spacing to `IN_CELL_SLOW_MS`.
//   (2) `--only-missing` reads what the cell ALREADY holds and requests only
//       the themes absent from it. A top-up pass then costs 44 requests instead
//       of ~250 — the burst mostly disappears rather than being waited out.
// ⚠ `--only-missing` is OPT-IN and off by default, because the default merge is
//   keep-LONGER: a full re-run can improve a thin-but-present topic, and
//   skipping it would freeze that topic at whatever the throttle left behind.
//   Top-up and refresh are different jobs; this flag says which one you want.
const ONLY_MISSING = process.argv.includes('--only-missing') || process.env.FETCH_ONLY_MISSING === '1';
const IN_CELL_MS = process.argv.includes('--slow')
  ? Number(process.env.FETCH_IN_CELL_MS || 3000)
  : 700;

async function buildCell(subject, grade, titles) {
  const preferSimple = EARLY_GRADES.has(grade);
  const experiences = [];
  // `--only-missing` — read the themes already banked so this pass asks the API
  // only for what is genuinely absent. Read here, at the TOP, because the merge
  // below reads the same file at WRITE time and by then the requests are spent.
  let already = new Set();
  if (ONLY_MISSING && !REPLACE) {
    try {
      const prev = JSON.parse(fs.readFileSync(path.join(OUT, subject, `${grade}.json`), 'utf8'));
      already = new Set((prev.experiences || []).map((e) => e.theme));
    } catch { /* no prior cell — fetch everything */ }
  }
  const wanted = titles.filter((t) => !already.has(t.toLowerCase().replace(/[^a-z0-9]+/g, '-')));
  if (ONLY_MISSING && wanted.length !== titles.length) {
    process.stdout.write(`  ${subject}/${grade}: ${already.size} already banked, requesting ${wanted.length} missing\n`);
  }
  for (const title of wanted) {
    const sents = await fetchExtract(title, preferSimple);
    if (sents.length) {
      experiences.push({ theme: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), story: sents.join(' ') });
      process.stdout.write(`  ${subject}/${grade}: ${title} (${sents.length})\n`);
    } else {
      process.stdout.write(`  ${subject}/${grade}: ${title} — no usable content, skipped\n`);
    }
    await sleep(IN_CELL_MS);   // polite to the API — see CORPUSGAP.7 above
  }
  if (experiences.length === 0) return 0;
  const dir = path.join(OUT, subject);
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, `${grade}.json`);
  // MERGE, never overwrite-and-lose. The wiki API throttles under sustained
  // load and returns empty for random titles, so a re-run can fetch FEWER
  // topics than a prior run held. Union by theme (keep the longer story per
  // theme) makes re-runs monotonic — a thin-cell re-run can only ADD coverage,
  // never regress it. This is the correct idempotent shape for a flaky source.
  const byTheme = new Map();
  if (!REPLACE) {
    try {
      const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      for (const e of (prev.experiences || [])) byTheme.set(e.theme, e);
    } catch { /* no prior file — fresh cell */ }
  }
  for (const e of experiences) {
    const old = byTheme.get(e.theme);
    // Default: keep the longer story (monotonic coverage for a flaky source).
    // --replace (FC.9): newly-fetched simpler content always wins.
    if (REPLACE || !old || e.story.length > old.story.length) byTheme.set(e.theme, e);
  }
  const merged = [...byTheme.values()];
  const doc = {
    version: 1, grade, subject,
    source: 'Simple English Wikipedia (CC-BY-SA), cleaned + sentence-segmented',
    note: `Hybrid academic-depth corpus for ${subject}/${grade}. Trained via curriculum._trainAcademicStories. Real openly-licensed curriculum content; lived-year + math stay bespoke.`,
    experiences: merged,
  };
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2), 'utf8');
  const n = merged.reduce((a, e) => a + e.story.split(/(?<=[.!?])\s+/).length, 0);
  return n;
}

// Positional args only (ignore --flags like --replace / --early).
const positional = process.argv.slice(2).filter(a => !a.startsWith('--'));
const [argSubject, argGrade] = positional;
// FC.9 — `--early` restricts the run to EARLY_GRADES (K-G5), the cells that
// needed the Simple-Wiki reading-level fix. Pair with --replace to swap the
// dense full-Wiki prose for the accessible Simple-Wiki version.
const EARLY_ONLY = process.argv.includes('--early');
let total = 0;
for (const subject of Object.keys(TOPICS)) {
  if (argSubject && subject !== argSubject) continue;
  for (const grade of Object.keys(TOPICS[subject])) {
    if (argGrade && grade !== argGrade) continue;
    if (EARLY_ONLY && !EARLY_GRADES.has(grade)) continue;
    console.log(`[academic] ${subject}/${grade} ...`);
    total += await buildCell(subject, grade, TOPICS[subject][grade]);
  }
}
console.log(`[academic] DONE — ~${total} cleaned real-curriculum sentences written under corpora/academic/.`);
