// packages/database/src/services/evaluation/types.ts
import { RequirementType, RequirementSeverity } from '../../entities/enums/index.js';

/**
 * Context passed to requirement handlers for evaluation.
 * Contains all data needed to evaluate a requirement against a product.
 */
export interface EvaluationContext {
  productVersionId: string;
  requirement: {
    id: string;
    code: string;
    name: string;
    type: RequirementType;
    severity: RequirementSeverity;
    attributeTemplateKey?: string;
    substanceListId?: string;
    calculationFormula?: string;
    handlerConfig?: Record<string, unknown>;
    legalReference?: string;
  };
  regulation: {
    id: string;
    code: string;
    name: string;
  };
}

/**
 * Result of evaluating a requirement.
 */
export interface EvaluationResult {
  passed: boolean;
  status: 'PASS' | 'FAIL' | 'INCOMPLETE' | 'NOT_APPLICABLE';
  details: {
    actualValue?: unknown;
    expectedValue?: unknown;
    threshold?: number;
    operator?: string;
    message?: string;
    [key: string]: unknown;
  };
}

/**
 * Result of validating handler configuration.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Interface for requirement handlers.
 * Each handler knows HOW to evaluate a type, not WHAT regulations exist.
 *
 * The engine is regulation-agnostic - it dispatches to handlers by type.
 */
export interface RequirementHandler<TConfig = unknown> {
  readonly type: RequirementType;

  /**
   * Evaluate the requirement against product data.
   * Handler doesn't know WHAT regulation - only HOW to check this type.
   */
  evaluate(context: EvaluationContext): Promise<EvaluationResult>;

  /**
   * Validate handler configuration at admin API level.
   * Prevents broken rules from ever hitting the database.
   */
  validateConfig(config: TConfig, requirement: Partial<{
    attributeTemplateKey?: string;
    substanceListId?: string;
    calculationFormula?: string;
  }>): ValidationResult;
}
