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
│     → Verifiable offline without EuroComply                     │
│     → Works forever                                             │
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
| "No lock-in" | Open standards (W3C VC, JSON), any viewer works |
| "What if you die?" | One-click export + offline verification |
| "No IT skills needed" | We host everything, export is just a download |

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
- Verifies signature offline
- Renders beautiful DPP page
- Works forever without internet

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

**Verdict**: Only for Enterprise tier (€599+/month)

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
┌──────────────────────────────┬───────────┬─────────────────────────────┐
│ Tier                         │ Price     │ Features                    │
├──────────────────────────────┼───────────┼─────────────────────────────┤
│ Growth (500 products, 10K    │ €129/mo   │ ✅ Full platform access     │
│ items)                       │           │ ✅ Self-contained VCs       │
│                              │           │ ✅ One-click export         │
│                              │           │ ✅ Offline verification     │
│                              │           │ ✅ Full PIM + Attestation   │
│                              │           │ ✅ Shopify sync + API       │
│                              │           │ ✅ 100 AI imports/month     │
├──────────────────────────────┼───────────┼─────────────────────────────┤
│ Scale (5,000 products, 1M    │ €399/mo   │ ✅ Full platform access     │
│ items)                       │           │ ✅ 1,000 AI imports/month   │
│                              │           │ ✅ Higher API limits        │
│                              │           │ ✅ Priority support         │
├──────────────────────────────┼───────────┼─────────────────────────────┤
│ Enterprise (Unlimited,       │ €999/mo   │ ✅ Full platform access     │
│ 100M items)                  │           │ ✅ Custom AI limits         │
│                              │           │ ✅ SSO, 99.9% SLA           │
│                              │           │ ✅ Dedicated support        │
├──────────────────────────────┼───────────┼─────────────────────────────┤
│ Mega (Unlimited, dedicated)  │ €4,999/mo │ ✅ Dedicated cluster        │
│                              │           │ ✅ Unlimited items          │
│                              │           │ ✅ Custom SLA               │
└──────────────────────────────┴───────────┴─────────────────────────────┘

**All tiers include unlimited users and full data sovereignty guarantees.**
```

All customers receive full platform access. Tier differentiation is based on catalog capacity and item volume.

---

## Marketing the Sovereignty Story

### Messaging

> "Your Data, Your Rules, Our Tools"

### Key Points

1. **You own it** - VCs contain all data, signed to your DID
2. **No lock-in** - Open standards, any viewer works
3. **Works forever** - Offline verification, no EuroComply dependency
4. **Simple** - We host everything, one-click export

### FAQ: "What happens if EuroComply disappears?"

> Your Digital Product Passports' **signatures** continue to verify. Here's the full picture:
>
> **What keeps working:**
> 1. **Your VCs are self-contained** - All data is inside the credential, not stored on our servers
> 2. **Signature verification works offline** - Proves data integrity and issuer identity
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
- "No Lock-in" - Works without us
- "Open Standards" - W3C Verifiable Credentials
- "Offline Verification" - No server dependency

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
