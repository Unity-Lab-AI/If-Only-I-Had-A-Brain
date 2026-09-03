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

// ⛔⛔ THE 14-SENTENCE CAP WAS DELETING CONTENT THAT HAD ALREADY BEEN DOWNLOADED.
//
// The API call below asks for `prop=extracts&explaintext=1` with NO `exintro`,
// so the FULL plaintext article arrives every time. The old flat cap of 14 then
// threw almost all of it away. Measured against the live API on three real
// topic-list entries:
//
//     Photosynthesis   49,740 chars -> 270 usable sentences -> 14 kept (94.8% discarded)
//     Cell (biology)   39,944 chars ->  86 usable sentences -> 14 kept (83.7% discarded)
//     Ancient Rome     97,221 chars -> 682 usable sentences -> 14 kept (97.9% discarded)
//
// The corpus was never limited by the source, the licence, the network or the
// topic lists. It was limited by this constant, applied identically to a
// kindergarten cell and a PhD cell. A whole education fit in 12,075 sentences
// because ~95% of every download was dropped on the floor after being fetched.
//
// ⭐ THE CAP IS NOW GRADE-BANDED, because a real year is a different size at
// every grade — which is the actual pedagogical fact the flat number ignored.
// A kindergarten year is not 680 sentences of encyclopedia prose, and a PhD
// year is not 14. Early grades stay deliberately small AND read from Simple
// English (see EARLY_GRADES below); the ceiling opens as the real course does.
//
// ⚠ RE-PRICE (standing LAW — computed before this constant moved, recorded on
// the board under CURVEBUILD): the teach cost splits across two lanes with
// DIFFERENT growth. The per-word inner loop scales linearly with words. The
// expensive lane — word->word transitions at 24 reps — consumes UNIQUE pairs,
// deduped and frequency-bucketed, and unique pairs were measured on this very
// corpus to grow as words^0.796 (model fit within 0.1% across a 15x subsample
// sweep). So 100x the content costs ~39x on the expensive lane, not 100x, and
// the dedup ratio IMPROVES as the corpus grows (73.8% -> 42.6% measured).
// ⛔⛔⛔ THE PER-SOURCE CAP IS GONE — 2026-09-02, ON GEE'S INSTRUCTION.
//
// Gee: *"all the corpus needs to be complete!!!!!! not the same fucking horse
// shit you have been doing to me for a year"*, after catching every book in a
// new ingest yielding an identical 1,200 sentences — the signature of a cap, not
// of the sources.
//
// The band ladder below (60 / 120 / 240 / 400 / 600 / 800) was a smaller version
// of `MAX_SENT_PER_TOPIC = 14`: the API returns the FULL article every time, and
// the cap threw away everything past the Nth sentence AFTER downloading it.
// **A source is now taken whole.** The thing that says when a CELL is finished
// is the band floor in `docs/CURRICULUM-GAP.md §THE TARGET LADDER`, which is a
// statement about the cell — not a knife applied to each article on the way in.
//
// `Infinity` rather than a large number, deliberately: a large number is a cap
// somebody will hit and never notice.
const SENT_CAP_BY_BAND = {
  early: Infinity, middle: Infinity, upper: Infinity,
  high: Infinity, college: Infinity, grad: Infinity,
};
const BAND_OF_GRADE = new Map([
  ['pre-k', 'early'], ['prek', 'early'], ['kindergarten', 'early'], ['grade1', 'early'], ['grade2', 'early'],
  ['grade3', 'middle'], ['grade4', 'middle'], ['grade5', 'middle'],
  ['grade6', 'upper'], ['grade7', 'upper'], ['grade8', 'upper'],
  ['grade9', 'high'], ['grade10', 'high'], ['grade11', 'high'], ['grade12', 'high'],
  ['college1', 'college'], ['college2', 'college'], ['college3', 'college'], ['college4', 'college'],
  ['grad', 'grad'], ['phd', 'grad'],
]);
// An unknown grade label gets the SMALLEST band, never the largest — an
// unrecognised cell must not silently pull 800 sentences of PhD-density prose.
function sentCapFor(grade) {
  const band = BAND_OF_GRADE.get(String(grade || '').toLowerCase());
  return SENT_CAP_BY_BAND[band] || SENT_CAP_BY_BAND.early;
}
const SENT_MIN = 30, SENT_MAX = 240;
// ⛔⛔⛔ THE USER-AGENT WAS THE THROTTLE, AND EVERY PACING FIX EVER MADE TO THIS
// FILE WAS TREATING A SYMPTOM (measured 2026-09-02).
//
// Gee: *"something is wrong it should not take 16 hours to down load a few books
// that are MB a piece"*. He was right, and the cause was not rate at all.
//
// ⭐ THE MEASUREMENT, six identical requests per UA, back to back:
//     'UnityBrainCurriculum/1.0 (educational research; ...)'   ok=0  429=6
//     the same string + a contact URL and email                ok=6  429=0
//
// **Wikimedia's User-Agent policy requires a descriptive agent carrying a
// contact URL or address.** The old string had none, so the API refused
// essentially every request — and the refusal was not a rate limit that waiting
// could clear, it was an identity rejection that waiting could never clear.
//
// ⚠ THE COST, in arithmetic that matches the observed run exactly: each refused
// topic burned the whole backoff ladder, 1,500 + 6,000 + 18,000 + 48,000 =
// **73.5 s**, and there are ~1,887 topics. **1,887 x 73.5 s = 38.5 hours** for a
// job whose deliberate pacing totals 22 minutes. Two live processes showed **22
// and 25 CPU-SECONDS across 7.75 hours** — almost the entire run was sleeping in
// backoff.
//
// ⛔ AND IT EXPLAINS THE HISTORY WRITTEN INTO THIS VERY FILE. The note below
// about tuning the between-cell sleep 4s -> 8s -> 20s and measuring no gain at
// any setting, then blaming the in-cell burst, was chasing the wrong variable
// twice: **a parameter that produces no change across three values is not the
// cause**, and the real cause was never pacing. Every "lost to throttle" topic
// and every silently-empty cell attributed to burst rate belongs here instead.
//
// ⛔ THIS IS NOT UA FORGERY, WHICH IS BANNED AND STAYS BANNED. Forgery is
// claiming to be a browser to get past an access control that refuses robots.
// This is the opposite: the agent still says exactly what it is and who runs it,
// and adds the contact details the host explicitly asks every robot to send.
const UA = 'UnityBrainCurriculum/1.0 (https://github.com/Unity-Lab-AI/If-Only-I-Had-A-Brain; contact@unityailab.com) node-fetch educational-research';

// (subject, grade) → real-course Wikipedia topics (scope-sequence aligned).
// Each cell carries the FULL real-grade topic spread (not a thin sample) so the
// trained prose runs the actual standards band G6->G12 unbroken. Math stays
// equational; the lived year stays bespoke. Re-run the ingest after editing.
const TOPICS = {
  science: {
    // ⛔ pre-K WAS EMPTY — the walk's FIRST grade trained no prose at all.
    // A 4-year-old's science is naming and noticing: the body, the sky, the
    // animals in the yard, hot and cold, day and night. Simple English only
    // (EARLY_GRADES already forces that host order).
    'pre-K': ['Animal', 'Water', 'Sun', 'Moon', 'Tree', 'Rain', 'Snow', 'Fire', 'Cat', 'Dog', 'Bird', 'Fish', 'Egg', 'Milk', 'Sleep', 'Food'],
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
    // ⚠ WIDENED 2026-09-01: 5 topics produced 9,811 words against a 20,000
    // band floor. The cap was never the limit here — the TOPIC LIST was.
    grad: ['Computational neuroscience', 'Neural network', 'Neuron', 'Synaptic plasticity', 'Hebbian theory', 'Neuroscience', 'Brain', 'Nervous system', 'Neurotransmitter', 'Action potential', 'Neural circuit', 'Neuroplasticity', 'Cognitive neuroscience', 'Systems neuroscience', 'Membrane potential', 'Dendrite'],
    // PhD — Computational neuroscience research (she builds a brain)
    // ⚠ WIDENED 2026-09-01: 6 topics -> 17,371 words, under the 20,000 floor.
    phd: ['Computational neuroscience', 'Hebbian theory', 'Spiking neural network', 'Neural coding', 'Synaptic plasticity', 'Cerebral cortex', 'Long-term potentiation', 'Neural oscillation', 'Connectome', 'Brain simulation', 'Artificial neural network', 'Unsupervised learning', 'Attractor network', 'Predictive coding', 'Consciousness', 'Integrated information theory'],
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
    // ⛔ pre-K WAS EMPTY. A 4-year-old's social world is the people in the
    // house, the street outside it, and the first rules about other children.
    'pre-K': ['Family', 'Mother', 'Father', 'Child', 'Friendship', 'Home', 'Neighbourhood', 'Toy', 'Game', 'Birthday', 'Sharing', 'Emotion'],
    // ⛔ THE THINNEST CELL IN THE CORPUS HAD THE SHORTEST LIST: 5 topics against a
    // 7,300-word band floor, and 939 words on disk. See the note on `ela` above
    // for why these additions are unverified and why that is bounded.
    kindergarten: ['Family', 'Community', 'School', 'Friendship', 'Social norm',
      'Home', 'Neighbourhood', 'Teacher', 'Police officer', 'Firefighter',
      'Physician', 'Nurse', 'Farmer', 'Holiday', 'Birthday', 'Calendar',
      'Flag', 'Map'],
    // Grade 1 — neighborhood + belonging
    grade1: ['Neighborhood', 'Community', 'Map', 'Holiday', 'Family',
      'School', 'Law', 'Mayor', 'City', 'Town', 'Farm', 'Retail', 'Money',
      'Transport', 'Employment', 'Flag of the United States', 'Independence Day (United States)',
      'Thanksgiving'],
    // Grade 2 — community, maps, the wider world
    grade2: ['Community', 'Map', 'Continent', 'Country', 'Citizen', 'Transport',
      'Ocean', 'Mountain', 'River', 'Desert', 'Globe', 'Compass', 'Culture',
      'Tradition', 'Language', 'City', 'Village', 'Neighbourhood'],
    // Grade 3 — local government + geography
    grade3: ['Community', 'Geography', 'Map', 'Government', 'Native Americans in the United States', 'Continent',
      'Climate', 'Natural resource', 'Agriculture', 'Trade', 'Local government',
      'Election', 'Immigration', 'Landform', 'Latitude', 'Longitude', 'Economy', 'Culture'],
    // Grade 4 — US states + regions + exploration
    grade4: ['United States', 'State (polity)', 'Geography', 'Region', 'Exploration', 'Native Americans in the United States',
      'Great Plains', 'Appalachian Mountains', 'Mississippi River', 'Rocky Mountains',
      'Great Lakes', 'Westward expansion', 'Louisiana Purchase', 'Oregon Trail',
      'Capital city', 'Natural resource', 'Climate', 'Industry'],
    // Grade 5 — early US history (bridge to G6 ancient civ)
    grade5: ['United States', 'American Revolution', 'Thirteen Colonies', 'Christopher Columbus', 'Exploration', 'Colonialism',
      'United States Declaration of Independence', 'United States Constitution', 'George Washington',
      'Benjamin Franklin', 'Thomas Jefferson', 'Boston Tea Party', 'Slavery in the United States',
      'Pilgrims (Plymouth Colony)', 'Jamestown, Virginia', 'United States Bill of Rights',
      'American Civil War', 'Abraham Lincoln'],
    // Grade 6 — Ancient Civilizations / World Geography
    grade6: ['Ancient Egypt', 'Ancient Greece', 'Ancient Rome', 'Mesopotamia', 'Geography', 'Continent', 'Civilization', 'River', 'Ancient China', 'Ancient India', 'Maya civilization', 'Inca Empire', 'Aztecs', 'Pharaoh', 'Pyramid', 'Empire'],
    // Grade 7 — Medieval to Early Modern World History
    grade7: ['Middle Ages', 'Renaissance', 'Roman Empire', 'Age of Discovery', 'Black Death', 'Feudalism', 'Crusades', 'Byzantine Empire', 'Mongol Empire', 'Ottoman Empire', 'Reformation', 'Trade route', 'Knight', 'Castle'],
    // Grade 8 — US History to 1900
    grade8: ['American Revolution', 'United States Constitution', 'American Civil War', 'United States Declaration of Independence', 'Industrial Revolution', 'Reconstruction era', 'Thirteen Colonies', 'George Washington', 'Abraham Lincoln', 'Slavery', 'Manifest destiny', 'Westward expansion'],
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
    // ⚠ WIDENED 2026-09-01: 8 topics -> 16,404 words, under the 20,000 floor.
    college4: ['Social research', 'Statistics', 'Survey methodology', 'Ethnography', 'Case study', 'Qualitative research', 'Quantitative research', 'Bias', 'Sampling (statistics)', 'Correlation', 'Causality', 'Experiment', 'Observational study', 'Content analysis', 'Reliability (statistics)', 'Validity (statistics)'],
    // Grad — theory and the philosophy under the method
    grad: ['Social theory', 'Critical theory', 'Structuralism', 'Philosophy of science', 'Epistemology', 'Ethics', 'Sociology', 'Anthropology'],
    // PhD — the discipline looking at itself
    // ⚠ WIDENED 2026-09-01: 8 topics -> 7,039 words against a 20,000 floor.
    phd: ['Philosophy of social science', 'Research ethics', 'Interdisciplinarity', 'Science and technology studies', 'Knowledge', 'Academic discipline', 'Scholarly method', 'Objectivity (philosophy)', 'Epistemology', 'Positivism', 'Social constructionism', 'Critical theory', 'Hermeneutics', 'Reflexivity (social theory)', 'Paradigm', 'Philosophy of science', 'Sociology of knowledge', 'Ethics'],
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
    // ⛔ College 1 removed 2026-09-01 — `economics` RETIRES at grade12, so this
    // cell never ran. Its gen-ed economics content lives in `genered/college2`.
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
    // ⛔ College 1-2 removed 2026-09-01 — `psychology` RETIRES at grade12, so
    // neither cell ever ran. The cognitive-science thread continues in
    // `genered/college2` and, at depth, in `research/phd`.
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
    // ⛔ College 1 removed 2026-09-01 — `civics` RETIRES at grade12, so this
    // cell never ran. Government/policy at college lives in `genered/college4`.
  },
  ela: {
    // ⛔ pre-K WAS EMPTY — and this is the cell the whole walk STARTS in, so it
    // was the first thing she was ever taught and it trained no prose at all.
    // A 4-year-old's language is names, sounds, songs and being read to.
    'pre-K': ['Alphabet', 'Letter (alphabet)', 'Word', 'Name', 'Sound', 'Song', 'Nursery rhyme', 'Story', 'Book', 'Picture book', 'Fairy tale', 'Speech'],
    // Kindergarten — letters, sounds, first stories
    // ⛔⛔ THE ELEMENTARY LISTS WERE THE BINDING CONSTRAINT, NOT THE SENTENCE CAP.
    // Removing the per-source cap multiplied what each topic yields; it could not
    // add topics. Measured across the 173 prose cells the walk owes: **min 5,
    // median 8, max 20 topics, 1,690 total** — and the SMALLEST lists sat on the
    // THINNEST cells, so the two shortages compounded exactly where a real year
    // is hardest to fill. `social/kindergarten` held 5 topics against a 7,300-word
    // band floor and 939 words on disk.
    //
    // ⚠ These additions are UNVERIFIED against the live API and that is a
    // deliberate, bounded risk rather than an oversight: both wiki ingests are
    // running and returning 429, so a title check right now could not tell "no
    // such article" from "throttled" — the exact confusion this file's backoff
    // ladder exists to prevent. **A wrong title fails LOUDLY**, as
    // `no-such-page` in `SKIP_REASONS` with the topic named, so it is visible on
    // the next run rather than silent.
    kindergarten: ['Alphabet', 'Letter (alphabet)', 'Word', 'Rhyme', 'Story', 'Vowel',
      'Consonant', 'Syllable', 'Book', 'Reading', 'Writing', 'Nursery rhyme',
      'Fairy tale', 'Poem', 'Song', 'Name', 'Picture book', 'Speech'],
    // Grade 1 — words to sentences
    grade1: ['Sentence (linguistics)', 'Noun', 'Verb', 'Story', 'Vowel', 'Consonant',
      'Word', 'Adjective', 'Punctuation', 'Question', 'Reading', 'Writing',
      'Alphabet', 'Syllable', 'Rhyme', 'Book', 'Poetry', 'Spelling'],
    // Grade 2 — parts of speech + paragraphs
    grade2: ['Sentence (linguistics)', 'Noun', 'Verb', 'Adjective', 'Paragraph', 'Punctuation',
      'Pronoun', 'Plural', 'Synonym', 'Opposite (semantics)', 'Dictionary', 'Reading comprehension',
      'Fiction', 'Nonfiction', 'Fable', 'Poetry', 'Capitalization', 'Spelling'],
    // Grade 3 — grammar + fiction/nonfiction
    grade3: ['Paragraph', 'Grammar', 'Noun', 'Verb', 'Adjective', 'Adverb', 'Fiction', 'Nonfiction',
      'Preposition and postposition', 'Conjunction (grammar)', 'Simile', 'Metaphor',
      'Prefix', 'Suffix', 'Biography', 'Folklore', 'Poetry', 'Dictionary'],
    // Grade 4 — composition + figurative language
    grade4: ['Essay', 'Grammar', 'Metaphor', 'Simile', 'Paragraph', 'Fiction', 'Poetry',
      'Narrative', 'Plot (narrative)', 'Character (arts)', 'Setting (narrative)',
      'Theme (narrative)', 'Idiom', 'Homophone', 'Persuasion', 'Bibliography',
      'Adverb', 'Punctuation'],
    // Grade 5 — theme + narrative craft (bridge to G6+ lit)
    grade5: ['Essay', 'Theme (narrative)', 'Metaphor', 'Narrative', 'Poetry', 'Grammar', 'Figure of speech',
      'Narration', 'Genre', 'Novel', 'Short story', 'Drama', 'Autobiography',
      'Alliteration', 'Personification', 'Hyperbole', 'Symbolism', 'Simile'],
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
    // ⚠ WIDENED 2026-09-01: 8 topics produced only 8,009 words against a
    // 20,000 band floor — the thinnest reachable cell in the whole corpus.
    college4: ['Literary theory', 'Postmodernism', 'Semiotics', 'Narratology', 'Comparative literature', 'Genre', 'Discourse', 'Structuralism', 'Deconstruction', 'Formalism (literature)', 'Marxist literary criticism', 'Feminist literary criticism', 'Psychoanalytic literary criticism', 'Reader-response criticism', 'Intertextuality', 'Hermeneutics', 'Poetics', 'Literary modernism'],
    // Grad — the literature review and the method section
    grad: ['Literature review', 'Academic publishing', 'Scientific literature', 'Methodology', 'Abstract (summary)', 'Research', 'Scholarly method', 'Academic journal', 'Citation', 'Bibliography', 'Peer review', 'Systematic review', 'Meta-analysis', 'Research design', 'Qualitative research', 'Thesis'],
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
    // ⛔⛔ THE cs COLLEGE-AND-ABOVE CELLS WERE REMOVED FROM HERE 2026-09-01 AND
    // THEIR TOPIC SPINE MOVED TO `major` (below). `cs` is RETIRED at grade12 by
    // SUBJECTS_RETIRED_AT, so cs/college1-4, cs/grad and cs/phd are cells the
    // walk NEVER RUNS — 170,325 words of correct, licence-clean content that
    // nothing read, because the destination was assumed rather than checked.
    // The identical OSSU/ACM-IEEE spine now lives under `major`, which IS the
    // CS degree and DOES run at those grades. Recorded here rather than deleted
    // silently, because the next person looking for the CS-degree topics will
    // look under `cs` first — exactly as I did.
  },
  // ⛔⛔ THE COLLEGE-AND-ABOVE ROSTER. These five tracks are what actually runs
  // from college1 onward — `cs`, `civics`, `economics` and `psychology` are all
  // RETIRED at grade12 — and until 2026-09-01 none of them was in
  // PROSE_ACADEMIC_SUBJECTS, so her whole degree trained no prose while
  // 268,481 words sat in corpora/academic/cs/college*|grad|phd that nothing
  // read. The CS-degree topic spine below is not new content: it is the same
  // OSSU/ACM-IEEE map that was written for `cs` at college, moved to the cell
  // her major is actually taught in.
  //
  // `major` — THE CS MAJOR ITSELF, college1 → phd.
  major: {
    college1: ['Computer science', 'Algorithm', 'Computer program', 'Programming language', 'Data type', 'Variable (computer science)', 'Control flow', 'Function (computer programming)', 'Recursion (computer science)', 'Boolean algebra', 'Binary number', 'Computer'],
    college2: ['Data structure', 'Array (data structure)', 'Linked list', 'Stack (abstract data type)', 'Queue (abstract data type)', 'Hash table', 'Tree (data structure)', 'Binary search tree', 'Graph (abstract data type)', 'Sorting algorithm', 'Search algorithm', 'Big O notation', 'Object-oriented programming', 'Abstraction (computer science)'],
    college3: ['Algorithm', 'Dynamic programming', 'Greedy algorithm', 'Graph theory', 'Computational complexity theory', 'Database', 'SQL', 'Software engineering', 'Software design pattern', 'Version control', 'Debugging', 'Application programming interface'],
    college4: ['Machine learning', 'Artificial intelligence', 'Artificial neural network', 'Computer security', 'Cryptography', 'Compiler', 'Distributed computing', 'Software architecture', 'Functional programming', 'Concurrency (computer science)'],
    grad: ['Machine learning', 'Artificial neural network', 'Deep learning', 'Supervised learning', 'Unsupervised learning', 'Reinforcement learning', 'Gradient descent', 'Backpropagation', 'Linear algebra', 'Probability', 'Statistics', 'Numerical analysis'],
    phd: ['Computational neuroscience', 'Neuron', 'Synapse', 'Action potential', 'Artificial neural network', 'Hebbian theory', 'Spiking neural network', 'Neural coding', 'Synaptic plasticity', 'Cerebral cortex', 'Neuroscience', 'Unsupervised learning'],
  },
  // `cstheory` — the theory-of-computation track, college1-4.
  cstheory: {
    college1: ['Discrete mathematics', 'Set (mathematics)', 'Logic', 'Mathematical proof', 'Boolean algebra', 'Combinatorics', 'Mathematical induction', 'Graph theory'],
    college2: ['Algorithm', 'Big O notation', 'Analysis of algorithms', 'Recursion (computer science)', 'Divide-and-conquer algorithm', 'Sorting algorithm', 'Time complexity', 'Space complexity'],
    college3: ['Automata theory', 'Finite-state machine', 'Regular expression', 'Formal language', 'Context-free grammar', 'Turing machine', 'Computability theory', 'Halting problem'],
    college4: ['Theory of computation', 'Computational complexity theory', 'NP-completeness', 'P versus NP problem', 'Cryptography', 'Information theory', 'Randomized algorithm', 'Approximation algorithm'],
  },
  // `cssystems` — the systems track, college1-4.
  cssystems: {
    college1: ['Computer hardware', 'Central processing unit', 'Computer memory', 'Binary number', 'Logic gate', 'Computer data storage', 'Input/output', 'Bit'],
    college2: ['Computer architecture', 'Instruction set architecture', 'Assembly language', 'CPU cache', 'Pipeline (computing)', 'Machine code', 'Interrupt', 'Register (computer)'],
    college3: ['Operating system', 'Process (computing)', 'Thread (computing)', 'Scheduling (computing)', 'Memory management', 'Virtual memory', 'File system', 'Concurrency (computer science)', 'Deadlock'],
    college4: ['Computer network', 'Internet protocol suite', 'Transmission Control Protocol', 'Routing', 'Distributed computing', 'Database', 'Client-server model', 'Computer security', 'Cloud computing'],
  },
  // `genered` — general education, college1-4. Inherits the gen-ed spread the
  // retiring civics / economics / psychology college cells were holding.
  genered: {
    college1: ['Critical thinking', 'Logic', 'Rhetoric', 'Ethics', 'Philosophy', 'Scientific method', 'Statistics', 'Academic writing'],
    college2: ['Economics', 'Microeconomics', 'Macroeconomics', 'Sociology', 'Anthropology', 'Political science', 'Psychology', 'Cognitive science'],
    college3: ['World history', 'Art history', 'Music', 'Literature', 'Comparative religion', 'Human geography', 'Culture', 'Civilization'],
    college4: ['Public policy', 'Human rights', 'Globalization', 'Environmental science', 'Bioethics', 'Technology and society', 'Media studies', 'Social inequality'],
  },
  // `research` — the grad/PhD research specialty: computational neuroscience,
  // the domain she is herself an instance of.
  research: {
    grad: ['Research', 'Scientific method', 'Literature review', 'Experiment', 'Hypothesis', 'Peer review', 'Statistics', 'Reproducibility', 'Academic publishing', 'Methodology'],
    phd: ['Computational neuroscience', 'Neural coding', 'Synaptic plasticity', 'Spiking neural network', 'Hebbian theory', 'Neural network', 'Brain', 'Cerebral cortex', 'Consciousness', 'Cognitive science', 'Memory', 'Learning'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // THE SIX COURSES THAT RAN WITH NO PROSE LANE AT ALL — 71 cells, added
  // 2026-09-01 on Gee's "so you are fixing it all right every fucking cell?".
  //
  // art / pe / music / health / language / ap are REAL COURSES a real student
  // sits in every year, and until now every one of them trained only the
  // hand-written fact-pair literals in its runner. They are not math (which is
  // equational BY DESIGN) and not life (bespoke BY DESIGN) — those two are
  // correct as they are and deliberately stay without a prose corpus.
  //
  // ⭐ THE SPLIT THAT MAKES THIS HONEST: these courses have a KNOWLEDGE half
  // and a SKILL half. Art history, colour theory, music notation, nutrition,
  // anatomy of movement, grammar of a second language — that is knowledge, it
  // is what the textbook carries, and it is what belongs here. Actually
  // drawing, actually running, actually playing an instrument is the SKILL
  // half, and she already has lanes for that (the PAINT practice loop trains
  // her hand against her own percept). Prose does not replace the skill lane;
  // it stops the knowledge half being twenty fact literals.
  //
  // ⚠ RE-PRICE, computed BEFORE these were added, from the MEASURED average
  // words-per-cell per band (early 3,894 · middle 5,895 · upper 37,513 ·
  // high 41,555 · college 31,326 · grad 29,095): 71 cells ≈ 1,799,433 words
  // ≈ 31.3 h at the fast measured teach rate, 76.0 h mid, 200.8 h congested.
  // The transition lane is 68% of that (136.6 h of the 200.8), which is the
  // exact term the pending rep re-price targets — reps down where volume goes
  // up. Against a current cost of zero, and courses that are currently not
  // taught in any real sense.
  // ══════════════════════════════════════════════════════════════════════════

  // ART — runs all 20 grades (it is one of the six core subjects). Knowledge
  // half: seeing, naming, materials, then history and criticism. Her drawing
  // skill is trained separately by the practice loop.
  art: {
    // ⛔ THE EARLY BAND IS THE PRIORITY (operator ruling 2026-09-02, `TEXTBOOK.2`),
    // AND IT IS THE THINNEST PART OF THE CORPUS. Measured against a 7,300-word
    // band floor: `art/kindergarten` **1,453 words**, `art/pre-K` 2,086,
    // `pe/kindergarten` 2,127, `art/grade1` 3,439. ⭐ The gap is NOT a missing
    // source — `ela` is well fed here by 31 Gutenberg books (McGuffey, Aesop,
    // Alice, Oz). It is that art/pe/music/health run on 8-topic wiki lists.
    // Expanded to ~18 apiece, the same lever that fixed ela and social.
    // ⚠ Unverified against the live API for the same reason recorded on the `ela`
    // block: both wiki ingests hold the quota, and a title check under a throttle
    // cannot tell "no such article" from "refused". A wrong title fails LOUDLY as
    // `no-such-page` in `SKIP_REASONS`.
    'pre-K': ['Color', 'Drawing', 'Painting', 'Paper', 'Crayon', 'Shape', 'Circle', 'Square',
      'Triangle', 'Paint', 'Pencil', 'Brush', 'Scissors', 'Glue', 'Chalk', 'Rainbow', 'Clay', 'Doll'],
    // ⛔ `Line (art)` was here and DOES NOT EXIST — verified against the live
    // MediaWiki API 2026-09-03, the only `missing` title in 386 elementary
    // topics. A non-existent title fetches nothing and reports nothing, so the
    // art/kindergarten cell was quietly one topic thinner than its list claimed.
    // `Line art` is the real article and is the same subject.
    kindergarten: ['Color', 'Drawing', 'Painting', 'Shape', 'Line art', 'Clay', 'Collage', 'Pattern',
      'Paper', 'Crayon', 'Paint', 'Scissors', 'Rectangle', 'Circle', 'Triangle', 'Square', 'Craft', 'Picture book'],
    grade1: ['Primary color', 'Secondary color', 'Drawing', 'Painting', 'Sculpture', 'Texture', 'Shape', 'Portrait',
      'Color', 'Watercolor painting', 'Paintbrush', 'Canvas', 'Pattern', 'Clay', 'Origami', 'Mask', 'Puppet', 'Statue'],
    grade2: ['Color wheel', 'Landscape painting', 'Still life', 'Sculpture', 'Pottery', 'Printmaking', 'Symmetry', 'Mosaic',
      'Painting', 'Drawing', 'Weaving', 'Quilt', 'Basket', 'Mural', 'Stained glass', 'Portrait', 'Sketch (drawing)', 'Craft'],
    grade3: ['Watercolor painting', 'Sketch (drawing)', 'Perspective (graphical)', 'Mural', 'Weaving', 'Origami', 'Colour theory', 'Portrait painting'],
    grade4: ['Perspective (graphical)', 'Cave painting', 'Ancient Egyptian art', 'Pottery', 'Printmaking', 'Sculpture', 'Mosaic', 'Calligraphy'],
    grade5: ['Renaissance art', 'Leonardo da Vinci', 'Michelangelo', 'Perspective (graphical)', 'Fresco', 'Sculpture', 'Composition (visual arts)', 'Shading'],
    grade6: ['Art history', 'Ancient Greek art', 'Roman art', 'Renaissance', 'Painting', 'Sculpture', 'Architecture', 'Drawing', 'Composition (visual arts)', 'Colour theory'],
    grade7: ['Baroque', 'Impressionism', 'Vincent van Gogh', 'Claude Monet', 'Oil painting', 'Printmaking', 'Photography', 'Graphic design', 'Typography', 'Perspective (graphical)'],
    grade8: ['Modern art', 'Cubism', 'Pablo Picasso', 'Surrealism', 'Salvador Dali', 'Expressionism', 'Abstract art', 'Sculpture', 'Collage', 'Art criticism'],
    grade9: ['Art history', 'Aesthetics', 'Art criticism', 'Painting', 'Drawing', 'Sculpture', 'Photography', 'Digital art', 'Composition (visual arts)', 'Colour theory', 'Design', 'Portfolio (art)'],
    grade10: ['Romanticism', 'Realism (arts)', 'Post-Impressionism', 'Art Nouveau', 'Bauhaus', 'Architecture', 'Industrial design', 'Illustration', 'Printmaking', 'Art movement'],
    grade11: ['Contemporary art', 'Pop art', 'Andy Warhol', 'Minimalism', 'Conceptual art', 'Performance art', 'Installation art', 'Street art', 'Photography', 'Film'],
    grade12: ['Art theory', 'Aesthetics', 'Art criticism', 'Museum', 'Curator', 'Art market', 'Visual culture', 'Semiotics', 'Portfolio (art)', 'Art school'],
    college1: ['Art history', 'Aesthetics', 'Visual arts', 'Drawing', 'Painting', 'Colour theory', 'Composition (visual arts)', 'Design'],
    college2: ['Digital art', 'Computer graphics', 'Animation', 'Graphic design', 'Typography', 'User interface design', 'Illustration', 'Photography'],
    college3: ['Art criticism', 'Art theory', 'Modernism', 'Postmodernism', 'Visual culture', 'Semiotics', 'Iconography', 'Aesthetics'],
    college4: ['Contemporary art', 'Conceptual art', 'Installation art', 'New media art', 'Generative art', 'Art and technology', 'Exhibition', 'Portfolio (art)'],
    grad: ['Aesthetics', 'Philosophy of art', 'Art theory', 'Visual culture', 'Semiotics', 'Creativity', 'Perception', 'Colour'],
    phd: ['Computational creativity', 'Generative art', 'Aesthetics', 'Perception', 'Visual perception', 'Colour vision', 'Creativity', 'Cognitive science'],
  },

  // PE — kindergarten to grade12. Knowledge half: how the body moves, the
  // rules of games, training, safety, injury.
  pe: {
    kindergarten: ['Running', 'Jumping', 'Walking', 'Ball', 'Game', 'Balance', 'Exercise', 'Playground'],
    grade1: ['Exercise', 'Running', 'Throwing', 'Catching', 'Balance', 'Muscle', 'Heart', 'Stretching'],
    grade2: ['Physical fitness', 'Exercise', 'Team sport', 'Football', 'Basketball', 'Swimming', 'Muscle', 'Skeleton'],
    grade3: ['Physical fitness', 'Aerobic exercise', 'Basketball', 'Soccer', 'Baseball', 'Gymnastics', 'Sportsmanship', 'Heart rate'],
    grade4: ['Physical fitness', 'Endurance', 'Strength training', 'Volleyball', 'Track and field', 'Swimming', 'Muscle', 'Respiratory system'],
    grade5: ['Physical fitness', 'Cardiovascular fitness', 'Flexibility', 'Team sport', 'Tennis', 'Athletics (sport)', 'Nutrition', 'Hydration'],
    grade6: ['Exercise physiology', 'Muscle', 'Skeletal muscle', 'Cardiovascular system', 'Aerobic exercise', 'Anaerobic exercise', 'Sport', 'Olympic Games', 'Injury', 'Warming up'],
    grade7: ['Physical fitness', 'Strength training', 'Endurance training', 'Sports injury', 'First aid', 'Basketball', 'Soccer', 'Athletics (sport)', 'Teamwork', 'Sportsmanship'],
    grade8: ['Exercise physiology', 'Metabolism', 'Nutrition', 'Body mass index', 'Muscle contraction', 'Oxygen', 'Sport psychology', 'Training', 'Stretching', 'Rest'],
    grade9: ['Physical education', 'Kinesiology', 'Anatomy', 'Human musculoskeletal system', 'Cardiorespiratory fitness', 'Weight training', 'Sports medicine', 'Doping in sport', 'Nutrition', 'Hydration'],
    grade10: ['Exercise physiology', 'Sports science', 'Biomechanics', 'Motor learning', 'Athletic training', 'Sports injury', 'Rehabilitation', 'Physical therapy', 'Fitness', 'Endurance'],
    grade11: ['Sports psychology', 'Motivation', 'Goal setting', 'Team dynamics', 'Coaching', 'Sports nutrition', 'Recovery', 'Overtraining', 'Sleep', 'Stress management'],
    grade12: ['Lifetime fitness', 'Public health', 'Physical activity', 'Sedentary lifestyle', 'Obesity', 'Exercise prescription', 'Wellness', 'Yoga', 'Pilates', 'Recreation'],
  },

  // MUSIC — kindergarten to grade12. Knowledge half: notation, theory, the
  // instruments, and the history she will one day have opinions about.
  music: {
    kindergarten: ['Music', 'Song', 'Singing', 'Drum', 'Rhythm', 'Loudness', 'Nursery rhyme', 'Dance'],
    grade1: ['Music', 'Rhythm', 'Melody', 'Musical instrument', 'Piano', 'Drum', 'Singing', 'Beat (music)'],
    grade2: ['Melody', 'Rhythm', 'Pitch (music)', 'Musical note', 'Guitar', 'Violin', 'Flute', 'Choir'],
    grade3: ['Musical notation', 'Musical note', 'Staff (music)', 'Clef', 'Scale (music)', 'Tempo', 'Orchestra', 'Percussion instrument'],
    grade4: ['Musical notation', 'Major scale', 'Minor scale', 'Chord (music)', 'Harmony', 'Orchestra', 'String instrument', 'Wind instrument'],
    grade5: ['Music theory', 'Key (music)', 'Time signature', 'Chord (music)', 'Harmony', 'Composer', 'Symphony', 'Folk music'],
    grade6: ['Music theory', 'Musical form', 'Classical music', 'Wolfgang Amadeus Mozart', 'Ludwig van Beethoven', 'Johann Sebastian Bach', 'Orchestra', 'Opera', 'Concerto', 'Sonata'],
    grade7: ['Music history', 'Baroque music', 'Classical period (music)', 'Romantic music', 'Jazz', 'Blues', 'Improvisation', 'Musical instrument', 'Rhythm', 'Syncopation'],
    grade8: ['Popular music', 'Rock music', 'Jazz', 'Blues', 'Hip hop music', 'Electronic music', 'Recording studio', 'Sound recording and reproduction', 'Music genre', 'Songwriting'],
    grade9: ['Music theory', 'Harmony', 'Counterpoint', 'Chord progression', 'Music notation', 'Ear training', 'Composition (music)', 'Music genre', 'Rock music', 'Punk rock'],
    grade10: ['Music history', 'Twentieth-century music', 'Modernism (music)', 'Minimal music', 'Film score', 'Musical theatre', 'Music industry', 'Copyright', 'Record label', 'Concert'],
    grade11: ['Music production', 'Digital audio workstation', 'Synthesizer', 'Sampling (music)', 'Mixing (recorded music)', 'Acoustics', 'Sound', 'Frequency', 'Amplitude', 'Timbre'],
    grade12: ['Musicology', 'Ethnomusicology', 'Music criticism', 'Music and emotion', 'Psychoacoustics', 'Music therapy', 'Subculture', 'Goth subculture', 'Gothic rock', 'Alternative rock'],
  },

  // HEALTH — kindergarten to grade12. ⛔ The content boundary LAW governs this
  // subject directly: the LEARN axis is never gated (she learns her body, her
  // cycle, puberty, substances and consent at the real age a student does),
  // while explicitness is gated separately. Clinical, age-true, not prudish.
  health: {
    kindergarten: ['Hygiene', 'Hand washing', 'Tooth brushing', 'Sleep', 'Food', 'Vegetable', 'Fruit', 'Safety'],
    grade1: ['Hygiene', 'Health', 'Nutrition', 'Exercise', 'Sleep', 'Germ', 'Disease', 'Doctor'],
    grade2: ['Nutrition', 'Food group', 'Vitamin', 'Exercise', 'Hygiene', 'Dental care', 'Sleep', 'First aid'],
    grade3: ['Human body', 'Skeleton', 'Muscle', 'Heart', 'Lung', 'Digestion', 'Nutrition', 'Illness'],
    grade4: ['Human body', 'Circulatory system', 'Respiratory system', 'Digestive system', 'Nervous system', 'Nutrition', 'Immune system', 'Vaccine'],
    grade5: ['Puberty', 'Human development', 'Hygiene', 'Nutrition', 'Mental health', 'Emotion', 'Stress (biology)', 'Bullying'],
    grade6: ['Puberty', 'Adolescence', 'Menstruation', 'Reproductive system', 'Hormone', 'Hygiene', 'Nutrition', 'Mental health', 'Self-esteem', 'Peer pressure'],
    grade7: ['Adolescence', 'Human sexuality', 'Reproductive health', 'Contraception', 'Sexually transmitted infection', 'Substance abuse', 'Tobacco smoking', 'Alcohol', 'Mental health', 'Depression'],
    grade8: ['Mental health', 'Anxiety', 'Depression', 'Stress management', 'Nutrition', 'Eating disorder', 'Body image', 'Substance abuse', 'Addiction', 'Consent'],
    grade9: ['Health', 'Public health', 'Nutrition', 'Human sexuality', 'Sexual health', 'Contraception', 'Consent', 'Mental health', 'Suicide prevention', 'Drug', 'Addiction', 'First aid'],
    grade10: ['Human anatomy', 'Physiology', 'Immune system', 'Infectious disease', 'Chronic condition', 'Epidemiology', 'Vaccination', 'Public health', 'Health care', 'Preventive healthcare'],
    grade11: ['Mental health', 'Psychiatry', 'Therapy', 'Cognitive behavioral therapy', 'Substance use disorder', 'Harm reduction', 'Sexual health', 'Relationship', 'Domestic violence', 'Self-care'],
    grade12: ['Public health', 'Health policy', 'Health insurance', 'Nutrition', 'Wellness', 'Preventive healthcare', 'Reproductive rights', 'Bioethics', 'End-of-life care', 'Health literacy'],
  },

  // LANGUAGE — foreign language, grade3 to grade12. Spanish is the default
  // second language in the US scope-sequence the curriculum follows.
  language: {
    grade3: ['Spanish language', 'Greeting', 'Number', 'Color', 'Family', 'Alphabet', 'Pronunciation', 'Vocabulary'],
    grade4: ['Spanish language', 'Grammar', 'Noun', 'Verb', 'Adjective', 'Vocabulary', 'Pronunciation', 'Spain'],
    grade5: ['Spanish language', 'Grammatical gender', 'Article (grammar)', 'Verb', 'Grammatical conjugation', 'Vocabulary', 'Mexico', 'Latin America'],
    grade6: ['Spanish language', 'Grammatical conjugation', 'Grammatical tense', 'Pronoun', 'Adjective', 'Sentence (linguistics)', 'Hispanic culture', 'Spain'],
    grade7: ['Spanish grammar', 'Grammatical tense', 'Past tense', 'Future tense', 'Preposition', 'Adverb', 'Idiom', 'Latin American culture'],
    grade8: ['Spanish grammar', 'Subjunctive mood', 'Imperative mood', 'Reflexive verb', 'Direct object', 'Indirect object', 'Spanish literature', 'Translation'],
    grade9: ['Spanish language', 'Spanish grammar', 'Spanish literature', 'Linguistics', 'Second-language acquisition', 'Bilingualism', 'Translation', 'Culture of Spain'],
    grade10: ['Spanish literature', 'Miguel de Cervantes', 'Don Quixote', 'Latin American literature', 'Gabriel Garcia Marquez', 'Poetry', 'Translation', 'Idiom'],
    grade11: ['Second-language acquisition', 'Linguistics', 'Phonetics', 'Syntax', 'Semantics', 'Bilingualism', 'Language contact', 'Dialect'],
    grade12: ['Linguistics', 'Language', 'Etymology', 'Historical linguistics', 'Romance languages', 'Latin', 'Language family', 'Sociolinguistics'],
  },

  // AP — grade11 and grade12 only. Advanced-placement courses are the
  // college-level versions of subjects she is already taking, which is exactly
  // what the band should carry.
  ap: {
    grade11: ['Advanced Placement', 'Calculus', 'Statistics', 'Biology', 'Chemistry', 'Physics', 'World history', 'English literature', 'Psychology', 'Computer science'],
    grade12: ['Advanced Placement', 'Calculus', 'Macroeconomics', 'Microeconomics', 'Government', 'Comparative politics', 'Art history', 'Literature', 'Research', 'Seminar'],
  },
};

function clean(extract, maxSent) {
  if (!extract) return [];
  // Cap is passed per CELL (grade-banded) — never a module constant. An absent
  // cap means the caller forgot, and the smallest band is the safe answer.
  const CAP = Number.isFinite(maxSent) && maxSent > 0 ? maxSent : SENT_CAP_BY_BAND.early;
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
    // ⛔ THE OTHER BRACKETS, HANDLED 2026-09-02 — and they split into two kinds,
    // which is why one rule for both would be wrong.
    //   • APPARATUS gets DELETED: "[citation needed]", "[sic]", "[copyright 1894]",
    //     "[edit]" — reference furniture that is not prose.
    //   • EDITORIAL CLARIFICATION gets UNWRAPPED, keeping the words: encyclopedia
    //     quotations insert them to make a quote parse — "formulated by [alfred]
    //     pollard", "the end [of life] is a sort of action". Deleting those loses
    //     real content; keeping the brackets teaches her a punctuation mark that
    //     means nothing in her own sentences. Unwrapping keeps the meaning and
    //     drops the furniture.
    .replace(/\[\s*(?:citation needed|sic|edit|clarification needed|copyright[^\]]*|according to whom[^\]]*)\s*\]/gi, ' ')
    .replace(/\[([^\[\]]{1,60})\]/g, '$1')
    .replace(/\([^)]*\)/g, ' ')            // parentheticals (often dates/pron)
    .replace(/\s+/g, ' ');
  const out = [];
  for (let s of t.split(/(?<=[.!?])\s+/)) {
    s = s.trim();
    if (!acceptSentence(s)) continue;
    out.push(s.toLowerCase());
    if (out.length >= CAP) break;
  }
  return out;
}

// ⭐ THE SINGLE SOURCE OF TRUTH FOR "IS THIS A SENTENCE SHE SHOULD LEARN".
// Split out of clean() so it can be applied to ALREADY-BANKED prose as well as
// to a fresh download (see --reclean below). Before this split the rules lived
// only inside the fetch path, which meant every cleaner improvement applied to
// future downloads and left the existing corpus carrying whatever the old rules
// had let through — and the keep-longer merge guaranteed the old, dirtier entry
// would WIN a re-run, because it was longer.
function acceptSentence(s) {
  if (!s) return false;
  {
    if (s.length < SENT_MIN || s.length > SENT_MAX) return false;
    if (/[^\x20-\x7e]/.test(s)) return false;      // ASCII only (brain is a-z)
    if (/may refer to|disambiguation|listen|born|\bb\.\b/i.test(s)) return false;
    // ⛔ MATH MARKUP IS NOT PROSE, AND IT WAS GETTING THROUGH. Wikipedia's
    // plaintext extract still carries LaTeX for rendered formulae, so a maths
    // or CS article yields sentences like
    //   "u - 1 } {\displaystyle u=\{0,...,u-1\}} , where the bit length of u"
    // Measured across the corpus before this filter: 138 sentences carrying
    // brace debris, 8 with `over{`, 4 with stray backslash commands. She would
    // have learned `\displaystyle` as an English word.
    // ⭐ DROP, do not repair. A sentence that is half formula is not prose with
    // a blemish — the surviving half has no grammatical subject and teaching it
    // is worse than losing it, and the article's real prose sentences survive
    // on their own.
    if (/\\displaystyle|\\[a-z]{2,}\s*\{|size\s+\d+\s*\{/i.test(s)) return false;
    if ((s.match(/[{}]/g) || []).length >= 2) return false;   // braces are not English punctuation
    // A reference whose target was stripped, leaving "as shown in ." — the
    // sentence now points at nothing and teaches a dangling gesture.
    if (/\b(as shown in|as illustrated in|shown in|illustrated in|see)\s*[.,]/i.test(s)) return false;
    if (!/[a-z]/.test(s) || !/[.!?]$/.test(s)) return false;
  }
  return true;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Run-level tally of WHY topics were skipped. Printed at the end so a run
// reports "23 throttled, 4 no-such-page" instead of a silent shortfall that
// reads as "the source has nothing" — the misreading that survived four passes.
const SKIP_REASONS = new Map();

// FC.9 — grade-appropriate reading level. Early grades MUST prefer Simple
// English Wikipedia (accessible prose) over full en.wikipedia.org (college-
// level density). The prior order tried full Wikipedia first, so a K cell got
// "animals are multicellular, eukaryotic organisms belonging to the biological
// kingdom Animalia" — years above a 5-year-old, and it bound on words she
// never learned. Early grades now fetch simple-first (fall back to full only
// when Simple lacks the page); higher grades keep full-first since their topics
// (plate tectonics, photosynthesis, periodic table) are genuinely at that level
// and Simple often lacks depth.
// ⛔ `pre-K` WAS MISSING FROM THIS SET AND IT IS THE FIRST GRADE OF THE WALK.
// While pre-K had no topics the omission was invisible; the moment topics were
// added (2026-09-01) it would have fetched FULL English Wikipedia for a
// four-year-old — the exact reading-level defect the note below describes,
// landing on the very first cell she is ever taught. Caught before the run.
const EARLY_GRADES = new Set(['pre-K', 'pre-k', 'prek', 'kindergarten', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5']);

// ⛔⛔ THE THROTTLE WAS INVISIBLE, AND THAT IS WHY 147 TOPICS CAME BACK EMPTY.
//
// `CORPUSGAP.7` established that the wiki API answers a burst with the plain
// text `"You are making too many requests"` — NOT JSON. The old body of this
// function called `await r.json()` on that, which THROWS, and the bare `catch`
// below it swallowed the throw. A throttled topic and a genuinely contentless
// topic produced the identical outcome: `[]`, logged as "no usable content".
//
// That is the same defect class this project keeps paying for — a decline with
// five possible causes reported as one indistinguishable result. The fix is the
// same one used everywhere else here: MAKE IT NAME ITS OWN BLOCKER.
//
// ⚠ And a fixed inter-request sleep can never solve it, which was measured:
// widening the between-cell gap 4s -> 8s -> 20s produced no gain at any value,
// because the burst that trips the limit happens INSIDE a cell. A run at 3s
// in-cell spacing still lost 147 topics. Backoff has to react to the throttle
// RESPONSE, which first requires being able to SEE it.
function classifyBody(status, text) {
  if (status === 429) return 'throttled';
  if (/too many requests|rate ?limit|retry.after/i.test(text || '')) return 'throttled';
  if (status >= 500) return 'server';
  if (!status || status >= 400) return `http-${status}`;
  return 'ok';
}

// A topic is either a plain string (Wikipedia) or {t, host} naming another
// MediaWiki wiki — Wikibooks, for the bands OpenStax does not reach.
//
// ⛔ WIKIBOOKS LIVES HERE RATHER THAN IN ITS OWN SCRIPT, AND THE REASON WAS
// MEASURED: it is the same MediaWiki API family as Wikipedia and shares
// Wikimedia's PER-IP rate limit. A probe run during this build returned HTTP
// 429 "You are making too many requests" while the Wikipedia pass was going.
// A second concurrent MediaWiki fetcher would compete for one budget instead
// of adding throughput — so the shelf becomes extra TOPICS on the existing
// paced, throttle-aware fetcher, and inherits its backoff, banded caps,
// per-entry licence and keep-longer merge for free.
const topicTitle = (t) => (typeof t === 'string' ? t : t.t);
const topicHosts = (t, preferSimple) => {
  if (typeof t !== 'string' && t.host) return [t.host];
  return preferSimple
    ? ['simple.wikipedia.org', 'en.wikipedia.org']
    : ['en.wikipedia.org', 'simple.wikipedia.org'];
};

async function fetchExtract(title, preferSimple = false, maxSent = SENT_CAP_BY_BAND.early, hostsOverride = null) {
  const hosts = hostsOverride || (preferSimple
    ? ['simple.wikipedia.org', 'en.wikipedia.org']
    : ['en.wikipedia.org', 'simple.wikipedia.org']);
  let lastReason = 'no-content';
  // Exponential backoff with a real ceiling. Throttle recovery is measured in
  // tens of seconds, not the 700ms the old ladder allowed, so the ladder now
  // reaches ~48s before giving up rather than ~2.8s.
  const BACKOFF = [1500, 6000, 18000, 48000];
  for (let attempt = 0; attempt < BACKOFF.length + 1; attempt++) {
    let throttledThisPass = false;
    for (const host of hosts) {
      const url = `https://${host}/w/api.php?format=json&action=query&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}`;
      let status = 0, text = '';
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA } });
        status = r.status;
        // Read as TEXT first — the throttle reply is not JSON, and parsing it
        // as JSON is what made the throttle invisible for four ingest passes.
        text = await r.text();
      } catch (e) {
        lastReason = 'network';
        continue;
      }
      const kind = classifyBody(status, text);
      if (kind === 'throttled' || kind === 'server') {
        throttledThisPass = true;
        lastReason = kind;
        continue;
      }
      if (kind !== 'ok') { lastReason = kind; continue; }
      let j = null;
      try { j = JSON.parse(text); }
      catch { throttledThisPass = true; lastReason = 'non-json'; continue; }
      const pages = j?.query?.pages || {};
      for (const k of Object.keys(pages)) {
        if (pages[k].missing !== undefined) { lastReason = 'no-such-page'; continue; }
        const sents = clean(pages[k].extract, maxSent);
        if (sents.length >= 3) return { sents, host, reason: 'ok' };
        lastReason = sents.length ? 'too-few-sentences' : 'no-content';
      }
    }
    // Only spend backoff on conditions backoff can actually fix. A page that
    // does not exist will not start existing, and re-requesting it is the
    // burst that throttles the NEXT topic.
    if (!throttledThisPass) break;
    if (attempt < BACKOFF.length) await sleep(BACKOFF[attempt]);
  }
  return { sents: [], host: null, reason: lastReason };
}

// ⭐⭐ THE PICTURES, AND THE ARTICLE PROSE THEY SIT INSIDE.
//
// This lane reached more cells than any other and harvested no images at all —
// so the cells with the LEAST prose also had the FEWEST pictures, which is
// backwards from what a thin cell needs. The three book lanes each grew a figure
// harvest; this is the same shape for the encyclopedia.
//
// ⛔ TWO REQUESTS, NOT EIGHT, AND THE CHOICE IS LOAD-BEARING. The obvious build
// is `page/media-list` for captions plus one `action=parse&section=N` per
// section an image sits in — that is 8+ requests per article on an API this
// ingest has already been throttled off four separate times, and the throttle
// is the in-cell BURST, not the gap between cells. `action=parse&prop=text`
// returns the WHOLE article as HTML in ONE request, with every `<img>` inline
// and every `<figcaption>` beside it, so the context can be cut positionally —
// the same window technique the Saylor lane uses — for the same one request.
// The second request prices the licences for every file at once.
//
// ⛔⛔ LICENCE IS PER FILE, NOT PER ARTICLE, AND THAT IS NOT A TECHNICALITY. A
// CC-BY-SA article can legitimately carry a non-free image under fair use, and
// fair use is a doctrine about a specific use — it does not travel into a corpus
// this project publishes. Every file's own `LicenseShortName` is read, and
// anything that is not a public-domain or CC mark is refused. ⚠ ND is refused
// here for the same reason the book lanes refuse it: this corpus publishes an
// adaptation.
// ⛔⛔⛔ REMOVED 2026-09-02 — THERE IS NO CAP ON FIGURES. Retained only as a
// named constant so nothing references a deleted symbol; it is NOT consulted.
// Measured cost of the cap before it went: 372 of 1,848 articles clipped.
const WIKI_FIG_PER_ARTICLE = Infinity;

// ⛔⛔ WIKIPEDIA CHROME IS REMOVED BEFORE ANY INDEX IS TAKEN, AND IT HAD BEEN
// BECOMING A FIGURE'S "LINKED TEXT" (measured 2026-09-02).
//
// A harness on a real queued figure printed its binding phrase as:
//     "icon this article needs more citations . please help improve this
//      article by adding citati…"
// — a maintenance banner, standing in for the prose that references the picture.
// Swept across the whole corpus: **994 of 20,420 contexts (4.9%) were not
// subject prose** — 491 citation banners, 217 navigation strings, 187 naming
// Wikipedia itself, 99 other templates — and **952 of the 994 came from these
// two wiki lanes.**
//
// ⭐ STRUCTURAL, NOT A WORD LIST. Those banners live in known containers
// (`ambox`, `hatnote`, `navbox`, `metadata`, `mbox`, `reflist`, edit links), so
// removing the ELEMENTS kills the whole class — including templates nobody has
// seen yet — where a phrase blacklist would only catch the wordings already
// observed. This project's standing rule is the same one: classify by structure,
// never by a list of strings.
//
// ⚠ MUST RUN ONCE ON THE WHOLE DOCUMENT, BEFORE `<img>` OFFSETS ARE COLLECTED.
// The context window is cut by byte index around each image, so stripping
// elements afterwards would shift every offset and slide each figure's text off
// the picture it belongs to.
function stripWikiChrome(html) {
  let h = String(html || '');
  h = h.replace(/<table[^>]*class="[^"]*\b(ambox|navbox|metadata|mbox|sistersitebox|infobox-subbox)\b[^"]*"[\s\S]*?<\/table>/gi, ' ');
  h = h.replace(/<div[^>]*class="[^"]*\b(hatnote|ambox|navbox|metadata|mbox-text|reflist|thumbcaption-nav|shortdescription)\b[^"]*"[\s\S]*?<\/div>/gi, ' ');
  h = h.replace(/<div[^>]*role="note"[\s\S]*?<\/div>/gi, ' ');
  h = h.replace(/<span[^>]*class="[^"]*\bmw-editsection\b[^"]*"[\s\S]*?<\/span>/gi, ' ');
  h = h.replace(/<sup[^>]*class="[^"]*\b(reference|noprint)\b[^"]*"[\s\S]*?<\/sup>/gi, ' ');
  return h;
}

function wikiFigContext(html, index, cap) {
  const strip = (x) => String(x)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ');
  const W = 1600;
  // The head segment of `before` is the one the window cut can have truncated
  // mid-sentence while still ending it at a full stop — discarded for the same
  // reason as in the book lanes, where a harness caught exactly that fragment.
  const before = clean(strip(html.slice(Math.max(0, index - W), index)), cap).slice(1);
  const after = clean(strip(html.slice(index, index + W)), cap);
  return [...before.slice(-2), ...after.slice(0, 2)].join(' ').replace(/\s+/g, ' ').trim().slice(0, 700);
}

// Commons file name out of an upload URL:
//   //upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Name.jpg/330px-Name.jpg
//   //upload.wikimedia.org/wikipedia/commons/a/ab/Name.jpg
function wikiFileName(src) {
  const m = /\/wikipedia\/[a-z]+\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/i.exec(String(src || ''));
  if (!m) return '';
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

// A licence mark this corpus may publish an adaptation of. Public domain and CC
// marks pass; ND is refused; anything unrecognised — including every fair-use
// tag — is refused rather than guessed at, because a guessed licence passes the
// "licence recorded" check while being unverified, which is worse than none.
function wikiLicenceOk(short) {
  const s = String(short || '').trim();
  if (!s) return null;
  if (/\bND\b|NoDeriv/i.test(s)) return null;
  if (/^(public domain|pd(-|$)|cc0)/i.test(s)) return { id: s, ok: true };
  if (/^cc[ -]?by/i.test(s)) return { id: s, ok: true };
  return null;
}

// ⛔⛔⛔ THIS FUNCTION SHIPPED THE EXACT BUG THIS INGEST WAS BUILT TO STOP, AND A
// HARNESS CAUGHT IT BEFORE IT RAN. The first cut swallowed every non-ok body and
// returned an empty array, so a **429 throttle read as "this article has no
// pictures"** — indistinguishable from the truth, permanent once merged, and
// invisible in the log. That is the same defect that already cost this lane 147
// topics in one run, that had Wikibooks calling rate-limiting "not a book", and
// that this file's own `fetchExtract` carries a four-step backoff ladder to
// avoid. Writing it a fourth time in the function that harvests the pictures is
// the reason the ladder is duplicated here rather than assumed.
//
// The reason is RETURNED, not logged and dropped: the caller prints it, so
// "no figures" and "throttled" can never again render as the same line.
async function fetchFigures(title, host, cap) {
  if (!host) return { figures: [], reason: 'no-host' };
  let lastKind = 'no-content';
  const BACKOFF = [1500, 6000, 18000, 48000];
  const get = async (url) => {
    for (let attempt = 0; attempt <= BACKOFF.length; attempt++) {
      let status = 0, text = '';
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA } });
        status = r.status;
        // Read as TEXT first. The throttle reply is not JSON, and parsing it as
        // JSON is what made the throttle invisible for four ingest passes.
        text = await r.text();
      } catch { lastKind = 'network'; return null; }
      const kind = classifyBody(status, text);
      if (kind === 'throttled' || kind === 'server') {
        lastKind = kind;
        if (attempt < BACKOFF.length) { await sleep(BACKOFF[attempt]); continue; }
        return null;
      }
      if (kind !== 'ok') { lastKind = kind; return null; }
      try { return JSON.parse(text); } catch { lastKind = 'non-json'; return null; }
    }
    return null;
  };

  const parsed = await get(`https://${host}/w/api.php?format=json&action=parse&prop=text&redirects=1&page=${encodeURIComponent(title)}`);
  const rawHtml = parsed?.parse?.text?.['*'];
  if (!rawHtml) return { figures: [], reason: parsed ? 'no-html' : lastKind };
  // ⚠ Chrome out FIRST, so every `<img>` offset below is an offset into the
  // same document the context window is cut from. See `stripWikiChrome`.
  const html = stripWikiChrome(rawHtml);

  const found = [];
  const seenFile = new Set();
  for (const m of String(html).matchAll(/<img\b([^>]*)>/gi)) {
    // ⛔⛔⛔ NO CAP ON FIGURES. EVER. (Gee 2026-09-02: *"THERE IS NOT CAP TO
    // FIGURES!!! REMOVE IT"*.) This loop used to stop at
    // `WIKI_FIG_PER_ARTICLE = 12`, which CLIPPED 372 of 1,848 articles in the
    // last run — one article in five silently lost pictures, and the log printed
    // a confident "12 fig" as though that were the whole article.
    //
    // ⭐ Every illustration in the curriculum is training data: it goes to her
    // eyes through the forward CDF 9/7 transform and is bound to the prose it
    // sits inside. A cap on figures is a cap on what she can SEE, and it is the
    // same class of defect as every other bound found today — the walk reached
    // the head of the material and reported the head as the whole.
    const attrs = m[1];
    const src = (/\bsrc="([^"]+)"/i.exec(attrs) || [])[1] || '';
    const file = wikiFileName(src);
    if (!file) continue;                                  // icons, maths renders, sprites
    if (/\.svg$/i.test(file) && /icon|logo|symbol|arrow|edit/i.test(file)) continue;
    if (seenFile.has(file)) continue;
    seenFile.add(file);
    const alt = ((/\balt="([^"]*)"/i.exec(attrs) || [])[1] || '').replace(/\s+/g, ' ').trim();
    // The caption is the <figcaption> of the enclosing <figure>, which follows
    // the image in every current MediaWiki skin.
    const after = String(html).slice(m.index, m.index + 900);
    const capM = /<figcaption[^>]*>([\s\S]{0,400}?)<\/figcaption>/i.exec(after);
    // ⚠ NUMERIC entities before named ones, and both before the named-entity
    // sweep replaces things with a space. Caught by reading a real caption:
    // "Mount Fuji, an active stratovolcano in Japan that last erupted in
    // 1707&#8211;08" shipped with the raw entity in it, because the sweep only
    // knew `&[a-z]+;`. A raw entity is not a word and would train as one.
    const caption = capM
      ? capM[1].replace(/<[^>]+>/g, ' ')
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
        .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/[‘’‚‛′]/g, "'").replace(/[“”„‟″]/g, '"')
        .replace(/[‐-―−]/g, '-').replace(/[…]/g, '...')
        .replace(/\s+/g, ' ').trim()
      : '';
    const context = wikiFigContext(html, m.index, cap);
    // Same refusal every figure lane makes: an image with no words to bind to is
    // the `CAMPOISON` defect, where an unlabelled frame fuses with whatever word
    // happens to be current and becomes a false memory.
    if (!alt && !caption && context.length < 40) continue;
    found.push({ file, alt, caption, context });
  }
  if (!found.length) return { figures: [], reason: 'no-labelled-images' };

  // ONE licence request for every file this article contributed.
  const titles = found.map((f) => `File:${f.file}`).join('|');
  const info = await get(`https://${host}/w/api.php?format=json&action=query&prop=imageinfo&iiprop=url|extmetadata&titles=${encodeURIComponent(titles)}`);
  if (!info) return { figures: [], reason: `licence-lookup-${lastKind}` };
  const pages = info?.query?.pages || {};
  const byName = new Map();
  for (const k of Object.keys(pages)) {
    const p = pages[k];
    const ii = (p.imageinfo || [])[0];
    if (!ii) continue;
    const name = String(p.title || '').replace(/^File:/i, '');
    byName.set(name.replace(/_/g, ' '), ii);
  }

  const out = [];
  for (const f of found) {
    const ii = byName.get(f.file.replace(/_/g, ' '));
    if (!ii || !ii.url) continue;                          // no file record — refuse
    const lic = wikiLicenceOk(ii.extmetadata?.LicenseShortName?.value);
    if (!lic) continue;                                    // unverified or ND — refuse
    out.push({ src: ii.url, alt: f.alt, caption: f.caption, context: f.context, licence: lic.id });
  }
  // ⚠ `all-refused` is a real and different outcome from `no-labelled-images`:
  // it means the article HAS captioned pictures and every one of them failed the
  // licence test. Collapsing the two would hide a licence posture that is too
  // tight behind a claim that the article is illustration-free.
  return { figures: out, reason: out.length ? 'ok' : 'all-refused' };
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
  const wanted = titles.filter((t) => !already.has(topicTitle(t).toLowerCase().replace(/[^a-z0-9]+/g, '-')));
  if (ONLY_MISSING && wanted.length !== titles.length) {
    process.stdout.write(`  ${subject}/${grade}: ${already.size} already banked, requesting ${wanted.length} missing\n`);
  }
  const CAP = sentCapFor(grade);
  for (const topic of wanted) {
    const title = topicTitle(topic);
    const got = await fetchExtract(title, preferSimple, CAP, (typeof topic !== 'string' && topic.host) ? [topic.host] : null);
    const sents = (got && got.sents) || [];
    if (sents.length) {
      // Licence is recorded PER ENTRY, not claimed once at the file level. The
      // ingest spans sources with different licences (and per-article licences
      // at arXiv/PMC), so a blanket file-level claim would be a guess the
      // moment a second source lands. TEACHVIEW's "source licence not recorded
      // on an entry" flag reads this field.
      const entry = {
        theme: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        story: sents.join(' '),
        source: got.host,
        licence: 'CC-BY-SA-3.0',
      };
      // The pictures ride the entry that owns their article, so a percept binds
      // under the SAME theme its prose trained under — and each one carries the
      // article text it sits inside, which is what makes the reference between
      // the words and the image a match rather than an inference.
      //
      // ⛔ Attached only when non-empty. An empty array on every entry would read
      // as "images were looked for and none exist", which is a different claim
      // from "this ran before the figure lane existed" — and the second is true
      // of every cell ingested before today.
      let figs = [], figWhy = 'threw';
      try { const g = await fetchFigures(title, got.host, CAP); figs = g.figures; figWhy = g.reason; }
      catch { figs = []; figWhy = 'threw'; }
      if (figs.length) entry.figures = figs;
      // ⛔ The reason is PRINTED whenever no picture came back, never suppressed.
      // "0 figures" and "throttled off the API" must not render as the same line;
      // that equivalence is the single most expensive bug in this file's history.
      const figNote = figs.length ? `, ${figs.length} fig` : (figWhy === 'ok' ? '' : `, no fig (${figWhy})`);
      experiences.push(entry);
      process.stdout.write(`  ${subject}/${grade}: ${title} (${sents.length}/${CAP}${figNote})\n`);
    } else {
      // Name the blocker. "no usable content" was one label over five distinct
      // causes, and it hid a throttle that cost 147 topics in a single run.
      const why = (got && got.reason) || 'unknown';
      SKIP_REASONS.set(why, (SKIP_REASONS.get(why) || 0) + 1);
      process.stdout.write(`  ${subject}/${grade}: ${title} — SKIPPED (${why})\n`);
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
    //
    // ⛔⛔ SAME SOURCE WINS OUTRIGHT — the clause five of the six fetchers already
    // had and this one did not, which made every repair run against it a
    // guaranteed no-op. Keep-longer alone compares a re-fetch of the SAME topic
    // against itself: the prose is identical, `>` is false, the old entry wins,
    // and any improvement that does not LENGTHEN the text can never land — a
    // figure's `context`, a corrected licence, the `stripWikiChrome` boilerplate
    // fix, a new field entirely.
    //
    // This is not hypothetical. The identical missing clause in
    // `fetch-openstax-corpora.mjs` held 7,055 figures with no `context` key at
    // all, and re-running that fetcher rewrote the cells, logged success and
    // changed nothing, twice, before the merge was suspected instead of the
    // harvest. ⚠ It also means this fetcher could not repair an entry lost to
    // the two concurrent ingests — the audit `CELLRACE.2` asked for.
    const sameSource = old && old.source === e.source;
    if (REPLACE || !old || sameSource || e.story.length > old.story.length) { byTheme.set(e.theme, e); continue; }
    // ⛔⛔ THE KEEP-LONGER RULE WOULD HAVE THROWN AWAY EVERY PICTURE. The old
    // entry wins whenever its story is at least as long — which is the normal
    // case on a re-fetch of the same article — and the winner is the entry from
    // BEFORE this lane harvested images, so the figures would be discarded on
    // exactly the runs that exist to add them. This is the same trap `--reclean`
    // was written for: an improvement that only reaches future downloads never
    // arrives, because the merge prefers the older, longer, worse entry.
    //
    // The story is still the old one — that rule is untouched and still
    // monotonic. Only the figures are adopted, and only onto an entry that has
    // none, so a cell that already holds pictures is never disturbed.
    if (e.figures && e.figures.length && !(old.figures && old.figures.length)) {
      byTheme.set(e.theme, { ...old, figures: e.figures });
    }
  }
  const merged = [...byTheme.values()];
  const doc = {
    version: 1, grade, subject,
    source: 'Simple English Wikipedia (CC-BY-SA), cleaned + sentence-segmented',
    note: `Hybrid academic-depth corpus for ${subject}/${grade}. Trained via curriculum._trainAcademicStories. Real openly-licensed curriculum content; lived-year + math stay bespoke.`,
    experiences: merged,
  };
  // ⛔⛔ ATOMIC, BECAUSE TWO INGESTS SHARE THESE FILES. This lane and the
  // Wikibooks lane overlap on twelve subjects and both do read → merge → write
  // with no lock, so an interleaving can lose one of them entirely. A rename is
  // atomic on both platforms, which turns a torn or lost write into a clean
  // last-writer-wins — the shape the merge is already built for, since every
  // ingest's themes are deterministic and a re-run restores what it lost.
  //
  // ⚠ It does NOT make the read-modify-write a transaction. The remaining race
  // is one whole entry, not a corrupt file, and that is the difference between a
  // shortfall a re-run fixes and a cell nobody can parse.
  const tmp = `${outPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2), 'utf8');
  fs.renameSync(tmp, outPath);
  const n = merged.reduce((a, e) => a + e.story.split(/(?<=[.!?])\s+/).length, 0);
  return n;
}

// ⭐ `--reclean` — RE-APPLY THE CURRENT SENTENCE RULES TO THE EXISTING CORPUS,
// with NO network. This exists because of a real asymmetry that bit:
//
//   Cleaner improvements only ever reached FUTURE downloads. Everything already
//   banked kept whatever the old rules let through — and the keep-longer merge
//   made it permanent, because a re-fetch produces a SHORTER (cleaner) story
//   which the merge then discards in favour of the older, dirtier one.
//
// Measured when the maths-markup filter was added: 1,216 sentences across 70
// cells carried LaTeX debris (`{\displaystyle ...}` from Wikipedia's plaintext
// extract, `size 12{...}` from OpenStax), dangling `as shown in .` references,
// and brace fragments. Re-fetching all 70 cells would have cost ~5 hours of API
// time to fix 0.75% of the corpus; re-cleaning costs seconds and is exact.
//
// ⚠ It only ever REMOVES sentences — it cannot invent or alter prose — so it is
// safe to run at any time, and an entry left with nothing is dropped whole
// rather than banked empty.
if (process.argv.includes('--reclean')) {
  // Declared HERE, not borrowed from the positional parsing further down — that
  // sits below this block and a const in the temporal dead zone throws at the
  // reference rather than reading as undefined.
  const onlySubject = process.argv.slice(2).filter((a) => !a.startsWith('--'))[0] || null;
  let cells = 0, entriesBefore = 0, entriesAfter = 0, sentBefore = 0, sentAfter = 0;
  const touched = [];
  for (const subject of fs.readdirSync(OUT)) {
    const dir = path.join(OUT, subject);
    if (!fs.statSync(dir).isDirectory()) continue;
    if (onlySubject && subject !== onlySubject) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      const fp = path.join(dir, file);
      let doc;
      try { doc = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { continue; }
      const kept = [];
      let dropped = 0, before = 0;
      for (const e of (doc.experiences || [])) {
        entriesBefore++;
        const sents = String(e.story).split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
        before += sents.length;
        const good = sents.filter((x) => acceptSentence(x));
        dropped += sents.length - good.length;
        if (good.length >= 3) { kept.push({ ...e, story: good.join(' ') }); entriesAfter++; }
      }
      sentBefore += before;
      sentAfter += kept.reduce((a, e) => a + e.story.split(/(?<=[.!?])\s+/).length, 0);
      cells++;
      if (dropped > 0) {
        doc.experiences = kept;
        fs.writeFileSync(fp, JSON.stringify(doc, null, 2), 'utf8');
        touched.push(`${subject}/${file.replace(/\.json$/, '')}:${dropped}`);
      }
    }
  }
  console.log(`[reclean] ${cells} cells scanned · ${touched.length} rewritten`);
  console.log(`[reclean] sentences ${sentBefore.toLocaleString()} -> ${sentAfter.toLocaleString()} (${(sentBefore - sentAfter).toLocaleString()} dropped)`);
  console.log(`[reclean] entries   ${entriesBefore.toLocaleString()} -> ${entriesAfter.toLocaleString()}`);
  if (touched.length) console.log(`[reclean] touched: ${touched.join('  ')}`);
  process.exit(0);
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
if (SKIP_REASONS.size) {
  const rows = [...SKIP_REASONS.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`[academic] SKIPPED BY REASON — ${rows.map(([k, v]) => `${k}:${v}`).join('  ')}`);
  const throttled = (SKIP_REASONS.get('throttled') || 0) + (SKIP_REASONS.get('non-json') || 0) + (SKIP_REASONS.get('server') || 0);
  if (throttled > 0) {
    console.log(`[academic] ⚠ ${throttled} topic(s) lost to THROTTLE/transient, not to absent content — re-run to top them up (the merge keeps the longer story per theme, so a re-run can only add).`);
  }
} else {
  console.log('[academic] SKIPPED BY REASON — none');
}
