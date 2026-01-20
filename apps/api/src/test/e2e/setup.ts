/**
 * E2E Test Setup - Clerk Authentication & API Client
 *
 * This module handles authentication with Clerk and provides
 * a configured API client for E2E tests against staging.
 */

import { createClerkClient } from '@clerk/backend';

// Configuration from environment
const CLERK_SECRET_KEY = process.env['CLERK_SECRET_KEY'];
const API_BASE_URL = process.env['API_BASE_URL'] || 'https://api-staging.eurocomply.eu';
const E2E_TEST_EMAIL = process.env['E2E_TEST_EMAIL'] || 'e2e-test@eurocomply.eu';
const E2E_TEST_PASSWORD = process.env['E2E_TEST_PASSWORD'] || 'E2ETest123!@#';

if (!CLERK_SECRET_KEY) {
  throw new Error('CLERK_SECRET_KEY is required for E2E tests');
}

// Initialize Clerk client
const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY });

/**
 * Test context containing auth token and API helpers
 */
export interface E2EContext {
  token: string;
  userId: string;
  apiUrl: string;
  organizationId?: string;
}

let currentContext: E2EContext | null = null;

/**
 * API request helper with authentication
 */
export async function apiRequest(
  method: string,
  path: string,
  options: {
    body?: unknown;
    organizationId?: string;
    token?: string;
  } = {}
): Promise<Response> {
  const ctx = currentContext;
  if (!ctx && !options.token) {
    throw new Error('E2E context not initialized. Call setupE2E() first.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${options.token || ctx!.token}`,
  };

  const orgId = options.organizationId || ctx?.organizationId;
  if (orgId) {
    headers['X-Organization-ID'] = orgId;
  }

  const url = `${API_BASE_URL}${path}`;

  const response = await fetch(url, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  return response;
}

/**
 * Convenience methods for API requests
 */
export const api = {
  get: (path: string, options?: { organizationId?: string }) =>
    apiRequest('GET', path, options),

  post: (path: string, body?: unknown, options?: { organizationId?: string }) =>
    apiRequest('POST', path, { body, ...options }),

  put: (path: string, body?: unknown, options?: { organizationId?: string }) =>
    apiRequest('PUT', path, { body, ...options }),

  patch: (path: string, body?: unknown, options?: { organizationId?: string }) =>
    apiRequest('PATCH', path, { body, ...options }),

  delete: (path: string, options?: { organizationId?: string }) =>
    apiRequest('DELETE', path, options),
};

/**
 * Get or create the E2E test user in Clerk
 */
async function getOrCreateTestUser(): Promise<{ id: string; email: string }> {
  // Try to find existing user
  const users = await clerk.users.getUserList({
    emailAddress: [E2E_TEST_EMAIL],
  });

  if (users.data.length > 0) {
    const user = users.data[0]!;
    console.log(`[E2E] Found existing test user: ${user.id}`);
    return { id: user.id, email: E2E_TEST_EMAIL };
  }

  // Create new test user
  console.log(`[E2E] Creating test user: ${E2E_TEST_EMAIL}`);
  const user = await clerk.users.createUser({
    emailAddress: [E2E_TEST_EMAIL],
    password: E2E_TEST_PASSWORD,
    firstName: 'E2E',
    lastName: 'Test User',
  });

  return { id: user.id, email: E2E_TEST_EMAIL };
}

/**
 * Get a session token for the test user.
 * Note: This function is preserved for future use when Clerk testing tokens
 * become available, but currently throws as session creation requires frontend flow.
 * @internal Reserved for future Clerk testing tokens integration
 */
async function _getTestUserToken(userId: string): Promise<string> {
  // Create a session token using Clerk's Backend API
  // Note: This creates a JWT that can be used for API authentication
  const sessions = await clerk.sessions.getSessionList({ userId });

  // If there's an active session, get its token
  if (sessions.data.length > 0) {
    const session = sessions.data[0]!;
    const token = await clerk.sessions.getToken(session.id, 'e2e-test');
    if (token.jwt) {
      return token.jwt;
    }
  }

  // Create a new sign-in token that can be exchanged for a session
  // For E2E tests, we'll use a workaround: create a signed JWT directly
  // This requires the Clerk secret key to sign tokens

  // Alternative: Use Clerk's testing tokens feature
  // For now, we'll create a user token using the sessions API
  const _signInToken = await clerk.signInTokens.createSignInToken({
    userId,
    expiresInSeconds: 3600, // 1 hour
  });

  // The sign-in token needs to be exchanged for a session
  // In E2E tests, we can use a different approach: direct JWT creation
  // Let's use the Clerk Backend SDK to get a proper token

  // Create a session for the user
  // Note: This is a workaround for E2E testing
  throw new Error(
    'Session token creation requires frontend flow. ' +
    'Consider using Clerk Testing Tokens or a pre-authenticated test user.'
  );
}

/**
 * Initialize E2E test context
 *
 * This sets up the test user and authentication for E2E tests.
 */
export async function setupE2E(): Promise<E2EContext> {
  console.log('[E2E] Setting up test context...');
  console.log(`[E2E] API URL: ${API_BASE_URL}`);

  const user = await getOrCreateTestUser();

  // For E2E testing, we need a valid JWT token
  // Clerk's Backend API doesn't directly issue JWT tokens for users
  // We need to either:
  // 1. Use Clerk's Testing Tokens (recommended)
  // 2. Have a pre-authenticated session
  // 3. Use a service account pattern

  // For now, we'll check if a token is provided via environment
  const providedToken = process.env['E2E_TEST_TOKEN'];
  if (!providedToken) {
    throw new Error(
      'E2E_TEST_TOKEN environment variable is required. ' +
      'Generate a test token from Clerk dashboard or use Testing Tokens feature.'
    );
  }

  currentContext = {
    token: providedToken,
    userId: user.id,
    apiUrl: API_BASE_URL,
  };

  console.log(`[E2E] Context initialized for user: ${user.id}`);
  return currentContext;
}

/**
 * Clean up E2E test context
 */
export async function teardownE2E(): Promise<void> {
  console.log('[E2E] Cleaning up test context...');

  // Clean up any test data created during tests
  // This would include deleting test organizations, products, etc.

  currentContext = null;
}

/**
 * Set the current organization for API requests
 */
export function setOrganization(organizationId: string): void {
  if (!currentContext) {
    throw new Error('E2E context not initialized');
  }
  currentContext.organizationId = organizationId;
}

/**
 * Get current E2E context
 */
export function getContext(): E2EContext {
  if (!currentContext) {
    throw new Error('E2E context not initialized');
  }
  return currentContext;
}

/**
 * Health check to verify API is reachable
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health/ready`);
    const data = await response.json();
    return data.status === 'ok';
  } catch (error) {
    console.error('[E2E] Health check failed:', error);
    return false;
  }
}
