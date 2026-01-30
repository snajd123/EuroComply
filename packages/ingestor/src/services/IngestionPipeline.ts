import type { EntityManager } from '@eurocomply/database';
import { ClaudeExtractor } from './ClaudeExtractor.js';
import { GeminiShadow } from './GeminiShadow.js';
import { Comparator, type ComparisonResult } from './Comparator.js';
import type { ExtractionResult, ShadowExtraction } from '../types/extraction.js';
import {
  StagingService,
  type CreateStagingRequirementInput,
  RequirementType,
  RequirementSeverity,
  ConsensusStatus,
  ComparisonOperator,
} from '@eurocomply/database';

export interface IngestionPipelineOptions {
  claudeExtractor: ClaudeExtractor;
  geminiShadow: GeminiShadow;
  comparator: Comparator;
  em?: EntityManager;
}

export interface IngestionResult {
  extraction: ExtractionResult;
  shadow: ShadowExtraction;
  comparisons: ComparisonResult[];
}

/**
 * Orchestrates the full ingestion pipeline:
 * 1. Claude extraction (primary)
 * 2. Gemini extraction (shadow)
 * 3. Comparison for consensus detection
 * 4. Staging table creation
 */
export class IngestionPipeline {
  private claudeExtractor: ClaudeExtractor;
  private geminiShadow: GeminiShadow;
  private comparator: Comparator;
  private em?: EntityManager;

  constructor(options: IngestionPipelineOptions) {
    this.claudeExtractor = options.claudeExtractor;
    this.geminiShadow = options.geminiShadow;
    this.comparator = options.comparator;
    this.em = options.em;
  }

  /**
   * Runs the full ingestion pipeline.
   *
   * Claude and Gemini extractions run in parallel for performance,
   * nearly halving total extraction time.
   */
  async ingest(documentText: string, sourceUrl: string): Promise<IngestionResult> {
    // Step 1 & 2: Run Claude and Gemini extractions in parallel
    const [extraction, shadow] = await Promise.all([
      this.claudeExtractor.extract(documentText, sourceUrl),
      this.geminiShadow.extract(documentText),
    ]);

    // Step 3: Compare results
    const comparisons = this.comparator.compare(extraction.requirements, shadow);

    return {
      extraction,
      shadow,
      comparisons,
    };
  }

  /**
   * Runs ingestion and saves to staging tables.
   */
  async ingestAndStage(
    documentText: string,
    sourceUrl: string,
    sourceType: 'EUR_LEX' | 'ECHA' | 'MANUAL',
    actorId: string
  ): Promise<{
    result: IngestionResult;
    stagingRegulationId: string;
  }> {
    if (!this.em) {
      throw new Error('EntityManager required for staging');
    }

    const result = await this.ingest(documentText, sourceUrl);
    const stagingService = new StagingService(this.em);

    // Map extraction to staging input
    const requirements: CreateStagingRequirementInput[] = result.extraction.requirements.map(
      (req, index) => {
        const comparison = result.comparisons.find(c => c.requirementIndex === index) ?? {
          requirementIndex: index,
          status: 'SHADOW_MISSING' as const,
        };
        const consensusStatus = Comparator.toConsensusStatus(comparison.status);
        const conflictDetails = 'conflictDetails' in comparison ? comparison.conflictDetails : undefined;

        return {
          code: `REQ_${index + 1}`,
          name: req.substanceName ?? `Requirement ${index + 1}`,
          description: req.reasoning,
          substanceName: req.substanceName ?? undefined,
          casNumber: req.casNumber ?? undefined,
          ecNumber: req.ecNumber ?? undefined,
          operator: (req.operator ?? undefined) as ComparisonOperator | undefined,
          thresholdValue: req.thresholdValue ?? undefined,
          unit: req.unit ?? undefined,
          scope: req.scope ?? undefined,
          legalReference: req.legalReference,
          pdfCoordinates: req.pdfCoordinates ?? undefined,
          type: RequirementType.SUBSTANCE_SCREEN,
          severity: RequirementSeverity.BLOCKER,
          confidenceScore: req.confidenceScore,
          reasoning: req.reasoning,
          allowsExemption: req.allowsExemption ?? undefined,
          exemptionConditions: req.exemptionConditions ?? undefined,
          consensusStatus,
          conflictDetails,
          suggestedCategories: result.extraction.categoryMappings?.find(
            m => m.requirementIndex === index
          )?.suggestedCategories,
        };
      }
    );

    const regulation = await stagingService.createStagingRegulation({
      code: result.extraction.regulationMetadata.code,
      name: result.extraction.regulationMetadata.name,
      sourceUrl: result.extraction.regulationMetadata.sourceUrl ?? sourceUrl,
      sourceType,
      primaryPayload: result.extraction,
      shadowPayload: result.shadow,
      regulationMetadata: {
        jurisdiction: result.extraction.regulationMetadata.jurisdiction ?? undefined,
        version: result.extraction.regulationMetadata.version ?? undefined,
        effectiveDate: result.extraction.regulationMetadata.effectiveDate ?? undefined,
      },
      actorId,
      requirements,
    });

    return {
      result,
      stagingRegulationId: regulation.id,
    };
  }
}
