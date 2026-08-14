# -*- coding: utf-8 -*-
p = 'js/brain/curriculum.js'
L = open(p, 'r', encoding='utf-8', newline='').readlines()

# ---- SL.1: per-subject persisted count -> declared phases only -----------
i = [n for n, l in enumerate(L) if 'persisted[sub] = (persisted[sub] | 0) + 1;' in l][0]
j = i
while not L[j].strip().startswith('// passedPhases also persists'):
    j -= 1
k = i
while 'phasesCompleted = Math.max(perSubject[sub].phasesCompleted | 0, persisted[sub]);' not in L[k]:
    k += 1
k += 2  # closing braces of the two for-loops
assert L[k].rstrip() == '    }', repr(L[k])

SL1 = '''    // passedPhases also persists, so use it to compute the authoritative
    // phasesCompleted for each subject - survives Savestart restarts where the
    // runtime counter would reset to zero.
    //
    // COUNT DECLARED PHASES ONLY (2026-08-14). `passedPhases` holds two KINDS
    // of entry. The auto-wrap writes `cellKey:_teachSomething` for a completed
    // cell phase; `_phasedTeach` writes `cellKey:TAG-NAME` (e.g.
    // `ELA-K-LETTER-NAMING-DIRECT`) for a work unit completed INSIDE such a
    // phase, as a mid-phase resume marker. Those tags are checkpoints, not
    // phases: the enclosing phase is banked again when it finishes, so counting
    // both double-counts. The cell-level count already filters by the runner's
    // declared name set; this applies the SAME rule here so the per-subject
    // column and the cell bar cannot report different numbers for the same run.
    if (cluster && Array.isArray(cluster.passedPhases)) {
      const persisted = {};
      for (const phaseKey of cluster.passedPhases) {
        const key = String(phaseKey);
        const colon = key.lastIndexOf(':');
        if (colon < 0) continue;
        const ck = key.slice(0, colon);
        const method = key.slice(colon + 1);
        const sub = ck.split('/')[0];
        if (!perSubject[sub]) continue;
        let declared;
        try { declared = this._declaredPhaseNames(ck); } catch { declared = null; }
        if (!declared || !declared.has(method)) continue;
        persisted[sub] = (persisted[sub] | 0) + 1;
      }
      for (const sub of Object.keys(persisted)) {
        // Take the larger of runtime counter OR persisted count. Runtime can
        // exceed persisted when a cell is mid-run (phases completed during this
        // session but not yet flushed by _saveCheckpoint).
        if (perSubject[sub]) {
          perSubject[sub].phasesCompleted = Math.max(perSubject[sub].phasesCompleted | 0, persisted[sub]);
        }
      }
    }
'''
L[j:k + 1] = [SL1]
open(p, 'w', encoding='utf-8', newline='').write(''.join(L).replace('\r\n', '\n').replace('\n', '\r\n'))
print('SL.1 applied')

# ---- SL.2: drop _phasedTeach's parallel counters -------------------------
L = open(p, 'r', encoding='utf-8', newline='').readlines()
a = [n for n, l in enumerate(L) if l.strip() == 'async _phasedTeach(methodName, fn) {'][0]
b = [n for n, l in enumerate(L) if n > a and 'this._currentCellPhasesCompleted = (this._currentCellPhasesCompleted | 0) + 1;' in l][0]
c = b
while 'if (this._currentSubject && this._perSubjectStats?.[this._currentSubject]) {' not in L[c]:
    c -= 1

SL2 = '''      // NO PARALLEL PHASE COUNTERS HERE (2026-08-14). This method used to bump
      // `_perSubjectStats[subject].phasesCompleted` and
      // `_currentCellPhasesCompleted` directly - a second ledger running
      // alongside the auto-wrap's, counting work units that live INSIDE a
      // declared phase as though they were phases themselves. The counts are
      // now derived in one place, from `passedPhases` filtered by the cell
      // runner's declared name set, so there is nothing here to keep in sync.
      //
      // The `passedPhases` write above STAYS: these tag entries are what let a
      // restart resume part-way through a long phase instead of re-running it
      // from the top. They are checkpoint markers, and they are excluded from
      // the phase counts by name.
'''
L[c:b + 1] = [SL2]
open(p, 'w', encoding='utf-8', newline='').write(''.join(L).replace('\r\n', '\n').replace('\n', '\r\n'))
print('SL.2 applied')
