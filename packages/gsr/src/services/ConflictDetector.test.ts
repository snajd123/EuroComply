// packages/gsr/src/services/ConflictDetector.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';
import { Substance } from '@eurocomply/database';
import { SubstanceListEntry } from '../entities/SubstanceListEntry.js';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { ProductScope } from '../enums/ProductScope.js';
import { ThresholdUnit } from '../enums/ThresholdUnit.js';
import { ThresholdOperator } from '../enums/ThresholdOperator.js';
import { ListingStatus } from '../enums/ListingStatus.js';
import {
  ConflictDetector,
  ConflictType,
  ConflictSeverity,
  type NewEntryInput,
} from './ConflictDetector.js';

const dbAvailable = await isDatabaseAvailable();

describe('ConflictDetector', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let substance: Substance;
  let list: RegulatoryList;
  let detector: ConflictDetector;

  beforeAll(async () => {
    if (dbAvailable) {
      orm = await setupGsrTestDb();
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await teardownGsrTestDb();
    }
  });

  beforeEach(async () => {
    if (dbAvailable) {
      await clearGsrTestDb(orm.em);
      em = orm.em.fork();
      detector = new ConflictDetector(em);

      // Create test data
      substance = em.create(Substance, {
        casNumber: '1309-60-0',
        primaryName: 'Lead dioxide',
      });
      list = em.create(RegulatoryList, {
        code: 'REACH_ANNEX_XVII',
        name: 'REACH Annex XVII',
        jurisdiction: 'EU',
        publisher: 'ECHA',
      });
      await em.persistAndFlush([substance, list]);
    }
  });

  describe('detect', () => {
    it.skipIf(!dbAvailable)('should detect threshold mismatch for same scope', async () => {
      // Arrange: Create existing entry with 0.1% threshold for JEWELRY
      const existingEntry = em.create(SubstanceListEntry, {
        substance,
        regulatoryList: list,
        status: ListingStatus.RESTRICTED,
        scopes: [ProductScope.JEWELRY],
        threshold: 0.1,
        thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
        thresholdOperator: ThresholdOperator.LTE,
      });
      await em.persistAndFlush(existingEntry);

      // Act: Try to add new entry with stricter threshold (0.05%) for same scope
      // This is a THRESHOLD_MISMATCH because we're trying to add a stricter rule
      const newEntry: NewEntryInput = {
        substanceId: substance.id,
        regulatoryListId: list.id,
        status: ListingStatus.RESTRICTED,
        scopes: [ProductScope.JEWELRY],
        threshold: 0.05,
        thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
      };

      const conflicts = await detector.detect(newEntry);

      // Assert
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe(ConflictType.THRESHOLD_MISMATCH);
      expect(conflicts[0].severity).toBe(ConflictSeverity.ERROR);
      expect(conflicts[0].existingEntryId).toBe(existingEntry.id);
      expect(conflicts[0].message.toLowerCase()).toContain('threshold');
    });

    it.skipIf(!dbAvailable)('should detect stricter existing threshold', async () => {
      // Arrange: Create existing entry with stricter threshold (0.01%)
      const existingEntry = em.create(SubstanceListEntry, {
        substance,
        regulatoryList: list,
        status: ListingStatus.RESTRICTED,
        scopes: [ProductScope.TOYS],
        threshold: 0.01,
        thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
        thresholdOperator: ThresholdOperator.LTE,
      });
      await em.persistAndFlush(existingEntry);

      // Act: Try to add new entry with less strict threshold (0.05%)
      const newEntry: NewEntryInput = {
        substanceId: substance.id,
        regulatoryListId: list.id,
        status: ListingStatus.RESTRICTED,
        scopes: [ProductScope.TOYS],
        threshold: 0.05,
        thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
      };

      const conflicts = await detector.detect(newEntry);

      // Assert
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe(ConflictType.STRICTER_EXISTS);
      expect(conflicts[0].severity).toBe(ConflictSeverity.WARNING);
      expect(conflicts[0].existingEntryId).toBe(existingEntry.id);
    });

    it.skipIf(!dbAvailable)('should detect conflict when parent scope exists', async () => {
      // Arrange: Create existing entry for parent scope CONSUMER_GOODS
      const existingEntry = em.create(SubstanceListEntry, {
        substance,
        regulatoryList: list,
        status: ListingStatus.RESTRICTED,
        scopes: [ProductScope.CONSUMER_GOODS],
        threshold: 0.05,
        thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
        thresholdOperator: ThresholdOperator.LTE,
      });
      await em.persistAndFlush(existingEntry);

      // Act: Try to add new entry for child scope TOYS with different threshold
      const newEntry: NewEntryInput = {
        substanceId: substance.id,
        regulatoryListId: list.id,
        status: ListingStatus.RESTRICTED,
        scopes: [ProductScope.TOYS],
        threshold: 0.1,
        thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
      };

      const conflicts = await detector.detect(newEntry);

      // Assert
      expect(conflicts.length).toBeGreaterThanOrEqual(1);
      const scopeConflict = conflicts.find((c) => c.type === ConflictType.SCOPE_OVERLAP);
      expect(scopeConflict).toBeDefined();
      expect(scopeConflict!.severity).toBe(ConflictSeverity.WARNING);
      expect(scopeConflict!.existingEntryId).toBe(existingEntry.id);
    });

    it.skipIf(!dbAvailable)('should detect conflict when child scope exists', async () => {
      // Arrange: Create existing entry for child scope TOYS
      const existingEntry = em.create(SubstanceListEntry, {
        substance,
        regulatoryList: list,
        status: ListingStatus.RESTRICTED,
        scopes: [ProductScope.TOYS],
        threshold: 0.01,
        thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
        thresholdOperator: ThresholdOperator.LTE,
      });
      await em.persistAndFlush(existingEntry);

      // Act: Try to add new entry for parent scope CONSUMER_GOODS
      const newEntry: NewEntryInput = {
        substanceId: substance.id,
        regulatoryListId: list.id,
        status: ListingStatus.RESTRICTED,
        scopes: [ProductScope.CONSUMER_GOODS],
        threshold: 0.05,
        thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
      };

      const conflicts = await detector.detect(newEntry);

      // Assert
      expect(conflicts.length).toBeGreaterThanOrEqual(1);
      const scopeConflict = conflicts.find((c) => c.type === ConflictType.SCOPE_OVERLAP);
      expect(scopeConflict).toBeDefined();
      expect(scopeConflict!.severity).toBe(ConflictSeverity.WARNING);
      expect(scopeConflict!.existingEntryId).toBe(existingEntry.id);
    });

    it.skipIf(!dbAvailable)('should detect BANNED vs RESTRICTED contradiction', async () => {
      // Arrange: Create existing entry with BANNED status
      const existingEntry = em.create(SubstanceListEntry, {
        substance,
        regulatoryList: list,
        status: ListingStatus.BANNED,
        scopes: [ProductScope.COSMETICS],
      });
      await em.persistAndFlush(existingEntry);

      // Act: Try to add new entry with RESTRICTED status for same scope
      const newEntry: NewEntryInput = {
        substanceId: substance.id,
        regulatoryListId: list.id,
        status: ListingStatus.RESTRICTED,
        scopes: [ProductScope.COSMETICS],
        threshold: 0.05,
        thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
      };

      const conflicts = await detector.detect(newEntry);

      // Assert
      expect(conflicts.length).toBeGreaterThanOrEqual(1);
      const statusConflict = conflicts.find((c) => c.type === ConflictType.STATUS_CONTRADICTION);
      expect(statusConflict).toBeDefined();
      expect(statusConflict!.severity).toBe(ConflictSeverity.ERROR);
      expect(statusConflict!.existingEntryId).toBe(existingEntry.id);
    });

    it.skipIf(!dbAvailable)('should return empty array when no conflicts', async () => {
      // Arrange: Create existing entry for unrelated scope
      const existingEntry = em.create(SubstanceListEntry, {
        substance,
        regulatoryList: list,
        status: ListingStatus.RESTRICTED,
        scopes: [ProductScope.VEHICLES],
        threshold: 0.05,
        thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
        thresholdOperator: ThresholdOperator.LTE,
      });
      await em.persistAndFlush(existingEntry);

      // Act: Try to add new entry for completely unrelated scope
      const newEntry: NewEntryInput = {
        substanceId: substance.id,
        regulatoryListId: list.id,
        status: ListingStatus.RESTRICTED,
        scopes: [ProductScope.COSMETICS],
        threshold: 0.05,
        thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
      };

      const conflicts = await detector.detect(newEntry);

      // Assert
      expect(conflicts).toHaveLength(0);
    });

    it.skipIf(!dbAvailable)('should detect incomparable units as warning', async () => {
      // Arrange: Create existing entry with mg/cm2 unit
      const existingEntry = em.create(SubstanceListEntry, {
        substance,
        regulatoryList: list,
        status: ListingStatus.RESTRICTED,
        scopes: [ProductScope.JEWELRY],
        threshold: 0.5,
        thresholdUnit: ThresholdUnit.MG_PER_CM2,
        thresholdOperator: ThresholdOperator.LTE,
      });
      await em.persistAndFlush(existingEntry);

      // Act: Try to add new entry with % by weight (incomparable)
      const newEntry: NewEntryInput = {
        substanceId: substance.id,
        regulatoryListId: list.id,
        status: ListingStatus.RESTRICTED,
        scopes: [ProductScope.JEWELRY],
        threshold: 0.05,
        thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
      };

      const conflicts = await detector.detect(newEntry);

      // Assert
      expect(conflicts.length).toBeGreaterThanOrEqual(1);
      const thresholdConflict = conflicts.find((c) => c.type === ConflictType.THRESHOLD_MISMATCH);
      expect(thresholdConflict).toBeDefined();
      expect(thresholdConflict!.severity).toBe(ConflictSeverity.WARNING);
      expect(thresholdConflict!.message).toContain('incomparable');
    });
  });
});
