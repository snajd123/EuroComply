# DPP Content Strategy: How Organizations Create Product Data

## Overview

Brands, manufacturers, and distributors manage product data and generate Digital Product Passports using EuroComply's unified platform with **four purpose-built workspaces**: Design (PLM), Operations (ERP-lite), Marketing (PIM), and Compliance (DPP). All workspaces read from and write to **The Hub** - the central data store where each product has a single **Golden Record**. Design defines product structure and materials, Marketing enriches with commercial content, and Compliance reads the complete Golden Record to issue DPPs. When completeness reaches 100%, products appear in the DPP Ready list for review and manual approval before issuance. Retailers access DPPs for free via our public API, embeddable widget, or Shopify Retailer App.

See [BUSINESS_MODEL.md](./BUSINESS_MODEL.md) for the full pricing model.

---

## Workspace Data Flow

All workspaces write to and read from **The Hub** - the central data store:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              THE HUB                                         │
│                    (Central Data Store - Golden Record)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Product data is always synchronized. Changes in any workspace are          │
│  immediately visible in all others.                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
        ▲ WRITE              ▲ WRITE              ▲ WRITE         │ READ
        │                    │                    │               │
┌───────┴───────┐    ┌───────┴───────┐    ┌──────┴────────┐    ┌──▼──────────┐
│ DESIGN (PLM)  │    │  OPERATIONS   │    │MARKETING (PIM)│    │ COMPLIANCE  │
│               │    │  (ERP-lite)   │    │               │    │   (DPP)     │
│ Writes:       │    │ Writes:       │    │ Writes:       │    │             │
│ • Registry    │    │ • Batches     │    │ • PIM content │    │ Reads Hub   │
│ • BOMs        │    │ • EPCIS       │    │ • Media       │    │ Reviews     │
│ • Materials   │    │ • Attestations│    │ • Channels    │    │ Issues DPPs │
│ • Attestations│    └───────────────┘    └───────────────┘    └─────────────┘
└───────────────┘
```

| Workspace | Role in DPP Creation | Hub Access |
|-----------|---------------------|------------|
| **Design** | Define product structure, materials, sustainability properties | Write |
| **Operations** | Track supply chain, batches, serial numbers | Write |
| **Marketing** | Add commercial content, descriptions, media | Write |
| **Compliance** | Review completeness, approve and issue DPPs | **Read + Issue** |

---

## The Challenge

Creating ESPR-compliant Digital Product Passports requires **category-specific, product-specific sustainability data** that brands and manufacturers have access to.

| Challenge | Description |
|-----------|-------------|
| **Category-specific requirements** | Textiles need fiber composition; batteries need chemical composition |
| **Mandatory vs optional fields** | Different categories have different mandatory fields |
| **Data fragmentation** | Product data exists in spreadsheets, PDFs, and legacy systems |
| **Data verification** | Claims need to be verifiable, not just stated |
| **Varying timelines** | Different categories have different compliance deadlines |

---

## Product Data Creation Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│              GOLDEN RECORD CREATION FLOW                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. ORGANIZATION ONBOARDING                                         │
│     ├─ Sign up for plan (€129/€399/Custom - unlimited users)        │
│     └─ Immediate access after registration and payment              │
│                                                                      │
│  2. IDENTITY CREATION                                               │
│     ├─ Generate did:key (portable, self-contained identity)        │
│     └─ Private key stored securely (exportable on request)         │
│                                                                      │
│  3. PRODUCT FAMILY SELECTION                                        │
│     └─ Select: Textile / Electronics / Battery / Furniture / Other │
│                                                                      │
│  4. DATA IMPORT (Available in all workspaces)                       │
│     ├─ AI Import: Upload any file (CSV, Excel, PDF, JSON)          │
│     ├─ Manual Entry: Dashboard forms                                │
│     ├─ Shopify Sync: Import existing products                      │
│     └─ Templates: Industry-standard defaults                        │
│                                                                      │
│  5. DESIGN WORKSPACE: Product Structure (Registry + Materials)      │
│     ├─ Create product in Registry (SKU, GTIN, versions)            │
│     ├─ Define BOMs (bill of materials with components)             │
│     ├─ Add materials from Materials Library (sustainability props)  │
│     ├─ Upload technical documentation (DAM-Tech)                    │
│     └─ Attach certifications via Attestation module                 │
│                                                                      │
│  6. MARKETING WORKSPACE: Commercial Enrichment (PIM)                │
│     ├─ Add product descriptions, titles (multi-language)           │
│     ├─ SEO content and marketing copy                               │
│     ├─ Upload media assets (DAM-Media: photos, videos)             │
│     └─ Channel-specific data for Shopify/marketplaces               │
│                                                                      │
│  7. COMPLIANCE WORKSPACE: DPP Ready List                            │
│     ├─ View products at 100% DPP completeness                      │
│     ├─ Read Golden Record from Hub (all data already synchronized) │
│     └─ Products queue for manual approval                          │
│                                                                      │
│  8. DPP ISSUANCE (Manual approval in Compliance workspace)          │
│     ├─ User approves product for DPP issuance                      │
│     ├─ Sign DPP data with did:key                                  │
│     └─ Generate Verifiable Credential (portable, tamper-evident)   │
│                                                                      │
│  9. SYNDICATION (Marketing workspace)                               │
│     ├─ DPP metadata synced to Shopify                              │
│     └─ Public API makes DPP accessible to retailers                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Entry Methods

### Method 1: AI-Powered Import (Primary)

Upload any file format and let AI extract and map product data automatically.

**Supported Formats:**
- CSV/Excel spreadsheets
- PDF catalogs and spec sheets
- JSON data exports
- Images with product information (OCR)

**AI Import Flow:**
1. Upload file(s) to the import wizard
2. AI extracts product data automatically
3. Review suggested field mappings
4. Approve or adjust mappings
5. Products created as Golden Records
6. Completeness scores calculated per channel

### Method 2: Category-Specific Forms

Guided forms tailored to each product family for manual entry.

**Dashboard Product Form:**
- Core Fields: Product Name, SKU, GTIN, Description
- Family-specific fields loaded dynamically
- Completeness indicator shows progress toward DPP readiness
- Rich text and image upload for commercial content

### Method 3: Templates Library

Pre-built templates with industry defaults for common product types within each Product Family.

```typescript
const TEXTILE_TSHIRT_TEMPLATE = {
  family: 'APPAREL',
  productType: 'T-Shirt',
  defaults: {
    durability: { expectedLifespan: 2, unit: 'years' },
    recyclability: { percentage: 85 },
  },
  requiredOverrides: [
    'fiberComposition',
    'manufacturerCountry',
  ],
  suggestedFields: [
    'carbonFootprint',
    'certifications',
  ],
  industryBenchmarks: {
    carbonFootprint: { value: 5.5, unit: 'kgCO2e', source: 'WRAP UK Average' },
  }
};
```

**Template Library Structure:**
```
templates/
├── textiles/
│   ├── tshirt.json
│   ├── jeans.json
│   ├── jacket.json
│   └── footwear.json
├── electronics/
│   ├── smartphone.json
│   ├── laptop.json
│   └── headphones.json
├── batteries/
│   ├── lithium-ion-small.json
│   └── lithium-ion-ev.json
└── furniture/
    ├── chair.json
    ├── table.json
    └── sofa.json
```

### Method 4: Shopify Sync

Organizations using Shopify can import their existing product catalog:

1. Connect Shopify store via OAuth
2. Products imported as Golden Records
3. Commercial data (name, SKU, price, images) populated automatically
4. Add compliance data to reach 100% DPP completeness
5. DPP metadata synced back to Shopify metafields

### Method 5: LCA Estimation Engine

For organizations without LCA data, estimate carbon footprint from product attributes.

```typescript
interface ProductAttributes {
  category: 'textile' | 'electronics' | 'furniture';
  weight: number;          // kg
  materials: MaterialMix[];
  manufacturingCountry: string;
  transportDistance: number; // km
}

function estimateCarbonFootprint(attrs: ProductAttributes): CarbonEstimate {
  let totalCO2e = 0;

  // Material production emissions
  for (const material of attrs.materials) {
    const factor = EMISSION_FACTORS[material.type];
    totalCO2e += material.weight * factor;
  }

  // Manufacturing emissions (by country)
  const mfgFactor = MANUFACTURING_FACTORS[attrs.manufacturingCountry];
  totalCO2e += attrs.weight * mfgFactor;

  // Transport emissions
  const transportFactor = 0.0001; // kgCO2e per kg per km
  totalCO2e += attrs.weight * attrs.transportDistance * transportFactor;

  return {
    value: Math.round(totalCO2e * 10) / 10,
    unit: 'kgCO2e',
    methodology: 'EuroComply Estimation v1',
    confidence: 'estimate',
    disclaimer: 'Based on industry averages. For verified data, conduct LCA study.'
  };
}

// Emission factors (kgCO2e per kg material)
const EMISSION_FACTORS = {
  'cotton-conventional': 5.9,
  'cotton-organic': 3.8,
  'polyester-virgin': 9.5,
  'polyester-recycled': 2.1,
  'wool': 17.0,
  'leather': 65.0,
  'aluminum': 8.1,
  'steel': 1.9,
};
```

---

## VC Issuance

When a Golden Record reaches 100% DPP completeness, the product appears in the **DPP Ready list** for review and manual approval. Users review the product data and approve issuance to generate the Verifiable Credential.

```
┌─────────────────────────────────────────────────────────────────┐
│                    VC ISSUANCE FLOW                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Product completeness reaches 100% for DPP channel           │
│                                                                  │
│  2. Product appears in DPP Ready Products list                  │
│                                                                  │
│  3. User reviews product data                                   │
│                                                                  │
│  4. User approves product for DPP issuance                      │
│                                                                  │
│  5. System validates all required fields                        │
│                                                                  │
│  6. DPP data structured as VC credentialSubject                 │
│                                                                  │
│  7. VC signed with organization's did:key                       │
│     (using walt.id Signatory service)                           │
│                                                                  │
│  8. Signed VC stored in database                                │
│     (vcJwt field on Passport model)                             │
│                                                                  │
│  9. QR code generated (GS1 Digital Link)                       │
│                                                                  │
│  10. DPP accessible via public API                              │
│      (retailers can look up by GTIN, brand/SKU, or serial)      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### The Issued VC

```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    "https://eurocomply.eu/contexts/dpp/v1"
  ],
  "type": ["VerifiableCredential", "DigitalProductPassport"],
  "issuer": "did:key:z6MkhaXgBZDvvvRhta...",
  "issuanceDate": "2026-01-08T10:30:00Z",
  "credentialSubject": {
    "id": "urn:gtin:5901234567890",
    "type": "Product",
    "name": "Organic Cotton T-Shirt",
    "gtin": "5901234567890",
    "manufacturer": {
      "name": "EcoTextiles GmbH",
      "country": "DE"
    },
    "sustainability": {
      "carbonFootprint": {
        "value": 4.2,
        "unit": "kgCO2e",
        "methodology": "ISO 14067"
      },
      "recyclability": {
        "percentage": 90
      },
      "materials": [
        {"name": "Organic Cotton", "percentage": 95, "certified": true},
        {"name": "Elastane", "percentage": 5}
      ]
    },
    "certifications": [
      {"name": "GOTS", "issuer": "Control Union", "validUntil": "2027-06-15"}
    ]
  },
  "proof": {
    "type": "JsonWebSignature2020",
    "created": "2026-01-08T10:30:00Z",
    "verificationMethod": "did:key:z6MkhaXgBZDvvvRhta...#key-1",
    "proofPurpose": "assertionMethod",
    "jws": "eyJhbGciOiJFZERTQSIsImI2NCI6ZmFsc2UsImNyaXQiOlsiYjY0Il19..."
  }
}
```

### Key Points

- **did:key** - Self-contained identity, no hosting dependency
- **Portable** - VC can be verified anywhere, by anyone
- **Tamper-evident** - Any change breaks the signature
- **Owned by supplier** - Can be exported and taken elsewhere

---

## Retailer Access (Free)

Retailers can access and display DPPs on their storefronts using the free Retailer Access layer. This is provided free of charge in compliance with ESPR Article 31.

**Access Options:**

| Option | Description |
|--------|-------------|
| **Public API** | Look up DPPs by GTIN, brand/SKU, or serial number |
| **Embeddable Widget** | JavaScript snippet for any website |
| **Shopify Retailer App** | Automatic product matching by GTIN |

**Lookup Identifiers:**

| Identifier | Example | Use Case |
|------------|---------|----------|
| GTIN/EAN | 5901234567890 | Standard barcode lookup |
| Brand + SKU | acme/SHIRT-001 | When GTIN not available |
| Serial Number | SN123456789 | Item-level tracking |

Retailers register for a free account and receive access to all lookup methods. No subscription required.

---

## Category-Specific Schemas

### Textiles (ESPR Priority Sector)

| Field | Required | Description |
|-------|----------|-------------|
| Fiber Composition | Yes | Materials and percentages |
| Care Instructions | Yes | Washing, drying, ironing |
| Durability | Yes | Expected wash cycles |
| Country of Origin | Yes | Manufacturing location |
| Carbon Footprint | Recommended | kgCO2e per item |
| Recyclability | Recommended | End-of-life instructions |
| Certifications | Optional | GOTS, OEKO-TEX, GRS |

### Electronics

| Field | Required | Description |
|-------|----------|-------------|
| Repairability Score | Yes | 1-10 scale |
| Spare Parts Availability | Yes | Years available |
| Critical Raw Materials | Yes | Cobalt, lithium, etc. |
| WEEE Registration | Yes | Waste electronics compliance |
| Energy Efficiency | Recommended | Energy label class |
| Carbon Footprint | Recommended | kgCO2e per item |

### Batteries (First ESPR Deadline: Feb 2027)

| Field | Required | Description |
|-------|----------|-------------|
| Battery Chemistry | Yes | Li-ion, NiMH, etc. |
| Capacity | Yes | Wh or Ah |
| Recycled Content | Yes | Percentage |
| Carbon Footprint | Yes | kgCO2e per kWh |
| State of Health | Yes | For EV batteries |
| Critical Raw Materials | Yes | Cobalt, lithium sources |

### Furniture

| Field | Required | Description |
|-------|----------|-------------|
| Materials | Yes | Wood, metal, fabric |
| Durability | Yes | Expected lifespan |
| Repairability | Yes | Spare parts, instructions |
| Recyclability | Recommended | Disassembly instructions |
| Certifications | Optional | FSC, PEFC |

---

## Validation & Compliance Scoring

Each DPP gets a compliance score based on field completeness.

```
┌─────────────────────────────────────────────────────────────────┐
│  COMPLIANCE SCORE: 85%                              [████████░░] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ✅ MANDATORY FIELDS (4/4 complete)                             │
│     ✓ Fiber Composition                                         │
│     ✓ Care Instructions                                         │
│     ✓ Manufacturer Country                                      │
│     ✓ Durability                                                │
│                                                                  │
│  ⚠️ RECOMMENDED FIELDS (2/4 complete)                           │
│     ✓ Carbon Footprint                                          │
│     ✓ Recyclability                                             │
│     ○ Certifications (none uploaded)                            │
│     ○ Repair Instructions                                       │
│                                                                  │
│  💡 To reach 100%: Upload certifications, add repair info       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Source Tracking

Track where data comes from for transparency.

| Data Source | Description | VC Attribution |
|-------------|-------------|----------------|
| **MANUAL** | Entered by supplier in portal | "Declared by [Supplier]" |
| **CSV_IMPORT** | Bulk uploaded | "Declared by [Supplier]" |
| **LCA_ESTIMATE** | Calculated estimate | "Estimated by EuroComply" |
| **THIRD_PARTY_VERIFIED** | Certified by external body | "Verified by [Certifier]" |

---

## Dashboard Routes (Workspace-Based Navigation)

```
/dashboard                              - Overview (product count, completeness, plan usage)

# DESIGN WORKSPACE (PLM)
/dashboard/design                       - Design workspace home
/dashboard/design/registry              - Product Registry (structure, BOMs, versions)
/dashboard/design/registry/new          - Create new product
/dashboard/design/registry/:id          - Edit product structure
/dashboard/design/materials             - Materials Library (sustainability properties)
/dashboard/design/materials/new         - Create new material
/dashboard/design/dam                   - Technical Documents (DAM-Tech)
/dashboard/design/attestations          - Certifications and attestations

# OPERATIONS WORKSPACE (ERP-lite)
/dashboard/operations                   - Operations workspace home
/dashboard/operations/registry          - Product Registry (inventory view)
/dashboard/operations/epcis             - EPCIS Events (supply chain traceability)
/dashboard/operations/batches           - Batch/lot management
/dashboard/operations/serials           - Serial number tracking

# MARKETING WORKSPACE (PIM)
/dashboard/marketing                    - Marketing workspace home
/dashboard/marketing/pim                - PIM (descriptions, SEO, multi-language)
/dashboard/marketing/pim/:id            - Edit product commercial content
/dashboard/marketing/dam                - Media Assets (DAM-Media: photos, videos)
/dashboard/marketing/families           - Product Family attribute schemas
/dashboard/marketing/channels           - Shopify/marketplace connections
/dashboard/marketing/syndication        - Channel syndication status

# COMPLIANCE WORKSPACE (DPP)
/dashboard/compliance                   - Compliance workspace home
/dashboard/compliance/dpp-ready         - DPP Ready Products (100% complete, awaiting approval)
/dashboard/compliance/passports         - Issued DPPs
/dashboard/compliance/scoring           - Completeness scoring dashboard

# SHARED
/dashboard/import                       - AI import wizard (all workspaces)
/dashboard/bulk                         - Bulk operations (edit, delete, assign family) [All Plans]
/dashboard/audit-log                    - Audit log (who changed what, when) [All Plans]
/dashboard/export                       - Export products (CSV/JSON) and VCs [All Plans]
/dashboard/settings                     - Account, billing, team management
```

---

## Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRODUCT DATA & DPP CREATION                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WHO CREATES?                                                   │
│  → Brands, manufacturers, distributors                          │
│  → Immediate access after registration and payment              │
│                                                                  │
│  FOUR WORKSPACES FOR COMPLETE PRODUCT LIFECYCLE                 │
│  ┌────────────────┐  ┌────────────────┐                        │
│  │ DESIGN (PLM)   │  │ OPERATIONS     │                        │
│  │ Registry       │  │ (ERP-lite)     │                        │
│  │ Materials      │  │ Registry       │                        │
│  │ DAM-Tech       │  │ EPCIS          │                        │
│  │ Attestation    │  │ Attestation    │                        │
│  └────────────────┘  └────────────────┘                        │
│  ┌────────────────┐  ┌────────────────┐                        │
│  │ MARKETING      │  │ COMPLIANCE     │                        │
│  │ (PIM)          │  │ (DPP)          │                        │
│  │ PIM            │  │ Compliance     │                        │
│  │ DAM-Media      │  │ Registry (r/o) │                        │
│  │ Syndication    │  │ PIM (r/o)      │                        │
│  └────────────────┘  └────────────────┘                        │
│                                                                  │
│  DATA FLOW: All Workspaces → Hub → Compliance                   │
│  → Design writes: Registry, BOMs, Materials, Attestations       │
│  → Operations writes: Batches, EPCIS, Attestations              │
│  → Marketing writes: PIM content, Media, Channels               │
│  → Compliance READS Hub and issues DPPs                         │
│                                                                  │
│  HOW DO THEY CREATE?                                            │
│  → AI-powered import (any file format)                          │
│  → Shopify sync (import existing products)                      │
│  → Manual entry with templates                                  │
│  → Bulk operations for efficient management [All Plans]         │
│  → LCA estimation for carbon footprint                          │
│                                                                  │
│  THE HUB (GOLDEN RECORD MODEL)                                  │
│  → Central data store - single source of truth                  │
│  → Each product has one Golden Record in the Hub                │
│  → All workspaces write to Hub, Compliance reads from Hub       │
│  → Data always synchronized across workspaces                   │
│  → Completeness scoring per channel                             │
│  → DPP Ready list at 100% for review and approval               │
│                                                                  │
│  WHAT GETS ISSUED?                                              │
│  → Verifiable Credential (W3C standard)                         │
│  → Signed with did:key (portable identity)                      │
│  → Tamper-evident, verifiable anywhere                          │
│                                                                  │
│  HOW DO RETAILERS ACCESS?                                       │
│  → Public API (GTIN, brand/SKU, serial lookup)                  │
│  → Embeddable widget (any website)                              │
│  → Shopify Retailer App (auto-matching)                         │
│  → All free (ESPR Article 31 compliant)                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

*Last Updated: 2026-01-11*
