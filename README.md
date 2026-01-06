# EuroComply

**"The Stripe for Trust"** - Compliance Orchestration Platform for European SMEs

EuroComply provides API-first compliance automation for businesses navigating ESPR, eIDAS 2.0, and DSA regulations.

## 🎯 Core Modules

### ProductTrust API
Digital Product Passport (DPP) engine for ESPR compliance:
- Product lifecycle management
- GS1 Digital Link QR codes
- Sustainability claims tracking
- Unsold goods reporting (ESPR Article 20)

### WorkforceTrust API
eIDAS 2.0 identity orchestration:
- Verifiable Credential issuance (via walt.id)
- SD-JWT selective disclosure
- Background check verification
- Diploma/employment verification

### MerchantTrust API
KYB and DSA trader verification:
- VAT validation (VIES)
- Business registry checks
- Sanctions screening
- UBO registry lookups
- DSA compliance automation

## 🏗️ Architecture

```
eurocomply/
├── apps/
│   ├── api/           # Express.js API server
│   └── dashboard/     # Next.js admin dashboard
├── packages/
│   ├── database/      # Prisma schema & migrations
│   └── shared/        # Shared types & utilities
├── plugins/
│   ├── shopify/       # Shopify app integration
│   └── woocommerce/   # WooCommerce plugin
└── docker/            # Docker configuration
```

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- Docker (optional)

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
docker-compose up -d postgres redis
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

### With walt.id (for credential issuance)
```bash
cd docker
docker-compose up -d  # Starts all services including walt.id stack
```

## 📚 API Usage

### Authentication
All API requests require an API key in the Authorization header:
```bash
curl https://api.eurocomply.io/v1/products \
  -H "Authorization: Bearer ec_live_xxxxx"
```

### Create Organization
```bash
curl -X POST https://api.eurocomply.io/v1/auth/organizations \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Company",
    "slug": "my-company"
  }'
```

### Create Product & Passport
```bash
# Create product
curl -X POST https://api.eurocomply.io/v1/products \
  -H "Authorization: Bearer ec_live_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sustainable T-Shirt",
    "gtin": "5901234123457"
  }'

# Create DPP
curl -X POST https://api.eurocomply.io/v1/passports \
  -H "Authorization: Bearer ec_live_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "prod_xxx",
    "data": {
      "productId": "prod_xxx",
      "productName": "Sustainable T-Shirt",
      "manufacturerName": "My Company",
      "carbonFootprint": { "value": 5.2, "unit": "kgCO2e" }
    }
  }'

# Generate QR code
curl -X POST https://api.eurocomply.io/v1/passports/pass_xxx/qr \
  -H "Authorization: Bearer ec_live_xxxxx"
```

### Issue Verifiable Credential
```bash
curl -X POST https://api.eurocomply.io/v1/credentials/issue \
  -H "Authorization: Bearer ec_live_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "schemaId": "schema_xxx",
    "subjectName": "John Doe",
    "subjectEmail": "john@example.com",
    "claims": {
      "employeeId": "EMP001",
      "department": "Engineering"
    }
  }'
```

### KYB Verification
```bash
curl -X POST https://api.eurocomply.io/v1/kyb/verify \
  -H "Authorization: Bearer ec_live_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "legalName": "Acme GmbH",
    "vatNumber": "DE123456789",
    "country": "DE"
  }'
```

## 🔐 Identity Stack

EuroComply uses **walt.id Community Stack** for credential issuance:

- **DID Method (MVP)**: `did:web` - Works immediately, no registration needed
- **DID Method (Future)**: `did:ebsi` - When EBSI Trusted Issuer status obtained
- **Credential Format**: W3C Verifiable Credentials, SD-JWT
- **Wallet Protocols**: OID4VCI, OID4VP

### Merchant DIDs
Each merchant gets their own DID:
```
did:web:eurocomply.io:m:{merchant-slug}
```

## 📋 Environment Variables

See `.env.example` for all configuration options:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `DID_METHOD` | `web` (default) or `ebsi` |
| `WALTID_CORE_API` | walt.id Core API URL |

## 🧪 Testing

```bash
npm run test        # Run all tests
npm run test:watch  # Watch mode
```

## 📦 Production Deployment

### Docker
```bash
cd docker
docker-compose --profile production up -d
```

### Cloud (AWS/GCP)
See deployment guides in `/docs/deployment/`

## 🗺️ Roadmap

- [x] Core API infrastructure
- [x] ProductTrust API (DPP)
- [x] WorkforceTrust API (Credentials)
- [x] MerchantTrust API (KYB/DSA)
- [ ] React Dashboard
- [ ] Shopify Integration
- [ ] WooCommerce Integration
- [ ] EBSI Integration (with traction)

## 📄 License

Proprietary - All rights reserved

## 🤝 Support

- Documentation: https://docs.eurocomply.io
- Support: support@eurocomply.io
