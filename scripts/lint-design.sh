#!/usr/bin/env bash
# =============================================================================
# lint-design.sh — Powerbyte fleet design anti-slop gate (V32.17, deliverable #26)
#
# Static "AI-slop" linter for emitted UI. Catches the 7 cardinal sins that mark
# default-LLM output BEFORE a design phase closes. Mirrors lint-deploy.sh (#20):
# same colour/state/summary/exit-code shape, same role — a cheap, deterministic
# pre-gate that reports findings to the agent for self-correction.
#
# Origin: the "seven cardinal sins" from nexu-io/open-design craft/anti-ai-slop.md
# (Apache-2.0), itself adapted from referodesign/refero_skill (MIT). Tightened to
# the Spec-Driven stack (shadcn/ui + Tailwind + var(--*) tokens from docs/DESIGN.md).
#
# Usage:
#   bash scripts/lint-design.sh [TARGET_DIR]     # defaults to apps/web/src (or .)
#   bash scripts/lint-design.sh --report-only    # surface findings, never fail (Phase 3.3)
#   bash scripts/lint-design.sh --strict         # any P0 hit → exit 1 (Phase 5 gate)
#
# Exit codes:
#   0 — clean, OR findings surfaced in --report-only mode
#   1 — one or more P0 sins found in --strict mode (Phase 5 hard gate)
#
# P0 sins checked (auto-enforced — failing one is a regression, not a preference):
#   D1  Tailwind default indigo as accent  (#6366f1 … #a855f7 → use var(--accent))
#   D2  Two-stop "trust" hero gradient     (purple→blue / blue→cyan / indigo→pink)
#   D3  Emoji as feature icons             (✨🚀🎯⚡🔥💡 in h*/button/li/.icon → monoline SVG)
#   D4  Hardcoded sans on display text     (Inter/Roboto/system-ui on h1/h2 → var(--font-display))
#   D5  AI dashboard tile                  (rounded card + coloured left-border accent)
#   D6  Invented metrics                   ("10× faster", "99.9% uptime", "3× more")
#   D7  Filler copy                        (lorem ipsum, "feature one/two/three", placeholder)
#
# P1 guidance (reported as warnings, never fail) — statically detectable subset:
#   P1a ALL-CAPS without letter-spacing    (text-transform:uppercase / uppercase class w/o tracking)
# Behavioural craft rules (five-states, animation timing) are NOT grep-checkable —
# they live in design-principles.md / motion.md as agent+reviewer guidance.
# =============================================================================

set -uo pipefail

# ── Args ─────────────────────────────────────────────────────────────────────
MODE="default"   # default | report-only | strict
TARGET_DIR=""
for arg in "$@"; do
  case "$arg" in
    --report-only) MODE="report-only" ;;
    --strict)      MODE="strict" ;;
    -*)            printf "Unknown flag: %s\n" "$arg" >&2; exit 2 ;;
    *)             TARGET_DIR="$arg" ;;
  esac
done
if [ -z "$TARGET_DIR" ]; then
  if   [ -d "apps/web/src" ]; then TARGET_DIR="apps/web/src"
  elif [ -d "src" ];         then TARGET_DIR="src"
  else TARGET_DIR="."; fi
fi

# ── Colour helpers ───────────────────────────────────────────────────────────
if [ -t 1 ]; then
  RST=$'\033[0m'; RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; CYN=$'\033[36m'
else RST=""; RED=""; GRN=""; YLW=""; CYN=""; fi
FAIL="${RED}FAIL${RST}"; PASS="${GRN}PASS${RST}"; WARN="${YLW}WARN${RST}"

# ── State ────────────────────────────────────────────────────────────────────
FAILS=0; WARNS=0

# ── Enumerate UI files (the surfaces an agent emits) ─────────────────────────
mapfile -t UI_FILES < <(
  find "$TARGET_DIR" \
    \( -path '*/node_modules/*' -o -path '*/.next/*' -o -path '*/dist/*' -o -path '*/build/*' \) -prune -o \
    -type f \( -name '*.html' -o -name '*.htm' -o -name '*.jsx' -o -name '*.tsx' -o -name '*.css' \) -print 2>/dev/null
)
if [ "${#UI_FILES[@]}" -eq 0 ]; then
  printf "%b No UI files (.html/.jsx/.tsx/.css) under %s — nothing to lint.%b\n" "$YLW" "$TARGET_DIR" "$RST"
  exit 0
fi

# ── Helper: report a finding ─────────────────────────────────────────────────
# report <P0|P1> <check-id> <message> <grep-output>
report() {
  local sev="$1" id="$2" msg="$3" hits="$4"
  if [ "$sev" = "P0" ]; then
    printf "  %b [%s] %s\n" "$FAIL" "$id" "$msg"; FAILS=$((FAILS+1))
  else
    printf "  %b [%s] %s\n" "$WARN" "$id" "$msg"; WARNS=$((WARNS+1))
  fi
  printf "%s\n" "$hits" | sed 's/^/        /' | head -6
}

scan() { # scan <regex> over UI files, return "file:line:match" hits (case-insensitive)
  grep -rniE "$1" "${UI_FILES[@]}" 2>/dev/null
}

printf "%b── DESIGN ANTI-SLOP LINT  |  target: %s  |  mode: %s ──%b\n" "$CYN" "$TARGET_DIR" "$MODE" "$RST"

# ── D1 — Tailwind default indigo as accent ───────────────────────────────────
H="$(scan '#(6366f1|4f46e5|4338ca|3730a3|8b5cf6|7c3aed|a855f7)\b|\b(bg|text|border|from|to|via)-(indigo|violet)-(500|600|700|800)\b')"
[ -n "$H" ] && report P0 D1 "Default Tailwind indigo/violet accent — use var(--accent) from docs/DESIGN.md." "$H"

# ── D2 — Two-stop 'trust' hero gradient ──────────────────────────────────────
H="$(scan 'linear-gradient\([^)]*(purple|violet|indigo|blue|cyan|pink|fuchsia)[^)]*(blue|cyan|pink|purple|violet|indigo)|bg-gradient-to-[a-z]+ +from-(purple|violet|indigo|blue)-[0-9]+ +to-(blue|cyan|pink|fuchsia)-[0-9]+')"
[ -n "$H" ] && report P0 D2 "Two-stop purple/blue/cyan 'trust' gradient — prefer a flat token surface + intentional type." "$H"

# ── D3 — Emoji as feature icons ──────────────────────────────────────────────
# Emoji inside an <h*>, <button>, <li>, or className containing 'icon'
H="$(scan '<(h[1-6]|button|li)[^>]*>[^<]*(✨|🚀|🎯|⚡|🔥|💡|📈|🎨|🔒|⭐)|class(Name)?="[^"]*icon[^"]*"[^>]*>\s*(✨|🚀|🎯|⚡|🔥|💡)')"
[ -n "$H" ] && report P0 D3 "Emoji used as a feature/UI icon — use a 1.6–1.8px monoline SVG with currentColor (lucide-react)." "$H"

# ── D4 — Hardcoded sans on display text (HTML style="…" AND JSX style={{…}}) ──
H="$(scan '<(h1|h2)[^>]*(font-family|fontFamily):\s*["'"'"']?(Inter|Roboto|system-ui|Arial|Helvetica)')"
[ -n "$H" ] && report P0 D4 "Display heading binds a hardcoded sans — use var(--font-display) so the seed's type binding wins." "$H"

# ── D5 — AI dashboard tile (rounded card + coloured left-border) ─────────────
H="$(scan '(border-l-[0-9]|border-left:\s*[0-9].*solid).*(rounded|border-radius)|(rounded|border-radius).*(border-l-[0-9]|border-left:\s*[0-9].*solid)')"
[ -n "$H" ] && report P0 D5 "Rounded card + coloured left-border = the canonical 'AI tile' — drop either the radius or the left border." "$H"

# ── D6 — Invented metrics ────────────────────────────────────────────────────
H="$(scan '[0-9]+(\.[0-9]+)?\s*(×|x)\s*(faster|more|better|productive)|99\.9+%\s*uptime|[0-9]+%\s*(faster|fewer|more)')"
[ -n "$H" ] && report P0 D6 "Invented metric — cite a real source or use a labelled {{placeholder}}." "$H"

# ── D7 — Filler copy ─────────────────────────────────────────────────────────
H="$(scan 'lorem ipsum|feature (one|two|three)\b|placeholder text|sample content|your (headline|text) here')"
[ -n "$H" ] && report P0 D7 "Filler copy — an empty section is a composition problem, not a words-invention problem." "$H"

# ── P1a — ALL CAPS without letter-spacing (two-pass; ERE has no lookahead) ───
# Pass 1: lines that set uppercase (CSS text-transform OR camelCase JSX OR a `uppercase` class).
# Pass 2: drop any that also carry tracking on the same line.
H="$(scan 'text-transform:\s*uppercase|textTransform:\s*["'"'"']uppercase|class(Name)?="[^"]*\buppercase\b' \
     | grep -viE 'letter-spacing|tracking-')"
[ -n "$H" ] && report P1 P1a "ALL-CAPS without tracking — uppercase needs 0.06–0.1em letter-spacing (see design-principles.md Pillar 4)." "$H"

# ============================================================================
# Summary  (mirrors lint-deploy.sh)
# ============================================================================
printf "%b─────────────────────────────────────────────────────%b\n" "$CYN" "$RST"
printf "DESIGN ANTI-SLOP SUMMARY  |  files scanned: %d\n" "${#UI_FILES[@]}"
if [ "$FAILS" -gt 0 ]; then
  printf "  Result : %b  (%d P0 sin(s), %d P1 warning(s))%b\n" "$FAIL" "$FAILS" "$WARNS" "$RST"
  printf "%b─────────────────────────────────────────────────────%b\n" "$CYN" "$RST"
  [ "$MODE" = "strict" ] && exit 1 || exit 0   # report-only/default surface; --strict gates
elif [ "$WARNS" -gt 0 ]; then
  printf "  Result : %b  (%d P1 warning(s) — review)%b\n" "$WARN" "$WARNS" "$RST"
  printf "%b─────────────────────────────────────────────────────%b\n" "$CYN" "$RST"
  exit 0
else
  printf "  Result : %b  (no AI-slop tells found)%b\n" "$PASS" "$RST"
  printf "%b─────────────────────────────────────────────────────%b\n" "$CYN" "$RST"
  exit 0
fi
