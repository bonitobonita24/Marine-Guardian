# Marine Guardian — Command Center

## App Identity
Name:           Marine Guardian — Command Center
Tagline:        Real-time operations intelligence for marine protected areas
Industry:       Marine Conservation / Marine Protected Area Management
Primary users:  Command center operators, field coordinators, and site administrators managing marine protected areas

## Glossary (read this first)

This spec uses several closely-related terms that can blur together. Defined once, authoritatively, here. When in doubt, this section wins.

| Term | Meaning | Where it appears |
|---|---|---|
| **MPA** | Marine Protected Area — the conservation site being managed. Each MPA is one tenant in this multi-tenant SaaS. | Throughout |
| **Tenant** | A single MPA site (Mindoro, Banggai, Pecca) — its own data scope, ER server, currency, timezone. | Tenancy Model |
| **Patrol** | A field operation performed by rangers — foot or seaborne. Synced from EarthRanger. Has a track (GPS polyline), state (open/active/done/cancelled), and may produce events. | Data Entities, Patrol Monitoring |
| **PatrolArea** | A *planning* polygon — "where do we want rangers to patrol this month?" Drawn by Field Coordinator+ on the Patrol Area Planning map. Does NOT determine attribution; reports do not group by PatrolArea. | Patrol Area Planning module |
| **AreaBoundary** | An *attribution* polygon (or LineString) — "which area was this patrol/event located in?" Drawn by Site Admin+ on the Area Boundary Editor. Reports group by AreaBoundary. Was previously called "MunicipalityBoundary." | Area Boundary Management module |
| **area_name** (column) | Free-text label from EarthRanger preserved verbatim (e.g., "A12a", "Solan Bajo Reef"). Stored on Event, Patrol, FuelEntry rows. Never mutated by CC. | Data Entities, Area Attribution Rules |
| **area_boundary_id** (FK) | Derived foreign key from area_name + nearest-boundary lookup against the tenant's enabled AreaBoundary table. Set at sync time (Event, Patrol) or logging time (FuelEntry). | Area Attribution Rules |
| **Event** | A single incident or observation logged in EarthRanger by a ranger — blast fishing report, wildlife sighting, outreach activity, etc. Has priority (critical/high/medium/low) and state (new/active/resolved). | Event Management module |
| **Subject** | A trackable entity in EarthRanger — a ranger, a boat, a tagged animal. Has a `last_position_at` that drives staleness detection. | Data Entities, Live Map |
| **Accompanying Ranger** | A ranger who participated in an event or patrol but is not the primary reporter. Tracked separately so they get performance credit in the Ranger Performance matrix. | Accompanying Ranger module |
| **Active Check** | The fast-loop sync (every 120s default) — pulls the newest 5 pages of patrols + refreshes up to 50 sync candidates. | Sync Engine |
| **Deep Sync** | The slow-loop sync (every 600s default) — full pagination of the entire patrol list, reconciles deletions. | Sync Engine |
| **Sync candidate** | A patrol that the sync engine should keep refreshing because its state isn't terminal AND it has open segments. | Sync Engine |
| **Coverage Report** | The 3-page funder-facing PDF that shows all patrols in a period, which AreaBoundaries they touched, and km/hours of patrolling per boundary. | Reports module |
| **Per Area Report** | A simpler analytics report — pick one AreaBoundary, see event/patrol breakdowns for that boundary over a date range. | Reports module |
| **Path A / Path B** | Two EarthRanger authentication options. Path A = DAS Web Token + ER Track Token pair (preferred). Path B = username + password (legacy fallback). Each tenant picks one. | Tenant Settings, Credentials Specification |
| **Reserved slug** | A short list of words a tenant slug cannot use (admin, api, auth, etc.) — see Slug Format & Validation. | Tenancy Model |
| **Test Patrol** | A patrol auto-flagged at sync time if its title matches `/test\|qa\|demo/i` — default-excluded from reports unless operator opts in. | Patrol entity |

## Problem Statement
EarthRanger is an excellent field data collection platform but provides no reporting, no charts for events or patrols, no cross-area analytics within a site, and no configurable alerting. MPA managers currently produce monthly reports manually as static PDFs (per-area event breakdowns, patrol statistics, ranger performance matrices) by hand — a tedious, error-prone process that delivers stale insights weeks after the data was collected. There is no unified command center view for real-time monitoring, incident escalation, or patrol planning.

## Core User Flows
1. **Operator monitors live activity and escalates incidents:** Operator opens Command Center War Room → sees live map with tracked subjects (patrol boats, rangers, marine animals), real-time event feed, and alert panel → new critical event appears (e.g., blast fishing report from patroller in EarthRanger) → alert panel pulses red with ACK button → Operator acknowledges alert → reviews event details → updates state from "new" to "active" → if critical, escalates (triggers in-app + email alert to Field Coordinator / Site Admin per the matching AlertRule's recipients). Error: EarthRanger unreachable → state update queued in BullMQ for push-back retry on the `er-sync-active` queue → War Room shows red "SYNC FAILED" banner after 3 consecutive failures OR when last successful sync is older than `active_check_interval_seconds × 5` (default 10 min), whichever first; banner clears on first successful sync.

2. **Field Coordinator monitors patrols and reviews completed operations:** Patrollers create patrols and report events from EarthRanger mobile app in the field → Command Center pulls patrol data via scheduled API sync → Coordinator monitors active patrols on War Room map and Patrol Monitor screen (elapsed time, distance, current position) → after patrol ends, Coordinator reviews patrol track, coverage vs planned patrol area polygons, and linked events → Coordinator fills in missing event details or corrects data via Kanban board. Error: GPS data gap detected → last known position shown with staleness indicator badge and timestamp.

3. **Coordinator or Admin generates analytics reports:** User selects date range and area filters → views per-area event breakdowns (law enforcement + monitoring categories as bar charts), patrol summary KPIs (foot vs seaborne: count, km, hours), event heatmaps overlaid on map, and ranger performance matrix → drills down into detailed event tables with all fields (report ID, reporter, date, notes, area, type, vessel, offender, action taken, photo reference) → exports report as PDF or CSV. Error: insufficient data for selected range → empty state with message "No records found for this period" and suggestion to expand date range.

4. **Patrol Manager plans patrol areas and schedules:** Manager opens patrol area map editor → draws polygon zones on the map defining estimated patrol coverage areas (not strict boundaries — as long as rangers are inside the shaded area) → names each zone and assigns it to a patrol type (foot or seaborne) → opens Gantt chart view → schedules ranger assignments to patrol areas across days/weeks → drag-and-resize schedule blocks on the Gantt timeline → rangers see their assignments. Error: overlapping polygon drawn → system warns but allows (polygons are estimated areas, not strict boundaries).

5. **Operator manages incidents via Kanban board:** Operator opens Kanban view → sees events in columns by state (New → Active → Resolved) → drags event card to update state → clicks into event card to fill in missing details (offender name, vessel info, action taken) that field patrollers left incomplete → resolved events accumulate as monthly accomplishment data. Error: concurrent edit by two operators → last-write-wins with conflict notification.

6. **Site Admin connects EarthRanger and configures tenant:** Admin opens Tenant Settings → EarthRanger Connection subsection → enters server URL and EITHER the DAS Web Token + ER Track Token pair (preferred) OR the legacy username/password pair → clicks **Test Connection** (server-side `GET /subjects/?page_size=1` with verbatim ER error surfaced on failure) → on success, clicks **Verify ER Limits** to run the ER Instance Verification Checklist (max page_size, rate-limit headers, etc., persisted to tenant row) → clicks Save → first Deep Sync fires automatically; subsequent Active Check + Deep Sync schedules begin → Site Admin configures alert rules (4 typed kinds: event_match / subject_stale / patrol_overdue / sync_failure) → manages user accounts → monitors Sync Health subsection (sync_state, last_error, per-data-type table). Error: invalid token → 401 surfaces verbatim in Test Connection result; after 2 consecutive 401s during operation, the auth-failure circuit breaker trips (`sync_state = "auth_failed"`, both timers stop) until credentials are corrected.

7. **Super Admin onboards a new MPA site:** Super Admin opens platform tenant management → creates new tenant (name, slug for subdirectory routing) → assigns initial Site Admin user → Site Admin then configures the EarthRanger connection (flow 6). Error: duplicate slug → rejected with suggestion to use a different slug.

## Modules + Features

### Command Center War Room
- Designed for 100-inch TV wall display, 24/7 monitoring, no interaction required
- Top strip: KPI cards (active events, unacknowledged alerts, **Active Patrols split tile: Foot count + Seaborne count + Total**, rangers on duty, events this month) + live clock + sync health indicator + last successful sync timestamp
- **Active patrol definition (consistent across War Room, Dashboard, and Patrol Monitor):** state ∈ {`open`, `active`} AND segment exists AND `segment.time_range.start_time` is set AND `segment.time_range.end_time` is NOT set. Cancelled patrols with missing end_time are explicitly NOT active. Foot vs Seaborne is read directly from `Patrol.patrol_type` enum (`foot` | `seaborne`) — set at sync time by mapping ER's field value; unknown values default to `foot` and emit a SyncLog warning.
- Left 60%: Live Map with all layers active (subjects, events, patrol tracks, patrol area polygons, heatmaps) via MapLibre GL
- Top-right: Alert & Escalation Panel — critical/high priority events with pulsing red indicators for unacknowledged items + ACK buttons
- Mid-right: Live Event Feed — auto-scrolling newest events, color-coded by priority and category
- Bottom-right: Active Patrols table — ranger name, patrol type, area, elapsed time, distance covered
- Bottom strip: Compact law enforcement + monitoring event bar charts (current period summary) + "Time Since Last Incident" counter
- Full-screen toggle (F11/button) to hide browser chrome
- Optional audio alert chime when critical event arrives (configurable)
- Staleness warning banner if data sync fails or is delayed beyond threshold
- Auto-refresh — no manual interaction needed, everything streams live

### Dashboard (Standard)
- KPI cards: total active events, **Active Patrols split tile (Foot / Seaborne / Total)**, rangers on duty, events this month
- Period comparison: this month vs last month delta indicators on KPIs
- Law enforcement event breakdown bar chart (by violation type)
- Monitoring & surveillance event breakdown bar chart (by category)
- Live event feed: most recent events streamed, color-coded by priority
- Quick stats: law enforcement count vs monitoring count

### Live Map (Standalone)
- Full-screen MapLibre GL map with larger canvas for detailed analysis
- Real-time subject positions (patrol boats, rangers, tracked marine animals) via WebSocket
- Event markers with category-specific icons and priority color-coding
- Patrol track overlays showing active and recent patrol routes (foot vs seaborne colors)
- Heatmap layer toggle for event density visualization
- Heatmap layer toggle for patrol coverage density
- Patrol area polygon overlay showing planned coverage zones
- Subject trail history (last N hours of movement per subject)
- Staleness indicator on subject markers when GPS data is older than threshold
- Layer controls to toggle visibility of each data type independently
- Click-to-inspect on any marker/track for detail popover
- Drawing tools for ad-hoc area selection

### Event Management (Kanban)
- Kanban board with columns: New, Active, Resolved
- Drag-and-drop state transitions
- Event cards showing: type icon, serial number, title, reporter, time, priority badge
- Click-to-expand for full event detail editing (all fields from EarthRanger event schema)
- Operator can fill in missing fields (offender name, vessel info, action taken, notes)
- State changes pushed back to EarthRanger via API
- Filter by event category (Law Enforcement / Monitoring, Patrolling & Surveillance)
- Filter by area boundary
- Monthly accomplishment view: filter resolved events by month for reporting

### Event Detail
- Full event record with all fields: report type, report ID, reported by, reported at, notes, area boundary, violation/event sub-type, vessel name, registration number, address, offender name(s), action taken, photo indicator
- Rich text editor for notes editing
- Status control buttons (New / Active / Resolved)
- Location mini-map showing event position
- Event timeline (created, synced, state changes, edits)
- Link to reporter's ranger profile
- **Accompanying Rangers:** Any Command Center user can tag additional rangers who participated in this event. Supports two modes: (1) select from known users/rangers in the system via searchable dropdown, (2) type a free-text name for someone not registered in the system (e.g., community volunteer, visiting ranger). All accompanying rangers receive equal performance credit as the reporter. Display as a tag/chip list with remove capability.

### Patrol Monitoring
- Active patrols list with real-time progress (current position on map, elapsed time, distance covered)
- Active patrol tracks rendered on map
- Completed patrols list with summary stats (duration, distance, events encountered, completion date)
- Patrol detail view: map with full track overlay, linked events along route, patrol segment info
- **Boat name** displayed on seaborne patrols (synced from EarthRanger patrol data — the boat used for each patrol)
- Foot patrol vs seaborne patrol type distinction throughout
- Patrol KPI summary: number of patrols, total km, total hours — split by type and area
- **Accompanying Rangers on Patrols:** Any Command Center user can tag additional rangers who participated in a patrol alongside the patrol leader. Same dual-mode input as events: select from system users OR type free-text name. All accompanying rangers receive equal performance credit as the patrol leader.
- **Filter panel:** text search (matches title/serial/leaders/objective); tracked-by multi-select chips with autocomplete; patrol type; status; date range (default current week, Monday–Sunday ISO); "Exclude test patrols" checkbox (default ON); "Show only ongoing" checkbox; advanced time-of-day window with overnight-aware logic (e.g., 22:00–07:00 matches start times 22:00–23:59 on each in-range day; does NOT spill into next day). Date filters are applied client-side against the local cache, do not refetch from EarthRanger.
- **Patrol Index table columns:** Serial Number, Title, Type, Status (badge: open / scheduled / done / cancelled / draft), Tracked By (subjects list), Start Location (icon + lat/lon), End Location, Start Time, End Time, Duration (formatted hours), KMS (uses `computed_distance_km` if present, falls back to ER `total_distance_km`; lazy-loaded for visible rows only via bulk endpoint, cached in memory), Objective (truncated with expand-on-click), Updated At, Actions (View → opens track viewer modal, Open in EarthRanger → deep link, Add Companions → opens chip editor)
- **Per-patrol Track Viewer Modal:** "View" action opens a modal containing a map rendering the patrol's GPS track as a polyline. Color-coded by patrol type (foot = blue, seaborne = cyan). Title shows patrol serial and type. Empty/loading states use a map placeholder. Track data fetched via dedicated endpoint that resolves in this order: **Valkey cache** (key `tenant:{id}:track:{patrol_id}`, 10-min TTL) → local `PatrolTrack` table → EarthRanger subject tracks API. No in-process / module-level cache — multi-worker safe.
- **Auto-refresh discipline:** the patrol list polls every 30 seconds, but auto-refresh is **suspended whenever any user filter is non-default** so it does not clobber the user's view. Resumes automatically when filters are cleared.
- **Test patrol detection:** patrols with titles matching `/test|qa|demo/i` (case-insensitive) are auto-flagged `is_test_patrol=true` at sync time. Reports exclude them by default. Visible in the index with a "Test" badge when "Exclude test patrols" is unchecked.
- **Export Filtered View (ad-hoc PDF):** "Export" button generates a print-ready PDF of the currently filtered list — separate from the Template Report. Contains: header with date range + generated timestamp; summary cards (counts and KM totals by type); type subtotal table; full patrol detail table (every row in current filter). Paper size toggle (A4 / Letter / Legal). Distinct from "Reports — Patrol Coverage (Template)" which is the funder deliverable.
- **Open in EarthRanger** action on each row: opens `{tenant.earthranger_url}/admin/activity/patrol/{er_patrol_id}/change/` in a new tab — lets coordinators jump to the source record for corrections.

### Patrol Area Planning
- Map-based polygon drawing tool for defining estimated patrol coverage zones
- Zones are estimated areas — not strict boundaries; rangers should be inside the shaded area
- Name, describe, and assign patrol type (foot/seaborne) to each zone
- Color-coded zone list with assigned ranger count
- Edit, delete, and manage active/inactive zones
- View scheduled vs actual coverage comparison (planned polygon vs actual patrol tracks)

### Area Boundary Management
- **Purpose:** define the **operational area boundaries** used for patrol coverage attribution and reporting. These are tenant-drawn polygons (or LineString lines) representing the meaningful sub-units of an MPA — reefs, jurisdictions, monitored sectors. **Distinct from Patrol Area Planning** — Patrol Areas define WHERE rangers should patrol (planning intent), Area Boundaries define which sector a patrol or event BELONGS TO (attribution for reports and funders).
- **Per-tenant area boundary registry** (example seed for Banggai tenant: Solan Bajo, Tulus Reef, Sombuan, Palagang Reef; for Mindoro tenant: Calapan, Baco, San Teodoro, Puerto Galera, Sablayan, Apo Reef Park; for Pecca tenant: Roxas, Aracelli, El Nido, Dumaran, Taytay, Aborlan). Records are tenant-scoped — no shared global area boundary list across tenants.
- **Area boundary record:** name, aliases (comma-separated for fuzzy match — e.g., "apo reef, apo reef park, apo reef natural park"), region (e.g., "Mindoro" / "Palawan" / "Banggai Island"), enabled flag, geometry (Polygon OR LineString as GeoJSON), source (`official` | `custom`), `override_official` flag.
- **Two boundary sources per area boundary — ArcGIS is REFERENCE-ONLY:**
  - **Official reference layer (ArcGIS or equivalent):** read-only external boundary feature service displayed as a **dashed cyan outline** (`#1fb6ff`, `dashArray:'6,4'`) during editing only. **Never used at report time.** Provides a visual reference for the user to follow, modify, or ignore.
  - **App-managed geometry:** the actual saved geometry in the `AreaBoundary` table — this is the **single source of truth for all reports and coverage analytics**. The user creates this geometry by either: (a) copying the ArcGIS line via "Copy Official → Draft" button and saving as-is, (b) copying then modifying vertices, or (c) drawing from scratch on the map with no reference layer needed.
- **Editor UI:** map with click-to-add-vertex; "Undo Last Point" button; "Clear Draft" button; "Copy Official → Draft" button (only enabled when an ArcGIS reference is loaded for the selected area boundary); form fields for name / aliases / region / enabled; save button. Saving with ≥3 vertices flips `override_official=true` regardless of whether the geometry was copied or drawn from scratch.
- **Boundary list grouped by region**, filterable by enabled state, with quick toggle.
- **ArcGIS-free operation:** tenants without an ArcGIS endpoint configured (default for Banggai/Indonesia) work normally — they just draw boundaries from scratch with no reference layer. Reports are unaffected.
- **Boundary shape duality:** the app's geometry storage is flat (`{id, name, geometry}`), but any boundary helpers that accept external GeoJSON Features (`{properties: {id, name}, geometry}`) must tolerate both shapes — required for ArcGIS interop and future GeoJSON import features. Helper functions: `boundaryId(b) = b?.id ?? b?.properties?.id`, `boundaryName(b) = b?.name ?? b?.properties?.name`.

### Patrol Schedule (Gantt)
- Gantt chart for scheduling ranger assignments to patrol areas over days/weeks
- Rows = rangers, columns = days, cells = color-coded zone assignment blocks
- Drag-and-resize schedule blocks on the Gantt timeline
- Legend showing zone colors
- Navigation: previous/next period, date range selection
- Add assignment button with ranger and zone selection
- Bi-weekly or monthly view toggles
- **Conflict detection — warn, don't block:**
  - A schedule entry **conflicts** with another when: same `tenant_id` AND same `ranger_user_id` (or same `ranger_name` for free-text rangers) AND time windows overlap (`A.scheduled_start < B.scheduled_end AND B.scheduled_start < A.scheduled_end`).
  - **Same-zone overlap** (ranger scheduled in the same zone twice, e.g., morning + afternoon shift) is detected but flagged as **"double assignment"** with a softer badge instead of a conflict.
  - Multiple **different** rangers with overlapping windows in different zones are NOT conflicts (rangers, not zones, are the constraint).
  - Conflicting Gantt cells render with a **yellow border + ⚠ icon**. Hover tooltip: "Conflict with: {other zone name} ({other time range})."
  - "Add Assignment" form runs a conflict check after ranger + zone + dates are selected. Inline message: "⚠ This conflicts with N existing assignments. Save anyway?" — save button remains enabled.
  - **"Show only conflicts" filter chip** on the Gantt page lets coordinators audit the schedule for problems.
  - **No hard blocking in v1.** Coordinators may intentionally double-book (ranger on standby, shared patrol routes, provisional schedules pending headcount). Hard-blocking forces workarounds; soft-warning surfaces issues without preventing them.
- **Bulk assignment flow:** assigning a ranger to a multi-day window runs the conflict check against every day in the range. Form shows: "3 of 7 days have conflicts." User can choose **"Skip conflicting days"** or **"Save all anyway"**.
- **Recurrence: out of scope for v1.** Each assignment is a discrete row. v2 backlog: weekly recurring assignment templates.
- **Schedule visibility for rangers:** rangers are EarthRanger users, not Command Center users. v1 schedule export = printable PDF or shared screenshot. v2 backlog: optional push to ER as a custom layer.

### Fuel Logging
- **Purpose:** Track fuel received per municipal area to calculate average fuel consumption rate against seaborne patrol kilometers. Actual per-boat consumption cannot be measured — this tracks bulk fuel allocations.
- **Fuel entry form:** Any Command Center user can log a fuel receipt with fields:
  - Area boundary (select from tenant's areas)
  - Date received
  - Total liters received (must be > 0)
  - Total price (must be > 0, in tenant's configured currency)
  - Receipt photo upload (camera capture or file select; JPEG/PNG/HEIC, max 10MB)
  - Notes (optional — supplier name, delivery details)
- **Fuel log list:** Chronological table of all fuel entries, filterable by area, date range. Edit own entry (any user); edit any entry (Coordinator+); delete entry (Site Admin only) — all captured in AuditLog. Corrections are made via delete + re-create rather than negative entries.
- **Fuel consumption analytics — deterministic date-range algorithm:**
  - User picks a date range via period selector with **quick-picks** (This Week / This Month / Last Month / This Quarter / Last Quarter / This Year) **or Custom**. No fixed daily/weekly/monthly enum.
  - **Formula:**
    ```
    average_l_per_km(area, start_date, end_date) =
      SUM(FuelEntry.liters WHERE area=area AND date_received BETWEEN start AND end)
      ÷ SUM(Patrol.computed_distance_km
            WHERE area=area AND patrol_type='seaborne'
                  AND is_test_patrol=false
                  AND start_time BETWEEN start AND end)
    ```
  - **Empty-state handling:**
    - Numerator 0 (no fuel logged in range) → display "No fuel logged in this period"
    - Denominator 0 (no seaborne km in range) → display "No seaborne patrols in this period"
    - Denominator positive but < 1 km → still return ratio, but flag with **"Low coverage — may be misleading"** badge.
  - **Per-area breakdown table:** one row per area, columns = liters received in range, total cost, seaborne km in range, L/km result (or empty-state token / low-coverage badge).
  - **Trend chart:** monthly bars for the **last 12 months** (each bar = L/km for that calendar month). Trend chart is **independent of the page-level date range** — always 12 months. The range selector only adjusts the headline KPIs + per-area table.
  - **Summary KPIs:** total liters, total cost, total seaborne km, average L/km — all for the selected range.
- **Note:** Fuel is shared across all boats in an area — not tracked per individual boat. The boat name is recorded on each patrol (see Patrol Monitoring) but fuel allocation is at the area level.
- **Currency snapshot:** each FuelEntry stores its own `currency` at creation (not the tenant's current value). If the tenant changes currency later, historical entries keep their original currency in the table; KPI totals split by currency or show "mixed currency — see breakdown" when entries from multiple currencies fall within the range.

### Reports — Per Area
- Area selector (e.g., A5, A6, A7, Area 12, L806 for Banggai)
- Date range picker (default: current month)
- Law enforcement event breakdown: horizontal bar chart by violation type — **dynamically populated from synced event types** under the law enforcement category (not hardcoded; new types added in EarthRanger appear automatically)
- Monitoring event breakdown: horizontal bar chart by type — **dynamically populated from synced event types** under the monitoring category
- Event location heatmap on map for selected area and category
- Patrol summary cards: foot patrol (count, km, hours) and seaborne patrol (count, km, hours)
- Patrol track heatmap on map for selected area
- **Fuel consumption card:** total liters received, total cost, average L/km for selected area and date range
- Export to PDF button

### Reports — Patrol Coverage (Template)
- **Purpose:** the headline funder-deliverable report. Three-page printable PDF showing all patrols in a period, which area boundaries they touched, and how many kilometers/hours of patrolling actually happened inside each area boundary.
- **Period selector:**
  - **Weekly:** ISO weeks within a selected month. Default = "Last Completed Week." Label format: `Week 19 (May 4–10, 2026)`. Weeks computed by `getMonthWeekPeriods(year, month)` which splits the month into ISO weeks (Monday–Sunday).
  - **Monthly:** Default = current month. First day → last day of month. Label format: `MAY 2026`.
  - **Annual:** Default = current year. Jan 1 → Dec 31. Label format: `2026 ANNUAL`.
- **Test patrols excluded by default** (toggle in UI to include).
- **Paper size toggle:** A4 (default) / Letter / Legal. Changes `@page size` before printing.
- **Three pages, each A4 landscape, opened in a new browser tab as a fully self-contained styled HTML document for printing:**
  - **Page 1 — Patrol Index** for the period: header with logo + report title + date range + generated timestamp; summary cards (counts and KM totals by type — Foot / Seaborne / Total); type subtotal table; full patrol detail table (one row per patrol with serial, title, type, status, tracked-by, start location, end location, start time, end time, duration, KMS, objective).
  - **Page 2 — Area Boundary Summary:** table of every **enabled** area boundary showing assigned patrol count (assignment via `nearestStartArea(patrol.start_location, enabledAreaBoundaries)` plus name/alias match in `featureMatchesArea`); a map (`report-map`) overlaying patrol tracks + app-managed boundaries (filled cyan polygons) + optional ArcGIS reference outlines (cyan dashed); a bar chart visualizing patrol-to-area-boundary distribution; a "Variance Info" inline dialog explaining how estimation works.
  - **Page 3 — Area Covered:** the analytical payoff. Table of only boundaries with `coverage_km > 0`, sorted by `coverage_km` DESC. Columns: Boundary Name, Coverage Patrols, Coverage KMS, Coverage HRS — with **"Est." badge** displayed for any row where `hrs_estimated_count > 0` (meaning hours were pro-rated rather than computed from per-point timestamps). Footer note explains the "Est." rows; a second footer line reports `missing_tracks.length` when > 0. One bar chart (`area-covered-chart`) showing top boundaries by km. Empty state: a single row reading "No coverage in monitored boundaries for this period."
- **Period resolution functions (must be implemented):** `getSelectedTemplatePeriod()` returns `{ start: Date, end: Date, label, category }`; `getWeeklyPeriod(year, month, weekIndex)`, `getMonthlyPeriod(year, month)`, `getAnnualPeriod(year)`, `buildPeriod(start, end, label, category)`, `patrolStartsWithinPeriod(p, period)`, `getLastCompletedWeek()`.

### Reports — Consolidated
- Cross-area comparison table for law enforcement: rows = areas, columns = dynamically synced violation types, cells = counts, with subtotal row
- Cross-area comparison table for monitoring: same structure with dynamically synced monitoring categories
- Stacked/grouped bar charts comparing areas side by side
- Foot patrol consolidated table: rows = areas, columns = count/km/hours, with subtotal
- Seabourn patrol consolidated table: same structure
- Bar charts comparing patrol metrics across areas
- **Fuel consumption consolidated table:** rows = areas, columns = liters received / total cost / seaborne km / average L/km, with subtotal row
- Export to PDF button

### Reports — Detailed Event Log
- Tabular view of individual event records with all fields: report type, report ID, reported by, reported at, notes, area boundary, violation/event sub-type, vessel name, registration number, address, offender name(s), action taken, photo indicator, **accompanying rangers**
- Grouped by event category and sub-type (matching the Banggai PDF report structure)
- Sortable columns, filterable by date range, area, category, reporter
- Photo thumbnail column (linking to EarthRanger-hosted images)
- Truncated notes with expand-on-click
- Export to CSV button

### Reports — Ranger Performance
- **Performance Algorithm:** Every activity (event reported, patrol conducted, monitoring activity) earns equal credit for the reporter AND all tagged accompanying rangers. The algorithm dynamically counts all activity per ranger across all event categories and patrol types — not hardcoded to specific event types. When new event types are added in EarthRanger, they are automatically picked up via event type sync and included in performance tracking.
- Ranger × event type matrix: rows = rangers (including credit from accompanying), columns = dynamically populated from synced event types per category, cells = count, with subtotal column and row
- Performance credit includes: events where ranger is the reporter + events where ranger is tagged as accompanying + patrols where ranger is the leader + patrols where ranger is tagged as accompanying
- Bar chart of total events per ranger (stacked by category)
- Ranger patrol performance table: rows = rangers, columns = foot patrol (count/km/hours) + seaborne patrol (count/km/hours) — includes patrols where ranger accompanied
- Bar chart comparing patrol distance/hours per ranger
- Click ranger name to drill-down to individual ranger detail page
- Export to CSV button

### Ranger Detail
- Ranger profile: avatar, name, role, assigned area
- Event summary: counts by category — includes both reported and accompanied events (with breakdown)
- Foot patrol KPIs: patrols, km, hours — includes accompanied patrols
- Seabourn patrol KPIs: patrols, km, hours — includes accompanied patrols
- Recent activity timeline: events reported, events accompanied, patrols led, patrols accompanied, actions taken
- Breakdown: "Reported: X events | Accompanied: Y events | Total credit: Z"

### Alert System
- **Per-tenant alert rules** with a typed `kind` enum. v1 supports four kinds — each has its own typed condition schema. Phase 3 validates condition shape per kind with zod. No general expression language in v1.
- **Rule kinds:**
  - **`event_match`** — fires when a synced event matches all specified filters (AND-only). Condition shape:
    ```
    { event_types: string[] | null, priority_min: low|medium|high|critical,
      categories: string[] | null, areas: string[] | null,
      states: (new|active|resolved)[] | null }
    ```
    Evaluated by the Alert Evaluation job after each sync, against events with `synced_at > rule.last_evaluated_at`.
  - **`subject_stale`** — fires when a tracked subject hasn't reported a position in N minutes. Condition shape:
    ```
    { subject_types: string[] | null, threshold_minutes: int,
      during_active_patrol_only: boolean }
    ```
    Evaluated by Stale Data Detection job. Deduplicated per subject — one alert per stale episode (re-armed when subject reports a position).
  - **`patrol_overdue`** — fires when a scheduled patrol hasn't started by deadline. Condition shape:
    ```
    { grace_minutes: int, patrol_types: (foot|seaborne)[] | null }
    ```
    Evaluated by Stale Data Detection job. Looks at PatrolSchedule rows where `scheduled_start < now - grace_minutes` and no matching Patrol exists for that ranger in that window.
  - **`sync_failure`** — fires when sync has been failing for N minutes. Condition shape:
    ```
    { threshold_minutes: int,
      data_types: (subjects|events|patrols|observations|event_types|tracks)[] | null }
    ```
    Evaluated by Sync Failure Detection job. Deduplicated per failure episode, cleared on first successful sync.
- **Recipients (typed array):** each rule specifies who gets the alert. Two recipient shapes:
  - `{ kind: "role", role: site_admin|field_coordinator|operator }` — expands at fire time to all active Users in the tenant with that role.
  - `{ kind: "user", user_id: int }` — exactly that user (skipped if inactive).
  Resolved user list is deduplicated when role + named-user overlap.
- **Channels:** array of `in_app` and/or `email` per rule. `in_app` always creates a Notification row per recipient; `email` queues an email per recipient (subject to cooldown digest — see below).
- **Cooldown / storm prevention:** each rule has `cooldown_minutes` (default 5, range 0–1440):
  - First match within a cooldown window: fires normally (in-app + email if enabled).
  - Subsequent matches within the same window: **in-app Notifications always fire** (cheap; visible in Notification Center); **email is suppressed** and accumulates in a pending digest list keyed by `(rule_id, recipient_user_id)` in Valkey.
  - On cooldown expiry, if pending matches exist: send one digest email summarizing them — subject `[MPA NAME] N additional alerts — RULE NAME`, body is a table of suppressed matches (serial / type / area / time).
  - `cooldown_minutes = 0` disables batching entirely (every match emails immediately). Used by the seed "Critical event — any" rule.
- **Seed rules on tenant creation** — Phase 3 inserts these AlertRule rows when a tenant is created. Editable and deletable like user-created rules:
  1. **Critical event — any** — kind `event_match`, condition `{priority_min: "critical"}`, recipients all Site Admins + Coordinators, channels `[in_app, email]`, cooldown 0.
  2. **Stale GPS — 24h** — kind `subject_stale`, condition `{threshold_minutes: 1440, during_active_patrol_only: false}`, recipients all Operators, channels `[in_app]`, cooldown 360.
  3. **Sync failure — 10min** — kind `sync_failure`, condition `{threshold_minutes: 10}`, recipients all Site Admins, channels `[in_app, email]`, cooldown 60.
- **Email templates:** hardcoded per kind in v1 (parametrized with tenant name + match details). Subject format: `[MPA NAME] [PRIORITY] Event #SERIAL — TYPE` for event_match, etc. Configurable templates are v2 backlog.
- Active/disabled toggle per rule; Edit and delete (with confirmation); Alert history log accessible from the rule detail.

### Notification Center
- Chronological list of all alerts and system notifications **for the current user** (joins NotificationRecipient on user_id).
- Read/unread status is **per-user** (each NotificationRecipient row has its own `is_read` + `read_at`). One Notification can have N recipients, each with their own read state.
- Click-through to related event or patrol (when the notification references one).
- Mark all as read button (updates only the current user's NotificationRecipient rows).
- Filter by type (event alert, system alert, escalation, warning).
- Priority-coded indicators (critical=red, warning=orange, info=blue, system=gray).

### User Management
- CRUD users within tenant
- Assign roles (Command Center Operator, Field Coordinator, Site Admin)
- Activate/deactivate users
- Password reset
- Last login timestamp
- Role-specific badges (color-coded)

### Tenant Settings
- **EarthRanger Connection subsection:**
  - Server URL (required), **EITHER** DAS Web Token + ER Track Token (preferred) **OR** Username + Password (legacy fallback) — operator picks one auth path; both visible but the unused pair is collapsed
  - Test connection button with validation (attempts API call to `/subjects/?page_size=1` using whichever auth is filled; never throws; on failure sets connection status to `unreachable` with verbatim ER error detail)
  - Connection health status indicator (connected/disconnected with last sync time)
  - **Active Check Interval** input (seconds, floor 60, ceiling 3600, default 120 — the high-frequency sync that pulls the newest 5 pages every N seconds)
  - **Deep Sync Interval** input (seconds, floor 300, ceiling 86400, default 600 — the full-history reconciliation that paginates the entire patrol list every N seconds)
  - Password and token fields masked by default with show/hide toggle
- **Sync Health subsection (Site Admin only):**
  - **Two-loop sync engine** model — explained inline for transparency:
    - **Active Check** runs every 2 minutes (configurable per tenant). Pulls newest 5 pages × 100 patrols sorted by `-serial_number`; after each page, upserts and syncs tracks; then refreshes up to 50 cached "sync candidates" via individual patrol fetches.
    - **Deep Sync** runs every 10 minutes (configurable per tenant). Paginates entire patrol history (up to 100 pages × 200), upserts each page, syncs tracks. Also runs once immediately on tenant connection/reconnection.
    - A module-level mutex prevents overlap. Errors are stored in `last_error` and never propagated to the event loop (sync workers never crash the process).
  - **Status panel:** running/paused indicator; last Active Check timestamp; last Deep Sync timestamp; last error message (if any).
  - **Cache stats:** total patrols cached; patrols needing sync (`sync_candidates` count); last cache update timestamp.
  - **Per-data-type sync table:** rows = data type (subjects, events, patrols, observations, event types, subject groups, patrol tracks); columns = last sync, records synced, status (success / failed / partial), error.
  - **Sync candidate definition:** a patrol is a sync candidate if `state ∉ {closed, done, completed, cancelled, canceled}` (case-insensitive) OR any segment has `start_time` set but no `end_time` (i.e., still active).
  - **Force Resync button:** triggers `runDeepSync()` immediately, returns updated status. Disabled while a sync is in progress.
  - **Reset Cache button:** Site Admin only, requires double-confirm (typed confirmation). Clears the tenant's local patrol/event/observation/track cache; next Deep Sync rebuilds from scratch. Captured in AuditLog with high severity.
  - **Sync failure UI rule:** "SYNC FAILED" banner appears at the top of every page in the tenant when (a) 3 consecutive sync attempts have failed OR (b) the last successful sync is older than `active_check_interval_seconds × 5` (default 600s = 10 min), whichever comes first. Banner clears on the first successful sync.
  - **EarthRanger rate-limit handling:** see Background Jobs → Sync Engine → **ER Resilience** for the full retry, Retry-After, and auth-failure circuit breaker behavior. Tenant Settings surfaces the current state (`sync_state`, `paused_until`, `auth_failure_count`) read-only; recovery actions are limited to Force Resync (manual retry) and Reset Cache (destructive).
- **External References subsection:**
  - **ArcGIS Boundary URL** (optional, nullable): a per-tenant ArcGIS feature service endpoint used for **reference-only** display in the Area Boundary editor. Tenant operators can follow this line, modify it, or ignore it — it is never consulted at report time. Default for Philippines tenants (Mindoro, Pecca): `https://services1.arcgis.com/RTK5Unh1Z71JKIiR/arcgis/rest/services/Municipal_Waters/FeatureServer/0/query`. Default for Indonesia tenants (Banggai): empty. Format must accept `?f=geojson&where=<LIKE_clause>&outFields=...&returnGeometry=true&outSR=4326&resultRecordCount=50`.
- **Tenant Profile subsection:** MPA site name, slug, description, timezone, **currency** (e.g., IDR, PHP, MYR), language preference default.
- Save and update buttons; all destructive actions captured in AuditLog.

#### EarthRanger Connection Bootstrap (operator runbook)
The 6-step procedure for connecting a tenant to its ER server. Phase 3 generates a `docs/TENANT-ONBOARDING.md` runbook with the steps below — operators follow it; in-app wizard is v2 backlog.

1. **Obtain credentials from the EarthRanger administrator.** Required: server URL (host root only, no `/api/v1.0`), DAS Web Token (Bearer token, 40-char alphanumeric created in ER Admin → DAS Configuration → DAS Access Tokens), ER Track Token (separate Bearer token for SocketIO). Username + password are optional fallback for legacy instances. Token's role must allow at minimum: read on `/subjects/`, `/activity/patrols/`, `/activity/events/`, `/subject/<id>/tracks/`; write on `/activity/patrols/` and `/activity/events/` for push-back.
2. **Site Admin enters credentials in Tenant Settings → EarthRanger Connection.** All fields are encrypted at rest. Base URL is auto-normalized: `https://my-org.pamdas.org`, `https://my-org.pamdas.org/`, and `https://my-org.pamdas.org/api/v1.0` all accepted; missing scheme is rejected with clear error.
3. **Click "Test Connection".** Server-side performs `GET /subjects/?page_size=1` with the provided credentials. On success, shows green "Connected" status with last-tested timestamp. On failure, surfaces the verbatim ER error (HTTP code + body) so the operator can diagnose: 401 = wrong credentials, 403 = insufficient scope, network errors = URL or firewall issue. Test is mandatory before saving.
4. **Click "Verify ER Limits" (one-time, per tenant).** Runs the ER Instance Verification Checklist (see Sync Engine → ER Instance Verification Checklist). Tests actual `page_size` honored, presence of rate-limit headers, and prompts the Site Admin for the manual entries (track-window upper bound, token rotation cadence). Persists results to tenant row. Subsequent sync engine behavior adapts to verified limits.
5. **Click "Save" — sync engine starts automatically.** First Deep Sync fires immediately on save. Sync Health subsection updates with `sync_state = running` and first synced records appear within minutes.
6. **Click "Force Resync" if a full backfill is needed faster.** For tenants with extensive ER history (>1500 patrols), the initial Deep Sync may take 30 minutes to 2 hours to fully populate. The button is safe to click multiple times — sync mutex collapses concurrent invocations to one.

After Step 5, the tenant is operational. The Site Admin should verify within 24 hours: (a) `/api/health` returns `ok`, (b) Sync Health shows `last_error: null` after a complete Deep Sync cycle, (c) Patrol Monitor shows expected patrol count vs ER source-of-truth.

### Super Admin Panel
- Create/edit/deactivate tenants — slug is immutable after creation in v1 (changing slug breaks bookmarks and links; if needed in future, add TenantSlugAlias for 301 redirects).
- Tenant table: name, slug, EarthRanger server, user count, events (30d), last sync, status.
- Assign initial Site Admin per tenant.
- Platform-level KPI cards: total tenants, total users, total events.
- Cross-tenant health overview.
- **Tenant impersonation flow** (Super Admin support tool):
  - Clicking "Manage" on a tenant row enters the tenant's pages in **read-only mode by default**. All `/[tenant]/*` routes render normally for browsing/inspection, but mutation buttons (save, delete, acknowledge, drag-to-resolve, edit, etc.) are **disabled with tooltip:** "Impersonation Mode disabled — click your avatar to enable."
  - A persistent **yellow banner** appears at the top of every tenant page: `🔒 Viewing {TENANT NAME} as Super Admin (read-only). [Enable Impersonation Mode]`
  - **Enable Impersonation Mode** opens a confirmation modal: "You are about to make changes inside another tenant. All actions will be logged with your Super Admin user ID and a high-severity audit flag. Continue?" Requires **typed confirmation** — Super Admin must type the tenant's slug exactly. No typo, no enable.
  - On confirmation: mutation buttons enable, banner turns **red**: `🔴 IMPERSONATION ACTIVE — {TENANT NAME} — All actions audited. [Disable]`
  - **Auto-expiry: 30 minutes of inactivity** (no mutations in 30 min) — impersonation drops back to read-only. Re-enable requires re-confirming the slug.
  - **Audit:** a high-severity AuditLog entry is written on every toggle (ON with confirmation timestamp, OFF with session duration). Every mutation performed while impersonating gets two user IDs in AuditLog: `acting_user_id` (Super Admin) and `impersonated_as_tenant_id`. Normal AuditLog rows only have `user_id`.
  - **Session storage:** impersonation state lives in the auth session, not persisted in DB. Logging out clears it. Closing the browser clears it.
  - Super Admin cannot impersonate inside the `/admin/*` routes (these are platform-level, no tenant context).

### Internationalization
- Language switcher: English, Bahasa Indonesia, Bahasa Malaysia
- Switcher visible on login page and in header
- All UI labels, buttons, navigation, and system messages translated
- EarthRanger-sourced data displayed as-is (original language from field reports)

## Roles + Permissions
| Role | Can do | Cannot do |
|------|--------|-----------|
| Super Admin | Create/manage tenants, assign Site Admins, view platform health, access any tenant for support (read-only by default; explicit Impersonation Mode toggle creates high-severity AuditLog entry and shows banner), manage platform-level settings | Cannot operate within a tenant as a regular user without being explicitly added; cannot modify EarthRanger configurations |
| Site Admin | Configure EarthRanger connection + sync intervals + ArcGIS reference URL, manage users within own tenant, configure alert rules, manage area boundaries (create/edit/delete), view sync health + force resync + reset cache, view all reports + export, perform all Operator and Coordinator actions within own tenant | Cannot create or manage other tenants; cannot access other tenants' data; cannot modify platform-level settings |
| Field Coordinator | Plan patrol areas (draw polygons), create + edit area boundaries, schedule ranger assignments (Gantt), monitor patrols, review and edit event details, log fuel entries, view all reports, export reports (including 3-page Patrol Coverage Template Report PDF), manage Kanban board | Cannot delete area boundaries; cannot manage users; cannot configure EarthRanger connection / sync / alert rules; cannot access tenant settings; cannot reset sync cache |
| Command Center Operator | Monitor War Room and live map, monitor event feed, update event states (new→active→resolved), acknowledge alerts, escalate critical events, fill in event details via Kanban, add accompanying rangers to events/patrols, log fuel entries, view area boundaries (read-only), view dashboards and reports | Cannot create/edit/delete patrol areas or area boundaries; cannot schedule rangers; cannot manage users; cannot configure tenant settings or alert rules; cannot export reports |

### Permission Matrix (used by Phase 3 to wire tRPC procedure guards)

| Permission key | Operator | Coordinator | Site Admin | Super Admin |
|---|:---:|:---:|:---:|:---:|
| `event.view` | ✅ | ✅ | ✅ | ✅ (cross-tenant, read-only) |
| `event.update_state` | ✅ | ✅ | ✅ | ❌ |
| `event.edit_details` | ✅ | ✅ | ✅ | ❌ |
| `event.add_companion` | ✅ | ✅ | ✅ | ❌ |
| `patrol.view` | ✅ | ✅ | ✅ | ❌ |
| `patrol.add_companion` | ✅ | ✅ | ✅ | ❌ |
| `patrol.export_filtered` | ❌ | ✅ | ✅ | ❌ |
| `patrol_area.create` | ❌ | ✅ | ✅ | ❌ |
| `patrol_area.edit` | ❌ | ✅ | ✅ | ❌ |
| `patrol_schedule.create` | ❌ | ✅ | ✅ | ❌ |
| `area.view` | ✅ | ✅ | ✅ | ❌ |
| `area.create` | ❌ | ✅ | ✅ | ❌ |
| `area.edit` | ❌ | ✅ | ✅ | ❌ |
| `area.delete` | ❌ | ❌ | ✅ | ❌ |
| `fuel.log` | ✅ | ✅ | ✅ | ❌ |
| `fuel.edit_own` | ✅ | ✅ | ✅ | ❌ |
| `fuel.edit_any` | ❌ | ✅ | ✅ | ❌ |
| `fuel.delete` | ❌ | ❌ | ✅ | ❌ |
| `report.view` | ✅ | ✅ | ✅ | ❌ |
| `report.export` | ❌ | ✅ | ✅ | ❌ |
| `report.coverage` | ✅ | ✅ | ✅ | ❌ |
| `report.coverage.export` | ❌ | ✅ | ✅ | ❌ |
| `alert.acknowledge` | ✅ | ✅ | ✅ | ❌ |
| `alert_rule.manage` | ❌ | ❌ | ✅ | ❌ |
| `sync.view_health` | ❌ | ❌ | ✅ | ❌ |
| `sync.force_resync` | ❌ | ❌ | ✅ | ❌ |
| `sync.reset_cache` | ❌ | ❌ | ✅ | ❌ |
| `audit.view` | ❌ | ❌ | ✅ | ✅ (cross-tenant) |
| `user.manage` | ❌ | ❌ | ✅ | ❌ |
| `tenant.configure` | ❌ | ❌ | ✅ | ❌ |
| `tenant.manage` | ❌ | ❌ | ❌ | ✅ |


## Data Entities

### Primary Key Convention (applies to ALL entities below)

Every entity uses **`id String @id @default(cuid())`** as its primary key. No autoincrement integers, no UUID v4, no composite keys.

- **Why cuid:** sortable by creation time (k-sortable), URL-safe (no hyphens or special chars), shorter than UUID, no contention on insert. Prisma `@default(cuid())` generates them.
- **External IDs (from EarthRanger) are stored separately** in `er_*_id` columns (string type). E.g., `Patrol.er_patrol_id`. Unique per tenant via `@@unique([tenant_id, er_patrol_id])`.
- **Foreign key references** are always `<owner>_id String` referencing the cuid of the parent row.
- **`entity_id` in AuditLog is a generic string** that can hold any entity's PK regardless of source.

Phase 3 generates the Prisma schema with this convention applied uniformly. Deviations require explicit justification.

### Tenant Isolation Convention

Every tenant-scoped entity has `tenant_id String` as a non-nullable FK to `Tenant.id`, **even when redundantly derivable through parent joins** (e.g., PatrolSegment has `patrol_id`, but ALSO carries `tenant_id` directly). This is intentional:

- The Code Modification Guardrail "Never query the DB without a tenant filter" depends on every queryable table having the column.
- L4 Prisma middleware injects `tenant_id` into every query — middleware can only enforce on direct columns, not joined ones.
- Denormalization is kept consistent via Prisma triggers / cascading writes: when Patrol.tenant_id is set, PatrolSegment.tenant_id is set to the same value on insert. Updates to Patrol.tenant_id are forbidden (no tenant migration in v1).

Platform-level entities (User with `tenant_id = null` for Super Admin, AuditLog with nullable `tenant_id` for platform events) are the only exceptions and are explicitly called out per-entity.

### Entities

**Tenant:** id (cuid), name, slug (subdirectory), earthranger_url (encrypted), earthranger_username (encrypted, **nullable** — optional fallback when no token), earthranger_password (encrypted, **nullable** — optional fallback when no token), earthranger_das_token (encrypted, **nullable** — Bearer token for REST API; either token pair OR username/password must be present), earthranger_track_token (encrypted, **nullable** — Bearer token for SocketIO WebSocket), timezone, currency (e.g., IDR, PHP, MYR — configurable per tenant), description, is_active, **active_check_interval_seconds** (int, floor 60, ceiling 3600, default 120 — high-frequency sync of newest records and open patrols), **deep_sync_interval_seconds** (int, floor 300, ceiling 86400, default 600 — full-history pagination), **er_timeout_ms** (default 30000), **sync_state** (enum: `running` | `rate_limited` | `auth_failed` | `manual_pause` | `paused`), **paused_until** (ISO, nullable — during Retry-After or manual pause), **auth_failure_count** (int, default 0 — resets to 0 on any non-401 response, trips circuit breaker at 2), **er_verified_max_page_size** (int, nullable — populated by Verify ER Limits action), **er_verified_track_window_days** (int, nullable), **er_verified_concurrent_cap** (int, default 4), **er_verified_has_ratelimit_headers** (boolean, nullable), **er_verified_token_rotation_days** (int, nullable), **er_last_verified_at** (ISO, nullable), **arcgis_boundary_url** (nullable encrypted string — per-tenant ArcGIS reference layer endpoint for Area Boundary editor; reference-only, never used at report time), **arcgis_boundary_outfields** (nullable string — comma-separated field names, e.g., "municipali,province"), created_at, updated_at
— **EarthRanger credentials policy:** the tenant must have EITHER `earthranger_das_token` (preferred — used for both REST and SocketIO when `earthranger_track_token` is also present) OR `earthranger_username` + `earthranger_password` (fallback for legacy ER instances that don't support token auth). Constraint enforced in tRPC mutation guard and DB CHECK constraint. Bootstrap procedure walks operators through choosing one of the two auth paths.

**User:** id, tenant_id (nullable for Super Admin), email, name, password_hash, role (super_admin | site_admin | field_coordinator | operator), language_preference (en | id | ms), is_active, last_login_at, created_at, updated_at

**Subject (synced from ER):** id, tenant_id, er_subject_id, name, subject_type, subject_subtype, is_active, region, sex, last_position_lat, last_position_lon, last_position_at, additional_json, synced_at, created_at, updated_at

**Event (synced from ER):** id (cuid), tenant_id, er_event_id, serial_number, event_type, event_category, **priority** (enum: `critical` | `high` | `medium` | `low`), **state** (enum: `new` | `active` | `resolved`), title, location_lat, location_lon, time, end_time, reported_by_name (string from ER), **reported_by_user_id** (nullable FK to User — derived at sync time by case-insensitive match of `reported_by_name` against `User.name`), **reported_by_known_ranger_id** (nullable FK to KnownRanger — fallback when no User matches), event_details_json (raw ER blob; preserved for forward-compatibility), notes_json, **area_name** (string from ER — free-text, e.g., "A12a", "Area 12", "Solan Bajo Reef"; preserved verbatim from ER), **area_boundary_id** (nullable FK to AreaBoundary — derived at sync time by name+alias match against the tenant's AreaBoundary table, OR by nearest-boundary lookup on `location_lat`/`location_lon` when name match fails; falls back to NULL when neither approach yields a confident match), **area_derived_at** (ISO, nullable — when the derivation last ran), **offender_name** (string, nullable), **vessel_name** (string, nullable), **vessel_registration** (string, nullable), **address** (string, nullable), **action_taken** (text, nullable), **has_photo** (boolean — true when ER returned at least one photo attachment), synced_at, created_at, updated_at
— **Field ownership:** ER owns `er_event_id`, `serial_number`, `event_type`, `event_category`, `priority`, `title`, `location_*`, `time`, `end_time`, `reported_by_name`, `notes_json`, `event_details_json`, `has_photo`. CC owns `state`, `area_boundary_id` (derived), `area_derived_at`, and any operator-filled detail fields (`offender_name`, `vessel_name`, `vessel_registration`, `address`, `action_taken`) — these are also written back to ER's `event_details` JSON blob under the `marine_guardian.*` namespace at push-back time, but the CC table is the working copy.
— **Sync pull does NOT overwrite CC-owned columns** (action_taken, offender_name, vessel_name, vessel_registration, address) when the operator has set them locally. ER-side changes to these fields, if any, are surfaced via a "conflict detected" badge in Event Detail.

**EventType (synced from ER):** id, tenant_id, er_eventtype_id, value, display, category, default_priority, icon_id, is_active, schema_json, synced_at
— IMPORTANT: Event types are dynamic. Categories include Law Enforcement (with sub-types like Unreg Illegal Fishing, Fishing in Prohibited Area, Taking of Prohibited Species, Use of Prohibited Gears, Compressor Fishing, Others, Destructive Practices) and Monitoring, Patrolling & Surveillance (with sub-types like Marine Wildlife Sightings, Infrastructure and Assets, Research and Studies, Community Support, Threats on Habitat). Patrol types include Foot Patrol and Seaborne Patrol. New event types can be added at any time in EarthRanger Admin and must be automatically picked up by the next event type sync. All reports, charts, and performance tracking must dynamically adapt to whatever event types exist — never hardcode event type lists.

**Patrol (synced from ER):** id (cuid), tenant_id, er_patrol_id, serial_number, title, patrol_type (foot | seaborne), boat_name (nullable — for seaborne patrols, synced from ER patrol data), state (enum: `open` | `scheduled` | `active` | `done` | `cancelled` | `draft` — synced from ER as-is, case-normalized), start_time, end_time, start_location_lat (nullable, derived from first track point or segment start_location), start_location_lon (nullable), end_location_lat (nullable), end_location_lon (nullable), total_distance_km (from ER, nullable — sometimes missing or wrong), total_hours (from ER, nullable), **computed_distance_km** (nullable — recomputed from PatrolTrack via haversine sum; preferred over `total_distance_km` in reports), **computed_duration_hours** (nullable — recomputed from PatrolTrack using `Math.abs(t1 - t0)` per-point or pro-rated when timestamps missing), **is_test_patrol** (boolean — auto-set true at sync time if title regex-matches `/test|qa|demo/i`; default-excluded from reports), **is_deleted** (boolean, default false — soft-delete via deep-sync reconciliation), **deleted_at** (ISO, nullable), **sync_needed** (boolean — derived from state + segment end_time, drives sync-engine candidate selection), **first_seen_at** (ISO — first time this patrol entered the local cache), **last_synced_at** (ISO, nullable — last time refreshed via sync engine), **area_name** (string, nullable — free-text "primary area" of the patrol, derived from objective field or start location's nearest AreaBoundary), **area_boundary_id** (nullable FK to AreaBoundary — derived from start_location via `nearestBoundary()` at sync time; used as the patrol's primary jurisdictional attribution. Note: a single patrol may cross multiple boundaries — coverage analytics use PatrolTrack segments, not this single FK. This field is for the simple "which area is this patrol primarily in" question), **area_derived_at** (ISO, nullable), synced_at, created_at, updated_at
— Note: EarthRanger's UI displays "SEABOURN PATROL" but the canonical spelling in this codebase is "seaborne". The UI display label should match EarthRanger's spelling ("Seabourn") for user familiarity; the code/database uses "seaborne".
— Foot vs Seaborne detection: read `patrol_type` enum directly. No substring matching, no display-name fallback. ER's API field is mapped to the enum at sync time; unknown values default to `foot` and log a SyncLog warning.
— **`er_patrol_url`** is a virtual/computed field: `{tenant.earthranger_url}/admin/activity/patrol/{er_patrol_id}/change/` — used by the "Open in EarthRanger" action.

**PatrolSegment (synced from ER):** id (cuid), tenant_id (denormalized from Patrol — kept in sync via insert-time write; immutable after creation), patrol_id, er_segment_id, scheduled_start, scheduled_end, actual_start, actual_end, leader_name, leader_er_id, synced_at

**Observation (synced from ER):** id, tenant_id, er_observation_id, subject_id, location_lat, location_lon, recorded_at, source_name, additional_json (speed, heading, altitude, battery), synced_at

**SubjectGroup (synced from ER):** id, tenant_id, er_group_id, name, parent_id, subject_count, is_visible, synced_at

**PatrolArea (Command Center native):** id, tenant_id, name, description, patrol_type (foot | seaborne), polygon_geojson, color_hex, created_by, is_active, created_at, updated_at

**PatrolSchedule (Command Center native):** id, tenant_id, patrol_area_id, ranger_user_id, ranger_name, scheduled_start, scheduled_end, notes, created_by, created_at, updated_at

**AlertRule (Command Center native):** id, tenant_id, name, **kind** (`event_match` | `subject_stale` | `patrol_overdue` | `sync_failure`), **condition_json** (typed shape per kind — validated with zod per kind), **recipients_json** (array of `{kind: "role", role: ...}` | `{kind: "user", user_id: ...}`), **channels** (array of `in_app` | `email`), **cooldown_minutes** (int, default 5, range 0–1440), is_active, **last_evaluated_at** (ISO, nullable — used by event_match to skip already-evaluated events), created_by, created_at, updated_at

**Notification (Command Center native):** id, tenant_id, alert_rule_id (nullable — null for system-fired notifications not tied to a rule), event_id (nullable — set when notification references an event), patrol_id (nullable), subject_id (nullable), title, message, notification_type (`critical` | `warning` | `info` | `system`), created_at
— **Per-user read state lives in NotificationRecipient**, NOT on Notification itself. One Notification row, N NotificationRecipient rows.

**NotificationRecipient (Command Center native):** id, notification_id (foreign key, cascade on delete), user_id (foreign key), is_read (boolean, default false), read_at (ISO, nullable), email_sent_at (ISO, nullable — set when email was dispatched), email_status (`pending` | `sent` | `suppressed_by_cooldown` | `digested` | `failed`), created_at
— Purpose: enables per-user read state and per-user email-dispatch tracking. The Notification Center page queries `NotificationRecipient WHERE user_id=currentUser.id JOIN Notification`.

**SyncLog (Command Center native):** id (cuid), tenant_id, sync_type (enum: `events` | `subjects` | `patrols` | `observations` | `event_types` | `subject_groups` | `tracks`), status (enum: `success` | `failed` | `partial`), records_synced (int), error_message (text, nullable), started_at, completed_at (ISO, nullable — null while in-flight)

**AuditLog (Command Center native):** id (cuid), tenant_id (nullable — null for platform-level events like tenant creation), user_id (FK to User — the user whose session performed the action), **acting_user_id** (FK to User, nullable — set only when a Super Admin is impersonating; same as `user_id` for normal actions, NULL is forbidden if `impersonated_as_tenant_id` is set), **impersonated_as_tenant_id** (FK to Tenant, nullable — set only during Super Admin impersonation; correlates to the tenant whose data was acted on), **severity** (enum: `info` | `warning` | `high` | `critical` — high+ for impersonation toggles, credential changes, cache resets, boundary deletions; default `info`), action (string — e.g., `event.state_change`, `tenant.config_update`, `impersonation.enable`), entity_type (string — e.g., `Event`, `Patrol`, `AreaBoundary`, `Tenant`), entity_id (string — stored as string regardless of source entity's PK type, for uniformity; cast at query time), changes_json (jsonb — before/after diff or operation payload), ip_address (inet, nullable), user_agent (text, nullable), created_at

**AccompanyingRanger (Command Center native):** id, tenant_id, entity_type (event | patrol), entity_id (references event or patrol), ranger_type (registered | freetext), registered_user_id (nullable — references User if ranger_type=registered), known_ranger_id (nullable — references KnownRanger if previously used freetext name), freetext_name (nullable — for unregistered rangers), added_by_user_id, created_at

**FuelEntry (Command Center native):** id (cuid), tenant_id, **area_name** (string — user-selected from the tenant's AreaBoundary list at logging time; stored as free-text for resilience if a boundary is later renamed or deleted), **area_boundary_id** (FK to AreaBoundary, nullable — set at logging time when user picks from the list; can become NULL if the boundary is later deleted, but `area_name` preserves the original choice), date_received, liters (decimal, > 0), total_price (decimal, > 0), currency (inherited from tenant on creation, stored for historical accuracy), receipt_photo_url (nullable), notes (nullable), logged_by_user_id, created_at, updated_at
— Purpose: Tracks bulk fuel allocations per area. Fuel is shared across all boats in an area, not tracked per individual boat. Average consumption rate is calculated by dividing total liters by total seaborne patrol km for the same area and period. Joins to Patrol via `area_boundary_id` (preferred) or `area_name` (fallback string match) — see Area Attribution rules below.

**KnownRanger (Command Center native):** id, tenant_id, name, source (earthranger_sync | manual_entry), er_subject_id (nullable — if synced from ER subjects of type "person"/"ranger"), is_active, created_at, updated_at
— Purpose: maintains a registry of all known rangers for the autocomplete dropdown. Populated from three sources: (1) synced from EarthRanger subjects with subject_type="person", (2) users registered in the Command Center, (3) free-text names previously entered as accompanying rangers (promoted to known rangers for future autocomplete).

**AreaBoundary (Command Center native):** id, tenant_id, name, aliases (text array — for fuzzy name match against patrol locations and event addresses), region (string — e.g., "Mindoro", "Palawan", "Banggai Island"), source (`official` | `custom` — `custom` whenever the user has saved any geometry, even if originally copied from ArcGIS), geometry_type (`Polygon` | `LineString`), geometry_geojson (Polygon or LineString geometry — single source of truth for all reports and coverage analytics), is_enabled (boolean — disabled boundaries are excluded from reports), override_official (boolean — true when geometry has ≥3 vertices; tracked for audit/display purposes only, does not affect report behavior), arcgis_reference_id (nullable string — for display-time linking to the ArcGIS preview during editing), created_by_user_id, created_at, updated_at
— Purpose: defines jurisdictional boundaries for patrol coverage **attribution**. Distinct from PatrolArea (which is for coverage **planning**). All reports query AreaBoundary directly; ArcGIS is never consulted at report time. Tenants without an ArcGIS endpoint configured work normally — they just draw boundaries from scratch with no reference layer.

**PatrolTrack (Command Center native):** id, tenant_id, patrol_id (unique foreign key — one track per patrol), subject_id (the GPS-tracked subject from `segment[0].leader.id`), since (ISO — from `segment[0].time_range.start_time`), until (ISO — from `segment[0].time_range.end_time || now`), track_geojson (FeatureCollection — full GPS track from EarthRanger), has_timestamps (boolean — true when per-point times are present and lengths match coordinates), point_count (int), last_track_time (ISO — most recent point time), patrol_ended (boolean — true when patrol's segment[0] has end_time), source (`er_api` | `cache`), fetched_at, created_at, updated_at
— Purpose: materialized per-patrol GPS track for fast area-covered analytics, single-patrol map rendering, and km/hrs recomputation. Background job (Patrol Track Materialization) populates from ER `/subject/<leader_id>/tracks/?since=&until=` for each patrol's `segment[0].leader.id` + `time_range`. Atomic upsert on `(patrol_id)`. Concurrency capped at 4 per tenant via async-pool helper. **`needs_refetch(patrol)` returns true when:** (a) no PatrolTrack row exists for the patrol, OR (b) `patrol_ended=false` (still active), OR (c) `patrol_ended=false` in PatrolTrack but the live patrol's `segment[0].time_range.end_time` is now set (i.e., the patrol just ended).
— **CRITICAL TIME-ORDER QUIRK:** EarthRanger returns track coordinates and times **newest-first**. All time-delta math MUST use `Math.abs(times[i] - times[i-1])` — adjacent deltas can be negative if order is assumed forward. This is a load-bearing fact: silent bugs in coverage_hrs result if violated. Every track-math function must include this comment inline at the call site.

**ReportExport (Command Center native):** id, tenant_id, requested_by_user_id, report_type (`coverage` | `area` | `consolidated` | `detailed` | `rangers` | `patrol_filtered`), params_json (the inputs used to generate the report — date range, area, filters, etc.), paper_size (`A4` | `Letter` | `Legal`), status (`queued` | `rendering` | `ready` | `failed`), file_path (nullable string — set when status=ready), file_size_bytes (nullable int), error_message (nullable string — set when status=failed), created_at, completed_at (nullable)
— Purpose: every PDF export is async. tRPC mutation `report.queueExport(...)` creates this row + enqueues a `pdf-render` BullMQ job + returns the export_id immediately. A separate Docker service (`marine-guardian-pdf-renderer`) running headless Chromium via Puppeteer picks up the job, renders the report, writes the PDF to disk, updates the row, fires an in-app notification. User downloads via `/[tenant]/exports/{id}/download`. Files retained 30 days then deleted by maintenance job; ReportExport row retained indefinitely (audit). Failed renders retry 3× with backoff before status=failed.

### Area Attribution Rules (the single source of truth for "what area is this in")

The word "area" appears across Per Area Report, Consolidated Report, Fuel Logging, Patrol Monitor, Event Detail, and the Ranger Performance matrix. Three different concepts hide behind the same word; this section is the canonical resolution Phase 3 follows.

**Three layers — each entity has one or both:**

1. **`area_name` (string)** — raw free-text from EarthRanger. Values like `"A12a"`, `"Area 12"`, `"Solan Bajo Reef"`. Preserved verbatim per row for resilience and audit. Never mutated by CC. Present on Event, Patrol, FuelEntry.

2. **`area_boundary_id` (nullable FK to AreaBoundary)** — derived. Set by a derivation job after sync (Event, Patrol) or at logging time (FuelEntry). NULL means the derivation didn't produce a confident match — the row is still queryable by `area_name` string, just not joined to the boundary table.

3. **`AreaBoundary` table** — the authoritative tenant-curated set of jurisdictional boundaries (see entity above). Reports filter, group, and label by these.

**Derivation algorithm** (run at sync time for Event + Patrol, at logging time for FuelEntry):

```
deriveAreaBoundary(row) =
  1. Try name+alias match:
     for each enabled AreaBoundary in tenant:
       if row.area_name (case-insensitive, trimmed)
          equals boundary.name
          OR is contained in boundary.aliases array
          (also case-insensitive, trimmed):
         return boundary.id
  2. Fall back to geographic nearest-boundary if row has coordinates:
     if row has location_lat / location_lon (or start_location_*):
       use nearestBoundary(point, enabled_boundaries) helper
       if minimum distance ≤ NEAREST_BOUNDARY_THRESHOLD_KM (default 5 km):
         return boundary.id
       else:
         return NULL
  3. Return NULL (preserves area_name verbatim).

set row.area_boundary_id = <result>
set row.area_derived_at = now()
```

**Re-derivation triggers:**
- When a AreaBoundary is created, edited, deleted, enabled, or disabled, queue `area-rederive` BullMQ jobs for all Event/Patrol/FuelEntry rows in the tenant. Concurrency cap 50 rows/sec to avoid swamping Postgres.
- When a sync upsert changes `area_name` on an Event or Patrol, re-derive that row inline.
- Manual "Re-derive Areas" button in Tenant Settings → Sync Health (Site Admin only) triggers a full rebuild for the tenant.

**Report query patterns:**
- **Per Area Report** (`/[tenant]/reports/area`): the Area selector dropdown is populated from AreaBoundary (enabled only) for the tenant. Queries filter `WHERE area_boundary_id = selected.id`. Rows where `area_boundary_id IS NULL` appear in a separate "Unattributed" group with their raw `area_name` displayed.
- **Consolidated Report**: rows = enabled AreaBoundary in tenant; columns = aggregates. Unattributed rows roll up into a footer "Outside enabled boundaries" subtotal.
- **Fuel Logging analytics**: the area selector uses AreaBoundary. Per-area breakdown joins `Patrol` and `FuelEntry` on `area_boundary_id`. When NULL on either side, those rows are excluded from the per-area row but counted in the "Total liters / Total km" headline KPIs.
- **Patrol Coverage Template Report**: Page 1 Patrol Index uses `area_name` for display (verbatim, what the field operator typed). Page 2 Area Boundary Summary and Page 3 Area Covered use `area_boundary_id` and the boundary geometry exclusively.

**Why this two-tier design:**
- Free-text `area_name` survives boundary renaming, deletion, alias changes, and tenant reorganization.
- Derived FK enables proper joins, GROUP BY queries, and Per Area Report dropdowns.
- The fallback chain (exact match → alias → nearest geographic) tolerates messy ER data without forcing operators to perfectly mirror their boundary names in field reports.
- NULL derivations are explicit and visible in reports, not silently grouped.

**Phase 3 implementation note:** the derivation job is a load-bearing piece of data quality. Unit tests must cover: exact name match, alias match, case differences, trimming, nearest-boundary within threshold, nearest-boundary beyond threshold (NULL result), disabled boundary excluded, missing coordinates with no name match (NULL result), tenant isolation (no cross-tenant matches).

## Integrations
**EarthRanger API (per tenant):** REST API v1.0 + v2.0 for data sync (subjects, events, event types, patrols, observations, subject groups, tracks). Auth uses Bearer token in `Authorization` header — token is a 40-char alphanumeric string created in ER Admin (DAS Access Tokens). SocketIO WebSocket for real-time subject position updates uses the same Bearer token mechanism (sent as `authorization` message after WebSocket connect). Each tenant may have two separate tokens: DAS Web Token (REST API) and ER Track Token (SocketIO). Command Center pushes event state updates back to ER via API. — OSS/Self-hosted

**ArcGIS Feature Service (per tenant, optional — reference only):** Read-only external boundary feature service used for visual reference in the Area Boundary editor. Endpoint format: `<server>/FeatureServer/<layer>/query?f=geojson&where=<LIKE_clause>&outFields=<fields>&returnGeometry=true&outSR=4326&resultRecordCount=50`. Default for Philippines tenants (Mindoro, Pecca): `https://services1.arcgis.com/RTK5Unh1Z71JKIiR/arcgis/rest/services/Municipal_Waters/FeatureServer/0/query`, output fields `municipali,province`. Default for Indonesia tenants (Banggai): not configured. **Never queried at report time** — the saved `AreaBoundary.geometry_geojson` is always authoritative. ArcGIS outages do not affect reporting. — Free public API

**Email (SMTP):** Transactional email for alert notifications and password resets. — SMTP (self-hosted or SES)

**Twilio SMS (scaffolded, not active v1):** SMS notification channel for critical alerts. Integration code scaffolded, env vars prepared, but not enabled in v1. — Paid API

**MSG91 SMS (scaffolded, not active v1):** Alternative SMS provider. Same scaffolding approach as Twilio. — Paid API

## Deployment Config
Environments: dev / staging / prod
Hosting:      Single VPS via Komodo (planning for multiple servers later)
Dev mode:     MODE A — WSL2 native (only supported mode — pre-locked)
Docker Hub:   enabled — hub_repo: bonitobonita24/marine-guardian

## Mobile Needs

**Native mobile app:** None — web only

**Per-page mobile strategy:**

| # | Page | Strategy | Notes |
|---|------|----------|-------|
| 1 | Login | Mobile First | Auth entry — used from any device |
| 2 | Command Center (War Room) | Mobile Ready | 100-inch TV optimized — desktop/large display primary |
| 3 | Dashboard (Standard) | Mobile Ready | Ops center screen — data-dense, multi-panel |
| 4 | Live Map | Mobile Ready | Full-screen map with layers, heatmaps, drawing tools — desktop primary |
| 5 | Event Kanban Board | Mobile Ready | Multi-column Kanban drag-and-drop — desktop primary |
| 6 | Event Detail | Mobile First | Operators/field coordinators review single incident on any device |
| 7 | Patrol Monitor | Mobile Ready | Active patrol tracking with map + table — desktop primary |
| 8 | Patrol Area Map Editor | Mobile Ready | Drawing polygons on map — needs precision, desktop primary |
| 8a | Area Boundary Editor | Mobile Ready | Drawing/editing jurisdictional boundaries on map with ArcGIS reference overlay — needs precision, desktop primary |
| 9 | Patrol Schedule (Gantt) | Mobile Ready | Gantt chart — desktop only workflow |
| 10 | Fuel Logging | Mobile First | Rangers log fuel receipts in the field from phone — camera capture for receipt photos |
| 11 | Reports — Per Area Summary | Mobile Ready | Bar charts + tables — desktop reporting |
| 11a | Reports — Patrol Coverage (Template) | Mobile Ready | Three-page printable PDF — primarily desktop for editing/printing, but readable on tablet |
| 12 | Reports — Consolidated | Mobile Ready | Cross-area comparison tables + charts — wide data tables |
| 13 | Reports — Detailed Event Log | Mobile Ready | Multi-column detailed tables — desktop |
| 14 | Reports — Ranger Performance | Mobile Ready | Performance matrix + patrol stats per ranger — wide table |
| 15 | Ranger Performance Detail | Mobile First | Single ranger's stats — reviewable on phone by field coordinator |
| 16 | Alert Rules Configuration | Mobile Ready | Admin sets up alert conditions — infrequent, desktop |
| 17 | Notification Center | Mobile First | In-app alerts list — operators check from any device |
| 18 | User Management | Mobile Ready | Admin manages users/roles — settings panel |
| 19 | Tenant Settings (ER Connection + Sync Health + ArcGIS + Profile) | Mobile Ready | Admin configures EarthRanger API and views sync health — rare, desktop |
| 20 | Super Admin — Tenant Management | Mobile Ready | Platform admin onboards new MPA sites — rare, desktop |

## Non-functional Requirements
Performance:    <500ms API response for dashboard and report queries at 50 concurrent users per tenant
Uptime:         99.5% SLA for prod
Data retention: Synced data kept indefinitely (mirrors EarthRanger). Sync logs retained 90 days. Notifications retained 1 year.
Compliance:     None required for v1
Accessibility:  Standard web accessibility (semantic HTML, keyboard navigation)

### Time, Date, and Timezone Conventions
The product spans Indonesia (Asia/Makassar, UTC+8 WITA, no DST), Philippines (Asia/Manila, UTC+8 PHT, no DST), and Malaysia (Asia/Kuching, UTC+8 MYT, no DST) — all three current target regions are coincidentally UTC+8 with no DST. The rules below assume this; if a future tenant lands in a DST-observing zone (e.g., Australia, US territories), audit every `getMonthWeekPeriods`-style function before launch.

- **Storage:** all ISO 8601 timestamps in Postgres are **UTC**. Prisma's `DateTime` type stores TIMESTAMPTZ. Never write loose strings like `"2026-05-15"` server-side — those parse as local-midnight and produce silent off-by-a-day bugs.
- **Transport:** all API responses (tRPC + REST) emit UTC ISO 8601 with explicit `Z` suffix. Date-only fields (e.g., `FuelEntry.date_received`) use `YYYY-MM-DD` and are tenant-zone-anchored (the field semantically means "the day the fuel arrived in the tenant's local timezone").
- **Rendering:** the browser renders timestamps in the **tenant's timezone** by default. Users can override to their own browser zone via a User preference (`user.display_timezone` nullable, falls back to `tenant.timezone`). All rendering uses `Intl.DateTimeFormat` — never hand-formatted.
- **"Current week" semantics:** the patrol-monitor and report period selectors use Monday–Sunday weeks computed in **tenant local time**, not UTC. A Monday 00:00 in Manila tenant is `Sunday 16:00 UTC` in the database query. This is intentional so the user's "this week" feels right.
- **Track time math: `Math.abs(t1 - t0)`** — EarthRanger returns track coordinates newest-first, so adjacent time deltas can be negative. Every track-math callsite must include this comment inline. Already documented at the PatrolTrack entity level; restated here for emphasis.
- **DST audit (deferred until needed):** all functions that compute day/week/month boundaries from a timezone must be re-tested if a DST-observing tenant is onboarded: `getMonthWeekPeriods`, `setDefaultDateRange`, weekly/monthly/annual period builders for Coverage Report.

### Capacity Planning
Empirical sizing for the target deployment shape (3 tenants × ~30 active patrols/week × ~1500 patrols/year per tenant). All numbers are estimates pending Phase 5 verification.

| Artifact | Per-unit | Annual per tenant | 5-year ceiling (3 tenants) |
|---|---|---|---|
| Patrol row | ~3 KB | ~5 MB | ~75 MB |
| PatrolTrack row (with GeoJSON) | 30–80 KB | 60–150 MB | ~2 GB |
| Event row | ~2 KB | ~3 MB | ~50 MB |
| Observation row | ~500 B | ~30 MB | ~450 MB |
| AuditLog row | ~1 KB | ~10 MB | ~150 MB |
| Notification + NotificationRecipient | ~1 KB | ~5 MB | ~75 MB |
| Postgres indexes + overhead | — | ~30% of data | ~30% of data |
| Receipt photos (uploads/) | ~2 MB each | ~250 MB | ~3.7 GB |
| PDF exports (kept 30 days) | ~1 MB each | rolling ~3 GB | rolling ~3 GB |

**Total estimate:** ~5–10 GB of Postgres data + ~5 GB of upload files at 5 years across 3 tenants. **Provision the host volume with ≥50 GB headroom.**

No built-in archival or pruning beyond the existing retention rules (sync logs 90d, notifications 1y, PDF exports 30d). AuditLog and synced data are kept indefinitely. v2 backlog item: configurable per-tenant archival policy.

Monitor disk usage via `du -sh /var/lib/postgresql/data` and `du -sh /uploads` from cron; alert when either exceeds 70% of volume. Sync Health UI shows DB size estimate in v2.

### Performance Targets (placeholder, to be verified in Phase 5 stress testing)
- **API latency target:** P95 < 500ms for tRPC queries at 50 concurrent users per tenant (already in NFR header above). P99 < 1500ms.
- **Sync engine throughput:** an Active Check cycle completes within 60 seconds at 5 pages × 100 patrols + 50 candidate refreshes (target: ER round-trip per request ≤ 1s on a healthy ER). A Deep Sync cycle completes within 5 minutes at 100 pages × 200 patrols.
- **Area-Covered aggregation:** computes within 3 seconds for a 1-month period (~150 patrols × ~500 track points), within 30 seconds for an annual period (~1500 patrols). Results cached in Valkey for 60s.
- **PDF render time:** small reports (Per Area, Detailed Log) 3–8 seconds; Coverage Report Monthly 10–15 seconds; Coverage Report Annual 20–30 seconds.
- **Map render:** patrol track viewer modal opens in <500ms for typical tracks (≤500 points). Tracks with >5000 points are pre-simplified via Douglas-Peucker before rendering — Phase 3 includes the simplification.
- **Cold start:** Next.js + worker containers reach ready state within 30 seconds of `docker compose up`. First tenant Deep Sync completes within 10 minutes (typical) to 2 hours (large history backfill).
- **Concurrent dashboards:** target 50 simultaneous per tenant, 200 total across all tenants on single-server deployment. Beyond 200, horizontal scaling required (v2).

These are **placeholders** generated from architectural reasoning, not measurement. Phase 5 stress testing verifies and adjusts.

## Tenancy Model
multi
Subdirectory routing: app.com/mindoro/, app.com/banggai/, app.com/pecca/
Shared global data: event type category definitions (Law Enforcement types, Monitoring types), platform configuration
DB isolation exception: none — all tenant data isolated by tenant_id foreign key with L1-L6 security stack

### Slug Format & Validation
Tenant slugs must satisfy ALL of:
- Lowercase ASCII alphanumeric + hyphens only: regex `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`
- Length 3–30 characters
- No leading or trailing hyphens, no consecutive hyphens (`--`)
- Must not match (case-insensitively) any entry in the **reserved word list** below
- Must be unique within the platform (DB unique constraint)
- **Immutable after creation in v1** — Tenant Settings shows slug as read-only. Changing slugs breaks bookmarks, embedded links in printed reports, and shared URLs. v2 backlog: TenantSlugAlias table for 301-redirect support if slug changes become needed.

Validation runs on both frontend (real-time, with rule-specific error messages) and backend (tRPC mutation guard, plus DB constraint as last line of defense).

### Reserved Slug List
```
admin           api             app             auth
login           logout          signup          register
reset           recovery        verify          confirm
health          healthz         status          metrics
public          static          assets          uploads
files           dashboard       _next           _vercel
docs            help            support         contact
about           privacy         terms           legal
billing         payments        webhook         webhooks
www             mail            ftp             smtp
root            system          internal        super
test            staging         dev             prod
```
These words collide with platform routes, auth flows, infrastructure paths, or carry brand-confusion risk. Phase 3 stores this list in a constant; Super Admin cannot bypass via UI.

## User-Facing URLs
/                                   Login / redirect to tenant dashboard
/[tenant]/command-center            War Room (primary — 100-inch TV view)
/[tenant]/dashboard                 Standard dashboard with KPIs and live feed
/[tenant]/map                       Live map with all layers (standalone)
/[tenant]/events                    Event Kanban board
/[tenant]/events/[id]               Event detail view
/[tenant]/patrols                   Patrol monitor list
/[tenant]/patrols/[id]              Patrol detail with track map
/[tenant]/patrol-areas              Patrol area map editor (coverage planning zones)
/[tenant]/area-boundaries            Area Boundary editor (jurisdictional attribution)
/[tenant]/patrol-schedule           Gantt chart patrol scheduling
/[tenant]/fuel                      Fuel logging and consumption analytics
/[tenant]/reports/area              Per-area report
/[tenant]/reports/coverage          Patrol Coverage Template Report (3-page funder deliverable)
/[tenant]/reports/consolidated      Consolidated cross-area report
/[tenant]/reports/detailed          Detailed event log
/[tenant]/reports/rangers           Ranger performance report
/[tenant]/reports/rangers/[id]      Individual ranger detail
/[tenant]/exports                   Report export queue (user's recent PDF exports, status, download links)
/[tenant]/exports/[id]/download     Download a ready PDF export (auth check + tenant scope check)
/[tenant]/alerts                    Alert rules configuration
/[tenant]/notifications             Notification center
/[tenant]/audit                     Audit log viewer (Site Admin+ only — full history of mutations)
/[tenant]/settings                  Tenant settings (ER connection, sync health, ArcGIS reference, profile)
/[tenant]/users                     User management
/admin/tenants                      Super Admin tenant management
/admin/users                        Super Admin platform user management

Internal-only (service-token auth, not user-accessible):
/_print/{tenant_slug}/{report_type}/{export_id}  Print-only HTML render target for Puppeteer

## Access Control
Public routes:    / (login page only)
Protected routes: /[tenant]/* (require login + tenant membership) — includes /[tenant]/fuel (all authenticated users can log fuel entries), /[tenant]/area-boundaries (read for all, edit Coordinator+, delete Site Admin only), /[tenant]/reports/coverage (read for all, export Coordinator+)
Admin-only:       /[tenant]/settings, /[tenant]/users, /[tenant]/alerts (Site Admin+)
Coordinator+:     /[tenant]/patrol-areas, /[tenant]/patrol-schedule, /[tenant]/reports/* export actions, area boundary create/edit (Field Coordinator+)
Super Admin only: /admin/*

## Data Sensitivity
PII stored:       yes — user email addresses, user names, ranger names (synced from ER)
Financial data:   no
Health data:      no
Audit required:   event state changes, event detail edits, user login/logout, tenant configuration changes (ER credentials, sync intervals, ArcGIS URL), alert rule changes, patrol area creation/modification, area boundary creation/modification/deletion, accompanying ranger add/remove (on events and patrols), fuel entry creation/edits/deletion (involves financial amounts), sync cache reset, Super Admin tenant impersonation toggle
GDPR/compliance:  none required for v1

## Security Requirements
Rate limiting:    public: 30/min | auth: 60/min | api: 120/min | upload: 20/min
CORS origins:     dev: localhost:* | staging: https://mg-staging.powerbyte.app | prod: https://mg.powerbyte.app
Security layers:  L3 RBAC + L5 AuditLog + L6 Prisma guardrails always active
                  L1+L2+L4 activated for multi-tenant data isolation

## Environments Needed
dev / stage / prod

## Domain / Base URL Expectations
Dev:     http://localhost:[port assigned by Phase 3 — do not specify a number here]
Stage:   https://mg-staging.powerbyte.app
Prod:    https://mg.powerbyte.app

## Infrastructure Notes
Default: all services run in Docker Compose — mono-server via Komodo for dev/staging/prod.
Docker Hub publishing: enabled — hub_repo: bonitobonita24/marine-guardian
pgAdmin: included on all environments — credentials auto-generated by Phase 3
CREDENTIALS.md: generated by Phase 3 — master credentials list for all envs, strictly gitignored
Security: HTTP headers + rate limiter + DOMPurify sanitizer scaffolded by Phase 4 — always-on defaults
Spec stress-test: Phase 2.7 runs automatically before Phase 3 — catches PRODUCT.md gaps early
External integrations: EarthRanger REST API + SocketIO (per-tenant), SMTP email, Twilio SMS (scaffolded), MSG91 SMS (scaffolded)
EarthRanger API credentials stored encrypted per tenant in database — never in .env files (each tenant has a different ER server). Each tenant requires the **server URL** plus either a token pair (DAS Web Token + ER Track Token, preferred) OR a username/password pair (legacy fallback). See Credentials Specification for the prompt flow.
Future scaling: planning for multiple servers — architecture should support horizontal scaling when needed
AWS path when ready: RDS, S3, ElastiCache, SES — update .env.{env} only, zero code changes.

### PDF Rendering Service
All report exports — Per Area, Patrol Coverage (3-page Template), Consolidated, Detailed, Rangers, Patrol Filtered View — are rendered **server-side** via a separate Docker service: `marine-guardian-pdf-renderer`.
- **Why server-side:** client-side jsPDF/pdfmake breaks on large datasets (annual coverage reports may contain hundreds of patrols); inconsistent font rendering across browsers; map-heavy pages (Coverage Page 2) are easier to reproduce server-side via the same MapLibre GL the app uses.
- **Service:** headless Chromium running Puppeteer. Internal-only (no external port). Communicates with the main Next.js app over the Docker network.
- **Flow:**
  1. User clicks "Export to PDF" anywhere in the app.
  2. Frontend calls `report.queueExport({ report_type, params, paper_size })`. Mutation creates a `ReportExport` row (`status=queued`), enqueues a `pdf-render` BullMQ job, returns the `export_id` immediately.
  3. Worker picks up the job. Status flips to `rendering`.
  4. Puppeteer navigates to internal print-only URL: `https://internal.marine-guardian/_print/{tenant_slug}/{report_type}/{export_id}` with a service-token auth header.
  5. The print page renders the report as HTML+CSS optimized for print, including maps + charts. After all async renderers complete, the page sets `window.__readyForPrint = true`.
  6. Puppeteer waits for that flag, then calls `page.pdf({ format: paper_size, landscape: true, printBackground: true })`.
  7. Buffer written to `/uploads/exports/{tenant_slug}/{year}/{month}/{export_id}.pdf`.
  8. ReportExport row → `status=ready`, `file_path`, `completed_at=now`. In-app notification fires: "Your {report_type} export is ready. [Download]"
- **No synchronous fallback** even for small reports. Every export goes through the queue for consistency. Typical latency: 3–8s for small reports, 20–30s for annual coverage.
- **Retention:** export files deleted after 30 days by maintenance job. ReportExport row retained indefinitely (audit). User can re-trigger the same report at any time.
- **Failure handling:** 3 retries with backoff before `status=failed`. Failed renders also notify the user and write a high-priority AuditLog entry for diagnosis.
- **Future:** when migrating to S3, only `file_path` storage and the maintenance job change — the rest is unchanged.

### Health Endpoint
A liveness probe for uptime monitors and Komodo. `GET /api/health` is a public route (no auth required, but rate-limited to prevent abuse) that returns:

```
{
  "status": "ok" | "degraded" | "down",
  "db": "ok" | "unreachable",
  "valkey": "ok" | "unreachable",
  "version": "x.y.z",
  "uptime_seconds": int,
  "tenants_with_sync_issues": int,
  "time": "2026-05-17T09:47:00Z"
}
```

Status semantics:
- **`ok`** — all checks pass; no tenant has a recent unrecovered sync error.
- **`degraded`** — DB and Valkey reachable, but ≥1 tenant is in `sync_state ∈ {rate_limited, auth_failed}` OR has a `last_error` newer than `2 × deep_sync_interval_seconds`. The app still serves user traffic but ER data is going stale somewhere.
- **`down`** — DB or Valkey is unreachable. App cannot function.

Returns HTTP 200 for `ok` and `degraded`, HTTP 503 for `down`. Uptime monitors should alert on `status !== "ok"` (not just non-200) so degraded states surface. Endpoint never throws — internal errors during check fall back to `status: "down"`.

### Backup & Disaster Recovery
- **Backup:** nightly `pg_dump` of the full database, written to a separate Docker volume (`postgres-backups`), retained 30 days, then deleted by maintenance job. Compose volume mount makes the backup directory available for off-server sync (rsync, S3, etc.) — Phase 3 ships the backup job, off-server sync is operator-configured.
- **Restore:** documented runbook in `docs/RESTORE.md` generated by Phase 3. Procedure: `docker compose down`, restore `pg_dump` file with `pg_restore`, `docker compose up -d`. Worst-case Recovery Time Objective (RTO): ~15 minutes for the database itself. Sync workers then take 10 min to 2 hours to repopulate synced data depending on history depth.
- **Recovery Point Objective (RPO):** worst case = 24 hours (one missed nightly backup window). For tenants with active operations, ER data is "rebuildable" — synced patrols, events, observations can be re-pulled from EarthRanger. **The data that is NOT rebuildable** and depends entirely on backups: AreaBoundary, FuelEntry (with receipt photos), AlertRule, AccompanyingRanger, KnownRanger free-text entries, AuditLog, ReportExport, User accounts, all Command Center-native tables. Treat these as the priority data for backup verification.
- **No DR replication built into v1.** Single-server deployment per environment via Komodo. v2 backlog: hot-standby Postgres replica + automatic failover when horizontal scaling becomes warranted.
- **Receipt photos / PDF exports** (in `/uploads/`) are NOT in the `pg_dump`. The maintenance job also backs up `/uploads/` directories as a separate tarball nightly to the same `postgres-backups` volume. Restoration requires both the SQL dump AND the file tarball.
- **Backup verification:** monthly automated job restores the latest `pg_dump` into a throwaway Postgres container, runs a smoke-test query (`SELECT COUNT(*) FROM tenants`), tears it down. Failure pages the on-call.

### Concurrency Model
Marine Guardian is **explicitly multi-process** (in deliberate contrast to single-process tools like the Blue Alliance reference app). Phase 3 must respect this architecture:

- **Process 1: Next.js app server** — serves user HTTP traffic (tRPC + page rendering). Stateless: no in-process caches that aren't reproducible. Multiple instances may run behind a load balancer in future horizontal scaling.
- **Process 2: BullMQ worker(s)** — picks up jobs from queues (`er-sync-active`, `er-sync-deep`, `track-materialize`, `area-covered-compute`, `pdf-render`, `alerts`, `alert-digest`, `email`, `maintenance`). Separate Docker service. May scale to multiple worker instances per environment.
- **Process 3: PDF Renderer (Puppeteer)** — separate Docker service for PDF render jobs. Single instance per environment in v1; horizontally scalable in v2.
- **Process 4: Postgres** — single primary in v1. The source of truth for all state.
- **Process 5: Valkey** — single instance. BullMQ queues + 60-second cache for area-covered aggregates + in-flight cooldown state for alert rules.

**Shared state lives ONLY in Postgres + Valkey.** Phase 3 must NOT introduce module-level variables, file-system locks, or in-process Maps that would create incorrect behavior under multi-process or multi-worker scaling. Per-tenant `running` mutex flags for sync engine live in Valkey (`tenant:{id}:sync-lock` with a 15-minute TTL), not in process memory.

Concurrent user load target: **≤50 simultaneous users per tenant**, ≤200 across all tenants on a single-server deployment. Phase 5 stress tests verify these ceilings.

### Code Modification Guardrails
These are rules Phase 3 generates code to respect, and that every future maintainer must read before mutations. They capture lessons that would otherwise be discovered painfully.

1. **Never query the DB without a tenant filter.** Every Prisma query that touches a tenant-scoped table must include `where: { tenant_id: ctx.tenant.id, ... }`. Prisma middleware (L4 in the security stack) enforces this, but middleware can be bypassed by raw SQL or `prisma.$queryRaw` — those need explicit tenant scoping. **A missing tenant filter is a tenancy break and a P0 incident.**
2. **Never call EarthRanger's REST API directly from a tRPC procedure.** All ER traffic goes through the per-tenant `EarthRangerClient` class in the worker package — which handles auth, timeout, retry, Retry-After parsing, and circuit-breaker state. Calling `fetch` to ER from a tRPC procedure bypasses all of that.
3. **Never silently swallow ER errors.** Always log to `SyncLog.last_error` AND, for auth-failure or sustained 429s, fire an in-app notification. The dashboard's Sync Health page surfaces errors only via these mechanisms.
4. **Never add a new tRPC procedure without a permission check at the top.** Every mutation procedure must call the permission guard against `ctx.user.role` and the relevant permission key from the matrix in Roles + Permissions. Procedures that need to bypass for system reasons (e.g., webhook receivers) use a separate `systemProcedure` builder that requires a service token.
5. **Never modify Prisma schema without checking RLS implications.** Adding a column is safe; adding a relation that crosses tenants (or removing `tenant_id` from an existing entity) requires explicit Phase 2.7 stress-test re-run.
6. **Never block the event loop with synchronous I/O in handlers.** All DB and external HTTP calls are async. A synchronous `fs.readFileSync` or `JSON.parse` of a 10MB blob in a request handler tanks concurrent throughput. PDF rendering specifically is async via the queue, never inline.
7. **Never deploy a schema migration without running it on a copy of prod data first.** Phase 3 generates a `prisma migrate diff` review step in the deploy pipeline. Migrations that involve data backfills run as separate worker jobs, not inline.
8. **Never introduce in-process shared state.** See Concurrency Model above. Any "cache this in memory for the next request" instinct must go to Valkey instead.

## Credentials Specification
Phase 3 must prompt the user for these credentials and store them in CREDENTIALS.md (gitignored, never committed).

### EarthRanger API Access — per server (Phase 3 prompts for one of two auth paths per site):

Each EarthRanger server requires either **(A)** a token-based authentication pair OR **(B)** a legacy username/password pair. Path A is strongly preferred; path B is the fallback for legacy ER instances that don't support DAS Access Tokens.

**Path A (preferred) — DAS Web Token + ER Track Token:**
- Token is a 40-character alphanumeric string created in EarthRanger Admin → DAS Configuration → DAS Access Tokens, tied to a service account.
- DAS Web Token authenticates REST API calls (events, subjects, patrols, observations).
- ER Track Token authenticates the SocketIO WebSocket for real-time subject position tracking.
- The two tokens may be the same string or different — the distinction is organizational (different service accounts), not protocol-level.

**Path B (fallback) — Username + Password:**
- Service account username and password for ER instances without token support.
- Used as HTTP Basic auth. Not recommended for new ER instances.

**Phase 3 prompt flow (per server):**
1. Always ask: **Server URL** (required).
2. Ask: **"Which auth method does this server support?"** → choice between (A) Token pair or (B) Username/password.
3. If A: prompt for **DAS Web Token** and **ER Track Token** (both required).
4. If B: prompt for **Username** and **Password** (both required).
5. The unused pair's env vars are written as empty strings to CREDENTIALS.md.

**Mindoro Server:**
| Credential | Env Var | Required when... |
|------------|---------|------------------|
| Server URL | ER_MINDORO_URL | always |
| DAS Web Token | ER_MINDORO_DAS_TOKEN | path A |
| ER Track Token | ER_MINDORO_TRACK_TOKEN | path A |
| Username | ER_MINDORO_USERNAME | path B (legacy fallback) |
| Password | ER_MINDORO_PASSWORD | path B (legacy fallback) |

**Banggai Server:**
| Credential | Env Var | Required when... |
|------------|---------|------------------|
| Server URL | ER_BANGGAI_URL | always |
| DAS Web Token | ER_BANGGAI_DAS_TOKEN | path A |
| ER Track Token | ER_BANGGAI_TRACK_TOKEN | path A |
| Username | ER_BANGGAI_USERNAME | path B (legacy fallback) |
| Password | ER_BANGGAI_PASSWORD | path B (legacy fallback) |

**Pecca Server:**
| Credential | Env Var | Required when... |
|------------|---------|------------------|
| Server URL | ER_PECCA_URL | always |
| DAS Web Token | ER_PECCA_DAS_TOKEN | path A |
| ER Track Token | ER_PECCA_TRACK_TOKEN | path A |
| Username | ER_PECCA_USERNAME | path B (legacy fallback) |
| Password | ER_PECCA_PASSWORD | path B (legacy fallback) |

### Email (SMTP) — Phase 3 must ask for these:
| Credential | Env Var | Description |
|------------|---------|-------------|
| SMTP Host | SMTP_HOST | Email server hostname |
| SMTP Port | SMTP_PORT | Email server port (e.g., 587) |
| SMTP User | SMTP_USER | Email account username |
| SMTP Password | SMTP_PASS | Email account password |
| SMTP From Address | SMTP_FROM | Sender email address (e.g., alerts@powerbyte.app) |

### Scaffolded — Phase 3 creates env vars but values left empty (not active in v1):
| Credential | Env Var | Description |
|------------|---------|-------------|
| Twilio Account SID | TWILIO_ACCOUNT_SID | Twilio account identifier |
| Twilio Auth Token | TWILIO_AUTH_TOKEN | Twilio API auth token |
| Twilio Phone Number | TWILIO_FROM_NUMBER | Twilio sender phone number |
| MSG91 Auth Key | MSG91_AUTH_KEY | MSG91 API authentication key |
| MSG91 Sender ID | MSG91_SENDER_ID | MSG91 sender identifier |

### Auto-generated by Phase 3 — user should NOT be asked for these:
| Credential | Description |
|------------|-------------|
| DATABASE_URL | PostgreSQL connection string (generated from Docker Compose config) |
| NEXTAUTH_SECRET | Auth.js session encryption secret (randomly generated) |
| NEXTAUTH_URL | App URL (derived from Domain config) |
| VALKEY_URL | Valkey/Redis connection string (generated from Docker Compose config) |
| PGADMIN_EMAIL | pgAdmin login email (auto-generated) |
| PGADMIN_PASSWORD | pgAdmin login password (auto-generated) |

### Storage note:
EarthRanger credentials (URL + username + password + DAS Web Token + ER Track Token) are stored in TWO places:
1. **CREDENTIALS.md** — for reference during development, gitignored
2. **Database (tenants table)** — encrypted at rest, used at runtime by the sync workers and WebSocket connections. The seed script reads from env vars (sourced from CREDENTIALS.md) and inserts into the tenants table during initial setup.

New tenants added after initial deployment will have their EarthRanger credentials entered via the Tenant Settings UI by Site Admins — these go directly into the database and never touch CREDENTIALS.md or .env files.

## Tech Stack Preferences
Frontend framework:        Next.js
API style:                 tRPC
ORM / DB layer:            Prisma
Auth provider:             Auth.js v5
Auth strategy:             authjs
Primary database:          PostgreSQL
Cache / queue:             Valkey + BullMQ
File storage:              Local disk (Docker volume) — fuel receipt photos only. Future: S3-compatible storage.
UI component library:      shadcn/ui + Tailwind CSS (locked — no alternatives)
Chart library:             shadcn/ui Chart (Recharts)
Map library:               mapcn (MapLibre GL)
Complex UI components:     Kibo UI (Kanban board, Gantt chart, rich text editor, file dropzone)
Icon set:                  lucide-react (shadcn/ui default — no other icon libraries)
i18n library:              next-intl (or equivalent Next.js i18n solution)
Design system:             Meta Dark Mode (DESIGN.md — see docs/DESIGN.md)

## Design Identity
Brand feel:         professional/enterprise
Target aesthetic:   Meta Dark Mode — binary dark surfaces (#18191A/#242526/#3A3B3C), Meta Blue (#0866FF) CTAs, pill-shaped interactive elements, data-dense command center layout optimized for 24/7 ops room monitoring on large displays
Industry category:  Marine Conservation SaaS
Dark mode required: yes — dark mode only (no light mode toggle)
Key constraint:     100-inch TV war room display + standard desk monitors — high contrast, large KPI values, tabular-nums for data alignment
Theming approach:   Custom Meta Dark tokens in docs/DESIGN.md applied via shadcn/ui CSS variables (--primary, --secondary, etc.) in globals.css
                    Reference: https://ui.shadcn.com/docs/theming · Dark mode: https://ui.shadcn.com/docs/dark-mode

## Realtime Features
- EarthRanger SocketIO WebSocket for live subject position updates (per-tenant connection)
- In-app notification push for alert triggers
- Live event feed on War Room and dashboard (new events appear without page refresh)
- Active patrol position updates on live map
- War Room auto-refresh — no manual interaction needed
- Optional audio chime for critical events (browser notification sound, configurable)

## Background Jobs

### Core Algorithms (stack-agnostic — must be ported verbatim from SPEC.md §10)
These pure-function algorithms power the analytics. They're load-bearing: subtle bugs produce silently wrong numbers in funder reports. Implement with unit tests covering edge cases.

- **`haversineKm(a, b)`** — great-circle distance in km between two `[lon, lat]` pairs. Earth radius = `6371.0088`. Returns `0` on null/invalid input.
- **`midpoint(a, b)`** — naive arithmetic midpoint of `[lon, lat]` pair. Acceptable for short segments (sub-km).
- **`segmentDistanceKm(p, a, b)`** — point-to-segment distance using equirectangular projection centered on segment mean latitude (`scale = cos(latRef)`). Clamps projection parameter `t ∈ [0, 1]` so distance to endpoints is correct when point projects outside segment.
- **`pointToLineDistanceKm(p, lineCoords)`** — minimum perpendicular distance from point to any segment of a polyline.
- **`boundaryLines(boundary)`** — extract polyline segments from a boundary regardless of geometry type. Handles: `LineString` → coords directly; `MultiLineString` → each line; `Polygon` → returns outer ring + inner rings; `MultiPolygon` → flattens; raw `coordinates` array → as-is.
- **`nearestBoundary(point, boundaries)`** — scans every boundary's lines, returns the boundary object whose nearest line wins (lowest distance). Used in area-covered aggregation to attribute each track segment to an area boundary.
- **`extractCoordinatesWithTimes(track)`** — walks a `Feature` or `FeatureCollection` track payload, pulls `feature.properties.coordinateProperties.times` per coordinate when lengths match. Returns `{ coordinates: [[lon,lat],...], times: [ms,...], hasTimestamps: boolean }`. When lengths diverge or times missing, sets `hasTimestamps=false` and zero-fills times.
- **`aggregateAreaCovered({ patrolIds, boundaries, patrolHoursById })`** — the area-covered aggregation. For each patrol: read PatrolTrack, walk segments, attribute km + hrs to nearest boundary via midpoint, pro-rate hrs when timestamps missing. Returns aggregates + missing_tracks list. See "Area-Covered Aggregation" below for full algorithm.
- **`shouldKeepSyncing(patrol)`** — returns false if state ∈ {closed, done, completed, cancelled, canceled} (case-insensitive), else true if any segment has `start_time` but no `end_time`. Drives sync candidate selection.
- **`boundaryId(b)` / `boundaryName(b)`** — accessor helpers that tolerate both flat `{id, name, ...}` and GeoJSON Feature `{properties: {id, name}, ...}` boundary shapes. Always use these accessors — never read `b.id` or `b.name` directly. Required for ArcGIS interop and any future GeoJSON import features.
- **`nearestStartArea(startPoint, enabledAreaBoundaries)`** — convenience wrapper around `nearestBoundary()` specifically for "which area boundary does this patrol START in." Used by Coverage Report Page 2 (Area Boundary Summary) to attribute each patrol to a single primary boundary. Returns the boundary object (not the boundary id) for downstream display use, or `null` if no boundary is within `NEAREST_BOUNDARY_THRESHOLD_KM` (default 5 km).
- **`featureMatchesArea(feature, areaBoundary)`** — name-based match used as a fallback to geographic attribution. Returns true if `feature.properties.name` (case-insensitive, trimmed) equals `areaBoundary.name` OR is contained in `areaBoundary.aliases`. Used in Coverage Report Page 2 when ER provides a named area on the patrol but no usable coordinates. Same logic as the derivation pipeline's "name match" step.
- **`deriveAreaBoundary(row, enabledBoundaries)`** — the full attribution algorithm specified in **Area Attribution Rules** above. Runs at sync time for Event/Patrol, at logging time for FuelEntry. Returns the boundary id or null.

All algorithms must have unit tests covering: numeric correctness, both boundary shapes (flat + GeoJSON Feature), Feature vs FeatureCollection track inputs, missing/mismatched times, all boundary geometry types (LineString / MultiLineString / Polygon / MultiPolygon), the newest-first time-order quirk.

### Sync Engine (per tenant, dual-loop)
The sync engine is the heart of the system. Two recurring BullMQ jobs run per tenant. A **Valkey-based mutex** (key `tenant:{id}:sync-lock`, 15-min TTL via SETNX) prevents overlapping runs across workers — if a sync is already in progress for a tenant on any worker, subsequent triggers return the existing status immediately without queuing. Errors are stored in `tenant.last_error` and logged; the sync workers never throw to the event loop. This is multi-worker safe (matches the Concurrency Model rule that no shared state lives in process memory).

- **Active Check** — runs every `active_check_interval_seconds` (default 120). Purpose: fast pickup of newest data and refresh of "in-flight" patrols.
  1. Paginate `getPatrols({ page, page_size: 100, sort_by: '-serial_number' })` up to 5 pages.
  2. After each page: upsert results into local cache with `source='sync'`, then trigger track sync for those patrols.
  3. Read up to 50 sync candidates from the cache (patrols where `sync_needed=true`, sorted by oldest `last_synced_at || first_seen_at`), refresh each via `getPatrol(id)`, upsert, trigger track sync.

- **Deep Sync** — runs every `deep_sync_interval_seconds` (default 600). Purpose: full reconciliation with EarthRanger. Also fires once immediately on tenant startup/reconnection.
  1. Paginate entire patrol list with `page_size=200` up to 100 pages.
  2. Per page: upsert with `source='sync'`, then trigger track sync.
  3. Also reconciles deletions: any cached patrol not seen in the deep sync's full ID list is soft-deleted (`is_deleted=true, deleted_at=now`).

- **Sync candidate definition:** `shouldKeepSyncing(patrol)` returns `false` if state ∈ {closed, done, completed, cancelled, canceled} (case-insensitive), otherwise `true` if any segment has `start_time` but no `end_time` (still active).

- **Field ownership for push-back to EarthRanger:** Command Center is authoritative for `state`, accompanying rangers, and internal notes; EarthRanger is authoritative for location, reporter, original notes, and photos. State changes push back to ER via PATCH; CC-owned fields like accompanying rangers and action_taken are written to ER's `event_details` JSON blob under a `marine_guardian.*` namespace so they're not lost if ER becomes the source of truth later. Pull operations never overwrite CC-edited fields.

#### EarthRanger API Throttles (authoritative table)
All per-request and per-cycle limits in one place. Phase 3 reads these as constants; per-tenant overrides via tenant settings where indicated.

| Concern | Default | Configurable via | Notes |
|---|---|---|---|
| Per-request timeout | 30,000 ms | `tenant.er_timeout_ms` (default 30000) | `AbortController`; throws `AbortError` on expiry |
| Track-fetch concurrency | 4 in-flight per tenant | const `TRACK_FETCH_CONCURRENCY` | Enforced by async-pool helper; errors swallowed per-item so one bad patrol doesn't break the batch |
| Active-check page size | 100 | const `PATROL_SYNC_LATEST_PAGE_SIZE` | Patrol list pagination during Active Check |
| Active-check max pages | 5 | const `PATROL_SYNC_LATEST_PAGES` | Hard cap: 500 patrols per active tick |
| Active-check candidate refresh | 50 patrols | const `ACTIVE_CHECK_CANDIDATES_PER_TICK` | Serial single-patrol GETs after pagination |
| Active-check interval | 120,000 ms (2 min) | `tenant.active_check_interval_seconds` | BullMQ recurring job |
| Deep-sync page size | 200 | const `DEEP_SYNC_PAGE_SIZE` | If ER caps lower, deep-sync silently truncates — see Verification Checklist below |
| Deep-sync max pages | 100 | const `DEEP_SYNC_MAX_PAGES` | Hard ceiling: 20,000 patrols per deep-sync |
| Deep-sync interval | 600,000 ms (10 min) | `tenant.deep_sync_interval_seconds` | Also fires once on tenant startup/reconnection |
| Track time window | `[segment.start_time, end_time ?? now]` | n/a | Not sliced; one fetch per patrol; long patrols (>30 days) may need slicing — verify against your ER |
| Sync mutex | Valkey SETNX key per tenant | n/a | `tenant:{id}:sync-lock` with 15-min TTL; concurrent `runDeepSync` calls return existing status; never queue |
| Per-(tenant, queue) rate limit | 60 jobs/minute | BullMQ rate-limit per group key `tenant:{id}:{queue_name}` | Each tenant gets its own 60/min budget per queue — Mindoro's er-sync-active and Banggai's er-sync-active each have separate quotas. Prevents one tenant's backlog from monopolizing ER bandwidth across the platform |
| Active Check floor / ceiling | 60s / 3600s | enforced in Tenant Settings form | Prevents hammering ER and silent dark periods |
| Deep Sync floor / ceiling | 300s / 86400s | enforced in Tenant Settings form | Allows once-per-day deep syncs for low-activity tenants, prevents misconfigured tight loops |

#### ER Resilience (retry, Retry-After, circuit breaker)
The sync engine fails open: ER unreachability never crashes the system, only stamps `last_error` and continues on the next tick. Concrete behaviors:

- **5xx + network error retry:** every ER request retries up to 3 attempts on `5xx` and `fetch`-level network errors. Backoff schedule: `500ms / 2s / 5s` with ±20% jitter. On final failure, the cycle records the error in `SyncLog.last_error` and continues with the next ER request (cycle does not abort).
- **Retry-After honoring:** on `429 Too Many Requests` or `503 Service Unavailable` responses that include a `Retry-After` header, the per-tenant `er-sync-*` queues pause for the suggested duration. If `Retry-After` is absent on `429`/`503`, default pause is 60 seconds. The tenant's `paused_until` timestamp updates so Sync Health UI can show the pause.
- **Auth-failure circuit breaker:** after **2 consecutive 401 Unauthorized** responses on any ER endpoint for a tenant, the sync engine enters `sync_state = "auth_failed"` for that tenant. Both Active Check and Deep Sync timers stop. A high-priority in-app + email notification fires to all Site Admins ("EarthRanger authentication failed — credentials may have rotated or been revoked"). Sync Health UI displays a red banner. Resumes only when (a) Site Admin updates credentials via Tenant Settings AND clicks "Test Connection" with a successful result, OR (b) a Site Admin clicks "Force Resync" explicitly (which retries with current credentials and either succeeds or re-trips the breaker). This prevents log-spam from an expired token producing identical 401 SyncLog rows indefinitely.
- **Auth-failure counter reset:** `tenant.auth_failure_count` increments on each consecutive 401, resets to 0 on the first non-401 response. So a single transient 401 does not trip the breaker.
- **Tenant sync_state machine:** `running` → `rate_limited` (during `Retry-After` pause) → `running` | `auth_failed` (frozen until manual intervention) | `manual_pause` (Site Admin explicitly stopped sync) | `paused` (during deactivated tenant or platform maintenance).
- **What Marine Guardian deliberately does NOT do:** no request coalescing across users (tRPC + React Query handles in-flight dedup at the page level), no per-cycle request budget cap (per-queue BullMQ rate limit serves this role), no client-side rate limiting of inbound HTTP (Phase 2.7 spec'd app-level rate limits per route — see Security Requirements).

#### ER Instance Verification Checklist (Site Admin onboarding action)
Every ER instance behaves slightly differently. Before relying on the defaults above, the Site Admin connecting a new tenant MUST verify against the target ER. Each verification result is persisted on the tenant row.

| Verification | How to check | Tenant field stored |
|---|---|---|
| Max `page_size` honored by `/activity/patrols/` | UI clicks "Verify ER limits" → server fetches `/activity/patrols/?page_size=500` and inspects `results.length` | `er_verified_max_page_size` (int) |
| Track-window upper bound | UI shows "If patrols routinely exceed 30 days, slicing may be needed" — checked manually | `er_verified_track_window_days` (int, nullable) |
| Concurrent connection cap per token | If ER is shared with other tools, Site Admin can lower the concurrency manually | `er_verified_concurrent_cap` (int, default 4) |
| Rate-limit headers present | First successful ER response is inspected for `X-RateLimit-*` and `Retry-After` headers; presence noted | `er_verified_has_ratelimit_headers` (bool) |
| Auth lifetime / rotation cadence | Manual input: how often does this ER instance rotate tokens? | `er_verified_token_rotation_days` (int, nullable) |

If `er_verified_max_page_size < DEEP_SYNC_PAGE_SIZE` (200), the deep-sync silently truncates history beyond `verified_max × 100 pages`. The Sync Health UI surfaces a yellow warning when this mismatch is detected.

### Patrol Track Materialization (per tenant)
For every patrol upserted by the sync engine, queue a track-sync job. The job:
1. Reads `segment[0].leader.id` (the GPS-tracked subject) and `segment[0].time_range`. Skip if either missing.
2. Computes `needs_refetch(patrol)`: true if no `PatrolTrack` row exists, OR `patrol_ended=false` in PatrolTrack but the live patrol's segment now has `end_time` (i.e., patrol just ended), OR `patrol_ended=false` (still active — keep refreshing).
3. Skip if `hasTrack(patrol_id) && !needs_refetch(patrol)`.
4. Fetch `/subject/<leader_id>/tracks/?since=<segment.start>&until=<segment.end || now>`.
5. Atomic upsert into `PatrolTrack` (insert-or-update on `patrol_id`). Update index fields: `fetched_at`, `has_timestamps`, `point_count`, `last_track_time`, `patrol_ended`.
6. After successful track upsert, recompute `patrol.computed_distance_km` (sum of haversine distances between consecutive points) and `patrol.computed_duration_hours` (sum of `Math.abs(t1 - t0)` between consecutive points, or pro-rated when timestamps missing).
7. Concurrency cap: 4 in-flight track fetches per tenant (via async-pool helper). Individual failures are swallowed so one bad patrol does not break the batch.
- **CRITICAL TIME-ORDER REMINDER:** ER returns track points newest-first. All `dt` math uses `Math.abs(times[i] - times[i-1])`. Document inline at every call site.

### Test Patrol Detection (per tenant)
Runs on every patrol upsert. Regex-matches `patrol.title` against `/test|qa|demo/i` (case-insensitive). Sets `is_test_patrol=true` when matched. Reports default-exclude these. Operators can override the flag manually in the patrol detail view if a real patrol was misclassified.

### Area-Covered Aggregation (per tenant, on-demand)
Triggered when a user opens the Patrol Coverage Template Report or any screen that needs area-covered data. Pulls all `PatrolTrack` rows for patrols whose `start_time` falls within the requested period (excluding `is_test_patrol=true` unless explicitly included). For each track:
- Extract coordinates and times via `extractCoordinatesWithTimes(track_geojson)`. Sets `has_timestamps=false` when per-point times are missing or length-mismatched.
- Walk i=1..N-1. For each segment: compute `haversineKm(coords[i-1], coords[i])`. Skip when `segKm <= 0`. Find `nearestBoundary(midpoint(a, b), enabledBoundaries)` — uses midpoint to avoid edge-effect bias.
- Accumulate per-boundary km. Accumulate per-boundary hrs using `Math.abs(times[i] - times[i-1])` if `has_timestamps`, else pro-rate at the end: `perBoundaryHrs[bid] = patrolTotalHrs * km / patrolTotalKm`.
- Increment `hrs_actual_count` when timestamps were used, `hrs_estimated_count` when prorated.
- Return `{ aggregates: { [boundary_id]: {boundary_name, coverage_patrols, coverage_km, coverage_hrs, hrs_estimated_count, hrs_actual_count} }, missing_tracks: [patrol_ids_with_no_track], generated_at: ISO }`.
- **Boundary input must tolerate both flat (`{id, name, geometry}`) and GeoJSON Feature (`{properties: {id, name}, geometry}`) shapes** via helpers `boundaryId(b)` and `boundaryName(b)`.
- Results cached for 60 seconds per (tenant, period) key in Valkey to avoid recomputation on rapid page refresh.

### Alert Evaluation
After each Active Check or Deep Sync completes successfully for a tenant, the Alert Evaluation job runs for that tenant. Algorithm:

1. **Load enabled AlertRules** for the tenant where `is_active = true`.
2. **For each rule with `kind = "event_match"`:**
   - Query `Event WHERE tenant_id = T AND synced_at > rule.last_evaluated_at` (or `> sync started_at` for first run).
   - For each candidate event, evaluate `condition_json` AND-wise: every specified filter (event_types, priority_min, categories, areas, states) must match. NULL filter values mean "any."
   - For matches, dispatch via `dispatchNotification(rule, event)` (see below).
   - Update `rule.last_evaluated_at = now()`.
3. **For each rule with `kind = "subject_stale"`:** handled by the Stale Data Detection job (below) — Alert Evaluation skips these.
4. **For each rule with `kind = "patrol_overdue"`:** handled by the Stale Data Detection job.
5. **For each rule with `kind = "sync_failure"`:** handled by the Sync Failure Detection job.

**`dispatchNotification(rule, match)` (shared subroutine):**
1. Resolve `rule.recipients_json` to a deduplicated list of active `User` rows for the tenant.
2. Create one `Notification` row referencing the rule and the match entity.
3. For each recipient, create a `NotificationRecipient` row (`is_read=false`).
4. For each recipient with `email` channel enabled on this rule:
   - Check Valkey key `cooldown:{rule_id}:{user_id}` — if present (i.e., we're within cooldown), append the match to the pending digest list at `digest:{rule_id}:{user_id}` and mark `NotificationRecipient.email_status = "suppressed_by_cooldown"`. Schedule a delayed `alert-digest` BullMQ job for the cooldown expiry if one is not already scheduled.
   - If absent: queue an immediate email send (`NotificationRecipient.email_status = "pending"` → `"sent"` on success / `"failed"` on retry exhaustion). Set the cooldown key with TTL = `rule.cooldown_minutes * 60` seconds.
5. **In-app notifications always fire**, regardless of cooldown. Email is the only channel subject to suppression.

### Stale Data Detection
Periodic background job (runs every 60 seconds tenant-wide; not coupled to a specific sync cycle). Two responsibilities:

**A. Subject staleness check (for `subject_stale` rules):**
1. For each tenant, load all enabled `subject_stale` AlertRules.
2. For each rule, query `Subject WHERE tenant_id = T AND (rule.condition_json.subject_types is null OR subject_type IN rule_types)`.
3. For each candidate subject, check `last_position_at`:
   - If `null` or older than `now() - rule.condition_json.threshold_minutes`, AND
   - If `rule.condition_json.during_active_patrol_only` is true: only fire if the subject is currently associated with an active patrol (Patrol.state ∈ {open, active} AND segment end_time is null AND subject_id matches segment.leader.id).
   - Otherwise: fire always.
4. **Deduplicate per stale episode**: maintain Valkey key `stale:{rule_id}:{subject_id}` set when fired; cleared automatically when the subject reports a new position (re-arms the alert). Prevents alert spam on the same stuck subject.
5. For matches, call `dispatchNotification(rule, subject)` referencing the subject as the related entity.

**B. Patrol overdue check (for `patrol_overdue` rules):**
1. For each tenant, load enabled `patrol_overdue` AlertRules.
2. For each rule: query `PatrolSchedule WHERE tenant_id = T AND scheduled_start < (now() - rule.condition_json.grace_minutes)` AND no matching `Patrol` row exists for that `ranger_user_id` (or `ranger_name`) with `start_time >= scheduled_start - 1h` (1h slop window for reasonable variation).
3. Filter further by `rule.condition_json.patrol_types` if specified.
4. Deduplicate per overdue episode via Valkey key `overdue:{rule_id}:{schedule_id}`.
5. For matches, call `dispatchNotification(rule, schedule)` referencing the PatrolSchedule.

**Also fires the staleness indicator visual on War Room/Dashboard:** independent of alert rules, any subject with `last_position_at` older than 30 min during an active patrol (or 6h otherwise — both configurable per tenant) gets a stale badge in the live map and patrol monitor UI.

### Sync Failure Detection
Periodic background job (runs every 60 seconds tenant-wide). For each tenant, check whether the sync engine is failing:
1. Compute `consecutive_failures` = count of SyncLog rows with `status IN ("failed", "partial")` since the last `status = "success"` row for this tenant.
2. Compute `staleness_ms` = `now() - last_success_at`.
3. Banner trigger: fires when `consecutive_failures >= 3` OR `staleness_ms > active_check_interval_seconds × 5 × 1000`, whichever first.
4. For each `sync_failure` AlertRule in the tenant:
   - If condition's `threshold_minutes` matches OR exceeds the current staleness, fire `dispatchNotification(rule, syncStatus)` referencing the tenant's current sync state.
   - Deduplicate per failure episode via Valkey key `sync-fail:{tenant_id}:{rule_id}` — cleared on first success.
5. Banner clears on first successful sync (clears all `sync-fail:{tenant_id}:*` keys).

### Report Pre-computation (v2, scaffolded only)
v1 computes reports live. v2 will pre-aggregate area-covered and patrol summaries nightly into materialized tables. Schema scaffolded in v1 (`ReportSnapshot` table commented out in Prisma), enabled in v2.

### PDF Export Rendering
Triggered when a user clicks Export to PDF anywhere in the app. tRPC mutation creates a `ReportExport` row + enqueues a `pdf-render` BullMQ job. Worker (in the `marine-guardian-pdf-renderer` Docker service) drives Puppeteer through internal print routes. See **Infrastructure Notes → PDF Rendering Service** for the full flow. Concurrency cap: 2 simultaneous renders per renderer instance (memory-bound). 3 retries with exponential backoff on failure.

### Export Cleanup (maintenance)
Daily job scans `ReportExport` rows where `status=ready AND completed_at < now - 30 days` and `file_path IS NOT NULL`. Deletes the file from disk. Sets `file_path=NULL` on the row (keeps the audit trail). Logs the cleanup count.

### Queue Configuration
Queues: `er-sync-active`, `er-sync-deep`, `track-materialize`, `area-covered-compute`, `pdf-render`, `alerts`, `alert-digest` (delayed jobs for cooldown digest sends), `email`, `maintenance`. Separate queues so a backlog in one (e.g., track materialization after a big backfill, or a long-running PDF export) doesn't block alerts or other realtime jobs.
- DLQ: failed jobs moved to dead-letter queue after 3 retries. Site Admin notified via in-app alert.
- Per-tenant rate limit: when ER returns sustained 429s, the tenant's `er-sync-*` queues apply exponential backoff (max 10 min between retries) and pause; Site Admin receives in-app notification.

## Failure Modes & Recovery

The system is designed to **fail open**: most ER failures degrade the data freshness but leave the dashboard usable. Site Admin diagnoses via Sync Health UI and AuditLog; this table captures the common scenarios and their recovery paths so operators can self-serve.

| Failure | Symptom | Auto-Recovery | Manual Recovery |
|---|---|---|---|
| EarthRanger unreachable (DNS / network down) | `/api/health` → `degraded`; `sync_state` stays `running`, `last_error` updates each tick | Next sync tick retries on schedule | Fix network; sync resumes silently |
| TLS handshake failure to ER | `last_error` mentions `CERT_*` or `EPROTO` | None | Verify CA / cert at upstream proxy or ER server |
| `401 Unauthorized` (token expired or revoked) | After 2 consecutive 401s: `sync_state = "auth_failed"`, sync timers stop, red banner in Sync Health, in-app + email notification to Site Admins | None — circuit breaker prevents log spam | Site Admin updates credentials in Tenant Settings → clicks "Test Connection" → on success, sync resumes automatically |
| `403 Forbidden` (token lacks scope) | Some sync types succeed, others fail. `last_error` per data type in SyncLog | None | Request elevated token from ER admin; update in Tenant Settings |
| `404 Not Found` on patrol GET | Single patrol fails refresh; cycle continues with others | Next cycle retries; soft-deleted via deep-sync reconciliation if persistent | None usually needed |
| `429 Too Many Requests` | `sync_state = "rate_limited"`, `paused_until` set per `Retry-After` (or 60s default), Sync Health shows yellow banner | Resumes automatically when `paused_until` elapses | If persistent, Site Admin increases `active_check_interval_seconds` / `deep_sync_interval_seconds`, or lowers `er_verified_concurrent_cap` |
| `500/502/503/504` from ER | Per-request retry 3× with `500ms / 2s / 5s` backoff. On final failure, cycle records `last_error` and continues | Next sync tick retries the cycle | Wait or escalate to ER ops if sustained |
| Request timeout (`AbortError` at `er_timeout_ms`) | Cycle fails for affected request; logged to `last_error` | Next tick retries | Raise `er_timeout_ms` if ER is consistently slow |
| Postgres unreachable | `/api/health` → `down` (HTTP 503); app does not serve traffic | Docker compose restart policy attempts container restart | Inspect Postgres container logs; verify volume mount; restore from backup if data corruption |
| Valkey unreachable | `/api/health` → `down`; BullMQ workers cannot dequeue; sync engine effectively paused | Docker compose restart | Inspect Valkey logs; restart container |
| Empty cache on first tenant boot | Dashboard shows 0 patrols momentarily; partial data flows in over minutes | Deep Sync runs on tenant startup; full fill in 10 min to several hours depending on history depth | Site Admin clicks "Force Resync" if patience runs out — no faster mechanism in v1 |
| Disk full (`ENOSPC`) on Postgres volume | All writes fail; cycles error out repeatedly | None — system wedged until disk freed | Free space on host volume; vacuum old AuditLog if appropriate; sync resumes |
| Disk full on uploads volume (fuel receipts / PDF exports) | Receipt uploads fail with 500; PDF renders fail | None | Free space; old PDF exports auto-delete after 30 days but `/uploads/fuel-receipts/` is kept forever — run manual archive |
| Partial PatrolTrack row (rare race during materialization) | `track_geojson` JSON parse fails when read | Treated as missing; refetched on next sync cycle | None |
| Subject has no GPS data | `PatrolTrack` is empty (`point_count=0`); patrol viewer shows "No GPS data" empty state | n/a — by design | None |
| EarthRanger schema drift — new field added | Stored verbatim in `additional_json`/`event_details_json`; ignored unless schema column added | Forward-compatible | Phase 3 generates Prisma migration to promote new field to column if frequently queried |
| EarthRanger schema break — field removed | Frontend renders blanks for that column | None | Patch the accessor with optional chaining; Phase 3 generates a hotfix migration |
| Container OOM / restart | In-process state lost (Valkey persists); brief blip in dashboard | Auto-restart via Docker compose `restart: unless-stopped` policy | None usually |
| PDF render queue stuck | ReportExport rows stay in `rendering` state; users don't get notification | Worker eventually times out → status flips to `failed` after 3 retries | Site Admin restarts pdf-renderer Docker service; failed exports can be retried |
| BullMQ DLQ filling up | Maintenance dashboard surface "N jobs in DLQ"; Site Admin in-app notification | None | Inspect failed jobs via Sync Health; manually requeue or discard |
| Super Admin impersonation session abandoned | Impersonation mode stays active for up to 30 min of inactivity | Auto-expiry to read-only after 30 min of no mutations | Super Admin can manually click "Disable" |

**Diagnostic procedure for any failure:**
1. Site Admin opens `/[tenant]/settings` → Sync Health subsection. Check `sync_state`, last error, last successful sync timestamp.
2. If issue spans multiple tenants, Super Admin opens `/admin/tenants` and checks the "Tenants with sync issues" count from the health endpoint.
3. AuditLog (Site Admin+ access via `/[tenant]/audit`) shows the sequence of events leading to the failure.
4. For severe issues, Super Admin connects via pgAdmin (auto-generated credentials in CREDENTIALS.md) for direct DB inspection.

## Out of Scope
- No public-facing website — internal operations tool only, no marketing landing page or public registration
- No payment/billing system — MPA sites onboarded manually by Super Admin
- No mobile native app — web-only with responsive design
- No SMS sending in v1 — Twilio/MSG91 integration scaffolded but not active, email notifications only
- No offline mode — requires active internet connection
- No direct EarthRanger admin configuration editing — can update event states and create events via API, but cannot modify ER's event types, subject types, or source provider setup
- No AI/ML analytics — no predictive patrol optimization or automated pattern detection in v1
- No Cloudflare Turnstile — bot protection opted out for v1 (internal tool, login-only public route, no public registration)
- **No public REST API for external consumers in v1** — all endpoints scoped to authenticated dashboard users via tRPC. External integrations (webhooks out, REST clients in) are v2 backlog.
- **No Prometheus / metrics endpoint / structured-log shipping in v1** — observability is via Sync Health UI + AuditLog + Postgres queries. Production-grade observability (Prometheus exporter, log aggregation to Loki/ELK, distributed tracing) is v2. The `/api/health` endpoint serves uptime monitors but is not a metrics surface.
- **No hot-standby Postgres replica or automatic failover in v1** — single-server deployment via Komodo. v2 backlog when horizontal scaling becomes necessary.

### Open Questions Deferred to Phase 3

The spec deliberately leaves these implementation details to Phase 3, where they're best resolved by the code generator with access to the actual library versions, runtime APIs, and Prisma client behavior. Listed here so the reviewer/implementer can find them without grepping the spec.

| Question | Where it surfaces | Phase 3 needs to decide |
|---|---|---|
| **Geometry storage format** | AreaBoundary, PatrolArea, PatrolTrack entities | Json column (v1, recommended for simplicity) vs PostGIS Geography column (v2 — preview feature already enabled in schema). Decide based on whether Phase 3 needs spatial queries in v1 (probably not). |
| **Multi-column CHECK constraint on Tenant credentials** | Tenant entity | Prisma doesn't fully support multi-column CHECK. Phase 3 generates a raw SQL migration step (already noted in entity comment). Decide migration ordering. |
| **App-layer encryption helper API** | encrypted columns on Tenant | Where does `encrypt(value)` / `decrypt(value)` live — Prisma middleware (transparent), or explicit calls at every read/write site? Recommendation: middleware. |
| **Partial unique indexes on AccompanyingRanger** | AccompanyingRanger entity | Prisma `@@unique` with nullable columns may not give the intended uniqueness semantics. Likely needs two partial unique indexes via raw SQL. |
| **Track simplification threshold** | PatrolTrack rendering | When does Douglas-Peucker simplification kick in for the patrol viewer? Spec says "≥5000 points" but Phase 3 should measure actual render performance before committing. |
| **SSO provider implementation** | Auth.js v5 config | Google and SAML providers are scaffolded with `enabled: false`. Phase 3 generates the provider stubs; activation is a v2 config change. |
| **PDF renderer service-token format** | pdf-renderer ↔ web service-token | Bearer token in `Authorization` header is the obvious choice. Phase 3 confirms format matches Puppeteer's `setExtraHTTPHeaders` API. |
| **next-intl namespace structure** | Internationalization | en.json / id.json / ms.json shape — flat keys vs nested namespaces? Recommendation: nested by module to match RBAC structure. |
| **Worker process count** | Concurrency Model | Single worker container in v1; Phase 3 sets `WORKER_CONCURRENCY` env default. Decide based on tenant count + queue depth observed in dev. |
| **Backup off-server sync mechanism** | Backup & DR | rsync? S3 sync? Manual? Phase 3 leaves the pg_dump volume mount in place; operator configures the destination. |

These are the *intentional* unknowns. Anything else that surfaces during Phase 3 is either a spec bug (fix in PRODUCT.md per Document Maintenance rules) or a real implementation decision (document in code).

## Document Maintenance

PRODUCT.md is the single source of truth for what Marine Guardian does. It must remain accurate as the code evolves. Rules:

1. **When the code changes a load-bearing fact** — a permission key, an entity field, a sync interval, a queue name, a Tenant entity field, the RBAC matrix, or anything in the EarthRanger API Throttles table — update PRODUCT.md in the **same commit** as the code change. PR title prefixes `feat:` and `refactor:` imply "spec may need an update"; reviewer checks before approval.

2. **When the spec is wrong but the code is right** — update the spec, not the code. The code is runtime truth; the spec describes intent. Disagreements between SPEC and code resolve toward code, then PRODUCT.md gets a correcting commit.

3. **Section ordering is stable.** New top-level sections are appended at logical positions, not interleaved into existing numbering. Cross-references like "see Background Jobs → Sync Engine" must keep working as the doc grows.

4. **Subsections may be added freely** — e.g., new entries to the Throttles table, new failure modes to the Failure Modes matrix, new permission keys to the RBAC table.

5. **Tech stack changes require explicit user sign-off** — adding/removing a top-level dependency (Postgres → another DB, Auth.js → another auth provider, Next.js → another framework, BullMQ → another queue) is a project-identity-level change. These cannot be silently rewritten by a code change; PR description must reference user approval.

6. **Phase 2.7 stress-tests run on every PRODUCT.md change** — Phase 3 generates the stress-test workflow. Adding entities, screens, or features without re-running the stress-test risks reintroducing blocking gaps that the Round-1/Round-2/Round-3 patches resolved.

7. **The Round summaries (Round 1 = SPEC.md adoption, Round 2 = Phase 2.7 blocking gaps, Round 3 = SPECv2 operational hardening) are historical context.** Future rounds append patches with the same discipline — analyze, resolve open questions, apply patches, ship. Each round documents *why* the doc grew, so a future maintainer can reconstruct intent.

8. **Code Modification Guardrails (Infrastructure Notes → Code Modification Guardrails) are non-negotiable.** Adding new guardrails is fine; weakening or removing one requires user sign-off plus a retrospective on what changed in the project to make the guardrail unnecessary.

### Spec Evolution — how this document reached its current state

For anyone reviewing this spec (including a future-you, a code-gen LLM, or a new team member), here's the history of how PRODUCT.md grew from its v0 form (522 lines) to current state.

| Round | What happened | Outcome |
|---|---|---|
| **v0** | Initial Planning Assistant V31 generation of PRODUCT.md based on user-supplied app concept (real-time MPA operations layer on EarthRanger). 18 entities, 20 modules, 7 user flows. | 522 lines |
| **Round 1 — SPEC.md adoption** | User uploaded the Blue Alliance EarthRanger patrol-manager SPEC.md (open-source reference implementation). Triaged 19 features to adopt, 6 algorithms to port (haversine, nearestBoundary, etc.), 7 architectural patterns to skip (vanilla JS, no auth, filesystem-DB). | +167 lines |
| **Round 2 — Phase 2.7 blocking gaps** | Stress-tested the spec against the architecture; found 47 gaps. Resolved 12 blocking ones: Alert Rule DSL (4 typed kinds), recipient routing, storm prevention, Super Admin impersonation, reserved slugs, fuel attribution, PDF rendering approach. | +132 lines |
| **Round 3 — SPECv2 operational hardening** | User uploaded SPECv2.md adding operational sections. Added Failure Modes matrix (19 rows), Time/TZ conventions, Capacity Planning, Backup & DR, Code Modification Guardrails (8 rules), Concurrency Model, EarthRanger Bootstrap procedure, ER API Throttles table, ER Resilience (retry/Retry-After/circuit breaker), Health Endpoint, Document Maintenance. | +208 lines |
| **Round 4 — End-to-end spot-check cleanup** | Read the now-1029-line spec end-to-end; flagged 35 contradictions and drifts. Resolved 4 blockers (area attribution ambiguity, dead sync_frequency_seconds field, entity gaps, PatrolSegment missing tenant_id) and 11 important issues (in-process state contradictions, /audit route, alert algorithm stubs, etc.). | +143 lines |
| **Phase 8 cleanup — Terminology rename** | User clarified that "Municipality" was the wrong noun — the entity represents arbitrary tenant-drawn operational areas, not government jurisdictions. Renamed `MunicipalityBoundary` → `AreaBoundary` everywhere; added this Glossary section to disambiguate Area / AreaBoundary / PatrolArea / area_name. | net-neutral lines |

**Three concepts that took multiple rounds to land correctly** (worth knowing if you're extending the spec):

1. **Area attribution** went through three forms before settling on the current "free-text + derived FK" hybrid (Round 4). The first attempt had a single area_name string (couldn't query); the second tried strict FK only (didn't tolerate ER schema drift); the current Option C (verbatim string + nullable derived FK) is the durable answer.

2. **Sync engine** went from a single sync_frequency_seconds field to the dual-loop (Active Check + Deep Sync) model in Round 1, then gained the circuit breaker + Retry-After handling in Round 3, then dropped sync_frequency_seconds entirely in Round 4 once the dual-loop was load-bearing.

3. **Credentials** evolved from "5 required fields" (all 5 must be present) to "Path A or Path B" (token pair OR user/password) in Round 4 after a contradiction was caught between the bootstrap procedure and the credentials specification.

These three are the spec's biggest scars. Phase 3 implementation should be alert when touching them — the right answers are not the obvious first guesses.
