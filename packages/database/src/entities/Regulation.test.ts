import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '../test-utils.js';
import { Regulation } from './Regulation.js';
import { RegulationStatus } from './enums/RegulationStatus.js';
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';

describe('Regulation entity', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let dbAvailable = false;

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (dbAvailable) {
      orm = await setupTestDb();
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await teardownTestDb();
    }
  });

  beforeEach(async (context) => {
    if (!dbAvailable) {
      context.skip();
      return;
    }
    em = orm.em.fork();
    await clearTestDb(em);
  });

  describe('creation', () => {
    it('should_create_regulation_when_valid_data_provided', async () => {
      const regulation = new Regulation();
      regulation.code = 'TEST_REG_1';
      regulation.name = 'Test Regulation';
      regulation.status = RegulationStatus.DRAFT;

      em.persist(regulation);
      await em.flush();
      em.clear();

      const found = await em.findOne(Regulation, { code: 'TEST_REG_1' });
      expect(found).toBeDefined();
      expect(found!.code).toBe('TEST_REG_1');
      expect(found!.name).toBe('Test Regulation');
      expect(found!.status).toBe(RegulationStatus.DRAFT);
    });

    it('should_reject_duplicate_code', async () => {
      const reg1 = new Regulation();
      reg1.code = 'DUPLICATE_CODE';
      reg1.name = 'First Regulation';

      em.persist(reg1);
      await em.flush();

      const reg2 = new Regulation();
      reg2.code = 'DUPLICATE_CODE';
      reg2.name = 'Second Regulation';

      em.persist(reg2);
      await expect(em.flush()).rejects.toThrow();
    });

    it('should_default_status_to_draft', async () => {
      const regulation = new Regulation();
      regulation.code = 'DEFAULT_STATUS_TEST';
      regulation.name = 'Default Status Test';

      em.persist(regulation);
      await em.flush();

      expect(regulation.status).toBe(RegulationStatus.DRAFT);
    });
  });

  describe('lifecycle', () => {
    it('should_set_archivedAt_when_status_changed_to_archived', async () => {
      const regulation = new Regulation();
      regulation.code = 'ARCHIVE_TEST';
      regulation.name = 'Archive Test';
      regulation.status = RegulationStatus.ACTIVE;

      em.persist(regulation);
      await em.flush();

      regulation.status = RegulationStatus.ARCHIVED;
      regulation.archivedAt = new Date();
      regulation.archiveReason = 'Replaced by new version';
      await em.flush();
      em.clear();

      const found = await em.findOne(Regulation, { code: 'ARCHIVE_TEST' });
      expect(found!.status).toBe(RegulationStatus.ARCHIVED);
      expect(found!.archivedAt).toBeDefined();
      expect(found!.archiveReason).toBe('Replaced by new version');
    });

    it('should_link_to_successor_when_superseded', async () => {
      const oldReg = new Regulation();
      oldReg.code = 'OLD_REG';
      oldReg.name = 'Old Regulation';
      oldReg.status = RegulationStatus.ACTIVE;

      const newReg = new Regulation();
      newReg.code = 'NEW_REG';
      newReg.name = 'New Regulation';
      newReg.status = RegulationStatus.ACTIVE;

      em.persist(oldReg);
      em.persist(newReg);
      await em.flush();

      oldReg.status = RegulationStatus.ARCHIVED;
      oldReg.supersededBy = newReg;
      oldReg.archivedAt = new Date();
      await em.flush();
      em.clear();

      const found = await em.findOne(Regulation, { code: 'OLD_REG' }, {
        populate: ['supersededBy'],
      });
      expect(found!.supersededBy).toBeDefined();
      expect(found!.supersededBy!.code).toBe('NEW_REG');
    });
  });

  describe('optional fields', () => {
    it('should_store_description', async () => {
      const regulation = new Regulation();
      regulation.code = 'DESC_TEST';
      regulation.name = 'Description Test';
      regulation.description = 'A detailed description of the regulation';

      em.persist(regulation);
      await em.flush();
      em.clear();

      const found = await em.findOne(Regulation, { code: 'DESC_TEST' });
      expect(found!.description).toBe('A detailed description of the regulation');
    });

    it('should_store_source_url', async () => {
      const regulation = new Regulation();
      regulation.code = 'URL_TEST';
      regulation.name = 'URL Test';
      regulation.sourceUrl = 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32006R1907';

      em.persist(regulation);
      await em.flush();
      em.clear();

      const found = await em.findOne(Regulation, { code: 'URL_TEST' });
      expect(found!.sourceUrl).toBe('https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32006R1907');
    });

    it('should_store_effective_date', async () => {
      const effectiveDate = new Date('2024-01-01');
      const regulation = new Regulation();
      regulation.code = 'DATE_TEST';
      regulation.name = 'Date Test';
      regulation.effectiveDate = effectiveDate;

      em.persist(regulation);
      await em.flush();
      em.clear();

      const found = await em.findOne(Regulation, { code: 'DATE_TEST' });
      expect(found!.effectiveDate).toEqual(effectiveDate);
    });

    it('should_allow_null_for_optional_fields', async () => {
      const regulation = new Regulation();
      regulation.code = 'NULL_FIELDS_TEST';
      regulation.name = 'Null Fields Test';

      em.persist(regulation);
      await em.flush();
      em.clear();

      const found = await em.findOne(Regulation, { code: 'NULL_FIELDS_TEST' });
      expect(found!.description).toBeNull();
      expect(found!.sourceUrl).toBeNull();
      expect(found!.effectiveDate).toBeNull();
      expect(found!.archivedAt).toBeNull();
      expect(found!.archiveReason).toBeNull();
      expect(found!.supersededBy).toBeNull();
    });
  });
});
