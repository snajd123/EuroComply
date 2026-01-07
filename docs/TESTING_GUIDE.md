# Testing Guide for EuroComply DPP

## Quick Start Testing (Local Development)

### 1. Prerequisites

```bash
# Required
- Node.js 20+
- Docker & Docker Compose
- A terminal

# Verify
node --version  # Should be v20+
docker --version
```

### 2. Start Infrastructure

```bash
# Start PostgreSQL and Redis only (no walt.id for basic testing)
cd docker
docker-compose up -d postgres redis

# Verify running
docker ps
# Should show eurocomply-db and eurocomply-redis
```

### 3. Setup Application

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Seed with test data (optional)
npm run db:seed
```

### 4. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with minimal config for testing:
```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://eurocomply:eurocomply@localhost:5432/eurocomply
REDIS_URL=redis://localhost:6379
JWT_SECRET=test-secret-change-in-production
API_KEY_PREFIX=ec_

# Leave walt.id URLs as-is for now (will use mock mode)
```

### 5. Start the API

```bash
npm run dev
```

API should be running at `http://localhost:3000`

---

## Testing the DPP Flow

### Test 1: Health Check

```bash
curl http://localhost:3000/health
```

Expected:
```json
{"status":"ok","timestamp":"..."}
```

### Test 2: Create an Organization (via seed or manually)

The seed script should create a test organization with an API key. Check the output for the key, or query the database:

```bash
# Connect to database
docker exec -it eurocomply-db psql -U eurocomply -d eurocomply

# List organizations
SELECT id, name, slug FROM "Organization";

# List API keys (you'll see the prefix)
SELECT id, name, "keyPrefix" FROM "ApiKey";
```

### Test 3: Create a Product

```bash
# Replace ec_test_xxx with your actual API key
curl -X POST http://localhost:3000/v1/products \
  -H "Authorization: Bearer ec_test_xxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Organic Cotton T-Shirt",
    "sku": "TSHIRT-001",
    "gtin": "5901234123457",
    "description": "100% organic cotton t-shirt"
  }'
```

Expected: Product object with `id`

### Test 4: Create a Digital Product Passport

```bash
curl -X POST http://localhost:3000/v1/passports \
  -H "Authorization: Bearer ec_test_xxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "PRODUCT_ID_FROM_STEP_3",
    "data": {
      "manufacturerName": "EcoFashion GmbH",
      "manufacturerCountry": "DE",
      "carbonFootprint": {
        "value": 5.2,
        "unit": "kgCO2e"
      },
      "recyclability": {
        "percentage": 85,
        "instructions": "Remove buttons before recycling"
      },
      "materials": [
        {"name": "Organic Cotton", "percentage": 95},
        {"name": "Elastane", "percentage": 5}
      ]
    }
  }'
```

Expected: Passport object with `id`

### Test 5: Generate QR Code

```bash
curl -X POST http://localhost:3000/v1/passports/PASSPORT_ID/qr \
  -H "Authorization: Bearer ec_test_xxxxxxxxxxxxx"
```

Expected: QR code URL or base64 image

### Test 6: Public Verification (No Auth Required)

```bash
curl http://localhost:3000/v1/passports/PASSPORT_ID/verify
```

Expected: Verification result with passport data

### Test 7: Record Lifecycle Event

```bash
curl -X POST http://localhost:3000/v1/products/PRODUCT_ID/events \
  -H "Authorization: Bearer ec_test_xxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "MANUFACTURED",
    "quantity": 1000,
    "description": "Initial production batch"
  }'
```

---

## Testing Shopify Integration (Local)

### Option A: Use ngrok for OAuth testing

```bash
# Install ngrok
npm install -g ngrok

# Expose local API
ngrok http 3000

# Use the ngrok URL as your Shopify app URL
# Example: https://abc123.ngrok.io
```

Then in Shopify Partners:
1. Create a test app
2. Set App URL: `https://abc123.ngrok.io/api/shopify/auth`
3. Set Redirect URL: `https://abc123.ngrok.io/api/shopify/callback`

### Option B: Mock testing (no real Shopify)

Create a test script to simulate product sync:

```typescript
// scripts/test-shopify-sync.ts
import { prisma } from '@eurocomply/database';

async function testSync() {
  // Create a mock organization (as if Shopify connected)
  const org = await prisma.organization.create({
    data: {
      name: 'Test Shopify Store',
      slug: 'test-store',
      domain: 'test-store.myshopify.com',
      settings: {
        shopify: {
          shop: 'test-store.myshopify.com',
          accessToken: 'mock-token',
          installedAt: new Date().toISOString(),
        },
      },
    },
  });

  // Create mock synced products
  const product = await prisma.product.create({
    data: {
      organizationId: org.id,
      name: 'Synced from Shopify',
      sku: 'SHOP-001',
      attributes: {
        shopifyId: 12345,
        source: 'shopify',
      },
    },
  });

  console.log('Created org:', org.id);
  console.log('Created product:', product.id);
}

testSync();
```

---

## Testing WooCommerce Integration

WooCommerce is simpler - no OAuth. Test with:

```bash
curl -X POST http://localhost:3000/api/woocommerce/connect \
  -H "Authorization: Bearer ec_test_xxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "siteUrl": "https://your-woo-store.com",
    "consumerKey": "ck_xxxxx",
    "consumerSecret": "cs_xxxxx"
  }'
```

For testing without a real WooCommerce store, mock the connection in the database.

---

## Testing walt.id / Verifiable Credentials

### Option A: Full walt.id stack

```bash
# Start all services including walt.id
cd docker
docker-compose up -d

# This starts:
# - postgres (5432)
# - redis (6379)
# - waltid-core (7000)
# - waltid-signatory (7001)
# - waltid-custodian (7002)
# - waltid-auditor (7003)
```

Then test VC issuance:
```bash
# Anchor a passport (issues VC)
curl -X POST http://localhost:3000/v1/passports/PASSPORT_ID/anchor \
  -H "Authorization: Bearer ec_test_xxxxxxxxxxxxx"
```

### Option B: Mock mode (without walt.id)

The identity package should gracefully handle missing walt.id by returning mock credentials. Check `packages/identity/src/config.ts` for mock mode settings.

---

## Common Issues

### "Cannot find module '@eurocomply/database'"
```bash
npm run db:generate
```

### "Connection refused" to PostgreSQL
```bash
docker-compose up -d postgres
# Wait a few seconds for startup
```

### "Invalid API key"
Check that you're using the correct key from the seed, including the full prefix (e.g., `ec_test_abc123...`)

### Prisma errors
```bash
npm run db:push  # Reset schema
npm run db:seed  # Re-seed data
```

---

## Test Checklist

- [ ] Health endpoint responds
- [ ] Can create organization/get API key
- [ ] Can create product
- [ ] Can create passport
- [ ] Can generate QR code
- [ ] Public verification works
- [ ] Lifecycle events recorded
- [ ] (Optional) Shopify OAuth flow
- [ ] (Optional) WooCommerce connection
- [ ] (Optional) VC issuance with walt.id

---

## Next Steps After Testing

1. **Fix any bugs** found during testing
2. **Add automated tests** (vitest is already configured)
3. **Test with real Shopify dev store**
4. **Test with real WooCommerce staging site**
5. **Deploy to staging environment**
