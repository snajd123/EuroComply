# EuroComply Implementation Plan
## "The Stripe for Trust" - Compliance Orchestration Platform

---

## 1. Executive Technical Summary

EuroComply is an API-first compliance orchestration platform targeting European SMEs facing the convergence of ESPR, eIDAS 2.0, and DSA regulations. The platform abstracts regulatory complexity into developer-friendly APIs, following Stripe's playbook.

### Core Modules
1. **ProductTrust API** - Digital Product Passport (DPP) engine
2. **WorkforceTrust API** - eIDAS 2.0 identity orchestration
3. **MerchantTrust API** - KYB/DSA trader verification

---

## 2. Technology Stack Decisions

### Backend Framework
**Recommendation: Node.js + TypeScript + Express/Fastify**

| Option | Pros | Cons |
|--------|------|------|
| Node.js/TypeScript | Stripe-like DX, async I/O, huge ecosystem, easy hiring | Not ideal for CPU-intensive tasks |
| Python/FastAPI | Great for AI integration, scientific libs | Slower, GIL limitations |
| Go | Performance, concurrency | Smaller ecosystem, steeper learning |

**Decision**: Node.js/TypeScript for Stripe-like developer experience and ecosystem

### Database
**Recommendation: PostgreSQL + Redis**

- **PostgreSQL**: Primary data store (ACID compliance, JSON support, mature)
- **Redis**: Caching, session management, rate limiting
- **ORM**: Prisma (type-safe, migrations, great DX)

### Authentication & Security
- **JWT + API Keys**: For API authentication (Stripe-style)
- **OAuth 2.0/OIDC**: For dashboard access
- **Encryption**: AES-256 for data at rest, TLS 1.3 in transit

### Identity & Credentials Stack
**Using walt.id Community Stack (FREE, Apache 2.0)**

- W3C Verifiable Credentials support
- SD-JWT (Selective Disclosure)
- OID4VCI/OID4VP protocols (wallet compatibility)
- EBSI compatibility built-in (for future upgrade)

### DID Strategy: did:web Now, did:ebsi Later

**Phase 1 (MVP)**: Use `did:web`
- `did:web:eurocomply.io` (platform identity)
- `did:web:eurocomply.io:m:{merchant-slug}` (merchant identities)
- Works immediately, no EBSI registration required
- Fully verifiable, industry standard

**Phase 2 (With Traction)**: Upgrade to `did:ebsi`
- Apply for EBSI Trusted Issuer status when we have customers
- Flip config flag to switch DID method
- Existing credentials (did:web) remain valid
- New credentials use did:ebsi

**Architecture**: Abstract DID creation behind service layer
- Single config change to switch methods
- No code changes required for migration
- Support both methods simultaneously if needed

### Blockchain/DLT Anchoring
- **Target**: EBSI (European Blockchain Services Infrastructure)
- **Current**: did:web (no blockchain, cryptographic signatures only)
- **Future**: did:ebsi via walt.id when EBSI access obtained
- **Strategy**: Build EBSI-ready, activate when business traction achieved

### QR Code & Standards
- **GS1 Digital Link**: gs1-digital-link-tools library
- **QR Generation**: qrcode library with custom styling

### AI/ML Integration
- **LLM**: OpenAI GPT-4 or Anthropic Claude for document parsing
- **OCR**: Tesseract or AWS Textract for PDF extraction

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                 │
├─────────────────┬─────────────────┬─────────────────────────────────┤
│  Developer API  │  Dashboard UI   │  E-commerce Plugins             │
│  (REST/GraphQL) │  (React/Next.js)│  (Shopify, WooCommerce)         │
└────────┬────────┴────────┬────────┴──────────────┬──────────────────┘
         │                 │                        │
         ▼                 ▼                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         API GATEWAY                                  │
│  • Rate Limiting  • Auth  • Request Validation  • Logging           │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────┐
│  ProductTrust   │    │  WorkforceTrust │    │   MerchantTrust     │
│     Service     │    │     Service     │    │      Service        │
├─────────────────┤    ├─────────────────┤    ├─────────────────────┤
│ • DPP CRUD      │    │ • Credential    │    │ • KYB Verification  │
│ • GS1 Links     │    │   Issuance      │    │ • DSA Compliance    │
│ • QR Generation │    │ • Background    │    │ • Sanctions Check   │
│ • Unsold Goods  │    │   Checks        │    │ • UBO Registry      │
│ • ESPR Reports  │    │ • Diploma       │    │ • Audit Trail       │
│                 │    │   Verification  │    │                     │
└────────┬────────┘    └────────┬────────┘    └──────────┬──────────┘
         │                      │                        │
         └──────────────────────┼────────────────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         │                      │                      │
         ▼                      ▼                      ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────┐
│   Identity      │    │    AI/ML        │    │    Integration      │
│   Engine        │    │    Engine       │    │    Hub              │
│  (walt.id)      │    │                 │    │                     │
├─────────────────┤    ├─────────────────┤    ├─────────────────────┤
│ • VC Issuance   │    │ • Doc Parsing   │    │ • Business Regs     │
│ • SD-JWT        │    │ • Auto-fill     │    │ • EBSI Connector    │
│ • Wallet APIs   │    │ • Risk Scoring  │    │ • E-commerce APIs   │
│ • EBSI Bridge   │    │ • OCR           │    │ • Webhook Dispatch  │
└────────┬────────┘    └────────┬────────┘    └──────────┬──────────┘
         │                      │                        │
         └──────────────────────┼────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                                   │
├─────────────────┬─────────────────┬─────────────────────────────────┤
│   PostgreSQL    │     Redis       │    Object Storage (S3)          │
│   (Primary DB)  │    (Cache)      │    (Documents, QR images)       │
└─────────────────┴─────────────────┴─────────────────────────────────┘
```

---

## 4. Database Schema Design

### Core Entities

```
Organizations (Tenants)
├── api_keys
├── subscriptions
├── team_members
└── webhooks

Products (DPP)
├── product_attributes
├── sustainability_claims
├── gtin_assignments
├── qr_codes
├── lifecycle_events (unsold goods tracking)
└── blockchain_anchors

Credentials (Workforce)
├── credential_schemas
├── issued_credentials
├── verification_requests
└── background_checks

Merchants (KYB)
├── kyb_verifications
├── trader_profiles
├── compliance_documents
└── sanctions_checks

AuditLogs (All modules)
```

---

## 5. API Design (Stripe-Style)

### Authentication
```bash
# API Key in header (like Stripe)
curl https://api.eurocomply.io/v1/passports \
  -H "Authorization: Bearer sk_live_xxxxx"
```

### ProductTrust API Endpoints
```
POST   /v1/passports                    # Create DPP
GET    /v1/passports/:id                # Retrieve DPP
PATCH  /v1/passports/:id                # Update DPP
DELETE /v1/passports/:id                # Archive DPP
GET    /v1/passports                    # List DPPs

POST   /v1/passports/:id/qr             # Generate QR code
POST   /v1/passports/:id/anchor         # Anchor to blockchain
POST   /v1/passports/:id/lifecycle      # Log lifecycle event

GET    /v1/reports/unsold-goods         # ESPR destruction report
GET    /v1/reports/sustainability       # Sustainability metrics
```

### WorkforceTrust API Endpoints
```
POST   /v1/credentials/issue            # Issue VC to wallet
POST   /v1/credentials/verify           # Verify presented VC
GET    /v1/credentials/:id              # Get credential status

POST   /v1/verifications/background     # Background check
POST   /v1/verifications/diploma        # Diploma verification
POST   /v1/verifications/employment     # Employment verification

GET    /v1/schemas                      # List credential schemas
POST   /v1/schemas                      # Create custom schema
```

### MerchantTrust API Endpoints
```
POST   /v1/kyb/verify                   # Start KYB verification
GET    /v1/kyb/:id                      # Get verification status
GET    /v1/kyb/:id/report               # Get full KYB report

POST   /v1/traders                      # Onboard trader (DSA)
GET    /v1/traders/:id                  # Get trader profile
GET    /v1/traders/:id/compliance       # DSA compliance status

POST   /v1/sanctions/check              # Sanctions screening
POST   /v1/ubo/lookup                   # UBO registry lookup
```

### Webhook Events
```
passport.created
passport.updated
passport.anchored
credential.issued
credential.verified
kyb.completed
kyb.failed
trader.onboarded
trader.flagged
```

---

## 6. Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Goal**: Core infrastructure and authentication

- [ ] Project scaffolding (monorepo with Turborepo)
- [ ] Database setup (Prisma + PostgreSQL)
- [ ] Authentication system (API keys, JWT)
- [ ] Rate limiting and request validation
- [ ] Error handling framework
- [ ] Logging and monitoring setup
- [ ] Basic tenant/organization management

**Deliverable**: Working API skeleton with auth

### Phase 2: ProductTrust API (Week 3-4)
**Goal**: Full DPP lifecycle management

- [ ] Product/Passport CRUD operations
- [ ] GS1 Digital Link generation
- [ ] QR code generation with styling
- [ ] Attribute management (CIRPASS schema)
- [ ] Sustainability claims tracking
- [ ] Lifecycle event logging (unsold goods)
- [ ] ESPR compliance reports
- [ ] Blockchain anchoring (hash-based)

**Deliverable**: Complete ProductTrust API

### Phase 3: WorkforceTrust API (Week 5-6)
**Goal**: Identity and credential orchestration

- [ ] walt.id integration setup
- [ ] Verifiable Credential issuance
- [ ] SD-JWT implementation
- [ ] OID4VCI/OID4VP flows
- [ ] Background check aggregation
- [ ] Diploma verification (EBSI bridge)
- [ ] Credential schema management
- [ ] Wallet interaction APIs

**Deliverable**: Complete WorkforceTrust API

### Phase 4: MerchantTrust API (Week 7-8)
**Goal**: KYB and DSA compliance automation

- [ ] KYB verification workflow
- [ ] Business registry integrations
- [ ] VAT validation (VIES)
- [ ] Sanctions list screening
- [ ] UBO registry lookups
- [ ] DSA trader onboarding flow
- [ ] Compliance audit trail
- [ ] Risk scoring engine

**Deliverable**: Complete MerchantTrust API

### Phase 5: AI & Integrations (Week 9-10)
**Goal**: Intelligence layer and e-commerce

- [ ] Document parsing (PDF/invoice extraction)
- [ ] Auto-fill DPP from datasheets
- [ ] Greenwashing risk detection
- [ ] Shopify app/plugin
- [ ] WooCommerce plugin
- [ ] Webhook system
- [ ] Bulk import/export APIs

**Deliverable**: AI features + e-commerce integrations

### Phase 6: Dashboard & Polish (Week 11-12)
**Goal**: Developer portal and management UI

- [ ] Developer documentation (OpenAPI/Swagger)
- [ ] API playground
- [ ] Management dashboard (React)
- [ ] Analytics and usage metrics
- [ ] Billing/subscription integration
- [ ] Security audit and hardening

**Deliverable**: Production-ready platform

---

## 7. Directory Structure

```
eurocomply/
├── apps/
│   ├── api/                    # Main API server
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── product-trust/
│   │   │   │   ├── workforce-trust/
│   │   │   │   └── merchant-trust/
│   │   │   ├── common/
│   │   │   │   ├── auth/
│   │   │   │   ├── middleware/
│   │   │   │   └── utils/
│   │   │   ├── integrations/
│   │   │   │   ├── ebsi/
│   │   │   │   ├── waltid/
│   │   │   │   └── registries/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── dashboard/              # Admin dashboard (Next.js)
│   └── docs/                   # Documentation site
│
├── packages/
│   ├── database/               # Prisma schema & migrations
│   ├── sdk/                    # TypeScript SDK for customers
│   ├── shared/                 # Shared types and utilities
│   └── gs1-tools/              # GS1 Digital Link utilities
│
├── plugins/
│   ├── shopify/                # Shopify app
│   └── woocommerce/            # WooCommerce plugin
│
├── docker/
│   ├── docker-compose.yml
│   └── Dockerfile
│
├── turbo.json
├── package.json
└── README.md
```

---

## 8. Key Technical Decisions Needed

### Questions for Discussion:

1. **Monolith vs Microservices?**
   - Recommendation: Start monolith, extract services later
   - Rationale: Faster iteration, easier debugging initially

2. **GraphQL vs REST?**
   - Recommendation: REST primary, GraphQL optional
   - Rationale: Stripe-like simplicity, broader adoption

3. **Self-hosted vs Cloud-native?**
   - Recommendation: Cloud-native (AWS/GCP) with Docker option
   - Rationale: Target SMEs won't self-host

4. **Real-time features?**
   - Recommendation: Webhooks primary, WebSockets for dashboard
   - Rationale: Webhook pattern proven (Stripe)

5. **Multi-tenancy approach?**
   - Recommendation: Shared database, row-level security
   - Rationale: Cost-effective for SME pricing model

6. **Compliance certifications to target?**
   - ISO 27001, SOC 2 Type II, GDPR compliance
   - QTSP status for eIDAS (longer term)

---

## 9. Confirmed Build Scope

**Building ALL THREE APIs** simultaneously for maximum efficiency:

### Full Platform Features
1. ✅ API authentication (API keys)
2. ✅ **ProductTrust API** - DPP CRUD, GS1 Digital Link, QR codes, ESPR reports
3. ✅ **WorkforceTrust API** - Credential issuance, SD-JWT, background checks
4. ✅ **MerchantTrust API** - KYB verification, DSA compliance, sanctions
5. ✅ React Dashboard (included from start)
6. ✅ Shopify integration
7. ✅ WooCommerce integration
8. ✅ EBSI-only blockchain anchoring via walt.id

### Deployment
- Cloud-native (GDPR-compliant EU hosting)
- AWS EU regions or equivalent

---

## 10. Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| ESPR spec changes | High | Schema-agnostic data model |
| walt.id breaking changes | Medium | Abstraction layer, pinned versions |
| EBSI availability | Medium | Retry logic, local caching, graceful degradation |
| Scaling issues | Medium | Horizontal scaling design |
| Security breach | Critical | Non-custodial architecture, encryption |

---

## 11. Success Metrics

### Technical KPIs
- API latency < 200ms (p95)
- 99.9% uptime SLA
- < 0.1% error rate
- Time to first passport < 5 minutes

### Business KPIs (from plan)
- Year 1: 1,000 merchants, €1.5M revenue
- Year 2: 5,000 merchants, €8M revenue
- Year 5: 120,000 merchants, €150M ARR

---

## 12. Confirmed Decisions

| Decision | Confirmed Choice |
|----------|------------------|
| **Technology stack** | Node.js/TypeScript/PostgreSQL ✅ |
| **Architecture** | Monolith-first ✅ |
| **Identity stack** | walt.id Community Stack (FREE) ✅ |
| **DID method (MVP)** | did:web (no EBSI registration needed) ✅ |
| **DID method (Future)** | did:ebsi (when traction achieved) ✅ |
| **Build scope** | All 3 APIs simultaneously ✅ |
| **Dashboard** | React dashboard included ✅ |
| **Deployment** | Cloud-native, GDPR-compliant EU ✅ |
| **E-commerce** | Shopify + WooCommerce ✅ |

## 13. EBSI Roadmap (Future Milestone)

EBSI integration is planned for when EuroComply has business traction.

### Trigger Criteria (Any of these)
- 50+ paying customers
- €10K+ MRR
- Enterprise customer requiring EBSI
- EBSI onboarding process becomes simpler

### EBSI Activation Steps
1. Apply to EBSI Support Office for Trusted Issuer status
2. Complete EU Survey and accreditation process
3. Register credential schemas on EBSI Trusted Schemas Registry
4. Obtain EBSI bearer token / access credentials
5. Update config: `DID_METHOD=ebsi`
6. Test with EBSI conformance environment
7. Switch to EBSI production
8. Offer "EBSI-anchored" as premium feature

### What EBSI Adds
- Listed in EU Trusted Issuers Registry
- Credentials anchored to EU government blockchain
- Full eIDAS 2.0 legal recognition
- Enhanced trust for enterprise customers
- "Powered by EBSI" marketing badge

### Current State (MVP)
- Using: did:web via walt.id Community Stack
- Credentials: Cryptographically signed, W3C standard
- Verifiable: Yes (anyone can verify)
- EBSI-ready: Yes (architecture supports upgrade)

## 14. Related Documentation

- **[EBSI Integration Plan](./docs/EBSI_INTEGRATION_PLAN.md)** - Detailed EBSI architecture via walt.id

## Ready for Implementation

All decisions confirmed. Proceeding with full platform build using:
- **walt.id Community Stack** (free, open source)
- **did:web** identities (upgrade to did:ebsi later)
- **W3C Verifiable Credentials** (industry standard)
