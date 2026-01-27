import { Migration } from '@mikro-orm/migrations';

export class Migration20260127_CategoryVersion extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE "category"
      ADD COLUMN IF NOT EXISTS "version" int NOT NULL DEFAULT 1;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE "category" DROP COLUMN IF EXISTS "version";
    `);
  }
}
