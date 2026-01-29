// AI Regulation Ingestor Package

// Types
export * from './types/extraction.js';

// Prompts
export * from './prompts/substance-restriction-prompt.js';
export * from './prompts/gemini-shadow-prompt.js';

// Services
export { ClaudeExtractor } from './services/ClaudeExtractor.js';
export { GeminiShadow } from './services/GeminiShadow.js';
// export { Comparator } from './services/Comparator.js';
// export { IngestionPipeline } from './services/IngestionPipeline.js';
