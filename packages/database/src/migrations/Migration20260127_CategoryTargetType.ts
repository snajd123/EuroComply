import { Migration } from '@mikro-orm/migrations';

export class Migration20260127_CategoryTargetType extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE "category"
      ADD COLUMN IF NOT EXISTS "target_type" text NOT NULL DEFAULT 'PRODUCT';
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE "category" DROP COLUMN IF EXISTS "target_type";
    `);
  }
}
