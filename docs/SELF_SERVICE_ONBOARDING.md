# Self-Service Onboarding Design

## Goal: "Sign up → Compliant in Same Day"

The key differentiator from enterprise competitors (SAP, Siemens) is **self-service onboarding**:
- No sales calls required
- Credit card signup
- Same-day compliance
- No IT team needed
- AI-powered data import from any file format
- Role-based workspace access from day one

### Workspace-Based Onboarding

EuroComply provides **four workspaces**. During onboarding, the founder selects which workspace to start with (this is just UI guidance, not access control):

| Starting Workspace | Primary Modules | Typical First Action |
|-------------------|-----------------|---------------------|
| **Marketing** | PIM, DAM-Media, Syndication | Import product catalog |
| **Design** | Registry, Materials, DAM-Tech | Set up materials/BOMs |
| **Operations** | Registry, Item Tracking, Inventory | Set up suppliers, track inventory |
| **Compliance** | DPP Issuance, Attestation | Review DPP readiness |

**Note:** Organizations are often all three (brand + manufacturer + distributor). The starting workspace is just where you begin—all workspaces are available to the founder.

**Key Architecture:**
- **Design, Operations, Marketing** workspaces WRITE to The Hub, building workspace data
- **Compliance** workspace READS workspace data from The Hub to issue DPPs
- Each workspace contributes different data: technical DNA (Design), supply chain (Operations), commercial content (Marketing)

**Access Control:**
- First user (founder) gets **all workspaces as MANAGER + Admin**
- When inviting team members, the admin explicitly selects their workspace access
- No automatic assignment—admin decides based on job function

See [USER_MANAGEMENT.md](./USER_MANAGEMENT.md) for workspace access, role templates, and how product data flows into The Hub.

---

## Current State (Code vs. Docs)

| Component | Current Code | Required (SaaS Model) |
|-----------|--------------|----------------------|
| Payment flow | Not implemented | **Organizations pay us** (subscription) |
| Stripe usage | Not implemented | **Checkout/Billing** from organizations |
| Plan enforcement | Not implemented | **Enforce product/DPP quotas** |
| Onboarding UI | Landing page only | **Guided wizard** |
| Data import | Not implemented | **AI-powered import** |
| DPP issuance | Not implemented | **DPP Ready list with manual approval** |

**Key insight**: Organizations (brands, manufacturers, distributors) pay subscriptions. Retailers access DPPs for free. No business verification required - customers get immediate access after registration and payment.

---

## Target Onboarding Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  SELF-SERVICE ONBOARDING FLOW (< 15 minutes to first product)      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  STEP 1: REGISTER (2 min)                                          │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ • Email + password                                              ││
│  │ • Company name                                                  ││
│  │ • Country (EU only initially)                                   ││
│  │ • Organization type: Brand / Manufacturer / Distributor         ││
│  │ → Email verification link sent                                  ││
│  └─────────────────────────────────────────────────────────────────┘│
│                              │                                      │
│                              ▼                                      │
│  STEP 2: VERIFY EMAIL (1 min)                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ • Click link in email                                          ││
│  │ • Account activated                                             ││
│  │ → Proceed to plan selection                                     ││
│  └─────────────────────────────────────────────────────────────────┘│
│                              │                                      │
│                              ▼                                      │
│  STEP 3: SELECT PLAN (2 min)                                       │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ ┌───────────┐┌───────────┐┌───────────┐┌───────────┐┌───────────┐││
│  │ │  STARTER  ││  GROWTH   ││   SCALE   ││ENTERPRISE ││ PLATFORM  │││
│  │ │  €79/mo   ││  €199/mo  ││  €599/mo  ││ €1,499/mo ││  Custom   │││
│  │ │+€0.10/DPP ││+€0.05/DPP ││+€0.02/DPP ││+€0.008/DPP││ Contact   │││
│  │ │  10GB     ││   50GB    ││   200GB   ││    1TB    ││           │││
│  │ │ [Select]  ││ [Select]  ││ [Select]  ││ [Select]  ││ [Contact] │││
│  │ └───────────┘└───────────┘└───────────┘└───────────┘└───────────┘││
│  │ All plans: Unlimited products, unlimited users, volume discounts ││
│  │ → Stripe Checkout redirect                                      ││
│  └─────────────────────────────────────────────────────────────────┘│
│                              │                                      │
│                              ▼                                      │
│  STEP 4: PAYMENT (2 min)                                           │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ • Stripe Checkout (hosted page)                                 ││
│  │ • Credit card / SEPA / iDEAL                                    ││
│  │ • VAT handled automatically (Stripe Tax)                        ││
│  │ → Subscription active immediately                               ││
│  │ → FULL ACCESS GRANTED - ready to use EuroComply                 ││
│  └─────────────────────────────────────────────────────────────────┘│
│                              │                                      │
│                              ▼                                      │
│  STEP 4.5: WORKSPACE INTRODUCTION (1 min)                          │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ "What would you like to do first?"                              ││
│  │                                                                  ││
│  │ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐││
│  │ │   Design    │ │ Operations  │ │  Marketing  │ │ Compliance  │││
│  │ │  Set up     │ │  Manage     │ │  Enrich     │ │  Issue      │││
│  │ │  BOMs &     │ │  inventory  │ │  product    │ │  DPPs       │││
│  │ │  materials  │ │  & suppliers│ │  content    │ │             │││
│  │ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘││
│  │ Registry,      │ Registry,     │ PIM,          │ Compliance,   ││
│  │ Materials      │ Item Tracking │ DAM-Media     │ Attestation   ││
│  │                                                                  ││
│  │ → Guides user to appropriate workspace                          ││
│  │ → All workspaces remain accessible via workspace switcher       ││
│  └─────────────────────────────────────────────────────────────────┘│
│                              │                                      │
│                              ▼                                      │
│  STEP 5: IMPORT PRODUCTS (5-10 min)                                │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ • AI Import: Upload CSV, Excel, PDF, or JSON                   ││
│  │ • Shopify Sync: Import existing products                       ││
│  │ • Manual: Create products with templates                        ││
│  │ • Data flows to The Hub, building workspace data                ││
│  │ • Completeness score shows progress toward DPP                  ││
│  │ → Products appear in DPP Ready list at 100% completeness        ││
│  └─────────────────────────────────────────────────────────────────┘│
│                              │                                      │
│                              ▼                                      │
│  STEP 6: REVIEW & ISSUE DPPs                                       │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ • DPP Ready Products list shows all complete products          ││
│  │ • Review product data before issuing                           ││
│  │ • Approve to issue DPP with Verifiable Credential              ││
│  │ • QR code and public URL generated upon approval               ││
│  │ → DPP is now live and accessible                                ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  TOTAL TIME: ~15 minutes (with AI import)                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Technical Implementation

### 1. Stripe Integration (Subscription Billing)

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Pricing tiers (all plans include unlimited users, ALL features)
const PLANS = {
  growth: { priceId: 'price_growth_monthly', productLimit: 500, itemLimit: 10000, price: 129 },
  scale: { priceId: 'price_scale_monthly', productLimit: 5000, itemLimit: 1000000, price: 399 },
  enterprise: { priceId: 'price_enterprise_monthly', productLimit: -1, itemLimit: 100000000, price: 999 },
  mega: { priceId: 'price_mega_monthly', productLimit: -1, itemLimit: -1, price: 4999 },
};

// Create checkout session
async function createCheckoutSession(organizationId: string, plan: keyof typeof PLANS) {
  const organization = await getOrganization(organizationId);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: organization.email,
    line_items: [{
      price: PLANS[plan].priceId,
      quantity: 1,
    }],
    success_url: `${DASHBOARD_URL}/onboarding/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${DASHBOARD_URL}/onboarding/plan`,
    metadata: {
      organizationId,
      plan,
    },
    tax_id_collection: { enabled: true },  // Collect VAT ID
    automatic_tax: { enabled: true },       // Calculate VAT
  });

  return session.url;
}

// Webhook handler
async function handleStripeWebhook(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      await activateSubscription(session.metadata.organizationId, session.subscription);
      break;
    case 'customer.subscription.updated':
      await updateSubscriptionStatus(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await deactivateSubscription(event.data.object);
      break;
    case 'invoice.payment_failed':
      await handleFailedPayment(event.data.object);
      break;
  }
}
```

### 2. Email Verification

```typescript
// Send verification email on registration
async function sendVerificationEmail(organization: Organization) {
  const token = jwt.sign(
    { organizationId: organization.id, purpose: 'email_verification' },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  const verifyUrl = `${DASHBOARD_URL}/verify-email?token=${token}`;

  await emailService.send({
    to: organization.email,
    subject: 'Verify your EuroComply account',
    template: 'email-verification',
    data: { verifyUrl, companyName: organization.name },
  });
}

// Verify email endpoint
async function verifyEmail(token: string) {
  const payload = jwt.verify(token, process.env.JWT_SECRET);

  await prisma.organization.update({
    where: { id: payload.organizationId },
    data: { emailVerified: true, emailVerifiedAt: new Date() },
  });
}
```

### 3. Plan Enforcement

```typescript
// Plan limits (from Architecture Doc v1.3)
const PLAN_LIMITS = {
  growth: { productLimit: 500, itemLimit: 10_000, maxBatchSize: 10_000 },
  scale: { productLimit: 5_000, itemLimit: 1_000_000, maxBatchSize: 100_000 },
  enterprise: { productLimit: -1, itemLimit: 100_000_000, maxBatchSize: 1_000_000 },
  mega: { productLimit: -1, itemLimit: -1, maxBatchSize: 10_000_000 },
};

// Check product quota before creation
async function checkProductQuota(organizationId: string): Promise<boolean> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { subscription: true, _count: { select: { products: true } } },
  });

  if (!organization.subscription || organization.subscription.status !== 'ACTIVE') {
    throw new Error('No active subscription');
  }

  const limits = PLAN_LIMITS[organization.subscription.plan.toLowerCase()];
  const used = organization._count.products;

  if (limits.productLimit !== -1 && used >= limits.productLimit) {
    throw new Error(`Product limit reached (${used}/${limits.productLimit}). Upgrade your plan.`);
  }

  return true;
}

// Check item quota before bulk generation
async function checkItemQuota(organizationId: string, newItemCount: number): Promise<boolean> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { subscription: true },
  });

  const limits = PLAN_LIMITS[organization.subscription.plan.toLowerCase()];

  // Check batch size limit
  if (newItemCount > limits.maxBatchSize) {
    throw new Error(`Batch size ${newItemCount} exceeds limit (${limits.maxBatchSize}). Split into smaller batches.`);
  }

  // Check total item limit (query DynamoDB for current count)
  if (limits.itemLimit !== -1) {
    const currentItemCount = await getItemCount(organizationId); // DynamoDB query
    if (currentItemCount + newItemCount > limits.itemLimit) {
      throw new Error(`Item limit would be exceeded. Current: ${currentItemCount}, Adding: ${newItemCount}, Limit: ${limits.itemLimit}`);
    }
  }

  return true;
}
```

---

## Database Schema Changes

```prisma
// Organization model for brands, manufacturers, distributors

model Organization {
  id                    String   @id @default(cuid())
  email                 String   @unique
  name                  String
  type                  OrganizationType  // BRAND | MANUFACTURER | DISTRIBUTOR
  country               String
  vatNumber             String?

  // Email verification
  emailVerified         Boolean  @default(false)
  emailVerifiedAt       DateTime?

  // Subscription
  subscription          Subscription?

  // DID identity
  did                   String?

  // QR Lifecycle Configuration (selected at signup, ESPR compliance)
  // Determines what happens to DPP URLs if subscription is cancelled
  qrLifecycleOption     QRLifecycleOption  @default(DORMANT_HOSTING)

  // Enabled modules (backend capabilities)
  enabledModules        String[]  @default(["core", "compliance", "pim", "dam", "import", "syndication", "item_tracking", "attestation"])
  // Note: All modules enabled by default for all plans. This field exists for:
  // - Enterprise customers who may want to disable specific modules
  // - Future use if module-based pricing is introduced
  // - Internal testing/development environments

  // Default workspace (based on org type during onboarding)
  defaultWorkspace      Workspace @default(MARKETING)

  // Relations
  products              Product[]
  users                 User[]

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}

// Workspace enum - all customers get all workspaces
enum Workspace {
  DESIGN       // PLM: Registry, Materials, DAM-Tech (product structure, BOMs)
  OPERATIONS   // ERP-lite: Registry, EPCIS, Inventory (suppliers, tracking)
  MARKETING    // PIM: PIM, DAM-Media, Syndication (content, channels)
  COMPLIANCE   // DPP: Compliance, Attestation (issuance, certifications)
}

model Subscription {
  id                    String   @id @default(cuid())
  organizationId        String   @unique
  organization          Organization @relation(fields: [organizationId], references: [id])

  // Stripe data
  stripeCustomerId      String
  stripeSubscriptionId  String

  // Plan info
  plan                  SubscriptionPlan
  status                SubscriptionStatus
  productLimit          Int

  // Billing period
  currentPeriodStart    DateTime
  currentPeriodEnd      DateTime
  cancelAtPeriodEnd     Boolean @default(false)

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}

enum OrganizationType {
  BRAND
  MANUFACTURER
  DISTRIBUTOR
}

enum SubscriptionPlan {
  STARTER           // €79/mo base + €0.10/DPP, 10GB storage, unlimited products
  GROWTH            // €199/mo base + €0.05/DPP, 50GB storage, unlimited products
  SCALE             // €599/mo base + €0.02/DPP, 200GB storage, priority support
  ENTERPRISE        // €1,499/mo base + €0.008/DPP, 1TB storage, dedicated support + SLA
  PLATFORM          // Custom base + per-DPP, dedicated infrastructure
}

enum SubscriptionStatus {
  ACTIVE
  PAST_DUE
  CANCELED
  TRIALING
}

// QR Lifecycle Option - Selected at signup, determines ESPR compliance strategy
// See ARCHITECTURE_PORTABILITY.md for full documentation
enum QRLifecycleOption {
  DORMANT_HOSTING      // Default: €99/year to keep DPPs accessible after cancel
  GS1_RESOLVER         // Customer uses GS1 resolver to redirect to self-hosted
  SELF_MANAGED         // Customer manages own domain and redirects
}
```

---

## API Endpoints

### Onboarding Endpoints

```typescript
// Registration
POST /api/v1/auth/register
  → Creates organization, sends verification email

// Email verification
POST /api/v1/auth/verify-email
  → Verifies email token

// Plan selection
POST /api/v1/billing/checkout
  → Creates Stripe checkout session, redirects to payment

// Stripe webhook
POST /api/v1/webhooks/stripe
  → Handles subscription events

// Subscription management
GET  /api/v1/billing/subscription
  → Current plan, usage, billing info

POST /api/v1/billing/upgrade
  → Upgrade plan via Stripe portal

POST /api/v1/billing/cancel
  → Cancel subscription
```

---

## Onboarding UI (Dashboard)

```
/onboarding/
├── /register         - Email, password, company info
├── /verify-email     - Waiting for email verification
├── /plan             - Select subscription tier
├── /payment          - Redirects to Stripe Checkout
├── /success          - Payment confirmed, full access granted
└── /import           - AI import wizard for first products

/dashboard/
├── /products         - Product management
├── /dpp-ready        - DPP Ready list (products at 100% completeness)
└── /passports        - Issued DPPs
```

### Onboarding Progress Component

```tsx
function OnboardingProgress({ currentStep }: { currentStep: number }) {
  const steps = [
    { name: 'Register', icon: UserIcon },
    { name: 'Verify Email', icon: MailIcon },
    { name: 'Select Plan', icon: CreditCardIcon },
    { name: 'Payment', icon: CheckIcon },
    { name: 'Import Products', icon: UploadIcon },
  ];

  return (
    <div className="flex items-center justify-between">
      {steps.map((step, index) => (
        <div key={step.name} className={cn(
          'flex items-center',
          index < currentStep ? 'text-green-600' : 'text-gray-400'
        )}>
          <step.icon className="w-6 h-6" />
          <span className="ml-2">{step.name}</span>
          {index < steps.length - 1 && <ArrowRight className="mx-4" />}
        </div>
      ))}
    </div>
  );
}
```

---

## Implementation Phases

### Phase 1: Core Subscription (Week 1-2)
- [ ] Add Subscription model to Prisma schema
- [ ] Implement Stripe Checkout integration
- [ ] Implement Stripe webhook handlers
- [ ] Add plan enforcement to product creation
- [ ] Add email verification flow

### Phase 2: Onboarding UI (Week 2-3)
- [ ] Build onboarding wizard pages
- [ ] Add progress tracking
- [ ] Integrate with Stripe Checkout
- [ ] Add subscription management portal

### Phase 3: DPP Ready Workflow (Week 3-4)
- [ ] Implement DPP Ready Products list
- [ ] Add completeness calculation trigger
- [ ] Build review and approval UI
- [ ] Implement manual DPP issuance

### Phase 4: Polish (Week 4)
- [ ] Email templates (verification, welcome, payment)
- [ ] Error handling and retry logic
- [ ] Plan upgrade/downgrade flows
- [ ] Cancellation and data export

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Time to first product import | < 15 minutes |
| Time from registration to full access | < 10 minutes |
| Payment conversion | > 60% |
| Onboarding completion | > 80% |
| DPP Ready to issuance rate | > 90% |

---

## Technical Provisioning

When a subscription is activated, the system provisions tenant infrastructure per [Architecture Document v1.3](../EuroComply_Architecture_Document_v1.3.md).

### Provisioning Steps (Architecture v1.3 §3.5)

```typescript
async function provisionTenant(organizationId: string, plan: SubscriptionPlan) {
  // 1. Assign to cell with capacity (~200 tenants max per cell)
  const cell = await findCellWithCapacity();

  // 2. Create dedicated PostgreSQL schema
  await cell.connection.query(`CREATE SCHEMA IF NOT EXISTS tenant_${organizationId}`);

  // 3. Generate per-tenant encryption key (KMS DEK)
  const dek = await kms.generateDataKey({ KeyId: MASTER_KEY_ID });
  await storeEncryptedDEK(organizationId, dek);

  // 4. Run schema migrations
  await runMigrations(cell.connection, `tenant_${organizationId}`);

  // 5. Register in routing database
  await prisma.tenantRouting.create({
    data: {
      organizationId,
      cellId: cell.id,
      schemaName: `tenant_${organizationId}`,
      createdAt: new Date(),
    }
  });

  // 6. For Platform tier: provision dedicated cluster
  if (plan === 'PLATFORM') {
    await provisionDedicatedCluster(organizationId);
  }
}
```

### Module to Workspace Mapping

The `enabledModules` field maps to Architecture v1.3 workspace capabilities:

| Module | Workspace | Architecture v1.3 Reference |
|--------|-----------|---------------------------|
| `core` | All | Base platform functionality |
| `compliance` | Compliance | DPP generation, audit, export (§2.1) |
| `pim` | Marketing | Product content, families, variants |
| `dam` | Design + Marketing | Technical docs (Design), Media assets (Marketing) |
| `import` | All | AI-powered import, CSV/Excel |
| `syndication` | Marketing | Shopify sync, channel export |
| `item_tracking` | Operations | DynamoDB items, lifecycle events (§5.3) |
| `attestation` | All | Multi-party attestation VCs |

### Tier-Specific Infrastructure

| Tier | Cell Type | Database | Notes |
|------|-----------|----------|-------|
| Starter | Shared cell | Schema in shared RDS | ~200 tenants/cell |
| Growth | Shared cell | Schema in shared RDS | ~200 tenants/cell |
| Scale | Shared cell | Schema in shared RDS + per-tenant credentials | Same isolation, enhanced auth |
| Enterprise | Dedicated instance | Own RDS instance | Full instance isolation |
| Platform | Dedicated cluster | Multi-AZ RDS + dedicated workers | Custom SLA |

See [Architecture Document §3 (Multi-Tenancy)](../EuroComply_Architecture_Document_v1.3.md#3-multi-tenancy-architecture) for complete details.

---

## Related Documentation

- [User Management](./USER_MANAGEMENT.md) - Workspace-based access control and data ownership
- [Market Analysis](./MARKET_ANALYSIS.md) - Why self-service matters
- [Business Model](./BUSINESS_MODEL.md) - Pricing tiers
- [Architecture Document](../EuroComply_Architecture_Document_v1.3.md) - Technical architecture

---

*Last Updated: 2026-01-14*
