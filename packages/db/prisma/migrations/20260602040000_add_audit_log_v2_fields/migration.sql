-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('info', 'warning', 'high', 'critical');

-- AlterTable: add v2 fields to audit_logs (all nullable except severity which has default)
ALTER TABLE "audit_logs"
  ADD COLUMN "acting_user_id"             TEXT,
  ADD COLUMN "impersonated_as_tenant_id"  TEXT,
  ADD COLUMN "severity"                   "Severity" NOT NULL DEFAULT 'info',
  ADD COLUMN "user_agent"                 TEXT;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_acting_user_id_fkey"
  FOREIGN KEY ("acting_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_impersonated_as_tenant_id_fkey"
  FOREIGN KEY ("impersonated_as_tenant_id") REFERENCES "tenants"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "audit_logs_acting_user_id_idx" ON "audit_logs"("acting_user_id");
CREATE INDEX "audit_logs_impersonated_as_tenant_id_idx" ON "audit_logs"("impersonated_as_tenant_id");
CREATE INDEX "audit_logs_severity_idx" ON "audit_logs"("severity");
