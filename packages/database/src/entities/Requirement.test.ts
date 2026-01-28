import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '../test-utils.js';
import { Requirement } from './Requirement.js';
import { Regulation } from './Regulation.js';
import { RequirementType } from './enums/RequirementType.js';
import { RequirementSeverity } from './enums/RequirementSeverity.js';
import { ComparisonOperator } from './enums/ComparisonOperator.js';
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';

describe('Requirement entity', () => {
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

  async function createTestRegulation(): Promise<Regulation> {
    const regulation = new Regulation();
    regulation.code = 'TEST_REG';
    regulation.name = 'Test Regulation';
    em.persist(regulation);
    await em.flush();
    return regulation;
  }

  describe('creation', () => {
    it('should_create_attribute_check_requirement', async () => {
      const regulation = await createTestRegulation();

      const requirement = new Requirement();
      requirement.code = 'VOLTAGE_CHECK';
      requirement.name = 'Voltage Compliance Check';
      requirement.type = RequirementType.ATTRIBUTE_CHECK;
      requirement.severity = RequirementSeverity.BLOCKER;
      requirement.regulation = regulation;
      requirement.attributeTemplateKey = 'voltage';
      requirement.handlerConfig = {
        operator: ComparisonOperator.LTE,
        threshold: 240,
      };

      em.persist(requirement);
      await em.flush();
      em.clear();

      const found = await em.findOne(Requirement, { code: 'VOLTAGE_CHECK' });
      expect(found).toBeDefined();
      expect(found!.code).toBe('VOLTAGE_CHECK');
      expect(found!.name).toBe('Voltage Compliance Check');
      expect(found!.type).toBe(RequirementType.ATTRIBUTE_CHECK);
      expect(found!.severity).toBe(RequirementSeverity.BLOCKER);
      expect(found!.attributeTemplateKey).toBe('voltage');
      expect(found!.handlerConfig).toEqual({
        operator: ComparisonOperator.LTE,
        threshold: 240,
      });
    });

    it('should_create_substance_screen_requirement', async () => {
      const regulation = await createTestRegulation();

      const requirement = new Requirement();
      requirement.code = 'LEAD_SCREEN';
      requirement.name = 'Lead Substance Screen';
      requirement.type = RequirementType.SUBSTANCE_SCREEN;
      requirement.severity = RequirementSeverity.BLOCKER;
      requirement.regulation = regulation;
      requirement.substanceListId = 'svhc_candidate_list';
      requirement.handlerConfig = {
        operator: ComparisonOperator.LT,
        threshold: 0.1,
        unit: 'percent_weight',
      };

      em.persist(requirement);
      await em.flush();
      em.clear();

      const found = await em.findOne(Requirement, { code: 'LEAD_SCREEN' });
      expect(found).toBeDefined();
      expect(found!.type).toBe(RequirementType.SUBSTANCE_SCREEN);
      expect(found!.substanceListId).toBe('svhc_candidate_list');
      expect(found!.handlerConfig).toEqual({
        operator: ComparisonOperator.LT,
        threshold: 0.1,
        unit: 'percent_weight',
      });
    });

    it('should_create_declaration_requirement', async () => {
      const regulation = await createTestRegulation();

      const requirement = new Requirement();
      requirement.code = 'CE_DECLARATION';
      requirement.name = 'CE Declaration of Conformity';
      requirement.type = RequirementType.DECLARATION;
      requirement.severity = RequirementSeverity.BLOCKER;
      requirement.regulation = regulation;
      requirement.handlerConfig = {
        question: 'Has the product been CE marked?',
        acceptedAnswers: ['yes', 'true'],
      };

      em.persist(requirement);
      await em.flush();
      em.clear();

      const found = await em.findOne(Requirement, { code: 'CE_DECLARATION' });
      expect(found).toBeDefined();
      expect(found!.type).toBe(RequirementType.DECLARATION);
      expect(found!.handlerConfig).toEqual({
        question: 'Has the product been CE marked?',
        acceptedAnswers: ['yes', 'true'],
      });
    });

    it('should_create_calculated_check_requirement', async () => {
      const regulation = await createTestRegulation();

      const requirement = new Requirement();
      requirement.code = 'POWER_CALC';
      requirement.name = 'Power Consumption Calculation';
      requirement.type = RequirementType.CALCULATED_CHECK;
      requirement.severity = RequirementSeverity.WARNING;
      requirement.regulation = regulation;
      requirement.calculationFormula = 'voltage * current';
      requirement.handlerConfig = {
        operator: ComparisonOperator.LTE,
        threshold: 2000,
        unit: 'watts',
      };

      em.persist(requirement);
      await em.flush();
      em.clear();

      const found = await em.findOne(Requirement, { code: 'POWER_CALC' });
      expect(found).toBeDefined();
      expect(found!.type).toBe(RequirementType.CALCULATED_CHECK);
      expect(found!.calculationFormula).toBe('voltage * current');
      expect(found!.handlerConfig).toEqual({
        operator: ComparisonOperator.LTE,
        threshold: 2000,
        unit: 'watts',
      });
    });
  });

  describe('relationships', () => {
    it('should_belong_to_regulation', async () => {
      const regulation = await createTestRegulation();

      const requirement = new Requirement();
      requirement.code = 'REL_TEST';
      requirement.name = 'Relationship Test';
      requirement.type = RequirementType.ATTRIBUTE_CHECK;
      requirement.severity = RequirementSeverity.INFO;
      requirement.regulation = regulation;
      requirement.attributeTemplateKey = 'test_attr';
      requirement.handlerConfig = { operator: ComparisonOperator.PRESENT };

      em.persist(requirement);
      await em.flush();
      em.clear();

      const found = await em.findOne(Requirement, { code: 'REL_TEST' }, {
        populate: ['regulation'],
      });
      expect(found).toBeDefined();
      expect(found!.regulation).toBeDefined();
      expect(found!.regulation.code).toBe('TEST_REG');
    });

    it('should_enforce_unique_code_per_regulation', async () => {
      const regulation = await createTestRegulation();

      const req1 = new Requirement();
      req1.code = 'DUPLICATE_CODE';
      req1.name = 'First Requirement';
      req1.type = RequirementType.DECLARATION;
      req1.severity = RequirementSeverity.INFO;
      req1.regulation = regulation;
      req1.handlerConfig = { question: 'Q1?' };

      em.persist(req1);
      await em.flush();

      const req2 = new Requirement();
      req2.code = 'DUPLICATE_CODE';
      req2.name = 'Second Requirement';
      req2.type = RequirementType.DECLARATION;
      req2.severity = RequirementSeverity.INFO;
      req2.regulation = regulation;
      req2.handlerConfig = { question: 'Q2?' };

      em.persist(req2);
      await expect(em.flush()).rejects.toThrow();
    });

    it('should_allow_same_code_in_different_regulations', async () => {
      const reg1 = new Regulation();
      reg1.code = 'REG_1';
      reg1.name = 'Regulation 1';

      const reg2 = new Regulation();
      reg2.code = 'REG_2';
      reg2.name = 'Regulation 2';

      em.persist(reg1);
      em.persist(reg2);
      await em.flush();

      const req1 = new Requirement();
      req1.code = 'SAME_CODE';
      req1.name = 'Requirement in Reg 1';
      req1.type = RequirementType.DECLARATION;
      req1.severity = RequirementSeverity.INFO;
      req1.regulation = reg1;
      req1.handlerConfig = { question: 'Q?' };

      const req2 = new Requirement();
      req2.code = 'SAME_CODE';
      req2.name = 'Requirement in Reg 2';
      req2.type = RequirementType.DECLARATION;
      req2.severity = RequirementSeverity.INFO;
      req2.regulation = reg2;
      req2.handlerConfig = { question: 'Q?' };

      em.persist(req1);
      em.persist(req2);
      await em.flush();

      const found = await em.find(Requirement, { code: 'SAME_CODE' });
      expect(found).toHaveLength(2);
    });
  });

  describe('optional fields', () => {
    it('should_store_legal_reference', async () => {
      const regulation = await createTestRegulation();

      const requirement = new Requirement();
      requirement.code = 'LEGAL_REF_TEST';
      requirement.name = 'Legal Reference Test';
      requirement.type = RequirementType.DECLARATION;
      requirement.severity = RequirementSeverity.INFO;
      requirement.regulation = regulation;
      requirement.handlerConfig = { question: 'Test?' };
      requirement.legalReference = 'Article 33, REACH Regulation (EC) No 1907/2006';

      em.persist(requirement);
      await em.flush();
      em.clear();

      const found = await em.findOne(Requirement, { code: 'LEGAL_REF_TEST' });
      expect(found!.legalReference).toBe('Article 33, REACH Regulation (EC) No 1907/2006');
    });

    it('should_default_allow_tenant_exemption_to_true', async () => {
      const regulation = await createTestRegulation();

      const requirement = new Requirement();
      requirement.code = 'EXEMPTION_DEFAULT_TEST';
      requirement.name = 'Exemption Default Test';
      requirement.type = RequirementType.DECLARATION;
      requirement.severity = RequirementSeverity.INFO;
      requirement.regulation = regulation;
      requirement.handlerConfig = { question: 'Test?' };

      em.persist(requirement);
      await em.flush();
      em.clear();

      const found = await em.findOne(Requirement, { code: 'EXEMPTION_DEFAULT_TEST' });
      expect(found!.allowTenantExemption).toBe(true);
    });

    it('should_allow_disabling_tenant_exemption', async () => {
      const regulation = await createTestRegulation();

      const requirement = new Requirement();
      requirement.code = 'NO_EXEMPTION_TEST';
      requirement.name = 'No Exemption Test';
      requirement.type = RequirementType.ATTRIBUTE_CHECK;
      requirement.severity = RequirementSeverity.BLOCKER;
      requirement.regulation = regulation;
      requirement.attributeTemplateKey = 'critical_attr';
      requirement.handlerConfig = { operator: ComparisonOperator.PRESENT };
      requirement.allowTenantExemption = false;

      em.persist(requirement);
      await em.flush();
      em.clear();

      const found = await em.findOne(Requirement, { code: 'NO_EXEMPTION_TEST' });
      expect(found!.allowTenantExemption).toBe(false);
    });

    it('should_allow_null_for_type_specific_fields', async () => {
      const regulation = await createTestRegulation();

      // Declaration type doesn't need attributeTemplateKey, substanceListId, or calculationFormula
      const requirement = new Requirement();
      requirement.code = 'NULL_FIELDS_TEST';
      requirement.name = 'Null Fields Test';
      requirement.type = RequirementType.DECLARATION;
      requirement.severity = RequirementSeverity.INFO;
      requirement.regulation = regulation;
      requirement.handlerConfig = { question: 'Test?' };

      em.persist(requirement);
      await em.flush();
      em.clear();

      const found = await em.findOne(Requirement, { code: 'NULL_FIELDS_TEST' });
      expect(found!.attributeTemplateKey).toBeNull();
      expect(found!.substanceListId).toBeNull();
      expect(found!.calculationFormula).toBeNull();
      expect(found!.legalReference).toBeNull();
    });
  });

  describe('severity levels', () => {
    it('should_support_blocker_severity', async () => {
      const regulation = await createTestRegulation();

      const requirement = new Requirement();
      requirement.code = 'BLOCKER_TEST';
      requirement.name = 'Blocker Test';
      requirement.type = RequirementType.DECLARATION;
      requirement.severity = RequirementSeverity.BLOCKER;
      requirement.regulation = regulation;
      requirement.handlerConfig = { question: 'Critical?' };

      em.persist(requirement);
      await em.flush();
      em.clear();

      const found = await em.findOne(Requirement, { code: 'BLOCKER_TEST' });
      expect(found!.severity).toBe(RequirementSeverity.BLOCKER);
    });

    it('should_support_warning_severity', async () => {
      const regulation = await createTestRegulation();

      const requirement = new Requirement();
      requirement.code = 'WARNING_TEST';
      requirement.name = 'Warning Test';
      requirement.type = RequirementType.DECLARATION;
      requirement.severity = RequirementSeverity.WARNING;
      requirement.regulation = regulation;
      requirement.handlerConfig = { question: 'Important?' };

      em.persist(requirement);
      await em.flush();
      em.clear();

      const found = await em.findOne(Requirement, { code: 'WARNING_TEST' });
      expect(found!.severity).toBe(RequirementSeverity.WARNING);
    });

    it('should_support_info_severity', async () => {
      const regulation = await createTestRegulation();

      const requirement = new Requirement();
      requirement.code = 'INFO_TEST';
      requirement.name = 'Info Test';
      requirement.type = RequirementType.DECLARATION;
      requirement.severity = RequirementSeverity.INFO;
      requirement.regulation = regulation;
      requirement.handlerConfig = { question: 'FYI?' };

      em.persist(requirement);
      await em.flush();
      em.clear();

      const found = await em.findOne(Requirement, { code: 'INFO_TEST' });
      expect(found!.severity).toBe(RequirementSeverity.INFO);
    });
  });
});
