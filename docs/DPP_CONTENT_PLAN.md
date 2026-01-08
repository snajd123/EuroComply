# DPP Content Strategy: How Suppliers Create Product-Specific Passport Data

## Overview

Only verified suppliers (producers, importers, brands) create Digital Product Passports using EuroComply's SaaS platform. Retailers access these DPPs for free via our e-commerce plugins.

See [BUSINESS_MODEL.md](./BUSINESS_MODEL.md) for the full SaaS model.

---

## The Challenge

Creating ESPR-compliant Digital Product Passports requires **category-specific, product-specific sustainability data** that only suppliers have access to.

| Challenge | Description |
|-----------|-------------|
| **Category-specific requirements** | Textiles need fiber composition; batteries need chemical composition |
| **Mandatory vs optional fields** | Different categories have different mandatory fields |
| **Data availability** | Suppliers have manufacturing data; retailers typically don't |
| **Data verification** | Claims need to be verifiable, not just stated |
| **Varying timelines** | Different categories have different compliance deadlines |

---

## Supplier Portal: DPP Creation Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│              SUPPLIER DPP CREATION FLOW                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. SUPPLIER ONBOARDING                                             │
│     ├─ Sign up for SaaS plan (Starter/Growth/Pro/Enterprise)       │
│     └─ Complete KYB verification                                    │
│                                                                      │
│  2. IDENTITY CREATION                                               │
│     ├─ Generate did:key (portable, self-contained identity)        │
│     └─ Private key stored securely (exportable on request)         │
│                                                                      │
│  3. PRODUCT CATEGORIZATION                                          │
│     └─ Select: Textile / Electronics / Battery / Furniture / Other │
│                                                                      │
│  4. SCHEMA SELECTION                                                │
│     └─ System loads category-specific required/optional fields     │
│                                                                      │
│  5. DATA ENTRY                                                      │
│     ├─ Manual Entry: Supplier portal forms                         │
│     ├─ CSV Import: Bulk product upload                              │
│     ├─ Templates: Industry-standard defaults                        │
│     └─ LCA Data: From supplier's LCA studies                       │
│                                                                      │
│  6. VALIDATION                                                       │
│     └─ Check mandatory fields, compliance score                     │
│                                                                      │
│  7. VC ISSUANCE                                                     │
│     ├─ Sign DPP data with did:key                                  │
│     └─ Generate Verifiable Credential (portable, tamper-evident)   │
│                                                                      │
│  8. PUBLISH                                                         │
│     ├─ DPP appears in supplier catalog                             │
│     └─ Retailers can find and link to their products               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Entry Methods

### Method 1: Category-Specific Forms

Guided forms tailored to each product category.

```
/supplier/products/new
├── Product Category Selector
│   └─ [Textile] [Electronics] [Battery] [Furniture] [Other]
│
├── Dynamic Form (based on category)
│   ├── Core Fields (all categories)
│   │   ├─ Product Name*
│   │   ├─ GTIN/Barcode
│   │   ├─ Manufacturer Name*
│   │   └─ Country of Origin*
│   │
│   ├── Textiles Section (if textile)
│   │   ├─ Fiber Composition* (add multiple)
│   │   │   └─ [Fiber Type] [Percentage] [Certified?]
│   │   ├─ Care Instructions*
│   │   │   └─ [Max Temp] [Bleach?] [Dry Clean?]
│   │   └─ Durability (wash cycles)*
│   │
│   ├── Carbon Footprint Section
│   │   ├─ Value (kgCO2e)
│   │   ├─ Methodology [GHG Protocol / ISO 14067 / PEF]
│   │   └─ Scope [Cradle-to-gate / Cradle-to-grave]
│   │
│   ├── Recyclability Section
│   │   ├─ Recyclable Percentage*
│   │   ├─ Materials Breakdown
│   │   └─ End-of-life Instructions
│   │
│   ├── Repairability Section (if electronics/furniture)
│   │   ├─ Repairability Score (1-10)
│   │   ├─ Spare Parts Availability
│   │   └─ Repair Instructions URL
│   │
│   └── Certifications
│       └─ [Add Certification] [Name] [Issuer] [Valid Until] [Doc URL]
│
└── [Save Draft] [Validate] [Issue VC & Publish]
```

### Method 2: Templates Library

Pre-built templates with industry defaults for common product types.

```typescript
const TEXTILE_TSHIRT_TEMPLATE = {
  category: 'textile',
  productType: 'T-Shirt',
  defaults: {
    durability: { expectedLifespan: 2, unit: 'years' },
    recyclability: { percentage: 85 },
    repairability: { score: 3 },
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

### Method 3: CSV Bulk Import

For suppliers with many products.

**CSV Format:**
```csv
sku,name,gtin,fiber_composition,carbon_footprint_kg,recyclable_percent,certifications
TSHIRT-001,"Organic Cotton Tee",5901234567890,"95% Organic Cotton, 5% Elastane",4.2,90,"GOTS,OEKO-TEX"
TSHIRT-002,"Recycled Poly Tee",5901234567891,"100% Recycled Polyester",3.1,100,"GRS"
JEANS-001,"Classic Denim",5901234567892,"98% Cotton, 2% Elastane",12.5,85,""
```

**Import Flow:**
1. Upload CSV
2. Map columns to DPP fields
3. Validate data
4. Preview results
5. Bulk create DPPs
6. Issue VCs for all products

### Method 4: LCA Estimation Engine

For suppliers without LCA data, estimate carbon footprint from product attributes.

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

When a DPP is complete, the supplier issues a Verifiable Credential.

```
┌─────────────────────────────────────────────────────────────────┐
│                    VC ISSUANCE FLOW                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Supplier clicks "Publish DPP"                               │
│                                                                  │
│  2. System validates all required fields                        │
│                                                                  │
│  3. DPP data structured as VC credentialSubject                 │
│                                                                  │
│  4. VC signed with supplier's did:key                          │
│     (using walt.id Signatory service)                           │
│                                                                  │
│  5. Signed VC stored in database                                │
│     (vcJwt field on Passport model)                             │
│                                                                  │
│  6. QR code generated (GS1 Digital Link)                       │
│                                                                  │
│  7. DPP published to catalog                                    │
│     (visible to retailers)                                      │
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

Retailers browse the supplier catalog and link DPPs to their products.

```
┌─────────────────────────────────────────────────────────────────┐
│                    RETAILER FLOW                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Install Shopify/WooCommerce plugin (free)                   │
│                                                                  │
│  2. Browse supplier catalog                                     │
│     • Search by GTIN, product name, category                    │
│     • Filter by certifications                                  │
│                                                                  │
│  3. Link DPP to product                                         │
│     • Select product in store                                   │
│     • Click "Link DPP"                                          │
│     • DPP associated with product                               │
│                                                                  │
│  4. Display on storefront                                       │
│     • Embedded widget shows DPP data                            │
│     • "Verified by [Supplier]" badge                            │
│     • QR code for physical products                             │
│                                                                  │
│  No payment required. ESPR Article 31 compliant.                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

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

## Supplier Portal Routes

```
/supplier/                     - Dashboard (DPP count, plan usage)
/supplier/products             - Product list
/supplier/products/new         - Create new DPP
/supplier/products/:id/edit    - Edit DPP
/supplier/products/import      - CSV bulk import
/supplier/templates            - Browse templates
/supplier/settings             - Account, billing, export
/supplier/export               - Export all VCs and keys
```

---

## Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    DPP CONTENT CREATION                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WHO CREATES?                                                   │
│  → Suppliers (producers, importers, brands)                     │
│  → Verified via KYB before creating DPPs                        │
│                                                                  │
│  HOW DO THEY CREATE?                                            │
│  → Category-specific forms                                      │
│  → Templates for common products                                │
│  → CSV bulk import                                              │
│  → LCA estimation engine                                        │
│                                                                  │
│  WHAT GETS ISSUED?                                              │
│  → Verifiable Credential (W3C standard)                         │
│  → Signed with did:key (portable identity)                      │
│  → Tamper-evident, verifiable anywhere                          │
│                                                                  │
│  HOW DO RETAILERS ACCESS?                                       │
│  → Browse supplier catalog (free)                               │
│  → Link DPPs to products (free)                                 │
│  → Display on storefront (free)                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

*Last Updated: 2026-01-08*
