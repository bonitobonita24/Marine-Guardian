-- CreateTable
CREATE TABLE "municipality_boundary_snapshots" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "municipality_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "previous_geojson" JSONB,
    "replaced_by_user_id" TEXT,
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "municipality_boundary_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "municipality_boundary_snapshots_tenant_id_municipality_id_idx" ON "municipality_boundary_snapshots"("tenant_id", "municipality_id", "kind", "created_at");

-- AddForeignKey
ALTER TABLE "municipality_boundary_snapshots" ADD CONSTRAINT "municipality_boundary_snapshots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipality_boundary_snapshots" ADD CONSTRAINT "municipality_boundary_snapshots_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
