import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import { TenantProvisioner } from './tenant-provisioner.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';

describe('TenantProvisioner', () => {
  let orm: MikroORM;
  let provisioner: TenantProvisioner;
  const testSchema = 'tenant_provisioner_test';

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }
    orm = await setupTestDb();
    provisioner = new TenantProvisioner(orm);
  });

  afterAll(async () => {
    if (orm) {
      // Cleanup test schema
      try {
        await orm.em.execute(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
      } catch {
        // Ignore
      }
      await teardownTestDb();
    }
  });

  it('creates tenant schema', async (context) => {
    if (!(await isDatabaseAvailable())) {
      context.skip();
      return;
    }

    await provisioner.createSchema(testSchema);

    // Verify schema exists
    const result = await orm.em.execute<{ exists: boolean }[]>(
      `SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = '${testSchema}') as exists`
    );
    expect(result[0]?.exists).toBe(true);
  });

  it('runs migrations in tenant schema', async (context) => {
    if (!(await isDatabaseAvailable())) {
      context.skip();
      return;
    }

    // Schema should already exist from previous test
    await provisioner.runMigrations(testSchema);

    // Verify tables exist in tenant schema
    const tables = await orm.em.execute<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = '${testSchema}'`
    );
    const tableNames = tables.map(t => t.table_name);

    expect(tableNames).toContain('category');
    expect(tableNames).toContain('product');
    expect(tableNames).toContain('product_version');
  });

  it('provisions complete tenant', async (context) => {
    if (!(await isDatabaseAvailable())) {
      context.skip();
      return;
    }

    const newSchema = 'tenant_full_provision_test';

    try {
      await provisioner.provisionTenant(newSchema);

      // Verify schema and tables
      const tables = await orm.em.execute<{ table_name: string }[]>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = '${newSchema}'`
      );
      expect(tables.length).toBeGreaterThan(0);
    } finally {
      // Cleanup
      await orm.em.execute(`DROP SCHEMA IF EXISTS "${newSchema}" CASCADE`);
    }
  });
});
