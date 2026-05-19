-- CreateTable
CREATE TABLE "fuel_entries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "area_name" TEXT NOT NULL,
    "area_boundary_id" TEXT,
    "date_received" DATE NOT NULL,
    "liters" DECIMAL(12,3) NOT NULL,
    "total_price" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "receipt_photo_url" TEXT,
    "notes" TEXT,
    "logged_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fuel_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fuel_entries_tenant_id_idx" ON "fuel_entries"("tenant_id");

-- CreateIndex
CREATE INDEX "fuel_entries_tenant_id_date_received_idx" ON "fuel_entries"("tenant_id", "date_received");

-- CreateIndex
CREATE INDEX "fuel_entries_tenant_id_area_boundary_id_idx" ON "fuel_entries"("tenant_id", "area_boundary_id");

-- AddForeignKey
ALTER TABLE "fuel_entries" ADD CONSTRAINT "fuel_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_entries" ADD CONSTRAINT "fuel_entries_area_boundary_id_fkey" FOREIGN KEY ("area_boundary_id") REFERENCES "area_boundaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_entries" ADD CONSTRAINT "fuel_entries_logged_by_user_id_fkey" FOREIGN KEY ("logged_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
