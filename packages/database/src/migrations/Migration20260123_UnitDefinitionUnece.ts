import { Migration } from '@mikro-orm/migrations';

export class Migration20260123_UnitDefinitionUnece extends Migration {
  async up(): Promise<void> {
    // Drop old table if exists (clean slate for new schema)
    this.addSql('DROP TABLE IF EXISTS "public"."unit_definition" CASCADE;');

    // Create new table with UNECE structure
    this.addSql(`
      CREATE TABLE "public"."unit_definition" (
        "id" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "code" varchar(10) NOT NULL,
        "name" text NOT NULL,
        "symbol" varchar(10) NOT NULL,
        "system" text NOT NULL,
        "factor" decimal(20, 10) NOT NULL,
        "is_base" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "unit_definition_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "unit_definition_code_unique" UNIQUE ("code")
      );
    `);

    // Create index on code for fast lookups
    this.addSql('CREATE INDEX "unit_definition_code_index" ON "public"."unit_definition" ("code");');

    // Create index on system for filtering
    this.addSql('CREATE INDEX "unit_definition_system_index" ON "public"."unit_definition" ("system");');
  }

  async down(): Promise<void> {
    this.addSql('DROP TABLE IF EXISTS "public"."unit_definition" CASCADE;');
  }
}
