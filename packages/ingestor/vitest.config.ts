import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    // Database connection for integration tests
    env: {
      DATABASE_HOST: 'localhost',
      DATABASE_PORT: '5432',
      DATABASE_USER: 'postgres',
      DATABASE_PASSWORD: 'postgres',
      DATABASE_NAME: 'eurocomply_test',
      TEST_DATABASE_NAME: 'eurocomply_test',
    },
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
      thresholds: {
        // RULES.md requires 80% for new code
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
