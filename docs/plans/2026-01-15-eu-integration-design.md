# EU Integration Design

**Status:** Draft
**Date:** 2026-01-15
**Source:** EU_INTEGRATION.md

---

## 1. Overview

EuroComply is architected for seamless integration with EU infrastructure: EBSI (European Blockchain Services Infrastructure) and the EU DPP Registry. Our design uses the same standards the EU has chosen.

### Key Insight

**Integration is additive, not replacement.** We already use W3C VCs, GS1 standards, and JSON-LD. EU integration adds trust anchors and discovery, not new formats.

---

## 2. Standards Alignment

| Component | Our Implementation | EU Requirement | Gap |
|-----------|-------------------|----------------|-----|
| Credentials | W3C Verifiable Credentials | W3C VCs | None |
| Product IDs | GS1 GTIN | GS1 GTIN | None |
| URLs | GS1 Digital Link | GS1 Digital Link | None |
| Data Format | JSON-LD | JSON-LD | None |
| Identity | did:key | did:ebsi preferred | Add EBSI registration |

---

## 3. Identity Strategy: did:key → did:ebsi

### Current: did:key

```
did:key:z6MkhaXgBZDvotDUGrJqN...
        └─────────────────────────
          Public key encoded in DID
```

**Benefits:**
- Self-contained (no resolution needed)
- Works offline
- Instant creation
- Free

### Future: did:ebsi (Additive)

```typescript
interface OrganizationWallet {
  // Always available
  didKey: string;           // did:key:z6MkhaXgBZD...

  // After EBSI registration (optional)
  didEbsi?: string;         // did:ebsi:z23abc...

  // SAME cryptographic key for both
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;

  ebsiRegistration?: {
    registeredAt: Date;
    tirEntry: string;       // Trusted Issuers Registry
    accreditedBy: string;   // TAO that accredited
  };
}
```

**Key Point:** Same key, new identifier. did:ebsi is the same public key registered on EBSI blockchain.

### Trust Levels

| DID Method | Trust Level | Verification |
|------------|-------------|--------------|
| did:key | Cryptographic | "Signature is valid" |
| did:ebsi | EU Government + Cryptographic | "Signature valid AND issuer in EU registry" |

### When to Use Each

| Scenario | Recommended |
|----------|-------------|
| Default | did:key (works everywhere) |
| EU customs, market surveillance | did:ebsi |
| Cross-border trade requiring EU trust | did:ebsi |
| Internal/B2B use | did:key sufficient |

---

## 4. EBSI Integration

### What is EBSI?

European Blockchain Services Infrastructure operated by EU member states for:
- Verifiable Credentials (EU-recognized)
- Trusted Issuers Registry (authorized issuers)
- eIDAS 2.0 compliance (legal recognition)

### EBSI Trust Hierarchy

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
│              ▼                ▼                ▼                │
│     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│     │    TAO      │  │    TAO      │  │    TAO      │          │
│     │  (Member    │  │  (Member    │  │ (EuroComply │          │
│     │   State)    │  │   State)    │  │  optional)  │          │
│     └──────┬──────┘  └──────┬──────┘  └──────┬──────┘          │
│            ▼                ▼                ▼                  │
│     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│     │   Trusted   │  │   Trusted   │  │   Trusted   │          │
│     │   Issuer    │  │   Issuer    │  │   Issuer    │          │
│     │ (Customer)  │  │ (Customer)  │  │ (Customer)  │          │
│     └─────────────┘  └─────────────┘  └─────────────┘          │
│                                                                  │
│  TAO = Trusted Accreditation Organization                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### EBSI Registration Flow

1. **Apply for Accreditation** - Customer applies to TAO
2. **Receive Verifiable Authorisation** - Permission to issue DPP VCs
3. **Register DID on EBSI** - Same key gets did:ebsi identifier
4. **Listed in Trusted Issuers Registry** - Publicly verifiable
5. **Issue VCs with did:ebsi** - Additional EU trust anchor

### EuroComply as TAO (Optional Future)

We could become a Trusted Accreditation Organization:
- Streamlined onboarding for customers
- We handle EBSI registration as part of signup
- Value-add service for enterprise tier

---

## 5. EU DPP Registry Integration

### What is the EU DPP Registry?

Central EU database launching July 2026:
- Index of all DPPs in EU
- Tiered access (public, customs, market surveillance)
- Mandatory for products sold in EU

### Registry vs EuroComply Hosting

```
┌─────────────────────────────────────────────────────────────────┐
│  WHO HOSTS WHAT                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  EU REGISTRY (Index only):                                      │
│  • Product GTIN                                                 │
│  • DPP URL (points to us)                                       │
│  • Operator information                                         │
│  • Registration timestamp                                       │
│  • Status (active, revoked)                                     │
│                                                                  │
│  EUROCOMPLY (Full content):                                     │
│  • Verifiable Credential (signed)                               │
│  • Product attributes                                           │
│  • Attestations                                                 │
│  • Human-readable page                                          │
│  • QR code                                                      │
│                                                                  │
│  RESULT: EU provides discovery, we provide content              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Traffic Flow After EU Registry

```
PATH A: QR Code Scan (Direct)
────────────────────────────
QR → dpp.eurocomply.eu/01/{gtin} → CDN → DPP

PATH B: EU Registry Lookup
──────────────────────────
API → registry.eu/dpp?gtin={gtin} → Returns our URL → Fetch from us

Both paths: We serve the content.
```

### DPP Issuance + Registration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              DPP ISSUANCE + EU REGISTRATION                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User approves DPP in Compliance workspace                   │
│                                                                  │
│  2. EuroComply issues DPP:                                      │
│     • Generate Verifiable Credential                            │
│     • Sign with organization's DID                              │
│     • Push to CDN                                               │
│                                                                  │
│  3. Register with EU Registry:                                  │
│     • Call EU Registry API                                      │
│     • Submit: GTIN, DPP URL, operator, category                 │
│     • Store registration ID                                     │
│                                                                  │
│  4. DPP discoverable via both paths                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Database Schema Additions

```prisma
model OrganizationWallet {
  // Existing
  didKey          String   @unique
  publicKeyJwk    Json
  privateKeyJwk   Json     // Encrypted

  // EBSI additions
  didEbsi         String?  @unique
  ebsiRegisteredAt DateTime?
  ebsiTirEntry    String?
  ebsiAccreditedBy String?
}

model Passport {
  // Existing fields...

  // EU Registry additions
  euRegistryId    String?  @unique
  euRegisteredAt  DateTime?
  euRegistryStatus EuRegistryStatus @default(NOT_REGISTERED)
  euRegistryError String?
}

enum EuRegistryStatus {
  NOT_REGISTERED
  PENDING
  REGISTERED
  FAILED
  REVOKED
}
```

---

## 7. Verification with EBSI Trust

```typescript
async function verifyDppWithEbsiTrust(vcJwt: string): Promise<VerificationResult> {
  // 1. Verify cryptographic signature (always)
  const signatureValid = await verifySignature(vcJwt);
  if (!signatureValid) {
    return { valid: false, error: 'Invalid signature' };
  }

  // 2. Extract issuer DID
  const vc = decodeVc(vcJwt);
  const issuerDid = vc.issuer;

  // 3. If did:ebsi, check Trusted Issuers Registry
  if (issuerDid.startsWith('did:ebsi:')) {
    const tirEntry = await ebsiClient.getTrustedIssuer(issuerDid);

    return {
      valid: true,
      signatureValid: true,
      trustedIssuer: !!tirEntry,
      accreditedForDpp: tirEntry?.accreditations.includes('DigitalProductPassport'),
      issuerInfo: tirEntry?.attributes,
    };
  }

  // did:key - cryptographically valid, not EU-anchored
  return {
    valid: true,
    signatureValid: true,
    trustedIssuer: false,  // Not in EBSI
  };
}
```

---

## 8. Implementation Timeline

| Phase | Target | Scope |
|-------|--------|-------|
| **EBSI Preparation** | Q2-Q3 2025 | Conformance testing, library integration |
| **EBSI Production** | Q4 2025 | Production APIs, customer onboarding |
| **EU Registry Prep** | Q1-Q2 2026 | Build registry client |
| **EU Registry Launch** | Q3 2026 | Auto-registration of DPPs |

### Phase 1: EBSI Preparation

- Apply for EBSI conformance testing
- Integrate @cef-ebsi/verifiable-credential library
- Implement did:ebsi resolver
- Add did:ebsi field to wallet schema
- Test against EBSI pilot

### Phase 2: EU Registry

- Monitor EU Registry API specifications
- Build registry client library
- Add registration to DPP issuance flow
- Batch-register existing DPPs

---

## 9. Risk Assessment

### Low Risk (Standards aligned)

| Item | Status |
|------|--------|
| Product IDs (GS1 GTIN) | Exact match |
| Data Format (JSON-LD) | Exact match |
| Credential Format (W3C VC) | Exact match |
| URL Structure (GS1 Digital Link) | Exact match |

### Medium Risk (Requires work)

| Item | Gap | Mitigation |
|------|-----|------------|
| DID Method | did:ebsi preferred | Add registration option |
| Trust Anchor | EU TIR | EBSI onboarding process |
| Registry | Not built | Build when spec published |

### Unknown Risk

| Item | Notes |
|------|-------|
| EU Registry API specs | Not yet published |
| EBSI production timeline | EUROPEUM-EDIC transition |
| Delegated acts details | Still in consultation |

---

## 10. Related Documents

| Document | Purpose |
|----------|---------|
| [EU Integration](../EU_INTEGRATION.md) | Full timeline and technical details |
| [Verifiable Credentials Design](./2026-01-15-verifiable-credentials-design.md) | VC structure, did:key |
| [EPCIS Design](./2026-01-15-epcis-design.md) | Supply chain events |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-01-15 | Initial draft from EU_INTEGRATION.md |
