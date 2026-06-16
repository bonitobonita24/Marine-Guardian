-- CreateTable
CREATE TABLE "tenant_er_connections" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "api_token_enc" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unchecked',
    "last_validated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_er_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_er_connections_tenant_id_key" ON "tenant_er_connections"("tenant_id");

-- AddForeignKey
ALTER TABLE "tenant_er_connections" ADD CONSTRAINT "tenant_er_connections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
