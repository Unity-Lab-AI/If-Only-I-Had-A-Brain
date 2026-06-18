/**
 * version.js — single source of truth for Unity build identity.
 *
 * VERSION is the semver line bumped by hand in git commits.
 * BUILD is stamped by scripts/stamp-version.mjs on every deploy — it's
 * a short git hash plus a 4-char random nonce so two pushes from the
 * same commit still bust caches differently. FULL is what gets shown
 * in the boot log and used as the ?v= query on the module script.
 *
 * DO NOT hand-edit BUILD. Run `node scripts/stamp-version.mjs` instead
 * (the push workflow in docs/PUSH_WORKFLOW.md wires this to git pre-push).
 */
export const VERSION = '0.1.0';
export const BUILD = '262f758f-f649';
export const FULL = `${VERSION}+${BUILD}`;
