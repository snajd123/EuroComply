/**
 * Identity Types for EuroComply
 */

// ===========================================
// DID Types
// ===========================================

export type DidMethod = 'web' | 'key' | 'ebsi';

export interface DidDocument {
  '@context': string[];
  id: string;
  verificationMethod?: VerificationMethod[];
  authentication?: string[];
  assertionMethod?: string[];
  service?: ServiceEndpoint[];
  alsoKnownAs?: string[];
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyJwk?: JsonWebKey;
}

export interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string;
}

export interface JsonWebKey {
  kty: string;
  crv?: string;
  x?: string;
  y?: string;
  d?: string; // Private key component (for key export)
  n?: string;
  e?: string;
  use?: string;
  kid?: string;
  alg?: string;
}

export interface CreateDidOptions {
  method: DidMethod;
  identifier: string; // e.g., "acme-corp" for did:web:eurocomply.eu:m:acme-corp
  keyAlgorithm?: 'ES256' | 'EdDSA';
}

export interface DidResult {
  did: string;
  didDocument: DidDocument;
  keyId: string;
}

// ===========================================
// Verifiable Credential Types
// ===========================================

export interface VerifiableCredential {
  '@context': string[];
  id: string;
  type: string[];
  issuer: string | { id: string; name?: string };
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: CredentialSubject;
  proof?: CredentialProof;
}

export interface CredentialSubject {
  id?: string;
  [key: string]: unknown;
}

export interface CredentialProof {
  type: string;
  created: string;
  verificationMethod: string;
  proofPurpose: string;
  jws?: string;
}

export interface IssueCredentialOptions {
  issuerDid: string;
  issuerKeyId: string;
  subjectDid?: string;
  credentialType: string | string[];
  claims: Record<string, unknown>;
  expirationDate?: Date;
}

export interface IssuedCredential {
  id: string;
  vcJwt: string;
  vcJson: VerifiableCredential;
}

export interface VerificationResult {
  valid: boolean;
  checks: {
    signature: boolean;
    expiration: boolean;
    revocation: boolean;
  };
  credential?: VerifiableCredential;
  errors?: string[];
}

// ===========================================
// Key Management Types
// ===========================================

export type KeyAlgorithm = 'ES256' | 'EdDSA';

export interface KeyPair {
  keyId: string;
  algorithm: KeyAlgorithm;
  publicKeyJwk: JsonWebKey;
}

export interface StoredKey {
  keyId: string;
  algorithm: KeyAlgorithm;
  createdAt: Date;
}

// ===========================================
// Credential Types for EuroComply
// ===========================================

export const CredentialTypes = {
  // ProductTrust
  DIGITAL_PRODUCT_PASSPORT: 'DigitalProductPassport',

  // WorkforceTrust
  EMPLOYEE_ID: 'EmployeeIdCredential',
  EMPLOYMENT_VERIFICATION: 'EmploymentVerificationCredential',
  BACKGROUND_CHECK: 'BackgroundCheckCredential',
  DIPLOMA: 'DiplomaCredential',
  PROFESSIONAL_LICENSE: 'ProfessionalLicenseCredential',
  TRAINING_CERTIFICATE: 'TrainingCertificateCredential',

  // MerchantTrust
  KYB_VERIFICATION: 'KYBVerificationCredential',
  DSA_COMPLIANCE: 'DSAComplianceCredential',
  DSA_TRADER_VERIFICATION: 'DSATraderVerificationCredential',
} as const;

export type CredentialType = typeof CredentialTypes[keyof typeof CredentialTypes];
