// VOX reference-voice bank generator — synthesizes every vocab word ISOLATED
// with the approved reference voice (Piper en_US-amy-medium, free/local), runs
// each through perceiveAudio, and writes JSON bank chunks the browser preloads.
// Her speak() then plays pure equations from word one — no executor, no key.
//   node scripts/vox-build-bank.mjs [--limit N]
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { perceiveAudio } from '../js/brain/mindspace/audio.js';
import { K_VOCABULARY } from '../js/brain/k-vocabulary.js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PIPER = join(ROOT, '.claude', 'piper', 'piper', 'piper.exe');
const MODEL = join(ROOT, '.claude', 'piper', 'amy.onnx');
const WAV_DIR = join(ROOT, '.claude', 'vox-bank-wavs');
const OUT_DIR = join(ROOT, 'vox-bank');
const CHUNK_WORDS = 250;

const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > 0 ? Number(process.argv[limitArg + 1]) : 0;

// glue words her sentences need even if outside K_VOCABULARY
const GLUE = ['i','a','the','is','am','are','was','be','to','of','and','or','in','on','it','you','me','my','your','we','us','this','that','what','who','how','not','no','yes','do','does','did','can','will','with','for','at','so','but','if','they','she','he','her','his','them'];
const seen = new Set();
let words = [];
for (const w of [...GLUE, ...K_VOCABULARY]) {
  const t = String(w).toLowerCase().trim();
  if (t && /^[a-z][a-z'-]*$/.test(t) && !seen.has(t)) { seen.add(t); words.push(t); }
}
if (LIMIT > 0) words = words.slice(0, LIMIT);
console.log(`[vox-bank] ${words.length} words to synthesize + equationalize (reference: amy-medium)`);

mkdirSync(WAV_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

// one piper process, JSON-input mode: a line per word with its output file
await new Promise((resolve, reject) => {
  const p = spawn(PIPER, ['--model', MODEL, '--json-input'], { cwd: join(ROOT, '.claude', 'piper') });
  let err = '';
  p.stderr.on('data', (d) => { err += d; });
  p.on('close', (code) => code === 0 ? resolve() : reject(new Error('piper exit ' + code + '\n' + err.slice(-500))));
  for (const w of words) {
    p.stdin.write(JSON.stringify({ text: w, output_file: join(WAV_DIR, w + '.wav') }) + '\n');
  }
  p.stdin.end();
});
console.log('[vox-bank] piper synthesis done');

function parseWav(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 12, fmt = null, dataOff = -1, dataLen = 0;
  while (off + 8 <= dv.byteLength) {
    const id = dv.getUint32(off, false), sz = dv.getUint32(off + 4, true);
    if (id === 0x666d7420) fmt = { channels: dv.getUint16(off + 10, true), sampleRate: dv.getUint32(off + 12, true), bits: dv.getUint16(off + 22, true) };
    if (id === 0x64617461) { dataOff = off + 8; dataLen = sz; }
    off += 8 + sz + (sz % 2);
  }
  const n = Math.floor(dataLen / 2 / fmt.channels);
  const pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) pcm[i] = dv.getInt16(dataOff + i * 2 * fmt.channels, true) / 32768;
  return { pcm, sampleRate: fmt.sampleRate };
}

// trim leading/trailing silence so isolated words concat tight
function trim(pcm, thresh = 0.01) {
  let a = 0, b = pcm.length - 1;
  while (a < b && Math.abs(pcm[a]) < thresh) a++;
  while (b > a && Math.abs(pcm[b]) < thresh) b--;
  const pad = 240; // 10ms @24k
  return pcm.subarray(Math.max(0, a - pad), Math.min(pcm.length, b + pad));
}

const manifest = { reference: 'piper-en_US-amy-medium', v: 1, chunks: [], words: 0 };
let chunk = {}, chunkIdx = 0, inChunk = 0, done = 0, failed = 0, bytes = 0;
function flush() {
  if (!inChunk) return;
  const name = `bank-${String(chunkIdx).padStart(3, '0')}.json`;
  const j = JSON.stringify(chunk);
  writeFileSync(join(OUT_DIR, name), j);
  manifest.chunks.push({ file: name, words: inChunk, bytes: j.length });
  bytes += j.length;
  chunk = {}; inChunk = 0; chunkIdx++;
}
for (const w of words) {
  try {
    const f = join(WAV_DIR, w + '.wav');
    if (!existsSync(f)) { failed++; continue; }
    const { pcm, sampleRate } = parseWav(readFileSync(f));
    const t = trim(pcm);
    if (t.length < 480) { failed++; continue; }
    const rec = perceiveAudio(t, sampleRate);
    chunk[w] = rec;
    inChunk++; done++;
    if (inChunk >= CHUNK_WORDS) flush();
    if (done % 100 === 0) console.log(`[vox-bank] ${done}/${words.length} equationalized…`);
  } catch (e) { failed++; console.warn('[vox-bank] fail:', w, e.message); }
}
flush();
manifest.words = done;
writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`[vox-bank] DONE — ${done} words banked (${failed} failed), ${manifest.chunks.length} chunks, ${(bytes / 1048576).toFixed(1)}MB total -> vox-bank/`);
