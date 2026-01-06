# EuroComply External Integrations Plan

## Philosophy: Open Compliance

EuroComply uses **official government sources** and **open-source data** wherever possible. This isn't a limitation—it's a feature:

- **VIES** is the official EU Commission VAT database
- **OpenSanctions** aggregates official EU/UN/US/UK sanction lists
- **Companies House** is the official UK government registry
- **walt.id** provides W3C-compliant verifiable credentials

Premium providers charge €10K-100K/year for the same underlying data with better UX. We make EU compliance accessible to SMEs who can't afford enterprise solutions.

---

## Core Integrations (All FREE or Near-FREE)

### 1. VAT Validation - VIES (European Commission)

**What it is**: The official EU VAT Information Exchange System
**Coverage**: All 27 EU member states
**Cost**: FREE
**Reliability**: ★★★★★ (It's the official source)

**How to Get Access**:
- No registration required - publicly available
- Rate limited (~100 requests/minute)

**Implementation**:
```typescript
// packages/integrations/src/vies.ts
import soap from 'soap';

const VIES_URL = 'https://ec.europa.eu/taxation_customs/vies/checkVatService.wsdl';

export interface ViesResult {
  valid: boolean;
  name: string;
  address: string;
  countryCode: string;
  vatNumber: string;
  requestDate: Date;
}

export async function validateVat(countryCode: string, vatNumber: string): Promise<ViesResult> {
  const client = await soap.createClientAsync(VIES_URL);
  const [result] = await client.checkVatAsync({
    countryCode: countryCode.toUpperCase(),
    vatNumber: vatNumber.replace(/[^0-9A-Za-z]/g, ''),
  });

  return {
    valid: result.valid,
    name: result.name || '',
    address: result.address || '',
    countryCode: result.countryCode,
    vatNumber: result.vatNumber,
    requestDate: new Date(result.requestDate),
  };
}
```

**Priority**: HIGH
**Effort**: 1 day

---

### 2. Sanctions & PEP Screening - OpenSanctions

**What it is**: Open-source aggregation of official sanctions lists
**Coverage**: EU, UN, US OFAC, UK HMT, plus PEP databases from 100+ countries
**Cost**: FREE (self-hosted) or FREE API tier
**Reliability**: ★★★★★ (Same data as ComplyAdvantage, just open)

**Data Sources Included**:
- EU Consolidated Sanctions List
- UN Security Council Sanctions
- US OFAC SDN List
- UK HMT Sanctions
- Politically Exposed Persons (PEP) databases
- Interpol Red Notices

**How to Get Access**:
1. Self-host: `docker pull opensanctions/yente`
2. Or use API: https://api.opensanctions.org/ (free tier available)

**Implementation**:
```typescript
// packages/integrations/src/sanctions.ts

const OPENSANCTIONS_API = process.env.OPENSANCTIONS_API || 'https://api.opensanctions.org';

export interface SanctionsMatch {
  id: string;
  caption: string;
  schema: string;
  score: number;
  features: Record<string, number>;
  datasets: string[];
}

export interface ScreeningResult {
  matches: SanctionsMatch[];
  isClean: boolean;
  highestScore: number;
  checkedAt: Date;
}

export async function screenEntity(
  name: string,
  type: 'Person' | 'Company' = 'Person',
  options?: { birthDate?: string; nationality?: string; address?: string }
): Promise<ScreeningResult> {
  const properties: Record<string, string[]> = {
    name: [name],
  };

  if (options?.birthDate) properties.birthDate = [options.birthDate];
  if (options?.nationality) properties.nationality = [options.nationality];
  if (options?.address) properties.address = [options.address];

  const response = await fetch(`${OPENSANCTIONS_API}/match/default`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.OPENSANCTIONS_API_KEY && {
        'Authorization': `ApiKey ${process.env.OPENSANCTIONS_API_KEY}`
      }),
    },
    body: JSON.stringify({
      schema: type,
      properties,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenSanctions API error: ${response.status}`);
  }

  const data = await response.json();
  const matches = data.results || [];
  const highestScore = matches.length > 0 ? Math.max(...matches.map((m: SanctionsMatch) => m.score)) : 0;

  return {
    matches,
    isClean: highestScore < 0.7, // Configurable threshold
    highestScore,
    checkedAt: new Date(),
  };
}

export async function screenCompany(
  companyName: string,
  jurisdiction?: string
): Promise<ScreeningResult> {
  return screenEntity(companyName, 'Company', { address: jurisdiction });
}
```

**Self-Hosting** (Recommended for production):
```yaml
# docker-compose.sanctions.yml
services:
  yente:
    image: opensanctions/yente:latest
    ports:
      - "8000:8000"
    environment:
      YENTE_ELASTICSEARCH_URL: http://elasticsearch:9200
    depends_on:
      - elasticsearch

  elasticsearch:
    image: elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    volumes:
      - sanctions-data:/usr/share/elasticsearch/data

volumes:
  sanctions-data:
```

**Priority**: HIGH
**Effort**: 2 days

---

### 3. UK Company Verification - Companies House

**What it is**: Official UK government company registry
**Coverage**: All UK registered companies
**Cost**: FREE
**Reliability**: ★★★★★ (Official government source)

**How to Get Access**:
1. Go to https://developer.company-information.service.gov.uk/
2. Register for API key (instant)
3. Rate limit: 600 requests per 5 minutes

**Implementation**:
```typescript
// packages/integrations/src/companies-house.ts

const COMPANIES_HOUSE_API = 'https://api.company-information.service.gov.uk';

export interface CompanyProfile {
  companyNumber: string;
  companyName: string;
  companyStatus: 'active' | 'dissolved' | 'liquidation' | 'receivership';
  companyType: string;
  dateOfCreation: string;
  registeredOfficeAddress: {
    addressLine1: string;
    addressLine2?: string;
    locality: string;
    postalCode: string;
    country: string;
  };
  sicCodes: string[];
  hasCharges: boolean;
  hasInsolvencyHistory: boolean;
}

export async function getCompanyProfile(companyNumber: string): Promise<CompanyProfile> {
  const response = await fetch(
    `${COMPANIES_HOUSE_API}/company/${companyNumber}`,
    {
      headers: {
        'Authorization': `Basic ${Buffer.from(process.env.COMPANIES_HOUSE_API_KEY + ':').toString('base64')}`,
      },
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Company not found: ${companyNumber}`);
    }
    throw new Error(`Companies House API error: ${response.status}`);
  }

  const data = await response.json();

  return {
    companyNumber: data.company_number,
    companyName: data.company_name,
    companyStatus: data.company_status,
    companyType: data.type,
    dateOfCreation: data.date_of_creation,
    registeredOfficeAddress: {
      addressLine1: data.registered_office_address.address_line_1,
      addressLine2: data.registered_office_address.address_line_2,
      locality: data.registered_office_address.locality,
      postalCode: data.registered_office_address.postal_code,
      country: data.registered_office_address.country,
    },
    sicCodes: data.sic_codes || [],
    hasCharges: data.has_charges || false,
    hasInsolvencyHistory: data.has_insolvency_history || false,
  };
}

export async function getCompanyOfficers(companyNumber: string) {
  const response = await fetch(
    `${COMPANIES_HOUSE_API}/company/${companyNumber}/officers`,
    {
      headers: {
        'Authorization': `Basic ${Buffer.from(process.env.COMPANIES_HOUSE_API_KEY + ':').toString('base64')}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Companies House API error: ${response.status}`);
  }

  return response.json();
}

export async function searchCompanies(query: string) {
  const response = await fetch(
    `${COMPANIES_HOUSE_API}/search/companies?q=${encodeURIComponent(query)}`,
    {
      headers: {
        'Authorization': `Basic ${Buffer.from(process.env.COMPANIES_HOUSE_API_KEY + ':').toString('base64')}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Companies House API error: ${response.status}`);
  }

  return response.json();
}
```

**Priority**: HIGH
**Effort**: 1 day

---

### 4. EU Company Registries - Direct Access

For other EU countries, we access national registries directly (many are free or low-cost):

| Country | Registry | API | Cost |
|---------|----------|-----|------|
| DE | Handelsregister (via OpenRegister) | REST | FREE (limited) |
| FR | API Entreprise / data.gouv.fr | REST | FREE |
| NL | KVK Open Data | REST | FREE (basic) |
| BE | Crossroads Bank | REST | FREE |
| ES | BORME | Scraping | FREE |

**Implementation**:
```typescript
// packages/integrations/src/eu-registries.ts

// French Companies (data.gouv.fr - Sirene database)
export async function searchFrenchCompany(siren: string) {
  const response = await fetch(
    `https://entreprise.data.gouv.fr/api/sirene/v3/unites_legales/${siren}`
  );
  return response.json();
}

// German Companies (via OffeneRegister.de - community project)
export async function searchGermanCompany(query: string) {
  const response = await fetch(
    `https://db.offeneregister.de/openregister-ef8d2d9.json?sql=select+*+from+company+where+name+like+%27%25${encodeURIComponent(query)}%25%27+limit+10`
  );
  return response.json();
}

// Belgian Companies (Crossroads Bank)
export async function searchBelgianCompany(enterpriseNumber: string) {
  const response = await fetch(
    `https://opendata.economie.fgov.be/api/v2/enterprise/${enterpriseNumber}`
  );
  return response.json();
}
```

**Priority**: MEDIUM
**Effort**: 3-4 days (incremental per country)

---

### 5. Email - Resend

**Cost**: FREE (3,000 emails/month) → $20/month (50K emails)
**Why Resend**: Modern API, great DX, EU data residency option

**How to Get Access**:
1. Sign up at https://resend.com/
2. Add DNS records for domain verification
3. Get API key

**Implementation**:
```typescript
// packages/integrations/src/email.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail(options: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}) {
  return resend.emails.send({
    from: options.from || 'EuroComply <noreply@eurocomply.io>',
    to: options.to,
    subject: options.subject,
    html: options.html,
  });
}

// Pre-built templates
export async function sendKybVerificationEmail(to: string, merchantName: string, verificationUrl: string) {
  return sendEmail({
    to,
    subject: `KYB Verification Required - ${merchantName}`,
    html: `
      <h1>Know Your Business Verification</h1>
      <p>Please complete the verification process for ${merchantName}.</p>
      <a href="${verificationUrl}" style="background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
        Start Verification
      </a>
    `,
  });
}

export async function sendCredentialIssuedEmail(to: string, credentialType: string) {
  return sendEmail({
    to,
    subject: `Your ${credentialType} Credential is Ready`,
    html: `
      <h1>Credential Issued</h1>
      <p>Your ${credentialType} verifiable credential has been issued and is now active.</p>
      <p>You can view and share your credential from your EuroComply dashboard.</p>
    `,
  });
}
```

**Priority**: HIGH
**Effort**: 1 day

---

### 6. Payments - Stripe

**Cost**: 2.9% + €0.25 per transaction (standard EU pricing)
**Why Stripe**: Industry standard, EU entity, great DX

**How to Get Access**:
1. Sign up at https://dashboard.stripe.com/register
2. Complete business verification
3. Get API keys

**Implementation**:
```typescript
// packages/integrations/src/payments.ts
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

// Products and pricing
export const PRODUCTS = {
  PRODUCT_TRUST: {
    name: 'ProductTrust API',
    prices: {
      starter: 'price_xxx', // €99/month - 100 DPPs
      growth: 'price_xxx',  // €299/month - 1000 DPPs
      scale: 'price_xxx',   // €999/month - unlimited
    },
  },
  MERCHANT_TRUST: {
    name: 'MerchantTrust API',
    prices: {
      starter: 'price_xxx', // €149/month - 50 verifications
      growth: 'price_xxx',  // €499/month - 500 verifications
    },
  },
  WORKFORCE_TRUST: {
    name: 'WorkforceTrust API',
    prices: {
      starter: 'price_xxx', // €199/month - 100 employees
      growth: 'price_xxx',  // €599/month - 1000 employees
    },
  },
};

export async function createCustomer(organizationId: string, email: string, name: string) {
  return stripe.customers.create({
    email,
    name,
    metadata: { organizationId },
  });
}

export async function createSubscription(customerId: string, priceId: string) {
  return stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete',
    expand: ['latest_invoice.payment_intent'],
  });
}

export async function createCheckoutSession(
  customerId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string
) {
  return stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
}

export async function handleWebhook(payload: Buffer, signature: string) {
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!
  );
}
```

**Priority**: HIGH (for revenue)
**Effort**: 3 days

---

### 7. walt.id Community Stack

**Status**: Already integrated
**Cost**: FREE (self-hosted)

**Production Deployment**:
```yaml
# docker-compose.waltid.yml
services:
  waltid-core:
    image: waltid/core-api:latest
    ports:
      - "7000:7000"
    environment:
      - WALTID_DATA_ROOT=/data
    volumes:
      - waltid-data:/data

  waltid-signatory:
    image: waltid/signatory-api:latest
    ports:
      - "7001:7001"
    environment:
      - WALTID_CORE_API=http://waltid-core:7000

  waltid-custodian:
    image: waltid/custodian-api:latest
    ports:
      - "7002:7002"
    environment:
      - WALTID_CORE_API=http://waltid-core:7000

  waltid-auditor:
    image: waltid/auditor-api:latest
    ports:
      - "7003:7003"
    environment:
      - WALTID_CORE_API=http://waltid-core:7000

volumes:
  waltid-data:
```

**Priority**: HIGH (already done)
**Effort**: Deployment only (1 day)

---

### 8. File Storage - Cloudflare R2

**Cost**: FREE (10GB) → ~€15/month (100GB)
**Why R2**: S3-compatible, no egress fees, EU data centers

**Implementation**:
```typescript
// packages/integrations/src/storage.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function uploadFile(
  key: string,
  data: Buffer,
  contentType: string
): Promise<string> {
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: data,
    ContentType: contentType,
  }));

  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

export async function getSignedDownloadUrl(key: string, expiresIn = 3600) {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
  });

  return getSignedUrl(r2, command, { expiresIn });
}
```

**Priority**: MEDIUM
**Effort**: 1 day

---

### 9. Error Tracking - Sentry

**Cost**: FREE (5K errors/month)
**Why Sentry**: Industry standard, great integrations

**Implementation**:
```typescript
// apps/api/src/instrument.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});

export { Sentry };
```

**Priority**: HIGH
**Effort**: 2 hours

---

## Future Integrations (When Funded)

These can be added later as premium features or when funding allows:

| Integration | Provider | Purpose | Cost |
|-------------|----------|---------|------|
| Enhanced KYB | Veriff/Sumsub | ID document + liveness | ~€3/verify |
| Adverse Media | ComplyAdvantage | News screening | €10K+/year |
| More EU Registries | OpenCorporates | 140+ jurisdictions | €500/month |
| Address Validation | Google/Loqate | Verify addresses | ~€50/month |
| EBSI Integration | EU Commission | did:ebsi credentials | €10-50/DID |

---

## Environment Variables

```env
# VAT Validation (VIES - no key needed)

# Business Registries
COMPANIES_HOUSE_API_KEY=

# Sanctions (OpenSanctions)
OPENSANCTIONS_API=http://localhost:8000  # Self-hosted
# OPENSANCTIONS_API_KEY=                 # If using hosted API

# Email
RESEND_API_KEY=

# Payments
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PUBLISHABLE_KEY=

# Storage (Cloudflare R2)
R2_ENDPOINT=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=eurocomply
R2_PUBLIC_URL=

# walt.id
WALTID_CORE_API=http://localhost:7000
WALTID_SIGNATORY_API=http://localhost:7001
WALTID_CUSTODIAN_API=http://localhost:7002
WALTID_AUDITOR_API=http://localhost:7003

# Monitoring
SENTRY_DSN=
```

---

## Estimated Monthly Costs

| Service | Cost |
|---------|------|
| VIES | FREE |
| OpenSanctions | FREE (self-hosted) |
| Companies House | FREE |
| EU Registries | FREE |
| walt.id | FREE (self-hosted) |
| Resend | FREE → €20 |
| Cloudflare R2 | FREE → €15 |
| Sentry | FREE |
| Stripe | 2.9% + €0.25/tx |
| **Total Fixed** | **~€35/month** |

Infrastructure (hosting) adds ~€50-100/month for a small production setup.

---

## Implementation Roadmap

### Week 1: Core Free Integrations
- [ ] VIES VAT validation
- [ ] OpenSanctions screening (self-hosted)
- [ ] Companies House API
- [ ] Resend email
- [ ] Sentry error tracking

### Week 2: Infrastructure
- [ ] Deploy walt.id stack (production)
- [ ] Set up Cloudflare R2
- [ ] Production database (managed Postgres)

### Week 3: Monetization
- [ ] Stripe integration
- [ ] Subscription management
- [ ] Usage tracking/metering

### Week 4: Polish
- [ ] Add more EU registries
- [ ] Dashboard improvements
- [ ] Documentation

---

## Why This Approach Works

1. **Official Sources = Maximum Credibility**
   - VIES is THE source for EU VAT validation
   - Companies House is THE source for UK companies
   - No one can question the data quality

2. **Open Source = Auditable**
   - Customers can verify exactly where data comes from
   - No black-box compliance theater

3. **Low Cost = Sustainable**
   - ~€35/month in API costs vs €10K+/month for enterprise
   - Competitive pricing possible from day one

4. **Same Data, Better Price**
   - OpenSanctions uses the same EU/UN/US lists as ComplyAdvantage
   - Premium providers add UX and "adverse media" (nice to have, not required)

5. **Upgrade Path Exists**
   - Can add premium providers later as upsells
   - Customer choice: pay more for enhanced screening
