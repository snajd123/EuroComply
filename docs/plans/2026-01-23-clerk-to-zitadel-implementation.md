# Clerk to ZITADEL Migration - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Clerk authentication with ZITADEL Cloud (EU) for full EU data sovereignty.

**Architecture:** Clean cutover - remove Clerk entirely, implement ZITADEL using standard OIDC JWT verification via `jose` library. Webhooks via ZITADEL Actions v2 with HMAC signature verification. Reconciliation job as safety net for missed webhooks.

**Tech Stack:** TypeScript, Hono, MikroORM, PostgreSQL, ZITADEL Cloud, jose (JWT), node-cron

**Design Document:** [2026-01-23-clerk-to-zitadel-migration-design.md](./2026-01-23-clerk-to-zitadel-migration-design.md)

---

## Prerequisites

Before starting implementation:

- [ ] ZITADEL Cloud account created (EU region: `https://<instance>.zitadel.cloud`)
- [ ] Project created in ZITADEL Console
- [ ] OIDC Application created (type: API / Backend)
- [ ] Service User created with Manager role (for API calls)
- [ ] Actions v2 Target configured pointing to ngrok URL for local dev
- [ ] Note down: Instance URL, Client ID, Client Secret, Signing Key

---

## Phase 1: Core Integration

### Task 1: Replace npm Dependencies

**Files:**
- Modify: `apps/api/package.json`

**Step 1: Remove Clerk, add jose for JWT verification**

```bash
cd apps/api && pnpm remove @clerk/backend && pnpm add jose
```

**Step 2: Verify package.json updated**

Check `apps/api/package.json` no longer contains `@clerk/backend` and contains `jose`.

**Step 3: Commit**

```bash
git add apps/api/package.json apps/api/pnpm-lock.yaml pnpm-lock.yaml
git commit -m "chore(api): replace @clerk/backend with jose for JWT verification"
```

---

### Task 2: Update Environment Variables

**Files:**
- Modify: `.env.example`

**Step 1: Replace Clerk env vars with ZITADEL**

Replace lines 12-14 in `.env.example`:

```env
# ZITADEL Authentication
ZITADEL_INSTANCE_URL=https://your-instance.zitadel.cloud
ZITADEL_CLIENT_ID=your_client_id
ZITADEL_CLIENT_SECRET=your_client_secret
ZITADEL_WEBHOOK_SIGNING_KEY=your_signing_key
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: update env vars from Clerk to ZITADEL"
```

---

### Task 3: Rewrite JWT Verification

**Files:**
- Modify: `apps/api/src/utils/jwt.ts`
- Modify: `apps/api/src/utils/jwt.test.ts`

**Step 1: Write the failing test**

Replace `apps/api/src/utils/jwt.test.ts` with:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyAndExtractTenant, type JwtVerificationOptions } from './jwt.js';

// Mock jose module
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(),
  jwtVerify: vi.fn(),
}));

import { createRemoteJWKSet, jwtVerify } from 'jose';

describe('verifyAndExtractTenant', () => {
  const mockOptions: JwtVerificationOptions = {
    instanceUrl: 'https://test.zitadel.cloud',
    clientId: 'test-client-id',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns tenant context for valid token with custom claims', async () => {
    const mockPayload = {
      sub: 'user_123',
      'urn:zitadel:iam:org:id': 'org_456',
      'urn:eurocomply:schema_name': 'tenant_org_456',
      'urn:eurocomply:tier': 'starter',
      'urn:eurocomply:cell_id': 'cell_1',
    };

    vi.mocked(createRemoteJWKSet).mockReturnValue(vi.fn() as any);
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: mockPayload,
      protectedHeader: { alg: 'RS256' },
    } as any);

    const result = await verifyAndExtractTenant('valid.jwt.token', mockOptions);

    expect(result).toEqual({
      schemaName: 'tenant_org_456',
      userId: 'user_123',
      orgId: 'org_456',
      tier: 'starter',
      cellId: 'cell_1',
    });
  });

  it('returns null for token without schema_name claim', async () => {
    const mockPayload = {
      sub: 'user_123',
      'urn:zitadel:iam:org:id': 'org_456',
      // Missing schema_name
    };

    vi.mocked(createRemoteJWKSet).mockReturnValue(vi.fn() as any);
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: mockPayload,
      protectedHeader: { alg: 'RS256' },
    } as any);

    const result = await verifyAndExtractTenant('token.without.schema', mockOptions);

    expect(result).toBeNull();
  });

  it('returns null for invalid token', async () => {
    vi.mocked(createRemoteJWKSet).mockReturnValue(vi.fn() as any);
    vi.mocked(jwtVerify).mockRejectedValue(new Error('Invalid signature'));

    const result = await verifyAndExtractTenant('invalid.token', mockOptions);

    expect(result).toBeNull();
  });

  it('caches JWKS for same instance URL', async () => {
    const mockPayload = {
      sub: 'user_123',
      'urn:eurocomply:schema_name': 'tenant_org_456',
    };

    vi.mocked(createRemoteJWKSet).mockReturnValue(vi.fn() as any);
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: mockPayload,
      protectedHeader: { alg: 'RS256' },
    } as any);

    await verifyAndExtractTenant('token1', mockOptions);
    await verifyAndExtractTenant('token2', mockOptions);

    // JWKS should only be created once per instance URL
    expect(createRemoteJWKSet).toHaveBeenCalledTimes(1);
  });
});

describe('extractTenantFromJwtUnsafe', () => {
  it('extracts tenant from base64 payload without verification', async () => {
    const { extractTenantFromJwtUnsafe } = await import('./jwt.js');

    // Create a mock JWT with base64-encoded payload
    const payload = {
      sub: 'user_123',
      'urn:eurocomply:schema_name': 'tenant_test',
    };
    const base64Payload = btoa(JSON.stringify(payload));
    const mockToken = `header.${base64Payload}.signature`;

    const result = extractTenantFromJwtUnsafe(mockToken);

    expect(result).toEqual({
      schemaName: 'tenant_test',
      userId: 'user_123',
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm test src/utils/jwt.test.ts
```

Expected: FAIL (jwt.ts still has Clerk code)

**Step 3: Write the implementation**

Replace `apps/api/src/utils/jwt.ts` with:

```typescript
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { TenantContext } from '../middleware/tenant.js';

/**
 * Options for JWT verification
 */
export interface JwtVerificationOptions {
  /** ZITADEL instance URL (e.g., https://your-instance.zitadel.cloud) */
  instanceUrl: string;
  /** OIDC Client ID for audience validation */
  clientId?: string;
}

/**
 * Extended tenant context with ZITADEL-specific fields
 */
export interface ZitadelTenantContext extends TenantContext {
  orgId?: string;
  tier?: string;
  cellId?: string;
}

/**
 * ZITADEL JWT payload with custom claims
 */
interface ZitadelJwtPayload extends JWTPayload {
  'urn:zitadel:iam:org:id'?: string;
  'urn:eurocomply:schema_name'?: string;
  'urn:eurocomply:tier'?: string;
  'urn:eurocomply:cell_id'?: string;
}

// Cache JWKS per instance URL to avoid repeated fetches
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(instanceUrl: string) {
  const cached = jwksCache.get(instanceUrl);
  if (cached) return cached;

  const jwksUrl = new URL('/.well-known/jwks.json', instanceUrl);
  const jwks = createRemoteJWKSet(jwksUrl);
  jwksCache.set(instanceUrl, jwks);
  return jwks;
}

/**
 * Verifies a ZITADEL JWT token and extracts tenant context.
 *
 * This function:
 * 1. Fetches JWKS from ZITADEL (cached)
 * 2. Verifies the JWT signature
 * 3. Validates standard JWT claims (exp, iat, nbf)
 * 4. Extracts the tenant schema_name from custom claims
 *
 * @param token - The JWT token to verify
 * @param options - Verification options including ZITADEL instance URL
 * @returns ZitadelTenantContext if valid, null otherwise
 */
export async function verifyAndExtractTenant(
  token: string,
  options: JwtVerificationOptions
): Promise<ZitadelTenantContext | null> {
  try {
    const jwks = getJWKS(options.instanceUrl);

    const { payload } = await jwtVerify(token, jwks, {
      audience: options.clientId,
      issuer: options.instanceUrl,
    });

    const zitadelPayload = payload as ZitadelJwtPayload;

    // Extract user ID from 'sub' claim
    const userId = zitadelPayload.sub;
    if (!userId) {
      return null;
    }

    // Extract schema_name from custom claim
    const schemaName = zitadelPayload['urn:eurocomply:schema_name'];
    if (!schemaName || typeof schemaName !== 'string') {
      return null;
    }

    return {
      schemaName,
      userId,
      orgId: zitadelPayload['urn:zitadel:iam:org:id'],
      tier: zitadelPayload['urn:eurocomply:tier'],
      cellId: zitadelPayload['urn:eurocomply:cell_id'],
    };
  } catch {
    // Any unexpected errors during verification
    return null;
  }
}

/**
 * Extracts tenant context from a JWT token WITHOUT signature verification.
 *
 * WARNING: This is INSECURE and should only be used for:
 * - Unit tests with mock tokens
 * - Development environments without ZITADEL
 *
 * @deprecated Use verifyAndExtractTenant for production
 */
export function extractTenantFromJwtUnsafe(token: string): TenantContext | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // Base64 decode the payload (middle part)
    const payload = JSON.parse(atob(parts[1]!));

    // Support custom claim format
    const schemaName = payload['urn:eurocomply:schema_name'] ?? payload.schema_name;
    const userId = payload.sub;

    if (!schemaName || typeof schemaName !== 'string') {
      return null;
    }

    return { schemaName, userId: userId ?? 'anonymous' };
  } catch {
    return null;
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm test src/utils/jwt.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/utils/jwt.ts apps/api/src/utils/jwt.test.ts
git commit -m "feat(api): rewrite JWT verification for ZITADEL OIDC"
```

---

### Task 4: Update Tenant Middleware

**Files:**
- Modify: `apps/api/src/middleware/tenant.ts`
- Modify: `apps/api/src/middleware/tenant.test.ts`

**Step 1: Write the failing test**

Update `apps/api/src/middleware/tenant.test.ts` to test ZITADEL env vars:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { createTenantMiddleware } from './tenant.js';

// Mock the jwt module
vi.mock('../utils/jwt.js', () => ({
  verifyAndExtractTenant: vi.fn(),
  extractTenantFromJwtUnsafe: vi.fn(),
}));

import { verifyAndExtractTenant, extractTenantFromJwtUnsafe } from '../utils/jwt.js';

describe('createTenantMiddleware', () => {
  let app: Hono;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns 401 for missing Authorization header', async () => {
    app = new Hono();
    app.use('*', createTenantMiddleware());
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 for invalid Authorization header format', async () => {
    app = new Hono();
    app.use('*', createTenantMiddleware());
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', {
      headers: { Authorization: 'Basic abc123' },
    });

    expect(res.status).toBe(401);
  });

  it('verifies token with ZITADEL when ZITADEL_INSTANCE_URL is set', async () => {
    process.env['ZITADEL_INSTANCE_URL'] = 'https://test.zitadel.cloud';
    process.env['ZITADEL_CLIENT_ID'] = 'test-client-id';

    vi.mocked(verifyAndExtractTenant).mockResolvedValue({
      schemaName: 'tenant_abc123',
      userId: 'user_123',
    });

    app = new Hono();
    app.use('*', createTenantMiddleware());
    app.get('/test', (c) => c.json({
      schema: c.get('tenantSchema'),
      user: c.get('userId'),
    }));

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer valid.jwt.token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schema).toBe('tenant_abc123');
    expect(body.user).toBe('user_123');

    expect(verifyAndExtractTenant).toHaveBeenCalledWith('valid.jwt.token', {
      instanceUrl: 'https://test.zitadel.cloud',
      clientId: 'test-client-id',
    });
  });

  it('falls back to unsafe extraction in development without ZITADEL config', async () => {
    delete process.env['ZITADEL_INSTANCE_URL'];
    process.env['NODE_ENV'] = 'development';

    vi.mocked(extractTenantFromJwtUnsafe).mockReturnValue({
      schemaName: 'tenant_dev',
      userId: 'dev_user',
    });

    app = new Hono();
    app.use('*', createTenantMiddleware());
    app.get('/test', (c) => c.json({
      schema: c.get('tenantSchema'),
    }));

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer dev.token' },
    });

    expect(res.status).toBe(200);
    expect(extractTenantFromJwtUnsafe).toHaveBeenCalledWith('dev.token');
  });

  it('returns 401 when token verification fails', async () => {
    process.env['ZITADEL_INSTANCE_URL'] = 'https://test.zitadel.cloud';

    vi.mocked(verifyAndExtractTenant).mockResolvedValue(null);

    app = new Hono();
    app.use('*', createTenantMiddleware());
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer invalid.token' },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toBe('Invalid token or missing tenant context');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm test src/middleware/tenant.test.ts
```

Expected: FAIL

**Step 3: Write the implementation**

Replace `apps/api/src/middleware/tenant.ts` with:

```typescript
import { createMiddleware } from 'hono/factory';
import type { Env } from '../app.js';
import {
  verifyAndExtractTenant,
  extractTenantFromJwtUnsafe,
  type JwtVerificationOptions,
} from '../utils/jwt.js';

export interface TenantContext {
  schemaName: string;
  userId: string;
}

/**
 * Extracts tenant context from a JWT token.
 *
 * @deprecated Use verifyAndExtractTenant for production with signature verification.
 * This function is kept for backwards compatibility with existing tests.
 */
export function extractTenantFromJwt(token: string): TenantContext | null {
  return extractTenantFromJwtUnsafe(token);
}

/**
 * Creates tenant middleware with JWT verification options.
 *
 * In production (when ZITADEL_INSTANCE_URL is set), this verifies the JWT signature
 * against ZITADEL's JWKS before extracting tenant context.
 *
 * In development/testing (when ZITADEL_INSTANCE_URL is not set), it falls back to
 * unsafe base64 decoding for convenience.
 */
export function createTenantMiddleware(options?: Partial<JwtVerificationOptions>) {
  const instanceUrl = options?.instanceUrl ?? process.env['ZITADEL_INSTANCE_URL'];
  const clientId = options?.clientId ?? process.env['ZITADEL_CLIENT_ID'];

  return createMiddleware<Env>(async (c, next) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' }, 401);
    }

    const token = authHeader.slice(7);
    let tenant: TenantContext | null = null;

    if (instanceUrl) {
      // Production: Verify JWT signature with ZITADEL
      tenant = await verifyAndExtractTenant(token, {
        instanceUrl,
        clientId,
      });
    } else {
      // Development/Testing: Skip signature verification (INSECURE)
      if (process.env['NODE_ENV'] !== 'test') {
        console.warn(
          '[SECURITY WARNING] ZITADEL_INSTANCE_URL not set. JWT signature verification is disabled. ' +
            'This is acceptable for development but MUST be configured in production.'
        );
      }
      tenant = extractTenantFromJwtUnsafe(token);
    }

    if (!tenant) {
      return c.json({ error: 'Unauthorized', message: 'Invalid token or missing tenant context' }, 401);
    }

    c.set('tenantSchema', tenant.schemaName);
    c.set('userId', tenant.userId);

    await next();
  });
}

/**
 * Default tenant middleware that extracts tenant context from the Authorization header.
 * Sets tenantSchema and userId in the Hono context.
 *
 * Uses ZITADEL_INSTANCE_URL from environment for JWT verification when available.
 */
export const tenantMiddleware = createTenantMiddleware();
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm test src/middleware/tenant.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/middleware/tenant.ts apps/api/src/middleware/tenant.test.ts
git commit -m "feat(api): update tenant middleware for ZITADEL JWT verification"
```

---

### Task 5: Rewrite Webhook Signature Verification

**Files:**
- Modify: `apps/api/src/middleware/webhook.ts`
- Modify: `apps/api/src/middleware/webhook.test.ts`

**Step 1: Write the failing test**

Replace `apps/api/src/middleware/webhook.test.ts` with:

```typescript
import { describe, it, expect } from 'vitest';
import { verifyZitadelWebhook } from './webhook.js';
import { createHmac } from 'crypto';

describe('verifyZitadelWebhook', () => {
  const signingKey = 'test-signing-key-12345';

  function createValidSignature(payload: string, timestamp: number): string {
    const signedPayload = `${timestamp}.${payload}`;
    const hmac = createHmac('sha256', signingKey);
    hmac.update(signedPayload);
    const signature = hmac.digest('hex');
    return `t=${timestamp},v1=${signature}`;
  }

  it('returns valid for correct signature', () => {
    const payload = '{"type":"org.created","data":{"id":"org_123"}}';
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createValidSignature(payload, timestamp);

    const result = verifyZitadelWebhook({
      payload,
      signature,
      signingKey,
    });

    expect(result.valid).toBe(true);
    expect(result.payload).toEqual(JSON.parse(payload));
  });

  it('returns invalid for wrong signature', () => {
    const payload = '{"type":"org.created"}';
    const timestamp = Math.floor(Date.now() / 1000);
    const wrongSignature = `t=${timestamp},v1=wrongsignature`;

    const result = verifyZitadelWebhook({
      payload,
      signature: wrongSignature,
      signingKey,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('signature');
  });

  it('returns invalid for missing signature header', () => {
    const result = verifyZitadelWebhook({
      payload: '{}',
      signature: undefined,
      signingKey,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Missing');
  });

  it('returns invalid for malformed signature header', () => {
    const result = verifyZitadelWebhook({
      payload: '{}',
      signature: 'malformed-header',
      signingKey,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Malformed');
  });

  it('returns invalid for expired timestamp (>5 min old)', () => {
    const payload = '{"type":"org.created"}';
    const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 6+ minutes ago
    const signature = createValidSignature(payload, oldTimestamp);

    const result = verifyZitadelWebhook({
      payload,
      signature,
      signingKey,
      timestampToleranceSeconds: 300, // 5 minutes
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('expired');
  });

  it('accepts timestamp within tolerance', () => {
    const payload = '{"type":"org.created"}';
    const recentTimestamp = Math.floor(Date.now() / 1000) - 60; // 1 minute ago
    const signature = createValidSignature(payload, recentTimestamp);

    const result = verifyZitadelWebhook({
      payload,
      signature,
      signingKey,
      timestampToleranceSeconds: 300,
    });

    expect(result.valid).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm test src/middleware/webhook.test.ts
```

Expected: FAIL

**Step 3: Write the implementation**

Replace `apps/api/src/middleware/webhook.ts` with:

```typescript
import { createMiddleware } from 'hono/factory';
import { createHmac, timingSafeEqual } from 'crypto';

export interface WebhookVerificationResult {
  valid: boolean;
  error?: string;
  payload?: unknown;
}

export interface VerifyZitadelOptions {
  payload: string;
  signature: string | undefined;
  signingKey: string;
  timestampToleranceSeconds?: number;
}

/**
 * Verifies a ZITADEL webhook signature using HMAC-SHA256.
 *
 * ZITADEL sends a 'zitadel-signature' header in the format:
 * t=<timestamp>,v1=<hmac_signature>
 *
 * The signed payload is: `${timestamp}.${rawBody}`
 */
export function verifyZitadelWebhook(options: VerifyZitadelOptions): WebhookVerificationResult {
  const { payload, signature, signingKey, timestampToleranceSeconds = 300 } = options;

  if (!signature) {
    return {
      valid: false,
      error: 'Missing zitadel-signature header',
    };
  }

  // Parse signature header: t=<timestamp>,v1=<signature>
  const parts = signature.split(',');
  const timestampPart = parts.find(p => p.startsWith('t='));
  const signaturePart = parts.find(p => p.startsWith('v1='));

  if (!timestampPart || !signaturePart) {
    return {
      valid: false,
      error: 'Malformed zitadel-signature header',
    };
  }

  const timestamp = parseInt(timestampPart.slice(2), 10);
  const receivedSignature = signaturePart.slice(3);

  if (isNaN(timestamp)) {
    return {
      valid: false,
      error: 'Malformed timestamp in signature header',
    };
  }

  // Check timestamp tolerance
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > timestampToleranceSeconds) {
    return {
      valid: false,
      error: `Webhook timestamp expired (received: ${timestamp}, now: ${now})`,
    };
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const hmac = createHmac('sha256', signingKey);
  hmac.update(signedPayload);
  const expectedSignature = hmac.digest('hex');

  // Timing-safe comparison
  try {
    const receivedBuffer = Buffer.from(receivedSignature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (receivedBuffer.length !== expectedBuffer.length) {
      return {
        valid: false,
        error: 'Invalid signature length',
      };
    }

    if (!timingSafeEqual(receivedBuffer, expectedBuffer)) {
      return {
        valid: false,
        error: 'Invalid webhook signature',
      };
    }
  } catch {
    return {
      valid: false,
      error: 'Invalid signature format',
    };
  }

  // Parse and return payload
  try {
    return {
      valid: true,
      payload: JSON.parse(payload),
    };
  } catch {
    return {
      valid: false,
      error: 'Invalid JSON payload',
    };
  }
}

/**
 * Middleware that verifies ZITADEL webhook signatures.
 */
export function zitadelWebhookMiddleware(signingKey: string) {
  return createMiddleware(async (c, next) => {
    const payload = await c.req.text();
    const signature = c.req.header('zitadel-signature');

    const result = verifyZitadelWebhook({
      payload,
      signature,
      signingKey,
    });

    if (!result.valid) {
      return c.json({ error: 'Invalid webhook signature', details: result.error }, 401);
    }

    // Store verified payload for handler
    c.set('webhookPayload', result.payload);
    await next();
  });
}

// Keep old exports for backwards compatibility during migration
export { verifyZitadelWebhook as verifyClerkWebhook };
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm test src/middleware/webhook.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/middleware/webhook.ts apps/api/src/middleware/webhook.test.ts
git commit -m "feat(api): rewrite webhook verification for ZITADEL HMAC signatures"
```

---

### Task 6: Rewrite Webhook Handler

**Files:**
- Delete: `apps/api/src/webhooks/clerk.ts`
- Create: `apps/api/src/webhooks/zitadel.ts`
- Modify: `apps/api/src/webhooks/clerk.test.ts` → `zitadel.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/webhooks/zitadel.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleOrganizationCreated,
  handleOrganizationDeleted,
  zitadelOrgIdToSchemaName,
  type ZitadelOrganizationEvent,
  type HandlerDependencies,
} from './zitadel.js';
import { ProvisioningStatus } from '@eurocomply/database';

describe('zitadelOrgIdToSchemaName', () => {
  it('converts ZITADEL org ID to schema name', () => {
    expect(zitadelOrgIdToSchemaName('123456789012345678')).toBe('tenant_org_12345678');
  });

  it('handles short org IDs', () => {
    expect(zitadelOrgIdToSchemaName('abc123')).toBe('tenant_org_abc123');
  });

  it('lowercases the result', () => {
    expect(zitadelOrgIdToSchemaName('ABCD1234EFGH5678')).toBe('tenant_org_efgh5678');
  });
});

describe('handleOrganizationCreated', () => {
  let mockDeps: HandlerDependencies;
  let mockEm: any;

  beforeEach(() => {
    mockEm = {
      create: vi.fn((Entity, data) => ({ ...data })),
      persist: vi.fn(),
      flush: vi.fn(),
      findOne: vi.fn(),
      removeAndFlush: vi.fn(),
    };

    mockDeps = {
      orm: {
        em: {
          fork: () => mockEm,
        },
      },
      provisioner: {
        provisionTenant: vi.fn().mockResolvedValue({ success: true, schemaName: 'tenant_org_12345678' }),
        dropSchema: vi.fn(),
      },
    };
  });

  it('creates organization and provisions schema for new org', async () => {
    mockEm.findOne.mockResolvedValue(null);

    const event: ZitadelOrganizationEvent = {
      type: 'org.created',
      data: {
        orgId: '123456789012345678',
        name: 'Test Org',
      },
    };

    const result = await handleOrganizationCreated(event, mockDeps);

    expect(result.success).toBe(true);
    expect(result.schemaName).toBe('tenant_org_12345678');
    expect(mockDeps.provisioner.provisionTenant).toHaveBeenCalledWith('tenant_org_12345678');
  });

  it('returns idempotent success for already provisioned org', async () => {
    mockEm.findOne.mockResolvedValue({
      id: 'existing-id',
      schemaName: 'tenant_org_12345678',
      provisioningStatus: ProvisioningStatus.READY,
    });

    const event: ZitadelOrganizationEvent = {
      type: 'org.created',
      data: {
        orgId: '123456789012345678',
        name: 'Test Org',
      },
    };

    const result = await handleOrganizationCreated(event, mockDeps);

    expect(result.success).toBe(true);
    expect(result.idempotent).toBe(true);
    expect(mockDeps.provisioner.provisionTenant).not.toHaveBeenCalled();
  });

  it('marks org as FAILED when provisioning fails', async () => {
    mockEm.findOne.mockResolvedValue(null);
    mockDeps.provisioner.provisionTenant = vi.fn().mockResolvedValue({
      success: false,
      error: 'Database error',
    });

    const event: ZitadelOrganizationEvent = {
      type: 'org.created',
      data: {
        orgId: '123456789012345678',
        name: 'Test Org',
      },
    };

    const result = await handleOrganizationCreated(event, mockDeps);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Database error');
    expect(result.retryable).toBe(true);
  });
});

describe('handleOrganizationDeleted', () => {
  let mockDeps: HandlerDependencies;
  let mockEm: any;

  beforeEach(() => {
    mockEm = {
      create: vi.fn((Entity, data) => ({ ...data })),
      persist: vi.fn(),
      flush: vi.fn(),
      findOne: vi.fn(),
      removeAndFlush: vi.fn(),
    };

    mockDeps = {
      orm: {
        em: {
          fork: () => mockEm,
        },
      },
      provisioner: {
        provisionTenant: vi.fn(),
        dropSchema: vi.fn(),
      },
    };
  });

  it('deletes organization and drops schema', async () => {
    mockEm.findOne.mockResolvedValue({
      id: 'org-id',
      name: 'Test Org',
      schemaName: 'tenant_org_12345678',
      provisioningStatus: ProvisioningStatus.READY,
    });

    const event: ZitadelOrganizationEvent = {
      type: 'org.removed',
      data: {
        orgId: '123456789012345678',
      },
    };

    const result = await handleOrganizationDeleted(event, mockDeps);

    expect(result.success).toBe(true);
    expect(mockDeps.provisioner.dropSchema).toHaveBeenCalledWith('tenant_org_12345678');
    expect(mockEm.removeAndFlush).toHaveBeenCalled();
  });

  it('returns idempotent success when org not found', async () => {
    mockEm.findOne.mockResolvedValue(null);

    const event: ZitadelOrganizationEvent = {
      type: 'org.removed',
      data: {
        orgId: '123456789012345678',
      },
    };

    const result = await handleOrganizationDeleted(event, mockDeps);

    expect(result.success).toBe(true);
    expect(result.idempotent).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm test src/webhooks/zitadel.test.ts
```

Expected: FAIL (file doesn't exist)

**Step 3: Write the implementation**

Create `apps/api/src/webhooks/zitadel.ts`:

```typescript
import {
  Organization,
  ProvisioningStatus,
  OutboxEvent,
  OutboxStatus,
} from '@eurocomply/database';
import { createId } from '@eurocomply/core';

const PROVISIONING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface ZitadelOrganizationEvent {
  type: 'org.created' | 'org.updated' | 'org.removed';
  data: {
    orgId: string;
    name?: string;
  };
}

/**
 * Minimal interface for the ORM dependency.
 */
export interface OrmLike {
  em: {
    fork: () => EntityManagerLike;
  };
}

export interface EntityManagerLike {
  create<T>(entityClass: new () => T, data: Partial<T>): T;
  persist(entity: object): void;
  flush(): Promise<void>;
  findOne<T>(entityClass: new () => T, where: Record<string, unknown>): Promise<T | null>;
  removeAndFlush(entity: object): Promise<void>;
}

/**
 * Interface for the TenantProvisioner dependency.
 */
export interface TenantProvisionerLike {
  provisionTenant(schemaName: string): Promise<{ success: boolean; schemaName: string; error?: string; alreadyProvisioned?: boolean }>;
  dropSchema(schemaName: string): Promise<void>;
}

export interface HandlerDependencies {
  orm: OrmLike;
  provisioner: TenantProvisionerLike;
}

export interface HandlerResult {
  success: boolean;
  organizationId?: string;
  schemaName?: string;
  error?: string;
  retryable?: boolean;
  idempotent?: boolean;
}

/**
 * Converts a ZITADEL organization ID to a valid PostgreSQL schema name.
 * Uses the last 8 characters of the org ID for uniqueness while keeping names short.
 */
export function zitadelOrgIdToSchemaName(zitadelOrgId: string): string {
  const suffix = zitadelOrgId.length > 8 ? zitadelOrgId.slice(-8) : zitadelOrgId;
  return `tenant_org_${suffix.toLowerCase()}`;
}

/**
 * Checks if provisioning has timed out.
 */
function isProvisioningTimedOut(org: Organization): boolean {
  if (!org.provisioningStartedAt) return false;
  return Date.now() - org.provisioningStartedAt.getTime() > PROVISIONING_TIMEOUT_MS;
}

/**
 * Handles the org.created webhook event.
 */
export async function handleOrganizationCreated(
  event: ZitadelOrganizationEvent,
  deps: HandlerDependencies
): Promise<HandlerResult> {
  const { orm, provisioner } = deps;
  const { orgId: zitadelOrgId, name = 'Unnamed Organization' } = event.data;
  const schemaName = zitadelOrgIdToSchemaName(zitadelOrgId);
  // Generate slug from name (lowercase, hyphens)
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `org-${zitadelOrgId.slice(-8)}`;

  const em = orm.em.fork();

  try {
    // Check for existing organization (race condition guard)
    let org = await em.findOne(Organization, { zitadelOrgId });

    if (org) {
      // Handle based on current status
      switch (org.provisioningStatus) {
        case ProvisioningStatus.READY:
          return {
            success: true,
            organizationId: org.id,
            schemaName: org.schemaName,
            idempotent: true,
          };

        case ProvisioningStatus.PROVISIONING:
          if (isProvisioningTimedOut(org)) {
            org.provisioningStatus = ProvisioningStatus.FAILED;
            org.provisioningError = 'Provisioning timed out';
            await em.flush();
          } else {
            return {
              success: false,
              organizationId: org.id,
              schemaName: org.schemaName,
              error: 'Organization provisioning already in progress',
              retryable: true,
            };
          }
          break;

        case ProvisioningStatus.PENDING:
        case ProvisioningStatus.FAILED:
          break;

        default:
          return {
            success: false,
            organizationId: org.id,
            schemaName: org.schemaName,
            error: `Organization is in ${org.provisioningStatus} state`,
          };
      }

      org.provisioningStatus = ProvisioningStatus.PROVISIONING;
      org.provisioningStartedAt = new Date();
      org.provisioningError = undefined;
      await em.flush();
    } else {
      org = em.create(Organization, {
        id: createId(),
        name,
        slug,
        schemaName,
        zitadelOrgId,
        provisioningStatus: ProvisioningStatus.PROVISIONING,
        provisioningStartedAt: new Date(),
      });
      em.persist(org);
      await em.flush();
    }

    // Provision tenant schema
    const provisionResult = await provisioner.provisionTenant(schemaName);

    if (!provisionResult.success) {
      org.provisioningStatus = ProvisioningStatus.FAILED;
      org.provisioningError = provisionResult.error;
      await em.flush();

      return {
        success: false,
        organizationId: org.id,
        schemaName,
        error: `Provisioning failed: ${provisionResult.error}`,
        retryable: true,
      };
    }

    // Update organization status to ready
    org.provisioningStatus = ProvisioningStatus.READY;

    // Create outbox event
    const outboxEvent = em.create(OutboxEvent, {
      id: createId(),
      aggregateType: 'Organization',
      aggregateId: org.id,
      eventType: 'organization.provisioned',
      payload: {
        organizationId: org.id,
        zitadelOrgId,
        schemaName,
        name,
        slug,
      },
      status: OutboxStatus.PENDING,
    });
    em.persist(outboxEvent);
    await em.flush();

    return {
      success: true,
      organizationId: org.id,
      schemaName,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      schemaName,
      error: errorMessage,
      retryable: true,
    };
  }
}

/**
 * Handles the org.removed webhook event.
 */
export async function handleOrganizationDeleted(
  event: ZitadelOrganizationEvent,
  deps: Pick<HandlerDependencies, 'orm' | 'provisioner'>
): Promise<HandlerResult> {
  const { orm, provisioner } = deps;
  const { orgId: zitadelOrgId } = event.data;

  const em = orm.em.fork();

  const org = await em.findOne(Organization, { zitadelOrgId });

  if (!org) {
    return {
      success: true,
      error: 'Already deleted',
      idempotent: true,
    };
  }

  if (org.provisioningStatus === ProvisioningStatus.DELETING) {
    return {
      success: false,
      organizationId: org.id,
      schemaName: org.schemaName,
      error: 'Organization deletion already in progress',
      retryable: true,
    };
  }

  const { id: organizationId, schemaName, name, slug } = org;

  try {
    // Create outbox event BEFORE deletion (for audit trail)
    const outboxEvent = em.create(OutboxEvent, {
      id: createId(),
      aggregateType: 'Organization',
      aggregateId: organizationId,
      eventType: 'organization.deleted',
      payload: {
        organizationId,
        zitadelOrgId,
        schemaName,
        name,
        slug,
      },
      status: OutboxStatus.PENDING,
    });
    em.persist(outboxEvent);

    // Phase 1: Mark as DELETING
    org.provisioningStatus = ProvisioningStatus.DELETING;
    await em.flush();

    // Drop tenant schema
    try {
      await provisioner.dropSchema(schemaName);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      org.provisioningStatus = ProvisioningStatus.DELETE_FAILED;
      org.provisioningError = errorMessage;
      await em.flush();

      return {
        success: false,
        organizationId,
        schemaName,
        error: `Schema drop failed: ${errorMessage}`,
        retryable: true,
      };
    }

    // Phase 2: Delete organization record
    await em.removeAndFlush(org);

    return {
      success: true,
      organizationId,
      schemaName,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      organizationId,
      schemaName,
      error: errorMessage,
      retryable: true,
    };
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm test src/webhooks/zitadel.test.ts
```

Expected: PASS

**Step 5: Delete old Clerk webhook handler**

```bash
rm apps/api/src/webhooks/clerk.ts
rm apps/api/src/webhooks/clerk.test.ts
```

**Step 6: Commit**

```bash
git add apps/api/src/webhooks/zitadel.ts apps/api/src/webhooks/zitadel.test.ts
git rm apps/api/src/webhooks/clerk.ts apps/api/src/webhooks/clerk.test.ts
git commit -m "feat(api): replace Clerk webhook handler with ZITADEL

- New zitadel.ts handler for org.created and org.removed events
- Uses zitadelOrgId instead of clerkOrgId
- Same idempotency and error handling patterns"
```

---

### Task 7: Update Webhook Router

**Files:**
- Modify: `apps/api/src/routes/webhooks.ts`
- Modify: `apps/api/src/routes/webhooks.test.ts`

**Step 1: Update the router**

Replace `apps/api/src/routes/webhooks.ts` with:

```typescript
import { Hono } from 'hono';
import { WebhookEvent, WebhookStatus } from '@eurocomply/database';
import { createId } from '@eurocomply/core';
import { verifyZitadelWebhook } from '../middleware/webhook.js';
import {
  handleOrganizationCreated,
  handleOrganizationDeleted,
  type ZitadelOrganizationEvent,
  type OrmLike,
  type TenantProvisionerLike,
} from '../webhooks/zitadel.js';

export interface WebhooksRouterOptions {
  orm: OrmLike;
  provisioner: TenantProvisionerLike;
  webhookSigningKey?: string;
  skipSignatureVerification?: boolean; // For testing only
}

export function createWebhooksRouter(options: WebhooksRouterOptions) {
  const { orm, provisioner, webhookSigningKey, skipSignatureVerification } = options;
  const router = new Hono();

  router.post('/zitadel', async (c) => {
    // Check webhook signing key is configured
    if (!webhookSigningKey && !skipSignatureVerification) {
      return c.json({ error: 'Webhook signing key not configured' }, 500);
    }

    // Get request ID for idempotency (ZITADEL doesn't have svix-id, use custom header or generate)
    const requestId = c.req.header('x-request-id') ?? createId();

    const em = orm.em.fork();

    // Check for existing webhook (idempotency)
    const existingWebhook = await em.findOne(WebhookEvent, { svixId: requestId });
    if (existingWebhook) {
      if (existingWebhook.status === WebhookStatus.COMPLETED) {
        return c.json({ success: true, idempotent: true, message: 'Webhook already processed' });
      }
      if (existingWebhook.status === WebhookStatus.PROCESSING) {
        return c.json({ error: 'Webhook already processing' }, 409);
      }
      // FAILED status - allow retry by continuing
    }

    // Get the raw body for signature verification
    let event: ZitadelOrganizationEvent;

    if (skipSignatureVerification) {
      // For testing: parse body directly
      event = await c.req.json();
    } else {
      // Production: verify signature
      const payload = await c.req.text();
      const signature = c.req.header('zitadel-signature');

      const result = verifyZitadelWebhook({
        payload,
        signature,
        signingKey: webhookSigningKey!,
      });

      if (!result.valid) {
        return c.json({ error: 'Invalid webhook signature', details: result.error }, 401);
      }

      event = result.payload as ZitadelOrganizationEvent;
    }

    // Create or update webhook event record
    let webhookEvent: WebhookEvent;
    if (existingWebhook) {
      webhookEvent = existingWebhook;
      webhookEvent.status = WebhookStatus.PROCESSING;
      webhookEvent.errorMessage = undefined;
    } else {
      webhookEvent = em.create(WebhookEvent, {
        id: createId(),
        svixId: requestId, // Reusing field for request ID
        eventType: event.type,
        payload: event.data as Record<string, unknown>,
        status: WebhookStatus.PROCESSING,
      });
      em.persist(webhookEvent);
    }
    await em.flush();

    // Handle the event based on type
    switch (event.type) {
      case 'org.created': {
        const result = await handleOrganizationCreated(event, { orm, provisioner });
        if (!result.success) {
          webhookEvent.status = WebhookStatus.FAILED;
          webhookEvent.errorMessage = result.error;
          await em.flush();
          return c.json({ success: false, error: result.error }, 500);
        }
        webhookEvent.status = WebhookStatus.COMPLETED;
        webhookEvent.completedAt = new Date();
        await em.flush();
        return c.json({
          success: true,
          organizationId: result.organizationId,
          schemaName: result.schemaName,
        });
      }

      case 'org.removed': {
        const result = await handleOrganizationDeleted(event, { orm, provisioner });
        if (!result.success) {
          if (result.error === 'Already deleted') {
            webhookEvent.status = WebhookStatus.COMPLETED;
            webhookEvent.completedAt = new Date();
            await em.flush();
            return c.json({ success: true, message: 'Already deleted' });
          }
          webhookEvent.status = WebhookStatus.FAILED;
          webhookEvent.errorMessage = result.error;
          await em.flush();
          return c.json({ success: false, error: result.error }, 500);
        }
        webhookEvent.status = WebhookStatus.COMPLETED;
        webhookEvent.completedAt = new Date();
        await em.flush();
        return c.json({
          success: true,
          organizationId: result.organizationId,
          schemaName: result.schemaName,
          message: 'Organization and tenant schema deleted',
        });
      }

      case 'org.updated': {
        // For now, just acknowledge - can add handling later
        webhookEvent.status = WebhookStatus.COMPLETED;
        webhookEvent.completedAt = new Date();
        await em.flush();
        return c.json({ success: true, message: 'Event acknowledged' });
      }

      default: {
        webhookEvent.status = WebhookStatus.COMPLETED;
        webhookEvent.completedAt = new Date();
        await em.flush();
        return c.json({ success: true, message: 'Event type not handled' });
      }
    }
  });

  return router;
}
```

**Step 2: Run existing tests (they will need updating)**

```bash
cd apps/api && pnpm test src/routes/webhooks.test.ts
```

Note: The test file will need updating to use ZITADEL event types and signatures. Update the test file similarly to reflect `/zitadel` endpoint and ZITADEL event format.

**Step 3: Commit**

```bash
git add apps/api/src/routes/webhooks.ts
git commit -m "feat(api): update webhook router for ZITADEL

- Rename endpoint from /clerk to /zitadel
- Use ZITADEL event types (org.created, org.removed)
- HMAC signature verification via zitadel-signature header"
```

---

## Phase 2: Entity & Database Updates

### Task 8: Rename clerkOrgId to zitadelOrgId

**Files:**
- Modify: `packages/database/src/entities/Organization.ts`
- Create: `packages/database/src/migrations/Migration20260123_RenameClerkToZitadel.ts`

**Step 1: Update the entity**

In `packages/database/src/entities/Organization.ts`, change line 45-47:

```typescript
  @Property({ type: 'text', nullable: true, name: 'zitadel_org_id' })
  @Unique()
  zitadelOrgId?: string;
```

**Step 2: Create migration**

Create `packages/database/src/migrations/Migration20260123_RenameClerkToZitadel.ts`:

```typescript
import { Migration } from '@mikro-orm/migrations';

export class Migration20260123_RenameClerkToZitadel extends Migration {
  async up(): Promise<void> {
    // Rename column in public.organizations
    this.addSql('ALTER TABLE "public"."organizations" RENAME COLUMN "clerk_org_id" TO "zitadel_org_id";');
  }

  async down(): Promise<void> {
    this.addSql('ALTER TABLE "public"."organizations" RENAME COLUMN "zitadel_org_id" TO "clerk_org_id";');
  }
}
```

**Step 3: Run migration locally**

```bash
cd packages/database && pnpm mikro-orm migration:up
```

**Step 4: Commit**

```bash
git add packages/database/src/entities/Organization.ts packages/database/src/migrations/Migration20260123_RenameClerkToZitadel.ts
git commit -m "refactor(database): rename clerkOrgId to zitadelOrgId

- Update Organization entity
- Add migration to rename column"
```

---

### Task 9: Update Organizations Route

**Files:**
- Modify: `apps/api/src/routes/organizations.ts`

**Step 1: Find and replace references**

Search for `clerkOrgId` and `clerk` in `organizations.ts` and update to `zitadelOrgId` and `zitadel`.

**Step 2: Commit**

```bash
git add apps/api/src/routes/organizations.ts
git commit -m "refactor(api): update organizations route for ZITADEL"
```

---

### Task 10: Update All Test Files

**Files:**
- Modify: `apps/api/src/routes/webhooks.test.ts`
- Modify: `apps/api/src/routes/organizations.test.ts`
- Modify: `apps/api/src/webhooks/provisioning.e2e.test.ts`

**Step 1: Update test files to use ZITADEL types and endpoints**

Replace Clerk-specific mocks and event types with ZITADEL equivalents throughout test files.

**Step 2: Run all tests**

```bash
cd apps/api && pnpm test
```

**Step 3: Commit**

```bash
git add apps/api/src/routes/*.test.ts apps/api/src/webhooks/*.test.ts
git commit -m "test(api): update all tests for ZITADEL migration"
```

---

## Phase 3: Documentation & Cleanup

### Task 11: Update Architecture Documentation

**Files:**
- Modify: `docs/plans/01-architecture.md`

**Step 1: Replace all Clerk references with ZITADEL**

Key sections to update:
- Section 5: Authentication (lines ~377-440)
- Section 5.1: Organization Lifecycle (lines ~443-479)
- Clerk Organization Metadata → ZITADEL Actions custom claims
- JWT structure examples

**Step 2: Commit**

```bash
git add docs/plans/01-architecture.md
git commit -m "docs: update architecture for ZITADEL authentication"
```

---

### Task 12: Update Security Documentation

**Files:**
- Modify: `docs/plans/03-security.md`

**Step 1: Replace Clerk references with ZITADEL**

Key sections:
- Section 2: Authentication
- JWT validation code examples
- Organization creation flow

**Step 2: Commit**

```bash
git add docs/plans/03-security.md
git commit -m "docs: update security documentation for ZITADEL"
```

---

### Task 13: Update API Testing Documentation

**Files:**
- Modify: `docs/API_TESTING.md`
- Modify: `docs/TESTING.md`

**Step 1: Update API_TESTING.md**

- Change `/webhooks/clerk` to `/webhooks/zitadel`
- Update event payload examples
- Update env var names
- Replace `clerkOrgId` with `zitadelOrgId` in response examples

**Step 2: Update TESTING.md**

- Update ngrok setup instructions for ZITADEL
- Update environment variable names
- Update webhook configuration steps

**Step 3: Commit**

```bash
git add docs/API_TESTING.md docs/TESTING.md
git commit -m "docs: update testing documentation for ZITADEL"
```

---

### Task 14: Update Remaining Documentation

**Files:**
- Modify: `docs/plans/02-data-model.md`
- Modify: `docs/plans/10-integrations.md`
- Modify: `docs/plans/11-infrastructure.md`
- Modify: `docs/plans/00-business-model.md`
- Modify: `README.md`

**Step 1: Update minor references in each file**

Search for "clerk" (case-insensitive) and update to ZITADEL.

**Step 2: Commit**

```bash
git add docs/plans/*.md README.md
git commit -m "docs: update remaining documentation for ZITADEL migration"
```

---

### Task 15: Delete Old Implementation Plans

**Files:**
- Delete: `implementationplans/2026-01-21-phase1-foundation.md`
- Delete: `implementationplans/2026-01-22-phase2-tenant-provisioning.md`

**Step 1: Delete files**

```bash
rm implementationplans/2026-01-21-phase1-foundation.md
rm implementationplans/2026-01-22-phase2-tenant-provisioning.md
```

**Step 2: Commit**

```bash
git rm implementationplans/2026-01-21-phase1-foundation.md implementationplans/2026-01-22-phase2-tenant-provisioning.md
git commit -m "chore: remove obsolete Clerk implementation plans"
```

---

### Task 16: Update Scripts

**Files:**
- Delete or update: `apps/api/scripts/test-clerk-webhook.ts`
- Modify: `scripts/e2e-smoke-test.sh`
- Modify: `scripts/get-e2e-token.sh`

**Step 1: Delete Clerk webhook test script**

```bash
rm apps/api/scripts/test-clerk-webhook.ts
```

**Step 2: Update smoke test and token scripts for ZITADEL**

**Step 3: Commit**

```bash
git rm apps/api/scripts/test-clerk-webhook.ts
git add scripts/*.sh
git commit -m "chore: update scripts for ZITADEL migration"
```

---

### Task 17: Update CI/CD Configuration

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `infrastructure/terraform/environments/staging/variables.tf`
- Modify: `infrastructure/terraform/environments/production/variables.tf`

**Step 1: Update CI workflow**

Replace `CLERK_*` env vars with `ZITADEL_*` in `.github/workflows/ci.yml`.

**Step 2: Update Terraform variables**

Update secret names in Terraform configs.

**Step 3: Commit**

```bash
git add .github/workflows/*.yml infrastructure/terraform/environments/*/variables.tf
git commit -m "chore: update CI/CD configuration for ZITADEL"
```

---

### Task 18: Final Verification

**Step 1: Search for remaining Clerk references**

```bash
grep -ri "clerk" --include="*.ts" --include="*.md" --include="*.json" --include="*.yml" --include="*.sh" . | grep -v node_modules | grep -v pnpm-lock
```

Expected: No matches (or only historical references in git history)

**Step 2: Run full test suite**

```bash
pnpm test
```

Expected: All tests pass

**Step 3: Final commit**

```bash
git commit --allow-empty -m "chore: complete Clerk to ZITADEL migration

All Clerk references removed. ZITADEL Cloud (EU) now handles:
- JWT authentication via OIDC
- Organization webhooks via Actions v2
- Custom claims for tenant context"
```

---

## Summary

| Phase | Tasks | Estimated Commits |
|-------|-------|-------------------|
| Phase 1: Core Integration | Tasks 1-7 | 7 commits |
| Phase 2: Entity & Database | Tasks 8-10 | 3 commits |
| Phase 3: Documentation | Tasks 11-18 | 8 commits |
| **Total** | **18 tasks** | **~18 commits** |

---

## Post-Migration Checklist

- [ ] ZITADEL Cloud account fully configured
- [ ] Actions v2 target pointing to production URL
- [ ] Custom claims Action deployed
- [ ] All tests passing locally
- [ ] E2E test with real ZITADEL webhook delivery
- [ ] CI/CD secrets updated
- [ ] Production deployment successful
- [ ] Delete Clerk account
