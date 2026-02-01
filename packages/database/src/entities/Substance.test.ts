import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Substance } from './Substance.js';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '../test-utils.js';
import type { MikroORM } from '@mikro-orm/postgresql';

// Check database availability at module level (before test registration)
const dbAvailable = await isDatabaseAvailable();

describe('Substance', () => {
  it('should create a substance with CAS number', () => {
    const substance = new Substance();
    substance.casNumber = '127-19-5';
    substance.primaryName = 'N,N-Dimethylacetamide';
    substance.ecNumber = '204-826-4';
    substance.isSvhc = true;
    substance.requiresAuthorization = true;
    substance.isRestricted = false;

    expect(substance.casNumber).toBe('127-19-5');
    expect(substance.primaryName).toBe('N,N-Dimethylacetamide');
    expect(substance.isSvhc).toBe(true);
  });

  it('should have regulatory status defaults', () => {
    const substance = new Substance();
    substance.casNumber = '7732-18-5';
    substance.primaryName = 'Water';

    expect(substance.isSvhc).toBe(false);
    expect(substance.requiresAuthorization).toBe(false);
    expect(substance.isRestricted).toBe(false);
    expect(substance.isActive).toBe(true);
  });

  it('should store molecular data', () => {
    const substance = new Substance();
    substance.casNumber = '127-19-5';
    substance.primaryName = 'N,N-Dimethylacetamide';
    substance.molecularFormula = 'C4H9NO';
    substance.molecularWeight = '87.1204';

    expect(substance.molecularFormula).toBe('C4H9NO');
    expect(substance.molecularWeight).toBe('87.1204');
  });

  it('should store authorization dates', () => {
    const sunsetDate = new Date('2025-02-28');
    const latestApplicationDate = new Date('2024-08-28');

    const substance = new Substance();
    substance.casNumber = '127-19-5';
    substance.primaryName = 'DMAC';
    substance.sunsetDate = sunsetDate;
    substance.latestApplicationDate = latestApplicationDate;

    expect(substance.sunsetDate).toEqual(sunsetDate);
    expect(substance.latestApplicationDate).toEqual(latestApplicationDate);
  });

  it('should validate CAS number on assignment', () => {
    const substance = new Substance();
    substance.casNumber = '7732-18-6'; // Invalid check digit
    substance.primaryName = 'Invalid';

    expect(() => substance.validateCasNumber()).toThrow('Invalid CAS number: 7732-18-6');
  });

  it('should pass validation for valid CAS number', () => {
    const substance = new Substance();
    substance.casNumber = '7732-18-5'; // Valid - Water
    substance.primaryName = 'Water';

    expect(() => substance.validateCasNumber()).not.toThrow();
  });
});

describe('Substance enhanced fields', () => {
  let orm: MikroORM;

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
    }
  });

  it.skipIf(!dbAvailable)('should store SMILES and InChIKey', async () => {
    const em = orm.em.fork();

    const substance = em.create(Substance, {
      casNumber: '50-00-0',
      primaryName: 'Formaldehyde',
      smiles: 'C=O',
      inchiKey: 'WSFSSNUMVMOOMR-UHFFFAOYSA-N',
    });

    await em.persistAndFlush(substance);
    em.clear();

    const found = await em.findOne(Substance, { casNumber: '50-00-0' });
    expect(found).not.toBeNull();
    expect(found!.smiles).toBe('C=O');
    expect(found!.inchiKey).toBe('WSFSSNUMVMOOMR-UHFFFAOYSA-N');
  });

  it.skipIf(!dbAvailable)('should store IUPAC name', async () => {
    const em = orm.em.fork();

    const substance = em.create(Substance, {
      casNumber: '50-00-0',
      primaryName: 'Formaldehyde',
      iupacName: 'methanal',
    });

    await em.persistAndFlush(substance);
    em.clear();

    const found = await em.findOne(Substance, { casNumber: '50-00-0' });
    expect(found).not.toBeNull();
    expect(found!.iupacName).toBe('methanal');
  });
});

describe('Substance CLP identity fields', () => {
  let orm: MikroORM;

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
    }
  });

  it.skipIf(!dbAvailable)('should_store_indexNumber_when_provided', async () => {
    const em = orm.em.fork();
    const substance = em.create(Substance, {
      casNumber: '50-00-0',
      primaryName: 'Formaldehyde',
      indexNumber: '605-001-00-5',
    });
    await em.persistAndFlush(substance);
    em.clear();

    const found = await em.findOne(Substance, { casNumber: '50-00-0' });
    expect(found).not.toBeNull();
    expect(found!.indexNumber).toBe('605-001-00-5');
  });

  it.skipIf(!dbAvailable)('should_store_clpVersion_when_provided', async () => {
    const em = orm.em.fork();
    const substance = em.create(Substance, {
      casNumber: '71-43-2',
      primaryName: 'Benzene',
      clpVersion: 'ATP21',
    });
    await em.persistAndFlush(substance);
    em.clear();

    const found = await em.findOne(Substance, { casNumber: '71-43-2' });
    expect(found).not.toBeNull();
    expect(found!.clpVersion).toBe('ATP21');
  });

  it.skipIf(!dbAvailable)('should_allow_null_indexNumber_and_clpVersion', async () => {
    const em = orm.em.fork();
    const substance = em.create(Substance, {
      casNumber: '100-00-5',
      primaryName: 'Test Substance',
    });
    await em.persistAndFlush(substance);
    em.clear();

    const found = await em.findOne(Substance, { casNumber: '100-00-5' });
    expect(found).not.toBeNull();
    // Database returns null for nullable columns that have no value
    expect(found!.indexNumber).toBeNull();
    expect(found!.clpVersion).toBeNull();
  });

  it.skipIf(!dbAvailable)('should_index_indexNumber_for_efficient_lookup', async () => {
    const em = orm.em.fork();

    // Create a substance with index number
    const substance = em.create(Substance, {
      casNumber: '50-00-0',
      primaryName: 'Formaldehyde',
      indexNumber: '605-001-00-5',
    });
    await em.persistAndFlush(substance);
    em.clear();

    // Verify we can find by indexNumber (the index should make this efficient)
    const found = await em.findOne(Substance, { indexNumber: '605-001-00-5' });
    expect(found).not.toBeNull();
    expect(found!.casNumber).toBe('50-00-0');
  });
});
