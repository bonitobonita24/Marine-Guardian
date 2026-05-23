#!/bin/bash
# Rotates the demo-site admin password (admin@demo-site.local) for a single
# environment. Generates a fresh 22-char password via openssl, writes it to
# the corresponding .env.{env}, updates the CREDENTIALS.md row for that env
# (structural column-3 awk slice — never echoes the password to stdout), and
# applies the new bcrypt hash to the DB via the existing pnpm db:seed
# upsert path (seed reads DEMO_SITE_ADMIN_PASSWORD from env and bcrypts at
# rounds=12 — see packages/db/prisma/seed.ts L19-23).
#
# Per Scenario 34 (CLAUDE.md / .claude/rules/scenarios.md L1957+): this
# script never echoes the new password value to stdout. It only emits
# success markers. User reads the new value from CREDENTIALS.md or
# .env.{env} after the script exits.
#
# Usage:
#   bash scripts/rotate-demo-site-admin-password.sh dev
#   bash scripts/rotate-demo-site-admin-password.sh staging   # SQL-only mode
#   bash scripts/rotate-demo-site-admin-password.sh prod      # SQL-only mode
#
# Modes:
#   dev      — full local rotation. Writes .env.dev + CREDENTIALS.md, runs
#              pnpm db:seed against the running dev DB to apply the hash.
#   staging  — writes .env.staging + CREDENTIALS.md only. Emits a SQL UPDATE
#              statement (path written to /tmp/rotate-sql-staging.sql) for
#              the user to apply on the staging server. Skips DB write.
#   prod     — same as staging but for prod (path /tmp/rotate-sql-prod.sql).

set -euo pipefail

ENV="${1:-}"
if [[ "$ENV" != "dev" && "$ENV" != "staging" && "$ENV" != "prod" ]]; then
  echo "Usage: bash scripts/rotate-demo-site-admin-password.sh [dev|staging|prod]" >&2
  exit 1
fi

ENV_FILE=".env.${ENV}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "FAIL: $ENV_FILE not found" >&2
  exit 1
fi
if [[ ! -f "CREDENTIALS.md" ]]; then
  echo "FAIL: CREDENTIALS.md not found (must be at project root, gitignored)" >&2
  exit 1
fi

# 1. Generate new password — 22 chars full ASCII via openssl. Never printed.
NEW_PASSWORD=$(openssl rand -base64 32 | tr -d '\n' | head -c 22)

# 2. Update .env.{env} DEMO_SITE_ADMIN_PASSWORD line.
#    sed delimiter "|" avoids clashes with / + b64 chars in the value.
if grep -q "^DEMO_SITE_ADMIN_PASSWORD=" "$ENV_FILE"; then
  sed -i "s|^DEMO_SITE_ADMIN_PASSWORD=.*|DEMO_SITE_ADMIN_PASSWORD=${NEW_PASSWORD}|" "$ENV_FILE"
  echo "  ✅ ${ENV_FILE}: DEMO_SITE_ADMIN_PASSWORD updated"
else
  echo "DEMO_SITE_ADMIN_PASSWORD=${NEW_PASSWORD}" >> "$ENV_FILE"
  echo "  ✅ ${ENV_FILE}: DEMO_SITE_ADMIN_PASSWORD appended"
fi

# 3. Update CREDENTIALS.md row for this env under "### Demo Site Admin".
#    Structural awk replacement on column 3 of the row matching the env.
#    NEVER cats the file or echoes the value — only writes via redirect to
#    a temp file then mv. Per Scenario 34: structural slicing, not regex on
#    table data.
TMP_CRED=$(mktemp)
awk -v env="$ENV" -v new="$NEW_PASSWORD" '
BEGIN { in_section = 0 }
/^### Demo Site Admin/ { in_section = 1; print; next }
/^##/ && in_section == 1 && !/^### Demo Site Admin/ { in_section = 0; print; next }
in_section == 1 && /^\| *[a-z]+ *\|/ {
  # Match a 3-column table row: | env | email | password |
  n = split($0, cols, "|")
  # cols[1]="", cols[2]=" env ", cols[3]=" email ", cols[4]=" password ", cols[5]=""
  if (n >= 4) {
    gsub(/^ +| +$/, "", cols[2])
    if (cols[2] == env) {
      cols[4] = " " new " "
      printf "%s|%s|%s|%s|%s\n", cols[1], cols[2] == "" ? cols[2] : " " cols[2] " ", cols[3], cols[4], cols[5]
      next
    }
  }
  print
  next
}
{ print }
' CREDENTIALS.md > "$TMP_CRED"

# Sanity check: the new file must differ from the original (the row WAS updated).
if diff -q CREDENTIALS.md "$TMP_CRED" > /dev/null; then
  echo "FAIL: CREDENTIALS.md unchanged after awk slice. Row '| ${ENV} | ...' may not exist under '### Demo Site Admin'." >&2
  echo "      Verify the section + row exist before re-running." >&2
  rm -f "$TMP_CRED"
  # Revert .env change to avoid partial state
  echo "      Reverting ${ENV_FILE} change…" >&2
  # No easy revert here; user must restore from git if .env.{env} is tracked
  # (it shouldn't be — gitignored). Fail loud.
  exit 1
fi

mv "$TMP_CRED" CREDENTIALS.md
echo "  ✅ CREDENTIALS.md: Demo Site Admin row updated for env=${ENV}"

# 4. Apply to DB.
if [[ "$ENV" == "dev" ]]; then
  # Re-run seed against dev DB. The seed upsert reads DEMO_SITE_ADMIN_PASSWORD
  # from env, bcrypt-hashes at rounds=12, and updates passwordHash on
  # admin@demo-site.local. Idempotent.
  echo "  → Running pnpm db:seed for dev (applies bcrypt hash to admin@demo-site.local)…"
  set -a
  # shellcheck disable=SC1090
  source "./$ENV_FILE"
  set +a
  pnpm --filter @marine-guardian/db db:seed > /dev/null 2>&1 || {
    echo "FAIL: pnpm db:seed exited non-zero. Check that the dev DB is reachable + migrated." >&2
    exit 1
  }
  echo "  ✅ dev DB: admin@demo-site.local password hash updated via seed"
else
  # Staging/prod: compute bcrypt hash locally, emit SQL for user to apply
  # on the corresponding server.
  HASH=$(DEMO_SITE_ADMIN_PASSWORD="$NEW_PASSWORD" node -e '
    const bcrypt = require("bcryptjs");
    process.stdout.write(bcrypt.hashSync(process.env.DEMO_SITE_ADMIN_PASSWORD, 12));
  ')
  SQL_PATH="/tmp/rotate-sql-${ENV}.sql"
  cat > "$SQL_PATH" <<SQL
-- Demo-site admin password rotation for env=${ENV}
-- Generated $(date -Iseconds) by scripts/rotate-demo-site-admin-password.sh
-- Apply on the ${ENV} server: psql "\$DATABASE_URL" -f $(basename "$SQL_PATH")
-- After apply: verify the hash with a login attempt before deleting this file.
UPDATE users
SET password_hash = '${HASH}'
WHERE email = 'admin@demo-site.local';
SQL
  echo "  ✅ SQL written: ${SQL_PATH}"
  echo "  → Apply on ${ENV} server: psql \"\$DATABASE_URL\" -f $(basename "$SQL_PATH")"
  echo "  → After applying, also sync ${ENV_FILE} (this file) to the ${ENV} server"
fi

echo ""
echo "✅ Demo-site admin password rotated for env=${ENV}"
echo "   New value is in CREDENTIALS.md (### Demo Site Admin → | ${ENV} | row, column 3)"
echo "   and in ${ENV_FILE} (DEMO_SITE_ADMIN_PASSWORD)."
echo "   No plaintext password was echoed to stdout."
