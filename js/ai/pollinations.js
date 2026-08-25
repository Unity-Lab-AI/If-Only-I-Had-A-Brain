/**
 * PollinationsAI — Browser-side Pollinations API client.
 *
 * Endpoints (current — NOT the deprecated text.pollinations.ai):
 *   Text:  https://gen.pollinations.ai/v1/chat/completions
 *   Image: https://image.pollinations.ai/prompt/{prompt} (anonymous free tier — gen.pollinations.ai/image requires a key, ours are dead)
 *   Audio: https://gen.pollinations.ai/v1/audio/speech
 *   Auth:  https://enter.pollinations.ai/authorize
 *
 * No external dependencies. Uses fetch() only.
 * Works without an API key (free tier); BYOP key unlocks higher limits.
 */

// LLMGUT.5/.6 — `GEN_URL` ('https://gen.pollinations.ai') is retired. It served
// the text lane, the TTS lane and the model list, all now deleted. This module
// is images only.
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

    // LLMGUT.5 (2026-08-25) — THE TEXT LANE IS DELETED.
    //
    // `chat()` POSTed to `gen.pollinations.ai/v1/chat/completions`. Its own
    // doc-comment said it was kept solely for the vision describer — and that
    // describer is gone (`app.js` now reads "Vision-describer auto-detect
    // removed — no LLM describer to probe"), replaced by her equational mind's
    // eye. So it had ZERO call sites and was an OpenAI-shaped text-generation
    // path sitting in the tree with nothing using it. `listModels()` went with
    // it for the same reason. The endpoint also 401s on the anonymous tier now,
    // so it was doubly dead.
    //
    // ⛔ THIS DELETION IS SURGICAL ON PURPOSE. The image lane below is
    // LOAD-BEARING and stays: `image.pollinations.ai/prompt` is how she gets
    // her reference look-ups and her generated images, it is verified unfiltered
    // (WORDSALAD.1f), and gutting this file wholesale would have taken her eyes
    // out along with the LLM.

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
            // image.pollinations.ai/prompt/{prompt} — the host that serves the
            // ANONYMOUS free tier (re-verified 2026-08-18 with THREE prompts,
            // all 200 image/jpeg, model param honored — the never-reflip-on-one-
            // test law satisfied). gen.pollinations.ai/image/ now returns an
            // explicit 401 POLICY body for anonymous requests ("A valid API key
            // is required") — and the account keys are DEAD (2026-08-17 law:
            // free tier only), so that gateway is a locked door, not an outage.
            // This is the chat-window image path only — her equational
            // mind's-eye imagination is a separate engine and was never affected.
            // Auth via ?key= param (a browser <img> can't send a Bearer header);
            // a saved key still rides along harmlessly if one is set.
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

    // LLMGUT.5/.6 — `speak()` and `listModels()` DELETED.
    //
    // Operator: "we do not use pollinations tts we use the unity one
    // equations". Correct — her voice is Equation Unity One (piper hfc_female
    // through the CDF 9/7 round-trip) with her own banked word equations
    // behind it. This was an external TTS lane that nothing reached any more,
    // and it answered 401 on the anonymous tier regardless.
    //
    // With the text lane, the TTS lane and the model list all gone, this
    // module does exactly ONE thing, which is the whole point: Pollinations is
    // IMAGES. `GEN_URL` is retired with them; only `IMAGE_URL` remains.
}
