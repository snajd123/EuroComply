import { beforeAll, afterAll } from 'vitest';

// Set test environment variables (use ??= to allow overrides)
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] ??= 'postgresql://postgres:postgres@localhost:5433/eurocomply_test?schema=public';
process.env['CLERK_SECRET_KEY'] ??= 'test_clerk_secret_key';

beforeAll(async () => {
  // Global setup before all tests
});

afterAll(async () => {
  // Global cleanup after all tests
});
