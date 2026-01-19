import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { ok, err } from '@eurocomply/shared';
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

// Initialize services (lazy initialization to allow for proper configuration)
let verificationService: VerificationService | null = null;
let statusListService: StatusList2021Service | null = null;

function getStatusListService(): StatusList2021Service {
  if (!statusListService) {
    statusListService = new StatusList2021Service(prisma);
  }
  return statusListService;
}

function getVerificationService(): VerificationService {
  if (!verificationService) {
    const waltIdClient = createWaltIdClient();
    const statusList = getStatusListService();

    // Use configurable TSA provider (default: FREETSA)
    const tsaProvider = process.env['TSA_PROVIDER'] || 'FREETSA';
    if (tsaProvider === 'FREETSA' && process.env['NODE_ENV'] === 'production') {
      console.warn(
        '[Timestamp] WARNING: Using FREETSA in production. ' +
        'Consider using a qualified TSA for legally binding timestamps. ' +
        'Set TSA_PROVIDER environment variable to configure.'
      );
    }

    const timestampService = TimestampService.forProvider(tsaProvider as 'FREETSA');
    verificationService = new VerificationService(
      waltIdClient,
      statusList,
      timestampService
    );
  }
  return verificationService;
}

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

    const service = getVerificationService();
    const result = await service.verifySealedArtifact(artifact as any, {
      checkRevocation,
      revocationTime: revocationTime ? new Date(revocationTime) : undefined,
    });

    return c.json(ok(result));
  } catch (error) {
    console.error('Verification error:', error);
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

    const service = getVerificationService();
    const result = await service.verifySignaturesOnly(validation.data.artifact as any);

    return c.json(ok(result));
  } catch (error) {
    console.error('Signature verification error:', error);
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

    const service = getStatusListService();
    const credential = await service.generateStatusListCredential(
      orgId,
      orgDid.did
    );

    return c.json(credential, 200, {
      'Content-Type': 'application/vc+ld+json',
      'Cache-Control': 'public, max-age=300', // 5 minute cache
    });
  } catch (error) {
    console.error('Status list error:', error);
    return c.json(err('NOT_FOUND', 'Status list not found'), 404);
  }
});

export { verification };
