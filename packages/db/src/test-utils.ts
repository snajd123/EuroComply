import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import config from './mikro-orm.config.js';
import {
  createTenantSchema,
  dropTenantSchema,
  formatSchemaName,
  createTenantEm,
} from './tenant-context.js';

/**
 * Generates a unique test ID with prefix.
 */
export function generateTestId(): string {
  return `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Creates a MikroORM instance configured for testing.
 * Uses discovery.warnWhenNoEntities: false since we may not have entities yet.
 */
export async function createTestOrm(): Promise<MikroORM> {
  return MikroORM.init({
    ...config,
    dbName: process.env['TEST_DATABASE_NAME'] || 'eurocomply_test',
    allowGlobalContext: true,
    // Disable debug logging in tests unless explicitly enabled
    debug: process.env['DEBUG_ORM'] === 'true',
    // Allow initialization without entities (for raw SQL operations)
    entities: [],
    entitiesTs: [],
    discovery: {
      warnWhenNoEntities: false,
    },
  });
}

/**
 * Creates a tenant schema for testing.
 * Returns the schema name.
 */
export async function setupTestTenant(
  orm: MikroORM,
  testSlug: string
): Promise<string> {
  const schemaName = formatSchemaName(testSlug);

  // Drop if exists (cleanup from previous failed test)
  await dropTenantSchema(orm, schemaName).catch(() => {});

  // Create fresh schema
  await createTenantSchema(orm, schemaName);

  return schemaName;
}

/**
 * Drops a tenant schema after testing.
 */
export async function teardownTestTenant(
  orm: MikroORM,
  schemaName: string
): Promise<void> {
  await dropTenantSchema(orm, schemaName);
}

/**
 * Creates a tenant-scoped EntityManager for testing.
 */
export function createTestEm(orm: MikroORM, schemaName: string): EntityManager {
  return createTenantEm(orm, schemaName);
}

/**
 * Helper to clean all data from a tenant schema without dropping it.
 * Deletes in reverse dependency order based on foreign key constraints.
 */
export async function cleanTenantData(em: EntityManager): Promise<void> {
  // Delete in reverse dependency order
  await em.execute('DELETE FROM audit_log');
  await em.execute('DELETE FROM status_list_entries');
  await em.execute('DELETE FROM status_lists');
  await em.execute('DELETE FROM outbox_events');
  await em.execute('DELETE FROM operations_events');
  await em.execute('DELETE FROM dpp_snapshots');
  await em.execute('DELETE FROM bom_entries');
  await em.execute('DELETE FROM product_versions');
  await em.execute('DELETE FROM product_identifiers');
  await em.execute('DELETE FROM products');
  await em.execute('DELETE FROM readiness_profiles');
  await em.execute('DELETE FROM org_did_history');
  await em.execute('DELETE FROM user_did_history');
  await em.execute('DELETE FROM organization_users');
  await em.execute('DELETE FROM users');
}
