# EuroComply

**Digital Product Passport SaaS for SME Suppliers**

EuroComply provides affordable DPP (Digital Product Passport) infrastructure for SME manufacturers, importers, and brands preparing for the EU Ecodesign for Sustainable Products Regulation (ESPR).

## 🎯 Our Focus: SMEs

**99% of EU businesses are SMEs. Zero affordable DPP solutions exist for them.**

Enterprise has SAP, Siemens, Catena-X. SMEs have nothing. We fill that gap.

| What We Offer | What We Don't |
|---------------|---------------|
| €49-399/month SaaS | €100k+ enterprise solutions |
| Self-service, same-day setup | Months of implementation |
| No IT team required | Complex ERP integration |
| Portable data (did:key) | Platform lock-in |

## 💼 Business Model

### Supplier-Pays SaaS (ESPR Article 31 Compliant)

**Suppliers pay** for DPP creation tools. **Retailers access free** (EU law mandates free access).

```
┌─────────────────────────────────────────────────────────────────┐
│  SUPPLIERS PAY                          RETAILERS ACCESS FREE   │
│  ─────────────                          ────────────────────    │
│  Producers, Importers, Brands           Shopify, WooCommerce    │
│  €49-399/month SaaS                     €0 (ESPR Article 31)    │
│                                                                  │
│  Create DPPs → Managed hosting → Retailers display on stores   │
└─────────────────────────────────────────────────────────────────┘
```

### Pricing Tiers

| Tier | Monthly | DPPs | Features |
|------|---------|------|----------|
| **Starter** | €49 | 50 | Creator studio, VCs, hosting, QR codes |
| **Growth** | €149 | 500 | + CSV import, templates, priority support |
| **Pro** | €399 | 2,000 | + API access, white-label, dedicated support |

*No Enterprise tier. Large companies use SAP/Siemens.*

## 🎯 What We Do

### Digital Product Passports (DPPs)

- **DPP Creator Studio** - Category-specific forms for textiles, electronics, batteries
- **Verifiable Credentials** - W3C VCs with did:key (portable, self-verifying)
- **QR Code Generation** - GS1 Digital Link compliant
- **Managed Hosting** - EU data residency (while subscribed)
- **Data Sovereignty** - Self-contained VCs with all data embedded, export anytime
- **No Lock-in** - VCs verify offline, forever, without EuroComply
- **Public Verification** - Anyone can verify a product's passport

### Free Retailer Access

ESPR Article 31 mandates free DPP access for economic operators.

- **Shopify/WooCommerce plugins** - Browse supplier catalog, link DPPs
- **No subscription fees** - Retailers never pay for DPP access
- **Display on storefront** - Embedded widget, QR codes

## 🛒 E-commerce Integrations

Automatically sync products from your existing store:

| Platform | Status | Features |
|----------|--------|----------|
| **Shopify** | Ready | OAuth install, auto-sync, QR to metafields |
| **WooCommerce** | Ready | API key connect, auto-sync, QR to meta |

See [E-commerce Integrations Guide](docs/ECOMMERCE_INTEGRATIONS.md) for setup instructions.

## 🏗️ Architecture

```
eurocomply/
├── apps/
│   ├── api/           # Express.js API server
│   │   └── modules/
│   │       ├── product-trust/   # DPP management
│   │       ├── integrations/    # E-commerce sync
│   │       └── supplier/        # Supplier marketplace
│   └── frontend/      # Next.js landing & supplier portal
├── packages/
│   ├── database/      # Prisma schema & migrations
│   ├── identity/      # walt.id integration (VCs)
│   ├── integrations/  # Shopify & WooCommerce sync
│   ├── sdk/           # Client SDK
│   └── shared/        # Shared types & utilities
├── plugins/
│   └── shopify/       # Shopify embedded app (Remix)
├── docker/            # Docker configuration
└── infrastructure/
    └── aws/           # AWS CloudFormation & deployment
```

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- Git

### Local Development Setup

> **Production Deployment**: For AWS-based production infrastructure (EU/GDPR compliant), see [INFRASTRUCTURE.md](./INFRASTRUCTURE.md)

1. **Clone and install dependencies**
```bash
git clone https://github.com/your-org/eurocomply.git
cd eurocomply
npm install
```

2. **Start infrastructure (Docker)**
```bash
cd docker
docker-compose up -d postgres
```

3. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Initialize database**
```bash
npm run db:generate
npm run db:push
npm run db:seed
```

5. **Start development server**
```bash
npm run dev
```

The API will be available at `http://localhost:3000`

### With walt.id (for Verifiable Credentials)
```bash
cd docker
docker-compose up -d  # Starts all services including walt.id stack
```

## 📚 API Usage

### Authentication
All API requests require an API key:
```bash
curl https://api.eurocomply.eu/v1/products \
  -H "Authorization: Bearer ec_live_xxxxx"
```

### Create a Product
```bash
curl -X POST https://api.eurocomply.eu/v1/products \
  -H "Authorization: Bearer ec_live_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sustainable T-Shirt",
    "gtin": "5901234123457",
    "sku": "TSHIRT-001"
  }'
```

### Create a Digital Product Passport
```bash
curl -X POST https://api.eurocomply.eu/v1/passports \
  -H "Authorization: Bearer ec_live_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "prod_xxx",
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
        { "name": "Organic Cotton", "percentage": 95 },
        { "name": "Elastane", "percentage": 5 }
      ]
    }
  }'
```

### Generate QR Code
```bash
curl -X POST https://api.eurocomply.eu/v1/passports/pass_xxx/qr \
  -H "Authorization: Bearer ec_live_xxxxx"
```

### Record Lifecycle Event
```bash
curl -X POST https://api.eurocomply.eu/v1/products/prod_xxx/events \
  -H "Authorization: Bearer ec_live_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "DESTROYED",
    "quantity": 50,
    "reason": "End of season - unsold inventory",
    "description": "Donated to textile recycling facility"
  }'
```

### Public Verification (No Auth)
```bash
curl https://api.eurocomply.eu/v1/passports/pass_xxx/verify
```

### Export DPP (Data Sovereignty)
```bash
# Get supplier's DID
curl https://api.eurocomply.eu/v1/suppliers/export/did \
  -H "Authorization: Bearer ec_live_xxxxx"

# Export DPP as portable package
curl -X POST https://api.eurocomply.eu/v1/suppliers/export/dpp/prod_xxx \
  -H "Authorization: Bearer ec_live_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{"includePrivateKey": false}'

# Download offline HTML viewer
curl https://api.eurocomply.eu/v1/suppliers/export/viewer/prod_xxx \
  -H "Authorization: Bearer ec_live_xxxxx" \
  -o dpp-viewer.html
```

## ☁️ Infrastructure

EuroComply uses a **hybrid deployment**:
- **Frontend**: Vercel (CDN, instant deploys)
- **Backend**: AWS eu-central-1 (Frankfurt) for EU/GDPR compliance

### Backend Stack (AWS)

| Component | Service | Configuration |
|-----------|---------|---------------|
| Compute | ECS Fargate | Auto-scaling 2-10 tasks |
| Database | RDS PostgreSQL 16 | Multi-AZ, encrypted |
| Cache | ElastiCache Redis 7 | Session & DPP cache |
| Load Balancer | ALB | HTTPS termination |
| Secrets | Secrets Manager | JWT, DB credentials |

### Quick Deploy

```bash
# Set secrets
export DB_PASSWORD="secure-password"
export JWT_SECRET="32-char-minimum-secret"

# Deploy to AWS
cd infrastructure/aws/scripts
./deploy.sh production
```

See [infrastructure/aws/README.md](./infrastructure/aws/README.md) for full deployment guide.

## 🔐 Identity & Credentials

EuroComply uses **walt.id Community Stack** for W3C Verifiable Credentials:

- **DID Methods**: `did:web` (production) + `did:key` (portable, offline verification)
- **Credential Format**: W3C Verifiable Credentials, JWT
- **Export**: ✅ Full data portability (self-contained VCs, key export)

Each product passport is issued as a cryptographically signed Verifiable Credential.

## 🔓 Data Sovereignty ✅ COMPLETE

**Your data, your rules, our tools.** See [DATA_SOVEREIGNTY.md](docs/DATA_SOVEREIGNTY.md) for architecture.

| Guarantee | Status |
|-----------|--------|
| **You own your data** | ✅ Self-contained VCs with all data embedded |
| **No lock-in** | ✅ Open standards (W3C VC, JSON) |
| **Offline verification** | ✅ did:key - verify without any server |
| **One-click export** | ✅ VC + images + offline HTML viewer |
| **Key portability** | ✅ Export/import private keys |

```typescript
// Example: Create portable DPP export
const package = await vcExportService.exportPortablePackage({
  issuerDid: did,
  issuerKeyId: keyId,
  subjectId: 'urn:gtin:1234567890123',
  dppData: passportData,
  includePrivateKey: true,
});
// Returns: credential.json, viewer.html, public-key.jwk, private-key.jwk
```

## 📋 Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/eurocomply

# API
PORT=3000
API_HOST=api.eurocomply.eu
DASHBOARD_URL=https://dashboard.eurocomply.eu

# walt.id (Verifiable Credentials)
WALTID_CORE_API=http://localhost:7000
WALTID_SIGNATORY_API=http://localhost:7001
WALTID_CUSTODIAN_API=http://localhost:7002
WALTID_AUDITOR_API=http://localhost:7003

# Shopify Integration
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret

# WooCommerce Integration
WOOCOMMERCE_WEBHOOK_SECRET=your_webhook_secret
```

## 📦 ESPR Timeline

| Milestone | Date | What It Means |
|-----------|------|---------------|
| ESPR enters into force | July 2024 | Framework law active |
| First delegated acts | 2025-2026 | Product-specific rules |
| DPP requirements begin | 2027+ | Passports required for covered products |

**First product categories**: Textiles, batteries, electronics, furniture

## 🗺️ Roadmap

### Completed ✅
- [x] Core API infrastructure
- [x] Product & Passport management
- [x] QR code generation (GS1 Digital Link)
- [x] Verifiable Credential issuance (walt.id)
- [x] Lifecycle event tracking
- [x] Shopify integration (OAuth + embedded app)
- [x] WooCommerce integration
- [x] Textile DPP schema & validation
- [x] DPP data collection UI (Shopify app)
- [x] Higg MSI carbon footprint calculation
- [x] Supplier SaaS portal (registration, verification, catalog)
- [x] Free retailer access (ESPR Article 31 compliant)
- [x] **Data Sovereignty (Phase 3.5)**:
  - [x] did:key implementation (Ed25519, P-256)
  - [x] Self-contained VCs (all data embedded)
  - [x] Offline verification
  - [x] Key export/import for portability
  - [x] Offline HTML viewer generation
  - [x] API endpoints for data export

### In Progress 🔄
- [ ] React Dashboard (Supplier Portal UI)

### Future 📋
- [ ] Furniture & Electronics schemas
- [ ] GS1 Digital Link resolver
- [ ] Basic AAS export (compliance format)
- [ ] Batch passport generation
- [ ] Item-level tracking (serial numbers)

## 📄 License

Proprietary - All rights reserved

## 🤝 Support

- Documentation: https://docs.eurocomply.eu
- Support: support@eurocomply.eu
