/**
 * Integration test setup - real database connection.
 *
 * Each test file gets an isolated tenant schema that is created before
 * tests run and dropped after tests complete.
 */
import { MikroORM, EntityManager, PostgreSqlDriver } from '@mikro-orm/postgresql';
import {
  MikroOrm,
  createTenantSchemaMikroOrm,
  dropTenantSchemaMikroOrm,
} from '@eurocomply/db';
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

// Global MikroORM instance for integration tests (initialized lazily)
let _testOrm: MikroORM | null = null;

/**
 * Get or initialize the test MikroORM instance.
 */
async function getTestOrm(): Promise<MikroORM> {
  if (!_testOrm) {
    _testOrm = await MikroORM.init({
      driver: PostgreSqlDriver,
      clientUrl: TEST_DATABASE_URL,
      entities: [
        MikroOrm.Organization,
        MikroOrm.User,
        MikroOrm.OrganizationUser,
        MikroOrm.UserDidHistory,
        MikroOrm.OrgDidHistory,
        MikroOrm.Product,
        MikroOrm.ProductIdentifier,
        MikroOrm.ProductVersion,
        MikroOrm.BomEntry,
        MikroOrm.OutboxEvent,
        MikroOrm.OperationsEvent,
        MikroOrm.DppSnapshot,
        MikroOrm.ReadinessProfile,
        MikroOrm.AuditLog,
        MikroOrm.StatusList,
        MikroOrm.StatusListEntry,
      ],
      debug: !!process.env['DEBUG'],
      allowGlobalContext: true,
    });
  }
  return _testOrm;
}

/**
 * Exported testOrm for direct access (lazy initialization).
 * Use getTestOrm() for async initialization.
 */
export const testOrm = {
  get orm(): MikroORM {
    if (!_testOrm) {
      throw new Error('Test ORM not initialized. Call setupIntegrationTest() first.');
    }
    return _testOrm;
  },
  get em(): EntityManager {
    return this.orm.em;
  },
};

/**
 * Test context passed to each test.
 */
export interface TestContext {
  orm: MikroORM;
  em: EntityManager;
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
  const orm = await getTestOrm();
  const em = orm.em.fork();
  const schemaName = generateSchemaName();

  // Create test organization in public schema
  const organization = em.create(MikroOrm.Organization, {
    name: `Test Org ${schemaName}`,
    slug: schemaName,
    schemaName: schemaName,
    subscriptionTier: 'starter',
    subscriptionStatus: 'active',
    userLimit: 20,
    storageLimit: BigInt(536870912000),
  });
  await em.persistAndFlush(organization);

  // Create test user
  const user = em.create(MikroOrm.User, {
    clerkId: `clerk_test_${schemaName}`,
    email: `test-${schemaName}@example.com`,
    name: 'Test User',
  });
  await em.persistAndFlush(user);

  // Create organization membership
  const membership = em.create(MikroOrm.OrganizationUser, {
    organization: organization,
    user: user,
    role: 'owner',
    designAuthority: 'MANAGER',
    operationsAuthority: 'MANAGER',
    marketingAuthority: 'MANAGER',
    complianceAuthority: 'MANAGER',
  });
  await em.persistAndFlush(membership);

  // Create tenant schema
  await createTenantSchemaMikroOrm(orm, schemaName);

  currentContext = {
    orm,
    em,
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

  const { orm, organizationId, userId, schemaName } = currentContext;
  const em = orm.em.fork();

  try {
    // 1. Delete BOM entries (depends on product versions)
    await em.nativeDelete(MikroOrm.BomEntry, {
      version: { product: { organization: organizationId } },
    });

    // 2. Delete product versions (depends on products)
    await em.nativeDelete(MikroOrm.ProductVersion, {
      product: { organization: organizationId },
    });

    // 3. Delete product identifiers (depends on products)
    await em.nativeDelete(MikroOrm.ProductIdentifier, {
      product: { organization: organizationId },
    });

    // 4. Delete products
    await em.nativeDelete(MikroOrm.Product, {
      organization: organizationId,
    });

    // 5. Delete outbox events
    await em.nativeDelete(MikroOrm.OutboxEvent, {
      organization: organizationId,
    });

    // 6. Delete organization users
    await em.nativeDelete(MikroOrm.OrganizationUser, {
      organization: organizationId,
    });

    // 7. Delete user
    await em.nativeDelete(MikroOrm.User, {
      id: userId,
    });

    // 8. Delete organization
    await em.nativeDelete(MikroOrm.Organization, {
      id: organizationId,
    });

    // 9. Drop tenant schema
    await dropTenantSchemaMikroOrm(orm, schemaName);
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
  const em = currentContext.orm.em.fork();
  await em.nativeDelete(MikroOrm.OutboxEvent, {
    organization: currentContext.organizationId,
  });
}

/**
 * Disconnect test database.
 * Call this once at the end of all integration tests.
 */
export async function disconnectTestDatabase(): Promise<void> {
  if (_testOrm) {
    await _testOrm.close();
    _testOrm = null;
  }
}
