#!/usr/bin/env node
// .claude/hooks/post-tool-deploy-prompt.cjs
//
// PostToolUse hook (matcher: Bash). After a `git push` that targeted `main`,
// nudge Claude to ASK the UAL team member whether to deploy the project live
// via the /deploy skill (lab pages mechanism). PURE NUDGE — it never deploys,
// never blocks, never acts. A team member always confirms before anything ships.
//
// Mechanism:
//   1. Parse the intercepted Bash command; bail unless it's a `git push`.
//   2. Only nudge when the push targeted `main` (explicit `main` token in the
//      command, or the current branch is `main`).
//   3. Honor .claude/project-config.json `deploy.enabled` — false → stay silent
//      (the template repo itself opts out this way). Missing config → still
//      offer (first-time setup path).
//   4. Emit a one-shot nudge to stdout for Claude to act on.
//
// Bash fallback sibling: post-tool-deploy-prompt.sh

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch (e) { return ''; }
}

function runCmd(cmd, args) {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 3000,
    }).trim();
  } catch (e) { return null; }
}

(function main() {
  const raw = readStdin();
  if (!raw) process.exit(0);

  let payload;
  try { payload = JSON.parse(raw); } catch (e) { process.exit(0); }

  const cmd = (payload.tool_input && payload.tool_input.command)
           || (payload.toolInput && payload.toolInput.command)
           || '';
  if (!cmd || !/\bgit\s+push\b/.test(cmd)) process.exit(0);

  // Only nudge when the push targeted main.
  const branch = runCmd('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const pushedMain = /\bmain\b/.test(cmd) || branch === 'main';
  if (!pushedMain) process.exit(0);

  // Respect project deploy config: explicit disable → silent.
  let deployCfg = null;
  try {
    const projDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const cfg = JSON.parse(fs.readFileSync(path.join(projDir, '.claude', 'project-config.json'), 'utf8'));
    deployCfg = cfg.deploy || null;
  } catch (e) { /* no config — still offer first-time setup */ }
  if (deployCfg && deployCfg.enabled === false) process.exit(0);

  // Derive the repo / default subdomain from the origin remote.
  let repo = '<repo>';
  const url = runCmd('git', ['remote', 'get-url', 'origin']) || '';
  const m = url.match(/[:/]([^/]+?)(?:\.git)?\/?$/);
  if (m) repo = m[1].toLowerCase();
  const sub = (deployCfg && deployCfg.subdomain) || repo;

  const detail = deployCfg
    ? `This project has a deploy config (shape=${deployCfg.shape || '?'}). ASK the team member: "Deploy ${repo} live to https://${sub}.git.unityailab.com now?" If yes, run the /deploy skill.`
    : `ASK the team member: "Deploy ${repo} live to the lab pages (https://${sub}.git.unityailab.com) now?" If yes, run the /deploy skill — it interviews + sets up .forgejo/workflows/deploy.yml in the moment.`;

  const lines = [
    '## Deploy prompt (auto-injected by .claude/hooks/post-tool-deploy-prompt.cjs)',
    '',
    'A push to `main` just landed. ' + detail,
    '',
    'Do NOT deploy without an explicit yes — this is a nudge only.',
  ];
  process.stdout.write(lines.join('\n') + '\n');
  process.exit(0);
})();
