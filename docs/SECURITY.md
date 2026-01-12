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

EuroComply uses passwordless authentication via magic links:

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
│  3. Email sent with: https://app.eurocomply.eu/auth?token=...  │
│  4. User clicks link                                           │
│  5. Server:                                                    │
│     • Hashes received token                                    │
│     • Compares to stored hash                                  │
│     • Checks expiry                                            │
│     • Issues session (JWT in HttpOnly cookie)                  │
│  6. Stored token hash deleted                                  │
│                                                                  │
│  SECURITY PROPERTIES                                            │
│  ─────────────────────                                          │
│  • Token never stored in DB (only hash)                        │
│  • Single-use (deleted after verification)                     │
│  • Short expiry (15 minutes)                                   │
│  • Rate-limited (5 requests per email per hour)                │
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
| OpenAI | AI import | DPA in place |

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

## Related Documentation

- [GDPR_COMPLIANCE.md](./GDPR_COMPLIANCE.md) - Data protection and privacy
- [DATA_SOVEREIGNTY.md](./DATA_SOVEREIGNTY.md) - Data ownership and portability
- [USER_MANAGEMENT.md](./USER_MANAGEMENT.md) - Roles and permissions
- [ARCHITECTURE_PORTABILITY.md](./ARCHITECTURE_PORTABILITY.md) - Infrastructure overview

---

*Last Updated: 2026-01-12*
