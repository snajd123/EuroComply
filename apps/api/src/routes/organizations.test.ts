import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { organizationsRouter, clearOrganizationsStore } from './organizations.js';

interface OrganizationResponse {
  data: {
    id: string;
    name: string;
    slug: string;
    schemaName: string;
    clerkOrgId?: string;
    regulatoryAdvisorEnabled: boolean;
    enforcementMode: 'ENFORCING' | 'SILENT';
    captureComplianceInSilentMode: boolean;
    provisioningStatus: string;
    createdAt: string;
    updatedAt: string;
  };
}

interface OrganizationListResponse {
  data: OrganizationResponse['data'][];
  meta: { total: number };
}

interface ErrorResponse {
  error: string;
  message: string;
}

describe('organizations routes', () => {
  const app = new Hono();
  app.route('/organizations', organizationsRouter);

  beforeEach(() => {
    clearOrganizationsStore();
  });

  describe('GET /organizations', () => {
    it('returns empty array initially', async () => {
      const res = await app.request('/organizations');
      expect(res.status).toBe(200);
      const data = (await res.json()) as OrganizationListResponse;
      expect(data).toEqual({ data: [], meta: { total: 0 } });
    });
  });

  describe('POST /organizations', () => {
    it('validates required fields', async () => {
      const res = await app.request('/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('accepts valid organization data', async () => {
      const res = await app.request('/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Acme Corp',
          slug: 'acme-corp',
        }),
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as OrganizationResponse;
      expect(data.data.name).toBe('Acme Corp');
      expect(data.data.slug).toBe('acme-corp');
      expect(data.data.schemaName).toBe('tenant_acme_corp');
      expect(data.data.id).toBeDefined();
    });

    it('validates slug format', async () => {
      const res = await app.request('/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Invalid Corp',
          slug: 'Invalid Slug!', // Invalid characters
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /organizations/:id', () => {
    it('returns 404 for unknown ID', async () => {
      const res = await app.request('/organizations/unknown-id-12345');
      expect(res.status).toBe(404);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe('Not Found');
    });

    it('returns organization by ID', async () => {
      // First create an organization
      const createRes = await app.request('/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Org',
          slug: 'test-org',
        }),
      });
      const createData = (await createRes.json()) as OrganizationResponse;
      const orgId = createData.data.id;

      // Then fetch it by ID
      const res = await app.request(`/organizations/${orgId}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as OrganizationResponse;
      expect(data.data.id).toBe(orgId);
      expect(data.data.name).toBe('Test Org');
    });
  });
});
