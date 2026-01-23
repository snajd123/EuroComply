# Security Design

**Status:** Active
**Last Updated:** 2026-01-23

---

## 1. Overview

EuroComply security is built on defense in depth, with ZITADEL handling authentication and workspace-based authorization controlling access.

### Security Principles

| Principle | Implementation |
|-----------|----------------|
| **Defense in Depth** | Multiple layers (network, application, data) |
| **Least Privilege** | Minimum necessary permissions |
| **Zero Trust** | Verify every request |
| **Data Minimization** | Collect only what's needed |
| **Secure by Default** | Safe defaults |

---

## 2. Authentication (ZITADEL)

### Why ZITADEL

| Concern | ZITADEL Provides |
|---------|------------------|
| **Data sovereignty** | Swiss-based, EU data hosting |
| **Transparency** | Open source core |
| **Organizations** | Built-in organizations with per-org SSO |
| **Compliance** | GDPR compliant, SOC 2 Type II |
| **Cost** | Transparent pricing |

### Authentication Flow

```
USER LOGIN
1. User visits app.eurocomply.eu
2. ZITADEL handles login (magic link, password, passkeys, SSO)
3. ZITADEL issues OIDC tokens with custom claims
4. EuroComply API validates token via JWKS verification
5. Middleware reads schema_name from JWT (no DB lookup)

SESSION MANAGEMENT
- ZITADEL manages sessions
- HttpOnly, Secure cookies
- Automatic refresh
- Session revocation via ZITADEL Console

SSO (Enterprise)
- SAML 2.0: Okta, Azure AD, OneLogin
- OIDC: Google Workspace, Azure AD, Auth0
- Configured per organization in ZITADEL
```

### Organization Creation Control

Organization creation is restricted to ZITADEL Actions v2 webhooks only:
- No public API endpoint for creating organizations
- Prevents unauthorized tenant creation
- All organizations tied to ZITADEL identity
- Webhook signature verification required

### Session Token Structure

ZITADEL OIDC token includes tenant context to avoid database lookups:

```typescript
// ZITADEL OIDC token with custom claims (via Actions)
{
  "sub": "user_abc123",
  "urn:zitadel:iam:org:id": "org_def456",
  "urn:eurocomply:schema_name": "tenant_acme",
  "urn:eurocomply:tier": "growth",
  "urn:eurocomply:cell_id": "cell_1"
}
```

### API Request Flow

```typescript
// apps/api/src/middleware/auth.middleware.ts
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.ZITADEL_INSTANCE_URL}/.well-known/jwks.json`)
);

export async function authMiddleware(c: Context, next: Next) {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    throw new HTTPException(401, { message: 'Missing authorization' });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: process.env.ZITADEL_INSTANCE_URL,
      audience: process.env.ZITADEL_CLIENT_ID,
    });

    c.set('userId', payload.sub);
    c.set('organizationId', payload['urn:zitadel:iam:org:id']);
    c.set('claims', payload);

    await next();
  } catch (error) {
    throw new HTTPException(401, { message: 'Invalid token' });
  }
}
```

---

## 3. Authorization

### Two-Level Model

```
LEVEL 1: ORGANIZATION ADMIN
  isOrgAdmin: boolean

  Can:
  - Invite/remove users
  - Assign workspace authorities
  - Manage billing
  - Organization settings
  - API key management
  - Export signing keys

LEVEL 2: WORKSPACE AUTHORITIES
  Per workspace: Design, Operations, Marketing, Compliance

  MANAGER     - Full CRUD, workspace settings, approve/publish
  EDITOR      - Full CRUD, self-approve
  CONTRIBUTOR - Edit, submit for review
  VIEWER      - Read-only
```

### Permission Matrix

| Action | Org Admin | MANAGER | EDITOR | CONTRIBUTOR | VIEWER |
|--------|:---------:|:-------:|:------:|:-----------:|:------:|
| View workspace data | * | Yes | Yes | Yes | Yes |
| Edit products | * | Yes | Yes | Yes | No |
| Approve/publish | * | Yes | Yes | No | No |
| Issue DPPs | * | Yes (Compliance) | No | No | No |
| Workspace settings | * | Yes | No | No | No |
| Invite users | Yes | No | No | No | No |
| Manage billing | Yes | No | No | No | No |
| API keys | Yes | No | No | No | No |
| Export keys | Yes | No | No | No | No |

**Regulatory Advisor Permissions:**

| Action | Org Admin | Compliance MANAGER | Compliance EDITOR | Other Workspace |
|--------|:---------:|:------------------:|:-----------------:|:---------------:|
| View rules & findings | Yes | Yes | Yes | Yes (view only) |
| Adopt templates from Marketplace | Yes | Yes | No | No |
| Edit Readiness Profiles | Yes | Yes | No | No |
| Configure rule overrides | Yes | Yes | No | No |
| Assign profiles to products | Yes | Yes | No | No |
| Acknowledge deviation (bypass soft gate) | Yes | Yes | Yes | Yes (own workspace) |
| Manage Reason Codes | Yes | Yes | No | No |
| Publish to Marketplace | Yes | Yes | No | No |

> **Governance Note:** The **Compliance Workspace** is the sole control center for rule governance.
> Rule override configuration (`ReadinessProfileRule.overrideMode`) is restricted to **Compliance MANAGER**
> to maintain Forensic Seal integrity. Design and Operations workspaces have read-only compliance views -
> they can see status and acknowledge deviations but cannot change profiles or rule configurations.
> See [Regulatory Advisor](./13-regulatory-advisor.md) Section 3 for full governance model.

*Org Admin permissions depend on their workspace authorities

### Authorization Middleware

```typescript
// apps/api/src/middleware/authorize.middleware.ts
import { EntityManager } from '@mikro-orm/postgresql';
import { OrganizationUser, WorkspaceAuthority } from '@eurocomply/db';

type Workspace = 'design' | 'operations' | 'marketing' | 'compliance';
type Action = 'view' | 'edit' | 'approve' | 'manage';

const AUTHORITY_LEVELS: Record<WorkspaceAuthority, number> = {
  [WorkspaceAuthority.VIEWER]: 1,
  [WorkspaceAuthority.CONTRIBUTOR]: 2,
  [WorkspaceAuthority.EDITOR]: 3,
  [WorkspaceAuthority.MANAGER]: 4,
};

const ACTION_REQUIREMENTS: Record<Action, number> = {
  view: 1,      // VIEWER+
  edit: 2,      // CONTRIBUTOR+
  approve: 3,   // EDITOR+
  manage: 4,    // MANAGER only
};

export function authorize(workspace: Workspace, action: Action) {
  return async (c: Context, next: Next) => {
    const em: EntityManager = c.get('em');
    const userId = c.get('userId');

    // Get user's membership in this tenant
    const membership = await em.findOne(OrganizationUser, {
      user: { zitadelId: userId }
    });

    if (!membership) {
      throw new HTTPException(403, { message: 'Not a member of this organization' });
    }

    // Check workspace authority
    const authorityKey = `${workspace}Authority` as keyof OrganizationUser;
    const userAuthority = membership[authorityKey] as WorkspaceAuthority;
    const userLevel = AUTHORITY_LEVELS[userAuthority];
    const requiredLevel = ACTION_REQUIREMENTS[action];

    if (userLevel < requiredLevel) {
      throw new HTTPException(403, {
        message: `Requires ${action} permission in ${workspace} workspace`
      });
    }

    c.set('membership', membership);
    await next();
  };
}

// Usage in routes
app.get('/products', authorize('design', 'view'), getProducts);
app.post('/products', authorize('design', 'edit'), createProduct);
app.post('/products/:id/release', authorize('design', 'approve'), releaseProduct);
```

### Org Admin Check

```typescript
export function requireOrgAdmin() {
  return async (c: Context, next: Next) => {
    const em: EntityManager = c.get('em');
    const userId = c.get('userId');

    const membership = await em.findOne(OrganizationUser, {
      user: { zitadelId: userId }
    });

    if (!membership?.isOrgAdmin) {
      throw new HTTPException(403, { message: 'Organization Admin required' });
    }

    await next();
  };
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
CREATION
- Full key shown ONCE at creation
- Database stores SHA-256(key) only

VERIFICATION
- Hash incoming key
- Compare to stored hash
- No plaintext comparison

SCOPES (Resource-based)
- products:read, products:write
- passports:read, passports:write
- attestations:read, attestations:write

MANAGEMENT
- Multiple active keys allowed (for rotation)
- Revocation: immediate (hash deleted)
- All operations logged to audit trail
```

### API Key Entity

```typescript
@Entity({ tableName: 'api_keys' })
export class ApiKey {
  @PrimaryKey()
  id!: string;

  @Property()
  name!: string;

  @Property({ name: 'key_hash' })
  keyHash!: string;  // SHA-256 hash

  @Property({ name: 'key_prefix' })
  keyPrefix!: string;  // First 8 chars for identification

  @Property({ type: 'array' })
  scopes!: string[];

  @Property({ name: 'last_used_at', nullable: true })
  lastUsedAt?: Date;

  @Property({ name: 'expires_at', nullable: true })
  expiresAt?: Date;

  @Property({ name: 'revoked_at', nullable: true })
  revokedAt?: Date;

  @ManyToOne(() => User, { name: 'created_by' })
  createdBy!: User;

  @Property({ name: 'created_at' })
  createdAt: Date = new Date();
}
```

---

## 5. Data Encryption

### At Rest

| Data Type | Encryption | Key Management |
|-----------|------------|----------------|
| PostgreSQL | AES-256 | AWS RDS encryption |
| DynamoDB | AES-256 | AWS KMS |
| R2 | AES-256 | Cloudflare managed |
| Signing keys | AES-256-GCM | Per-tenant KMS DEK |

### In Transit

| Connection | Protocol | Notes |
|------------|----------|-------|
| Public endpoints | TLS 1.3 | HSTS enabled |
| Service-to-service | mTLS | Private CA |
| Database | SSL required | Certificate verification |

### Sensitive Field Encryption

```typescript
// Per-tenant envelope encryption
const ENCRYPTED_FIELDS = [
  'signingKey.privateKeyJwk',  // Cryptographic material
  'apiKey.keyHash',            // Already hashed, but encrypted at rest
];

// Encryption flow
// 1. AWS KMS generates master key per cell
// 2. Master key generates DEK per tenant
// 3. DEK encrypts sensitive fields
// 4. DEK is encrypted with master key and stored alongside data
```

---

## 6. Signing Key Management

### Key Hierarchy

```
ORGANIZATION SIGNING KEY (did:key)
- Purpose: Sign DPPs (Verifiable Credentials)
- Algorithm: Ed25519
- Storage: walt.id Custodian
- Rotation: NEVER (key IS the identity)
- Export: Available to Org Admins

USER SIGNING KEY (did:key)
- Purpose: Sign product version approvals
- Algorithm: Ed25519
- Storage: walt.id Custodian
- Rotation: NEVER

JWT SIGNING KEY
- Purpose: Sign session tokens (handled by ZITADEL)
- Rotation: Managed by ZITADEL
```

### Key Compromise Response

```
TIMELINE:
< 15 min:  Disable compromised key
< 30 min:  Bulk-revoke suspicious VCs via Status List
< 2 hours: Generate new keypair (NEW did:key identity)
< 24 hours: Re-issue affected DPPs with new key

PROCESS:
1. Admin reports compromise
2. Old key disabled immediately
3. Review VCs issued during suspicious window
4. Revoke unauthorized VCs
5. Generate new identity (new did:key)
6. Re-issue legitimate DPPs
7. Notify supply chain partners of new DID

NOTE: New key = NEW identity. This is intentional.
Verifiers must learn to trust the new DID.
```

---

## 7. Multi-Tenancy Security

### Schema Isolation

```
PostgreSQL: Schema-per-tenant
- Each organization has dedicated schema
- Connection sets search_path from JWT
- Cross-schema queries impossible

DynamoDB: Partition key isolation
- organizationId in partition key (for shared tables)
- Query conditions enforced at SDK level

R2/S3: Path-based isolation
- Bucket: eurocomply-dpp
- Path: /{organizationId}/{productId}/...
- Worker validates tenant context
```

### Tenant Context Enforcement

```typescript
// All tenant data access goes through tenant-scoped EntityManager
// There is NO way to query across tenants

// Correct: Tenant-scoped query
const em = c.get('em');  // Already scoped to tenant_{slug}
const products = await em.find(Product, {});  // Only this tenant's products

// Impossible: Cross-tenant query
// The EntityManager has search_path set - other schemas don't exist in its view
```

### Security Tests

```typescript
describe('Tenant Isolation', () => {
  it('tenant A cannot see tenant B data', async () => {
    // Create product in tenant A
    const emA = orm.em.fork({ schema: 'tenant_a' });
    await emA.persistAndFlush(emA.create(Product, { name: 'Secret A' }));

    // Query from tenant B
    const emB = orm.em.fork({ schema: 'tenant_b' });
    const products = await emB.find(Product, {});

    // Tenant B sees nothing
    expect(products).toHaveLength(0);
  });

  it('raw SQL respects schema boundary', async () => {
    const emA = orm.em.fork({ schema: 'tenant_a' });

    // This query only sees tenant_a.products
    const result = await emA.execute('SELECT * FROM products');
    // Cannot access tenant_b.products
  });
});
```

---

## 8. Database Access Control

### Three-User Architecture

| User | Authentication | Privileges | Used By |
|------|----------------|------------|---------|
| `eurocomply` | Password | Admin (rds_superuser) | Infrastructure Lambda |
| `eurocomply_app` | IAM Token (15-min) | DML only | ECS Fargate runtime |
| `eurocomply_migrate` | Password | Schema owner (DDL + DML) | CI/CD migrations |

### Blast Radius Containment

```
If ECS task is compromised:
  ✗ Cannot DROP or ALTER tables
  ✗ Cannot CREATE new tables
  ✗ Cannot GRANT permissions
  ✗ Cannot access other schemas
  ✓ Can only read/write existing data in current tenant

IAM Token Benefits:
  - Tokens expire in 15 minutes
  - No static credentials in environment
  - Auto-refresh handled by application
  - CloudTrail logs all token generation
```

### Application Connection

```typescript
// packages/db/src/connection.ts
import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';

// IAM authentication for eurocomply_app
async function getIamToken(): Promise<string> {
  const signer = new Signer({
    hostname: process.env.DB_HOST,
    port: 5432,
    username: 'eurocomply_app',
    credentials: fromNodeProviderChain(),
    region: process.env.AWS_REGION,
  });

  return signer.getAuthToken();
}

// MikroORM connection with IAM token
const orm = await MikroORM.init({
  ...config,
  password: await getIamToken(),
  // Token refreshed every 10 minutes
});
```

---

## 9. Audit Logging

### What's Logged

| Category | Events |
|----------|--------|
| **Authentication** | Login, logout, failed attempts |
| **Authorization** | Permission checks, denials |
| **Data access** | Read, create, update, delete |
| **Admin actions** | User invite, role change, API key ops |
| **Signing** | VC issuance, revocation |
| **Export** | Key export, data export |

### Audit Log Service

```typescript
// apps/api/src/services/audit.service.ts
import { EntityManager } from '@mikro-orm/postgresql';
import { AuditLog } from '@eurocomply/db';
import { createId } from '@paralleldrive/cuid2';

export class AuditService {
  constructor(private em: EntityManager) {}

  async log(params: {
    userId?: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    changes?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    const entry = this.em.create(AuditLog, {
      id: createId(),
      ...params,
    });
    await this.em.persistAndFlush(entry);
  }
}

// Usage in service
async updateProduct(id: string, data: UpdateProductInput) {
  const product = await this.em.findOneOrFail(Product, { id });
  const oldValues = { name: product.name, description: product.description };

  wrap(product).assign(data);
  await this.em.flush();

  await this.audit.log({
    userId: this.userId,
    action: 'product.update',
    resourceType: 'Product',
    resourceId: id,
    changes: { before: oldValues, after: data },
  });

  return product;
}
```

### Retention

| Data | Retention | Reason |
|------|-----------|--------|
| Security events | 7 years | ESPR compliance |
| Data access | 2 years | Operational |
| Failed logins | 90 days | Security analysis |

---

## 10. Input Validation

### API Security

```typescript
import { z } from 'zod';

// All endpoints validate input with Zod schemas
const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  productType: z.enum(['FINISHED_GOOD', 'RAW_MATERIAL', 'COMPONENT', 'VARIANT']).optional(),
  description: z.string().max(10000).optional(),
});

const gtinSchema = z.string().regex(/^\d{8,14}$/, 'Invalid GTIN format');
```

### Rate Limiting

```typescript
// apps/api/src/middleware/rate-limit.middleware.ts
const RATE_LIMITS: Record<string, { window: string; max: number }> = {
  'POST /api/v1/products': { window: '1m', max: 100 },
  'POST /api/v1/passports': { window: '1m', max: 50 },
  'POST /api/v1/auth/*': { window: '15m', max: 5 },
  'GET /api/v1/*': { window: '1m', max: 1000 },
};
```

### OWASP Top 10 Mitigations

| Risk | Mitigation |
|------|------------|
| Injection | Parameterized queries (MikroORM), input validation |
| Broken Auth | ZITADEL handles auth |
| Sensitive Data | Encryption at rest/transit |
| XXE | JSON-only APIs |
| Broken Access | Workspace authority checks, schema isolation |
| Misconfig | Infrastructure as code, security headers |
| XSS | CSP headers, output encoding |
| Deserialization | JSON schema validation (Zod) |
| Components | Automated dependency scanning |
| Logging | Comprehensive audit trail |

---

## 11. Security Headers

```typescript
// apps/api/src/middleware/security-headers.middleware.ts
export function securityHeaders() {
  return async (c: Context, next: Next) => {
    await next();

    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('X-XSS-Protection', '1; mode=block');
    c.header('Content-Security-Policy', "default-src 'self'");
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  };
}
```

---

## Related Documents

| Document | Purpose |
|----------|---------|
| [Architecture](./01-architecture.md) | Multi-tenancy, JWT context |
| [Data Model](./02-data-model.md) | Entity definitions |
| [Verifiable Credentials](./09-verifiable-credentials.md) | Key management details |
| [Infrastructure](./11-infrastructure.md) | Network security |
| [Regulatory Advisor](./13-regulatory-advisor.md) | Forensic seal access control |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 2.2 | 2026-01-23 | Migrated authentication from Clerk to ZITADEL Cloud EU |
| 2.1 | 2026-01-21 | Added Regulatory Advisor permissions table; Compliance MANAGER authority for rule overrides |
| 2.0 | 2026-01-21 | Rewritten for MikroORM, JWT-based tenant context, updated auth flow |
