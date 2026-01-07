# EuroComply Comprehensive Test Plan

## Overview

This document outlines the complete testing strategy for the EuroComply platform, covering all modules, services, and utilities.

## Test Framework

- **Framework**: Vitest
- **Configuration**: `/apps/api/vitest.config.ts`
- **Run Tests**: `npm run test`

---

## Test Categories

### 1. Pure Logic Tests (No Mocking Required)

These tests cover functions that don't depend on databases or external services.

| Module | File | Functions | Priority |
|--------|------|-----------|----------|
| Supplier | `validators.ts` | All Zod schemas | ✅ Done |
| Supplier | `earnings.test.ts` | Pricing calculations | ✅ Done |
| Shared | `index.ts` | DppDataSchema, constants | HIGH |
| GS1 | `gs1.service.ts` | GTIN validation, Digital Link generation | HIGH |
| Error Handler | `errorHandler.ts` | ApiError class, hash functions | HIGH |
| Auth | `middleware.ts` | API key extraction, hashing | HIGH |

### 2. Service Tests (Database Mocking Required)

These tests require mocking Prisma client operations.

| Module | File | Functions | Priority |
|--------|------|-----------|----------|
| Supplier | `supplier.service.ts` | register, login, products, catalog | HIGH |
| Supplier | `earnings.service.ts` | earnings overview, payouts | HIGH |
| Product Trust | `dpp.service.ts` | credential issuance, verification | HIGH |
| Product Trust | `qr.service.ts` | QR code generation | MEDIUM |

### 3. Identity Package Tests (External API Mocking)

| Module | File | Functions | Priority |
|--------|------|-----------|----------|
| Identity | `did.service.ts` | DID creation, resolution | HIGH |
| Identity | `vc.service.ts` | Credential issuance, verification | HIGH |
| Identity | `waltid.adapter.ts` | walt.id API calls | MEDIUM |

### 4. Integration Tests (Full Route Testing)

| Module | Routes | Endpoints | Priority |
|--------|--------|-----------|----------|
| Supplier | `routes.ts` | 23 routes | HIGH |
| Product | `product.controller.ts` | 5 endpoints | HIGH |
| Passport | `passport.controller.ts` | 7 endpoints | HIGH |
| Lifecycle | `lifecycle.controller.ts` | 4 endpoints | MEDIUM |

---

## Test Coverage Goals

| Category | Target Coverage |
|----------|-----------------|
| Pure Logic | 100% |
| Services | 80% |
| Controllers | 70% |
| Integration | Key flows |

---

## Test File Locations

```
apps/api/src/
├── modules/
│   ├── supplier/
│   │   ├── validators.test.ts      ✅ EXISTS (32 tests)
│   │   ├── earnings.test.ts        ✅ EXISTS (27 tests)
│   │   ├── supplier.service.test.ts   NEW
│   │   └── routes.test.ts          NEW
│   └── product-trust/
│       ├── services/
│       │   ├── gs1.service.test.ts    NEW
│       │   ├── dpp.service.test.ts    NEW
│       │   └── qr.service.test.ts     NEW
│       └── controllers/
│           ├── product.controller.test.ts  NEW
│           └── passport.controller.test.ts NEW
├── common/
│   ├── middleware/
│   │   └── errorHandler.test.ts    NEW
│   └── auth/
│       └── middleware.test.ts      NEW
packages/
├── shared/src/
│   └── index.test.ts               NEW
└── identity/src/
    └── services/
        ├── did.service.test.ts     NEW
        └── vc.service.test.ts      NEW
```

---

## Execution Order

1. **Phase 1: Pure Logic** (~100 tests)
   - GS1 service validation
   - Shared package schemas
   - Error handler utilities
   - Auth middleware utilities

2. **Phase 2: Services with Mocking** (~150 tests)
   - Supplier service (with Prisma mock)
   - Earnings service (with Prisma mock)
   - DPP service (with identity mock)

3. **Phase 3: Identity Package** (~50 tests)
   - DID service (with adapter mock)
   - VC service (with adapter mock)

4. **Phase 4: Integration** (~50 tests)
   - Route handlers with supertest
   - End-to-end flows

---

## Mocking Strategy

### Prisma Mocking
```typescript
import { vi } from 'vitest';
import { prisma } from '@eurocomply/database';

vi.mock('@eurocomply/database', () => ({
  prisma: {
    supplier: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    // ... other models
  },
}));
```

### External API Mocking
```typescript
vi.mock('../adapters/waltid.adapter', () => ({
  WaltIdAdapter: {
    isAvailable: vi.fn().mockResolvedValue(true),
    createDidWeb: vi.fn().mockResolvedValue({ did: 'did:web:example.com' }),
  },
}));
```

---

## Running Tests

```bash
# Run all tests
npm run test

# Run specific test file
npx vitest run src/modules/supplier/validators.test.ts

# Run with coverage
npx vitest run --coverage

# Run in watch mode
npm run test:watch
```

---

## Current Status

| Test File | Tests | Status |
|-----------|-------|--------|
| validators.test.ts | 32 | ✅ Passing |
| earnings.test.ts | 27 | ✅ Passing |
| gs1.service.test.ts | - | 🔄 Pending |
| shared/index.test.ts | - | 🔄 Pending |
| errorHandler.test.ts | - | 🔄 Pending |
| supplier.service.test.ts | - | 🔄 Pending |
| did.service.test.ts | - | 🔄 Pending |
| vc.service.test.ts | - | 🔄 Pending |

**Total Existing**: 59 tests passing
**Target Total**: 400+ tests
