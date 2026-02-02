# EuroComply Development Rules

**These rules are MANDATORY for all development work. No exceptions.**

> **Testing Setup:** See [docs/TESTING.md](./docs/TESTING.md) for database setup, server startup commands, and full-stack testing instructions.

---

## 1. Test-Driven Development (TDD)

### The TDD Cycle: Red → Green → Refactor

1. **RED**: Write a failing test FIRST
2. **GREEN**: Write the minimum code to make the test pass
3. **REFACTOR**: Clean up the code while keeping tests green

### Test Requirements

- **Every new feature MUST have tests written BEFORE implementation**
- **Every bug fix MUST have a regression test written BEFORE the fix**
- **No code is considered complete without passing tests**
- **Minimum 80% code coverage for new code**

### Test Naming Convention

```typescript
// Pattern: should_[expectedBehavior]_when_[condition]
it('should reject invalid GTIN when check digit is wrong', () => {});
it('should return 401 when API key is missing', () => {});
it('should create passport when all required fields provided', () => {});
```

### Test Structure

```typescript
describe('ComponentName', () => {
  describe('methodName', () => {
    it('should [expected behavior] when [condition]', () => {
      // Arrange
      const input = { ... };

      // Act
      const result = methodName(input);

      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

### No Mocks Policy

**Mocks are NOT allowed in this codebase.** Use integration tests with real database instead.

**Why no mocks?**
- Mocks drift from reality and give false confidence
- Mocks test implementation details, not behavior
- Mocks hide real integration issues
- Mocks make refactoring painful

**What to use instead:**
- **Integration tests** with real database (`setupTestDb()`, `teardownTestDb()`)
- **E2E tests** for full request/response cycles
- **Real dependencies** isolated per test (fork entity managers, use unique test data)

**Exceptions (rare):**
- **Pure function unit tests** - Functions with no side effects (e.g., `clerkOrgIdToSchemaName`)
- **Middleware edge cases** - Testing middleware behavior with specific context values

```typescript
// ❌ BAD: Mock-based test
vi.mock('@eurocomply/database', () => ({
  Organization: { findOne: vi.fn() }
}));

// ✅ GOOD: Integration test with real database
const orm = await setupTestDb();
const em = orm.em.fork();
const org = em.create(Organization, { ... });
await em.persistAndFlush(org);
```

---

## 2. Code Before Commit Checklist

Before ANY commit, verify:

- [ ] All tests pass (`npm run test`)
- [ ] No TypeScript errors (`npm run build`)
- [ ] No linting errors (`npm run lint`)
- [ ] New code has corresponding tests
- [ ] Test coverage has not decreased

---

## 3. Git Commit Rules

### Commit Message Format

```
<type>: <short description>

<optional body explaining WHY, not WHAT>

<optional footer with breaking changes or issue references>
```

### Commit Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `test` | Adding or updating tests |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `docs` | Documentation only |
| `chore` | Build process, dependencies, tooling |
| `perf` | Performance improvement |

### Examples

```
feat: add textile DPP validation with fiber composition checks

fix: correct GTIN-14 check digit calculation for leading zeros

test: add regression test for supplier verification state machine
```

### Commit Rules

- **Atomic commits**: Each commit should be a single logical change
- **No broken commits**: Every commit must pass all tests
- **No WIP commits**: Don't commit work-in-progress to main branches

---

## 4. Branch Strategy

```
main (production)
  └── develop (integration)
       ├── feature/[feature-name]
       ├── fix/[bug-description]
       └── test/[test-description]
```

- **Never push directly to main**
- **All changes go through pull requests**
- **Feature branches must be up-to-date with develop before merge**

---

## 5. Code Quality Standards

### TypeScript

- **Strict mode enabled** - no `any` types unless absolutely necessary
- **Explicit return types** on public functions
- **No unused variables or imports**
- **Use `const` by default, `let` only when reassignment needed**

### Error Handling

```typescript
// ❌ BAD: Silent failures
try {
  await riskyOperation();
} catch (e) {
  // ignored
}

// ✅ GOOD: Explicit error handling
try {
  await riskyOperation();
} catch (error) {
  logger.error('Operation failed', { error, context });
  throw new ApiError('Operation failed', 500);
}
```

### Validation

- **All external input MUST be validated** (API requests, user input, webhooks)
- **Use Zod schemas for runtime validation**
- **Fail fast**: Validate at system boundaries

```typescript
// ✅ GOOD: Validate immediately
const body = CreatePassportSchema.parse(req.body);
// Now body is guaranteed to be valid
```

### No Shortcuts - Implement the Design

**When a design/plan specifies a data source or implementation approach, implement it fully. Do not substitute with "simpler" alternatives.**

This rule exists because:
- Hardcoded "fallbacks" that become the only implementation create technical debt
- Skipping the real implementation means the feature is incomplete
- "Simple" alternatives often lack the robustness the design intended

**Examples of shortcuts to AVOID:**

```typescript
// ❌ BAD: Design says "load from JSON files", you hardcode instead
// Design: "Load H-statements from mhchem JSON files for 24 EU languages"
// Shortcut: Hardcode English-only data as "fallback" and never implement the real loader

private getMinimalHStatements(): Record<string, string> {
  return { 'H350': 'May cause cancer' };  // "fallback" that becomes permanent
}

// ❌ BAD: Design says "fetch from API", you use static data instead
// Design: "Fetch current exchange rates from ECB API"
// Shortcut: Hardcode rates and call it "offline mode"

// ❌ BAD: Design says "parse PDF", you require manual CSV conversion
// Design: "Extract tables from regulatory PDFs automatically"
// Shortcut: "For now, manually convert PDF to CSV first"
```

**What to do instead:**

1. **Implement what the design specifies** - If it says "load from JSON files", write the JSON loader
2. **If you can't complete it**, mark the task as blocked and explain why
3. **If the design is too complex**, discuss with the user BEFORE implementing a simpler alternative
4. **Fallbacks are acceptable** only when they supplement (not replace) the primary implementation

```typescript
// ✅ GOOD: Implement the design, fallback only if primary fails
const statements = await this.loadFromMhchemJson();  // Primary: what design specified
if (!statements) {
  logger.warn('mhchem JSON not found, using bundled fallback');
  return this.getBundledFallback();  // Fallback: only if primary unavailable
}
```

---

## 6. Security Rules

### Never Commit

- API keys or secrets
- Database credentials
- Private keys
- `.env` files with real values

### Always

- Use environment variables for secrets
- Hash passwords with bcrypt (min 10 rounds)
- Hash API keys with SHA256
- Validate and sanitize all inputs
- Use parameterized queries (MikroORM handles this)

### API Security

- All endpoints require authentication unless explicitly public
- Use scope-based authorization
- Rate limit all endpoints
- Log security-relevant events

---

## 7. Database Rules

### Local Development Setup

**Single PostgreSQL instance, two databases:**

| Database | Port | Purpose | Used By |
|----------|------|---------|---------|
| `eurocomply` | 5432 | Development | Dev server, Postman |
| `eurocomply_test` | 5432 | Automated tests | `npm test` (vitest) |

**Key rules:**
- **ONE postgres container on port 5432** - never create additional containers on other ports
- **`.env` always points to `eurocomply`** - not the test database
- **vitest.config.ts files override to `eurocomply_test`** - tests handle their own DB selection
- **init-db.sql auto-creates `eurocomply_test`** - on container first start

```
# .env (ALWAYS use eurocomply, never eurocomply_test)
DATABASE_PORT=5432
DATABASE_NAME=eurocomply
```

If tests fail with "connection refused" or you see databases on multiple ports, the setup is broken. Fix by removing all postgres containers and running `pnpm db:start` fresh.

### Test Database Configuration

**Every package with integration tests MUST include database env vars in `vitest.config.ts`:**

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    env: {
      DATABASE_HOST: 'localhost',
      DATABASE_PORT: '5432',
      DATABASE_USER: 'postgres',
      DATABASE_PASSWORD: 'postgres',
      DATABASE_NAME: 'eurocomply_test',
      TEST_DATABASE_NAME: 'eurocomply_test',
    },
    // ... other config
  },
});
```

**Before running tests with database dependencies:**
1. Ensure postgres is running: `pnpm db:start`
2. The test database `eurocomply_test` is auto-created by `init-db.sql`
3. Tests use `setupTestDb()` from `@eurocomply/database/test-utils`

**Test utilities:**
- `setupTestDb()` - Creates ORM connection, ensures schema exists
- `teardownTestDb()` - Closes ORM connection
- `isDatabaseAvailable()` - Checks if database is reachable (for graceful skipping)

### Migrations & Schema Management

**During Local Development:**
- **Single consolidated migration** (`Migration20260122000000.ts`) creates all public schema tables
- **When changing schema**: Update the single migration file, then run `pnpm db:reset`
- **No incremental migrations during dev** - keeps things simple and avoids confusion
- **Incremental migrations for production** - add new migration files only when deploying to production with real data

**Schema Design:**

| Schema | Created By | Contains |
|--------|------------|----------|
| `public` | Migration | `organizations`, `api_keys`, `webhook_events`, `unit_definition`, `category`, `substance`, `substance_alias`, `seed_version`, `outbox_event` |
| `tenant_*` | TenantProvisioner | `tenant_category`, `category_adoption`, `attribute_template`, `product`, `product_version`, `audit_log`, `users`, `organization_users`, `outbox_event` |

**Rules:**
- **Public schema tables** = shared/system data (orgs, system categories, reference data)
- **Tenant schema tables** = per-tenant data (products, users, adoptions)
- **Never modify production data directly**
- **Test migrations on staging before production**

### Queries

- **Use MikroORM's type-safe queries**
- **Include only needed fields** (use `select`)
- **Add indexes for frequently queried columns**
- **Use transactions for multi-step operations**

```typescript
// ✅ GOOD: Explicit field selection
const user = await prisma.user.findUnique({
  where: { id },
  select: { id: true, email: true, name: true },
});

// ❌ BAD: Selecting everything
const user = await prisma.user.findUnique({ where: { id } });
```

---

## 8. API Design Rules

### Response Format

All API responses MUST follow this structure:

```typescript
// Success
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "req_xxx",
    "timestamp": "2026-01-27T12:00:00.000Z"
  }
}

// Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": { ... }  // Optional
  },
  "meta": {
    "requestId": "req_xxx",
    "timestamp": "2026-01-27T12:00:00.000Z"
  }
}

// List response (uses total in meta instead of pagination)
{
  "success": true,
  "data": [...],
  "meta": {
    "requestId": "req_xxx",
    "timestamp": "2026-01-27T12:00:00.000Z",
    "total": 100  // Total count for list responses
  }
}
```

### Response Utilities (MANDATORY)

**NEVER construct responses manually with `c.json()`.** Always use the response utilities:

```typescript
import { success, error } from '../utils/response.js';

// ✅ GOOD: Use response utilities
return success(c, { id: product.id, name: product.name });
return success(c, products, { total: products.length });
return success(c, { id: newProduct.id }, { status: 201 });
return error(c, 'NOT_FOUND', 'Product not found', 404);
return error(c, 'FORBIDDEN', 'Insufficient permissions', 403, { workspace: 'design', yourAuthority: 'VIEWER' });

// ❌ BAD: Manual response construction
return c.json({ data: product }, 200);
return c.json({ error: 'Not found' }, 404);
```

The utilities automatically:
- Add `success: true/false`
- Add `meta.requestId` (from request-id middleware)
- Add `meta.timestamp`
- Set `X-Request-Id` response header

### Standard Error Codes

Error codes MUST be `SCREAMING_SNAKE_CASE`. Use these standard codes:

| Code | HTTP Status | Usage |
|------|-------------|-------|
| `BAD_REQUEST` | 400 | Invalid input, validation failure |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Valid auth but insufficient permissions |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `CONFLICT` | 409 | Duplicate resource, state conflict |
| `VALIDATION_ERROR` | 400 | Schema validation failure (Zod) |
| `CONFIG_ERROR` | 500 | Server misconfiguration |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

For 403 errors, include context in `details`:
```typescript
return error(c, 'FORBIDDEN', 'Insufficient permissions for design workspace', 403, {
  workspace: 'design',
  requiredAuthority: 'EDITOR',
  yourAuthority: 'VIEWER'
});
```

### HTTP Status Codes

| Code | Usage |
|------|-------|
| 200 | Success (GET, PUT, PATCH) |
| 201 | Created (POST) |
| 204 | No Content (DELETE) |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (missing/invalid auth) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 409 | Conflict (duplicate, state conflict) |
| 500 | Internal Server Error |

### Request ID Tracking

Every request gets a unique ID (`req_xxx`) via the `requestIdMiddleware`. This ID:
- Is stored in context: `c.get('requestId')`
- Is included in all responses: `meta.requestId`
- Is returned as header: `X-Request-Id`
- Can be passed from client via `X-Request-Id` header (for tracing)

---

## 9. Middleware Patterns

### Creating Middleware

Always use `createMiddleware` from Hono with our `Env` type:

```typescript
import { createMiddleware } from 'hono/factory';
import type { Env } from '../app.js';
import { error } from '../utils/response.js';

export function myMiddleware() {
  return createMiddleware<Env>(async (c, next) => {
    // Middleware logic here

    // For errors, return early with error() helper
    if (somethingWrong) {
      return error(c, 'UNAUTHORIZED', 'Missing required header', 401);
    }

    // Set context variables for downstream handlers
    c.set('myValue', extractedValue);

    // Continue to next handler
    await next();
  });
}
```

### Middleware Rules

- **Use `error()` helper for error responses** - never `c.json()` directly
- **Return early on errors** - don't call `next()` after returning error
- **Set context with `c.set()`** - for passing data to handlers
- **Access context with `c.get()`** - always use `!` assertion when you know it's set

### Context Variables

Standard context variables (defined in `Env` type in `app.ts`):

| Variable | Type | Set By | Description |
|----------|------|--------|-------------|
| `requestId` | `string` | request-id middleware | Unique request ID |
| `tenantSchema` | `string` | tenant middleware | Tenant's database schema |
| `userId` | `string` | tenant middleware | User ID or `api-key:{id}` |
| `membership` | `OrganizationUser` | user middleware | Human user's org membership |
| `apiKeyAuthorities` | `ApiKeyAuthorities` | tenant middleware | API key permissions |

---

## 10. Route Patterns

### Router Factory Pattern

All routers use the factory pattern with dependency injection:

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { MikroORM } from '@eurocomply/database';
import type { Env } from '../app.js';
import { authorize } from '../middleware/authorize.js';
import { success, error } from '../utils/response.js';

export interface MyRouterOptions {
  orm: MikroORM;
  // Add other dependencies as needed
}

export function createMyRouter(options: MyRouterOptions): Hono<Env> {
  const { orm } = options;
  const router = new Hono<Env>();

  // Define routes here
  router.get('/', authorize('design', 'view'), async (c) => {
    // ...
  });

  return router;
}
```

### Authorization

Use the `authorize()` middleware for workspace-based access control:

```typescript
import { authorize, requireOrgAdmin } from '../middleware/authorize.js';

// Workspace + action authorization
router.get('/', authorize('design', 'view'), handler);      // VIEWER+
router.post('/', authorize('design', 'edit'), handler);     // CONTRIBUTOR+
router.put('/:id/approve', authorize('design', 'approve'), handler);  // EDITOR+
router.delete('/:id', authorize('design', 'manage'), handler);        // MANAGER only

// Organization admin only
router.get('/api-keys', requireOrgAdmin(), handler);
```

Workspaces: `design`, `operations`, `marketing`, `compliance`
Actions: `view` (VIEWER+), `edit` (CONTRIBUTOR+), `approve` (EDITOR+), `manage` (MANAGER)

### Request Validation

Use Zod schemas with `zValidator` middleware:

```typescript
const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  categoryId: z.string().min(1),
});

router.post('/',
  authorize('design', 'edit'),
  zValidator('json', createSchema),  // Validates and parses body
  async (c) => {
    const body = c.req.valid('json');  // Type-safe access
    // body.name, body.categoryId are guaranteed valid
  }
);
```

---

## 11. Multi-Tenant Database Safety

### CRITICAL: Always Fork with Schema

**NEVER use `orm.em` directly.** Always fork with the tenant schema:

```typescript
// ✅ GOOD: Fork with schema
const schema = c.get('tenantSchema')!;
const em = orm.em.fork({ schema });

// ❌ BAD: Using orm.em directly
const em = orm.em;  // WRONG - no tenant isolation!
```

### CRITICAL: Transaction with search_path for JOINs

When MikroORM generates JOINs (via `populate`, relations), it may not schema-qualify table names. **Wrap queries in transactions with SET search_path:**

```typescript
const schema = c.get('tenantSchema')!;
const em = orm.em.fork({ schema });

// ✅ GOOD: Transaction with search_path
const products = await em.transactional(async (txEm) => {
  await txEm.execute(`SET search_path TO "${schema}", public`);
  return txEm.find(Product, {}, { populate: ['category'] });
});

// ❌ BAD: Query without search_path protection
const products = await em.find(Product, {}, { populate: ['category'] });
// May query wrong schema on JOINs!
```

### When to Use Transactions

| Operation | Transaction Required? |
|-----------|----------------------|
| Simple find/findOne without relations | Optional but recommended |
| Any query with `populate` | **REQUIRED** |
| Multi-step writes | **REQUIRED** |
| Any query that might JOIN | **REQUIRED** |

### Pattern for Route Handlers

```typescript
router.get('/', authorize('design', 'view'), async (c) => {
  const schema = c.get('tenantSchema')!;
  const em = orm.em.fork({ schema });

  const result = await em.transactional(async (txEm) => {
    await txEm.execute(`SET search_path TO "${schema}", public`);

    // All queries inside transaction are schema-safe
    const items = await txEm.find(MyEntity, {});
    return items;
  });

  return success(c, result.map(serialize), { total: result.length });
});
```

### Error Handling in Transactions

Return error objects from transactions, check after:

```typescript
const result = await em.transactional(async (txEm) => {
  await txEm.execute(`SET search_path TO "${schema}", public`);

  const existing = await txEm.findOne(Entity, { id });
  if (!existing) {
    return { error: 'not_found' as const };
  }

  // ... do work
  return { data: existing };
});

if ('error' in result) {
  return error(c, 'NOT_FOUND', 'Entity not found', 404);
}

return success(c, result.data);
```

---

## 12. Documentation Rules

### Documentation After Implementation

**MANDATORY: All documentation MUST be updated immediately after completing any implementation.**

After completing a feature, bug fix, or architectural change:

1. **Update implementation status** in relevant docs (IMPLEMENTATION_PLAN.md, etc.)
2. **Update architectural docs** if design changed (DATA_SOVEREIGNTY.md, ARCHITECTURE_PORTABILITY.md)
3. **Update README.md** if user-facing features changed
4. **Mark completion status** with clear indicators (✅ Complete, ⚠️ Partial, 📋 Planned)

```
Implementation complete → Documentation updated → Commit
                         ↑ NEVER skip this step
```

### Code Comments

- **Don't comment WHAT** - code should be self-explanatory
- **Comment WHY** - explain non-obvious decisions

```typescript
// ❌ BAD: States the obvious
// Increment counter by 1
counter++;

// ✅ GOOD: Explains why
// Add 1 to account for the header row that Shopify includes
counter++;
```

### API Documentation

- Every endpoint MUST have OpenAPI documentation
- Include request/response examples
- Document error cases

### README Updates

- Update README when adding new features
- Include setup instructions for new dependencies
- Document environment variables

---

## 13. Dependency Rules

### Adding Dependencies

Before adding a new dependency:

1. **Check if existing deps can solve the problem**
2. **Evaluate package health** (maintenance, downloads, security)
3. **Prefer smaller, focused packages** over large frameworks
4. **Document why the dependency was added**

### Updating Dependencies

- **Review changelogs** before updating
- **Run full test suite** after updates
- **Update one major version at a time**

---

## 14. Performance Rules

### Database

- Add indexes for columns used in WHERE clauses
- Use pagination for list endpoints (max 100 items)
- Cache frequently accessed, rarely changed data

### API

- Set appropriate timeouts
- Use streaming for large responses
- Implement request coalescing where applicable

---

## 15. Monitoring & Logging

### What to Log

- All API requests (method, path, status, duration)
- Authentication events (login, logout, failures)
- Business events (passport created, credential issued)
- Errors with full context

### What NOT to Log

- Passwords or secrets
- Full credit card numbers
- Personal data beyond what's necessary

### Log Format

```typescript
logger.info('Passport created', {
  passportId: 'pass_123',
  productId: 'prod_456',
  organizationId: 'org_789',
  duration: 150,
});
```

---

## 16. Postman Collection Rules

### Collection Structure

All API endpoints MUST be documented in Postman collections:

| Collection | Auth | Contains |
|------------|------|----------|
| `admin-api` | `X-Admin-Key` header | Platform admin endpoints (`/api/v1/admin/*`) |
| `tenant-api` | Clerk JWT | Tenant-scoped endpoints (`/api/v1/*` requiring auth) |
| `public-api` | None | Public endpoints (health, public data) |
| `webhooks` | Webhook signatures | Webhook receivers (Clerk, Stripe) |

### Environment File

`eurocomply-local.postman_environment.json` contains:
- `baseUrl` - API base URL (default: `http://localhost:3001`)
- `adminApiKey` - Secret, from `.env` ADMIN_API_KEY
- `webhookSecret` - Secret, from `.env` CLERK_WEBHOOK_SECRET

### Update Requirements

**MANDATORY: When any API endpoint is added, modified, or removed:**

1. Update the corresponding Postman collection
2. Include request with all parameters documented
3. Add test scripts that verify:
   - Expected status code
   - Response structure
   - Error cases (401, 403, 404, 409)
4. Use `pm.variables.get()` for environment variables (not `pm.collectionVariables`)

### Request Naming Convention

```
[HTTP Method implied] [Resource] [Action/Qualifier]

Examples:
- "List Organizations"
- "Get Organization"
- "Create Product"
- "Update Product Status"
- "Delete Category Adoption"
- "Sync (Dry Run)"
```

### Test Script Pattern

```javascript
pm.test('Status 200', function () {
    pm.response.to.have.status(200);
});

pm.test('Returns expected structure', function () {
    const r = pm.response.json();
    pm.expect(r.data).to.be.an('array');
    pm.expect(r.meta.total).to.be.a('number');
});
```

### Collection Location

All Postman files live in `docs/testing/postman/`:

```
docs/testing/postman/
├── eurocomply-local.postman_environment.json
├── admin-api.postman_collection.json
├── tenant-api.postman_collection.json
├── public-api.postman_collection.json
└── webhooks.postman_collection.json
```

---

## 17. Technical Debt and Legacy Code Management

### No Parallel Systems Without Documentation

**NEVER create alternative implementations without documenting the transition plan.**

When replacing a system:
1. Document the old vs new approach in a plan document
2. Create migration path before implementing new system
3. Delete old system completely when migration is done
4. **Never leave two systems doing the same thing**

```
❌ BAD: "I'll add the new payment system and deprecate the old one later"
✅ GOOD: "Plan: Replace OldPaymentService → NewPaymentService, migrate data, delete old code"
```

### Dead Code Removal Checklist

When removing entities, services, or features:

- [ ] Delete entity files and tests
- [ ] Remove from exports (`index.ts`)
- [ ] Remove from entity arrays (`publicEntities`, `tenantEntities`)
- [ ] Update provisioner expected tables (`EXPECTED_TENANT_TABLES`)
- [ ] Remove related routes and services
- [ ] Remove route registrations from `app.ts`
- [ ] Update Postman collections
- [ ] Remove from documentation
- [ ] Search for remaining references: `grep -rn "EntityName" --include="*.ts"`
- [ ] Run full test suite to catch broken references

### Code-Documentation Alignment

**Documentation MUST match implementation. No exceptions.**

When code changes:
1. Update docs in the same commit/PR
2. Remove docs for deleted features (don't mark as "deprecated")
3. Add docs for new features immediately

**Quarterly architecture audit:**
1. Compare documented entities vs implemented entities
2. Compare documented API endpoints vs actual routes
3. Check for features documented but not implemented
4. Check for features implemented but not documented

### Test Isolation

**Tests MUST be isolated** - one test cannot affect another:

```typescript
// ✅ GOOD: Unique test data per test
const testSchema = `test_${createId()}`;
const testOrg = em.create(Organization, {
  name: `Test Org ${createId()}`,
  schemaName: testSchema
});

// ✅ GOOD: Cleanup after each test
afterEach(async () => {
  await em.execute(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
});

// ❌ BAD: Shared state between tests
let sharedOrg: Organization;  // Other tests might modify this!
```

Rules:
- Use unique test data (random IDs, unique schema names)
- Clean up after each test in `afterEach`
- Don't rely on test execution order
- Integration tests sharing database MUST use transactions or unique schemas

### Technical Debt Tracking

When you identify technical debt:

1. **Document it immediately** with `TECH_DEBT:` prefix
2. **Include context**: what, why it's debt, impact, suggested fix
3. **Review quarterly**: prioritize and schedule fixes

```typescript
// TECH_DEBT: Test isolation - API tests fail when run in parallel
// Impact: CI is flaky, developers can't trust test results
// Fix: Add unique schema per test file, proper cleanup in afterEach
// Priority: HIGH - blocking reliable CI
```

### What Counts as Technical Debt

| Is Technical Debt | Is NOT Technical Debt |
|-------------------|----------------------|
| Two systems doing the same thing | Feature not yet implemented |
| Tests that interfere with each other | Missing optional features |
| Docs that don't match code | Code that works but could be cleaner |
| Dead code that's never cleaned up | TODO comments for future enhancements |
| Missing error handling for known cases | Performance optimizations not yet done |

---

## Enforcement

These rules are enforced through:

1. **Pre-commit hooks** - Run tests and linting
2. **CI/CD pipeline** - Block merges if tests fail
3. **Code review** - All PRs require approval
4. **This document** - Reference during development

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────┐
│                  BEFORE WRITING CODE                │
├─────────────────────────────────────────────────────┤
│  1. Write failing test first                        │
│  2. Define expected behavior                        │
│  3. Consider edge cases                             │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│                  WHILE WRITING CODE                 │
├─────────────────────────────────────────────────────┤
│  1. Make test pass with minimal code                │
│  2. Handle errors explicitly                        │
│  3. Validate all inputs                             │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│                  BEFORE COMMITTING                  │
├─────────────────────────────────────────────────────┤
│  1. All tests pass                                  │
│  2. No TypeScript errors                            │
│  3. Code is documented                              │
│  4. UPDATE DOCS (implementation status, README)     │
│  5. UPDATE POSTMAN if API changed                   │
│  6. Commit message follows format                   │
└─────────────────────────────────────────────────────┘
```

---

**Last Updated**: 2026-01-28
**Version**: 1.8

> Note: For Claude-specific workflow instructions, see [CLAUDE.md](./CLAUDE.md)
