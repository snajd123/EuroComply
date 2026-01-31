// packages/gsr/src/seeders/echa-inventory.seeder.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';
import { RegistrySource, RegistrySourceName } from '../entities/RegistrySource.js';
import { EchaInventorySeeder } from './echa-inventory.seeder.js';
import { Substance, SubstanceAlias, AliasType, AliasSource } from '@eurocomply/database';

const dbAvailable = await isDatabaseAvailable();

describe('EchaInventorySeeder', () => {
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

  // Sample CSV content for tests
  const sampleCsv = `"EC Number","EC Name","CAS Number","Molecular formula","Description"
"215-174-5","Lead dioxide","1309-60-0","PbO2","Lead compound"
"231-152-8","Cadmium","7440-43-9","Cd","Heavy metal"`;

  const sampleCsvWithNoCas = `"EC Number","EC Name","CAS Number","Molecular formula","Description"
"215-174-5","Lead dioxide","1309-60-0","PbO2","Lead compound"
"200-001-8","Test substance","-","H2O","No CAS number"`;

  it.skipIf(!dbAvailable)('should_seed_substances_from_CSV_content_when_valid_CSV', async () => {
    const seeder = new EchaInventorySeeder(em);
    const result = await seeder.seedFromContent(sampleCsv, '2026-01');

    expect(result.seeded).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.substanceCount).toBe(2);
    expect(result.version).toBe('2026-01');

    // Verify substances were created
    const substances = await em.find(Substance, {});
    expect(substances).toHaveLength(2);

    const lead = substances.find((s) => s.casNumber === '1309-60-0');
    expect(lead).toBeTruthy();
    expect(lead!.ecNumber).toBe('215-174-5');
    expect(lead!.primaryName).toBe('lead dioxide');
    expect(lead!.molecularFormula).toBe('PbO2');

    const cadmium = substances.find((s) => s.casNumber === '7440-43-9');
    expect(cadmium).toBeTruthy();
    expect(cadmium!.ecNumber).toBe('231-152-8');
    expect(cadmium!.primaryName).toBe('cadmium');
  });

  it.skipIf(!dbAvailable)('should_create_aliases_for_EC_names_when_seeding', async () => {
    const seeder = new EchaInventorySeeder(em);
    const result = await seeder.seedFromContent(sampleCsv, '2026-01');

    expect(result.aliasCount).toBe(2);

    // Verify aliases were created
    const aliases = await em.find(SubstanceAlias, {});
    expect(aliases).toHaveLength(2);

    // Check alias properties
    const leadAlias = aliases.find((a) => a.name === 'lead dioxide');
    expect(leadAlias).toBeTruthy();
    expect(leadAlias!.type).toBe(AliasType.INDEX_NAME);
    expect(leadAlias!.source).toBe(AliasSource.ECHA);
  });

  it.skipIf(!dbAvailable)('should_track_registry_source_version_when_seeding', async () => {
    const seeder = new EchaInventorySeeder(em);
    await seeder.seedFromContent(sampleCsv, '2026-01');

    // Verify registry source was created
    const source = await em.findOne(RegistrySource, { name: RegistrySourceName.ECHA_EC });
    expect(source).toBeTruthy();
    expect(source!.version).toBe('2026-01');
    expect(source!.recordCount).toBe(2);
    expect(source!.lastSyncedAt).toBeInstanceOf(Date);
  });

  it.skipIf(!dbAvailable)('should_skip_if_already_seeded_with_same_version_when_duplicate', async () => {
    const seeder = new EchaInventorySeeder(em);

    // First seed
    const result1 = await seeder.seedFromContent(sampleCsv, '2026-01');
    expect(result1.seeded).toBe(true);
    expect(result1.skipped).toBe(false);

    // Second seed with same version - should skip
    const result2 = await seeder.seedFromContent(sampleCsv, '2026-01');
    expect(result2.seeded).toBe(false);
    expect(result2.skipped).toBe(true);
    expect(result2.message).toContain('already seeded');

    // Verify count didn't change
    const substances = await em.find(Substance, {});
    expect(substances).toHaveLength(2);
  });

  it.skipIf(!dbAvailable)('should_update_if_version_is_newer_when_re-seeding', async () => {
    const seeder = new EchaInventorySeeder(em);

    // First seed with old version
    await seeder.seedFromContent(sampleCsv, '2026-01');

    // Verify initial state
    let source = await em.findOne(RegistrySource, { name: RegistrySourceName.ECHA_EC });
    expect(source!.version).toBe('2026-01');

    // New CSV with additional substance
    const newCsv = `"EC Number","EC Name","CAS Number","Molecular formula","Description"
"215-174-5","Lead dioxide","1309-60-0","PbO2","Lead compound"
"231-152-8","Cadmium","7440-43-9","Cd","Heavy metal"
"200-578-6","Ethanol","64-17-5","C2H6O","Alcohol"`;

    // Second seed with newer version - should process
    const result2 = await seeder.seedFromContent(newCsv, '2026-02');
    expect(result2.seeded).toBe(true);
    expect(result2.skipped).toBe(false);
    expect(result2.substanceCount).toBe(3);

    // Verify version was updated
    em.clear();
    source = await em.findOne(RegistrySource, { name: RegistrySourceName.ECHA_EC });
    expect(source!.version).toBe('2026-02');
    expect(source!.recordCount).toBe(3);

    // Verify new substance was added
    const ethanol = await em.findOne(Substance, { casNumber: '64-17-5' });
    expect(ethanol).toBeTruthy();
    expect(ethanol!.primaryName).toBe('ethanol');
  });

  it.skipIf(!dbAvailable)('should_upsert_existing_substances_by_CAS_when_re-seeding', async () => {
    const seeder = new EchaInventorySeeder(em);

    // First seed
    await seeder.seedFromContent(sampleCsv, '2026-01');

    // Verify initial state
    let lead = await em.findOne(Substance, { casNumber: '1309-60-0' });
    expect(lead!.primaryName).toBe('lead dioxide');

    // New CSV with updated name for lead
    const updatedCsv = `"EC Number","EC Name","CAS Number","Molecular formula","Description"
"215-174-5","Lead(IV) oxide","1309-60-0","PbO2","Updated description"
"231-152-8","Cadmium metal","7440-43-9","Cd","Heavy metal"`;

    // Second seed with newer version - should upsert
    await seeder.seedFromContent(updatedCsv, '2026-02');

    // Verify substance was updated, not duplicated
    em.clear();
    const substances = await em.find(Substance, {});
    expect(substances).toHaveLength(2);

    lead = await em.findOne(Substance, { casNumber: '1309-60-0' });
    expect(lead!.primaryName).toBe('lead(iv) oxide');
    expect(lead!.description).toBe('Updated description');
  });

  it.skipIf(!dbAvailable)('should_skip_substances_without_CAS_when_seeding', async () => {
    const seeder = new EchaInventorySeeder(em);
    const result = await seeder.seedFromContent(sampleCsvWithNoCas, '2026-01');

    // Only lead dioxide has a valid CAS number, so only 1 substance should be seeded
    expect(result.seeded).toBe(true);
    expect(result.substanceCount).toBe(2); // Total records parsed (including no-CAS)
    expect(result.aliasCount).toBe(1); // Only 1 alias for the substance with CAS

    // Verify only substance with CAS was created
    const substances = await em.find(Substance, {});
    expect(substances).toHaveLength(1);

    const lead = substances.find((s) => s.casNumber === '1309-60-0');
    expect(lead).toBeTruthy();
    expect(lead!.primaryName).toBe('lead dioxide');
  });
});
