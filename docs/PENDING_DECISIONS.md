# Marine Guardian — Pending Owner Decisions / Gates

> Un-gated work continues regardless; these items are re-surfaced each session until resolved.

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

**Decision needed from owner:**
- [ ] Provide `DAS_WEB_TOKEN` (+ confirm `ER_BASE_URL`) for local ingestion against the live ER server.
- [ ] Confirm image scope: ingest ALL historical event photos into MinIO (storage cost), or lazy/on-demand fetch.

## 2026-06-25 — Deploy posture
- Owner directive: **local dev ONLY**; staging/prod paused. The earlier merged distance fix (PR #27, on `main`) is NOT to be deployed to prod yet. Prod track-materialize backfill is therefore also deferred until staging/prod is re-enabled.

## 2026-06-27 — Command Center tactical redesign follow-ups  (work DONE, these are owner [WHAT] decisions)

Redesign GOAL COMPLETE + Visual-QA verified — spec `docs/superpowers/specs/2026-06-26-command-center-redesign-design.md`;
sub-batches A `23c97a4` / B `c6f6527` / C `9586d39` / D `8940b47` all merged to LOCAL `main` (1026→1038 tests).
These are the open owner decisions surfaced at close-out — re-surface each loop until answered:

- [ ] **Push to origin / deploy?** All 4 redesign commits + QA evidence are on LOCAL `main`, NOT pushed
      (honoring the standing local-dev-only directive; I do not push/deploy without explicit go-ahead).
      → Owner: push to origin? (Staging/prod stays paused regardless unless that directive is lifted too.)
- [ ] **Ranger Roster demo data.** The new roster panel renders 0/0/0 on demo-site because the
      `AccompanyingRanger`↔`KnownRanger` links are sparse in seed (same data reality that blanks
      active-patrol leaders). Panel + queries are correct; populates against real ER data.
      → Owner: expand seed to wire rangers onto patrols so the roster demos with content, or leave as-is?
- [ ] **Back-port tactical direction into `docs/PRODUCT.md`** (Rule 9 / Rule 1 — human-owned file).
      War Room section should note: dark-locked tactical command-center direction + KPI sparklines +
      ranger roster + coverage-% surfaces. → Owner edits PRODUCT.md (or approves a described diff).
