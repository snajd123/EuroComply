# Product Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the core Product model that all workspaces depend on - products, versions, identifiers, and BOM.

**Architecture:** Product is the central hub entity. Each product has per-workspace versions (DRAFT → RELEASED). Products can be FINISHED_GOOD, RAW_MATERIAL, COMPONENT, or VARIANT. BOM entries link products (parent → child with quantities). Products have multiple identifiers (Internal, SKU, GTIN).

**Tech Stack:** TypeScript, Prisma, PostgreSQL, Hono, Vitest

---

## Phase 1A: Product Model (Tasks 1-5)

### Task 1: Add Product Schema to Prisma

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Step 1: Add Product enum and model**

Add to `packages/db/prisma/schema.prisma` after the OutboxEvent model:

```prisma
// ============================================
// PRODUCT - Central Hub Entity
// ============================================

enum ProductType {
  FINISHED_GOOD
  RAW_MATERIAL
  COMPONENT
  VARIANT
}

enum ProductStatus {
  ACTIVE
  ARCHIVED
}

model Product {
  id              String        @id @default(cuid())
  organizationId  String        @map("organization_id")

  // Classification
  productType     ProductType   @default(FINISHED_GOOD) @map("product_type")
  name            String
  description     String?

  // For variants - link to parent product
  parentId        String?       @map("parent_id")
  parent          Product?      @relation("ProductVariants", fields: [parentId], references: [id])
  variants        Product[]     @relation("ProductVariants")

  // Status
  status          ProductStatus @default(ACTIVE)

  // Timestamps
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")

  // Relations
  identifiers     ProductIdentifier[]
  versions        ProductVersion[]
  bomEntriesAsParent BomEntry[] @relation("BomParent")
  bomEntriesAsChild  BomEntry[] @relation("BomChild")

  @@index([organizationId])
  @@index([productType])
  @@index([parentId])
  @@map("products")
}
```

**Step 2: Run Prisma format**

```bash
cd /root/Documents/EuroComply && pnpm db:generate
```

Expected: No errors, Prisma client regenerated

**Step 3: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): add Product model with type enum and variant support"
```

---

### Task 2: Add ProductIdentifier Schema

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Step 1: Add ProductIdentifier model**

Add after the Product model:

```prisma
// ============================================
// PRODUCT IDENTIFIERS - Multi-identifier support
// ============================================

enum IdentifierType {
  INTERNAL    // Human-readable project code (e.g., PROTO-V1-2026)
  SKU         // ERP/warehouse sync
  GTIN        // Retail barcode (EAN-13, UPC-A)
  DPP_URI     // Permanent DPP web address
}

model ProductIdentifier {
  id          String         @id @default(cuid())
  productId   String         @map("product_id")
  product     Product        @relation(fields: [productId], references: [id], onDelete: Cascade)

  type        IdentifierType
  value       String

  // Timestamps
  createdAt   DateTime       @default(now()) @map("created_at")

  @@unique([productId, type])
  @@index([type, value])
  @@map("product_identifiers")
}
```

**Step 2: Run Prisma generate**

```bash
pnpm db:generate
```

Expected: No errors

**Step 3: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): add ProductIdentifier model for GTIN, SKU, Internal IDs"
```

---

### Task 3: Add ProductVersion Schema

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Step 1: Add ProductVersion model**

Add after ProductIdentifier:

```prisma
// ============================================
// PRODUCT VERSIONS - Per-workspace versioning
// ============================================

enum Workspace {
  DESIGN
  OPERATIONS
  MARKETING
  COMPLIANCE
}

enum VersionStatus {
  DRAFT
  PENDING_REVIEW
  IN_REVIEW
  RELEASED
  REJECTED
}

model ProductVersion {
  id            String        @id @default(cuid())
  productId     String        @map("product_id")
  product       Product       @relation(fields: [productId], references: [id], onDelete: Cascade)

  // Version identification
  workspace     Workspace
  versionNumber Int           @map("version_number")

  // Workflow status
  status        VersionStatus @default(DRAFT)

  // Audit trail
  createdBy     String        @map("created_by")
  publishedBy   String?       @map("published_by")
  publishedAt   DateTime?     @map("published_at")

  // Optional: Signature for released versions (DID + JWS)
  signatureDid  String?       @map("signature_did")
  signatureJws  String?       @map("signature_jws")

  // Timestamps
  createdAt     DateTime      @default(now()) @map("created_at")
  updatedAt     DateTime      @updatedAt @map("updated_at")

  // Relations
  bomEntries    BomEntry[]

  @@unique([productId, workspace, versionNumber])
  @@index([productId, workspace])
  @@index([status])
  @@map("product_versions")
}
```

**Step 2: Run Prisma generate**

```bash
pnpm db:generate
```

Expected: No errors

**Step 3: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): add ProductVersion model with workspace versioning"
```

---

### Task 4: Add BomEntry Schema

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Step 1: Add BomEntry model**

Add after ProductVersion:

```prisma
// ============================================
// BOM ENTRIES - Bill of Materials
// ============================================

model BomEntry {
  id                String         @id @default(cuid())

  // Parent product (the finished good or component)
  parentProductId   String         @map("parent_product_id")
  parentProduct     Product        @relation("BomParent", fields: [parentProductId], references: [id], onDelete: Cascade)

  // Child product (the material or component being used)
  childProductId    String         @map("child_product_id")
  childProduct      Product        @relation("BomChild", fields: [childProductId], references: [id], onDelete: Cascade)

  // Version this BOM entry belongs to
  versionId         String         @map("version_id")
  version           ProductVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)

  // Quantity and unit
  quantity          Decimal
  unit              String         // kg, pcs, m, etc.

  // Production parameters
  scrapRatePct      Decimal        @default(0) @map("scrap_rate_pct")
  yieldPct          Decimal        @default(100) @map("yield_pct")

  // Ordering
  position          Int            @default(0)
  notes             String?

  // Timestamps
  createdAt         DateTime       @default(now()) @map("created_at")
  updatedAt         DateTime       @updatedAt @map("updated_at")

  @@unique([parentProductId, childProductId, versionId])
  @@index([parentProductId])
  @@index([childProductId])
  @@index([versionId])
  @@map("bom_entries")
}
```

**Step 2: Run Prisma generate**

```bash
pnpm db:generate
```

Expected: No errors

**Step 3: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): add BomEntry model for bill of materials"
```

---

### Task 5: Create and Run Migration

**Files:**
- Create: `packages/db/prisma/migrations/YYYYMMDD_add_product_models/migration.sql` (auto-generated)

**Step 1: Create migration**

```bash
cd /root/Documents/EuroComply
pnpm db:migrate:dev --name add_product_models
```

Expected: Migration created and applied to local database (if running)

**Step 2: Verify schema**

```bash
pnpm db:generate
```

Expected: Prisma client regenerated with new models

**Step 3: Commit migration**

```bash
git add packages/db/prisma/migrations/
git commit -m "chore(db): add migration for product models"
```

---

## Phase 1B: Product Service (Tasks 6-10)

### Task 6: Create Product Types

**Files:**
- Create: `packages/shared/src/product.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Write the type definitions**

Create `packages/shared/src/product.ts`:

```typescript
/**
 * Product types and interfaces for the EuroComply platform.
 */

export const PRODUCT_TYPES = ['FINISHED_GOOD', 'RAW_MATERIAL', 'COMPONENT', 'VARIANT'] as const;
export type ProductType = typeof PRODUCT_TYPES[number];

export const PRODUCT_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type ProductStatus = typeof PRODUCT_STATUSES[number];

export const WORKSPACES = ['DESIGN', 'OPERATIONS', 'MARKETING', 'COMPLIANCE'] as const;
export type Workspace = typeof WORKSPACES[number];

export const VERSION_STATUSES = ['DRAFT', 'PENDING_REVIEW', 'IN_REVIEW', 'RELEASED', 'REJECTED'] as const;
export type VersionStatus = typeof VERSION_STATUSES[number];

export const IDENTIFIER_TYPES = ['INTERNAL', 'SKU', 'GTIN', 'DPP_URI'] as const;
export type IdentifierType = typeof IDENTIFIER_TYPES[number];

/**
 * Input for creating a new product.
 */
export interface CreateProductInput {
  name: string;
  description?: string;
  productType: ProductType;
  parentId?: string; // For variants
  identifiers?: {
    type: IdentifierType;
    value: string;
  }[];
}

/**
 * Input for updating a product.
 */
export interface UpdateProductInput {
  name?: string;
  description?: string;
  status?: ProductStatus;
}

/**
 * Input for creating a new version.
 */
export interface CreateVersionInput {
  productId: string;
  workspace: Workspace;
}

/**
 * Input for adding a BOM entry.
 */
export interface AddBomEntryInput {
  parentProductId: string;
  childProductId: string;
  versionId: string;
  quantity: number;
  unit: string;
  scrapRatePct?: number;
  yieldPct?: number;
  position?: number;
  notes?: string;
}

/**
 * Check if a version status allows editing.
 */
export function isEditableStatus(status: VersionStatus): boolean {
  return status === 'DRAFT' || status === 'REJECTED';
}

/**
 * Check if a version can transition to a target status.
 */
export function canTransitionTo(current: VersionStatus, target: VersionStatus): boolean {
  const transitions: Record<VersionStatus, VersionStatus[]> = {
    DRAFT: ['PENDING_REVIEW'],
    PENDING_REVIEW: ['IN_REVIEW', 'DRAFT'],
    IN_REVIEW: ['RELEASED', 'REJECTED'],
    RELEASED: [], // Immutable
    REJECTED: ['DRAFT'], // Can create new draft
  };
  return transitions[current]?.includes(target) ?? false;
}
```

**Step 2: Export from index**

Add to `packages/shared/src/index.ts`:

```typescript
export * from './product.js';
```

**Step 3: Build and verify**

```bash
pnpm build
```

Expected: No errors

**Step 4: Commit**

```bash
git add packages/shared/src/product.ts packages/shared/src/index.ts
git commit -m "feat(shared): add product types and version state machine"
```

---

### Task 7: Write Product Service Tests

**Files:**
- Create: `apps/api/src/services/product.service.test.ts`

**Step 1: Write the failing tests**

Create `apps/api/src/services/product.service.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProductService } from './product.service.js';
import { CreateProductInput } from '@eurocomply/shared';

// Mock Prisma client
const mockPrisma = {
  product: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  productIdentifier: {
    createMany: vi.fn(),
  },
  productVersion: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn((fn) => fn(mockPrisma)),
};

describe('ProductService', () => {
  let service: ProductService;
  const orgId = 'org_test123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProductService(mockPrisma as any);
  });

  describe('createProduct', () => {
    it('should create a product with identifiers', async () => {
      const input: CreateProductInput = {
        name: 'Test Product',
        productType: 'FINISHED_GOOD',
        identifiers: [{ type: 'INTERNAL', value: 'PROTO-001' }],
      };

      mockPrisma.product.create.mockResolvedValue({
        id: 'prod_123',
        ...input,
        organizationId: orgId,
      });

      const result = await service.createProduct(orgId, input);

      expect(mockPrisma.product.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Test Product',
          productType: 'FINISHED_GOOD',
          organizationId: orgId,
        }),
        include: expect.any(Object),
      });
      expect(result.id).toBe('prod_123');
    });

    it('should reject variant without parentId', async () => {
      const input: CreateProductInput = {
        name: 'Variant without parent',
        productType: 'VARIANT',
      };

      await expect(service.createProduct(orgId, input)).rejects.toThrow(
        'VARIANT products must have a parentId'
      );
    });
  });

  describe('getProduct', () => {
    it('should return product by id within organization', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'prod_123',
        organizationId: orgId,
        name: 'Test',
      });

      const result = await service.getProduct(orgId, 'prod_123');

      expect(result).toBeDefined();
      expect(mockPrisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'prod_123' },
        include: expect.any(Object),
      });
    });

    it('should return null for product in different org', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'prod_123',
        organizationId: 'other_org',
        name: 'Test',
      });

      const result = await service.getProduct(orgId, 'prod_123');

      expect(result).toBeNull();
    });
  });

  describe('listProducts', () => {
    it('should list products with pagination', async () => {
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'prod_1', name: 'Product 1' },
        { id: 'prod_2', name: 'Product 2' },
      ]);

      const result = await service.listProducts(orgId, { limit: 10, offset: 0 });

      expect(result).toHaveLength(2);
      expect(mockPrisma.product.findMany).toHaveBeenCalledWith({
        where: { organizationId: orgId, status: 'ACTIVE' },
        include: expect.any(Object),
        take: 10,
        skip: 0,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should filter by productType', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);

      await service.listProducts(orgId, { productType: 'RAW_MATERIAL' });

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            productType: 'RAW_MATERIAL',
          }),
        })
      );
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm --filter @eurocomply/api test:run src/services/product.service.test.ts
```

Expected: FAIL with "Cannot find module './product.service.js'"

**Step 3: Commit**

```bash
git add apps/api/src/services/product.service.test.ts
git commit -m "test(api): add product service unit tests"
```

---

### Task 8: Implement Product Service

**Files:**
- Create: `apps/api/src/services/product.service.ts`

**Step 1: Write the implementation**

Create `apps/api/src/services/product.service.ts`:

```typescript
import { PrismaClient, Product, Prisma } from '@prisma/client';
import {
  CreateProductInput,
  UpdateProductInput,
  ProductType,
  ProductStatus,
} from '@eurocomply/shared';

export interface ListProductsOptions {
  limit?: number;
  offset?: number;
  productType?: ProductType;
  status?: ProductStatus;
  parentId?: string;
}

const productInclude = {
  identifiers: true,
  versions: {
    orderBy: { versionNumber: 'desc' as const },
    take: 1,
  },
  parent: true,
  _count: {
    select: { variants: true },
  },
};

export class ProductService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a new product with optional identifiers.
   */
  async createProduct(
    organizationId: string,
    input: CreateProductInput
  ): Promise<Product> {
    // Validate: VARIANT must have parentId
    if (input.productType === 'VARIANT' && !input.parentId) {
      throw new Error('VARIANT products must have a parentId');
    }

    // Validate: Non-VARIANT should not have parentId
    if (input.productType !== 'VARIANT' && input.parentId) {
      throw new Error('Only VARIANT products can have a parentId');
    }

    return this.prisma.$transaction(async (tx) => {
      // Create the product
      const product = await tx.product.create({
        data: {
          organizationId,
          name: input.name,
          description: input.description,
          productType: input.productType,
          parentId: input.parentId,
          identifiers: input.identifiers
            ? {
                create: input.identifiers.map((id) => ({
                  type: id.type,
                  value: id.value,
                })),
              }
            : undefined,
        },
        include: productInclude,
      });

      return product;
    });
  }

  /**
   * Get a product by ID, ensuring it belongs to the organization.
   */
  async getProduct(
    organizationId: string,
    productId: string
  ): Promise<Product | null> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: productInclude,
    });

    // Tenant isolation check
    if (product && product.organizationId !== organizationId) {
      return null;
    }

    return product;
  }

  /**
   * List products for an organization with filtering and pagination.
   */
  async listProducts(
    organizationId: string,
    options: ListProductsOptions = {}
  ): Promise<Product[]> {
    const { limit = 20, offset = 0, productType, status = 'ACTIVE', parentId } = options;

    const where: Prisma.ProductWhereInput = {
      organizationId,
      status,
      ...(productType && { productType }),
      ...(parentId !== undefined && { parentId }),
    };

    return this.prisma.product.findMany({
      where,
      include: productInclude,
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Update a product.
   */
  async updateProduct(
    organizationId: string,
    productId: string,
    input: UpdateProductInput
  ): Promise<Product | null> {
    // First verify the product belongs to this org
    const existing = await this.getProduct(organizationId, productId);
    if (!existing) {
      return null;
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.status && { status: input.status }),
      },
      include: productInclude,
    });
  }

  /**
   * Archive a product (soft delete).
   */
  async archiveProduct(
    organizationId: string,
    productId: string
  ): Promise<Product | null> {
    return this.updateProduct(organizationId, productId, { status: 'ARCHIVED' });
  }
}
```

**Step 2: Run tests to verify they pass**

```bash
pnpm --filter @eurocomply/api test:run src/services/product.service.test.ts
```

Expected: All tests PASS

**Step 3: Commit**

```bash
git add apps/api/src/services/product.service.ts
git commit -m "feat(api): implement ProductService with CRUD operations"
```

---

### Task 9: Write Version Service Tests

**Files:**
- Create: `apps/api/src/services/version.service.test.ts`

**Step 1: Write the failing tests**

Create `apps/api/src/services/version.service.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VersionService } from './version.service.js';

const mockPrisma = {
  productVersion: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  product: {
    findUnique: vi.fn(),
  },
  $transaction: vi.fn((fn) => fn(mockPrisma)),
};

describe('VersionService', () => {
  let service: VersionService;
  const orgId = 'org_test123';
  const productId = 'prod_123';
  const userId = 'user_123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new VersionService(mockPrisma as any);
  });

  describe('createVersion', () => {
    it('should create first version as v1', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: productId,
        organizationId: orgId,
      });
      mockPrisma.productVersion.findFirst.mockResolvedValue(null);
      mockPrisma.productVersion.create.mockResolvedValue({
        id: 'ver_123',
        productId,
        workspace: 'DESIGN',
        versionNumber: 1,
        status: 'DRAFT',
      });

      const result = await service.createVersion(orgId, {
        productId,
        workspace: 'DESIGN',
        createdBy: userId,
      });

      expect(result.versionNumber).toBe(1);
      expect(result.status).toBe('DRAFT');
    });

    it('should increment version number', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: productId,
        organizationId: orgId,
      });
      mockPrisma.productVersion.findFirst.mockResolvedValue({
        versionNumber: 3,
      });
      mockPrisma.productVersion.create.mockResolvedValue({
        id: 'ver_124',
        versionNumber: 4,
        status: 'DRAFT',
      });

      const result = await service.createVersion(orgId, {
        productId,
        workspace: 'DESIGN',
        createdBy: userId,
      });

      expect(result.versionNumber).toBe(4);
    });
  });

  describe('submitForReview', () => {
    it('should transition DRAFT to PENDING_REVIEW', async () => {
      mockPrisma.productVersion.findFirst.mockResolvedValue({
        id: 'ver_123',
        status: 'DRAFT',
        product: { organizationId: orgId },
      });
      mockPrisma.productVersion.update.mockResolvedValue({
        id: 'ver_123',
        status: 'PENDING_REVIEW',
      });

      const result = await service.submitForReview(orgId, 'ver_123');

      expect(result.status).toBe('PENDING_REVIEW');
    });

    it('should reject transition from RELEASED', async () => {
      mockPrisma.productVersion.findFirst.mockResolvedValue({
        id: 'ver_123',
        status: 'RELEASED',
        product: { organizationId: orgId },
      });

      await expect(service.submitForReview(orgId, 'ver_123')).rejects.toThrow(
        'Cannot transition from RELEASED to PENDING_REVIEW'
      );
    });
  });

  describe('releaseVersion', () => {
    it('should transition IN_REVIEW to RELEASED', async () => {
      mockPrisma.productVersion.findFirst.mockResolvedValue({
        id: 'ver_123',
        status: 'IN_REVIEW',
        product: { organizationId: orgId },
      });
      mockPrisma.productVersion.update.mockResolvedValue({
        id: 'ver_123',
        status: 'RELEASED',
        publishedAt: new Date(),
        publishedBy: userId,
      });

      const result = await service.releaseVersion(orgId, 'ver_123', userId);

      expect(result.status).toBe('RELEASED');
      expect(result.publishedBy).toBe(userId);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm --filter @eurocomply/api test:run src/services/version.service.test.ts
```

Expected: FAIL with "Cannot find module './version.service.js'"

**Step 3: Commit**

```bash
git add apps/api/src/services/version.service.test.ts
git commit -m "test(api): add version service unit tests"
```

---

### Task 10: Implement Version Service

**Files:**
- Create: `apps/api/src/services/version.service.ts`

**Step 1: Write the implementation**

Create `apps/api/src/services/version.service.ts`:

```typescript
import { PrismaClient, ProductVersion } from '@prisma/client';
import { Workspace, VersionStatus, canTransitionTo } from '@eurocomply/shared';

export interface CreateVersionInput {
  productId: string;
  workspace: Workspace;
  createdBy: string;
}

export class VersionService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a new version for a product in a specific workspace.
   */
  async createVersion(
    organizationId: string,
    input: CreateVersionInput
  ): Promise<ProductVersion> {
    // Verify product belongs to org
    const product = await this.prisma.product.findUnique({
      where: { id: input.productId },
    });

    if (!product || product.organizationId !== organizationId) {
      throw new Error('Product not found');
    }

    // Get the latest version number for this workspace
    const latestVersion = await this.prisma.productVersion.findFirst({
      where: {
        productId: input.productId,
        workspace: input.workspace,
      },
      orderBy: { versionNumber: 'desc' },
    });

    const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

    return this.prisma.productVersion.create({
      data: {
        productId: input.productId,
        workspace: input.workspace,
        versionNumber: nextVersionNumber,
        status: 'DRAFT',
        createdBy: input.createdBy,
      },
    });
  }

  /**
   * Get a version by ID, ensuring it belongs to the organization.
   */
  async getVersion(
    organizationId: string,
    versionId: string
  ): Promise<ProductVersion | null> {
    const version = await this.prisma.productVersion.findFirst({
      where: { id: versionId },
      include: { product: true },
    });

    if (!version || version.product.organizationId !== organizationId) {
      return null;
    }

    return version;
  }

  /**
   * List versions for a product.
   */
  async listVersions(
    organizationId: string,
    productId: string,
    workspace?: Workspace
  ): Promise<ProductVersion[]> {
    return this.prisma.productVersion.findMany({
      where: {
        productId,
        product: { organizationId },
        ...(workspace && { workspace }),
      },
      orderBy: { versionNumber: 'desc' },
    });
  }

  /**
   * Transition a version to a new status with validation.
   */
  private async transitionStatus(
    organizationId: string,
    versionId: string,
    targetStatus: VersionStatus,
    publishedBy?: string
  ): Promise<ProductVersion> {
    const version = await this.getVersion(organizationId, versionId);

    if (!version) {
      throw new Error('Version not found');
    }

    if (!canTransitionTo(version.status as VersionStatus, targetStatus)) {
      throw new Error(
        `Cannot transition from ${version.status} to ${targetStatus}`
      );
    }

    const updateData: any = { status: targetStatus };

    if (targetStatus === 'RELEASED' && publishedBy) {
      updateData.publishedAt = new Date();
      updateData.publishedBy = publishedBy;
    }

    return this.prisma.productVersion.update({
      where: { id: versionId },
      data: updateData,
    });
  }

  /**
   * Submit a version for review.
   */
  async submitForReview(
    organizationId: string,
    versionId: string
  ): Promise<ProductVersion> {
    return this.transitionStatus(organizationId, versionId, 'PENDING_REVIEW');
  }

  /**
   * Start reviewing a version.
   */
  async startReview(
    organizationId: string,
    versionId: string
  ): Promise<ProductVersion> {
    return this.transitionStatus(organizationId, versionId, 'IN_REVIEW');
  }

  /**
   * Release a version (make it immutable).
   */
  async releaseVersion(
    organizationId: string,
    versionId: string,
    publishedBy: string
  ): Promise<ProductVersion> {
    return this.transitionStatus(organizationId, versionId, 'RELEASED', publishedBy);
  }

  /**
   * Reject a version.
   */
  async rejectVersion(
    organizationId: string,
    versionId: string
  ): Promise<ProductVersion> {
    return this.transitionStatus(organizationId, versionId, 'REJECTED');
  }
}
```

**Step 2: Run tests to verify they pass**

```bash
pnpm --filter @eurocomply/api test:run src/services/version.service.test.ts
```

Expected: All tests PASS

**Step 3: Commit**

```bash
git add apps/api/src/services/version.service.ts
git commit -m "feat(api): implement VersionService with state machine transitions"
```

---

## Phase 1C: Product Routes (Tasks 11-15)

### Task 11: Create Product Routes

**Files:**
- Create: `apps/api/src/routes/products.ts`
- Modify: `apps/api/src/routes/index.ts`

**Step 1: Create the routes file**

Create `apps/api/src/routes/products.ts`:

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { prisma } from '@eurocomply/db';
import { ProductService } from '../services/product.service.js';
import { VersionService } from '../services/version.service.js';
import { PRODUCT_TYPES, WORKSPACES, IDENTIFIER_TYPES } from '@eurocomply/shared';
import type { AuthContext } from '../types/context.js';

const products = new Hono<AuthContext>();
const productService = new ProductService(prisma);
const versionService = new VersionService(prisma);

// Validation schemas
const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  productType: z.enum(PRODUCT_TYPES),
  parentId: z.string().optional(),
  identifiers: z
    .array(
      z.object({
        type: z.enum(IDENTIFIER_TYPES),
        value: z.string().min(1),
      })
    )
    .optional(),
});

const updateProductSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  productType: z.enum(PRODUCT_TYPES).optional(),
  parentId: z.string().optional(),
});

const createVersionSchema = z.object({
  workspace: z.enum(WORKSPACES),
});

// List products
products.get('/', zValidator('query', listQuerySchema), async (c) => {
  const { organizationId } = c.get('auth');
  const query = c.req.valid('query');

  const items = await productService.listProducts(organizationId, query);

  return c.json({ items, limit: query.limit, offset: query.offset });
});

// Create product
products.post('/', zValidator('json', createProductSchema), async (c) => {
  const { organizationId } = c.get('auth');
  const input = c.req.valid('json');

  try {
    const product = await productService.createProduct(organizationId, input);
    return c.json(product, 201);
  } catch (error) {
    if (error instanceof Error) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});

// Get product by ID
products.get('/:id', async (c) => {
  const { organizationId } = c.get('auth');
  const productId = c.req.param('id');

  const product = await productService.getProduct(organizationId, productId);

  if (!product) {
    return c.json({ error: 'Product not found' }, 404);
  }

  return c.json(product);
});

// Update product
products.patch('/:id', zValidator('json', updateProductSchema), async (c) => {
  const { organizationId } = c.get('auth');
  const productId = c.req.param('id');
  const input = c.req.valid('json');

  const product = await productService.updateProduct(organizationId, productId, input);

  if (!product) {
    return c.json({ error: 'Product not found' }, 404);
  }

  return c.json(product);
});

// Archive product
products.delete('/:id', async (c) => {
  const { organizationId } = c.get('auth');
  const productId = c.req.param('id');

  const product = await productService.archiveProduct(organizationId, productId);

  if (!product) {
    return c.json({ error: 'Product not found' }, 404);
  }

  return c.json({ message: 'Product archived' });
});

// Create version
products.post(
  '/:id/versions',
  zValidator('json', createVersionSchema),
  async (c) => {
    const { organizationId, userId } = c.get('auth');
    const productId = c.req.param('id');
    const { workspace } = c.req.valid('json');

    try {
      const version = await versionService.createVersion(organizationId, {
        productId,
        workspace,
        createdBy: userId,
      });
      return c.json(version, 201);
    } catch (error) {
      if (error instanceof Error && error.message === 'Product not found') {
        return c.json({ error: 'Product not found' }, 404);
      }
      throw error;
    }
  }
);

// List versions
products.get('/:id/versions', async (c) => {
  const { organizationId } = c.get('auth');
  const productId = c.req.param('id');
  const workspace = c.req.query('workspace') as any;

  const versions = await versionService.listVersions(
    organizationId,
    productId,
    workspace
  );

  return c.json({ items: versions });
});

export { products };
```

**Step 2: Register the routes**

Modify `apps/api/src/routes/index.ts`:

```typescript
import { Hono } from 'hono';
import { health } from './health.js';
import { organizations } from './organizations.js';
import { products } from './products.js';

export function registerRoutes(app: Hono): void {
  // Health endpoints (no auth required)
  app.route('/health', health);

  // API v1 routes
  app.route('/api/v1/organizations', organizations);
  app.route('/api/v1/products', products);
}
```

**Step 3: Build and verify**

```bash
pnpm build
```

Expected: No errors

**Step 4: Commit**

```bash
git add apps/api/src/routes/products.ts apps/api/src/routes/index.ts
git commit -m "feat(api): add product and version routes"
```

---

### Task 12: Write Product Route Integration Tests

**Files:**
- Create: `apps/api/src/test/integration/products.test.ts`

**Step 1: Write the integration tests**

Create `apps/api/src/test/integration/products.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupIntegrationTest, cleanupIntegrationTest, type TestContext } from './setup.js';

describe('Product Routes Integration Tests', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupIntegrationTest();
  });

  afterAll(async () => {
    await cleanupIntegrationTest(ctx);
  });

  describe('POST /api/v1/products', () => {
    it('should create a product', async () => {
      const res = await ctx.app.request('/api/v1/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ctx.authToken}`,
        },
        body: JSON.stringify({
          name: 'Test Product',
          productType: 'FINISHED_GOOD',
          identifiers: [{ type: 'INTERNAL', value: 'TEST-001' }],
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.name).toBe('Test Product');
      expect(body.productType).toBe('FINISHED_GOOD');
      expect(body.identifiers).toHaveLength(1);
    });

    it('should reject VARIANT without parentId', async () => {
      const res = await ctx.app.request('/api/v1/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ctx.authToken}`,
        },
        body: JSON.stringify({
          name: 'Invalid Variant',
          productType: 'VARIANT',
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('parentId');
    });
  });

  describe('GET /api/v1/products', () => {
    it('should list products with pagination', async () => {
      // Create a product first
      await ctx.app.request('/api/v1/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ctx.authToken}`,
        },
        body: JSON.stringify({
          name: 'List Test Product',
          productType: 'RAW_MATERIAL',
        }),
      });

      const res = await ctx.app.request('/api/v1/products?limit=10&offset=0', {
        headers: { Authorization: `Bearer ${ctx.authToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toBeDefined();
      expect(body.limit).toBe(10);
    });

    it('should filter by productType', async () => {
      const res = await ctx.app.request(
        '/api/v1/products?productType=RAW_MATERIAL',
        {
          headers: { Authorization: `Bearer ${ctx.authToken}` },
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      body.items.forEach((p: any) => {
        expect(p.productType).toBe('RAW_MATERIAL');
      });
    });
  });

  describe('POST /api/v1/products/:id/versions', () => {
    it('should create a version', async () => {
      // Create product first
      const createRes = await ctx.app.request('/api/v1/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ctx.authToken}`,
        },
        body: JSON.stringify({
          name: 'Version Test Product',
          productType: 'FINISHED_GOOD',
        }),
      });
      const product = await createRes.json();

      // Create version
      const res = await ctx.app.request(
        `/api/v1/products/${product.id}/versions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ctx.authToken}`,
          },
          body: JSON.stringify({ workspace: 'DESIGN' }),
        }
      );

      expect(res.status).toBe(201);
      const version = await res.json();
      expect(version.versionNumber).toBe(1);
      expect(version.status).toBe('DRAFT');
      expect(version.workspace).toBe('DESIGN');
    });
  });
});
```

**Step 2: Run integration tests (requires local DB)**

```bash
pnpm --filter @eurocomply/api test:integration
```

Expected: Tests pass (if local DB running) or skip (if no DB)

**Step 3: Commit**

```bash
git add apps/api/src/test/integration/products.test.ts
git commit -m "test(api): add product routes integration tests"
```

---

### Task 13: Add Version Status Transition Routes

**Files:**
- Create: `apps/api/src/routes/versions.ts`
- Modify: `apps/api/src/routes/index.ts`

**Step 1: Create version routes**

Create `apps/api/src/routes/versions.ts`:

```typescript
import { Hono } from 'hono';
import { prisma } from '@eurocomply/db';
import { VersionService } from '../services/version.service.js';
import type { AuthContext } from '../types/context.js';

const versions = new Hono<AuthContext>();
const versionService = new VersionService(prisma);

// Submit for review
versions.post('/:id/submit', async (c) => {
  const { organizationId } = c.get('auth');
  const versionId = c.req.param('id');

  try {
    const version = await versionService.submitForReview(organizationId, versionId);
    return c.json(version);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Version not found') {
        return c.json({ error: 'Version not found' }, 404);
      }
      if (error.message.startsWith('Cannot transition')) {
        return c.json({ error: error.message }, 400);
      }
    }
    throw error;
  }
});

// Start review
versions.post('/:id/review', async (c) => {
  const { organizationId } = c.get('auth');
  const versionId = c.req.param('id');

  try {
    const version = await versionService.startReview(organizationId, versionId);
    return c.json(version);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Version not found') {
        return c.json({ error: 'Version not found' }, 404);
      }
      if (error.message.startsWith('Cannot transition')) {
        return c.json({ error: error.message }, 400);
      }
    }
    throw error;
  }
});

// Release version
versions.post('/:id/release', async (c) => {
  const { organizationId, userId } = c.get('auth');
  const versionId = c.req.param('id');

  try {
    const version = await versionService.releaseVersion(
      organizationId,
      versionId,
      userId
    );
    return c.json(version);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Version not found') {
        return c.json({ error: 'Version not found' }, 404);
      }
      if (error.message.startsWith('Cannot transition')) {
        return c.json({ error: error.message }, 400);
      }
    }
    throw error;
  }
});

// Reject version
versions.post('/:id/reject', async (c) => {
  const { organizationId } = c.get('auth');
  const versionId = c.req.param('id');

  try {
    const version = await versionService.rejectVersion(organizationId, versionId);
    return c.json(version);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Version not found') {
        return c.json({ error: 'Version not found' }, 404);
      }
      if (error.message.startsWith('Cannot transition')) {
        return c.json({ error: error.message }, 400);
      }
    }
    throw error;
  }
});

export { versions };
```

**Step 2: Register routes**

Update `apps/api/src/routes/index.ts`:

```typescript
import { Hono } from 'hono';
import { health } from './health.js';
import { organizations } from './organizations.js';
import { products } from './products.js';
import { versions } from './versions.js';

export function registerRoutes(app: Hono): void {
  // Health endpoints (no auth required)
  app.route('/health', health);

  // API v1 routes
  app.route('/api/v1/organizations', organizations);
  app.route('/api/v1/products', products);
  app.route('/api/v1/versions', versions);
}
```

**Step 3: Commit**

```bash
git add apps/api/src/routes/versions.ts apps/api/src/routes/index.ts
git commit -m "feat(api): add version status transition routes"
```

---

### Task 14: Run All Tests

**Files:** None (verification only)

**Step 1: Run unit tests**

```bash
pnpm test:unit
```

Expected: All unit tests pass

**Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: No type errors

**Step 3: Run lint**

```bash
pnpm lint
```

Expected: No lint errors (or acceptable warnings)

**Step 4: Build**

```bash
pnpm build
```

Expected: Build succeeds

---

### Task 15: Final Commit and Push

**Files:** None

**Step 1: Verify all changes committed**

```bash
git status
```

Expected: Working tree clean

**Step 2: Push to main**

```bash
git push origin main
```

Expected: CI pipeline triggers

**Step 3: Verify CI passes**

```bash
gh run list --limit 1
```

Expected: CI run completes successfully

---

## Summary

This plan implements:

1. **Database Schema:**
   - Product model (hub entity)
   - ProductIdentifier (GTIN, SKU, Internal)
   - ProductVersion (per-workspace versioning)
   - BomEntry (bill of materials)

2. **Services:**
   - ProductService (CRUD, tenant isolation)
   - VersionService (state machine transitions)

3. **API Routes:**
   - `POST /api/v1/products` - Create product
   - `GET /api/v1/products` - List products
   - `GET /api/v1/products/:id` - Get product
   - `PATCH /api/v1/products/:id` - Update product
   - `DELETE /api/v1/products/:id` - Archive product
   - `POST /api/v1/products/:id/versions` - Create version
   - `GET /api/v1/products/:id/versions` - List versions
   - `POST /api/v1/versions/:id/submit` - Submit for review
   - `POST /api/v1/versions/:id/review` - Start review
   - `POST /api/v1/versions/:id/release` - Release version
   - `POST /api/v1/versions/:id/reject` - Reject version

4. **Types:**
   - Product types and enums in @eurocomply/shared
   - Version state machine helpers

**Next Phase:** BOM Service for adding materials to products
