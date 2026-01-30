/**
 * Ingestor Admin API E2E Tests
 *
 * End-to-end tests that verify the complete PDF extraction flow:
 * - PDF upload
 * - Extraction with fileId
 * - Staging regulation retrieval with pdfFileId
 * - PDF retrieval for viewer
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createIngestorRouter, type IngestorRouterOptions } from './ingestor.js';
import { createIngestorUploadRouter } from './ingestor-upload.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import type { MikroORM } from '@eurocomply/database';
import { StagingService, RequirementType, RequirementSeverity, ConsensusStatus } from '@eurocomply/database';
import type { Env } from '../../app.js';
import type { ClaudeExtractor, GeminiShadow, Comparator } from '@eurocomply/ingestor';

/**
 * Helper to create a minimal valid PDF buffer.
 * A valid PDF starts with %PDF-1.x and ends with %%EOF.
 */
function createMinimalPdf(): Buffer {
  const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
trailer
<< /Size 4 /Root 1 0 R >>
startxref
196
%%EOF`;
  return Buffer.from(pdfContent);
}

/**
 * Helper to create multipart form data with a file.
 */
function createFormData(file: Buffer, filename: string, contentType: string): FormData {
  const formData = new FormData();
  const blob = new Blob([file], { type: contentType });
  formData.append('file', blob, filename);
  return formData;
}

describe('Ingestor Admin API E2E', () => {
  let orm: MikroORM;
  let tempDir: string;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) return;
    orm = await setupTestDb();
  });

  afterAll(async () => {
    if (orm) await teardownTestDb();
  });

  beforeEach(async () => {
    if (!(await isDatabaseAvailable())) return;

    // Create a temp directory for test uploads
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingestor-e2e-test-'));

    // Clean up staging data
    const em = orm.em.fork();
    await em.execute('DELETE FROM public.ingestion_audit_log');
    await em.execute('DELETE FROM public.staging_requirement');
    await em.execute('DELETE FROM public.staging_regulation');
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Creates a test app with both upload and ingestor routes.
   * Optionally injects custom extractors for stubbing.
   */
  function createTestApp(options?: {
    claudeExtractor?: ClaudeExtractor;
    geminiShadow?: GeminiShadow;
    comparator?: Comparator;
  }): Hono<Env> {
    const testApp = new Hono<Env>();

    // Mount upload routes at /admin/ingestor/upload
    testApp.route('/admin/ingestor/upload', createIngestorUploadRouter({ uploadsDir: tempDir }));

    // Mount ingestor routes at /admin/ingestor
    const routerOptions: IngestorRouterOptions = {
      orm,
      uploadsDir: tempDir,
      ...options,
    };
    testApp.route('/admin/ingestor', createIngestorRouter(routerOptions));

    return testApp;
  }

  /**
   * Creates stub extractors that return predictable results with pdfCoordinates.
   */
  function createStubExtractors() {
    const stubClaudeExtractor = {
      extract: async () => {
        throw new Error('Should not be called for PDF extraction');
      },
      extractFromPdf: async () => ({
        regulationMetadata: {
          code: 'E2E-PDF-TEST-2024',
          name: 'E2E PDF Test Regulation',
          sourceUrl: 'pdf-upload',
          jurisdiction: 'EU',
          version: '1.0',
        },
        requirements: [
          {
            substanceName: 'Lead',
            casNumber: '7439-92-1',
            thresholdValue: 0.1,
            unit: 'PERCENT_BY_WEIGHT',
            operator: 'LT',
            legalReference: 'Annex XVII, Entry 63, Page 5',
            pdfCoordinates: { page: 5, bbox: [100, 200, 400, 250] },
            confidenceScore: 0.97,
            reasoning: 'Lead restriction in consumer articles',
          },
          {
            substanceName: 'Cadmium',
            casNumber: '7440-43-9',
            thresholdValue: 0.01,
            unit: 'PERCENT_BY_WEIGHT',
            operator: 'LT',
            legalReference: 'Annex XVII, Entry 23, Page 12',
            pdfCoordinates: { page: 12, bbox: [50, 300, 450, 350] },
            confidenceScore: 0.95,
            reasoning: 'Cadmium restriction in plastics and paints',
          },
        ],
        extractionMetadata: {
          model: 'claude-sonnet-4-20250514',
          extractedAt: new Date().toISOString(),
          totalRequirements: 2,
          avgConfidence: 0.96,
        },
      }),
    } as unknown as ClaudeExtractor;

    const stubGeminiShadow = {
      extract: async () => [
        { cas: '7439-92-1', threshold: 0.1, unit: 'PERCENT_BY_WEIGHT' },
        { cas: '7440-43-9', threshold: 0.01, unit: 'PERCENT_BY_WEIGHT' },
      ],
    } as unknown as GeminiShadow;

    const stubComparator = {
      compare: () => [
        { requirementIndex: 0, status: 'MATCH' as const },
        { requirementIndex: 1, status: 'MATCH' as const },
      ],
    } as unknown as Comparator;

    return { stubClaudeExtractor, stubGeminiShadow, stubComparator };
  }

  // ============================================================================
  // Test Case 1: Upload PDF and return fileId
  // ============================================================================

  describe('POST /admin/ingestor/upload/pdf', () => {
    it('should_upload_pdf_and_return_file_id', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      const pdfBuffer = createMinimalPdf();
      const formData = createFormData(pdfBuffer, 'regulation.pdf', 'application/pdf');
      const { stubClaudeExtractor, stubGeminiShadow, stubComparator } = createStubExtractors();

      const testApp = createTestApp({
        claudeExtractor: stubClaudeExtractor,
        geminiShadow: stubGeminiShadow,
        comparator: stubComparator,
      });

      const res = await testApp.request('/admin/ingestor/upload/pdf', {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.fileId).toBeDefined();
      expect(typeof data.data.fileId).toBe('string');
      expect(data.data.fileId.length).toBeGreaterThanOrEqual(21);
      expect(data.data.filename).toBe('regulation.pdf');
      expect(data.data.size).toBe(pdfBuffer.length);

      // Verify file was saved to disk
      const savedPath = path.join(tempDir, `${data.data.fileId}.pdf`);
      expect(fs.existsSync(savedPath)).toBe(true);
    });
  });

  // ============================================================================
  // Test Case 2: Extract from uploaded PDF file
  // ============================================================================

  describe('POST /admin/ingestor/extract with fileId', () => {
    it('should_extract_from_uploaded_pdf_file', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      const { stubClaudeExtractor, stubGeminiShadow, stubComparator } = createStubExtractors();
      const testApp = createTestApp({
        claudeExtractor: stubClaudeExtractor,
        geminiShadow: stubGeminiShadow,
        comparator: stubComparator,
      });

      // Step 1: Upload PDF
      const pdfBuffer = createMinimalPdf();
      const formData = createFormData(pdfBuffer, 'reach-regulation.pdf', 'application/pdf');

      const uploadRes = await testApp.request('/admin/ingestor/upload/pdf', {
        method: 'POST',
        body: formData,
      });

      expect(uploadRes.status).toBe(201);
      const uploadData = await uploadRes.json();
      const fileId = uploadData.data.fileId;

      // Step 2: Extract from uploaded PDF
      const extractRes = await testApp.request('/admin/ingestor/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          sourceType: 'EUR_LEX',
        }),
      });

      expect(extractRes.status).toBe(201);
      const extractData = await extractRes.json();
      expect(extractData.success).toBe(true);
      expect(extractData.data.stagingRegulationId).toBeDefined();
      expect(extractData.data.regulationCode).toBe('E2E-PDF-TEST-2024');
      expect(extractData.data.requirementCount).toBe(2);
      expect(extractData.data.consensusSummary.match).toBe(2);

      // Step 3: Verify staging regulation has pdfCoordinates on requirements
      const stagingRes = await testApp.request(`/admin/ingestor/staging/${extractData.data.stagingRegulationId}`);
      expect(stagingRes.status).toBe(200);
      const stagingData = await stagingRes.json();

      expect(stagingData.data.requirements).toHaveLength(2);
      expect(stagingData.data.requirements[0].pdfCoordinates).toEqual({ page: 5, bbox: [100, 200, 400, 250] });
      expect(stagingData.data.requirements[1].pdfCoordinates).toEqual({ page: 12, bbox: [50, 300, 450, 350] });
    });
  });

  // ============================================================================
  // Test Case 3: Retrieve uploaded PDF for viewer
  // ============================================================================

  describe('GET /admin/ingestor/upload/pdf/:fileId', () => {
    it('should_retrieve_uploaded_pdf_for_viewer', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      const { stubClaudeExtractor, stubGeminiShadow, stubComparator } = createStubExtractors();
      const testApp = createTestApp({
        claudeExtractor: stubClaudeExtractor,
        geminiShadow: stubGeminiShadow,
        comparator: stubComparator,
      });

      // Step 1: Upload PDF
      const pdfBuffer = createMinimalPdf();
      const formData = createFormData(pdfBuffer, 'viewer-test.pdf', 'application/pdf');

      const uploadRes = await testApp.request('/admin/ingestor/upload/pdf', {
        method: 'POST',
        body: formData,
      });

      expect(uploadRes.status).toBe(201);
      const uploadData = await uploadRes.json();
      const fileId = uploadData.data.fileId;

      // Step 2: Retrieve PDF
      const getRes = await testApp.request(`/admin/ingestor/upload/pdf/${fileId}`);

      expect(getRes.status).toBe(200);
      expect(getRes.headers.get('content-type')).toBe('application/pdf');
      expect(getRes.headers.get('content-disposition')).toContain('inline');

      const responseBuffer = Buffer.from(await getRes.arrayBuffer());
      expect(responseBuffer).toEqual(pdfBuffer);
    });
  });

  // ============================================================================
  // Test Case 4: pdfFileId in staging detail
  // ============================================================================

  describe('GET /admin/ingestor/staging/:id with pdfFileId', () => {
    it('should_return_pdfFileId_in_staging_detail', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      // Create a staging regulation with pdfFileId directly using StagingService
      const em = orm.em.fork();
      const stagingService = new StagingService(em);
      const testPdfFileId = 'abcdefghijklmnopqrstuv'; // Valid CUID2-like format

      const regulation = await stagingService.createStagingRegulation({
        code: 'PDF_FILE_ID_TEST',
        name: 'PDF FileId Test Regulation',
        sourceUrl: 'pdf-upload',
        sourceType: 'MANUAL',
        primaryPayload: {},
        pdfFileId: testPdfFileId,
        actorId: 'test_user',
        requirements: [
          {
            code: 'REQ_1',
            name: 'Test Requirement with PDF',
            type: RequirementType.SUBSTANCE_SCREEN,
            severity: RequirementSeverity.WARNING,
            confidenceScore: 0.95,
            consensusStatus: ConsensusStatus.MATCH,
            pdfCoordinates: { page: 1, bbox: [0, 0, 100, 50] },
          },
        ],
      });

      // Create test app and retrieve staging regulation
      const { stubClaudeExtractor, stubGeminiShadow, stubComparator } = createStubExtractors();
      const testApp = createTestApp({
        claudeExtractor: stubClaudeExtractor,
        geminiShadow: stubGeminiShadow,
        comparator: stubComparator,
      });

      const res = await testApp.request(`/admin/ingestor/staging/${regulation.id}`);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.pdfFileId).toBe(testPdfFileId);
      expect(data.data.requirements[0].pdfCoordinates).toEqual({ page: 1, bbox: [0, 0, 100, 50] });
    });
  });

  // ============================================================================
  // Complete E2E Flow: Upload -> Extract -> Review -> Retrieve PDF
  // ============================================================================

  describe('Complete PDF Extraction Flow', () => {
    it('should_complete_full_pdf_extraction_workflow', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      const { stubClaudeExtractor, stubGeminiShadow, stubComparator } = createStubExtractors();
      const testApp = createTestApp({
        claudeExtractor: stubClaudeExtractor,
        geminiShadow: stubGeminiShadow,
        comparator: stubComparator,
      });

      // Step 1: Upload PDF
      const pdfBuffer = createMinimalPdf();
      const formData = createFormData(pdfBuffer, 'full-flow-test.pdf', 'application/pdf');

      const uploadRes = await testApp.request('/admin/ingestor/upload/pdf', {
        method: 'POST',
        body: formData,
      });

      expect(uploadRes.status).toBe(201);
      const uploadData = await uploadRes.json();
      const fileId = uploadData.data.fileId;

      // Step 2: Extract requirements from PDF
      const extractRes = await testApp.request('/admin/ingestor/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          sourceUrl: 'https://eur-lex.europa.eu/test-regulation',
          sourceType: 'EUR_LEX',
        }),
      });

      expect(extractRes.status).toBe(201);
      const extractData = await extractRes.json();
      const stagingId = extractData.data.stagingRegulationId;

      // Step 3: Get staging regulation detail (for review UI)
      const stagingRes = await testApp.request(`/admin/ingestor/staging/${stagingId}`);
      expect(stagingRes.status).toBe(200);
      const stagingData = await stagingRes.json();

      // Verify staging regulation has all expected data
      expect(stagingData.data.code).toBe('E2E-PDF-TEST-2024');
      expect(stagingData.data.name).toBe('E2E PDF Test Regulation');
      expect(stagingData.data.sourceType).toBe('EUR_LEX');
      expect(stagingData.data.requirements).toHaveLength(2);

      // Verify requirements have pdfCoordinates for highlighting
      const req1 = stagingData.data.requirements[0];
      const req2 = stagingData.data.requirements[1];

      expect(req1.substanceName).toBe('Lead');
      expect(req1.casNumber).toBe('7439-92-1');
      expect(req1.pdfCoordinates).toBeDefined();
      expect(req1.pdfCoordinates.page).toBe(5);

      expect(req2.substanceName).toBe('Cadmium');
      expect(req2.casNumber).toBe('7440-43-9');
      expect(req2.pdfCoordinates).toBeDefined();
      expect(req2.pdfCoordinates.page).toBe(12);

      // Step 4: Retrieve PDF for viewer (simulates PDF viewer fetching the file)
      const pdfRes = await testApp.request(`/admin/ingestor/upload/pdf/${fileId}`);
      expect(pdfRes.status).toBe(200);
      expect(pdfRes.headers.get('content-type')).toBe('application/pdf');

      const retrievedPdf = Buffer.from(await pdfRes.arrayBuffer());
      expect(retrievedPdf).toEqual(pdfBuffer);

      // Step 5: Verify listing shows the staging regulation
      const listRes = await testApp.request('/admin/ingestor/staging');
      expect(listRes.status).toBe(200);
      const listData = await listRes.json();
      expect(listData.data.length).toBeGreaterThanOrEqual(1);
      expect(listData.data.some((r: { code: string }) => r.code === 'E2E-PDF-TEST-2024')).toBe(true);
    });
  });
});
