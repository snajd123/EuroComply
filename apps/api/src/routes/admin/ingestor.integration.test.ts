import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createIngestorRouter, type IngestorRouterOptions } from './ingestor.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import type { MikroORM } from '@eurocomply/database';
import { StagingService, RequirementType, RequirementSeverity, ConsensusStatus } from '@eurocomply/database';
import type { Env } from '../../app.js';
import type { ClaudeExtractor, GeminiShadow, Comparator } from '@eurocomply/ingestor';

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
    // Clean up published regulations for publish test isolation
    await em.execute('DELETE FROM public.requirement');
    await em.execute('DELETE FROM public.regulation');
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

    it('should_return_500_when_api_keys_not_configured', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      // Create router without extractors and without env vars
      const testApp = new Hono<Env>();
      testApp.route('/ingestor', createIngestorRouter({ orm }));

      const res = await testApp.request('/ingestor/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32006R1907',
          sourceType: 'EUR_LEX',
          documentText: 'Test document content',
        }),
      });

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('CONFIG_ERROR');
      expect(data.error.message).toContain('API keys not configured');
      // Ensure error message doesn't expose actual API key values
      expect(data.error.message).not.toMatch(/sk-[a-zA-Z0-9]/);
      expect(data.error.message).not.toMatch(/AIza[a-zA-Z0-9]/);
    });

    it('should_call_pipeline_and_return_staging_regulation_when_extractors_injected', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      // Create stub extractors that return predictable results
      const stubClaudeExtractor = {
        extract: async () => ({
          regulationMetadata: {
            code: 'REACH-2006',
            name: 'REACH Regulation',
            sourceUrl: 'https://example.com/reach',
          },
          requirements: [
            {
              substanceName: 'Lead',
              casNumber: '7439-92-1',
              thresholdValue: 0.1,
              unit: 'PERCENT_BY_WEIGHT',
              operator: 'LT',
              legalReference: 'Annex XVII, Entry 63',
              confidenceScore: 0.97,
              reasoning: 'Lead restriction in consumer articles',
            },
          ],
          extractionMetadata: {
            model: 'claude-sonnet-4-20250514',
            extractedAt: new Date().toISOString(),
            totalRequirements: 1,
            avgConfidence: 0.97,
          },
        }),
      } as unknown as ClaudeExtractor;

      const stubGeminiShadow = {
        extract: async () => [
          { cas: '7439-92-1', threshold: 0.1, unit: 'PERCENT_BY_WEIGHT' },
        ],
      } as unknown as GeminiShadow;

      const stubComparator = {
        compare: () => [{ requirementIndex: 0, status: 'MATCH' as const }],
      } as unknown as Comparator;

      // Create router with injected extractors
      const testApp = new Hono<Env>();
      const routerOptions: IngestorRouterOptions = {
        orm,
        claudeExtractor: stubClaudeExtractor,
        geminiShadow: stubGeminiShadow,
        comparator: stubComparator,
      };
      testApp.route('/ingestor', createIngestorRouter(routerOptions));

      const res = await testApp.request('/ingestor/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: 'https://example.com/reach',
          sourceType: 'EUR_LEX',
          documentText: 'Test document with Lead restrictions under Annex XVII Entry 63.',
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.stagingRegulationId).toBeDefined();
      expect(data.data.regulationCode).toBe('REACH-2006');
      expect(data.data.requirementCount).toBe(1);
      expect(data.data.consensusSummary).toBeDefined();
      expect(data.data.consensusSummary.match).toBe(1);
    });

    it('should_handle_extraction_errors_without_exposing_api_keys', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      // Create stub extractor that throws an error
      const stubClaudeExtractor = {
        extract: async () => {
          throw new Error('API error: invalid_api_key sk-test-key-12345');
        },
      } as unknown as ClaudeExtractor;

      const stubGeminiShadow = {
        extract: async () => [],
      } as unknown as GeminiShadow;

      const stubComparator = {
        compare: () => [],
      } as unknown as Comparator;

      const testApp = new Hono<Env>();
      testApp.route('/ingestor', createIngestorRouter({
        orm,
        claudeExtractor: stubClaudeExtractor,
        geminiShadow: stubGeminiShadow,
        comparator: stubComparator,
      }));

      const res = await testApp.request('/ingestor/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: 'https://example.com/reach',
          sourceType: 'EUR_LEX',
          documentText: 'Test document',
        }),
      });

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INTERNAL_ERROR');
      // The error message should not contain API key patterns
      expect(data.error.message).not.toMatch(/sk-[a-zA-Z0-9]/);
      expect(data.error.message).not.toMatch(/AIza[a-zA-Z0-9]/);
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
