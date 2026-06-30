// One-off LIVE diagnostic: connect to the held window (CDP :9222), read the
// real training/curriculum/donor state the page is holding from the server's
// WS broadcast. Read-only — no chat send.
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => /git\.unityailab\.com/.test(p.url())) || ctx.pages()[0];

const out = await page.evaluate(() => {
  const r = {};
  try { r.url = location.href; } catch {}
  const b = window.brain;
  r.hasBrain = !!b;
  r.brainCtor = b && b.constructor && b.constructor.name;
  try {
    // RemoteBrain / cluster surface
    const c = (b && (b.cluster || b)) || {};
    r.grades = c.grades || (b && b.grades) || null;
    r.subGrades = c.subGrades || null;
    r.curStatus = (b && b.curriculum && typeof b.curriculum.subjectStatus === 'function')
      ? b.curriculum.subjectStatus() : null;
    r.lastState = (b && b._lastState) || (b && b.lastState) || window.__lastState || null;
  } catch (e) { r.brainErr = String(e); }
  // pull any visible dashboard text mentioning grade/donor/cell
  const txt = (document.body.innerText || '');
  const lines = txt.split('\n').map(s=>s.trim()).filter(Boolean);
  const want = /grade|donor|cell|ela|kindergart|replica|gpu|teach|consolidat|tick|neuron|gneuron|progress|stall|wait/i;
  r.dashLines = lines.filter(l => want.test(l)).slice(0, 60);
  // websocket-held state if app stashes it
  r.stateKeys = window.state ? Object.keys(window.state).slice(0,80) : null;
  if (window.state) {
    const s = window.state;
    r.stateSnap = {
      grade: s.grade, subject: s.subject, cell: s.cell || s.cellKey,
      donors: s.donors || s.donorCount, replicas: s.replicas,
      curriculum: s.curriculum, training: s.training, tick: s.tick,
      gpu: s.gpu, wsPressure: s.wsPressure, consciousness: s.consciousness && Object.keys(s.consciousness),
    };
  }
  return r;
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
