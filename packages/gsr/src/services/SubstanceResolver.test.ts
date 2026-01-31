// packages/gsr/src/services/SubstanceResolver.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';
import { Substance, SubstanceAlias, AliasType } from '@eurocomply/database';
import { SubstanceResolver, ResolveStatus } from './SubstanceResolver.js';

const dbAvailable = await isDatabaseAvailable();

describe('SubstanceResolver', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let resolver: SubstanceResolver;

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
      resolver = new SubstanceResolver(em);

      // Create test substances
      const lead = em.create(Substance, {
        casNumber: '1309-60-0',
        ecNumber: '215-174-5',
        primaryName: 'Lead dioxide',
      });
      await em.persistAndFlush(lead);

      const cadmium = em.create(Substance, {
        casNumber: '7440-43-9',
        ecNumber: '231-152-8',
        primaryName: 'Cadmium',
      });
      await em.persistAndFlush(cadmium);

      // Add aliases to lead
      const alias1 = em.create(SubstanceAlias, {
        substance: lead,
        name: 'PbO2',
        type: AliasType.COMMON,
      });
      const alias2 = em.create(SubstanceAlias, {
        substance: lead,
        name: 'Lead peroxide',
        type: AliasType.SYNONYM,
      });
      await em.persistAndFlush([alias1, alias2]);
    }
  });

  describe('resolve', () => {
    it.skipIf(!dbAvailable)('should match exact CAS number', async () => {
      const result = await resolver.resolve({ casNumber: '1309-60-0' });

      expect(result.status).toBe(ResolveStatus.MATCHED);
      expect(result.match).toBeDefined();
      expect(result.match!.casNumber).toBe('1309-60-0');
      expect(result.match!.primaryName).toBe('Lead dioxide');
      expect(result.match!.matchedVia).toBe('CAS');
      expect(result.match!.confidence).toBe(1.0);
    });

    it.skipIf(!dbAvailable)('should sanitize and match CAS with spaces', async () => {
      const result = await resolver.resolve({ casNumber: '1309- 60 -0' });

      expect(result.status).toBe(ResolveStatus.MATCHED);
      expect(result.match).toBeDefined();
      expect(result.match!.casNumber).toBe('1309-60-0');
      expect(result.sanitizedInput.casNumber).toBe('1309-60-0');
    });

    it.skipIf(!dbAvailable)('should return UNRESOLVED for invalid CAS checksum', async () => {
      // 1309-60-1 has invalid checksum (should be 0)
      const result = await resolver.resolve({ casNumber: '1309-60-1' });

      expect(result.status).toBe(ResolveStatus.UNRESOLVED);
      expect(result.match).toBeUndefined();
      expect(result.sanitizedInput.casNumber).toBeNull(); // Invalid CAS is set to null
    });

    it.skipIf(!dbAvailable)('should match by EC number when CAS not found', async () => {
      const result = await resolver.resolve({ ecNumber: '215-174-5' });

      expect(result.status).toBe(ResolveStatus.MATCHED);
      expect(result.match).toBeDefined();
      expect(result.match!.casNumber).toBe('1309-60-0');
      expect(result.match!.matchedVia).toBe('EC');
      expect(result.match!.confidence).toBe(1.0);
    });

    it.skipIf(!dbAvailable)('should match exact alias', async () => {
      const result = await resolver.resolve({ name: 'PbO2' });

      expect(result.status).toBe(ResolveStatus.MATCHED);
      expect(result.match).toBeDefined();
      expect(result.match!.casNumber).toBe('1309-60-0');
      expect(result.match!.matchedVia).toBe('ALIAS_EXACT');
      expect(result.match!.confidence).toBe(1.0);
      expect(result.match!.matchedAlias).toBe('PbO2');
    });

    it.skipIf(!dbAvailable)('should match case-insensitive alias', async () => {
      const result = await resolver.resolve({ name: 'pbo2' });

      expect(result.status).toBe(ResolveStatus.MATCHED);
      expect(result.match).toBeDefined();
      expect(result.match!.casNumber).toBe('1309-60-0');
      expect(result.match!.matchedVia).toBe('ALIAS_EXACT');
      expect(result.match!.matchedAlias).toBe('PbO2');
    });

    it.skipIf(!dbAvailable)('should match alias with extra whitespace', async () => {
      const result = await resolver.resolve({ name: '  Lead peroxide  ' });

      expect(result.status).toBe(ResolveStatus.MATCHED);
      expect(result.match).toBeDefined();
      expect(result.match!.casNumber).toBe('1309-60-0');
      expect(result.match!.matchedAlias).toBe('Lead peroxide');
    });

    it.skipIf(!dbAvailable)('should return UNRESOLVED when no match found', async () => {
      const result = await resolver.resolve({ name: 'Unknown chemical XYZ' });

      expect(result.status).toBe(ResolveStatus.UNRESOLVED);
      expect(result.match).toBeUndefined();
      expect(result.candidates).toBeUndefined();
    });

    it.skipIf(!dbAvailable)('should include sanitized input in result', async () => {
      const result = await resolver.resolve({
        casNumber: '  1309-60-0  ',
        ecNumber: ' 215-174-5 ',
        name: '  Lead dioxide  ',
      });

      expect(result.sanitizedInput.casNumber).toBe('1309-60-0');
      expect(result.sanitizedInput.ecNumber).toBe('215-174-5');
      expect(result.sanitizedInput.name).toBe('lead dioxide');
    });

    it.skipIf(!dbAvailable)('should prefer CAS match over EC match', async () => {
      // Provide both CAS (for lead) and EC (for cadmium)
      const result = await resolver.resolve({
        casNumber: '1309-60-0',
        ecNumber: '231-152-8',  // EC for cadmium
      });

      expect(result.status).toBe(ResolveStatus.MATCHED);
      expect(result.match!.casNumber).toBe('1309-60-0');  // CAS wins
      expect(result.match!.matchedVia).toBe('CAS');
    });

    it.skipIf(!dbAvailable)('should prefer EC match over alias match', async () => {
      // Provide both EC (for lead) and name (alias for lead)
      // This tests priority when EC is provided but CAS is not
      const result = await resolver.resolve({
        ecNumber: '215-174-5',
        name: 'PbO2',
      });

      expect(result.status).toBe(ResolveStatus.MATCHED);
      expect(result.match!.casNumber).toBe('1309-60-0');
      expect(result.match!.matchedVia).toBe('EC');  // EC wins over alias
    });

    it.skipIf(!dbAvailable)('should handle names with SQL-special characters safely', async () => {
      const result = await resolver.resolve({ name: "'; DROP TABLE substance_alias; --" });
      expect(result.status).toBe(ResolveStatus.UNRESOLVED);
    });
  });
});
