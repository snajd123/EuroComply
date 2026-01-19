import { type WaltIdClient } from '@eurocomply/walt-id';
import { type SealedArtifact } from '@eurocomply/shared';
import { StatusList2021Service } from './status-list.service.js';
import { TimestampService } from './timestamp.service.js';

/**
 * Expected domain for status list URLs.
 * Security: Only fetch status lists from trusted domains to prevent SSRF attacks.
 * Configure via STATUS_LIST_DOMAIN env var (e.g., "api.eurocomply.eu").
 */
const EXPECTED_STATUS_LIST_DOMAIN = process.env['STATUS_LIST_DOMAIN'] || null;

/**
 * Result of verifying a sealed artifact.
 */
export interface VerificationResult {
  valid: boolean;
  checks: {
    userSignature: boolean;
    orgSignature: boolean;
    revocationStatus: boolean;
    timestampValid?: boolean;
    timestampBeforeRevocation?: boolean;
  };
  errors: string[];
  warnings: string[];
  forensicContext?: {
    userSigner: string;
    organization: string;
    signedAt: string;
  };
}

/**
 * Options for verification.
 */
export interface VerificationOptions {
  /** Whether to check revocation status (default: true) */
  checkRevocation?: boolean;
  /** The time when revocation occurred (for timestamp comparison) */
  revocationTime?: Date;
}

/**
 * VerificationService verifies Sealed Artifacts following the W3C
 * Verifiable Credentials verification algorithm.
 *
 * Verification steps:
 * 1. SIGNATURE CHECK (Offline capable)
 *    - Extract public key from did:key (self-describing)
 *    - Verify userProof.signatureValue against payload
 *    - Verify corporateProof.signatureValue against userProof
 *
 * 2. REVOCATION CHECK (Online)
 *    - Fetch credentialStatus.statusListCredential
 *    - Decode bitstring at statusListIndex
 *    - If bit = 0 → Not revoked
 *    - If bit = 1 → Check timestamp...
 *
 * 3. TIMESTAMP CHECK (If revoked)
 *    - Verify RFC3161 token from TSA
 *    - Compare timestampProof.timestamp vs revocationDate
 *    - Signed BEFORE revocation → ACCEPT
 *    - Signed AFTER revocation → REJECT
 */
export class VerificationService {
  constructor(
    private readonly waltIdClient: WaltIdClient,
    private readonly statusListService: StatusList2021Service,
    private readonly timestampService: TimestampService
  ) {}

  /**
   * Verify a Sealed Artifact completely.
   *
   * @param artifact - The sealed artifact to verify
   * @param options - Verification options
   * @returns Verification result with checks and errors
   */
  async verifySealedArtifact(
    artifact: SealedArtifact,
    options: VerificationOptions = {}
  ): Promise<VerificationResult> {
    const { checkRevocation = true, revocationTime } = options;
    const errors: string[] = [];
    const warnings: string[] = [];
    const checks: VerificationResult['checks'] = {
      userSignature: false,
      orgSignature: false,
      revocationStatus: true,
    };

    // 1. Verify user signature
    try {
      const userVerifyResult = await this.waltIdClient.verify({
        vcJwt: artifact.userProof.signatureValue,
        policies: ['signature'],
      });

      checks.userSignature = userVerifyResult.valid;
      if (!userVerifyResult.valid) {
        errors.push('User signature verification failed');
      }
    } catch (error) {
      checks.userSignature = false;
      errors.push(
        `User signature verification error: ${error instanceof Error ? error.message : 'Unknown'}`
      );
    }

    // 2. Verify organization signature
    try {
      const orgVerifyResult = await this.waltIdClient.verify({
        vcJwt: artifact.corporateProof.signatureValue,
        policies: ['signature'],
      });

      checks.orgSignature = orgVerifyResult.valid;
      if (!orgVerifyResult.valid) {
        errors.push('Organization signature verification failed');
      }
    } catch (error) {
      checks.orgSignature = false;
      errors.push(
        `Organization signature verification error: ${error instanceof Error ? error.message : 'Unknown'}`
      );
    }

    // 3. Check revocation status
    if (checkRevocation && artifact.credentialStatus) {
      const { statusListCredential, statusListIndex } =
        artifact.credentialStatus;

      // Parse organization ID from status list URL using URL parsing
      // Format: https://api.eurocomply.eu/organizations/{orgId}/status-list
      // Security: Use URL parsing instead of regex to prevent injection attacks
      let orgId: string | null = null;
      try {
        const url = new URL(statusListCredential);

        // Security: Validate that status list URL comes from expected domain
        // This prevents SSRF attacks via malicious status list URLs
        if (EXPECTED_STATUS_LIST_DOMAIN && url.hostname !== EXPECTED_STATUS_LIST_DOMAIN) {
          warnings.push(
            `Status list URL domain '${url.hostname}' does not match expected domain '${EXPECTED_STATUS_LIST_DOMAIN}'`
          );
          // Skip revocation check for untrusted domains
        } else {
          const pathParts = url.pathname.split('/').filter(Boolean);
          // Expected: ['organizations', '{orgId}', 'status-list']
          const orgIndex = pathParts.indexOf('organizations');
          if (orgIndex !== -1 && pathParts[orgIndex + 1] && pathParts[orgIndex + 2] === 'status-list') {
            orgId = decodeURIComponent(pathParts[orgIndex + 1]!);
          }
        }
      } catch {
        // Invalid URL - will be handled below
      }

      if (orgId) {
        const index = parseInt(statusListIndex, 10);

        const isRevoked = await this.statusListService.isRevoked(orgId, index);

        if (isRevoked) {
          // Check if we have a timestamp proof that predates revocation
          if (artifact.timestampProof && revocationTime) {
            const timestampDate = new Date(artifact.timestampProof.timestamp);

            if (timestampDate < revocationTime) {
              checks.revocationStatus = true;
              checks.timestampBeforeRevocation = true;
              warnings.push(
                'Credential is revoked, but signature timestamp predates revocation'
              );
            } else {
              checks.revocationStatus = false;
              checks.timestampBeforeRevocation = false;
              errors.push('Credential has been revoked');
            }
          } else {
            checks.revocationStatus = false;
            errors.push('Credential has been revoked');
          }
        } else {
          checks.revocationStatus = true;
        }
      } else {
        warnings.push('Could not parse status list URL for revocation check');
      }
    }

    // 4. Verify timestamp if present
    if (artifact.timestampProof) {
      try {
        const payloadHash = TimestampService.hashPayload(artifact.payload);
        const tsResult = await this.timestampService.verifyTimestamp(
          artifact.timestampProof.token,
          payloadHash
        );

        checks.timestampValid = tsResult.valid;
        if (!tsResult.valid) {
          warnings.push('Timestamp verification failed');
        }
      } catch (error) {
        checks.timestampValid = false;
        warnings.push(
          `Timestamp verification error: ${error instanceof Error ? error.message : 'Unknown'}`
        );
      }
    }

    // Build result
    const valid =
      checks.userSignature && checks.orgSignature && checks.revocationStatus;

    return {
      valid,
      checks,
      errors,
      warnings,
      forensicContext: {
        userSigner: artifact.userProof.forensicContext.signerName,
        organization: artifact.corporateProof.forensicContext.organizationName,
        signedAt: artifact.userProof.created,
      },
    };
  }

  /**
   * Quick signature-only verification (offline capable).
   *
   * This method verifies only the cryptographic signatures without
   * checking revocation status. Useful for offline scenarios.
   *
   * @param artifact - The sealed artifact to verify
   * @returns Signature verification result
   */
  async verifySignaturesOnly(artifact: SealedArtifact): Promise<{
    valid: boolean;
    userSignature: boolean;
    orgSignature: boolean;
  }> {
    const result = await this.verifySealedArtifact(artifact, {
      checkRevocation: false,
    });

    return {
      valid: result.checks.userSignature && result.checks.orgSignature,
      userSignature: result.checks.userSignature,
      orgSignature: result.checks.orgSignature,
    };
  }
}
