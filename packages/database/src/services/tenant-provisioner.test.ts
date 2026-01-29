import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

    // Clean up test schema from previous runs
    try {
      await orm.em.execute(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
    } catch {
      // Ignore
    }
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

    expect(tableNames).toContain('tenant_category');
    expect(tableNames).toContain('product');
    expect(tableNames).toContain('product_version');
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('organization_users');
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

  describe('schema name validation', () => {
    it('rejects invalid schema names in createSchema', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      await expect(provisioner.createSchema('invalid')).rejects.toThrow('Invalid schema name');
      await expect(provisioner.createSchema('tenant_UPPER')).rejects.toThrow('Invalid schema name');
      await expect(provisioner.createSchema('tenant_sql; DROP TABLE users;--')).rejects.toThrow('Invalid schema name');
    });

    it('rejects invalid schema names in dropSchema', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      await expect(provisioner.dropSchema('public')).rejects.toThrow('Invalid schema name');
      await expect(provisioner.dropSchema('')).rejects.toThrow();
    });

    it('rejects invalid schema names in runMigrations', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      await expect(provisioner.runMigrations('invalid')).rejects.toThrow('Invalid schema name');
    });
  });

  describe('search_path safety', () => {
    it('resets search_path after successful migration', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const safetySchema = 'tenant_searchpath_test';

      try {
        // Create and run migrations
        await provisioner.createSchema(safetySchema);
        await provisioner.runMigrations(safetySchema);

        // Verify search_path is reset to public
        const result = await orm.em.execute<{ search_path: string }[]>('SHOW search_path');
        const searchPath = result[0]?.search_path;

        // search_path should be default (usually "$user", public) or just public
        expect(searchPath).not.toContain(safetySchema);
      } finally {
        await orm.em.execute(`DROP SCHEMA IF EXISTS "${safetySchema}" CASCADE`);
      }
    });

    it('resets search_path even after migration failure', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const failSchema = 'tenant_fail_test';

      try {
        // Create schema first
        await provisioner.createSchema(failSchema);

        // Run migrations once (success)
        await provisioner.runMigrations(failSchema);

        // Running migrations again will fail because tables already exist
        // but search_path should still be reset
        try {
          await provisioner.runMigrations(failSchema);
        } catch {
          // Expected to fail - tables already exist
        }

        // Verify search_path is still public
        const result = await orm.em.execute<{ search_path: string }[]>('SHOW search_path');
        const searchPath = result[0]?.search_path;

        expect(searchPath).not.toContain(failSchema);
      } finally {
        await orm.em.execute(`DROP SCHEMA IF EXISTS "${failSchema}" CASCADE`);
      }
    });

    it('maintains search_path isolation between tenants', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const tenantA = 'tenant_isolation_a';
      const tenantB = 'tenant_isolation_b';

      try {
        // Provision tenant A
        await provisioner.provisionTenant(tenantA);

        // Check search_path after tenant A
        let result = await orm.em.execute<{ search_path: string }[]>('SHOW search_path');
        expect(result[0]?.search_path).not.toContain(tenantA);

        // Provision tenant B
        await provisioner.provisionTenant(tenantB);

        // Check search_path after tenant B
        result = await orm.em.execute<{ search_path: string }[]>('SHOW search_path');
        expect(result[0]?.search_path).not.toContain(tenantA);
        expect(result[0]?.search_path).not.toContain(tenantB);

        // Verify tables were created in correct schemas
        const tablesA = await orm.em.execute<{ table_name: string }[]>(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = '${tenantA}'`
        );
        const tablesB = await orm.em.execute<{ table_name: string }[]>(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = '${tenantB}'`
        );

        expect(tablesA.length).toBeGreaterThan(0);
        expect(tablesB.length).toBeGreaterThan(0);
      } finally {
        await orm.em.execute(`DROP SCHEMA IF EXISTS "${tenantA}" CASCADE`);
        await orm.em.execute(`DROP SCHEMA IF EXISTS "${tenantB}" CASCADE`);
      }
    });
  });

  describe('provisioning error handling', () => {
    it('returns error result for invalid schema name', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const result = await provisioner.provisionTenant('invalid_no_prefix');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid schema name');
    });

    it('returns success result for valid provisioning', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const newSchema = 'tenant_success_test';

      try {
        const result = await provisioner.provisionTenant(newSchema);

        expect(result.success).toBe(true);
        expect(result.schemaName).toBe(newSchema);
        expect(result.error).toBeUndefined();
      } finally {
        await orm.em.execute(`DROP SCHEMA IF EXISTS "${newSchema}" CASCADE`);
      }
    });
  });
});
