import { createHash } from 'crypto';
import type {
  UserForensicContext,
  OrgForensicContext,
  SealedArtifact,
  CredentialStatus,
  TimestampProof,
} from '@eurocomply/shared';
import { ValidationError } from '../lib/errors.js';
import { WaltIdClient, createWaltIdClient } from '@eurocomply/walt-id';

/**
 * User proof structure for Ed25519Signature2020 signatures.
 */
export interface UserProof {
  type: 'Ed25519Signature2020';
  verificationMethod: string;
  signatureValue: string;
  created: string;
  forensicContext: UserForensicContext;
}

/**
 * Corporate proof structure for Ed25519Signature2020 signatures.
 */
export interface CorporateProof {
  type: 'Ed25519Signature2020';
  verificationMethod: string;
  signatureValue: string;
  created: string;
  forensicContext: OrgForensicContext;
}

/**
 * User context for creating corporate envelopes.
 */
export interface UserSigningContext {
  did: string;
  forensicContext: UserForensicContext;
}

/**
 * Organization context for creating corporate envelopes.
 */
export interface OrgSigningContext {
  did: string;
  forensicContext: OrgForensicContext;
}

/**
 * Optional fields for corporate envelope creation.
 */
export interface CorporateEnvelopeOptions {
  credentialStatus?: CredentialStatus;
  timestampProof?: TimestampProof;
}

/**
 * Ed25519 DID:key validation pattern.
 * - Must start with 'did:key:'
 * - Must have 'z6Mk' prefix (multicodec for Ed25519 public key)
 * - Followed by 44-46 base58btc characters (256-bit key)
 *
 * Security: Prevents injection of non-Ed25519 keys or malformed DIDs.
 */
const DID_KEY_ED25519_PATTERN = /^did:key:z6Mk[a-km-zA-HJ-NP-Z1-9]{43,45}$/;

/**
 * Configuration options for SigningService.
 */
export interface SigningServiceConfig {
  /**
   * WaltIdClient for real Ed25519 signatures.
   * If not provided, falls back to mock signatures (for testing).
   */
  waltIdClient?: WaltIdClient;

  /**
   * Force mock signatures even if waltIdClient is provided.
   * Useful for testing.
   */
  forceMock?: boolean;
}

/**
 * SigningService implements the Corporate Envelope pattern for DID-based digital signatures.
 *
 * This service integrates with walt.id for real Ed25519 signatures in production,
 * and provides deterministic mock signatures for testing and development.
 */
export class SigningService {
  private readonly waltIdClient?: WaltIdClient;
  private readonly forceMock: boolean;

  constructor(config?: SigningServiceConfig) {
    this.waltIdClient = config?.waltIdClient;
    this.forceMock = config?.forceMock ?? false;
  }

  /**
   * Check if real signatures are available (walt.id configured and not forcing mock).
   */
  get usesRealSignatures(): boolean {
    return !!this.waltIdClient && !this.forceMock;
  }
  /**
   * Sign a payload with a user's DID (Ed25519Signature2020).
   *
   * Creates a user proof containing the signature, verification method,
   * and embedded forensic context for long-term verification.
   *
   * @param payload - The data to sign (will be canonicalized to JSON)
   * @param userDid - The user's DID (must be did:key:z format)
   * @param forensicContext - User forensic context to embed in the proof
   * @returns UserProof with Ed25519Signature2020 signature
   * @throws ValidationError if DID format is invalid
   */
  async signWithUserDid(
    payload: Record<string, unknown>,
    userDid: string,
    forensicContext: UserForensicContext
  ): Promise<UserProof> {
    this.validateDid(userDid);

    const signatureValue = await this.createSignature(payload, userDid);
    const verificationMethod = this.buildVerificationMethod(userDid);

    return {
      type: 'Ed25519Signature2020',
      verificationMethod,
      signatureValue,
      created: forensicContext.signedAt,
      forensicContext,
    };
  }

  /**
   * Sign a payload with an organization's DID (Ed25519Signature2020).
   *
   * Creates a corporate proof containing the signature, verification method,
   * and embedded forensic context for long-term verification.
   *
   * @param payload - The data to sign (will be canonicalized to JSON)
   * @param orgDid - The organization's DID (must be did:key:z format)
   * @param forensicContext - Organization forensic context to embed in the proof
   * @returns CorporateProof with Ed25519Signature2020 signature
   * @throws ValidationError if DID format is invalid
   */
  async signWithOrgDid(
    payload: Record<string, unknown>,
    orgDid: string,
    forensicContext: OrgForensicContext
  ): Promise<CorporateProof> {
    this.validateDid(orgDid);

    const signatureValue = await this.createSignature(payload, orgDid);
    const verificationMethod = this.buildVerificationMethod(orgDid);

    return {
      type: 'Ed25519Signature2020',
      verificationMethod,
      signatureValue,
      created: forensicContext.signedAt,
      forensicContext,
    };
  }

  /**
   * Create a complete SealedArtifact with dual signatures (Corporate Envelope pattern).
   *
   * This implements the corporate envelope pattern where high-stakes actions require
   * both a user signature (individual accountability) and an organization signature
   * (corporate authorization).
   *
   * @param payload - The data to seal
   * @param userContext - User DID and forensic context
   * @param orgContext - Organization DID and forensic context
   * @param options - Optional credential status and timestamp proof
   * @returns SealedArtifact with dual signatures and embedded forensic contexts
   * @throws ValidationError if either DID format is invalid
   */
  async createCorporateEnvelope(
    payload: Record<string, unknown>,
    userContext: UserSigningContext,
    orgContext: OrgSigningContext,
    options?: CorporateEnvelopeOptions
  ): Promise<SealedArtifact> {
    // Validate both DIDs upfront
    this.validateDid(userContext.did);
    this.validateDid(orgContext.did);

    // Create both proofs (can be parallelized)
    const [userProof, corporateProof] = await Promise.all([
      this.signWithUserDid(payload, userContext.did, userContext.forensicContext),
      this.signWithOrgDid(payload, orgContext.did, orgContext.forensicContext),
    ]);

    // Build the sealed artifact
    const artifact: SealedArtifact = {
      payload,
      userProof,
      corporateProof,
    };

    // Add optional fields if provided
    if (options?.credentialStatus) {
      artifact.credentialStatus = options.credentialStatus;
    }

    if (options?.timestampProof) {
      artifact.timestampProof = options.timestampProof;
    }

    return artifact;
  }

  /**
   * Validate that a DID is a valid Ed25519 did:key.
   *
   * Validates:
   * - Starts with 'did:key:'
   * - Uses Ed25519 multicodec prefix 'z6Mk'
   * - Has correct length for Ed25519 public key
   * - Uses valid base58btc characters
   *
   * @param did - The DID to validate
   * @throws ValidationError if DID format is invalid or not Ed25519
   */
  private validateDid(did: string): void {
    // Must be did:key format
    if (!did.startsWith('did:key:')) {
      throw new ValidationError('Invalid DID: must be did:key format');
    }

    // Must be Ed25519 (z6Mk prefix)
    if (!did.startsWith('did:key:z6Mk')) {
      throw new ValidationError('Invalid DID: must be Ed25519 key (z6Mk prefix)');
    }

    // Validate full pattern including length
    if (!DID_KEY_ED25519_PATTERN.test(did)) {
      throw new ValidationError('Invalid DID: malformed Ed25519 key identifier');
    }
  }

  /**
   * Build the verification method string from a DID.
   *
   * Format: did:key:z6MkXXX#z6MkXXX where the fragment matches the key identifier.
   *
   * @param did - The DID (e.g., did:key:z6MkXXX)
   * @returns Verification method string (e.g., did:key:z6MkXXX#z6MkXXX)
   */
  private buildVerificationMethod(did: string): string {
    const keyId = did.replace('did:key:', '');
    return `${did}#${keyId}`;
  }

  /**
   * Create a signature using walt.id (real Ed25519) or mock (for testing).
   *
   * @param payload - The data to sign
   * @param did - The signer's DID
   * @returns Base64-encoded signature
   */
  private async createSignature(
    payload: Record<string, unknown>,
    did: string
  ): Promise<string> {
    // Use real walt.id signatures if available
    if (this.waltIdClient && !this.forceMock) {
      return this.createRealSignature(payload, did);
    }

    // Fall back to mock signature for testing
    return this.createMockSignature(payload, did);
  }

  /**
   * Create a real Ed25519 signature using walt.id signatory service.
   *
   * @param payload - The data to sign
   * @param did - The signer's DID (key ID is extracted from DID)
   * @returns Base64-encoded Ed25519 signature
   */
  private async createRealSignature(
    payload: Record<string, unknown>,
    did: string
  ): Promise<string> {
    if (!this.waltIdClient) {
      throw new ValidationError('WaltIdClient not configured for real signatures');
    }

    // Extract key ID from DID (did:key:z6Mk... -> z6Mk...)
    const keyId = did.replace('did:key:', '');

    const response = await this.waltIdClient.sign({
      keyId,
      payload,
      proofType: 'Ed25519Signature2020',
      proofPurpose: 'assertionMethod',
    });

    return response.jws;
  }

  /**
   * Create a deterministic mock signature for testing.
   *
   * This generates a SHA-256 hash of the canonical JSON payload concatenated
   * with the DID. This ensures reproducible signatures for testing while
   * maintaining the same interface as real Ed25519 signatures.
   *
   * @param payload - The data to sign
   * @param did - The signer's DID
   * @returns Hex-encoded SHA-256 hash as mock signature
   */
  private createMockSignature(
    payload: Record<string, unknown>,
    did: string
  ): string {
    // Canonical JSON serialization (deterministic)
    const canonicalPayload = JSON.stringify(payload);

    // Create deterministic hash: SHA-256(payload + DID)
    return createHash('sha256')
      .update(canonicalPayload + did)
      .digest('hex');
  }
}

/**
 * Factory function to create a SigningService with walt.id integration.
 * Uses environment variables for configuration.
 */
export function createSigningService(options?: {
  forceMock?: boolean;
}): SigningService {
  // Only create real client if walt.id URLs are configured
  const hasWaltIdConfig = process.env['WALTID_SIGNATORY_URL'];

  if (hasWaltIdConfig && !options?.forceMock) {
    const waltIdClient = createWaltIdClient(process.env as Record<string, string>);
    return new SigningService({ waltIdClient });
  }

  return new SigningService({ forceMock: true });
}
