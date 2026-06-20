#!/usr/bin/env bash
# deploy/bootstrap-backend.sh — ONE-TIME backend bootstrap (PA.4.7).
#
# Run this ONCE, as root (or with sudo), ON THE SERVER that hosts
# git.unityailab.com / the pages web root. It turns the static-only deploy into
# a working brain: it installs the Node brain-server as a persistent systemd
# service + wires the nginx WSS reverse-proxy + Forgejo auth, so the deployed
# static page can train off donor browser GPUs. After this runs once, every
# push to main auto-redeploys + restarts the backend (see .forgejo/workflows/
# deploy.yml backend step) — fully automatic from then on.
#
# WHY root is needed ONCE: installing a systemd unit + an nginx site + granting
# the deploy user permission to restart the service all require root. There is
# no way around a one-time privileged setup; everything after is automatic.
#
# Usage (on the server):
#   sudo BACKEND_DIR=/opt/unity-brain \
#        SERVICE_USER=unity \
#        DEPLOY_USER=<the PAGES_DEPLOY_USER> \
#        DOMAIN=if-only-i-had-a-brain.git.unityailab.com \
#        bash deploy/bootstrap-backend.sh
set -euo pipefail

BACKEND_DIR="${BACKEND_DIR:-/opt/unity-brain}"
SERVICE_USER="${SERVICE_USER:-unity}"
DEPLOY_USER="${DEPLOY_USER:-$SERVICE_USER}"
DOMAIN="${DOMAIN:-if-only-i-had-a-brain.git.unityailab.com}"
REPO_HERE="$(cd "$(dirname "$0")/.." && pwd)"   # the checked-out repo this script lives in

echo "== Unity brain backend bootstrap =="
echo "  BACKEND_DIR=$BACKEND_DIR  SERVICE_USER=$SERVICE_USER  DEPLOY_USER=$DEPLOY_USER  DOMAIN=$DOMAIN"

command -v node >/dev/null 2>&1 || { echo "ERROR: node is not installed on this box. Install Node 18+ first."; exit 1; }
command -v nginx >/dev/null 2>&1 || echo "WARN: nginx not found — skip the nginx step if you front the domain another way."

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

# 3) GloVe embeddings (990MB) — fetch once if missing (else hash-fallback works, degraded).
echo "== [3/6] GloVe embeddings =="
if [ ! -f "$BACKEND_DIR/corpora/glove.6B.300d.txt" ]; then
  echo "  GloVe missing — run the project's GloVe fetch (start.sh does this) or drop glove.6B.300d.txt into $BACKEND_DIR/corpora/. Continuing (hash-fallback works)."
fi

# 4) systemd service (from deploy/unity-brain.service, with paths substituted).
echo "== [4/6] systemd unit =="
sed -e "s#/opt/unity-brain#$BACKEND_DIR#g" -e "s#^User=.*#User=$SERVICE_USER#" \
  "$BACKEND_DIR/deploy/unity-brain.service" > /etc/systemd/system/unity-brain.service
systemctl daemon-reload
systemctl enable --now unity-brain
echo "  service status:"; systemctl --no-pager --lines=3 status unity-brain || true

# 5) nginx vhost (WSS proxy + Forgejo auth). Adjust /_forgejo_auth to your auth.
echo "== [5/6] nginx vhost =="
if command -v nginx >/dev/null 2>&1; then
  sed -e "s#if-only-i-had-a-brain.git.unityailab.com#$DOMAIN#g" -e "s#/var/www/if-only-i-had-a-brain#$BACKEND_DIR#g" \
    "$BACKEND_DIR/deploy/nginx-unity-brain.conf" > /etc/nginx/sites-available/unity-brain.conf
  ln -sf /etc/nginx/sites-available/unity-brain.conf /etc/nginx/sites-enabled/unity-brain.conf
  nginx -t && systemctl reload nginx
  echo "  NOTE: wire location /_forgejo_auth to your real Forgejo/oauth2-proxy auth endpoint."
fi

# 6) Let the deploy user restart the service without a password (for auto-redeploy on push).
echo "== [6/6] sudoers: allow $DEPLOY_USER to restart the service =="
echo "$DEPLOY_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart unity-brain, /usr/bin/systemctl status unity-brain" \
  > /etc/sudoers.d/unity-brain-deploy
chmod 0440 /etc/sudoers.d/unity-brain-deploy

echo ""
echo "== DONE. Backend is live + auto-restarts on every push. =="
echo "  Service:  systemctl status unity-brain   |  Logs: journalctl -u unity-brain -f"
echo "  Donor:    https://$DOMAIN/compute.html    |  Dashboard: https://$DOMAIN/dashboard.html"
echo "  You (Forgejo-authed) opening the admin route first = locked primary operator."
