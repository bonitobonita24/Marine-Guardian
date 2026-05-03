#!/bin/bash
# =============================================================
# Marine Guardian — Image Promotion Pipeline
# =============================================================
# Usage:
#   bash deploy/compose/push.sh dev       — build + test + push dev image to Docker Hub
#   bash deploy/compose/push.sh staging   — re-tag last dev image as staging, push
#   bash deploy/compose/push.sh prod      — re-tag last staging image as prod, push
#
# Prerequisites:
#   docker login                          — run once before first push
#   DOCKERHUB_USERNAME in your shell env  — or update IMAGE_BASE below
#
# =============================================================

set -e

# ── Config (from inputs.yml) ──
IMAGE_BASE="${DOCKERHUB_USERNAME:-bonitobonita24}/marine-guardian"
DOCKERFILE="apps/web/Dockerfile"
SHORT_SHA=$(git rev-parse --short HEAD)

# ── Guard: docker.publish check ──
if ! grep -q "publish: true" inputs.yml 2>/dev/null; then
  echo "❌ docker.publish is not set to true in inputs.yml. Aborting."
  exit 1
fi

# ── Guard: docker login check ──
if ! docker info 2>/dev/null | grep -q "Username"; then
  echo "❌ Not logged in to Docker Hub. Run: docker login"
  exit 1
fi

TARGET=${1:-dev}

case "$TARGET" in

  dev)
    echo "🔨 Building dev image from source..."
    docker build \
      --file "$DOCKERFILE" \
      --tag "${IMAGE_BASE}:dev-latest" \
      --tag "${IMAGE_BASE}:dev-sha-${SHORT_SHA}" \
      --platform linux/amd64 \
      .

    echo "🧪 Running tests before push..."
    bash deploy/compose/start.sh dev up -d
    sleep 5
    docker compose -f deploy/compose/dev/docker-compose.app.yml \
      exec app pnpm test --passWithNoTests || {
        echo "❌ Tests failed. Aborting push. Fix tests before pushing."
        bash deploy/compose/start.sh dev down
        exit 1
      }
    bash deploy/compose/start.sh dev down

    echo "📤 Pushing dev image to Docker Hub..."
    docker push "${IMAGE_BASE}:dev-latest"
    docker push "${IMAGE_BASE}:dev-sha-${SHORT_SHA}"

    echo "✅ Dev image pushed:"
    echo "   ${IMAGE_BASE}:dev-latest"
    echo "   ${IMAGE_BASE}:dev-sha-${SHORT_SHA}"
    echo ""
    echo "▶  To promote to staging: bash deploy/compose/push.sh staging"
    ;;

  staging)
    echo "🔁 Promoting dev image → staging..."
    docker pull "${IMAGE_BASE}:dev-latest"
    docker tag  "${IMAGE_BASE}:dev-latest" "${IMAGE_BASE}:staging-latest"
    docker tag  "${IMAGE_BASE}:dev-latest" "${IMAGE_BASE}:staging-sha-${SHORT_SHA}"
    docker push "${IMAGE_BASE}:staging-latest"
    docker push "${IMAGE_BASE}:staging-sha-${SHORT_SHA}"

    echo "✅ Staging image pushed:"
    echo "   ${IMAGE_BASE}:staging-latest"
    echo "   ${IMAGE_BASE}:staging-sha-${SHORT_SHA}"
    echo ""
    echo "📋 On your staging server (if not using Komodo auto-update):"
    echo "   docker compose -f deploy/compose/stage/docker-compose.app.yml pull"
    echo "   docker compose -f deploy/compose/stage/docker-compose.app.yml up -d"
    echo ""
    echo "▶  To promote to prod: bash deploy/compose/push.sh prod"
    ;;

  prod)
    echo "🚀 Promoting staging image → production..."
    docker pull "${IMAGE_BASE}:staging-latest"
    docker tag  "${IMAGE_BASE}:staging-latest" "${IMAGE_BASE}:latest"
    docker tag  "${IMAGE_BASE}:staging-latest" "${IMAGE_BASE}:prod-sha-${SHORT_SHA}"
    docker push "${IMAGE_BASE}:latest"
    docker push "${IMAGE_BASE}:prod-sha-${SHORT_SHA}"

    echo "✅ Production image pushed:"
    echo "   ${IMAGE_BASE}:latest"
    echo "   ${IMAGE_BASE}:prod-sha-${SHORT_SHA}"
    echo ""
    echo "📋 On your production server (Komodo UI → Deploy, or manually):"
    echo "   docker compose -f deploy/compose/prod/docker-compose.app.yml pull"
    echo "   docker compose -f deploy/compose/prod/docker-compose.app.yml up -d"
    echo ""
    echo "🔄 To rollback: set APP_IMAGE_TAG=prod-sha-{previous-sha} in .env.prod"
    echo "   then: docker compose -f deploy/compose/prod/docker-compose.app.yml up -d"
    ;;

  *)
    echo "Usage: bash deploy/compose/push.sh [dev|staging|prod]"
    exit 1
    ;;
esac
