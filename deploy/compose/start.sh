#!/bin/bash
# Usage: bash deploy/compose/start.sh [dev|stage|prod] [up -d|down|restart|...]
# Dev:        rebuilds the app image from source on every up (--build flag)
# Stage/Prod: pulls pre-built image from Docker Hub — never builds from source
# No storage service — storage.enabled: false in inputs.yml

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

# MailHog dev-only email catcher
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
