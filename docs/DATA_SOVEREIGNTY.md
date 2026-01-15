# Data Sovereignty Architecture

> 📋 **Implementation Status**: Data sovereignty features are **PLANNED**. This document describes the target architecture.

## Implementation Status

| Feature | Status | Target Implementation |
|---------|--------|----------------|
| DID Method | 📋 Planned | `packages/identity/src/services/did-key.service.ts` |
| VC Content | 📋 Planned | `packages/identity/src/services/vc-export.service.ts` |
| Verification | 📋 Planned | `did-key.service.ts` - `verifySignatureOffline()` |
| Export | 📋 Planned | `vc-export.service.ts` - `exportPortablePackage()` |
| Offline Viewer | 📋 Planned | `vc-export.service.ts` - `generateOfflineViewer()` |
| API Endpoints | 📋 Planned | `apps/api/src/core/routes.ts` |

**Test Coverage:** Tests to be written during implementation.

## Executive Summary

**The Decision**: Sovereignty through **portable data**, not portable infrastructure.

SMEs don't want to manage AWS accounts, Kubernetes clusters, or IPFS nodes. They want:
- Simple SaaS ("it just works")
- No lock-in ("I can leave anytime")
- Data ownership ("I own my data")
- Survival guarantee ("works if you disappear")

**Target Solution**: We host everything (simple), but the Verifiable Credential IS the sovereign asset. It's self-contained, cryptographically signed, and works forever without us.

---

## The Problem

EuroComply stores DPP data centrally. This creates concerns:
- Perceived vendor lock-in ("what if you go out of business?")
- Data residency concerns ("I need data in my country")
- Control anxiety ("can I keep a copy?")

## The Solution: Self-Contained Verifiable Credentials

The VC contains ALL the DPP data (not references to it). The cryptographic signature proves authenticity. **Signature verification** works offline, forever, without EuroComply.

**Important Clarification: What "Offline" Means**

> ⚠️ **Key Distinction**: "Offline verification" means *signature* verification only. Full verification (including revocation status) requires network access.

| Capability | Offline? | Notes |
|------------|----------|-------|
| **Signature Verification** | ✅ Yes | did:key is self-contained, no server needed |
| **Data Integrity Check** | ✅ Yes | Hash verification is local computation |
| **Text Data Display** | ✅ Yes | All text/JSON embedded in VC |
| **Revocation Status Check** | ❌ No | Requires fetching Status List 2021 from server |
| **Attestation Status Check** | ❌ No | Requires fetching contributor's status list |
| **Image Rendering (URL mode)** | ❌ No | URLs require CDN access |
| **Image Rendering (Base64 mode)** | ✅ Yes | Images embedded in VC (larger file size) |

**What "Signature Valid" vs "Fully Verified" means:**
- **Signature Valid**: Cryptographic proof that data hasn't been tampered with and was signed by the claimed issuer. Works offline.
- **Fully Verified**: Signature valid + credential not revoked + attestations not revoked. Requires network access.

**Image Options at DPP Issuance:**
- **URL Mode (default)**: Images stored as CDN URLs. Smaller VC file (~5KB), but requires network for full rendering.
- **Base64 Mode**: Images embedded as base64 strings. Larger VC file (~2MB), but renders completely offline.

Organizations can choose per-DPP or set an organization-wide default. For products printed on physical packaging (where QR codes are scanned), URL mode is recommended. For archival or offline-critical use cases, Base64 mode ensures complete independence.

```
┌─────────────────────────────────────────────────────────────────┐
│  WHAT THE CUSTOMER GETS                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✅ Self-Contained VC                                           │
│     → ALL product data embedded inside                          │
│     → Not references, the actual data                           │
│     → Images as URLs or base64 (customer's choice)              │
│                                                                 │
│  ✅ Cryptographic Signature                                     │
│     → Proves data wasn't tampered with                          │
│     → Signature verifiable without EuroComply                   │
│     → Revocation checking requires network access               │
│                                                                 │
│  ✅ Open Standards                                              │
│     → W3C Verifiable Credentials                                │
│     → JSON format                                               │
│     → Any compatible viewer works                               │
│                                                                 │
│  ✅ Export Always Available (All Plans)                         │
│     → Individual DPP: VC + images + offline viewer              │
│     → Bulk Product Data: CSV/JSON export of workspace data      │
│     → Full Organization Export: Everything for migration        │
│     → No tier restrictions, no extra cost                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architecture: Managed Hosting + Portable Data

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  EUROCOMPLY PLATFORM                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  DPP Creator  →  Compliance  →  VC Issuer  →  Viewer    │   │
│  │  (Forms/UI)      Validator      (Signing)     (HTML)    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│              ┌───────────────────────────────┐                  │
│              │  Self-Contained VC            │                  │
│              │  {                            │                  │
│              │    "issuer": "did:key:...",   │                  │
│              │    "credentialSubject": {     │                  │
│              │      // ALL DPP DATA HERE     │                  │
│              │      "product": {...},        │                  │
│              │      "fiberComposition": [...],│                 │
│              │      "carbonFootprint": {...}, │                 │
│              │      "certifications": [...]  │                  │
│              │    },                         │                  │
│              │    "proof": {...}  // Signature                  │
│              │  }                            │                  │
│              └───────────────────────────────┘                  │
│                              │                                  │
│           ┌──────────────────┼──────────────────┐               │
│           ▼                  ▼                  ▼               │
│    ┌────────────┐    ┌────────────┐    ┌────────────┐          │
│    │ EuroComply │    │  Customer  │    │   Any      │          │
│    │ Viewer     │    │  Export    │    │   Viewer   │          │
│    │ (hosted)   │    │  (download)│    │   (open)   │          │
│    └────────────┘    └────────────┘    └────────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

WHAT EACH COMPONENT DOES:
├── EuroComply Viewer: We host, renders the VC nicely
├── Customer Export: They download everything, host anywhere
└── Any Viewer: Open standards mean any compatible app works
```

---

## Hosting Infrastructure & Data Residency

All data is stored in the EU, using GDPR-compliant infrastructure:

```
┌─────────────────────────────────────────────────────────────────┐
│  EU DATA RESIDENCY                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WRITE PATH (API, Products, Attestations)                       │
│  ─────────────────────────────────────────                      │
│  Provider: AWS (Amazon Web Services)                            │
│  Region: eu-central-1 (Frankfurt, Germany)                      │
│  Services:                                                      │
│    • RDS PostgreSQL (schema-per-tenant isolation)               │
│    • DynamoDB (item-level data, billions of records)            │
│    • ECS Fargate, ElastiCache Redis, S3                         │
│  Compliance: GDPR, SOC 2, ISO 27001                             │
│                                                                  │
│  READ PATH (DPP Public Access)                                  │
│  ─────────────────────────────                                  │
│  CDN: Cloudflare (global edge, EU origin)                       │
│  Storage: Cloudflare R2 (S3-compatible, zero egress)            │
│  Workers: DPP serving + lazy generation                         │
│  Compliance: GDPR, EU data residency                            │
│                                                                  │
│  KEY POINTS                                                     │
│  ──────────                                                     │
│  • All data stored in EU                                        │
│  • Cloudflare R2 EU jurisdiction selected                       │
│  • Zero egress fees for unlimited DPP scans                     │
│  • AWS EU data processing addendum (DPA) in place               │
│  • No data transfer outside EU without customer consent         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

See [EuroComply_Architecture_Document_v1.3.md](../EuroComply_Architecture_Document_v1.3.md) for technical details.

---

## Hub Synchronization Architecture

This section defines how data flows between components, consistency guarantees, and failure recovery.

### Event Streaming Approach

EuroComply uses the **Transactional Outbox Pattern** to ensure reliable event propagation:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TRANSACTIONAL OUTBOX PATTERN                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WHY OUTBOX (not direct event publishing):                                  │
│  • Atomicity: DB write + event publish in same transaction                  │
│  • No dual-write problem (DB succeeds, event fails = inconsistency)         │
│  • Replay capability: Outbox table is the source of truth                   │
│  • Simpler failure recovery: Just re-process outbox entries                 │
│                                                                              │
│  FLOW:                                                                       │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │ API Request  │───▶│ PostgreSQL   │───▶│ Outbox       │───▶│ Event     │ │
│  │ (write op)   │    │ Transaction  │    │ Processor    │    │ Consumers │ │
│  └──────────────┘    └──────────────┘    └──────────────┘    └───────────┘ │
│                              │                   │                          │
│                              ▼                   ▼                          │
│                      ┌──────────────┐    ┌──────────────┐                   │
│                      │ Domain Table │    │ Outbox Table │                   │
│                      │ (products,   │    │ (events to   │                   │
│                      │  passports)  │    │  publish)    │                   │
│                      └──────────────┘    └──────────────┘                   │
│                                                                              │
│  OUTBOX TABLE SCHEMA:                                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐│
│  │ id          │ UUID PRIMARY KEY                                         ││
│  │ aggregate   │ VARCHAR(50) - e.g., 'product', 'passport', 'credential'  ││
│  │ aggregate_id│ UUID - ID of the affected entity                         ││
│  │ event_type  │ VARCHAR(100) - e.g., 'product.created', 'dpp.issued'     ││
│  │ payload     │ JSONB - Full event data                                  ││
│  │ created_at  │ TIMESTAMP WITH TIME ZONE                                 ││
│  │ processed_at│ TIMESTAMP WITH TIME ZONE NULL - Set when delivered       ││
│  │ retry_count │ INTEGER DEFAULT 0                                        ││
│  └────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  EVENT PROCESSOR:                                                           │
│  • Polls outbox table every 100ms (configurable)                           │
│  • Processes events in order per aggregate (preserve causality)            │
│  • Marks processed_at after successful delivery                            │
│  • Retains processed events for 7 days (audit trail)                       │
│  • Moves to dead letter queue after 10 retries                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Event Types

| Event | Trigger | Consumers | Latency Target |
|-------|---------|-----------|----------------|
| `product.created` | New product in workspace | Search index, Analytics | < 1s |
| `product.updated` | Product data modified | Search index, DPP regeneration | < 1s |
| `passport.submitted` | DPP submitted for approval | Compliance workflow engine | < 1s |
| `passport.approved` | DPP approved | VC issuer, R2 publisher | < 1s |
| `credential.issued` | VC signed and stored | R2 publisher, Webhook dispatcher | < 5s |
| `credential.revoked` | VC revoked | Status list updater, Webhook dispatcher | < 1s |
| `attestation.requested` | Multi-party attestation started | Notification service, Webhook | < 1s |
| `attestation.received` | Attestor signed their portion | Workflow engine, Notification | < 1s |

### Consistency Guarantees

Different operations have different consistency requirements:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONSISTENCY MODEL BY OPERATION                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STRONG CONSISTENCY (Single-Leader PostgreSQL)                              │
│  ─────────────────────────────────────────────                              │
│  These operations read-after-write always returns latest:                   │
│  • Product data writes (workspace CRUD)                                     │
│  • User/organization management                                             │
│  • Credential issuance (VC signing)                                         │
│  • Revocation updates (status list modifications)                           │
│  • Billing operations (subscription changes)                                │
│                                                                              │
│  Implementation: PostgreSQL with synchronous replication within AZ          │
│  Guarantee: Read-your-writes, monotonic reads                               │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  EVENTUAL CONSISTENCY (CDN + R2)                                            │
│  ─────────────────────────────────────────────────────────────────────────  │
│  These operations may have propagation delay:                               │
│  • Public DPP page access (consumer-facing)                                 │
│  • Status list fetches (for verification)                                   │
│  • Search index queries                                                     │
│                                                                              │
│  Propagation targets:                                                       │
│  • DPP to R2: < 5 seconds after approval                                   │
│  • R2 to CDN edge: < 60 seconds (Cloudflare cache TTL)                     │
│  • Status list update to CDN: < 5 minutes (cache invalidation)             │
│  • Search index: < 10 seconds                                              │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  NOT SUPPORTED                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • Cross-cell queries (cells are isolated by design)                       │
│  • Cross-tenant transactions (schema isolation)                            │
│  • Global ordering across all events (only per-aggregate ordering)         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Conflict Resolution Strategy

When concurrent updates occur, EuroComply uses **Optimistic Concurrency Control**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONFLICT RESOLUTION                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  MECHANISM: Version Vectors (per-field versioning)                          │
│                                                                              │
│  Every mutable entity has:                                                  │
│  • version: INTEGER - Incremented on every update                           │
│  • updated_at: TIMESTAMP - Last modification time                           │
│  • updated_by: UUID - User who made the change                              │
│                                                                              │
│  UPDATE FLOW:                                                               │
│  1. Client reads entity (gets version N)                                    │
│  2. Client modifies locally                                                 │
│  3. Client sends update with version N                                      │
│  4. Server checks: current version == N?                                    │
│     • YES: Apply update, set version = N+1                                  │
│     • NO: Return 409 Conflict with current state                           │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  CONFLICT POLICIES BY FIELD TYPE:                                           │
│                                                                              │
│  │ Field Type              │ Policy          │ Rationale                   │
│  │─────────────────────────│─────────────────│─────────────────────────────│
│  │ Description, name       │ Last-write-wins │ Low risk, easy to fix       │
│  │ Images, documents       │ Last-write-wins │ User can re-upload          │
│  │ Compliance fields       │ Require merge   │ Legal implications          │
│  │ Attestations            │ Append-only     │ Cannot overwrite others     │
│  │ Issued credentials      │ Immutable       │ Cannot modify after sign    │
│  │ Revocation status       │ One-way (revoke)│ Cannot un-revoke            │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  WORKSPACE CONFLICT HANDLING:                                               │
│                                                                              │
│  When Design and Production workspaces have diverged:                       │
│  1. System detects divergence on promotion attempt                          │
│  2. Shows diff view: Design vs Production                                   │
│  3. User must explicitly choose:                                            │
│     • "Use Design version" (overwrites Production)                          │
│     • "Use Production version" (discards Design changes)                    │
│     • "Merge manually" (field-by-field selection)                           │
│  4. Audit log records the resolution decision                               │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  AUDIT TRAIL:                                                               │
│  All versions are retained in audit log:                                    │
│  • Entity snapshots at each version                                         │
│  • Who made the change                                                      │
│  • What fields changed                                                      │
│  • Conflict resolutions recorded                                            │
│  • Retention: 7 years (ESPR compliance)                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Sync Failure Recovery

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SYNC FAILURE RECOVERY                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  FAILURE MODES AND HANDLING:                                                │
│                                                                              │
│  1. EVENT PROCESSOR DOWN                                                    │
│     Detection: Health check fails, no outbox processing                     │
│     Impact: Events queue in outbox table                                    │
│     Recovery: Auto-restart via ECS, process backlog                         │
│     Data loss: None (outbox is persistent)                                  │
│                                                                              │
│  2. CONSUMER UNAVAILABLE (e.g., R2 down)                                    │
│     Detection: Delivery failure, retry_count increments                     │
│     Impact: Specific event type delayed                                     │
│     Recovery: Exponential backoff retry (1s, 2s, 4s, 8s, ... max 5min)     │
│     After 10 failures: Move to dead letter queue, alert ops                 │
│                                                                              │
│  3. POISON MESSAGE (malformed event)                                        │
│     Detection: Consumer throws parse/validation error                       │
│     Impact: Single event stuck                                              │
│     Recovery: Move to dead letter queue after 3 attempts                    │
│     Resolution: Manual inspection, fix and replay or discard                │
│                                                                              │
│  4. DATABASE FAILOVER                                                       │
│     Detection: Aurora automatic failover                                    │
│     Impact: 15-30 second write unavailability                              │
│     Recovery: Automatic reconnection, resume outbox processing              │
│     Data loss: None (synchronous replication within AZ)                     │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  DEAD LETTER QUEUE (DLQ):                                                   │
│                                                                              │
│  Events moved to DLQ after max retries:                                     │
│  • Stored in separate dlq_events table                                      │
│  • Include: original event, error message, retry history                    │
│  • Ops team alerted via PagerDuty                                          │
│  • Manual resolution options:                                               │
│    - Fix and replay: UPDATE dlq_events SET reprocess = true                │
│    - Discard: UPDATE dlq_events SET discarded = true, reason = '...'       │
│  • Retention: 30 days, then archived to S3                                  │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  MONITORING AND ALERTING:                                                   │
│                                                                              │
│  │ Metric                      │ Warning    │ Critical   │ Action          │
│  │─────────────────────────────│────────────│────────────│─────────────────│
│  │ Outbox lag (oldest pending) │ > 1 min    │ > 5 min    │ Page on-call    │
│  │ DLQ size                    │ > 10       │ > 100      │ Page on-call    │
│  │ Event processor health      │ 1 restart  │ 3 restarts │ Page on-call    │
│  │ Consumer error rate         │ > 1%       │ > 5%       │ Investigate     │
│  │ R2 sync lag                 │ > 30s      │ > 5 min    │ Check R2 status │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  RUNBOOK: SYNC BACKLOG RECOVERY                                             │
│                                                                              │
│  1. Check outbox lag: SELECT MAX(age(now(), created_at)) FROM outbox       │
│     WHERE processed_at IS NULL;                                             │
│                                                                              │
│  2. Check processor status: aws ecs describe-services --services processor │
│                                                                              │
│  3. Check consumer health: curl -s http://consumer:8080/health             │
│                                                                              │
│  4. If processor stuck:                                                     │
│     aws ecs update-service --force-new-deployment                          │
│                                                                              │
│  5. If consumer down:                                                       │
│     Events will auto-retry when consumer recovers                          │
│                                                                              │
│  6. If DLQ growing:                                                         │
│     SELECT event_type, COUNT(*) FROM dlq_events GROUP BY event_type;       │
│     → Investigate most common failure type                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Did:key Lifecycle Management

Organization identity in EuroComply is based on `did:key` - a self-contained DID method where the public key IS the identifier. This section defines the complete lifecycle from creation to rotation.

### Key Derivation Path

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DID:KEY DERIVATION                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STEP 1: Generate Ed25519 Keypair                                           │
│  ────────────────────────────────                                           │
│  Source: Cryptographically secure random number generator (CSPRNG)          │
│  Output: 32-byte private key seed                                           │
│                                                                              │
│  private_seed = crypto.getRandomValues(new Uint8Array(32))                  │
│  { publicKey, privateKey } = Ed25519.generateKeyPair(private_seed)          │
│                                                                              │
│  STEP 2: Encode Public Key with Multicodec                                  │
│  ─────────────────────────────────────────                                  │
│  Prefix: 0xed01 (Ed25519 public key identifier)                             │
│                                                                              │
│  multicodec_bytes = [0xed, 0x01, ...publicKey]  // 34 bytes total           │
│                                                                              │
│  STEP 3: Encode with Multibase (Base58btc)                                  │
│  ─────────────────────────────────────────                                  │
│  Prefix: 'z' (Base58btc identifier)                                         │
│                                                                              │
│  multibase_string = 'z' + base58btc.encode(multicodec_bytes)                │
│                                                                              │
│  STEP 4: Construct did:key                                                  │
│  ────────────────────────                                                   │
│  did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK                   │
│          └─────────────────────────────────────────────────┘                │
│                              Multibase-encoded public key                    │
│                                                                              │
│  KEY PROPERTY: The DID IS the public key (self-contained)                   │
│  No resolution required - extract public key by reversing the encoding      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Metadata in Credentials

Every issued credential includes key derivation metadata for audit:

```json
{
  "@context": [...],
  "issuer": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
  "issuanceDate": "2026-01-14T10:00:00Z",

  "credentialSubject": { "...": "..." },

  "keyMetadata": {
    "algorithm": "Ed25519",
    "keyId": "key_org_abc123_v1",
    "derivationPath": "m/44'/60'/0'/0/0",
    "createdAt": "2025-06-15T08:00:00Z",
    "keyGeneration": 1,
    "previousKeyId": null
  },

  "proof": { "...": "..." }
}
```

| Field | Description |
|-------|-------------|
| `algorithm` | Always Ed25519 for did:key |
| `keyId` | Internal reference for key management |
| `derivationPath` | BIP-44 path if derived from master seed |
| `createdAt` | When the keypair was generated |
| `keyGeneration` | Increments on rotation (1 = original) |
| `previousKeyId` | Links to predecessor key if rotated |

### Key Backup and Recovery

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    KEY BACKUP ARCHITECTURE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  AUTOMATIC BACKUP (All Tiers)                                               │
│  ────────────────────────────                                               │
│                                                                              │
│  On key creation:                                                           │
│  1. Private key encrypted with organization's recovery key                  │
│  2. Encrypted backup stored in AWS Secrets Manager                          │
│  3. Backup ID recorded in organization record                               │
│                                                                              │
│  Encryption: AES-256-GCM with organization-specific KEK                     │
│  KEK derived from: org_id + master_secret (HSM-protected)                   │
│                                                                              │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐      │
│  │  Private Key     │───▶│  AES-256-GCM     │───▶│  Secrets Manager │      │
│  │  (32 bytes)      │    │  Encryption      │    │  (encrypted)     │      │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘      │
│                                   ▲                                          │
│                                   │                                          │
│                          ┌──────────────────┐                               │
│                          │  Organization    │                               │
│                          │  KEK (from HSM)  │                               │
│                          └──────────────────┘                               │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  SPLIT CUSTODY (Enterprise Tier)                                            │
│  ───────────────────────────────                                            │
│                                                                              │
│  For organizations requiring enhanced key protection:                        │
│                                                                              │
│  Private key split into 3 shares using Shamir Secret Sharing:               │
│  • Share 1: Organization Admin (stored in their secure vault)               │
│  • Share 2: EuroComply Escrow (encrypted, access-controlled)                │
│  • Share 3: Third-party Escrow (e.g., legal firm, notary)                  │
│                                                                              │
│  Recovery requires ANY 2 of 3 shares (2-of-3 threshold)                     │
│                                                                              │
│  ┌─────────┐     ┌─────────┐     ┌─────────┐                               │
│  │ Share 1 │     │ Share 2 │     │ Share 3 │                               │
│  │  (Org)  │     │(EuroCom)│     │(Escrow) │                               │
│  └────┬────┘     └────┬────┘     └────┬────┘                               │
│       │               │               │                                      │
│       └───────────────┴───────────────┘                                      │
│                       │                                                      │
│               Any 2 of 3 required                                           │
│                       │                                                      │
│                       ▼                                                      │
│              ┌─────────────────┐                                            │
│              │  Private Key    │                                            │
│              │  Reconstructed  │                                            │
│              └─────────────────┘                                            │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  HSM-BACKED STORAGE (Platform Tier)                                         │
│  ──────────────────────────────────                                         │
│                                                                              │
│  For highest security requirements:                                          │
│  • Private key never leaves AWS CloudHSM                                    │
│  • Signing operations performed inside HSM                                  │
│  • Key material is non-exportable                                           │
│  • FIPS 140-2 Level 3 certified                                             │
│                                                                              │
│  Trade-off: Key cannot be exported for self-hosting migration               │
│  Alternative: Generate new key after leaving, re-issue all VCs              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Recovery Procedure

When an organization loses access to their signing key:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    KEY RECOVERY PROCEDURE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STEP 1: Identity Verification (REQUIRED)                                   │
│  ────────────────────────────────────────                                   │
│  • Organization admin initiates recovery via support                        │
│  • Video call with EuroComply security team                                 │
│  • Verify: Government ID, company registration, signing authority           │
│  • 24-hour waiting period after verification (cooling-off)                  │
│                                                                              │
│  STEP 2: Recovery Authorization                                             │
│  ─────────────────────────────                                              │
│  • Security team creates recovery ticket                                    │
│  • Two EuroComply staff must approve (dual control)                         │
│  • Audit log entry with video call recording reference                      │
│                                                                              │
│  STEP 3: Key Restoration                                                    │
│  ────────────────────────                                                   │
│  For standard backup:                                                       │
│  • Decrypt key from Secrets Manager using organization KEK                  │
│  • Load into walt.id Custodian for organization                             │
│                                                                              │
│  For split custody:                                                         │
│  • Collect 2 of 3 shares from custodians                                   │
│  • Reconstruct key using Shamir's algorithm                                 │
│  • Load into walt.id Custodian                                              │
│                                                                              │
│  STEP 4: Post-Recovery                                                      │
│  ─────────────────────                                                      │
│  • Notify all organization admins                                           │
│  • Log recovery event in audit trail                                        │
│  • Recommend: Rotate key if recovery was due to suspected breach            │
│                                                                              │
│  RECOVERY SLA:                                                              │
│  • Standard: Within 48 hours (business days)                                │
│  • Enterprise: Within 4 hours (24/7 support)                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Voluntary Key Rotation

Organizations may rotate keys proactively (not just on compromise):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    VOLUNTARY KEY ROTATION                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WHEN TO ROTATE (Proactive):                                                │
│  ──────────────────────────                                                 │
│  • Key admin leaves organization                                            │
│  • Security policy mandates periodic rotation                               │
│  • Preparing for major compliance audit                                     │
│  • Transitioning to higher security tier (e.g., HSM-backed)                │
│                                                                              │
│  ROTATION WORKFLOW:                                                         │
│  ─────────────────                                                          │
│                                                                              │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐ │
│  │ Initiate │──▶│ Generate │──▶│ Create   │──▶│ Re-issue │──▶│ Retire   │ │
│  │ Rotation │   │ New Key  │   │ Succession│  │ Active   │   │ Old Key  │ │
│  └──────────┘   └──────────┘   │ Record   │   │ DPPs     │   └──────────┘ │
│                                └──────────┘   └──────────┘                  │
│                                                                              │
│  DETAILED STEPS:                                                            │
│                                                                              │
│  1. INITIATE ROTATION                                                       │
│     • Admin requests rotation via dashboard                                 │
│     • Selects reason: "employee_departure" | "policy" | "security_upgrade" │
│     • Confirms understanding that all active DPPs will be re-issued         │
│                                                                              │
│  2. GENERATE NEW KEYPAIR                                                    │
│     • New Ed25519 keypair created                                           │
│     • New did:key derived                                                   │
│     • Backed up following standard procedure                                │
│                                                                              │
│  3. CREATE KEY SUCCESSION RECORD                                            │
│     • Links old did:key to new did:key                                      │
│     • Published at well-known URL for verifier discovery                    │
│     • Old key marked as "ROTATED" (not "COMPROMISED")                       │
│                                                                              │
│  4. RE-ISSUE ACTIVE DPPs                                                    │
│     • Queue all non-revoked DPPs for re-issuance                           │
│     • Each VC re-signed with new key                                        │
│     • New VCs reference old VCs (supersedes relationship)                   │
│     • Batched processing (100 VCs per minute)                               │
│     • Progress visible in dashboard                                         │
│                                                                              │
│  5. RETIRE OLD KEY                                                          │
│     • Old key disabled for new signatures                                   │
│     • Old key retained for verification of historical VCs                   │
│     • Old VCs remain valid but show "superseded" indicator                  │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  KEY SUCCESSION RECORD:                                                     │
│                                                                              │
│  Published at: https://status.{customer-domain}/v1/key-succession/{org_id}  │
│  Or: https://api.eurocomply.eu/v1/key-succession/{org_id}                   │
│                                                                              │
│  {                                                                          │
│    "@context": ["https://w3id.org/security/v2"],                           │
│    "type": "KeySuccessionRecord",                                          │
│    "organization": "org_abc123",                                           │
│    "succession": [                                                         │
│      {                                                                     │
│        "previousKey": "did:key:z6MkOLD...",                               │
│        "newKey": "did:key:z6MkNEW...",                                    │
│        "effectiveDate": "2026-01-14T00:00:00Z",                           │
│        "reason": "policy",                                                │
│        "status": "rotated"                                                │
│      }                                                                     │
│    ]                                                                       │
│  }                                                                         │
│                                                                              │
│  VERIFIER BEHAVIOR:                                                         │
│  ──────────────────                                                         │
│  When verifying a VC signed by old key:                                     │
│  1. Signature verification: PASS (key is still valid for verification)     │
│  2. Check key succession record: Found                                      │
│  3. Display: "Signature valid. Issuer has rotated to new key."             │
│  4. Recommend: "Request updated credential from issuer if needed."         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Compromise Response Protocol

For security incidents, see [SECURITY.md - Key Compromise Recovery](./SECURITY.md#64-organization-key-compromise-recovery).

Summary of key differences between **voluntary rotation** and **compromise response**:

| Aspect | Voluntary Rotation | Compromise Response |
|--------|-------------------|---------------------|
| **Trigger** | Admin-initiated | Security incident |
| **Old key status** | ROTATED | COMPROMISED |
| **Old VC validity** | Valid (superseded) | Potentially revoked |
| **Urgency** | Scheduled | Immediate |
| **Suspicious VC review** | No | Yes (revoke if unauthorized) |
| **Notification** | Internal only | May be public |
| **Re-issuance** | All active DPPs | Prioritize high-value products |

### Key Lifecycle States

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    KEY LIFECYCLE STATE MACHINE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                          ┌─────────────┐                                    │
│                          │   CREATED   │                                    │
│                          │  (pending)  │                                    │
│                          └──────┬──────┘                                    │
│                                 │                                            │
│                        First VC issued                                       │
│                                 │                                            │
│                                 ▼                                            │
│                          ┌─────────────┐                                    │
│                          │   ACTIVE    │◀─────────────┐                     │
│                          │ (signing)   │              │                     │
│                          └──────┬──────┘              │                     │
│                                 │                     │                     │
│              ┌──────────────────┼──────────────────┐  │                     │
│              │                  │                  │  │                     │
│     Voluntary rotation    Compromise        Key exported                    │
│              │             detected         (self-hosting)                  │
│              │                  │                  │  │                     │
│              ▼                  ▼                  │  │                     │
│       ┌─────────────┐   ┌─────────────┐           │  │                     │
│       │   ROTATED   │   │ COMPROMISED │           │  │                     │
│       │(verify only)│   │  (revoked)  │           │  │                     │
│       └─────────────┘   └─────────────┘           │  │                     │
│                                                    │  │                     │
│                                                    ▼  │                     │
│                                             ┌─────────────┐                 │
│                                             │  EXPORTED   │                 │
│                                             │(org manages)│                 │
│                                             └──────┬──────┘                 │
│                                                    │                        │
│                                           Org returns                       │
│                                           to platform                       │
│                                                    │                        │
│                                                    └────────────────────────┘
│                                                                              │
│  STATE DESCRIPTIONS:                                                        │
│  ───────────────────                                                        │
│  • CREATED: Key generated, not yet used for signing                         │
│  • ACTIVE: Current signing key, can issue new VCs                          │
│  • ROTATED: Replaced by newer key, verify only, VCs are superseded         │
│  • COMPROMISED: Security incident, VCs may be revoked, verify with warning │
│  • EXPORTED: Organization managing key outside EuroComply                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Audit Requirements

All key lifecycle events are logged:

```typescript
interface KeyLifecycleEvent {
  eventType:
    | 'KEY_CREATED'
    | 'KEY_ACTIVATED'
    | 'KEY_ROTATED'
    | 'KEY_COMPROMISED'
    | 'KEY_EXPORTED'
    | 'KEY_RECOVERED'
    | 'KEY_BACKUP_CREATED'
    | 'KEY_BACKUP_ACCESSED';

  organizationId: string;
  keyId: string;
  did: string;

  timestamp: Date;
  performedBy: string;       // User or system ID
  ipAddress: string;
  userAgent: string;

  metadata: {
    reason?: string;         // For rotation/compromise
    previousKeyId?: string;  // For rotation
    recoveryTicketId?: string; // For recovery
  };
}
```

Retention: 7 years (ESPR compliance + security audit requirements)

---

## The VC Contains Everything

This is the key architectural decision. The VC is NOT a reference to data stored elsewhere. It contains ALL the DPP data:

```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    "https://eurocomply.eu/schemas/dpp/v1"
  ],
  "type": ["VerifiableCredential", "DigitalProductPassport"],
  "issuer": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
  "issuanceDate": "2026-01-08T12:00:00Z",

  "credentialSubject": {
    "id": "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH",

    "product": {
      "name": "Organic Cotton T-Shirt",
      "gtin": "4012345678901",
      "category": "textile",
      "description": "100% organic cotton t-shirt"
    },

    "fiberComposition": [
      {
        "fiberType": "Cotton",
        "percentage": 100,
        "origin": "Organic",
        "country": "EG"
      }
    ],

    "manufacturer": {
      "name": "EcoTextile GmbH",
      "country": "DE",
      "address": "Berlin, Germany",
      "registrationNumber": "HRB 12345"
    },

    "carbonFootprint": {
      "value": 8.5,
      "unit": "kgCO2e",
      "methodology": "PEF",
      "scope": "Cradle-to-gate"
    },

    "certifications": [
      {
        "type": "GOTS",
        "certificateNumber": "GOTS-12345",
        "issuingBody": "Control Union",
        "validFrom": "2025-01-01",
        "validUntil": "2027-01-01"
      }
    ],

    "careInstructions": {
      "maxWashTemperature": 30,
      "bleachAllowed": false,
      "tumbleDryAllowed": false,
      "ironTemperature": "low"
    },

    "images": [
      {
        "type": "product",
        "url": "https://cdn.eurocomply.eu/images/abc123.jpg",
        "hash": "sha256:e3b0c44298fc1c149afbf4c8996fb..."
      }
    ]
  },

  "proof": {
    "type": "Ed25519Signature2020",
    "created": "2026-01-08T12:00:00Z",
    "verificationMethod": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK#key-1",
    "proofPurpose": "assertionMethod",
    "proofValue": "z58DAdFfa9SkqZMVPxAQpic7ndTeel..."
  }
}
```

**Key points:**
- All data is in `credentialSubject` - embedded, not referenced
- `proof` is the cryptographic signature - verifiable offline
- `issuer` is EuroComply's DID - proves we signed it
- `credentialSubject.id` is customer's DID - proves they own it

---

## Sovereignty Guarantees

| What SMEs Want | How We Deliver It |
|----------------|-------------------|
| "I own my data" | VC contains all data, customer's DID owns it |
| "No lock-in" | Open standards (W3C VC, JSON), any viewer works* |
| "What if you die?" | One-click export + signature verification works |
| "No IT skills needed" | We host everything, export is just a download |

*Status list URLs in issued VCs create hosting dependency. See Portability section.

---

## One-Click Export

What the customer downloads:

```
dpp-export-12345.zip
├── credential.jwt              # The signed Verifiable Credential
├── passport.json               # Human-readable JSON (same data)
├── images/
│   ├── product-hero.jpg
│   ├── cert-gots.png
│   └── cert-oeko-tex.png
├── viewer.html                 # Self-contained offline viewer
├── qr-code.svg                 # For printing
└── README.md                   # How to use/verify
```

**The `viewer.html` is self-contained:**
- All CSS/JS embedded (no external dependencies)
- Loads the VC from same folder
- Verifies signature (works without internet)
- Renders beautiful DPP page
- Revocation status requires network access

---

## Options Analyzed (And Why We Rejected Them)

### Container-per-Customer

```
Customer pays → We spin up container → Customer owns infrastructure
```

**Why NOT:**
- SMEs don't have DevOps skills
- Support burden exceeds revenue
- €50-110/month infrastructure + customer labor
- Defeats "no IT team needed" promise

**Verdict**: Only for Enterprise tier (€1,499+/month)

---

### Create AWS Accounts for Customers

```
Customer signs up → We create AWS account → Deploy to their account
```

**Why NOT:**
- AWS doesn't support easy account transfer
- Consolidated billing is complex
- Ownership is legally murky
- Managing 1000s of AWS accounts is operational nightmare

**Verdict**: Not feasible

---

### IPFS as Primary Storage

```
All VCs stored on IPFS → Decentralized, survives if we die
```

**Why NOT:**
- SMEs don't know what IPFS is
- Gateways can be slow/unreliable
- Pinning costs money (~€20-50/month)
- Overkill for the problem

**Verdict**: Good as optional add-on, not primary

---

### Self-Hosted Open Source

```
Customer downloads our software → Runs on their servers
```

**Why NOT:**
- Requires technical skills
- Customer handles updates, security, backups
- Support burden shifts to them
- Defeats "no IT team needed" promise

**Verdict**: Only for technical customers who specifically want it

---

## What We Built ✅

### Self-Contained VC Export (Planned)

**Location:** `packages/identity/src/services/vc-export.service.ts`

```typescript
// Create self-contained VC
const vc = await vcExportService.createSelfContainedVC({
  issuerDid: did,
  issuerKeyId: keyId,
  subjectId: 'urn:gtin:1234567890123',
  dppData: { productName: '...', fiberComposition: [...], ... },
  images: [{ name: 'product.png', data: 'data:image/png;base64,...' }],
});

// Export portable package
const package = await vcExportService.exportPortablePackage({
  issuerDid: did,
  issuerKeyId: keyId,
  subjectId: 'urn:gtin:1234567890123',
  dppData: dppData,
  includePrivateKey: true, // For ownership transfer
});
// Returns: { files: [...], manifest: {...} }
```

### Offline HTML Viewer (Planned)

**Location:** `vc-export.service.ts` - `generateOfflineViewer()`

Single HTML file with:
- ✅ Embedded CSS (no external dependencies)
- ✅ Beautiful DPP rendering
- ✅ QR code display
- ✅ Works without internet

### did:key Service (Planned)

**Location:** `packages/identity/src/services/did-key.service.ts`

```typescript
// Create did:key
const { did, keyId } = await didKeyService.createDidKey({ algorithm: 'EdDSA' });
// did = "did:key:z6Mk..."

// Offline verification (no network!)
const isValid = await didKeyService.verifySignatureOffline(did, data, signature);

// Key export for portability
const privateKey = await didKeyService.exportPrivateKey(keyId);

// Key import (on different machine)
const newKeyId = await didKeyService.importPrivateKey(privateKey);
```

### API Endpoints (Planned)

**Location:** `apps/api/src/modules/organization/routes.ts`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/organization/export/did` | GET | Get or create organization's did:key |
| `/api/v1/organization/export/dpp/:productId` | POST | Export DPP as portable package |
| `/api/v1/organization/export/keys` | POST | Export signing keys (requires confirmation) |
| `/api/v1/organization/export/status-list` | POST | Export status list credential for self-hosting |
| `/api/v1/organization/export/viewer/:productId` | GET | Download offline HTML viewer |
| `/api/v1/organization/export/full` | POST | Full organization export (all data) |

**Usage Examples:**

```bash
# Get organization's DID
curl -X GET https://api.eurocomply.eu/v1/organization/export/did \
  -H "Authorization: Bearer <token>"

# Export DPP as portable package
curl -X POST https://api.eurocomply.eu/v1/organization/export/dpp/prod_123 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"includePrivateKey": false}'

# Export signing keys (requires explicit confirmation)
curl -X POST https://api.eurocomply.eu/v1/organization/export/keys \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"confirmKeyExport": true}'

# Download offline HTML viewer
curl -X GET https://api.eurocomply.eu/v1/organization/export/viewer/prod_123 \
  -H "Authorization: Bearer <token>" \
  -o dpp-viewer.html

# Export status list for self-hosting (requires confirmation)
curl -X POST https://api.eurocomply.eu/v1/organization/export/status-list \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"confirmExport": true, "includeHostingInstructions": true}'

# Full organization export (all VCs, keys, status list, products)
curl -X POST https://api.eurocomply.eu/v1/organization/export/full \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"confirmExport": true, "includePrivateKeys": true}'
```

### API Schemas

#### POST `/api/v1/organization/export/keys` - Export Signing Keys

**Request Schema:**

```typescript
interface ExportKeysRequest {
  // REQUIRED: Explicit confirmation to export private key material
  // Requests without this field or with value `false` will be rejected with 400 error
  confirmKeyExport: true;

  // Optional: Format for the exported key (default: "jwk")
  format?: "jwk" | "pem";
}
```

**Response Schema:**

```typescript
interface ExportKeysResponse {
  success: true;
  data: {
    // The organization's DID
    did: string;  // e.g., "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK"

    // The private key in JWK format (SENSITIVE - contains "d" parameter)
    privateKeyJwk: {
      kty: "OKP";
      crv: "Ed25519";
      x: string;   // Public key component (base64url)
      d: string;   // Private key component (base64url) - SENSITIVE
    };

    // Key metadata
    keyId: string;
    algorithm: "EdDSA";
    createdAt: string;  // ISO 8601

    // Export metadata
    exportedAt: string;  // ISO 8601
    exportedBy: string;  // User ID who performed the export
  };
  meta: {
    requestId: string;
    timestamp: string;
  };
}
```

**Error Responses:**

```typescript
// 400 Bad Request - Missing or false confirmation
{
  success: false,
  error: {
    code: "CONFIRMATION_REQUIRED",
    message: "Private key export requires explicit confirmation. Set confirmKeyExport: true to proceed.",
    details: {
      field: "confirmKeyExport",
      required: true
    }
  }
}

// 403 Forbidden - Insufficient permissions
{
  success: false,
  error: {
    code: "INSUFFICIENT_PERMISSIONS",
    message: "Only organization admins can export signing keys."
  }
}

// 429 Too Many Requests - Rate limited
{
  success: false,
  error: {
    code: "RATE_LIMITED",
    message: "Key export is limited to 3 requests per hour. Try again later.",
    details: {
      retryAfter: 1800  // seconds
    }
  }
}
```

#### POST `/api/v1/organization/export/dpp/:productId` - Export DPP Package

**Request Schema:**

```typescript
interface ExportDppRequest {
  // Include private key for ownership transfer (default: false)
  includePrivateKey?: boolean;

  // Image embedding mode (default: "url")
  imageMode?: "url" | "base64";

  // Include offline HTML viewer (default: true)
  includeViewer?: boolean;
}
```

**Response Schema:**

```typescript
interface ExportDppResponse {
  success: true;
  data: {
    // Download URL for the ZIP package (expires in 1 hour)
    downloadUrl: string;

    // Package contents manifest
    manifest: {
      credential: string;      // "credential.jwt"
      passport: string;        // "passport.json"
      viewer: string | null;   // "viewer.html" or null
      images: string[];        // ["images/product-hero.jpg", ...]
      readme: string;          // "README.md"
    };

    // Package metadata
    productId: string;
    exportedAt: string;
    expiresAt: string;  // Download URL expiration
    sizeBytes: number;
  };
  meta: {
    requestId: string;
    timestamp: string;
  };
}
```

#### POST `/api/v1/organization/export/status-list` - Export Status List

> ⚠️ **Important**: Status list export is required for self-hosting revocation support after leaving EuroComply. See [ARCHITECTURE_PORTABILITY.md](./ARCHITECTURE_PORTABILITY.md#status-list-migration-guide) for migration guide.

**Request Schema:**

```typescript
interface ExportStatusListRequest {
  // REQUIRED: Explicit confirmation to export status list
  confirmExport: true;

  // Include self-hosting instructions and server code examples (default: true)
  includeHostingInstructions?: boolean;
}
```

**Response Schema:**

```typescript
interface ExportStatusListResponse {
  success: true;
  data: {
    // The signed Status List 2021 Credential
    statusListCredential: {
      "@context": string[];
      type: ["VerifiableCredential", "StatusList2021Credential"];
      issuer: string;  // did:key of organization
      issuanceDate: string;
      credentialSubject: {
        id: string;  // The URL that must remain accessible
        type: "StatusList2021";
        statusPurpose: "revocation";
        encodedList: string;  // GZIP + Base64 encoded bitstring
      };
      proof: object;  // Ed25519Signature2020
    };

    // Metadata for migration
    metadata: {
      organizationId: string;
      totalCredentialsIssued: number;
      revokedCount: number;
      revokedIndices: number[];  // Which indices are revoked
      lastUpdated: string;  // ISO 8601
      originalUrl: string;  // URL that must be preserved
    };

    // Self-hosting requirements
    selfHostingRequirements: {
      // This exact URL must serve the status list credential
      requiredUrl: string;
      // HTTP headers to set
      contentType: "application/json";
      corsHeaders: {
        "Access-Control-Allow-Origin": "*";
        "Access-Control-Allow-Methods": "GET, OPTIONS";
      };
      cacheControl: "public, max-age=300";  // 5 minute cache recommended
    };

    // Optional: Code examples for self-hosting
    hostingExamples?: {
      cloudflareWorker: string;   // JavaScript code
      nginxConfig: string;        // nginx.conf snippet
      expressServer: string;      // Node.js/Express code
      staticHosting: string;      // Instructions for S3/GCS/etc
    };
  };
  meta: {
    requestId: string;
    timestamp: string;
  };
}
```

**Error Responses:**

```typescript
// 400 Bad Request - Missing confirmation
{
  success: false,
  error: {
    code: "CONFIRMATION_REQUIRED",
    message: "Status list export requires explicit confirmation. Set confirmExport: true to proceed."
  }
}

// 403 Forbidden - Insufficient permissions
{
  success: false,
  error: {
    code: "INSUFFICIENT_PERMISSIONS",
    message: "Only organization admins can export the status list."
  }
}
```

#### POST `/api/v1/organization/export/full` - Full Organization Export

**Request Schema:**

```typescript
interface FullExportRequest {
  // REQUIRED: Explicit confirmation for full export
  confirmExport: true;

  // Include private signing keys (default: false)
  includePrivateKeys?: boolean;

  // Include status list with hosting instructions (default: true)
  includeStatusList?: boolean;

  // Image mode for VCs (default: "url")
  imageMode?: "url" | "base64";
}
```

**Response Schema:**

```typescript
interface FullExportResponse {
  success: true;
  data: {
    // Download URL for ZIP archive (expires in 24 hours)
    downloadUrl: string;
    expiresAt: string;

    // Archive contents manifest
    manifest: {
      // Identity
      identity: {
        didDocument: "identity/did-document.json";
        privateKey: "identity/private-key.jwk" | null;
      };

      // Credentials
      credentials: {
        count: number;
        directory: "credentials/";
        files: string[];  // ["prod_001.vc.json", ...]
      };

      // Status list
      statusList: {
        credential: "status/status-list.json";
        metadata: "status/metadata.json";
        hostingInstructions: "status/HOSTING.md";
      } | null;

      // Products data
      products: {
        count: number;
        directory: "products/";
        files: string[];
      };

      // QR codes
      qrCodes: {
        directory: "qr-codes/";
        files: string[];
      };

      // Migration guides
      documentation: {
        readme: "README.md";
        migrationGuide: "MIGRATION.md";
        statusListHosting: "STATUS_LIST_HOSTING.md";
      };
    };

    // Export statistics
    statistics: {
      totalProducts: number;
      totalCredentials: number;
      totalRevokedCredentials: number;
      archiveSizeBytes: number;
    };
  };
  meta: {
    requestId: string;
    timestamp: string;
  };
}
```

### Security Requirements for Key Export

> ⚠️ **CRITICAL**: Private key export is a sensitive operation that must be protected.

**Mandatory Confirmation:**
- The `confirmKeyExport: true` parameter is **REQUIRED** for the `/export/keys` endpoint
- Requests without this parameter or with `confirmKeyExport: false` MUST return `400 Bad Request`
- This prevents accidental key exposure via scripts or automation that don't explicitly handle key material

**Access Control:**
- Only users with `ADMIN` role on the organization can export signing keys
- The `MANAGER` role is insufficient - key export requires explicit admin privileges
- API keys cannot be used for key export - only user sessions with MFA verified

**Rate Limiting:**
- Key export is limited to **3 requests per hour** per organization
- This prevents bulk extraction in case of compromised credentials
- Rate limit resets on the hour

**Audit Logging:**
- Every key export attempt (success or failure) MUST be logged
- Log entries include: user ID, timestamp, IP address, user agent, success/failure
- Failed attempts due to missing confirmation should be flagged for review
- Logs are retained for 2 years minimum (GDPR compliance)

**Additional Safeguards:**
- Key export triggers an email notification to all organization admins
- Export response includes `exportedBy` field for accountability
- Consider implementing a 24-hour delay option for high-security organizations

---

## Pricing

```
┌──────────────────────────────┬───────────────────┬─────────────────────────────┐
│ Tier                         │ Price             │ Features                    │
├──────────────────────────────┼───────────────────┼─────────────────────────────┤
│ Starter                      │ €79/mo base       │ ✅ Full platform access     │
│                              │ + €0.10/DPP       │ ✅ Self-contained VCs       │
│                              │ 10GB storage      │ ✅ One-click export         │
│                              │                   │ ✅ Signature verification   │
├──────────────────────────────┼───────────────────┼─────────────────────────────┤
│ Growth                       │ €199/mo base      │ ✅ Full platform access     │
│                              │ + €0.05/DPP       │ ✅ Shopify sync + API       │
│                              │ 50GB storage      │ ✅ 50K+: €0.03, 100K+: €0.02│
├──────────────────────────────┼───────────────────┼─────────────────────────────┤
│ Scale                        │ €599/mo base      │ ✅ Full platform access     │
│                              │ + €0.02/DPP       │ ✅ Priority support         │
│                              │ 200GB storage     │ ✅ 500K+: €0.01, 1M+: €0.008│
├──────────────────────────────┼───────────────────┼─────────────────────────────┤
│ Enterprise                   │ €1,499/mo base    │ ✅ Full platform access     │
│                              │ + €0.008/DPP      │ ✅ SSO, 99.95% SLA          │
│                              │ 1TB storage       │ ✅ Dedicated support        │
│                              │                   │ ✅ 5M+: €0.005, 10M+: €0.003│
├──────────────────────────────┼───────────────────┼─────────────────────────────┤
│ Platform                     │ Custom base       │ ✅ Dedicated cluster        │
│                              │ + €0.001-0.003/DPP│ ✅ Custom SLA               │
│                              │ Custom storage    │ ✅ Custom integrations      │
└──────────────────────────────┴───────────────────┴─────────────────────────────┘

**All tiers include unlimited products/SKUs, unlimited users, and full data sovereignty guarantees.**
```

All customers receive full platform access. Tier differentiation is based on storage, support level, and per-DPP pricing.

---

## Marketing the Sovereignty Story

### Messaging

> "Your Data, Your Rules, Our Tools"

### Key Points

1. **You own it** - VCs contain all data, signed to your DID
2. **Open standards** - W3C VCs, any compliant viewer works
3. **Signature verification** - Tamper-proof, works without network
4. **Simple** - We host everything, one-click export

### FAQ: "What happens if EuroComply disappears?"

> Your Digital Product Passports' **signatures** continue to verify. Here's the full picture:
>
> **What keeps working:**
> 1. **Your VCs are self-contained** - All data is inside the credential, not stored on our servers
> 2. **Signature verification works without network** - Proves data integrity and issuer identity
> 3. **Export anytime** - Download everything with one click
> 4. **Open standards** - Any W3C VC-compatible viewer works
>
> **What stops working (unless you migrate):**
> 1. **Revocation checking** - Status List 2021 requires the status list URL to be accessible
> 2. **New revocations** - Cannot revoke credentials without status list server
>
> **Recommendation:** Export your status list and either self-host it or use Compliance Archive (€99/year) to maintain full verification capability. See [ARCHITECTURE_PORTABILITY.md](./ARCHITECTURE_PORTABILITY.md#status-list-migration-guide) for migration guide.

### Trust Badges

- "Data Portable" - Export your data anytime
- "Open Standards" - W3C Verifiable Credentials
- "Signature Verification" - Tamper-proof cryptographic proof

---

## Technical Implementation

### Self-Contained VC Builder

```typescript
async function buildSelfContainedVC(passport: Passport): Promise<VerifiableCredential> {
  const issuerDid = await getEuroComplyDid();
  const subjectDid = await getOrganizationDid(passport.organizationId);

  // Build credential with ALL data embedded
  const credential: VerifiableCredential = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://eurocomply.eu/schemas/dpp/v1'
    ],
    type: ['VerifiableCredential', 'DigitalProductPassport'],
    issuer: issuerDid,
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: subjectDid,
      // Embed ALL the passport data
      ...passport.data,
    },
  };

  // Sign the credential
  const signedCredential = await signCredential(credential, issuerDid);

  return signedCredential;
}
```

### Offline Verification Library

```typescript
// Embedded in viewer.html
async function verifyCredential(credential: VerifiableCredential): Promise<VerificationResult> {
  // 1. Check structure
  if (!credential.proof) {
    return { valid: false, error: 'No proof found' };
  }

  // 2. Resolve issuer DID (did:key is self-contained - no network needed!)
  const issuerPublicKey = resolveDidKey(credential.issuer);

  // 3. Verify signature
  const signatureValid = await verifySignature(
    credential,
    credential.proof,
    issuerPublicKey
  );

  if (!signatureValid) {
    return { valid: false, error: 'Invalid signature' };
  }

  // 4. Check expiration if present
  if (credential.expirationDate && new Date(credential.expirationDate) < new Date()) {
    return { valid: false, error: 'Credential expired' };
  }

  return { valid: true, issuer: credential.issuer };
}

// did:key is self-contained - public key IS the identifier
function resolveDidKey(did: string): PublicKey {
  // did:key:z6Mk... contains the public key in the identifier itself
  // No network request needed!
  const multibase = did.replace('did:key:', '');
  return decodeMultibase(multibase);
}
```

---

## Related Documentation

- [Self-Service Onboarding](./SELF_SERVICE_ONBOARDING.md) - How organizations sign up
- [Business Model](./BUSINESS_MODEL.md) - Pricing tiers
- [Architecture Document](../EuroComply_Architecture_Document_v1.3.md) - Technical architecture

---

*Last Updated: 2026-01-13*
