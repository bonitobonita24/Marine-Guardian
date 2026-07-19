# Event Highlights Report — plan (2026-07-20)

Owner request: a THIRD printable report from the Interactive Report Map's "Generate
Printable", alongside (1) Charts/Summary and (2) Detailed lists. The new report is an
image-forward **collage of the events/activities that have real photos AND complete,
meaningful information**, laid out LARGE on A4 — the "Event Highlights" of the selected
scope. Plus a follow-up: a small hide/unhide toggle for the map's photo thumbnails.

## Confirmed spec (owner, 2026-07-20 via AskUserQuestion)
- **Qualify (selection bar):** non-Skylight event with **≥1 displayable photo AND ≥1
  filled narrative field** (action taken, remarks, or a meaningful ER detail). "Completely
  filled up + makes sense."
- **Sizing:** **1–2 photos → half A4** (two events stacked per portrait page); **3+ photos
  → full A4 page** (one event, bigger).
- **Caption per event:** title, reported date/time, event type, location (municipality/area
  + coords if present), action taken, remarks, reporter. **No priority.**
- **Order & cap:** **most photos first**, cap **~25 events** (bounds PDF size + render time
  + Telegram fetch load).
- **Scope:** the SAME filter as the other two reports (municipality / protected-zone /
  province + date range + includeChildren/includeTraversing), read from the export's
  `paramsJson`.

## Grounding (from codebase trace, main branch)
- **Report architecture:** print-render route `page.tsx` is an explicit `if (reportType===…)`
  chain; each branch calls its own loader + component. PDF worker (`pdf-render.processor.ts`)
  builds the render URL from the DB `reportType` generically — **no worker change needed**.
- **ReportType** is a Prisma enum (`coverage, area, consolidated, detailed, rangers,
  patrol_filtered, report_map`) mirrored by a zod `reportTypeSchema` in
  `packages/shared/src/schemas/report-export.ts`. Adding a type = enum value + migration +
  zod value.
- **NO `EventFieldValue` table on main** (that's the unmerged `feat/efv-*` work). Event field
  data on main = `Event.eventDetailsJson` (verbatim ER blob) + promoted columns
  (`actionTaken`, `notesJson`, `offenderName`, `vesselName`, `vesselRegistration`).
- **Event photos** = `EventAsset` rows (Telegram-backed, R2-cached). Displayable set via
  `photoAssetIdsFrom(assets)` (telegramFileId != null + inline-safe mime). Coarse flag
  `Event.hasPhoto`.
- **Server-side image embed for print** = `<img src="/api/assets/{id}?w=N">` + the
  `X-PDF-Renderer-Token` bypass (headless Chrome loads the subresource). Existing precedent:
  `EventPhotoCell` in report-map-report.tsx (renders `photoAssetIds[0]` at w=160). **Resize
  cap `MAX_RESIZE_WIDTH=400`** in `/api/assets/[id]/route.ts` — must be raised for large
  collage photos. No stored image dimensions → use fixed CSS grid tiles (`object-fit:cover`);
  layout keys off photo COUNT (known), not aspect ratio.
- **A4 pagination:** inline `<style>` named `@page { size:A4; margin:12mm }` + `break-inside:
  avoid` + `break-before:page`; `html,body{background:#fff!important}` to kill the dark-theme
  margin frame. Sentinel `window.__renderPending/__renderReady` gates the Puppeteer capture
  on all `<img>` loads.
- **Skylight exclusion helper:** `isSkylightDisplay(display)` (`components/map/eventMarkerStyle.ts`).

## Implementation slices (each: build → tsc/lint → tests → checkpoint)

### Slice 1 — Declare the report type
- `packages/db/prisma/schema.prisma`: add `event_highlights` to `enum ReportType`; new
  migration (additive enum value, `ALTER TYPE … ADD VALUE`). Apply via `migrate deploy` on dev.
- `packages/shared/src/schemas/report-export.ts`: add `"event_highlights"` to `reportTypeSchema`.

### Slice 2 — Data loader
- New `apps/web/src/server/event-highlights-report/get-event-highlights-report-data.ts`,
  signature `(tenantSlug, exportId) => data | null` mirroring the report-map loader's null
  contract (bad slug/export/tenant/reportType → null).
- Reuse the existing scope-param parsing (municipalityId/protectedZoneId/province/from/to/
  includeChildren) + `resolveMunicipalityScope`/`buildMunicipalityScopeWhere`.
- Query in-scope events with `assets` + fields; then in code:
  - EXCLUDE Skylight (`isSkylightDisplay(eventType.display)`).
  - Keep only events with `photoAssetIdsFrom(assets).length > 0`.
  - Keep only events with a narrative: `actionTaken` non-empty OR a remarks/notes string
    extracted from `notesJson`/`eventDetailsJson` (keys ~ /remark|note|narrative|actiontaken/i).
  - Build caption fields; collect ALL displayable photoAssetIds (not just [0]).
  - `layout: photoCount <= 2 ? "half" : "full"`.
  - Sort by photoCount desc (tiebreak reportedAt desc); cap 25.
- Resolve header data (tenant, template + logo data URIs via `resolveLogoDataUri`, scope
  title incl. the protected-zone-name behavior) — reuse the report-map loader helpers.
- Return a typed `EventHighlightsReportData`.

### Slice 3 — Print component + A4 collage CSS
- New `apps/web/src/app/print-render/[tenantSlug]/[reportType]/[exportId]/event-highlights-report.tsx`.
- Reuse `<ReportHeader>` for the first-page header (LGU/scope title, date range, logos).
- Per-event block: a photo area (`<img src="/api/assets/{id}?w=1400">` tiles, `object-fit:
  cover`, `break-inside:avoid`) + a caption block (confirmed fields). `half` blocks = two per
  portrait page; `full` blocks = own page (`break-before/after: page`).
- Reuse the `window.__renderPending/__renderReady` all-images-loaded sentinel so Puppeteer
  waits for every photo.
- `@page { size: A4 portrait; margin: 12mm }`; `html,body{#fff!important}`.

### Slice 4 — Wiring: route + asset cap + UI
- `.../[exportId]/page.tsx`: add `import` + `if (reportType === "event_highlights") { … }`
  branch; add to `VALID_REPORT_TYPES`.
- `/api/assets/[id]/route.ts`: raise `MAX_RESIZE_WIDTH` (400 → ~1600) so large collage photos
  render; keep the clamp + inline-safe mime allowlist + renderer-token gate intact.
- `generate-printable-button.tsx`: add a control to generate the Highlights report
  (`create.mutateAsync({ reportType:"event_highlights", paperSize:"A4", paramsJson:{…scope} })`).
  UX: a distinct "Event Highlights (photo collage)" option/button next to the existing
  charts/lists generation. Keep existing behavior unchanged.

### Slice 5 — Tests + visual verify
- Loader unit tests: Skylight excluded; photo-less excluded; narrative-less excluded;
  ordering (most photos first); cap 25; `layout` half/full classification; scope honored;
  null contract.
- Component render test (renderToStaticMarkup): half vs full blocks, caption fields present,
  photo `<img>` src shape, render sentinel.
- Visual: rebuild dev off this branch, generate a Highlights export against dev `ph` data,
  render the PDF, screenshot for owner approval.

### Slice 6 (follow-up) — Map photo-thumbnail hide/unhide toggle
- Small toggle in the map legend (mirror the existing `showSkylight` switch in
  `components/map/TrackLegend.tsx` + `InteractiveMap.tsx`): a "Show photo thumbnails" switch
  that hides/shows the event photo thumbnail cards on the interactive map. Default: shown.
  Local UI state only; no persistence unless owner asks.

## Guardrails
- HARD HOLD — all LOCAL commits on `feat/event-highlights-report`; no push/deploy without
  owner word.
- Bounded render: cap 25 events; per-event photo cap (e.g. ≤8 shown) to keep PDF < Telegram
  limits; `?w=` sized, not full-res, to bound bytes.
- Tenant-scoped queries throughout; reuse `matrixProcedure`/session scoping for any new tRPC.
- Reuse existing helpers (photoAssetIdsFrom, resolveLogoDataUri, isSkylightDisplay, scope
  resolvers) — DRY, no reinvention.
