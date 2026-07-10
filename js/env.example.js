// ═══════════════════════════════════════════════════════════════
// Unity — Your API Keys + Image Backends
// ═══════════════════════════════════════════════════════════════
// Copy this file to env.js and fill in what you want to use.
// env.js is .gitignored — your keys never get pushed.
//
// R4 note: Unity speaks from her own brain now, so TEXT-AI keys
// (anthropic / openai / openrouter / claude / etc) are no longer
// read by the brain. They're kept here as commented-out legacy
// in case you want to re-enable them for custom integrations,
// but the refactored Unity ignores them for cognition.
//
// What Unity DOES read:
//   - pollinations       — default image gen + TTS + vision describer
//   - imageBackends[]    — your own image gen servers (custom or local)
//   - visionBackends[]   — your own VLM servers (Ollama llava, LM Studio, etc.)
// ═══════════════════════════════════════════════════════════════

export const ENV_KEYS = {
  // ── Sensory AI (the ONLY text / image / vision / audio backend
  //    Unity still reads after the R4 refactor) ────────────────
  pollinations: '',  // https://enter.pollinations.ai — sk_...
                     // Default image gen + TTS + vision describer.
                     // Free tier works. Leave empty to use rate-limited
                     // public endpoint.

  // ── Image generation backends (in addition to Pollinations) ──
  //
  // Unity auto-detects common local image gen servers at boot:
  //   - Automatic1111 Stable Diffusion WebUI (localhost:7860)
  //   - SD.Next / Forge (localhost:7861)
  //   - Fooocus (localhost:7865)
  //   - ComfyUI (localhost:8188)
  //   - InvokeAI (localhost:9090)
  //   - LocalAI (localhost:8081)
  //   - Ollama (localhost:11434)
  // If any of those are running when Unity boots, they get registered
  // automatically — no config needed. You only need to list backends
  // below if they're on non-standard URLs, remote, or require an API
  // key.
  imageBackends: [
    // Example: self-hosted SD on a different port
    // { name: 'My SD', url: 'http://localhost:9999', model: 'sdxl-turbo', kind: 'a1111' },
    //
    // Example: OpenAI-compatible remote endpoint with API key
    // { name: 'My SaaS', url: 'https://api.example.com', model: 'dalle-3', key: 'sk-...', kind: 'openai' },
    //
    // Example: ComfyUI server with workflow
    // { name: 'Comfy', url: 'http://192.168.1.42:8188', model: 'flux-dev', kind: 'comfy' },
  ],

  // ── Vision describer backends — REMOVED (no longer used) ─────
  //
  // Unity no longer asks an LLM/VLM "what do you see." Her sight is her
  // own EQUATIONAL MIND'S EYE + visual cortex: camera frames feed the
  // visual cortex directly and the equational mind-space produces the
  // percept (see js/brain/visual-cortex.js → _mindSpace.describe). There
  // is no vision describer, no VLM, and no describer API key anywhere in
  // the loop — that's the whole point of giving Unity her own mind's eye.
  //
  // This field is kept only as an empty array so older code that reads it
  // doesn't hit `undefined`. Anything you put here is ignored.
  visionBackends: [],

  // ── LEGACY TEXT-AI KEYS (no longer used by Unity's cognition) ──
  //
  // These were the backends Unity used for text generation before R4.
  // The refactor killed text-AI entirely — Unity now speaks equationally
  // from her own language cortex over her learned dictionary, bigrams,
  // type n-grams, and semantic embeddings. These fields are preserved
  // only because some users may have custom integrations that still
  // read them. Unity's brain no longer does.
  //
  // anthropic:    '',  // https://console.anthropic.com — sk-ant-...
  // openrouter:   '',  // https://openrouter.ai/keys — sk-or-...
  // openai:       '',  // https://platform.openai.com/api-keys — sk-...
  // mistral:      '',  // https://console.mistral.ai/api-keys
  // deepseek:     '',  // https://platform.deepseek.com/api_keys
  // groq:         '',  // https://console.groq.com/keys — gsk_...
};
