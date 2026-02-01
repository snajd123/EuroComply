import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';
import { HazardStatement } from './HazardStatement.js';
import { HazardClass, HazardType } from './HazardClass.js';

const dbAvailable = await isDatabaseAvailable();

describe('HazardStatement', () => {
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

  describe('entity creation', () => {
    it.skipIf(!dbAvailable)('should_store_translations_when_provided', async () => {
      const statement = em.create(HazardStatement, {
        code: 'H350',
        translations: {
          en: 'May cause cancer',
          de: 'Kann Krebs erzeugen',
          fr: 'Peut provoquer le cancer',
        },
      });
      await em.persistAndFlush(statement);
      em.clear();

      const found = await em.findOne(HazardStatement, { code: 'H350' });
      expect(found?.translations.en).toBe('May cause cancer');
      expect(found?.translations.de).toBe('Kann Krebs erzeugen');
      expect(found?.translations.fr).toBe('Peut provoquer le cancer');
    });

    it.skipIf(!dbAvailable)('should_link_to_primary_hazard_class', async () => {
      const hazardClass = em.create(HazardClass, {
        code: 'Carc.',
        fullName: 'Carcinogenicity',
        hazardType: HazardType.HEALTH,
        isCmr: true,
      });
      await em.persistAndFlush(hazardClass);
      em.clear();

      const em2 = orm.em.fork();
      const loadedClass = await em2.findOneOrFail(HazardClass, { code: 'Carc.' });
      const statement = em2.create(HazardStatement, {
        code: 'H350i',
        translations: { en: 'May cause cancer by inhalation' },
        primaryHazardClass: loadedClass,
      });
      await em2.persistAndFlush(statement);
      em2.clear();

      const found = await em2.findOne(HazardStatement, { code: 'H350i' }, { populate: ['primaryHazardClass'] });
      expect(found?.primaryHazardClass?.code).toBe('Carc.');
      expect(found?.primaryHazardClass?.fullName).toBe('Carcinogenicity');
    });

    it.skipIf(!dbAvailable)('should_use_code_as_primary_key', async () => {
      const statement = em.create(HazardStatement, {
        code: 'H300',
        translations: { en: 'Fatal if swallowed' },
      });
      await em.persistAndFlush(statement);
      em.clear();

      const found = await em.findOne(HazardStatement, 'H300');
      expect(found?.translations.en).toBe('Fatal if swallowed');
    });

    it.skipIf(!dbAvailable)('should_allow_null_primary_hazard_class', async () => {
      const statement = em.create(HazardStatement, {
        code: 'H301',
        translations: { en: 'Toxic if swallowed' },
      });
      await em.persistAndFlush(statement);
      em.clear();

      const found = await em.findOne(HazardStatement, { code: 'H301' }, { populate: ['primaryHazardClass'] });
      expect(found).not.toBeNull();
      expect(found?.primaryHazardClass).toBeNull();
    });

    it.skipIf(!dbAvailable)('should_support_combined_h_statements', async () => {
      // Combined H-statements like H300+H310 or EUH070
      const combinedStatement = em.create(HazardStatement, {
        code: 'H300+H310',
        translations: {
          en: 'Fatal if swallowed or in contact with skin',
          de: 'Lebensgefahr bei Verschlucken oder bei Hautkontakt',
        },
      });
      await em.persistAndFlush(combinedStatement);
      em.clear();

      const found = await em.findOne(HazardStatement, { code: 'H300+H310' });
      expect(found?.translations.en).toBe('Fatal if swallowed or in contact with skin');
    });

    it.skipIf(!dbAvailable)('should_support_euh_statements', async () => {
      // EUH statements are EU-specific supplemental information
      const euhStatement = em.create(HazardStatement, {
        code: 'EUH001',
        translations: {
          en: 'Explosive when dry',
          de: 'In trockenem Zustand explosionsgefaehrlich',
        },
      });
      await em.persistAndFlush(euhStatement);
      em.clear();

      const found = await em.findOne(HazardStatement, { code: 'EUH001' });
      expect(found?.translations.en).toBe('Explosive when dry');
    });

    it.skipIf(!dbAvailable)('should_query_statements_by_hazard_class', async () => {
      // Create hazard class
      const hazardClass = em.create(HazardClass, {
        code: 'Acute Tox.',
        fullName: 'Acute Toxicity',
        hazardType: HazardType.HEALTH,
        isCmr: false,
      });
      await em.persistAndFlush(hazardClass);

      // Create multiple statements for the same hazard class
      const h300 = em.create(HazardStatement, {
        code: 'H300',
        translations: { en: 'Fatal if swallowed' },
        primaryHazardClass: hazardClass,
      });
      const h301 = em.create(HazardStatement, {
        code: 'H301',
        translations: { en: 'Toxic if swallowed' },
        primaryHazardClass: hazardClass,
      });
      const h302 = em.create(HazardStatement, {
        code: 'H302',
        translations: { en: 'Harmful if swallowed' },
        primaryHazardClass: hazardClass,
      });
      await em.persistAndFlush([h300, h301, h302]);
      em.clear();

      // Query all statements for the hazard class
      const statements = await em.find(HazardStatement, { primaryHazardClass: { code: 'Acute Tox.' } });
      expect(statements).toHaveLength(3);
      expect(statements.map(s => s.code).sort()).toEqual(['H300', 'H301', 'H302']);
    });
  });
});
