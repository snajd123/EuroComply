import { Migration } from '@mikro-orm/migrations';

export class Migration20260126_SeedVersion extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "public"."seed_version" (
        "id" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "name" varchar(100) NOT NULL,
        "version" varchar(50) NOT NULL,
        "source_checksum" varchar(100),
        "seeded_at" timestamptz NOT NULL,
        "record_count" int NOT NULL DEFAULT 0,
        CONSTRAINT "seed_version_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "seed_version_name_unique" UNIQUE ("name")
      );
    `);

    this.addSql('CREATE INDEX IF NOT EXISTS "seed_version_name_index" ON "public"."seed_version" ("name");');
  }

  override async down(): Promise<void> {
    this.addSql('DROP TABLE IF EXISTS "public"."seed_version" CASCADE;');
  }
}
