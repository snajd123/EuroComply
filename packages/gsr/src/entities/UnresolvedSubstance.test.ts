import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';
import { Substance } from '@eurocomply/database';
import { UnresolvedSubstance, UnresolvedSource } from './UnresolvedSubstance.js';
import { UnresolvedStatus } from '../enums/UnresolvedStatus.js';
import { ResolutionType } from '../enums/ResolutionType.js';

const dbAvailable = await isDatabaseAvailable();

describe('UnresolvedSubstance', () => {
  let orm: MikroORM;
  let em: EntityManager;

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
    }
  });

  it.skipIf(!dbAvailable)('should create unresolved substance with raw name', async () => {
    const unresolved = em.create(UnresolvedSubstance, {
      rawName: 'Proprietary Ingredient X',
      source: UnresolvedSource.CUSTOMER_UPLOAD,
      status: UnresolvedStatus.PENDING,
    });

    await em.persistAndFlush(unresolved);
    em.clear();

    const found = await em.findOne(UnresolvedSubstance, { rawName: 'Proprietary Ingredient X' });
    expect(found).toBeTruthy();
    expect(found!.status).toBe(UnresolvedStatus.PENDING);
    expect(found!.occurrenceCount).toBe(1);
  });

  it.skipIf(!dbAvailable)('should create with raw CAS number', async () => {
    const unresolved = em.create(UnresolvedSubstance, {
      rawName: 'Unknown substance',
      rawCasNumber: '12345-67-8',
      source: UnresolvedSource.EXTRACTION,
      status: UnresolvedStatus.PENDING,
    });

    await em.persistAndFlush(unresolved);
    em.clear();

    const found = await em.findOne(UnresolvedSubstance, { rawCasNumber: '12345-67-8' });
    expect(found).toBeTruthy();
    expect(found!.rawCasNumber).toBe('12345-67-8');
  });

  it.skipIf(!dbAvailable)('should track resolution to existing substance', async () => {
    const substance = em.create(Substance, {
      casNumber: '1309-60-0',
      primaryName: 'Lead dioxide',
    });
    await em.persistAndFlush(substance);

    const unresolved = em.create(UnresolvedSubstance, {
      rawName: 'PbO2',
      source: UnresolvedSource.EXTRACTION,
      status: UnresolvedStatus.RESOLVED,
      resolutionType: ResolutionType.MANUAL_MATCH,
      resolvedSubstance: substance,
      resolvedAt: new Date(),
      resolvedBy: 'admin@example.com',
    });

    await em.persistAndFlush(unresolved);
    em.clear();

    const found = await em.findOne(UnresolvedSubstance, { rawName: 'PbO2' }, { populate: ['resolvedSubstance'] });
    expect(found!.resolvedSubstance).toBeTruthy();
    expect(found!.resolvedSubstance!.casNumber).toBe('1309-60-0');
    expect(found!.resolutionType).toBe(ResolutionType.MANUAL_MATCH);
  });

  it.skipIf(!dbAvailable)('should increment occurrence count', async () => {
    const unresolved = em.create(UnresolvedSubstance, {
      rawName: 'Mystery Chemical',
      source: UnresolvedSource.CUSTOMER_UPLOAD,
      status: UnresolvedStatus.PENDING,
      occurrenceCount: 1,
    });
    await em.persistAndFlush(unresolved);

    unresolved.occurrenceCount = 5;
    await em.persistAndFlush(unresolved);
    em.clear();

    const found = await em.findOne(UnresolvedSubstance, { rawName: 'Mystery Chemical' });
    expect(found!.occurrenceCount).toBe(5);
  });
});
