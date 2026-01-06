# EuroComply External Integrations Plan

## Overview

This document outlines all external integrations required for production, how to obtain access, and implementation priority.

---

## 1. VAT Validation - VIES

**Purpose**: Validate EU VAT numbers for KYB verification

**Provider**: European Commission (FREE)

**API**: SOAP/REST
- SOAP: `https://ec.europa.eu/taxation_customs/vies/checkVatService.wsdl`
- REST (unofficial): Various wrappers available

**How to Get Access**:
- No registration required - publicly available
- Rate limited (~100 requests/minute)

**Implementation**:
```typescript
// Replace simulation in kyb.service.ts with real VIES call
import soap from 'soap';

const VIES_URL = 'https://ec.europa.eu/taxation_customs/vies/checkVatService.wsdl';

async function validateVatVies(countryCode: string, vatNumber: string) {
  const client = await soap.createClientAsync(VIES_URL);
  const result = await client.checkVatAsync({
    countryCode,
    vatNumber,
  });
  return {
    valid: result[0].valid,
    name: result[0].name,
    address: result[0].address,
  };
}
```

**Priority**: HIGH
**Effort**: 1 day
**Cost**: FREE

---

## 2. Business Registry APIs

**Purpose**: Verify company registration, get official company data

### Option A: OpenCorporates (Recommended for MVP)

**Coverage**: 140+ jurisdictions, 200M+ companies

**API**: REST

**How to Get Access**:
1. Go to https://opencorporates.com/api_accounts/new
2. Sign up for API account
3. Free tier: 500 requests/month
4. Paid: Starting $500/month for 10K requests

**Implementation**:
```typescript
const OPENCORPORATES_API = 'https://api.opencorporates.com/v0.4';

async function lookupCompany(jurisdiction: string, companyNumber: string) {
  const response = await fetch(
    `${OPENCORPORATES_API}/companies/${jurisdiction}/${companyNumber}?api_token=${API_KEY}`
  );
  return response.json();
}
```

### Option B: National Registries (Direct)

| Country | Registry | API Available | Cost |
|---------|----------|---------------|------|
| DE | Handelsregister | Yes (paid) | ~€2/query |
| FR | Infogreffe | Yes | ~€1/query |
| UK | Companies House | Yes (FREE) | Free |
| NL | KVK | Yes | ~€0.50/query |
| ES | BORME | Scraping only | - |

**UK Companies House** (FREE - good for testing):
1. Go to https://developer.company-information.service.gov.uk/
2. Register for API key
3. 600 requests/5 minutes

**Priority**: HIGH
**Effort**: 3-5 days (multiple registries)
**Cost**: $500-2000/month depending on volume

---

## 3. Sanctions & AML Screening

**Purpose**: Check merchants/UBOs against sanctions lists, PEP databases

### Option A: OpenSanctions (Open Source)

**Coverage**: EU, UN, US, UK sanctions + PEP data

**How to Get Access**:
1. Go to https://opensanctions.org/api/
2. Self-host (free) or use hosted API
3. Bulk data download available

**Implementation**:
```typescript
const OPENSANCTIONS_API = 'https://api.opensanctions.org';

async function screenEntity(name: string, birthDate?: string) {
  const response = await fetch(`${OPENSANCTIONS_API}/match/default`, {
    method: 'POST',
    headers: { 'Authorization': `ApiKey ${API_KEY}` },
    body: JSON.stringify({
      schema: 'Person',
      properties: { name: [name], birthDate: [birthDate] }
    })
  });
  return response.json();
}
```

### Option B: ComplyAdvantage (Enterprise)

**Coverage**: Comprehensive - sanctions, PEP, adverse media

**How to Get Access**:
1. Contact sales: https://complyadvantage.com/
2. Pricing: ~$10K+/year

### Option C: Dow Jones Risk & Compliance (Enterprise)

**How to Get Access**:
1. Contact sales
2. Pricing: Enterprise ($$$$)

**Priority**: HIGH (required for KYB)
**Effort**: 2-3 days
**Cost**: FREE (OpenSanctions) to $10K+/year (enterprise)

---

## 4. Identity Verification (IDV)

**Purpose**: Verify UBO identities, document verification

### Option A: Veriff

**Features**: ID document verification, liveness check, biometrics

**How to Get Access**:
1. Go to https://www.veriff.com/
2. Sign up for demo/sandbox
3. Pricing: Pay-per-verification (~$2-5/verification)

### Option B: Onfido

**How to Get Access**:
1. Go to https://onfido.com/
2. Sign up for sandbox
3. Pricing: Similar to Veriff

### Option C: Sumsub

**How to Get Access**:
1. Go to https://sumsub.com/
2. Good for EU compliance
3. Pricing: Competitive

**Implementation** (Veriff example):
```typescript
async function createVerificationSession(userId: string) {
  const response = await fetch('https://stationapi.veriff.com/v1/sessions', {
    method: 'POST',
    headers: {
      'X-AUTH-CLIENT': VERIFF_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      verification: {
        callback: 'https://api.eurocomply.io/webhooks/veriff',
        person: { idNumber: userId },
        vendorData: userId,
      }
    })
  });
  return response.json(); // Returns URL to redirect user
}
```

**Priority**: MEDIUM (needed for full KYB)
**Effort**: 3-5 days
**Cost**: $2-5 per verification

---

## 5. Address Verification

**Purpose**: Verify business addresses exist and are deliverable

### Option A: Google Address Validation API

**How to Get Access**:
1. Go to https://console.cloud.google.com/
2. Enable Address Validation API
3. Pricing: $0.005/request (first 10K free/month)

### Option B: Loqate (GBG)

**How to Get Access**:
1. Go to https://www.loqate.com/
2. Good for EU addresses
3. Pricing: Pay-per-use

**Implementation**:
```typescript
async function validateAddress(address: object) {
  const response = await fetch(
    'https://addressvalidation.googleapis.com/v1:validateAddress',
    {
      method: 'POST',
      headers: { 'X-Goog-Api-Key': GOOGLE_API_KEY },
      body: JSON.stringify({ address })
    }
  );
  return response.json();
}
```

**Priority**: MEDIUM
**Effort**: 1 day
**Cost**: ~$50-200/month

---

## 6. Payment & Billing - Stripe

**Purpose**: Subscription billing, usage-based pricing

**How to Get Access**:
1. Go to https://dashboard.stripe.com/register
2. Get API keys immediately
3. Complete business verification for live mode

**Implementation**:
```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create customer on org signup
async function createCustomer(org: Organization) {
  return stripe.customers.create({
    email: org.email,
    metadata: { organizationId: org.id }
  });
}

// Create subscription
async function createSubscription(customerId: string, priceId: string) {
  return stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
  });
}
```

**Priority**: HIGH (for monetization)
**Effort**: 3-5 days
**Cost**: 2.9% + $0.30 per transaction

---

## 7. Email - Transactional

**Purpose**: Send verification emails, notifications, alerts

### Option A: Resend (Recommended)

**How to Get Access**:
1. Go to https://resend.com/
2. Sign up (free tier: 3K emails/month)
3. Add DNS records for domain verification

### Option B: SendGrid

**How to Get Access**:
1. Go to https://sendgrid.com/
2. Free tier: 100 emails/day

### Option C: AWS SES

**How to Get Access**:
1. AWS Console → SES
2. Cheapest at scale ($0.10/1000 emails)

**Implementation** (Resend):
```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendVerificationEmail(to: string, code: string) {
  await resend.emails.send({
    from: 'noreply@eurocomply.io',
    to,
    subject: 'Verify your email',
    html: `<p>Your code: ${code}</p>`
  });
}
```

**Priority**: HIGH
**Effort**: 1 day
**Cost**: FREE to $20/month

---

## 8. walt.id Community Stack

**Purpose**: DID management, VC issuance, verification

**Status**: Already integrated in code

**How to Deploy**:

### Option A: Self-hosted (Docker)
```yaml
# docker-compose.yml
services:
  waltid-core:
    image: waltid/core-api:latest
    ports: ["7000:7000"]

  waltid-signatory:
    image: waltid/signatory-api:latest
    ports: ["7001:7001"]

  waltid-custodian:
    image: waltid/custodian-api:latest
    ports: ["7002:7002"]

  waltid-auditor:
    image: waltid/auditor-api:latest
    ports: ["7003:7003"]
```

### Option B: walt.id Cloud (Managed)
1. Go to https://walt.id/
2. Contact for cloud offering
3. Pricing: TBD

**Priority**: HIGH (already integrated)
**Effort**: 1-2 days for deployment
**Cost**: FREE (self-hosted) or managed pricing

---

## 9. EBSI - European Blockchain (Future)

**Purpose**: did:ebsi for official EU recognition, trusted registries

**Status**: Not yet integrated (using did:web for now)

**How to Get Access**:
1. Apply for EBSI onboarding: https://ec.europa.eu/digital-building-blocks/wikis/display/EBSI/
2. Requires legal entity verification
3. Onboarding process takes weeks/months

**When to Integrate**: After product-market fit with did:web

**Priority**: LOW (future milestone)
**Effort**: 2-4 weeks
**Cost**: ~€10-50 per DID registration

---

## 10. File Storage

**Purpose**: Store compliance documents, QR codes, exports

### Option A: AWS S3

**How to Get Access**:
1. AWS Console → S3
2. Create bucket with appropriate policies

### Option B: Cloudflare R2

**How to Get Access**:
1. Cloudflare Dashboard → R2
2. S3-compatible, no egress fees
3. Pricing: $0.015/GB/month

**Implementation**:
```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: 'eu-central-1' });

async function uploadDocument(key: string, buffer: Buffer) {
  await s3.send(new PutObjectCommand({
    Bucket: 'eurocomply-documents',
    Key: key,
    Body: buffer,
  }));
  return `https://eurocomply-documents.s3.eu-central-1.amazonaws.com/${key}`;
}
```

**Priority**: MEDIUM
**Effort**: 1 day
**Cost**: ~$10-50/month

---

## 11. Monitoring & Observability

### Sentry (Error Tracking)
- https://sentry.io/
- Free tier available
- Effort: 2 hours

### Datadog / Grafana (Metrics)
- Application metrics, dashboards
- Effort: 1-2 days

### PagerDuty (Alerting)
- On-call alerting
- Effort: 1 day

---

## Implementation Roadmap

### Phase 1: Core Integrations (Week 1-2)
| Integration | Provider | Cost | Effort |
|-------------|----------|------|--------|
| VAT Validation | VIES | FREE | 1 day |
| Sanctions Screening | OpenSanctions | FREE | 2 days |
| Email | Resend | FREE | 1 day |
| Error Tracking | Sentry | FREE | 2 hours |

### Phase 2: Business Registries (Week 3-4)
| Integration | Provider | Cost | Effort |
|-------------|----------|------|--------|
| UK Companies | Companies House | FREE | 1 day |
| EU Companies | OpenCorporates | $500/mo | 2 days |
| Address Validation | Google | $50/mo | 1 day |

### Phase 3: Monetization (Week 5-6)
| Integration | Provider | Cost | Effort |
|-------------|----------|------|--------|
| Payments | Stripe | 2.9%+30c | 3 days |
| File Storage | Cloudflare R2 | $20/mo | 1 day |

### Phase 4: Advanced KYB (Week 7-8)
| Integration | Provider | Cost | Effort |
|-------------|----------|------|--------|
| ID Verification | Veriff/Sumsub | $3/verify | 3 days |
| Enhanced Screening | ComplyAdvantage | $10K/yr | 2 days |

---

## Environment Variables Needed

```env
# VAT Validation
# (No API key needed for VIES)

# Business Registries
OPENCORPORATES_API_KEY=
COMPANIES_HOUSE_API_KEY=

# Sanctions
OPENSANCTIONS_API_KEY=

# Identity Verification
VERIFF_API_KEY=
VERIFF_API_SECRET=

# Address
GOOGLE_MAPS_API_KEY=

# Payments
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Email
RESEND_API_KEY=

# Storage
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET=

# walt.id
WALTID_CORE_API=http://localhost:7000
WALTID_SIGNATORY_API=http://localhost:7001
WALTID_CUSTODIAN_API=http://localhost:7002
WALTID_AUDITOR_API=http://localhost:7003

# Monitoring
SENTRY_DSN=
```

---

## Estimated Monthly Costs (Production)

| Service | Cost |
|---------|------|
| VIES | FREE |
| OpenCorporates | $500 |
| OpenSanctions | FREE (self-host) |
| Veriff | ~$500 (100 verifications) |
| Google Address | $50 |
| Stripe | 2.9% of revenue |
| Resend | $20 |
| Cloudflare R2 | $20 |
| walt.id | FREE (self-host) |
| **Total** | **~$1,100/month + Stripe fees** |

---

## Action Items

- [ ] Sign up for OpenCorporates API
- [ ] Get Companies House API key
- [ ] Set up OpenSanctions (self-host or API)
- [ ] Create Stripe account
- [ ] Set up Resend for email
- [ ] Deploy walt.id stack
- [ ] Create S3/R2 bucket
- [ ] Set up Sentry
- [ ] Add all env variables to deployment config
