-- CreateTable: report_templates
-- Additive only — no existing tables altered (safe for migrate deploy with no downtime).
-- layout column is TEXT (app-layer validated via Zod reportLayoutSchema).
-- @@index([tenantId, isDefault]) supports the ≤1-default-per-tenant check in the router.
CREATE TABLE "report_templates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "layout" TEXT NOT NULL,
    "municipal_logo_key" TEXT,
    "partner_logo_key" TEXT,
    "report_title" TEXT NOT NULL,
    "footer_notes" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_templates_tenant_id_idx" ON "report_templates"("tenant_id");

-- CreateIndex
CREATE INDEX "report_templates_tenant_id_is_default_idx" ON "report_templates"("tenant_id", "is_default");

-- AddForeignKey
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
