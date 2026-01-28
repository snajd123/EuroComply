// packages/database/src/services/evaluation/handlers/DeclarationHandler.ts
import { RequirementType } from '../../../entities/enums/index.js';
import type { RequirementHandler, EvaluationContext, EvaluationResult, ValidationResult } from '../types.js';

interface DeclarationConfig {
  question: string;
  acceptedAnswers?: string[];
  requiresDocument?: boolean;
  acceptedDocumentTypes?: string[];
}

interface Declaration {
  answer: string;
  attestedBy: string;
  attestedAt?: Date;
  documentKey?: string;
}

/**
 * Handler for DECLARATION requirements.
 * Checks if a user has provided the required attestation.
 *
 * Agnostic: Doesn't know WHAT declaration - only HOW to validate attestations.
 */
export class DeclarationHandler implements RequirementHandler<DeclarationConfig> {
  readonly type = RequirementType.DECLARATION;

  validateConfig(config: unknown): ValidationResult {
    const errors: string[] = [];
    const cfg = config as Partial<DeclarationConfig>;

    if (!cfg?.question) {
      errors.push('DECLARATION requires question in handlerConfig');
    }

    return { valid: errors.length === 0, errors };
  }

  async evaluate(context: EvaluationContext): Promise<EvaluationResult> {
    const config = context.requirement.handlerConfig as unknown as DeclarationConfig;

    // Get declaration (in real implementation, query from ComplianceEvidence)
    const declaration = (context as unknown as { _testDeclaration?: Declaration })._testDeclaration;

    if (!declaration) {
      return {
        passed: false,
        status: 'INCOMPLETE',
        details: {
          message: 'Declaration not provided',
          question: config.question,
        },
      };
    }

    // Check if document required but not provided
    if (config.requiresDocument && !declaration.documentKey) {
      return {
        passed: false,
        status: 'INCOMPLETE',
        details: {
          message: 'Required document not uploaded',
          question: config.question,
          requiresDocument: true,
          acceptedDocumentTypes: config.acceptedDocumentTypes,
        },
      };
    }

    return {
      passed: true,
      status: 'PASS',
      details: {
        answer: declaration.answer,
        attestedBy: declaration.attestedBy,
        attestedAt: declaration.attestedAt,
        documentKey: declaration.documentKey,
        question: config.question,
      },
    };
  }
}
