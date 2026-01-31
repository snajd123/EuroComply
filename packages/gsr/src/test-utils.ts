import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { publicEntities } from '@eurocomply/database';

// GSR entities
import { RegistrySource } from './entities/RegistrySource.js';
import { RegulatoryList } from './entities/RegulatoryList.js';
import { SubstanceGroup, SubstanceGroupMember } from './entities/SubstanceGroup.js';

let testOrm: MikroORM | null = null;
let dbAvailable: boolean | null = null;

/**
 * GSR entities that will be added to the public schema.
 */
export const gsrEntities = [RegistrySource, RegulatoryList, SubstanceGroup, SubstanceGroupMember];

/**
 * All entities for GSR tests (database + GSR entities).
 */
const allTestEntities = [...publicEntities, ...gsrEntities];

/**
 * Setup test database with GSR entities included.
 */
export async function setupGsrTestDb(): Promise<MikroORM> {
  if (testOrm) {
    return testOrm;
  }

  const dbName = process.env['TEST_DATABASE_NAME'] ?? 'eurocomply_test';

  testOrm = await MikroORM.init({
    dbName,
    host: process.env['DATABASE_HOST'] ?? 'localhost',
    port: parseInt(process.env['DATABASE_PORT'] ?? '5432', 10),
    user: process.env['DATABASE_USER'] ?? 'postgres',
    password: process.env['DATABASE_PASSWORD'] ?? 'postgres',
    entities: allTestEntities,
    schema: 'public',
    allowGlobalContext: true,
    debug: false,
  });

  // Ensure database exists
  const generator = testOrm.getSchemaGenerator();
  await generator.ensureDatabase();

  // Update schema to include GSR entities
  await generator.updateSchema({ schema: 'public' });

  return testOrm;
}

/**
 * Teardown test database connection.
 */
export async function teardownGsrTestDb(): Promise<void> {
  if (testOrm) {
    await testOrm.close();
    testOrm = null;
  }
}

/**
 * Clear GSR-specific tables in the test database.
 * Order matters: clear junction tables before parent tables.
 * Also clears substance table since GSR tests may create substances.
 */
export async function clearGsrTestDb(em: EntityManager): Promise<void> {
  const connection = em.getConnection();
  // Order: junction tables first, then parent tables
  // Include substance table since SubstanceGroupMember tests create substances
  const gsrTables = [
    'substance_group_member',
    'substance_group',
    'regulatory_list',
    'registry_source',
    'substance',
  ];

  for (const table of gsrTables) {
    try {
      await connection.execute(`TRUNCATE TABLE "${table}" CASCADE`);
    } catch {
      // Table might not exist yet
    }
  }
}

/**
 * Check if database is available for testing.
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  if (dbAvailable !== null) {
    return dbAvailable;
  }

  try {
    const orm = await MikroORM.init({
      dbName: process.env['TEST_DATABASE_NAME'] ?? 'eurocomply_test',
      host: process.env['DATABASE_HOST'] ?? 'localhost',
      port: parseInt(process.env['DATABASE_PORT'] ?? '5432', 10),
      user: process.env['DATABASE_USER'] ?? 'postgres',
      password: process.env['DATABASE_PASSWORD'] ?? 'postgres',
      entities: allTestEntities,
      schema: 'public',
      allowGlobalContext: true,
      debug: false,
    });
    await orm.close();
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }

  return dbAvailable;
}
