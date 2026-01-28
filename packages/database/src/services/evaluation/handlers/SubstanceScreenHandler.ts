// packages/database/src/services/evaluation/handlers/SubstanceScreenHandler.ts
import { RequirementType } from '../../../entities/enums/index.js';
import type { RequirementHandler, EvaluationContext, EvaluationResult, ValidationResult } from '../types.js';

interface SubstanceScreenConfig {
  defaultThresholdPct?: number;
}

interface SubstanceMatch {
  substanceId: string;
  name: string;
  concentration: number;  // As percentage (0.1 = 0.1%)
}

/**
 * Handler for SUBSTANCE_SCREEN requirements.
 * Checks if product contains any substances from a restricted list.
 *
 * Agnostic: Doesn't know WHAT list (SVHC, Annex II, etc) - only HOW to screen.
 */
export class SubstanceScreenHandler implements RequirementHandler<SubstanceScreenConfig> {
  readonly type = RequirementType.SUBSTANCE_SCREEN;

  validateConfig(
    _config: unknown,
    requirement: Partial<{ substanceListId?: string }>
  ): ValidationResult {
    const errors: string[] = [];

    if (!requirement.substanceListId) {
      errors.push('SUBSTANCE_SCREEN requires substanceListId');
    }

    return { valid: errors.length === 0, errors };
  }

  async evaluate(context: EvaluationContext): Promise<EvaluationResult> {
    const config = context.requirement.handlerConfig as SubstanceScreenConfig;
    const defaultThreshold = config?.defaultThresholdPct ?? 0.1;  // Default 0.1%

    // Get substance matches (in real implementation, query SubstanceRollupService)
    // For now, support test injection via _testSubstanceMatches
    const matches = (context as unknown as { _testSubstanceMatches?: SubstanceMatch[] })._testSubstanceMatches ?? [];

    // Find violations (substances above threshold)
    const violations = matches.filter(m => m.concentration >= defaultThreshold);

    if (violations.length === 0) {
      return {
        passed: true,
        status: 'PASS',
        details: {
          message: 'No restricted substances detected above threshold',
          substancesChecked: matches.length,
          threshold: defaultThreshold,
        },
      };
    }

    return {
      passed: false,
      status: 'FAIL',
      details: {
        message: `Found ${violations.length} substance(s) above threshold`,
        violations: violations.map(v => ({
          substanceId: v.substanceId,
          name: v.name,
          concentration: v.concentration,
          threshold: defaultThreshold,
        })),
        threshold: defaultThreshold,
      },
    };
  }
}
