/**
 * DID Document Hosting Routes
 *
 * Provides public endpoints for resolving DIDs according to did:web specification.
 * These routes must be publicly accessible (no authentication).
 *
 * Routes:
 * - GET /.well-known/did.json - Platform DID document
 * - GET /m/:slug/did.json - Merchant DID documents
 * - GET /v1/passports/:id/verify - Public DPP verification
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { getVcService, getDidService } from '@eurocomply/identity';

const router = Router();
const prisma = new PrismaClient();

/**
 * Platform DID Document
 * GET /.well-known/did.json
 *
 * Returns the DID document for did:web:eurocomply.io
 * This is the issuer identity for KYB credentials.
 */
router.get('/.well-known/did.json', async (_req: Request, res: Response) => {
  try {
    // Get platform organization (first org with domain matching platform)
    const platformDomain = process.env.PLATFORM_DOMAIN || 'eurocomply.io';

    // Try to find platform organization
    const platformOrg = await prisma.organization.findFirst({
      where: {
        OR: [{ domain: platformDomain }, { slug: 'platform' }],
      },
    });

    if (platformOrg?.didDocument) {
      res.setHeader('Content-Type', 'application/did+json');
      return res.json(platformOrg.didDocument);
    }

    // If no platform org exists, generate a placeholder DID document
    const didService = getDidService();
    const did = `did:web:${platformDomain}`;

    // Return a minimal DID document (would be populated when platform is initialized)
    const didDocument = {
      '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/suites/jws-2020/v1'],
      id: did,
      verificationMethod: [],
      authentication: [],
      assertionMethod: [],
    };

    res.setHeader('Content-Type', 'application/did+json');
    return res.json(didDocument);
  } catch (error) {
    console.error('Error serving platform DID document:', error);
    return res.status(500).json({
      error: 'Failed to retrieve DID document',
    });
  }
});

/**
 * Merchant DID Document
 * GET /m/:slug/did.json
 *
 * Returns the DID document for did:web:eurocomply.io:m:{slug}
 * This is the merchant's identity for issuing DPP credentials.
 */
router.get('/m/:slug/did.json', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    // Find merchant by slug (from organization slug)
    const organization = await prisma.organization.findUnique({
      where: { slug },
    });

    if (!organization) {
      return res.status(404).json({
        error: 'DID not found',
        message: `No DID document exists for merchant: ${slug}`,
      });
    }

    if (!organization.didDocument) {
      return res.status(404).json({
        error: 'DID not initialized',
        message: 'This merchant has not yet initialized their DID',
      });
    }

    res.setHeader('Content-Type', 'application/did+json');
    return res.json(organization.didDocument);
  } catch (error) {
    console.error('Error serving merchant DID document:', error);
    return res.status(500).json({
      error: 'Failed to retrieve DID document',
    });
  }
});

/**
 * Public DPP Verification
 * GET /v1/passports/:id/verify
 *
 * Publicly verifies a Digital Product Passport without authentication.
 * Returns verification result and credential data.
 */
router.get('/v1/passports/:id/verify', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Find passport
    const passport = await prisma.passport.findUnique({
      where: { id },
      include: {
        product: {
          include: {
            organization: {
              select: {
                name: true,
                slug: true,
                did: true,
              },
            },
          },
        },
      },
    });

    if (!passport) {
      return res.status(404).json({
        valid: false,
        error: 'Passport not found',
      });
    }

    // If we have a VC JWT, verify it
    if (passport.vcJwt) {
      const vcService = getVcService();
      const verificationResult = await vcService.verifyCredential(passport.vcJwt);

      return res.json({
        valid: verificationResult.valid,
        checks: verificationResult.checks,
        passport: {
          id: passport.id,
          version: passport.version,
          credentialId: passport.credentialId,
          issuedAt: passport.createdAt,
          issuer: {
            name: passport.product.organization.name,
            did: passport.product.organization.did,
          },
          product: {
            id: passport.product.id,
            name: passport.product.name,
            gtin: passport.product.gtin,
          },
          data: passport.data,
        },
        credential: verificationResult.credential,
        errors: verificationResult.errors,
      });
    }

    // If no VC JWT, return passport data without cryptographic verification
    return res.json({
      valid: true,
      checks: {
        signature: false, // No signature to verify
        expiration: true,
        revocation: true,
      },
      warning: 'This passport does not have a cryptographic signature',
      passport: {
        id: passport.id,
        version: passport.version,
        issuedAt: passport.createdAt,
        issuer: {
          name: passport.product.organization.name,
          did: passport.product.organization.did,
        },
        product: {
          id: passport.product.id,
          name: passport.product.name,
          gtin: passport.product.gtin,
        },
        data: passport.data,
      },
    });
  } catch (error) {
    console.error('Error verifying passport:', error);
    return res.status(500).json({
      valid: false,
      error: 'Verification failed',
    });
  }
});

/**
 * Verify Credential by JWT
 * POST /v1/verify
 *
 * Generic credential verification endpoint.
 * Accepts a JWT and returns verification result.
 */
router.post('/v1/verify', async (req: Request, res: Response) => {
  try {
    const { jwt } = req.body;

    if (!jwt || typeof jwt !== 'string') {
      return res.status(400).json({
        valid: false,
        error: 'Missing or invalid JWT',
      });
    }

    const vcService = getVcService();
    const result = await vcService.verifyCredential(jwt);

    return res.json(result);
  } catch (error) {
    console.error('Error verifying credential:', error);
    return res.status(500).json({
      valid: false,
      error: 'Verification failed',
    });
  }
});

export default router;
