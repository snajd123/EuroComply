import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '../test-utils.js';
import { RegulatoryListEntry } from './RegulatoryListEntry.js';
import { RegulatoryList } from './RegulatoryList.js';
import { Substance } from './Substance.js';
import { ComparisonOperator, Severity } from './enums/index.js';
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';

describe('RegulatoryListEntry entity', () => {
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

  function createRegulatoryList(): RegulatoryList {
    const list = new RegulatoryList();
    list.code = 'REACH_SVHC';
    list.name = 'REACH SVHC Candidate List';
    list.source = 'ECHA';
    list.version = '2024-01';
    list.effectiveDate = new Date('2024-01-15');
    return list;
  }

  function createSubstance(): Substance {
    const substance = new Substance();
    substance.casNumber = '127-19-5';
    substance.primaryName = 'N,N-Dimethylacetamide';
    return substance;
  }

  it('should create an entry with required fields', async () => {
    const list = createRegulatoryList();
    const substance = createSubstance();

    const entry = new RegulatoryListEntry();
    entry.list = list;
    entry.substance = substance;
    entry.casNumberSnapshot = substance.casNumber;
    entry.substanceNameSnapshot = substance.primaryName;
    entry.operator = ComparisonOperator.LTE;
    entry.compareValue = '0.1';
    entry.issueType = 'SVHC_CANDIDATE';
    entry.severity = Severity.BLOCKER;

    em.persist(list);
    em.persist(substance);
    em.persist(entry);
    await em.flush();
    em.clear();

    const found = await em.findOne(RegulatoryListEntry, { id: entry.id }, { populate: ['list', 'substance'] });
    expect(found).toBeDefined();
    expect(found?.list.code).toBe('REACH_SVHC');
    expect(found?.substance.casNumber).toBe('127-19-5');
    expect(found?.casNumberSnapshot).toBe('127-19-5');
    expect(found?.substanceNameSnapshot).toBe('N,N-Dimethylacetamide');
    expect(found?.operator).toBe(ComparisonOperator.LTE);
    // Decimal type returns full precision from PostgreSQL
    expect(parseFloat(found?.compareValue ?? '0')).toBe(0.1);
    expect(found?.issueType).toBe('SVHC_CANDIDATE');
    expect(found?.severity).toBe(Severity.BLOCKER);
  });

  it('should support forensic snapshots preserving historical data', async () => {
    const list = createRegulatoryList();
    const substance = createSubstance();

    const entry = new RegulatoryListEntry();
    entry.list = list;
    entry.substance = substance;
    // Snapshot captures state at time of entry creation
    entry.casNumberSnapshot = '127-19-5';
    entry.substanceNameSnapshot = 'N,N-Dimethylacetamide';
    entry.operator = ComparisonOperator.PRESENT;
    entry.issueType = 'RESTRICTED';
    entry.severity = Severity.WARNING;

    em.persist(list);
    em.persist(substance);
    em.persist(entry);
    await em.flush();
    em.clear();

    // Simulate substance being updated (name change)
    const updatedSubstance = await em.findOneOrFail(Substance, { casNumber: '127-19-5' });
    updatedSubstance.primaryName = 'Updated Name';
    await em.flush();
    em.clear();

    // Entry snapshots should preserve original values
    const found = await em.findOne(RegulatoryListEntry, { id: entry.id }, { populate: ['substance'] });
    expect(found?.substanceNameSnapshot).toBe('N,N-Dimethylacetamide');
    expect(found?.substance.primaryName).toBe('Updated Name');
  });

  it('should support PRESENT operator without compareValue', async () => {
    const list = createRegulatoryList();
    const substance = createSubstance();

    const entry = new RegulatoryListEntry();
    entry.list = list;
    entry.substance = substance;
    entry.casNumberSnapshot = substance.casNumber;
    entry.substanceNameSnapshot = substance.primaryName;
    entry.operator = ComparisonOperator.PRESENT;
    entry.issueType = 'BANNED_SUBSTANCE';
    entry.severity = Severity.BLOCKER;
    // compareValue is null for PRESENT operator

    em.persist(list);
    em.persist(substance);
    em.persist(entry);
    await em.flush();
    em.clear();

    const found = await em.findOne(RegulatoryListEntry, { id: entry.id });
    expect(found?.operator).toBe(ComparisonOperator.PRESENT);
    expect(found?.compareValue).toBeNull();
  });

  it('should support all comparison operators', async () => {
    const list = createRegulatoryList();
    const substance = createSubstance();

    const operators = [
      ComparisonOperator.GT,
      ComparisonOperator.GTE,
      ComparisonOperator.LT,
      ComparisonOperator.LTE,
      ComparisonOperator.EQ,
      ComparisonOperator.PRESENT,
      ComparisonOperator.ABSENT,
    ];

    for (const op of operators) {
      const entry = new RegulatoryListEntry();
      entry.list = list;
      entry.substance = substance;
      entry.casNumberSnapshot = substance.casNumber;
      entry.substanceNameSnapshot = substance.primaryName;
      entry.operator = op;
      entry.issueType = `TEST_${op}`;
      entry.severity = Severity.INFO;

      expect(entry.operator).toBe(op);
    }
  });

  it('should support all severity levels', async () => {
    const list = createRegulatoryList();
    const substance = createSubstance();

    const severities = [Severity.BLOCKER, Severity.WARNING, Severity.INFO];

    for (const sev of severities) {
      const entry = new RegulatoryListEntry();
      entry.list = list;
      entry.substance = substance;
      entry.casNumberSnapshot = substance.casNumber;
      entry.substanceNameSnapshot = substance.primaryName;
      entry.operator = ComparisonOperator.PRESENT;
      entry.issueType = 'TEST';
      entry.severity = sev;

      expect(entry.severity).toBe(sev);
    }
  });

  it('should support stoichiometricFactor', async () => {
    const list = createRegulatoryList();
    const substance = createSubstance();

    const entry = new RegulatoryListEntry();
    entry.list = list;
    entry.substance = substance;
    entry.casNumberSnapshot = substance.casNumber;
    entry.substanceNameSnapshot = substance.primaryName;
    entry.operator = ComparisonOperator.LTE;
    entry.compareValue = '0.1';
    entry.issueType = 'THRESHOLD';
    entry.severity = Severity.WARNING;
    entry.stoichiometricFactor = '1.5';

    em.persist(list);
    em.persist(substance);
    em.persist(entry);
    await em.flush();
    em.clear();

    const found = await em.findOne(RegulatoryListEntry, { id: entry.id });
    // Decimal type returns full precision from PostgreSQL
    expect(parseFloat(found?.stoichiometricFactor ?? '0')).toBe(1.5);
  });

  it('should support conditions JSONB field', async () => {
    const list = createRegulatoryList();
    const substance = createSubstance();

    const conditions = {
      categoryRestriction: ['cosmetics', 'toys'],
      maxConcentration: 0.1,
      region: 'EU',
    };

    const entry = new RegulatoryListEntry();
    entry.list = list;
    entry.substance = substance;
    entry.casNumberSnapshot = substance.casNumber;
    entry.substanceNameSnapshot = substance.primaryName;
    entry.operator = ComparisonOperator.LTE;
    entry.compareValue = '0.1';
    entry.issueType = 'CONDITIONAL_RESTRICTION';
    entry.severity = Severity.WARNING;
    entry.conditions = conditions;

    em.persist(list);
    em.persist(substance);
    em.persist(entry);
    await em.flush();
    em.clear();

    const found = await em.findOne(RegulatoryListEntry, { id: entry.id });
    expect(found?.conditions).toEqual(conditions);
    expect(found?.conditions?.['categoryRestriction']).toContain('cosmetics');
    expect(found?.conditions?.['region']).toBe('EU');
  });

  it('should support legalReference and notes', async () => {
    const list = createRegulatoryList();
    const substance = createSubstance();

    const entry = new RegulatoryListEntry();
    entry.list = list;
    entry.substance = substance;
    entry.casNumberSnapshot = substance.casNumber;
    entry.substanceNameSnapshot = substance.primaryName;
    entry.operator = ComparisonOperator.PRESENT;
    entry.issueType = 'SVHC';
    entry.severity = Severity.BLOCKER;
    entry.legalReference = 'REACH Regulation (EC) No 1907/2006, Article 57(a)';
    entry.notes = 'Added to candidate list on 2024-01-15 due to carcinogenic properties';

    em.persist(list);
    em.persist(substance);
    em.persist(entry);
    await em.flush();
    em.clear();

    const found = await em.findOne(RegulatoryListEntry, { id: entry.id });
    expect(found?.legalReference).toBe('REACH Regulation (EC) No 1907/2006, Article 57(a)');
    expect(found?.notes).toBe('Added to candidate list on 2024-01-15 due to carcinogenic properties');
  });

  it('should enforce unique constraint on list + substance', async () => {
    const list = createRegulatoryList();
    const substance = createSubstance();

    const entry1 = new RegulatoryListEntry();
    entry1.list = list;
    entry1.substance = substance;
    entry1.casNumberSnapshot = substance.casNumber;
    entry1.substanceNameSnapshot = substance.primaryName;
    entry1.operator = ComparisonOperator.PRESENT;
    entry1.issueType = 'SVHC';
    entry1.severity = Severity.BLOCKER;

    em.persist(list);
    em.persist(substance);
    em.persist(entry1);
    await em.flush();

    // Create duplicate entry for same list + substance
    const entry2 = new RegulatoryListEntry();
    entry2.list = list;
    entry2.substance = substance;
    entry2.casNumberSnapshot = substance.casNumber;
    entry2.substanceNameSnapshot = substance.primaryName;
    entry2.operator = ComparisonOperator.LTE;
    entry2.issueType = 'DIFFERENT_TYPE';
    entry2.severity = Severity.WARNING;

    em.persist(entry2);
    await expect(em.flush()).rejects.toThrow();
  });

  it('should allow same substance on different lists', async () => {
    const list1 = createRegulatoryList();
    list1.code = 'REACH_SVHC';

    const list2 = new RegulatoryList();
    list2.code = 'ROHS_RESTRICTED';
    list2.name = 'RoHS Restricted Substances';
    list2.source = 'EU_ROHS';
    list2.version = '2024-01';
    list2.effectiveDate = new Date('2024-01-01');

    const substance = createSubstance();

    const entry1 = new RegulatoryListEntry();
    entry1.list = list1;
    entry1.substance = substance;
    entry1.casNumberSnapshot = substance.casNumber;
    entry1.substanceNameSnapshot = substance.primaryName;
    entry1.operator = ComparisonOperator.PRESENT;
    entry1.issueType = 'SVHC';
    entry1.severity = Severity.BLOCKER;

    const entry2 = new RegulatoryListEntry();
    entry2.list = list2;
    entry2.substance = substance;
    entry2.casNumberSnapshot = substance.casNumber;
    entry2.substanceNameSnapshot = substance.primaryName;
    entry2.operator = ComparisonOperator.LTE;
    entry2.compareValue = '0.1';
    entry2.issueType = 'RESTRICTED';
    entry2.severity = Severity.WARNING;

    em.persist(list1);
    em.persist(list2);
    em.persist(substance);
    em.persist(entry1);
    em.persist(entry2);
    await em.flush();
    em.clear();

    const entries = await em.find(RegulatoryListEntry, { substance: { casNumber: '127-19-5' } });
    expect(entries).toHaveLength(2);
  });

  it('should allow null for optional fields', async () => {
    const list = createRegulatoryList();
    const substance = createSubstance();

    const entry = new RegulatoryListEntry();
    entry.list = list;
    entry.substance = substance;
    entry.casNumberSnapshot = substance.casNumber;
    entry.substanceNameSnapshot = substance.primaryName;
    entry.operator = ComparisonOperator.PRESENT;
    entry.issueType = 'BANNED';
    entry.severity = Severity.BLOCKER;
    // compareValue, stoichiometricFactor, conditions, legalReference, notes not set

    em.persist(list);
    em.persist(substance);
    em.persist(entry);
    await em.flush();
    em.clear();

    const found = await em.findOne(RegulatoryListEntry, { id: entry.id });
    expect(found?.compareValue).toBeNull();
    expect(found?.stoichiometricFactor).toBeNull();
    expect(found?.conditions).toBeNull();
    expect(found?.legalReference).toBeNull();
    expect(found?.notes).toBeNull();
  });

  it('should link to substance and list via relationships', () => {
    const list = createRegulatoryList();
    const substance = createSubstance();

    const entry = new RegulatoryListEntry();
    entry.list = list;
    entry.substance = substance;
    entry.casNumberSnapshot = substance.casNumber;
    entry.substanceNameSnapshot = substance.primaryName;
    entry.operator = ComparisonOperator.PRESENT;
    entry.issueType = 'TEST';
    entry.severity = Severity.INFO;

    expect(entry.list).toBe(list);
    expect(entry.substance).toBe(substance);
    expect(entry.list.code).toBe('REACH_SVHC');
    expect(entry.substance.casNumber).toBe('127-19-5');
  });
});
