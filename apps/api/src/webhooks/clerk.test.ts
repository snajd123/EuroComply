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

      mockOrm.em.findOne.mockResolvedValue(null); // No existing org
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

      mockOrm.em.findOne.mockResolvedValue(null); // No existing org
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

    it('returns existing org if clerkOrgId already exists (idempotent)', async () => {
      const event: ClerkOrganizationEvent = {
        type: 'organization.created',
        data: {
          id: 'org_existing',
          name: 'Existing Corp',
          slug: 'existing-corp',
          created_at: Date.now(),
        },
      };

      // Org already exists
      mockOrm.em.findOne.mockResolvedValue({
        id: 'existing_internal_id',
        schemaName: 'tenant_org_existing',
        provisioningStatus: 'READY',
      });

      const result = await handleOrganizationCreated(event, {
        orm: mockOrm as any,
        provisioner: mockProvisioner as any,
        clerk: mockClerk as any,
      });

      // Should return success with existing org
      expect(result.success).toBe(true);
      expect(result.organizationId).toBe('existing_internal_id');
      expect(result.schemaName).toBe('tenant_org_existing');
      // Should NOT call provisioner since org already exists
      expect(mockProvisioner.provisionTenant).not.toHaveBeenCalled();
    });
  });

  describe('handleOrganizationDeleted', () => {
    it('deletes organization and drops schema', async () => {
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
      mockProvisioner.dropSchema.mockResolvedValue(undefined);

      const result = await handleOrganizationDeleted(event, {
        orm: mockOrm as any,
        provisioner: mockProvisioner as any,
      });

      expect(result.success).toBe(true);
      expect(result.organizationId).toBe('internal_id');
      expect(result.schemaName).toBe('tenant_deleted_corp');
      expect(mockProvisioner.dropSchema).toHaveBeenCalledWith('tenant_deleted_corp');
      expect(mockOrm.em.remove).toHaveBeenCalled();
      expect(mockOrm.em.flush).toHaveBeenCalled();
    });

    it('returns success if organization not found (idempotent)', async () => {
      const event: ClerkOrganizationEvent = {
        type: 'organization.deleted',
        data: {
          id: 'org_notfound',
          name: 'Missing Corp',
          slug: 'missing-corp',
          created_at: Date.now(),
        },
      };

      mockOrm.em.findOne.mockResolvedValue(null);

      const result = await handleOrganizationDeleted(event, {
        orm: mockOrm as any,
        provisioner: mockProvisioner as any,
      });

      // Idempotent: already deleted = success
      expect(result.success).toBe(true);
      expect(result.error).toContain('already deleted');
      expect(mockProvisioner.dropSchema).not.toHaveBeenCalled();
    });
  });
});
