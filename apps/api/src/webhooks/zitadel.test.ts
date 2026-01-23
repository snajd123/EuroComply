import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleOrganizationCreated,
  handleOrganizationDeleted,
  zitadelOrgIdToSchemaName,
  type ZitadelOrganizationEvent,
  type HandlerDependencies,
} from './zitadel.js';
import { ProvisioningStatus } from '@eurocomply/database';

describe('zitadelOrgIdToSchemaName', () => {
  it('converts ZITADEL org ID to schema name', () => {
    expect(zitadelOrgIdToSchemaName('123456789012345678')).toBe('tenant_org_12345678');
  });

  it('handles short org IDs', () => {
    expect(zitadelOrgIdToSchemaName('abc123')).toBe('tenant_org_abc123');
  });

  it('lowercases the result', () => {
    expect(zitadelOrgIdToSchemaName('ABCD1234EFGH5678')).toBe('tenant_org_efgh5678');
  });
});

describe('handleOrganizationCreated', () => {
  let mockDeps: HandlerDependencies;
  let mockEm: any;

  beforeEach(() => {
    mockEm = {
      create: vi.fn((Entity, data) => ({ ...data })),
      persist: vi.fn(),
      flush: vi.fn(),
      findOne: vi.fn(),
      removeAndFlush: vi.fn(),
    };

    mockDeps = {
      orm: { em: { fork: () => mockEm } },
      provisioner: {
        provisionTenant: vi.fn().mockResolvedValue({ success: true, schemaName: 'tenant_org_12345678' }),
        dropSchema: vi.fn(),
      },
    };
  });

  it('creates organization and provisions schema for new org', async () => {
    mockEm.findOne.mockResolvedValue(null);

    const event: ZitadelOrganizationEvent = {
      type: 'org.created',
      data: { orgId: '123456789012345678', name: 'Test Org' },
    };

    const result = await handleOrganizationCreated(event, mockDeps);

    expect(result.success).toBe(true);
    expect(result.schemaName).toBe('tenant_org_12345678');
    expect(mockDeps.provisioner.provisionTenant).toHaveBeenCalledWith('tenant_org_12345678');
  });

  it('returns idempotent success for already provisioned org', async () => {
    mockEm.findOne.mockResolvedValue({
      id: 'existing-id',
      schemaName: 'tenant_org_12345678',
      provisioningStatus: ProvisioningStatus.READY,
    });

    const event: ZitadelOrganizationEvent = {
      type: 'org.created',
      data: { orgId: '123456789012345678', name: 'Test Org' },
    };

    const result = await handleOrganizationCreated(event, mockDeps);

    expect(result.success).toBe(true);
    expect(result.idempotent).toBe(true);
    expect(mockDeps.provisioner.provisionTenant).not.toHaveBeenCalled();
  });
});

describe('handleOrganizationDeleted', () => {
  let mockDeps: HandlerDependencies;
  let mockEm: any;

  beforeEach(() => {
    mockEm = {
      create: vi.fn((Entity, data) => ({ ...data })),
      persist: vi.fn(),
      flush: vi.fn(),
      findOne: vi.fn(),
      removeAndFlush: vi.fn(),
    };

    mockDeps = {
      orm: { em: { fork: () => mockEm } },
      provisioner: { provisionTenant: vi.fn(), dropSchema: vi.fn() },
    };
  });

  it('deletes organization and drops schema', async () => {
    mockEm.findOne.mockResolvedValue({
      id: 'org-id',
      name: 'Test Org',
      schemaName: 'tenant_org_12345678',
      provisioningStatus: ProvisioningStatus.READY,
    });

    const event: ZitadelOrganizationEvent = {
      type: 'org.removed',
      data: { orgId: '123456789012345678' },
    };

    const result = await handleOrganizationDeleted(event, mockDeps);

    expect(result.success).toBe(true);
    expect(mockDeps.provisioner.dropSchema).toHaveBeenCalledWith('tenant_org_12345678');
    expect(mockEm.removeAndFlush).toHaveBeenCalled();
  });

  it('returns idempotent success when org not found', async () => {
    mockEm.findOne.mockResolvedValue(null);

    const event: ZitadelOrganizationEvent = {
      type: 'org.removed',
      data: { orgId: '123456789012345678' },
    };

    const result = await handleOrganizationDeleted(event, mockDeps);

    expect(result.success).toBe(true);
    expect(result.idempotent).toBe(true);
  });
});
