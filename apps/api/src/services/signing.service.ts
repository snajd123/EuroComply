import { createHash } from 'crypto';
import type {
  UserForensicContext,
  OrgForensicContext,
  SealedArtifact,
  CredentialStatus,
  TimestampProof,
} from '@eurocomply/shared';
import { ValidationError } from '../lib/errors.js';

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

// DID:key prefix validation pattern (basic MVP validation)
const DID_KEY_PATTERN = /^did:key:z[a-zA-Z0-9]+$/;

/**
 * SigningService implements the Corporate Envelope pattern for DID-based digital signatures.
 *
 * This service provides deterministic mock signatures for testing and development.
 * In production, this will integrate with walt.id for real Ed25519 signatures.
 *
 * TODO: Integrate with walt.id signature service for production Ed25519 signatures
 * TODO: Add key resolution from DID documents
 * TODO: Implement signature verification methods
 */
export class SigningService {
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
   *
   * TODO: Replace mock signature with walt.id Ed25519 signature
   */
  signWithUserDid(
    payload: Record<string, unknown>,
    userDid: string,
    forensicContext: UserForensicContext
  ): UserProof {
    this.validateDid(userDid);

    const signatureValue = this.createMockSignature(payload, userDid);
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
   *
   * TODO: Replace mock signature with walt.id Ed25519 signature
   */
  signWithOrgDid(
    payload: Record<string, unknown>,
    orgDid: string,
    forensicContext: OrgForensicContext
  ): CorporateProof {
    this.validateDid(orgDid);

    const signatureValue = this.createMockSignature(payload, orgDid);
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
   *
   * TODO: Integrate with walt.id for production signatures
   * TODO: Add support for real RFC3161 timestamping
   * TODO: Add support for StatusList2021 credential status
   */
  createCorporateEnvelope(
    payload: Record<string, unknown>,
    userContext: UserSigningContext,
    orgContext: OrgSigningContext,
    options?: CorporateEnvelopeOptions
  ): SealedArtifact {
    // Validate both DIDs upfront
    this.validateDid(userContext.did);
    this.validateDid(orgContext.did);

    // Create user proof
    const userProof = this.signWithUserDid(
      payload,
      userContext.did,
      userContext.forensicContext
    );

    // Create corporate proof
    const corporateProof = this.signWithOrgDid(
      payload,
      orgContext.did,
      orgContext.forensicContext
    );

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
   * Validate that a DID is in the expected did:key:z format.
   *
   * For MVP, we only validate the basic format. In production, this would
   * resolve the DID document and verify the key type.
   *
   * @param did - The DID to validate
   * @throws ValidationError if DID format is invalid
   *
   * TODO: Add DID document resolution and key type verification
   */
  private validateDid(did: string): void {
    if (!DID_KEY_PATTERN.test(did)) {
      throw new ValidationError(
        `Invalid DID format: expected did:key:z... but got '${did}'`
      );
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
   * Create a deterministic mock signature for testing.
   *
   * This generates a SHA-256 hash of the canonical JSON payload concatenated
   * with the DID. This ensures reproducible signatures for testing while
   * maintaining the same interface as real Ed25519 signatures.
   *
   * @param payload - The data to sign
   * @param did - The signer's DID
   * @returns Hex-encoded SHA-256 hash as mock signature
   *
   * TODO: Replace with real Ed25519 signature via walt.id
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
