---
name: no-fallbacks-code-it-right-the-first-time
description: "Fallback code paths (capability-degradation if-X-else-Y patterns) VIOLATE the \"we code it right the first time\" rule. The architecture should always work correctly. If feature A is unavailable, we don't silently degrade to feature B — we fix feature A. Defensive try/catch around external boundaries (network, disk) is fine; capability fallbacks are NOT."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: b128daab-9e1a-4697-8867-1ab55f337e9d
---

⛔ **NO FALLBACKS IN THE CODE.** ⛔

Operator 2026-06-17: *"fallbacks violate the rule we code it right the first time"*.

**What counts as a forbidden fallback:**

- ❌ `if (gpu) use GPU else fallback to CPU` — we either commit to GPU or commit to CPU, not both
- ❌ `if (composeSentence) emit else fallback to letter-chain` — we have ONE emission path that works
- ❌ Triple-redundant fallback chains (composeSentence → Tier 5 → letter-chain) — single source of truth
- ❌ "Probe method unavailable → legacy unconditional advance" — fix the probe wiring instead
- ❌ "If kScales unavailable, no-op" — ensure kScales are always available
- ❌ "GW broadcast strength missing → fall back to flat 1.10" — strength field is always set OR boost is computed differently
- ❌ Silent type fallbacks (`opts.x ?? hardcodedDefault`) when the default value is load-bearing
- ❌ Backup canned responses (`if response empty, send "*tilts head*"`) — fix the empty-response cause

**What is NOT a fallback (still allowed):**

- ✅ try/catch around external I/O (network, disk, child processes) with proper error propagation
- ✅ Null/undefined guards at entry points (`if (!input) return early`) — preconditions, not fallbacks
- ✅ Option defaults for OPTIONAL parameters (`opts.maxWords ?? 12`) when the default is semantically correct
- ✅ Graceful shutdown paths (cleanup on SIGTERM)
- ✅ Multi-platform code that targets each platform CORRECTLY (not "Windows works partially, Mac works partially")
- ✅ Multiple equally-correct paths chosen by config (not by availability)

**The principle:** code should be DESIGNED to work correctly, not RETROFITTED with degradation paths when something doesn't work. If a code path is broken, we FIX the path. We don't add a fallback to mask it.

**Pre-commit self-check protocol:**
```
grep -nE "fallback|fall through|legacy.*fallback|if.*not.*available|degrade.*to" <files>
```
Each hit is reviewed: is this defensive boundary handling (OK) or capability degradation (FIX or REMOVE)?

**Violation history:**
- 2026-06-17: Operator stated this rule explicitly during Phase 2 review. My Phase 1 + Phase 2 code introduced multiple fallbacks (composeSentence → Tier 5 → letter-chain triple-redundancy, probe-rate-gate legacy fallback, GW broadcast strength fallback, hasStepAwait/hasStep dual-path, _teachConcreteSentences existence guard). All flagged for cleanup in NewTodo.md as a project-wide audit task.

**Related rules:**
- "NO TESTS — EVER. Code it right the first time." (CLAUDE.md / CONSTRAINTS.md) — same principle, applied to QA
- [[feedback_do_the_work]] — when Gee says fix it, FIX IT (don't add fallback paths "for safety")
