-- AddColumn: acknowledgedAt and acknowledgedBy to AlertHistory (additive, nullable)
-- Migration: 20260621100000_add_alert_history_acknowledgement
-- Closes: WHAT_OWNER_DECISIONS — Alert ACK feature (owner-approved 2026-06-21)

ALTER TABLE "alert_history" ADD COLUMN "acknowledged_at" TIMESTAMP(3);
ALTER TABLE "alert_history" ADD COLUMN "acknowledged_by" TEXT;

-- Index to support efficient unacknowledged-count queries (WHERE acknowledged_at IS NULL)
CREATE INDEX "alert_history_tenant_id_acknowledged_at_idx" ON "alert_history"("tenant_id", "acknowledged_at");
