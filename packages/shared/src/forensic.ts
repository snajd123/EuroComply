import { z } from 'zod';

// ============================================
// FORENSIC CONTEXT SCHEMAS
// ============================================

/**
 * User forensic context - embedded at sign-time for historical verification.
 * Enables verification in 2031 even if user has left the company.
 */
export const UserForensicContextSchema = z.object({
  signerName: z.string(),
  signerEmail: z.string().email(),
  signerRole: z.string(),
  workspaceAuthority: z.string(),
  signedAt: z.string().datetime(),
});

export type UserForensicContext = z.infer<typeof UserForensicContextSchema>;

/**
 * Organization forensic context - proves corporate legal standing.
 */
export const OrgForensicContextSchema = z.object({
  organizationName: z.string(),
  organizationId: z.string(),
  vatNumber: z.string().optional(),
  certifications: z.array(z.string()).optional(),
  signedAt: z.string().datetime(),
});

export type OrgForensicContext = z.infer<typeof OrgForensicContextSchema>;

/**
 * Credential status for revocation checking (Status List 2021).
 */
export const CredentialStatusSchema = z.object({
  type: z.literal('StatusList2021Entry'),
  statusPurpose: z.literal('revocation'),
  statusListIndex: z.string(),
  statusListCredential: z.string().url(),
});

export type CredentialStatus = z.infer<typeof CredentialStatusSchema>;

/**
 * RFC3161 timestamp proof for proving signature predates revocation.
 */
export const TimestampProofSchema = z.object({
  type: z.literal('RFC3161'),
  timestamp: z.string().datetime(),
  authority: z.string().url(),
  token: z.string(),
  hashAlgorithm: z.literal('SHA-256'),
});

export type TimestampProof = z.infer<typeof TimestampProofSchema>;

/**
 * Complete sealed artifact structure for high-stakes gates.
 */
export const SealedArtifactSchema = z.object({
  payload: z.record(z.unknown()),

  userProof: z.object({
    type: z.literal('Ed25519Signature2020'),
    verificationMethod: z.string(),
    signatureValue: z.string(),
    created: z.string().datetime(),
    forensicContext: UserForensicContextSchema,
  }),

  corporateProof: z.object({
    type: z.literal('Ed25519Signature2020'),
    verificationMethod: z.string(),
    signatureValue: z.string(),
    created: z.string().datetime(),
    forensicContext: OrgForensicContextSchema,
  }),

  credentialStatus: CredentialStatusSchema.optional(),
  timestampProof: TimestampProofSchema.optional(),
});

export type SealedArtifact = z.infer<typeof SealedArtifactSchema>;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Create a user forensic context from user data.
 */
export function createUserForensicContext(
  user: { name: string; email: string },
  role: string,
  workspaceAuthority: string
): UserForensicContext {
  return {
    signerName: user.name,
    signerEmail: user.email,
    signerRole: role,
    workspaceAuthority,
    signedAt: new Date().toISOString(),
  };
}

/**
 * Create an organization forensic context from org data.
 */
export function createOrgForensicContext(
  org: { id: string; name: string; vatNumber?: string },
  certifications?: string[]
): OrgForensicContext {
  return {
    organizationName: org.name,
    organizationId: org.id,
    vatNumber: org.vatNumber,
    certifications,
    signedAt: new Date().toISOString(),
  };
}
