import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '../test-utils.js';
import { SubstancesSeeder } from './substances.seeder.js';
import { Substance } from '../entities/Substance.js';
import { SubstanceAlias } from '../entities/SubstanceAlias.js';
import type { MikroORM } from '@mikro-orm/postgresql';

describe('SubstancesSeeder Integration', () => {
  let orm: MikroORM;
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

  beforeEach(async () => {
    if (dbAvailable) {
      await clearTestDb(orm.em);
    }
  });

  it.skipIf(!dbAvailable)('should seed substances from ECHA data bundle', async () => {
    const em = orm.em.fork();
    const seeder = new SubstancesSeeder(em);

    const result = await seeder.seed();

    expect(result.seeded).toBe(true);
    expect(result.substanceCount).toBeGreaterThan(0);
    expect(result.aliasCount).toBeGreaterThan(0);
    expect(result.version).toMatch(/^ECHA-/);
  });

  it.skipIf(!dbAvailable)('should be idempotent - skip if already seeded', async () => {
    const em = orm.em.fork();
    const seeder = new SubstancesSeeder(em);

    // First seed
    const first = await seeder.seed();
    expect(first.seeded).toBe(true);

    // Second seed should skip
    const second = await seeder.seed();
    expect(second.seeded).toBe(false);
    expect(second.skipped).toBe(true);
  });

  it.skipIf(!dbAvailable)('should seed substances with correct regulatory flags', async () => {
    const em = orm.em.fork();
    const seeder = new SubstancesSeeder(em);
    await seeder.seed();

    // DMAC is SVHC + Authorization
    const dmac = await em.findOne(Substance, { casNumber: '127-19-5' });
    expect(dmac).not.toBeNull();
    expect(dmac!.primaryName).toBe('N,N-Dimethylacetamide');
    expect(dmac!.isSvhc).toBe(true);
    expect(dmac!.requiresAuthorization).toBe(true);
    expect(dmac!.isRestricted).toBe(false);

    // Lead is SVHC + Restricted
    const lead = await em.findOne(Substance, { casNumber: '7439-92-1' });
    expect(lead).not.toBeNull();
    expect(lead!.primaryName).toBe('Lead');
    expect(lead!.isSvhc).toBe(true);
    expect(lead!.isRestricted).toBe(true);

    // Water is not regulated
    const water = await em.findOne(Substance, { casNumber: '7732-18-5' });
    expect(water).not.toBeNull();
    expect(water!.primaryName).toBe('Water');
    expect(water!.isSvhc).toBe(false);
    expect(water!.requiresAuthorization).toBe(false);
    expect(water!.isRestricted).toBe(false);
  });

  it.skipIf(!dbAvailable)('should seed aliases with correct types', async () => {
    const em = orm.em.fork();
    const seeder = new SubstancesSeeder(em);
    await seeder.seed();

    const dmac = await em.findOne(Substance, { casNumber: '127-19-5' });
    expect(dmac).not.toBeNull();

    const aliases = await em.find(SubstanceAlias, { substance: dmac! });
    expect(aliases.length).toBeGreaterThan(0);

    const aliasNames = aliases.map(a => a.name);
    expect(aliasNames).toContain('DMAC');
  });

  it.skipIf(!dbAvailable)('should validate CAS numbers', async () => {
    const em = orm.em.fork();
    const seeder = new SubstancesSeeder(em);
    await seeder.seed();

    // All seeded substances should have valid CAS numbers
    const substances = await em.find(Substance, {});
    expect(substances.length).toBeGreaterThan(0);

    for (const s of substances) {
      // CAS format: XXXX-XX-X
      expect(s.casNumber).toMatch(/^\d{2,7}-\d{2}-\d$/);
    }
  });

  it.skipIf(!dbAvailable)('should count regulatory categories correctly', async () => {
    const em = orm.em.fork();
    const seeder = new SubstancesSeeder(em);
    await seeder.seed();

    const svhcCount = await em.count(Substance, { isSvhc: true });
    const authCount = await em.count(Substance, { requiresAuthorization: true });
    const restrictedCount = await em.count(Substance, { isRestricted: true });

    // From ECHA bundle: most are SVHC, some need auth, many restricted
    expect(svhcCount).toBeGreaterThan(10);
    expect(authCount).toBeGreaterThan(3);
    expect(restrictedCount).toBeGreaterThan(10);
  });
});
