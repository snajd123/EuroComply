import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    // Run integration test files serially to avoid MikroORM metadata conflicts
    // when multiple tests create/drop tenant schemas concurrently
    fileParallelism: false,
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
