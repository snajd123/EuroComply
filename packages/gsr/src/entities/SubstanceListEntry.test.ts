import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';
import { Substance } from '@eurocomply/database';
import { SubstanceListEntry } from './SubstanceListEntry.js';
import { RegulatoryList } from './RegulatoryList.js';
import { SubstanceGroup } from './SubstanceGroup.js';
import { ProductScope } from '../enums/ProductScope.js';
import { ThresholdUnit } from '../enums/ThresholdUnit.js';
import { ThresholdOperator } from '../enums/ThresholdOperator.js';
import { ListingStatus } from '../enums/ListingStatus.js';

const dbAvailable = await isDatabaseAvailable();

describe('SubstanceListEntry', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let substance: Substance;
  let list: RegulatoryList;

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

  it.skipIf(!dbAvailable)('should create entry with substance reference', async () => {
    const entry = em.create(SubstanceListEntry, {
      substance,
      regulatoryList: list,
      status: ListingStatus.RESTRICTED,
      scopes: [ProductScope.JEWELRY],
      threshold: 0.05,
      thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
      thresholdOperator: ThresholdOperator.LTE,
      sourceReference: 'Entry 63',
    });

    await em.persistAndFlush(entry);
    em.clear();

    const found = await em.findOne(SubstanceListEntry, { substance }, { populate: ['substance', 'regulatoryList'] });
    expect(found).toBeTruthy();
    expect(found!.substance!.casNumber).toBe('1309-60-0');
    expect(found!.regulatoryList.code).toBe('REACH_ANNEX_XVII');
    expect(found!.status).toBe(ListingStatus.RESTRICTED);
    expect(found!.scopes).toContain(ProductScope.JEWELRY);
    expect(parseFloat(found!.threshold!)).toBe(0.05);
  });

  it.skipIf(!dbAvailable)('should create entry with group reference instead of substance', async () => {
    const group = em.create(SubstanceGroup, {
      code: 'LEAD_COMPOUNDS',
      name: 'Lead and its compounds',
    });
    await em.persistAndFlush(group);

    const entry = em.create(SubstanceListEntry, {
      substanceGroup: group,
      regulatoryList: list,
      status: ListingStatus.RESTRICTED,
      scopes: [ProductScope.CONSUMER_GOODS],
      sourceReference: 'Entry 63',
    });

    await em.persistAndFlush(entry);
    em.clear();

    const found = await em.findOne(SubstanceListEntry, { substanceGroup: group }, { populate: ['substanceGroup'] });
    expect(found).toBeTruthy();
    expect(found!.substanceGroup!.code).toBe('LEAD_COMPOUNDS');
    expect(found!.substance).toBeNull();
  });

  it.skipIf(!dbAvailable)('should store multiple scopes as array', async () => {
    const entry = em.create(SubstanceListEntry, {
      substance,
      regulatoryList: list,
      status: ListingStatus.RESTRICTED,
      scopes: [ProductScope.TOYS, ProductScope.CHILDCARE_ARTICLES, ProductScope.JEWELRY],
      scopeRaw: 'toys, childcare articles, or jewelry',
    });

    await em.persistAndFlush(entry);
    em.clear();

    const found = await em.findOne(SubstanceListEntry, { substance });
    expect(found!.scopes).toHaveLength(3);
    expect(found!.scopes).toContain(ProductScope.TOYS);
    expect(found!.scopes).toContain(ProductScope.CHILDCARE_ARTICLES);
    expect(found!.scopes).toContain(ProductScope.JEWELRY);
    expect(found!.scopeRaw).toBe('toys, childcare articles, or jewelry');
  });

  it.skipIf(!dbAvailable)('should store conditions as JSONB', async () => {
    const conditions = {
      exemptions: ['components not accessible to children'],
      testMethod: 'EN 71-3',
      migrationLimit: true,
    };

    const entry = em.create(SubstanceListEntry, {
      substance,
      regulatoryList: list,
      status: ListingStatus.RESTRICTED,
      scopes: [ProductScope.TOYS],
      conditions,
    });

    await em.persistAndFlush(entry);
    em.clear();

    const found = await em.findOne(SubstanceListEntry, { substance });
    expect(found!.conditions).toEqual(conditions);
  });

  it.skipIf(!dbAvailable)('should store listing and effective dates', async () => {
    const listingDate = new Date('2008-10-28');
    const effectiveDate = new Date('2009-04-28');
    const sunsetDate = new Date('2025-12-31');

    const entry = em.create(SubstanceListEntry, {
      substance,
      regulatoryList: list,
      status: ListingStatus.LISTED,
      scopes: [ProductScope.ALL_PRODUCTS],
      listingDate,
      effectiveDate,
      sunsetDate,
    });

    await em.persistAndFlush(entry);
    em.clear();

    const found = await em.findOne(SubstanceListEntry, { substance });
    expect(found!.listingDate).toEqual(listingDate);
    expect(found!.effectiveDate).toEqual(effectiveDate);
    expect(found!.sunsetDate).toEqual(sunsetDate);
  });
});
