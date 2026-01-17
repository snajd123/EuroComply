import { PrismaClient } from '@prisma/client';
import { isIamAuthEnabled, buildIamDatabaseUrl } from './iam-auth.js';

export * from '@prisma/client';
export * from './tenant.js';
export * from './client.js';
export * from './events.js';
export * from './iam-auth.js';

// Singleton pattern for Prisma client
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaInitialized: boolean | undefined;
};

/**
 * Creates a Prisma client with appropriate configuration.
 * Uses IAM authentication when DB_IAM_AUTH=true.
 */
async function createPrismaClient(): Promise<PrismaClient> {
  const logLevel = process.env['NODE_ENV'] === 'development' ? ['query', 'error', 'warn'] : ['error'];

  if (isIamAuthEnabled()) {
    console.log('Initializing Prisma with RDS IAM authentication...');
    const databaseUrl = await buildIamDatabaseUrl();

    return new PrismaClient({
      log: logLevel as any,
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
  }

  // Standard connection using DATABASE_URL
  return new PrismaClient({
    log: logLevel as any,
  });
}

/**
 * Initializes the database connection with IAM auth if enabled.
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

  if (isIamAuthEnabled()) {
    console.log('Database initialized with IAM authentication');
  } else {
    console.log('Database initialized with standard authentication');
  }

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
 * Prisma client getter - use this for database operations.
 * For backwards compatibility, returns a proxy that lazily gets the client.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = globalForPrisma.prisma;
    if (!client) {
      throw new Error(
        'Database not initialized. Call initializeDatabase() at application startup before using the database.'
      );
    }
    const value = client[prop as keyof PrismaClient];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});

export { prisma as db };
