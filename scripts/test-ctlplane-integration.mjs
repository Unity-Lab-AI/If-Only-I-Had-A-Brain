#!/usr/bin/env node
/**
 * INTEGRATION-BOUNDARY + PACKAGING checks for the brain control plane.
 *
 * The other three suites test the service, the dashboard and the visitor pages.
 * Nothing tested the SEAMS between them, or whether the thing can actually be
 * installed. Those are exactly where this feature can break silently:
 *
 *  1. nginx <-> frontend contract. The offline bodies are hand-written JSON
 *     inside an nginx `return 200 '...'` directive. nginx will happily serve a
 *     malformed string, and every consumer does `.json()` — so a stray quote
 *     ships a site-wide parse error that no unit test would see. These assert
 *     the bodies parse AND carry the exact keys the frontend reads.
 *
 *  2. Frontend <-> contract. Every page that consumes the offline body must key
 *     off a field the body actually contains. A rename on either side silently
 *     reverts the whole "say brain offline" feature to the old broken
 *     behaviour, which is invisible until the brain next goes down.
 *
 *  3. Packaging. The install runbook names specific files, modes and paths. If a
 *     file is missing, non-executable, or the sudoers/unit reference a path that
 *     does not exist, the control plane is inert precisely when it is needed.
 *
 *  4. Cross-file consistency. The port, unit name and helper path appear in the
 *     service, the unit file, the sudoers rule, the nginx snippet and the
 *     dashboard. They must agree.
 *
 * No network, no browser, no box access — safe and fast, so it can gate a
 * commit. Run: node scripts/test-ctlplane-integration.mjs
 *
 * KNOWN LIMIT, stated rather than hidden: these read the repo's nginx snippet,
 * not the running nginx. That is checked separately by md5-comparing the
 * installed /etc/nginx/snippets/unity-brain-ctl.conf against the repo copy
 * (done on 2026-08-26: identical). The `@brain_offline_*` fallbacks were also
 * exercised for real on the live box with the brain stopped — both returned 200
 * with brainOffline:true. `@ctl_unreachable` uses the identical
 * proxy_intercept_errors + error_page mechanism on the same vhost, and was
 * confirmed present in the live config; it is not separately fetchable without
 * admin credentials, which I deliberately did not use.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(REPO, p), 'utf8');

const pass = []; const fail = [];
const check = (n, c, d = '') => { (c ? pass : fail).push(n + (c ? '' : ` — ${d}`)); console.log(`  ${c ? '✓' : '✗'} ${n}${c ? '' : ` — ${d}`}`); };

console.log('\n1. nginx offline bodies must be VALID JSON (nginx will not tell you)');
const NGINX = read('deploy/nginx-unity-brain-ctl.conf');
const bodies = {};
{
  // Pull each `return 200 '<json>';` out of its named location block.
  const re = /location\s+(@[a-z_]+)\s*\{[^}]*?return\s+200\s+'([^']+)'/gis;
  let m;
  while ((m = re.exec(NGINX)) !== null) bodies[m[1]] = m[2];

  check('found all three named offline locations', Object.keys(bodies).length === 3,
    `found ${JSON.stringify(Object.keys(bodies))}`);
  for (const [loc, raw] of Object.entries(bodies)) {
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { /* reported below */ }
    check(`${loc} body is valid JSON`, parsed !== null,
      'a malformed body ships a site-wide .json() parse error that nginx -t cannot catch');
    bodies[loc] = parsed;
  }
}

console.log('\n2. the offline contract carries the keys the FRONTEND actually reads');
{
  const state = bodies['@brain_offline_state'] || {};
  const eye = bodies['@brain_offline_mindseye'] || {};
  const ctl = bodies['@ctl_unreachable'] || {};

  // These are the exact fields each page branches on. Asserting the pairing is
  // the point: either side renaming silently reverts the feature.
  check('state body has brainOffline:true', state.brainOffline === true, JSON.stringify(state.brainOffline));
  check('state body has brainOnline:false', state.brainOnline === false, JSON.stringify(state.brainOnline));
  check('state body keeps type:"state" (shape-compatible with live payloads)', state.type === 'state', JSON.stringify(state.type));
  check('state body has state:null (so `s.state.x` consumers fail safe, not silently)', state.state === null);
  check('state body has a human sentence', typeof state.human === 'string' && state.human.length > 20);
  check('state human mentions the site staying up', /site stays up/i.test(state.human || ''), state.human);

  check("mind's-eye body has brainOffline:true", eye.brainOffline === true);
  check("mind's-eye body has a human sentence", typeof eye.human === 'string' && eye.human.length > 20);

  check('ctl-unreachable body distinguishes ITSELF from the brain', ctl.ctlOnline === false,
    'the control plane being down is a different (rarer) problem than the brain being down');
  check('ctl-unreachable tells you the one command that needs a shell',
    /systemctl start unity-brain-ctl/.test(ctl.human || ''), ctl.human);

  // Every consumer must key off a field that EXISTS in the body.
  const consumers = {
    'html/minds-eye.html': 'brainOffline',
    'html/dashboard.html': 'brainOffline',
    'html/compute.html': 'brainOffline',
    'index.html': 'brainOffline',
  };
  for (const [file, key] of Object.entries(consumers)) {
    const src = read(file);
    check(`${file} branches on \`${key}\``, src.includes(key),
      'without this the page renders the OLD broken behaviour when the brain is down');
    check(`${file} reads a key the body really has`, Object.prototype.hasOwnProperty.call(state, key) || Object.prototype.hasOwnProperty.call(eye, key));
  }
}

console.log('\n3. packaging — every file the runbook installs must exist and be usable');
{
  const files = {
    'server/brain-ctl.js': { mode: null },
    'deploy/brain-ctl-helper.sh': { mode: 0o111 },       // must be executable
    'deploy/sudoers.d/unity-brain-ctl': { mode: null },
    'deploy/unity-brain-ctl.service': { mode: null },
    'deploy/nginx-unity-brain-ctl.conf': { mode: null },
    'deploy/dropins/nightly-backup/10-fix-restic-password.conf': { mode: null },
    'deploy/BACKUP-DECISIONS.md': { mode: null },
    'scripts/test-brain-ctl.mjs': { mode: null },
    'scripts/test-brain-power-ui.mjs': { mode: null },
    'scripts/test-brain-offline-pages.mjs': { mode: null },
  };
  for (const [f, spec] of Object.entries(files)) {
    const abs = path.join(REPO, f);
    check(`${f} exists`, existsSync(abs));
    if (spec.mode && existsSync(abs)) {
      check(`${f} is executable`, (statSync(abs).mode & spec.mode) !== 0, `mode=${(statSync(abs).mode & 0o777).toString(8)}`);
    }
  }
  // The runbook must actually document the install, or the box drifts again.
  const README = read('deploy/README.md');
  for (const needle of ['brain-ctl-helper', 'unity-brain-ctl.service', 'visudo -cf', 'nginx -t', 'needsConfirm']) {
    check(`runbook documents \`${needle}\``, README.includes(needle));
  }
}

console.log('\n4. cross-file consistency — ports, unit names and paths must agree');
{
  const CTL = read('server/brain-ctl.js');
  const UNIT = read('deploy/unity-brain-ctl.service');
  const SUDO = read('deploy/sudoers.d/unity-brain-ctl');
  const HELPER = read('deploy/brain-ctl-helper.sh');
  const DASH = read('html/dashboard.html');

  check('ctl default port 7526 matches the unit', /7526/.test(CTL) && /UAL_CTL_PORT=7526/.test(UNIT));
  check('nginx proxies to 7526', /127\.0\.0\.1:7526/.test(NGINX));
  check('dashboard talks to 7526 in local mode', /7526/.test(DASH));
  check('unit targets the unity-brain unit', /UAL_BRAIN_UNIT=unity-brain\b/.test(UNIT));
  check('helper HARDCODES the same unit name', /ALLOWED_UNIT="unity-brain"/.test(HELPER),
    'the helper must not accept a unit from its caller');
  check('sudoers names the helper path the unit passes',
    /\/usr\/local\/sbin\/brain-ctl-helper/.test(SUDO) && /UAL_CTL_HELPER=\/usr\/local\/sbin\/brain-ctl-helper/.test(UNIT),
    'a mismatch here makes every power action fail with a sudo password prompt');
  check('unit keeps NoNewPrivileges=false (sudo needs it)', /NoNewPrivileges=false/.test(UNIT),
    'true would break the privileged helper — and the comment must explain why');
  check('unit disables the start-rate limiter', /StartLimitIntervalSec=0/.test(UNIT),
    'the recovery service must never be left permanently dead');
  check('unit is NOT bound to the brain lifecycle',
    !/(Requires|PartOf|BindsTo)=unity-brain\.service/.test(UNIT),
    'it must stay up precisely WHEN the brain is down');

  // The wiping verbs and their token must agree across service and UI.
  check('ctl requires the WIPE token', /confirmToken !== 'WIPE'/.test(CTL));
  check('dashboard sends the WIPE token', /confirmToken: 'WIPE'/.test(DASH));
  check('dashboard asks the operator to TYPE it', /typed !== 'WIPE'/.test(DASH));
  const typedGates = (DASH.match(/typed !== 'WIPE'/g) || []).length;
  check('BOTH wiping buttons are typed-gated (reset + update-fresh)', typedGates >= 2, `found ${typedGates}`);
}

console.log('\n5. likely failure modes are handled, not just the happy path');
{
  const CTL = read('server/brain-ctl.js');
  check('ctl survives an uncaught exception instead of dying', /uncaughtException/.test(CTL),
    'a control plane that dies looks alive to systemd but hangs for the operator');
  check('ctl survives an unhandled rejection', /unhandledRejection/.test(CTL));
  check('power actions are serialised (no overlapping start/stop)', /inFlight/.test(CTL));
  check('the JSON body reader is bounded', /16384/.test(CTL), 'an unbounded reader is a memory DoS');
  check('nginx fails FAST when the brain is down', /proxy_connect_timeout 2s/.test(NGINX),
    'without this the offline banner takes the full connect timeout to appear');
  check('the /ctl lane tolerates a slow start', /proxy_read_timeout 600s/.test(NGINX),
    'a start waits minutes for weights; the 60s default would report a false failure');
  check('helper validates nginx config BEFORE reloading', /nginx -t/.test(read('deploy/brain-ctl-helper.sh')),
    'reloading a broken config turns a brain outage into a total site outage');
  check('helper uses reload, not restart, for nginx', /systemctl reload nginx/.test(read('deploy/brain-ctl-helper.sh')),
    'restart would drop the static site, defeating the whole point');
  check('savererun refuses when the brain is down', /needsBrainUp/.test(CTL));
  check('stop attempts a graceful save first', /askBrainToShutdown\('\/shutdown'\)/.test(CTL));
}

console.log('\n' + '='.repeat(66));
if (fail.length) { console.log(`FAILED — ${pass.length} passed, ${fail.length} failed`); for (const f of fail) console.log('  ✗ ' + f); }
else console.log(`ALL PASS — ${pass.length} assertions (seams + packaging + failure modes)`);
console.log('='.repeat(66));
process.exit(fail.length ? 1 : 0);
