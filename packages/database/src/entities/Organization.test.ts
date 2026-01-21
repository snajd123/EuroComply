import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '../test-utils.js';
import { Organization, EnforcementMode } from './Organization.js';
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';

describe('Organization entity', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let dbAvailable = false;

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (dbAvailable) {
      orm = await setupTestDb();
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await teardownTestDb();
    }
  });

  beforeEach(async (context) => {
    if (!dbAvailable) {
      context.skip();
      return;
    }
    em = orm.em.fork();
    await clearTestDb(em);
  });

  it('creates an organization with defaults', async () => {
    const org = new Organization();
    org.name = 'Test Corp';
    org.schemaName = 'tenant_test';

    em.persist(org);
    await em.flush();

    expect(org.id).toBeDefined();
    expect(org.regulatoryAdvisorEnabled).toBe(true);
    expect(org.enforcementMode).toBe(EnforcementMode.SILENT);
    expect(org.captureComplianceInSilentMode).toBe(true);
    expect(org.createdAt).toBeInstanceOf(Date);
  });

  it('enforces unique schema names', async () => {
    const org1 = new Organization();
    org1.name = 'Corp 1';
    org1.schemaName = 'tenant_unique';

    const org2 = new Organization();
    org2.name = 'Corp 2';
    org2.schemaName = 'tenant_unique';

    em.persist(org1);
    await em.flush();

    em.persist(org2);
    await expect(em.flush()).rejects.toThrow();
  });

  it('retrieves organization by schema name', async () => {
    const org = new Organization();
    org.name = 'Find Me Corp';
    org.schemaName = 'tenant_findme';

    em.persist(org);
    await em.flush();
    em.clear();

    const found = await em.findOne(Organization, { schemaName: 'tenant_findme' });
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Find Me Corp');
  });
});
