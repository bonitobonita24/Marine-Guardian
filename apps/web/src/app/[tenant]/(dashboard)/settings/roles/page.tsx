import { RoleList } from "./_components/role-list";

// Custom-role permission-matrix builder (tenant-rbac-standard §4). Access is
// gated at the edge by middleware.ts (TENANT_ADMIN_AREA_PREFIXES includes
// "/settings", allowing only tenant_manager + tenant_superadmin) — the same
// gate every other /settings sub-page (report-templates, breach) relies on,
// so no additional page-level session check is added here. The tRPC
// customRole router re-enforces the same gate server-side (userManagementProcedure).
export default function RolesPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Custom Roles</h1>
        <p className="text-sm text-muted-foreground">
          Build limited, feature-level roles below the Administrator ceiling. Grant view,
          create, edit, and delete access per feature — Tenant Owner only.
        </p>
      </div>
      <RoleList />
    </div>
  );
}
