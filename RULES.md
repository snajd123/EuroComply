# EuroComply Development Rules

**These rules are MANDATORY for all development work. No exceptions.**

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

### Migrations

- **Never modify production data directly**
- **All schema changes go through MikroORM migrations**
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
│  5. Commit message follows format                   │
└─────────────────────────────────────────────────────┘
```

---

**Last Updated**: 2026-01-27
**Version**: 1.6

> Note: For Claude-specific workflow instructions, see [CLAUDE.md](./CLAUDE.md)
