import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from './app.js';
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

const TEST_ADMIN_KEY = 'test-admin-key-12345';

describe('EuroComply API E2E', () => {
  // Set admin key for testing
  process.env['ADMIN_API_KEY'] = TEST_ADMIN_KEY;
  const app = createApp();

  beforeEach(() => {
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

  // NOTE: Products flow tests moved to products.test.ts with proper ORM mocking.
  // Products routes require database injection - no in-memory fallback.
});
