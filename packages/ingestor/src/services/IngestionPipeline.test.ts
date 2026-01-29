import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IngestionPipeline } from './IngestionPipeline.js';
import type { ClaudeExtractor } from './ClaudeExtractor.js';
import type { GeminiShadow } from './GeminiShadow.js';
import type { Comparator } from './Comparator.js';

describe('IngestionPipeline', () => {
  let mockClaudeExtractor: ClaudeExtractor;
  let mockGeminiShadow: GeminiShadow;
  let mockComparator: Comparator;

  beforeEach(() => {
    mockClaudeExtractor = {
      extract: vi.fn(),
    } as unknown as ClaudeExtractor;

    mockGeminiShadow = {
      extract: vi.fn(),
    } as unknown as GeminiShadow;

    mockComparator = {
      compare: vi.fn(),
    } as unknown as Comparator;
  });

  describe('ingest', () => {
    it('should_orchestrate_extraction_and_validation', async () => {
      const mockExtractionResult = {
        regulationMetadata: {
          code: 'TEST-REG',
          name: 'Test Regulation',
          sourceUrl: 'https://example.com',
        },
        requirements: [
          {
            casNumber: '7439-92-1',
            thresholdValue: 0.05,
            unit: 'PERCENT_BY_WEIGHT',
            legalReference: 'Entry 63',
            confidenceScore: 0.97,
            reasoning: 'Test',
          },
        ],
        extractionMetadata: {
          model: 'claude-4.5-opus',
          extractedAt: '2026-01-29T10:00:00Z',
          totalRequirements: 1,
          avgConfidence: 0.97,
        },
      };

      const mockShadowResult = [
        { cas: '7439-92-1', threshold: 0.05, unit: 'PERCENT_BY_WEIGHT' },
      ];

      const mockComparisonResults = [
        { requirementIndex: 0, status: 'MATCH' as const },
      ];

      vi.mocked(mockClaudeExtractor.extract).mockResolvedValue(mockExtractionResult);
      vi.mocked(mockGeminiShadow.extract).mockResolvedValue(mockShadowResult);
      vi.mocked(mockComparator.compare).mockReturnValue(mockComparisonResults);

      const pipeline = new IngestionPipeline({
        claudeExtractor: mockClaudeExtractor,
        geminiShadow: mockGeminiShadow,
        comparator: mockComparator,
      });

      const result = await pipeline.ingest('Document text', 'https://example.com');

      expect(result.extraction).toBe(mockExtractionResult);
      expect(result.shadow).toBe(mockShadowResult);
      expect(result.comparisons).toBe(mockComparisonResults);
      expect(mockClaudeExtractor.extract).toHaveBeenCalledWith('Document text', 'https://example.com');
      expect(mockGeminiShadow.extract).toHaveBeenCalledWith('Document text');
      expect(mockComparator.compare).toHaveBeenCalledWith(
        mockExtractionResult.requirements,
        mockShadowResult
      );
    });
  });

  describe('ingestAndStage', () => {
    it('should_throw_error_when_entitymanager_not_provided', async () => {
      const pipeline = new IngestionPipeline({
        claudeExtractor: mockClaudeExtractor,
        geminiShadow: mockGeminiShadow,
        comparator: mockComparator,
        // No em provided
      });

      await expect(
        pipeline.ingestAndStage('Document text', 'https://example.com', 'user_123')
      ).rejects.toThrow('EntityManager required for staging');
    });
  });
});
