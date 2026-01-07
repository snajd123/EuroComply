# Testing Guide for EuroComply DPP

This guide covers testing the EuroComply platform, with a focus on the **Shopify app development workflow** following Shopify's official testing practices.

## Table of Contents

1. [Quick Start - API Testing](#quick-start---api-testing)
2. [Shopify App Testing (Standard Workflow)](#shopify-app-testing-standard-workflow)
3. [WooCommerce Testing](#woocommerce-testing)
4. [Verifiable Credentials Testing](#verifiable-credentials-testing)
5. [Troubleshooting](#troubleshooting)

---

## Quick Start - API Testing

### Prerequisites

```bash
# Required
- Node.js 20+
- Docker & Docker Compose

# Verify
node --version  # Should be v20+
docker --version
```

### 1. Start Infrastructure

```bash
cd docker
docker-compose up -d postgres redis

# Verify running
docker ps
# Should show eurocomply-db and eurocomply-redis
```

### 2. Setup Application

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed  # Optional test data
```

### 3. Start the API

```bash
npm run dev
```

API runs at `http://localhost:3000`

### 4. Test DPP Endpoints

```bash
# Health check
curl http://localhost:3000/health

# Create a product (replace with your API key)
curl -X POST http://localhost:3000/v1/products \
  -H "Authorization: Bearer ec_test_xxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Organic Cotton T-Shirt",
    "sku": "TSHIRT-001",
    "gtin": "5901234123457"
  }'

# Create a DPP
curl -X POST http://localhost:3000/v1/passports \
  -H "Authorization: Bearer ec_test_xxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "PRODUCT_ID",
    "data": {
      "manufacturerName": "EcoFashion GmbH",
      "carbonFootprint": {"value": 5.2, "unit": "kgCO2e"}
    }
  }'

# Verify (public, no auth)
curl http://localhost:3000/v1/passports/PASSPORT_ID/verify
```

---

## Shopify App Testing (Standard Workflow)

This is the **recommended approach** for testing the Shopify integration. It follows the official Shopify app development workflow.

### Prerequisites

1. **Shopify Partners Account**: Create at [partners.shopify.com](https://partners.shopify.com)
2. **Development Store**: Create a free dev store from Partners dashboard
3. **Node.js 20+** and **npm 10+**
4. **Shopify CLI**: Installed globally or via npx

### Step 1: Create a Shopify App in Partners Dashboard

1. Go to [partners.shopify.com](https://partners.shopify.com)
2. Navigate to **Apps** → **Create app**
3. Choose **Create app manually**
4. Note down your:
   - **Client ID** (API Key)
   - **Client Secret** (API Secret Key)

### Step 2: Configure the Shopify Plugin

```bash
cd plugins/shopify

# Copy environment template
cp .env.example .env
```

Edit `.env`:
```env
SHOPIFY_API_KEY=your_client_id_from_partners
SHOPIFY_API_SECRET=your_client_secret_from_partners
DATABASE_URL=postgresql://eurocomply:eurocomply@localhost:5432/shopify_app
EUROCOMPLY_API_URL=http://localhost:3000
```

### Step 3: Setup the Database

```bash
cd plugins/shopify

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push
```

### Step 4: Start Development with Shopify CLI

```bash
# From plugins/shopify directory
npm run dev
# or
npx shopify app dev
```

**What happens:**
- Shopify CLI creates a secure tunnel (using Cloudflare)
- App is accessible via `https://your-tunnel.trycloudflare.com`
- OAuth URLs are automatically configured
- Hot Module Replacement (HMR) works out of the box

### Step 5: Install on Development Store

When you run `shopify app dev`:
1. CLI prompts you to select a development store
2. It opens a browser to install the app
3. Complete the OAuth flow
4. You're now in the embedded app!

### Step 6: Test the DPP Integration

1. **Dashboard**: View DPP sync stats
2. **Products Page**: See your Shopify products
3. **Create DPP**: Click "Create DPP" on any product
4. **Settings**: Configure EuroComply API credentials

### Shopify CLI Commands Reference

```bash
# Start development server with tunnel
npm run dev

# Build for production
npm run build

# Run type checking
npm run typecheck

# Generate Prisma client
npm run prisma generate

# Deploy app
npx shopify app deploy
```

### Testing Webhooks

Shopify CLI automatically routes webhooks through the tunnel. Test by:

1. Create/update/delete a product in your dev store
2. Check the terminal for webhook logs
3. Verify the `ProductSync` table in the database

```bash
# Connect to Shopify app database
docker exec -it eurocomply-db psql -U eurocomply -d shopify_app

# Check synced products
SELECT * FROM "ProductSync";
```

### Testing Flow Summary

```
┌─────────────────────────────────────────────────────────────────┐
│  SHOPIFY DEVELOPMENT WORKFLOW                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Create Partner Account → partners.shopify.com               │
│                    ↓                                             │
│  2. Create Development Store (free, unlimited)                  │
│                    ↓                                             │
│  3. Register App → Get API credentials                          │
│                    ↓                                             │
│  4. Run `shopify app dev` → Auto-creates tunnel                 │
│                    ↓                                             │
│  5. Install on Dev Store → Test embedded app                    │
│                    ↓                                             │
│  6. Test Products/DPPs → Webhooks work via tunnel               │
│                    ↓                                             │
│  7. Submit for App Store Review (when ready)                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## WooCommerce Testing

WooCommerce uses REST API authentication (no OAuth flow required).

### Option A: Test Against Real WooCommerce

1. **Create WooCommerce Store** (or use existing staging)
2. **Generate API Keys**:
   - WooCommerce → Settings → Advanced → REST API
   - Create keys with Read/Write permissions

3. **Test Connection**:
```bash
curl -X POST http://localhost:3000/api/woocommerce/connect \
  -H "Authorization: Bearer ec_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "siteUrl": "https://your-store.com",
    "consumerKey": "ck_xxxxx",
    "consumerSecret": "cs_xxxxx"
  }'
```

### Option B: Mock Testing

```bash
# Create mock WooCommerce connection in database
docker exec -it eurocomply-db psql -U eurocomply -d eurocomply

INSERT INTO "Organization" (id, name, slug, settings) VALUES (
  'woo-test-org',
  'Test WooCommerce Store',
  'woo-test',
  '{"woocommerce": {"siteUrl": "https://test.woocommerce.com", "connected": true}}'
);
```

---

## Verifiable Credentials Testing

### Full Stack (with walt.id)

```bash
cd docker
docker-compose up -d

# Services started:
# - postgres:5432
# - redis:6379
# - waltid-core:7000
# - waltid-signatory:7001
# - waltid-custodian:7002
# - waltid-auditor:7003
```

Test VC issuance:
```bash
# Anchor a passport (issues Verifiable Credential)
curl -X POST http://localhost:3000/v1/passports/PASSPORT_ID/anchor \
  -H "Authorization: Bearer ec_test_xxxxxxxxxxxxx"
```

### Mock Mode (without walt.id)

If walt.id services aren't running, the identity package falls back to mock credentials for development testing.

---

## Troubleshooting

### "Cannot find module '@eurocomply/database'"
```bash
npm run db:generate
```

### "Connection refused" to PostgreSQL
```bash
docker-compose up -d postgres
sleep 5  # Wait for startup
```

### Shopify CLI tunnel issues
```bash
# Reset Shopify CLI config
rm -rf ~/.config/@shopify

# Restart dev
npm run dev
```

### "Invalid API key" errors
Verify you're using the full key including prefix (e.g., `ec_test_abc123...`)

### Prisma schema drift
```bash
npx prisma db push --force-reset
npm run db:seed
```

### Webhook not receiving events
1. Ensure `shopify app dev` is running
2. Check tunnel is active in terminal output
3. Verify webhook subscriptions in Shopify admin

---

## Test Checklist

### Core API
- [ ] Health endpoint responds
- [ ] Can create product
- [ ] Can create DPP
- [ ] Can generate QR code
- [ ] Public verification works
- [ ] Lifecycle events recorded

### Shopify App
- [ ] `shopify app dev` runs successfully
- [ ] Tunnel URL is accessible
- [ ] OAuth flow completes
- [ ] App installs on dev store
- [ ] Products visible in app
- [ ] Can create DPP from product
- [ ] Settings save correctly
- [ ] Webhooks trigger on product changes

### WooCommerce
- [ ] Can connect store
- [ ] Product sync works
- [ ] DPP generation works

### Verifiable Credentials
- [ ] walt.id services start
- [ ] Can issue VC for passport
- [ ] VC verification works

---

## Next Steps

1. Complete all checklist items above
2. Write automated tests (vitest configured in `/vitest.config.ts`)
3. Submit Shopify app for App Store review
4. Deploy WooCommerce plugin to WordPress.org
