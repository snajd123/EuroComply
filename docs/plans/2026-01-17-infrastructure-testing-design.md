# Infrastructure Testing Design

**Date:** 2026-01-17
**Status:** Ready for Implementation
**Purpose:** Validate staging infrastructure before application development

---

## Overview

Before building application features, we validate that all infrastructure components work correctly. This catches infrastructure issues early, when they're easier to debug.

**Components to test:**
- API on ECS (`api-staging.eurocomply.eu`)
- DPP Worker on Cloudflare (`dpp-staging.eurocomply.eu`)
- R2 Bucket (`eurocomply-dpps-staging`)
- RDS PostgreSQL (private subnet)
- ElastiCache Redis (private subnet)
- CI/CD Pipeline (GitHub Actions)

**Test order:** Foundation up - connectivity, then integration, then deployment.

---

## 1. Connectivity Tests

**Goal:** Verify each component can reach its dependencies.

### Test 1.1: API → RDS Connection
- Verify Prisma can connect and run a simple query
- Expected: Connection succeeds, query returns

### Test 1.2: API → Redis Connection
- Verify Redis client connects to ElastiCache
- Set/get a test key
- Expected: Key round-trips successfully

### Test 1.3: API → R2 Credentials
- Verify R2 credentials from Secrets Manager work
- List bucket contents
- Expected: API call succeeds

### Test 1.4: Secrets Injection
- Verify ECS task has all required environment variables
- Check: `DB_PASSWORD`, `CLERK_SECRET_KEY`, `R2_*` vars present
- Expected: All secrets injected, not empty

### Implementation

Add temporary `/debug/connectivity` endpoint:

```typescript
// Temporary - remove after testing
app.get('/debug/connectivity', async (c) => {
  const results = {
    database: false,
    redis: false,
    r2: false,
    secrets: false,
  };

  // Test 1.1: Database
  try {
    await prisma.$queryRaw`SELECT 1`;
    results.database = true;
  } catch (e) {
    results.database = String(e);
  }

  // Test 1.2: Redis
  try {
    await redis.set('test-key', 'test-value');
    const val = await redis.get('test-key');
    results.redis = val === 'test-value';
  } catch (e) {
    results.redis = String(e);
  }

  // Test 1.3: R2
  try {
    const s3 = new S3Client({ /* R2 config */ });
    await s3.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET }));
    results.r2 = true;
  } catch (e) {
    results.r2 = String(e);
  }

  // Test 1.4: Secrets
  results.secrets = {
    DB_PASSWORD: !!process.env.DB_PASSWORD,
    CLERK_SECRET_KEY: !!process.env.CLERK_SECRET_KEY,
    R2_ACCESS_KEY_ID: !!process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: !!process.env.R2_SECRET_ACCESS_KEY,
  };

  return c.json(results);
});
```

**Security:** Remove this endpoint after testing.

---

## 2. End-to-End Flow Tests

**Goal:** Verify the DPP storage and retrieval flow works.

### Test 2.1: Upload Test DPP to R2

Create test files:

**credential.json:**
```json
{
  "@context": ["https://www.w3.org/2018/credentials/v1"],
  "type": ["VerifiableCredential", "DigitalProductPassport"],
  "issuer": "did:key:zTestIssuer123",
  "issuanceDate": "2026-01-17T00:00:00Z",
  "credentialSubject": {
    "id": "urn:dpp:test-org:test-passport-001",
    "product": {
      "name": "Test Product",
      "manufacturer": "Test Org"
    }
  }
}
```

**preview.html:**
```html
<!DOCTYPE html>
<html>
<head><title>Test DPP</title></head>
<body>
  <h1>Test Digital Product Passport</h1>
  <p>Product: Test Product</p>
  <p>Manufacturer: Test Org</p>
</body>
</html>
```

**qr.png:** Any placeholder PNG image.

Upload to R2 path: `test-org/test-passport-001/`

### Test 2.2: Fetch via Worker - Content Negotiation

| Request | Expected |
|---------|----------|
| `GET /test-org/test-passport-001` + `Accept: application/vc+ld+json` | credential.json |
| `GET /test-org/test-passport-001` + `Accept: text/html` | preview.html |
| `GET /test-org/test-passport-001` + `Accept: image/png` | qr.png |
| `GET /test-org/test-passport-001` (no Accept) | credential.json (default) |

### Test 2.3: Direct File Access

| Request | Expected |
|---------|----------|
| `GET /test-org/test-passport-001/credential.json` | JSON, 200 |
| `GET /test-org/test-passport-001/preview.html` | HTML, 200 |
| `GET /test-org/test-passport-001/qr.png` | PNG, 200 |

### Test 2.4: Error Handling

| Request | Expected |
|---------|----------|
| `GET /nonexistent-org/fake-id` | 404 Not Found |
| `POST /test-org/test-passport-001` | 405 Method Not Allowed |

---

## 3. Pipeline Tests

**Goal:** Verify CI/CD deploys changes correctly.

### Test 3.1: Push a Trivial Change

Modify health endpoint to include version:

```typescript
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    version: 'test-infra-001',
    timestamp: new Date().toISOString(),
  });
});
```

Push to `main`.

### Test 3.2: Watch CI Pipeline

Verify all jobs pass:
- Lint & typecheck
- Unit tests
- Integration tests
- Docker build
- Security audit

### Test 3.3: Watch Deploy Pipeline

Verify `deploy-staging.yml`:
- Triggers after CI succeeds
- ECR receives new image
- ECS service updates
- Service stabilizes

### Test 3.4: Verify Live Deployment

```bash
curl https://api-staging.eurocomply.eu/health
```

Expected response includes `"version": "test-infra-001"`.

### Test 3.5: Rollback Readiness

- Note previous ECS task definition revision
- Confirm we can redeploy if needed

---

## 4. Execution Plan

### Order
1. Connectivity tests (catch blockers first)
2. End-to-end DPP flow (validate integration)
3. Pipeline tests (validate deployment)

### Success Criteria

| Layer | Pass Condition |
|-------|----------------|
| Connectivity | All 4 checks return success |
| End-to-end | Worker serves all 3 DPP formats correctly |
| Pipeline | Version bump visible at live endpoint |

### Cleanup After Testing

- [x] Remove `/debug/connectivity` endpoint
- [ ] Keep test DPP in R2 (useful for ongoing smoke tests)
- [ ] Keep version in health endpoint (good practice)

### Time Estimate

~2-3 hours hands-on

---

## Out of Scope

- **Walt.id integration** - Application code, tested when building DPP issuance feature
- **Production environment** - Not set up yet (cost optimization)
- **Load testing** - Not needed for infrastructure validation

---

## Related Documentation

- [DevOps Infrastructure Design](./2026-01-16-devops-infrastructure-design.md)
- [Cloudflare Worker Implementation](./2026-01-17-cloudflare-worker-implementation.md)
- [Credentials Management](../CREDENTIALS.md)
