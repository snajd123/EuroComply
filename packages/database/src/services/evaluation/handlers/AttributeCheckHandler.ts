// packages/database/src/services/evaluation/handlers/AttributeCheckHandler.ts
import { RequirementType } from '../../../entities/enums/index.js';
import type { RequirementHandler, EvaluationContext, EvaluationResult, ValidationResult } from '../types.js';

interface AttributeCheckConfig {
  operator: '>=' | '<=' | '>' | '<' | '==' | '!=';
  threshold: number;
  unit?: string;
}

/**
 * Handler for ATTRIBUTE_CHECK requirements.
 * Compares a product attribute value against a threshold.
 *
 * Agnostic: Doesn't know WHAT regulation - only HOW to compare values.
 */
export class AttributeCheckHandler implements RequirementHandler<AttributeCheckConfig> {
  readonly type = RequirementType.ATTRIBUTE_CHECK;

  validateConfig(
    config: unknown,
    requirement: Partial<{ attributeTemplateKey?: string }>
  ): ValidationResult {
    const errors: string[] = [];

    if (!requirement.attributeTemplateKey) {
      errors.push('ATTRIBUTE_CHECK requires attributeTemplateKey');
    }

    const cfg = config as Partial<AttributeCheckConfig>;
    if (!cfg?.operator) {
      errors.push('ATTRIBUTE_CHECK requires operator in handlerConfig');
    }
    if (cfg?.threshold === undefined) {
      errors.push('ATTRIBUTE_CHECK requires threshold in handlerConfig');
    }

    return { valid: errors.length === 0, errors };
  }

  async evaluate(context: EvaluationContext): Promise<EvaluationResult> {
    const config = context.requirement.handlerConfig as AttributeCheckConfig;
    const { operator, threshold, unit } = config;

    // Get attribute value (in real implementation, fetch from ProductVersion attributes)
    // For now, support test injection via _testAttributeValue
    const actualValue = (context as unknown as { _testAttributeValue?: number })._testAttributeValue;

    if (actualValue === undefined || actualValue === null) {
      return {
        passed: false,
        status: 'INCOMPLETE',
        details: {
          message: `Attribute "${context.requirement.attributeTemplateKey}" not set on product`,
          expectedValue: threshold,
          operator,
          unit,
        },
      };
    }

    const passed = this.compare(actualValue, operator, threshold);

    return {
      passed,
      status: passed ? 'PASS' : 'FAIL',
      details: {
        actualValue,
        expectedValue: threshold,
        threshold,
        operator,
        unit,
        message: passed
          ? `${actualValue}${unit || ''} ${operator} ${threshold}${unit || ''}`
          : `${actualValue}${unit || ''} does not satisfy ${operator} ${threshold}${unit || ''}`,
      },
    };
  }

  private compare(actual: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case '>=': return actual >= threshold;
      case '<=': return actual <= threshold;
      case '>': return actual > threshold;
      case '<': return actual < threshold;
      case '==': return actual === threshold;
      case '!=': return actual !== threshold;
      default: return false;
    }
  }
}
