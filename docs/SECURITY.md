# Security Architecture

> EuroComply Security Model: Defense in depth for product passport data.

---

## 1. Security Principles

| Principle | Implementation |
|-----------|---------------|
| **Defense in Depth** | Multiple security layers (network, application, data) |
| **Least Privilege** | Users and services get minimum necessary permissions |
| **Zero Trust** | Verify every request, assume breach |
| **Data Minimization** | Collect only what's needed, delete when no longer required |
| **Secure by Default** | Safe defaults, security opt-out requires explicit action |

---

## 2. Authentication

### 2.1 User Authentication (Magic Links + Password)

EuroComply supports two authentication methods for users:

| Method | Recommended | Use Case |
|--------|-------------|----------|
| **Magic Links** | Yes | Primary authentication - no password to steal |
| **Password** | Alternative | For users who prefer traditional login |
| **SSO (SAML/OIDC)** | Enterprise | Delegated to identity provider |

Both methods produce identical JWT tokens. See [AUTHENTICATION.md](./AUTHENTICATION.md) for complete details.

#### Magic Link Authentication (Primary)

Magic links are the recommended authentication method:

```
┌─────────────────────────────────────────────────────────────────┐
│                    MAGIC LINK AUTHENTICATION                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User enters email                                           │
│  2. Server generates:                                           │
│     • Random token (32 bytes, crypto-secure)                   │
│     • Token hash (SHA-256, stored in DB)                       │
│     • Expiry (15 minutes)                                      │
│  3. Email sent with: https://app.eurocomply.eu/auth/verify     │
│     (landing page, token passed to client)                     │
│  4. User clicks link, landing page loads                       │
│  5. Client-side JavaScript:                                    │
│     • Extracts token from URL                                  │
│     • Immediately clears URL via history.replaceState()        │
│     • Submits token via POST /auth/verify (body, not URL)      │
│  6. Server:                                                    │
│     • Rejects GET requests (405 Method Not Allowed)            │
│     • Hashes received token from POST body                     │
│     • Compares to stored hash                                  │
│     • Checks expiry                                            │
│     • Issues session (JWT in HttpOnly cookie)                  │
│  7. Stored token hash deleted (single-use)                     │
│                                                                  │
│  SECURITY PROPERTIES                                            │
│  ─────────────────────                                          │
│  • Token never stored in DB (only hash)                        │
│  • Single-use (deleted after verification)                     │
│  • Short expiry (15 minutes)                                   │
│  • Rate-limited (5 requests per email per hour)                │
│  • POST-only verification (token not in URL/logs/referrer)     │
│  • Referrer-Policy: no-referrer (prevents token leakage)       │
│  • URL cleared immediately via history.replaceState()          │
│                                                                  │
│  SECURITY HEADERS (all magic link responses)                   │
│  ───────────────────────────────────────────                   │
│  • Referrer-Policy: no-referrer                                │
│  • Cache-Control: no-store, no-cache, must-revalidate          │
│  • X-Content-Type-Options: nosniff                             │
│  • X-Frame-Options: DENY                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Magic Link Security Implementation

```typescript
// POST-based verification endpoint (packages/auth)
// GET requests are rejected with 405 Method Not Allowed

import { verifyMagicLink, createMagicLinkResponse } from '@eurocomply/auth';

app.post('/auth/verify', async (req, res) => {
  const result = await verifyMagicLink(
    { method: req.method, body: req.body, query: req.query },
    tokenStore
  );
  const response = createMagicLinkResponse(result);

  // Security headers automatically applied
  res.set(response.headers);
  res.status(response.statusCode).json(response.body);
});

// Client-side: Clear token from URL immediately
// (included in response as clientScript)
if (window.history && window.history.replaceState) {
  const url = new URL(window.location.href);
  url.searchParams.delete('token');
  window.history.replaceState({}, document.title, url.pathname);
}
```

#### Password Authentication (Alternative)

For users who prefer traditional login, password authentication is available:

```
┌─────────────────────────────────────────────────────────────────┐
│                    PASSWORD SECURITY                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  REQUIREMENTS                                                   │
│  ────────────                                                   │
│  • Minimum 12 characters                                        │
│  • At least: 1 uppercase, 1 lowercase, 1 number, 1 special     │
│  • Not in breached password lists (Have I Been Pwned API)      │
│                                                                  │
│  STORAGE                                                        │
│  ───────                                                        │
│  • Bcrypt with minimum 12 rounds (adaptive)                    │
│  • Never stored in plaintext                                   │
│  • Never logged                                                 │
│                                                                  │
│  BRUTE FORCE PROTECTION                                         │
│  ──────────────────────                                         │
│  • Rate limit: 5 attempts per 15 minutes per email             │
│  • Account lockout after 10 failed attempts (30 min)           │
│  • IP-based rate limiting: 20 attempts per 15 minutes          │
│  • Exponential backoff on failures                             │
│                                                                  │
│  PASSWORD RESET                                                 │
│  ──────────────                                                 │
│  • Uses magic link mechanism (same security properties)        │
│  • 1-hour expiry                                               │
│  • Invalidates all existing sessions on reset                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 API Key Authentication

For programmatic access (Shopify integration, custom integrations):

```
┌─────────────────────────────────────────────────────────────────┐
│                    API KEY SECURITY                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  KEY FORMAT                                                     │
│  ──────────                                                     │
│  ec_live_a1b2c3d4e5f6g7h8i9j0k1l2  (40 chars total)            │
│   └─┴────┴─────────────────────────                            │
│    │   │        └── 16 random bytes (32 hex chars)             │
│    │   └─────────── Environment (live/test)                    │
│    └─────────────── Prefix "ec_" (3 chars)                     │
│                                                                  │
│  Breakdown: 3 (ec_) + 5 (live_) + 32 (random) = 40 chars       │
│                                                                  │
│  Note: API keys use 16 bytes (128-bit entropy) for practical   │
│  key length. Magic link tokens use 32 bytes (256-bit) for      │
│  higher security as they're transmitted via email.             │
│                                                                  │
│  STORAGE                                                        │
│  ───────                                                        │
│  • Full key shown ONCE at creation                             │
│  • Database stores: SHA-256(key)                               │
│  • Lookup: hash incoming key, compare                          │
│                                                                  │
│  SCOPES                                                         │
│  ──────                                                         │
│  API keys have explicit scopes (resource-based, not workspace): │
│  • products:read                                               │
│  • products:write                                              │
│  • passports:read                                              │
│  • passports:write                                             │
│  • attestations:read                                           │
│  • attestations:write                                          │
│                                                                  │
│  Note: Scopes are INTENTIONALLY cross-workspace (see below)    │
│                                                                  │
│  ROTATION                                                       │
│  ────────                                                       │
│  • Keys can be rotated without downtime (multiple active keys) │
│  • Revoked keys: immediate effect (hash removed from DB)       │
│  • Audit log: all key creation/revocation logged               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### API Key Scopes: Why Resource-Based (Not Workspace-Based)

API scopes are **intentionally resource-based** (`products:read`, `passports:write`) rather than workspace-based (`design:read`, `operations:write`). This is a deliberate design decision:

**Rationale:**

| Concern | Resource-Based Scopes | Workspace-Based Scopes |
|---------|----------------------|------------------------|
| **API simplicity** | `GET /products` → needs `products:read` | Would need to check multiple workspace permissions |
| **Integration use case** | Shopify needs products + passports, not "workspaces" | Integrations don't understand internal workspace model |
| **Cross-workspace data** | Products exist in Hub, accessed by all workspaces | Restricting to one workspace doesn't match data model |
| **Future flexibility** | Easy to add `inventory:read`, `orders:write` | Workspace changes would require API scope changes |

**How It Works:**

```typescript
// API key scopes define WHAT resources can be accessed
const apiKeyScopes = ['products:read', 'products:write', 'passports:read'];

// Organization membership defines WHICH tenant
// All API operations are scoped to the organization that owns the key

// Example: Shopify integration key
// - Scopes: products:read, products:write, passports:read
// - Can: Read products, update product data, fetch DPP info
// - Cannot: Issue DPPs, manage attestations
// - Always: Scoped to the organization that created the key
```

**If Workspace-Scoped Keys Are Needed:**

For organizations requiring stricter API access control:

1. **Create separate API keys** for different integration purposes
2. **Use minimal scopes** per key (principle of least privilege)
3. **Enterprise tier**: Custom scope definitions available on request

```typescript
// Example: Minimal keys for different purposes
const shopifyKey = { scopes: ['products:read', 'products:write'] };
const analyticsKey = { scopes: ['passports:read'] };
const cicdKey = { scopes: ['products:read'] };  // Read-only for testing
```

### 2.3 Session Management

```typescript
// Session configuration
const SESSION_CONFIG = {
  // JWT in HttpOnly cookie
  cookie: {
    httpOnly: true,         // No JavaScript access
    secure: true,           // HTTPS only
    sameSite: 'strict',     // CSRF protection
    maxAge: 7 * 24 * 3600,  // 7 days
    path: '/',
    domain: '.eurocomply.eu',
  },

  // JWT claims
  jwt: {
    algorithm: 'ES256',     // ECDSA with P-256
    issuer: 'eurocomply',
    audience: 'eurocomply-api',
    expiresIn: '7d',
  },

  // Refresh behavior
  refresh: {
    enabled: true,
    threshold: '1d',        // Refresh if < 1 day remaining
  },
};
```

### 2.4 Enterprise SSO (SAML/OIDC)

For Enterprise tier customers:

| Protocol | Status | Identity Providers |
|----------|--------|-------------------|
| SAML 2.0 | Supported | Okta, Azure AD, OneLogin |
| OIDC | Supported | Google Workspace, Azure AD, Auth0 |

SSO users bypass magic link flow entirely - authentication delegated to IdP.

---

## 3. Authorization

### 3.1 Role-Based Access Control (RBAC)

> **Canonical Reference:** See [Authority Levels](./USER_MANAGEMENT.md#2-authority-levels)
> for complete role definitions and workspace-specific permissions.

**Summary:** Four workspace authority levels (MANAGER > EDITOR > CONTRIBUTOR > VIEWER)
plus organization-level ADMIN role. CONTRIBUTOR is a special external role for suppliers.

### 3.2 Permission Matrix

| Action | CONTRIBUTOR | VIEWER | EDITOR | MANAGER | ADMIN |
|--------|-------------|--------|--------|---------|-------|
| View products | ❌ | ✅ | ✅ | ✅ | ✅ |
| Edit products | ❌ | ❌ | ✅ | ✅ | ✅ |
| Approve edits | ❌ | ❌ | ❌ | ✅ | ✅ |
| Issue DPPs | ❌ | ❌ | ❌ | ✅ | ✅ |
| Submit attestations | ✅ | ❌ | ✅ | ✅ | ✅ |
| Manage users | ❌ | ❌ | ❌ | ❌ | ✅ |
| View billing | ❌ | ❌ | ❌ | ❌ | ✅ |
| Manage API keys | ❌ | ❌ | ❌ | ❌ | ✅ |
| Export keys | ❌ | ❌ | ❌ | ❌ | ✅ |

> **Note:** CONTRIBUTOR is a special external role for suppliers and attestation agencies. They can only submit attestations for products they're explicitly invited to - they cannot view other organization data.

### 3.3 Resource-Level Authorization

Beyond roles, authorization checks resource ownership:

```typescript
// Every request verified
async function authorizeRequest(userId: string, resource: Resource, action: Action) {
  // 1. Get user's organization
  const user = await getUser(userId);

  // 2. Verify resource belongs to user's organization
  if (resource.organizationId !== user.organizationId) {
    throw new ForbiddenError('Resource not accessible');
  }

  // 3. Verify user has required role for action
  if (!hasPermission(user.role, action)) {
    throw new ForbiddenError('Insufficient permissions');
  }

  // 4. Log access
  await auditLog.record({
    userId,
    organizationId: user.organizationId,
    resourceType: resource.type,
    resourceId: resource.id,
    action,
    timestamp: new Date(),
  });
}
```

---

## 4. Data Security

### 4.1 Encryption at Rest

| Data Type | Encryption | Key Management |
|-----------|------------|----------------|
| Database (RDS) | AES-256 | AWS KMS |
| File storage (S3) | AES-256 | AWS KMS |
| Backups | AES-256 | AWS KMS |
| Signing keys (walt.id) | AES-256-GCM | Application-level KEK |

### 4.2 Encryption in Transit

```
┌─────────────────────────────────────────────────────────────────┐
│                    TLS CONFIGURATION                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  EXTERNAL (public endpoints)                                    │
│  ───────────────────────────                                    │
│  • TLS 1.3 only (1.2 deprecated)                               │
│  • HSTS enabled (max-age=31536000, includeSubDomains, preload) │
│  • Certificate: Let's Encrypt + Cloudflare                     │
│                                                                  │
│  INTERNAL (service-to-service)                                  │
│  ─────────────────────────────                                  │
│  • mTLS between services                                       │
│  • Private CA for service certificates                         │
│                                                                  │
│  DATABASE                                                       │
│  ────────                                                       │
│  • SSL required (rds.force_ssl = 1)                            │
│  • Certificate verification enabled                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Sensitive Data Handling

```typescript
// Sensitive fields are encrypted at application level
const ENCRYPTED_FIELDS = [
  'organization.vatNumber',       // PII
  'user.email',                   // PII (also hashed for lookup)
  'apiKey.keyHash',               // Already hashed, but encrypted too
  'signingKey.privateKeyJwk',     // Cryptographic material
  'epcisRepository.credentials',  // External system credentials (OAuth, API keys)
];

// Encryption uses envelope encryption
// Master key in AWS KMS, data encryption key (DEK) per organization
```

---

## 5. API Security

### 5.1 Rate Limiting

Rate limits are **tier-based** - higher tiers get higher limits. The limit applies to all API requests combined (POST and GET).

```
┌─────────────────────────────────────────────────────────────────┐
│                    TIER-BASED RATE LIMITS                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TIER         │ API RATE LIMIT    │ NOTES                       │
│  ─────────────┼───────────────────┼─────────────────────────────│
│  Starter      │ 100 req/min       │ Suitable for small catalogs │
│  Growth       │ 500 req/min       │ Standard integrations       │
│  Scale        │ 2,000 req/min     │ High-volume sync            │
│  Enterprise   │ 10,000 req/min    │ Real-time integrations      │
│  Platform     │ Custom            │ Negotiated per contract     │
│                                                                  │
│  SPECIAL ENDPOINTS (tier-independent):                          │
│  ─────────────┼───────────────────┼─────────────────────────────│
│  POST /auth/* │ 5 req/hour        │ Per email (brute force)     │
│  POST /ai/*   │ 10 req/hour       │ AI import (expensive)       │
│  GET /dpp/:id │ Unlimited         │ Public DPP access (CDN)     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    RATE LIMIT RESPONSE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Headers returned on every request:                             │
│  X-RateLimit-Limit: 10000          (your tier's limit)         │
│  X-RateLimit-Remaining: 9542       (requests left this window) │
│  X-RateLimit-Reset: 1704722400     (window reset timestamp)    │
│                                                                  │
│  On limit exceeded: 429 Too Many Requests                      │
│  Retry-After: 30                   (seconds until reset)       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

> **Note:** Rate limits are tracked per organization, not per API key. Multiple API keys share the same limit pool.

### 5.1.1 AI Token Budgets and Cost Controls

The AI import feature uses Anthropic Claude and incurs per-token costs. Beyond request rate limits, we enforce **token budgets** to prevent runaway costs.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AI TOKEN BUDGET SYSTEM                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  MONTHLY TOKEN BUDGETS BY TIER:                                             │
│  ──────────────────────────────                                             │
│                                                                              │
│  │ Tier       │ Input Tokens │ Output Tokens │ Approx. Documents │         │
│  │────────────│──────────────│───────────────│───────────────────│         │
│  │ Starter    │ 100,000      │ 25,000        │ ~50 documents     │         │
│  │ Growth     │ 500,000      │ 125,000       │ ~250 documents    │         │
│  │ Scale      │ 2,000,000    │ 500,000       │ ~1,000 documents  │         │
│  │ Enterprise │ 10,000,000   │ 2,500,000     │ ~5,000 documents  │         │
│  │ Platform   │ Custom       │ Custom        │ Negotiated        │         │
│                                                                              │
│  TOKEN TRACKING:                                                            │
│  ───────────────                                                            │
│  • Tracked per organization per calendar month                              │
│  • Resets on 1st of each month (UTC)                                       │
│  • Usage visible in Settings → Usage → AI Import                           │
│                                                                              │
│  WHAT COUNTS TOWARD BUDGET:                                                 │
│  ──────────────────────────                                                 │
│  • Document content (PDFs, spreadsheets, images)                           │
│  • System prompts and extraction schemas                                    │
│  • Model responses (extracted data)                                         │
│                                                                              │
│  WHAT DOESN'T COUNT:                                                        │
│  ───────────────────                                                        │
│  • Cached extractions (same document hash = free)                          │
│  • Failed requests (only successful extractions billed)                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Token Budget Enforcement

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BUDGET ENFORCEMENT BEHAVIOR                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  USAGE THRESHOLDS:                                                          │
│  ─────────────────                                                          │
│                                                                              │
│  │ Usage │ Action                                                         │
│  │───────│────────────────────────────────────────────────────────────────│
│  │ 75%   │ Email notification to org admins                               │
│  │ 90%   │ Dashboard warning banner                                        │
│  │ 100%  │ AI import disabled until next month (or upgrade)               │
│  │ 100%+ │ Requests return 429 with specific error code                   │
│                                                                              │
│  BUDGET EXCEEDED RESPONSE:                                                  │
│  ─────────────────────────                                                  │
│                                                                              │
│  HTTP/1.1 429 Too Many Requests                                            │
│  Content-Type: application/json                                             │
│  X-RateLimit-Type: token-budget                                            │
│  X-TokenBudget-Limit: 500000                                               │
│  X-TokenBudget-Used: 500000                                                │
│  X-TokenBudget-Reset: 2026-02-01T00:00:00Z                                 │
│                                                                              │
│  {                                                                          │
│    "success": false,                                                        │
│    "error": {                                                               │
│      "code": "AI_TOKEN_BUDGET_EXCEEDED",                                   │
│      "message": "Monthly AI token budget exhausted",                       │
│      "details": {                                                          │
│        "budgetLimit": 500000,                                              │
│        "budgetUsed": 500000,                                               │
│        "resetDate": "2026-02-01T00:00:00Z",                                │
│        "upgradeUrl": "https://app.eurocomply.eu/settings/billing/upgrade" │
│      }                                                                      │
│    }                                                                        │
│  }                                                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Cost Model and Pass-Through

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AI COST MODEL                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PRICING STRUCTURE:                                                         │
│  ──────────────────                                                         │
│                                                                              │
│  AI import is INCLUDED in subscription tiers (not metered).                │
│  Token budgets are generous enough for typical usage.                      │
│                                                                              │
│  │ Tier       │ Monthly Cost │ AI Budget Value* │ Effective AI Cost │      │
│  │────────────│──────────────│──────────────────│───────────────────│      │
│  │ Starter    │ €99/month    │ ~€1.50           │ Included          │      │
│  │ Growth     │ €299/month   │ ~€7.50           │ Included          │      │
│  │ Scale      │ €799/month   │ ~€30.00          │ Included          │      │
│  │ Enterprise │ €2,499/month │ ~€150.00         │ Included          │      │
│                                                                              │
│  *Based on Claude Haiku pricing: $0.25/M input, $1.25/M output             │
│                                                                              │
│  OVERAGE OPTIONS (Enterprise only):                                         │
│  ──────────────────────────────────                                         │
│                                                                              │
│  Enterprise customers can enable pay-as-you-go overage:                    │
│                                                                              │
│  {                                                                          │
│    "aiOverage": {                                                          │
│      "enabled": true,                                                       │
│      "maxMonthlySpend": 500,  // EUR cap                                   │
│      "pricePerMillionInputTokens": 0.30,   // 20% markup on Anthropic     │
│      "pricePerMillionOutputTokens": 1.50                                   │
│    }                                                                        │
│  }                                                                          │
│                                                                              │
│  Non-enterprise tiers: No overage. Upgrade tier for more tokens.           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Anthropic Rate Limit Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ANTHROPIC API RATE LIMIT HANDLING                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SCENARIO: Anthropic returns 429 (rate limited)                            │
│  ───────────────────────────────────────────────                            │
│                                                                              │
│  Our Response:                                                              │
│  1. Queue the request for automatic retry (exponential backoff)            │
│  2. Return 202 Accepted to client with job ID                              │
│  3. Notify via webhook when extraction completes                           │
│                                                                              │
│  Client receives:                                                           │
│  ────────────────                                                           │
│  HTTP/1.1 202 Accepted                                                     │
│  {                                                                          │
│    "success": true,                                                         │
│    "data": {                                                                │
│      "jobId": "job_abc123",                                                │
│      "status": "queued",                                                    │
│      "reason": "upstream_rate_limit",                                      │
│      "estimatedCompletion": "2026-01-15T12:05:00Z",                        │
│      "webhookUrl": "Will notify when complete"                             │
│    }                                                                        │
│  }                                                                          │
│                                                                              │
│  RETRY STRATEGY:                                                            │
│  ───────────────                                                            │
│  Attempt 1: Immediate                                                       │
│  Attempt 2: 30 seconds                                                      │
│  Attempt 3: 2 minutes                                                       │
│  Attempt 4: 10 minutes                                                      │
│  Attempt 5: 1 hour                                                          │
│  After 5 failures: Job marked failed, tokens not charged                   │
│                                                                              │
│  MONITORING:                                                                │
│  ───────────                                                                │
│  • Anthropic rate limit events logged to CloudWatch                        │
│  • Alert if >10% of requests hit upstream limits                           │
│  • Dashboard shows current Anthropic quota utilization                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Token Usage API

```http
GET /api/v1/usage/ai-tokens
Authorization: Bearer ec_live_...
```

Response:
```json
{
  "success": true,
  "data": {
    "period": "2026-01",
    "tier": "Growth",
    "budget": {
      "inputTokens": { "limit": 500000, "used": 234567, "remaining": 265433 },
      "outputTokens": { "limit": 125000, "used": 58642, "remaining": 66358 }
    },
    "usage": {
      "requests": 127,
      "documentsProcessed": 89,
      "avgTokensPerDocument": 2635,
      "cacheHits": 12
    },
    "projectedUsage": {
      "endOfMonth": 468000,
      "willExceedBudget": false
    },
    "history": [
      { "date": "2026-01-14", "inputTokens": 45000, "outputTokens": 11250 },
      { "date": "2026-01-13", "inputTokens": 38000, "outputTokens": 9500 }
    ]
  }
}
```

#### Implementation Notes

```typescript
// Token budget middleware
async function checkAITokenBudget(req: Request): Promise<void> {
  const org = req.organization;
  const usage = await getMonthlyTokenUsage(org.id);
  const limits = getTokenLimitsForTier(org.tier);

  if (usage.inputTokens >= limits.inputTokens) {
    throw new TokenBudgetExceededError({
      limit: limits.inputTokens,
      used: usage.inputTokens,
      resetDate: getNextMonthStart(),
    });
  }

  // Estimate tokens for this request (pre-flight check)
  const estimatedTokens = estimateDocumentTokens(req.body.document);
  if (usage.inputTokens + estimatedTokens > limits.inputTokens * 1.1) {
    // Allow 10% overage to avoid cutting off mid-batch
    throw new TokenBudgetExceededError({ /* ... */ });
  }
}

// Post-request token tracking
async function trackTokenUsage(
  orgId: string,
  anthropicResponse: AnthropicResponse
): Promise<void> {
  const { input_tokens, output_tokens } = anthropicResponse.usage;

  await prisma.aiTokenUsage.create({
    data: {
      organizationId: orgId,
      inputTokens: input_tokens,
      outputTokens: output_tokens,
      model: 'claude-3-haiku',
      timestamp: new Date(),
    },
  });

  // Check thresholds and send notifications
  await checkUsageThresholds(orgId);
}
```

### 5.2 Input Validation

All inputs validated at API boundary using Zod schemas:

```typescript
// Example: Product creation schema
const CreateProductSchema = z.object({
  name: z.string().min(1).max(200),
  gtin: z.string().regex(/^\d{8,14}$/).refine(validateGtinCheckDigit),
  category: z.enum(['textile', 'furniture', 'electronics', 'battery']),
  description: z.string().max(5000).optional(),
  materials: z.array(MaterialSchema).max(50).optional(),
});

// Request handler
app.post('/api/v1/products', async (req, res) => {
  const validated = CreateProductSchema.parse(req.body); // Throws on invalid
  // ... proceed with validated data
});
```

### 5.3 Output Sanitization

```typescript
// Sensitive fields stripped from responses
const REDACTED_FIELDS = [
  'user.magicLinkTokenHash',
  'apiKey.keyHash',
  'organization.stripeCustomerId',
];

// Automatic redaction middleware
function redactSensitiveFields(obj: any): any {
  // Deep clone and remove sensitive paths
}
```

### 5.4 CORS Policy

```typescript
const CORS_CONFIG = {
  origin: [
    'https://app.eurocomply.eu',
    'https://eurocomply.eu',
    /\.eurocomply\.eu$/,  // Subdomains
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  maxAge: 86400,  // 24 hours
};
```

---

## 6. Cryptographic Key Management

### 6.1 Key Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                    KEY HIERARCHY                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  AWS KMS                                                        │
│  └── Master Key (CMK) - never leaves KMS                       │
│      │                                                          │
│      ├── Data Encryption Keys (DEKs) - per organization        │
│      │   │                                                      │
│      │   ├─► Local Cache (worker memory, 5-10 min TTL)         │
│      │   │       └── Used for bulk operations                  │
│      │   │       └── Max 1M operations per cached key          │
│      │   │                                                      │
│      │   ├─► Redis Cache (shared, 5 min TTL)                   │
│      │   │       └── Fallback for new workers                  │
│      │   │                                                      │
│      │   └── Operations:                                       │
│      │       ├── Database field encryption                     │
│      │       └── Backup encryption                             │
│      │                                                          │
│      └── Key Encryption Key (KEK)                              │
│          └── Encrypts signing keys in walt.id                  │
│                                                                  │
│  walt.id Custodian                                              │
│  └── Organization signing keys (Ed25519)                       │
│      └── did:key identifiers derived                           │
│      └── Used to sign Verifiable Credentials                   │
│                                                                  │
│  JWT Signing                                                    │
│  └── ECDSA P-256 key pair                                      │
│      └── Rotated every 90 days                                 │
│      └── Old keys valid for verification (1 year)             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**DEK Caching for Bulk Operations:**

Data key caching reduces KMS API calls by 99.9999% during bulk DPP generation. See Architecture Document §4.2.1 for details.

### 6.2 Key Rotation

| Key Type | Rotation Period | Overlap Period |
|----------|----------------|----------------|
| JWT signing | 90 days | 7 days (both valid) |
| API keys | Manual (user-initiated) | Unlimited (multiple active) |
| Database DEKs | Annual | N/A (AWS handles) |
| Organization signing | Never (identity-bound) | N/A |

### 6.3 Key Export (Organization Keys)

Organizations can export their signing keys:

```typescript
// Export requires:
// 1. Admin role
// 2. Explicit confirmation
// 3. Audit log entry
// 4. Email notification to all admins

POST /api/v1/organization/export-keys
{
  "confirmExport": true,
  "reason": "Migrating to self-hosted infrastructure"
}

// Response includes:
// - did:key identifier
// - Private key (JWK format)
// - All issued VCs
// - Status list (for revocation)
```

### 6.4 Organization Key Compromise Recovery

Organization signing keys are **identity-bound** - they represent the organization's cryptographic identity. Regular rotation is not performed because:
- did:key identifiers are derived from the public key
- Changing keys = changing identity
- All previously issued VCs reference the original did:key

However, if an organization's signing key is compromised, a recovery procedure is required:

```
┌─────────────────────────────────────────────────────────────────┐
│                    KEY COMPROMISE RECOVERY                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WHEN A COMPROMISE IS SUSPECTED:                                │
│  ───────────────────────────────                                │
│  1. Admin reports compromise via dashboard or support           │
│  2. Old key immediately disabled (no new signatures)            │
│  3. Review recent VC issuances for unauthorized activity        │
│                                                                  │
│  RECOVERY PROCEDURE:                                            │
│  ──────────────────                                             │
│  1. GENERATE NEW IDENTITY                                       │
│     • New Ed25519 keypair created                               │
│     • New did:key assigned to organization                      │
│     • Old did:key marked as "compromised" in our records        │
│                                                                  │
│  2. REVOKE SUSPICIOUS VCs                                       │
│     • Use StatusList2021 to revoke VCs issued during            │
│       suspected compromise window                               │
│     • Verifiers checking these VCs will see revoked status      │
│                                                                  │
│  3. RE-ISSUE AFFECTED DPPs                                      │
│     • DPPs issued before compromise: Re-sign with new key       │
│     • New VCs reference new did:key                             │
│     • Old VCs remain verifiable but linked to compromised key   │
│                                                                  │
│  4. PUBLISH COMPROMISE NOTICE (Optional)                        │
│     • Organization can publish notice at well-known URL         │
│     • Links old did:key to new did:key with explanation         │
│                                                                  │
│  TRANSITION PERIOD:                                             │
│  ─────────────────                                              │
│  • 30-day window where both old and new identities recognized   │
│  • Verifiers warned: "Issuer has rotated identity due to        │
│    security incident. Verify with new did:key."                 │
│  • After 30 days: Old did:key verification shows warning only   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key Compromise Database Schema:**

```prisma
model OrganizationKeyHistory {
  id              String        @id @default(cuid())
  organizationId  String
  organization    Organization  @relation(fields: [organizationId], references: [id])

  did             String        // did:key:z6Mk...
  status          KeyStatus     // ACTIVE, ROTATED, COMPROMISED
  compromisedAt   DateTime?     // When compromise was reported
  revokedVcCount  Int?          // VCs revoked due to this compromise
  replacedById    String?       // New key that replaced this one
  reason          String?       // Rotation reason

  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  @@index([organizationId])
  @@index([did])
}

enum KeyStatus {
  ACTIVE       // Current signing key
  ROTATED      // Replaced by newer key (normal transition)
  COMPROMISED  // Key was compromised, VCs may be revoked
}
```

**Important Considerations:**

| Scenario | Impact | Mitigation |
|----------|--------|------------|
| VCs signed before compromise | Still valid, signature is authentic | Keep old key verification but show warning |
| VCs signed by attacker | Invalid/unauthorized | Revoke via StatusList2021 |
| Products in market with old QR codes | VCs verify but show key history | Re-issue if customer requests |
| Third-party verifiers | May not know about compromise | Publish well-known compromise notice |

---

## 7. Infrastructure Security

### 7.1 Network Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    NETWORK ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  INTERNET                                                       │
│      │                                                          │
│      ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Cloudflare (WAF, DDoS protection, CDN)                │   │
│  └─────────────────────────────────────────────────────────┘   │
│      │                                                          │
│      ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  AWS ALB (Application Load Balancer)                    │   │
│  │  • TLS termination                                      │   │
│  │  • Health checks                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│      │                                                          │
│      ▼                                                          │
│  ┌────────────────── VPC (Private) ─────────────────────────┐  │
│  │                                                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │  │
│  │  │ ECS (API)   │  │ ECS (Worker)│  │ walt.id     │       │  │
│  │  │ Public Sub  │  │ Private Sub │  │ Private Sub │       │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘       │  │
│  │         │                │                │               │  │
│  │         └────────────────┴────────────────┘               │  │
│  │                          │                                 │  │
│  │                    ┌─────────────┐                        │  │
│  │                    │ RDS (DB)    │                        │  │
│  │                    │ Private Sub │                        │  │
│  │                    └─────────────┘                        │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Security Groups:                                               │
│  • ALB → ECS (API): Port 3000 only                            │
│  • ECS → RDS: Port 5432 only                                   │
│  • ECS → walt.id: Ports 7000-7003 only                        │
│  • No direct internet access from private subnets              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 WAF Rules (Cloudflare)

| Rule | Action | Description |
|------|--------|-------------|
| OWASP Core Ruleset | Block | SQL injection, XSS, etc. |
| Rate limiting | Challenge | >1000 req/min per IP |
| Geo blocking | Block | Sanctioned countries |
| Bot detection | Challenge | Suspicious user agents |
| Known bad IPs | Block | Threat intelligence feeds |

### 7.3 Container Security

```yaml
# ECS Task Definition security settings
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop:
      - ALL

# Image scanning
image:
  scanning: enabled
  onPush: true
  onSchedule: weekly
  severityThreshold: HIGH  # Block deployment if HIGH/CRITICAL found
```

---

## 8. Audit Logging

### 8.1 What We Log

```typescript
interface AuditEvent {
  // Identity
  userId: string;
  organizationId: string;
  ipAddress: string;
  userAgent: string;

  // Action
  action: AuditAction;        // e.g., 'product.create', 'passport.issue'
  resourceType: ResourceType;
  resourceId: string;

  // Context
  timestamp: Date;
  requestId: string;
  sessionId: string;

  // Details
  previousValue?: object;     // For updates
  newValue?: object;          // For creates/updates
  metadata?: object;          // Additional context
}
```

### 8.2 Security-Critical Events

These events trigger immediate alerts:

| Event | Alert Channel |
|-------|---------------|
| Failed login (>5 attempts) | Slack + Email |
| API key created/revoked | Email to admins |
| Signing key exported | Email to all admins |
| Admin role granted | Email to existing admins |
| Unusual access pattern | Slack (security channel) |
| Rate limit exceeded (sustained) | PagerDuty |

### 8.3 Log Retention

| Log Type | Retention | Storage |
|----------|-----------|---------|
| Security events | 2 years | CloudWatch + S3 Glacier |
| Audit log | 7 years | PostgreSQL + S3 Glacier |
| Application logs | 30 days | CloudWatch |
| Access logs (ALB) | 90 days | S3 |

### 8.4 Raw SQL Audit Enforcement

**Problem:** For performance reasons, bulk operations use raw SQL (`$executeRaw`, `$queryRaw`) which bypasses Prisma middleware, including automatic audit logging. This creates a structural risk where critical state changes could miss the audit trail if developers forget to manually implement logging.

**Solution:** Enforce audit logging programmatically through a required wrapper, static analysis, and verification tests.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AUDIT ENFORCEMENT LAYERS                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Layer 1: WRAPPER (Runtime)                                                 │
│  ─────────────────────────                                                  │
│  AuditedRawSQL class enforces audit config as mandatory parameter.          │
│  Direct $executeRaw/$queryRaw usage is prohibited.                          │
│                                                                              │
│  Layer 2: ESLINT (Development)                                              │
│  ─────────────────────────────                                              │
│  Static analysis flags direct raw SQL usage at development time.            │
│  CI fails if violations detected.                                           │
│                                                                              │
│  Layer 3: VERIFICATION (Testing)                                            │
│  ───────────────────────────────                                            │
│  Integration tests verify audit entries exist for all state changes.        │
│  Periodic reconciliation queries detect drift.                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 8.4.1 AuditedRawSQL Wrapper (Required)

All raw SQL operations MUST use this wrapper instead of direct Prisma methods:

```typescript
// src/lib/db/audited-raw-sql.ts

import { PrismaClient, Prisma } from '@prisma/client';

interface AuditConfig {
  action: string;                    // e.g., 'CLAIM_AUTO_RELEASED'
  resourceType: string;              // e.g., 'DesignVersion'
  getAffectedRecords: () => Promise<AuditableRecord[]>;
  systemAction?: boolean;            // true for background jobs
  metadata?: Record<string, unknown>;
}

interface AuditableRecord {
  id: string;
  organizationId: string;
  [key: string]: unknown;
}

export class AuditedRawSQL {
  constructor(private prisma: PrismaClient) {}

  /**
   * Execute raw SQL with mandatory audit logging.
   *
   * Pattern:
   * 1. Fetch affected records BEFORE mutation
   * 2. Execute the raw SQL
   * 3. Create audit entries for all affected records
   *
   * This ensures no state change can bypass the audit trail.
   */
  async executeRaw<T = unknown>(
    query: Prisma.Sql,
    auditConfig: AuditConfig
  ): Promise<{ result: T; auditedCount: number }> {
    const { action, resourceType, getAffectedRecords, systemAction, metadata } = auditConfig;

    // Step 1: Capture affected records BEFORE mutation
    const affectedRecords = await getAffectedRecords();

    if (affectedRecords.length === 0) {
      return { result: undefined as T, auditedCount: 0 };
    }

    // Step 2: Execute the raw SQL within a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Execute the actual raw SQL
      const sqlResult = await tx.$executeRaw(query);

      // Step 3: Create audit entries (batch for performance)
      if (affectedRecords.length > 0) {
        await tx.auditLog.createMany({
          data: affectedRecords.map(record => ({
            action,
            resourceType,
            resourceId: record.id,
            organizationId: record.organizationId,
            metadata: {
              ...metadata,
              ...(record.auditMetadata || {}),
            },
            systemAction: systemAction ?? false,
            createdAt: new Date(),
          })),
        });
      }

      return sqlResult;
    });

    return { result: result as T, auditedCount: affectedRecords.length };
  }

  /**
   * Query raw SQL (read-only, no audit required for reads).
   * Provided for completeness - reads don't need audit logging.
   */
  async queryRaw<T = unknown>(query: Prisma.Sql): Promise<T> {
    return this.prisma.$queryRaw<T>(query);
  }
}

// Singleton instance
let auditedRawSQL: AuditedRawSQL | null = null;

export function getAuditedRawSQL(prisma: PrismaClient): AuditedRawSQL {
  if (!auditedRawSQL) {
    auditedRawSQL = new AuditedRawSQL(prisma);
  }
  return auditedRawSQL;
}
```

**Usage Example:**

```typescript
// ❌ PROHIBITED: Direct raw SQL (bypasses audit)
await prisma.$executeRaw`UPDATE "DesignVersion" SET status = 'PENDING_REVIEW' ...`;

// ✅ REQUIRED: Use AuditedRawSQL wrapper
const auditedSQL = getAuditedRawSQL(prisma);

const { auditedCount } = await auditedSQL.executeRaw(
  Prisma.sql`
    UPDATE "DesignVersion" dv
    SET status = 'PENDING_REVIEW',
        "claimedById" = NULL,
        "claimedAt" = NULL
    FROM "Product" p
    JOIN "Organization" o ON p."organizationId" = o.id
    WHERE dv."productId" = p.id
      AND dv.status = 'IN_REVIEW'
      AND dv."claimedAt" < NOW() - INTERVAL '1 hour' * COALESCE(
        (o.settings->>'claimExpiryHours')::int, 24
      )
  `,
  {
    action: 'CLAIM_AUTO_RELEASED',
    resourceType: 'DesignVersion',
    systemAction: true,
    metadata: { reason: 'claim_expiry', source: 'background_job' },
    getAffectedRecords: async () => {
      // Query MUST match the UPDATE's WHERE clause
      return prisma.$queryRaw<AuditableRecord[]>`
        SELECT dv.id, o.id as "organizationId", dv."claimedById" as "previousClaimant"
        FROM "DesignVersion" dv
        JOIN "Product" p ON dv."productId" = p.id
        JOIN "Organization" o ON p."organizationId" = o.id
        WHERE dv.status = 'IN_REVIEW'
          AND dv."claimedAt" < NOW() - INTERVAL '1 hour' * COALESCE(
            (o.settings->>'claimExpiryHours')::int, 24
          )
      `;
    },
  }
);

logger.info(`Released ${auditedCount} expired claims with audit trail`);
```

#### 8.4.2 ESLint Rule: no-direct-raw-sql

Enforce wrapper usage at development time:

```typescript
// eslint-rules/no-direct-raw-sql.ts

import { ESLintUtils } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  name => `https://eurocomply.dev/eslint/${name}`
);

export const noDirectRawSQL = createRule({
  name: 'no-direct-raw-sql',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow direct $executeRaw/$queryRaw to prevent audit trail bypass',
    },
    messages: {
      noDirectExecuteRaw:
        'Direct $executeRaw bypasses audit logging. Use AuditedRawSQL.executeRaw() instead.',
      noDirectQueryRawMutation:
        'Raw queries that modify data must use AuditedRawSQL.executeRaw() for audit logging.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      // Match: prisma.$executeRaw`...` or prisma.$executeRawUnsafe(...)
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          ['$executeRaw', '$executeRawUnsafe'].includes(node.callee.property.name)
        ) {
          context.report({
            node,
            messageId: 'noDirectExecuteRaw',
          });
        }
      },
      // Match: prisma.$executeRaw`...` (tagged template)
      TaggedTemplateExpression(node) {
        if (
          node.tag.type === 'MemberExpression' &&
          node.tag.property.type === 'Identifier' &&
          node.tag.property.name === '$executeRaw'
        ) {
          context.report({
            node,
            messageId: 'noDirectExecuteRaw',
          });
        }
      },
    };
  },
});
```

**ESLint Configuration:**

```javascript
// .eslintrc.js
module.exports = {
  plugins: ['@eurocomply'],
  rules: {
    '@eurocomply/no-direct-raw-sql': 'error',
  },
};
```

#### 8.4.3 Verification Tests

**Unit Tests for AuditedRawSQL:**

```typescript
// src/lib/db/__tests__/audited-raw-sql.test.ts

describe('AuditedRawSQL', () => {
  describe('executeRaw', () => {
    it('should_create_audit_entries_when_records_affected', async () => {
      // Arrange
      const mockRecords = [
        { id: 'dv_1', organizationId: 'org_1', claimedById: 'user_1' },
        { id: 'dv_2', organizationId: 'org_1', claimedById: 'user_2' },
      ];

      const auditedSQL = new AuditedRawSQL(prisma);

      // Act
      const { auditedCount } = await auditedSQL.executeRaw(
        Prisma.sql`UPDATE "DesignVersion" SET status = 'PENDING_REVIEW'`,
        {
          action: 'CLAIM_AUTO_RELEASED',
          resourceType: 'DesignVersion',
          systemAction: true,
          getAffectedRecords: async () => mockRecords,
        }
      );

      // Assert
      expect(auditedCount).toBe(2);

      const auditEntries = await prisma.auditLog.findMany({
        where: { action: 'CLAIM_AUTO_RELEASED' },
      });
      expect(auditEntries).toHaveLength(2);
      expect(auditEntries[0].resourceId).toBe('dv_1');
      expect(auditEntries[1].resourceId).toBe('dv_2');
    });

    it('should_skip_audit_when_no_records_affected', async () => {
      // Arrange
      const auditedSQL = new AuditedRawSQL(prisma);

      // Act
      const { auditedCount } = await auditedSQL.executeRaw(
        Prisma.sql`UPDATE "DesignVersion" SET status = 'PENDING_REVIEW' WHERE 1=0`,
        {
          action: 'CLAIM_AUTO_RELEASED',
          resourceType: 'DesignVersion',
          getAffectedRecords: async () => [], // No records match
        }
      );

      // Assert
      expect(auditedCount).toBe(0);
    });

    it('should_rollback_both_mutation_and_audit_on_failure', async () => {
      // Arrange
      const auditedSQL = new AuditedRawSQL(prisma);
      const initialCount = await prisma.auditLog.count();

      // Act & Assert
      await expect(
        auditedSQL.executeRaw(
          Prisma.sql`INVALID SQL SYNTAX`,
          {
            action: 'TEST_ACTION',
            resourceType: 'Test',
            getAffectedRecords: async () => [{ id: '1', organizationId: 'org_1' }],
          }
        )
      ).rejects.toThrow();

      // Verify no audit entries were created (transaction rolled back)
      const finalCount = await prisma.auditLog.count();
      expect(finalCount).toBe(initialCount);
    });
  });
});
```

**Integration Test - Audit Completeness:**

```typescript
// src/__tests__/integration/audit-completeness.test.ts

describe('Audit Trail Completeness', () => {
  it('should_have_audit_entry_for_every_claim_release', async () => {
    // Arrange: Create claims that will expire
    const testOrg = await createTestOrganization({ claimExpiryHours: 0 });
    const products = await createTestProducts(testOrg.id, 5);
    const claims = await createTestClaims(products, { expiredAt: new Date() });

    // Act: Run the release job
    await releaseClaimExpired();

    // Assert: Every released claim has an audit entry
    for (const claim of claims) {
      const auditEntry = await prisma.auditLog.findFirst({
        where: {
          action: 'CLAIM_AUTO_RELEASED',
          resourceType: 'DesignVersion',
          resourceId: claim.designVersionId,
        },
      });

      expect(auditEntry).not.toBeNull();
      expect(auditEntry?.organizationId).toBe(testOrg.id);
      expect(auditEntry?.metadata).toMatchObject({
        previousClaimant: claim.claimedById,
        reason: 'claim_expiry',
      });
    }
  });

  it('should_have_audit_entry_for_every_checkout_release', async () => {
    // Similar pattern for checkout releases
  });

  it('should_have_audit_entry_for_every_bulk_status_transition', async () => {
    // Similar pattern for status transitions
  });
});
```

**Periodic Reconciliation Query:**

```sql
-- Run daily to detect audit trail gaps
-- Alert if any discrepancy found

WITH state_changes AS (
  SELECT
    'DesignVersion' as resource_type,
    id as resource_id,
    DATE(updated_at) as change_date
  FROM "DesignVersion"
  WHERE status = 'PENDING_REVIEW'
    AND "claimedById" IS NULL
    AND updated_at > NOW() - INTERVAL '7 days'
),
audit_entries AS (
  SELECT
    "resourceType" as resource_type,
    "resourceId" as resource_id,
    DATE("createdAt") as audit_date
  FROM "AuditLog"
  WHERE action = 'CLAIM_AUTO_RELEASED'
    AND "createdAt" > NOW() - INTERVAL '7 days'
)
SELECT
  sc.resource_type,
  sc.resource_id,
  sc.change_date,
  CASE WHEN ae.resource_id IS NULL THEN 'MISSING_AUDIT' ELSE 'OK' END as status
FROM state_changes sc
LEFT JOIN audit_entries ae
  ON sc.resource_id = ae.resource_id
  AND sc.change_date = ae.audit_date
WHERE ae.resource_id IS NULL;
```

#### 8.4.4 CI/CD Enforcement (Pipeline Gate)

The ESLint rule alone provides development-time feedback, but CI/CD must block merges that violate the rule:

```yaml
# .github/workflows/ci.yml

name: CI Pipeline
on: [push, pull_request]

jobs:
  audit-enforcement:
    name: Raw SQL Audit Enforcement
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Check for direct raw SQL usage
        run: |
          # Run ESLint with only the raw SQL rule
          npx eslint . --rule '@eurocomply/no-direct-raw-sql: error' \
            --format json --output-file eslint-raw-sql.json || true

          # Parse results and fail if violations found
          VIOLATIONS=$(jq '[.[] | select(.errorCount > 0)] | length' eslint-raw-sql.json)

          if [ "$VIOLATIONS" -gt 0 ]; then
            echo "::error::Found $VIOLATIONS file(s) with direct raw SQL usage"
            echo "Raw SQL must use AuditedRawSQL wrapper for audit trail compliance"
            jq '.[] | select(.errorCount > 0) | {file: .filePath, errors: [.messages[] | .message]}' eslint-raw-sql.json
            exit 1
          fi

          echo "No direct raw SQL violations found"

      - name: Run audit trail tests
        run: npm run test:audit-trail

  # This job must pass before merge
  require-audit-compliance:
    name: Audit Compliance Gate
    needs: [audit-enforcement]
    runs-on: ubuntu-latest
    steps:
      - run: echo "All audit enforcement checks passed"
```

**Pre-commit Hook (Local Enforcement):**

```bash
#!/bin/bash
# .husky/pre-commit

# Check for direct raw SQL usage before commit
echo "Checking for direct raw SQL usage..."

VIOLATIONS=$(git diff --cached --name-only --diff-filter=ACM | \
  grep -E '\.(ts|tsx|js|jsx)$' | \
  xargs grep -l '\.\$executeRaw\|\.\$queryRaw\|\.\$executeRawUnsafe' 2>/dev/null || true)

if [ -n "$VIOLATIONS" ]; then
  echo "ERROR: Direct raw SQL usage detected in staged files:"
  echo "$VIOLATIONS"
  echo ""
  echo "Use AuditedRawSQL wrapper instead:"
  echo "  const auditedSQL = getAuditedRawSQL(prisma);"
  echo "  await auditedSQL.executeRaw(query, auditConfig);"
  exit 1
fi

echo "No direct raw SQL violations"
```

**Branch Protection Rules (GitHub/GitLab):**

```yaml
# Required status checks before merge
# Configure in repository settings

required_status_checks:
  strict: true
  contexts:
    - "audit-enforcement"
    - "require-audit-compliance"

# Ensure no bypass without review
require_code_owner_reviews: true
dismiss_stale_reviews: true
```

#### 8.4.5 Enforcement Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RAW SQL AUDIT ENFORCEMENT LAYERS                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LAYER           WHEN              BLOCKS          BYPASS                   │
│  ──────────────────────────────────────────────────────────────────────     │
│  Pre-commit      Before commit     Commit fails    git commit --no-verify   │
│  ESLint (IDE)    During coding     Red squiggles   Disable rule (flagged)   │
│  CI Pipeline     On PR             Merge blocked   Admin override (logged)  │
│  Tests           CI + nightly      Pipeline fails  None                     │
│  Reconciliation  Daily             Alert on-call   None                     │
│                                                                              │
│  Result: Multiple layers ensure audit trail compliance even if one fails    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Incident Response

### 9.1 Severity Levels

| Level | Description | Response Time | Example |
|-------|-------------|---------------|---------|
| P1 - Critical | Service down, data breach | 15 minutes | Database compromise |
| P2 - High | Degraded service, potential breach | 1 hour | Auth system issues |
| P3 - Medium | Limited impact | 4 hours | Single customer affected |
| P4 - Low | Minimal impact | 24 hours | Minor UI security bug |

### 9.2 Response Procedure

```
┌─────────────────────────────────────────────────────────────────┐
│                    INCIDENT RESPONSE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. DETECT                                                      │
│     • Automated monitoring (Datadog, CloudWatch)               │
│     • User reports                                              │
│     • Security scans                                            │
│                                                                  │
│  2. TRIAGE                                                      │
│     • Assign severity                                           │
│     • Notify on-call engineer                                   │
│     • Create incident channel                                   │
│                                                                  │
│  3. CONTAIN                                                     │
│     • Isolate affected systems                                  │
│     • Revoke compromised credentials                            │
│     • Enable additional logging                                 │
│                                                                  │
│  4. INVESTIGATE                                                 │
│     • Determine root cause                                      │
│     • Assess impact (data affected, users affected)            │
│     • Preserve evidence                                         │
│                                                                  │
│  5. REMEDIATE                                                   │
│     • Fix vulnerability                                         │
│     • Rotate affected credentials                               │
│     • Deploy patches                                            │
│                                                                  │
│  6. RECOVER                                                     │
│     • Restore service                                           │
│     • Verify fix                                                │
│     • Monitor for recurrence                                    │
│                                                                  │
│  7. POST-MORTEM                                                 │
│     • Document timeline                                         │
│     • Identify improvements                                     │
│     • Update runbooks                                           │
│     • Customer communication (if required)                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 9.3 Data Breach Notification

Per GDPR Article 33:
- **Authority notification**: Within 72 hours to relevant DPA
- **Customer notification**: Without undue delay if high risk to individuals
- **Documentation**: All breaches logged, even if no notification required

---

## 10. Vulnerability Management

### 10.1 Dependency Scanning

```yaml
# CI/CD Pipeline
dependency-check:
  schedule: daily
  tools:
    - npm audit (Node.js)
    - Snyk (comprehensive)
    - Dependabot (GitHub)
  severity-threshold: HIGH
  action: block-merge
```

### 10.2 Security Testing

| Type | Frequency | Tool |
|------|-----------|------|
| SAST (Static) | Every commit | CodeQL, Semgrep |
| DAST (Dynamic) | Weekly | OWASP ZAP |
| Dependency scan | Daily | Snyk |
| Container scan | On push | Trivy |
| Penetration test | Annual | Third-party |

### 10.3 Responsible Disclosure

```
Security issues can be reported to: security@eurocomply.eu

We commit to:
• Acknowledge within 24 hours
• Provide status update within 5 days
• Not pursue legal action for good-faith research
• Credit researchers (if desired) after fix

Bug bounty: Case-by-case consideration
```

---

## 11. Compliance

### 11.1 Standards & Certifications

| Standard | Status | Scope |
|----------|--------|-------|
| SOC 2 Type II | In progress | Full platform |
| ISO 27001 | Planned | Full platform |
| GDPR | Compliant | EU data processing |
| ESPR | Compliant | DPP functionality |

### 11.2 Third-Party Security

All vendors assessed for:
- SOC 2 / ISO 27001 certification
- GDPR compliance (for EU data)
- Data processing agreements (DPAs) in place

| Vendor | Purpose | Compliance |
|--------|---------|------------|
| AWS | Infrastructure | SOC 2, ISO 27001, GDPR |
| Cloudflare | CDN, WAF | SOC 2, ISO 27001, GDPR |
| Stripe | Payments | PCI-DSS Level 1, SOC 2 |
| Resend | Email | SOC 2, GDPR |
| Anthropic (Claude) | AI import | DPA required before production |

---

## 12. Security Checklist for Development

```
┌─────────────────────────────────────────────────────────────────┐
│                    SECURITY CHECKLIST                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  AUTHENTICATION                                                 │
│  □ Magic link tokens hashed before storage                     │
│  □ API keys hashed with SHA-256                                │
│  □ Sessions use HttpOnly, Secure, SameSite cookies             │
│  □ JWT expiration enforced                                      │
│                                                                  │
│  AUTHORIZATION                                                  │
│  □ Every endpoint checks user permissions                       │
│  □ Resource ownership verified                                  │
│  □ No privilege escalation paths                               │
│                                                                  │
│  INPUT VALIDATION                                               │
│  □ All inputs validated with Zod schemas                       │
│  □ File uploads: type validation, size limits                  │
│  □ SQL injection: Prisma parameterized queries                 │
│  □ XSS: React escapes by default, no dangerouslySetInnerHTML  │
│                                                                  │
│  DATA PROTECTION                                               │
│  □ Sensitive fields encrypted at rest                          │
│  □ PII minimized and documented                                │
│  □ Logs don't contain secrets                                  │
│  □ Error messages don't leak internals                         │
│                                                                  │
│  CRYPTOGRAPHY                                                  │
│  □ Signing keys stored securely (walt.id Custodian)           │
│  □ Key export requires explicit confirmation                   │
│  □ No hardcoded secrets in code                               │
│  □ Secrets from environment variables only                     │
│                                                                  │
│  INFRASTRUCTURE                                                │
│  □ No public access to database                                │
│  □ Security groups follow least privilege                      │
│  □ TLS everywhere                                              │
│  □ Dependencies up to date                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 13. Multi-Tenancy Security

EuroComply uses a **schema-per-tenant** model with seven layers of defense. Security is not a premium feature—every pricing tier receives genuine data isolation.

### 13.1 Design Principle

> **Architecture Decision:** ALL tiers receive per-tenant database credentials. Security is not a premium feature—every customer gets the same isolation guarantees.

| Tier | Isolation Model | Max Breach Impact |
|------|-----------------|-------------------|
| Starter (€79) | Schema + Per-Tenant Credentials | 1 tenant |
| Growth (€199) | Schema + Per-Tenant Credentials | 1 tenant |
| Scale (€599) | Schema + Per-Tenant Credentials | 1 tenant |
| Enterprise (€1,499) | Schema + Per-Tenant Credentials | 1 tenant |
| Platform (Custom) | Dedicated Instance | 1 tenant |

### 13.2 Seven Layers of Security

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Layer 1: Edge Protection (Cloudflare)                                        │
│ • DDoS mitigation, WAF rules, Bot protection, TLS termination               │
├─────────────────────────────────────────────────────────────────────────────┤
│ Layer 2: Authentication (JWT + API Keys)                                     │
│ • Short-lived access tokens, Refresh token rotation, API key scoping        │
├─────────────────────────────────────────────────────────────────────────────┤
│ Layer 3: Application Isolation                                               │
│ • Organization ID on every request, Middleware validates access             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Layer 4: Schema Isolation                                                    │
│ • Dedicated PostgreSQL schema per tenant, SET search_path limits visibility │
├─────────────────────────────────────────────────────────────────────────────┤
│ Layer 5: Row-Level Security                                                  │
│ • PostgreSQL RLS policies, Defense against SQL injection                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ Layer 6: Cell Isolation                                                      │
│ • Tenants grouped into separate RDS instances, ~200 tenants per cell max    │
├─────────────────────────────────────────────────────────────────────────────┤
│ Layer 7: Encryption                                                          │
│ • TLS in transit, AES-256 at rest, Per-tenant DEKs for sensitive fields     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.3 Schema Isolation Model

Each tenant receives a dedicated PostgreSQL schema within a shared database cell:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            GROWTH CELL 1                                     │
│                         db.t4g.small Multi-AZ                                │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ schema_tenant_  │  │ schema_tenant_  │  │ schema_tenant_  │             │
│  │ abc123          │  │ def456          │  │ ghi789          │   • • •     │
│  │                 │  │                 │  │                 │             │
│  │ ┌─────────────┐ │  │ ┌─────────────┐ │  │ ┌─────────────┐ │             │
│  │ │ products    │ │  │ │ products    │ │  │ │ products    │ │             │
│  │ │ passports   │ │  │ │ passports   │ │  │ │ passports   │ │             │
│  │ │ versions    │ │  │ │ versions    │ │  │ │ versions    │ │             │
│  │ │ attestations│ │  │ │ attestations│ │  │ │ attestations│ │             │
│  │ └─────────────┘ │  │ └─────────────┘ │  │ └─────────────┘ │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                              │
│  Per-Tenant Credentials: tenant_org_{id} (one per tenant)                   │
│  Tenants per Cell: ~200                                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.4 Tenant Router Implementation

```typescript
class TenantRouter {
  private cellPools: Map<string, Pool> = new Map();

  async getConnection(organizationId: string): Promise<TenantConnection> {
    const config = await this.getTenantConfig(organizationId);
    const pool = await this.getCellPool(config.cellId);
    const client = await pool.connect();

    // Set schema context - PRIMARY SECURITY CONTROL
    await client.query(`SET search_path = ${config.schemaName}, public`);

    // Set RLS context - DEFENSE IN DEPTH
    await client.query('SET app.current_org = $1', [organizationId]);

    return {
      client,
      release: async () => {
        await client.query('RESET ALL');
        await client.query('DISCARD ALL');
        client.release();
      },
    };
  }
}
```

### 13.5 Connection Flow

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Request │────▶│    Tenant    │────▶│  Get Cell    │────▶│   Set Schema │
│  + JWT   │     │    Router    │     │   Pool       │     │   Context    │
└──────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                        │                                          │
                        ▼                                          ▼
                 ┌──────────────┐                          ┌──────────────┐
                 │ Config DB    │                          │ SET search_  │
                 │ org → cell   │                          │ path = schema│
                 │ org → schema │                          │ + RLS context│
                 └──────────────┘                          └──────────────┘
```

### 13.6 Tenant Provisioning

On signup, the system automatically:

1. Assigns tenant to a cell with capacity
2. Creates dedicated schema
3. Generates per-tenant encryption key (DEK)
4. Runs schema migrations
5. Registers configuration in routing database

```sql
-- Executed during tenant provisioning
CREATE SCHEMA schema_tenant_abc123;
SET search_path = schema_tenant_abc123;

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    name TEXT NOT NULL,
    gtin TEXT,
    sku TEXT,
    status TEXT DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT org_check CHECK (organization_id = 'abc123-...'::uuid)
);

-- RLS as defense-in-depth
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON products
    USING (organization_id = current_setting('app.current_org')::uuid);
```

### 13.7 Per-Tenant Encryption (DEKs)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ENCRYPTION HIERARCHY                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                        ┌─────────────────────┐                              │
│                        │   AWS KMS           │                              │
│                        │   Master Key (CMK)  │                              │
│                        └──────────┬──────────┘                              │
│                                   │                                          │
│              ┌────────────────────┼────────────────────┐                    │
│              ▼                    ▼                    ▼                    │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │
│   │ Tenant DEK      │  │ Tenant DEK      │  │ Tenant DEK      │           │
│   │ (tenant_001)    │  │ (tenant_002)    │  │ (tenant_003)    │           │
│   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘           │
│            │                    │                    │                      │
│            ▼                    ▼                    ▼                      │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │
│   │ Encrypted:      │  │ Encrypted:      │  │ Encrypted:      │           │
│   │ • BOM data      │  │ • BOM data      │  │ • BOM data      │           │
│   │ • Cost prices   │  │ • Cost prices   │  │ • Cost prices   │           │
│   │ • Supplier info │  │ • Supplier info │  │ • Supplier info │           │
│   └─────────────────┘  └─────────────────┘  └─────────────────┘           │
│                                                                              │
│   On tenant deletion: DEK is revoked → data becomes permanently unreadable │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.8 Attack Scenarios

| Attack Vector | Mitigation | Impact if Successful |
|---------------|------------|----------------------|
| SQL Injection | Parameterized queries + schema isolation + RLS | 1 tenant max |
| Stolen JWT | Short expiry + refresh rotation | 1 user session |
| Cell credential leak | Schema isolation | Must know schema name |
| Application bug | Schema isolation + RLS | 1 tenant max |
| Database snapshot theft | Per-tenant encryption (DEKs) | Data unreadable |
| Complete cell compromise | Cell isolation | ~200 tenants max |

### 13.9 Row-Level Security (Defense in Depth)

RLS provides an additional layer of protection within each schema:

```sql
-- RLS policies on tenant tables (defense-in-depth)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE passports ENABLE ROW LEVEL SECURITY;
ALTER TABLE attestations ENABLE ROW LEVEL SECURITY;

-- Policy uses app.current_org set by tenant router
CREATE POLICY tenant_isolation ON products
    FOR ALL
    USING (organization_id = current_setting('app.current_org')::uuid)
    WITH CHECK (organization_id = current_setting('app.current_org')::uuid);
```

**Why RLS in addition to schema isolation?**
- Protects against bugs where wrong schema is selected
- Blocks raw SQL queries that bypass Prisma
- Defense-in-depth principle

### 13.10 Per-Tenant Database Credentials

> **Architecture Decision:** Every tenant receives dedicated PostgreSQL credentials regardless of pricing tier. This is our standard model, not an optional enhancement.

**Why Per-Tenant Credentials:**
While schema-per-tenant provides strong logical isolation, sharing cell-level credentials (`growth_cell_1_user`) would mean a credential compromise affects all ~200 tenants in that cell. With per-tenant credentials:
- Credential leak exposes 1 tenant, not 200
- Each tenant's connection can be individually revoked
- Audit trails are per-tenant
- Defense-in-depth against privilege escalation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CELL-LEVEL HARDENING LAYERS                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Layer A: PER-SCHEMA CREDENTIALS                                            │
│  ───────────────────────────────                                            │
│  Each tenant schema has dedicated PostgreSQL role.                          │
│  Credential leak exposes 1 tenant, not 200.                                 │
│                                                                              │
│  Layer B: RESOURCE QUOTAS                                                   │
│  ────────────────────────                                                   │
│  Per-tenant connection limits, statement timeouts, temp file limits.        │
│  Noisy neighbor cannot monopolize shared resources.                         │
│                                                                              │
│  Layer C: ANOMALY DETECTION                                                 │
│  ─────────────────────────                                                  │
│  Real-time monitoring for unusual query patterns, resource spikes.          │
│  Alert before impact spreads to other tenants.                              │
│                                                                              │
│  Layer D: CELL QUARANTINE                                                   │
│  ────────────────────────                                                   │
│  Incident response procedure to isolate compromised cells.                  │
│  Tenant migration path to clean cell.                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 13.10.1 Per-Schema Database Credentials

Each tenant receives a dedicated PostgreSQL role restricted to their schema:

```sql
-- On tenant provisioning: create dedicated role
CREATE ROLE tenant_org_abc123 WITH LOGIN PASSWORD 'rotated_secret';

-- Grant access ONLY to tenant's schema
GRANT USAGE ON SCHEMA org_abc123 TO tenant_org_abc123;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA org_abc123 TO tenant_org_abc123;
ALTER DEFAULT PRIVILEGES IN SCHEMA org_abc123
  GRANT ALL PRIVILEGES ON TABLES TO tenant_org_abc123;

-- Explicitly deny access to other schemas
REVOKE ALL ON SCHEMA public FROM tenant_org_abc123;
-- (Other tenant schemas are not granted, so already inaccessible)
```

**Connection Routing:**

```typescript
// src/lib/db/tenant-connection.ts

interface TenantCredentials {
  host: string;
  database: string;
  username: string;      // tenant_org_abc123 (per-tenant)
  password: string;      // From AWS Secrets Manager
  schema: string;
}

class SecureTenantRouter {
  private credentialsCache: Map<string, CachedCredential> = new Map();

  async getConnection(organizationId: string): Promise<PoolClient> {
    const creds = await this.getTenantCredentials(organizationId);
    const pool = await this.getOrCreatePool(creds);
    const client = await pool.connect();

    // Schema is already enforced by role permissions, but set explicitly for safety
    await client.query(`SET search_path TO ${creds.schema}, public`);
    await client.query(`SET app.current_org TO '${organizationId}'`);

    return client;
  }

  private async getTenantCredentials(orgId: string): Promise<TenantCredentials> {
    // Credentials stored in AWS Secrets Manager, cached locally with TTL
    const cached = this.credentialsCache.get(orgId);
    if (cached && !cached.isExpired()) {
      return cached.credentials;
    }

    const secret = await secretsManager.getSecretValue({
      SecretId: `eurocomply/tenant/${orgId}/db-credentials`
    }).promise();

    const credentials = JSON.parse(secret.SecretString!);
    this.credentialsCache.set(orgId, {
      credentials,
      expiresAt: Date.now() + 5 * 60 * 1000  // 5 min cache
    });

    return credentials;
  }
}
```

**Blast Radius Comparison (why we chose per-tenant):**

| Credential Type | If Compromised | Blast Radius |
|----------------|----------------|--------------|
| Cell credential (rejected) | Attacker can query any schema | ~200 tenants |
| **Per-tenant credential (chosen)** | Attacker limited to one schema | **1 tenant** |

**Operational Considerations:**

| Concern | Analysis | Mitigation |
|---------|----------|------------|
| **PostgreSQL role capacity** | No hard limit; roles stored in `pg_authid` catalog with ~100 bytes each. 200 roles is trivial. | None needed - well within capacity |
| **Connection pooling** | Each role needs dedicated PgBouncer pool entry. 200 tenants × 10 connections = 2,000 entries. | Configure PgBouncer with `max_client_conn=2500`, `default_pool_size=10` |
| **Secrets Manager cost** | $0.40/secret/month × 200 tenants = ~$80/cell/month | Factor into cell cost model; still profitable at €129/tenant |
| **Credential rotation** | 200 rotations per cell could cause thundering herd | Stagger rotations: 7 tenants/day for 30-day cycle |

**PgBouncer Configuration for Per-Tenant Pools:**

```ini
; /etc/pgbouncer/pgbouncer.ini

[databases]
; Auto-generated entries per tenant
org_abc123 = host=cell1.rds.amazonaws.com dbname=eurocomply user=tenant_org_abc123
org_def456 = host=cell1.rds.amazonaws.com dbname=eurocomply user=tenant_org_def456
; ... (200 entries per cell)

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6432
auth_type = hba
auth_file = /etc/pgbouncer/userlist.txt

; Pool settings
pool_mode = transaction
max_client_conn = 2500
default_pool_size = 10
min_pool_size = 1
reserve_pool_size = 5

; Per-tenant isolation
server_reset_query = DISCARD ALL
server_check_query = SELECT 1
```

**Rotation Scheduling:**

```typescript
// Stagger credential rotations to avoid thundering herd
function getRotationSchedule(tenantCount: number, cycleDays: number): Map<string, Date> {
  const tenantsPerDay = Math.ceil(tenantCount / cycleDays);
  const schedule = new Map<string, Date>();

  tenants.forEach((tenant, index) => {
    const dayOffset = Math.floor(index / tenantsPerDay);
    const rotationDate = addDays(cycleStartDate, dayOffset);
    schedule.set(tenant.id, rotationDate);
  });

  return schedule;
}

// For 200 tenants on 30-day cycle: ~7 rotations/day
// Spread across off-peak hours (02:00-06:00 UTC)
```

#### 13.10.2 Resource Quotas

Prevent noisy neighbors from impacting other tenants:

```sql
-- Per-tenant role resource limits
ALTER ROLE tenant_org_abc123 SET statement_timeout = '30s';
ALTER ROLE tenant_org_abc123 SET lock_timeout = '10s';
ALTER ROLE tenant_org_abc123 SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE tenant_org_abc123 SET temp_file_limit = '100MB';

-- Connection limits (enforced at application layer via PgBouncer)
-- Growth tier: 10 connections per tenant
-- Scale tier: 25 connections per tenant
-- Enterprise: Dedicated pool
```

**Application-Layer Enforcement:**

```typescript
// src/lib/db/resource-governor.ts

interface TenantQuotas {
  maxConnections: number;
  maxQueriesPerMinute: number;
  maxRowsPerQuery: number;
  statementTimeoutMs: number;
}

const TIER_QUOTAS: Record<Tier, TenantQuotas> = {
  growth: {
    maxConnections: 10,
    maxQueriesPerMinute: 1000,
    maxRowsPerQuery: 10000,
    statementTimeoutMs: 30000,
  },
  scale: {
    maxConnections: 25,
    maxQueriesPerMinute: 5000,
    maxRowsPerQuery: 50000,
    statementTimeoutMs: 60000,
  },
  enterprise: {
    maxConnections: 100,
    maxQueriesPerMinute: 20000,
    maxRowsPerQuery: 100000,
    statementTimeoutMs: 120000,
  },
};

class ResourceGovernor {
  private queryCounters: Map<string, SlidingWindowCounter> = new Map();

  async checkQuota(orgId: string, tier: Tier): Promise<void> {
    const quotas = TIER_QUOTAS[tier];
    const counter = this.getCounter(orgId);

    if (counter.count >= quotas.maxQueriesPerMinute) {
      throw new QuotaExceededError(
        `Rate limit exceeded: ${quotas.maxQueriesPerMinute} queries/min`,
        { retryAfter: counter.windowResetMs }
      );
    }

    counter.increment();
  }
}
```

#### 13.10.3 Credential Rotation

Automatic rotation reduces exposure window from credential compromise:

```typescript
// infrastructure/lambda/rotate-tenant-credentials.ts

import { SecretsManagerRotationHandler } from 'aws-lambda';

export const handler: SecretsManagerRotationHandler = async (event) => {
  const { SecretId, Step } = event;

  switch (Step) {
    case 'createSecret':
      // Generate new password
      const newPassword = generateSecurePassword(32);
      await secretsManager.putSecretValue({
        SecretId,
        ClientRequestToken: event.ClientRequestToken,
        SecretString: JSON.stringify({ ...currentSecret, password: newPassword }),
        VersionStage: 'AWSPENDING',
      }).promise();
      break;

    case 'setSecret':
      // Update PostgreSQL role password
      const pending = await getSecret(SecretId, 'AWSPENDING');
      await adminPool.query(
        `ALTER ROLE ${pending.username} WITH PASSWORD '${pending.password}'`
      );
      break;

    case 'testSecret':
      // Verify new credentials work
      const testPool = new Pool(pending);
      await testPool.query('SELECT 1');
      await testPool.end();
      break;

    case 'finishSecret':
      // Promote pending to current
      await secretsManager.updateSecretVersionStage({
        SecretId,
        VersionStage: 'AWSCURRENT',
        MoveToVersionId: event.ClientRequestToken,
        RemoveFromVersionId: currentVersionId,
      }).promise();
      break;
  }
};
```

**Rotation Schedule:**

| Tier | Rotation Frequency | Reason |
|------|-------------------|--------|
| Growth | 90 days | Balance security vs operational overhead |
| Scale | 30 days | Higher security requirements |
| Enterprise | 7 days | Maximum security |
| On-demand | Immediate | Triggered by suspected compromise |

#### 13.10.4 Cell Monitoring & Anomaly Detection

Real-time detection of noisy neighbors and suspicious activity:

```typescript
// src/lib/monitoring/cell-monitor.ts

interface CellMetrics {
  cellId: string;
  timestamp: Date;
  cpu: number;
  memory: number;
  iops: number;
  connections: number;
  activeQueries: number;
  slowQueries: number;
  tenantBreakdown: Map<string, TenantMetrics>;
}

interface TenantMetrics {
  organizationId: string;
  connections: number;
  queriesPerMinute: number;
  avgQueryTimeMs: number;
  rowsScanned: number;
  tempFilesUsed: number;
}

class CellMonitor {
  private readonly THRESHOLDS = {
    tenantCpuShare: 0.3,        // Alert if one tenant uses >30% of cell CPU
    tenantConnectionShare: 0.2, // Alert if one tenant uses >20% of connections
    queryTimeP99Ms: 5000,       // Alert if P99 query time exceeds 5s
    tempFileUsageMb: 500,       // Alert if temp file usage exceeds 500MB
  };

  async collectMetrics(cellId: string): Promise<CellMetrics> {
    const pgStats = await this.queryPgStats(cellId);
    const tenantBreakdown = await this.aggregateByTenant(pgStats);

    return {
      cellId,
      timestamp: new Date(),
      ...pgStats,
      tenantBreakdown,
    };
  }

  async detectAnomalies(metrics: CellMetrics): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];

    for (const [orgId, tenant] of metrics.tenantBreakdown) {
      // Noisy neighbor detection
      if (tenant.connections / metrics.connections > this.THRESHOLDS.tenantConnectionShare) {
        anomalies.push({
          type: 'NOISY_NEIGHBOR',
          severity: 'WARNING',
          organizationId: orgId,
          message: `Tenant using ${tenant.connections}/${metrics.connections} connections`,
          recommendation: 'Consider throttling or migration to dedicated cell',
        });
      }

      // Unusual query patterns (potential compromise)
      if (tenant.rowsScanned > 1000000 && tenant.queriesPerMinute > 100) {
        anomalies.push({
          type: 'SUSPICIOUS_ACTIVITY',
          severity: 'CRITICAL',
          organizationId: orgId,
          message: `Unusual scan pattern: ${tenant.rowsScanned} rows in ${tenant.queriesPerMinute} queries`,
          recommendation: 'Investigate for potential credential compromise',
        });
      }
    }

    return anomalies;
  }
}
```

**Alerting Configuration:**

```yaml
# cloudwatch-alarms.yaml
CellNoisyNeighborAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: !Sub "${CellId}-noisy-neighbor"
    MetricName: TenantResourceShare
    Namespace: EuroComply/Cells
    Statistic: Maximum
    Period: 60
    EvaluationPeriods: 3
    Threshold: 0.3
    ComparisonOperator: GreaterThanThreshold
    AlarmActions:
      - !Ref OpsSlackTopic
      - !Ref AutoThrottleLambda
```

#### 13.10.5 Cell Quarantine Procedure

When a cell is suspected to be compromised:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CELL QUARANTINE PROCEDURE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TRIGGER CONDITIONS:                                                        │
│  • Credential leak detected (e.g., found in public repo)                   │
│  • Anomaly detection flags multiple suspicious tenants                      │
│  • Security scan detects unauthorized access patterns                       │
│  • Customer reports potential breach                                        │
│                                                                              │
│  PHASE 1: IMMEDIATE (0-5 minutes)                                          │
│  ─────────────────────────────────                                          │
│  1. Page on-call security engineer                                          │
│  2. Enable enhanced logging on affected cell                                │
│  3. Rotate ALL credentials in affected cell                                 │
│  4. Block new connections (existing queries complete)                       │
│                                                                              │
│  PHASE 2: ASSESSMENT (5-30 minutes)                                        │
│  ──────────────────────────────────                                         │
│  5. Analyze audit logs for unauthorized access                              │
│  6. Identify affected tenants (data access patterns)                        │
│  7. Snapshot cell for forensic analysis                                     │
│  8. Determine if data exfiltration occurred                                 │
│                                                                              │
│  PHASE 3: REMEDIATION (30-120 minutes)                                     │
│  ─────────────────────────────────────                                      │
│  9. Provision clean cell with fresh credentials                             │
│  10. Migrate affected tenants to clean cell                                 │
│  11. Notify affected customers (per GDPR Article 34 if breach confirmed)   │
│  12. Decommission quarantined cell                                          │
│                                                                              │
│  PHASE 4: POST-INCIDENT (24-72 hours)                                      │
│  ────────────────────────────────────                                       │
│  13. Complete forensic analysis                                             │
│  14. File breach report if required (GDPR Article 33: 72 hours)            │
│  15. Update security controls based on findings                             │
│  16. Conduct blameless postmortem                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Tenant Migration During Quarantine:**

```typescript
// src/lib/operations/cell-migration.ts

async function migrateTenantToCleanCell(
  organizationId: string,
  sourceCell: string,
  targetCell: string
): Promise<MigrationResult> {
  const migration = await prisma.tenantMigration.create({
    data: {
      organizationId,
      sourceCell,
      targetCell,
      status: 'IN_PROGRESS',
      startedAt: new Date(),
    },
  });

  try {
    // 1. Create schema in target cell
    await targetAdmin.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);

    // 2. Create new credentials for target cell
    const newCreds = await createTenantCredentials(organizationId, targetCell);

    // 3. Dump and restore (pg_dump/pg_restore for consistency)
    await execAsync(`pg_dump -h ${sourceCell} -n ${schemaName} | pg_restore -h ${targetCell}`);

    // 4. Update routing config (atomic switch)
    await prisma.organizationConfig.update({
      where: { organizationId },
      data: {
        cellId: targetCell,
        credentialsSecretArn: newCreds.secretArn,
        migratedAt: new Date(),
      },
    });

    // 5. Invalidate connection pools
    await connectionManager.invalidatePool(organizationId);

    return { success: true, migration };
  } catch (error) {
    await prisma.tenantMigration.update({
      where: { id: migration.id },
      data: { status: 'FAILED', error: error.message },
    });
    throw error;
  }
}
```

#### 13.10.6 Updated Attack Scenarios

With Cell-Level Hardening, the attack scenario outcomes improve:

| Attack Vector | Mitigation | Impact (Before) | Impact (After) |
|---------------|------------|-----------------|----------------|
| Cell credential leak | Per-schema credentials | ~200 tenants | 1 tenant |
| Noisy neighbor | Resource quotas + throttling | ~200 tenants degraded | 1 tenant throttled |
| Complete cell compromise | Quarantine + migration | ~200 tenants, hours to recover | ~200 tenants, minutes to migrate |
| Credential enumeration | Per-tenant secrets, rotation | Persistent access | Access revoked within rotation window |

#### 13.10.7 Connection Isolation Guarantees

With per-tenant credentials, cross-tenant data leaks via connection pooling are **not possible**, even with PgBouncer transaction mode:

```
SCENARIO: Connection returned to pool with stale search_path

1. Tenant A transaction completes
2. Connection has search_path = tenant_a_schema
3. Connection returned to pool (DISCARD ALL runs via server_reset_query)
4. Tenant B acquires connection
5. Even if DISCARD ALL failed:
   - Tenant B's credential can only access tenant_b_schema
   - Any query against tenant_a_schema fails with permission denied
   - RLS policies also filter by app.current_org
```

**Blast Radius Analysis:**

| Failure Mode | With Cell Credentials | With Per-Tenant Credentials |
|--------------|----------------------|----------------------------|
| search_path leak | ~200 tenants exposed | **0 tenants exposed** |
| RESET failure | ~200 tenants exposed | **0 tenants exposed** |
| Both failures | ~200 tenants exposed | **0 tenants exposed** |

**Critical PgBouncer Settings (must be configured):**

```ini
server_reset_query = DISCARD ALL
server_reset_query_always = 1    ; Reset even on error/cancel
```

Per-tenant credentials make the pooling mode security concern **moot**. The credential itself enforces schema isolation at the PostgreSQL permission level, independent of application-level `search_path` settings.

See Architecture Document §3.5.1 for the full defense-in-depth diagram.

### 13.11 Schema Provisioning Automation

This section details the automated provisioning of tenant schemas during onboarding.

#### 13.11.1 Provisioning Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TENANT SCHEMA PROVISIONING                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TRIGGER: Stripe webhook `checkout.session.completed`                       │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  STEP 1: SELECT TARGET CELL                                          │   │
│  │  ────────────────────────────                                        │   │
│  │  Input: Organization tier (starter, growth, scale, enterprise)       │   │
│  │  Logic:                                                              │   │
│  │  • Query cell_metadata for cells with capacity                       │   │
│  │  • Filter by tier (growth cells for growth tier, etc.)               │   │
│  │  • Select cell with lowest current_tenants                           │   │
│  │  • If all cells > 80% capacity: Alert ops, provision new cell        │   │
│  │  Output: cellId (e.g., "growth-cell-1")                              │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  STEP 2: CREATE SCHEMA                                               │   │
│  │  ─────────────────────                                               │   │
│  │  SQL (via cell admin connection):                                    │   │
│  │                                                                       │   │
│  │  BEGIN;                                                              │   │
│  │  CREATE SCHEMA schema_tenant_{org_id};                               │   │
│  │  SET search_path = schema_tenant_{org_id};                           │   │
│  │  -- Create all tables via Prisma migration                           │   │
│  │  COMMIT;                                                             │   │
│  │                                                                       │   │
│  │  On failure: ROLLBACK, log error, alert ops                          │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  STEP 3: CREATE TENANT ROLE                                          │   │
│  │  ─────────────────────────                                           │   │
│  │  SQL:                                                                │   │
│  │                                                                       │   │
│  │  -- Create role with random password                                 │   │
│  │  CREATE ROLE tenant_org_{org_id} WITH LOGIN PASSWORD '{generated}';  │   │
│  │                                                                       │   │
│  │  -- Apply resource limits                                            │   │
│  │  ALTER ROLE tenant_org_{org_id} SET statement_timeout = '30s';       │   │
│  │  ALTER ROLE tenant_org_{org_id} SET lock_timeout = '10s';            │   │
│  │  ALTER ROLE tenant_org_{org_id} SET temp_file_limit = '100MB';       │   │
│  │                                                                       │   │
│  │  -- Tier-specific limits                                             │   │
│  │  -- Growth: CONNECTION LIMIT 10                                      │   │
│  │  -- Scale: CONNECTION LIMIT 25                                       │   │
│  │  -- Enterprise: CONNECTION LIMIT 100                                 │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  STEP 4: GRANT PERMISSIONS                                           │   │
│  │  ──────────────────────                                              │   │
│  │  SQL:                                                                │   │
│  │                                                                       │   │
│  │  -- Grant schema access                                              │   │
│  │  GRANT USAGE ON SCHEMA schema_tenant_{org_id} TO tenant_org_{org_id};│   │
│  │  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA schema_tenant_{org_id} │   │
│  │    TO tenant_org_{org_id};                                           │   │
│  │  GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA schema_tenant_{org_id}│ │
│  │    TO tenant_org_{org_id};                                           │   │
│  │                                                                       │   │
│  │  -- Future tables inherit permissions                                │   │
│  │  ALTER DEFAULT PRIVILEGES IN SCHEMA schema_tenant_{org_id}           │   │
│  │    GRANT ALL PRIVILEGES ON TABLES TO tenant_org_{org_id};            │   │
│  │                                                                       │   │
│  │  -- Deny access to other schemas                                     │   │
│  │  REVOKE ALL ON SCHEMA public FROM tenant_org_{org_id};               │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  STEP 5: STORE CREDENTIALS                                           │   │
│  │  ────────────────────────                                            │   │
│  │                                                                       │   │
│  │  AWS Secrets Manager:                                                │   │
│  │  Secret ID: eurocomply/tenant/{org_id}/db-credentials               │   │
│  │  Value: {                                                            │   │
│  │    "host": "growth-cell-1.xxx.rds.amazonaws.com",                   │   │
│  │    "port": 5432,                                                     │   │
│  │    "database": "eurocomply",                                        │   │
│  │    "username": "tenant_org_{org_id}",                               │   │
│  │    "password": "{generated}",                                        │   │
│  │    "schema": "schema_tenant_{org_id}"                               │   │
│  │  }                                                                   │   │
│  │                                                                       │   │
│  │  Tags: organizationId, cellId, tier, createdAt                      │   │
│  │  Rotation: Enabled with Lambda handler (see 13.10.3)                │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  STEP 6: UPDATE ROUTING                                              │   │
│  │  ──────────────────────                                              │   │
│  │                                                                       │   │
│  │  DynamoDB (eurocomply-routing table):                               │   │
│  │  PK: ORG#{org_id}                                                   │   │
│  │  SK: ROUTING                                                         │   │
│  │  Attributes: cellId, schemaName, status='active', tier, updatedAt   │   │
│  │                                                                       │   │
│  │  Cell metadata update:                                               │   │
│  │  UPDATE cell_metadata SET current_tenants = current_tenants + 1     │   │
│  │    WHERE cell_id = '{cellId}';                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  STEP 7: GENERATE ENCRYPTION KEY (DEK)                               │   │
│  │  ─────────────────────────────────────                               │   │
│  │                                                                       │   │
│  │  AWS KMS:                                                            │   │
│  │  • Generate data key using cell CMK                                 │   │
│  │  • Store encrypted DEK in tenant record                             │   │
│  │  • DEK used for encrypting sensitive fields (BOM, attestations)     │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│                        PROVISIONING COMPLETE                                │
│                        Send welcome email                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 13.11.2 Rollback on Failure

If provisioning fails at any step, the system performs cleanup:

```typescript
// src/lib/provisioning/tenant-provisioner.ts

async function provisionTenant(organizationId: string, tier: Tier): Promise<ProvisioningResult> {
  const rollbackSteps: RollbackStep[] = [];

  try {
    // Step 1: Select cell
    const cell = await selectTargetCell(tier);

    // Step 2: Create schema
    await cellAdmin.query(`CREATE SCHEMA schema_tenant_${organizationId}`);
    rollbackSteps.push({ type: 'DROP_SCHEMA', schema: `schema_tenant_${organizationId}` });

    // Step 3: Create role
    const password = generateSecurePassword(32);
    await cellAdmin.query(`CREATE ROLE tenant_org_${organizationId} WITH LOGIN PASSWORD '${password}'`);
    rollbackSteps.push({ type: 'DROP_ROLE', role: `tenant_org_${organizationId}` });

    // Step 4: Grant permissions
    await grantSchemaPermissions(organizationId);

    // Step 5: Store credentials
    const secretArn = await storeCredentials(organizationId, cell, password);
    rollbackSteps.push({ type: 'DELETE_SECRET', secretArn });

    // Step 6: Update routing
    await updateRouting(organizationId, cell);
    rollbackSteps.push({ type: 'DELETE_ROUTING', organizationId });

    // Step 7: Generate DEK
    await generateDek(organizationId, cell);
    rollbackSteps.push({ type: 'DELETE_DEK', organizationId });

    return { success: true, cellId: cell.id };

  } catch (error) {
    // Execute rollback in reverse order
    for (const step of rollbackSteps.reverse()) {
      await executeRollback(step);
    }

    await alertOps({
      type: 'PROVISIONING_FAILED',
      organizationId,
      error: error.message,
      rollbackCompleted: true,
    });

    throw new ProvisioningError(error.message);
  }
}
```

**Rollback Actions:**

| Step Failed | Rollback Actions |
|-------------|------------------|
| Create schema | None needed |
| Create role | DROP SCHEMA |
| Grant permissions | DROP ROLE, DROP SCHEMA |
| Store credentials | DROP ROLE, DROP SCHEMA |
| Update routing | Delete secret, DROP ROLE, DROP SCHEMA |
| Generate DEK | Delete routing, delete secret, DROP ROLE, DROP SCHEMA |

#### 13.11.3 Zero-Downtime Credential Rotation

Credential rotation maintains dual-credential validity to prevent connection failures:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ZERO-DOWNTIME CREDENTIAL ROTATION                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TIMELINE:                                                                  │
│                                                                              │
│  T+0:00  │ Rotation triggered (scheduled or manual)                        │
│          │                                                                   │
│  T+0:01  │ Generate new password                                           │
│          │ Store as AWSPENDING version in Secrets Manager                  │
│          │                                                                   │
│  T+0:02  │ PostgreSQL: ALTER ROLE ... PASSWORD (new password)              │
│          │ NOTE: PostgreSQL allows BOTH old and new to work briefly        │
│          │                                                                   │
│  T+0:03  │ Test new credentials (SELECT 1)                                 │
│          │ If test fails: Rollback, alert ops, abort rotation              │
│          │                                                                   │
│  T+0:04  │ Update Secrets Manager:                                         │
│          │ • AWSPENDING → AWSCURRENT                                       │
│          │ • Old version → AWSPREVIOUS                                     │
│          │                                                                   │
│  T+0:05  │ Invalidate connection pool cache                                │
│          │ New connections use new credentials                             │
│          │                                                                   │
│  T+5:00  │ Grace period ends                                               │
│          │ AWSPREVIOUS version deleted                                     │
│          │ Only new credentials work                                       │
│          │                                                                   │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  DUAL-CREDENTIAL WINDOW (T+0:04 to T+5:00):                                │
│  • Both AWSCURRENT and AWSPREVIOUS credentials valid                       │
│  • Existing connections continue working with old credentials              │
│  • New connections get new credentials from refreshed cache                │
│  • No connection failures during rotation                                  │
│                                                                              │
│  CONNECTION POOL REFRESH STRATEGY:                                          │
│  ─────────────────────────────────                                          │
│  • Cache TTL: 5 minutes (matches grace period)                             │
│  • On cache miss: Fetch from Secrets Manager (gets AWSCURRENT)             │
│  • Existing pooled connections: Remain valid until returned to pool        │
│  • PgBouncer server_lifetime: 300 seconds (forces reconnect within window) │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Rotation Failure Handling:**

| Failure Point | Action | Recovery |
|---------------|--------|----------|
| Generate password | Abort, no changes | Retry next cycle |
| ALTER ROLE fails | Abort, no changes | Alert ops, manual review |
| Test connection fails | Keep old password | Alert ops, investigate PostgreSQL |
| Secrets Manager update fails | PostgreSQL has new password | Manual sync required |
| Cache invalidation fails | Connections use old credentials | Will self-heal at TTL expiry |

#### 13.11.4 PostgreSQL Role Hierarchy

Complete role structure for multi-tenant isolation:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    POSTGRESQL ROLE HIERARCHY                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                          ┌─────────────────────┐                            │
│                          │  rds_superuser      │                            │
│                          │  (AWS managed)      │                            │
│                          └──────────┬──────────┘                            │
│                                     │                                        │
│                                     │ GRANT                                  │
│                                     ▼                                        │
│                          ┌─────────────────────┐                            │
│                          │  eurocomply_admin   │                            │
│                          │  (Platform admin)   │                            │
│                          └──────────┬──────────┘                            │
│                                     │                                        │
│                    ┌────────────────┼────────────────┐                      │
│                    │                │                │                      │
│                    ▼                ▼                ▼                      │
│          ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐       │
│          │ cell_1_admin    │ │ cell_2_admin    │ │ cell_3_admin    │       │
│          │ (Cell-level)    │ │ (Cell-level)    │ │ (Cell-level)    │       │
│          └────────┬────────┘ └────────┬────────┘ └────────┬────────┘       │
│                   │                   │                   │                 │
│        ┌──────────┼──────────┐        │                   │                 │
│        │          │          │        │                   │                 │
│        ▼          ▼          ▼        ▼                   ▼                 │
│   ┌─────────┐┌─────────┐┌─────────┐                                        │
│   │tenant_  ││tenant_  ││tenant_  │  ... (up to 200 per cell)              │
│   │org_abc  ││org_def  ││org_ghi  │                                        │
│   └─────────┘└─────────┘└─────────┘                                        │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  ROLE DEFINITIONS:                                                          │
│                                                                              │
│  │ Role              │ Purpose                     │ Permissions            │
│  │───────────────────│─────────────────────────────│────────────────────────│
│  │ rds_superuser     │ AWS RDS admin               │ All (AWS managed)      │
│  │ eurocomply_admin  │ Platform operations         │ Create roles, schemas  │
│  │ cell_N_admin      │ Cell provisioning/migration │ Manage schemas in cell │
│  │ tenant_org_{id}   │ Tenant application access   │ Own schema only        │
│  │ audit_readonly    │ Compliance audits           │ SELECT on audit tables │
│  │ support_readonly  │ Customer support            │ SELECT on specific org │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  ROLE CREATION SQL:                                                         │
│                                                                              │
│  -- Cell admin (created once per cell)                                      │
│  CREATE ROLE cell_1_admin WITH LOGIN PASSWORD '{secret}' CREATEROLE;        │
│  GRANT CREATE ON DATABASE eurocomply TO cell_1_admin;                       │
│                                                                              │
│  -- Tenant role (created per tenant by cell admin)                          │
│  SET ROLE cell_1_admin;                                                     │
│  CREATE ROLE tenant_org_abc123 WITH LOGIN PASSWORD '{secret}';              │
│  -- (permissions granted as shown in 13.11.1)                               │
│  RESET ROLE;                                                                │
│                                                                              │
│  -- Audit role (read-only access to audit schemas)                          │
│  CREATE ROLE audit_readonly WITH LOGIN PASSWORD '{secret}';                 │
│  GRANT USAGE ON SCHEMA schema_audit TO audit_readonly;                      │
│  GRANT SELECT ON ALL TABLES IN SCHEMA schema_audit TO audit_readonly;       │
│                                                                              │
│  -- Support role (temporary, org-specific read access)                      │
│  CREATE ROLE support_readonly WITH LOGIN PASSWORD '{temp}' VALID UNTIL      │
│    '{timestamp + 4 hours}';                                                 │
│  GRANT USAGE ON SCHEMA schema_tenant_abc123 TO support_readonly;            │
│  GRANT SELECT ON ALL TABLES IN SCHEMA schema_tenant_abc123 TO               │
│    support_readonly;                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 13.11.5 Connection Pool Sizing by Tier

Each tier has appropriate connection limits based on expected usage:

| Tier | Connections/Tenant | Pool Size | Max Connections/Cell | Rationale |
|------|-------------------|-----------|---------------------|-----------|
| Starter | 5 | 2 | 1,000 (200 tenants) | Basic usage, single user |
| Growth | 10 | 5 | 2,000 (200 tenants) | Small team, moderate API |
| Scale | 25 | 10 | 1,250 (50 tenants) | Larger team, heavy API |
| Enterprise | 100 | 25 | 100 (dedicated) | Full access, dedicated cell |
| Platform | 500 | 100 | 500 (dedicated) | Unlimited, dedicated cluster |

**PgBouncer Pool Configuration:**

```ini
; Per-tier pool settings in pgbouncer.ini

[pools]
; Starter tier tenants
starter_pool_mode = transaction
starter_default_pool_size = 2
starter_min_pool_size = 0
starter_reserve_pool_size = 1
starter_max_client_conn = 5

; Growth tier tenants
growth_pool_mode = transaction
growth_default_pool_size = 5
growth_min_pool_size = 1
growth_reserve_pool_size = 2
growth_max_client_conn = 10

; Scale tier tenants
scale_pool_mode = transaction
scale_default_pool_size = 10
scale_min_pool_size = 2
scale_reserve_pool_size = 5
scale_max_client_conn = 25
```

**Connection Exhaustion Handling:**

```typescript
// When tenant exceeds connection limit
class ConnectionManager {
  async getConnection(organizationId: string): Promise<PoolClient> {
    const tier = await this.getTenantTier(organizationId);
    const limit = CONNECTION_LIMITS[tier];

    const activeConnections = await this.countActiveConnections(organizationId);

    if (activeConnections >= limit) {
      // Log warning, don't fail immediately
      logger.warn('Connection limit approaching', { organizationId, active: activeConnections, limit });

      if (activeConnections >= limit * 1.1) {
        // Hard limit with 10% buffer exceeded
        throw new ConnectionLimitError(
          `Connection limit exceeded: ${activeConnections}/${limit}. ` +
          `Consider upgrading to ${this.suggestUpgrade(tier)} for more connections.`
        );
      }
    }

    return this.pool.connect();
  }
}
```

---

## 14. Implementation Status

All security features described in this document are **planned**. This section tracks implementation progress.

### 14.1 Implementation Status

| Layer | Status | Notes |
|-------|--------|-------|
| Edge Protection (Cloudflare) | 📋 Planned | WAF, DDoS, TLS |
| Authentication (JWT + API Keys) | 📋 Planned | Magic links, refresh tokens |
| Application Isolation | 📋 Planned | Middleware, org context |
| Schema Isolation | 📋 Planned | Per-tenant schemas |
| Row-Level Security | 📋 Planned | Defense-in-depth |
| Cell Isolation | 📋 Planned | RDS instances per ~200 tenants |
| Per-Tenant Encryption | 📋 Planned | KMS DEKs |

### 14.2 Cell Deployment Plan

| Milestone | Trigger | Action |
|-----------|---------|--------|
| Launch | Day 1 | Deploy Growth Cell 1 |
| 200 Growth customers | Cell 1 at capacity | Deploy Growth Cell 2 |
| First Scale customer | €399 signup | Deploy Scale Cell |
| First Enterprise customer | €999 signup | Deploy dedicated RDS |
| First Mega customer | €4,999 signup | Deploy dedicated cluster |

### 14.3 What This Architecture Provides

**Compared to RLS-only approach (previous design):**

| Aspect | RLS-Only | Schema-per-Tenant |
|--------|----------|-------------------|
| Query isolation | Policy-based | Namespace-based |
| Breach impact | All tenants (if RLS bypassed) | 1 tenant |
| Raw SQL safety | Vulnerable | Schema limits visibility |
| Performance | RLS overhead per query | No RLS overhead (schema does isolation) |
| Encryption | Shared keys | Per-tenant DEKs |
| Noisy neighbor | Shared everything | Cell-based grouping |

### 14.4 Security Guarantees by Tier

| Tier | Isolation | Encryption | Noisy Neighbor Protection |
|------|-----------|------------|---------------------------|
| Growth | Schema + RLS | Per-tenant DEK | ~200 tenants per cell |
| Scale | Schema + RLS + credentials | Per-tenant DEK | ~50 tenants per cell |
| Enterprise | Dedicated RDS | Per-tenant DEK + BYOK option | None (dedicated) |
| Mega | Dedicated cluster | Per-tenant DEK + BYOK | None (dedicated) |

---

## Related Documentation

- [GDPR_COMPLIANCE.md](./GDPR_COMPLIANCE.md) - Data protection and privacy
- [DATA_SOVEREIGNTY.md](./DATA_SOVEREIGNTY.md) - Data ownership and portability
- [USER_MANAGEMENT.md](./USER_MANAGEMENT.md) - Roles and permissions
- [ARCHITECTURE_PORTABILITY.md](./ARCHITECTURE_PORTABILITY.md) - Infrastructure overview

---

*Last Updated: 2026-01-13*
