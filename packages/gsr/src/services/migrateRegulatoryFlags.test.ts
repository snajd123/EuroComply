// packages/gsr/src/services/migrateRegulatoryFlags.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';
import { Substance } from '@eurocomply/database';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { SubstanceListEntry } from '../entities/SubstanceListEntry.js';
import { ListingStatus } from '../enums/ListingStatus.js';
import { ProductScope } from '../enums/ProductScope.js';
import { migrateRegulatoryFlags } from './migrateRegulatoryFlags.js';

const dbAvailable = await isDatabaseAvailable();

describe('migrateRegulatoryFlags', () => {
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

  it.skipIf(!dbAvailable)('should_create_SVHC_entry_when_isSvhc_is_true', async () => {
    // Arrange: Create a substance with isSvhc = true
    const substance = em.create(Substance, {
      casNumber: '127-19-5',
      primaryName: 'N,N-Dimethylacetamide',
      isSvhc: true,
      isRestricted: false,
      requiresAuthorization: false,
    });
    await em.persistAndFlush(substance);

    // Act
    const result = await migrateRegulatoryFlags(em);

    // Assert
    expect(result.migratedCount).toBe(1);

    // Verify entry was created
    const entries = await em.find(SubstanceListEntry, {
      substance,
    }, { populate: ['regulatoryList'] });

    expect(entries).toHaveLength(1);
    expect(entries[0].regulatoryList.code).toBe('REACH_SVHC');
    expect(entries[0].status).toBe(ListingStatus.LISTED);
    expect(entries[0].scopes).toContain(ProductScope.ALL_PRODUCTS);
  });

  it.skipIf(!dbAvailable)('should_create_ANNEX_XIV_entry_when_requiresAuthorization_is_true', async () => {
    // Arrange: Create a substance that requires authorization
    const sunsetDate = new Date('2025-08-21');
    const substance = em.create(Substance, {
      casNumber: '117-81-7',
      primaryName: 'Bis(2-ethylhexyl) phthalate (DEHP)',
      isSvhc: false,
      isRestricted: false,
      requiresAuthorization: true,
      sunsetDate,
    });
    await em.persistAndFlush(substance);

    // Act
    const result = await migrateRegulatoryFlags(em);

    // Assert
    expect(result.migratedCount).toBe(1);

    const entries = await em.find(SubstanceListEntry, {
      substance,
    }, { populate: ['regulatoryList'] });

    expect(entries).toHaveLength(1);
    expect(entries[0].regulatoryList.code).toBe('REACH_ANNEX_XIV');
    expect(entries[0].status).toBe(ListingStatus.AUTHORIZED);
    expect(entries[0].sunsetDate).toEqual(sunsetDate);
    expect(entries[0].scopes).toContain(ProductScope.ALL_PRODUCTS);
  });

  it.skipIf(!dbAvailable)('should_create_ANNEX_XVII_entry_when_isRestricted_is_true', async () => {
    // Arrange: Create a restricted substance with conditions
    const restrictionConditions = 'Max 0.1% in consumer products';
    const substance = em.create(Substance, {
      casNumber: '1309-60-0',
      primaryName: 'Lead dioxide',
      isSvhc: false,
      isRestricted: true,
      requiresAuthorization: false,
      restrictionConditions,
    });
    await em.persistAndFlush(substance);

    // Act
    const result = await migrateRegulatoryFlags(em);

    // Assert
    expect(result.migratedCount).toBe(1);

    const entries = await em.find(SubstanceListEntry, {
      substance,
    }, { populate: ['regulatoryList'] });

    expect(entries).toHaveLength(1);
    expect(entries[0].regulatoryList.code).toBe('REACH_ANNEX_XVII');
    expect(entries[0].status).toBe(ListingStatus.RESTRICTED);
    expect(entries[0].conditions).toEqual({ text: restrictionConditions });
    expect(entries[0].scopes).toContain(ProductScope.ALL_PRODUCTS);
  });

  it.skipIf(!dbAvailable)('should_skip_existing_entries_when_already_migrated', async () => {
    // Arrange: Create a substance with isSvhc = true
    const substance = em.create(Substance, {
      casNumber: '127-19-5',
      primaryName: 'N,N-Dimethylacetamide',
      isSvhc: true,
      isRestricted: false,
      requiresAuthorization: false,
    });
    await em.persistAndFlush(substance);

    // First migration
    const result1 = await migrateRegulatoryFlags(em);
    expect(result1.migratedCount).toBe(1);

    // Create fresh entity manager
    em.clear();
    const em2 = orm.em.fork();

    // Act: Run migration again
    const result2 = await migrateRegulatoryFlags(em2);

    // Assert: Should be idempotent - no new entries created
    expect(result2.migratedCount).toBe(0);

    // Verify still only one entry
    const entries = await em2.find(SubstanceListEntry, {});
    expect(entries).toHaveLength(1);
  });

  it.skipIf(!dbAvailable)('should_return_correct_count_when_migrating_multiple_substances', async () => {
    // Arrange: Create multiple substances with different flags
    const svhcSubstance = em.create(Substance, {
      casNumber: '127-19-5',
      primaryName: 'N,N-Dimethylacetamide',
      isSvhc: true,
      isRestricted: false,
      requiresAuthorization: false,
    });

    const restrictedSubstance = em.create(Substance, {
      casNumber: '1309-60-0',
      primaryName: 'Lead dioxide',
      isSvhc: false,
      isRestricted: true,
      requiresAuthorization: false,
    });

    const authSubstance = em.create(Substance, {
      casNumber: '117-81-7',
      primaryName: 'Bis(2-ethylhexyl) phthalate',
      isSvhc: false,
      isRestricted: false,
      requiresAuthorization: true,
    });

    // Substance with multiple flags - should create multiple entries
    const multiFlag = em.create(Substance, {
      casNumber: '7440-43-9',
      primaryName: 'Cadmium',
      isSvhc: true,
      isRestricted: true,
      requiresAuthorization: false,
    });

    // Clean substance - should not be migrated
    const cleanSubstance = em.create(Substance, {
      casNumber: '50-00-0',
      primaryName: 'Formaldehyde',
      isSvhc: false,
      isRestricted: false,
      requiresAuthorization: false,
    });

    await em.persistAndFlush([svhcSubstance, restrictedSubstance, authSubstance, multiFlag, cleanSubstance]);

    // Act
    const result = await migrateRegulatoryFlags(em);

    // Assert: 5 entries total (1+1+1+2+0)
    expect(result.migratedCount).toBe(5);

    // Verify cadmium has 2 entries
    const cadmiumEntries = await em.find(SubstanceListEntry, {
      substance: multiFlag,
    }, { populate: ['regulatoryList'] });
    expect(cadmiumEntries).toHaveLength(2);

    const cadmiumListCodes = cadmiumEntries.map(e => e.regulatoryList.code).sort();
    expect(cadmiumListCodes).toEqual(['REACH_ANNEX_XVII', 'REACH_SVHC']);
  });

  it.skipIf(!dbAvailable)('should_preserve_sunsetDate_when_migrating_authorization', async () => {
    // Arrange: Create substance with authorization and sunset date
    const sunsetDate = new Date('2024-02-21');
    const latestAppDate = new Date('2023-08-21');

    const substance = em.create(Substance, {
      casNumber: '117-81-7',
      primaryName: 'DEHP',
      isSvhc: false,
      isRestricted: false,
      requiresAuthorization: true,
      sunsetDate,
      latestApplicationDate: latestAppDate,
    });
    await em.persistAndFlush(substance);

    // Act
    const result = await migrateRegulatoryFlags(em);

    // Assert
    expect(result.migratedCount).toBe(1);

    const entry = await em.findOne(SubstanceListEntry, {
      substance,
    }, { populate: ['regulatoryList'] });

    expect(entry).toBeTruthy();
    expect(entry!.regulatoryList.code).toBe('REACH_ANNEX_XIV');
    expect(entry!.sunsetDate).toEqual(sunsetDate);
  });
});
