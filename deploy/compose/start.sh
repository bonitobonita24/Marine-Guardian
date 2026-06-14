#!/bin/bash
# Usage: bash deploy/compose/start.sh [dev|stage|prod] [up -d|down|restart|...]
# Dev:        rebuilds the app + pdf-renderer images from source on every up (--build)
# Stage/Prod: pulls pre-built images from Docker Hub — never builds from source
# Storage:    MinIO via docker-compose.storage.yml — ALL envs (MinIO-per-stack)
# PDF:        pdf-renderer via docker-compose.pdf-renderer.yml — ALL envs
# MailHog:    docker-compose.infra.yml — dev only (stage/prod use real SMTP)

set -e

ENV=${1:-dev}
CMD=${@:2}
BASE=deploy/compose/$ENV
ENV_FILE=".env.${ENV}"

if [ ! -d "$BASE" ]; then
  echo "❌ Environment '$ENV' not found at $BASE"
  echo "   Usage: bash deploy/compose/start.sh [dev|stage|prod] [up -d|down|...]"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Environment file '$ENV_FILE' not found"
  exit 1
fi

COMPOSE="docker compose --env-file $ENV_FILE -f"

# DB always first — it creates the shared Docker network
$COMPOSE $BASE/docker-compose.db.yml $CMD

$COMPOSE $BASE/docker-compose.cache.yml $CMD
$COMPOSE $BASE/docker-compose.pgadmin.yml $CMD

# MinIO (S3-compatible storage) — ALL envs (MinIO-per-stack).
# Wired 2026-05-23 (dev) after the S551 Per Area Report smoke test exposed the
# gap: packages/storage + reportExport pipeline expect this service to exist.
# Stage/prod compose added 2026-06-14 — own MinIO container per env, no host
# port exposure (S3 API + console internal to app_network only).
$COMPOSE $BASE/docker-compose.storage.yml $CMD

# MailHog dev-only email catcher. Stage/prod send via real SMTP (SMTP_* in
# .env.staging / .env.prod), so no MailHog there.
if [ "$ENV" = "dev" ]; then
  $COMPOSE $BASE/docker-compose.infra.yml $CMD
fi

# Dev: --build forces rebuild from source on every up
# Stage/Prod: pull pre-built image, no rebuild
if [ "$ENV" = "dev" ] && [[ "$CMD" == *"up"* ]]; then
  docker compose --env-file $ENV_FILE -f $BASE/docker-compose.app.yml up --build -d
else
  $COMPOSE $BASE/docker-compose.app.yml $CMD
fi

# pdf-renderer (Puppeteer PDF service) — ALL envs.
# Dev rebuilds from source on every up; stage/prod pull the pre-built
# marine-guardian-pdf image pushed by push.sh. Internal network only — no
# host port exposure; the app calls it server-side over app_network.
if [ "$ENV" = "dev" ] && [[ "$CMD" == *"up"* ]]; then
  docker compose --env-file $ENV_FILE -f $BASE/docker-compose.pdf-renderer.yml up --build -d
else
  $COMPOSE $BASE/docker-compose.pdf-renderer.yml $CMD
fi
