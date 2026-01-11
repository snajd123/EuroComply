# EU Integration: EBSI & DPP Registry

Seamless integration with European Blockchain Services Infrastructure (EBSI) and the EU Digital Product Passport Registry.

---

## Executive Summary

EuroComply is architected for seamless transition to EU-managed infrastructure:

| Component | Current | EU Future | Migration Effort |
|-----------|---------|-----------|------------------|
| **Identity** | did:key (W3C) | did:ebsi (EBSI) | Low - same keys, add registration |
| **Credentials** | W3C VCs | W3C VCs (unchanged) | None - already compliant |
| **Product IDs** | GS1 GTIN | GS1 GTIN (unchanged) | None - already compliant |
| **Data Format** | JSON-LD | JSON-LD (unchanged) | None - already compliant |
| **DPP Hosting** | Cloudflare + Hetzner | EU Registry (optional) | Low - add registration API |
| **Trust Anchor** | Cryptographic | EU Trusted Issuers Registry | Medium - onboarding process |

**Key Insight:** Our architecture already uses the standards the EU has chosen. Integration is additive, not replacement.

---

## Timeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    EU INTEGRATION TIMELINE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  2024-2025: PREPARATION                                         │
│  ─────────────────────────                                      │
│  ✅ W3C Verifiable Credentials (done)                           │
│  ✅ GS1 GTIN for product identification (done)                  │
│  ✅ GS1 Digital Link URLs (done)                                │
│  ✅ JSON-LD data format (done)                                  │
│  ✅ did:key portable identities (done)                          │
│  📋 EBSI conformance testing (planned)                          │
│                                                                  │
│  2025-2026: EBSI INTEGRATION                                    │
│  ───────────────────────────                                    │
│  Q1 2025: EUROPEUM-EDIC takes over EBSI governance              │
│  Q2 2025: EuroComply applies for EBSI conformance               │
│  Q3 2025: Implement did:ebsi alongside did:key                  │
│  Q4 2025: Beta: Organizations can register on EBSI              │
│  2026: Production EBSI integration                              │
│                                                                  │
│  2026-2027: EU DPP REGISTRY                                     │
│  ───────────────────────────                                    │
│  July 2026: EU DPP Registry goes live                           │
│  Q3 2026: EuroComply implements Registry API client             │
│  Q4 2026: Beta: Auto-registration of DPPs to EU Registry        │
│  2027: Full integration with EU Registry                        │
│                                                                  │
│  2027+: DUAL OPERATION                                          │
│  ─────────────────────                                          │
│  • Our infrastructure handles high-volume scans                 │
│  • EU Registry provides official record                         │
│  • Both systems interoperate                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## EBSI Integration

### What is EBSI?

The **European Blockchain Services Infrastructure (EBSI)** is a blockchain-based infrastructure operated by EU member states for:

- **Verifiable Credentials** - EU-recognized digital credentials
- **Trusted Issuers Registry** - Official list of authorized issuers
- **did:ebsi** - EU-anchored decentralized identifiers
- **eIDAS 2.0 Compliance** - Legal recognition across EU

### Why EBSI Matters for DPPs

```
┌─────────────────────────────────────────────────────────────────┐
│  TRUST LEVELS                                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  did:key (current)                                              │
│  ─────────────────                                              │
│  Trust: Cryptographic (self-attested)                           │
│  Verification: "This signature is valid"                        │
│  Legal status: Industry standard (W3C)                          │
│                                                                  │
│  did:ebsi (future option)                                       │
│  ─────────────────────────                                      │
│  Trust: EU Government + Cryptographic                           │
│  Verification: "This signature is valid AND issuer is          │
│                registered in EU Trusted Issuers Registry"       │
│  Legal status: eIDAS 2.0 recognized                             │
│                                                                  │
│  WHEN TO USE EACH:                                              │
│  • did:key: Default, works everywhere, instant, free            │
│  • did:ebsi: When EU trust anchor required (customs, etc.)      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### EBSI Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    EBSI TRUST FRAMEWORK                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                    ┌─────────────────────┐                      │
│                    │   Root TAO          │                      │
│                    │   (EU Commission)   │                      │
│                    └──────────┬──────────┘                      │
│                               │                                  │
│              ┌────────────────┼────────────────┐                │
│              │                │                │                │
│              ▼                ▼                ▼                │
│     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│     │    TAO      │  │    TAO      │  │    TAO      │          │
│     │  (Member    │  │  (Member    │  │  (Industry  │          │
│     │   State)    │  │   State)    │  │   Body)     │          │
│     └──────┬──────┘  └──────┬──────┘  └──────┬──────┘          │
│            │                │                │                  │
│            ▼                ▼                ▼                  │
│     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│     │   Trusted   │  │   Trusted   │  │   Trusted   │          │
│     │   Issuer    │  │   Issuer    │  │   Issuer    │          │
│     │ (EuroComply │  │  (Company)  │  │  (Company)  │          │
│     │  Customer)  │  │             │  │             │          │
│     └─────────────┘  └─────────────┘  └─────────────┘          │
│                                                                  │
│  TAO = Trusted Accreditation Organization                       │
│  TI = Trusted Issuer (our customers)                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### did:ebsi Integration Path

Our architecture supports seamless upgrade from did:key to did:ebsi:

```typescript
// Current: did:key (already implemented)
interface OrganizationWallet {
  didKey: string;           // did:key:z6MkhaXgBZD...
  publicKeyJwk: JsonWebKey; // Ed25519 public key
  privateKeyJwk: JsonWebKey; // Encrypted at rest
}

// Future: Add did:ebsi alongside did:key
interface OrganizationWallet {
  didKey: string;           // did:key:z6MkhaXgBZD... (always available)
  didEbsi?: string;         // did:ebsi:z23abc... (after EBSI registration)
  publicKeyJwk: JsonWebKey; // SAME key for both DIDs
  privateKeyJwk: JsonWebKey;
  ebsiRegistration?: {
    registeredAt: Date;
    tirEntry: string;       // Trusted Issuers Registry entry
    accreditedBy: string;   // TAO that accredited this issuer
  };
}
```

**Key Insight:** Same cryptographic key → same verification. did:ebsi is just an additional identifier pointing to the same key, registered on EBSI.

### EBSI Registration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              EBSI ONBOARDING FLOW                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STEP 1: Apply for Accreditation                                │
│  ───────────────────────────────                                │
│  Organization applies to a TAO (Trusted Accreditation Org)      │
│  • Industry body, national authority, or EuroComply itself      │
│  • Provides legal entity information                            │
│  • KYC/verification process                                     │
│                                                                  │
│  STEP 2: Receive Verifiable Authorisation                       │
│  ─────────────────────────────────────────                      │
│  TAO issues a Verifiable Authorisation to the organization      │
│  • Grants permission to issue specific VC types                 │
│  • e.g., "Authorized to issue DPP VCs for textiles"             │
│                                                                  │
│  STEP 3: Register DID on EBSI                                   │
│  ─────────────────────────────                                  │
│  Organization registers their DID on EBSI blockchain            │
│  • Uses same public key as did:key                              │
│  • Gets did:ebsi:z23... identifier                              │
│  • Anchored to EBSI DID Registry                                │
│                                                                  │
│  STEP 4: Register in Trusted Issuers Registry (TIR)             │
│  ──────────────────────────────────────────────────             │
│  Organization is listed in TIR                                  │
│  • Public information about the issuer                          │
│  • Accreditations (what they can issue)                         │
│  • Verifiable by anyone                                         │
│                                                                  │
│  STEP 5: Issue VCs with did:ebsi                                │
│  ─────────────────────────────────                              │
│  New DPPs can be issued with did:ebsi as issuer                 │
│  • Same signature algorithm (Ed25519)                           │
│  • Additional trust: verifier checks TIR                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### EuroComply as TAO (Optional)

EuroComply could become a Trusted Accreditation Organization:

```
┌─────────────────────────────────────────────────────────────────┐
│  EUROCOMPLY AS TAO                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  BENEFITS:                                                      │
│  • Streamlined onboarding for our customers                     │
│  • We handle EBSI registration as part of signup                │
│  • Customers don't need to navigate EBSI bureaucracy            │
│  • Value-add service (premium tier?)                            │
│                                                                  │
│  REQUIREMENTS:                                                  │
│  • Apply to Root TAO (EU Commission)                            │
│  • Legal entity verification                                    │
│  • Compliance with EBSI governance                              │
│  • Technical conformance certification                          │
│                                                                  │
│  FLOW:                                                          │
│  1. Customer signs up to EuroComply                             │
│  2. We verify their legal entity (existing KYC)                 │
│  3. We issue Verifiable Authorisation (as TAO)                  │
│  4. We register their did:ebsi on their behalf                  │
│  5. They're now in EU Trusted Issuers Registry                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### EBSI Libraries and APIs

EBSI provides official libraries we'll integrate:

```typescript
// @cef-ebsi/verifiable-credential - Official EBSI VC library
import {
  createVerifiableCredential,
  verifyCredential
} from '@cef-ebsi/verifiable-credential';

// @cef-ebsi/did-resolver - Resolve did:ebsi to DID Document
import { EbsiDIDResolver } from '@cef-ebsi/did-resolver';

// Configuration for EBSI APIs
const EBSI_CONFIG = {
  // Production (when available)
  production: {
    didRegistry: 'https://api.ebsi.eu/did-registry/v5',
    trustedIssuersRegistry: 'https://api.ebsi.eu/trusted-issuers-registry/v5',
    trustedSchemasRegistry: 'https://api.ebsi.eu/trusted-schemas-registry/v3',
  },
  // Pilot (current)
  pilot: {
    didRegistry: 'https://api-pilot.ebsi.eu/did-registry/v5',
    trustedIssuersRegistry: 'https://api-pilot.ebsi.eu/trusted-issuers-registry/v5',
    trustedSchemasRegistry: 'https://api-pilot.ebsi.eu/trusted-schemas-registry/v3',
  },
};
```

### Verification with EBSI Trust Chain

```typescript
async function verifyDppWithEbsiTrust(vcJwt: string): Promise<VerificationResult> {
  // 1. Verify cryptographic signature (same as did:key)
  const signatureValid = await verifySignature(vcJwt);
  if (!signatureValid) {
    return { valid: false, error: 'Invalid signature' };
  }

  // 2. Extract issuer DID
  const vc = decodeVc(vcJwt);
  const issuerDid = vc.issuer;

  // 3. If did:ebsi, verify against Trusted Issuers Registry
  if (issuerDid.startsWith('did:ebsi:')) {
    const tirEntry = await ebsiClient.getTrustedIssuer(issuerDid);

    if (!tirEntry) {
      return {
        valid: true,
        signatureValid: true,
        trustedIssuer: false,
        warning: 'Issuer not found in EU Trusted Issuers Registry'
      };
    }

    // 4. Verify accreditation for DPP issuance
    const hasAccreditation = tirEntry.accreditations.some(
      acc => acc.type === 'DigitalProductPassport'
    );

    return {
      valid: true,
      signatureValid: true,
      trustedIssuer: true,
      accreditedForDpp: hasAccreditation,
      issuerInfo: tirEntry.attributes,
    };
  }

  // did:key - cryptographically valid but not EU-anchored
  return {
    valid: true,
    signatureValid: true,
    trustedIssuer: false, // Not in EBSI, but still valid VC
  };
}
```

---

## EU DPP Registry Integration

### What is the EU DPP Registry?

The **EU Digital Product Passport Registry** is a central database managed by the European Commission:

- **Launch Date:** July 2026
- **Purpose:** Central index of all DPPs in the EU
- **Access:** Tiered (public, customs, market surveillance)
- **Mandatory:** Products must be registered to be sold in EU

### Registry Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  EU DPP REGISTRY ARCHITECTURE                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 EU DPP REGISTRY                          │    │
│  │  (European Commission Infrastructure)                    │    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │                                                          │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │    │
│  │  │   Product    │  │   Operator   │  │   Access     │   │    │
│  │  │   Index      │  │   Registry   │  │   Control    │   │    │
│  │  │              │  │              │  │              │   │    │
│  │  │  • GTIN      │  │  • Company   │  │  • Public    │   │    │
│  │  │  • DPP URL   │  │  • did:ebsi  │  │  • Customs   │   │    │
│  │  │  • Category  │  │  • Location  │  │  • Recyclers │   │    │
│  │  │  • Status    │  │  • Contact   │  │  • Authority │   │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │    │
│  │                                                          │    │
│  │  APIs:                                                   │    │
│  │  • Registration API (submit new DPPs)                    │    │
│  │  • Query API (lookup by GTIN, operator, category)        │    │
│  │  • Bulk API (customs, market surveillance)               │    │
│  │  • Webhook API (status updates)                          │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│              ┌───────────────┼───────────────┐                  │
│              │               │               │                  │
│              ▼               ▼               ▼                  │
│     ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│     │  DPP        │ │  DPP        │ │  DPP        │            │
│     │  Provider   │ │  Provider   │ │  Provider   │            │
│     │ (EuroComply)│ │  (Other)    │ │  (Other)    │            │
│     │             │ │             │ │             │            │
│     │  Hosts DPP  │ │  Hosts DPP  │ │  Hosts DPP  │            │
│     │  content    │ │  content    │ │  content    │            │
│     └─────────────┘ └─────────────┘ └─────────────┘            │
│                                                                  │
│  REGISTRY ROLE: Index + Trust                                  │
│  PROVIDER ROLE: Host + Serve content                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Registry vs EuroComply Hosting

```
┌─────────────────────────────────────────────────────────────────┐
│  WHO HOSTS WHAT?                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  EU REGISTRY (Mandatory)                                        │
│  ───────────────────────                                        │
│  Stores: Index/reference data only                              │
│  • Product GTIN                                                 │
│  • DPP URL (points to our infrastructure)                       │
│  • Operator information                                         │
│  • Product category                                             │
│  • Registration timestamp                                       │
│  • Status (active, revoked)                                     │
│                                                                  │
│  EUROCOMPLY (Our Infrastructure)                                │
│  ───────────────────────────────                                │
│  Stores: Full DPP content                                       │
│  • Verifiable Credential (signed)                               │
│  • Product attributes (materials, certifications)               │
│  • Attestations from third parties                              │
│  • Human-readable HTML page                                     │
│  • QR code                                                      │
│                                                                  │
│  FLOW:                                                          │
│  1. Consumer scans QR → goes to our URL                        │
│  2. Customs queries Registry → gets our URL → fetches DPP      │
│  3. We remain the authoritative source of DPP content          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Registry API Integration (Projected)

Based on EU ESPR requirements and GS1 standards:

```typescript
// EU DPP Registry Client (projected API structure)
interface EuDppRegistryClient {
  // Register a new DPP
  register(params: {
    gtin: string;                    // GS1 GTIN (required)
    dppUrl: string;                  // URL to DPP (our infrastructure)
    operatorId: string;              // EU operator ID or did:ebsi
    productCategory: EsprCategory;   // ESPR product category
    vcHash: string;                  // Hash of VC for integrity
    manufacturingDate?: Date;
    manufacturingCountry?: string;
  }): Promise<RegistrationResult>;

  // Update DPP status
  update(params: {
    gtin: string;
    status?: 'ACTIVE' | 'REVOKED' | 'UPDATED';
    newDppUrl?: string;
    updateReason?: string;
  }): Promise<UpdateResult>;

  // Revoke a DPP
  revoke(params: {
    gtin: string;
    reason: string;
    replacementGtin?: string;
  }): Promise<RevocationResult>;

  // Query DPPs (for market surveillance, customs)
  query(params: {
    gtin?: string;
    operatorId?: string;
    category?: EsprCategory;
    dateRange?: { from: Date; to: Date };
  }): Promise<DppReference[]>;
}

// ESPR Product Categories (from regulation)
type EsprCategory =
  | 'TEXTILES'
  | 'BATTERIES'
  | 'ELECTRONICS'
  | 'FURNITURE'
  | 'IRON_STEEL'
  | 'ALUMINIUM'
  | 'TYRES'
  | 'DETERGENTS'
  | 'PAINTS'
  | 'LUBRICANTS'
  | 'CHEMICALS';
```

### Registration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              DPP ISSUANCE + REGISTRY FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. PRODUCT READY                                               │
│  ─────────────────                                              │
│  Product reaches 100% DPP completeness in EuroComply            │
│                                                                  │
│  2. USER APPROVES                                               │
│  ────────────────                                               │
│  User reviews and approves DPP issuance                         │
│                                                                  │
│  3. EUROCOMPLY ISSUES DPP                                       │
│  ────────────────────────                                       │
│  a. Generate Verifiable Credential                              │
│  b. Sign with organization's DID (did:key or did:ebsi)          │
│  c. Pre-render static files (JSON, HTML, QR)                    │
│  d. Push to Cloudflare CDN + Hetzner origins                    │
│  e. Store in database                                           │
│                                                                  │
│  4. REGISTER WITH EU REGISTRY                                   │
│  ─────────────────────────────                                  │
│  a. Call EU Registry API                                        │
│  b. Submit: GTIN, DPP URL, operator, category                   │
│  c. Receive: Registration confirmation + timestamp              │
│  d. Store registration ID in our database                       │
│                                                                  │
│  5. DPP NOW DISCOVERABLE                                        │
│  ────────────────────────                                       │
│  • Our URL: dpp.eurocomply.eu/01/{gtin}                         │
│  • EU Registry: registry.eu/dpp/{gtin} → redirects to us       │
│  • Both work, both are authoritative                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Dual-Path After EU Registry

```
┌─────────────────────────────────────────────────────────────────┐
│  TRAFFIC FLOW AFTER EU REGISTRY LAUNCH                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PATH A: Direct to EuroComply (QR Code)                         │
│  ───────────────────────────────────────                        │
│                                                                  │
│  [QR Scan] → dpp.eurocomply.eu/01/05901234567890               │
│                        │                                        │
│                        ▼                                        │
│              ┌─────────────────────┐                            │
│              │  Cloudflare CDN     │                            │
│              │  (99%+ cache hit)   │                            │
│              └──────────┬──────────┘                            │
│                         │                                        │
│                         ▼                                        │
│              ┌─────────────────────┐                            │
│              │  DPP HTML/JSON      │                            │
│              │  served instantly   │                            │
│              └─────────────────────┘                            │
│                                                                  │
│  PATH B: Via EU Registry (Official lookup)                      │
│  ─────────────────────────────────────────                      │
│                                                                  │
│  [API Call] → registry.eu/api/dpp?gtin=05901234567890          │
│                        │                                        │
│                        ▼                                        │
│              ┌─────────────────────┐                            │
│              │  EU Registry        │                            │
│              │  returns DPP URL    │                            │
│              └──────────┬──────────┘                            │
│                         │                                        │
│                         ▼                                        │
│              ┌─────────────────────┐                            │
│              │  Caller fetches     │                            │
│              │  from our URL       │                            │
│              └─────────────────────┘                            │
│                                                                  │
│  RESULT: We handle the traffic, EU provides discovery           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## EPCIS 2.0 Integration

EuroComply integrates EPCIS 2.0 (Electronic Product Code Information Services) as a **core feature from day one** for complete supply chain event tracking and product lifecycle visibility.

**See [EPCIS_INTEGRATION.md](./EPCIS_INTEGRATION.md) for full documentation.**

### Our Role: Hybrid EPCIS Provider

EuroComply operates a **Hybrid EPCIS Model**:
1. **Read from enterprise EPCIS** - Query existing SAP/IBM/TraceLink repositories
2. **Host OpenEPCIS for SMB** - Provide EPCIS hosting for customers/suppliers who don't have their own

| Customer Type | Their Situation | Our Solution |
|---------------|-----------------|--------------|
| Enterprise (Nestlé, H&M) | Have SAP/IBM EPCIS | Read from their systems |
| Mid-market manufacturer | No EPCIS, have ERP | Host OpenEPCIS for them |
| SMB supplier | No EPCIS, no ERP | Manual portal → our OpenEPCIS |

**Compatible with**: SAP EPCIS, IBM Sterling, TraceLink, GS1 Cloud + our hosted OpenEPCIS

### Quick Overview

| Aspect | Digital Product Passport | EPCIS 2.0 |
|--------|-------------------------|-----------|
| **Purpose** | Static product information | Dynamic lifecycle events |
| **Data Type** | Materials, certifications | Manufacturing, shipping, repairs |
| **Changes** | Rarely | Constantly (new events added) |
| **Format** | W3C Verifiable Credential | GS1 EPCIS 2.0 JSON-LD |

### Key Features

- **All 4 EPCIS Event Types**: ObjectEvent, AggregationEvent, TransformationEvent, TransactionEvent
- **The 4 Ws**: What (GTIN+serial), When (timestamp), Where (GLN), Why (business context)
- **IoT Sensor Data**: Temperature, humidity, shock monitoring
- **ESPR Extensions**: Carbon footprint, energy consumption, transport mode
- **GS1 Compliant**: REST API, JSON-LD format, CBV 2.0 vocabulary

### Carbon Footprint Tracking

EPCIS events include carbon footprint data for ESPR compliance:

```typescript
// Each transport event includes carbon data
{
  type: 'ObjectEvent',
  bizStep: 'shipping',
  espr: {
    carbonFootprint: { value: 4.2, scope: 3 },
    transport: { mode: 'road', distance: 450 }
  }
}
```

The DPP aggregates all event carbon footprints for total product impact.

→ **Full documentation: [EPCIS_INTEGRATION.md](./EPCIS_INTEGRATION.md)**

---

## Implementation Plan

### Phase 1: EBSI Preparation (Q2-Q3 2025)

| Task | Priority | Complexity |
|------|----------|------------|
| Apply for EBSI conformance testing | High | Low |
| Integrate @cef-ebsi/verifiable-credential library | High | Medium |
| Implement did:ebsi resolver | High | Medium |
| Add did:ebsi field to OrganizationWallet schema | Medium | Low |
| Build EBSI registration UI for organizations | Medium | Medium |
| Test against EBSI pilot environment | High | Medium |

### Phase 2: EBSI Production (Q4 2025 - Q1 2026)

| Task | Priority | Complexity |
|------|----------|------------|
| Apply for TAO status (optional) | Medium | High |
| Migrate to EBSI production APIs | High | Low |
| Add EBSI verification to DPP verification page | High | Medium |
| Update docs with EBSI guidance | Medium | Low |
| Customer onboarding for EBSI | Medium | Medium |

### Phase 3: EU Registry Preparation (Q1-Q2 2026)

| Task | Priority | Complexity |
|------|----------|------------|
| Monitor EU Registry API specifications | High | Low |
| Build EU Registry client library | High | Medium |
| Add Registry registration to DPP issuance flow | High | Medium |
| Store EU Registry IDs in Passport model | Medium | Low |
| Build admin dashboard for Registry status | Medium | Medium |

### Phase 4: EU Registry Production (Q3-Q4 2026)

| Task | Priority | Complexity |
|------|----------|------------|
| Integrate with EU Registry production API | High | Medium |
| Auto-register all new DPPs | High | Low |
| Batch register existing DPPs | Medium | Medium |
| Handle Registry errors and retries | High | Medium |
| Add Registry status to DPP UI | Medium | Low |

### Phase 5: EPCIS Integration (2026-2027)

| Task | Priority | Complexity |
|------|----------|------------|
| Add EPCIS repository link field to DPP | Low | Low |
| Build EPCIS query client | Low | Medium |
| Display lifecycle events on DPP page | Low | Medium |
| (Optional) Host EPCIS repository | Low | High |

---

## Data Model Updates

### Prisma Schema Additions

```prisma
model OrganizationWallet {
  id              String   @id @default(cuid())
  organizationId  String   @unique
  organization    Organization @relation(fields: [organizationId], references: [id])

  // Current: did:key (always available)
  didKey          String   @unique
  publicKeyJwk    Json
  privateKeyJwk   Json     // Encrypted

  // Future: did:ebsi (after EBSI registration)
  didEbsi         String?  @unique
  ebsiRegisteredAt DateTime?
  ebsiTirEntry    String?  // Trusted Issuers Registry entry ID
  ebsiAccreditedBy String? // TAO that accredited this issuer

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([didKey])
  @@index([didEbsi])
}

model Passport {
  id              String   @id @default(cuid())
  productId       String
  product         Product  @relation(fields: [productId], references: [id])

  // Existing fields...
  data            Json
  vcJwt           String
  status          PassportStatus @default(ACTIVE)

  // Existing static serving fields...
  staticPath      String?
  cdnUrl          String?
  lastPublishedAt DateTime?

  // NEW: EU Registry integration
  euRegistryId    String?  @unique  // EU Registry record ID
  euRegisteredAt  DateTime?         // When registered with EU
  euRegistryStatus EuRegistryStatus @default(NOT_REGISTERED)
  euRegistryError String?           // Last error if failed

  // NEW: EPCIS integration
  epcisRepositoryUrl String?        // Link to EPCIS repository
  epcisQueryPath    String?         // Query endpoint path

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([euRegistryId])
  @@index([euRegistryStatus])
}

enum EuRegistryStatus {
  NOT_REGISTERED      // Not yet submitted
  PENDING             // Submitted, awaiting confirmation
  REGISTERED          // Successfully registered
  FAILED              // Registration failed
  REVOKED             // Revoked in EU Registry
}
```

---

## Configuration

### Environment Variables

```bash
# .env

# ===========================================
# DID Configuration
# ===========================================
DID_METHOD=key                    # Options: key, ebsi

# EBSI Configuration (when DID_METHOD=ebsi)
EBSI_ENVIRONMENT=pilot            # Options: pilot, production
EBSI_API_URL=https://api-pilot.ebsi.eu
EBSI_BEARER_TOKEN=                # For authenticated operations

# ===========================================
# EU Registry (available 2026)
# ===========================================
EU_REGISTRY_ENABLED=false         # Enable when Registry launches
EU_REGISTRY_API_URL=              # EU Registry API endpoint
EU_REGISTRY_API_KEY=              # API credentials
EU_REGISTRY_AUTO_REGISTER=true    # Auto-register new DPPs

# ===========================================
# EPCIS (optional)
# ===========================================
EPCIS_ENABLED=false
EPCIS_DEFAULT_REPOSITORY_URL=     # For customers without own EPCIS
```

---

## Risk Assessment

### Low Risk

| Item | Current State | EU Compatibility |
|------|---------------|------------------|
| Product IDs | GS1 GTIN | Exact match |
| Data Format | JSON-LD | Exact match |
| Credential Format | W3C VC | Exact match |
| URL Structure | GS1 Digital Link | Exact match |

### Medium Risk

| Item | Current State | EU Requirement | Gap |
|------|---------------|----------------|-----|
| DID Method | did:key | did:ebsi preferred | Add EBSI registration |
| Trust Anchor | Self-attested | EU TIR | EBSI onboarding |
| Registry | None | EU Registry | Build client |

### Unknown Risk

| Item | Notes |
|------|-------|
| EU Registry API specs | Not yet published, may change |
| EBSI production timeline | EUROPEUM-EDIC transition ongoing |
| Delegated acts details | Still in consultation |

---

## Summary

```
┌─────────────────────────────────────────────────────────────────┐
│  EU INTEGRATION READINESS                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ALREADY COMPLIANT                                              │
│  ─────────────────                                              │
│  ✅ W3C Verifiable Credentials                                  │
│  ✅ GS1 GTIN product identification                             │
│  ✅ GS1 Digital Link URL structure                              │
│  ✅ JSON-LD data format                                         │
│  ✅ Portable did:key identities                                 │
│  ✅ ESPR data model alignment                                   │
│                                                                  │
│  ADDITIVE INTEGRATION                                           │
│  ────────────────────                                           │
│  📋 did:ebsi registration (same keys, new identifier)           │
│  📋 EU Trusted Issuers Registry (trust anchor)                  │
│  📋 EU DPP Registry client (index registration)                 │
│  📋 EPCIS 2.0 links (supply chain events)                       │
│                                                                  │
│  KEY INSIGHT                                                    │
│  ───────────                                                    │
│  EU chose the same standards we use.                            │
│  Integration is additive, not replacement.                      │
│  Our infrastructure remains the DPP content host.               │
│  EU Registry is an index pointing to us.                        │
│                                                                  │
│  TIMELINE                                                       │
│  ────────                                                       │
│  2025: EBSI integration                                         │
│  2026: EU Registry integration                                  │
│  2027+: Dual operation (our hosting + EU discovery)             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## References

- [EBSI Home](https://ec.europa.eu/digital-building-blocks/sites/display/EBSI/Home)
- [EBSI Verifiable Credentials](https://ec.europa.eu/digital-building-blocks/sites/spaces/EBSI/pages/600343491/EBSI+Verifiable+Credentials)
- [EBSI Trusted Issuers Registry API](https://hub.ebsi.eu/apis/pilot/trusted-issuers-registry/v4)
- [EBSI Developer Hub](https://hub.ebsi.eu/)
- [GS1 Digital Product Passport Standard](https://www.gs1.org/standards/standards-emerging-regulations/DPP)
- [GS1 Standards Enabling DPP](https://gs1.eu/wp-content/uploads/2024/12/GS1-Standards-Enabling-DPP.pdf)
- [ESPR Regulation](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1781)
- [EU DPP Wikipedia](https://en.wikipedia.org/wiki/EU_Digital_Product_Passport)
- [EPCIS 2.0 Standard](https://www.gs1.org/standards/epcis)

---

*Last Updated: January 11, 2026*
