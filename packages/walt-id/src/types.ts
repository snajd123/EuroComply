import { z } from 'zod';

// ============================================
// CONFIGURATION
// ============================================

export const WaltIdConfigSchema = z.object({
  coreApiUrl: z.string().url(),
  signatoryUrl: z.string().url(),
  custodianUrl: z.string().url(),
  auditorUrl: z.string().url(),
  apiKey: z.string().optional(),
  timeout: z.number().default(30000),
});

export type WaltIdConfig = z.infer<typeof WaltIdConfigSchema>;

// ============================================
// DID TYPES
// ============================================

export const DidDocumentSchema = z.object({
  id: z.string(),
  verificationMethod: z.array(z.object({
    id: z.string(),
    type: z.string(),
    controller: z.string(),
    publicKeyJwk: z.record(z.unknown()).optional(),
    publicKeyMultibase: z.string().optional(),
  })),
  authentication: z.array(z.string()).optional(),
  assertionMethod: z.array(z.string()).optional(),
});

export type DidDocument = z.infer<typeof DidDocumentSchema>;

export interface CreateDidRequest {
  method: 'key';
  keyAlgorithm: 'Ed25519';
}

export interface CreateDidResponse {
  did: string;
  keyId: string;
  didDocument: DidDocument;
}

// ============================================
// KEY TYPES
// ============================================

export interface KeyMetadata {
  keyId: string;
  algorithm: 'Ed25519';
  createdAt: string;
  kmsKeyArn?: string;
}

export interface ExportKeyRequest {
  keyId: string;
  format: 'JWK' | 'PEM';
}

export interface ImportKeyRequest {
  algorithm: 'Ed25519';
  privateKeyJwk?: JsonWebKey;
  kmsKeyArn?: string;
}

// ============================================
// SIGNING TYPES
// ============================================

export const SignRequestSchema = z.object({
  keyId: z.string(),
  payload: z.record(z.unknown()),
  proofType: z.enum(['Ed25519Signature2020', 'JsonWebSignature2020']),
  proofPurpose: z.enum(['assertionMethod', 'authentication']).default('assertionMethod'),
});

export type SignRequest = z.infer<typeof SignRequestSchema>;

export interface SignResponse {
  jws: string;
  verificationMethod: string;
  created: string;
}

// ============================================
// VERIFIABLE CREDENTIAL TYPES
// ============================================

export const IssueVcRequestSchema = z.object({
  issuerDid: z.string(),
  issuerKeyId: z.string(),
  subjectDid: z.string().optional(),
  credentialType: z.array(z.string()),
  credentialSubject: z.record(z.unknown()),
  credentialStatus: z.object({
    type: z.literal('StatusList2021Entry'),
    statusPurpose: z.literal('revocation'),
    statusListIndex: z.string(),
    statusListCredential: z.string().url(),
  }).optional(),
  expirationDate: z.string().datetime().optional(),
});

export type IssueVcRequest = z.infer<typeof IssueVcRequestSchema>;

export interface IssueVcResponse {
  vcJwt: string;
  vcId: string;
  issuanceDate: string;
}

// ============================================
// VERIFICATION TYPES
// ============================================

export const VerifyRequestSchema = z.object({
  vcJwt: z.string(),
  policies: z.array(z.enum([
    'signature',
    'expiration',
    'not-before',
    'revocation',
  ])).default(['signature']),
});

export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;

export interface VerifyResponse {
  valid: boolean;
  checks: {
    signature: boolean;
    expiration?: boolean;
    notBefore?: boolean;
    revocation?: boolean;
  };
  errors: string[];
}

// ============================================
// STATUS LIST TYPES
// ============================================

export interface StatusListCredential {
  '@context': string[];
  type: string[];
  issuer: string;
  issuanceDate: string;
  credentialSubject: {
    id: string;
    type: 'StatusList2021';
    statusPurpose: 'revocation';
    encodedList: string;
  };
  proof?: Record<string, unknown>;
}
