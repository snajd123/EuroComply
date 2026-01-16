import { PrismaClient, Prisma } from '@prisma/client';

export interface TenantContext {
  organizationId: string;
  schemaName: string;
  userId: string;
}

/**
 * Creates a Prisma client configured for a specific tenant schema.
 * Uses Prisma's $extends to inject schema context.
 */
export function createTenantClient(
  baseClient: PrismaClient,
  context: TenantContext
) {
  return baseClient.$extends({
    query: {
      $allOperations({ operation, model, args, query }) {
        // For raw queries, we need to handle schema manually
        // For model queries, Prisma handles it
        return query(args);
      },
    },
    client: {
      $tenant: context,

      /**
       * Execute a raw query in the tenant's schema
       */
      async $queryTenant<T>(sql: string, params: unknown[] = []): Promise<T> {
        const schemaQuery = `SET search_path TO "${context.schemaName}", public; ${sql}`;
        return baseClient.$queryRawUnsafe(schemaQuery, ...params) as Promise<T>;
      },

      /**
       * Execute a raw command in the tenant's schema
       */
      async $executeTenant(sql: string, params: unknown[] = []): Promise<number> {
        const schemaQuery = `SET search_path TO "${context.schemaName}", public; ${sql}`;
        return baseClient.$executeRawUnsafe(schemaQuery, ...params);
      },
    },
  });
}

export type TenantPrismaClient = ReturnType<typeof createTenantClient>;

/**
 * Connection pool manager for tenant connections.
 * Caches extended clients per organization to avoid recreation overhead.
 */
class TenantConnectionManager {
  private clients: Map<string, TenantPrismaClient> = new Map();
  private baseClient: PrismaClient;

  constructor(baseClient: PrismaClient) {
    this.baseClient = baseClient;
  }

  getClient(context: TenantContext): TenantPrismaClient {
    const cacheKey = `${context.organizationId}:${context.userId}`;

    let client = this.clients.get(cacheKey);
    if (!client) {
      client = createTenantClient(this.baseClient, context);
      this.clients.set(cacheKey, client);

      // Limit cache size (LRU-style cleanup)
      if (this.clients.size > 1000) {
        const firstKey = this.clients.keys().next().value;
        if (firstKey) this.clients.delete(firstKey);
      }
    }

    return client;
  }

  clearCache(): void {
    this.clients.clear();
  }
}

// Singleton manager instance
let manager: TenantConnectionManager | null = null;

export function getTenantConnectionManager(baseClient: PrismaClient): TenantConnectionManager {
  if (!manager) {
    manager = new TenantConnectionManager(baseClient);
  }
  return manager;
}
