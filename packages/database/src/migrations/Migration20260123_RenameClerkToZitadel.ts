import { Migration } from '@mikro-orm/migrations';

export class Migration20260123_RenameClerkToZitadel extends Migration {
  async up(): Promise<void> {
    this.addSql('ALTER TABLE "public"."organizations" RENAME COLUMN "clerk_org_id" TO "zitadel_org_id";');
  }

  async down(): Promise<void> {
    this.addSql('ALTER TABLE "public"."organizations" RENAME COLUMN "zitadel_org_id" TO "clerk_org_id";');
  }
}
