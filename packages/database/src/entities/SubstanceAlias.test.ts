import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '../test-utils.js';
import { SubstanceAlias } from './SubstanceAlias.js';
import { Substance } from './Substance.js';
import { AliasType, AliasSource } from './enums/index.js';

const dbAvailable = await isDatabaseAvailable();

describe('SubstanceAlias', () => {
  it('should create an alias with type and name', () => {
    const alias = new SubstanceAlias();
    alias.name = 'DMAC';
    alias.type = AliasType.COMMON;
    alias.language = 'en';

    expect(alias.name).toBe('DMAC');
    expect(alias.type).toBe(AliasType.COMMON);
    expect(alias.language).toBe('en');
  });

  it('should support IUPAC alias type', () => {
    const alias = new SubstanceAlias();
    alias.name = 'N,N-Dimethylethanamide';
    alias.type = AliasType.IUPAC;

    expect(alias.type).toBe(AliasType.IUPAC);
  });

  it('should support TRADE alias type', () => {
    const alias = new SubstanceAlias();
    alias.name = 'Butyl cellosolve';
    alias.type = AliasType.TRADE;

    expect(alias.type).toBe(AliasType.TRADE);
  });

  it('should support SYNONYM alias type', () => {
    const alias = new SubstanceAlias();
    alias.name = 'Dimethylacetamide';
    alias.type = AliasType.SYNONYM;

    expect(alias.type).toBe(AliasType.SYNONYM);
  });

  it('should support INDEX_NAME alias type', () => {
    const alias = new SubstanceAlias();
    alias.name = 'acetamide, N,N-dimethyl-';
    alias.type = AliasType.INDEX_NAME;

    expect(alias.type).toBe(AliasType.INDEX_NAME);
  });

  it('should default language to en', () => {
    const alias = new SubstanceAlias();
    alias.name = 'Test';
    alias.type = AliasType.COMMON;

    expect(alias.language).toBe('en');
  });

  it('should link to substance via relationship', () => {
    const substance = new Substance();
    substance.casNumber = '127-19-5';
    substance.primaryName = 'N,N-Dimethylacetamide';

    const alias = new SubstanceAlias();
    alias.name = 'DMAC';
    alias.type = AliasType.COMMON;
    alias.substance = substance;

    expect(alias.substance).toBe(substance);
    expect(alias.substance.casNumber).toBe('127-19-5');
  });
});

describe('SubstanceAlias (database integration)', () => {
  let orm: MikroORM;
  let em: EntityManager;

  beforeAll(async () => {
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
      em = orm.em.fork();
    }
  });

  // Helper to create a test substance
  async function createTestSubstance(): Promise<Substance> {
    const substance = em.create(Substance, {
      casNumber: '1309-60-0',
      primaryName: 'Lead dioxide',
    });
    await em.persistAndFlush(substance);
    return substance;
  }

  it.skipIf(!dbAvailable)('should store nameNormalized automatically', async () => {
    const substance = await createTestSubstance();

    const alias = em.create(SubstanceAlias, {
      substance,
      name: 'Lead(IV) Oxide',
      type: AliasType.COMMON,
    });

    await em.persistAndFlush(alias);
    em.clear();

    const found = await em.findOne(SubstanceAlias, { name: 'Lead(IV) Oxide' });
    expect(found).toBeTruthy();
    expect(found!.nameNormalized).toBe('leadiv oxide');
  });

  it.skipIf(!dbAvailable)('should store source for provenance', async () => {
    const substance = await createTestSubstance();

    const alias = em.create(SubstanceAlias, {
      substance,
      name: 'Lead peroxide',
      type: AliasType.SYNONYM,
      source: AliasSource.PUBCHEM,
    });

    await em.persistAndFlush(alias);
    em.clear();

    const found = await em.findOne(SubstanceAlias, { name: 'Lead peroxide' });
    expect(found).toBeTruthy();
    expect(found!.source).toBe(AliasSource.PUBCHEM);
  });

  it.skipIf(!dbAvailable)('should default source to MANUAL', async () => {
    const substance = await createTestSubstance();

    const alias = em.create(SubstanceAlias, {
      substance,
      name: 'Plumbic oxide',
      type: AliasType.COMMON,
    });

    await em.persistAndFlush(alias);
    em.clear();

    const found = await em.findOne(SubstanceAlias, { name: 'Plumbic oxide' });
    expect(found).toBeTruthy();
    expect(found!.source).toBe(AliasSource.MANUAL);
  });

  it.skipIf(!dbAvailable)('should recompute nameNormalized on update', async () => {
    const substance = await createTestSubstance();

    // Create alias with initial name
    const alias = em.create(SubstanceAlias, {
      substance,
      name: 'Original Name',
      type: AliasType.COMMON,
    });
    await em.persistAndFlush(alias);

    // Update the name
    alias.name = 'Updated (New) Name';
    await em.flush();
    em.clear();

    // Verify nameNormalized was recomputed
    const found = await em.findOne(SubstanceAlias, { id: alias.id });
    expect(found!.nameNormalized).toBe('updated new name');
  });
});
