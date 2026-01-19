/**
 * Shared constants for the EuroComply platform.
 */

// ============================================
// CRYPTOGRAPHIC CONSTANTS
// ============================================

/**
 * Supported hash algorithms for cryptographic operations.
 * Currently only SHA-256 is supported per W3C VC standards.
 */
export const SUPPORTED_HASH_ALGORITHMS = ['SHA-256'] as const;

/**
 * Type for supported hash algorithms.
 */
export type HashAlgorithm = (typeof SUPPORTED_HASH_ALGORITHMS)[number];

/**
 * Default hash algorithm for new signatures and timestamps.
 */
export const DEFAULT_HASH_ALGORITHM: HashAlgorithm = 'SHA-256';

// ============================================
// PROOF TYPE CONSTANTS
// ============================================

/**
 * Supported proof types for digital signatures.
 */
export const SUPPORTED_PROOF_TYPES = ['Ed25519Signature2020', 'JsonWebSignature2020'] as const;

/**
 * Type for supported proof types.
 */
export type ProofType = (typeof SUPPORTED_PROOF_TYPES)[number];

/**
 * Default proof type for new signatures.
 */
export const DEFAULT_PROOF_TYPE: ProofType = 'Ed25519Signature2020';

// ============================================
// TIMESTAMP CONSTANTS
// ============================================

/**
 * Supported timestamp proof types.
 */
export const TIMESTAMP_PROOF_TYPES = ['RFC3161'] as const;

/**
 * Type for timestamp proof types.
 */
export type TimestampProofType = (typeof TIMESTAMP_PROOF_TYPES)[number];
