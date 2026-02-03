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
    // Substance table - chemical substances with CAS/EC numbers
    // Regulatory status is tracked via SubstanceListEntry (GSR)
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
        "smiles" text,
        "inchi_key" varchar(27),
        "iupac_name" text,
        "echa_url" text,
        "source_version" varchar(50),
        "is_active" boolean NOT NULL DEFAULT true
      );
    `);
    this.addSql('CREATE INDEX "substance_cas_number_idx" ON "public"."substance" ("cas_number");');
    this.addSql('CREATE INDEX "substance_ec_number_idx" ON "public"."substance" ("ec_number");');
    this.addSql('CREATE INDEX "substance_primary_name_idx" ON "public"."substance" ("primary_name");');
    this.addSql('CREATE INDEX IF NOT EXISTS "substance_inchi_key_idx" ON "public"."substance" ("inchi_key") WHERE "inchi_key" IS NOT NULL;');

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
    // CategoryRegulation junction table - links categories to regulations
    // =====================================================
    this.addSql(`
      CREATE TABLE "public"."category_regulation" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "category_id" text NOT NULL REFERENCES "public"."category"("id") ON DELETE CASCADE,
        "regulation_id" text NOT NULL REFERENCES "public"."regulation"("id") ON DELETE CASCADE,
        "added_at" timestamptz NOT NULL DEFAULT NOW(),
        "added_by" text,
        UNIQUE("category_id", "regulation_id")
      );
    `);
    this.addSql('CREATE INDEX "idx_category_regulation_category" ON "public"."category_regulation"("category_id");');
    this.addSql('CREATE INDEX "idx_category_regulation_regulation" ON "public"."category_regulation"("regulation_id");');

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
    // Staging tables for AI Regulation Ingestor
    // =====================================================

    // Staging Regulation - pending review
    this.addSql(`
      CREATE TABLE "public"."staging_regulation" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "code" text NOT NULL,
        "name" text NOT NULL,
        "source_url" text NOT NULL,
        "source_type" text NOT NULL,
        "primary_payload" jsonb NOT NULL,
        "shadow_payload" jsonb,
        "regulation_metadata" jsonb,
        "status" text NOT NULL DEFAULT 'PENDING',
        "reviewed_by" text,
        "approved_at" timestamptz,
        "rejection_reason" text,
        "published_regulation_id" text REFERENCES "public"."regulation"("id"),
        "pdf_file_id" text
      );
    `);
    this.addSql('CREATE INDEX "idx_staging_regulation_status" ON "public"."staging_regulation" ("status");');
    this.addSql('CREATE INDEX "idx_staging_regulation_code" ON "public"."staging_regulation" ("code");');

    // Consensus status type
    this.addSql(`CREATE TYPE consensus_status AS ENUM ('MATCH', 'CONFLICT', 'LOW_CONFIDENCE', 'SHADOW_MISSING');`);

    // Staging Requirement - per-requirement review
    this.addSql(`
      CREATE TABLE "public"."staging_requirement" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "staging_regulation_id" text NOT NULL REFERENCES "public"."staging_regulation"("id") ON DELETE CASCADE,
        "code" text NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "substance_name" text,
        "cas_number" text,
        "ec_number" text,
        "operator" text,
        "threshold_value" decimal,
        "unit" text,
        "scope" jsonb,
        "legal_reference" text,
        "pdf_coordinates" jsonb,
        "type" requirement_type NOT NULL,
        "severity" requirement_severity NOT NULL DEFAULT 'WARNING',
        "confidence_score" decimal,
        "reasoning" text,
        "allows_exemption" boolean NOT NULL DEFAULT true,
        "exemption_conditions" text,
        "consensus_status" consensus_status NOT NULL,
        "conflict_details" jsonb,
        "suggested_categories" jsonb,
        "is_approved" boolean NOT NULL DEFAULT false,
        "approved_by" text,
        "approved_at" timestamptz
      );
    `);
    this.addSql('CREATE INDEX "idx_staging_requirement_regulation" ON "public"."staging_requirement" ("staging_regulation_id");');
    this.addSql('CREATE INDEX "idx_staging_requirement_consensus" ON "public"."staging_requirement" ("consensus_status");');

    // Ingestion action type
    this.addSql(`CREATE TYPE ingestion_action AS ENUM ('EXTRACTED', 'VALIDATED', 'CONFLICT_DETECTED', 'APPROVED', 'REJECTED', 'EDITED', 'PUBLISHED');`);

    // Ingestion Audit Log
    this.addSql(`
      CREATE TABLE "public"."ingestion_audit_log" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "staging_regulation_id" text NOT NULL REFERENCES "public"."staging_regulation"("id") ON DELETE CASCADE,
        "staging_requirement_id" text REFERENCES "public"."staging_requirement"("id") ON DELETE CASCADE,
        "action" ingestion_action NOT NULL,
        "actor_id" text,
        "details" jsonb,
        "timestamp" timestamptz NOT NULL DEFAULT NOW()
      );
    `);
    this.addSql('CREATE INDEX "idx_ingestion_audit_regulation" ON "public"."ingestion_audit_log" ("staging_regulation_id");');
    this.addSql('CREATE INDEX "idx_ingestion_audit_action" ON "public"."ingestion_audit_log" ("action");');

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

    // =====================================================
    // GSR (Global Substance Registry) Enhancement
    // =====================================================

    // Enhanced Substance fields for chemical identification
    this.addSql(`
      ALTER TABLE "public"."substance"
      ADD COLUMN IF NOT EXISTS "smiles" text,
      ADD COLUMN IF NOT EXISTS "inchi_key" varchar(27),
      ADD COLUMN IF NOT EXISTS "iupac_name" text;
    `);
    this.addSql('CREATE INDEX IF NOT EXISTS "substance_inchi_key_idx" ON "public"."substance" ("inchi_key") WHERE "inchi_key" IS NOT NULL;');

    // Enhanced SubstanceAlias fields for name normalization and source tracking
    this.addSql(`
      ALTER TABLE "public"."substance_alias"
      ADD COLUMN IF NOT EXISTS "name_normalized" text,
      ADD COLUMN IF NOT EXISTS "source" varchar(20) NOT NULL DEFAULT 'MANUAL';
    `);
    this.addSql('CREATE INDEX IF NOT EXISTS "substance_alias_name_normalized_idx" ON "public"."substance_alias" ("name_normalized");');

    // pg_trgm extension for fuzzy matching on substance names
    this.addSql('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
    this.addSql(`
      CREATE INDEX IF NOT EXISTS "substance_alias_name_trgm_idx"
        ON "public"."substance_alias"
        USING gin ("name" gin_trgm_ops);
    `);

    // =====================================================
    // Registry Source table - tracks external data sources
    // =====================================================
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "public"."registry_source" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "name" varchar(50) NOT NULL UNIQUE,
        "version" varchar(50),
        "last_synced_at" timestamptz NOT NULL DEFAULT NOW(),
        "record_count" int,
        "source_url" text
      );
    `);
    this.addSql('CREATE INDEX IF NOT EXISTS "registry_source_name_idx" ON "public"."registry_source" ("name");');

    // =====================================================
    // Regulatory List table - SVHC, REACH Annex, RoHS, etc.
    // =====================================================
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "public"."regulatory_list" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "code" varchar(100) NOT NULL UNIQUE,
        "name" text NOT NULL,
        "jurisdiction" varchar(20) NOT NULL,
        "publisher" varchar(50) NOT NULL,
        "description" text,
        "source_url" text,
        "version" varchar(50),
        "last_updated_at" timestamptz
      );
    `);
    this.addSql('CREATE INDEX IF NOT EXISTS "regulatory_list_code_idx" ON "public"."regulatory_list" ("code");');
    this.addSql('CREATE INDEX IF NOT EXISTS "regulatory_list_jurisdiction_idx" ON "public"."regulatory_list" ("jurisdiction");');

    // =====================================================
    // Substance Group table - chemical families/groups
    // =====================================================
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "public"."substance_group" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "code" varchar(100) NOT NULL UNIQUE,
        "name" text NOT NULL,
        "description" text,
        "parent_group_id" text REFERENCES "public"."substance_group"("id")
      );
    `);
    this.addSql('CREATE INDEX IF NOT EXISTS "substance_group_code_idx" ON "public"."substance_group" ("code");');

    // =====================================================
    // Substance Group Member table - substances in groups
    // =====================================================
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "public"."substance_group_member" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "group_id" text NOT NULL REFERENCES "public"."substance_group"("id") ON DELETE CASCADE,
        "substance_id" text NOT NULL REFERENCES "public"."substance"("id") ON DELETE CASCADE,
        "inheritance_type" varchar(20) NOT NULL,
        "notes" text,
        UNIQUE ("group_id", "substance_id")
      );
    `);
    this.addSql('CREATE INDEX IF NOT EXISTS "substance_group_member_group_idx" ON "public"."substance_group_member" ("group_id");');
    this.addSql('CREATE INDEX IF NOT EXISTS "substance_group_member_substance_idx" ON "public"."substance_group_member" ("substance_id");');

    // =====================================================
    // Substance List Entry table - substances on regulatory lists
    // =====================================================
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "public"."substance_list_entry" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "substance_id" text REFERENCES "public"."substance"("id") ON DELETE CASCADE,
        "substance_group_id" text REFERENCES "public"."substance_group"("id") ON DELETE CASCADE,
        "regulatory_list_id" text NOT NULL REFERENCES "public"."regulatory_list"("id") ON DELETE CASCADE,
        "status" varchar(20) NOT NULL,
        "listing_date" date,
        "effective_date" date,
        "sunset_date" date,
        "threshold" decimal(10, 6),
        "threshold_unit" varchar(30),
        "threshold_operator" varchar(10),
        "scopes" text[] NOT NULL,
        "scope_raw" text,
        "conditions" jsonb,
        "source_reference" text,
        "source_url" text,
        CHECK ("substance_id" IS NOT NULL OR "substance_group_id" IS NOT NULL)
      );
    `);
    this.addSql('CREATE INDEX IF NOT EXISTS "substance_list_entry_substance_idx" ON "public"."substance_list_entry" ("substance_id");');
    this.addSql('CREATE INDEX IF NOT EXISTS "substance_list_entry_group_idx" ON "public"."substance_list_entry" ("substance_group_id");');
    this.addSql('CREATE INDEX IF NOT EXISTS "substance_list_entry_list_idx" ON "public"."substance_list_entry" ("regulatory_list_id");');

    // =====================================================
    // Unresolved Substance table - unknown substances queue
    // =====================================================
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "public"."unresolved_substance" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "raw_name" text NOT NULL,
        "raw_cas_number" varchar(50),
        "source" varchar(30) NOT NULL,
        "occurrence_count" int NOT NULL DEFAULT 1,
        "status" varchar(30) NOT NULL,
        "resolution_type" varchar(30),
        "resolved_substance_id" text REFERENCES "public"."substance"("id"),
        "resolved_at" timestamptz,
        "resolved_by" varchar(255)
      );
    `);
    this.addSql('CREATE INDEX IF NOT EXISTS "unresolved_substance_raw_name_idx" ON "public"."unresolved_substance" ("raw_name");');
    this.addSql('CREATE INDEX IF NOT EXISTS "unresolved_substance_status_idx" ON "public"."unresolved_substance" ("status");');

    // =====================================================
    // Blind Disclosure Request table - supplier disclosure workflow
    // =====================================================
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "public"."blind_disclosure_request" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "unresolved_substance_id" text NOT NULL REFERENCES "public"."unresolved_substance"("id") ON DELETE CASCADE,
        "supplier_id" varchar(100) NOT NULL,
        "product_id" varchar(100),
        "requested_at" timestamptz NOT NULL DEFAULT NOW(),
        "requested_by" varchar(255) NOT NULL,
        "status" varchar(30) NOT NULL,
        "secure_token" varchar(255) NOT NULL,
        "token_expires_at" timestamptz NOT NULL,
        "disclosed_cas_number" text,
        "disclosed_at" timestamptz,
        "attestation_type" varchar(30),
        "attestation_document" text
      );
    `);
    this.addSql('CREATE INDEX IF NOT EXISTS "blind_disclosure_unresolved_idx" ON "public"."blind_disclosure_request" ("unresolved_substance_id");');
    this.addSql('CREATE INDEX IF NOT EXISTS "blind_disclosure_supplier_idx" ON "public"."blind_disclosure_request" ("supplier_id");');
    this.addSql('CREATE INDEX IF NOT EXISTS "blind_disclosure_token_idx" ON "public"."blind_disclosure_request" ("secure_token");');

    // =====================================================
    // CLP Identity Fields on Substance table
    // =====================================================
    this.addSql(`
      ALTER TABLE "public"."substance"
      ADD COLUMN IF NOT EXISTS "index_number" varchar(20),
      ADD COLUMN IF NOT EXISTS "clp_version" varchar(20);
    `);
    this.addSql('CREATE INDEX IF NOT EXISTS "substance_index_number_idx" ON "public"."substance" ("index_number");');

    // =====================================================
    // Golden Record Fields on Substance table
    // =====================================================
    this.addSql(`
      ALTER TABLE "public"."substance"
      ADD COLUMN IF NOT EXISTS "dtxsid" varchar(20),
      ADD COLUMN IF NOT EXISTS "qc_level" smallint;
    `);
    this.addSql('CREATE UNIQUE INDEX IF NOT EXISTS "substance_dtxsid_idx" ON "public"."substance" ("dtxsid") WHERE "dtxsid" IS NOT NULL;');
    this.addSql('DROP INDEX IF EXISTS "public"."substance_inchi_key_idx";');
    this.addSql('CREATE UNIQUE INDEX IF NOT EXISTS "substance_inchi_key_unique_idx" ON "public"."substance" ("inchi_key") WHERE "inchi_key" IS NOT NULL;');

    // =====================================================
    // Hazard Class table - CLP/GHS hazard classes (~33 classes)
    // =====================================================
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "public"."hazard_class" (
        "code" varchar(50) PRIMARY KEY,
        "full_name" varchar(100) NOT NULL,
        "hazard_type" varchar(20) NOT NULL,
        "pictogram" varchar(10),
        "signal_word" varchar(10),
        "is_cmr" boolean NOT NULL DEFAULT false
      );
    `);
    this.addSql('CREATE INDEX IF NOT EXISTS "hazard_class_hazard_type_idx" ON "public"."hazard_class" ("hazard_type");');
    this.addSql('CREATE INDEX IF NOT EXISTS "hazard_class_is_cmr_idx" ON "public"."hazard_class" ("is_cmr");');

    // =====================================================
    // Hazard Statement table - H-statements with translations
    // =====================================================
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "public"."hazard_statement" (
        "code" varchar(20) PRIMARY KEY,
        "translations" jsonb NOT NULL,
        "primary_hazard_class_code" varchar(50) REFERENCES "public"."hazard_class"("code")
      );
    `);
    this.addSql('CREATE INDEX IF NOT EXISTS "hazard_statement_primary_class_idx" ON "public"."hazard_statement" ("primary_hazard_class_code");');

    // =====================================================
    // Substance Hazard Classification table - junction for CLP Annex VI
    // =====================================================
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "public"."substance_hazard_classification" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "substance_id" text NOT NULL REFERENCES "public"."substance"("id") ON DELETE CASCADE,
        "hazard_class_code" varchar(50) NOT NULL REFERENCES "public"."hazard_class"("code"),
        "category" varchar(10),
        "h_code" varchar(20),
        "notes" text[],
        "scl_logic" jsonb,
        "m_factor" integer,
        "is_minimum_classification" boolean NOT NULL DEFAULT false,
        "atp_source" varchar(20) NOT NULL,
        "valid_from" date NOT NULL,
        "valid_to" date
      );
    `);
    this.addSql('CREATE INDEX IF NOT EXISTS "shc_substance_idx" ON "public"."substance_hazard_classification" ("substance_id");');
    this.addSql('CREATE INDEX IF NOT EXISTS "shc_hazard_class_idx" ON "public"."substance_hazard_classification" ("hazard_class_code");');
    this.addSql('CREATE INDEX IF NOT EXISTS "shc_valid_from_idx" ON "public"."substance_hazard_classification" ("valid_from");');
    this.addSql('CREATE INDEX IF NOT EXISTS "shc_atp_source_idx" ON "public"."substance_hazard_classification" ("atp_source");');
    this.addSql('CREATE UNIQUE INDEX IF NOT EXISTS "shc_unique_classification_idx" ON "public"."substance_hazard_classification" ("substance_id", "hazard_class_code", "category", "h_code") WHERE "valid_to" IS NULL;');

    // =====================================================
    // Substance Persona Tables - regulatory domain-specific data
    // =====================================================

    // COSING (Cosmetics Ingredients Database)
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "public"."substance_cosing" (
        "id" varchar(30) PRIMARY KEY,
        "substance_id" varchar(30) NOT NULL REFERENCES "public"."substance"("id") ON DELETE CASCADE,
        "cosing_ref" varchar(20) NOT NULL,
        "inci_name" text NOT NULL,
        "inci_name_normalized" text NOT NULL,
        "functions" text[],
        "restriction_type" varchar(20),
        "restriction_text" text,
        "max_concentration" decimal(10, 4),
        "concentration_unit" varchar(20),
        "other_restrictions" text,
        "sccs_opinions" jsonb,
        "created_at" timestamptz DEFAULT NOW(),
        "updated_at" timestamptz DEFAULT NOW()
      );
    `);
    this.addSql('CREATE INDEX IF NOT EXISTS "idx_cosing_substance" ON "public"."substance_cosing"("substance_id");');
    this.addSql('CREATE INDEX IF NOT EXISTS "idx_cosing_ref" ON "public"."substance_cosing"("cosing_ref");');
    this.addSql('CREATE INDEX IF NOT EXISTS "idx_cosing_restriction" ON "public"."substance_cosing"("restriction_type");');
    this.addSql('CREATE INDEX IF NOT EXISTS "idx_cosing_inci_trgm" ON "public"."substance_cosing" USING gin ("inci_name_normalized" gin_trgm_ops);');

    // EFSA (European Food Safety Authority - food additives)
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "public"."substance_efsa" (
        "id" varchar(30) PRIMARY KEY,
        "substance_id" varchar(30) NOT NULL REFERENCES "public"."substance"("id") ON DELETE CASCADE,
        "e_number" varchar(10),
        "efsa_ref" varchar(50),
        "functional_class" varchar(50) NOT NULL,
        "adi_value" decimal(10, 4),
        "adi_unit" varchar(20),
        "adi_note" text,
        "approved_uses" text[],
        "conditions" text,
        "re_evaluation_date" date,
        "re_evaluation_outcome" varchar(50),
        "created_at" timestamptz DEFAULT NOW(),
        "updated_at" timestamptz DEFAULT NOW()
      );
    `);
    this.addSql('CREATE INDEX IF NOT EXISTS "idx_efsa_substance" ON "public"."substance_efsa"("substance_id");');
    this.addSql('CREATE INDEX IF NOT EXISTS "idx_efsa_e_number" ON "public"."substance_efsa"("e_number") WHERE "e_number" IS NOT NULL;');
    this.addSql('CREATE INDEX IF NOT EXISTS "idx_efsa_functional_class" ON "public"."substance_efsa"("functional_class");');

    // TSCA (Toxic Substances Control Act - US EPA)
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "public"."substance_tsca" (
        "id" varchar(30) PRIMARY KEY,
        "substance_id" varchar(30) NOT NULL REFERENCES "public"."substance"("id") ON DELETE CASCADE,
        "tsca_cas" varchar(20) NOT NULL,
        "inventory_status" varchar(20) NOT NULL,
        "is_section_5" boolean DEFAULT FALSE,
        "is_section_6" boolean DEFAULT FALSE,
        "is_snur" boolean DEFAULT FALSE,
        "cdr_flags" jsonb,
        "created_at" timestamptz DEFAULT NOW(),
        "updated_at" timestamptz DEFAULT NOW()
      );
    `);
    this.addSql('CREATE INDEX IF NOT EXISTS "idx_tsca_substance" ON "public"."substance_tsca"("substance_id");');
    this.addSql('CREATE INDEX IF NOT EXISTS "idx_tsca_cas" ON "public"."substance_tsca"("tsca_cas");');
    this.addSql('CREATE INDEX IF NOT EXISTS "idx_tsca_status" ON "public"."substance_tsca"("inventory_status");');
    this.addSql('CREATE INDEX IF NOT EXISTS "idx_tsca_section6" ON "public"."substance_tsca"("is_section_6") WHERE "is_section_6" = TRUE;');

    // Biocidal Products Regulation (EU BPR)
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "public"."substance_biocide" (
        "id" varchar(30) PRIMARY KEY,
        "substance_id" varchar(30) NOT NULL REFERENCES "public"."substance"("id") ON DELETE CASCADE,
        "biocides_ref" varchar(50) NOT NULL,
        "substance_name" text NOT NULL,
        "status" varchar(30) NOT NULL,
        "product_types" integer[] NOT NULL,
        "approval_date" date,
        "expiry_date" date,
        "conditions" text,
        "supplier_requirements" text,
        "created_at" timestamptz DEFAULT NOW(),
        "updated_at" timestamptz DEFAULT NOW()
      );
    `);
    this.addSql('CREATE INDEX IF NOT EXISTS "idx_biocide_substance" ON "public"."substance_biocide"("substance_id");');
    this.addSql('CREATE INDEX IF NOT EXISTS "idx_biocide_ref" ON "public"."substance_biocide"("biocides_ref");');
    this.addSql('CREATE INDEX IF NOT EXISTS "idx_biocide_status" ON "public"."substance_biocide"("status");');
    this.addSql('CREATE INDEX IF NOT EXISTS "idx_biocide_pt" ON "public"."substance_biocide" USING gin ("product_types");');
    this.addSql('CREATE INDEX IF NOT EXISTS "idx_biocide_expiry" ON "public"."substance_biocide"("expiry_date") WHERE "expiry_date" IS NOT NULL;');

    // =====================================================
    // Product Scope Hierarchy table - recursive scope queries
    // =====================================================
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "public"."product_scope_hierarchy" (
        "parent_scope" varchar(50) NOT NULL,
        "child_scope" varchar(50) NOT NULL,
        PRIMARY KEY ("parent_scope", "child_scope")
      );
    `);

    // Seed the scope hierarchy for product types
    this.addSql(`
      INSERT INTO "public"."product_scope_hierarchy" ("parent_scope", "child_scope") VALUES
        ('ALL_PRODUCTS', 'CONSUMER_GOODS'),
        ('ALL_PRODUCTS', 'INDUSTRIAL'),
        ('ALL_PRODUCTS', 'EEE'),
        ('ALL_PRODUCTS', 'VEHICLES'),
        ('ALL_PRODUCTS', 'CONSTRUCTION_PRODUCTS'),
        ('ALL_PRODUCTS', 'PACKAGING'),
        ('CONSUMER_GOODS', 'TOYS'),
        ('CONSUMER_GOODS', 'CHILDCARE_ARTICLES'),
        ('CONSUMER_GOODS', 'JEWELRY'),
        ('CONSUMER_GOODS', 'COSMETICS'),
        ('CONSUMER_GOODS', 'FOOD_CONTACT'),
        ('CONSUMER_GOODS', 'TEXTILES'),
        ('CONSUMER_GOODS', 'FURNITURE'),
        ('TOYS', 'CHILDCARE_ARTICLES'),
        ('EEE', 'BATTERIES'),
        ('EEE', 'CABLES'),
        ('VEHICLES', 'VEHICLE_COMPONENTS')
      ON CONFLICT DO NOTHING;
    `);
  }

  override async down(): Promise<void> {
    // =====================================================
    // Drop CLP tables (reverse order of creation)
    // =====================================================
    this.addSql('DROP TABLE IF EXISTS "public"."substance_hazard_classification" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."hazard_statement" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."hazard_class" CASCADE;');

    // Drop CLP columns from substance
    this.addSql(`
      ALTER TABLE "public"."substance"
      DROP COLUMN IF EXISTS "index_number",
      DROP COLUMN IF EXISTS "clp_version";
    `);

    // Drop Golden Record columns from substance
    this.addSql('DROP INDEX IF EXISTS "public"."substance_dtxsid_idx";');
    this.addSql('DROP INDEX IF EXISTS "public"."substance_inchi_key_unique_idx";');
    this.addSql(`
      ALTER TABLE "public"."substance"
      DROP COLUMN IF EXISTS "dtxsid",
      DROP COLUMN IF EXISTS "qc_level";
    `);

    // =====================================================
    // Drop GSR tables (reverse order of creation)
    // =====================================================
    this.addSql('DROP TABLE IF EXISTS "public"."product_scope_hierarchy" CASCADE;');

    // Drop Substance Persona tables
    this.addSql('DROP TABLE IF EXISTS "public"."substance_biocide" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."substance_tsca" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."substance_efsa" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."substance_cosing" CASCADE;');

    this.addSql('DROP TABLE IF EXISTS "public"."blind_disclosure_request" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."unresolved_substance" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."substance_list_entry" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."substance_group_member" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."substance_group" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."regulatory_list" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."registry_source" CASCADE;');

    // Drop GSR indexes on existing tables
    this.addSql('DROP INDEX IF EXISTS "public"."substance_alias_name_trgm_idx";');
    this.addSql('DROP INDEX IF EXISTS "public"."substance_alias_name_normalized_idx";');
    this.addSql('DROP INDEX IF EXISTS "public"."substance_inchi_key_idx";');

    // Drop pg_trgm extension (only if no other indexes use it)
    this.addSql('DROP EXTENSION IF EXISTS pg_trgm;');

    // Drop enhanced columns from substance_alias
    this.addSql(`
      ALTER TABLE "public"."substance_alias"
      DROP COLUMN IF EXISTS "name_normalized",
      DROP COLUMN IF EXISTS "source";
    `);

    // Drop enhanced columns from substance
    this.addSql(`
      ALTER TABLE "public"."substance"
      DROP COLUMN IF EXISTS "smiles",
      DROP COLUMN IF EXISTS "inchi_key",
      DROP COLUMN IF EXISTS "iupac_name";
    `);

    // =====================================================
    // Drop staging tables
    // =====================================================
    this.addSql('DROP TABLE IF EXISTS "public"."ingestion_audit_log" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."staging_requirement" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."staging_regulation" CASCADE;');
    this.addSql('DROP TYPE IF EXISTS ingestion_action;');
    this.addSql('DROP TYPE IF EXISTS consensus_status;');

    // =====================================================
    // Drop in reverse dependency order
    // =====================================================
    this.addSql('DROP TABLE IF EXISTS "public"."outbox_event" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."seed_version" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."category_regulation" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."requirement" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."regulation" CASCADE;');
    this.addSql('DROP TYPE IF EXISTS requirement_severity;');
    this.addSql('DROP TYPE IF EXISTS requirement_type;');
    this.addSql('DROP TYPE IF EXISTS regulation_status;');
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
