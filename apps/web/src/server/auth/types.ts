import "next-auth";
import "next-auth/jwt";

/**
 * Coarse per-feature permission row for a custom role, mirrored into the
 * JWT/session for UX gating only (edge middleware + sidebar nav visibility).
 * The DB `RolePermission` matrix (via has-permission.ts resolvePermissions)
 * remains the sole authoritative source for fine-grained CRUD checks —
 * matrixProcedure always re-queries the DB and never trusts this summary.
 */
export interface CustomRolePermissionRow {
  view: boolean;
  write: boolean;
  update: boolean;
  delete: boolean;
}

export type CustomRolePermissionSummary = Record<string, CustomRolePermissionRow>;

declare module "next-auth" {
  interface User {
    tenantId: string | null;
    tenantSlug?: string;
    roles: string[];
    securityVersion: number;
    rememberMe?: boolean;
    customRoleId?: string | null;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      tenantId: string;
      // Path-based tenancy: the authenticated user's own tenant slug (""
      // for super_admin / platform users). The URL slug is the *requested*
      // tenant; this is the *authenticated* tenant. Enforcement compares them.
      tenantSlug: string;
      roles: string[];
      // Custom-role identity + a coarse permission summary, for UX gating
      // only (edge middleware + sidebar nav). Null/undefined when the user
      // is on a fixed system role. See CustomRolePermissionSummary above.
      customRoleId?: string | null;
      customRolePermissions?: CustomRolePermissionSummary | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string | undefined;
    tenantId?: string | undefined;
    tenantSlug?: string | undefined;
    roles?: string[] | undefined;
    securityVersion?: number | undefined;
    expired?: boolean | undefined;
    rememberMe?: boolean | undefined;
    customRoleId?: string | null | undefined;
    customRolePermissions?: CustomRolePermissionSummary | null | undefined;
  }
}
