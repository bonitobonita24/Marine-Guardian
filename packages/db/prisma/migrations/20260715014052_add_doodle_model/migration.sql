-- CreateTable
CREATE TABLE "doodles" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "geometry_json" JSONB NOT NULL,
    "view_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doodles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doodles_tenant_id_idx" ON "doodles"("tenant_id");

-- CreateIndex
CREATE INDEX "doodles_tenant_id_created_at_idx" ON "doodles"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "doodles" ADD CONSTRAINT "doodles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doodles" ADD CONSTRAINT "doodles_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
