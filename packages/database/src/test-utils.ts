import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import config from './mikro-orm.config.js';

let testOrm: MikroORM | null = null;
let dbAvailable: boolean | null = null;

export async function setupTestDb(): Promise<MikroORM> {
  if (testOrm) {
    return testOrm;
  }

  testOrm = await MikroORM.init({
    ...config,
    dbName: process.env['TEST_DATABASE_NAME'] ?? 'eurocomply_test',
    allowGlobalContext: true,
  });

  // Ensure schema and required extensions exist
  const generator = testOrm.getSchemaGenerator();
  await generator.ensureDatabase();

  // Install LTREE extension (required for Category entity in tenant schemas)
  // Extensions are database-wide, so we install it here for use by tenant provisioner
  // Note: Wrapped in try-catch to handle race condition when tests run in parallel
  try {
    await testOrm.em.execute('CREATE EXTENSION IF NOT EXISTS ltree');
  } catch (error) {
    // Ignore duplicate key error - another test already created the extension
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('pg_extension_name_index')) {
      throw error;
    }
  }

  // Only update the public schema, not tenant schemas created by other tests
  await generator.updateSchema({ schema: 'public' });

  return testOrm;
}

export async function teardownTestDb(): Promise<void> {
  if (testOrm) {
    await testOrm.close();
    testOrm = null;
  }
}

export async function clearTestDb(em: EntityManager): Promise<void> {
  const connection = em.getConnection();
  // Only clear PUBLIC schema tables (Organization, OutboxEvent, WebhookEvent)
  // Tenant tables are in tenant schemas, not public
  const publicTables = ['outbox_event', 'organizations', 'webhook_events'];

  for (const table of publicTables) {
    try {
      await connection.execute(`TRUNCATE TABLE "${table}" CASCADE`);
    } catch {
      // Table might not exist yet
    }
  }
}

export async function isDatabaseAvailable(): Promise<boolean> {
  if (dbAvailable !== null) {
    return dbAvailable;
  }

  try {
    const orm = await MikroORM.init({
      ...config,
      dbName: process.env['TEST_DATABASE_NAME'] ?? 'eurocomply_test',
      allowGlobalContext: true,
    });
    await orm.close();
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }

  return dbAvailable;
}
