#!/usr/bin/env python3
"""Measure the K_CONCRETE_SENTENCES corpus and price the sentence-structure
passes against the MEASURED per-pair-teach cost read off the live profiler.

Diagnostic only - reads source, writes nothing.
"""
import re
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

SRC = 'js/brain/curriculum.js'
src = open(SRC, encoding='utf-8', errors='replace').read()

m = re.search(r'K_CONCRETE_SENTENCES\s*=\s*\[', src)
if not m:
    print('K_CONCRETE_SENTENCES not found')
    raise SystemExit(1)

i = m.end()
depth = 1
j = i
while j < len(src) and depth > 0:
    ch = src[j]
    if ch == '[':
        depth += 1
    elif ch == ']':
        depth -= 1
    j += 1
body = src[i:j - 1]

# pull single- and double-quoted string literals separately (no nested class)
sq = re.findall(r"'([^'\n]*)'", body)
dq = re.findall(r'"([^"\n]*)"', body)
sents = [s for s in (sq + dq) if s.strip()]

pairs = sum(max(0, len(s.split()) - 1) for s in sents)

print('K_CONCRETE_SENTENCES sentences      = %s' % f'{len(sents):,}')
print('word->word transitions (pairs)      = %s' % f'{pairs:,}')
print()

# measured off the live teachProfile: hebbian 15ms + lateral 6ms + anti ~1ms
MS_PER_PAIR_TEACH = 22

for reps, label in ((100, '_teachConcreteSentences  reps=100'),
                    (60, '_teachGlueWordProduction reps=60'),
                    (80, 'slot/agreement/article    reps=80 (~110 pairs)')):
    n = pairs if reps != 80 else 110
    pt = n * reps
    hrs = pt * MS_PER_PAIR_TEACH / 1000 / 3600
    print('%-46s pair-teaches = %-12s -> %6.2f h' % (label, f'{pt:,}', hrs))

print()
print('MEASURED LIVE for comparison:')
print('  _teachConcreteSentences  53,564s = 14.88 h  (calls=1, FINISHED)')
print('  _teachQuestionProduction    928s =  0.26 h  (calls=1, FINISHED)')
print('  phase _teachSentenceStructure       21.2 h  and still running')

# --- duplicate-transition analysis -------------------------------------
# The code BUILDS a dedup map (`sentencePairs`) but uses it for TELEMETRY
# only, then trains the full non-deduped `pairs` array.
from collections import Counter
cnt = Counter()
for s in sents:
    w = [x for x in s.lower().split() if x]
    for k in range(len(w) - 1):
        cnt[(w[k], w[k + 1])] += 1
tot = sum(cnt.values())
uniq = len(cnt)
print()
print('--- DUPLICATE TRANSITION ANALYSIS ---')
print('total transitions trained = %s' % f'{tot:,}')
print('UNIQUE transitions        = %s' % f'{uniq:,}')
print('duplicate ratio           = %.2fx  (%.1f%% of the work is repeats)'
      % (tot / uniq, 100.0 * (tot - uniq) / tot))
print()
print('top-10 most repeated pairs:')
for (a, b), n in cnt.most_common(10):
    print('   %-24s x%d' % (a + ' -> ' + b, n))
print()
print('If duplicates were folded into rep-count instead of re-trained:')
print('  concrete pass 1,143,600 -> %s pair-teaches' % f'{uniq * 100:,}')
print('  i.e. %.2f h -> %.2f h at the measured 47ms/pair-teach'
      % (1143600 * 0.047 / 3600, uniq * 100 * 0.047 / 3600))
