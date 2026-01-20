import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { Authority, Workspace } from '@eurocomply/shared';
import type { AppVariables } from '../types/context.js';
import {
  requireAuthority,
  requireOrgAdmin,
  requireOrgOwner,
} from './authorize.js';

describe('authorize middleware', () => {
  let app: Hono<{ Variables: AppVariables }>;

  const createAppWithPermissions = (permissions: AppVariables['permissions'] | undefined) => {
    const testApp = new Hono<{ Variables: AppVariables }>();

    // Set up permissions in context
    testApp.use('*', async (c, next) => {
      if (permissions) {
        c.set('permissions', permissions);
      }
      await next();
    });

    return testApp;
  };

  describe('requireAuthority', () => {
    describe('design workspace', () => {
      it('should allow access when user has MANAGER authority', async () => {
        app = createAppWithPermissions({
          role: 'member',
          designAuthority: 'MANAGER',
          operationsAuthority: 'VIEWER',
          marketingAuthority: 'VIEWER',
          complianceAuthority: 'VIEWER',
        });
        app.get('/design', requireAuthority(Workspace.DESIGN, Authority.EDITOR), (c) =>
          c.json({ success: true })
        );

        const res = await app.request('/design');

        expect(res.status).toBe(200);
      });

      it('should allow access when user has exact required authority', async () => {
        app = createAppWithPermissions({
          role: 'member',
          designAuthority: 'EDITOR',
          operationsAuthority: 'VIEWER',
          marketingAuthority: 'VIEWER',
          complianceAuthority: 'VIEWER',
        });
        app.get('/design', requireAuthority(Workspace.DESIGN, Authority.EDITOR), (c) =>
          c.json({ success: true })
        );

        const res = await app.request('/design');

        expect(res.status).toBe(200);
      });

      it('should deny access when user has lower authority', async () => {
        app = createAppWithPermissions({
          role: 'member',
          designAuthority: 'VIEWER',
          operationsAuthority: 'VIEWER',
          marketingAuthority: 'VIEWER',
          complianceAuthority: 'VIEWER',
        });
        app.get('/design', requireAuthority(Workspace.DESIGN, Authority.EDITOR), (c) =>
          c.json({ success: true })
        );

        const res = await app.request('/design');

        expect(res.status).toBe(403);
      });

      it('should deny access when user has CONTRIBUTOR but needs EDITOR', async () => {
        app = createAppWithPermissions({
          role: 'member',
          designAuthority: 'CONTRIBUTOR',
          operationsAuthority: 'VIEWER',
          marketingAuthority: 'VIEWER',
          complianceAuthority: 'VIEWER',
        });
        app.get('/design', requireAuthority(Workspace.DESIGN, Authority.EDITOR), (c) =>
          c.json({ success: true })
        );

        const res = await app.request('/design');

        expect(res.status).toBe(403);
      });
    });

    describe('operations workspace', () => {
      it('should check operations authority correctly', async () => {
        app = createAppWithPermissions({
          role: 'member',
          designAuthority: 'VIEWER',
          operationsAuthority: 'MANAGER',
          marketingAuthority: 'VIEWER',
          complianceAuthority: 'VIEWER',
        });
        app.get('/operations', requireAuthority(Workspace.OPERATIONS, Authority.MANAGER), (c) =>
          c.json({ success: true })
        );

        const res = await app.request('/operations');

        expect(res.status).toBe(200);
      });

      it('should deny access for insufficient operations authority', async () => {
        app = createAppWithPermissions({
          role: 'member',
          designAuthority: 'MANAGER', // Has MANAGER in design but not operations
          operationsAuthority: 'VIEWER',
          marketingAuthority: 'VIEWER',
          complianceAuthority: 'VIEWER',
        });
        app.get('/operations', requireAuthority(Workspace.OPERATIONS, Authority.EDITOR), (c) =>
          c.json({ success: true })
        );

        const res = await app.request('/operations');

        expect(res.status).toBe(403);
      });
    });

    describe('marketing workspace', () => {
      it('should check marketing authority correctly', async () => {
        app = createAppWithPermissions({
          role: 'member',
          designAuthority: 'VIEWER',
          operationsAuthority: 'VIEWER',
          marketingAuthority: 'EDITOR',
          complianceAuthority: 'VIEWER',
        });
        app.get('/marketing', requireAuthority(Workspace.MARKETING, Authority.VIEWER), (c) =>
          c.json({ success: true })
        );

        const res = await app.request('/marketing');

        expect(res.status).toBe(200);
      });
    });

    describe('compliance workspace', () => {
      it('should check compliance authority correctly', async () => {
        app = createAppWithPermissions({
          role: 'member',
          designAuthority: 'VIEWER',
          operationsAuthority: 'VIEWER',
          marketingAuthority: 'VIEWER',
          complianceAuthority: 'MANAGER',
        });
        app.get('/compliance', requireAuthority(Workspace.COMPLIANCE, Authority.MANAGER), (c) =>
          c.json({ success: true })
        );

        const res = await app.request('/compliance');

        expect(res.status).toBe(200);
      });
    });

    describe('unauthenticated requests', () => {
      it('should return 401 when permissions not set', async () => {
        app = createAppWithPermissions(undefined);
        app.get('/protected', requireAuthority(Workspace.DESIGN, Authority.VIEWER), (c) =>
          c.json({ success: true })
        );

        const res = await app.request('/protected');

        expect(res.status).toBe(401);
      });
    });
  });

  describe('requireOrgAdmin', () => {
    it('should allow access for owner role', async () => {
      app = createAppWithPermissions({
        role: 'owner',
        designAuthority: 'VIEWER',
        operationsAuthority: 'VIEWER',
        marketingAuthority: 'VIEWER',
        complianceAuthority: 'VIEWER',
      });
      app.get('/admin', requireOrgAdmin, (c) => c.json({ success: true }));

      const res = await app.request('/admin');

      expect(res.status).toBe(200);
    });

    it('should allow access for admin role', async () => {
      app = createAppWithPermissions({
        role: 'admin',
        designAuthority: 'VIEWER',
        operationsAuthority: 'VIEWER',
        marketingAuthority: 'VIEWER',
        complianceAuthority: 'VIEWER',
      });
      app.get('/admin', requireOrgAdmin, (c) => c.json({ success: true }));

      const res = await app.request('/admin');

      expect(res.status).toBe(200);
    });

    it('should deny access for member role', async () => {
      app = createAppWithPermissions({
        role: 'member',
        designAuthority: 'MANAGER', // Even with MANAGER authority, role matters
        operationsAuthority: 'MANAGER',
        marketingAuthority: 'MANAGER',
        complianceAuthority: 'MANAGER',
      });
      app.get('/admin', requireOrgAdmin, (c) => c.json({ success: true }));

      const res = await app.request('/admin');

      expect(res.status).toBe(403);
    });

    it('should deny access for viewer role', async () => {
      app = createAppWithPermissions({
        role: 'viewer',
        designAuthority: 'VIEWER',
        operationsAuthority: 'VIEWER',
        marketingAuthority: 'VIEWER',
        complianceAuthority: 'VIEWER',
      });
      app.get('/admin', requireOrgAdmin, (c) => c.json({ success: true }));

      const res = await app.request('/admin');

      expect(res.status).toBe(403);
    });

    it('should return 401 when not authenticated', async () => {
      app = createAppWithPermissions(undefined);
      app.get('/admin', requireOrgAdmin, (c) => c.json({ success: true }));

      const res = await app.request('/admin');

      expect(res.status).toBe(401);
    });
  });

  describe('requireOrgOwner', () => {
    it('should allow access for owner role', async () => {
      app = createAppWithPermissions({
        role: 'owner',
        designAuthority: 'VIEWER',
        operationsAuthority: 'VIEWER',
        marketingAuthority: 'VIEWER',
        complianceAuthority: 'VIEWER',
      });
      app.get('/owner-only', requireOrgOwner, (c) => c.json({ success: true }));

      const res = await app.request('/owner-only');

      expect(res.status).toBe(200);
    });

    it('should deny access for admin role', async () => {
      app = createAppWithPermissions({
        role: 'admin',
        designAuthority: 'MANAGER',
        operationsAuthority: 'MANAGER',
        marketingAuthority: 'MANAGER',
        complianceAuthority: 'MANAGER',
      });
      app.get('/owner-only', requireOrgOwner, (c) => c.json({ success: true }));

      const res = await app.request('/owner-only');

      expect(res.status).toBe(403);
    });

    it('should deny access for member role', async () => {
      app = createAppWithPermissions({
        role: 'member',
        designAuthority: 'VIEWER',
        operationsAuthority: 'VIEWER',
        marketingAuthority: 'VIEWER',
        complianceAuthority: 'VIEWER',
      });
      app.get('/owner-only', requireOrgOwner, (c) => c.json({ success: true }));

      const res = await app.request('/owner-only');

      expect(res.status).toBe(403);
    });

    it('should return 401 when not authenticated', async () => {
      app = createAppWithPermissions(undefined);
      app.get('/owner-only', requireOrgOwner, (c) => c.json({ success: true }));

      const res = await app.request('/owner-only');

      expect(res.status).toBe(401);
    });
  });

  describe('middleware chaining', () => {
    it('should work with multiple authorization checks', async () => {
      app = createAppWithPermissions({
        role: 'admin',
        designAuthority: 'EDITOR',
        operationsAuthority: 'VIEWER',
        marketingAuthority: 'VIEWER',
        complianceAuthority: 'VIEWER',
      });
      app.get(
        '/admin-design',
        requireOrgAdmin,
        requireAuthority(Workspace.DESIGN, Authority.EDITOR),
        (c) => c.json({ success: true })
      );

      const res = await app.request('/admin-design');

      expect(res.status).toBe(200);
    });

    it('should fail on first failing check', async () => {
      app = createAppWithPermissions({
        role: 'member', // Not admin
        designAuthority: 'MANAGER', // But has design authority
        operationsAuthority: 'VIEWER',
        marketingAuthority: 'VIEWER',
        complianceAuthority: 'VIEWER',
      });
      app.get(
        '/admin-design',
        requireOrgAdmin, // This should fail
        requireAuthority(Workspace.DESIGN, Authority.EDITOR),
        (c) => c.json({ success: true })
      );

      const res = await app.request('/admin-design');

      expect(res.status).toBe(403);
    });
  });
});
