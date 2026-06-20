#!/usr/bin/env bash
# deploy/bootstrap-backend.sh — ONE-TIME backend bootstrap.
#
# Run this ONCE, as root (or with sudo), ON THE SERVER that hosts the lab pages.
# It turns the static-only deploy into a working brain: installs the Node
# brain-server as a persistent systemd service, places the code, seeds unattended
# auto-advance, and PRINTS the nginx reverse-proxy + admin Basic-auth steps for
# you to graft by hand (it does NOT auto-touch nginx — see the nginx step).
#
# WHY root is needed ONCE: installing a systemd unit + (your hand-grafted) nginx
# proxy block all require root. Everything the brain does after boot is automatic.
#
# IMPORTANT box realities baked in here (lab host):
#   • :443 is already owned by an ssl_preread stream split — this script does NOT
#     install a :443 vhost. nginx is left for you to hand-graft (see step 5).
#   • The static frontend is already served by the wildcard-pages vhost — this
#     only adds the brain backend + its WS/admin proxy lanes.
#   • Backend auto-redeploy via the pages-deploy key is NOT possible (that key is
#     rrsync-locked to /var/www/pages with no shell). Backend redeploy is MANUAL:
#       cd "$BACKEND_DIR" && git pull && (cd server && npm ci --omit=dev) \
#         && sudo systemctl restart unity-brain
#     The frontend still auto-deploys on push via .forgejo/workflows/deploy.yml.
#
# Usage (on the server):
#   sudo BACKEND_DIR=/opt/unity-brain \
#        SERVICE_USER=unity \
#        DEPLOY_USER=<a shell user that may restart the service> \
#        DOMAIN=if-only-i-had-a-brain.git.unityailab.com \
#        bash deploy/bootstrap-backend.sh
#   # opt-in nginx auto-install (ONLY if your box owns :443 directly, NOT the
#   # lab host): add SETUP_NGINX=1
set -euo pipefail

BACKEND_DIR="${BACKEND_DIR:-/opt/unity-brain}"
SERVICE_USER="${SERVICE_USER:-unity}"
DEPLOY_USER="${DEPLOY_USER:-$SERVICE_USER}"
DOMAIN="${DOMAIN:-if-only-i-had-a-brain.git.unityailab.com}"
AUTO_ADVANCE="${AUTO_ADVANCE:-1}"   # 1 = seed unattended K→PhD walk (auto-advance ON)
SETUP_NGINX="${SETUP_NGINX:-0}"     # 0 = print nginx steps only (safe on SNI-split boxes)
REPO_HERE="$(cd "$(dirname "$0")/.." && pwd)"   # the checked-out repo this script lives in

echo "== Unity brain backend bootstrap =="
echo "  BACKEND_DIR=$BACKEND_DIR  SERVICE_USER=$SERVICE_USER  DEPLOY_USER=$DEPLOY_USER  DOMAIN=$DOMAIN"
echo "  AUTO_ADVANCE=$AUTO_ADVANCE  SETUP_NGINX=$SETUP_NGINX"

command -v node >/dev/null 2>&1 || { echo "ERROR: node is not installed on this box. Install Node 18+ first (the runner's Docker node does NOT count — the systemd service runs on the host)."; exit 1; }
# better-sqlite3 is a native module: npm ci tries a prebuilt binary first, but if
# none matches the host Node ABI/arch it builds from source — needs build-essential
# + python3 present, or npm ci will fail on that one dep.
command -v cc >/dev/null 2>&1 || echo "WARN: no C compiler found — if better-sqlite3 has no prebuilt for this Node ABI, install build-essential + python3 before re-running."

# 1) Place the backend code at BACKEND_DIR (full repo: server/ + js/ + corpora/).
echo "== [1/6] syncing backend code to $BACKEND_DIR =="
id -u "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$SERVICE_USER"
mkdir -p "$BACKEND_DIR"
rsync -a --delete \
  --exclude='.git' --exclude='.forgejo' --exclude='.gitea' --exclude='.claude' \
  "$REPO_HERE"/ "$BACKEND_DIR"/
chown -R "$SERVICE_USER":"$SERVICE_USER" "$BACKEND_DIR"

# 2) Install Node deps for the server.
echo "== [2/6] npm ci (server deps) =="
( cd "$BACKEND_DIR/server" && sudo -u "$SERVICE_USER" npm ci --omit=dev )

# 3) GloVe embeddings (~990MB) — optional; hash/fastText fallback works without it.
echo "== [3/6] GloVe embeddings (optional) =="
if [ ! -f "$BACKEND_DIR/corpora/glove.6B.300d.txt" ]; then
  echo "  GloVe missing — drop glove.6B.300d.txt into $BACKEND_DIR/corpora/ for full semantics. Continuing (fallback works)."
fi

# 3.5) Seed unattended auto-advance so the K→PhD walk advances through grades on
# its own once a donor GPU connects — no admin interaction needed to START
# training. Toggle it off later from the admin dashboard. Skip with AUTO_ADVANCE=0.
if [ "$AUTO_ADVANCE" = "1" ]; then
  echo "== [3.5] seeding unattended auto-advance =="
  printf '{"enabled":true}\n' > "$BACKEND_DIR/server/auto-advance.json"
  chown "$SERVICE_USER":"$SERVICE_USER" "$BACKEND_DIR/server/auto-advance.json"
fi

# 4) systemd service (from deploy/unity-brain.service, with paths substituted).
echo "== [4/6] systemd unit =="
sed -e "s#/opt/unity-brain#$BACKEND_DIR#g" -e "s#^User=.*#User=$SERVICE_USER#" \
  "$BACKEND_DIR/deploy/unity-brain.service" > /etc/systemd/system/unity-brain.service
systemctl daemon-reload
systemctl enable --now unity-brain
echo "  service status:"; systemctl --no-pager --lines=3 status unity-brain || true

# 5) nginx — DEFAULT: print the hand-graft steps (DO NOT auto-touch nginx on a
# box whose :443 is owned by an ssl_preread stream split — auto-installing a
# vhost there can break the box). Only auto-installs if SETUP_NGINX=1 AND your
# box owns :443 directly.
echo "== [5/6] nginx reverse-proxy =="
if [ "$SETUP_NGINX" = "1" ] && command -v nginx >/dev/null 2>&1; then
  echo "  SETUP_NGINX=1 — installing $BACKEND_DIR/deploy/nginx-unity-brain.conf (assumes this box owns :443 directly)."
  sed -e "s#if-only-i-had-a-brain.git.unityailab.com#$DOMAIN#g" \
    "$BACKEND_DIR/deploy/nginx-unity-brain.conf" > /etc/nginx/sites-available/unity-brain.conf
  ln -sf /etc/nginx/sites-available/unity-brain.conf /etc/nginx/sites-enabled/unity-brain.conf
  nginx -t && systemctl reload nginx
else
  cat <<EOF
  Skipping automatic nginx install (SETUP_NGINX=0, the safe default for the lab
  host's ssl_preread stream split). Hand-graft the brain lanes into your existing
  TLS topology using $BACKEND_DIR/deploy/nginx-unity-brain.conf as the reference:
    • add a 'listen 127.0.0.1:8444 ssl proxy_protocol;' server for $DOMAIN
      (wildcard cert, absolute_redirect off) — NOT a second :443 vhost;
    • copy in the /ws (public) + /admin/ws + /admin/ (Basic-auth) location blocks;
    • create the operator login:
        sudo htpasswd -c /etc/nginx/unity-admin.htpasswd <operator>
    • nginx -t && systemctl reload nginx
EOF
fi

# 6) Let DEPLOY_USER restart the service without a password (manual backend
# redeploy convenience — the pages-deploy key is rrsync-locked and CANNOT do
# this automatically, so backend redeploy stays a manual shell action).
echo "== [6/6] sudoers: allow $DEPLOY_USER to restart the service =="
echo "$DEPLOY_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart unity-brain, /usr/bin/systemctl status unity-brain" \
  > /etc/sudoers.d/unity-brain-deploy
chmod 0440 /etc/sudoers.d/unity-brain-deploy

echo ""
echo "== DONE. Backend service is live. =="
echo "  Service:   systemctl status unity-brain   |  Logs: journalctl -u unity-brain -f"
echo "  Donor:     https://$DOMAIN/html/compute.html    (public — donate a GPU)"
echo "  Dashboard: https://$DOMAIN/html/dashboard.html  (admin via Basic-auth; prime creds at /admin/milestone first)"
echo "  Backend redeploy (manual): cd $BACKEND_DIR && git pull && (cd server && npm ci --omit=dev) && sudo systemctl restart unity-brain"
