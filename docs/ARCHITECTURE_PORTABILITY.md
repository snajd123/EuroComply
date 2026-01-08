# DPP Portability & Data Ownership

> ⚠️ **Implementation Status**: This document describes the TARGET architecture. Currently using `did:web` (not `did:key`), export features not yet implemented. See [DATA_SOVEREIGNTY.md](./DATA_SOVEREIGNTY.md) for current vs target state.

## Overview

EuroComply is built on the principle that **suppliers own their data**. Digital Product Passports and Verifiable Credentials belong to the supplier, not the platform. This document describes the target portability architecture.

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
│  • W3C Verifiable Credentials (standard format)                 │
│  • did:key identity (planned - currently did:web)               │
│  • GS1 Digital Link QR codes (interoperable)                    │
│  • JSON-LD data format (web standard)                           │
│  • REST API (simple, well-documented)                           │
│  • Shopify/WooCommerce plugins (where SMEs sell)                │
│                                                                  │
│  WHAT WE SKIP (Enterprise-Only)                                 │
│  ─────────────────────────────                                  │
│  • Eclipse Dataspace Connector (B2B data spaces)                │
│  • Full AAS/AASX (industrial digital twins)                     │
│  • ODRL usage policies (complex access control)                 │
│  • Catena-X/Gaia-X integration (consortium protocols)           │
│  • EBSI blockchain anchoring (institutional trust)              │
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
│  1. SUPPLIERS OWN THEIR DATA                                    │
│     • DPPs and VCs belong to the supplier                       │
│     • EuroComply is a tool, not a data custodian                │
│                                                                  │
│  2. SELF-CONTAINED VCs (KEY ARCHITECTURAL DECISION)             │
│     • All DPP data is EMBEDDED in the VC (not references)       │
│     • The VC IS the sovereign asset                             │
│     • No external data dependencies                             │
│                                                                  │
│  3. NO LOCK-IN                                                  │
│     • Export all data at any time                               │
│     • Take VCs to any other platform                            │
│     • Continue signing with exported keys                       │
│     • One-click export includes VC + images + offline viewer    │
│                                                                  │
│  4. VERIFICATION WITHOUT EUROCOMPLY                             │
│     • did:key is self-contained (public key IS the identifier)  │
│     • VCs can be verified by anyone, anywhere, offline          │
│     • Works forever, even if EuroComply shuts down              │
│                                                                  │
│  5. ESPR COMPLIANCE                                             │
│     • DPPs must be accessible for product lifetime              │
│     • Portability ensures this obligation can be met            │
│     • Supplier controls where data lives                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

See [DATA_SOVEREIGNTY.md](./DATA_SOVEREIGNTY.md) for detailed architecture and rejected alternatives.

---

## What's Exportable

### Complete Export Package

When a supplier exports their data, they receive everything needed to operate independently:

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
  "supplier": {
    "id": "sup_abc123",
    "companyName": "ABC Textiles GmbH",
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

```
┌─────────────────────────────────────────────────────────────────┐
│                    CANCELLATION FLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Day 0: Supplier initiates cancellation                        │
│         → System generates export package                       │
│         → Download link provided                                 │
│                                                                  │
│  Day 1-30: Grace period                                         │
│         → DPPs remain accessible                                │
│         → Supplier can download export anytime                  │
│         → Reminder emails sent                                  │
│                                                                  │
│  Day 30: Subscription ends                                      │
│         → Final export reminder                                 │
│         → DPPs marked as "archived"                             │
│                                                                  │
│  Day 60: Data deletion                                          │
│         → Data removed from EuroComply                          │
│         → Supplier's exported VCs still work                    │
│         → did:key verification still works                      │
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
│     POST /api/suppliers/export                                  │
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

Supplier provides VCs directly to retailers.

```
┌─────────────────────────────────────────────────────────────────┐
│                    RETAILER-HOSTED VCs                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Supplier exports VCs                                           │
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

Suppliers can continue signing new VCs using their exported private key.

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
│  Scenario: Supplier uses EuroComply for 3 years, then cancels   │
│                                                                  │
│  Year 0-3: DPPs hosted on EuroComply                            │
│            • Full SaaS features                                  │
│            • Managed hosting                                     │
│                                                                  │
│  Year 3: Supplier cancels                                       │
│          • Exports all VCs and keys                             │
│          • Chooses new hosting solution                         │
│                                                                  │
│  Year 3-10+: Supplier self-hosts or uses alternative           │
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
│  → Product data and metadata                                    │
│  → QR codes                                                     │
│                                                                  │
│  WHAT YOU CAN DO                                                │
│  → Export everything at any time                                │
│  → Host VCs anywhere                                            │
│  → Continue signing new VCs with your key                       │
│  → Use another provider that supports W3C VCs                   │
│                                                                  │
│  WHAT STILL WORKS AFTER LEAVING                                 │
│  → All issued VCs remain valid                                  │
│  → Verification (did:key is self-contained)                     │
│  → Your identity (did:key never expires)                        │
│  → ESPR compliance (data remains accessible)                    │
│                                                                  │
│  OUR VALUE PROPOSITION                                          │
│  → Easy creation tools (no IT team required)                    │
│  → Managed hosting (while subscribed)                           │
│  → Retailer distribution network                                │
│  → Simple standards (W3C VC, did:key, GS1)                     │
│  → NOT lock-in                                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

*Last Updated: 2026-01-08*
