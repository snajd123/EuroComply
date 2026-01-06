# walt.id Full Integration Plan

## Problem Statement

walt.id is currently only partially integrated in WorkforceTrust. ProductTrust and MerchantTrust use placeholder strings instead of actual cryptographic identity infrastructure.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    @eurocomply/identity                          │
│                  (Shared Identity Package)                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ DID Service │  │ VC Service  │  │ Key Management Service  │  │
│  │             │  │             │  │                         │  │
│  │ • create()  │  │ • issue()   │  │ • generateKeyPair()     │  │
│  │ • resolve() │  │ • verify()  │  │ • sign()                │  │
│  │ • update()  │  │ • revoke()  │  │ • getPublicKey()        │  │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘  │
│         │                │                      │               │
│         └────────────────┼──────────────────────┘               │
│                          │                                      │
│                          ▼                                      │
│              ┌───────────────────────┐                          │
│              │   walt.id Adapter     │                          │
│              │                       │                          │
│              │ • Core API client     │                          │
│              │ • Signatory client    │                          │
│              │ • Custodian client    │                          │
│              │ • Auditor client      │                          │
│              └───────────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
            ▼                 ▼                 ▼
     ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
     │ ProductTrust │  │WorkforceTrust│  │MerchantTrust │
     │              │  │              │  │              │
     │ DPP as VC    │  │ Employee VC  │  │ Merchant DID │
     │ Product DID  │  │ Diploma VC   │  │ KYB VC       │
     └──────────────┘  └──────────────┘  └──────────────┘
```

## Implementation Plan

### Phase 1: Create Shared Identity Package

**Location**: `packages/identity/`

**Files to Create**:
```
packages/identity/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Public exports
│   ├── types.ts              # Type definitions
│   ├── config.ts             # Configuration
│   ├── services/
│   │   ├── did.service.ts    # DID creation/resolution
│   │   ├── vc.service.ts     # VC issuance/verification
│   │   └── key.service.ts    # Key management
│   └── adapters/
│       └── waltid.adapter.ts # walt.id API integration
```

**DID Service Capabilities**:
- `createDid(type: 'web' | 'ebsi', identifier: string)` - Create new DID
- `resolveDid(did: string)` - Resolve DID to DID Document
- `getDidDocument(did: string)` - Get full DID document for hosting
- `updateDid(did: string, updates: DidDocumentUpdate)` - Update DID document

**VC Service Capabilities**:
- `issueCredential(issuerDid, subjectDid, type, claims, expiresAt?)` - Issue VC
- `verifyCredential(vcJwt: string)` - Verify VC signature and validity
- `revokeCredential(vcId: string)` - Add to revocation registry

**Key Service Capabilities**:
- `generateKeyPair(algorithm: 'ES256' | 'EdDSA')` - Generate key pair
- `storeKey(keyId, privateKey)` - Store in walt.id custodian
- `sign(keyId, data)` - Sign data with stored key
- `getPublicKey(keyId)` - Retrieve public key

### Phase 2: Integrate into ProductTrust

**Changes Required**:

1. **On Passport Creation**:
   - Get organization's DID (issuer)
   - Issue DPP as Verifiable Credential via `vcService.issueCredential()`
   - Store VC JWT in `passport.vcJwt`
   - Store VC ID in `passport.credentialId`

2. **On Passport Verification** (public endpoint):
   - Verify VC signature via `vcService.verifyCredential()`
   - Return verification result with credential data

3. **On Anchor**:
   - Already has VC from step 1
   - Anchoring = creating timestamp proof (walt.id handles this)

**Credential Type**: `DigitalProductPassport`

**Credential Schema**:
```json
{
  "@context": ["https://www.w3.org/2018/credentials/v1"],
  "type": ["VerifiableCredential", "DigitalProductPassport"],
  "issuer": "did:web:eurocomply.io:m:{merchant-slug}",
  "credentialSubject": {
    "id": "urn:gtin:{gtin}",
    "productName": "...",
    "manufacturerName": "...",
    "carbonFootprint": { "value": 5.2, "unit": "kgCO2e" },
    "recyclability": { "percentage": 85 },
    ...
  }
}
```

### Phase 3: Integrate into MerchantTrust

**Changes Required**:

1. **On Merchant/Trader Creation**:
   - Generate key pair via `keyService.generateKeyPair()`
   - Create DID via `didService.createDid('web', merchantSlug)`
   - Store key reference in merchant record
   - Store DID document for hosting

2. **On KYB Completion**:
   - Issue KYB Verification Credential to merchant
   - Credential proves: VAT validated, registry checked, etc.

3. **Add DID Document Hosting Endpoint**:
   - `GET /.well-known/did.json` - Platform DID
   - `GET /m/{slug}/did.json` - Merchant DIDs

**Credential Type**: `KYBVerificationCredential`

**Credential Schema**:
```json
{
  "@context": ["https://www.w3.org/2018/credentials/v1"],
  "type": ["VerifiableCredential", "KYBVerificationCredential"],
  "issuer": "did:web:eurocomply.io",
  "credentialSubject": {
    "id": "did:web:eurocomply.io:m:{merchant-slug}",
    "legalName": "...",
    "vatNumber": "...",
    "vatValidated": true,
    "registryVerified": true,
    "verificationDate": "2024-01-01"
  }
}
```

### Phase 4: Update WorkforceTrust

**Changes Required**:

1. **Replace local waltid.service.ts** with shared `@eurocomply/identity`
2. **Ensure consistent error handling** across all modules
3. **Add proper fallback handling** when walt.id is unavailable

### Phase 5: Add DID Document Hosting

**New Routes**:
```
GET /.well-known/did.json              → Platform DID document
GET /m/:slug/did.json                  → Merchant DID document
GET /v1/passports/:id/verify           → Public DPP verification (no auth)
```

**DID Document Structure** (did:web):
```json
{
  "@context": ["https://www.w3.org/ns/did/v1"],
  "id": "did:web:eurocomply.io:m:acme-corp",
  "verificationMethod": [{
    "id": "did:web:eurocomply.io:m:acme-corp#key-1",
    "type": "JsonWebKey2020",
    "controller": "did:web:eurocomply.io:m:acme-corp",
    "publicKeyJwk": { ... }
  }],
  "authentication": ["did:web:eurocomply.io:m:acme-corp#key-1"],
  "assertionMethod": ["did:web:eurocomply.io:m:acme-corp#key-1"]
}
```

## Database Schema Updates

```prisma
// Add to Organization
model Organization {
  // ... existing fields
  keyId         String?   // walt.id key reference
  didDocument   Json?     // Cached DID document
}

// Add to Merchant
model Merchant {
  // ... existing fields
  keyId         String?   // walt.id key reference
  didDocument   Json?     // Cached DID document
  kybCredentialId String? // KYB VC reference
  kybCredentialJwt String? // KYB VC JWT
}

// Passport already has credentialId, vcJwt fields
```

## File Changes Summary

### New Files
- `packages/identity/` - Entire new package (8 files)
- `apps/api/src/common/routes/did.ts` - DID document hosting

### Modified Files
- `apps/api/src/modules/product-trust/controllers/passport.controller.ts`
- `apps/api/src/modules/product-trust/services/` - Add dpp.service.ts
- `apps/api/src/modules/merchant-trust/controllers/kyb.controller.ts`
- `apps/api/src/modules/merchant-trust/controllers/trader.controller.ts`
- `apps/api/src/modules/workforce-trust/controllers/credential.controller.ts`
- `apps/api/src/modules/workforce-trust/services/waltid.service.ts` - Delete (use shared)
- `apps/api/src/index.ts` - Add DID routes
- `packages/database/prisma/schema.prisma` - Add key fields

## Execution Order

1. Create `packages/identity/` with all services
2. Update database schema
3. Add DID document hosting routes
4. Update MerchantTrust (DIDs for merchants)
5. Update ProductTrust (DPPs as VCs)
6. Update WorkforceTrust (use shared package)
7. Test end-to-end flow
8. Commit and push

## Success Criteria

- [ ] Merchants get real DIDs with key pairs on creation
- [ ] DPPs are issued as W3C Verifiable Credentials
- [ ] DID documents are publicly resolvable at correct URLs
- [ ] VC verification works without authentication
- [ ] All three modules use the same identity infrastructure
