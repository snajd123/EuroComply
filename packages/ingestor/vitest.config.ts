import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        // Re-export index files don't contain executable code
        'src/index.ts',
        // Test files
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
      ],
      // Coverage thresholds disabled - documented exceptions below:
      // 1. External API clients (ClaudeExtractor.extract, GeminiShadow.extract)
      //    cannot be tested without real API keys and incurring costs.
      // 2. The ingestAndStage method requires a database connection.
      // See IngestionPipeline.integration.test.ts for documented exceptions.
    },
  },
});
