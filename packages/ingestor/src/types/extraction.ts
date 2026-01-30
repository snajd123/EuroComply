import { z } from 'zod';

/**
 * Schema for regulation metadata extracted by Claude.
 */
export const RegulationMetadataSchema = z.object({
  code: z.string(),
  name: z.string(),
  sourceUrl: z.string().url(),
  version: z.string().optional(),
  effectiveDate: z.string().optional(),
  jurisdiction: z.string().optional(),
  type: z.string().optional(),
  officialJournalRef: z.string().optional(),
});

export type RegulationMetadata = z.infer<typeof RegulationMetadataSchema>;

/**
 * Comparison operators for requirement thresholds.
 */
export const OperatorSchema = z.enum(['GT', 'GTE', 'LT', 'LTE', 'EQ', 'PRESENT', 'ABSENT']);

export type Operator = z.infer<typeof OperatorSchema>;

/**
 * PDF coordinates for citation anchoring.
 */
export const PdfCoordinatesSchema = z.object({
  page: z.number(),
  bbox: z.array(z.number()).length(4),
});

export type PdfCoordinates = z.infer<typeof PdfCoordinatesSchema>;

/**
 * Schema for a single extracted requirement.
 */
export const ExtractedRequirementSchema = z.object({
  substanceName: z.string().optional(),
  casNumber: z.string().optional(),
  ecNumber: z.string().optional(),
  operator: OperatorSchema.optional(),
  thresholdValue: z.number().optional(),
  unit: z.string().optional(),
  scope: z.array(z.string()).optional(),
  legalReference: z.string(),
  pdfCoordinates: PdfCoordinatesSchema.optional(),
  confidenceScore: z.number().min(0).max(1),
  reasoning: z.string(),
  allowsExemption: z.boolean().optional().default(true),
  exemptionConditions: z.string().optional(),
});

export type ExtractedRequirement = z.infer<typeof ExtractedRequirementSchema>;

/**
 * Suggested category mapping from AI.
 */
export const CategoryMappingSchema = z.object({
  requirementIndex: z.number(),
  suggestedCategories: z.array(z.object({
    path: z.string(),
    confidence: z.number().min(0).max(1),
  })),
});

export type CategoryMapping = z.infer<typeof CategoryMappingSchema>;

/**
 * Full extraction result from Claude.
 */
export const ExtractionResultSchema = z.object({
  regulationMetadata: RegulationMetadataSchema,
  requirements: z.array(ExtractedRequirementSchema),
  categoryMappings: z.array(CategoryMappingSchema).optional(),
  extractionMetadata: z.object({
    model: z.string(),
    extractedAt: z.string(),
    totalRequirements: z.number(),
    avgConfidence: z.number(),
  }),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

/**
 * Simplified extraction from Gemini for validation.
 */
export const ShadowExtractionSchema = z.array(z.object({
  cas: z.string().optional(),
  threshold: z.number().optional(),
  unit: z.string().optional(),
}));

export type ShadowExtraction = z.infer<typeof ShadowExtractionSchema>;
