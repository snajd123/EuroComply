import { PrismaClient } from '@prisma/client';
import { isIamAuthEnabled, buildIamDatabaseUrl } from './iam-auth.js';

export * from '@prisma/client';
export * from './tenant.js';
export * from './client.js';
export * from './events.js';
export * from './validation.js';
export * from './iam-auth.js';

// MikroORM entities - exported under MikroOrm namespace to avoid Prisma conflicts
export * as MikroOrm from './entities/index.js';

// Re-export Organization specifically for tenant middleware (distinct from Prisma's Organization type)
export { Organization } from './entities/Organization.js';

// =============================================================================
// Debug Logging
// =============================================================================

const DEBUG = process.env['DEBUG'] === 'true' || process.env['NODE_ENV'] === 'development';

/**
 * Log a debug message. Only outputs in development or when DEBUG=true.
 */
function debugLog(message: string): void {
  if (DEBUG) {
    console.log(message);
  }
}

// Singleton pattern for Prisma client
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaInitialized: boolean | undefined;
  tokenRefreshInterval: NodeJS.Timeout | undefined;
};

// IAM token refresh interval (10 minutes - token valid for 15)
const TOKEN_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Builds database URL from individual components if DATABASE_URL is not set.
 * For password authentication (used by migrations and development).
 */
function buildPasswordDatabaseUrl(): string {
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
 * Builds database URL with appropriate authentication method.
 * - If DB_IAM_AUTH=true: Uses IAM token authentication (for eurocomply_app)
 * - Otherwise: Uses password authentication (for migrations or development)
 */
async function buildDatabaseUrl(): Promise<string> {
  if (isIamAuthEnabled()) {
    debugLog('[DB] Using IAM token authentication');
    return buildIamDatabaseUrl();
  }

  debugLog('[DB] Using password authentication');
  return buildPasswordDatabaseUrl();
}

/**
 * Creates a Prisma client with appropriate configuration.
 */
async function createPrismaClient(): Promise<PrismaClient> {
  const logLevel = process.env['NODE_ENV'] === 'development' ? ['query', 'error', 'warn'] : ['error'];

  const databaseUrl = await buildDatabaseUrl();
  const authMethod = isIamAuthEnabled() ? 'IAM token' : 'password';
  debugLog(`[DB] Initializing Prisma client (host: ${process.env['DB_HOST'] || 'from DATABASE_URL'}, auth: ${authMethod})`);

  return new PrismaClient({
    log: logLevel as ('query' | 'error' | 'warn' | 'info')[],
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
}

/**
 * Reconnects Prisma with a fresh IAM token.
 * Called periodically to refresh the token before expiration.
 */
async function reconnectWithNewToken(): Promise<void> {
  if (!globalForPrisma.prisma || !isIamAuthEnabled()) {
    return;
  }

  debugLog('[DB] Refreshing IAM token and reconnecting...');

  try {
    // Disconnect existing client
    await globalForPrisma.prisma.$disconnect();

    // Create new client with fresh token
    const newClient = await createPrismaClient();
    globalForPrisma.prisma = newClient;

    debugLog('[DB] Successfully reconnected with new IAM token');
  } catch (error) {
    console.error('[DB] Failed to reconnect with new token:', error);
    // Don't throw - the next request will fail and can be retried
  }
}

/**
 * Starts the IAM token refresh timer.
 * Automatically reconnects before the token expires.
 */
function startTokenRefresh(): void {
  if (!isIamAuthEnabled() || globalForPrisma.tokenRefreshInterval) {
    return;
  }

  debugLog(`[DB] Starting IAM token refresh timer (interval: ${TOKEN_REFRESH_INTERVAL_MS}ms)`);

  globalForPrisma.tokenRefreshInterval = setInterval(async () => {
    try {
      await reconnectWithNewToken();
    } catch (error) {
      console.error('[DB] Token refresh failed:', error);
    }
  }, TOKEN_REFRESH_INTERVAL_MS);

  // Don't block process exit
  globalForPrisma.tokenRefreshInterval.unref();
}

/**
 * Stops the IAM token refresh timer.
 */
function stopTokenRefresh(): void {
  if (globalForPrisma.tokenRefreshInterval) {
    clearInterval(globalForPrisma.tokenRefreshInterval);
    globalForPrisma.tokenRefreshInterval = undefined;
    debugLog('[DB] Stopped IAM token refresh timer');
  }
}

/**
 * Initializes the database connection.
 * Call this at application startup before using the database.
 * MUST be called before any database operations.
 *
 * For IAM authentication (eurocomply_app user):
 * - Set DB_IAM_AUTH=true
 * - Set DB_HOST, DB_PORT, DB_USER, DB_NAME, AWS_REGION
 * - Do NOT set DB_PASSWORD (IAM tokens are generated automatically)
 *
 * For password authentication (eurocomply_migrate user or development):
 * - Set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 * - Or set DATABASE_URL directly
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

  // Start token refresh for IAM auth
  startTokenRefresh();

  const authMethod = isIamAuthEnabled() ? 'IAM token' : 'password';
  debugLog(`[DB] Database initialized (auth: ${authMethod})`);
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
 * Gracefully shuts down the database connection.
 * Call this during application shutdown to cleanly close connections.
 *
 * @example
 * ```typescript
 * import { shutdownDatabase } from '@eurocomply/db';
 *
 * // In your shutdown handler:
 * process.on('SIGTERM', async () => {
 *   await shutdownDatabase();
 *   process.exit(0);
 * });
 * ```
 */
export async function shutdownDatabase(): Promise<void> {
  // Stop token refresh first
  stopTokenRefresh();

  if (globalForPrisma.prisma) {
    debugLog('[DB] Shutting down database connection...');
    await globalForPrisma.prisma.$disconnect();
    globalForPrisma.prisma = undefined;
    globalForPrisma.prismaInitialized = false;
    debugLog('[DB] Database connection closed');
  }
}

/**
 * Lazily creates a default Prisma client.
 * This is used when code accesses prisma before initializeDatabase() is called.
 * Note: This uses synchronous password auth - for IAM auth, call initializeDatabase() first.
 */
function getOrCreateDefaultClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    // Warn if IAM auth is enabled but client accessed before initialization
    if (isIamAuthEnabled()) {
      console.warn(
        '[DB] Warning: Accessing database before initializeDatabase() with IAM auth enabled. ' +
        'This will use password auth fallback. Call initializeDatabase() at startup for IAM auth.'
      );
    }

    // Create default client for backwards compatibility (password auth only)
    try {
      const url = buildPasswordDatabaseUrl();
      globalForPrisma.prisma = new PrismaClient({
        log: process.env['NODE_ENV'] === 'development' ? ['query', 'error', 'warn'] : ['error'],
        datasources: {
          db: { url },
        },
      });
    } catch (error) {
      // Log the error and fallback to default DATABASE_URL
      if (DEBUG) {
        console.warn('[DB] Failed to build database URL, using default:', error);
      }
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
 *
 * Note: For IAM token authentication, call initializeDatabase() at startup.
 * The lazy proxy uses password authentication for backwards compatibility.
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
