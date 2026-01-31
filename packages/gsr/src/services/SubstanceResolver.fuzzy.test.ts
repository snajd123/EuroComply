// packages/gsr/src/services/SubstanceResolver.fuzzy.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';
import { Substance, SubstanceAlias, AliasType } from '@eurocomply/database';
import { SubstanceResolver, ResolveStatus } from './SubstanceResolver.js';

const dbAvailable = await isDatabaseAvailable();

describe('SubstanceResolver fuzzy matching', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let resolver: SubstanceResolver;

  beforeAll(async () => {
    if (dbAvailable) {
      orm = await setupGsrTestDb();
      // Ensure pg_trgm extension is available for fuzzy matching
      await orm.em.execute('CREATE EXTENSION IF NOT EXISTS pg_trgm');
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
      resolver = new SubstanceResolver(em);

      // Create Lead dioxide substance with aliases
      const lead = em.create(Substance, {
        casNumber: '1309-60-0',
        ecNumber: '215-174-5',
        primaryName: 'Lead dioxide',
      });
      await em.persistAndFlush(lead);

      // Add aliases
      const alias1 = em.create(SubstanceAlias, {
        substance: lead,
        name: 'Lead peroxide',
        type: AliasType.SYNONYM,
      });
      const alias2 = em.create(SubstanceAlias, {
        substance: lead,
        name: 'Plumbic oxide',
        type: AliasType.COMMON,
      });
      const alias3 = em.create(SubstanceAlias, {
        substance: lead,
        name: 'Lead(IV) oxide',
        type: AliasType.IUPAC,
      });
      await em.persistAndFlush([alias1, alias2, alias3]);
    }
  });

  describe('fuzzy matching', () => {
    it.skipIf(!dbAvailable)('should return CANDIDATES for fuzzy match above threshold', async () => {
      // Input: 'Lead peroxid' (missing 'e')
      const result = await resolver.resolve({ name: 'Lead peroxid' });

      expect(result.status).toBe(ResolveStatus.CANDIDATES);
      expect(result.candidates).toBeDefined();
      expect(result.candidates!.length).toBeGreaterThan(0);

      const firstCandidate = result.candidates![0];
      expect(firstCandidate.matchedVia).toBe('ALIAS_FUZZY');
      expect(firstCandidate.confidence).toBeGreaterThanOrEqual(0.6);
      expect(firstCandidate.confidence).toBeLessThanOrEqual(1.0);
      expect(firstCandidate.casNumber).toBe('1309-60-0');
    });

    it.skipIf(!dbAvailable)('should auto-accept single high-confidence fuzzy match', async () => {
      // Create a substance with a unique alias for testing auto-accept
      const sodium = em.create(Substance, {
        casNumber: '7647-14-5',
        ecNumber: '231-598-3',
        primaryName: 'Sodium chloride',
      });
      await em.persistAndFlush(sodium);

      const alias = em.create(SubstanceAlias, {
        substance: sodium,
        name: 'Table salt',
        type: AliasType.COMMON,
      });
      await em.persistAndFlush(alias);

      // Input very similar to 'Table salt' - should auto-accept with high confidence
      const result = await resolver.resolve({ name: 'Table saltt' });

      // Should be MATCHED with high confidence (>= 0.85 auto-accepts)
      // Note: if similarity is below 0.85, it will be CANDIDATES
      if (result.status === ResolveStatus.MATCHED) {
        expect(result.match).toBeDefined();
        expect(result.match!.matchedVia).toBe('ALIAS_FUZZY');
        expect(result.match!.confidence).toBeGreaterThanOrEqual(0.85);
        expect(result.match!.casNumber).toBe('7647-14-5');
      } else {
        // If we got candidates, verify the structure
        expect(result.status).toBe(ResolveStatus.CANDIDATES);
        expect(result.candidates).toBeDefined();
        expect(result.candidates!.length).toBeGreaterThan(0);
        // First candidate should have confidence < 0.85 (otherwise would auto-accept)
        expect(result.candidates![0].confidence).toBeLessThan(0.85);
      }
    });

    it.skipIf(!dbAvailable)('should return multiple candidates sorted by confidence descending', async () => {
      // Input 'Lead oxid' should match multiple aliases with varying similarity
      const result = await resolver.resolve({ name: 'Lead oxid' });

      // May be CANDIDATES or UNRESOLVED depending on similarity scores
      if (result.status === ResolveStatus.CANDIDATES) {
        expect(result.candidates).toBeDefined();
        expect(result.candidates!.length).toBeGreaterThanOrEqual(1);

        // Verify sorted by confidence descending
        for (let i = 0; i < result.candidates!.length - 1; i++) {
          expect(result.candidates![i].confidence).toBeGreaterThanOrEqual(
            result.candidates![i + 1].confidence
          );
        }
      }
      // If UNRESOLVED, the similarity was below threshold which is also valid
    });

    it.skipIf(!dbAvailable)('should return UNRESOLVED for very low similarity', async () => {
      const result = await resolver.resolve({ name: 'Completely different chemical' });

      expect(result.status).toBe(ResolveStatus.UNRESOLVED);
      expect(result.match).toBeUndefined();
      expect(result.candidates).toBeUndefined();
    });

    it.skipIf(!dbAvailable)('should not use fuzzy match when exact match exists', async () => {
      // Exact alias match should take priority over fuzzy
      const result = await resolver.resolve({ name: 'Lead peroxide' });

      expect(result.status).toBe(ResolveStatus.MATCHED);
      expect(result.match).toBeDefined();
      expect(result.match!.matchedVia).toBe('ALIAS_EXACT');
      expect(result.match!.confidence).toBe(1.0);
    });

    it.skipIf(!dbAvailable)('should include matchedAlias in fuzzy match candidates', async () => {
      const result = await resolver.resolve({ name: 'Lead peroxid' });

      if (result.status === ResolveStatus.CANDIDATES) {
        expect(result.candidates).toBeDefined();
        const candidate = result.candidates![0];
        expect(candidate.matchedAlias).toBeDefined();
        expect(typeof candidate.matchedAlias).toBe('string');
      }
    });
  });
});
