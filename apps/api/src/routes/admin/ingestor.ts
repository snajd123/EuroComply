/**
 * Admin Ingestor API Routes
 *
 * Platform admin endpoints for AI regulation ingestion:
 * - POST /extract: Trigger extraction from URL
 * - GET /staging: List staging regulations
 * - GET /staging/:id: Get staging regulation with requirements
 * - PATCH /staging/:id/requirements/:reqId: Edit requirement
 * - POST /staging/:id/approve: Approve requirements
 * - POST /staging/:id/bulk-approve: Approve all MATCH requirements
 * - DELETE /staging/:id: Reject and remove
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { MikroORM } from '@eurocomply/database';
import {
  StagingService,
  StagingStatus,
  PublishService,
  RequirementType,
  RequirementSeverity,
  ComparisonOperator,
} from '@eurocomply/database';
import {
  IngestionPipeline,
  ClaudeExtractor,
  GeminiShadow,
  Comparator,
} from '@eurocomply/ingestor';
import type { Env } from '../../app.js';
import { success, error } from '../../utils/response.js';

export interface IngestorRouterOptions {
  orm: MikroORM;
  /** Injected extractors for testing - if not provided, uses real extractors with env API keys */
  claudeExtractor?: ClaudeExtractor;
  geminiShadow?: GeminiShadow;
  comparator?: Comparator;
  /** Directory where uploaded PDFs are stored */
  uploadsDir?: string;
}

/** Valid fileId pattern (CUID2 format - alphanumeric, 21-24 chars) */
const FILE_ID_PATTERN = /^[a-z0-9]{21,24}$/;

const extractSchema = z.object({
  sourceUrl: z.string().min(1).optional(), // URL or identifier for manual entries
  sourceType: z.enum(['EUR_LEX', 'ECHA', 'MANUAL']),
  documentText: z.string().min(1).optional(), // Text to extract from (for text-based extraction)
  fileId: z.string().min(1).optional(), // File ID of uploaded PDF (for PDF extraction)
}).refine(
  data => data.documentText || data.fileId,
  { message: 'Either documentText or fileId is required' }
);

const approveSchema = z.object({
  requirementIds: z.array(z.string()).min(1),
});

const editRequirementSchema = z.object({
  thresholdValue: z.number().optional(),
  unit: z.string().optional(),
  operator: z.enum(['GT', 'GTE', 'LT', 'LTE', 'EQ', 'PRESENT', 'ABSENT']).optional(),
  scope: z.array(z.string()).optional(),
});

const listQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'PARTIALLY_APPROVED', 'PUBLISHED']).optional(),
  sourceType: z.enum(['EUR_LEX', 'ECHA', 'MANUAL']).optional(),
});

/**
 * Sanitizes error messages to remove any potential API key exposure.
 * Strips patterns that look like API keys from error messages.
 */
function sanitizeErrorMessage(message: string): string {
  // Remove Anthropic API key patterns (sk-ant-...)
  let sanitized = message.replace(/sk-[a-zA-Z0-9-_]+/g, '[REDACTED]');
  // Remove Google API key patterns (AIza...)
  sanitized = sanitized.replace(/AIza[a-zA-Z0-9-_]+/g, '[REDACTED]');
  // Remove generic API key patterns that might slip through
  sanitized = sanitized.replace(/[a-zA-Z0-9]{32,}/g, '[REDACTED]');
  return sanitized;
}

export function createIngestorRouter(options: IngestorRouterOptions): Hono<Env> {
  const { orm, claudeExtractor: injectedClaude, geminiShadow: injectedGemini, comparator: injectedComparator, uploadsDir } = options;
  const router = new Hono<Env>();

  /**
   * GET /staging
   * List all staging regulations with optional filters
   */
  router.get(
    '/staging',
    zValidator('query', listQuerySchema),
    async (c) => {
      const query = c.req.valid('query');
      const em = orm.em.fork();
      const service = new StagingService(em);

      const regulations = await service.listStagingRegulations({
        status: query.status as StagingStatus | undefined,
        sourceType: query.sourceType as 'EUR_LEX' | 'ECHA' | 'MANUAL' | undefined,
      });

      return success(c, regulations.map(reg => ({
        id: reg.id,
        code: reg.code,
        name: reg.name,
        sourceType: reg.sourceType,
        status: reg.status,
        createdAt: reg.createdAt.toISOString(),
        requirementCount: reg.requirements.length,
      })), { total: regulations.length });
    }
  );

  /**
   * GET /staging/:id
   * Get a staging regulation with all its requirements
   */
  router.get(
    '/staging/:id',
    async (c) => {
      const { id } = c.req.param();
      const em = orm.em.fork();
      const service = new StagingService(em);

      const regulation = await service.getStagingRegulation(id);
      if (!regulation) {
        return error(c, 'NOT_FOUND', 'Staging regulation not found', 404);
      }

      return success(c, {
        id: regulation.id,
        code: regulation.code,
        name: regulation.name,
        sourceUrl: regulation.sourceUrl,
        sourceType: regulation.sourceType,
        status: regulation.status,
        createdAt: regulation.createdAt.toISOString(),
        primaryPayload: regulation.primaryPayload,
        shadowPayload: regulation.shadowPayload,
        requirements: regulation.requirements.getItems().map(req => ({
          id: req.id,
          code: req.code,
          name: req.name,
          substanceName: req.substanceName,
          casNumber: req.casNumber,
          operator: req.operator,
          thresholdValue: req.thresholdValue,
          unit: req.unit,
          scope: req.scope,
          legalReference: req.legalReference,
          pdfCoordinates: req.pdfCoordinates,
          type: req.type,
          severity: req.severity,
          confidenceScore: req.confidenceScore,
          reasoning: req.reasoning,
          consensusStatus: req.consensusStatus,
          conflictDetails: req.conflictDetails,
          isApproved: req.isApproved,
          approvedBy: req.approvedBy,
          approvedAt: req.approvedAt?.toISOString(),
        })),
      });
    }
  );

  /**
   * POST /extract
   * Trigger extraction from a source URL using Claude and Gemini
   *
   * Requires ANTHROPIC_API_KEY and GEMINI_API_KEY environment variables,
   * or injected extractors for testing.
   */
  router.post(
    '/extract',
    zValidator('json', extractSchema),
    async (c) => {
      const body = c.req.valid('json');
      const userId = c.get('userId') ?? 'admin';

      // Get extractors - either injected (for testing) or create from env
      let claudeExtractor: ClaudeExtractor;
      let geminiShadow: GeminiShadow;
      let comparator: Comparator;

      if (injectedClaude && injectedGemini && injectedComparator) {
        // Use injected extractors (test mode)
        claudeExtractor = injectedClaude;
        geminiShadow = injectedGemini;
        comparator = injectedComparator;
      } else {
        // Read API keys from environment
        const anthropicKey = process.env['ANTHROPIC_API_KEY'];
        const geminiKey = process.env['GEMINI_API_KEY'];

        if (!anthropicKey || !geminiKey) {
          return error(c, 'CONFIG_ERROR', 'API keys not configured for extraction', 500);
        }

        // Create real extractors
        claudeExtractor = new ClaudeExtractor({ apiKey: anthropicKey });
        geminiShadow = new GeminiShadow({ apiKey: geminiKey });
        comparator = new Comparator();
      }

      // Create pipeline and run extraction
      const em = orm.em.fork();
      const pipeline = new IngestionPipeline({
        claudeExtractor,
        geminiShadow,
        comparator,
        em,
      });

      try {
        // Determine source identifier (URL or fileId-based)
        const sourceIdentifier = body.sourceUrl ?? body.fileId ?? 'unknown';

        let result: Awaited<ReturnType<typeof pipeline.ingest>>;
        let stagingRegulationId: string;

        if (body.fileId) {
          // PDF extraction path
          // Validate fileId format to prevent path traversal
          if (!FILE_ID_PATTERN.test(body.fileId)) {
            return error(c, 'BAD_REQUEST', 'Invalid fileId format', 400);
          }

          const pdfDir = uploadsDir ?? path.join(process.cwd(), 'uploads/pdfs');
          const filePath = path.join(pdfDir, `${body.fileId}.pdf`);

          // Verify the resolved path is within uploads directory (defense in depth)
          const resolvedPath = path.resolve(filePath);
          const resolvedUploadsDir = path.resolve(pdfDir);
          if (!resolvedPath.startsWith(resolvedUploadsDir)) {
            return error(c, 'NOT_FOUND', 'PDF file not found', 404);
          }

          if (!fs.existsSync(filePath)) {
            return error(c, 'NOT_FOUND', 'PDF file not found', 404);
          }

          const pdfBuffer = fs.readFileSync(filePath);

          // Run PDF extraction with Claude
          const extraction = await claudeExtractor.extractFromPdf(pdfBuffer, sourceIdentifier);

          // Run Gemini shadow extraction (text-based, using empty string since we don't have text)
          // Note: For PDF extraction, shadow validation is limited
          const shadow = await geminiShadow.extract('');

          // Compare results
          const comparisons = comparator.compare(extraction.requirements, shadow);

          result = { extraction, shadow, comparisons };

          // Save to staging using StagingService directly
          const stagingService = new StagingService(em);
          const requirements = result.extraction.requirements.map((req, index) => {
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
          });

          const regulation = await stagingService.createStagingRegulation({
            code: result.extraction.regulationMetadata.code,
            name: result.extraction.regulationMetadata.name,
            sourceUrl: result.extraction.regulationMetadata.sourceUrl ?? sourceIdentifier,
            sourceType: body.sourceType,
            primaryPayload: result.extraction,
            shadowPayload: result.shadow,
            regulationMetadata: {
              jurisdiction: result.extraction.regulationMetadata.jurisdiction ?? undefined,
              version: result.extraction.regulationMetadata.version ?? undefined,
              effectiveDate: result.extraction.regulationMetadata.effectiveDate ?? undefined,
            },
            actorId: userId,
            requirements,
          });

          stagingRegulationId = regulation.id;
        } else if (body.documentText) {
          // Text extraction path (existing behavior)
          const staged = await pipeline.ingestAndStage(
            body.documentText,
            sourceIdentifier,
            body.sourceType,
            userId
          );
          result = staged.result;
          stagingRegulationId = staged.stagingRegulationId;
        } else {
          // This shouldn't happen due to schema validation, but TypeScript needs it
          return error(c, 'BAD_REQUEST', 'Either documentText or fileId is required', 400);
        }

        // Build consensus summary
        const consensusSummary = {
          match: 0,
          conflict: 0,
          lowConfidence: 0,
          shadowMissing: 0,
        };

        for (const comp of result.comparisons) {
          switch (comp.status) {
            case 'MATCH':
              consensusSummary.match++;
              break;
            case 'CONFLICT':
              consensusSummary.conflict++;
              break;
            case 'LOW_CONFIDENCE':
              consensusSummary.lowConfidence++;
              break;
            case 'SHADOW_MISSING':
              consensusSummary.shadowMissing++;
              break;
          }
        }

        return success(c, {
          stagingRegulationId,
          regulationCode: result.extraction.regulationMetadata.code,
          regulationName: result.extraction.regulationMetadata.name,
          requirementCount: result.extraction.requirements.length,
          consensusSummary,
        }, { status: 201 });
      } catch (err) {
        // Sanitize error message to prevent API key exposure
        const message = err instanceof Error
          ? sanitizeErrorMessage(err.message)
          : 'Extraction failed';

        return error(c, 'INTERNAL_ERROR', `Extraction failed: ${message}`, 500);
      }
    }
  );

  /**
   * PATCH /staging/:id/requirements/:reqId
   * Edit a specific requirement
   */
  router.patch(
    '/staging/:id/requirements/:reqId',
    zValidator('json', editRequirementSchema),
    async (c) => {
      const { id, reqId } = c.req.param();
      const body = c.req.valid('json');
      const userId = c.get('userId') ?? 'admin';
      const em = orm.em.fork();
      const service = new StagingService(em);

      // Verify staging regulation exists and requirement belongs to it
      const regulation = await service.getStagingRegulation(id);
      if (!regulation) {
        return error(c, 'NOT_FOUND', 'Staging regulation not found', 404);
      }

      const reqBelongsToReg = regulation.requirements.getItems().some(r => r.id === reqId);
      if (!reqBelongsToReg) {
        return error(c, 'NOT_FOUND', 'Requirement not found in this staging regulation', 404);
      }

      try {
        const updated = await service.updateRequirement(reqId, body as Parameters<StagingService['updateRequirement']>[1], userId);
        return success(c, {
          id: updated.id,
          thresholdValue: updated.thresholdValue,
          unit: updated.unit,
          operator: updated.operator,
          scope: updated.scope,
        });
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          return error(c, 'NOT_FOUND', 'Requirement not found', 404);
        }
        throw err;
      }
    }
  );

  /**
   * POST /staging/:id/approve
   * Approve specific requirements
   */
  router.post(
    '/staging/:id/approve',
    zValidator('json', approveSchema),
    async (c) => {
      const { id } = c.req.param();
      const body = c.req.valid('json');
      const userId = c.get('userId') ?? 'admin';
      const em = orm.em.fork();
      const service = new StagingService(em);

      let approvedCount = 0;
      for (const reqId of body.requirementIds) {
        try {
          await service.approveRequirement(reqId, userId);
          approvedCount++;
        } catch {
          // Skip requirements that don't exist
        }
      }

      return success(c, {
        approvedCount,
        totalRequested: body.requirementIds.length,
      });
    }
  );

  /**
   * POST /staging/:id/bulk-approve
   * Approve all MATCH requirements
   */
  router.post(
    '/staging/:id/bulk-approve',
    async (c) => {
      const { id } = c.req.param();
      const userId = c.get('userId') ?? 'admin';
      const em = orm.em.fork();
      const service = new StagingService(em);

      // Verify staging regulation exists
      const regulation = await service.getStagingRegulation(id);
      if (!regulation) {
        return error(c, 'NOT_FOUND', 'Staging regulation not found', 404);
      }

      const count = await service.bulkApproveMatches(id, userId);

      return success(c, {
        approvedCount: count,
      });
    }
  );

  /**
   * POST /staging/:id/publish
   * Publish approved requirements to production
   */
  router.post(
    '/staging/:id/publish',
    async (c) => {
      const { id } = c.req.param();
      const userId = c.get('userId') ?? 'admin';
      const em = orm.em.fork();

      try {
        const publishService = new PublishService(em);
        const result = await publishService.publish(id, userId);

        return success(c, {
          regulationId: result.regulationId,
          requirementCount: result.requirementCount,
          message: 'Regulation published to production',
        }, { status: 201 });
      } catch (err) {
        if (err instanceof Error) {
          if (err.message.includes('not found')) {
            return error(c, 'NOT_FOUND', 'Staging regulation not found', 404);
          }
          if (err.message.includes('not approved')) {
            return error(c, 'BAD_REQUEST', err.message, 400);
          }
        }
        throw err;
      }
    }
  );

  /**
   * DELETE /staging/:id
   * Reject and remove a staging regulation
   */
  router.delete(
    '/staging/:id',
    async (c) => {
      const { id } = c.req.param();
      const em = orm.em.fork();

      const regulation = await em.findOne('StagingRegulation', { id });
      if (!regulation) {
        return error(c, 'NOT_FOUND', 'Staging regulation not found', 404);
      }

      await em.removeAndFlush(regulation);

      return c.body(null, 204);
    }
  );

  return router;
}
