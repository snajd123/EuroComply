import { Migration } from '@mikro-orm/migrations';

export class Migration20260122000000 extends Migration {
  override async up(): Promise<void> {
    // Create LTREE extension for hierarchical category paths
    this.addSql('CREATE EXTENSION IF NOT EXISTS ltree;');

    // Organizations table (public schema) - multi-tenant root
    this.addSql(`
      CREATE TABLE "organizations" (
        "id" text PRIMARY KEY,
        "name" text NOT NULL UNIQUE,
        "schema_name" text NOT NULL UNIQUE,
        "clerk_org_id" text UNIQUE,
        "regulatory_advisor_enabled" boolean NOT NULL DEFAULT true,
        "enforcement_mode" text NOT NULL DEFAULT 'SILENT',
        "capture_compliance_in_silent_mode" boolean NOT NULL DEFAULT true,
        "kms_key_arn" text,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW()
      );
    `);

    // Unit definition table - defines measurement units
    this.addSql(`
      CREATE TABLE "unit_definition" (
        "id" text PRIMARY KEY,
        "symbol" text NOT NULL UNIQUE,
        "name" text NOT NULL,
        "unit_system" text NOT NULL,
        "base_unit" text,
        "conversion_factor" real,
        "description" text,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW()
      );
    `);

    // Category table with LTREE for hierarchical paths
    this.addSql(`
      CREATE TABLE "category" (
        "id" text PRIMARY KEY,
        "name" text NOT NULL,
        "description" text,
        "path" ltree NOT NULL,
        "type" text NOT NULL DEFAULT 'BRANCH',
        "depth" integer NOT NULL DEFAULT 0,
        "parent_id" text REFERENCES "category"("id"),
        "default_profile_id" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW()
      );
      CREATE INDEX "category_path_idx" ON "category" USING GIST ("path");
    `);

    // Attribute template table - defines product attributes
    this.addSql(`
      CREATE TABLE "attribute_template" (
        "id" text PRIMARY KEY,
        "key" text NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "type" text NOT NULL,
        "category_id" text NOT NULL REFERENCES "category"("id"),
        "unit_id" text REFERENCES "unit_definition"("id"),
        "rollup_method" text NOT NULL DEFAULT 'NONE',
        "inheritance_rule" text NOT NULL DEFAULT 'INHERIT',
        "validation_rules" jsonb,
        "enum_values" jsonb,
        "default_value" jsonb,
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW()
      );
      CREATE INDEX "attribute_template_key_idx" ON "attribute_template" ("key");
    `);

    // Product table - main product entity
    this.addSql(`
      CREATE TABLE "product" (
        "id" text PRIMARY KEY,
        "name" text NOT NULL,
        "description" text,
        "sku" text,
        "gtin" text,
        "category_id" text NOT NULL REFERENCES "category"("id"),
        "status" text NOT NULL DEFAULT 'DRAFT',
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW()
      );
      CREATE INDEX "product_name_idx" ON "product" ("name");
    `);

    // Product version table - versioned product data
    this.addSql(`
      CREATE TABLE "product_version" (
        "id" text PRIMARY KEY,
        "product_id" text NOT NULL REFERENCES "product"("id"),
        "version" text NOT NULL,
        "status" text NOT NULL DEFAULT 'DRAFT',
        "attribute_values" jsonb,
        "change_summary" text,
        "created_by" text,
        "published_at" timestamptz,
        "published_by" text,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        UNIQUE("product_id", "version")
      );
      CREATE INDEX "product_version_product_idx" ON "product_version" ("product_id");
    `);

    // Outbox event table - transactional outbox pattern
    this.addSql(`
      CREATE TABLE "outbox_event" (
        "id" text PRIMARY KEY,
        "aggregate_type" text NOT NULL,
        "aggregate_id" text NOT NULL,
        "event_type" text NOT NULL,
        "payload" jsonb NOT NULL,
        "status" text NOT NULL DEFAULT 'PENDING',
        "retry_count" integer NOT NULL DEFAULT 0,
        "processed_at" timestamptz,
        "error_message" text,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW()
      );
      CREATE INDEX "outbox_event_aggregate_type_idx" ON "outbox_event" ("aggregate_type");
      CREATE INDEX "outbox_event_aggregate_id_idx" ON "outbox_event" ("aggregate_id");
      CREATE INDEX "outbox_event_event_type_idx" ON "outbox_event" ("event_type");
      CREATE INDEX "outbox_event_status_idx" ON "outbox_event" ("status");
    `);

    // Audit log table - tracks all entity changes
    this.addSql(`
      CREATE TABLE "audit_log" (
        "id" text PRIMARY KEY,
        "entity_type" text NOT NULL,
        "entity_id" text NOT NULL,
        "action" text NOT NULL,
        "user_id" text NOT NULL,
        "old_values" jsonb,
        "new_values" jsonb,
        "ip_address" text,
        "user_agent" text,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW()
      );
      CREATE INDEX "audit_log_entity_type_idx" ON "audit_log" ("entity_type");
      CREATE INDEX "audit_log_entity_id_idx" ON "audit_log" ("entity_id");
      CREATE INDEX "audit_log_action_idx" ON "audit_log" ("action");
      CREATE INDEX "audit_log_user_id_idx" ON "audit_log" ("user_id");
    `);
  }

  override async down(): Promise<void> {
    this.addSql('DROP TABLE IF EXISTS "audit_log" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "outbox_event" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "product_version" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "product" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "attribute_template" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "category" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "unit_definition" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "organizations" CASCADE;');
    this.addSql('DROP EXTENSION IF EXISTS ltree;');
  }
}
