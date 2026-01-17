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

// Initialize client synchronously for backwards compatibility
// IAM auth will be set up on first use if enabled
let prismaInstance: PrismaClient;

if (globalForPrisma.prisma) {
  prismaInstance = globalForPrisma.prisma;
} else {
  // For IAM auth, we need async initialization
  // Create a placeholder that will be replaced
  prismaInstance = new PrismaClient({
    log: process.env['NODE_ENV'] === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

  if (process.env['NODE_ENV'] !== 'production') {
    globalForPrisma.prisma = prismaInstance;
  }
}

export const prisma = prismaInstance;
export { prisma as db };

/**
 * Initializes the database connection with IAM auth if enabled.
 * Call this at application startup before using the database.
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
  if (globalForPrisma.prismaInitialized) {
    return globalForPrisma.prisma!;
  }

  if (isIamAuthEnabled()) {
    const client = await createPrismaClient();
    globalForPrisma.prisma = client;
    globalForPrisma.prismaInitialized = true;

    // Replace the exported instance
    Object.assign(prismaInstance, client);

    console.log('Database initialized with IAM authentication');
    return client;
  }

  globalForPrisma.prismaInitialized = true;
  console.log('Database initialized with standard authentication');
  return prismaInstance;
}
