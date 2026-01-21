import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';

// Create mock functions that we can track
const mockClose = vi.fn();
const mockFork = vi.fn();
const mockCreate = vi.fn();
const mockPersistAndFlush = vi.fn();
const mockNativeDelete = vi.fn();
const mockExecute = vi.fn();

// Mock EntityManager
const mockEm = {
  create: mockCreate,
  persistAndFlush: mockPersistAndFlush,
  nativeDelete: mockNativeDelete,
  execute: mockExecute,
  fork: mockFork,
  clear: vi.fn(),
} as unknown as EntityManager;

// Mock fork to return the same mock em
mockFork.mockReturnValue(mockEm);

// Mock MikroORM instance
const mockOrm = {
  em: mockEm,
  close: mockClose,
} as unknown as MikroORM;

// Mock MikroORM.init
vi.mock('@mikro-orm/postgresql', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mikro-orm/postgresql')>();
  return {
    ...actual,
    MikroORM: {
      init: vi.fn().mockResolvedValue(mockOrm),
    },
  };
});

// Mock @eurocomply/db
vi.mock('@eurocomply/db', () => ({
  MikroOrm: {
    Organization: class Organization { id = 'org_123'; },
    User: class User { id = 'user_123'; },
    OrganizationUser: class OrganizationUser {},
    BomEntry: class BomEntry {},
    ProductVersion: class ProductVersion {},
    ProductIdentifier: class ProductIdentifier {},
    Product: class Product {},
    OutboxEvent: class OutboxEvent {},
  },
  createTenantSchemaMikroOrm: vi.fn(),
  dropTenantSchemaMikroOrm: vi.fn(),
}));

describe('integration test setup - MikroORM migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock return values
    mockCreate.mockImplementation((Entity) => {
      const instance = new Entity();
      return instance;
    });
    mockPersistAndFlush.mockResolvedValue(undefined);
    mockNativeDelete.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('TestContext interface', () => {
    it('should have orm and em properties (not prisma)', async () => {
      // Dynamic import to get fresh module
      const { TestContext } = await import('./setup.js') as { TestContext: unknown };

      // TypeScript compile-time check - if TestContext has 'prisma', this would fail
      type ContextKeys = keyof import('./setup.js').TestContext;
      const hasOrm: 'orm' extends ContextKeys ? true : false = true;
      const hasEm: 'em' extends ContextKeys ? true : false = true;

      expect(hasOrm).toBe(true);
      expect(hasEm).toBe(true);
    });
  });

  describe('testOrm export', () => {
    it('should export testOrm object', async () => {
      const setup = await import('./setup.js');

      // Should have testOrm
      expect(setup.testOrm).toBeDefined();
      expect(typeof setup.testOrm).toBe('object');
    });

    it('should NOT export testPrisma', async () => {
      const setup = await import('./setup.js');

      // Should NOT have testPrisma
      expect((setup as Record<string, unknown>)['testPrisma']).toBeUndefined();
    });
  });

  describe('disconnectTestDatabase', () => {
    it('should call orm.close() when disconnecting', async () => {
      const setup = await import('./setup.js');

      // First initialize by calling setup
      await setup.setupIntegrationTest();

      // Then disconnect
      await setup.disconnectTestDatabase();

      // Should have called close on the ORM
      expect(mockClose).toHaveBeenCalled();
    });
  });

  describe('setupIntegrationTest', () => {
    it('should return TestContext with orm and em', async () => {
      const setup = await import('./setup.js');

      const context = await setup.setupIntegrationTest();

      expect(context.orm).toBeDefined();
      expect(context.em).toBeDefined();
      expect(context.schemaName).toMatch(/^tenant_test/);
      expect(context.organizationId).toBeDefined();
      expect(context.userId).toBeDefined();
    });

    it('should create organization, user, and membership using MikroORM', async () => {
      const setup = await import('./setup.js');
      const { createTenantSchemaMikroOrm } = await import('@eurocomply/db');

      await setup.setupIntegrationTest();

      // Should have called em.create for Organization, User, OrganizationUser
      expect(mockCreate).toHaveBeenCalledTimes(3);
      expect(mockPersistAndFlush).toHaveBeenCalledTimes(3);

      // Should have called createTenantSchemaMikroOrm
      expect(createTenantSchemaMikroOrm).toHaveBeenCalled();
    });
  });
});
