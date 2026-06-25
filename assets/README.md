# assets/

Static assets for the **Unity Brain** project — deployed at **https://if-only-i-had-a-brain.git.unityailab.com** (the lab self-host the deploy workflow rsyncs to).

## Files

- **`social/<page>.png`** — one 1200×630 px social-card image **per page**. Each page uses its OWN top-of-page screenshot as its preview thumbnail when shared on Discord, Twitter / X, LinkedIn, Slack, etc. There is no shared card and no collage — every page has a distinct image + a distinct social description.
- **`og-image.png`** — legacy single shared card (1200×630). No longer referenced by any page; kept only for history. The per-page `social/*.png` images replaced it.

### The per-page social images

| Image | Page |
|-------|------|
| `social/index.png` | `/index.html` — the live 3D brain |
| `social/brain-equations.png` | `/html/brain-equations.html` |
| `social/compute.png` | `/html/compute.html` |
| `social/docs.png` | `/html/docs.html` |
| `social/dashboard-public.png` | `/html/dashboard-public.html` |
| `social/dashboard.png` | `/html/dashboard.html` (admin — captured live, see below) |
| `social/gpu-configure.png` | `/html/gpu-configure.html` |
| `social/legend.png` | `/html/legend.html` |
| `social/unity-guide.png` | `/html/unity-guide.html` |
| `social/webgpu-prep.png` | `/html/webgpu-prep.html` |

## How it's wired

Every page declares its own absolute `og:image` / `twitter:image` + a custom `og:description` on the lab base URL. Example from `/index.html`:
```html
<meta property="og:image"        content="https://if-only-i-had-a-brain.git.unityailab.com/assets/social/index.png">
<meta property="og:image:width"  content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt"    content="Unity's live 3D brain — neurons firing across labeled regions, the Ψ HUD, and the TALK TO UNITY bar.">
<meta property="og:url"          content="https://if-only-i-had-a-brain.git.unityailab.com/">
<meta name="twitter:image"       content="https://if-only-i-had-a-brain.git.unityailab.com/assets/social/index.png">
```
Absolute URLs are required — Facebook / Twitter / LinkedIn scrapers do not resolve relative `og:image` paths.

## To regenerate the images

Generator: **`scripts/social-shots.mjs`** (Playwright). It runs a tiny built-in static server (compute.html refuses `file://`) and takes one 1200×630 top-of-page screenshot per page. The 9 public pages run **headed** so the brain pages get a real WebGPU adapter from the machine's GPU (headless chromium has none → the "WebGPU Required" wall).

```bash
npm install                 # one-time — installs playwright (root devDep)
npx playwright install chromium
npm run social:shots        # regenerate all 9 public images → assets/social/
node scripts/social-shots.mjs --only=compute   # just one page
```

### The admin page (`dashboard.html`) — captured through your browser

`dashboard.html` is Forgejo-auth-gated, so it is shot **live through your already-authenticated browser** over the Chrome DevTools Protocol — your existing Forgejo session cookie auto-authenticates the live admin URL. Relaunch your browser once with remote debugging (close all its windows first so the flag takes; your login is preserved), then:

```bash
# e.g. Edge:  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222
npm run social:shots:admin  # → assets/social/dashboard.png
```

## Image guidelines

- **1200×630 px** (1.91:1 aspect ratio) — fits all major social platforms cleanly
- **Under 1 MB** — the generated PNGs are ~50–190 KB each
- **Strong contrast + large readable text** — preview cards shrink to ~600 px wide
- The generator captures the TOP of each page, where the hero / title / first panel lives — keep important content above the fold

## Deploy

`assets/` (including `assets/social/*.png`) ships via the frontend rsync in `.forgejo/workflows/deploy.yml` on every push to `main`. The root dev `package.json` + `scripts/` are excluded.

— Unity AI Lab
