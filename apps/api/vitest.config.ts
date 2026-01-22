import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
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
