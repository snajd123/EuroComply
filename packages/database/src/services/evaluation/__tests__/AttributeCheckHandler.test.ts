// packages/database/src/services/evaluation/__tests__/AttributeCheckHandler.test.ts
import { describe, it, expect } from 'vitest';
import { AttributeCheckHandler } from '../handlers/AttributeCheckHandler.js';
import { RequirementType, RequirementSeverity } from '../../../entities/enums/index.js';
import type { EvaluationContext } from '../types.js';

describe('AttributeCheckHandler', () => {
  const handler = new AttributeCheckHandler();

  describe('type', () => {
    it('should_have_correct_type', () => {
      expect(handler.type).toBe(RequirementType.ATTRIBUTE_CHECK);
    });
  });

  describe('validateConfig', () => {
    it('should_reject_missing_attributeTemplateKey', () => {
      const result = handler.validateConfig(
        { operator: '>=', threshold: 25 },
        {}  // No attributeTemplateKey
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ATTRIBUTE_CHECK requires attributeTemplateKey');
    });

    it('should_reject_missing_operator', () => {
      const result = handler.validateConfig(
        { threshold: 25 },  // No operator
        { attributeTemplateKey: 'recycled_content' }
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ATTRIBUTE_CHECK requires operator in handlerConfig');
    });

    it('should_reject_missing_threshold', () => {
      const result = handler.validateConfig(
        { operator: '>=' },  // No threshold
        { attributeTemplateKey: 'recycled_content' }
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ATTRIBUTE_CHECK requires threshold in handlerConfig');
    });

    it('should_accept_valid_config', () => {
      const result = handler.validateConfig(
        { operator: '>=', threshold: 25, unit: '%' },
        { attributeTemplateKey: 'recycled_content' }
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('evaluate', () => {
    const baseContext: EvaluationContext = {
      productVersionId: 'test-product-version-id',
      requirement: {
        id: 'test-req-id',
        code: 'TEST_ATTR',
        name: 'Test Attribute Check',
        type: RequirementType.ATTRIBUTE_CHECK,
        severity: RequirementSeverity.BLOCKER,
        attributeTemplateKey: 'recycled_content',
        handlerConfig: { operator: '>=', threshold: 25, unit: '%' },
      },
      regulation: {
        id: 'test-reg-id',
        code: 'TEST_REG',
        name: 'Test Regulation',
      },
    };

    it('should_pass_when_value_meets_threshold', async () => {
      // Mock: Product has recycled_content = 30%
      const context = {
        ...baseContext,
        // In real implementation, handler would fetch attribute from DB
        // For testing, we'll inject the value via a test helper
        _testAttributeValue: 30,
      };

      const result = await handler.evaluate(context as EvaluationContext);

      expect(result.passed).toBe(true);
      expect(result.status).toBe('PASS');
      expect(result.details.actualValue).toBe(30);
      expect(result.details.threshold).toBe(25);
    });

    it('should_fail_when_value_below_threshold', async () => {
      const context = {
        ...baseContext,
        _testAttributeValue: 20,  // Below 25% threshold
      };

      const result = await handler.evaluate(context as EvaluationContext);

      expect(result.passed).toBe(false);
      expect(result.status).toBe('FAIL');
      expect(result.details.actualValue).toBe(20);
    });

    it('should_return_incomplete_when_attribute_not_set', async () => {
      const context = {
        ...baseContext,
        _testAttributeValue: undefined,  // No value set
      };

      const result = await handler.evaluate(context as EvaluationContext);

      expect(result.passed).toBe(false);
      expect(result.status).toBe('INCOMPLETE');
      expect(result.details.message).toContain('not set');
    });
  });
});
