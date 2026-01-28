// packages/database/src/services/evaluation/RequirementEvaluatorEngine.ts
import { RequirementType } from '../../entities/enums/index.js';
import type { RequirementHandler, EvaluationContext, EvaluationResult, ValidationResult } from './types.js';

/**
 * RequirementEvaluatorEngine - Registry-based handler dispatch.
 *
 * This is the "brain" of the compliance engine. It:
 * 1. Registers handlers for each RequirementType at startup
 * 2. Dispatches evaluation requests to the correct handler
 * 3. Never contains regulation-specific logic
 *
 * The engine is AGNOSTIC - it knows HOW to dispatch, not WHAT regulations exist.
 */
export class RequirementEvaluatorEngine {
  private handlers = new Map<RequirementType, RequirementHandler>();

  /**
   * Register a handler for a requirement type.
   * Called at application startup.
   */
  register(handler: RequirementHandler): void {
    if (this.handlers.has(handler.type)) {
      throw new Error(`Handler already registered for type: ${handler.type}`);
    }
    this.handlers.set(handler.type, handler);
  }

  /**
   * Evaluate a requirement against product data.
   * Dispatches to the appropriate handler based on requirement type.
   */
  async evaluate(context: EvaluationContext): Promise<EvaluationResult> {
    const handler = this.handlers.get(context.requirement.type);
    if (!handler) {
      throw new Error(`No handler registered for type: ${context.requirement.type}`);
    }
    return handler.evaluate(context);
  }

  /**
   * Validate handler configuration before saving a requirement.
   * Used at admin API level to prevent broken rules.
   */
  validateConfig(
    type: RequirementType,
    config: unknown,
    requirement: Partial<{
      attributeTemplateKey?: string;
      substanceListId?: string;
      calculationFormula?: string;
    }>
  ): ValidationResult {
    const handler = this.handlers.get(type);
    if (!handler) {
      return {
        valid: false,
        errors: [`No handler registered for type: ${type}`],
      };
    }
    return handler.validateConfig(config, requirement);
  }

  /**
   * Get all registered handler types.
   */
  getRegisteredTypes(): RequirementType[] {
    return Array.from(this.handlers.keys());
  }
}
