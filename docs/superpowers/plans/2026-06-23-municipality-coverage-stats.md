# Municipality Coverage Stats — Implementation Plan

**Date:** 2026-06-23
**Branch:** `feat/municipality-coverage-stats`
**Status:** DATA SOURCED — awaiting build task
**Author:** Claude Sonnet 4.6 (planning session)
**Owner decision required before build:** see § Open Questions

---

## 0. Why This Feature Exists

Marine Guardian patrols and events happen across 11 LGUs spanning three provinces
(Oriental Mindoro, Occidental Mindoro, Palawan) plus Apo Reef Natural Park. The
current schema assigns patrols/events to an `AreaBoundary` (a free-form polygon the
admin configures). This is flexible but means stats like "how many patrols covered
Sablayan this month?" require ad-hoc queries against boundary names, not a canonical
municipality dimension.

This plan adds a **canonical municipality layer** as a first-class dimension on
Patrol and Event so the dashboard can answer:
- Per-municipality patrol counts and event counts (bar chart)
- Protected-zone overlay — patrols/events that touched Apo Reef Natural Park
- Trend over time per municipality (line chart)
- Coverage map — which municipalities have zero patrols in the last N days

---

## 1. Polygon Sources Acquired

All polygon files live at:
`apps/web/src/data/coverage/*.geojson`

The config/seed index lives at:
`apps/web/src/data/coverage/coverage-areas.ts`

### 1a. 11 LGU Land Polygons

**Source:** geoBoundaries-PHL-ADM3
**Provider:** geoBoundaries (wmgeolab), NAMRIA / PSA / OCHA Philippines
**License:** Creative Commons Attribution 3.0 Intergovernmental Organisations (CC BY 3.0 IGO)
**Year:** 2020
**API used:** `https://www.geoboundaries.org/api/current/gbOpen/PHL/ADM3/`
**GeoJSON URL:** `https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/PHL/ADM3/geoBoundaries-PHL-ADM3.geojson`

| File | Municipality | Province | PSGC | geoBoundaries shapeID | Geometry |
|------|-------------|----------|------|----------------------|----------|
| `calapan-city.geojson` | Calapan City | Oriental Mindoro | 175104000 | 30758251B77350797414463 | MultiPolygon |
| `baco.geojson` | Baco | Oriental Mindoro | 175101000 | 30758251B69479050195003 | Polygon |
| `san-teodoro.geojson` | San Teodoro | Oriental Mindoro | 175110000 | 30758251B90204819305655 | Polygon |
| `puerto-galera.geojson` | Puerto Galera | Oriental Mindoro | 175109000 | 30758251B54215534625427 | MultiPolygon |
| `abra-de-ilog.geojson` | Abra de Ilog | Occidental Mindoro | 174901000 | 30758251B36470920271092 | Polygon |
| `sablayan.geojson` | Sablayan | Occidental Mindoro | 174909000 | 30758251B34022252316389 | MultiPolygon |
| `roxas-palawan.geojson` | Roxas (Palawan) | Palawan | 175319000 | 30758251B10061841294265 | MultiPolygon |
| `araceli.geojson` | Araceli | Palawan | 175302000 | 30758251B86342486803813 | MultiPolygon |
| `dumaran.geojson` | Dumaran | Palawan | 175306000 | 30758251B96628789522948 | MultiPolygon |
| `taytay.geojson` | Taytay | Palawan | 175322000 | 30758251B72316190206283 | MultiPolygon |
| `aborlan.geojson` | Aborlan | Palawan | 175301000 | 30758251B88743888905923 | MultiPolygon |

**Disambiguation notes (multiple candidates in national dataset):**
- **Baco** — 8 features matched "Baco" in national ADM3. Selected shapeID `30758251B69479050195003` (centroid 121.10°E, 13.39°N — Oriental Mindoro ✓). Others were Bacolod, Bacoor, etc.
- **Roxas** — 7 features matched "Roxas". Selected shapeID `30758251B10061841294265` (centroid 119.23°E, 10.07°N — Palawan ✓). Rejected: Roxas in Capiz (centroid 122°E) and Oriental Mindoro (centroid 121.51°E, 12.59°N).
- **Taytay** — 2 features matched. Selected shapeID `30758251B72316190206283` (centroid 119.60°E, 10.68°N — Palawan ✓). Rejected: Taytay in Rizal province (centroid 121.13°E, 14.55°N).
- **Araceli** — 2 features matched. Selected shapeID `30758251B86342486803813` (centroid 119.99°E, 10.49°N — Palawan ✓). Rejected: Paracelis in Mountain Province.
- **Dumaran** — 1 exact match.

### 1b. Apo Reef Natural Park

**File:** `apo-reef-natural-park.geojson`
**Source:** OpenStreetMap way 181365709
**License:** Open Database License (ODbL 1.0)
**Source URL:** https://www.openstreetmap.org/way/181365709
**Wikidata:** Q618756
**WDPA ID:** 2340 (Protected Planet, polygon available at WDPA with API token)
**OSM tags:** `boundary=national_park`, `leisure=nature_reserve`, `note=Senate Bill 2393 official boundaries`
**Spatial extent:** lon 120.40°–120.56°, lat 12.60°–12.75° (Sablayan, Occidental Mindoro)

**Important caveat — polygon precision:** The OSM way is a 5-vertex rectangular
bounding box representing the legislated extent per Senate Bill 2393. It is the
official legal boundary, but it is not a detailed coastline-following polygon. This
is sufficient for point-in-polygon assignment (reef patrols and events will be inside
this bbox), but not for a visually accurate map overlay. Options for the owner:

1. **Use as-is** (recommended for v1): the bbox captures all Apo Reef patrol/event
   points correctly. The "Apo Reef" zone flag on a patrol is operationally meaningful
   regardless of visual polygon accuracy.
2. **Substitute with WDPA polygon**: Protected Planet has a detailed boundary (WDPA
   ID 2340). Requires a free API token from https://api.protectedplanet.net/. The
   token can be stored in the existing SOPS secrets structure and the polygon fetched
   once at seed time.
3. **Source from DENR/PAWB**: The Department of Environment and Natural Resources
   Philippines has detailed cadastral MPA boundaries for declared natural parks. This
   is the most accurate source but requires direct contact or access to the NAMRIA
   GIS portal.

**Owner decision needed:** which polygon precision level is acceptable for v1?
This plan defaults to the OSM bbox (already saved) so the build task is not blocked.

---

## 2. Codebase Grounding

### 2a. Relevant Existing Models

**`Patrol`** (table `patrols`) — relevant fields:
- `areaBoundaryId String? @map("area_boundary_id")` — existing area assignment (free-form)
- `areaDerivedAt DateTime? @map("area_derived_at")` — when area was derived
- No `municipalityId` yet

**`Event`** (table `events`) — relevant fields:
- `areaBoundaryId String? @map("area_boundary_id")` — same pattern
- `locationLat Float`, `locationLon Float` — point used for assignment
- No `municipalityId` yet

**`PatrolTrack`** (table `patrol_tracks`) — relevant fields:
- `trackGeojson Json` — the full LineString/MultiLineString track
- Used for "first point" municipality assignment on patrols

**`PatrolArea`** (table `patrol_areas`) — existing polygon-based area for patrol
scheduling. This is a different concept from municipality; do not conflate.

**`AreaBoundary`** (table `area_boundaries`) — the existing free-form boundary system.
Municipality is a new parallel concept, not a replacement. Both coexist.

### 2b. Area-Derivation Library (`packages/shared/src/lib/area-derivation/`)

Exports:
- `findNearestBoundary(point, boundaries[], thresholdKm)` — edge-distance nearest
  boundary fallback. Takes `LatLon` (lat/lon) and an array of `AreaBoundaryForDerivation`
  objects. Returns the nearest boundary within `thresholdKm` (default 5 km) or `null`.
- `deriveArea(input)` — higher-level orchestrator (name match → point-in-polygon →
  nearest-boundary fallback)
- `haversineKm`, `pointToSegmentDistanceKm` — math utilities

The existing library works with `AreaBoundaryForDerivation` objects (which have
`geometryGeojson: Record<string, unknown>`, `isEnabled: boolean`, etc.). The new
municipality assignment will use the same `findNearestBoundary` shape for the
fallback, but the primary check will be `@turf/boolean-point-in-polygon` (already
a dependency in `packages/shared/package.json`).

### 2c. Turf Dependencies (already in `packages/shared`)
```json
"@turf/boolean-point-in-polygon": "^7.1.0",
"@turf/helpers": "^7.1.0",
"@turf/length": "^7.1.0",
"@turf/line-split": "^7.1.0"
```

Missing for this feature (need to add to `packages/shared`):
- `@turf/buffer` — for 15 km municipal water derivation
- `@turf/union` — to merge land + water polygons
- `@turf/difference` — to subtract overlapping water buffers between adjacent municipalities
- `@turf/nearest-point-on-line` — alternative for equidistant boundary calculation
- `@turf/boolean-intersects` — for patrol track × protected zone overlap check

### 2d. ER Sync Processor (`packages/jobs/src/processors/er-sync.processor.ts`)

The sync processor handles: `event_types`, `subjects`, `events`, `patrols`, `observations`.
For `events` and `patrols`, it upserts records via `platformPrisma`. The municipality
assignment should hook in **after** the upsert for each record — either inline
(simplest for events, where we have the lat/lon immediately) or via a new BullMQ job
(preferred for patrols, where we need the PatrolTrack which is materialized
separately via `enqueuePatrolTrackMaterialize`).

The existing pattern for area derivation is:
1. Sync upserts the record
2. Enqueues `enqueueAreaRederive(tenantId, entityId)` → BullMQ job runs
   `deriveArea()` and updates `areaBoundaryId`
3. A separate `enqueuePatrolTrackMaterialize` job materializes the track

Municipality assignment follows the same pattern:
- Events: assign municipality inline at sync time (lat/lon available immediately)
- Patrols: enqueue municipality assignment after patrol-track materializes
  (first point of track needed for Layer 1)

### 2e. Dashboard Router (`apps/web/src/server/trpc/routers/dashboard.ts`)

Current procedures: `kpis`, `eventBreakdown`, `recentEvents`, `alertStats`, `lastIncident`.
New procedures to add: `municipalityCoverage`, `municipalityTrend`, `protectedZoneCoverage`.
These are `tenantProcedure` (tenant-scoped) following the existing pattern.

---

## 3. Two-Layer Assignment Design

### Layer 1 — Municipality (mutually exclusive, primary)

Every patrol and event belongs to exactly one municipality.

**Assignment rule:**
```
1. Test point-in-polygon against all 11 municipality land polygons (turf booleanPointInPolygon)
   → if inside exactly one: assign that municipality
   → if inside none (over water): continue to step 2

2. Test point-in-polygon against all 11 derived 15 km municipal-water polygons
   (land ∪ 15 km seaward buffer, non-overlapping — see §3a)
   → if inside one: assign that municipality
   → if inside none: continue to step 3

3. Nearest municipality fallback (reuse findNearestBoundary with no threshold cap,
   or cap at 30 km — owner decision):
   → assign the municipality whose boundary edge is closest to the point
   → if still null (e.g. extremely remote point): municipalityId = null, log a warning
```

**Point used for assignment:**
- **Events:** `locationLat` + `locationLon` (single point, available at sync time)
- **Patrols:** FIRST point of `PatrolTrack.trackGeojson` coordinates array

**Why the first point?** The patrol may traverse multiple municipalities (especially
long coastal patrols). The first point reflects where the patrol originates — the
responsible jurisdiction. An alternative is "majority of track in municipality" (count
points per municipality, pick the most frequent). Owner can flip this in the config
without a schema change. Document this assumption in `DECISIONS_LOG.md`.

### 3a. 15 km Municipal Water Derivation

Run once as a seeding script (`scripts/derive-municipal-waters.ts`):

```
For each municipality land polygon:
  1. turf.buffer(landPolygon, 15, {units: 'kilometers'}) → raw water extent
  
For each municipality buffer:
  2. Subtract intersecting portions of OTHER municipalities' buffers (voronoi/equidistance):
     Use turf.difference(myBuffer, turf.union(...otherBuffers)) to get non-overlapping slices
     [Note: overlapping seams between adjacent municipalities resolved by "nearest centroid"
     heuristic — assign contested water strip to the municipality whose land centroid is closer]
  
  3. municipalWaterPolygon = turf.union(landPolygon, trimmedBuffer)
  4. Save to Municipality.waterGeojson in DB
```

This runs **once** at initial seed (after migration) and whenever a boundary is updated.
It does NOT run per-patrol/per-event — the derived water polygons are cached in the DB.

### Layer 2 — Protected Zone (additive, many-to-many)

Protected zones are overlaid on top of municipality assignment.

**Assignment rule for patrols:**
```
For each active ProtectedZone:
  if turf.booleanIntersects(patrolTrack, zonePoly) === true:
    create PatrolCoveredZone join row
```

**Assignment rule for events:**
```
For each active ProtectedZone:
  if turf.booleanPointInPolygon(eventPoint, zonePoly) === true:
    create EventCoveredZone join row
```

**Semantics:** ADDITIVE — an Apo Reef patrol counts under Sablayan AND is flagged
"Apo Reef Natural Park". A future option to make it EXCLUSIVE (Apo Reef patrols
count ONLY under the zone, not the parent municipality) can be flipped with a
`ProtectedZone.exclusiveAccounting Boolean @default(false)` field without changing
the join table structure.

---

## 4. Proposed Schema (build task — do NOT apply now)

Add to `packages/db/prisma/schema.prisma`:

```prisma
/// Canonical municipality dimension for coverage stats.
/// Seeded from apps/web/src/data/coverage/coverage-areas.ts + derived waters.
model Municipality {
  id          String   @id @default(cuid())
  name        String
  province    String
  psgcCode    String   @unique @map("psgc_code")
  landGeojson Json     @map("land_geojson")
  /// Derived 15 km municipal-water polygon (land ∪ 15 km seaward buffer, non-overlapping).
  /// Null until derive-municipal-waters.ts seed script runs.
  waterGeojson Json?   @map("water_geojson")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  patrols       Patrol[]
  events        Event[]
  protectedZones ProtectedZone[]

  @@index([province])
  @@map("municipalities")
}

/// Protected zone overlay — nested within a municipality, many-to-many with Patrol/Event.
model ProtectedZone {
  id                  String        @id @default(cuid())
  name                String
  geojson             Json
  /// Parent municipality (for display grouping). May be null for cross-boundary zones.
  parentMunicipalityId String?      @map("parent_municipality_id")
  /// When true, patrols/events in this zone count ONLY under the zone, not the municipality.
  /// Default false (additive).
  exclusiveAccounting Boolean       @default(false) @map("exclusive_accounting")
  createdAt           DateTime      @default(now()) @map("created_at")
  updatedAt           DateTime      @updatedAt @map("updated_at")

  parentMunicipality Municipality? @relation(fields: [parentMunicipalityId], references: [id])
  patrolCoveredZones  PatrolCoveredZone[]
  eventCoveredZones   EventCoveredZone[]

  @@index([parentMunicipalityId])
  @@map("protected_zones")
}

/// Join: patrol ↔ protected zone (which zones does this patrol's track intersect?)
model PatrolCoveredZone {
  patrolId        String   @map("patrol_id")
  protectedZoneId String   @map("protected_zone_id")
  assignedAt      DateTime @default(now()) @map("assigned_at")

  patrol        Patrol        @relation(fields: [patrolId], references: [id], onDelete: Cascade)
  protectedZone ProtectedZone @relation(fields: [protectedZoneId], references: [id], onDelete: Cascade)

  @@id([patrolId, protectedZoneId])
  @@map("patrol_covered_zones")
}

/// Join: event ↔ protected zone (is this event's point inside the zone?)
model EventCoveredZone {
  eventId         String   @map("event_id")
  protectedZoneId String   @map("protected_zone_id")
  assignedAt      DateTime @default(now()) @map("assigned_at")

  event         Event         @relation(fields: [eventId], references: [id], onDelete: Cascade)
  protectedZone ProtectedZone @relation(fields: [protectedZoneId], references: [id], onDelete: Cascade)

  @@id([eventId, protectedZoneId])
  @@map("event_covered_zones")
}
```

**Add to `Patrol` model:**
```prisma
municipalityId   String?   @map("municipality_id")
municipalityAssignedAt DateTime? @map("municipality_assigned_at")

municipality     Municipality? @relation(fields: [municipalityId], references: [id])
coveredZones     PatrolCoveredZone[]

// Add index:
@@index([tenantId, municipalityId])
```

**Add to `Event` model:**
```prisma
municipalityId   String?   @map("municipality_id")
municipalityAssignedAt DateTime? @map("municipality_assigned_at")

municipality     Municipality? @relation(fields: [municipalityId], references: [id])
coveredZones     EventCoveredZone[]

// Add index:
@@index([tenantId, municipalityId])
```

### Migration approach

1. Generate migration: `pnpm db:migrate` (adds 4 new tables, 2 nullable FK columns)
2. The nullable FKs on Patrol and Event mean zero-downtime deployment — existing rows
   get `municipalityId = null` and are filled by the backfill script.
3. Run seed: `pnpm db:seed` → creates Municipality rows from `coverage-areas.ts` +
   runs derive-municipal-waters.ts
4. Run backfill: `pnpm tsx scripts/backfill-municipality-assignment.ts`

---

## 5. Extensibility Template

### Adding a new municipality or protected zone

The **only file to edit** is `apps/web/src/data/coverage/coverage-areas.ts`. Add one
entry to `MUNICIPALITIES` or `PROTECTED_ZONES`:

```typescript
// Example: adding a new municipality
{
  id: "new-municipality-id",       // lowercase-kebab, unique
  name: "Municipality Name",       // official name
  province: "Province Name",
  psgcCode: "PSGC9-digit-code",   // from PSA PSGC online lookup
  type: "municipality",
  geojsonFile: "new-municipality.geojson",  // place file in same dir
  parentMunicipalityId: null,
  source: "geoBoundaries-PHL-ADM3 (shapeID XXXX) or other source",
  license: "CC BY 3.0 IGO",
  sourceURL: "https://...",
  boundaryYear: 2020,
},

// Example: adding a new protected zone
{
  id: "new-mpa-id",
  name: "New Marine Protected Area",
  province: "Province Name",
  psgcCode: null,
  type: "protected-zone",
  geojsonFile: "new-mpa.geojson",
  parentMunicipalityId: "parent-municipality-id",  // must match a municipality id
  source: "OpenStreetMap way XXXXXXX",
  license: "ODbL 1.0",
  sourceURL: "https://www.openstreetmap.org/way/XXXXXXX",
  boundaryYear: 2024,
},
```

Then follow these steps:

1. **Place the GeoJSON file** at `apps/web/src/data/coverage/<geojsonFile>`.
   Format: `{ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {...}, geometry: {...} }] }`
   The geometry must be WGS84 (EPSG:4326), Polygon or MultiPolygon.

2. **Create a Prisma migration** — if this is the first entry of this type, the
   Municipality / ProtectedZone tables already exist; just run the seed.

3. **Re-run the seed**: `pnpm db:seed` — the seed script reads `coverage-areas.ts`
   and upserts (by `psgcCode` for municipalities, by `id` for zones).

4. **For new municipalities only**: re-run the water derivation:
   `pnpm tsx scripts/derive-municipal-waters.ts --only <id>`
   This recomputes that municipality's 15 km water polygon and may re-trim
   neighbors that share a maritime boundary.

5. **Run the backfill** for the new entry:
   `pnpm tsx scripts/backfill-municipality-assignment.ts --since 2020-01-01`
   This re-evaluates all patrols/events with `municipalityId = null` or those
   whose point falls in the new area.

6. **No code changes needed** in the sync processor or dashboard — both read from
   the DB tables, which are already populated.

---

## 6. Files to Create (build task)

### 6a. New files

| File | Purpose |
|------|---------|
| `packages/db/prisma/migrations/YYYYMMDD_municipality_coverage/migration.sql` | Prisma migration |
| `packages/db/prisma/seed/seed-municipalities.ts` | Seeds Municipality + ProtectedZone from coverage-areas.ts |
| `packages/shared/src/lib/municipality-assignment/index.ts` | Pure functions: assignMunicipalityToPoint, assignZonesToPoint, assignZonesToTrack |
| `packages/shared/src/lib/municipality-assignment/types.ts` | MunicipalityForAssignment, ProtectedZoneForAssignment |
| `packages/jobs/src/processors/municipality-assign.processor.ts` | BullMQ processor for async municipality assignment |
| `packages/jobs/src/queues/municipality-assign.queue.ts` | BullMQ queue definition |
| `scripts/derive-municipal-waters.ts` | One-time + on-demand 15 km water derivation |
| `scripts/backfill-municipality-assignment.ts` | Backfill all existing patrols/events |
| `apps/web/src/server/trpc/routers/municipalityCoverage.ts` | tRPC router with 3 new procedures |
| `apps/web/src/components/dashboard/MunicipalityCoverageChart.tsx` | shadcn-ui + Recharts bar chart |
| `apps/web/src/components/dashboard/ProtectedZoneCard.tsx` | Zone coverage summary card |

### 6b. Files to modify

| File | Change |
|------|--------|
| `packages/db/prisma/schema.prisma` | Add Municipality, ProtectedZone, PatrolCoveredZone, EventCoveredZone models; add municipalityId to Patrol + Event |
| `packages/jobs/src/processors/er-sync.processor.ts` | Hook: after event sync → assign municipality inline; after patrol-track materializes → enqueue municipality-assign job |
| `apps/web/src/server/trpc/routers/index.ts` | Register `municipalityCoverageRouter` |
| `apps/web/src/app/(dashboard)/page.tsx` | Add MunicipalityCoverageChart + ProtectedZoneCard |
| `packages/shared/package.json` | Add @turf/buffer, @turf/union, @turf/difference, @turf/boolean-intersects |

---

## 7. New tRPC Procedures (dashboard extension)

Add to `apps/web/src/server/trpc/routers/municipalityCoverage.ts`:

```typescript
// Procedure 1: per-municipality patrol + event counts for a date range
municipalityCoverage: tenantProcedure
  .input(z.object({
    since: z.date().optional(),
    until: z.date().optional(),
  }))
  .query(async ({ ctx, input }) => {
    const since = input.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const until = input.until ?? new Date();
    // Group patrols by municipalityId, count
    // Group events by municipalityId, count
    // Join with Municipality table for name/province
    // Return: Array<{ municipality: string, province: string, patrolCount: number, eventCount: number }>
  })

// Procedure 2: trend — patrol + event counts per municipality per week/month
municipalityTrend: tenantProcedure
  .input(z.object({ municipalityId: z.string(), period: z.enum(['week', 'month']), count: z.number().max(12).default(6) }))
  .query(async ({ ctx, input }) => {
    // Time-bucket grouping using Prisma raw or multiple date-range queries
    // Return: Array<{ bucket: Date, patrolCount: number, eventCount: number }>
  })

// Procedure 3: protected zone coverage summary
protectedZoneCoverage: tenantProcedure
  .query(async ({ ctx }) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // PatrolCoveredZone count + EventCoveredZone count per ProtectedZone
    // Return: Array<{ zone: string, parentMunicipality: string, patrolCount: number, eventCount: number }>
  })
```

---

## 8. UI Surface

**Component:** `MunicipalityCoverageChart` — a grouped bar chart using Recharts
(already adopted in this codebase). Groups bars by province. X-axis: municipality
names. Y-axis: count. Two bars per municipality: patrols (teal) + events (amber).

**Component:** `ProtectedZoneCard` — a summary card for each protected zone.
Shows patrol count + event count in the last 30 days. If Apo Reef count > 0,
show a "Reef Active" badge. Uses existing shadcn/ui `Card` + `Badge` components.

**Placement:** Both components go on the existing War Room dashboard page
(`apps/web/src/app/(dashboard)/page.tsx`), below the existing KPI cards.

**No new page needed for v1.** A dedicated `/municipality-stats` page is a v2 option.

---

## 9. Municipality Assignment Library (new pure-function module)

New file: `packages/shared/src/lib/municipality-assignment/index.ts`

```typescript
// Signature sketch — build task fills in the implementation

import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import booleanIntersects from '@turf/boolean-intersects';
import { point, polygon } from '@turf/helpers';
import type { LatLon } from '../area-derivation/types';

export interface MunicipalityForAssignment {
  id: string;
  name: string;
  landGeojson: Record<string, unknown>;
  waterGeojson: Record<string, unknown> | null;
}

export interface ProtectedZoneForAssignment {
  id: string;
  name: string;
  geojson: Record<string, unknown>;
}

/**
 * Assign a point to a municipality (Layer 1).
 * Steps: land polygon → water polygon → nearest edge fallback.
 * Returns municipalityId or null.
 */
export function assignMunicipalityToPoint(
  latLon: LatLon,
  municipalities: MunicipalityForAssignment[],
): string | null

/**
 * Assign a track (GeoJSON LineString) to protected zones (Layer 2).
 * Returns array of zone IDs whose polygon the track intersects.
 */
export function assignZonesToTrack(
  trackGeojson: Record<string, unknown>,
  zones: ProtectedZoneForAssignment[],
): string[]

/**
 * Assign a point to protected zones (Layer 2, for events).
 * Returns array of zone IDs whose polygon contains the point.
 */
export function assignZonesToPoint(
  latLon: LatLon,
  zones: ProtectedZoneForAssignment[],
): string[]
```

---

## 10. ER Sync Wiring

**In `syncEvents()` (er-sync.processor.ts):**

After the upsert of each event, add:
```typescript
// Municipality assignment (inline — lat/lon available immediately)
const muniId = await assignEventMunicipality(tenantId, event.id, {
  lat: event.locationLat,
  lon: event.locationLon,
});
// Zone assignment also inline for events
await assignEventZones(tenantId, event.id, { lat: event.locationLat, lon: event.locationLon });
```

`assignEventMunicipality` is a thin wrapper that:
1. Reads all Municipality rows (cached in memory for the sync batch duration)
2. Calls `assignMunicipalityToPoint()`
3. Updates `Event.municipalityId` + `municipalityAssignedAt`
4. Returns the ID

**In `syncPatrols()` (er-sync.processor.ts):**

After the patrol upsert:
```typescript
// Municipality assignment deferred — needs PatrolTrack (materialized separately)
// The existing enqueuePatrolTrackMaterialize job will enqueue municipality-assign
// after the track is materialized. Hook is in patrol-track-materialize.processor.ts.
```

This follows the existing pattern where `enqueuePatrolTrackMaterialize` is already
called after patrol sync. Add a step in the patrol-track materializer that, once the
track is written to DB, enqueues `municipality-assign` with the patrolId.

---

## 11. Backfill Script

File: `scripts/backfill-municipality-assignment.ts`

```
Args:
  --since <ISO date>   Only backfill patrols/events created after this date (default: 2020-01-01)
  --dry-run            Print what would be assigned without writing
  --only <id>          Only backfill for this municipalityId (used when adding a new area)
  --batch <n>          Process in batches of n (default: 100, avoids OOM on large datasets)

Algorithm:
  1. Load all Municipality rows + ProtectedZone rows from DB
  2. Load all distinct municipalities' geojsons
  3. Paginate through Events where municipalityId = null (or --only target):
     - for each event: assignMunicipalityToPoint, assignZonesToPoint
     - bulk upsert EventCoveredZone rows
     - bulk update event.municipalityId
  4. Paginate through PatrolTracks (join Patrol) where Patrol.municipalityId = null:
     - for each track: first-point → assignMunicipalityToPoint; full track → assignZonesToTrack
     - same bulk upserts
  5. Log: N events assigned, M patrols assigned, K skipped (no track yet)
```

**Consistency note:** existing prod patrol data will need this backfill after the
migration deploys. The backfill can run while the app is live — it only writes to
the new nullable columns. A partial run can be resumed with `--since` filtering.

---

## 12. Tests to Add

| Test file | What it tests |
|-----------|--------------|
| `packages/shared/src/lib/municipality-assignment/__tests__/assign-point.test.ts` | Point-in-land-polygon ✓, point-in-water-polygon ✓, nearest fallback ✓, null for unreachable point |
| `packages/shared/src/lib/municipality-assignment/__tests__/assign-zones.test.ts` | Track intersecting zone ✓, point inside zone ✓, track not intersecting ✓ |
| `packages/shared/src/lib/municipality-assignment/__tests__/disambiguation.test.ts` | Verify Roxas PHL IDs don't cross-assign (e.g. a point in Capiz doesn't hit roxas-palawan) |
| `packages/shared/src/lib/municipality-assignment/__tests__/apo-reef.test.ts` | Point at lon 120.47, lat 12.67 → assigned to sablayan municipality AND apo-reef zone |
| `scripts/__tests__/backfill.test.ts` | Dry-run mode produces correct assignment counts; batch pagination works |
| `apps/web/src/server/trpc/routers/__tests__/municipalityCoverage.test.ts` | tRPC procedures return correct schema; empty result for municipality with no patrols |

---

## 13. Apo Reef Boundary Notes

The current `apo-reef-natural-park.geojson` is a 5-vertex rectangular polygon:

```
SW: 120.3961°E, 12.5964°N
NE: 120.5622°E, 12.7464°N
```

This covers the reef atoll and surrounding waters as declared under Senate Bill 2393.
The reef itself (the submerged carbonate structure) is roughly 35 km long and lies
within this box. All patrol tracks and events logged inside this bounding box will
correctly be flagged as "Apo Reef Natural Park" patrols/events.

**Limitation:** The box has slightly more area than the actual park boundary at the
corners. This means points in the seawater corners of the box that are outside the
true reef boundary would be incorrectly flagged. In practice, patrol points in these
corner areas are seawater with no distinct operational significance — the operational
impact is negligible for v1. A detailed WDPA polygon would eliminate this.

**Alternative source note:** WDPA entry 2340 is publicly described at
`https://www.protectedplanet.net/2340`. The GeoJSON polygon requires a free API
token from `https://api.protectedplanet.net/`. To substitute it:
```bash
TOKEN=<your_token> curl "https://api.protectedplanet.net/v3/protected_areas/2340?token=$TOKEN" \
  | jq '.protected_area.geojson' \
  > apps/web/src/data/coverage/apo-reef-natural-park.geojson
```
Then re-run the seed.

---

## 14. Water Derivation Script

File: `scripts/derive-municipal-waters.ts`

```
Purpose: Compute the 15 km seaward water polygon for each municipality.
  These are stored in Municipality.waterGeojson in the DB.
  The union of land + water polygon is what the Layer 1 assignment uses for step 2.

Algorithm:
  1. For each municipality (sorted by area, large first to reduce overlap processing):
     a. Load landGeojson from DB
     b. buffer = turf.buffer(land, 15, { units: 'kilometers' })
     c. For each other municipality that is within 30 km (bbox pre-filter):
        - if turf.booleanIntersects(buffer, otherMuniBuffer):
          buffer = turf.difference(buffer, otherMuniBuffer)
     d. waterGeojson = turf.union(landGeojson, buffer)
     e. Update Municipality.waterGeojson in DB
  2. Log each municipality + area km² of resulting water polygon

Notes:
  - Buffer is computed in WGS84 (turf uses geodesic buffering)
  - The Philippine continental shelf and EEZ mean 15 km covers municipal waters
    under the Local Government Code (RA 7160) territorial sea baseline
  - Adjacent municipalities will have their buffers trimmed to non-overlapping;
    the equidistance midpoint is used (turf.difference gives this automatically
    when both buffers are subtracted from each other in sequence)
  - Apo Reef polygon is NOT affected — it is a protected zone, not a municipality,
    and does not participate in the water derivation
```

---

## 15. Rollout Order (for the build task)

1. **Schema migration** → run locally, confirm all 4 new tables and 2 FK columns
2. **Seed + water derivation** → populate Municipality and ProtectedZone rows
3. **Assignment library** (packages/shared) → pure functions + tests (no DB)
4. **Backfill script** → run against dev DB with --dry-run first, then live
5. **ER sync wiring** → hook into syncEvents inline + patrol-track materializer queue
6. **tRPC router** → add 3 procedures
7. **UI components** → MunicipalityCoverageChart + ProtectedZoneCard
8. **Dashboard integration** → wire components into page.tsx

**Do NOT push to staging until owner signals.** Per standing Promotion Gating Policy,
all work stays on local dev branch `feat/municipality-coverage-stats`.

---

## 16. Open Questions for Owner

1. **Patrol first-point vs. majority-municipality**: Layer 1 assigns a patrol to the
   municipality of its FIRST track point. Should this be "majority of track points"
   instead? (Majority is more accurate for long patrols that span boundaries; first
   point is simpler and more predictable for dispatch-style patrols.)

2. **Nearest-boundary cap for Layer 1 fallback**: The existing `findNearestBoundary`
   defaults to 5 km threshold. For open-ocean patrols far from any municipal water
   polygon, should the nearest-municipality fallback have a cap (e.g. 30 km) or be
   uncapped (always assign to nearest regardless of distance)?

3. **Apo Reef polygon precision**: Accept the OSM Senate Bill 2393 bounding box for
   v1, OR obtain a detailed WDPA polygon (requires a free Protected Planet API token)?

4. **Exclusive accounting toggle for Apo Reef**: Default is ADDITIVE (Apo Reef patrols
   count under Sablayan AND are flagged Apo Reef). Should we flip
   `exclusiveAccounting = true` for Apo Reef so its stats are reported separately?

5. **PSGC codes listed are estimates**: The PSGC codes in `coverage-areas.ts` were
   assigned from knowledge of the Philippine statistical geography classification.
   They should be verified against the PSA PSGC online portal
   (`https://psa.gov.ph/classification/psgc`) before the DB seed runs. The codes are
   used as unique keys — a wrong code won't break functionality but will be misleading
   in exports.

---

## 17. Source Attribution Summary

| Coverage Area | Source | License | URL |
|--------------|--------|---------|-----|
| 11 LGU land polygons | geoBoundaries PHL-ADM3 (NAMRIA/PSA/OCHA, 2020) | CC BY 3.0 IGO | https://github.com/wmgeolab/geoBoundaries |
| Apo Reef Natural Park | OpenStreetMap way 181365709 (SB 2393 boundary) | ODbL 1.0 | https://www.openstreetmap.org/way/181365709 |

Attribution requirement (CC BY 3.0 IGO): display "© geoBoundaries / NAMRIA / PSA /
OCHA" in any public-facing map or data export that uses the municipality polygons.
This applies to the coverage map UI and any PDF/Excel report exports.

ODbL requirement (Apo Reef / OSM): "Data © OpenStreetMap contributors, ODbL 1.0"
on any map displaying the Apo Reef boundary.
