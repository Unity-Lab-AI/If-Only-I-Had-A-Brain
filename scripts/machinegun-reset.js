/* UNITY MACHINE GUN RESET v1 - paste into the dashboard tab console (F12).
 * ASCII only. Short lines. Nothing here can be broken by copy-wrap.
 *
 * Kill switch:  window.__mg.stop = true
 *
 * scripts/machinegun-reset.js and "scripts/Machine Gun Reset.txt" carry the
 * SAME body on purpose - whichever copy gets pasted must be the safe one.
 * If you edit one, mirror the other.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS, AND WHY IT IS NOT THE SAVESTART GATLING
 *
 * The gatling fires /admin/update from a pool of 6. That is the BRAIN's own
 * route, and on 2026-09-04 the brain spent hours ALIVE BUT PINNED - its event
 * loop stalled by a 114 GB transfer sharing the disk - so every brain route
 * timed out and the gatling would have had nothing to talk to.
 *
 * This one talks to the CONTROL PLANE (/ctl/*), a separate always-up service
 * that exists precisely for the moment the brain is unreachable.
 *
 * ---------------------------------------------------------------------------
 * IT IS A RETRIER, NOT A FLOOD, AND THAT IS DELIBERATE
 *
 * A savestart POST is safe to duplicate. A RESTART is not:
 *   - self-update.sh runs DETACHED and does a --delete rsync overlay. A restart
 *     fired into the middle of that can interrupt an overlay half-written.
 *   - two restarts racing can SIGKILL a process that was already coming back.
 * So this fires ONE at a time, waits for a verdict, and only then re-arms.
 * Concurrency here buys nothing and can cost the deploy.
 *
 * ---------------------------------------------------------------------------
 * IT CONFIRMS BY ActiveEnterTimestamp, WHICH IS THE LESSON OF THAT NIGHT
 *
 * "Did it restart?" was mis-answered for over an hour from portOpen, uptime and
 * the build stamp - all of which need the brain to be SERVING, which is exactly
 * what a broken brain is not. The unit's active-enter timestamp needs nothing
 * from the brain, cannot go backwards, and changes if and only if the unit
 * actually restarted. It is the only honest signal here.
 *
 * ⚠ NEVER GUESSES. If the baseline cannot be read it refuses to fire, because
 * a spotter with no baseline declares victory on its first poll - the exact bug
 * that killed the gatling's barrels before a single POST landed.
 */
(function () {
  'use strict';

  try { if (window.__mg) window.__mg.stop = true; } catch (e) {}

  var CTL = location.origin + '/ctl/';
  var G = window.__mg = {
    stop: false,
    attempts: 0,
    baseline: null,     // {activeEnter, nRestarts} read live at arm time
    armed: false,
    verdict: null
  };

  // Bounds. A restart that has not landed in this long has not landed.
  var MAX_ATTEMPTS = 8;
  var WAIT_MS = 45000;    // how long to watch for activeEnter to move
  var POLL_MS = 3000;
  var VERB = 'restart';   // /ctl/restart - see NOTE ON VERBS at the bottom

  function log(msg, colour) {
    try { console.log('%c[machinegun] ' + msg, 'color:' + (colour || '#8cf')); }
    catch (e) { console.log('[machinegun] ' + msg); }
  }

  function getStatus() {
    // credentials come from the tab's existing Basic-auth session; /ctl/ is
    // gated the same way /admin/ is.
    return fetch(CTL + 'status?cb=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function armBaseline() {
    return getStatus().then(function (j) {
      if (!j || !j.unit || !j.unit.activeEnter) {
        log('REFUSING TO FIRE - could not read a baseline from /ctl/status.', '#f88');
        log('A retrier with no baseline cannot tell a landed restart from a', '#f88');
        log('failed one, and would report success on its first poll.', '#f88');
        return false;
      }
      G.baseline = { activeEnter: j.unit.activeEnter, nRestarts: j.unit.nRestarts };
      G.armed = true;
      log('baseline: activeEnter=' + G.baseline.activeEnter
        + ' nRestarts=' + G.baseline.nRestarts);
      log('phase=' + j.phase + ' portOpen=' + j.portOpen);
      return true;
    });
  }

  // The verdict. activeEnter moving is the ONLY thing that means "it restarted".
  function landed(j) {
    return !!(j && j.unit && j.unit.activeEnter
      && j.unit.activeEnter !== G.baseline.activeEnter);
  }

  function watch(deadline) {
    if (G.stop) { log('stopped by kill switch.', '#fc0'); return Promise.resolve(false); }
    return getStatus().then(function (j) {
      if (landed(j)) {
        G.verdict = 'LANDED';
        log('CONFIRMED - activeEnter moved ' + G.baseline.activeEnter
          + '  ->  ' + j.unit.activeEnter, '#6f6');
        log('phase=' + j.phase + ' portOpen=' + j.portOpen
          + ' - the unit really restarted. Measured, not assumed.', '#6f6');
        return true;
      }
      if (Date.now() > deadline) return false;
      return new Promise(function (res) { setTimeout(res, POLL_MS); }).then(function () {
        return watch(deadline);
      });
    });
  }

  function fireOnce() {
    if (G.stop) { log('stopped.', '#fc0'); return Promise.resolve(); }
    if (G.attempts >= MAX_ATTEMPTS) {
      G.verdict = 'GAVE UP';
      log('GIVING UP after ' + MAX_ATTEMPTS + ' attempts.', '#f88');
      log('activeEnter never moved. This is a CANNOT-TELL, not a success:', '#f88');
      log('the unit may be stuck in a long synchronous operation, or a', '#f88');
      log('self-update may still be running and holding the restart.', '#f88');
      log('Check /ctl/status by hand before firing anything else.', '#f88');
      return Promise.resolve();
    }
    G.attempts++;
    log('attempt ' + G.attempts + '/' + MAX_ATTEMPTS + ' - POST /ctl/' + VERB);
    return fetch(CTL + VERB, { method: 'POST', cache: 'no-store' })
      .then(function (r) { return r.text().then(function (t) { return { s: r.status, t: t }; }); })
      .catch(function (e) { return { s: 0, t: String(e && e.message || e) }; })
      .then(function (res) {
        // A dropped connection is what a WORKING restart looks like from a
        // browser - and also what an unreachable server looks like. So the
        // response is logged and then IGNORED; only activeEnter decides.
        log('  -> http ' + res.s + ' ' + String(res.t).slice(0, 120));
        log('  watching activeEnter for ' + (WAIT_MS / 1000) + 's...');
        return watch(Date.now() + WAIT_MS);
      })
      .then(function (ok) {
        if (ok || G.stop) return;
        log('  not landed yet - re-arming.', '#fc0');
        return fireOnce();
      });
  }

  armBaseline().then(function (ok) {
    if (!ok) return;
    log('ARMED. One restart at a time, confirmed by activeEnter.');
    log('kill switch:  window.__mg.stop = true');
    return fireOnce();
  });

  /* -------------------------------------------------------------------------
   * NOTE ON VERBS - read before changing VERB above.
   *
   *   restart           keeps trained weights. The safe default, and what this
   *                     tool is for: a brain that is alive-but-wedged.
   *   update-savestart  pulls new code, keeps weights.
   *   update            pulls new code and WIPES ALL TRAINING. There is no way
   *                     back. This tool deliberately does NOT default to it.
   *
   * ⛔ AND ONE HAZARD THAT IS NOT ABOUT THIS SCRIPT: the /update handler arms
   * server/.force-fresh BEFORE it spawns the deploy. If a previous fresh-walk
   * press was refused by a gate, that flag may still be on disk, and then even
   * a plain `restart` here boots into a WIPE. self-update.sh disarms it on
   * every refusal path as of 2026-09-04 - but if you are on an older build on
   * the box, check for that file before firing.
   * ---------------------------------------------------------------------- */
})();
