# Migration Runbooks

Operational procedures for infrastructure and integration migrations. Each runbook includes prerequisites, step-by-step procedures, rollback strategies, and success criteria.

---

## Table of Contents

1. [did:key → did:ebsi Migration](#didkey--didebsi-migration)
2. [Hetzner → Cloudflare R2 Migration](#hetzner--cloudflare-r2-migration)
3. [EU DPP Registry Integration](#eu-dpp-registry-integration)

---

## did:key → did:ebsi Migration

### Overview

Adding did:ebsi alongside did:key to enable EU Trusted Issuer Registry recognition. This is an **additive** migration - did:key remains the default, did:ebsi is optional.

```
┌─────────────────────────────────────────────────────────────────┐
│  MIGRATION TYPE: Additive (Low Risk)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  BEFORE:                                                        │
│  Organization has: did:key:z6MkhaXgBZD...                       │
│                                                                  │
│  AFTER:                                                         │
│  Organization has: did:key:z6MkhaXgBZD... (unchanged)           │
│                    did:ebsi:z23abc...     (NEW, same key)       │
│                                                                  │
│  KEY INSIGHT: Same cryptographic key → both DIDs verify         │
│  the same signatures. did:ebsi is just an additional           │
│  identifier registered on EBSI.                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Prerequisites Checklist

| Requirement | Status | Notes |
|-------------|--------|-------|
| EBSI pilot access approved | ☐ | Apply at hub.ebsi.eu |
| @cef-ebsi libraries integrated | ☐ | npm packages installed |
| EBSI API credentials | ☐ | Bearer token for authenticated ops |
| TAO relationship established | ☐ | Who will accredit our customers? |
| Database schema updated | ☐ | didEbsi field added to OrganizationWallet |
| Staging environment tested | ☐ | Full flow works on pilot |

### Step-by-Step Runbook

#### Phase 1: Infrastructure Preparation (Week 1)

```bash
# 1.1 Install EBSI libraries
npm install @cef-ebsi/verifiable-credential @cef-ebsi/did-resolver

# 1.2 Run database migration
npx prisma migrate dev --name add_ebsi_fields

# 1.3 Deploy to staging
git checkout -b feature/ebsi-integration
# ... implement changes ...
git push origin feature/ebsi-integration
```

**Database Migration:**
```sql
-- Migration: add_ebsi_fields
ALTER TABLE "OrganizationWallet"
ADD COLUMN "didEbsi" TEXT UNIQUE,
ADD COLUMN "ebsiRegisteredAt" TIMESTAMP,
ADD COLUMN "ebsiTirEntry" TEXT,
ADD COLUMN "ebsiAccreditedBy" TEXT;

CREATE INDEX "OrganizationWallet_didEbsi_idx" ON "OrganizationWallet"("didEbsi");
```

#### Phase 2: EBSI Registration Service (Week 2)

```typescript
// 2.1 Implement EBSI registration service
// Location: apps/api/src/services/ebsi/registration.ts

interface EbsiRegistrationService {
  // Register organization's existing key on EBSI
  registerDid(organizationId: string): Promise<{
    didEbsi: string;
    tirEntry: string;
  }>;

  // Check registration status
  getRegistrationStatus(didEbsi: string): Promise<{
    registered: boolean;
    accreditations: string[];
  }>;
}
```

#### Phase 3: Staging Validation (Week 3)

```
┌─────────────────────────────────────────────────────────────────┐
│  STAGING VALIDATION CHECKLIST                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ☐ Create test organization with did:key                        │
│  ☐ Register did:ebsi on EBSI pilot                              │
│  ☐ Verify same key resolves for both DIDs                       │
│  ☐ Issue VC with did:key - verify signature                     │
│  ☐ Issue VC with did:ebsi - verify signature                    │
│  ☐ Verify did:ebsi appears in TIR                               │
│  ☐ Test rollback by removing did:ebsi                           │
│  ☐ Load test: 100 registrations                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Phase 4: Production Rollout (Week 4)

```bash
# 4.1 Deploy to production (feature flagged)
EBSI_ENABLED=false  # Initially disabled

# 4.2 Run database migration
npx prisma migrate deploy

# 4.3 Enable for beta organizations
# Update feature flags in database
UPDATE "Organization" SET "features" = "features" || '{"ebsi": true}'
WHERE "id" IN ('org_beta1', 'org_beta2');

# 4.4 Monitor for 48 hours

# 4.5 Enable globally
EBSI_ENABLED=true
```

### Rollback Procedure

**Risk Level: LOW** - did:ebsi is additive, rollback is straightforward.

```
┌─────────────────────────────────────────────────────────────────┐
│  ROLLBACK PROCEDURE                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TRIGGER: EBSI API unavailable, registration errors, or        │
│           EU policy changes                                      │
│                                                                  │
│  STEPS:                                                         │
│  1. Set EBSI_ENABLED=false (immediate, no deploy needed)        │
│  2. UI hides EBSI registration option                           │
│  3. New DPPs issue with did:key only (default)                  │
│  4. Existing did:ebsi DIDs continue to work                     │
│                                                                  │
│  DATA IMPACT: None - did:key remains primary                    │
│  USER IMPACT: Cannot register new did:ebsi                      │
│  VC IMPACT: None - all signatures remain valid                  │
│                                                                  │
│  FULL ROLLBACK (if needed):                                     │
│  -- Only if EBSI is permanently abandoned                       │
│  UPDATE "OrganizationWallet" SET "didEbsi" = NULL;              │
│  -- Columns can remain (nullable)                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Registration success rate | >99% | Registrations succeeded / attempted |
| Registration latency | <5s | p95 time to complete EBSI registration |
| TIR lookup success | >99.9% | Successful TIR queries / total |
| Zero regression on did:key | 100% | All existing did:key operations unaffected |
| Customer adoption | >10% in 3 months | Organizations with did:ebsi / total |

### Monitoring

```typescript
// Key metrics to track
const ebsiMetrics = {
  'ebsi.registration.success': Counter,
  'ebsi.registration.failure': Counter,
  'ebsi.registration.latency': Histogram,
  'ebsi.tir.lookup.success': Counter,
  'ebsi.tir.lookup.failure': Counter,
  'ebsi.tir.lookup.latency': Histogram,
};

// Alerts
const alerts = [
  {
    name: 'EBSI Registration Failures',
    condition: 'ebsi.registration.failure > 5 in 5m',
    action: 'Page on-call, consider disabling EBSI_ENABLED',
  },
  {
    name: 'EBSI API Latency',
    condition: 'ebsi.registration.latency p95 > 10s',
    action: 'Investigate EBSI API status',
  },
];
```

---

## Hetzner → Cloudflare R2 Migration

### Overview

Migrating static DPP files from Hetzner origin servers to Cloudflare R2 for unlimited bandwidth at extreme scale.

```
┌─────────────────────────────────────────────────────────────────┐
│  MIGRATION TYPE: Infrastructure Replacement (Medium Risk)        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  BEFORE:                                                        │
│  QR Scan → Cloudflare CDN → Hetzner Origins (3 servers)         │
│                                                                  │
│  AFTER:                                                         │
│  QR Scan → Cloudflare CDN → Cloudflare R2 (S3-compatible)       │
│                                                                  │
│  TRIGGER CRITERIA:                                              │
│  • Daily scans exceed 50 billion, OR                            │
│  • Monthly origin bandwidth approaches 60TB limit, OR           │
│  • Hetzner operational issues                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Prerequisites Checklist

| Requirement | Status | Notes |
|-------------|--------|-------|
| R2 bucket created | ☐ | `eurocomply-dpp` bucket |
| R2 API credentials | ☐ | Access key + secret |
| S3 client library | ☐ | @aws-sdk/client-s3 installed |
| Cloudflare Worker deployed | ☐ | For custom routing (optional) |
| Data sync tool ready | ☐ | rclone or aws s3 sync configured |
| Monitoring updated | ☐ | R2 metrics in dashboard |
| Runbook reviewed | ☐ | Team familiar with procedure |

### Trigger Decision Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│  WHEN TO MIGRATE                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Metric                    │ Threshold      │ Action             │
│  ─────────────────────────────────────────────────────────────  │
│  Daily scans               │ >50B           │ Begin migration    │
│  Monthly origin bandwidth  │ >50TB          │ Begin migration    │
│  Origin error rate         │ >1%            │ Investigate first  │
│  Hetzner outage            │ >1 hour        │ Emergency migrate  │
│                                                                  │
│  COST COMPARISON AT TRIGGER:                                    │
│  Hetzner (current): ~$200/month (fixed)                         │
│  R2 (after):        ~$500-2000/month (scales with storage)      │
│                                                                  │
│  Migrate when: Reliability > Cost savings                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Step-by-Step Runbook

#### Phase 1: R2 Setup (Day 1)

```bash
# 1.1 Create R2 bucket via Cloudflare dashboard or API
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/{account_id}/r2/buckets/eurocomply-dpp" \
  -H "Authorization: Bearer {api_token}" \
  -H "Content-Type: application/json"

# 1.2 Generate R2 API credentials
# Dashboard → R2 → Manage R2 API Tokens → Create API Token

# 1.3 Configure rclone for data sync
cat >> ~/.config/rclone/rclone.conf << EOF
[r2]
type = s3
provider = Cloudflare
access_key_id = {R2_ACCESS_KEY_ID}
secret_access_key = {R2_SECRET_ACCESS_KEY}
endpoint = https://{account_id}.r2.cloudflarestorage.com
acl = private
EOF

# 1.4 Test connection
rclone lsd r2:eurocomply-dpp
```

#### Phase 2: Data Synchronization (Day 2-3)

```bash
# 2.1 Initial sync from Hetzner to R2 (run from Hetzner server)
rclone sync /var/www/dpp/ r2:eurocomply-dpp/ \
  --progress \
  --transfers 32 \
  --checkers 16 \
  --log-file=/var/log/r2-sync.log

# 2.2 Verify file counts match
HETZNER_COUNT=$(find /var/www/dpp -type f | wc -l)
R2_COUNT=$(rclone size r2:eurocomply-dpp --json | jq '.count')
echo "Hetzner: $HETZNER_COUNT, R2: $R2_COUNT"

# 2.3 Set up continuous sync (every 5 minutes during migration)
*/5 * * * * rclone sync /var/www/dpp/ r2:eurocomply-dpp/ --quiet
```

#### Phase 3: Dual-Write Mode (Day 4)

```typescript
// 3.1 Update DPP publishing to write to BOTH Hetzner and R2
async function publishDPP(params: { path: string; files: Record<string, string> }): Promise<void> {
  // Write to Hetzner (existing)
  await pushToHetznerOrigins(params);

  // Write to R2 (new)
  await publishToR2(params);

  logger.info('DPP published to both origins', { path: params.path });
}

// 3.2 Deploy dual-write code
git checkout -b feature/r2-dual-write
# ... implement ...
git push && deploy
```

#### Phase 4: Traffic Shift (Day 5)

```
┌─────────────────────────────────────────────────────────────────┐
│  BLUE-GREEN TRAFFIC SHIFT                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Step 1: Update Cloudflare origin (10% traffic)                 │
│  ─────────────────────────────────────────────                  │
│  • Create new origin pool pointing to R2                        │
│  • Configure load balancer: 90% Hetzner, 10% R2                 │
│  • Monitor for 2 hours                                          │
│                                                                  │
│  Step 2: Increase R2 traffic (50%)                              │
│  ─────────────────────────────────                              │
│  • Update load balancer: 50% Hetzner, 50% R2                    │
│  • Monitor for 4 hours                                          │
│                                                                  │
│  Step 3: Full cutover (100% R2)                                 │
│  ───────────────────────────────                                │
│  • Update load balancer: 0% Hetzner, 100% R2                    │
│  • Monitor for 24 hours                                         │
│  • Keep Hetzner running for rollback                            │
│                                                                  │
│  Step 4: Decommission Hetzner (Day 7+)                          │
│  ─────────────────────────────────────                          │
│  • Stop dual-write                                              │
│  • Archive Hetzner data to cold storage                         │
│  • Cancel Hetzner servers                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Cloudflare Load Balancer Configuration:**

```json
{
  "origin_pools": [
    {
      "name": "hetzner-origins",
      "origins": [
        { "address": "hetzner1.eurocomply.eu", "weight": 1 },
        { "address": "hetzner2.eurocomply.eu", "weight": 1 },
        { "address": "hetzner3.eurocomply.eu", "weight": 1 }
      ]
    },
    {
      "name": "r2-origin",
      "origins": [
        { "address": "eurocomply-dpp.{account_id}.r2.cloudflarestorage.com", "weight": 1 }
      ]
    }
  ],
  "traffic_split": {
    "hetzner-origins": 0.9,
    "r2-origin": 0.1
  }
}
```

### Rollback Procedure

**Risk Level: MEDIUM** - Requires DNS/load balancer changes.

```
┌─────────────────────────────────────────────────────────────────┐
│  ROLLBACK PROCEDURE                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TRIGGER: R2 errors >1%, latency >500ms, or data integrity     │
│           issues                                                 │
│                                                                  │
│  IMMEDIATE ROLLBACK (< 5 minutes):                              │
│  1. Update Cloudflare load balancer:                            │
│     traffic_split: { "hetzner-origins": 1.0, "r2-origin": 0.0 } │
│  2. Cloudflare propagates change globally in ~30 seconds        │
│  3. Monitor Hetzner traffic increase                            │
│                                                                  │
│  DATA SYNC (if R2 had new writes):                              │
│  1. Identify files written to R2 but not Hetzner                │
│     rclone check r2:eurocomply-dpp /var/www/dpp --one-way       │
│  2. Sync missing files back to Hetzner                          │
│     rclone copy r2:eurocomply-dpp /var/www/dpp --ignore-existing│
│                                                                  │
│  ROOT CAUSE ANALYSIS:                                           │
│  • Check R2 service status                                      │
│  • Review error logs                                            │
│  • Verify bucket permissions                                    │
│  • Test S3 API connectivity                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Error rate | <0.1% | HTTP 5xx / total requests |
| Latency p50 | <50ms | CDN edge to user |
| Latency p99 | <200ms | CDN edge to user |
| Data integrity | 100% | SHA256 checksums match |
| Cache hit rate | >99% | Cloudflare analytics |
| Cost delta | <3x | R2 cost vs Hetzner baseline |

### Monitoring During Migration

```typescript
// Real-time dashboard metrics
const migrationMetrics = {
  // Traffic split
  'origin.hetzner.requests': Counter,
  'origin.r2.requests': Counter,

  // Error rates
  'origin.hetzner.errors': Counter,
  'origin.r2.errors': Counter,

  // Latency
  'origin.hetzner.latency': Histogram,
  'origin.r2.latency': Histogram,

  // Data sync
  'sync.files.pending': Gauge,
  'sync.bytes.transferred': Counter,
};

// Critical alerts during migration
const migrationAlerts = [
  {
    name: 'R2 Error Rate Spike',
    condition: 'origin.r2.errors / origin.r2.requests > 0.01',
    action: 'ROLLBACK: Shift traffic to Hetzner immediately',
    severity: 'critical',
  },
  {
    name: 'R2 Latency Degradation',
    condition: 'origin.r2.latency p99 > 500ms for 5m',
    action: 'Investigate R2 performance, consider rollback',
    severity: 'warning',
  },
  {
    name: 'Data Sync Lag',
    condition: 'sync.files.pending > 1000 for 10m',
    action: 'Investigate sync process, check Hetzner connectivity',
    severity: 'warning',
  },
];
```

### Post-Migration Cleanup

```bash
# After 7 days of stable R2 operation:

# 1. Stop dual-write
# Update code to write only to R2

# 2. Archive Hetzner data
rclone sync /var/www/dpp/ s3:eurocomply-archive/hetzner-backup-$(date +%Y%m%d)/ \
  --progress

# 3. Verify archive
rclone check /var/www/dpp/ s3:eurocomply-archive/hetzner-backup-$(date +%Y%m%d)/

# 4. Cancel Hetzner servers
# Via Hetzner Robot dashboard

# 5. Update documentation
# Remove Hetzner references, update architecture diagrams
```

---

## EU DPP Registry Integration

### Overview

Integrating with the EU Digital Product Passport Registry when it launches (expected July 2026). This registers DPP metadata with the official EU index while we continue hosting the actual DPP content.

```
┌─────────────────────────────────────────────────────────────────┐
│  MIGRATION TYPE: New Integration (Medium Risk)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  BEFORE:                                                        │
│  DPP exists only in EuroComply                                  │
│                                                                  │
│  AFTER:                                                         │
│  DPP registered in EU Registry (index)                          │
│  DPP content still hosted by EuroComply                         │
│                                                                  │
│  EU REGISTRY STORES:                                            │
│  • GTIN                                                         │
│  • DPP URL (points to us)                                       │
│  • Operator ID                                                  │
│  • Product category                                             │
│  • Registration timestamp                                       │
│                                                                  │
│  WE CONTINUE TO STORE:                                          │
│  • Full DPP content (VC)                                        │
│  • HTML rendering                                               │
│  • QR code serving                                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Prerequisites Checklist

| Requirement | Status | Notes |
|-------------|--------|-------|
| EU Registry API specs published | ☐ | Monitor EU announcements |
| API credentials obtained | ☐ | Apply via EU portal |
| Operator ID for customers | ☐ | EORI or EU business ID |
| ESPR product categories mapped | ☐ | Map our categories to ESPR |
| Database schema updated | ☐ | euRegistryId field added |
| Retry/circuit breaker ready | ☐ | Handle EU API failures |
| Batch registration tool | ☐ | For existing DPPs |

### Integration Timeline

```
┌─────────────────────────────────────────────────────────────────┐
│  EU REGISTRY INTEGRATION TIMELINE                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Q1 2026: PREPARATION                                           │
│  ─────────────────────                                          │
│  • Monitor EU Registry API beta/specs                           │
│  • Build Registry client library (mock API)                     │
│  • Add euRegistryId to Passport schema                          │
│  • Implement batch registration tool                            │
│                                                                  │
│  Q2 2026: BETA TESTING                                          │
│  ────────────────────                                           │
│  • Access EU Registry sandbox environment                       │
│  • Test registration flow end-to-end                            │
│  • Validate error handling                                      │
│  • Test batch registration with 1000 DPPs                       │
│                                                                  │
│  Q3 2026: PRODUCTION LAUNCH                                     │
│  ─────────────────────────                                      │
│  • EU Registry goes live (July 2026)                            │
│  • Enable auto-registration for new DPPs                        │
│  • Begin batch registration of existing DPPs                    │
│  • Monitor registration success rate                            │
│                                                                  │
│  Q4 2026: FULL OPERATION                                        │
│  ────────────────────────                                       │
│  • All new DPPs auto-registered                                 │
│  • All existing DPPs batch-registered                           │
│  • Registry status visible in UI                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Step-by-Step Runbook

#### Phase 1: Client Library Implementation (Q1 2026)

```typescript
// 1.1 EU Registry client interface
// Location: apps/api/src/services/eu-registry/client.ts

interface EuRegistryClient {
  // Register a new DPP
  register(params: {
    gtin: string;
    dppUrl: string;
    operatorId: string;
    productCategory: EsprCategory;
    vcHash: string;
  }): Promise<RegistrationResult>;

  // Update DPP registration
  update(params: {
    registryId: string;
    status?: 'ACTIVE' | 'REVOKED';
    newDppUrl?: string;
  }): Promise<UpdateResult>;

  // Query registration status
  getStatus(registryId: string): Promise<RegistrationStatus>;
}

// 1.2 Mock implementation for testing
class MockEuRegistryClient implements EuRegistryClient {
  async register(params): Promise<RegistrationResult> {
    // Simulate EU Registry behavior
    await sleep(random(100, 500)); // Realistic latency
    return {
      registryId: `eu_${nanoid()}`,
      registeredAt: new Date().toISOString(),
      status: 'REGISTERED',
    };
  }
}
```

#### Phase 2: Database Schema Update

```sql
-- Migration: add_eu_registry_fields
ALTER TABLE "Passport"
ADD COLUMN "euRegistryId" TEXT UNIQUE,
ADD COLUMN "euRegisteredAt" TIMESTAMP,
ADD COLUMN "euRegistryStatus" TEXT DEFAULT 'NOT_REGISTERED',
ADD COLUMN "euRegistryError" TEXT;

CREATE INDEX "Passport_euRegistryId_idx" ON "Passport"("euRegistryId");
CREATE INDEX "Passport_euRegistryStatus_idx" ON "Passport"("euRegistryStatus");

-- Status enum values:
-- NOT_REGISTERED: Not yet submitted
-- PENDING: Submitted, awaiting confirmation
-- REGISTERED: Successfully registered
-- FAILED: Registration failed (see euRegistryError)
-- REVOKED: Revoked in EU Registry
```

#### Phase 3: DPP Issuance Flow Update

```typescript
// 3.1 Updated DPP issuance with EU Registry
async function issueDPP(product: Product): Promise<Passport> {
  // Existing steps...
  const vc = await generateVC(product);
  const signedVC = await signVC(vc, orgWallet);
  const passport = await savePassport(signedVC);
  await publishToOrigins(passport);

  // NEW: Register with EU Registry (async, non-blocking)
  if (config.EU_REGISTRY_ENABLED) {
    await registrationQueue.add('register-dpp', {
      passportId: passport.id,
      gtin: product.gtin,
      dppUrl: passport.cdnUrl,
      operatorId: product.organization.operatorId,
      productCategory: mapToEsprCategory(product.category),
      vcHash: hashVC(signedVC),
    });
  }

  return passport;
}

// 3.2 Registration worker
registrationQueue.process('register-dpp', async (job) => {
  const { passportId, ...registrationData } = job.data;

  try {
    const result = await euRegistryClient.register(registrationData);

    await prisma.passport.update({
      where: { id: passportId },
      data: {
        euRegistryId: result.registryId,
        euRegisteredAt: result.registeredAt,
        euRegistryStatus: 'REGISTERED',
      },
    });

    logger.info('DPP registered with EU Registry', { passportId, registryId: result.registryId });
  } catch (error) {
    await prisma.passport.update({
      where: { id: passportId },
      data: {
        euRegistryStatus: 'FAILED',
        euRegistryError: error.message,
      },
    });

    // Retry with exponential backoff
    throw error;
  }
});
```

#### Phase 4: Batch Registration of Existing DPPs

```typescript
// 4.1 Batch registration script
// Location: scripts/batch-register-eu-registry.ts

async function batchRegisterExistingDpps() {
  const batchSize = 100;
  let processed = 0;
  let cursor: string | undefined;

  while (true) {
    const passports = await prisma.passport.findMany({
      where: {
        euRegistryStatus: 'NOT_REGISTERED',
        status: 'ACTIVE',
      },
      take: batchSize,
      cursor: cursor ? { id: cursor } : undefined,
      include: {
        product: {
          include: { organization: true },
        },
      },
    });

    if (passports.length === 0) break;

    for (const passport of passports) {
      await registrationQueue.add('register-dpp', {
        passportId: passport.id,
        gtin: passport.product.gtin,
        dppUrl: passport.cdnUrl,
        operatorId: passport.product.organization.operatorId,
        productCategory: mapToEsprCategory(passport.product.category),
        vcHash: hashVC(passport.vcJwt),
      }, {
        // Rate limit to avoid overwhelming EU Registry
        delay: processed * 100, // 10 registrations/second
      });

      processed++;
    }

    cursor = passports[passports.length - 1].id;
    logger.info(`Queued ${processed} DPPs for registration`);
  }

  logger.info(`Batch registration complete: ${processed} DPPs queued`);
}
```

### Rollback Procedure

**Risk Level: LOW** - EU Registry is additive, failure doesn't affect DPP availability.

```
┌─────────────────────────────────────────────────────────────────┐
│  ROLLBACK / DEGRADED OPERATION                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SCENARIO 1: EU Registry API Unavailable                        │
│  ───────────────────────────────────────                        │
│  Impact: New DPPs not registered (queued for retry)             │
│  Action: Circuit breaker opens, registration queued             │
│  User Impact: DPPs still work, just not in EU index             │
│  Recovery: Automatic retry when API recovers                    │
│                                                                  │
│  SCENARIO 2: Invalid API Response                               │
│  ────────────────────────────────                               │
│  Impact: Registration fails for specific DPPs                   │
│  Action: Mark as FAILED, log error, alert ops                   │
│  User Impact: Can view error in dashboard                       │
│  Recovery: Manual investigation, retry button in UI             │
│                                                                  │
│  SCENARIO 3: EU Registry Policy Change                          │
│  ────────────────────────────────────                           │
│  Impact: Registration requirements change                       │
│  Action: Disable EU_REGISTRY_ENABLED immediately                │
│  User Impact: New DPPs not registered                           │
│  Recovery: Update client library, re-enable                     │
│                                                                  │
│  FULL DISABLE:                                                  │
│  Set EU_REGISTRY_ENABLED=false                                  │
│  • New DPPs skip registration step                              │
│  • Existing registrations unaffected                            │
│  • DPPs continue to work normally                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Registration success rate | >99% | Successful / attempted |
| Registration latency | <2s | p95 time to register |
| Batch registration throughput | >1000/hour | DPPs registered per hour |
| Zero DPP availability impact | 100% | DPPs accessible during registration |
| Customer visibility | 100% | Registration status visible in UI |

### Error Handling

```typescript
// EU Registry error handling
const euRegistryErrorHandling = {
  // Retryable errors
  'RATE_LIMITED': {
    retry: true,
    backoff: 'exponential',
    maxRetries: 10,
    initialDelay: 60000, // 1 minute
  },
  'SERVICE_UNAVAILABLE': {
    retry: true,
    backoff: 'exponential',
    maxRetries: 5,
    initialDelay: 30000,
  },
  'TIMEOUT': {
    retry: true,
    backoff: 'fixed',
    maxRetries: 3,
    delay: 5000,
  },

  // Non-retryable errors
  'INVALID_GTIN': {
    retry: false,
    action: 'Alert user, require GTIN correction',
  },
  'INVALID_OPERATOR_ID': {
    retry: false,
    action: 'Alert user, require operator ID update',
  },
  'DUPLICATE_REGISTRATION': {
    retry: false,
    action: 'Log and ignore (already registered)',
  },
  'UNAUTHORIZED': {
    retry: false,
    action: 'Alert ops, check API credentials',
  },
};
```

### Monitoring

```typescript
// EU Registry integration metrics
const euRegistryMetrics = {
  'eu_registry.registration.success': Counter,
  'eu_registry.registration.failure': Counter,
  'eu_registry.registration.latency': Histogram,
  'eu_registry.registration.queue_size': Gauge,
  'eu_registry.batch.progress': Gauge,
  'eu_registry.circuit_breaker.state': Gauge, // 0=closed, 1=open, 2=half-open
};

// Alerts
const euRegistryAlerts = [
  {
    name: 'EU Registry Registration Failures',
    condition: 'eu_registry.registration.failure > 10 in 5m',
    action: 'Investigate EU Registry API status',
    severity: 'warning',
  },
  {
    name: 'EU Registry Circuit Breaker Open',
    condition: 'eu_registry.circuit_breaker.state == 1',
    action: 'EU Registry API unavailable, check status page',
    severity: 'warning',
  },
  {
    name: 'EU Registry Queue Backlog',
    condition: 'eu_registry.registration.queue_size > 10000',
    action: 'Registration backlog growing, investigate',
    severity: 'warning',
  },
];
```

---

## Cross-Reference

| Migration | Related Docs |
|-----------|--------------|
| did:ebsi | [EU_INTEGRATION.md](./EU_INTEGRATION.md), [VERIFIABLE_CREDENTIALS.md](./VERIFIABLE_CREDENTIALS.md) |
| Hetzner → R2 | [SCALABILITY.md](./SCALABILITY.md) |
| EU Registry | [EU_INTEGRATION.md](./EU_INTEGRATION.md), [ARCHITECTURE_PORTABILITY.md](./ARCHITECTURE_PORTABILITY.md) |

---

*Last Updated: 2026-01-12*
