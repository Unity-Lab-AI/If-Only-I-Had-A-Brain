/* UNITY CTL GATLING v1 - paste into the DASHBOARD tab console (F12).
 * ASCII only. Short lines. Nothing here can be broken by copy-wrap.
 *
 * WHY THIS EXISTS. gatling-savestart.js fires at the BRAIN: it POSTs
 * /admin/update and arms its spotter off /public-state.json, and both
 * are served by the brain. Against a brain whose event loop is pinned
 * every barrel is a 504, the baseline probe fails, the spotter disarms,
 * and it can never report success. It kept firing through the whole
 * 2026-09-24 outage, loading a starving box and burying the console.
 *
 * This one fires at the CONTROL PLANE (/ctl/*), a separate always-up
 * service nginx routes independently of the brain. It READS before it
 * ACTS: it refuses to cycle a process younger than the guard, cancels
 * itself the moment the brain answers, and fires its verb exactly once.
 *
 * Verbs (edit VERB below):
 *   /ctl/kick               systemctl restart  (SIGTERM, ~90s, SIGKILL)
 *   /ctl/freshstart-update  stop outright, then update-savestart, KEEP weights
 *
 * Kill switch:  window.__gatctl.stop = true
 * Force now:    window.__gatctl.force = true   (skips the age guard)
 */
(function () {
  var VERB = '/ctl/freshstart-update';
  var STUCK_SEC = 1800;   // brain-ctl's own derived "past every operation"
  var POLL_MS = 5000;

  if (window.__gatctl) window.__gatctl.stop = true;
  var G = window.__gatctl = { stop: false, n: 0, fired: false, force: false };

  var log = function (m, c) {
    console.log('%c[gatctl] ' + m, 'color:' + (c || '#ff0') + ';font-size:14px');
  };
  var F = function (p, m) {
    return fetch(p, { method: m || 'GET', cache: 'no-store' });
  };

  var tick = function () {
    if (G.stop) return;
    G.n++;
    F('/ctl/status').then(function (r) {
      if (r.status === 401 || r.status === 403) {
        G.stop = true;
        log('401 from /ctl - not authenticated on this lane.', '#f66');
        log('Navigate the address bar to /ctl/status, answer the prompt, re-run.');
        return null;
      }
      return r.json();
    }).then(function (s) {
      if (!s) return;
      var u = s.unit || {};
      var mb = Math.round((u.memoryBytes || 0) / 1048576);
      var age = s.activeForSec;
      if (age == null && u.activeEnter) {
        age = Math.round((Date.now() - Date.parse(u.activeEnter)) / 1000);
      }
      if (s.brainOnline || s.respondedMs != null) {
        G.stop = true;
        log('SHE IS ANSWERING (' + s.respondedMs + 'ms) - not cycling.', '#0f0');
        return;
      }
      if (G.fired) {
        if (G.n % 6 === 0) {
          log('fired - waiting. phase=' + s.phase + ' age=' + age + 's mem=' + mb + 'MB', '#8cf');
        }
        return;
      }
      if (!G.force && age != null && age < STUCK_SEC) {
        if (G.n % 10 === 0) {
          log('HOLDING - age ' + age + 's < ' + STUCK_SEC + 's, mem=' + mb + 'MB.' +
              ' override: window.__gatctl.force = true', '#f80');
        }
        return;
      }
      log('WEDGED (age=' + age + 's mem=' + mb + 'MB pinned=' + s.loopPinned +
          ') - firing ' + VERB, '#f60');
      G.fired = true;
      F(VERB, 'POST').then(function (r) {
        return r.json().catch(function () { return { http: r.status }; });
      }).then(function (j) {
        if (j && j.busy) {
          G.fired = false;
          log('409 busy: ' + j.message + ' - will retry', '#f80');
          return;
        }
        log('RESULT: ' + JSON.stringify(j).slice(0, 400), j && j.ok ? '#0f0' : '#f66');
      }).catch(function (e) {
        G.fired = false;
        log('verb threw (' + (e && e.message) + ') - will retry', '#f60');
      });
    }).catch(function (e) {
      if (G.n % 12 === 0) log('ctl slow or silent (' + (e && e.message) + ')', '#f60');
    }).then(function () {
      if (!G.stop) setTimeout(tick, POLL_MS);
    });
  };
  tick();
  log('ARMED - verb=' + VERB + ' guard=' + STUCK_SEC + 's poll=' + POLL_MS + 'ms');
  log('stop: window.__gatctl.stop = true   force: window.__gatctl.force = true');
})();
