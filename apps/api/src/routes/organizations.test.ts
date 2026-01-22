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

  // Note: POST /organizations endpoint has been removed.
  // Organizations are created exclusively via Clerk webhooks.
  // The in-memory router still has POST for test utilities, but
  // the database-backed createOrganizationsRouter() does not.

  describe('GET /organizations/:id', () => {
    it('returns 404 for unknown ID', async () => {
      const res = await app.request('/organizations/unknown-id-12345');
      expect(res.status).toBe(404);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toBe('Not Found');
    });

    it('returns organization by ID', async () => {
      // Create organization using in-memory router (test utility)
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
