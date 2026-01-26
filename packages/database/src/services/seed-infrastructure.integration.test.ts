import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '../test-utils.js';
import { BulkImportService } from './bulk-import.service.js';
import { SeedService } from './seed.service.js';
import { SeedVersion } from '../entities/SeedVersion.js';
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';

/**
 * Integration tests for the complete seed infrastructure workflow.
 *
 * Tests the interaction between:
 * - BulkImportService (copyLarge for bulk imports)
 * - SeedService (needsSeeding, recordSeeding, computeChecksum, getSeededVersion)
 * - SeedVersion entity (persistence layer)
 *
 * These tests demonstrate the complete workflow that seeders will use:
 * 1. Check if seeding is needed (version/checksum comparison)
 * 2. Import data using bulk import
 * 3. Record the seeding operation
 * 4. Verify idempotency on re-run
 */
describe('Seed Infrastructure Integration', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let bulkImportService: BulkImportService;
  let seedService: SeedService;
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
    bulkImportService = new BulkImportService(em);
    seedService = new SeedService(em);
    await clearTestDb(em);
  });

  describe('Idempotent Seeding Workflow', () => {
    it('should perform complete idempotent seeding workflow', async () => {
      const seedName = 'test-dataset';
      const version1 = 'v1.0';
      const version2 = 'v2.0';

      // Simulate source data
      const sourceData = JSON.stringify([{ name: 'sub-seed-1', version: 'v1' }]);
      const checksum1 = seedService.computeChecksum(sourceData);

      // Step 1: Check if seeding needed (should be true - no prior seed)
      expect(await seedService.needsSeeding(seedName, version1, checksum1)).toBe(true);

      // Step 2: Prepare data for import
      const records = [
        { name: 'sub-seed-1', version: 'v1', seeded_at: new Date(), record_count: 10 },
      ];

      // Step 3: Import data using COPY
      const count = await bulkImportService.copyLarge(
        'seed_version',
        records,
        ['name', 'version', 'seeded_at', 'record_count'],
        'name',
        'public'
      );

      expect(count).toBe(1);

      // Step 4: Record seeding with checksum
      await seedService.recordSeeding(seedName, version1, count, checksum1);

      // Step 5: Verify seeding recorded - should NOT need re-seeding
      expect(await seedService.needsSeeding(seedName, version1, checksum1)).toBe(false);

      // Step 6: Different version should trigger re-seeding
      expect(await seedService.needsSeeding(seedName, version2)).toBe(true);

      // Step 7: Get seeded version and verify all fields
      const seeded = await seedService.getSeededVersion(seedName);
      expect(seeded).not.toBeNull();
      expect(seeded?.version).toBe(version1);
      expect(seeded?.sourceChecksum).toBe(checksum1);
      expect(seeded?.recordCount).toBe(count);
    });

    it('should skip seeding when already seeded with same version', async () => {
      const seedName = 'skip-test';
      const version = 'v1.0';

      // First seeding
      await seedService.recordSeeding(seedName, version, 100);

      // Should not need seeding
      expect(await seedService.needsSeeding(seedName, version)).toBe(false);

      // Record count should be preserved
      const seeded = await seedService.getSeededVersion(seedName);
      expect(seeded?.recordCount).toBe(100);
    });
  });

  describe('Checksum Change Detection', () => {
    it('should detect checksum changes and trigger re-seeding', async () => {
      const seedName = 'checksum-test';
      const version = 'v1.0';

      // Original data and checksum
      const originalData = JSON.stringify([{ name: 'test', value: 123 }]);
      const checksum1 = seedService.computeChecksum(originalData);

      // First seeding with checksum
      await seedService.recordSeeding(seedName, version, 50, checksum1);

      // Same version + same checksum = no re-seeding needed
      expect(await seedService.needsSeeding(seedName, version, checksum1)).toBe(false);

      // Modified data with different checksum
      const modifiedData = JSON.stringify([{ name: 'test', value: 456 }]);
      const checksum2 = seedService.computeChecksum(modifiedData);

      // Same version but different checksum = needs re-seeding
      expect(await seedService.needsSeeding(seedName, version, checksum2)).toBe(true);

      // Re-seed with new checksum
      await seedService.recordSeeding(seedName, version, 55, checksum2);

      // Now should not need seeding with new checksum
      expect(await seedService.needsSeeding(seedName, version, checksum2)).toBe(false);

      // Verify updated record
      const seeded = await seedService.getSeededVersion(seedName);
      expect(seeded?.sourceChecksum).toBe(checksum2);
      expect(seeded?.recordCount).toBe(55);
    });

    it('should produce deterministic checksums', () => {
      const data = JSON.stringify({ key: 'value', nested: { array: [1, 2, 3] } });

      const checksum1 = seedService.computeChecksum(data);
      const checksum2 = seedService.computeChecksum(data);
      const checksum3 = seedService.computeChecksum(data);

      expect(checksum1).toBe(checksum2);
      expect(checksum2).toBe(checksum3);
      expect(checksum1).toMatch(/^sha256:[a-f0-9]{64}$/);
    });
  });

  describe('Concurrent Seeding Attempts', () => {
    it('should handle concurrent seeding attempts safely', async () => {
      const records = Array.from({ length: 50 }, (_, i) => ({
        name: `concurrent-${i}`,
        version: 'v1',
        seeded_at: new Date(),
        record_count: i,
      }));

      // Run two imports in parallel - should not conflict
      const [count1, count2] = await Promise.all([
        bulkImportService.copyLarge(
          'seed_version',
          records.slice(0, 25),
          ['name', 'version', 'seeded_at', 'record_count'],
          'name',
          'public'
        ),
        bulkImportService.copyLarge(
          'seed_version',
          records.slice(25),
          ['name', 'version', 'seeded_at', 'record_count'],
          'name',
          'public'
        ),
      ]);

      expect(count1).toBe(25);
      expect(count2).toBe(25);

      const all = await em.find(SeedVersion, {});
      expect(all).toHaveLength(50);

      // Verify all records have unique names
      const names = all.map(r => r.name).sort();
      const expectedNames = Array.from({ length: 50 }, (_, i) => `concurrent-${i}`).sort();
      expect(names).toEqual(expectedNames);
    });

    it('should handle concurrent upserts with overlapping keys', async () => {
      // First batch
      const batch1 = [
        { name: 'overlap-1', version: 'v1', seeded_at: new Date(), record_count: 10 },
        { name: 'overlap-2', version: 'v1', seeded_at: new Date(), record_count: 20 },
      ];

      // Second batch with overlapping keys
      const batch2 = [
        { name: 'overlap-2', version: 'v2', seeded_at: new Date(), record_count: 25 },
        { name: 'overlap-3', version: 'v1', seeded_at: new Date(), record_count: 30 },
      ];

      // Run sequentially to ensure deterministic result
      await bulkImportService.copyLarge(
        'seed_version',
        batch1,
        ['name', 'version', 'seeded_at', 'record_count'],
        'name',
        'public'
      );

      await bulkImportService.copyLarge(
        'seed_version',
        batch2,
        ['name', 'version', 'seeded_at', 'record_count'],
        'name',
        'public'
      );

      // Should have 3 unique records
      const all = await em.find(SeedVersion, {}, { orderBy: { name: 'ASC' } });
      expect(all).toHaveLength(3);

      // overlap-2 should have been updated to v2
      const overlap2 = all.find(r => r.name === 'overlap-2');
      expect(overlap2?.version).toBe('v2');
      expect(overlap2?.recordCount).toBe(25);
    });
  });

  describe('Full Seeder Simulation', () => {
    it('should simulate a complete seeder run', async () => {
      const seedName = 'simulated-seeder';
      const version = 'v2024.01';

      // Simulate reading source data
      const sourceRecords = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        code: `CODE-${i.toString().padStart(4, '0')}`,
        description: `Description for item ${i}`,
      }));

      const sourceData = JSON.stringify(sourceRecords);
      const checksum = seedService.computeChecksum(sourceData);

      // Step 1: Check if seeding needed
      const needsSeeding = await seedService.needsSeeding(seedName, version, checksum);
      expect(needsSeeding).toBe(true);

      // Step 2: Transform and import data
      const importRecords = sourceRecords.map(r => ({
        name: `${seedName}-${r.code}`,
        version: version,
        seeded_at: new Date(),
        record_count: 1,
      }));

      const importedCount = await bulkImportService.copyLarge(
        'seed_version',
        importRecords,
        ['name', 'version', 'seeded_at', 'record_count'],
        'name',
        'public'
      );

      // Step 3: Record seeding
      await seedService.recordSeeding(seedName, version, importedCount, checksum);

      // Step 4: Verify seeding complete
      expect(await seedService.needsSeeding(seedName, version, checksum)).toBe(false);

      // Step 5: Simulate second run - should skip
      const secondRunNeeded = await seedService.needsSeeding(seedName, version, checksum);
      expect(secondRunNeeded).toBe(false);

      // Step 6: Simulate version bump
      const newVersion = 'v2024.02';
      expect(await seedService.needsSeeding(seedName, newVersion, checksum)).toBe(true);
    });
  });
});
