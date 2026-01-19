import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTenantClient, getTenantConnectionManager, type TenantContext } from './client.js';

// Mock PrismaClient
function createMockPrismaClient() {
  const mockClient = {
    $extends: vi.fn().mockImplementation((extension) => {
      // Return a mock extended client with the extension's client methods
      return {
        ...mockClient,
        $tenant: extension.client.$tenant,
        $queryTenant: extension.client.$queryTenant,
        $executeTenant: extension.client.$executeTenant,
      };
    }),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
  };
  return mockClient;
}

describe('createTenantClient', () => {
  it('should create a tenant client with valid context', () => {
    const mockBase = createMockPrismaClient();
    const context: TenantContext = {
      organizationId: 'org_123',
      schemaName: 'tenant_acme',
      userId: 'user_456',
    };

    const client = createTenantClient(mockBase as any, context);

    expect(mockBase.$extends).toHaveBeenCalled();
    expect(client.$tenant).toEqual(context);
  });

  it('should throw for invalid schema name', () => {
    const mockBase = createMockPrismaClient();
    const context: TenantContext = {
      organizationId: 'org_123',
      schemaName: "tenant_'; DROP TABLE--",
      userId: 'user_456',
    };

    expect(() => createTenantClient(mockBase as any, context)).toThrow('Invalid schema name');
  });

  it('should throw for schema name without tenant_ prefix', () => {
    const mockBase = createMockPrismaClient();
    const context: TenantContext = {
      organizationId: 'org_123',
      schemaName: 'public',
      userId: 'user_456',
    };

    expect(() => createTenantClient(mockBase as any, context)).toThrow('Invalid schema name');
  });

  it('should provide $queryTenant method that sets search_path', async () => {
    const mockBase = createMockPrismaClient();
    const context: TenantContext = {
      organizationId: 'org_123',
      schemaName: 'tenant_acme',
      userId: 'user_456',
    };

    const client = createTenantClient(mockBase as any, context);
    await client.$queryTenant('SELECT * FROM users', []);

    expect(mockBase.$queryRawUnsafe).toHaveBeenCalledWith(
      'SET search_path TO "tenant_acme", public; SELECT * FROM users'
    );
  });

  it('should provide $executeTenant method that sets search_path', async () => {
    const mockBase = createMockPrismaClient();
    const context: TenantContext = {
      organizationId: 'org_123',
      schemaName: 'tenant_acme',
      userId: 'user_456',
    };

    const client = createTenantClient(mockBase as any, context);
    await client.$executeTenant('UPDATE users SET active = true', []);

    expect(mockBase.$executeRawUnsafe).toHaveBeenCalledWith(
      'SET search_path TO "tenant_acme", public; UPDATE users SET active = true'
    );
  });
});

describe('TenantConnectionManager', () => {
  it('should return a singleton manager instance', () => {
    const mockBase = createMockPrismaClient();
    const manager1 = getTenantConnectionManager(mockBase as any);
    const manager2 = getTenantConnectionManager(mockBase as any);

    // Should return the same singleton instance
    expect(manager1).toBe(manager2);
  });

  it('should cache clients by organization and user', () => {
    const mockBase = createMockPrismaClient();
    const manager = getTenantConnectionManager(mockBase as any);

    // Use unique context to avoid collision with other tests
    const context: TenantContext = {
      organizationId: 'org_cache_test',
      schemaName: 'tenant_cachetest',
      userId: 'user_cache',
    };

    const client1 = manager.getClient(context);
    const client2 = manager.getClient(context);

    // Should return same cached client (referential equality)
    expect(client1).toBe(client2);
  });

  it('should create different clients for different user contexts', () => {
    const mockBase = createMockPrismaClient();
    const manager = getTenantConnectionManager(mockBase as any);

    // Use unique contexts to avoid collision
    const context1: TenantContext = {
      organizationId: 'org_diff_test',
      schemaName: 'tenant_difftest',
      userId: 'user_diff_1',
    };
    const context2: TenantContext = {
      organizationId: 'org_diff_test',
      schemaName: 'tenant_difftest',
      userId: 'user_diff_2',
    };

    const client1 = manager.getClient(context1);
    const client2 = manager.getClient(context2);

    // Different contexts should return different clients
    expect(client1).not.toBe(client2);
  });

  it('should clear cache and create new client on next access', () => {
    const mockBase = createMockPrismaClient();
    const manager = getTenantConnectionManager(mockBase as any);

    const context: TenantContext = {
      organizationId: 'org_clear_test',
      schemaName: 'tenant_cleartest',
      userId: 'user_clear',
    };

    const client1 = manager.getClient(context);
    manager.clearCache();
    const client2 = manager.getClient(context);

    // After clearing cache, should get a new client instance
    expect(client1).not.toBe(client2);
  });
});
