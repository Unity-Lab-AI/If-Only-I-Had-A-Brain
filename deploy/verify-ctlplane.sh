#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# verify-ctlplane.sh — prove the control plane still does what it claims, on a
# REAL box, on demand.
#
# WHY THIS EXISTS. The unit/browser suites run against mocks, and the live
# behaviour was only ever confirmed by ad-hoc commands typed during the original
# session. That means the three headline promises —
#
#     1. the website stays up when the brain is down
#     2. the endpoints say "brain offline" instead of 502-ing
#     3. an admin can start the brain again with no shell
#
# — had no check anyone could re-run later. A promise you cannot re-verify
# decays silently. This script is that check.
#
# ⚠ IT STOPS AND STARTS THE BRAIN. That is unavoidable: those promises are only
# observable while the brain is actually down. It uses the GRACEFUL path, so the
# brain force-saves weights and writes a resume marker first, and it always
# starts it again — including on failure, via a trap. It NEVER touches the
# wiping verbs (/ctl/update fresh-walk, /ctl/reset), so trained weights are
# never at risk. Expect ~2-4 minutes, mostly the brain reloading ~5.4 GB.
#
# Usage, ON the box (or over ssh):
#     bash deploy/verify-ctlplane.sh                 # full cycle (stops the brain!)
#     bash deploy/verify-ctlplane.sh --read-only     # no state change, checks what it can
#
# Exit 0 = every check passed. Non-zero = the count of failures.
# ─────────────────────────────────────────────────────────────────────────────
# NOTE: deliberately NO `pipefail` here.
#
# `journalctl … | grep -q PATTERN` is the natural way to ask "is this line in the
# log", but `grep -q` exits as soon as it matches, which closes the pipe and
# kills journalctl with SIGPIPE. Under `pipefail` the pipeline then reports 141
# (128+13) EVEN THOUGH THE PATTERN MATCHED, so the check inverts: a successful
# match is read as a failure. That cost three debugging rounds on this very
# script — the resume check kept reporting "no RESUME line" while the line was
# demonstrably there (`hits=1` on every poll).
#
# `-u` (error on unset variables) is kept; it catches real typos.
set -u

CTL="${UAL_CTL_URL:-http://127.0.0.1:7526}"
SITE="${UAL_SITE_URL:-https://if-only-i-had-a-brain.git.unityailab.com}"
READ_ONLY=0
[[ "${1:-}" == "--read-only" ]] && READ_ONLY=1

PASS=0; FAIL=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31m✗\033[0m %s — %s\n' "$1" "${2:-}"; FAIL=$((FAIL+1)); }
info() { printf '    %s\n' "$1"; }
head2(){ printf '\n\033[1m%s\033[0m\n' "$1"; }

code()  { curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$1"; }
jget()  { curl -s --max-time 30 "$1" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('$2'))" 2>/dev/null; }
phase() { jget "$CTL/ctl/status" phase; }

# Always leave the brain running, whatever happens after this point.
STARTED_STOP=0
cleanup() {
  if [[ $STARTED_STOP -eq 1 ]]; then
    printf '\n\033[33m[cleanup] ensuring the brain is started again…\033[0m\n'
    curl -s -X POST --max-time 420 "$CTL/ctl/start" >/dev/null 2>&1 || true
    printf '[cleanup] phase now: %s\n' "$(phase)"
  fi
}
trap cleanup EXIT INT TERM

head2 "0. preflight — is the control plane answering at all?"
if [[ "$(code "$CTL/ctl/health")" == "200" ]]; then ok "control plane is up ($CTL)"; else
  bad "control plane is NOT answering" "start it: sudo systemctl start unity-brain-ctl"
  exit 1
fi
BASE_PHASE="$(phase)"
info "brain phase: $BASE_PHASE"

head2 "1. auth — the power lane must never be open"
for u in "$SITE/ctl/status" "$SITE/ctl/start"; do
  c="$(code "$u")"
  [[ "$c" == "401" ]] && ok "$(basename "$u") requires auth (401)" || bad "$(basename "$u") returned $c" "expected 401"
done

head2 "2. destructive verbs must refuse an unconfirmed request"
for v in update reset; do
  r="$(curl -s -X POST --max-time 30 "$CTL/ctl/$v" | python3 -c "import sys,json;print(json.load(sys.stdin).get('refused'))" 2>/dev/null)"
  [[ "$r" == "True" ]] && ok "/ctl/$v refuses without the WIPE token" || bad "/ctl/$v did NOT refuse" "got refused=$r — A STRAY REQUEST COULD WIPE THE BRAIN"
done
for v in update reset; do
  c="$(code "$CTL/ctl/$v")"   # GET, not POST
  [[ "$c" == "404" ]] && ok "GET /ctl/$v is not routed (a crawler cannot fire it)" || bad "GET /ctl/$v returned $c" "expected 404"
done

if [[ $READ_ONLY -eq 1 ]]; then
  head2 "read-only mode — skipping the stop/start cycle"
  info "re-run without --read-only to prove the site survives a brain outage."
else
  head2 "3. THE MAIN PROMISE — stop the brain, site must stay up and SAY so"
  info "using the graceful path (brain force-saves + writes a resume marker)…"
  STARTED_STOP=1
  stopout="$(curl -s -X POST --max-time 180 "$CTL/ctl/stop")"
  g="$(echo "$stopout" | python3 -c "import sys,json;print(json.load(sys.stdin).get('gracefulSave'))" 2>/dev/null)"
  [[ "$g" == "True" ]] && ok "brain stopped GRACEFULLY (weights saved first)" || bad "stop was not graceful" "gracefulSave=$g — training since the last checkpoint may be lost"

  p="$(phase)"
  [[ "$p" == "halted" || "$p" == "offline" || "$p" == "failed" ]] && ok "ctl reports the brain as down (phase=$p)" || bad "phase is '$p'" "expected halted/offline"

  # 1. the website stays up
  for pth in "/" "/html/dashboard.html" "/html/compute.html" "/legend.html"; do
    c="$(code "$SITE$pth")"
    [[ "$c" == "200" ]] && ok "site still serves $pth (200) with the brain DOWN" || bad "$pth returned $c with the brain down" "the site must NOT depend on the brain"
  done

  # 2. the endpoints say "brain offline" in parseable JSON
  for pth in "/public-state.json" "/minds-eye.json"; do
    c="$(code "$SITE$pth")"
    off="$(jget "$SITE$pth" brainOffline)"
    [[ "$c" == "200" ]] && ok "$pth returns 200 (not 502) with the brain down" || bad "$pth returned $c" "expected 200 via the nginx fallback"
    [[ "$off" == "True" ]] && ok "$pth reports brainOffline=true" || bad "$pth brainOffline=$off" "the frontend keys off this; without it pages show the OLD broken state"
  done

  # 3. an admin can start it again — the whole point
  head2 "4. RECOVERY — start it again with no shell (this is the point)"
  info "this waits for ~5.4 GB of weights to load; can take minutes…"
  startout="$(curl -s -X POST --max-time 420 "$CTL/ctl/start")"
  b="$(echo "$startout" | python3 -c "import sys,json;print(json.load(sys.stdin).get('boundPort'))" 2>/dev/null)"
  pr="$(echo "$startout" | python3 -c "import sys,json;print(json.load(sys.stdin).get('proxyReloaded'))" 2>/dev/null)"
  [[ "$b" == "True" ]] && { ok "brain started and BOUND its port"; STARTED_STOP=0; } || bad "brain did not bind its port" "boundPort=$b — check: journalctl -u unity-brain -n 60"
  # 4. startup reloads the proxy
  [[ "$pr" == "True" ]] && ok "proxy lanes reloaded on startup (no stale 502)" || bad "proxy was not reloaded" "proxyReloaded=$pr"

  p="$(phase)"
  [[ "$p" == "online" ]] && ok "ctl reports the brain online again" || bad "phase is '$p' after start" "expected online"

  # And the site must serve REAL data again. The cached public snapshot is only
  # written on the broadcast cadence, so this POLLS rather than sleeping a fixed
  # amount — a fixed sleep gave a false failure the first time this script ran.
  has=False
  for _ in $(seq 1 20); do
    has="$(curl -s --max-time 20 "$SITE/public-state.json" | python3 -c "import sys,json;print(bool(json.load(sys.stdin).get('state')))" 2>/dev/null)"
    [[ "$has" == "True" ]] && break
    sleep 5
  done
  [[ "$has" == "True" ]] && ok "public state is live again (real payload, not the offline stub)" || bad "public state still has no live payload after 100s" "got state-present=$has"

  # 5. training must have SURVIVED the cycle.
  #
  # This must read the resume line belonging to THE BOOT WE JUST CAUSED, not an
  # earlier one. A plain `--since` window matches the *previous* boot's line too,
  # so the loop exited early and then reported a false failure. Anchor on the
  # current MainPID instead: journald tags each line with the emitting pid, so
  # `_PID=<current>` is unambiguous.
  head2 "5. training must have survived the stop/start"
  # Re-read MainPID INSIDE the loop. Capturing it once was the bug in the first
  # two attempts at this check: the value was read before the restart had fully
  # settled, so it referred to a pid whose log had not been written yet (or to
  # the outgoing process), and the check then failed even though the resume had
  # happened. Re-reading each pass makes it self-correcting.
  resumed=0
  brain_pid=""
  for _ in $(seq 1 24); do
    brain_pid="$(systemctl show unity-brain -p MainPID --value 2>/dev/null)"
    # Use `grep -c` (counts, reads to EOF) rather than `grep -q` (exits early,
    # SIGPIPEs journalctl). Belt and braces alongside dropping pipefail.
    hits=0
    if [[ -n "$brain_pid" && "$brain_pid" != "0" ]]; then
      # grep -c already prints 0 on no-match (and exits 1), so `|| echo 0` would
      # append a SECOND line and break the arithmetic test below. `|| true` keeps
      # the single count; `head -1` guards against any multi-line surprise.
      hits="$(journalctl -u unity-brain _PID="$brain_pid" --no-pager 2>/dev/null \
              | grep -ciE 'CLEAN SHUTDOWN detected.*COMPATIBLE.*RESUMING' 2>/dev/null | head -1 || true)"
    fi
    if [[ "${hits:-0}" -ge 1 ]]; then resumed=1; break; fi
    [[ -n "${UAL_VERIFY_DEBUG:-}" ]] && info "poll: pid=$brain_pid resume-hits=$hits"
    sleep 5
  done
  info "brain MainPID=$brain_pid (only this boot's log lines counted)"
  if [[ $resumed -eq 1 ]]; then
    ok "journal confirms a RESUME (saved training was compatible + reloaded)"
  else
    bad "no RESUME line in the journal after 120s" "check for a FORCE-FRESH/auto-clear — that would mean training was WIPED"
  fi
  ff="$(journalctl -u unity-brain --since '-6min' --no-pager 2>/dev/null | grep -ci 'FORCE-FRESH' 2>/dev/null | head -1 || true)"
  if [[ "${ff:-0}" -ge 1 ]]; then
    bad "a FORCE-FRESH fired during this verification" "THIS SCRIPT MUST NEVER WIPE — investigate immediately"
  else
    ok "no FORCE-FRESH fired (weights were never at risk)"
  fi
fi

head2 "6. backups — the weights must actually be protected"
r="$(systemctl show nightly-backup -p Result --value 2>/dev/null || echo unknown)"
[[ "$r" == "success" ]] && ok "last nightly backup succeeded" || bad "last nightly backup: $r" "the brain may be unprotected — journalctl -u nightly-backup -n 40"

printf '\n%s\n' "──────────────────────────────────────────────────────────"
if [[ $FAIL -eq 0 ]]; then
  printf '\033[32mALL PASS — %d checks. The site survives a brain outage and an admin can recover it.\033[0m\n' "$PASS"
else
  printf '\033[31m%d PASSED, %d FAILED — see the ✗ lines above.\033[0m\n' "$PASS" "$FAIL"
fi
printf '%s\n' "──────────────────────────────────────────────────────────"
exit "$FAIL"
