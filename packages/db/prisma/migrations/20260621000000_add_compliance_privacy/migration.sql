-- CreateEnum
CREATE TYPE "LawfulBasis" AS ENUM ('consent', 'contract', 'legal_obligation', 'vital_interest', 'public_authority', 'legitimate_interest');

-- CreateEnum
CREATE TYPE "DsrType" AS ENUM ('inform', 'access', 'rectify', 'erasure', 'object', 'port');

-- CreateEnum
CREATE TYPE "DsrStatus" AS ENUM ('received', 'in_progress', 'completed', 'rejected');

-- CreateEnum
CREATE TYPE "BreachStatus" AS ENUM ('detected', 'assessed', 'notified', 'reported', 'closed');

-- CreateEnum
CREATE TYPE "BreachSeverity" AS ENUM ('low', 'medium', 'high');

-- CreateTable
CREATE TABLE "consent_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "lawful_basis" "LawfulBasis" NOT NULL,
    "notice_version" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMP(3),

    CONSTRAINT "consent_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_subject_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "DsrType" NOT NULL,
    "status" "DsrStatus" NOT NULL DEFAULT 'received',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "evidence_url" TEXT,

    CONSTRAINT "data_subject_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breach_notification_records" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "severity" "BreachSeverity" NOT NULL,
    "status" "BreachStatus" NOT NULL DEFAULT 'detected',
    "detected_at" TIMESTAMP(3) NOT NULL,
    "written_report_due_at" TIMESTAMP(3) NOT NULL,
    "npc_notified_at" TIMESTAMP(3),
    "subjects_notified_at" TIMESTAMP(3),
    "written_report_submitted_at" TIMESTAMP(3),
    "affected_user_count" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "recorded_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "breach_notification_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_policies" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "data_category" TEXT NOT NULL,
    "retention_months" INTEGER NOT NULL,
    "basis" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consent_logs_tenant_id_user_id_idx" ON "consent_logs"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "data_subject_requests_tenant_id_user_id_idx" ON "data_subject_requests"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "data_subject_requests_tenant_id_status_idx" ON "data_subject_requests"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "breach_notification_records_tenant_id_status_idx" ON "breach_notification_records"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "breach_notification_records_tenant_id_detected_at_idx" ON "breach_notification_records"("tenant_id", "detected_at");

-- CreateIndex
CREATE INDEX "retention_policies_tenant_id_idx" ON "retention_policies"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "retention_policies_tenant_id_data_category_key" ON "retention_policies"("tenant_id", "data_category");

-- AddForeignKey
ALTER TABLE "consent_logs" ADD CONSTRAINT "consent_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_logs" ADD CONSTRAINT "consent_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breach_notification_records" ADD CONSTRAINT "breach_notification_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breach_notification_records" ADD CONSTRAINT "breach_notification_records_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_policies" ADD CONSTRAINT "retention_policies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

