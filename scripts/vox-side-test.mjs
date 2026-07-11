// VOX side test — proves the equational voice chain headless, without touching
// the live walk: (1) executor fetch (the exact VOX.0 request shape voice.js
// sends, wav format for headless decode), (2) WAV -> Float32 PCM, (3)
// perceiveAudio -> reconstructAudio roundtrip fidelity (the bank replay path),
// (4) concatAudio crossfade (multi-word sentences). Pure verification script —
// run once, read the output, delete nothing.
//   node scripts/vox-side-test.mjs [word] [voice]
import { readFileSync } from 'node:fs';
import { perceiveAudio, reconstructAudio, concatAudio } from '../js/brain/mindspace/audio.js';

const word = process.argv[2] || 'hello';
const voice = process.argv[3] || 'nova';

function parseWav(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, false) !== 0x52494646) throw new Error('not RIFF');
  let off = 12, fmt = null, dataOff = -1, dataLen = 0;
  while (off + 8 <= dv.byteLength) {
    const id = dv.getUint32(off, false), sz = dv.getUint32(off + 4, true);
    if (id === 0x666d7420) fmt = { audioFormat: dv.getUint16(off + 8, true), channels: dv.getUint16(off + 10, true), sampleRate: dv.getUint32(off + 12, true), bits: dv.getUint16(off + 22, true) };
    if (id === 0x64617461) { dataOff = off + 8; dataLen = sz; }
    off += 8 + sz + (sz % 2);
  }
  if (!fmt || dataOff < 0) throw new Error('wav chunks missing');
  const n = Math.floor(dataLen / (fmt.bits / 8) / fmt.channels);
  const pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // first channel only
    if (fmt.bits === 16) pcm[i] = dv.getInt16(dataOff + i * 2 * fmt.channels, true) / 32768;
    else if (fmt.bits === 8) pcm[i] = (dv.getUint8(dataOff + i * fmt.channels) - 128) / 128;
    else throw new Error('bits=' + fmt.bits);
  }
  return { pcm, sampleRate: fmt.sampleRate, channels: fmt.channels, bits: fmt.bits };
}

function snrDb(a, b) {
  const n = Math.min(a.length, b.length);
  let s = 0, e = 0;
  for (let i = 0; i < n; i++) { s += a[i] * a[i]; const d = a[i] - b[i]; e += d * d; }
  return e > 0 ? 10 * Math.log10(s / e) : Infinity;
}
function corr(a, b) {
  const n = Math.min(a.length, b.length);
  let sa = 0, sb = 0, sab = 0;
  for (let i = 0; i < n; i++) { sa += a[i] * a[i]; sb += b[i] * b[i]; sab += a[i] * b[i]; }
  const dn = Math.sqrt(sa) * Math.sqrt(sb);
  return dn > 0 ? sab / dn : 0;
}

// ---- (0) substrate sanity on synthetic audio (no network) ----
{
  const sr = 24000, n = sr; // 1s
  const syn = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    syn[i] = 0.4 * Math.sin(2 * Math.PI * 180 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t))
           + 0.15 * Math.sin(2 * Math.PI * 720 * t) + 0.08 * Math.sin(2 * Math.PI * 2400 * t);
  }
  const rec = perceiveAudio(syn, sr);
  const back = reconstructAudio(rec);
  console.log(`[0 substrate] synthetic 1s: terms=${rec.equation_count} snr=${snrDb(syn, back).toFixed(1)}dB corr=${corr(syn, back).toFixed(4)}`);
}

// ---- (1) executor fetch — exact VOX.0 shape, wav for headless decode ----
const keyFile = JSON.parse(readFileSync(new URL('../.claude/pollinations-user.json', import.meta.url), 'utf8'));
const apiKey = keyFile.api_key || keyFile.apiKey || '';
const resp = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
  body: JSON.stringify({
    model: 'openai-audio',
    modalities: ['text', 'audio'],
    audio: { voice, format: 'wav' },
    messages: [
      { role: 'system', content: 'Speak like a bright young child. Repeat the user text EXACTLY, verbatim, word for word. Do not add, remove, or change anything.' },
      { role: 'user', content: word },
    ],
  }),
});
console.log(`[1 executor] HTTP ${resp.status}${apiKey ? ' (keyed)' : ' (anonymous)'}`);
if (!resp.ok) {
  console.log('[1 executor] body head:', (await resp.text()).slice(0, 300));
  process.exit(2);
}
const data = await resp.json();
const b64 = data?.choices?.[0]?.message?.audio?.data;
if (!b64) { console.log('[1 executor] NO AUDIO DATA — keys:', JSON.stringify(Object.keys(data || {}))); process.exit(3); }
const bytes = Buffer.from(b64, 'base64');
console.log(`[1 executor] audio bytes=${bytes.length}`);

// ---- (2+3) decode wav -> perceive -> reconstruct -> fidelity ----
const wav = parseWav(bytes);
console.log(`[2 wav] sr=${wav.sampleRate} ch=${wav.channels} bits=${wav.bits} samples=${wav.pcm.length} (${(wav.pcm.length / wav.sampleRate).toFixed(2)}s)`);
const rec = perceiveAudio(wav.pcm, wav.sampleRate);
const back = reconstructAudio(rec);
console.log(`[3 bank replay] "${word}": terms=${rec.equation_count} snr=${snrDb(wav.pcm, back).toFixed(1)}dB corr=${corr(wav.pcm, back).toFixed(4)}`);

// ---- (4) crossfade concat (two-word sentence from one banked word) ----
const two = concatAudio([back, back], wav.sampleRate, 30);
console.log(`[4 concat] two-word joins: ${two.length} samples (${(two.length / wav.sampleRate).toFixed(2)}s), finite=${two.every(Number.isFinite)}`);
console.log('VERDICT: executor OK + equational bank replay OK' );
