import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createIngestorRouter } from './ingestor.js';
import { StagingService, RequirementType, RequirementSeverity, ConsensusStatus } from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import type { MikroORM } from '@eurocomply/database';
import type { Env } from '../../app.js';

describe('Ingestor Citation API Integration', () => {
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

  describe('PDF Coordinate Flow', () => {
    it('should_preserve_pdf_coordinates_in_staging_and_api_response', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      // Create staging regulation with PDF coordinates
      const em = orm.em.fork();
      const stagingService = new StagingService(em);

      const pdfCoordinates = {
        page: 5,
        bbox: [72.0, 150.5, 520.0, 180.2],
      };

      const regulation = await stagingService.createStagingRegulation({
        code: 'CITATION_TEST',
        name: 'Citation Test Regulation',
        sourceUrl: 'https://example.com/test.pdf',
        sourceType: 'EUR_LEX',
        primaryPayload: {},
        actorId: 'test_user',
        requirements: [
          {
            code: 'REQ_COORD',
            name: 'Requirement with PDF Coordinates',
            type: RequirementType.SUBSTANCE_SCREEN,
            severity: RequirementSeverity.BLOCKER,
            confidenceScore: 0.97,
            consensusStatus: ConsensusStatus.MATCH,
            pdfCoordinates,
          },
        ],
      });

      // Fetch via API and verify coordinates are included
      const testApp = createTestApp();
      const res = await testApp.request(`/ingestor/staging/${regulation.id}`);

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.data.requirements).toHaveLength(1);

      const reqInResponse = data.data.requirements[0];
      expect(reqInResponse.pdfCoordinates).toBeDefined();
      expect(reqInResponse.pdfCoordinates.page).toBe(5);
      expect(reqInResponse.pdfCoordinates.bbox).toEqual([72.0, 150.5, 520.0, 180.2]);
    });

    it('should_handle_requirements_without_pdf_coordinates', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      const em = orm.em.fork();
      const stagingService = new StagingService(em);

      const regulation = await stagingService.createStagingRegulation({
        code: 'NO_COORD_TEST',
        name: 'No Coordinates Test',
        sourceUrl: 'https://example.com/text-only',
        sourceType: 'MANUAL',
        primaryPayload: {},
        actorId: 'test_user',
        requirements: [
          {
            code: 'REQ_NO_COORD',
            name: 'Requirement without PDF Coordinates',
            type: RequirementType.DECLARATION,
            severity: RequirementSeverity.WARNING,
            confidenceScore: 0.95,
            consensusStatus: ConsensusStatus.MATCH,
            // No pdfCoordinates
          },
        ],
      });

      const testApp = createTestApp();
      const res = await testApp.request(`/ingestor/staging/${regulation.id}`);

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      // Note: pdfCoordinates is null (not undefined) because JSON serialization converts undefined to null
      expect(data.data.requirements[0].pdfCoordinates).toBeNull();
    });

    it('should_preserve_multiple_requirements_with_different_coordinates', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      const em = orm.em.fork();
      const stagingService = new StagingService(em);

      const regulation = await stagingService.createStagingRegulation({
        code: 'MULTI_COORD_TEST',
        name: 'Multiple Coordinates Test',
        sourceUrl: 'https://example.com/multi.pdf',
        sourceType: 'EUR_LEX',
        primaryPayload: {},
        actorId: 'test_user',
        requirements: [
          {
            code: 'REQ_1',
            name: 'First Requirement',
            type: RequirementType.SUBSTANCE_SCREEN,
            confidenceScore: 0.98,
            consensusStatus: ConsensusStatus.MATCH,
            pdfCoordinates: { page: 1, bbox: [50, 100, 400, 130] },
          },
          {
            code: 'REQ_2',
            name: 'Second Requirement',
            type: RequirementType.SUBSTANCE_SCREEN,
            confidenceScore: 0.96,
            consensusStatus: ConsensusStatus.MATCH,
            pdfCoordinates: { page: 3, bbox: [72, 250, 520, 280] },
          },
          {
            code: 'REQ_3',
            name: 'Third Requirement (no coords)',
            type: RequirementType.DECLARATION,
            confidenceScore: 0.94,
            consensusStatus: ConsensusStatus.SHADOW_MISSING,
            // No pdfCoordinates - simulating text-only extraction
          },
        ],
      });

      const testApp = createTestApp();
      const res = await testApp.request(`/ingestor/staging/${regulation.id}`);

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.data.requirements).toHaveLength(3);

      // First requirement on page 1
      expect(data.data.requirements[0].pdfCoordinates).toBeDefined();
      expect(data.data.requirements[0].pdfCoordinates.page).toBe(1);

      // Second requirement on page 3
      expect(data.data.requirements[1].pdfCoordinates).toBeDefined();
      expect(data.data.requirements[1].pdfCoordinates.page).toBe(3);

      // Third requirement has no coordinates (null in JSON)
      expect(data.data.requirements[2].pdfCoordinates).toBeNull();
    });
  });
});
