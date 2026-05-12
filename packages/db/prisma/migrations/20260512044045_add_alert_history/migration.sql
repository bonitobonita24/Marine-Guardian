-- CreateTable
CREATE TABLE "alert_history" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "alert_rule_id" TEXT,
    "event_id" TEXT,
    "fired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matched_priority" INTEGER NOT NULL,
    "recipient_count" INTEGER NOT NULL,
    "rule_name_snapshot" TEXT NOT NULL,
    "event_title_snapshot" TEXT NOT NULL,

    CONSTRAINT "alert_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_history_tenant_id_idx" ON "alert_history"("tenant_id");

-- CreateIndex
CREATE INDEX "alert_history_alert_rule_id_idx" ON "alert_history"("alert_rule_id");

-- CreateIndex
CREATE INDEX "alert_history_event_id_idx" ON "alert_history"("event_id");

-- CreateIndex
CREATE INDEX "alert_history_tenant_id_fired_at_idx" ON "alert_history"("tenant_id", "fired_at");

-- AddForeignKey
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_alert_rule_id_fkey" FOREIGN KEY ("alert_rule_id") REFERENCES "alert_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
