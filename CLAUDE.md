# Claude Code Rules for EuroComply

## Required Workflow

1. **Ask Permission Before Every Code Change**
   - Do NOT write, edit, or delete any code without explicit user approval
   - Always describe what you plan to change and wait for confirmation
   - Show the planned changes before implementing

2. **Plan Before Implementation**
   - Discuss and agree on the approach before writing any code
   - Break down tasks into small, reviewable increments
   - Present the plan and get approval before proceeding

3. **Small Increments Only**
   - Make one small change at a time
   - Wait for user review between changes
   - Do not batch multiple changes together without permission

4. **Communication**
   - Explain what you're about to do before doing it
   - Ask clarifying questions if requirements are unclear
   - Never assume - always confirm

## Test-Driven Development (TDD)

### The TDD Cycle: Red → Green → Refactor
- **RED**: Write a failing test FIRST
- **GREEN**: Write the minimum code to make the test pass
- **REFACTOR**: Clean up the code while keeping tests green

### Test Requirements
- Every new feature MUST have tests written BEFORE implementation
- Every bug fix MUST have a regression test written BEFORE the fix
- No code is considered complete without passing tests
- Minimum 80% code coverage for new code

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

## Code Before Commit Checklist

Before ANY commit, verify:
- [ ] All tests pass (`npm run test`)
- [ ] No TypeScript errors (`npm run build`)
- [ ] No linting errors (`npm run lint`)
- [ ] New code has corresponding tests
- [ ] Test coverage has not decreased

## Git Commit Rules

### Commit Message Format
```
<type>: <short description>

<optional body explaining WHY, not WHAT>

<optional footer with breaking changes or issue references>
```

### Commit Types
| Type | Description |
|------|-------------|
| feat | New feature |
| fix | Bug fix |
| test | Adding or updating tests |
| refactor | Code change that neither fixes a bug nor adds a feature |
| docs | Documentation only |
| chore | Build process, dependencies, tooling |
| perf | Performance improvement |

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

## Branch Strategy
```
main (production)
  └── develop (integration)
       ├── feature/[feature-name]
       ├── fix/[bug-description]
       └── test/[test-description]
```
- Never push directly to main
- All changes go through pull requests
- Feature branches must be up-to-date with develop before merge

## Code Quality Standards

### TypeScript
- Strict mode enabled - no `any` types unless absolutely necessary
- Explicit return types on public functions
- No unused variables or imports
- Use `const` by default, `let` only when reassignment needed

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
- All external input MUST be validated (API requests, user input, webhooks)
- Use Zod schemas for runtime validation
- Fail fast: Validate at system boundaries

```typescript
// ✅ GOOD: Validate immediately
const body = CreatePassportSchema.parse(req.body);
// Now body is guaranteed to be valid
```

## Security Rules

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
- Use parameterized queries (Prisma handles this)

### API Security
- All endpoints require authentication unless explicitly public
- Use scope-based authorization
- Rate limit all endpoints
- Log security-relevant events

## Database Rules

### Migrations
- Never modify production data directly
- All schema changes go through Prisma migrations
- Test migrations on staging before production

### Queries
- Use Prisma's type-safe queries
- Include only needed fields (use `select`)
- Add indexes for frequently queried columns
- Use transactions for multi-step operations

```typescript
// ✅ GOOD: Explicit field selection
const user = await prisma.user.findUnique({
  where: { id },
  select: { id: true, email: true, name: true },
});

// ❌ BAD: Selecting everything
const user = await prisma.user.findUnique({ where: { id } });
```

## API Design Rules

### Response Format
All API responses MUST follow this structure:

```typescript
// Success
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "req_xxx",
    "timestamp": "2026-01-07T12:00:00Z"
  }
}

// Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": { ... }
  },
  "meta": {
    "requestId": "req_xxx",
    "timestamp": "2026-01-07T12:00:00Z"
  }
}

// List with pagination
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 100,
    "totalPages": 5,
    "hasMore": true
  },
  "meta": { ... }
}
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

## Documentation Rules

### Documentation After Implementation
**MANDATORY**: All documentation MUST be updated immediately after completing any implementation.

After completing a feature, bug fix, or architectural change:
1. Update implementation status in relevant docs (IMPLEMENTATION_PLAN.md, etc.)
2. Update architectural docs if design changed (DATA_SOVEREIGNTY.md, ARCHITECTURE_PORTABILITY.md)
3. Update README.md if user-facing features changed
4. Mark completion status with clear indicators (✅ Complete, ⚠️ Partial, 📋 Planned)

```
Implementation complete → Documentation updated → Commit
                         ↑ NEVER skip this step
```

### Code Comments
- Don't comment WHAT - code should be self-explanatory
- Comment WHY - explain non-obvious decisions

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

## Dependency Rules

### Adding Dependencies
Before adding a new dependency:
1. Check if existing deps can solve the problem
2. Evaluate package health (maintenance, downloads, security)
3. Prefer smaller, focused packages over large frameworks
4. Document why the dependency was added

### Updating Dependencies
- Review changelogs before updating
- Run full test suite after updates
- Update one major version at a time

## Performance Rules

### Database
- Add indexes for columns used in WHERE clauses
- Use pagination for list endpoints (max 100 items)
- Cache frequently accessed, rarely changed data

### API
- Set appropriate timeouts
- Use streaming for large responses
- Implement request coalescing where applicable

## Monitoring & Logging

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

## Enforcement

These rules are enforced through:
- **Pre-commit hooks** - Run tests and linting
- **CI/CD pipeline** - Block merges if tests fail
- **Code review** - All PRs require approval
- **This document** - Reference during development

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
