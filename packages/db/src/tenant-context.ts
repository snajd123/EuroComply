import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Validates a schema name to prevent SQL injection and ensure format.
 * Schema names must be: tenant_{slug} where slug is 3+ lowercase alphanumeric/underscore chars.
 */
export function validateSchemaName(schemaName: string): boolean {
  // Must start with tenant_ prefix
  if (!schemaName.startsWith('tenant_')) {
    return false;
  }

  // Reserved names
  if (['public', 'pg_catalog', 'information_schema'].includes(schemaName)) {
    return false;
  }

  // Extract slug and validate
  const slug = schemaName.slice(7); // Remove 'tenant_'
  if (slug.length < 3) {
    return false;
  }

  // Only lowercase alphanumeric and underscore
  const validPattern = /^[a-z0-9_]+$/;
  return validPattern.test(slug);
}

/**
 * Formats an organization slug into a valid schema name.
 */
export function formatSchemaName(orgSlug: string): string {
  const normalized = orgSlug
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  return `tenant_${normalized}`;
}

/**
 * Creates an EntityManager scoped to a specific tenant schema.
 */
export function createTenantEm(orm: MikroORM, schemaName: string): EntityManager {
  if (!validateSchemaName(schemaName)) {
    throw new Error(`Invalid schema name: ${schemaName}`);
  }
  return orm.em.fork({ schema: schemaName });
}

/**
 * Executes a callback with a tenant-scoped EntityManager.
 * Automatically clears the EntityManager after execution.
 */
export async function withTenantContext<T>(
  orm: MikroORM,
  schemaName: string,
  callback: (em: EntityManager) => Promise<T>
): Promise<T> {
  const em = createTenantEm(orm, schemaName);
  try {
    return await callback(em);
  } finally {
    em.clear();
  }
}

/**
 * Creates a new tenant schema with all required tables.
 */
export async function createTenantSchema(
  orm: MikroORM,
  schemaName: string
): Promise<void> {
  if (!validateSchemaName(schemaName)) {
    throw new Error(`Invalid schema name: ${schemaName}`);
  }

  // Schema DDL will be loaded from tenant-schema.sql
  const ddl = getTenantSchemaDDL(schemaName);
  await orm.em.execute(ddl);
}

/**
 * Drops a tenant schema. Use with extreme caution!
 */
export async function dropTenantSchema(
  orm: MikroORM,
  schemaName: string
): Promise<void> {
  if (!validateSchemaName(schemaName)) {
    throw new Error(`Invalid schema name: ${schemaName}`);
  }
  await orm.em.execute(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
}

/**
 * Returns the DDL for creating a tenant schema.
 */
export function getTenantSchemaDDL(schemaName: string): string {
  if (!validateSchemaName(schemaName)) {
    throw new Error(`Invalid schema name: ${schemaName}`);
  }

  const ddlPath = join(__dirname, 'tenant-schema.sql');
  const ddlTemplate = readFileSync(ddlPath, 'utf-8');

  // Replace all ${schemaName} placeholders
  return ddlTemplate.replace(/\$\{schemaName\}/g, schemaName);
}
