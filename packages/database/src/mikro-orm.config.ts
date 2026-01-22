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
 * Configuration for PUBLIC schema operations.
 * Contains only shared entities: Organization, OutboxEvent
 */
export default defineConfig({
  ...baseConfig,
  entities: publicEntities,
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
