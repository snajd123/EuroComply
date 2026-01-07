# Supplier Portal Design

## Overview

Suppliers can create full DPPs on the EuroComply platform that merchants can use directly or customize. This creates a marketplace of "DPP-ready" products that reduces data entry burden for merchants while ensuring data quality from verified suppliers.

## Core Principles

1. **Supplier signs = Supplier responsible** - Unmodified DPPs retain supplier's VC
2. **Merchant modifies = Merchant responsible** - Forked DPPs require merchant's signature
3. **Link, don't copy** - "Use as-is" creates a reference, not a duplicate
4. **Verified suppliers only** - Suppliers must complete verification before publishing

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  SUPPLIER PORTAL (supplier.eurocomply.com)                          │
│                                                                     │
│  1. Register (email/password)                                       │
│  2. Verify (business docs, manual review)                           │
│  3. Create Supplier Products with full DPP data                     │
│  4. Optionally anchor VC (proves supplier declared this data)       │
│  5. Set visibility: public | private | invite-only                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ EuroComply API
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SUPPLIER CATALOG                                                   │
│                                                                     │
│  ┌───────────────────┐  ┌───────────────────┐  ┌─────────────────┐ │
│  │ ABC Textiles      │  │ XYZ Fabrics       │  │ 123 Mills       │ │
│  │ ✓ Verified        │  │ ✓ Verified        │  │ ⏳ Pending      │ │
│  │ 12 products       │  │ 8 products        │  │ 3 products      │ │
│  │ Public catalog    │  │ Invite-only       │  │ (not visible)   │ │
│  └───────────────────┘  └───────────────────┘  └─────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ Browse / Search / Filter
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SHOPIFY PLUGIN (Merchant View)                                     │
│                                                                     │
│  "Browse Supplier Products"                                         │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Organic Cotton T-Shirt Base                by ABC Textiles      ││
│  │ ✓ GOTS Certified  ✓ 2.1 kgCO2e  ✓ REACH Compliant               ││
│  │                                                                  ││
│  │  [Use as-is]  [Customize]                                       ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  Use as-is:                    Customize:                           │
│  → Link supplier DPP           → Fork to new DPP                    │
│  → Supplier's VC valid         → Pre-fill form with supplier data   │
│  → "Provided by ABC"           → Merchant edits & signs new VC      │
│  → Merchant cannot edit        → "Based on ABC" (heritage only)     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Supplier Portal (EuroComply Core)

```prisma
// Supplier account (separate from Shopify merchants)
model Supplier {
  id                  String   @id @default(cuid())
  email               String   @unique
  passwordHash        String

  // Company info
  companyName         String
  companyRegistration String?  // VAT/business registration
  country             String   // ISO 3166-1 alpha-2
  website             String?
  logoUrl             String?

  // Verification
  verificationStatus  SupplierVerificationStatus @default(PENDING)
  verifiedAt          DateTime?
  verifiedBy          String?  // Admin who verified
  verificationDocs    Json?    // Uploaded document references

  // Settings
  catalogVisibility   CatalogVisibility @default(PUBLIC)

  // Relations
  products            SupplierProduct[]
  invitations         SupplierInvitation[]

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}

enum SupplierVerificationStatus {
  PENDING      // Just registered
  IN_REVIEW    // Docs submitted, awaiting review
  VERIFIED     // Approved
  REJECTED     // Rejected (can resubmit)
  SUSPENDED    // Temporarily disabled
}

enum CatalogVisibility {
  PUBLIC       // Anyone can see and use
  PRIVATE      // Only supplier can see (draft mode)
  INVITE_ONLY  // Only invited merchants can see
}

// Supplier's product with full DPP data
model SupplierProduct {
  id                  String   @id @default(cuid())
  supplierId          String
  supplier            Supplier @relation(fields: [supplierId], references: [id])

  // Product info
  name                String
  description         String?
  category            ProductCategory @default(TEXTILE)
  imageUrls           String[] // Array of image URLs

  // Full DPP data (same schema as merchant DPPs)
  dppData             Json     // TextileDppData | ElectronicsDppData | etc.

  // VC status (supplier can optionally anchor their own VC)
  vcStatus            VcStatus @default(NONE)
  vcId                String?  // EuroComply VC ID if anchored
  vcAnchoredAt        DateTime?

  // Visibility
  visibility          ProductVisibility @default(DRAFT)
  publishedAt         DateTime?

  // Usage stats
  timesLinked         Int      @default(0)  // How many merchants linked
  timesForked         Int      @default(0)  // How many merchants forked

  // Relations
  merchantLinks       MerchantSupplierLink[]

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@index([supplierId])
  @@index([category, visibility])
}

enum ProductCategory {
  TEXTILE
  ELECTRONICS
  FURNITURE
  BATTERY
  OTHER
}

enum VcStatus {
  NONE         // Supplier hasn't anchored
  PENDING      // Anchoring in progress
  ANCHORED     // VC issued
  FAILED       // Anchoring failed
}

enum ProductVisibility {
  DRAFT        // Not visible to merchants
  PUBLISHED    // Visible per catalog visibility settings
  ARCHIVED     // Hidden but preserved
}

// Invite-only access for specific merchants
model SupplierInvitation {
  id                  String   @id @default(cuid())
  supplierId          String
  supplier            Supplier @relation(fields: [supplierId], references: [id])

  merchantEmail       String   // Or shop domain
  merchantShop        String?  // Shopify shop domain if known

  status              InvitationStatus @default(PENDING)
  invitedAt           DateTime @default(now())
  acceptedAt          DateTime?

  @@unique([supplierId, merchantEmail])
  @@index([merchantShop])
}

enum InvitationStatus {
  PENDING
  ACCEPTED
  EXPIRED
  REVOKED
}
```

### Shopify Plugin (Extended)

```prisma
// Existing model - extended
model ProductSync {
  id                  String   @id @default(cuid())
  shop                String
  shopifyProductId    String

  // Existing fields
  syncStatus          String   @default("pending")
  eurocomplyDppId     String?
  lastSyncedAt        DateTime?
  errorMessage        String?

  // NEW: Supplier link support
  linkType            DppLinkType @default(OWNED)
  supplierProductId   String?  // If linked to supplier product
  supplierLink        MerchantSupplierLink? @relation(fields: [supplierLinkId], references: [id])
  supplierLinkId      String?  @unique

  // If forked, track heritage
  forkedFromSupplierId    String?  // Original supplier product ID
  forkedAt                DateTime?

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@unique([shop, shopifyProductId])
  @@index([shop])
}

enum DppLinkType {
  OWNED           // Merchant created from scratch
  SUPPLIER_LINKED // Linked to supplier product (supplier's VC)
  SUPPLIER_FORKED // Forked from supplier (merchant's VC, heritage noted)
}

// Track active links between merchants and supplier products
model MerchantSupplierLink {
  id                  String   @id @default(cuid())

  // Merchant side
  shop                String
  shopifyProductId    String
  productSync         ProductSync?

  // Supplier side
  supplierProductId   String   // References SupplierProduct.id

  // Link metadata
  linkedAt            DateTime @default(now())

  // Denormalized for quick access
  supplierName        String
  supplierVerified    Boolean

  @@unique([shop, shopifyProductId])
  @@index([supplierProductId])
}
```

---

## API Design

### Supplier Portal API

```typescript
// POST /api/suppliers/register
interface SupplierRegistration {
  email: string;
  password: string;
  companyName: string;
  country: string;
  website?: string;
}

// POST /api/suppliers/verify
interface VerificationSubmission {
  businessRegistrationDoc: File;
  additionalDocs?: File[];
  notes?: string;
}

// POST /api/suppliers/products
interface CreateSupplierProduct {
  name: string;
  description?: string;
  category: 'textile' | 'electronics' | 'furniture' | 'battery';
  dppData: TextileDppData | ElectronicsDppData | ...;
  visibility: 'draft' | 'published';
  anchorVc?: boolean; // Whether to issue VC immediately
}

// GET /api/catalog/products
interface CatalogSearchParams {
  category?: string;
  certification?: string; // Filter by GOTS, OEKO-TEX, etc.
  search?: string;
  supplierCountry?: string;
  page?: number;
  limit?: number;
}

// Response
interface CatalogProduct {
  id: string;
  name: string;
  description?: string;
  category: string;
  supplier: {
    id: string;
    name: string;
    country: string;
    verified: boolean;
    logoUrl?: string;
  };
  dppSummary: {
    // Summarized DPP info for catalog display
    fiberComposition?: string; // "95% Organic Cotton, 5% Elastane"
    certifications?: string[]; // ["GOTS", "OEKO-TEX"]
    carbonFootprint?: number;
    countryOfManufacture?: string;
  };
  vcAnchored: boolean;
  timesUsed: number; // Social proof
}
```

### Shopify Plugin API (Extended)

```typescript
// GET /api/supplier-catalog
// Proxied from Shopify plugin to EuroComply catalog API
// Filters by: public products + products from suppliers who invited this shop

// POST /api/dpp/link-supplier
interface LinkSupplierProduct {
  shopifyProductId: string;
  supplierProductId: string;
}
// Response: Creates MerchantSupplierLink, updates ProductSync

// POST /api/dpp/fork-supplier
interface ForkSupplierProduct {
  shopifyProductId: string;
  supplierProductId: string;
}
// Response: Copies DPP data to form, merchant completes and signs

// GET /api/dpp/:id/heritage
// Returns forked-from info if applicable
interface DppHeritage {
  forkedFrom?: {
    supplierProductId: string;
    supplierName: string;
    forkedAt: string;
    originalVcId?: string;
  };
}
```

---

## UI Flows

### Supplier Portal

```
┌─────────────────────────────────────────────────────────────────────┐
│  supplier.eurocomply.com                                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. REGISTRATION                                                    │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Create Supplier Account                                         ││
│  │                                                                  ││
│  │ Company Name: [ABC Textiles Ltd                    ]             ││
│  │ Email:        [supplier@abctextiles.com            ]             ││
│  │ Password:     [••••••••••••                        ]             ││
│  │ Country:      [India                          ▼]                 ││
│  │ Website:      [https://abctextiles.com             ]             ││
│  │                                                                  ││
│  │                              [Create Account]                    ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  2. VERIFICATION                                                    │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ ⚠️ Verification Required                                        ││
│  │                                                                  ││
│  │ To publish products, please submit:                              ││
│  │ • Business registration document                                 ││
│  │ • Tax ID / VAT certificate                                       ││
│  │                                                                  ││
│  │ [📎 Upload Documents]                                            ││
│  │                                                                  ││
│  │ Status: ⏳ Pending Review (typically 1-2 business days)          ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  3. CREATE PRODUCT                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ New Supplier Product                                            ││
│  │                                                                  ││
│  │ Product Name: [Organic Cotton T-Shirt Base         ]             ││
│  │ Category:     [Textile                        ▼]                 ││
│  │                                                                  ││
│  │ ── Fiber Composition ──────────────────────────────────────────  ││
│  │ [Same form as merchant DPP creation]                             ││
│  │                                                                  ││
│  │ ── Visibility ─────────────────────────────────────────────────  ││
│  │ ○ Public - Any verified merchant can use                         ││
│  │ ○ Invite-only - Only merchants you invite                        ││
│  │ ○ Draft - Not visible (save for later)                           ││
│  │                                                                  ││
│  │ ☐ Anchor Verifiable Credential (proves you declared this data)  ││
│  │                                                                  ││
│  │                    [Save Draft]  [Publish]                       ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Shopify Plugin (Merchant View)

```
┌─────────────────────────────────────────────────────────────────────┐
│  EuroComply > Browse Supplier Products                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [Search products...                    ] [Category ▼] [Filter ▼]  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ 🏢 ABC Textiles ✓ Verified                                      ││
│  │                                                                  ││
│  │ Organic Cotton T-Shirt Base                                      ││
│  │ 100% GOTS Organic Cotton • Made in India                         ││
│  │ 2.1 kgCO2e • GOTS, OEKO-TEX certified                            ││
│  │                                                                  ││
│  │ 🔐 Supplier VC anchored                     Used by 47 merchants ││
│  │                                                                  ││
│  │              [Use as-is]  [Customize]  [View Details]            ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ 🏢 XYZ Fabrics ✓ Verified                                       ││
│  │                                                                  ││
│  │ Recycled Polyester Hoodie                                        ││
│  │ 80% Recycled Polyester, 20% Organic Cotton • Made in Portugal    ││
│  │ 3.4 kgCO2e • GRS certified                                       ││
│  │                                                                  ││
│  │ 🔐 Supplier VC anchored                     Used by 23 merchants ││
│  │                                                                  ││
│  │              [Use as-is]  [Customize]  [View Details]            ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

─────────────────────────────────────────────────────────────────────────
"Use as-is" Modal:
┌─────────────────────────────────────────────────────────────────────┐
│  Link Supplier Product                                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  You're linking this supplier's DPP to your product:                │
│                                                                     │
│  Supplier: ABC Textiles (Verified ✓)                                │
│  Product:  Organic Cotton T-Shirt Base                              │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ ℹ️ What this means:                                             ││
│  │                                                                  ││
│  │ • The supplier's Verifiable Credential will be used              ││
│  │ • Your product page will show "DPP provided by ABC Textiles"     ││
│  │ • You cannot edit this DPP (use "Customize" to make changes)     ││
│  │ • If supplier updates data, your product updates too             ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  Select your Shopify product to link:                               │
│  [Select Product...                                            ▼]  │
│                                                                     │
│                              [Cancel]  [Link Product]               │
└─────────────────────────────────────────────────────────────────────┘

─────────────────────────────────────────────────────────────────────────
"Customize" Flow:
→ Opens DPP creation form pre-filled with supplier data
→ Banner: "Based on ABC Textiles - Organic Cotton T-Shirt Base"
→ Merchant edits fields
→ On submit: merchant signs new VC, heritage link preserved
```

---

## Verification Workflow

```
Supplier registers
       │
       ▼
┌──────────────┐
│   PENDING    │ ← Can create draft products only
└──────┬───────┘
       │ Submits documents
       ▼
┌──────────────┐
│  IN_REVIEW   │ ← Admin reviews (1-2 days)
└──────┬───────┘
       │
   ┌───┴───┐
   ▼       ▼
┌──────┐ ┌──────────┐
│VERIFY│ │ REJECTED │ → Can resubmit with corrections
└──┬───┘ └──────────┘
   │
   ▼
Can publish products to catalog
```

**Verification Criteria:**
- Valid business registration document
- Matches company name and country
- No obvious fraud indicators
- Optional: Known certifications (GOTS, OEKO-TEX) expedite review

---

## Implementation Phases

### Phase 1: Supplier Portal MVP
- [ ] Supplier registration & login (email/password)
- [ ] Basic verification workflow (document upload, manual review)
- [ ] Create/edit supplier products (textile category only)
- [ ] Publish to public catalog

### Phase 2: Shopify Integration
- [ ] Browse supplier catalog in Shopify plugin
- [ ] "Use as-is" linking flow
- [ ] "Customize" forking flow
- [ ] Display supplier attribution on product DPP view

### Phase 3: Advanced Features
- [ ] Supplier VC anchoring (optional)
- [ ] Invite-only catalogs
- [ ] Usage analytics for suppliers
- [ ] Supplier rating/reviews
- [ ] Bulk product import (CSV/API)

---

## Security Considerations

1. **Supplier authentication** - Separate from Shopify OAuth, uses email/password + optional 2FA
2. **Rate limiting** - Prevent catalog scraping, spam product creation
3. **Data validation** - Same validation rules as merchant DPPs
4. **Verification process** - Manual review prevents fake suppliers
5. **VC integrity** - Supplier VC is read-only for merchants using "as-is"
