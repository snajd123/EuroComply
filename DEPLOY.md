# EuroComply Deployment & Testing Guide

Step-by-step instructions to deploy and test EuroComply locally.

---

## Prerequisites

Make sure you have installed:

- **Node.js** v20+ (`node --version`)
- **Docker** & Docker Compose (`docker --version`)
- **Git** (`git --version`)

---

## Step 1: Start Infrastructure (Database, Redis, walt.id)

```bash
# Navigate to project root
cd /home/user/EuroComply

# Start PostgreSQL, Redis, and walt.id services
docker compose -f docker/docker-compose.yml up -d
```

Wait for services to be healthy (~30 seconds):

```bash
# Check all containers are running
docker ps

# Expected output:
# eurocomply-db         (postgres)     - healthy
# eurocomply-redis      (redis)        - healthy
# eurocomply-waltid-core
# eurocomply-waltid-signatory
# eurocomply-waltid-custodian
# eurocomply-waltid-auditor
```

---

## Step 2: Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Edit with your preferred editor
nano .env
```

**Minimum required settings** (defaults work for local):

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://eurocomply:eurocomply@localhost:5432/eurocomply?schema=public
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-this-to-a-secure-random-string
```

---

## Step 3: Install Dependencies & Build

```bash
# Install all dependencies
npm install

# Generate Prisma client
npm run db:generate

# Build all packages
npm run build
```

---

## Step 4: Set Up Database

```bash
# Push schema to database
npm run db:push

# (Optional) Seed with test data
npm run db:seed
```

---

## Step 5: Start the API Server

```bash
# Development mode (hot reload)
npm run dev

# OR Production mode
npm run build && npm start
```

API will be running at: **http://localhost:3000**

---

## Step 6: Verify API is Running

```bash
# Health check
curl http://localhost:3000/health

# Expected response:
# {"status":"ok","timestamp":"2026-01-07T..."}
```

---

## Manual Testing Guide

### Test 1: Create an Organization & API Key

```bash
# 1. Create organization (direct DB or via seed)
# For testing, use Prisma Studio:
npx prisma studio --schema=packages/database/prisma/schema.prisma
```

In Prisma Studio:
1. Create an `Organization` record
2. Create an `ApiKey` record linked to the organization

### Test 2: Test API Authentication

```bash
# Replace YOUR_API_KEY with actual key
curl -X GET http://localhost:3000/v1/products \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json"
```

### Test 3: Create a Product

```bash
curl -X POST http://localhost:3000/v1/products \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Organic Cotton T-Shirt",
    "sku": "TSHIRT-001",
    "gtin": "08076800195057",
    "description": "100% organic cotton t-shirt"
  }'
```

### Test 4: Create a Digital Product Passport

```bash
# Use the product ID from previous response
curl -X POST http://localhost:3000/v1/passports \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "PRODUCT_ID_HERE",
    "data": {
      "category": "textile",
      "fiberComposition": [
        {"fiberType": "organic_cotton", "percentage": 95, "origin": "organic"},
        {"fiberType": "elastane", "percentage": 5, "origin": "conventional"}
      ],
      "countryOfManufacture": "PT",
      "manufacturer": {
        "name": "EcoTextiles Ltd",
        "country": "PT"
      },
      "careInstructions": {
        "maxWashTemperature": 30,
        "bleachAllowed": false,
        "tumbleDryAllowed": false,
        "ironTemperature": "low"
      },
      "hazardousSubstances": {
        "reachCompliant": true,
        "substancesOfConcern": []
      }
    }
  }'
```

### Test 5: Generate QR Code for Passport

```bash
curl -X POST http://localhost:3000/v1/passports/PASSPORT_ID/qr \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Test 6: Anchor Passport (Issue Verifiable Credential)

```bash
curl -X POST http://localhost:3000/v1/passports/PASSPORT_ID/anchor \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Test 7: Verify Passport

```bash
curl -X GET http://localhost:3000/v1/passports/PASSPORT_ID/verify \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Supplier Portal Testing

### Test 8: Supplier Registration

```bash
curl -X POST http://localhost:3000/v1/supplier/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "supplier@example.com",
    "password": "SecurePass123!",
    "companyName": "Test Supplier Ltd",
    "contactName": "John Doe",
    "country": "DE"
  }'
```

### Test 9: Supplier Login

```bash
curl -X POST http://localhost:3000/v1/supplier/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "supplier@example.com",
    "password": "SecurePass123!"
  }'

# Save the token from response for subsequent requests
```

### Test 10: List Public Catalog

```bash
curl -X GET http://localhost:3000/v1/supplier/catalog
```

### Test 11: Fork a Product (as Supplier)

```bash
curl -X POST http://localhost:3000/v1/supplier/products/CATALOG_PRODUCT_ID/fork \
  -H "Authorization: Bearer SUPPLIER_TOKEN"
```

---

## Testing Checklist

Use this checklist to verify all features work:

### Core DPP Flow
- [ ] Create organization
- [ ] Generate API key
- [ ] Create product
- [ ] Create passport with DPP data
- [ ] Validate DPP data (textile/electronics/furniture/battery)
- [ ] Generate QR code
- [ ] Anchor passport (issue VC)
- [ ] Verify passport

### Supplier Portal
- [ ] Register supplier account
- [ ] Login and get token
- [ ] View public catalog
- [ ] Fork product from catalog
- [ ] Submit for verification
- [ ] View earnings dashboard

### API Security
- [ ] Requests without API key return 401
- [ ] Invalid API key returns 401
- [ ] Rate limiting works (100 req/min)

### Data Validation
- [ ] Invalid GTIN rejected
- [ ] Fiber percentages must sum to 100
- [ ] Country code must be valid ISO
- [ ] Required DPP fields enforced

---

## Running Automated Tests

```bash
# Run all tests
npm run test

# Run API tests only
cd apps/api && npm test

# Run Shopify plugin tests
cd plugins/shopify && npm test

# Run with coverage
cd apps/api && npx vitest run --coverage
```

---

## Troubleshooting

### Database Connection Failed

```bash
# Check PostgreSQL is running
docker logs eurocomply-db

# Restart if needed
docker compose -f docker/docker-compose.yml restart postgres
```

### walt.id Services Not Responding

```bash
# Check walt.id logs
docker logs eurocomply-waltid-core

# Restart all walt.id services
docker compose -f docker/docker-compose.yml restart waltid-core waltid-signatory waltid-custodian waltid-auditor
```

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill it
kill -9 PID
```

### Prisma Schema Out of Sync

```bash
# Regenerate client
npm run db:generate

# Push schema changes
npm run db:push
```

---

## Stopping Everything

```bash
# Stop API (Ctrl+C if running in foreground)

# Stop Docker services
docker compose -f docker/docker-compose.yml down

# Stop and remove volumes (DELETES DATA)
docker compose -f docker/docker-compose.yml down -v
```

---

## Quick Start Script

For convenience, here's a one-liner to start everything:

```bash
# Start infrastructure, wait, then start API
docker compose -f docker/docker-compose.yml up -d && \
  sleep 10 && \
  npm install && \
  npm run db:generate && \
  npm run db:push && \
  npm run dev
```

---

## Production Deployment

For production deployment (not local testing), additional steps:

1. Use proper secrets (JWT_SECRET, API keys)
2. Set up SSL/TLS certificates
3. Configure proper domain names
4. Set up monitoring and logging
5. Use managed database (AWS RDS, etc.)
6. Deploy behind load balancer

See `docker/docker-compose.yml` with `--profile production` for containerized deployment.

---

**Last Updated**: 2026-01-07
