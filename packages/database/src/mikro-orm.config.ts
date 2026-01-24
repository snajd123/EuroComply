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
 * Configuration for the API server.
 * Includes all entities so it can work with both public and tenant schemas.
 */
export default defineConfig({
  ...baseConfig,
  entities: allEntities,
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
 * Configuration for TENANT schema operations.
 * Contains tenant-specific entities: Product, Category, etc.
 * Used by TenantProvisioner to create tenant schemas.
 */
export const tenantConfig: Options = defineConfig({
  ...baseConfig,
  entities: tenantEntities,
  schema: 'public', // Default, but will be switched during provisioning
});
