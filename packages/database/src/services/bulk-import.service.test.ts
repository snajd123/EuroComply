import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '../test-utils.js';
import { BulkImportService } from './bulk-import.service.js';
import { SeedVersion } from '../entities/SeedVersion.js';
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';

describe('BulkImportService', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let service: BulkImportService;
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
    service = new BulkImportService(em);
    await clearTestDb(em);
  });

  describe('upsertSmall', () => {
    it('should insert new records', async () => {
      const records = [
        { name: 'test-1', version: 'v1', seededAt: new Date(), recordCount: 10 },
        { name: 'test-2', version: 'v1', seededAt: new Date(), recordCount: 20 },
      ];

      const count = await service.upsertSmall(SeedVersion, records, ['name']);

      expect(count).toBe(2);

      const all = await em.find(SeedVersion, {});
      expect(all).toHaveLength(2);
    });

    it('should update existing records on conflict', async () => {
      // Insert initial record using class instantiation pattern
      const initial = new SeedVersion();
      initial.name = 'test-1';
      initial.version = 'v1';
      initial.seededAt = new Date();
      initial.recordCount = 10;
      em.persist(initial);
      await em.flush();
      em.clear();

      // Upsert with updated version
      const records = [
        { name: 'test-1', version: 'v2', seededAt: new Date(), recordCount: 15 },
      ];

      const count = await service.upsertSmall(SeedVersion, records, ['name']);

      expect(count).toBe(1);

      const found = await em.findOne(SeedVersion, { name: 'test-1' });
      expect(found?.version).toBe('v2');
      expect(found?.recordCount).toBe(15);
    });

    it('should handle empty records array', async () => {
      const count = await service.upsertSmall(SeedVersion, [], ['name']);

      expect(count).toBe(0);

      const all = await em.find(SeedVersion, {});
      expect(all).toHaveLength(0);
    });

    it('should handle mixed insert and update in single batch', async () => {
      // Insert initial record using class instantiation pattern
      const initial = new SeedVersion();
      initial.name = 'existing';
      initial.version = 'v1';
      initial.seededAt = new Date();
      initial.recordCount = 100;
      em.persist(initial);
      await em.flush();
      em.clear();

      // Upsert with one existing and one new record
      const records = [
        { name: 'existing', version: 'v2', seededAt: new Date(), recordCount: 150 },
        { name: 'new-record', version: 'v1', seededAt: new Date(), recordCount: 50 },
      ];

      const count = await service.upsertSmall(SeedVersion, records, ['name']);

      expect(count).toBe(2);

      const all = await em.find(SeedVersion, {}, { orderBy: { name: 'ASC' } });
      expect(all).toHaveLength(2);

      const existing = all.find(r => r.name === 'existing');
      const newRecord = all.find(r => r.name === 'new-record');

      expect(existing?.version).toBe('v2');
      expect(existing?.recordCount).toBe(150);
      expect(newRecord?.version).toBe('v1');
      expect(newRecord?.recordCount).toBe(50);
    });

    it('should preserve fields not in update data', async () => {
      // Insert initial record with checksum using class instantiation pattern
      const initial = new SeedVersion();
      initial.name = 'preserve-test';
      initial.version = 'v1';
      initial.seededAt = new Date();
      initial.recordCount = 100;
      initial.sourceChecksum = 'sha256:original';
      em.persist(initial);
      await em.flush();
      em.clear();

      // Upsert with partial data (no checksum)
      const records = [
        { name: 'preserve-test', version: 'v2', seededAt: new Date(), recordCount: 200 },
      ];

      await service.upsertSmall(SeedVersion, records, ['name']);

      const found = await em.findOne(SeedVersion, { name: 'preserve-test' });
      expect(found?.version).toBe('v2');
      expect(found?.recordCount).toBe(200);
      // sourceChecksum should be preserved since it wasn't in the update data
      expect(found?.sourceChecksum).toBe('sha256:original');
    });
  });
});
