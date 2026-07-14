/**
 * PollinationsAI — Browser-side Pollinations API client.
 *
 * Endpoints (current — NOT the deprecated text.pollinations.ai):
 *   Text:  https://gen.pollinations.ai/v1/chat/completions
 *   Image: https://gen.pollinations.ai/image/{prompt}
 *   Audio: https://gen.pollinations.ai/v1/audio/speech
 *   Auth:  https://enter.pollinations.ai/authorize
 *
 * No external dependencies. Uses fetch() only.
 * Works without an API key (free tier); BYOP key unlocks higher limits.
 */

const GEN_URL = 'https://gen.pollinations.ai';
const IMAGE_URL = 'https://image.pollinations.ai';

export class PollinationsAI {

    constructor(apiKey = null) {
        this._apiKey = apiKey;
    }

    // ── Utility ────────────────────────────────────────────────────────

    setApiKey(key) {
        this._apiKey = key;
    }

    hasApiKey() {
        return Boolean(this._apiKey);
    }

    _headers() {
        const h = { 'Content-Type': 'application/json' };
        if (this._apiKey) {
            h['Authorization'] = `Bearer ${this._apiKey}`;
        }
        return h;
    }

    // ── Text Generation ────────────────────────────────────────────────

    /**
     * Chat with a text model.
     * @param {Array<{role:string, content:string}>} messages
     * @param {Object} [options]
     * @param {string} [options.model='openai']
     * @param {number} [options.temperature=0.9]
     * @returns {Promise<string|null>} response text or null on failure
     */
    /**
     * R4 — chat() method kept as a multimodal wrapper so the vision
     * describer at app.js:996 can still send image frames to
     * Pollinations GPT-4o for scene description. That's a SENSORY
     * call (vision input → text description), not cognition, so it
     * stays under the refactor's "sensory AI allowed" rule.
     *
     * The old text-generation chat path (user talks to Unity via AI
     * completion) is gone — Unity's cognition runs equationally via
     * innerVoice.languageCortex.generate(), nothing routes through
     * here for speech anymore.
     *
     * If you're tempted to call this from the brain/cognition path,
     * DON'T. Use the language cortex. This method exists ONLY for
     * the vision describer and any future sensory peripherals that
     * need OpenAI-compatible multimodal.
     */
    async chat(messages, options = {}) {
        const model = options.model || 'openai';
        const temperature = options.temperature ?? 0.9;
        const body = JSON.stringify({ messages, model, temperature });
        const headers = this._headers();

        try {
            const res = await fetch(`${GEN_URL}/v1/chat/completions`, {
                method: 'POST',
                headers,
                body,
                signal: options.signal || AbortSignal.timeout(30000),
            });
            if (res.ok) {
                const json = await res.json();
                if (json.choices?.[0]?.message?.content) {
                    return json.choices[0].message.content;
                }
            } else {
                console.warn('[PollinationsAI] v1/chat/completions returned', res.status);
            }
        } catch (err) {
            console.error('[PollinationsAI] v1/chat/completions failed:', err.message);
        }
        return null;
    }

    // ── Image Generation ───────────────────────────────────────────────

    /** Style presets that get appended to the prompt. */
    static STYLE_PRESETS = {
        photorealistic: ', photorealistic, ultra detailed, 8k',
        anime: ', anime style, vibrant colors, detailed',
        'oil-painting': ', oil painting style, textured brush strokes',
        'pixel-art': ', pixel art style, retro 8-bit',
        watercolor: ', watercolor painting, soft washes, delicate',
        cinematic: ', cinematic lighting, dramatic composition, film grain',
        sketch: ', pencil sketch, hand-drawn, detailed linework',
        cyberpunk: ', cyberpunk aesthetic, neon lights, futuristic cityscape'
    };

    /**
     * Generate an image URL.
     * @param {string} prompt
     * @param {Object} [options]
     * @param {string} [options.model='flux']
     * @param {number} [options.width=512]
     * @param {number} [options.height=512]
     * @param {string} [options.style] - one of STYLE_PRESETS keys
     * @returns {string|null} image URL or null on failure
     */
    generateImage(prompt, options = {}) {
        try {
            // R15 — options.model wins, then a user-saved default
            // from the setup modal (stored on `this._defaultImageModel`
            // by app.js injectCustomBackendsIntoProviders() from
            // localStorage.pollinations_image_model), then 'flux' as
            // the built-in fallback.
            const model = options.model || this._defaultImageModel || 'flux';
            const width = options.width || 512;
            const height = options.height || 512;

            let finalPrompt = prompt;
            if (options.style && PollinationsAI.STYLE_PRESETS[options.style]) {
                finalPrompt += PollinationsAI.STYLE_PRESETS[options.style];
            }

            const encoded = encodeURIComponent(finalPrompt);
            // TU.29.14 — FRESH SEED per call. Pollinations is deterministic per
            // (prompt, seed): with no seed the same prompt returns the same cached
            // image and renders look recycled. A random seed (pinnable via
            // options.seed) makes each generation a new picture.
            const seed = (typeof options.seed === 'number') ? options.seed : Math.floor(Math.random() * 1e9);
            // image.pollinations.ai/prompt/{prompt} — the image endpoint.
            // (Pollinations DEPRECATED gen.pollinations.ai/image/ — it now 401s
            // even WITH a valid key AND anonymously; the chat-window "show me X"
            // path silently stopped rendering. Live-verified 2026-07-13:
            // image.pollinations.ai/prompt/<p>?...&key=<k> → 200 image/jpeg,
            // gen.pollinations.ai/image/<p> → 401. This is the chat-window image
            // path only — her equational mind's-eye imagination is a separate
            // engine and was never affected.)
            // Auth via ?key= param (for authenticated) or anonymous (no key).
            let url = `${IMAGE_URL}/prompt/${encoded}?model=${encodeURIComponent(model)}&width=${width}&height=${height}&seed=${seed}&nologo=true`;
            if (this._apiKey) {
                url += `&key=${encodeURIComponent(this._apiKey)}`;
            }
            return url;
        } catch (err) {
            console.error('[PollinationsAI] generateImage failed:', err.message);
            return null;
        }
    }

    // ── Text-to-Speech ─────────────────────────────────────────────────

    /**
     * Convert text to speech.
     * @param {string} text
     * @param {string} [voice='nova']
     * @returns {Promise<Blob|null>} audio Blob or null on failure
     */
    async speak(text, voice = 'nova') {
        try {
            const res = await fetch(`${GEN_URL}/v1/audio/speech`, {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify({
                    model: 'openai-audio',
                    input: text,
                    voice
                })
            });
            if (!res.ok) {
                console.error('[PollinationsAI] speak failed:', res.status, res.statusText);
                return null;
            }
            return await res.blob();
        } catch (err) {
            console.error('[PollinationsAI] speak failed:', err.message);
            return null;
        }
    }

    // ── Models ─────────────────────────────────────────────────────────

    /**
     * List available text models.
     * @returns {Promise<Array|null>}
     */
    async listModels() {
        try {
            const res = await fetch(`${GEN_URL}/v1/models`);
            if (!res.ok) {
                console.error('[PollinationsAI] listModels failed:', res.status);
                return null;
            }
            return await res.json();
        } catch (err) {
            console.error('[PollinationsAI] listModels failed:', err.message);
            return null;
        }
    }
}
