# DPP Content Strategy: How to Create Product-Specific Passport Data

## The Problem

Currently, when a Shopify merchant clicks "Issue DPP", we create a passport with placeholder data:

```typescript
// Current (inadequate)
{
  manufacturerName: shopifyProduct.vendor || 'Unknown',
  manufacturerCountry: 'EU',
  // That's it. No real sustainability data.
}
```

Real ESPR compliance requires **category-specific, product-specific sustainability data** that merchants don't have readily available.

---

## Key Challenges

| Challenge | Description |
|-----------|-------------|
| **Category-specific requirements** | Textiles need fiber composition; batteries need chemical composition |
| **Mandatory vs optional fields** | Different categories have different mandatory fields |
| **Data availability** | Most merchants don't have carbon footprint data |
| **Data verification** | Claims need to be verifiable, not just stated |
| **Varying timelines** | Different categories have different compliance deadlines |

---

## Proposed Solution Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DPP CONTENT CREATION FLOW                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. PRODUCT CATEGORIZATION                                          │
│     └─ User selects: Textile / Electronics / Battery / Furniture    │
│                                                                      │
│  2. SCHEMA SELECTION                                                │
│     └─ System loads category-specific required/optional fields      │
│                                                                      │
│  3. DATA COLLECTION (Multiple Sources)                              │
│     ├─ Manual Entry: Form for merchant input                        │
│     ├─ Shopify Metafields: Pull existing product data              │
│     ├─ Templates: Industry-standard defaults                        │
│     ├─ Supplier Import: CSV/API from suppliers                     │
│     └─ LCA Estimation: Calculate from product attributes           │
│                                                                      │
│  4. VALIDATION                                                       │
│     └─ Check mandatory fields, warn on missing                      │
│                                                                      │
│  5. VC ISSUANCE                                                     │
│     └─ Sign complete DPP data with walt.id                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Solution 1: Category-Specific Data Entry Forms

### Implementation: Add "Edit DPP Data" page in Shopify app

```
/app/dpp/:id/edit
├── Product Category Selector
│   └─ [Textile] [Electronics] [Battery] [Furniture] [Other]
│
├── Dynamic Form (based on category)
│   ├── Core Fields (all categories)
│   │   ├─ Manufacturer Name*
│   │   ├─ Manufacturer Country*
│   │   └─ Product Description
│   │
│   ├── Textiles Section (if textile)
│   │   ├─ Fiber Composition* (add multiple)
│   │   │   └─ [Fiber Type] [Percentage] [Organic?]
│   │   ├─ Care Instructions*
│   │   │   └─ [Max Temp] [Bleach?] [Dry Clean?]
│   │   └─ Washing Durability (cycles)*
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
│   │   ├─ Spare Parts Available
│   │   └─ Repair Instructions URL
│   │
│   └── Certifications
│       └─ [Add Certification] [Name] [Issuer] [Valid Until] [Doc URL]
│
└── [Save Draft] [Validate] [Issue DPP with VC]
```

### Pros
- Complete control over data
- Category-specific validation
- Clear UX for merchants

### Cons
- Manual data entry burden on merchants
- Merchants may not have the data

---

## Solution 2: DPP Templates by Product Type

### Pre-built templates with industry defaults

```typescript
const TEXTILE_TSHIRT_TEMPLATE = {
  category: 'textile',
  productType: 'T-Shirt',
  defaults: {
    durability: { expectedLifespan: 2, unit: 'years' },
    recyclability: { percentage: 85 },
    repairability: { score: 3 }, // Low for basic textiles
  },
  requiredOverrides: [
    'fiberComposition',      // Merchant MUST provide
    'manufacturerCountry',
  ],
  suggestedFields: [
    'carbonFootprint',       // Encouraged but optional
    'certifications',
  ],
  industryBenchmarks: {
    carbonFootprint: { value: 5.5, unit: 'kgCO2e', source: 'WRAP UK Average' },
  }
};

const ELECTRONICS_SMARTPHONE_TEMPLATE = {
  category: 'electronics',
  productType: 'Smartphone',
  defaults: {
    durability: { expectedLifespan: 4, unit: 'years' },
    repairability: { score: 6 },
  },
  requiredOverrides: [
    'rohsCompliant',
    'weeRegistration',
    'spareParts',
  ],
  industryBenchmarks: {
    carbonFootprint: { value: 70, unit: 'kgCO2e', source: 'Apple Environmental Report Average' },
  }
};
```

### Template Library Structure
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
│   ├── tablet.json
│   └── headphones.json
├── batteries/
│   ├── lithium-ion-small.json
│   ├── lithium-ion-ev.json
│   └── industrial.json
└── furniture/
    ├── chair.json
    ├── table.json
    ├── sofa.json
    └── cabinet.json
```

### Pros
- Quick start for merchants
- Industry-appropriate defaults
- Reduces data entry burden

### Cons
- Templates may not fit all products
- Benchmarks are approximations

---

## Solution 3: Shopify Metafield Integration

### Pull existing product data from Shopify metafields

Shopify merchants often already have sustainability data in metafields:

```typescript
// Shopify GraphQL query to fetch metafields
const METAFIELD_MAPPINGS = {
  // Common sustainability metafields
  'custom.carbon_footprint': 'carbonFootprint.value',
  'custom.materials': 'recyclability.materials',
  'custom.country_of_origin': 'manufacturerCountry',
  'custom.fiber_content': 'textileData.fiberComposition',

  // Standard Shopify fields
  'product.vendor': 'manufacturerName',
  'variant.weight': 'productWeight',
  'variant.barcode': 'gtin',
};

async function pullFromShopifyMetafields(productId: string) {
  const metafields = await shopify.graphql(`
    query {
      product(id: "${productId}") {
        metafields(first: 50) {
          edges {
            node {
              namespace
              key
              value
              type
            }
          }
        }
      }
    }
  `);

  return mapMetafieldsToDppData(metafields);
}
```

### Pros
- Uses existing merchant data
- No duplicate entry
- Syncs automatically

### Cons
- Merchants need to set up metafields first
- Inconsistent data formats

---

## Solution 4: Supplier Data Import

### Allow suppliers to provide sustainability data

```
┌─────────────────────────────────────────────────────────────────┐
│                    SUPPLIER DATA FLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Supplier                         Merchant                       │
│  (Factory/Manufacturer)           (Shopify Store)               │
│                                                                  │
│  ┌──────────────────┐            ┌──────────────────┐           │
│  │ Sustainability   │   CSV/API  │ EuroComply       │           │
│  │ Data Export      │ ─────────► │ Import Tool      │           │
│  │                  │            │                  │           │
│  │ • Materials      │            │ • Map to DPP     │           │
│  │ • Carbon data    │            │ • Validate       │           │
│  │ • Certifications │            │ • Issue VC       │           │
│  └──────────────────┘            └──────────────────┘           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Import Format (CSV)
```csv
sku,fiber_composition,carbon_footprint_kg,recyclable_percent,certifications
TSHIRT-001,"95% Organic Cotton, 5% Elastane",4.2,90,"GOTS,OEKO-TEX"
TSHIRT-002,"100% Recycled Polyester",3.1,100,"GRS"
JEANS-001,"98% Cotton, 2% Elastane",12.5,85,""
```

### Pros
- Accurate data from source
- Scalable for large catalogs
- Supports supply chain verification

### Cons
- Requires supplier participation
- Data format standardization needed

---

## Solution 5: LCA Estimation Engine

### Calculate carbon footprint from product attributes

For merchants without LCA data, estimate using industry databases:

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

  // 1. Material production emissions
  for (const material of attrs.materials) {
    const factor = EMISSION_FACTORS[material.type]; // kgCO2e per kg
    totalCO2e += material.weight * factor;
  }

  // 2. Manufacturing emissions (by country)
  const mfgFactor = MANUFACTURING_FACTORS[attrs.manufacturingCountry];
  totalCO2e += attrs.weight * mfgFactor;

  // 3. Transport emissions
  const transportFactor = 0.0001; // kgCO2e per kg per km (sea freight avg)
  totalCO2e += attrs.weight * attrs.transportDistance * transportFactor;

  return {
    value: Math.round(totalCO2e * 10) / 10,
    unit: 'kgCO2e',
    methodology: 'EuroComply Estimation v1',
    confidence: 'estimate',
    disclaimer: 'Based on industry averages. For verified data, conduct LCA study.'
  };
}

// Industry emission factors (kgCO2e per kg material)
const EMISSION_FACTORS = {
  'cotton-conventional': 5.9,
  'cotton-organic': 3.8,
  'polyester-virgin': 9.5,
  'polyester-recycled': 2.1,
  'wool': 17.0,
  'leather': 65.0,
  'aluminum': 8.1,
  'steel': 1.9,
  'plastic-abs': 3.1,
  'wood-softwood': 0.2,
  'wood-hardwood': 0.3,
};
```

### Pros
- Provides data when none exists
- Uses accepted industry factors
- Better than no data

### Cons
- Estimates, not measured values
- May not be accepted for compliance
- Needs clear "estimate" labeling

---

## Recommended Implementation Order

### Phase 1: Foundation (Week 1-2)
1. **Create category-specific schemas** in `packages/shared`
2. **Add product category field** to Passport model
3. **Implement mandatory field validation** by category
4. **Create DPP edit page** in Shopify app (basic form)

### Phase 2: Data Collection (Week 3-4)
1. **Add DPP templates** for common product types
2. **Implement Shopify metafield sync**
3. **Build supplier CSV import**

### Phase 3: Enhancement (Week 5-6)
1. **Add LCA estimation engine**
2. **Implement industry benchmarks**
3. **Add compliance checklist UI**

### Phase 4: Verification (Week 7-8)
1. **Integration with certification registries**
2. **Supplier VC verification** (verify their claims)
3. **Compliance scoring/reporting**

---

## Database Schema Updates Needed

```prisma
// Add to Passport model
model Passport {
  // ... existing fields

  // New category-specific fields
  productCategory   ProductCategory @default(OTHER)
  categoryData      Json?           // Category-specific structured data
  dataSource        DataSource      @default(MANUAL)
  dataConfidence    DataConfidence  @default(UNVERIFIED)
  complianceScore   Float?          // 0-100% completeness

  // Template reference
  templateId        String?
  template          DppTemplate?    @relation(fields: [templateId], references: [id])
}

enum ProductCategory {
  TEXTILE
  ELECTRONICS
  BATTERY
  FURNITURE
  OTHER
}

enum DataSource {
  MANUAL           // Entered by merchant
  SHOPIFY_SYNC     // Pulled from Shopify metafields
  SUPPLIER_IMPORT  // Imported from supplier
  LCA_ESTIMATE     // Calculated estimate
  THIRD_PARTY_VERIFIED  // Verified by certification body
}

enum DataConfidence {
  UNVERIFIED       // Self-declared
  ESTIMATED        // Calculated from formulas
  SUPPLIER_DECLARED // From supplier (not verified)
  THIRD_PARTY_VERIFIED // Certified
  AUDITED          // Independently audited
}

model DppTemplate {
  id              String    @id @default(cuid())
  name            String
  category        ProductCategory
  productType     String    // "T-Shirt", "Smartphone", etc.
  defaults        Json      // Default values
  requiredFields  String[]  // Fields merchant must provide
  suggestedFields String[]  // Optional but recommended
  benchmarks      Json      // Industry average data
  passports       Passport[]
}
```

---

## Shopify App UI Updates

### New Routes Needed

```
/app/dpp/:id/edit          - Edit DPP sustainability data
/app/templates             - Browse/select DPP templates
/app/import                - Supplier data import
/app/settings/metafields   - Configure Shopify metafield mappings
```

### Edit DPP Page Wireframe

```
┌─────────────────────────────────────────────────────────────┐
│  Edit DPP: Organic Cotton T-Shirt                    [Save] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Product Category:  [Textile ▼]                             │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│  MANDATORY FIELDS (4 of 5 complete)          [██████░░] 80% │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  Manufacturer Information                                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Name:     [EcoFashion GmbH        ]  ✓                 │ │
│  │ Country:  [Germany ▼             ]  ✓                  │ │
│  │ Website:  [https://ecofashion.de ]                     │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Fiber Composition (Required for Textiles)                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ [Organic Cotton ▼] [95]% [Certified ▼]  [×]           │ │
│  │ [Elastane ▼      ] [ 5]%                [×]           │ │
│  │                                    [+ Add Fiber]       │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Care Instructions (Required)                    ⚠️ Missing │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Max Wash Temp: [  ]°C   Bleach Allowed: [ ]            │ │
│  │ Tumble Dry:    [ ]      Dry Clean: [ ]                 │ │
│  │ Washing Cycles: [  ] (durability test result)          │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│  OPTIONAL FIELDS                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  Carbon Footprint                                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Value: [5.2] kgCO2e                                    │ │
│  │ Methodology: [ISO 14067 ▼]                             │ │
│  │ Scope: [Cradle-to-gate ▼]                              │ │
│  │                                                         │ │
│  │ 💡 Don't have this? [Estimate from materials]          │ │
│  │    Industry benchmark: 5.5 kgCO2e (WRAP UK)            │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Certifications                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ✓ GOTS (Global Organic Textile Standard)               │ │
│  │   Issuer: Control Union  Valid: 2027-06-15  [View]    │ │
│  │                                                         │ │
│  │ [+ Add Certification]                                   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  [Save Draft]  [Validate for Compliance]  [Issue VC]        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Decision Points Needed

1. **Which product categories to support first?**
   - Textiles (most Shopify merchants)
   - Electronics
   - All from start

2. **How to handle missing mandatory data?**
   - Block VC issuance until complete
   - Issue with warnings/disclaimers
   - Allow partial DPPs

3. **LCA estimation - include or not?**
   - Pro: Provides data when none exists
   - Con: Estimates may not satisfy regulators

4. **Template library - build or license?**
   - Build: Control but time-consuming
   - License: Faster but dependency

5. **Supplier integration priority?**
   - CSV import first (simple)
   - API later (complex but scalable)
