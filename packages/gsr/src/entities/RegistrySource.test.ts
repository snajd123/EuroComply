import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';
import { RegistrySource, RegistrySourceName } from './RegistrySource.js';

const dbAvailable = await isDatabaseAvailable();

describe('RegistrySource', () => {
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

  it.skipIf(!dbAvailable)('should create registry source with required fields', async () => {
    const source = em.create(RegistrySource, {
      name: RegistrySourceName.ECHA_EC,
      version: '2026-01',
      recordCount: 106000,
      sourceUrl: 'https://echa.europa.eu/information-on-chemicals/ec-inventory',
    });

    await em.persistAndFlush(source);
    em.clear();

    const found = await em.findOne(RegistrySource, { name: RegistrySourceName.ECHA_EC });
    expect(found).toBeTruthy();
    expect(found!.name).toBe(RegistrySourceName.ECHA_EC);
    expect(found!.version).toBe('2026-01');
    expect(found!.recordCount).toBe(106000);
    expect(found!.lastSyncedAt).toBeInstanceOf(Date);
  });

  it.skipIf(!dbAvailable)('should enforce unique name constraint', async () => {
    const source1 = em.create(RegistrySource, {
      name: RegistrySourceName.ECHA_SVHC,
      version: '2026-01',
    });
    await em.persistAndFlush(source1);

    const source2 = em.create(RegistrySource, {
      name: RegistrySourceName.ECHA_SVHC,
      version: '2026-02',
    });

    await expect(em.persistAndFlush(source2)).rejects.toThrow();
  });

  it.skipIf(!dbAvailable)('should allow all registry source names', async () => {
    const sources = [
      { name: RegistrySourceName.ECHA_EC, version: 'v1' },
      { name: RegistrySourceName.ECHA_SVHC, version: 'v1' },
      { name: RegistrySourceName.ECHA_ANNEX_XVII, version: 'v1' },
      { name: RegistrySourceName.PUBCHEM, version: 'v1' },
      { name: RegistrySourceName.TSCA, version: 'v1' },
      { name: RegistrySourceName.PROP65, version: 'v1' },
    ];

    for (const data of sources) {
      const source = em.create(RegistrySource, data);
      await em.persistAndFlush(source);
    }

    const count = await em.count(RegistrySource);
    expect(count).toBe(6);
  });
});
