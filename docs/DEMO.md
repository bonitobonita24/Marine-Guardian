# Marine Guardian — Demo Readiness Guide

**Prepared:** 2026-06-18 | **Branch:** chore/deadline-qa-20260618 | **Status:** READY

---

## URLs

| Environment | URL | Notes |
|-------------|-----|-------|
| **Production** | https://mg.powerbyte.app | Live; Cloudflare-fronted; HTTPS |
| **Local dev** | http://localhost:45204 | Requires dev stack running (see below) |
| **MailHog (dev email)** | http://localhost:45200 | Dev-only email catcher |
| **MinIO Console (dev storage)** | http://localhost:45198 | Dev-only S3 UI |
| **pgAdmin (dev DB)** | http://localhost:45201 | Dev-only DB browser |

---

## Login Path

Authentication uses email + password (Auth.js v5 Credentials provider).

Navigate to `/login` (prod: https://mg.powerbyte.app/login).

**Credentials are in `CREDENTIALS.md` (gitignored — never shared).**

Use these accounts for the demo:

| Role | Tenant | Email | Creds location |
|------|--------|-------|----------------|
| **Webmaster** (super_admin) | platform-wide | `webmaster@marine-guardian.local` | `CREDENTIALS.md` → Webmaster → prod row |
| **Demo Site Admin** (site_admin) | demo-site | `admin@demo-site.local` | `CREDENTIALS.md` → Demo Site Admin → prod row |

> **Recommended demo account:** use the **Demo Site Admin** — it logs straight into the `demo-site` tenant with all EarthRanger data (8,004+ events, 4,420+ patrols). The webmaster account lands on the admin panel; to reach tenant data you must enter impersonation mode from `/admin/tenants`.

After login, the app redirects to `/dashboard`.

---

## Starting the Local Dev Stack

```bash
# From repo root — starts all infra + app containers (builds app from source)
bash deploy/compose/start.sh dev up -d

# App is ready when:
curl http://localhost:45204/api/health
# → {"status":"ok","timestamp":"..."}

# Stop when done
bash deploy/compose/start.sh dev down
```

Containers started: postgres (45194), pgbouncer (45195), valkey (45196), minio (45197/45198), mailhog (45199/45200), pgadmin (45201), app (45204).

---

## Demo Data State (dev DB — verified 2026-06-18)

| Tenant | Slug | Events | Patrols |
|--------|------|--------|---------|
| Demo Site | `demo-site` | **8,004** | **4,420** |
| QA Test Reef | `qa-test-reef` | (seed only) | (seed only) |

Data source: live Mindoro MPA EarthRanger feed (mindoro.pamdas.org), ingested via `scripts/ingest-earthranger.mjs`.

**If demo data is missing** (e.g. after a DB reset), reload it:
```bash
cd packages/db
DATABASE_URL="<dev DATABASE_URL from .env.dev>" \
  DAS_WEB_TOKEN="<token from CREDENTIALS.md → EarthRanger>" \
  node ../../scripts/ingest-earthranger.mjs
```
The script is idempotent — safe to re-run. Runtime: ~10-15 min for full dataset.

---

## Evaluator Click-Path (demo-site tenant)

Login as **Demo Site Admin** (`admin@demo-site.local`), then follow this path:

### 1. Dashboard (`/dashboard`)
- View KPI tiles: total events, active patrols, ranger count, recent alerts
- Confirm data is populated (not empty/zeroed)

### 2. Events Kanban (`/events`)
- Browse the 8,000+ EarthRanger wildlife/incident events
- Filter by event type and date range
- Click any event card to view detail (category, location, timestamp, reporter)

### 3. Patrols (`/patrols`)
- List of 4,400+ patrol records
- Filter by state (open / done) and date
- Click a patrol to open the patrol detail view (`/patrols/[id]`)
  - Shows patrol track, rangers assigned, accompanying rangers, start/end times

### 4. Map (`/map`)
- Interactive Leaflet map of the MPA
- Patrol tracks displayed as polylines
- Events as point markers; click for popup detail
- Toggle layers via the map controls

### 5. Patrol Schedule (`/patrol-schedule`)
- Calendar-based patrol scheduling
- View assigned rangers per patrol slot

### 6. Patrol Areas (`/patrol-areas`)
- Defined area boundaries (GeoJSON polygons on the map)
- Area coverage statistics

### 7. Fuel Log (`/fuel`)
- Fuel consumption entries per vessel
- Fuel analytics chart (consumption over time)

### 8. Alert Rules + History (`/alerts`, `/alerts/history`)
- Configured alert rules (event-type triggers)
- Alert history log with timestamps

### 9. Users (`/users`)
- Tenant user management (invite, role assignment)
- Roles: site_admin, operator

### 10. Settings (`/settings`)
- Tenant-level settings and EarthRanger connection config

### 11. Sync Status (`/sync`)
- Last EarthRanger sync log (events/patrols/subjects)

### 12. Exports (`/exports`)
- CSV/report export for events, patrols, notifications
- Per-area PDF report generation

---

## Admin Panel (Webmaster only)

Login as Webmaster (`webmaster@marine-guardian.local`) → redirects to `/admin`.

- `/admin/tenants` — manage tenants, enter impersonation mode to view any tenant as site_admin
- `/admin/users` — platform-wide user management

---

## Security Notes for Evaluator

- All routes protected by middleware (unauthenticated → redirect to `/login`)
- All tRPC procedures enforce `tenantId` scoping (`tenantProcedure` middleware)
- All REST export routes call `requireRouteAuth()` — returns 401 without session
- CSP headers active on every response
- HSTS + X-Frame-Options set

---

## Known Caveats (not blocking demo)

1. **PDF renderer in dev** — the `pdf-renderer` container rebuilds from source on `start.sh dev up`. Report export PDF generation works but the first request after a cold start takes ~30s while Puppeteer warms up.
2. **SMS notifications** — Twilio/MSG91 scaffolded but not active in v1. Alert notifications are in-app only.
3. **Staging compose labels** — minor Traefik label fix still pending on a separate branch (`fix/traefik-staging-route`); does not affect prod or dev.
