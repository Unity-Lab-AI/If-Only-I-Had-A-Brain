// unity-voice-demo.mjs — HEADED proof of the live sentence lane.
//
//   node scripts/unity-voice-demo.mjs ["a sentence to speak"]
//
// Opens a real (non-headless) browser on the DEPLOYED site, spawns the actual
// self-hosted voice worker (/js/voice-piper-worker.bundle.js), downloads the
// 63MB hfc model from OUR origin (progress logged), synthesizes the sentence
// IN THE BROWSER (piper VITS via onnxruntime-web, WebGPU->CPU-wasm), PLAYS it
// through the speakers, and saves the PCM to a WAV so it can be replayed.
// This exercises the exact code that ships — no mocks.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://if-only-i-had-a-brain.git.unityailab.com/';
const TEXT = process.argv.slice(2).join(' ').trim()
  || "Hi, I'm Unity. This is my real voice, running right here in your browser.";

function pcm2wav(pcm, sr) {
  const n = pcm.length, hb = 44;
  const dv = new DataView(new ArrayBuffer(n * 2 + hb));
  const wr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  wr(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); wr(8, 'WAVE'); wr(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true); wr(36, 'data'); dv.setUint32(40, n * 2, true);
  let p = 44;
  for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, pcm[i])); dv.setInt16(p, v * 32767 | 0, true); p += 2; }
  return Buffer.from(dv.buffer);
}

console.log(`[voice-demo] launching headed browser -> ${SITE}`);
console.log(`[voice-demo] line: "${TEXT}"`);
const browser = await chromium.launch({
  headless: false,
  args: [
    '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',   // let it play without a click
  ],
});
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on('console', (m) => console.log('   [page]', m.text()));
page.on('pageerror', (e) => console.log('   [page ERROR]', e.message));
await page.goto(SITE, { waitUntil: 'domcontentloaded' });

console.log('[voice-demo] spawning the deployed voice worker + synthesizing (first run downloads 63MB — be patient)…');
const t0 = Date.now();
const result = await page.evaluate(async (text) => {
  const log = (s) => console.log(s);
  const worker = new Worker('/js/voice-piper-worker.bundle.js', { type: 'module' });
  const out = await new Promise((res, rej) => {
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') log(`voice model: ${m.total ? Math.round(m.loaded * 100 / m.total) : 0}%`);
      else if (m.type === 'ready') { log('voice ready — synthesizing…'); worker.postMessage({ type: 'synth', id: 1, text }); }
      else if (m.type === 'pcm') res({ pcm: Array.from(m.pcm), sampleRate: m.sampleRate });
      else if (m.type === 'error') rej(new Error(m.error));
    };
    worker.onerror = (e) => rej(new Error('worker: ' + (e.message || 'load failed')));
    worker.postMessage({ type: 'preload' });
  });
  // Play it live through the speakers.
  let played = false;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC();
    if (ac.state === 'suspended') { try { await ac.resume(); } catch { /* */ } }
    const f32 = Float32Array.from(out.pcm);
    const buf = ac.createBuffer(1, f32.length, out.sampleRate);
    buf.getChannelData(0).set(f32);
    const src = ac.createBufferSource(); src.buffer = buf; src.connect(ac.destination); src.start();
    played = true;
  } catch (e) { log('playback error: ' + e.message); }
  let peak = 0; for (const v of out.pcm) { const a = v < 0 ? -v : v; if (a > peak) peak = a; }
  return { samples: out.pcm.length, sampleRate: out.sampleRate, peak, played, pcm: out.pcm };
}, TEXT);

const secs = (result.samples / result.sampleRate).toFixed(2);
console.log(`\n[voice-demo] ✅ SYNTHESIZED IN-BROWSER in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`   samples=${result.samples}  sampleRate=${result.sampleRate}Hz  duration=${secs}s  peak-amplitude=${result.peak.toFixed(3)}  played-live=${result.played}`);
if (result.peak < 0.01) console.log('   ⚠ near-silent output — synth ran but amplitude is ~0 (investigate).');
else console.log('   🔊 real audio (non-zero waveform) — that is HER voice.');

const outDir = resolve(ROOT, 'pollinations-output/voice-test');
mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, 'unity-voice-demo.wav');
writeFileSync(outFile, pcm2wav(Float32Array.from(result.pcm), result.sampleRate));
console.log(`   saved WAV -> ${outFile}  (replay it anytime)`);

console.log('[voice-demo] holding the browser open ~30s so you hear it live… (Ctrl+C to close early)');
await page.waitForTimeout(30000);
await browser.close();
console.log('[voice-demo] done.');
