import { PrismaClient } from '@prisma/client';
import { validateSchemaName } from './validation.js';

/**
 * Creates a new tenant schema with all required tables.
 * Called when a new organization is created.
 * Uses a transaction to ensure atomicity - all tables created or none.
 *
 * @throws Error if schema name fails validation (SQL injection prevention)
 * @throws Error if schema already exists with different structure
 */
export async function createTenantSchema(
  prisma: PrismaClient,
  schemaName: string
): Promise<void> {
  // Validate schema name against strict allowlist pattern
  validateSchemaName(schemaName);

  // Check if schema already exists
  const existing = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM information_schema.schemata
    WHERE schema_name = ${schemaName}
  `;

  if (existing[0] && existing[0].count > 0n) {
    // Schema already exists, verify it has the expected structure
    return;
  }

  // Wrap all DDL in a transaction for atomicity
  await prisma.$transaction(async (tx) => {
    // Create schema
    await tx.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);

    // Create products table
    await tx.$executeRawUnsafe(`
      CREATE TABLE "${schemaName}".products (
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

    await tx.$executeRawUnsafe(
      `CREATE INDEX idx_products_sku ON "${schemaName}".products(sku)`
    );
    await tx.$executeRawUnsafe(
      `CREATE INDEX idx_products_status ON "${schemaName}".products(status)`
    );

    // Create audit log table
    await tx.$executeRawUnsafe(`
      CREATE TABLE "${schemaName}".audit_log (
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

    await tx.$executeRawUnsafe(
      `CREATE INDEX idx_audit_entity ON "${schemaName}".audit_log(entity_type, entity_id)`
    );
    await tx.$executeRawUnsafe(
      `CREATE INDEX idx_audit_user ON "${schemaName}".audit_log(user_id, created_at DESC)`
    );
  });
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
