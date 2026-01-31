import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';
import { Substance } from '@eurocomply/database';
import { SubstanceGroup, SubstanceGroupMember, InheritanceType } from './SubstanceGroup.js';

const dbAvailable = await isDatabaseAvailable();

describe('SubstanceGroup', () => {
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

  it.skipIf(!dbAvailable)('should create substance group', async () => {
    const group = em.create(SubstanceGroup, {
      code: 'LEAD_COMPOUNDS',
      name: 'Lead and its compounds',
      description: 'All inorganic and organic lead compounds',
    });

    await em.persistAndFlush(group);
    em.clear();

    const found = await em.findOne(SubstanceGroup, { code: 'LEAD_COMPOUNDS' });
    expect(found).toBeTruthy();
    expect(found!.name).toBe('Lead and its compounds');
  });

  it.skipIf(!dbAvailable)('should enforce unique code constraint', async () => {
    await em.persistAndFlush(em.create(SubstanceGroup, {
      code: 'PFAS',
      name: 'PFAS',
    }));

    const duplicate = em.create(SubstanceGroup, {
      code: 'PFAS',
      name: 'Per- and polyfluoroalkyl substances',
    });

    await expect(em.persistAndFlush(duplicate)).rejects.toThrow();
  });

  it.skipIf(!dbAvailable)('should support nested groups via parentGroup', async () => {
    const parent = em.create(SubstanceGroup, {
      code: 'HEAVY_METALS',
      name: 'Heavy Metals',
    });
    await em.persistAndFlush(parent);

    const child = em.create(SubstanceGroup, {
      code: 'LEAD_COMPOUNDS',
      name: 'Lead compounds',
      parentGroup: parent,
    });
    await em.persistAndFlush(child);
    em.clear();

    const found = await em.findOne(SubstanceGroup, { code: 'LEAD_COMPOUNDS' }, { populate: ['parentGroup'] });
    expect(found!.parentGroup).toBeTruthy();
    expect(found!.parentGroup!.code).toBe('HEAVY_METALS');
  });
});

describe('SubstanceGroupMember', () => {
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

  it.skipIf(!dbAvailable)('should link substance to group', async () => {
    const substance = em.create(Substance, {
      casNumber: '1309-60-0',
      primaryName: 'Lead dioxide',
    });
    await em.persistAndFlush(substance);

    const group = em.create(SubstanceGroup, {
      code: 'LEAD_COMPOUNDS',
      name: 'Lead compounds',
    });
    await em.persistAndFlush(group);

    const member = em.create(SubstanceGroupMember, {
      group,
      substance,
      inheritanceType: InheritanceType.EXPLICIT,
      notes: 'Inorganic lead compound',
    });
    await em.persistAndFlush(member);
    em.clear();

    const found = await em.findOne(SubstanceGroupMember, { substance }, { populate: ['group'] });
    expect(found).toBeTruthy();
    expect(found!.group.code).toBe('LEAD_COMPOUNDS');
    expect(found!.inheritanceType).toBe(InheritanceType.EXPLICIT);
    expect(found!.notes).toBe('Inorganic lead compound');
  });

  it.skipIf(!dbAvailable)('should enforce unique group+substance constraint', async () => {
    const substance = em.create(Substance, {
      casNumber: '7440-43-9',
      primaryName: 'Cadmium',
    });
    const group = em.create(SubstanceGroup, {
      code: 'CADMIUM_COMPOUNDS',
      name: 'Cadmium compounds',
    });
    await em.persistAndFlush([substance, group]);

    await em.persistAndFlush(em.create(SubstanceGroupMember, {
      group,
      substance,
      inheritanceType: InheritanceType.EXPLICIT,
    }));

    const duplicate = em.create(SubstanceGroupMember, {
      group,
      substance,
      inheritanceType: InheritanceType.DERIVED,
    });

    await expect(em.persistAndFlush(duplicate)).rejects.toThrow();
  });
});
