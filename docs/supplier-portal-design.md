# Supplier Portal Design

## Overview

EuroComply uses a **supplier-only model** for Digital Product Passports. Only verified suppliers can create passports - retailers access them for free (ESPR Article 31 mandate). This eliminates fraud by design.

## Core Principles

1. **Suppliers create, retailers access free** - Only verified suppliers can create DPPs
2. **No retailer-created passports** - Retailers cannot create, copy, or modify DPPs
3. **Single source of truth** - Each DPP is maintained by its supplier
4. **Verified suppliers only** - Suppliers must complete KYB verification before publishing
5. **SME-focused SaaS** - Simple pricing tiers for small businesses (€49-399/month)

---

## Business Model: Supplier-Pays SaaS

### Revenue Flow (ESPR Article 31 Compliant)

```
┌─────────────────────────────────────────────────────────────────────┐
│  SUPPLIER-PAYS SAAS MODEL                                           │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Supplier pays SaaS fee: €49/149/399 per month                   ││
│  │ (based on DPP volume: 50/500/2000 DPPs)                         ││
│  └─────────────────────────────────────────────────────────────────┘│
│                      │                                              │
│                      ▼                                              │
│           ┌─────────────────────┐                                   │
│           │  EUROCOMPLY         │                                   │
│           │  Provides:          │                                   │
│           │  • DPP Creator      │                                   │
│           │  • VC Issuance      │                                   │
│           │  • Managed Hosting  │                                   │
│           │  • Retailer Catalog │                                   │
│           └──────────┬──────────┘                                   │
│                      │                                              │
│                      ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ RETAILERS ACCESS FREE (ESPR Article 31 mandate)                 ││
│  │ Browse catalog, link DPPs, display on storefront                ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Pricing Tiers

| Tier | Monthly | DPPs Included | Features |
|------|---------|---------------|----------|
| **Starter** | €49 | 50 | Creator studio, VCs, hosting, QR codes |
| **Growth** | €149 | 500 | + CSV import, templates, priority support |
| **Pro** | €399 | 2,000 | + API access, white-label, dedicated support |

**Why no Enterprise tier?** SMEs are our focus. Large enterprises use SAP/Siemens.

**Why free for retailers?** ESPR Article 31 mandates free DPP access for all economic operators.

### Supplier Dashboard

```
┌─────────────────────────────────────────────────────────────────────┐
│  supplier.eurocomply.com > Dashboard                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  📊 Subscription Overview                                           │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                                                                  ││
│  │  Current Plan           DPPs Used          Retailers Using       ││
│  │  ┌──────────┐          ┌──────────┐       ┌──────────┐          ││
│  │  │  Growth  │          │  127/500 │       │    47    │          ││
│  │  │  €149/mo │          │          │       │          │          ││
│  │  └──────────┘          └──────────┘       └──────────┘          ││
│  │                                                                  ││
│  │  [Upgrade Plan]  [Manage Subscription]                          ││
│  │                                                                  ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  📦 Your Products                                                   │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Product                  Status    Retailers    Last Updated    ││
│  │ ─────────────────────────────────────────────────────────────── ││
│  │ Organic Cotton T-Shirt   Published    23        2 days ago      ││
│  │ Recycled Hoodie          Published    18        1 week ago      ││
│  │ Linen Summer Dress       Draft         0        Today           ││
│  │                                                                  ││
│  │ [+ Create New Product]                                          ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  📤 Data Portability                                                │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Export all your DPPs and Verifiable Credentials anytime.        ││
│  │ Your data is portable - take it to any platform.                ││
│  │                                                                  ││
│  │ [Export All Data]  [View Export History]                        ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  SUPPLIER PORTAL (supplier.eurocomply.com)                          │
│                                                                     │
│  1. Register (email/password)                                       │
│  2. Subscribe to SaaS plan (€49/149/399 per month)                  │
│  3. Complete KYB verification (business docs, manual review)        │
│  4. Create Products with full DPP data                              │
│  5. Issue Verifiable Credentials (did:key)                          │
│  6. Publish to catalog (retailers access free)                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ EuroComply API
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SUPPLIER CATALOG (Free Access for Retailers)                       │
│                                                                     │
│  ┌───────────────────┐  ┌───────────────────┐  ┌─────────────────┐ │
│  │ ABC Textiles      │  │ XYZ Fabrics       │  │ 123 Mills       │ │
│  │ ✓ Verified        │  │ ✓ Verified        │  │ ⏳ Pending      │ │
│  │ 12 products       │  │ 8 products        │  │ (not visible)   │ │
│  │ Growth Plan       │  │ Pro Plan          │  │                 │ │
│  └───────────────────┘  └───────────────────┘  └─────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ Browse / Search / Filter (FREE)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SHOPIFY PLUGIN (Retailer View - Free Access)                       │
│                                                                     │
│  "Browse Supplier Products"                                         │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Organic Cotton T-Shirt Base                by ABC Textiles      ││
│  │ ✓ GOTS Certified  ✓ 2.1 kgCO2e  ✓ REACH Compliant               ││
│  │ ✓ Verifiable Credential (did:key)                               ││
│  │                                                                  ││
│  │  [Link to My Product - FREE]  [View Details]                    ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  Link DPP (Free - ESPR Article 31):                                 │
│  → Associate supplier DPP with your product                         │
│  → Supplier's VC displayed on your store                            │
│  → "Verified by ABC Textiles"                                       │
│  → Retailer cannot modify DPP data                                  │
│  → Unlink anytime (stops displaying)                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Supplier Portal (EuroComply Core)

```prisma
// Supplier account (separate from Shopify retailers)
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
  INVITE_ONLY  // Only invited retailers can see
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

  // Pricing (supplier-set, minimum €0.50)
  price               Decimal  @db.Decimal(10, 2)  // Monthly price per product

  // Full DPP data
  dppData             Json     // TextileDppData | ElectronicsDppData | etc.

  // VC status
  vcStatus            VcStatus @default(NONE)
  vcId                String?  // EuroComply VC ID if anchored
  vcAnchoredAt        DateTime?

  // Visibility
  visibility          ProductVisibility @default(DRAFT)
  publishedAt         DateTime?

  // Subscription stats
  activeSubscriptions Int      @default(0)  // Current active subscribers

  // Relations
  retailerSubscriptions  RetailerSubscription[]

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
  DRAFT        // Not visible to retailers
  PUBLISHED    // Visible per catalog visibility settings
  ARCHIVED     // Hidden but preserved
}

// Invite-only access for specific retailers
model SupplierInvitation {
  id                  String   @id @default(cuid())
  supplierId          String
  supplier            Supplier @relation(fields: [supplierId], references: [id])

  retailerEmail       String   // Or shop domain
  retailerShop        String?  // Shopify shop domain if known

  status              InvitationStatus @default(PENDING)
  invitedAt           DateTime @default(now())
  acceptedAt          DateTime?

  @@unique([supplierId, retailerEmail])
  @@index([retailerShop])
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
// Existing model - extended for subscriptions
model ProductSync {
  id                  String   @id @default(cuid())
  shop                String
  shopifyProductId    String

  // Existing fields
  syncStatus          String   @default("pending")
  eurocomplyDppId     String?
  lastSyncedAt        DateTime?
  errorMessage        String?

  // Supplier subscription support (retailers can ONLY subscribe, not create)
  supplierProductId   String?  // Supplier product being subscribed to
  supplierLink        RetailerSubscription? @relation(fields: [supplierLinkId], references: [id])
  supplierLinkId      String?  @unique
  subscriptionStatus  SubscriptionStatus @default(INACTIVE)

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@unique([shop, shopifyProductId])
  @@index([shop])
}

enum SubscriptionStatus {
  INACTIVE        // Not subscribed to any supplier DPP
  ACTIVE          // Active subscription
  CANCELLED       // Subscription cancelled
  PAYMENT_FAILED  // Payment failed, grace period
}

// Track active subscriptions between retailers and supplier products
model RetailerSubscription {
  id                  String   @id @default(cuid())

  // Retailer side
  shop                String
  shopifyProductId    String
  productSync         ProductSync?

  // Supplier side
  supplierProductId   String   // References SupplierProduct.id

  // Subscription details
  linkType            RetailerLinkType @default(LINKED)  // Always LINKED (no FORKED)
  subscribedAt        DateTime @default(now())
  priceAtSubscription Decimal  // Price locked at time of subscription

  // Denormalized for quick access
  supplierName        String
  supplierVerified    Boolean

  @@unique([shop, shopifyProductId])
  @@index([supplierProductId])
}

enum RetailerLinkType {
  LINKED  // Only option - subscribed to supplier's DPP
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

// POST /api/dpp/subscribe
interface SubscribeToSupplierProduct {
  shopifyProductId: string;
  supplierProductId: string;
}
// Response: Creates RetailerSubscription, updates ProductSync, initiates billing

// POST /api/dpp/unsubscribe
interface UnsubscribeFromSupplierProduct {
  shopifyProductId: string;
}
// Response: Marks subscription as cancelled, stops billing at end of period

// GET /api/dpp/:id/subscription
// Returns subscription status
interface DppSubscription {
  active: boolean;
  supplier: {
    id: string;
    name: string;
    verified: boolean;
  };
  price: number;
  subscribedAt: string;
  nextBillingDate: string;
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
│  │ [DPP creation form for suppliers]                                ││
│  │                                                                  ││
│  │ ── Visibility ─────────────────────────────────────────────────  ││
│  │ ○ Public - Any verified retailer can use                         ││
│  │ ○ Invite-only - Only retailers you invite                        ││
│  │ ○ Draft - Not visible (save for later)                           ││
│  │                                                                  ││
│  │ ☐ Anchor Verifiable Credential (proves you declared this data)  ││
│  │                                                                  ││
│  │                    [Save Draft]  [Publish]                       ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Shopify Plugin (Retailer View - Free Access)

```
┌─────────────────────────────────────────────────────────────────────┐
│  EuroComply > Browse Supplier Products (Free Access)                │
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
│  │ ✓ Verifiable Credential (did:key)     Used by 47 retailers       ││
│  │                                                                  ││
│  │              [Link DPP - Free]  [View Details]                   ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ 🏢 XYZ Fabrics ✓ Verified                                       ││
│  │                                                                  ││
│  │ Recycled Polyester Hoodie                                        ││
│  │ 80% Recycled Polyester, 20% Organic Cotton • Made in Portugal    ││
│  │ 3.4 kgCO2e • GRS certified                                       ││
│  │                                                                  ││
│  │ ✓ Verifiable Credential (did:key)     Used by 23 retailers       ││
│  │                                                                  ││
│  │              [Link DPP - Free]  [View Details]                   ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

─────────────────────────────────────────────────────────────────────────
Link DPP Modal:
┌─────────────────────────────────────────────────────────────────────┐
│  Link Supplier DPP (Free - ESPR Article 31)                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  You're linking this supplier's Digital Product Passport:           │
│                                                                     │
│  Supplier: ABC Textiles (Verified ✓)                                │
│  Product:  Organic Cotton T-Shirt Base                              │
│  Cost:     FREE (required by EU regulation)                         │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ ℹ️ What this means:                                             ││
│  │                                                                  ││
│  │ • The supplier's verified DPP will display on your store         ││
│  │ • Your product shows "Verified by ABC Textiles"                  ││
│  │ • You cannot modify the DPP data (supplier controls it)          ││
│  │ • If supplier updates data, your product updates too             ││
│  │ • You can unlink at any time                                     ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  Select your Shopify product to link:                               │
│  [Select Product...                                            ▼]  │
│                                                                     │
│                              [Cancel]  [Link DPP - Free]            │
└─────────────────────────────────────────────────────────────────────┘
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

### Phase 1: Supplier Portal MVP ✅
- [x] Supplier registration & login (email/password)
- [x] Basic verification workflow (document upload, manual review)
- [x] Create/edit supplier products (textile category only)
- [x] SaaS subscription tiers (€49/149/399)
- [x] Publish to public catalog

### Phase 2: Shopify/Retailer Integration ✅
- [x] Browse supplier catalog in Shopify plugin (free access)
- [x] Link DPPs to products (free - ESPR Article 31)
- [x] Display supplier attribution on product DPP view
- [x] Unlink flow

### Phase 3: Verifiable Credentials ✅
- [x] did:key identity for suppliers
- [x] VC issuance via walt.id
- [x] Data portability (export VCs + keys)
- [x] Offline verification

### Phase 4: Advanced Features
- [ ] Invite-only catalogs
- [ ] Usage analytics for suppliers
- [ ] Bulk product import (CSV/API)
- [ ] GS1 Digital Link resolver
- [ ] Basic AAS export (compliance format)

---

## Security Considerations

1. **Supplier authentication** - Separate from Shopify OAuth, uses email/password + optional 2FA
2. **Rate limiting** - Prevent catalog scraping, spam product creation
3. **Data validation** - Same validation rules for all DPPs
4. **Verification process** - Manual review prevents fake suppliers
5. **VC integrity** - Supplier VC is read-only for retailers (no modifications allowed)
