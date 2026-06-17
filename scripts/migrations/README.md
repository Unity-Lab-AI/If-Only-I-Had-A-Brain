# scripts/migrations/ — one-shot refactor scripts (audit trail only)

Per audit task **D.3** — these scripts were originally written to `.git/`
during the P4 architectural refactor arc (P4.1 per-grade-file split,
P4.2 cluster.js per-module split, P4.3 brain-server.js per-concern
split). They lived in `.git/` because they were one-shot — used once
to migrate methods between files, then never again — and didn't seem
worth committing.

**Problem:** If the repo is cloned fresh, `.git/` doesn't come along.
The audit trail for HOW the refactor happened was effectively lost.

**Fix:** Scripts moved here so the refactor history is preserved with
the repo. **DO NOT RE-RUN** these scripts — they're for forensic /
audit reference only. The methods they migrated are now in their
final locations.

| Script | What it did | Source file → Destination |
|--------|-------------|---------------------------|
| `p4-1a-migrate.mjs` | P4.1.a — 13 K-ELA helpers | `js/brain/curriculum.js` → `js/brain/curriculum/kindergarten.js` |
| `p4-1b-migrate.mjs` | P4.1.b — 5 K-only direct-Oja helpers | `js/brain/curriculum.js` → `js/brain/curriculum/kindergarten.js` |
| `p4-1c-migrate.mjs` | P4.1.c — 3 orphan legacy helpers + chrome consolidation | `js/brain/curriculum.js` → `js/brain/curriculum/kindergarten.js` |
| `p4-1d-migrate.mjs` | P4.1.d — 5 Math-K / ELA-K orphans (P4.1 UMBRELLA CLOSE) | `js/brain/curriculum.js` → `js/brain/curriculum/kindergarten.js` |
| `p4-2a-migrate.mjs` | P4.2.a — 6 telemetry methods (CLUSTER_TELEMETRY_MIXIN) | `js/brain/cluster.js` → `js/brain/cluster/telemetry.js` |
| `p4-2b-migrate.mjs` | P4.2.b — 6 emit methods (CLUSTER_EMIT_MIXIN) | `js/brain/cluster.js` → `js/brain/cluster/emit.js` |
| `p4-2c-migrate.mjs` | P4.2.c — 6 hebbian methods (CLUSTER_HEBBIAN_MIXIN) | `js/brain/cluster.js` → `js/brain/cluster/hebbian.js` |
| `p4-3a-migrate.mjs` | P4.3.a — 20 GPU methods (SERVER_GPU_MIXIN) | `server/brain-server.js` → `server/brain-server/gpu.js` |
| `p4-3b-migrate.mjs` | P4.3.b — 8 state-broadcast methods (SERVER_STATE_MIXIN) | `server/brain-server.js` → `server/brain-server/state.js` |
| `p4-3c-migrate.mjs` | P4.3.c — 12 episodic-memory methods (SERVER_MEMORY_MIXIN) | `server/brain-server.js` → `server/brain-server/memory.js` |
| `p4-3d-migrate.mjs` | P4.3.d — 11 chat-path methods (SERVER_CHAT_MIXIN, P4.3 UMBRELLA CLOSE) | `server/brain-server.js` → `server/brain-server/chat.js` |

**Architectural impact of the P4 arc:**
- `js/brain/curriculum.js`:  26033 → 24035 lines (−7.7%)
- `js/brain/cluster.js`:      6375 → 3922 lines (−38.5%)
- `server/brain-server.js`:   9555 → 6395 lines (−33%)

Roughly 6000 lines of god-class bloat refactored into 13 focused
per-module / per-concern / per-grade files attached via the
`Object.assign(X.prototype, MIXIN)` mixin pattern. See `js/brain/cluster/README.md`,
`js/brain/curriculum/README.md`, and `server/brain-server/README.md`
for the per-directory rationale.

For the load-bearing mixin attach-order discipline this whole pattern
depends on, see `.claude/CONSTRAINTS.md` § **LAW.MIXIN-ORDER**.
