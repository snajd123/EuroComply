import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
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

    /**
     * REGRESSION TEST: Catches missing `populate: ['requirements']` in listStagingRegulations.
     *
     * Uses FRESH EntityManager to create data, then makes API request which uses
     * a DIFFERENT EntityManager. This catches issues where:
     * - Collections aren't populated (MikroORM identity map hides this in same-EM tests)
     * - Requirements.length fails on uninitialized Collection
     */
    it('should_return_staging_regulations_with_requirement_count_using_fresh_em', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      // Create data with a fresh EntityManager (simulates separate request)
      const setupEm = orm.em.fork();
      const stagingService = new StagingService(setupEm);
      await stagingService.createStagingRegulation({
        code: 'FRESH_EM_TEST',
        name: 'Fresh EM Test Regulation',
        sourceUrl: 'https://example.com/test',
        sourceType: 'EUR_LEX',
        primaryPayload: {},
        actorId: 'test_user',
        requirements: [
          {
            code: 'REQ_1',
            name: 'Test Requirement 1',
            type: RequirementType.SUBSTANCE_SCREEN,
            severity: RequirementSeverity.WARNING,
            confidenceScore: 0.95,
            consensusStatus: ConsensusStatus.MATCH,
          },
          {
            code: 'REQ_2',
            name: 'Test Requirement 2',
            type: RequirementType.SUBSTANCE_SCREEN,
            severity: RequirementSeverity.WARNING,
            confidenceScore: 0.90,
            consensusStatus: ConsensusStatus.LOW_CONFIDENCE,
          },
        ],
      });

      // Make API request (uses DIFFERENT EntityManager via orm.em.fork())
      const testApp = createTestApp();
      const res = await testApp.request('/ingestor/staging');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].code).toBe('FRESH_EM_TEST');
      // This assertion catches the missing populate bug
      expect(data.data[0].requirementCount).toBe(2);
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

      // Save and clear env vars for this test
      const savedAnthropicKey = process.env['ANTHROPIC_API_KEY'];
      const savedGeminiKey = process.env['GEMINI_API_KEY'];
      delete process.env['ANTHROPIC_API_KEY'];
      delete process.env['GEMINI_API_KEY'];

      try {
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
      } finally {
        // Restore env vars
        if (savedAnthropicKey) process.env['ANTHROPIC_API_KEY'] = savedAnthropicKey;
        if (savedGeminiKey) process.env['GEMINI_API_KEY'] = savedGeminiKey;
      }
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

    /**
     * REGRESSION TEST: Catches .url() validation rejecting non-URL sourceUrl.
     *
     * Real AI models may return identifiers like "manual-entry" or document names
     * instead of valid URLs. The schema must accept any string, not just URLs.
     */
    it('should_accept_non_url_source_identifiers_from_extraction', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      // Stub that returns a non-URL sourceUrl (realistic AI behavior)
      const stubClaudeExtractor = {
        extract: async () => ({
          regulationMetadata: {
            code: 'MANUAL-2024',
            name: 'Manually Entered Regulation',
            sourceUrl: 'manual-entry',  // NOT a valid URL - this is realistic
          },
          requirements: [
            {
              substanceName: 'Test Substance',
              casNumber: '1234-56-7',
              thresholdValue: 0.1,
              unit: 'PERCENT_BY_WEIGHT',
              operator: 'LT',
              legalReference: 'Section 1',
              confidenceScore: 0.95,
              reasoning: 'Test',
            },
          ],
          extractionMetadata: {
            model: 'claude-sonnet-4-20250514',
            extractedAt: new Date().toISOString(),
            totalRequirements: 1,
            avgConfidence: 0.95,
          },
        }),
      } as unknown as ClaudeExtractor;

      const stubGeminiShadow = {
        extract: async () => [
          { cas: '1234-56-7', threshold: 0.1, unit: 'PERCENT_BY_WEIGHT' },
        ],
      } as unknown as GeminiShadow;

      const stubComparator = {
        compare: () => [{ requirementIndex: 0, status: 'MATCH' as const }],
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
          sourceUrl: 'manual-entry',
          sourceType: 'MANUAL',
          documentText: 'Test document with manual entry.',
        }),
      });

      // Should succeed, not fail with "Invalid url"
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.regulationCode).toBe('MANUAL-2024');
    });

    /**
     * REGRESSION TEST: Catches Zod .optional() vs .nullish() issues.
     *
     * Real AI models return `null` for missing optional fields, not `undefined`.
     * Zod's .optional() only accepts undefined, so we need .nullish().
     */
    it('should_accept_null_values_for_optional_fields_from_extraction', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      // Stub that returns null for optional fields (realistic AI behavior)
      const stubClaudeExtractor = {
        extract: async () => ({
          regulationMetadata: {
            code: 'NULL-TEST-2024',
            name: 'Null Fields Test',
            sourceUrl: null,        // null, not undefined
            version: null,          // null, not undefined
            effectiveDate: null,    // null, not undefined
            jurisdiction: null,     // null, not undefined
          },
          requirements: [
            {
              substanceName: 'Lead',
              casNumber: '7439-92-1',
              ecNumber: null,           // null
              operator: null,           // null
              thresholdValue: null,     // null
              unit: null,               // null
              scope: null,              // null
              legalReference: 'Test reference',
              pdfCoordinates: null,     // null
              confidenceScore: 0.9,
              reasoning: 'Test with nulls',
              allowsExemption: null,    // null
              exemptionConditions: null, // null
            },
          ],
          extractionMetadata: {
            model: null,
            extractedAt: null,
            totalRequirements: null,
            avgConfidence: null,
          },
        }),
      } as unknown as ClaudeExtractor;

      const stubGeminiShadow = {
        extract: async () => [],
      } as unknown as GeminiShadow;

      const stubComparator = {
        compare: () => [{ requirementIndex: 0, status: 'SHADOW_MISSING' as const }],
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
          sourceUrl: 'null-test',
          sourceType: 'MANUAL',
          documentText: 'Test document with fields AI leaves as null.',
        }),
      });

      // Should succeed, not fail with Zod validation errors
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.regulationCode).toBe('NULL-TEST-2024');
    });

    it('should_reject_request_with_neither_documentText_nor_fileId', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      const testApp = createTestApp();
      const res = await testApp.request('/ingestor/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: 'https://example.com/test',
          sourceType: 'EUR_LEX',
          // No documentText or fileId
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
    });
  });

  describe('POST /ingestor/extract with fileId', () => {
    let tempDir: string;

    beforeEach(() => {
      // Create a temp directory for test PDF files
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingestor-test-'));
    });

    afterEach(() => {
      // Clean up temp directory
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
    });

    // Minimal valid PDF content (PDF magic bytes + minimal structure)
    const MINIMAL_PDF = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\nxref\n0 3\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \ntrailer<</Size 3/Root 1 0 R>>\nstartxref\n106\n%%EOF',
      'utf-8'
    );

    it('should_extract_from_pdf_file_when_fileId_provided', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      // Create a test PDF file with valid CUID2-like fileId
      const fileId = 'abcdefghijklmnopqrstuv'; // 22 chars, valid CUID2 format
      const filePath = path.join(tempDir, `${fileId}.pdf`);
      fs.writeFileSync(filePath, MINIMAL_PDF);

      // Create stub extractors
      const stubClaudeExtractor = {
        extract: async () => {
          throw new Error('Should not be called for PDF extraction');
        },
        extractFromPdf: async () => ({
          regulationMetadata: {
            code: 'PDF-TEST-2024',
            name: 'PDF Test Regulation',
            sourceUrl: 'pdf-file',
          },
          requirements: [
            {
              substanceName: 'Cadmium',
              casNumber: '7440-43-9',
              thresholdValue: 0.01,
              unit: 'PERCENT_BY_WEIGHT',
              operator: 'LT',
              legalReference: 'Page 5, Section 3.2',
              pdfCoordinates: { page: 5, bbox: [100, 200, 400, 250] },
              confidenceScore: 0.95,
              reasoning: 'Cadmium restriction extracted from PDF',
            },
          ],
          extractionMetadata: {
            model: 'claude-sonnet-4-20250514',
            extractedAt: new Date().toISOString(),
            totalRequirements: 1,
            avgConfidence: 0.95,
          },
        }),
      } as unknown as ClaudeExtractor;

      const stubGeminiShadow = {
        extract: async () => [],
      } as unknown as GeminiShadow;

      const stubComparator = {
        compare: () => [{ requirementIndex: 0, status: 'SHADOW_MISSING' as const }],
      } as unknown as Comparator;

      // Create router with injected extractors and temp uploads dir
      const testApp = new Hono<Env>();
      const routerOptions: IngestorRouterOptions = {
        orm,
        claudeExtractor: stubClaudeExtractor,
        geminiShadow: stubGeminiShadow,
        comparator: stubComparator,
        uploadsDir: tempDir,
      };
      testApp.route('/ingestor', createIngestorRouter(routerOptions));

      const res = await testApp.request('/ingestor/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          sourceType: 'MANUAL',
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.stagingRegulationId).toBeDefined();
      expect(data.data.regulationCode).toBe('PDF-TEST-2024');
      expect(data.data.requirementCount).toBe(1);
      expect(data.data.consensusSummary.shadowMissing).toBe(1);
    });

    it('should_return_404_when_pdf_file_not_found', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      const stubClaudeExtractor = {
        extractFromPdf: async () => ({ regulationMetadata: {}, requirements: [] }),
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
        uploadsDir: tempDir,
      }));

      const res = await testApp.request('/ingestor/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: 'nonexistentfileidentif', // Valid format but doesn't exist
          sourceType: 'MANUAL',
        }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
      expect(data.error.message).toBe('PDF file not found');
    });

    it('should_reject_invalid_fileId_format', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      const stubClaudeExtractor = {
        extractFromPdf: async () => ({ regulationMetadata: {}, requirements: [] }),
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
        uploadsDir: tempDir,
      }));

      const res = await testApp.request('/ingestor/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: '../../../etc/passwd', // Path traversal attempt
          sourceType: 'MANUAL',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('BAD_REQUEST');
      expect(data.error.message).toBe('Invalid fileId format');
    });

    it('should_use_sourceUrl_when_provided_with_fileId', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      const fileId = 'abcdefghijklmnopqrstuv';
      const filePath = path.join(tempDir, `${fileId}.pdf`);
      fs.writeFileSync(filePath, MINIMAL_PDF);

      let capturedSourceIdentifier: string | undefined;

      const stubClaudeExtractor = {
        extractFromPdf: async (_buffer: Buffer, sourceIdentifier: string) => {
          capturedSourceIdentifier = sourceIdentifier;
          return {
            regulationMetadata: {
              code: 'URL-TEST-2024',
              name: 'URL Test Regulation',
              sourceUrl: sourceIdentifier,
            },
            requirements: [],
            extractionMetadata: {},
          };
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
        uploadsDir: tempDir,
      }));

      const res = await testApp.request('/ingestor/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          sourceUrl: 'https://example.com/regulation.pdf',
          sourceType: 'EUR_LEX',
        }),
      });

      expect(res.status).toBe(201);
      expect(capturedSourceIdentifier).toBe('https://example.com/regulation.pdf');
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
