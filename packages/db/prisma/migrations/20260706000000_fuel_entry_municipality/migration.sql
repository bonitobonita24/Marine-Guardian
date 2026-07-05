-- AlterTable
ALTER TABLE "fuel_entries" ADD COLUMN     "municipality_id" TEXT;

-- CreateIndex
CREATE INDEX "fuel_entries_tenant_id_municipality_id_idx" ON "fuel_entries"("tenant_id", "municipality_id");

-- AddForeignKey
ALTER TABLE "fuel_entries" ADD CONSTRAINT "fuel_entries_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
