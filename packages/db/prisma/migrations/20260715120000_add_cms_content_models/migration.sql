-- CreateEnum
CREATE TYPE "DocPageKind" AS ENUM ('page', 'folderIndex');

-- CreateEnum
CREATE TYPE "CmsMediaScope" AS ENUM ('docs', 'showcase');

-- CreateTable
CREATE TABLE "cms_doc_pages" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parent_slug" TEXT,
    "kind" "DocPageKind" NOT NULL DEFAULT 'page',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order_in_parent" INTEGER NOT NULL DEFAULT 0,
    "body_markdown" TEXT NOT NULL,
    "body_json" JSONB,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "tenant_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "cms_doc_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cms_showcase_fields" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "value_json" JSONB,
    "tenant_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "cms_showcase_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cms_media" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "scope" "CmsMediaScope" NOT NULL,
    "tenant_id" TEXT,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cms_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cms_doc_pages_slug_key" ON "cms_doc_pages"("slug");

-- CreateIndex
CREATE INDEX "cms_doc_pages_parent_slug_idx" ON "cms_doc_pages"("parent_slug");

-- CreateIndex
CREATE INDEX "cms_doc_pages_tenant_id_idx" ON "cms_doc_pages"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "cms_showcase_fields_key_key" ON "cms_showcase_fields"("key");

-- CreateIndex
CREATE INDEX "cms_showcase_fields_tenant_id_idx" ON "cms_showcase_fields"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "cms_media_key_key" ON "cms_media"("key");

-- CreateIndex
CREATE INDEX "cms_media_tenant_id_idx" ON "cms_media"("tenant_id");

-- CreateIndex
CREATE INDEX "cms_media_scope_idx" ON "cms_media"("scope");
