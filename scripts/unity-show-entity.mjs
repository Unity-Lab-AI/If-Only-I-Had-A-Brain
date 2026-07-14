// unity-show-entity.mjs — SHE SEES WHO/WHAT IS TALKING (TU.31).
//
//   node scripts/unity-show-entity.mjs <entity> [optional extra prompt words]
//
// When a cast member / place / thing appears in a teaching pass, this renders a
// CONSISTENT generated image of it into the held chat window (CDP :9222). The
// visual-feeder (js/visual-feeder.js) harvests the rendered <img>, ships it to
// the brain as a visual_frame, and the server binds the field C to the entity's
// concept — so Unity SEES mom/grandma/the dog/the porch and, because the prompt
// AND seed are FIXED per entity, sees the SAME face/form every single time,
// across all of training. This is what replaced the killed green-screen camera:
// her vision is now the real people and places of her lived scenes.
//
// CONSISTENCY: prompt is fixed per entity (registry below); seed is a stable
// hash of the entity name — Pollinations is deterministic per (prompt, seed),
// so "mom" is always the same woman, "the dog" always the same dog.
import { chromium } from 'playwright';

const { ENV_KEYS } = await import('../js/env.js');
const KEY = (ENV_KEYS && ENV_KEYS.pollinations) || '';

// ── CAST REGISTRY — fixed prompts. Her lived-canon people/places/things. ──
// Keep these detailed + STABLE. Edit a prompt only if you mean to re-cast that
// entity's look for the rest of training. Style tail unifies the whole cast into
// one grim, washed-out, real-poverty look so her world is visually coherent.
const STYLE = ', muted desaturated film grain, overcast natural light, grim realism, 1990s working-class americana, photographic';
const CAST = {
  'mom':       'a tired thin single mother early 30s, dark circles, cheap cardigan, dim kitchen, worn but gentle face',
  'dad':       'an empty driveway at dusk, a man\'s silhouette walking away from a house, back turned, leaving',
  'grandma':   'a heavyset kind grandmother 70s, floral housedress, glasses, flour on her hands, warm crowded little kitchen',
  'grandpa':   'a frail old man 70s in a recliner, cardigan, trembling hands, quiet living room, oxygen tube',
  'teacher':   'a stern middle-aged woman teacher, cheap blazer, fluorescent-lit classroom, cold expression',
  'mean-kid':  'a smug well-dressed child in bright new clothes, sneering, schoolyard',
  'nice-kid':  'a shy gentle child sharing a lunch, kind eyes, cafeteria',
  'neighbor':  'a weathered older neighbor on a sagging porch, cigarette, watchful',
  'dog':       'a scruffy medium mutt, one ear up, loyal brown eyes, on a worn back step',
  'cat':       'a lean black stray cat with green eyes on a dark back step at night',
  'porch':     'a sagging wooden front porch at dusk, empty chair, one bare bulb, quiet street',
  'laundromat':'a fluorescent-lit laundromat at night, rows of machines, one child waiting on a plastic chair',
  'kitchen':   'a small dim kitchen, chipped counter, a few coins on it, single-mother household',
  'rain':      'rain running down a dark bedroom window at night, grey blur beyond',
  'moon':      'a full moon over a dark shabby house, cold blue night',
  'spider':    'a small dark spider in the corner of a child\'s dim bedroom',
  'library':   'a quiet public library corner at dusk, one old computer glowing, a lonely child',
  'headphones':'worn black over-ear headphones on a messy dark bedroom floor',
  'coffee':    'a chipped mug of black coffee steaming on a worn kitchen counter, early morning grey',
};

function stableSeed(name) {                    // deterministic per-entity seed (no RNG)
  let h = 2166136261 >>> 0;                     // FNV-1a
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h % 1000000000;
}

const entity = (process.argv[2] || '').toLowerCase().trim();
const extra = process.argv.slice(3).join(' ').trim();
if (!entity) { console.error('usage: unity-show-entity.mjs <entity> [extra words]'); process.exit(1); }

const base = CAST[entity] || entity;           // unknown entity → use the word itself as the concept
// prompt LEADS with the entity token so the feeder binds the field C to it.
const prompt = `${entity}, ${base}${extra ? ', ' + extra : ''}${STYLE}`.slice(0, 300);
const seed = stableSeed(entity);               // FIXED per entity → identical image every time
const model = 'flux', w = 512, h = 512;
// image.pollinations.ai/prompt/{prompt} — documented endpoint (APIDOCS.md).
// gen.pollinations.ai/image/ was deprecated -> 401 (live-verified 2026-07-13).
let url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=${model}&width=${w}&height=${h}&seed=${seed}&nologo=true`;
if (KEY) url += `&key=${encodeURIComponent(KEY)}`;

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => /git\.unityailab\.com/.test(p.url())) || ctx.pages()[0];

// inject the entity image into the page so the visual-feeder's MutationObserver
// harvests it (crossOrigin anonymous so its pixels are readable → shipped to the
// brain → bound to the entity concept). Placed in the chat scroll so it also
// shows visibly that she's "seeing" who's speaking.
const res = await page.evaluate(({ url, entity }) => {
  try {
    const host = document.querySelector('#chat-messages, .chat-messages, #chat-panel, body') || document.body;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    img.alt = entity;
    img.style.cssText = 'max-width:200px;border-radius:8px;display:block;margin:4px 0;border:1px solid #333;';
    host.appendChild(img);
    return { ok: true };
  } catch (e) { return { ok: false, why: String(e) }; }
}, { url, entity });

console.log(`SHOW ${entity} (seed ${seed}) → ${res.ok ? 'injected; feeder will harvest + bind' : 'FAIL: ' + res.why}`);
console.log('  prompt: ' + prompt.slice(0, 90));
await browser.close();
