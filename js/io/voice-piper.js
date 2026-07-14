// voice-piper.js — main-thread handle to Unity's in-browser piper voice.
//
// Spawns the voice-piper worker (built separately to js/voice-piper-worker.bundle.js
// and served from our origin) and exposes two calls:
//   preloadVoice(onProgress) — fetch + cache the model, warm the session. Call this
//                              on the SETUP PAGE, before WAKE, so her first word has
//                              zero lag. Idempotent (returns the same promise).
//   synthPCM(text)           — text -> { pcm: Float32Array, sampleRate }, synthesized
//                              in the worker (off the main thread).
//
// The worker does all the heavy lifting (phonemize + VITS inference) on the
// visitor's machine — no server, no external API. This module is just the courier.

const WORKER_URL = '/js/voice-piper-worker.bundle.js';

let _worker = null;
let _seq = 0;
const _pending = new Map();
let _readyPromise = null;

function _spawn() {
  if (_worker) return _worker;
  _worker = new Worker(WORKER_URL, { type: 'module' });
  _worker.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.type === 'pcm' || m.type === 'error') {
      const p = _pending.get(m.id);
      if (p) {
        _pending.delete(m.id);
        if (m.type === 'pcm') p.resolve({ pcm: m.pcm, sampleRate: m.sampleRate });
        else p.reject(new Error(m.error));
      }
    }
  });
  _worker.addEventListener('error', (err) => {
    // Fail any in-flight synths so callers fall back rather than hang.
    for (const [, p] of _pending) p.reject(new Error('voice worker error: ' + (err.message || 'unknown')));
    _pending.clear();
  });
  return _worker;
}

/**
 * Preload the voice model + warm the session. Reports download progress via
 * onProgress(loaded, total). Resolves when the session is ready to synthesize.
 */
export function preloadVoice(onProgress) {
  if (_readyPromise) return _readyPromise;
  const w = _spawn();
  _readyPromise = new Promise((resolve, reject) => {
    const handler = (e) => {
      const m = e.data || {};
      if (m.type === 'progress') { if (onProgress) onProgress(m.loaded, m.total); }
      else if (m.type === 'ready') { w.removeEventListener('message', handler); resolve(); }
      else if (m.type === 'error' && m.id == null) { w.removeEventListener('message', handler); reject(new Error(m.error)); }
    };
    w.addEventListener('message', handler);
    w.postMessage({ type: 'preload' });
  });
  return _readyPromise;
}

/** Synthesize text -> { pcm: Float32Array, sampleRate }. */
export function synthPCM(text) {
  const w = _spawn();
  const id = ++_seq;
  return new Promise((resolve, reject) => {
    _pending.set(id, { resolve, reject });
    w.postMessage({ type: 'synth', id, text });
  });
}

/** True once preloadVoice() has been kicked off. */
export function isVoicePreloading() { return _readyPromise != null; }
