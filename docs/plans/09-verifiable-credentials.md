# Verifiable Credentials Design

**Status:** Active
**Last Updated:** 2026-01-21

---

## 1. Overview

EuroComply issues Digital Product Passports as **W3C Verifiable Credentials** with **did:key** identifiers, making them portable, tamper-evident, and independent of any platform.

### Why VCs Instead of Database Lookups

| Aspect | Traditional DPP | EuroComply VC-DPP |
|--------|-----------------|-------------------|
| **Tamper Evidence** | None - data can be silently changed | Cryptographic - any change breaks signature |
| **Trust Model** | Trust the database operator | Trust math (cryptographic verification) |
| **Verification** | Requires server connection | Signature offline, revocation online |
| **Portability** | Locked to platform | Supplier owns, can move anywhere |
| **Platform Dependency** | Dies with platform | Signature works forever |

### Core Principles

| Principle | Implementation |
|-----------|----------------|
| **Self-contained** | VC contains ALL DPP data, not references |
| **Portable identity** | did:key - supplier owns their identity |
| **Tamper-evident** | Ed25519 signatures break if data changes |
| **Offline verification** | Signature verification needs no network |
| **Revocation support** | Status List 2021 for invalidating VCs |
| **Industry-agnostic** | No hardcoded fields - structure from taxonomy |

---

## 2. Why did:key

### The Problem with did:web

```
did:web:eurocomply.eu:org:acme-corp
       └── Requires EuroComply to host DID document
       └── If EuroComply stops hosting, verification breaks
       └── Creates platform dependency
```

### The did:key Solution

```
did:key:z6MkhaXgBZDvvvRhta4LjXRJzL...
       └── The public key IS the identifier
       └── No resolution needed
       └── Signature verification works forever, anywhere
       └── Supplier truly owns their identity
```

### How did:key Works

```
┌─────────────────────────────────────────────────────────────────┐
│                        did:key EXPLAINED                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  A did:key is a self-contained identifier:                      │
│                                                                  │
│  did:key:z6MkhaXgBZDvvvRhta4LjXRJzLKNqVj3yQTpCFbRc8GwAdfS      │
│          └───────────────────────────────────────────┘          │
│                          │                                       │
│                          └── This IS the public key              │
│                              (Base58-encoded Ed25519)            │
│                                                                  │
│  To verify a signature:                                         │
│  1. Parse the did:key to extract the public key                 │
│  2. Use the public key to verify the signature                  │
│  3. No network call needed!                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### did:key = Permanent Identity

```
┌─────────────────────────────────────────────────────────────────┐
│                    THE KEY IS THE IDENTITY                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  The key IS the organization's trust anchor.                    │
│  Verifiers learn: "did:key:z6Mk... = ACME Corp"                │
│                                                                  │
│  Changing the key = NEW identity = trust relationship broken    │
│                                                                  │
│  THERE IS NO KEY ROTATION FOR did:key                          │
│  ─────────────────────────────────────                          │
│  • Proactive rotation destroys value, not adds security         │
│  • Ed25519 has no known time-based weaknesses                  │
│  • If key is compromised: revoke all VCs, get NEW identity     │
│                                                                  │
│  KEEP YOUR KEY FOREVER (unless compromised)                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. DID Hierarchy

### Organization vs User DIDs

```
┌─────────────────────────────────────────────────────────────────┐
│                        DID HIERARCHY                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ORGANIZATION DID (did:key:zOrg...)                             │
│  └── Purpose: Issue DPPs (external, public-facing)              │
│  └── Stored: Encrypted in database + AWS KMS backup             │
│  └── Signs: DigitalProductPassport VCs                          │
│                                                                  │
│  USER DIDs (did:key:zUser...)                                   │
│  └── Purpose: Sign product versions (internal chain of custody) │
│  └── Stored: Encrypted in database (per-user keys)              │
│  └── Signs: ProductVersion snapshots on approval/publish        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### What Gets Signed

| Entity | Signed By | DID Type | When |
|--------|-----------|----------|------|
| ProductVersion | User (Editor/Manager) | User DID | On publish/approve |
| DigitalProductPassport | Organization | Org DID | On DPP issuance |
| Attestation | Third-party Contributor | Contributor DID | On attestation submit |

---

## 4. Data Model (MikroORM Entities)

### 4.1 Organization DID Entity

```typescript
import {
  Entity, PrimaryKey, Property, OneToOne, Enum, ManyToOne, Index,
} from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';

export enum DIDStatus {
  ACTIVE = 'ACTIVE',
  COMPROMISED = 'COMPROMISED',
  SUPERSEDED = 'SUPERSEDED',
}

/**
 * Organization DID - the permanent identity for issuing DPPs.
 *
 * CRITICAL: The private key is encrypted at rest. Only the signing
 * service can decrypt it using AWS KMS.
 */
@Entity({ tableName: 'organization_did' })
export class OrganizationDID extends BaseEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv7();

  @OneToOne(() => Organization, { onDelete: 'cascade' })
  organization!: Organization;

  // ─────────────────────────────────────────────────────────────
  // DID IDENTITY
  // ─────────────────────────────────────────────────────────────
  @Property({ length: 255, unique: true })
  did!: string; // did:key:z6Mk...

  @Property({ length: 20 })
  keyType: string = 'Ed25519';

  // ─────────────────────────────────────────────────────────────
  // ENCRYPTED KEY MATERIAL
  // ─────────────────────────────────────────────────────────────
  @Property({ type: 'text' })
  publicKeyJwk!: string; // JWK format (can be public)

  @Property({ type: 'text' })
  encryptedPrivateKey!: string; // Encrypted with AWS KMS

  @Property({ length: 255 })
  kmsKeyArn!: string; // ARN of KMS key used for encryption

  // ─────────────────────────────────────────────────────────────
  // STATUS
  // ─────────────────────────────────────────────────────────────
  @Enum({ items: () => DIDStatus, default: DIDStatus.ACTIVE })
  status!: DIDStatus;

  @Property({ nullable: true })
  compromisedAt?: Date;

  @Property({ nullable: true })
  compromiseReason?: string;

  @ManyToOne(() => OrganizationDID, { nullable: true })
  supersededBy?: OrganizationDID; // Points to new DID if compromised

  // ─────────────────────────────────────────────────────────────
  // AUDIT
  // ─────────────────────────────────────────────────────────────
  @Property()
  createdAt: Date = new Date();

  @Property({ nullable: true })
  lastUsedAt?: Date;

  @Property({ default: 0 })
  signingCount: number = 0; // Total VCs signed
}
```

### 4.2 User DID Entity

```typescript
/**
 * User DID - for internal chain-of-custody signing.
 *
 * Users sign product version approvals, creating an audit trail
 * of who approved what. Less critical than org DID but still encrypted.
 */
@Entity({ tableName: 'user_did' })
export class UserDID extends BaseEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv7();

  @ManyToOne(() => User, { onDelete: 'cascade' })
  user!: User;

  @ManyToOne(() => Organization, { onDelete: 'cascade' })
  organization!: Organization;

  // ─────────────────────────────────────────────────────────────
  // DID IDENTITY
  // ─────────────────────────────────────────────────────────────
  @Property({ length: 255, unique: true })
  did!: string;

  @Property({ length: 20 })
  keyType: string = 'Ed25519';

  @Property({ type: 'text' })
  publicKeyJwk!: string;

  @Property({ type: 'text' })
  encryptedPrivateKey!: string;

  @Property({ length: 255 })
  kmsKeyArn!: string;

  // ─────────────────────────────────────────────────────────────
  // STATUS
  // ─────────────────────────────────────────────────────────────
  @Enum({ items: () => DIDStatus, default: DIDStatus.ACTIVE })
  status!: DIDStatus;

  @Property()
  createdAt: Date = new Date();

  @Property({ nullable: true })
  lastUsedAt?: Date;
}
```

### 4.3 Status List Entity

```typescript
export enum StatusPurpose {
  REVOCATION = 'revocation',
  SUSPENSION = 'suspension',
}

/**
 * Status List 2021 - bitstring for credential revocation.
 *
 * Each organization has one or more status lists. Each DPP gets
 * an index in the bitstring. Setting the bit to 1 revokes the VC.
 */
@Entity({ tableName: 'status_list' })
@Index({ properties: ['organization'] })
export class StatusList extends BaseEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv7();

  @ManyToOne(() => Organization, { onDelete: 'cascade' })
  organization!: Organization;

  // ─────────────────────────────────────────────────────────────
  // STATUS LIST IDENTITY
  // ─────────────────────────────────────────────────────────────
  @Property({ length: 50, unique: true })
  listId!: string; // e.g., "sl_abc123"

  @Property({ length: 500 })
  credentialUrl!: string; // https://api.eurocomply.eu/v1/status/sl_abc123

  @Enum({ items: () => StatusPurpose })
  purpose!: StatusPurpose;

  // ─────────────────────────────────────────────────────────────
  // BITSTRING (compressed)
  // ─────────────────────────────────────────────────────────────
  @Property({ type: 'blob' })
  encodedList!: Buffer; // GZIP-compressed bitstring

  @Property()
  listSize: number = 131072; // 16KB = 131,072 bits (default)

  @Property({ default: 0 })
  nextIndex: number = 0; // Next available index for new VCs

  // ─────────────────────────────────────────────────────────────
  // SIGNED STATUS LIST VC
  // ─────────────────────────────────────────────────────────────
  @Property({ type: 'jsonb', nullable: true })
  statusListCredential?: StatusListCredentialVC; // The signed VC

  @Property({ nullable: true })
  lastSignedAt?: Date;

  // ─────────────────────────────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────────────────────────────
  @Property({ default: false })
  frozen: boolean = false; // True after subscription ends

  @Property()
  createdAt: Date = new Date();

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}

interface StatusListCredentialVC {
  '@context': string[];
  type: string[];
  issuer: string;
  issuanceDate: string;
  credentialSubject: {
    id: string;
    type: string;
    statusPurpose: string;
    encodedList: string; // Base64-encoded GZIP bitstring
  };
  proof: {
    type: string;
    created: string;
    verificationMethod: string;
    proofPurpose: string;
    proofValue: string;
  };
}
```

### 4.4 Issued Credential Metadata

```typescript
/**
 * Tracks metadata about issued VCs (the actual VC data is in dpp_snapshot).
 *
 * This table allows us to:
 * - Find all VCs using a specific status list index
 * - Track signing statistics
 * - Enable bulk revocation by facility, batch, or organization
 */
@Entity({ tableName: 'issued_credential' })
@Index({ properties: ['organization'] })
@Index({ properties: ['statusList', 'statusListIndex'] })
@Index({ properties: ['facilityId'] }) // For facility-based bulk revocation
export class IssuedCredential extends BaseEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv7();

  @ManyToOne(() => Organization, { onDelete: 'cascade' })
  organization!: Organization;

  @ManyToOne(() => DPPSnapshot, { onDelete: 'cascade' })
  dppSnapshot!: DPPSnapshot;

  // ─────────────────────────────────────────────────────────────
  // VC IDENTITY
  // ─────────────────────────────────────────────────────────────
  @Property({ length: 500 })
  credentialId!: string; // urn:uuid:...

  @Property({ length: 255 })
  issuerDid!: string; // Organization's did:key

  // ─────────────────────────────────────────────────────────────
  // STATUS LIST ENTRY
  // ─────────────────────────────────────────────────────────────
  @ManyToOne(() => StatusList)
  statusList!: StatusList;

  @Property()
  statusListIndex!: number;

  @Property({ default: false })
  revoked: boolean = false;

  @Property({ nullable: true })
  revokedAt?: Date;

  @Property({ nullable: true })
  revocationReason?: string;

  // ─────────────────────────────────────────────────────────────
  // DENORMALIZED FOR BULK REVOCATION QUERIES
  // ─────────────────────────────────────────────────────────────
  @Property({ type: 'uuid', nullable: true })
  facilityId?: string; // Origin facility (for CSDDD facility revocation)

  @Property({ type: 'uuid', nullable: true })
  batchId?: string; // Batch (for recall propagation)

  // ─────────────────────────────────────────────────────────────
  // AUDIT
  // ─────────────────────────────────────────────────────────────
  @Property()
  issuedAt: Date = new Date();

  @ManyToOne(() => User, { nullable: true })
  issuedBy?: User;
}
```

---

## 5. Agnostic VC Structure

### The Problem: Industry-Specific "Leaks"

A hardcoded VC structure with fields like `sustainability.carbonFootprint` or `materials[]` assumes textiles. This breaks for:
- **Electronics:** Need `voltage`, `battery_type`, `energy_rating`
- **Furniture:** Need `wood_source`, `fsc_certification`
- **Food:** Need `allergens`, `nutritional_info`, `expiry_date`

### The Solution: Taxonomy-Driven Structure

The VC `credentialSubject` uses generic containers that hold whatever attributes are defined in the `AttributeTemplate` table for that product's category.

```
┌─────────────────────────────────────────────────────────────────┐
│                    AGNOSTIC VC STRUCTURE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TRADITIONAL (Hardcoded):         AGNOSTIC (Taxonomy-Driven):   │
│  ────────────────────────         ──────────────────────────    │
│                                                                  │
│  {                                {                              │
│    "name": "T-Shirt",               "category": "APPAREL.SHIRTS",│
│    "carbonFootprint": 5.2,          "designAttributes": {       │
│    "materials": [...]                 // From AttributeTemplate │
│  }                                    // Whatever fields exist  │
│                                     },                           │
│  ↓                                  "marketingAttributes": {...},│
│  Code must change                   "operationsAttributes": {...}│
│  for each industry               }                               │
│                                     ↓                            │
│                                     Code NEVER changes.          │
│                                     Only data changes.           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.1 Agnostic VC Example (Apparel)

```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    "https://eurocomply.eu/contexts/dpp/v1",
    "https://eurocomply.eu/contexts/categories/apparel/v1"
  ],
  "id": "urn:uuid:a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "type": ["VerifiableCredential", "DigitalProductPassport"],
  "issuer": "did:key:z6MkhaXgBZDvvvRhta4LjXRJzLKNqVj3yQTpCFbRc8GwAdfS",
  "issuanceDate": "2026-01-21T10:30:00Z",

  "credentialSubject": {
    "id": "urn:epc:id:sgtin:5901234.123457.ABC123",
    "type": "DigitalProductPassport",
    "category": "APPAREL.SHIRTS",

    "designAttributes": {
      "physical_weight": { "val": 250, "unit": "g" },
      "material_composition": [
        { "material": "Organic Cotton", "pct": 95 },
        { "material": "Elastane", "pct": 5 }
      ],
      "recycled_content_pct": { "val": 30, "unit": "%" },
      "country_of_origin": "PT"
    },

    "marketingAttributes": {
      "en": {
        "product_name": "Organic Cotton T-Shirt",
        "tagline": "Sustainable comfort for everyday wear.",
        "care_instructions": "Wash at 30°C, do not tumble dry."
      },
      "de": {
        "product_name": "Bio-Baumwoll T-Shirt",
        "tagline": "Nachhaltiger Komfort für jeden Tag."
      }
    },

    "operationsAttributes": {
      "batch_number": "BATCH-2026-001",
      "lot_number": "LOT-A",
      "manufacturing_date": "2026-01-15T08:00:00Z",
      "facility": {
        "publicAlias": "Factory #42 - Portugal",
        "countryCode": "PT"
      },
      "certifications": [
        { "type": "GOTS", "id": "GOTS-12345", "validUntil": "2027-01-15" }
      ]
    }
  },

  "credentialStatus": {
    "id": "https://api.eurocomply.eu/v1/status/sl_abc123#42",
    "type": "StatusList2021Entry",
    "statusPurpose": "revocation",
    "statusListIndex": "42",
    "statusListCredential": "https://api.eurocomply.eu/v1/status/sl_abc123"
  },

  "proof": {
    "type": "Ed25519Signature2020",
    "created": "2026-01-21T10:30:00Z",
    "verificationMethod": "did:key:z6MkhaXgBZDvvvRhta4LjXRJzLKNqVj3yQTpCFbRc8GwAdfS#z6MkhaXgBZDvvvRhta4LjXRJzLKNqVj3yQTpCFbRc8GwAdfS",
    "proofPurpose": "assertionMethod",
    "proofValue": "z3FXQTimwQMHMDxfKvXNyL..."
  }
}
```

### 5.2 Electronics Example (Same Code, Different Data)

```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    "https://eurocomply.eu/contexts/dpp/v1",
    "https://eurocomply.eu/contexts/categories/electronics/v1"
  ],
  "credentialSubject": {
    "id": "urn:epc:id:sgtin:8901234.567890.XYZ789",
    "type": "DigitalProductPassport",
    "category": "ELECTRONICS.POWER_BANKS",

    "designAttributes": {
      "battery_capacity": { "val": 10000, "unit": "mAh" },
      "voltage_input": { "val": 5, "unit": "V" },
      "voltage_output": { "val": 5, "unit": "V" },
      "battery_type": "Li-ion",
      "energy_rating": "A+",
      "contains_hazardous": false
    },

    "marketingAttributes": {
      "en": {
        "product_name": "PowerBank Pro 10000",
        "features": ["Fast charging", "USB-C", "LED indicator"]
      }
    },

    "operationsAttributes": {
      "batch_number": "BATCH-2026-042",
      "lot_number": "LOT-E7",
      "manufacturing_date": "2026-01-10T14:00:00Z",
      "facility": {
        "publicAlias": "Assembly Plant #7 - China",
        "countryCode": "CN"
      }
    }
  }
}
```

### 5.3 Dynamic @context Generation

The `@context` tells semantic web tools how to interpret fields. Generate category-specific contexts:

```typescript
/**
 * Build the @context array based on product category.
 *
 * This ensures VC interoperability with semantic web standards.
 */
function buildContextArray(category: string): string[] {
  const contexts = [
    'https://www.w3.org/2018/credentials/v1',
    'https://eurocomply.eu/contexts/dpp/v1',
  ];

  // Add category-specific context
  if (category) {
    const categorySlug = category.split('.')[0].toLowerCase();
    contexts.push(`https://eurocomply.eu/contexts/categories/${categorySlug}/v1`);
  }

  return contexts;
}

// Examples:
// buildContextArray('APPAREL.SHIRTS') → [..., '.../categories/apparel/v1']
// buildContextArray('ELECTRONICS.POWER_BANKS') → [..., '.../categories/electronics/v1']
```

### 5.4 Design Note: Practical Compromise on operationsAttributes

The `operationsAttributes` section includes some common fields (`batch_number`, `lot_number`, `manufacturing_date`) that apply to 99% of physical goods. This is a **practical compromise**:

| Approach | Coverage | Trade-off |
|----------|----------|-----------|
| **Current (practical)** | Physical goods (ESPR targets) | Simple UI, easy validation |
| **Level 100 agnostic** | All products incl. software | Fully dynamic, complex UI |

For software DPPs (if EU extends scope), a future v2 schema could make `operationsAttributes` fully dynamic with fields like `commit_hash`, `release_tag`, `build_pipeline_id`.

---

## 6. Status List 2021 (Revocation)

### Why Revocation

VCs verify offline forever. But what if:
- Product is recalled?
- Certification expires?
- Facility found non-compliant (CSDDD)?
- Key is compromised?

**Status List 2021** allows invalidating VCs without breaking cryptographic integrity.

### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    STATUS LIST 2021                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Each VC gets a unique index in a bitstring:                    │
│                                                                  │
│  Status List: [0, 0, 0, 0, 0, ...]                              │
│                ↑  ↑  ↑                                          │
│                │  │  └── VC 3: valid (bit = 0)                  │
│                │  └───── VC 2: valid (bit = 0)                  │
│                └──────── VC 1: valid (bit = 0)                  │
│                                                                  │
│  To revoke VC 2, set bit to 1:                                  │
│                                                                  │
│  Status List: [0, 1, 0, 0, 0, ...]                              │
│                   ↑                                              │
│                   └── VC 2: REVOKED                             │
│                                                                  │
│  VERIFICATION:                                                   │
│  1. Verify signature (offline)                                  │
│  2. Fetch status list (requires network)                        │
│  3. Check bit at statusListIndex                                │
│  4. If bit = 1, credential is revoked                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Status List Hosting

| Scenario | Status List | Who Updates |
|----------|-------------|-------------|
| Active subscription | EuroComply hosts | EuroComply |
| After cancellation | EuroComply hosts (frozen) | No updates (10-year hosting included) |
| Self-managed | Customer's domain | Customer |

**After subscription ends:**
- Status list remains hosted for 10 years (cost included in DPP price)
- List is frozen (no new revocations possible)
- Existing revocations preserved
- Customer can export and self-host for full control

---

## 7. VC Service Implementation

### 7.1 DID Service

```typescript
import { generateKeyPair, sign, verify } from 'crypto';
import * as base58 from 'bs58';
import { EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';

@Injectable()
export class DIDService {
  constructor(
    private readonly em: EntityManager,
    private readonly kmsClient: KMSClient,
  ) {}

  /**
   * Generate a new did:key for an organization.
   * Called once during organization onboarding.
   */
  async createOrganizationDID(organizationId: string): Promise<OrganizationDID> {
    // 1. Generate Ed25519 keypair
    const { publicKey, privateKey } = generateKeyPair('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'jwk' },
      privateKeyEncoding: { type: 'pkcs8', format: 'jwk' },
    });

    // 2. Encode public key as did:key
    const publicKeyBytes = this.jwkToBytes(publicKey);
    const multicodecPrefix = Buffer.from([0xed, 0x01]); // Ed25519 multicodec
    const multibase = 'z' + base58.encode(Buffer.concat([multicodecPrefix, publicKeyBytes]));
    const did = `did:key:${multibase}`;

    // 3. Encrypt private key with KMS
    const kmsKeyArn = process.env.VC_SIGNING_KMS_KEY_ARN!;
    const encryptedPrivateKey = await this.encryptWithKMS(
      JSON.stringify(privateKey),
      kmsKeyArn,
    );

    // 4. Store in database
    const org = await this.em.findOneOrFail(Organization, organizationId);
    const orgDid = this.em.create(OrganizationDID, {
      organization: org,
      did,
      publicKeyJwk: JSON.stringify(publicKey),
      encryptedPrivateKey,
      kmsKeyArn,
    });

    this.em.persist(orgDid);
    await this.em.flush();

    return orgDid;
  }

  /**
   * Get the organization's did:key.
   */
  async getOrganizationDID(organizationId: string): Promise<string> {
    const orgDid = await this.em.findOneOrFail(OrganizationDID, {
      organization: organizationId,
      status: DIDStatus.ACTIVE,
    });
    return orgDid.did;
  }

  /**
   * Sign a hash with the organization's private key.
   * Returns a JWS (JSON Web Signature).
   */
  async signWithOrganizationDID(
    organizationId: string,
    dataHash: string,
  ): Promise<string> {
    const orgDid = await this.em.findOneOrFail(OrganizationDID, {
      organization: organizationId,
      status: DIDStatus.ACTIVE,
    });

    // Decrypt private key
    const privateKeyJwk = await this.decryptWithKMS(
      orgDid.encryptedPrivateKey,
      orgDid.kmsKeyArn,
    );

    // Sign the hash
    const privateKey = JSON.parse(privateKeyJwk);
    const signature = sign(null, Buffer.from(dataHash, 'hex'), {
      key: privateKey,
      format: 'jwk',
    });

    // Build JWS
    const header = { alg: 'EdDSA', kid: `${orgDid.did}#${orgDid.did.split(':')[2]}` };
    const jws = [
      base64url(JSON.stringify(header)),
      base64url(dataHash),
      base64url(signature),
    ].join('.');

    // Update usage statistics
    await this.em.nativeUpdate(OrganizationDID, { id: orgDid.id }, {
      lastUsedAt: new Date(),
      signingCount: orgDid.signingCount + 1,
    });

    return jws;
  }

  /**
   * Verify a signature using a did:key.
   * This can be done OFFLINE - no database lookup needed.
   */
  verifySignature(did: string, dataHash: string, jws: string): boolean {
    // 1. Parse did:key to extract public key
    const multibase = did.split(':')[2];
    const decoded = base58.decode(multibase.slice(1)); // Remove 'z' prefix
    const publicKeyBytes = decoded.slice(2); // Remove multicodec prefix

    // 2. Parse JWS
    const [, , signatureB64] = jws.split('.');
    const signature = Buffer.from(signatureB64, 'base64url');

    // 3. Verify signature
    const publicKeyJwk = this.bytesToJwk(publicKeyBytes);
    return verify(null, Buffer.from(dataHash, 'hex'), {
      key: publicKeyJwk,
      format: 'jwk',
    }, signature);
  }

  private async encryptWithKMS(plaintext: string, keyArn: string): Promise<string> {
    const command = new EncryptCommand({
      KeyId: keyArn,
      Plaintext: Buffer.from(plaintext),
    });
    const response = await this.kmsClient.send(command);
    return Buffer.from(response.CiphertextBlob!).toString('base64');
  }

  private async decryptWithKMS(ciphertext: string, keyArn: string): Promise<string> {
    const command = new DecryptCommand({
      KeyId: keyArn,
      CiphertextBlob: Buffer.from(ciphertext, 'base64'),
    });
    const response = await this.kmsClient.send(command);
    return Buffer.from(response.Plaintext!).toString();
  }

  private jwkToBytes(jwk: JsonWebKey): Buffer {
    return Buffer.from(jwk.x!, 'base64url');
  }

  private bytesToJwk(bytes: Buffer): JsonWebKey {
    return { kty: 'OKP', crv: 'Ed25519', x: bytes.toString('base64url') };
  }
}
```

### 7.2 Agnostic VC Issuance Service

```typescript
import canonicalize from 'canonicalize'; // RFC 8785

@Injectable()
export class VCIssuanceService {
  constructor(
    private readonly em: EntityManager,
    private readonly didService: DIDService,
    private readonly statusListService: StatusListService,
  ) {}

  /**
   * Issue a Verifiable Credential for a DPP snapshot.
   *
   * AGNOSTIC: This service does NOT know what fields exist.
   * It simply maps the pre-validated snapshot data into the VC.
   */
  async issueCredential(dppSnapshotId: string): Promise<VerifiableCredential> {
    const snapshot = await this.em.findOneOrFail(DPPSnapshot, dppSnapshotId, {
      populate: ['organization', 'serial', 'serial.batch', 'serial.batch.facility'],
    });

    // 1. Get organization DID
    const issuerDid = await this.didService.getOrganizationDID(snapshot.organization.id);

    // 2. Allocate status list index
    const { statusList, index } = await this.statusListService.allocateIndex(
      snapshot.organization.id,
    );

    // 3. Build AGNOSTIC credential subject (no hardcoded industry fields)
    const credentialSubject = this.buildAgnosticCredentialSubject(snapshot);

    // 4. Build dynamic @context based on category
    const contexts = this.buildContextArray(snapshot.designData.category);

    // 5. Build unsigned credential
    const credentialId = `urn:uuid:${uuidv7()}`;
    const issuanceDate = new Date().toISOString();

    const unsignedCredential = {
      '@context': contexts,
      id: credentialId,
      type: ['VerifiableCredential', 'DigitalProductPassport'],
      issuer: issuerDid,
      issuanceDate,
      credentialSubject,
      credentialStatus: {
        id: `${statusList.credentialUrl}#${index}`,
        type: 'StatusList2021Entry',
        statusPurpose: 'revocation',
        statusListIndex: index.toString(),
        statusListCredential: statusList.credentialUrl,
      },
    };

    // 6. Sign credential (RFC 8785 canonicalization - CRITICAL)
    const canonicalJson = canonicalize(unsignedCredential);
    if (!canonicalJson) {
      throw new Error('Canonicalization failed');
    }
    const dataHash = sha256(canonicalJson);
    const jws = await this.didService.signWithOrganizationDID(
      snapshot.organization.id,
      dataHash,
    );

    // 7. Build proof
    const proof = {
      type: 'Ed25519Signature2020',
      created: issuanceDate,
      verificationMethod: `${issuerDid}#${issuerDid.split(':')[2]}`,
      proofPurpose: 'assertionMethod',
      proofValue: jws,
    };

    const signedCredential: VerifiableCredential = {
      ...unsignedCredential,
      proof,
    };

    // 8. Record issuance with denormalized fields for bulk revocation
    this.em.persist(this.em.create(IssuedCredential, {
      organization: snapshot.organization,
      dppSnapshot: snapshot,
      credentialId,
      issuerDid,
      statusList,
      statusListIndex: index,
      facilityId: snapshot.operationsData.originFacility?.id,
      batchId: snapshot.serial.batch?.id,
    }));

    await this.em.flush();

    return signedCredential;
  }

  /**
   * Build AGNOSTIC credential subject from snapshot.
   *
   * This method does NOT hardcode any industry-specific fields.
   * designAttributes and marketingAttributes come directly from
   * the taxonomy-driven snapshot data.
   */
  private buildAgnosticCredentialSubject(snapshot: DPPSnapshot): CredentialSubject {
    return {
      id: `urn:epc:id:sgtin:${snapshot.gtin}.${snapshot.serialNumber}`,
      type: 'DigitalProductPassport',
      category: snapshot.designData.category,

      // Design attributes: Whatever was stored in the snapshot
      // (comes from AttributeTemplate-based ProductAttributeValue)
      designAttributes: snapshot.designData.specifications,

      // Marketing attributes: Localized content by locale
      // (comes from AttributeTemplate-based MarketingAttributeValue)
      marketingAttributes: this.buildMarketingAttributes(snapshot.marketingData),

      // Operations attributes: Batch, facility, certifications
      // (practical compromise: common fields for physical goods)
      operationsAttributes: {
        batch_number: snapshot.operationsData.batchNumber,
        lot_number: snapshot.operationsData.lotNumber,
        manufacturing_date: snapshot.operationsData.productionDate,
        facility: {
          publicAlias: snapshot.operationsData.originFacility.publicAlias,
          countryCode: snapshot.operationsData.originFacility.countryCode,
        },
        certifications: snapshot.operationsData.certifications,
        notary_chain_hash: snapshot.operationsData.notaryChainSummary.chainHash,
      },
    };
  }

  /**
   * Build marketing attributes grouped by locale.
   */
  private buildMarketingAttributes(
    marketingData: MarketingSnapshotData,
  ): Record<string, Record<string, unknown>> {
    const result: Record<string, Record<string, unknown>> = {};

    for (const locale of marketingData.locales) {
      result[locale.locale] = {
        product_name: locale.productName,
        tagline: locale.tagline,
        description: locale.description,
        features: locale.features,
        sustainability_claims: locale.sustainabilityClaims,
      };
    }

    return result;
  }

  /**
   * Build dynamic @context array based on product category.
   */
  private buildContextArray(category: string): string[] {
    const contexts = [
      'https://www.w3.org/2018/credentials/v1',
      'https://eurocomply.eu/contexts/dpp/v1',
    ];

    if (category) {
      const categorySlug = category.split('.')[0].toLowerCase();
      contexts.push(`https://eurocomply.eu/contexts/categories/${categorySlug}/v1`);
    }

    return contexts;
  }
}

interface CredentialSubject {
  id: string;
  type: string;
  category: string;
  designAttributes: Record<string, unknown>;
  marketingAttributes: Record<string, Record<string, unknown>>;
  operationsAttributes: {
    batch_number: string;
    lot_number?: string;
    manufacturing_date: string;
    facility: {
      publicAlias: string;
      countryCode: string;
    };
    certifications: unknown[];
    notary_chain_hash: string;
  };
}
```

### 7.3 Status List Service with Bulk Revocation

```typescript
import * as zlib from 'zlib';

@Injectable()
export class StatusListService {
  constructor(
    private readonly em: EntityManager,
    private readonly didService: DIDService,
  ) {}

  /**
   * Allocate the next available index in a status list.
   */
  async allocateIndex(organizationId: string): Promise<{ statusList: StatusList; index: number }> {
    let statusList = await this.em.findOne(StatusList, {
      organization: organizationId,
      frozen: false,
    });

    if (!statusList || statusList.nextIndex >= statusList.listSize) {
      statusList = await this.createStatusList(organizationId);
    }

    const index = statusList.nextIndex;
    statusList.nextIndex++;
    await this.em.flush();

    return { statusList, index };
  }

  /**
   * Revoke a single credential.
   */
  async revokeCredential(credentialId: string, reason: string): Promise<void> {
    const issued = await this.em.findOneOrFail(IssuedCredential, {
      credentialId,
    }, { populate: ['statusList'] });

    if (issued.revoked) return;

    await this.setBit(issued.statusList, issued.statusListIndex, true);

    issued.revoked = true;
    issued.revokedAt = new Date();
    issued.revocationReason = reason;

    await this.signStatusList(issued.statusList);
    await this.em.flush();
  }

  /**
   * Bulk revoke all credentials from a specific FACILITY.
   *
   * Use case: CSDDD audit finds a facility non-compliant.
   * All DPPs sourced from that facility must be revoked.
   */
  async bulkRevokeByFacility(
    facilityId: string,
    reason: string,
  ): Promise<BulkRevocationResult> {
    // 1. Find all credentials linked to this facility
    const affectedCredentials = await this.em.find(IssuedCredential, {
      facilityId,
      revoked: false,
    }, { populate: ['statusList'] });

    if (affectedCredentials.length === 0) {
      return { revokedCount: 0, statusListsUpdated: 0 };
    }

    // 2. Group by status list for efficient batch updates
    const byStatusList = new Map<string, IssuedCredential[]>();
    for (const cred of affectedCredentials) {
      const key = cred.statusList.id;
      if (!byStatusList.has(key)) {
        byStatusList.set(key, []);
      }
      byStatusList.get(key)!.push(cred);
    }

    // 3. Update each status list's bitstring
    for (const [, credentials] of byStatusList) {
      const statusList = credentials[0].statusList;

      // Decompress bitstring
      const decompressed = zlib.gunzipSync(statusList.encodedList);

      // Set all affected bits
      for (const cred of credentials) {
        const byteIndex = Math.floor(cred.statusListIndex / 8);
        const bitIndex = cred.statusListIndex % 8;
        decompressed[byteIndex] |= (1 << (7 - bitIndex));
      }

      // Recompress
      statusList.encodedList = zlib.gzipSync(decompressed);

      // Re-sign the status list
      await this.signStatusList(statusList);
    }

    // 4. Bulk update credential records (set-based SQL)
    await this.em.nativeUpdate(IssuedCredential, {
      facilityId,
      revoked: false,
    }, {
      revoked: true,
      revokedAt: new Date(),
      revocationReason: `Facility non-compliance: ${reason}`,
    });

    await this.em.flush();

    return {
      revokedCount: affectedCredentials.length,
      statusListsUpdated: byStatusList.size,
    };
  }

  /**
   * Bulk revoke all credentials from a specific BATCH.
   *
   * Use case: Product recall affects a specific batch.
   */
  async bulkRevokeByBatch(batchId: string, reason: string): Promise<BulkRevocationResult> {
    const affectedCredentials = await this.em.find(IssuedCredential, {
      batchId,
      revoked: false,
    }, { populate: ['statusList'] });

    if (affectedCredentials.length === 0) {
      return { revokedCount: 0, statusListsUpdated: 0 };
    }

    // Same pattern as facility revocation
    const byStatusList = new Map<string, IssuedCredential[]>();
    for (const cred of affectedCredentials) {
      const key = cred.statusList.id;
      if (!byStatusList.has(key)) {
        byStatusList.set(key, []);
      }
      byStatusList.get(key)!.push(cred);
    }

    for (const [, credentials] of byStatusList) {
      const statusList = credentials[0].statusList;
      const decompressed = zlib.gunzipSync(statusList.encodedList);

      for (const cred of credentials) {
        const byteIndex = Math.floor(cred.statusListIndex / 8);
        const bitIndex = cred.statusListIndex % 8;
        decompressed[byteIndex] |= (1 << (7 - bitIndex));
      }

      statusList.encodedList = zlib.gzipSync(decompressed);
      await this.signStatusList(statusList);
    }

    await this.em.nativeUpdate(IssuedCredential, {
      batchId,
      revoked: false,
    }, {
      revoked: true,
      revokedAt: new Date(),
      revocationReason: `Batch recall: ${reason}`,
    });

    await this.em.flush();

    return {
      revokedCount: affectedCredentials.length,
      statusListsUpdated: byStatusList.size,
    };
  }

  /**
   * Bulk revoke ALL credentials for an organization (key compromise).
   */
  async bulkRevokeByOrganization(
    organizationId: string,
    reason: string,
  ): Promise<BulkRevocationResult> {
    const statusLists = await this.em.find(StatusList, {
      organization: organizationId,
      frozen: false,
    });

    let revokedCount = 0;

    for (const statusList of statusLists) {
      // Set ALL bits to 1 (total revocation)
      const decompressed = zlib.gunzipSync(statusList.encodedList);
      const allOnes = Buffer.alloc(decompressed.length, 0xFF);
      statusList.encodedList = zlib.gzipSync(allOnes);

      const count = await this.em.count(IssuedCredential, {
        statusList: statusList.id,
        revoked: false,
      });
      revokedCount += count;

      await this.signStatusList(statusList);
    }

    // Bulk mark all as revoked
    await this.em.nativeUpdate(IssuedCredential, {
      organization: organizationId,
      revoked: false,
    }, {
      revoked: true,
      revokedAt: new Date(),
      revocationReason: reason,
    });

    await this.em.flush();

    return {
      revokedCount,
      statusListsUpdated: statusLists.length,
    };
  }

  private async createStatusList(organizationId: string): Promise<StatusList> {
    const org = await this.em.findOneOrFail(Organization, organizationId);
    const listId = `sl_${uuidv7().slice(0, 8)}`;

    const listSize = 131072; // 16KB = 131,072 bits
    const emptyBitstring = Buffer.alloc(Math.ceil(listSize / 8), 0);
    const encodedList = zlib.gzipSync(emptyBitstring);

    const statusList = this.em.create(StatusList, {
      organization: org,
      listId,
      credentialUrl: `https://api.eurocomply.eu/v1/status/${listId}`,
      purpose: StatusPurpose.REVOCATION,
      encodedList,
      listSize,
    });

    this.em.persist(statusList);
    return statusList;
  }

  private async setBit(statusList: StatusList, index: number, value: boolean): Promise<void> {
    const decompressed = zlib.gunzipSync(statusList.encodedList);
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;

    if (value) {
      decompressed[byteIndex] |= (1 << (7 - bitIndex));
    } else {
      decompressed[byteIndex] &= ~(1 << (7 - bitIndex));
    }

    statusList.encodedList = zlib.gzipSync(decompressed);
  }

  private async signStatusList(statusList: StatusList): Promise<void> {
    const encoded = statusList.encodedList.toString('base64');
    const issuerDid = await this.didService.getOrganizationDID(statusList.organization.id);

    const statusListVc = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://w3id.org/vc/status-list/2021/v1',
      ],
      id: statusList.credentialUrl,
      type: ['VerifiableCredential', 'StatusList2021Credential'],
      issuer: issuerDid,
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: `${statusList.credentialUrl}#list`,
        type: 'StatusList2021',
        statusPurpose: statusList.purpose,
        encodedList: encoded,
      },
    };

    statusList.statusListCredential = statusListVc as StatusListCredentialVC;
    statusList.lastSignedAt = new Date();
  }
}

interface BulkRevocationResult {
  revokedCount: number;
  statusListsUpdated: number;
}
```

---

## 8. Key Protection

Since the key is permanent, **protect it well**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    KEY PROTECTION                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STORAGE:                                                       │
│  • Database column: encryptedPrivateKey (AES-256-GCM via KMS)  │
│  • Encrypted with AWS KMS (envelope encryption)                │
│  • KMS key in separate AWS account for isolation               │
│                                                                  │
│  ACCESS:                                                        │
│  • Signing requires MANAGER authority in Compliance workspace  │
│  • All signing operations logged to audit trail                │
│  • Rate limiting on signing API                                │
│                                                                  │
│  BACKUP:                                                        │
│  • Encrypted backup in separate AWS region                     │
│  • Recovery requires multi-party authorization (Shamir)        │
│  • Tested quarterly                                             │
│                                                                  │
│  MONITORING:                                                    │
│  • CloudWatch alerts on unusual signing activity               │
│  • Anomaly detection: signing volume, time patterns            │
│  • PagerDuty integration for compromise alerts                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Compromise Response

If the private key is compromised, you **must** get a new identity:

```
┌─────────────────────────────────────────────────────────────────┐
│                    KEY COMPROMISE RESPONSE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TIMELINE:                                                      │
│  ─────────                                                      │
│  < 15 min: Disable compromised key, trigger alert              │
│  < 30 min: Bulk-revoke all VCs signed with old key            │
│  < 2 hours: Generate new keypair (new did:key)                 │
│  < 24 hours: Re-issue all affected DPPs with new key          │
│                                                                  │
│  PROCESS:                                                       │
│  1. REVOKE - Set all bits in all status lists                  │
│  2. MARK - Set old DID status to COMPROMISED                   │
│  3. NEW KEY - Generate new Ed25519 keypair (new did:key)       │
│  4. RE-ISSUE - Bulk re-issue all affected DPPs                 │
│  5. NOTIFY - Alert supply chain partners of new DID            │
│                                                                  │
│  Note: This is the ONLY reason to get a new key                │
│  (other than algorithm obsolescence decades away)              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. Verification Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    VERIFICATION FLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Step 1: SIGNATURE VERIFICATION (offline)                       │
│  ─────────────────────────────────────────                      │
│  • Parse did:key from issuer field                             │
│  • Extract public key (embedded in did:key)                    │
│  • Canonicalize VC with RFC 8785 (CRITICAL)                    │
│  • Verify Ed25519 signature                                    │
│  • Result: Signature valid/invalid                             │
│                                                                  │
│  Step 2: REVOCATION CHECK (requires network)                   │
│  ──────────────────────────────────────────                    │
│  • Fetch status list from credentialStatus URL                 │
│  • Decompress and decode bitstring                             │
│  • Check bit at statusListIndex                                │
│  • Result: Valid / Revoked                                     │
│                                                                  │
│  VERIFICATION SCENARIOS:                                        │
│  ──────────────────────                                        │
│  | Signature | Status List | Result         |                  │
│  |-----------|-------------|----------------|                  │
│  | Valid     | Bit = 0     | VALID          |                  │
│  | Valid     | Bit = 1     | REVOKED        |                  │
│  | Valid     | Unavailable | SIGNATURE OK*  |                  │
│  | Invalid   | Any         | INVALID        |                  │
│                                                                  │
│  *Verifier decides policy for unavailable status list          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Verification Service

```typescript
import canonicalize from 'canonicalize'; // RFC 8785

@Injectable()
export class VCVerificationService {
  constructor(private readonly didService: DIDService) {}

  /**
   * Verify a Verifiable Credential.
   */
  async verify(credential: VerifiableCredential): Promise<VerificationResult> {
    // 1. Verify signature (offline)
    const signatureResult = await this.verifySignature(credential);

    if (!signatureResult.valid) {
      return {
        valid: false,
        signatureValid: false,
        revocationChecked: false,
        error: signatureResult.error,
      };
    }

    // 2. Check revocation status (requires network)
    let revocationResult: { revoked: boolean };
    try {
      revocationResult = await this.checkRevocation(credential.credentialStatus);
    } catch {
      return {
        valid: true, // Signature valid, revocation unknown
        signatureValid: true,
        revocationChecked: false,
        warning: 'Status list unavailable',
      };
    }

    return {
      valid: !revocationResult.revoked,
      signatureValid: true,
      revocationChecked: true,
      revoked: revocationResult.revoked,
    };
  }

  private async verifySignature(credential: VerifiableCredential): Promise<{ valid: boolean; error?: string }> {
    const issuerDid = credential.issuer;

    // Canonicalize and hash (same as issuance - RFC 8785 CRITICAL)
    const { proof, ...unsignedCredential } = credential;
    const canonicalJson = canonicalize(unsignedCredential);
    if (!canonicalJson) {
      return { valid: false, error: 'Canonicalization failed' };
    }
    const dataHash = sha256(canonicalJson);

    // Verify using DID service (offline - no DB lookup)
    const valid = this.didService.verifySignature(
      issuerDid,
      dataHash,
      proof.proofValue,
    );

    return { valid };
  }

  private async checkRevocation(credentialStatus: CredentialStatus): Promise<{ revoked: boolean }> {
    const response = await fetch(credentialStatus.statusListCredential);
    const statusListVc = await response.json();

    // Decode bitstring
    const encoded = statusListVc.credentialSubject.encodedList;
    const compressed = Buffer.from(encoded, 'base64');
    const bitstring = zlib.gunzipSync(compressed);

    // Check bit at index
    const index = parseInt(credentialStatus.statusListIndex, 10);
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    const revoked = (bitstring[byteIndex] & (1 << (7 - bitIndex))) !== 0;

    return { revoked };
  }
}
```

---

## 11. Export & Portability

### One-Click Export Package

```
dpp-export-{org-id}.zip
├── credentials/
│   ├── dpp-001.vc.json     (signed VC with ALL data)
│   ├── dpp-002.vc.json
│   └── ...
├── identity/
│   ├── did.json            (DID document)
│   └── private-key.jwk     (for future signing - ENCRYPTED)
├── status-list/
│   └── status-list.vc.json (current revocation state)
├── contexts/
│   └── category-contexts/  (custom @context definitions)
├── images/
│   └── ...
├── viewer.html             (offline viewer)
└── manifest.json           (GTIN → VC mapping)
```

### What Organizations Can Do After Export

| Action | Description |
|--------|-------------|
| **Self-host** | Put VCs on their own server |
| **Use another provider** | Import into any VC-compatible platform |
| **Continue signing** | Use exported private key to issue new VCs |
| **Manage revocations** | Host their own status list |

---

## 12. API Endpoints

### DID Management

```
POST   /api/v1/identity/organization/did          # Create org DID (onboarding)
GET    /api/v1/identity/organization/did          # Get current org DID
POST   /api/v1/identity/user/did                  # Create user DID
GET    /api/v1/identity/user/did                  # Get current user DID
```

### VC Operations

```
POST   /api/v1/credentials/issue                  # Issue VC for DPP snapshot
GET    /api/v1/credentials/:id                    # Get VC by ID
POST   /api/v1/credentials/:id/revoke             # Revoke a credential
POST   /api/v1/credentials/verify                 # Verify a VC
```

### Bulk Revocation

```
POST   /api/v1/credentials/revoke/facility/:id    # Revoke all VCs from facility
POST   /api/v1/credentials/revoke/batch/:id       # Revoke all VCs from batch
POST   /api/v1/credentials/revoke/organization    # Revoke ALL VCs (key compromise)
```

### Status List

```
GET    /api/v1/status/:listId                     # Public status list VC
GET    /api/v1/status/:listId/raw                 # Raw bitstring (debugging)
```

### Export

```
POST   /api/v1/export/package                     # Generate export package
GET    /api/v1/export/package/:id                 # Download export package
```

---

## 13. Related Documents

| Document | Purpose |
|----------|---------|
| [Architecture](./01-architecture.md) | System architecture |
| [Security](./03-security.md) | Key management, encryption |
| [Design Workspace](./05-design-workspace.md) | Taxonomy-driven attributes |
| [Compliance Workspace](./08-compliance-workspace.md) | DPP snapshot integration |
| [Business Model](./00-business-model.md) | DPP pricing (includes 10-year hosting) |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-21 | Consolidated from Prisma design, converted to MikroORM entities |
| 2.1 | 2026-01-21 | Made VC structure agnostic (taxonomy-driven designAttributes/marketingAttributes), added dynamic @context, added facility-based bulk revocation for CSDDD compliance |
