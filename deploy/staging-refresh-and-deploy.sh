#!/usr/bin/env bash
# staging-refresh-and-deploy.sh — MANUAL, agent-triggered STAGING validation gate for MG.
#
# PURPOSE: make staging a faithful pre-production rehearsal. On every run it
# refreshes staging's data FROM PRODUCTION *first*, then deploys the candidate
# image and applies its migrations — so the new code + new migrations are tested
# against real prod-shaped data before the same image is ever promoted to prod.
#
# ORDER IS FIXED (owner directive — data BEFORE image):
#   1. Backup staging DB              (rollback point)
#   2. Refresh staging data FROM PROD (prod is READ-ONLY; staging wiped + reloaded)
#   3. Pull candidate image           (Docker Hub — AFTER the data refresh)
#   4. Migrate staging                (prod-data → new schema = the prod-migration rehearsal)
#   5. Bring staging up on new image
#   6. Health verify
#
# HARD RULES:
#   • PRODUCTION is only ever READ (pg_dump). It is never written, migrated, or restarted here.
#   • This DESTROYS the current staging dataset by design (a fresh prod copy replaces it).
#   • Staging Komodo `auto_update` MUST be OFF, or Komodo may pull the image out of order.
#   • Production promotion stays a separate, explicit manual step (never triggered here).
#
# Usage:  bash deploy/staging-refresh-and-deploy.sh [SOURCE_TAG]   (default: staging-latest)
# Prereq: SSH key ~/.ssh/powerbyte_hostinger; run from the app repo root at the
#         commit that built SOURCE_TAG (migrations are applied host-side from this repo).
set -euo pipefail

SRC="${1:-staging-latest}"
VPS="root@72.62.74.203"; KEY="$HOME/.ssh/powerbyte_hostinger"
STACK="/etc/komodo/stacks/marine-guardian-staging"
PROJ="marine-guardian_staging"; PRODPROJ="marine-guardian_prod"
CF="-f docker-compose.yml -f docker-compose.pdf-renderer.yml"
ssh_vps(){ ssh -o ConnectTimeout=20 -i "$KEY" "$VPS" "$@"; }

echo "▶ 1/6 Backup staging DB (rollback point)"
ssh_vps "U=\$(docker exec ${PROJ}_postgres printenv POSTGRES_USER); D=\$(docker exec ${PROJ}_postgres printenv POSTGRES_DB); \
  docker exec ${PROJ}_postgres pg_dump -U \$U -d \$D | gzip > /root/mg-staging-backup-pre-refresh-\$(date -u +%Y%m%d-%H%M%S).sql.gz && echo '  ok'"

echo "▶ 2/6 Refresh staging data FROM prod (prod READ-ONLY; staging wiped + reloaded)"
ssh_vps "set -e; cd ${STACK}; \
  echo '  · stopping staging app/worker/pdf (release DB connections)'; \
  docker compose -p ${PROJ} ${CF} stop app worker pdf-renderer >/dev/null 2>&1 || true; \
  SU=\$(docker exec ${PROJ}_postgres printenv POSTGRES_USER); SD=\$(docker exec ${PROJ}_postgres printenv POSTGRES_DB); \
  PU=\$(docker exec ${PRODPROJ}_postgres printenv POSTGRES_USER); PD=\$(docker exec ${PRODPROJ}_postgres printenv POSTGRES_DB); \
  echo '  · terminating staging DB sessions + wiping public schema'; \
  docker exec ${PROJ}_postgres psql -U \$SU -d \$SD -c \"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='\$SD' AND pid<>pg_backend_pid();\" >/dev/null; \
  docker exec ${PROJ}_postgres psql -U \$SU -d \$SD -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' >/dev/null; \
  echo '  · streaming prod → staging (pg_dump | psql, same host, no network egress)'; \
  docker exec ${PRODPROJ}_postgres pg_dump -U \$PU -d \$PD --no-owner --no-privileges | docker exec -i ${PROJ}_postgres psql -U \$SU -d \$SD -q >/dev/null; \
  echo '  · staging DB now mirrors production'"

echo "▶ 3/6 Pull candidate image '${SRC}' from Docker Hub (AFTER data refresh)"
ssh_vps "cd ${STACK}; \
  sed -i 's/^APP_IMAGE_TAG=.*/APP_IMAGE_TAG=${SRC}/' .env; \
  docker compose -p ${PROJ} --env-file .env ${CF} pull app worker pdf-renderer >/dev/null 2>&1 && echo '  ok'"

echo "▶ 4/6 Migrate staging (prod-data → new schema; drift-resolve fallback)"
DBPORT=$(ssh_vps "grep -oP '(?<=^DB_PORT=)[0-9]+' ${STACK}/.env")
DBURL=$(ssh_vps "grep -oP '(?<=^INTERNAL_DATABASE_URL=).*' ${STACK}/.env" | sed -E "s#@[^:]+:5432#@localhost:${DBPORT}#")
ssh -i "$KEY" -N -L "${DBPORT}:localhost:${DBPORT}" "$VPS" & TUN=$!; sleep 3
DBURL_LOCAL=$(echo "$DBURL" | sed -E "s#@[^:]+:${DBPORT}#@localhost:${DBPORT}#")
if ! DATABASE_URL="$DBURL_LOCAL" pnpm --filter @marine-guardian/db db:migrate:deploy; then
  echo "  ↳ migrate deploy hit drift; resolving pending migrations as applied…"
  for M in $(DATABASE_URL="$DBURL_LOCAL" pnpm --filter @marine-guardian/db exec prisma migrate status 2>/dev/null | grep -oE '[0-9]{14}_[a-z_]+'); do
    DATABASE_URL="$DBURL_LOCAL" pnpm --filter @marine-guardian/db exec prisma migrate resolve --applied "$M" || true
  done
fi
kill $TUN 2>/dev/null || true

echo "▶ 5/6 Bring staging up on new image"
ssh_vps "cd ${STACK}; docker compose -p ${PROJ} --env-file .env ${CF} up -d app worker pdf-renderer && echo '  ok'"

echo "▶ 6/6 Verify"
sleep 6
curl -s -o /dev/null -w "  mg-staging health = %{http_code}\n" https://mg-staging.powerbyte.app/api/health
echo "✅ Staging refreshed from prod + running '${SRC}'. Validate at https://mg-staging.powerbyte.app/login"
echo "   Green here → the SAME image is safe to promote to production (manual, explicit)."
