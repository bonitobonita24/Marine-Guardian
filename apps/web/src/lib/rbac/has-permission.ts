/**
 * Authoritative, DB-backed permission resolver for custom roles
 * (tenant-rbac-standard §4). SERVER-ONLY — reads directly from
 * `RolePermission` rows via Prisma. Deny-by-default and hard-clamped:
 * a custom role can NEVER be granted a reserved feature (users, settings,
 * billing, profile — see feature-registry.ts RESERVED_FEATURE_KEYS), and
 * any feature/action with no matching row (or an unknown feature/action
 * combination) resolves to false.
 *
 * Fixed system roles (tenant_manager / tenant_superadmin / tenant_admin and
 * app domain enum roles) are NOT governed by this resolver — they are gated
 * upstream by the existing enum-based RBAC middleware. This resolver only
 * applies to users assigned a `customRoleId` (tenant-rbac-standard §4).
 *
 * Never trust a client-sent permission set — always resolve server-side
 * from the DB via this module.
 */

import type { PrismaClient } from "@marine-guardian/db";
import { featureActions, isGrantableFeature } from "./feature-registry";
import type { FeatureAction } from "./feature-registry";

export interface PermissionRow {
  view: boolean;
  write: boolean;
  update: boolean;
  delete: boolean;
}

/** Permission matrix for a single custom role, keyed by featureKey. */
export type PermissionSummary = Record<string, PermissionRow>;

/** Minimal Prisma surface this module depends on (for easy test mocking). */
export type RolePermissionPrisma = Pick<PrismaClient, "rolePermission">;

/**
 * Loads every matrix row for a custom role, scoped by tenant. Deny-by-default:
 * any feature with no row is simply absent from the returned summary — callers
 * must treat a missing key as fully denied. Rows for a non-grantable
 * (reserved) featureKey are defensively skipped, even if one somehow exists
 * in the database.
 */
export async function resolvePermissions(
  prisma: RolePermissionPrisma,
  tenantId: string,
  customRoleId: string,
): Promise<PermissionSummary> {
  const rows = await prisma.rolePermission.findMany({
    where: { tenantId, customRoleId },
  });

  const summary: PermissionSummary = {};
  for (const row of rows) {
    if (!isGrantableFeature(row.featureKey)) {
      // Defensive hard clamp — a reserved feature must never appear here,
      // even if a stray row exists in the database.
      continue;
    }
    summary[row.featureKey] = {
      view: row.view,
      write: row.write,
      update: row.update,
      delete: row.delete,
    };
  }
  return summary;
}

/**
 * Authoritative permission check for a single feature/action pair.
 *
 * - If `args.customRoleId` is null/undefined, the caller is a fixed-enum
 *   role (not a custom role) — this resolver does not govern them, so it
 *   returns true and defers to the upstream enum-based RBAC gates.
 * - If `args.customRoleId` is set, the check is fully deny-by-default and
 *   hard-clamped:
 *     - reserved (non-grantable) features are ALWAYS denied
 *     - actions the feature does not expose are ALWAYS denied
 *     - a missing matrix row is denied
 *     - otherwise the row's boolean for `action` is authoritative
 */
export async function hasPermission(
  prisma: RolePermissionPrisma,
  args: { tenantId: string; customRoleId: string | null | undefined },
  feature: string,
  action: FeatureAction,
): Promise<boolean> {
  const { tenantId, customRoleId } = args;

  if (customRoleId == null) {
    return true;
  }

  // Hard clamp: reserved features are never grantable via a custom role.
  if (!isGrantableFeature(feature)) {
    return false;
  }

  // Hard clamp: the feature must actually expose this action.
  if (!featureActions(feature).includes(action)) {
    return false;
  }

  const row = await prisma.rolePermission.findUnique({
    where: {
      customRoleId_featureKey: {
        customRoleId,
        featureKey: feature,
      },
    },
  });

  // Defensive tenant check — the row's tenantId must match the caller's
  // tenant even though customRoleId is already tenant-scoped upstream.
  if (!row || row.tenantId !== tenantId) {
    return false;
  }

  switch (action) {
    case "view":
      return row.view;
    case "write":
      return row.write;
    case "update":
      return row.update;
    case "delete":
      return row.delete;
    default:
      return false;
  }
}
