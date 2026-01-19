import { PrismaClient, Prisma } from '@prisma/client';
import { validateSchemaName } from './validation.js';

// =============================================================================
// Constants
// =============================================================================

/** Maximum number of tenant clients to cache */
const MAX_CACHE_SIZE = 1000;

/** Percentage of cache to evict when at capacity (10%) */
const EVICTION_PERCENTAGE = 0.1;

export interface TenantContext {
  organizationId: string;
  schemaName: string;
  userId: string;
}

/**
 * Creates a Prisma client configured for a specific tenant schema.
 * Uses Prisma's $extends to inject schema context.
 *
 * @throws Error if schema name fails validation (SQL injection prevention)
 */
export function createTenantClient(
  baseClient: PrismaClient,
  context: TenantContext
) {
  // Validate schema name to prevent SQL injection
  validateSchemaName(context.schemaName);

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
 * Cached client entry with access time tracking for LRU eviction.
 */
interface CachedClient {
  client: TenantPrismaClient;
  lastAccess: number;
}

/**
 * Connection pool manager for tenant connections.
 * Caches extended clients per organization to avoid recreation overhead.
 * Uses LRU (Least Recently Used) eviction when cache is full.
 */
class TenantConnectionManager {
  private clients: Map<string, CachedClient> = new Map();
  private baseClient: PrismaClient;

  constructor(baseClient: PrismaClient) {
    this.baseClient = baseClient;
  }

  /**
   * Get or create a tenant client for the given context.
   * Updates last access time for LRU tracking.
   */
  getClient(context: TenantContext): TenantPrismaClient {
    const cacheKey = `${context.organizationId}:${context.userId}`;

    const existing = this.clients.get(cacheKey);
    if (existing) {
      // Update last access time for LRU tracking
      existing.lastAccess = Date.now();
      return existing.client;
    }

    // Evict oldest entries if at capacity
    if (this.clients.size >= MAX_CACHE_SIZE) {
      this.evictOldest(Math.floor(MAX_CACHE_SIZE * EVICTION_PERCENTAGE));
    }

    const client = createTenantClient(this.baseClient, context);
    this.clients.set(cacheKey, {
      client,
      lastAccess: Date.now(),
    });

    return client;
  }

  /**
   * Evict the oldest (least recently used) entries from the cache.
   */
  private evictOldest(count: number): void {
    const entries = Array.from(this.clients.entries())
      .sort((a, b) => a[1].lastAccess - b[1].lastAccess);

    for (let i = 0; i < count && i < entries.length; i++) {
      const entry = entries[i];
      if (entry) {
        this.clients.delete(entry[0]);
      }
    }
  }

  /**
   * Clear all cached clients.
   */
  clearCache(): void {
    this.clients.clear();
  }

  /**
   * Get the current cache size (for monitoring).
   */
  getCacheSize(): number {
    return this.clients.size;
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
