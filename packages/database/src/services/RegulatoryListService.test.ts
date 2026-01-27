import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb, isDatabaseAvailable, clearTestDb } from '../test-utils.js';
import { RegulatoryListService, type CreateListInput, type AddEntryInput } from './RegulatoryListService.js';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { RegulatoryListEntry } from '../entities/RegulatoryListEntry.js';
import { Substance } from '../entities/Substance.js';
import { ComparisonOperator, Severity } from '../entities/enums/index.js';

describe('RegulatoryListService', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let service: RegulatoryListService;
  let dbAvailable = false;

  // Test substances
  let leadSubstance: Substance;
  let cadmiumSubstance: Substance;

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (dbAvailable) {
      orm = await setupTestDb();
    }
  });

  afterAll(async () => {
    if (dbAvailable && orm) {
      await teardownTestDb();
    }
  });

  beforeEach(async (context) => {
    if (!dbAvailable) {
      context.skip();
      return;
    }
    em = orm.em.fork();
    service = new RegulatoryListService(em);
    await clearTestDb(em);

    // Create test substances
    leadSubstance = new Substance();
    leadSubstance.casNumber = '7439-92-1';
    leadSubstance.primaryName = 'Lead';
    leadSubstance.isSvhc = true;

    cadmiumSubstance = new Substance();
    cadmiumSubstance.casNumber = '7440-43-9';
    cadmiumSubstance.primaryName = 'Cadmium';
    cadmiumSubstance.isSvhc = true;

    em.persist([leadSubstance, cadmiumSubstance]);
    await em.flush();
  });

  describe('createList', () => {
    it('should create a new regulatory list', async () => {
      const input: CreateListInput = {
        code: 'REACH_SVHC',
        name: 'REACH SVHC Candidate List',
        source: 'ECHA',
        version: '2024-01',
        effectiveDate: new Date('2024-01-15'),
        sourceUrl: 'https://echa.europa.eu/candidate-list-table',
        description: 'Substances of Very High Concern',
      };

      const list = await service.createList(input);

      expect(list.id).toBeDefined();
      expect(list.code).toBe('REACH_SVHC');
      expect(list.name).toBe('REACH SVHC Candidate List');
      expect(list.source).toBe('ECHA');
      expect(list.version).toBe('2024-01');
      expect(list.effectiveDate).toEqual(new Date('2024-01-15'));
      expect(list.sourceUrl).toBe('https://echa.europa.eu/candidate-list-table');
      expect(list.description).toBe('Substances of Very High Concern');
      expect(list.isCurrentVersion).toBe(true);
      expect(list.allowTenantExemption).toBe(true);
    });

    it('should create a list with allowTenantExemption=false', async () => {
      const input: CreateListInput = {
        code: 'ROHS_RESTRICTED',
        name: 'RoHS Restricted Substances',
        source: 'EU_ROHS',
        version: '2024-01',
        effectiveDate: new Date('2024-01-01'),
        allowTenantExemption: false,
      };

      const list = await service.createList(input);

      expect(list.allowTenantExemption).toBe(false);
    });

    it('should create a new version with previousVersionId', async () => {
      // Create first version
      const v1 = await service.createList({
        code: 'REACH_SVHC',
        name: 'REACH SVHC Candidate List',
        source: 'ECHA',
        version: '2024-01',
        effectiveDate: new Date('2024-01-15'),
      });

      // Create second version referencing the first
      const v2 = await service.createList({
        code: 'REACH_SVHC',
        name: 'REACH SVHC Candidate List',
        source: 'ECHA',
        version: '2024-06',
        effectiveDate: new Date('2024-06-15'),
        previousVersionId: v1.id,
        isCurrentVersion: true,
      });

      expect(v2.previousVersionId).toBe(v1.id);
      expect(v2.isCurrentVersion).toBe(true);
    });

    it('should throw on duplicate code+version combination', async () => {
      await service.createList({
        code: 'REACH_SVHC',
        name: 'REACH SVHC Candidate List',
        source: 'ECHA',
        version: '2024-01',
        effectiveDate: new Date('2024-01-15'),
      });

      await expect(
        service.createList({
          code: 'REACH_SVHC',
          name: 'Duplicate List',
          source: 'ECHA',
          version: '2024-01', // Same version
          effectiveDate: new Date('2024-01-16'),
        })
      ).rejects.toThrow();
    });
  });

  describe('getCurrentVersion', () => {
    it('should return the current version of a list', async () => {
      // Create old version (not current)
      await service.createList({
        code: 'REACH_SVHC',
        name: 'REACH SVHC Candidate List',
        source: 'ECHA',
        version: '2024-01',
        effectiveDate: new Date('2024-01-15'),
        isCurrentVersion: false,
      });

      // Create current version
      const current = await service.createList({
        code: 'REACH_SVHC',
        name: 'REACH SVHC Candidate List',
        source: 'ECHA',
        version: '2024-06',
        effectiveDate: new Date('2024-06-15'),
        isCurrentVersion: true,
      });

      const result = await service.getCurrentVersion('REACH_SVHC');

      expect(result).toBeDefined();
      expect(result!.id).toBe(current.id);
      expect(result!.version).toBe('2024-06');
    });

    it('should return null for non-existent code', async () => {
      const result = await service.getCurrentVersion('NONEXISTENT');

      expect(result).toBeNull();
    });
  });

  describe('getListsByCodes', () => {
    it('should return current versions for multiple codes', async () => {
      await service.createList({
        code: 'REACH_SVHC',
        name: 'REACH SVHC',
        source: 'ECHA',
        version: '2024-01',
        effectiveDate: new Date('2024-01-15'),
        isCurrentVersion: true,
      });

      await service.createList({
        code: 'ROHS_RESTRICTED',
        name: 'RoHS Restricted',
        source: 'EU_ROHS',
        version: '2024-01',
        effectiveDate: new Date('2024-01-01'),
        isCurrentVersion: true,
      });

      const results = await service.getListsByCodes(['REACH_SVHC', 'ROHS_RESTRICTED']);

      expect(results).toHaveLength(2);
      const codes = results.map(r => r.code);
      expect(codes).toContain('REACH_SVHC');
      expect(codes).toContain('ROHS_RESTRICTED');
    });

    it('should return empty array for empty input', async () => {
      const results = await service.getListsByCodes([]);

      expect(results).toHaveLength(0);
    });

    it('should return only found lists (skip non-existent)', async () => {
      await service.createList({
        code: 'REACH_SVHC',
        name: 'REACH SVHC',
        source: 'ECHA',
        version: '2024-01',
        effectiveDate: new Date('2024-01-15'),
        isCurrentVersion: true,
      });

      const results = await service.getListsByCodes(['REACH_SVHC', 'NONEXISTENT']);

      expect(results).toHaveLength(1);
      expect(results[0]!.code).toBe('REACH_SVHC');
    });
  });

  describe('getVersionHistory', () => {
    it('should return all versions ordered by effectiveDate desc', async () => {
      const v1 = await service.createList({
        code: 'REACH_SVHC',
        name: 'REACH SVHC',
        source: 'ECHA',
        version: '2023-01',
        effectiveDate: new Date('2023-01-15'),
        isCurrentVersion: false,
      });

      const v2 = await service.createList({
        code: 'REACH_SVHC',
        name: 'REACH SVHC',
        source: 'ECHA',
        version: '2024-01',
        effectiveDate: new Date('2024-01-15'),
        previousVersionId: v1.id,
        isCurrentVersion: false,
      });

      const v3 = await service.createList({
        code: 'REACH_SVHC',
        name: 'REACH SVHC',
        source: 'ECHA',
        version: '2024-06',
        effectiveDate: new Date('2024-06-15'),
        previousVersionId: v2.id,
        isCurrentVersion: true,
      });

      const history = await service.getVersionHistory('REACH_SVHC');

      expect(history).toHaveLength(3);
      // Newest first
      expect(history[0]!.version).toBe('2024-06');
      expect(history[1]!.version).toBe('2024-01');
      expect(history[2]!.version).toBe('2023-01');
    });

    it('should return empty array for non-existent code', async () => {
      const history = await service.getVersionHistory('NONEXISTENT');

      expect(history).toHaveLength(0);
    });
  });

  describe('getVersionAtDate', () => {
    it('should return the version effective at a specific date', async () => {
      const v1 = await service.createList({
        code: 'REACH_SVHC',
        name: 'REACH SVHC',
        source: 'ECHA',
        version: '2023-01',
        effectiveDate: new Date('2023-01-15'),
        isCurrentVersion: false,
      });

      await service.createList({
        code: 'REACH_SVHC',
        name: 'REACH SVHC',
        source: 'ECHA',
        version: '2024-01',
        effectiveDate: new Date('2024-01-15'),
        isCurrentVersion: true,
      });

      // Query for a date in 2023 - should get v1
      const result = await service.getVersionAtDate('REACH_SVHC', new Date('2023-06-01'));

      expect(result).toBeDefined();
      expect(result!.id).toBe(v1.id);
      expect(result!.version).toBe('2023-01');
    });

    it('should return null if no version was effective at the date', async () => {
      await service.createList({
        code: 'REACH_SVHC',
        name: 'REACH SVHC',
        source: 'ECHA',
        version: '2024-01',
        effectiveDate: new Date('2024-01-15'),
        isCurrentVersion: true,
      });

      // Query for date before the first version
      const result = await service.getVersionAtDate('REACH_SVHC', new Date('2023-01-01'));

      expect(result).toBeNull();
    });
  });

  describe('addEntry', () => {
    let list: RegulatoryList;

    beforeEach(async () => {
      list = await service.createList({
        code: 'REACH_SVHC',
        name: 'REACH SVHC',
        source: 'ECHA',
        version: '2024-01',
        effectiveDate: new Date('2024-01-15'),
      });
    });

    it('should add an entry to a list', async () => {
      const input: AddEntryInput = {
        substanceId: leadSubstance.id,
        operator: ComparisonOperator.GTE,
        compareValue: '0.1',
        issueType: 'SVHC_CANDIDATE',
        severity: Severity.WARNING,
        legalReference: 'REACH Article 59',
        notes: 'Candidate for authorization',
      };

      const entry = await service.addEntry(list.id, input);

      expect(entry.id).toBeDefined();
      expect(entry.list.id).toBe(list.id);
      expect(entry.substance.id).toBe(leadSubstance.id);
      expect(entry.operator).toBe(ComparisonOperator.GTE);
      expect(entry.compareValue).toBe('0.1');
      expect(entry.issueType).toBe('SVHC_CANDIDATE');
      expect(entry.severity).toBe(Severity.WARNING);
      expect(entry.legalReference).toBe('REACH Article 59');
      expect(entry.notes).toBe('Candidate for authorization');
      // Should capture snapshot
      expect(entry.casNumberSnapshot).toBe('7439-92-1');
      expect(entry.substanceNameSnapshot).toBe('Lead');
    });

    it('should add entry with PRESENT operator (no compareValue)', async () => {
      const input: AddEntryInput = {
        substanceId: leadSubstance.id,
        operator: ComparisonOperator.PRESENT,
        issueType: 'BANNED',
        severity: Severity.BLOCKER,
      };

      const entry = await service.addEntry(list.id, input);

      expect(entry.operator).toBe(ComparisonOperator.PRESENT);
      expect(entry.compareValue).toBeUndefined();
    });

    it('should add entry with conditions', async () => {
      const input: AddEntryInput = {
        substanceId: leadSubstance.id,
        operator: ComparisonOperator.GTE,
        compareValue: '0.1',
        issueType: 'RESTRICTED',
        severity: Severity.BLOCKER,
        conditions: { category: 'children_toys', region: 'EU' },
      };

      const entry = await service.addEntry(list.id, input);

      expect(entry.conditions).toEqual({ category: 'children_toys', region: 'EU' });
    });

    it('should add entry with stoichiometricFactor', async () => {
      const input: AddEntryInput = {
        substanceId: leadSubstance.id,
        operator: ComparisonOperator.GTE,
        compareValue: '0.1',
        issueType: 'RESTRICTED',
        severity: Severity.WARNING,
        stoichiometricFactor: '0.866',
      };

      const entry = await service.addEntry(list.id, input);

      expect(entry.stoichiometricFactor).toBe('0.866');
    });

    it('should throw if list not found', async () => {
      await expect(
        service.addEntry('nonexistent-id', {
          substanceId: leadSubstance.id,
          operator: ComparisonOperator.GTE,
          compareValue: '0.1',
          issueType: 'SVHC_CANDIDATE',
          severity: Severity.WARNING,
        })
      ).rejects.toThrow('Regulatory list not found');
    });

    it('should throw if substance not found', async () => {
      await expect(
        service.addEntry(list.id, {
          substanceId: 'nonexistent-id',
          operator: ComparisonOperator.GTE,
          compareValue: '0.1',
          issueType: 'SVHC_CANDIDATE',
          severity: Severity.WARNING,
        })
      ).rejects.toThrow('Substance not found');
    });

    it('should throw on duplicate substance in same list', async () => {
      await service.addEntry(list.id, {
        substanceId: leadSubstance.id,
        operator: ComparisonOperator.GTE,
        compareValue: '0.1',
        issueType: 'SVHC_CANDIDATE',
        severity: Severity.WARNING,
      });

      await expect(
        service.addEntry(list.id, {
          substanceId: leadSubstance.id,
          operator: ComparisonOperator.GTE,
          compareValue: '0.2',
          issueType: 'SVHC_CANDIDATE',
          severity: Severity.WARNING,
        })
      ).rejects.toThrow();
    });
  });

  describe('getEntriesForList', () => {
    let list: RegulatoryList;

    beforeEach(async () => {
      list = await service.createList({
        code: 'REACH_SVHC',
        name: 'REACH SVHC',
        source: 'ECHA',
        version: '2024-01',
        effectiveDate: new Date('2024-01-15'),
      });

      await service.addEntry(list.id, {
        substanceId: leadSubstance.id,
        operator: ComparisonOperator.GTE,
        compareValue: '0.1',
        issueType: 'SVHC_CANDIDATE',
        severity: Severity.WARNING,
      });

      await service.addEntry(list.id, {
        substanceId: cadmiumSubstance.id,
        operator: ComparisonOperator.GTE,
        compareValue: '0.01',
        issueType: 'SVHC_CANDIDATE',
        severity: Severity.BLOCKER,
      });
    });

    it('should return all entries for a list', async () => {
      const entries = await service.getEntriesForList(list.id);

      expect(entries).toHaveLength(2);
      const casNumbers = entries.map(e => e.casNumberSnapshot);
      expect(casNumbers).toContain('7439-92-1');
      expect(casNumbers).toContain('7440-43-9');
    });

    it('should return entries with populated substance relation', async () => {
      const entries = await service.getEntriesForList(list.id, { populate: ['substance'] });

      expect(entries).toHaveLength(2);
      expect(entries[0]!.substance.primaryName).toBeDefined();
    });

    it('should return empty array for list with no entries', async () => {
      const emptyList = await service.createList({
        code: 'EMPTY_LIST',
        name: 'Empty List',
        source: 'TEST',
        version: '1.0',
        effectiveDate: new Date(),
      });

      const entries = await service.getEntriesForList(emptyList.id);

      expect(entries).toHaveLength(0);
    });
  });

  describe('getEntriesForLists', () => {
    let list1: RegulatoryList;
    let list2: RegulatoryList;

    beforeEach(async () => {
      list1 = await service.createList({
        code: 'REACH_SVHC',
        name: 'REACH SVHC',
        source: 'ECHA',
        version: '2024-01',
        effectiveDate: new Date('2024-01-15'),
      });

      list2 = await service.createList({
        code: 'ROHS_RESTRICTED',
        name: 'RoHS Restricted',
        source: 'EU_ROHS',
        version: '2024-01',
        effectiveDate: new Date('2024-01-01'),
      });

      await service.addEntry(list1.id, {
        substanceId: leadSubstance.id,
        operator: ComparisonOperator.GTE,
        compareValue: '0.1',
        issueType: 'SVHC_CANDIDATE',
        severity: Severity.WARNING,
      });

      await service.addEntry(list2.id, {
        substanceId: cadmiumSubstance.id,
        operator: ComparisonOperator.GTE,
        compareValue: '0.01',
        issueType: 'RESTRICTED',
        severity: Severity.BLOCKER,
      });
    });

    it('should return entries for multiple lists', async () => {
      const entries = await service.getEntriesForLists([list1.id, list2.id]);

      expect(entries).toHaveLength(2);
    });

    it('should return empty array for empty input', async () => {
      const entries = await service.getEntriesForLists([]);

      expect(entries).toHaveLength(0);
    });
  });

  describe('findEntriesByCas', () => {
    beforeEach(async () => {
      // Create two lists with lead entries
      const list1 = await service.createList({
        code: 'REACH_SVHC',
        name: 'REACH SVHC',
        source: 'ECHA',
        version: '2024-01',
        effectiveDate: new Date('2024-01-15'),
        isCurrentVersion: true,
      });

      const list2 = await service.createList({
        code: 'ROHS_RESTRICTED',
        name: 'RoHS Restricted',
        source: 'EU_ROHS',
        version: '2024-01',
        effectiveDate: new Date('2024-01-01'),
        isCurrentVersion: true,
      });

      // Create an old version (not current)
      const oldList = await service.createList({
        code: 'REACH_SVHC',
        name: 'REACH SVHC',
        source: 'ECHA',
        version: '2023-01',
        effectiveDate: new Date('2023-01-15'),
        isCurrentVersion: false,
      });

      await service.addEntry(list1.id, {
        substanceId: leadSubstance.id,
        operator: ComparisonOperator.GTE,
        compareValue: '0.1',
        issueType: 'SVHC_CANDIDATE',
        severity: Severity.WARNING,
      });

      await service.addEntry(list2.id, {
        substanceId: leadSubstance.id,
        operator: ComparisonOperator.GTE,
        compareValue: '0.01',
        issueType: 'RESTRICTED',
        severity: Severity.BLOCKER,
      });

      // Add lead to old version (should not be found)
      await service.addEntry(oldList.id, {
        substanceId: leadSubstance.id,
        operator: ComparisonOperator.GTE,
        compareValue: '0.2',
        issueType: 'SVHC_CANDIDATE',
        severity: Severity.WARNING,
      });
    });

    it('should find entries by CAS number across current lists only', async () => {
      const entries = await service.findEntriesByCas('7439-92-1');

      // Should only find 2 entries (from current versions)
      expect(entries).toHaveLength(2);
      const listCodes = entries.map(e => e.list.code);
      expect(listCodes).toContain('REACH_SVHC');
      expect(listCodes).toContain('ROHS_RESTRICTED');
    });

    it('should return empty array for CAS not in any list', async () => {
      const entries = await service.findEntriesByCas('9999-99-9');

      expect(entries).toHaveLength(0);
    });
  });

  describe('updateCurrentVersion', () => {
    it('should update current version when creating a new version', async () => {
      const v1 = await service.createList({
        code: 'REACH_SVHC',
        name: 'REACH SVHC',
        source: 'ECHA',
        version: '2024-01',
        effectiveDate: new Date('2024-01-15'),
        isCurrentVersion: true,
      });

      // Create new version and mark as current
      const v2 = await service.createList({
        code: 'REACH_SVHC',
        name: 'REACH SVHC',
        source: 'ECHA',
        version: '2024-06',
        effectiveDate: new Date('2024-06-15'),
        previousVersionId: v1.id,
        isCurrentVersion: true,
      });

      // Mark v1 as not current
      await service.updateCurrentVersion(v1.id, false);

      // Verify
      const current = await service.getCurrentVersion('REACH_SVHC');
      expect(current!.id).toBe(v2.id);

      // Check v1 is no longer current
      const oldVersion = await em.findOne(RegulatoryList, { id: v1.id });
      expect(oldVersion!.isCurrentVersion).toBe(false);
    });
  });

  describe('setSupersededDate', () => {
    it('should set the superseded date on an old version', async () => {
      const v1 = await service.createList({
        code: 'REACH_SVHC',
        name: 'REACH SVHC',
        source: 'ECHA',
        version: '2024-01',
        effectiveDate: new Date('2024-01-15'),
      });

      const supersededDate = new Date('2024-06-14');
      await service.setSupersededDate(v1.id, supersededDate);

      const updated = await em.findOne(RegulatoryList, { id: v1.id });
      expect(updated!.supersededDate).toEqual(supersededDate);
    });
  });
});
