import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';
import { RegulatoryList } from './RegulatoryList.js';

const dbAvailable = await isDatabaseAvailable();

describe('RegulatoryList', () => {
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

  it.skipIf(!dbAvailable)('should create regulatory list with required fields', async () => {
    const list = em.create(RegulatoryList, {
      code: 'REACH_SVHC',
      name: 'SVHC Candidate List',
      jurisdiction: 'EU',
      publisher: 'ECHA',
    });

    await em.persistAndFlush(list);
    em.clear();

    const found = await em.findOne(RegulatoryList, { code: 'REACH_SVHC' });
    expect(found).toBeTruthy();
    expect(found!.code).toBe('REACH_SVHC');
    expect(found!.name).toBe('SVHC Candidate List');
    expect(found!.jurisdiction).toBe('EU');
    expect(found!.publisher).toBe('ECHA');
  });

  it.skipIf(!dbAvailable)('should enforce unique code constraint', async () => {
    await em.persistAndFlush(em.create(RegulatoryList, {
      code: 'REACH_ANNEX_XVII',
      name: 'REACH Annex XVII',
      jurisdiction: 'EU',
      publisher: 'ECHA',
    }));

    const duplicate = em.create(RegulatoryList, {
      code: 'REACH_ANNEX_XVII',
      name: 'Duplicate',
      jurisdiction: 'EU',
      publisher: 'ECHA',
    });

    await expect(em.persistAndFlush(duplicate)).rejects.toThrow();
  });

  it.skipIf(!dbAvailable)('should store optional fields', async () => {
    const list = em.create(RegulatoryList, {
      code: 'REACH_ANNEX_XIV',
      name: 'REACH Annex XIV Authorization List',
      jurisdiction: 'EU',
      publisher: 'ECHA',
      description: 'Substances requiring authorization',
      sourceUrl: 'https://echa.europa.eu/authorisation-list',
      version: '2026-01',
    });

    await em.persistAndFlush(list);
    em.clear();

    const found = await em.findOne(RegulatoryList, { code: 'REACH_ANNEX_XIV' });
    expect(found!.description).toBe('Substances requiring authorization');
    expect(found!.sourceUrl).toBe('https://echa.europa.eu/authorisation-list');
    expect(found!.version).toBe('2026-01');
  });
});
