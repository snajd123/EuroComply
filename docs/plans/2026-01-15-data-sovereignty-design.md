# Data Sovereignty Design

**Status:** Draft
**Date:** 2026-01-15
**Source:** DATA_SOVEREIGNTY.md + clarification session

---

## 1. Overview

EuroComply provides data sovereignty through **portable data**, not portable infrastructure.

### What Customers Want

| Need | Solution |
|------|----------|
| Simple SaaS | We host everything |
| No lock-in | Export anytime, take your data |
| Data ownership | Self-contained VCs with all data embedded |
| Survival guarantee | Signatures work forever without us |

### Core Principle

The **Verifiable Credential IS the sovereign asset**:
- Self-contained (all data embedded)
- Cryptographically signed
- Signature verification works forever, offline
- Revocation checking requires status list (we host for 10 years)

---

## 2. Hosting Infrastructure

### EU Data Residency

```
┌─────────────────────────────────────────────────────────────────┐
│  EU DATA RESIDENCY                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WRITE PATH (API, Products, Attestations)                       │
│  ─────────────────────────────────────────                      │
│  Provider: AWS                                                  │
│  Region: eu-central-1 (Frankfurt, Germany)                      │
│  Services: RDS PostgreSQL, DynamoDB, ECS Fargate                │
│  Compliance: GDPR, SOC 2, ISO 27001                             │
│                                                                  │
│  READ PATH (DPP Public Access)                                  │
│  ─────────────────────────────                                  │
│  CDN: Cloudflare (global edge, EU origin)                       │
│  Storage: Cloudflare R2 (EU jurisdiction)                       │
│  Compliance: GDPR, EU data residency                            │
│                                                                  │
│  KEY POINTS                                                     │
│  ──────────                                                     │
│  • All data stored in EU                                        │
│  • Zero egress fees (R2)                                        │
│  • No data transfer outside EU without consent                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Event Architecture

### Transactional Outbox Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRANSACTIONAL OUTBOX                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WHY OUTBOX (not direct event publishing):                      │
│  • Atomicity: DB write + event in same transaction              │
│  • No dual-write problem                                        │
│  • Replay capability: Outbox is source of truth                 │
│                                                                  │
│  FLOW:                                                          │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐    │
│  │ API      │──▶│ Postgres │──▶│ Outbox   │──▶│ Event    │    │
│  │ Request  │   │ Txn      │   │ Processor│   │ Consumers│    │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘    │
│                       │              │                          │
│                       ▼              ▼                          │
│               ┌──────────┐   ┌──────────┐                      │
│               │ Domain   │   │ Outbox   │                      │
│               │ Tables   │   │ Table    │                      │
│               └──────────┘   └──────────┘                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Outbox Table Schema

```sql
CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate VARCHAR(50) NOT NULL,      -- 'product', 'passport', 'credential'
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,    -- 'product.created', 'dpp.issued'
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    retry_count INTEGER DEFAULT 0,

    INDEX idx_outbox_unprocessed (processed_at) WHERE processed_at IS NULL
);
```

### Event Types

| Event | Trigger | Consumers | Latency |
|-------|---------|-----------|---------|
| `product.created` | New product | Search index, Analytics | < 1s |
| `product.updated` | Product modified | Search index, DPP regen | < 1s |
| `passport.approved` | DPP approved | VC issuer, R2 publisher | < 1s |
| `credential.issued` | VC signed | R2 publisher, Webhooks | < 5s |
| `credential.revoked` | VC revoked | Status list, Webhooks | < 1s |

### Event Processor

- Polls outbox every 100ms
- Processes in order per aggregate
- Marks `processed_at` after delivery
- Retains processed events 7 days
- Dead letter queue after 10 retries

---

## 4. Consistency Model

### By Operation Type

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONSISTENCY MODEL                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STRONG CONSISTENCY (PostgreSQL)                                │
│  ───────────────────────────────                                │
│  • Product data writes                                          │
│  • User/organization management                                 │
│  • Credential issuance                                          │
│  • Revocation updates                                           │
│  • Billing operations                                           │
│                                                                  │
│  Guarantee: Read-your-writes, monotonic reads                   │
│                                                                  │
│  EVENTUAL CONSISTENCY (CDN + R2)                                │
│  ───────────────────────────────                                │
│  • Public DPP page access                                       │
│  • Status list fetches                                          │
│  • Search index queries                                         │
│                                                                  │
│  Propagation targets:                                           │
│  • DPP to R2: < 5 seconds                                      │
│  • R2 to CDN edge: < 60 seconds                                │
│  • Status list to CDN: < 5 minutes                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Conflict Resolution

Optimistic concurrency control with version vectors:

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONFLICT RESOLUTION                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Every mutable entity has:                                      │
│  • version: INTEGER (incremented on update)                     │
│  • updated_at: TIMESTAMP                                        │
│  • updated_by: UUID                                             │
│                                                                  │
│  UPDATE FLOW:                                                   │
│  1. Client reads entity (version N)                             │
│  2. Client sends update with version N                          │
│  3. Server checks: current == N?                                │
│     • YES: Apply, set version = N+1                             │
│     • NO: Return 409 Conflict                                   │
│                                                                  │
│  POLICIES BY FIELD TYPE:                                        │
│  │ Field Type         │ Policy         │                       │
│  │────────────────────│────────────────│                       │
│  │ Description, name  │ Last-write-wins│                       │
│  │ Compliance fields  │ Require merge  │                       │
│  │ Attestations       │ Append-only    │                       │
│  │ Issued credentials │ Immutable      │                       │
│  │ Revocation status  │ One-way        │                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Key Lifecycle

### Simplified Model (No Rotation)

```
┌─────────────────────────────────────────────────────────────────┐
│                    KEY LIFECYCLE                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  For did:key, the key IS the identity.                         │
│  There is NO proactive key rotation.                            │
│                                                                  │
│  STATES:                                                        │
│                                                                  │
│       ┌─────────────┐                                           │
│       │   CREATED   │  Key generated, not yet used              │
│       └──────┬──────┘                                           │
│              │ First VC issued                                  │
│              ▼                                                   │
│       ┌─────────────┐                                           │
│       │   ACTIVE    │  Current signing key                      │
│       └──────┬──────┘                                           │
│              │                                                   │
│       ┌──────┴──────┐                                           │
│       │             │                                            │
│   Compromise    Key exported                                    │
│   detected      (self-host)                                     │
│       │             │                                            │
│       ▼             ▼                                            │
│  ┌─────────┐  ┌─────────────┐                                   │
│  │COMPROMISED│  │  EXPORTED   │                                   │
│  │(revoked) │  │(org manages)│                                   │
│  └─────────┘  └─────────────┘                                   │
│                                                                  │
│  NO "ROTATED" STATE - new key = new identity                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Protection

```
┌─────────────────────────────────────────────────────────────────┐
│                    KEY PROTECTION                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STORAGE (All Tiers):                                           │
│  • walt.id Custodian (server-side)                             │
│  • Encrypted backup in AWS Secrets Manager                      │
│  • AES-256-GCM with org-specific KEK                           │
│                                                                  │
│  ENTERPRISE TIER (Optional):                                    │
│  • Shamir Secret Sharing (2-of-3 threshold)                    │
│  • Split custody: Org + EuroComply + Third-party               │
│                                                                  │
│  PLATFORM TIER (Optional):                                      │
│  • AWS CloudHSM (FIPS 140-2 Level 3)                           │
│  • Key never leaves HSM                                         │
│  • Trade-off: Cannot export for self-hosting                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Compromise Response Only

The ONLY reason to get a new key:

```
┌─────────────────────────────────────────────────────────────────┐
│                    COMPROMISE RESPONSE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TRIGGERS:                                                      │
│  • Private key confirmed stolen/leaked                         │
│  • Unauthorized signatures detected                             │
│  • HSM/KMS breach confirmed                                     │
│                                                                  │
│  TIMELINE:                                                      │
│  < 15 min:  Disable key, trigger alert                         │
│  < 30 min:  Bulk-revoke all VCs via Status List                │
│  < 2 hours: Generate new keypair (new did:key)                 │
│  < 24 hours: Re-issue all affected DPPs                        │
│                                                                  │
│  IMPORTANT:                                                     │
│  • New key = NEW IDENTITY (new did:key)                        │
│  • Verifiers must learn to trust new DID                       │
│  • Notify supply chain partners                                │
│  • This is disruptive by design (security incident)            │
│                                                                  │
│  There is NO "seamless rotation" for did:key.                  │
│  This is a feature, not a bug.                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Export Package

### One-Click Export (All Tiers)

```
dpp-export-{org-id}.zip
├── credentials/
│   ├── dpp-001.vc.json       # Signed VC with ALL data
│   ├── dpp-002.vc.json
│   └── ...
├── identity/
│   ├── did.json              # DID document
│   └── private-key.jwk       # For future signing
├── status-list/
│   └── status-list.vc.json   # Current revocation state
├── products/
│   └── products.json         # All workspace data
├── images/
│   └── ...                   # All media assets
├── viewer.html               # Offline viewer (self-contained)
└── manifest.json             # GTIN → VC mapping
```

### Export API

```typescript
// Full organization export
POST /api/v1/organization/export
Response: {
  downloadUrl: "https://...",  // Signed URL, 24h expiry
  expiresAt: "2026-01-16T10:00:00Z",
  contents: {
    credentials: 1250,
    products: 500,
    images: 2340,
    totalSize: "1.2 GB"
  }
}

// Individual DPP export
GET /api/v1/passports/{id}/export
Response: {
  credential: { ... },         // Full VC JSON
  images: ["..."],             // Base64 or URLs
  viewer: "<!DOCTYPE html>..." // Self-contained viewer
}

// Status list export (for self-hosting)
POST /api/v1/organization/export/status-list
Response: {
  statusListCredential: { ... },  // Signed Status List 2021
  signingKey: { ... },            // Key to sign updates
  hostingInstructions: "..."
}
```

### What Organizations Can Do After Export

| Action | Description |
|--------|-------------|
| **Self-host** | Put VCs on their own server |
| **Use another provider** | Import into any VC platform |
| **Continue signing** | Use exported private key |
| **Manage revocations** | Host their own status list |

---

## 7. After Subscription Ends

### What Happens

```
┌─────────────────────────────────────────────────────────────────┐
│                    SUBSCRIPTION END                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DAY 0: Subscription ends                                       │
│  • Platform access suspended                                    │
│  • Export tools remain accessible                               │
│  • DPPs continue working                                        │
│                                                                  │
│  DAYS 1-30: Grace period                                        │
│  • Export all data                                              │
│  • Download signing keys                                        │
│  • DPPs continue working                                        │
│                                                                  │
│  DAY 30+: Data retention                                        │
│  • Product data archived (not deleted)                          │
│  • DPPs continue working (10-year hosting included)            │
│  • Status list frozen (no new revocations)                     │
│  • VCs remain valid (did:key is self-contained)                │
│                                                                  │
│  10-YEAR HOSTING INCLUDED:                                      │
│  • Status list hosted for 10 years                             │
│  • DPP pages served for 10 years                               │
│  • Cost already collected in per-DPP fee                       │
│  • No separate "dormant" or "archive" tier                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### For Full Independence

Organizations wanting complete control before cancellation:

1. **Configure self-hosted status list URL** at setup time
2. **Export status list** and signing key
3. **Host status list** on their own domain
4. **VCs reference their URL**, not EuroComply's

---

## 8. Verification Scenarios

| Scenario | Signature | Status List | Result |
|----------|-----------|-------------|--------|
| Normal | Valid | Bit = 0 | **VALID** |
| Revoked | Valid | Bit = 1 | **REVOKED** |
| Offline | Valid | Unavailable | **SIGNATURE OK** (verifier decides policy) |
| Tampered | Invalid | Any | **INVALID** |
| Org canceled | Valid | Frozen | **VALID** (10-year hosting) |

---

## 9. Changes from Original Document

| Aspect | Original | Design Decision |
|--------|----------|-----------------|
| **Voluntary Key Rotation** | Full section with succession records | Removed - no rotation for did:key |
| **Key Succession Records** | Complex linking mechanism | Removed - new key = new identity |
| **Compliance Archive** | €99/year tier | Removed - 10-year hosting in DPP price |
| **Key Lifecycle States** | CREATED → ACTIVE → ROTATED/COMPROMISED | Simplified: CREATED → ACTIVE → COMPROMISED/EXPORTED |

---

## 10. Related Documents

| Document | Purpose |
|----------|---------|
| [Verifiable Credentials Design](./2026-01-15-verifiable-credentials-design.md) | VC structure, did:key, Status List |
| [Architecture Design](./2026-01-15-architecture-design.md) | System architecture |
| [Business Model Design](./2026-01-15-business-model-design.md) | Pricing (10-year hosting included) |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-01-15 | Initial draft from DATA_SOVEREIGNTY.md review |

