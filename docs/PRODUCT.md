# Marine Guardian — Command Center

## App Identity
Name:           Marine Guardian — Command Center
Tagline:        Real-time operations intelligence for marine protected areas
Industry:       Marine Conservation / Marine Protected Area Management
Primary users:  Command center operators, field coordinators, and site administrators managing marine protected areas

## Problem Statement
EarthRanger is an excellent field data collection platform but provides no reporting, no charts for events or patrols, no cross-area analytics within a site, and no configurable alerting. MPA managers currently produce monthly reports manually as static PDFs (per-area event breakdowns, patrol statistics, ranger performance matrices) by hand — a tedious, error-prone process that delivers stale insights weeks after the data was collected. There is no unified command center view for real-time monitoring, incident escalation, or patrol planning.

## Core User Flows
1. **Operator monitors live activity and escalates incidents:** Operator opens Command Center War Room → sees live map with tracked subjects (patrol boats, rangers, marine animals), real-time event feed, and alert panel → new critical event appears (e.g., blast fishing report from patroller in EarthRanger) → alert panel pulses red with ACK button → Operator acknowledges alert → reviews event details → updates state from "new" to "active" → if critical, escalates (triggers in-app + email alert to Field Coordinator / Site Admin). Error: EarthRanger API unreachable → event state update queued for retry → War Room shows red "SYNC FAILED" banner with last successful sync timestamp.

2. **Field Coordinator monitors patrols and reviews completed operations:** Patrollers create patrols and report events from EarthRanger mobile app in the field → Command Center pulls patrol data via scheduled API sync → Coordinator monitors active patrols on War Room map and Patrol Monitor screen (elapsed time, distance, current position) → after patrol ends, Coordinator reviews patrol track, coverage vs planned patrol area polygons, and linked events → Coordinator fills in missing event details or corrects data via Kanban board. Error: GPS data gap detected → last known position shown with staleness indicator badge and timestamp.

3. **Coordinator or Admin generates analytics reports:** User selects date range and area filters → views per-area event breakdowns (law enforcement + monitoring categories as bar charts), patrol summary KPIs (foot vs seaborne: count, km, hours), event heatmaps overlaid on map, and ranger performance matrix → drills down into detailed event tables with all fields (report ID, reporter, date, notes, municipality, type, vessel, offender, action taken, photo reference) → exports report as PDF or CSV. Error: insufficient data for selected range → empty state with message "No records found for this period" and suggestion to expand date range.

4. **Patrol Manager plans patrol areas and schedules:** Manager opens patrol area map editor → draws polygon zones on the map defining estimated patrol coverage areas (not strict boundaries — as long as rangers are inside the shaded area) → names each zone and assigns it to a patrol type (foot or seaborne) → opens Gantt chart view → schedules ranger assignments to patrol areas across days/weeks → drag-and-resize schedule blocks on the Gantt timeline → rangers see their assignments. Error: overlapping polygon drawn → system warns but allows (polygons are estimated areas, not strict boundaries).

5. **Operator manages incidents via Kanban board:** Operator opens Kanban view → sees events in columns by state (New → Active → Resolved) → drags event card to update state → clicks into event card to fill in missing details (offender name, vessel info, action taken) that field patrollers left incomplete → resolved events accumulate as monthly accomplishment data. Error: concurrent edit by two operators → last-write-wins with conflict notification.

6. **Site Admin connects EarthRanger and configures tenant:** Admin opens tenant settings → enters EarthRanger server URL and API Bearer token → system validates connection by fetching subjects list → enables scheduled data sync → configures alert rules (e.g., critical event types that trigger immediate notifications) → manages user accounts for the site → monitors sync health status. Error: invalid token → clear error message, sync not started, admin prompted to verify credentials.

7. **Super Admin onboards a new MPA site:** Super Admin opens platform tenant management → creates new tenant (name, slug for subdirectory routing) → assigns initial Site Admin user → Site Admin then configures the EarthRanger connection (flow 6). Error: duplicate slug → rejected with suggestion to use a different slug.

## Modules + Features

### Command Center War Room
- Designed for 100-inch TV wall display, 24/7 monitoring, no interaction required
- Top strip: KPI cards (active events, unacknowledged alerts, active patrols, rangers on duty, events this month) + live clock + sync health indicator + last successful sync timestamp
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
- KPI cards: total active events, active patrols, rangers on duty, events this month
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
- Filter by area/municipality
- Monthly accomplishment view: filter resolved events by month for reporting

### Event Detail
- Full event record with all fields: report type, report ID, reported by, reported at, notes, municipality/boundary, violation/event sub-type, vessel name, registration number, address, offender name(s), action taken, photo indicator
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

### Patrol Area Planning
- Map-based polygon drawing tool for defining estimated patrol coverage zones
- Zones are estimated areas — not strict boundaries; rangers should be inside the shaded area
- Name, describe, and assign patrol type (foot/seaborne) to each zone
- Color-coded zone list with assigned ranger count
- Edit, delete, and manage active/inactive zones
- View scheduled vs actual coverage comparison (planned polygon vs actual patrol tracks)

### Patrol Schedule (Gantt)
- Gantt chart for scheduling ranger assignments to patrol areas over days/weeks
- Rows = rangers, columns = days, cells = color-coded zone assignment blocks
- Drag-and-resize schedule blocks on the Gantt timeline
- Legend showing zone colors
- Navigation: previous/next period, date range selection
- Add assignment button with ranger and zone selection
- Bi-weekly or monthly view toggles

### Fuel Logging
- **Purpose:** Track fuel received per municipal area to calculate average fuel consumption rate against seaborne patrol kilometers. Actual per-boat consumption cannot be measured — this tracks bulk fuel allocations.
- **Fuel entry form:** Any Command Center user can log a fuel receipt with fields:
  - Area/municipality (select from tenant's areas)
  - Date received
  - Total liters received
  - Total price (in tenant's configured currency)
  - Receipt photo upload (camera capture or file select)
  - Notes (optional — supplier name, delivery details)
- **Fuel log list:** Chronological table of all fuel entries, filterable by area, date range
- **Fuel consumption analytics:**
  - Average fuel consumption rate = total liters received ÷ total seaborne patrol kilometers for the same area and period
  - Displayed as: liters per km (e.g., 0.235 L/km)
  - Period selectors: daily, weekly, monthly, quarterly, annually — based on the frequency of fuel log entries within the selected period
  - Per-area breakdown: each area shows its own consumption rate
  - Trend chart: fuel consumption rate over time (line chart) to spot increases/decreases
  - Summary KPIs: total liters, total cost, total seaborne km, average L/km for selected period
- **Note:** Fuel is shared across all boats in an area — not tracked per individual boat. The boat name is recorded on each patrol (see Patrol Monitoring) but fuel allocation is at the area level.

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
- Tabular view of individual event records with all fields: report type, report ID, reported by, reported at, notes, municipality/boundary, violation/event sub-type, vessel name, registration number, address, offender name(s), action taken, photo indicator, **accompanying rangers**
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
- Configurable alert rules per tenant (e.g., "notify on any Destructive Practices event", "notify on critical priority events", "stale GPS warning")
- Rule definition: condition (event type, priority threshold, category), notification channels (in-app, email)
- Active/disabled toggle per rule
- Edit and delete rules
- Alert history log

### Notification Center
- Chronological list of all alerts and system notifications
- Read/unread status with unread badge count
- Click-through to related event or patrol
- Mark all as read button
- Filter by type (event alert, system alert, escalation, warning)
- Priority-coded indicators (critical=red, warning=orange, info=blue, system=gray)

### User Management
- CRUD users within tenant
- Assign roles (Command Center Operator, Field Coordinator, Site Admin)
- Activate/deactivate users
- Password reset
- Last login timestamp
- Role-specific badges (color-coded)

### Tenant Settings
- EarthRanger connection configuration: server URL, username, password, DAS Web Token (REST API), ER Track Token (WebSocket)
- Test connection button with validation (attempts API call using DAS Web Token)
- Connection health status indicator (connected/disconnected with last sync time)
- Data sync frequency configuration (default 30 seconds)
- Sync status table: data type × last sync × records synced × status
- Tenant profile (MPA site name, slug, description, timezone, **currency** — e.g., IDR, PHP, MYR)
- Save and update buttons
- Password and token fields masked by default with show/hide toggle

### Super Admin Panel
- Create/edit/deactivate tenants
- Tenant table: name, slug, EarthRanger server, user count, events (30d), last sync, status
- Assign initial Site Admin per tenant
- Platform-level KPI cards: total tenants, total users, total events
- Cross-tenant health overview
- Manage button to enter tenant context

### Internationalization
- Language switcher: English, Bahasa Indonesia, Bahasa Malaysia
- Switcher visible on login page and in header
- All UI labels, buttons, navigation, and system messages translated
- EarthRanger-sourced data displayed as-is (original language from field reports)

## Roles + Permissions
| Role | Can do | Cannot do |
|------|--------|-----------|
| Super Admin | Create/manage tenants, assign Site Admins, view platform health, access any tenant for support, manage platform-level settings | Cannot operate within a tenant as a regular user without being explicitly added; cannot modify EarthRanger configurations |
| Site Admin | Configure EarthRanger connection, manage users within own tenant, configure alert rules, view all reports, perform all Operator and Coordinator actions within own tenant | Cannot create or manage other tenants; cannot access other tenants' data; cannot modify platform-level settings |
| Field Coordinator | Plan patrol areas (draw polygons), schedule ranger assignments (Gantt), monitor patrols, review and edit event details, view all reports, export reports, manage Kanban board | Cannot manage users; cannot configure EarthRanger connection or alert rules; cannot access tenant settings |
| Command Center Operator | Monitor War Room and live map, monitor event feed, update event states (new→active→resolved), acknowledge alerts, escalate critical events, fill in event details via Kanban, log fuel entries, view dashboards and reports | Cannot plan patrol areas; cannot schedule rangers; cannot manage users; cannot configure tenant settings or alert rules; cannot export reports |

## Data Entities
**Tenant:** id, name, slug (subdirectory), earthranger_url (encrypted), earthranger_username (encrypted), earthranger_password (encrypted), earthranger_das_token (encrypted — Bearer token for REST API), earthranger_track_token (encrypted — Bearer token for SocketIO WebSocket), timezone, currency (e.g., IDR, PHP, MYR — configurable per tenant), description, is_active, sync_frequency_seconds, created_at, updated_at

**User:** id, tenant_id (nullable for Super Admin), email, name, password_hash, role (super_admin | site_admin | field_coordinator | operator), language_preference (en | id | ms), is_active, last_login_at, created_at, updated_at

**Subject (synced from ER):** id, tenant_id, er_subject_id, name, subject_type, subject_subtype, is_active, region, sex, last_position_lat, last_position_lon, last_position_at, additional_json, synced_at, created_at, updated_at

**Event (synced from ER):** id, tenant_id, er_event_id, serial_number, event_type, event_category, priority, state, title, location_lat, location_lon, time, end_time, reported_by_name, event_details_json, notes_json, area_name, synced_at, created_at, updated_at

**EventType (synced from ER):** id, tenant_id, er_eventtype_id, value, display, category, default_priority, icon_id, is_active, schema_json, synced_at
— IMPORTANT: Event types are dynamic. Categories include Law Enforcement (with sub-types like Unreg Illegal Fishing, Fishing in Prohibited Area, Taking of Prohibited Species, Use of Prohibited Gears, Compressor Fishing, Others, Destructive Practices) and Monitoring, Patrolling & Surveillance (with sub-types like Marine Wildlife Sightings, Infrastructure and Assets, Research and Studies, Community Support, Threats on Habitat). Patrol types include Foot Patrol and Seaborne Patrol. New event types can be added at any time in EarthRanger Admin and must be automatically picked up by the next event type sync. All reports, charts, and performance tracking must dynamically adapt to whatever event types exist — never hardcode event type lists.

**Patrol (synced from ER):** id, tenant_id, er_patrol_id, serial_number, title, patrol_type (foot | seaborne), boat_name (nullable — for seaborne patrols, synced from ER patrol data), state, start_time, end_time, total_distance_km, total_hours, synced_at, created_at, updated_at
— Note: EarthRanger's UI displays "SEABOURN PATROL" but the canonical spelling in this codebase is "seaborne". The UI display label should match EarthRanger's spelling ("Seabourn") for user familiarity; the code/database uses "seaborne".

**PatrolSegment (synced from ER):** id, patrol_id, er_segment_id, scheduled_start, scheduled_end, actual_start, actual_end, leader_name, leader_er_id, synced_at

**Observation (synced from ER):** id, tenant_id, er_observation_id, subject_id, location_lat, location_lon, recorded_at, source_name, additional_json (speed, heading, altitude, battery), synced_at

**SubjectGroup (synced from ER):** id, tenant_id, er_group_id, name, parent_id, subject_count, is_visible, synced_at

**PatrolArea (Command Center native):** id, tenant_id, name, description, patrol_type (foot | seaborne), polygon_geojson, color_hex, created_by, is_active, created_at, updated_at

**PatrolSchedule (Command Center native):** id, tenant_id, patrol_area_id, ranger_user_id, ranger_name, scheduled_start, scheduled_end, notes, created_by, created_at, updated_at

**AlertRule (Command Center native):** id, tenant_id, name, condition_json (event_type, priority_threshold, category), notification_channels (in_app, email), is_active, created_by, created_at, updated_at

**Notification (Command Center native):** id, tenant_id, user_id, alert_rule_id, event_id, title, message, is_read, notification_type (critical | warning | info | system), created_at

**SyncLog (Command Center native):** id, tenant_id, sync_type (events | subjects | patrols | observations | event_types), status (success | failed | partial), records_synced, error_message, started_at, completed_at

**AuditLog (Command Center native):** id, tenant_id, user_id, action, entity_type, entity_id, changes_json, ip_address, created_at

**AccompanyingRanger (Command Center native):** id, tenant_id, entity_type (event | patrol), entity_id (references event or patrol), ranger_type (registered | freetext), registered_user_id (nullable — references User if ranger_type=registered), known_ranger_id (nullable — references KnownRanger if previously used freetext name), freetext_name (nullable — for unregistered rangers), added_by_user_id, created_at

**FuelEntry (Command Center native):** id, tenant_id, area_name, date_received, liters, total_price, currency (inherited from tenant on creation, stored for historical accuracy), receipt_photo_url (nullable), notes (nullable), logged_by_user_id, created_at, updated_at
— Purpose: Tracks bulk fuel allocations per area. Fuel is shared across all boats in an area, not tracked per individual boat. Average consumption rate is calculated by dividing total liters by total seaborne patrol km for the same area and period.

**KnownRanger (Command Center native):** id, tenant_id, name, source (earthranger_sync | manual_entry), er_subject_id (nullable — if synced from ER subjects of type "person"/"ranger"), is_active, created_at, updated_at
— Purpose: maintains a registry of all known rangers for the autocomplete dropdown. Populated from three sources: (1) synced from EarthRanger subjects with subject_type="person", (2) users registered in the Command Center, (3) free-text names previously entered as accompanying rangers (promoted to known rangers for future autocomplete).

## Integrations
**EarthRanger API (per tenant):** REST API v1.0 + v2.0 for data sync (subjects, events, event types, patrols, observations, subject groups, tracks). Auth uses Bearer token in `Authorization` header — token is a 40-char alphanumeric string created in ER Admin (DAS Access Tokens). SocketIO WebSocket for real-time subject position updates uses the same Bearer token mechanism (sent as `authorization` message after WebSocket connect). Each tenant may have two separate tokens: DAS Web Token (REST API) and ER Track Token (SocketIO). Command Center pushes event state updates back to ER via API. — OSS/Self-hosted

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
| 9 | Patrol Schedule (Gantt) | Mobile Ready | Gantt chart — desktop only workflow |
| 10 | Fuel Logging | Mobile First | Rangers log fuel receipts in the field from phone — camera capture for receipt photos |
| 11 | Reports — Per Area Summary | Mobile Ready | Bar charts + tables — desktop reporting |
| 12 | Reports — Consolidated | Mobile Ready | Cross-area comparison tables + charts — wide data tables |
| 13 | Reports — Detailed Event Log | Mobile Ready | Multi-column detailed tables — desktop |
| 14 | Reports — Ranger Performance | Mobile Ready | Performance matrix + patrol stats per ranger — wide table |
| 15 | Ranger Performance Detail | Mobile First | Single ranger's stats — reviewable on phone by field coordinator |
| 16 | Alert Rules Configuration | Mobile Ready | Admin sets up alert conditions — infrequent, desktop |
| 17 | Notification Center | Mobile First | In-app alerts list — operators check from any device |
| 18 | User Management | Mobile Ready | Admin manages users/roles — settings panel |
| 19 | Tenant Settings (ER Connection) | Mobile Ready | Admin configures EarthRanger API — rare, desktop |
| 20 | Super Admin — Tenant Management | Mobile Ready | Platform admin onboards new MPA sites — rare, desktop |

## Non-functional Requirements
Performance:    <500ms API response for dashboard and report queries at 50 concurrent users per tenant
Uptime:         99.5% SLA for prod
Data retention: Synced data kept indefinitely (mirrors EarthRanger). Sync logs retained 90 days. Notifications retained 1 year.
Compliance:     None required for v1
Accessibility:  Standard web accessibility (semantic HTML, keyboard navigation)

## Tenancy Model
multi
Subdirectory routing: app.com/mindoro/, app.com/banggai/, app.com/pecca/
Shared global data: event type category definitions (Law Enforcement types, Monitoring types), platform configuration
DB isolation exception: none — all tenant data isolated by tenant_id foreign key with L1-L6 security stack

## User-Facing URLs
/                                   Login / redirect to tenant dashboard
/[tenant]/command-center            War Room (primary — 100-inch TV view)
/[tenant]/dashboard                 Standard dashboard with KPIs and live feed
/[tenant]/map                       Live map with all layers (standalone)
/[tenant]/events                    Event Kanban board
/[tenant]/events/[id]               Event detail view
/[tenant]/patrols                   Patrol monitor list
/[tenant]/patrols/[id]              Patrol detail with track map
/[tenant]/patrol-areas              Patrol area map editor
/[tenant]/patrol-schedule           Gantt chart patrol scheduling
/[tenant]/fuel                      Fuel logging and consumption analytics
/[tenant]/reports/area              Per-area report
/[tenant]/reports/consolidated      Consolidated cross-area report
/[tenant]/reports/detailed          Detailed event log
/[tenant]/reports/rangers           Ranger performance report
/[tenant]/reports/rangers/[id]      Individual ranger detail
/[tenant]/alerts                    Alert rules configuration
/[tenant]/notifications             Notification center
/[tenant]/settings                  Tenant settings (ER connection, profile)
/[tenant]/users                     User management
/admin/tenants                      Super Admin tenant management
/admin/users                        Super Admin platform user management

## Access Control
Public routes:    / (login page only)
Protected routes: /[tenant]/* (require login + tenant membership) — includes /[tenant]/fuel (all authenticated users can log fuel entries)
Admin-only:       /[tenant]/settings, /[tenant]/users, /[tenant]/alerts (Site Admin+)
Coordinator+:     /[tenant]/patrol-areas, /[tenant]/patrol-schedule, /[tenant]/reports/* export actions (Field Coordinator+)
Super Admin only: /admin/*

## Data Sensitivity
PII stored:       yes — user email addresses, user names, ranger names (synced from ER)
Financial data:   no
Health data:      no
Audit required:   event state changes, event detail edits, user login/logout, tenant configuration changes, alert rule changes, patrol area creation/modification, fuel entry creation/edits/deletion (involves financial amounts)
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
EarthRanger API credentials stored encrypted per tenant in database — never in .env files (each tenant has different ER server). Each tenant requires 5 credentials: URL, username, password, DAS Web Token (REST API), ER Track Token (WebSocket).
Future scaling: planning for multiple servers — architecture should support horizontal scaling when needed
AWS path when ready: RDS, S3, ElastiCache, SES — update .env.{env} only, zero code changes.

## Credentials Specification
Phase 3 must prompt the user for these credentials and store them in CREDENTIALS.md (gitignored, never committed).

### EarthRanger API Access — per server (Phase 3 must ask for ALL of these per site):
Each EarthRanger server requires credentials for API access. EarthRanger uses Bearer token authentication for both REST API and SocketIO WebSocket — the token is a 40-character alphanumeric string created in EarthRanger Admin (DAS Configuration > DAS Access Tokens) tied to a service account.

The user may have two separate tokens per server (DAS Web Token for REST API, ER Track Token for real-time tracking). Both are used as Bearer tokens in the same way — the distinction is organizational (different service accounts or applications), not protocol-level.

**Mindoro Server:**
| Credential | Env Var | Description |
|------------|---------|-------------|
| Server URL | ER_MINDORO_URL | Base URL (e.g., https://mindoro.pamdas.org) |
| Username | ER_MINDORO_USERNAME | EarthRanger service account username |
| Password | ER_MINDORO_PASSWORD | EarthRanger service account password |
| DAS Web Token | ER_MINDORO_DAS_TOKEN | Bearer token for REST API access (events, subjects, patrols, observations) |
| ER Track Token | ER_MINDORO_TRACK_TOKEN | Bearer token for SocketIO real-time subject position tracking |

**Banggai Server:**
| Credential | Env Var | Description |
|------------|---------|-------------|
| Server URL | ER_BANGGAI_URL | Base URL (e.g., https://banggai.pamdas.org) |
| Username | ER_BANGGAI_USERNAME | EarthRanger service account username |
| Password | ER_BANGGAI_PASSWORD | EarthRanger service account password |
| DAS Web Token | ER_BANGGAI_DAS_TOKEN | Bearer token for REST API access |
| ER Track Token | ER_BANGGAI_TRACK_TOKEN | Bearer token for SocketIO real-time tracking |

**Pecca Server:**
| Credential | Env Var | Description |
|------------|---------|-------------|
| Server URL | ER_PECCA_URL | Base URL (e.g., https://pecca.pamdas.org) |
| Username | ER_PECCA_USERNAME | EarthRanger service account username |
| Password | ER_PECCA_PASSWORD | EarthRanger service account password |
| DAS Web Token | ER_PECCA_DAS_TOKEN | Bearer token for REST API access |
| ER Track Token | ER_PECCA_TRACK_TOKEN | Bearer token for SocketIO real-time tracking |

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

### Data entity update — Tenant table must store all 5 ER credentials:
The Tenant entity must include these fields for EarthRanger access:
- earthranger_url (string, encrypted)
- earthranger_username (string, encrypted)
- earthranger_password (string, encrypted)
- earthranger_das_token (string, encrypted) — used for REST API calls via Authorization: Bearer header
- earthranger_track_token (string, encrypted) — used for SocketIO WebSocket authorization message

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
- **ER Data Sync (per tenant):** Scheduled job polls EarthRanger API for new/updated events, subjects, patrols, observations. Configurable frequency per tenant (default: 30 seconds for subjects/events, 5 minutes for patrols). Retry with exponential backoff on failure. SyncLog entry per run.
- **Alert Evaluation:** After each data sync, evaluate new events against tenant's alert rules. Generate notifications and send emails for matches. Retry email delivery 3 times with backoff.
- **Stale Data Detection:** Periodic check for subjects with no position update beyond threshold. Flag stale subjects for War Room and dashboard display.
- **Report Pre-computation (optional):** Nightly aggregation of patrol stats and event counts for fast report loading on large datasets.
- Queue: BullMQ with Valkey. Separate queues: er-sync, alerts, email, maintenance.
- DLQ: failed jobs moved to dead-letter queue after 3 retries. Admin notified via in-app alert.

## Out of Scope
- No public-facing website — internal operations tool only, no marketing landing page or public registration
- No payment/billing system — MPA sites onboarded manually by Super Admin
- No mobile native app — web-only with responsive design
- No SMS sending in v1 — Twilio/MSG91 integration scaffolded but not active, email notifications only
- No offline mode — requires active internet connection
- No direct EarthRanger admin configuration editing — can update event states and create events via API, but cannot modify ER's event types, subject types, or source provider setup
- No AI/ML analytics — no predictive patrol optimization or automated pattern detection in v1
- No Cloudflare Turnstile — bot protection opted out for v1 (internal tool, login-only public route, no public registration)
