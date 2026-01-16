import { Hono } from 'hono';
import type { AppVariables } from '../types/context.js';

/**
 * Creates a mock authenticated context for testing.
 */
export function mockAuthContext(overrides?: Partial<AppVariables>): AppVariables {
  return {
    user: {
      id: 'user_test123',
      clerkId: 'clerk_test123',
      email: 'test@example.com',
      name: 'Test User',
    },
    tenant: {
      organizationId: 'org_test123',
      schemaName: 'tenant_test',
      name: 'Test Organization',
      subscriptionTier: 'starter',
    },
    permissions: {
      role: 'owner',
      designAuthority: 'MANAGER',
      operationsAuthority: 'MANAGER',
      marketingAuthority: 'MANAGER',
      complianceAuthority: 'MANAGER',
    },
    db: {} as AppVariables['db'], // Mock DB client
    ...overrides,
  };
}

/**
 * Creates a test app instance with optional middleware bypass.
 */
export function createTestApp(options?: { skipAuth?: boolean }) {
  const app = new Hono<{ Variables: AppVariables }>();

  if (options?.skipAuth) {
    // Inject mock auth context
    app.use('*', async (c, next) => {
      const ctx = mockAuthContext();
      c.set('user', ctx.user);
      c.set('tenant', ctx.tenant);
      c.set('permissions', ctx.permissions);
      await next();
    });
  }

  return app;
}

/**
 * Helper to make test requests.
 */
export async function testRequest(
  app: Hono,
  method: string,
  path: string,
  options?: {
    body?: unknown;
    headers?: Record<string, string>;
  }
) {
  const requestInit: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  };

  if (options?.body) {
    requestInit.body = JSON.stringify(options.body);
  }

  const response = await app.request(path, requestInit);
  const json = await response.json();

  return { response, json };
}
