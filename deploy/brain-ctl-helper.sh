#!/usr/bin/env bash
# brain-ctl-helper.sh — the ONLY root-capable surface of the brain control plane.
#
# WHY A HELPER SCRIPT INSTEAD OF SUDO-ING systemctl DIRECTLY:
# A sudoers rule like `NOPASSWD: /usr/bin/systemctl` would grant control over
# EVERY unit on a box that also runs Forgejo and the whole lab's git. Sudoers
# wildcards are notoriously leaky (`systemctl restart *` can be walked to other
# units, and some systemctl verbs can be steered into running arbitrary units).
# So the privileged surface is exactly this file, it takes a closed set of
# verbs, and it re-validates them itself — it does NOT trust its caller, even
# though its caller (brain-ctl.js) also validates.
#
# Defence in depth on purpose: brain-ctl.js only ever passes hardcoded argv from
# its ACTIONS table, AND this script independently rejects anything outside its
# own case statement. Either layer alone would be sufficient; both means a bug
# in one is not a privilege escalation.
#
# Install (see deploy/README.md):
#   sudo install -o root -g root -m 755 deploy/brain-ctl-helper.sh /usr/local/sbin/brain-ctl-helper
#   sudo install -o root -g root -m 440 deploy/sudoers.d/unity-brain-ctl /etc/sudoers.d/unity-brain-ctl
#   sudo visudo -cf /etc/sudoers.d/unity-brain-ctl     # MUST pass before you rely on it

set -euo pipefail

# Fixed PATH — never inherit one from the calling environment.
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH

# The unit this helper is allowed to touch. Hardcoded, NOT taken from argv, so
# no caller can retarget it at forgejo, sshd, or anything else on the box.
readonly ALLOWED_UNIT="unity-brain"

usage() {
  cat <<USAGE >&2
brain-ctl-helper — privileged verbs for the Unity brain control plane.

  brain-ctl-helper start   ${ALLOWED_UNIT}
  brain-ctl-helper stop    ${ALLOWED_UNIT}
  brain-ctl-helper restart ${ALLOWED_UNIT}
  brain-ctl-helper reload-nginx

Only the unit "${ALLOWED_UNIT}" may be targeted. Anything else is refused.
USAGE
  exit 64
}

[[ $# -ge 1 ]] || usage

action="$1"
shift || true

# Verbs that take a unit argument must be given EXACTLY the allowed unit.
require_allowed_unit() {
  local unit="${1:-}"
  if [[ "$unit" != "$ALLOWED_UNIT" ]]; then
    echo "brain-ctl-helper: refusing to operate on unit '${unit:-<none>}' — only '${ALLOWED_UNIT}' is permitted." >&2
    exit 77
  fi
}

case "$action" in
  start|stop|restart)
    require_allowed_unit "${1:-}"
    # --no-block would return before the transition; we WANT to block so the
    # caller's follow-up port probe reflects a real state change.
    exec systemctl "$action" "$ALLOWED_UNIT"
    ;;

  reload-nginx)
    # Graceful RELOAD, never restart: reload re-reads config and re-establishes
    # upstreams while draining existing connections, so the static site stays
    # up. A restart would drop the site for a moment, which defeats the whole
    # point of keeping the web server alive independently of the brain.
    #
    # Config is validated FIRST. Reloading a broken config is how you turn a
    # brain outage into a total site outage.
    if ! nginx -t 2>/dev/null; then
      echo "brain-ctl-helper: nginx config test FAILED — refusing to reload (this protects the static site from going down too)." >&2
      nginx -t || true
      exit 78
    fi
    exec systemctl reload nginx
    ;;

  *)
    echo "brain-ctl-helper: unknown action '$action'." >&2
    usage
    ;;
esac
