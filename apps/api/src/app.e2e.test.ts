import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from './app.js';
import { clearProductsStore } from './routes/products.js';

function createTestToken(schemaName: string, userId: string): string {
  const payload = btoa(JSON.stringify({ schema_name: schemaName, sub: userId }));
  return `header.${payload}.signature`;
}

describe('EuroComply API E2E', () => {
  const app = createApp();

  beforeEach(() => {
    clearProductsStore();
  });

  describe('Health Check', () => {
    it('GET /health returns healthy status', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('healthy');
    });
  });

  describe('API Info', () => {
    it('GET /api/v1 returns API info', async () => {
      const res = await app.request('/api/v1');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toBe('EuroComply API v1');
    });
  });

  describe('Organization Flow', () => {
    it('creates and retrieves organization', async () => {
      // Create
      const createRes = await app.request('/api/v1/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'E2E Test Corp',
          schemaName: 'tenant_e2e',
        }),
      });
      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      const orgId = created.data.id;

      // Retrieve
      const getRes = await app.request(`/api/v1/organizations/${orgId}`);
      expect(getRes.status).toBe(200);
      const retrieved = await getRes.json();
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
      const data1 = await list1.json();
      expect(data1.data.length).toBe(1);
      expect(data1.data[0].name).toBe('Corp1 Product');

      // List tenant 2 - should only see their product
      const list2 = await app.request('/api/v1/products', {
        headers: { Authorization: `Bearer ${token2}` },
      });
      const data2 = await list2.json();
      expect(data2.data.length).toBe(1);
      expect(data2.data[0].name).toBe('Corp2 Product');
    });
  });
});
