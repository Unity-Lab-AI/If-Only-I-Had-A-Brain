# TU.30 — fix the /update -> /restart interlock trap (the "update buttons never restart" bug)
# Layer 1: deploy/self-update.sh — PID-pinned SIGTERM escalation when /restart gets swallowed
# Layer 2: brain-server.js — /restart + /savererun clear a STALE shutdown flag (WL.4 pattern)
import io

# ════ Layer 1: deploy/self-update.sh ════
p = 'deploy/self-update.sh'
with io.open(p, 'r', encoding='utf-8', newline='') as f:
    c = f.read()
nl = '\r\n' if '\r\n' in c[:2000] else '\n'

# 1a. capture the brain PID right before the restart chain. Anchor: the SAVESTART/FRESH
# marker block ends before the restart chain; find the line that starts the chain.
# The chain starts with a systemctl attempt; find its 'if' by locating the /restart curl
# and backing up to the start of the chain is fragile — instead anchor on the curl line
# itself and insert the PID capture just before the chain via the preceding comment.
curl_line = 'elif curl -fsS -m 15 -X POST -H "X-UAL-User: ${DEPLOY_AUTH_USER}" "http://127.0.0.1:${BRAIN_PORT}/restart"'
ci = c.find(curl_line)
assert ci != -1, 'restart curl line not found'
# find the start of the if/elif chain: search backwards for the nearest line starting with 'if '
chain_start = c.rfind(nl + 'if ', 0, ci)
assert chain_start != -1, 'restart chain start not found'
pid_block_lines = [
    '',
    '# TU.30 — pin the CURRENT brain PID before attempting any restart. The /update handler',
    '# sets the shutdown flag BEFORE spawning this script, and /restart treats that flag as',
    '# "already restarting" and silently NO-OPS — the interlock that made every dashboard',
    '# Update press overlay the code but never actually restart the process (uptime just',
    '# kept climbing on the old code). With the PID pinned we can VERIFY the exit landed',
    '# and escalate to a direct same-user SIGTERM (no sudo; the SIGTERM handler force-saves',
    '# + drops the resume marker, systemd Restart=always revives the overlaid code).',
    'BRAIN_PID="$(pgrep -of \'node.*brain-server\\.js\' 2>/dev/null || true)"',
]
c = c[:chain_start] + nl + nl.join(pid_block_lines) + c[chain_start:]

# 1b. append the verify+escalate block after the restart chain's closing 'fi'.
# Find the chain's terminating 'fi' after the curl branch's DONE log.
done_log = 'log "DONE — restart triggered via loopback POST /restart'
di = c.find(done_log)
assert di != -1, 'DONE log not found'
fi_idx = c.find(nl + 'fi', di)
assert fi_idx != -1, 'chain closing fi not found'
fi_end = fi_idx + len(nl + 'fi')
verify_lines = [
    '',
    '# TU.30 — VERIFY the restart actually landed. If the pinned PID is still alive after a',
    '# grace window, the /restart endpoint swallowed the request ("already restarting" no-op',
    '# from the /update shutdown-flag interlock) — escalate: SIGTERM the pinned PID directly.',
    '# PID-pinned so a systemd-revived NEW process can never be mistakenly killed.',
    'if [ -n "$BRAIN_PID" ]; then',
    '  sleep 8',
    '  if kill -0 "$BRAIN_PID" 2>/dev/null; then',
    '    log "restart did NOT land — PID $BRAIN_PID still alive (the /update shutdown-flag interlock swallows the /restart POST). Escalating: kill -TERM $BRAIN_PID (same-user, no sudo; SIGTERM handler force-saves + drops the resume marker; systemd Restart=always revives the overlaid code)."',
    '    kill -TERM "$BRAIN_PID" 2>/dev/null || log "kill -TERM failed (process may have exited between checks)"',
    '    sleep 6',
    '    if kill -0 "$BRAIN_PID" 2>/dev/null; then',
    '      log "PID $BRAIN_PID STILL alive after SIGTERM — final escalation: kill -KILL (weights were checkpointed continuously; boot resume relies on the last periodic save)."',
    '      kill -KILL "$BRAIN_PID" 2>/dev/null || true',
    '    fi',
    '  else',
    '    log "restart verified — PID $BRAIN_PID exited; systemd revives the overlaid code."',
    '  fi',
    'fi',
]
c = c[:fi_end] + nl + nl.join(verify_lines) + c[fi_end:]

with io.open(p, 'w', encoding='utf-8', newline='') as f:
    f.write(c)
print('self-update.sh patched')

# ════ Layer 2: brain-server.js /restart + /savererun stale-flag clear ════
p2 = 'server/brain-server.js'
with io.open(p2, 'r', encoding='utf-8', newline='') as f:
    c2 = f.read()
nl2 = '\r\n' if '\r\n' in c2[:2000] else '\n'

# /restart handler
old_r = ("    if (global._brainShutdownRequested) { res.end(JSON.stringify({ status: 'already restarting' })); return; }" + nl2
         + "    global._brainShutdownRequested = true;" + nl2
         + "    console.log('[Brain] HTTP /restart — operator requested RESTART+RESUME (dashboard). Force-saving + marking resume, then exiting for systemd to revive.');")
assert c2.count(old_r) == 1, '/restart guard not unique: %d' % c2.count(old_r)
new_r_src = '''    // TU.30 — STALE-FLAG CLEAR (the interlock that broke every Update button): the /update
    // handler sets _brainShutdownRequested BEFORE spawning self-update.sh, and this guard
    // then swallowed the script's own loopback /restart as "already restarting" — so the
    // overlay landed but the process NEVER exited (uptime kept climbing on old code). If
    // the flag is older than 60s and we are demonstrably still alive, the prior exit never
    // happened — clear it and proceed (same WL.4 staleness pattern as /update itself).
    if (global._brainShutdownRequested) {
      const _ageMs = global._brainShutdownRequestedAt ? (Date.now() - global._brainShutdownRequestedAt) : Infinity;
      if (_ageMs > 60000) {
        console.warn(`[Brain] /restart — clearing STALE shutdown flag (set ${Math.round(_ageMs / 1000)}s ago; the prior restart never exited). Proceeding with this restart.`);
        global._brainShutdownRequested = false;
      } else {
        res.end(JSON.stringify({ status: 'already restarting' })); return;
      }
    }
    global._brainShutdownRequested = true;
    global._brainShutdownRequestedAt = Date.now();
    console.log('[Brain] HTTP /restart — operator requested RESTART+RESUME (dashboard). Force-saving + marking resume, then exiting for systemd to revive.');'''
c2 = c2.replace(old_r, new_r_src.replace('\n', nl2))

# /savererun handler — same pattern
old_s = ("    if (global._brainShutdownRequested) { res.end(JSON.stringify({ status: 'already restarting' })); return; }" + nl2
         + "    try {" + nl2
         + "      const cortex = brain.cortexCluster;")
assert c2.count(old_s) == 1, '/savererun guard not unique: %d' % c2.count(old_s)
new_s_src = '''    // TU.30 — same stale-flag clear as /restart (see comment there).
    if (global._brainShutdownRequested) {
      const _ageMs = global._brainShutdownRequestedAt ? (Date.now() - global._brainShutdownRequestedAt) : Infinity;
      if (_ageMs > 60000) {
        console.warn(`[Brain] /savererun — clearing STALE shutdown flag (set ${Math.round(_ageMs / 1000)}s ago; the prior restart never exited). Proceeding.`);
        global._brainShutdownRequested = false;
      } else {
        res.end(JSON.stringify({ status: 'already restarting' })); return;
      }
    }
    try {
      const cortex = brain.cortexCluster;'''
c2 = c2.replace(old_s, new_s_src.replace('\n', nl2))

with io.open(p2, 'w', encoding='utf-8', newline='') as f:
    f.write(c2)
print('brain-server.js patched')
