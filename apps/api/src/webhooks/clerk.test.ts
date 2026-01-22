import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleOrganizationCreated,
  handleOrganizationDeleted,
  clerkOrgIdToSchemaName,
  type ClerkOrganizationEvent
} from './clerk.js';

// Mock dependencies
const mockOrm = {
  em: {
    fork: vi.fn(() => mockOrm.em),
    create: vi.fn((Entity: unknown, data: Record<string, unknown>) => ({ ...data })),
    persist: vi.fn(),
    flush: vi.fn(),
    findOne: vi.fn(),
    remove: vi.fn(),
  },
};

const mockProvisioner = {
  provisionTenant: vi.fn(),
  dropSchema: vi.fn(),
};

const mockClerk = {
  organizations: {
    updateOrganizationMetadata: vi.fn(),
  },
};

describe('Clerk webhook handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrm.em.fork.mockReturnValue(mockOrm.em);
  });

  describe('clerkOrgIdToSchemaName', () => {
    it('converts Clerk org ID to valid schema name', () => {
      expect(clerkOrgIdToSchemaName('org_2abc3def4ghi5jkl')).toBe('tenant_org_4ghi5jkl');
      expect(clerkOrgIdToSchemaName('org_xyz123')).toBe('tenant_org_xyz123');
    });

    it('handles short org IDs', () => {
      expect(clerkOrgIdToSchemaName('org_abc')).toBe('tenant_org_abc');
    });
  });

  describe('handleOrganizationCreated', () => {
    it('creates organization and provisions tenant', async () => {
      const event: ClerkOrganizationEvent = {
        type: 'organization.created',
        data: {
          id: 'org_123',
          name: 'Acme Corp',
          slug: 'acme-corp',
          created_at: Date.now(),
        },
      };

      mockProvisioner.provisionTenant.mockResolvedValue({ success: true, schemaName: 'tenant_org_123' });
      mockClerk.organizations.updateOrganizationMetadata.mockResolvedValue({});

      const result = await handleOrganizationCreated(event, {
        orm: mockOrm as any,
        provisioner: mockProvisioner as any,
        clerk: mockClerk as any,
      });

      expect(result.success).toBe(true);
      expect(mockOrm.em.create).toHaveBeenCalled();
      expect(mockOrm.em.flush).toHaveBeenCalled();
      // Schema name derived from Clerk org ID (last 8 chars), not slug
      expect(mockProvisioner.provisionTenant).toHaveBeenCalledWith('tenant_org_123');
      expect(mockClerk.organizations.updateOrganizationMetadata).toHaveBeenCalledWith(
        'org_123',
        expect.objectContaining({
          publicMetadata: expect.objectContaining({
            schema_name: 'tenant_org_123',
          }),
        })
      );
    });

    it('handles provisioning failure', async () => {
      const event: ClerkOrganizationEvent = {
        type: 'organization.created',
        data: {
          id: 'org_456',
          name: 'Bad Corp',
          slug: 'bad-corp',
          created_at: Date.now(),
        },
      };

      mockProvisioner.provisionTenant.mockResolvedValue({
        success: false,
        schemaName: 'tenant_org_456',
        error: 'Database error',
      });

      const result = await handleOrganizationCreated(event, {
        orm: mockOrm as any,
        provisioner: mockProvisioner as any,
        clerk: mockClerk as any,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database error');
    });
  });

  describe('handleOrganizationDeleted', () => {
    it('marks organization as deleted', async () => {
      const event: ClerkOrganizationEvent = {
        type: 'organization.deleted',
        data: {
          id: 'org_789',
          name: 'Deleted Corp',
          slug: 'deleted-corp',
          created_at: Date.now(),
        },
      };

      mockOrm.em.findOne.mockResolvedValue({
        id: 'internal_id',
        schemaName: 'tenant_deleted_corp',
      });

      const result = await handleOrganizationDeleted(event, {
        orm: mockOrm as any,
        provisioner: mockProvisioner as any,
      });

      expect(result.success).toBe(true);
      // Note: We don't actually drop schemas on delete - just mark as deleted
      expect(mockProvisioner.dropSchema).not.toHaveBeenCalled();
    });
  });
});
