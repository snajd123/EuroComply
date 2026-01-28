// packages/database/src/services/evaluation/__tests__/DeclarationHandler.test.ts
import { describe, it, expect } from 'vitest';
import { DeclarationHandler } from '../handlers/DeclarationHandler.js';
import { RequirementType, RequirementSeverity } from '../../../entities/enums/index.js';
import type { EvaluationContext } from '../types.js';

describe('DeclarationHandler', () => {
  const handler = new DeclarationHandler();

  describe('type', () => {
    it('should_have_correct_type', () => {
      expect(handler.type).toBe(RequirementType.DECLARATION);
    });
  });

  describe('validateConfig', () => {
    it('should_reject_missing_question', () => {
      const result = handler.validateConfig(
        { acceptedAnswers: ['Yes', 'No'] },
        {}
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('DECLARATION requires question in handlerConfig');
    });

    it('should_accept_valid_config', () => {
      const result = handler.validateConfig(
        {
          question: 'Has testing been completed?',
          acceptedAnswers: ['Yes', 'No'],
        },
        {}
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('evaluate', () => {
    const baseContext: EvaluationContext = {
      productVersionId: 'test-product-version-id',
      requirement: {
        id: 'test-req-id',
        code: 'TEST_DECL',
        name: 'Test Declaration',
        type: RequirementType.DECLARATION,
        severity: RequirementSeverity.BLOCKER,
        handlerConfig: {
          question: 'Has product testing been completed?',
          acceptedAnswers: ['Yes', 'No', 'N/A'],
          requiresDocument: false,
        },
      },
      regulation: {
        id: 'test-reg-id',
        code: 'TEST_REG',
        name: 'Test Regulation',
      },
    };

    it('should_return_incomplete_when_no_declaration', async () => {
      const context = {
        ...baseContext,
        _testDeclaration: undefined,
      };

      const result = await handler.evaluate(context as EvaluationContext);

      expect(result.passed).toBe(false);
      expect(result.status).toBe('INCOMPLETE');
    });

    it('should_pass_when_declaration_provided', async () => {
      const context = {
        ...baseContext,
        _testDeclaration: {
          answer: 'Yes',
          attestedBy: 'user@tenant.com',
          attestedAt: new Date(),
        },
      };

      const result = await handler.evaluate(context as EvaluationContext);

      expect(result.passed).toBe(true);
      expect(result.status).toBe('PASS');
    });

    it('should_require_document_when_specified', async () => {
      const context = {
        ...baseContext,
        requirement: {
          ...baseContext.requirement,
          handlerConfig: {
            question: 'Upload test certificate',
            requiresDocument: true,
            acceptedDocumentTypes: ['application/pdf'],
          },
        },
        _testDeclaration: {
          answer: 'Yes',
          attestedBy: 'user@tenant.com',
          // No document
        },
      };

      const result = await handler.evaluate(context as EvaluationContext);

      expect(result.passed).toBe(false);
      expect(result.status).toBe('INCOMPLETE');
      expect(result.details.message).toContain('document');
    });
  });
});
