#!/usr/bin/env bash
# =============================================================================
# lint-deploy.sh — Powerbyte fleet pre-deploy static footgun gate (PP4)
#
# Catches the 6 recurring Traefik/compose/shell footguns BEFORE a deploy hits
# the VPS. Run this in CI or locally before any push.sh / Komodo trigger.
#
# Usage:
#   bash lint-deploy.sh [TARGET_DIR]        # defaults to .
#   ./scripts/lint-deploy.sh deploy/compose
#
# Exit codes:
#   0 — all checks PASS
#   1 — one or more checks FAIL (or a check itself errored)
#
# Footguns checked (map → reference_fleet_staging_deploy_gotchas.md):
#   C1  docker compose config parse — YAML/interpolation errors caught early
#   C2  Traefik certresolver case   — must be lowercase letsencrypt, not letsEncrypt
#   C3  Traefik tls=true label      — websecure routers must have it or TLS never activates
#   C4  Healthcheck localhost       — must be 127.0.0.1 (IPv6 ::1 refused → Traefik drops)
#   C5  Stage/prod: no build: key   — images pulled only, never built on server
#   C6  push.sh login guard         — must have docker login check (hard-stop or warning)
#   C7  start.sh project-name       — COMPOSE_PROJECT_NAME derivation (Yelli footgun)
#   C8  shellcheck all *.sh         — static shell analysis (degrades gracefully if absent)
# =============================================================================

set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[0;33m'
BLU='\033[0;34m'
CYN='\033[0;36m'
RST='\033[0m'

PASS="${GRN}PASS${RST}"
FAIL="${RED}FAIL${RST}"
WARN="${YLW}WARN${RST}"
SKIP="${BLU}SKIP${RST}"

# ── State ─────────────────────────────────────────────────────────────────────
FAILS=0
WARNS=0
TARGET_DIR="${1:-.}"
TARGET_DIR="$(realpath "$TARGET_DIR")"

# ── Helpers ───────────────────────────────────────────────────────────────────
pass()  { printf "  [%b] %s\n" "$PASS" "$*"; }
fail()  { printf "  [%b] %s\n" "$FAIL" "$*"; FAILS=$((FAILS + 1)); }
warn()  { printf "  [%b] %s\n" "$WARN" "$*"; WARNS=$((WARNS + 1)); }
skip()  { printf "  [%b] %s\n" "$SKIP" "$*"; }
header(){ printf "\n%b=== %s ===%b\n" "$CYN" "$*" "$RST"; }

# ── Enumerate files ───────────────────────────────────────────────────────────
mapfile -t COMPOSE_FILES < <(find "$TARGET_DIR" -name 'docker-compose*.yml' -o -name 'docker-compose*.yaml' 2>/dev/null | sort)
mapfile -t SHELL_FILES   < <(find "$TARGET_DIR" -name '*.sh' 2>/dev/null | sort)

# Prod/stage compose files: any file under a path component named prod, stage, staging
# (dev composes are excluded from the TLS and build: checks)
mapfile -t PROD_STAGE_COMPOSE < <(printf '%s\n' "${COMPOSE_FILES[@]}" | grep -E '/(prod|stage|staging)/' || true)

printf "\n%b lint-deploy.sh — Powerbyte fleet pre-deploy gate%b\n" "$CYN" "$RST"
printf "Target : %s\n" "$TARGET_DIR"
printf "Compose: %d file(s) found  |  Prod/Stage: %d  |  Shell: %d\n" \
  "${#COMPOSE_FILES[@]}" "${#PROD_STAGE_COMPOSE[@]}" "${#SHELL_FILES[@]}"

# =============================================================================
# C1 — docker compose config parse
# =============================================================================
header "C1  docker compose config — YAML/interpolation parse"

if ! command -v docker &>/dev/null; then
  warn "docker not found — skipping C1 compose parse"
else
  if [ "${#COMPOSE_FILES[@]}" -eq 0 ]; then
    skip "no docker-compose*.yml files in $TARGET_DIR"
  else
    for cf in "${COMPOSE_FILES[@]}"; do
      rel="${cf#"$TARGET_DIR/"}"
      # Run config with COMPOSE_FILE pointing at the single file; suppress
      # "variable is not set" noise from unset env vars — those are runtime
      # concerns, not static-lint failures.  A real YAML/anchor error still
      # produces a non-zero exit.
      if docker compose -f "$cf" config --quiet 2>/dev/null; then
        pass "$rel — parses OK"
      else
        # Some files legitimately use ${VAR} that aren't set in the linting
        # env. Try again and capture stderr to distinguish a true YAML error
        # from a missing-variable warning.
        ERR="$(docker compose -f "$cf" config 2>&1 1>/dev/null || true)"
        # Distinguish hard YAML/syntax failures from expected cross-file dependency
        # errors (split-file stacks: "depends on undefined service", "invalid proto"
        # are runtime concerns, not static-lint failures worth blocking on).
        if echo "$ERR" | grep -qiE 'yaml error|parse error|anchor|mapping values|unexpected|bad indentation'; then
          fail "$rel — compose YAML syntax error: $ERR"
        else
          warn "$rel — compose config warnings (likely unset env vars or split-file deps): review before deploy"
        fi
      fi
    done
  fi
fi

# =============================================================================
# C2 — Traefik certresolver case (must be lowercase letsencrypt)
# =============================================================================
header "C2  Traefik certresolver case — must be lowercase 'letsencrypt'"

if [ "${#COMPOSE_FILES[@]}" -eq 0 ]; then
  skip "no compose files found"
else
  C2_FOUND=0
  for cf in "${COMPOSE_FILES[@]}"; do
    rel="${cf#"$TARGET_DIR/"}"
    if grep -qE 'certresolver' "$cf" 2>/dev/null; then
      # Check for any non-lowercase variant
      BAD_LINES="$(grep -nE 'certresolver' "$cf" | grep -vE 'certresolver=letsencrypt[^A-Za-z]?' || true)"
      if [ -n "$BAD_LINES" ]; then
        fail "$rel — wrong certresolver case (must be lowercase 'letsencrypt'):"
        while IFS= read -r line; do
          printf "      %s\n" "$line"
        done <<< "$BAD_LINES"
        C2_FOUND=1
      else
        pass "$rel — certresolver case OK"
      fi
    fi
  done
  if [ "$C2_FOUND" -eq 0 ] && [ "${#COMPOSE_FILES[@]}" -gt 0 ]; then
    # Check if any file had certresolver at all
    HAS_CERT=0
    for cf in "${COMPOSE_FILES[@]}"; do
      if grep -qE 'certresolver' "$cf" 2>/dev/null; then
        HAS_CERT=1
        break
      fi
    done
    if [ "$HAS_CERT" -eq 0 ]; then
      warn "no certresolver labels found in any compose file — verify Traefik TLS is configured elsewhere"
    fi
  fi
fi

# =============================================================================
# C3 — Traefik tls=true label on websecure routers (prod/stage only)
# =============================================================================
header "C3  Traefik tls=true label — websecure routers in prod/stage must have it"

if [ "${#PROD_STAGE_COMPOSE[@]}" -eq 0 ]; then
  skip "no prod/stage compose files found — skipping C3"
else
  for cf in "${PROD_STAGE_COMPOSE[@]}"; do
    rel="${cf#"$TARGET_DIR/"}"
    # Check if file uses websecure entrypoint
    if ! grep -qE 'entrypoints=websecure' "$cf" 2>/dev/null; then
      skip "$rel — no websecure entrypoint labels found"
      continue
    fi
    # Collect all router names that use websecure
    mapfile -t WEBSECURE_ROUTERS < <(grep -oE 'routers\.[^.]+\.entrypoints=websecure' "$cf" | sed 's/routers\.\([^.]*\)\..*/\1/' | sort -u || true)
    FILE_FAIL=0
    for router in "${WEBSECURE_ROUTERS[@]}"; do
      # Look for the tls=true label for this router.
      # Router names may contain shell variable syntax like ${COMPOSE_PROJECT_NAME}_app,
      # which contains regex metacharacters ($, {, }) — use fixed-string grep (fgrep / grep -F)
      # so the literal string is matched exactly, not interpreted as a regex pattern.
      TLS_LABEL="routers.${router}.tls=true"
      if ! grep -qF "$TLS_LABEL" "$cf" 2>/dev/null; then
        fail "$rel — router '${router}' uses websecure but missing 'traefik.http.routers.${router}.tls=true'"
        FILE_FAIL=1
      fi
    done
    if [ "$FILE_FAIL" -eq 0 ]; then
      pass "$rel — all websecure routers have tls=true"
    fi
  done
fi

# =============================================================================
# C4 — Healthcheck must use 127.0.0.1, not localhost (IPv6 ::1 footgun)
# =============================================================================
header "C4  Healthcheck localhost → must be 127.0.0.1 (IPv6 footgun)"

if [ "${#COMPOSE_FILES[@]}" -eq 0 ]; then
  skip "no compose files found"
else
  for cf in "${COMPOSE_FILES[@]}"; do
    rel="${cf#"$TARGET_DIR/"}"
    # Look for healthcheck test lines containing localhost
    BAD_LINES="$(grep -n 'localhost' "$cf" | grep -iE 'healthcheck|CMD.*localhost|test.*localhost' || true)"
    # Also catch the pattern where localhost appears in a test array value
    BAD_HC="$(grep -n 'localhost' "$cf" | grep -B2 -A2 'healthcheck' 2>/dev/null || \
              awk '/healthcheck/,/^[[:space:]]*[^[:space:]]/' "$cf" | grep 'localhost' || true)"
    if [ -n "$BAD_HC" ]; then
      fail "$rel — healthcheck contains 'localhost' (use 127.0.0.1 — IPv6 ::1 breaks Traefik v3):"
      while IFS= read -r line; do
        printf "      %s\n" "$line"
      done <<< "$BAD_HC"
    else
      pass "$rel — no localhost in healthcheck"
    fi
  done
fi

# =============================================================================
# C5 — Stage/prod compose must NOT contain a build: key (image-only rule)
# =============================================================================
header "C5  Stage/prod compose — no build: key (pull-only, never build on server)"

if [ "${#PROD_STAGE_COMPOSE[@]}" -eq 0 ]; then
  skip "no prod/stage compose files found — skipping C5"
else
  for cf in "${PROD_STAGE_COMPOSE[@]}"; do
    rel="${cf#"$TARGET_DIR/"}"
    BUILD_LINES="$(grep -nE '^[[:space:]]+build:' "$cf" || true)"
    if [ -n "$BUILD_LINES" ]; then
      fail "$rel — contains 'build:' key in prod/stage compose (images must be pulled, never built on server):"
      while IFS= read -r line; do
        printf "      %s\n" "$line"
      done <<< "$BUILD_LINES"
    else
      pass "$rel — no build: key (image-only OK)"
    fi
  done
fi

# =============================================================================
# C6 — push.sh must have a docker login guard
# =============================================================================
header "C6  push.sh docker login guard"

mapfile -t PUSH_SCRIPTS < <(find "$TARGET_DIR" -name 'push.sh' 2>/dev/null | sort)

if [ "${#PUSH_SCRIPTS[@]}" -eq 0 ]; then
  skip "no push.sh found in $TARGET_DIR"
else
  for ps in "${PUSH_SCRIPTS[@]}"; do
    rel="${ps#"$TARGET_DIR/"}"
    # Check for any docker login check pattern
    if grep -qE '(docker info|docker login|grep.*Username|grep.*username)' "$ps" 2>/dev/null; then
      pass "$rel — docker login guard present"
    else
      fail "$rel — no docker login guard found (add 'docker info | grep Username' or equivalent)"
    fi
  done
fi

# =============================================================================
# C7 — start.sh project name derivation (Yelli footgun: -p env_suffix mismatch)
# =============================================================================
header "C7  start.sh project-name derivation (COMPOSE_PROJECT_NAME alignment)"

mapfile -t START_SCRIPTS < <(find "$TARGET_DIR" -name 'start.sh' 2>/dev/null | sort)

if [ "${#START_SCRIPTS[@]}" -eq 0 ]; then
  skip "no start.sh found in $TARGET_DIR"
else
  for ss in "${START_SCRIPTS[@]}"; do
    rel="${ss#"$TARGET_DIR/"}"
    ISSUES=""

    # Check 1: if -p flag is used, ensure it comes from a variable (not a hardcoded string
    # that could produce _stage vs _staging mismatch)
    HARDCODED_P="$(grep -nE '\-p[[:space:]]+[a-zA-Z][a-zA-Z0-9_-]+[[:space:]]' "$ss" | \
                   grep -vE '(\$|PROJECT_NAME|COMPOSE_PROJECT)' || true)"
    if [ -n "$HARDCODED_P" ]; then
      ISSUES="${ISSUES}    hardcoded -p value (risk: project-name / network name mismatch):\n"
      while IFS= read -r line; do
        ISSUES="${ISSUES}      $line\n"
      done <<< "$HARDCODED_P"
    fi

    # Check 2: if ENV_SUFFIX is used for project name, ensure it's consistent with env file
    # (the Yelli bug was yelli_$ENV producing "yelli_stage" but .env.staging→COMPOSE_PROJECT_NAME=yelli_staging)
    if grep -qE "PROJECT_NAME.*\\\$ENV\b" "$ss" 2>/dev/null && \
       ! grep -qE 'ENV_SUFFIX|staging' "$ss" 2>/dev/null; then
      ISSUES="${ISSUES}    project name uses \$ENV directly — risk of yelli_stage vs yelli_staging mismatch; use a suffix map\n"
    fi

    if [ -n "$ISSUES" ]; then
      fail "$rel — project-name derivation issues:"
      # Use printf to expand \n correctly
      printf "%b" "$ISSUES"
    else
      pass "$rel — project-name derivation looks safe"
    fi
  done
fi

# =============================================================================
# C8 — shellcheck all *.sh (degrade gracefully if not installed)
# =============================================================================
header "C8  shellcheck — static shell analysis on all *.sh"

if ! command -v shellcheck &>/dev/null; then
  warn "shellcheck not installed — install with: sudo apt-get install shellcheck"
else
  if [ "${#SHELL_FILES[@]}" -eq 0 ]; then
    skip "no *.sh files found in $TARGET_DIR"
  else
    for sf in "${SHELL_FILES[@]}"; do
      rel="${sf#"$TARGET_DIR/"}"
      # Run shellcheck; -S error means only report errors (not style warnings)
      if SC_OUT="$(shellcheck -S error "$sf" 2>&1)"; then
        pass "$rel — shellcheck clean"
      else
        fail "$rel — shellcheck errors:"
        while IFS= read -r line; do
          printf "      %s\n" "$line"
        done <<< "$SC_OUT"
        : # FAILS already incremented by fail() helper above
      fi
    done
  fi
fi

# =============================================================================
# Summary
# =============================================================================
printf "\n%b─────────────────────────────────────────────────────%b\n" "$CYN" "$RST"
printf "LINT-DEPLOY SUMMARY  |  target: %s\n" "$TARGET_DIR"
printf "  Compose files : %d  |  Prod/stage: %d  |  Shell scripts: %d\n" \
  "${#COMPOSE_FILES[@]}" "${#PROD_STAGE_COMPOSE[@]}" "${#SHELL_FILES[@]}"

if [ "$FAILS" -gt 0 ]; then
  printf "  Result : %b  (%d failure(s), %d warning(s))%b\n" \
    "$FAIL" "$FAILS" "$WARNS" "$RST"
  printf "%b─────────────────────────────────────────────────────%b\n\n" "$CYN" "$RST"
  exit 1
elif [ "$WARNS" -gt 0 ]; then
  printf "  Result : %b  (%d warning(s) — review before deploy)%b\n" \
    "$WARN" "$WARNS" "$RST"
  printf "%b─────────────────────────────────────────────────────%b\n\n" "$CYN" "$RST"
  exit 0
else
  printf "  Result : %b  (all checks clean)%b\n" "$PASS" "$RST"
  printf "%b─────────────────────────────────────────────────────%b\n\n" "$CYN" "$RST"
  exit 0
fi
