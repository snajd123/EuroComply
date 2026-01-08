# EuroComply DPP Implementation Roadmap
## Based on Strategic Analysis + Existing Capabilities

---

## Executive Summary

EuroComply has a **significant competitive advantage**: we already have W3C Verifiable Credentials and DID infrastructure via walt.id. Most competitors don't have this.

However, we're missing the **data collection layer** that makes VCs meaningful. This roadmap addresses that gap while leveraging our cryptographic moat.

**Market opportunity**: 99% of EU businesses are SMEs with zero affordable DPP solutions. See [MARKET_ANALYSIS.md](./MARKET_ANALYSIS.md) for TAM, competitive landscape, and revenue projections.

---

## Phase 1: Textile MVP (Q1-Q2 2025) ✅ COMPLETE
**Goal: Compliant DPPs for 544,000+ apparel retailers**

### 1.1 Textile-Specific Schema
Create mandatory fields for EU 2027 "Minimal DPP":

```typescript
interface TextileDppData {
  // MANDATORY (2027)
  fiberComposition: FiberEntry[];      // % by mass
  countryOfOrigin: string;             // ISO 3166-1
  manufacturerIdentification: {
    name: string;
    registrationNumber?: string;       // VAT or company reg
    did?: string;                      // Our advantage: DID-linked
  };
  careInstructions: {
    maxWashTemp: number;               // Celsius
    bleachAllowed: boolean;
    tumbleDry: boolean;
    ironTemp: 'low' | 'medium' | 'high' | 'none';
  };
  hazardousSubstances: {
    reachCompliant: boolean;
    substancesOfConcern: SubstanceEntry[];
  };

  // RECOMMENDED (strengthens VC value)
  carbonFootprint?: {
    value: number;
    unit: 'kgCO2e';
    methodology: 'PEF' | 'ISO14067' | 'GHG Protocol' | 'Higg';
    scope: 'cradle-to-gate' | 'cradle-to-grave';
    dataSource: 'measured' | 'calculated' | 'industry-average';
  };
  recyclability?: {
    percentage: number;
    recyclableComponents: string[];
    endOfLifeInstructions: string;
  };
  certifications?: Certification[];

  // ADVANCED (2030+)
  supplyChainTraceability?: {
    tier1Suppliers: SupplierEntry[];
    tier2Suppliers?: SupplierEntry[];
  };
}

interface FiberEntry {
  fiberType: string;                   // e.g., "Cotton", "Polyester"
  percentage: number;                  // % by mass
  origin?: 'organic' | 'recycled' | 'conventional';
  certificationId?: string;            // Link to certification VC
}
```

### 1.2 Data Collection UI (Shopify App)

New routes:
```
/app/products/:id/dpp-data     - Edit DPP sustainability data
/app/templates                  - Browse textile DPP templates
/app/import/supplier           - CSV import from suppliers
```

Form sections:
1. **Fiber Composition** (mandatory) - Multi-entry form
2. **Care Instructions** (mandatory) - Dropdown/checkbox form
3. **Country of Origin** (mandatory) - Country selector
4. **Carbon Footprint** (optional) - Manual or "Estimate" button
5. **Certifications** (optional) - Add GOTS, OEKO-TEX, etc.

### 1.3 Template Library (Quick Start)

Pre-built templates with industry benchmarks:
```
templates/textile/
├── tshirt-cotton.json          # 5.5 kgCO2e benchmark
├── tshirt-organic-cotton.json  # 3.8 kgCO2e benchmark
├── jeans-denim.json            # 12.5 kgCO2e benchmark
├── jacket-polyester.json       # 9.5 kgCO2e benchmark
├── dress-mixed.json
└── footwear-leather.json       # 65 kgCO2e benchmark
```

### 1.4 Validation Engine

Before VC issuance, validate:
```typescript
function validateTextileDpp(data: TextileDppData): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // MANDATORY checks (block issuance if missing)
  if (!data.fiberComposition?.length) {
    errors.push('Fiber composition is required for textile DPPs');
  }
  if (sumPercentages(data.fiberComposition) !== 100) {
    errors.push('Fiber percentages must sum to 100%');
  }
  if (!data.countryOfOrigin) {
    errors.push('Country of origin is required');
  }
  if (!data.careInstructions) {
    errors.push('Care instructions are required');
  }

  // RECOMMENDED checks (warn but allow)
  if (!data.carbonFootprint) {
    warnings.push('Carbon footprint recommended for consumer trust');
  }
  if (!data.certifications?.length) {
    warnings.push('Third-party certifications strengthen credibility');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    completenessScore: calculateCompleteness(data),
  };
}
```

---

## Phase 2: Third-Party Data Integration (Q2-Q3 2025) ✅ COMPLETE
**Goal: Auto-populate data from industry databases**

### 2.1 Higg Index (Worldly) Integration

The Higg MSI provides peer-reviewed LCA data for materials:

```typescript
// Integration with Higg/Worldly API
interface HiggMaterialData {
  materialId: string;
  globalWarmingPotential: number;  // kgCO2e per kg
  waterScarcity: number;           // m³ per kg
  eutrophication: number;          // kg PO4e per kg
  chemistry: 'conventional' | 'organic' | 'recycled';
}

async function fetchHiggData(materialType: string): Promise<HiggMaterialData> {
  const response = await higgApi.getMaterialImpact(materialType);
  return {
    materialId: response.id,
    globalWarmingPotential: response.gwp,
    waterScarcity: response.water,
    eutrophication: response.eutro,
    chemistry: response.process,
  };
}

// Auto-calculate carbon footprint from fiber composition
function calculateCarbonFromHigg(
  fibers: FiberEntry[],
  productWeight: number
): CarbonFootprint {
  let totalCO2e = 0;

  for (const fiber of fibers) {
    const higgData = await fetchHiggData(fiber.fiberType);
    const fiberWeight = productWeight * (fiber.percentage / 100);
    totalCO2e += fiberWeight * higgData.globalWarmingPotential;
  }

  return {
    value: Math.round(totalCO2e * 100) / 100,
    unit: 'kgCO2e',
    methodology: 'Higg',
    scope: 'cradle-to-gate',
    dataSource: 'calculated',
  };
}
```

### 2.2 Certification Registry Integration

Connect to certification databases:

| Registry | Data Available | Integration |
|----------|---------------|-------------|
| GOTS Database | Organic textile certs | API lookup by cert number |
| OEKO-TEX | Chemical safety certs | API verification |
| GRS (Global Recycled Standard) | Recycled content | Certificate validation |
| Bluesign | Chemical management | Partner API |

```typescript
async function verifyCertification(
  certType: string,
  certNumber: string
): Promise<CertificationVerification> {
  switch (certType) {
    case 'GOTS':
      return await gotsApi.verify(certNumber);
    case 'OEKO-TEX':
      return await oekotexApi.verify(certNumber);
    case 'GRS':
      return await grsApi.verify(certNumber);
    default:
      return { verified: false, reason: 'Unknown certification type' };
  }
}
```

---

## Phase 2.5: Supplier SaaS Platform ✅ COMPLETE
**Goal: Enable SME suppliers to create DPPs via SaaS subscription**

### 2.5.1 Supplier Portal

Standalone supplier authentication and management:

```typescript
// Supplier Portal Features
- Email/password registration with JWT auth
- SaaS subscription (€49/149/399 per month)
- Company verification workflow
- Product DPP creation with textile schema
- Verifiable Credential issuance (did:key)
- Catalog visibility controls (public/private/invite-only)
- Data portability (export VCs + keys)
```

**API Endpoints:**
- `POST /api/suppliers/register` - Register new supplier
- `POST /api/suppliers/login` - Authenticate supplier
- `GET/PATCH /api/suppliers/me` - Profile management
- `POST /api/suppliers/verification` - Submit verification docs
- `GET/POST/PATCH/DELETE /api/suppliers/products` - Product CRUD
- `GET /api/suppliers/plan` - SaaS subscription status
- `POST /api/suppliers/export` - Export all VCs and data

### 2.5.2 Retailer Catalog Access (Free - ESPR Article 31)

Retailers (via Shopify/WooCommerce plugins) access supplier DPPs for FREE:

```
┌─────────────────────────────────────────────────────────────────────┐
│  SUPPLIER CATALOG IN SHOPIFY APP (Free Access)                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Browse verified supplier products:                                 │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ ABC Textiles (Verified ✓)                                       ││
│  │ "Organic Cotton T-Shirt Base"                                   ││
│  │ 100% Organic Cotton | Made in PT | 3.2 kgCO2e                  ││
│  │ GOTS Certified | did:key verified | Used by 45 retailers        ││
│  │                                                                  ││
│  │ [Link DPP - Free]  [View Details]                               ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  IMPORTANT: Retailers access DPPs for FREE (ESPR Article 31).       │
│  They cannot create, copy, or modify DPP data.                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.5.3 Pricing Model (Supplier-Pays SaaS)

```typescript
// SaaS Pricing Tiers (Suppliers Pay, Retailers Free)
const PRICING_TIERS = {
  starter: { monthly: 49, dppLimit: 50 },
  growth: { monthly: 149, dppLimit: 500 },
  pro: { monthly: 399, dppLimit: 2000 },
};

// ESPR Article 31: Retailers access DPPs for free
// We cannot charge for DPP access - it's EU law
```

**Supplier Dashboard:**
- `GET /api/suppliers/plan` - Current SaaS tier and usage
- `GET /api/suppliers/products` - Products and retailer adoption
- `POST /api/suppliers/export` - Export all data (portability)

---

## Phase 3: Shopify Metaobject Sync (Q3 2025)
**Goal: Store DPP subscription data natively in Shopify for retailer access**

### 3.1 Metaobject Definitions

Create Shopify metaobject definitions for DPP data:

```graphql
mutation CreateDppMetaobjectDefinition {
  metaobjectDefinitionCreate(definition: {
    name: "Digital Product Passport"
    type: "dpp_record"
    fieldDefinitions: [
      { key: "category", type: "single_line_text_field" }
      { key: "fiber_composition", type: "json" }
      { key: "carbon_footprint", type: "json" }
      { key: "country_of_origin", type: "single_line_text_field" }
      { key: "care_instructions", type: "json" }
      { key: "certifications", type: "json" }
      { key: "eurocomply_dpp_id", type: "single_line_text_field" }
      { key: "vc_credential_id", type: "single_line_text_field" }
      { key: "vc_issued_at", type: "date_time" }
    ]
  }) {
    metaobjectDefinition { id }
  }
}
```

### 3.2 Bi-Directional Sync

```
┌─────────────────────────────────────────────────────────────┐
│  SYNC ARCHITECTURE                                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Shopify                        EuroComply                   │
│  Metaobjects                    API                          │
│                                                              │
│  ┌────────────┐   on edit      ┌────────────┐               │
│  │ DPP Data   │ ──────────────►│ Validate   │               │
│  │ (source)   │                │ & Store    │               │
│  └────────────┘                └─────┬──────┘               │
│        ▲                             │                       │
│        │                             ▼                       │
│        │    write back         ┌────────────┐               │
│        │◄──────────────────────│ Issue VC   │               │
│        │    (credential ID)    │ (walt.id)  │               │
│                                └────────────┘               │
│                                                              │
│  Benefits:                                                   │
│  • Retailer owns their subscription data (survives uninstall)│
│  • Can display in theme via Liquid                          │
│  • VC adds cryptographic proof layer                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 4: Furniture & Electronics (2026)
**Goal: Expand to next priority categories ahead of regulatory deadlines**

*Note: Timing aligned with ESPR deadlines - Furniture (2029), Electronics (2030). Being ready 2-3 years early captures the "evaluation" and "panic buy" phases.*

### 4.1 Furniture Schema (2029 deadline)

```typescript
interface FurnitureDppData {
  // MANDATORY
  billOfMaterials: MaterialComponent[];
  disassemblyInstructions: string | URL;
  durabilityTestResults?: {
    testStandard: string;  // e.g., "EN 12520"
    result: 'pass' | 'fail';
    cyclesCompleted?: number;
  };

  // RECOMMENDED
  repairability: {
    score: number;  // 1-10
    spareParts: SparePartEntry[];
    repairGuideUrl?: string;
  };
  chemicalEmissions?: {
    formaldehyde: number;  // mg/m³
    voc: number;           // µg/m³
  };
}
```

### 4.2 Electronics Schema (2030 deadline)

```typescript
interface ElectronicsDppData {
  // MANDATORY
  repairabilityScore: number;           // EU standard 1-10
  spareParts: {
    available: SparePartEntry[];
    availabilityYears: number;          // e.g., 7 years
    deliveryDays: number;               // Max delivery time
  };
  rohsCompliant: boolean;
  weeeRegistrationNumber: string;

  // MANDATORY for batteries
  batteryInfo?: {
    chemistry: string;
    capacity: number;
    removable: boolean;
    recycledContent: number;            // %
  };

  // RECOMMENDED
  softwareSupport: {
    securityUpdatesYears: number;
    osCompatibility: string[];
  };
  energyEfficiency?: {
    class: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
    annualConsumption: number;          // kWh
  };
}
```

---

## Phase 5: Advanced Features (2026+)
**Goal: Full circular economy integration**

### 5.1 Item-Level Tracking
- Unique serial numbers per item
- Ownership transfer records
- Repair/refurbishment history

### 5.2 Supply Chain VCs
- Supplier issues VC for their materials
- Retailers access supplier's DPP (free - ESPR Article 31)
- Chain of custody verification

### 5.3 Interoperability (SME-Focused)
- GS1 Digital Link resolver (QR code interoperability)
- Basic AAS export (compliance format for regulators)
- EBSI optional (if institutional trust needed - not SME priority)

---

## Market Timing & ESPR Deadlines

See [MARKET_ANALYSIS.md](./MARKET_ANALYSIS.md) for full market opportunity analysis.

```
┌─────────────────────────────────────────────────────────────────┐
│  ESPR COMPLIANCE TIMELINE                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  2024: ESPR enters into force                                   │
│  2025: First delegated acts (product-specific rules)            │
│  2026: Battery DPP requirements active                          │
│  2027: Textile DPP requirements active ← KEY DEADLINE           │
│  2028-2030: Electronics, furniture, construction                │
│                                                                  │
│  SME behavior pattern:                                          │
│  • 2024-2025: "What is DPP?" (awareness)                        │
│  • 2026: "We need to figure this out" (evaluation)              │
│  • 2027: "Deadline is here, we need a solution NOW" (panic buy) │
│                                                                  │
│  Our opportunity: Be the obvious choice when panic hits         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Vertical Expansion Strategy

Aligned with regulatory deadlines (focus beats breadth):

| Phase | Category | Regulatory Deadline | Our Timeline |
|-------|----------|---------------------|--------------|
| **Current** | Textiles | 2027 | ✅ Ready |
| **Next** | Furniture | 2029 | 2026 (early) |
| **Future** | Electronics, Batteries | 2030 | 2027 |

---

## Resource Estimates

| Phase | Effort | Priority | Status |
|-------|--------|----------|--------|
| Phase 1: Textile MVP | 4-6 weeks | **CRITICAL** | ✅ Complete |
| Phase 2: Data APIs | 3-4 weeks | HIGH | ✅ Complete |
| Phase 2.5: Supplier SaaS Platform | 3-4 weeks | HIGH | ✅ Complete |
| Phase 3: Metaobjects | 2-3 weeks | MEDIUM | Planned |
| Phase 4: Furniture/Electronics | 4-6 weeks | HIGH | 2026 (aligned with deadlines) |
| Phase 5: Advanced | Ongoing | MEDIUM | Future |

---

## Competitive Positioning (SME Focus)

### What We Have (Unique)
- ✅ W3C Verifiable Credentials (walt.id)
- ✅ did:key identity (portable, self-verifying, no lock-in)
- ✅ Cryptographic signature verification
- ✅ Public verification endpoint (works offline)
- ✅ Data portability (export VCs + keys anytime)

### What We've Added ✅
- ✅ Category-specific data schemas (Textile complete)
- ✅ Compliance validation engine
- ✅ Third-party data integration (Higg MSI)
- ✅ Supplier SaaS Platform (€49-399/month)
- ✅ Free retailer access (ESPR Article 31)
- 📋 Shopify Metaobject sync (planned)

### SME-Focused Competitor Comparison

| Capability | Enterprise (SAP/Siemens) | **EuroComply (SME)** |
|------------|--------------------------|---------------------|
| Target market | Large enterprises | **SMEs (99% of EU)** |
| Price | €100k+ | **€49-399/month** |
| Setup time | Months | **Same day** |
| IT team required | Yes | **No** |
| Verifiable Credentials | Varies | **W3C VC (did:key)** |
| Data portability | Limited | **Full export** |
| Lock-in | High | **None** |

**Our moat: Affordable + Simple + Portable + ESPR Compliant**
