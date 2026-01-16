import { beforeAll, afterAll, beforeEach } from 'vitest';

// Set test environment variables
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] = 'postgresql://postgres:postgres@localhost:5432/eurocomply_test?schema=public';
process.env['CLERK_SECRET_KEY'] = 'test_clerk_secret_key';

beforeAll(async () => {
  // Global setup before all tests
  console.log('Starting test suite...');
});

afterAll(async () => {
  // Global cleanup after all tests
  console.log('Test suite complete.');
});

beforeEach(async () => {
  // Reset state before each test if needed
});
