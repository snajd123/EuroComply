# Global Substance Registry (GSR) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a comprehensive substance registry with 106k+ substances from ECHA, identity resolution via CAS/EC/fuzzy matching, multi-list regulatory status, and conflict detection.

**Architecture:** New `packages/gsr` package containing entities, services, seeders, and CLI. Extends existing `packages/database` with new public schema tables. PostgreSQL with pg_trgm for fuzzy search.

**Tech Stack:** MikroORM, PostgreSQL, pg_trgm extension, TypeScript, Zod validation

**Key Rules (from CLAUDE.md):**
- TDD: Write failing test FIRST, then minimal implementation
- No mocks: Integration tests with real database using `setupTestDb()`
- Test naming: `should_[expectedBehavior]_when_[condition]`
- Single consolidated migration during dev
- Atomic commits with `feat:`, `test:`, `fix:` prefixes

---

## Phase 1: Package Setup & Enums

### Task 1.1: Create GSR Package Structure

**Files:**
- Create: `packages/gsr/package.json`
- Create: `packages/gsr/tsconfig.json`
- Create: `packages/gsr/vitest.config.ts`
- Create: `packages/gsr/src/index.ts`

**Step 1: Create package.json**

```json
{
  "name": "@eurocomply/gsr",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./test-utils": {
      "import": "./dist/test-utils.js",
      "types": "./dist/test-utils.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src --ext .ts"
  },
  "dependencies": {
    "@eurocomply/database": "workspace:*",
    "@mikro-orm/core": "^6.4.3",
    "@mikro-orm/postgresql": "^6.4.3",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@swc/core": "^1.10.7",
    "@types/node": "^22.10.7",
    "typescript": "^5.7.3",
    "vitest": "^3.0.4",
    "unplugin-swc": "^1.5.1"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: false,
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ['src/**/*.test.ts'],
    env: {
      DATABASE_HOST: 'localhost',
      DATABASE_PORT: '5432',
      DATABASE_USER: 'postgres',
      DATABASE_PASSWORD: 'postgres',
      DATABASE_NAME: 'eurocomply_test',
      TEST_DATABASE_NAME: 'eurocomply_test',
    },
  },
});
```

**Step 4: Create src/index.ts (placeholder)**

```typescript
// GSR - Global Substance Registry
// Exports will be added as components are implemented

export const GSR_VERSION = '0.0.1';
```

**Step 5: Run pnpm install to link workspace**

Run: `pnpm install`
Expected: Package linked successfully

**Step 6: Commit**

```bash
git add packages/gsr/
git commit -m "$(cat <<'EOF'
chore: scaffold packages/gsr package structure

Sets up the Global Substance Registry package with:
- package.json with workspace dependencies
- TypeScript and vitest configuration
- Test database environment variables

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.2: Create ProductScope Enum

**Files:**
- Create: `packages/gsr/src/enums/ProductScope.ts`
- Create: `packages/gsr/src/enums/index.ts`
- Test: `packages/gsr/src/enums/ProductScope.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/enums/ProductScope.test.ts
import { describe, it, expect } from 'vitest';
import { ProductScope, SCOPE_HIERARCHY, getAllDescendants, isScopeAncestor } from './ProductScope.js';

describe('ProductScope', () => {
  describe('enum values', () => {
    it('should have ALL_PRODUCTS as top-level scope', () => {
      expect(ProductScope.ALL_PRODUCTS).toBe('ALL_PRODUCTS');
    });

    it('should have all consumer goods sub-categories', () => {
      expect(ProductScope.TOYS).toBe('TOYS');
      expect(ProductScope.CHILDCARE_ARTICLES).toBe('CHILDCARE_ARTICLES');
      expect(ProductScope.JEWELRY).toBe('JEWELRY');
      expect(ProductScope.COSMETICS).toBe('COSMETICS');
      expect(ProductScope.FOOD_CONTACT).toBe('FOOD_CONTACT');
      expect(ProductScope.TEXTILES).toBe('TEXTILES');
      expect(ProductScope.FURNITURE).toBe('FURNITURE');
    });

    it('should have electronics categories', () => {
      expect(ProductScope.EEE).toBe('EEE');
      expect(ProductScope.BATTERIES).toBe('BATTERIES');
      expect(ProductScope.CABLES).toBe('CABLES');
    });

    it('should have automotive categories', () => {
      expect(ProductScope.VEHICLES).toBe('VEHICLES');
      expect(ProductScope.VEHICLE_COMPONENTS).toBe('VEHICLE_COMPONENTS');
    });

    it('should have construction and packaging categories', () => {
      expect(ProductScope.CONSTRUCTION_PRODUCTS).toBe('CONSTRUCTION_PRODUCTS');
      expect(ProductScope.PAINTS_COATINGS).toBe('PAINTS_COATINGS');
      expect(ProductScope.PACKAGING).toBe('PACKAGING');
    });
  });

  describe('SCOPE_HIERARCHY', () => {
    it('should define CONSUMER_GOODS children correctly', () => {
      expect(SCOPE_HIERARCHY[ProductScope.CONSUMER_GOODS]).toContain(ProductScope.TOYS);
      expect(SCOPE_HIERARCHY[ProductScope.CONSUMER_GOODS]).toContain(ProductScope.JEWELRY);
      expect(SCOPE_HIERARCHY[ProductScope.CONSUMER_GOODS]).toContain(ProductScope.COSMETICS);
    });

    it('should define EEE children correctly', () => {
      expect(SCOPE_HIERARCHY[ProductScope.EEE]).toContain(ProductScope.BATTERIES);
      expect(SCOPE_HIERARCHY[ProductScope.EEE]).toContain(ProductScope.CABLES);
    });

    it('should have empty arrays for leaf nodes', () => {
      expect(SCOPE_HIERARCHY[ProductScope.JEWELRY]).toEqual([]);
      expect(SCOPE_HIERARCHY[ProductScope.BATTERIES]).toEqual([]);
    });
  });

  describe('getAllDescendants', () => {
    it('should return only self for leaf nodes', () => {
      const result = getAllDescendants(ProductScope.JEWELRY);
      expect(result).toEqual([ProductScope.JEWELRY]);
    });

    it('should return all children for CONSUMER_GOODS', () => {
      const result = getAllDescendants(ProductScope.CONSUMER_GOODS);
      expect(result).toContain(ProductScope.CONSUMER_GOODS);
      expect(result).toContain(ProductScope.TOYS);
      expect(result).toContain(ProductScope.CHILDCARE_ARTICLES);
      expect(result).toContain(ProductScope.JEWELRY);
    });

    it('should return nested children for TOYS including CHILDCARE_ARTICLES', () => {
      const result = getAllDescendants(ProductScope.TOYS);
      expect(result).toContain(ProductScope.TOYS);
      expect(result).toContain(ProductScope.CHILDCARE_ARTICLES);
      expect(result.length).toBe(2);
    });

    it('should return all scopes for ALL_PRODUCTS', () => {
      const result = getAllDescendants(ProductScope.ALL_PRODUCTS);
      expect(result.length).toBeGreaterThan(10);
      expect(result).toContain(ProductScope.ALL_PRODUCTS);
      expect(result).toContain(ProductScope.JEWELRY);
      expect(result).toContain(ProductScope.BATTERIES);
    });
  });

  describe('isScopeAncestor', () => {
    it('should return true when scope equals itself', () => {
      expect(isScopeAncestor(ProductScope.TOYS, ProductScope.TOYS)).toBe(true);
    });

    it('should return true when CONSUMER_GOODS is ancestor of JEWELRY', () => {
      expect(isScopeAncestor(ProductScope.CONSUMER_GOODS, ProductScope.JEWELRY)).toBe(true);
    });

    it('should return true when ALL_PRODUCTS is ancestor of BATTERIES', () => {
      expect(isScopeAncestor(ProductScope.ALL_PRODUCTS, ProductScope.BATTERIES)).toBe(true);
    });

    it('should return false when TOYS is not ancestor of JEWELRY (siblings)', () => {
      expect(isScopeAncestor(ProductScope.TOYS, ProductScope.JEWELRY)).toBe(false);
    });

    it('should return false when JEWELRY is not ancestor of CONSUMER_GOODS (reversed)', () => {
      expect(isScopeAncestor(ProductScope.JEWELRY, ProductScope.CONSUMER_GOODS)).toBe(false);
    });

    it('should return true for nested hierarchy TOYS -> CHILDCARE_ARTICLES', () => {
      expect(isScopeAncestor(ProductScope.TOYS, ProductScope.CHILDCARE_ARTICLES)).toBe(true);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/enums/ProductScope.test.ts`
Expected: FAIL - Cannot find module './ProductScope.js'

**Step 3: Write minimal implementation**

```typescript
// packages/gsr/src/enums/ProductScope.ts

export enum ProductScope {
  // Top-level
  ALL_PRODUCTS = 'ALL_PRODUCTS',
  CONSUMER_GOODS = 'CONSUMER_GOODS',
  INDUSTRIAL = 'INDUSTRIAL',

  // Consumer sub-categories
  TOYS = 'TOYS',
  CHILDCARE_ARTICLES = 'CHILDCARE_ARTICLES',
  JEWELRY = 'JEWELRY',
  COSMETICS = 'COSMETICS',
  FOOD_CONTACT = 'FOOD_CONTACT',
  TEXTILES = 'TEXTILES',
  FURNITURE = 'FURNITURE',

  // Electronics
  EEE = 'EEE',
  BATTERIES = 'BATTERIES',
  CABLES = 'CABLES',

  // Automotive
  VEHICLES = 'VEHICLES',
  VEHICLE_COMPONENTS = 'VEHICLE_COMPONENTS',

  // Construction
  CONSTRUCTION_PRODUCTS = 'CONSTRUCTION_PRODUCTS',
  PAINTS_COATINGS = 'PAINTS_COATINGS',

  // Packaging
  PACKAGING = 'PACKAGING',
}

/**
 * Hierarchy for scope inheritance.
 * Parent scope rules apply to all children.
 */
export const SCOPE_HIERARCHY: Record<ProductScope, ProductScope[]> = {
  [ProductScope.ALL_PRODUCTS]: [ProductScope.CONSUMER_GOODS, ProductScope.INDUSTRIAL, ProductScope.EEE, ProductScope.VEHICLES, ProductScope.CONSTRUCTION_PRODUCTS, ProductScope.PACKAGING],
  [ProductScope.CONSUMER_GOODS]: [
    ProductScope.TOYS,
    ProductScope.CHILDCARE_ARTICLES,
    ProductScope.JEWELRY,
    ProductScope.COSMETICS,
    ProductScope.FOOD_CONTACT,
    ProductScope.TEXTILES,
    ProductScope.FURNITURE,
  ],
  [ProductScope.TOYS]: [ProductScope.CHILDCARE_ARTICLES],
  [ProductScope.EEE]: [ProductScope.BATTERIES, ProductScope.CABLES],
  [ProductScope.VEHICLES]: [ProductScope.VEHICLE_COMPONENTS],
  // Leaf nodes have no children
  [ProductScope.INDUSTRIAL]: [],
  [ProductScope.CHILDCARE_ARTICLES]: [],
  [ProductScope.JEWELRY]: [],
  [ProductScope.COSMETICS]: [],
  [ProductScope.FOOD_CONTACT]: [],
  [ProductScope.TEXTILES]: [],
  [ProductScope.FURNITURE]: [],
  [ProductScope.BATTERIES]: [],
  [ProductScope.CABLES]: [],
  [ProductScope.VEHICLE_COMPONENTS]: [],
  [ProductScope.CONSTRUCTION_PRODUCTS]: [],
  [ProductScope.PAINTS_COATINGS]: [],
  [ProductScope.PACKAGING]: [],
};

/**
 * Get all descendant scopes (including self).
 * Used for expanding rules: a rule on CONSUMER_GOODS applies to TOYS, JEWELRY, etc.
 */
export function getAllDescendants(scope: ProductScope): ProductScope[] {
  const result: ProductScope[] = [scope];
  const children = SCOPE_HIERARCHY[scope] || [];

  for (const child of children) {
    result.push(...getAllDescendants(child));
  }

  return result;
}

/**
 * Check if ancestor is an ancestor of descendant (or equal).
 * Used for conflict detection: rule on parent conflicts with rule on child.
 */
export function isScopeAncestor(ancestor: ProductScope, descendant: ProductScope): boolean {
  if (ancestor === descendant) return true;
  return getAllDescendants(ancestor).includes(descendant);
}
```

**Step 4: Create enums index**

```typescript
// packages/gsr/src/enums/index.ts
export { ProductScope, SCOPE_HIERARCHY, getAllDescendants, isScopeAncestor } from './ProductScope.js';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/enums/ProductScope.test.ts`
Expected: PASS - All tests pass

**Step 6: Commit**

```bash
git add packages/gsr/src/enums/
git commit -m "$(cat <<'EOF'
feat(gsr): add ProductScope enum with hierarchy utilities

- ProductScope enum with 17 regulatory scope categories
- SCOPE_HIERARCHY mapping for parent-child relationships
- getAllDescendants() for scope expansion
- isScopeAncestor() for conflict detection

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.3: Create ThresholdUnit Enum

**Files:**
- Create: `packages/gsr/src/enums/ThresholdUnit.ts`
- Modify: `packages/gsr/src/enums/index.ts`
- Test: `packages/gsr/src/enums/ThresholdUnit.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/enums/ThresholdUnit.test.ts
import { describe, it, expect } from 'vitest';
import { ThresholdUnit, CONVERSION_TO_PPM } from './ThresholdUnit.js';

describe('ThresholdUnit', () => {
  describe('enum values', () => {
    it('should have all weight-based units', () => {
      expect(ThresholdUnit.PERCENT_BY_WEIGHT).toBe('PERCENT_BY_WEIGHT');
      expect(ThresholdUnit.PPM).toBe('PPM');
      expect(ThresholdUnit.PPB).toBe('PPB');
      expect(ThresholdUnit.MG_PER_KG).toBe('MG_PER_KG');
    });

    it('should have surface and concentration units', () => {
      expect(ThresholdUnit.MG_PER_CM2).toBe('MG_PER_CM2');
      expect(ThresholdUnit.MG_PER_L).toBe('MG_PER_L');
    });
  });

  describe('CONVERSION_TO_PPM', () => {
    it('should convert 1% to 10000 ppm', () => {
      expect(CONVERSION_TO_PPM[ThresholdUnit.PERCENT_BY_WEIGHT]).toBe(10000);
    });

    it('should have identity conversion for PPM', () => {
      expect(CONVERSION_TO_PPM[ThresholdUnit.PPM]).toBe(1);
    });

    it('should convert PPB to PPM (1 ppb = 0.001 ppm)', () => {
      expect(CONVERSION_TO_PPM[ThresholdUnit.PPB]).toBe(0.001);
    });

    it('should treat MG_PER_KG as equivalent to PPM', () => {
      expect(CONVERSION_TO_PPM[ThresholdUnit.MG_PER_KG]).toBe(1);
    });

    it('should return null for incompatible units (surface area)', () => {
      expect(CONVERSION_TO_PPM[ThresholdUnit.MG_PER_CM2]).toBeNull();
    });

    it('should return null for incompatible units (concentration)', () => {
      expect(CONVERSION_TO_PPM[ThresholdUnit.MG_PER_L]).toBeNull();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/enums/ThresholdUnit.test.ts`
Expected: FAIL - Cannot find module './ThresholdUnit.js'

**Step 3: Write minimal implementation**

```typescript
// packages/gsr/src/enums/ThresholdUnit.ts

export enum ThresholdUnit {
  PERCENT_BY_WEIGHT = 'PERCENT_BY_WEIGHT',
  PPM = 'PPM',
  PPB = 'PPB',
  MG_PER_KG = 'MG_PER_KG',
  MG_PER_CM2 = 'MG_PER_CM2',
  MG_PER_L = 'MG_PER_L',
}

/**
 * Conversion factors to canonical unit (PPM).
 * null = incompatible (different dimension, cannot compare).
 */
export const CONVERSION_TO_PPM: Record<ThresholdUnit, number | null> = {
  [ThresholdUnit.PERCENT_BY_WEIGHT]: 10_000,
  [ThresholdUnit.PPM]: 1,
  [ThresholdUnit.PPB]: 0.001,
  [ThresholdUnit.MG_PER_KG]: 1,
  [ThresholdUnit.MG_PER_CM2]: null,
  [ThresholdUnit.MG_PER_L]: null,
};

/** Canonical unit for threshold comparison */
export const CANONICAL_UNIT = ThresholdUnit.PPM;
```

**Step 4: Update enums index**

```typescript
// packages/gsr/src/enums/index.ts
export { ProductScope, SCOPE_HIERARCHY, getAllDescendants, isScopeAncestor } from './ProductScope.js';
export { ThresholdUnit, CONVERSION_TO_PPM, CANONICAL_UNIT } from './ThresholdUnit.js';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/enums/ThresholdUnit.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gsr/src/enums/
git commit -m "$(cat <<'EOF'
feat(gsr): add ThresholdUnit enum with conversion factors

- ThresholdUnit enum for regulatory threshold units
- CONVERSION_TO_PPM for unit normalization
- null values for incompatible dimensions (surface area, concentration)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.4: Create Status Enums (UnresolvedStatus, ResolutionType, DisclosureStatus, AttestationType)

**Files:**
- Create: `packages/gsr/src/enums/UnresolvedStatus.ts`
- Create: `packages/gsr/src/enums/ResolutionType.ts`
- Create: `packages/gsr/src/enums/DisclosureStatus.ts`
- Create: `packages/gsr/src/enums/AttestationType.ts`
- Modify: `packages/gsr/src/enums/index.ts`
- Test: `packages/gsr/src/enums/status-enums.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/enums/status-enums.test.ts
import { describe, it, expect } from 'vitest';
import { UnresolvedStatus } from './UnresolvedStatus.js';
import { ResolutionType } from './ResolutionType.js';
import { DisclosureStatus } from './DisclosureStatus.js';
import { AttestationType } from './AttestationType.js';

describe('UnresolvedStatus', () => {
  it('should have all status values', () => {
    expect(UnresolvedStatus.PENDING).toBe('PENDING');
    expect(UnresolvedStatus.DISCLOSURE_REQUESTED).toBe('DISCLOSURE_REQUESTED');
    expect(UnresolvedStatus.RESOLVED).toBe('RESOLVED');
    expect(UnresolvedStatus.IGNORED).toBe('IGNORED');
    expect(UnresolvedStatus.NOT_APPLICABLE).toBe('NOT_APPLICABLE');
  });
});

describe('ResolutionType', () => {
  it('should have all resolution types', () => {
    expect(ResolutionType.MANUAL_MATCH).toBe('MANUAL_MATCH');
    expect(ResolutionType.SUPPLIER_DISCLOSURE).toBe('SUPPLIER_DISCLOSURE');
    expect(ResolutionType.NEW_SUBSTANCE).toBe('NEW_SUBSTANCE');
    expect(ResolutionType.PROPRIETARY_ACCEPTED).toBe('PROPRIETARY_ACCEPTED');
  });
});

describe('DisclosureStatus', () => {
  it('should have all disclosure statuses', () => {
    expect(DisclosureStatus.PENDING).toBe('PENDING');
    expect(DisclosureStatus.LINK_ACCESSED).toBe('LINK_ACCESSED');
    expect(DisclosureStatus.DISCLOSED).toBe('DISCLOSED');
    expect(DisclosureStatus.ATTESTED).toBe('ATTESTED');
    expect(DisclosureStatus.EXPIRED).toBe('EXPIRED');
    expect(DisclosureStatus.DECLINED).toBe('DECLINED');
  });
});

describe('AttestationType', () => {
  it('should have all attestation types', () => {
    expect(AttestationType.FULL_DISCLOSURE).toBe('FULL_DISCLOSURE');
    expect(AttestationType.COMPLIANT_ATTESTATION).toBe('COMPLIANT_ATTESTATION');
    expect(AttestationType.NON_REGULATED).toBe('NON_REGULATED');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/enums/status-enums.test.ts`
Expected: FAIL - Cannot find module

**Step 3: Write minimal implementations**

```typescript
// packages/gsr/src/enums/UnresolvedStatus.ts
export enum UnresolvedStatus {
  PENDING = 'PENDING',
  DISCLOSURE_REQUESTED = 'DISCLOSURE_REQUESTED',
  RESOLVED = 'RESOLVED',
  IGNORED = 'IGNORED',
  NOT_APPLICABLE = 'NOT_APPLICABLE',
}
```

```typescript
// packages/gsr/src/enums/ResolutionType.ts
export enum ResolutionType {
  MANUAL_MATCH = 'MANUAL_MATCH',
  SUPPLIER_DISCLOSURE = 'SUPPLIER_DISCLOSURE',
  NEW_SUBSTANCE = 'NEW_SUBSTANCE',
  PROPRIETARY_ACCEPTED = 'PROPRIETARY_ACCEPTED',
}
```

```typescript
// packages/gsr/src/enums/DisclosureStatus.ts
export enum DisclosureStatus {
  PENDING = 'PENDING',
  LINK_ACCESSED = 'LINK_ACCESSED',
  DISCLOSED = 'DISCLOSED',
  ATTESTED = 'ATTESTED',
  EXPIRED = 'EXPIRED',
  DECLINED = 'DECLINED',
}
```

```typescript
// packages/gsr/src/enums/AttestationType.ts
export enum AttestationType {
  FULL_DISCLOSURE = 'FULL_DISCLOSURE',
  COMPLIANT_ATTESTATION = 'COMPLIANT_ATTESTATION',
  NON_REGULATED = 'NON_REGULATED',
}
```

**Step 4: Update enums index**

```typescript
// packages/gsr/src/enums/index.ts
export { ProductScope, SCOPE_HIERARCHY, getAllDescendants, isScopeAncestor } from './ProductScope.js';
export { ThresholdUnit, CONVERSION_TO_PPM, CANONICAL_UNIT } from './ThresholdUnit.js';
export { UnresolvedStatus } from './UnresolvedStatus.js';
export { ResolutionType } from './ResolutionType.js';
export { DisclosureStatus } from './DisclosureStatus.js';
export { AttestationType } from './AttestationType.js';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/enums/status-enums.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gsr/src/enums/
git commit -m "$(cat <<'EOF'
feat(gsr): add status enums for unresolved substances and disclosure

- UnresolvedStatus: PENDING, DISCLOSURE_REQUESTED, RESOLVED, etc.
- ResolutionType: MANUAL_MATCH, SUPPLIER_DISCLOSURE, etc.
- DisclosureStatus: for blind disclosure workflow
- AttestationType: FULL_DISCLOSURE, COMPLIANT_ATTESTATION, etc.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.5: Create AliasSource and ThresholdOperator Enums

**Files:**
- Create: `packages/gsr/src/enums/AliasSource.ts`
- Create: `packages/gsr/src/enums/ThresholdOperator.ts`
- Create: `packages/gsr/src/enums/ListingStatus.ts`
- Modify: `packages/gsr/src/enums/index.ts`
- Test: `packages/gsr/src/enums/additional-enums.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/enums/additional-enums.test.ts
import { describe, it, expect } from 'vitest';
import { AliasSource } from './AliasSource.js';
import { ThresholdOperator } from './ThresholdOperator.js';
import { ListingStatus } from './ListingStatus.js';

describe('AliasSource', () => {
  it('should have all source types', () => {
    expect(AliasSource.PUBCHEM).toBe('PUBCHEM');
    expect(AliasSource.ECHA).toBe('ECHA');
    expect(AliasSource.EPA).toBe('EPA');
    expect(AliasSource.MANUAL).toBe('MANUAL');
  });
});

describe('ThresholdOperator', () => {
  it('should have comparison operators', () => {
    expect(ThresholdOperator.LT).toBe('LT');
    expect(ThresholdOperator.LTE).toBe('LTE');
    expect(ThresholdOperator.EQ).toBe('EQ');
    expect(ThresholdOperator.GTE).toBe('GTE');
    expect(ThresholdOperator.GT).toBe('GT');
  });
});

describe('ListingStatus', () => {
  it('should have regulatory listing statuses', () => {
    expect(ListingStatus.LISTED).toBe('LISTED');
    expect(ListingStatus.RESTRICTED).toBe('RESTRICTED');
    expect(ListingStatus.BANNED).toBe('BANNED');
    expect(ListingStatus.AUTHORIZED).toBe('AUTHORIZED');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/enums/additional-enums.test.ts`
Expected: FAIL

**Step 3: Write minimal implementations**

```typescript
// packages/gsr/src/enums/AliasSource.ts
export enum AliasSource {
  PUBCHEM = 'PUBCHEM',
  ECHA = 'ECHA',
  EPA = 'EPA',
  MANUAL = 'MANUAL',
}
```

```typescript
// packages/gsr/src/enums/ThresholdOperator.ts
export enum ThresholdOperator {
  LT = 'LT',
  LTE = 'LTE',
  EQ = 'EQ',
  GTE = 'GTE',
  GT = 'GT',
}
```

```typescript
// packages/gsr/src/enums/ListingStatus.ts
export enum ListingStatus {
  LISTED = 'LISTED',
  RESTRICTED = 'RESTRICTED',
  BANNED = 'BANNED',
  AUTHORIZED = 'AUTHORIZED',
}
```

**Step 4: Update enums index**

```typescript
// packages/gsr/src/enums/index.ts
export { ProductScope, SCOPE_HIERARCHY, getAllDescendants, isScopeAncestor } from './ProductScope.js';
export { ThresholdUnit, CONVERSION_TO_PPM, CANONICAL_UNIT } from './ThresholdUnit.js';
export { UnresolvedStatus } from './UnresolvedStatus.js';
export { ResolutionType } from './ResolutionType.js';
export { DisclosureStatus } from './DisclosureStatus.js';
export { AttestationType } from './AttestationType.js';
export { AliasSource } from './AliasSource.js';
export { ThresholdOperator } from './ThresholdOperator.js';
export { ListingStatus } from './ListingStatus.js';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/enums/additional-enums.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gsr/src/enums/
git commit -m "$(cat <<'EOF'
feat(gsr): add AliasSource, ThresholdOperator, and ListingStatus enums

- AliasSource: PUBCHEM, ECHA, EPA, MANUAL for provenance tracking
- ThresholdOperator: LT, LTE, EQ, GTE, GT for threshold comparison
- ListingStatus: LISTED, RESTRICTED, BANNED, AUTHORIZED

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2: CAS/Name Utilities

### Task 2.1: Create CAS Sanitizer Utility

**Files:**
- Create: `packages/gsr/src/utils/cas-sanitizer.ts`
- Create: `packages/gsr/src/utils/index.ts`
- Test: `packages/gsr/src/utils/cas-sanitizer.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/utils/cas-sanitizer.test.ts
import { describe, it, expect } from 'vitest';
import { sanitizeCas, isValidCasChecksum, formatCasNumber } from './cas-sanitizer.js';

describe('cas-sanitizer', () => {
  describe('isValidCasChecksum', () => {
    it('should return true for valid CAS numbers', () => {
      expect(isValidCasChecksum('1309-60-0')).toBe(true);  // Lead dioxide
      expect(isValidCasChecksum('50-00-0')).toBe(true);    // Formaldehyde
      expect(isValidCasChecksum('7440-43-9')).toBe(true);  // Cadmium
      expect(isValidCasChecksum('7732-18-5')).toBe(true);  // Water
      expect(isValidCasChecksum('127-19-5')).toBe(true);   // DMAC
    });

    it('should return false for invalid checksums', () => {
      expect(isValidCasChecksum('1309-60-1')).toBe(false); // Wrong check digit
      expect(isValidCasChecksum('7732-18-6')).toBe(false); // Wrong check digit
      expect(isValidCasChecksum('12345-67-8')).toBe(false); // Invalid
    });

    it('should return false for invalid format', () => {
      expect(isValidCasChecksum('')).toBe(false);
      expect(isValidCasChecksum('invalid')).toBe(false);
      expect(isValidCasChecksum('123456789012')).toBe(false); // Too long
      expect(isValidCasChecksum('12-3-4')).toBe(false); // Segments too short
    });

    it('should return false for null/undefined', () => {
      expect(isValidCasChecksum(null as unknown as string)).toBe(false);
      expect(isValidCasChecksum(undefined as unknown as string)).toBe(false);
    });
  });

  describe('formatCasNumber', () => {
    it('should format unformatted CAS numbers', () => {
      expect(formatCasNumber('1309600')).toBe('1309-60-0');
      expect(formatCasNumber('50000')).toBe('50-00-0');
      expect(formatCasNumber('7440439')).toBe('7440-43-9');
    });

    it('should return already formatted CAS numbers', () => {
      expect(formatCasNumber('1309-60-0')).toBe('1309-60-0');
    });

    it('should return null for invalid length', () => {
      expect(formatCasNumber('1234')).toBeNull();  // Too short
      expect(formatCasNumber('12345678901')).toBeNull(); // Too long
    });

    it('should return null for non-numeric input', () => {
      expect(formatCasNumber('abc')).toBeNull();
    });
  });

  describe('sanitizeCas', () => {
    it('should clean and validate CAS with spaces', () => {
      expect(sanitizeCas('1309- 60 -0')).toBe('1309-60-0');
      expect(sanitizeCas('  1309-60-0  ')).toBe('1309-60-0');
    });

    it('should clean CAS with prefix', () => {
      expect(sanitizeCas('CAS: 1309-60-0')).toBe('1309-60-0');
      expect(sanitizeCas('CAS 1309-60-0')).toBe('1309-60-0');
      expect(sanitizeCas('CAS#1309-60-0')).toBe('1309-60-0');
    });

    it('should format unformatted CAS and validate', () => {
      expect(sanitizeCas('1309600')).toBe('1309-60-0');
    });

    it('should return null for N/A values', () => {
      expect(sanitizeCas('N/A')).toBeNull();
      expect(sanitizeCas('n/a')).toBeNull();
      expect(sanitizeCas('-')).toBeNull();
      expect(sanitizeCas('not available')).toBeNull();
      expect(sanitizeCas('')).toBeNull();
    });

    it('should return null for invalid checksum after cleaning', () => {
      expect(sanitizeCas('1309-60-1')).toBeNull(); // Invalid checksum
    });

    it('should handle proprietary markers', () => {
      expect(sanitizeCas('Proprietary')).toBeNull();
      expect(sanitizeCas('PROPRIETARY')).toBeNull();
      expect(sanitizeCas('Trade Secret')).toBeNull();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/utils/cas-sanitizer.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// packages/gsr/src/utils/cas-sanitizer.ts

/**
 * CAS Registry Number format: XXXXXXX-XX-X
 * - First segment: 2-7 digits
 * - Second segment: 2 digits
 * - Third segment: 1 digit (checksum)
 */
const CAS_PATTERN = /^(\d{2,7})-(\d{2})-(\d)$/;

/**
 * Patterns that indicate non-CAS values
 */
const INVALID_PATTERNS = [
  /^n\/?a$/i,
  /^not\s*(available|applicable)$/i,
  /^proprietary$/i,
  /^trade\s*secret$/i,
  /^confidential$/i,
  /^-$/,
  /^$/,
];

/**
 * Validates CAS Registry Number format and checksum.
 *
 * Algorithm:
 * 1. Remove hyphens, read digits right-to-left (excluding checksum)
 * 2. Multiply each digit by its position (1, 2, 3, ...)
 * 3. Sum all products
 * 4. Checksum = sum mod 10
 */
export function isValidCasChecksum(cas: string | null | undefined): boolean {
  if (!cas) return false;

  const match = cas.match(CAS_PATTERN);
  if (!match) return false;

  const [, first, second, checkDigit] = match;
  const digits = (first + second).split('').reverse();

  const sum = digits.reduce((acc, digit, index) => {
    return acc + parseInt(digit, 10) * (index + 1);
  }, 0);

  return (sum % 10) === parseInt(checkDigit, 10);
}

/**
 * Formats a raw CAS string into canonical format.
 * Handles missing hyphens, extra spaces, etc.
 *
 * @returns Formatted CAS or null if invalid length
 */
export function formatCasNumber(raw: string): string | null {
  // Extract only digits
  const digits = raw.replace(/\D/g, '');

  // CAS numbers have 5-10 digits total
  if (digits.length < 5 || digits.length > 10) return null;

  // Split: last digit is check, previous 2 are middle, rest is first
  const check = digits.slice(-1);
  const middle = digits.slice(-3, -1);
  const first = digits.slice(0, -3);

  return `${first}-${middle}-${check}`;
}

/**
 * Sanitizes raw CAS input: cleans, formats, and validates.
 *
 * @returns Valid CAS number or null if invalid/N/A
 */
export function sanitizeCas(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();

  // Check for known invalid patterns
  for (const pattern of INVALID_PATTERNS) {
    if (pattern.test(trimmed)) return null;
  }

  // Remove common prefixes and clean
  const cleaned = trimmed
    .replace(/^CAS[:#\s]*/i, '')
    .replace(/\s+/g, '')
    .replace(/-+/g, '-')
    .trim();

  // Try to format if not already formatted
  const formatted = CAS_PATTERN.test(cleaned)
    ? cleaned
    : formatCasNumber(cleaned);

  if (!formatted) return null;

  // Validate checksum
  return isValidCasChecksum(formatted) ? formatted : null;
}
```

**Step 4: Create utils index**

```typescript
// packages/gsr/src/utils/index.ts
export { sanitizeCas, isValidCasChecksum, formatCasNumber } from './cas-sanitizer.js';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/utils/cas-sanitizer.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gsr/src/utils/
git commit -m "$(cat <<'EOF'
feat(gsr): add CAS sanitizer utility with checksum validation

- isValidCasChecksum() validates CAS format and checksum algorithm
- formatCasNumber() converts unformatted digits to standard format
- sanitizeCas() cleans input, removes prefixes, validates

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.2: Create Name Normalizer Utility

**Files:**
- Create: `packages/gsr/src/utils/name-normalizer.ts`
- Modify: `packages/gsr/src/utils/index.ts`
- Test: `packages/gsr/src/utils/name-normalizer.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/utils/name-normalizer.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeName, sanitizeName } from './name-normalizer.js';

describe('name-normalizer', () => {
  describe('normalizeName', () => {
    it('should lowercase and trim', () => {
      expect(normalizeName('  Lead Dioxide  ')).toBe('lead dioxide');
      expect(normalizeName('FORMALDEHYDE')).toBe('formaldehyde');
    });

    it('should collapse multiple spaces', () => {
      expect(normalizeName('lead   dioxide')).toBe('lead dioxide');
      expect(normalizeName('lead\t\ndioxide')).toBe('lead dioxide');
    });

    it('should remove special characters but keep hyphens and numbers', () => {
      expect(normalizeName('Lead(II) oxide')).toBe('leadii oxide');
      expect(normalizeName('2,4-Dinitrotoluene')).toBe('24-dinitrotoluene');
      expect(normalizeName('N,N-Dimethylformamide')).toBe('nn-dimethylformamide');
    });

    it('should handle Greek letters by keeping them', () => {
      expect(normalizeName('α-Pinene')).toBe('α-pinene');
      expect(normalizeName('β-Naphthol')).toBe('β-naphthol');
    });

    it('should return empty string for null/undefined', () => {
      expect(normalizeName(null as unknown as string)).toBe('');
      expect(normalizeName(undefined as unknown as string)).toBe('');
      expect(normalizeName('')).toBe('');
    });
  });

  describe('sanitizeName', () => {
    it('should clean common prefixes/suffixes', () => {
      expect(sanitizeName('CAS 1309-60-0 Lead dioxide')).toBe('lead dioxide');
      expect(sanitizeName('Lead dioxide (CAS: 1309-60-0)')).toBe('lead dioxide');
    });

    it('should remove EC number annotations', () => {
      expect(sanitizeName('Lead dioxide [EC 215-174-5]')).toBe('lead dioxide');
      expect(sanitizeName('Lead dioxide EC:215-174-5')).toBe('lead dioxide');
    });

    it('should handle percentage annotations', () => {
      expect(sanitizeName('Lead dioxide ≥99%')).toBe('lead dioxide');
      expect(sanitizeName('Lead dioxide, 99.9%')).toBe('lead dioxide');
    });

    it('should normalize after sanitizing', () => {
      expect(sanitizeName('  LEAD DIOXIDE  ')).toBe('lead dioxide');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/utils/name-normalizer.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// packages/gsr/src/utils/name-normalizer.ts

/**
 * Patterns to remove from substance names during sanitization
 */
const SANITIZE_PATTERNS = [
  /\bCAS[:#\s]*[\d-]+/gi,           // CAS 1309-60-0
  /\(CAS[:#\s]*[\d-]+\)/gi,         // (CAS: 1309-60-0)
  /\[EC\s*[\d-]+\]/gi,              // [EC 215-174-5]
  /\bEC[:#\s]*[\d-]+/gi,            // EC:215-174-5
  /[≥<>]=?\s*\d+\.?\d*\s*%/g,       // ≥99%, <0.1%
  /,\s*\d+\.?\d*\s*%/g,             // , 99.9%
  /\s*\(\s*\)/g,                    // Empty parentheses left over
];

/**
 * Normalizes a substance name for consistent storage and matching.
 *
 * - Lowercases
 * - Collapses whitespace
 * - Removes special characters (keeps hyphens, numbers, Greek letters)
 *
 * Used for the `nameNormalized` field in SubstanceAlias.
 */
export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return '';

  return raw
    .toLowerCase()
    .replace(/\s+/g, ' ')                    // Collapse whitespace
    .replace(/[^\p{L}\p{N}\s-]/gu, '')       // Remove non-letter, non-number, non-space, non-hyphen
    .trim();
}

/**
 * Sanitizes a substance name by removing common annotations,
 * then normalizes it.
 *
 * Removes:
 * - CAS number annotations
 * - EC number annotations
 * - Purity percentages
 */
export function sanitizeName(raw: string | null | undefined): string {
  if (!raw) return '';

  let cleaned = raw;

  for (const pattern of SANITIZE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  return normalizeName(cleaned);
}
```

**Step 4: Update utils index**

```typescript
// packages/gsr/src/utils/index.ts
export { sanitizeCas, isValidCasChecksum, formatCasNumber } from './cas-sanitizer.js';
export { normalizeName, sanitizeName } from './name-normalizer.js';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/utils/name-normalizer.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gsr/src/utils/
git commit -m "$(cat <<'EOF'
feat(gsr): add name normalizer utility for alias matching

- normalizeName() for consistent storage (lowercase, collapse spaces)
- sanitizeName() removes CAS/EC annotations, purity percentages
- Preserves Greek letters and hyphens for chemical names

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3: Core Entities

### Task 3.1: Create RegistrySource Entity

**Files:**
- Create: `packages/gsr/src/entities/RegistrySource.ts`
- Create: `packages/gsr/src/entities/index.ts`
- Test: `packages/gsr/src/entities/RegistrySource.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/entities/RegistrySource.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { RegistrySource, RegistrySourceName } from './RegistrySource.js';

const dbAvailable = await isDatabaseAvailable();

describe('RegistrySource', () => {
  let orm: MikroORM;
  let em: EntityManager;

  beforeAll(async () => {
    if (dbAvailable) {
      orm = await setupTestDb();
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await teardownTestDb();
    }
  });

  beforeEach(async () => {
    if (dbAvailable) {
      await clearTestDb(orm.em);
      em = orm.em.fork();
    }
  });

  it.skipIf(!dbAvailable)('should create registry source with required fields', async () => {
    const source = em.create(RegistrySource, {
      name: RegistrySourceName.ECHA_EC,
      version: '2026-01',
      recordCount: 106000,
      sourceUrl: 'https://echa.europa.eu/information-on-chemicals/ec-inventory',
    });

    await em.persistAndFlush(source);
    em.clear();

    const found = await em.findOne(RegistrySource, { name: RegistrySourceName.ECHA_EC });
    expect(found).toBeTruthy();
    expect(found!.name).toBe(RegistrySourceName.ECHA_EC);
    expect(found!.version).toBe('2026-01');
    expect(found!.recordCount).toBe(106000);
    expect(found!.lastSyncedAt).toBeInstanceOf(Date);
  });

  it.skipIf(!dbAvailable)('should enforce unique name constraint', async () => {
    const source1 = em.create(RegistrySource, {
      name: RegistrySourceName.ECHA_SVHC,
      version: '2026-01',
    });
    await em.persistAndFlush(source1);

    const source2 = em.create(RegistrySource, {
      name: RegistrySourceName.ECHA_SVHC,
      version: '2026-02',
    });

    await expect(em.persistAndFlush(source2)).rejects.toThrow();
  });

  it.skipIf(!dbAvailable)('should allow all registry source names', async () => {
    const sources = [
      { name: RegistrySourceName.ECHA_EC, version: 'v1' },
      { name: RegistrySourceName.ECHA_SVHC, version: 'v1' },
      { name: RegistrySourceName.ECHA_ANNEX_XVII, version: 'v1' },
      { name: RegistrySourceName.PUBCHEM, version: 'v1' },
      { name: RegistrySourceName.TSCA, version: 'v1' },
      { name: RegistrySourceName.PROP65, version: 'v1' },
    ];

    for (const data of sources) {
      const source = em.create(RegistrySource, data);
      await em.persistAndFlush(source);
    }

    const count = await em.count(RegistrySource);
    expect(count).toBe(6);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/entities/RegistrySource.test.ts`
Expected: FAIL - Cannot find module

**Step 3: Write minimal implementation**

```typescript
// packages/gsr/src/entities/RegistrySource.ts
import { Entity, Property, Unique, Index, Enum } from '@mikro-orm/core';
import { BaseEntity } from '@eurocomply/database';

export enum RegistrySourceName {
  ECHA_EC = 'ECHA_EC',
  ECHA_SVHC = 'ECHA_SVHC',
  ECHA_ANNEX_XVII = 'ECHA_ANNEX_XVII',
  ECHA_ANNEX_XIV = 'ECHA_ANNEX_XIV',
  PUBCHEM = 'PUBCHEM',
  TSCA = 'TSCA',
  PROP65 = 'PROP65',
}

/**
 * Tracks data sources for the substance registry.
 * Used to track version, sync date, and record counts for each source.
 */
@Entity({ tableName: 'registry_source', schema: 'public' })
export class RegistrySource extends BaseEntity {
  @Enum({ items: () => RegistrySourceName })
  @Unique()
  @Index()
  name!: RegistrySourceName;

  /** Version identifier, e.g., "2026-01" */
  @Property({ length: 50, nullable: true })
  version?: string;

  /** When this source was last synced */
  @Property({ type: 'timestamptz', name: 'last_synced_at', defaultRaw: 'NOW()' })
  lastSyncedAt: Date = new Date();

  /** Number of records from this source */
  @Property({ type: 'int', name: 'record_count', nullable: true })
  recordCount?: number;

  /** URL to the original data source */
  @Property({ type: 'text', name: 'source_url', nullable: true })
  sourceUrl?: string;
}
```

**Step 4: Create entities index**

```typescript
// packages/gsr/src/entities/index.ts
export { RegistrySource, RegistrySourceName } from './RegistrySource.js';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/entities/RegistrySource.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gsr/src/entities/
git commit -m "$(cat <<'EOF'
feat(gsr): add RegistrySource entity for data provenance tracking

- RegistrySourceName enum with ECHA, PubChem, EPA sources
- Tracks version, lastSyncedAt, recordCount, sourceUrl
- Unique constraint on name

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.2: Create RegulatoryList Entity

**Files:**
- Create: `packages/gsr/src/entities/RegulatoryList.ts`
- Modify: `packages/gsr/src/entities/index.ts`
- Test: `packages/gsr/src/entities/RegulatoryList.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/entities/RegulatoryList.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { RegulatoryList } from './RegulatoryList.js';

const dbAvailable = await isDatabaseAvailable();

describe('RegulatoryList', () => {
  let orm: MikroORM;
  let em: EntityManager;

  beforeAll(async () => {
    if (dbAvailable) {
      orm = await setupTestDb();
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await teardownTestDb();
    }
  });

  beforeEach(async () => {
    if (dbAvailable) {
      await clearTestDb(orm.em);
      em = orm.em.fork();
    }
  });

  it.skipIf(!dbAvailable)('should create regulatory list with required fields', async () => {
    const list = em.create(RegulatoryList, {
      code: 'REACH_SVHC',
      name: 'SVHC Candidate List',
      jurisdiction: 'EU',
      publisher: 'ECHA',
    });

    await em.persistAndFlush(list);
    em.clear();

    const found = await em.findOne(RegulatoryList, { code: 'REACH_SVHC' });
    expect(found).toBeTruthy();
    expect(found!.code).toBe('REACH_SVHC');
    expect(found!.name).toBe('SVHC Candidate List');
    expect(found!.jurisdiction).toBe('EU');
    expect(found!.publisher).toBe('ECHA');
  });

  it.skipIf(!dbAvailable)('should enforce unique code constraint', async () => {
    await em.persistAndFlush(em.create(RegulatoryList, {
      code: 'REACH_ANNEX_XVII',
      name: 'REACH Annex XVII',
      jurisdiction: 'EU',
      publisher: 'ECHA',
    }));

    const duplicate = em.create(RegulatoryList, {
      code: 'REACH_ANNEX_XVII',
      name: 'Duplicate',
      jurisdiction: 'EU',
      publisher: 'ECHA',
    });

    await expect(em.persistAndFlush(duplicate)).rejects.toThrow();
  });

  it.skipIf(!dbAvailable)('should store optional fields', async () => {
    const list = em.create(RegulatoryList, {
      code: 'REACH_ANNEX_XIV',
      name: 'REACH Annex XIV Authorization List',
      jurisdiction: 'EU',
      publisher: 'ECHA',
      description: 'Substances requiring authorization',
      sourceUrl: 'https://echa.europa.eu/authorisation-list',
      version: '2026-01',
    });

    await em.persistAndFlush(list);
    em.clear();

    const found = await em.findOne(RegulatoryList, { code: 'REACH_ANNEX_XIV' });
    expect(found!.description).toBe('Substances requiring authorization');
    expect(found!.sourceUrl).toBe('https://echa.europa.eu/authorisation-list');
    expect(found!.version).toBe('2026-01');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/entities/RegulatoryList.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// packages/gsr/src/entities/RegulatoryList.ts
import { Entity, Property, Unique, Index } from '@mikro-orm/core';
import { BaseEntity } from '@eurocomply/database';

/**
 * Represents a regulatory substance list (SVHC, Annex XVII, etc.).
 * Substances link to this via SubstanceListEntry.
 */
@Entity({ tableName: 'regulatory_list', schema: 'public' })
export class RegulatoryList extends BaseEntity {
  /** Unique code, e.g., "REACH_SVHC", "REACH_ANNEX_XVII" */
  @Property({ length: 100 })
  @Unique()
  @Index()
  code!: string;

  /** Display name */
  @Property({ type: 'text' })
  name!: string;

  /** Jurisdiction code, e.g., "EU", "US_CA", "US_FED" */
  @Property({ length: 20 })
  @Index()
  jurisdiction!: string;

  /** Publishing authority, e.g., "ECHA", "EPA", "OEHHA" */
  @Property({ length: 50 })
  publisher!: string;

  /** Optional description */
  @Property({ type: 'text', nullable: true })
  description?: string;

  /** URL to official source */
  @Property({ type: 'text', name: 'source_url', nullable: true })
  sourceUrl?: string;

  /** Version identifier */
  @Property({ length: 50, nullable: true })
  version?: string;

  /** When this list was last updated */
  @Property({ type: 'timestamptz', name: 'last_updated_at', nullable: true })
  lastUpdatedAt?: Date;
}
```

**Step 4: Update entities index**

```typescript
// packages/gsr/src/entities/index.ts
export { RegistrySource, RegistrySourceName } from './RegistrySource.js';
export { RegulatoryList } from './RegulatoryList.js';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/entities/RegulatoryList.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gsr/src/entities/
git commit -m "$(cat <<'EOF'
feat(gsr): add RegulatoryList entity for multi-list support

- Stores regulatory lists (SVHC, Annex XVII, etc.)
- Fields: code, name, jurisdiction, publisher, version
- Unique constraint on code

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.3: Create SubstanceGroup and SubstanceGroupMember Entities

**Files:**
- Create: `packages/gsr/src/entities/SubstanceGroup.ts`
- Create: `packages/gsr/src/entities/SubstanceGroupMember.ts`
- Modify: `packages/gsr/src/entities/index.ts`
- Test: `packages/gsr/src/entities/SubstanceGroup.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/entities/SubstanceGroup.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { Substance } from '@eurocomply/database';
import { SubstanceGroup, SubstanceGroupMember, InheritanceType } from './SubstanceGroup.js';

const dbAvailable = await isDatabaseAvailable();

describe('SubstanceGroup', () => {
  let orm: MikroORM;
  let em: EntityManager;

  beforeAll(async () => {
    if (dbAvailable) {
      orm = await setupTestDb();
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await teardownTestDb();
    }
  });

  beforeEach(async () => {
    if (dbAvailable) {
      await clearTestDb(orm.em);
      em = orm.em.fork();
    }
  });

  it.skipIf(!dbAvailable)('should create substance group', async () => {
    const group = em.create(SubstanceGroup, {
      code: 'LEAD_COMPOUNDS',
      name: 'Lead and its compounds',
      description: 'All inorganic and organic lead compounds',
    });

    await em.persistAndFlush(group);
    em.clear();

    const found = await em.findOne(SubstanceGroup, { code: 'LEAD_COMPOUNDS' });
    expect(found).toBeTruthy();
    expect(found!.name).toBe('Lead and its compounds');
  });

  it.skipIf(!dbAvailable)('should enforce unique code constraint', async () => {
    await em.persistAndFlush(em.create(SubstanceGroup, {
      code: 'PFAS',
      name: 'PFAS',
    }));

    const duplicate = em.create(SubstanceGroup, {
      code: 'PFAS',
      name: 'Per- and polyfluoroalkyl substances',
    });

    await expect(em.persistAndFlush(duplicate)).rejects.toThrow();
  });

  it.skipIf(!dbAvailable)('should support nested groups via parentGroup', async () => {
    const parent = em.create(SubstanceGroup, {
      code: 'HEAVY_METALS',
      name: 'Heavy Metals',
    });
    await em.persistAndFlush(parent);

    const child = em.create(SubstanceGroup, {
      code: 'LEAD_COMPOUNDS',
      name: 'Lead compounds',
      parentGroup: parent,
    });
    await em.persistAndFlush(child);
    em.clear();

    const found = await em.findOne(SubstanceGroup, { code: 'LEAD_COMPOUNDS' }, { populate: ['parentGroup'] });
    expect(found!.parentGroup).toBeTruthy();
    expect(found!.parentGroup!.code).toBe('HEAVY_METALS');
  });
});

describe('SubstanceGroupMember', () => {
  let orm: MikroORM;
  let em: EntityManager;

  beforeAll(async () => {
    if (dbAvailable) {
      orm = await setupTestDb();
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await teardownTestDb();
    }
  });

  beforeEach(async () => {
    if (dbAvailable) {
      await clearTestDb(orm.em);
      em = orm.em.fork();
    }
  });

  it.skipIf(!dbAvailable)('should link substance to group', async () => {
    const substance = em.create(Substance, {
      casNumber: '1309-60-0',
      primaryName: 'Lead dioxide',
    });
    await em.persistAndFlush(substance);

    const group = em.create(SubstanceGroup, {
      code: 'LEAD_COMPOUNDS',
      name: 'Lead compounds',
    });
    await em.persistAndFlush(group);

    const member = em.create(SubstanceGroupMember, {
      group,
      substance,
      inheritanceType: InheritanceType.EXPLICIT,
      notes: 'Inorganic lead compound',
    });
    await em.persistAndFlush(member);
    em.clear();

    const found = await em.findOne(SubstanceGroupMember, { substance }, { populate: ['group'] });
    expect(found).toBeTruthy();
    expect(found!.group.code).toBe('LEAD_COMPOUNDS');
    expect(found!.inheritanceType).toBe(InheritanceType.EXPLICIT);
    expect(found!.notes).toBe('Inorganic lead compound');
  });

  it.skipIf(!dbAvailable)('should enforce unique group+substance constraint', async () => {
    const substance = em.create(Substance, {
      casNumber: '7440-43-9',
      primaryName: 'Cadmium',
    });
    const group = em.create(SubstanceGroup, {
      code: 'CADMIUM_COMPOUNDS',
      name: 'Cadmium compounds',
    });
    await em.persistAndFlush([substance, group]);

    await em.persistAndFlush(em.create(SubstanceGroupMember, {
      group,
      substance,
      inheritanceType: InheritanceType.EXPLICIT,
    }));

    const duplicate = em.create(SubstanceGroupMember, {
      group,
      substance,
      inheritanceType: InheritanceType.DERIVED,
    });

    await expect(em.persistAndFlush(duplicate)).rejects.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/entities/SubstanceGroup.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// packages/gsr/src/entities/SubstanceGroup.ts
import { Entity, Property, Unique, Index, ManyToOne, OneToMany, Collection, Rel, Enum } from '@mikro-orm/core';
import { BaseEntity, Substance } from '@eurocomply/database';

export enum InheritanceType {
  EXPLICIT = 'EXPLICIT',
  DERIVED = 'DERIVED',
}

/**
 * Represents a chemical family/group (e.g., "Lead and its compounds").
 * Used for group-based regulatory restrictions.
 */
@Entity({ tableName: 'substance_group', schema: 'public' })
export class SubstanceGroup extends BaseEntity {
  /** Unique code, e.g., "LEAD_COMPOUNDS", "PFAS" */
  @Property({ length: 100 })
  @Unique()
  @Index()
  code!: string;

  /** Display name */
  @Property({ type: 'text' })
  name!: string;

  /** Optional description */
  @Property({ type: 'text', nullable: true })
  description?: string;

  /** Parent group for nested hierarchies (rare) */
  @ManyToOne(() => SubstanceGroup, { fieldName: 'parent_group_id', nullable: true })
  parentGroup?: Rel<SubstanceGroup>;

  /** Members of this group */
  @OneToMany(() => SubstanceGroupMember, (member) => member.group)
  members = new Collection<SubstanceGroupMember>(this);
}

/**
 * Junction table linking substances to groups.
 */
@Entity({ tableName: 'substance_group_member', schema: 'public' })
@Unique({ properties: ['group', 'substance'] })
export class SubstanceGroupMember extends BaseEntity {
  @ManyToOne(() => SubstanceGroup, { fieldName: 'group_id' })
  @Index()
  group!: Rel<SubstanceGroup>;

  @ManyToOne(() => Substance, { fieldName: 'substance_id' })
  @Index()
  substance!: Rel<Substance>;

  /** How this membership was determined */
  @Enum({ items: () => InheritanceType, name: 'inheritance_type' })
  inheritanceType!: InheritanceType;

  /** Optional notes about membership */
  @Property({ type: 'text', nullable: true })
  notes?: string;
}

export { SubstanceGroupMember };
```

**Step 4: Update entities index**

```typescript
// packages/gsr/src/entities/index.ts
export { RegistrySource, RegistrySourceName } from './RegistrySource.js';
export { RegulatoryList } from './RegulatoryList.js';
export { SubstanceGroup, SubstanceGroupMember, InheritanceType } from './SubstanceGroup.js';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/entities/SubstanceGroup.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gsr/src/entities/
git commit -m "$(cat <<'EOF'
feat(gsr): add SubstanceGroup and SubstanceGroupMember entities

- SubstanceGroup for chemical families (LEAD_COMPOUNDS, PFAS, etc.)
- SubstanceGroupMember junction with InheritanceType (EXPLICIT/DERIVED)
- Supports nested groups via parentGroup
- Unique constraint on group+substance

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

---

### Task 3.4: Create SubstanceListEntry Entity

**Files:**
- Create: `packages/gsr/src/entities/SubstanceListEntry.ts`
- Modify: `packages/gsr/src/entities/index.ts`
- Test: `packages/gsr/src/entities/SubstanceListEntry.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/entities/SubstanceListEntry.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { Substance } from '@eurocomply/database';
import { SubstanceListEntry } from './SubstanceListEntry.js';
import { RegulatoryList } from './RegulatoryList.js';
import { SubstanceGroup } from './SubstanceGroup.js';
import { ProductScope } from '../enums/ProductScope.js';
import { ThresholdUnit } from '../enums/ThresholdUnit.js';
import { ThresholdOperator } from '../enums/ThresholdOperator.js';
import { ListingStatus } from '../enums/ListingStatus.js';

const dbAvailable = await isDatabaseAvailable();

describe('SubstanceListEntry', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let substance: Substance;
  let list: RegulatoryList;

  beforeAll(async () => {
    if (dbAvailable) {
      orm = await setupTestDb();
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await teardownTestDb();
    }
  });

  beforeEach(async () => {
    if (dbAvailable) {
      await clearTestDb(orm.em);
      em = orm.em.fork();

      substance = em.create(Substance, {
        casNumber: '1309-60-0',
        primaryName: 'Lead dioxide',
      });
      list = em.create(RegulatoryList, {
        code: 'REACH_ANNEX_XVII',
        name: 'REACH Annex XVII',
        jurisdiction: 'EU',
        publisher: 'ECHA',
      });
      await em.persistAndFlush([substance, list]);
    }
  });

  it.skipIf(!dbAvailable)('should create entry with substance reference', async () => {
    const entry = em.create(SubstanceListEntry, {
      substance,
      regulatoryList: list,
      status: ListingStatus.RESTRICTED,
      scopes: [ProductScope.JEWELRY],
      threshold: 0.05,
      thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
      thresholdOperator: ThresholdOperator.LTE,
      sourceReference: 'Entry 63',
    });

    await em.persistAndFlush(entry);
    em.clear();

    const found = await em.findOne(SubstanceListEntry, { substance }, { populate: ['substance', 'regulatoryList'] });
    expect(found).toBeTruthy();
    expect(found!.substance.casNumber).toBe('1309-60-0');
    expect(found!.regulatoryList.code).toBe('REACH_ANNEX_XVII');
    expect(found!.status).toBe(ListingStatus.RESTRICTED);
    expect(found!.scopes).toContain(ProductScope.JEWELRY);
    expect(found!.threshold).toBe(0.05);
  });

  it.skipIf(!dbAvailable)('should create entry with group reference instead of substance', async () => {
    const group = em.create(SubstanceGroup, {
      code: 'LEAD_COMPOUNDS',
      name: 'Lead and its compounds',
    });
    await em.persistAndFlush(group);

    const entry = em.create(SubstanceListEntry, {
      substanceGroup: group,
      regulatoryList: list,
      status: ListingStatus.RESTRICTED,
      scopes: [ProductScope.CONSUMER_GOODS],
      sourceReference: 'Entry 63',
    });

    await em.persistAndFlush(entry);
    em.clear();

    const found = await em.findOne(SubstanceListEntry, { substanceGroup: group }, { populate: ['substanceGroup'] });
    expect(found).toBeTruthy();
    expect(found!.substanceGroup!.code).toBe('LEAD_COMPOUNDS');
    expect(found!.substance).toBeUndefined();
  });

  it.skipIf(!dbAvailable)('should store multiple scopes as array', async () => {
    const entry = em.create(SubstanceListEntry, {
      substance,
      regulatoryList: list,
      status: ListingStatus.RESTRICTED,
      scopes: [ProductScope.TOYS, ProductScope.CHILDCARE_ARTICLES, ProductScope.JEWELRY],
      scopeRaw: 'toys, childcare articles, or jewelry',
    });

    await em.persistAndFlush(entry);
    em.clear();

    const found = await em.findOne(SubstanceListEntry, { substance });
    expect(found!.scopes).toHaveLength(3);
    expect(found!.scopes).toContain(ProductScope.TOYS);
    expect(found!.scopes).toContain(ProductScope.CHILDCARE_ARTICLES);
    expect(found!.scopes).toContain(ProductScope.JEWELRY);
    expect(found!.scopeRaw).toBe('toys, childcare articles, or jewelry');
  });

  it.skipIf(!dbAvailable)('should store conditions as JSONB', async () => {
    const conditions = {
      exemptions: ['components not accessible to children'],
      testMethod: 'EN 71-3',
      migrationLimit: true,
    };

    const entry = em.create(SubstanceListEntry, {
      substance,
      regulatoryList: list,
      status: ListingStatus.RESTRICTED,
      scopes: [ProductScope.TOYS],
      conditions,
    });

    await em.persistAndFlush(entry);
    em.clear();

    const found = await em.findOne(SubstanceListEntry, { substance });
    expect(found!.conditions).toEqual(conditions);
  });

  it.skipIf(!dbAvailable)('should store listing and effective dates', async () => {
    const listingDate = new Date('2008-10-28');
    const effectiveDate = new Date('2009-04-28');
    const sunsetDate = new Date('2025-12-31');

    const entry = em.create(SubstanceListEntry, {
      substance,
      regulatoryList: list,
      status: ListingStatus.LISTED,
      scopes: [ProductScope.ALL_PRODUCTS],
      listingDate,
      effectiveDate,
      sunsetDate,
    });

    await em.persistAndFlush(entry);
    em.clear();

    const found = await em.findOne(SubstanceListEntry, { substance });
    expect(found!.listingDate).toEqual(listingDate);
    expect(found!.effectiveDate).toEqual(effectiveDate);
    expect(found!.sunsetDate).toEqual(sunsetDate);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/entities/SubstanceListEntry.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// packages/gsr/src/entities/SubstanceListEntry.ts
import { Entity, Property, Index, ManyToOne, Rel, Enum, Unique } from '@mikro-orm/core';
import { BaseEntity, Substance } from '@eurocomply/database';
import { RegulatoryList } from './RegulatoryList.js';
import { SubstanceGroup } from './SubstanceGroup.js';
import { ProductScope } from '../enums/ProductScope.js';
import { ThresholdUnit } from '../enums/ThresholdUnit.js';
import { ThresholdOperator } from '../enums/ThresholdOperator.js';
import { ListingStatus } from '../enums/ListingStatus.js';

/**
 * Links a substance (or group) to a regulatory list with specific conditions.
 * Same substance can appear in multiple lists with different thresholds/scopes.
 */
@Entity({ tableName: 'substance_list_entry', schema: 'public' })
@Unique({ properties: ['substance', 'regulatoryList', 'scopes'] })
export class SubstanceListEntry extends BaseEntity {
  /** Individual substance (nullable if using group) */
  @ManyToOne(() => Substance, { fieldName: 'substance_id', nullable: true })
  @Index()
  substance?: Rel<Substance>;

  /** Group reference for group-based restrictions (nullable if using substance) */
  @ManyToOne(() => SubstanceGroup, { fieldName: 'substance_group_id', nullable: true })
  @Index()
  substanceGroup?: Rel<SubstanceGroup>;

  /** Which regulatory list this entry belongs to */
  @ManyToOne(() => RegulatoryList, { fieldName: 'regulatory_list_id' })
  @Index()
  regulatoryList!: Rel<RegulatoryList>;

  /** Status on this list */
  @Enum({ items: () => ListingStatus })
  status!: ListingStatus;

  /** When added to the list */
  @Property({ type: 'date', name: 'listing_date', nullable: true })
  listingDate?: Date;

  /** When restriction becomes effective */
  @Property({ type: 'date', name: 'effective_date', nullable: true })
  effectiveDate?: Date;

  /** When authorization expires (for Annex XIV) */
  @Property({ type: 'date', name: 'sunset_date', nullable: true })
  sunsetDate?: Date;

  /** Concentration threshold value */
  @Property({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  threshold?: number;

  /** Unit for threshold */
  @Enum({ items: () => ThresholdUnit, name: 'threshold_unit', nullable: true })
  thresholdUnit?: ThresholdUnit;

  /** Comparison operator for threshold */
  @Enum({ items: () => ThresholdOperator, name: 'threshold_operator', nullable: true })
  thresholdOperator?: ThresholdOperator;

  /** Product scopes this restriction applies to */
  @Property({ type: 'array', name: 'scopes' })
  scopes!: ProductScope[];

  /** Original extracted scope text */
  @Property({ type: 'text', name: 'scope_raw', nullable: true })
  scopeRaw?: string;

  /** Structured conditions/exemptions (JSONB) */
  @Property({ type: 'json', nullable: true })
  conditions?: Record<string, unknown>;

  /** Reference to source (e.g., "Annex XVII Entry 63") */
  @Property({ type: 'text', name: 'source_reference', nullable: true })
  sourceReference?: string;
}
```

**Step 4: Update entities index**

```typescript
// packages/gsr/src/entities/index.ts
export { RegistrySource, RegistrySourceName } from './RegistrySource.js';
export { RegulatoryList } from './RegulatoryList.js';
export { SubstanceGroup, SubstanceGroupMember, InheritanceType } from './SubstanceGroup.js';
export { SubstanceListEntry } from './SubstanceListEntry.js';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/entities/SubstanceListEntry.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gsr/src/entities/
git commit -m "$(cat <<'EOF'
feat(gsr): add SubstanceListEntry entity for multi-list regulatory status

- Links substance or group to regulatory list
- Stores threshold, unit, operator for concentration limits
- Array of ProductScope for applicable product categories
- JSONB conditions for exemptions and special rules
- Unique constraint on substance+list+scopes

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.5: Create UnresolvedSubstance Entity

**Files:**
- Create: `packages/gsr/src/entities/UnresolvedSubstance.ts`
- Modify: `packages/gsr/src/entities/index.ts`
- Test: `packages/gsr/src/entities/UnresolvedSubstance.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/entities/UnresolvedSubstance.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { Substance } from '@eurocomply/database';
import { UnresolvedSubstance, UnresolvedSource } from './UnresolvedSubstance.js';
import { UnresolvedStatus } from '../enums/UnresolvedStatus.js';
import { ResolutionType } from '../enums/ResolutionType.js';

const dbAvailable = await isDatabaseAvailable();

describe('UnresolvedSubstance', () => {
  let orm: MikroORM;
  let em: EntityManager;

  beforeAll(async () => {
    if (dbAvailable) {
      orm = await setupTestDb();
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await teardownTestDb();
    }
  });

  beforeEach(async () => {
    if (dbAvailable) {
      await clearTestDb(orm.em);
      em = orm.em.fork();
    }
  });

  it.skipIf(!dbAvailable)('should create unresolved substance with raw name', async () => {
    const unresolved = em.create(UnresolvedSubstance, {
      rawName: 'Proprietary Ingredient X',
      source: UnresolvedSource.CUSTOMER_UPLOAD,
      status: UnresolvedStatus.PENDING,
    });

    await em.persistAndFlush(unresolved);
    em.clear();

    const found = await em.findOne(UnresolvedSubstance, { rawName: 'Proprietary Ingredient X' });
    expect(found).toBeTruthy();
    expect(found!.status).toBe(UnresolvedStatus.PENDING);
    expect(found!.occurrenceCount).toBe(1);
  });

  it.skipIf(!dbAvailable)('should create with raw CAS number', async () => {
    const unresolved = em.create(UnresolvedSubstance, {
      rawName: 'Unknown substance',
      rawCasNumber: '12345-67-8',
      source: UnresolvedSource.EXTRACTION,
      status: UnresolvedStatus.PENDING,
    });

    await em.persistAndFlush(unresolved);
    em.clear();

    const found = await em.findOne(UnresolvedSubstance, { rawCasNumber: '12345-67-8' });
    expect(found).toBeTruthy();
    expect(found!.rawCasNumber).toBe('12345-67-8');
  });

  it.skipIf(!dbAvailable)('should track resolution to existing substance', async () => {
    const substance = em.create(Substance, {
      casNumber: '1309-60-0',
      primaryName: 'Lead dioxide',
    });
    await em.persistAndFlush(substance);

    const unresolved = em.create(UnresolvedSubstance, {
      rawName: 'PbO2',
      source: UnresolvedSource.EXTRACTION,
      status: UnresolvedStatus.RESOLVED,
      resolutionType: ResolutionType.MANUAL_MATCH,
      resolvedSubstance: substance,
      resolvedAt: new Date(),
      resolvedBy: 'admin@example.com',
    });

    await em.persistAndFlush(unresolved);
    em.clear();

    const found = await em.findOne(UnresolvedSubstance, { rawName: 'PbO2' }, { populate: ['resolvedSubstance'] });
    expect(found!.resolvedSubstance).toBeTruthy();
    expect(found!.resolvedSubstance!.casNumber).toBe('1309-60-0');
    expect(found!.resolutionType).toBe(ResolutionType.MANUAL_MATCH);
  });

  it.skipIf(!dbAvailable)('should increment occurrence count', async () => {
    const unresolved = em.create(UnresolvedSubstance, {
      rawName: 'Mystery Chemical',
      source: UnresolvedSource.CUSTOMER_UPLOAD,
      status: UnresolvedStatus.PENDING,
      occurrenceCount: 1,
    });
    await em.persistAndFlush(unresolved);

    unresolved.occurrenceCount = 5;
    await em.persistAndFlush(unresolved);
    em.clear();

    const found = await em.findOne(UnresolvedSubstance, { rawName: 'Mystery Chemical' });
    expect(found!.occurrenceCount).toBe(5);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/entities/UnresolvedSubstance.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// packages/gsr/src/entities/UnresolvedSubstance.ts
import { Entity, Property, Index, ManyToOne, Rel, Enum } from '@mikro-orm/core';
import { BaseEntity, Substance } from '@eurocomply/database';
import { UnresolvedStatus } from '../enums/UnresolvedStatus.js';
import { ResolutionType } from '../enums/ResolutionType.js';

export enum UnresolvedSource {
  EXTRACTION = 'EXTRACTION',
  CUSTOMER_UPLOAD = 'CUSTOMER_UPLOAD',
  BOM_IMPORT = 'BOM_IMPORT',
}

/**
 * Queue for substances that couldn't be resolved to master records.
 * Tracks raw input, occurrence count, and eventual resolution.
 */
@Entity({ tableName: 'unresolved_substance', schema: 'public' })
export class UnresolvedSubstance extends BaseEntity {
  /** What was extracted/submitted */
  @Property({ type: 'text', name: 'raw_name' })
  @Index()
  rawName!: string;

  /** Raw CAS number if provided (may be invalid/malformed) */
  @Property({ length: 50, name: 'raw_cas_number', nullable: true })
  @Index()
  rawCasNumber?: string;

  /** Where this came from */
  @Enum({ items: () => UnresolvedSource })
  source!: UnresolvedSource;

  /** How often this unresolved value appears */
  @Property({ type: 'int', name: 'occurrence_count', default: 1 })
  occurrenceCount: number = 1;

  /** Current status */
  @Enum({ items: () => UnresolvedStatus })
  @Index()
  status!: UnresolvedStatus;

  /** How it was resolved (if resolved) */
  @Enum({ items: () => ResolutionType, name: 'resolution_type', nullable: true })
  resolutionType?: ResolutionType;

  /** Linked substance if manually matched */
  @ManyToOne(() => Substance, { fieldName: 'resolved_substance_id', nullable: true })
  resolvedSubstance?: Rel<Substance>;

  /** When resolved */
  @Property({ type: 'timestamptz', name: 'resolved_at', nullable: true })
  resolvedAt?: Date;

  /** Who resolved it */
  @Property({ length: 255, name: 'resolved_by', nullable: true })
  resolvedBy?: string;
}
```

**Step 4: Update entities index**

```typescript
// packages/gsr/src/entities/index.ts
export { RegistrySource, RegistrySourceName } from './RegistrySource.js';
export { RegulatoryList } from './RegulatoryList.js';
export { SubstanceGroup, SubstanceGroupMember, InheritanceType } from './SubstanceGroup.js';
export { SubstanceListEntry } from './SubstanceListEntry.js';
export { UnresolvedSubstance, UnresolvedSource } from './UnresolvedSubstance.js';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/entities/UnresolvedSubstance.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gsr/src/entities/
git commit -m "$(cat <<'EOF'
feat(gsr): add UnresolvedSubstance entity for unmatched substances queue

- Stores raw name and CAS from failed resolution attempts
- Tracks occurrence count for prioritization
- Links to resolved substance when manually matched
- Status workflow: PENDING -> RESOLVED/IGNORED

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.6: Create BlindDisclosureRequest Entity

**Files:**
- Create: `packages/gsr/src/entities/BlindDisclosureRequest.ts`
- Modify: `packages/gsr/src/entities/index.ts`
- Test: `packages/gsr/src/entities/BlindDisclosureRequest.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/entities/BlindDisclosureRequest.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { BlindDisclosureRequest } from './BlindDisclosureRequest.js';
import { UnresolvedSubstance, UnresolvedSource } from './UnresolvedSubstance.js';
import { UnresolvedStatus } from '../enums/UnresolvedStatus.js';
import { DisclosureStatus } from '../enums/DisclosureStatus.js';
import { AttestationType } from '../enums/AttestationType.js';

const dbAvailable = await isDatabaseAvailable();

describe('BlindDisclosureRequest', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let unresolved: UnresolvedSubstance;

  beforeAll(async () => {
    if (dbAvailable) {
      orm = await setupTestDb();
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await teardownTestDb();
    }
  });

  beforeEach(async () => {
    if (dbAvailable) {
      await clearTestDb(orm.em);
      em = orm.em.fork();

      unresolved = em.create(UnresolvedSubstance, {
        rawName: 'Proprietary Additive Z',
        source: UnresolvedSource.CUSTOMER_UPLOAD,
        status: UnresolvedStatus.DISCLOSURE_REQUESTED,
      });
      await em.persistAndFlush(unresolved);
    }
  });

  it.skipIf(!dbAvailable)('should create disclosure request', async () => {
    const request = em.create(BlindDisclosureRequest, {
      unresolvedSubstance: unresolved,
      supplierId: 'supplier_123',
      productId: 'product_456',
      requestedBy: 'compliance@company.com',
      status: DisclosureStatus.PENDING,
      secureToken: 'abc123xyz',
      tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    await em.persistAndFlush(request);
    em.clear();

    const found = await em.findOne(BlindDisclosureRequest, { supplierId: 'supplier_123' });
    expect(found).toBeTruthy();
    expect(found!.status).toBe(DisclosureStatus.PENDING);
    expect(found!.secureToken).toBe('abc123xyz');
  });

  it.skipIf(!dbAvailable)('should track disclosure completion', async () => {
    const request = em.create(BlindDisclosureRequest, {
      unresolvedSubstance: unresolved,
      supplierId: 'supplier_123',
      requestedBy: 'admin@company.com',
      status: DisclosureStatus.DISCLOSED,
      secureToken: 'token123',
      tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      disclosedCasNumber: 'encrypted:abc123',
      disclosedAt: new Date(),
      attestationType: AttestationType.FULL_DISCLOSURE,
    });

    await em.persistAndFlush(request);
    em.clear();

    const found = await em.findOne(BlindDisclosureRequest, { supplierId: 'supplier_123' });
    expect(found!.status).toBe(DisclosureStatus.DISCLOSED);
    expect(found!.disclosedCasNumber).toBe('encrypted:abc123');
    expect(found!.attestationType).toBe(AttestationType.FULL_DISCLOSURE);
  });

  it.skipIf(!dbAvailable)('should track attestation without disclosure', async () => {
    const request = em.create(BlindDisclosureRequest, {
      unresolvedSubstance: unresolved,
      supplierId: 'supplier_456',
      requestedBy: 'compliance@company.com',
      status: DisclosureStatus.ATTESTED,
      secureToken: 'token456',
      tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      attestationType: AttestationType.COMPLIANT_ATTESTATION,
      attestationDocument: 's3://bucket/attestations/doc123.pdf',
    });

    await em.persistAndFlush(request);
    em.clear();

    const found = await em.findOne(BlindDisclosureRequest, { supplierId: 'supplier_456' });
    expect(found!.status).toBe(DisclosureStatus.ATTESTED);
    expect(found!.attestationType).toBe(AttestationType.COMPLIANT_ATTESTATION);
    expect(found!.attestationDocument).toBe('s3://bucket/attestations/doc123.pdf');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/entities/BlindDisclosureRequest.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// packages/gsr/src/entities/BlindDisclosureRequest.ts
import { Entity, Property, Index, ManyToOne, Rel, Enum } from '@mikro-orm/core';
import { BaseEntity } from '@eurocomply/database';
import { UnresolvedSubstance } from './UnresolvedSubstance.js';
import { DisclosureStatus } from '../enums/DisclosureStatus.js';
import { AttestationType } from '../enums/AttestationType.js';

/**
 * Tracks blind disclosure requests to suppliers for proprietary substances.
 * Suppliers can disclose CAS (encrypted) or provide attestation.
 */
@Entity({ tableName: 'blind_disclosure_request', schema: 'public' })
export class BlindDisclosureRequest extends BaseEntity {
  @ManyToOne(() => UnresolvedSubstance, { fieldName: 'unresolved_substance_id' })
  @Index()
  unresolvedSubstance!: Rel<UnresolvedSubstance>;

  /** Supplier to contact */
  @Property({ length: 100, name: 'supplier_id' })
  @Index()
  supplierId!: string;

  /** Product that uses this substance (optional) */
  @Property({ length: 100, name: 'product_id', nullable: true })
  productId?: string;

  /** When request was created */
  @Property({ type: 'timestamptz', name: 'requested_at', defaultRaw: 'NOW()' })
  requestedAt: Date = new Date();

  /** Who initiated the request */
  @Property({ length: 255, name: 'requested_by' })
  requestedBy!: string;

  /** Current status */
  @Enum({ items: () => DisclosureStatus })
  @Index()
  status!: DisclosureStatus;

  /** One-time access token for supplier portal */
  @Property({ length: 255, name: 'secure_token' })
  @Index()
  secureToken!: string;

  /** When token expires */
  @Property({ type: 'timestamptz', name: 'token_expires_at' })
  tokenExpiresAt!: Date;

  /** Encrypted CAS if disclosed */
  @Property({ type: 'text', name: 'disclosed_cas_number', nullable: true })
  disclosedCasNumber?: string;

  /** When disclosure was made */
  @Property({ type: 'timestamptz', name: 'disclosed_at', nullable: true })
  disclosedAt?: Date;

  /** Type of attestation provided */
  @Enum({ items: () => AttestationType, name: 'attestation_type', nullable: true })
  attestationType?: AttestationType;

  /** S3 key for signed attestation document */
  @Property({ type: 'text', name: 'attestation_document', nullable: true })
  attestationDocument?: string;
}
```

**Step 4: Update entities index**

```typescript
// packages/gsr/src/entities/index.ts
export { RegistrySource, RegistrySourceName } from './RegistrySource.js';
export { RegulatoryList } from './RegulatoryList.js';
export { SubstanceGroup, SubstanceGroupMember, InheritanceType } from './SubstanceGroup.js';
export { SubstanceListEntry } from './SubstanceListEntry.js';
export { UnresolvedSubstance, UnresolvedSource } from './UnresolvedSubstance.js';
export { BlindDisclosureRequest } from './BlindDisclosureRequest.js';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/entities/BlindDisclosureRequest.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gsr/src/entities/
git commit -m "$(cat <<'EOF'
feat(gsr): add BlindDisclosureRequest entity for supplier disclosure workflow

- Links to UnresolvedSubstance for proprietary ingredients
- Secure token for supplier portal access
- Supports full disclosure or compliance attestation
- Tracks attestation documents in S3

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4: Services

### Task 4.1: Create UnitConversionService

**Files:**
- Create: `packages/gsr/src/services/UnitConversionService.ts`
- Create: `packages/gsr/src/services/index.ts`
- Test: `packages/gsr/src/services/UnitConversionService.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/services/UnitConversionService.test.ts
import { describe, it, expect } from 'vitest';
import { UnitConversionService } from './UnitConversionService.js';
import { ThresholdUnit } from '../enums/ThresholdUnit.js';

describe('UnitConversionService', () => {
  const service = new UnitConversionService();

  describe('toCanonical', () => {
    it('should convert percent to PPM (1% = 10000 ppm)', () => {
      expect(service.toCanonical(1, ThresholdUnit.PERCENT_BY_WEIGHT)).toBe(10000);
      expect(service.toCanonical(0.1, ThresholdUnit.PERCENT_BY_WEIGHT)).toBe(1000);
      expect(service.toCanonical(0.05, ThresholdUnit.PERCENT_BY_WEIGHT)).toBe(500);
    });

    it('should return PPM unchanged', () => {
      expect(service.toCanonical(1000, ThresholdUnit.PPM)).toBe(1000);
    });

    it('should convert PPB to PPM (1000 ppb = 1 ppm)', () => {
      expect(service.toCanonical(1000, ThresholdUnit.PPB)).toBe(1);
      expect(service.toCanonical(100, ThresholdUnit.PPB)).toBe(0.1);
    });

    it('should treat MG_PER_KG same as PPM', () => {
      expect(service.toCanonical(500, ThresholdUnit.MG_PER_KG)).toBe(500);
    });

    it('should return null for incompatible units', () => {
      expect(service.toCanonical(10, ThresholdUnit.MG_PER_CM2)).toBeNull();
      expect(service.toCanonical(10, ThresholdUnit.MG_PER_L)).toBeNull();
    });
  });

  describe('areComparable', () => {
    it('should return true for weight-based units', () => {
      expect(service.areComparable(ThresholdUnit.PERCENT_BY_WEIGHT, ThresholdUnit.PPM)).toBe(true);
      expect(service.areComparable(ThresholdUnit.PPM, ThresholdUnit.PPB)).toBe(true);
      expect(service.areComparable(ThresholdUnit.MG_PER_KG, ThresholdUnit.PERCENT_BY_WEIGHT)).toBe(true);
    });

    it('should return false when either unit is incompatible', () => {
      expect(service.areComparable(ThresholdUnit.PPM, ThresholdUnit.MG_PER_CM2)).toBe(false);
      expect(service.areComparable(ThresholdUnit.MG_PER_L, ThresholdUnit.PERCENT_BY_WEIGHT)).toBe(false);
    });
  });

  describe('compareThresholds', () => {
    it('should return -1 when first threshold is stricter (lower)', () => {
      const result = service.compareThresholds(
        { value: 0.05, unit: ThresholdUnit.PERCENT_BY_WEIGHT },
        { value: 0.1, unit: ThresholdUnit.PERCENT_BY_WEIGHT }
      );
      expect(result).toBe(-1);
    });

    it('should return 1 when second threshold is stricter (lower)', () => {
      const result = service.compareThresholds(
        { value: 1000, unit: ThresholdUnit.PPM },
        { value: 500, unit: ThresholdUnit.PPM }
      );
      expect(result).toBe(1);
    });

    it('should return 0 when thresholds are equal', () => {
      const result = service.compareThresholds(
        { value: 0.1, unit: ThresholdUnit.PERCENT_BY_WEIGHT },
        { value: 1000, unit: ThresholdUnit.PPM }
      );
      expect(result).toBe(0);
    });

    it('should compare across different units correctly', () => {
      // 0.05% = 500 ppm, comparing to 1000 ppm
      const result = service.compareThresholds(
        { value: 0.05, unit: ThresholdUnit.PERCENT_BY_WEIGHT },
        { value: 1000, unit: ThresholdUnit.PPM }
      );
      expect(result).toBe(-1); // 500 < 1000, so first is stricter
    });

    it('should return null for incomparable units', () => {
      const result = service.compareThresholds(
        { value: 10, unit: ThresholdUnit.PPM },
        { value: 5, unit: ThresholdUnit.MG_PER_CM2 }
      );
      expect(result).toBeNull();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/services/UnitConversionService.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// packages/gsr/src/services/UnitConversionService.ts
import { ThresholdUnit, CONVERSION_TO_PPM } from '../enums/ThresholdUnit.js';

export interface ThresholdValue {
  value: number;
  unit: ThresholdUnit;
}

/**
 * Converts and compares thresholds across different units.
 * All conversions normalize to PPM as the canonical unit.
 */
export class UnitConversionService {
  /**
   * Convert threshold to canonical unit (PPM) for comparison.
   * @returns Normalized value in PPM, or null if unit is incompatible
   */
  toCanonical(value: number, unit: ThresholdUnit): number | null {
    const factor = CONVERSION_TO_PPM[unit];
    if (factor === null) return null;
    return value * factor;
  }

  /**
   * Check if two units can be compared.
   */
  areComparable(unit1: ThresholdUnit, unit2: ThresholdUnit): boolean {
    return (
      CONVERSION_TO_PPM[unit1] !== null &&
      CONVERSION_TO_PPM[unit2] !== null
    );
  }

  /**
   * Compare two thresholds, accounting for unit conversion.
   * @returns -1 if a is stricter (lower), 0 if equal, 1 if b is stricter, null if incomparable
   */
  compareThresholds(a: ThresholdValue, b: ThresholdValue): -1 | 0 | 1 | null {
    if (!this.areComparable(a.unit, b.unit)) return null;

    const aPpm = this.toCanonical(a.value, a.unit)!;
    const bPpm = this.toCanonical(b.value, b.unit)!;

    // Lower threshold = stricter
    if (aPpm < bPpm) return -1;
    if (aPpm > bPpm) return 1;
    return 0;
  }
}
```

**Step 4: Create services index**

```typescript
// packages/gsr/src/services/index.ts
export { UnitConversionService, type ThresholdValue } from './UnitConversionService.js';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/services/UnitConversionService.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gsr/src/services/
git commit -m "$(cat <<'EOF'
feat(gsr): add UnitConversionService for threshold comparison

- toCanonical() converts all weight-based units to PPM
- areComparable() checks if units can be compared
- compareThresholds() determines which threshold is stricter
- Returns null for incompatible dimensions (surface area, concentration)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4.2: Create SubstanceResolver Service

**Files:**
- Create: `packages/gsr/src/services/SubstanceResolver.ts`
- Modify: `packages/gsr/src/services/index.ts`
- Test: `packages/gsr/src/services/SubstanceResolver.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/services/SubstanceResolver.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { Substance, SubstanceAlias, AliasType } from '@eurocomply/database';
import { SubstanceResolver, ResolveStatus } from './SubstanceResolver.js';

const dbAvailable = await isDatabaseAvailable();

describe('SubstanceResolver', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let resolver: SubstanceResolver;

  beforeAll(async () => {
    if (dbAvailable) {
      orm = await setupTestDb();
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await teardownTestDb();
    }
  });

  beforeEach(async () => {
    if (dbAvailable) {
      await clearTestDb(orm.em);
      em = orm.em.fork();
      resolver = new SubstanceResolver(em);

      // Seed test substances
      const lead = em.create(Substance, {
        casNumber: '1309-60-0',
        ecNumber: '215-174-5',
        primaryName: 'Lead dioxide',
      });
      const cadmium = em.create(Substance, {
        casNumber: '7440-43-9',
        ecNumber: '231-152-8',
        primaryName: 'Cadmium',
      });
      await em.persistAndFlush([lead, cadmium]);

      // Add aliases
      const alias1 = em.create(SubstanceAlias, {
        substance: lead,
        name: 'PbO2',
        type: AliasType.COMMON,
      });
      const alias2 = em.create(SubstanceAlias, {
        substance: lead,
        name: 'Lead peroxide',
        type: AliasType.SYNONYM,
      });
      await em.persistAndFlush([alias1, alias2]);
    }
  });

  describe('resolve by CAS', () => {
    it.skipIf(!dbAvailable)('should match exact CAS number', async () => {
      const result = await resolver.resolve({ casNumber: '1309-60-0' });

      expect(result.status).toBe(ResolveStatus.MATCHED);
      expect(result.match).toBeTruthy();
      expect(result.match!.casNumber).toBe('1309-60-0');
      expect(result.match!.matchedVia).toBe('CAS');
      expect(result.match!.confidence).toBe(1.0);
    });

    it.skipIf(!dbAvailable)('should sanitize and match CAS with spaces', async () => {
      const result = await resolver.resolve({ casNumber: '1309- 60 -0' });

      expect(result.status).toBe(ResolveStatus.MATCHED);
      expect(result.match!.casNumber).toBe('1309-60-0');
    });

    it.skipIf(!dbAvailable)('should return UNRESOLVED for invalid CAS checksum', async () => {
      const result = await resolver.resolve({ casNumber: '1309-60-1' });

      expect(result.status).toBe(ResolveStatus.UNRESOLVED);
      expect(result.sanitizedInput.casNumber).toBeNull();
    });
  });

  describe('resolve by EC number', () => {
    it.skipIf(!dbAvailable)('should match by EC number when CAS not found', async () => {
      const result = await resolver.resolve({ ecNumber: '215-174-5' });

      expect(result.status).toBe(ResolveStatus.MATCHED);
      expect(result.match!.casNumber).toBe('1309-60-0');
      expect(result.match!.matchedVia).toBe('EC');
    });
  });

  describe('resolve by alias', () => {
    it.skipIf(!dbAvailable)('should match exact alias', async () => {
      const result = await resolver.resolve({ name: 'PbO2' });

      expect(result.status).toBe(ResolveStatus.MATCHED);
      expect(result.match!.casNumber).toBe('1309-60-0');
      expect(result.match!.matchedVia).toBe('ALIAS_EXACT');
      expect(result.match!.matchedAlias).toBe('PbO2');
    });

    it.skipIf(!dbAvailable)('should match case-insensitive alias', async () => {
      const result = await resolver.resolve({ name: 'pbo2' });

      expect(result.status).toBe(ResolveStatus.MATCHED);
      expect(result.match!.casNumber).toBe('1309-60-0');
    });

    it.skipIf(!dbAvailable)('should match alias with extra whitespace', async () => {
      const result = await resolver.resolve({ name: '  Lead peroxide  ' });

      expect(result.status).toBe(ResolveStatus.MATCHED);
      expect(result.match!.matchedAlias).toBe('Lead peroxide');
    });
  });

  describe('unresolved cases', () => {
    it.skipIf(!dbAvailable)('should return UNRESOLVED when no match found', async () => {
      const result = await resolver.resolve({ name: 'Unknown Chemical XYZ' });

      expect(result.status).toBe(ResolveStatus.UNRESOLVED);
      expect(result.match).toBeUndefined();
      expect(result.candidates).toBeUndefined();
    });

    it.skipIf(!dbAvailable)('should include sanitized input in result', async () => {
      const result = await resolver.resolve({
        casNumber: 'CAS: 9999-99-9',
        name: '  Some Chemical  ',
      });

      expect(result.sanitizedInput.name).toBe('some chemical');
    });
  });

  describe('priority order', () => {
    it.skipIf(!dbAvailable)('should prefer CAS match over EC match', async () => {
      const result = await resolver.resolve({
        casNumber: '1309-60-0',
        ecNumber: '231-152-8', // This is Cadmium's EC
      });

      expect(result.match!.casNumber).toBe('1309-60-0'); // Lead, not Cadmium
      expect(result.match!.matchedVia).toBe('CAS');
    });

    it.skipIf(!dbAvailable)('should prefer EC match over alias match', async () => {
      const result = await resolver.resolve({
        ecNumber: '215-174-5',
        name: 'Cadmium',
      });

      expect(result.match!.casNumber).toBe('1309-60-0'); // Lead by EC
      expect(result.match!.matchedVia).toBe('EC');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/services/SubstanceResolver.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// packages/gsr/src/services/SubstanceResolver.ts
import { EntityManager } from '@mikro-orm/postgresql';
import { Substance, SubstanceAlias } from '@eurocomply/database';
import { sanitizeCas } from '../utils/cas-sanitizer.js';
import { normalizeName } from '../utils/name-normalizer.js';

export enum ResolveStatus {
  MATCHED = 'MATCHED',
  CANDIDATES = 'CANDIDATES',
  UNRESOLVED = 'UNRESOLVED',
}

export type MatchedVia = 'CAS' | 'EC' | 'ALIAS_EXACT' | 'ALIAS_FUZZY';

export interface SubstanceCandidate {
  substanceId: string;
  casNumber: string;
  primaryName: string;
  matchedVia: MatchedVia;
  confidence: number;
  matchedAlias?: string;
}

export interface ResolveInput {
  casNumber?: string | null;
  ecNumber?: string | null;
  name?: string | null;
}

export interface ResolveResult {
  status: ResolveStatus;
  match?: SubstanceCandidate;
  candidates?: SubstanceCandidate[];
  sanitizedInput: {
    casNumber: string | null;
    ecNumber: string | null;
    name: string | null;
  };
}

/**
 * Resolves substance references to master records.
 * Priority: CAS > EC > Exact Alias > Fuzzy Alias
 */
export class SubstanceResolver {
  constructor(private readonly em: EntityManager) {}

  async resolve(input: ResolveInput): Promise<ResolveResult> {
    const sanitized = {
      casNumber: input.casNumber ? sanitizeCas(input.casNumber) : null,
      ecNumber: input.ecNumber?.trim() || null,
      name: input.name ? normalizeName(input.name) : null,
    };

    // 1. Try exact CAS match
    if (sanitized.casNumber) {
      const substance = await this.em.findOne(Substance, { casNumber: sanitized.casNumber });
      if (substance) {
        return this.matched(substance, 'CAS', sanitized);
      }
    }

    // 2. Try exact EC match
    if (sanitized.ecNumber) {
      const substance = await this.em.findOne(Substance, { ecNumber: sanitized.ecNumber });
      if (substance) {
        return this.matched(substance, 'EC', sanitized);
      }
    }

    // 3. Try exact alias match (case-insensitive)
    if (sanitized.name) {
      const alias = await this.em.findOne(
        SubstanceAlias,
        { name: { $ilike: sanitized.name } },
        { populate: ['substance'] }
      );
      if (alias) {
        return this.matched(alias.substance, 'ALIAS_EXACT', sanitized, alias.name);
      }
    }

    // 4. No match found
    return {
      status: ResolveStatus.UNRESOLVED,
      sanitizedInput: sanitized,
    };
  }

  private matched(
    substance: Substance,
    matchedVia: MatchedVia,
    sanitized: ResolveResult['sanitizedInput'],
    matchedAlias?: string
  ): ResolveResult {
    return {
      status: ResolveStatus.MATCHED,
      match: {
        substanceId: substance.id,
        casNumber: substance.casNumber,
        primaryName: substance.primaryName,
        matchedVia,
        confidence: 1.0,
        matchedAlias,
      },
      sanitizedInput: sanitized,
    };
  }
}
```

**Step 4: Update services index**

```typescript
// packages/gsr/src/services/index.ts
export { UnitConversionService, type ThresholdValue } from './UnitConversionService.js';
export {
  SubstanceResolver,
  ResolveStatus,
  type MatchedVia,
  type SubstanceCandidate,
  type ResolveInput,
  type ResolveResult,
} from './SubstanceResolver.js';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/services/SubstanceResolver.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gsr/src/services/
git commit -m "$(cat <<'EOF'
feat(gsr): add SubstanceResolver service for identity resolution

- Resolves substances by CAS, EC number, or alias name
- Priority order: CAS > EC > Alias exact match
- Sanitizes input (CAS checksum, name normalization)
- Returns match details including confidence and matchedVia

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4.3: Add Fuzzy Matching to SubstanceResolver

**Files:**
- Modify: `packages/gsr/src/services/SubstanceResolver.ts`
- Test: `packages/gsr/src/services/SubstanceResolver.fuzzy.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/services/SubstanceResolver.fuzzy.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { Substance, SubstanceAlias, AliasType } from '@eurocomply/database';
import { SubstanceResolver, ResolveStatus } from './SubstanceResolver.js';

const dbAvailable = await isDatabaseAvailable();

describe('SubstanceResolver fuzzy matching', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let resolver: SubstanceResolver;

  beforeAll(async () => {
    if (dbAvailable) {
      orm = await setupTestDb();
      // Enable pg_trgm extension
      await orm.em.execute('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await teardownTestDb();
    }
  });

  beforeEach(async () => {
    if (dbAvailable) {
      await clearTestDb(orm.em);
      em = orm.em.fork();
      resolver = new SubstanceResolver(em);

      // Seed test substances with aliases
      const lead = em.create(Substance, {
        casNumber: '1309-60-0',
        primaryName: 'Lead dioxide',
      });
      await em.persistAndFlush(lead);

      const aliases = [
        { substance: lead, name: 'Lead peroxide', type: AliasType.SYNONYM },
        { substance: lead, name: 'Plumbic oxide', type: AliasType.COMMON },
        { substance: lead, name: 'Lead(IV) oxide', type: AliasType.IUPAC },
      ];
      for (const data of aliases) {
        em.create(SubstanceAlias, data);
      }
      await em.flush();
    }
  });

  it.skipIf(!dbAvailable)('should return CANDIDATES for fuzzy match above threshold', async () => {
    const result = await resolver.resolve({ name: 'Lead peroxid' }); // Missing 'e'

    expect(result.status).toBe(ResolveStatus.CANDIDATES);
    expect(result.candidates).toBeDefined();
    expect(result.candidates!.length).toBeGreaterThan(0);
    expect(result.candidates![0].matchedVia).toBe('ALIAS_FUZZY');
    expect(result.candidates![0].confidence).toBeGreaterThan(0.6);
    expect(result.candidates![0].confidence).toBeLessThan(1.0);
  });

  it.skipIf(!dbAvailable)('should auto-accept single high-confidence fuzzy match', async () => {
    // Very close match should auto-resolve
    const result = await resolver.resolve({ name: 'Lead dioxide' }); // Exact but through alias check

    expect(result.status).toBe(ResolveStatus.MATCHED);
  });

  it.skipIf(!dbAvailable)('should return multiple candidates sorted by confidence', async () => {
    const result = await resolver.resolve({ name: 'Lead oxid' }); // Matches multiple aliases

    if (result.status === ResolveStatus.CANDIDATES) {
      expect(result.candidates!.length).toBeGreaterThan(0);
      // Should be sorted by confidence descending
      for (let i = 1; i < result.candidates!.length; i++) {
        expect(result.candidates![i - 1].confidence).toBeGreaterThanOrEqual(
          result.candidates![i].confidence
        );
      }
    }
  });

  it.skipIf(!dbAvailable)('should return UNRESOLVED for very low similarity', async () => {
    const result = await resolver.resolve({ name: 'Completely different chemical' });

    expect(result.status).toBe(ResolveStatus.UNRESOLVED);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/services/SubstanceResolver.fuzzy.test.ts`
Expected: FAIL (fuzzy matching not implemented)

**Step 3: Update SubstanceResolver with fuzzy matching**

```typescript
// packages/gsr/src/services/SubstanceResolver.ts
import { EntityManager } from '@mikro-orm/postgresql';
import { Substance, SubstanceAlias } from '@eurocomply/database';
import { sanitizeCas } from '../utils/cas-sanitizer.js';
import { normalizeName } from '../utils/name-normalizer.js';

export enum ResolveStatus {
  MATCHED = 'MATCHED',
  CANDIDATES = 'CANDIDATES',
  UNRESOLVED = 'UNRESOLVED',
}

export type MatchedVia = 'CAS' | 'EC' | 'ALIAS_EXACT' | 'ALIAS_FUZZY';

export interface SubstanceCandidate {
  substanceId: string;
  casNumber: string;
  primaryName: string;
  matchedVia: MatchedVia;
  confidence: number;
  matchedAlias?: string;
}

export interface ResolveInput {
  casNumber?: string | null;
  ecNumber?: string | null;
  name?: string | null;
}

export interface ResolveResult {
  status: ResolveStatus;
  match?: SubstanceCandidate;
  candidates?: SubstanceCandidate[];
  sanitizedInput: {
    casNumber: string | null;
    ecNumber: string | null;
    name: string | null;
  };
}

/** Minimum similarity for fuzzy results */
const FUZZY_MIN_THRESHOLD = 0.6;
/** Auto-accept threshold for single high-confidence match */
const FUZZY_AUTO_ACCEPT_THRESHOLD = 0.85;

/**
 * Resolves substance references to master records.
 * Priority: CAS > EC > Exact Alias > Fuzzy Alias
 */
export class SubstanceResolver {
  constructor(private readonly em: EntityManager) {}

  async resolve(input: ResolveInput): Promise<ResolveResult> {
    const sanitized = {
      casNumber: input.casNumber ? sanitizeCas(input.casNumber) : null,
      ecNumber: input.ecNumber?.trim() || null,
      name: input.name ? normalizeName(input.name) : null,
    };

    // 1. Try exact CAS match
    if (sanitized.casNumber) {
      const substance = await this.em.findOne(Substance, { casNumber: sanitized.casNumber });
      if (substance) {
        return this.matched(substance, 'CAS', sanitized);
      }
    }

    // 2. Try exact EC match
    if (sanitized.ecNumber) {
      const substance = await this.em.findOne(Substance, { ecNumber: sanitized.ecNumber });
      if (substance) {
        return this.matched(substance, 'EC', sanitized);
      }
    }

    // 3. Try exact alias match (case-insensitive)
    if (sanitized.name) {
      const alias = await this.em.findOne(
        SubstanceAlias,
        { name: { $ilike: sanitized.name } },
        { populate: ['substance'] }
      );
      if (alias) {
        return this.matched(alias.substance, 'ALIAS_EXACT', sanitized, alias.name);
      }

      // 4. Try fuzzy alias match using pg_trgm
      const fuzzyResult = await this.fuzzyMatch(sanitized.name, sanitized);
      if (fuzzyResult) {
        return fuzzyResult;
      }
    }

    // 5. No match found
    return {
      status: ResolveStatus.UNRESOLVED,
      sanitizedInput: sanitized,
    };
  }

  private async fuzzyMatch(
    name: string,
    sanitized: ResolveResult['sanitizedInput']
  ): Promise<ResolveResult | null> {
    // Use pg_trgm similarity function
    const results = await this.em.execute<Array<{
      id: string;
      substance_id: string;
      name: string;
      cas_number: string;
      primary_name: string;
      similarity: number;
    }>>(`
      SELECT
        sa.id,
        sa.substance_id,
        sa.name,
        s.cas_number,
        s.primary_name,
        similarity(LOWER(sa.name), LOWER($1)) as similarity
      FROM substance_alias sa
      JOIN substance s ON s.id = sa.substance_id
      WHERE similarity(LOWER(sa.name), LOWER($1)) > $2
      ORDER BY similarity DESC
      LIMIT 10
    `, [name, FUZZY_MIN_THRESHOLD]);

    if (results.length === 0) {
      return null;
    }

    const candidates: SubstanceCandidate[] = results.map((row) => ({
      substanceId: row.substance_id,
      casNumber: row.cas_number,
      primaryName: row.primary_name,
      matchedVia: 'ALIAS_FUZZY' as const,
      confidence: row.similarity,
      matchedAlias: row.name,
    }));

    // Auto-accept if single result with high confidence
    if (candidates.length === 1 && candidates[0].confidence >= FUZZY_AUTO_ACCEPT_THRESHOLD) {
      return {
        status: ResolveStatus.MATCHED,
        match: candidates[0],
        sanitizedInput: sanitized,
      };
    }

    return {
      status: ResolveStatus.CANDIDATES,
      candidates,
      sanitizedInput: sanitized,
    };
  }

  private matched(
    substance: Substance,
    matchedVia: MatchedVia,
    sanitized: ResolveResult['sanitizedInput'],
    matchedAlias?: string
  ): ResolveResult {
    return {
      status: ResolveStatus.MATCHED,
      match: {
        substanceId: substance.id,
        casNumber: substance.casNumber,
        primaryName: substance.primaryName,
        matchedVia,
        confidence: 1.0,
        matchedAlias,
      },
      sanitizedInput: sanitized,
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/services/SubstanceResolver.fuzzy.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gsr/src/services/
git commit -m "$(cat <<'EOF'
feat(gsr): add fuzzy matching to SubstanceResolver using pg_trgm

- Uses PostgreSQL pg_trgm similarity() for fuzzy alias matching
- Returns CANDIDATES when multiple matches above 0.6 threshold
- Auto-accepts single match above 0.85 confidence
- Results sorted by similarity score descending

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4.4: Create ConflictDetector Service

**Files:**
- Create: `packages/gsr/src/services/ConflictDetector.ts`
- Modify: `packages/gsr/src/services/index.ts`
- Test: `packages/gsr/src/services/ConflictDetector.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/services/ConflictDetector.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { Substance } from '@eurocomply/database';
import { ConflictDetector, ConflictType, ConflictSeverity } from './ConflictDetector.js';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { SubstanceListEntry } from '../entities/SubstanceListEntry.js';
import { ProductScope } from '../enums/ProductScope.js';
import { ThresholdUnit } from '../enums/ThresholdUnit.js';
import { ThresholdOperator } from '../enums/ThresholdOperator.js';
import { ListingStatus } from '../enums/ListingStatus.js';

const dbAvailable = await isDatabaseAvailable();

describe('ConflictDetector', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let detector: ConflictDetector;
  let substance: Substance;
  let list: RegulatoryList;

  beforeAll(async () => {
    if (dbAvailable) {
      orm = await setupTestDb();
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await teardownTestDb();
    }
  });

  beforeEach(async () => {
    if (dbAvailable) {
      await clearTestDb(orm.em);
      em = orm.em.fork();
      detector = new ConflictDetector(em);

      substance = em.create(Substance, {
        casNumber: '1309-60-0',
        primaryName: 'Lead dioxide',
      });
      list = em.create(RegulatoryList, {
        code: 'REACH_ANNEX_XVII',
        name: 'REACH Annex XVII',
        jurisdiction: 'EU',
        publisher: 'ECHA',
      });
      await em.persistAndFlush([substance, list]);
    }
  });

  describe('threshold conflicts', () => {
    it.skipIf(!dbAvailable)('should detect threshold mismatch for same scope', async () => {
      // Existing entry: 0.05% in jewelry
      const existing = em.create(SubstanceListEntry, {
        substance,
        regulatoryList: list,
        status: ListingStatus.RESTRICTED,
        scopes: [ProductScope.JEWELRY],
        threshold: 0.05,
        thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
        thresholdOperator: ThresholdOperator.LTE,
      });
      await em.persistAndFlush(existing);

      // New entry: 0.1% in jewelry (different threshold)
      const newEntry = {
        substanceId: substance.id,
        regulatoryListId: list.id,
        status: ListingStatus.RESTRICTED,
        scopes: [ProductScope.JEWELRY],
        threshold: 0.1,
        thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
      };

      const conflicts = await detector.detect(newEntry);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe(ConflictType.THRESHOLD_MISMATCH);
      expect(conflicts[0].severity).toBe(ConflictSeverity.ERROR);
    });

    it.skipIf(!dbAvailable)('should detect stricter existing threshold', async () => {
      // Existing: 0.05% (stricter)
      const existing = em.create(SubstanceListEntry, {
        substance,
        regulatoryList: list,
        status: ListingStatus.RESTRICTED,
        scopes: [ProductScope.TOYS],
        threshold: 0.05,
        thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
        thresholdOperator: ThresholdOperator.LTE,
      });
      await em.persistAndFlush(existing);

      // New: 0.1% (looser)
      const newEntry = {
        substanceId: substance.id,
        regulatoryListId: list.id,
        scopes: [ProductScope.TOYS],
        threshold: 0.1,
        thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
      };

      const conflicts = await detector.detect(newEntry);

      expect(conflicts.some(c => c.type === ConflictType.STRICTER_EXISTS)).toBe(true);
    });
  });

  describe('scope overlap conflicts', () => {
    it.skipIf(!dbAvailable)('should detect conflict when parent scope exists', async () => {
      // Existing: CONSUMER_GOODS (parent)
      const existing = em.create(SubstanceListEntry, {
        substance,
        regulatoryList: list,
        status: ListingStatus.RESTRICTED,
        scopes: [ProductScope.CONSUMER_GOODS],
        threshold: 0.1,
        thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
      });
      await em.persistAndFlush(existing);

      // New: TOYS (child of CONSUMER_GOODS) with different threshold
      const newEntry = {
        substanceId: substance.id,
        regulatoryListId: list.id,
        scopes: [ProductScope.TOYS],
        threshold: 0.05,
        thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
      };

      const conflicts = await detector.detect(newEntry);

      expect(conflicts.some(c => c.type === ConflictType.SCOPE_OVERLAP)).toBe(true);
    });

    it.skipIf(!dbAvailable)('should detect conflict when child scope exists', async () => {
      // Existing: TOYS (child)
      const existing = em.create(SubstanceListEntry, {
        substance,
        regulatoryList: list,
        status: ListingStatus.RESTRICTED,
        scopes: [ProductScope.TOYS],
        threshold: 0.05,
        thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
      });
      await em.persistAndFlush(existing);

      // New: CONSUMER_GOODS (parent of TOYS) with different threshold
      const newEntry = {
        substanceId: substance.id,
        regulatoryListId: list.id,
        scopes: [ProductScope.CONSUMER_GOODS],
        threshold: 0.1,
        thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
      };

      const conflicts = await detector.detect(newEntry);

      expect(conflicts.some(c => c.type === ConflictType.SCOPE_OVERLAP)).toBe(true);
    });
  });

  describe('status conflicts', () => {
    it.skipIf(!dbAvailable)('should detect BANNED vs RESTRICTED contradiction', async () => {
      // Existing: BANNED
      const existing = em.create(SubstanceListEntry, {
        substance,
        regulatoryList: list,
        status: ListingStatus.BANNED,
        scopes: [ProductScope.TOYS],
      });
      await em.persistAndFlush(existing);

      // New: RESTRICTED (contradiction)
      const newEntry = {
        substanceId: substance.id,
        regulatoryListId: list.id,
        status: ListingStatus.RESTRICTED,
        scopes: [ProductScope.TOYS],
        threshold: 0.1,
        thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
      };

      const conflicts = await detector.detect(newEntry);

      expect(conflicts.some(c => c.type === ConflictType.STATUS_CONTRADICTION)).toBe(true);
      expect(conflicts.find(c => c.type === ConflictType.STATUS_CONTRADICTION)?.severity).toBe(ConflictSeverity.ERROR);
    });
  });

  describe('no conflicts', () => {
    it.skipIf(!dbAvailable)('should return empty array when no conflicts', async () => {
      // Existing: JEWELRY
      const existing = em.create(SubstanceListEntry, {
        substance,
        regulatoryList: list,
        status: ListingStatus.RESTRICTED,
        scopes: [ProductScope.JEWELRY],
        threshold: 0.05,
        thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
      });
      await em.persistAndFlush(existing);

      // New: BATTERIES (completely different scope, no overlap)
      const newEntry = {
        substanceId: substance.id,
        regulatoryListId: list.id,
        scopes: [ProductScope.BATTERIES],
        threshold: 0.1,
        thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
      };

      const conflicts = await detector.detect(newEntry);

      expect(conflicts).toHaveLength(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/services/ConflictDetector.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// packages/gsr/src/services/ConflictDetector.ts
import { EntityManager } from '@mikro-orm/postgresql';
import { SubstanceListEntry } from '../entities/SubstanceListEntry.js';
import { ProductScope, isScopeAncestor } from '../enums/ProductScope.js';
import { ThresholdUnit } from '../enums/ThresholdUnit.js';
import { ListingStatus } from '../enums/ListingStatus.js';
import { UnitConversionService } from './UnitConversionService.js';

export enum ConflictType {
  THRESHOLD_MISMATCH = 'THRESHOLD_MISMATCH',
  STATUS_CONTRADICTION = 'STATUS_CONTRADICTION',
  SCOPE_OVERLAP = 'SCOPE_OVERLAP',
  STRICTER_EXISTS = 'STRICTER_EXISTS',
  SUPERSEDED = 'SUPERSEDED',
}

export enum ConflictSeverity {
  ERROR = 'ERROR',
  WARNING = 'WARNING',
  INFO = 'INFO',
}

export interface Conflict {
  type: ConflictType;
  severity: ConflictSeverity;
  existingEntryId: string;
  message: string;
  suggestedAction?: 'ARCHIVE_OLD' | 'REJECT_NEW' | 'MANUAL_REVIEW';
}

export interface NewEntryInput {
  substanceId: string;
  regulatoryListId: string;
  status?: ListingStatus;
  scopes: ProductScope[];
  threshold?: number;
  thresholdUnit?: ThresholdUnit;
}

/**
 * Detects conflicts between new entries and existing SubstanceListEntry records.
 */
export class ConflictDetector {
  private unitConversion = new UnitConversionService();

  constructor(private readonly em: EntityManager) {}

  async detect(newEntry: NewEntryInput): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];

    // Find all existing entries for same substance + list
    const existingEntries = await this.em.find(SubstanceListEntry, {
      substance: newEntry.substanceId,
      regulatoryList: newEntry.regulatoryListId,
    });

    for (const existing of existingEntries) {
      // Check scope overlap
      const scopeOverlap = this.checkScopeOverlap(existing.scopes, newEntry.scopes);
      if (!scopeOverlap) continue;

      // Status contradiction
      if (newEntry.status && existing.status) {
        const statusConflict = this.checkStatusConflict(existing.status, newEntry.status);
        if (statusConflict) {
          conflicts.push({
            type: ConflictType.STATUS_CONTRADICTION,
            severity: ConflictSeverity.ERROR,
            existingEntryId: existing.id,
            message: `Status conflict: existing ${existing.status} vs new ${newEntry.status}`,
            suggestedAction: 'MANUAL_REVIEW',
          });
        }
      }

      // Threshold conflicts
      if (newEntry.threshold !== undefined && existing.threshold !== undefined) {
        const thresholdConflicts = this.checkThresholdConflict(
          { value: existing.threshold, unit: existing.thresholdUnit! },
          { value: newEntry.threshold, unit: newEntry.thresholdUnit! },
          existing.id,
          scopeOverlap
        );
        conflicts.push(...thresholdConflicts);
      }

      // Scope overlap warning (when thresholds differ)
      if (scopeOverlap === 'PARENT_CHILD' || scopeOverlap === 'CHILD_PARENT') {
        conflicts.push({
          type: ConflictType.SCOPE_OVERLAP,
          severity: ConflictSeverity.WARNING,
          existingEntryId: existing.id,
          message: `Scope hierarchy conflict: ${scopeOverlap === 'PARENT_CHILD' ? 'existing parent scope' : 'existing child scope'}`,
          suggestedAction: 'MANUAL_REVIEW',
        });
      }
    }

    return conflicts;
  }

  private checkScopeOverlap(
    existingScopes: ProductScope[],
    newScopes: ProductScope[]
  ): 'EXACT' | 'PARENT_CHILD' | 'CHILD_PARENT' | null {
    // Check exact match
    const exactMatch = existingScopes.some(e => newScopes.includes(e));
    if (exactMatch) return 'EXACT';

    // Check if existing is parent of new
    for (const existingScope of existingScopes) {
      for (const newScope of newScopes) {
        if (isScopeAncestor(existingScope, newScope)) return 'PARENT_CHILD';
        if (isScopeAncestor(newScope, existingScope)) return 'CHILD_PARENT';
      }
    }

    return null;
  }

  private checkStatusConflict(existing: ListingStatus, newStatus: ListingStatus): boolean {
    // BANNED and RESTRICTED are contradictory
    if (
      (existing === ListingStatus.BANNED && newStatus === ListingStatus.RESTRICTED) ||
      (existing === ListingStatus.RESTRICTED && newStatus === ListingStatus.BANNED)
    ) {
      return true;
    }
    return false;
  }

  private checkThresholdConflict(
    existing: { value: number; unit: ThresholdUnit },
    newThreshold: { value: number; unit: ThresholdUnit },
    existingId: string,
    scopeOverlap: string
  ): Conflict[] {
    const conflicts: Conflict[] = [];

    const comparison = this.unitConversion.compareThresholds(existing, newThreshold);

    if (comparison === null) {
      // Incomparable units
      conflicts.push({
        type: ConflictType.THRESHOLD_MISMATCH,
        severity: ConflictSeverity.WARNING,
        existingEntryId: existingId,
        message: `Cannot compare thresholds: ${existing.unit} vs ${newThreshold.unit}`,
        suggestedAction: 'MANUAL_REVIEW',
      });
    } else if (comparison !== 0 && scopeOverlap === 'EXACT') {
      // Same scope, different thresholds
      conflicts.push({
        type: ConflictType.THRESHOLD_MISMATCH,
        severity: ConflictSeverity.ERROR,
        existingEntryId: existingId,
        message: `Threshold conflict: existing ${existing.value} ${existing.unit} vs new ${newThreshold.value} ${newThreshold.unit}`,
        suggestedAction: 'MANUAL_REVIEW',
      });
    }

    // Check if existing is stricter
    if (comparison === -1) {
      conflicts.push({
        type: ConflictType.STRICTER_EXISTS,
        severity: ConflictSeverity.WARNING,
        existingEntryId: existingId,
        message: `Stricter threshold already exists: ${existing.value} ${existing.unit}`,
        suggestedAction: 'MANUAL_REVIEW',
      });
    }

    return conflicts;
  }
}
```

**Step 4: Update services index**

```typescript
// packages/gsr/src/services/index.ts
export { UnitConversionService, type ThresholdValue } from './UnitConversionService.js';
export {
  SubstanceResolver,
  ResolveStatus,
  type MatchedVia,
  type SubstanceCandidate,
  type ResolveInput,
  type ResolveResult,
} from './SubstanceResolver.js';
export {
  ConflictDetector,
  ConflictType,
  ConflictSeverity,
  type Conflict,
  type NewEntryInput,
} from './ConflictDetector.js';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/services/ConflictDetector.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gsr/src/services/
git commit -m "$(cat <<'EOF'
feat(gsr): add ConflictDetector service for regulatory conflict detection

- Detects THRESHOLD_MISMATCH for same substance+list+scope
- Detects STATUS_CONTRADICTION (BANNED vs RESTRICTED)
- Detects SCOPE_OVERLAP via hierarchy (parent/child)
- Detects STRICTER_EXISTS when new threshold is looser
- Uses UnitConversionService for cross-unit comparison

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5: Database Entity Modifications

### Task 5.1: Enhance Substance Entity with New Fields

**Files:**
- Modify: `packages/database/src/entities/Substance.ts`
- Test: `packages/database/src/entities/Substance.test.ts` (add new tests)

**Step 1: Write the failing test**

```typescript
// Add to packages/database/src/entities/Substance.test.ts
describe('Substance enhanced fields', () => {
  it.skipIf(!dbAvailable)('should store SMILES and InChIKey', async () => {
    const substance = em.create(Substance, {
      casNumber: '50-00-0',
      primaryName: 'Formaldehyde',
      smiles: 'C=O',
      inchiKey: 'WSFSSNUMVMOOMR-UHFFFAOYSA-N',
    });

    await em.persistAndFlush(substance);
    em.clear();

    const found = await em.findOne(Substance, { casNumber: '50-00-0' });
    expect(found!.smiles).toBe('C=O');
    expect(found!.inchiKey).toBe('WSFSSNUMVMOOMR-UHFFFAOYSA-N');
  });

  it.skipIf(!dbAvailable)('should store IUPAC name', async () => {
    const substance = em.create(Substance, {
      casNumber: '50-00-0',
      primaryName: 'Formaldehyde',
      iupacName: 'methanal',
    });

    await em.persistAndFlush(substance);
    em.clear();

    const found = await em.findOne(Substance, { casNumber: '50-00-0' });
    expect(found!.iupacName).toBe('methanal');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/database && pnpm test src/entities/Substance.test.ts`
Expected: FAIL - Property 'smiles' does not exist

**Step 3: Update Substance entity**

```typescript
// Add these fields to packages/database/src/entities/Substance.ts
// After molecularFormula field:

  /** SMILES chemical structure string */
  @Property({ type: 'text', nullable: true })
  smiles?: string;

  /** InChIKey structure hash for matching */
  @Property({ length: 27, name: 'inchi_key', nullable: true })
  @Index()
  inchiKey?: string;

  /** IUPAC systematic name */
  @Property({ type: 'text', name: 'iupac_name', nullable: true })
  iupacName?: string;
```

**Step 4: Run test to verify it passes**

Run: `cd packages/database && pnpm test src/entities/Substance.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/entities/Substance.ts packages/database/src/entities/Substance.test.ts
git commit -m "$(cat <<'EOF'
feat(database): add smiles, inchiKey, iupacName to Substance entity

- smiles: Chemical structure string for future structure matching
- inchiKey: 27-char hash with index for exact structure lookup
- iupacName: Systematic IUPAC name

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5.2: Enhance SubstanceAlias Entity with nameNormalized and source

**Files:**
- Modify: `packages/database/src/entities/SubstanceAlias.ts`
- Test: `packages/database/src/entities/SubstanceAlias.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/entities/SubstanceAlias.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '../test-utils.js';
import { Substance } from './Substance.js';
import { SubstanceAlias, AliasType, AliasSource } from './SubstanceAlias.js';

const dbAvailable = await isDatabaseAvailable();

describe('SubstanceAlias', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let substance: Substance;

  beforeAll(async () => {
    if (dbAvailable) {
      orm = await setupTestDb();
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await teardownTestDb();
    }
  });

  beforeEach(async () => {
    if (dbAvailable) {
      await clearTestDb(orm.em);
      em = orm.em.fork();
      substance = em.create(Substance, {
        casNumber: '1309-60-0',
        primaryName: 'Lead dioxide',
      });
      await em.persistAndFlush(substance);
    }
  });

  it.skipIf(!dbAvailable)('should store nameNormalized automatically', async () => {
    const alias = em.create(SubstanceAlias, {
      substance,
      name: 'Lead(IV) Oxide',
      type: AliasType.IUPAC,
    });

    await em.persistAndFlush(alias);
    em.clear();

    const found = await em.findOne(SubstanceAlias, { name: 'Lead(IV) Oxide' });
    expect(found!.nameNormalized).toBe('leadiv oxide');
  });

  it.skipIf(!dbAvailable)('should store source for provenance', async () => {
    const alias = em.create(SubstanceAlias, {
      substance,
      name: 'Plumbic oxide',
      type: AliasType.COMMON,
      source: AliasSource.PUBCHEM,
    });

    await em.persistAndFlush(alias);
    em.clear();

    const found = await em.findOne(SubstanceAlias, { name: 'Plumbic oxide' });
    expect(found!.source).toBe(AliasSource.PUBCHEM);
  });

  it.skipIf(!dbAvailable)('should default source to MANUAL', async () => {
    const alias = em.create(SubstanceAlias, {
      substance,
      name: 'PbO2',
      type: AliasType.COMMON,
    });

    await em.persistAndFlush(alias);
    em.clear();

    const found = await em.findOne(SubstanceAlias, { name: 'PbO2' });
    expect(found!.source).toBe(AliasSource.MANUAL);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/database && pnpm test src/entities/SubstanceAlias.test.ts`
Expected: FAIL

**Step 3: Update SubstanceAlias entity**

```typescript
// packages/database/src/entities/SubstanceAlias.ts
import { Entity, Property, ManyToOne, Rel, Unique, Index, Enum, BeforeCreate, BeforeUpdate } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Substance } from './Substance.js';

export enum AliasType {
  IUPAC = 'IUPAC',
  COMMON = 'COMMON',
  TRADE = 'TRADE',
  SYNONYM = 'SYNONYM',
  INDEX_NAME = 'INDEX_NAME',
}

export enum AliasSource {
  PUBCHEM = 'PUBCHEM',
  ECHA = 'ECHA',
  EPA = 'EPA',
  MANUAL = 'MANUAL',
}

@Entity({ tableName: 'substance_alias', schema: 'public' })
@Unique({ properties: ['substance', 'name'] })
export class SubstanceAlias extends BaseEntity {
  @ManyToOne(() => Substance, {
    fieldName: 'substance_id',
    index: true,
  })
  substance!: Rel<Substance>;

  @Property({ type: 'text' })
  @Index()
  name!: string;

  /** Normalized name for consistent matching (lowercase, stripped) */
  @Property({ type: 'text', name: 'name_normalized' })
  @Index()
  nameNormalized!: string;

  @Enum({ items: () => AliasType })
  type!: AliasType;

  /** Data source for provenance tracking */
  @Enum({ items: () => AliasSource, default: AliasSource.MANUAL })
  source: AliasSource = AliasSource.MANUAL;

  @Property({ length: 10, default: 'en' })
  language: string = 'en';

  @BeforeCreate()
  @BeforeUpdate()
  normalizeNameField(): void {
    if (this.name) {
      this.nameNormalized = this.name
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .trim();
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/database && pnpm test src/entities/SubstanceAlias.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/entities/SubstanceAlias.ts packages/database/src/entities/SubstanceAlias.test.ts
git commit -m "$(cat <<'EOF'
feat(database): add nameNormalized and source to SubstanceAlias

- nameNormalized: Auto-computed normalized name for consistent matching
- source: AliasSource enum (PUBCHEM, ECHA, EPA, MANUAL) for provenance
- BeforeCreate/BeforeUpdate hook computes normalized name

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6: Migration Update

### Task 6.1: Update Consolidated Migration

**Files:**
- Modify: `packages/database/src/migrations/Migration20260122000000.ts`

**Step 1: Add new tables and columns to migration**

Add the following SQL after existing substance_alias table creation:

```typescript
// In the up() method, add after substance_alias table:

    // Enhanced Substance fields
    await this.execute(`
      ALTER TABLE "public"."substance"
      ADD COLUMN IF NOT EXISTS "smiles" text,
      ADD COLUMN IF NOT EXISTS "inchi_key" varchar(27),
      ADD COLUMN IF NOT EXISTS "iupac_name" text;

      CREATE INDEX IF NOT EXISTS "substance_inchi_key_idx" ON "public"."substance" ("inchi_key") WHERE "inchi_key" IS NOT NULL;
    `);

    // Enhanced SubstanceAlias fields
    await this.execute(`
      ALTER TABLE "public"."substance_alias"
      ADD COLUMN IF NOT EXISTS "name_normalized" text,
      ADD COLUMN IF NOT EXISTS "source" varchar(20) NOT NULL DEFAULT 'MANUAL';

      CREATE INDEX IF NOT EXISTS "substance_alias_name_normalized_idx" ON "public"."substance_alias" ("name_normalized");
    `);

    // pg_trgm extension for fuzzy matching
    await this.execute(`
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
      CREATE INDEX IF NOT EXISTS "substance_alias_name_trgm_idx"
        ON "public"."substance_alias"
        USING gin ("name" gin_trgm_ops);
    `);

    // RegistrySource table
    await this.execute(`
      CREATE TABLE IF NOT EXISTS "public"."registry_source" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "name" varchar(50) NOT NULL UNIQUE,
        "version" varchar(50),
        "last_synced_at" timestamptz NOT NULL DEFAULT NOW(),
        "record_count" int,
        "source_url" text
      );
      CREATE INDEX IF NOT EXISTS "registry_source_name_idx" ON "public"."registry_source" ("name");
    `);

    // RegulatoryList table
    await this.execute(`
      CREATE TABLE IF NOT EXISTS "public"."regulatory_list" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "code" varchar(100) NOT NULL UNIQUE,
        "name" text NOT NULL,
        "jurisdiction" varchar(20) NOT NULL,
        "publisher" varchar(50) NOT NULL,
        "description" text,
        "source_url" text,
        "version" varchar(50),
        "last_updated_at" timestamptz
      );
      CREATE INDEX IF NOT EXISTS "regulatory_list_code_idx" ON "public"."regulatory_list" ("code");
      CREATE INDEX IF NOT EXISTS "regulatory_list_jurisdiction_idx" ON "public"."regulatory_list" ("jurisdiction");
    `);

    // SubstanceGroup table
    await this.execute(`
      CREATE TABLE IF NOT EXISTS "public"."substance_group" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "code" varchar(100) NOT NULL UNIQUE,
        "name" text NOT NULL,
        "description" text,
        "parent_group_id" text REFERENCES "public"."substance_group"("id")
      );
      CREATE INDEX IF NOT EXISTS "substance_group_code_idx" ON "public"."substance_group" ("code");
    `);

    // SubstanceGroupMember table
    await this.execute(`
      CREATE TABLE IF NOT EXISTS "public"."substance_group_member" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "group_id" text NOT NULL REFERENCES "public"."substance_group"("id") ON DELETE CASCADE,
        "substance_id" text NOT NULL REFERENCES "public"."substance"("id") ON DELETE CASCADE,
        "inheritance_type" varchar(20) NOT NULL,
        "notes" text,
        UNIQUE ("group_id", "substance_id")
      );
      CREATE INDEX IF NOT EXISTS "substance_group_member_group_idx" ON "public"."substance_group_member" ("group_id");
      CREATE INDEX IF NOT EXISTS "substance_group_member_substance_idx" ON "public"."substance_group_member" ("substance_id");
    `);

    // SubstanceListEntry table
    await this.execute(`
      CREATE TABLE IF NOT EXISTS "public"."substance_list_entry" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "substance_id" text REFERENCES "public"."substance"("id") ON DELETE CASCADE,
        "substance_group_id" text REFERENCES "public"."substance_group"("id") ON DELETE CASCADE,
        "regulatory_list_id" text NOT NULL REFERENCES "public"."regulatory_list"("id") ON DELETE CASCADE,
        "status" varchar(20) NOT NULL,
        "listing_date" date,
        "effective_date" date,
        "sunset_date" date,
        "threshold" decimal(10, 6),
        "threshold_unit" varchar(30),
        "threshold_operator" varchar(10),
        "scopes" text[] NOT NULL,
        "scope_raw" text,
        "conditions" jsonb,
        "source_reference" text,
        CHECK ("substance_id" IS NOT NULL OR "substance_group_id" IS NOT NULL)
      );
      CREATE INDEX IF NOT EXISTS "substance_list_entry_substance_idx" ON "public"."substance_list_entry" ("substance_id");
      CREATE INDEX IF NOT EXISTS "substance_list_entry_group_idx" ON "public"."substance_list_entry" ("substance_group_id");
      CREATE INDEX IF NOT EXISTS "substance_list_entry_list_idx" ON "public"."substance_list_entry" ("regulatory_list_id");
    `);

    // UnresolvedSubstance table
    await this.execute(`
      CREATE TABLE IF NOT EXISTS "public"."unresolved_substance" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "raw_name" text NOT NULL,
        "raw_cas_number" varchar(50),
        "source" varchar(30) NOT NULL,
        "occurrence_count" int NOT NULL DEFAULT 1,
        "status" varchar(30) NOT NULL,
        "resolution_type" varchar(30),
        "resolved_substance_id" text REFERENCES "public"."substance"("id"),
        "resolved_at" timestamptz,
        "resolved_by" varchar(255)
      );
      CREATE INDEX IF NOT EXISTS "unresolved_substance_raw_name_idx" ON "public"."unresolved_substance" ("raw_name");
      CREATE INDEX IF NOT EXISTS "unresolved_substance_status_idx" ON "public"."unresolved_substance" ("status");
    `);

    // BlindDisclosureRequest table
    await this.execute(`
      CREATE TABLE IF NOT EXISTS "public"."blind_disclosure_request" (
        "id" text PRIMARY KEY,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "unresolved_substance_id" text NOT NULL REFERENCES "public"."unresolved_substance"("id") ON DELETE CASCADE,
        "supplier_id" varchar(100) NOT NULL,
        "product_id" varchar(100),
        "requested_at" timestamptz NOT NULL DEFAULT NOW(),
        "requested_by" varchar(255) NOT NULL,
        "status" varchar(30) NOT NULL,
        "secure_token" varchar(255) NOT NULL,
        "token_expires_at" timestamptz NOT NULL,
        "disclosed_cas_number" text,
        "disclosed_at" timestamptz,
        "attestation_type" varchar(30),
        "attestation_document" text
      );
      CREATE INDEX IF NOT EXISTS "blind_disclosure_unresolved_idx" ON "public"."blind_disclosure_request" ("unresolved_substance_id");
      CREATE INDEX IF NOT EXISTS "blind_disclosure_supplier_idx" ON "public"."blind_disclosure_request" ("supplier_id");
      CREATE INDEX IF NOT EXISTS "blind_disclosure_token_idx" ON "public"."blind_disclosure_request" ("secure_token");
    `);

    // ProductScopeHierarchy table for recursive scope queries
    await this.execute(`
      CREATE TABLE IF NOT EXISTS "public"."product_scope_hierarchy" (
        "parent_scope" varchar(50) NOT NULL,
        "child_scope" varchar(50) NOT NULL,
        PRIMARY KEY ("parent_scope", "child_scope")
      );

      -- Seed the hierarchy
      INSERT INTO "public"."product_scope_hierarchy" ("parent_scope", "child_scope") VALUES
        ('ALL_PRODUCTS', 'CONSUMER_GOODS'),
        ('ALL_PRODUCTS', 'INDUSTRIAL'),
        ('ALL_PRODUCTS', 'EEE'),
        ('ALL_PRODUCTS', 'VEHICLES'),
        ('ALL_PRODUCTS', 'CONSTRUCTION_PRODUCTS'),
        ('ALL_PRODUCTS', 'PACKAGING'),
        ('CONSUMER_GOODS', 'TOYS'),
        ('CONSUMER_GOODS', 'CHILDCARE_ARTICLES'),
        ('CONSUMER_GOODS', 'JEWELRY'),
        ('CONSUMER_GOODS', 'COSMETICS'),
        ('CONSUMER_GOODS', 'FOOD_CONTACT'),
        ('CONSUMER_GOODS', 'TEXTILES'),
        ('CONSUMER_GOODS', 'FURNITURE'),
        ('TOYS', 'CHILDCARE_ARTICLES'),
        ('EEE', 'BATTERIES'),
        ('EEE', 'CABLES'),
        ('VEHICLES', 'VEHICLE_COMPONENTS')
      ON CONFLICT DO NOTHING;
    `);
```

**Step 2: Add to clearTestDb function**

Update `packages/database/src/test-utils.ts` to include new tables in truncate order:

```typescript
// Add these tables to the clearTestDb function, in correct order (child tables first):
await em.execute(`
  TRUNCATE TABLE
    "public"."blind_disclosure_request",
    "public"."unresolved_substance",
    "public"."substance_list_entry",
    "public"."substance_group_member",
    "public"."substance_group",
    "public"."regulatory_list",
    "public"."registry_source",
    -- existing tables follow
    "public"."outbox_event",
    ...
  CASCADE
`);
```

**Step 3: Run migrations to verify**

Run: `pnpm db:reset`
Expected: Migration runs successfully

**Step 4: Run all tests to verify nothing broke**

Run: `pnpm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add packages/database/src/migrations/ packages/database/src/test-utils.ts
git commit -m "$(cat <<'EOF'
feat(database): add GSR tables to consolidated migration

- Enhanced Substance: smiles, inchi_key, iupac_name
- Enhanced SubstanceAlias: name_normalized, source
- pg_trgm extension + trigram index for fuzzy matching
- New tables: registry_source, regulatory_list, substance_group,
  substance_group_member, substance_list_entry, unresolved_substance,
  blind_disclosure_request, product_scope_hierarchy
- Updated clearTestDb with new tables

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 7: Seeders

### Task 7.1: Create ECHA Inventory Parser

**Files:**
- Create: `packages/gsr/src/parsers/echa-inventory.parser.ts`
- Create: `packages/gsr/src/parsers/index.ts`
- Test: `packages/gsr/src/parsers/echa-inventory.parser.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/parsers/echa-inventory.parser.test.ts
import { describe, it, expect } from 'vitest';
import { EchaInventoryParser, type EchaInventoryRecord } from './echa-inventory.parser.js';

describe('EchaInventoryParser', () => {
  const parser = new EchaInventoryParser();

  describe('parseRow', () => {
    it('should parse valid CSV row', () => {
      const row = {
        'EC Number': '215-174-5',
        'EC Name': 'lead dioxide',
        'CAS Number': '1309-60-0',
        'Molecular formula': 'PbO2',
        'Description': 'Lead compound',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.ecNumber).toBe('215-174-5');
      expect(result!.primaryName).toBe('lead dioxide');
      expect(result!.casNumber).toBe('1309-60-0');
      expect(result!.molecularFormula).toBe('PbO2');
    });

    it('should skip rows with invalid CAS checksum', () => {
      const row = {
        'EC Number': '215-174-5',
        'EC Name': 'lead dioxide',
        'CAS Number': '1309-60-1', // Invalid checksum
        'Molecular formula': 'PbO2',
      };

      const result = parser.parseRow(row);

      expect(result).toBeNull();
    });

    it('should accept rows without CAS number', () => {
      const row = {
        'EC Number': '200-001-8',
        'EC Name': 'formaldehyde',
        'CAS Number': '-',
        'Molecular formula': 'CH2O',
      };

      const result = parser.parseRow(row);

      expect(result).not.toBeNull();
      expect(result!.casNumber).toBeUndefined();
    });

    it('should normalize EC number format', () => {
      const row = {
        'EC Number': '215-174-5',
        'EC Name': 'test substance',
      };

      const result = parser.parseRow(row);

      expect(result!.ecNumber).toBe('215-174-5');
    });
  });

  describe('parse', () => {
    it('should parse CSV content', async () => {
      const csvContent = `"EC Number","EC Name","CAS Number","Molecular formula"
"215-174-5","lead dioxide","1309-60-0","PbO2"
"231-152-8","cadmium","7440-43-9","Cd"`;

      const results = await parser.parse(csvContent);

      expect(results).toHaveLength(2);
      expect(results[0].ecNumber).toBe('215-174-5');
      expect(results[1].ecNumber).toBe('231-152-8');
    });

    it('should skip invalid rows and continue', async () => {
      const csvContent = `"EC Number","EC Name","CAS Number"
"215-174-5","lead dioxide","1309-60-0"
"999-999-9","invalid","9999-99-9"
"231-152-8","cadmium","7440-43-9"`;

      const results = await parser.parse(csvContent);

      expect(results).toHaveLength(2); // Skipped invalid row
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/parsers/echa-inventory.parser.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// packages/gsr/src/parsers/echa-inventory.parser.ts
import { parse } from 'csv-parse/sync';
import { sanitizeCas } from '../utils/cas-sanitizer.js';

export interface EchaInventoryRecord {
  ecNumber: string;
  primaryName: string;
  casNumber?: string;
  molecularFormula?: string;
  description?: string;
}

interface EchaRawRow {
  'EC Number': string;
  'EC Name': string;
  'CAS Number'?: string;
  'Molecular formula'?: string;
  'Description'?: string;
}

/**
 * Parses ECHA EC Inventory CSV format.
 */
export class EchaInventoryParser {
  /**
   * Parse a single row from the CSV.
   * @returns Parsed record or null if invalid
   */
  parseRow(row: EchaRawRow): EchaInventoryRecord | null {
    const ecNumber = row['EC Number']?.trim();
    const primaryName = row['EC Name']?.trim().toLowerCase();

    if (!ecNumber || !primaryName) {
      return null;
    }

    // Validate and sanitize CAS if present
    const rawCas = row['CAS Number']?.trim();
    let casNumber: string | undefined;

    if (rawCas && rawCas !== '-' && rawCas !== 'N/A') {
      const sanitized = sanitizeCas(rawCas);
      if (!sanitized) {
        // Invalid CAS checksum - skip this record
        return null;
      }
      casNumber = sanitized;
    }

    return {
      ecNumber,
      primaryName,
      casNumber,
      molecularFormula: row['Molecular formula']?.trim() || undefined,
      description: row['Description']?.trim() || undefined,
    };
  }

  /**
   * Parse full CSV content.
   */
  async parse(csvContent: string): Promise<EchaInventoryRecord[]> {
    const rows = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as EchaRawRow[];

    const results: EchaInventoryRecord[] = [];

    for (const row of rows) {
      const parsed = this.parseRow(row);
      if (parsed) {
        results.push(parsed);
      }
    }

    return results;
  }
}
```

**Step 4: Create parsers index and add csv-parse dependency**

```typescript
// packages/gsr/src/parsers/index.ts
export { EchaInventoryParser, type EchaInventoryRecord } from './echa-inventory.parser.js';
```

Add to package.json dependencies:
```json
"csv-parse": "^5.5.3"
```

**Step 5: Run pnpm install and test**

Run: `pnpm install && cd packages/gsr && pnpm test src/parsers/echa-inventory.parser.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gsr/src/parsers/ packages/gsr/package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(gsr): add ECHA Inventory CSV parser

- Parses EC Number, Name, CAS, Molecular Formula
- Validates CAS checksum, skips invalid records
- Normalizes names to lowercase
- Handles missing/N/A CAS numbers

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7.2: Create ECHA Inventory Seeder

**Files:**
- Create: `packages/gsr/src/seeders/echa-inventory.seeder.ts`
- Create: `packages/gsr/src/seeders/index.ts`
- Test: `packages/gsr/src/seeders/echa-inventory.seeder.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/seeders/echa-inventory.seeder.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { Substance, SubstanceAlias } from '@eurocomply/database';
import { EchaInventorySeeder } from './echa-inventory.seeder.js';
import { RegistrySource, RegistrySourceName } from '../entities/RegistrySource.js';

const dbAvailable = await isDatabaseAvailable();

// Mock CSV content for testing
const MOCK_CSV = `"EC Number","EC Name","CAS Number","Molecular formula"
"215-174-5","lead dioxide","1309-60-0","PbO2"
"231-152-8","cadmium","7440-43-9","Cd"
"200-001-8","formaldehyde","50-00-0","CH2O"`;

describe('EchaInventorySeeder', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let seeder: EchaInventorySeeder;

  beforeAll(async () => {
    if (dbAvailable) {
      orm = await setupTestDb();
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await teardownTestDb();
    }
  });

  beforeEach(async () => {
    if (dbAvailable) {
      await clearTestDb(orm.em);
      em = orm.em.fork();
      seeder = new EchaInventorySeeder(em);
    }
  });

  it.skipIf(!dbAvailable)('should seed substances from CSV content', async () => {
    const result = await seeder.seedFromContent(MOCK_CSV, '2026-01');

    expect(result.seeded).toBe(true);
    expect(result.substanceCount).toBe(3);

    // Verify substances created
    const substances = await em.find(Substance, {});
    expect(substances).toHaveLength(3);

    const lead = substances.find(s => s.casNumber === '1309-60-0');
    expect(lead).toBeTruthy();
    expect(lead!.ecNumber).toBe('215-174-5');
    expect(lead!.primaryName).toBe('lead dioxide');
  });

  it.skipIf(!dbAvailable)('should create aliases for EC names', async () => {
    await seeder.seedFromContent(MOCK_CSV, '2026-01');

    const aliases = await em.find(SubstanceAlias, {});
    expect(aliases.length).toBeGreaterThan(0);
  });

  it.skipIf(!dbAvailable)('should track registry source version', async () => {
    await seeder.seedFromContent(MOCK_CSV, '2026-01');

    const source = await em.findOne(RegistrySource, { name: RegistrySourceName.ECHA_EC });
    expect(source).toBeTruthy();
    expect(source!.version).toBe('2026-01');
    expect(source!.recordCount).toBe(3);
  });

  it.skipIf(!dbAvailable)('should skip if already seeded with same version', async () => {
    // First seed
    await seeder.seedFromContent(MOCK_CSV, '2026-01');

    // Second seed with same version
    const result = await seeder.seedFromContent(MOCK_CSV, '2026-01');

    expect(result.skipped).toBe(true);
    expect(result.message).toContain('already seeded');
  });

  it.skipIf(!dbAvailable)('should update if version is newer', async () => {
    // First seed
    await seeder.seedFromContent(MOCK_CSV, '2026-01');

    // Second seed with newer version
    const newCsv = MOCK_CSV + '\n"999-999-9","test substance","7732-18-5","H2O"';
    const result = await seeder.seedFromContent(newCsv, '2026-02');

    expect(result.seeded).toBe(true);
    expect(result.substanceCount).toBe(4);
  });

  it.skipIf(!dbAvailable)('should upsert existing substances by CAS', async () => {
    // Create existing substance
    const existing = em.create(Substance, {
      casNumber: '1309-60-0',
      primaryName: 'Old Name',
    });
    await em.persistAndFlush(existing);

    // Seed should update, not duplicate
    await seeder.seedFromContent(MOCK_CSV, '2026-01');

    const substances = await em.find(Substance, { casNumber: '1309-60-0' });
    expect(substances).toHaveLength(1);
    expect(substances[0].primaryName).toBe('lead dioxide');
    expect(substances[0].ecNumber).toBe('215-174-5');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/seeders/echa-inventory.seeder.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// packages/gsr/src/seeders/echa-inventory.seeder.ts
import { EntityManager } from '@mikro-orm/postgresql';
import { Substance, SubstanceAlias, AliasType } from '@eurocomply/database';
import { RegistrySource, RegistrySourceName } from '../entities/RegistrySource.js';
import { EchaInventoryParser } from '../parsers/echa-inventory.parser.js';
import { AliasSource } from '../enums/AliasSource.js';

export interface SeederResult {
  seeded: boolean;
  skipped: boolean;
  substanceCount: number;
  aliasCount: number;
  version: string;
  message: string;
}

/**
 * Seeds substances from ECHA EC Inventory.
 */
export class EchaInventorySeeder {
  private parser = new EchaInventoryParser();

  constructor(private readonly em: EntityManager) {}

  /**
   * Seed from CSV content (for testing or pre-downloaded files).
   */
  async seedFromContent(csvContent: string, version: string): Promise<SeederResult> {
    // Check if already seeded with this version
    const existingSource = await this.em.findOne(RegistrySource, {
      name: RegistrySourceName.ECHA_EC,
    });

    if (existingSource?.version === version) {
      return {
        seeded: false,
        skipped: true,
        substanceCount: existingSource.recordCount || 0,
        aliasCount: 0,
        version,
        message: `ECHA EC Inventory already seeded with version ${version}`,
      };
    }

    // Parse CSV
    const records = await this.parser.parse(csvContent);

    let substanceCount = 0;
    let aliasCount = 0;

    for (const record of records) {
      // Upsert substance by CAS or EC number
      let substance: Substance | null = null;

      if (record.casNumber) {
        substance = await this.em.findOne(Substance, { casNumber: record.casNumber });
      }
      if (!substance && record.ecNumber) {
        substance = await this.em.findOne(Substance, { ecNumber: record.ecNumber });
      }

      if (substance) {
        // Update existing
        substance.primaryName = record.primaryName;
        substance.ecNumber = record.ecNumber;
        substance.molecularFormula = record.molecularFormula;
      } else {
        // Create new
        substance = this.em.create(Substance, {
          casNumber: record.casNumber || `EC-${record.ecNumber}`, // Fallback ID
          primaryName: record.primaryName,
          ecNumber: record.ecNumber,
          molecularFormula: record.molecularFormula,
        });
        this.em.persist(substance);
        substanceCount++;
      }

      // Create alias for EC name if different from primary
      const existingAlias = await this.em.findOne(SubstanceAlias, {
        substance,
        name: record.primaryName,
      });

      if (!existingAlias) {
        const alias = this.em.create(SubstanceAlias, {
          substance,
          name: record.primaryName,
          type: AliasType.INDEX_NAME,
          source: AliasSource.ECHA,
        });
        this.em.persist(alias);
        aliasCount++;
      }
    }

    // Update or create registry source
    if (existingSource) {
      existingSource.version = version;
      existingSource.recordCount = records.length;
      existingSource.lastSyncedAt = new Date();
    } else {
      const source = this.em.create(RegistrySource, {
        name: RegistrySourceName.ECHA_EC,
        version,
        recordCount: records.length,
        sourceUrl: 'https://echa.europa.eu/information-on-chemicals/ec-inventory',
      });
      this.em.persist(source);
    }

    await this.em.flush();

    return {
      seeded: true,
      skipped: false,
      substanceCount: records.length,
      aliasCount,
      version,
      message: `Seeded ${records.length} substances from ECHA EC Inventory`,
    };
  }
}
```

**Step 4: Create seeders index**

```typescript
// packages/gsr/src/seeders/index.ts
export { EchaInventorySeeder, type SeederResult } from './echa-inventory.seeder.js';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/seeders/echa-inventory.seeder.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gsr/src/seeders/
git commit -m "$(cat <<'EOF'
feat(gsr): add ECHA Inventory seeder

- Seeds substances from ECHA EC Inventory CSV
- Upserts by CAS or EC number (no duplicates)
- Creates INDEX_NAME aliases from EC names
- Tracks version in RegistrySource
- Skips if already seeded with same version

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7.3: Create ECHA SVHC Parser and Seeder

**Files:**
- Create: `packages/gsr/src/parsers/echa-svhc.parser.ts`
- Create: `packages/gsr/src/seeders/echa-svhc.seeder.ts`
- Modify: `packages/gsr/src/parsers/index.ts`
- Modify: `packages/gsr/src/seeders/index.ts`
- Test: `packages/gsr/src/seeders/echa-svhc.seeder.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/seeders/echa-svhc.seeder.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { Substance } from '@eurocomply/database';
import { EchaSvhcSeeder } from './echa-svhc.seeder.js';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { SubstanceListEntry } from '../entities/SubstanceListEntry.js';
import { ListingStatus } from '../enums/ListingStatus.js';
import { ProductScope } from '../enums/ProductScope.js';

const dbAvailable = await isDatabaseAvailable();

const MOCK_SVHC_CSV = `"Substance Name","EC Number","CAS Number","Date of inclusion","Reason for inclusion"
"Lead chromate","231-846-0","7758-97-6","2010-01-13","Carcinogenic (Article 57a)"
"Cadmium","231-152-8","7440-43-9","2012-06-18","Carcinogenic (Article 57a)"`;

describe('EchaSvhcSeeder', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let seeder: EchaSvhcSeeder;

  beforeAll(async () => {
    if (dbAvailable) {
      orm = await setupTestDb();
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await teardownTestDb();
    }
  });

  beforeEach(async () => {
    if (dbAvailable) {
      await clearTestDb(orm.em);
      em = orm.em.fork();
      seeder = new EchaSvhcSeeder(em);

      // Pre-seed substances that will be referenced
      const lead = em.create(Substance, {
        casNumber: '7758-97-6',
        primaryName: 'Lead chromate',
        ecNumber: '231-846-0',
      });
      const cadmium = em.create(Substance, {
        casNumber: '7440-43-9',
        primaryName: 'Cadmium',
        ecNumber: '231-152-8',
      });
      await em.persistAndFlush([lead, cadmium]);
    }
  });

  it.skipIf(!dbAvailable)('should create REACH_SVHC regulatory list', async () => {
    await seeder.seedFromContent(MOCK_SVHC_CSV, '2026-01');

    const list = await em.findOne(RegulatoryList, { code: 'REACH_SVHC' });
    expect(list).toBeTruthy();
    expect(list!.name).toBe('SVHC Candidate List');
    expect(list!.jurisdiction).toBe('EU');
    expect(list!.publisher).toBe('ECHA');
  });

  it.skipIf(!dbAvailable)('should create SubstanceListEntry for each SVHC', async () => {
    await seeder.seedFromContent(MOCK_SVHC_CSV, '2026-01');

    const entries = await em.find(SubstanceListEntry, {}, { populate: ['substance', 'regulatoryList'] });
    expect(entries).toHaveLength(2);

    const leadEntry = entries.find(e => e.substance?.casNumber === '7758-97-6');
    expect(leadEntry).toBeTruthy();
    expect(leadEntry!.status).toBe(ListingStatus.LISTED);
    expect(leadEntry!.scopes).toContain(ProductScope.ALL_PRODUCTS);
    expect(leadEntry!.listingDate).toEqual(new Date('2010-01-13'));
  });

  it.skipIf(!dbAvailable)('should store reason in conditions', async () => {
    await seeder.seedFromContent(MOCK_SVHC_CSV, '2026-01');

    const entry = await em.findOne(SubstanceListEntry, {}, { populate: ['substance'] });
    expect(entry!.conditions).toHaveProperty('reason');
    expect(entry!.conditions!.reason).toContain('Carcinogenic');
  });

  it.skipIf(!dbAvailable)('should skip unknown substances and log warning', async () => {
    const csvWithUnknown = `"Substance Name","EC Number","CAS Number","Date of inclusion","Reason for inclusion"
"Unknown Substance","999-999-9","9999-99-9","2020-01-01","Test"`;

    const result = await seeder.seedFromContent(csvWithUnknown, '2026-01');

    expect(result.skippedCount).toBe(1);
    expect(result.entryCount).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/seeders/echa-svhc.seeder.test.ts`
Expected: FAIL

**Step 3: Write parser implementation**

```typescript
// packages/gsr/src/parsers/echa-svhc.parser.ts
import { parse } from 'csv-parse/sync';
import { sanitizeCas } from '../utils/cas-sanitizer.js';

export interface EchaSvhcRecord {
  substanceName: string;
  ecNumber: string;
  casNumber?: string;
  dateOfInclusion: Date;
  reasonForInclusion: string;
}

interface EchaSvhcRawRow {
  'Substance Name': string;
  'EC Number': string;
  'CAS Number'?: string;
  'Date of inclusion': string;
  'Reason for inclusion': string;
}

export class EchaSvhcParser {
  parseRow(row: EchaSvhcRawRow): EchaSvhcRecord | null {
    const ecNumber = row['EC Number']?.trim();
    const substanceName = row['Substance Name']?.trim();
    const dateStr = row['Date of inclusion']?.trim();

    if (!ecNumber || !substanceName || !dateStr) {
      return null;
    }

    const rawCas = row['CAS Number']?.trim();
    const casNumber = rawCas && rawCas !== '-' ? sanitizeCas(rawCas) || undefined : undefined;

    return {
      substanceName,
      ecNumber,
      casNumber,
      dateOfInclusion: new Date(dateStr),
      reasonForInclusion: row['Reason for inclusion']?.trim() || '',
    };
  }

  async parse(csvContent: string): Promise<EchaSvhcRecord[]> {
    const rows = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as EchaSvhcRawRow[];

    const results: EchaSvhcRecord[] = [];
    for (const row of rows) {
      const parsed = this.parseRow(row);
      if (parsed) results.push(parsed);
    }
    return results;
  }
}
```

**Step 4: Write seeder implementation**

```typescript
// packages/gsr/src/seeders/echa-svhc.seeder.ts
import { EntityManager } from '@mikro-orm/postgresql';
import { Substance } from '@eurocomply/database';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { SubstanceListEntry } from '../entities/SubstanceListEntry.js';
import { RegistrySource, RegistrySourceName } from '../entities/RegistrySource.js';
import { EchaSvhcParser } from '../parsers/echa-svhc.parser.js';
import { ListingStatus } from '../enums/ListingStatus.js';
import { ProductScope } from '../enums/ProductScope.js';

export interface SvhcSeederResult {
  seeded: boolean;
  skipped: boolean;
  entryCount: number;
  skippedCount: number;
  version: string;
  message: string;
}

export class EchaSvhcSeeder {
  private parser = new EchaSvhcParser();

  constructor(private readonly em: EntityManager) {}

  async seedFromContent(csvContent: string, version: string): Promise<SvhcSeederResult> {
    // Check existing version
    const existingSource = await this.em.findOne(RegistrySource, {
      name: RegistrySourceName.ECHA_SVHC,
    });

    if (existingSource?.version === version) {
      return {
        seeded: false,
        skipped: true,
        entryCount: 0,
        skippedCount: 0,
        version,
        message: `ECHA SVHC already seeded with version ${version}`,
      };
    }

    // Ensure regulatory list exists
    let regulatoryList = await this.em.findOne(RegulatoryList, { code: 'REACH_SVHC' });
    if (!regulatoryList) {
      regulatoryList = this.em.create(RegulatoryList, {
        code: 'REACH_SVHC',
        name: 'SVHC Candidate List',
        jurisdiction: 'EU',
        publisher: 'ECHA',
        description: 'Substances of Very High Concern candidate list under REACH',
        sourceUrl: 'https://echa.europa.eu/candidate-list-table',
      });
      this.em.persist(regulatoryList);
    }

    const records = await this.parser.parse(csvContent);
    let entryCount = 0;
    let skippedCount = 0;

    for (const record of records) {
      // Find substance by CAS or EC
      let substance: Substance | null = null;
      if (record.casNumber) {
        substance = await this.em.findOne(Substance, { casNumber: record.casNumber });
      }
      if (!substance) {
        substance = await this.em.findOne(Substance, { ecNumber: record.ecNumber });
      }

      if (!substance) {
        skippedCount++;
        continue;
      }

      // Check if entry already exists
      const existingEntry = await this.em.findOne(SubstanceListEntry, {
        substance,
        regulatoryList,
      });

      if (!existingEntry) {
        const entry = this.em.create(SubstanceListEntry, {
          substance,
          regulatoryList,
          status: ListingStatus.LISTED,
          scopes: [ProductScope.ALL_PRODUCTS],
          listingDate: record.dateOfInclusion,
          conditions: { reason: record.reasonForInclusion },
          sourceReference: 'SVHC Candidate List',
        });
        this.em.persist(entry);
        entryCount++;
      }
    }

    // Update registry source
    if (existingSource) {
      existingSource.version = version;
      existingSource.recordCount = entryCount;
      existingSource.lastSyncedAt = new Date();
    } else {
      this.em.persist(this.em.create(RegistrySource, {
        name: RegistrySourceName.ECHA_SVHC,
        version,
        recordCount: entryCount,
        sourceUrl: 'https://echa.europa.eu/candidate-list-table',
      }));
    }

    await this.em.flush();

    return {
      seeded: true,
      skipped: false,
      entryCount,
      skippedCount,
      version,
      message: `Created ${entryCount} SVHC entries, skipped ${skippedCount} unknown substances`,
    };
  }
}
```

**Step 5: Update indexes**

```typescript
// packages/gsr/src/parsers/index.ts
export { EchaInventoryParser, type EchaInventoryRecord } from './echa-inventory.parser.js';
export { EchaSvhcParser, type EchaSvhcRecord } from './echa-svhc.parser.js';
```

```typescript
// packages/gsr/src/seeders/index.ts
export { EchaInventorySeeder, type SeederResult } from './echa-inventory.seeder.js';
export { EchaSvhcSeeder, type SvhcSeederResult } from './echa-svhc.seeder.js';
```

**Step 6: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/seeders/echa-svhc.seeder.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/gsr/src/parsers/ packages/gsr/src/seeders/
git commit -m "$(cat <<'EOF'
feat(gsr): add ECHA SVHC parser and seeder

- Parses SVHC Candidate List CSV format
- Creates REACH_SVHC RegulatoryList
- Creates SubstanceListEntry for each SVHC substance
- Stores inclusion date and reason in conditions
- Skips substances not found in registry (logs count)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 8: Update Main Package Exports

### Task 8.1: Update GSR Package Main Index

**Files:**
- Modify: `packages/gsr/src/index.ts`

**Step 1: Update main export file**

```typescript
// packages/gsr/src/index.ts

// Version
export const GSR_VERSION = '0.0.1';

// Enums
export * from './enums/index.js';

// Entities
export * from './entities/index.js';

// Services
export * from './services/index.js';

// Parsers
export * from './parsers/index.js';

// Seeders
export * from './seeders/index.js';

// Utils
export * from './utils/index.js';
```

**Step 2: Commit**

```bash
git add packages/gsr/src/index.ts
git commit -m "$(cat <<'EOF'
feat(gsr): export all modules from main package index

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8.2: Add GSR Entities to Database Package Entity Arrays

**Files:**
- Modify: `packages/database/src/entities/index.ts`

**Step 1: Import and add GSR entities to publicOnlyEntities**

```typescript
// Add to packages/database/src/entities/index.ts

// Import GSR entities
import {
  RegistrySource,
  RegulatoryList,
  SubstanceGroup,
  SubstanceGroupMember,
  SubstanceListEntry,
  UnresolvedSubstance,
  BlindDisclosureRequest,
} from '@eurocomply/gsr';

// Re-export for convenience
export {
  RegistrySource,
  RegulatoryList,
  SubstanceGroup,
  SubstanceGroupMember,
  SubstanceListEntry,
  UnresolvedSubstance,
  BlindDisclosureRequest,
};

// Add to publicOnlyEntities array:
export const publicOnlyEntities = [
  // ... existing entities ...
  RegistrySource,
  RegulatoryList,
  SubstanceGroup,
  SubstanceGroupMember,
  SubstanceListEntry,
  UnresolvedSubstance,
  BlindDisclosureRequest,
];
```

**Step 2: Run build to verify imports work**

Run: `pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add packages/database/src/entities/index.ts
git commit -m "$(cat <<'EOF'
feat(database): add GSR entities to publicOnlyEntities array

Enables MikroORM schema generation for GSR tables.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 9: Cleanup (Remove Deprecated Fields)

### Task 9.1: Migrate Existing Regulatory Flags to SubstanceListEntry

**Files:**
- Create: `packages/gsr/src/migrations/migrate-regulatory-flags.ts`
- Test: `packages/gsr/src/migrations/migrate-regulatory-flags.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/migrations/migrate-regulatory-flags.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';
import { Substance } from '@eurocomply/database';
import { migrateRegulatoryFlags } from './migrate-regulatory-flags.js';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { SubstanceListEntry } from '../entities/SubstanceListEntry.js';
import { ListingStatus } from '../enums/ListingStatus.js';

const dbAvailable = await isDatabaseAvailable();

describe('migrateRegulatoryFlags', () => {
  let orm: MikroORM;
  let em: EntityManager;

  beforeAll(async () => {
    if (dbAvailable) {
      orm = await setupTestDb();
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await teardownTestDb();
    }
  });

  beforeEach(async () => {
    if (dbAvailable) {
      await clearTestDb(orm.em);
      em = orm.em.fork();
    }
  });

  it.skipIf(!dbAvailable)('should migrate isSvhc flag to SubstanceListEntry', async () => {
    // Create substance with old flags
    const substance = em.create(Substance, {
      casNumber: '7758-97-6',
      primaryName: 'Lead chromate',
      isSvhc: true,
    });
    await em.persistAndFlush(substance);

    // Run migration
    const result = await migrateRegulatoryFlags(em);

    // Verify entry created
    const entry = await em.findOne(SubstanceListEntry, {
      substance,
    }, { populate: ['regulatoryList'] });

    expect(entry).toBeTruthy();
    expect(entry!.regulatoryList.code).toBe('REACH_SVHC');
    expect(entry!.status).toBe(ListingStatus.LISTED);
    expect(result.svhcMigrated).toBe(1);
  });

  it.skipIf(!dbAvailable)('should migrate isRestricted flag to REACH_ANNEX_XVII', async () => {
    const substance = em.create(Substance, {
      casNumber: '1309-60-0',
      primaryName: 'Lead dioxide',
      isRestricted: true,
      restrictionConditions: 'Entry 63',
    });
    await em.persistAndFlush(substance);

    await migrateRegulatoryFlags(em);

    const entry = await em.findOne(SubstanceListEntry, {
      substance,
    }, { populate: ['regulatoryList'] });

    expect(entry!.regulatoryList.code).toBe('REACH_ANNEX_XVII');
    expect(entry!.status).toBe(ListingStatus.RESTRICTED);
    expect(entry!.sourceReference).toBe('Entry 63');
  });

  it.skipIf(!dbAvailable)('should skip substances without flags', async () => {
    const substance = em.create(Substance, {
      casNumber: '7732-18-5',
      primaryName: 'Water',
      isSvhc: false,
      isRestricted: false,
    });
    await em.persistAndFlush(substance);

    const result = await migrateRegulatoryFlags(em);

    const entries = await em.find(SubstanceListEntry, { substance });
    expect(entries).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it.skipIf(!dbAvailable)('should not duplicate existing entries', async () => {
    const substance = em.create(Substance, {
      casNumber: '7758-97-6',
      primaryName: 'Lead chromate',
      isSvhc: true,
    });
    await em.persistAndFlush(substance);

    // Run twice
    await migrateRegulatoryFlags(em);
    const result = await migrateRegulatoryFlags(em);

    const entries = await em.find(SubstanceListEntry, { substance });
    expect(entries).toHaveLength(1);
    expect(result.alreadyMigrated).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/migrations/migrate-regulatory-flags.test.ts`
Expected: FAIL

**Step 3: Write migration implementation**

```typescript
// packages/gsr/src/migrations/migrate-regulatory-flags.ts
import { EntityManager } from '@mikro-orm/postgresql';
import { Substance } from '@eurocomply/database';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { SubstanceListEntry } from '../entities/SubstanceListEntry.js';
import { ListingStatus } from '../enums/ListingStatus.js';
import { ProductScope } from '../enums/ProductScope.js';

export interface MigrationResult {
  svhcMigrated: number;
  restrictedMigrated: number;
  authorizationMigrated: number;
  alreadyMigrated: number;
  skipped: number;
}

/**
 * Migrates deprecated boolean regulatory flags on Substance
 * to proper SubstanceListEntry records.
 */
export async function migrateRegulatoryFlags(em: EntityManager): Promise<MigrationResult> {
  const result: MigrationResult = {
    svhcMigrated: 0,
    restrictedMigrated: 0,
    authorizationMigrated: 0,
    alreadyMigrated: 0,
    skipped: 0,
  };

  // Ensure regulatory lists exist
  const svhcList = await ensureList(em, 'REACH_SVHC', 'SVHC Candidate List');
  const annexXviiList = await ensureList(em, 'REACH_ANNEX_XVII', 'REACH Annex XVII Restrictions');
  const annexXivList = await ensureList(em, 'REACH_ANNEX_XIV', 'REACH Annex XIV Authorization List');

  // Find all substances with any regulatory flag
  const substances = await em.find(Substance, {
    $or: [
      { isSvhc: true },
      { isRestricted: true },
      { requiresAuthorization: true },
    ],
  });

  for (const substance of substances) {
    let hasFlagsToMigrate = false;

    // Migrate SVHC
    if (substance.isSvhc) {
      hasFlagsToMigrate = true;
      const existing = await em.findOne(SubstanceListEntry, {
        substance,
        regulatoryList: svhcList,
      });

      if (existing) {
        result.alreadyMigrated++;
      } else {
        em.persist(em.create(SubstanceListEntry, {
          substance,
          regulatoryList: svhcList,
          status: ListingStatus.LISTED,
          scopes: [ProductScope.ALL_PRODUCTS],
          sunsetDate: substance.sunsetDate,
        }));
        result.svhcMigrated++;
      }
    }

    // Migrate Restricted
    if (substance.isRestricted) {
      hasFlagsToMigrate = true;
      const existing = await em.findOne(SubstanceListEntry, {
        substance,
        regulatoryList: annexXviiList,
      });

      if (existing) {
        result.alreadyMigrated++;
      } else {
        em.persist(em.create(SubstanceListEntry, {
          substance,
          regulatoryList: annexXviiList,
          status: ListingStatus.RESTRICTED,
          scopes: [ProductScope.ALL_PRODUCTS],
          sourceReference: substance.restrictionConditions,
        }));
        result.restrictedMigrated++;
      }
    }

    // Migrate Authorization
    if (substance.requiresAuthorization) {
      hasFlagsToMigrate = true;
      const existing = await em.findOne(SubstanceListEntry, {
        substance,
        regulatoryList: annexXivList,
      });

      if (existing) {
        result.alreadyMigrated++;
      } else {
        em.persist(em.create(SubstanceListEntry, {
          substance,
          regulatoryList: annexXivList,
          status: ListingStatus.AUTHORIZED,
          scopes: [ProductScope.ALL_PRODUCTS],
          sunsetDate: substance.sunsetDate,
        }));
        result.authorizationMigrated++;
      }
    }

    if (!hasFlagsToMigrate) {
      result.skipped++;
    }
  }

  await em.flush();
  return result;
}

async function ensureList(
  em: EntityManager,
  code: string,
  name: string
): Promise<RegulatoryList> {
  let list = await em.findOne(RegulatoryList, { code });
  if (!list) {
    list = em.create(RegulatoryList, {
      code,
      name,
      jurisdiction: 'EU',
      publisher: 'ECHA',
    });
    em.persist(list);
    await em.flush();
  }
  return list;
}
```

**Step 4: Create migrations index**

```typescript
// packages/gsr/src/migrations/index.ts
export { migrateRegulatoryFlags, type MigrationResult } from './migrate-regulatory-flags.js';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/migrations/migrate-regulatory-flags.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gsr/src/migrations/
git commit -m "$(cat <<'EOF'
feat(gsr): add migration for deprecated regulatory flags

- Migrates isSvhc -> REACH_SVHC SubstanceListEntry
- Migrates isRestricted -> REACH_ANNEX_XVII SubstanceListEntry
- Migrates requiresAuthorization -> REACH_ANNEX_XIV SubstanceListEntry
- Idempotent: skips already-migrated substances

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9.2: Remove Deprecated Fields from Substance Entity

**Note:** This is a BREAKING CHANGE. Only do this after:
1. All data is migrated via migrateRegulatoryFlags()
2. All code is updated to use SubstanceListEntry
3. Production migration is tested

**Files:**
- Modify: `packages/database/src/entities/Substance.ts`
- Modify: `packages/database/src/migrations/Migration20260122000000.ts`

**Step 1: Remove deprecated fields from Substance entity**

Remove these fields from `packages/database/src/entities/Substance.ts`:
- `isSvhc`
- `requiresAuthorization`
- `isRestricted`
- `restrictionConditions`
- `sunsetDate`
- `latestApplicationDate`

**Step 2: Update migration to not create deprecated columns**

**Step 3: Run tests to verify nothing breaks**

Run: `pnpm test`
Expected: All tests pass (after updating any tests that use deprecated fields)

**Step 4: Commit**

```bash
git add packages/database/src/entities/Substance.ts packages/database/src/migrations/
git commit -m "$(cat <<'EOF'
refactor(database): remove deprecated regulatory flags from Substance

BREAKING CHANGE: Removed isSvhc, requiresAuthorization, isRestricted,
restrictionConditions, sunsetDate, latestApplicationDate fields.

Use SubstanceListEntry for regulatory status instead.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9.3: Delete Old Seeder and Data Files

**Files:**
- Delete: `packages/database/src/seeders/substances.seeder.ts`
- Delete: `packages/database/data/echa-substances.json`
- Delete: `packages/database/data/cleaned_substances.csv`
- Modify: `packages/database/src/seeders/index.ts`

**Step 1: Remove files**

```bash
rm packages/database/src/seeders/substances.seeder.ts
rm packages/database/data/echa-substances.json
rm packages/database/data/cleaned_substances.csv
```

**Step 2: Update seeders index**

Remove `SubstancesSeeder` export from `packages/database/src/seeders/index.ts`

**Step 3: Update any code that imported old seeder**

Search for and update: `grep -rn "SubstancesSeeder" --include="*.ts"`

**Step 4: Run tests**

Run: `pnpm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(database): remove old substance seeder and data files

Replaced by GSR package seeders:
- EchaInventorySeeder (~106k substances)
- EchaSvhcSeeder (SVHC candidate list)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 10: CLI Commands

### Task 10.1: Create GSR CLI Entry Point

**Files:**
- Create: `packages/gsr/src/cli/index.ts`
- Create: `packages/gsr/src/cli/seed.ts`
- Modify: `packages/gsr/package.json`

**Step 1: Create CLI commands**

```typescript
// packages/gsr/src/cli/seed.ts
import { Command } from 'commander';
import { MikroORM } from '@mikro-orm/postgresql';
import { publicConfig } from '@eurocomply/database';
import { EchaInventorySeeder } from '../seeders/echa-inventory.seeder.js';
import { EchaSvhcSeeder } from '../seeders/echa-svhc.seeder.js';

export function createSeedCommand(): Command {
  const seed = new Command('seed')
    .description('Seed GSR data from external sources');

  seed
    .command('echa-inventory')
    .description('Seed substances from ECHA EC Inventory')
    .option('-f, --file <path>', 'Path to CSV file (downloads if not provided)')
    .option('-v, --version <version>', 'Version string', new Date().toISOString().slice(0, 7))
    .action(async (options) => {
      const orm = await MikroORM.init(publicConfig);
      const em = orm.em.fork();

      try {
        const seeder = new EchaInventorySeeder(em);
        // For now, require file path (download logic would be added later)
        if (!options.file) {
          console.error('Please provide --file path to ECHA inventory CSV');
          process.exit(1);
        }

        const fs = await import('fs/promises');
        const content = await fs.readFile(options.file, 'utf-8');
        const result = await seeder.seedFromContent(content, options.version);

        console.log(result.message);
      } finally {
        await orm.close();
      }
    });

  seed
    .command('echa-svhc')
    .description('Seed SVHC candidate list entries')
    .option('-f, --file <path>', 'Path to SVHC CSV file')
    .option('-v, --version <version>', 'Version string', new Date().toISOString().slice(0, 7))
    .action(async (options) => {
      const orm = await MikroORM.init(publicConfig);
      const em = orm.em.fork();

      try {
        const seeder = new EchaSvhcSeeder(em);
        if (!options.file) {
          console.error('Please provide --file path to SVHC CSV');
          process.exit(1);
        }

        const fs = await import('fs/promises');
        const content = await fs.readFile(options.file, 'utf-8');
        const result = await seeder.seedFromContent(content, options.version);

        console.log(result.message);
      } finally {
        await orm.close();
      }
    });

  seed
    .command('all')
    .description('Seed all GSR data sources')
    .option('--echa-inventory <path>', 'Path to ECHA inventory CSV')
    .option('--echa-svhc <path>', 'Path to SVHC CSV')
    .action(async (options) => {
      console.log('Running all seeders...');
      // Implementation would call each seeder in order
    });

  return seed;
}
```

```typescript
// packages/gsr/src/cli/index.ts
#!/usr/bin/env node
import { Command } from 'commander';
import { createSeedCommand } from './seed.js';

const program = new Command()
  .name('gsr')
  .description('Global Substance Registry CLI')
  .version('0.0.1');

program.addCommand(createSeedCommand());

program.parse();
```

**Step 2: Update package.json**

```json
{
  "bin": {
    "gsr": "./dist/cli/index.js"
  },
  "dependencies": {
    "commander": "^12.0.0"
  }
}
```

**Step 3: Add npm scripts to root package.json**

```json
{
  "scripts": {
    "gsr:seed:echa-inventory": "node packages/gsr/dist/cli/index.js seed echa-inventory",
    "gsr:seed:echa-svhc": "node packages/gsr/dist/cli/index.js seed echa-svhc",
    "gsr:seed:all": "node packages/gsr/dist/cli/index.js seed all"
  }
}
```

**Step 4: Build and test CLI**

Run: `pnpm build && pnpm gsr:seed:echa-inventory --help`
Expected: Shows help for echa-inventory command

**Step 5: Commit**

```bash
git add packages/gsr/src/cli/ packages/gsr/package.json package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(gsr): add CLI for seeding substance registry

Commands:
- gsr seed echa-inventory --file <path>
- gsr seed echa-svhc --file <path>
- gsr seed all

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## CRITICAL REFINEMENTS

### Refinement A: Batch Inserts for 106k Seeder (Performance)

**Problem:** Task 7.2 uses `em.persist()` in a loop for 106k records - extremely slow and memory-intensive.

**Solution:** Use native PostgreSQL batch inserts with chunking.

**Update Task 7.2 - Replace the seeder implementation with:**

```typescript
// packages/gsr/src/seeders/echa-inventory.seeder.ts
import { EntityManager } from '@mikro-orm/postgresql';
import { Substance, SubstanceAlias, AliasType } from '@eurocomply/database';
import { RegistrySource, RegistrySourceName } from '../entities/RegistrySource.js';
import { EchaInventoryParser } from '../parsers/echa-inventory.parser.js';
import { AliasSource } from '../enums/AliasSource.js';
import { createId } from '@paralleldrive/cuid2';

const BATCH_SIZE = 1000;

export interface SeederResult {
  seeded: boolean;
  skipped: boolean;
  substanceCount: number;
  aliasCount: number;
  version: string;
  message: string;
}

export class EchaInventorySeeder {
  private parser = new EchaInventoryParser();

  constructor(private readonly em: EntityManager) {}

  async seedFromContent(csvContent: string, version: string): Promise<SeederResult> {
    // Check if already seeded with this version
    const existingSource = await this.em.findOne(RegistrySource, {
      name: RegistrySourceName.ECHA_EC,
    });

    if (existingSource?.version === version) {
      return {
        seeded: false,
        skipped: true,
        substanceCount: existingSource.recordCount || 0,
        aliasCount: 0,
        version,
        message: `ECHA EC Inventory already seeded with version ${version}`,
      };
    }

    // Parse CSV
    const records = await this.parser.parse(csvContent);
    console.log(`Parsed ${records.length} records, starting batch insert...`);

    // Get existing CAS numbers to avoid duplicates
    const existingCas = new Set(
      (await this.em.execute<{cas_number: string}[]>(
        `SELECT cas_number FROM substance WHERE cas_number IS NOT NULL`
      )).map(r => r.cas_number)
    );

    const existingEc = new Set(
      (await this.em.execute<{ec_number: string}[]>(
        `SELECT ec_number FROM substance WHERE ec_number IS NOT NULL`
      )).map(r => r.ec_number)
    );

    // Filter to new records only
    const newRecords = records.filter(r => {
      if (r.casNumber && existingCas.has(r.casNumber)) return false;
      if (r.ecNumber && existingEc.has(r.ecNumber)) return false;
      return true;
    });

    console.log(`${newRecords.length} new substances to insert`);

    let substanceCount = 0;
    let aliasCount = 0;

    // Process in batches
    for (let i = 0; i < newRecords.length; i += BATCH_SIZE) {
      const batch = newRecords.slice(i, i + BATCH_SIZE);
      const now = new Date().toISOString();

      // Prepare substance values
      const substanceValues = batch.map(record => ({
        id: createId(),
        cas_number: record.casNumber || `EC-${record.ecNumber}`,
        ec_number: record.ecNumber,
        primary_name: record.primaryName,
        molecular_formula: record.molecularFormula || null,
        is_active: true,
        created_at: now,
        updated_at: now,
      }));

      // Bulk insert substances using native query
      if (substanceValues.length > 0) {
        const placeholders = substanceValues.map((_, idx) => {
          const base = idx * 8;
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
        }).join(', ');

        const values = substanceValues.flatMap(v => [
          v.id, v.cas_number, v.ec_number, v.primary_name,
          v.molecular_formula, v.is_active, v.created_at, v.updated_at
        ]);

        await this.em.execute(`
          INSERT INTO substance (id, cas_number, ec_number, primary_name, molecular_formula, is_active, created_at, updated_at)
          VALUES ${placeholders}
          ON CONFLICT (cas_number) DO NOTHING
        `, values);

        substanceCount += substanceValues.length;
      }

      // Prepare alias values (link to substance by CAS)
      const aliasValues = batch
        .filter(r => r.primaryName)
        .map(record => ({
          id: createId(),
          substance_cas: record.casNumber || `EC-${record.ecNumber}`,
          name: record.primaryName,
          name_normalized: record.primaryName.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim(),
          type: 'INDEX_NAME',
          source: 'ECHA',
          language: 'en',
          created_at: now,
          updated_at: now,
        }));

      // Bulk insert aliases with subquery to get substance_id
      if (aliasValues.length > 0) {
        const aliasPlaceholders = aliasValues.map((_, idx) => {
          const base = idx * 9;
          return `($${base + 1}, (SELECT id FROM substance WHERE cas_number = $${base + 2}), $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`;
        }).join(', ');

        const aliasParams = aliasValues.flatMap(v => [
          v.id, v.substance_cas, v.name, v.name_normalized,
          v.type, v.source, v.language, v.created_at, v.updated_at
        ]);

        await this.em.execute(`
          INSERT INTO substance_alias (id, substance_id, name, name_normalized, type, source, language, created_at, updated_at)
          VALUES ${aliasPlaceholders}
          ON CONFLICT (substance_id, name) DO NOTHING
        `, aliasParams);

        aliasCount += aliasValues.length;
      }

      // Progress logging
      if ((i + BATCH_SIZE) % 10000 === 0 || i + BATCH_SIZE >= newRecords.length) {
        console.log(`Progress: ${Math.min(i + BATCH_SIZE, newRecords.length)}/${newRecords.length}`);
      }
    }

    // Update or create registry source
    if (existingSource) {
      existingSource.version = version;
      existingSource.recordCount = records.length;
      existingSource.lastSyncedAt = new Date();
      await this.em.persistAndFlush(existingSource);
    } else {
      const source = this.em.create(RegistrySource, {
        name: RegistrySourceName.ECHA_EC,
        version,
        recordCount: records.length,
        sourceUrl: 'https://echa.europa.eu/information-on-chemicals/ec-inventory',
      });
      await this.em.persistAndFlush(source);
    }

    return {
      seeded: true,
      skipped: false,
      substanceCount,
      aliasCount,
      version,
      message: `Seeded ${substanceCount} substances, ${aliasCount} aliases from ECHA EC Inventory`,
    };
  }
}
```

**Add dependency to package.json:**
```json
"@paralleldrive/cuid2": "^2.2.2"
```

---

### Refinement B: CryptoService for Blind Disclosure (Security)

**Problem:** Task 3.6 stores `disclosedCasNumber` as plaintext. Design requires encryption.

**Solution:** Add CryptoService using AES-256-GCM for encryption at rest.

**New Task 3.6.1: Create CryptoService**

**Files:**
- Create: `packages/gsr/src/services/CryptoService.ts`
- Test: `packages/gsr/src/services/CryptoService.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/services/CryptoService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CryptoService } from './CryptoService.js';

describe('CryptoService', () => {
  let crypto: CryptoService;

  beforeEach(() => {
    // Use test key (32 bytes for AES-256)
    const testKey = 'a'.repeat(64); // 32 bytes in hex
    crypto = new CryptoService(testKey);
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt CAS number', () => {
      const cas = '1309-60-0';
      const encrypted = crypto.encrypt(cas);

      expect(encrypted).not.toBe(cas);
      expect(encrypted).toContain(':'); // iv:authTag:ciphertext format

      const decrypted = crypto.decrypt(encrypted);
      expect(decrypted).toBe(cas);
    });

    it('should produce different ciphertext for same input (random IV)', () => {
      const cas = '1309-60-0';
      const encrypted1 = crypto.encrypt(cas);
      const encrypted2 = crypto.encrypt(cas);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should throw on tampered ciphertext', () => {
      const cas = '1309-60-0';
      const encrypted = crypto.encrypt(cas);
      const tampered = encrypted.slice(0, -2) + 'XX';

      expect(() => crypto.decrypt(tampered)).toThrow();
    });

    it('should throw on invalid format', () => {
      expect(() => crypto.decrypt('not:valid:format:here')).toThrow();
      expect(() => crypto.decrypt('invalid')).toThrow();
    });
  });

  describe('isEncrypted', () => {
    it('should return true for encrypted strings', () => {
      const encrypted = crypto.encrypt('1309-60-0');
      expect(crypto.isEncrypted(encrypted)).toBe(true);
    });

    it('should return false for plaintext', () => {
      expect(crypto.isEncrypted('1309-60-0')).toBe(false);
      expect(crypto.isEncrypted('not-encrypted')).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/services/CryptoService.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// packages/gsr/src/services/CryptoService.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypts/decrypts sensitive data using AES-256-GCM.
 * Format: base64(iv):base64(authTag):base64(ciphertext)
 */
export class CryptoService {
  private key: Buffer;

  constructor(hexKey: string) {
    if (hexKey.length !== 64) {
      throw new Error('Encryption key must be 64 hex characters (32 bytes)');
    }
    this.key = Buffer.from(hexKey, 'hex');
  }

  /**
   * Encrypt plaintext using AES-256-GCM.
   * Returns format: iv:authTag:ciphertext (all base64)
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  }

  /**
   * Decrypt ciphertext.
   * @throws Error if decryption fails (tampered or invalid)
   */
  decrypt(encrypted: string): string {
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted format');
    }

    const [ivB64, authTagB64, ciphertext] = parts;

    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');

    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error('Invalid IV or auth tag length');
    }

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Check if a string appears to be encrypted (matches our format).
   */
  isEncrypted(value: string): boolean {
    const parts = value.split(':');
    if (parts.length !== 3) return false;

    try {
      const iv = Buffer.from(parts[0], 'base64');
      const authTag = Buffer.from(parts[1], 'base64');
      return iv.length === IV_LENGTH && authTag.length === AUTH_TAG_LENGTH;
    } catch {
      return false;
    }
  }
}

/**
 * Factory to create CryptoService from environment variable.
 */
export function createCryptoService(): CryptoService {
  const key = process.env.GSR_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('GSR_ENCRYPTION_KEY environment variable is required');
  }
  return new CryptoService(key);
}
```

**Step 4: Update BlindDisclosureRequest entity to use encryption**

```typescript
// In BlindDisclosureRequest.ts, add helper methods:

import { createCryptoService } from '../services/CryptoService.js';

// Add to the entity class:

  /**
   * Set disclosed CAS (encrypts before storing).
   */
  setDisclosedCas(cas: string): void {
    const crypto = createCryptoService();
    this.disclosedCasNumber = crypto.encrypt(cas);
    this.disclosedAt = new Date();
  }

  /**
   * Get disclosed CAS (decrypts from storage).
   * Only call this during compliance checks.
   */
  getDisclosedCas(): string | null {
    if (!this.disclosedCasNumber) return null;
    const crypto = createCryptoService();
    return crypto.decrypt(this.disclosedCasNumber);
  }
```

**Step 5: Add to services index**

```typescript
// packages/gsr/src/services/index.ts
export { CryptoService, createCryptoService } from './CryptoService.js';
```

**Step 6: Commit**

```bash
git add packages/gsr/src/services/CryptoService.ts packages/gsr/src/services/CryptoService.test.ts
git commit -m "$(cat <<'EOF'
feat(gsr): add CryptoService for blind disclosure encryption

- AES-256-GCM encryption for disclosed CAS numbers
- Format: iv:authTag:ciphertext (all base64)
- Random IV ensures same input produces different ciphertext
- Auth tag prevents tampering
- Requires GSR_ENCRYPTION_KEY env var (64 hex chars)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Refinement C: Recursive CTE for Scope Queries (Performance)

**Problem:** ConflictDetector traverses scope hierarchy in TypeScript - slow for complex queries.

**Solution:** Use PostgreSQL recursive CTE for scope overlap detection at database level.

**Update Task 4.4 - Replace scope overlap logic with SQL:**

```typescript
// packages/gsr/src/services/ConflictDetector.ts

// Replace checkScopeOverlap method with SQL-based approach:

  /**
   * Find conflicting entries using SQL recursive CTE for scope hierarchy.
   */
  private async findConflictingEntries(
    substanceId: string,
    regulatoryListId: string,
    newScopes: ProductScope[]
  ): Promise<SubstanceListEntry[]> {
    // Use recursive CTE to find all entries with overlapping scopes
    const result = await this.em.execute<Array<{ id: string }>>(`
      WITH RECURSIVE scope_ancestors AS (
        -- Base: the scopes we're checking
        SELECT unnest($3::text[]) AS scope

        UNION

        -- Recursive: all ancestors of each scope
        SELECT h.parent_scope
        FROM product_scope_hierarchy h
        INNER JOIN scope_ancestors sa ON h.child_scope = sa.scope
      ),
      scope_descendants AS (
        -- Base: the scopes we're checking
        SELECT unnest($3::text[]) AS scope

        UNION

        -- Recursive: all descendants of each scope
        SELECT h.child_scope
        FROM product_scope_hierarchy h
        INNER JOIN scope_descendants sd ON h.parent_scope = sd.scope
      ),
      all_related_scopes AS (
        SELECT DISTINCT scope FROM scope_ancestors
        UNION
        SELECT DISTINCT scope FROM scope_descendants
      )
      SELECT sle.id
      FROM substance_list_entry sle
      WHERE sle.substance_id = $1
        AND sle.regulatory_list_id = $2
        AND (
          -- Direct overlap: any of our scopes match any of their scopes
          sle.scopes && $3::text[]
          -- OR: any of their scopes is in our ancestor/descendant set
          OR EXISTS (
            SELECT 1 FROM unnest(sle.scopes) AS existing_scope
            WHERE existing_scope IN (SELECT scope FROM all_related_scopes)
          )
        )
    `, [substanceId, regulatoryListId, newScopes]);

    if (result.length === 0) return [];

    // Fetch full entities
    return this.em.find(SubstanceListEntry, {
      id: { $in: result.map(r => r.id) },
    });
  }

  /**
   * Determine the type of scope overlap using SQL.
   */
  private async getScopeOverlapType(
    existingScopes: ProductScope[],
    newScopes: ProductScope[]
  ): Promise<'EXACT' | 'PARENT_CHILD' | 'CHILD_PARENT' | null> {
    // Check exact match first (fast)
    const exactMatch = existingScopes.some(e => newScopes.includes(e));
    if (exactMatch) return 'EXACT';

    // Use SQL to check hierarchy relationship
    const result = await this.em.execute<Array<{ relationship: string }>>(`
      WITH existing_ancestors AS (
        WITH RECURSIVE ancestors AS (
          SELECT unnest($1::text[]) AS scope
          UNION
          SELECT h.parent_scope
          FROM product_scope_hierarchy h
          INNER JOIN ancestors a ON h.child_scope = a.scope
        )
        SELECT DISTINCT scope FROM ancestors
      ),
      new_ancestors AS (
        WITH RECURSIVE ancestors AS (
          SELECT unnest($2::text[]) AS scope
          UNION
          SELECT h.parent_scope
          FROM product_scope_hierarchy h
          INNER JOIN ancestors a ON h.child_scope = a.scope
        )
        SELECT DISTINCT scope FROM ancestors
      )
      SELECT
        CASE
          WHEN EXISTS (
            SELECT 1 FROM unnest($1::text[]) AS e
            WHERE e IN (SELECT scope FROM new_ancestors)
          ) THEN 'PARENT_CHILD'
          WHEN EXISTS (
            SELECT 1 FROM unnest($2::text[]) AS n
            WHERE n IN (SELECT scope FROM existing_ancestors)
          ) THEN 'CHILD_PARENT'
          ELSE NULL
        END AS relationship
    `, [existingScopes, newScopes]);

    return result[0]?.relationship as 'PARENT_CHILD' | 'CHILD_PARENT' | null;
  }
```

---

### Refinement D: Database Setup Integration

**Important:** All GSR tables are added to the existing consolidated migration file (`packages/database/src/migrations/Migration20260122000000.ts`).

**No separate migration scripts.**

**Database setup flow:**
```
pnpm db:start       → Starts PostgreSQL container
pnpm db:reset       → Drops and recreates database, runs consolidated migration
pnpm test           → Uses eurocomply_test database (auto-created by init-db.sql)
```

**Phase 6 clarification:**

Task 6.1 updates the **existing** `Migration20260122000000.ts` file to add:
- Enhanced Substance columns (smiles, inchi_key, iupac_name)
- Enhanced SubstanceAlias columns (name_normalized, source)
- pg_trgm extension
- All new GSR tables (registry_source, regulatory_list, substance_group, etc.)
- product_scope_hierarchy table with seeded hierarchy data

**After modifying the migration file:**
```bash
pnpm db:reset  # Recreates all tables including GSR tables
```

**For tests:**
- `setupTestDb()` will create the schema in `eurocomply_test`
- `clearTestDb()` must be updated to truncate GSR tables (in dependency order)

**Updated clearTestDb order (add to Task 6.1):**

```typescript
// In packages/database/src/test-utils.ts, update clearTestDb:
export async function clearTestDb(em: EntityManager): Promise<void> {
  await em.execute(`
    TRUNCATE TABLE
      -- GSR tables (child tables first)
      "public"."blind_disclosure_request",
      "public"."unresolved_substance",
      "public"."substance_list_entry",
      "public"."substance_group_member",
      "public"."substance_group",
      "public"."regulatory_list",
      "public"."registry_source",
      -- Existing tables
      "public"."outbox_event",
      "public"."ingestion_audit_log",
      "public"."staging_requirement",
      "public"."staging_regulation",
      "public"."requirement",
      "public"."category_regulation",
      "public"."regulation",
      "public"."category",
      "public"."substance_alias",
      "public"."substance",
      "public"."seed_version",
      "public"."api_keys",
      "public"."webhook_events",
      "public"."organizations",
      "public"."unit_definition"
    CASCADE
  `);
}
```

---

## Summary

This implementation plan covers the complete Global Substance Registry (GSR) feature:

| Phase | Description | Key Tasks |
|-------|-------------|-----------|
| **1-2** | Package setup & utilities | Enums, CAS sanitizer, name normalizer |
| **3** | Core entities | RegistrySource, RegulatoryList, SubstanceGroup, SubstanceListEntry, UnresolvedSubstance, BlindDisclosureRequest |
| **3.6.1** | **CryptoService** | AES-256-GCM encryption for blind disclosure |
| **4** | Services | UnitConversionService, SubstanceResolver (fuzzy), ConflictDetector (SQL CTE) |
| **5** | Entity enhancements | Substance: smiles, inchiKey; SubstanceAlias: nameNormalized, source |
| **6** | Migration | Update consolidated migration (pnpm db:reset) |
| **7** | Seeders | ECHA Inventory (**batch inserts**), ECHA SVHC |
| **8** | Package exports | Main index exports |
| **9** | Cleanup | Migrate flags, remove deprecated fields |
| **10** | CLI | Seed commands |

**Performance optimizations:**
- Batch inserts (1000 records/batch) for 106k seeder
- Recursive SQL CTEs for scope hierarchy queries
- pg_trgm index for fuzzy alias matching

**Security:**
- AES-256-GCM encryption for disclosed CAS numbers
- Environment variable for encryption key

**Database integration:**
- All tables in consolidated migration
- `pnpm db:reset` creates everything
- No separate migration scripts

**Total tasks:** ~30
**Key dependencies:** csv-parse, commander, @paralleldrive/cuid2
**Required env vars:** `GSR_ENCRYPTION_KEY` (64 hex chars)

---

**Execution ready.** Which approach?

1. **Subagent-Driven (this session)** - Fresh subagent per task, review between tasks
2. **Parallel Session (separate)** - New session with executing-plans skill
