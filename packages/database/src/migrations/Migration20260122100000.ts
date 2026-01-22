import { Migration } from '@mikro-orm/migrations';

export class Migration20260122100000 extends Migration {
  override async up(): Promise<void> {
    // Add new columns to organizations table
    this.addSql(`
      ALTER TABLE "public"."organizations"
      ADD COLUMN IF NOT EXISTS "slug" varchar(255) UNIQUE,
      ADD COLUMN IF NOT EXISTS "cell_id" varchar(255) DEFAULT 'cell_1',
      ADD COLUMN IF NOT EXISTS "subscription_tier" varchar(50) DEFAULT 'STARTER',
      ADD COLUMN IF NOT EXISTS "subscription_status" varchar(50) DEFAULT 'TRIALING',
      ADD COLUMN IF NOT EXISTS "provisioning_status" varchar(50) DEFAULT 'PENDING',
      ADD COLUMN IF NOT EXISTS "provisioning_error" text;
    `);

    // Update existing rows to have a slug based on name
    this.addSql(`
      UPDATE "public"."organizations"
      SET "slug" = LOWER(REGEXP_REPLACE("name", '[^a-zA-Z0-9]', '-', 'g'))
      WHERE "slug" IS NULL;
    `);

    // Make slug NOT NULL after populating
    this.addSql(`
      ALTER TABLE "public"."organizations"
      ALTER COLUMN "slug" SET NOT NULL;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE "public"."organizations"
      DROP COLUMN IF EXISTS "slug",
      DROP COLUMN IF EXISTS "cell_id",
      DROP COLUMN IF EXISTS "subscription_tier",
      DROP COLUMN IF EXISTS "subscription_status",
      DROP COLUMN IF EXISTS "provisioning_status",
      DROP COLUMN IF EXISTS "provisioning_error";
    `);
  }
}
