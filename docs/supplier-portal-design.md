# Supplier Portal Design

## Overview

EuroComply uses a **supplier-only model** for Digital Product Passports. Only verified suppliers can create passports - merchants can only subscribe to use them. This eliminates fraud by design.

## Core Principles

1. **Suppliers create, merchants subscribe** - Only verified suppliers can create DPPs
2. **No merchant-created passports** - Merchants cannot create, copy, or modify DPPs
3. **Single source of truth** - Each DPP is maintained by its supplier
4. **Verified suppliers only** - Suppliers must complete KYB verification before publishing
5. **Dynamic pricing** - Suppliers set their own prices (minimum €0.50/product/month)

---

## Monetization Model

### Revenue Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  MERCHANT SUBSCRIBES TO SUPPLIER DPP                                │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Supplier sets price: €X/product/month (minimum €0.50)           ││
│  └─────────────────────────────────────────────────────────────────┘│
│                      │                                              │
│                      ▼                                              │
│           ┌─────────────────────┐                                   │
│           │  MONTHLY BILLING    │                                   │
│           │  Charged via Stripe │                                   │
│           └──────────┬──────────┘                                   │
│                      │                                              │
│           ┌──────────┴──────────┐                                   │
│           ▼                     ▼                                   │
│  ┌─────────────────┐   ┌─────────────────┐                          │
│  │ SUPPLIER: 80%   │   │ EUROCOMPLY: 20% │                          │
│  └─────────────────┘   └─────────────────┘                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Pricing Structure

| Parameter | Value |
|-----------|-------|
| **Floor Price** | €0.50/product/month (minimum) |
| **Ceiling** | None (suppliers set their own price) |
| **Platform Fee** | 20% of supplier's price |
| **Supplier Revenue** | 80% of subscription price |

**Rationale:**
- **Dynamic pricing** lets suppliers price according to product value and market
- **Floor ensures revenue** - no free passports that devalue the marketplace
- **80/20 split** incentivizes suppliers while funding platform

### Billing Mechanics

```
┌─────────────────────────────────────────────────────────────────────┐
│  MONTHLY BILLING CYCLE                                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Day 1-30: Active subscriptions tracked                             │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Merchant: fashion-store.myshopify.com                           ││
│  │                                                                  ││
│  │ Active DPP subscriptions:                                        ││
│  │  • ABC Textiles - Organic T-Shirt    €2.00 × 3 products = €6.00 ││
│  │  • XYZ Fabrics - Recycled Hoodie     €1.50 × 1 product  = €1.50 ││
│  │                                                                  ││
│  │ Monthly total: €7.50                                            ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  Day 1 (next month): Merchant charged via Stripe                    │
│                                                                     │
│  Revenue distribution:                                              │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ ABC Textiles:  €6.00 × 80% = €4.80                              ││
│  │ XYZ Fabrics:   €1.50 × 80% = €1.20                              ││
│  │ EuroComply:    €7.50 × 20% = €1.50                              ││
│  │                               ─────────                          ││
│  │                       Total:  €7.50                              ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  Monthly payouts to suppliers (via Stripe Connect)                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Database Schema (Billing)

```prisma
// Add to Supplier model
model Supplier {
  // ... existing fields ...

  // Payout settings
  stripeConnectAccountId  String?   // For receiving payouts
  payoutEnabled           Boolean   @default(false)
  payoutMinimum           Decimal   @default(10.00) // Min balance for payout

  // Relations
  earnings                SupplierEarning[]
  payouts                 SupplierPayout[]
}

// Track individual subscription events
model DppSubscriptionEvent {
  id                  String   @id @default(cuid())

  // Who subscribed
  merchantShop        String
  shopifyProductId    String

  // What was subscribed to
  supplierProductId   String
  supplierId          String

  // Pricing at time of subscription (supplier-set price)
  priceCharged        Decimal  // Total price (supplier's price)
  supplierShare       Decimal  // 80%
  platformShare       Decimal  // 20%

  // Billing status
  billingStatus       BillingStatus @default(PENDING)
  billedAt            DateTime?
  merchantInvoiceId   String?  // Stripe reference

  // For recurring subscriptions
  billingPeriodStart  DateTime?
  billingPeriodEnd    DateTime?

  createdAt           DateTime @default(now())

  @@index([merchantShop, billingStatus])
  @@index([supplierId, billingStatus])
}

enum BillingStatus {
  PENDING         // Usage tracked, not yet billed
  BILLED          // Charged to merchant
  PAID            // Merchant payment received
  FAILED          // Payment failed
  REFUNDED        // Refunded to merchant
}

// Aggregate supplier earnings
model SupplierEarning {
  id                  String   @id @default(cuid())
  supplierId          String
  supplier            Supplier @relation(fields: [supplierId], references: [id])

  // Period
  periodStart         DateTime
  periodEnd           DateTime

  // Amounts
  grossEarnings       Decimal  // Total before platform fee
  platformFee         Decimal  // 20% taken by EuroComply
  netEarnings         Decimal  // Amount to pay supplier

  // Stats
  subscriptionCount   Int      // Number of active subscriptions

  // Payout status
  payoutStatus        PayoutStatus @default(PENDING)
  payoutId            String?

  createdAt           DateTime @default(now())

  @@unique([supplierId, periodStart])
  @@index([supplierId, payoutStatus])
}

enum PayoutStatus {
  PENDING           // Awaiting payout
  PROCESSING        // Payout initiated
  COMPLETED         // Money transferred
  FAILED            // Payout failed
  HELD              // Below minimum or issue
}

// Actual payouts to suppliers
model SupplierPayout {
  id                  String   @id @default(cuid())
  supplierId          String
  supplier            Supplier @relation(fields: [supplierId], references: [id])

  amount              Decimal
  currency            String   @default("EUR")

  // Stripe
  stripeTransferId    String?
  stripePayoutId      String?

  status              PayoutStatus
  failureReason       String?

  initiatedAt         DateTime @default(now())
  completedAt         DateTime?

  @@index([supplierId, status])
}
```

### Merchant Billing Integration

```typescript
// Integration with Stripe Billing

interface MerchantSubscriptionBilling {
  // 1. Create subscription when merchant subscribes to DPP
  createSubscription(params: {
    merchantId: string;
    supplierProductId: string;
    price: number;  // Supplier's price
  }): Promise<{
    subscriptionId: string;
    clientSecret: string;
  }>;

  // 2. Stripe handles recurring billing automatically
  // 3. We receive webhook when payment succeeds
}

// Example subscription creation
async function onDppSubscribed(
  merchantShop: string,
  supplierProductId: string,
  supplierPrice: number
) {
  const supplierShare = supplierPrice * 0.80;
  const platformShare = supplierPrice * 0.20;

  // Record in our DB
  await prisma.dppSubscriptionEvent.create({
    data: {
      merchantShop,
      supplierProductId,
      priceCharged: supplierPrice,
      supplierShare,
      platformShare,
      billingStatus: 'PENDING',
      billingPeriodStart: startOfMonth(new Date()),
      billingPeriodEnd: endOfMonth(new Date()),
    }
  });

  // Create Stripe subscription
  await stripe.subscriptions.create({
    customer: merchantStripeCustomerId,
    items: [{ price: supplierPriceId }],
    metadata: {
      supplierProductId,
      merchantShop,
    },
  });
}
```

### Supplier Dashboard (Earnings)

```
┌─────────────────────────────────────────────────────────────────────┐
│  supplier.eurocomply.com > Earnings                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  💰 Earnings Overview                                               │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                                                                  ││
│  │  This Month          All Time           Pending Payout           ││
│  │  ┌──────────┐       ┌──────────┐       ┌──────────┐             ││
│  │  │  €124.80 │       │ €1,847.20│       │  €89.60  │             ││
│  │  │  ↑ 12%   │       │          │       │  [Request Payout]      ││
│  │  └──────────┘       └──────────┘       └──────────┘             ││
│  │                                                                  ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  📊 Subscriptions by Product                                        │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Product                  Price    Subs    Monthly Earnings      ││
│  │ ─────────────────────────────────────────────────────────────── ││
│  │ Organic Cotton T-Shirt   €2.00     47     €75.20                ││
│  │ Recycled Hoodie          €1.50     23     €27.60                ││
│  │ Linen Summer Dress       €2.50     18     €36.00                ││
│  │ Denim Jacket             €1.00     12     € 9.60                ││
│  │                                                                  ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  💳 Payout Settings                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Status: ✓ Connected via Stripe                                  ││
│  │ Account: ****4242 (ABC Textiles Ltd)                            ││
│  │ Minimum payout: €10.00                                          ││
│  │ Payout schedule: Monthly (1st of month)                         ││
│  │                                                                  ││
│  │ [Update Bank Details]  [View Payout History]                    ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Pricing Tiers (Optional Future)

```
┌─────────────────────────────────────────────────────────────────────┐
│  SUPPLIER TIER SYSTEM                                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Standard (Free)              Premium (€49/mo)                      │
│  ─────────────────            ─────────────────                     │
│  • Up to 10 products          • Unlimited products                  │
│  • 80% revenue share          • 85% revenue share                   │
│  • Public catalog only        • Invite-only catalogs                │
│  • Basic analytics            • Advanced analytics                  │
│  • Email support              • Priority support                    │
│                               • Featured in catalog                 │
│                               • Bulk import tools                   │
│                                                                     │
│  Verified Partner (Apply)                                           │
│  ─────────────────────────                                          │
│  • 90% revenue share                                                │
│  • Verified badge in catalog                                        │
│  • API access for automation                                        │
│  • Dedicated account manager                                        │
│  • Co-marketing opportunities                                       │
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
│  2. Complete KYB verification (business docs, manual review)        │
│  3. Create Products with full DPP data                              │
│  4. Set price (minimum €0.50/product/month)                         │
│  5. Publish to catalog                                              │
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
│  │ 12 products       │  │ 8 products        │  │ (not visible)   │ │
│  │ €0.50-€3.00/mo    │  │ €1.00-€5.00/mo    │  │                 │ │
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
│  │ Price: €2.00/product/month                                      ││
│  │                                                                  ││
│  │  [Subscribe]  [View Details]                                    ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  Subscribe:                                                         │
│  → Link supplier DPP to your product                                │
│  → Supplier's VC displayed on your store                            │
│  → "Verified by ABC Textiles"                                       │
│  → Merchant cannot modify DPP data                                  │
│  → Unsubscribe anytime (stops displaying)                           │
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

  // Supplier subscription support (merchants can ONLY subscribe, not create)
  supplierProductId   String?  // Supplier product being subscribed to
  supplierLink        MerchantSupplierLink? @relation(fields: [supplierLinkId], references: [id])
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

// Track active subscriptions between merchants and supplier products
model MerchantSupplierLink {
  id                  String   @id @default(cuid())

  // Merchant side
  shop                String
  shopifyProductId    String
  productSync         ProductSync?

  // Supplier side
  supplierProductId   String   // References SupplierProduct.id

  // Subscription details
  linkType            MerchantLinkType @default(LINKED)  // Always LINKED (no FORKED)
  subscribedAt        DateTime @default(now())
  priceAtSubscription Decimal  // Price locked at time of subscription

  // Denormalized for quick access
  supplierName        String
  supplierVerified    Boolean

  @@unique([shop, shopifyProductId])
  @@index([supplierProductId])
}

enum MerchantLinkType {
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
// Response: Creates MerchantSupplierLink, updates ProductSync, initiates billing

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
│  │ 💰 €2.00/product/month            Used by 47 merchants           ││
│  │                                                                  ││
│  │              [Subscribe]  [View Details]                         ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ 🏢 XYZ Fabrics ✓ Verified                                       ││
│  │                                                                  ││
│  │ Recycled Polyester Hoodie                                        ││
│  │ 80% Recycled Polyester, 20% Organic Cotton • Made in Portugal    ││
│  │ 3.4 kgCO2e • GRS certified                                       ││
│  │                                                                  ││
│  │ 💰 €1.50/product/month            Used by 23 merchants           ││
│  │                                                                  ││
│  │              [Subscribe]  [View Details]                         ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

─────────────────────────────────────────────────────────────────────────
Subscribe Modal:
┌─────────────────────────────────────────────────────────────────────┐
│  Subscribe to Supplier DPP                                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  You're subscribing to this supplier's Digital Product Passport:    │
│                                                                     │
│  Supplier: ABC Textiles (Verified ✓)                                │
│  Product:  Organic Cotton T-Shirt Base                              │
│  Price:    €2.00/product/month                                      │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ ℹ️ What this means:                                             ││
│  │                                                                  ││
│  │ • The supplier's verified DPP will display on your store         ││
│  │ • Your product shows "Verified by ABC Textiles"                  ││
│  │ • You cannot modify the DPP data (supplier controls it)          ││
│  │ • If supplier updates data, your product updates too             ││
│  │ • You can unsubscribe at any time                                ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  Select your Shopify product to link:                               │
│  [Select Product...                                            ▼]  │
│                                                                     │
│                              [Cancel]  [Subscribe - €2.00/mo]       │
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
- [x] Set dynamic pricing (minimum €0.50/product/month)
- [x] Publish to public catalog

### Phase 2: Shopify Integration ✅
- [x] Browse supplier catalog in Shopify plugin
- [x] Subscribe to supplier DPPs flow
- [x] Display supplier attribution on product DPP view
- [x] Unsubscribe flow

### Phase 3: Billing & Payouts (In Progress)
- [ ] Stripe Connect integration for suppliers
- [ ] Merchant subscription billing
- [ ] Revenue sharing (80% supplier, 20% platform)
- [ ] Supplier earnings dashboard
- [ ] Payout requests

### Phase 4: Advanced Features
- [ ] Supplier VC anchoring
- [ ] Invite-only catalogs
- [ ] Usage analytics for suppliers
- [ ] Bulk product import (CSV/API)

---

## Security Considerations

1. **Supplier authentication** - Separate from Shopify OAuth, uses email/password + optional 2FA
2. **Rate limiting** - Prevent catalog scraping, spam product creation
3. **Data validation** - Same validation rules as merchant DPPs
4. **Verification process** - Manual review prevents fake suppliers
5. **VC integrity** - Supplier VC is read-only for merchants using "as-is"
