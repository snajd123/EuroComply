# DPP Portability & Data Ownership

## Overview

EuroComply is built on the principle that **organizations own their data**. Digital Product Passports and Verifiable Credentials belong to the organization (brand, manufacturer, distributor), not the platform. This document describes the portability architecture.

---

## SME-First Architecture

Our architecture is deliberately simple. We target SMEs (99% of EU businesses) who need compliance without complexity.

```
┌─────────────────────────────────────────────────────────────────┐
│                    SME ARCHITECTURE PRINCIPLES                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WHAT WE BUILD (SME-Critical)                                   │
│  ─────────────────────────────                                  │
│  • Compliance-First PIM (workspace-based data model)            │
│  • W3C Verifiable Credentials (standard format)                 │
│  • did:key identity (self-contained, portable)                  │
│  • did:ebsi support (planned - EU trust framework)              │
│  • GS1 Digital Link QR codes (interoperable)                    │
│  • JSON-LD data format (web standard)                           │
│  • REST API (simple, well-documented)                           │
│  • Shopify integration (where SMEs sell)                        │
│  • AI-powered import (any file format)                          │
│                                                                  │
│  WHAT WE SKIP (Enterprise-Only)                                 │
│  ─────────────────────────────                                  │
│  • Eclipse Dataspace Connector (B2B data spaces)                │
│  • Full AAS/AASX (industrial digital twins)                     │
│  • ODRL usage policies (complex access control)                 │
│  • Catena-X/Gaia-X integration (consortium protocols)           │
│  • SAP/Oracle ERP connectors                                    │
│                                                                  │
│  WHY: Enterprise has SAP, Siemens, Catena-X. SMEs have nothing. │
│       We fill the SME gap with simple, affordable tooling.      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Principles

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA OWNERSHIP PRINCIPLES                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. ORGANIZATIONS OWN THEIR DATA                                │
│     • DPPs and VCs belong to the organization                   │
│     • EuroComply is a tool, not a data custodian                │
│                                                                  │
│  2. SELF-CONTAINED VCs (KEY ARCHITECTURAL DECISION)             │
│     • All DPP data is EMBEDDED in the VC (not references)       │
│     • The VC IS the sovereign asset                             │
│     • No external data dependencies                             │
│                                                                  │
│  3. MINIMAL LOCK-IN (with caveats - see Portability Limitations)│
│     • Export all data at any time                               │
│     • Take VCs to any other platform                            │
│     • Continue signing with exported keys                       │
│     • One-click export includes VC + images + offline viewer    │
│     • ⚠️ Status List URLs in issued VCs create dependencies     │
│                                                                  │
│  4. SIGNATURE VERIFICATION WITHOUT EUROCOMPLY                   │
│     • did:key is self-contained (public key IS the identifier)  │
│     • Signature verification works offline, forever             │
│     • Revocation checking requires Status List access (online)  │
│     • See Portability Limitations section for full details      │
│                                                                  │
│  5. ESPR COMPLIANCE                                             │
│     • DPPs must be accessible for product lifetime              │
│     • Portability ensures this obligation can be met            │
│     • Organization controls where data lives                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

See [DATA_SOVEREIGNTY.md](./DATA_SOVEREIGNTY.md) for detailed architecture and rejected alternatives.

---

## Portability Limitations (Honest Assessment)

> ⚠️ **Important**: While we minimize lock-in, true zero-dependency portability is not achievable with revocation support. This section explains the tradeoffs.

### The did:key vs Status List 2021 Tension

> **Canonical Reference:** This is the authoritative explanation of did:key vs Status List 2021 portability tradeoffs.
> Other documents (VERIFIABLE_CREDENTIALS.md) reference this section.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PORTABILITY REALITY CHECK                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WHAT did:key PROVIDES (fully portable):                                    │
│  ✅ Signature verification - works offline, forever, no server needed       │
│  ✅ Issuer identity - public key embedded in the DID itself                 │
│  ✅ Tamper detection - cryptographic proof of data integrity                │
│  ✅ Key export - take your signing keys anywhere                            │
│                                                                              │
│  WHAT Status List 2021 REQUIRES (creates dependency):                       │
│  ❌ Network access to check revocation status                               │
│  ❌ Status list URL hardcoded in every issued VC                            │
│  ❌ URL cannot be changed without re-issuing the VC                         │
│                                                                              │
│  EXAMPLE - Every VC we issue contains:                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ "credentialStatus": {                                                │   │
│  │   "statusListCredential": "https://status.yourcompany.com/v1/..."   │   │
│  │ }                                                ▲                   │   │
│  │                                                  │                   │   │
│  │                   Customer's own domain (recommended) - portable!   │   │
│  │                   Or: api.eurocomply.eu (default) - requires exit   │   │
│  │                        planning if leaving                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  IMPLICATIONS FOR EXPORTED VCs:                                             │
│  • Signature verification: ✅ Works forever, offline                        │
│  • Revocation checking: ❌ Requires EuroComply URL to be accessible         │
│  • New revocations: ❌ Cannot revoke without access to status list server   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### What This Means in Practice

| Scenario | Signature Valid? | Revocation Checkable? | Can Issue New Revocations? |
|----------|------------------|----------------------|---------------------------|
| Active subscription | ✅ Yes | ✅ Yes | ✅ Yes |
| **Customer domain + self-host** | ✅ Yes | ✅ Yes | ✅ Yes |
| 10-year hosting (included) | ✅ Yes | ✅ Yes (frozen) | ❌ No |
| Self-hosted status list | ✅ Yes | ✅ Yes | ✅ Yes |
| Export without hosting | ✅ Yes | ❌ No (URL dead) | ❌ No |
| EuroComply shuts down | ✅ Yes | ❌ No (unless migrated) | ❌ No |

**Recommended:** Configure your own domain (e.g., `status.yourcompany.com`) from day 1. This gives you full portability—just point the CNAME elsewhere when leaving.

### Migration Options for Full Independence

**Option 1: Self-Host Status List (Recommended for technical users)**
```
1. Export status list credential from EuroComply
2. Deploy status list server on your infrastructure
3. Configure DNS/redirects so original URL resolves to your server
4. Full control over revocations
```

**Option 2: 10-Year Hosting (Included in DPP price)**
```
1. Cancel subscription - 10-year hosting is automatic
2. Status list remains accessible at original URL
3. No new revocations possible (frozen state)
4. Existing revocations preserved
```

**Option 3: Accept Revocation Loss**
```
1. Export all VCs and keys
2. Host VCs anywhere
3. Signature verification still works
4. Revocation status unknown (verifiers see "status unavailable")
```

See [Status List Migration Guide](#status-list-migration-guide) below for detailed instructions.

---

## Portable Status List (Customer-Owned Domain)

> **Architecture Decision:** Customers can configure their own domain for status list URLs from day 1, eliminating URL lock-in entirely.

### The Problem with Platform-Owned URLs

When status list URLs use our domain (`api.eurocomply.eu`), customers who want full control after leaving have options:
- **Option A:** Use included 10-year hosting (frozen status list)
- **Option B:** Self-host status list with DNS redirects
- **Option C:** Export and accept signature-only verification

To eliminate this dependency entirely, customers can configure their own domain from day 1.

### The Solution: Customer Domain from Day 1

Customers configure their own subdomain during onboarding:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PORTABLE STATUS LIST ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SETUP (During Onboarding)                                                  │
│  ─────────────────────────                                                  │
│  Customer chooses: status.acme-corp.com                                     │
│  Customer adds CNAME: status.acme-corp.com → status.eurocomply.eu           │
│  We verify domain ownership (DNS TXT record)                                │
│                                                                              │
│  ISSUANCE (Every VC)                                                        │
│  ────────────────────                                                       │
│  Status List URL: https://status.acme-corp.com/v1/status/org_abc123         │
│                   ▲ Customer's domain, not ours                             │
│                                                                              │
│  DURING SUBSCRIPTION                                                        │
│  ───────────────────                                                        │
│  Customer's CNAME → EuroComply servers                                      │
│  We handle revocations, updates, SSL, etc.                                  │
│                                                                              │
│  AFTER LEAVING                                                              │
│  ─────────────                                                              │
│  Customer points CNAME → their own server OR new provider                   │
│  No URL changes needed. No reprinting. Full independence.                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### How It Works

**1. Domain Configuration**
```typescript
// During organization onboarding
interface StatusListConfig {
  // Customer provides their subdomain
  customDomain?: string;  // e.g., "status.acme-corp.com"

  // Or use our default (creates lock-in)
  useEuroComplyDomain?: boolean;  // Default: false
}
```

**2. DNS Verification**
```
Customer adds these DNS records:
  CNAME  status.acme-corp.com     → status.eurocomply.eu
  TXT    _eurocomply-verify       → org_abc123_verification_token
```

**3. VC Issuance with Customer Domain**
```json
{
  "@context": [...],
  "issuer": "did:key:z6MkOrg...",
  "credentialSubject": {...},
  "credentialStatus": {
    "type": "StatusList2021Entry",
    "statusPurpose": "revocation",
    "statusListIndex": "42",
    "statusListCredential": "https://status.acme-corp.com/v1/status/org_abc123"
  }
}
```

**4. Migration Path**

| Phase | Customer Action | Status List URL |
|-------|----------------|-----------------|
| Active | CNAME → EuroComply | `https://status.acme-corp.com/...` ✅ |
| Leaving | Export status list | Same URL |
| Migrated | CNAME → own server | `https://status.acme-corp.com/...` ✅ |

### Comparison: With vs Without Customer Domain

| Scenario | EuroComply Domain | Customer Domain |
|----------|-------------------|-----------------|
| **URL in VCs** | `api.eurocomply.eu/...` | `status.customer.com/...` |
| **Migration complexity** | Low (10-year hosting included) | None (point CNAME elsewhere) |
| **Reprinting required** | No | No |
| **Full independence** | After 10 years | Yes |
| **Cost to leave** | Free (10-year hosting included) | Free |

### Default Recommendation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  RECOMMENDED: Configure your own domain from day 1                          │
│                                                                              │
│  Even if you never plan to leave EuroComply, using your own domain:         │
│  • Looks more professional (status.yourbrand.com vs eurocomply.eu)          │
│  • Gives you insurance against any future changes                           │
│  • Takes 5 minutes to set up during onboarding                              │
│  • Costs nothing extra                                                      │
│                                                                              │
│  Setup: Add a CNAME record pointing to status.eurocomply.eu                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Fallback: EuroComply Domain

For customers who don't want to manage DNS:
- Default to `api.eurocomply.eu/v1/status/{org_id}`
- 10-year hosting included as exit path
- Can configure custom domain later (but existing VCs won't change)

---

## Long-Term Financial Reality

> ⚠️ **Honest Assessment**: While we minimize technical lock-in, ESPR compliance creates an ongoing infrastructure dependency that has real costs. This section provides transparent cost projections.

### 10-Year Compliance Cost Analysis

ESPR requires DPP availability for product lifetime (typically 10+ years). Here's what that means financially:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    10-YEAR COST SCENARIOS                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SCENARIO A: Active Subscription (Full Platform)                            │
│  ───────────────────────────────────────────────                            │
│  Year 1-10: €149-1,999/month depending on tier                              │
│  10-Year Total: €17,880 - €239,880                                          │
│  (10-year DPP hosting included in price)                                    │
│                                                                              │
│  SCENARIO B: Active → Cancel (10-Year Hosting)                              │
│  ───────────────────────────────────────────────                            │
│  Year 1-3: Active subscription (€149-1,999/month)                           │
│  Year 4-10: 10-year hosting (included, no additional cost)                  │
│                                                                              │
│  Example (Scale tier → Cancel):                                             │
│  Years 1-3: €749 × 36 months = €26,964                                      │
│  Years 4-10: €0 (10-year hosting included in DPP price)                     │
│  10-Year Total: €26,964                                                     │
│                                                                              │
│  SCENARIO C: Self-Host After Export                                         │
│  ───────────────────────────────────────────────                            │
│  Year 1-3: Active subscription                                              │
│  Year 4-10: Self-hosting costs (if you want revocation control)             │
│                                                                              │
│  Minimum self-hosting costs:                                                │
│  • Domain: ~€15/year                                                        │
│  • SSL certificate: Free (Let's Encrypt) or ~€100/year (commercial)         │
│  • Static hosting: €0-50/month (S3, GitHub Pages, Cloudflare Pages)         │
│  • Status list server: €0-100/month (if hosting dynamic revocations)        │
│                                                                              │
│  10-Year Self-Host Estimate: €14,364 (3yr active) + €1,000-5,000 hosting    │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  10-YEAR HOSTING (INCLUDED IN DPP PRICE):                                   │
│  No additional cost - URL preservation included with every DPP              │
│                                                                              │
│  This ensures ESPR compliance without ongoing fees:                         │
│  • Products with printed QR codes remain accessible                         │
│  • No technical expertise required                                          │
│  • Automatic - no action needed at cancellation                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### What "Data Ownership" Actually Means

We say "you own your data" - here's exactly what that means and doesn't mean:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DATA OWNERSHIP REALITY                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WHAT YOU FULLY OWN (no ongoing dependency):                                │
│  ✅ Verifiable Credential files (JSON)                                      │
│  ✅ Private signing keys (exportable JWK)                                   │
│  ✅ Product data (JSON export)                                              │
│  ✅ did:key identity (self-contained, no server needed)                     │
│  ✅ Signature verification capability (works forever, offline)              │
│                                                                              │
│  WHAT HAS ONGOING DEPENDENCY:                                               │
│  ⚠️  Status List URLs - hardcoded in every VC, requires hosting            │
│  ⚠️  QR Code URLs - printed on products, requires hosting                  │
│  ⚠️  Revocation capability - requires status list server access            │
│                                                                              │
│  THE UNCOMFORTABLE TRUTH:                                                   │
│  You own the DATA, but ESPR requires the data to be ACCESSIBLE.            │
│  Accessibility requires infrastructure. Infrastructure has costs.           │
│  "Zero lock-in" applies to the data itself, not the hosting obligation.    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## EuroComply Business Continuity

### What Happens If EuroComply Shuts Down?

This is a legitimate concern. Here's our honest assessment and mitigation plan:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EUROCOMPLY SHUTDOWN SCENARIOS                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SCENARIO: Orderly Wind-Down (Planned Exit)                                 │
│  ───────────────────────────────────────────                                │
│  Timeline: 12+ months notice                                                │
│                                                                              │
│  What we commit to:                                                         │
│  1. 12 months advance notice to all customers                               │
│  2. Data export assistance (bulk export tools)                              │
│  3. Status list migration support                                           │
│  4. Option to transfer 10-year hosting to successor entity                  │
│  5. Open-source core resolver code for self-hosting                         │
│                                                                              │
│  Customer impact:                                                           │
│  • Signature verification: ✅ Unaffected (did:key is self-contained)       │
│  • Revocation checking: ⚠️  Requires migration to self-hosted or successor │
│  • QR codes: ⚠️  Requires redirect setup or reprinting                     │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  SCENARIO: Sudden Shutdown (Bankruptcy, Force Majeure)                      │
│  ─────────────────────────────────────────────────────                      │
│  Timeline: Little or no notice                                              │
│                                                                              │
│  Mitigations in place:                                                      │
│  1. Customer data encrypted with per-tenant keys (exportable)               │
│  2. Status list credentials are W3C standard (portable)                     │
│  3. did:key works without any server                                        │
│  4. Legal: Data belongs to customers, not EuroComply creditors              │
│                                                                              │
│  Customer impact (worst case):                                              │
│  • Signature verification: ✅ Still works (did:key)                        │
│  • Revocation checking: ❌ Fails until customer self-hosts                 │
│  • QR codes: ❌ 404/503 errors until redirect or reprint                   │
│  • ESPR compliance: ⚠️  At risk until customer takes action                │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  WHAT CUSTOMERS SHOULD DO (Risk Mitigation):                                │
│  ─────────────────────────────────────────────                              │
│                                                                              │
│  LOW EFFORT:                                                                │
│  • Export data quarterly (automated via API)                                │
│  • Keep private keys in secure backup                                       │
│  • Document your status list URL for emergency hosting                      │
│                                                                              │
│  MEDIUM EFFORT:                                                             │
│  • Use GS1 Digital Link (redirect control)                                  │
│  • Use your own domain with redirects                                       │
│                                                                              │
│  HIGH EFFORT (Maximum Independence):                                        │
│  • Self-host status list server                                             │
│  • Self-host DPP viewer                                                     │
│  • Own domain for all QR codes                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Our Commitments

To address business continuity concerns, EuroComply commits to:

1. **Data Escrow**: Quarterly encrypted backups to independent escrow service
2. **Open Standards**: All data formats are W3C/GS1 standards (no proprietary formats)
3. **Export Always Available**: Full data export at no additional cost
4. **Successor Planning**: Legal framework for 10-year hosting transfer
5. **Source Code Escrow**: Core resolver code in escrow for customer access if needed

### Regulatory Risk Acknowledgment

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ESPR NON-COMPLIANCE RISK                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  IF EUROCOMPLY BECOMES UNAVAILABLE AND CUSTOMER TAKES NO ACTION:            │
│                                                                              │
│  Immediate Effects:                                                         │
│  • QR codes return errors                                                   │
│  • Consumers cannot access DPP data                                         │
│  • Market Surveillance Authorities may investigate                          │
│                                                                              │
│  ESPR Consequences (Articles 9, 10, 68):                                    │
│  • Warning letters from MSAs                                                │
│  • Fines (Member State dependent, potentially significant)                  │
│  • Product withdrawal orders                                                │
│  • Prohibition of making products available                                 │
│                                                                              │
│  WHO IS LIABLE:                                                             │
│  The Economic Operator (brand/manufacturer), NOT EuroComply.                │
│  We are a service provider - compliance responsibility stays with you.     │
│                                                                              │
│  MITIGATION: Maintain export backups and have a hosting contingency plan.  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## What's Exportable

### Complete Export Package

When an organization exports their data, they receive everything needed to operate independently:

```
export/
├── credentials/
│   ├── prod_001.vc.json      # Signed Verifiable Credential
│   ├── prod_002.vc.json
│   ├── prod_003.vc.json
│   └── ...
├── identity/
│   ├── did-document.json     # DID Document
│   └── private-key.jwk       # Private key (optional)
├── products/
│   ├── prod_001.json         # Full product data
│   ├── prod_002.json
│   └── ...
├── qr-codes/
│   ├── prod_001.svg          # QR code for each product
│   ├── prod_002.svg
│   └── ...
└── manifest.json             # Index and metadata
```

### Manifest File

```json
{
  "exportedAt": "2026-01-08T10:00:00Z",
  "eurocomplyVersion": "1.0.0",
  "organization": {
    "id": "org_abc123",
    "name": "ABC Textiles GmbH",
    "did": "did:key:z6MkhaXgBZDvvvRhta..."
  },
  "statistics": {
    "totalProducts": 45,
    "totalCredentials": 45,
    "includesPrivateKey": true
  },
  "products": [
    {
      "id": "prod_001",
      "gtin": "5901234567890",
      "name": "Organic Cotton T-Shirt",
      "credentialFile": "credentials/prod_001.vc.json",
      "productFile": "products/prod_001.json",
      "qrCodeFile": "qr-codes/prod_001.svg"
    }
  ]
}
```

---

## Export Scenarios

### Scenario 1: Subscription Cancellation

**ESPR Compliance:** DPPs must remain accessible for 10+ years after issuance. At cancellation, organizations must choose one of four options for their published DPPs:

```
┌─────────────────────────────────────────────────────────────────┐
│                    CANCELLATION OPTIONS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  OPTION A: 10-YEAR HOSTING (INCLUDED - Recommended)             │
│  ─────────────────────────────────────────────────────────────  │
│  Automatic 10-year hosting included with every DPP:             │
│                                                                  │
│  • No additional cost - included in per-DPP pricing             │
│  • Published DPPs remain accessible via original URLs           │
│  • QR codes continue working (no reprinting needed)             │
│  • No dashboard access, no new DPP issuance                     │
│  • 10-year retention guaranteed (ESPR requirement)              │
│  • Includes: SSL, domain, security patches, resolver updates    │
│                                                                  │
│  ✅  This is automatic at cancellation. No action required.     │
│                                                                  │
│  OPTION B: GS1 RESOLVER REDIRECT                                │
│  ─────────────────────────────────────────────────────────────  │
│  • Export all data (VCs, keys, images)                          │
│  • Host on your own infrastructure or CDN                       │
│  • Configure GS1 resolver to redirect to your new URLs          │
│  • Requires: GS1 membership, technical setup                    │
│  • Original QR codes work via GS1 redirect                      │
│                                                                  │
│  OPTION C: SELF-MANAGED REDIRECT                                │
│  ─────────────────────────────────────────────────────────────  │
│  • Export all data (VCs, keys, images)                          │
│  • Host on your own domain                                      │
│  • Set up 301 redirects from eurocomply.eu URLs                 │
│  • Requires: Own domain, hosting, technical setup               │
│  • Best for organizations with IT resources                     │
│                                                                  │
│  OPTION D: CANCELLATION WAIVER (Not Recommended)                │
│  ─────────────────────────────────────────────────────────────  │
│  • Full data export provided                                    │
│  • DPPs become inaccessible after grace period                  │
│  • Customer signs legal waiver acknowledging:                   │
│    - Potential ESPR non-compliance (Art. 9 & 10)                │
│    - Risk of market withdrawal and fines                        │
│    - EuroComply released from all DPP availability liability    │
│  • Only for products no longer in EU market                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    CANCELLATION TIMELINE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Day 0: Organization initiates cancellation                     │
│         → MUST SELECT one of the four options above             │
│         → System generates export package                       │
│         → Download link provided                                 │
│                                                                  │
│  Day 1-30: Grace period                                         │
│         → DPPs remain accessible                                │
│         → Organization can download export anytime              │
│         → Reminder emails sent                                  │
│                                                                  │
│  Day 30: Subscription ends                                      │
│         → If Option A: Transition to 10-year hosting            │
│         → If Option B/C: Final redirect configured              │
│         → If Option D: Waiver signed, DPPs taken offline        │
│         → Dashboard access removed                              │
│                                                                  │
│  After Day 30:                                                  │
│         → Option A: DPPs served from 10-year hosting            │
│         → Option B: GS1 resolver redirects to new host          │
│         → Option C: EuroComply 301 redirects to customer domain │
│         → Option D: DPPs return 410 Gone (waiver on file)       │
│         → All (A-C): did:key verification still works offline   │
│                                                                  │
│  ⚠️  NO OPTION = BLOCKED                                        │
│      System blocks cancellation until option selected           │
│      Organization must acknowledge compliance responsibility     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Why This Matters:**

| Scenario | Without Options | With Options |
|----------|-----------------|--------------|
| Customer cancels, no action | QR codes break → ESPR violation | Blocked until option selected |
| Products in market after cancel | Consumers scan dead links | DPPs remain accessible |
| Business failure | Data lost | 10-year hosting preserves compliance |
| Migration to competitor | Break existing QR codes | Redirect maintains continuity |

### Legal Responsibility Clarification

```
┌─────────────────────────────────────────────────────────────────┐
│                    WHO IS RESPONSIBLE?                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ESPR REGULATION (EU) 2024/1781                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  Article 9 & 10: The "Economic Operator" (manufacturer,         │
│  importer, or authorized representative placing the product     │
│  on the EU market) bears legal responsibility for DPP           │
│  availability, accuracy, and completeness.                      │
│                                                                  │
│  Article 2(32): EuroComply is a "DPP Service Provider" -        │
│  an independent third party authorized by the economic          │
│  operator. Our liability is contractual (to the customer),      │
│  not regulatory (to Market Surveillance Authorities).           │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  IN PRACTICE:                                                   │
│  • Customer faces enforcement action if DPPs are inaccessible   │
│  • EuroComply faces breach of contract claims only if we fail   │
│    to perform services as agreed                                │
│  • Our role: Enable compliance, not guarantee it                │
│                                                                  │
│  TERMS OF SERVICE SHOULD STATE:                                 │
│  "Customer retains sole responsibility for ensuring continued   │
│  availability of DPP data as required by ESPR. EuroComply is    │
│  a data processor and infrastructure provider only."            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Scenario 2: Migration to Self-Hosting

```
┌─────────────────────────────────────────────────────────────────┐
│                    SELF-HOSTING MIGRATION                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Export from EuroComply                                      │
│     POST /api/v1/organization/export                            │
│     { "includePrivateKey": true }                               │
│                                                                  │
│  2. Set up hosting (any static host)                            │
│     • Upload VCs to your server                                 │
│     • Serve at: yourcompany.com/dpp/{product-id}                │
│                                                                  │
│  3. Update QR codes (if needed)                                 │
│     • Generate new QR codes pointing to new URLs                │
│     • Or use GS1 resolver to redirect                           │
│                                                                  │
│  4. Continue issuing new VCs                                    │
│     • Use exported private key                                  │
│     • Sign with same did:key                                    │
│     • Full continuity of identity                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Scenario 3: Migration to Another Provider

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROVIDER MIGRATION                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Export from EuroComply                                      │
│     → Get all VCs and private key                               │
│                                                                  │
│  2. Import to new provider                                      │
│     → Import VCs (W3C standard format)                          │
│     → Import private key for continued signing                  │
│                                                                  │
│  3. VCs remain valid                                            │
│     → Same did:key = same identity                              │
│     → Existing VCs still verify                                 │
│     → No "re-issuance" needed                                   │
│                                                                  │
│  Prerequisites for new provider:                                │
│  • Support W3C Verifiable Credentials                           │
│  • Support did:key method                                       │
│  • Allow key import                                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## The did:key Advantage

### Why did:key Enables True Portability

```
┌─────────────────────────────────────────────────────────────────┐
│                    did:key vs did:web                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  did:web:eurocomply.eu:org:acme-corp                            │
│  ─────────────────────────────────────                          │
│  • Requires EuroComply to host DID document                     │
│  • If EuroComply stops hosting → verification breaks            │
│  • Tied to platform domain                                      │
│  • NOT portable                                                 │
│                                                                  │
│  did:key:z6MkhaXgBZDvvvRhta4LjXRJzLKNqVj3yQTpCFbRc8GwAdfS      │
│  ────────────────────────────────────────────────────────       │
│  • Self-contained (public key IS the identifier)                │
│  • No hosting required                                          │
│  • Verification works with just the DID string                  │
│  • Works forever, anywhere                                      │
│  • FULLY portable                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Verification Without EuroComply

```
┌─────────────────────────────────────────────────────────────────┐
│                    SIGNATURE VERIFICATION                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Given a VC file:                                               │
│  {                                                               │
│    "issuer": "did:key:z6MkhaXgBZDvvvRhta...",                   │
│    "credentialSubject": { ... DPP data ... },                   │
│    "proof": { "jws": "..." }                                    │
│  }                                                               │
│                                                                  │
│  To verify SIGNATURE (no network needed):                       │
│  1. Parse did:key → Extract public key                          │
│  2. Parse proof.jws → Extract signature                         │
│  3. Verify signature using public key                           │
│  4. Done! Proves data hasn't been tampered.                     │
│                                                                  │
│  Signature verification works:                                  │
│  ✓ Without network                                              │
│  ✓ Without contacting EuroComply                                │
│  ✓ Without contacting the supplier                              │
│  ✓ 10 years from now                                            │
│  ✓ After EuroComply shuts down                                  │
│                                                                  │
│  ⚠️  Revocation status requires network access to status list   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Hosting Options After Export

### Option 0: 10-Year Hosting (Included - Stay with EuroComply)

If you cancel your active subscription but want QR codes to keep working without managing your own hosting:

```
10-Year Hosting (Included in DPP price):
  • No additional cost - included with every DPP
  • Automatic at cancellation

Includes:
  • Static DPP pages remain accessible
  • QR codes continue working
  • SSL certificate renewals
  • Security patches and resolver updates
  • No editing, no new DPPs, no imports
  • 10-year retention (ESPR compliant)
```

This is automatic at cancellation - no action required. You can also export and self-host if you want full control over revocations.

**Why included in price?** DPP pricing factors in 10-year hosting costs (SSL renewals, domain management, security patches). This ensures ESPR compliance without surprise fees at cancellation.

### Option 1: Static File Hosting

Simplest option - just serve the JSON files.

```
Your Server:
  /dpp/
    ├── prod_001.json  → Returns VC JSON
    ├── prod_002.json
    └── ...

QR Code points to:
  https://yourcompany.com/dpp/prod_001.json
```

Requirements:
- Any web server (nginx, Apache, S3, GitHub Pages)
- HTTPS recommended
- CORS headers for browser access

### Option 2: Decentralized Storage (IPFS/Arweave)

Permanent, censorship-resistant storage.

```
Upload to IPFS:
  ipfs add prod_001.vc.json
  → QmXyz...abc (content hash)

QR Code points to:
  https://ipfs.io/ipfs/QmXyz...abc
  or
  ipfs://QmXyz...abc

Arweave (permanent, one-time fee):
  arweave deploy prod_001.vc.json
  → ar://abc123...

Cost:
  IPFS: Free (but need pinning service)
  Arweave: ~$0.005 per KB (permanent)
```

### Option 3: Retailer Hosting

Organization provides VCs directly to retailers.

```
┌─────────────────────────────────────────────────────────────────┐
│                    RETAILER-HOSTED VCs                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Organization exports VCs                                       │
│       │                                                          │
│       └──► Sends to retailers who use those products            │
│                │                                                 │
│                ▼                                                 │
│       Retailer hosts on their infrastructure                    │
│                │                                                 │
│                ▼                                                 │
│       QR code on product → retailer's hosted VC                 │
│                                                                  │
│  Benefits:                                                      │
│  • No ongoing cost for supplier                                 │
│  • Retailer has full control                                    │
│  • VC still verifies (did:key is self-contained)                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Continuing to Issue VCs After Export

Organizations can continue signing new VCs using their exported private key.

### Using walt.id CLI

```bash
# Import private key
walt key import --key private-key.jwk --alias my-key

# Issue new VC
walt vc issue \
  --issuer did:key:z6MkhaXgBZDvvvRhta... \
  --key my-key \
  --subject-data new-product.json \
  --type DigitalProductPassport
```

### Using Code (TypeScript)

```typescript
import { signCredential } from '@walt-id/core';
import * as fs from 'fs';

// Load exported private key
const privateKey = JSON.parse(fs.readFileSync('private-key.jwk', 'utf8'));

// Create new credential
const credential = {
  "@context": ["https://www.w3.org/2018/credentials/v1"],
  "type": ["VerifiableCredential", "DigitalProductPassport"],
  "issuer": "did:key:z6MkhaXgBZDvvvRhta...",
  "issuanceDate": new Date().toISOString(),
  "credentialSubject": {
    "id": "urn:gtin:5901234567891",
    "name": "New Product",
    // ... DPP data
  }
};

// Sign it
const signedVc = await signCredential(credential, privateKey);

// Save or publish
fs.writeFileSync('new-product.vc.json', JSON.stringify(signedVc, null, 2));
```

---

## Status List Migration Guide

When leaving EuroComply, you need a plan for the status list URLs embedded in your issued VCs. Here are detailed instructions for each option.

### Option A: Self-Hosted Status List Server

**Requirements:**
- Web server capable of serving JSON (nginx, Apache, S3, Cloudflare Workers, etc.)
- SSL certificate for HTTPS
- Ability to configure redirects or serve at the exact EuroComply URL path

**Step 1: Export Status List**

```bash
# Export your organization's status list credential
curl -X POST https://api.eurocomply.eu/v1/organization/export/status-list \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"confirmExport": true}' \
  -o status-list-export.json
```

**Response includes:**
```json
{
  "statusListCredential": {
    "@context": ["https://www.w3.org/2018/credentials/v1", "https://w3id.org/vc/status-list/2021/v1"],
    "type": ["VerifiableCredential", "StatusList2021Credential"],
    "issuer": "did:key:z6MkOrg...",
    "credentialSubject": {
      "id": "https://api.eurocomply.eu/v1/status/org_abc123",
      "type": "StatusList2021",
      "statusPurpose": "revocation",
      "encodedList": "H4sIAAAAAAAA/2NgGAWjYBSMglEwCkYBEwMAAAD//wMA..."
    },
    "proof": { ... }
  },
  "metadata": {
    "totalCredentialsIssued": 1250,
    "revokedCount": 3,
    "lastUpdated": "2026-01-12T10:00:00Z",
    "originalUrl": "https://api.eurocomply.eu/v1/status/org_abc123"
  },
  "selfHostingInstructions": {
    "requiredUrl": "https://api.eurocomply.eu/v1/status/org_abc123",
    "contentType": "application/json",
    "cacheControl": "public, max-age=300"
  }
}
```

**Step 2: Deploy Status List Server**

Option A - Static hosting (no new revocations):
```bash
# Upload to any static host that can serve at the required URL
# You'll need EuroComply to configure a redirect, OR use Cloudflare Workers

# Example: Cloudflare Worker
export default {
  async fetch(request) {
    const statusList = { /* your exported status list credential */ };
    return new Response(JSON.stringify(statusList), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};
```

Option B - Dynamic server (supports new revocations):
```typescript
// Minimal status list server (Node.js/Express)
import express from 'express';
import { updateStatusList, signStatusList } from './status-list-utils';

const app = express();
let statusListCredential = /* load from export */;

// Serve status list
app.get('/v1/status/:orgId', (req, res) => {
  res.json(statusListCredential);
});

// Revoke a credential (protected endpoint)
app.post('/v1/status/:orgId/revoke', authenticate, async (req, res) => {
  const { statusListIndex, reason } = req.body;
  statusListCredential = await updateStatusList(statusListCredential, statusListIndex);
  statusListCredential = await signStatusList(statusListCredential, privateKey);
  res.json({ success: true });
});
```

**Step 3: Configure URL Resolution**

Your issued VCs contain `https://api.eurocomply.eu/v1/status/org_abc123`. You have three options:

1. **EuroComply Redirect** (10-year hosting customers):
   - We configure 301 redirect to your server
   - Original URL → Your server

2. **GS1 Resolver** (if using GS1 Digital Link):
   - Update GS1 resolver to point to your status list
   - Only works if status list URL uses GS1 format

3. **Domain Takeover** (not recommended):
   - Would require EuroComply to transfer subdomain control
   - Complex and rarely practical

### Option B: 10-Year Hosting (Frozen Status List - Included)

If you don't want to self-host, 10-year hosting preserves your status list automatically:

```
┌─────────────────────────────────────────────────────────────────┐
│  10-YEAR HOSTING - STATUS LIST HANDLING (INCLUDED)              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  What happens:                                                  │
│  1. Your status list is frozen at cancellation time             │
│  2. All existing revocations are preserved                      │
│  3. URL remains accessible: api.eurocomply.eu/v1/status/...     │
│  4. Verifiers can check revocation status normally              │
│                                                                  │
│  Limitations:                                                   │
│  • Cannot issue NEW revocations                                 │
│  • Cannot un-revoke credentials                                 │
│  • If you need to revoke a product (e.g., recall), you cannot   │
│                                                                  │
│  Cost: Included in DPP pricing (no additional fee)              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Option C: No Revocation Support

If revocation checking isn't critical for your use case:

```
┌─────────────────────────────────────────────────────────────────┐
│  SIGNATURE-ONLY VERIFICATION (No Revocation)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  What works:                                                    │
│  ✅ Cryptographic signature verification                        │
│  ✅ Data integrity (tamper detection)                           │
│  ✅ Issuer identity (did:key)                                   │
│  ✅ All DPP data is readable                                    │
│                                                                  │
│  What doesn't work:                                             │
│  ❌ Revocation status check (returns "status unavailable")      │
│  ❌ Verifier cannot confirm credential hasn't been revoked      │
│                                                                  │
│  When this is acceptable:                                       │
│  • Products no longer in active market                          │
│  • Archival purposes                                            │
│  • Internal documentation                                       │
│  • When signature proof is sufficient                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## QR Code Migration Guide

QR codes printed on physical products contain URLs. Planning for URL migration is critical.

### The QR Code Problem

```
┌─────────────────────────────────────────────────────────────────┐
│  QR CODE URL LOCK-IN                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PRINTED ON PRODUCT:                                            │
│  ┌─────────────┐                                                │
│  │ ▄▄▄▄▄ ▄▄▄▄ │  Contains: https://eurocomply.eu/dpp/prod_123  │
│  │ █   █ █  █ │                    ▲                            │
│  │ ▀▀▀▀▀ ▀▀▀▀ │                    │                            │
│  └─────────────┘      This URL is PERMANENT once printed        │
│                                                                  │
│  PROBLEM: If eurocomply.eu/dpp/prod_123 stops working,         │
│           every printed QR code becomes a dead link             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Migration Strategies

**Strategy 1: GS1 Digital Link (Best for long-term flexibility)**

```
QR code contains GS1 resolver URL (not EuroComply URL):
  https://id.gs1.org/01/05901234567890

GS1 resolver redirects to current host:
  → eurocomply.eu/dpp/... (while subscribed)
  → yourcompany.com/dpp/... (after migration)
  → newprovider.com/dpp/... (if you switch providers)

Requirements:
  • GS1 membership
  • GTIN for your products
  • Configure resolver via GS1 Cloud portal

Cost: GS1 membership varies by country (~€150-500/year for SMEs)
```

**Strategy 2: Own Domain with Redirects**

```
QR code contains YOUR domain (not EuroComply):
  https://products.yourcompany.com/dpp/prod_123

Your server redirects to current host:
  → 302 redirect to eurocomply.eu/dpp/prod_123 (while subscribed)
  → Serve directly from your server (after export)
  → 302 redirect to newprovider.com/dpp/... (if you switch)

Requirements:
  • Own domain with SSL
  • Web server or CDN (Cloudflare, etc.)
  • Maintain redirects

Recommended for: Organizations with IT capability
```

**Strategy 3: EuroComply URLs with 10-Year Hosting (Included)**

```
QR code contains EuroComply URL:
  https://eurocomply.eu/dpp/prod_123

When you cancel:
  → URLs continue working for 10 years (read-only)
  → No additional cost (included in DPP price)
  → Automatic - no action required

Recommended for: Organizations without IT resources
```

**Strategy 4: Accept QR Code Breakage (Limited Use Cases)**

```
When QR code breakage is acceptable:
  • Products with short shelf life (< 1 year)
  • Products being discontinued
  • Internal/B2B products where you control all scanners
  • Test/prototype products

Not acceptable for:
  • Consumer products with 10+ year lifespan
  • Products already in market
  • Anything requiring ESPR compliance
```

### QR Code Best Practices

```
┌─────────────────────────────────────────────────────────────────┐
│  RECOMMENDATIONS FOR NEW PRODUCTS                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TIER 1 (Maximum flexibility):                                  │
│  Use GS1 Digital Link: https://id.gs1.org/01/{gtin}             │
│  • Redirect anywhere, anytime                                   │
│  • Industry standard                                            │
│  • Future-proof                                                 │
│                                                                  │
│  TIER 2 (Good flexibility):                                     │
│  Use own domain: https://products.yourcompany.com/dpp/{id}      │
│  • You control redirects                                        │
│  • Requires maintaining DNS/server                              │
│                                                                  │
│  TIER 3 (Vendor-dependent):                                     │
│  Use vendor URL: https://eurocomply.eu/dpp/{id}                 │
│  • Simplest setup                                               │
│  • 10-year hosting included, or migrate if you prefer           │
│                                                                  │
│  ⚠️  NEVER print QR codes without a URL migration plan          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## QR Code Considerations

### The QR Code Problem

QR codes printed on physical products contain URLs. If the URL changes, old QR codes break.

### Solutions

**Option 1: GS1 Digital Link Resolver**

```
QR code contains:
  https://id.gs1.org/01/05901234567890

GS1 resolver redirects to:
  → eurocomply.eu/dpp/... (while subscribed)
  → yourcompany.com/dpp/... (after migration)

Supplier updates resolver, QR codes don't change.
```

**Option 2: Own Domain with Redirects**

```
QR code contains:
  https://yourcompany.com/dpp/prod_001

Initially redirects to:
  → eurocomply.eu/dpp/prod_001

After migration, change redirect to:
  → new-provider.com/dpp/prod_001

Or serve directly from yourcompany.com
```

**Option 3: Reprint QR Codes**

For new products, print QR codes with new URLs. Old products in circulation will have broken QR codes (acceptable for some use cases).

---

## ESPR Compliance & 10-Year Requirement

ESPR requires DPP data to remain accessible for the product's lifetime.

### How Portability Helps

```
┌─────────────────────────────────────────────────────────────────┐
│                    10-YEAR AVAILABILITY                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Scenario: Organization uses EuroComply for 3 years, cancels    │
│                                                                  │
│  Year 0-3: DPPs hosted on EuroComply                            │
│            • Full platform features                              │
│            • Managed hosting                                     │
│                                                                  │
│  Year 3: Organization cancels                                   │
│          • Exports all VCs and keys                             │
│          • Chooses new hosting solution                         │
│                                                                  │
│  Year 3-10+: Organization self-hosts or uses alternative        │
│              • VCs still valid (did:key is permanent)           │
│              • Verification still works                         │
│              • ESPR obligation met                              │
│                                                                  │
│  The VC contains all the data. The did:key enables verification.│
│  No ongoing EuroComply dependency.                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## What We DON'T Do

### No Hostage-Taking

```
┌─────────────────────────────────────────────────────────────────┐
│                    ANTI-PATTERNS WE AVOID                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ✗ Proprietary data formats                                    │
│    → We use W3C Verifiable Credentials                          │
│                                                                  │
│  ✗ Platform-locked identity (did:web:eurocomply.eu)            │
│    → We use did:key (self-contained)                            │
│                                                                  │
│  ✗ Verification requires our servers                           │
│    → did:key enables offline verification                       │
│                                                                  │
│  ✗ Export fees or restrictions                                 │
│    → Full export always available, no extra cost                │
│                                                                  │
│  ✗ Key escrow (we hold your keys)                              │
│    → You can export private keys                                │
│                                                                  │
│  ✗ Data deletion without export option                         │
│    → 30-day grace period, export reminders                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    PORTABILITY SUMMARY                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TARGET: SMEs (99% of EU businesses)                            │
│  APPROACH: Simple standards, no enterprise complexity           │
│                                                                  │
│  WHAT YOU FULLY OWN (Portable, No Dependency)                   │
│  → All Verifiable Credentials (signed DPPs)                     │
│  → Your identity (did:key + private key)                        │
│  → Product data (workspace versions + records)                  │
│  → Signature verification works forever, offline                │
│                                                                  │
│  WHAT HAS ONGOING REQUIREMENTS                                  │
│  → Status List URLs must remain accessible (hosting cost)       │
│  → QR code URLs must resolve (hosting or redirect)              │
│  → ESPR compliance requires 10+ year URL availability           │
│  → 10-year hosting included in DPP price (no extra cost)       │
│    OR self-hosting capability if you want revocation control    │
│                                                                  │
│  WHAT YOU CAN DO                                                │
│  → Export everything at any time (no extra cost)                │
│  → Host VCs anywhere (self-host, CDN, IPFS, etc.)              │
│  → Continue signing new VCs with your key                       │
│  → Use another provider that supports W3C VCs                   │
│  → Self-host status list for full independence                  │
│                                                                  │
│  WHAT STILL WORKS AFTER LEAVING                                 │
│  → All issued VCs remain valid (signatures)                     │
│  → Signature verification (did:key is self-contained)           │
│  → Your identity (did:key never expires)                        │
│  ⚠️ Revocation checking (only if status list hosted/migrated)  │
│  ⚠️ ESPR compliance (only if DPP URLs remain accessible)       │
│                                                                  │
│  THE HONEST TRADE-OFF                                           │
│  ─────────────────────────────────────────────                  │
│  We minimize TECHNICAL lock-in through open standards.          │
│  We cannot eliminate OPERATIONAL lock-in: ESPR requires         │
│  infrastructure, and infrastructure has ongoing costs.          │
│                                                                  │
│  You have options: 10-year hosting (included), self-host, or    │
│  another provider. Hosting cost is factored into DPP pricing    │
│  to meet "10-year DPP availability requirement."                │
│                                                                  │
│  OUR VALUE PROPOSITION                                          │
│  → Compliance-First PIM (workspace-based data model)            │
│  → AI-powered import (any file format)                          │
│  → Managed hosting (while subscribed)                           │
│  → Free retailer access layer                                   │
│  → Open standards (W3C VC, did:key/did:ebsi, GS1)              │
│  → Minimal lock-in (data portable, hosting required)            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

*Last Updated: 2026-01-14*
