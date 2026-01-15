# EUDI Wallet Integration for Digital Product Passports

**Status:** Approved Design
**Date:** 2026-01-15
**Author:** Brainstorming Session

---

## 1. Overview

EuroComply becomes the first DPP platform to support adding Digital Product Passports to EUDI Wallets, enabling consumers and businesses to hold verifiable proof of product authenticity, ownership, and sustainability in their personal digital wallets.

### Core Capabilities

- Consumers add DPPs to their wallet via QR scan or at purchase
- B2B buyers receive DPPs in bulk when goods ship
- Wallet credentials contain full immutable product data + link to live lifecycle events
- Ownership transfers via claim codes (pseudonymous, DID-based)
- Brands configure which claims are mandatory vs. selectively disclosable

### Technical Approach

- **Protocol-first:** OID4VCI for issuance, OID4VP for presentation
- **Format:** On-the-fly conversion from existing W3C VCs to SD-JWT-VC
- **Wallet-agnostic:** Works with any EUDI-compliant wallet
- **Privacy-preserving:** Holders identified by wallet DID, not personal data

### Competitive Positioning

First-mover advantage in the EUDI ecosystem. Even with low initial wallet adoption, this signals EuroComply as the forward-thinking choice for brands preparing for EU digital identity infrastructure.

---

## 2. Architecture

### How It Fits With Existing EuroComply Systems

```
┌─────────────────────────────────────────────────────────────────┐
│                     EXISTING EUROCOMPLY                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PostgreSQL              DynamoDB            Cloudflare R2      │
│  ┌──────────────┐       ┌──────────────┐    ┌──────────────┐   │
│  │ Product Data │       │ EPCIS Events │    │ DPP Templates│   │
│  │ (immutable)  │       │ (lifecycle)  │    │ (rendering)  │   │
│  └──────┬───────┘       └──────┬───────┘    └──────────────┘   │
│         │                      │                                 │
│         ▼                      ▼                                 │
│  ┌─────────────────────────────────────┐                        │
│  │         W3C VC Issuance             │                        │
│  │         (walt.id, did:key)          │                        │
│  └──────────────────┬──────────────────┘                        │
│                     │                                            │
└─────────────────────┼────────────────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
┌──────────────────┐    ┌─────────────────────┐
│   QR/DPP Page    │    │   NEW: Wallet       │
│   (existing)     │    │   Integration       │
└──────────────────┘    └─────────────────────┘
```

### New Components

| Component | Purpose |
|-----------|---------|
| **SD-JWT-VC Converter** | Transforms existing W3C VCs to wallet-compatible format on request |
| **OID4VCI Endpoint** | Handles wallet credential issuance protocol |
| **Holder Registry** | Tracks wallet DIDs holding each DPP (for ownership transfer) |
| **Events API** | Authenticated endpoint wallets can call for lifecycle data |

No changes to core data stores. The wallet layer wraps existing infrastructure.

---

## 3. Credential Structure

### SD-JWT-VC Format

```json
{
  "iss": "did:key:z6Mkh...",
  "iat": 1705312800,
  "exp": 2020672800,

  "vct": "https://eurocomply.eu/dpp/v1",

  "credentialSubject": {
    "productId": "01234567890128",
    "brand": "Acme Fashion",
    "productName": "Organic Cotton Tee",
    "productCategory": "textiles",

    "_sd": [ /* dynamically generated from product schema */ ]
  },

  "holderDid": "did:key:z6Mkw...",

  "eventsEndpoint": "https://api.eurocomply.eu/epcis/01234567890128",

  "transferable": true,
  "disclosurePolicy": "urn:eurocomply:policy:abc123"
}
```

### Key Design Decisions

| Field | Purpose |
|-------|---------|
| `holderDid` | Enables ownership verification without PII |
| `eventsEndpoint` | Signed URL for live lifecycle data; verifiers can fetch current status |
| `disclosurePolicy` | Reference to brand's configured mandatory/disclosable rules |
| `_sd` claims | SD-JWT mechanism; holder reveals only what's needed per presentation |

### Dynamic Product Data

- EuroComply already has **Product Families** with dynamic attribute schemas (JSONB)
- When converting to SD-JWT-VC, all product-specific attributes become selectively disclosable by default
- Brand's disclosure policy marks specific attributes as mandatory or hidden
- The credential structure adapts to whatever data the product has

---

## 4. Issuance Flows

### Flow A: QR Scan (Consumer)

```
Consumer scans product QR
         │
         ▼
┌─────────────────────────┐
│   DPP Page loads        │
│   [Add to Wallet] button│
└───────────┬─────────────┘
            │ click
            ▼
┌─────────────────────────┐
│  OID4VCI offer created  │
│  (credential_offer URI) │
└───────────┬─────────────┘
            │ deep link
            ▼
┌─────────────────────────┐
│  EUDI Wallet opens      │
│  Shows credential preview│
│  User confirms          │
└───────────┬─────────────┘
            │ accept
            ▼
┌─────────────────────────┐
│  Wallet calls EuroComply│
│  OID4VCI token endpoint │
│  Receives SD-JWT-VC     │
└───────────┬─────────────┘
            │
            ▼
    DPP now in wallet
    Holder DID registered
```

The "Add to Wallet" button appears on existing DPP pages. No separate app needed.

### Flow B: Purchase Integration (Shopify)

At checkout completion, customer is offered the DPP. If they accept, same OID4VCI flow triggers. The credential includes purchase context (date, retailer) as additional claims.

### Flow C: Bulk Transfer (B2B API)

Buyer's system calls EuroComply API with list of product IDs + buyer's wallet DID. EuroComply returns batch of credential offers or pre-authorized codes for bulk wallet import.

---

## 5. Ownership Transfer

### Transfer Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    OWNERSHIP TRANSFER FLOW                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CURRENT HOLDER                         NEW HOLDER              │
│                                                                  │
│  1. Opens wallet, selects DPP                                   │
│     Taps "Transfer Ownership"                                   │
│            │                                                     │
│            ▼                                                     │
│  2. EuroComply generates                                        │
│     transfer code (6 digits)                                    │
│     + QR code                                                   │
│     Valid for 24 hours                                          │
│            │                                                     │
│            │────────────────────────▶  3. Receives code/QR     │
│                                           (in person, message)  │
│                                                  │               │
│                                                  ▼               │
│                                        4. Scans QR or enters    │
│                                           code in their wallet  │
│                                                  │               │
│            ◀─────────────────────────────────────┘               │
│            │                                                     │
│            ▼                                                     │
│  5. EuroComply:                                                 │
│     - Revokes old credential (status list update)               │
│     - Issues new credential to new holder DID                   │
│     - Records transfer as EPCIS event                           │
│     - Notifies old holder: "Transfer complete"                  │
│                                                                  │
│  6. Old credential invalid    New credential in new wallet     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Points

- Transfer codes are short-lived (24 hours) and single-use
- Old credential is revoked via status list (verifiers will reject it)
- Transfer logged as EPCIS `ownership_transfer` event with timestamp
- Both parties identified only by wallet DID (pseudonymous)

---

## 6. Disclosure Policy Configuration

### Brand Configuration UI

In the EuroComply Compliance Workspace, brands get a new settings panel per Product Family:

```
┌─────────────────────────────────────────────────────────────────┐
│  WALLET DISCLOSURE POLICY                                        │
│  Product Family: Organic Cotton Collection                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CLAIM                        VISIBILITY                        │
│  ─────────────────────────────────────────────────────────────  │
│  Product ID (GTIN)            ● Mandatory  ○ Disclosable        │
│  Brand Name                   ● Mandatory  ○ Disclosable        │
│  Product Name                 ● Mandatory  ○ Disclosable        │
│  Serial Number                ○ Mandatory  ● Disclosable        │
│  Fiber Composition            ○ Mandatory  ● Disclosable        │
│  Country of Origin            ○ Mandatory  ● Disclosable        │
│  Carbon Footprint             ● Mandatory  ○ Disclosable        │
│  Care Instructions            ○ Mandatory  ● Disclosable        │
│  Certifications               ● Mandatory  ○ Disclosable        │
│  Factory Name                 ○ Mandatory  ● Disclosable        │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│  Preset: [Sustainability Focus ▼]                               │
│                                                                  │
│  Presets:                                                       │
│  • Maximum Transparency - All mandatory                         │
│  • Sustainability Focus - Eco claims mandatory, rest optional   │
│  • Privacy Balanced - Minimum mandatory, rest disclosable       │
│  • Custom                                                       │
│                                                                  │
│                                    [Save Policy]                │
└─────────────────────────────────────────────────────────────────┘
```

### Design Notes

- Policy is set per Product Family, not per individual product
- Presets give brands quick starting points
- Some claims (product ID, brand) are always mandatory by system rule
- Policy is versioned; existing credentials keep their original policy

---

## 7. Verification & Events Endpoint

### Verification Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    VERIFICATION FLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  VERIFIER (retailer, customs, recycler, app)                    │
│                                                                  │
│  1. Requests presentation from holder's wallet                  │
│     (OID4VP protocol)                                           │
│            │                                                     │
│            ▼                                                     │
│  2. Wallet shows holder which claims will be shared             │
│     Holder approves                                             │
│            │                                                     │
│            ▼                                                     │
│  3. Verifier receives SD-JWT-VC with disclosed claims           │
│                                                                  │
│  4. Verifier checks:                                            │
│     ✓ Signature valid (EuroComply issuer DID)                   │
│     ✓ Credential not expired                                    │
│     ✓ Not revoked (check status list)                           │
│     ✓ Holder DID matches presenter                              │
│            │                                                     │
│            ▼                                                     │
│  5. OPTIONAL: Fetch live lifecycle data                         │
│     GET {eventsEndpoint}                                        │
│     Authorization: Bearer {credential_hash}                     │
│            │                                                     │
│            ▼                                                     │
│     Returns: EPCIS events (manufactured, shipped, sold, etc.)   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Events Endpoint Security

| Security Measure | Implementation |
|------------------|----------------|
| URL signing | URL is signed into the credential (can't be forged) |
| Authentication | Caller must present credential hash as bearer token |
| Rate limiting | Prevents scraping of lifecycle data |
| Minimal response | Returns only events, not full product data (that's in the credential) |

---

## 8. Implementation Phases

### Phase 1: Core Infrastructure

**Scope:**
- SD-JWT-VC converter (W3C VC → SD-JWT-VC on-the-fly)
- OID4VCI endpoint for credential issuance
- Holder registry (PostgreSQL table: `wallet_holders`)
- "Add to Wallet" button on DPP pages
- Basic disclosure policy (EuroComply defaults, no brand config yet)

**Outcome:** Consumers can add DPPs to wallets via QR scan.

### Phase 2: Ownership & Configuration

**Scope:**
- Ownership transfer flow (transfer codes, revocation)
- Status list integration for revocation checking
- Brand disclosure policy UI in Compliance Workspace
- Events endpoint with credential-based auth
- EPCIS `ownership_transfer` event type

**Outcome:** Full ownership model, brands control disclosure.

### Phase 3: Commerce Integration

**Scope:**
- Shopify integration (offer DPP at checkout)
- Bulk transfer API for B2B
- Wallet holder analytics dashboard (pseudonymous: how many holders, transfer rates)
- Multi-wallet testing (German, Spanish, reference wallet)

**Outcome:** Complete feature set across all channels.

---

## 9. Data Model Changes

### New Tables

```sql
-- Tracks which wallet DIDs hold credentials for which products
CREATE TABLE wallet_holders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id VARCHAR(14) NOT NULL,           -- GTIN
    serial_number VARCHAR(255),                 -- For item-level DPPs
    holder_did VARCHAR(255) NOT NULL,           -- Wallet DID
    credential_hash VARCHAR(64) NOT NULL,       -- For revocation
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    transfer_from_holder_id UUID REFERENCES wallet_holders(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),

    UNIQUE(product_id, serial_number, holder_did, revoked_at)
);

-- Transfer codes for ownership transfer
CREATE TABLE wallet_transfer_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    holder_id UUID NOT NULL REFERENCES wallet_holders(id),
    code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    claimed_at TIMESTAMPTZ,
    claimed_by_did VARCHAR(255),

    UNIQUE(code)
);

-- Brand disclosure policies
CREATE TABLE disclosure_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    product_family_id UUID NOT NULL REFERENCES product_families(id),
    policy_version INT NOT NULL DEFAULT 1,
    mandatory_claims JSONB NOT NULL,           -- ["productId", "brand", ...]
    disclosable_claims JSONB NOT NULL,         -- ["serialNumber", "materials", ...]
    preset VARCHAR(50),                         -- "maximum_transparency", etc.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(product_family_id, policy_version)
);
```

---

## 10. API Endpoints

### OID4VCI Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /.well-known/openid-credential-issuer` | Issuer metadata |
| `POST /wallet/credential-offer` | Create credential offer for a DPP |
| `POST /wallet/token` | Exchange authorization for access token |
| `POST /wallet/credential` | Issue the SD-JWT-VC |

### Transfer Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /wallet/transfer/initiate` | Generate transfer code |
| `POST /wallet/transfer/claim` | Claim credential with transfer code |
| `GET /wallet/transfer/{code}` | Get transfer details (for QR display) |

### Events Endpoint

| Endpoint | Purpose |
|----------|---------|
| `GET /epcis/{productId}` | Fetch lifecycle events (requires credential auth) |
| `GET /epcis/{productId}/{serialNumber}` | Item-level events |

### Bulk API (B2B)

| Endpoint | Purpose |
|----------|---------|
| `POST /wallet/bulk-offer` | Create batch credential offers |

---

## 11. Open Questions

Items to resolve during implementation:

1. **Wallet testing strategy** - Which pilot wallets to test against first?
2. **Credential size limits** - Do any wallets have max credential size? May affect products with many attributes.
3. **Offline verification** - How long should status list cache be valid?
4. **Analytics scope** - What pseudonymous metrics are useful without crossing privacy lines?

---

## 12. Related Documentation

- [BUSINESS_MODEL.md](../BUSINESS_MODEL.md) - Pricing implications for wallet features
- [DATA_SOVEREIGNTY.md](../DATA_SOVEREIGNTY.md) - DID and credential portability
- [SECURITY.md](../SECURITY.md) - Authentication and key management
- [EPCIS_EVENTS.md](../EPCIS_EVENTS.md) - Lifecycle event structure

---

*Design approved: 2026-01-15*
