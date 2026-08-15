# -*- coding: utf-8 -*-
p = 'server/brain-server/gpu.js'
L = open(p, 'r', encoding='utf-8', newline='').readlines()

# ---- TP.1/TP.3: group-aware pacing in _donorPatternLaneOpen ---------------
# anchor: the `_ap` teach-phase throttle block
i = [n for n, l in enumerate(L) if l.strip() == "const _ap = _cc2 && _cc2._activePhase;"][0]
assert "_ap.name.startsWith('_teach')" in L[i + 1], repr(L[i + 1])

GROUP_OPEN = '''    // ATOMIC PATTERN GROUPS (2026-08-15). A teach iteration is
    // clear -> write(s) -> hebbianBound, and the PS.1 stale guard rightly
    // refuses the Hebbian when any frame of that sequence is dropped. But the
    // pacing throttle below used to gate EVERY frame independently, so almost
    // every group lost at least one frame mid-flight and its Hebbian was
    // suppressed - measured live at ~33 suppressions/sec against 59 real
    // sheds. Honest, but a third of teaching was being refused by PACING, not
    // by saturation.
    //
    // The group is now the unit of admission: the FIRST frame of a group faces
    // the throttle (refuse whole, before any state ships); frames inside an
    // admitted group bypass pacing (the decision was already made); the group
    // closes at the hebbianBound dispatch (see gpuSparseHebbianBound) or after
    // a 500ms TTL so a hebbian-less path can never hold the lane open. The
    // donor stays protected by BOTH remaining mechanisms: the adaptive
    // back-off (computed from live bufferedAmount, it stretches the
    // inter-group interval the moment bytes pile up) and the 16MB lane cap
    // below, which still hard-stops a group mid-flight under true saturation
    // - staling that ONE group, the rare case instead of the common one.
    if (!this._patternGroup) this._patternGroup = { open: false, openedAt: 0 };
    const _pg = this._patternGroup;
    const _pgInside = _pg.open && (Date.now() - _pg.openedAt) < 500;
    const _ap = _cc2 && _cc2._activePhase;
    if (!_pgInside && _ap && typeof _ap.name === 'string' && _ap.name.startsWith('_teach')) {
'''
L[i:i + 2] = [GROUP_OPEN]
open(p, 'w', encoding='utf-8', newline='').write(''.join(L).replace('\r\n', '\n').replace('\n', '\r\n'))
print('group-open gate installed')

# ---- lane-cap branch: close the group on a mid-group shed -----------------
L = open(p, 'r', encoding='utf-8', newline='').readlines()
j = [n for n, l in enumerate(L) if l.strip() == 'this._patternLaneStale = true;'
     and 'PATTERN LANE IS NOW LOAD-BEARING' in ''.join(L[max(0, n - 30):n])][0]
L[j] = '''      this._patternLaneStale = true;
      // A mid-group cap overrun kills the WHOLE group - close it so the next
      // frame faces admission again instead of riding a dead group's bypass.
      if (this._patternGroup) this._patternGroup.open = false;
'''
open(p, 'w', encoding='utf-8', newline='').write(''.join(L).replace('\r\n', '\n').replace('\n', '\r\n'))
print('cap-shed closes the group')

# ---- admission: opening the group on a successful send --------------------
L = open(p, 'r', encoding='utf-8', newline='').readlines()
k = [n for n, l in enumerate(L) if l.strip() == 'this._wsPatternLastSendMs = Date.now();'][0]
L[k] = '''    this._wsPatternLastSendMs = Date.now();
    // A frame that actually went out while a group was not open OPENS one -
    // the admission decision was just made above, and the rest of this teach
    // iteration's frames ride it without re-facing the pacing gate.
    if (!this._patternGroup) this._patternGroup = { open: false, openedAt: 0 };
    if (!this._patternGroup.open) { this._patternGroup.open = true; this._patternGroup.openedAt = Date.now(); }
'''
open(p, 'w', encoding='utf-8', newline='').write(''.join(L).replace('\r\n', '\n').replace('\n', '\r\n'))
print('send opens the group')

# ---- TP.1 close: hebbianBound dispatch ends the group ---------------------
L = open(p, 'r', encoding='utf-8', newline='').readlines()
m = [n for n, l in enumerate(L) if l.strip() == 'if (this._patternLaneStale) {'][0]
assert 'return this._enqueueBoundHebbian(name, lr);' in L[m + 3], repr(L[m + 3])
L[m:m + 4] = ['''    // The Hebbian dispatch CLOSES the pattern group either way - the group's
    // purpose (deliver one teach iteration's pattern whole) is spent, and the
    // next iteration's first frame must face admission again.
    if (this._patternGroup) this._patternGroup.open = false;
    if (this._patternLaneStale) {
      this._hebbianSuppressedStale = (this._hebbianSuppressedStale || 0) + 1;
      return null;
    }
    return this._enqueueBoundHebbian(name, lr);
''']
open(p, 'w', encoding='utf-8', newline='').write(''.join(L).replace('\r\n', '\n').replace('\n', '\r\n'))
print('hebbian closes the group')
