#!/usr/bin/env bash
# =============================================================================
# spec-gap-check.sh — Powerbyte fleet cross-artifact gap-check (V32.21, deliverable #28)
#
# Compares the spec-persistence artifact set — docs/PRODUCT.md, prisma schema,
# docs/IMPLEMENTATION_MAP.md, docs/STATE.md, inputs.yml — against each other and
# reports deterministic desync classes. Mirrors sync-context.sh (#27) / lint-design.sh
# (#26) / lint-deploy.sh (#20) house style: same shebang/flag/exit-code shape, same
# role — a cheap, deterministic, pure-bash gate. Complements Master_Prompt.md Rule 1's
# LIVING-SPEC model (V32.21 "Spec-Persistence Model" addendum): PRODUCT.md is the
# contract, inputs.yml/schema/IMPLEMENTATION_MAP are disposable derivations regenerated
# from it — this script is the gap-detector that tells you when a derivation has
# drifted from the contract, or the contract has drifted from reality (Flow-Back).
#
# Usage:
#   bash scripts/spec-gap-check.sh                  # --report-only (default): print
#                                                     # GAP_REPORT, always exit 0
#   bash scripts/spec-gap-check.sh --report-only     # same as above, explicit
#   bash scripts/spec-gap-check.sh --check           # dry-run: exit 3 if any desync found
#   bash scripts/spec-gap-check.sh --file <relpath>  # target a different project-relative
#                                                     # PRODUCT.md (default: docs/PRODUCT.md)
#
# Exit codes:
#   0 — --report-only (always) OR --check found no desync
#   1 — usage / path-hardening error (bad --file, corrupt input, etc.)
#   3 — (--check only) at least one desync class produced a finding
#
# ADVISORY CONTRACT (mandatory — mirrors sync-context.sh's idempotency contract):
#   This script NEVER writes to any file. It is read-only, best-effort (a missing
#   source file means that check is skipped, never a hard failure), and NEVER gates
#   a phase — phases.md's V32.21 MODEL HOOK surfaces its output for information only.
#   Running it twice against unchanged sources produces byte-identical output.
# =============================================================================

set -euo pipefail

# ── Args ─────────────────────────────────────────────────────────────────────
MODE="report"          # report | check
REL_FILE="docs/PRODUCT.md"
while [ $# -gt 0 ]; do
  case "$1" in
    --report-only) MODE="report"; shift ;;
    --check) MODE="check"; shift ;;
    --file)
      [ $# -ge 2 ] || { printf "Error: --file requires an argument\n" >&2; exit 1; }
      REL_FILE="$2"; shift 2 ;;
    -*) printf "Unknown flag: %s\n" "$1" >&2; exit 1 ;;
    *)  printf "Unexpected argument: %s\n" "$1" >&2; exit 1 ;;
  esac
done

# ── Colour helpers (mirrors lint-design.sh / sync-context.sh) ────────────────
if [ -t 1 ]; then
  RST=$'\033[0m'; RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'
else RST=""; RED=""; GRN=""; YLW=""; fi

# ── PATH HARDENING ────────────────────────────────────────────────────────────
# Reject absolute paths and `..` traversal outright.
case "$REL_FILE" in
  /*) printf "%bError:%b --file must be project-relative, not absolute: %s\n" "$RED" "$RST" "$REL_FILE" >&2; exit 1 ;;
esac
case "$REL_FILE" in
  *..*) printf "%bError:%b --file must not contain '..': %s\n" "$RED" "$RST" "$REL_FILE" >&2; exit 1 ;;
esac

PROJECT_ROOT="$(pwd -P)"
PRODUCT_TARGET="$PROJECT_ROOT/$REL_FILE"

# Resolve the target's real path (if it exists) and assert it stays inside root.
if [ -e "$PRODUCT_TARGET" ]; then
  RESOLVED_DIR="$(cd "$(dirname "$PRODUCT_TARGET")" 2>/dev/null && pwd -P)" || {
    printf "%bError:%b cannot resolve directory of --file target: %s\n" "$RED" "$RST" "$REL_FILE" >&2; exit 1; }
  RESOLVED="$RESOLVED_DIR/$(basename "$PRODUCT_TARGET")"
  # Refuse symlinks that escape the project root.
  if [ -L "$PRODUCT_TARGET" ]; then
    LINK_REAL="$(readlink -f "$PRODUCT_TARGET" 2>/dev/null || true)"
    case "$LINK_REAL" in
      "$PROJECT_ROOT"/*) : ;; # fine, stays inside root
      *) printf "%bError:%b --file is a symlink escaping project root: %s\n" "$RED" "$RST" "$REL_FILE" >&2; exit 1 ;;
    esac
  fi
else
  RESOLVED=""
fi
if [ -n "$RESOLVED" ]; then
  case "$RESOLVED_DIR" in
    "$PROJECT_ROOT"|"$PROJECT_ROOT"/*) : ;;
    *) printf "%bError:%b resolved target escapes project root: %s\n" "$RED" "$RST" "$REL_FILE" >&2; exit 1 ;;
  esac
fi

# ── Best-effort locate the other 4 artifacts (project-relative, missing = skip) ──
IMPL_MAP="$PROJECT_ROOT/docs/IMPLEMENTATION_MAP.md"
STATE_MD="$PROJECT_ROOT/docs/STATE.md"
INPUTS_YML="$PROJECT_ROOT/inputs.yml"

PRISMA_SCHEMA=""
for cand in "packages/db/prisma/schema.prisma" "prisma/schema.prisma"; do
  if [ -f "$PROJECT_ROOT/$cand" ]; then PRISMA_SCHEMA="$PROJECT_ROOT/$cand"; break; fi
done

FINDINGS=0
REPORT=""

add_finding() { # add_finding <CLASS> <line>
  FINDINGS=$((FINDINGS + 1))
  REPORT="${REPORT}$1: $2"$'\n'
}

# ── DESYNC CLASS 1 — Prisma `model X` set vs PRODUCT.md entity/section names ──
if [ -n "$PRISMA_SCHEMA" ] && [ -n "$RESOLVED" ] && [ -f "$RESOLVED" ]; then
  SCHEMA_MODELS="$(grep -oE '^model[[:space:]]+[A-Za-z_][A-Za-z0-9_]*' "$PRISMA_SCHEMA" 2>/dev/null \
    | awk '{print $2}' | sort -u || true)"
  # PRODUCT.md entities = capitalized single-word bullet-list items (the "Data Entities"
  # list is a bullet list, NOT headers) — matching only headers cried wolf on every model.
  PRODUCT_ENTITIES="$(grep -oE '^[[:space:]]*[-*][[:space:]]+[A-Z][A-Za-z0-9_]*' "$RESOLVED" 2>/dev/null \
    | sed -E 's/^[[:space:]]*[-*][[:space:]]+//' | tr -d '\r' | sort -u || true)"

  # Forward: a Prisma model absent from the WHOLE PRODUCT.md text (whole-word) = real drift.
  if [ -n "$SCHEMA_MODELS" ]; then
    while IFS= read -r model; do
      [ -z "$model" ] && continue
      if ! grep -qiwF "$model" "$RESOLVED" 2>/dev/null; then
        add_finding "DRIFT (schema not in spec)" "Prisma model '$model' has no matching entity in $REL_FILE"
      fi
    done <<< "$SCHEMA_MODELS"
  fi

  # Reverse: a PRODUCT.md entity bullet with no matching Prisma model = unbuilt entity.
  if [ -n "$PRODUCT_ENTITIES" ]; then
    while IFS= read -r entity; do
      [ -z "$entity" ] && continue
      if ! printf '%s\n' "$SCHEMA_MODELS" | grep -qiwF "$entity"; then
        add_finding "UNBUILT (spec entity not in schema)" "$REL_FILE entity '$entity' has no matching Prisma model in $(basename "$PRISMA_SCHEMA")"
      fi
    done <<< "$PRODUCT_ENTITIES"
  fi
fi

# ── DESYNC CLASS 2 — PRODUCT.md feature/section headers vs IMPLEMENTATION_MAP.md ──
if [ -f "$IMPL_MAP" ] && [ -n "$RESOLVED" ] && [ -f "$RESOLVED" ]; then
  PRODUCT_HEADERS="$(grep -oE '^#{2,3}[[:space:]]+.+' "$RESOLVED" 2>/dev/null \
    | sed -E 's/^#{2,3}[[:space:]]+//' | tr -d '\r' | sort -u || true)"
  if [ -n "$PRODUCT_HEADERS" ]; then
    while IFS= read -r header; do
      [ -z "$header" ] && continue
      if ! grep -qiF "$header" "$IMPL_MAP" 2>/dev/null; then
        add_finding "UNBUILT" "$REL_FILE feature/section '$header' has no corresponding entry in docs/IMPLEMENTATION_MAP.md"
      fi
    done <<< "$PRODUCT_HEADERS"
  fi
fi

# ── DESYNC CLASS 3 — STATE.md phase field vs IMPLEMENTATION_MAP completion state ──
if [ -f "$STATE_MD" ] && [ -f "$IMPL_MAP" ]; then
  STATE_PHASE="$(grep -m1 -iE '(^|[^A-Za-z])PHASE:' "$STATE_MD" 2>/dev/null \
    | sed -E 's/.*PHASE:\**[[:space:]]*//I' | sed -E 's/[[:space:]]+$//' || true)"
  # Reality check: if STATE.md claims a late phase (5/6/7/8) but IMPLEMENTATION_MAP
  # still shows any BLOCKED/PARTIAL/TODO area, that's a phase/reality mismatch.
  if [ -n "$STATE_PHASE" ]; then
    case "$STATE_PHASE" in
      *5*|*6*|*7*|*8*)
        UNRESOLVED="$(grep -ciE 'BLOCKED|PARTIAL|TODO|NOT[[:space:]]+STARTED' "$IMPL_MAP" 2>/dev/null || true)"
        [ -z "$UNRESOLVED" ] && UNRESOLVED=0
        if [ "$UNRESOLVED" -gt 0 ]; then
          add_finding "PHASE/REALITY MISMATCH" "docs/STATE.md PHASE='$STATE_PHASE' but docs/IMPLEMENTATION_MAP.md has $UNRESOLVED BLOCKED/PARTIAL/TODO/NOT-STARTED area(s)"
        fi
        ;;
    esac
  fi
fi

# ── DESYNC CLASS 4 — inputs.yml top-level keys vs PRODUCT.md ─────────────────
if [ -f "$INPUTS_YML" ] && [ -n "$RESOLVED" ] && [ -f "$RESOLVED" ]; then
  # Top-level YAML keys: lines with no leading whitespace, ending in ':'
  YML_KEYS="$(grep -oE '^[A-Za-z_][A-Za-z0-9_]*:' "$INPUTS_YML" 2>/dev/null \
    | sed -E 's/:$//' | sort -u || true)"
  if [ -n "$YML_KEYS" ]; then
    while IFS= read -r key; do
      [ -z "$key" ] && continue
      if ! grep -qiF "$key" "$RESOLVED" 2>/dev/null; then
        add_finding "DERIVATION DRIFT" "inputs.yml top-level key '$key' has no mention anywhere in $REL_FILE"
      fi
    done <<< "$YML_KEYS"
  fi
fi

# ── Render GAP_REPORT ─────────────────────────────────────────────────────────
render_report() {
  printf '%s\n' "GAP_REPORT (spec-gap-check.sh — advisory, non-blocking)"
  printf '%s\n' "Sources checked (best-effort — missing source = that check skipped):"
  printf '%s\n' "  PRODUCT.md:            ${REL_FILE} $( [ -n "$RESOLVED" ] && [ -f "$RESOLVED" ] && echo '(found)' || echo '(missing — skipped)' )"
  printf '%s\n' "  Prisma schema:         ${PRISMA_SCHEMA:-(not found — skipped)}"
  printf '%s\n' "  IMPLEMENTATION_MAP.md: $( [ -f "$IMPL_MAP" ] && echo 'docs/IMPLEMENTATION_MAP.md (found)' || echo '(missing — skipped)' )"
  printf '%s\n' "  STATE.md:              $( [ -f "$STATE_MD" ] && echo 'docs/STATE.md (found)' || echo '(missing — skipped)' )"
  printf '%s\n' "  inputs.yml:            $( [ -f "$INPUTS_YML" ] && echo 'inputs.yml (found)' || echo '(missing — skipped)' )"
  printf '%s\n' ""
  if [ "$FINDINGS" -eq 0 ]; then
    printf '%b%s%b\n' "$GRN" "✅ no cross-artifact gaps found" "$RST"
  else
    printf '%b%s%b\n' "$YLW" "🔍 Cross-Artifact Gaps — $FINDINGS finding(s)" "$RST"
    printf '%s' "$REPORT"
  fi
}

render_report

if [ "$MODE" = "check" ] && [ "$FINDINGS" -gt 0 ]; then
  exit 3
fi

exit 0
