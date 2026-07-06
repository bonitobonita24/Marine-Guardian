# Marine Guardian — Pending Owner Decisions / Gates

> Un-gated work continues regardless; these items are re-surfaced each session until resolved.

## 2026-07-07 — Ranger roster sync bug (FIXED) + related decisions

**Context (owner report, 2026-07-07):** Command Center roster showed "Apo Reef LGU" ON PATROL, but
the live ER server's active patrol #5251 is tracked by **Benedicto Cabiguen Sr.** Root-caused to two
EarthRanger patrol-sync defects: (A) the live sync never wrote `patrol_segments` leaders → the real
active patrol's tracker never matched; (B) finished patrols were never closed in our DB (ER #5235
"Apo Reef LGU" was `done` since Jul 4 but stuck `open` here). **DATA reconciled against live ER +
verified** (roster now = Benedicto + Eufenie, matching ER's 2 active). **Durable code fix + reusable
reconciliation script shipped** (LOCAL, HARD HOLD). Un-gated — no owner decision required for the fix.

**Deferred / owner items:**
- [ ] **"Only super_admin" for Users + Settings (ACCESS, not just nav).** Batch-14 kept `site_admin`
  able to manage users + tenant settings (`siteAdminProcedure` = super_admin + site_admin), and the
  nav now hides those items from everyone except those two roles. Owner earlier said "only SuperAdmin"
  — deferred because REMOVING `site_admin`'s access would lock the natural settings-owner role out of
  Settings/User-management. Confirm: tighten to **super_admin-ONLY** (drop site_admin), or keep both?
- [ ] **ER tracks-401 durability (external, both staging + prod).** `DAS_WEB_TOKEN` 401s on
  `/subject/{id}/tracks` → recurring sync harvests events/patrols/subjects but NOT new GPS tracks.
  Needs an ER-side grant (das_web account track/observation permission) OR a dedicated long-lived
  track token wired into the sync. Requires ER admin action — cannot self-resolve.
- Hardening note (non-blocking, [HOW]): nav now hides /users + /settings from field_coordinator/
  operator, but `middleware.ts` only route-blocks viewer + administrator, so those two roles could
  still TYPE the URL (tRPC already denies all data/mutations, so no leak). Optional: extend the
  middleware deny-list for parity with the administrator route gate.

## 2026-06-25 — Goal Item 2: EarthRanger data completeness + images  🔴 GATED (needs ER token)

**Asked:** Verify the local DB holds ALL EarthRanger data (patrols AND events, **including images**) from at least 2024-01-01 → now; backfill gaps.

**What was verified locally (un-gated, DONE):**
- Date coverage exists for both: patrols 2023(170)/2024(1347)/2025(1795)/2026(1352); events 2023(223)/2024(753)/2025(23299)/2026(11203). 2024-onward coverage is present.
- ⚠ 2024 events (753) look thin vs 2025 (23299) — may be a partial 2024 ingestion, but this cannot be confirmed without querying the live ER server.
- ❌ **Images are NOT stored.** Only a `has_photo` boolean flag exists on `events`. There is **no** photo/image/attachment/media table, and `scripts/ingest-earthranger.mjs` has **no** image-download logic. The actual photo files were never ingested.

**Why gated (blocked on owner):**
1. **Live verification vs ER server** needs a real `DAS_WEB_TOKEN` for `mindoro.pamdas.org`. Local dev's tenant ER connection is the placeholder `https://fake-er.example.com` (status `error`). The token is not in the local env. → Owner must provide `DAS_WEB_TOKEN` (and/or `ER_BASE_URL`) so a completeness audit + any gap backfill can run.
2. **Image ingestion is new work**, not just verification: requires (a) the ER token, (b) a download path for event attachments (ER `/activity/events/{id}/files` or equivalent), (c) storage (MinIO bucket already exists) + a new `event_image`/`attachment` schema table + FK, (d) ingest-script extension. This is a feature build, owner to confirm scope (download all historical photos vs. on-demand).

**Un-gated follow-ups already actionable once token is supplied:** run `ingest-earthranger.mjs` (DAS_WEB_TOKEN set) to confirm/backfill 2024 events; design the attachment schema.

**UPDATE 2026-06-27 — DAS_WEB_TOKEN SUPPLIED + VERIFIED + STORED (3 places):**
- Token `0M4tftKX…` validated against mindoro.pamdas.org (user JerlanL / id 3646de4e-…).
- (a) **Per-tenant in DB (app mechanism):** demo-site `tenant_er_connections` now holds the real
  base_url + encrypted api_token_enc (replaced the fake-er placeholder). Set via new reusable
  `scripts/set-er-connection.ts` (encrypt() + upsert; works for ANY tenant). status="unchecked"
  (validate via Settings → Test). decrypt roundtrip verified true. Recurring sync left OFF (not auto-started).
- (b) **Server-Setups (canonical off-app copy):** `Powerbyte-Hostinger/secrets/marine-guardian-earthranger.enc.yaml`
  (das_web_token + er_base_url + er_user_id + er_username; SOPS+age).
- (c) **.env.dev (tooling only, gitignored):** DAS_WEB_TOKEN + ER_BASE_URL for the ingest/archive scripts.
- New-tenant onboarding: `set-er-connection.ts --tenantId <id> --token <tok>` (or DAS_WEB_TOKEN env).
- Remaining ER-completeness gate (2024-events thinness) is now runnable anytime via ingest with the token.

**Decision needed from owner:**
- [ ] Provide `DAS_WEB_TOKEN` (+ confirm `ER_BASE_URL`) for local ingestion against the live ER server.
- [ ] Confirm image scope: ingest ALL historical event photos into MinIO (storage cost), or lazy/on-demand fetch.

## 2026-06-25 — Deploy posture
- Owner directive: **local dev ONLY**; staging/prod paused. The earlier merged distance fix (PR #27, on `main`) is NOT to be deployed to prod yet. Prod track-materialize backfill is therefore also deferred until staging/prod is re-enabled.

## 2026-06-27 — Command Center tactical redesign follow-ups  — ✅ ALL THREE ANSWERED + ACTIONED

Redesign GOAL COMPLETE + Visual-QA verified — spec `docs/superpowers/specs/2026-06-26-command-center-redesign-design.md`;
sub-batches A `23c97a4` / B `c6f6527` / C `9586d39` / D `8940b47` merged to `main` (1026→1038 tests).
Owner answered 2026-06-27:

- [x] **Push to origin — YES (no staging/prod yet).** Owner: "push only no staging and production yet."
      → Pushed `main` to origin. Staging/prod deploy remains paused (see Deploy posture below).
- [x] **Ranger Roster — YES, use real harvested ER data.** Owner: "use the data we harvested in ER server
      for seeding and demo purposes. it's actually will be our Staging and Production."
      → DONE (`45e804c`): `scripts/backfill-rangers-from-segments.ts` derived 56 real rangers from
      `patrol_segments.leader_er_id/leader_name` into `known_rangers` + 4653 patrol `AccompanyingRanger`
      links for demo-site. Roster now: total 56 / onPatrol 2 / active 28. Synthetic seed names were NOT used.
      ⚠ Side fix during this: the live dev DB had drifted — the two polymorphic FKs
      `accompanying_ranger_event_fk` / `accompanying_ranger_patrol_fk` had been re-added by a prior
      `prisma db push` (migration history's correct final state drops them). Dropped them again on the dev
      DB to match schema intent. This ALSO un-broke `event.addAccompanyingRanger`, which 500s while those
      FKs exist. LATENT RISK: any future `prisma db push` against this DB re-adds them (schema.prisma must
      keep the relations for `include` support). A fresh `prisma migrate deploy` produces the correct
      no-FK state. Keep this in mind if this DB is promoted to staging/prod.
- [x] **Back-port to `docs/PRODUCT.md` — DONE (owner delegated "you decide, align to ours").**
      Added 4 dated bullets (2026-06-26) to the Command Center War Room section: tactical dark-locked
      command-center direction, KPI sparklines, Ranger Roster panel (ER-derived), coverage-% headline.
      product-sync check passed.

### DEFERRED FOLLOW-UP (un-gated, technical — not blocking)
- **Durable ranger auto-populate in ER sync.** The backfill is one-time against already-harvested
  segments. To keep `KnownRanger`/`AccompanyingRanger` fresh on future LIVE ER syncs, extend
  `er-sync.processor.ts syncPatrols` to upsert KnownRanger from segment leaders + create AccompanyingRanger
  per patrol (same pattern as the Patrol/Event v2 sync mappers). Gated in practice on a live `DAS_WEB_TOKEN`
  (ER recurring sync is not running in dev) — folds naturally into the Item-2 ER-completeness work below.

## 2026-06-27 — Telegram channel as ER asset storage  🟢 SETUP DONE + VERIFIED — archiver build is next

**Backend decided (owner, 2026-06-27): Bot + private channel.** Premium NOT needed for this path
(ER assets are JPEG photos ~1–8MB, under the 50MB bot limit; ban-safe ToS-sanctioned automation).
Owner may hold/cancel Premium to save cost.

**Set up + verified end-to-end:**
- Bot `@MarineGuardian_bot` (id 8642959831), admin of PRIVATE channel "Marine Guardian — ER Assets"
  (`chat_id -1003816125998`).
- E2E test PASSED: real ER event photo (#36125, 1.3MB 4080×2288) downloaded with DAS_WEB_TOKEN →
  uploaded to channel (message_id 5).
- Creds stored ENCRYPTED: `Server-Setups/Powerbyte-Hostinger/secrets/marine-guardian-telegram.enc.yaml`
  (SOPS+age; keys `telegram_bot_token` / `telegram_bot_username` / `telegram_chat_id` / `telegram_channel_title`).
  NEVER copied into the app repo (Server-Setups is canonical).
- Verifier tool committed: `scripts/telegram-verify.mjs` (c0418f7).
- DAS_WEB_TOKEN verified valid (user JerlanL / id 3646de4e-…; live counts events 35708 / patrols 4825 —
  local DB ~230 events / ~41 patrols behind → a sync run backfills the gap).

**BUILD PROGRESS (2026-06-27, owner: single channel PER TENANT; "push images to TG + fix in-app links to fetch from TG"; same for dev/staging/prod):**
- ✅ Stage 1 — schema: `EventAsset` table + `tenant.telegramChannelId` (migration 20260627060000, applied, 7/7 typecheck).
- ✅ Stage 2 — `packages/jobs/src/lib/telegram-storage.ts` (uploadDocumentToTelegram / fetchTelegramFileBytes / getTelegramBotToken).
- ✅ Stage 3 — `scripts/archive-er-assets.ts` (ER events→download→TG upload→record event_assets, idempotent on er_file_id; --limit/--dry-run). Re-exported from jobs index.
- ✅ Stage 5 (partial) — demo-site `telegram_channel_id = -1003816125998`; `TELEGRAM_BOT_TOKEN` in .env.dev (gitignored). Also synced newest ~237 ER events (events 35478→35715, closes part of the ER-completeness gap).
- ✅ LIVE PROOF — archiver uploaded 4 real ER photos (event da05a988, messages 6–9) to the channel, recorded in event_assets with telegram_file_id; re-run skipped all 4 (idempotency proven, 0 dupes).

**REMAINING:**
- ⬜ Stage 4 — IN-APP "fix the link": `/api/assets/[id]` route that streams bytes from Telegram (server-side bot token via fetchTelegramFileBytes) + event-detail "Photos" UI reading event_assets. (Touches web app — next focused session to avoid context thrash.)
- ⬜ Refinements: archiver inter-upload delay (avoid Telegram burst 429) + download retry (one file "fetch failed" twice on ER download); set size_bytes (currently null); wire archiver into ER sync for ongoing archive + a full historical backfill run.
- ⬜ Stage 5 (rest) — TELEGRAM_BOT_TOKEN into .env.staging/.env.prod; per-tenant channel for any new tenant.

(original NEXT BUILD spec retained below for reference)
**NEXT BUILD (un-gated now — all creds exist):** ER → Telegram asset archiver.
- New schema: `event_image` / `attachment` table (er_file_id, event_id/patrol_id, filename, file_type,
  telegram_message_id, telegram_file_id, uploaded_at) + FK + tenant scope.
- Archiver job: for events with `files[]`, download each `file.images.original` with DAS_WEB_TOKEN →
  upload to channel via **sendDocument** (preserves original bytes; sendPhoto downscales) → store the
  returned message_id/file_id against the event. Idempotent (skip already-archived er_file_id).
- App: surface a "Photos" affordance on the event detail that links/retrieves from the channel.
- Still owner [WHAT] to confirm before build: one channel for all tenants vs per-tenant; archive ALL
  historical photos vs recent/on-demand. (Default proposal: single channel, archive on sync going forward
  + a one-time historical backfill script.)

---

## 2026-06-27 — (superseded) original Telegram request note
- **Asked:** Use the Telegram credentials in Server-Setups (`Powerbyte-Hostinger`) to create a channel that
  stores all ER assets — images & files attached to reported events / patrols.
- **Feasibility (initial read):** Viable. Telegram bot API can create/post to a channel and host files
  (up to 2 GB/file via bot, free, durable). Credentials live at
  `~/UbuntuDevFiles/1_COMPANY_DEV/Server-Setups/Powerbyte-Hostinger/secrets/` (SOPS+age — `sops -d`).
  This directly addresses the long-open **Item 2 image-ingestion gap** (no image table / no download logic /
  no storage decision). Telegram could BE the storage answer (vs MinIO) — owner to confirm which.
- **Scope to confirm before building (owner [WHAT]):** (a) Telegram-as-primary-store vs MinIO-primary +
  Telegram-mirror; (b) all historical photos vs on-demand; (c) one channel for all tenants vs per-tenant.
  STILL needs a live `DAS_WEB_TOKEN` to fetch ER attachments (same gate as Item 2).
- **Decision needed:** [ ] Confirm storage approach + provide `DAS_WEB_TOKEN` so attachment ingestion
  (Telegram or MinIO) can be built.

---

## 2026-06-28 — R2 24h-TTL photo cache (PLANNED, build deferred — owner Option A)
- **Context:** Image serving (`/api/assets/[id]`) proxies Telegram on every view (2 round-trips, no cache)
  — bottleneck for the Command Center / Interactive Report Map. Owner proposed Cloudflare R2 as a *cache*
  (not storage): pull from Telegram on miss → write-through to R2 with 24h expiry → serve; object auto-deletes
  24h after creation and re-populates on next access (keeps R2 tiny).
- **Status:** Architect plan COMPLETE → `docs/plans/r2-photo-cache-plan.md`. Owner chose **Option A**:
  defer the BUILD to a future session; measure real image-load latency after the photo backfill completes
  first (Phase A CDN cache-headers alone may suffice). NOT built. No code changed.
- **Decision needed (next session):** [ ] After measuring latency, approve building R0→R2 (R2 client module
  → flag-gated route read-through → live verify + Visual QA). R2 creds already exist
  (`Server-Setups/Powerbyte-Hostinger/secrets/cloudflare-r2.enc.yaml`). Deploy HARD HOLD respected.
