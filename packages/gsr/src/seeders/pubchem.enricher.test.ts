// packages/gsr/src/seeders/pubchem.enricher.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';
import { RegistrySource, RegistrySourceName } from '../entities/RegistrySource.js';
import { PubChemEnricher, type EnricherResult, type EnricherOptions } from './pubchem.enricher.js';
import { Substance } from '@eurocomply/database';
import { createId } from '@paralleldrive/cuid2';

const dbAvailable = await isDatabaseAvailable();

describe('PubChemEnricher', () => {
  let orm: MikroORM;
  let em: EntityManager;

  beforeAll(async () => {
    if (dbAvailable) {
      orm = await setupGsrTestDb();
    }
  }, 30000);

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

  describe('enrichSubstance', () => {
    it.skipIf(!dbAvailable)(
      'should_enrich_substance_with_pubchem_data_when_cas_valid',
      async () => {
        // Arrange - Create formaldehyde substance without structural data
        const formaldehyde = em.create(Substance, {
          id: createId(),
          casNumber: '50-00-0',
          primaryName: 'Formaldehyde',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await em.persistAndFlush(formaldehyde);
        em.clear();

        const enricher = new PubChemEnricher(em);

        // Act
        const freshEm = orm.em.fork();
        const substanceToEnrich = await freshEm.findOneOrFail(Substance, { casNumber: '50-00-0' });
        const enricherWithFreshEm = new PubChemEnricher(freshEm);
        const result = await enricherWithFreshEm.enrichSubstance(substanceToEnrich);

        // Assert
        expect(result.enriched).toBe(true);
        expect(result.aliasCount).toBeGreaterThan(0); // Should have created aliases

        // Verify the substance was updated in the database
        const updatedSubstance = await freshEm.findOneOrFail(Substance, { casNumber: '50-00-0' });
        expect(updatedSubstance.smiles).toBe('C=O');
        expect(updatedSubstance.inchiKey).toBe('WSFSSNUMVMOOMR-UHFFFAOYSA-N');
        expect(updatedSubstance.molecularFormula).toBe('CH2O');
        expect(updatedSubstance.molecularWeight).toBe('30.0260'); // 4 decimal places
        expect(updatedSubstance.iupacName).toBe('formaldehyde');
      },
      20000,
    );

    it.skipIf(!dbAvailable)(
      'should_return_false_when_cas_not_found_in_pubchem',
      async () => {
        // Arrange - Create substance with valid but unknown CAS (9999-99-9 is valid checksum)
        const unknown = em.create(Substance, {
          id: createId(),
          casNumber: '9999-99-9',
          primaryName: 'Unknown Substance',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await em.persistAndFlush(unknown);
        em.clear();

        const freshEm = orm.em.fork();
        const substanceToEnrich = await freshEm.findOneOrFail(Substance, { casNumber: '9999-99-9' });
        const enricher = new PubChemEnricher(freshEm);

        // Act
        const result = await enricher.enrichSubstance(substanceToEnrich);

        // Assert
        expect(result.enriched).toBe(false);

        // Verify substance was not modified (database returns null for unset values)
        const unchangedSubstance = await freshEm.findOneOrFail(Substance, { casNumber: '9999-99-9' });
        expect(unchangedSubstance.smiles).toBeNull();
        expect(unchangedSubstance.inchiKey).toBeNull();
      },
      15000,
    );

    it.skipIf(!dbAvailable)(
      'should_skip_already_enriched_substances',
      async () => {
        // Arrange - Create substance that's already enriched
        const enrichedSubstance = em.create(Substance, {
          id: createId(),
          casNumber: '50-00-0',
          primaryName: 'Formaldehyde',
          smiles: 'C=O', // Already has SMILES
          inchiKey: 'WSFSSNUMVMOOMR-UHFFFAOYSA-N',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await em.persistAndFlush(enrichedSubstance);
        em.clear();

        const freshEm = orm.em.fork();
        const substanceToEnrich = await freshEm.findOneOrFail(Substance, { casNumber: '50-00-0' });
        const enricher = new PubChemEnricher(freshEm);

        // Act
        const result = await enricher.enrichSubstance(substanceToEnrich);

        // Assert - should skip without making API call
        expect(result.enriched).toBe(false);
      },
      5000,
    );
  });

  describe('enrichBatch', () => {
    it.skipIf(!dbAvailable)(
      'should_enrich_multiple_substances_with_progress',
      async () => {
        // Arrange - Create two canary substances
        const formaldehyde = em.create(Substance, {
          id: createId(),
          casNumber: '50-00-0',
          primaryName: 'Formaldehyde',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const ethanol = em.create(Substance, {
          id: createId(),
          casNumber: '64-17-5',
          primaryName: 'Ethanol',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const unknown = em.create(Substance, {
          id: createId(),
          casNumber: '9999-99-9',
          primaryName: 'Unknown',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await em.persistAndFlush([formaldehyde, ethanol, unknown]);
        em.clear();

        const freshEm = orm.em.fork();
        const substances = await freshEm.find(Substance, {});
        const enricher = new PubChemEnricher(freshEm);

        // Track progress
        const progressCalls: Array<{ processed: number; total: number }> = [];

        // Act
        const result = await enricher.enrichBatch(substances, {
          onProgress: (processed, total) => {
            progressCalls.push({ processed, total });
          },
        });

        // Assert
        expect(result.enrichedCount).toBe(2); // formaldehyde + ethanol
        expect(result.notFoundCount).toBe(1); // unknown
        expect(result.failedCount).toBe(0);
        expect(progressCalls.length).toBe(3);
        expect(progressCalls[progressCalls.length - 1]).toEqual({ processed: 3, total: 3 });

        // Verify ethanol was enriched correctly
        const updatedEthanol = await freshEm.findOneOrFail(Substance, { casNumber: '64-17-5' });
        expect(updatedEthanol.smiles).toBe('CCO');
        expect(updatedEthanol.molecularFormula).toBe('C2H6O');
      },
      45000,
    );
  });

  describe('generateEchaUrl', () => {
    it.skipIf(!dbAvailable)(
      'should_return_correct_echa_url_when_ec_number_provided',
      async () => {
        // Arrange
        const enricher = new PubChemEnricher(em);

        // Act
        const url = enricher.generateEchaUrl('200-001-8');

        // Assert
        expect(url).toBe('https://echa.europa.eu/substance-information/-/substanceinfo/200-001-8');
      },
    );

    it.skipIf(!dbAvailable)(
      'should_return_null_when_ec_number_is_empty',
      async () => {
        // Arrange
        const enricher = new PubChemEnricher(em);

        // Act & Assert
        expect(enricher.generateEchaUrl('')).toBeNull();
        expect(enricher.generateEchaUrl(undefined)).toBeNull();
      },
    );

    it.skipIf(!dbAvailable)(
      'should_preserve_hyphens_in_ec_number',
      async () => {
        // Arrange
        const enricher = new PubChemEnricher(em);

        // Act
        const url = enricher.generateEchaUrl('204-826-4');

        // Assert
        expect(url).toBe('https://echa.europa.eu/substance-information/-/substanceinfo/204-826-4');
      },
    );
  });

  describe('enrichSubstance with ECHA URL', () => {
    it.skipIf(!dbAvailable)(
      'should_set_echa_url_when_substance_has_ec_number',
      async () => {
        // Arrange - Create substance with EC number
        const substance = em.create(Substance, {
          id: createId(),
          casNumber: '50-00-0',
          primaryName: 'Formaldehyde',
          ecNumber: '200-001-8',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await em.persistAndFlush(substance);
        em.clear();

        const freshEm = orm.em.fork();
        const substanceToEnrich = await freshEm.findOneOrFail(Substance, { casNumber: '50-00-0' });
        const enricher = new PubChemEnricher(freshEm);

        // Act
        await enricher.enrichSubstance(substanceToEnrich);
        await freshEm.flush();

        // Assert
        const updatedSubstance = await freshEm.findOneOrFail(Substance, { casNumber: '50-00-0' });
        expect(updatedSubstance.echaUrl).toBe('https://echa.europa.eu/substance-information/-/substanceinfo/200-001-8');
      },
      20000,
    );

    it.skipIf(!dbAvailable)(
      'should_not_set_echa_url_when_substance_has_no_ec_number',
      async () => {
        // Arrange - Create substance without EC number
        const substance = em.create(Substance, {
          id: createId(),
          casNumber: '64-17-5',
          primaryName: 'Ethanol',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await em.persistAndFlush(substance);
        em.clear();

        const freshEm = orm.em.fork();
        const substanceToEnrich = await freshEm.findOneOrFail(Substance, { casNumber: '64-17-5' });
        const enricher = new PubChemEnricher(freshEm);

        // Act
        await enricher.enrichSubstance(substanceToEnrich);
        await freshEm.flush();

        // Assert - database returns null for unset values
        const updatedSubstance = await freshEm.findOneOrFail(Substance, { casNumber: '64-17-5' });
        expect(updatedSubstance.echaUrl).toBeNull();
      },
      20000,
    );

    it.skipIf(!dbAvailable)(
      'should_set_echa_url_even_when_pubchem_enrichment_fails',
      async () => {
        // Arrange - Create substance with EC number but invalid CAS (won't be found in PubChem)
        const substance = em.create(Substance, {
          id: createId(),
          casNumber: '9999-99-9', // Valid checksum but not in PubChem
          primaryName: 'Unknown Substance',
          ecNumber: '999-999-9',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await em.persistAndFlush(substance);
        em.clear();

        const freshEm = orm.em.fork();
        const substanceToEnrich = await freshEm.findOneOrFail(Substance, { casNumber: '9999-99-9' });
        const enricher = new PubChemEnricher(freshEm);

        // Act
        const result = await enricher.enrichSubstance(substanceToEnrich);
        await freshEm.flush();

        // Assert - PubChem enrichment failed but ECHA URL should still be set
        expect(result.enriched).toBe(false); // PubChem enrichment failed
        const updatedSubstance = await freshEm.findOneOrFail(Substance, { casNumber: '9999-99-9' });
        expect(updatedSubstance.echaUrl).toBe('https://echa.europa.eu/substance-information/-/substanceinfo/999-999-9');
        expect(updatedSubstance.smiles).toBeNull(); // PubChem data not set
      },
      15000,
    );
  });

  describe('run', () => {
    it.skipIf(!dbAvailable)(
      'should_enrich_all_unenriched_substances',
      async () => {
        // Arrange - Create substances with mixed enrichment state
        const alreadyEnriched = em.create(Substance, {
          id: createId(),
          casNumber: '50-00-0',
          primaryName: 'Formaldehyde',
          smiles: 'C=O', // Already enriched
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const needsEnrichment = em.create(Substance, {
          id: createId(),
          casNumber: '64-17-5',
          primaryName: 'Ethanol',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await em.persistAndFlush([alreadyEnriched, needsEnrichment]);
        em.clear();

        const freshEm = orm.em.fork();
        const enricher = new PubChemEnricher(freshEm);

        // Act
        const result = await enricher.run({ onlyMissing: true });

        // Assert
        expect(result.enriched).toBe(true);
        expect(result.enrichedCount).toBe(1); // Only ethanol
        expect(result.skippedCount).toBe(1); // Formaldehyde skipped
        expect(result.totalProcessed).toBe(1);

        // Verify ethanol was enriched
        const updatedEthanol = await freshEm.findOneOrFail(Substance, { casNumber: '64-17-5' });
        expect(updatedEthanol.smiles).toBe('CCO');

        // Verify registry source was updated
        const source = await freshEm.findOne(RegistrySource, { name: RegistrySourceName.PUBCHEM });
        expect(source).toBeTruthy();
        expect(source!.recordCount).toBe(1);
      },
      30000,
    );

    it.skipIf(!dbAvailable)(
      'should_respect_dryRun_option',
      async () => {
        // Arrange
        const substance = em.create(Substance, {
          id: createId(),
          casNumber: '50-00-0',
          primaryName: 'Formaldehyde',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await em.persistAndFlush(substance);
        em.clear();

        const freshEm = orm.em.fork();
        const enricher = new PubChemEnricher(freshEm);

        // Act
        const result = await enricher.run({ dryRun: true });

        // Assert
        expect(result.message).toContain('dry run');
        expect(result.enrichedCount).toBe(0);

        // Verify substance was NOT enriched (database returns null for unset values)
        const unchangedSubstance = await freshEm.findOneOrFail(Substance, { casNumber: '50-00-0' });
        expect(unchangedSubstance.smiles).toBeNull();
      },
      15000,
    );
  });
});
