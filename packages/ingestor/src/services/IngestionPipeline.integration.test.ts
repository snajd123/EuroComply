import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { MikroORM } from '@mikro-orm/postgresql';
import { IngestionPipeline } from './IngestionPipeline.js';
import type { ClaudeExtractor } from './ClaudeExtractor.js';
import type { GeminiShadow } from './GeminiShadow.js';
import { Comparator } from './Comparator.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';

describe('IngestionPipeline Integration', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) return;
    orm = await setupTestDb();
  });

  afterAll(async () => {
    if (orm) await teardownTestDb();
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
      expect(result.extraction.requirements[0].pdfCoordinates).toBeDefined();
      expect(result.extraction.requirements[0].pdfCoordinates?.page).toBe(5);
      expect(result.extraction.requirements[0].pdfCoordinates?.bbox).toEqual([72.0, 150.5, 520.0, 180.2]);

      // Verify comparison result
      expect(result.comparisons[0].status).toBe('MATCH');
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
      expect(result.extraction.requirements[0].pdfCoordinates).toBeDefined();
      expect(result.extraction.requirements[0].pdfCoordinates?.page).toBe(3);

      // Verify staging regulation was created
      expect(stagingRegulationId).toBeDefined();

      // Verify PDF coordinates were persisted to database
      const stagingRegulation = await em.findOne('StagingRegulation', { id: stagingRegulationId }, {
        populate: ['requirements'],
      });

      expect(stagingRegulation).toBeDefined();

      // Access requirements and check pdfCoordinates
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requirements = (stagingRegulation as any).requirements.getItems();
      expect(requirements).toHaveLength(1);
      expect(requirements[0].pdfCoordinates).toBeDefined();
      expect(requirements[0].pdfCoordinates.page).toBe(3);
      expect(requirements[0].pdfCoordinates.bbox).toEqual([100.0, 200.0, 450.0, 230.0]);
    });
  });
});
