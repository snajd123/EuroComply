import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: {
          syntax: 'typescript',
          decorators: true,
        },
        transform: {
          decoratorMetadata: true,
          legacyDecorator: true,
        },
      },
    }),
  ],
  test: {
    globals: false,
    environment: 'node',
    // Run test files serially to avoid database isolation issues
    // when multiple tests truncate/modify shared tables concurrently
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    reporters: ['default', 'html'],
    outputFile: {
      html: './test-reports/index.html',
    },
    env: {
      DATABASE_HOST: 'localhost',
      DATABASE_PORT: '5433',
      DATABASE_USER: 'postgres',
      DATABASE_PASSWORD: 'postgres',
      DATABASE_NAME: 'eurocomply_test',
      TEST_DATABASE_NAME: 'eurocomply_test',
    },
  },
});
