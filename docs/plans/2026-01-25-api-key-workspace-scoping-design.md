# API Key Workspace Scoping Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add workspace-level authorization to API keys, eliminating the "superuser" bypass and authority leakage vulnerabilities.

**Architecture:** API keys gain the same workspace authority model as human users (OrganizationUser). The authorize middleware treats both identity types uniformly, checking authorities from the appropriate source.

**Tech Stack:** MikroORM entities, Hono middleware, TypeScript

---

## Background

### Security Issues Identified

1. **API Key "Superuser" Status**: All API keys bypass workspace authorization entirely:
   ```typescript
   if (userId?.startsWith('api-key:')) {
     await next();  // Bypass ALL checks
     return;
   }
   ```

2. **`authorizeAnyWorkspace` Leakage**: A Marketing CONTRIBUTOR could access Compliance routes because the middleware only checks "any workspace" not "the correct workspace."

### Use Cases for API Keys

- **Machine-to-machine integrations**: ERP systems syncing products (Design workspace), warehouses updating inventory (Operations workspace)
- **CI/CD pipelines**: Automated testing and deployments (may need broader access)

---

## Section 1: ApiKey Entity Changes

Add workspace authority fields to `ApiKey`, mirroring `OrganizationUser`:

```typescript
// packages/database/src/entities/ApiKey.ts
@Entity({ tableName: 'api_keys', schema: 'public' })
export class ApiKey extends BaseEntity {
  // ... existing fields (keyHash, keyPrefix, name, lastUsedAt, revokedAt) ...

  /**
   * Authority level for Design workspace (products, materials, specs)
   */
  @Property({ type: 'string', default: WorkspaceAuthority.NONE })
  designAuthority: WorkspaceAuthority = WorkspaceAuthority.NONE;

  /**
   * Authority level for Operations workspace (inventory, fulfillment)
   */
  @Property({ type: 'string', default: WorkspaceAuthority.NONE })
  operationsAuthority: WorkspaceAuthority = WorkspaceAuthority.NONE;

  /**
   * Authority level for Marketing workspace (campaigns, public content)
   */
  @Property({ type: 'string', default: WorkspaceAuthority.NONE })
  marketingAuthority: WorkspaceAuthority = WorkspaceAuthority.NONE;

  /**
   * Authority level for Compliance workspace (audit logs, certifications)
   */
  @Property({ type: 'string', default: WorkspaceAuthority.NONE })
  complianceAuthority: WorkspaceAuthority = WorkspaceAuthority.NONE;

  /**
   * Whether this key has org admin privileges (manage users, billing, keys)
   */
  @Property({ type: 'boolean', default: false })
  isOrgAdmin: boolean = false;
}
```

### Design Decisions

- **Defaults**: All `NONE` + `isOrgAdmin: false` = key can authenticate but access nothing until explicitly granted (fail-safe)
- **Entity Symmetry**: Field names match `OrganizationUser` exactly, enabling polymorphic authorization helpers
- **Migration**: Existing keys get elevated to MANAGER on all workspaces + `isOrgAdmin: true` to preserve current behavior, with logged warning to review

---

## Section 2: ApiKeyService Hardening

### Explicit Public Schema Scoping

The `ApiKeyService` must explicitly set `search_path` to `public` to prevent cross-talk if a database connection was left in a tenant schema.

```typescript
// packages/database/src/services/api-key.service.ts

async validateKey(rawKey: string): Promise<ValidateApiKeyResult> {
  if (!rawKey || !rawKey.startsWith('ek_live_')) {
    return { valid: false, error: 'Invalid key format' };
  }

  const keyHash = hashApiKey(rawKey);
  const em = this.em.fork();

  // Explicitly set search_path to public for this auth query
  // Prevents cross-talk if connection was left in tenant schema
  const apiKey = await em.transactional(async (txEm) => {
    await txEm.execute('SET search_path TO public');
    return txEm.findOne(
      ApiKey,
      { keyHash },
      { populate: ['organization'] }
    );
  });

  if (!apiKey) {
    return { valid: false, error: 'API key not found' };
  }

  if (!apiKey.isActive) {
    return { valid: false, error: 'API key has been revoked' };
  }

  // Update last used timestamp (fire and forget)
  apiKey.lastUsedAt = new Date();
  em.flush().catch(() => {});

  return {
    valid: true,
    organizationId: apiKey.organization.id,
    schemaName: apiKey.organization.schemaName,
    // Pass through authority fields
    designAuthority: apiKey.designAuthority,
    operationsAuthority: apiKey.operationsAuthority,
    marketingAuthority: apiKey.marketingAuthority,
    complianceAuthority: apiKey.complianceAuthority,
    isOrgAdmin: apiKey.isOrgAdmin,
  };
}
```

### Updated ValidateApiKeyResult Interface

```typescript
export interface ValidateApiKeyResult {
  valid: boolean;
  organizationId?: string;
  schemaName?: string;
  error?: string;

  // Workspace authorities for authorization
  designAuthority?: WorkspaceAuthority;
  operationsAuthority?: WorkspaceAuthority;
  marketingAuthority?: WorkspaceAuthority;
  complianceAuthority?: WorkspaceAuthority;
  isOrgAdmin?: boolean;
}
```

### Apply to All Service Methods

Same `SET search_path TO public` pattern applies to:
- `createKey()`
- `listKeys()`
- `revokeKey()`

---

## Section 3: Context Propagation

### Update Env Type (app.ts)

```typescript
export type Env = {
  Variables: {
    tenantSchema: string;
    userId: string;
    user?: User;
    membership?: OrganizationUser;

    // API key authorities (set when auth is via API key)
    apiKeyAuthorities?: {
      designAuthority: WorkspaceAuthority;
      operationsAuthority: WorkspaceAuthority;
      marketingAuthority: WorkspaceAuthority;
      complianceAuthority: WorkspaceAuthority;
      isOrgAdmin: boolean;
    };
  };
};
```

### Update Tenant Middleware

```typescript
// apps/api/src/middleware/tenant.ts (inside API key validation block)

if (apiKey) {
  // ... existing validation ...

  tenant = {
    schemaName: result.schemaName!,
    userId: `api-key:${result.organizationId}`,
  };

  // Store API key authorities in context
  c.set('apiKeyAuthorities', {
    designAuthority: result.designAuthority!,
    operationsAuthority: result.operationsAuthority!,
    marketingAuthority: result.marketingAuthority!,
    complianceAuthority: result.complianceAuthority!,
    isOrgAdmin: result.isOrgAdmin!,
  });
}
```

### Design Decisions

- **Context Separation**: `membership` (human) and `apiKeyAuthorities` (machine) remain distinct
- **Implicit undefined**: For JWT requests, `apiKeyAuthorities` is undefined (only set in API key block)

---

## Section 4: Authorize Middleware Refactor

### Unified `authorize()` Function

```typescript
export function authorize(workspace: Workspace, action: Action) {
  return createMiddleware<Env>(async (c, next) => {
    const userId = c.get('userId');
    const apiKeyAuthorities = c.get('apiKeyAuthorities');
    const membership = c.get('membership');

    const requiredLevel = ACTION_REQUIREMENTS[action];
    let userLevel: number;
    let userAuthority: WorkspaceAuthority;

    // Determine authority source: API key or human membership
    if (userId?.startsWith('api-key:') && apiKeyAuthorities) {
      const authorityKey = `${workspace}Authority` as keyof typeof apiKeyAuthorities;
      userAuthority = apiKeyAuthorities[authorityKey];
      userLevel = AUTHORITY_LEVELS[userAuthority];
    } else if (membership) {
      const authorityKey = `${workspace}Authority` as keyof typeof membership;
      userAuthority = membership[authorityKey] as WorkspaceAuthority;
      userLevel = AUTHORITY_LEVELS[userAuthority];
    } else {
      return c.json(
        { error: 'Unauthorized', message: 'No authorization context found' },
        401
      );
    }

    if (userLevel < requiredLevel) {
      const authorityNeeded = Object.entries(AUTHORITY_LEVELS)
        .find(([_, level]) => level === requiredLevel)?.[0];

      return c.json({
        error: 'Forbidden',
        message: `This action requires ${authorityNeeded} access to the ${workspace} workspace`,
        workspace,
        action,
        yourAuthority: userAuthority,
        requiredAuthority: authorityNeeded,
      }, 403);
    }

    await next();
  });
}
```

### Unified `requireOrgAdmin()` Function

```typescript
export function requireOrgAdmin() {
  return createMiddleware<Env>(async (c, next) => {
    const userId = c.get('userId');
    const apiKeyAuthorities = c.get('apiKeyAuthorities');
    const membership = c.get('membership');

    if (userId?.startsWith('api-key:') && apiKeyAuthorities) {
      if (!apiKeyAuthorities.isOrgAdmin) {
        return c.json({
          error: 'Forbidden',
          message: 'This API key does not have Organization Admin privileges',
        }, 403);
      }
    } else if (membership) {
      if (!membership.isOrgAdmin) {
        return c.json({
          error: 'Forbidden',
          message: 'This action requires Organization Admin privileges',
        }, 403);
      }
    } else {
      return c.json(
        { error: 'Unauthorized', message: 'No authorization context found' },
        401
      );
    }

    await next();
  });
}
```

### Delete `authorizeAnyWorkspace()`

**Rationale:**
- Architecturally problematic: routes should declare which workspace they belong to
- Currently unused in the codebase
- Invites misuse: future developers might use it as a shortcut, introducing authority escalation
- Unclear authorization is a security vulnerability by design

If cross-workspace routes are needed later, design explicitly with workspace lists:
```typescript
authorizeWorkspaces(['design', 'operations'], 'view')
```

---

## Migration Strategy

### Database Migration

1. Add new columns to `api_keys` table with defaults:
   ```sql
   ALTER TABLE public.api_keys
     ADD COLUMN design_authority VARCHAR(20) DEFAULT 'NONE',
     ADD COLUMN operations_authority VARCHAR(20) DEFAULT 'NONE',
     ADD COLUMN marketing_authority VARCHAR(20) DEFAULT 'NONE',
     ADD COLUMN compliance_authority VARCHAR(20) DEFAULT 'NONE',
     ADD COLUMN is_org_admin BOOLEAN DEFAULT false;
   ```

2. Elevate existing keys to preserve current behavior (temporary):
   ```sql
   UPDATE public.api_keys SET
     design_authority = 'MANAGER',
     operations_authority = 'MANAGER',
     marketing_authority = 'MANAGER',
     compliance_authority = 'MANAGER',
     is_org_admin = true
   WHERE design_authority = 'NONE';
   ```

3. Log warning for operators to review and restrict keys as needed.

---

## Testing Strategy

### Integration Tests

1. **API key with limited scope**: Create key with `designAuthority: EDITOR`, verify it can edit products but gets 403 on compliance routes
2. **API key without org admin**: Verify 403 on `/api-keys` management routes
3. **Full-access key**: Verify MANAGER on all workspaces + isOrgAdmin works like current behavior
4. **Revoked key with authorities**: Verify revoked keys still return 401 regardless of authorities

### Existing Tests

- Update `authorize.test.ts` to cover API key authority paths
- Remove tests for deleted `authorizeAnyWorkspace`

---

## Summary

| Component | Change |
|-----------|--------|
| `ApiKey` entity | Add 4 workspace authority fields + `isOrgAdmin` |
| `ApiKeyService` | Explicit `SET search_path TO public`, return authorities |
| `ValidateApiKeyResult` | Include authority fields |
| `Env` type | Add `apiKeyAuthorities` context variable |
| `tenant.ts` | Propagate authorities to context |
| `authorize()` | Check authorities for both humans and API keys |
| `requireOrgAdmin()` | Check `isOrgAdmin` for both humans and API keys |
| `authorizeAnyWorkspace()` | **DELETE** |

**Result:** API keys become first-class citizens in the authorization system with the same granular workspace controls as human users. No more superuser bypass. No more authority leakage.

---

*Design validated: 2026-01-25*
