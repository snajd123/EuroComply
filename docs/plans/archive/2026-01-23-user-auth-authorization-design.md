# User Authentication & Workspace Authorization Design

**Status:** Ready for Implementation
**Created:** 2026-01-23
**Author:** Claude + User

---

## 1. Overview

### Goal

Implement user authentication and workspace-based authorization so that:

1. Users are synced from Clerk to our database when they join an organization
2. Every API request knows WHO is making it (not just which tenant)
3. Routes can enforce workspace authority levels (NONE/VIEWER/CONTRIBUTOR/EDITOR/MANAGER)
4. Org Admin actions (API keys, user management) are properly restricted

### The Principle

**Never trust the client.** Authorization must happen at the API level.

| Layer | Responsibility |
|-------|----------------|
| **API** | **Enforces** permissions - returns 403 if not allowed |
| **Frontend** | **Reflects** permissions - hides buttons user can't use (for UX) |

### Request Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        REQUEST FLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Request with JWT                                              │
│         │                                                       │
│         ▼                                                       │
│   ┌─────────────┐                                               │
│   │ tenantMiddleware │ → Extracts schemaName + clerkUserId     │
│   └──────┬──────┘                                               │
│          ▼                                                       │
│   ┌─────────────┐                                               │
│   │ userMiddleware │ → Looks up User + OrganizationUser        │
│   └──────┬──────┘      in tenant schema, attaches to context   │
│          ▼                                                       │
│   ┌─────────────┐                                               │
│   │ authorize() │ → Checks workspace authority for action      │
│   └──────┬──────┘                                               │
│          ▼                                                       │
│   Route Handler (unchanged)                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Scope

**In scope:**
- User and OrganizationUser entities (tenant schema)
- Clerk webhooks for membership sync
- userMiddleware + authorize() middleware
- Retrofit existing routes with authorization

**Out of scope (for now):**
- User invitation UI/API (managed in Clerk)
- Role assignment UI/API (can use Clerk metadata or build later)

---

## 2. Data Model

Two new entities in the **tenant schema** (not public).

### WorkspaceAuthority Enum

```typescript
// packages/database/src/entities/WorkspaceAuthority.ts
export enum WorkspaceAuthority {
  NONE = 'NONE',           // No access - cannot even view
  VIEWER = 'VIEWER',       // Read-only
  CONTRIBUTOR = 'CONTRIBUTOR', // Edit, submit for review
  EDITOR = 'EDITOR',       // Edit, approve
  MANAGER = 'MANAGER',     // Full control
}
```

**Authorization logic:**

| Authority | view | edit | approve | manage |
|-----------|:----:|:----:|:-------:|:------:|
| NONE | ✗ | ✗ | ✗ | ✗ |
| VIEWER | ✓ | ✗ | ✗ | ✗ |
| CONTRIBUTOR | ✓ | ✓ | ✗ | ✗ |
| EDITOR | ✓ | ✓ | ✓ | ✗ |
| MANAGER | ✓ | ✓ | ✓ | ✓ |

**Default for new users:** `NONE` for all workspaces. Org Admin must explicitly grant access.

### User Entity

```typescript
// packages/database/src/entities/User.ts
import { Entity, Property, Unique, OneToOne } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { OrganizationUser } from './OrganizationUser.js';

@Entity({ tableName: 'users' })
export class User extends BaseEntity {
  @Property({ type: 'text', name: 'clerk_id' })
  @Unique()
  clerkId!: string;  // Clerk user ID (user_xxx)

  @Property({ type: 'text' })
  @Unique()
  email!: string;

  @Property({ type: 'text', nullable: true })
  name?: string;

  @Property({ type: 'text', nullable: true, name: 'avatar_url' })
  avatarUrl?: string;

  @Property({ name: 'last_login_at', nullable: true })
  lastLoginAt?: Date;

  @Property({ type: 'datetime', nullable: true, name: 'deleted_at' })
  deletedAt?: Date;

  @OneToOne(() => OrganizationUser, ou => ou.user)
  membership?: OrganizationUser;
}
```

### OrganizationUser Entity

```typescript
// packages/database/src/entities/OrganizationUser.ts
import { Entity, Property, OneToOne, Enum } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { User } from './User.js';
import { WorkspaceAuthority } from './WorkspaceAuthority.js';

@Entity({ tableName: 'organization_users' })
export class OrganizationUser extends BaseEntity {
  @OneToOne(() => User, { name: 'user_id', owner: true })
  user!: User;

  @Property({ type: 'boolean', name: 'is_org_admin', default: false })
  isOrgAdmin: boolean = false;

  @Enum({ items: () => WorkspaceAuthority, name: 'design_authority' })
  designAuthority: WorkspaceAuthority = WorkspaceAuthority.NONE;

  @Enum({ items: () => WorkspaceAuthority, name: 'operations_authority' })
  operationsAuthority: WorkspaceAuthority = WorkspaceAuthority.NONE;

  @Enum({ items: () => WorkspaceAuthority, name: 'marketing_authority' })
  marketingAuthority: WorkspaceAuthority = WorkspaceAuthority.NONE;

  @Enum({ items: () => WorkspaceAuthority, name: 'compliance_authority' })
  complianceAuthority: WorkspaceAuthority = WorkspaceAuthority.NONE;
}
```

### Why OneToOne?

Per the architecture: a User record exists **per tenant**. If someone belongs to multiple organizations, they have separate User records in each tenant schema. Within a single tenant, one User → one OrganizationUser.

### DDL for TenantProvisioner

```sql
-- Users table
CREATE TABLE ${schemaName}.users (
    id VARCHAR(30) PRIMARY KEY,
    clerk_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    avatar_url TEXT,
    last_login_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_clerk_id ON ${schemaName}.users(clerk_id);
CREATE INDEX idx_users_deleted ON ${schemaName}.users(deleted_at) WHERE deleted_at IS NULL;

-- Organization users table
CREATE TABLE ${schemaName}.organization_users (
    id VARCHAR(30) PRIMARY KEY,
    user_id VARCHAR(30) UNIQUE NOT NULL REFERENCES ${schemaName}.users(id) ON DELETE CASCADE,
    is_org_admin BOOLEAN DEFAULT false,
    design_authority VARCHAR(20) DEFAULT 'NONE',
    operations_authority VARCHAR(20) DEFAULT 'NONE',
    marketing_authority VARCHAR(20) DEFAULT 'NONE',
    compliance_authority VARCHAR(20) DEFAULT 'NONE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_org_users_admin ON ${schemaName}.organization_users(is_org_admin) WHERE is_org_admin = true;
```

---

## 3. Clerk Webhook Integration

### Webhook Events

| Clerk Event | Our Action |
|-------------|------------|
| `organizationMembership.created` | Create User + OrganizationUser in tenant schema |
| `organizationMembership.deleted` | Soft delete User (set deletedAt) |
| `user.updated` | Queue profile sync via outbox events |

### Handler: organizationMembership.created

```typescript
// apps/api/src/webhooks/clerk.ts

interface ClerkOrganizationMembershipEvent {
  type: 'organizationMembership.created' | 'organizationMembership.deleted';
  data: {
    id: string;
    organization: { id: string };
    public_user_data: {
      user_id: string;
      identifier: string;      // email
      first_name?: string;
      last_name?: string;
      image_url?: string;
    };
    role: 'org:admin' | 'org:member';
    created_at: number;
  };
}

async function handleMembershipCreated(
  orm: MikroORM,
  event: ClerkOrganizationMembershipEvent
) {
  const { organization, public_user_data, role } = event.data;

  // 1. Find our organization by Clerk org ID
  const org = await orm.em.findOne(Organization, {
    clerkOrgId: organization.id
  });

  if (!org) {
    throw new Error(`Organization not found for Clerk org: ${organization.id}`);
  }

  // 2. Check if org is provisioned
  if (org.provisioningStatus !== ProvisioningStatus.READY) {
    throw new RetryableError('Organization not yet provisioned');
  }

  // 3. Create user in tenant schema
  const em = orm.em.fork({ schema: org.schemaName });

  // Check if user already exists (idempotency)
  const existingUser = await em.findOne(User, {
    clerkId: public_user_data.user_id
  });

  if (existingUser) {
    return { status: 'already_exists', userId: existingUser.id };
  }

  // 4. Determine if this is the first user (org creator)
  const userCount = await em.count(User, {});
  const isFirstUser = userCount === 0;

  // 5. Create User
  const user = em.create(User, {
    id: createId(),
    clerkId: public_user_data.user_id,
    email: public_user_data.identifier,
    name: [public_user_data.first_name, public_user_data.last_name]
      .filter(Boolean).join(' ') || null,
    avatarUrl: public_user_data.image_url,
  });

  // 6. Create OrganizationUser with authorities
  const isClerkAdmin = role === 'org:admin';

  const orgUser = em.create(OrganizationUser, {
    id: createId(),
    user,
    isOrgAdmin: isFirstUser || isClerkAdmin,
    // First user gets MANAGER on all workspaces
    // Others start with NONE (must be granted by admin)
    designAuthority: isFirstUser ? WorkspaceAuthority.MANAGER : WorkspaceAuthority.NONE,
    operationsAuthority: isFirstUser ? WorkspaceAuthority.MANAGER : WorkspaceAuthority.NONE,
    marketingAuthority: isFirstUser ? WorkspaceAuthority.MANAGER : WorkspaceAuthority.NONE,
    complianceAuthority: isFirstUser ? WorkspaceAuthority.MANAGER : WorkspaceAuthority.NONE,
  });

  await em.persistAndFlush([user, orgUser]);

  // 7. Emit outbox event
  const outboxEvent = em.create(OutboxEvent, {
    id: createId(),
    aggregateType: 'User',
    aggregateId: user.id,
    eventType: 'user.joined_organization',
    payload: {
      userId: user.id,
      clerkUserId: public_user_data.user_id,
      organizationId: org.id,
      isOrgAdmin: orgUser.isOrgAdmin,
      isFirstUser,
    },
    status: OutboxStatus.PENDING,
  });
  em.persist(outboxEvent);
  await em.flush();

  return { status: 'created', userId: user.id };
}
```

### Handler: organizationMembership.deleted

```typescript
async function handleMembershipDeleted(
  orm: MikroORM,
  event: ClerkOrganizationMembershipEvent
) {
  const { organization, public_user_data } = event.data;

  const org = await orm.em.findOne(Organization, {
    clerkOrgId: organization.id
  });

  if (!org) return { status: 'org_not_found' };

  const em = orm.em.fork({ schema: org.schemaName });

  // Soft delete - preserves audit trail references
  const updated = await em.nativeUpdate(
    User,
    { clerkId: public_user_data.user_id, deletedAt: null },
    { deletedAt: new Date() }
  );

  if (updated === 0) {
    return { status: 'user_not_found' };
  }

  return { status: 'soft_deleted' };
}
```

### Handler: user.updated

```typescript
async function handleUserUpdated(
  orm: MikroORM,
  event: ClerkUserUpdatedEvent
) {
  const em = orm.em.fork();
  const primaryEmail = event.data.email_addresses.find(
    e => e.id === event.data.primary_email_address_id
  )?.email_address;

  const name = [event.data.first_name, event.data.last_name]
    .filter(Boolean).join(' ') || null;

  // Emit one outbox event per tenant (processed async by worker)
  for (const membership of event.data.organization_memberships) {
    const outboxEvent = em.create(OutboxEvent, {
      id: createId(),
      aggregateType: 'User',
      aggregateId: event.data.id,
      eventType: 'user.profile_sync_requested',
      payload: {
        clerkUserId: event.data.id,
        clerkOrgId: membership.organization.id,
        email: primaryEmail,
        name,
        avatarUrl: event.data.image_url,
      },
      status: OutboxStatus.PENDING,
    });
    em.persist(outboxEvent);
  }
  await em.flush();

  return { status: 'queued', count: event.data.organization_memberships.length };
}
```

### Org Creation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                  CLERK ORG CREATION FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. organization.created webhook                                │
│     └─ Our handler: Creates Organization + provisions schema   │
│                         │                                       │
│                         ▼                                       │
│  2. organizationMembership.created webhook (creator auto-added) │
│     └─ Our handler:                                            │
│        ├─ Checks: userCount === 0? → isFirstUser = true        │
│        ├─ Creates User                                          │
│        └─ Creates OrganizationUser with:                       │
│           • isOrgAdmin: true                                    │
│           • All workspaces: MANAGER                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Middleware Architecture

### Context Types

```typescript
// apps/api/src/app.ts
export type Env = {
  Variables: {
    // Existing
    tenantSchema?: string;
    userId?: string;           // Clerk user ID (from JWT)
    webhookPayload?: unknown;

    // New
    user?: User;                      // Full user record
    membership?: OrganizationUser;    // Authorities
  };
};
```

### Middleware Chain

```
┌─────────────────────────────────────────────────────────────────┐
│                     MIDDLEWARE CHAIN                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. tenantMiddleware (existing)                                 │
│     ├─ Validates JWT or API key                                 │
│     ├─ Sets: tenantSchema, userId (clerk ID or api-key:xxx)    │
│     └─ Returns 401 if invalid                                   │
│                         │                                       │
│                         ▼                                       │
│  2. userMiddleware (new)                                        │
│     ├─ Skips if userId starts with "api-key:"                  │
│     ├─ Looks up User + OrganizationUser in tenant schema       │
│     ├─ Sets: user, membership                                   │
│     ├─ Returns 202 if user not found (race condition)          │
│     └─ Returns 403 if user soft-deleted                        │
│                         │                                       │
│                         ▼                                       │
│  3. authorize(workspace, action) (new, per-route)              │
│     ├─ Skips if API key (has org-level access)                 │
│     ├─ Checks membership[workspaceAuthority] >= required       │
│     └─ Returns 403 if insufficient authority                   │
│                         │                                       │
│                         ▼                                       │
│  Route Handler                                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### userMiddleware Implementation

```typescript
// apps/api/src/middleware/user.ts
import { createMiddleware } from 'hono/factory';
import type { Env } from '../app.js';
import { User, OrganizationUser } from '@eurocomply/database';

export interface UserMiddlewareOptions {
  orm: MikroORM;
}

export function createUserMiddleware(options: UserMiddlewareOptions) {
  const { orm } = options;

  return createMiddleware<Env>(async (c, next) => {
    const tenantSchema = c.get('tenantSchema');
    const clerkUserId = c.get('userId');

    // Guard: tenantMiddleware must run first
    if (!tenantSchema) {
      return c.json(
        { error: 'Unauthorized', message: 'Missing tenant context' },
        401
      );
    }

    // Skip for API key auth (already has org-level access)
    if (!clerkUserId || clerkUserId.startsWith('api-key:')) {
      await next();
      return;
    }

    // Look up user in tenant schema
    const em = orm.em.fork({ schema: tenantSchema });

    const user = await em.findOne(
      User,
      { clerkId: clerkUserId, deletedAt: null },
      { populate: ['membership'] }
    );

    // Race condition: user has valid JWT but webhook hasn't synced yet
    if (!user) {
      return c.json(
        {
          error: 'Provisioning',
          message: 'Setting up your account. Please retry in a moment.',
          retryAfter: 2,
        },
        202,
        { 'Retry-After': '2' }
      );
    }

    // User was soft-deleted (removed from org in Clerk)
    if (!user.membership) {
      return c.json(
        {
          error: 'Forbidden',
          message: 'You are no longer a member of this organization',
        },
        403
      );
    }

    // Attach to context
    c.set('user', user);
    c.set('membership', user.membership);

    // Update last login (fire and forget, don't block request)
    em.nativeUpdate(User, { id: user.id }, { lastLoginAt: new Date() })
      .catch(() => {}); // Ignore errors

    await next();
  });
}
```

### First Login Race Condition

```
┌─────────────────────────────────────────────────────────────────┐
│                  FIRST LOGIN RACE CONDITION                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   User added to Clerk org                                       │
│         │                                                       │
│         ├──────────────────┐                                    │
│         ▼                  ▼                                    │
│   Webhook fires       User logs in immediately                  │
│   (async)             (has valid JWT)                           │
│         │                  │                                    │
│         │                  ▼                                    │
│         │            userMiddleware: User not found             │
│         │                  │                                    │
│         │                  ▼                                    │
│         │            Return 202 + Retry-After: 2                │
│         │            { "status": "provisioning",                │
│         │              "message": "Setting up your account" }   │
│         │                  │                                    │
│         ▼                  │                                    │
│   User record created      │                                    │
│         │                  │                                    │
│         └──────────────────┘                                    │
│                  │                                              │
│                  ▼                                              │
│         Next request succeeds                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### authorize() Middleware

```typescript
// apps/api/src/middleware/authorize.ts
import { createMiddleware } from 'hono/factory';
import type { Env } from '../app.js';
import { WorkspaceAuthority } from '@eurocomply/database';

type Workspace = 'design' | 'operations' | 'marketing' | 'compliance';
type Action = 'view' | 'edit' | 'approve' | 'manage';

const AUTHORITY_LEVELS: Record<WorkspaceAuthority, number> = {
  [WorkspaceAuthority.NONE]: 0,
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
  return createMiddleware<Env>(async (c, next) => {
    const userId = c.get('userId');
    const membership = c.get('membership');

    // API key auth: allow org-level access
    if (userId?.startsWith('api-key:')) {
      await next();
      return;
    }

    if (!membership) {
      return c.json(
        { error: 'Unauthorized', message: 'User context not found' },
        401
      );
    }

    // Get user's authority for this workspace
    const authorityKey = `${workspace}Authority` as keyof typeof membership;
    const userAuthority = membership[authorityKey] as WorkspaceAuthority;
    const userLevel = AUTHORITY_LEVELS[userAuthority];
    const requiredLevel = ACTION_REQUIREMENTS[action];

    if (userLevel < requiredLevel) {
      const authorityNeeded = Object.entries(AUTHORITY_LEVELS)
        .find(([_, level]) => level === requiredLevel)?.[0];

      return c.json(
        {
          error: 'Forbidden',
          message: `This action requires ${authorityNeeded} access to the ${workspace} workspace`,
          workspace,
          action,
          yourAuthority: userAuthority,
          requiredAuthority: authorityNeeded,
        },
        403
      );
    }

    await next();
  });
}
```

### requireOrgAdmin() Middleware

```typescript
export function requireOrgAdmin() {
  return createMiddleware<Env>(async (c, next) => {
    const userId = c.get('userId');
    const membership = c.get('membership');

    // API key auth: allow (API keys are org-level credentials)
    if (userId?.startsWith('api-key:')) {
      await next();
      return;
    }

    if (!membership) {
      return c.json(
        { error: 'Unauthorized', message: 'User context not found' },
        401
      );
    }

    if (!membership.isOrgAdmin) {
      return c.json(
        {
          error: 'Forbidden',
          message: 'This action requires Organization Admin privileges',
        },
        403
      );
    }

    await next();
  });
}
```

### authorizeAnyWorkspace() Middleware

```typescript
export function authorizeAnyWorkspace(action: Action) {
  return createMiddleware<Env>(async (c, next) => {
    const userId = c.get('userId');
    const membership = c.get('membership');

    if (userId?.startsWith('api-key:')) {
      await next();
      return;
    }

    if (!membership) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const requiredLevel = ACTION_REQUIREMENTS[action];

    // Check if user has required level in ANY workspace
    const hasAccess = (
      AUTHORITY_LEVELS[membership.designAuthority] >= requiredLevel ||
      AUTHORITY_LEVELS[membership.operationsAuthority] >= requiredLevel ||
      AUTHORITY_LEVELS[membership.marketingAuthority] >= requiredLevel ||
      AUTHORITY_LEVELS[membership.complianceAuthority] >= requiredLevel
    );

    if (!hasAccess) {
      return c.json({
        error: 'Forbidden',
        message: `Requires ${action} access to at least one workspace`,
      }, 403);
    }

    await next();
  });
}
```

---

## 5. Route Authorization Matrix

### Authorization Legend

| Symbol | Meaning |
|--------|---------|
| `○` | No auth required (public) |
| `●` | Tenant auth only (any member) |
| `D:V` | Design workspace, VIEWER+ |
| `D:C` | Design workspace, CONTRIBUTOR+ |
| `D:M` | Design workspace, MANAGER |
| `ANY:V` | Any workspace, VIEWER+ |
| `ADMIN` | Org Admin required |

### Current Endpoints

| Endpoint | Method | Current | Required | Middleware |
|----------|--------|---------|----------|------------|
| `/health` | GET | ○ | ○ | None |
| `/api/v1/taxonomy/units` | GET | ○ | ○ | None |
| `/api/v1/taxonomy/units/convert` | GET | ○ | ○ | None |
| `/api/v1/taxonomy/units/:code` | GET | ○ | ○ | None |
| `/api/v1/taxonomy/categories` | GET | ● | `ANY:V` | `authorizeAnyWorkspace('view')` |
| `/api/v1/taxonomy/categories` | POST | ● | `D:M` | `authorize('design', 'manage')` |
| `/api/v1/taxonomy/categories/:id` | PATCH | ● | `D:M` | `authorize('design', 'manage')` |
| `/api/v1/products` | GET | ● | `D:V` | `authorize('design', 'view')` |
| `/api/v1/products` | POST | ● | `D:C` | `authorize('design', 'edit')` |
| `/api/v1/products/:id` | GET | ● | `D:V` | `authorize('design', 'view')` |
| `/api/v1/api-keys` | GET | ● | `ADMIN` | `requireOrgAdmin()` |
| `/api/v1/api-keys` | POST | ● | `ADMIN` | `requireOrgAdmin()` |
| `/api/v1/api-keys/:id` | DELETE | ● | `ADMIN` | `requireOrgAdmin()` |
| `/api/v1/admin/*` | * | X-Admin-Key | X-Admin-Key | `adminAuthMiddleware()` |
| `/webhooks/*` | POST | Signature | Signature | `clerkWebhookMiddleware` |

### Updated Route Definitions

```typescript
// apps/api/src/routes/products.ts
import { authorize } from '../middleware/authorize.js';

export function createProductsRouter(options: ProductsRouterOptions) {
  const { orm } = options;
  const router = new Hono<Env>();

  router.get('/', authorize('design', 'view'), async (c) => {
    // ... unchanged handler code
  });

  router.post(
    '/',
    authorize('design', 'edit'),
    zValidator('json', createProductSchema),
    async (c) => {
      // ... unchanged handler code
    }
  );

  router.get('/:id', authorize('design', 'view'), async (c) => {
    // ... unchanged handler code
  });

  return router;
}
```

```typescript
// apps/api/src/routes/api-keys.ts
import { requireOrgAdmin } from '../middleware/authorize.js';

export function createApiKeysRouter(deps: ApiKeysRouterDeps) {
  const router = new Hono<Env>();

  // All API key operations require Org Admin
  router.use('/*', requireOrgAdmin());

  router.post('/', async (c) => { /* unchanged */ });
  router.get('/', async (c) => { /* unchanged */ });
  router.delete('/:id', async (c) => { /* unchanged */ });

  return router;
}
```

### Future Endpoints Reference

| Endpoint | Method | Authorization | Rationale |
|----------|--------|---------------|-----------|
| `/api/v1/products/:id` | PUT | `D:C` | Edit requires CONTRIBUTOR |
| `/api/v1/products/:id` | DELETE | `D:M` | Delete requires MANAGER |
| `/api/v1/products/:id/release` | POST | `D:E` | Release requires EDITOR |
| `/api/v1/dpp` | POST | `C:E` | Issue DPP requires Compliance EDITOR |
| `/api/v1/users` | GET | `ADMIN` | List org members |
| `/api/v1/users/:id/authorities` | PUT | `ADMIN` | Change workspace access |

---

## 6. Migration Strategy (Dev Mode)

Since we're in dev with no production data:

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEV DEPLOYMENT                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Add User + OrganizationUser entities                       │
│  2. Update TenantProvisioner to create the tables              │
│  3. Reset database: pnpm db:reset (or docker-compose down -v)  │
│  4. Re-provision test orgs via Clerk webhook                   │
│  5. Done                                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Register Webhooks in Clerk Dashboard

- Event: `organizationMembership.created`
- Event: `organizationMembership.deleted`
- Event: `user.updated`
- URL: `https://your-dev-url/webhooks/clerk`

---

## 7. Testing Strategy

### Test Pyramid

```
                      ┌─────────┐
                      │  E2E    │  Clerk → Webhook → API call
                    ┌─┴─────────┴─┐
                    │ Integration │  Middleware chain + DB
                  ┌─┴─────────────┴─┐
                  │      Unit       │  authorize(), userMiddleware
                  └─────────────────┘
```

### Unit Tests: authorize()

```typescript
// apps/api/src/middleware/authorize.test.ts
describe('authorize middleware', () => {
  it('allows VIEWER to view', async () => { /* ... */ });
  it('denies VIEWER from editing', async () => { /* ... */ });
  it('denies NONE from viewing', async () => { /* ... */ });
  it('allows MANAGER to manage', async () => { /* ... */ });
  it('checks correct workspace', async () => { /* ... */ });
  it('allows API key to skip authority check', async () => { /* ... */ });
});

describe('requireOrgAdmin middleware', () => {
  it('allows org admin', async () => { /* ... */ });
  it('denies non-admin', async () => { /* ... */ });
});
```

### Unit Tests: userMiddleware

```typescript
// apps/api/src/middleware/user.test.ts
describe('userMiddleware', () => {
  it('returns 401 if tenantSchema missing', async () => { /* ... */ });
  it('skips for API key auth', async () => { /* ... */ });
  it('returns 202 when user not found (race condition)', async () => { /* ... */ });
  it('attaches user and membership to context', async () => { /* ... */ });
  it('returns 403 for soft-deleted user', async () => { /* ... */ });
});
```

### Integration Tests: Full Flow

```typescript
// apps/api/src/routes/products.e2e.test.ts
describe('Products API Authorization', () => {
  it('allows Design VIEWER to GET /products', async () => { /* ... */ });
  it('denies user with NONE authority', async () => { /* ... */ });
  it('allows Design CONTRIBUTOR to POST /products', async () => { /* ... */ });
  it('denies Design VIEWER from POST /products', async () => { /* ... */ });
});
```

### Webhook Integration Tests

```typescript
// apps/api/src/webhooks/clerk-membership.test.ts
describe('Clerk Membership Webhooks', () => {
  it('creates user with MANAGER for first member', async () => { /* ... */ });
  it('creates user with NONE for subsequent members', async () => { /* ... */ });
  it('handles org not yet provisioned', async () => { /* ... */ });
  it('soft deletes user on membership.deleted', async () => { /* ... */ });
});
```

### Edge Cases Checklist

| Test Case | Expected Behavior |
|-----------|-------------------|
| Race condition: user not synced | 202 + Retry-After: 2 |
| Soft-deleted user with valid JWT | 403 "no longer a member" |
| User exists but no OrganizationUser | 403 |
| Design MANAGER accessing Compliance | 403 if Compliance is NONE |
| API key skips authority check | 200 |
| First user gets MANAGER + isOrgAdmin | Verified in webhook test |
| Clerk org:admin gets isOrgAdmin | Verified in webhook test |
| Subsequent users get NONE | Verified in webhook test |
| Org not yet provisioned | 503 retryable error |
| Idempotent webhook (user already exists) | 200, no duplicate |

---

## 8. Implementation Checklist

### Phase A: Database Layer

- [ ] A1. Create WorkspaceAuthority enum
- [ ] A2. Create User entity
- [ ] A3. Create OrganizationUser entity
- [ ] A4. Export entities from index
- [ ] A5. Update TenantProvisioner to create user tables
- [ ] A6. Reset database and verify tables created

### Phase B: Webhook Handlers

- [ ] B1. Add handleMembershipCreated handler
- [ ] B2. Add handleMembershipDeleted handler
- [ ] B3. Add handleUserUpdated handler
- [ ] B4. Register webhook routes
- [ ] B5. Register webhooks in Clerk Dashboard

### Phase C: Middleware

- [ ] C1. Create userMiddleware
- [ ] C2. Create authorize() middleware
- [ ] C3. Create requireOrgAdmin() middleware
- [ ] C4. Create authorizeAnyWorkspace() middleware
- [ ] C5. Update Env types

### Phase D: Wire Up Routes

- [ ] D1. Add userMiddleware to app.ts
- [ ] D2. Add authorization to products routes
- [ ] D3. Add authorization to api-keys routes

### Phase E: Testing

- [ ] E1. Create test helpers
- [ ] E2. Write authorize() unit tests
- [ ] E3. Write userMiddleware unit tests
- [ ] E4. Write webhook integration tests
- [ ] E5. Write products authorization e2e tests
- [ ] E6. Verify all edge cases pass

### Phase F: Manual Verification

- [ ] F1. Create org in Clerk → verify webhook fires → org provisioned
- [ ] F2. Add yourself to org → verify user created with MANAGER
- [ ] F3. Call GET /products with JWT → verify 200
- [ ] F4. Add second user to org → verify they get NONE
- [ ] F5. Call GET /products as second user → verify 403
- [ ] F6. Remove user from org → verify soft deleted
- [ ] F7. Call API with removed user's JWT → verify 403

---

## 9. Quick Reference

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTHORIZATION QUICK REF                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  AUTHORITY LEVELS:                                              │
│    NONE (0) → VIEWER (1) → CONTRIBUTOR (2) → EDITOR (3) → MANAGER (4) │
│                                                                 │
│  ACTIONS:                                                       │
│    view: VIEWER+    edit: CONTRIBUTOR+                          │
│    approve: EDITOR+    manage: MANAGER                          │
│                                                                 │
│  USAGE:                                                         │
│    router.get('/', authorize('design', 'view'), handler)        │
│    router.post('/', authorize('design', 'edit'), handler)       │
│    router.use('/*', requireOrgAdmin())                          │
│                                                                 │
│  CONTEXT:                                                       │
│    c.get('user')        → User entity                           │
│    c.get('membership')  → OrganizationUser entity               │
│    c.get('userId')      → Clerk ID or 'api-key:xxx'             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Related Documents

| Document | Purpose |
|----------|---------|
| [Security Design](./03-security.md) | Original auth/authorization spec |
| [Data Model](./02-data-model.md) | User, OrganizationUser definitions |
| [Architecture](./01-architecture.md) | Multi-tenancy, schema design |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-23 | Initial design |
