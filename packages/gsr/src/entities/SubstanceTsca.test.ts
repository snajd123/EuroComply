import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';
import { SubstanceTsca, TscaInventoryStatus } from './SubstanceTsca.js';
import { Substance } from '@eurocomply/database';

const dbAvailable = await isDatabaseAvailable();

describe('SubstanceTsca', () => {
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
      const entity = new SubstanceTsca();

      // Assert - verify all properties exist on the entity
      expect(entity).toHaveProperty('id');
      expect(entity).toHaveProperty('substance');
      expect(entity).toHaveProperty('tscaCas');
      expect(entity).toHaveProperty('inventoryStatus');
      expect(entity).toHaveProperty('isSection5');
      expect(entity).toHaveProperty('isSection6');
      expect(entity).toHaveProperty('isSnur');
      expect(entity).toHaveProperty('cdrFlags');
      expect(entity).toHaveProperty('createdAt');
      expect(entity).toHaveProperty('updatedAt');
    });

    it.skipIf(!dbAvailable)('should_have_correct_table_name_when_entity_is_defined', async () => {
      // Arrange
      const metadata = orm.getMetadata().get(SubstanceTsca);

      // Act & Assert
      expect(metadata.tableName).toBe('substance_tsca');
    });
  });

  describe('entity persistence', () => {
    it.skipIf(!dbAvailable)('should_create_substance_tsca_when_all_required_fields_provided', async () => {
      // Arrange - create parent substance first
      const substance = em.create(Substance, {
        casNumber: '75-07-0',
        primaryName: 'Acetaldehyde',
      });
      await em.persistAndFlush(substance);

      // Act - create TSCA persona
      const tsca = em.create(SubstanceTsca, {
        substance,
        tscaCas: '75-07-0',
        inventoryStatus: TscaInventoryStatus.ACTIVE,
      });
      await em.persistAndFlush(tsca);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceTsca, { tscaCas: '75-07-0' }, { populate: ['substance'] });
      expect(found).not.toBeNull();
      expect(found!.tscaCas).toBe('75-07-0');
      expect(found!.inventoryStatus).toBe(TscaInventoryStatus.ACTIVE);
      expect(found!.substance.casNumber).toBe('75-07-0');
    });

    it.skipIf(!dbAvailable)('should_store_inventory_status_enum_correctly', async () => {
      // Arrange
      const substance = em.create(Substance, {
        casNumber: '50-00-0',
        primaryName: 'Formaldehyde',
      });
      await em.persistAndFlush(substance);

      // Act - create TSCA entry with INACTIVE status
      const tsca = em.create(SubstanceTsca, {
        substance,
        tscaCas: '50-00-0',
        inventoryStatus: TscaInventoryStatus.INACTIVE,
      });
      await em.persistAndFlush(tsca);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceTsca, { tscaCas: '50-00-0' });
      expect(found!.inventoryStatus).toBe(TscaInventoryStatus.INACTIVE);
    });

    it.skipIf(!dbAvailable)('should_default_boolean_flags_to_false', async () => {
      // Arrange
      const substance = em.create(Substance, {
        casNumber: '67-64-1',
        primaryName: 'Acetone',
      });
      await em.persistAndFlush(substance);

      // Act
      const tsca = em.create(SubstanceTsca, {
        substance,
        tscaCas: '67-64-1',
        inventoryStatus: TscaInventoryStatus.ACTIVE,
      });
      await em.persistAndFlush(tsca);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceTsca, { tscaCas: '67-64-1' });
      expect(found!.isSection5).toBe(false);
      expect(found!.isSection6).toBe(false);
      expect(found!.isSnur).toBe(false);
    });

    it.skipIf(!dbAvailable)('should_store_section5_flag_correctly', async () => {
      // Arrange
      const substance = em.create(Substance, {
        casNumber: '108-88-3',
        primaryName: 'Toluene',
      });
      await em.persistAndFlush(substance);

      // Act - create with Section 5 (new chemical) flag
      const tsca = em.create(SubstanceTsca, {
        substance,
        tscaCas: '108-88-3',
        inventoryStatus: TscaInventoryStatus.ACTIVE,
        isSection5: true,
      });
      await em.persistAndFlush(tsca);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceTsca, { tscaCas: '108-88-3' });
      expect(found!.isSection5).toBe(true);
    });

    it.skipIf(!dbAvailable)('should_store_section6_flag_correctly', async () => {
      // Arrange
      const substance = em.create(Substance, {
        casNumber: '7439-92-1',
        primaryName: 'Lead',
      });
      await em.persistAndFlush(substance);

      // Act - create with Section 6 (priority chemical) flag
      const tsca = em.create(SubstanceTsca, {
        substance,
        tscaCas: '7439-92-1',
        inventoryStatus: TscaInventoryStatus.ACTIVE,
        isSection6: true,
      });
      await em.persistAndFlush(tsca);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceTsca, { tscaCas: '7439-92-1' });
      expect(found!.isSection6).toBe(true);
    });

    it.skipIf(!dbAvailable)('should_store_snur_flag_correctly', async () => {
      // Arrange
      const substance = em.create(Substance, {
        casNumber: '75-15-0',
        primaryName: 'Carbon disulfide',
      });
      await em.persistAndFlush(substance);

      // Act - create with SNUR (Significant New Use Rule) flag
      const tsca = em.create(SubstanceTsca, {
        substance,
        tscaCas: '75-15-0',
        inventoryStatus: TscaInventoryStatus.ACTIVE,
        isSnur: true,
      });
      await em.persistAndFlush(tsca);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceTsca, { tscaCas: '75-15-0' });
      expect(found!.isSnur).toBe(true);
    });

    it.skipIf(!dbAvailable)('should_store_cdr_flags_as_json', async () => {
      // Arrange
      const substance = em.create(Substance, {
        casNumber: '106-97-8',
        primaryName: 'Butane',
      });
      await em.persistAndFlush(substance);

      // Act - create with CDR (Chemical Data Reporting) flags
      const tsca = em.create(SubstanceTsca, {
        substance,
        tscaCas: '106-97-8',
        inventoryStatus: TscaInventoryStatus.ACTIVE,
        cdrFlags: {
          reportingRequired: true,
          lastReportingYear: 2020,
          exemptions: ['polymer', 'byproduct'],
        },
      });
      await em.persistAndFlush(tsca);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceTsca, { tscaCas: '106-97-8' });
      expect(found!.cdrFlags).toHaveProperty('reportingRequired', true);
      expect(found!.cdrFlags).toHaveProperty('lastReportingYear', 2020);
      expect((found!.cdrFlags as Record<string, unknown>)['exemptions']).toEqual(['polymer', 'byproduct']);
    });

    it.skipIf(!dbAvailable)('should_allow_null_cdr_flags', async () => {
      // Arrange
      const substance = em.create(Substance, {
        casNumber: '7440-23-5',
        primaryName: 'Sodium',
      });
      await em.persistAndFlush(substance);

      // Act
      const tsca = em.create(SubstanceTsca, {
        substance,
        tscaCas: '7440-23-5',
        inventoryStatus: TscaInventoryStatus.ACTIVE,
      });
      await em.persistAndFlush(tsca);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceTsca, { tscaCas: '7440-23-5' });
      expect(found!.cdrFlags).toBeNull();
    });

    it.skipIf(!dbAvailable)('should_index_tsca_cas_for_efficient_queries', async () => {
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

      const tsca1 = em.create(SubstanceTsca, {
        substance: substance1,
        tscaCas: '7732-18-5',
        inventoryStatus: TscaInventoryStatus.ACTIVE,
      });
      const tsca2 = em.create(SubstanceTsca, {
        substance: substance2,
        tscaCas: '64-17-5',
        inventoryStatus: TscaInventoryStatus.ACTIVE,
      });
      await em.persistAndFlush([tsca1, tsca2]);
      em.clear();

      // Act - query by tscaCas (indexed)
      const found = await em.findOne(SubstanceTsca, { tscaCas: '7732-18-5' });

      // Assert
      expect(found).not.toBeNull();
      expect(found!.tscaCas).toBe('7732-18-5');
    });

    it.skipIf(!dbAvailable)('should_find_substances_by_section6_index', async () => {
      // Arrange - create multiple substances with different Section 6 status
      const substance1 = em.create(Substance, {
        casNumber: '7439-97-6',
        primaryName: 'Mercury',
      });
      const substance2 = em.create(Substance, {
        casNumber: '7440-02-0',
        primaryName: 'Nickel',
      });
      const substance3 = em.create(Substance, {
        casNumber: '7440-38-2',
        primaryName: 'Arsenic',
      });
      await em.persistAndFlush([substance1, substance2, substance3]);

      const tsca1 = em.create(SubstanceTsca, {
        substance: substance1,
        tscaCas: '7439-97-6',
        inventoryStatus: TscaInventoryStatus.ACTIVE,
        isSection6: true,  // Priority chemical
      });
      const tsca2 = em.create(SubstanceTsca, {
        substance: substance2,
        tscaCas: '7440-02-0',
        inventoryStatus: TscaInventoryStatus.ACTIVE,
        isSection6: false,
      });
      const tsca3 = em.create(SubstanceTsca, {
        substance: substance3,
        tscaCas: '7440-38-2',
        inventoryStatus: TscaInventoryStatus.ACTIVE,
        isSection6: true,  // Priority chemical
      });
      await em.persistAndFlush([tsca1, tsca2, tsca3]);
      em.clear();

      // Act - query by isSection6 (indexed)
      const priorityChemicals = await em.find(SubstanceTsca, { isSection6: true });

      // Assert
      expect(priorityChemicals.length).toBe(2);
      const casList = priorityChemicals.map(t => t.tscaCas);
      expect(casList).toContain('7439-97-6');
      expect(casList).toContain('7440-38-2');
    });

    it.skipIf(!dbAvailable)('should_create_with_all_flags_set', async () => {
      // Arrange
      const substance = em.create(Substance, {
        casNumber: '1336-36-3',
        primaryName: 'Polychlorinated biphenyls',
      });
      await em.persistAndFlush(substance);

      // Act - create with all flags set (PCBs have multiple regulatory flags)
      const tsca = em.create(SubstanceTsca, {
        substance,
        tscaCas: '1336-36-3',
        inventoryStatus: TscaInventoryStatus.ACTIVE,
        isSection5: false,
        isSection6: true,
        isSnur: true,
        cdrFlags: {
          reportingRequired: true,
          additionalReporting: true,
        },
      });
      await em.persistAndFlush(tsca);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceTsca, { tscaCas: '1336-36-3' });
      expect(found!.isSection5).toBe(false);
      expect(found!.isSection6).toBe(true);
      expect(found!.isSnur).toBe(true);
      expect(found!.cdrFlags).toHaveProperty('reportingRequired', true);
      expect(found!.cdrFlags).toHaveProperty('additionalReporting', true);
    });
  });
});
