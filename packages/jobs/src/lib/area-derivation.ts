/**
 * 5.1b — applyAreaDerivation persistence helper.
 *
 * Wraps the pure deriveArea function (5.1a) with database I/O:
 *   1. Load target row (Event | Patrol | FuelEntry) by id with the minimal
 *      fields needed for derivation (tenantId, areaName, and lat/lon if
 *      the entity has coordinates — only Event does).
 *   2. Load enabled AreaBoundary rows scoped to the row's tenant.
 *   3. Call deriveArea (name-match → nearest-fallback → null).
 *   4. Write back: areaBoundaryId on all three entities; areaDerivedAt on
 *      Event + Patrol (FuelEntry schema does not have that column).
 *
 * Returns the deriveArea result so callers (5.1c BullMQ processor,
 * 5.1d sync engine, 5.1e admin re-derive) can log / report matchedVia.
 *
 * NO AuditLog writes here — automatic-derivation contexts (sync engine,
 * worker) have no user. The areaDerivedAt timestamp + matchedVia return
 * value are sufficient observability. User-triggered manual rebuild
 * (5.1e) owns AuditLog because it has ctx.session.userId available.
 *
 * NO transaction wrapping — load+write are independent and idempotent;
 * concurrent derivation of the same row converges (same input → same
 * output → last write wins, no anomaly).
 *
 * Exceptions propagate — findUniqueOrThrow on a bad id is a programmer
 * bug, not a runtime concern.
 *
 * 5.1c relocation note: moved from apps/web/src/server/sync/ to
 * packages/jobs/src/lib/ so the BullMQ worker (which lives in
 * @marine-guardian/jobs) can consume it directly. apps/web continues
 * to consume it via the @marine-guardian/jobs workspace dep (already
 * declared in apps/web/package.json).
 */

import type { ExtendedPrismaClient } from "@marine-guardian/db";
import {
  deriveArea,
  type AreaBoundaryForDerivation,
} from "@marine-guardian/shared/lib/area-derivation";

/**
 * Prisma client type accepted by applyAreaDerivation. Aliased to the
 * tenant-guarded `ExtendedPrismaClient` exported from `@marine-guardian/db`
 * so production callers pass the real client and tests pass a structurally
 * compatible mock (via `as unknown as PrismaClientLike`).
 */
export type PrismaClientLike = ExtendedPrismaClient;

export type AreaDerivationEntity = "event" | "patrol" | "fuelEntry";

export interface AreaDerivationResult {
  areaBoundaryId: string | null;
  matchedVia: "name" | "nearest" | null;
}

export async function applyAreaDerivation(
  prisma: PrismaClientLike,
  entity: AreaDerivationEntity,
  id: string,
): Promise<AreaDerivationResult> {
  // Step 1: load target row.
  let tenantId: string;
  let areaName: string | null;
  let lat: number | null;
  let lon: number | null;

  if (entity === "event") {
    const row = await prisma.event.findUniqueOrThrow({
      where: { id },
      select: {
        tenantId: true,
        areaName: true,
        locationLat: true,
        locationLon: true,
      },
    });
    tenantId = row.tenantId;
    areaName = row.areaName;
    lat = row.locationLat;
    lon = row.locationLon;
  } else if (entity === "patrol") {
    const row = await prisma.patrol.findUniqueOrThrow({
      where: { id },
      select: {
        tenantId: true,
        areaName: true,
      },
    });
    tenantId = row.tenantId;
    areaName = row.areaName;
    lat = null;
    lon = null;
  } else {
    // fuelEntry — schema has areaName as NOT NULL; assign directly (string,
    // never null at runtime — uniform variable typing tolerates it).
    const row = await prisma.fuelEntry.findUniqueOrThrow({
      where: { id },
      select: {
        tenantId: true,
        areaName: true,
      },
    });
    tenantId = row.tenantId;
    areaName = row.areaName;
    lat = null;
    lon = null;
  }

  // Step 2: load enabled boundaries for this tenant.
  const boundaryRows = await prisma.areaBoundary.findMany({
    where: { tenantId, isEnabled: true },
    select: {
      id: true,
      name: true,
      aliases: true,
      isEnabled: true,
      geometryType: true,
      geometryGeojson: true,
    },
  });

  // Step 3: project to AreaBoundaryForDerivation shape.
  // Prisma returns geometryType as the GeometryType enum (string literal
  // 'Polygon' | 'LineString' at runtime); geometryGeojson is Prisma Json
  // (unknown shape) — narrow to Record<string, unknown> for the shared
  // function contract.
  const boundaries: AreaBoundaryForDerivation[] = boundaryRows.map((b) => ({
    id: b.id,
    name: b.name,
    aliases: b.aliases,
    isEnabled: b.isEnabled,
    geometryType: b.geometryType,
    geometryGeojson: b.geometryGeojson as Record<string, unknown>,
  }));

  // Step 4: derive.
  const point = lat !== null && lon !== null ? { lat, lon } : null;
  const result = deriveArea({ areaName, point }, boundaries);

  // Step 5: write back.
  const now = new Date();
  if (entity === "event") {
    await prisma.event.update({
      where: { id },
      data: {
        areaBoundaryId: result.areaBoundaryId,
        areaDerivedAt: now,
      },
    });
  } else if (entity === "patrol") {
    await prisma.patrol.update({
      where: { id },
      data: {
        areaBoundaryId: result.areaBoundaryId,
        areaDerivedAt: now,
      },
    });
  } else {
    // fuelEntry — schema has NO areaDerivedAt column; write only areaBoundaryId.
    await prisma.fuelEntry.update({
      where: { id },
      data: {
        areaBoundaryId: result.areaBoundaryId,
      },
    });
  }

  return {
    areaBoundaryId: result.areaBoundaryId,
    matchedVia: result.matchedVia,
  };
}
