ALTER TYPE "UserRole" RENAME VALUE 'super_admin' TO 'tenant_manager';
ALTER TYPE "UserRole" RENAME VALUE 'site_admin' TO 'tenant_superadmin';
ALTER TYPE "UserRole" RENAME VALUE 'administrator' TO 'tenant_admin';
CREATE UNIQUE INDEX "one_tenant_superadmin_per_tenant" ON users (tenant_id) WHERE role = 'tenant_superadmin' AND tenant_id IS NOT NULL;
