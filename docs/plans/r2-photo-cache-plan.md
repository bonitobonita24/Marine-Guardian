# Plan — Cloudflare R2 as a 24h-TTL read-through cache for Telegram event photos

> **Status: PLANNED, NOT BUILT. Deferred to a future session (owner chose Option A — measure first, then build).**
> Owner-confirmed design: R2 used as a *cache*, not storage — pull from Telegram on a miss,
> write-through to R2 with a 24h expiry, serve; object auto-deletes 24h after creation and
> re-populates on the next access. Keeps R2 footprint tiny (working set only).
> Authored 2026-06-28 by the Plan architect agent (Opus 4.8 session). Respects deploy HARD HOLD
> (local dev only until owner approves staging/prod).

## Why
Current image path `apps/web/src/app/api/assets/[id]/route.ts` proxies Telegram on **every** view
(`getTelegramBotToken` + `fetchTelegramFileBytes` = 2 Telegram round-trips per image, no cache,
subject to Telegram `getFile` rate limits). On the Command Center / Interactive Report Map (many
markers, repeated modal opens, multiple operators viewing the same event) this is the bottleneck.

Two complementary layers (ship both eventually):
- **R2 read-through cache** — kills the origin→Telegram round-trips (server-side, cross-user, cross-request).
- **Phase A: `Cache-Control: private, immutable` + CDN** — kills repeat origin hits per browser/edge.
EventAsset rows + bytes are immutable, so aggressive caching is safe.

## Decisions (resolved)
1. **R2 client** — new module `packages/storage/src/r2-cache.ts` with its OWN lazy `S3Client`
   (don't bolt onto `index.ts`'s MinIO singleton). R2 is S3-compatible: `region: "auto"`,
   `forcePathStyle: true`. Surface: `getR2CacheClient`, `getCacheBucketName`,
   `buildCacheKey(tenantId, assetId)`, `putCacheObject`, `getCacheObject` (null on NoSuchKey),
   `deleteCacheObject`, `__resetR2ClientForTesting`.
   Env: distinct `R2_*` namespace (`R2_ACCOUNT_ID`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_CACHE_BUCKET?`, `R2_CACHE_ENABLED`). Secrets source =
   `Server-Setups/Powerbyte-Hostinger/secrets/cloudflare-r2.enc.yaml` (already exists) — never
   copy values into repo; add a one-line pointer in CLAUDE.md. Add `r2_cache:` block to inputs.yml.
2. **Cache key** — `${tenantId}/${eventAssetId}` (immutable id, never attacker-chosen; tenant
   prefix = defence-in-depth, real auth stays the DB `findFirst({id, tenantId})`). `contentType`
   stored as R2 object metadata. Dedicated cache bucket per env: `marine-guardian-<env>-photo-cache`
   (separate from the durable `-exports` bucket).
3. **24h expiry** — whole-bucket R2 lifecycle "expire 1 day after creation" (1-day min granularity;
   safe because the bucket is cache-only). TTL-from-creation, not LRU. Miss after expiry → re-pull
   from Telegram → write-through re-creates → fresh 24h. Hot assets stay warm; cold assets fall out.
   Configured once via `scripts/setup-r2-cache-bucket.ts` (idempotent create + lifecycle). App code
   never sets per-object TTL. Lifecycle deletion is async/best-effort (harmless for a cache).
4. **Serve strategy** — PROXY-STREAM R2 bytes through the existing route (keep auth/audit/SAFE_INLINE
   allowlist/sandbox CSP/nosniff at origin). Do NOT redirect to a public/presigned R2 URL (capability
   leak / cross-tenant / bypasses audit + rate limiter). **SAFE_INLINE/disposition must keep gating on
   `row.mimeType ?? mimeFromFilename(row.filename)`, NOT the cached contentType** (cache must not widen
   inline-serve). Audit stays before byte-fetch → HIT and MISS audited identically.
5. **Failure modes** — cache strictly best-effort; Telegram is source of truth. R2 read error → null →
   fall through to Telegram. R2 write error → swallowed (next request is another miss). Write-through:
   `await tryPutCache(...)` inside a swallow-all wrapper (not fire-and-forget — short-lived runtimes can
   kill dangling promises); only MISS responses pay the extra PUT latency. `R2_CACHE_ENABLED` unset =
   byte-for-byte identical to today (ship dark, flip on in dev).
6. **Phase A coexists** — strengthen route `Cache-Control` to long-lived `private, immutable` (rows
   immutable); R2 sits behind it. Keep `private` (auth-gated). Owner-gated (Phase R3).
7. **Free tier** — 10 GB stored / account (shared with other Powerbyte R2 assets), 1M Class-A / 10M
   Class-B ops/mo, egress FREE (the reason R2 fits). 24h TTL ⇒ steady-state ≈ photos viewed in last
   ~24h ≈ sub-1 GB. Dedicated bucket for independent observability; document the shared 10 GB ceiling.
8. **Tests + harness** — route unit tests (R2 + telegram mocked; HIT / MISS / R2-read-fail / R2-write-fail
   / flag-off / tenant-isolation / allowlist-not-widened). `r2-cache.ts` unit tests mirror
   `storage/index.test.ts`. Live `scripts/verify-r2-cache.ts` = **Mode-A** (synchronous read-through, NOT
   a BullMQ job): pre-clean key → MISS proof (bytes, length vs sizeBytes) → poll R2 HEAD until present →
   HIT proof (identical bytes + Telegram NOT re-hit). Extract `resolveAssetBytes(row)` core shared by
   route + harness.

## Phased rollout (each = own feat/ branch, Phase-7 HARD PRE-MERGE GATE, squash-merge, local dev only)
- **R0** — `packages/storage/src/r2-cache.ts` + tests; `env.ts` `R2_*`; `.env.*`/`.env.example`/
  `CREDENTIALS.md`/`inputs.yml`/`CLAUDE.md` pointer; `scripts/setup-r2-cache-bucket.ts` (run once on dev R2).
  Ships dark (no route change). Risk: env namespace drift → mitigated by distinct `R2_*` + presence assert.
- **R1** — `apps/web/src/server/lib/asset-bytes.ts` (`resolveAssetBytes`: cache→telegram→best-effort
  write-through); wire into `route.ts` between audit and response (headers/allowlist/audit unchanged);
  extend route tests (6 cases). Flag off first (regression-safe), then flip on in dev.
- **R2** — `scripts/verify-r2-cache.ts` Mode-A harness → run PASS; rebuild dev `app` container FIRST
  (no bind-mount) → Visual QA photo in EventDetailModal / Report Map; DECISIONS_LOG entries; PRODUCT.md back-port.
- **R3 (owner-gated, deferred)** — Phase A header strengthening; optionally evaluate custom-domain/redirect
  if volume warrants (revisits Decision 4).

Cross-cutting: R2 needs `region:"auto"` + `forcePathStyle:true` (verify via Context7 on `@aws-sdk/client-s3`
+ R2 docs at build). Bucket + lifecycle creation in staging/prod are MANUAL owner-run steps (HARD HOLD).

## Prerequisite before building (owner's Option A)
Measure real image-load latency once the photo backfill completes (so we know whether Phase A alone
suffices before building the R2 layer). Then build R0→R2.
