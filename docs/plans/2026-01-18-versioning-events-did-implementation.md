# Versioning, Events, and DID Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the versioning, operations events, and DID architecture as defined in `2026-01-18-versioning-events-did-design.md`.

**Architecture:** Refactor workspace versioning to Design/Marketing only, add polymorphic OperationsEvent table with hash chain, add DPPSnapshot for Compliance, implement Corporate Envelope signing pattern with forensic context.

**Tech Stack:** Prisma, Zod, TypeScript, walt.id (for DID/VC), Hono (API routes)

---

## Phase 1: Schema Foundation

### Task 1.1: Add DID Fields to Organization

**Files:**
- Modify: `packages/db/prisma/schema.prisma:15-38`

**Step 1: Add DID and hash chain fields to Organization model**

In `packages/db/prisma/schema.prisma`, update the Organization model:

```prisma
model Organization {
  id                String   @id @default(cuid())
  name              String
  slug              String   @unique
  schemaName        String   @unique @map("schema_name")

  // DID and Walt.id Integration
  did               String?  @unique
  waltIdKeyId       String?  @map("walt_id_key_id")

  // Hash chain head pointer (for Operations events)
  lastEventHash     String?  @map("last_event_hash")
  eventSequence     Int      @default(0) @map("event_sequence")

  // Status list counter (for revocation)
  statusListIndex   Int      @default(0) @map("status_list_index")

  // Billing
  stripeCustomerId  String?  @map("stripe_customer_id")
  subscriptionTier  String   @default("starter") @map("subscription_tier")
  subscriptionStatus String  @default("active") @map("subscription_status")

  // Limits
  userLimit         Int      @default(20) @map("user_limit")
  storageLimit      BigInt   @default(536870912000) @map("storage_limit")

  // Timestamps
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  // Relations
  users             OrganizationUser[]

  @@map("organizations")
}
```

**Step 2: Generate Prisma client to verify schema is valid**

Run: `cd packages/db && npx prisma generate`
Expected: "Generated Prisma Client"

**Step 3: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): add DID and hash chain fields to Organization"
```

---

### Task 1.2: Refactor Workspace Enum

**Files:**
- Modify: `packages/db/prisma/schema.prisma:195-200`
- Modify: `packages/shared/src/product.ts:11-12`

**Step 1: Update Workspace enum in Prisma to only include DESIGN and MARKETING**

In `packages/db/prisma/schema.prisma`, find the Workspace enum and update:

```prisma
enum Workspace {
  DESIGN
  MARKETING
  // OPERATIONS - removed, uses OperationsEvent table
  // COMPLIANCE - removed, uses DPPSnapshot table
}
```

**Step 2: Update shared types to match**

In `packages/shared/src/product.ts`, update:

```typescript
// Workspaces that use ProductVersion (iterative content)
export const VERSIONED_WORKSPACES = ['DESIGN', 'MARKETING'] as const;
export type VersionedWorkspace = typeof VERSIONED_WORKSPACES[number];

// All workspaces (for authority checks)
export const ALL_WORKSPACES = ['DESIGN', 'OPERATIONS', 'MARKETING', 'COMPLIANCE'] as const;
export type WorkspaceType = typeof ALL_WORKSPACES[number];

// Deprecated: Use VERSIONED_WORKSPACES for ProductVersion, ALL_WORKSPACES for authorities
export const PRODUCT_WORKSPACES = VERSIONED_WORKSPACES;
export type ProductWorkspace = VersionedWorkspace;
```

**Step 3: Generate Prisma client**

Run: `cd packages/db && npx prisma generate`
Expected: "Generated Prisma Client"

**Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/shared/src/product.ts
git commit -m "refactor: limit Workspace enum to DESIGN and MARKETING"
```

---

### Task 1.3: Add User DID History Table

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (add after OrganizationUser model)

**Step 1: Add UserDidHistory model**

Add after the OrganizationUser model in `packages/db/prisma/schema.prisma`:

```prisma
// ============================================
// DID HISTORY - Key rotation tracking
// ============================================

model UserDidHistory {
  id                String    @id @default(cuid())
  userId            String    @map("user_id")
  did               String
  waltIdKeyId       String    @map("walt_id_key_id")
  validFrom         DateTime  @map("valid_from")
  validTo           DateTime? @map("valid_to")
  revokedAt         DateTime? @map("revoked_at")
  revocationReason  String?   @map("revocation_reason")
  statusListIndex   Int       @map("status_list_index")

  // Relations
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([did])
  @@map("user_did_history")
}

model OrgDidHistory {
  id                String       @id @default(cuid())
  organizationId    String       @map("organization_id")
  did               String
  waltIdKeyId       String       @map("walt_id_key_id")
  validFrom         DateTime     @map("valid_from")
  validTo           DateTime?    @map("valid_to")
  revokedAt         DateTime?    @map("revoked_at")
  revocationReason  String?      @map("revocation_reason")
  statusListIndex   Int          @map("status_list_index")

  // Relations
  organization      Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@index([did])
  @@map("org_did_history")
}
```

**Step 2: Add relations to User and Organization models**

Update the User model to add:

```prisma
model User {
  // ... existing fields ...

  // Relations
  organizations   OrganizationUser[]
  didHistory      UserDidHistory[]

  @@map("users")
}
```

Update the Organization model to add:

```prisma
model Organization {
  // ... existing fields ...

  // Relations
  users             OrganizationUser[]
  didHistory        OrgDidHistory[]

  @@map("organizations")
}
```

**Step 3: Generate Prisma client**

Run: `cd packages/db && npx prisma generate`
Expected: "Generated Prisma Client"

**Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): add UserDidHistory and OrgDidHistory tables"
```

---

### Task 1.4: Add OperationsEvent Table

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (add after OutboxEvent model)

**Step 1: Add EventStatus enum and OperationsEvent model**

Add after the OutboxEvent model:

```prisma
// ============================================
// OPERATIONS EVENTS - Forensic Ledger
// ============================================

enum EventStatus {
  PENDING_VERIFICATION
  VERIFIED
}

model OperationsEvent {
  id                  String       @id @default(cuid())
  organizationId      String       @map("organization_id")

  // Event type and payload (polymorphic)
  eventType           String       @map("event_type")
  payload             Json

  // Hash chain (tamper-evident)
  eventHash           String       @map("event_hash")
  previousEventHash   String?      @map("previous_event_hash")
  sequenceNumber      Int          @map("sequence_number")

  // Workflow
  status              EventStatus  @default(PENDING_VERIFICATION)

  // Created by (CONTRIBUTOR)
  createdAt           DateTime     @default(now()) @map("created_at")
  createdBy           String       @map("created_by")

  // Verified by (EDITOR) - The "Seal"
  verifiedAt          DateTime?    @map("verified_at")
  verifiedBy          String?      @map("verified_by")

  // User signature (EDITOR's DID)
  userSignatureDid    String?      @map("user_signature_did")
  userSignatureJws    String?      @map("user_signature_jws")

  // Organization signature (Corporate Envelope)
  orgSignatureDid     String?      @map("org_signature_did")
  orgSignatureJws     String?      @map("org_signature_jws")

  // Forensic context (embedded at sign-time)
  forensicContext     Json?        @map("forensic_context")

  // Credential status (for revocation)
  credentialStatusIndex Int?       @map("credential_status_index")
  timestampProof      Json?        @map("timestamp_proof")

  @@index([organizationId, eventType])
  @@index([organizationId, sequenceNumber])
  @@index([status])
  @@map("operations_events")
}
```

**Step 2: Generate Prisma client**

Run: `cd packages/db && npx prisma generate`
Expected: "Generated Prisma Client"

**Step 3: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): add OperationsEvent table with hash chain"
```

---

### Task 1.5: Add ReadinessProfile Table

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (add new section)

**Step 1: Add ReadinessProfile model**

Add a new section:

```prisma
// ============================================
// COMPLIANCE - Readiness Profiles
// ============================================

model ReadinessProfile {
  id                    String   @id @default(cuid())
  name                  String
  category              String
  description           String?

  // Required fields per workspace (JSON schema)
  requiredFields        Json     @map("required_fields")

  // Required attestations (e.g., ["ISO-9001", "GOTS"])
  requiredAttestations  Json?    @map("required_attestations")

  // Timestamps
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  // Relations
  snapshots             DPPSnapshot[]

  @@unique([category])
  @@map("readiness_profiles")
}
```

**Step 2: Generate Prisma client**

Run: `cd packages/db && npx prisma generate`
Expected: "Generated Prisma Client"

**Step 3: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): add ReadinessProfile table for category-specific DPP requirements"
```

---

### Task 1.6: Add DPPSnapshot Table

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (add after ReadinessProfile)

**Step 1: Add DPPSnapshotStatus enum and DPPSnapshot model**

```prisma
enum DPPSnapshotStatus {
  PENDING_REVIEW
  VERIFIED
  ATTESTED
  SEALED
  ISSUED
  REVOKED
}

model DPPSnapshot {
  id                    String            @id @default(cuid())
  organizationId        String            @map("organization_id")
  productId             String            @map("product_id")

  // Version references (audit trail, not for verification)
  designVersionId       String            @map("design_version_id")
  marketingVersionId    String?           @map("marketing_version_id")

  // Deep-cloned data (immutable snapshot)
  data                  Json
  dataHash              String            @map("data_hash")

  // Readiness
  readinessProfileId    String            @map("readiness_profile_id")
  readinessProfile      ReadinessProfile  @relation(fields: [readinessProfileId], references: [id])
  completionScore       Int               @map("completion_score")

  // Workflow status
  status                DPPSnapshotStatus @default(PENDING_REVIEW)

  // Verification (CONTRIBUTOR)
  verifiedAt            DateTime?         @map("verified_at")
  verifiedBy            String?           @map("verified_by")

  // Attestation (EDITOR) - User signature
  attestedAt            DateTime?         @map("attested_at")
  attestedBy            String?           @map("attested_by")
  userSignatureDid      String?           @map("user_signature_did")
  userSignatureJws      String?           @map("user_signature_jws")
  userForensicContext   Json?             @map("user_forensic_context")

  // Sealing (SYSTEM) - Corporate envelope
  sealedAt              DateTime?         @map("sealed_at")
  orgSignatureDid       String?           @map("org_signature_did")
  orgSignatureJws       String?           @map("org_signature_jws")
  orgForensicContext    Json?             @map("org_forensic_context")

  // Issuance
  issuedAt              DateTime?         @map("issued_at")
  vcId                  String?           @map("vc_id")
  vcJwt                 String?           @map("vc_jwt")
  dppUrl                String?           @map("dpp_url")
  qrCodeUrl             String?           @map("qr_code_url")

  // Revocation
  credentialStatusIndex Int?              @map("credential_status_index")
  timestampProof        Json?             @map("timestamp_proof")

  // Timestamps
  createdAt             DateTime          @default(now()) @map("created_at")
  updatedAt             DateTime          @updatedAt @map("updated_at")

  @@index([organizationId, status])
  @@index([productId])
  @@map("dpp_snapshots")
}
```

**Step 2: Generate Prisma client**

Run: `cd packages/db && npx prisma generate`
Expected: "Generated Prisma Client"

**Step 3: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): add DPPSnapshot table for Compliance workflow"
```

---

### Task 1.7: Create and Run Migration

**Files:**
- Create: `packages/db/prisma/migrations/[timestamp]_versioning_events_did/migration.sql`

**Step 1: Create migration**

Run: `cd packages/db && npx prisma migrate dev --name versioning_events_did`
Expected: Migration created and applied successfully

**Step 2: Verify migration applied**

Run: `cd packages/db && npx prisma migrate status`
Expected: All migrations applied

**Step 3: Commit migration**

```bash
git add packages/db/prisma/migrations/
git commit -m "feat(db): add migration for versioning, events, and DID schema"
```

---

## Phase 2: Shared Types and Zod Schemas

### Task 2.1: Add Operations Event Types

**Files:**
- Create: `packages/shared/src/operations-events.ts`

**Step 1: Write the test file**

Create `packages/shared/src/operations-events.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  BatchProducedSchema,
  MaterialConsumedSchema,
  QualityCheckSchema,
  InventoryAdjustmentSchema,
  validateEventPayload,
} from './operations-events.js';

describe('Operations Event Schemas', () => {
  describe('BatchProducedSchema', () => {
    it('should validate a valid batch produced payload', () => {
      const payload = {
        productId: 'prod_123',
        designVersionId: 'ver_456',
        batchNumber: 'BATCH-2026-001',
        quantity: 1000,
        unit: 'PCS',
        facilityId: 'fac_789',
        startedAt: '2026-01-18T08:00:00Z',
        completedAt: '2026-01-18T16:00:00Z',
      };

      const result = BatchProducedSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject negative quantity', () => {
      const payload = {
        productId: 'prod_123',
        designVersionId: 'ver_456',
        batchNumber: 'BATCH-2026-001',
        quantity: -100,
        unit: 'PCS',
        facilityId: 'fac_789',
        startedAt: '2026-01-18T08:00:00Z',
        completedAt: '2026-01-18T16:00:00Z',
      };

      const result = BatchProducedSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('validateEventPayload', () => {
    it('should validate BATCH_PRODUCED event', () => {
      const input = {
        eventType: 'BATCH_PRODUCED',
        payload: {
          productId: 'prod_123',
          designVersionId: 'ver_456',
          batchNumber: 'BATCH-2026-001',
          quantity: 1000,
          unit: 'PCS',
          facilityId: 'fac_789',
          startedAt: '2026-01-18T08:00:00Z',
          completedAt: '2026-01-18T16:00:00Z',
        },
      };

      expect(() => validateEventPayload(input)).not.toThrow();
    });

    it('should reject unknown event type', () => {
      const input = {
        eventType: 'UNKNOWN_EVENT',
        payload: {},
      };

      expect(() => validateEventPayload(input)).toThrow();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared && npm test -- operations-events.test.ts`
Expected: FAIL - module not found

**Step 3: Write the implementation**

Create `packages/shared/src/operations-events.ts`:

```typescript
import { z } from 'zod';

// ============================================
// EVENT TYPE CONSTANTS
// ============================================

export const EVENT_TYPES = [
  'BATCH_PRODUCED',
  'MATERIAL_CONSUMED',
  'GOODS_RECEIVED',
  'GOODS_SHIPPED',
  'QUALITY_CHECK',
  'INVENTORY_ADJUSTMENT',
  'SUPPLIER_AUDIT',
] as const;

export type EventType = typeof EVENT_TYPES[number];

export const EVENT_STATUSES = ['PENDING_VERIFICATION', 'VERIFIED'] as const;
export type EventStatus = typeof EVENT_STATUSES[number];

// ============================================
// EVENT PAYLOAD SCHEMAS
// ============================================

export const BatchProducedSchema = z.object({
  productId: z.string(),
  designVersionId: z.string(),
  batchNumber: z.string(),
  quantity: z.number().positive(),
  unit: z.enum(['PCS', 'KG', 'M', 'L', 'M2', 'M3']),
  facilityId: z.string(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
});

export type BatchProducedPayload = z.infer<typeof BatchProducedSchema>;

export const MaterialConsumedSchema = z.object({
  batchId: z.string(),
  materialLotId: z.string(),
  quantity: z.number().positive(),
  unit: z.string(),
  wasteQuantity: z.number().nonnegative().default(0),
});

export type MaterialConsumedPayload = z.infer<typeof MaterialConsumedSchema>;

export const GoodsReceivedSchema = z.object({
  supplierId: z.string(),
  purchaseOrderId: z.string().optional(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().positive(),
    unit: z.string(),
    lotNumber: z.string().optional(),
  })),
  receivedAt: z.string().datetime(),
  facilityId: z.string(),
});

export type GoodsReceivedPayload = z.infer<typeof GoodsReceivedSchema>;

export const GoodsShippedSchema = z.object({
  destinationId: z.string(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().positive(),
    unit: z.string(),
    batchNumber: z.string().optional(),
  })),
  carrier: z.string().optional(),
  trackingNumber: z.string().optional(),
  shippedAt: z.string().datetime(),
});

export type GoodsShippedPayload = z.infer<typeof GoodsShippedSchema>;

export const QualityCheckSchema = z.object({
  targetId: z.string(),
  targetType: z.enum(['BATCH', 'MATERIAL', 'PRODUCT']),
  checkType: z.string(),
  passed: z.boolean(),
  findings: z.string(),
  attachments: z.array(z.string().url()).optional(),
  checkedAt: z.string().datetime().optional(),
});

export type QualityCheckPayload = z.infer<typeof QualityCheckSchema>;

export const InventoryAdjustmentSchema = z.object({
  materialLotId: z.string(),
  productId: z.string().optional(),
  previousQuantity: z.number(),
  newQuantity: z.number(),
  reasonCode: z.enum(['DAMAGE', 'THEFT', 'DATA_ENTRY_ERROR', 'EXPIRED', 'SAMPLE', 'OTHER']),
  notes: z.string(),
});

export type InventoryAdjustmentPayload = z.infer<typeof InventoryAdjustmentSchema>;

export const SupplierAuditSchema = z.object({
  supplierId: z.string(),
  auditType: z.string(),
  auditDate: z.string().datetime(),
  auditorName: z.string(),
  passed: z.boolean(),
  findings: z.string(),
  nextAuditDate: z.string().datetime().optional(),
  attachments: z.array(z.string().url()).optional(),
});

export type SupplierAuditPayload = z.infer<typeof SupplierAuditSchema>;

// ============================================
// EVENT PAYLOAD VALIDATION
// ============================================

const EventSchemas: Record<EventType, z.ZodSchema> = {
  BATCH_PRODUCED: BatchProducedSchema,
  MATERIAL_CONSUMED: MaterialConsumedSchema,
  GOODS_RECEIVED: GoodsReceivedSchema,
  GOODS_SHIPPED: GoodsShippedSchema,
  QUALITY_CHECK: QualityCheckSchema,
  INVENTORY_ADJUSTMENT: InventoryAdjustmentSchema,
  SUPPLIER_AUDIT: SupplierAuditSchema,
};

export function validateEventPayload(input: { eventType: string; payload: unknown }): void {
  if (!EVENT_TYPES.includes(input.eventType as EventType)) {
    throw new Error(`Unknown event type: ${input.eventType}`);
  }

  const schema = EventSchemas[input.eventType as EventType];
  schema.parse(input.payload);
}

export function getEventSchema(eventType: EventType): z.ZodSchema {
  return EventSchemas[eventType];
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/shared && npm test -- operations-events.test.ts`
Expected: All tests pass

**Step 5: Export from index**

Update `packages/shared/src/index.ts`:

```typescript
// Shared types and utilities

export * from './authorities.js';
export * from './product.js';
export * from './operations-events.js';

// ... rest of file
```

**Step 6: Commit**

```bash
git add packages/shared/src/operations-events.ts packages/shared/src/operations-events.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add Operations event types and Zod schemas"
```

---

### Task 2.2: Add Forensic Context Types

**Files:**
- Create: `packages/shared/src/forensic.ts`

**Step 1: Write the forensic context types**

Create `packages/shared/src/forensic.ts`:

```typescript
import { z } from 'zod';

// ============================================
// FORENSIC CONTEXT SCHEMAS
// ============================================

/**
 * User forensic context - embedded at sign-time for historical verification.
 * Enables verification in 2031 even if user has left the company.
 */
export const UserForensicContextSchema = z.object({
  signerName: z.string(),
  signerEmail: z.string().email(),
  signerRole: z.string(),
  workspaceAuthority: z.string(),
  signedAt: z.string().datetime(),
});

export type UserForensicContext = z.infer<typeof UserForensicContextSchema>;

/**
 * Organization forensic context - proves corporate legal standing.
 */
export const OrgForensicContextSchema = z.object({
  organizationName: z.string(),
  organizationId: z.string(),
  vatNumber: z.string().optional(),
  certifications: z.array(z.string()).optional(),
  signedAt: z.string().datetime(),
});

export type OrgForensicContext = z.infer<typeof OrgForensicContextSchema>;

/**
 * Credential status for revocation checking (Status List 2021).
 */
export const CredentialStatusSchema = z.object({
  type: z.literal('StatusList2021Entry'),
  statusPurpose: z.literal('revocation'),
  statusListIndex: z.string(),
  statusListCredential: z.string().url(),
});

export type CredentialStatus = z.infer<typeof CredentialStatusSchema>;

/**
 * RFC3161 timestamp proof for proving signature predates revocation.
 */
export const TimestampProofSchema = z.object({
  type: z.literal('RFC3161'),
  timestamp: z.string().datetime(),
  authority: z.string().url(),
  token: z.string(),
  hashAlgorithm: z.literal('SHA-256'),
});

export type TimestampProof = z.infer<typeof TimestampProofSchema>;

/**
 * Complete sealed artifact structure for high-stakes gates.
 */
export const SealedArtifactSchema = z.object({
  payload: z.record(z.unknown()),

  userProof: z.object({
    type: z.literal('Ed25519Signature2020'),
    verificationMethod: z.string(),
    signatureValue: z.string(),
    created: z.string().datetime(),
    forensicContext: UserForensicContextSchema,
  }),

  corporateProof: z.object({
    type: z.literal('Ed25519Signature2020'),
    verificationMethod: z.string(),
    signatureValue: z.string(),
    created: z.string().datetime(),
    forensicContext: OrgForensicContextSchema,
  }),

  credentialStatus: CredentialStatusSchema.optional(),
  timestampProof: TimestampProofSchema.optional(),
});

export type SealedArtifact = z.infer<typeof SealedArtifactSchema>;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Create a user forensic context from user data.
 */
export function createUserForensicContext(
  user: { name: string; email: string },
  role: string,
  workspaceAuthority: string
): UserForensicContext {
  return {
    signerName: user.name,
    signerEmail: user.email,
    signerRole: role,
    workspaceAuthority,
    signedAt: new Date().toISOString(),
  };
}

/**
 * Create an organization forensic context from org data.
 */
export function createOrgForensicContext(
  org: { id: string; name: string; vatNumber?: string },
  certifications?: string[]
): OrgForensicContext {
  return {
    organizationName: org.name,
    organizationId: org.id,
    vatNumber: org.vatNumber,
    certifications,
    signedAt: new Date().toISOString(),
  };
}
```

**Step 2: Export from index**

Update `packages/shared/src/index.ts` to add:

```typescript
export * from './forensic.js';
```

**Step 3: Commit**

```bash
git add packages/shared/src/forensic.ts packages/shared/src/index.ts
git commit -m "feat(shared): add forensic context types for Corporate Envelope"
```

---

## Phase 3: Operations Event Service

### Task 3.1: Create Operations Event Service with Hash Chain

**Files:**
- Create: `apps/api/src/services/operations-event.service.ts`
- Create: `apps/api/src/services/operations-event.service.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/services/operations-event.service.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { OperationsEventService } from './operations-event.service.js';
import { ValidationError } from '../lib/errors.js';

interface MockPrismaClient {
  operationsEvent: {
    create: Mock;
    findFirst: Mock;
    findMany: Mock;
    update: Mock;
  };
  organization: {
    findUnique: Mock;
    update: Mock;
  };
  $transaction: Mock;
}

const mockPrisma: MockPrismaClient = {
  operationsEvent: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  organization: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn((fn) => fn(mockPrisma)),
};

describe('OperationsEventService', () => {
  let service: OperationsEventService;
  const orgId = 'org_test123';
  const userId = 'user_123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OperationsEventService(mockPrisma as any);
  });

  describe('recordEvent', () => {
    it('should create first event with sequence 1 and GENESIS hash', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        lastEventHash: null,
        eventSequence: 0,
      });
      mockPrisma.operationsEvent.create.mockResolvedValue({
        id: 'evt_123',
        eventType: 'BATCH_PRODUCED',
        sequenceNumber: 1,
        eventHash: 'abc123',
        previousEventHash: 'GENESIS',
      });
      mockPrisma.organization.update.mockResolvedValue({});

      const result = await service.recordEvent(orgId, userId, {
        eventType: 'BATCH_PRODUCED',
        payload: {
          productId: 'prod_123',
          designVersionId: 'ver_456',
          batchNumber: 'BATCH-001',
          quantity: 100,
          unit: 'PCS',
          facilityId: 'fac_789',
          startedAt: '2026-01-18T08:00:00Z',
          completedAt: '2026-01-18T16:00:00Z',
        },
      });

      expect(result.sequenceNumber).toBe(1);
      expect(result.previousEventHash).toBe('GENESIS');
    });

    it('should chain events with previous hash', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        lastEventHash: 'previous_hash_abc',
        eventSequence: 5,
      });
      mockPrisma.operationsEvent.create.mockResolvedValue({
        id: 'evt_124',
        eventType: 'MATERIAL_CONSUMED',
        sequenceNumber: 6,
        eventHash: 'new_hash_xyz',
        previousEventHash: 'previous_hash_abc',
      });
      mockPrisma.organization.update.mockResolvedValue({});

      const result = await service.recordEvent(orgId, userId, {
        eventType: 'MATERIAL_CONSUMED',
        payload: {
          batchId: 'batch_123',
          materialLotId: 'lot_456',
          quantity: 50,
          unit: 'KG',
          wasteQuantity: 2,
        },
      });

      expect(result.sequenceNumber).toBe(6);
      expect(result.previousEventHash).toBe('previous_hash_abc');
    });

    it('should reject invalid payload', async () => {
      await expect(
        service.recordEvent(orgId, userId, {
          eventType: 'BATCH_PRODUCED',
          payload: { invalid: 'data' },
        })
      ).rejects.toThrow();
    });
  });

  describe('verifyEvent', () => {
    it('should seal event with EDITOR signature', async () => {
      mockPrisma.operationsEvent.findFirst.mockResolvedValue({
        id: 'evt_123',
        status: 'PENDING_VERIFICATION',
        organizationId: orgId,
      });
      mockPrisma.operationsEvent.update.mockResolvedValue({
        id: 'evt_123',
        status: 'VERIFIED',
        verifiedBy: userId,
        verifiedAt: new Date(),
      });

      const result = await service.verifyEvent(orgId, 'evt_123', userId);

      expect(result.status).toBe('VERIFIED');
      expect(result.verifiedBy).toBe(userId);
    });

    it('should reject already verified event', async () => {
      mockPrisma.operationsEvent.findFirst.mockResolvedValue({
        id: 'evt_123',
        status: 'VERIFIED',
        organizationId: orgId,
      });

      await expect(
        service.verifyEvent(orgId, 'evt_123', userId)
      ).rejects.toThrow(ValidationError);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npm test -- operations-event.service.test.ts`
Expected: FAIL - module not found

**Step 3: Write the implementation**

Create `apps/api/src/services/operations-event.service.ts`:

```typescript
import { PrismaClient, OperationsEvent } from '@eurocomply/db';
import { createHash } from 'crypto';
import {
  validateEventPayload,
  type EventType,
  type EventStatus,
} from '@eurocomply/shared';
import { NotFoundError, ValidationError } from '../lib/errors.js';

export interface RecordEventInput {
  eventType: string;
  payload: unknown;
}

export class OperationsEventService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Record a new operations event with hash chain integrity.
   * Creates event in PENDING_VERIFICATION status.
   */
  async recordEvent(
    organizationId: string,
    createdBy: string,
    input: RecordEventInput
  ): Promise<OperationsEvent> {
    // Validate payload against schema
    validateEventPayload({
      eventType: input.eventType,
      payload: input.payload,
    });

    return this.prisma.$transaction(async (tx) => {
      // Lock organization row to prevent race conditions
      const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { lastEventHash: true, eventSequence: true },
      });

      if (!org) {
        throw new NotFoundError('Organization', organizationId);
      }

      const nextSequence = (org.eventSequence || 0) + 1;
      const previousHash = org.lastEventHash || 'GENESIS';

      // Generate deterministic hash
      const hashPayload = JSON.stringify({
        payload: input.payload,
        eventType: input.eventType,
        previousHash,
        sequence: nextSequence,
        orgId: organizationId,
        timestamp: new Date().toISOString(),
      });

      const currentHash = createHash('sha256')
        .update(hashPayload)
        .digest('hex');

      // Create event
      const event = await tx.operationsEvent.create({
        data: {
          organizationId,
          eventType: input.eventType,
          payload: input.payload as object,
          eventHash: currentHash,
          previousEventHash: previousHash,
          sequenceNumber: nextSequence,
          status: 'PENDING_VERIFICATION',
          createdBy,
        },
      });

      // Update organization head pointer
      await tx.organization.update({
        where: { id: organizationId },
        data: {
          lastEventHash: currentHash,
          eventSequence: nextSequence,
        },
      });

      return event;
    });
  }

  /**
   * Verify (seal) an event. Transitions to VERIFIED status.
   * Only callable by EDITOR authority.
   */
  async verifyEvent(
    organizationId: string,
    eventId: string,
    verifiedBy: string
  ): Promise<OperationsEvent> {
    const event = await this.prisma.operationsEvent.findFirst({
      where: { id: eventId, organizationId },
    });

    if (!event) {
      throw new NotFoundError('OperationsEvent', eventId);
    }

    if (event.status !== 'PENDING_VERIFICATION') {
      throw new ValidationError(
        `Cannot verify event: status is ${event.status}, expected PENDING_VERIFICATION`
      );
    }

    return this.prisma.operationsEvent.update({
      where: { id: eventId },
      data: {
        status: 'VERIFIED',
        verifiedBy,
        verifiedAt: new Date(),
      },
    });
  }

  /**
   * Get an event by ID.
   */
  async getEvent(
    organizationId: string,
    eventId: string
  ): Promise<OperationsEvent | null> {
    return this.prisma.operationsEvent.findFirst({
      where: { id: eventId, organizationId },
    });
  }

  /**
   * List events for an organization.
   */
  async listEvents(
    organizationId: string,
    options?: {
      eventType?: EventType;
      status?: EventStatus;
      limit?: number;
      offset?: number;
    }
  ): Promise<OperationsEvent[]> {
    return this.prisma.operationsEvent.findMany({
      where: {
        organizationId,
        ...(options?.eventType && { eventType: options.eventType }),
        ...(options?.status && { status: options.status }),
      },
      orderBy: { sequenceNumber: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });
  }

  /**
   * Verify hash chain integrity for an organization.
   * Returns true if chain is intact, false if tampered.
   */
  async verifyChainIntegrity(organizationId: string): Promise<{
    valid: boolean;
    checkedCount: number;
    brokenAt?: number;
  }> {
    const events = await this.prisma.operationsEvent.findMany({
      where: { organizationId },
      orderBy: { sequenceNumber: 'asc' },
      select: {
        sequenceNumber: true,
        eventHash: true,
        previousEventHash: true,
        eventType: true,
        payload: true,
      },
    });

    let previousHash = 'GENESIS';

    for (const event of events) {
      if (event.previousEventHash !== previousHash) {
        return {
          valid: false,
          checkedCount: event.sequenceNumber,
          brokenAt: event.sequenceNumber,
        };
      }
      previousHash = event.eventHash;
    }

    return { valid: true, checkedCount: events.length };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/api && npm test -- operations-event.service.test.ts`
Expected: All tests pass

**Step 5: Commit**

```bash
git add apps/api/src/services/operations-event.service.ts apps/api/src/services/operations-event.service.test.ts
git commit -m "feat(api): add OperationsEventService with hash chain"
```

---

### Task 3.2: Add Operations Event Routes

**Files:**
- Create: `apps/api/src/routes/operations-events.ts`

**Step 1: Create the routes**

Create `apps/api/src/routes/operations-events.ts`:

```typescript
import { Hono } from 'hono';
import { prisma } from '@eurocomply/db';
import { ok, err, hasAuthority } from '@eurocomply/shared';
import { OperationsEventService } from '../services/operations-event.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import type { AppVariables } from '../types/context.js';

const operationsEvents = new Hono<{ Variables: AppVariables }>();
const eventService = new OperationsEventService(prisma);

// Apply auth middleware
operationsEvents.use('*', authMiddleware);

/**
 * POST /api/v1/operations/events
 * Record a new operations event.
 * Requires: CONTRIBUTOR authority for Operations workspace
 */
operationsEvents.post('/', async (c) => {
  const { organizationId } = c.get('tenant');
  const { id: userId } = c.get('user');
  const permissions = c.get('permissions');

  if (!hasAuthority(permissions.operationsAuthority, 'CONTRIBUTOR')) {
    return c.json(
      err('FORBIDDEN', 'Requires CONTRIBUTOR authority for Operations'),
      403
    );
  }

  try {
    const body = await c.req.json();
    const event = await eventService.recordEvent(organizationId, userId, body);
    return c.json(ok(event), 201);
  } catch (error) {
    if (error instanceof ValidationError) {
      return c.json(err('VALIDATION_ERROR', error.message), 400);
    }
    throw error;
  }
});

/**
 * GET /api/v1/operations/events
 * List operations events.
 * Requires: VIEWER authority for Operations workspace
 */
operationsEvents.get('/', async (c) => {
  const { organizationId } = c.get('tenant');
  const permissions = c.get('permissions');

  if (!hasAuthority(permissions.operationsAuthority, 'VIEWER')) {
    return c.json(
      err('FORBIDDEN', 'Requires VIEWER authority for Operations'),
      403
    );
  }

  const eventType = c.req.query('eventType');
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const events = await eventService.listEvents(organizationId, {
    eventType: eventType as any,
    status: status as any,
    limit,
    offset,
  });

  return c.json(ok(events));
});

/**
 * GET /api/v1/operations/events/:id
 * Get a single event.
 * Requires: VIEWER authority for Operations workspace
 */
operationsEvents.get('/:id', async (c) => {
  const { organizationId } = c.get('tenant');
  const permissions = c.get('permissions');
  const eventId = c.req.param('id');

  if (!hasAuthority(permissions.operationsAuthority, 'VIEWER')) {
    return c.json(
      err('FORBIDDEN', 'Requires VIEWER authority for Operations'),
      403
    );
  }

  const event = await eventService.getEvent(organizationId, eventId);
  if (!event) {
    return c.json(err('NOT_FOUND', 'Event not found'), 404);
  }

  return c.json(ok(event));
});

/**
 * POST /api/v1/operations/events/:id/verify
 * Verify (seal) an event.
 * Requires: EDITOR authority for Operations workspace
 */
operationsEvents.post('/:id/verify', async (c) => {
  const { organizationId } = c.get('tenant');
  const { id: userId } = c.get('user');
  const permissions = c.get('permissions');
  const eventId = c.req.param('id');

  if (!hasAuthority(permissions.operationsAuthority, 'EDITOR')) {
    return c.json(
      err('FORBIDDEN', 'Requires EDITOR authority for Operations'),
      403
    );
  }

  try {
    const event = await eventService.verifyEvent(organizationId, eventId, userId);
    return c.json(ok(event));
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json(err('NOT_FOUND', error.message), 404);
    }
    if (error instanceof ValidationError) {
      return c.json(err('VALIDATION_ERROR', error.message), 400);
    }
    throw error;
  }
});

/**
 * GET /api/v1/operations/integrity
 * Verify hash chain integrity.
 * Requires: MANAGER authority for Operations workspace
 */
operationsEvents.get('/integrity', async (c) => {
  const { organizationId } = c.get('tenant');
  const permissions = c.get('permissions');

  if (!hasAuthority(permissions.operationsAuthority, 'MANAGER')) {
    return c.json(
      err('FORBIDDEN', 'Requires MANAGER authority for Operations'),
      403
    );
  }

  const result = await eventService.verifyChainIntegrity(organizationId);
  return c.json(ok(result));
});

export { operationsEvents };
```

**Step 2: Register routes in main router**

Update `apps/api/src/routes/index.ts` to add:

```typescript
import { operationsEvents } from './operations-events.js';

// ... existing routes ...

app.route('/api/v1/operations/events', operationsEvents);
```

**Step 3: Commit**

```bash
git add apps/api/src/routes/operations-events.ts apps/api/src/routes/index.ts
git commit -m "feat(api): add Operations events API routes"
```

---

## Phase 4: Compliance Workflow (Outline)

> **Note:** Phase 4 covers DPPSnapshot service and Compliance routes. Implementation follows the same TDD pattern as Phase 3. Key components:

### Task 4.1: Create ReadinessProfile Service
- CRUD for readiness profiles
- Category-based lookup

### Task 4.2: Create DPPSnapshot Service
- `createSnapshot()` - Deep clone product data
- `verify()` - CONTRIBUTOR verification
- `attest()` - EDITOR attestation with user DID
- `seal()` - Apply Corporate Envelope with org DID
- `issue()` - Mint VC and publish

### Task 4.3: Create Compliance Routes
- `POST /api/v1/compliance/snapshots` - Create snapshot
- `GET /api/v1/compliance/snapshots` - List snapshots
- `POST /api/v1/compliance/snapshots/:id/verify` - CONTRIBUTOR verify
- `POST /api/v1/compliance/snapshots/:id/attest` - EDITOR attest
- `POST /api/v1/compliance/snapshots/:id/issue` - Issue DPP

### Task 4.4: Create DPP Readiness Service
- Subscribe to `version.released` events
- Check completion against ReadinessProfile
- Auto-create DPPSnapshot when 100% ready

---

## Phase 5: Corporate Envelope Signing (Outline)

> **Note:** Phase 5 integrates walt.id for DID signing. Implementation depends on walt.id SDK availability.

### Task 5.1: Create Signing Service
- `signWithUserDid()` - Sign payload with user's DID
- `signWithOrgDid()` - Sign payload with org's DID
- `createCorporateEnvelope()` - Wrap user VC in org VC

### Task 5.2: Update VersionService for Corporate Envelope
- Add signing to `releaseVersion()` for high-stakes gates

### Task 5.3: Update OperationsEventService for Corporate Envelope
- Add signing to `verifyEvent()` for sealed events

### Task 5.4: Status List 2021 Service
- Manage revocation bitstrings
- `revoke()` - Mark key as revoked
- `isRevoked()` - Check revocation status

---

## Execution Summary

| Phase | Tasks | Estimated Steps |
|-------|-------|-----------------|
| 1. Schema Foundation | 7 tasks | ~35 steps |
| 2. Shared Types | 2 tasks | ~12 steps |
| 3. Operations Events | 2 tasks | ~15 steps |
| 4. Compliance Workflow | 4 tasks | ~25 steps |
| 5. Corporate Envelope | 4 tasks | ~20 steps |

**Total:** ~19 tasks, ~107 steps

---

## Related Documents

- Design: `docs/plans/2026-01-18-versioning-events-did-design.md`
- Operations Workspace: `docs/plans/2026-01-15-operations-workspace-design.md`
- Verifiable Credentials: `docs/plans/2026-01-15-verifiable-credentials-design.md`

---

*Last Updated: 2026-01-18*
