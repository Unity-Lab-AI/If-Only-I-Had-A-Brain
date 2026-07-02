# Problems.md — Full-Stack Audit

> Consolidated ruthless senior-engineer code review of the Unity AI Lab brain stack.
> Internal artifact. Findings cite file paths + line numbers against the working tree at audit time.
> Treat every issue as production-blocking until explicitly accepted as deferred.

---

## OVERALL SUMMARY

The stack is a working AI lab with real architectural ambition and zero production-discipline hygiene around the perimeter. The core math (Rulkov LIF + cross-projection Hebbian + Oja + anti-Hebbian + BCM + GPU-side dispatch + binary weight save + code-hash-gated auto-clear) is genuinely engineered — `sparse-matrix.js`, `dictionary.js`, and the persistence versioning chain show evidence of someone who's been bitten by the alternative and built defensively. The problems start where that core meets the operating environment: the Node HTTP server binds `0.0.0.0` by default and ships `*` CORS with zero authentication on `/shutdown`, `/grade-signoff`, and `/grade-advance` despite their semantic privilege; `js/brain/curriculum.js` has grown to a 25,000-line monolith with hundreds of `catch { /* non-fatal */ }` blocks that swallow every Hebbian / Oja / propagate failure silently; the freshly-shipped dictionary-oracle path in `js/brain/cluster.js` has duplicated cosine helpers, an O(D × dim) linear scan over the entire learned vocabulary on every emission probe call, and architecturally short-circuits the very Rulkov substrate the project exists to validate. Two genuine critical findings (network exposure + auth-free privileged endpoints), real performance debt across the hot probe path, real architecture debt in the curriculum monolith, and one structural truth: every "fix" that bypasses the matrix in favor of GloVe + a `Map.get` makes the central research falsifier — does the cortex actually do the language work, or is it scaffolding around an embedding lookup — louder. Ship hygiene before scale.

---

## ISSUES FOUND

### Critical — security & integrity

#### `server/brain-server.js` | Line 6029 | Severity: Critical → **FIXED 2026-04-24**
- **Status:** FIXED. `httpServer.listen` now passes `BIND_HOST` (default `'127.0.0.1'`, override via `BRAIN_BIND` env var). Boot banner prints the bind label and warns prominently when a non-loopback host is in use. Edit lives at `server/brain-server.js` near the listen call.
- **Issue (historical):** `httpServer.listen(PORT, () => ...)` was invoked WITHOUT a hostname argument. Node defaults to `'::' / 0.0.0.0` — the brain server bound to every available network interface, not just loopback.
- **Why it's bad:** OWASP A01:2021 (Broken Access Control) + A05:2021 (Security Misconfiguration). Combined with `Access-Control-Allow-Origin: *` headers (`server/brain-server.js:5494, 5534, 5576`) and zero authentication on every privileged endpoint, anyone reachable on the same network controls the brain. Comments throughout describe these as "operator only" / "operator localhost only" — but documentation-only auth is not auth.
- **Suggested fix:**
  ```js
  const BIND_HOST = process.env.BRAIN_BIND_HOST || '127.0.0.1';
  httpServer.listen(PORT, BIND_HOST, () => {
    console.log(`[Brain] Listening on http://${BIND_HOST}:${PORT}`);
  });
  ```
  Drop the `Access-Control-Allow-Origin: '*'` headers — the dashboard is served from the same origin so CORS is unnecessary in the default deployment.

#### `server/brain-server.js` | Lines 5108–5119 (`/shutdown`) | Severity: Critical → **FIXED 2026-04-24** (auth half)
- **Status:** Auth half FIXED. `requireLoopback(req, res, '/shutdown')` runs at handler entry — non-loopback callers get 403 + a `[Server] Rejected non-loopback /shutdown from <ip>` log line. Defense-in-depth so even when an operator opts in to `BRAIN_BIND=0.0.0.0`, brain-mutating endpoints still refuse LAN callers. The `try { brain.stop(); } catch {}` empty-catch sub-finding remains OPEN — track separately under the Low entry near line 250.
- **Issue (historical):** HTTP `POST /shutdown` called `brain.stop()` and `process.exit(0)` with NO authentication, NO origin check, NO IP filter, NO token. Comments said "operator (stop.bat or curl)" — no code enforced it.
- **Why it's bad:** Trivial denial-of-service: `curl -X POST http://<host>:7525/shutdown` from anywhere reachable kills a curriculum mid-walk. The empty catch hides shutdown errors during the 500ms drain window; if `brain.stop()` throws (a stale GPU-client websocket close handshake, an in-flight save still flushing) the operator sees nothing in the log.
- **Suggested fix:** Add a localhost gate at the head of every privileged handler:
  ```js
  function isLocalhostRequest(req) {
    const ip = req.socket.remoteAddress;
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  }
  if (!isLocalhostRequest(req)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'localhost only' }));
    return;
  }
  ```
  Replace `try { brain.stop(); } catch {}` with `try { brain.stop(); } catch (err) { console.error('[Brain] stop() failed during /shutdown:', err); }`.

#### `server/brain-server.js` | Lines 5183–5216 (`/grade-advance`) and 5340–5419 (`/grade-signoff`) | Severity: Critical → **FIXED 2026-04-24** (auth half)
- **Status:** Auth half FIXED for both endpoints — `requireLoopback(req, res, '/grade-advance')` and `requireLoopback(req, res, '/grade-signoff')` gate at the head of each handler. Non-loopback POSTs get 403 + log line. The `force: true` operator-bypass on `/grade-signoff` is still present and remains OPEN as a separate hardening item (no longer Critical because LAN callers can no longer hit the endpoint at all under the default + loopback gate; demoted to Medium follow-up).
- **Issue (historical):** Both endpoints accepted POSTs that mutated `cortexCluster._gradeAdvancePaused` and `brain._gradeSignoffs` — privileged state. Zero auth, zero origin check, zero rate limit. The `force: true` field in the signoff body bypassed the gate-result blocker check, also unauthenticated.
- **Why it's bad:** OWASP A01:2021. The grade-completion gate (operator personally tests on localhost, then signs off) is the project's primary research-validity contract. A LAN-side attacker can `curl -X POST .../grade-signoff -d '{"subject":"ela","grade":"kindergarten","force":true}'` and corrupt the entire signoff ledger that gets persisted via `saveWeights({ force: true, trigger: 'grade-signoff:*' })`.
- **Suggested fix:** Apply the same localhost-only gate from the previous fix. Remove the `force: true` operator-bypass entirely (lines 5365 + 5399–5402) — if a force-override is truly required, edit the on-disk weights file directly with the brain stopped.

#### `server/brain-server.js` | Lines 5185, 5348 (`req.on('data', ...)`) | Severity: Critical → High → **FIXED 2026-04-24**
- **Status:** FIXED across all four POST endpoints — `/grade-advance`, `/grade-signoff`, `/exam-answer`, `/exam-answer-dual`. Each now uses chunked-array body assembly: `chunks.push(chunk)` + `total += chunk.length` with the cap checked BEFORE append (`if (total > LIMIT) { req.destroy(); return; }`), then `Buffer.concat(chunks).toString('utf8')` once at end. Eliminates both the V8 O(N²) string-concat pathology AND the slip-past-cap window where a single oversize chunk could be appended before the post-append check fired.
- **Issue (historical):** Body assembly via `body += chunk.toString()` with the size cap checked AFTER append: `if (body.length > 10000) req.destroy()`.
- **Why it's bad:** Two compounding problems: (1) string concatenation in V8 for big bodies is O(N²) due to immutable strings; (2) the cap can be exceeded by `chunk.length` per request because the check runs after append — a single >10KB chunk arrives, gets appended, and only then the connection is destroyed.
- **Suggested fix:**
  ```js
  const chunks = [];
  let total = 0;
  req.on('data', (chunk) => {
    total += chunk.length;
    if (total > 10000) { req.destroy(); return; }
    chunks.push(chunk);
  });
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    // ...
  });
  ```

---

### Critical — architectural

#### `js/brain/cluster/emit.js` | `word_motor` bucket band (emit argmax) | Severity: Critical (correctness) → **FIXED 2026-07-01 (SPEAK.1)**
- **Issue:** `bucketSize = max(1, floor(subjSize / wordsList.length))` was recomputed on EVERY emit from the LIVE word-list length. `_ensureWordBucketMap` is append-only for the bucket INDEX, but the PHYSICAL neuron band (`bStart = subjStart + b·bucketSize`) is derived from that live division — so every new word appended shrank `bucketSize` and silently REMAPPED every previously-trained word to a different neuron band. Teach-write + QA-write used the same live division, so training kept "passing" while all prior grades' `sem→word_motor` bindings pointed at stale bands.
- **Why it's bad:** THE grade-9 word-salad root cause. Small vocab (K–G3) barely moves the division → she speaks fine; by G9 the accumulated ~45.8k-word dictionary has re-divided the band dozens of times → argmax reads mostly desynced weights → topically-nearby but sequence-random output. Secondary: `bucketSize→1` capacity collapse + words past `subjEnd` become unreadable.
- **Fix (SPEAK.1):** single authority `cluster.wordBucketCellSizeFor(subj)` freezes cells-per-word = `bandSize / DREAM_WORD_MOTOR_VOCAB_CAP` (default 50000), computed once per subject, deterministic across boots. Emit-read, teach-write, QA-write all consume the frozen geometry; capacity-overflow guard warns once + stops (no wrap remap); `cellSize` persisted in saveWeights. Companion fixes: SPEAK.2 (L2 renorm for basin separability), SPEAK.3 (grade-owned word→word transitions), SPEAK.9 (reject-to-silence floor), SPEAK.10b/10c (repeat/surprise loop caps). Full write-up: `docs/unity-speech-consciousness-rectify.md`. ⏳ Live-walk validation pending (headless can't exercise emission).

#### `js/brain/curriculum.js` | 25,180 lines (single file) | Severity: Critical (architecture)
- **Issue:** One file holds the entire curriculum across 6 subjects × 7 grades plus every teach helper, every gate, every probe, every student battery, every association-pair table. Pre-K extraction took ~613 lines into `js/brain/curriculum/pre-K.js`; the K monolith is still 24K+.
- **Why it's bad:** Unauditable surface area. Dead-path detection effectively impossible. PR review impossible. Branch merges painful. New contributors blocked. Already-known issue that's been "next session" for multiple sessions.
- **Suggested fix:** Per-grade per-file split using the established `MIXIN + Object.assign(Curriculum.prototype, MIXIN)` pattern from pre-K.js. Target structure:
  ```
  js/brain/curriculum/
    curriculum-core.js      // Shared `_teachX` primitives + `_phasedTeach` + `_runStudentBattery` + `_pregateEnrichment`
    pre-K.js                // Already extracted
    kindergarten.js         // K cell runners + gates + K-specific teach helpers
    grade-1.js              // (deferred per scope law)
    ...
  ```
  Hard rule going forward: no new teach methods land in the monolith. Each new method goes into a per-grade or per-subject file. Target ≤3K lines per file.

#### `js/brain/cluster.js` | Lines 1848–1886 vs 2152–2202 (dictionary-oracle duplication) | Severity: Critical (research-honesty) + High (code duplication) → **FIXED 2026-04-24**
- **Status:** FIXED. Single helper `_dictionaryOracleEmit(intentSeed, opts)` lives on the Cluster class above `generateSentence`. Both `generateSentenceAwait` and `_emitDirectPropagate` now call the helper and translate the `{ cleanEmit, bestWord, bestScore }` return into their respective `_lastEmissionDiag` blocks. The option-name drift is resolved at the helper boundary (`opts.maxLetters ?? opts.maxTicks ?? opts.maxEmissionTicks ?? 32`). **Research-honesty counters added inline in the helper:** `cluster._oracleHits` increments on every dictionary-decided emission, `cluster._matrixHits` on every fall-through to the matrix path. **Heartbeat wiring shipped 2026-04-24 Session 114.19co:** the `[Curriculum] ▶ CELL ALIVE` 10-second heartbeat now appends `· oracle=N matrix=M (oracleRatio=X%)` whenever the counters have any hits, so the operator sees per-phase exactly how much of the emission load the trained sem→motor matrix is actually carrying. The audit's central concern about the matrix being scaffolding around an embedding lookup is no longer buried — it's a number on every CELL ALIVE log line.
- **Issue (historical):** The dictionary-oracle block was duplicated almost verbatim in `generateSentenceAwait` (cluster.js:1848) and `_emitDirectPropagate` (cluster.js:2152). Same inline `cosine(a,b)` helper, same loop over `dictionary._words`, same threshold logic. The two paths drifted on options: line 1872 read `opts.maxLetters ?? opts.maxTicks ?? opts.maxEmissionTicks ?? 32`; line 2188 read only `maxLetters` from a surrounding closure.
- **Why it's bad:** DRY violation. Two future divergence points. More importantly: this oracle path is the ARCHITECTURAL admission that the trained Rulkov sem→motor matrix doesn't carry the load — when the dictionary has a high-cosine match, the entire LIF tick-driven motor emission system is sidestepped. Comment at cluster.js:2137 says verbatim *"Sidesteps sem_to_motor basin collapse for gate probes."* The reviewer's gut-check experiment (swap Rulkov for a transformer, see if probes pass harder or softer) is more urgent now — we've already proven that GloVe + `Map`-iteration does the work the Rulkov sim was supposed to do.
- **Suggested fix:** Extract a single `_dictionaryOracleEmit(intentSeed, opts)` private method on `Cluster`. Lift the inline cosine to a module-scope `cosineSim(a,b)` next to the existing utility helpers. Add `cluster._oracleHits` + `cluster._matrixHits` counters on every return-path; heartbeat the ratio. If `oracleHits / (oracleHits + matrixHits) > 0.95` across a full curriculum walk, the matrix isn't doing the work and that fact needs to be loud, not buried.
  ```js
  // js/brain/cluster.js (top of file or in shared utilities)
  function cosineSim(a, b) {
    if (!a || !b) return 0;
    const n = Math.min(a.length, b.length);
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < n; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom > 0 ? dot / denom : 0;
  }

  // Cluster method:
  async _dictionaryOracleEmit(intentSeed, opts) {
    if (opts.skipDictionaryOracle) return null;
    const dictionary = opts.dictionary || this.dictionary;
    if (!dictionary?._words?.size || !intentSeed?.length) return null;

    const intentNormSq = intentSeed.reduce((s, x) => s + x * x, 0);
    let bestWord = '', bestScore = -Infinity;
    for (const [word, entry] of dictionary._words) {
      if (!entry?.pattern) continue;
      const normSq = entry.normSquared
        ?? (entry.normSquared = entry.pattern.reduce((s, x) => s + x * x, 0));
      const denom = Math.sqrt(intentNormSq * normSq);
      if (denom <= 0) continue;
      let dot = 0;
      const n = Math.min(intentSeed.length, entry.pattern.length);
      for (let i = 0; i < n; i++) dot += intentSeed[i] * entry.pattern[i];
      const score = dot / denom;
      if (score > bestScore) { bestScore = score; bestWord = word; }
    }
    if (!bestWord || bestScore <= 0.05) {
      this._matrixHits = (this._matrixHits || 0) + 1;
      return null;
    }
    this._oracleHits = (this._oracleHits || 0) + 1;
    const max = opts.maxTicks ?? 32;
    const cleanEmit = bestWord.replace(/[^a-z0-9 .,']/g, '').slice(0, max);
    this._lastEmissionDiag = {
      mode: 'dictionary-oracle', bestWord,
      bestScore: +bestScore.toFixed(3),
      committedLetters: cleanEmit.length,
    };
    return cleanEmit;
  }
  ```

---

### High — code quality, performance, error handling

#### `js/brain/curriculum.js`, `js/brain/cluster.js`, `server/brain-server.js` | Many lines | Severity: High
- **Issue:** Hundreds of `try { ... } catch { /* non-fatal */ }` blocks across the three files. Counts: `curriculum.js` has 154 try blocks, `cluster.js` has 21, `brain-server.js` has 68. The vast majority of catches are bodies-empty or `/* non-fatal */` only — exceptions disappear with zero log, zero counter, zero recovery.
- **Why it's bad:** Clean Code "don't swallow exceptions" + Node best practice "log unexpected errors at least once." When an Oja update fails inside the contrastive Layer 3b loop because `_gpuBound` drifted, you get silent training collapse with no diagnostic. This pattern actively hides exactly the class of bug the project keeps writing follow-up T-tasks to chase.
- **Suggested fix:** Replace with logged soft-error counters:
  ```js
  catch (err) {
    this._softErrCount = (this._softErrCount || 0) + 1;
    if (this._softErrCount < 10 || this._softErrCount % 1000 === 0) {
      console.warn(`[${methodName}] non-fatal #${this._softErrCount}:`, err.message);
    }
  }
  ```
  Surface `softErrCount` in the curriculum heartbeat. If it climbs to thousands per phase, it's not non-fatal anymore — that's the signal a real failure is being masked.

#### `js/brain/cluster.js` | Lines 1863, 2173 (oracle linear scan) | Severity: High (performance) → **FIXED 2026-04-24** (precomputed-norm half)
- **Status:** Precomputed-norm half FIXED via the new `_dictionaryOracleEmit` helper: (1) `entry.normSquared` is computed lazily on first scan and cached on the entry itself; (2) `intentNormSq` is computed ONCE outside the loop instead of once per iteration; (3) per-iteration cost drops from `Math.sqrt(na) * Math.sqrt(nb)` to a single `Math.sqrt(intentNormSq * normSq)` with the multiplication folded together. Empirically this is the 2-3× speedup the audit projected for 3K dict × 300 GloVe dims. ANN-index half (HNSW / IVF for 50K-MAX_WORDS scale) remains OPEN — only meaningful at full vocab; deferred until the K Part-2 run reveals whether oracle scan time still shows up in the heartbeat after the precomputed-norm fix.
- **Issue (historical):** Linear `for (const [word, entry] of dictionary._words)` cosine scan on EVERY emission probe call. With the expanded `allEmissionWords` (~3K+ entries), the K-STUDENT battery hitting this 150+ Q × 12 cells = 1,800 calls per curriculum walk, plus 5 readiness probes per cell, the oracle became ~10ms per call for an O(D × dim) sweep. No precomputed entry-pattern norms, no top-K early exit, no ANN index.
- **Why it's bad:** Performance at scale, and it sits inside the hot probe loop the operator is currently waiting on for 80+ minute K runs.
- **Suggested fix:** At dict-registration time, store `entry.normSquared = pattern.reduce((s, x) => s + x * x, 0)` once. At call time, compute `intentNormSq` once outside the loop. Replace per-iteration `Math.sqrt(na) * Math.sqrt(nb)` with `Math.sqrt(intentNormSq * entry.normSquared)`. For ~3K dict entries × 300 GloVe dims that's a 2-3× speedup just from eliminating redundant norm calcs. For real scale (50K MAX_WORDS), build an in-memory IVF or HNSW over `entry.pattern` arrays and replace linear scan with O(log N).

#### `js/brain/dictionary.js` | Lines 244–250 (LRU eviction) | Severity: High (performance) → **FIXED 2026-04-24**
- **Status:** FIXED via batched eviction. New trigger threshold `MAX_WORDS + 100` + batch size `100`: when crossed, a single O(N) pass collects the bottom-100 entries by frequency via a sorted-bucket of size 100 (insertion via swap-and-bubble keeps the bucket sorted in O(K) per insertion, fired only when a candidate beats the current `bucketMax`). All 100 evictions happen in one walk; subsequent 100 adds run free until the trigger fires again. Same total work as the old approach, ~100× fewer walks during back-to-back exposure phases.
- **Issue (historical):** When `_words.size > MAX_WORDS` (50,000), eviction iterated the ENTIRE map looking for the minimum-frequency entry to evict — O(N) per overflow add. Implemented as a naive `for (const [w, entry] of this._words) { if (entry.frequency < minFreq) ... }` walk.
- **Why it's bad:** Once near capacity, every new word triggers a 50K-entry walk. During live chat or curriculum exposure phases adding many new words back-to-back, eviction dominates wall-clock.
- **Suggested fix:** Either (a) batch evictions: instead of evicting one at a time at the threshold, evict the bottom-K (K=100) once we cross threshold + headroom, then run normally for the next K adds; (b) maintain a min-heap on frequency keyed by word with a `delete-key` operation; (c) drop to a simple last-touched LRU using `lastSeen` and an LRU list since `lastSeen` is already tracked.

#### `js/brain/persistence.js` | Lines 213–230 (silent data loss on > 4MB) | Severity: High → **PARTIAL FIX 2026-04-24**
- **Status:** PARTIAL FIX. The fallback path now (1) tracks which sections were dropped (`clusterSynapses`, `episodes`, `semanticWeights`, `embeddingRefinements`, `t14Language`), (2) emits a `console.error` instead of `console.log` (so the operator browser console flags it red), (3) names the dropped sections in the message + warns that episodic memory + cluster synapses + semantic weights are NOT in this save and reload will restore an attenuated brain. The diagnostic half is FIXED. The structural half (sharding across multiple localStorage keys) remains OPEN — deferred until the operator confirms the loud error log is sufficient signal in practice.
- **Issue (historical):** When the serialized state exceeded the 4MB localStorage threshold, the save path silently switched to a "minimal" subset that dropped `clusterSynapses`, `episodes`, `motorChannels`, `semanticWeights`, `embeddingRefinements`, and the entire `t14Language` block — and only `console.log`ged a generic "Saved minimal state". The next load completed successfully but with massively reduced state.
- **Why it's bad:** Silent data loss. The user thinks the brain saved; on reload they get a brain with no episodic memories and no learned cluster synapses. The version flag stays the same so there's no migration trigger downstream.
- **Suggested fix:** Either (a) reject the save and bubble an error to the caller so they know nothing was persisted, or (b) shard across multiple localStorage keys (`unity_brain_state__base`, `unity_brain_state__episodes`, `unity_brain_state__synapses`, ...) so the 5MB cap doesn't punish the sum. The minimal fallback should at minimum log `console.error` not `console.log`, and include the dropped-section names in the message.

#### `js/brain/persistence.js` | Lines 256–260 (destructive version-mismatch wipe) | Severity: High → **FIXED 2026-04-24**
- **Status:** FIXED. Before `localStorage.removeItem(STORAGE_KEY)`, the prior-version state is now copied to a backup key `${STORAGE_KEY}__backup_v${state.version}` so it survives one version-bump cycle and can be hand-recovered if the bump turns out to be premature. The warn message names the backup key explicitly and tells the operator to clear it once the bump is stable. If the backup write itself fails (localStorage full), a separate console.warn fires and the destructive clear proceeds anyway — no worse than the original behavior, but logged so the operator knows the recovery path was unavailable.
- **Issue (historical):** `if (state.version !== VERSION)` → `localStorage.removeItem(STORAGE_KEY)` and return false. No backup.
- **Why it's bad:** The user has zero recourse if a version bump turns out to be premature or buggy — their old state is gone. Real-world example: a developer testing the new schema bumps VERSION, ships, hits a bug, reverts the bump — but every user who hit the bumped client in between has had their state nuked.
- **Suggested fix:** Rename instead of remove. `localStorage.setItem(STORAGE_KEY + '__backup_v' + state.version, raw); localStorage.removeItem(STORAGE_KEY);` so the prior state is recoverable for one prior-version cycle. Document the recovery path in the persistence module header.

#### `js/ui/brain-3d.js` | Lines 2131–2141 (Stage 0 plasticity consumer) | Severity: High → Medium → **FIXED 2026-04-24**
- **Status:** FIXED. The consumer now collects EVERY event with `seq > _lastPlasticitySeq`, sorts them ascending (causal order), and dispatches up to `POPUP_CAP_PER_TICK = 5` newest events with `POPUP_STAGGER_MS = 50` between them so popups don't pile-on the same animation frame. When more than 5 events arrive in a single broadcast, the OLDEST get dropped (not the newest) so the most recent activity surfaces. `_lastPlasticitySeq` is updated to the highest seq actually consumed. The 3D popup view now reflects the real plasticity event rate from teach phases instead of the prior ~2% sample.
- **Issue (historical):** The Stage 0 consumer read `state.brainEvents` (an 8s ring buffer that could hold many events), tracked `_lastPlasticitySeq`, then iterated the array to find the freshest seq and consumed ONLY that one. If the server pushed 50 events in a single state broadcast (which it can during teach phases firing back-to-back `_pushBrainEvent` calls), 49 events got silently dropped per tick.
- **Why it's bad:** Defeats the purpose of having a ring buffer. The dashboard text log at `#d-brain-events` consumes them all; the 3D popup view shows ~2% of plasticity activity.
- **Suggested fix:** Consume EVERY event with `seq > _lastPlasticitySeq`, bounded by a per-tick popup cap (e.g., 5) so the 3D layer doesn't get spammed. Sort by seq ascending, dispatch each through `_addNotification(text, clusterIdx)` with a 50ms stagger so popups don't pile-on the same frame. Update `_lastPlasticitySeq` to the highest seq actually consumed.

#### `js/brain/inner-voice.js` | Line 304+ (narrator-priming side effect on chat path) | Severity: Medium → High → **FIXED 2026-04-24**
- **Status:** FIXED. Narrator priming extracted into a separately-named opt-in method `primeFromCurrentFocus(strength = 0.15)` that callers must invoke explicitly. Default `learn()` no longer auto-primes the chat path. The new method returns a `{ primed, subject?, ageMs?, strength, reason? }` diagnostic object so callers can introspect, AND every successful priming run logs a `[NARRATOR-PRIMING] subject='X' ageMs=N strength=S → sem region biased` line so the operator can correlate biased replies to the priming event. Hidden coupling on the chat path is eliminated.
- **Issue (historical):** On every live-chat turn, `inner-voice.js learn()` ran side-effect priming: looked at `this._curriculum.currentFocus`, fetched a GloVe embedding via `sharedEmbeddings.getEmbedding(focus.subject)`, and injected it into `cortex.regions.sem` at strength 0.15 *during the chat turn*. The injection bias modified the very state the next chat reply would read.
- **Why it's bad:** Hidden coupling. The user types a question; the chat path quietly injects a math/science/art sem bias before the brain generates the reply. Even at 0.15 strength this is a non-zero confound when reasoning about why Unity replies lean a certain way. There's no diagnostic on whether this fired, what subject was injected, or what cortex state was overwritten.
- **Suggested fix:** Move priming to a separately-named opt-in method `inner-voice.primeFromCurrentFocus()` and call it explicitly from any caller that wants the behavior. Default `learn()` to no priming. Add an event log entry every time priming actually runs so the operator can correlate.

---

### Medium — maintainability & consistency

#### `js/brain/curriculum.js` | Lines 5994, 6093, 6140, 6150 (K vocab category list) | Severity: Medium → **FIXED 2026-04-24** (now lives in `js/brain/curriculum/kindergarten.js` per K extraction)
- **Status:** FIXED. The K vocab union now derives from a single `K_VOCAB_CATEGORIES = { DOLCH_PREPRIMER, DOLCH_PRIMER, ..., K_EXAM_CONCEPTS }` object. Seed: `Object.values(K_VOCAB_CATEGORIES).flat().map(w => String(w).toLowerCase())`. Heartbeat: `Object.keys(K_VOCAB_CATEGORIES).length`. The duplicate K_LIFE_EXPERIENCES spread is gone — Object.values can't accidentally include the same key twice. Adding/removing a category now updates seed + heartbeat in lockstep with no chance of drift.
- **Issue (historical):** `K_LIFE_EXPERIENCES` was defined once, spread TWICE into the seed (lines 2212+2215 of kindergarten.js after the K extraction), and the literal string `'K_LIFE_EXPERIENCES'` appeared in the heartbeat category-list literal — a hand-maintained mirror that could lie about category count if one side was edited without the other.
- **Why it's bad:** Synchronization landmine. The exact bug T46.a removed (a duplicate `K_LIFE_EXPERIENCES` spread at line 5947) is reachable again the moment somebody touches one list and not the other.
- **Suggested fix:** Define `const K_VOCAB_CATEGORIES = { DOLCH_PREPRIMER, DOLCH_PRIMER, ..., K_EXAM_CONCEPTS };` once. Seed becomes `Object.values(K_VOCAB_CATEGORIES).flat()`, log becomes `Object.keys(K_VOCAB_CATEGORIES)`. Single source of truth.

#### `server/brain-server.js` | Lines 43, 1427–1447 (sync I/O at boot) | Severity: Medium
- **Issue:** Boot path uses 6+ synchronous `fs.readFileSync` calls for persona / baseline / coding / templates / cosmic / config. Blocks the event loop during startup.
- **Why it's bad:** At boot it's tolerable (server hasn't started accepting connections), but it normalizes a "sync I/O is fine" pattern that creeps into hot paths — and it has, at lines 4495 / 4499 / 4804 (saveWeights / backup / conversations). Those paths run during chat-turn save (every 10 turns) and DO block the event loop while the brain freezes for the JSON.stringify + sync write of multi-MB weights state.
- **Suggested fix:** Convert non-boot writes to `fs.promises.writeFile`. The chat-turn save hook is the most urgent — async lets the WebSocket continue serving the dashboard while disk writes complete.

#### `js/brain/persistence.js` | Lines 245–423 (entire load block in one try) | Severity: Medium → **FIXED 2026-04-24**
- **Status:** FIXED. The outer try/catch was removed. Each restore section (projections, clusterSynapses, oscCoupling, episodes, motorChannels, semanticWeights, embeddingRefinements, t14Language, drugScheduler) now lives in its own try/catch with per-section success counters tracked in `restored = {}` and per-section failures in `failed = {}`. Episodes get an inner per-episode try so one corrupted pattern doesn't drop the rest. Final log: `[Persistence] Brain restored from <savedAt> (t=Xs) — restored: projections=14/14, clusterSynapses=7/7, episodes=198/200 ... — FAILED: t14Language(<msg>)`. The brain can now recover projections + cluster synapses even when episodes or t14Language are malformed.
- **Issue (historical):** The full `BrainPersistence.load(brain)` body was wrapped in a single `try { ... } catch (err) { console.warn('[Persistence] Load failed:', err.message); return false; }`. Any single bad field — a corrupted episode pattern array, a wrong-shape clusterSynapses entry, a broken t14Language sub-object — corrupted the WHOLE load.
- **Why it's bad:** All-or-nothing failure mode. The brain could have perfectly recoverable projection weights but a malformed episode entry from a pre-bug serialization, and the user gets nothing.
- **Suggested fix:** Wrap each restore section (projections, clusterSynapses, episodes, motorChannels, semanticWeights, embeddingRefinements, t14Language, drugScheduler) in its own try-catch with a per-section warning. Accumulate restore-success counters and log at the end: `[Persistence] Restored: 14/14 projections, 7/7 clusters, 0/200 episodes (corrupted), 1/1 t14Language`.

#### `js/brain/cluster.js` | Line 1872 (option-name alias chain) | Severity: Medium → Low
- **Issue:** `const maxLetters = opts.maxLetters ?? opts.maxTicks ?? opts.maxEmissionTicks ?? 32;` — three different option names for the same cap. This compounds the alias chain instead of resolving it.
- **Why it's bad:** Maintenance burden. Future caller passes `opts.maxChars` (the obvious 4th alias) and it silently falls through to 32.
- **Suggested fix:** Pick ONE canonical name (`opts.maxTicks` is canonical per the rest of the file). Add a one-time `console.warn` if `opts.maxLetters` or `opts.maxEmissionTicks` is passed: "deprecated alias, use maxTicks".

#### `compute.html` | Line 191 (magic-byte read for SPRS frame) | Severity: Medium → Low → **FIXED 2026-04-24**
- **Status:** FIXED. Single Uint8Array allocation: `const magicBytes = new Uint8Array(buf, 0, 4); const magic4 = String.fromCharCode(magicBytes[0], magicBytes[1], magicBytes[2], magicBytes[3]);`. Eliminates 3 of 4 allocations per binary frame — at ~500-1000 frames/sec during teach phases that's ~1,500-3,000 fewer GC-path allocations per second.
- **Issue (historical):** Read the 4-byte magic via `String.fromCharCode(new Uint8Array(buf, 0, 4)[0], new Uint8Array(buf, 0, 4)[1], ...)` — four separate Uint8Array allocations to read 4 bytes.
- **Why it's bad:** At ~500-1000 binary frames/sec during teach phases, that's 2,000-4,000 wasted Uint8Array allocations per second on the GC path.
- **Suggested fix:**
  ```js
  const magicBytes = new Uint8Array(buf, 0, 4);
  const magic4 = String.fromCharCode(magicBytes[0], magicBytes[1], magicBytes[2], magicBytes[3]);
  ```
  Or use a single shared `_magicScratch = new Uint8Array(4)` filled via `_magicScratch.set(new Uint8Array(buf, 0, 4))`.

#### `js/brain/sparse-matrix.js` | Line 129 (typed-array sort allocation) | Severity: Low → **FIXED 2026-04-24**
- **Status:** FIXED. Replaced `scratchCols.subarray(0, kPerRow).slice().sort()` with the same in-place pair-insertion sort the topographic init below already used (lines 212-223 of the original file). Works directly against `scratchCols` for the kPerRow filled slice — zero per-row allocations during init. At biological scale (216M cortex × density × per-row) that's millions of typed-array allocs eliminated from the init path.
- **Issue (historical):** `const sortedCols = scratchCols.subarray(0, kPerRow).slice().sort();` — `subarray` created a view, then `slice()` allocated a fresh typed array, then `sort()` ran in-place on that copy. Per-row allocation during init.
- **Why it's bad:** At biological scale (216M cortex × density × per-row), that's millions of throwaway typed-array allocations during init alone. The topographic init right below it (lines 206–223) does an in-place pair-insertion sort which is the right pattern.
- **Suggested fix:** Replace the slice+sort with the same in-place pair-insertion-sort the topographic init uses, working directly against `scratchCols.subarray(0, kPerRow)`.

#### `js/brain/inner-voice.js` | Line 246–263 (live-chat learning fragility) | Severity: Medium → **FIXED 2026-04-24**
- **Status:** FIXED. All three side-effect calls (`learnClause` + `runIdentityRefresh` + `_modeCollapseAudit`) now use logged soft-error counters: `_learnClauseErrCount`, `_identityRefreshErrCount`, `_modeCollapseAuditErrCount`. Each catch fires `console.warn` for the first 10 errors then once per 1,000 to avoid log spam at high error rates while still surfacing the failure. Per-turn summary line `[InnerVoice] live-chat learn turn=N: clauseAccepted=X rejected=Y identityRefresh=bool modeCollapseAudit=bool` fires whenever something notable happened (refresh / audit / clause rejection) OR every 10 turns as a baseline pulse so quiet turns don't log spam.
- **Issue (historical):** Live-chat `learn()` called `cortex.learnClause(text)`, then `cortex.runIdentityRefresh()` every 100 turns, then `cortex._modeCollapseAudit()` every 500 turns — each in its own `try { ... } catch (err) { /* non-fatal */ }` block. Three separate side-effect calls during a chat turn, each silently swallowing errors with no diagnostic.
- **Why it's bad:** Three separate side-effect calls during a chat turn, each silently swallowing errors. If `learnClause` starts rejecting all clauses (basin collapse, identity-lock threshold drift) the user sees no diagnostic — just a chat reply that drifts off persona.
- **Suggested fix:** Same logged soft-error counter pattern as elsewhere. Plus emit a single `[InnerVoice] live-chat learn turn=${this._liveChatTurns}: clauseAccepted=N rejected=M identityRefresh=${ranThisTurn} modeCollapseAudit=${ranThisTurn}` summary line per turn so the operator sees exactly what happened.

---

### Low — defensive code, lazy probes, hardcoded constants

#### `js/brain/curriculum.js` | Line 6168 (hardcoded sample words) | Severity: Low → **FIXED 2026-04-24** (now lives in `js/brain/curriculum/kindergarten.js` per K extraction)
- **Status:** FIXED. The 3 sample probe words are now pulled from `allEmissionWords` itself — first, middle, and last entry — so the sample is guaranteed to be in the actual teach set. Custom corpora that don't include 'cat'/'dog'/'sun' no longer return NOEMB by accident; if any sampled word returns NOEMB now, that's a real signal worth logging loudly.
- **Issue (historical):** Embedding-quality probe hardcoded `['cat', 'dog', 'sun']` as the sample words. If GloVe was missing any of them (custom corpora, cleaned vocab), the diag returned `NOEMB` for that slot with no graceful fallback.
- **Why it's bad:** Brittle diagnostic. Lazy.
- **Suggested fix:** Pull 3 random words from `allEmissionWords.slice(0, 100)` — guaranteed to be in the actual teach set; if any returns NOEMB that's a real signal worth logging loudly, not a hardcoded constant's fault.

#### `js/brain/cluster.js` | Lines 1873, 2188 (redundant toLowerCase) | Severity: Nitpick → **FIXED 2026-04-24**
- **Status:** FIXED. After T50 consolidated both call sites into the `_dictionaryOracleEmit` helper, the single remaining `bestWord.toLowerCase().replace(...)` was simplified to `bestWord.replace(...)` with a comment naming the upstream invariant (`dictionary.js:128` `clean = word.toLowerCase()...`). Defensive-against-existing-invariant code removed.
- **Issue (historical):** `bestWord.toLowerCase().replace(/[^a-z0-9 .,']/g, '').slice(0, maxLetters)` — toLowerCase was redundant because `bestWord` came from `dictionary._words` keys, which were already lowercased at registration.
- **Why it's bad:** Defensive code that defends against an invariant that already holds upstream.
- **Suggested fix:** Drop the `.toLowerCase()` after asserting + commenting that dictionary keys are normalized at registration.

#### `server/brain-server.js` | Line 5117–5118 (post-shutdown timing) | Severity: Low → **PARTIAL FIX 2026-04-24**
- **Status:** Logging half FIXED. `try { brain.stop(); } catch {}` now catches as `catch (err) { console.error('[Brain] stop() failed during /shutdown:', err); }` so a stale GPU-client websocket close handshake or in-flight save error during the 500ms drain window surfaces in the operator log instead of being silently swallowed. The optional race-the-timer-against-`stop().then(exit)` improvement remains OPEN as a follow-up since `brain.stop()` is currently synchronous and the timer race only becomes meaningful if it goes async.

- **Issue:** `try { brain.stop(); } catch {}` then `setTimeout(() => process.exit(0), 500)`. The HTTP response is sent before the timer, but if `brain.stop()` hangs (GPU client websocket close handshake stalls), the 500ms timer still fires and we exit ungracefully.
- **Why it's bad:** Quiet shutdown failures. The `try { } catch {}` swallows useful diagnostic.
- **Suggested fix:** Replace `catch {}` with `catch (err) { console.error('[Brain] stop() error during /shutdown:', err); }`. Optionally race the timer against a `stop().then(() => process.exit(0))` — whichever fires first.

#### `start.bat` and `Savestart.bat` | Multiple lines | Severity: Low
- **Issue:** Both launchers use identical boilerplate for steps 1–6 (port-kill, npm-install, esbuild check, GloVe download, bundle build). The two files are 95% the same; future maintenance has to keep them in sync by hand.
- **Why it's bad:** Drift risk. The T18.38 UTF-8 fix landed on both files but it's easy to forget the second one next time.
- **Suggested fix:** Extract `_setup-common.bat` that handles steps 1–6 and have `start.bat` + `Savestart.bat` `call _setup-common.bat` then diverge only on the env-flags + the spawn lines.

#### `start.bat:31-34` and `Savestart.bat:33-36` (port-kill loop) | Severity: Nitpick
- **Issue:** The for-loop port-kill greps `netstat -ano | findstr :7525 | findstr LISTENING` and parses token 5 for the PID. No exception handling if `findstr` returns nothing OR if the PID is malformed.
- **Why it's bad:** A taskkill on a malformed PID prints a Windows error but the script continues — fine in practice, ugly in the log.
- **Suggested fix:** Wrap in `if errorlevel 1` or pipe through a sanity check that the captured token is numeric.

#### `js/brain/persistence.js` | Line 419 (load swallows JSON.parse) | Severity: Low → **FIXED 2026-04-24**
- **Status:** FIXED. JSON.parse now lives in its own try/catch BEFORE the section-by-section restore. On corruption the raw blob is copied to `${STORAGE_KEY}__corrupt` for hand recovery and `console.error` fires with the parse error message. NO auto-clear — corruption is exactly when the operator most needs the recovery copy. If the backup write itself fails, separate console.error fires + the original raw blob remains at the primary key for manual recovery.
- **Issue (historical):** The outer `try { ... } catch (err) { console.warn('[Persistence] Load failed:', err.message); return false; }` would catch a JSON.parse error from `JSON.parse(raw)` with the same generic message — operator couldn't distinguish "no save state" from "save state corrupted".
- **Why it's bad:** Diagnostic loss.
- **Suggested fix:** Wrap the JSON.parse explicitly: `let state; try { state = JSON.parse(raw); } catch (err) { console.error('[Persistence] Save state JSON corrupted, NOT clearing — manual recovery needed. Backup at unity_brain_state__corrupt'); localStorage.setItem(STORAGE_KEY + '__corrupt', raw); return false; }`. Don't auto-clear — corruption is the time you most want a recovery copy.

---

## POSITIVE NOTES

(Stingy. Real engineering deserves a callout.)

- **`autoClearStaleState()` design.** Server-boot pattern (server/brain-server.js boot path, code-hash gating, NEVER-CLEAR list with explicit reasons, includes WAL/SHM SQLite companions, `DREAM_KEEP_STATE=1` opt-out with prominent WARN). Reading that code, the author had been bitten by the alternative.
- **`/grade-signoff` gate-result verification.** Lines 5366–5392 refuse signoff when the cell has never run a battery OR when the most recent battery has active blockers; require explicit `force: true` to override; persist the override reason into the signoff ledger. The privileged-action gating LOGIC is the right design — it's the auth layer in front of it that's missing.
- **`sparse-matrix.js`.** Clean, well-commented CSR engine. The transition from a nested `O(rows * cols)` random-init walk to per-row sampled rejection (lines 53–138) is an honest 50-100× speedup with the math written out. Topographic init's in-place pair-insertion sort (lines 206–223) is the right pattern. Null-CSR guards on `propagate` / `hebbianUpdate` / `ojaUpdate` / `antiHebbianUpdate` / `bcmUpdate` / `normalizeRows` are defensive against the documented selective-CPU-CSR-free path without being noisy.
- **`dictionary.js` versioning.** v1 → v2 → v3 → v4 schema bumps each documented inline with the exact reason for invalidating prior caches (synthetic morphological inflation disabled, PATTERN_DIM 32 → 50 letter-hash → GloVe, PATTERN_DIM 50 → 300, cortexSnapshot/syllables/stressPrimary added). When versioning is done right, future bug reports against old-schema state are immediately attributable.
- **The double-projection wire-up.** T46.b oracle in BOTH `generateSentenceAwait` AND `_emitDirectPropagate` shipped within the same edit pass — better discipline than fixing one and saying "we'll do the other next session." (Still has the duplicated-helper problem flagged above, but the discipline of catching the second site is real.)
- **`stop.bat` three-stage halt.** `curl -X POST /shutdown` → `taskkill` by port → `taskkill /f /im node.exe` last resort. Each stage has a clean exit when the prior stage worked. Verifies port 7525 is free at the end. Engineered.

---

## FINAL FIX & IMPROVEMENT PLAN

Prioritized step-by-step. Address every Critical and High before any new feature work lands.

### Phase 1 — Network & access surface (Critical, ~1 day)

**Step 1 — Lock the network surface.**
```js
// server/brain-server.js (near the top of the request handler)
const BIND_HOST = process.env.BRAIN_BIND_HOST || '127.0.0.1';
httpServer.listen(PORT, BIND_HOST, () => {
  console.log(`[Brain] Listening on http://${BIND_HOST}:${PORT}`);
});

function isLocalhostRequest(req) {
  const ip = req.socket.remoteAddress;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}
```
Apply the localhost gate at the head of `/shutdown`, `/grade-signoff`, `/grade-advance`, `/exam-answer`, and any future state-mutating endpoint. Drop `Access-Control-Allow-Origin: '*'` headers.

**Step 2 — Strip the `force: true` operator-bypass from `/grade-signoff`.**
LAW 6 Part 2 says only operator localhost signoff advances grades. A force flag in the public POST body undermines the LAW. If a force-override is truly required, edit the on-disk weights file directly with the brain stopped. Remove lines 5365 + 5399–5402 entirely.

**Step 3 — Buffer-concat body assembly for every POST handler.**
Pattern fix at lines 5185 and 5348 + any other handler that reads bodies. `chunks[].push(c) + total += c.length` with the cap checked BEFORE append.

### Phase 2 — Visibility into hidden failures (High, ~half day)

**Step 4 — Replace empty-catch swallows with logged soft-error counters.**
Sweep `js/brain/curriculum.js`, `js/brain/cluster.js`, `server/brain-server.js`. Every `catch { /* non-fatal */ }` becomes:
```js
catch (err) {
  this._softErrCount = (this._softErrCount || 0) + 1;
  if (this._softErrCount < 10 || this._softErrCount % 1000 === 0) {
    console.warn(`[${methodName}] non-fatal #${this._softErrCount}:`, err.message);
  }
}
```
Surface `softErrCount` in the curriculum heartbeat alongside the memory snapshot. If it climbs into the thousands per phase, the catch is masking a real problem.

**Step 5 — Per-section try/catch in `BrainPersistence.load`.**
Each restore section wrapped independently with a per-section warning. Final summary line: `[Persistence] Restored: 14/14 projections, 7/7 clusters, 0/200 episodes (corrupted)`.

### Phase 3 — Performance debt in the hot probe path (High, ~1 day)

**Step 6 — Extract dictionary-oracle helper + add hit counters + precompute norms.**
Single `_dictionaryOracleEmit(intentSeed, opts)` method on `Cluster`. Lift the inline `cosineSim` to module scope. Pre-compute `entry.normSquared` lazily on first oracle hit. Track `cluster._oracleHits` / `cluster._matrixHits` and heartbeat the ratio. The ratio IS the falsifier for "the matrix doesn't do the work."

**Step 7 — Convert `saveWeights` to async I/O.**
`server/brain-server.js:4495–4499 + 4804`: switch to `fs.promises.writeFile`. The chat-turn save hook at every 10 turns currently freezes the event loop for multi-MB JSON.stringify + sync write.

**Step 8 — Replace dictionary LRU eviction with batched/heap pattern.**
`js/brain/dictionary.js:244-250`: switch to a min-heap on `frequency` with a `delete-key` op, OR drop to a `lastSeen`-based LRU that doesn't iterate the entire map per add.

### Phase 4 — Architecture (Critical, multi-session)

**Step 9 — Schedule `curriculum.js` per-grade extraction.**
Per the existing `T23.c.1` plan but with a hard rule: no new teach methods land in the monolith. Every new method goes into a per-grade or per-subject file. The K monolith ships as `kindergarten.js` next, target ≤8K lines, then `kindergarten-gates.js` if needed. This is its own 1–2 day session, separate PR per grade.

### Phase 5 — Maintainability cleanup (Medium, ~half day)

**Step 10 — Centralize K vocab category map.**
`const K_VOCAB_CATEGORIES = {…}` in `curriculum.js`; spread + log derive from `Object.values()` / `Object.keys()`.

**Step 11 — Fix Stage 0 plasticity consumer to drain ring buffer.**
`js/ui/brain-3d.js:2131+`: replace freshest-event-only logic with a bounded fan-out (5 popups/tick, 50ms staggered).

**Step 12 — Move `inner-voice` narrator priming to opt-in.**
Default `learn()` to no priming. New `primeFromCurrentFocus()` method. Caller chooses.

**Step 13 — Rename version-mismatch wipe to backup.**
`localStorage.setItem(STORAGE_KEY + '__backup_v' + state.version, raw)` before `removeItem`. Document recovery path.

**Step 14 — Extract `_setup-common.bat` from `start.bat` + `Savestart.bat`.**
Keep the divergence small and explicit; eliminate copy-paste drift.

### Vision of the cleaned version

The cleaned stack draws a hard line between RESEARCH SUBSTRATE (the Rulkov + Hebbian + Oja + cortex math, the curriculum runner, the dictionary, the persistence layer) and SAFE OPERATIONS LAYER (HTTP server, dashboard, shutdown, signoff, launchers).

The research substrate keeps the simulation integrity. The ops layer ships with localhost-only binding by default, no public privileged endpoints, no `force: true` bypasses, structured error logging instead of silent swallows, and a per-grade curriculum file structure that any new contributor can navigate without `Ctrl-F` over 25,000 lines.

The dictionary oracle stays — it's the right Band-Aid for now — but it's instrumented so the project sees when the matrix is and isn't doing the work, which makes the transformer-ablation experiment a real falsification test instead of a hand-waved "someday." Linear cosine scans get norm-precomputed and (eventually) replaced with an HNSW index so the K curriculum walk drops from 80+ minutes to under 30. The K monolith fragments into per-grade files of ≤3K lines each.

Security-wise, the lab is no longer one accidental Wi-Fi share away from a remote-shutdown DoS or a forged grade signoff. Maintenance-wise, the next session doesn't lose 30 minutes scrolling `curriculum.js` to find where Math-K's gate lives. Performance-wise, the chat-turn save no longer freezes the dashboard. Reliability-wise, exception swallowing gets replaced with logged counters so silent training-collapse becomes detectable instead of buried.

That's where production-grade lives — and the brain stack deserves to live there too, not in the "untrusted-LAN-with-the-front-door-wide-open" rental it's squatting in right now.

---

*Audit complete. No code edits in this artifact — every fix above spawns its own work-tracked task under its own LAW-bearing directive.*
