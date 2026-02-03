# User Auth Plan C: Clerk Webhooks

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Clerk webhook handlers for user membership sync (create, delete, update).

**Architecture:** Extend the existing clerk.ts webhook file with handlers for organizationMembership.created, organizationMembership.deleted, and user.updated events. First user in an org gets MANAGER + isOrgAdmin.

**Tech Stack:** Hono, MikroORM, Clerk webhooks, TypeScript

**Prerequisites:** Plan A complete (User, OrganizationUser, WorkspaceAuthority entities exist).

**Reference:** See `docs/plans/2026-01-23-user-auth-authorization-design.md` Section 3.

---

## Task 1: Add Webhook Types

**Files:**
- Modify: `apps/api/src/webhooks/clerk.ts`

**Step 1: Read current clerk.ts**

Run: `cat apps/api/src/webhooks/clerk.ts`

**Step 2: Add type definitions for membership events**

Add these types near the top of the file:

```typescript
// Membership webhook event types
export interface ClerkOrganizationMembershipEvent {
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

export interface ClerkUserUpdatedEvent {
  type: 'user.updated';
  data: {
    id: string;
    email_addresses: Array<{ email_address: string; id: string }>;
    primary_email_address_id: string;
    first_name?: string;
    last_name?: string;
    image_url?: string;
    organization_memberships: Array<{ organization: { id: string } }>;
  };
}

// Custom error for retryable webhook failures
export class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableError';
  }
}
```

**Step 3: Commit**

```bash
git add apps/api/src/webhooks/clerk.ts
git commit -m "feat(api): add Clerk membership webhook type definitions"
```

---

## Task 2: Write handleMembershipCreated Tests

**Files:**
- Create: `apps/api/src/webhooks/clerk-membership.test.ts`

**Step 1: Write tests for membership created**

```typescript
// apps/api/src/webhooks/clerk-membership.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleMembershipCreated,
  handleMembershipDeleted,
  ClerkOrganizationMembershipEvent,
} from './clerk.js';
import { ProvisioningStatus, WorkspaceAuthority } from '@eurocomply/database';

describe('handleMembershipCreated', () => {
  const mockOrm = {
    em: {
      findOne: vi.fn(),
      fork: vi.fn(),
    },
  };

  const mockTenantEm = {
    findOne: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    persist: vi.fn(),
    persistAndFlush: vi.fn(),
    flush: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOrm.em.fork.mockReturnValue(mockTenantEm);
  });

  const createEvent = (overrides = {}): ClerkOrganizationMembershipEvent => ({
    type: 'organizationMembership.created',
    data: {
      id: 'mem_123',
      organization: { id: 'org_clerk456' },
      public_user_data: {
        user_id: 'user_clerk789',
        identifier: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        image_url: 'https://example.com/avatar.png',
      },
      role: 'org:member',
      created_at: Date.now(),
      ...overrides,
    },
  });

  it('throws error when organization not found', async () => {
    mockOrm.em.findOne.mockResolvedValue(null);

    const event = createEvent();

    await expect(handleMembershipCreated(mockOrm as any, event))
      .rejects.toThrow('Organization not found');
  });

  it('throws RetryableError when org not yet provisioned', async () => {
    mockOrm.em.findOne.mockResolvedValue({
      id: 'org_123',
      schemaName: 'tenant_test',
      provisioningStatus: ProvisioningStatus.PROVISIONING,
    });

    const event = createEvent();

    await expect(handleMembershipCreated(mockOrm as any, event))
      .rejects.toThrow('not yet provisioned');
  });

  it('returns already_exists when user exists', async () => {
    mockOrm.em.findOne.mockResolvedValue({
      id: 'org_123',
      schemaName: 'tenant_test',
      provisioningStatus: ProvisioningStatus.READY,
    });
    mockTenantEm.findOne.mockResolvedValue({ id: 'existing_user' });

    const event = createEvent();
    const result = await handleMembershipCreated(mockOrm as any, event);

    expect(result.status).toBe('already_exists');
  });

  it('creates first user with MANAGER + isOrgAdmin', async () => {
    mockOrm.em.findOne.mockResolvedValue({
      id: 'org_123',
      schemaName: 'tenant_test',
      provisioningStatus: ProvisioningStatus.READY,
    });
    mockTenantEm.findOne.mockResolvedValue(null);
    mockTenantEm.count.mockResolvedValue(0); // First user
    mockTenantEm.create.mockImplementation((_, data) => data);
    mockTenantEm.persistAndFlush.mockResolvedValue(undefined);
    mockTenantEm.flush.mockResolvedValue(undefined);

    const event = createEvent();
    const result = await handleMembershipCreated(mockOrm as any, event);

    expect(result.status).toBe('created');
    expect(mockTenantEm.create).toHaveBeenCalledTimes(3); // User + OrganizationUser + OutboxEvent

    // Check OrganizationUser was created with MANAGER
    const orgUserCall = mockTenantEm.create.mock.calls.find(
      (call: any) => call[1]?.designAuthority !== undefined
    );
    expect(orgUserCall[1].isOrgAdmin).toBe(true);
    expect(orgUserCall[1].designAuthority).toBe(WorkspaceAuthority.MANAGER);
  });

  it('creates subsequent user with NONE + not admin', async () => {
    mockOrm.em.findOne.mockResolvedValue({
      id: 'org_123',
      schemaName: 'tenant_test',
      provisioningStatus: ProvisioningStatus.READY,
    });
    mockTenantEm.findOne.mockResolvedValue(null);
    mockTenantEm.count.mockResolvedValue(5); // Not first user
    mockTenantEm.create.mockImplementation((_, data) => data);
    mockTenantEm.persistAndFlush.mockResolvedValue(undefined);
    mockTenantEm.flush.mockResolvedValue(undefined);

    const event = createEvent();
    const result = await handleMembershipCreated(mockOrm as any, event);

    expect(result.status).toBe('created');

    // Check OrganizationUser was created with NONE
    const orgUserCall = mockTenantEm.create.mock.calls.find(
      (call: any) => call[1]?.designAuthority !== undefined
    );
    expect(orgUserCall[1].isOrgAdmin).toBe(false);
    expect(orgUserCall[1].designAuthority).toBe(WorkspaceAuthority.NONE);
  });

  it('grants isOrgAdmin to Clerk org:admin role', async () => {
    mockOrm.em.findOne.mockResolvedValue({
      id: 'org_123',
      schemaName: 'tenant_test',
      provisioningStatus: ProvisioningStatus.READY,
    });
    mockTenantEm.findOne.mockResolvedValue(null);
    mockTenantEm.count.mockResolvedValue(5); // Not first user
    mockTenantEm.create.mockImplementation((_, data) => data);
    mockTenantEm.persistAndFlush.mockResolvedValue(undefined);
    mockTenantEm.flush.mockResolvedValue(undefined);

    const event = createEvent();
    event.data.role = 'org:admin';

    const result = await handleMembershipCreated(mockOrm as any, event);

    expect(result.status).toBe('created');

    // Check isOrgAdmin is true for org:admin role
    const orgUserCall = mockTenantEm.create.mock.calls.find(
      (call: any) => call[1]?.isOrgAdmin !== undefined
    );
    expect(orgUserCall[1].isOrgAdmin).toBe(true);
  });
});

describe('handleMembershipDeleted', () => {
  const mockOrm = {
    em: {
      findOne: vi.fn(),
      fork: vi.fn(),
    },
  };

  const mockTenantEm = {
    nativeUpdate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOrm.em.fork.mockReturnValue(mockTenantEm);
  });

  const createDeleteEvent = (): ClerkOrganizationMembershipEvent => ({
    type: 'organizationMembership.deleted',
    data: {
      id: 'mem_123',
      organization: { id: 'org_clerk456' },
      public_user_data: {
        user_id: 'user_clerk789',
        identifier: 'test@example.com',
      },
      role: 'org:member',
      created_at: Date.now(),
    },
  });

  it('returns org_not_found when organization not found', async () => {
    mockOrm.em.findOne.mockResolvedValue(null);

    const event = createDeleteEvent();
    const result = await handleMembershipDeleted(mockOrm as any, event);

    expect(result.status).toBe('org_not_found');
  });

  it('returns user_not_found when user not found', async () => {
    mockOrm.em.findOne.mockResolvedValue({
      id: 'org_123',
      schemaName: 'tenant_test',
    });
    mockTenantEm.nativeUpdate.mockResolvedValue(0);

    const event = createDeleteEvent();
    const result = await handleMembershipDeleted(mockOrm as any, event);

    expect(result.status).toBe('user_not_found');
  });

  it('soft deletes user by setting deletedAt', async () => {
    mockOrm.em.findOne.mockResolvedValue({
      id: 'org_123',
      schemaName: 'tenant_test',
    });
    mockTenantEm.nativeUpdate.mockResolvedValue(1);

    const event = createDeleteEvent();
    const result = await handleMembershipDeleted(mockOrm as any, event);

    expect(result.status).toBe('soft_deleted');
    expect(mockTenantEm.nativeUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { clerkId: 'user_clerk789', deletedAt: null },
      expect.objectContaining({ deletedAt: expect.any(Date) })
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @eurocomply/api test clerk-membership`
Expected: FAIL with "handleMembershipCreated is not exported"

**Step 3: Commit test file**

```bash
git add apps/api/src/webhooks/clerk-membership.test.ts
git commit -m "test(api): add Clerk membership webhook handler tests"
```

---

## Task 3: Implement handleMembershipCreated

**Files:**
- Modify: `apps/api/src/webhooks/clerk.ts`

**Step 1: Add imports**

Add these imports at the top:

```typescript
import { createId } from '@eurocomply/core';
import {
  Organization,
  ProvisioningStatus,
  User,
  OrganizationUser,
  WorkspaceAuthority,
  OutboxEvent,
  OutboxStatus,
} from '@eurocomply/database';
import type { MikroORM } from '@mikro-orm/postgresql';
```

**Step 2: Implement handleMembershipCreated**

```typescript
export async function handleMembershipCreated(
  orm: MikroORM,
  event: ClerkOrganizationMembershipEvent
): Promise<{ status: string; userId?: string }> {
  const { organization, public_user_data, role } = event.data;

  // 1. Find our organization by Clerk org ID
  const org = await orm.em.findOne(Organization, {
    clerkOrgId: organization.id,
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
    clerkId: public_user_data.user_id,
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
      .filter(Boolean)
      .join(' ') || undefined,
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

**Step 3: Run tests**

Run: `pnpm --filter @eurocomply/api test clerk-membership`
Expected: handleMembershipCreated tests PASS, handleMembershipDeleted tests FAIL

**Step 4: Commit**

```bash
git add apps/api/src/webhooks/clerk.ts
git commit -m "feat(api): implement handleMembershipCreated webhook handler"
```

---

## Task 4: Implement handleMembershipDeleted

**Files:**
- Modify: `apps/api/src/webhooks/clerk.ts`

**Step 1: Implement handleMembershipDeleted**

```typescript
export async function handleMembershipDeleted(
  orm: MikroORM,
  event: ClerkOrganizationMembershipEvent
): Promise<{ status: string }> {
  const { organization, public_user_data } = event.data;

  const org = await orm.em.findOne(Organization, {
    clerkOrgId: organization.id,
  });

  if (!org) {
    return { status: 'org_not_found' };
  }

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

**Step 2: Run tests to verify they pass**

Run: `pnpm --filter @eurocomply/api test clerk-membership`
Expected: All PASS

**Step 3: Commit**

```bash
git add apps/api/src/webhooks/clerk.ts
git commit -m "feat(api): implement handleMembershipDeleted webhook handler"
```

---

## Task 5: Implement handleUserUpdated

**Files:**
- Modify: `apps/api/src/webhooks/clerk.ts`

**Step 1: Implement handleUserUpdated**

```typescript
export async function handleUserUpdated(
  orm: MikroORM,
  event: ClerkUserUpdatedEvent
): Promise<{ status: string; count: number }> {
  const em = orm.em.fork();

  const primaryEmail = event.data.email_addresses.find(
    (e) => e.id === event.data.primary_email_address_id
  )?.email_address;

  const name = [event.data.first_name, event.data.last_name]
    .filter(Boolean)
    .join(' ') || undefined;

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

**Step 2: Commit**

```bash
git add apps/api/src/webhooks/clerk.ts
git commit -m "feat(api): implement handleUserUpdated webhook handler (queues sync)"
```

---

## Task 6: Register Webhook Routes

**Files:**
- Modify: `apps/api/src/webhooks/clerk.ts` or create new route file

**Step 1: Add webhook route handler**

Create or update the webhook route to handle membership events:

```typescript
// Add to existing webhook handler or create new route
export function createMembershipWebhookHandler(orm: MikroORM) {
  return async (c: Context) => {
    const event = c.get('webhookPayload') as
      | ClerkOrganizationMembershipEvent
      | ClerkUserUpdatedEvent;

    try {
      switch (event.type) {
        case 'organizationMembership.created':
          return c.json(await handleMembershipCreated(orm, event));

        case 'organizationMembership.deleted':
          return c.json(await handleMembershipDeleted(orm, event));

        case 'user.updated':
          return c.json(await handleUserUpdated(orm, event as ClerkUserUpdatedEvent));

        default:
          return c.json({ status: 'ignored', type: (event as any).type });
      }
    } catch (error) {
      if (error instanceof RetryableError) {
        // Return 503 so Clerk retries
        return c.json({ error: error.message }, 503);
      }
      throw error;
    }
  };
}
```

**Step 2: Wire up in webhooks router**

Update the webhooks router to include the membership handler.

**Step 3: Commit**

```bash
git add apps/api/src/webhooks/clerk.ts
git commit -m "feat(api): add membership webhook route handler"
```

---

## Task 7: Run All Webhook Tests

**Step 1: Run full test suite**

Run: `pnpm --filter @eurocomply/api test webhook`
Expected: All tests PASS

**Step 2: Run typecheck**

Run: `pnpm --filter @eurocomply/api typecheck`
Expected: No errors

**Step 3: Final commit if any cleanup needed**

```bash
git status
# If any uncommitted changes:
git add -A
git commit -m "chore(api): cleanup after webhook handler additions"
```

---

## Verification Checklist

- [ ] ClerkOrganizationMembershipEvent type defined
- [ ] ClerkUserUpdatedEvent type defined
- [ ] RetryableError class defined
- [ ] handleMembershipCreated creates User + OrganizationUser
- [ ] handleMembershipCreated: first user gets MANAGER + isOrgAdmin
- [ ] handleMembershipCreated: subsequent users get NONE
- [ ] handleMembershipCreated: Clerk org:admin gets isOrgAdmin
- [ ] handleMembershipCreated: emits outbox event
- [ ] handleMembershipCreated: idempotent (returns already_exists)
- [ ] handleMembershipCreated: throws RetryableError if org not provisioned
- [ ] handleMembershipDeleted: soft deletes user (sets deletedAt)
- [ ] handleUserUpdated: queues outbox events for async processing
- [ ] Webhook route returns 503 for RetryableError
- [ ] All tests pass
- [ ] TypeScript compiles without errors

## Post-Implementation: Clerk Dashboard Setup

After code is deployed, register these webhooks in Clerk Dashboard:
1. Go to Webhooks in Clerk Dashboard
2. Add endpoint: `https://your-api-url/webhooks/clerk`
3. Select events:
   - `organizationMembership.created`
   - `organizationMembership.deleted`
   - `user.updated`
4. Copy signing secret to environment variable
