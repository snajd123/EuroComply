import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { Hono } from 'hono';
import type { AppVariables } from '../types/context.js';

// Mock modules before importing the middleware
vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(),
}));

vi.mock('@eurocomply/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    organizationUser: {
      findUnique: vi.fn(),
    },
  },
  getTenantConnectionManager: vi.fn(() => ({
    getClient: vi.fn(() => ({})),
  })),
}));

vi.mock('../lib/validators.js', () => ({
  isValidOrgId: vi.fn(),
}));

import { verifyToken } from '@clerk/backend';
import { prisma } from '@eurocomply/db';
import { isValidOrgId } from '../lib/validators.js';

const mockVerifyToken = verifyToken as Mock;
const mockPrisma = prisma as unknown as {
  user: { findUnique: Mock; update: Mock };
  organizationUser: { findUnique: Mock };
};
const mockIsValidOrgId = isValidOrgId as Mock;

describe('auth middleware', () => {
  let app: Hono<{ Variables: AppVariables }>;
  const originalEnv = process.env;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset environment
    process.env = { ...originalEnv };
    process.env['CLERK_SECRET_KEY'] = 'sk_test_123';
    process.env['NODE_ENV'] = 'test';
    process.env['ENABLE_TEST_AUTH_BYPASS'] = 'false';

    // Reset module cache to pick up new env
    vi.resetModules();

    // Default mocks
    mockIsValidOrgId.mockReturnValue(true);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('authMiddleware', () => {
    beforeEach(async () => {
      // Import fresh middleware after env setup
      const { authMiddleware } = await import('./auth.js');

      app = new Hono<{ Variables: AppVariables }>();
      app.use('/protected/*', authMiddleware);
      app.get('/protected/test', (c) => {
        const user = c.get('user');
        const tenant = c.get('tenant');
        return c.json({ user, tenant });
      });
    });

    it('should return 401 when no authorization header', async () => {
      const res = await app.request('/protected/test');

      expect(res.status).toBe(401);
    });

    it('should return 401 when authorization header is not Bearer', async () => {
      const res = await app.request('/protected/test', {
        headers: { Authorization: 'Basic abc123' },
      });

      expect(res.status).toBe(401);
    });

    it('should return 400 when no organization ID provided', async () => {
      const res = await app.request('/protected/test', {
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 when organization ID format is invalid', async () => {
      mockIsValidOrgId.mockReturnValue(false);

      const res = await app.request('/protected/test', {
        headers: {
          Authorization: 'Bearer valid_token',
          'X-Organization-ID': 'invalid-format',
        },
      });

      expect(res.status).toBe(400);
    });

    it('should return 401 when token verification fails', async () => {
      mockVerifyToken.mockRejectedValue(new Error('Invalid token'));

      const res = await app.request('/protected/test', {
        headers: {
          Authorization: 'Bearer invalid_token',
          'X-Organization-ID': 'org_test123456789',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should return 401 when token has no subject', async () => {
      mockVerifyToken.mockResolvedValue({ sub: null });

      const res = await app.request('/protected/test', {
        headers: {
          Authorization: 'Bearer token_no_sub',
          'X-Organization-ID': 'org_test123456789',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should return 401 when user not found in database', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'clerk_user_123' });
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const res = await app.request('/protected/test', {
        headers: {
          Authorization: 'Bearer valid_token',
          'X-Organization-ID': 'org_test123456789',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should return 403 when user is not a member of organization', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'clerk_user_123' });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'db_user_1',
        clerkId: 'clerk_user_123',
        email: 'test@example.com',
        name: 'Test User',
      });
      mockPrisma.organizationUser.findUnique.mockResolvedValue(null);

      const res = await app.request('/protected/test', {
        headers: {
          Authorization: 'Bearer valid_token',
          'X-Organization-ID': 'org_test123456789',
        },
      });

      expect(res.status).toBe(403);
    });

    it('should successfully authenticate and set context', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'clerk_user_123' });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'db_user_1',
        clerkId: 'clerk_user_123',
        email: 'test@example.com',
        name: 'Test User',
      });
      mockPrisma.organizationUser.findUnique.mockResolvedValue({
        role: 'admin',
        designAuthority: 'editor',
        operationsAuthority: 'viewer',
        marketingAuthority: 'none',
        complianceAuthority: 'admin',
        organization: {
          id: 'org_test123456789',
          schemaName: 'org_test',
          name: 'Test Organization',
          subscriptionTier: 'professional',
        },
      });
      mockPrisma.user.update.mockResolvedValue({});

      const res = await app.request('/protected/test', {
        headers: {
          Authorization: 'Bearer valid_token',
          'X-Organization-ID': 'org_test123456789',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user).toEqual({
        id: 'db_user_1',
        clerkId: 'clerk_user_123',
        email: 'test@example.com',
        name: 'Test User',
      });
      expect(body.tenant).toEqual({
        organizationId: 'org_test123456789',
        schemaName: 'org_test',
        name: 'Test Organization',
        subscriptionTier: 'professional',
      });
    });

    it('should accept org ID from query parameter', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'clerk_user_123' });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'db_user_1',
        clerkId: 'clerk_user_123',
        email: 'test@example.com',
        name: 'Test User',
      });
      mockPrisma.organizationUser.findUnique.mockResolvedValue({
        role: 'member',
        designAuthority: 'none',
        operationsAuthority: 'none',
        marketingAuthority: 'none',
        complianceAuthority: 'none',
        organization: {
          id: 'org_query123456789',
          schemaName: 'org_query',
          name: 'Query Org',
          subscriptionTier: 'starter',
        },
      });
      mockPrisma.user.update.mockResolvedValue({});

      const res = await app.request('/protected/test?org=org_query123456789', {
        headers: {
          Authorization: 'Bearer valid_token',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tenant.organizationId).toBe('org_query123456789');
    });

    it('should update lastLoginAt without blocking auth', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'clerk_user_123' });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'db_user_1',
        clerkId: 'clerk_user_123',
        email: 'test@example.com',
        name: 'Test User',
      });
      mockPrisma.organizationUser.findUnique.mockResolvedValue({
        role: 'member',
        designAuthority: 'none',
        operationsAuthority: 'none',
        marketingAuthority: 'none',
        complianceAuthority: 'none',
        organization: {
          id: 'org_test123456789',
          schemaName: 'org_test',
          name: 'Test Org',
          subscriptionTier: 'starter',
        },
      });
      // Simulate slow update
      mockPrisma.user.update.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 50))
      );

      const res = await app.request('/protected/test', {
        headers: {
          Authorization: 'Bearer valid_token',
          'X-Organization-ID': 'org_test123456789',
        },
      });

      expect(res.status).toBe(200);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'db_user_1' },
        data: { lastLoginAt: expect.any(Date) },
      });
    });

    it('should continue auth even if lastLoginAt update fails', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'clerk_user_123' });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'db_user_1',
        clerkId: 'clerk_user_123',
        email: 'test@example.com',
        name: 'Test User',
      });
      mockPrisma.organizationUser.findUnique.mockResolvedValue({
        role: 'member',
        designAuthority: 'none',
        operationsAuthority: 'none',
        marketingAuthority: 'none',
        complianceAuthority: 'none',
        organization: {
          id: 'org_test123456789',
          schemaName: 'org_test',
          name: 'Test Org',
          subscriptionTier: 'starter',
        },
      });
      // Update fails
      mockPrisma.user.update.mockRejectedValue(new Error('DB error'));

      const res = await app.request('/protected/test', {
        headers: {
          Authorization: 'Bearer valid_token',
          'X-Organization-ID': 'org_test123456789',
        },
      });

      // Auth should still succeed
      expect(res.status).toBe(200);
    });
  });

  describe('userAuthMiddleware', () => {
    beforeEach(async () => {
      const { userAuthMiddleware } = await import('./auth.js');

      app = new Hono<{ Variables: AppVariables }>();
      app.use('/user/*', userAuthMiddleware);
      app.get('/user/profile', (c) => {
        const user = c.get('user');
        return c.json({ user });
      });
    });

    it('should return 401 when no authorization header', async () => {
      const res = await app.request('/user/profile');

      expect(res.status).toBe(401);
    });

    it('should return 401 when user not found', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'clerk_unknown' });
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const res = await app.request('/user/profile', {
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(401);
    });

    it('should authenticate without requiring organization', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'clerk_user_123' });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'db_user_1',
        clerkId: 'clerk_user_123',
        email: 'test@example.com',
        name: 'Test User',
      });

      const res = await app.request('/user/profile', {
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user).toEqual({
        id: 'db_user_1',
        clerkId: 'clerk_user_123',
        email: 'test@example.com',
        name: 'Test User',
      });
      // Should not require org membership
      expect(mockPrisma.organizationUser.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('optionalAuthMiddleware', () => {
    beforeEach(async () => {
      const { optionalAuthMiddleware } = await import('./auth.js');

      app = new Hono<{ Variables: AppVariables }>();
      app.use('/public/*', optionalAuthMiddleware);
      app.get('/public/data', (c) => {
        const user = c.get('user');
        const tenant = c.get('tenant');
        return c.json({
          authenticated: !!user,
          user: user || null,
          tenant: tenant || null,
        });
      });
    });

    it('should continue without auth when no token provided', async () => {
      const res = await app.request('/public/data');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.authenticated).toBe(false);
      expect(body.user).toBeNull();
    });

    it('should continue without auth when no org ID provided', async () => {
      const res = await app.request('/public/data', {
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.authenticated).toBe(false);
    });

    it('should set context when valid auth provided', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'clerk_user_123' });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'db_user_1',
        clerkId: 'clerk_user_123',
        email: 'test@example.com',
        name: 'Test User',
      });
      mockPrisma.organizationUser.findUnique.mockResolvedValue({
        role: 'member',
        designAuthority: 'none',
        operationsAuthority: 'none',
        marketingAuthority: 'none',
        complianceAuthority: 'none',
        organization: {
          id: 'org_test123456789',
          schemaName: 'org_test',
          name: 'Test Org',
          subscriptionTier: 'starter',
        },
      });
      mockPrisma.user.update.mockResolvedValue({});

      const res = await app.request('/public/data', {
        headers: {
          Authorization: 'Bearer valid_token',
          'X-Organization-ID': 'org_test123456789',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.authenticated).toBe(true);
      expect(body.user).toBeTruthy();
    });

    it('should continue without auth when token is invalid', async () => {
      mockVerifyToken.mockRejectedValue(new Error('Invalid token'));

      const res = await app.request('/public/data', {
        headers: {
          Authorization: 'Bearer invalid_token',
          'X-Organization-ID': 'org_test123456789',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.authenticated).toBe(false);
    });
  });

  describe('test auth bypass', () => {
    it('should allow bypass when ENABLE_TEST_AUTH_BYPASS is true and context is preset', async () => {
      process.env['ENABLE_TEST_AUTH_BYPASS'] = 'true';
      vi.resetModules();

      const { authMiddleware } = await import('./auth.js');

      app = new Hono<{ Variables: AppVariables }>();

      // Simulate pre-setting context (as integration tests do)
      app.use('/protected/*', async (c, next) => {
        c.set('user', {
          id: 'test_user_1',
          clerkId: 'test_clerk_1',
          email: 'test@test.com',
          name: 'Test',
        });
        c.set('tenant', {
          organizationId: 'org_test123456789',
          schemaName: 'test_schema',
          name: 'Test Org',
          subscriptionTier: 'starter',
        });
        await next();
      });
      app.use('/protected/*', authMiddleware);
      app.get('/protected/test', (c) => {
        return c.json({ success: true, user: c.get('user') });
      });

      const res = await app.request('/protected/test');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.user.id).toBe('test_user_1');
      // Should not have called Clerk verification
      expect(mockVerifyToken).not.toHaveBeenCalled();
    });

    it('should still require auth when bypass is enabled but context not preset', async () => {
      process.env['ENABLE_TEST_AUTH_BYPASS'] = 'true';
      vi.resetModules();

      const { authMiddleware } = await import('./auth.js');

      app = new Hono<{ Variables: AppVariables }>();
      app.use('/protected/*', authMiddleware);
      app.get('/protected/test', (c) => c.json({ success: true }));

      const res = await app.request('/protected/test');

      expect(res.status).toBe(401);
    });
  });
});
