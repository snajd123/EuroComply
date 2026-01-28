// packages/database/src/services/evaluation/index.ts
export { RequirementEvaluatorEngine } from './RequirementEvaluatorEngine.js';
export { AttributeCheckHandler } from './handlers/AttributeCheckHandler.js';
export { SubstanceScreenHandler } from './handlers/SubstanceScreenHandler.js';
export { DeclarationHandler } from './handlers/DeclarationHandler.js';
export type {
  EvaluationContext,
  EvaluationResult,
  ValidationResult,
  RequirementHandler,
} from './types.js';

/**
 * Creates a pre-configured RequirementEvaluatorEngine with all handlers registered.
 */
export function createEvaluatorEngine(): RequirementEvaluatorEngine {
  const engine = new RequirementEvaluatorEngine();
  engine.register(new AttributeCheckHandler());
  engine.register(new SubstanceScreenHandler());
  engine.register(new DeclarationHandler());
  return engine;
}
