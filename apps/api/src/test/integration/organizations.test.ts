/**
 * Integration tests for Organization Service.
 * Tests against a real PostgreSQL database using MikroORM.
 *
 * NOTE: These tests are skipped until the full MikroORM migration is complete.
 * The test database currently uses Prisma schema which differs from MikroORM entities.
 * Unit tests in organization.service.test.ts provide full coverage of service logic.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, defineConfig, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { MikroOrm, dropTenantSchemaMikroOrm } from '@eurocomply/db';
import {
  OrganizationService,
  setOrganizationServiceOrm,
} from '../../services/organization.service.js';

// Use test database (port 5433 maps to postgres-test container)
const TEST_DATABASE_URL =
  process.env['DATABASE_URL'] ||
  'postgresql://postgres:postgres@localhost:5433/eurocomply_test';

// Extract connection info from URL
function parseDbUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '5432', 10),
    user: parsed.username,
    password: parsed.password,
    dbName: parsed.pathname.slice(1).split('?')[0],
  };
}

// Test context
interface TestContext {
  orm: MikroORM;
  service: OrganizationService;
  createdOrgIds: string[];
  createdSchemaNames: string[];
}

let ctx: TestContext;

/**
 * Creates a MikroORM instance for testing with all entities.
 */
async function createTestOrm(): Promise<MikroORM> {
  const conn = parseDbUrl(TEST_DATABASE_URL);

  return MikroORM.init(
    defineConfig({
      driver: PostgreSqlDriver,
      host: conn.host,
      port: conn.port,
      user: conn.user,
      password: conn.password,
      dbName: conn.dbName,
      schema: 'public',
      entities: [
        MikroOrm.Organization,
        MikroOrm.User,
        MikroOrm.OrganizationUser,
        MikroOrm.OutboxEvent,
      ],
      allowGlobalContext: true,
      debug: process.env['DEBUG_ORM'] === 'true',
    })
  );
}

describe.skip('Organization Service Integration Tests', () => {
  beforeAll(async () => {
    const orm = await createTestOrm();
    const service = new OrganizationService(orm);

    // Also set the global ORM for standalone functions
    setOrganizationServiceOrm(orm);

    ctx = {
      orm,
      service,
      createdOrgIds: [],
      createdSchemaNames: [],
    };
  });

  afterAll(async () => {
    // Cleanup: drop all created tenant schemas and delete orgs
    for (const schemaName of ctx.createdSchemaNames) {
      try {
        await dropTenantSchemaMikroOrm(ctx.orm, schemaName);
      } catch {
        // Ignore errors during cleanup
      }
    }

    // Delete organizations from public schema
    for (const orgId of ctx.createdOrgIds) {
      try {
        const tenantEm = ctx.orm.em.fork();
        const org = await tenantEm.findOne(MikroOrm.Organization, { id: orgId });
        if (org) {
          await tenantEm.removeAndFlush(org);
        }
      } catch {
        // Ignore errors during cleanup
      }
    }

    await ctx.orm.close();
  });

  beforeEach(async () => {
    // Clear entity manager before each test
    ctx.orm.em.clear();
  });

  describe('createOrganization', () => {
    it('should create a new organization with owner', async () => {
      const uniqueSuffix = Date.now();

      const org = await ctx.service.createOrganization({
        name: `Integration Test Org ${uniqueSuffix}`,
        ownerClerkId: `clerk_test_${uniqueSuffix}`,
        ownerEmail: `test-${uniqueSuffix}@example.com`,
        ownerName: 'Test User',
      });

      // Track for cleanup
      ctx.createdOrgIds.push(org.id);
      ctx.createdSchemaNames.push(org.schemaName);

      expect(org).toBeDefined();
      expect(org.name).toBe(`Integration Test Org ${uniqueSuffix}`);
      expect(org.slug).toMatch(/^integration-test-org/);
      expect(org.schemaName).toMatch(/^tenant_integration_test_org/);
      expect(org.subscriptionTier).toBe('starter');
      expect(org.subscriptionStatus).toBe('active');
      expect(org.owner.email).toBe(`test-${uniqueSuffix}@example.com`);
      expect(org.owner.name).toBe('Test User');

      // Verify organization was created in database
      const dbOrg = await ctx.orm.em.fork().findOne(MikroOrm.Organization, { id: org.id });
      expect(dbOrg).not.toBeNull();
      expect(dbOrg?.name).toBe(`Integration Test Org ${uniqueSuffix}`);
    });

    it('should create owner membership with full permissions', async () => {
      const uniqueSuffix = Date.now() + 1;

      const org = await ctx.service.createOrganization({
        name: `Permissions Test Org ${uniqueSuffix}`,
        ownerClerkId: `clerk_perms_${uniqueSuffix}`,
        ownerEmail: `perms-${uniqueSuffix}@example.com`,
        ownerName: 'Permissions Test User',
      });

      // Track for cleanup
      ctx.createdOrgIds.push(org.id);
      ctx.createdSchemaNames.push(org.schemaName);

      // Verify owner membership exists with correct permissions in tenant schema
      const tenantEm = ctx.orm.em.fork({ schema: org.schemaName });
      const membership = await tenantEm.findOne(
        MikroOrm.OrganizationUser,
        { role: 'owner' },
        { populate: ['user'] }
      );

      expect(membership).not.toBeNull();
      expect(membership?.role).toBe('owner');
      expect(membership?.designAuthority).toBe('MANAGER');
      expect(membership?.operationsAuthority).toBe('MANAGER');
      expect(membership?.marketingAuthority).toBe('MANAGER');
      expect(membership?.complianceAuthority).toBe('MANAGER');
    });
  });

  describe('listUserOrganizations', () => {
    it('should list organizations for a user', async () => {
      const uniqueSuffix = Date.now() + 2;
      const clerkId = `clerk_list_${uniqueSuffix}`;

      // Create an organization first
      const org = await ctx.service.createOrganization({
        name: `List Test Org ${uniqueSuffix}`,
        ownerClerkId: clerkId,
        ownerEmail: `list-${uniqueSuffix}@example.com`,
        ownerName: 'List Test User',
      });

      // Track for cleanup
      ctx.createdOrgIds.push(org.id);
      ctx.createdSchemaNames.push(org.schemaName);

      // Clear em to ensure fresh read
      ctx.orm.em.clear();

      const orgs = await ctx.service.listUserOrganizations(clerkId);

      expect(Array.isArray(orgs)).toBe(true);
      expect(orgs.length).toBeGreaterThanOrEqual(1);

      // Should include the test organization
      const testOrg = orgs.find((o) => o.id === org.id);
      expect(testOrg).toBeDefined();
      expect(testOrg?.role).toBe('owner');
    });

    it('should return empty array for user with no organizations', async () => {
      const orgs = await ctx.service.listUserOrganizations('clerk_nonexistent_user_xyz');

      expect(Array.isArray(orgs)).toBe(true);
      expect(orgs.length).toBe(0);
    });
  });

  describe('getOrganization', () => {
    it('should get organization details with owner', async () => {
      const uniqueSuffix = Date.now() + 3;

      // Create an organization first
      const createdOrg = await ctx.service.createOrganization({
        name: `Get Test Org ${uniqueSuffix}`,
        ownerClerkId: `clerk_get_${uniqueSuffix}`,
        ownerEmail: `get-${uniqueSuffix}@example.com`,
        ownerName: 'Get Test User',
      });

      // Track for cleanup
      ctx.createdOrgIds.push(createdOrg.id);
      ctx.createdSchemaNames.push(createdOrg.schemaName);

      // Clear em to ensure fresh read
      ctx.orm.em.clear();

      const org = await ctx.service.getOrganization(createdOrg.id);

      expect(org).toBeDefined();
      expect(org.id).toBe(createdOrg.id);
      expect(org.schemaName).toBe(createdOrg.schemaName);
      expect(org.owner).toBeDefined();
      expect(org.owner.email).toBe(`get-${uniqueSuffix}@example.com`);
    });

    it('should throw error for non-existent organization', async () => {
      await expect(ctx.service.getOrganization('non-existent-id')).rejects.toThrow();
    });
  });
});
