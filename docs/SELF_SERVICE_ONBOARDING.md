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
| **Operations** | Registry, EPCIS, Inventory | Set up suppliers, track inventory |
| **Compliance** | DPP Issuance, Attestation | Review DPP readiness |

**Note:** Organizations are often all three (brand + manufacturer + distributor). The starting workspace is just where you begin—all workspaces are available to the founder.

**Key Architecture:**
- **Design, Operations, Marketing** workspaces WRITE to The Hub, building the Golden Record
- **Compliance** workspace READS the Golden Record from The Hub to issue DPPs
- Each workspace contributes different data: technical DNA (Design), supply chain (Operations), commercial content (Marketing)

**Access Control:**
- First user (founder) gets **all workspaces as MANAGER + Admin**
- When inviting team members, the admin explicitly selects their workspace access
- No automatic assignment—admin decides based on job function

See [USER_MANAGEMENT.md](./USER_MANAGEMENT.md) for workspace access and role templates, and [GOLDEN_RECORD.md](./GOLDEN_RECORD.md) for how product data flows into The Hub.

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
│  │ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐    ││
│  │ │     GROWTH      │ │      SCALE      │ │   ENTERPRISE    │    ││
│  │ │    €129/mo      │ │    €399/mo      │ │     Custom      │    ││
│  │ │  2,000 products │ │ 20,000 products │ │    Unlimited    │    ││
│  │ │  ALL FEATURES   │ │  ALL FEATURES   │ │  ALL + SLA/SSO  │    ││
│  │ │    [Select]     │ │    [Select]     │ │    [Contact]    │    ││
│  │ └─────────────────┘ └─────────────────┘ └─────────────────┘    ││
│  │                                                                  ││
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
│  │ Materials      │ EPCIS         │ DAM-Media     │ Attestation   ││
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
│  │ • Data flows to The Hub, building the Golden Record            ││
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

// Pricing tiers (all plans include unlimited users)
const PLANS = {
  dpp_starter: { priceId: 'price_dpp_starter_monthly', productLimit: 100 },
  dpp_professional: { priceId: 'price_dpp_professional_monthly', productLimit: 1000 },
  pim_standard: { priceId: 'price_pim_standard_monthly', productLimit: 5000 },
  pim_growth: { priceId: 'price_pim_growth_monthly', productLimit: 25000 },
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
// Check product quota before creation
async function checkProductQuota(organizationId: string): Promise<boolean> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { subscription: true, _count: { select: { products: true } } },
  });

  if (!organization.subscription || organization.subscription.status !== 'ACTIVE') {
    throw new Error('No active subscription');
  }

  const limit = PLANS[organization.subscription.plan].productLimit;
  const used = organization._count.products;

  if (used >= limit) {
    throw new Error(`Product limit reached (${used}/${limit}). Upgrade your plan.`);
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

  // Enabled modules (backend capabilities)
  enabledModules        String[]  // ["core", "compliance", "pim", "dam", "import", "syndication", "epcis", "attestation"]

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
  GROWTH            // €129/mo, 2,000 products, ALL features, unlimited users
  SCALE             // €399/mo, 20,000 products, ALL features, unlimited users
  ENTERPRISE        // Custom, unlimited products, ALL features + SLA/SSO
}

enum SubscriptionStatus {
  ACTIVE
  PAST_DUE
  CANCELED
  TRIALING
}
```

---

## API Endpoints

### Onboarding Endpoints

```typescript
// Registration
POST /api/core/auth/register
  → Creates organization, sends verification email

// Email verification
POST /api/core/auth/verify-email
  → Verifies email token

// Plan selection
POST /api/core/billing/checkout
  → Creates Stripe checkout session, redirects to payment

// Stripe webhook
POST /api/webhooks/stripe
  → Handles subscription events

// Subscription management
GET  /api/core/billing/subscription
  → Current plan, usage, billing info

POST /api/core/billing/upgrade
  → Upgrade plan via Stripe portal

POST /api/core/billing/cancel
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

## Related Documentation

- [Golden Record](./GOLDEN_RECORD.md) - How The Hub builds authoritative product data
- [Market Analysis](./MARKET_ANALYSIS.md) - Why self-service matters
- [Business Model](./BUSINESS_MODEL.md) - Pricing tiers
- [Implementation Plan](../IMPLEMENTATION_PLAN.md) - Technical architecture

---

*Last Updated: 2026-01-11*
