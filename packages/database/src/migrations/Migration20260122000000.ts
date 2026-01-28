import { Migration } from '@mikro-orm/migrations';

/**
 * Initial database setup - creates all PUBLIC schema tables.
 *
 * Schema Design:
 * - PUBLIC schema: Shared tables (organizations, category, substances, etc.)
 * - TENANT schemas: Per-tenant tables created by TenantProvisioner
 *
 * This migration only creates public schema tables.
 * Tenant tables are created dynamically when organizations are provisioned.
 */
export class Migration20260122000000 extends Migration {
  override async up(): Promise<void> {
    // =====================================================
    // Extensions
    // =====================================================
    this.addSql('CREATE EXTENSION IF NOT EXISTS ltree;');

    // =====================================================
    // Organizations table - multi-tenant root
    // =====================================================
    this.addSql(`
      CREATE TABLE "public"."organizations" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "name" text NOT NULL UNIQUE,
        "slug" varchar(255) NOT NULL UNIQUE,
        "schema_name" text NOT NULL UNIQUE,
        "clerk_org_id" text UNIQUE,
        "cell_id" varchar(255) NOT NULL DEFAULT 'cell_1',
        "subscription_tier" varchar(50) NOT NULL DEFAULT 'STARTER',
        "subscription_status" varchar(50) NOT NULL DEFAULT 'TRIALING',
        "provisioning_status" varchar(50) NOT NULL DEFAULT 'PENDING',
        "provisioning_error" text,
        "regulatory_advisor_enabled" boolean NOT NULL DEFAULT true,
        "enforcement_mode" text NOT NULL DEFAULT 'SILENT',
        "capture_compliance_in_silent_mode" boolean NOT NULL DEFAULT true,
        "kms_key_arn" text
      );
    `);

    // =====================================================
    // API Keys table - programmatic tenant access
    // =====================================================
    this.addSql(`
      CREATE TABLE "public"."api_keys" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "organization_id" text NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
        "key_hash" varchar(64) NOT NULL,
        "key_prefix" varchar(20) NOT NULL,
        "name" varchar(255) NOT NULL,
        "last_used_at" timestamptz,
        "revoked_at" timestamptz,
        "design_authority" text NOT NULL DEFAULT 'NONE',
        "operations_authority" text NOT NULL DEFAULT 'NONE',
        "marketing_authority" text NOT NULL DEFAULT 'NONE',
        "compliance_authority" text NOT NULL DEFAULT 'NONE',
        "is_org_admin" boolean NOT NULL DEFAULT false
      );
    `);
    this.addSql('CREATE INDEX "api_keys_organization_id_idx" ON "public"."api_keys" ("organization_id");');
    this.addSql('CREATE INDEX "api_keys_key_hash_idx" ON "public"."api_keys" ("key_hash");');

    // =====================================================
    // Webhook Events table - tracks incoming webhooks
    // =====================================================
    this.addSql(`
      CREATE TABLE "public"."webhook_events" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "svix_id" text NOT NULL UNIQUE,
        "event_type" text NOT NULL,
        "payload" jsonb NOT NULL,
        "status" text NOT NULL DEFAULT 'PROCESSING',
        "error_message" text,
        "completed_at" timestamptz
      );
    `);
    this.addSql('CREATE INDEX "webhook_events_svix_id_idx" ON "public"."webhook_events" ("svix_id");');
    this.addSql('CREATE INDEX "webhook_events_status_idx" ON "public"."webhook_events" ("status");');

    // =====================================================
    // Unit Definition table - UNECE measurement units
    // =====================================================
    this.addSql(`
      CREATE TABLE "public"."unit_definition" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "code" varchar(10) NOT NULL UNIQUE,
        "name" text NOT NULL,
        "symbol" varchar(10) NOT NULL,
        "system" text NOT NULL,
        "factor" decimal(20, 10) NOT NULL,
        "is_base" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true
      );
    `);
    this.addSql('CREATE INDEX "unit_definition_code_idx" ON "public"."unit_definition" ("code");');
    this.addSql('CREATE INDEX "unit_definition_system_idx" ON "public"."unit_definition" ("system");');

    // =====================================================
    // Category table - system taxonomy (shared, seeded)
    // =====================================================
    this.addSql(`
      CREATE TABLE "public"."category" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "name" text NOT NULL,
        "description" text,
        "path" ltree NOT NULL,
        "type" text NOT NULL DEFAULT 'BRANCH',
        "target_type" text NOT NULL DEFAULT 'PRODUCT',
        "depth" integer NOT NULL DEFAULT 0,
        "parent_id" text REFERENCES "public"."category"("id"),
        "default_profile_id" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "version" integer NOT NULL DEFAULT 1
      );
    `);
    this.addSql('CREATE INDEX "category_path_idx" ON "public"."category" USING GIST ("path");');
    this.addSql('CREATE INDEX "category_parent_id_idx" ON "public"."category" ("parent_id");');

    // =====================================================
    // Substance table - REACH/SVHC substances
    // =====================================================
    this.addSql(`
      CREATE TABLE "public"."substance" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "cas_number" varchar(20) NOT NULL UNIQUE,
        "ec_number" varchar(20),
        "primary_name" text NOT NULL,
        "description" text,
        "molecular_weight" decimal(12, 4),
        "molecular_formula" varchar(500),
        "is_svhc" boolean NOT NULL DEFAULT false,
        "requires_authorization" boolean NOT NULL DEFAULT false,
        "is_restricted" boolean NOT NULL DEFAULT false,
        "restriction_conditions" text,
        "sunset_date" date,
        "latest_application_date" date,
        "echa_url" text,
        "source_version" varchar(50),
        "is_active" boolean NOT NULL DEFAULT true
      );
    `);
    this.addSql('CREATE INDEX "substance_cas_number_idx" ON "public"."substance" ("cas_number");');
    this.addSql('CREATE INDEX "substance_ec_number_idx" ON "public"."substance" ("ec_number");');
    this.addSql('CREATE INDEX "substance_primary_name_idx" ON "public"."substance" ("primary_name");');
    this.addSql('CREATE INDEX "substance_is_svhc_idx" ON "public"."substance" ("is_svhc") WHERE "is_svhc" = true;');
    this.addSql('CREATE INDEX "substance_requires_auth_idx" ON "public"."substance" ("requires_authorization") WHERE "requires_authorization" = true;');
    this.addSql('CREATE INDEX "substance_is_restricted_idx" ON "public"."substance" ("is_restricted") WHERE "is_restricted" = true;');

    // =====================================================
    // Substance Alias table - alternative names
    // =====================================================
    this.addSql(`
      CREATE TABLE "public"."substance_alias" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "substance_id" text NOT NULL REFERENCES "public"."substance"("id") ON DELETE CASCADE,
        "name" text NOT NULL,
        "type" varchar(20) NOT NULL,
        "language" varchar(10) NOT NULL DEFAULT 'en',
        UNIQUE ("substance_id", "name")
      );
    `);
    this.addSql('CREATE INDEX "substance_alias_substance_id_idx" ON "public"."substance_alias" ("substance_id");');
    this.addSql('CREATE INDEX "substance_alias_name_idx" ON "public"."substance_alias" ("name");');

    // =====================================================
    // Regulatory List table - versioned regulatory lists
    // =====================================================
    this.addSql(`
      CREATE TABLE "public"."regulatory_list" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "code" text NOT NULL,
        "name" text NOT NULL,
        "source" text NOT NULL,
        "version" text NOT NULL,
        "effective_date" timestamptz NOT NULL,
        "superseded_date" timestamptz,
        "is_current_version" boolean NOT NULL DEFAULT true,
        "allow_tenant_exemption" boolean NOT NULL DEFAULT true,
        "source_url" text,
        "description" text,
        "previous_version_id" text REFERENCES "public"."regulatory_list"("id"),
        CONSTRAINT "uq_regulatory_list_code_version" UNIQUE ("code", "version")
      );
    `);
    this.addSql('CREATE INDEX "idx_regulatory_list_code" ON "public"."regulatory_list" ("code");');
    this.addSql('CREATE INDEX "idx_regulatory_list_current" ON "public"."regulatory_list" ("code") WHERE "is_current_version" = true;');

    // =====================================================
    // Regulatory List Entry table - substances on lists
    // =====================================================
    this.addSql(`
      CREATE TABLE "public"."regulatory_list_entry" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "list_id" text NOT NULL REFERENCES "public"."regulatory_list"("id") ON DELETE CASCADE,
        "substance_id" text NOT NULL REFERENCES "public"."substance"("id"),
        "cas_number_snapshot" text NOT NULL,
        "substance_name_snapshot" text NOT NULL,
        "operator" text NOT NULL CHECK ("operator" IN ('GT', 'GTE', 'LT', 'LTE', 'EQ', 'PRESENT', 'ABSENT')),
        "compare_value" decimal(18, 6),
        "issue_type" text NOT NULL,
        "severity" text NOT NULL CHECK ("severity" IN ('BLOCKER', 'WARNING', 'INFO')),
        "stoichiometric_factor" decimal(10, 6),
        "conditions" jsonb,
        "legal_reference" text,
        "notes" text,
        CONSTRAINT "uq_regulatory_list_entry_list_substance" UNIQUE ("list_id", "substance_id")
      );
    `);
    this.addSql('CREATE INDEX "idx_regulatory_list_entry_list" ON "public"."regulatory_list_entry" ("list_id");');
    this.addSql('CREATE INDEX "idx_regulatory_list_entry_substance" ON "public"."regulatory_list_entry" ("substance_id");');
    this.addSql('CREATE INDEX "idx_regulatory_list_entry_issue_type" ON "public"."regulatory_list_entry" ("issue_type");');

    // =====================================================
    // Category Regulatory List table - links categories to lists
    // =====================================================
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "public"."category_regulatory_list" (
        "id" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "category_id" text NOT NULL REFERENCES "public"."category"("id") ON DELETE CASCADE,
        "regulatory_list_id" text NOT NULL REFERENCES "public"."regulatory_list"("id") ON DELETE CASCADE,
        "requirement" text NOT NULL CHECK ("requirement" IN ('MANDATORY', 'RECOMMENDED', 'INFORMATIONAL')),
        "priority" smallint NOT NULL DEFAULT 0,
        "is_exclusion" boolean NOT NULL DEFAULT false,
        "compare_value_override" numeric(5,4),
        "allow_tenant_exemption" boolean NOT NULL DEFAULT true,
        CONSTRAINT "category_regulatory_list_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "uq_category_regulatory_list" UNIQUE ("category_id", "regulatory_list_id")
      );
    `);
    this.addSql('CREATE INDEX IF NOT EXISTS "idx_cat_reg_list_category" ON "public"."category_regulatory_list" ("category_id");');
    this.addSql('CREATE INDEX IF NOT EXISTS "idx_cat_reg_list_list" ON "public"."category_regulatory_list" ("regulatory_list_id");');

    // =====================================================
    // Regulation and Requirement Enums
    // =====================================================
    this.addSql(`CREATE TYPE regulation_status AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');`);
    this.addSql(`CREATE TYPE requirement_type AS ENUM ('ATTRIBUTE_CHECK', 'SUBSTANCE_SCREEN', 'CALCULATED_CHECK', 'DECLARATION');`);
    this.addSql(`CREATE TYPE requirement_severity AS ENUM ('BLOCKER', 'WARNING', 'INFO');`);

    // =====================================================
    // Regulation table - regulations like REACH, RoHS, CLP
    // =====================================================
    this.addSql(`
      CREATE TABLE "public"."regulation" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "code" text NOT NULL UNIQUE,
        "name" text NOT NULL,
        "description" text,
        "status" regulation_status NOT NULL DEFAULT 'DRAFT',
        "version" text,
        "effective_date" date,
        "source_url" text,
        "superseded_by_id" text REFERENCES "public"."regulation"("id"),
        "archived_at" timestamptz,
        "archive_reason" text,
        "metadata" jsonb
      );
    `);
    this.addSql('CREATE INDEX "idx_regulation_status" ON "public"."regulation" ("status");');
    this.addSql('CREATE INDEX "idx_regulation_code" ON "public"."regulation" ("code");');

    // =====================================================
    // Requirement table - compliance requirements per regulation
    // =====================================================
    this.addSql(`
      CREATE TABLE "public"."requirement" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "regulation_id" text NOT NULL REFERENCES "public"."regulation"("id") ON DELETE CASCADE,
        "code" text NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "type" requirement_type NOT NULL,
        "severity" requirement_severity NOT NULL DEFAULT 'WARNING',
        "attribute_template_key" text,
        "substance_list_id" text,
        "calculation_formula" text,
        "handler_config" jsonb,
        "legal_reference" text,
        "allow_tenant_exemption" boolean NOT NULL DEFAULT true,
        "sort_order" int NOT NULL DEFAULT 0,
        UNIQUE("regulation_id", "code")
      );
    `);
    this.addSql('CREATE INDEX "idx_requirement_regulation" ON "public"."requirement" ("regulation_id");');
    this.addSql('CREATE INDEX "idx_requirement_type" ON "public"."requirement" ("type");');

    // =====================================================
    // Seed Version table - tracks seeded data versions
    // =====================================================
    this.addSql(`
      CREATE TABLE "public"."seed_version" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "name" varchar(100) NOT NULL UNIQUE,
        "version" varchar(50) NOT NULL,
        "source_checksum" varchar(100),
        "seeded_at" timestamptz NOT NULL,
        "record_count" integer NOT NULL DEFAULT 0
      );
    `);
    this.addSql('CREATE INDEX "seed_version_name_idx" ON "public"."seed_version" ("name");');

    // =====================================================
    // Outbox Event table - transactional outbox pattern
    // (exists in both public and tenant schemas)
    // =====================================================
    this.addSql(`
      CREATE TABLE "public"."outbox_event" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "aggregate_type" text NOT NULL,
        "aggregate_id" text NOT NULL,
        "event_type" text NOT NULL,
        "payload" jsonb NOT NULL,
        "status" text NOT NULL DEFAULT 'PENDING',
        "retry_count" integer NOT NULL DEFAULT 0,
        "processed_at" timestamptz,
        "error_message" text
      );
    `);
    this.addSql('CREATE INDEX "outbox_event_aggregate_type_idx" ON "public"."outbox_event" ("aggregate_type");');
    this.addSql('CREATE INDEX "outbox_event_aggregate_id_idx" ON "public"."outbox_event" ("aggregate_id");');
    this.addSql('CREATE INDEX "outbox_event_event_type_idx" ON "public"."outbox_event" ("event_type");');
    this.addSql('CREATE INDEX "outbox_event_status_idx" ON "public"."outbox_event" ("status");');
  }

  override async down(): Promise<void> {
    // Drop in reverse dependency order
    this.addSql('DROP TABLE IF EXISTS "public"."outbox_event" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."seed_version" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."requirement" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."regulation" CASCADE;');
    this.addSql('DROP TYPE IF EXISTS requirement_severity;');
    this.addSql('DROP TYPE IF EXISTS requirement_type;');
    this.addSql('DROP TYPE IF EXISTS regulation_status;');
    this.addSql('DROP TABLE IF EXISTS "public"."category_regulatory_list" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."regulatory_list_entry" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."regulatory_list" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."substance_alias" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."substance" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."category" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."unit_definition" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."webhook_events" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."api_keys" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."organizations" CASCADE;');
    this.addSql('DROP EXTENSION IF EXISTS ltree;');
  }
}
