-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('coverage', 'area', 'consolidated', 'detailed', 'rangers', 'patrol_filtered');

-- CreateEnum
CREATE TYPE "PaperSize" AS ENUM ('A4', 'Letter', 'Legal');

-- CreateEnum
CREATE TYPE "ReportExportStatus" AS ENUM ('queued', 'rendering', 'ready', 'failed');

-- CreateTable
CREATE TABLE "report_exports" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "report_type" "ReportType" NOT NULL,
    "params_json" JSONB NOT NULL,
    "paper_size" "PaperSize" NOT NULL DEFAULT 'A4',
    "status" "ReportExportStatus" NOT NULL DEFAULT 'queued',
    "file_path" TEXT,
    "file_size_bytes" INTEGER,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "report_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_exports_tenant_id_idx" ON "report_exports"("tenant_id");

-- CreateIndex
CREATE INDEX "report_exports_tenant_id_status_idx" ON "report_exports"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "report_exports_tenant_id_created_at_idx" ON "report_exports"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
