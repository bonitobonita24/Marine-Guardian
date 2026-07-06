-- Additive: add administrator value to the UserRole enum.
-- Safe: ALTER TYPE ADD VALUE does not lock the table and is reversible only
-- by removing rows (cannot drop enum values without recreating the type).
-- administrator is a full-access role — everything super_admin/site_admin
-- can do app-wide (adminProcedure/coordinatorProcedure/operatorProcedure/
-- reportGenerateProcedure in rbac.ts) — EXCEPT adding/managing user
-- accounts, which stay gated to userManagementProcedure (super_admin +
-- site_admin ONLY). Nav + route gating for /users live in sidebar.tsx +
-- middleware.ts.
ALTER TYPE "UserRole" ADD VALUE 'administrator';
