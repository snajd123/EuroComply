import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma, CredentialType, CredentialStatus } from '@eurocomply/database';
import { ApiError } from '../../../common/middleware/errorHandler.js';
import { workforceIdentityService } from '../services/identity.service.js';

// Validation schemas
const IssueCredentialSchema = z.object({
  schemaId: z.string(),
  subjectName: z.string().min(1),
  subjectEmail: z.string().email().optional(),
  subjectDid: z.string().optional(),
  claims: z.record(z.unknown()),
  expiresInDays: z.number().positive().optional(),
});

const VerifyCredentialSchema = z.object({
  vcJwt: z.string(),
});

const ListQuerySchema = z.object({
  page: z.coerce.number().positive().default(1),
  pageSize: z.coerce.number().positive().max(100).default(20),
  status: z.enum(['PENDING', 'ISSUED', 'REVOKED', 'EXPIRED']).optional(),
  schemaId: z.string().optional(),
});

export const credentialController = {
  /**
   * Issue a new Verifiable Credential
   */
  async issue(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = IssueCredentialSchema.parse(req.body);
      const organizationId = req.auth!.organizationId;

      // Get or create the organization's DID
      const { did: issuerDid, keyId: issuerKeyId } = await workforceIdentityService.ensureOrganizationDid(organizationId);

      // Get the credential schema
      const schema = await prisma.credentialSchema.findUnique({
        where: { id: body.schemaId },
      });

      if (!schema) {
        throw ApiError.notFound('Credential schema');
      }

      // Calculate expiration
      const issuanceDate = new Date();
      const expirationDate = body.expiresInDays
        ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
        : undefined;

      // Create credential record
      const credential = await prisma.credential.create({
        data: {
          organizationId,
          schemaId: body.schemaId,
          subjectName: body.subjectName,
          subjectEmail: body.subjectEmail,
          subjectDid: body.subjectDid,
          claims: body.claims,
          status: 'PENDING',
        },
      });

      try {
        // Issue via shared identity service
        const credentialTypes = ['VerifiableCredential', schema.name];
        const issued = await workforceIdentityService.issueCredential(
          issuerDid,
          issuerKeyId,
          {
            type: credentialTypes,
            issuer: issuerDid,
            issuanceDate: issuanceDate.toISOString(),
            expirationDate: expirationDate?.toISOString(),
            credentialSubject: {
              id: body.subjectDid,
              name: body.subjectName,
              email: body.subjectEmail,
              ...body.claims,
            },
          }
        );

        // Update credential with issued data
        const updatedCredential = await prisma.credential.update({
          where: { id: credential.id },
          data: {
            vcId: issued.id,
            vcJwt: issued.vcJwt,
            vcJson: issued.vcJson,
            issuedAt: issuanceDate,
            expiresAt: expirationDate,
            status: 'ISSUED',
          },
          include: {
            schema: {
              select: { name: true, type: true },
            },
          },
        });

        // Generate OID4VCI offer URL for wallet issuance
        const { offerUrl } = await workforceIdentityService.generateOid4vciOffer(
          credential.id,
          schema.name
        );

        res.status(201).json({
          success: true,
          data: {
            ...updatedCredential,
            offerUrl, // URL for wallet to claim credential
          },
          meta: {
            requestId: req.requestId,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        // Mark credential as failed
        await prisma.credential.update({
          where: { id: credential.id },
          data: { status: 'PENDING' },
        });
        throw error;
      }
    } catch (error) {
      next(error);
    }
  },

  /**
   * Verify a presented Verifiable Credential
   */
  async verify(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { vcJwt } = VerifyCredentialSchema.parse(req.body);

      const result = await workforceIdentityService.verifyCredential(vcJwt);

      res.json({
        success: true,
        data: {
          valid: result.valid,
          checks: result.checks,
          credential: result.credential,
          errors: result.errors,
        },
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * List credentials
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = ListQuerySchema.parse(req.query);
      const organizationId = req.auth!.organizationId;

      const where = {
        organizationId,
        ...(query.status && { status: query.status as CredentialStatus }),
        ...(query.schemaId && { schemaId: query.schemaId }),
      };

      const [credentials, total] = await Promise.all([
        prisma.credential.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          include: {
            schema: {
              select: { name: true, type: true },
            },
          },
        }),
        prisma.credential.count({ where }),
      ]);

      res.json({
        success: true,
        data: credentials,
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          totalItems: total,
          totalPages: Math.ceil(total / query.pageSize),
          hasMore: query.page * query.pageSize < total,
        },
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get a single credential
   */
  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const organizationId = req.auth!.organizationId;

      const credential = await prisma.credential.findFirst({
        where: { id, organizationId },
        include: {
          schema: true,
          verificationRequests: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      });

      if (!credential) {
        throw ApiError.notFound('Credential');
      }

      res.json({
        success: true,
        data: credential,
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Revoke a credential
   */
  async revoke(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const organizationId = req.auth!.organizationId;

      const credential = await prisma.credential.findFirst({
        where: { id, organizationId },
      });

      if (!credential) {
        throw ApiError.notFound('Credential');
      }

      if (credential.status === 'REVOKED') {
        throw ApiError.conflict('Credential is already revoked');
      }

      // Update credential status
      const updated = await prisma.credential.update({
        where: { id },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revocationReason: reason,
        },
      });

      // TODO: Add to revocation registry via walt.id

      res.json({
        success: true,
        data: {
          id: updated.id,
          status: updated.status,
          revokedAt: updated.revokedAt,
          revocationReason: updated.revocationReason,
        },
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  },
};
