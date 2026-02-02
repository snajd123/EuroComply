import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { publicEntities } from '@eurocomply/database';

// GSR entities
import { RegistrySource } from './entities/RegistrySource.js';
import { RegulatoryList } from './entities/RegulatoryList.js';
import { SubstanceGroup, SubstanceGroupMember } from './entities/SubstanceGroup.js';
import { SubstanceListEntry } from './entities/SubstanceListEntry.js';
import { UnresolvedSubstance } from './entities/UnresolvedSubstance.js';
import { BlindDisclosureRequest } from './entities/BlindDisclosureRequest.js';
import { HazardClass } from './entities/HazardClass.js';
import { HazardStatement } from './entities/HazardStatement.js';
import { SubstanceHazardClassification } from './entities/SubstanceHazardClassification.js';
import { SubstanceCosing } from './entities/SubstanceCosing.js';
import { SubstanceEfsa } from './entities/SubstanceEfsa.js';

let testOrm: MikroORM | null = null;
let dbAvailable: boolean | null = null;

/**
 * GSR entities that will be added to the public schema.
 */
export const gsrEntities = [RegistrySource, RegulatoryList, SubstanceGroup, SubstanceGroupMember, SubstanceListEntry, UnresolvedSubstance, BlindDisclosureRequest, HazardClass, HazardStatement, SubstanceHazardClassification, SubstanceCosing, SubstanceEfsa];

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
  // blind_disclosure_request must come before unresolved_substance due to FK
  const gsrTables = [
    'substance_efsa',  // Must come before substance due to FK
    'substance_cosing',  // Must come before substance due to FK
    'blind_disclosure_request',
    'unresolved_substance',
    'substance_list_entry',
    'substance_group_member',
    'substance_group',
    'regulatory_list',
    'registry_source',
    'substance_hazard_classification',  // Must come before hazard_class and substance due to FK
    'hazard_statement',  // Must come before hazard_class due to FK
    'hazard_class',
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
