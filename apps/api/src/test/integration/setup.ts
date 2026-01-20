/**
 * Integration test setup - real database connection.
 *
 * Each test file gets an isolated tenant schema that is created before
 * tests run and dropped after tests complete.
 */
import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { PrismaClient, createTenantSchema, dropTenantSchema } from '@eurocomply/db';
import { randomBytes } from 'crypto';

// ============================================
// TEST DATA GENERATORS
// ============================================

/**
 * Calculate GTIN check digit using modulo 10 algorithm.
 */
function calculateGtinCheckDigit(digits: string): number {
  let sum = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    const position = digits.length - i;
    const multiplier = position % 2 === 1 ? 3 : 1;
    sum += parseInt(digits[i]!, 10) * multiplier;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Generate a valid GTIN-14 with correct checksum for testing.
 * Uses random digits to ensure test isolation.
 */
export function generateTestGtin(): string {
  const base = Math.floor(Math.random() * 1e13).toString().padStart(13, '0');
  const checkDigit = calculateGtinCheckDigit(base);
  return base + checkDigit;
}

/**
 * Generate a unique DPP URI for testing.
 */
export function generateTestDppUri(): string {
  const uniqueId = randomBytes(8).toString('hex');
  return `https://dpp.test.eurocomply.eu/test/${uniqueId}`;
}

/**
 * Generate a unique test value for SKU/INTERNAL identifiers.
 */
export function generateTestValue(prefix: string = 'TEST'): string {
  const uniqueId = randomBytes(6).toString('hex');
  return `${prefix}-${uniqueId}`;
}

// Use test database (port 5433 maps to postgres-test container)
const TEST_DATABASE_URL =
  process.env['DATABASE_URL'] ||
  'postgresql://postgres:postgres@localhost:5433/eurocomply_test?schema=public';

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
 * Uses tenant_ prefix to match validation requirements.
 */
function generateSchemaName(): string {
  const id = randomBytes(4).toString('hex');
  return `tenant_test${id}`;
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
 *
 * Performs thorough cleanup in correct order (respecting foreign keys):
 * 1. BOM entries
 * 2. Product versions
 * 3. Product identifiers
 * 4. Products
 * 5. Outbox events
 * 6. Organization users
 * 7. Users
 * 8. Organizations
 * 9. Tenant schema
 */
export async function teardownIntegrationTest(): Promise<void> {
  if (!currentContext) return;

  const { organizationId, userId, schemaName } = currentContext;

  try {
    // 1. Delete BOM entries (depends on product versions)
    await testPrisma.bomEntry.deleteMany({
      where: { version: { product: { organizationId } } },
    });

    // 2. Delete product versions (depends on products)
    await testPrisma.productVersion.deleteMany({
      where: { product: { organizationId } },
    });

    // 3. Delete product identifiers (depends on products)
    await testPrisma.productIdentifier.deleteMany({
      where: { product: { organizationId } },
    });

    // 4. Delete products
    await testPrisma.product.deleteMany({
      where: { organizationId },
    });

    // 5. Delete outbox events
    await testPrisma.outboxEvent.deleteMany({
      where: { organizationId },
    });

    // 6. Delete organization users
    await testPrisma.organizationUser.deleteMany({
      where: { organizationId },
    });

    // 7. Delete user
    await testPrisma.user.deleteMany({
      where: { id: userId },
    });

    // 8. Delete organization
    await testPrisma.organization.deleteMany({
      where: { id: organizationId },
    });

    // 9. Drop tenant schema
    await dropTenantSchema(testPrisma, schemaName);
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
