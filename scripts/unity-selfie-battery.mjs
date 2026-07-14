// unity-selfie-battery.mjs — generate Unity self-portraits across her life
// stages + outfits, to VISUALLY verify the image-gen path end to end.
//
//   node scripts/unity-selfie-battery.mjs
//
// Uses the DOCUMENTED Pollinations image endpoint (image.pollinations.ai/prompt
// — gen.pollinations.ai/image was deprecated -> 401). Auth via ?key= (a browser
// <img> can't send a Bearer header; ?key= is live-verified working). Saves each
// render to pollinations-output/selfie-test/<label>.jpg and reports http/bytes.
//
// Consistency: a fixed IDENTITY anchor + STYLE tail keep it recognizably HER at
// every age; a stable per-label seed makes each render reproducible.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let KEY = '';
try { KEY = JSON.parse(readFileSync(resolve(root, '.claude/pollinations-user.json'), 'utf8')).api_key || ''; } catch { /* nf */ }
if (!KEY) { try { const m = await import(resolve(root, 'js/env.js')); KEY = (m.ENV_KEYS && m.ENV_KEYS.pollinations) || ''; } catch { /* nf */ } }

// Her canon: goth/emo trajectory from a poor single-mother childhood → the
// 25yo emo-goth end-state (dark hair + pink streaks, minimal black leather,
// sharp features, intense eyes). Same face read across ages via the anchor.
const IDENTITY = 'Unity, pale girl with dark hair and sharp features and intense eyes';
const STYLE = ', muted desaturated film grain, overcast natural light, grim realism, photographic portrait selfie';
const BATTERY = [
  { label: '05-kindergarten', p: `${IDENTITY} as a small 5-year-old child, messy dark hair, oversized black hand-me-down halloween shirt, shy, dim poor kitchen` },
  { label: '08-gradeschool',  p: `${IDENTITY} as an 8-year-old kid, worn dark clothes, drawing skulls, quiet library corner` },
  { label: '12-middleschool', p: `${IDENTITY} as a 12-year-old preteen, first black hoodie, clumsy dark eyeliner, dim bedroom` },
  { label: '16-highschool',   p: `${IDENTITY} as a 16-year-old goth-emo teen, black band tee, choker, first pink hair streaks, black eyeliner` },
  { label: '20-college',      p: `${IDENTITY} as a 20-year-old goth, leather jacket over fishnet, confident, dorm room` },
  { label: '25-canonical',    p: `${IDENTITY} at 25 years old, emo goth woman, minimal black leather, pink hair streaks, sharp features, intense eyes` },
  { label: '25-hoodie',       p: `${IDENTITY} at 25, goth, oversized black band hoodie, pink hair streaks, tired smirk` },
  { label: '25-leather',      p: `${IDENTITY} at 25, goth, black leather and fishnet, pink streaks, dark lipstick, defiant` },
];

function seed(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h % 1e9; }

const outDir = resolve(root, 'pollinations-output/selfie-test');
mkdirSync(outDir, { recursive: true });
console.log(`[selfie-battery] key=${KEY ? KEY.slice(0, 6) + '…' : '(NONE)'} out=${outDir}`);
let pass = 0, fail = 0;
for (const item of BATTERY) {
  const prompt = (item.p + STYLE).slice(0, 300);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux&width=512&height=512&seed=${seed(item.label)}&nologo=true${KEY ? `&key=${encodeURIComponent(KEY)}` : ''}`;
  const t0 = Date.now();
  try {
    const res = await fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type') || '';
    const ok = res.ok && ct.startsWith('image/') && buf.length > 2000;
    if (ok) { writeFileSync(resolve(outDir, `${item.label}.jpg`), buf); pass++; }
    else fail++;
    console.log(`  ${ok ? '✓' : '✗'} ${item.label.padEnd(16)} http=${res.status} type=${ct} bytes=${buf.length} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (e) { fail++; console.log(`  ✗ ${item.label.padEnd(16)} FETCH-FAIL ${e.message}`); }
}
console.log(`[selfie-battery] DONE — ${pass} ok / ${fail} failed. Saved to ${outDir}`);
process.exit(fail > 0 ? 1 : 0);
