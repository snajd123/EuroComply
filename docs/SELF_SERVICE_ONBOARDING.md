# Self-Service Onboarding Design

## Goal: "Sign up → Compliant in Same Day"

The key differentiator from enterprise competitors (SAP, Siemens) is **self-service onboarding**:
- No sales calls required
- Credit card signup
- Same-day compliance
- No IT team needed
- AI-powered data import from any file format

---

## Current State (Code vs. Docs)

| Component | Current Code | Required (SaaS Model) |
|-----------|--------------|----------------------|
| Payment flow | Not implemented | **Organizations pay us** (subscription) |
| Stripe usage | Not implemented | **Checkout/Billing** from organizations |
| Verification | Manual admin review (~48hrs) | **Instant VAT or tiered** |
| Plan enforcement | Not implemented | **Enforce product/DPP quotas** |
| Onboarding UI | Landing page only | **Guided wizard** |
| Data import | Not implemented | **AI-powered import** |

**Key insight**: Organizations (brands, manufacturers, distributors) pay subscriptions. Retailers access DPPs for free.

---

## Target Onboarding Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  SELF-SERVICE ONBOARDING FLOW (< 30 minutes to first product)      │
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
│  │ → Can now browse, but can't publish DPPs                        ││
│  └─────────────────────────────────────────────────────────────────┘│
│                              │                                      │
│                              ▼                                      │
│  STEP 3: SELECT PLAN (2 min)                                       │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                ││
│  │ │DPP STARTER  │ │DPP PROFESS. │ │  PIM + DPP  │                ││
│  │ │  €49/mo     │ │  €149/mo    │ │  €299/mo    │                ││
│  │ │ 100 products│ │ 500 products│ │2000 products│                ││
│  │ │  [Select]   │ │  [Select]   │ │  [Select]   │                ││
│  │ └─────────────┘ └─────────────┘ └─────────────┘                ││
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
│  └─────────────────────────────────────────────────────────────────┘│
│                              │                                      │
│                              ▼                                      │
│  STEP 5: BUSINESS VERIFICATION (Tiered)                            │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                                                                  ││
│  │  OPTION A: Instant (EU VAT lookup) - 30 seconds                 ││
│  │  ┌─────────────────────────────────────────────────────────────┐││
│  │  │ Enter VAT number: [DE123456789        ]                     │││
│  │  │ → Auto-verify via VIES API                                   │││
│  │  │ → Company name pre-filled                                    │││
│  │  │ → Status: VERIFIED ✓                                         │││
│  │  └─────────────────────────────────────────────────────────────┘││
│  │                                                                  ││
│  │  OPTION B: Document upload (manual review) - 24-48 hours        ││
│  │  ┌─────────────────────────────────────────────────────────────┐││
│  │  │ Upload: Business registration certificate                   │││
│  │  │ Upload: Tax certificate (optional)                          │││
│  │  │ → Admin reviews within 24-48 hours                          │││
│  │  │ → Status: PENDING_REVIEW → VERIFIED                          │││
│  │  └─────────────────────────────────────────────────────────────┘││
│  │                                                                  ││
│  │  Note: Can create products while pending, but can't PUBLISH DPP ││
│  │                                                                  ││
│  └─────────────────────────────────────────────────────────────────┘│
│                              │                                      │
│                              ▼                                      │
│  STEP 6: IMPORT PRODUCTS (5-10 min)                                │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ • AI Import: Upload CSV, Excel, PDF, or JSON                   ││
│  │ • Shopify Sync: Import existing products                       ││
│  │ • Manual: Create products with templates                        ││
│  │ • Golden Record created with commercial + compliance data      ││
│  │ • Completeness score shows progress toward DPP                  ││
│  │ → DPP auto-generated when completeness reaches 100%             ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  TOTAL TIME: ~20 minutes (with instant VAT + AI import)            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Technical Implementation

### 1. Stripe Integration (Subscription Billing)

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Pricing tiers
const PLANS = {
  dpp_starter: { priceId: 'price_dpp_starter_monthly', productLimit: 100 },
  dpp_professional: { priceId: 'price_dpp_professional_monthly', productLimit: 500 },
  pim_dpp: { priceId: 'price_pim_dpp_monthly', productLimit: 2000 },
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

### 2. VAT Verification (Instant KYB for EU)

**EU VIES API** provides instant VAT number verification:

```typescript
// Instant verification via VIES
async function verifyVatNumber(vatNumber: string): Promise<ViesResponse> {
  // Extract country code (first 2 chars)
  const countryCode = vatNumber.substring(0, 2).toUpperCase();
  const number = vatNumber.substring(2);

  const response = await fetch(
    `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${countryCode}/vat/${number}`
  );

  if (!response.ok) {
    return { valid: false, error: 'VIES API error' };
  }

  const data = await response.json();

  return {
    valid: data.isValid,
    name: data.name,
    address: data.address,
    countryCode: data.countryCode,
  };
}

// Auto-verify organization
async function instantVerification(organizationId: string, vatNumber: string) {
  const viesResult = await verifyVatNumber(vatNumber);

  if (viesResult.valid) {
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        vatNumber,
        name: viesResult.name,
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
        verificationMethod: 'VIES_AUTO',
      },
    });

    return { verified: true, companyName: viesResult.name };
  }

  return { verified: false, error: 'VAT number not found in VIES' };
}
```

### 3. Email Verification

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

### 4. Plan Enforcement

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

  // Business verification
  verificationStatus    VerificationStatus @default(PENDING)
  verificationMethod    String?  // 'VIES_AUTO' | 'MANUAL_REVIEW'
  verifiedAt            DateTime?

  // Subscription
  subscription          Subscription?

  // DID identity
  did                   String?

  // Enabled modules
  enabledModules        String[]  // ["core", "compliance", "pim", "dam", "import", "syndication"]

  // Relations
  products              Product[]
  users                 User[]

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
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
  DPP_STARTER       // €49/mo, 100 products
  DPP_PROFESSIONAL  // €149/mo, 500 products
  PIM_DPP           // €299/mo, 2000 products
  ENTERPRISE        // Custom
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

// VAT verification
POST /api/core/organizations/verify-vat
  → Instant VIES lookup

// Manual verification (fallback)
POST /api/core/organizations/verification
  → Document upload for manual review

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
├── /success          - Payment confirmed
├── /verification     - VAT entry or document upload
└── /import           - AI import wizard for first products
```

### Onboarding Progress Component

```tsx
function OnboardingProgress({ currentStep }: { currentStep: number }) {
  const steps = [
    { name: 'Register', icon: UserIcon },
    { name: 'Verify Email', icon: MailIcon },
    { name: 'Select Plan', icon: CreditCardIcon },
    { name: 'Payment', icon: CheckIcon },
    { name: 'Verify Business', icon: BuildingIcon },
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
- [ ] Add plan enforcement to DPP creation
- [ ] Remove old revenue sharing code

### Phase 2: Verification (Week 2-3)
- [ ] Add email verification flow
- [ ] Integrate VIES API for VAT lookup
- [ ] Keep manual review as fallback
- [ ] Add verification status to dashboard

### Phase 3: Onboarding UI (Week 3-4)
- [ ] Build onboarding wizard pages
- [ ] Add progress tracking
- [ ] Integrate with Stripe Checkout
- [ ] Add subscription management portal

### Phase 4: Polish (Week 4)
- [ ] Email templates (verification, welcome, payment)
- [ ] Error handling and retry logic
- [ ] Plan upgrade/downgrade flows
- [ ] Cancellation and data export

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Time to first product import | < 20 minutes |
| Instant verification rate | > 70% (EU VAT) |
| Payment conversion | > 60% |
| Onboarding completion | > 80% |

---

## Related Documentation

- [Market Analysis](./MARKET_ANALYSIS.md) - Why self-service matters
- [Business Model](./BUSINESS_MODEL.md) - Pricing tiers
- [Implementation Plan](../IMPLEMENTATION_PLAN.md) - Technical architecture

---

*Last Updated: 2026-01-08*
