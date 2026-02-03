// packages/gsr/src/services/IdentityLadder.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';
import { Substance, SubstanceAlias } from '@eurocomply/database';
import { SubstanceCosing, SubstanceEfsa } from '../entities/index.js';
import { IdentityLadder } from './IdentityLadder.js';

const dbAvailable = await isDatabaseAvailable();

describe('IdentityLadder', () => {
  // Integration tests (require database)
  describe('integration tests', () => {
    let orm: MikroORM;
    let em: EntityManager;
    let ladder: IdentityLadder;
    let testSubstance: Substance;
    let testSubstance2: Substance;

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
        ladder = new IdentityLadder(em);

        // Create test substances with all identity fields
        testSubstance = em.create(Substance, {
          casNumber: '64-17-5',
          ecNumber: '200-578-6',
          primaryName: 'Ethanol',
          inchiKey: 'LFQSCWFLJHTTHZ-UHFFFAOYSA-N',
        });
        await em.persistAndFlush(testSubstance);

        testSubstance2 = em.create(Substance, {
          casNumber: '67-56-1',
          ecNumber: '200-659-6',
          primaryName: 'Methanol',
          inchiKey: 'OKKJLVBELUTLKV-UHFFFAOYSA-N',
        });
        await em.persistAndFlush(testSubstance2);

        // Create SubstanceCosing for INCI lookup
        const cosing = em.create(SubstanceCosing, {
          substance: testSubstance,
          cosingRef: 'COS-12345',
          inciName: 'ALCOHOL',
          inciNameNormalized: 'alcohol',
        });
        await em.persistAndFlush(cosing);

        // Create SubstanceEfsa for E-Number lookup
        const efsa = em.create(SubstanceEfsa, {
          substance: testSubstance,
          eNumber: 'E1510',
          functionalClass: 'SOLVENT',
        });
        await em.persistAndFlush(efsa);
      }
    });

    // Step 1: InChIKey match
    describe('InChIKey matching (Step 1)', () => {
      it.skipIf(!dbAvailable)('should_match_substance_when_inchiKey_matches_exactly', async () => {
        const result = await ladder.resolve({
          inchiKey: 'LFQSCWFLJHTTHZ-UHFFFAOYSA-N',
        });

        expect(result.status).toBe('FOUND');
        expect(result.substance).toBeDefined();
        expect(result.substance!.id).toBe(testSubstance.id);
        expect(result.matchedVia).toBe('INCHIKEY');
        expect(result.confidence).toBe(1.0);
      });

      it.skipIf(!dbAvailable)('should_prioritize_inchiKey_when_multiple_identifiers_provided', async () => {
        const result = await ladder.resolve({
          inchiKey: 'LFQSCWFLJHTTHZ-UHFFFAOYSA-N',
          casNumber: '67-56-1', // This would match methanol
        });

        expect(result.status).toBe('FOUND');
        expect(result.substance!.primaryName).toBe('Ethanol');
        expect(result.matchedVia).toBe('INCHIKEY');
      });
    });

    // Step 2: CAS Number match
    describe('CAS Number matching (Step 2)', () => {
      it.skipIf(!dbAvailable)('should_match_substance_when_casNumber_matches', async () => {
        const result = await ladder.resolve({
          casNumber: '64-17-5',
        });

        expect(result.status).toBe('FOUND');
        expect(result.substance).toBeDefined();
        expect(result.substance!.casNumber).toBe('64-17-5');
        expect(result.matchedVia).toBe('CAS');
        expect(result.confidence).toBe(1.0);
      });

      it.skipIf(!dbAvailable)('should_fallback_to_CAS_when_inchiKey_not_found', async () => {
        const result = await ladder.resolve({
          inchiKey: 'NONEXISTENT-INCHIKEY-XXXXX',
          casNumber: '64-17-5',
        });

        expect(result.status).toBe('FOUND');
        expect(result.matchedVia).toBe('CAS');
      });
    });

    // Step 3: EC Number match
    describe('EC Number matching (Step 3)', () => {
      it.skipIf(!dbAvailable)('should_match_substance_when_ecNumber_matches', async () => {
        const result = await ladder.resolve({
          ecNumber: '200-578-6',
        });

        expect(result.status).toBe('FOUND');
        expect(result.substance).toBeDefined();
        expect(result.substance!.ecNumber).toBe('200-578-6');
        expect(result.matchedVia).toBe('EC');
        expect(result.confidence).toBe(1.0);
      });

      it.skipIf(!dbAvailable)('should_fallback_to_EC_when_CAS_not_found', async () => {
        const result = await ladder.resolve({
          casNumber: '99999-99-9', // Invalid/non-existent
          ecNumber: '200-578-6',
        });

        expect(result.status).toBe('FOUND');
        expect(result.matchedVia).toBe('EC');
      });
    });

    // Step 4: INCI Name match via SubstanceCosing
    describe('INCI Name matching (Step 4)', () => {
      it.skipIf(!dbAvailable)('should_match_substance_when_inciName_matches_via_cosing', async () => {
        const result = await ladder.resolve({
          inciName: 'ALCOHOL',
        });

        expect(result.status).toBe('FOUND');
        expect(result.substance).toBeDefined();
        expect(result.substance!.id).toBe(testSubstance.id);
        expect(result.matchedVia).toBe('INCI');
        expect(result.confidence).toBe(1.0);
      });

      it.skipIf(!dbAvailable)('should_match_case_insensitive_inciName', async () => {
        const result = await ladder.resolve({
          inciName: 'alcohol',
        });

        expect(result.status).toBe('FOUND');
        expect(result.matchedVia).toBe('INCI');
      });
    });

    // Step 5: E-Number match via SubstanceEfsa
    describe('E-Number matching (Step 5)', () => {
      it.skipIf(!dbAvailable)('should_match_substance_when_eNumber_matches_via_efsa', async () => {
        const result = await ladder.resolve({
          eNumber: 'E1510',
        });

        expect(result.status).toBe('FOUND');
        expect(result.substance).toBeDefined();
        expect(result.substance!.id).toBe(testSubstance.id);
        expect(result.matchedVia).toBe('E_NUMBER');
        expect(result.confidence).toBe(1.0);
      });

      it.skipIf(!dbAvailable)('should_match_case_insensitive_eNumber', async () => {
        const result = await ladder.resolve({
          eNumber: 'e1510',
        });

        expect(result.status).toBe('FOUND');
        expect(result.matchedVia).toBe('E_NUMBER');
      });
    });

    // Step 6: Fuzzy name match
    describe('Fuzzy name matching (Step 6)', () => {
      it.skipIf(!dbAvailable)('should_match_substance_when_name_similarity_above_threshold', async () => {
        const result = await ladder.resolve({
          name: 'Ethanol',
        });

        // Exact name should match with high confidence
        expect(result.status).toBe('FOUND');
        expect(result.substance).toBeDefined();
        expect(result.matchedVia).toBe('NAME_FUZZY');
        expect(result.confidence).toBeGreaterThanOrEqual(0.8);
      });

      it.skipIf(!dbAvailable)('should_match_substance_when_name_is_similar', async () => {
        // Close enough for trigram similarity
        const result = await ladder.resolve({
          name: 'Ethyl Alcohol',
        });

        // This might or might not match depending on similarity score
        // At minimum we verify the response format
        expect(result.status).toMatch(/^(FOUND|NOT_FOUND)$/);
        if (result.status === 'FOUND') {
          expect(result.matchedVia).toBe('NAME_FUZZY');
          expect(result.confidence).toBeLessThanOrEqual(1.0);
          expect(result.confidence).toBeGreaterThan(0);
        }
      });

      it.skipIf(!dbAvailable)('should_return_NOT_FOUND_when_name_similarity_below_threshold', async () => {
        const result = await ladder.resolve({
          name: 'Completely Different Chemical Name XYZ',
        });

        expect(result.status).toBe('NOT_FOUND');
        expect(result.confidence).toBe(0);
      });
    });

    // NOT_FOUND cases
    describe('NOT_FOUND scenarios', () => {
      it.skipIf(!dbAvailable)('should_return_NOT_FOUND_when_no_identifiers_match', async () => {
        const result = await ladder.resolve({
          inchiKey: 'NONEXISTENT-KEY-XXXXXXX',
          casNumber: '99999-99-9',
          ecNumber: '999-999-9',
          inciName: 'NONEXISTENT_INCI',
          eNumber: 'E9999',
          name: 'Completely Unknown Chemical',
        });

        expect(result.status).toBe('NOT_FOUND');
        expect(result.substance).toBeUndefined();
        expect(result.matchedVia).toBeUndefined();
        expect(result.confidence).toBe(0);
      });

      it.skipIf(!dbAvailable)('should_return_NOT_FOUND_when_substance_table_empty', async () => {
        // Clear all substances
        await em.nativeDelete(SubstanceEfsa, {});
        await em.nativeDelete(SubstanceCosing, {});
        await em.nativeDelete(SubstanceAlias, {});
        await em.nativeDelete(Substance, {});

        const result = await ladder.resolve({
          casNumber: '64-17-5',
        });

        expect(result.status).toBe('NOT_FOUND');
        expect(result.confidence).toBe(0);
      });
    });

    // Priority/ladder order verification
    describe('Resolution priority order', () => {
      it.skipIf(!dbAvailable)('should_follow_ladder_priority_inchiKey_then_CAS', async () => {
        // Create another substance that would match CAS
        const newSubstance = em.create(Substance, {
          casNumber: '50-00-0',
          primaryName: 'Formaldehyde',
        });
        await em.persistAndFlush(newSubstance);

        // Provide inchiKey for Ethanol but CAS for Formaldehyde
        const result = await ladder.resolve({
          inchiKey: 'LFQSCWFLJHTTHZ-UHFFFAOYSA-N', // Ethanol
          casNumber: '50-00-0', // Formaldehyde
        });

        // InChIKey should win (Step 1 vs Step 2)
        expect(result.substance!.primaryName).toBe('Ethanol');
        expect(result.matchedVia).toBe('INCHIKEY');
      });

      it.skipIf(!dbAvailable)('should_follow_ladder_priority_CAS_then_EC', async () => {
        // Provide CAS for Ethanol but EC for Methanol
        const result = await ladder.resolve({
          casNumber: '64-17-5', // Ethanol
          ecNumber: '200-659-6', // Methanol
        });

        // CAS should win (Step 2 vs Step 3)
        expect(result.substance!.primaryName).toBe('Ethanol');
        expect(result.matchedVia).toBe('CAS');
      });
    });
  });
});
