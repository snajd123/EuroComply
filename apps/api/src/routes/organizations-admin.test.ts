import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createOrganizationsAdminRouter } from './organizations.js';
import { ProvisioningStatus } from '@eurocomply/database';

const mockOrm = {
  em: {
    fork: vi.fn(() => mockOrm.em),
    findOne: vi.fn(),
    flush: vi.fn(),
    create: vi.fn((Entity: unknown, data: Record<string, unknown>) => ({ ...data })),
    persist: vi.fn(),
  },
};

const mockProvisioner = {
  provisionTenant: vi.fn(),
};

describe('organizations admin routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrm.em.fork.mockReturnValue(mockOrm.em);
  });

  describe('POST /organizations/:id/provision', () => {
    it('provisions a failed organization', async () => {
      const router = createOrganizationsAdminRouter({
        orm: mockOrm as any,
        provisioner: mockProvisioner as any,
      });

      const app = new Hono();
      app.route('/organizations', router);

      const failedOrg = {
        id: 'org_123',
        schemaName: 'tenant_org_abc123',
        provisioningStatus: ProvisioningStatus.FAILED,
        provisioningError: 'Previous error',
      };

      mockOrm.em.findOne.mockResolvedValue(failedOrg);
      mockProvisioner.provisionTenant.mockResolvedValue({ success: true, schemaName: 'tenant_org_abc123' });

      const res = await app.request('/organizations/org_123/provision', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const data = await res.json() as { success: boolean };
      expect(data.success).toBe(true);
      expect(mockProvisioner.provisionTenant).toHaveBeenCalledWith('tenant_org_abc123');
    });

    it('provisions a pending organization', async () => {
      const router = createOrganizationsAdminRouter({
        orm: mockOrm as any,
        provisioner: mockProvisioner as any,
      });

      const app = new Hono();
      app.route('/organizations', router);

      const pendingOrg = {
        id: 'org_123',
        schemaName: 'tenant_org_abc123',
        provisioningStatus: ProvisioningStatus.PENDING,
      };

      mockOrm.em.findOne.mockResolvedValue(pendingOrg);
      mockProvisioner.provisionTenant.mockResolvedValue({ success: true, schemaName: 'tenant_org_abc123' });

      const res = await app.request('/organizations/org_123/provision', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const data = await res.json() as { success: boolean };
      expect(data.success).toBe(true);
      expect(mockProvisioner.provisionTenant).toHaveBeenCalledWith('tenant_org_abc123');
    });

    it('rejects provisioning for already provisioned organization', async () => {
      const router = createOrganizationsAdminRouter({
        orm: mockOrm as any,
        provisioner: mockProvisioner as any,
      });

      const app = new Hono();
      app.route('/organizations', router);

      const readyOrg = {
        id: 'org_123',
        schemaName: 'tenant_org_abc123',
        provisioningStatus: ProvisioningStatus.READY,
      };

      mockOrm.em.findOne.mockResolvedValue(readyOrg);

      const res = await app.request('/organizations/org_123/provision', {
        method: 'POST',
      });

      expect(res.status).toBe(400);
      const data = await res.json() as { error: string };
      expect(data.error).toContain('already provisioned');
    });

    it('returns 404 for non-existent organization', async () => {
      const router = createOrganizationsAdminRouter({
        orm: mockOrm as any,
        provisioner: mockProvisioner as any,
      });

      const app = new Hono();
      app.route('/organizations', router);

      mockOrm.em.findOne.mockResolvedValue(null);

      const res = await app.request('/organizations/org_999/provision', {
        method: 'POST',
      });

      expect(res.status).toBe(404);
    });
  });
});
