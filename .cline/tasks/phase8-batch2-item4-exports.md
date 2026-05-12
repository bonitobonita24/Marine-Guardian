# Phase 8 Batch 2 Item 4 — PDF/CSV Exports per Entity

**Status:** READY TO EXECUTE (planned 2026-05-12 afternoon)
**Tier classification:** Tier 2, parallel-safe per entity after foundation
**Estimated total:** ~25 files across 5 sub-sessions
**Branch root:** `feat/exports-*` (one branch per sub-session, squash-merge each)

---

## Locked decisions (DO NOT re-ask)

| Decision | Value | Rationale |
|---|---|---|
| Access control | **All authenticated roles can export** | Anyone who can see data in-app can export it. Tenant scoping still applies — only requesting tenant's rows ever leave the system. |
| Filter behavior | **Respect current UI filter state** | Filters in URL query string; route handler reuses the entity's list-endpoint Zod schema to validate. Matches operator mental model ("export what I'm looking at"). |
| Audit trail | **Write AuditLog DATA_EXPORT row per export** | Consistency with the L5 always-on audit pattern. Data egress is operationally more sensitive than internal mutations — log who took what off-system. Records: userId, tenantId, entity, format, filterHash (sha256 of normalized query string), rowCount. |
| CSV format | **Hand-rolled `toCsv()` helper, no library** | Keeps deps lean. ~30 LOC handles RFC 4180 escaping (quotes, commas, newlines, BOM for Excel). |
| PDF format | **`@react-pdf/renderer`** | JSX composition matches React mindset, `renderToBuffer` works server-side, MIT licensed, ~3MB install. Alternatives rejected: pdfkit (imperative API, less maintainable), puppeteer (200MB+ Chromium overhead, unacceptable bloat for occasional exports). |
| Endpoint pattern | **Next.js Route Handlers at `/api/exports/{entity}/route.ts`** | tRPC returns JSON — wrong fit for binary blobs. Route Handler returns `Content-Type: text/csv` or `application/pdf` directly with proper `Content-Disposition: attachment; filename="..."`. |
| Auth pattern | **Manual auth + tenant verification in each Route Handler** | Per CLAUDE.md security rules: Route Handlers bypass tRPC middleware, MUST manually verify. Header comment `// Non-tRPC: manual auth required` on each. Shared helper extracts session/tenant/roles. |
| UI download trigger | **Native `<a download href=...>` button** | No JS download library needed. Browser handles file save. URL captures current filter state by reading from search params or page state. |
| Filename convention | `{entity}-{tenant-slug}-{YYYYMMDD-HHmmss}.{csv\|pdf}` | Sortable, tenant-scoped, no collisions. |
| Hard row cap | **10,000 rows per export** | Protects against runaway exports. Endpoint returns HTTP 413 with `{ error: "Result set too large, narrow filters and try again", rowsRequested: N, limit: 10000 }` when exceeded. |
| Rate limiting | **`rateLimiters.upload` tier (20/min)** | Reuses existing rate limiter. Exports are server-heavy, treat like file uploads. |

---

## Sub-session 0 — Foundation (DO FIRST, blocks SS-1..4)

**Branch:** `feat/exports-foundation`
**Token estimate:** ~25K
**Tier:** 2 (under threshold but at the boundary — Opus-direct recommended per §2.5b given hook-injection pattern)

### Files to create
- `apps/web/src/server/lib/route-auth.ts`
  - Exports `requireRouteAuth(req: NextRequest): Promise<{ userId: string; tenantId: string; roles: UserRole[] }>` — verifies session via Auth.js, throws `Response` with 401 if missing/invalid.
  - Wraps `auth()` from `@/auth`, asserts session.user.tenantId is present.
- `apps/web/src/server/lib/export-csv.ts`
  - Exports `toCsv<T>(rows: T[], columns: { key: keyof T; label: string; format?: (v: unknown) => string }[]): string`.
  - RFC 4180: fields containing `,`, `"`, `\n`, or `\r` get wrapped in `"..."` with internal `"` doubled. CRLF line endings. Optional UTF-8 BOM prefix for Excel compat.
  - ≤30 LOC.
- `apps/web/src/server/lib/export-pdf.tsx`
  - Exports `<ExportPdfDocument>` React-PDF component: header (tenant name + entity name + ISO timestamp + filter summary string), table primitive with column headers + row striping, footer (page N of M).
  - Exports `renderExportPdf(props): Promise<Buffer>` using `@react-pdf/renderer`'s `renderToBuffer`.
- `apps/web/src/server/lib/export-audit.ts`
  - Exports `writeExportAudit(args: { userId; tenantId; entity; format: 'csv'|'pdf'; filterHash: string; rowCount: number }): Promise<void>`.
  - Writes one AuditLog row with `action: "DATA_EXPORT"`, `entityType: <entity>`, `entityId: <filterHash>`.
- `apps/web/src/server/lib/export-filename.ts`
  - Exports `buildExportFilename(entity: string, tenantSlug: string, format: 'csv'|'pdf'): string` → `events-marine-protect-20260512-143052.csv`.
- `apps/web/src/server/lib/__tests__/export-csv.test.ts`
  - RFC 4180 edge cases: comma in value, quote in value, newline in value, empty cell, null/undefined, numeric coercion via `format`, header row, BOM prefix.
- `apps/web/src/server/lib/__tests__/export-pdf.test.tsx`
  - Snapshot test that `renderExportPdf` returns a Buffer of non-zero length without throwing for representative props.
- `apps/web/src/server/lib/__tests__/export-audit.test.ts`
  - Verifies prisma.auditLog.create called with correct shape; verifies action="DATA_EXPORT".

### Files to modify
- `apps/web/package.json` — add `@react-pdf/renderer` to dependencies.
- (Run `pnpm --filter @marine-guardian/web add @react-pdf/renderer` from repo root.)

### Acceptance gate
- typecheck 6/6 clean
- lint 5/5 clean
- All 3 new test files pass
- `pnpm --filter @marine-guardian/web build` succeeds (React-PDF SSR compatibility check)

### Notes for executor
- `@react-pdf/renderer` works in Node — no special bundler config needed. Just import from `@react-pdf/renderer` in server-only files (Route Handlers).
- If React-PDF throws hydration warnings or SSR errors, document in lessons.md as 🟡 fix.

---

## Sub-session 1 — Events export

**Branch:** `feat/exports-events`
**Token estimate:** ~18K
**Tier:** 2 (Sonnet-eligible if hook overhead resolved; otherwise Opus-direct)
**Depends on:** SS-0 merged to main

### Files to create
- `apps/web/src/app/api/exports/events/route.ts`
  - `// Non-tRPC: manual auth required` comment at top.
  - `GET` handler: `requireRouteAuth(req)` → parse query (`format`, plus all `eventRouter.list` input fields: state, eventTypeId, priority, dateFrom, dateTo, search) using same Zod schema imported from `@/server/trpc/routers/event`.
  - Apply `rateLimiters.upload.check(userId)`.
  - `prisma.event.findMany({ where: { tenantId, ...filters }, take: 10001 })` — request one over cap to detect overflow.
  - If `> 10000`: return HTTP 413 JSON.
  - Compute filterHash = `sha256(JSON.stringify(sortedFilterObj))`.
  - Branch on format:
    - csv: `toCsv(rows, eventCsvColumns)` → Response with `text/csv; charset=utf-8` + Content-Disposition header.
    - pdf: `renderExportPdf({ entity: "Events", tenantName, filterSummary, columns, rows })` → Response with `application/pdf`.
  - `writeExportAudit({ ... format, filterHash, rowCount })` after success.
- `apps/web/src/app/api/exports/events/__tests__/route.test.ts`
  - Mock prisma.event.findMany + auth() + writeExportAudit.
  - Tests: (a) returns CSV with correct headers + tenant-scoped where clause; (b) returns PDF with correct content-type; (c) 401 when no session; (d) 413 when rowCount > 10000; (e) writes AuditLog DATA_EXPORT; (f) filter propagation (priority/dateFrom flow into prisma.where).
- (no new files for column config — embed `eventCsvColumns` inside route.ts since per-entity)

### Files to modify
- `apps/web/src/app/(dashboard)/events/page.tsx` — add `<Button asChild variant="outline"><Link href={buildExportUrl('events', currentFilters, 'csv')}>Export CSV</Link></Button>` + same for PDF in page header.
- Add `buildExportUrl` helper in `apps/web/src/lib/exports.ts` (new file — small): takes (entity, filters, format) → URL string with query params.

### Acceptance gate
- typecheck/lint/test pass
- Manual smoke: `curl http://localhost:45204/api/exports/events?format=csv` (with valid session cookie) returns a CSV file.

---

## Sub-session 2 — Patrols export

**Branch:** `feat/exports-patrols`
**Token estimate:** ~18K
**Pattern:** identical to SS-1, substituting `patrol` for `event`.
**Files to create:** `/api/exports/patrols/route.ts` + tests.
**Files to modify:** `/patrols/page.tsx` (add buttons).
**Reuses Zod schema from:** `apps/web/src/server/trpc/routers/patrol.ts`.

---

## Sub-session 3 — Alert Rules export

**Branch:** `feat/exports-alert-rules`
**Token estimate:** ~18K
**Pattern:** identical to SS-1, substituting `alertRule`.
**Files to create:** `/api/exports/alert-rules/route.ts` + tests.
**Files to modify:** `/alerts/page.tsx` (add buttons; sits beside the existing "View History" and "New Rule" buttons).
**Special note:** Alert Rules contain `notificationChannels` array and `conditionJson` object — column formatter must stringify these sensibly (e.g., `channels: "in_app, email"`, `condition: "priority>=200"`).

---

## Sub-session 4 — Notifications + Alert History exports (combined)

**Branch:** `feat/exports-audit-views`
**Token estimate:** ~22K (combines two related entities)
**Pattern:** identical to SS-1 ×2.
**Files to create:**
- `/api/exports/notifications/route.ts` + tests
- `/api/exports/alert-history/route.ts` + tests
**Files to modify:**
- `/notifications/page.tsx` (add buttons)
- `/alerts/history/page.tsx` (add buttons in header)
**Combined rationale:** Notifications and Alert History are both audit-style views with similar column shapes (timestamp + entity refs + read/state). Sharing a session keeps the related work together and the column-formatter patterns aligned.

---

## Test strategy across sub-sessions

| Test layer | What to verify |
|---|---|
| Foundation unit tests (SS-0) | RFC 4180 escaping correctness; PDF renders without throwing; audit write shape |
| Route Handler tests (SS-1..4) | Tenant scoping enforced; filter propagation correct; auth gate works; row cap returns 413; audit row written; content-type + content-disposition headers correct; rate limit applied |
| Integration (manual after merge) | `curl` each endpoint with valid + invalid session, verify file downloads and opens correctly in Excel (CSV) + PDF reader |

Tests use existing patterns from `notification.test.ts` and `alertHistory.test.ts` for tRPC mocks + the Zod schema reuse approach.

---

## Execution model

**Recommended:** Opus-direct for SS-0 (boundary case, foundation must be clean) and SS-4 (combined size). Sonnet-eligible for SS-1, SS-2, SS-3 if hook-injection issue is unresolved at execution time — try Sonnet on SS-1 first, observe thrashing behavior, decide for SS-2/3.

**Per memory-governance §2.5b:** if hook overhead per Read still ~2K, plan Opus-direct for all sub-sessions. ~22K per session × 5 = ~110K total Opus tokens across the work. Spread across 5 fresh sessions = well within budget per session.

**Per §1 split rule:** each sub-session is independently mergeable. After SS-0 ships, SS-1..4 can run in any order or parallel (different developers/sessions).

---

## Open items / decisions to revisit during execution

1. **Filename URL encoding** — tenant slugs are already kebab-case URL-safe (verified — see schema slug field). No encoding logic needed in `buildExportFilename`.
2. **PDF page break behavior** — `@react-pdf/renderer` handles automatic pagination for `<View wrap>` containers. Verify visually on a 500-row PDF during SS-1 smoke test.
3. **CSV character encoding** — UTF-8 with BOM for Excel compatibility. Confirmed: include BOM (`﻿`) as first character of CSV body when format=csv.
4. **Dashboard summary page exports** — out of scope for v1. Aggregate/KPI exports are a separate future task.
5. **Scheduled/recurring exports** — out of scope for v1. Manual on-demand only.
6. **Email-delivered exports** — out of scope for v1. Direct download only.

---

## Governance writes after each sub-session

Per Rule 25 two-stage review + standard governance discipline:
- CHANGELOG_AI.md — append entry per merged sub-session
- IMPLEMENTATION_MAP.md — update "Last updated" line + add Exports section
- STATE.md — rewrite NEXT to point at next sub-session
- lessons.md — only if a 🔴 gotcha / 🟡 fix / 🟤 decision arose

**Single combined entry preferred** at end-of-feature if all 5 sub-sessions ship in one workday; per-merge entries otherwise.

---

## Final spec coverage after this batch ships

Will close: **none directly** (exports aren't called out in PRODUCT.md as a discrete deferral) — but adds operational value matching the broader audit-trail posture and improves compliance footing.

Remaining Phase 8 Batch 2 backlog after this ships: **1 item — real-time SSE** (Tier 3, mandatory split per §1).
