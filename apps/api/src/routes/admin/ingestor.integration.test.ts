import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createIngestorRouter } from './ingestor.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import type { MikroORM } from '@eurocomply/database';
import { StagingService, RequirementType, RequirementSeverity, ConsensusStatus } from '@eurocomply/database';
import type { Env } from '../../app.js';

describe('Ingestor Admin API Integration', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) return;
    orm = await setupTestDb();
  });

  afterAll(async () => {
    if (orm) await teardownTestDb();
  });

  beforeEach(async () => {
    if (!(await isDatabaseAvailable())) return;
    const em = orm.em.fork();
    await em.execute('DELETE FROM public.ingestion_audit_log');
    await em.execute('DELETE FROM public.staging_requirement');
    await em.execute('DELETE FROM public.staging_regulation');
  });

  function createTestApp(): Hono<Env> {
    const testApp = new Hono<Env>();
    testApp.route('/ingestor', createIngestorRouter({ orm }));
    return testApp;
  }

  describe('GET /ingestor/staging', () => {
    it('should_return_empty_list_when_no_staging_regulations', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      const testApp = createTestApp();
      const res = await testApp.request('/ingestor/staging');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });
  });

  describe('POST /ingestor/extract', () => {
    it('should_reject_missing_source_url', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      const testApp = createTestApp();
      const res = await testApp.request('/ingestor/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceType: 'EUR_LEX' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /ingestor/staging/:id/publish', () => {
    it('should_publish_approved_staging_regulation', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      // Create and approve a staging regulation
      const em = orm.em.fork();
      const stagingService = new StagingService(em);
      const regulation = await stagingService.createStagingRegulation({
        code: 'PUBLISH_API_TEST',
        name: 'Publish API Test',
        sourceUrl: 'https://example.com',
        sourceType: 'EUR_LEX',
        primaryPayload: {},
        requirements: [
          {
            code: 'REQ_1',
            name: 'Test Requirement',
            type: RequirementType.DECLARATION,
            severity: RequirementSeverity.WARNING,
            confidenceScore: 0.99,
            consensusStatus: ConsensusStatus.MATCH,
          },
        ],
      });

      // Get the created requirements
      const requirements = regulation.requirements.getItems();

      // Approve the requirement
      await stagingService.approveRequirement(requirements[0].id, 'test_admin');

      // Publish
      const testApp = createTestApp();
      const res = await testApp.request(`/ingestor/staging/${regulation.id}/publish`, {
        method: 'POST',
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.regulationId).toBeDefined();
      expect(data.data.requirementCount).toBe(1);
    });
  });
});
