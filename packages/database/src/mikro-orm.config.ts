import { defineConfig, type Options } from '@mikro-orm/postgresql';
import { publicEntities, tenantEntities } from './entities/index.js';

/**
 * Base configuration shared between public and tenant configs.
 */
const baseConfig = {
  dbName: process.env['DATABASE_NAME'] ?? 'eurocomply',
  host: process.env['DATABASE_HOST'] ?? 'localhost',
  port: parseInt(process.env['DATABASE_PORT'] ?? '5432', 10),
  user: process.env['DATABASE_USER'] ?? 'eurocomply',
  password: process.env['DATABASE_PASSWORD'] ?? 'eurocomply',
  debug: process.env['NODE_ENV'] !== 'production',
};

/**
 * All entities - the ORM needs to know about all entities regardless of schema.
 * The schema is determined at runtime when forking the EntityManager.
 */
const allEntities = [...publicEntities, ...tenantEntities];

/**
 * Configuration for the API server and migrations.
 *
 * IMPORTANT: Only PUBLIC schema entities are included here.
 * Tenant entities (User, OrganizationUser, Product, etc.) are created
 * by TenantProvisioner in each tenant schema - NOT in public.
 *
 * The API uses `allEntities` at runtime to understand all entity types,
 * but schema generation ONLY creates public tables.
 */
export default defineConfig({
  ...baseConfig,
  entities: allEntities,  // Runtime: knows all entities for type safety
  schema: 'public',
  migrations: {
    path: './src/migrations',
    pathTs: './src/migrations',
    glob: '!(*.d).{js,ts}',
    transactional: true,
    allOrNothing: true,
  },
});

/**
 * Configuration for PUBLIC schema migrations only.
 * Used by schema generator to create/update ONLY public schema tables.
 */
export const publicConfig: Options = defineConfig({
  ...baseConfig,
  entities: publicEntities,  // Only public entities for schema generation
  schema: 'public',
});

/**
 * Configuration for TENANT schema operations.
 * Contains tenant-specific entities: Product, Category, etc.
 * Used by TenantProvisioner to create tenant schemas.
 */
export const tenantConfig: Options = defineConfig({
  ...baseConfig,
  entities: tenantEntities,
  schema: 'public', // Default, but will be switched during provisioning
});
