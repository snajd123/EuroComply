import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma, DsaStatus } from '@eurocomply/database';
import { ApiError } from '../../../common/middleware/errorHandler.js';
import { logger } from '../../../common/utils/logger.js';

// ===========================================
// IBAN VALIDATION
// ===========================================

/**
 * Validate IBAN format and checksum
 * Based on ISO 13616-1:2007
 */
function validateIBAN(iban: string): { valid: boolean; country?: string; error?: string } {
  // Remove spaces and convert to uppercase
  const cleanIban = iban.replace(/\s/g, '').toUpperCase();

  // Check basic format (2 letters + 2 digits + up to 30 alphanumeric)
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(cleanIban)) {
    return { valid: false, error: 'Invalid IBAN format' };
  }

  const country = cleanIban.substring(0, 2);

  // Country-specific length validation
  const ibanLengths: Record<string, number> = {
    AL: 28, AD: 24, AT: 20, AZ: 28, BH: 22, BY: 28, BE: 16, BA: 20,
    BR: 29, BG: 22, CR: 22, HR: 21, CY: 28, CZ: 24, DK: 18, DO: 28,
    EG: 29, SV: 28, EE: 20, FO: 18, FI: 18, FR: 27, GE: 22, DE: 22,
    GI: 23, GR: 27, GL: 18, GT: 28, HU: 28, IS: 26, IQ: 23, IE: 22,
    IL: 23, IT: 27, JO: 30, KZ: 20, XK: 20, KW: 30, LV: 21, LB: 28,
    LI: 21, LT: 20, LU: 20, MT: 31, MR: 27, MU: 30, MD: 24, MC: 27,
    ME: 22, NL: 18, MK: 19, NO: 15, PK: 24, PS: 29, PL: 28, PT: 25,
    QA: 29, RO: 24, LC: 32, SM: 27, ST: 25, SA: 24, RS: 22, SC: 31,
    SK: 24, SI: 19, ES: 24, SE: 24, CH: 21, TL: 23, TN: 24, TR: 26,
    UA: 29, AE: 23, GB: 22, VA: 22, VG: 24,
  };

  if (ibanLengths[country] && cleanIban.length !== ibanLengths[country]) {
    return { valid: false, country, error: `Invalid length for ${country} IBAN` };
  }

  // Move first 4 chars to end
  const rearranged = cleanIban.substring(4) + cleanIban.substring(0, 4);

  // Convert letters to numbers (A=10, B=11, ..., Z=35)
  let numericString = '';
  for (const char of rearranged) {
    if (/[A-Z]/.test(char)) {
      numericString += (char.charCodeAt(0) - 55).toString();
    } else {
      numericString += char;
    }
  }

  // Perform mod 97 check (must equal 1)
  // Use BigInt for large numbers
  const remainder = BigInt(numericString) % 97n;
  if (remainder !== 1n) {
    return { valid: false, country, error: 'Invalid IBAN checksum' };
  }

  return { valid: true, country };
}

/**
 * Extract bank info from IBAN (basic)
 */
function extractBankInfo(iban: string): { bankCode?: string; branchCode?: string } {
  const cleanIban = iban.replace(/\s/g, '').toUpperCase();
  const country = cleanIban.substring(0, 2);

  // Country-specific bank code extraction
  switch (country) {
    case 'DE': // Germany: DEkk BBBB BBBB CCCC CCCC CC
      return { bankCode: cleanIban.substring(4, 12) };
    case 'GB': // UK: GBkk BBBB SSSS SSCC CCCC CC
      return { bankCode: cleanIban.substring(4, 8), branchCode: cleanIban.substring(8, 14) };
    case 'FR': // France: FRkk BBBB BGGG GGCC CCCC CCCC CKK
      return { bankCode: cleanIban.substring(4, 9), branchCode: cleanIban.substring(9, 14) };
    case 'NL': // Netherlands: NLkk BBBB CCCC CCCC CC
      return { bankCode: cleanIban.substring(4, 8) };
    case 'ES': // Spain: ESkk BBBB GGGG KKCC CCCC CCCC
      return { bankCode: cleanIban.substring(4, 8), branchCode: cleanIban.substring(8, 12) };
    default:
      return {};
  }
}

// ===========================================
// VALIDATION SCHEMAS
// ===========================================

const SelfCertificationSchema = z.object({
  accepted: z.literal(true), // Must be true
  // Optional: let them provide the declaration text version they agreed to
  declarationVersion: z.string().optional(),
});

const BankAccountSchema = z.object({
  accountHolder: z.string().min(1, 'Account holder name is required'),
  iban: z.string().min(15, 'IBAN is required'),
  bic: z.string().optional(),
  bankName: z.string().optional(),
});

const DocumentAttestationSchema = z.object({
  documentType: z.enum([
    'PASSPORT',
    'NATIONAL_ID',
    'DRIVERS_LICENSE',
    'RESIDENCE_PERMIT',
    'COMPANY_REGISTRATION',
    'PROOF_OF_ADDRESS',
  ]),
  documentDescription: z.string().optional(), // e.g., "German passport"
  documentNumberLast4: z.string().max(4).optional(), // Only last 4 chars
  documentExpiry: z.string().datetime().optional(),
  documentCountry: z.string().length(2).optional(), // ISO country code
  // For UBO verification
  uboId: z.string().optional(),
});

// ===========================================
// DSA SELF-CERTIFICATION TEXT
// ===========================================

const DSA_SELF_CERTIFICATION_TEXT = `
TRADER SELF-CERTIFICATION UNDER DIGITAL SERVICES ACT (EU) 2022/2065

By accepting this certification, I, as an authorized representative of the trader identified in this platform, hereby declare and certify that:

1. PRODUCT/SERVICE COMPLIANCE
   All products and/or services offered through online platforms by this trader comply with applicable Union law, including but not limited to:
   - Consumer protection regulations
   - Product safety requirements
   - Intellectual property rights
   - Data protection regulations (GDPR)

2. INFORMATION ACCURACY
   All information provided to this platform regarding the trader's identity, contact details, and business registration is accurate, complete, and up-to-date.

3. COMMITMENT TO UPDATE
   I commit to promptly inform the platform of any changes to the information provided.

4. ACKNOWLEDGMENT OF OBLIGATIONS
   I acknowledge that:
   - This certification is required under Article 30 of the Digital Services Act
   - Providing false information may result in suspension from platforms
   - Platforms may make this information publicly available
   - This certification does not limit the trader's liability under applicable law

5. LEGAL AUTHORITY
   I confirm that I have the legal authority to make this certification on behalf of the trader.

This certification is made in accordance with Article 30(1)(e) of Regulation (EU) 2022/2065 (Digital Services Act).
`.trim();

// ===========================================
// CONTROLLER
// ===========================================

export const dsaController = {
  /**
   * Submit DSA self-certification (Article 30(1)(e))
   * Trader declares that products/services comply with EU law
   */
  async submitSelfCertification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const body = SelfCertificationSchema.parse(req.body);
      const organizationId = req.auth!.organizationId;

      const merchant = await prisma.merchant.findFirst({
        where: { id, organizationId },
      });

      if (!merchant) {
        throw ApiError.notFound('Trader');
      }

      // Record the self-certification
      const updatedMerchant = await prisma.merchant.update({
        where: { id },
        data: {
          selfCertificationAccepted: true,
          selfCertificationText: DSA_SELF_CERTIFICATION_TEXT,
          selfCertifiedAt: new Date(),
          selfCertifiedIpAddress: req.ip || req.socket.remoteAddress,
        },
      });

      // Log to audit trail
      await prisma.auditLog.create({
        data: {
          organizationId,
          actorType: 'API_KEY',
          actorId: req.auth?.apiKeyId,
          action: 'DSA_SELF_CERTIFICATION_SUBMITTED',
          resourceType: 'Merchant',
          resourceId: id,
          details: {
            declarationVersion: body.declarationVersion || '1.0',
            ipAddress: req.ip || req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
          },
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
        },
      });

      logger.info('DSA self-certification submitted', {
        merchantId: id,
        organizationId,
      });

      res.json({
        success: true,
        data: {
          traderId: merchant.id,
          selfCertification: {
            accepted: true,
            certifiedAt: updatedMerchant.selfCertifiedAt,
            declarationText: DSA_SELF_CERTIFICATION_TEXT,
          },
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
   * Get self-certification status
   */
  async getSelfCertification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const organizationId = req.auth!.organizationId;

      const merchant = await prisma.merchant.findFirst({
        where: { id, organizationId },
        select: {
          id: true,
          legalName: true,
          selfCertificationAccepted: true,
          selfCertificationText: true,
          selfCertifiedAt: true,
        },
      });

      if (!merchant) {
        throw ApiError.notFound('Trader');
      }

      res.json({
        success: true,
        data: {
          traderId: merchant.id,
          legalName: merchant.legalName,
          selfCertification: {
            accepted: merchant.selfCertificationAccepted,
            certifiedAt: merchant.selfCertifiedAt,
            // Return the declaration text so they know what they're agreeing to
            declarationText: DSA_SELF_CERTIFICATION_TEXT,
          },
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
   * Add bank account (Article 30(1)(d))
   */
  async addBankAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const body = BankAccountSchema.parse(req.body);
      const organizationId = req.auth!.organizationId;

      const merchant = await prisma.merchant.findFirst({
        where: { id, organizationId },
      });

      if (!merchant) {
        throw ApiError.notFound('Trader');
      }

      // Validate IBAN
      const ibanValidation = validateIBAN(body.iban);
      if (!ibanValidation.valid) {
        throw ApiError.badRequest(ibanValidation.error || 'Invalid IBAN');
      }

      // Clean IBAN for storage
      const cleanIban = body.iban.replace(/\s/g, '').toUpperCase();

      // Check if this IBAN already exists for this merchant
      const existingAccount = await prisma.bankAccount.findFirst({
        where: { merchantId: id, iban: cleanIban },
      });

      if (existingAccount) {
        throw ApiError.badRequest('This bank account is already registered');
      }

      // Create bank account
      const bankAccount = await prisma.bankAccount.create({
        data: {
          merchantId: id,
          accountHolder: body.accountHolder,
          iban: cleanIban,
          bic: body.bic?.toUpperCase(),
          bankName: body.bankName,
          ibanValid: true,
          ibanCountry: ibanValidation.country,
          status: 'IBAN_VERIFIED', // IBAN checksum passed
          verifiedAt: new Date(),
          verificationMethod: 'iban_checksum',
          addedByIp: req.ip || req.socket.remoteAddress,
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          organizationId,
          actorType: 'API_KEY',
          actorId: req.auth?.apiKeyId,
          action: 'BANK_ACCOUNT_ADDED',
          resourceType: 'BankAccount',
          resourceId: bankAccount.id,
          details: {
            merchantId: id,
            ibanCountry: ibanValidation.country,
            // Don't log full IBAN for security
            ibanLast4: cleanIban.slice(-4),
          },
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
        },
      });

      logger.info('Bank account added', {
        merchantId: id,
        bankAccountId: bankAccount.id,
        ibanCountry: ibanValidation.country,
      });

      res.status(201).json({
        success: true,
        data: {
          id: bankAccount.id,
          accountHolder: bankAccount.accountHolder,
          iban: maskIBAN(bankAccount.iban),
          ibanCountry: bankAccount.ibanCountry,
          bic: bankAccount.bic,
          bankName: bankAccount.bankName,
          status: bankAccount.status,
          verifiedAt: bankAccount.verifiedAt,
          verificationMethod: bankAccount.verificationMethod,
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
   * List bank accounts for a merchant
   */
  async listBankAccounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const organizationId = req.auth!.organizationId;

      const merchant = await prisma.merchant.findFirst({
        where: { id, organizationId },
      });

      if (!merchant) {
        throw ApiError.notFound('Trader');
      }

      const bankAccounts = await prisma.bankAccount.findMany({
        where: { merchantId: id },
        orderBy: { createdAt: 'desc' },
      });

      res.json({
        success: true,
        data: bankAccounts.map((account) => ({
          id: account.id,
          accountHolder: account.accountHolder,
          iban: maskIBAN(account.iban),
          ibanCountry: account.ibanCountry,
          bic: account.bic,
          bankName: account.bankName,
          status: account.status,
          verifiedAt: account.verifiedAt,
          verificationMethod: account.verificationMethod,
          createdAt: account.createdAt,
        })),
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
   * Delete a bank account
   */
  async deleteBankAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, accountId } = req.params;
      const organizationId = req.auth!.organizationId;

      const merchant = await prisma.merchant.findFirst({
        where: { id, organizationId },
      });

      if (!merchant) {
        throw ApiError.notFound('Trader');
      }

      const bankAccount = await prisma.bankAccount.findFirst({
        where: { id: accountId, merchantId: id },
      });

      if (!bankAccount) {
        throw ApiError.notFound('Bank account');
      }

      await prisma.bankAccount.delete({
        where: { id: accountId },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          organizationId,
          actorType: 'API_KEY',
          actorId: req.auth?.apiKeyId,
          action: 'BANK_ACCOUNT_DELETED',
          resourceType: 'BankAccount',
          resourceId: accountId,
          details: { merchantId: id },
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
        },
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  /**
   * Submit document attestation (Article 30(1)(b))
   * Trader attests they have the required ID document
   */
  async submitDocumentAttestation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const body = DocumentAttestationSchema.parse(req.body);
      const organizationId = req.auth!.organizationId;

      const merchant = await prisma.merchant.findFirst({
        where: { id, organizationId },
      });

      if (!merchant) {
        throw ApiError.notFound('Trader');
      }

      // If uboId is provided, verify it exists
      if (body.uboId) {
        const ubo = await prisma.ubo.findFirst({
          where: { id: body.uboId, merchantId: id },
        });
        if (!ubo) {
          throw ApiError.notFound('UBO');
        }
      }

      // Build the legal declaration text
      const declarationText = `
I, as an authorized representative of ${merchant.legalName}, hereby attest that:

1. I possess a valid ${body.documentType.replace('_', ' ').toLowerCase()}${body.documentDescription ? ` (${body.documentDescription})` : ''}${body.documentCountry ? ` issued by ${body.documentCountry}` : ''}.

2. The document is genuine, valid, and not expired${body.documentExpiry ? ` (expires: ${body.documentExpiry})` : ''}.

3. I understand that:
   - This attestation is made under Article 30(1)(b) of the Digital Services Act
   - I may be required to provide the actual document upon request by the platform or authorities
   - Providing false attestation may result in account suspension and legal consequences

4. I consent to the platform recording this attestation for compliance purposes.

Attestation made on: ${new Date().toISOString()}
IP Address: ${req.ip || req.socket.remoteAddress}
      `.trim();

      // Create attestation record
      const attestation = await prisma.documentAttestation.create({
        data: {
          merchantId: id,
          documentType: body.documentType,
          attestedDocumentDescription: body.documentDescription,
          attestedDocumentNumber: body.documentNumberLast4 ? `***${body.documentNumberLast4}` : null,
          attestedDocumentExpiry: body.documentExpiry ? new Date(body.documentExpiry) : null,
          attestedDocumentCountry: body.documentCountry,
          declarationText,
          declarationAccepted: true,
          declaredAt: new Date(),
          declaredByIp: req.ip || req.socket.remoteAddress,
          status: 'SELF_DECLARED',
          uboId: body.uboId,
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          organizationId,
          actorType: 'API_KEY',
          actorId: req.auth?.apiKeyId,
          action: 'DOCUMENT_ATTESTATION_SUBMITTED',
          resourceType: 'DocumentAttestation',
          resourceId: attestation.id,
          details: {
            merchantId: id,
            documentType: body.documentType,
            documentCountry: body.documentCountry,
            uboId: body.uboId,
          },
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
        },
      });

      logger.info('Document attestation submitted', {
        merchantId: id,
        attestationId: attestation.id,
        documentType: body.documentType,
      });

      res.status(201).json({
        success: true,
        data: {
          id: attestation.id,
          documentType: attestation.documentType,
          documentDescription: attestation.attestedDocumentDescription,
          documentCountry: attestation.attestedDocumentCountry,
          documentExpiry: attestation.attestedDocumentExpiry,
          status: attestation.status,
          declaredAt: attestation.declaredAt,
          uboId: attestation.uboId,
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
   * List document attestations for a merchant
   */
  async listDocumentAttestations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const organizationId = req.auth!.organizationId;

      const merchant = await prisma.merchant.findFirst({
        where: { id, organizationId },
      });

      if (!merchant) {
        throw ApiError.notFound('Trader');
      }

      const attestations = await prisma.documentAttestation.findMany({
        where: { merchantId: id },
        orderBy: { createdAt: 'desc' },
      });

      res.json({
        success: true,
        data: attestations.map((a) => ({
          id: a.id,
          documentType: a.documentType,
          documentDescription: a.attestedDocumentDescription,
          documentNumber: a.attestedDocumentNumber,
          documentCountry: a.attestedDocumentCountry,
          documentExpiry: a.attestedDocumentExpiry,
          status: a.status,
          declaredAt: a.declaredAt,
          idvProvider: a.idvProvider,
          idvVerifiedAt: a.idvVerifiedAt,
          uboId: a.uboId,
          createdAt: a.createdAt,
        })),
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
   * Get full DSA compliance status with all checks
   */
  async getFullComplianceStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const organizationId = req.auth!.organizationId;

      const merchant = await prisma.merchant.findFirst({
        where: { id, organizationId },
        include: {
          kybVerifications: true,
          sanctionsChecks: true,
          bankAccounts: true,
          documentAttestations: true,
          ubos: true,
        },
      });

      if (!merchant) {
        throw ApiError.notFound('Trader');
      }

      // DSA Article 30 compliance checklist
      const checks = {
        // (a) Contact info
        contactInfo: {
          name: !!merchant.legalName,
          address: !!(merchant.addressLine1 && merchant.city && merchant.postalCode && merchant.country),
          email: !!merchant.email,
          phone: !!merchant.phone,
          complete: false,
        },
        // (b) ID document
        idDocument: {
          hasAttestation: merchant.documentAttestations.some(
            (a) => ['PASSPORT', 'NATIONAL_ID', 'DRIVERS_LICENSE'].includes(a.documentType)
          ),
          status: merchant.documentAttestations.find(
            (a) => ['PASSPORT', 'NATIONAL_ID', 'DRIVERS_LICENSE'].includes(a.documentType)
          )?.status || 'NOT_PROVIDED',
          complete: false,
        },
        // (c) Trade register
        tradeRegister: {
          hasRegistrationNumber: !!merchant.registrationNumber,
          verified: merchant.kybVerifications.some(
            (v) => v.type === 'BUSINESS_REGISTRY' && v.status === 'VERIFIED'
          ),
          complete: false,
        },
        // (d) Bank account
        bankAccount: {
          hasAccount: merchant.bankAccounts.length > 0,
          verified: merchant.bankAccounts.some((a) => a.status === 'IBAN_VERIFIED' || a.status === 'BANK_VERIFIED'),
          complete: false,
        },
        // (e) Self-certification
        selfCertification: {
          accepted: merchant.selfCertificationAccepted,
          certifiedAt: merchant.selfCertifiedAt,
          complete: merchant.selfCertificationAccepted,
        },
        // (f) VAT number (if applicable)
        vatNumber: {
          provided: !!merchant.vatNumber,
          verified: merchant.kybVerifications.some(
            (v) => v.type === 'VAT_VALIDATION' && v.status === 'VERIFIED'
          ),
          complete: false,
        },
        // Additional: Sanctions screening
        sanctionsCleared: {
          checked: merchant.sanctionsChecks.length > 0,
          clear: merchant.sanctionsChecks.every((s) => s.status === 'CLEAR'),
          complete: false,
        },
      };

      // Calculate completeness for each check
      checks.contactInfo.complete =
        checks.contactInfo.name &&
        checks.contactInfo.address &&
        checks.contactInfo.email &&
        checks.contactInfo.phone;

      checks.idDocument.complete = checks.idDocument.hasAttestation;
      checks.tradeRegister.complete = checks.tradeRegister.hasRegistrationNumber;
      checks.bankAccount.complete = checks.bankAccount.hasAccount && checks.bankAccount.verified;
      checks.vatNumber.complete = !merchant.vatNumber || checks.vatNumber.verified;
      checks.sanctionsCleared.complete = checks.sanctionsCleared.checked && checks.sanctionsCleared.clear;

      // Calculate overall compliance
      const requiredChecks = [
        checks.contactInfo.complete,
        checks.idDocument.complete,
        checks.tradeRegister.complete,
        checks.bankAccount.complete,
        checks.selfCertification.complete,
      ];

      const optionalChecks = [
        checks.vatNumber.complete,
        checks.sanctionsCleared.complete,
      ];

      const requiredComplete = requiredChecks.filter(Boolean).length;
      const totalRequired = requiredChecks.length;
      const complianceScore = Math.round((requiredComplete / totalRequired) * 100);

      // Determine DSA status
      let dsaStatus: DsaStatus = 'IN_PROGRESS';
      if (complianceScore === 100) {
        dsaStatus = 'COMPLIANT';
      } else if (complianceScore === 0) {
        dsaStatus = 'NOT_STARTED';
      }

      // Update merchant DSA status if changed
      if (merchant.dsaStatus !== dsaStatus) {
        await prisma.merchant.update({
          where: { id },
          data: {
            dsaStatus,
            dsaCompletedAt: dsaStatus === 'COMPLIANT' ? new Date() : null,
          },
        });
      }

      res.json({
        success: true,
        data: {
          traderId: merchant.id,
          legalName: merchant.legalName,
          dsaStatus,
          complianceScore,
          article30Checks: {
            '(a) Contact Information': checks.contactInfo,
            '(b) ID Document': checks.idDocument,
            '(c) Trade Register': checks.tradeRegister,
            '(d) Bank Account': checks.bankAccount,
            '(e) Self-Certification': checks.selfCertification,
            '(f) VAT Number': checks.vatNumber,
          },
          additionalChecks: {
            sanctionsCleared: checks.sanctionsCleared,
          },
          summary: {
            requiredChecksComplete: requiredComplete,
            requiredChecksTotal: totalRequired,
            missingRequired: requiredChecks
              .map((complete, i) => ({ complete, check: ['contactInfo', 'idDocument', 'tradeRegister', 'bankAccount', 'selfCertification'][i] }))
              .filter((c) => !c.complete)
              .map((c) => c.check),
          },
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

/**
 * Mask IBAN for display (show first 4 and last 4 only)
 */
function maskIBAN(iban: string): string {
  if (iban.length <= 8) return iban;
  return `${iban.substring(0, 4)}${'*'.repeat(iban.length - 8)}${iban.substring(iban.length - 4)}`;
}
