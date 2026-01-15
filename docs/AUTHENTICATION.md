# Authentication & Authorization

**Version:** 1.0
**Status:** Active
**Last Updated:** 2026-01-14

---

## Table of Contents

1. [Overview](#1-overview)
2. [Authentication Methods](#2-authentication-methods)
3. [Authorization Model](#3-authorization-model)
4. [Role Hierarchy](#4-role-hierarchy)
5. [Workspace Access Control](#5-workspace-access-control)
6. [Permission Matrices](#6-permission-matrices)
7. [API Scopes](#7-api-scopes)
8. [JWT Token Structure](#8-jwt-token-structure)
9. [Session Management](#9-session-management)
10. [Security Policies](#10-security-policies)
11. [Implementation Guide](#11-implementation-guide)

---

## 1. Overview

EuroComply implements a comprehensive authentication and authorization system with the following principles:

- **Multi-tenancy**: Every user belongs to exactly one organization
- **Workspace-based access**: Users have granular permissions per workspace
- **Role hierarchy**: Five levels of authority within each workspace
- **Scope-based API access**: API keys have limited scopes for security
- **Audit trail**: All authentication and authorization events are logged

### Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  AUTHENTICATION & AUTHORIZATION                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  LAYER 1: AUTHENTICATION                                        │
│  ───────────────────────                                        │
│  • Who are you?                                                 │
│  • Methods: JWT (users), API Key (machines), OAuth (integrations)│
│  • Verification: Password hash, API key hash, OAuth token       │
│                                                                  │
│  LAYER 2: TENANT ISOLATION                                      │
│  ─────────────────────                                          │
│  • Which organization do you belong to?                         │
│  • Enforced at: Connection pool, schema context, RLS            │
│  • Guarantee: Users cannot access other org data               │
│                                                                  │
│  LAYER 3: AUTHORIZATION                                         │
│  ──────────────────────                                         │
│  • What can you do?                                             │
│  • Workspace-based: Different roles per workspace              │
│  • Resource-level: Ownership checks on every request           │
│  • Scope-based: API keys limited to specific operations        │
│                                                                  │
│  LAYER 4: AUDIT                                                 │
│  ──────────────                                                 │
│  • Log all access attempts (success and failure)                │
│  • Track permission changes                                     │
│  • Chain of custody for product edits                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Authentication Methods

EuroComply supports multiple authentication methods:

| Method | Use Case | Security Level |
|--------|----------|----------------|
| **Magic Links** | Primary user login (recommended) | High - no password to steal |
| **Password** | Alternative for users who prefer it | Standard - requires strong password |
| **SSO (SAML/OIDC)** | Enterprise customers | Highest - delegated to IdP |
| **API Keys** | Machine-to-machine integrations | High - scoped, rotatable |

### 2.1 User Authentication (Magic Links + Password)

**Used for:** Dashboard users (designers, managers, compliance officers)

Users can authenticate via **magic link** (recommended) or **password** - both methods produce the same JWT tokens.

| Property | Value |
|----------|-------|
| Algorithm | RS256 (RSA with SHA-256) |
| Token Lifetime | 1 hour (access token) |
| Refresh Token | 30 days |
| Issuer | `https://api.eurocomply.eu` |
| Storage | HttpOnly cookie (web), secure storage (mobile) |

#### Option A: Magic Link Authentication (Recommended)

```
┌─────────────────────────────────────────────────────────────────┐
│                    MAGIC LINK AUTHENTICATION                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. USER REQUESTS MAGIC LINK                                    │
│     POST /api/v1/auth/magic-link                                │
│     { email }                                                    │
│                                                                  │
│  2. SERVER GENERATES                                            │
│     • Random token (32 bytes, crypto-secure)                   │
│     • Token hash (SHA-256, stored in DB)                       │
│     • Expiry (15 minutes)                                      │
│                                                                  │
│  3. EMAIL SENT                                                  │
│     Link: https://app.eurocomply.eu/auth/verify?token=...      │
│                                                                  │
│  4. USER CLICKS LINK                                            │
│     • Landing page extracts token from URL                     │
│     • URL immediately cleared (history.replaceState)           │
│     • Client POSTs token to /api/v1/auth/verify                │
│                                                                  │
│  5. SERVER VALIDATES                                            │
│     • Hash incoming token, compare to stored hash              │
│     • Check expiry (15 min)                                    │
│     • One-time use (delete after verification)                 │
│     • Check account status (active, suspended, locked)         │
│                                                                  │
│  6. GENERATE JWT TOKENS (same as password flow)                │
│     → Access token (1 hour)                                    │
│     → Refresh token (30 days)                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Why Magic Links are Recommended:**
- No password to steal via phishing or data breach
- No password reset flow needed
- Works across all devices (email is universal)
- Simpler UX for occasional users

**Magic Link Security:**
- Tokens are 32 bytes (256-bit entropy)
- Single-use (deleted after verification)
- 15-minute expiry
- POST-based verification (not GET) to prevent leakage
- URL cleared immediately to prevent history/referrer leaks

#### Option B: Password Authentication

```
┌─────────────────────────────────────────────────────────────────┐
│                     PASSWORD AUTHENTICATION                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. USER LOGIN                                                  │
│     POST /api/v1/auth/login                                     │
│     { email, password }                                         │
│                                                                  │
│  2. SERVER VALIDATES                                            │
│     • Lookup user by email                                      │
│     • Verify password (bcrypt, min 12 rounds)                   │
│     • Check account status (active, suspended, locked)          │
│     • Rate limit: 5 attempts per 15 minutes per email          │
│                                                                  │
│  3. GENERATE JWT TOKENS (same as magic link flow)              │
│     → Access token (1 hour)                                    │
│     → Refresh token (30 days)                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Password Requirements:**
- Minimum 12 characters
- At least one uppercase, lowercase, number, and special character
- Not in common password lists (Have I Been Pwned check)
- Bcrypt with minimum 12 rounds (adaptive)

**Password Reset Flow:**
```
POST /api/v1/auth/forgot-password  { email }
→ Sends reset link (same mechanism as magic link)
→ Reset link expires in 1 hour

POST /api/v1/auth/reset-password   { token, newPassword }
→ Validates token, updates password
→ Invalidates all existing sessions
```

#### JWT Token Structure (Both Methods)

Both magic link and password authentication produce identical JWT tokens:

```
┌─────────────────────────────────────────────────────────────────┐
│                        JWT TOKENS                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Access Token (1 hour):                                         │
│  {                                                               │
│    sub: user.id,                                                │
│    org: user.organizationId,                                    │
│    workspaces: { design: "EDITOR", compliance: "VIEWER" },      │
│    admin: true/false,                                           │
│    authMethod: "magic_link" | "password" | "sso",               │
│    exp: now + 1 hour                                            │
│  }                                                               │
│                                                                  │
│  Refresh Token (30 days):                                       │
│  {                                                               │
│    sub: user.id,                                                │
│    jti: unique_token_id,                                        │
│    exp: now + 30 days                                           │
│  }                                                               │
│                                                                  │
│  DELIVERY                                                       │
│  ────────                                                       │
│  Set-Cookie: access_token=...; HttpOnly; Secure; SameSite=Lax  │
│  Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Lax │
│                                                                  │
│  REFRESH                                                        │
│  ───────                                                        │
│  POST /api/v1/auth/refresh                                      │
│  Uses refresh_token cookie → issues new access_token           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 API Keys (Machine-to-Machine)

**Used for:** Integrations, automation, CI/CD, webhooks

| Property | Value |
|----------|-------|
| Format | `ec_live_<32 chars>` (production), `ec_test_<32 chars>` (testing) |
| Storage | SHA-256 hash in database |
| Scopes | Limited to specific operations (see §7) |
| Rotation | Recommended every 90 days |
| Limit | 10 active keys per organization |

**API Key Structure:**

```
ec_live_a3f9d2c8b1e5f6a7c9d0e1f2a3b4c5d6

│  │    │
│  │    └── 32 random characters (hex)
│  │
│  └── Environment: "live" or "test"
│
└── Prefix: "ec_" (EuroComply)
```

**API Key Authentication Flow:**

```
1. Generate API Key
   POST /api/v1/api-keys
   { name: "Shopify Integration", scopes: ["products:read", "products:write"] }

   Returns: { key: "ec_live_...", scopes: [...] }
   ⚠️ Key shown only once - store securely

2. Use API Key
   GET /api/v1/products
   Authorization: Bearer ec_live_a3f9d2c8b1e5f6a7c9d0e1f2a3b4c5d6

3. Server Validates
   • Extract key from Authorization header
   • Hash key with SHA-256
   • Lookup in api_keys table by hash
   • Verify:
     - Key is active (not revoked)
     - Organization is active
     - Request scope is in allowed scopes
     - Rate limit not exceeded
```

**API Key Scopes** (see §7 for full list):
- `products:read` - Read product data
- `products:write` - Create/update products
- `passports:read` - Read issued DPPs
- `passports:issue` - Issue new DPPs (requires MANAGER+ role)

### 2.3 OAuth 2.0 (Third-Party Integrations)

**Used for:** Shopify, future marketplace integrations

| Property | Value |
|----------|-------|
| Grant Type | Authorization Code with PKCE |
| Access Token Lifetime | 1 hour |
| Refresh Token Lifetime | 90 days |
| Supported Providers | Shopify (v2024-01) |

**OAuth Flow** (example: Shopify):

```
1. User clicks "Connect Shopify" in EuroComply dashboard

2. Redirect to Shopify
   https://myshop.myshopify.com/admin/oauth/authorize?
     client_id=<eurocomply_app_id>
     &scope=read_products,write_products
     &redirect_uri=https://app.eurocomply.eu/integrations/shopify/callback
     &state=<csrf_token>

3. User approves in Shopify

4. Shopify redirects back
   https://app.eurocomply.eu/integrations/shopify/callback?
     code=<auth_code>
     &shop=myshop.myshopify.com
     &state=<csrf_token>

5. Exchange code for token
   POST https://myshop.myshopify.com/admin/oauth/access_token
   { client_id, client_secret, code }

   Returns: { access_token, scope }

6. Store token encrypted
   • Encrypt with organization-specific DEK (Data Encryption Key)
   • Store in integrations table
   • Use for API requests to Shopify
```

---

## 3. Authorization Model

EuroComply uses **workspace-based role authorization** with the following principles:

1. **Workspace Independence**: Users have different authority levels per workspace
2. **Least Privilege**: Grant minimum permissions needed for job function
3. **Explicit Grant**: No default workspace access (except founder)
4. **Resource Ownership**: All resources belong to exactly one organization

### Authorization Decision Flow

```typescript
async function authorize(req: Request): Promise<boolean> {
  // 1. Authentication: Who are you?
  const user = await getUserFromToken(req.headers.authorization);

  // 2. Tenant Isolation: Do you belong to this org?
  const resource = await getResource(req.params.id);
  if (resource.organizationId !== user.organizationId) {
    throw new ForbiddenError('Resource not accessible');
  }

  // 3. Workspace Authorization: Can you access this workspace?
  const workspace = getWorkspaceFromPath(req.path); // "design", "compliance", etc.
  const authority = user.workspaceAccess[workspace]; // "MANAGER", "EDITOR", etc.

  if (!authority) {
    throw new ForbiddenError('No access to workspace');
  }

  // 4. Action Authorization: Can you perform this action?
  const action = getActionFromMethod(req.method); // "read", "write", "approve"
  const allowed = checkPermission(authority, action); // See §6

  if (!allowed) {
    throw new ForbiddenError('Insufficient permissions');
  }

  // 5. Audit Log
  await auditLog.record({
    userId: user.id,
    organizationId: user.organizationId,
    workspace,
    action,
    resourceType: resource.type,
    resourceId: resource.id,
    result: 'allowed',
  });

  return true;
}
```

---

## 4. Role Hierarchy

EuroComply has **five authority levels** that apply **per workspace**:

```
┌─────────────────────────────────────────────────────────────────┐
│                      AUTHORITY HIERARCHY                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ADMIN (organization-level)                                     │
│  └── Manage users, billing, API keys, org settings             │
│      Note: Admin is org-wide, not per-workspace                │
│                                                                  │
│  MANAGER (workspace-level)                                      │
│  └── Full control: edit, approve, publish, delete              │
│      └── EDITOR (workspace-level)                              │
│          └── Edit and create, requires approval for publish    │
│              └── VIEWER (workspace-level)                      │
│                  └── Read-only access to workspace data        │
│                                                                  │
│  CONTRIBUTOR (external, limited)                               │
│  └── Submit data for specific products only                    │
│  └── Cannot view other organization data                       │
│  └── Used for: Agencies, suppliers, third-party attestors     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Authority Definitions

| Level | Description | Typical Users |
|-------|-------------|---------------|
| **ADMIN** | Organization administrator. Can manage users, billing, API keys. Has implicit VIEWER access to all workspaces for oversight. | Founders, IT admins, CTOs |
| **MANAGER** | Full control within workspace. Can approve changes, publish versions, issue DPPs. | Department heads, team leads |
| **EDITOR** | Can create and edit within workspace. Changes require MANAGER approval before publishing. | Product designers, content creators |
| **VIEWER** | Read-only access. Can view all data but cannot modify. | Stakeholders, auditors, contractors |
| **CONTRIBUTOR** | External users. Can only submit attestations for products they're invited to. | Suppliers, certifiers, agencies |

### Workspace Authority is Independent

A user can have different authority levels across workspaces:

**Example: Marketing Manager**
- Design: `VIEWER` (can see product specs but not edit)
- Operations: _no access_ (not relevant to role)
- Marketing: `MANAGER` (full control over content)
- Compliance: `VIEWER` (can see issued DPPs)
- Admin: `false` (cannot manage users or billing)

---

## 5. Workspace Access Control

Each user's access is defined **per workspace**. This mapping is stored in the `workspace_access` JSONB column:

### Database Schema

```typescript
model User {
  id                String
  email             String    @unique
  organizationId    String

  // Workspace access stored as JSONB
  workspaceAccess   Json      // { design?: AuthorityLevel, operations?: AuthorityLevel, ... }

  // Organization-level admin flag
  isAdmin           Boolean   @default(false)

  // Audit fields
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  lastLoginAt       DateTime?

  organization      Organization @relation(fields: [organizationId], references: [id])
}

// TypeScript type for workspaceAccess
type WorkspaceAccess = {
  design?: AuthorityLevel;
  operations?: AuthorityLevel;
  marketing?: AuthorityLevel;
  compliance?: AuthorityLevel;
};

type AuthorityLevel = 'MANAGER' | 'EDITOR' | 'VIEWER' | 'CONTRIBUTOR';
```

### Access Enforcement Middleware

```typescript
// Middleware: Require workspace access
function requireWorkspace(workspace: Workspace, minLevel: AuthorityLevel) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.user; // Set by JWT middleware
    const userLevel = user.workspaceAccess[workspace];

    if (!userLevel) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'WORKSPACE_ACCESS_DENIED',
          message: `No access to ${workspace} workspace`,
        },
      });
    }

    if (!hasPermission(userLevel, minLevel)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_AUTHORITY',
          message: `Requires ${minLevel} level, you have ${userLevel}`,
        },
      });
    }

    // Add workspace context to request
    req.workspace = workspace;
    req.authorityLevel = userLevel;

    next();
  };
}

// Usage in routes
router.post('/api/v1/products',
  authenticate,
  requireWorkspace('design', 'EDITOR'),
  createProduct
);

router.post('/api/v1/passports',
  authenticate,
  requireWorkspace('compliance', 'MANAGER'),
  issuePassport
);
```

---

## 6. Permission Matrices

### 6.1 Organization-Level Permissions

| Action | ADMIN | Non-Admin |
|--------|:-----:|:---------:|
| View organization settings | ✅ | ❌ |
| Update organization settings | ✅ | ❌ |
| Invite users | ✅ | ❌ |
| Modify user roles | ✅ | ❌ |
| Remove users | ✅ | ❌ |
| View billing | ✅ | ❌ |
| Update payment method | ✅ | ❌ |
| Create API keys | ✅ | ❌ |
| Revoke API keys | ✅ | ❌ |
| Export signing keys | ✅ | ❌ |
| View audit log | ✅ | ❌ |

### 6.2 Workspace-Level Permissions

#### Design Workspace

| Action | VIEWER | EDITOR | MANAGER |
|--------|:------:|:------:|:-------:|
| View products | ✅ | ✅ | ✅ |
| View BOMs | ✅ | ✅ | ✅ |
| View materials | ✅ | ✅ | ✅ |
| Create draft version | ❌ | ✅ | ✅ |
| Edit draft version | ❌ | ✅ (own drafts) | ✅ (all drafts) |
| Delete draft version | ❌ | ✅ (own drafts) | ✅ (all drafts) |
| Release version | ❌ | ❌ | ✅ |
| Archive version | ❌ | ❌ | ✅ |
| Create material | ❌ | ✅ | ✅ |
| Edit material | ❌ | ✅ | ✅ |
| Request attestation | ❌ | ✅ | ✅ |

#### Operations Workspace

| Action | VIEWER | EDITOR | MANAGER |
|--------|:------:|:------:|:-------:|
| View batches | ✅ | ✅ | ✅ |
| View EPCIS events | ✅ | ✅ | ✅ |
| Create batch | ❌ | ✅ | ✅ |
| Update batch status | ❌ | ✅ | ✅ |
| Create EPCIS event | ❌ | ✅ | ✅ |
| Delete batch | ❌ | ❌ | ✅ |
| Manage suppliers | ❌ | ✅ | ✅ |

#### Marketing Workspace

| Action | VIEWER | CONTRIBUTOR | EDITOR | MANAGER |
|--------|:------:|:-----------:|:------:|:-------:|
| View content | ✅ | ❌ | ✅ | ✅ |
| View assets | ✅ | ❌ | ✅ | ✅ |
| Create draft | ❌ | ✅ (assigned products) | ✅ | ✅ |
| Edit draft | ❌ | ✅ (own drafts) | ✅ (own drafts) | ✅ (all drafts) |
| Upload assets | ❌ | ✅ (assigned products) | ✅ | ✅ |
| Publish version | ❌ | ❌ | ❌ | ✅ |
| Configure channels | ❌ | ❌ | ✅ | ✅ |
| Sync to Shopify | ❌ | ❌ | ✅ | ✅ |

#### Compliance Workspace

| Action | VIEWER | EDITOR | MANAGER |
|--------|:------:|:------:|:-------:|
| View DPPs | ✅ | ✅ | ✅ |
| View attestations | ✅ | ✅ | ✅ |
| Review DPP preview | ✅ | ✅ | ✅ |
| Issue DPP | ❌ | ❌ | ✅ |
| Revoke DPP | ❌ | ❌ | ✅ |
| Manage attestations | ❌ | ✅ | ✅ |
| Export compliance data | ❌ | ✅ | ✅ |

### 6.3 Cross-Workspace Read Access

Users can view data from other workspaces with read-only access:

| From Workspace | Can View (Read-Only) |
|----------------|---------------------|
| Design | _None_ (Design is first in pipeline) |
| Operations | Design data (to reference BOM versions) |
| Marketing | Design data (to reference product specs while writing content) |
| Compliance | Design data, Marketing data, Operations data (to compile DPP) |

**Implementation:**
- Compliance MANAGER can issue DPPs but cannot edit Design, Marketing, or Operations data
- Cross-workspace reads are always read-only
- Authorization checks still apply (user must have access to source workspace as VIEWER or higher)

---

## 7. API Scopes

API keys use **scope-based authorization** for granular access control. Scopes follow the format: `resource:action`.

### Available Scopes

| Scope | Description | Required Authority |
|-------|-------------|-------------------|
| `products:read` | Read product data (SKU, GTIN, attributes) | VIEWER+ |
| `products:write` | Create and update products | EDITOR+ |
| `products:delete` | Delete products | MANAGER+ |
| `bom:read` | Read BOM structures | VIEWER+ |
| `bom:write` | Create and update BOMs | EDITOR+ |
| `materials:read` | Read material library | VIEWER+ |
| `materials:write` | Create and update materials | EDITOR+ |
| `passports:read` | Read issued DPPs | VIEWER+ |
| `passports:issue` | Issue new DPPs | MANAGER+ |
| `passports:revoke` | Revoke DPPs | MANAGER+ |
| `attestations:read` | Read attestations | VIEWER+ |
| `attestations:write` | Create attestation requests | EDITOR+ |
| `epcis:read` | Read EPCIS events | VIEWER+ |
| `epcis:write` | Create EPCIS events | EDITOR+ |
| `channels:read` | Read channel configurations | VIEWER+ |
| `channels:write` | Configure and sync channels | EDITOR+ |
| `users:read` | Read user list | ADMIN |
| `users:write` | Invite and manage users | ADMIN |
| `webhooks:read` | Read webhook configurations | ADMIN |
| `webhooks:write` | Create and update webhooks | ADMIN |

### Scope Groups (Presets)

For convenience, API keys can be assigned scope groups:

| Group | Included Scopes | Use Case |
|-------|----------------|----------|
| `read_only` | All `:read` scopes | External dashboards, reports |
| `full_access` | All scopes | Internal automation, admin scripts |
| `shopify_integration` | `products:read`, `products:write`, `channels:write` | E-commerce sync |
| `compliance_export` | `products:read`, `passports:read`, `attestations:read` | Regulatory reporting |

### Scope Validation

```typescript
// API key middleware
async function validateApiKey(req: Request, res: Response, next: NextFunction) {
  const key = req.headers.authorization?.replace('Bearer ', '');

  if (!key || !key.startsWith('ec_')) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_API_KEY', message: 'Missing or invalid API key' },
    });
  }

  // Hash and lookup
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { organization: true },
  });

  if (!apiKey || apiKey.revokedAt) {
    return res.status(401).json({
      success: false,
      error: { code: 'API_KEY_REVOKED', message: 'API key is revoked or invalid' },
    });
  }

  // Check organization is active
  if (apiKey.organization.status !== 'ACTIVE') {
    return res.status(403).json({
      success: false,
      error: { code: 'ORG_SUSPENDED', message: 'Organization is suspended' },
    });
  }

  // Check scope
  const requiredScope = getScopeForRoute(req.path, req.method);
  if (!apiKey.scopes.includes(requiredScope)) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'INSUFFICIENT_SCOPE',
        message: `Requires scope: ${requiredScope}`,
        scopes: apiKey.scopes,
      },
    });
  }

  // Rate limit check
  const rateLimitKey = `ratelimit:apikey:${apiKey.id}`;
  const count = await redis.incr(rateLimitKey);
  if (count === 1) {
    await redis.expire(rateLimitKey, 60); // 1 minute window
  }

  if (count > apiKey.rateLimit) { // e.g., 100 requests/minute
    return res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit: ${apiKey.rateLimit} requests/minute`,
      },
    });
  }

  // Attach to request
  req.apiKey = apiKey;
  req.organizationId = apiKey.organizationId;

  next();
}
```

---

## 8. JWT Token Structure

### Access Token (1 hour lifetime)

```json
{
  "iss": "https://api.eurocomply.eu",
  "sub": "user_01h8x9y2z3a4b5c6d7e8f9g0h1",
  "org": "org_01h8x9y2z3a4b5c6d7e8f9g0h2",
  "email": "designer@acme.com",
  "name": "Jane Designer",
  "workspaces": {
    "design": "EDITOR",
    "compliance": "VIEWER"
  },
  "admin": false,
  "iat": 1704067200,
  "exp": 1704070800
}
```

### Refresh Token (30 days lifetime)

```json
{
  "iss": "https://api.eurocomply.eu",
  "sub": "user_01h8x9y2z3a4b5c6d7e8f9g0h1",
  "jti": "refresh_01h8x9y2z3a4b5c6d7e8f9g0h3",
  "iat": 1704067200,
  "exp": 1706659200
}
```

### JWT Claims Reference

| Claim | Type | Description |
|-------|------|-------------|
| `iss` | string | Issuer (always `https://api.eurocomply.eu`) |
| `sub` | string | Subject (user ID) |
| `org` | string | Organization ID (for tenant isolation) |
| `email` | string | User email (for logging, not authorization) |
| `name` | string | User display name |
| `workspaces` | object | Workspace access map `{ workspace: authority }` |
| `admin` | boolean | Organization admin flag |
| `iat` | number | Issued at (Unix timestamp) |
| `exp` | number | Expiration (Unix timestamp) |
| `jti` | string | JWT ID (for refresh tokens, used to track revocation) |

---

## 9. Session Management

### Session Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                      SESSION LIFECYCLE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. LOGIN                                                       │
│     • Credentials verified                                      │
│     • Access token issued (1 hour)                              │
│     • Refresh token issued (30 days)                            │
│     • Session record created in Redis                           │
│                                                                  │
│  2. ACTIVE SESSION                                              │
│     • Access token used for all API requests                    │
│     • Server validates signature, expiry, claims                │
│     • No database lookup required (stateless JWT)               │
│                                                                  │
│  3. TOKEN REFRESH (before 1-hour expiry)                        │
│     • Client sends refresh token                                │
│     • Server validates refresh token                            │
│     • Check if refresh token is revoked (Redis lookup)          │
│     • Issue new access token                                    │
│     • Extend session TTL in Redis                               │
│                                                                  │
│  4. LOGOUT                                                      │
│     • Client sends logout request                               │
│     • Server adds refresh token JTI to revocation list (Redis)  │
│     • Clear cookies                                             │
│     • Delete session from Redis                                 │
│                                                                  │
│  5. SESSION EXPIRY (after 30 days inactivity)                   │
│     • Refresh token expires                                     │
│     • User must re-authenticate                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Revocation Strategy

JWT tokens are stateless, but revocation is required for:
- User logout
- Password reset
- Role change
- Account suspension

**Implementation:**

```typescript
// Revoke refresh token on logout
async function logout(req: AuthenticatedRequest) {
  const refreshToken = req.cookies.refresh_token;
  const decoded = jwt.decode(refreshToken) as { jti: string; exp: number };

  // Add to revocation list (expires when token would expire)
  const ttl = decoded.exp - Math.floor(Date.now() / 1000);
  await redis.setex(`revoked:${decoded.jti}`, ttl, '1');

  // Clear cookies
  res.clearCookie('access_token');
  res.clearCookie('refresh_token');

  return { success: true };
}

// Check revocation on token refresh
async function refreshAccessToken(req: Request) {
  const refreshToken = req.cookies.refresh_token;
  const decoded = jwt.verify(refreshToken, PUBLIC_KEY) as { jti: string; sub: string };

  // Check revocation
  const isRevoked = await redis.exists(`revoked:${decoded.jti}`);
  if (isRevoked) {
    throw new UnauthorizedError('Token has been revoked');
  }

  // Issue new access token
  const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
  const accessToken = generateAccessToken(user);

  return { accessToken };
}
```

---

## 10. Security Policies

### 10.1 Password Policy

| Requirement | Value |
|-------------|-------|
| Minimum Length | 12 characters |
| Complexity | Must include: 1 uppercase, 1 lowercase, 1 number, 1 special char |
| Hash Algorithm | bcrypt with cost factor 12 |
| History | Cannot reuse last 5 passwords |
| Expiry | None (passwords don't expire automatically) |
| Lockout | 5 failed attempts → 15-minute lockout |

### 10.2 Multi-Factor Authentication (MFA)

MFA provides an additional layer of security beyond passwords. EuroComply supports multiple MFA methods.

#### 10.2.1 MFA Methods

| Method | Availability | Security Level | Use Case |
|--------|--------------|----------------|----------|
| **TOTP** (Authenticator App) | All tiers | High | Primary MFA method |
| **WebAuthn** (Hardware Key) | Enterprise+ | Highest | Security-critical operations |
| **Email OTP** | All tiers | Medium | Backup/recovery only |
| **SMS** | Not supported | - | Security concerns (SIM swap) |

#### 10.2.2 MFA Requirements by Role

| Role | MFA Required? | Can Disable? | Notes |
|------|---------------|--------------|-------|
| **ADMIN** | Yes (enforced) | No | Required for all admin operations |
| **MANAGER** | Recommended | Yes | Strongly encouraged |
| **EDITOR** | Optional | Yes | User choice |
| **VIEWER** | Optional | Yes | User choice |
| **CONTRIBUTOR** | Optional | Yes | External users |

**Admin Operations Requiring MFA:**
- User management (invite, remove, role change)
- Billing changes (plan upgrade/downgrade)
- API key management (create, revoke)
- Organization settings changes
- Data export requests
- Key export operations

#### 10.2.3 TOTP Setup Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TOTP ENROLLMENT FLOW                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STEP 1: User initiates MFA setup                                           │
│  ───────────────────────────────                                            │
│  POST /api/v1/auth/mfa/totp/setup                                          │
│                                                                              │
│  Response:                                                                  │
│  {                                                                          │
│    "secret": "JBSWY3DPEHPK3PXP",       // Base32-encoded secret           │
│    "qrCode": "data:image/png;base64,...", // QR code image                 │
│    "backupCodes": [                      // One-time recovery codes        │
│      "ABCD-1234-EFGH",                                                     │
│      "IJKL-5678-MNOP",                                                     │
│      ... (10 codes total)                                                  │
│    ],                                                                       │
│    "setupToken": "setup_abc123..."      // Temporary token for verification│
│  }                                                                          │
│                                                                              │
│  STEP 2: User scans QR code with authenticator app                         │
│  ─────────────────────────────────────────────────                         │
│  Compatible apps: Google Authenticator, Authy, 1Password, etc.             │
│                                                                              │
│  STEP 3: User verifies setup with current code                             │
│  ─────────────────────────────────────────────                             │
│  POST /api/v1/auth/mfa/totp/verify-setup                                   │
│  {                                                                          │
│    "setupToken": "setup_abc123...",                                        │
│    "code": "123456"    // Current TOTP code from app                       │
│  }                                                                          │
│                                                                              │
│  STEP 4: MFA enabled, backup codes saved                                   │
│  ───────────────────────────────────────                                   │
│  • User must save backup codes securely                                    │
│  • Each backup code can only be used once                                  │
│  • 10 backup codes provided initially                                      │
│  • Can regenerate backup codes (invalidates old ones)                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**TOTP Parameters:**
- Algorithm: SHA-1 (RFC 6238 compatible)
- Digits: 6
- Period: 30 seconds
- Clock skew tolerance: ±1 period (90 seconds total window)

#### 10.2.4 WebAuthn (Hardware Key) Setup

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WEBAUTHN REGISTRATION FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SUPPORTED AUTHENTICATORS:                                                  │
│  • YubiKey 5 series                                                        │
│  • Google Titan                                                             │
│  • Windows Hello                                                            │
│  • Touch ID / Face ID (platform authenticators)                            │
│                                                                              │
│  REGISTRATION:                                                              │
│                                                                              │
│  1. POST /api/v1/auth/mfa/webauthn/register/begin                          │
│     → Returns WebAuthn challenge                                            │
│                                                                              │
│  2. Browser calls navigator.credentials.create()                           │
│     → User touches hardware key or uses biometric                          │
│                                                                              │
│  3. POST /api/v1/auth/mfa/webauthn/register/complete                       │
│     → Stores credential public key                                          │
│                                                                              │
│  AUTHENTICATION:                                                            │
│                                                                              │
│  1. POST /api/v1/auth/mfa/webauthn/authenticate/begin                      │
│     → Returns assertion challenge                                           │
│                                                                              │
│  2. Browser calls navigator.credentials.get()                              │
│     → User touches hardware key or uses biometric                          │
│                                                                              │
│  3. POST /api/v1/auth/mfa/webauthn/authenticate/complete                   │
│     → Verifies signature, issues session                                    │
│                                                                              │
│  SECURITY SETTINGS:                                                         │
│  • Attestation: "direct" (verify authenticator model)                      │
│  • User verification: "required" (PIN or biometric)                        │
│  • Resident key: "preferred" (passwordless capable)                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 10.2.5 MFA Recovery

When a user loses access to their MFA device:

| Recovery Method | Process | Security |
|-----------------|---------|----------|
| **Backup codes** | Enter one of 10 pre-generated codes | High - codes are one-time use |
| **Admin reset** | Organization admin resets MFA | Medium - requires admin verification |
| **Support reset** | Contact support with identity verification | High - video call + document verification |

**Admin MFA Reset Procedure:**
1. User contacts organization admin
2. Admin verifies user identity (out-of-band)
3. Admin initiates reset: `POST /api/v1/users/{userId}/mfa/reset`
4. User receives email with temporary login link
5. User must set up new MFA within 24 hours
6. Audit log records: admin ID, user ID, reason, timestamp

**Support MFA Reset (no admin available):**
1. User submits request via support portal
2. Video call scheduled for identity verification
3. User presents government ID + answers security questions
4. 24-hour cooling-off period
5. MFA reset executed
6. All sessions invalidated, user must re-authenticate

### 10.3 Magic Link Security

Magic links provide passwordless authentication for Guest Partners and Transactional Partners. This section documents security measures.

#### 10.3.1 Magic Link Properties

| Property | Value | Rationale |
|----------|-------|-----------|
| **Token Length** | 256-bit (32 bytes) | Sufficient entropy to prevent brute force |
| **Token Format** | URL-safe base64 | Safe for email links |
| **Validity Period** | 15 minutes | Short window limits exposure |
| **Single Use** | Yes | Prevents replay attacks |
| **Hash Storage** | SHA-256 | Token never stored in plaintext |

#### 10.3.2 Token Generation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      MAGIC LINK TOKEN GENERATION                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Generate cryptographically random token                                 │
│     token = crypto.randomBytes(32)                                          │
│                                                                              │
│  2. Create URL-safe encoding                                                │
│     urlToken = base64url.encode(token)                                      │
│                                                                              │
│  3. Store hash in database                                                  │
│     tokenHash = sha256(token)                                               │
│     INSERT INTO magic_links (                                               │
│       hash, userId, expiresAt, used                                         │
│     ) VALUES (                                                               │
│       tokenHash, :userId, NOW() + 15min, false                              │
│     )                                                                        │
│                                                                              │
│  4. Construct magic link                                                    │
│     link = `https://app.eurocomply.eu/auth/magic/${urlToken}`              │
│                                                                              │
│  5. Send via email                                                          │
│     Email template includes:                                                │
│     • Link                                                                  │
│     • Expiration warning                                                    │
│     • Security notice if not requested by user                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 10.3.3 Rate Limiting

To prevent abuse, magic link requests are rate-limited:

| Limit | Value | Window | Action on Exceed |
|-------|-------|--------|------------------|
| Per email address | 3 requests | 1 hour | 429 Too Many Requests |
| Per IP address | 10 requests | 1 hour | 429 + CAPTCHA required |
| Per organization | 50 requests | 1 hour | Alert to admins |

**Rate Limit Response:**
```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many magic link requests. Please try again in 45 minutes.",
  "retryAfter": 2700
}
```

#### 10.3.4 Token Validation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      MAGIC LINK VALIDATION FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. User clicks magic link                                                  │
│     GET /auth/magic/{urlToken}                                              │
│                                                                              │
│  2. Decode and hash token                                                   │
│     token = base64url.decode(urlToken)                                      │
│     tokenHash = sha256(token)                                               │
│                                                                              │
│  3. Lookup in database                                                      │
│     SELECT * FROM magic_links WHERE hash = :tokenHash                       │
│                                                                              │
│  4. Validate                                                                │
│     ✓ Token exists                                                          │
│     ✓ Token not expired (expiresAt > NOW())                                │
│     ✓ Token not used (used = false)                                        │
│     ✓ User account active                                                  │
│                                                                              │
│  5. Mark as used (IMMEDIATELY, before session creation)                     │
│     UPDATE magic_links SET used = true WHERE hash = :tokenHash             │
│                                                                              │
│  6. Create session                                                          │
│     Issue JWT tokens, set cookies                                           │
│                                                                              │
│  7. Log authentication event                                                │
│     { action: 'auth.magic_link', userId, ip, userAgent, success: true }    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 10.3.5 Security Measures

| Measure | Implementation | Purpose |
|---------|----------------|---------|
| **Single-use enforcement** | Atomic mark-as-used before session | Prevents replay attacks |
| **Short expiry** | 15-minute validity | Limits exposure window |
| **Hash storage** | SHA-256 of token | Token never in plaintext |
| **Rate limiting** | 3/email/hour | Prevents enumeration |
| **Audit logging** | All requests logged | Forensic analysis |
| **Secure transport** | HTTPS only | Prevents interception |
| **Email verification** | Token tied to specific email | Prevents forwarding abuse |

#### 10.3.6 Audit Logging

All magic link events are logged:

```typescript
interface MagicLinkAuditEntry {
  action: 'auth.magic_link.requested' | 'auth.magic_link.used' | 'auth.magic_link.expired' | 'auth.magic_link.invalid';
  email: string;
  userId?: string;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  success: boolean;
  failureReason?: 'expired' | 'already_used' | 'invalid_token' | 'user_disabled' | 'rate_limited';
}
```

**Failed attempt alerts:**
- 3+ failed attempts for same email → Alert to user
- 10+ failed attempts from same IP → Alert to security team
- Pattern anomaly detection → Automated investigation

### 10.4 Session Invalidation

Sessions must be invalidated when security-relevant changes occur.

#### 10.4.1 Invalidation Triggers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SESSION INVALIDATION TRIGGERS                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  IMMEDIATE INVALIDATION (all sessions):                                     │
│  ──────────────────────────────────────                                     │
│  │ Trigger                        │ Scope              │ User Notified?    │
│  │────────────────────────────────│────────────────────│───────────────────│
│  │ Password changed               │ All user sessions  │ Yes (email)       │
│  │ Password reset completed       │ All user sessions  │ Yes (email)       │
│  │ MFA device changed             │ All user sessions  │ Yes (email)       │
│  │ User marked as compromised     │ All user sessions  │ Yes (email+SMS)   │
│  │ Account disabled               │ All user sessions  │ Yes (email)       │
│                                                                              │
│  IMMEDIATE INVALIDATION (specific sessions):                                │
│  ───────────────────────────────────────────                                │
│  │ Trigger                        │ Scope              │ User Notified?    │
│  │────────────────────────────────│────────────────────│───────────────────│
│  │ Role downgraded                │ Affected user      │ Yes (in-app)      │
│  │ Workspace access revoked       │ Affected user      │ Yes (in-app)      │
│  │ Removed from organization      │ Affected user      │ Yes (email)       │
│  │ API key revoked                │ Sessions using key │ No (key owner)    │
│                                                                              │
│  SOFT INVALIDATION (re-auth required for sensitive ops):                    │
│  ─────────────────────────────────────────────────────                      │
│  │ Trigger                        │ Effect                                 │
│  │────────────────────────────────│────────────────────────────────────────│
│  │ Session idle > 30 minutes      │ Require re-auth for admin operations  │
│  │ Different IP detected          │ Require MFA verification              │
│  │ Different device detected      │ Require MFA verification              │
│  │ Permission escalation needed   │ Require password re-entry             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 10.4.2 Implementation

```typescript
// Session invalidation service
class SessionInvalidator {
  // Invalidate all sessions for a user
  async invalidateAllUserSessions(userId: string, reason: string): Promise<void> {
    // 1. Get all active sessions
    const sessions = await redis.keys(`session:${userId}:*`);

    // 2. Delete all sessions
    if (sessions.length > 0) {
      await redis.del(...sessions);
    }

    // 3. Increment user's token generation (invalidates all JWTs)
    await prisma.user.update({
      where: { id: userId },
      data: { tokenGeneration: { increment: 1 } },
    });

    // 4. Log event
    await auditLog.create({
      type: 'SESSIONS_INVALIDATED',
      userId,
      reason,
      sessionsInvalidated: sessions.length,
    });
  }

  // Invalidate sessions on permission change
  async onPermissionChange(userId: string, change: PermissionChange): Promise<void> {
    if (this.isDowngrade(change)) {
      await this.invalidateAllUserSessions(userId, `Permission downgrade: ${change.description}`);
    }
  }

  // Force re-authentication for sensitive operations
  async requireReauth(sessionId: string): Promise<void> {
    await redis.hset(`session:${sessionId}`, 'requiresReauth', 'true');
  }
}
```

### 10.5 IP Allowlisting

Enterprise tier organizations can restrict access to specific IP ranges.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    IP ALLOWLISTING (Enterprise Tier)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CONFIGURATION:                                                             │
│  ─────────────                                                              │
│                                                                              │
│  POST /api/v1/organization/security/ip-allowlist                           │
│  {                                                                          │
│    "enabled": true,                                                         │
│    "rules": [                                                               │
│      {                                                                      │
│        "name": "Office HQ",                                                │
│        "cidr": "203.0.113.0/24",                                          │
│        "description": "Main office IP range"                               │
│      },                                                                     │
│      {                                                                      │
│        "name": "VPN Exit",                                                 │
│        "cidr": "198.51.100.50/32",                                        │
│        "description": "Corporate VPN exit IP"                              │
│      }                                                                      │
│    ],                                                                       │
│    "bypassOptions": {                                                       │
│      "allowMobileWithMfa": true,    // Allow mobile if MFA verified       │
│      "bypassUsers": ["user_ceo123"] // Specific users can bypass          │
│    },                                                                       │
│    "enforcementMode": "enforce"     // "audit" | "warn" | "enforce"        │
│  }                                                                          │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  ENFORCEMENT MODES:                                                         │
│  ──────────────────                                                         │
│                                                                              │
│  │ Mode    │ Behavior                               │ Use Case            │
│  │─────────│────────────────────────────────────────│─────────────────────│
│  │ audit   │ Log violations but allow access        │ Testing rules       │
│  │ warn    │ Show warning but allow access          │ Gradual rollout     │
│  │ enforce │ Block access from non-allowed IPs      │ Production          │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  BYPASS SCENARIOS:                                                          │
│  ─────────────────                                                          │
│                                                                              │
│  1. Mobile App with MFA (if allowMobileWithMfa = true):                    │
│     • User authenticates from unknown IP                                   │
│     • System detects mobile user agent                                     │
│     • Requires MFA verification                                            │
│     • If MFA passes: Access granted, logged as "bypass_mobile_mfa"         │
│                                                                              │
│  2. Bypass Users (emergency access):                                        │
│     • Specific users in bypassUsers list                                   │
│     • Still requires MFA for admin operations                              │
│     • All access logged as "bypass_user_override"                          │
│                                                                              │
│  3. Temporary Bypass Token (support scenarios):                            │
│     • Support can issue 4-hour bypass token                                │
│     • Token tied to specific user and reason                               │
│     • Logged as "bypass_support_token"                                     │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  BLOCKED ACCESS RESPONSE:                                                   │
│  ────────────────────────                                                   │
│                                                                              │
│  HTTP 403 Forbidden                                                        │
│  {                                                                          │
│    "success": false,                                                        │
│    "error": {                                                               │
│      "code": "IP_NOT_ALLOWED",                                             │
│      "message": "Access denied: IP address not in organization allowlist", │
│      "details": {                                                           │
│        "clientIp": "192.0.2.50",                                          │
│        "organizationId": "org_abc123",                                     │
│        "contactAdmin": true                                                │
│      }                                                                      │
│    }                                                                        │
│  }                                                                          │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  AUDIT LOGGING:                                                             │
│  ──────────────                                                             │
│                                                                              │
│  All IP allowlist events logged:                                            │
│  • Configuration changes (who, when, what changed)                         │
│  • Blocked access attempts (IP, user if known, timestamp)                  │
│  • Bypass usage (type, user, IP, timestamp)                                │
│  • Rule matches (which rule matched for allowed access)                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.6 OAuth Scope Matrix

Complete API scope definitions for OAuth and API key authorization.

#### 10.6.1 Scope Definitions

| Scope | Description | Endpoints |
|-------|-------------|-----------|
| **Products** | | |
| `read:products` | View products and versions | `GET /products/*` |
| `write:products` | Create, update, archive products | `POST/PUT/DELETE /products/*` |
| `delete:products` | Permanently delete products | `DELETE /products/{id}/permanent` |
| **Passports** | | |
| `read:passports` | View issued passports | `GET /passports/*` |
| `write:passports` | Issue and revoke passports | `POST /passports/*`, `POST /passports/{id}/revoke` |
| **Credentials** | | |
| `read:credentials` | View credentials and status | `GET /credentials/*` |
| `write:credentials` | Issue credentials | `POST /credentials/*` |
| `revoke:credentials` | Revoke credentials | `POST /credentials/{id}/revoke` |
| **Attestations** | | |
| `read:attestations` | View attestation requests and contributions | `GET /attestations/*` |
| `write:attestations` | Create attestation requests | `POST /attestations/*` |
| `approve:attestations` | Approve/reject contributions | `POST /attestations/{id}/approve` |
| **Organization** | | |
| `read:organization` | View organization settings | `GET /organization/*` |
| `write:organization` | Update organization settings | `PUT /organization/*` |
| `admin:organization` | Billing, security settings | `*/organization/billing/*`, `*/organization/security/*` |
| **Users** | | |
| `read:users` | View users in organization | `GET /users/*` |
| `write:users` | Invite, update users | `POST/PUT /users/*` |
| `admin:users` | Remove users, change roles | `DELETE /users/*`, `PUT /users/{id}/role` |
| **Bulk Operations** | | |
| `bulk:import` | Import products, credentials | `POST /import/*` |
| `bulk:export` | Export organization data | `POST /export/*` |
| **Webhooks** | | |
| `read:webhooks` | View webhook configurations | `GET /webhooks/*` |
| `write:webhooks` | Create, update, delete webhooks | `POST/PUT/DELETE /webhooks/*` |
| **Audit** | | |
| `read:audit` | View audit logs | `GET /audit/*` |

#### 10.6.2 Scope Hierarchy

Some scopes imply others:

```
admin:organization
├── write:organization
│   └── read:organization
└── admin:users
    └── write:users
        └── read:users

write:products
└── read:products

write:credentials
├── read:credentials
└── revoke:credentials

bulk:export
└── read:products
└── read:passports
└── read:credentials
```

#### 10.6.3 Minimum Scopes by Operation

| Operation | Minimum Scopes Required |
|-----------|------------------------|
| View dashboard | `read:products` |
| Create product | `write:products` |
| Issue DPP | `write:passports`, `read:products` |
| Bulk import | `bulk:import`, `write:products` |
| Export all data | `bulk:export` |
| Manage users | `admin:users` |
| Configure webhooks | `write:webhooks` |
| View audit trail | `read:audit` |

#### 10.6.4 API Key Scope Templates

Pre-defined scope bundles for common use cases:

| Template | Scopes | Use Case |
|----------|--------|----------|
| **read-only** | `read:products`, `read:passports`, `read:credentials` | Monitoring, reporting |
| **integration** | `read:products`, `write:products`, `read:passports`, `write:passports` | E-commerce sync |
| **automation** | `bulk:import`, `bulk:export`, `write:products`, `write:passports` | CI/CD, batch jobs |
| **full-access** | All scopes except `admin:*` | Full API access |
| **admin** | All scopes | Administrative access |

### 10.7 Rate Limiting

| Authentication Type | Limit | Window |
|---------------------|-------|--------|
| Login attempts (per IP) | 10 requests | 1 minute |
| Login attempts (per email) | 5 requests | 15 minutes |
| Token refresh | 20 requests | 1 hour |
| API key requests (tier-dependent) | See table below | 1 minute |

**API Key Rate Limits by Tier:**

| Plan | Requests/Minute | Requests/Hour | Requests/Day |
|------|-----------------|---------------|--------------|
| Growth | 60 | 3,000 | 50,000 |
| Scale | 300 | 15,000 | 250,000 |
| Enterprise | 1,200 | 60,000 | 1,000,000 |
| Mega | 6,000 | 300,000 | Unlimited |

### 10.8 Security Event Logging

All authentication events are logged to audit trail:

| Event | Logged Data |
|-------|-------------|
| Login success | User ID, IP, user agent, timestamp |
| Login failure | Email, IP, user agent, timestamp, reason |
| Logout | User ID, IP, timestamp |
| Token refresh | User ID, IP, timestamp |
| Password change | User ID, IP, timestamp |
| Password reset request | Email, IP, timestamp |
| API key created | User ID, key ID, scopes, timestamp |
| API key revoked | User ID, key ID, timestamp, reason |
| Role change | Admin ID, target user ID, old role, new role, timestamp |
| Failed authorization | User ID, resource type, resource ID, required permission, timestamp |

---

## 11. Implementation Guide

### 11.1 Authentication Middleware

```typescript
// middleware/authenticate.ts
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    organizationId: string;
    email: string;
    workspaceAccess: Record<string, AuthorityLevel>;
    isAdmin: boolean;
  };
}

export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    // Extract token from cookie or Authorization header
    const token = req.cookies.access_token ||
                  req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'No authentication token' },
      });
    }

    // Verify JWT
    const decoded = jwt.verify(token, PUBLIC_KEY, {
      algorithms: ['RS256'],
      issuer: 'https://api.eurocomply.eu',
    }) as JWTPayload;

    // Attach user to request
    req.user = {
      id: decoded.sub,
      organizationId: decoded.org,
      email: decoded.email,
      workspaceAccess: decoded.workspaces,
      isAdmin: decoded.admin,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: 'Token has expired' },
      });
    }

    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid token' },
    });
  }
}
```

### 11.2 Authorization Middleware

```typescript
// middleware/authorize.ts
type Workspace = 'design' | 'operations' | 'marketing' | 'compliance';
type AuthorityLevel = 'MANAGER' | 'EDITOR' | 'VIEWER' | 'CONTRIBUTOR';

const authorityHierarchy: Record<AuthorityLevel, number> = {
  MANAGER: 3,
  EDITOR: 2,
  VIEWER: 1,
  CONTRIBUTOR: 0,
};

function hasPermission(userLevel: AuthorityLevel, requiredLevel: AuthorityLevel): boolean {
  return authorityHierarchy[userLevel] >= authorityHierarchy[requiredLevel];
}

export function requireWorkspace(workspace: Workspace, minLevel: AuthorityLevel) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.user!; // Set by authenticate middleware
    const userLevel = user.workspaceAccess[workspace];

    if (!userLevel) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'WORKSPACE_ACCESS_DENIED',
          message: `No access to ${workspace} workspace`,
        },
      });
    }

    if (!hasPermission(userLevel, minLevel)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_AUTHORITY',
          message: `Requires ${minLevel} level in ${workspace}, you have ${userLevel}`,
        },
      });
    }

    next();
  };
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'ADMIN_REQUIRED',
        message: 'Admin privileges required',
      },
    });
  }

  next();
}
```

### 11.3 Example Route Protection

```typescript
// routes/products.ts
import { authenticate } from '../middleware/authenticate';
import { requireWorkspace } from '../middleware/authorize';

// Read products (Design workspace, VIEWER level minimum)
router.get('/api/v1/products',
  authenticate,
  requireWorkspace('design', 'VIEWER'),
  async (req, res) => {
    // User is authenticated and has at least VIEWER access to Design workspace
    const products = await getProducts(req.user!.organizationId);
    res.json({ success: true, data: products });
  }
);

// Create product (Design workspace, EDITOR level minimum)
router.post('/api/v1/products',
  authenticate,
  requireWorkspace('design', 'EDITOR'),
  async (req, res) => {
    // User is authenticated and has at least EDITOR access
    const product = await createProduct(req.user!.organizationId, req.body);
    res.json({ success: true, data: product });
  }
);

// Issue DPP (Compliance workspace, MANAGER level required)
router.post('/api/v1/passports',
  authenticate,
  requireWorkspace('compliance', 'MANAGER'),
  async (req, res) => {
    // User is authenticated and has MANAGER access to Compliance
    const passport = await issuePassport(req.user!.organizationId, req.body);
    res.json({ success: true, data: passport });
  }
);

// Invite user (Admin required)
router.post('/api/v1/users/invite',
  authenticate,
  requireAdmin,
  async (req, res) => {
    // User is authenticated and is an admin
    const invitation = await inviteUser(req.user!.organizationId, req.body);
    res.json({ success: true, data: invitation });
  }
);
```

---

## Related Documentation

- [USER_MANAGEMENT.md](./USER_MANAGEMENT.md) - User roles, workspace access, version control
- [SECURITY.md](./SECURITY.md) - 7-layer security architecture, encryption, multi-tenancy
- [SELF_SERVICE_ONBOARDING.md](./SELF_SERVICE_ONBOARDING.md) - User registration and organization setup

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-14 | Initial specification |
