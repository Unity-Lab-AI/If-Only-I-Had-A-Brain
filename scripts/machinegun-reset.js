/* UNITY MACHINE GUN v2 - paste into the browser console (F12) on ANY page of
 * https://if-only-i-had-a-brain.git.unityailab.com
 * ASCII only. Short lines. Nothing here can be broken by copy-wrap.
 *
 *   PASTE          arms and reports. Fires NOTHING.
 *   __mg.restart()    keeps weights. Safe. Use when she is wedged.
 *   __mg.savestart()  pulls new code, keeps weights.
 *   __mg.freshWalk()  pulls new code and WIPES ALL TRAINING. Asks twice.
 *   __mg.status()     one reading, no firing.
 *   __mg.stop = true  kill switch.
 *
 * scripts/machinegun-reset.js and "scripts/Machine Gun Reset.txt" carry the
 * SAME body on purpose. If you edit one, mirror the other.
 *
 * ---------------------------------------------------------------------------
 * WHY IT EXISTS: THE BUTTONS ARE NOT THERE
 *
 * On 2026-09-04 the brain was alive but PINNED for hours - the event loop
 * stalled by a 114 GB transfer sharing its disk - so every brain route timed
 * out and the dashboard's Brain Power panel had no controls to offer. The
 * operator could not press anything. This is the press, without the page.
 *
 * It talks ONLY to /ctl/*, the separate always-up control-plane service that
 * exists precisely for the moment the brain is unreachable. The savestart
 * gatling fires /admin/update - the BRAIN's own route - which is exactly what
 * is dead when you need it most.
 *
 * ---------------------------------------------------------------------------
 * IT IS A RETRIER, NOT A FLOOD
 *
 * A savestart POST is safe to duplicate. A restart or an update is not:
 * self-update.sh runs DETACHED and does a --delete rsync overlay, so a press
 * fired into the middle of one can interrupt a half-written overlay, and two
 * racing restarts can SIGKILL a process that was already coming back.
 * One at a time, wait for a verdict, then re-arm.
 *
 * ---------------------------------------------------------------------------
 * IT CONFIRMS BY ActiveEnterTimestamp, WHICH IS THE LESSON OF THAT NIGHT
 *
 * "Did it restart?" was mis-answered for over an hour from portOpen, uptime and
 * the build stamp - all of which need the brain to be SERVING, which is exactly
 * what a broken brain is not. The unit's active-enter timestamp needs nothing
 * from the brain, cannot go backwards, and moves if and only if the unit really
 * restarted. A brain that merely starts answering again with the SAME
 * activeEnter has NOT restarted - that case fooled a human that night and this
 * tool reports it as not-landed.
 */
(function () {
  'use strict';

  try { if (window.__mg) window.__mg.stop = true; } catch (e) {}

  var CTL = location.origin + '/ctl/';
  var MAX_ATTEMPTS = 8;
  var WAIT_MS = 300000;   // 5 min - an update overlays code before it restarts
  var POLL_MS = 5000;

  function log(m, c) {
    try { console.log('%c[machinegun] ' + m, 'color:' + (c || '#8cf')); }
    catch (e) { console.log('[machinegun] ' + m); }
  }

  var G = window.__mg = {
    stop: false, attempts: 0, baseline: null, busy: false, verdict: null
  };

  function getStatus() {
    return fetch(CTL + 'status?cb=' + Date.now(), { cache: 'no-store' })
      .then(function (r) {
        if (r.status === 401) { return { __auth: true }; }
        return r.ok ? r.json() : null;
      })
      .catch(function () { return null; });
  }

  G.status = function () {
    return getStatus().then(function (j) {
      if (!j) { log('could not read /ctl/status.', '#f88'); return null; }
      if (j.__auth) {
        log('401 from /ctl/ - this tab has no admin session.', '#f88');
        log('Open ' + CTL + 'status in a tab, enter the admin login, then', '#f88');
        log('come back and paste this again.', '#f88');
        return null;
      }
      var u = j.unit || {};
      log('phase=' + j.phase + '  portOpen=' + j.portOpen
        + '  activeEnter=' + u.activeEnter);
      log('  activeState=' + u.activeState + '/' + u.subState
        + '  exit=' + u.exitStatus + '  nRestarts=' + u.nRestarts
        + '  mem=' + (u.memoryBytes ? (u.memoryBytes / 1073741824).toFixed(2) + ' GB' : '?'));
      return j;
    });
  };

  // The verdict. Nothing else counts.
  function landed(j) {
    return !!(j && j.unit && j.unit.activeEnter && G.baseline
      && j.unit.activeEnter !== G.baseline);
  }

  function watch(deadline) {
    if (G.stop) { log('stopped by kill switch.', '#fc0'); return Promise.resolve(false); }
    return getStatus().then(function (j) {
      if (landed(j)) {
        G.verdict = 'LANDED';
        log('CONFIRMED - activeEnter moved:', '#6f6');
        log('  ' + G.baseline + '  ->  ' + j.unit.activeEnter, '#6f6');
        log('  phase=' + j.phase + ' portOpen=' + j.portOpen
          + ' - the unit really restarted. Measured, not assumed.', '#6f6');
        return true;
      }
      if (Date.now() > deadline) return false;
      return new Promise(function (r) { setTimeout(r, POLL_MS); })
        .then(function () { return watch(deadline); });
    });
  }

  function fire(verb, label) {
    if (G.busy) { log('already firing - use __mg.stop=true first.', '#fc0'); return; }
    G.busy = true; G.stop = false; G.attempts = 0; G.verdict = null;
    return getStatus().then(function (j) {
      if (!j || j.__auth || !j.unit || !j.unit.activeEnter) {
        // !! NEVER GUESSES. A spotter with no baseline declares victory on its
        // first poll - the exact bug that killed the gatling's barrels before a
        // single POST could land.
        log('REFUSING TO FIRE - no baseline from /ctl/status.', '#f88');
        log('Without it, a landed press and a failed one look identical.', '#f88');
        G.busy = false;
        return;
      }
      G.baseline = j.unit.activeEnter;
      log('baseline activeEnter = ' + G.baseline);
      log('firing ' + label + ' (POST /ctl/' + verb + '), one at a time.');
      return step(verb, label);
    });
  }

  function step(verb, label) {
    if (G.stop) { log('stopped.', '#fc0'); G.busy = false; return; }
    if (G.attempts >= MAX_ATTEMPTS) {
      G.verdict = 'GAVE UP'; G.busy = false;
      log('GIVING UP after ' + MAX_ATTEMPTS + ' attempts.', '#f88');
      log('activeEnter never moved. This is a CANNOT-TELL, not a failure', '#f88');
      log('and not a success: a self-update may still be running and', '#f88');
      log('holding the restart, or the unit is stuck in a long', '#f88');
      log('synchronous operation. Check __mg.status() before firing more.', '#f88');
      return;
    }
    G.attempts++;
    log('attempt ' + G.attempts + '/' + MAX_ATTEMPTS + ' - POST /ctl/' + verb);
    return fetch(CTL + verb, { method: 'POST', cache: 'no-store' })
      .then(function (r) {
        return r.text().then(function (t) { return { s: r.status, t: t }; });
      })
      .catch(function (e) { return { s: 0, t: String((e && e.message) || e) }; })
      .then(function (res) {
        // A dropped connection is what a WORKING press looks like from a
        // browser - and also what an unreachable server looks like. So the
        // response is logged and then IGNORED. Only activeEnter decides.
        log('  -> http ' + res.s + ' ' + String(res.t).slice(0, 140));
        log('  watching activeEnter for ' + (WAIT_MS / 60000) + ' min...');
        return watch(Date.now() + WAIT_MS);
      })
      .then(function (ok) {
        if (ok) { G.busy = false; return; }
        if (G.stop) { G.busy = false; return; }
        log('  not landed - re-arming.', '#fc0');
        return step(verb, label);
      });
  }

  G.restart = function () { return fire('restart', 'RESTART (keeps weights)'); };
  G.savestart = function () { return fire('update-savestart', 'UPDATE + SAVESTART (keeps weights)'); };

  G.freshWalk = function () {
    // !! THE ONLY IRREVERSIBLE VERB HERE. Two confirmations, and the second one
    // states the consequence rather than asking a yes/no it is easy to click
    // through.
    if (!window.confirm('FRESH WALK - pull new code and WIPE ALL TRAINING?\n\n'
      + 'Every trained weight, episode and schema is destroyed.\n'
      + 'Identity anchors survive. Nothing she has LEARNED does.\n\n'
      + 'There is no way back.')) { log('cancelled.', '#fc0'); return; }
    var t = window.prompt('Type  WIPE  to confirm the fresh walk:');
    if (String(t || '').trim().toUpperCase() !== 'WIPE') {
      log('cancelled at the second confirmation.', '#fc0'); return;
    }
    return fire('update', 'FRESH WALK (WIPES ALL TRAINING)');
  };

  log('ARMED - nothing has been fired.');
  log('  __mg.restart()     keeps weights');
  log('  __mg.savestart()   new code, keeps weights');
  log('  __mg.freshWalk()   new code, WIPES ALL TRAINING (asks twice)');
  log('  __mg.status()      one reading');
  log('  __mg.stop = true   kill switch');
  G.status();

  /* -------------------------------------------------------------------------
   * !! ONE HAZARD THAT IS NOT ABOUT THIS SCRIPT. The /update handler arms
   * server/.force-fresh BEFORE it spawns the deploy. If an earlier fresh-walk
   * press was refused by a gate, that flag can still be on disk - and then even
   * a plain restart() boots into a WIPE. self-update.sh disarms it on every
   * refusal path as of 2026-09-04; on an older box build, it does not.
   * ---------------------------------------------------------------------- */
})();
