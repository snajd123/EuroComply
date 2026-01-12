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
│  │   "statusListCredential": "https://api.eurocomply.eu/v1/status/..." │   │
│  │ }                                                ▲                   │   │
│  │                                                  │                   │   │
│  │                            This URL is IMMUTABLE after issuance     │   │
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
| Compliance Archive (€99/yr) | ✅ Yes | ✅ Yes (frozen) | ❌ No |
| Self-hosted status list | ✅ Yes | ✅ Yes | ✅ Yes |
| Export without hosting | ✅ Yes | ❌ No (URL dead) | ❌ No |
| EuroComply shuts down | ✅ Yes | ❌ No (unless migrated) | ❌ No |

### Migration Options for Full Independence

**Option 1: Self-Host Status List (Recommended for technical users)**
```
1. Export status list credential from EuroComply
2. Deploy status list server on your infrastructure
3. Configure DNS/redirects so original URL resolves to your server
4. Full control over revocations
```

**Option 2: Compliance Archive (Recommended for non-technical users)**
```
1. Subscribe to Compliance Archive (€99/year)
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
│  OPTION A: COMPLIANCE ARCHIVE (Recommended)                     │
│  ─────────────────────────────────────────────────────────────  │
│  Annual subscription for long-term DPP hosting:                 │
│                                                                  │
│  │ SKU Tier        │ Annual Fee │                               │
│  │─────────────────│────────────│                               │
│  │ 0 - 10,000      │ €99/year   │                               │
│  │ 10,001 - 50,000 │ €299/year  │                               │
│  │ 50,000+         │ Custom     │                               │
│                                                                  │
│  • Published DPPs remain accessible via original URLs           │
│  • QR codes continue working (no reprinting needed)             │
│  • No dashboard access, no new DPP issuance                     │
│  • 10-year retention guaranteed (ESPR requirement)              │
│  • Includes: SSL, domain, security patches, resolver updates    │
│                                                                  │
│  ⚠️  No one-time fee option. 10-year maintenance costs          │
│      (security, SSL, domain renewals) cannot be predicted.      │
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
│         → If Option A: Transition to Compliance Archive         │
│         → If Option B/C: Final redirect configured              │
│         → If Option D: Waiver signed, DPPs taken offline        │
│         → Dashboard access removed                              │
│                                                                  │
│  After Day 30:                                                  │
│         → Option A: DPPs served from Compliance Archive         │
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
| Business failure | Data lost | Compliance Archive preserves compliance |
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
│                    OFFLINE VERIFICATION                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Given a VC file:                                               │
│  {                                                               │
│    "issuer": "did:key:z6MkhaXgBZDvvvRhta...",                   │
│    "credentialSubject": { ... DPP data ... },                   │
│    "proof": { "jws": "..." }                                    │
│  }                                                               │
│                                                                  │
│  To verify:                                                     │
│  1. Parse did:key → Extract public key                          │
│  2. Parse proof.jws → Extract signature                         │
│  3. Verify signature using public key                           │
│  4. Done! No network call needed.                               │
│                                                                  │
│  This works:                                                    │
│  ✓ Offline                                                      │
│  ✓ Without contacting EuroComply                                │
│  ✓ Without contacting the supplier                              │
│  ✓ 10 years from now                                            │
│  ✓ After EuroComply shuts down                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Hosting Options After Export

### Option 0: Compliance Archive (Stay with EuroComply)

If you cancel your active subscription but want QR codes to keep working without managing your own hosting:

```
Compliance Archive Plan (Annual):
  │ SKU Tier        │ Annual Fee │
  │─────────────────│────────────│
  │ 0 - 10,000      │ €99/year   │
  │ 10,001 - 50,000 │ €299/year  │
  │ 50,000+         │ Custom     │

Includes:
  • Static DPP pages remain accessible
  • QR codes continue working
  • SSL certificate renewals
  • Security patches and resolver updates
  • No editing, no new DPPs, no imports
  • 10+ year retention (ESPR compliant)
```

This is optional - you can always export and self-host instead. Compliance Archive is for organizations that want a "set and forget" solution for products already in market.

**Why no one-time fee?** Supporting URL resolution for 10+ years involves ongoing costs: SSL renewals, domain management, security patches, and potential W3C/GS1 standard updates. A one-time fee cannot reliably cover these unpredictable long-term costs.

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

1. **EuroComply Redirect** (Compliance Archive customers):
   - We configure 301 redirect to your server
   - Original URL → Your server

2. **GS1 Resolver** (if using GS1 Digital Link):
   - Update GS1 resolver to point to your status list
   - Only works if status list URL uses GS1 format

3. **Domain Takeover** (not recommended):
   - Would require EuroComply to transfer subdomain control
   - Complex and rarely practical

### Option B: Compliance Archive (Frozen Status List)

If you don't want to self-host, the Compliance Archive preserves your status list:

```
┌─────────────────────────────────────────────────────────────────┐
│  COMPLIANCE ARCHIVE - STATUS LIST HANDLING                       │
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
│  Cost: €99/year (0-10,000 SKUs)                                 │
│        €299/year (10,001-50,000 SKUs)                           │
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

**Strategy 3: EuroComply URLs with Compliance Archive**

```
QR code contains EuroComply URL:
  https://eurocomply.eu/dpp/prod_123

If you cancel, choose Compliance Archive:
  → URLs continue working (read-only)
  → €99/year for URL preservation

If you cancel without Compliance Archive:
  → URLs return 410 Gone after grace period
  → Printed QR codes become dead links

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
│  • Requires Compliance Archive or migration if you leave        │
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
│  WHAT YOU OWN                                                   │
│  → All Verifiable Credentials (signed DPPs)                     │
│  → Your identity (did:key + private key)                        │
│  → Product data (workspace versions + records)                  │
│  → QR codes                                                     │
│                                                                  │
│  WHAT YOU CAN DO                                                │
│  → Export everything at any time                                │
│  → Host VCs anywhere                                            │
│  → Continue signing new VCs with your key                       │
│  → Use another provider that supports W3C VCs                   │
│                                                                  │
│  WHAT STILL WORKS AFTER LEAVING                                 │
│  → All issued VCs remain valid (signatures)                     │
│  → Signature verification (did:key is self-contained)           │
│  → Your identity (did:key never expires)                        │
│  → Revocation checking (only if status list hosted/migrated)    │
│  → ESPR compliance (if DPP URLs remain accessible)              │
│                                                                  │
│  OUR VALUE PROPOSITION                                          │
│  → Compliance-First PIM (workspace-based data model)            │
│  → AI-powered import (any file format)                          │
│  → Managed hosting (while subscribed)                           │
│  → Free retailer access layer                                   │
│  → Simple standards (W3C VC, did:key/did:ebsi, GS1)            │
│  → NOT lock-in                                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

*Last Updated: 2026-01-12*
