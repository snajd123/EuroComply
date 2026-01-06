# EuroComply

**Digital Product Passport Infrastructure for ESPR Compliance**

EuroComply provides API-first Digital Product Passport (DPP) infrastructure for manufacturers and brands preparing for the EU Ecodesign for Sustainable Products Regulation (ESPR).

## 🎯 What We Do

### Digital Product Passports (DPPs)

Complete DPP lifecycle management for ESPR compliance:

- **Product Registration** - Create and manage product records
- **Passport Generation** - Issue W3C Verifiable Credentials for products
- **QR Code Generation** - GS1 Digital Link compliant QR codes
- **Sustainability Claims** - Track and verify environmental claims
- **Lifecycle Events** - Manufacturing, shipping, recycling, destruction
- **Unsold Goods Reporting** - ESPR Article 20 compliance
- **Public Verification** - Anyone can verify a product's passport

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
│   └── dashboard/     # Next.js admin dashboard
├── packages/
│   ├── database/      # Prisma schema & migrations
│   ├── identity/      # walt.id integration (VCs)
│   ├── integrations/  # Shopify & WooCommerce sync
│   ├── sdk/           # Client SDK
│   └── shared/        # Shared types & utilities
└── docker/            # Docker configuration
```

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- Docker (optional, for walt.id)

### Development Setup

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
curl https://api.eurocomply.io/v1/products \
  -H "Authorization: Bearer ec_live_xxxxx"
```

### Create a Product
```bash
curl -X POST https://api.eurocomply.io/v1/products \
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
curl -X POST https://api.eurocomply.io/v1/passports \
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
curl -X POST https://api.eurocomply.io/v1/passports/pass_xxx/qr \
  -H "Authorization: Bearer ec_live_xxxxx"
```

### Record Lifecycle Event
```bash
curl -X POST https://api.eurocomply.io/v1/products/prod_xxx/events \
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
curl https://api.eurocomply.io/v1/passports/pass_xxx/verify
```

## 🔐 Identity & Credentials

EuroComply uses **walt.id Community Stack** for W3C Verifiable Credentials:

- **DID Method**: `did:web` (e.g., `did:web:eurocomply.io:p:product-id`)
- **Credential Format**: W3C Verifiable Credentials, JWT
- **Future**: EBSI integration when regulatory traction exists

Each product passport is issued as a cryptographically signed Verifiable Credential that can be independently verified.

## 📋 Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/eurocomply

# API
PORT=3000
API_HOST=api.eurocomply.io
DASHBOARD_URL=https://dashboard.eurocomply.io

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

- [x] Core API infrastructure
- [x] Product & Passport management
- [x] QR code generation (GS1 Digital Link)
- [x] Verifiable Credential issuance
- [x] Lifecycle event tracking
- [x] Shopify integration
- [x] WooCommerce integration
- [ ] React Dashboard
- [ ] EBSI integration (when mature)
- [ ] Batch passport generation
- [ ] Supply chain integration

## 📄 License

Proprietary - All rights reserved

## 🤝 Support

- Documentation: https://docs.eurocomply.io
- Support: support@eurocomply.io
