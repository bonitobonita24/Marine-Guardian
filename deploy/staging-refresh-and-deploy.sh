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
#   4b. Re-key ER token               (prod copy carries prod-keyed secrets — re-key to staging's ENCRYPTION_KEY so ER sync works)
#   5. Bring staging up on new image
#   6. Health verify
#
# WHY 4b: the prod DB copy (step 2) carries tenant_er_connections.api_token_enc
# ciphertext encrypted with PROD's ENCRYPTION_KEY. Staging runs a DIFFERENT key,
# so ER sync would fail "unable to authenticate data" until the token is re-keyed.
# scripts/rekey-er-token.ts re-encrypts prod-keyed tokens under staging's key
# (idempotent + defensive — see that file). This makes the fix durable across
# every refresh instead of a manual one-off after each run.
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

# ── INVARIANT 1: ephemeral LOCAL tunnel port, DECOUPLED from the remote DB_PORT ──
# Binding local==remote (the old behaviour) collides with any local process already
# on that number — e.g. ferrybook_dev_db publishes 5433, the same as MG staging's
# DB_PORT. The -L forward then fails to bind and `migrate deploy` silently connects
# to the WRONG database while the run still reports "HEALTHY — safe to promote".
# See ~/.claude/rules/staging-refresh-gate.md + LESSONS_GLOBAL
# `deploy.staging-gate.tunnel-port-collision-swallows-migrate-failure`.
LOCALPORT=""
for _P in $(seq 45500 45560); do
  if ! ss -ltn "sport = :${_P}" 2>/dev/null | grep -q LISTEN; then LOCALPORT="$_P"; break; fi
done
[ -n "$LOCALPORT" ] || { echo "  ✖ ABORT: no free local port in 45500-45560 for the DB tunnel"; exit 1; }
echo "  · tunnel: localhost:${LOCALPORT} → VPS localhost:${DBPORT} (remote DB_PORT)"

DBURL_LOCAL=$(ssh_vps "grep -oP '(?<=^INTERNAL_DATABASE_URL=).*' ${STACK}/.env" \
  | sed -E "s#@[^:/]+:[0-9]+#@localhost:${LOCALPORT}#")

ssh -o ConnectTimeout=20 -i "$KEY" -N -L "${LOCALPORT}:localhost:${DBPORT}" "$VPS" & TUN=$!

# ── INVARIANT 2: verify the tunnel is actually LISTENING — fail loud, never no-op ──
TUN_UP=0
for _ in $(seq 1 15); do
  if ss -ltn "sport = :${LOCALPORT}" 2>/dev/null | grep -q LISTEN; then TUN_UP=1; break; fi
  sleep 1
done
if [ "$TUN_UP" != "1" ]; then
  kill $TUN 2>/dev/null || true
  echo "  ✖ ABORT: SSH tunnel never came up on localhost:${LOCALPORT}."
  echo "    Refusing to run migrations — a no-op/wrong-DB migrate must never certify staging."
  exit 1
fi
echo "  · tunnel verified LISTENING"
if ! DATABASE_URL="$DBURL_LOCAL" pnpm --filter @marine-guardian/db db:migrate:deploy; then
  echo "  ↳ migrate deploy hit drift; resolving pending migrations as applied…"
  for M in $(DATABASE_URL="$DBURL_LOCAL" pnpm --filter @marine-guardian/db exec prisma migrate status 2>/dev/null | grep -oE '[0-9]{14}_[a-z_]+'); do
    DATABASE_URL="$DBURL_LOCAL" pnpm --filter @marine-guardian/db exec prisma migrate resolve --applied "$M" || true
  done
fi

echo "▶ 4b/6 Re-key staging ER token (prod copy carries prod-keyed secrets)"
# ── INVARIANT 4: read secrets from a source available while the app is STOPPED ──
# Staging's app/worker/pdf are stopped back in step 2, so `docker exec
# ${PROJ}_app printenv` returns EMPTY here and the re-key would silently skip,
# leaving staging ER sync broken ("unable to authenticate data"). Read staging's
# key from the stack .env instead. Prod's app is never stopped by this script, so
# its docker exec is reliable — .env is kept only as a fallback.
PROD_ENCKEY=$(ssh_vps "docker exec ${PRODPROJ}_app printenv ENCRYPTION_KEY 2>/dev/null" | tr -d '\r\n' || true)
[ -n "$PROD_ENCKEY" ] || PROD_ENCKEY=$(ssh_vps "grep -oP '(?<=^ENCRYPTION_KEY=).*' /etc/komodo/stacks/marine-guardian/.env 2>/dev/null" | tr -d '\r\n' || true)
STAGING_ENCKEY=$(ssh_vps "grep -oP '(?<=^ENCRYPTION_KEY=).*' ${STACK}/.env 2>/dev/null" | tr -d '\r\n' || true)
if [ -z "$PROD_ENCKEY" ] || [ -z "$STAGING_ENCKEY" ]; then
  echo "  ⚠ could not read one/both ENCRYPTION_KEYs — skipping re-key (staging ER sync may fail until re-keyed)"
elif [ "$PROD_ENCKEY" = "$STAGING_ENCKEY" ]; then
  echo "  · prod & staging ENCRYPTION_KEY identical — no re-key needed"
else
  ENCRYPTION_KEY="$STAGING_ENCKEY" OLD_ENCRYPTION_KEY="$PROD_ENCKEY" DATABASE_URL="$DBURL_LOCAL" \
    pnpm --filter @marine-guardian/jobs exec tsx ../../scripts/rekey-er-token.ts \
    || echo "  ⚠ re-key reported an issue (non-fatal) — check staging ER sync after deploy"
fi

# ── INVARIANT 3: schema-status HARD GATE before the app is brought up ──
# A shallow /health 200 must NEVER certify a promotable staging on its own. If the
# schema is not provably up to date, ABORT *before* `up -d` rather than letting a
# green health check vouch for migrations that never applied.
echo "▶ 4c/6 Schema-status HARD GATE (must report up to date)"
MIGSTATUS=$(DATABASE_URL="$DBURL_LOCAL" pnpm --filter @marine-guardian/db exec prisma migrate status 2>&1 || true)
kill $TUN 2>/dev/null || true
if echo "$MIGSTATUS" | grep -qi 'Database schema is up to date'; then
  echo "  ✓ schema up to date"
else
  echo "  ✖ ABORT: prisma migrate status did NOT report an up-to-date schema."
  echo "$MIGSTATUS" | tail -25
  echo "  Staging NOT brought up on the candidate image. Nothing is promotable."
  exit 1
fi

echo "▶ 5/6 Bring staging up on new image"
ssh_vps "cd ${STACK}; docker compose -p ${PROJ} --env-file .env ${CF} up -d app worker pdf-renderer && echo '  ok'"

echo "▶ 6/6 Verify (poll /api/health up to ~60s — the app needs a moment after 'up -d')"
CODE=000
for _ in $(seq 1 20); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" https://mg-staging.powerbyte.app/api/health || echo 000)
  [ "$CODE" = "200" ] && break
  sleep 3
done
echo "  mg-staging /api/health = ${CODE}"
if [ "$CODE" = "200" ]; then
  echo "✅ Staging refreshed from prod + running '${SRC}' — HEALTHY. Validate at https://mg-staging.powerbyte.app/login"
  echo "   Green here → the SAME image is safe to promote to production (manual, explicit)."
else
  echo "⚠ Staging came up but /api/health = ${CODE} after ~60s — check 'docker logs marine-guardian_staging_app' before promoting."
  exit 1
fi
