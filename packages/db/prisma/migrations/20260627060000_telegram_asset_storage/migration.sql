-- Telegram asset storage for EarthRanger event attachments.
-- Adds a per-tenant Telegram channel mapping + an event_assets table that records
-- where each ER file (er_file_id) now lives in Telegram so the app can fetch it back.

-- Per-tenant Telegram channel (one channel per tenant).
ALTER TABLE "tenants" ADD COLUMN "telegram_channel_id" TEXT;

-- Archived-asset ledger.
CREATE TABLE "event_assets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "er_file_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "file_type" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "telegram_message_id" BIGINT,
    "telegram_file_id" TEXT,
    "uploaded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_assets_tenant_id_er_file_id_key" ON "event_assets"("tenant_id", "er_file_id");
CREATE INDEX "event_assets_tenant_id_idx" ON "event_assets"("tenant_id");
CREATE INDEX "event_assets_event_id_idx" ON "event_assets"("event_id");

ALTER TABLE "event_assets" ADD CONSTRAINT "event_assets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_assets" ADD CONSTRAINT "event_assets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
