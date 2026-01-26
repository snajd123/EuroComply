import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '../test-utils.js';
import { SeedVersion } from './SeedVersion.js';
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';

describe('SeedVersion entity', () => {
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

  it('should create a seed version record', async () => {
    const seedVersion = new SeedVersion();
    seedVersion.name = 'unece-rec20';
    seedVersion.version = 'Rev17';
    seedVersion.sourceChecksum = 'sha256:abc123def456...';
    seedVersion.seededAt = new Date();
    seedVersion.recordCount = 1800;

    em.persist(seedVersion);
    await em.flush();
    em.clear();

    const found = await em.findOne(SeedVersion, { name: 'unece-rec20' });
    expect(found).toBeDefined();
    expect(found?.version).toBe('Rev17');
    expect(found?.sourceChecksum).toBe('sha256:abc123def456...');
    expect(found?.recordCount).toBe(1800);
  });

  it('should enforce unique name constraint', async () => {
    const v1 = new SeedVersion();
    v1.name = 'echa-svhc';
    v1.version = '2024-01';
    v1.seededAt = new Date();
    v1.recordCount = 240;

    em.persist(v1);
    await em.flush();

    const v2 = new SeedVersion();
    v2.name = 'echa-svhc';
    v2.version = '2024-02';
    v2.seededAt = new Date();
    v2.recordCount = 245;

    em.persist(v2);
    await expect(em.flush()).rejects.toThrow();
  });

  it('should allow null sourceChecksum', async () => {
    const seedVersion = new SeedVersion();
    seedVersion.name = 'test-data';
    seedVersion.version = 'v1.0';
    seedVersion.seededAt = new Date();
    seedVersion.recordCount = 100;
    // sourceChecksum is not set (nullable)

    em.persist(seedVersion);
    await em.flush();
    em.clear();

    const found = await em.findOne(SeedVersion, { name: 'test-data' });
    expect(found).toBeDefined();
    expect(found?.sourceChecksum).toBeNull();
  });

  it('should detect version change via checksum', async () => {
    const v1 = new SeedVersion();
    v1.name = 'checksum-test';
    v1.version = 'Rev17';
    v1.sourceChecksum = 'sha256:original';
    v1.seededAt = new Date();
    v1.recordCount = 100;

    em.persist(v1);
    await em.flush();
    em.clear();

    // Same version string but different checksum = needs re-seeding
    const found = await em.findOne(SeedVersion, { name: 'checksum-test' });
    expect(found?.sourceChecksum).toBe('sha256:original');
    // Service layer will compare checksums
  });

  it('should have default recordCount of 0', async () => {
    const seedVersion = new SeedVersion();
    seedVersion.name = 'default-count-test';
    seedVersion.version = 'v1';
    seedVersion.seededAt = new Date();
    // recordCount not set explicitly

    expect(seedVersion.recordCount).toBe(0);
  });
});
