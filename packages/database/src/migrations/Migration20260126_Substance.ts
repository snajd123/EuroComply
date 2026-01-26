import { Migration } from '@mikro-orm/migrations';

export class Migration20260126_Substance extends Migration {
  override async up(): Promise<void> {
    // Substance table
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "public"."substance" (
        "id" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "cas_number" varchar(20) NOT NULL,
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
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "substance_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "substance_cas_number_unique" UNIQUE ("cas_number")
      );
    `);

    // Indexes for substance
    this.addSql('CREATE INDEX IF NOT EXISTS "substance_cas_number_index" ON "public"."substance" ("cas_number");');
    this.addSql('CREATE INDEX IF NOT EXISTS "substance_ec_number_index" ON "public"."substance" ("ec_number");');
    this.addSql('CREATE INDEX IF NOT EXISTS "substance_primary_name_index" ON "public"."substance" ("primary_name");');
    this.addSql('CREATE INDEX IF NOT EXISTS "substance_is_svhc_index" ON "public"."substance" ("is_svhc") WHERE "is_svhc" = true;');
    this.addSql('CREATE INDEX IF NOT EXISTS "substance_requires_auth_index" ON "public"."substance" ("requires_authorization") WHERE "requires_authorization" = true;');
    this.addSql('CREATE INDEX IF NOT EXISTS "substance_is_restricted_index" ON "public"."substance" ("is_restricted") WHERE "is_restricted" = true;');

    // SubstanceAlias table
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "public"."substance_alias" (
        "id" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "substance_id" text NOT NULL,
        "name" text NOT NULL,
        "type" varchar(20) NOT NULL,
        "language" varchar(10) NOT NULL DEFAULT 'en',
        CONSTRAINT "substance_alias_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "substance_alias_substance_name_unique" UNIQUE ("substance_id", "name"),
        CONSTRAINT "substance_alias_substance_fkey" FOREIGN KEY ("substance_id")
          REFERENCES "public"."substance" ("id") ON DELETE CASCADE
      );
    `);

    // Indexes for substance_alias
    this.addSql('CREATE INDEX IF NOT EXISTS "substance_alias_substance_id_index" ON "public"."substance_alias" ("substance_id");');
    this.addSql('CREATE INDEX IF NOT EXISTS "substance_alias_name_index" ON "public"."substance_alias" ("name");');
  }

  override async down(): Promise<void> {
    this.addSql('DROP TABLE IF EXISTS "public"."substance_alias" CASCADE;');
    this.addSql('DROP TABLE IF EXISTS "public"."substance" CASCADE;');
  }
}
