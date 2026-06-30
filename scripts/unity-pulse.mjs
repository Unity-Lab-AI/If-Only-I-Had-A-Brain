// LIVE pulse: read donor/GPU/grade/spike stats from the held page, twice,
// ~40s apart, and diff — definitive stalled-vs-progressing check. Read-only.
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => /git\.unityailab\.com/.test(p.url())) || ctx.pages()[0];

async function sample() {
  return await page.evaluate(() => {
    const grab = (re) => {
      const t = document.body.innerText || '';
      const m = t.match(re); return m ? m[0] : null;
    };
    const banner = document.getElementById('unity-donor-banner');
    const bannerShown = !!banner && getComputedStyle(banner).display !== 'none' && (banner.offsetParent !== null);
    return {
      t: Date.now(),
      gpu: grab(/GPU\s+\d+%/i),
      grade: grab(/GRADE\s+\S+/i),
      gradeLine: grab(/ela:\S+.*?life:\S+/i),
      neurons: grab(/[\d,]+\s*Neurons/i) || grab(/Total Neurons[^\n]*/i),
      spikes: grab(/Spikes:\s*[\d,]+\/[\d,]+/i),
      donated: grab(/Total neuron-compute donated[^\n]*/i),
      donorGPUs: grab(/Donor GPUs[^\n]*/i),
      donorBanner: bannerShown,
      donorBannerText: bannerShown ? (banner.innerText||'').slice(0,120) : null,
    };
  });
}

const a = await sample();
console.log('SAMPLE 1:', JSON.stringify(a, null, 2));
await page.waitForTimeout(40000);
const b = await sample();
console.log('SAMPLE 2:', JSON.stringify(b, null, 2));

const moved = [];
for (const k of ['gpu','grade','gradeLine','neurons','spikes','donated']) {
  if (a[k] !== b[k]) moved.push(`${k}: ${a[k]} -> ${b[k]}`);
}
console.log('\nMOVED in 40s:', moved.length ? moved.join(' | ') : 'NOTHING CHANGED');
console.log('Donor banner up:', b.donorBanner, b.donorBannerText || '');
await browser.close();
