import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { ok, err, type SealedArtifact } from '@eurocomply/shared';
import { createWaltIdClient } from '@eurocomply/walt-id';
import { prisma } from '@eurocomply/db';
import { VerificationService } from '../services/verification.service.js';
import { StatusList2021Service } from '../services/status-list.service.js';
import { TimestampService } from '../services/timestamp.service.js';
import {
  verificationRateLimiter,
} from '../middleware/rate-limit.js';
import {
  VerifyArtifactBodySchema,
  VerifySignatureBodySchema,
  validateBody,
} from '../lib/schemas.js';
import { loggers } from '../lib/logger.js';

const log = loggers.verification;

const verification = new Hono();

// Apply rate limiting to all verification routes
// These are public endpoints vulnerable to DoS attacks
verification.use('/*', verificationRateLimiter);

// Limit body size for verification endpoints (512KB max for artifacts)
verification.use('/*', bodyLimit({
  maxSize: 512 * 1024, // 512KB
  onError: (c) => {
    return c.json(
      err('PAYLOAD_TOO_LARGE', 'Artifact exceeds maximum size of 512KB'),
      413
    );
  },
}));

// ============================================
// Service Initialization (fail-fast at startup)
// ============================================

// Initialize services at module load time for fail-fast behavior
// This ensures configuration problems are discovered at startup, not on first request

const statusListService = new StatusList2021Service(prisma);

// Use configurable TSA provider (default: FREETSA)
const tsaProvider = process.env['TSA_PROVIDER'] || 'FREETSA';
if (tsaProvider === 'FREETSA' && process.env['NODE_ENV'] === 'production') {
  log.warn(
    'Using FREETSA in production. Consider using a qualified TSA for legally binding timestamps. ' +
    'Set TSA_PROVIDER environment variable to configure.'
  );
}

const timestampService = TimestampService.forProvider(tsaProvider as 'FREETSA');
const waltIdClient = createWaltIdClient({
  WALTID_CORE_URL: process.env['WALTID_CORE_URL'],
  WALTID_SIGNATORY_URL: process.env['WALTID_SIGNATORY_URL'],
  WALTID_CUSTODIAN_URL: process.env['WALTID_CUSTODIAN_URL'],
  WALTID_AUDITOR_URL: process.env['WALTID_AUDITOR_URL'],
  WALTID_API_KEY: process.env['WALTID_API_KEY'],
});
const verificationService = new VerificationService(
  waltIdClient,
  statusListService,
  timestampService
);

log.info({ tsaProvider }, 'Verification services initialized');

/**
 * POST /api/v1/verify
 * Verify a Sealed Artifact.
 *
 * This is a public endpoint - no authentication required.
 * Anyone can verify a sealed artifact to check its validity.
 *
 * Request body:
 * {
 *   artifact: SealedArtifact,
 *   checkRevocation?: boolean,  // default: true
 *   revocationTime?: string     // ISO timestamp for timestamp comparison
 * }
 *
 * Response:
 * {
 *   success: true,
 *   data: VerificationResult
 * }
 */
verification.post('/', async (c) => {
  try {
    const rawBody = await c.req.json();

    // Validate request body with Zod schema
    const validation = validateBody(VerifyArtifactBodySchema, rawBody);
    if (!validation.success) {
      return c.json(err('VALIDATION_ERROR', validation.error), 400);
    }

    const { artifact, checkRevocation, revocationTime } = validation.data;

    // Schema validation ensures structure matches SealedArtifact
    const result = await verificationService.verifySealedArtifact(artifact as SealedArtifact, {
      checkRevocation,
      revocationTime: revocationTime ? new Date(revocationTime) : undefined,
    });

    return c.json(ok(result));
  } catch (error) {
    log.error({ error }, 'Verification error');
    return c.json(
      err('VERIFICATION_ERROR', 'Verification failed'),
      500
    );
  }
});

/**
 * POST /api/v1/verify/signature
 * Quick signature-only verification (offline capable).
 *
 * This is a public endpoint - no authentication required.
 * Verifies only the cryptographic signatures, skipping revocation check.
 *
 * Request body:
 * {
 *   artifact: SealedArtifact
 * }
 *
 * Response:
 * {
 *   success: true,
 *   data: { valid: boolean, userSignature: boolean, orgSignature: boolean }
 * }
 */
verification.post('/signature', async (c) => {
  try {
    const rawBody = await c.req.json();

    // Validate request body with Zod schema
    const validation = validateBody(VerifySignatureBodySchema, rawBody);
    if (!validation.success) {
      return c.json(err('VALIDATION_ERROR', validation.error), 400);
    }

    // Schema validation ensures structure matches SealedArtifact
    const result = await verificationService.verifySignaturesOnly(validation.data.artifact as SealedArtifact);

    return c.json(ok(result));
  } catch (error) {
    log.error({ error }, 'Signature verification error');
    return c.json(
      err('VERIFICATION_ERROR', 'Verification failed'),
      500
    );
  }
});

/**
 * GET /api/v1/verify/status/:orgId
 * Get Status List 2021 credential for an organization.
 *
 * This is a public endpoint - required for revocation checking.
 * Returns the Status List 2021 Verifiable Credential for the organization.
 *
 * Response:
 * StatusList2021Credential (application/vc+ld+json)
 */
verification.get('/status/:orgId', async (c) => {
  const orgId = c.req.param('orgId');

  try {
    // Get organization's current DID to use as issuer
    const orgDid = await prisma.orgDidHistory.findFirst({
      where: { organizationId: orgId, validTo: null, revokedAt: null },
      orderBy: { validFrom: 'desc' },
      select: { did: true },
    });

    if (!orgDid) {
      return c.json(err('NOT_FOUND', 'Organization DID not found'), 404);
    }

    const credential = await statusListService.generateStatusListCredential(
      orgId,
      orgDid.did
    );

    // Short cache for faster revocation propagation
    // (revocations should be visible within 60s)
    return c.json(credential, 200, {
      'Content-Type': 'application/vc+ld+json',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    });
  } catch (error) {
    log.error({ error, orgId }, 'Status list error');
    return c.json(err('NOT_FOUND', 'Status list not found'), 404);
  }
});

export { verification };
