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

### 2.1 User Authentication (Magic Links)

EuroComply uses passwordless authentication via magic links with enhanced security:

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

```
┌─────────────────────────────────────────────────────────────────┐
│                    ROLE HIERARCHY                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ADMIN                                                          │
│  └── Org settings, user management, billing, API keys          │
│      └── MANAGER                                                │
│          └── Approve/reject edits, manage products, attestations│
│              └── EDITOR                                         │
│                  └── Edit products, request approval            │
│                      └── VIEWER                                 │
│                          └── Read-only access                   │
│                                                                  │
│  CONTRIBUTOR (external)                                         │
│  └── Submit attestations for specific products only             │
│  └── Cannot view other organization data                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Permission Matrix

| Action | VIEWER | EDITOR | MANAGER | ADMIN |
|--------|--------|--------|---------|-------|
| View products | ✅ | ✅ | ✅ | ✅ |
| Edit products | ❌ | ✅ | ✅ | ✅ |
| Approve edits | ❌ | ❌ | ✅ | ✅ |
| Issue DPPs | ❌ | ❌ | ✅ | ✅ |
| Manage users | ❌ | ❌ | ❌ | ✅ |
| View billing | ❌ | ❌ | ❌ | ✅ |
| Manage API keys | ❌ | ❌ | ❌ | ✅ |
| Export keys | ❌ | ❌ | ❌ | ✅ |

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

```
┌─────────────────────────────────────────────────────────────────┐
│                    RATE LIMITS                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ENDPOINT               │ LIMIT           │ WINDOW              │
│  ───────────────────────┼─────────────────┼─────────────────────│
│  POST /auth/login       │ 5 requests      │ per email per hour  │
│  POST /api/*            │ 100 requests    │ per minute          │
│  GET /api/*             │ 1000 requests   │ per minute          │
│  POST /api/ai/import    │ 10 requests     │ per hour            │
│  GET /public/dpp/:id    │ 10000 requests  │ per minute (CDN)    │
│                                                                  │
│  Rate limit headers returned:                                   │
│  X-RateLimit-Limit: 100                                        │
│  X-RateLimit-Remaining: 45                                     │
│  X-RateLimit-Reset: 1704722400                                 │
│                                                                  │
│  On limit exceeded: 429 Too Many Requests                      │
│  Retry-After: 30                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
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
│      ├── Data Encryption Keys (DEKs)                           │
│      │   └── Database field encryption                         │
│      │   └── Backup encryption                                 │
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

EuroComply uses a **shared database, row-level security** model for multi-tenancy. All organizations share the same PostgreSQL cluster, with strict isolation enforced at multiple layers.

### 13.1 Tenant Isolation Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MULTI-TENANCY ISOLATION LAYERS                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  LAYER 1: APPLICATION MIDDLEWARE                                │
│  ───────────────────────────────                                │
│  • Every request extracts organizationId from auth context      │
│  • OrganizationId injected into Prisma client                   │
│  • Queries automatically scoped before reaching database        │
│                                                                  │
│  LAYER 2: PRISMA CLIENT EXTENSION                               │
│  ────────────────────────────────                               │
│  • All queries automatically filtered by organizationId         │
│  • Prevents accidental cross-tenant queries                     │
│  • Audit logging for all data access                            │
│                                                                  │
│  LAYER 3: POSTGRESQL ROW-LEVEL SECURITY (RLS)                   │
│  ────────────────────────────────────────────                   │
│  • Database-level enforcement (defense in depth)                │
│  • Policies on all tenant-scoped tables                         │
│  • Blocks queries even if application layer bypassed            │
│                                                                  │
│  LAYER 4: API RESPONSE FILTERING                                │
│  ───────────────────────────────                                │
│  • Double-check organizationId before returning data            │
│  • Strip sensitive cross-tenant references                      │
│  • Log any anomalies                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 13.2 Row-Level Security (RLS) Implementation

PostgreSQL RLS policies enforce tenant isolation at the database level:

```sql
-- ============================================================
-- ROW-LEVEL SECURITY POLICIES
-- ============================================================

-- Enable RLS on all tenant-scoped tables
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Passport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Attestation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrganizationWallet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EPCISEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Batch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POLICY: Products - organization can only see their own products
-- ============================================================
CREATE POLICY "products_tenant_isolation" ON "Product"
  FOR ALL
  USING (
    "organizationId" = current_setting('app.current_organization_id', true)::text
  )
  WITH CHECK (
    "organizationId" = current_setting('app.current_organization_id', true)::text
  );

-- ============================================================
-- POLICY: Passports - organization can only see their own DPPs
-- ============================================================
CREATE POLICY "passports_tenant_isolation" ON "Passport"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "Product" p
      WHERE p."id" = "Passport"."productId"
      AND p."organizationId" = current_setting('app.current_organization_id', true)::text
    )
  );

-- ============================================================
-- POLICY: EPCIS Events - organization can only see their own events
-- ============================================================
CREATE POLICY "epcis_events_tenant_isolation" ON "EPCISEvent"
  FOR ALL
  USING (
    "organizationId" = current_setting('app.current_organization_id', true)::text
  )
  WITH CHECK (
    "organizationId" = current_setting('app.current_organization_id', true)::text
  );

-- ============================================================
-- POLICY: Attestations - special handling for cross-org attestations
-- ============================================================
-- Attestations can be viewed by:
-- 1. The organization that owns the product (attestation target)
-- 2. The organization that issued the attestation (contributor)
CREATE POLICY "attestations_tenant_isolation" ON "Attestation"
  FOR SELECT
  USING (
    -- Product owner can see attestations on their products
    EXISTS (
      SELECT 1 FROM "Product" p
      WHERE p."id" = "Attestation"."productId"
      AND p."organizationId" = current_setting('app.current_organization_id', true)::text
    )
    OR
    -- Contributor can see their own attestations
    "contributorOrganizationId" = current_setting('app.current_organization_id', true)::text
  );

-- Contributors can only INSERT/UPDATE their own attestations
CREATE POLICY "attestations_contributor_write" ON "Attestation"
  FOR INSERT
  WITH CHECK (
    "contributorOrganizationId" = current_setting('app.current_organization_id', true)::text
  );

CREATE POLICY "attestations_contributor_update" ON "Attestation"
  FOR UPDATE
  USING (
    "contributorOrganizationId" = current_setting('app.current_organization_id', true)::text
  );
```

### 13.3 Application-Level Tenant Scoping

The application layer enforces tenant isolation before queries reach the database:

```typescript
// ============================================================
// PRISMA CLIENT EXTENSION FOR TENANT SCOPING
// ============================================================

import { PrismaClient } from '@prisma/client';

// Create a tenant-scoped Prisma client
function createTenantScopedClient(organizationId: string): PrismaClient {
  const prisma = new PrismaClient().$extends({
    query: {
      // Automatically filter all queries by organizationId
      $allModels: {
        async findMany({ model, operation, args, query }) {
          // Add organizationId filter for tenant-scoped models
          if (TENANT_SCOPED_MODELS.includes(model)) {
            args.where = {
              ...args.where,
              organizationId: organizationId,
            };
          }
          return query(args);
        },

        async findUnique({ model, operation, args, query }) {
          const result = await query(args);
          // Verify result belongs to tenant
          if (result && TENANT_SCOPED_MODELS.includes(model)) {
            if (result.organizationId !== organizationId) {
              throw new ForbiddenError('Resource not accessible');
            }
          }
          return result;
        },

        async create({ model, operation, args, query }) {
          // Ensure organizationId is set correctly on create
          if (TENANT_SCOPED_MODELS.includes(model)) {
            args.data.organizationId = organizationId;
          }
          return query(args);
        },

        async update({ model, operation, args, query }) {
          // Verify ownership before update
          if (TENANT_SCOPED_MODELS.includes(model)) {
            args.where = {
              ...args.where,
              organizationId: organizationId,
            };
          }
          return query(args);
        },

        async delete({ model, operation, args, query }) {
          // Verify ownership before delete
          if (TENANT_SCOPED_MODELS.includes(model)) {
            args.where = {
              ...args.where,
              organizationId: organizationId,
            };
          }
          return query(args);
        },
      },
    },
  });

  return prisma;
}

const TENANT_SCOPED_MODELS = [
  'Product',
  'Passport',
  'Attestation',
  'ApiKey',
  'User',
  'OrganizationWallet',
  'EPCISEvent',
  'Batch',
  'Order',
];
```

**Request Middleware:**

```typescript
// ============================================================
// TENANT CONTEXT MIDDLEWARE
// ============================================================

import { AsyncLocalStorage } from 'async_hooks';

// Tenant context stored per-request
const tenantContext = new AsyncLocalStorage<{ organizationId: string }>();

// Middleware to set tenant context from authenticated user
export function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  const user = req.user; // From auth middleware

  if (!user?.organizationId) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Organization context required' },
    });
  }

  // Run request within tenant context
  tenantContext.run({ organizationId: user.organizationId }, () => {
    // Also set PostgreSQL session variable for RLS
    req.prisma.$executeRaw`SELECT set_config('app.current_organization_id', ${user.organizationId}, true)`;
    next();
  });
}

// Get current tenant context
export function getCurrentOrganizationId(): string {
  const context = tenantContext.getStore();
  if (!context?.organizationId) {
    throw new Error('Tenant context not set');
  }
  return context.organizationId;
}
```

### 13.4 EPCIS Event Tenant Isolation

EPCIS events require special handling because they may reference products across organizations in supply chain scenarios:

```
┌─────────────────────────────────────────────────────────────────┐
│                    EPCIS TENANT ISOLATION                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  HOSTED OPENEPCIS (Multi-tenant)                                │
│  ───────────────────────────────                                │
│  • All events have organization_id column                       │
│  • RLS policy enforces tenant isolation                         │
│  • Events cannot reference products from other orgs             │
│                                                                  │
│  CROSS-ORGANIZATION SUPPLY CHAIN:                               │
│  ─────────────────────────────────                              │
│  Each organization captures their OWN events:                   │
│                                                                  │
│  Supplier (Org A):                                              │
│  • ObjectEvent: "shipped batch to Manufacturer"                 │
│  • Stored in Org A's EPCIS partition                            │
│                                                                  │
│  Manufacturer (Org B):                                          │
│  • ObjectEvent: "received batch from Supplier"                  │
│  • Stored in Org B's EPCIS partition                            │
│                                                                  │
│  DPP aggregates from BOTH sources:                              │
│  • Query Org A's events (via API with permission)               │
│  • Query Org B's events (own events)                            │
│  • Or query external EPCIS (SAP, IBM) via credentials           │
│                                                                  │
│  DATA NEVER CROSSES TENANT BOUNDARIES IN OUR DB                 │
│  Supply chain visibility via:                                   │
│  • Explicit API permissions (contributor access)                │
│  • External EPCIS repository credentials                        │
│  • GS1 EPCIS network queries                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**EPCIS Event Schema with Tenant Isolation:**

```prisma
model EPCISEvent {
  id              String   @id @default(cuid())
  organizationId  String   // REQUIRED - tenant isolation
  organization    Organization @relation(fields: [organizationId], references: [id])

  // EPCIS 2.0 fields
  eventType       EPCISEventType
  eventTime       DateTime
  eventTimeZoneOffset String
  bizStep         String?
  disposition     String?
  readPoint       String?  // GLN
  bizLocation     String?  // GLN

  // Product reference (within same org only)
  productId       String?
  product         Product? @relation(fields: [productId], references: [id])

  // Event data (JSON-LD)
  eventData       Json

  createdAt       DateTime @default(now())

  // Indexes for efficient tenant-scoped queries
  @@index([organizationId])
  @@index([organizationId, eventTime])
  @@index([organizationId, productId])
}
```

**EPCIS Query Scoping:**

```typescript
// EPCIS queries are ALWAYS scoped to organization
async function queryEPCISEvents(
  organizationId: string,
  filters: EPCISQueryFilters
): Promise<EPCISEvent[]> {
  return prisma.ePCISEvent.findMany({
    where: {
      organizationId: organizationId, // MANDATORY - never omit
      eventTime: {
        gte: filters.eventTimeGte,
        lte: filters.eventTimeLte,
      },
      eventType: filters.eventType,
      bizStep: filters.bizStep,
    },
    orderBy: { eventTime: 'desc' },
    take: filters.limit ?? 100,
  });
}

// Cross-organization EPCIS access requires explicit permission
async function querySupplierEPCIS(
  myOrganizationId: string,
  supplierOrganizationId: string,
  productId: string
): Promise<EPCISEvent[]> {
  // 1. Verify supplier has granted access
  const permission = await prisma.supplierPermission.findFirst({
    where: {
      grantedByOrganizationId: supplierOrganizationId,
      grantedToOrganizationId: myOrganizationId,
      productId: productId,
      scope: 'epcis:read',
      status: 'ACTIVE',
    },
  });

  if (!permission) {
    throw new ForbiddenError('No EPCIS access granted by supplier');
  }

  // 2. Query supplier's events (with their permission token)
  return queryEPCISWithPermission(supplierOrganizationId, productId, permission);
}
```

### 13.5 Data Leakage Prevention

Multiple safeguards prevent accidental data exposure across tenants:

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA LEAKAGE PREVENTION                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. QUERY SAFEGUARDS                                            │
│  ───────────────────                                            │
│  • Never use raw SQL without organizationId filter              │
│  • Prisma extension adds filter automatically                   │
│  • Static analysis (ESLint rule) flags missing filters          │
│                                                                  │
│  2. API RESPONSE FILTERING                                      │
│  ─────────────────────────                                      │
│  • Response serializer checks organizationId                    │
│  • Strip internal IDs that could leak tenant info               │
│  • Normalize external references                                │
│                                                                  │
│  3. ERROR MESSAGES                                              │
│  ────────────────                                               │
│  • Generic "Resource not found" for cross-tenant access         │
│  • Don't reveal whether resource exists in another tenant       │
│  • Log details for audit, not in response                       │
│                                                                  │
│  4. PAGINATION SAFETY                                           │
│  ────────────────────                                           │
│  • Cursor-based pagination includes organizationId              │
│  • Prevent cursor manipulation to access other tenants          │
│  • Total counts scoped to tenant                                │
│                                                                  │
│  5. SEARCH & FILTERING                                          │
│  ─────────────────────                                          │
│  • Full-text search indexes partitioned by organization         │
│  • Filter suggestions scoped to tenant data only                │
│  • No cross-tenant search results                               │
│                                                                  │
│  6. FILE STORAGE                                                │
│  ────────────────                                               │
│  • S3 paths include organizationId: /org_{id}/products/...     │
│  • Pre-signed URLs scoped to organization prefix                │
│  • CloudFront signed cookies validate organization              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Query Safety Checks:**

```typescript
// ============================================================
// QUERY SAFETY UTILITIES
// ============================================================

// Validate that a query result belongs to the expected tenant
function assertTenantOwnership<T extends { organizationId: string }>(
  result: T | null,
  expectedOrganizationId: string,
  resourceType: string
): asserts result is T {
  if (!result) {
    throw new NotFoundError(`${resourceType} not found`);
  }

  if (result.organizationId !== expectedOrganizationId) {
    // Log security event - potential enumeration attempt
    securityLog.warn('Cross-tenant access attempt', {
      expectedOrganizationId,
      actualOrganizationId: result.organizationId,
      resourceType,
    });

    // Return same error as "not found" to prevent enumeration
    throw new NotFoundError(`${resourceType} not found`);
  }
}

// Safe ID lookup that prevents tenant enumeration
async function safeGetProduct(
  productId: string,
  organizationId: string
): Promise<Product> {
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      organizationId: organizationId, // Always include tenant filter
    },
  });

  if (!product) {
    // Don't reveal if product exists in another tenant
    throw new NotFoundError('Product not found');
  }

  return product;
}
```

### 13.6 Cross-Tenant Access Patterns

Some features require controlled cross-tenant access. These are explicitly designed:

| Pattern | Use Case | Security Control |
|---------|----------|------------------|
| **Contributor Access** | Supplier adds attestation to brand's product | Invitation token, scoped to specific product |
| **Retailer View** | Retailer views DPP for products they carry | Retailer organization linked, read-only access |
| **EPCIS Read** | Query supplier's supply chain events | Explicit permission grant, audit logged |
| **Public DPP** | Consumer scans QR code | Public endpoint, no auth, no tenant context |

**Contributor Access Implementation:**

```typescript
// Contributor (external org) adding attestation to another org's product
async function addContributorAttestation(
  contributorOrgId: string,  // The attestation issuer
  inviteToken: string,       // Proves permission to access product
  attestationData: AttestationInput
): Promise<Attestation> {
  // 1. Validate invitation token
  const invitation = await prisma.contributorInvitation.findUnique({
    where: { token: inviteToken },
  });

  if (!invitation || invitation.status !== 'PENDING') {
    throw new ForbiddenError('Invalid or expired invitation');
  }

  // 2. Verify contributor organization matches
  if (invitation.invitedOrganizationId !== contributorOrgId) {
    throw new ForbiddenError('Invitation not for this organization');
  }

  // 3. Create attestation with cross-org reference
  const attestation = await prisma.attestation.create({
    data: {
      productId: invitation.productId,
      contributorOrganizationId: contributorOrgId,  // Their org
      // productId belongs to different org - allowed via invitation
      ...attestationData,
    },
  });

  // 4. Log cross-tenant access
  await auditLog.record({
    action: 'attestation.create.cross_tenant',
    contributorOrgId,
    targetProductId: invitation.productId,
    invitationId: invitation.id,
  });

  return attestation;
}
```

### 13.7 Tenant Isolation Testing

Automated tests verify tenant isolation:

```typescript
// ============================================================
// TENANT ISOLATION TEST SUITE
// ============================================================

describe('Tenant Isolation', () => {
  let orgA: Organization;
  let orgB: Organization;
  let productA: Product;
  let productB: Product;

  beforeAll(async () => {
    orgA = await createTestOrganization('Org A');
    orgB = await createTestOrganization('Org B');
    productA = await createTestProduct(orgA.id, { name: 'Product A' });
    productB = await createTestProduct(orgB.id, { name: 'Product B' });
  });

  describe('Product Access', () => {
    it('should not allow Org A to read Org B products', async () => {
      const client = createTenantScopedClient(orgA.id);

      // Direct query should return null (not error - to prevent enumeration)
      const product = await client.product.findUnique({
        where: { id: productB.id },
      });
      expect(product).toBeNull();
    });

    it('should not allow Org A to update Org B products', async () => {
      const client = createTenantScopedClient(orgA.id);

      await expect(
        client.product.update({
          where: { id: productB.id },
          data: { name: 'Hacked' },
        })
      ).rejects.toThrow(); // Should fail silently (no matching records)
    });

    it('should not leak product existence across tenants', async () => {
      // API should return same 404 whether product exists in another tenant or doesn't exist at all
      const responseExistsOtherTenant = await api
        .get(`/api/v1/products/${productB.id}`)
        .auth(orgA.token);

      const responseNotExists = await api
        .get(`/api/v1/products/nonexistent_id`)
        .auth(orgA.token);

      expect(responseExistsOtherTenant.status).toBe(404);
      expect(responseNotExists.status).toBe(404);
      expect(responseExistsOtherTenant.body).toEqual(responseNotExists.body);
    });
  });

  describe('EPCIS Event Isolation', () => {
    it('should not allow cross-tenant EPCIS queries', async () => {
      // Create event in Org A
      await createEPCISEvent(orgA.id, { bizStep: 'shipping' });

      // Query from Org B should return empty
      const events = await queryEPCISEvents(orgB.id, {});
      expect(events).toHaveLength(0);
    });
  });

  describe('Attestation Cross-Tenant Access', () => {
    it('should allow attestation via invitation only', async () => {
      // Org B cannot attest to Org A product without invitation
      await expect(
        createAttestation(orgB.id, productA.id, { type: 'certification' })
      ).rejects.toThrow('Product not accessible');

      // Create invitation
      const invitation = await createContributorInvitation(
        orgA.id,
        productA.id,
        orgB.id
      );

      // Now Org B can attest
      const attestation = await addContributorAttestation(
        orgB.id,
        invitation.token,
        { type: 'certification', data: {} }
      );

      expect(attestation.contributorOrganizationId).toBe(orgB.id);
    });
  });

  describe('RLS Enforcement', () => {
    it('should enforce RLS even with raw queries', async () => {
      // Simulate bypassing Prisma extension with raw query
      // RLS should still protect data
      const results = await prisma.$queryRaw`
        SELECT * FROM "Product" WHERE id = ${productB.id}
      `;

      // With RLS enabled and context set to Org A, should return empty
      expect(results).toHaveLength(0);
    });
  });
});
```

### 13.8 Monitoring for Tenant Violations

Security monitoring detects potential tenant isolation breaches:

```typescript
// Security alerts for tenant isolation violations
const tenantSecurityAlerts = [
  {
    name: 'Cross-Tenant Access Attempt',
    condition: 'log.message contains "Cross-tenant access attempt"',
    action: 'Alert security team immediately',
    severity: 'high',
  },
  {
    name: 'RLS Policy Violation',
    condition: 'pg_stat_user_tables.rls_policy_violation > 0',
    action: 'Investigate query pattern, potential attack',
    severity: 'critical',
  },
  {
    name: 'Unusual Cross-Org Queries',
    condition: 'attestation.cross_tenant_count > 100 in 1h',
    action: 'Review contributor invitation patterns',
    severity: 'medium',
  },
  {
    name: 'Missing organizationId in Query',
    condition: 'log.query not contains "organizationId"',
    action: 'Code review, potential isolation bypass',
    severity: 'high',
  },
];
```

---

## 14. Multi-Tenant Security: Honest Limitations

While Section 13 describes the target architecture, this section documents **known limitations and risks** that must be understood.

### 14.1 Target Implementation Status

| Layer | Status | Notes |
|-------|--------|-------|
| Application Middleware | 📋 Planned | organizationId extracted from auth context |
| Prisma Client Extension | 📋 Planned | Auto-filters most queries |
| PostgreSQL RLS | 📋 Planned | To be enabled on core tables |
| API Response Filtering | 📋 Planned | Double-checks ownership |

### 14.2 Raw SQL Bypass Risk

**The Problem:** Prisma client extensions only intercept Prisma query methods. Raw SQL queries bypass tenant scoping entirely.

```typescript
// ❌ DANGEROUS: Raw SQL bypasses Prisma extension tenant filtering
const results = await prisma.$queryRaw`
  SELECT * FROM "Product" WHERE name LIKE '%widget%'
`;
// This returns ALL products across ALL tenants if RLS is not enabled

// ❌ ALSO DANGEROUS: $executeRaw, $queryRawUnsafe
await prisma.$executeRaw`UPDATE "Product" SET price = 0`;
```

**Current Mitigations:**
1. **Code review policy**: All raw SQL must include `organizationId` filter
2. **ESLint rule (planned)**: Flag raw queries without tenant filter
3. **RLS as backup**: Where enabled, blocks cross-tenant access even for raw queries

**Remaining Risk:**
- Tables without RLS enabled are vulnerable to raw SQL bypass
- Developers may add raw queries without understanding the risk
- ESLint rule is planned but not yet implemented

**What We're NOT Doing (and why it matters):**
- Not banning raw SQL entirely (needed for complex queries, migrations)
- Not using separate database schemas per tenant (adds operational complexity)
- Not using separate databases per tenant (would require Enterprise tier pricing)

### 14.3 RLS Implementation Gaps

**Target RLS Status:**

| Table | RLS Enabled | RLS Policies | Notes |
|-------|-------------|--------------|-------|
| Product | 📋 Planned | 📋 Planned | Full isolation |
| Passport | 📋 Planned | 📋 Planned | Via product relationship |
| Attestation | 📋 Planned | 📋 Planned | Cross-org via contributor |
| EPCISEvent | 📋 Planned | 📋 Planned | Direct org filter |
| ApiKey | 📋 Planned | 📋 Planned | Direct org filter |
| User | 📋 Planned | 📋 Planned | Users can span orgs (multi-org membership) |
| Batch | 📋 Planned | 📋 Planned | Requires org filter |
| Order | 📋 Planned | 📋 Planned | Requires org filter |
| AuditLog | ❌ N/A | ❌ N/A | Intentionally cross-tenant for platform ops |
| Subscription | ❌ N/A | ❌ N/A | Platform-level, not tenant-scoped |

**Why Not 100% RLS Coverage:**
- Some tables are platform-level (Subscription, AuditLog)
- User table has intentional multi-org membership
- RLS adds query overhead (~5-10% per query)
- Complex RLS policies can cause subtle bugs

### 14.4 Noisy Neighbor Risks

**The Problem:** All tenants share the same PostgreSQL cluster. One tenant's heavy queries affect all others.

**Current Architecture:**
```
┌──────────────────────────────────────────────────────────────┐
│  Single RDS Instance (db.r6g.large)                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Shared PostgreSQL                                      │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │ │
│  │  │ Org A   │ │ Org B   │ │ Org C   │ │ Org D   │ ...  │ │
│  │  │ tables  │ │ tables  │ │ tables  │ │ tables  │      │ │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │ │
│  │                                                         │ │
│  │  Shared: connection pool, CPU, memory, I/O              │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**Noisy Neighbor Scenarios:**

| Scenario | Impact | Current Mitigation |
|----------|--------|-------------------|
| Large export query | Blocks other queries, connection exhaustion | Query timeout (30s), pagination limits |
| Bulk import | I/O saturation, replication lag | Rate limiting, background queue |
| Runaway query | CPU spike, other tenants slow | Statement timeout, connection limits per org |
| Large tenant growth | Index bloat, vacuum delays | Monitoring, proactive maintenance |

**What We Cannot Prevent:**
- CPU contention during peak load (same instance)
- I/O bandwidth sharing (same EBS volume)
- Connection pool exhaustion (shared pool)
- Memory pressure from large queries

**Enterprise Tier Isolation:**
For customers with strict isolation requirements, Enterprise tier offers:
- Dedicated RDS instance (additional cost)
- Dedicated connection pool
- Separate backup schedule
- Option for separate AWS account

### 14.5 Encryption Key Separation

**Current Architecture (Shared Keys):**

```
┌──────────────────────────────────────────────────────────────┐
│  AWS KMS                                                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Single Customer Master Key (CMK)                       │ │
│  │  └── Encrypts ALL tenant data                          │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                               │
│  Data Encryption Keys (DEKs)                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Single DEK for database field encryption               │ │
│  │  Single DEK for S3 bucket encryption                    │ │
│  │  (AWS manages these, not per-tenant)                    │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                               │
│  Signing Keys (per-tenant) ✅                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Org A: Ed25519 keypair → did:key:z6Mk...              │ │
│  │  Org B: Ed25519 keypair → did:key:z6Mk...              │ │
│  │  (Managed by walt.id Custodian)                        │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**What This Means:**
- **Database encryption**: Same key encrypts all tenants' data at rest
- **S3 encryption**: Same key for all tenants' files
- **Signing keys**: ✅ Per-tenant (each org has own did:key)
- **API keys**: Hashed with shared SHA-256, not per-tenant key

**Implications:**
1. A compromised master key exposes ALL tenants' data
2. AWS KMS audit logs show key usage but not per-tenant
3. Cannot provide tenant-specific key rotation
4. Cannot provide tenant-controlled keys (BYOK)

**Why Not Per-Tenant Encryption Keys:**
- Significant engineering complexity
- Performance overhead (key lookup per query)
- Cost (KMS per-key charges)
- Operational burden (key rotation per tenant)

**Enterprise Tier Options:**
- Customer-managed KMS keys (BYOK)
- Dedicated KMS key per organization
- Client-side encryption option

### 14.6 Security Recommendations

Given these limitations, we recommend:

**For Startup/Growth Tier Customers:**
1. Understand shared infrastructure is cost-effective but not isolated
2. Don't store highly sensitive data beyond what's required for DPP
3. Review your data classification before onboarding

**For Scale Tier Customers:**
1. Consider upgrade to Enterprise if you have strict compliance requirements
2. Request dedicated connection pool allocation
3. Review query patterns for noisy neighbor potential

**For Enterprise Tier Customers:**
1. Deploy dedicated RDS instance
2. Request BYOK encryption setup
3. Consider dedicated infrastructure option
4. Request security architecture review

### 14.7 Roadmap: Security Improvements

| Improvement | Priority | Target |
|-------------|----------|--------|
| ESLint rule for raw SQL tenant filter | High | Q1 2026 |
| RLS on Batch table | Medium | Q1 2026 |
| RLS on Order table | Medium | Q1 2026 |
| Per-org connection pool limits | Medium | Q2 2026 |
| Per-tenant DEKs (Enterprise) | Low | Q3 2026 |
| BYOK option (Enterprise) | Low | Q3 2026 |

---

## Related Documentation

- [GDPR_COMPLIANCE.md](./GDPR_COMPLIANCE.md) - Data protection and privacy
- [DATA_SOVEREIGNTY.md](./DATA_SOVEREIGNTY.md) - Data ownership and portability
- [USER_MANAGEMENT.md](./USER_MANAGEMENT.md) - Roles and permissions
- [ARCHITECTURE_PORTABILITY.md](./ARCHITECTURE_PORTABILITY.md) - Infrastructure overview

---

*Last Updated: 2026-01-13*
