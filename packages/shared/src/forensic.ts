import { z } from 'zod';
import { DEFAULT_HASH_ALGORITHM, DEFAULT_PROOF_TYPE } from './constants.js';

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
  hashAlgorithm: z.literal(DEFAULT_HASH_ALGORITHM),
});

export type TimestampProof = z.infer<typeof TimestampProofSchema>;

/**
 * Complete sealed artifact structure for high-stakes gates.
 */
export const SealedArtifactSchema = z.object({
  payload: z.record(z.unknown()),

  userProof: z.object({
    type: z.literal(DEFAULT_PROOF_TYPE),
    verificationMethod: z.string(),
    signatureValue: z.string(),
    created: z.string().datetime(),
    forensicContext: UserForensicContextSchema,
  }),

  corporateProof: z.object({
    type: z.literal(DEFAULT_PROOF_TYPE),
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
// INPUT VALIDATION SCHEMAS
// ============================================

/**
 * Schema for user input validation in forensic context creation.
 */
export const UserInputSchema = z.object({
  name: z.string().min(1, 'User name is required').max(200, 'User name too long'),
  email: z.string().email('Invalid email address'),
});

export type UserInput = z.infer<typeof UserInputSchema>;

/**
 * Schema for organization input validation in forensic context creation.
 */
export const OrgInputSchema = z.object({
  id: z.string().min(1, 'Organization ID is required'),
  name: z.string().min(1, 'Organization name is required').max(200, 'Organization name too long'),
  vatNumber: z.string().optional(),
});

export type OrgInput = z.infer<typeof OrgInputSchema>;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Create a user forensic context from user data.
 * Validates input before creating the context.
 *
 * @param user - User data (name and email)
 * @param role - User's role in the organization
 * @param workspaceAuthority - User's authority level in the workspace
 * @returns Validated user forensic context
 * @throws z.ZodError if validation fails
 *
 * @example
 * const context = createUserForensicContext(
 *   { name: 'John Doe', email: 'john@example.com' },
 *   'Quality Manager',
 *   'EDITOR'
 * );
 */
export function createUserForensicContext(
  user: UserInput,
  role: string,
  workspaceAuthority: string
): UserForensicContext {
  // Validate input
  const validatedUser = UserInputSchema.parse(user);

  return {
    signerName: validatedUser.name,
    signerEmail: validatedUser.email,
    signerRole: role,
    workspaceAuthority,
    signedAt: new Date().toISOString(),
  };
}

/**
 * Create an organization forensic context from org data.
 * Validates input before creating the context.
 *
 * @param org - Organization data (id, name, optional vatNumber)
 * @param certifications - Optional list of certifications
 * @returns Validated organization forensic context
 * @throws z.ZodError if validation fails
 *
 * @example
 * const context = createOrgForensicContext(
 *   { id: 'org_123', name: 'Acme Corp', vatNumber: 'DE123456789' },
 *   ['ISO 9001', 'ISO 14001']
 * );
 */
export function createOrgForensicContext(
  org: OrgInput,
  certifications?: string[]
): OrgForensicContext {
  // Validate input
  const validatedOrg = OrgInputSchema.parse(org);

  return {
    organizationName: validatedOrg.name,
    organizationId: validatedOrg.id,
    vatNumber: validatedOrg.vatNumber,
    certifications,
    signedAt: new Date().toISOString(),
  };
}
