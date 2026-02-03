import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';
import { SubstanceBiocide, BiocideStatus } from './SubstanceBiocide.js';
import { Substance } from '@eurocomply/database';

const dbAvailable = await isDatabaseAvailable();

describe('SubstanceBiocide', () => {
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
      const entity = new SubstanceBiocide();

      // Assert - verify all properties exist on the entity
      expect(entity).toHaveProperty('id');
      expect(entity).toHaveProperty('substance');
      expect(entity).toHaveProperty('biocidesRef');
      expect(entity).toHaveProperty('substanceName');
      expect(entity).toHaveProperty('status');
      expect(entity).toHaveProperty('productTypes');
      expect(entity).toHaveProperty('approvalDate');
      expect(entity).toHaveProperty('expiryDate');
      expect(entity).toHaveProperty('conditions');
      expect(entity).toHaveProperty('supplierRequirements');
      expect(entity).toHaveProperty('createdAt');
      expect(entity).toHaveProperty('updatedAt');
    });

    it.skipIf(!dbAvailable)('should_have_correct_table_name_when_entity_is_defined', async () => {
      // Arrange
      const metadata = orm.getMetadata().get(SubstanceBiocide);

      // Act & Assert
      expect(metadata.tableName).toBe('substance_biocide');
    });
  });

  describe('BiocideStatus enum', () => {
    it('should_have_all_required_status_values', () => {
      // Arrange & Act & Assert
      expect(BiocideStatus.APPROVED).toBe('APPROVED');
      expect(BiocideStatus.NOT_APPROVED).toBe('NOT_APPROVED');
      expect(BiocideStatus.UNDER_REVIEW).toBe('UNDER_REVIEW');
      expect(BiocideStatus.PENDING).toBe('PENDING');
    });
  });

  describe('entity persistence', () => {
    it.skipIf(!dbAvailable)('should_create_substance_biocide_when_all_required_fields_provided', async () => {
      // Arrange - create parent substance (PHMB - valid CAS)
      const substance = em.create(Substance, {
        casNumber: '32289-58-0',
        primaryName: 'PHMB (Polyhexamethylene biguanide)',
      });
      await em.persistAndFlush(substance);

      // Act - create biocide persona
      const biocide = em.create(SubstanceBiocide, {
        substance,
        biocidesRef: 'AS-1234',
        substanceName: 'Polyhexamethylene biguanide hydrochloride (PHMB)',
        status: BiocideStatus.APPROVED,
        productTypes: [1, 2, 4, 5, 6],
      });
      await em.persistAndFlush(biocide);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceBiocide, { biocidesRef: 'AS-1234' }, { populate: ['substance'] });
      expect(found).not.toBeNull();
      expect(found!.biocidesRef).toBe('AS-1234');
      expect(found!.substanceName).toBe('Polyhexamethylene biguanide hydrochloride (PHMB)');
      expect(found!.status).toBe(BiocideStatus.APPROVED);
      expect(found!.substance.casNumber).toBe('32289-58-0');
    });

    it.skipIf(!dbAvailable)('should_store_product_types_as_integer_array', async () => {
      // Arrange (Active chlorine released from sodium hypochlorite - valid CAS)
      const substance = em.create(Substance, {
        casNumber: '7681-52-9',
        primaryName: 'Sodium hypochlorite',
      });
      await em.persistAndFlush(substance);

      // Act - create biocide with product types PT1-PT22
      const biocide = em.create(SubstanceBiocide, {
        substance,
        biocidesRef: 'AS-5678',
        substanceName: 'Active chlorine released from sodium hypochlorite',
        status: BiocideStatus.APPROVED,
        productTypes: [1, 2, 3, 4, 5, 6, 10, 11, 12],
      });
      await em.persistAndFlush(biocide);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceBiocide, { biocidesRef: 'AS-5678' });
      // PostgreSQL integer[] may be returned as strings by the driver
      expect(found!.productTypes.map(Number)).toEqual([1, 2, 3, 4, 5, 6, 10, 11, 12]);
    });

    it.skipIf(!dbAvailable)('should_store_all_biocide_status_enum_values', async () => {
      // Arrange - create multiple substances with different statuses
      const substances = await Promise.all([
        em.create(Substance, { casNumber: '497-19-8', primaryName: 'Sodium carbonate' }),
        em.create(Substance, { casNumber: '64-17-5', primaryName: 'Ethanol' }),
        em.create(Substance, { casNumber: '7732-18-5', primaryName: 'Water' }),
        em.create(Substance, { casNumber: '7664-38-2', primaryName: 'Phosphoric acid' }),
      ]);
      await em.persistAndFlush(substances);

      // Act - create biocides with each status
      const biocideApproved = em.create(SubstanceBiocide, {
        substance: substances[0],
        biocidesRef: 'AS-STATUS-1',
        substanceName: 'Test Approved',
        status: BiocideStatus.APPROVED,
        productTypes: [1],
      });
      const biocideNotApproved = em.create(SubstanceBiocide, {
        substance: substances[1],
        biocidesRef: 'AS-STATUS-2',
        substanceName: 'Test Not Approved',
        status: BiocideStatus.NOT_APPROVED,
        productTypes: [2],
      });
      const biocideUnderReview = em.create(SubstanceBiocide, {
        substance: substances[2],
        biocidesRef: 'AS-STATUS-3',
        substanceName: 'Test Under Review',
        status: BiocideStatus.UNDER_REVIEW,
        productTypes: [3],
      });
      const biocidePending = em.create(SubstanceBiocide, {
        substance: substances[3],
        biocidesRef: 'AS-STATUS-4',
        substanceName: 'Test Pending',
        status: BiocideStatus.PENDING,
        productTypes: [4],
      });
      await em.persistAndFlush([biocideApproved, biocideNotApproved, biocideUnderReview, biocidePending]);
      em.clear();

      // Assert
      const foundApproved = await em.findOne(SubstanceBiocide, { biocidesRef: 'AS-STATUS-1' });
      const foundNotApproved = await em.findOne(SubstanceBiocide, { biocidesRef: 'AS-STATUS-2' });
      const foundUnderReview = await em.findOne(SubstanceBiocide, { biocidesRef: 'AS-STATUS-3' });
      const foundPending = await em.findOne(SubstanceBiocide, { biocidesRef: 'AS-STATUS-4' });

      expect(foundApproved!.status).toBe(BiocideStatus.APPROVED);
      expect(foundNotApproved!.status).toBe(BiocideStatus.NOT_APPROVED);
      expect(foundUnderReview!.status).toBe(BiocideStatus.UNDER_REVIEW);
      expect(foundPending!.status).toBe(BiocideStatus.PENDING);
    });

    it.skipIf(!dbAvailable)('should_store_approval_and_expiry_dates', async () => {
      // Arrange (Peracetic acid - valid CAS: 79-21-0)
      const substance = em.create(Substance, {
        casNumber: '79-21-0',
        primaryName: 'Peracetic acid',
      });
      await em.persistAndFlush(substance);

      // Act - create biocide with dates
      const approvalDate = new Date('2022-07-01');
      const expiryDate = new Date('2032-07-01');
      const biocide = em.create(SubstanceBiocide, {
        substance,
        biocidesRef: 'AS-DATES-1',
        substanceName: 'Peracetic acid',
        status: BiocideStatus.APPROVED,
        productTypes: [1, 2, 3, 4, 5, 6, 11, 12],
        approvalDate,
        expiryDate,
      });
      await em.persistAndFlush(biocide);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceBiocide, { biocidesRef: 'AS-DATES-1' });
      expect(found!.approvalDate).toEqual(approvalDate);
      expect(found!.expiryDate).toEqual(expiryDate);
    });

    it.skipIf(!dbAvailable)('should_store_conditions_and_supplier_requirements_text', async () => {
      // Arrange (Hydrogen peroxide - valid CAS: 7722-84-1)
      const substance = em.create(Substance, {
        casNumber: '7722-84-1',
        primaryName: 'Hydrogen peroxide',
      });
      await em.persistAndFlush(substance);

      // Act - create biocide with conditions and supplier requirements
      const conditions = 'Only for use in disinfection of drinking water. Maximum concentration 0.3 mg/L.';
      const supplierRequirements = 'All technical grade hydrogen peroxide suppliers must be registered in Article 95 list.';
      const biocide = em.create(SubstanceBiocide, {
        substance,
        biocidesRef: 'AS-COND-1',
        substanceName: 'Hydrogen peroxide',
        status: BiocideStatus.APPROVED,
        productTypes: [1, 2, 3, 4, 5, 11, 12],
        conditions,
        supplierRequirements,
      });
      await em.persistAndFlush(biocide);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceBiocide, { biocidesRef: 'AS-COND-1' });
      expect(found!.conditions).toBe(conditions);
      expect(found!.supplierRequirements).toBe(supplierRequirements);
    });

    it.skipIf(!dbAvailable)('should_allow_nullable_fields_to_be_null', async () => {
      // Arrange (Silver - valid CAS: 7440-22-4)
      const substance = em.create(Substance, {
        casNumber: '7440-22-4',
        primaryName: 'Silver',
      });
      await em.persistAndFlush(substance);

      // Act - create biocide with only required fields
      const biocide = em.create(SubstanceBiocide, {
        substance,
        biocidesRef: 'AS-NULL-1',
        substanceName: 'Silver',
        status: BiocideStatus.UNDER_REVIEW,
        productTypes: [1, 2, 9],
      });
      await em.persistAndFlush(biocide);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceBiocide, { biocidesRef: 'AS-NULL-1' });
      expect(found).not.toBeNull();
      // Database returns null for nullable columns with no value
      expect(found!.approvalDate).toBeNull();
      expect(found!.expiryDate).toBeNull();
      expect(found!.conditions).toBeNull();
      expect(found!.supplierRequirements).toBeNull();
    });

    it.skipIf(!dbAvailable)('should_index_biocides_ref_for_efficient_queries', async () => {
      // Arrange (Copper sulfate - valid CAS: 7758-98-7)
      const substance = em.create(Substance, {
        casNumber: '7758-98-7',
        primaryName: 'Copper sulfate',
      });
      await em.persistAndFlush(substance);

      const biocide = em.create(SubstanceBiocide, {
        substance,
        biocidesRef: 'AS-INDEX-1',
        substanceName: 'Copper sulfate pentahydrate',
        status: BiocideStatus.APPROVED,
        productTypes: [2, 8],
      });
      await em.persistAndFlush(biocide);
      em.clear();

      // Act - query by biocidesRef (indexed)
      const found = await em.findOne(SubstanceBiocide, { biocidesRef: 'AS-INDEX-1' });

      // Assert
      expect(found).not.toBeNull();
      expect(found!.biocidesRef).toBe('AS-INDEX-1');
    });

    it.skipIf(!dbAvailable)('should_index_status_for_efficient_queries', async () => {
      // Arrange (Boric acid - valid CAS: 10043-35-3)
      const substance = em.create(Substance, {
        casNumber: '10043-35-3',
        primaryName: 'Boric acid',
      });
      await em.persistAndFlush(substance);

      const biocide = em.create(SubstanceBiocide, {
        substance,
        biocidesRef: 'AS-STAT-IDX-1',
        substanceName: 'Boric acid',
        status: BiocideStatus.NOT_APPROVED,
        productTypes: [8, 14, 18],
      });
      await em.persistAndFlush(biocide);
      em.clear();

      // Act - query by status (indexed)
      const found = await em.find(SubstanceBiocide, { status: BiocideStatus.NOT_APPROVED });

      // Assert
      expect(found).toHaveLength(1);
      expect(found[0].biocidesRef).toBe('AS-STAT-IDX-1');
    });

    it.skipIf(!dbAvailable)('should_index_expiry_date_for_efficient_queries', async () => {
      // Arrange (Glutaraldehyde - valid CAS: 111-30-8)
      const substance = em.create(Substance, {
        casNumber: '111-30-8',
        primaryName: 'Glutaraldehyde',
      });
      await em.persistAndFlush(substance);

      const expiryDate = new Date('2025-12-31');
      const biocide = em.create(SubstanceBiocide, {
        substance,
        biocidesRef: 'AS-EXP-IDX-1',
        substanceName: 'Glutaraldehyde',
        status: BiocideStatus.APPROVED,
        productTypes: [2, 3, 4, 6, 11, 12],
        expiryDate,
      });
      await em.persistAndFlush(biocide);
      em.clear();

      // Act - query by expiry date (indexed)
      const found = await em.find(SubstanceBiocide, {
        expiryDate: { $lte: new Date('2026-01-01') }
      });

      // Assert
      expect(found).toHaveLength(1);
      expect(found[0].biocidesRef).toBe('AS-EXP-IDX-1');
    });

    it.skipIf(!dbAvailable)('should_support_product_types_covering_pt1_through_pt22', async () => {
      // Arrange (Formaldehyde - valid CAS: 50-00-0)
      const substance = em.create(Substance, {
        casNumber: '50-00-0',
        primaryName: 'Formaldehyde',
      });
      await em.persistAndFlush(substance);

      // Act - create biocide with all 22 product types
      const allProductTypes = Array.from({ length: 22 }, (_, i) => i + 1);
      const biocide = em.create(SubstanceBiocide, {
        substance,
        biocidesRef: 'AS-PT-ALL',
        substanceName: 'Formaldehyde',
        status: BiocideStatus.APPROVED,
        productTypes: allProductTypes,
      });
      await em.persistAndFlush(biocide);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceBiocide, { biocidesRef: 'AS-PT-ALL' });
      expect(found!.productTypes).toHaveLength(22);
      // PostgreSQL integer[] may be returned as strings by the driver
      expect(found!.productTypes.map(Number)).toEqual(allProductTypes);
    });

    it.skipIf(!dbAvailable)('should_update_biocide_record', async () => {
      // Arrange (Propan-2-ol - valid CAS: 67-63-0)
      const substance = em.create(Substance, {
        casNumber: '67-63-0',
        primaryName: 'Propan-2-ol',
      });
      await em.persistAndFlush(substance);

      const biocide = em.create(SubstanceBiocide, {
        substance,
        biocidesRef: 'AS-UPDATE-1',
        substanceName: 'Propan-2-ol (Isopropanol)',
        status: BiocideStatus.PENDING,
        productTypes: [1, 2],
      });
      await em.persistAndFlush(biocide);
      const biocideId = biocide.id;
      em.clear();

      // Act - update the record
      const toUpdate = await em.findOneOrFail(SubstanceBiocide, { id: biocideId });
      toUpdate.status = BiocideStatus.APPROVED;
      toUpdate.productTypes = [1, 2, 4];
      toUpdate.approvalDate = new Date('2023-01-15');
      toUpdate.conditions = 'Approved for human hygiene use';
      await em.persistAndFlush(toUpdate);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceBiocide, { id: biocideId });
      expect(found!.status).toBe(BiocideStatus.APPROVED);
      // PostgreSQL integer[] may be returned as strings by the driver
      expect(found!.productTypes.map(Number)).toEqual([1, 2, 4]);
      expect(found!.approvalDate).toEqual(new Date('2023-01-15'));
      expect(found!.conditions).toBe('Approved for human hygiene use');
    });

    it.skipIf(!dbAvailable)('should_delete_biocide_record', async () => {
      // Arrange (Citric acid - valid CAS: 77-92-9)
      const substance = em.create(Substance, {
        casNumber: '77-92-9',
        primaryName: 'Citric acid',
      });
      await em.persistAndFlush(substance);

      const biocide = em.create(SubstanceBiocide, {
        substance,
        biocidesRef: 'AS-DELETE-1',
        substanceName: 'Citric acid',
        status: BiocideStatus.APPROVED,
        productTypes: [2, 3, 4],
      });
      await em.persistAndFlush(biocide);
      const biocideId = biocide.id;
      em.clear();

      // Act
      const toDelete = await em.findOneOrFail(SubstanceBiocide, { id: biocideId });
      await em.removeAndFlush(toDelete);
      em.clear();

      // Assert
      const found = await em.findOne(SubstanceBiocide, { id: biocideId });
      expect(found).toBeNull();
    });
  });
});
