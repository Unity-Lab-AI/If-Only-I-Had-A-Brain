---
name: feedback_box_deploy_dashboard_only
description: The deployed box changes ONLY via the dashboard Update-Savestart / rare Fresh-walk buttons — no manual box ops
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 1736645f-5953-4f8c-980c-d4b98594a36f
  modified: 2026-08-15T21:55:42.405Z
---

Gee 2026-07-14 (emphatic): *"we ARE NOT DOING ANYTHING ELSE TO THE BOX WE CAN ONLY USE THE UPDATE SAVESTART FROM HERE ON IN OR THE RARE CASE FRESH WALK — from the dashboard"*.

**Why:** the deployed coordinator box has no hands-on admin available (Red is off the project; Sponge does infra but Gee is driving day-to-day). The only levers Gee has are the dashboard buttons.

**How to apply:** every deployed-box change MUST be shippable as code on `main`, pulled + applied by the dashboard **Update & Savestart** (keeps weights, resumes the current walk) or, rarely, **Fresh Walk** (wipes weights, re-walks). NEVER propose a fix that needs manual box work — no SSH, no nginx edits, no systemd/env edits by hand, no regedit ON THE BOX, no file copies. If a fix genuinely needs box config (e.g. an env var), it must be delivered through the repo (unit file / self-update) so a dashboard Update applies it — otherwise it's not viable.

- Savestart-effective fixes (server/js code, weight-compatible) = the common path.
- Geometry/format changes (e.g. [[word_motor band fix]]) ride the rare Fresh Walk; gate them so routine savestarts keep the current geometry+weights aligned until Gee chooses the fresh walk.
- Gee's OWN donor PC (his Windows machine running the donor app) is separate from "the box" — a registry/Event-Viewer check there is his call, but prefer server-side code fixes deliverable via the dashboard over asking him to tweak any machine.

**Donor releases still involve a BOX DEPLOY (Gee correction 2026-08-15, emphatic — "THE DONER DOESNT DEPLOY ON THE SITE UNTIL UPDATE BUTTON EITHER FRESHWALK OR SAVE START IS PRESSED"):** never say "no box deploy needed" for a donor release. The site's donor download links (`donorLatest` + the download page) come from the CI link-bump commit on `main`, which the box only picks up on Update & Savestart / Fresh-walk. The full donor-release sequence is: (1) tag → CI builds + link-bump lands on main, (2) **Gee presses Update & Savestart** so the site serves the new version, (3) Gee downloads + swaps + restarts his donor. Steps 2 and 3 are BOTH his, and 2 is a box deploy.
