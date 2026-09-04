/* UNITY MACHINE GUN v5 - paste into the browser console (F12) on ANY page of
 * https://if-only-i-had-a-brain.git.unityailab.com
 * ASCII only. Short lines. Nothing here can be broken by copy-wrap.
 *
 *   PASTE          arms and reports. Fires NOTHING.
 *   __mg.restart()    keeps weights. Safe. Use when she is wedged.
 *   __mg.savestart()  pulls new code, keeps weights.
 *   __mg.reset()      WIPES ALL TRAINING, no deploy, ~2 min. Asks twice.
 *   __mg.freshWalk()  pulls new code AND wipes. Deploy first. Asks twice.
 *   __mg.status()     one reading, no firing.
 *   __mg.stop = true  kill switch.
 *
 * !! reset() vs freshWalk(): BOTH wipe, and they cost wildly different amounts.
 * freshWalk() runs a full deploy first - clone, overlay, and a data sync that
 * has taken HOURS on this box - then restarts. reset() just arms the wipe and
 * restarts. If the build stamp already reads the commit you want, a deploy
 * fetches nothing and costs everything: use reset().
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
 *
 * ---------------------------------------------------------------------------
 * v3 - TWO FIXES, FOUND BY FIRING IT AT THE REAL BOX
 *
 * (1) THE CONFIRMATION IS NOW SENT. v2 asked the operator to type WIPE, got it,
 *     and POSTed with no body and no query string. /ctl/update requires
 *     confirm=WIPE and refused every attempt - correctly. The interlock worked;
 *     the client never participated in it. The word was typed and thrown away.
 *
 * (2) A STRUCTURED REFUSAL IS NO LONGER RETRIED. "Ignore the response, only
 *     activeEnter decides" is right for a dropped connection and WRONG for
 *     {"refused":true}, which is a deterministic verdict. v2 would have spent
 *     8 attempts x 5 min = 40 minutes re-sending a request that could never
 *     succeed, printing "not landed - re-arming" throughout. `busy` is the
 *     opposite case - transient - and still retries.
 *
 * ---------------------------------------------------------------------------
 * v4 - THE WAIT NOW ABORTS WHEN THE BOX RESTARTS ITSELF
 *
 * freshWalkWhenReady() waited on portOpen alone. But a deploy's LAST step is
 * restarting the brain, so the likeliest way that wait ends is the running
 * self-update.sh simply finishing: she restarts into the fresh walk that was
 * already armed, and starts serving. portOpen then goes true twice and the gun
 * would fire a SECOND fresh walk on top of the one already running, wiping it.
 *
 * activeEnter is what separates "still deploying" from "deploy landed", and it
 * was already the tool's only trusted signal everywhere else. Now the wait uses
 * it too: if it moves while waiting, stand down - nobody needs to press.
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

  /* !! `query` CARRIES THE CONFIRMATION TOKEN, AND IT IS NOT OPTIONAL DECORATION.
   * /ctl/update and /ctl/reset both refuse unless they receive confirm=WIPE.
   * v2 asked the operator to type WIPE, got it, and then POSTed with no body and
   * no query string - so the server refused every time, correctly, and the tool
   * reported "not landed" 8 times over 40 minutes. The word was typed and never
   * put on the wire.
   *
   * Sent on the QUERY STRING rather than as a JSON body on purpose: the handler
   * accepts either (brain-ctl.js reads body.confirm || ?confirm=), and a POST
   * with a JSON Content-Type is not a "simple request", so it drags in a CORS
   * preflight that a bare POST does not need.
   */
  function fire(verb, label, query) {
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
      log('firing ' + label + ' (POST /ctl/' + verb + (query || '') + '), one at a time.');
      return step(verb, label, query);
    });
  }

  /* A server verdict that is DETERMINISTIC. Returns a reason string, or null if
   * the response says nothing conclusive.
   *
   * !! THIS NARROWS step()'s "ignore the response" RULE, WHICH WAS TOO BROAD.
   * Ignoring the response is right for a dropped connection - a working press
   * and an unreachable server look identical from a browser, which is why only
   * activeEnter is trusted. It is WRONG for {"refused":true}: that is the server
   * stating an outcome that will not change on a retry, and re-sending it 8
   * times is 40 minutes of "not landed - re-arming" over a request that cannot
   * ever succeed.
   *
   * !! `busy` is deliberately NOT terminal. Another power action being in flight
   * is transient by definition, and retrying is exactly the right response.
   */
  function terminalRefusal(text) {
    var j = null;
    try { j = JSON.parse(text); } catch (e) { return null; }
    if (!j || j.refused !== true) return null;
    var why = String(j.message || 'the server refused this action.');
    if (j.needsConfirm) why += ' [needsConfirm=' + j.needsConfirm + ']';
    return why;
  }

  function step(verb, label, query) {
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
    log('attempt ' + G.attempts + '/' + MAX_ATTEMPTS + ' - POST /ctl/' + verb + (query || ''));
    return fetch(CTL + verb + (query || ''), { method: 'POST', cache: 'no-store' })
      .then(function (r) {
        return r.text().then(function (t) { return { s: r.status, t: t }; });
      })
      .catch(function (e) { return { s: 0, t: String((e && e.message) || e) }; })
      .then(function (res) {
        log('  -> http ' + res.s + ' ' + String(res.t).slice(0, 140));
        // A REFUSAL IS AN ANSWER. Stop, and say what the server said.
        var refused = terminalRefusal(res.t);
        if (refused) {
          G.verdict = 'REFUSED';
          log('SERVER REFUSED - not retrying. This will not change on a retry.', '#f88');
          log('  ' + refused, '#f88');
          return 'refused';
        }
        // Otherwise: a dropped connection is what a WORKING press looks like
        // from a browser - and also what an unreachable server looks like. So
        // the response is logged and then IGNORED. Only activeEnter decides.
        log('  watching activeEnter for ' + (WAIT_MS / 60000) + ' min...');
        return watch(Date.now() + WAIT_MS);
      })
      .then(function (ok) {
        if (ok === 'refused') { G.busy = false; return; }
        if (ok) { G.busy = false; return; }
        if (G.stop) { G.busy = false; return; }
        log('  not landed - re-arming.', '#fc0');
        return step(verb, label, query);
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
    // !! The typed word goes ON THE WIRE. v2 collected it and threw it away.
    // !! AND IT FETCHES THE WAVELET FIELDS. That is the point of the press and
    // it is NOT optional here. `self-update.sh` accepts UAL_FIELDS=0 as an
    // emergency hatch for a pull that has genuinely wedged, and this tool
    // deliberately offers NO convenience verb for it: skipping her precomputed
    // vision is a thing you do once, on purpose, knowing what it costs.
    return fire('update', 'FRESH WALK (WIPES ALL TRAINING)', '?confirm=WIPE');
  };

  /* !! RESET IS THE CHEAP FRESH WALK, AND IT IS USUALLY THE ONE YOU WANT.
   *
   * freshWalk() runs a DEPLOY and then wipes: clone, overlay, a data sync that
   * has taken hours on this box, and only then the restart. reset() writes
   * .force-fresh, deletes the resume marker and restarts. Same outcome for her -
   * every trained weight cleared, identity-core Tier 3 anchors preserved - in
   * about two minutes instead of a whole afternoon.
   *
   * The only reason to prefer freshWalk() is when the box needs NEW CODE. If
   * the build stamp already reads the commit you want, a deploy fetches nothing
   * and costs everything.
   */
  G.reset = function () {
    if (!window.confirm('RESET - WIPE ALL TRAINING and restart on the code'
      + ' already on the box?\n\n'
      + 'No deploy, no data sync. Every trained weight, episode and schema is\n'
      + 'destroyed. Identity anchors survive. Nothing she has LEARNED does.\n\n'
      + 'There is no way back.')) { log('cancelled.', '#fc0'); return; }
    var t = window.prompt('Type  WIPE  to confirm the reset:');
    if (String(t || '').trim().toUpperCase() !== 'WIPE') {
      log('cancelled at the second confirmation.', '#fc0'); return;
    }
    return fire('reset', 'RESET (WIPES ALL TRAINING, no deploy)', '?confirm=WIPE');
  };

  /* ---------------------------------------------------------------------------
   * WAIT-THEN-FIRE. Take the confirmation NOW, fire LATER, when it is safe.
   *
   * The problem this solves: on 2026-09-04 the brain was pinned for hours by a
   * running self-update.sh, and firing a press into that spawns a SECOND deploy
   * doing a --delete rsync into the same directory at the same time. That is the
   * one action of the night that could corrupt the install rather than merely
   * fail. So the operator had to sit and poll by hand, waiting for a window.
   *
   * !! THE SAFE-TO-FIRE SIGNAL IS portOpen COMING BACK AND STAYING BACK. The
   * brain is pinned because the deploy is saturating the disk it shares; when
   * the deploy ends - completes, fails, or dies - the contention stops and the
   * brain starts answering again. So portOpen=true is a proxy for "no deploy is
   * running", which is exactly the precondition.
   *
   * !! IT REQUIRES THE SIGNAL TWICE, CONSECUTIVELY. That night the brain flapped:
   * brief serving windows inside long pinned stretches. A single portOpen=true
   * could be one of those windows rather than a real recovery, and firing into
   * it would put us straight back into the overlapping-deploy case.
   *
   * !! AND IT ABORTS IF THE BOX RESTARTS ON ITS OWN, WHICH IS THE LIKELIEST WAY
   * THIS WAIT ENDS. A deploy's LAST step is restarting the brain. So the most
   * probable future is: the running self-update.sh simply finishes, restarts her
   * into the fresh walk that was already armed, and she starts serving.
   * portOpen then goes true twice - and a gun watching only portOpen would fire
   * a SECOND fresh walk on top of the one already running, wiping it.
   *
   * The signal that separates "the deploy is still going" from "the deploy
   * landed" is the same one the rest of this tool is built on: activeEnter. If
   * it moves while we are waiting, nobody needs to press anything. Waiting on
   * portOpen alone cannot tell those two worlds apart.
   */
  G.armWhenReady = function (verb, label, query) {
    var CONSEC = 2;          // consecutive good readings required
    var GAP_MS = 300000;     // 5 min apart - a flap is far shorter than this
    var MAX_WAIT_MS = 21600000; // 6 h, then stop rather than wait forever
    var seen = 0;
    var armEnter = null;     // set on the first readable poll, then watched
    var until = Date.now() + MAX_WAIT_MS;
    G.stop = false;
    log('WAITING for the box to be safe to press, then firing ' + label + '.');
    log('  needs portOpen=true on ' + CONSEC + ' consecutive checks '
      + (GAP_MS / 60000) + ' min apart.');
    log('  ABORTS if activeEnter moves - that means the deploy landed and');
    log('  restarted her by itself, so there is nothing left to press.');
    log('  kill switch: __mg.stop = true');
    function tick() {
      if (G.stop) { log('wait cancelled.', '#fc0'); return; }
      if (Date.now() > until) {
        log('GAVE UP WAITING after ' + (MAX_WAIT_MS / 3600000) + ' h - never saw a', '#f88');
        log('sustained window. Nothing was fired. Check __mg.status().', '#f88');
        return;
      }
      getStatus().then(function (j) {
        var e = j && !j.__auth && j.unit && j.unit.activeEnter;
        if (e && armEnter === null) {
          armEnter = e;
          log('  watching activeEnter = ' + armEnter);
        }
        // THE ABORT. Checked BEFORE the ready counter, because a box that has
        // just restarted is also a box that is about to report portOpen=true.
        if (e && armEnter !== null && e !== armEnter) {
          G.verdict = 'SELF-LANDED';
          log('THE BOX RESTARTED ON ITS OWN - standing down, nothing fired.', '#6f6');
          log('  ' + armEnter + '  ->  ' + e, '#6f6');
          log('  The deploy finished and restarted her as its last step. If a', '#6f6');
          log('  fresh walk was already armed, it is running now. Pressing', '#6f6');
          log('  would wipe the walk that just started.', '#6f6');
          log('  Check __mg.status(), then watch her come up.', '#6f6');
          return;
        }
        if (j && !j.__auth && j.portOpen === true) {
          seen++;
          log('  ready ' + seen + '/' + CONSEC + ' (portOpen=true, phase=' + j.phase + ')');
          if (seen >= CONSEC) {
            log('BOX IS READY - firing ' + label + ' now.', '#6f6');
            fire(verb, label, query);
            return;
          }
        } else {
          if (seen > 0) log('  ...lost it (that was a flap, not a recovery) - counter reset.', '#fc0');
          seen = 0;
        }
        setTimeout(tick, GAP_MS);
      });
    }
    tick();
  };

  G.freshWalkWhenReady = function () {
    // Same two confirmations as the immediate version, taken UP FRONT - consent
    // is given now even though the press happens later.
    if (!window.confirm('FRESH WALK when the box frees up - pull new code and WIPE ALL TRAINING?\n\n'
      + 'Nothing fires now. It waits until no deploy is running, then presses.\n\n'
      + 'Every trained weight, episode and schema is destroyed.\n'
      + 'There is no way back.')) { log('cancelled.', '#fc0'); return; }
    var t = window.prompt('Type  WIPE  to arm the delayed fresh walk:');
    if (String(t || '').trim().toUpperCase() !== 'WIPE') {
      log('cancelled at the second confirmation.', '#fc0'); return;
    }
    return G.armWhenReady('update', 'FRESH WALK (WIPES ALL TRAINING)', '?confirm=WIPE');
  };

  log('ARMED - nothing has been fired.');
  log('  __mg.reset()       <- WIPES ALL TRAINING, no deploy, ~2 min');
  log('  __mg.freshWalkWhenReady()  WAITS for the box, then deploy+wipe');
  log('  __mg.freshWalk()   fire NOW, new code, WIPES ALL TRAINING');
  log('  __mg.savestart()   new code, keeps weights');
  log('  __mg.restart()     keeps weights');
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
