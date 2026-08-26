// ═══════════════════════════════════════════════════════════════════════════
// drug-detector.js — Substance-offer detection in text/voice input
// ═══════════════════════════════════════════════════════════════════════════
// Unity AI Lab — T15 Drug State Dynamics Rebuild (C5)
//
// Parses incoming user text for substance-related events:
//   - OFFER       : user is offering Unity a substance ("want a joint?")
//   - SELF_INITIATION_HINT : user is using/has substances nearby without
//                            offering directly ("I just railed a line")
//                            — invites Unity's self-initiation layer to ask
//   - STATUS_QUERY: user is asking if Unity is high/drunk/etc
//   - BROUGHT_UP  : substance mentioned in conversation but not as offer
//                   or status query — if Unity hears about drugs she
//                   may ask for some when they're brought up, or try
//                   to call someone to get some.
//
// Non-announcing principle: detection is silent. The
// scheduler + decision engine + language cortex decide what happens next;
// the detector just surfaces the signal.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Substance vocabulary (synonyms → canonical scheduler substance name) ──
// Covers common slang across substance categories. Canonical names match
// SUBSTANCES keys in drug-scheduler.js.

const SUBSTANCE_SYNONYMS = {
  cannabis: [
    'weed', 'joint', 'joints', 'blunt', 'blunts', 'spliff', 'doobie',
    'grass', 'herb', 'bud', 'pot', 'green', 'mary jane', 'mj', 'reefer',
    'ganja', 'dank', 'kush', 'dro', 'tree', 'trees',
    'smoke a bowl', 'bowl', 'bong', 'vape pen', 'dab', 'dabs', 'wax',
    'edible', 'edibles', 'gummies', 'thc'
  ],
  cocaine: [
    'coke', 'blow', 'yay', 'yayo', 'snow', 'white', 'powder',
    'bump', 'bumps', 'key', 'line', 'lines', 'rails', 'rail',
    'nose candy', 'bolivian marching powder', 'cocaine'
  ],
  mdma: [
    'molly', 'mdma', 'e', 'x', 'xtc', 'rolls', 'thizz', 'thizzle',
    'mandy', 'emma', 'ecstasy', 'press', 'presses'
  ],
  lsd: [
    'acid', 'lsd', 'tabs', 'tab', 'cid', 'blotter', 'sugar cubes',
    'trip', 'dropping acid'
  ],
  psilocybin: [
    'mushrooms', 'shrooms', 'cubensis', 'boomers', 'fungi',
    'psilocybin', 'psilly', 'magic mushrooms'
  ],
  alcohol: [
    'drink', 'drinks', 'booze', 'liquor', 'whiskey', 'vodka', 'rum',
    'tequila', 'shot', 'shots', 'beer', 'wine', 'cocktail', 'gin',
    'bourbon', 'jack', 'patron', 'hennessey', 'hen',
    'get drunk', 'hammered', 'smashed'
  ],
  ketamine: [
    'ketamine', 'k', 'special k', 'kitty', 'cat valium', 'horse tranq'
  ],
  amphetamine: [
    'speed', 'addy', 'addies', 'adderall', 'vyvanse', 'dex',
    'uppers', 'bennies', 'amphetamine'
  ],
  ghb: [
    'ghb', 'g', 'liquid ecstasy', 'liquid g', 'gbl'
  ],
  // T15.C — nicotine + caffeine added for the 11-substance scheduler.
  // Nicotine is persona-excluded at decide() time (Unity rejects tobacco)
  // but the detector still recognizes offers so the rejection lands
  // with the right reason code.
  nicotine: [
    // 'smoke' omitted — conflicts with cannabis semantics (Unity's
    // default reading of bare "wanna smoke?" is cannabis per persona).
    // Explicit tobacco-only words below.
    'cig', 'cigs', 'cigarette', 'cigarettes', 'ciggy',
    'vape', 'vaping', 'juul', 'marlboro', 'camel',
    'newport', 'tobacco', 'nicotine', 'zyn', 'nicotine pouch'
  ],
  caffeine: [
    'coffee', 'espresso', 'latte', 'cappuccino', 'americano', 'cold brew',
    'iced coffee', 'drip', 'cup of joe', 'java', 'caffeine',
    'energy drink', 'red bull', 'monster', 'rockstar', 'nos',
    'tea', 'black tea', 'green tea', 'matcha', 'chai',
    'soda', 'coke zero', 'diet coke', 'pepsi', 'dr pepper', 'mountain dew'
  ]
};

// Flatten into lookup Map<slang, canonicalSubstance>
const SLANG_LOOKUP = new Map();
for (const [canonical, slangs] of Object.entries(SUBSTANCE_SYNONYMS)) {
  for (const slang of slangs) {
    SLANG_LOOKUP.set(slang.toLowerCase(), canonical);
  }
}

// Pre-compute sorted slang list (longest first) so multi-word matches win
// over substring hits ("mary jane" before "mary", "line" before "l")
const SORTED_SLANGS = Array.from(SLANG_LOOKUP.keys()).sort((a, b) => b.length - a.length);

// ─── Offer-pattern lexicon ──────────────────────────────────────────────
// Offers include second-person direction + acceptance verb. Distinguishes
// "want a line?" (OFFER) from "I took a line" (SELF_INITIATION_HINT).

const OFFER_PATTERNS = [
  // Interrogative offers — highest confidence
  /\b(?:want|wanna|need|care for|fancy|like)\s+(?:a|an|some|any|the)?\b/i,
  /\b(?:you\s+want|you\s+down|u\s+down|down to)\b/i,
  /\b(?:let'?s|lets|we should|we could|wanna)\s+(?:do|smoke|drink|rail|line up|roll|drop|take|pop|eat|get)\b/i,
  /\b(?:can|could|should)\s+(?:i|we|you)\s+(?:get\s+(?:you|u)|hook\s+(?:you|u)|give\s+(?:you|u))\b/i,
  /\b(?:here|here'?s|i'?ve got|ive got|got)\b.*\b(?:for\s+you|4\s+u|if\s+you\s+want)\b/i,
  /\b(?:hit|hit\s+this|try\s+this|have\s+a\s+hit)\b/i,
  /\b(?:pass\s+(?:it|the|that))\b/i,
  // "Got any X?" / "You got X?" — conversational offers
  /\b(?:got\s+any|you\s+got|u\s+got|have\s+you\s+got|ya\s+got)\b/i,
  // Imperative offers
  /\b(?:smoke|drink|rail|take|pop|eat|try)\s+(?:this|that|some|one|a bit)\b/i,
];

const SELF_USE_HINTS = [
  // User describes their own current/recent use — doesn't offer but
  // invites Unity's self-initiation
  /\b(?:i|i'?m|im)\s+(?:just|already|kinda|really)?\s*(?:high|drunk|lit|fucked up|wasted|rolling|tripping|faded|baked|blazed|geeked)\b/i,
  /\b(?:i|me)\s+(?:just|already)?\s*(?:took|popped|railed|smoked|drank|had)\b/i,
  /\b(?:i'?m|im)\s+(?:on)\s+\w+\b/i,
  // "let me rail/smoke/take" — Unity's own self-initiation language
  /\b(?:let\s+me|lemme)\s+(?:rail|smoke|pop|take|drop|have|grab|try)\b/i,
];

const STATUS_QUERY_PATTERNS = [
  // User asking about Unity's state
  /\b(?:are|r)\s+(?:you|u)\s+(?:high|drunk|lit|fucked up|faded|on)\b/i,
  /\b(?:you|u)\s+(?:high|drunk|lit|faded|feeling it)\??/i,
  /\bhow\s+(?:high|drunk|fucked up|faded)\s+(?:are|r)\s+(?:you|u)\b/i,
  /\bwhat\s+(?:are|r)\s+(?:you|u)\s+on\b/i,
];

// Call-someone / acquire patterns — when a substance is mentioned but
// not available in-scene, triggers simulateCallSomeone downstream.
const ACQUIRE_HINT_PATTERNS = [
  /\b(?:don'?t have|ran out|out of|need more|gotta get|need to get|let me get)\b/i,
  /\b(?:dealer|plug|connect|guy|hook.?up)\b/i,
];

// ─── Detection function ────────────────────────────────────────────────
/**
 * Detect substance-related intent in input text.
 *
 * @param {string} text - User input (text or transcribed voice)
 * @returns {null | {
 *   substance: string,          // canonical name from scheduler DB
 *   slang: string,              // literal matched slang
 *   kind: 'offer' | 'self_initiation_hint' | 'status_query' | 'brought_up',
 *   confidence: number,         // 0-1
 *   shouldTryAcquire: boolean,  // if brought up without availability
 *   route: string | null        // inferred route if possible
 * }}
 */
function detectOffer(text) {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();

  // Find longest substance slang hit (avoid substring collisions)
  let matchedSlang = null;
  for (const slang of SORTED_SLANGS) {
    // Word-boundary match to avoid "line" matching inside "feline"
    const rx = new RegExp(`(?:^|[^a-z])${escapeRegex(slang)}(?:$|[^a-z])`, 'i');
    if (rx.test(lower)) {
      matchedSlang = slang;
      break;
    }
  }
  if (!matchedSlang) return null;
  const substance = SLANG_LOOKUP.get(matchedSlang);

  // Determine intent kind
  let kind = 'brought_up';
  let confidence = 0.4;

  // Status query check (highest priority — user asking about Unity's state)
  for (const rx of STATUS_QUERY_PATTERNS) {
    if (rx.test(lower)) {
      kind = 'status_query';
      confidence = 0.9;
      break;
    }
  }

  // Offer check
  if (kind === 'brought_up') {
    for (const rx of OFFER_PATTERNS) {
      if (rx.test(lower)) {
        kind = 'offer';
        confidence = 0.85;
        break;
      }
    }
  }

  // Self-use hint check
  if (kind === 'brought_up') {
    for (const rx of SELF_USE_HINTS) {
      if (rx.test(lower)) {
        kind = 'self_initiation_hint';
        confidence = 0.7;
        break;
      }
    }
  }

  // Should try to acquire? — substance mentioned without clear offer,
  // OR user mentioned running out / needing a dealer
  let shouldTryAcquire = false;
  if (kind === 'brought_up') {
    for (const rx of ACQUIRE_HINT_PATTERNS) {
      if (rx.test(lower)) {
        shouldTryAcquire = true;
        confidence = 0.6;
        break;
      }
    }
    // Also: substance mentioned without any other context → Unity might ask
    if (!shouldTryAcquire) shouldTryAcquire = true;
  }

  // Route inference from slang — "line/rail" → insufflated, "joint/smoke" →
  // smoked, "edible/gummies" → oral, etc.
  const route = inferRoute(matchedSlang, substance);

  return { substance, slang: matchedSlang, kind, confidence, shouldTryAcquire, route };
}

function inferRoute(slang, substance) {
  const s = slang.toLowerCase();
  if (substance === 'cannabis') {
    if (/edible|gumm|thc/.test(s)) return 'oral';
    return 'smoked';  // default joint/blunt/bowl
  }
  if (substance === 'cocaine') {
    if (/freebase|crack/.test(s)) return 'smoked';
    return 'insufflated';  // default lines/rails/bumps
  }
  if (substance === 'amphetamine') {
    if (/\b(snort|rail|line)\b/.test(s)) return 'insufflated';
    return 'oral';  // addy/vyvanse default
  }
  return null;  // scheduler uses defaultRoute
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Batch detection for multiple utterances ──────────────────────────
/**
 * Scan a sentence for ALL substance references (offer may mention multiple).
 * Returns array of matches, sorted by slang length (longest first, so
 * multi-word matches come before substrings).
 */
function detectAll(text) {
  if (!text || typeof text !== 'string') return [];
  const lower = text.toLowerCase();
  const matches = [];
  const seen = new Set();
  for (const slang of SORTED_SLANGS) {
    const rx = new RegExp(`(?:^|[^a-z])${escapeRegex(slang)}(?:$|[^a-z])`, 'i');
    if (rx.test(lower)) {
      const substance = SLANG_LOOKUP.get(slang);
      if (seen.has(substance)) continue;  // canonical dedup
      seen.add(substance);
      matches.push(detectOffer(text.replace(/[^\s]*/, m =>
        m.toLowerCase().includes(slang) ? m : m)));
    }
  }
  return matches.filter(Boolean);
}

export { detectOffer, detectAll, SUBSTANCE_SYNONYMS, SLANG_LOOKUP };
export default detectOffer;
