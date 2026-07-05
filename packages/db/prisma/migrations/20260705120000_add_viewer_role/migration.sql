-- Additive: add viewer value to the UserRole enum.
-- Safe: ALTER TYPE ADD VALUE does not lock the table and is reversible only
-- by removing rows (cannot drop enum values without recreating the type).
-- viewer is a strictly read-only role (Command Center + Interactive Report
-- Map only) — never added to adminProcedure/coordinatorProcedure/
-- operatorProcedure in rbac.ts, so it is excluded from every mutation gate.
ALTER TYPE "UserRole" ADD VALUE 'viewer';
