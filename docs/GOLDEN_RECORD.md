# The Golden Record

## What is a Golden Record?

The **Golden Record** is a Master Data Management (MDM) concept representing the single, authoritative version of a data entity. In EuroComply, each product has exactly one Golden Record in The Hub - the unified, always-synchronized source of truth that combines data from all workspaces.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         THE GOLDEN RECORD CONCEPT                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PROBLEM: Product data scattered across systems                             │
│                                                                              │
│    PLM System        ERP System         PIM System        Spreadsheets      │
│    ┌─────────┐      ┌─────────┐        ┌─────────┐       ┌─────────┐       │
│    │ BOMs    │      │ Batches │        │ Content │       │ Certs   │       │
│    │ Specs   │      │ Inventory│       │ Images  │       │ Test    │       │
│    └─────────┘      └─────────┘        └─────────┘       │ Results │       │
│         │                │                  │            └─────────┘       │
│         └────────────────┴──────────────────┴────────────────┘              │
│                                    │                                        │
│                         Which version is correct?                           │
│                         Data conflicts everywhere                           │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SOLUTION: One Golden Record per product                                    │
│                                                                              │
│                    ┌─────────────────────────────┐                          │
│                    │      GOLDEN RECORD          │                          │
│                    │   (Single Source of Truth)  │                          │
│                    │                             │                          │
│                    │  All data unified           │                          │
│                    │  No duplicates              │                          │
│                    │  No conflicts               │                          │
│                    │  Always current             │                          │
│                    └─────────────────────────────┘                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Golden Record in EuroComply

In EuroComply, the Golden Record lives in **The Hub** - our central data store. Each product has one Golden Record that:

- **Unifies** data from all four workspaces (Design, Operations, Marketing, Compliance)
- **Synchronizes** instantly - changes in any workspace are immediately visible everywhere
- **Eliminates** duplicate and conflicting product data
- **Serves** as the foundation for DPP issuance

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              THE HUB                                         │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    GOLDEN RECORD (Product X)                          │  │
│  │                                                                       │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐ │  │
│  │  │   DESIGN    │ │ OPERATIONS  │ │  MARKETING  │ │   ATTESTATIONS  │ │  │
│  │  │    DATA     │ │    DATA     │ │    DATA     │ │                 │ │  │
│  │  ├─────────────┤ ├─────────────┤ ├─────────────┤ ├─────────────────┤ │  │
│  │  │ Registry    │ │ Batches     │ │ Names       │ │ Material origin │ │  │
│  │  │ BOMs        │ │ Serials     │ │ Descriptions│ │ Test results    │ │  │
│  │  │ Materials   │ │ EPCIS events│ │ Media       │ │ Certifications  │ │  │
│  │  │ Tech docs   │ │ Inventory   │ │ Pricing     │ │ Audit reports   │ │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────┘ │  │
│  │                                                                       │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │  │
│  │  │                    COMPLIANCE METADATA                          │ │  │
│  │  │  Completeness: 100% │ Family: Textile │ Last issued: 2026-01-10 │ │  │
│  │  └─────────────────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Golden Record Structure

Every Golden Record contains these data categories:

### 1. Identity

The unique identifiers for the product:

| Field | Description | Example |
|-------|-------------|---------|
| Internal ID | EuroComply's unique identifier | `prod_abc123xyz` |
| SKU | Organization's stock keeping unit | `TSH-ORG-001` |
| GTIN/EAN | Global Trade Item Number (barcode) | `5901234567890` |
| Brand + SKU | Fallback identifier when no GTIN | `acme/TSH-001` |
| Serial Numbers | Item-level identifiers (optional) | `SN-2026-001234` |

### 2. Technical Data (from Design Workspace)

The product's technical foundation:

```
Technical Data
├── Product Structure
│   ├── Product type and family
│   ├── Parent/variant relationships
│   └── Revision history
│
├── Bill of Materials (BOM)
│   ├── Components and sub-assemblies
│   ├── Raw materials
│   └── Quantities and units
│
├── Material Composition
│   ├── Materials from library
│   ├── Percentages (e.g., 95% cotton, 5% elastane)
│   └── Sustainability properties per material
│
├── Technical Documents
│   ├── CAD files, tech packs
│   ├── MSDS sheets
│   └── Specifications
│
└── Certifications
    ├── GOTS, OEKO-TEX, FSC, etc.
    ├── Certificate numbers
    └── Validity dates
```

### 3. Operations Data (from Operations Workspace)

Supply chain and lifecycle data:

```
Operations Data
├── Batch/Lot Management
│   ├── Batch numbers
│   ├── Production dates
│   └── Quantities
│
├── Serial Number Tracking
│   ├── Individual item identifiers
│   └── Assignment history
│
├── EPCIS Events
│   ├── Manufacturing events
│   ├── Shipping/receiving
│   ├── Transport with carbon data
│   └── End-of-life tracking
│
└── Inventory
    ├── Stock levels
    ├── Locations
    └── Reorder points
```

### 4. Commercial Data (from Marketing Workspace)

Content for sales channels:

```
Commercial Data
├── Product Content
│   ├── Names (multi-language)
│   ├── Descriptions (multi-language)
│   ├── SEO keywords
│   └── Marketing copy
│
├── Media Assets
│   ├── Product images
│   ├── Videos
│   └── Galleries
│
├── Pricing
│   ├── Base price
│   ├── Currency
│   └── Channel-specific pricing
│
└── Channel Data
    ├── Shopify metafields
    ├── Marketplace listings
    └── Syndication status
```

### 5. Attestations (from any Workspace)

Third-party verified data:

```
Attestations
├── Material Attestations
│   ├── Issuer: Supplier DID
│   ├── Data: Material origin, composition
│   ├── Signature: Verifiable Credential
│   └── Expiry: Optional date
│
├── Test Result Attestations
│   ├── Issuer: Lab DID
│   ├── Data: Carbon footprint, chemical tests
│   ├── Signature: Verifiable Credential
│   └── Expiry: Typically 1 year
│
├── Certification Attestations
│   ├── Issuer: Certifier DID
│   ├── Data: Certificate details
│   ├── Signature: Verifiable Credential
│   └── Expiry: Matches certificate
│
└── Audit Attestations
    ├── Issuer: Auditor DID
    ├── Data: Audit findings
    ├── Signature: Verifiable Credential
    └── Expiry: Typically 1 year
```

### 6. Compliance Metadata

DPP readiness and history:

```
Compliance Metadata
├── Completeness Scores
│   ├── DPP channel: 100%
│   ├── Shopify channel: 95%
│   └── Per-field breakdown
│
├── Product Family
│   ├── Family: Textile / Electronics / Battery / etc.
│   ├── Required fields for family
│   └── Template used
│
├── DPP Issuance History
│   ├── Version 1: Issued 2026-01-10
│   ├── Version 2: Issued 2026-03-15 (updated materials)
│   └── Current active version
│
└── Audit Trail
    ├── Who changed what, when
    ├── Change reasons
    └── Approval history
```

---

## How the Golden Record is Built

The Golden Record is built progressively as data flows from workspaces:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    GOLDEN RECORD LIFECYCLE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STEP 1: Product Created (Design Workspace)                                 │
│  ───────────────────────────────────────────                                │
│  Golden Record initialized with:                                            │
│  • Identity (SKU, GTIN)                                                     │
│  • Product family assignment                                                │
│  • Basic structure                                                          │
│  Completeness: ~20%                                                         │
│                                                                              │
│  STEP 2: Technical Data Added (Design Workspace)                            │
│  ───────────────────────────────────────────────                            │
│  Golden Record enriched with:                                               │
│  • BOM and materials                                                        │
│  • Technical specifications                                                 │
│  • Certifications                                                           │
│  Completeness: ~50%                                                         │
│                                                                              │
│  STEP 3: Commercial Data Added (Marketing Workspace)                        │
│  ─────────────────────────────────────────────────                          │
│  Golden Record enriched with:                                               │
│  • Product names and descriptions                                           │
│  • Images and media                                                         │
│  • Pricing and channel data                                                 │
│  Completeness: ~70%                                                         │
│                                                                              │
│  STEP 4: Attestations Added (Any Workspace)                                 │
│  ──────────────────────────────────────────                                 │
│  Golden Record enriched with:                                               │
│  • Third-party verified data                                                │
│  • Signed credentials from suppliers, labs                                  │
│  Completeness: ~90%                                                         │
│                                                                              │
│  STEP 5: Remaining Fields Completed                                         │
│  ──────────────────────────────────                                         │
│  Golden Record reaches:                                                     │
│  • 100% completeness for DPP channel                                        │
│  • Product appears in DPP Ready list                                        │
│  Completeness: 100%                                                         │
│                                                                              │
│  STEP 6: DPP Issued (Compliance Workspace)                                  │
│  ─────────────────────────────────────────                                  │
│  • Organization reviews Golden Record                                       │
│  • Approves for DPP issuance                                               │
│  • Verifiable Credential created and signed                                │
│  • DPP now publicly accessible                                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Completeness Scoring

The Golden Record tracks completeness per channel. Different channels have different requirements:

### DPP Channel (ESPR Compliance)

| Field Category | Weight | Required Fields |
|----------------|--------|-----------------|
| Identity | 10% | SKU, GTIN or Brand+SKU |
| Materials | 25% | Composition with percentages |
| Sustainability | 25% | Carbon footprint, recyclability |
| Manufacturing | 15% | Country of origin, manufacturer |
| Care/Repair | 15% | Care instructions, repair info |
| Certifications | 10% | Any applicable certifications |

### Shopify Channel

| Field Category | Weight | Required Fields |
|----------------|--------|-----------------|
| Identity | 20% | SKU, title |
| Content | 40% | Description, SEO |
| Media | 30% | At least one image |
| Pricing | 10% | Price in default currency |

### Completeness Calculation

```
DPP Completeness = (Filled Required Fields / Total Required Fields) × 100

Example:
- Materials: ✓ (25%)
- Carbon footprint: ✓ (15%)
- Recyclability: ✓ (10%)
- Country of origin: ✓ (15%)
- Care instructions: ✗ (0%)
- GTIN: ✓ (10%)
- Certifications: ✓ (10%)

Total: 85% complete
Missing: Care instructions (15%)
```

---

## Golden Record vs. DPP Credential

A critical distinction:

| Aspect | Golden Record | DPP Credential |
|--------|---------------|----------------|
| **Location** | The Hub (central database) | Issued as Verifiable Credential |
| **Mutability** | Live, always updatable | Immutable once signed |
| **Purpose** | Manage product data | Prove product data at a point in time |
| **Updates** | Instant across workspaces | Requires new version issuance |
| **Versioning** | Continuous (audit trail) | Discrete versions (v1, v2, v3) |

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    GOLDEN RECORD → DPP RELATIONSHIP                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   GOLDEN RECORD (Live in Hub)              DPP CREDENTIAL (Signed Snapshot) │
│   ─────────────────────────────            ─────────────────────────────────│
│                                                                              │
│   ┌─────────────────────────┐              ┌─────────────────────────┐      │
│   │ Product: T-Shirt        │              │ DPP v1                  │      │
│   │ Materials: 95% cotton   │──── Issue ──▶│ Issued: 2026-01-10      │      │
│   │ Carbon: 4.2 kgCO2e      │   (snapshot) │ Materials: 95% cotton   │      │
│   │ Status: Active          │              │ Carbon: 4.2 kgCO2e      │      │
│   └─────────────────────────┘              │ Signature: ✓ Valid      │      │
│              │                             └─────────────────────────┘      │
│              │                                                               │
│              │ Update materials                                              │
│              ▼                                                               │
│   ┌─────────────────────────┐              ┌─────────────────────────┐      │
│   │ Product: T-Shirt        │              │ DPP v2                  │      │
│   │ Materials: 100% cotton  │──── Issue ──▶│ Issued: 2026-03-15      │      │
│   │ Carbon: 3.8 kgCO2e      │   (snapshot) │ Materials: 100% cotton  │      │
│   │ Status: Active          │              │ Carbon: 3.8 kgCO2e      │      │
│   └─────────────────────────┘              │ Signature: ✓ Valid      │      │
│                                            └─────────────────────────┘      │
│                                                                              │
│   The Golden Record keeps changing.        Both DPP versions remain valid.  │
│   It's always current.                     Each was true at issuance time.  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Updates and Re-issuance

When the Golden Record changes after DPP issuance:

### Scenario: Material Composition Updated

```
Timeline:
─────────────────────────────────────────────────────────────────────────────

Jan 10: DPP v1 issued
        Materials: 95% organic cotton, 5% elastane

Feb 15: Supplier provides updated attestation
        Golden Record updated: 97% organic cotton, 3% elastane

        → DPP v1 is still valid (was true on Jan 10)
        → Organization can choose to issue DPP v2

Mar 1:  Organization issues DPP v2
        Materials: 97% organic cotton, 3% elastane

        → Both v1 and v2 exist
        → v2 is "current", v1 is "superseded"
        → QR codes can point to latest or specific version
```

### When to Re-issue

| Change Type | Re-issue Recommended? | Reason |
|-------------|----------------------|--------|
| Material composition | Yes | Core DPP data changed |
| Carbon footprint | Yes | Sustainability data changed |
| Description/marketing | No | Not part of DPP credential |
| New attestation added | Optional | Strengthens trust |
| Certification expired | Yes | Compliance impact |
| Price change | No | Not part of DPP credential |

---

## Data Conflict Resolution

When data comes from multiple sources, the Golden Record uses these rules:

### Priority Order

1. **Attestations** (highest trust) - Third-party signed data wins
2. **Design workspace** - Technical authority for product specs
3. **Operations workspace** - Authority for supply chain data
4. **Marketing workspace** - Authority for commercial content
5. **Import/AI** (lowest) - Suggested data, needs confirmation

### Example: Material Composition Conflict

```
Scenario:
- AI Import suggests: "100% cotton"
- Design workspace enters: "95% cotton, 5% elastane"
- Supplier attestation states: "97% organic cotton, 3% elastane"

Resolution:
→ Supplier attestation wins (highest trust)
→ Golden Record shows: 97% organic cotton, 3% elastane
→ Data source tracked: "Attested by Supplier XYZ"
```

### Data Source Tracking

Every field in the Golden Record tracks its source:

| Field | Value | Source | Timestamp |
|-------|-------|--------|-----------|
| Materials | 97% organic cotton | Attestation (Supplier XYZ) | 2026-02-15 |
| Carbon footprint | 3.8 kgCO2e | Attestation (Lab ABC) | 2026-01-20 |
| Description | "Premium organic..." | Marketing workspace | 2026-01-12 |
| Country of origin | Portugal | Design workspace | 2026-01-10 |

---

## Querying the Golden Record

### From Workspaces

Each workspace sees a filtered view of the Golden Record:

| Workspace | Sees | Can Edit |
|-----------|------|----------|
| Design | Technical data, materials, certifications | Yes |
| Operations | Batches, EPCIS, inventory | Yes |
| Marketing | Content, media, pricing | Yes |
| Compliance | Everything (read-only) | No (only issues DPPs) |

### From API

```
GET /api/v1/products/:id

Response: Full Golden Record
{
  "id": "prod_abc123",
  "identity": { ... },
  "technical": { ... },
  "operations": { ... },
  "commercial": { ... },
  "attestations": [ ... ],
  "compliance": {
    "completeness": { "dpp": 100, "shopify": 95 },
    "dppVersions": [ ... ]
  }
}
```

---

## Summary

| Question | Answer |
|----------|--------|
| What is a Golden Record? | The single, authoritative version of a product's data |
| Where does it live? | In The Hub (central data store) |
| How many per product? | Exactly one |
| Who can write to it? | Design, Operations, Marketing workspaces |
| Who reads it for DPP? | Compliance workspace |
| Is it mutable? | Yes - always updatable |
| How does it relate to DPP? | DPP is a signed snapshot of the Golden Record |
| What about conflicts? | Attestations win, then workspace authority |

---

## Related Documentation

- [README.md](../README.md) - Platform overview with Hub architecture
- [PASSPORT_TRUST_MODEL.md](./PASSPORT_TRUST_MODEL.md) - Trust architecture
- [DPP_CONTENT_PLAN.md](./DPP_CONTENT_PLAN.md) - Content creation workflow
- [MULTI_PARTY_ATTESTATION.md](./MULTI_PARTY_ATTESTATION.md) - Third-party data

---

*Last Updated: 2026-01-11*
