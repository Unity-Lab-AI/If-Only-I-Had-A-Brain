/* UNITY CTL GATLING v2 - paste into the DASHBOARD tab console (F12).
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
 * ACTS: refuses to cycle a process younger than the guard, cancels
 * itself the moment the brain answers, fires once, and KEEPS THE WEIGHTS
 * (savestart - never a fresh walk).
 *
 * TWO PATHS, same outcome:
 *   1. POST /ctl/freshstart-update  (ctl restarted since 2026-09-24)
 *   2. 404 -> fallback the running ctl CAN do:
 *      POST /ctl/stop -> wait unit !active -> POST /ctl/update-savestart
 *
 * CREDENTIALS. nginx Basic-auth ("Unity admin") fronts /ctl/. Leave USER
 * and PASS empty if this tab is already authenticated (you have pressed
 * a panel button or visited /ctl/status and answered the prompt). Fill
 * them only if you get 401. They live in this tab until reload; never
 * commit a filled copy.
 *
 * Kill switch:  window.__gatctl.stop = true
 * Force now:    window.__gatctl.force = true   (skips the age guard)
 */
(function () {
  var USER = '';
  var PASS = '';
  var STUCK_SEC = 1800;   // brain-ctl's own derived "past every operation"
  var POLL_MS = 5000;
  var STOP_WAIT_MS = 240000;   // stop = ask 10s + wait 20s + SIGTERM..SIGKILL 90s

  if (window.__gatctl) window.__gatctl.stop = true;
  var G = window.__gatctl = {
    stop: false, n: 0, fired: false, force: false, phase: 'arm', lastEnter: null
  };
  var H = (USER || PASS)
    ? { Authorization: 'Basic ' + btoa(USER + ':' + PASS) } : {};

  var log = function (m, c) {
    var t = new Date().toLocaleTimeString();
    console.log('%c[gatctl ' + t + '] ' + m, 'color:' + (c || '#ff0') + ';font-size:14px');
  };
  var F = function (p, m) {
    return fetch(p, { method: m || 'GET', cache: 'no-store', headers: H });
  };
  var J = function (r) {
    return r.json().catch(function () { return { http: r.status }; })
      .then(function (j) { j.http = r.status; return j; });
  };
  var status = function () {
    return F('/ctl/status').then(function (r) {
      if (r.status === 401 || r.status === 403) return { auth: false, http: r.status };
      return J(r);
    });
  };

  // Path 2 - the verbs the running ctl already has.
  var fallback = function () {
    G.phase = 'fallback-stop';
    log('fallback: POST /ctl/stop (expect ~2 min: ask, wait, SIGTERM, SIGKILL)', '#f80');
    return F('/ctl/stop', 'POST').then(J).then(function (j) {
      log('stop -> ' + JSON.stringify(j).slice(0, 200), j.ok ? '#8cf' : '#f66');
      var t0 = Date.now();
      var wait = function () {
        return status().then(function (s) {
          var st = s.unit && s.unit.activeState;
          var mb = Math.round(((s.unit || {}).memoryBytes || 0) / 1048576);
          if (st && st !== 'active') {
            log('unit is ' + st + ' (mem ' + mb + 'MB) - halted', '#0f0');
            return true;
          }
          if (Date.now() - t0 > STOP_WAIT_MS) {
            log('unit STILL active after ' + Math.round(STOP_WAIT_MS / 1000) +
                's - the box stop timeout is longer than expected. NOT updating on ' +
                'a live process. This needs a shell: sudo systemctl kill -s KILL unity-brain', '#f66');
            return false;
          }
          log('waiting for stop... state=' + st + ' mem=' + mb + 'MB', '#8cf');
          return new Promise(function (r) { setTimeout(r, 8000); }).then(wait);
        });
      };
      return wait();
    }).then(function (halted) {
      if (!halted) return;
      G.phase = 'fallback-update';
      log('POST /ctl/update-savestart on the halted box (keeps weights; 2-10 min)', '#f80');
      return F('/ctl/update-savestart', 'POST').then(J).then(function (j) {
        log('update -> ' + JSON.stringify(j).slice(0, 300), j.ok ? '#0f0' : '#f66');
      });
    });
  };

  var fire = function () {
    G.fired = true;
    G.phase = 'fire';
    log('POST /ctl/freshstart-update', '#f60');
    return F('/ctl/freshstart-update', 'POST').then(J).then(function (j) {
      if (j.http === 404) {
        log('404 - the running ctl predates this verb; using the fallback path', '#f80');
        return fallback();
      }
      if (j.busy) {
        G.fired = false;
        log('409 busy: ' + j.message + ' - retrying in 15s', '#f80');
        return;
      }
      log('RESULT ' + JSON.stringify(j).slice(0, 300), j.ok ? '#0f0' : '#f66');
    }).catch(function (e) {
      G.fired = false;
      log('verb threw (' + (e && e.message) + ') - retrying', '#f60');
    });
  };

  var tick = function () {
    if (G.stop) return;
    G.n++;
    status().then(function (s) {
      if (s && s.auth === false) {
        G.stop = true;
        log('HTTP ' + s.http + ' on /ctl - not authenticated on this lane.', '#f66');
        log('Fill USER/PASS at the top of this script, or open /ctl/status in the ' +
            'address bar, answer the prompt, then re-run.', '#f66');
        return;
      }
      var u = s.unit || {};
      var mb = Math.round((u.memoryBytes || 0) / 1048576);
      var age = s.activeForSec;
      if (age == null && u.activeEnter) {
        age = Math.round((Date.now() - Date.parse(u.activeEnter)) / 1000);
      }
      if (G.lastEnter && u.activeEnter && u.activeEnter !== G.lastEnter) {
        log('RESTARTED - new activeEnter ' + u.activeEnter, '#0f0');
      }
      if (u.activeEnter) G.lastEnter = u.activeEnter;

      if (s.brainOnline || s.respondedMs != null) {
        G.stop = true;
        log('SHE IS ANSWERING (' + s.respondedMs + 'ms, ' + mb + 'MB). Done.', '#0f0');
        return;
      }
      if (G.fired) {
        if (G.n % 3 === 0) {
          log('[' + G.phase + '] ' + s.phase + ' age=' + age + 's mem=' + mb +
              'MB restarts=' + u.nRestarts, '#8cf');
        }
        return;
      }
      if (!G.force && age != null && age < STUCK_SEC) {
        if (G.n % 10 === 0) {
          log('HOLDING - age ' + age + 's < ' + STUCK_SEC + 's, mem=' + mb +
              'MB. override: window.__gatctl.force = true', '#f80');
        }
        return;
      }
      log('WEDGED (age=' + age + 's mem=' + mb + 'MB pinned=' + s.loopPinned + ')', '#f60');
      return fire();
    }).catch(function (e) {
      if (G.n % 12 === 0) log('ctl slow or silent (' + (e && e.message) + ')', '#f60');
    }).then(function () {
      if (!G.stop) setTimeout(tick, G.fired ? 15000 : POLL_MS);
    });
  };
  tick();
  log('ARMED - keep-weights freshstart. guard=' + STUCK_SEC + 's. ' +
      (USER ? 'auth: header' : 'auth: tab session'));
  log('stop: window.__gatctl.stop = true   force: window.__gatctl.force = true');
})();
