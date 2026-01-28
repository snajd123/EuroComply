// packages/database/src/services/evaluation/__tests__/SubstanceScreenHandler.test.ts
import { describe, it, expect } from 'vitest';
import { SubstanceScreenHandler } from '../handlers/SubstanceScreenHandler.js';
import { RequirementType, RequirementSeverity } from '../../../entities/enums/index.js';
import type { EvaluationContext } from '../types.js';

describe('SubstanceScreenHandler', () => {
  const handler = new SubstanceScreenHandler();

  describe('type', () => {
    it('should_have_correct_type', () => {
      expect(handler.type).toBe(RequirementType.SUBSTANCE_SCREEN);
    });
  });

  describe('validateConfig', () => {
    it('should_reject_missing_substanceListId', () => {
      const result = handler.validateConfig(
        { defaultThresholdPct: 0.1 },
        {}  // No substanceListId
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SUBSTANCE_SCREEN requires substanceListId');
    });

    it('should_accept_valid_config', () => {
      const result = handler.validateConfig(
        { defaultThresholdPct: 0.1 },
        { substanceListId: 'test-list-id' }
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('evaluate', () => {
    const baseContext: EvaluationContext = {
      productVersionId: 'test-product-version-id',
      requirement: {
        id: 'test-req-id',
        code: 'TEST_SCREEN',
        name: 'Test Substance Screen',
        type: RequirementType.SUBSTANCE_SCREEN,
        severity: RequirementSeverity.BLOCKER,
        substanceListId: 'test-list-id',
        handlerConfig: { defaultThresholdPct: 0.1 },
      },
      regulation: {
        id: 'test-reg-id',
        code: 'TEST_REG',
        name: 'Test Regulation',
      },
    };

    it('should_pass_when_no_substances_detected', async () => {
      const context = {
        ...baseContext,
        _testSubstanceMatches: [],  // No matches
      };

      const result = await handler.evaluate(context as EvaluationContext);

      expect(result.passed).toBe(true);
      expect(result.status).toBe('PASS');
    });

    it('should_fail_when_substance_above_threshold', async () => {
      const context = {
        ...baseContext,
        _testSubstanceMatches: [
          { substanceId: 's1', name: 'Lead', concentration: 0.15 },  // Above 0.1% threshold
        ],
      };

      const result = await handler.evaluate(context as EvaluationContext);

      expect(result.passed).toBe(false);
      expect(result.status).toBe('FAIL');
      expect(result.details.violations).toHaveLength(1);
    });

    it('should_pass_when_substance_below_threshold', async () => {
      const context = {
        ...baseContext,
        _testSubstanceMatches: [
          { substanceId: 's1', name: 'Cadmium', concentration: 0.05 },  // Below 0.1%
        ],
      };

      const result = await handler.evaluate(context as EvaluationContext);

      expect(result.passed).toBe(true);
      expect(result.status).toBe('PASS');
    });
  });
});
