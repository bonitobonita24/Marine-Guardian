#!/usr/bin/env bash
# design-stop-hook.sh — Claude Code Stop hook (framework deliverable #21)
#
# PURPOSE:
#   Blocks a "done/fixed" claim whose evidence block is empty or missing
#   captured_output. Implements Rule 32 "Verifiable-Done" enforcement.
#
# DEPLOYED TO:
#   scripts/design-stop-hook.sh (chmod +x) in target app projects via deploy-v31.sh
#
# HOW IT WORKS:
#   A Claude Code Stop hook receives the assistant's final response on stdin as JSON.
#   This script parses the response text, looks for a "done" or "fixed" claim in a
#   YAML evidence block, and exits non-zero (blocking) if captured_output is absent
#   or empty. Exit 0 = allow the stop; non-zero = block it with a message.
#
# EVIDENCE SCHEMA (from templates.md §V32.8):
#   evidence:
#     contract:        "human-readable acceptance criteria"
#     check_command:   "the exact command that was run"
#     captured_output: |
#       <real terminal output pasted here>
#
# SHELLCHECK-CLEAN: uses #!/usr/bin/env bash, set -euo pipefail, quoted expansions.

set -euo pipefail

STATE_FILE="docs/STATE.md"
BLOCK_MSG="Done-claim blocked: evidence field is empty or captured_output is missing.
Run the acceptance check, capture the real terminal output, and populate
evidence.contract + evidence.check_command + evidence.captured_output
before claiming done. See templates.md §V32.8 Verification."

# ── 0. Guard: no STATE.md → nothing to check, allow ─────────────────────────
if [[ ! -f "${STATE_FILE}" ]]; then
  exit 0
fi

# ── 1. Read assistant response from stdin (JSON: {"stop_reason":…,"message":…}) ──
#   We only need the text content; extract it with grep/sed to avoid a jq dependency.
#   If stdin is empty or unparseable we allow (fail-open, hook is advisory).
response_text=""
if read -r -t 2 first_line 2>/dev/null; then
  # Collect the rest of stdin (may be multi-line JSON)
  response_text="${first_line}"
  while IFS= read -r -t 2 line 2>/dev/null; do
    response_text="${response_text}
${line}"
  done || true
fi

# ── 2. Does the response contain a done/fixed claim? ─────────────────────────
#   Matches phrases like "done", "fixed", "complete", "✅ done", "task complete".
#   Case-insensitive, bounded to avoid false-positives on random prose.
done_pattern='(done|fixed|complete|completed|✅)'
if ! echo "${response_text}" | grep -qiE "${done_pattern}"; then
  # No done-claim in this response → not subject to the evidence gate
  exit 0
fi

# ── 3. Check STATE.md for a done-claim with an empty evidence block ───────────
#   A populated evidence block MUST have a non-empty captured_output value.
#   We look for the pattern:
#     captured_output: (empty, |, null, {}, or ~)
#   which indicates the field was not actually filled in.

empty_evidence_pattern='captured_output:[[:space:]]*(|[|]|null|\{\}|~)[[:space:]]*$'

if grep -qE "${empty_evidence_pattern}" "${STATE_FILE}"; then
  echo "[design-stop-hook] BLOCKED: ${BLOCK_MSG}" >&2
  exit 1
fi

# ── 4. Check that evidence block exists at all in STATE.md ───────────────────
#   If there is a done-claim in the response but STATE.md has no evidence: section,
#   that is also a violation.
if ! grep -q 'evidence:' "${STATE_FILE}"; then
  echo "[design-stop-hook] BLOCKED: STATE.md has no evidence: block. ${BLOCK_MSG}" >&2
  exit 1
fi

# ── 5. All checks passed → allow the stop ────────────────────────────────────
exit 0
