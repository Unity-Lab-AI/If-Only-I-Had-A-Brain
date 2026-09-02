---
name: feedback_typeof_no_shield_const_tdz
description: typeof does NOT shield a const/let from its temporal dead zone — a module-load call above a later const throws ReferenceError
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 942805ab-02fc-4f52-a2a7-252f4006322e
---

`typeof X === 'number'` does **NOT** make `X` safe when `X` is a `const`/`let` declared LATER in the same module scope. `typeof` only shields *genuinely undeclared* identifiers; a block-scoped binding in its **temporal dead zone (TDZ)** still throws `ReferenceError: Cannot access 'X' before initialization` even through `typeof`.

**Why:** I shipped #38 (2026-06-21) — `autoClearStaleState()` referenced `TOTAL_NEURONS` via `(typeof TOTAL_NEURONS === 'number') ? TOTAL_NEURONS : 0` for a weight-compat gate. But the module-load invocation `if (require.main === module) { autoClearStaleState(); }` sat ABOVE the `const TOTAL_NEURONS = ...` declaration (and the `CLUSTER_SIZES` it sums). I rationalized "the function runs at boot after the const exists" — wrong: the *call site* was above the declaration, so every boot hard-crash-looped with the TDZ ReferenceError. `node --check` + `import()` did NOT catch it (parse/link clean; the throw is at run-time module-load). The box admin (Sponge) caught it live, rolled the box back to last-good, and fixed it forward by moving the `autoClearStaleState()` call to just after `TOTAL_NEURONS` is computed (hotfix `ea21a0a` → `c1b753b`).

**How to apply:** when a function called at module-load (top-level / `require.main === module`) references a module-scope `const`/`let`, VERIFY the call site is BELOW that declaration — don't trust `typeof` to shield it. Prefer ordering the invocation after all consts it touches, or pass the value in as an argument. And remember: `node --check` and `import()` for inspection do NOT exercise the `require.main === module` boot path — they can't catch a module-load TDZ throw. Pairs with [[feedback_verify_esm_with_import_not_node_check]] (verification has blind spots) and the deploy-hardening in [[project_df7_data_parallel_delta_merge]].
