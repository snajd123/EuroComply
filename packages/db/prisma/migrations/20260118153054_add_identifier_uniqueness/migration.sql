-- DropIndex (replacing with unique constraint)
DROP INDEX IF EXISTS "product_identifiers_type_value_idx";

-- CreateIndex: Add user_id index for organization membership queries
CREATE INDEX "organization_users_user_id_idx" ON "organization_users"("user_id");

-- CreateIndex: Enforce global uniqueness for identifiers per type
-- This ensures GTIN and DPP_URI values are globally unique
CREATE UNIQUE INDEX "product_identifiers_type_value_key" ON "product_identifiers"("type", "value");
