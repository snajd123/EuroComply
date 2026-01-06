import { z } from 'zod';

// ===========================================
// API Response Types
// ===========================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ResponseMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ResponseMeta {
  requestId: string;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasMore: boolean;
  };
}

// ===========================================
// Authentication Types
// ===========================================

export interface AuthContext {
  organizationId: string;
  apiKeyId?: string;
  userId?: string;
  scopes: string[];
}

export const ApiKeyScopes = {
  ALL: '*',
  PRODUCTS_READ: 'products:read',
  PRODUCTS_WRITE: 'products:write',
  PASSPORTS_READ: 'passports:read',
  PASSPORTS_WRITE: 'passports:write',
  CREDENTIALS_READ: 'credentials:read',
  CREDENTIALS_WRITE: 'credentials:write',
  MERCHANTS_READ: 'merchants:read',
  MERCHANTS_WRITE: 'merchants:write',
  KYB_READ: 'kyb:read',
  KYB_WRITE: 'kyb:write',
  WEBHOOKS_READ: 'webhooks:read',
  WEBHOOKS_WRITE: 'webhooks:write',
} as const;

export type ApiKeyScope = (typeof ApiKeyScopes)[keyof typeof ApiKeyScopes];

// ===========================================
// ProductTrust Types
// ===========================================

export interface DppData {
  // Core identification
  productId: string;
  manufacturerName: string;
  productName: string;
  productModel?: string;
  gtin?: string;

  // Sustainability (CIRPASS compatible)
  carbonFootprint?: {
    value: number;
    unit: string;
    methodology?: string;
  };
  recyclability?: {
    percentage: number;
    materials: MaterialInfo[];
  };
  durability?: {
    expectedLifespan: number;
    unit: string;
  };
  repairability?: {
    score: number;
    repairInstructions?: string;
    spareParts?: SparePart[];
  };

  // Compliance
  certifications?: Certification[];
  hazardousSubstances?: HazardousSubstance[];

  // Custom attributes
  customAttributes?: Record<string, unknown>;
}

export interface MaterialInfo {
  name: string;
  percentage: number;
  recyclable: boolean;
  recycledContent?: number;
}

export interface SparePart {
  name: string;
  partNumber?: string;
  availabilityYears?: number;
}

export interface Certification {
  name: string;
  issuer: string;
  validUntil?: string;
  documentUrl?: string;
}

export interface HazardousSubstance {
  name: string;
  casNumber?: string;
  concentration: number;
  unit: string;
}

// Zod Schemas for validation
export const DppDataSchema = z.object({
  productId: z.string(),
  manufacturerName: z.string(),
  productName: z.string(),
  productModel: z.string().optional(),
  gtin: z.string().optional(),
  carbonFootprint: z
    .object({
      value: z.number(),
      unit: z.string(),
      methodology: z.string().optional(),
    })
    .optional(),
  recyclability: z
    .object({
      percentage: z.number().min(0).max(100),
      materials: z.array(
        z.object({
          name: z.string(),
          percentage: z.number(),
          recyclable: z.boolean(),
          recycledContent: z.number().optional(),
        })
      ),
    })
    .optional(),
  durability: z
    .object({
      expectedLifespan: z.number(),
      unit: z.string(),
    })
    .optional(),
  repairability: z
    .object({
      score: z.number().min(0).max(10),
      repairInstructions: z.string().optional(),
      spareParts: z
        .array(
          z.object({
            name: z.string(),
            partNumber: z.string().optional(),
            availabilityYears: z.number().optional(),
          })
        )
        .optional(),
    })
    .optional(),
  certifications: z
    .array(
      z.object({
        name: z.string(),
        issuer: z.string(),
        validUntil: z.string().optional(),
        documentUrl: z.string().url().optional(),
      })
    )
    .optional(),
  hazardousSubstances: z
    .array(
      z.object({
        name: z.string(),
        casNumber: z.string().optional(),
        concentration: z.number(),
        unit: z.string(),
      })
    )
    .optional(),
  customAttributes: z.record(z.unknown()).optional(),
});

// ===========================================
// WorkforceTrust Types
// ===========================================

export interface CredentialSubject {
  id?: string; // Subject DID
  name: string;
  email?: string;
  [key: string]: unknown;
}

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

export interface CredentialProof {
  type: string;
  created: string;
  verificationMethod: string;
  proofPurpose: string;
  jws?: string;
}

export interface CredentialRequest {
  schemaId: string;
  subjectName: string;
  subjectEmail?: string;
  subjectDid?: string;
  claims: Record<string, unknown>;
  expiresIn?: number; // Days until expiration
}

export const CredentialRequestSchema = z.object({
  schemaId: z.string(),
  subjectName: z.string(),
  subjectEmail: z.string().email().optional(),
  subjectDid: z.string().optional(),
  claims: z.record(z.unknown()),
  expiresIn: z.number().positive().optional(),
});

// ===========================================
// MerchantTrust Types
// ===========================================

export interface KybRequest {
  legalName: string;
  tradingName?: string;
  registrationNumber?: string;
  vatNumber?: string;
  country: string;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    postalCode: string;
    country: string;
  };
  contact?: {
    email: string;
    phone?: string;
    website?: string;
  };
}

export const KybRequestSchema = z.object({
  legalName: z.string().min(1),
  tradingName: z.string().optional(),
  registrationNumber: z.string().optional(),
  vatNumber: z.string().optional(),
  country: z.string().length(2), // ISO 3166-1 alpha-2
  address: z
    .object({
      line1: z.string(),
      line2: z.string().optional(),
      city: z.string(),
      postalCode: z.string(),
      country: z.string().length(2),
    })
    .optional(),
  contact: z
    .object({
      email: z.string().email(),
      phone: z.string().optional(),
      website: z.string().url().optional(),
    })
    .optional(),
});

export interface TraderProfile {
  merchantId: string;
  legalName: string;
  tradingName?: string;
  registrationNumber?: string;
  vatNumber?: string;
  country: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
  kybVerified: boolean;
  dsaCompliant: boolean;
  lastVerifiedAt?: string;
}

export interface SanctionsCheckResult {
  clear: boolean;
  matchesFound: number;
  matches?: SanctionsMatch[];
  listsChecked: string[];
  checkedAt: string;
}

export interface SanctionsMatch {
  listName: string;
  entityName: string;
  matchScore: number;
  details?: Record<string, unknown>;
}

// ===========================================
// Webhook Types
// ===========================================

export type WebhookEventType =
  | 'passport.created'
  | 'passport.updated'
  | 'passport.anchored'
  | 'credential.issued'
  | 'credential.revoked'
  | 'credential.verified'
  | 'kyb.started'
  | 'kyb.completed'
  | 'kyb.failed'
  | 'trader.onboarded'
  | 'trader.updated'
  | 'trader.flagged'
  | 'sanctions.clear'
  | 'sanctions.match';

export interface WebhookPayload {
  id: string;
  type: WebhookEventType;
  created: string;
  data: {
    object: Record<string, unknown>;
    previousAttributes?: Record<string, unknown>;
  };
}

// ===========================================
// DID Types
// ===========================================

export interface DidDocument {
  '@context': string[];
  id: string;
  verificationMethod?: VerificationMethod[];
  authentication?: string[];
  assertionMethod?: string[];
  service?: ServiceEndpoint[];
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

// ===========================================
// Constants
// ===========================================

export const SUPPORTED_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
] as const;

export type EuCountryCode = (typeof SUPPORTED_COUNTRIES)[number];

export const SANCTIONS_LISTS = [
  'EU_SANCTIONS',
  'UN_SANCTIONS',
  'OFAC_SDN',
  'UK_SANCTIONS',
] as const;

export type SanctionsList = (typeof SANCTIONS_LISTS)[number];
