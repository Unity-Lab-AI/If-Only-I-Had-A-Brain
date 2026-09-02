---
name: feedback_i_push_donor_tags
description: "Donor releases are MY job end-to-end — bump Cargo, write RELEASE notes, push the donor-v* tag, then VERIFY the live site. Gee does not touch the tag."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9ca334e2-f8b0-473a-a026-3b9a384143ae
  modified: 2026-08-25T13:21:12.573Z
---

⛔ **Do the whole donor release. Do not hand the tag back to Gee.** Gee, 2026-08-25: *"no idiot do all the donor stuff llike weve always done, i dont change the tag u do"*.

**The full sequence, all mine:**
1. Bump `donor-app/Cargo.toml` version (⚠ the CI guard requires **tag == Cargo version**).
2. Write `donor-app/RELEASE-<version>.md`.
3. Verify locally — `cargo test --no-default-features` **and** `cargo check` on all three feature sets (default `gui`+`cuda` / `--no-default-features --features cuda` / `--no-default-features`). ⭐ Cargo IS installed on this box.
4. Commit + cascade feature → develop → main, both remotes.
5. **Push the annotated tag** `donor-v<version>` to `origin` *and* `github`. Match the existing convention: title line `donor v0.3.30 — SHORT TITLE`, blank line, body.
6. Wait for CI (~5–6 min for the two-target cross-compile) and **VERIFY, do not assume**.
7. ⚠ CI pushes a `site(donor): bump download links` commit — **fast-forward local `main` and merge into `develop`** or local goes stale.

⛔ **Verification is KI-22's four surfaces, checked on the LIVE SITE not the repo** — that incident had a correct tag, release and assets while the download page served the old version for hours and *every log line was green*:
- `Cargo.toml` version
- the tag
- release assets present with **real byte sizes** (not stubs)
- the **live** `html/compute.html` + `html/legend.html` links

⭐ **Best single check:** download the published Windows `.exe` and run `--version`. It self-reports, which proves the artifact is the code.
⚠ **Do NOT chase byte-hash equality with a local build** — `lto="thin"` + `strip=true` + container cross-compile mean it will never match, and that says nothing about provenance.

**Related:** `CURRENT_DONOR_VERSION` in `server/brain-server.js` must be bumped WITH the tag, never ahead of it (ahead = every pod download-loops; there is an anti-loop guard but it is a net, not a licence). `DREAM_MIN_DONOR_VERSION` is a separate HARD FLOOR — raise it only to a version where a lane the walk depends on moved onto the donor.

See also [[feedback_box_deploy_dashboard_only]] (the BRAIN deploys via dashboard press — different thing) and [[reference_deploy_server_specs]].
