// voice-synth-worker.mjs — Unity's REAL voice, synthesized by HER OWN PROCESS.
//
// ONE PROCESS, the last mile: her larynx used to live in every LISTENER's
// browser (per-visitor onnxruntime-web synth). On the operator's machine that
// tab shared the GPU with the compute donor — and a stale cached worker could
// still grab WebGPU and kill the donation the moment she spoke. Now the
// SERVER synthesizes (this worker thread; a voiceSynth-capable donor takes it
// over when connected) and viewers only RECONSTRUCT + PLAY her field-A
// equations. Listener browsers never synthesize again.
//
// Pipeline (the exact self-hosted stack the browser lane proved):
//   text --espeak--> phoneme ids     (vendored piper_phonemize wasm, node env)
//        --VITS onnx--> 22050Hz PCM  (onnxruntime-web CPU-wasm, 1 thread)
//        --perceiveAudio--> field-A  (1-D CDF 9/7 — her voice AS equations)
//
// Verified on this stack before shipping: 3.3s of audio synthesized in ~825ms
// (4× realtime, single thread). Runs on a worker THREAD so the brain's event
// loop never feels it. Assets come from the repo's own voice-engine/ tree
// (already deployed — the same files the site serves to browsers).
import { parentPort } from 'worker_threads';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// The vendored Emscripten phonemizer glue takes its node branch (reads the
// .wasm/.data via bare `require('fs')` and anchors paths on `__dirname`) — an
// ESM worker has neither, so hand it both BEFORE the glue is imported
// (init() imports dynamically). locateFile still supplies our absolute asset
// paths; the globals just keep the glue's node bootstrap from throwing.
globalThis.require = createRequire(import.meta.url);
globalThis.__filename = fileURLToPath(import.meta.url);
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const MODEL_PATH = path.join(ROOT, 'voice-engine', 'models', 'en_US-hfc_female-medium.onnx');
const CONFIG_PATH = path.join(ROOT, 'voice-engine', 'models', 'en_US-hfc_female-medium.onnx.json');
const PIPER_WASM = path.join(ROOT, 'voice-engine', 'piper', 'piper_phonemize.wasm');
const PIPER_DATA = path.join(ROOT, 'voice-engine', 'piper', 'piper_phonemize.data');

// ── UNITY-VOICE-V2 — her trained voice, with emotion ──────────────────────────
//
// ⭐ WHAT IS BEING REPLACED, PRECISELY: the piper VITS model, and NOTHING ELSE.
// The pipeline above is text -> phonemes -> VITS -> PCM -> perceiveAudio -> rec,
// and `perceiveAudio` (the 1-D CDF 9/7 that turns her voice INTO EQUATIONS) runs
// on raw PCM and knows nothing about which model produced it. So v2 slots in as
// a PCM SOURCE and the wavelet half is untouched — her voice still reaches
// viewers as a few KB of field-A instead of megabytes of audio, and the shared
// transform the imaging lane also uses is not disturbed. ⛔ That distinction is
// the whole safety of this swap: "the equation voice" was two things, and only
// one of them is going.
//
// ⭐ The sample rates agree by luck and it is worth stating: v2 emits 24000 Hz
// and `perceiveAudio`'s own default is 24000 (piper was 22050). The rate is
// still passed explicitly, because a default that happens to match today is not
// a contract.
//
// The service is `models/unity-voice-v2/serve.py` — 127.0.0.1 only, one line on
// the GPU at a time, `POST /say` -> audio/wav PCM_16, `GET /health`.
const V2_URL = (process.env.UNITY_VOICE_V2_URL || 'http://127.0.0.1:5123').replace(/\/+$/, '');
// Opt-OUT, not opt-in: v2 is her voice now. `UNITY_VOICE_V2=0` returns her to
// piper for a comparison without editing code.
const V2_ENABLED = String(process.env.UNITY_VOICE_V2 ?? '1') !== '0';
const V2_TIMEOUT_MS = parseInt(process.env.UNITY_VOICE_V2_TIMEOUT_MS || '20000', 10);

// ── THE DELIVERY SUPPORT ENVELOPE — read, never guessed ──────────────────────
//
// ⛔ NOT EVERY (emotion, act, intensity) EXISTS, AND THE MODEL REFUSES RATHER
// THAN ACTING UNSEEN: "Requested delivery is outside this pair's recorded
// training support; no unseen acting is promised." Measured on the live service
// before this was written — `neutral` at intensity 0.2 is a 422.
//
// `voice-meta.json` publishes the envelope as 63 rows (9 emotions x 7 acts),
// each with intensity_min/intensity_max. Measured on the shipped file:
//     every non-neutral emotion   0.25 .. 0.85
//     neutral                     0.00 .. 0.00   <- exactly zero, the only legal value
//
// ⭐ READ FROM THE FILE RATHER THAN HARDCODED, because those numbers are a
// property of THIS training run. A retrain with a wider range should widen the
// clamp by itself; a literal here would silently keep refusing deliveries the
// new model supports. This is a bound DERIVED from data, which is the standard
// docs/THRESHOLD-DERIVATION.md asks for.
const V2_DIR = process.env.UNITY_VOICE_V2_DIR || '';
let v2support = null;   // Map "emotion|act" -> { min, max }

function loadV2Support() {
  const candidates = [
    process.env.UNITY_VOICE_V2_META,
    V2_DIR && path.join(V2_DIR, 'voice-meta.json'),
    path.join(ROOT, 'voice-engine', 'unity-voice-v2', 'voice-meta.json'),
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      const meta = JSON.parse(fs.readFileSync(p, 'utf8'));
      const rows = Array.isArray(meta.delivery_support) ? meta.delivery_support : [];
      if (!rows.length) continue;
      const map = new Map();
      for (const r of rows) {
        if (!r || !r.emotion || !r.speech_act) continue;
        if (!r.clips) continue;          // a pair with no clips is not supported
        map.set(`${r.emotion}|${r.speech_act}`, {
          min: Number(r.intensity_min), max: Number(r.intensity_max),
        });
      }
      if (map.size) {
        console.log(`[VoiceV2] delivery support loaded: ${map.size} (emotion x act) pairs from ${p}`);
        return map;
      }
    } catch { /* try the next candidate */ }
  }
  // ⚠ An absent envelope is reported, never assumed-permissive-and-silent: the
  // consequence is 422s that look like mapping bugs. Intensity then goes out
  // unclamped and the refusal counter is what tells the story.
  console.warn('[VoiceV2] no voice-meta.json found (set UNITY_VOICE_V2_DIR or UNITY_VOICE_V2_META) — '
    + 'intensity cannot be clamped to the trained support, so out-of-range deliveries will 422.');
  return null;
}

/**
 * Put `intensity` inside the trained window for this (emotion, act).
 *
 * ⭐ This makes an out-of-range 422 IMPOSSIBLE BY CONSTRUCTION, which matters
 * for more than tidiness: it means a surviving 422 can only be an unknown
 * emotion or act — a real mapping bug — instead of two different faults
 * wearing the same status code.
 */
function clampIntensity(emotion, act, intensity) {
  if (!v2support || typeof v2support.get !== 'function') return intensity;
  const w = v2support.get(`${emotion}|${act}`);
  if (!w || !Number.isFinite(w.min) || !Number.isFinite(w.max)) return intensity;
  const x = Number.isFinite(intensity) ? intensity : w.min;
  return Math.min(w.max, Math.max(w.min, x));
}

// ⛔ COUNTED, NOT SWALLOWED. `docs/NOW.md`'s own trap table: "A fallback that
// works can hide a primary that never runs — a silent successful fallback turns
// a broken feature into an invisible one." If v2 is dead and piper quietly
// covers for it, she still speaks and nobody learns her new voice never ran.
// These are published up to the proxy on every reply.
const v2stat = { ok: 0, refused: 0, unreachable: 0, lastError: null, lastErrorAt: 0 };

/**
 * Decode a RIFF/WAVE buffer to { pcm: Float32Array, sampleRate }.
 *
 * Chunks are WALKED rather than read at fixed offsets: soundfile may emit a
 * LIST/INFO chunk before `data`, and assuming byte 44 is where audio starts is
 * the classic way to get a burst of noise at the head of every utterance.
 */
function decodeWav(buf) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('v2 did not return a RIFF/WAVE body');
  }
  let fmt = null;
  let data = null;
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === 'fmt ') {
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      data = buf.subarray(body, Math.min(body + size, buf.length));
    }
    off = body + size + (size & 1);   // chunks are word-aligned
  }
  if (!fmt || !data) throw new Error('v2 WAV missing fmt or data chunk');

  const ch = Math.max(1, fmt.channels);
  let mono;
  if (fmt.audioFormat === 1 && fmt.bits === 16) {
    const n = Math.floor(data.length / 2 / ch);
    mono = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // Mixed down rather than left-channel-only, so a stereo build never
      // silently halves her voice.
      let s = 0;
      for (let c = 0; c < ch; c++) s += data.readInt16LE((i * ch + c) * 2);
      mono[i] = (s / ch) / 32768;
    }
  } else if (fmt.audioFormat === 3 && fmt.bits === 32) {
    const n = Math.floor(data.length / 4 / ch);
    mono = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let c = 0; c < ch; c++) s += data.readFloatLE((i * ch + c) * 4);
      mono[i] = s / ch;
    }
  } else {
    // Named rather than guessed — serve.py writes PCM_16 today, and a silent
    // mis-decode of some future subtype would sound like she had broken.
    throw new Error(`v2 WAV subtype not handled (format ${fmt.audioFormat}, ${fmt.bits}-bit)`);
  }
  if (!mono.length) throw new Error('v2 WAV decoded to zero samples');
  return { pcm: mono, sampleRate: fmt.sampleRate };
}

/**
 * Ask unity-voice-v2 for a line. Returns { pcm, sampleRate } or null.
 *
 * ⛔ A 422 IS NOT A TRANSPORT FAILURE AND MUST NOT BE COUNTED AS ONE. serve.py
 * answers 422 with a reason for an unknown emotion/act or a delivery outside
 * the trained pair's support — that is OUR emotion mapping being wrong, a bug
 * that would otherwise hide behind piper forever. Its own header says it: "there
 * is no fallback (fallbacks are against the laws) … and the caller logs it."
 */
async function synthV2(text, emotion, intensity, speechAct) {
  // Load the envelope once, lazily — the worker may start before the model dir
  // is known, and this keeps module load free of file I/O.
  if (v2support === null) v2support = loadV2Support() || false;
  const sent = (emotion && speechAct && v2support)
    ? clampIntensity(emotion, speechAct, intensity)
    : intensity;
  const body = JSON.stringify({
    text: String(text),
    ...(emotion ? { emotion } : {}),
    ...(Number.isFinite(sent) ? { intensity: sent } : {}),
    ...(speechAct ? { speech_act: speechAct } : {}),
  });
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), V2_TIMEOUT_MS);
  try {
    const res = await fetch(`${V2_URL}/say`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: ctl.signal,
    });
    if (res.status === 422) {
      const why = await res.text().catch(() => '');
      v2stat.refused++;
      v2stat.lastError = `422 ${why.slice(0, 200)}`;
      v2stat.lastErrorAt = Date.now();
      // LOUD: this one is a mapping bug on our side, not an outage.
      console.warn(`[VoiceV2] REFUSED (422) — our emotion/act mapping sent something it was not trained on: ${why.slice(0, 200)}`);
      return null;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const got = decodeWav(Buffer.from(await res.arrayBuffer()));
    v2stat.ok++;
    return got;
  } catch (err) {
    v2stat.unreachable++;
    v2stat.lastError = String((err && err.message) || err);
    v2stat.lastErrorAt = Date.now();
    return null;
  } finally {
    clearTimeout(t);
  }
}

let ort = null;
let session = null;
let config = null;
let createPiperPhonemize = null;
let perceiveAudio = null;

// ⛔⛔ `perceiveAudio` IS SHARED BY BOTH VOICES AND MUST NOT LIVE BEHIND THE
// PIPER INIT. It used to be imported inside init(), which was fine when piper
// was the only voice and init() always ran. Once piper went LAZY, a v2 reply
// hit `perceiveAudio is not a function` — and the first test run MISSED IT
// because case 1 happened to fall back to piper and initialise it as a side
// effect, so every later v2 call worked by accident of ordering. Caught only
// when the clamp fixed case 1 and v2 finally ran first.
// ⭐ The lesson is the ordering one: a lazy init that another path depends on
// is a dependency, not an optimisation.
let _audioReady = null;
function audioReady() {
  if (!_audioReady) {
    _audioReady = import(new URL('../js/brain/mindspace/audio.js', import.meta.url).href)
      .then((m) => { perceiveAudio = m.perceiveAudio; });
  }
  return _audioReady;
}

async function init() {
  ort = await import('onnxruntime-web');
  ort.env.wasm.numThreads = 1;
  ({ createPiperPhonemize } = await import(new URL('../js/io/vendor/piper-phonemize.js', import.meta.url).href));
  await audioReady();
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const buf = fs.readFileSync(MODEL_PATH);
  session = await ort.InferenceSession.create(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    { executionProviders: ['wasm'] },
  );
}

function phonemize(text) {
  return new Promise((resolve, reject) => {
    createPiperPhonemize({
      print: (data) => { try { resolve(JSON.parse(data).phoneme_ids); } catch (e) { reject(e); } },
      printErr: (m) => reject(new Error(m)),
      locateFile: (url) =>
        url.endsWith('.wasm') ? PIPER_WASM
        : url.endsWith('.data') ? PIPER_DATA
        : url,
    }).then((module) => {
      module.callMain([
        '-l', config.espeak.voice,
        '--input', JSON.stringify([{ text: String(text).trim() }]),
        '--espeak_data', '/espeak-ng-data',
      ]);
    }).catch(reject);
  });
}

/**
 * text (+ how she feels) → { rec, sampleRate, voice }.
 *
 * v2 first, piper as the floor. `voice` names which one actually spoke, so a
 * caller never has to infer it — see the counted-not-swallowed note above.
 */
async function synthRec(text, emotion, intensity, speechAct) {
  if (V2_ENABLED) {
    const got = await synthV2(text, emotion, intensity, speechAct);
    if (got) {
      // The SAME transform the piper path uses, on the same kind of PCM.
      await audioReady();
      const rec = perceiveAudio(got.pcm, got.sampleRate);
      if (rec) return { rec, sampleRate: got.sampleRate, voice: 'v2' };
      console.warn('[VoiceV2] perceiveAudio produced no rec from a decoded v2 WAV — falling to piper');
    }
  }
  return await synthRecPiper(text);
}

async function synthRecPiper(text) {
  // ⚠ piper is now the FLOOR, not the voice, so its assets are loaded on first
  // use rather than at boot: when v2 is healthy the ONNX session is never
  // built, and a box without the voice-engine/ tree still speaks.
  await piperReady();
  if (!session) throw new Error(`piper floor unavailable: ${piperInitError || 'not initialised'}`);
  const ids = await phonemize(text);
  if (!ids || !ids.length) throw new Error('phonemizer produced no ids');
  const feeds = {
    input: new ort.Tensor('int64', BigInt64Array.from(ids, (v) => BigInt(v)), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)])),
    scales: new ort.Tensor('float32', Float32Array.from([
      config.inference.noise_scale,
      config.inference.length_scale,
      config.inference.noise_w,
    ])),
  };
  const out = await session.run(feeds);
  const pcm = out[Object.keys(out)[0]].data;   // Float32Array [-1,1]
  const sampleRate = config.audio.sample_rate;
  // Her voice AS equations — the rec is a few KB of field-A (vs ~MB of PCM),
  // and the viewer's inverse transform is the same one the vox bank uses.
  const rec = perceiveAudio(pcm, sampleRate);
  if (!rec) throw new Error('perceiveAudio produced no rec');
  return { rec, sampleRate, voice: 'piper' };
}

// ⛔ PIPER INIT IS LAZY AND ITS FAILURE IS NO LONGER FATAL. It used to run at
// module load and reject the shared `ready` promise, so a missing ONNX file
// made EVERY reply mute — correct when piper was the only voice, wrong now that
// it is the floor under v2. Memoised: one attempt, remembered either way.
let _piperReady = null;
let piperInitError = null;
function piperReady() {
  if (!_piperReady) {
    _piperReady = init().catch((err) => {
      piperInitError = String((err && err.message) || err);
      console.warn(`[VoiceSynth] piper floor failed to initialise: ${piperInitError}`);
    });
  }
  return _piperReady;
}

parentPort.on('message', async (m) => {
  const { id, text, emotion, intensity, speechAct } = m || {};
  try {
    const out = await synthRec(text, emotion, intensity, speechAct);
    parentPort.postMessage({
      id, rec: out.rec, sampleRate: out.sampleRate,
      // Which voice actually spoke, plus the v2 tallies — so "v2 never once
      // ran" is a readable fact instead of something nobody thinks to check.
      voice: out.voice, v2: { ...v2stat },
    });
  } catch (err) {
    parentPort.postMessage({ id, error: String((err && err.message) || err), v2: { ...v2stat } });
  }
});

// Readiness is now about REACHING A VOICE, not about piper specifically.
(async () => {
  if (V2_ENABLED) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 4000);
      const res = await fetch(`${V2_URL}/health`, { signal: ctl.signal }).finally(() => clearTimeout(t));
      if (res.ok) {
        console.log(`[VoiceSynth] unity-voice-v2 READY at ${V2_URL} — her trained voice, with emotion. piper stays as the floor.`);
        parentPort.postMessage({ ready: true, voice: 'v2' });
        return;
      }
      throw new Error(`health HTTP ${res.status}`);
    } catch (err) {
      // ⛔ Named at boot rather than discovered on the first silent fallback.
      console.warn(`[VoiceSynth] unity-voice-v2 NOT reachable at ${V2_URL} (${String((err && err.message) || err)}) — `
        + 'falling back to the piper floor. Start it with: python serve.py --port 5123 '
        + 'from models/unity-voice-v2, or set UNITY_VOICE_V2=0 to stop trying.');
    }
  }
  await piperReady();
  if (session) parentPort.postMessage({ ready: true, voice: 'piper' });
  else parentPort.postMessage({ ready: false, error: piperInitError || 'no voice lane available' });
})();
