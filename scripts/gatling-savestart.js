/* UNITY GATLING v4 - paste into the dashboard tab console (F12).
 * Cancels every previous barrel, then fires one clean one.
 * ASCII only. Short lines. Nothing here can be broken by copy-wrap.
 * Kill switch:  window.__gat.stop = true
 * Restore fetch: window.fetch = window.__realFetch
 */
(function () {
  var CUR = 'f3ac6ff';   // build on the box now; a win = anything else

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
  }
  window.__gatGen = (window.__gatGen || 0) + 1;
  var GEN = window.__gatGen;

  var G = window.__gat = {
    gen: GEN, fired: false, stop: false,
    sent: 0, settled: 0, inflight: 0, s504: 0, s401: 0
  };
  var POOL = 6;
  var UPD = location.origin + '/admin/update?keep=1';
  var PUB = location.origin + '/public-state.json?cb=';

  function log(m) {
    console.log('%c[gatling v4] ' + m, 'color:#ff0');
  }
  function win(how, data) {
    if (G.fired) return;
    G.fired = true;
    G.stop = true;
    var s = 'color:#0f0;font-size:18px';
    console.log('%cDEPLOY LANDED (' + how + ')', s, data || '');
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
  function shot() {
    if (G.stop || G.gen !== window.__gatGen) return;
    G.sent++;
    G.inflight++;
    var opts = { method: 'POST', cache: 'no-store', __gatGen: GEN };
    window.fetch(UPD, opts).then(function (r) {
      if (r.ok) {
        return r.json().catch(function () { return {}; })
          .then(function (d) { win('HTTP ' + r.status, d); });
      }
      if (r.status === 401 || r.status === 403) return auth401();
      G.s504++;
      if (r.status !== 504) log('status ' + r.status);
    }).catch(function () {}).then(function () {
      G.inflight--;
      G.settled++;
      if (G.settled % 25 === 0) {
        log('sent ' + G.sent + ' | 504 ' + G.s504 +
            ' | 401 ' + G.s401 + ' | inflight ' + G.inflight);
      }
      setTimeout(shot, 250);
    });
  }
  for (var i = 0; i < POOL; i++) setTimeout(shot, i * 400);

  // Spotter on the PUBLIC lane (no auth). Bypasses the guard on purpose.
  function spot() {
    if (G.stop || G.gen !== window.__gatGen) return;
    window.__realFetch(PUB + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var st = j && j.state ? j.state : {};
        var b = (st.build && st.build.short) || '?';
        var cu = st.curriculum || {};
        var ck = cu.currentCellKey || '?';
        log('SHE BREATHED - build ' + b + ' - cell ' + ck);
        if (String(b).indexOf(CUR) !== 0) win('new build ' + b);
      })
      .catch(function () {})
      .then(function () { setTimeout(spot, 3000); });
  }
  spot();

  log('old barrels cancelled - generation ' + GEN + ' spinning');
  log('stop with: window.__gat.stop = true');
})();
