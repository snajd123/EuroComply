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

  // Install LTREE extension (required for Category entity)
  await testOrm.em.execute('CREATE EXTENSION IF NOT EXISTS ltree');

  await generator.updateSchema();

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
  const tables = ['audit_log', 'outbox_event', 'product_version', 'product', 'attribute_template', 'unit_definition', 'category', 'organizations'];

  for (const table of tables) {
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
