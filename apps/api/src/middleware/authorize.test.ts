import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { WorkspaceAuthority } from '@eurocomply/database';
import { authorize, requireOrgAdmin, authorizeAnyWorkspace } from './authorize.js';
import type { Env } from '../app.js';

describe('authorize middleware', () => {
  let app: Hono<Env>;

  beforeEach(() => {
    app = new Hono<Env>();
  });

  describe('workspace authority checks', () => {
    it('allows VIEWER to view', async () => {
      app.use('*', (c, next) => {
        c.set('membership', {
          designAuthority: WorkspaceAuthority.VIEWER,
        } as any);
        return next();
      });
      app.get('/test', authorize('design', 'view'), (c) => c.json({ ok: true }));

      const res = await app.request('/test');
      expect(res.status).toBe(200);
    });

    it('denies VIEWER from editing', async () => {
      app.use('*', (c, next) => {
        c.set('membership', {
          designAuthority: WorkspaceAuthority.VIEWER,
        } as any);
        return next();
      });
      app.post('/test', authorize('design', 'edit'), (c) => c.json({ ok: true }));

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(403);

      const body = await res.json();
      expect(body.yourAuthority).toBe('VIEWER');
      expect(body.requiredAuthority).toBe('CONTRIBUTOR');
    });

    it('denies NONE from viewing', async () => {
      app.use('*', (c, next) => {
        c.set('membership', {
          designAuthority: WorkspaceAuthority.NONE,
        } as any);
        return next();
      });
      app.get('/test', authorize('design', 'view'), (c) => c.json({ ok: true }));

      const res = await app.request('/test');
      expect(res.status).toBe(403);
    });

    it('allows CONTRIBUTOR to edit', async () => {
      app.use('*', (c, next) => {
        c.set('membership', {
          designAuthority: WorkspaceAuthority.CONTRIBUTOR,
        } as any);
        return next();
      });
      app.post('/test', authorize('design', 'edit'), (c) => c.json({ ok: true }));

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(200);
    });

    it('allows EDITOR to approve', async () => {
      app.use('*', (c, next) => {
        c.set('membership', {
          designAuthority: WorkspaceAuthority.EDITOR,
        } as any);
        return next();
      });
      app.post('/test', authorize('design', 'approve'), (c) => c.json({ ok: true }));

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(200);
    });

    it('allows MANAGER to manage', async () => {
      app.use('*', (c, next) => {
        c.set('membership', {
          designAuthority: WorkspaceAuthority.MANAGER,
        } as any);
        return next();
      });
      app.post('/test', authorize('design', 'manage'), (c) => c.json({ ok: true }));

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(200);
    });

    it('checks correct workspace - denies cross-workspace', async () => {
      app.use('*', (c, next) => {
        c.set('membership', {
          designAuthority: WorkspaceAuthority.MANAGER,
          complianceAuthority: WorkspaceAuthority.NONE,
        } as any);
        return next();
      });
      app.get('/test', authorize('compliance', 'view'), (c) => c.json({ ok: true }));

      const res = await app.request('/test');
      expect(res.status).toBe(403);
    });
  });

  describe('API key bypass', () => {
    it('allows API key to skip authority check', async () => {
      app.use('*', (c, next) => {
        c.set('userId', 'api-key:org_123');
        c.set('membership', undefined);
        return next();
      });
      app.post('/test', authorize('design', 'manage'), (c) => c.json({ ok: true }));

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(200);
    });
  });

  describe('missing membership', () => {
    it('returns 401 when membership is missing', async () => {
      app.use('*', (c, next) => {
        c.set('userId', 'user_123');
        c.set('membership', undefined);
        return next();
      });
      app.get('/test', authorize('design', 'view'), (c) => c.json({ ok: true }));

      const res = await app.request('/test');
      expect(res.status).toBe(401);
    });
  });
});

describe('requireOrgAdmin middleware', () => {
  let app: Hono<Env>;

  beforeEach(() => {
    app = new Hono<Env>();
  });

  it('allows org admin', async () => {
    app.use('*', (c, next) => {
      c.set('membership', { isOrgAdmin: true } as any);
      return next();
    });
    app.get('/test', requireOrgAdmin(), (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });

  it('denies non-admin', async () => {
    app.use('*', (c, next) => {
      c.set('membership', { isOrgAdmin: false } as any);
      return next();
    });
    app.get('/test', requireOrgAdmin(), (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.message).toContain('Organization Admin');
  });

  it('allows API key to bypass', async () => {
    app.use('*', (c, next) => {
      c.set('userId', 'api-key:org_123');
      c.set('membership', undefined);
      return next();
    });
    app.get('/test', requireOrgAdmin(), (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });
});

describe('authorizeAnyWorkspace middleware', () => {
  let app: Hono<Env>;

  beforeEach(() => {
    app = new Hono<Env>();
  });

  it('allows if user has access to any workspace', async () => {
    app.use('*', (c, next) => {
      c.set('membership', {
        designAuthority: WorkspaceAuthority.NONE,
        operationsAuthority: WorkspaceAuthority.NONE,
        marketingAuthority: WorkspaceAuthority.VIEWER,
        complianceAuthority: WorkspaceAuthority.NONE,
      } as any);
      return next();
    });
    app.get('/test', authorizeAnyWorkspace('view'), (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });

  it('denies if user has NONE in all workspaces', async () => {
    app.use('*', (c, next) => {
      c.set('membership', {
        designAuthority: WorkspaceAuthority.NONE,
        operationsAuthority: WorkspaceAuthority.NONE,
        marketingAuthority: WorkspaceAuthority.NONE,
        complianceAuthority: WorkspaceAuthority.NONE,
      } as any);
      return next();
    });
    app.get('/test', authorizeAnyWorkspace('view'), (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(403);
  });
});
