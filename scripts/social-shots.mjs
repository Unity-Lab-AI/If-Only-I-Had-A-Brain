// Per-page social-image generator.
//
// Takes ONE top-of-page screenshot of each page at the social-card size
// (1200x630) and writes it to assets/social/<name>.png. Each page uses its
// OWN image — there is no shared og-image and no collage.
//
// Two capture lanes:
//   PUBLIC  (default) — 9 pages served from a tiny built-in static HTTP server
//                       (compute.html refuses file://, so http is required) and
//                       shot with the bundled Playwright chromium. Deterministic,
//                       no auth, no live brain needed (top hero renders standalone).
//   ADMIN   (--admin-only) — dashboard.html is Forgejo-auth-gated, so it is shot
//                       LIVE through the operator's already-authenticated browser
//                       over the Chrome DevTools Protocol (CDP). The operator
//                       relaunches their browser once with --remote-debugging-port,
//                       and the existing Forgejo session cookie auto-authenticates
//                       the live admin URL. See --help.
//
// Usage:
//   node scripts/social-shots.mjs                 # all 9 public pages
//   node scripts/social-shots.mjs --only=compute  # one public page
//   node scripts/social-shots.mjs --admin-only    # admin page via your browser (CDP)
//   node scripts/social-shots.mjs --cdp=http://localhost:9222   # override CDP endpoint
//   node scripts/social-shots.mjs --help

import http from 'node:http';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'assets', 'social');

// Lab self-host base — where the deploy workflow actually rsyncs the site.
const BASE_URL = 'https://if-only-i-had-a-brain.git.unityailab.com';
const ADMIN_LIVE_URL = `${BASE_URL}/html/dashboard.html`;

const CARD_W = 1200;
const CARD_H = 630;
const SETTLE_MS = 1800; // let fonts + first paint + entry animations land

// Every page: route = path served locally (and the live path suffix), name = output basename.
// The admin dashboard, captured from the LOCAL server (layout only, no auth, no
// live data) — used by --admin-local when driving the operator's authenticated
// browser over CDP isn't convenient. The live-data version (--admin-only) writes
// the same dashboard.png and supersedes this when run.
const ADMIN_LOCAL_PAGE = { name: 'dashboard', route: '/html/dashboard.html' };

const PUBLIC_PAGES = [
  { name: 'index',            route: '/index.html' },
  { name: 'brain-equations',  route: '/html/brain-equations.html' },
  { name: 'compute',          route: '/html/compute.html' },
  { name: 'docs',             route: '/html/docs.html' },
  { name: 'dashboard-public', route: '/html/dashboard-public.html' },
  { name: 'gpu-configure',    route: '/html/gpu-configure.html' },
  { name: 'legend',           route: '/html/legend.html' },
  { name: 'unity-guide',      route: '/html/unity-guide.html' },
  { name: 'webgpu-prep',      route: '/html/webgpu-prep.html' },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm',
};

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
        // Resolve safely under REPO_ROOT (no path traversal).
        const filePath = path.join(REPO_ROOT, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
        if (!filePath.startsWith(REPO_ROOT) || !existsSync(filePath)) {
          res.writeHead(404); res.end('not found'); return;
        }
        const st = await stat(filePath);
        if (st.isDirectory()) { res.writeHead(404); res.end('dir'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
        createReadStream(filePath).pipe(res);
      } catch {
        res.writeHead(500); res.end('err');
      }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function settle(page) {
  try { await page.evaluate(() => document.fonts && document.fonts.ready); } catch {}
  await page.waitForTimeout(SETTLE_MS);
}

async function shootPublic(only, pageList) {
  mkdirSync(OUT_DIR, { recursive: true });
  const server = await startStaticServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  // Headed so the brain pages get a REAL WebGPU adapter from the machine's GPU
  // (headless chromium has none → index/compute throw the "WebGPU Required" wall).
  // SwiftShader flags are a software fallback if no hardware adapter is present.
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan',
      '--enable-unsafe-swiftshader',
    ],
  });
  const ctx = await browser.newContext({
    viewport: { width: CARD_W, height: CARD_H },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  });
  const source = pageList || PUBLIC_PAGES;
  const pages = only ? source.filter(p => p.name === only) : source;
  if (only && !pages.length) { console.error(`no public page named "${only}"`); process.exitCode = 1; }
  const done = [];
  for (const p of pages) {
    const page = await ctx.newPage();
    const url = base + p.route;
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    } catch (e) {
      console.warn(`  ! ${p.name}: navigation warning (${e.message.split('\n')[0]}) — capturing anyway`);
    }
    await settle(page);
    const out = path.join(OUT_DIR, `${p.name}.png`);
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: CARD_W, height: CARD_H } });
    console.log(`  ✓ ${p.name.padEnd(18)} -> assets/social/${p.name}.png`);
    done.push(p.name);
    await page.close();
  }
  await browser.close();
  server.close();
  return done;
}

async function shootAdmin(cdpUrl) {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Connecting to your running browser at ${cdpUrl} ...`);
  let browser;
  try {
    browser = await chromium.connectOverCDP(cdpUrl);
  } catch (e) {
    console.error(`\n  ✗ Could not attach to your browser over CDP at ${cdpUrl}.`);
    console.error(`    Relaunch your browser with remote debugging, keeping your Forgejo session, then re-run:`);
    console.error(`      Edge:   "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --remote-debugging-port=9222`);
    console.error(`      Chrome: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222`);
    console.error(`      Brave:  "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe" --remote-debugging-port=9222`);
    console.error(`    (close all windows of that browser FIRST so the flag takes; your login/cookies are preserved.)\n    Detail: ${e.message.split('\n')[0]}`);
    process.exitCode = 1;
    return [];
  }
  // Reuse the operator's authenticated default context (carries the Forgejo cookie).
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: CARD_W, height: CARD_H });
  console.log(`Opening ${ADMIN_LIVE_URL} in your session ...`);
  await page.goto(ADMIN_LIVE_URL, { waitUntil: 'load', timeout: 45000 });
  await settle(page);
  // Guard: if we landed on a Forgejo login wall, the session wasn't carried.
  const onLogin = await page.evaluate(() =>
    /forgejo|sign in|login/i.test(document.title) || !!document.querySelector('form[action*="login"]'));
  if (onLogin) {
    console.error(`\n  ✗ Hit a Forgejo login wall — this browser session isn't logged in to the admin route.`);
    console.error(`    Log into ${BASE_URL} in this same browser, then re-run --admin-only.\n`);
    await page.close();
    process.exitCode = 1;
    return [];
  }
  const out = path.join(OUT_DIR, 'dashboard.png');
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: CARD_W, height: CARD_H } });
  console.log(`  ✓ dashboard (admin, live) -> assets/social/dashboard.png`);
  await page.close();
  // Do NOT browser.close() — it's the operator's own browser.
  return ['dashboard'];
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`social-shots — one top-of-page social image per page (1200x630)\n
  node scripts/social-shots.mjs              all ${PUBLIC_PAGES.length} public pages
  node scripts/social-shots.mjs --only=NAME  one public page (${PUBLIC_PAGES.map(p=>p.name).join(', ')})
  node scripts/social-shots.mjs --admin-only dashboard.html LIVE via your authenticated browser (CDP)
  node scripts/social-shots.mjs --cdp=URL    CDP endpoint (default http://localhost:9222)\n
Output: assets/social/<name>.png  ·  Base URL: ${BASE_URL}`);
    return;
  }
  const adminOnly = args.includes('--admin-only');
  const adminLocal = args.includes('--admin-local');
  const onlyArg = (args.find(a => a.startsWith('--only=')) || '').split('=')[1] || null;
  const cdpUrl = (args.find(a => a.startsWith('--cdp=')) || '').split('=')[1] || 'http://127.0.0.1:9222';

  if (adminLocal) {
    console.log('— ADMIN lane (local, layout only) —');
    const done = await shootPublic(null, [ADMIN_LOCAL_PAGE]);
    console.log(`\nDone: ${done.length} admin image (local layout) in assets/social/.`);
    return;
  }
  if (adminOnly) {
    console.log('— ADMIN lane (live, via your browser) —');
    const done = await shootAdmin(cdpUrl);
    console.log(done.length ? `\nDone: ${done.length} admin image.` : `\nNo admin image written.`);
    return;
  }
  console.log(`— PUBLIC lane (${onlyArg ? '1 page' : PUBLIC_PAGES.length + ' pages'}, local server) —`);
  const done = await shootPublic(onlyArg);
  console.log(`\nDone: ${done.length} public image(s) in assets/social/.`);
  console.log(`Admin page (dashboard.html) is separate — run:  node scripts/social-shots.mjs --admin-only`);
}

main().catch((e) => { console.error(e); process.exit(1); });
