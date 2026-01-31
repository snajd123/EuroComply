// packages/gsr/src/seeders/echa-svhc.seeder.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';
import { RegistrySource, RegistrySourceName } from '../entities/RegistrySource.js';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { SubstanceListEntry } from '../entities/SubstanceListEntry.js';
import { ListingStatus } from '../enums/ListingStatus.js';
import { ProductScope } from '../enums/ProductScope.js';
import { EchaSvhcSeeder } from './echa-svhc.seeder.js';
import { Substance } from '@eurocomply/database';
import { createId } from '@paralleldrive/cuid2';

const dbAvailable = await isDatabaseAvailable();

describe('EchaSvhcSeeder', () => {
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

      // Pre-seed substances for tests
      const leadChromate = em.create(Substance, {
        id: createId(),
        casNumber: '7758-97-6',
        ecNumber: '231-846-0',
        primaryName: 'lead chromate',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const cadmium = em.create(Substance, {
        id: createId(),
        casNumber: '7440-43-9',
        ecNumber: '231-152-8',
        primaryName: 'cadmium',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await em.persistAndFlush([leadChromate, cadmium]);
      em.clear();
    }
  });

  // Test CSV content
  const testCsv = `"Substance Name","EC Number","CAS Number","Date of inclusion","Reason for inclusion"
"Lead chromate","231-846-0","7758-97-6","2010-01-13","Carcinogenic (Article 57a)"
"Cadmium","231-152-8","7440-43-9","2012-06-18","Carcinogenic (Article 57a)"`;

  const testCsvWithUnknown = `"Substance Name","EC Number","CAS Number","Date of inclusion","Reason for inclusion"
"Lead chromate","231-846-0","7758-97-6","2010-01-13","Carcinogenic (Article 57a)"
"Unknown substance","999-999-9","9999-99-9","2013-01-01","Some reason"`;

  it.skipIf(!dbAvailable)('should_create_REACH_SVHC_regulatory_list_when_seeding', async () => {
    const seeder = new EchaSvhcSeeder(em);
    await seeder.seedFromContent(testCsv, '2026-01');

    // Verify REACH_SVHC regulatory list was created
    const list = await em.findOne(RegulatoryList, { code: 'REACH_SVHC' });
    expect(list).toBeTruthy();
    expect(list!.name).toBe('SVHC Candidate List');
    expect(list!.jurisdiction).toBe('EU');
    expect(list!.publisher).toBe('ECHA');
  });

  it.skipIf(!dbAvailable)('should_create_SubstanceListEntry_for_each_SVHC_when_seeding', async () => {
    const seeder = new EchaSvhcSeeder(em);
    const result = await seeder.seedFromContent(testCsv, '2026-01');

    expect(result.seeded).toBe(true);
    expect(result.entryCount).toBe(2);

    // Verify SubstanceListEntry records were created
    const entries = await em.find(SubstanceListEntry, {}, { populate: ['substance', 'regulatoryList'] });
    expect(entries).toHaveLength(2);

    // Check entry properties
    const leadEntry = entries.find((e) => e.substance?.casNumber === '7758-97-6');
    expect(leadEntry).toBeTruthy();
    expect(leadEntry!.status).toBe(ListingStatus.LISTED);
    expect(leadEntry!.scopes).toContain(ProductScope.ALL_PRODUCTS);
    expect(leadEntry!.listingDate).toEqual(new Date('2010-01-13'));
    expect(leadEntry!.sourceReference).toBe('SVHC Candidate List');

    const cadmiumEntry = entries.find((e) => e.substance?.casNumber === '7440-43-9');
    expect(cadmiumEntry).toBeTruthy();
    expect(cadmiumEntry!.listingDate).toEqual(new Date('2012-06-18'));
  });

  it.skipIf(!dbAvailable)('should_store_reason_in_conditions_when_seeding', async () => {
    const seeder = new EchaSvhcSeeder(em);
    await seeder.seedFromContent(testCsv, '2026-01');

    // Verify conditions contain the reason
    const entries = await em.find(SubstanceListEntry, {}, { populate: ['substance'] });

    const leadEntry = entries.find((e) => e.substance?.casNumber === '7758-97-6');
    expect(leadEntry).toBeTruthy();
    expect(leadEntry!.conditions).toBeTruthy();
    expect(leadEntry!.conditions!.reason).toBe('Carcinogenic (Article 57a)');
  });

  it.skipIf(!dbAvailable)('should_skip_unknown_substances_and_log_warning_when_seeding', async () => {
    const seeder = new EchaSvhcSeeder(em);
    const result = await seeder.seedFromContent(testCsvWithUnknown, '2026-01');

    expect(result.seeded).toBe(true);
    expect(result.entryCount).toBe(1); // Only lead chromate matched
    expect(result.skippedCount).toBe(1); // Unknown substance skipped

    // Verify only matched substance has entry
    const entries = await em.find(SubstanceListEntry, {});
    expect(entries).toHaveLength(1);
  });

  it.skipIf(!dbAvailable)('should_skip_if_already_seeded_with_same_version_when_duplicate', async () => {
    const seeder = new EchaSvhcSeeder(em);

    // First seed
    const result1 = await seeder.seedFromContent(testCsv, '2026-01');
    expect(result1.seeded).toBe(true);
    expect(result1.skipped).toBe(false);

    // Second seed with same version - should skip
    const result2 = await seeder.seedFromContent(testCsv, '2026-01');
    expect(result2.seeded).toBe(false);
    expect(result2.skipped).toBe(true);
    expect(result2.message).toContain('already seeded');
  });
});
