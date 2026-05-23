#!/usr/bin/env bash
# Run the Per Area Report smoke test.
#
# Extracts DEMO_SITE_ADMIN_PASSWORD from CREDENTIALS.md locally
# (subprocess only — value never enters AI agent context) and exports
# it as DEMO_ADMIN_PASSWORD env var, then invokes the Node smoke test.
#
# CREDENTIALS.md is gitignored. This script reads but never prints any
# credential value to stdout/stderr.
#
# Usage: bash scripts/smoke-tests/run-per-area-smoke.sh

set -euo pipefail

cd "$(dirname "$0")/../.."

CREDS_FILE="CREDENTIALS.md"
if [[ ! -f "$CREDS_FILE" ]]; then
  echo "FAIL: $CREDS_FILE not found" >&2
  exit 1
fi

# Extract the demo-site admin password (dev environment) from CREDENTIALS.md.
# Table format inside "### Demo Site Admin" section:
#   | Environment | Email | Password |
#   | dev | admin@demo-site.local | <22-char base64> |
#   | staging | ... | ... |
#   | prod | ... | ... |
# Extractor: scope to section, find row starting with "| dev ", take col3 (Password).
DEMO_ADMIN_PASSWORD=$(
  awk '
    /^### Demo Site Admin/ { in_section=1; next }
    in_section && (/^### / || /^## /) { in_section=0 }
    in_section && /^\|[[:space:]]*dev[[:space:]]*\|/ {
      split($0, parts, "|")
      val = parts[4]
      sub(/^[[:space:]]+/, "", val)
      sub(/[[:space:]]+$/, "", val)
      print val
      exit
    }
  ' "$CREDS_FILE"
)

if [[ -z "$DEMO_ADMIN_PASSWORD" ]]; then
  echo "FAIL: extracted password is empty" >&2
  exit 1
fi

PW_LEN=${#DEMO_ADMIN_PASSWORD}
echo "Password extracted (len=$PW_LEN chars)" >&2

export DEMO_ADMIN_PASSWORD
export DEMO_ADMIN_EMAIL="${DEMO_ADMIN_EMAIL:-admin@demo-site.local}"
export APP_URL="${APP_URL:-http://localhost:45204}"
export AREA_BOUNDARY_ID="${AREA_BOUNDARY_ID:-smoke-test-area-001}"
export OUTFILE="${OUTFILE:-/tmp/smoke-area-report.pdf}"

node scripts/smoke-tests/per-area-report.mjs
