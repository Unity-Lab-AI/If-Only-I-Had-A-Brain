/* UNITY GATLING (FRESH WALK) v1 - paste into the dashboard tab console (F12).
 * Cancels every previous barrel, then fires one clean one.
 * ASCII only. Short lines. Nothing here can be broken by copy-wrap.
 * Kill switch:  window.__gat.stop = true
 * Restore fetch: window.fetch = window.__realFetch
 *
 * scripts/gatling-freshwalk.js and "scripts/Gattling Gun Freshwalk Forced.txt"
 * carry the SAME body on purpose - whichever copy gets pasted must be the
 * safe one. If you edit one, mirror the other.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS, AND HOW IT DIFFERS FROM THE SAVESTART GATLING
 *
 * The savestart gatling fires  POST /admin/update?keep=1  - overlay new code,
 * RESUME the saved weights. This one fires  POST /admin/update  with NO query,
 * which is the brain's FRESH WALK route: it writes .force-fresh and the next
 * boot WIPES every trained weight. Identity anchors survive. Nothing learned
 * does. There is no way back.
 *
 * !! WHY A GATLING AT ALL, RATHER THAN ONE POST. This route lives on the BRAIN,
 * and the brain is what stops answering when it is pinned - 504 after 504. A
 * single press has to be lucky. Six barrels at 250ms only need the brain awake
 * for one slot inside a brief serving window, which is the situation this whole
 * tool exists for.
 *
 * !! WHY THE BRAIN'S ROUTE AND NOT /ctl/update. The brain spawns the deploy
 * DETACHED with no timeout. The control plane runs it through
 * execFile(..., {timeout: 900000}) - a 15-minute guillotine. On 2026-09-04 a
 * deploy needing ~6 hours for a 114 GB field sync was killed at 15 minutes,
 * three hours before anyone realised it was already dead. For a long deploy the
 * brain's route is the only one that can finish.
 *
 * ---------------------------------------------------------------------------
 * !! "already updating/restarting" IS A HARD STOP HERE, AND THAT IS THE ONE
 * REAL BEHAVIOURAL DIFFERENCE FROM THE SAVESTART BODY.
 *
 * The savestart gatling counts that reply as a duplicate and keeps firing,
 * which is correct for it: re-arming a savestart that is already armed costs
 * nothing. For a FRESH WALK it is dangerous. The brain clears its own
 * _brainShutdownRequested flag once it is older than DREAM_UPDATE_STALE_MS
 * (5 min by default), so a gatling that keeps hammering through "already" will
 * PUNCH THROUGH five minutes later and arm a SECOND deploy - and two
 * self-update.sh runs doing `rsync -a --delete` into the same directory is the
 * one failure mode that corrupts an install rather than merely failing.
 *
 * So: "already" means a deploy is in flight. Stop, and say so.
 *
 * ---------------------------------------------------------------------------
 * !! IT SHARES window.__gatGen WITH THE SAVESTART GATLING ON PURPOSE. Pasting
 * either one cancels the other. Only one gatling generation may ever be live -
 * a savestart and a fresh walk racing each other is not a state anyone wants to
 * reason about at 3am.
 */
(function () {
  // -- THE TWO CONFIRMATIONS COME FIRST, BEFORE ANYTHING IS TOUCHED ---------
  // Cancelling here leaves the page exactly as it was: no barrels cancelled, no
  // fetch patched, no generation bumped. The second one asks for a typed word
  // rather than a yes/no, because a yes/no is too easy to click through.
  if (!window.confirm('FRESH WALK - pull latest code and WIPE ALL TRAINING?\n\n'
    + 'Every trained weight, episode and schema is destroyed.\n'
    + 'Identity anchors survive. Nothing she has LEARNED does.\n\n'
    + 'There is no way back.')) {
    console.log('%c[gatling-fresh] cancelled.', 'color:#fc0');
    return;
  }
  var _typed = window.prompt('Type  WIPE  to confirm the fresh walk:');
  if (String(_typed || '').trim().toUpperCase() !== 'WIPE') {
    console.log('%c[gatling-fresh] cancelled at the second confirmation.', 'color:#fc0');
    return;
  }

  try {
    if (window.__gat) {
      window.__gat.stop = true;
      window.__gat.fired = true;
    }
  } catch (e) {}

  // Kill ORPHANED barrels. Pasting a 2nd gatling replaced window.__gat,
  // so the 1st one's closures still hold the OLD object (stop:false) and
  // keep firing invisibly. They are unreachable by reference, so gate at
  // the transport instead: any /admin/update POST that does not carry the
  // CURRENT generation token gets a promise that never settles. Its
  // .finally never runs, so that loop stops rescheduling and parks.
  if (!window.__gatPatched) {
    window.__realFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var u = typeof input === 'string' ? input : (input && input.url) || '';
      var mine = init && init.__gatGen === window.__gatGen;
      if (u.indexOf('/admin/update') !== -1 && !mine) {
        return new Promise(function () {});
      }
      return window.__realFetch(input, init);
    };
    window.__gatPatched = true;
    // AUTO-RESTORE. The guard exists only to catch orphaned loops, and they
    // reschedule every 250ms, so any live orphan hits it within ~1s and its
    // promise never settles - it is dead for good. The PATCH itself is
    // needed for that first moment. Leaving it installed swallowed the
    // dashboard Update buttons (no token), so a real press sent nothing and
    // logged nothing. Restore after 5s: orphans stay dead, buttons work.
    setTimeout(function () {
      if (window.__realFetch) {
        window.fetch = window.__realFetch;
        window.__gatPatched = false;
        var m = '%c[gatling-fresh] fetch guard removed - buttons safe';
        console.log(m, 'color:#8cf');
      }
    }, 5000);
  }
  window.__gatGen = (window.__gatGen || 0) + 1;
  var GEN = window.__gatGen;

  var G = window.__gat = {
    gen: GEN, fired: false, stop: false, mode: 'fresh-walk',
    sent: 0, settled: 0, inflight: 0, s504: 0, s401: 0,
    dup: 0,
    baseline: null,      // {build, bootedAt} read off the live box at arm time
    spotterArmed: false  // false until the baseline lands; never guesses
  };
  var POOL = 6;
  // NO ?keep=1 - this is the fresh-walk route. That absence IS the wipe.
  var UPD = location.origin + '/admin/update';
  var PUB = location.origin + '/public-state.json?cb=';

  function log(m) {
    console.log('%c[gatling-fresh v1] ' + m, 'color:#f6f');
  }
  function win(how, data) {
    if (G.fired) return;
    G.fired = true;
    G.stop = true;
    var s = 'color:#0f0;font-size:18px';
    console.log('%cFRESH WALK ARMED (' + how + ')', s, data || '');
    log('the deploy runs detached: overlay -> .force-fresh -> restart.');
    log('she comes back with every trained weight cleared.');
    log('restore fetch: window.fetch = window.__realFetch');
  }
  function auth401() {
    G.s401++;
    if (G.s401 !== 3) return;
    G.stop = true;
    var s = 'color:#f80;font-size:15px';
    console.log('%cSTOPPED - HTTP 401, auth not primed.', s);
    log('open ' + location.origin + '/admin/milestone');
    log('enter the password, then re-run this script');
  }
  // A deploy is already in flight. STOP - see the header. Firing through this
  // arms a SECOND self-update.sh once the brain's 5-minute stale window lapses.
  function alreadyRunning(d) {
    if (G.fired) return;
    G.fired = true;
    G.stop = true;
    var s = 'color:#f80;font-size:15px';
    console.log('%cSTOPPED - A DEPLOY IS ALREADY RUNNING.', s, d || '');
    log('The brain answered "already updating/restarting". Nothing was armed.');
    log('Hammering through this would punch a SECOND deploy through the');
    log('5-minute stale window, and two self-update.sh runs doing');
    log('rsync --delete into /opt/unity-brain is what corrupts an install.');
    log('Wait for the running one to restart her, then re-run this.');
  }

  // Read the live box ONCE before the spotter is allowed to judge anything.
  // A restart is proven by a CHANGE against this snapshot - either a new
  // build short (main moved) or a new bootedAt. A hardcoded baseline could
  // only ever be stale, and a stale baseline is an instant false pass.
  function armBaseline() {
    return window.__realFetch(PUB + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var st = (j && j.state) || {};
        var bld = st.build || {};
        var b = bld.short || null;
        var boot = bld.bootedAt || null;
        if (!b && !boot) throw new Error('no build.short/build.bootedAt');
        G.baseline = { build: b, bootedAt: boot };
        G.spotterArmed = true;
        log('baseline read off the box - build ' + (b || '?') +
            ' - bootedAt ' + (boot || '?'));
      })
      .catch(function (e) {
        // NO SILENT CAPS. Say out loud that the spotter is blind, so a
        // missing green banner is not mistaken for a failed press.
        G.spotterArmed = false;
        log('BASELINE PROBE FAILED (' + (e && e.message) + ')');
        log('spotter DISARMED - the only verdict now is a barrel reading' +
            ' 200 + status "armed". A restart will NOT print a banner.');
      });
  }

  function shot() {
    if (G.stop || G.gen !== window.__gatGen) return;
    G.sent++;
    G.inflight++;
    var opts = { method: 'POST', cache: 'no-store', __gatGen: GEN };
    window.fetch(UPD, opts).then(function (r) {
      if (r.ok) {
        // A 2xx is NOT proof. The route returns 200 with
        // {status:"already updating/restarting"} when a deploy is in flight.
        // Only "armed" counts, and "already" is a hard stop here.
        return r.json().catch(function () { return {}; }).then(function (d) {
          var st = (d && d.status) || '';
          if (st.indexOf('armed') !== -1) return win('HTTP ' + r.status, d);
          if (st.indexOf('already') !== -1) {
            G.dup++;
            return alreadyRunning(d);
          }
          log('200 but not armed: ' + st);
        });
      }
      if (r.status === 401 || r.status === 403) return auth401();
      G.s504++;
      if (r.status !== 504) log('status ' + r.status);
    }).catch(function () {}).then(function () {
      G.inflight--;
      G.settled++;
      if (G.settled % 25 === 0) {
        log('sent ' + G.sent + ' | 504 ' + G.s504 + ' | 401 ' + G.s401 +
            ' | already ' + G.dup + ' | inflight ' + G.inflight);
      }
      setTimeout(shot, 250);
    });
  }

  // Spotter on the PUBLIC lane (no auth). Bypasses the guard on purpose.
  function spot() {
    if (G.stop || G.gen !== window.__gatGen) return;
    window.__realFetch(PUB + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var st = (j && j.state) || {};
        var bld = st.build || {};
        var b = bld.short || '?';
        var boot = bld.bootedAt || '?';
        var cu = st.curriculum || {};
        var ck = cu.currentCellKey || '?';
        log('SHE BREATHED - build ' + b + ' - cell ' + ck);
        if (!G.spotterArmed || !G.baseline) return;
        var base = G.baseline;
        if (base.build && b !== '?' && b !== base.build) {
          return win('new build ' + b + ' (was ' + base.build + ')');
        }
        if (base.bootedAt && boot !== '?' && boot !== base.bootedAt) {
          return win('restarted - bootedAt ' + boot);
        }
      })
      .catch(function () {})
      .then(function () { setTimeout(spot, 3000); });
  }

  // Barrels start immediately - the baseline is only the spotter's business,
  // and a POST landing is a verdict all on its own.
  for (var i = 0; i < POOL; i++) setTimeout(shot, i * 400);
  armBaseline().then(function () { spot(); });

  log('old barrels cancelled - generation ' + GEN + ' spinning');
  log('FRESH WALK - this wipes every trained weight when she restarts');
  log('stop with: window.__gat.stop = true');
})();
