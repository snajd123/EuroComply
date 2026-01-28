// packages/database/src/services/evaluation/__tests__/RequirementEvaluatorEngine.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { RequirementEvaluatorEngine } from '../RequirementEvaluatorEngine.js';
import { AttributeCheckHandler } from '../handlers/AttributeCheckHandler.js';
import { SubstanceScreenHandler } from '../handlers/SubstanceScreenHandler.js';
import { DeclarationHandler } from '../handlers/DeclarationHandler.js';
import { RequirementType, RequirementSeverity } from '../../../entities/enums/index.js';
import type { EvaluationContext } from '../types.js';

describe('RequirementEvaluatorEngine', () => {
  let engine: RequirementEvaluatorEngine;

  beforeAll(() => {
    engine = new RequirementEvaluatorEngine();
    engine.register(new AttributeCheckHandler());
    engine.register(new SubstanceScreenHandler());
    engine.register(new DeclarationHandler());
  });

  describe('evaluate', () => {
    it('should_dispatch_to_correct_handler_for_attribute_check', async () => {
      const context: EvaluationContext = {
        productVersionId: 'test-pv',
        requirement: {
          id: 'req-1',
          code: 'TEST_ATTR',
          name: 'Test Attribute',
          type: RequirementType.ATTRIBUTE_CHECK,
          severity: RequirementSeverity.WARNING,
          attributeTemplateKey: 'test_attr',
          handlerConfig: { operator: '>=', threshold: 50 },
        },
        regulation: { id: 'reg-1', code: 'REG', name: 'Regulation' },
      };

      const result = await engine.evaluate({
        ...context,
        _testAttributeValue: 60,
      } as EvaluationContext);

      expect(result.passed).toBe(true);
      expect(result.status).toBe('PASS');
    });

    it('should_dispatch_to_correct_handler_for_substance_screen', async () => {
      const context: EvaluationContext = {
        productVersionId: 'test-pv',
        requirement: {
          id: 'req-2',
          code: 'TEST_SCREEN',
          name: 'Test Screen',
          type: RequirementType.SUBSTANCE_SCREEN,
          severity: RequirementSeverity.BLOCKER,
          substanceListId: 'list-1',
          handlerConfig: { defaultThresholdPct: 0.1 },
        },
        regulation: { id: 'reg-1', code: 'REG', name: 'Regulation' },
      };

      const result = await engine.evaluate({
        ...context,
        _testSubstanceMatches: [],
      } as EvaluationContext);

      expect(result.passed).toBe(true);
    });

    it('should_throw_for_unregistered_handler', async () => {
      const context: EvaluationContext = {
        productVersionId: 'test-pv',
        requirement: {
          id: 'req-3',
          code: 'TEST_CALC',
          name: 'Test Calc',
          type: RequirementType.CALCULATED_CHECK,  // Not registered
          severity: RequirementSeverity.WARNING,
        },
        regulation: { id: 'reg-1', code: 'REG', name: 'Regulation' },
      };

      await expect(engine.evaluate(context)).rejects.toThrow(/No handler/);
    });
  });

  describe('validateConfig', () => {
    it('should_validate_using_correct_handler', () => {
      const result = engine.validateConfig(
        RequirementType.ATTRIBUTE_CHECK,
        { operator: '>=', threshold: 25 },
        { attributeTemplateKey: 'recycled_content' }
      );

      expect(result.valid).toBe(true);
    });

    it('should_return_errors_from_handler', () => {
      const result = engine.validateConfig(
        RequirementType.SUBSTANCE_SCREEN,
        {},
        {}  // Missing substanceListId
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SUBSTANCE_SCREEN requires substanceListId');
    });
  });
});
