#!/usr/bin/env bash
# =============================================================================
# sync-context.sh — Powerbyte fleet managed-context regenerator (V32.20, deliverable #27)
#
# Rewrites ONLY the text between the AIEF:MANAGED markers in a target file
# (default: CLAUDE.md at project root), preserving everything else byte-for-
# byte. Mirrors lint-design.sh (#26) / lint-deploy.sh (#20) house style: same
# shebang/flag/exit-code shape, same role — a cheap, deterministic, idempotent
# regenerator invoked from the Memory Governance Smart Checkpoint hook (see
# memory-governance.md §2 Target 1 / §3 Hook Text POST).
#
# Usage:
#   bash scripts/sync-context.sh                 # regenerate CLAUDE.md in place (no-op if unchanged)
#   bash scripts/sync-context.sh --check          # dry-run: exit 0 if unchanged, exit 3 if it would change
#   bash scripts/sync-context.sh --file <relpath> # target a different project-relative file
#
# Exit codes:
#   0 — unchanged (idempotent no-op) OR successfully (re)written
#   1 — usage / path-hardening error (bad --file, corrupt markers, etc.)
#   3 — (--check only) rendered block differs from what's on disk
#
# Sources read (project-relative, best-effort — a missing source means that
# line is skipped, this script NEVER fails because a source file is absent):
#   docs/STATE.md (fallback .cline/STATE.md)   → PHASE, LAST_DONE, NEXT,
#                                                 BLOCKERS, GIT_BRANCH, Updated:
#   docs/DECISIONS_LOG.md (fallback docs/PRODUCT.md) → locked-stack line
#   docs/CHANGELOG_AI.md                       → last 3 entry headlines
#
# IDEMPOTENCY CONTRACT (mandatory — see AIEF CLAUDE.md H1 spec):
#   The rendered block is a PURE FUNCTION of the source files above. The only
#   "rev" identifier permitted in the block is docs/STATE.md's `Updated:`
#   field, falling back to `git rev-parse --short HEAD` — NEVER `date`. If the
#   newly-rendered inner block is byte-identical to what's already between the
#   markers, the file is NOT touched (no write, no mtime change, no .bak).
# =============================================================================

set -euo pipefail

# ── Args ─────────────────────────────────────────────────────────────────────
MODE="write"        # write | check
REL_FILE="CLAUDE.md"
while [ $# -gt 0 ]; do
  case "$1" in
    --check) MODE="check"; shift ;;
    --file)
      [ $# -ge 2 ] || { printf "Error: --file requires an argument\n" >&2; exit 1; }
      REL_FILE="$2"; shift 2 ;;
    -*) printf "Unknown flag: %s\n" "$1" >&2; exit 1 ;;
    *)  printf "Unexpected argument: %s\n" "$1" >&2; exit 1 ;;
  esac
done

# ── Colour helpers (mirrors lint-design.sh) ──────────────────────────────────
if [ -t 1 ]; then
  RST=$'\033[0m'; RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; CYN=$'\033[36m'
else RST=""; RED=""; GRN=""; YLW=""; CYN=""; fi

# ── PATH HARDENING ────────────────────────────────────────────────────────────
# Reject absolute paths and `..` traversal outright.
case "$REL_FILE" in
  /*) printf "%bError:%b --file must be project-relative, not absolute: %s\n" "$RED" "$RST" "$REL_FILE" >&2; exit 1 ;;
esac
case "$REL_FILE" in
  *..*) printf "%bError:%b --file must not contain '..': %s\n" "$RED" "$RST" "$REL_FILE" >&2; exit 1 ;;
esac

PROJECT_ROOT="$(pwd -P)"
TARGET="$PROJECT_ROOT/$REL_FILE"

# Resolve the target's real path (if it exists) and assert it stays inside root.
# If the file doesn't exist yet, resolve its parent dir instead.
if [ -e "$TARGET" ]; then
  RESOLVED_DIR="$(cd "$(dirname "$TARGET")" 2>/dev/null && pwd -P)" || {
    printf "%bError:%b cannot resolve directory of --file target: %s\n" "$RED" "$RST" "$REL_FILE" >&2; exit 1; }
  RESOLVED="$RESOLVED_DIR/$(basename "$TARGET")"
  # Refuse symlinks that escape the project root.
  if [ -L "$TARGET" ]; then
    LINK_REAL="$(readlink -f "$TARGET" 2>/dev/null || true)"
    case "$LINK_REAL" in
      "$PROJECT_ROOT"/*) : ;; # fine, stays inside root
      *) printf "%bError:%b --file is a symlink escaping project root: %s\n" "$RED" "$RST" "$REL_FILE" >&2; exit 1 ;;
    esac
  fi
else
  PARENT_DIR="$(dirname "$TARGET")"
  mkdir -p "$PARENT_DIR" 2>/dev/null || true
  RESOLVED_DIR="$(cd "$PARENT_DIR" 2>/dev/null && pwd -P)" || {
    printf "%bError:%b cannot resolve parent directory for --file target: %s\n" "$RED" "$RST" "$REL_FILE" >&2; exit 1; }
  RESOLVED="$RESOLVED_DIR/$(basename "$TARGET")"
fi
case "$RESOLVED_DIR" in
  "$PROJECT_ROOT"|"$PROJECT_ROOT"/*) : ;;
  *) printf "%bError:%b resolved target escapes project root: %s\n" "$RED" "$RST" "$REL_FILE" >&2; exit 1 ;;
esac

START_MARKER="<!-- AIEF:MANAGED START -->"
END_MARKER="<!-- AIEF:MANAGED END -->"

# ── Source readers (best-effort — missing source = empty value, never fail) ──
read_state_field() { # read_state_field <FIELD_NAME>
  local field="$1" f=""
  for cand in "docs/STATE.md" ".cline/STATE.md"; do
    if [ -f "$PROJECT_ROOT/$cand" ]; then f="$PROJECT_ROOT/$cand"; break; fi
  done
  [ -n "$f" ] || return 0
  # Matches lines like "PHASE: 4" or "- PHASE: 4" or "**PHASE:** 4"
  grep -m1 -iE "(^|[^A-Za-z])${field}:" "$f" 2>/dev/null \
    | sed -E "s/.*${field}:\**[[:space:]]*//I" \
    | sed -E 's/\*\*[[:space:]]*$//' \
    | sed -E 's/[[:space:]]+$//' || true
}

PHASE="$(read_state_field "PHASE")"
LAST_DONE="$(read_state_field "LAST_DONE")"
NEXT="$(read_state_field "NEXT")"
BLOCKERS="$(read_state_field "BLOCKERS")"
GIT_BRANCH="$(read_state_field "GIT_BRANCH")"
UPDATED="$(read_state_field "Updated")"

# Locked-stack line: docs/DECISIONS_LOG.md first, then docs/PRODUCT.md.
LOCKED_STACK=""
for cand in "docs/DECISIONS_LOG.md" "docs/PRODUCT.md"; do
  if [ -f "$PROJECT_ROOT/$cand" ]; then
    LOCKED_STACK="$(grep -m1 -iE 'locked.stack' "$PROJECT_ROOT/$cand" 2>/dev/null | sed -E 's/^[#*>[:space:]-]+//' | sed -E 's/^\**locked[ -]*stack\**[[:space:]]*:?\**[[:space:]]*//I' || true)"
    [ -n "$LOCKED_STACK" ] && break
  fi
done

# Last 3 CHANGELOG_AI.md entry headlines (lines starting with "## " or "### ").
CHANGELOG_LINES=""
if [ -f "$PROJECT_ROOT/docs/CHANGELOG_AI.md" ]; then
  CHANGELOG_LINES="$(grep -E '^#{2,3}[[:space:]]' "$PROJECT_ROOT/docs/CHANGELOG_AI.md" 2>/dev/null \
    | sed -E 's/^#{2,3}[[:space:]]*//' | tail -n 3 || true)"
fi

# Rev: STATE.md Updated: field, else short git HEAD, else "unknown". Never `date`.
REV="$UPDATED"
if [ -z "$REV" ]; then
  REV="$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || true)"
fi
[ -n "$REV" ] || REV="unknown"

# ── Render the managed inner block (pure function of the sources above) ─────
render_block() {
  printf '%s\n' "$START_MARKER"
  printf '%s\n' "<!-- Auto-generated by scripts/sync-context.sh — do not edit between markers. Everything else is human-owned. Source rev: ${REV} -->"
  printf '%s\n' ""
  printf '%s\n' "**Phase:** ${PHASE:-unknown}"
  printf '%s\n' "**Locked stack:** ${LOCKED_STACK:-(none recorded)}"
  printf '%s\n' "**Last done:** ${LAST_DONE:-(none recorded)}"
  printf '%s\n' "**Next:** ${NEXT:-(none recorded)}"
  printf '%s\n' "**Blockers:** ${BLOCKERS:-(none)}"
  if [ -n "$GIT_BRANCH" ]; then
    printf '%s\n' "**Git branch:** ${GIT_BRANCH}"
  fi
  printf '%s\n' ""
  printf '%s\n' "**Recent CHANGELOG:**"
  if [ -n "$CHANGELOG_LINES" ]; then
    printf '%s\n' "$CHANGELOG_LINES" | sed 's/^/- /'
  else
    printf '%s\n' "- (no docs/CHANGELOG_AI.md entries found)"
  fi
  printf '%s\n' ""
  printf '%s\n' "$END_MARKER"
}

NEW_BLOCK="$(render_block)"

# ── Read existing file + locate markers ──────────────────────────────────────
EXISTING=""
if [ -f "$RESOLVED" ]; then
  EXISTING="$(cat "$RESOLVED")"
fi

HAS_START=0; HAS_END=0
if printf '%s' "$EXISTING" | grep -qF "$START_MARKER"; then HAS_START=1; fi
if printf '%s' "$EXISTING" | grep -qF "$END_MARKER"; then HAS_END=1; fi

if [ "$HAS_START" -eq 1 ] && [ "$HAS_END" -eq 0 ]; then
  printf "%bError:%b found START marker without END marker in %s — corrupt file, aborting without writing.\n" "$RED" "$RST" "$REL_FILE" >&2
  exit 1
fi
if [ "$HAS_START" -eq 0 ] && [ "$HAS_END" -eq 1 ]; then
  printf "%bError:%b found END marker without START marker in %s — corrupt file, aborting without writing.\n" "$RED" "$RST" "$REL_FILE" >&2
  exit 1
fi

# ── Compose the rendered full-file content ───────────────────────────────────
if [ "$HAS_START" -eq 1 ] && [ "$HAS_END" -eq 1 ]; then
  # Replace the region between (and including) the markers with NEW_BLOCK,
  # preserving everything before/after byte-for-byte.
  RENDERED="$(awk -v start="$START_MARKER" -v end="$END_MARKER" -v block="$NEW_BLOCK" '
    BEGIN { in_block = 0; printed_block = 0 }
    {
      if (index($0, start) > 0 && in_block == 0) {
        print block
        in_block = 1
        printed_block = 1
        next
      }
      if (in_block == 1) {
        if (index($0, end) > 0) { in_block = 0 }
        next
      }
      print
    }
  ' <<<"$EXISTING")"
else
  # No markers present: append the section at EOF.
  if [ -n "$EXISTING" ]; then
    RENDERED="$(printf '%s\n\n%s\n' "$EXISTING" "$NEW_BLOCK")"
  else
    RENDERED="$(printf '%s\n' "$NEW_BLOCK")"
  fi
fi

# ── Idempotency check: compare rendered output to what's on disk ────────────
if [ -f "$RESOLVED" ] && [ "$RENDERED" = "$EXISTING" ]; then
  printf "%b sync-context:%b %s unchanged (idempotent no-op)\n" "$GRN" "$RST" "$REL_FILE"
  exit 0
fi

if [ "$MODE" = "check" ]; then
  printf "%b sync-context --check:%b %s would change\n" "$YLW" "$RST" "$REL_FILE"
  exit 3
fi

# ── Write atomically: temp file + mv ─────────────────────────────────────────
TMP="$(mktemp "${RESOLVED}.tmp.XXXXXX")"
printf '%s\n' "$RENDERED" > "$TMP"
mv -f "$TMP" "$RESOLVED"
printf "%b sync-context:%b %s regenerated (managed region updated)\n" "$CYN" "$RST" "$REL_FILE"
exit 0
