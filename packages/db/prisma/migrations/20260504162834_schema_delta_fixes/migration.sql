-- Fix 1: Rename PatrolType enum value seabourn → seaborne
ALTER TYPE "PatrolType" RENAME VALUE 'seabourn' TO 'seaborne';

-- Fix 2: Add currency column to tenants (default IDR)
ALTER TABLE "tenants" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'IDR';

-- Fix 3: Add boat_name column to patrols (nullable)
ALTER TABLE "patrols" ADD COLUMN "boat_name" TEXT;

-- Fix 4: Add tenant_id to patrol_schedules with FK and index
ALTER TABLE "patrol_schedules" ADD COLUMN "tenant_id" TEXT NOT NULL;
ALTER TABLE "patrol_schedules" ADD CONSTRAINT "patrol_schedules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "patrol_schedules_tenant_id_idx" ON "patrol_schedules"("tenant_id");

-- L2: RLS for patrol_schedules (was missing tenant_id before)
ALTER TABLE "patrol_schedules" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_patrol_schedules ON "patrol_schedules"
    USING (tenant_id = current_setting('app.current_tenant_id', true)::text);
ALTER TABLE "patrol_schedules" FORCE ROW LEVEL SECURITY;
