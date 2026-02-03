# User Auth Plan A: Database Entities

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create User, OrganizationUser entities and WorkspaceAuthority enum in the database package.

**Architecture:** Add three new files to packages/database/src/entities, update the index export, and update TenantProvisioner to create the tables when provisioning new tenants.

**Tech Stack:** MikroORM, PostgreSQL, TypeScript

**Prerequisites:** None - this is the foundation for all other auth work.

**Reference:** See `docs/plans/2026-01-23-user-auth-authorization-design.md` for full design context.

---

## Task 1: Create WorkspaceAuthority Enum

**Files:**
- Create: `packages/database/src/entities/WorkspaceAuthority.ts`
- Test: `packages/database/src/entities/WorkspaceAuthority.test.ts`

**Step 1: Write the test**

```typescript
// packages/database/src/entities/WorkspaceAuthority.test.ts
import { describe, it, expect } from 'vitest';
import { WorkspaceAuthority } from './WorkspaceAuthority.js';

describe('WorkspaceAuthority', () => {
  it('has all required authority levels', () => {
    expect(WorkspaceAuthority.NONE).toBe('NONE');
    expect(WorkspaceAuthority.VIEWER).toBe('VIEWER');
    expect(WorkspaceAuthority.CONTRIBUTOR).toBe('CONTRIBUTOR');
    expect(WorkspaceAuthority.EDITOR).toBe('EDITOR');
    expect(WorkspaceAuthority.MANAGER).toBe('MANAGER');
  });

  it('has exactly 5 levels', () => {
    const values = Object.values(WorkspaceAuthority);
    expect(values).toHaveLength(5);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @eurocomply/database test WorkspaceAuthority`
Expected: FAIL with "Cannot find module"

**Step 3: Write the implementation**

```typescript
// packages/database/src/entities/WorkspaceAuthority.ts
export enum WorkspaceAuthority {
  NONE = 'NONE',
  VIEWER = 'VIEWER',
  CONTRIBUTOR = 'CONTRIBUTOR',
  EDITOR = 'EDITOR',
  MANAGER = 'MANAGER',
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @eurocomply/database test WorkspaceAuthority`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/entities/WorkspaceAuthority.ts packages/database/src/entities/WorkspaceAuthority.test.ts
git commit -m "feat(database): add WorkspaceAuthority enum"
```

---

## Task 2: Create User Entity

**Files:**
- Create: `packages/database/src/entities/User.ts`
- Test: `packages/database/src/entities/User.test.ts`

**Step 1: Write the test**

```typescript
// packages/database/src/entities/User.test.ts
import { describe, it, expect } from 'vitest';
import { User } from './User.js';
import { EntitySchema, ReferenceKind } from '@mikro-orm/core';

describe('User Entity', () => {
  it('can be instantiated', () => {
    const user = new User();
    expect(user).toBeInstanceOf(User);
  });

  it('has required properties', () => {
    const user = new User();
    user.id = 'usr_123';
    user.clerkId = 'user_clerk456';
    user.email = 'test@example.com';
    user.name = 'Test User';
    user.avatarUrl = 'https://example.com/avatar.png';

    expect(user.id).toBe('usr_123');
    expect(user.clerkId).toBe('user_clerk456');
    expect(user.email).toBe('test@example.com');
    expect(user.name).toBe('Test User');
    expect(user.avatarUrl).toBe('https://example.com/avatar.png');
  });

  it('has optional deletedAt for soft delete', () => {
    const user = new User();
    expect(user.deletedAt).toBeUndefined();

    user.deletedAt = new Date();
    expect(user.deletedAt).toBeInstanceOf(Date);
  });

  it('has optional lastLoginAt', () => {
    const user = new User();
    expect(user.lastLoginAt).toBeUndefined();

    user.lastLoginAt = new Date();
    expect(user.lastLoginAt).toBeInstanceOf(Date);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @eurocomply/database test User.test`
Expected: FAIL with "Cannot find module"

**Step 3: Write the implementation**

```typescript
// packages/database/src/entities/User.ts
import { Entity, Property, Unique, OneToOne, Filter } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';

@Filter({ name: 'notDeleted', cond: { deletedAt: null }, default: true })
@Entity({ tableName: 'users' })
export class User extends BaseEntity {
  @Property({ type: 'text', name: 'clerk_id' })
  @Unique()
  clerkId!: string;

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

  // Relationship added in Task 3 after OrganizationUser exists
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @eurocomply/database test User.test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/entities/User.ts packages/database/src/entities/User.test.ts
git commit -m "feat(database): add User entity with soft delete filter"
```

---

## Task 3: Create OrganizationUser Entity

**Files:**
- Create: `packages/database/src/entities/OrganizationUser.ts`
- Test: `packages/database/src/entities/OrganizationUser.test.ts`
- Modify: `packages/database/src/entities/User.ts` (add relationship)

**Step 1: Write the test**

```typescript
// packages/database/src/entities/OrganizationUser.test.ts
import { describe, it, expect } from 'vitest';
import { OrganizationUser } from './OrganizationUser.js';
import { User } from './User.js';
import { WorkspaceAuthority } from './WorkspaceAuthority.js';

describe('OrganizationUser Entity', () => {
  it('can be instantiated', () => {
    const orgUser = new OrganizationUser();
    expect(orgUser).toBeInstanceOf(OrganizationUser);
  });

  it('has default authority of NONE for all workspaces', () => {
    const orgUser = new OrganizationUser();

    expect(orgUser.designAuthority).toBe(WorkspaceAuthority.NONE);
    expect(orgUser.operationsAuthority).toBe(WorkspaceAuthority.NONE);
    expect(orgUser.marketingAuthority).toBe(WorkspaceAuthority.NONE);
    expect(orgUser.complianceAuthority).toBe(WorkspaceAuthority.NONE);
  });

  it('has default isOrgAdmin of false', () => {
    const orgUser = new OrganizationUser();
    expect(orgUser.isOrgAdmin).toBe(false);
  });

  it('can set authorities to different levels', () => {
    const orgUser = new OrganizationUser();

    orgUser.designAuthority = WorkspaceAuthority.MANAGER;
    orgUser.operationsAuthority = WorkspaceAuthority.EDITOR;
    orgUser.marketingAuthority = WorkspaceAuthority.CONTRIBUTOR;
    orgUser.complianceAuthority = WorkspaceAuthority.VIEWER;

    expect(orgUser.designAuthority).toBe(WorkspaceAuthority.MANAGER);
    expect(orgUser.operationsAuthority).toBe(WorkspaceAuthority.EDITOR);
    expect(orgUser.marketingAuthority).toBe(WorkspaceAuthority.CONTRIBUTOR);
    expect(orgUser.complianceAuthority).toBe(WorkspaceAuthority.VIEWER);
  });

  it('can link to a User', () => {
    const user = new User();
    user.id = 'usr_123';
    user.clerkId = 'user_clerk456';
    user.email = 'test@example.com';

    const orgUser = new OrganizationUser();
    orgUser.user = user;

    expect(orgUser.user).toBe(user);
    expect(orgUser.user.email).toBe('test@example.com');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @eurocomply/database test OrganizationUser`
Expected: FAIL with "Cannot find module"

**Step 3: Write the implementation**

```typescript
// packages/database/src/entities/OrganizationUser.ts
import { Entity, Property, OneToOne, Enum } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { User } from './User.js';
import { WorkspaceAuthority } from './WorkspaceAuthority.js';

@Entity({ tableName: 'organization_users' })
export class OrganizationUser extends BaseEntity {
  @OneToOne(() => User, (user) => user.membership, { name: 'user_id', owner: true })
  user!: User;

  @Property({ type: 'boolean', name: 'is_org_admin', default: false })
  isOrgAdmin: boolean = false;

  @Enum({ items: () => WorkspaceAuthority, name: 'design_authority', default: WorkspaceAuthority.NONE })
  designAuthority: WorkspaceAuthority = WorkspaceAuthority.NONE;

  @Enum({ items: () => WorkspaceAuthority, name: 'operations_authority', default: WorkspaceAuthority.NONE })
  operationsAuthority: WorkspaceAuthority = WorkspaceAuthority.NONE;

  @Enum({ items: () => WorkspaceAuthority, name: 'marketing_authority', default: WorkspaceAuthority.NONE })
  marketingAuthority: WorkspaceAuthority = WorkspaceAuthority.NONE;

  @Enum({ items: () => WorkspaceAuthority, name: 'compliance_authority', default: WorkspaceAuthority.NONE })
  complianceAuthority: WorkspaceAuthority = WorkspaceAuthority.NONE;
}
```

**Step 4: Update User entity to add the relationship**

```typescript
// packages/database/src/entities/User.ts
// Add this import at the top:
import { OrganizationUser } from './OrganizationUser.js';

// Add this property to the User class:
@OneToOne(() => OrganizationUser, (ou) => ou.user)
membership?: OrganizationUser;
```

**Step 5: Run test to verify it passes**

Run: `pnpm --filter @eurocomply/database test OrganizationUser`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/database/src/entities/OrganizationUser.ts packages/database/src/entities/OrganizationUser.test.ts packages/database/src/entities/User.ts
git commit -m "feat(database): add OrganizationUser entity with workspace authorities"
```

---

## Task 4: Export Entities from Index

**Files:**
- Modify: `packages/database/src/entities/index.ts`

**Step 1: Read current exports**

Run: `cat packages/database/src/entities/index.ts`

**Step 2: Add new exports**

Add these lines to the existing exports:

```typescript
export * from './WorkspaceAuthority.js';
export * from './User.js';
export * from './OrganizationUser.js';
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm --filter @eurocomply/database typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/database/src/entities/index.ts
git commit -m "feat(database): export User, OrganizationUser, WorkspaceAuthority"
```

---

## Task 5: Update TenantProvisioner

**Files:**
- Modify: `packages/database/src/provisioning/TenantProvisioner.ts`
- Test: Update existing provisioning test

**Step 1: Read current TenantProvisioner**

Run: `cat packages/database/src/provisioning/TenantProvisioner.ts`

**Step 2: Add user tables DDL**

Find the method that creates tenant schema tables. Add the following SQL after the existing table creation:

```sql
-- Users table
CREATE TABLE IF NOT EXISTS ${schemaName}.users (
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

CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON ${schemaName}.users(clerk_id);
CREATE INDEX IF NOT EXISTS idx_users_deleted ON ${schemaName}.users(deleted_at) WHERE deleted_at IS NULL;

-- Organization users table
CREATE TABLE IF NOT EXISTS ${schemaName}.organization_users (
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

CREATE INDEX IF NOT EXISTS idx_org_users_admin ON ${schemaName}.organization_users(is_org_admin) WHERE is_org_admin = true;
```

**Step 3: Run provisioning tests**

Run: `pnpm --filter @eurocomply/database test provision`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/database/src/provisioning/TenantProvisioner.ts
git commit -m "feat(database): add User and OrganizationUser tables to tenant provisioning"
```

---

## Task 6: Run All Database Tests

**Step 1: Run full test suite**

Run: `pnpm --filter @eurocomply/database test`
Expected: All tests PASS

**Step 2: Run typecheck**

Run: `pnpm --filter @eurocomply/database typecheck`
Expected: No errors

**Step 3: Final commit if any cleanup needed**

```bash
git status
# If any uncommitted changes:
git add -A
git commit -m "chore(database): cleanup after entity additions"
```

---

## Verification Checklist

- [ ] WorkspaceAuthority enum has 5 levels: NONE, VIEWER, CONTRIBUTOR, EDITOR, MANAGER
- [ ] User entity has: id, clerkId, email, name, avatarUrl, lastLoginAt, deletedAt, membership
- [ ] User entity has @Filter for soft delete (default: true)
- [ ] OrganizationUser entity has: id, user, isOrgAdmin, [design|operations|marketing|compliance]Authority
- [ ] OrganizationUser defaults all authorities to NONE
- [ ] OrganizationUser defaults isOrgAdmin to false
- [ ] Entities exported from packages/database/src/entities/index.ts
- [ ] TenantProvisioner creates users and organization_users tables
- [ ] All tests pass
- [ ] TypeScript compiles without errors
