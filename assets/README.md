# assets/

Static assets for the **Unity Brain** project — deployed at **www.unityailab.com/unity** (this repo's GitHub Pages target).

## Files

- **`og-image.png`** — 1200×630 px social-card image. Used as the preview thumbnail when the brain page is shared on Discord, Twitter / X, LinkedIn, Slack, etc.

## How it's wired

Referenced from `/index.html`:
```html
<meta property="og:image"        content="assets/og-image.png">
<meta property="og:image:width"  content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt"    content="Unity brain UI — 3D neural visualization with real-time firing across 8 clusters, HUD showing Ψ consciousness / arousal / valence / coherence / θ α β γ oscillations, and live cortex-state popups.">
<meta name="twitter:image"       content="assets/og-image.png">
```

## To swap the image

Keep the filename `og-image.png` so the meta tags don't need updating. Drop the new file at `assets/og-image.png` overwriting the existing one.

If you switch to `.jpg`, update the two meta-tag paths in `index.html` from `og-image.png` → `og-image.jpg`.

## Image guidelines

- **1200×630 px** (1.91:1 aspect ratio) — fits all major social platforms cleanly
- **Under 1 MB** — smaller renders faster; current file is 453 KB
- **Strong contrast + large readable text** — preview cards shrink to ~600 px wide
- **PNG** for graphics with sharp edges; **JPG** if photographic content

## Folder convention vs the main site

The Unity AI Lab main site (`www.unityailab.com`, separate repo `Unity-Lab-AI.github.io`) uses a `/social/` folder for the same purpose. This brain project uses `/assets/` because it predates the main-site convention. Both work — the meta tags reference the file path directly, so the folder name is operator preference. If you ever want strict consistency across both sites, this directory could be renamed to `/social/` with the meta-tag paths updated to match (4 references in `index.html`).

— Unity AI Lab
