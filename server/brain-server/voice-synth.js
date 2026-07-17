// VoiceSynthProxy — her voice lane on the BOX (ONE PROCESS rollout ramp).
//
// Wraps server/voice-synth-worker.mjs (piper VITS + espeak phonemizer + the
// field-A perceive, all on a worker THREAD) behind one async call:
// synthesizeRec(text) → { rec, sampleRate } | null. Same worker-proxy shape
// as MindSpaceWorkerProxy. When a voiceSynth-capable donor is connected the
// chat lane dispatches THERE instead (gpuMindspaceOp('voiceSynth')) — this
// box worker is the always-available floor so she is never mute, and it
// respawns itself if the worker thread ever dies.
const { Worker } = require('worker_threads');
const path = require('path');

class VoiceSynthProxy {
  constructor() {
    this._pending = new Map();
    this._seq = 0;
    this._worker = null;
    this._dead = false;
    this._spawn();
  }

  _spawn() {
    this._dead = false;
    this._worker = new Worker(path.join(__dirname, '..', 'voice-synth-worker.mjs'));
    // Her voice must never hold the process open past shutdown.
    this._worker.unref();
    this._worker.on('message', (m) => {
      if (m && m.ready !== undefined) {
        if (m.ready) console.log('[VoiceSynth] box voice lane READY — her replies synthesize in HER process (worker thread), viewers only play.');
        else console.warn('[VoiceSynth] box voice lane failed to init:', m.error || 'unknown');
        return;
      }
      if (!m || !this._pending.has(m.id)) return;
      const p = this._pending.get(m.id);
      this._pending.delete(m.id);
      if (m.error) p.resolve(null);
      else p.resolve({ rec: m.rec, sampleRate: m.sampleRate });
    });
    this._worker.on('error', (e) => {
      console.warn('[VoiceSynth] worker error:', e?.message || e);
      for (const p of this._pending.values()) p.resolve(null);
      this._pending.clear();
      this._dead = true;
    });
    this._worker.on('exit', (code) => {
      if (code !== 0) console.warn(`[VoiceSynth] worker exited (${code}) — respawns on the next reply.`);
      for (const p of this._pending.values()) p.resolve(null);
      this._pending.clear();
      this._dead = true;
    });
  }

  /** text → { rec, sampleRate } | null (never rejects — a mute reply is the
   *  worst case; the text was already delivered). */
  synthesizeRec(text, timeoutMs = 30_000) {
    if (!text || typeof text !== 'string') return Promise.resolve(null);
    if (this._dead) this._spawn();
    return new Promise((resolve) => {
      const id = ++this._seq;
      const timeout = setTimeout(() => {
        this._pending.delete(id);
        resolve(null);
      }, timeoutMs);
      this._pending.set(id, { resolve: (v) => { clearTimeout(timeout); resolve(v); } });
      try { this._worker.postMessage({ id, text }); }
      catch (e) { clearTimeout(timeout); this._pending.delete(id); resolve(null); }
    });
  }
}

module.exports = { VoiceSynthProxy };
