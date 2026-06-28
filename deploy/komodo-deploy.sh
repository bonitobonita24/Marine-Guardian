#!/usr/bin/env bash
# komodo-deploy.sh — trigger a Komodo stack redeploy from CI (GitHub Actions).
#
# This is the Powerbyte fleet's Watchtower replacement: instead of Komodo polling
# Docker Hub, GitHub Actions calls the Komodo API directly after the image push so
# the new image goes live within seconds, deterministically, in push order.
#
# Canonical source: Server-Setups/Powerbyte-Hostinger/komodo/ci-deploy/komodo-deploy.sh
# Vendored copy in each app repo at: deploy/komodo-deploy.sh
# Runbook: Server-Setups/Powerbyte-Hostinger/runbooks/komodo-ci-deploy.md
#
# Why the API and not the git-listener webhook: Komodo's /listener webhook does NOT
# fire for files-on-host stacks, and the registry poll is hourly (too slow as a
# signal). The /execute DeployStack API call is instant and works for every stack
# type. (Proven in production by the fmo-fisherfolk stack.)
#
# ---------------------------------------------------------------------------------
# Required env:
#   KOMODO_HOST          e.g. https://kmd.powerbyte.app   (no trailing slash needed)
#   KOMODO_API_KEY       Komodo API key  (use the dedicated github-actions-ci key,
#   KOMODO_API_SECRET    Komodo API secret  NOT the master key)
#   KOMODO_STACK         stack name or id, e.g. yelli-staging
#
# Optional env (SHA-immutable deploys — recommended):
#   IMAGE_TAG            exact tag to deploy, e.g. sha-1a2b3c4  (or staging-latest)
#   KOMODO_TAG_VAR       Komodo Variable name the stack interpolates for its image
#                        tag, e.g. YELLI_STAGING_TAG. When both IMAGE_TAG and
#                        KOMODO_TAG_VAR are set, the script sets the Variable to
#                        IMAGE_TAG (UpdateVariableValue) BEFORE deploying, so the
#                        stack pins the exact image. Omit both to deploy whatever
#                        tag the stack already references (FMO-style :latest+auto_pull).
#
# Optional env (behaviour):
#   KOMODO_SERVICES      comma-separated services to deploy (default: all)
#   KOMODO_POLL          "true" to poll the update to completion (default: true)
#   KOMODO_POLL_TIMEOUT  seconds to wait for completion (default: 300)
# ---------------------------------------------------------------------------------
set -euo pipefail

: "${KOMODO_HOST:?KOMODO_HOST is required}"
: "${KOMODO_API_KEY:?KOMODO_API_KEY is required}"
: "${KOMODO_API_SECRET:?KOMODO_API_SECRET is required}"
: "${KOMODO_STACK:?KOMODO_STACK is required}"
HOST="${KOMODO_HOST%/}"
POLL="${KOMODO_POLL:-true}"
POLL_TIMEOUT="${KOMODO_POLL_TIMEOUT:-300}"

# The Mozilla UA header is required: kmd.powerbyte.app sits behind Cloudflare, which
# challenges default curl/bot user-agents. (Carried over from the fmo-fisherfolk workflow.)
kmd() { # kmd <endpoint> <json-body>
  curl -fsS --retry 3 --retry-delay 4 --retry-all-errors \
    -X POST "$HOST/$1" \
    -H "Content-Type: application/json" \
    -H "User-Agent: Mozilla/5.0 (github-actions) Chrome/120" \
    -H "X-Api-Key: $KOMODO_API_KEY" \
    -H "X-Api-Secret: $KOMODO_API_SECRET" \
    -d "$2"
}

json_str() { printf '%s' "$1" | jq -Rs .; }  # safely JSON-encode an arbitrary string

# 1) SHA-immutable: pin the image tag via a Komodo Variable, then deploy that exact tag.
if [ -n "${KOMODO_TAG_VAR:-}" ] && [ -n "${IMAGE_TAG:-}" ]; then
  echo "→ Pinning Komodo variable [[${KOMODO_TAG_VAR}]] = ${IMAGE_TAG}"
  kmd write "{\"type\":\"UpdateVariableValue\",\"params\":{\"name\":$(json_str "$KOMODO_TAG_VAR"),\"value\":$(json_str "$IMAGE_TAG")}}" >/dev/null
fi

# 2) Build DeployStack params (optional service filter).
services_json="[]"
if [ -n "${KOMODO_SERVICES:-}" ]; then
  services_json=$(printf '%s' "$KOMODO_SERVICES" | jq -Rc 'split(",") | map(gsub("^\\s+|\\s+$";""))')
fi
deploy_body="{\"type\":\"DeployStack\",\"params\":{\"stack\":$(json_str "$KOMODO_STACK"),\"services\":${services_json}}}"

echo "→ DeployStack: ${KOMODO_STACK}${IMAGE_TAG:+ (tag ${IMAGE_TAG})}"
resp=$(kmd execute "$deploy_body")
update_id=$(printf '%s' "$resp" | jq -r '._id."$oid" // ._id // .id // empty' 2>/dev/null || true)
echo "  update id: ${update_id:-<none returned>}"

# 3) Poll the update to completion so CI reflects the real deploy result.
if [ "$POLL" = "true" ] && [ -n "$update_id" ]; then
  echo "→ Polling update ${update_id} (timeout ${POLL_TIMEOUT}s)…"
  deadline=$(( $(date +%s) + POLL_TIMEOUT ))
  while :; do
    upd=$(kmd read "{\"type\":\"GetUpdate\",\"params\":{\"id\":$(json_str "$update_id")}}")
    status=$(printf '%s' "$upd" | jq -r '.status // empty')
    success=$(printf '%s' "$upd" | jq -r '.success // empty')
    if [ "$status" = "Complete" ]; then
      if [ "$success" = "true" ]; then
        echo "✓ Deploy complete: ${KOMODO_STACK} is live${IMAGE_TAG:+ on ${IMAGE_TAG}}."
        exit 0
      fi
      echo "✗ Deploy FAILED for ${KOMODO_STACK}. Komodo update log:"
      printf '%s' "$upd" | jq -r '.logs[]? | "--- " + (.stage // "stage") + " ---\n" + (.stdout // "") + "\n" + (.stderr // "")' 2>/dev/null || printf '%s\n' "$upd"
      exit 1
    fi
    [ "$(date +%s)" -ge "$deadline" ] && { echo "✗ Timed out after ${POLL_TIMEOUT}s waiting for ${KOMODO_STACK}."; exit 1; }
    sleep 5
  done
fi

echo "✓ DeployStack request accepted for ${KOMODO_STACK} (not polled)."
