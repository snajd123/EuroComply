import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import {
  createTestOrm,
  setupTestTenant,
  teardownTestTenant,
  generateTestId,
} from './test-utils.js';

describe('test-utils', () => {
  describe('generateTestId', () => {
    it('generates unique IDs with test prefix', () => {
      const id1 = generateTestId();
      const id2 = generateTestId();

      expect(id1).toMatch(/^test_/);
      expect(id2).toMatch(/^test_/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('createTestOrm', () => {
    it('creates an ORM instance for testing', async () => {
      const orm = await createTestOrm();
      expect(orm).toBeDefined();
      expect(orm.em).toBeDefined();
      await orm.close();
    });
  });

  describe('setupTestTenant / teardownTestTenant', () => {
    let orm: MikroORM;

    beforeAll(async () => {
      orm = await createTestOrm();
    });

    afterAll(async () => {
      await orm.close();
    });

    it('creates and drops a tenant schema', async () => {
      const schemaName = await setupTestTenant(orm, 'testutils');
      expect(schemaName).toBe('tenant_testutils');

      // Verify schema exists
      const result = await orm.em.execute(`
        SELECT schema_name FROM information_schema.schemata
        WHERE schema_name = '${schemaName}'
      `);
      expect(result.length).toBe(1);

      // Cleanup
      await teardownTestTenant(orm, schemaName);

      // Verify schema is gone
      const afterResult = await orm.em.execute(`
        SELECT schema_name FROM information_schema.schemata
        WHERE schema_name = '${schemaName}'
      `);
      expect(afterResult.length).toBe(0);
    });
  });
});
