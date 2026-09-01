#!/usr/bin/env bash
# .claude/hooks/post-tool-deploy-prompt.sh
#
# Bash fallback for post-tool-deploy-prompt.cjs. After a `git push` that
# targeted `main`, nudge Claude to ASK the UAL team member whether to deploy
# the project live via the /deploy skill (lab pages mechanism). PURE NUDGE —
# never deploys, never blocks. Logic mirrors the .cjs sibling. Use this on
# machines without node.

set -u

INPUT=$(cat 2>/dev/null || true)
[ -z "$INPUT" ] && exit 0

# Extract command — prefer jq, fall back to grep (mirrors the IP-guard sibling).
if command -v jq >/dev/null 2>&1; then
  CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // .toolInput.command // .input.command // empty' 2>/dev/null)
else
  CMD=$(printf '%s' "$INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
fi
[ -z "$CMD" ] && exit 0
echo "$CMD" | grep -qE '\bgit[[:space:]]+push\b' || exit 0

# Only nudge when the push targeted main (explicit token or current branch).
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
if ! echo "$CMD" | grep -qE '\bmain\b' && [ "$BRANCH" != "main" ]; then
  exit 0
fi

# Respect project deploy config: explicit disable → silent.
PROJDIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
CFG="$PROJDIR/.claude/project-config.json"
if [ -f "$CFG" ]; then
  if command -v jq >/dev/null 2>&1; then
    EN=$(jq -r '.deploy.enabled // "unset"' "$CFG" 2>/dev/null)
    [ "$EN" = "false" ] && exit 0
  elif grep -qE '"deploy"' "$CFG" && grep -qE '"enabled"[[:space:]]*:[[:space:]]*false' "$CFG"; then
    exit 0
  fi
fi

# Derive repo / default subdomain from the origin remote.
URL=$(git remote get-url origin 2>/dev/null || echo "")
REPO=$(echo "$URL" | sed -nE 's#.*[:/]([^/]+?)(\.git)?/?$#\1#p' | tr '[:upper:]' '[:lower:]')
[ -z "$REPO" ] && REPO="<repo>"

cat <<EOF
## Deploy prompt (auto-injected by .claude/hooks/post-tool-deploy-prompt.sh)

A push to \`main\` just landed. ASK the team member: "Deploy ${REPO} live to the lab pages (https://${REPO}.git.unityailab.com) now?" If yes, run the /deploy skill — it interviews + sets up .forgejo/workflows/deploy.yml in the moment.

Do NOT deploy without an explicit yes — this is a nudge only.
EOF
exit 0
