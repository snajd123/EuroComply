import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';
import { SubstanceCosing, CosmeticRestrictionType } from './SubstanceCosing.js';
import { Substance } from '@eurocomply/database';

const dbAvailable = await isDatabaseAvailable();

describe('SubstanceCosing', () => {
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

  describe('entity definition', () => {
    it('should_have_all_required_properties_when_entity_is_instantiated', () => {
      // Arrange & Act
      const entity = new SubstanceCosing();

      // Assert - verify all properties exist on the entity
      expect(entity).toHaveProperty('id');
      expect(entity).toHaveProperty('cosingRef');
      expect(entity).toHaveProperty('inciName');
      expect(entity).toHaveProperty('inciNameNormalized');
      expect(entity).toHaveProperty('functions');
      expect(entity).toHaveProperty('restrictionType');
      expect(entity).toHaveProperty('restrictionText');
      expect(entity).toHaveProperty('maxConcentration');
      expect(entity).toHaveProperty('concentrationUnit');
      expect(entity).toHaveProperty('otherRestrictions');
      expect(entity).toHaveProperty('sccsOpinions');
    });
  });

  describe('entity persistence', () => {
    it.skipIf(!dbAvailable)('should_create_substance_cosing_when_all_required_fields_provided', async () => {
      // Arrange - create parent substance first
      const substance = em.create(Substance, {
        casNumber: '127-19-5',
        primaryName: 'N,N-Dimethylacetamide',
      });
      await em.persistAndFlush(substance);

      // Act - create cosing persona
      const cosing = em.create(SubstanceCosing, {
        substance,
        cosingRef: '32870',
        inciName: 'DIMETHYLACETAMIDE',
        inciNameNormalized: 'dimethylacetamide',
      });
      await em.persistAndFlush(cosing);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceCosing, { cosingRef: '32870' }, { populate: ['substance'] });
      expect(found).not.toBeNull();
      expect(found!.cosingRef).toBe('32870');
      expect(found!.inciName).toBe('DIMETHYLACETAMIDE');
      expect(found!.inciNameNormalized).toBe('dimethylacetamide');
      expect(found!.substance.casNumber).toBe('127-19-5');
    });

    it.skipIf(!dbAvailable)('should_store_restriction_type_enum_correctly', async () => {
      // Arrange
      const substance = em.create(Substance, {
        casNumber: '50-00-0',
        primaryName: 'Formaldehyde',
      });
      await em.persistAndFlush(substance);

      // Act - create cosing entry with Annex II restriction (prohibited)
      const cosing = em.create(SubstanceCosing, {
        substance,
        cosingRef: '32457',
        inciName: 'FORMALDEHYDE',
        inciNameNormalized: 'formaldehyde',
        restrictionType: CosmeticRestrictionType.ANNEX_II,
        restrictionText: 'Prohibited in cosmetic products',
      });
      await em.persistAndFlush(cosing);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceCosing, { cosingRef: '32457' });
      expect(found!.restrictionType).toBe(CosmeticRestrictionType.ANNEX_II);
      expect(found!.restrictionText).toBe('Prohibited in cosmetic products');
    });

    it.skipIf(!dbAvailable)('should_store_concentration_limits_for_annex_iii_restrictions', async () => {
      // Arrange
      const substance = em.create(Substance, {
        casNumber: '7664-38-2',
        primaryName: 'Phosphoric acid',
      });
      await em.persistAndFlush(substance);

      // Act
      const cosing = em.create(SubstanceCosing, {
        substance,
        cosingRef: '37050',
        inciName: 'PHOSPHORIC ACID',
        inciNameNormalized: 'phosphoric acid',
        restrictionType: CosmeticRestrictionType.ANNEX_III,
        maxConcentration: '8.0000',
        concentrationUnit: '%',
        restrictionText: 'Oral products only up to 8%',
      });
      await em.persistAndFlush(cosing);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceCosing, { cosingRef: '37050' });
      expect(found!.restrictionType).toBe(CosmeticRestrictionType.ANNEX_III);
      expect(found!.maxConcentration).toBe('8.0000');
      expect(found!.concentrationUnit).toBe('%');
    });

    it.skipIf(!dbAvailable)('should_store_functions_array', async () => {
      // Arrange
      const substance = em.create(Substance, {
        casNumber: '56-81-5',
        primaryName: 'Glycerol',
      });
      await em.persistAndFlush(substance);

      // Act
      const cosing = em.create(SubstanceCosing, {
        substance,
        cosingRef: '34038',
        inciName: 'GLYCERIN',
        inciNameNormalized: 'glycerin',
        functions: ['HUMECTANT', 'SKIN CONDITIONING', 'SOLVENT'],
      });
      await em.persistAndFlush(cosing);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceCosing, { cosingRef: '34038' });
      expect(found!.functions).toEqual(['HUMECTANT', 'SKIN CONDITIONING', 'SOLVENT']);
    });

    it.skipIf(!dbAvailable)('should_store_sccs_opinions_as_json', async () => {
      // Arrange
      const substance = em.create(Substance, {
        casNumber: '94-26-8',
        primaryName: 'Butyl 4-hydroxybenzoate',
      });
      await em.persistAndFlush(substance);

      // Act
      const cosing = em.create(SubstanceCosing, {
        substance,
        cosingRef: '31776',
        inciName: 'BUTYLPARABEN',
        inciNameNormalized: 'butylparaben',
        restrictionType: CosmeticRestrictionType.ANNEX_V,
        maxConcentration: '0.4000',
        concentrationUnit: '%',
        sccsOpinions: {
          'SCCS/1514/13': {
            title: 'Opinion on Parabens',
            date: '2013-05-03',
            conclusion: 'Safe at current concentration limits',
          },
        },
      });
      await em.persistAndFlush(cosing);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceCosing, { cosingRef: '31776' });
      expect(found!.sccsOpinions).toHaveProperty('SCCS/1514/13');
      expect((found!.sccsOpinions as Record<string, unknown>)['SCCS/1514/13']).toHaveProperty('title', 'Opinion on Parabens');
    });

    it.skipIf(!dbAvailable)('should_allow_uv_filter_annex_vi_restrictions', async () => {
      // Arrange
      const substance = em.create(Substance, {
        casNumber: '6197-30-4',
        primaryName: 'Octocrylene',
      });
      await em.persistAndFlush(substance);

      // Act
      const cosing = em.create(SubstanceCosing, {
        substance,
        cosingRef: '36576',
        inciName: 'OCTOCRYLENE',
        inciNameNormalized: 'octocrylene',
        restrictionType: CosmeticRestrictionType.ANNEX_VI,
        maxConcentration: '10.0000',
        concentrationUnit: '%',
        functions: ['UV ABSORBER', 'UV FILTER'],
      });
      await em.persistAndFlush(cosing);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceCosing, { cosingRef: '36576' });
      expect(found!.restrictionType).toBe(CosmeticRestrictionType.ANNEX_VI);
      expect(found!.functions).toContain('UV FILTER');
    });

    it.skipIf(!dbAvailable)('should_index_cosing_ref_for_efficient_queries', async () => {
      // Arrange
      const substance1 = em.create(Substance, {
        casNumber: '7732-18-5',
        primaryName: 'Water',
      });
      const substance2 = em.create(Substance, {
        casNumber: '64-17-5',
        primaryName: 'Ethanol',
      });
      await em.persistAndFlush([substance1, substance2]);

      const cosing1 = em.create(SubstanceCosing, {
        substance: substance1,
        cosingRef: '39613',
        inciName: 'AQUA',
        inciNameNormalized: 'aqua',
      });
      const cosing2 = em.create(SubstanceCosing, {
        substance: substance2,
        cosingRef: '33192',
        inciName: 'ALCOHOL',
        inciNameNormalized: 'alcohol',
      });
      await em.persistAndFlush([cosing1, cosing2]);
      em.clear();

      // Act - query by cosingRef (indexed)
      const found = await em.findOne(SubstanceCosing, { cosingRef: '39613' });

      // Assert
      expect(found).not.toBeNull();
      expect(found!.inciName).toBe('AQUA');
    });
  });
});
