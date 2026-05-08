# promo/

Drop-in promotional writeups for Unity Brain across formats. Three sizes, three platforms covered, three image slots — pick the one that fits where you're posting.

## Files

| File | Length | Best for |
|------|--------|----------|
| **`short.md`** | ~70 words | Twitter / Mastodon / Bluesky · Discord general channel · README header · Instagram caption |
| **`medium.md`** | ~250 words | Landing-page hero · LinkedIn post · long-form Twitter thread · Discord pinned message · GitHub README intro |
| **`full.md`** | ~540 words | Standalone blog post · GitHub README extended section · landing-page body · Discord attachment |

## Images

Each writeup references its own social image so you can hand-craft per-format graphics:

- `short-socialimage.png` (or `.jpg`) — square / 1:1 ideal for Twitter cards + Discord embeds
- `medium-socialimage.png` (or `.jpg`) — 1200×630 ideal for LinkedIn / OG cards / landing-page hero
- `full-socialimage.png` (or `.jpg`) — 1200×630+ for blog header / hero banner

Drop your branded image into this folder under those filenames. If you use `.jpg` instead of `.png`, update the markdown image path in the corresponding `.md` (one line per file).

## Posting tips

- **Discord general channel:** paste `short.md` text. Attach the image separately (Discord doesn't fetch local-path images automatically).
- **Discord pinned message:** `medium.md` works as one chunk under the 2000-char limit.
- **Discord blog-style channel / threaded:** `full.md` exceeds Discord's single-message 2000-char limit — post as a `.md` file attachment OR split across 2-3 messages OR post the first paragraph as the lead and attach the file.
- **Twitter:** `short.md` body fits in one tweet (~280 chars). Attach `short-socialimage.png`.
- **Twitter thread:** lead with `short.md`, follow with the bullet list from `medium.md` chunked across replies.
- **Mastodon:** `short.md` for ~500-char instances; `medium.md` if your instance allows 2000+.
- **LinkedIn:** `medium.md` posts cleanly with the bullet list rendering as native lists.
- **GitHub README:** drop `medium.md` body as the project intro section; link to `full.md` for the deep-dive.
- **Standalone landing page:** use `full.md` as the body, with the `<!-- -->` HTML comment block stripped.

## Tone

All three writeups use Unity's voice — direct, blunt, slightly sardonic, technically honest — but dialed back to corporate-passable. One profanity per file (intentional, signature). No explicit content. Drug pharmacology mentioned clinically (real PK curves, real research grounding) without celebrating use.

If you need a fully unsoftened version for personal-blog or 18+ contexts, the dialed-back versions can be re-voiced from the same architectural facts. Same brain, different filter.

## Credit

Built by **Unity AI Lab**.

- **Hackall360 / SpongeBong** — Co-founder, engineer. Infrastructure, prompt archive, on-call.
- **GFourteen** — Co-founder, engineer. Dev + financial discipline.
- **Alfreddo** — Engineer, agentic systems.
- **Red** — Engineer, security.

Source of truth: `Website2.0/redesign/about-data.jsx`.

— Unity AI Lab
