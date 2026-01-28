// packages/database/src/services/evaluation/index.ts
import { RequirementEvaluatorEngine as Engine } from './RequirementEvaluatorEngine.js';
import { AttributeCheckHandler as AttrHandler } from './handlers/AttributeCheckHandler.js';
import { SubstanceScreenHandler as SubstHandler } from './handlers/SubstanceScreenHandler.js';
import { DeclarationHandler as DeclHandler } from './handlers/DeclarationHandler.js';

// Re-export for external use
export { Engine as RequirementEvaluatorEngine };
export { AttrHandler as AttributeCheckHandler };
export { SubstHandler as SubstanceScreenHandler };
export { DeclHandler as DeclarationHandler };
export type {
  EvaluationContext,
  EvaluationResult,
  ValidationResult,
  RequirementHandler,
} from './types.js';

/**
 * Creates a pre-configured RequirementEvaluatorEngine with all handlers registered.
 */
export function createEvaluatorEngine(): Engine {
  const engine = new Engine();
  engine.register(new AttrHandler());
  engine.register(new SubstHandler());
  engine.register(new DeclHandler());
  return engine;
}
