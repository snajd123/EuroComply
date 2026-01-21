# Core Application Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Status:** ✅ Complete (2026-01-17)

**Goal:** Build the foundational backend application code for EuroComply - database layer, auth middleware, events, API skeleton, and multi-tenancy.

> **Note:** This plan covers APPLICATION CODE (TypeScript packages and apps). For cloud infrastructure deployment (AWS, Cloudflare), see [DevOps Infrastructure Design](./2026-01-16-devops-infrastructure-design.md).

**Architecture:** Hono API framework on Node.js with PostgreSQL (schema-per-tenant), Clerk authentication, transactional outbox for events, and Redis for caching. All code in TypeScript with strict mode.

**Tech Stack:** Node.js 20, TypeScript 5.3, Hono, PostgreSQL 15, Prisma, Clerk, Redis, Vitest, pnpm

---

## Phase 1: Project Scaffolding

### Task 1: Initialize Monorepo

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.json`
- Create: `.nvmrc`
- Create: `.gitignore`

**Step 1: Initialize package.json**

```bash
cd /root/Documents/EuroComply
pnpm init
```

**Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**Step 3: Create root tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true
  }
}
```

**Step 4: Create .nvmrc**

```
20
```

**Step 5: Create .gitignore**

```gitignore
# Dependencies
node_modules/
.pnpm-store/

# Build
dist/
*.tsbuildinfo

# Environment
.env
.env.local
.env.*.local

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
logs/

# Test coverage
coverage/

# Prisma
prisma/migrations/*.sql.backup
```

**Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.json .nvmrc .gitignore
git commit -m "chore: initialize pnpm monorepo with TypeScript"
```

---

### Task 2: Create API Application Structure

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/index.ts`

**Step 1: Create apps/api directory**

```bash
mkdir -p apps/api/src
```

**Step 2: Create apps/api/package.json**

```json
{
  "name": "@eurocomply/api",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "hono": "^4.0.0",
    "@hono/node-server": "^1.8.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "tsx": "^4.7.0",
    "vitest": "^1.2.0",
    "@types/node": "^20.11.0"
  }
}
```

**Step 3: Create apps/api/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Create apps/api/src/index.ts**

```typescript
import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const port = parseInt(process.env.PORT || '3000', 10);

console.log(`Starting server on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
```

**Step 5: Install dependencies**

```bash
cd /root/Documents/EuroComply
pnpm install
```

**Step 6: Verify server starts**

```bash
cd apps/api && pnpm dev &
sleep 2
curl http://localhost:3000/health
# Expected: {"status":"ok","timestamp":"..."}
pkill -f "tsx watch"
```

**Step 7: Commit**

```bash
git add apps/
git commit -m "feat: add Hono API application skeleton"
```

---

### Task 3: Add Shared Packages Structure

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`

**Step 1: Create package directories**

```bash
mkdir -p packages/db/src packages/shared/src
```

**Step 2: Create packages/shared/package.json**

```json
{
  "name": "@eurocomply/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.3.0"
  }
}
```

**Step 3: Create packages/shared/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Create packages/shared/src/index.ts**

```typescript
// Shared types and utilities

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

export function err(code: string, message: string, details?: Record<string, unknown>): ApiResponse<never> {
  return { success: false, error: { code, message, details } };
}
```

**Step 5: Create packages/db/package.json**

```json
{
  "name": "@eurocomply/db",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@prisma/client": "^5.9.0"
  },
  "devDependencies": {
    "prisma": "^5.9.0",
    "typescript": "^5.3.0"
  }
}
```

**Step 6: Create packages/db/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 7: Install and build**

```bash
cd /root/Documents/EuroComply
pnpm install
pnpm -r build
```

**Step 8: Commit**

```bash
git add packages/
git commit -m "feat: add shared and db packages"
```

---

## Phase 2: Database Layer

### Task 4: Prisma Schema - Core Tables

**Files:**
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/src/index.ts`

**Step 1: Create prisma directory**

```bash
mkdir -p packages/db/prisma
```

**Step 2: Create packages/db/prisma/schema.prisma**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================
// SHARED SCHEMA (public) - Platform-wide tables
// ============================================

model Organization {
  id                String   @id @default(cuid())
  name              String
  slug              String   @unique
  schemaName        String   @unique @map("schema_name")

  // Billing
  stripeCustomerId  String?  @map("stripe_customer_id")
  subscriptionTier  String   @default("starter") @map("subscription_tier")
  subscriptionStatus String  @default("active") @map("subscription_status")

  // Limits
  userLimit         Int      @default(20) @map("user_limit")
  storageLimit      BigInt   @default(536870912000) @map("storage_limit") // 500GB in bytes

  // Timestamps
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  // Relations
  users             OrganizationUser[]

  @@map("organizations")
}

model User {
  id              String   @id @default(cuid())
  clerkId         String   @unique @map("clerk_id")
  email           String   @unique
  name            String?
  avatarUrl       String?  @map("avatar_url")

  // Timestamps
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")
  lastLoginAt     DateTime? @map("last_login_at")

  // Relations
  organizations   OrganizationUser[]

  @@map("users")
}

model OrganizationUser {
  id             String   @id @default(cuid())
  organizationId String   @map("organization_id")
  userId         String   @map("user_id")

  // Role and permissions
  role           String   @default("member") // owner, admin, member

  // Per-workspace authorities (VIEWER, CONTRIBUTOR, EDITOR, MANAGER)
  designAuthority     String @default("VIEWER") @map("design_authority")
  operationsAuthority String @default("VIEWER") @map("operations_authority")
  marketingAuthority  String @default("VIEWER") @map("marketing_authority")
  complianceAuthority String @default("VIEWER") @map("compliance_authority")

  // Timestamps
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  // Relations
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([organizationId, userId])
  @@map("organization_users")
}

// ============================================
// OUTBOX - Event system
// ============================================

model OutboxEvent {
  id            String   @id @default(cuid())
  organizationId String  @map("organization_id")

  // Event metadata
  eventType     String   @map("event_type")
  aggregateType String   @map("aggregate_type")
  aggregateId   String   @map("aggregate_id")

  // Payload
  payload       Json

  // Processing status
  status        String   @default("PENDING") // PENDING, PROCESSING, DELIVERED, FAILED
  attempts      Int      @default(0)
  lastError     String?  @map("last_error")

  // Timestamps
  createdAt     DateTime @default(now()) @map("created_at")
  processedAt   DateTime? @map("processed_at")

  @@index([status, createdAt])
  @@index([organizationId, eventType])
  @@map("outbox_events")
}
```

**Step 3: Create packages/db/src/index.ts**

```typescript
import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

// Singleton pattern for Prisma client
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { prisma as db };
```

**Step 4: Create .env for database**

```bash
echo 'DATABASE_URL="postgresql://postgres:postgres@localhost:5432/eurocomply?schema=public"' > packages/db/.env
```

**Step 5: Generate Prisma client**

```bash
cd packages/db && pnpm db:generate
```

**Step 6: Commit**

```bash
git add packages/db/
git commit -m "feat: add Prisma schema with Organization, User, and OutboxEvent"
```

---

### Task 5: Multi-Tenant Schema Management

**Files:**
- Create: `packages/db/src/tenant.ts`
- Create: `packages/db/src/migrations/tenant-schema.sql`

**Step 1: Create packages/db/src/tenant.ts**

```typescript
import { PrismaClient } from '@prisma/client';

/**
 * Creates a new tenant schema with all required tables.
 * Called when a new organization is created.
 */
export async function createTenantSchema(
  prisma: PrismaClient,
  schemaName: string
): Promise<void> {
  // Validate schema name (alphanumeric + underscore only)
  if (!/^[a-z][a-z0-9_]*$/.test(schemaName)) {
    throw new Error(`Invalid schema name: ${schemaName}`);
  }

  // Create schema
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

  // Create tenant tables
  await prisma.$executeRawUnsafe(`
    -- Products table
    CREATE TABLE IF NOT EXISTS "${schemaName}".products (
      id VARCHAR(30) PRIMARY KEY,
      sku VARCHAR(100) NOT NULL,
      name VARCHAR(500) NOT NULL,
      description TEXT,
      category VARCHAR(100),
      status VARCHAR(20) DEFAULT 'DRAFT',
      created_by VARCHAR(30) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      archived_at TIMESTAMPTZ,
      UNIQUE(sku)
    );

    CREATE INDEX IF NOT EXISTS idx_products_sku ON "${schemaName}".products(sku);
    CREATE INDEX IF NOT EXISTS idx_products_status ON "${schemaName}".products(status);
  `);

  await prisma.$executeRawUnsafe(`
    -- Audit log table (per-tenant)
    CREATE TABLE IF NOT EXISTS "${schemaName}".audit_log (
      id VARCHAR(30) PRIMARY KEY,
      user_id VARCHAR(30) NOT NULL,
      action VARCHAR(50) NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      entity_id VARCHAR(30) NOT NULL,
      old_values JSONB,
      new_values JSONB,
      ip_address VARCHAR(45),
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_audit_entity
      ON "${schemaName}".audit_log(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_audit_user
      ON "${schemaName}".audit_log(user_id, created_at DESC);
  `);
}

/**
 * Drops a tenant schema (use with extreme caution!).
 * Only for cleanup during development or account deletion.
 */
export async function dropTenantSchema(
  prisma: PrismaClient,
  schemaName: string
): Promise<void> {
  if (!/^[a-z][a-z0-9_]*$/.test(schemaName)) {
    throw new Error(`Invalid schema name: ${schemaName}`);
  }

  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
}

/**
 * Lists all tenant schemas in the database.
 */
export async function listTenantSchemas(prisma: PrismaClient): Promise<string[]> {
  const result = await prisma.$queryRaw<{ schema_name: string }[]>`
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%'
    ORDER BY schema_name
  `;
  return result.map((r) => r.schema_name);
}
```

**Step 2: Commit**

```bash
git add packages/db/src/tenant.ts
git commit -m "feat: add multi-tenant schema management utilities"
```

---

### Task 6: Tenant-Aware Database Client

**Files:**
- Create: `packages/db/src/client.ts`
- Modify: `packages/db/src/index.ts`

**Step 1: Create packages/db/src/client.ts**

```typescript
import { PrismaClient, Prisma } from '@prisma/client';

export interface TenantContext {
  organizationId: string;
  schemaName: string;
  userId: string;
}

/**
 * Creates a Prisma client configured for a specific tenant schema.
 * Uses Prisma's $extends to inject schema context.
 */
export function createTenantClient(
  baseClient: PrismaClient,
  context: TenantContext
) {
  return baseClient.$extends({
    query: {
      $allOperations({ operation, model, args, query }) {
        // For raw queries, we need to handle schema manually
        // For model queries, Prisma handles it
        return query(args);
      },
    },
    client: {
      $tenant: context,

      /**
       * Execute a raw query in the tenant's schema
       */
      async $queryTenant<T>(sql: string, params: unknown[] = []): Promise<T> {
        const schemaQuery = `SET search_path TO "${context.schemaName}", public; ${sql}`;
        return baseClient.$queryRawUnsafe(schemaQuery, ...params) as Promise<T>;
      },

      /**
       * Execute a raw command in the tenant's schema
       */
      async $executeTenant(sql: string, params: unknown[] = []): Promise<number> {
        const schemaQuery = `SET search_path TO "${context.schemaName}", public; ${sql}`;
        return baseClient.$executeRawUnsafe(schemaQuery, ...params);
      },
    },
  });
}

export type TenantPrismaClient = ReturnType<typeof createTenantClient>;

/**
 * Connection pool manager for tenant connections.
 * Caches extended clients per organization to avoid recreation overhead.
 */
class TenantConnectionManager {
  private clients: Map<string, TenantPrismaClient> = new Map();
  private baseClient: PrismaClient;

  constructor(baseClient: PrismaClient) {
    this.baseClient = baseClient;
  }

  getClient(context: TenantContext): TenantPrismaClient {
    const cacheKey = `${context.organizationId}:${context.userId}`;

    let client = this.clients.get(cacheKey);
    if (!client) {
      client = createTenantClient(this.baseClient, context);
      this.clients.set(cacheKey, client);

      // Limit cache size (LRU-style cleanup)
      if (this.clients.size > 1000) {
        const firstKey = this.clients.keys().next().value;
        if (firstKey) this.clients.delete(firstKey);
      }
    }

    return client;
  }

  clearCache(): void {
    this.clients.clear();
  }
}

// Singleton manager instance
let manager: TenantConnectionManager | null = null;

export function getTenantConnectionManager(baseClient: PrismaClient): TenantConnectionManager {
  if (!manager) {
    manager = new TenantConnectionManager(baseClient);
  }
  return manager;
}
```

**Step 2: Update packages/db/src/index.ts**

```typescript
import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';
export * from './tenant.js';
export * from './client.js';

// Singleton pattern for Prisma client
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { prisma as db };
```

**Step 3: Commit**

```bash
git add packages/db/src/
git commit -m "feat: add tenant-aware database client with connection pooling"
```

---

## Phase 3: Authentication

### Task 7: Clerk Authentication Middleware

**Files:**
- Create: `apps/api/src/middleware/auth.ts`
- Create: `apps/api/src/types/context.ts`

**Step 1: Add Clerk dependencies to api package**

Add to `apps/api/package.json` dependencies:
```json
{
  "dependencies": {
    "@clerk/backend": "^1.0.0"
  }
}
```

**Step 2: Create apps/api/src/types/context.ts**

```typescript
import type { Context } from 'hono';
import type { TenantPrismaClient } from '@eurocomply/db';

export interface AuthUser {
  id: string;         // Our internal user ID
  clerkId: string;    // Clerk's user ID
  email: string;
  name: string | null;
}

export interface TenantInfo {
  organizationId: string;
  schemaName: string;
  name: string;
  subscriptionTier: string;
}

export interface UserPermissions {
  role: string;
  designAuthority: string;
  operationsAuthority: string;
  marketingAuthority: string;
  complianceAuthority: string;
}

export interface AppVariables {
  user: AuthUser;
  tenant: TenantInfo;
  permissions: UserPermissions;
  db: TenantPrismaClient;
}

export type AppContext = Context<{ Variables: AppVariables }>;
```

**Step 3: Create apps/api/src/middleware/auth.ts**

```typescript
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { verifyToken } from '@clerk/backend';
import { prisma, getTenantConnectionManager } from '@eurocomply/db';
import type { AppVariables } from '../types/context.js';

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

if (!CLERK_SECRET_KEY) {
  console.warn('CLERK_SECRET_KEY not set - auth will fail');
}

/**
 * Authentication middleware.
 * Verifies Clerk JWT and loads user + organization context.
 */
export const authMiddleware = createMiddleware<{ Variables: AppVariables }>(
  async (c, next) => {
    // Extract token from Authorization header
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new HTTPException(401, { message: 'Missing authorization token' });
    }

    const token = authHeader.slice(7);

    try {
      // Verify JWT with Clerk
      const payload = await verifyToken(token, {
        secretKey: CLERK_SECRET_KEY!,
      });

      const clerkUserId = payload.sub;
      if (!clerkUserId) {
        throw new HTTPException(401, { message: 'Invalid token: missing subject' });
      }

      // Get organization ID from header or query param
      const orgId = c.req.header('X-Organization-ID') || c.req.query('org');
      if (!orgId) {
        throw new HTTPException(400, { message: 'Missing organization ID' });
      }

      // Load user from database
      const user = await prisma.user.findUnique({
        where: { clerkId: clerkUserId },
      });

      if (!user) {
        throw new HTTPException(401, { message: 'User not found' });
      }

      // Load organization and membership
      const membership = await prisma.organizationUser.findUnique({
        where: {
          organizationId_userId: {
            organizationId: orgId,
            userId: user.id,
          },
        },
        include: {
          organization: true,
        },
      });

      if (!membership) {
        throw new HTTPException(403, { message: 'Not a member of this organization' });
      }

      // Set context variables
      c.set('user', {
        id: user.id,
        clerkId: user.clerkId,
        email: user.email,
        name: user.name,
      });

      c.set('tenant', {
        organizationId: membership.organization.id,
        schemaName: membership.organization.schemaName,
        name: membership.organization.name,
        subscriptionTier: membership.organization.subscriptionTier,
      });

      c.set('permissions', {
        role: membership.role,
        designAuthority: membership.designAuthority,
        operationsAuthority: membership.operationsAuthority,
        marketingAuthority: membership.marketingAuthority,
        complianceAuthority: membership.complianceAuthority,
      });

      // Create tenant-scoped database client
      const tenantManager = getTenantConnectionManager(prisma);
      const tenantClient = tenantManager.getClient({
        organizationId: membership.organization.id,
        schemaName: membership.organization.schemaName,
        userId: user.id,
      });

      c.set('db', tenantClient);

      // Update last login (fire and forget)
      prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }).catch(() => {}); // Ignore errors

      await next();
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      console.error('Auth error:', error);
      throw new HTTPException(401, { message: 'Authentication failed' });
    }
  }
);

/**
 * Optional auth - sets user context if token present, continues otherwise.
 */
export const optionalAuthMiddleware = createMiddleware<{ Variables: Partial<AppVariables> }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      await next();
      return;
    }

    // Delegate to full auth middleware
    try {
      await authMiddleware(c, next);
    } catch {
      // If auth fails, continue without user context
      await next();
    }
  }
);
```

**Step 4: Commit**

```bash
git add apps/api/src/
git commit -m "feat: add Clerk authentication middleware with tenant context"
```

---

### Task 8: Authorization Helpers

**Files:**
- Create: `apps/api/src/middleware/authorize.ts`
- Create: `packages/shared/src/authorities.ts`

**Step 1: Create packages/shared/src/authorities.ts**

```typescript
/**
 * Authority levels for workspace access.
 * Higher levels include all permissions of lower levels.
 */
export const Authority = {
  VIEWER: 'VIEWER',
  CONTRIBUTOR: 'CONTRIBUTOR',
  EDITOR: 'EDITOR',
  MANAGER: 'MANAGER',
} as const;

export type AuthorityLevel = (typeof Authority)[keyof typeof Authority];

/**
 * Authority hierarchy (higher index = more permissions)
 */
const AUTHORITY_HIERARCHY: AuthorityLevel[] = [
  Authority.VIEWER,
  Authority.CONTRIBUTOR,
  Authority.EDITOR,
  Authority.MANAGER,
];

/**
 * Check if user has at least the required authority level.
 */
export function hasAuthority(
  userAuthority: AuthorityLevel,
  requiredAuthority: AuthorityLevel
): boolean {
  const userLevel = AUTHORITY_HIERARCHY.indexOf(userAuthority);
  const requiredLevel = AUTHORITY_HIERARCHY.indexOf(requiredAuthority);
  return userLevel >= requiredLevel;
}

/**
 * Workspace types for permission checks.
 */
export const Workspace = {
  DESIGN: 'design',
  OPERATIONS: 'operations',
  MARKETING: 'marketing',
  COMPLIANCE: 'compliance',
} as const;

export type WorkspaceType = (typeof Workspace)[keyof typeof Workspace];

/**
 * Permission definitions per authority level.
 */
export const AUTHORITY_PERMISSIONS: Record<AuthorityLevel, string[]> = {
  VIEWER: ['read'],
  CONTRIBUTOR: ['read', 'create', 'update:own'],
  EDITOR: ['read', 'create', 'update', 'delete:own', 'approve'],
  MANAGER: ['read', 'create', 'update', 'delete', 'approve', 'configure'],
};
```

**Step 2: Update packages/shared/src/index.ts**

```typescript
// Shared types and utilities

export * from './authorities.js';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

export function err(code: string, message: string, details?: Record<string, unknown>): ApiResponse<never> {
  return { success: false, error: { code, message, details } };
}
```

**Step 3: Create apps/api/src/middleware/authorize.ts**

```typescript
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { hasAuthority, type AuthorityLevel, type WorkspaceType } from '@eurocomply/shared';
import type { AppVariables } from '../types/context.js';

/**
 * Authorization middleware factory.
 * Checks if the user has the required authority for a workspace.
 */
export function requireAuthority(
  workspace: WorkspaceType,
  requiredAuthority: AuthorityLevel
) {
  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const permissions = c.get('permissions');

    if (!permissions) {
      throw new HTTPException(401, { message: 'Not authenticated' });
    }

    // Get user's authority for the specified workspace
    const authorityKey = `${workspace}Authority` as keyof typeof permissions;
    const userAuthority = permissions[authorityKey] as AuthorityLevel;

    if (!hasAuthority(userAuthority, requiredAuthority)) {
      throw new HTTPException(403, {
        message: `Insufficient permissions. Required: ${requiredAuthority} for ${workspace}, have: ${userAuthority}`,
      });
    }

    await next();
  });
}

/**
 * Require user to be an organization owner or admin.
 */
export const requireOrgAdmin = createMiddleware<{ Variables: AppVariables }>(
  async (c, next) => {
    const permissions = c.get('permissions');

    if (!permissions) {
      throw new HTTPException(401, { message: 'Not authenticated' });
    }

    if (!['owner', 'admin'].includes(permissions.role)) {
      throw new HTTPException(403, {
        message: 'Organization admin access required',
      });
    }

    await next();
  }
);

/**
 * Require user to be the organization owner.
 */
export const requireOrgOwner = createMiddleware<{ Variables: AppVariables }>(
  async (c, next) => {
    const permissions = c.get('permissions');

    if (!permissions) {
      throw new HTTPException(401, { message: 'Not authenticated' });
    }

    if (permissions.role !== 'owner') {
      throw new HTTPException(403, {
        message: 'Organization owner access required',
      });
    }

    await next();
  }
);
```

**Step 4: Commit**

```bash
git add packages/shared/src/ apps/api/src/middleware/
git commit -m "feat: add RBAC authorization middleware with workspace authorities"
```

---

## Phase 4: Event System

### Task 9: Outbox Event Publisher

**Files:**
- Create: `packages/db/src/events.ts`

**Step 1: Create packages/db/src/events.ts**

```typescript
import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

export interface EventPayload {
  [key: string]: unknown;
}

export interface OutboxEventInput {
  organizationId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: EventPayload;
}

/**
 * Publishes an event to the outbox within a transaction.
 * The event will be picked up by a separate processor for delivery.
 *
 * @example
 * ```typescript
 * await prisma.$transaction(async (tx) => {
 *   // Your business logic
 *   await tx.product.create({ ... });
 *
 *   // Publish event atomically
 *   await publishEvent(tx, {
 *     organizationId: 'org_123',
 *     eventType: 'product.created',
 *     aggregateType: 'product',
 *     aggregateId: 'prod_456',
 *     payload: { name: 'New Product', sku: 'SKU-001' },
 *   });
 * });
 * ```
 */
export async function publishEvent(
  tx: Prisma.TransactionClient,
  event: OutboxEventInput
): Promise<string> {
  const id = `evt_${randomUUID().replace(/-/g, '')}`;

  await tx.outboxEvent.create({
    data: {
      id,
      organizationId: event.organizationId,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload as Prisma.JsonObject,
      status: 'PENDING',
      attempts: 0,
    },
  });

  return id;
}

/**
 * Batch publish multiple events within a transaction.
 */
export async function publishEvents(
  tx: Prisma.TransactionClient,
  events: OutboxEventInput[]
): Promise<string[]> {
  const ids: string[] = [];

  for (const event of events) {
    const id = await publishEvent(tx, event);
    ids.push(id);
  }

  return ids;
}

/**
 * Event type constants for type safety.
 */
export const EventTypes = {
  // Product events
  PRODUCT_CREATED: 'product.created',
  PRODUCT_UPDATED: 'product.updated',
  PRODUCT_DELETED: 'product.deleted',
  PRODUCT_ARCHIVED: 'product.archived',

  // Version events
  VERSION_CREATED: 'version.created',
  VERSION_RELEASED: 'version.released',
  VERSION_CHECKED_OUT: 'version.checked_out',

  // DPP events
  DPP_COMMISSIONED: 'dpp.commissioned',
  DPP_PROVISIONED: 'dpp.provisioned',
  DPP_RECALLED: 'dpp.recalled',
  DPP_DECOMMISSIONED: 'dpp.decommissioned',

  // Batch events
  BATCH_CREATED: 'batch.created',
  BATCH_RELEASED: 'batch.released',
  BATCH_RECALLED: 'batch.recalled',

  // User events
  USER_INVITED: 'user.invited',
  USER_JOINED: 'user.joined',
  USER_REMOVED: 'user.removed',

  // Organization events
  ORG_CREATED: 'organization.created',
  ORG_UPDATED: 'organization.updated',
  ORG_SUBSCRIPTION_CHANGED: 'organization.subscription_changed',
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];
```

**Step 2: Update packages/db/src/index.ts to export events**

Add to the file:
```typescript
export * from './events.js';
```

**Step 3: Commit**

```bash
git add packages/db/src/
git commit -m "feat: add transactional outbox event publisher"
```

---

### Task 10: Outbox Event Processor

**Files:**
- Create: `apps/api/src/services/outbox-processor.ts`

**Step 1: Create apps/api/src/services/outbox-processor.ts**

```typescript
import { prisma, type OutboxEvent } from '@eurocomply/db';

export interface EventHandler {
  (event: OutboxEvent): Promise<void>;
}

/**
 * Outbox processor that polls for pending events and delivers them.
 * Uses at-least-once delivery with exponential backoff.
 */
export class OutboxProcessor {
  private handlers: Map<string, EventHandler[]> = new Map();
  private isRunning = false;
  private pollInterval: NodeJS.Timeout | null = null;

  private readonly POLL_INTERVAL_MS = 100; // 100ms polling
  private readonly BATCH_SIZE = 100;
  private readonly MAX_ATTEMPTS = 10;
  private readonly BACKOFF_BASE_MS = 1000; // 1 second

  /**
   * Register a handler for an event type.
   * Multiple handlers can be registered for the same event type.
   */
  on(eventType: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType) || [];
    handlers.push(handler);
    this.handlers.set(eventType, handlers);
  }

  /**
   * Register a handler for all events (wildcard).
   */
  onAll(handler: EventHandler): void {
    this.on('*', handler);
  }

  /**
   * Start the processor.
   */
  start(): void {
    if (this.isRunning) {
      console.warn('Outbox processor already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting outbox processor...');
    this.poll();
  }

  /**
   * Stop the processor gracefully.
   */
  stop(): void {
    this.isRunning = false;
    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
      this.pollInterval = null;
    }
    console.log('Outbox processor stopped');
  }

  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      await this.processBatch();
    } catch (error) {
      console.error('Outbox processor error:', error);
    }

    // Schedule next poll
    this.pollInterval = setTimeout(() => this.poll(), this.POLL_INTERVAL_MS);
  }

  private async processBatch(): Promise<void> {
    // Fetch pending events that are ready for retry
    const events = await prisma.outboxEvent.findMany({
      where: {
        OR: [
          { status: 'PENDING' },
          {
            status: 'FAILED',
            attempts: { lt: this.MAX_ATTEMPTS },
            // Simple backoff: wait longer after each failure
            processedAt: {
              lt: new Date(Date.now() - this.calculateBackoff(1)), // Will be refined per-event
            },
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: this.BATCH_SIZE,
    });

    for (const event of events) {
      // Check backoff for failed events
      if (event.status === 'FAILED' && event.processedAt) {
        const backoffMs = this.calculateBackoff(event.attempts);
        const retryAfter = new Date(event.processedAt.getTime() + backoffMs);
        if (new Date() < retryAfter) {
          continue; // Not ready for retry yet
        }
      }

      await this.processEvent(event);
    }
  }

  private async processEvent(event: OutboxEvent): Promise<void> {
    // Mark as processing
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { status: 'PROCESSING' },
    });

    try {
      // Get handlers for this event type
      const typeHandlers = this.handlers.get(event.eventType) || [];
      const wildcardHandlers = this.handlers.get('*') || [];
      const allHandlers = [...typeHandlers, ...wildcardHandlers];

      if (allHandlers.length === 0) {
        console.warn(`No handlers for event type: ${event.eventType}`);
      }

      // Execute all handlers
      await Promise.all(allHandlers.map((handler) => handler(event)));

      // Mark as delivered
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'DELIVERED',
          processedAt: new Date(),
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Mark as failed
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'FAILED',
          attempts: event.attempts + 1,
          lastError: errorMessage,
          processedAt: new Date(),
        },
      });

      console.error(`Event ${event.id} failed (attempt ${event.attempts + 1}):`, errorMessage);
    }
  }

  private calculateBackoff(attempts: number): number {
    // Exponential backoff: 1s, 1min, 5min, 15min, 30min, 1h (capped)
    const backoffs = [1000, 60000, 300000, 900000, 1800000, 3600000];
    return backoffs[Math.min(attempts, backoffs.length - 1)] || 3600000;
  }
}

// Singleton instance
export const outboxProcessor = new OutboxProcessor();
```

**Step 2: Commit**

```bash
git add apps/api/src/services/
git commit -m "feat: add outbox event processor with exponential backoff"
```

---

## Phase 5: API Structure

### Task 11: Error Handling Middleware

**Files:**
- Create: `apps/api/src/middleware/error-handler.ts`
- Create: `apps/api/src/lib/errors.ts`

**Step 1: Create apps/api/src/lib/errors.ts**

```typescript
/**
 * Base application error class.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Resource not found error.
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      'NOT_FOUND',
      id ? `${resource} with ID '${id}' not found` : `${resource} not found`,
      404
    );
    this.name = 'NotFoundError';
  }
}

/**
 * Validation error for invalid input.
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Conflict error (e.g., duplicate entry).
 */
export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('CONFLICT', message, 409, details);
    this.name = 'ConflictError';
  }
}

/**
 * Rate limit exceeded error.
 */
export class RateLimitError extends AppError {
  constructor(retryAfterSeconds?: number) {
    super('RATE_LIMIT_EXCEEDED', 'Too many requests', 429, {
      retryAfter: retryAfterSeconds,
    });
    this.name = 'RateLimitError';
  }
}

/**
 * Subscription/quota limit error.
 */
export class QuotaExceededError extends AppError {
  constructor(resource: string, limit: number) {
    super('QUOTA_EXCEEDED', `${resource} limit (${limit}) exceeded`, 402, {
      resource,
      limit,
    });
    this.name = 'QuotaExceededError';
  }
}
```

**Step 2: Create apps/api/src/middleware/error-handler.ts**

```typescript
import { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { AppError } from '../lib/errors.js';
import { err } from '@eurocomply/shared';

/**
 * Global error handler middleware.
 * Converts all errors to consistent API response format.
 */
export const errorHandler: ErrorHandler = (error, c) => {
  console.error('Request error:', {
    method: c.req.method,
    path: c.req.path,
    error: error.message,
    stack: error.stack,
  });

  // Handle our custom errors
  if (error instanceof AppError) {
    return c.json(
      err(error.code, error.message, error.details),
      error.statusCode as 400 | 401 | 403 | 404 | 409 | 429 | 500
    );
  }

  // Handle Hono HTTP exceptions
  if (error instanceof HTTPException) {
    return c.json(
      err('HTTP_ERROR', error.message),
      error.status
    );
  }

  // Handle Prisma errors
  if (error.constructor.name === 'PrismaClientKnownRequestError') {
    const prismaError = error as { code: string; meta?: { target?: string[] } };

    if (prismaError.code === 'P2002') {
      // Unique constraint violation
      const fields = prismaError.meta?.target?.join(', ') || 'field';
      return c.json(
        err('DUPLICATE_ENTRY', `A record with this ${fields} already exists`),
        409
      );
    }

    if (prismaError.code === 'P2025') {
      // Record not found
      return c.json(
        err('NOT_FOUND', 'Record not found'),
        404
      );
    }
  }

  // Handle validation errors (e.g., from Zod)
  if (error.name === 'ZodError') {
    const zodError = error as { errors: Array<{ path: string[]; message: string }> };
    return c.json(
      err('VALIDATION_ERROR', 'Invalid request data', {
        errors: zodError.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      }),
      400
    );
  }

  // Unknown error - don't leak details in production
  const message = process.env.NODE_ENV === 'development'
    ? error.message
    : 'An unexpected error occurred';

  return c.json(err('INTERNAL_ERROR', message), 500);
};
```

**Step 3: Commit**

```bash
git add apps/api/src/lib/ apps/api/src/middleware/
git commit -m "feat: add error handling middleware with custom error classes"
```

---

### Task 12: Request Logging Middleware

**Files:**
- Create: `apps/api/src/middleware/logger.ts`

**Step 1: Create apps/api/src/middleware/logger.ts**

```typescript
import { createMiddleware } from 'hono/factory';

interface LogEntry {
  timestamp: string;
  method: string;
  path: string;
  status: number;
  duration: number;
  organizationId?: string;
  userId?: string;
  userAgent?: string;
  ip?: string;
  error?: string;
}

/**
 * Request logging middleware.
 * Logs all requests with timing, user context, and response status.
 */
export const loggerMiddleware = createMiddleware(async (c, next) => {
  const start = Date.now();
  const requestId = crypto.randomUUID();

  // Add request ID to response headers
  c.header('X-Request-ID', requestId);

  let error: string | undefined;

  try {
    await next();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    const duration = Date.now() - start;

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration,
      userAgent: c.req.header('User-Agent'),
      ip: c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP'),
    };

    // Add user context if available
    try {
      const user = c.get('user' as never);
      const tenant = c.get('tenant' as never);
      if (user) logEntry.userId = (user as { id: string }).id;
      if (tenant) logEntry.organizationId = (tenant as { organizationId: string }).organizationId;
    } catch {
      // Context not available, skip
    }

    if (error) {
      logEntry.error = error;
    }

    // Log format: JSON for structured logging
    const logLevel = c.res.status >= 500 ? 'error' : c.res.status >= 400 ? 'warn' : 'info';
    const logFn = logLevel === 'error' ? console.error : logLevel === 'warn' ? console.warn : console.log;

    logFn(JSON.stringify(logEntry));
  }
});

/**
 * Development-friendly request logger.
 * Uses colored, human-readable output.
 */
export const devLoggerMiddleware = createMiddleware(async (c, next) => {
  const start = Date.now();

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  // Color codes
  const statusColor = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m';
  const reset = '\x1b[0m';
  const dim = '\x1b[2m';

  console.log(
    `${dim}${new Date().toISOString()}${reset} ${c.req.method.padEnd(7)} ${c.req.path} ${statusColor}${status}${reset} ${dim}${duration}ms${reset}`
  );
});
```

**Step 2: Commit**

```bash
git add apps/api/src/middleware/logger.ts
git commit -m "feat: add request logging middleware"
```

---

### Task 13: Main Application Assembly

**Files:**
- Modify: `apps/api/src/index.ts`
- Create: `apps/api/src/routes/health.ts`
- Create: `apps/api/src/routes/index.ts`

**Step 1: Create apps/api/src/routes/health.ts**

```typescript
import { Hono } from 'hono';
import { prisma } from '@eurocomply/db';

const health = new Hono();

/**
 * Basic health check endpoint.
 * Returns 200 if the service is running.
 */
health.get('/', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.0.1',
  });
});

/**
 * Deep health check endpoint.
 * Verifies database connectivity.
 */
health.get('/ready', async (c) => {
  const checks: Record<string, { status: string; latency?: number; error?: string }> = {};

  // Check database
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: 'ok', latency: Date.now() - dbStart };
  } catch (error) {
    checks.database = {
      status: 'error',
      latency: Date.now() - dbStart,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  const allHealthy = Object.values(checks).every((c) => c.status === 'ok');

  return c.json(
    {
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    },
    allHealthy ? 200 : 503
  );
});

export { health };
```

**Step 2: Create apps/api/src/routes/index.ts**

```typescript
import { Hono } from 'hono';
import { health } from './health.js';

export function registerRoutes(app: Hono): void {
  // Health endpoints (no auth required)
  app.route('/health', health);

  // API v1 routes will be added here
  // app.route('/api/v1/products', products);
  // app.route('/api/v1/organizations', organizations);
}
```

**Step 3: Update apps/api/src/index.ts**

```typescript
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';

import { errorHandler } from './middleware/error-handler.js';
import { devLoggerMiddleware, loggerMiddleware } from './middleware/logger.js';
import { registerRoutes } from './routes/index.js';

const app = new Hono();

// Global middleware
app.use('*', process.env.NODE_ENV === 'development' ? devLoggerMiddleware : loggerMiddleware);

app.use('*', secureHeaders());

app.use('*', cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Organization-ID', 'X-Request-ID'],
  exposeHeaders: ['X-Request-ID'],
}));

// Error handler
app.onError(errorHandler);

// Register routes
registerRoutes(app);

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${c.req.method} ${c.req.path} not found`,
      },
    },
    404
  );
});

// Start server
const port = parseInt(process.env.PORT || '3000', 10);

console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    EuroComply API                          ║
╠═══════════════════════════════════════════════════════════╣
║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(40)} ║
║  Port:        ${String(port).padEnd(40)} ║
║  Health:      http://localhost:${port}/health${' '.repeat(24 - String(port).length)}║
╚═══════════════════════════════════════════════════════════╝
`);

serve({
  fetch: app.fetch,
  port,
});

export { app };
```

**Step 4: Commit**

```bash
git add apps/api/src/
git commit -m "feat: assemble main application with routes, middleware, and error handling"
```

---

## Phase 6: Organization & User Management

### Task 14: Organization Service

**Files:**
- Create: `apps/api/src/services/organization.service.ts`

**Step 1: Create apps/api/src/services/organization.service.ts**

```typescript
import { prisma, createTenantSchema, publishEvent, EventTypes } from '@eurocomply/db';
import { ConflictError, NotFoundError } from '../lib/errors.js';

export interface CreateOrganizationInput {
  name: string;
  ownerClerkId: string;
  ownerEmail: string;
  ownerName?: string;
}

export interface OrganizationWithOwner {
  id: string;
  name: string;
  slug: string;
  schemaName: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  createdAt: Date;
  owner: {
    id: string;
    email: string;
    name: string | null;
  };
}

/**
 * Creates a new organization with tenant schema and owner user.
 */
export async function createOrganization(
  input: CreateOrganizationInput
): Promise<OrganizationWithOwner> {
  const { name, ownerClerkId, ownerEmail, ownerName } = input;

  // Generate slug from name
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  // Check for slug collision and generate unique slug
  let slug = baseSlug;
  let counter = 0;
  while (await prisma.organization.findUnique({ where: { slug } })) {
    counter++;
    slug = `${baseSlug}-${counter}`;
  }

  // Generate schema name
  const schemaName = `tenant_${slug.replace(/-/g, '_')}`;

  // Check if schema name conflicts
  const existingSchema = await prisma.organization.findUnique({
    where: { schemaName },
  });
  if (existingSchema) {
    throw new ConflictError('Organization with this name already exists');
  }

  // Create everything in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // 1. Create or get user
    let user = await tx.user.findUnique({
      where: { clerkId: ownerClerkId },
    });

    if (!user) {
      user = await tx.user.create({
        data: {
          clerkId: ownerClerkId,
          email: ownerEmail,
          name: ownerName,
        },
      });
    }

    // 2. Create organization
    const organization = await tx.organization.create({
      data: {
        name,
        slug,
        schemaName,
        subscriptionTier: 'starter',
        subscriptionStatus: 'active',
        userLimit: 20,
        storageLimit: BigInt(536870912000), // 500GB
      },
    });

    // 3. Create owner membership
    await tx.organizationUser.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: 'owner',
        designAuthority: 'MANAGER',
        operationsAuthority: 'MANAGER',
        marketingAuthority: 'MANAGER',
        complianceAuthority: 'MANAGER',
      },
    });

    // 4. Publish event
    await publishEvent(tx, {
      organizationId: organization.id,
      eventType: EventTypes.ORG_CREATED,
      aggregateType: 'organization',
      aggregateId: organization.id,
      payload: {
        name: organization.name,
        slug: organization.slug,
        ownerId: user.id,
        subscriptionTier: organization.subscriptionTier,
      },
    });

    return { organization, user };
  });

  // 5. Create tenant schema (outside transaction - DDL can't be rolled back anyway)
  await createTenantSchema(prisma, schemaName);

  return {
    id: result.organization.id,
    name: result.organization.name,
    slug: result.organization.slug,
    schemaName: result.organization.schemaName,
    subscriptionTier: result.organization.subscriptionTier,
    subscriptionStatus: result.organization.subscriptionStatus,
    createdAt: result.organization.createdAt,
    owner: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
    },
  };
}

/**
 * Gets an organization by ID.
 */
export async function getOrganization(id: string): Promise<OrganizationWithOwner> {
  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      users: {
        where: { role: 'owner' },
        include: { user: true },
        take: 1,
      },
    },
  });

  if (!org) {
    throw new NotFoundError('Organization', id);
  }

  const owner = org.users[0]?.user;
  if (!owner) {
    throw new NotFoundError('Organization owner');
  }

  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    schemaName: org.schemaName,
    subscriptionTier: org.subscriptionTier,
    subscriptionStatus: org.subscriptionStatus,
    createdAt: org.createdAt,
    owner: {
      id: owner.id,
      email: owner.email,
      name: owner.name,
    },
  };
}

/**
 * Lists organizations for a user.
 */
export async function listUserOrganizations(userId: string) {
  const memberships = await prisma.organizationUser.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: 'desc' },
  });

  return memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
    slug: m.organization.slug,
    role: m.role,
    subscriptionTier: m.organization.subscriptionTier,
  }));
}
```

**Step 2: Commit**

```bash
git add apps/api/src/services/organization.service.ts
git commit -m "feat: add organization service with tenant schema creation"
```

---

### Task 15: Organization Routes

**Files:**
- Create: `apps/api/src/routes/organizations.ts`
- Modify: `apps/api/src/routes/index.ts`

**Step 1: Add Zod dependency**

Add to `apps/api/package.json` dependencies:
```json
{
  "dependencies": {
    "zod": "^3.22.0",
    "@hono/zod-validator": "^0.2.0"
  }
}
```

Then run: `pnpm install`

**Step 2: Create apps/api/src/routes/organizations.ts**

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { ok } from '@eurocomply/shared';
import { authMiddleware } from '../middleware/auth.js';
import { requireOrgAdmin } from '../middleware/authorize.js';
import {
  createOrganization,
  getOrganization,
  listUserOrganizations,
} from '../services/organization.service.js';
import type { AppVariables } from '../types/context.js';

const organizations = new Hono<{ Variables: AppVariables }>();

// Schema definitions
const createOrgSchema = z.object({
  name: z.string().min(2).max(100),
});

/**
 * POST /api/v1/organizations
 * Create a new organization.
 */
organizations.post(
  '/',
  authMiddleware,
  zValidator('json', createOrgSchema),
  async (c) => {
    const { name } = c.req.valid('json');
    const user = c.get('user');

    const org = await createOrganization({
      name,
      ownerClerkId: user.clerkId,
      ownerEmail: user.email,
      ownerName: user.name,
    });

    return c.json(ok(org), 201);
  }
);

/**
 * GET /api/v1/organizations
 * List organizations for the current user.
 */
organizations.get('/', authMiddleware, async (c) => {
  const user = c.get('user');
  const orgs = await listUserOrganizations(user.id);
  return c.json(ok(orgs));
});

/**
 * GET /api/v1/organizations/:id
 * Get organization details (requires membership).
 */
organizations.get('/:id', authMiddleware, async (c) => {
  const { id } = c.req.param();
  const tenant = c.get('tenant');

  // Verify user has access to this org
  if (tenant.organizationId !== id) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } },
      403
    );
  }

  const org = await getOrganization(id);
  return c.json(ok(org));
});

export { organizations };
```

**Step 3: Update apps/api/src/routes/index.ts**

```typescript
import { Hono } from 'hono';
import { health } from './health.js';
import { organizations } from './organizations.js';

export function registerRoutes(app: Hono): void {
  // Health endpoints (no auth required)
  app.route('/health', health);

  // API v1 routes
  app.route('/api/v1/organizations', organizations);
}
```

**Step 4: Commit**

```bash
git add apps/api/
git commit -m "feat: add organization routes with create, list, get endpoints"
```

---

## Phase 7: Testing Setup

### Task 16: Test Infrastructure

**Files:**
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/test/setup.ts`
- Create: `apps/api/src/test/helpers.ts`

**Step 1: Create apps/api/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['src/test/**', '**/*.d.ts'],
    },
    testTimeout: 10000,
  },
});
```

**Step 2: Create apps/api/src/test/setup.ts**

```typescript
import { beforeAll, afterAll, beforeEach } from 'vitest';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/eurocomply_test?schema=public';
process.env.CLERK_SECRET_KEY = 'test_clerk_secret_key';

beforeAll(async () => {
  // Global setup before all tests
  console.log('Starting test suite...');
});

afterAll(async () => {
  // Global cleanup after all tests
  console.log('Test suite complete.');
});

beforeEach(async () => {
  // Reset state before each test if needed
});
```

**Step 3: Create apps/api/src/test/helpers.ts**

```typescript
import { Hono } from 'hono';
import type { AppVariables } from '../types/context.js';

/**
 * Creates a mock authenticated context for testing.
 */
export function mockAuthContext(overrides?: Partial<AppVariables>): AppVariables {
  return {
    user: {
      id: 'user_test123',
      clerkId: 'clerk_test123',
      email: 'test@example.com',
      name: 'Test User',
    },
    tenant: {
      organizationId: 'org_test123',
      schemaName: 'tenant_test',
      name: 'Test Organization',
      subscriptionTier: 'starter',
    },
    permissions: {
      role: 'owner',
      designAuthority: 'MANAGER',
      operationsAuthority: 'MANAGER',
      marketingAuthority: 'MANAGER',
      complianceAuthority: 'MANAGER',
    },
    db: {} as AppVariables['db'], // Mock DB client
    ...overrides,
  };
}

/**
 * Creates a test app instance with optional middleware bypass.
 */
export function createTestApp(options?: { skipAuth?: boolean }) {
  const app = new Hono<{ Variables: AppVariables }>();

  if (options?.skipAuth) {
    // Inject mock auth context
    app.use('*', async (c, next) => {
      const ctx = mockAuthContext();
      c.set('user', ctx.user);
      c.set('tenant', ctx.tenant);
      c.set('permissions', ctx.permissions);
      await next();
    });
  }

  return app;
}

/**
 * Helper to make test requests.
 */
export async function testRequest(
  app: Hono,
  method: string,
  path: string,
  options?: {
    body?: unknown;
    headers?: Record<string, string>;
  }
) {
  const requestInit: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  };

  if (options?.body) {
    requestInit.body = JSON.stringify(options.body);
  }

  const response = await app.request(path, requestInit);
  const json = await response.json();

  return { response, json };
}
```

**Step 4: Commit**

```bash
git add apps/api/vitest.config.ts apps/api/src/test/
git commit -m "feat: add Vitest test infrastructure with helpers"
```

---

### Task 17: Unit Tests for Shared Package

**Files:**
- Create: `packages/shared/src/authorities.test.ts`
- Create: `packages/shared/vitest.config.ts`

**Step 1: Create packages/shared/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

**Step 2: Create packages/shared/src/authorities.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { hasAuthority, Authority, AUTHORITY_PERMISSIONS } from './authorities.js';

describe('hasAuthority', () => {
  it('should return true when user has exact authority', () => {
    expect(hasAuthority(Authority.EDITOR, Authority.EDITOR)).toBe(true);
  });

  it('should return true when user has higher authority', () => {
    expect(hasAuthority(Authority.MANAGER, Authority.VIEWER)).toBe(true);
    expect(hasAuthority(Authority.MANAGER, Authority.CONTRIBUTOR)).toBe(true);
    expect(hasAuthority(Authority.MANAGER, Authority.EDITOR)).toBe(true);
    expect(hasAuthority(Authority.EDITOR, Authority.VIEWER)).toBe(true);
  });

  it('should return false when user has lower authority', () => {
    expect(hasAuthority(Authority.VIEWER, Authority.CONTRIBUTOR)).toBe(false);
    expect(hasAuthority(Authority.VIEWER, Authority.EDITOR)).toBe(false);
    expect(hasAuthority(Authority.CONTRIBUTOR, Authority.MANAGER)).toBe(false);
  });

  it('should follow hierarchy: VIEWER < CONTRIBUTOR < EDITOR < MANAGER', () => {
    expect(hasAuthority(Authority.VIEWER, Authority.VIEWER)).toBe(true);
    expect(hasAuthority(Authority.VIEWER, Authority.CONTRIBUTOR)).toBe(false);

    expect(hasAuthority(Authority.CONTRIBUTOR, Authority.VIEWER)).toBe(true);
    expect(hasAuthority(Authority.CONTRIBUTOR, Authority.CONTRIBUTOR)).toBe(true);
    expect(hasAuthority(Authority.CONTRIBUTOR, Authority.EDITOR)).toBe(false);

    expect(hasAuthority(Authority.EDITOR, Authority.CONTRIBUTOR)).toBe(true);
    expect(hasAuthority(Authority.EDITOR, Authority.EDITOR)).toBe(true);
    expect(hasAuthority(Authority.EDITOR, Authority.MANAGER)).toBe(false);

    expect(hasAuthority(Authority.MANAGER, Authority.MANAGER)).toBe(true);
  });
});

describe('AUTHORITY_PERMISSIONS', () => {
  it('should have read permission for all authorities', () => {
    expect(AUTHORITY_PERMISSIONS.VIEWER).toContain('read');
    expect(AUTHORITY_PERMISSIONS.CONTRIBUTOR).toContain('read');
    expect(AUTHORITY_PERMISSIONS.EDITOR).toContain('read');
    expect(AUTHORITY_PERMISSIONS.MANAGER).toContain('read');
  });

  it('should have increasing permissions up the hierarchy', () => {
    expect(AUTHORITY_PERMISSIONS.VIEWER.length).toBeLessThan(
      AUTHORITY_PERMISSIONS.CONTRIBUTOR.length
    );
    expect(AUTHORITY_PERMISSIONS.CONTRIBUTOR.length).toBeLessThan(
      AUTHORITY_PERMISSIONS.EDITOR.length
    );
    expect(AUTHORITY_PERMISSIONS.EDITOR.length).toBeLessThan(
      AUTHORITY_PERMISSIONS.MANAGER.length
    );
  });

  it('should have configure permission only for MANAGER', () => {
    expect(AUTHORITY_PERMISSIONS.MANAGER).toContain('configure');
    expect(AUTHORITY_PERMISSIONS.EDITOR).not.toContain('configure');
  });
});
```

**Step 3: Add test script and vitest dev dependency**

Update `packages/shared/package.json`:
```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run"
  },
  "devDependencies": {
    "vitest": "^1.2.0"
  }
}
```

**Step 4: Run tests**

```bash
cd packages/shared && pnpm test:run
```

Expected: All tests pass.

**Step 5: Commit**

```bash
git add packages/shared/
git commit -m "test: add unit tests for authority helpers"
```

---

## Phase 8: Environment Configuration

### Task 18: Environment Setup

**Files:**
- Create: `.env.example`
- Create: `apps/api/.env.example`
- Create: `docker-compose.yml`

**Step 1: Create .env.example (root)**

```env
# Node
NODE_ENV=development

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/eurocomply?schema=public

# Clerk Authentication
CLERK_SECRET_KEY=sk_test_xxxxx
CLERK_PUBLISHABLE_KEY=pk_test_xxxxx

# Redis (optional, for caching)
REDIS_URL=redis://localhost:6379

# API
PORT=3000
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

**Step 2: Create apps/api/.env.example**

```env
# API specific configuration
PORT=3000

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/eurocomply?schema=public

# Clerk
CLERK_SECRET_KEY=sk_test_xxxxx

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

**Step 3: Create docker-compose.yml**

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: eurocomply-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: eurocomply
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 5s
      retries: 5

  postgres-test:
    image: postgres:15-alpine
    container_name: eurocomply-postgres-test
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: eurocomply_test
    ports:
      - '5433:5432'
    tmpfs:
      - /var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    container_name: eurocomply-redis
    ports:
      - '6379:6379'
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

**Step 4: Commit**

```bash
git add .env.example apps/api/.env.example docker-compose.yml
git commit -m "chore: add environment configuration and docker-compose"
```

---

### Task 19: Development Scripts

**Files:**
- Modify: `package.json` (root)

**Step 1: Update root package.json with scripts**

```json
{
  "name": "eurocomply",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test:run",
    "test:watch": "pnpm -r --parallel test",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "db:generate": "pnpm --filter @eurocomply/db db:generate",
    "db:migrate": "pnpm --filter @eurocomply/db db:migrate",
    "db:push": "pnpm --filter @eurocomply/db db:push",
    "db:studio": "pnpm --filter @eurocomply/db prisma studio",
    "docker:up": "docker-compose up -d",
    "docker:down": "docker-compose down",
    "clean": "rm -rf node_modules apps/*/node_modules packages/*/node_modules apps/*/dist packages/*/dist"
  },
  "devDependencies": {
    "typescript": "^5.3.0"
  }
}
```

**Step 2: Commit**

```bash
git add package.json
git commit -m "chore: add root development scripts"
```

---

## Summary Checklist

After completing all tasks, verify:

- [ ] `pnpm install` runs without errors
- [ ] `pnpm build` compiles all packages
- [ ] `docker-compose up -d` starts PostgreSQL and Redis
- [ ] `pnpm db:generate` generates Prisma client
- [ ] `pnpm db:push` creates database schema
- [ ] `pnpm dev` starts the API server
- [ ] `curl http://localhost:3000/health` returns `{"status":"ok",...}`
- [ ] `curl http://localhost:3000/health/ready` checks database connectivity
- [ ] `pnpm test` runs all tests and they pass

---

## Document Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-16 | Initial implementation plan |

---

## Related Documents

- [Architecture Design](./2026-01-15-architecture-design.md)
- [User Management Design](./2026-01-15-user-management-design.md)
- [Event System Design](./2026-01-15-event-system-design.md)
- [Billing Design](./2026-01-15-billing-design.md)
