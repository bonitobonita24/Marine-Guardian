#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# dev-archive-cron.sh — LOCAL DEV ONLY.
#
# Periodically archives newly-synced EarthRanger event photos to the dedicated
# dev Telegram channel ("Marine Guardian Dev Assets", -1004328491150). The
# er-sync worker pulls event/patrol DATA automatically, but photo archiving to
# Telegram is NOT a worker — it's the archive-er-assets script. This cron wraps
# it so dev images stay current with zero manual runs.
#
# Wired as a host crontab entry (every 15 min). Design notes:
#   - Idempotent: the archiver skips already-archived files (unique
#     tenantId_erFileId), so re-runs only upload genuinely new photos.
#   - flock (-n): if a previous run is still going, this tick is skipped (no
#     overlap / no pile-up).
#   - Safe no-op when the dev stack is down (checks the dev postgres container).
#   - Token/creds come from .env.dev (DAS_WEB_TOKEN, ENCRYPTION_KEY, DATABASE_URL);
#     nothing secret lives here.
#   - --limit is modest (default 40) — the archiver pages ER newest-first, so a
#     small limit catches the newest un-archived events each tick; the next tick
#     catches any remainder.
#
# Usage (normally via cron): scripts/dev-archive-cron.sh [LIMIT]
# ---------------------------------------------------------------------------
REPO="/home/me/UbuntuDevFiles/BlueAlliance/apps/Marine-Guardian"
export PATH="/home/me/.nvm/versions/node/v24.16.0/bin:/usr/bin:/bin"
export HOME="/home/me"
LOG="/tmp/mg-dev-archive-cron.log"
LOCK="/tmp/mg-dev-archive-cron.lock"
LIMIT="${1:-40}"

# keep the log from growing unbounded (retain last ~2000 lines)
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG" 2>/dev/null || echo 0)" -gt 2000 ]; then
  tail -n 1000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

# only run when the dev stack (postgres) is up — otherwise quietly no-op
if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^marine-guardian_dev_postgres$'; then
  echo "$(date -Is) [skip] dev postgres not running" >> "$LOG"
  exit 0
fi

cd "$REPO" || { echo "$(date -Is) [err] cd $REPO failed" >> "$LOG"; exit 1; }

# flock: skip this tick if a prior run is still active
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "$(date -Is) [skip] previous run still active" >> "$LOG"
  exit 0
fi

echo "$(date -Is) [run] archive-er-assets --limit $LIMIT" >> "$LOG"
pnpm --filter @marine-guardian/jobs exec tsx "$REPO/scripts/archive-er-assets.local.ts" --limit "$LIMIT" >> "$LOG" 2>&1
rc=$?
echo "$(date -Is) [done] exit=$rc" >> "$LOG"
exit "$rc"
