import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from './app.js';
import { clearProductsStore } from './routes/products.js';
import { clearOrganizationsStore } from './routes/organizations.js';

// Type definitions for API responses
interface HealthResponse {
  status: string;
}

interface ApiInfoResponse {
  message: string;
}

interface OrganizationResponse {
  data: {
    id: string;
    name: string;
    slug: string;
    schemaName: string;
  };
}

interface ProductsListResponse {
  data: Array<{
    id: string;
    name: string;
    categoryId: string;
    tenantId: string;
  }>;
}

function createTestToken(schemaName: string, userId: string): string {
  const payload = btoa(JSON.stringify({ schema_name: schemaName, sub: userId }));
  return `header.${payload}.signature`;
}

const TEST_ADMIN_KEY = 'test-admin-key-12345';

describe('EuroComply API E2E', () => {
  // Set admin key for testing
  process.env['ADMIN_API_KEY'] = TEST_ADMIN_KEY;
  const app = createApp();

  beforeEach(() => {
    clearProductsStore();
    clearOrganizationsStore();
  });

  describe('Health Check', () => {
    it('GET /health returns healthy status', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);
      const data = (await res.json()) as HealthResponse;
      expect(data.status).toBe('healthy');
    });
  });

  describe('API Info', () => {
    it('GET /api/v1 returns API info', async () => {
      const res = await app.request('/api/v1');
      expect(res.status).toBe(200);
      const data = (await res.json()) as ApiInfoResponse;
      expect(data.message).toBe('EuroComply API v1');
    });
  });

  describe('Organization Flow (Admin-Only)', () => {
    it('rejects requests without admin key', async () => {
      const res = await app.request('/api/v1/admin/organizations');
      expect(res.status).toBe(401);
    });

    it('creates and retrieves organization with admin key', async () => {
      // Create
      const createRes = await app.request('/api/v1/admin/organizations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': TEST_ADMIN_KEY,
        },
        body: JSON.stringify({
          name: 'E2E Test Corp',
          slug: 'e2e-test',
        }),
      });
      expect(createRes.status).toBe(201);
      const created = (await createRes.json()) as OrganizationResponse;
      const orgId = created.data.id;
      expect(created.data.slug).toBe('e2e-test');
      expect(created.data.schemaName).toBe('tenant_e2e_test');

      // Retrieve
      const getRes = await app.request(`/api/v1/admin/organizations/${orgId}`, {
        headers: { 'X-Admin-Key': TEST_ADMIN_KEY },
      });
      expect(getRes.status).toBe(200);
      const retrieved = (await getRes.json()) as OrganizationResponse;
      expect(retrieved.data.name).toBe('E2E Test Corp');
    });
  });

  describe('Product Flow (Tenant-Scoped)', () => {
    it('creates products isolated by tenant', async () => {
      const token1 = createTestToken('tenant_corp1', 'user1');
      const token2 = createTestToken('tenant_corp2', 'user2');

      // Create product in tenant 1
      const create1 = await app.request('/api/v1/products', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token1}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Corp1 Product',
          categoryId: 'cat1',
        }),
      });
      expect(create1.status).toBe(201);

      // Create product in tenant 2
      const create2 = await app.request('/api/v1/products', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token2}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Corp2 Product',
          categoryId: 'cat2',
        }),
      });
      expect(create2.status).toBe(201);

      // List tenant 1 - should only see their product
      const list1 = await app.request('/api/v1/products', {
        headers: { Authorization: `Bearer ${token1}` },
      });
      const data1 = (await list1.json()) as ProductsListResponse;
      expect(data1.data.length).toBe(1);
      expect(data1.data[0]?.name).toBe('Corp1 Product');

      // List tenant 2 - should only see their product
      const list2 = await app.request('/api/v1/products', {
        headers: { Authorization: `Bearer ${token2}` },
      });
      const data2 = (await list2.json()) as ProductsListResponse;
      expect(data2.data.length).toBe(1);
      expect(data2.data[0]?.name).toBe('Corp2 Product');
    });
  });
});
