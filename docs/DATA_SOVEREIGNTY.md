# Data Sovereignty Architecture

## The Problem

EuroComply promises portability, but storing all DPP data centrally creates:
- Perceived vendor lock-in ("what if you go out of business?")
- Data residency concerns ("I need data in my country")
- Control anxiety ("can I keep a copy on my own servers?")

## The Good News: We Already Solve This

Our existing architecture (W3C VCs + did:key) **already enables complete data sovereignty**:

```
┌─────────────────────────────────────────────────────────────────────┐
│  WHAT CUSTOMERS GET TODAY (but don't realize)                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ✅ Verifiable Credentials (W3C standard)                          │
│     → Signed, tamper-evident, works anywhere                        │
│                                                                     │
│  ✅ did:key Identity (self-contained)                               │
│     → No EuroComply dependency for verification                     │
│     → Public key IS the identifier                                  │
│                                                                     │
│  ✅ Full Export                                                     │
│     → Download VCs + private keys anytime                           │
│     → Host anywhere, verify anywhere                                │
│                                                                     │
│  ✅ Offline Verification                                            │
│     → VCs work forever without EuroComply                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**The opportunity**: Make this visible and easy.

---

## Options Analyzed

### ❌ Option 1: Container-per-Customer

Deploy dedicated infrastructure for each paying customer.

```
Customer pays → We spin up container → Customer owns infrastructure
```

**Why NOT for SMEs:**
- Requires DevOps knowledge (defeats "no IT team" promise)
- Hidden costs: Customer manages updates, backups, scaling
- Support burden exceeds revenue at SME price points
- Typical cost: €50-110/month + customer labor ≈ same as SaaS

**Verdict**: Only viable for Enterprise (€599/mo minimum)

---

### ⚠️ Option 2: Decentralized Storage (IPFS/Arweave)

Store VCs on decentralized networks instead of EuroComply servers.

```
┌─────────────────────────────────────────────────────────────────────┐
│  IPFS Model                                                         │
├─────────────────────────────────────────────────────────────────────┤
│  • VCs pinned to IPFS via Pinata/Web3.storage                       │
│  • Content-addressed (cryptographic hash = identifier)              │
│  • Requires ongoing pinning ($20-50/month)                          │
│  • Data survives if EuroComply disappears                           │
│                                                                     │
│  Cost: EuroComply €149/mo + Pinning $50/mo = €199/mo total          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Arweave Model                                                      │
├─────────────────────────────────────────────────────────────────────┤
│  • One-time permanent storage (~$0.007/KB)                          │
│  • 200-year guarantee                                               │
│  • No recurring costs                                               │
│  • CANNOT delete (GDPR conflict)                                    │
│                                                                     │
│  Cost for 500 DPPs: ~$350 one-time                                  │
└─────────────────────────────────────────────────────────────────────┘
```

**Verdict**: Good as **add-on** for backup/archival, not primary storage

---

### ✅ Option 3: Sovereign Tier (VC-Only Model) - RECOMMENDED

EuroComply handles VC issuance only. Customer hosts their own DPP data.

```
┌─────────────────────────────────────────────────────────────────────┐
│  SOVEREIGN TIER ARCHITECTURE                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐      ┌─────────────────┐                       │
│  │  EuroComply     │      │  Customer's     │                       │
│  │  (VC Issuer)    │      │  Storage        │                       │
│  │                 │      │  (S3/GitHub)    │                       │
│  │  • did:key mgmt │      │                 │                       │
│  │  • VC signing   │      │  • DPP JSON     │                       │
│  │  • Templates    │      │  • Images       │                       │
│  │  • Compliance   │      │  • Metadata     │                       │
│  └────────┬────────┘      └────────┬────────┘                       │
│           │                        │                                │
│           └────────────┬───────────┘                                │
│                        │                                            │
│                        ▼                                            │
│               ┌─────────────────┐                                   │
│               │   QR Code       │                                   │
│               │   Points to     │                                   │
│               │   Customer URL  │                                   │
│               └─────────────────┘                                   │
│                                                                     │
│  Customer controls:                                                 │
│  • Where data is hosted (S3, GitHub Pages, Netlify)                │
│  • Data residency (any region)                                      │
│  • Backup policy                                                    │
│  • Access logs                                                      │
│                                                                     │
│  EuroComply provides:                                               │
│  • VC issuance (cryptographic signing)                              │
│  • DPP templates & compliance validation                            │
│  • Export in standard formats                                       │
│  • Verification endpoint (optional)                                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Why this works for SMEs:**
- Simple: Upload JSON to S3/GitHub Pages (no DevOps)
- Cheap: S3 static hosting ~$5-15/month
- Portable: Customer owns data, can switch hosts anytime
- Compliant: ESPR-ready (customer controls retention)

---

### ✅ Option 4: Hybrid Model (BYOS) - RECOMMENDED

Customer brings their own storage (S3 bucket). We manage the app.

```
┌─────────────────────────────────────────────────────────────────────┐
│  BYOS (Bring Your Own Storage) ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │                    EuroComply SaaS                       │        │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │        │
│  │  │   Creator   │  │   VC        │  │   Export    │      │        │
│  │  │   Studio    │  │   Issuer    │  │   Engine    │      │        │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘      │        │
│  │         │                │                │              │        │
│  │         └────────────────┼────────────────┘              │        │
│  │                          │                               │        │
│  │                          ▼                               │        │
│  │               ┌─────────────────┐                        │        │
│  │               │ Storage Adapter │                        │        │
│  │               │ (pluggable)     │                        │        │
│  │               └────────┬────────┘                        │        │
│  └────────────────────────┼─────────────────────────────────┘        │
│                           │                                          │
│           ┌───────────────┼───────────────┐                          │
│           ▼               ▼               ▼                          │
│    ┌──────────┐    ┌──────────┐    ┌──────────┐                      │
│    │ Managed  │    │ Customer │    │ IPFS     │                      │
│    │ (default)│    │ S3 Bucket│    │ Pinning  │                      │
│    └──────────┘    └──────────┘    └──────────┘                      │
│                                                                      │
│  Customer chooses where data lives:                                  │
│  • Managed (EuroComply servers) - default                            │
│  • BYOS (their S3/Azure/GCS) - full control                         │
│  • Decentralized (IPFS) - permanence                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Recommended Pricing Structure

```
┌────────────────────────────────────┬─────────┬────────────────────────┐
│ Tier                               │ Price   │ Data Location          │
├────────────────────────────────────┼─────────┼────────────────────────┤
│ MANAGED TIERS                      │         │                        │
├────────────────────────────────────┼─────────┼────────────────────────┤
│ Starter                            │ €49/mo  │ EuroComply (managed)   │
│ Growth                             │ €149/mo │ EuroComply (managed)   │
│ Pro                                │ €399/mo │ EuroComply (managed)   │
├────────────────────────────────────┼─────────┼────────────────────────┤
│ SOVEREIGN TIERS                    │         │                        │
├────────────────────────────────────┼─────────┼────────────────────────┤
│ Sovereign (VC-only)                │ €99/mo  │ Customer (S3/GitHub)   │
│ Sovereign BYOS (S3 adapter)        │ €149/mo │ Customer S3 bucket     │
│ Sovereign Pro (multi-cloud)        │ €249/mo │ Customer choice        │
├────────────────────────────────────┼─────────┼────────────────────────┤
│ ADD-ONS                            │         │                        │
├────────────────────────────────────┼─────────┼────────────────────────┤
│ IPFS Backup (daily pinning)        │ +€29/mo │ Decentralized backup   │
│ Arweave Archive (per batch)        │ €99     │ Permanent (one-time)   │
│ Multi-region sync                  │ +€49/mo │ 3+ geographic replicas │
└────────────────────────────────────┴─────────┴────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Marketing (Now)
**Effort**: 40 hours | **Revenue impact**: Immediate

1. Create "Data Sovereignty" landing page
2. Add export flow prominence in dashboard
3. FAQ: "What happens if EuroComply disappears?"
4. Trust badge: "Your data, your ownership"

### Phase 2: Sovereign Tier (Q1)
**Effort**: 60 hours | **Revenue**: €99/mo tier

```typescript
// New tier: VC issuance only, no managed hosting
interface SovereignTierFeatures {
  vcIssuance: true;           // Sign VCs with did:key
  dppTemplates: true;         // Use our compliance templates
  managedHosting: false;      // Customer hosts data
  exportFormats: ['json', 'vc-jwt', 'pdf'];
  verificationEndpoint: true; // Optional: use our verifier
}

// Customer workflow:
// 1. Create DPP in EuroComply studio
// 2. We sign VC with their did:key
// 3. Customer downloads signed VC + DPP JSON
// 4. Customer uploads to their S3/GitHub Pages
// 5. QR code points to customer's URL
```

### Phase 3: BYOS Storage Adapter (Q2)
**Effort**: 80 hours | **Revenue**: €149/mo tier

```typescript
// Storage adapter interface
interface StorageAdapter {
  provider: 'managed' | 's3' | 'azure' | 'gcs' | 'ipfs';

  // CRUD operations
  store(dppId: string, data: DppData): Promise<string>;
  retrieve(dppId: string): Promise<DppData>;
  delete(dppId: string): Promise<void>;

  // Sync
  sync(localData: DppData[], remoteUrl: string): Promise<SyncResult>;
}

// S3 adapter example
class S3StorageAdapter implements StorageAdapter {
  constructor(
    private bucket: string,
    private region: string,
    private credentials: AWSCredentials // encrypted, customer-provided
  ) {}

  async store(dppId: string, data: DppData): Promise<string> {
    await this.s3.putObject({
      Bucket: this.bucket,
      Key: `dpps/${dppId}.json`,
      Body: JSON.stringify(data),
      ContentType: 'application/json',
    });
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/dpps/${dppId}.json`;
  }
}
```

### Phase 4: IPFS Add-on (Q2)
**Effort**: 40 hours | **Revenue**: +€29/mo add-on

```typescript
// IPFS backup service
class IPFSBackupService {
  private pinata: PinataClient;

  async backupDpp(dppId: string, vcJwt: string, dppData: DppData) {
    // Pin VC to IPFS
    const vcCid = await this.pinata.pinJSON({
      pinataContent: {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: 'VerifiableCredential',
        proof: vcJwt,
        credentialSubject: dppData,
      },
      pinataMetadata: { name: `dpp-${dppId}` },
    });

    return {
      ipfsCid: vcCid,
      ipfsUrl: `ipfs://${vcCid}`,
      gatewayUrl: `https://gateway.pinata.cloud/ipfs/${vcCid}`,
    };
  }
}
```

### Phase 5: Arweave Archive (Q3)
**Effort**: 30 hours | **Revenue**: €99 one-time

```typescript
// Arweave permanent archive
async function archiveToArweave(dpps: DppData[]): Promise<ArweaveResult> {
  const arweave = Arweave.init({ host: 'arweave.net' });

  // Bundle all DPPs into single transaction
  const bundle = {
    version: '1.0',
    archived: new Date().toISOString(),
    dpps: dpps.map(dpp => ({
      id: dpp.id,
      vc: dpp.vcJwt,
      data: dpp.dppData,
    })),
  };

  const tx = await arweave.createTransaction({ data: JSON.stringify(bundle) });
  tx.addTag('App-Name', 'EuroComply');
  tx.addTag('Content-Type', 'application/json');

  await arweave.transactions.sign(tx);
  await arweave.transactions.post(tx);

  return {
    txId: tx.id,
    permanentUrl: `https://arweave.net/${tx.id}`,
    cost: tx.reward, // in Winston
  };
}
```

---

## Why NOT Container-per-Customer

The user asked about spinning up containers when payment is successful. Here's why this doesn't work for SMEs:

| Factor | Container-per-Customer | Our Recommendation |
|--------|------------------------|-------------------|
| Setup time | 4-8 hours | 5 minutes |
| Monthly cost | €50-110 + labor | €99-149 |
| IT knowledge required | DevOps | None |
| Support burden | Very high | Low |
| Margin | Negative at SME prices | Positive |
| Customer satisfaction | Low (complexity) | High (simplicity) |

**Container-per-customer makes sense ONLY for:**
- Enterprise customers (€599+ tier)
- Regulated industries requiring physical isolation
- Customers with dedicated IT teams

For SMEs, the **Sovereign tier** achieves the same data ownership goal with 10x less complexity.

---

## Data Sovereignty Comparison

| Approach | Ownership | Complexity | SME Fit |
|----------|-----------|------------|---------|
| Managed SaaS | Portable (VCs) | None | ✅ Best |
| Sovereign Tier | Full | Low | ✅ Great |
| BYOS (S3) | Full | Medium | ✅ Good |
| IPFS Backup | Full + Permanent | Low | ✅ Good |
| Container per customer | Full | High | ❌ Poor |
| Self-hosted open source | Complete | Very High | ❌ Poor |

---

## Marketing the Sovereignty Story

### Current messaging:
> "Digital Product Passport SaaS for SME Suppliers"

### New messaging:
> "Your DPPs, Your Rules, Our Tools"

Key points:
1. **Export anytime** - Download VCs + keys, host anywhere
2. **No lock-in** - VCs verify without EuroComply
3. **Your choice** - Managed, self-hosted, or decentralized
4. **ESPR compliant** - You control the 10-year retention

### Trust badges to add:
- "Data Portable" - Export your data anytime
- "No Lock-in" - VCs work forever without us
- "Your Infrastructure" - Host where you want

---

## Related Documentation

- [Self-Service Onboarding](./SELF_SERVICE_ONBOARDING.md) - How suppliers sign up
- [Architecture Portability](./ARCHITECTURE_PORTABILITY.md) - Technical portability details
- [Business Model](./BUSINESS_MODEL.md) - Pricing tiers

---

*Last Updated: 2026-01-08*
