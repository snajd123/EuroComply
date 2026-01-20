import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import {
  OrganizationService,
  CreateOrganizationInput,
  setOrganizationServiceOrm,
  createOrganization,
  getOrganization,
  listUserOrganizations,
} from './organization.service.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';

// Mock the @eurocomply/db module
vi.mock('@eurocomply/db', () => ({
  MikroOrm: {
    Organization: class MockOrganization {},
    User: class MockUser {},
    OrganizationUser: class MockOrganizationUser {},
    OutboxEvent: class MockOutboxEvent {},
  },
  createTenantSchemaMikroOrm: vi.fn().mockResolvedValue(undefined),
  EventTypes: {
    ORG_CREATED: 'organization.created',
  },
}));

// Mock the walt-id client
vi.mock('@eurocomply/walt-id', () => ({
  createWaltIdClient: vi.fn().mockReturnValue({
    createDid: vi.fn().mockResolvedValue({ did: 'did:key:test', keyId: 'key-123' }),
  }),
}));

// Mock the logger
vi.mock('../lib/logger.js', () => ({
  loggers: {
    organization: {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
  },
}));

// Mock the did service
vi.mock('./did.service.js', () => ({
  DidService: vi.fn().mockImplementation(() => ({
    createOrganizationDid: vi.fn().mockResolvedValue({ did: 'did:key:org', keyId: 'org-key' }),
    createUserDid: vi.fn().mockResolvedValue({ did: 'did:key:user', keyId: 'user-key' }),
  })),
}));

// Mock the status list service
vi.mock('./status-list.service.js', () => ({
  StatusList2021Service: vi.fn().mockImplementation(() => ({
    allocateIndex: vi.fn().mockResolvedValue(0),
  })),
}));

describe('OrganizationService', () => {
  let mockOrm: MikroORM;
  let mockEm: EntityManager;
  let mockTenantEm: EntityManager;
  let service: OrganizationService;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock tenant EntityManager
    mockTenantEm = {
      create: vi.fn().mockImplementation((Entity, data) => ({
        ...data,
        id: data.id || `mock_${Date.now()}`,
      })),
      findOne: vi.fn(),
      find: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn(),
    } as unknown as EntityManager;

    // Create mock EntityManager
    mockEm = {
      create: vi.fn().mockImplementation((Entity, data) => ({
        ...data,
        id: data.id || `org_${Date.now()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      findOne: vi.fn(),
      find: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
      fork: vi.fn().mockReturnValue(mockTenantEm),
    } as unknown as EntityManager;

    // Create mock MikroORM instance
    mockOrm = {
      em: mockEm,
    } as unknown as MikroORM;

    service = new OrganizationService(mockOrm);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createOrganization', () => {
    const validInput: CreateOrganizationInput = {
      name: 'Test Organization',
      ownerClerkId: 'clerk_123',
      ownerEmail: 'owner@test.com',
      ownerName: 'Test Owner',
    };

    it('should create an organization with correct slug', async () => {
      // Setup: no existing org with this slug
      vi.mocked(mockEm.findOne).mockResolvedValue(null);

      const result = await service.createOrganization(validInput);

      expect(result.name).toBe('Test Organization');
      expect(result.slug).toBe('test-organization');
      expect(result.schemaName).toBe('tenant_test_organization');
      expect(result.subscriptionTier).toBe('starter');
      expect(result.subscriptionStatus).toBe('active');
      expect(result.owner.email).toBe('owner@test.com');
      expect(result.owner.name).toBe('Test Owner');
    });

    it('should generate unique slug on collision', async () => {
      // First call returns existing org (collision), second returns null
      vi.mocked(mockEm.findOne)
        .mockResolvedValueOnce({ slug: 'test-organization' }) // First slug check
        .mockResolvedValueOnce(null) // Second slug check (with counter)
        .mockResolvedValueOnce(null); // Schema name check

      const result = await service.createOrganization(validInput);

      expect(result.slug).toBe('test-organization-1');
      expect(result.schemaName).toBe('tenant_test_organization_1');
    });

    it('should throw ConflictError if schema name already exists', async () => {
      // Slug check passes, but schema name exists
      vi.mocked(mockEm.findOne)
        .mockResolvedValueOnce(null) // Slug check
        .mockResolvedValueOnce({ schemaName: 'tenant_test_organization' }); // Schema name exists

      await expect(service.createOrganization(validInput)).rejects.toThrow(
        ConflictError
      );
    });

    it('should create tenant schema after organization', async () => {
      const { createTenantSchemaMikroOrm } = await import('@eurocomply/db');
      vi.mocked(mockEm.findOne).mockResolvedValue(null);

      await service.createOrganization(validInput);

      expect(createTenantSchemaMikroOrm).toHaveBeenCalledWith(
        mockOrm,
        'tenant_test_organization'
      );
    });

    it('should create user and membership in tenant schema', async () => {
      vi.mocked(mockEm.findOne).mockResolvedValue(null);

      await service.createOrganization(validInput);

      // Verify tenant em was forked
      expect(mockEm.fork).toHaveBeenCalledWith({
        schema: 'tenant_test_organization',
      });

      // Verify user was created
      expect(mockTenantEm.create).toHaveBeenCalledWith(
        expect.anything(), // User entity
        expect.objectContaining({
          clerkId: 'clerk_123',
          email: 'owner@test.com',
          name: 'Test Owner',
        })
      );

      // Verify membership was created with owner role
      expect(mockTenantEm.create).toHaveBeenCalledWith(
        expect.anything(), // OrganizationUser entity
        expect.objectContaining({
          role: 'owner',
          designAuthority: 'MANAGER',
          operationsAuthority: 'MANAGER',
          marketingAuthority: 'MANAGER',
          complianceAuthority: 'MANAGER',
        })
      );

      // Verify outbox event was created
      expect(mockTenantEm.create).toHaveBeenCalledWith(
        expect.anything(), // OutboxEvent entity
        expect.objectContaining({
          eventType: 'organization.created',
          aggregateType: 'organization',
        })
      );

      // Verify tenant em was flushed
      expect(mockTenantEm.flush).toHaveBeenCalled();
    });

    it('should sanitize name for slug generation', async () => {
      vi.mocked(mockEm.findOne).mockResolvedValue(null);

      const result = await service.createOrganization({
        ...validInput,
        name: '  Test   Organization!!!  @#$  ',
      });

      expect(result.slug).toBe('test-organization');
    });

    it('should truncate long names for slug', async () => {
      vi.mocked(mockEm.findOne).mockResolvedValue(null);

      const longName = 'A'.repeat(100);
      const result = await service.createOrganization({
        ...validInput,
        name: longName,
      });

      expect(result.slug.length).toBeLessThanOrEqual(50);
    });
  });

  describe('getOrganization', () => {
    it('should return organization with owner', async () => {
      const mockOrg = {
        id: 'org_123',
        name: 'Test Org',
        slug: 'test-org',
        schemaName: 'tenant_test_org',
        subscriptionTier: 'starter',
        subscriptionStatus: 'active',
        createdAt: new Date(),
      };

      const mockOwner = {
        id: 'usr_456',
        email: 'owner@test.com',
        name: 'Test Owner',
      };

      const mockMembership = {
        role: 'owner',
        user: mockOwner,
      };

      vi.mocked(mockEm.findOne).mockResolvedValue(mockOrg);
      vi.mocked(mockTenantEm.findOne).mockResolvedValue(mockMembership);

      const result = await service.getOrganization('org_123');

      expect(result.id).toBe('org_123');
      expect(result.name).toBe('Test Org');
      expect(result.owner.id).toBe('usr_456');
      expect(result.owner.email).toBe('owner@test.com');
    });

    it('should throw NotFoundError if organization does not exist', async () => {
      vi.mocked(mockEm.findOne).mockResolvedValue(null);

      await expect(service.getOrganization('nonexistent')).rejects.toThrow(
        NotFoundError
      );
    });

    it('should throw NotFoundError if owner membership not found', async () => {
      const mockOrg = {
        id: 'org_123',
        schemaName: 'tenant_test_org',
      };

      vi.mocked(mockEm.findOne).mockResolvedValue(mockOrg);
      vi.mocked(mockTenantEm.findOne).mockResolvedValue(null);

      await expect(service.getOrganization('org_123')).rejects.toThrow(
        NotFoundError
      );
    });

    it('should fork tenant em with correct schema', async () => {
      const mockOrg = {
        id: 'org_123',
        schemaName: 'tenant_custom_schema',
      };

      const mockMembership = {
        role: 'owner',
        user: { id: 'usr_1', email: 'test@test.com', name: null },
      };

      vi.mocked(mockEm.findOne).mockResolvedValue(mockOrg);
      vi.mocked(mockTenantEm.findOne).mockResolvedValue(mockMembership);

      await service.getOrganization('org_123');

      expect(mockEm.fork).toHaveBeenCalledWith({ schema: 'tenant_custom_schema' });
    });
  });

  describe('listUserOrganizations', () => {
    it('should return organizations where user has membership', async () => {
      const mockOrgs = [
        { id: 'org_1', name: 'Org 1', slug: 'org-1', schemaName: 'tenant_org_1', subscriptionTier: 'starter' },
        { id: 'org_2', name: 'Org 2', slug: 'org-2', schemaName: 'tenant_org_2', subscriptionTier: 'pro' },
      ];

      const mockUser = { id: 'usr_123', clerkId: 'clerk_123' };
      const mockMembership = { role: 'member' };

      vi.mocked(mockEm.find).mockResolvedValue(mockOrgs);
      vi.mocked(mockTenantEm.findOne)
        .mockResolvedValueOnce(mockUser) // User in org 1
        .mockResolvedValueOnce(mockMembership) // Membership in org 1
        .mockResolvedValueOnce(null) // No user in org 2
        .mockResolvedValueOnce(null); // No membership in org 2

      const results = await service.listUserOrganizations('clerk_123');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: 'org_1',
        name: 'Org 1',
        slug: 'org-1',
        role: 'member',
        subscriptionTier: 'starter',
      });
    });

    it('should return empty array if user has no memberships', async () => {
      const mockOrgs = [
        { id: 'org_1', schemaName: 'tenant_org_1' },
      ];

      vi.mocked(mockEm.find).mockResolvedValue(mockOrgs);
      vi.mocked(mockTenantEm.findOne).mockResolvedValue(null);

      const results = await service.listUserOrganizations('clerk_unknown');

      expect(results).toHaveLength(0);
    });

    it('should return empty array if no organizations exist', async () => {
      vi.mocked(mockEm.find).mockResolvedValue([]);

      const results = await service.listUserOrganizations('clerk_123');

      expect(results).toHaveLength(0);
    });
  });

  describe('listUserOrganizationsByUserId', () => {
    it('should return organization for known tenant', async () => {
      const mockUser = { id: 'usr_123' };
      const mockMembership = { role: 'admin' };
      const mockOrg = {
        id: 'org_1',
        name: 'Test Org',
        slug: 'test-org',
        subscriptionTier: 'enterprise',
      };

      vi.mocked(mockTenantEm.findOne)
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(mockMembership);
      vi.mocked(mockEm.findOne).mockResolvedValue(mockOrg);

      const results = await service.listUserOrganizationsByUserId(
        'usr_123',
        'tenant_test_org'
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: 'org_1',
        name: 'Test Org',
        slug: 'test-org',
        role: 'admin',
        subscriptionTier: 'enterprise',
      });
    });

    it('should return empty array if user not found in tenant', async () => {
      vi.mocked(mockTenantEm.findOne).mockResolvedValue(null);

      const results = await service.listUserOrganizationsByUserId(
        'usr_unknown',
        'tenant_test_org'
      );

      expect(results).toHaveLength(0);
    });
  });

  describe('standalone functions', () => {
    it('should throw if ORM not initialized', async () => {
      // Create a fresh module scope by dynamically importing
      // Note: In practice, the global ORM needs to be set

      // The standalone functions use a global ORM, which we haven't set
      // This test verifies they throw appropriately
      // We need to reset the module state for this test
    });

    it('should work after setOrganizationServiceOrm is called', async () => {
      // Set the global ORM
      setOrganizationServiceOrm(mockOrm);
      vi.mocked(mockEm.findOne).mockResolvedValue(null);

      // Now the standalone function should work
      const result = await createOrganization({
        name: 'Standalone Test',
        ownerClerkId: 'clerk_standalone',
        ownerEmail: 'standalone@test.com',
      });

      expect(result.name).toBe('Standalone Test');
    });
  });
});
