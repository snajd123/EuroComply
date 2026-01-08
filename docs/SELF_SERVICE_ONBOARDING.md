# Self-Service Onboarding Design

## Goal: "Sign up → Compliant in Same Day"

The key differentiator from enterprise competitors (SAP, Siemens) is **self-service onboarding**:
- No sales calls required
- Credit card signup
- Same-day compliance
- No IT team needed

---

## Current State (Code vs. Docs)

| Component | Current Code | Required (SaaS Model) |
|-----------|--------------|----------------------|
| Payment flow | Retailers pay suppliers (revenue sharing) | **Suppliers pay us** (subscription) |
| Stripe usage | Connect payouts TO suppliers | **Checkout/Billing** FROM suppliers |
| KYB | Manual admin review (~48hrs) | **Instant or tiered** |
| Plan enforcement | Not implemented | **Enforce DPP quotas** |
| Onboarding UI | None | **Guided wizard** |

**Key insight**: The payment flow is inverted. We need to refactor from "marketplace" to "SaaS subscription" model.

---

## Target Onboarding Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  SELF-SERVICE ONBOARDING FLOW (< 30 minutes to first DPP)          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  STEP 1: REGISTER (2 min)                                          │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ • Email + password                                              ││
│  │ • Company name                                                  ││
│  │ • Country (EU only initially)                                   ││
│  │ • Supplier type: Producer / Importer / Brand                   ││
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
│  │ │  STARTER    │ │   GROWTH    │ │    PRO      │                ││
│  │ │  €49/mo     │ │  €149/mo    │ │  €399/mo    │                ││
│  │ │  50 DPPs    │ │  500 DPPs   │ │  2000 DPPs  │                ││
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
│  │  Note: Can create DPPs while pending, but can't PUBLISH         ││
│  │                                                                  ││
│  └─────────────────────────────────────────────────────────────────┘│
│                              │                                      │
│                              ▼                                      │
│  STEP 6: CREATE FIRST DPP (15-20 min)                              │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ • Select category: Textiles / Furniture / Electronics          ││
│  │ • Choose template: "Cotton T-Shirt", "Denim Jeans", etc.       ││
│  │ • Fill mandatory fields (highlighted)                           ││
│  │ • Optional: Use carbon calculator                               ││
│  │ • Preview DPP                                                   ││
│  │ • Issue Verifiable Credential (did:key)                         ││
│  │ → PUBLISHED (if verified) or DRAFT (if pending)                 ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  TOTAL TIME: ~25 minutes (with instant VAT verification)           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Technical Implementation

### 1. Stripe Integration (Subscription Billing)

**Change from current code**: Remove revenue sharing, add subscription billing.

```typescript
// NEW: Stripe Subscription (not Connect payouts)
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Pricing tiers
const PLANS = {
  starter: { priceId: 'price_starter_monthly', dppLimit: 50 },
  growth: { priceId: 'price_growth_monthly', dppLimit: 500 },
  pro: { priceId: 'price_pro_monthly', dppLimit: 2000 },
};

// Create checkout session
async function createCheckoutSession(supplierId: string, plan: keyof typeof PLANS) {
  const supplier = await getSupplier(supplierId);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: supplier.email,
    line_items: [{
      price: PLANS[plan].priceId,
      quantity: 1,
    }],
    success_url: `${DASHBOARD_URL}/onboarding/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${DASHBOARD_URL}/onboarding/plan`,
    metadata: {
      supplierId,
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
      await activateSubscription(session.metadata.supplierId, session.subscription);
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

// Auto-verify supplier
async function instantVerification(supplierId: string, vatNumber: string) {
  const viesResult = await verifyVatNumber(vatNumber);

  if (viesResult.valid) {
    await prisma.supplier.update({
      where: { id: supplierId },
      data: {
        vatNumber,
        companyName: viesResult.name,
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
async function sendVerificationEmail(supplier: Supplier) {
  const token = jwt.sign(
    { supplierId: supplier.id, purpose: 'email_verification' },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  const verifyUrl = `${DASHBOARD_URL}/verify-email?token=${token}`;

  await emailService.send({
    to: supplier.email,
    subject: 'Verify your EuroComply account',
    template: 'email-verification',
    data: { verifyUrl, companyName: supplier.companyName },
  });
}

// Verify email endpoint
async function verifyEmail(token: string) {
  const payload = jwt.verify(token, process.env.JWT_SECRET);

  await prisma.supplier.update({
    where: { id: payload.supplierId },
    data: { emailVerified: true, emailVerifiedAt: new Date() },
  });
}
```

### 4. Plan Enforcement

```typescript
// Check DPP quota before creation
async function checkDppQuota(supplierId: string): Promise<boolean> {
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    include: { subscription: true, _count: { select: { products: true } } },
  });

  if (!supplier.subscription || supplier.subscription.status !== 'ACTIVE') {
    throw new Error('No active subscription');
  }

  const limit = PLANS[supplier.subscription.plan].dppLimit;
  const used = supplier._count.products;

  if (used >= limit) {
    throw new Error(`DPP limit reached (${used}/${limit}). Upgrade your plan.`);
  }

  return true;
}
```

---

## Database Schema Changes

```prisma
// Remove old revenue sharing fields, add subscription fields

model Supplier {
  id                    String   @id @default(cuid())
  email                 String   @unique
  passwordHash          String
  companyName           String
  country               String
  vatNumber             String?

  // Email verification
  emailVerified         Boolean  @default(false)
  emailVerifiedAt       DateTime?

  // Business verification
  verificationStatus    VerificationStatus @default(PENDING)
  verificationMethod    String?  // 'VIES_AUTO' | 'MANUAL_REVIEW'
  verifiedAt            DateTime?

  // Subscription (NEW - replaces revenue sharing)
  subscription          Subscription?

  // DID identity
  did                   String?

  // Relations
  products              SupplierProduct[]

  // REMOVE these old fields:
  // stripeConnectAccountId  (was for payouts TO suppliers)
  // payoutEnabled           (was for revenue sharing)
  // payoutMinimum           (was for revenue sharing)

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}

model Subscription {
  id                    String   @id @default(cuid())
  supplierId            String   @unique
  supplier              Supplier @relation(fields: [supplierId], references: [id])

  // Stripe data
  stripeCustomerId      String
  stripeSubscriptionId  String

  // Plan info
  plan                  SubscriptionPlan  // STARTER | GROWTH | PRO
  status                SubscriptionStatus // ACTIVE | PAST_DUE | CANCELED
  dppLimit              Int

  // Billing period
  currentPeriodStart    DateTime
  currentPeriodEnd      DateTime
  cancelAtPeriodEnd     Boolean @default(false)

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}

enum SubscriptionPlan {
  STARTER   // €49/mo, 50 DPPs
  GROWTH    // €149/mo, 500 DPPs
  PRO       // €399/mo, 2000 DPPs
}

enum SubscriptionStatus {
  ACTIVE
  PAST_DUE
  CANCELED
  TRIALING
}

// REMOVE these models (old revenue sharing):
// - SupplierEarning
// - SupplierPayout
// - ProductSubscription (pricing fields)
```

---

## API Endpoints

### New Endpoints (Onboarding)

```typescript
// Registration
POST /api/suppliers/register
  → Creates supplier, sends verification email

// Email verification
POST /api/suppliers/verify-email
  → Verifies email token

// Plan selection
POST /api/suppliers/checkout
  → Creates Stripe checkout session, redirects to payment

// Stripe webhook
POST /api/webhooks/stripe
  → Handles subscription events

// VAT verification
POST /api/suppliers/verify-vat
  → Instant VIES lookup

// Manual verification (fallback)
POST /api/suppliers/verification
  → Document upload for manual review

// Subscription management
GET  /api/suppliers/subscription
  → Current plan, usage, billing info

POST /api/suppliers/subscription/upgrade
  → Upgrade plan via Stripe portal

POST /api/suppliers/subscription/cancel
  → Cancel subscription
```

### Removed Endpoints (Old Model)

```typescript
// REMOVE these (revenue sharing model):
GET  /api/suppliers/earnings
POST /api/suppliers/payouts/request
GET  /api/suppliers/payouts
POST /api/suppliers/stripe/connect  // Was for Connect payouts
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
└── /first-dpp        - Guided DPP creation wizard
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
    { name: 'Create DPP', icon: DocumentIcon },
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
| Time to first DPP | < 30 minutes |
| Instant verification rate | > 70% (EU VAT) |
| Payment conversion | > 60% |
| Onboarding completion | > 80% |

---

## Related Documentation

- [Market Analysis](./MARKET_ANALYSIS.md) - Why self-service matters
- [Business Model](./BUSINESS_MODEL.md) - Pricing tiers
- [Implementation Roadmap](./IMPLEMENTATION_ROADMAP.md) - Full roadmap

---

*Last Updated: 2026-01-08*
