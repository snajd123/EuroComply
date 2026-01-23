export * from './entities/index.js';
export * from './utils/index.js';
export * from './seeds/index.js';
export { initOrm, getOrm, closeOrm, createTenantEm } from './orm.js';
export { default as mikroOrmConfig, tenantConfig } from './mikro-orm.config.js';
export { ParallelMigrator, type ParallelMigratorOptions, type MigrationResults } from './migrations/parallel-migrator.js';
export {
  TenantProvisioner,
  type ProvisioningResult,
  ApiKeyService,
  generateRawApiKey,
  hashApiKey,
  extractKeyPrefix,
  type CreateApiKeyResult,
  type ValidateApiKeyResult,
  UnitConversionService,
  ConversionError,
  type UnitLookup,
  type UnitInfo,
  type ConversionResult,
} from './services/index.js';

// Re-export common MikroORM types for convenience
export type { EntityManager, MikroORM } from '@mikro-orm/postgresql';
