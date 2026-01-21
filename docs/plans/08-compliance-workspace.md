# Compliance Workspace (DPP Snapshot Engine)

**Status:** Active
**Last Updated:** 2026-01-21

---

## 1. Overview

The Compliance Workspace is the **convergence point** where Design, Marketing, and Operations unite to "mint" the Digital Product Passport. It implements the "Birth Certificate" model - treating each DPP as a permanent, immutable record of a product's identity and provenance.

### Core Principles

| Principle | Implementation |
|-----------|----------------|
| **Birth Certificate** | DPP URI reserved at serial creation; data frozen at batch release |
| **Snapshot Immutability** | Once sealed, the DPP data never changes (no live lookups) |
| **Progressive Disclosure** | Same URL serves consumers (Story) and auditors (Evidence) |
| **Proof Ceremony** | Verification is a ritual that builds trust through perceived rigor |
| **Offline-First** | Client-side verification works without network connectivity |

### Ownership

| Owns | Description |
|------|-------------|
| DPP Snapshots | Frozen bundles of Design + Marketing + Operations data |
| Public Landing Pages | Consumer-facing "Transparency Funnel" UI |
| Verification Engine | Cryptographic proof ceremony and API |
| Revocation Registry | Recall/decommission status tracking |
| GS1 Digital Link Resolver | Smart routing based on audience |

### Workspace Convergence

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WORKSPACE CONVERGENCE MODEL                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│  │   DESIGN    │     │  MARKETING  │     │ OPERATIONS  │                   │
│  │   (PLM)     │     │    (PIM)    │     │  (EVIDENCE) │                   │
│  │             │     │             │     │             │                   │
│  │  • BOM      │     │  • Story    │     │  • Notary   │                   │
│  │  • Specs    │     │  • Images   │     │  • GPS      │                   │
│  │  • Version  │     │  • Locale   │     │  • Certs    │                   │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘                   │
│         │                   │                   │                           │
│         └───────────────────┼───────────────────┘                           │
│                             │                                               │
│                             ▼                                               │
│              ┌─────────────────────────────┐                               │
│              │     COMPLIANCE WORKSPACE     │                               │
│              │    (DPP Snapshot Engine)     │                               │
│              │                              │                               │
│              │  • Gather from 3 workspaces  │                               │
│              │  • Bundle into frozen JSONB  │                               │
│              │  • Seal with Brand's DID     │                               │
│              │  • Serve via Digital Link    │                               │
│              └──────────────┬───────────────┘                               │
│                             │                                               │
│                             ▼                                               │
│              ┌─────────────────────────────┐                               │
│              │    PUBLIC LANDING PAGE       │                               │
│              │   (Transparency Funnel)      │                               │
│              │                              │                               │
│              │  Level 1: Brand Story        │                               │
│              │  Level 2: Journey & Materials│                               │
│              │  Level 3: Forensic Seal      │                               │
│              └─────────────────────────────┘                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Authority Model

> **Reference:** See [Security](./03-security.md) for complete RBAC model.

| Authority | Compliance Workspace Capabilities |
|-----------|----------------------------------|
| **MANAGER** | Configure snapshot rules, manage revocations, access all DPPs, **adopt templates from marketplace**, **manage readiness profiles**, **assign profiles to products**, **configure per-rule override modes** |
| **EDITOR** | View all DPPs, trigger manual re-snapshots (rare), manage recalls |
| **CONTRIBUTOR** | View DPPs for their products, download verification reports |
| **VIEWER** | Read-only access to DPP registry, **view compliance dashboard** |

> **Governance Note:** The Compliance Workspace is the **sole control center** for regulatory rule governance. Design and Operations workspaces have read-only compliance views - they can see compliance status and acknowledge deviations, but cannot change profiles or rule configurations.

**Note:** Most Compliance Workspace operations are automated. Human intervention is rare and typically limited to recall management.

---

## 3. DPP Lifecycle State Machine

### The Birth Certificate Model

If we wait for "Batch Release" or "On-Demand" triggers, we create a production bottleneck. A worker on an assembly line cannot wait for a compliance manager in a different timezone to "approve a minting" before applying a physical label.

**Solution: Reserve Early, Freeze Late**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DPP LIFECYCLE STATE MACHINE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  COMMISSIONED ────► PROVISIONED ────► ACTIVE ────► DECOMMISSIONED           │
│       │                  │               │               │                   │
│       │                  │               │               │                   │
│       ▼                  ▼               ▼               ▼                   │
│  ┌─────────┐       ┌─────────┐     ┌─────────┐     ┌─────────┐             │
│  │ URI     │       │ Data    │     │ Public  │     │ End of  │             │
│  │Reserved │       │ Frozen  │     │ Access  │     │ Life    │             │
│  │         │       │         │     │         │     │         │             │
│  │ Empty   │       │ Full    │     │ Story   │     │ Archive │             │
│  │ Shell   │       │Snapshot │     │ Visible │     │ Only    │             │
│  └─────────┘       └─────────┘     └─────────┘     └─────────┘             │
│                                                                              │
│                          ┌─────────┐                                        │
│                          │RECALLED │ (Special State - Overlay Warning)      │
│                          └─────────┘                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### State Definitions

| State | Trigger | Physical Status | Digital Data | Public Access |
|-------|---------|-----------------|--------------|---------------|
| **COMMISSIONED** | Serial created in Operations | QR label printed/applied | Empty shell (URI only) | "Coming Soon" page |
| **PROVISIONED** | Batch released + Evidence sealed | Product in warehouse | Full frozen snapshot | "Preview" (optional) |
| **ACTIVE** | Delivery confirmed or "Sold" | In customer hands | Full snapshot | Full "Story" page |
| **RECALLED** | Quality issue in Lot/Batch | On shelf / In use | Snapshot + Warning | "RECALL NOTICE" overlay |
| **DECOMMISSIONED** | End of life / Recycled | Disposed | Archived snapshot | "Product Retired" page |

### Valid State Transitions

```typescript
const DPP_TRANSITIONS = {
  COMMISSIONED: ['PROVISIONED'],           // Batch released
  PROVISIONED: ['ACTIVE', 'RECALLED'],     // Delivered or recalled before sale
  ACTIVE: ['RECALLED', 'DECOMMISSIONED'],  // Issue found or end of life
  RECALLED: ['ACTIVE', 'DECOMMISSIONED'],  // Recall resolved or disposed
  DECOMMISSIONED: [],                      // Terminal state
};
```

### Billing Triggers

| Transition | Billing Event | Description |
|------------|---------------|-------------|
| COMMISSIONED → PROVISIONED | **Per-DPP Fee** | Charged per tier pricing, covers 10-year hosting |
| * → RECALLED | **Recall Initiation Fee** | EUR 0.001/item, minimum EUR 10 |
| RECALLED → ACTIVE | **Recall Resolution Fee** | EUR 0.0005/item, minimum EUR 5 |
| Serial Creation | None | Factory can print labels without billing |
| * → DECOMMISSIONED | None | End of life is free |

> **Reference:** See [Billing](./12-billing.md) for complete pricing.

---

## 4. Data Model (MikroORM Entities)

### 4.1 DPP Status Enum

```typescript
export enum DPPStatus {
  COMMISSIONED = 'COMMISSIONED',     // URI reserved, no data
  PROVISIONED = 'PROVISIONED',       // Data frozen, not yet public
  ACTIVE = 'ACTIVE',                 // Publicly accessible
  RECALLED = 'RECALLED',             // Warning overlay active
  DECOMMISSIONED = 'DECOMMISSIONED', // End of life
}

export enum RecallSeverity {
  SAFETY = 'SAFETY',       // Consumer safety risk
  QUALITY = 'QUALITY',     // Quality defect
  COMPLIANCE = 'COMPLIANCE', // Regulatory non-compliance
}

export enum RecallScopeType {
  SERIAL = 'SERIAL',
  BATCH = 'BATCH',
  LOT = 'LOT',
  PRODUCT = 'PRODUCT',
}
```

### 4.2 DPP Snapshot Entity

```typescript
import {
  Entity, PrimaryKey, Property, ManyToOne, Enum, Index, Unique,
} from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';

@Entity({ tableName: 'dpp_snapshot' })
@Index({ properties: ['gtin'] })
@Index({ properties: ['serialNumber'] })
@Index({ properties: ['status'] })
export class DPPSnapshot extends BaseEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv7();

  @ManyToOne(() => Organization, { onDelete: 'cascade' })
  organization!: Organization;

  @ManyToOne(() => SerialNumber, { onDelete: 'cascade' })
  @Unique()
  serial!: SerialNumber;

  // ─────────────────────────────────────────────────────────────
  // PERMANENT URI (GS1 Digital Link format)
  // ─────────────────────────────────────────────────────────────
  @Property({ length: 500, unique: true })
  dppUri!: string;

  @Property({ length: 14 })
  gtin!: string;

  @Property({ length: 50 })
  serialNumber!: string;

  // ─────────────────────────────────────────────────────────────
  // FROZEN DATA (never changes after PROVISIONED)
  // ─────────────────────────────────────────────────────────────
  @Property({ type: 'jsonb', default: '{}' })
  designData!: DesignSnapshotData;

  @Property({ type: 'jsonb', default: '{}' })
  marketingData!: MarketingSnapshotData;

  @Property({ type: 'jsonb', default: '{}' })
  operationsData!: OperationsSnapshotData;

  // ─────────────────────────────────────────────────────────────
  // INTEGRITY SEAL
  // ─────────────────────────────────────────────────────────────
  @Property({ length: 64 })
  snapshotHash!: string;

  @Property({ type: 'text' })
  issuanceJws!: string;

  @Property({ length: 255 })
  signerDid!: string;

  // ─────────────────────────────────────────────────────────────
  // RFC 3161 TIMESTAMP (via Merkle batching)
  // ─────────────────────────────────────────────────────────────
  @Property({ type: 'jsonb', nullable: true })
  timestampProof?: TimestampProofData;

  @Property({ type: 'jsonb', nullable: true })
  merkleProof?: string[]; // Path from this DPP hash to root

  @ManyToOne(() => BatchTimestamp, { nullable: true })
  batchTimestamp?: BatchTimestamp;

  // ─────────────────────────────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────────────────────────────
  @Enum({ items: () => DPPStatus, default: DPPStatus.COMMISSIONED })
  status!: DPPStatus;

  @Property()
  commissionedAt: Date = new Date();

  @Property({ nullable: true })
  provisionedAt?: Date;

  @Property({ nullable: true })
  activatedAt?: Date;

  @Property({ nullable: true })
  decommissionedAt?: Date;

  // ─────────────────────────────────────────────────────────────
  // COMPLIANCE PROFILE (Regulatory Advisor Integration)
  // See: docs/plans/13-regulatory-advisor.md
  // ─────────────────────────────────────────────────────────────
  @ManyToOne(() => ReadinessProfile, { nullable: true })
  readinessProfile?: ReadinessProfile;

  @Property({ type: 'jsonb', nullable: true })
  complianceSnapshot?: ComplianceProfileSnapshot;

  // ─────────────────────────────────────────────────────────────
  // RECALL HANDLING
  // ─────────────────────────────────────────────────────────────
  @ManyToOne(() => Recall, { nullable: true })
  recall?: Recall;

  @Property({ type: 'jsonb', nullable: true })
  recallOverlay?: RecallOverlayData;
}

// ─────────────────────────────────────────────────────────────
// FROZEN DATA TYPES
// ─────────────────────────────────────────────────────────────

interface DesignSnapshotData {
  productId: string;
  productName: string;
  versionNumber: number;
  releasedAt: string;
  category: string;
  specifications: Record<string, unknown>;
  bomSnapshot: BomLineSnapshot[];
}

interface BomLineSnapshot {
  materialName: string;
  quantity: string;
  unit: string;
  facilityId: string;
  // Trade Secret Protection: publicAlias for Level 2, real name for Level 3
  facilityPublicAlias: string;  // e.g., "Factory #42 - Portugal"
  facilityLegalName: string;    // e.g., "Fabrica de Tecidos S.A."
  facilityVat?: string;         // e.g., "PT123456789"
  facilityGln?: string;
}

interface MarketingSnapshotData {
  heroImageUrl?: string;
  locales: LocaleContentSnapshot[];
  impactBadges: ImpactBadge[];
}

interface LocaleContentSnapshot {
  locale: string;
  productName: string;
  tagline?: string;
  description: string;
  // Industry-agnostic: All marketing attributes from taxonomy
  // Examples: features[], allergens[], nutritionalFacts{}, sustainabilityClaims[]
  attributes: Record<string, unknown>;
}

/**
 * Facility snapshot with SELECTIVE DISCLOSURE support.
 *
 * Trade Secret Protection (EU Directive 2016/943):
 * - Level 2 (Public): Shows publicAlias only ("Factory #42 - Portugal")
 * - Level 3 (Customs/Auditors): Shows full legal identity with VAT
 */
interface FacilitySnapshot {
  id: string;
  publicAlias: string;          // "Factory #42 - Portugal" (Level 2)
  legalName: string;            // "Fabrica de Tecidos S.A." (Level 3 only)
  vatNumber?: string;           // "PT123456789" (Level 3 only)
  gln?: string;
  coordinates?: { lat: number; lng: number };
  countryCode: string;
}

interface OperationsSnapshotData {
  // Core Pillars - universal across all industries
  serialNumber: string;
  epc: string;
  originFacility: FacilitySnapshot;
  notaryChainSummary: NotaryChainSummary;
  certifications: CertificationSnapshot[];
  // Industry-agnostic: All operational metrics from taxonomy
  // Examples: batchNumber, lotNumber, productionDate, expiryDate, harvestDate
  metrics: Record<string, unknown>;
}

interface NotaryChainSummary {
  eventCount: number;
  firstEvent: string;
  lastEvent: string;
  chainHash: string;
  allSignaturesValid: boolean;
}

interface TimestampProofData {
  merkleRoot: string;
  tsaToken: string; // Base64
  tsaAuthority: string;
  tsaTimestamp: string;
}

interface RecallOverlayData {
  recallId: string;
  reason: string;
  severity: RecallSeverity;
  consumerAction: string;
  recalledAt: string;
  issuedBy: string;
}

// ─────────────────────────────────────────────────────────────
// COMPLIANCE PROFILE SNAPSHOT (Regulatory Advisor)
// Frozen at DPP provisioning for forensic audit trail
// ─────────────────────────────────────────────────────────────

interface ComplianceProfileSnapshot {
  profileId: string;
  profileName: string;           // "EU Market Entry - ESPR"
  profileVersion: string;        // "v2.3"
  evaluatedAt: string;           // ISO timestamp

  // Overall compliance status
  overallStatus: 'PASS' | 'PASS_WITH_WARNINGS' | 'PASS_WITH_DEVIATIONS';

  // Summary counts
  ruleCount: number;
  passCount: number;
  warningCount: number;
  blockerCount: number;          // Should be 0 if PASS_WITH_DEVIATIONS

  // All deviations must be documented to reach PROVISIONED
  deviations: DeviationSnapshot[];

  // Full rule evaluation results for forensic audit
  ruleEvaluations: RuleEvaluationSnapshot[];
}

interface DeviationSnapshot {
  ruleId: string;
  ruleName: string;
  severity: 'BLOCKER' | 'WARNING';
  reasonCodeId: string;
  reasonLabel: string;
  narrative: string;
  acknowledgedBy: string;        // User ID
  acknowledgedAt: string;        // ISO timestamp
  regulationReference?: string;  // "ESPR Art. 5(2)"
}

interface RuleEvaluationSnapshot {
  ruleId: string;
  ruleName: string;
  ruleCategory: string;
  severity: 'BLOCKER' | 'WARNING' | 'INFO';
  status: 'PASS' | 'FAIL' | 'SKIPPED' | 'DISABLED';
  actualValue?: string;
  expectedValue?: string;
  regulationAnchorId?: string;
  legalReference?: string;

  // Per-rule enforcement mode at evaluation time
  // Resolved from: ReadinessProfileRule.overrideMode → Organization.enforcementMode
  effectiveMode: 'ENFORCING' | 'SILENT' | 'DISABLED';
}
```

### 4.3 DPP Transition (Audit Log)

```typescript
@Entity({ tableName: 'dpp_transition' })
@Index({ properties: ['dppSnapshot'] })
export class DPPTransition extends BaseEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv7();

  @ManyToOne(() => DPPSnapshot, { onDelete: 'cascade' })
  dppSnapshot!: DPPSnapshot;

  @Enum({ items: () => DPPStatus })
  fromStatus!: DPPStatus;

  @Enum({ items: () => DPPStatus })
  toStatus!: DPPStatus;

  @Property({ length: 50 })
  trigger!: string; // BATCH_RELEASED, DELIVERY_CONFIRMED, RECALL_ISSUED, etc.

  @Property({ length: 20 })
  triggeredBy!: 'SYSTEM' | 'USER';

  @ManyToOne(() => User, { nullable: true })
  user?: User;

  @Property({ length: 100, nullable: true })
  reasonCode?: string;

  @Property({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @Property()
  createdAt: Date = new Date();
}
```

### 4.4 Batch Timestamp (Merkle Roots)

```typescript
@Entity({ tableName: 'batch_timestamp' })
@Index({ properties: ['batch'] })
export class BatchTimestamp extends BaseEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv7();

  @ManyToOne(() => Batch, { onDelete: 'cascade' })
  batch!: Batch;

  // ─────────────────────────────────────────────────────────────
  // MERKLE TREE DATA
  // ─────────────────────────────────────────────────────────────
  @Property({ length: 64 })
  merkleRoot!: string;

  @Property()
  dppCount!: number;

  // ─────────────────────────────────────────────────────────────
  // RFC 3161 TIMESTAMP FROM TSA
  // ─────────────────────────────────────────────────────────────
  @Property({ type: 'blob' })
  tsaToken!: Buffer;

  @Property({ length: 255 })
  tsaAuthority!: string; // 'DigiCert', 'Sectigo', etc.

  @Property()
  tsaTimestamp!: Date;

  @Property({ default: false })
  verified: boolean = false;

  @Property()
  createdAt: Date = new Date();
}
```

### 4.5 Recall Entity

```typescript
@Entity({ tableName: 'recall' })
@Index({ properties: ['organization'] })
@Index({ properties: ['status'] })
export class Recall extends BaseEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv7();

  @ManyToOne(() => Organization, { onDelete: 'cascade' })
  organization!: Organization;

  // ─────────────────────────────────────────────────────────────
  // RECALL SCOPE
  // ─────────────────────────────────────────────────────────────
  @Enum({ items: () => RecallScopeType })
  scopeType!: RecallScopeType;

  @Property({ type: 'uuid' })
  scopeId!: string; // ID of affected entity (Product, Lot, Batch, Serial)

  // ─────────────────────────────────────────────────────────────
  // RECALL DETAILS
  // ─────────────────────────────────────────────────────────────
  @Property({ length: 50 })
  recallNumber!: string;

  @Enum({ items: () => RecallSeverity })
  severity!: RecallSeverity;

  @Property({ length: 255 })
  title!: string;

  @Property({ type: 'text' })
  description!: string;

  @Property({ type: 'text' })
  consumerAction!: string;

  // ─────────────────────────────────────────────────────────────
  // STATUS
  // ─────────────────────────────────────────────────────────────
  @Property({ length: 20, default: 'ACTIVE' })
  status: string = 'ACTIVE';

  @Property()
  issuedAt: Date = new Date();

  @Property({ nullable: true })
  resolvedAt?: Date;

  @ManyToOne(() => User)
  issuedBy!: User;

  @ManyToOne(() => User, { nullable: true })
  resolvedBy?: User;

  // ─────────────────────────────────────────────────────────────
  // STATISTICS (denormalized for fast queries)
  // ─────────────────────────────────────────────────────────────
  @Property({ default: 0 })
  affectedCount: number = 0;
}
```

### 4.6 Public Recall Status (Materialized View)

```typescript
// Optimized for fast public API lookups
@Entity({ tableName: 'public_recall_status' })
@Index({ properties: ['gtin', 'serialNumber'] })
export class PublicRecallStatus {
  @PrimaryKey({ length: 14 })
  gtin!: string;

  @PrimaryKey({ length: 100 })
  serialNumber!: string;

  @Property({ length: 20, default: 'CLEAR' })
  status: 'CLEAR' | 'RECALLED' | 'RESOLVED' = 'CLEAR';

  @Property({ length: 50, nullable: true })
  recallId?: string;

  @Property({ type: 'jsonb', nullable: true })
  recallData?: RecallPublicData;

  @Property()
  updatedAt: Date = new Date();
}

interface RecallPublicData {
  id: string;
  severity: RecallSeverity;
  reason: string;
  consumerAction: string;
  issuedAt: string;
}
```

---

## 5. Canonicalization (RFC 8785)

### Critical: Deterministic Hashing

**Problem:** If a single space, property order, or Unicode normalization differs between issuance and verification, the hash will NOT match.

**Solution:** Use RFC 8785 (JSON Canonicalization Scheme) for ALL hashing operations.

```typescript
import canonicalize from 'canonicalize'; // RFC 8785 implementation

/**
 * CRITICAL: Always use RFC 8785 canonicalization before hashing.
 *
 * RFC 8785 guarantees:
 * - Deterministic property ordering (lexicographic)
 * - No whitespace between tokens
 * - Consistent number formatting
 * - Consistent Unicode escaping
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8785
 */
function hashSnapshot(content: unknown): string {
  // 1. Canonicalize per RFC 8785 (deterministic JSON)
  const canonicalJson = canonicalize(content);

  if (!canonicalJson) {
    throw new Error('Canonicalization failed - content may contain unsupported types');
  }

  // 2. Hash the canonical string
  return sha256(canonicalJson);
}

// Example: Same data, different property order → SAME hash
const obj1 = { b: 2, a: 1 };
const obj2 = { a: 1, b: 2 };

canonicalize(obj1); // '{"a":1,"b":2}'
canonicalize(obj2); // '{"a":1,"b":2}'
// Both produce identical canonical form → identical hash
```

### Verification Must Use Same Canonicalization

```typescript
async function verifySnapshotIntegrity(dpp: DPPSnapshot): Promise<boolean> {
  // Reconstruct content from frozen data
  const content = {
    design: dpp.designData,
    marketing: dpp.marketingData,
    operations: dpp.operationsData,
    metadata: {
      snapshotVersion: '1.0',
      createdAt: dpp.provisionedAt?.toISOString(),
      esprCompliant: true,
    },
  };

  // CRITICAL: Use same RFC 8785 canonicalization as issuance
  const computedHash = hashSnapshot(content);

  return computedHash === dpp.snapshotHash;
}
```

---

## 6. Snapshot Engine Service

### 6.1 Pre-Flight Audit

Before a DPP transitions COMMISSIONED → PROVISIONED, the Snapshot Engine runs automated checks:

```typescript
interface PreFlightAuditResult {
  passed: boolean;
  checks: {
    design: AuditCheck[];
    marketing: AuditCheck[];
    operations: AuditCheck[];
  };
  blockers: string[];
}

interface AuditCheck {
  name: string;
  passed: boolean;
  message?: string;
}

@Injectable()
export class PreFlightAuditService {
  constructor(private readonly em: EntityManager) {}

  async runAudit(batchId: string): Promise<PreFlightAuditResult> {
    const batch = await this.em.findOneOrFail(Batch, batchId, {
      populate: ['designVersion', 'designVersion.product', 'facility'],
    });

    const checks = {
      design: await this.auditDesign(batch.designVersion),
      marketing: await this.auditMarketing(batch.designVersion),
      operations: await this.auditOperations(batch),
    };

    const blockers = [
      ...checks.design,
      ...checks.marketing,
      ...checks.operations,
    ]
      .filter(c => !c.passed)
      .map(c => c.message || c.name);

    return {
      passed: blockers.length === 0,
      checks,
      blockers,
    };
  }

  private async auditDesign(designVersion: DesignVersion): Promise<AuditCheck[]> {
    const checks: AuditCheck[] = [];

    // Check 1: Design Version is RELEASED
    checks.push({
      name: 'design_version_released',
      passed: designVersion.status === DesignVersionStatus.RELEASED,
      message: designVersion.status !== DesignVersionStatus.RELEASED
        ? `Design version status is ${designVersion.status}, expected RELEASED`
        : undefined,
    });

    // Check 2: BOM has at least one line
    const bomLines = await this.em.find(BomLine, { designVersion: designVersion.id });
    checks.push({
      name: 'bom_has_lines',
      passed: bomLines.length > 0,
      message: bomLines.length === 0 ? 'BOM has no line items' : undefined,
    });

    // Check 3: All BOM facilities are verified
    const facilityIds = [...new Set(bomLines.map(l => l.facility?.id).filter(Boolean))];
    if (facilityIds.length > 0) {
      const facilities = await this.em.find(Facility, { id: { $in: facilityIds } });
      const unverified = facilities.filter(f => f.status !== 'VERIFIED');
      checks.push({
        name: 'facilities_verified',
        passed: unverified.length === 0,
        message: unverified.length > 0
          ? `${unverified.length} facilities not verified: ${unverified.map(f => f.name).join(', ')}`
          : undefined,
      });
    }

    return checks;
  }

  private async auditMarketing(designVersion: DesignVersion): Promise<AuditCheck[]> {
    const checks: AuditCheck[] = [];

    // Check 1: Marketing Version exists
    const marketingVersion = await this.em.findOne(MarketingVersion, {
      designVersion: designVersion.id,
    });
    checks.push({
      name: 'marketing_version_exists',
      passed: !!marketingVersion,
      message: !marketingVersion ? 'No marketing version for this design version' : undefined,
    });

    if (marketingVersion) {
      // Check 2: At least one locale has content
      const contents = await this.em.find(MarketingAttributeValue, {
        marketingVersion: marketingVersion.id,
      });
      checks.push({
        name: 'has_content',
        passed: contents.length > 0,
        message: contents.length === 0 ? 'No marketing content defined' : undefined,
      });

      // Check 3: Hero image exists
      const heroImage = await this.em.findOne(MediaAsset, {
        marketingVersion: marketingVersion.id,
        role: 'HERO',
      });
      checks.push({
        name: 'hero_image_exists',
        passed: !!heroImage,
        message: !heroImage ? 'No hero image uploaded' : undefined,
      });
    }

    return checks;
  }

  private async auditOperations(batch: Batch): Promise<AuditCheck[]> {
    const checks: AuditCheck[] = [];

    // Check 1: Batch has Digital Seal
    const events = await this.em.find(OperationsEvent, { batch: batch.id });
    const hasSeal = events.some(e => e.eventType === 'BATCH_SEALED');
    checks.push({
      name: 'batch_sealed',
      passed: hasSeal,
      message: !hasSeal ? 'Batch has not been sealed (missing BATCH_SEALED event)' : undefined,
    });

    // Check 2: Origin facility has GPS (EUDR requirement)
    checks.push({
      name: 'facility_has_gps',
      passed: !!batch.facility?.coordinates,
      message: !batch.facility?.coordinates
        ? 'Origin facility missing GPS coordinates (required for EUDR)'
        : undefined,
    });

    // Check 3: All serials have EPC
    const serials = await this.em.find(SerialNumber, { batch: batch.id });
    const missingEpc = serials.filter(s => !s.epc);
    checks.push({
      name: 'serials_have_epc',
      passed: missingEpc.length === 0,
      message: missingEpc.length > 0
        ? `${missingEpc.length} serials missing EPC assignment`
        : undefined,
    });

    return checks;
  }
}
```

### 6.2 Snapshot Creation Service

```typescript
import canonicalize from 'canonicalize'; // RFC 8785

interface SnapshotResult {
  success: boolean;
  dppsCreated: number;
  dppsFailed: number;
  errors: Array<{ serialId: string; error: string }>;
}

@Injectable()
export class SnapshotEngineService {
  constructor(
    private readonly em: EntityManager,
    private readonly preFlightAudit: PreFlightAuditService,
    private readonly didService: DIDService,
    private readonly timestampService: BatchTimestampService,
  ) {}

  /**
   * Called when batch status changes to RELEASED.
   * Creates frozen DPP snapshots for all serials in the batch.
   */
  async onBatchReleased(batchId: string): Promise<SnapshotResult> {
    // 1. Run pre-flight audit
    const audit = await this.preFlightAudit.runAudit(batchId);
    if (!audit.passed) {
      throw new SnapshotBlockedError(audit.blockers);
    }

    // 2. Load batch with all required relationships
    const batch = await this.em.findOneOrFail(Batch, batchId, {
      populate: [
        'designVersion',
        'designVersion.product',
        'facility',
        'lot',
        'organization',
      ],
    });

    // 3. Gather workspace data ONCE (bulk fetch, no N+1)
    const designData = await this.gatherDesignData(batch.designVersion);
    const marketingData = await this.gatherMarketingData(batch.designVersion);
    const operationsBase = await this.gatherOperationsBaseData(batch);

    // 4. Get all serials for this batch
    const serials = await this.em.find(SerialNumber, { batch: batchId });

    // 5. Create snapshots for each serial
    const results: Array<{ serialId: string; error?: string }> = [];
    const snapshotHashes: string[] = [];

    for (const serial of serials) {
      try {
        const snapshot = await this.createSnapshot(
          serial,
          batch,
          designData,
          marketingData,
          operationsBase,
        );
        snapshotHashes.push(snapshot.snapshotHash);
        results.push({ serialId: serial.id });
      } catch (error) {
        results.push({ serialId: serial.id, error: error.message });
      }
    }

    // 6. Build Merkle tree and get RFC 3161 timestamp (batch-level)
    if (snapshotHashes.length > 0) {
      await this.timestampService.finalizeBatch(batchId, snapshotHashes);
    }

    await this.em.flush();

    return {
      success: results.every(r => !r.error),
      dppsCreated: results.filter(r => !r.error).length,
      dppsFailed: results.filter(r => r.error).length,
      errors: results.filter(r => r.error) as Array<{ serialId: string; error: string }>,
    };
  }

  private async createSnapshot(
    serial: SerialNumber,
    batch: Batch,
    designData: DesignSnapshotData,
    marketingData: MarketingSnapshotData,
    operationsBase: Omit<OperationsSnapshotData, 'serialNumber' | 'epc'>,
  ): Promise<DPPSnapshot> {
    // Complete operations data with serial-specific fields
    const operationsData: OperationsSnapshotData = {
      ...operationsBase,
      serialNumber: serial.serialNumber,
      epc: serial.epc!,
    };

    // Build snapshot content
    const snapshotContent = {
      design: designData,
      marketing: marketingData,
      operations: operationsData,
      metadata: {
        snapshotVersion: '1.0',
        createdAt: new Date().toISOString(),
        esprCompliant: true,
      },
    };

    // CRITICAL: Use RFC 8785 canonicalization before hashing
    const canonicalJson = canonicalize(snapshotContent);
    if (!canonicalJson) {
      throw new Error('Canonicalization failed');
    }
    const snapshotHash = sha256(canonicalJson);

    // Sign with organization DID
    const issuanceJws = await this.didService.signWithOrganizationDID(
      batch.organization.id,
      snapshotHash,
    );
    const signerDid = await this.didService.getOrganizationDID(batch.organization.id);

    // Create and persist snapshot
    const snapshot = this.em.create(DPPSnapshot, {
      organization: batch.organization,
      serial,
      dppUri: this.generateDigitalLinkUri(batch.organization, serial),
      gtin: batch.designVersion.product.gtin!,
      serialNumber: serial.serialNumber,
      designData,
      marketingData,
      operationsData,
      snapshotHash,
      issuanceJws,
      signerDid,
      status: DPPStatus.PROVISIONED,
      provisionedAt: new Date(),
    });

    this.em.persist(snapshot);

    // Record state transition
    this.em.persist(this.em.create(DPPTransition, {
      dppSnapshot: snapshot,
      fromStatus: DPPStatus.COMMISSIONED,
      toStatus: DPPStatus.PROVISIONED,
      trigger: 'BATCH_RELEASED',
      triggeredBy: 'SYSTEM',
    }));

    // Trigger Forensic Package generation (background worker)
    // Bundles: PDFs, HTML viewer, JSON snapshots → R2-hosted .zip
    await this.eventBus.emit('DPP_PROVISIONED', {
      dppId: snapshot.id,
      organizationId: snapshot.organization.id,
      generateForensicPackage: true,
    });

    return snapshot;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FORENSIC PACKAGE GENERATION (Background Worker)
  // Triggered after DPP is PROVISIONED for offline audit capability
  // ─────────────────────────────────────────────────────────────────────────────

  @OnEvent('DPP_PROVISIONED')
  async generateForensicPackage(payload: { dppId: string; organizationId: string }): Promise<void> {
    const dpp = await this.em.findOneOrFail(DPPSnapshot, payload.dppId, {
      populate: ['complianceSnapshot', 'readinessProfile'],
    });

    // 1. Generate self-contained HTML viewer
    const htmlViewer = await this.renderForensicViewer(dpp);

    // 2. Collect referenced regulation PDFs
    const pdfPaths = await this.collectReferencedPDFs(dpp);

    // 3. Bundle JSON snapshots (design, marketing, operations, compliance)
    const jsonBundle = {
      dpp: this.serializeSnapshot(dpp),
      verification: {
        snapshotHash: dpp.snapshotHash,
        issuanceJws: dpp.issuanceJws,
        signerDid: dpp.signerDid,
        timestampProof: dpp.timestampProof,
      },
    };

    // 4. Create ZIP archive and upload to R2
    const zipPath = await this.bundleForensicPackage({
      htmlViewer,
      pdfPaths,
      jsonBundle,
      dppUri: dpp.dppUri,
    });

    // 5. Store reference for Forensic Seal View
    dpp.forensicPackagePath = zipPath;
    dpp.forensicPackageGeneratedAt = new Date();
    await this.em.flush();
  }

  /**
   * Gather Design data with BULK FETCH (no N+1).
   */
  private async gatherDesignData(designVersion: DesignVersion): Promise<DesignSnapshotData> {
    // Bulk fetch BOM lines with facilities
    const bomLines = await this.em.find(BomLine, { designVersion: designVersion.id }, {
      populate: ['material', 'facility'],
    });

    // Bulk fetch all product attributes
    const attributes = await this.em.find(ProductAttributeValue, {
      product: designVersion.product.id,
    }, { populate: ['template'] });

    const specifications: Record<string, unknown> = {};
    for (const attr of attributes) {
      specifications[attr.template.code] = attr.value;
    }

    return {
      productId: designVersion.product.id,
      productName: designVersion.product.name,
      versionNumber: designVersion.versionNumber,
      releasedAt: designVersion.releasedAt?.toISOString() || new Date().toISOString(),
      category: designVersion.product.category || '',
      specifications,
      bomSnapshot: bomLines.map(line => ({
        materialName: line.material?.name || line.description || '',
        quantity: line.quantity.toString(),
        unit: line.unit,
        facilityId: line.facility?.id || '',
        // Trade Secret Protection: Include both public alias and legal name
        facilityPublicAlias: line.facility?.publicAlias || `Facility - ${line.facility?.countryCode}`,
        facilityLegalName: line.facility?.name || '',
        facilityVat: line.facility?.vatNumber,
        facilityGln: line.facility?.gln,
      })),
    };
  }

  /**
   * Gather Marketing data with BULK FETCH (no N+1).
   */
  private async gatherMarketingData(designVersion: DesignVersion): Promise<MarketingSnapshotData> {
    const marketingVersion = await this.em.findOne(MarketingVersion, {
      designVersion: designVersion.id,
    });

    if (!marketingVersion) {
      return { locales: [], impactBadges: [] };
    }

    // Bulk fetch all attribute values with templates
    const allAttributes = await this.em.find(MarketingAttributeValue, {
      marketingVersion: marketingVersion.id,
    }, { populate: ['template'] });

    // Group by locale
    const localeMap = new Map<string, Map<string, unknown>>();
    for (const attr of allAttributes) {
      if (!localeMap.has(attr.locale)) {
        localeMap.set(attr.locale, new Map());
      }
      localeMap.get(attr.locale)!.set(attr.template.code, attr.value);
    }

    // Build locale snapshots - industry-agnostic attribute gathering
    const locales: LocaleContentSnapshot[] = [];
    for (const [locale, attrs] of localeMap) {
      // Extract core required fields
      const productName = (attrs.get('product_name') as string) || designVersion.product.name;
      const tagline = attrs.get('tagline') as string | undefined;
      const description = (attrs.get('description') as string) || '';

      // All other attributes go into the dynamic map
      const attributes: Record<string, unknown> = {};
      for (const [key, value] of attrs) {
        if (!['product_name', 'tagline', 'description'].includes(key)) {
          attributes[key] = value;
        }
      }

      locales.push({ locale, productName, tagline, description, attributes });
    }

    // Fetch hero image
    const heroImage = await this.em.findOne(MediaAsset, {
      marketingVersion: marketingVersion.id,
      role: 'HERO',
    });

    return {
      heroImageUrl: heroImage?.cdnUrl,
      locales,
      impactBadges: [], // Calculated from design data
    };
  }

  /**
   * Gather Operations base data (batch-level, not serial-specific).
   */
  private async gatherOperationsBaseData(
    batch: Batch,
  ): Promise<Omit<OperationsSnapshotData, 'serialNumber' | 'epc'>> {
    // Fetch notary chain events
    const events = await this.em.find(OperationsEvent, { batch: batch.id }, {
      orderBy: { createdAt: 'ASC' },
    });

    // Fetch certifications from evidence package
    const evidencePackage = await this.em.findOne(EvidencePackage, { batch: batch.id });
    const certifications = evidencePackage?.pillars?.supplyChainIntegrity?.certifications || [];

    // Gather industry-agnostic operational metrics from batch
    // Examples: batchNumber, lotNumber, productionDate, expiryDate, harvestDate
    const metrics: Record<string, unknown> = {};
    if (batch.batchNumber) metrics.batchNumber = batch.batchNumber;
    if (batch.lot?.lotNumber) metrics.lotNumber = batch.lot.lotNumber;
    if (batch.productionDate) metrics.productionDate = batch.productionDate.toISOString();
    // Add any other batch-level operational attributes dynamically
    if (batch.operationalAttributes) {
      Object.assign(metrics, batch.operationalAttributes);
    }

    return {
      originFacility: {
        id: batch.facility.id,
        publicAlias: batch.facility.publicAlias || `Facility - ${batch.facility.countryCode}`,
        legalName: batch.facility.name,
        vatNumber: batch.facility.vatNumber,
        gln: batch.facility.gln,
        coordinates: batch.facility.coordinates,
        countryCode: batch.facility.countryCode,
      },
      notaryChainSummary: {
        eventCount: events.length,
        firstEvent: events[0]?.createdAt.toISOString() || '',
        lastEvent: events[events.length - 1]?.createdAt.toISOString() || '',
        chainHash: events[events.length - 1]?.chainHash || '',
        allSignaturesValid: events.every(e => e.signatureValid),
      },
      certifications,
      metrics,
    };
  }

  private generateDigitalLinkUri(org: Organization, serial: SerialNumber): string {
    const gtin = serial.batch?.designVersion?.product?.gtin;
    return `https://dpp.eurocomply.eu/01/${gtin}/21/${serial.serialNumber}`;
  }
}
```

---

## 7. Merkle Tree Timestamp Service

RFC 3161 timestamps are included for **all tiers** using Merkle tree batching.

### Cost Savings Visualization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MERKLE TREE TIMESTAMPING                                  │
│                    (99% Cost Reduction)                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WITHOUT MERKLE (Individual Timestamps)     WITH MERKLE (Batched)           │
│  ═══════════════════════════════════════    ═══════════════════════════     │
│                                                                              │
│  DPP-001 ──► TSA ──► €0.01                                                  │
│  DPP-002 ──► TSA ──► €0.01                  DPP-001 ─┐                      │
│  DPP-003 ──► TSA ──► €0.01                  DPP-002 ─┼─► [H12]              │
│  DPP-004 ──► TSA ──► €0.01                  DPP-003 ─┤        \             │
│     ...                                     DPP-004 ─┘         \            │
│  DPP-500 ──► TSA ──► €0.01                                      ├─► [ROOT]  │
│  ─────────────────────────                  DPP-005 ─┐         /    ──► TSA │
│  TOTAL: €5.00                               DPP-006 ─┼─► [H34]/       │     │
│                                                ...   ─┤               │     │
│                                             DPP-500 ─┘               €0.01  │
│                                             ─────────────────────────────   │
│                                             TOTAL: €0.01                    │
│                                                                              │
│  SAVINGS: 99.8%                                                             │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  HOW VERIFICATION WORKS:                                                    │
│  ───────────────────────                                                    │
│                                                                              │
│  1. Start with DPP-001's hash: [H1]                                         │
│                                                                              │
│                    [ROOT] ◄── RFC 3161 timestamped                          │
│                   /      \                                                   │
│              [H1234]    [H5678]                                             │
│              /    \      /    \                                              │
│          [H12]  [H34] [H56]  [H78]                                          │
│          /  \    / \   / \    / \                                           │
│        [H1][H2][H3][H4]...                                                  │
│         ▲                                                                    │
│         │                                                                    │
│    Your DPP hash                                                            │
│                                                                              │
│  2. DPP-001's Merkle proof: [H2, H34, H5678]                                │
│                                                                              │
│  3. Verification:                                                           │
│     hash(H1 + H2) → H12                                                     │
│     hash(H12 + H34) → H1234                                                 │
│     hash(H1234 + H5678) → ROOT ✓                                            │
│                                                                              │
│  4. ROOT matches TSA-signed root → DPP-001 existed at timestamp time        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Cost Comparison

| Batch Size | Individual TSA | Merkle Batched | Savings |
|------------|----------------|----------------|---------|
| 100 DPPs | EUR 1.00 | EUR 0.01 | 99% |
| 500 DPPs | EUR 5.00 | EUR 0.01 | 99.8% |
| 1,000 DPPs | EUR 10.00 | EUR 0.01 | 99.9% |
| 10,000 DPPs | EUR 100.00 | EUR 0.01 | 99.99% |

### Implementation

```typescript
@Injectable()
export class BatchTimestampService {
  constructor(
    private readonly em: EntityManager,
    private readonly tsaClient: TSAClient,
  ) {}

  /**
   * Build Merkle tree from DPP hashes and get RFC 3161 timestamp.
   */
  async finalizeBatch(batchId: string, snapshotHashes: string[]): Promise<BatchTimestampResult> {
    if (snapshotHashes.length === 0) {
      throw new Error('No hashes to timestamp');
    }

    // 1. Build Merkle tree (DETERMINISTIC: sort hashes first)
    const sortedHashes = [...snapshotHashes].sort();
    const tree = new MerkleTree(sortedHashes, sha256);
    const merkleRoot = tree.getRoot().toString('hex');

    // 2. Get RFC 3161 timestamp from TSA
    const tsaResponse = await this.tsaClient.requestTimestamp(merkleRoot, {
      authority: 'DigiCert',
      hashAlgorithm: 'SHA-256',
    });

    // 3. Create batch timestamp record
    const batch = await this.em.findOneOrFail(Batch, batchId);
    const batchTimestamp = this.em.create(BatchTimestamp, {
      batch,
      merkleRoot,
      dppCount: snapshotHashes.length,
      tsaToken: tsaResponse.token,
      tsaAuthority: tsaResponse.authority,
      tsaTimestamp: tsaResponse.timestamp,
    });
    this.em.persist(batchTimestamp);

    // 4. Compute Merkle proofs for each hash
    const hashToProof = new Map<string, string[]>();
    for (const hash of sortedHashes) {
      const proof = tree.getProof(hash).map(p => p.data.toString('hex'));
      hashToProof.set(hash, proof);
    }

    // 5. Bulk update DPPs with proofs (single query per batch)
    for (const [hash, proof] of hashToProof) {
      await this.em.nativeUpdate(DPPSnapshot, { snapshotHash: hash }, {
        batchTimestamp,
        merkleProof: proof,
        timestampProof: {
          merkleRoot,
          tsaToken: tsaResponse.token.toString('base64'),
          tsaAuthority: tsaResponse.authority,
          tsaTimestamp: tsaResponse.timestamp.toISOString(),
        },
      });
    }

    return {
      merkleRoot,
      tsaToken: tsaResponse.token,
      tsaAuthority: tsaResponse.authority,
      tsaTimestamp: tsaResponse.timestamp,
      dppProofs: hashToProof,
    };
  }
}

interface BatchTimestampResult {
  merkleRoot: string;
  tsaToken: Buffer;
  tsaAuthority: string;
  tsaTimestamp: Date;
  dppProofs: Map<string, string[]>;
}
```

---

## 8. Verification Ceremony

### 8.1 Merkle Path Verification

```typescript
import canonicalize from 'canonicalize'; // RFC 8785

interface VerificationCeremonyResult {
  verified: boolean;
  dppId: string;

  merkle: {
    contentHash: string;
    computedRoot: string;
    storedRoot: string;
    proofPath: MerkleProofStep[];
    rootMatches: boolean;
  };

  timestamp: {
    verified: boolean;
    authority: string;
    timestamp: Date;
    hashInToken: string;
    hashMatches: boolean;
    certificateChainValid: boolean;
  };

  summary: {
    status: 'VERIFIED' | 'INVALID_PROOF' | 'INVALID_TIMESTAMP' | 'TAMPERED';
    message: string;
    verifiedAt: Date;
  };

  error?: {
    code: string;
    step: 'MERKLE_PROOF' | 'TSA_VERIFICATION' | 'CERTIFICATE_CHAIN';
    details: string;
  };
}

interface MerkleProofStep {
  siblingHash: string;
  combinedHash: string;
}

@Injectable()
export class VerificationCeremonyService {
  constructor(
    private readonly em: EntityManager,
    private readonly tsaVerifier: TSAVerifier,
  ) {}

  async verifyTimestamp(dppId: string): Promise<VerificationCeremonyResult> {
    // 1. Load DPP and its proof data
    const dpp = await this.em.findOneOrFail(DPPSnapshot, dppId, {
      populate: ['batchTimestamp'],
    });

    if (!dpp.timestampProof) {
      throw new Error('DPP not yet timestamped');
    }

    // 2. Re-verify content hash (using RFC 8785 canonicalization)
    const content = {
      design: dpp.designData,
      marketing: dpp.marketingData,
      operations: dpp.operationsData,
      metadata: {
        snapshotVersion: '1.0',
        createdAt: dpp.provisionedAt?.toISOString(),
        esprCompliant: true,
      },
    };
    const canonicalJson = canonicalize(content);
    const recomputedContentHash = sha256(canonicalJson!);

    if (recomputedContentHash !== dpp.snapshotHash) {
      return this.buildTamperedResult(dpp, recomputedContentHash);
    }

    // 3. Walk the Merkle path (deterministic sorting)
    const proofSteps: MerkleProofStep[] = [];
    let currentHash = dpp.snapshotHash;

    for (const siblingHash of dpp.merkleProof || []) {
      // DETERMINISTIC: Sort hashes lexicographically before concatenating
      const combined = currentHash < siblingHash
        ? sha256(currentHash + siblingHash)
        : sha256(siblingHash + currentHash);

      proofSteps.push({
        siblingHash,
        combinedHash: combined,
      });

      currentHash = combined;
    }

    const computedRoot = currentHash;
    const storedRoot = dpp.timestampProof.merkleRoot;
    const rootMatches = computedRoot === storedRoot;

    // 4. Verify TSA token
    const tsaVerification = await this.tsaVerifier.verifyRFC3161Token(
      dpp.timestampProof.tsaToken,
      storedRoot,
    );

    // 5. Build result
    const verified = rootMatches &&
                     tsaVerification.valid &&
                     tsaVerification.hashMatches;

    return {
      verified,
      dppId,

      merkle: {
        contentHash: dpp.snapshotHash,
        computedRoot,
        storedRoot,
        proofPath: proofSteps,
        rootMatches,
      },

      timestamp: {
        verified: tsaVerification.valid,
        authority: tsaVerification.authority,
        timestamp: tsaVerification.timestamp,
        hashInToken: tsaVerification.hash,
        hashMatches: tsaVerification.hash === storedRoot,
        certificateChainValid: tsaVerification.chainValid,
      },

      summary: this.buildSummary(verified, rootMatches, tsaVerification),
      error: verified ? undefined : this.buildError(rootMatches, tsaVerification),
    };
  }

  private buildTamperedResult(dpp: DPPSnapshot, recomputedHash: string): VerificationCeremonyResult {
    return {
      verified: false,
      dppId: dpp.id,
      merkle: {
        contentHash: dpp.snapshotHash,
        computedRoot: '',
        storedRoot: dpp.timestampProof?.merkleRoot || '',
        proofPath: [],
        rootMatches: false,
      },
      timestamp: {
        verified: false,
        authority: '',
        timestamp: new Date(),
        hashInToken: '',
        hashMatches: false,
        certificateChainValid: false,
      },
      summary: {
        status: 'TAMPERED',
        message: `Content hash mismatch. Stored: ${dpp.snapshotHash}, Computed: ${recomputedHash}`,
        verifiedAt: new Date(),
      },
      error: {
        code: 'CONTENT_HASH_MISMATCH',
        step: 'MERKLE_PROOF',
        details: 'The DPP content has been modified after sealing',
      },
    };
  }

  private buildSummary(
    verified: boolean,
    rootMatches: boolean,
    tsa: TSAVerificationResult,
  ): VerificationCeremonyResult['summary'] {
    if (verified) {
      return {
        status: 'VERIFIED',
        message: `This DPP was cryptographically timestamped on ${tsa.timestamp.toISOString()} by ${tsa.authority}`,
        verifiedAt: new Date(),
      };
    }

    if (!rootMatches) {
      return {
        status: 'TAMPERED',
        message: 'Data may have been modified after timestamping',
        verifiedAt: new Date(),
      };
    }

    if (!tsa.valid) {
      return {
        status: 'INVALID_TIMESTAMP',
        message: 'Timestamp token verification failed',
        verifiedAt: new Date(),
      };
    }

    return {
      status: 'INVALID_PROOF',
      message: 'Merkle proof verification failed',
      verifiedAt: new Date(),
    };
  }

  private buildError(
    rootMatches: boolean,
    tsa: TSAVerificationResult,
  ): VerificationCeremonyResult['error'] {
    if (!rootMatches) {
      return {
        code: 'ROOT_MISMATCH',
        step: 'MERKLE_PROOF',
        details: 'Computed Merkle root does not match stored root',
      };
    }

    if (!tsa.chainValid) {
      return {
        code: 'INVALID_CERTIFICATE_CHAIN',
        step: 'CERTIFICATE_CHAIN',
        details: 'TSA certificate chain validation failed',
      };
    }

    return {
      code: 'INVALID_SIGNATURE',
      step: 'TSA_VERIFICATION',
      details: 'TSA token signature verification failed',
    };
  }
}
```

### 8.2 Client-Side Verification (Offline-First)

```typescript
// Embedded in the public page - works without network
async function verifyMerkleProof(
  contentHash: string,
  proof: string[],
  rootHash: string,
): Promise<boolean> {
  let currentHash = contentHash;

  for (const siblingHash of proof) {
    // DETERMINISTIC: Sort and concatenate
    const combined = currentHash < siblingHash
      ? currentHash + siblingHash
      : siblingHash + currentHash;

    currentHash = sha256(combined);
  }

  // If calculated root matches sealed root, the data is authentic
  return currentHash === rootHash;
}
```

---

## 9. Public Landing Page (Transparency Funnel)

### Progressive Disclosure with Trade Secret Protection

| Level | Target Audience | Facility Display | Content |
|-------|-----------------|------------------|---------|
| **Level 1: Brand Story** | Average Consumer | N/A | Hero image, tagline, impact badges |
| **Level 2: Journey** | Conscious Consumer | `publicAlias` only | "Factory #42 - Portugal" |
| **Level 3: Forensic Seal** | Auditors, Customs | Full legal identity | "Fabrica de Tecidos S.A. - VAT: PT123456" |

### Trade Secret Protection (EU Directive 2016/943)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SELECTIVE DISCLOSURE BY AUDIENCE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LEVEL 2 (Public - Consumer Scan)                                           │
│  ════════════════════════════════                                            │
│                                                                              │
│  Supply Chain Journey:                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                                                                       │   │
│  │   [India] ──────────► [Portugal] ──────────► [Germany]               │   │
│  │   Factory #12         Factory #42            Factory #7               │   │
│  │   Cotton Farm         Textile Mill           Assembly                 │   │
│  │                                                                       │   │
│  │   ✓ GOTS Certified    ✓ OEKO-TEX            ✓ ISO 14001              │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  WHY: EU transparency requires showing the journey, but trade secrets        │
│       protect the IDENTITY of sub-tier suppliers.                            │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LEVEL 3 (Authenticated - Customs/Auditor)                                  │
│  ═════════════════════════════════════════                                   │
│                                                                              │
│  Supply Chain Journey (Full Disclosure):                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                                                                       │   │
│  │   [India] ──────────► [Portugal] ──────────► [Germany]               │   │
│  │   Raj Cotton Mills    Fabrica de Tecidos     Schmidt Textil GmbH     │   │
│  │   VAT: IN123456       VAT: PT987654          VAT: DE112233           │   │
│  │   GLN: 1234567890123  GLN: 9876543210987     GLN: 1122334455667      │   │
│  │   GPS: 12.34, 56.78   GPS: 38.72, -9.14      GPS: 52.52, 13.40       │   │
│  │                                                                       │   │
│  │   ✓ GOTS #TC-12345    ✓ OEKO-TEX #OT-987    ✓ ISO 14001 #ISO-456    │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ACCESS: Requires eIDAS authentication or auditor API key                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Level 3 Forensic Seal - Compliance Audit View

> **Reference:** See [Regulatory Advisor](./13-regulatory-advisor.md) for complete compliance profile design.

> **Per-Rule Mode Display:** Each rule in the matrix shows its `effectiveMode` at evaluation time:
> - `ENFORCING` → Shows PASS/FAIL status normally
> - `SILENT` → Shows "ADVISORY" badge - rule was evaluated but didn't block
> - `DISABLED` → Shows "DISABLED BY POLICY" - rule was skipped entirely

For authenticated auditors, Level 3 includes a tiered compliance audit view that presents compliance information in progressive detail:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FORENSIC SEAL - COMPLIANCE AUDIT VIEW                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TIER 1: EXCEPTION SUMMARY (Default View)                                   │
│  ═══════════════════════════════════════                                     │
│                                                                              │
│  Readiness Profile: EU Market Entry - ESPR v2.3                             │
│  Evaluated: 2026-01-15T14:32:00Z                                            │
│  Status: PASS_WITH_DEVIATIONS (47 rules, 2 deviations)                      │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │  ⚠️  DOCUMENTED DEVIATIONS                                          │     │
│  ├────────────────────────────────────────────────────────────────────┤     │
│  │                                                                     │     │
│  │  1. Recycled Content Below Threshold                               │     │
│  │     Rule: MIN_RECYCLED_CONTENT | Severity: BLOCKER                 │     │
│  │     Expected: ≥25% | Actual: 18%                                   │     │
│  │     Regulation: ESPR Article 5(2) [📖 View]                        │     │
│  │     Reason: PENDING_SUPPLIER_TRANSITION                            │     │
│  │     "Supplier upgrading to recycled feedstock in Q2 2026.          │     │
│  │      Current batch uses legacy material from existing inventory."  │     │
│  │     Acknowledged: Jane Smith (jane@brand.com) @ 2026-01-15         │     │
│  │                                                                     │     │
│  │  2. Carbon Footprint Exceeds Benchmark                             │     │
│  │     Rule: CARBON_BENCHMARK | Severity: WARNING                     │     │
│  │     Expected: ≤10.0 kg CO₂e | Actual: 12.5 kg CO₂e                │     │
│  │     Regulation: PEF Category Rules [📖 View]                       │     │
│  │     Reason: OTHER                                                  │     │
│  │     "Industry benchmark based on 2024 data; our facility uses      │     │
│  │      renewable energy but grid carbon factor still high."          │     │
│  │     Acknowledged: Jane Smith (jane@brand.com) @ 2026-01-15         │     │
│  │                                                                     │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  [ Expand to Rule Matrix ] [ View Full Timeline ]                           │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TIER 2: RULE MATRIX (Expanded View)                                        │
│  ═══════════════════════════════════                                         │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Category           │ Rule                  │ Status │ Value        │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │ Material Compliance                                                 │    │
│  │                    │ MIN_RECYCLED_CONTENT  │ ⚠️ DEV │ 18% (≥25%)   │    │
│  │                    │ HAZARDOUS_SUBSTANCES  │ ✓ PASS │ None detected│    │
│  │                    │ REACH_SVHC            │ ✓ PASS │ Compliant    │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │ Environmental                                                       │    │
│  │                    │ CARBON_BENCHMARK      │ ⚠️ DEV │ 12.5 (≤10)   │    │
│  │                    │ WATER_USAGE           │ ✓ PASS │ 45L (≤100L)  │    │
│  │                    │ ENERGY_EFFICIENCY     │ ✓ PASS │ A+ rated     │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │ Traceability                                                        │    │
│  │                    │ ORIGIN_DOCUMENTED     │ ✓ PASS │ 100%         │    │
│  │                    │ SUPPLIER_VERIFIED     │ ✓ PASS │ All verified │    │
│  │                    │ CHAIN_OF_CUSTODY      │ ✓ PASS │ Complete     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Filter: [ All ] [ Deviations Only ] [ By Category ▼ ]                      │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TIER 3: AUDIT TIMELINE (Full History)                                      │
│  ═════════════════════════════════════                                       │
│                                                                              │
│  2026-01-15 14:32:00  DPP PROVISIONED                                       │
│                       Profile: EU Market Entry - ESPR v2.3                   │
│                       Status: PASS_WITH_DEVIATIONS                          │
│                       Hash: 0x7f3a...                                       │
│                                                                              │
│  2026-01-15 14:30:45  DEVIATION ACKNOWLEDGED                                │
│                       Rule: CARBON_BENCHMARK                                │
│                       User: jane@brand.com                                  │
│                       Reason: OTHER (custom explanation)                    │
│                                                                              │
│  2026-01-15 14:28:12  DEVIATION ACKNOWLEDGED                                │
│                       Rule: MIN_RECYCLED_CONTENT                            │
│                       User: jane@brand.com                                  │
│                       Reason: PENDING_SUPPLIER_TRANSITION                   │
│                                                                              │
│  2026-01-15 14:25:00  PREFLIGHT EVALUATION                                  │
│                       Result: 2 Blockers, 0 Warnings                        │
│                       Action Required: Acknowledge deviations               │
│                                                                              │
│  2026-01-14 09:00:00  VERSION RELEASED                                      │
│                       Design Version: v3.2.1                                │
│                       Released By: john@brand.com                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**API for Forensic Seal:**

```typescript
// GET /api/v1/dpp/:id/forensic-seal (requires auditor authentication)
interface ForensicSealResponse {
  dppId: string;
  complianceProfile: ComplianceProfileSnapshot;

  // Tiered views
  exceptionSummary: {
    profileName: string;
    profileVersion: string;
    evaluatedAt: string;
    overallStatus: string;
    deviations: DeviationSnapshot[];
  };

  ruleMatrix: {
    categories: {
      name: string;
      rules: (RuleEvaluationSnapshot & {
        // Display hints for UI rendering
        displayBadge?: 'ADVISORY' | 'DISABLED BY POLICY';
      })[];
    }[];
  };

  auditTimeline: {
    timestamp: string;
    eventType: string;
    details: Record<string, unknown>;
    actor?: string;
  }[];
}
```

### Status-Based Rendering

| DPP Status | Page Content |
|------------|--------------|
| COMMISSIONED | "This product is being prepared. Check back soon." |
| PROVISIONED | Level 1 + 2 visible (preview mode, optional) |
| ACTIVE | Full Transparency Funnel (Levels 1, 2, 3) |
| RECALLED | Full content + Recall Overlay at top |
| DECOMMISSIONED | "This product has been retired." + Archive data |

### Recall Overlay

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ⚠️  PRODUCT RECALL NOTICE                                                   │
│  ─────────────────────────────────────────────────────────────────────────  │
│  This product has been recalled due to: [Reason]                            │
│                                                                              │
│  Consumer Action Required:                                                   │
│  [Instructions from brand - e.g., "Return to store for refund"]             │
│                                                                              │
│  Recall ID: RCL-2026-00123                                                  │
│  Issued: January 15, 2026                                                   │
│  [ LEARN MORE ]                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Recall Propagation Service

When Operations marks a batch as RECALLED, Compliance updates all affected DPPs.

**Performance Critical:** Use SET-BASED SQL for batch updates (not loops).

```typescript
interface RecallEvent {
  type: 'BATCH_RECALLED';
  batchId: string;
  recallId: string;
  reason: string;
  severity: RecallSeverity;
  consumerAction: string;
  issuedBy: string;
  issuedAt: string;
}

@Injectable()
export class RecallPropagationService {
  constructor(
    private readonly em: EntityManager,
    private readonly billingService: BillingService,
  ) {}

  /**
   * Handle recall event from Operations workspace.
   *
   * PERFORMANCE: Uses set-based SQL for 50,000+ item batches.
   * A for...of loop with individual upserts would timeout.
   */
  async handleBatchRecall(event: RecallEvent): Promise<{ affected: number }> {
    const { batchId, recallId, reason, severity, consumerAction } = event;

    // 1. Get organization and count (for billing)
    const firstDpp = await this.em.findOne(DPPSnapshot, {
      serial: { batch: batchId },
    }, { populate: ['organization'] });

    if (!firstDpp) {
      return { affected: 0 };
    }

    const organizationId = firstDpp.organization.id;

    // 2. Build recall overlay JSON
    const recallOverlay: RecallOverlayData = {
      recallId,
      reason,
      severity,
      consumerAction,
      recalledAt: event.issuedAt,
      issuedBy: event.issuedBy,
    };

    // 3. SET-BASED UPDATE: Update all DPPs in single query
    const updateResult = await this.em.getConnection().execute(`
      UPDATE dpp_snapshot
      SET
        status = 'RECALLED',
        recall_id = ?,
        recall_overlay = ?
      WHERE serial_id IN (
        SELECT id FROM serial_number WHERE batch_id = ?
      )
    `, [recallId, JSON.stringify(recallOverlay), batchId]);

    const affectedCount = updateResult.affectedRows || 0;

    // 4. SET-BASED INSERT: Update public recall status (materialized view)
    //    Uses ON CONFLICT for upsert behavior
    await this.em.getConnection().execute(`
      INSERT INTO public_recall_status (gtin, serial_number, status, recall_id, recall_data, updated_at)
      SELECT
        ds.gtin,
        ds.serial_number,
        'RECALLED',
        ?,
        ?::jsonb,
        NOW()
      FROM dpp_snapshot ds
      INNER JOIN serial_number sn ON ds.serial_id = sn.id
      WHERE sn.batch_id = ?
      ON CONFLICT (gtin, serial_number)
      DO UPDATE SET
        status = 'RECALLED',
        recall_id = EXCLUDED.recall_id,
        recall_data = EXCLUDED.recall_data,
        updated_at = NOW()
    `, [
      recallId,
      JSON.stringify({
        id: recallId,
        severity,
        reason,
        consumerAction,
        issuedAt: event.issuedAt,
      }),
      batchId,
    ]);

    // 5. Bulk insert transitions (audit log) - can use batched insert
    await this.em.getConnection().execute(`
      INSERT INTO dpp_transition (id, dpp_snapshot_id, from_status, to_status, trigger, triggered_by, reason_code, metadata, created_at)
      SELECT
        gen_random_uuid(),
        ds.id,
        ds.status,
        'RECALLED',
        'RECALL_ISSUED',
        'SYSTEM',
        ?,
        ?::jsonb,
        NOW()
      FROM dpp_snapshot ds
      INNER JOIN serial_number sn ON ds.serial_id = sn.id
      WHERE sn.batch_id = ?
    `, [reason, JSON.stringify({ recallId }), batchId]);

    // 6. Update recall statistics
    await this.em.nativeUpdate(Recall, { id: recallId }, {
      affectedCount,
    });

    // 7. Trigger billing
    await this.billingService.recordRecallUsage({
      organizationId,
      recallId,
      itemsRecalled: affectedCount,
      feeRate: 0.001, // EUR 0.001 per item
    });

    return { affected: affectedCount };
  }

  /**
   * Handle recall resolution.
   */
  async handleRecallResolution(recallId: string): Promise<{ resolved: number }> {
    // 1. Get organization and count
    const recall = await this.em.findOneOrFail(Recall, recallId, {
      populate: ['organization'],
    });

    // 2. SET-BASED UPDATE: Restore all DPPs to ACTIVE
    const updateResult = await this.em.getConnection().execute(`
      UPDATE dpp_snapshot
      SET
        status = 'ACTIVE',
        recall_overlay = NULL
      WHERE recall_id = ?
    `, [recallId]);

    const resolvedCount = updateResult.affectedRows || 0;

    // 3. SET-BASED UPDATE: Update public status
    await this.em.getConnection().execute(`
      UPDATE public_recall_status
      SET
        status = 'RESOLVED',
        updated_at = NOW()
      WHERE recall_id = ?
    `, [recallId]);

    // 4. Billing for resolution
    if (resolvedCount > 0) {
      await this.billingService.recordRecallUsage({
        organizationId: recall.organization.id,
        recallId,
        itemsResolved: resolvedCount,
        feeRate: 0.0005, // EUR 0.0005 per item
      });
    }

    return { resolved: resolvedCount };
  }
}
```

---

## 11. Public Verification API

### ESPR Article 31 Compliance

**Free (mandated):** DPP data access, recall status checks
**Paid (value-add):** Cryptographic proof receipts

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FREE vs PAID SERVICE BOUNDARY                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  FREE (ESPR Mandated - No Rate Limits)                                      │
│  ─────────────────────────────────────                                       │
│  • DPP data access (product info, materials, sustainability)                │
│  • Recall status check ("Is this product recalled?")                        │
│  • Basic status: CLEAR / RECALLED / NOT_FOUND                               │
│                                                                              │
│  PAID (Value-Add Proof Service)                                             │
│  ──────────────────────────────                                              │
│  • Cryptographic proof receipt (Merkle path + TSA verification)             │
│  • Signed audit trail ("I checked at 10:32:05 UTC, system said CLEAR")      │
│  • Batch processing (1,000+ items per request)                              │
│  • Webhook notifications for recall alerts                                  │
│  • SLA guarantees (99.9% / 99.99% uptime)                                   │
│                                                                              │
│  THE DISTINCTION:                                                           │
│  Free = "Is it recalled?" (the answer)                                      │
│  Paid = "Prove that you checked" (the receipt)                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Free Status Check Endpoint

```typescript
// GET /api/v1/public/status/:gtin/:serial
// No authentication. No rate limits. Always free.

interface FreeStatusResponse {
  gtin: string;
  serial: string;
  status: 'CLEAR' | 'RECALLED' | 'NOT_FOUND';
  recall?: {
    id: string;
    severity: string;
    reason: string;
    instruction: string;
    issuedAt: string;
  };
  dppUrl: string;
  checkedAt: string;
}

@Controller('api/v1/public')
export class PublicStatusController {
  constructor(private readonly em: EntityManager) {}

  @Get('status/:gtin/:serial')
  async checkStatus(
    @Param('gtin') gtin: string,
    @Param('serial') serial: string,
  ): Promise<FreeStatusResponse> {
    // Fast lookup from materialized view
    const status = await this.em.findOne(PublicRecallStatus, {
      gtin,
      serialNumber: serial,
    });

    if (!status) {
      return {
        gtin,
        serial,
        status: 'NOT_FOUND',
        dppUrl: `https://dpp.eurocomply.eu/01/${gtin}/21/${serial}`,
        checkedAt: new Date().toISOString(),
      };
    }

    return {
      gtin,
      serial,
      status: status.status === 'RECALLED' ? 'RECALLED' : 'CLEAR',
      recall: status.recallData ? {
        id: status.recallData.id,
        severity: status.recallData.severity,
        reason: status.recallData.reason,
        instruction: status.recallData.consumerAction,
        issuedAt: status.recallData.issuedAt,
      } : undefined,
      dppUrl: `https://dpp.eurocomply.eu/01/${gtin}/21/${serial}`,
      checkedAt: new Date().toISOString(),
    };
  }
}
```

### Verification Proof Tiers

| Tier | Price | Proof Receipts/mo | Batch Size | SLA |
|------|-------|-------------------|------------|-----|
| Free | EUR 0 | 0 (status only) | N/A | Best effort |
| Basic | EUR 49/mo | 10,000 | 100 items | Best effort |
| Professional | EUR 199/mo | 50,000 | 1,000 items | 99.9% |
| Enterprise | EUR 999+/mo | Unlimited | 10,000 items | 99.99% |

---

## 12. GS1 Digital Link Resolver

```typescript
// Edge resolver (Cloudflare Worker)

interface AuthContext {
  type: 'CUSTOMS_EIDAS' | 'AUDITOR_API_KEY' | 'SUPPLY_CHAIN_PARTNER' | 'PUBLIC';
  permissions?: string[];
}

async function resolveDPP(request: Request): Promise<Response> {
  const { gtin, serial } = parseDigitalLink(request.url);
  const authContext = await parseAuthContext(request);

  const dpp = await getDPPSnapshot(gtin, serial);

  if (!dpp) {
    return render404Page();
  }

  // Check for recall overlay
  const recallOverlay = dpp.status === 'RECALLED' ? dpp.recallOverlay : null;

  // Determine disclosure level based on auth
  switch (authContext?.type) {
    case 'CUSTOMS_EIDAS':
    case 'AUDITOR_API_KEY':
      // Full Evidence Package (Level 3) - includes legal names, VAT, GPS
      return renderFullEvidencePage(dpp, recallOverlay);

    case 'SUPPLY_CHAIN_PARTNER':
      // EPCIS events + BOM with aliases (Level 2+)
      return renderPartnerPage(dpp, authContext.permissions);

    default:
      // Public consumer view - aliases only (Levels 1 + 2)
      return renderPublicPage(dpp, recallOverlay);
  }
}

/**
 * Render public page with trade secret protection.
 * Facility names show publicAlias, not legalName.
 */
function renderPublicPage(dpp: DPPSnapshot, recallOverlay?: RecallOverlayData): Response {
  const publicData = {
    ...dpp,
    operationsData: {
      ...dpp.operationsData,
      originFacility: {
        // ONLY expose publicAlias to public
        name: dpp.operationsData.originFacility.publicAlias,
        countryCode: dpp.operationsData.originFacility.countryCode,
        // Exclude: legalName, vatNumber, exact GPS
      },
    },
    designData: {
      ...dpp.designData,
      bomSnapshot: dpp.designData.bomSnapshot.map(line => ({
        ...line,
        // ONLY expose publicAlias
        facilityName: line.facilityPublicAlias,
        // Exclude: facilityLegalName, facilityVat
      })),
    },
  };

  return renderTemplate('public-dpp', publicData, recallOverlay);
}
```

---

## 13. API Endpoints

### DPP Management (Authenticated)

```
GET    /api/v1/compliance/dpps                    # List organization's DPPs
GET    /api/v1/compliance/dpps/:id                # Get DPP detail
GET    /api/v1/compliance/dpps/by-serial/:serial  # Lookup by serial number
```

### Snapshot Operations

```
POST   /api/v1/compliance/snapshots/preview       # Preview snapshot (dry run)
POST   /api/v1/compliance/snapshots/batch/:id     # Trigger snapshot for batch
GET    /api/v1/compliance/snapshots/:id/audit     # Get pre-flight audit results
```

### Lifecycle Management

```
POST   /api/v1/compliance/dpps/:id/activate       # PROVISIONED → ACTIVE
POST   /api/v1/compliance/dpps/:id/decommission   # → DECOMMISSIONED
```

### Recall Management

```
GET    /api/v1/compliance/recalls                 # List recalls
POST   /api/v1/compliance/recalls                 # Issue new recall
PUT    /api/v1/compliance/recalls/:id             # Update recall
POST   /api/v1/compliance/recalls/:id/resolve     # Mark recall resolved
```

### Public API (No Auth)

```
GET    /api/v1/public/status/:gtin/:serial        # Free recall status
GET    /api/v1/public/dpps/:dpp_uri               # Public DPP data
GET    /api/v1/public/verify/:dpp_uri             # Public verification ceremony
GET    /api/v1/public/recall/feed                 # RSS/Atom feed of recalls
GET    /api/v1/public/recall/:recall_id           # Recall details
```

### Proof Service (Paid)

```
GET    /api/v1/compliance/verify/:gtin/:serial    # Proof receipt + status
POST   /api/v1/compliance/verify/batch            # Batch proof receipts
```

---

## 14. Regulatory Advisor Integration

The Compliance Workspace integrates with the Regulatory Advisor system to ensure DPPs are only provisioned after compliance evaluation and any deviations are properly documented.

> **Full Design:** See [Regulatory Advisor](./13-regulatory-advisor.md) for complete system specification.

> **Feature Toggles:** This integration respects the organization's Regulatory Advisor settings:
> - If `regulatoryAdvisorEnabled = false`: PreFlight skipped, no compliance data in DPP, Forensic Seal omits compliance section
> - If `enforcementMode = 'SILENT'`: PreFlight runs but no soft gates; compliance captured only if `captureComplianceInSilentMode = true`
> - If `enforcementMode = 'ENFORCING'`: Full soft gate workflow; blockers must be acknowledged before DPP provisioning

### 14.1 PreFlight Gate in Snapshot Pipeline

Before a DPP can transition from COMMISSIONED to PROVISIONED, the PreFlight service must evaluate the product against the organization's readiness profile:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DPP SNAPSHOT PIPELINE WITH SOFT GATE                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  BATCH_RELEASED event                                                       │
│         │                                                                    │
│         ▼                                                                    │
│  ┌─────────────────┐                                                        │
│  │  Gather Data    │  Design + Marketing + Operations                       │
│  │  from 3         │                                                        │
│  │  Workspaces     │                                                        │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐     ┌───────────────────────────────────────────────┐ │
│  │  PreFlight      │────▶│  SOFT GATE EVALUATION                         │ │
│  │  Evaluation     │     │                                                │ │
│  └────────┬────────┘     │  ✓ PASS → Continue to snapshot                │ │
│           │              │  ⚠️ WARNINGS → Continue with warnings frozen   │ │
│           │              │  ⛔ BLOCKERS → Require acknowledgment          │ │
│           │              │                                                │ │
│           │              │  User can:                                     │ │
│           │              │  1. Fix issues and re-evaluate                 │ │
│           │              │  2. Acknowledge with reason + narrative        │ │
│           │              │  3. Request exemption (escalation path)        │ │
│           │              └───────────────────────────────────────────────┘ │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │  Create         │  Freeze compliance profile in snapshot                 │
│  │  Compliance     │  (immutable audit trail)                               │
│  │  Snapshot       │                                                        │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │  Sign &         │  Brand's DID signs full bundle                        │
│  │  Timestamp      │  (design + marketing + operations + compliance)       │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│      DPP PROVISIONED                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 14.2 Soft Gate Implementation

```typescript
interface SoftGateResult {
  canProceed: boolean;
  requiresAcknowledgment: boolean;

  blockers: PreFlightFinding[];
  warnings: PreFlightFinding[];
  infos: PreFlightFinding[];

  // If blockers exist, user must provide these before proceeding
  pendingAcknowledgments: {
    findingId: string;
    ruleId: string;
    severity: 'BLOCKER' | 'WARNING';
  }[];
}

async function evaluateSoftGate(
  productVersionId: string,
  readinessProfileId: string
): Promise<SoftGateResult> {
  const findings = await preFlightService.evaluate(productVersionId, readinessProfileId);

  // Only ENFORCING rules can block; SILENT/DISABLED rules don't create soft gates
  const blockers = findings.filter(f =>
    f.severity === 'BLOCKER' &&
    f.status === 'FAIL' &&
    f.effectiveMode === 'ENFORCING'
  );
  const warnings = findings.filter(f =>
    f.severity === 'WARNING' &&
    f.status === 'FAIL' &&
    f.effectiveMode === 'ENFORCING'
  );

  return {
    canProceed: blockers.length === 0,
    requiresAcknowledgment: blockers.length > 0,
    blockers,
    warnings,
    infos: findings.filter(f => f.severity === 'INFO'),
    pendingAcknowledgments: blockers.map(b => ({
      findingId: b.id,
      ruleId: b.ruleId,
      severity: 'BLOCKER',
    })),
  };
}
```

### 14.3 Acknowledgment Flow for Blockers

```typescript
interface DeviationAcknowledgment {
  findingId: string;
  reasonCodeId: string;       // From predefined reason codes
  narrative: string;          // Required free-text explanation
  acknowledgedBy: string;     // User ID
}

async function acknowledgeDeviation(
  batchId: string,
  acknowledgment: DeviationAcknowledgment
): Promise<void> {
  // 1. Validate reason code exists and is appropriate
  const reasonCode = await reasonCodeRepo.findOneOrFail(acknowledgment.reasonCodeId);

  // 2. Create deviation record
  const deviation = new RuleDeviation({
    batch: batchId,
    rule: acknowledgment.ruleId,
    reasonCode: reasonCode,
    narrative: acknowledgment.narrative,
    acknowledgedBy: acknowledgment.acknowledgedBy,
    acknowledgedAt: new Date(),
  });

  await em.persistAndFlush(deviation);

  // 3. Check if all blockers acknowledged
  const gateResult = await evaluateSoftGate(batchId, profileId);
  if (gateResult.pendingAcknowledgments.length === 0) {
    // All blockers acknowledged - can proceed to snapshot
    await eventBus.emit('SOFT_GATE_CLEARED', { batchId });
  }
}
```

### 14.4 API Extensions for Soft Gate

```
# PreFlight evaluation for batch
POST   /api/v1/compliance/batches/:id/preflight         # Evaluate batch
GET    /api/v1/compliance/batches/:id/preflight/status  # Get gate status

# Deviation acknowledgment
POST   /api/v1/compliance/batches/:id/deviations        # Acknowledge blocker
GET    /api/v1/compliance/batches/:id/deviations        # List deviations

# Proceed with deviations
POST   /api/v1/compliance/batches/:id/proceed           # Clear gate and proceed

# Forensic seal for auditors
GET    /api/v1/compliance/dpps/:id/forensic-seal        # Full audit view (auth required)
```

### 14.5 API Extensions for Compliance Governance

```
# Marketplace & Template Adoption (MANAGER only)
GET    /api/v1/compliance/marketplace/templates         # Browse available templates
POST   /api/v1/compliance/templates/:id/adopt           # Adopt template into org
GET    /api/v1/compliance/templates                     # List adopted templates

# Readiness Profile Management (MANAGER only)
GET    /api/v1/compliance/profiles                      # List org's readiness profiles
POST   /api/v1/compliance/profiles                      # Create profile
PUT    /api/v1/compliance/profiles/:id                  # Update profile
DELETE /api/v1/compliance/profiles/:id                  # Delete profile

# Profile Rule Override (MANAGER only)
PUT    /api/v1/compliance/profiles/:profileId/rules/:ruleId
       # Body: { overrideMode: 'ENFORCING'|'SILENT'|'DISABLED', reason: string }
PUT    /api/v1/compliance/profiles/:profileId/rules/bulk
       # Body: { updates: [{ ruleId, overrideMode }], reason: string }

# Profile Assignment to Products (MANAGER only)
PUT    /api/v1/compliance/products/:productId/profile
       # Body: { readinessProfileId: string }
GET    /api/v1/compliance/products/:productId/profile   # Get assigned profile

# Compliance Dashboard
GET    /api/v1/compliance/dashboard                     # Org-wide compliance summary
GET    /api/v1/compliance/dashboard/products            # Products by compliance status
```

### 14.6 API Types for Rule Override

```typescript
// PUT /api/v1/compliance/profiles/:profileId/rules/:ruleId
interface UpdateRuleOverrideRequest {
  overrideMode: 'ENFORCING' | 'SILENT' | 'DISABLED';
  reason: string;  // Required audit trail
}

interface UpdateRuleOverrideResponse {
  profileId: string;
  ruleId: string;
  previousMode: 'ENFORCING' | 'SILENT' | 'DISABLED' | null;
  newMode: 'ENFORCING' | 'SILENT' | 'DISABLED';
  setBy: string;
  setAt: string;  // ISO timestamp
}

// PUT /api/v1/compliance/profiles/:profileId/rules/bulk
interface BulkUpdateRuleOverrideRequest {
  updates: {
    ruleId: string;
    overrideMode: 'ENFORCING' | 'SILENT' | 'DISABLED';
  }[];
  reason: string;  // Single reason for all changes
}

interface BulkUpdateRuleOverrideResponse {
  profileId: string;
  updated: number;
  changes: {
    ruleId: string;
    previousMode: 'ENFORCING' | 'SILENT' | 'DISABLED' | null;
    newMode: 'ENFORCING' | 'SILENT' | 'DISABLED';
  }[];
  setBy: string;
  setAt: string;
}
```

---

## 15. Related Documents

| Document | Purpose |
|----------|---------|
| [Architecture](./01-architecture.md) | System architecture |
| [Data Model](./02-data-model.md) | Database schema overview |
| [Design Workspace](./05-design-workspace.md) | Source of BOM, specs, versions |
| [Operations Workspace](./06-operations-workspace.md) | Source of evidence, notary chain |
| [Marketing Workspace](./07-marketing-workspace.md) | Source of content, assets |
| [Verifiable Credentials](./09-verifiable-credentials.md) | VC issuance, DID management |
| [Billing](./12-billing.md) | DPP pricing, recall fees |
| [Regulatory Advisor](./13-regulatory-advisor.md) | Rule templates, soft gates, forensic seal |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 2.3 | 2026-01-21 | Added feature toggle conditional behavior note to Regulatory Advisor section |
| 2.2 | 2026-01-21 | Added Regulatory Advisor integration: compliance profile in DPP snapshot, forensic seal with tiered audit view, soft gate workflow, PreFlight evaluation in snapshot pipeline |
| 2.1 | 2026-01-21 | Added RFC 8785 canonicalization, facility publicAlias for trade secrets, Merkle visualization, set-based SQL for recall propagation |
| 2.0 | 2026-01-21 | Consolidated from Prisma design, converted to MikroORM entities |
