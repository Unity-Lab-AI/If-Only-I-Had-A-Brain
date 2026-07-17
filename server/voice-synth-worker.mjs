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

let ort = null;
let session = null;
let config = null;
let createPiperPhonemize = null;
let perceiveAudio = null;

async function init() {
  ort = await import('onnxruntime-web');
  ort.env.wasm.numThreads = 1;
  ({ createPiperPhonemize } = await import(new URL('../js/io/vendor/piper-phonemize.js', import.meta.url).href));
  ({ perceiveAudio } = await import(new URL('../js/brain/mindspace/audio.js', import.meta.url).href));
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

async function synthRec(text) {
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
  return { rec, sampleRate };
}

const ready = init();

parentPort.on('message', async (m) => {
  const { id, text } = m || {};
  try {
    await ready;
    const { rec, sampleRate } = await synthRec(text);
    parentPort.postMessage({ id, rec, sampleRate });
  } catch (err) {
    parentPort.postMessage({ id, error: String((err && err.message) || err) });
  }
});

ready.then(
  () => parentPort.postMessage({ ready: true }),
  (err) => parentPort.postMessage({ ready: false, error: String((err && err.message) || err) }),
);
