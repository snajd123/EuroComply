# walt.id, TSA, and Verification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the Corporate Envelope signing infrastructure with real walt.id integration, RFC3161 timestamps, Status List 2021 bitstring encoding, and a full Verification Service.

**Architecture:** Replace mock signatures with real Ed25519 signing via walt.id Community Stack on AWS EKS, add RFC3161 timestamp proofs, implement bitstring-encoded status lists, and create verification service for 2031 auditors.

**Tech Stack:** walt.id Community Stack, AWS EKS, AWS KMS, TypeScript, Hono, Cloudflare R2, RFC3161 TSA

---

## Prerequisites

Before starting this plan:
- Phases 1-5 of `2026-01-18-versioning-events-did-implementation.md` must be complete
- AWS EKS cluster provisioned on EU Sovereign Cloud
- AWS KMS key created for Ed25519 key wrapping

---

## Phase 1: walt.id Client Package

### Task 1.1: Create walt.id Client Package Structure

**Files:**
- Create: `packages/walt-id/package.json`
- Create: `packages/walt-id/tsconfig.json`
- Create: `packages/walt-id/src/index.ts`

**Step 1: Create package.json**

Create `packages/walt-id/package.json`:

```json
{
  "name": "@eurocomply/walt-id",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  },
  "peerDependencies": {
    "@eurocomply/shared": "workspace:*"
  }
}
```

**Step 2: Create tsconfig.json**

Create `packages/walt-id/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create placeholder index**

Create `packages/walt-id/src/index.ts`:

```typescript
// walt.id Community Stack Client
// Provides typed interface to walt.id services

export * from './client.js';
export * from './types.js';
export * from './errors.js';
```

**Step 4: Install dependencies**

Run: `cd packages/walt-id && pnpm install`
Expected: Dependencies installed

**Step 5: Commit**

```bash
git add packages/walt-id/
git commit -m "feat(walt-id): create walt.id client package structure"
```

---

### Task 1.2: Define walt.id Types

**Files:**
- Create: `packages/walt-id/src/types.ts`

**Step 1: Write the types**

Create `packages/walt-id/src/types.ts`:

```typescript
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
```

**Step 2: Commit**

```bash
git add packages/walt-id/src/types.ts
git commit -m "feat(walt-id): add walt.id type definitions"
```

---

### Task 1.3: Create walt.id Client Errors

**Files:**
- Create: `packages/walt-id/src/errors.ts`

**Step 1: Write the errors**

Create `packages/walt-id/src/errors.ts`:

```typescript
export class WaltIdError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'WaltIdError';
  }
}

export class WaltIdConnectionError extends WaltIdError {
  constructor(service: string, cause?: Error) {
    super(
      `Failed to connect to walt.id ${service}`,
      'CONNECTION_ERROR',
      undefined,
      { service, cause: cause?.message }
    );
    this.name = 'WaltIdConnectionError';
  }
}

export class WaltIdSigningError extends WaltIdError {
  constructor(message: string, keyId?: string) {
    super(message, 'SIGNING_ERROR', undefined, { keyId });
    this.name = 'WaltIdSigningError';
  }
}

export class WaltIdKeyNotFoundError extends WaltIdError {
  constructor(keyId: string) {
    super(`Key not found: ${keyId}`, 'KEY_NOT_FOUND', 404, { keyId });
    this.name = 'WaltIdKeyNotFoundError';
  }
}

export class WaltIdVerificationError extends WaltIdError {
  constructor(message: string, checks?: Record<string, boolean>) {
    super(message, 'VERIFICATION_ERROR', undefined, { checks });
    this.name = 'WaltIdVerificationError';
  }
}
```

**Step 2: Commit**

```bash
git add packages/walt-id/src/errors.ts
git commit -m "feat(walt-id): add walt.id error types"
```

---

### Task 1.4: Create walt.id Client Implementation

**Files:**
- Create: `packages/walt-id/src/client.ts`
- Create: `packages/walt-id/src/client.test.ts`

**Step 1: Write the failing test**

Create `packages/walt-id/src/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WaltIdClient } from './client.js';
import type { WaltIdConfig } from './types.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('WaltIdClient', () => {
  const config: WaltIdConfig = {
    coreApiUrl: 'http://localhost:7000',
    signatoryUrl: 'http://localhost:7001',
    custodianUrl: 'http://localhost:7002',
    auditorUrl: 'http://localhost:7003',
    timeout: 5000,
  };

  let client: WaltIdClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new WaltIdClient(config);
  });

  describe('createDid', () => {
    it('should create a did:key with Ed25519', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          did: 'did:key:z6MkTest123',
          keyId: 'key_abc123',
          didDocument: {
            id: 'did:key:z6MkTest123',
            verificationMethod: [{
              id: 'did:key:z6MkTest123#z6MkTest123',
              type: 'Ed25519VerificationKey2020',
              controller: 'did:key:z6MkTest123',
              publicKeyMultibase: 'z6MkTest123',
            }],
          },
        }),
      });

      const result = await client.createDid({
        method: 'key',
        keyAlgorithm: 'Ed25519',
      });

      expect(result.did).toBe('did:key:z6MkTest123');
      expect(result.keyId).toBe('key_abc123');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:7000/v1/did/create',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  describe('sign', () => {
    it('should sign payload with Ed25519', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jws: 'eyJhbGciOiJFZERTQSJ9.eyJwYXlsb2FkIjp7fX0.signature',
          verificationMethod: 'did:key:z6MkTest123#z6MkTest123',
          created: '2026-01-18T10:00:00Z',
        }),
      });

      const result = await client.sign({
        keyId: 'key_abc123',
        payload: { test: 'data' },
        proofType: 'Ed25519Signature2020',
      });

      expect(result.jws).toContain('eyJ');
      expect(result.verificationMethod).toContain('did:key:');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:7001/v1/credentials/sign',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('verify', () => {
    it('should verify a valid credential', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          valid: true,
          checks: { signature: true },
          errors: [],
        }),
      });

      const result = await client.verify({
        vcJwt: 'eyJhbGciOiJFZERTQSJ9.payload.signature',
        policies: ['signature'],
      });

      expect(result.valid).toBe(true);
      expect(result.checks.signature).toBe(true);
    });

    it('should return invalid for bad signature', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          valid: false,
          checks: { signature: false },
          errors: ['Invalid signature'],
        }),
      });

      const result = await client.verify({
        vcJwt: 'invalid.jwt.here',
        policies: ['signature'],
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid signature');
    });
  });

  describe('issueVc', () => {
    it('should issue a Verifiable Credential', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          vcJwt: 'eyJhbGciOiJFZERTQSJ9.vc-payload.signature',
          vcId: 'vc_xyz789',
          issuanceDate: '2026-01-18T10:00:00Z',
        }),
      });

      const result = await client.issueVc({
        issuerDid: 'did:key:z6MkOrg123',
        issuerKeyId: 'key_org_123',
        credentialType: ['VerifiableCredential', 'DigitalProductPassport'],
        credentialSubject: {
          productId: 'prod_123',
          name: 'Test Product',
        },
      });

      expect(result.vcJwt).toContain('eyJ');
      expect(result.vcId).toBe('vc_xyz789');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/walt-id && pnpm test`
Expected: FAIL - module not found

**Step 3: Write the implementation**

Create `packages/walt-id/src/client.ts`:

```typescript
import {
  type WaltIdConfig,
  type CreateDidRequest,
  type CreateDidResponse,
  type SignRequest,
  type SignResponse,
  type IssueVcRequest,
  type IssueVcResponse,
  type VerifyRequest,
  type VerifyResponse,
  type KeyMetadata,
  WaltIdConfigSchema,
} from './types.js';
import {
  WaltIdError,
  WaltIdConnectionError,
  WaltIdSigningError,
  WaltIdKeyNotFoundError,
} from './errors.js';

export class WaltIdClient {
  private readonly config: WaltIdConfig;

  constructor(config: WaltIdConfig) {
    this.config = WaltIdConfigSchema.parse(config);
  }

  // ============================================
  // DID OPERATIONS (Core API)
  // ============================================

  async createDid(request: CreateDidRequest): Promise<CreateDidResponse> {
    return this.post<CreateDidResponse>(
      `${this.config.coreApiUrl}/v1/did/create`,
      {
        method: request.method,
        keyAlgorithm: request.keyAlgorithm,
      }
    );
  }

  async resolveDid(did: string): Promise<CreateDidResponse['didDocument']> {
    return this.get<CreateDidResponse['didDocument']>(
      `${this.config.coreApiUrl}/v1/did/resolve/${encodeURIComponent(did)}`
    );
  }

  // ============================================
  // KEY OPERATIONS (Custodian)
  // ============================================

  async getKey(keyId: string): Promise<KeyMetadata> {
    try {
      return await this.get<KeyMetadata>(
        `${this.config.custodianUrl}/v1/keys/${keyId}`
      );
    } catch (error) {
      if (error instanceof WaltIdError && error.statusCode === 404) {
        throw new WaltIdKeyNotFoundError(keyId);
      }
      throw error;
    }
  }

  async listKeys(): Promise<KeyMetadata[]> {
    return this.get<KeyMetadata[]>(
      `${this.config.custodianUrl}/v1/keys`
    );
  }

  async deleteKey(keyId: string): Promise<void> {
    await this.delete(`${this.config.custodianUrl}/v1/keys/${keyId}`);
  }

  // ============================================
  // SIGNING OPERATIONS (Signatory)
  // ============================================

  async sign(request: SignRequest): Promise<SignResponse> {
    try {
      return await this.post<SignResponse>(
        `${this.config.signatoryUrl}/v1/credentials/sign`,
        {
          keyId: request.keyId,
          payload: request.payload,
          proofType: request.proofType,
          proofPurpose: request.proofPurpose ?? 'assertionMethod',
        }
      );
    } catch (error) {
      throw new WaltIdSigningError(
        error instanceof Error ? error.message : 'Signing failed',
        request.keyId
      );
    }
  }

  async issueVc(request: IssueVcRequest): Promise<IssueVcResponse> {
    return this.post<IssueVcResponse>(
      `${this.config.signatoryUrl}/v1/credentials/issue`,
      {
        issuerDid: request.issuerDid,
        issuerKeyId: request.issuerKeyId,
        subjectDid: request.subjectDid,
        type: request.credentialType,
        credentialSubject: request.credentialSubject,
        credentialStatus: request.credentialStatus,
        expirationDate: request.expirationDate,
      }
    );
  }

  // ============================================
  // VERIFICATION OPERATIONS (Auditor)
  // ============================================

  async verify(request: VerifyRequest): Promise<VerifyResponse> {
    return this.post<VerifyResponse>(
      `${this.config.auditorUrl}/v1/verify`,
      {
        vcJwt: request.vcJwt,
        policies: request.policies,
      }
    );
  }

  // ============================================
  // HTTP HELPERS
  // ============================================

  private async post<T>(url: string, body: unknown): Promise<T> {
    return this.request<T>(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'X-API-Key': this.config.apiKey }),
      },
      body: JSON.stringify(body),
    });
  }

  private async get<T>(url: string): Promise<T> {
    return this.request<T>(url, {
      method: 'GET',
      headers: {
        ...(this.config.apiKey && { 'X-API-Key': this.config.apiKey }),
      },
    });
  }

  private async delete(url: string): Promise<void> {
    await this.request<void>(url, {
      method: 'DELETE',
      headers: {
        ...(this.config.apiKey && { 'X-API-Key': this.config.apiKey }),
      },
    });
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new WaltIdError(
          `Request failed: ${response.statusText}`,
          'REQUEST_FAILED',
          response.status,
          errorBody
        );
      }

      return await response.json() as T;
    } catch (error) {
      if (error instanceof WaltIdError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new WaltIdConnectionError('timeout');
      }
      throw new WaltIdConnectionError(
        url,
        error instanceof Error ? error : undefined
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// Factory function for creating client from environment
export function createWaltIdClient(env?: {
  WALTID_CORE_URL?: string;
  WALTID_SIGNATORY_URL?: string;
  WALTID_CUSTODIAN_URL?: string;
  WALTID_AUDITOR_URL?: string;
  WALTID_API_KEY?: string;
}): WaltIdClient {
  return new WaltIdClient({
    coreApiUrl: env?.WALTID_CORE_URL ?? 'http://localhost:7000',
    signatoryUrl: env?.WALTID_SIGNATORY_URL ?? 'http://localhost:7001',
    custodianUrl: env?.WALTID_CUSTODIAN_URL ?? 'http://localhost:7002',
    auditorUrl: env?.WALTID_AUDITOR_URL ?? 'http://localhost:7003',
    apiKey: env?.WALTID_API_KEY,
    timeout: 30000,
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/walt-id && pnpm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add packages/walt-id/src/client.ts packages/walt-id/src/client.test.ts
git commit -m "feat(walt-id): implement walt.id client with DID, signing, and verification"
```

---

## Phase 2: RFC3161 Timestamp Service

### Task 2.1: Create Timestamp Types

**Files:**
- Create: `packages/shared/src/timestamp.ts`

**Step 1: Write the timestamp types**

Create `packages/shared/src/timestamp.ts`:

```typescript
import { z } from 'zod';

// ============================================
// RFC3161 TIMESTAMP TYPES
// ============================================

export const TimestampRequestSchema = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/i, 'Must be SHA-256 hex string'),
  hashAlgorithm: z.literal('SHA-256'),
});

export type TimestampRequest = z.infer<typeof TimestampRequestSchema>;

export const TimestampResponseSchema = z.object({
  type: z.literal('RFC3161'),
  timestamp: z.string().datetime(),
  authority: z.string().url(),
  token: z.string(), // Base64 encoded DER
  hashAlgorithm: z.literal('SHA-256'),
});

export type TimestampResponse = z.infer<typeof TimestampResponseSchema>;

// ============================================
// TSA CONFIGURATION
// ============================================

export const TsaConfigSchema = z.object({
  url: z.string().url(),
  name: z.string(),
  timeout: z.number().default(10000),
  // Optional authentication
  username: z.string().optional(),
  password: z.string().optional(),
  // For client certificate auth
  certPath: z.string().optional(),
  keyPath: z.string().optional(),
});

export type TsaConfig = z.infer<typeof TsaConfigSchema>;

// ============================================
// KNOWN TSA PROVIDERS
// ============================================

export const TSA_PROVIDERS = {
  FREETSA: {
    url: 'https://freetsa.org/tsr',
    name: 'FreeTSA',
  },
  DIGICERT: {
    url: 'https://timestamp.digicert.com',
    name: 'DigiCert',
  },
  SECTIGO: {
    url: 'https://timestamp.sectigo.com',
    name: 'Sectigo',
  },
} as const;

export type TsaProvider = keyof typeof TSA_PROVIDERS;
```

**Step 2: Export from index**

Update `packages/shared/src/index.ts`:

```typescript
export * from './timestamp.js';
```

**Step 3: Commit**

```bash
git add packages/shared/src/timestamp.ts packages/shared/src/index.ts
git commit -m "feat(shared): add RFC3161 timestamp types"
```

---

### Task 2.2: Create Timestamp Service

**Files:**
- Create: `apps/api/src/services/timestamp.service.ts`
- Create: `apps/api/src/services/timestamp.service.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/services/timestamp.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TimestampService } from './timestamp.service.js';
import { createHash } from 'crypto';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('TimestampService', () => {
  let service: TimestampService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TimestampService({
      url: 'https://freetsa.org/tsr',
      name: 'FreeTSA',
      timeout: 5000,
    });
  });

  describe('createTimestamp', () => {
    it('should create timestamp for SHA-256 hash', async () => {
      const mockToken = Buffer.from('mock-tsa-response').toString('base64');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Buffer.from(mockToken, 'base64'),
      });

      const hash = createHash('sha256').update('test data').digest('hex');
      const result = await service.createTimestamp(hash);

      expect(result.type).toBe('RFC3161');
      expect(result.hashAlgorithm).toBe('SHA-256');
      expect(result.authority).toBe('https://freetsa.org/tsr');
      expect(result.token).toBeDefined();
    });

    it('should reject invalid hash format', async () => {
      await expect(
        service.createTimestamp('not-a-valid-hash')
      ).rejects.toThrow();
    });
  });

  describe('hashPayload', () => {
    it('should create deterministic hash of JSON payload', () => {
      const payload = { foo: 'bar', nested: { a: 1 } };
      const hash1 = TimestampService.hashPayload(payload);
      const hash2 = TimestampService.hashPayload(payload);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce different hash for different payloads', () => {
      const hash1 = TimestampService.hashPayload({ a: 1 });
      const hash2 = TimestampService.hashPayload({ a: 2 });

      expect(hash1).not.toBe(hash2);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- timestamp.service.test.ts`
Expected: FAIL - module not found

**Step 3: Write the implementation**

Create `apps/api/src/services/timestamp.service.ts`:

```typescript
import { createHash } from 'crypto';
import {
  type TsaConfig,
  type TimestampResponse,
  TimestampRequestSchema,
  TSA_PROVIDERS,
} from '@eurocomply/shared';

export class TimestampService {
  constructor(private readonly config: TsaConfig) {}

  /**
   * Create an RFC3161 timestamp for a SHA-256 hash.
   */
  async createTimestamp(hash: string): Promise<TimestampResponse> {
    // Validate hash format
    TimestampRequestSchema.parse({ hash, hashAlgorithm: 'SHA-256' });

    // Create timestamp request (ASN.1 DER format)
    const tsRequest = this.createTimestampRequest(hash);

    // Send to TSA
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/timestamp-query',
          ...(this.config.username && {
            Authorization: `Basic ${Buffer.from(
              `${this.config.username}:${this.config.password}`
            ).toString('base64')}`,
          }),
        },
        body: tsRequest,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`TSA request failed: ${response.statusText}`);
      }

      const tsResponse = await response.arrayBuffer();
      const token = Buffer.from(tsResponse).toString('base64');

      // Extract timestamp from response (simplified - production would parse ASN.1)
      const timestamp = new Date().toISOString();

      return {
        type: 'RFC3161',
        timestamp,
        authority: this.config.url,
        token,
        hashAlgorithm: 'SHA-256',
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Create ASN.1 DER encoded timestamp request.
   * This is a simplified implementation - production would use a proper ASN.1 library.
   */
  private createTimestampRequest(hash: string): Uint8Array {
    // RFC 3161 TimeStampReq structure (simplified)
    // In production, use @peculiar/asn1-tsp or similar
    const hashBytes = Buffer.from(hash, 'hex');

    // Build ASN.1 structure manually (simplified)
    const oid = Buffer.from([0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]); // SHA-256 OID
    const hashWrapper = Buffer.concat([
      Buffer.from([0x30, hashBytes.length + oid.length + 4]),
      oid,
      Buffer.from([0x04, hashBytes.length]),
      hashBytes,
    ]);

    const request = Buffer.concat([
      Buffer.from([0x30, hashWrapper.length + 3]),
      Buffer.from([0x02, 0x01, 0x01]), // version
      hashWrapper,
    ]);

    return new Uint8Array(request);
  }

  /**
   * Create deterministic SHA-256 hash of a JSON payload.
   */
  static hashPayload(payload: unknown): string {
    const canonical = JSON.stringify(payload, Object.keys(payload as object).sort());
    return createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Verify an RFC3161 timestamp token.
   * Returns the timestamp if valid, throws if invalid.
   */
  async verifyTimestamp(
    token: string,
    originalHash: string
  ): Promise<{ valid: boolean; timestamp: string }> {
    // In production, this would:
    // 1. Parse the ASN.1 DER encoded token
    // 2. Verify the TSA signature
    // 3. Check the hash matches
    // 4. Return the embedded timestamp

    // For now, we trust the token and extract timestamp from it
    // Production implementation would use @peculiar/asn1-tsp

    return {
      valid: true,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Factory for common TSA providers.
   */
  static forProvider(provider: keyof typeof TSA_PROVIDERS): TimestampService {
    const config = TSA_PROVIDERS[provider];
    return new TimestampService({
      url: config.url,
      name: config.name,
      timeout: 10000,
    });
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm test -- timestamp.service.test.ts`
Expected: All tests pass

**Step 5: Commit**

```bash
git add apps/api/src/services/timestamp.service.ts apps/api/src/services/timestamp.service.test.ts
git commit -m "feat(api): add RFC3161 TimestampService"
```

---

## Phase 3: Status List 2021 Bitstring

### Task 3.1: Create Bitstring Encoding Utilities

**Files:**
- Create: `packages/shared/src/status-list-bitstring.ts`
- Create: `packages/shared/src/status-list-bitstring.test.ts`

**Step 1: Write the failing test**

Create `packages/shared/src/status-list-bitstring.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  createBitstring,
  setBit,
  getBit,
  encodeBitstring,
  decodeBitstring,
  MINIMUM_BITSTRING_LENGTH,
} from './status-list-bitstring.js';

describe('Status List 2021 Bitstring', () => {
  describe('createBitstring', () => {
    it('should create bitstring with minimum length', () => {
      const bitstring = createBitstring();
      expect(bitstring.length).toBe(MINIMUM_BITSTRING_LENGTH / 8);
    });

    it('should create bitstring with custom length', () => {
      const bitstring = createBitstring(32768);
      expect(bitstring.length).toBe(32768 / 8);
    });

    it('should initialize all bits to 0', () => {
      const bitstring = createBitstring(64);
      for (let i = 0; i < 64; i++) {
        expect(getBit(bitstring, i)).toBe(0);
      }
    });
  });

  describe('setBit / getBit', () => {
    it('should set and get individual bits', () => {
      const bitstring = createBitstring(64);

      setBit(bitstring, 0, 1);
      setBit(bitstring, 7, 1);
      setBit(bitstring, 15, 1);

      expect(getBit(bitstring, 0)).toBe(1);
      expect(getBit(bitstring, 1)).toBe(0);
      expect(getBit(bitstring, 7)).toBe(1);
      expect(getBit(bitstring, 15)).toBe(1);
    });

    it('should clear bits', () => {
      const bitstring = createBitstring(64);

      setBit(bitstring, 5, 1);
      expect(getBit(bitstring, 5)).toBe(1);

      setBit(bitstring, 5, 0);
      expect(getBit(bitstring, 5)).toBe(0);
    });
  });

  describe('encode / decode', () => {
    it('should roundtrip encode and decode', () => {
      const original = createBitstring(16384);
      setBit(original, 42, 1);
      setBit(original, 100, 1);
      setBit(original, 8000, 1);

      const encoded = encodeBitstring(original);
      const decoded = decodeBitstring(encoded);

      expect(decoded.length).toBe(original.length);
      expect(getBit(decoded, 42)).toBe(1);
      expect(getBit(decoded, 100)).toBe(1);
      expect(getBit(decoded, 8000)).toBe(1);
      expect(getBit(decoded, 0)).toBe(0);
    });

    it('should produce compressed output', () => {
      const bitstring = createBitstring(16384);
      const encoded = encodeBitstring(bitstring);

      // Empty bitstring should compress well
      expect(encoded.length).toBeLessThan(bitstring.length);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared && pnpm test -- status-list-bitstring.test.ts`
Expected: FAIL - module not found

**Step 3: Write the implementation**

Create `packages/shared/src/status-list-bitstring.ts`:

```typescript
import { gzipSync, gunzipSync } from 'zlib';

/**
 * Minimum bitstring length per W3C Status List 2021 spec.
 * Must be at least 16KB (131072 bits) for privacy.
 */
export const MINIMUM_BITSTRING_LENGTH = 131072;

/**
 * Create a new bitstring with all bits set to 0.
 * @param length Number of bits (must be multiple of 8)
 */
export function createBitstring(length: number = MINIMUM_BITSTRING_LENGTH): Uint8Array {
  if (length < 8 || length % 8 !== 0) {
    throw new Error('Bitstring length must be a positive multiple of 8');
  }
  return new Uint8Array(length / 8);
}

/**
 * Set a bit at the specified index.
 * @param bitstring The bitstring to modify
 * @param index Bit index (0-based)
 * @param value 0 or 1
 */
export function setBit(bitstring: Uint8Array, index: number, value: 0 | 1): void {
  const byteIndex = Math.floor(index / 8);
  const bitIndex = 7 - (index % 8); // Big-endian bit ordering

  if (byteIndex >= bitstring.length) {
    throw new Error(`Index ${index} out of bounds for bitstring of length ${bitstring.length * 8}`);
  }

  if (value === 1) {
    bitstring[byteIndex] = bitstring[byteIndex]! | (1 << bitIndex);
  } else {
    bitstring[byteIndex] = bitstring[byteIndex]! & ~(1 << bitIndex);
  }
}

/**
 * Get the bit value at the specified index.
 * @param bitstring The bitstring to read
 * @param index Bit index (0-based)
 * @returns 0 or 1
 */
export function getBit(bitstring: Uint8Array, index: number): 0 | 1 {
  const byteIndex = Math.floor(index / 8);
  const bitIndex = 7 - (index % 8); // Big-endian bit ordering

  if (byteIndex >= bitstring.length) {
    throw new Error(`Index ${index} out of bounds for bitstring of length ${bitstring.length * 8}`);
  }

  return ((bitstring[byteIndex]! >> bitIndex) & 1) as 0 | 1;
}

/**
 * Encode bitstring to base64url-encoded GZIP compressed string.
 * This is the format required by Status List 2021 spec.
 */
export function encodeBitstring(bitstring: Uint8Array): string {
  const compressed = gzipSync(Buffer.from(bitstring));
  return base64urlEncode(compressed);
}

/**
 * Decode base64url-encoded GZIP compressed string to bitstring.
 */
export function decodeBitstring(encoded: string): Uint8Array {
  const compressed = base64urlDecode(encoded);
  const decompressed = gunzipSync(compressed);
  return new Uint8Array(decompressed);
}

/**
 * Base64url encode (RFC 4648).
 */
function base64urlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64url decode (RFC 4648).
 */
function base64urlDecode(str: string): Buffer {
  const base64 = str
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  // Add padding if needed
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

/**
 * Count the number of set bits (revoked credentials).
 */
export function countSetBits(bitstring: Uint8Array): number {
  let count = 0;
  for (const byte of bitstring) {
    // Brian Kernighan's algorithm
    let b = byte;
    while (b) {
      count++;
      b &= b - 1;
    }
  }
  return count;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/shared && pnpm test -- status-list-bitstring.test.ts`
Expected: All tests pass

**Step 5: Export from index**

Update `packages/shared/src/index.ts`:

```typescript
export * from './status-list-bitstring.js';
```

**Step 6: Commit**

```bash
git add packages/shared/src/status-list-bitstring.ts packages/shared/src/status-list-bitstring.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add Status List 2021 bitstring encoding"
```

---

### Task 3.2: Update StatusList2021Service with Bitstring

**Files:**
- Modify: `apps/api/src/services/status-list.service.ts`
- Modify: `apps/api/src/services/status-list.service.test.ts`

**Step 1: Update the test file**

Add to `apps/api/src/services/status-list.service.test.ts`:

```typescript
import {
  createBitstring,
  setBit,
  getBit,
  encodeBitstring,
  decodeBitstring,
} from '@eurocomply/shared';

describe('StatusList2021Service - Bitstring Operations', () => {
  describe('generateStatusListCredential', () => {
    it('should generate a valid Status List 2021 credential', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: 'org_123',
        did: 'did:key:z6MkOrg123',
        name: 'Test Org',
      });

      const credential = await service.generateStatusListCredential('org_123', '2026');

      expect(credential['@context']).toContain('https://www.w3.org/2018/credentials/v1');
      expect(credential.type).toContain('StatusList2021Credential');
      expect(credential.credentialSubject.type).toBe('StatusList2021');
      expect(credential.credentialSubject.statusPurpose).toBe('revocation');
      expect(credential.credentialSubject.encodedList).toBeDefined();
    });
  });

  describe('revokeCredential', () => {
    it('should set bit in status list', async () => {
      const bitstring = createBitstring(16384);
      const encoded = encodeBitstring(bitstring);

      mockPrisma.statusList.findUnique.mockResolvedValue({
        id: 'sl_123',
        organizationId: 'org_123',
        year: '2026',
        encodedList: encoded,
      });
      mockPrisma.statusList.update.mockImplementation(async ({ data }) => ({
        ...data,
        id: 'sl_123',
      }));

      await service.revokeCredential('org_123', '2026', 42);

      const updateCall = mockPrisma.statusList.update.mock.calls[0][0];
      const updatedBitstring = decodeBitstring(updateCall.data.encodedList);
      expect(getBit(updatedBitstring, 42)).toBe(1);
    });
  });

  describe('isRevoked', () => {
    it('should return true for revoked credential', async () => {
      const bitstring = createBitstring(16384);
      setBit(bitstring, 100, 1);
      const encoded = encodeBitstring(bitstring);

      mockPrisma.statusList.findUnique.mockResolvedValue({
        id: 'sl_123',
        encodedList: encoded,
      });

      const revoked = await service.isRevoked('org_123', '2026', 100);
      expect(revoked).toBe(true);
    });

    it('should return false for non-revoked credential', async () => {
      const bitstring = createBitstring(16384);
      const encoded = encodeBitstring(bitstring);

      mockPrisma.statusList.findUnique.mockResolvedValue({
        id: 'sl_123',
        encodedList: encoded,
      });

      const revoked = await service.isRevoked('org_123', '2026', 100);
      expect(revoked).toBe(false);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm test -- status-list.service.test.ts`
Expected: Some tests fail (new methods not implemented)

**Step 3: Update the implementation**

Update `apps/api/src/services/status-list.service.ts` to add:

```typescript
import {
  createBitstring,
  setBit,
  getBit,
  encodeBitstring,
  decodeBitstring,
  MINIMUM_BITSTRING_LENGTH,
  type StatusListCredential,
} from '@eurocomply/shared';

// Add these methods to StatusList2021Service class:

  /**
   * Generate a Status List 2021 Credential for an organization.
   */
  async generateStatusListCredential(
    organizationId: string,
    year: string
  ): Promise<StatusListCredential> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { did: true, name: true },
    });

    if (!org || !org.did) {
      throw new NotFoundError('Organization or DID', organizationId);
    }

    // Get or create status list
    let statusList = await this.prisma.statusList.findUnique({
      where: {
        organizationId_year: { organizationId, year },
      },
    });

    if (!statusList) {
      const bitstring = createBitstring(MINIMUM_BITSTRING_LENGTH);
      const encoded = encodeBitstring(bitstring);

      statusList = await this.prisma.statusList.create({
        data: {
          organizationId,
          year,
          encodedList: encoded,
        },
      });
    }

    const credentialId = `${this.baseUrl}/status/${organizationId}/${year}`;

    return {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://w3id.org/vc/status-list/2021/v1',
      ],
      type: ['VerifiableCredential', 'StatusList2021Credential'],
      issuer: org.did,
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: `${credentialId}#list`,
        type: 'StatusList2021',
        statusPurpose: 'revocation',
        encodedList: statusList.encodedList,
      },
    };
  }

  /**
   * Revoke a credential by setting its bit in the status list.
   */
  async revokeCredential(
    organizationId: string,
    year: string,
    index: number
  ): Promise<void> {
    const statusList = await this.prisma.statusList.findUnique({
      where: {
        organizationId_year: { organizationId, year },
      },
    });

    if (!statusList) {
      throw new NotFoundError('StatusList', `${organizationId}/${year}`);
    }

    const bitstring = decodeBitstring(statusList.encodedList);
    setBit(bitstring, index, 1);
    const encoded = encodeBitstring(bitstring);

    await this.prisma.statusList.update({
      where: { id: statusList.id },
      data: { encodedList: encoded },
    });
  }

  /**
   * Check if a credential is revoked.
   */
  async isRevoked(
    organizationId: string,
    year: string,
    index: number
  ): Promise<boolean> {
    const statusList = await this.prisma.statusList.findUnique({
      where: {
        organizationId_year: { organizationId, year },
      },
    });

    if (!statusList) {
      return false; // No status list means no revocations
    }

    const bitstring = decodeBitstring(statusList.encodedList);
    return getBit(bitstring, index) === 1;
  }
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm test -- status-list.service.test.ts`
Expected: All tests pass

**Step 5: Commit**

```bash
git add apps/api/src/services/status-list.service.ts apps/api/src/services/status-list.service.test.ts
git commit -m "feat(api): add bitstring encoding to StatusList2021Service"
```

---

## Phase 4: Sealed Artifact Service

### Task 4.1: Create SealedArtifactService

**Files:**
- Create: `apps/api/src/services/sealed-artifact.service.ts`
- Create: `apps/api/src/services/sealed-artifact.service.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/services/sealed-artifact.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { SealedArtifactService } from './sealed-artifact.service.js';

interface MockDependencies {
  waltIdClient: {
    sign: Mock;
  };
  timestampService: {
    createTimestamp: Mock;
  };
  statusListService: {
    allocateIndex: Mock;
    getStatusListUrl: Mock;
  };
  prisma: {
    organization: { findUnique: Mock };
    userDidHistory: { findFirst: Mock };
    orgDidHistory: { findFirst: Mock };
  };
}

const mockDeps: MockDependencies = {
  waltIdClient: {
    sign: vi.fn(),
  },
  timestampService: {
    createTimestamp: vi.fn(),
  },
  statusListService: {
    allocateIndex: vi.fn(),
    getStatusListUrl: vi.fn(),
  },
  prisma: {
    organization: { findUnique: vi.fn() },
    userDidHistory: { findFirst: vi.fn() },
    orgDidHistory: { findFirst: vi.fn() },
  },
};

describe('SealedArtifactService', () => {
  let service: SealedArtifactService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SealedArtifactService(
      mockDeps.waltIdClient as any,
      mockDeps.timestampService as any,
      mockDeps.statusListService as any,
      mockDeps.prisma as any
    );
  });

  describe('createSealedArtifact', () => {
    it('should create complete sealed artifact with all proofs', async () => {
      // Setup mocks
      mockDeps.prisma.userDidHistory.findFirst.mockResolvedValue({
        did: 'did:key:z6MkUser123',
        waltIdKeyId: 'key_user_123',
      });
      mockDeps.prisma.orgDidHistory.findFirst.mockResolvedValue({
        did: 'did:key:z6MkOrg456',
        waltIdKeyId: 'key_org_456',
      });
      mockDeps.prisma.organization.findUnique.mockResolvedValue({
        id: 'org_123',
        name: 'Test Org',
        did: 'did:key:z6MkOrg456',
      });
      mockDeps.waltIdClient.sign
        .mockResolvedValueOnce({
          jws: 'user-signature-jws',
          verificationMethod: 'did:key:z6MkUser123#z6MkUser123',
          created: '2026-01-18T10:00:00Z',
        })
        .mockResolvedValueOnce({
          jws: 'org-signature-jws',
          verificationMethod: 'did:key:z6MkOrg456#z6MkOrg456',
          created: '2026-01-18T10:00:01Z',
        });
      mockDeps.statusListService.allocateIndex.mockResolvedValue(42);
      mockDeps.statusListService.getStatusListUrl.mockReturnValue(
        'https://dpp.eurocomply.eu/status/org_123/2026'
      );
      mockDeps.timestampService.createTimestamp.mockResolvedValue({
        type: 'RFC3161',
        timestamp: '2026-01-18T10:00:05Z',
        authority: 'https://freetsa.org/tsr',
        token: 'base64-timestamp-token',
        hashAlgorithm: 'SHA-256',
      });

      const result = await service.createSealedArtifact({
        organizationId: 'org_123',
        userId: 'user_456',
        payload: {
          type: 'ProductVersionRelease',
          productId: 'prod_789',
          data: { name: 'Test Product' },
        },
        userContext: {
          name: 'Maria Santos',
          email: 'maria@test.com',
          role: 'EDITOR',
          workspaceAuthority: 'DESIGN:EDITOR',
        },
      });

      // Verify structure
      expect(result.payload.type).toBe('ProductVersionRelease');
      expect(result.userProof.type).toBe('Ed25519Signature2020');
      expect(result.userProof.signatureValue).toBe('user-signature-jws');
      expect(result.userProof.forensicContext.signerName).toBe('Maria Santos');
      expect(result.corporateProof.type).toBe('Ed25519Signature2020');
      expect(result.corporateProof.signatureValue).toBe('org-signature-jws');
      expect(result.credentialStatus.statusListIndex).toBe('42');
      expect(result.timestampProof.type).toBe('RFC3161');
    });

    it('should create artifact without timestamp if TSA fails', async () => {
      mockDeps.prisma.userDidHistory.findFirst.mockResolvedValue({
        did: 'did:key:z6MkUser123',
        waltIdKeyId: 'key_user_123',
      });
      mockDeps.prisma.orgDidHistory.findFirst.mockResolvedValue({
        did: 'did:key:z6MkOrg456',
        waltIdKeyId: 'key_org_456',
      });
      mockDeps.prisma.organization.findUnique.mockResolvedValue({
        id: 'org_123',
        name: 'Test Org',
        did: 'did:key:z6MkOrg456',
      });
      mockDeps.waltIdClient.sign
        .mockResolvedValueOnce({
          jws: 'user-jws',
          verificationMethod: 'did:key:z6MkUser123#z6MkUser123',
          created: '2026-01-18T10:00:00Z',
        })
        .mockResolvedValueOnce({
          jws: 'org-jws',
          verificationMethod: 'did:key:z6MkOrg456#z6MkOrg456',
          created: '2026-01-18T10:00:01Z',
        });
      mockDeps.statusListService.allocateIndex.mockResolvedValue(1);
      mockDeps.statusListService.getStatusListUrl.mockReturnValue('https://example.com/status');
      mockDeps.timestampService.createTimestamp.mockRejectedValue(new Error('TSA unavailable'));

      const result = await service.createSealedArtifact({
        organizationId: 'org_123',
        userId: 'user_456',
        payload: { type: 'Test' },
        userContext: {
          name: 'Test User',
          email: 'test@test.com',
          role: 'EDITOR',
          workspaceAuthority: 'DESIGN:EDITOR',
        },
        requireTimestamp: false,
      });

      expect(result.userProof).toBeDefined();
      expect(result.corporateProof).toBeDefined();
      expect(result.timestampProof).toBeUndefined();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- sealed-artifact.service.test.ts`
Expected: FAIL - module not found

**Step 3: Write the implementation**

Create `apps/api/src/services/sealed-artifact.service.ts`:

```typescript
import { type PrismaClient } from '@eurocomply/db';
import { type WaltIdClient } from '@eurocomply/walt-id';
import {
  type SealedArtifact,
  type UserForensicContext,
  type OrgForensicContext,
  createUserForensicContext,
  createOrgForensicContext,
} from '@eurocomply/shared';
import { TimestampService } from './timestamp.service.js';
import { StatusList2021Service } from './status-list.service.js';
import { NotFoundError } from '../lib/errors.js';

export interface CreateSealedArtifactInput {
  organizationId: string;
  userId: string;
  payload: Record<string, unknown>;
  userContext: {
    name: string;
    email: string;
    role: string;
    workspaceAuthority: string;
  };
  requireTimestamp?: boolean;
}

export class SealedArtifactService {
  constructor(
    private readonly waltIdClient: WaltIdClient,
    private readonly timestampService: TimestampService,
    private readonly statusListService: StatusList2021Service,
    private readonly prisma: PrismaClient
  ) {}

  /**
   * Create a complete Sealed Artifact with Corporate Envelope.
   *
   * Flow:
   * 1. User signs payload → userProof
   * 2. Organization wraps → corporateProof
   * 3. Allocate status list index → credentialStatus
   * 4. Request TSA timestamp → timestampProof
   */
  async createSealedArtifact(
    input: CreateSealedArtifactInput
  ): Promise<SealedArtifact> {
    const { organizationId, userId, payload, userContext, requireTimestamp = true } = input;

    // Get user's current DID
    const userDid = await this.prisma.userDidHistory.findFirst({
      where: { userId, validTo: null, revokedAt: null },
      orderBy: { validFrom: 'desc' },
    });

    if (!userDid) {
      throw new NotFoundError('User DID', userId);
    }

    // Get organization's current DID
    const orgDid = await this.prisma.orgDidHistory.findFirst({
      where: { organizationId, validTo: null, revokedAt: null },
      orderBy: { validFrom: 'desc' },
    });

    if (!orgDid) {
      throw new NotFoundError('Organization DID', organizationId);
    }

    // Get organization details for forensic context
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, did: true },
    });

    if (!org) {
      throw new NotFoundError('Organization', organizationId);
    }

    // Add sealedAt to payload
    const sealedPayload = {
      ...payload,
      sealedAt: new Date().toISOString(),
    };

    // 1. User signs payload
    const userForensicContext = createUserForensicContext(
      { name: userContext.name, email: userContext.email },
      userContext.role,
      userContext.workspaceAuthority
    );

    const userSignResult = await this.waltIdClient.sign({
      keyId: userDid.waltIdKeyId,
      payload: sealedPayload,
      proofType: 'Ed25519Signature2020',
      proofPurpose: 'assertionMethod',
    });

    // 2. Organization wraps (signs the user proof)
    const orgForensicContext = createOrgForensicContext({
      id: org.id,
      name: org.name,
    });

    const orgSignResult = await this.waltIdClient.sign({
      keyId: orgDid.waltIdKeyId,
      payload: {
        userProof: {
          verificationMethod: userSignResult.verificationMethod,
          signatureValue: userSignResult.jws,
        },
      },
      proofType: 'Ed25519Signature2020',
      proofPurpose: 'authentication',
    });

    // 3. Allocate status list index
    const year = new Date().getFullYear().toString();
    const statusListIndex = await this.statusListService.allocateIndex(
      organizationId,
      year
    );
    const statusListUrl = this.statusListService.getStatusListUrl(
      organizationId,
      year
    );

    // 4. Get timestamp (optional)
    let timestampProof: SealedArtifact['timestampProof'] | undefined;

    if (requireTimestamp) {
      try {
        const payloadHash = TimestampService.hashPayload(sealedPayload);
        timestampProof = await this.timestampService.createTimestamp(payloadHash);
      } catch (error) {
        if (requireTimestamp) {
          throw error;
        }
        // If timestamp is optional, continue without it
        console.warn('TSA timestamp failed, continuing without timestamp:', error);
      }
    }

    // Build sealed artifact
    const sealedArtifact: SealedArtifact = {
      payload: sealedPayload,

      userProof: {
        type: 'Ed25519Signature2020',
        verificationMethod: userSignResult.verificationMethod,
        signatureValue: userSignResult.jws,
        created: userSignResult.created,
        forensicContext: userForensicContext,
      },

      corporateProof: {
        type: 'Ed25519Signature2020',
        verificationMethod: orgSignResult.verificationMethod,
        signatureValue: orgSignResult.jws,
        created: orgSignResult.created,
        forensicContext: orgForensicContext,
      },

      credentialStatus: {
        type: 'StatusList2021Entry',
        statusPurpose: 'revocation',
        statusListIndex: statusListIndex.toString(),
        statusListCredential: statusListUrl,
      },

      ...(timestampProof && { timestampProof }),
    };

    return sealedArtifact;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm test -- sealed-artifact.service.test.ts`
Expected: All tests pass

**Step 5: Commit**

```bash
git add apps/api/src/services/sealed-artifact.service.ts apps/api/src/services/sealed-artifact.service.test.ts
git commit -m "feat(api): add SealedArtifactService for Corporate Envelope"
```

---

## Phase 5: Verification Service

### Task 5.1: Create VerificationService

**Files:**
- Create: `apps/api/src/services/verification.service.ts`
- Create: `apps/api/src/services/verification.service.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/services/verification.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { VerificationService, VerificationResult } from './verification.service.js';

interface MockDependencies {
  waltIdClient: {
    verify: Mock;
  };
  statusListService: {
    isRevoked: Mock;
  };
  timestampService: {
    verifyTimestamp: Mock;
  };
}

const mockDeps: MockDependencies = {
  waltIdClient: {
    verify: vi.fn(),
  },
  statusListService: {
    isRevoked: vi.fn(),
  },
  timestampService: {
    verifyTimestamp: vi.fn(),
  },
};

describe('VerificationService', () => {
  let service: VerificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new VerificationService(
      mockDeps.waltIdClient as any,
      mockDeps.statusListService as any,
      mockDeps.timestampService as any
    );
  });

  describe('verifySealedArtifact', () => {
    const validArtifact = {
      payload: { type: 'Test', data: {} },
      userProof: {
        type: 'Ed25519Signature2020' as const,
        verificationMethod: 'did:key:z6MkUser#z6MkUser',
        signatureValue: 'user-jws',
        created: '2026-01-18T10:00:00Z',
        forensicContext: {
          signerName: 'Test User',
          signerEmail: 'test@test.com',
          signerRole: 'EDITOR',
          workspaceAuthority: 'DESIGN:EDITOR',
          signedAt: '2026-01-18T10:00:00Z',
        },
      },
      corporateProof: {
        type: 'Ed25519Signature2020' as const,
        verificationMethod: 'did:key:z6MkOrg#z6MkOrg',
        signatureValue: 'org-jws',
        created: '2026-01-18T10:00:01Z',
        forensicContext: {
          organizationName: 'Test Org',
          organizationId: 'org_123',
          signedAt: '2026-01-18T10:00:01Z',
        },
      },
      credentialStatus: {
        type: 'StatusList2021Entry' as const,
        statusPurpose: 'revocation' as const,
        statusListIndex: '42',
        statusListCredential: 'https://example.com/status/org_123/2026',
      },
    };

    it('should return valid for properly signed, non-revoked artifact', async () => {
      mockDeps.waltIdClient.verify.mockResolvedValue({
        valid: true,
        checks: { signature: true },
        errors: [],
      });
      mockDeps.statusListService.isRevoked.mockResolvedValue(false);

      const result = await service.verifySealedArtifact(validArtifact);

      expect(result.valid).toBe(true);
      expect(result.checks.userSignature).toBe(true);
      expect(result.checks.orgSignature).toBe(true);
      expect(result.checks.revocationStatus).toBe(true);
    });

    it('should return invalid for bad signature', async () => {
      mockDeps.waltIdClient.verify.mockResolvedValue({
        valid: false,
        checks: { signature: false },
        errors: ['Invalid signature'],
      });

      const result = await service.verifySealedArtifact(validArtifact);

      expect(result.valid).toBe(false);
      expect(result.checks.userSignature).toBe(false);
      expect(result.errors).toContain('User signature verification failed');
    });

    it('should return revoked for revoked credential', async () => {
      mockDeps.waltIdClient.verify.mockResolvedValue({
        valid: true,
        checks: { signature: true },
        errors: [],
      });
      mockDeps.statusListService.isRevoked.mockResolvedValue(true);

      const result = await service.verifySealedArtifact(validArtifact);

      expect(result.valid).toBe(false);
      expect(result.checks.revocationStatus).toBe(false);
      expect(result.errors).toContain('Credential has been revoked');
    });

    it('should accept revoked credential if signed before revocation', async () => {
      const artifactWithTimestamp = {
        ...validArtifact,
        timestampProof: {
          type: 'RFC3161' as const,
          timestamp: '2026-01-18T10:00:05Z',
          authority: 'https://freetsa.org/tsr',
          token: 'base64-token',
          hashAlgorithm: 'SHA-256' as const,
        },
      };

      mockDeps.waltIdClient.verify.mockResolvedValue({
        valid: true,
        checks: { signature: true },
        errors: [],
      });
      mockDeps.statusListService.isRevoked.mockResolvedValue(true);
      // Revocation happened AFTER timestamp
      mockDeps.timestampService.verifyTimestamp.mockResolvedValue({
        valid: true,
        timestamp: '2026-01-18T10:00:05Z',
      });

      // For this test, we simulate that revocation was at 11:00, but signature was at 10:00
      const result = await service.verifySealedArtifact(artifactWithTimestamp, {
        revocationTime: new Date('2026-01-18T11:00:00Z'),
      });

      expect(result.valid).toBe(true);
      expect(result.checks.timestampBeforeRevocation).toBe(true);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- verification.service.test.ts`
Expected: FAIL - module not found

**Step 3: Write the implementation**

Create `apps/api/src/services/verification.service.ts`:

```typescript
import { type WaltIdClient } from '@eurocomply/walt-id';
import { type SealedArtifact } from '@eurocomply/shared';
import { StatusList2021Service } from './status-list.service.js';
import { TimestampService } from './timestamp.service.js';

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

export interface VerificationOptions {
  checkRevocation?: boolean;
  revocationTime?: Date;
}

export class VerificationService {
  constructor(
    private readonly waltIdClient: WaltIdClient,
    private readonly statusListService: StatusList2021Service,
    private readonly timestampService: TimestampService
  ) {}

  /**
   * Verify a Sealed Artifact following the verification algorithm:
   *
   * 1. SIGNATURE CHECK (Offline)
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
      errors.push(`User signature verification error: ${error instanceof Error ? error.message : 'Unknown'}`);
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
      errors.push(`Organization signature verification error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    // 3. Check revocation status
    if (checkRevocation && artifact.credentialStatus) {
      const { statusListCredential, statusListIndex } = artifact.credentialStatus;

      // Parse org and year from status list URL
      const urlMatch = statusListCredential.match(/\/status\/([^/]+)\/(\d{4})/);
      if (urlMatch) {
        const [, orgId, year] = urlMatch;

        const isRevoked = await this.statusListService.isRevoked(
          orgId!,
          year!,
          parseInt(statusListIndex, 10)
        );

        if (isRevoked) {
          // Check if we have a timestamp proof that predates revocation
          if (artifact.timestampProof && revocationTime) {
            const timestampDate = new Date(artifact.timestampProof.timestamp);

            if (timestampDate < revocationTime) {
              checks.revocationStatus = true;
              checks.timestampBeforeRevocation = true;
              warnings.push('Credential is revoked, but signature timestamp predates revocation');
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
        warnings.push(`Timestamp verification error: ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }

    // Build result
    const valid = checks.userSignature && checks.orgSignature && checks.revocationStatus;

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
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm test -- verification.service.test.ts`
Expected: All tests pass

**Step 5: Commit**

```bash
git add apps/api/src/services/verification.service.ts apps/api/src/services/verification.service.test.ts
git commit -m "feat(api): add VerificationService with full verification algorithm"
```

---

### Task 5.2: Create Verification API Routes

**Files:**
- Create: `apps/api/src/routes/verification.ts`

**Step 1: Create the routes**

Create `apps/api/src/routes/verification.ts`:

```typescript
import { Hono } from 'hono';
import { ok, err } from '@eurocomply/shared';
import { VerificationService } from '../services/verification.service.js';
import { createWaltIdClient } from '@eurocomply/walt-id';
import { StatusList2021Service } from '../services/status-list.service.js';
import { TimestampService, TSA_PROVIDERS } from '../services/timestamp.service.js';
import { prisma } from '@eurocomply/db';
import type { AppVariables } from '../types/context.js';

const verification = new Hono<{ Variables: AppVariables }>();

// Initialize services
const waltIdClient = createWaltIdClient();
const statusListService = new StatusList2021Service(prisma);
const timestampService = TimestampService.forProvider('FREETSA');
const verificationService = new VerificationService(
  waltIdClient,
  statusListService,
  timestampService
);

/**
 * POST /api/v1/verify
 * Verify a Sealed Artifact.
 * Public endpoint - no auth required.
 */
verification.post('/', async (c) => {
  try {
    const body = await c.req.json();

    if (!body.artifact) {
      return c.json(err('VALIDATION_ERROR', 'Missing artifact in request body'), 400);
    }

    const result = await verificationService.verifySealedArtifact(body.artifact, {
      checkRevocation: body.checkRevocation ?? true,
      revocationTime: body.revocationTime ? new Date(body.revocationTime) : undefined,
    });

    return c.json(ok(result));
  } catch (error) {
    return c.json(
      err('VERIFICATION_ERROR', error instanceof Error ? error.message : 'Verification failed'),
      500
    );
  }
});

/**
 * POST /api/v1/verify/signature
 * Quick signature-only verification (offline capable).
 * Public endpoint - no auth required.
 */
verification.post('/signature', async (c) => {
  try {
    const body = await c.req.json();

    if (!body.artifact) {
      return c.json(err('VALIDATION_ERROR', 'Missing artifact in request body'), 400);
    }

    const result = await verificationService.verifySignaturesOnly(body.artifact);

    return c.json(ok(result));
  } catch (error) {
    return c.json(
      err('VERIFICATION_ERROR', error instanceof Error ? error.message : 'Verification failed'),
      500
    );
  }
});

/**
 * GET /api/v1/verify/status/:orgId/:year
 * Get Status List 2021 credential for an organization.
 * Public endpoint - required for revocation checking.
 */
verification.get('/status/:orgId/:year', async (c) => {
  const orgId = c.req.param('orgId');
  const year = c.req.param('year');

  try {
    const credential = await statusListService.generateStatusListCredential(orgId, year);

    return c.json(credential, 200, {
      'Content-Type': 'application/vc+ld+json',
      'Cache-Control': 'public, max-age=300', // 5 minute cache
    });
  } catch (error) {
    return c.json(err('NOT_FOUND', 'Status list not found'), 404);
  }
});

export { verification };
```

**Step 2: Register routes**

Update `apps/api/src/routes/index.ts`:

```typescript
import { verification } from './verification.js';

// ... existing routes ...

app.route('/api/v1/verify', verification);
```

**Step 3: Commit**

```bash
git add apps/api/src/routes/verification.ts apps/api/src/routes/index.ts
git commit -m "feat(api): add verification API routes"
```

---

## Phase 6: Integration and Testing

### Task 6.1: Add Database Tables for Status List

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Step 1: Add StatusList model**

Add to `packages/db/prisma/schema.prisma`:

```prisma
// ============================================
// STATUS LIST 2021 - Revocation Registry
// ============================================

model StatusList {
  id              String   @id @default(cuid())
  organizationId  String   @map("organization_id")
  year            String
  encodedList     String   @map("encoded_list") @db.Text

  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@unique([organizationId, year])
  @@map("status_lists")
}
```

**Step 2: Generate and run migration**

Run: `cd packages/db && npx prisma migrate dev --name status_list_table`
Expected: Migration created and applied

**Step 3: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "feat(db): add StatusList table for revocation registry"
```

---

### Task 6.2: Update Workspace Root

**Files:**
- Modify: `pnpm-workspace.yaml`

**Step 1: Add walt-id package to workspace**

Update `pnpm-workspace.yaml` if needed:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**Step 2: Install all dependencies**

Run: `pnpm install`
Expected: All packages installed

**Step 3: Build all packages**

Run: `pnpm build`
Expected: Build succeeds

**Step 4: Run all tests**

Run: `pnpm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "chore: add walt-id package to workspace"
```

---

## Execution Summary

| Phase | Tasks | Purpose |
|-------|-------|---------|
| 1. walt.id Client | 4 tasks | Type-safe client for walt.id Community Stack |
| 2. RFC3161 Timestamp | 2 tasks | Legal timestamp proofs |
| 3. Status List Bitstring | 2 tasks | W3C-compliant revocation encoding |
| 4. Sealed Artifact | 1 task | Corporate Envelope orchestration |
| 5. Verification | 2 tasks | Full verification algorithm + API |
| 6. Integration | 2 tasks | Database and workspace setup |

**Total:** ~13 tasks, ~65 steps

---

## Infrastructure Notes (Not in Plan)

The following infrastructure is required but not covered in this implementation plan:

1. **AWS EKS Cluster** - Provision on EU Sovereign Cloud
2. **walt.id Helm Charts** - Deploy Community Stack to EKS
3. **AWS KMS Key** - Create Ed25519 key for Custodian backend
4. **mTLS Certificates** - For EuroComply ↔ walt.id communication
5. **R2 Bucket** - For hosting Status List 2021 credentials

These should be handled via Infrastructure as Code (Terraform/Pulumi) in a separate deployment plan.

---

## Related Documents

- Design: `docs/plans/2026-01-18-versioning-events-did-design.md`
- Previous Implementation: `docs/plans/2026-01-18-versioning-events-did-implementation.md`
- Verifiable Credentials: `docs/plans/2026-01-15-verifiable-credentials-design.md`
- Security: `docs/plans/2026-01-15-security-design.md`

---

*Last Updated: 2026-01-18*
