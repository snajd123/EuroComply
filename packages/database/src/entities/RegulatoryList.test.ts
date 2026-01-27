import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '../test-utils.js';
import { RegulatoryList } from './RegulatoryList.js';
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';

describe('RegulatoryList entity', () => {
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

  it('should create a regulatory list with required fields', async () => {
    const list = new RegulatoryList();
    list.code = 'REACH_SVHC';
    list.name = 'REACH SVHC Candidate List';
    list.source = 'ECHA';
    list.version = '2024-01';
    list.effectiveDate = new Date('2024-01-15');

    em.persist(list);
    await em.flush();
    em.clear();

    const found = await em.findOne(RegulatoryList, { code: 'REACH_SVHC' });
    expect(found).toBeDefined();
    expect(found?.code).toBe('REACH_SVHC');
    expect(found?.name).toBe('REACH SVHC Candidate List');
    expect(found?.source).toBe('ECHA');
    expect(found?.version).toBe('2024-01');
  });

  it('should have correct default values', async () => {
    const list = new RegulatoryList();
    list.code = 'ROHS_RESTRICTED';
    list.name = 'RoHS Restricted Substances';
    list.source = 'EU_ROHS';
    list.version = 'v1';
    list.effectiveDate = new Date('2024-01-01');

    expect(list.isCurrentVersion).toBe(true);
    expect(list.allowTenantExemption).toBe(true);
  });

  it('should support allowTenantExemption field', async () => {
    const list = new RegulatoryList();
    list.code = 'COSING_ANNEX_II';
    list.name = 'CosIng Annex II - Prohibited Substances';
    list.source = 'EU_COSMETICS';
    list.version = '2024-02';
    list.effectiveDate = new Date('2024-02-01');
    list.allowTenantExemption = false; // No exemptions allowed for this list

    em.persist(list);
    await em.flush();
    em.clear();

    const found = await em.findOne(RegulatoryList, { code: 'COSING_ANNEX_II' });
    expect(found).toBeDefined();
    expect(found?.allowTenantExemption).toBe(false);
  });

  it('should support version tracking fields', async () => {
    const v1 = new RegulatoryList();
    v1.code = 'REACH_SVHC';
    v1.name = 'REACH SVHC Candidate List';
    v1.source = 'ECHA';
    v1.version = '2023-12';
    v1.effectiveDate = new Date('2023-12-01');
    v1.isCurrentVersion = false;
    v1.supersededDate = new Date('2024-01-15');

    em.persist(v1);
    await em.flush();
    em.clear();

    // Create version 2 that references version 1
    const found = await em.findOne(RegulatoryList, { code: 'REACH_SVHC', version: '2023-12' });
    expect(found).toBeDefined();
    expect(found?.isCurrentVersion).toBe(false);
    expect(found?.supersededDate).toBeDefined();

    const v2 = new RegulatoryList();
    v2.code = 'REACH_SVHC';
    v2.name = 'REACH SVHC Candidate List';
    v2.source = 'ECHA';
    v2.version = '2024-01';
    v2.effectiveDate = new Date('2024-01-15');
    v2.isCurrentVersion = true;
    v2.previousVersionId = found!.id;

    em.persist(v2);
    await em.flush();
    em.clear();

    const foundV2 = await em.findOne(RegulatoryList, { code: 'REACH_SVHC', version: '2024-01' });
    expect(foundV2).toBeDefined();
    expect(foundV2?.previousVersionId).toBe(found!.id);
    expect(foundV2?.isCurrentVersion).toBe(true);
  });

  it('should enforce unique constraint on code + version', async () => {
    const list1 = new RegulatoryList();
    list1.code = 'UNIQUE_TEST';
    list1.name = 'Test List';
    list1.source = 'TEST';
    list1.version = 'v1';
    list1.effectiveDate = new Date('2024-01-01');

    em.persist(list1);
    await em.flush();

    const list2 = new RegulatoryList();
    list2.code = 'UNIQUE_TEST';
    list2.name = 'Test List Duplicate';
    list2.source = 'TEST';
    list2.version = 'v1'; // Same code + version
    list2.effectiveDate = new Date('2024-01-01');

    em.persist(list2);
    await expect(em.flush()).rejects.toThrow();
  });

  it('should allow same code with different versions', async () => {
    const list1 = new RegulatoryList();
    list1.code = 'VERSION_TEST';
    list1.name = 'Version Test v1';
    list1.source = 'TEST';
    list1.version = 'v1';
    list1.effectiveDate = new Date('2024-01-01');

    const list2 = new RegulatoryList();
    list2.code = 'VERSION_TEST';
    list2.name = 'Version Test v2';
    list2.source = 'TEST';
    list2.version = 'v2'; // Different version
    list2.effectiveDate = new Date('2024-02-01');

    em.persist(list1);
    em.persist(list2);
    await em.flush();
    em.clear();

    const found = await em.find(RegulatoryList, { code: 'VERSION_TEST' });
    expect(found).toHaveLength(2);
  });

  it('should store optional fields', async () => {
    const list = new RegulatoryList();
    list.code = 'OPTIONAL_FIELDS';
    list.name = 'Optional Fields Test';
    list.source = 'TEST';
    list.version = 'v1';
    list.effectiveDate = new Date('2024-01-01');
    list.sourceUrl = 'https://echa.europa.eu/candidate-list-table';
    list.description = 'Test list with all optional fields populated';

    em.persist(list);
    await em.flush();
    em.clear();

    const found = await em.findOne(RegulatoryList, { code: 'OPTIONAL_FIELDS' });
    expect(found).toBeDefined();
    expect(found?.sourceUrl).toBe('https://echa.europa.eu/candidate-list-table');
    expect(found?.description).toBe('Test list with all optional fields populated');
  });

  it('should allow null for optional fields', async () => {
    const list = new RegulatoryList();
    list.code = 'NULL_FIELDS';
    list.name = 'Null Fields Test';
    list.source = 'TEST';
    list.version = 'v1';
    list.effectiveDate = new Date('2024-01-01');
    // sourceUrl, description, supersededDate, previousVersionId not set

    em.persist(list);
    await em.flush();
    em.clear();

    const found = await em.findOne(RegulatoryList, { code: 'NULL_FIELDS' });
    expect(found).toBeDefined();
    expect(found?.sourceUrl).toBeNull();
    expect(found?.description).toBeNull();
    expect(found?.supersededDate).toBeNull();
    expect(found?.previousVersionId).toBeNull();
  });
});
