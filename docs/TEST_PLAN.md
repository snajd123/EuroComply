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
│   │   ├── validators.test.ts         ✅ 32 tests
│   │   ├── earnings.test.ts           ✅ 27 tests
│   │   └── supplier.service.test.ts   ✅ 40 tests
│   └── product-trust/
│       ├── services/
│       │   ├── gs1.service.test.ts    ✅ 34 tests
│       │   ├── identity.test.ts       ✅ 37 tests
│       │   ├── qr.service.test.ts     ✅ 27 tests
│       │   └── dpp.service.test.ts    ✅ 38 tests
│       └── controllers/
│           └── passport.controller.test.ts ✅ 33 tests
├── common/
│   ├── middleware/
│   │   └── errorHandler.test.ts       ✅ 25 tests
│   ├── auth/
│   │   └── middleware.test.ts         ✅ 31 tests
│   └── schemas.test.ts                ✅ 52 tests

plugins/shopify/app/
└── services/
    └── dpp-validation.test.ts         ✅ 48 tests
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
| gs1.service.test.ts | 34 | ✅ Passing |
| schemas.test.ts | 52 | ✅ Passing |
| errorHandler.test.ts | 25 | ✅ Passing |
| middleware.test.ts | 31 | ✅ Passing |
| supplier.service.test.ts | 40 | ✅ Passing |
| identity.test.ts | 37 | ✅ Passing |
| qr.service.test.ts | 27 | ✅ Passing |
| dpp.service.test.ts | 38 | ✅ Passing |
| passport.controller.test.ts | 33 | ✅ Passing |
| **Shopify Plugin** | | |
| dpp-validation.test.ts | 48 | ✅ Passing |

**Total Tests**: 424 tests passing ✅
**Last Run**: 2026-01-07
