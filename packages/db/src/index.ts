import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';
export * from './tenant.js';
export * from './client.js';
export * from './events.js';

// Singleton pattern for Prisma client
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaInitialized: boolean | undefined;
};

/**
 * Builds database URL from individual components if DATABASE_URL is not set.
 */
function buildDatabaseUrl(): string {
  // If DATABASE_URL is set, use it directly
  if (process.env['DATABASE_URL']) {
    return process.env['DATABASE_URL'];
  }

  // Build from components (for ECS with Secrets Manager)
  const host = process.env['DB_HOST'];
  const port = process.env['DB_PORT'] || '5432';
  const name = process.env['DB_NAME'] || 'eurocomply';
  const user = process.env['DB_USER'];
  const password = process.env['DB_PASSWORD'];
  const ssl = process.env['DB_SSL'] === 'true' ? '?sslmode=require' : '';

  if (!host || !user || !password) {
    throw new Error('Missing required database environment variables: DB_HOST, DB_USER, DB_PASSWORD');
  }

  return `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${name}${ssl}`;
}

/**
 * Creates a Prisma client with appropriate configuration.
 */
async function createPrismaClient(): Promise<PrismaClient> {
  const logLevel = process.env['NODE_ENV'] === 'development' ? ['query', 'error', 'warn'] : ['error'];

  const databaseUrl = buildDatabaseUrl();
  console.log(`Initializing Prisma client (host: ${process.env['DB_HOST'] || 'from DATABASE_URL'})`);

  return new PrismaClient({
    log: logLevel as any,
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
}

/**
 * Initializes the database connection.
 * Call this at application startup before using the database.
 * MUST be called before any database operations.
 *
 * @example
 * ```typescript
 * import { initializeDatabase } from '@eurocomply/db';
 *
 * // In your app startup:
 * await initializeDatabase();
 * ```
 */
export async function initializeDatabase(): Promise<PrismaClient> {
  if (globalForPrisma.prismaInitialized && globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const client = await createPrismaClient();
  globalForPrisma.prisma = client;
  globalForPrisma.prismaInitialized = true;

  console.log('Database initialized');
  return client;
}

/**
 * Gets the Prisma client singleton.
 * Throws if initializeDatabase() hasn't been called.
 */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    throw new Error(
      'Database not initialized. Call initializeDatabase() at application startup before using the database.'
    );
  }
  return globalForPrisma.prisma;
}

/**
 * Lazily creates a default Prisma client.
 * This is used when code accesses prisma before initializeDatabase() is called.
 */
function getOrCreateDefaultClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    // Create default client for backwards compatibility
    try {
      const url = buildDatabaseUrl();
      globalForPrisma.prisma = new PrismaClient({
        log: process.env['NODE_ENV'] === 'development' ? ['query', 'error', 'warn'] : ['error'],
        datasources: {
          db: { url },
        },
      });
    } catch {
      // Fallback to default DATABASE_URL
      globalForPrisma.prisma = new PrismaClient({
        log: process.env['NODE_ENV'] === 'development' ? ['query', 'error', 'warn'] : ['error'],
      });
    }
  }
  return globalForPrisma.prisma;
}

/**
 * Prisma client getter - use this for database operations.
 * For backwards compatibility, returns a proxy that lazily gets/creates the client.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getOrCreateDefaultClient();
    const value = client[prop as keyof PrismaClient];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});

export { prisma as db };
