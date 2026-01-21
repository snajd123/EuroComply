# Security Design

**Status:** Draft
**Date:** 2026-01-15
**Source:** SECURITY.md + clarification session

---

## 1. Overview

EuroComply security is built on defense in depth, with Clerk handling authentication and workspace-based authorization controlling access.

### Security Principles

| Principle | Implementation |
|-----------|----------------|
| **Defense in Depth** | Multiple layers (network, application, data) |
| **Least Privilege** | Minimum necessary permissions |
| **Zero Trust** | Verify every request |
| **Data Minimization** | Collect only what's needed |
| **Secure by Default** | Safe defaults |

---

## 2. Authentication (Clerk)

### Why Clerk

| Concern | Clerk Provides |
|---------|----------------|
| **Auth complexity** | Handles magic links, passwords, SSO |
| **Session management** | Secure cookies, refresh tokens |
| **MFA** | Built-in TOTP, WebAuthn |
| **Compliance** | SOC 2, GDPR compliant |
| **Cost** | MAU-based pricing (why we have user limits) |

### Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION FLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  USER LOGIN                                                     │
│  ──────────                                                     │
│  1. User visits app.eurocomply.eu                              │
│  2. Clerk handles login (magic link, password, or SSO)         │
│  3. Clerk issues session token                                 │
│  4. EuroComply API validates token via Clerk SDK               │
│  5. API checks organization membership + workspace authorities │
│                                                                  │
│  SESSION MANAGEMENT                                             │
│  ──────────────────                                             │
│  • Clerk manages session tokens                                │
│  • HttpOnly, Secure cookies                                    │
│  • Automatic refresh                                           │
│  • Session revocation via Clerk dashboard                      │
│                                                                  │
│  SSO (Enterprise)                                               │
│  ────────────────                                               │
│  • SAML 2.0: Okta, Azure AD, OneLogin                         │
│  • OIDC: Google Workspace, Azure AD, Auth0                    │
│  • Configured per organization in Clerk                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Clerk + EuroComply Integration

```typescript
// API middleware
async function authenticateRequest(req: Request) {
  // 1. Verify Clerk session
  const clerkUser = await clerk.verifySession(req);
  if (!clerkUser) {
    throw new UnauthorizedError();
  }

  // 2. Get EuroComply user record (linked by Clerk user ID)
  const user = await db.user.findUnique({
    where: { clerkUserId: clerkUser.id },
    include: { organizationMemberships: true }
  });

  // 3. Attach to request context
  req.user = user;
  req.organizationId = user.currentOrganizationId;
}
```

---

## 3. Authorization

### Two-Level Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTHORIZATION MODEL                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  LEVEL 1: ORGANIZATION ADMIN                                    │
│  ───────────────────────────                                    │
│  isOrganizationAdmin: boolean                                   │
│                                                                  │
│  Can:                                                           │
│  • Invite/remove users                                         │
│  • Assign workspace authorities                                │
│  • Manage billing                                              │
│  • Organization settings                                       │
│  • API key management                                          │
│  • Export signing keys                                         │
│                                                                  │
│  LEVEL 2: WORKSPACE AUTHORITIES                                 │
│  ──────────────────────────────                                 │
│  Per workspace: Design, Operations, Marketing, Compliance       │
│                                                                  │
│  MANAGER  - Full CRUD, workspace settings, approve/publish     │
│  EDITOR   - Full CRUD, self-approve                            │
│  CONTRIBUTOR - Edit, submit for review                         │
│  VIEWER   - Read-only                                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Permission Matrix

| Action | Org Admin | MANAGER | EDITOR | CONTRIBUTOR | VIEWER |
|--------|:---------:|:-------:|:------:|:-----------:|:------:|
| View workspace data | * | ✅ | ✅ | ✅ | ✅ |
| Edit products | * | ✅ | ✅ | ✅ | ❌ |
| Approve/publish | * | ✅ | ✅ | ❌ | ❌ |
| Issue DPPs | * | ✅ (Compliance) | ❌ | ❌ | ❌ |
| Workspace settings | * | ✅ | ❌ | ❌ | ❌ |
| Invite users | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage billing | ✅ | ❌ | ❌ | ❌ | ❌ |
| API keys | ✅ | ❌ | ❌ | ❌ | ❌ |
| Export keys | ✅ | ❌ | ❌ | ❌ | ❌ |

*Org Admin permissions depend on their workspace authorities

### Authorization Check

```typescript
async function authorizeRequest(
  user: User,
  resource: Resource,
  action: Action
) {
  // 1. Verify resource belongs to user's organization
  if (resource.organizationId !== user.organizationId) {
    throw new ForbiddenError('Resource not accessible');
  }

  // 2. Check if action requires Org Admin
  if (ORG_ADMIN_ACTIONS.includes(action)) {
    if (!user.isOrganizationAdmin) {
      throw new ForbiddenError('Organization Admin required');
    }
    return;
  }

  // 3. Check workspace authority
  const workspace = getWorkspaceForResource(resource);
  const authority = user.workspaceAuthorities[workspace];

  if (!hasPermission(authority, action)) {
    throw new ForbiddenError('Insufficient permissions');
  }

  // 4. Audit log
  await auditLog.record({ user, resource, action });
}
```

---

## 4. API Key Security

### Key Format

```
ec_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6  (40 chars)
└─┴────┴─────────────────────────────────
  │   │              └── 16 random bytes (32 hex)
  │   └───────────────── Environment (live/test)
  └───────────────────── Prefix
```

### Key Storage

```
┌─────────────────────────────────────────────────────────────────┐
│                    API KEY SECURITY                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CREATION                                                       │
│  • Full key shown ONCE at creation                             │
│  • Database stores SHA-256(key) only                           │
│                                                                  │
│  VERIFICATION                                                   │
│  • Hash incoming key                                           │
│  • Compare to stored hash                                      │
│  • No plaintext comparison                                     │
│                                                                  │
│  SCOPES (Resource-based)                                       │
│  • products:read, products:write                               │
│  • passports:read, passports:write                             │
│  • attestations:read, attestations:write                       │
│                                                                  │
│  MANAGEMENT                                                     │
│  • Multiple active keys allowed (for rotation)                 │
│  • Revocation: immediate (hash deleted)                        │
│  • All operations logged to audit trail                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Data Encryption

### At Rest

| Data Type | Encryption | Key Management |
|-----------|------------|----------------|
| PostgreSQL | AES-256 | AWS KMS |
| DynamoDB | AES-256 | AWS KMS |
| S3/R2 | AES-256 | AWS KMS / Cloudflare |
| Signing keys | AES-256-GCM | Application KEK |

### In Transit

| Connection | Protocol | Notes |
|------------|----------|-------|
| Public endpoints | TLS 1.3 | HSTS enabled |
| Service-to-service | mTLS | Private CA |
| Database | SSL required | Certificate verification |

### Sensitive Fields

```typescript
const ENCRYPTED_FIELDS = [
  'organization.vatNumber',       // PII
  'user.email',                   // PII
  'signingKey.privateKeyJwk',     // Cryptographic material
];

// Envelope encryption: AWS KMS master key + per-org DEK
```

---

## 6. Signing Key Management

### Key Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                    KEY HIERARCHY                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ORGANIZATION SIGNING KEY (did:key)                             │
│  • Purpose: Sign DPPs (Verifiable Credentials)                 │
│  • Algorithm: Ed25519                                          │
│  • Storage: walt.id Custodian                                  │
│  • Rotation: NEVER (key IS the identity)                       │
│  • Export: Available to Org Admins                             │
│                                                                  │
│  USER SIGNING KEY (did:key)                                     │
│  • Purpose: Sign product version approvals                     │
│  • Algorithm: Ed25519                                          │
│  • Storage: walt.id Custodian                                  │
│  • Rotation: NEVER                                             │
│                                                                  │
│  JWT SIGNING KEY                                                │
│  • Purpose: Sign session tokens (if not using Clerk)           │
│  • Algorithm: ES256                                            │
│  • Rotation: 90 days (automatic)                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Compromise Response

```
┌─────────────────────────────────────────────────────────────────┐
│                    COMPROMISE RESPONSE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TIMELINE:                                                      │
│  < 15 min:  Disable compromised key                            │
│  < 30 min:  Bulk-revoke suspicious VCs via Status List         │
│  < 2 hours: Generate new keypair (NEW did:key identity)        │
│  < 24 hours: Re-issue affected DPPs with new key               │
│                                                                  │
│  PROCESS:                                                       │
│  1. Admin reports compromise                                   │
│  2. Old key disabled immediately                               │
│  3. Review VCs issued during suspicious window                 │
│  4. Revoke unauthorized VCs                                    │
│  5. Generate new identity (new did:key)                        │
│  6. Re-issue legitimate DPPs                                   │
│  7. Notify supply chain partners of new DID                    │
│                                                                  │
│  NOTE: New key = NEW identity. This is intentional.            │
│  Verifiers must learn to trust the new DID.                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Multi-Tenancy Security

### Schema Isolation

```
┌─────────────────────────────────────────────────────────────────┐
│                    TENANT ISOLATION                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PostgreSQL: Schema-per-tenant                                  │
│  ─────────────────────────────                                  │
│  • Each organization has dedicated schema                      │
│  • Connection sets search_path on auth                         │
│  • Cross-schema queries impossible                             │
│                                                                  │
│  DynamoDB: Partition key isolation                              │
│  ────────────────────────────────                               │
│  • organizationId in partition key                             │
│  • Query conditions enforced at SDK level                      │
│                                                                  │
│  R2/S3: Path-based isolation                                   │
│  ─────────────────────────────                                  │
│  • Bucket: eurocomply-dpp                                      │
│  • Path: /{organizationId}/{productId}/...                     │
│  • IAM prevents cross-org access                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7b. Database Access Control (Three-User Architecture)

EuroComply uses a three-user model for database access, implementing principle of least privilege:

### User Separation

| User | Authentication | Privileges | Used By |
|------|----------------|------------|---------|
| `eurocomply` | Password | Admin (rds_superuser) | Lambda during infrastructure deployment |
| `eurocomply_app` | IAM Token (15-min) | DML only (SELECT, INSERT, UPDATE, DELETE) | ECS Fargate at runtime |
| `eurocomply_migrate` | Password | Schema owner (full DDL + DML) | CI/CD for Prisma migrations |

### Security Benefits

```
┌─────────────────────────────────────────────────────────────────┐
│                  BLAST RADIUS CONTAINMENT                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  If ECS task is compromised:                                    │
│  ✗ Cannot DROP or ALTER tables                                  │
│  ✗ Cannot CREATE new tables                                     │
│  ✗ Cannot GRANT permissions                                     │
│  ✗ Cannot access other schemas                                  │
│  ✓ Can only read/write existing data                           │
│                                                                  │
│  IAM Token Benefits:                                            │
│  • Tokens expire in 15 minutes                                  │
│  • No static credentials in environment                         │
│  • Auto-refresh handled by application                          │
│  • CloudTrail logs all token generation                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### PostgreSQL 15+ Compatibility

The `eurocomply_migrate` user owns the `public` schema, which permanently fixes the PostgreSQL 15+ permission change where `CREATE` on public schema was revoked by default. Default privileges are set so tables created by `eurocomply_migrate` are automatically accessible to `eurocomply_app`.

---

## 8. Audit Logging

### What's Logged

| Category | Events |
|----------|--------|
| **Authentication** | Login, logout, failed attempts |
| **Authorization** | Permission checks, denials |
| **Data access** | Read, create, update, delete |
| **Admin actions** | User invite, role change, API key ops |
| **Signing** | VC issuance, revocation |
| **Export** | Key export, data export |

### Log Format

```typescript
interface AuditLogEntry {
  id: string;
  timestamp: Date;

  // Actor
  userId: string;
  organizationId: string;
  ipAddress: string;
  userAgent: string;

  // Action
  action: string;           // 'product.update', 'dpp.issue'
  resourceType: string;
  resourceId: string;

  // Context
  workspaceAuthority?: string;
  apiKeyId?: string;        // If API access

  // Outcome
  success: boolean;
  errorCode?: string;

  // Details
  changes?: object;         // Before/after for updates
}
```

### Retention

| Data | Retention | Reason |
|------|-----------|--------|
| Security events | 7 years | ESPR compliance |
| Data access | 2 years | Operational |
| Failed logins | 90 days | Security analysis |

---

## 9. Input Validation

### API Security

```typescript
// All endpoints validate input
const productSchema = z.object({
  name: z.string().min(1).max(255),
  gtin: z.string().regex(/^\d{8,14}$/),
  description: z.string().max(10000).optional(),
  attributes: z.record(z.unknown()),
});

// Rate limiting
const RATE_LIMITS = {
  'POST /api/v1/products': { window: '1m', max: 100 },
  'POST /api/v1/passports': { window: '1m', max: 50 },
  'POST /api/v1/auth/*': { window: '15m', max: 5 },
};
```

### OWASP Top 10 Mitigations

| Risk | Mitigation |
|------|------------|
| Injection | Parameterized queries, input validation |
| Broken Auth | Clerk handles auth |
| Sensitive Data | Encryption at rest/transit |
| XXE | JSON-only APIs |
| Broken Access | Workspace authority checks |
| Misconfig | Infrastructure as code, security headers |
| XSS | CSP headers, output encoding |
| Deserialization | JSON schema validation |
| Components | Automated dependency scanning |
| Logging | Comprehensive audit trail |

---

## 10. Changes from Original Document

| Aspect | Original | Design Decision |
|--------|----------|-----------------|
| **Authentication** | Custom magic link + password impl | Clerk handles all auth |
| **Session management** | Custom JWT cookies | Clerk session tokens |
| **RBAC terminology** | "ADMIN role" | Organization Admin + Workspace authorities |
| **Key rotation** | Mentioned for org keys | Confirmed: NO rotation for did:key |

---

## 11. Related Documents

| Document | Purpose |
|----------|---------|
| [User Management Design](./2026-01-15-user-management-design.md) | Org Admin, workspace authorities |
| [Architecture Design](./2026-01-15-architecture-design.md) | Clerk + walt.id integration |
| [Verifiable Credentials Design](./2026-01-15-verifiable-credentials-design.md) | Key management, compromise response |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-01-15 | Initial draft - Clerk auth, updated RBAC terminology |

