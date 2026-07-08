/**
 * backfill-municipality-assignment.ts
 *
 * One-shot backfill script. Assigns municipalityId + PatrolCoveredZone /
 * EventCoveredZone rows for all existing patrols and events that have
 * a location but no municipalityId yet.
 *
 * Usage (from monorepo root):
 *   DATABASE_URL=... npx tsx scripts/backfill-municipality-assignment.ts
 *
 * Or with the dev env:
 *   source .env.dev && npx tsx scripts/backfill-municipality-assignment.ts
 *
 * Safe to re-run: upserts are idempotent. Rows already assigned are skipped
 * (WHERE municipalityId IS NULL) unless --force is passed.
 *
 * The script operates on ALL tenants in the database.
 */

import { PrismaClient } from "@prisma/client";
import {
  assignMunicipalityToPoint,
  assignZonesToPoint,
  assignZonesToTrack,
} from "../packages/shared/src/lib/municipality-assignment/index.js";

const prisma = new PrismaClient();
const FORCE = process.argv.includes("--force");

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
  console.log(`[backfill] ${String(tenants.length)} tenant(s) found.`);

  for (const tenant of tenants) {
    console.log(`\n[backfill] Tenant: ${tenant.slug}`);

    const [municipalities, zones] = await Promise.all([
      prisma.municipality.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, slug: true, name: true, boundaryGeojson: true, waterGeojson: true },
      }),
      prisma.protectedZone.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, slug: true, name: true, boundaryGeojson: true },
      }),
    ]);

    if (municipalities.length === 0) {
      console.log("  ⚠ No municipalities seeded — run seed first.");
      continue;
    }

    console.log(`  ${String(municipalities.length)} municipalities, ${String(zones.length)} protected zones`);

    // ── Events ───────────────────────────────────────────────────────────────
    const events = await prisma.event.findMany({
      where: {
        tenantId: tenant.id,
        locationLat: { not: null },
        locationLon: { not: null },
        ...(FORCE ? {} : { municipalityId: null }),
      },
      select: { id: true, locationLat: true, locationLon: true },
    });

    console.log(`  Events to backfill: ${String(events.length)}`);
    const now = new Date();
    let eventAssigned = 0;
    let eventSkipped = 0;

    for (const event of events) {
      if (event.locationLat == null || event.locationLon == null) {
        eventSkipped++;
        continue;
      }
      const point = { lat: event.locationLat, lon: event.locationLon };
      const municipalityId = assignMunicipalityToPoint(point, municipalities);
      const zoneIds = assignZonesToPoint(point, zones);

      await prisma.event.update({
        where: { id: event.id },
        data: { municipalityId, municipalityAssignedAt: now },
      });

      for (const protectedZoneId of zoneIds) {
        await prisma.eventCoveredZone.upsert({
          where: { eventId_protectedZoneId: { eventId: event.id, protectedZoneId } },
          create: { tenantId: tenant.id, eventId: event.id, protectedZoneId, assignedAt: now },
          update: { assignedAt: now },
        });
      }
      eventAssigned++;
    }
    console.log(`  Events: ${String(eventAssigned)} assigned, ${String(eventSkipped)} skipped (no location)`);

    // ── Patrols ──────────────────────────────────────────────────────────────
    const patrols = await prisma.patrol.findMany({
      where: {
        tenantId: tenant.id,
        startLocationLat: { not: null },
        startLocationLon: { not: null },
        ...(FORCE ? {} : { municipalityId: null }),
      },
      select: {
        id: true,
        startLocationLat: true,
        startLocationLon: true,
        track: { select: { trackGeojson: true } },
      },
    });

    console.log(`  Patrols to backfill: ${String(patrols.length)}`);
    let patrolAssigned = 0;
    let patrolSkipped = 0;

    for (const patrol of patrols) {
      if (patrol.startLocationLat == null || patrol.startLocationLon == null) {
        patrolSkipped++;
        continue;
      }
      const point = { lat: patrol.startLocationLat, lon: patrol.startLocationLon };
      const municipalityId = assignMunicipalityToPoint(point, municipalities);

      const zoneIds = patrol.track?.trackGeojson
        ? assignZonesToTrack(patrol.track.trackGeojson, zones)
        : assignZonesToPoint(point, zones);

      await prisma.patrol.update({
        where: { id: patrol.id },
        data: { municipalityId, municipalityAssignedAt: now },
      });

      for (const protectedZoneId of zoneIds) {
        await prisma.patrolCoveredZone.upsert({
          where: { patrolId_protectedZoneId: { patrolId: patrol.id, protectedZoneId } },
          create: { tenantId: tenant.id, patrolId: patrol.id, protectedZoneId, assignedAt: now },
          update: { assignedAt: now },
        });
      }
      patrolAssigned++;
    }
    console.log(`  Patrols: ${String(patrolAssigned)} assigned, ${String(patrolSkipped)} skipped (no start location)`);
  }

  console.log("\n[backfill] Done.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e: unknown) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
