// voice-piper-worker.js — Unity's REAL voice, synthesized IN THE BROWSER, off the
// main thread, fully self-hosted. No external API, no server GPU, never touches
// the coordinator.
//
// Pipeline (mirrors the proven @mintplex-labs/piper-tts-web I/O, but drives OUR
// model with zero external calls):
//   text --espeak--> phoneme ids   (vendored piper_phonemize wasm)
//        --VITS onnx--> 22050Hz PCM (onnxruntime-web, WebGPU -> CPU-wasm fallback)
//
// Voice = en_US-hfc_female-medium = "Equation Unity One" V4 (the sound Gee approved).
// Every asset is served from OUR origin under /voice-engine/*; the 63MB model is
// fetched ONCE (at the setup-page preload) and cached in OPFS, so per-response
// synthesis is entirely offline + local to the visitor's machine.
import { createPiperPhonemize } from './vendor/piper-phonemize.js';
import * as ort from 'onnxruntime-web';

// ── Self-hosted asset paths (our origin ONLY — no HuggingFace, no CDN) ──
const MODEL_URL   = '/voice-engine/models/en_US-hfc_female-medium.onnx';
const CONFIG_URL  = '/voice-engine/models/en_US-hfc_female-medium.onnx.json';
const PIPER_WASM  = '/voice-engine/piper/piper_phonemize.wasm';
const PIPER_DATA  = '/voice-engine/piper/piper_phonemize.data';
const ORT_WASM_DIR = '/voice-engine/ort/';
const OPFS_DIR   = 'unity-voice';
const OPFS_MODEL = 'en_US-hfc_female-medium.onnx';

// Single-thread wasm: avoids the SharedArrayBuffer / cross-origin-isolation
// (COOP+COEP) requirement multi-thread ORT needs. Piper is a tiny VITS model —
// single-thread CPU is real-time for short utterances, and the WebGPU EP offloads
// the heavy matmuls to the visitor's GPU when the browser has one.
ort.env.wasm.wasmPaths = ORT_WASM_DIR;
ort.env.wasm.numThreads = 1;
ort.env.allowLocalModels = false;

let _session = null;   // ort.InferenceSession (created once)
let _config = null;    // model .json (phoneme scales, espeak voice, sample rate)

// ── OPFS model cache (fetch once, reuse across responses + future visits) ──
async function opfsRead(name) {
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(OPFS_DIR, { create: true });
    const fh = await dir.getFileHandle(name);
    return await fh.getFile();
  } catch { return null; }
}
async function opfsWrite(name, blob) {
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(OPFS_DIR, { create: true });
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
  } catch { /* non-fatal — refetches next time if the cache write fails */ }
}
async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  const total = +(res.headers.get('Content-Length') || 0);
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (onProgress) onProgress(loaded, total);
  }
  return new Blob(chunks);
}

// Load the model + config once. Config is small (fetched fresh from our origin);
// the 63MB model is OPFS-cached. Session uses WebGPU when the visitor's browser
// exposes it, else CPU-wasm — never our server.
async function ensureModel(onProgress) {
  if (_session) { if (onProgress) onProgress(1, 1); return; }
  _config = await (await fetch(CONFIG_URL)).json();
  let modelBlob = await opfsRead(OPFS_MODEL);
  if (!modelBlob) {
    modelBlob = await fetchWithProgress(MODEL_URL, onProgress);
    await opfsWrite(OPFS_MODEL, modelBlob);
  } else if (onProgress) {
    onProgress(1, 1);
  }
  const buf = await modelBlob.arrayBuffer();
  _session = await ort.InferenceSession.create(buf, {
    executionProviders: ['webgpu', 'wasm'],   // visitor's GPU first, CPU-wasm fallback
  });
}

// text -> espeak phonemes -> phoneme ids (the vendored piper_phonemize wasm; espeak
// voice + data are baked into piper_phonemize.data's virtual FS at /espeak-ng-data).
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
        '-l', _config.espeak.voice,
        '--input', JSON.stringify([{ text: String(text).trim() }]),
        '--espeak_data', '/espeak-ng-data',
      ]);
    }).catch(reject);
  });
}

async function synth(text) {
  await ensureModel();
  const ids = await phonemize(text);
  if (!ids || !ids.length) throw new Error('phonemizer produced no ids');
  const feeds = {
    input: new ort.Tensor('int64', BigInt64Array.from(ids, (v) => BigInt(v)), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)])),
    scales: new ort.Tensor('float32', Float32Array.from([
      _config.inference.noise_scale,
      _config.inference.length_scale,
      _config.inference.noise_w,
    ])),
  };
  // Single-speaker model (speaker_id_map empty) — no `sid` feed.
  const out = await _session.run(feeds);
  const pcm = out[Object.keys(out)[0]].data;   // Float32Array, [-1,1]
  return { pcm, sampleRate: _config.audio.sample_rate };
}

self.onmessage = async (e) => {
  const { type, id, text } = e.data || {};
  try {
    if (type === 'preload') {
      await ensureModel((loaded, total) => self.postMessage({ type: 'progress', loaded, total }));
      self.postMessage({ type: 'ready' });
    } else if (type === 'synth') {
      const { pcm, sampleRate } = await synth(text);
      // Transfer the PCM buffer (zero-copy) back to the main thread.
      const copy = new Float32Array(pcm);   // detach from ORT's internal buffer
      self.postMessage({ type: 'pcm', id, pcm: copy, sampleRate }, [copy.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id, error: String((err && err.message) || err) });
  }
};
