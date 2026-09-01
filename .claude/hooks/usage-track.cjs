#!/usr/bin/env node
// .claude/hooks/usage-track.cjs
//
// Stop hook. Fires on every turn boundary. Captures per-turn usage data from
// the transcript JSONL and appends a structured entry to
// .claude/.session-usage.jsonl for downstream awareness.
//
// IMPORTANT CAVEATS (per docs/HOOKS.html research):
//   - Hook payloads do NOT include token counts. We get them from the
//     transcript file via the `transcript_path` field on stdin.
//   - The transcript JSONL has a streaming-placeholder bug: `input_tokens`
//     and `output_tokens` are SEVERELY undercounted (~100x for input,
//     ~10-17x for output) on most entries. Treat them as rough RELATIVE
//     trend indicators, not absolute counts.
//   - `cache_creation_input_tokens` and `cache_read_input_tokens` ARE
//     accurate (populated from initial API response, not streaming updates).
//   - For authoritative session totals, the user runs Claude Code's native
//     `/usage` slash command — we don't replace it, we complement it with
//     in-conversation awareness.
//
// Pure enablement. Exit 0 always.
//
// Bash fallback sibling: usage-track.sh

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function safe(cmd, opts) {
  try { return execSync(cmd, Object.assign({ encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }, opts || {})).trim(); }
  catch (e) { return null; }
}

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch (e) { return ''; }
}

// SCRIPTKILL.2 (2026-08-20) — BOUND THE LEDGER. This hook fires on every turn
// boundary and appended forever with no rotation: 2.5 MB and ~6,700 lines by the
// time anyone looked, growing for as long as the project lives. It is the one
// file in .claude/ that re-bloats on its own after a cleanup, which is exactly
// why it was filed instead of just deleted.
//
// Keep the TAIL, not the head — the recent turns are the useful ones (the
// statusline reads the last entries), and old turns are already archived in the
// FINALIZED/NOW ledgers.
//
// The TRIGGER is bytes and the UNIT KEPT is whole lines, on purpose. Bytes,
// because "2.5 MB and climbing" is the actual complaint and a byte ceiling is
// the only thing that guarantees it. Whole lines, because a half-line left at
// the front would poison every reader that parses this as JSONL. My first cut
// had the cap in lines and the trigger in bytes — a test with small entries
// walked straight past it, which is exactly the kind of gate that reads correct
// and enforces nothing.
const USAGE_MAX_BYTES = Number(process.env.UNITY_USAGE_MAX_BYTES) > 0
  ? Number(process.env.UNITY_USAGE_MAX_BYTES)
  : 1024 * 1024;
const USAGE_KEEP_LINES = Number(process.env.UNITY_USAGE_KEEP_LINES) > 0
  ? Number(process.env.UNITY_USAGE_KEEP_LINES)
  : 2000;

function appendUsage(file, entry) {
  try {
    fs.appendFileSync(file, JSON.stringify(entry) + '\n');
  } catch (e) {
    process.stderr.write('[usage-track] Failed to append: ' + e.message + '\n');
    return;
  }
  // Cheap gate: one statSync per turn. The file is only read back when it is
  // genuinely over the byte ceiling, so the common path stays append-only.
  try {
    const st = fs.statSync(file);
    if (st.size <= USAGE_MAX_BYTES) return;
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    if (lines.length <= USAGE_KEEP_LINES) return;   // huge entries, few of them — leave it alone
    const kept = lines.slice(-USAGE_KEEP_LINES);
    // Write via a temp file + rename so a crash mid-trim cannot leave the ledger
    // truncated in place — the reader either sees the old file or the new one.
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, kept.join('\n') + '\n');
    fs.renameSync(tmp, file);
    process.stderr.write('[usage-track] rotated .session-usage.jsonl: kept the newest '
      + kept.length + ' of ' + lines.length + ' entries (was '
      + (st.size / 1048576).toFixed(2) + 'MB, ceiling '
      + (USAGE_MAX_BYTES / 1048576).toFixed(2) + 'MB; override with '
      + 'UNITY_USAGE_MAX_BYTES / UNITY_USAGE_KEEP_LINES)\n');
  } catch (e) {
    // A failed trim must never break the turn — the ledger just stays long.
    process.stderr.write('[usage-track] rotation skipped: ' + e.message + '\n');
  }
}

function firstInProgress(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const c = fs.readFileSync(filePath, 'utf8');
  const m = c.match(/^###?\s*\[~\]\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

// Parse the last assistant message entry from a JSONL transcript that has
// a usage object. Walks the file backwards conceptually — we read all and
// take the last match, which is fast enough for typical transcript sizes.
function lastAssistantUsage(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
  let raw;
  try { raw = fs.readFileSync(transcriptPath, 'utf8'); } catch (e) { return null; }
  const lines = raw.split(/\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try { entry = JSON.parse(lines[i]); } catch (e) { continue; }
    // Schema varies slightly across Claude Code versions; try common shapes
    const usage = entry.usage
      || (entry.message && entry.message.usage)
      || null;
    if (usage && (usage.input_tokens != null || usage.output_tokens != null
                  || usage.cache_read_input_tokens != null
                  || usage.cache_creation_input_tokens != null)) {
      return {
        usage: usage,
        model: entry.model || (entry.message && entry.message.model) || null,
        message_id: entry.message_id || (entry.message && entry.message.id) || null,
        entry_type: entry.type || null
      };
    }
  }
  return null;
}

(function main() {
  const root = process.cwd();
  const raw = readStdin();
  let payload = {};
  try { payload = JSON.parse(raw || '{}'); } catch (e) {}

  const transcriptPath = payload.transcript_path || '';
  const sessionId = payload.session_id || 'unknown';
  const stamp = new Date().toISOString();

  // Pull last assistant usage entry from transcript
  const last = lastAssistantUsage(transcriptPath);
  if (!last) {
    // No usage data available yet — write a minimal entry so the JSONL
    // tracks turn count even when usage is missing
    const entry = {
      ts: stamp,
      session_id: sessionId,
      input_tokens: null,
      output_tokens: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      model: null,
      active_major: firstInProgress(path.join(root, 'docs', 'ROADMAP.md')),
      active_minor: firstInProgress(path.join(root, 'docs', 'TODO.md')),
      active_decomposed: firstInProgress(path.join(root, 'docs', 'DECOMPOSED.md')),
      branch: safe('git rev-parse --abbrev-ref HEAD', { cwd: root }) || null,
      note: 'no_usage_in_transcript'
    };
    appendUsage(path.join(root, '.claude', '.session-usage.jsonl'), entry);
    process.exit(0);
  }

  const u = last.usage;
  const entry = {
    ts: stamp,
    session_id: sessionId,
    message_id: last.message_id,
    model: last.model,
    // Tokens — undercounted per known bug, but useful as relative trend
    input_tokens: u.input_tokens != null ? u.input_tokens : null,
    output_tokens: u.output_tokens != null ? u.output_tokens : null,
    // Cache fields — accurate per research
    cache_creation_input_tokens: u.cache_creation_input_tokens != null ? u.cache_creation_input_tokens : null,
    cache_read_input_tokens: u.cache_read_input_tokens != null ? u.cache_read_input_tokens : null,
    // Active task context — pulled from the three-tier cascade
    active_major: firstInProgress(path.join(root, 'docs', 'ROADMAP.md')),
    active_minor: firstInProgress(path.join(root, 'docs', 'TODO.md')),
    active_decomposed: firstInProgress(path.join(root, 'docs', 'DECOMPOSED.md')),
    // Branch context
    branch: safe('git rev-parse --abbrev-ref HEAD', { cwd: root }) || null
  };

  appendUsage(path.join(root, '.claude', '.session-usage.jsonl'), entry);

  process.exit(0);
})();
