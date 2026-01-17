-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('FINISHED_GOOD', 'RAW_MATERIAL', 'COMPONENT', 'VARIANT');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "IdentifierType" AS ENUM ('INTERNAL', 'SKU', 'GTIN', 'DPP_URI');

-- CreateEnum
CREATE TYPE "Workspace" AS ENUM ('DESIGN', 'OPERATIONS', 'MARKETING', 'COMPLIANCE');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'IN_REVIEW', 'RELEASED', 'REJECTED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "schema_name" TEXT NOT NULL,
    "stripe_customer_id" TEXT,
    "subscription_tier" TEXT NOT NULL DEFAULT 'starter',
    "subscription_status" TEXT NOT NULL DEFAULT 'active',
    "user_limit" INTEGER NOT NULL DEFAULT 20,
    "storage_limit" BIGINT NOT NULL DEFAULT 536870912000,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "clerk_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_users" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "design_authority" TEXT NOT NULL DEFAULT 'VIEWER',
    "operations_authority" TEXT NOT NULL DEFAULT 'VIEWER',
    "marketing_authority" TEXT NOT NULL DEFAULT 'VIEWER',
    "compliance_authority" TEXT NOT NULL DEFAULT 'VIEWER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "product_type" "ProductType" NOT NULL DEFAULT 'FINISHED_GOOD',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parent_id" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_identifiers" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "type" "IdentifierType" NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_versions" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "workspace" "Workspace" NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT NOT NULL,
    "published_by" TEXT,
    "published_at" TIMESTAMP(3),
    "signature_did" TEXT,
    "signature_jws" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_entries" (
    "id" TEXT NOT NULL,
    "parent_product_id" TEXT NOT NULL,
    "child_product_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unit" TEXT NOT NULL,
    "scrap_rate_pct" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "yield_pct" DECIMAL(65,30) NOT NULL DEFAULT 100,
    "position" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bom_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_schema_name_key" ON "organizations"("schema_name");

-- CreateIndex
CREATE UNIQUE INDEX "users_clerk_id_key" ON "users"("clerk_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organization_users_organization_id_user_id_key" ON "organization_users"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "outbox_events_status_created_at_idx" ON "outbox_events"("status", "created_at");

-- CreateIndex
CREATE INDEX "outbox_events_organization_id_event_type_idx" ON "outbox_events"("organization_id", "event_type");

-- CreateIndex
CREATE INDEX "products_organization_id_idx" ON "products"("organization_id");

-- CreateIndex
CREATE INDEX "products_product_type_idx" ON "products"("product_type");

-- CreateIndex
CREATE INDEX "products_parent_id_idx" ON "products"("parent_id");

-- CreateIndex
CREATE INDEX "product_identifiers_type_value_idx" ON "product_identifiers"("type", "value");

-- CreateIndex
CREATE UNIQUE INDEX "product_identifiers_product_id_type_key" ON "product_identifiers"("product_id", "type");

-- CreateIndex
CREATE INDEX "product_versions_product_id_workspace_idx" ON "product_versions"("product_id", "workspace");

-- CreateIndex
CREATE INDEX "product_versions_status_idx" ON "product_versions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "product_versions_product_id_workspace_version_number_key" ON "product_versions"("product_id", "workspace", "version_number");

-- CreateIndex
CREATE INDEX "bom_entries_parent_product_id_idx" ON "bom_entries"("parent_product_id");

-- CreateIndex
CREATE INDEX "bom_entries_child_product_id_idx" ON "bom_entries"("child_product_id");

-- CreateIndex
CREATE INDEX "bom_entries_version_id_idx" ON "bom_entries"("version_id");

-- CreateIndex
CREATE UNIQUE INDEX "bom_entries_parent_product_id_child_product_id_version_id_key" ON "bom_entries"("parent_product_id", "child_product_id", "version_id");

-- AddForeignKey
ALTER TABLE "organization_users" ADD CONSTRAINT "organization_users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_users" ADD CONSTRAINT "organization_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_identifiers" ADD CONSTRAINT "product_identifiers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_entries" ADD CONSTRAINT "bom_entries_parent_product_id_fkey" FOREIGN KEY ("parent_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_entries" ADD CONSTRAINT "bom_entries_child_product_id_fkey" FOREIGN KEY ("child_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_entries" ADD CONSTRAINT "bom_entries_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "product_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
