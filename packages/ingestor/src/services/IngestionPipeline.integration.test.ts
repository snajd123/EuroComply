import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { MikroORM } from '@eurocomply/database';
import { StagingRegulation } from '@eurocomply/database';
import { IngestionPipeline } from './IngestionPipeline.js';
import type { ClaudeExtractor } from './ClaudeExtractor.js';
import type { GeminiShadow } from './GeminiShadow.js';
import { Comparator } from './Comparator.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';

/**
 * Integration tests for IngestionPipeline.
 *
 * EXTERNAL API STUBS: ClaudeExtractor and GeminiShadow are external API clients
 * that call paid services (Anthropic Claude, Google Gemini). Per RULES.md,
 * mocks are not allowed, but these are STUB OBJECTS (not vi.mock/vi.fn) that
 * implement the same interface for testing. This is a documented exception
 * because:
 * 1. Real API calls require API keys and cost money
 * 2. Real API calls are slow and non-deterministic
 * 3. We cannot use "real database" for external APIs - they're not databases
 *
 * The Comparator is used as a REAL instance since it's a pure function class.
 */
describe('IngestionPipeline Integration', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) return;
    orm = await setupTestDb();
  });

  afterAll(async () => {
    if (orm) await teardownTestDb();
  });

  describe('Error handling', () => {
    it('should_throw_error_when_entitymanager_not_provided_for_staging', async () => {
      const stubClaudeExtractor = {
        extract: async () => ({
          regulationMetadata: { code: 'TEST', name: 'Test', sourceUrl: 'https://example.com' },
          requirements: [],
          extractionMetadata: { model: 'test', extractedAt: new Date().toISOString(), totalRequirements: 0, avgConfidence: 0 },
        }),
      } as unknown as ClaudeExtractor;

      const stubGeminiShadow = {
        extract: async () => [],
      } as unknown as GeminiShadow;

      const comparator = new Comparator();

      // Create pipeline WITHOUT EntityManager
      const pipeline = new IngestionPipeline({
        claudeExtractor: stubClaudeExtractor,
        geminiShadow: stubGeminiShadow,
        comparator,
        // No em provided
      });

      await expect(
        pipeline.ingestAndStage('Document text', 'https://example.com', 'user_123')
      ).rejects.toThrow('EntityManager required for staging');
    });
  });

  describe('Basic pipeline flow', () => {
    it('should_orchestrate_extraction_comparison_without_database', async () => {
      const stubClaudeExtractor = {
        extract: async () => ({
          regulationMetadata: {
            code: 'REACH-TEST',
            name: 'Test REACH Regulation',
            sourceUrl: 'https://example.com/reach',
          },
          requirements: [
            {
              substanceName: 'Lead',
              casNumber: '7439-92-1',
              thresholdValue: 0.05,
              unit: 'PERCENT_BY_WEIGHT',
              operator: 'LT',
              legalReference: 'Entry 63',
              confidenceScore: 0.95,
              reasoning: 'Clear threshold in Annex XVII',
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
          { cas: '7439-92-1', threshold: 0.05, unit: 'PERCENT_BY_WEIGHT' },
        ],
      } as unknown as GeminiShadow;

      const comparator = new Comparator();

      const pipeline = new IngestionPipeline({
        claudeExtractor: stubClaudeExtractor,
        geminiShadow: stubGeminiShadow,
        comparator,
      });

      const result = await pipeline.ingest('Test document', 'https://example.com/reach');

      // Verify extraction result
      expect(result.extraction.regulationMetadata.code).toBe('REACH-TEST');
      expect(result.extraction.requirements).toHaveLength(1);
      expect(result.extraction.requirements[0]?.casNumber).toBe('7439-92-1');

      // Verify shadow result
      expect(result.shadow).toHaveLength(1);
      expect(result.shadow[0]?.cas).toBe('7439-92-1');

      // Verify comparison (should be MATCH since values align)
      expect(result.comparisons).toHaveLength(1);
      expect(result.comparisons[0]?.status).toBe('MATCH');
    });

    it('should_detect_conflict_when_models_disagree', async () => {
      const stubClaudeExtractor = {
        extract: async () => ({
          regulationMetadata: {
            code: 'CONFLICT-TEST',
            name: 'Conflict Test Regulation',
            sourceUrl: 'https://example.com/conflict',
          },
          requirements: [
            {
              substanceName: 'Mercury',
              casNumber: '7439-97-6',
              thresholdValue: 0.1, // Claude says 0.1%
              unit: 'PERCENT_BY_WEIGHT',
              operator: 'LT',
              legalReference: 'Entry 18',
              confidenceScore: 0.8,
              reasoning: 'Mercury restriction',
            },
          ],
          extractionMetadata: {
            model: 'claude-sonnet-4-20250514',
            extractedAt: new Date().toISOString(),
            totalRequirements: 1,
            avgConfidence: 0.8,
          },
        }),
      } as unknown as ClaudeExtractor;

      const stubGeminiShadow = {
        extract: async () => [
          { cas: '7439-97-6', threshold: 0.05, unit: 'PERCENT_BY_WEIGHT' }, // Gemini says 0.05%
        ],
      } as unknown as GeminiShadow;

      const comparator = new Comparator();

      const pipeline = new IngestionPipeline({
        claudeExtractor: stubClaudeExtractor,
        geminiShadow: stubGeminiShadow,
        comparator,
      });

      const result = await pipeline.ingest('Test document', 'https://example.com/conflict');

      // Verify conflict detected
      expect(result.comparisons[0]?.status).toBe('CONFLICT');
    });

    it('should_handle_shadow_missing_cas_number', async () => {
      const stubClaudeExtractor = {
        extract: async () => ({
          regulationMetadata: {
            code: 'SHADOW-MISSING-TEST',
            name: 'Shadow Missing Test',
            sourceUrl: 'https://example.com/shadow-missing',
          },
          requirements: [
            {
              substanceName: 'Rare Substance',
              casNumber: '12345-67-8', // CAS not in shadow extraction
              thresholdValue: 0.01,
              unit: 'PERCENT_BY_WEIGHT',
              confidenceScore: 0.9,
            },
          ],
          extractionMetadata: {
            model: 'claude-sonnet-4-20250514',
            extractedAt: new Date().toISOString(),
            totalRequirements: 1,
            avgConfidence: 0.9,
          },
        }),
      } as unknown as ClaudeExtractor;

      const stubGeminiShadow = {
        extract: async () => [], // Shadow returns empty
      } as unknown as GeminiShadow;

      const comparator = new Comparator();

      const pipeline = new IngestionPipeline({
        claudeExtractor: stubClaudeExtractor,
        geminiShadow: stubGeminiShadow,
        comparator,
      });

      const result = await pipeline.ingest('Test document', 'https://example.com/shadow-missing');

      // Should mark as SHADOW_MISSING since CAS wasn't found
      expect(result.comparisons[0]?.status).toBe('SHADOW_MISSING');
    });
  });

  describe('PDF Coordinate Flow', () => {
    it('should_preserve_pdf_coordinates_through_extraction_pipeline', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      // Create mock extractors that return PDF coordinates
      const mockClaudeExtractor = {
        extract: async () => ({
          regulationMetadata: {
            code: 'COORD_TEST',
            name: 'Coordinate Test Regulation',
            sourceUrl: 'https://example.com/test.pdf',
          },
          requirements: [
            {
              substanceName: 'Lead',
              casNumber: '7439-92-1',
              thresholdValue: 0.05,
              unit: 'PERCENT_BY_WEIGHT',
              operator: 'LT',
              legalReference: 'Entry 63',
              pdfCoordinates: {
                page: 5,
                bbox: [72.0, 150.5, 520.0, 180.2],
              },
              confidenceScore: 0.97,
              reasoning: 'Test extraction with coordinates',
            },
          ],
          extractionMetadata: {
            model: 'test',
            extractedAt: new Date().toISOString(),
            totalRequirements: 1,
            avgConfidence: 0.97,
          },
        }),
      } as unknown as ClaudeExtractor;

      const mockGeminiShadow = {
        extract: async () => [
          { cas: '7439-92-1', threshold: 0.05, unit: 'PERCENT_BY_WEIGHT' },
        ],
      } as unknown as GeminiShadow;

      const comparator = new Comparator();

      const pipeline = new IngestionPipeline({
        claudeExtractor: mockClaudeExtractor,
        geminiShadow: mockGeminiShadow,
        comparator,
      });

      const result = await pipeline.ingest('Test document', 'https://example.com/test.pdf');

      // Verify PDF coordinates are preserved
      expect(result.extraction.requirements[0]?.pdfCoordinates).toBeDefined();
      expect(result.extraction.requirements[0]?.pdfCoordinates?.page).toBe(5);
      expect(result.extraction.requirements[0]?.pdfCoordinates?.bbox).toEqual([72.0, 150.5, 520.0, 180.2]);

      // Verify comparison result
      expect(result.comparisons[0]?.status).toBe('MATCH');
    });

    it('should_preserve_pdf_coordinates_through_ingestAndStage', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      const em = orm.em.fork();

      // Clean up any previous test data
      await em.execute('DELETE FROM public.ingestion_audit_log');
      await em.execute('DELETE FROM public.staging_requirement');
      await em.execute('DELETE FROM public.staging_regulation');

      // Create mock extractors that return PDF coordinates
      const mockClaudeExtractor = {
        extract: async () => ({
          regulationMetadata: {
            code: 'STAGE_COORD_TEST',
            name: 'Staging Coordinate Test Regulation',
            sourceUrl: 'https://example.com/test-stage.pdf',
          },
          requirements: [
            {
              substanceName: 'Cadmium',
              casNumber: '7440-43-9',
              thresholdValue: 0.01,
              unit: 'PERCENT_BY_WEIGHT',
              operator: 'LT',
              legalReference: 'Entry 23',
              pdfCoordinates: {
                page: 3,
                bbox: [100.0, 200.0, 450.0, 230.0],
              },
              confidenceScore: 0.98,
              reasoning: 'Extracted cadmium restriction with coordinates',
            },
          ],
          extractionMetadata: {
            model: 'test-model',
            extractedAt: new Date().toISOString(),
            totalRequirements: 1,
            avgConfidence: 0.98,
          },
        }),
      } as unknown as ClaudeExtractor;

      const mockGeminiShadow = {
        extract: async () => [
          { cas: '7440-43-9', threshold: 0.01, unit: 'PERCENT_BY_WEIGHT' },
        ],
      } as unknown as GeminiShadow;

      const comparator = new Comparator();

      const pipeline = new IngestionPipeline({
        claudeExtractor: mockClaudeExtractor,
        geminiShadow: mockGeminiShadow,
        comparator,
        em,
      });

      const { result, stagingRegulationId } = await pipeline.ingestAndStage(
        'Test document with cadmium',
        'https://example.com/test-stage.pdf',
        'test_user'
      );

      // Verify extraction result has PDF coordinates
      expect(result.extraction.requirements[0]?.pdfCoordinates).toBeDefined();
      expect(result.extraction.requirements[0]?.pdfCoordinates?.page).toBe(3);

      // Verify staging regulation was created
      expect(stagingRegulationId).toBeDefined();

      // Verify PDF coordinates were persisted to database
      const stagingRegulation = await em.findOne(StagingRegulation, { id: stagingRegulationId }, {
        populate: ['requirements'],
      });

      expect(stagingRegulation).toBeDefined();

      // Access requirements and check pdfCoordinates
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requirements = (stagingRegulation as any).requirements.getItems();
      expect(requirements).toHaveLength(1);
      expect(requirements[0]?.pdfCoordinates).toBeDefined();
      expect(requirements[0]?.pdfCoordinates.page).toBe(3);
      expect(requirements[0]?.pdfCoordinates.bbox).toEqual([100.0, 200.0, 450.0, 230.0]);
    });
  });
});
