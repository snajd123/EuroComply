import { PrismaClient } from '@prisma/client';
import { validateSchemaName } from './validation.js';

/**
 * Creates a new tenant schema with all required tables.
 * Called when a new organization is created.
 *
 * @throws Error if schema name fails validation (SQL injection prevention)
 */
export async function createTenantSchema(
  prisma: PrismaClient,
  schemaName: string
): Promise<void> {
  // Validate schema name against strict allowlist pattern
  validateSchemaName(schemaName);

  // Create schema
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

  // Create products table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${schemaName}".products (
      id VARCHAR(30) PRIMARY KEY,
      sku VARCHAR(100) NOT NULL,
      name VARCHAR(500) NOT NULL,
      description TEXT,
      category VARCHAR(100),
      status VARCHAR(20) DEFAULT 'DRAFT',
      created_by VARCHAR(30) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      archived_at TIMESTAMPTZ,
      UNIQUE(sku)
    )
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_products_sku ON "${schemaName}".products(sku)`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_products_status ON "${schemaName}".products(status)`
  );

  // Create audit log table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${schemaName}".audit_log (
      id VARCHAR(30) PRIMARY KEY,
      user_id VARCHAR(30) NOT NULL,
      action VARCHAR(50) NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      entity_id VARCHAR(30) NOT NULL,
      old_values JSONB,
      new_values JSONB,
      ip_address VARCHAR(45),
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_audit_entity ON "${schemaName}".audit_log(entity_type, entity_id)`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_audit_user ON "${schemaName}".audit_log(user_id, created_at DESC)`
  );
}

/**
 * Drops a tenant schema (use with extreme caution!).
 * Only for cleanup during development or account deletion.
 *
 * @throws Error if schema name fails validation (SQL injection prevention)
 */
export async function dropTenantSchema(
  prisma: PrismaClient,
  schemaName: string
): Promise<void> {
  // Validate schema name against strict allowlist pattern
  validateSchemaName(schemaName);

  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
}

/**
 * Lists all tenant schemas in the database.
 */
export async function listTenantSchemas(prisma: PrismaClient): Promise<string[]> {
  const result = await prisma.$queryRaw<{ schema_name: string }[]>`
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%'
    ORDER BY schema_name
  `;
  return result.map((r) => r.schema_name);
}
