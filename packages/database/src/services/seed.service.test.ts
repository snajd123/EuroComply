import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '../test-utils.js';
import { SeedService } from './seed.service.js';
import { SeedVersion } from '../entities/SeedVersion.js';
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';

describe('SeedService', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let service: SeedService;
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
    service = new SeedService(em);
    await clearTestDb(em);
  });

  describe('needsSeeding', () => {
    it('should return true if seed does not exist', async () => {
      const result = await service.needsSeeding('unece-rec20', 'Rev17');
      expect(result).toBe(true);
    });

    it('should return true if version is different', async () => {
      const existing = new SeedVersion();
      existing.name = 'unece-rec20';
      existing.version = 'Rev16';
      existing.seededAt = new Date();
      existing.recordCount = 1700;
      em.persist(existing);
      await em.flush();
      em.clear();

      const result = await service.needsSeeding('unece-rec20', 'Rev17');
      expect(result).toBe(true);
    });

    it('should return false if same version exists', async () => {
      const existing = new SeedVersion();
      existing.name = 'unece-rec20';
      existing.version = 'Rev17';
      existing.seededAt = new Date();
      existing.recordCount = 1800;
      em.persist(existing);
      await em.flush();
      em.clear();

      const result = await service.needsSeeding('unece-rec20', 'Rev17');
      expect(result).toBe(false);
    });

    it('should return true if checksum differs (even with same version)', async () => {
      const existing = new SeedVersion();
      existing.name = 'unece-rec20';
      existing.version = 'Rev17';
      existing.sourceChecksum = 'sha256:oldchecksum';
      existing.seededAt = new Date();
      existing.recordCount = 1800;
      em.persist(existing);
      await em.flush();
      em.clear();

      // Same version but different checksum = needs re-seeding
      const result = await service.needsSeeding('unece-rec20', 'Rev17', 'sha256:newchecksum');
      expect(result).toBe(true);
    });

    it('should return false if both version and checksum match', async () => {
      const checksum = 'sha256:abc123';
      const existing = new SeedVersion();
      existing.name = 'unece-rec20';
      existing.version = 'Rev17';
      existing.sourceChecksum = checksum;
      existing.seededAt = new Date();
      existing.recordCount = 1800;
      em.persist(existing);
      await em.flush();
      em.clear();

      const result = await service.needsSeeding('unece-rec20', 'Rev17', checksum);
      expect(result).toBe(false);
    });

    it('should return false if checksum not provided and version matches', async () => {
      const existing = new SeedVersion();
      existing.name = 'unece-rec20';
      existing.version = 'Rev17';
      existing.sourceChecksum = 'sha256:somechecksum';
      existing.seededAt = new Date();
      existing.recordCount = 1800;
      em.persist(existing);
      await em.flush();
      em.clear();

      // No checksum provided, only version comparison
      const result = await service.needsSeeding('unece-rec20', 'Rev17');
      expect(result).toBe(false);
    });
  });

  describe('recordSeeding', () => {
    it('should create new seed version record', async () => {
      await service.recordSeeding('echa-svhc', '2024-01', 240, 'sha256:abc');

      const found = await em.findOne(SeedVersion, { name: 'echa-svhc' });
      expect(found).toBeDefined();
      expect(found?.version).toBe('2024-01');
      expect(found?.sourceChecksum).toBe('sha256:abc');
      expect(found?.recordCount).toBe(240);
    });

    it('should update existing seed version record', async () => {
      const existing = new SeedVersion();
      existing.name = 'echa-svhc';
      existing.version = '2024-01';
      existing.sourceChecksum = 'sha256:old';
      existing.seededAt = new Date('2024-01-01');
      existing.recordCount = 240;
      em.persist(existing);
      await em.flush();
      em.clear();

      await service.recordSeeding('echa-svhc', '2024-02', 245, 'sha256:new');

      const found = await em.findOne(SeedVersion, { name: 'echa-svhc' });
      expect(found?.version).toBe('2024-02');
      expect(found?.sourceChecksum).toBe('sha256:new');
      expect(found?.recordCount).toBe(245);
    });

    it('should create record without checksum', async () => {
      await service.recordSeeding('test-data', 'v1.0', 100);

      const found = await em.findOne(SeedVersion, { name: 'test-data' });
      expect(found).toBeDefined();
      expect(found?.version).toBe('v1.0');
      expect(found?.recordCount).toBe(100);
      // Database returns null for nullable fields that aren't set
      expect(found?.sourceChecksum).toBeNull();
    });

    it('should return the created/updated seed version', async () => {
      const result = await service.recordSeeding('return-test', 'v1.0', 50, 'sha256:test');

      expect(result).toBeDefined();
      expect(result.name).toBe('return-test');
      expect(result.version).toBe('v1.0');
      expect(result.recordCount).toBe(50);
      expect(result.sourceChecksum).toBe('sha256:test');
    });
  });

  describe('getSeededVersion', () => {
    it('should return null if seed does not exist', async () => {
      const result = await service.getSeededVersion('nonexistent');
      expect(result).toBeNull();
    });

    it('should return existing seed version', async () => {
      const existing = new SeedVersion();
      existing.name = 'get-test';
      existing.version = 'v2.0';
      existing.sourceChecksum = 'sha256:gettest';
      existing.seededAt = new Date();
      existing.recordCount = 500;
      em.persist(existing);
      await em.flush();
      em.clear();

      const result = await service.getSeededVersion('get-test');
      expect(result).toBeDefined();
      expect(result?.name).toBe('get-test');
      expect(result?.version).toBe('v2.0');
      expect(result?.sourceChecksum).toBe('sha256:gettest');
      expect(result?.recordCount).toBe(500);
    });
  });

  describe('computeChecksum', () => {
    it('should compute SHA-256 checksum of data', () => {
      const data = JSON.stringify([{ name: 'test', value: 123 }]);
      const checksum = service.computeChecksum(data);

      expect(checksum).toMatch(/^sha256:[a-f0-9]{64}$/);

      // Same data should produce same checksum
      expect(service.computeChecksum(data)).toBe(checksum);

      // Different data should produce different checksum
      const differentData = JSON.stringify([{ name: 'test', value: 124 }]);
      expect(service.computeChecksum(differentData)).not.toBe(checksum);
    });

    it('should compute checksum from Buffer', () => {
      const buffer = Buffer.from('test data content');
      const checksum = service.computeChecksum(buffer);

      expect(checksum).toMatch(/^sha256:[a-f0-9]{64}$/);

      // Same buffer content should produce same checksum
      const sameBuffer = Buffer.from('test data content');
      expect(service.computeChecksum(sameBuffer)).toBe(checksum);
    });

    it('should produce deterministic checksums', () => {
      const data = 'consistent input data';
      const checksum1 = service.computeChecksum(data);
      const checksum2 = service.computeChecksum(data);
      const checksum3 = service.computeChecksum(data);

      expect(checksum1).toBe(checksum2);
      expect(checksum2).toBe(checksum3);
    });
  });
});
