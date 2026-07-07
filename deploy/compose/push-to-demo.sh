#!/usr/bin/env bash
# push-to-demo.sh — MANUAL promote of a chosen build to the client-facing DEMO stack
# (mg-demo.powerbyte.app). Model B: the demo is a deliberate-push environment, NOT auto-deploy.
#
#   Local dev  →  { demo (manual) · staging (auto on main) · production (manual) }
#
# HARD RULES:
#   • migrations = YES (prisma migrate deploy, with drift-resolve fallback)
#   • re-seed    = NEVER (the demo's curated dataset is preserved)
#   • demo runs its OWN image tag `demo-latest` promoted from a source tag you choose.
#
# Usage:  bash deploy/compose/push-to-demo.sh [SOURCE_TAG]     (default SOURCE_TAG=latest)
# Prereq: SSH key ~/.ssh/powerbyte_hostinger; run from the app repo root.
set -euo pipefail

SRC="${1:-latest}"
VPS="root@72.62.74.203"; KEY="$HOME/.ssh/powerbyte_hostinger"
HUB="bonitobonita24"; STACK="/etc/komodo/stacks/marine-guardian-demo"; PROJ="marine-guardian_demo"
CF="-f docker-compose.db.yml -f docker-compose.cache.yml -f docker-compose.storage.yml -f docker-compose.app.yml -f docker-compose.pdf-renderer.yml"
ssh_vps(){ ssh -o ConnectTimeout=15 -i "$KEY" "$VPS" "$@"; }

echo "▶ 1/5 Backup demo DB"
ssh_vps "U=\$(docker exec ${PROJ}_postgres printenv POSTGRES_USER); docker exec ${PROJ}_postgres pg_dump -U \$U -d ${PROJ} | gzip > /root/mg-demo-backup-pre-pushtodemo-\$(date -u +%Y%m%d-%H%M%S).sql.gz && echo ok"

echo "▶ 2/5 Promote ${SRC} → demo-latest (registry manifests)"
ssh_vps "docker buildx imagetools create -t ${HUB}/marine-guardian:demo-latest ${HUB}/marine-guardian:${SRC} && \
         docker buildx imagetools create -t ${HUB}/marine-guardian-pdf:demo-latest ${HUB}/marine-guardian-pdf:${SRC}"

echo "▶ 3/5 Redeploy demo stack (pull + recreate app/worker/pdf-renderer)"
ssh_vps "cd ${STACK}; \
  sed -i 's/^APP_IMAGE_TAG=.*/APP_IMAGE_TAG=demo-latest/; s/^PDF_IMAGE_TAG=.*/PDF_IMAGE_TAG=demo-latest/' .env; \
  grep -q '^WEB_APP_INTERNAL_URL=' .env || echo 'WEB_APP_INTERNAL_URL=http://${PROJ}_app:3000' >> .env; \
  docker compose -p ${PROJ} --env-file .env ${CF} pull app worker pdf-renderer >/dev/null 2>&1; \
  docker compose -p ${PROJ} --env-file .env ${CF} up -d app worker pdf-renderer"

echo "▶ 4/5 Migrate (deploy; resolve drift as applied — NEVER seed)"
DBPORT=$(ssh_vps "grep -oP '(?<=^DB_PORT=)[0-9]+' ${STACK}/.env")
DBURL=$(ssh_vps "grep -oP '(?<=^INTERNAL_DATABASE_URL=).*' ${STACK}/.env" | sed -E "s#@[^:]+:5432#@localhost:${DBPORT}#")
ssh -i "$KEY" -N -L "${DBPORT}:localhost:${DBPORT}" "$VPS" & TUN=$!; sleep 3
DBURL_LOCAL=$(echo "$DBURL" | sed -E "s#@[^:]+:${DBPORT}#@localhost:${DBPORT}#")
if ! DATABASE_URL="$DBURL_LOCAL" pnpm --filter @marine-guardian/db db:migrate:deploy; then
  echo "  ↳ migrate failed (likely physical schema already present); resolving pending as applied…"
  for M in $(DATABASE_URL="$DBURL_LOCAL" pnpm --filter @marine-guardian/db exec prisma migrate status 2>/dev/null | grep -oE '[0-9]{14}_[a-z_]+'); do
    DATABASE_URL="$DBURL_LOCAL" pnpm --filter @marine-guardian/db exec prisma migrate resolve --applied "$M" || true
  done
fi
kill $TUN 2>/dev/null || true

echo "▶ 5/5 Verify"
sleep 5
curl -s -o /dev/null -w "  mg-demo health = %{http_code}\n" https://mg-demo.powerbyte.app/api/health
echo "✅ push-to-demo done. Demo login: https://mg-demo.powerbyte.app/demo-site/login (admin@demo.com)"
