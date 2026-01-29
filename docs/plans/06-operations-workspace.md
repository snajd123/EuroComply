# Operations Workspace (Evidence Engine)

**Status:** Active
**Last Updated:** 2026-01-26

---

## 1. Overview

The Operations Workspace is the **chain of custody engine** - it answers "who made this, where, and can we prove it?" This is where EU geographic transparency and supply chain due diligence requirements (CSDDD) are satisfied.

### Core Principles

| Principle | Implementation |
|-----------|----------------|
| **Facility-Centric** | Suppliers own facilities; materials come from facilities, not abstract suppliers |
| **Certification-Governed** | No facility enters BOM search until verified |
| **Expiry-Aware** | Dashboard alerts on expiring certs before they become blockers |
| **Audit-Ready** | Every verification has timestamp + verifier + evidence |
| **Evidence-Gated** | Status transitions require notary events |

### Ownership

| Owns | Description |
|------|-------------|
| Supplier registry | Company-level supplier records (legal entities) |
| Facility registry | Physical locations with geo-coordinates |
| Certification ledger | Cert tracking with validity periods |
| Orders | Purchase, Work, Sales, Transfer orders |
| Event ledger | Digitally-signed notary events |
| Inventory lots | Incoming material tracking |
| Batches & serials | Production output tracking |

---

## 2. Authority Model

| Authority | Operations Workspace Capabilities |
|-----------|----------------------------------|
| **MANAGER** | Full CRUD, verify facilities, workspace settings |
| **EDITOR** | Create/edit suppliers and facilities, verify contributor submissions |
| **CONTRIBUTOR** | Create suppliers, upload certs (needs verification) |
| **VIEWER** | Read-only access, browse facility database |

> **Compliance View (Read-Only):** Operations users can view compliance status for batches and acknowledge deviations (if rule is ENFORCING), but cannot change readiness profiles or rule configurations. All rule governance is managed exclusively in the **Compliance Workspace** by Compliance MANAGER.

---

## 3. Module Architecture

```
+-----------------------------------------------------------------------------+
|                       OPERATIONS WORKSPACE (EVIDENCE ENGINE)                 |
+-----------------------------------------------------------------------------+
|                                                                              |
|  CORE MODULES                                                                |
|  +-------------+  +-------------+  +-------------+  +-------------+         |
|  |  Supplier   |  |  Facility   |  | Certificate |  |  Onboarding |         |
|  |  Registry   |  |  Registry   |  |   Ledger    |  |   Workflow  |         |
|  +------+------+  +------+------+  +------+------+  +------+------+         |
|         |                |                |                |                 |
|         +----------------+----------------+----------------+                 |
|                          |                                                   |
|  INTEGRITY MODULES       v                                                   |
|  +-------------+     +---------------------+                                 |
|  |   Expiry    |     |   VERIFICATION      |                                 |
|  |  Dashboard  |<--->|     MANAGER         |                                 |
|  +-------------+     +----------+----------+                                 |
|  +-------------+                |                                            |
|  |    Risk     |                |                                            |
|  |   Scoring   |<---------------+                                            |
|  +-------------+                |                                            |
|  +-------------+                |                                            |
|  |   Audit     |                |                                            |
|  |    Trail    |<---------------+                                            |
|  +-------------+                                                             |
|                                                                              |
|  EXECUTION MODULES                                                           |
|  +-------------+  +-------------+  +-------------+  +-------------+         |
|  |   Orders    |  |   Event     |  | Inventory   |  |  Batches &  |         |
|  |  (PO/WO/SO) |  |   Ledger    |  |    Lots     |  |   Serials   |         |
|  +-------------+  +-------------+  +-------------+  +-------------+         |
|                                                                              |
|  BRIDGE TO DESIGN                                                            |
|  +-----------------------------------------------------------------------+  |
|  |  Design Workspace BOM --(facility_id)--> Facility Registry            |  |
|  |  * Only VERIFIED facilities appear in BOM material search             |  |
|  |  * Expiring certs trigger WARNINGs in Design release validation       |  |
|  +-----------------------------------------------------------------------+  |
|                                                                              |
+-----------------------------------------------------------------------------+
```

---

## 4. Supplier Registry

### 4.1 Supplier Entity

```typescript
// src/modules/operations/entities/supplier.entity.ts
import { Entity, Property, ManyToOne, OneToMany, Enum, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { Organization } from '../../auth/entities/organization.entity';
import { User } from '../../auth/entities/user.entity';
import { Facility } from './facility.entity';

export enum SupplierStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  SUSPENDED = 'SUSPENDED',
  INACTIVE = 'INACTIVE',
}

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

@Entity({ tableName: 'supplier' })
@Unique({ properties: ['organization', 'code'] })
export class Supplier extends BaseEntity {
  @ManyToOne(() => Organization)
  @Index()
  organization!: Organization;

  // Legal identity
  @Property({ length: 255 })
  name!: string;

  @Property({ length: 255, nullable: true })
  legalName?: string;

  @Property({ length: 50, nullable: true })
  code?: string;

  @Property({ length: 100, nullable: true })
  taxId?: string;

  @Property({ length: 20, nullable: true })
  dunsNumber?: string;

  // Primary location (headquarters)
  @Property({ length: 2 })
  @Index()
  countryCode!: string;

  @Property({ length: 100, nullable: true })
  region?: string;

  @Property({ length: 100, nullable: true })
  city?: string;

  @Property({ type: 'text', nullable: true })
  address?: string;

  @Property({ length: 20, nullable: true })
  postalCode?: string;

  // Compliance status
  @Enum(() => SupplierStatus)
  @Index()
  status!: SupplierStatus;

  @Property({ type: 'text', nullable: true })
  statusReason?: string;

  @Property({ nullable: true })
  statusChangedAt?: Date;

  @ManyToOne(() => User, { nullable: true })
  statusChangedBy?: User;

  // Risk assessment
  @Enum({ items: () => RiskLevel, nullable: true })
  @Index()
  riskLevel?: RiskLevel;

  @Property({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  riskScore?: string;

  @Property({ nullable: true })
  lastRiskAssessment?: Date;

  // ESG scoring
  @Property({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  esgScore?: string;

  @Property({ length: 100, nullable: true })
  esgSource?: string;

  // Contact
  @Property({ length: 255, nullable: true })
  primaryContact?: string;

  @Property({ length: 255, nullable: true })
  contactEmail?: string;

  @Property({ length: 50, nullable: true })
  contactPhone?: string;

  @Property({ type: 'text', nullable: true })
  notes?: string;

  @ManyToOne(() => User, { nullable: true })
  createdBy?: User;

  @OneToMany(() => Facility, (f) => f.supplier)
  facilities!: Collection<Facility>;
}
```

### 4.2 Country Risk Index (CSDDD Compliance)

```typescript
// src/modules/operations/entities/country-risk-index.entity.ts
import { Entity, Property, PrimaryKey } from '@mikro-orm/core';

@Entity({ tableName: 'country_risk_index' })
export class CountryRiskIndex {
  @PrimaryKey({ length: 2 })
  countryCode!: string;

  @Property({ length: 100 })
  countryName!: string;

  // Risk scores (0-100, higher = more risk)
  @Property({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  corruptionIndex?: string; // Transparency International CPI (inverted)

  @Property({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  laborRiskIndex?: string; // ILO/ITUC labor rights

  @Property({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  environmentalRisk?: string; // Environmental Performance Index (inverted)

  @Property({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  conflictRisk?: string; // Armed Conflict Location & Event Data

  // Composite score (computed)
  @Property({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  compositeRisk?: string;

  // Auto-elevation threshold
  @Property({ length: 20, nullable: true })
  minRiskLevel?: string; // If set, facilities here can't go below this

  @Property({ type: 'int', nullable: true })
  sourceYear?: number;

  @Property({ default: 'now()' })
  lastUpdated!: Date;
}
```

### 4.3 Raw Material Supply Risk (CRM Compliance)

For supply chain risk assessment involving Critical Raw Materials (CRM), the Operations workspace integrates with the **RawMaterial** entity from the public schema.

> **Reference:** See [Taxonomy Plan 9](./2026-01-26-taxonomy-09-raw-material-registry.md) for RawMaterial entity definition.

```typescript
// Integration with public.raw_material for CRM compliance
interface MaterialSupplyRisk {
  materialId: string;
  materialName: string;
  isCriticalRawMaterial: boolean;  // EU CRM list 2023
  supplyRiskScore?: number;        // Economic importance × supply risk
  primarySourceCountries: string[];
  recyclingRate?: number;
  substitutionIndex?: number;
}

// Example: Check if BOM contains CRM materials
async function assessBomCrmRisk(bomEntries: BomEntry[]): Promise<MaterialSupplyRisk[]> {
  const rawMaterials = await em.find(RawMaterial, {
    isCriticalRawMaterial: true,
  });

  return bomEntries
    .filter(entry => rawMaterials.some(rm => rm.id === entry.materialId))
    .map(entry => ({
      materialId: entry.materialId,
      materialName: entry.materialName,
      isCriticalRawMaterial: true,
      // ... additional risk metrics
    }));
}
```

**CRM Risk Factors:**

| Factor | Source | Weight |
|--------|--------|--------|
| EU CRM List Status | EU RMIS 2023 | HIGH |
| Primary Source Countries | CountryRiskIndex | MEDIUM |
| Recycling Rate | EU RMIS | LOW |
| Substitution Difficulty | EU RMIS | MEDIUM |

### 4.4 Risk Calculation Service

```typescript
// src/modules/operations/services/risk-calculation.service.ts
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Facility } from '../entities/facility.entity';
import { CountryRiskIndex } from '../entities/country-risk-index.entity';
import { FacilityCertification, CertStatus } from '../entities/facility-certification.entity';
import { RiskLevel } from '../entities/supplier.entity';
import Decimal from 'decimal.js';

export interface RiskFactor {
  factor: string;
  score: number;
  weight: number;
  source: string;
}

export interface FacilityRiskAssessment {
  facilityId: string;
  calculatedRisk: number;
  riskLevel: RiskLevel;
  factors: RiskFactor[];
  countryFloor: RiskLevel | null;
}

@Injectable()
export class RiskCalculationService {
  constructor(private readonly em: EntityManager) {}

  async calculateFacilityRisk(facilityId: string): Promise<FacilityRiskAssessment> {
    const facility = await this.em.findOneOrFail(Facility, facilityId);
    const countryRisk = await this.em.findOne(CountryRiskIndex, {
      countryCode: facility.countryCode,
    });
    const certs = await this.em.find(FacilityCertification, {
      facility: facilityId,
      status: { $in: [CertStatus.VERIFIED, CertStatus.AUTO_VERIFIED] },
    });

    const factors: RiskFactor[] = [];

    // Factor 1: Country risk (30% weight)
    if (countryRisk?.compositeRisk) {
      factors.push({
        factor: 'Country Risk',
        score: parseFloat(countryRisk.compositeRisk),
        weight: 0.3,
        source: `${countryRisk.countryName} (${countryRisk.sourceYear})`,
      });
    }

    // Factor 2: Certification coverage (25% weight)
    const certScore = this.calculateCertCoverage(certs);
    factors.push({
      factor: 'Certification Coverage',
      score: 100 - certScore,
      weight: 0.25,
      source: `${certs.length} active certifications`,
    });

    // Factor 3: Certification freshness (20% weight)
    const expiryRisk = this.calculateExpiryRisk(certs);
    factors.push({
      factor: 'Cert Expiry Risk',
      score: expiryRisk,
      weight: 0.2,
      source: 'Days until nearest expiry',
    });

    // Factor 4: Verification age (15% weight)
    const verificationAge = facility.verifiedAt
      ? Math.floor((Date.now() - facility.verifiedAt.getTime()) / (1000 * 60 * 60 * 24))
      : 365;
    const ageScore = Math.min((verificationAge / 365) * 100, 100);
    factors.push({
      factor: 'Verification Age',
      score: ageScore,
      weight: 0.15,
      source: `Verified ${verificationAge} days ago`,
    });

    // Factor 5: Historical issues (10% weight)
    const issueScore = await this.calculateHistoricalIssueScore(facilityId);
    factors.push({
      factor: 'Historical Issues',
      score: issueScore,
      weight: 0.1,
      source: 'Past suspensions/rejections',
    });

    // Calculate weighted score
    const calculatedRisk = factors.reduce((sum, f) => sum + f.score * f.weight, 0);

    // Determine risk level
    let riskLevel: RiskLevel;
    if (calculatedRisk >= 75) riskLevel = RiskLevel.CRITICAL;
    else if (calculatedRisk >= 50) riskLevel = RiskLevel.HIGH;
    else if (calculatedRisk >= 25) riskLevel = RiskLevel.MEDIUM;
    else riskLevel = RiskLevel.LOW;

    // Apply country floor (CSDDD requirement)
    const countryFloor = countryRisk?.minRiskLevel as RiskLevel | null;
    if (countryFloor) {
      const floorOrder = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
      if (floorOrder[riskLevel] < floorOrder[countryFloor]) {
        riskLevel = countryFloor;
      }
    }

    return {
      facilityId,
      calculatedRisk,
      riskLevel,
      factors,
      countryFloor,
    };
  }

  private calculateCertCoverage(certs: FacilityCertification[]): number {
    // More certs = higher coverage score (0-100)
    const baseCerts = 4; // Expected baseline
    return Math.min((certs.length / baseCerts) * 100, 100);
  }

  private calculateExpiryRisk(certs: FacilityCertification[]): number {
    if (certs.length === 0) return 100;

    const now = new Date();
    const nearestExpiry = Math.min(
      ...certs.map((c) => {
        const days = (c.validUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        return Math.max(days, 0);
      })
    );

    // 0 days = 100 risk, 365+ days = 0 risk
    return Math.max(0, 100 - (nearestExpiry / 365) * 100);
  }

  private async calculateHistoricalIssueScore(facilityId: string): Promise<number> {
    // Check facility certification history for rejections/suspensions
    const issues = await this.em.count('FacilityCertificationHistory', {
      'certification.facility': facilityId,
      newStatus: { $in: ['REJECTED', 'EXPIRED'] },
    });
    return Math.min(issues * 25, 100);
  }
}
```

---

## 5. Facility Registry

### 5.1 Facility Entity

```typescript
// src/modules/operations/entities/facility.entity.ts
import { Entity, Property, ManyToOne, OneToMany, Enum, Index, Unique, Check } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { Supplier } from './supplier.entity';
import { User } from '../../auth/entities/user.entity';
import { FacilityCertification } from './facility-certification.entity';

export enum FacilityType {
  EXTRACTION = 'EXTRACTION',
  PROCESSING = 'PROCESSING',
  MANUFACTURING = 'MANUFACTURING',
  ASSEMBLY = 'ASSEMBLY',
  WAREHOUSE = 'WAREHOUSE',
  TESTING_LAB = 'TESTING_LAB',
}

export enum FacilityStatus {
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  VERIFIED = 'VERIFIED',
  EXPIRED = 'EXPIRED',
  SUSPENDED = 'SUSPENDED',
  INACTIVE = 'INACTIVE',
}

@Entity({ tableName: 'facility' })
@Unique({ properties: ['supplier', 'code'] })
export class Facility extends BaseEntity {
  @ManyToOne(() => Supplier, { onDelete: 'cascade' })
  @Index()
  supplier!: Supplier;

  @Property({ length: 255 })
  name!: string;

  @Property({ length: 50, nullable: true })
  code?: string;

  @Enum(() => FacilityType)
  @Index()
  facilityType!: FacilityType;

  // Location (REQUIRED for EU transparency)
  @Property({ length: 2 })
  @Index()
  countryCode!: string;

  @Property({ length: 100, nullable: true })
  region?: string;

  @Property({ length: 100, nullable: true })
  city?: string;

  @Property({ type: 'text' })
  address!: string;

  @Property({ length: 20, nullable: true })
  postalCode?: string;

  // Geographic coordinates (required for EUDR, some ESPR filings)
  @Property({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude?: string;

  @Property({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude?: string;

  @Property({ length: 50, nullable: true })
  geoAccuracy?: string; // GPS, Address lookup, Manual

  // Verification status
  @Enum(() => FacilityStatus)
  @Index()
  certificationStatus!: FacilityStatus;

  @Property({ type: 'text', nullable: true })
  statusReason?: string;

  @Property({ nullable: true })
  verifiedAt?: Date;

  @ManyToOne(() => User, { nullable: true })
  verifiedBy?: User;

  // Capacity/capability
  @Property({ type: 'array', nullable: true })
  productTypes?: string[];

  @Property({ length: 100, nullable: true })
  annualCapacity?: string;

  // Contact
  @Property({ length: 255, nullable: true })
  siteContact?: string;

  @Property({ length: 255, nullable: true })
  siteEmail?: string;

  @Property({ length: 50, nullable: true })
  sitePhone?: string;

  @Property({ type: 'text', nullable: true })
  notes?: string;

  @ManyToOne(() => User, { nullable: true })
  createdBy?: User;

  @OneToMany(() => FacilityCertification, (c) => c.facility)
  certifications!: Collection<FacilityCertification>;
}
```

---

## 6. Certification Ledger

### 6.1 Certification Entity

```typescript
// src/modules/operations/entities/facility-certification.entity.ts
import { Entity, Property, ManyToOne, Enum, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { Facility } from './facility.entity';
import { Document } from '../../design/entities/document.entity';
import { User } from '../../auth/entities/user.entity';

export enum CertStatus {
  PENDING_REVIEW = 'PENDING_REVIEW',
  VERIFIED = 'VERIFIED',
  AUTO_VERIFIED = 'AUTO_VERIFIED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

export enum CertCategory {
  ENVIRONMENTAL = 'ENVIRONMENTAL',
  QUALITY = 'QUALITY',
  SOCIAL = 'SOCIAL',
  MATERIAL = 'MATERIAL',
  SAFETY = 'SAFETY',
  CHAIN_OF_CUSTODY = 'CHAIN_OF_CUSTODY',
  CONFLICT_MINERALS = 'CONFLICT_MINERALS',
  OTHER = 'OTHER',
}

@Entity({ tableName: 'facility_certification' })
@Unique({ properties: ['facility', 'certType', 'certNumber'] })
export class FacilityCertification extends BaseEntity {
  @ManyToOne(() => Facility, { onDelete: 'cascade' })
  @Index()
  facility!: Facility;

  @Property({ length: 100 })
  @Index()
  certType!: string; // e.g., "GOTS 6.0", "ISO 14001:2015"

  @Enum(() => CertCategory)
  @Index()
  certCategory!: CertCategory;

  @Property({ length: 100, nullable: true })
  certNumber?: string;

  @Property({ length: 255 })
  issuingBody!: string;

  @Property({ length: 2, nullable: true })
  issuingCountry?: string;

  @Property({ type: 'date' })
  validFrom!: Date;

  @Property({ type: 'date' })
  @Index()
  validUntil!: Date;

  @ManyToOne(() => Document, { nullable: true })
  document?: Document;

  @Property({ length: 500, nullable: true })
  externalUrl?: string;

  @Enum(() => CertStatus)
  @Index()
  status!: CertStatus;

  @Property({ length: 50, nullable: true })
  verificationMethod?: string; // MANUAL, API_CHECK, DOCUMENT_REVIEW

  @ManyToOne(() => User, { nullable: true })
  verifiedBy?: User;

  @Property({ nullable: true })
  verifiedAt?: Date;

  @Property({ type: 'text', nullable: true })
  verificationNotes?: string;

  @Property({ length: 255, nullable: true })
  apiVerificationId?: string;

  @Property({ nullable: true })
  lastApiCheck?: Date;

  @ManyToOne(() => User, { nullable: true })
  createdBy?: User;
}
```

### 6.2 Certification History (Audit Trail)

```typescript
// src/modules/operations/entities/facility-certification-history.entity.ts
import { Entity, Property, ManyToOne, Enum } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { FacilityCertification, CertStatus } from './facility-certification.entity';
import { User } from '../../auth/entities/user.entity';

@Entity({ tableName: 'facility_certification_history' })
export class FacilityCertificationHistory extends BaseEntity {
  @ManyToOne(() => FacilityCertification)
  certification!: FacilityCertification;

  @Enum(() => CertStatus)
  previousStatus!: CertStatus;

  @Enum(() => CertStatus)
  newStatus!: CertStatus;

  @Property({ type: 'text', nullable: true })
  reason?: string;

  @ManyToOne(() => User, { nullable: true })
  changedBy?: User;

  @Property()
  changedAt!: Date;
}
```

---

## 7. Order Management (Execution Kernel)

### 7.1 Order Entity

```typescript
// src/modules/operations/entities/operations-order.entity.ts
import { Entity, Property, ManyToOne, OneToMany, Enum, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { Organization } from '../../auth/entities/organization.entity';
import { Product } from '../../design/entities/product.entity';
import { WorkspaceVersion } from '../../design/entities/workspace-version.entity';
import { User } from '../../auth/entities/user.entity';
import { OperationsEvent } from './operations-event.entity';

export enum OrderType {
  PURCHASE = 'PURCHASE',
  WORK = 'WORK',
  SALES = 'SALES',
  TRANSFER = 'TRANSFER',
}

export enum OrderStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

@Entity({ tableName: 'operations_order' })
@Unique({ properties: ['organization', 'orderType', 'orderNumber'] })
export class OperationsOrder extends BaseEntity {
  @ManyToOne(() => Organization)
  @Index()
  organization!: Organization;

  @Enum(() => OrderType)
  @Index()
  orderType!: OrderType;

  @Property({ length: 50 })
  orderNumber!: string;

  @Enum(() => OrderStatus)
  @Index()
  status!: OrderStatus;

  @Property({ nullable: true })
  statusChangedAt?: Date;

  @ManyToOne(() => User, { nullable: true })
  statusChangedBy?: User;

  // What (Design link - the "Compliance Contract")
  @ManyToOne(() => Product, { nullable: true })
  @Index()
  product?: Product;

  @ManyToOne(() => WorkspaceVersion, { nullable: true })
  designVersion?: WorkspaceVersion;

  // Quantities
  @Property({ type: 'decimal', precision: 12, scale: 4 })
  quantityOrdered!: string;

  @Property({ type: 'decimal', precision: 12, scale: 4, default: '0' })
  quantityFulfilled!: string;

  @Property({ length: 20, default: 'units' })
  unit!: string;

  // Timeline
  @Property({ type: 'date' })
  orderDate!: Date;

  @Property({ type: 'date', nullable: true })
  requiredDate?: Date;

  @Property({ nullable: true })
  actualStart?: Date;

  @Property({ nullable: true })
  actualEnd?: Date;

  // Type-specific extensions (JSONB for flexibility)
  @Property({ type: 'jsonb', default: '{}' })
  extensions!: Record<string, unknown>;

  @Property({ type: 'text', nullable: true })
  notes?: string;

  @ManyToOne(() => User, { nullable: true })
  createdBy?: User;

  @OneToMany(() => OperationsEvent, (e) => e.order)
  events!: Collection<OperationsEvent>;
}
```

### 7.2 Type-Specific Extensions

```typescript
// src/modules/operations/types/order-extensions.ts

export interface PurchaseOrderExtensions {
  supplierId: string;
  facilityId: string;
  sentToSupplierAt?: Date;
  acknowledgedAt?: Date;
  shipmentIds?: string[];
  customsCleared?: boolean;
  paymentTerms?: string;
  currency?: string;
  totalAmount?: number;
}

export interface WorkOrderExtensions {
  facilityId: string;
  scheduledStart?: Date;
  scheduledEnd?: Date;
  qcStatus?: 'PENDING' | 'PASSED' | 'FAILED';
  qcPerformedBy?: string;
  qcPerformedAt?: Date;
  qcResults?: Record<string, unknown>;
}

export interface SalesOrderExtensions {
  customerId: string;
  shippingAddress?: {
    street: string;
    city: string;
    postalCode: string;
    country: string;
  };
  pickingStartedAt?: Date;
  packedAt?: Date;
  shippedAt?: Date;
  deliveredAt?: Date;
  carrier?: string;
  trackingNumber?: string;
}
```

---

## 8. Event Ledger (Digital Notary)

### 8.1 Operations Event Entity

```typescript
// src/modules/operations/entities/operations-event.entity.ts
import { Entity, Property, ManyToOne, Enum, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { Organization } from '../../auth/entities/organization.entity';
import { OperationsOrder } from './operations-order.entity';
import { User } from '../../auth/entities/user.entity';

export enum EventType {
  // Attestations
  ATTESTATION_START = 'ATTESTATION_START',
  ATTESTATION_COMPLETE = 'ATTESTATION_COMPLETE',
  ATTESTATION_WITNESS = 'ATTESTATION_WITNESS',
  // Material events
  MATERIAL_RECEIVED = 'MATERIAL_RECEIVED',
  MATERIAL_CONSUMED = 'MATERIAL_CONSUMED',
  MATERIAL_REJECTED = 'MATERIAL_REJECTED',
  // Quality events
  QC_INSPECTION = 'QC_INSPECTION',
  QC_SAMPLE_TAKEN = 'QC_SAMPLE_TAKEN',
  QC_RESULT_RECORDED = 'QC_RESULT_RECORDED',
  // Logistics events
  SHIPMENT_DISPATCHED = 'SHIPMENT_DISPATCHED',
  SHIPMENT_IN_TRANSIT = 'SHIPMENT_IN_TRANSIT',
  CUSTOMS_CLEARED = 'CUSTOMS_CLEARED',
  GOODS_RECEIVED = 'GOODS_RECEIVED',
  // Production events
  PRODUCTION_STARTED = 'PRODUCTION_STARTED',
  PRODUCTION_PAUSED = 'PRODUCTION_PAUSED',
  PRODUCTION_RESUMED = 'PRODUCTION_RESUMED',
  PRODUCTION_COMPLETED = 'PRODUCTION_COMPLETED',
  // Identity events
  BATCH_CREATED = 'BATCH_CREATED',
  SERIAL_ASSIGNED = 'SERIAL_ASSIGNED',
  LABEL_PRINTED = 'LABEL_PRINTED',
  // Document events
  DOCUMENT_UPLOADED = 'DOCUMENT_UPLOADED',
  DOCUMENT_VERIFIED = 'DOCUMENT_VERIFIED',
}

@Entity({ tableName: 'operations_event' })
@Unique({ properties: ['order', 'eventNumber'] })
export class OperationsEvent extends BaseEntity {
  @ManyToOne(() => Organization)
  organization!: Organization;

  @ManyToOne(() => OperationsOrder)
  @Index()
  order!: OperationsOrder;

  @Enum(() => EventType)
  @Index()
  eventType!: EventType;

  @Property({ type: 'int' })
  eventNumber!: number;

  // When & Where (Spatiotemporal Anchor)
  @Property()
  @Index()
  occurredAt!: Date;

  @Property({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude?: string;

  @Property({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude?: string;

  @Property({ type: 'decimal', nullable: true })
  geoAccuracyM?: string;

  @Property({ length: 255, nullable: true })
  locationName?: string;

  // Who (The Attester)
  @ManyToOne(() => User)
  performedBy!: User;

  @Property({ length: 100, nullable: true })
  attesterRole?: string;

  // What (Event payload)
  @Property({ type: 'jsonb', default: '{}' })
  payload!: Record<string, unknown>;

  // Evidence (Photos, Documents)
  @Property({ type: 'jsonb', default: '[]' })
  evidence!: unknown[];

  // Content hash (for integrity)
  @Property({ length: 64, nullable: true })
  contentHash?: string;

  @Property({ length: 64, nullable: true })
  previousHash?: string;

  // DIGITAL SEAL (Non-repudiation)
  @Property({ length: 255, nullable: true })
  signerDid?: string;

  @Property({ type: 'text', nullable: true })
  signatureJws?: string;

  @Property({ length: 20, nullable: true })
  signatureAlg?: string;

  // Verification
  @Property({ default: false })
  isVerified!: boolean;

  @ManyToOne(() => User, { nullable: true })
  verifiedBy?: User;

  @Property({ nullable: true })
  verifiedAt?: Date;
}
```

### 8.2 Evidence-Gated Status Transitions

```typescript
// src/modules/operations/services/order-transition.service.ts
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { OperationsOrder, OrderStatus, OrderType } from '../entities/operations-order.entity';
import { OperationsEvent, EventType } from '../entities/operations-event.entity';

interface RequiredEvent {
  eventType: EventType;
  requiresGeo: boolean;
  requiresPhoto: boolean;
  isMandatory: boolean;
}

interface TransitionResult {
  success: boolean;
  blocked: boolean;
  reason?: string;
  missingEvents?: RequiredEvent[];
}

@Injectable()
export class OrderTransitionService {
  constructor(private readonly em: EntityManager) {}

  async transitionOrderStatus(
    orderId: string,
    targetStatus: OrderStatus,
    userId: string
  ): Promise<TransitionResult> {
    const order = await this.em.findOneOrFail(OperationsOrder, orderId);
    const recordedEvents = await this.em.find(OperationsEvent, { order: orderId });
    const requiredEvents = await this.getRequiredEvents(order.orderType, targetStatus);

    const missingEvents: RequiredEvent[] = [];

    for (const required of requiredEvents) {
      const matching = recordedEvents.find((e) => e.eventType === required.eventType);

      if (!matching && required.isMandatory) {
        missingEvents.push(required);
      }
    }

    if (missingEvents.length > 0) {
      return {
        success: false,
        blocked: true,
        reason: 'Missing required notary events',
        missingEvents,
      };
    }

    order.status = targetStatus;
    order.statusChangedAt = new Date();
    await this.em.flush();

    return { success: true, blocked: false };
  }

  private async getRequiredEvents(
    orderType: OrderType,
    targetStatus: OrderStatus
  ): Promise<RequiredEvent[]> {
    // System defaults for required events per order type and target status
    const defaults: Record<string, RequiredEvent[]> = {
      [`${OrderType.PURCHASE}_${OrderStatus.COMPLETED}`]: [
        { eventType: EventType.GOODS_RECEIVED, requiresGeo: true, requiresPhoto: true, isMandatory: true },
        { eventType: EventType.QC_INSPECTION, requiresGeo: false, requiresPhoto: false, isMandatory: true },
      ],
      [`${OrderType.WORK}_${OrderStatus.IN_PROGRESS}`]: [
        { eventType: EventType.PRODUCTION_STARTED, requiresGeo: false, requiresPhoto: false, isMandatory: true },
      ],
      [`${OrderType.WORK}_${OrderStatus.COMPLETED}`]: [
        { eventType: EventType.MATERIAL_CONSUMED, requiresGeo: false, requiresPhoto: false, isMandatory: true },
        { eventType: EventType.PRODUCTION_COMPLETED, requiresGeo: false, requiresPhoto: true, isMandatory: true },
        { eventType: EventType.QC_INSPECTION, requiresGeo: false, requiresPhoto: false, isMandatory: true },
        { eventType: EventType.BATCH_CREATED, requiresGeo: false, requiresPhoto: false, isMandatory: true },
      ],
      [`${OrderType.SALES}_${OrderStatus.COMPLETED}`]: [
        { eventType: EventType.SHIPMENT_DISPATCHED, requiresGeo: false, requiresPhoto: false, isMandatory: true },
      ],
    };

    return defaults[`${orderType}_${targetStatus}`] || [];
  }
}
```

---

## 9. Inventory Lots

```typescript
// src/modules/operations/entities/inventory-lot.entity.ts
import { Entity, Property, ManyToOne, Enum, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { Organization } from '../../auth/entities/organization.entity';
import { OperationsOrder } from './operations-order.entity';
import { Facility } from './facility.entity';
import { Product } from '../../design/entities/product.entity';
import { WorkspaceVersion } from '../../design/entities/workspace-version.entity';
import { OperationsEvent } from './operations-event.entity';

export enum LotStatus {
  IN_TRANSIT = 'IN_TRANSIT',
  RECEIVED = 'RECEIVED',
  QC_PENDING = 'QC_PENDING',
  AVAILABLE = 'AVAILABLE',
  QUARANTINED = 'QUARANTINED',
  DEPLETED = 'DEPLETED',
  EXPIRED = 'EXPIRED',
  REJECTED = 'REJECTED',
}

@Entity({ tableName: 'inventory_lot' })
@Unique({ properties: ['organization', 'lotNumber'] })
export class InventoryLot extends BaseEntity {
  @ManyToOne(() => Organization)
  @Index()
  organization!: Organization;

  @ManyToOne(() => OperationsOrder, { nullable: true })
  purchaseOrder?: OperationsOrder;

  @ManyToOne(() => Facility)
  @Index()
  facility!: Facility;

  @Property({ length: 50 })
  lotNumber!: string;

  @Property({ length: 50, nullable: true })
  supplierLotNumber?: string;

  @ManyToOne(() => Product)
  @Index()
  product!: Product;

  @ManyToOne(() => WorkspaceVersion, { nullable: true })
  designVersion?: WorkspaceVersion;

  @Property({ type: 'decimal', precision: 12, scale: 4 })
  quantityReceived!: string;

  @Property({ type: 'decimal', precision: 12, scale: 4 })
  quantityAvailable!: string;

  @Property({ type: 'decimal', precision: 12, scale: 4, default: '0' })
  quantityConsumed!: string;

  @Property({ type: 'decimal', precision: 12, scale: 4, default: '0' })
  quantityRejected!: string;

  @Property({ length: 20 })
  unit!: string;

  @Property({ type: 'date', nullable: true })
  productionDate?: Date;

  @Property({ type: 'date' })
  receivedDate!: Date;

  @Property({ type: 'date', nullable: true })
  expiryDate?: Date;

  @Enum(() => LotStatus)
  @Index()
  status!: LotStatus;

  @Property({ nullable: true })
  warehouseId?: string;

  @Property({ length: 50, nullable: true })
  locationCode?: string;

  // Compliance inheritance (snapshot at receipt)
  @Property({ length: 20, nullable: true })
  facilityRiskLevel?: string;

  @Property({ type: 'jsonb', nullable: true })
  facilityCerts?: unknown[];

  @ManyToOne(() => OperationsEvent, { nullable: true })
  receivedEvent?: OperationsEvent;

  @ManyToOne(() => OperationsEvent, { nullable: true })
  qcEvent?: OperationsEvent;
}
```

---

## 10. Batches & Serial Numbers

### 10.1 Batch Entity

```typescript
// src/modules/operations/entities/batch.entity.ts
import { Entity, Property, ManyToOne, OneToMany, Enum, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { Organization } from '../../auth/entities/organization.entity';
import { OperationsOrder } from './operations-order.entity';
import { Facility } from './facility.entity';
import { Product } from '../../design/entities/product.entity';
import { WorkspaceVersion } from '../../design/entities/workspace-version.entity';
import { OperationsEvent } from './operations-event.entity';
import { SerialNumber } from './serial-number.entity';

export enum BatchStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  QC_PENDING = 'QC_PENDING',
  QC_PASSED = 'QC_PASSED',
  QC_FAILED = 'QC_FAILED',
  RELEASED = 'RELEASED',
  ON_HOLD = 'ON_HOLD',
  RECALLED = 'RECALLED',
}

@Entity({ tableName: 'batch' })
@Unique({ properties: ['organization', 'batchNumber'] })
export class Batch extends BaseEntity {
  @ManyToOne(() => Organization)
  @Index()
  organization!: Organization;

  @ManyToOne(() => OperationsOrder)
  @Index()
  workOrder!: OperationsOrder;

  @ManyToOne(() => Facility)
  facility!: Facility;

  @Property({ length: 50 })
  batchNumber!: string;

  @ManyToOne(() => Product)
  @Index()
  product!: Product;

  @ManyToOne(() => WorkspaceVersion)
  designVersion!: WorkspaceVersion;

  @Property({ type: 'int' })
  quantityProduced!: number;

  @Property({ type: 'int', default: 0 })
  quantityPassedQc!: number;

  @Property({ type: 'int', default: 0 })
  quantityFailedQc!: number;

  @Property({ type: 'int', default: 0 })
  quantityAllocated!: number;

  @Property({ type: 'int', default: 0 })
  quantityShipped!: number;

  @Property()
  productionStart!: Date;

  @Property({ nullable: true })
  productionEnd?: Date;

  @Property({ type: 'date', nullable: true })
  releaseDate?: Date;

  @Property({ type: 'date', nullable: true })
  expiryDate?: Date;

  @Enum(() => BatchStatus)
  @Index()
  status!: BatchStatus;

  // Traceability: which lots went into this batch?
  @Property({ type: 'jsonb', default: '[]' })
  consumedLots!: Array<{ lotId: string; quantity: string; unit: string }>;

  @ManyToOne(() => OperationsEvent, { nullable: true })
  createdEvent?: OperationsEvent;

  @ManyToOne(() => OperationsEvent, { nullable: true })
  qcEvent?: OperationsEvent;

  @ManyToOne(() => OperationsEvent, { nullable: true })
  releasedEvent?: OperationsEvent;

  @OneToMany(() => SerialNumber, (s) => s.batch)
  serials!: Collection<SerialNumber>;
}
```

### 10.2 Serial Number Entity

```typescript
// src/modules/operations/entities/serial-number.entity.ts
import { Entity, Property, ManyToOne, Enum, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { Organization } from '../../auth/entities/organization.entity';
import { Batch } from './batch.entity';
import { Product } from '../../design/entities/product.entity';
import { WorkspaceVersion } from '../../design/entities/workspace-version.entity';
import { OperationsOrder } from './operations-order.entity';
import { OperationsEvent } from './operations-event.entity';

export enum SerialStatus {
  GENERATED = 'GENERATED',
  LABELED = 'LABELED',
  IN_STOCK = 'IN_STOCK',
  ALLOCATED = 'ALLOCATED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  RETURNED = 'RETURNED',
  SCRAPPED = 'SCRAPPED',
}

@Entity({ tableName: 'serial_number' })
@Unique({ properties: ['organization', 'serialNumber'] })
export class SerialNumber extends BaseEntity {
  @ManyToOne(() => Organization)
  organization!: Organization;

  @ManyToOne(() => Batch)
  @Index()
  batch!: Batch;

  @Property({ length: 100 })
  serialNumber!: string;

  @ManyToOne(() => Product)
  product!: Product;

  @ManyToOne(() => WorkspaceVersion)
  designVersion!: WorkspaceVersion;

  @Enum(() => SerialStatus)
  @Index()
  status!: SerialStatus;

  // DPP link
  @Property({ nullable: true })
  dppId?: string;

  @Property({ length: 500, nullable: true })
  @Index()
  dppUri?: string;

  // Sales tracking
  @ManyToOne(() => OperationsOrder, { nullable: true })
  salesOrder?: OperationsOrder;

  @Property({ nullable: true })
  shippedAt?: Date;

  @Property({ nullable: true })
  customerId?: string;

  @Property({ length: 255, nullable: true })
  lastKnownLocation?: string;

  @ManyToOne(() => OperationsEvent, { nullable: true })
  generatedEvent?: OperationsEvent;

  @ManyToOne(() => OperationsEvent, { nullable: true })
  shippedEvent?: OperationsEvent;
}
```

### 10.3 Traceability Chain

```
LOT (Input)           BATCH (Output)         SERIAL (Unit)         DPP
-----------           ------------           -------------         ---
+----------+          +-----------+          +-----------+         +---------+
| LOT-001  |--+       | BATCH-    |----+---->| SN-0001   |-------->| DPP-001 |
| Cotton   |  |       | 2026-0042 |    |     +-----------+         +---------+
+----------+  |       |           |    |     +-----------+         +---------+
+----------+  +------>| 500 pcs   |    +---->| SN-0002   |-------->| DPP-002 |
| LOT-002  |--+       +-----------+    |     +-----------+         +---------+
| Polyester|  |                        |          ...                  ...
+----------+  |                        |     +-----------+         +---------+
+----------+  |                        +---->| SN-0500   |-------->| DPP-500 |
| LOT-003  |--+                              +-----------+         +---------+
| Buttons  |
+----------+
```

### 10.4 DPP Lifecycle Integration

| Operations Status | Context | DPP Status | Billing |
|-------------------|---------|------------|---------|
| serial `GENERATED` | Serial created | `COMMISSIONED` | No charge |
| batch `RELEASED` | Batch released | `PROVISIONED` | Per-DPP fee charged |
| serial `DELIVERED` | Delivery confirmed | `ACTIVE` | No charge |
| batch `RECALLED` | Quality issue | `RECALLED` | Recall fee charged |
| serial `SCRAPPED` | End of life | `DECOMMISSIONED` | No charge |

---

## 11. API Endpoints

### Suppliers

```
GET    /api/v1/operations/suppliers                    # List suppliers
GET    /api/v1/operations/suppliers/:id                # Get supplier with facilities
POST   /api/v1/operations/suppliers                    # Create supplier
PUT    /api/v1/operations/suppliers/:id                # Update supplier
PUT    /api/v1/operations/suppliers/:id/status         # Update supplier status
DELETE /api/v1/operations/suppliers/:id                # Archive supplier
```

### Facilities

```
GET    /api/v1/operations/facilities                   # List all facilities
GET    /api/v1/operations/facilities/verified          # List only verified (for BOM)
GET    /api/v1/operations/suppliers/:id/facilities     # List supplier's facilities
GET    /api/v1/operations/facilities/:id               # Get facility detail
POST   /api/v1/operations/suppliers/:id/facilities     # Create facility
PUT    /api/v1/operations/facilities/:id               # Update facility
PUT    /api/v1/operations/facilities/:id/verify        # Verify facility (Editor+)
GET    /api/v1/operations/facilities/:id/risk          # Get risk assessment
```

### Certifications

```
GET    /api/v1/operations/facilities/:id/certifications  # List facility certs
POST   /api/v1/operations/facilities/:id/certifications  # Add certification
PUT    /api/v1/operations/certifications/:id             # Update certification
POST   /api/v1/operations/certifications/:id/verify      # Verify certification
POST   /api/v1/operations/certifications/:id/auto-verify # Attempt auto-verify
DELETE /api/v1/operations/certifications/:id             # Remove certification
```

### Dashboard

```
GET    /api/v1/operations/dashboard/expiring           # Get expiring certs
GET    /api/v1/operations/dashboard/pending            # Get pending verifications
GET    /api/v1/operations/dashboard/stats              # Get compliance stats
```

### Orders

```
GET    /api/v1/operations/orders                       # List orders (filter by type)
GET    /api/v1/operations/orders/:id                   # Get order with events
POST   /api/v1/operations/orders                       # Create order
PUT    /api/v1/operations/orders/:id                   # Update order
POST   /api/v1/operations/orders/:id/submit            # Submit for approval
POST   /api/v1/operations/orders/:id/approve           # Approve order
POST   /api/v1/operations/orders/:id/transition        # Transition status
```

### Events

```
GET    /api/v1/operations/orders/:id/events            # List order events
POST   /api/v1/operations/orders/:id/events            # Record new event (signed)
GET    /api/v1/operations/events/:id                   # Get event detail
POST   /api/v1/operations/events/:id/verify            # Verify event signature
```

### Inventory Lots

```
GET    /api/v1/operations/lots                         # List lots
GET    /api/v1/operations/lots/:id                     # Get lot detail
POST   /api/v1/operations/lots                         # Create lot (with receipt event)
PUT    /api/v1/operations/lots/:id                     # Update lot
POST   /api/v1/operations/lots/:id/qc                  # Record QC result
```

### Batches

```
GET    /api/v1/operations/batches                      # List batches
GET    /api/v1/operations/batches/:id                  # Get batch with traceability
POST   /api/v1/operations/batches                      # Create batch
PUT    /api/v1/operations/batches/:id                  # Update batch
POST   /api/v1/operations/batches/:id/close            # Close batch
POST   /api/v1/operations/batches/:id/release          # Release batch (triggers DPP)
GET    /api/v1/operations/batches/:id/serials          # List batch serials
```

### Serial Numbers

```
GET    /api/v1/operations/serials                      # List serials
GET    /api/v1/operations/serials/:id                  # Get serial detail
POST   /api/v1/operations/batches/:id/serials          # Generate serials for batch
PUT    /api/v1/operations/serials/:id                  # Update serial status
GET    /api/v1/operations/serials/by-dpp/:uri          # Lookup by DPP URI
```

---

## 12. Related Documents

| Document | Relationship |
|----------|--------------|
| [Data Model](./02-data-model.md) | Core entities |
| [Security](./03-security.md) | RBAC model |
| [Design Workspace](./05-design-workspace.md) | BOM facility links |
| [Compliance Workspace](./08-compliance-workspace.md) | DPP lifecycle triggers |
| [Verifiable Credentials](./09-verifiable-credentials.md) | Event signing |
| [Compliance Evaluation System](../guides/compliance-evaluation-system.md) | Batch compliance checks |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-21 | Consolidated from operations-workspace-design; MikroORM entities |
