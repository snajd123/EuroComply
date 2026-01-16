/**
 * Integration test setup - real database connection.
 *
 * Each test file gets an isolated tenant schema that is created before
 * tests run and dropped after tests complete.
 */
import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { PrismaClient, createTenantSchema, dropTenantSchema } from '@eurocomply/db';
import { randomBytes } from 'crypto';

// Use test database
const TEST_DATABASE_URL =
  process.env['DATABASE_URL'] ||
  'postgresql://postgres:postgres@localhost:5432/eurocomply_test?schema=public';

// Global Prisma client for integration tests
export const testPrisma = new PrismaClient({
  datasources: {
    db: { url: TEST_DATABASE_URL },
  },
  log: process.env['DEBUG'] ? ['query', 'error', 'warn'] : ['error'],
});

/**
 * Test context passed to each test.
 */
export interface TestContext {
  prisma: PrismaClient;
  schemaName: string;
  organizationId: string;
  userId: string;
}

// Current test context (set per test file)
let currentContext: TestContext | null = null;

/**
 * Generate a unique schema name for test isolation.
 */
function generateSchemaName(): string {
  const id = randomBytes(4).toString('hex');
  return `test_${id}`;
}

/**
 * Set up integration test environment.
 * Call this in beforeAll() of your integration test file.
 */
export async function setupIntegrationTest(): Promise<TestContext> {
  const schemaName = generateSchemaName();

  // Create test organization in public schema
  const organization = await testPrisma.organization.create({
    data: {
      name: `Test Org ${schemaName}`,
      slug: schemaName,
      schemaName: schemaName,
      subscriptionTier: 'starter',
      subscriptionStatus: 'active',
      userLimit: 20,
      storageLimit: BigInt(536870912000),
    },
  });

  // Create test user
  const user = await testPrisma.user.create({
    data: {
      clerkId: `clerk_test_${schemaName}`,
      email: `test-${schemaName}@example.com`,
      name: 'Test User',
    },
  });

  // Create organization membership
  await testPrisma.organizationUser.create({
    data: {
      organizationId: organization.id,
      userId: user.id,
      role: 'owner',
      designAuthority: 'MANAGER',
      operationsAuthority: 'MANAGER',
      marketingAuthority: 'MANAGER',
      complianceAuthority: 'MANAGER',
    },
  });

  // Create tenant schema
  await createTenantSchema(testPrisma, schemaName);

  currentContext = {
    prisma: testPrisma,
    schemaName,
    organizationId: organization.id,
    userId: user.id,
  };

  return currentContext;
}

/**
 * Tear down integration test environment.
 * Call this in afterAll() of your integration test file.
 */
export async function teardownIntegrationTest(): Promise<void> {
  if (!currentContext) return;

  try {
    // Drop tenant schema
    await dropTenantSchema(testPrisma, currentContext.schemaName);

    // Clean up organization data (cascades to membership)
    await testPrisma.organizationUser.deleteMany({
      where: { organizationId: currentContext.organizationId },
    });
    await testPrisma.user.deleteMany({
      where: { id: currentContext.userId },
    });
    await testPrisma.organization.deleteMany({
      where: { id: currentContext.organizationId },
    });
  } catch (error) {
    console.error('Error during test teardown:', error);
  }

  currentContext = null;
}

/**
 * Get current test context.
 */
export function getTestContext(): TestContext {
  if (!currentContext) {
    throw new Error('Test context not initialized. Call setupIntegrationTest() in beforeAll()');
  }
  return currentContext;
}

/**
 * Clean up outbox events between tests.
 */
export async function cleanupOutboxEvents(): Promise<void> {
  if (!currentContext) return;
  await testPrisma.outboxEvent.deleteMany({
    where: { organizationId: currentContext.organizationId },
  });
}

/**
 * Disconnect test database.
 * Call this once at the end of all integration tests.
 */
export async function disconnectTestDatabase(): Promise<void> {
  await testPrisma.$disconnect();
}
