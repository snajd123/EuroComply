import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import config from './mikro-orm.config.js';

let orm: MikroORM | null = null;

export interface InitOrmOptions {
  /** Additional entities to register with the ORM (e.g., GSR entities) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  additionalEntities?: any[];
}

export async function initOrm(options?: InitOrmOptions): Promise<MikroORM> {
  if (orm) {
    return orm;
  }

  const mergedConfig = options?.additionalEntities
    ? {
        ...config,
        entities: [...(config.entities ?? []), ...options.additionalEntities],
      }
    : config;

  orm = await MikroORM.init(mergedConfig);
  return orm;
}

export async function getOrm(): Promise<MikroORM> {
  if (!orm) {
    throw new Error('ORM not initialized. Call initOrm() first.');
  }
  return orm;
}

export async function closeOrm(): Promise<void> {
  if (orm) {
    await orm.close();
    orm = null;
  }
}

/**
 * Creates a tenant-scoped EntityManager.
 * This is the core multi-tenancy mechanism.
 */
export function createTenantEm(em: EntityManager, schemaName: string): EntityManager {
  return em.fork({ schema: schemaName });
}
