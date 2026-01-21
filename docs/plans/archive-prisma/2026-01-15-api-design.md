# API Design

**Status:** Draft
**Date:** 2026-01-15
**Source:** API_REFERENCE.md

---

## 1. Overview

EuroComply exposes a RESTful API for product management, DPP issuance, and integrations. The API follows industry best practices for consistency, security, and developer experience.

### Design Principles

| Principle | Implementation |
|-----------|----------------|
| **REST over GraphQL** | Simpler, cacheable, well-understood |
| **JSON only** | No XML, consistent parsing |
| **Versioned** | URL-based versioning (`/api/v1/`) |
| **Consistent** | Standard response envelope, error codes |
| **Secure by default** | Auth required, scoped API keys |

---

## 2. Why REST

| Factor | REST | GraphQL |
|--------|------|---------|
| **Caching** | Native HTTP caching | Complex |
| **Learning curve** | Low | Medium |
| **Tooling** | Mature | Growing |
| **Our use case** | CRUD operations, simple queries | Over-engineering |

GraphQL complexity not justified for our domain. REST with good filtering/pagination covers all use cases.

---

## 3. Authentication Strategy

### Two Authentication Methods

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION METHODS                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  METHOD 1: Session (Dashboard Users)                            │
│  ───────────────────────────────────                            │
│  • Clerk-managed JWT tokens                                     │
│  • HttpOnly secure cookies                                      │
│  • Automatic refresh                                            │
│  • Used by: Web dashboard                                       │
│                                                                  │
│  METHOD 2: API Keys (Integrations)                              │
│  ─────────────────────────────────                              │
│  • Format: ec_live_<32-hex-chars>                               │
│  • Scoped permissions (products:read, passports:write)          │
│  • SHA-256 hashed storage                                       │
│  • Used by: Shopify, external systems, automation               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### API Key Scopes

| Scope | Description | Endpoints |
|-------|-------------|-----------|
| `products:read` | Read product data | GET /products/* |
| `products:write` | Create/update products | POST, PUT /products/* |
| `passports:read` | Read DPPs | GET /passports/* |
| `passports:write` | Issue DPPs | POST /passports/* |
| `attestations:read` | Read attestations | GET /attestations/* |
| `attestations:write` | Manage attestation requests | POST /attestations/* |
| `admin:organization` | Organization settings | /organization/* |
| `admin:users` | User management | /users/* |

### Why Scoped Keys

- **Principle of least privilege** - Integration only gets what it needs
- **Blast radius** - Compromised key has limited damage
- **Audit clarity** - Know what each key can do

---

## 4. Versioning Strategy

### URL-Based Versioning

```
https://api.eurocomply.eu/v1/products
https://api.eurocomply.eu/v2/products  (future)
```

**Why URL versioning over headers:**
- Explicit and visible
- Easy to test in browser
- Clear documentation
- No header parsing complexity

### Deprecation Policy

| Phase | Timeline | Action |
|-------|----------|--------|
| Announcement | -12 months | Email + dashboard banner |
| Sunset warning | -6 months | Deprecation header in responses |
| Migration period | -3 months | Both versions active |
| End of life | Day 0 | Old version returns 410 Gone |

---

## 5. Response Envelope

### Standard Format

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2026-01-15T10:00:00Z"
  }
}
```

### Error Format

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": { "field": "gtin", "reason": "Invalid check digit" }
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2026-01-15T10:00:00Z"
  }
}
```

### Why Envelope

- **Consistent parsing** - Client always knows structure
- **Request tracing** - Every response has requestId
- **Error context** - Structured details, not just message

---

## 6. Pagination Strategy

### Offset-Based Pagination

```http
GET /api/v1/products?page=2&pageSize=20
```

Response:
```json
{
  "data": [...],
  "meta": {
    "page": 2,
    "pageSize": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### Why Offset Over Cursor

| Factor | Offset | Cursor |
|--------|--------|--------|
| **Simplicity** | Simple page numbers | Opaque tokens |
| **Random access** | Jump to page 5 | Sequential only |
| **Our data size** | <100K products typical | Millions+ |
| **Use case** | Dashboard browsing | Infinite scroll |

Cursor pagination would be over-engineering for our typical dataset sizes.

---

## 7. Rate Limiting

### Tier-Based Limits

| Tier | Requests/min | Burst | Rationale |
|------|--------------|-------|-----------|
| Starter | 60 | 100 | Light usage |
| Growth | 300 | 500 | Medium integration |
| Scale | 1,000 | 2,000 | Heavy automation |
| Enterprise | 5,000 | 10,000 | High volume |
| Platform | 10,000 | 20,000 | Custom integrations |

### Rate Limit Headers

```http
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 250
X-RateLimit-Reset: 1705312800
Retry-After: 30  (only on 429)
```

### Why Per-Minute Window

- **Simple to understand** - "300 per minute"
- **Recovers quickly** - 60 seconds max wait
- **Prevents abuse** - Can't burst entire quota

---

## 8. Error Code Design

### HTTP Status Code Usage

| Code | Meaning | When Used |
|------|---------|-----------|
| 200 | Success | GET, PUT, PATCH |
| 201 | Created | POST creating resource |
| 204 | No Content | DELETE |
| 400 | Bad Request | Validation errors |
| 401 | Unauthorized | Missing/invalid auth |
| 403 | Forbidden | Auth valid, no permission |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate, state conflict |
| 422 | Unprocessable | Valid JSON, semantic error |
| 429 | Too Many Requests | Rate limited |
| 500 | Server Error | Our fault |

### Application Error Codes

Namespaced by domain:
- `VALIDATION_*` - Input validation
- `AUTH_*` - Authentication/authorization
- `PRODUCT_*` - Product operations
- `PASSPORT_*` - DPP operations
- `CHECKOUT_*` - Version control

---

## 9. Idempotency

### Idempotency Keys for POST

```http
POST /api/v1/products
Idempotency-Key: client-generated-uuid
```

**Behavior:**
- Same key within 24h → return cached response
- Prevents duplicate creation on retry
- Client generates key

### Why Client-Generated Keys

- **Client controls retry logic** - They know when it's a retry
- **Simpler server** - No complex deduplication logic
- **Standard pattern** - Stripe, AWS use this approach

---

## 10. Webhook Design

### Delivery Guarantees

| Guarantee | Implementation |
|-----------|----------------|
| **At-least-once** | Retry on failure |
| **Ordered per-resource** | Events for same product in order |
| **Signed** | HMAC-SHA256 signature |

### Retry Policy

```
Attempt 1: Immediate
Attempt 2: 1 minute
Attempt 3: 5 minutes
Attempt 4: 30 minutes
Attempt 5: 2 hours
Attempt 6: 8 hours
(max 6 attempts, then dead letter)
```

### Why This Retry Schedule

- **Fast initial retry** - Catch transient failures
- **Exponential backoff** - Don't overwhelm failing endpoint
- **Reasonable max** - 6 attempts over ~10 hours

---

## 11. Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| URLs | kebab-case | `/api/v1/product-families` |
| JSON fields | camelCase | `productId`, `createdAt` |
| Query params | camelCase | `?pageSize=20` |
| Headers | X-EuroComply-* | `X-EuroComply-Request-Id` |

### Why Mixed Conventions

- **URLs** - kebab-case is URL standard
- **JSON** - camelCase is JavaScript convention (our clients)
- **Consistency within context** - Not mixing in same place

---

## 12. Public API (Unauthenticated)

### Free DPP Access

```http
GET /api/v1/public/dpp/gtin/{gtin}
```

**No auth required** - ESPR Article 31 mandates free access for economic operators.

### Rate Limits

| Client | Limit | Purpose |
|--------|-------|---------|
| Anonymous | 60/min | Basic access |
| Registered (free) | 300/min | Integration use |

### Why Free Public API

- **ESPR compliance** - Required by regulation
- **Ecosystem benefit** - Retailers need to display DPPs
- **Network effects** - More usage = more value

---

## 13. Changes from Original Document

| Aspect | Original | Design Decision |
|--------|----------|-----------------|
| **Auth** | Generic JWT mention | Clerk for sessions, scoped API keys |
| **Rate limits** | Listed per tier | Added rationale for tier values |

---

## 14. Related Documents

| Document | Purpose |
|----------|---------|
| [API Reference](../API_REFERENCE.md) | Full endpoint documentation |
| [Security Design](./2026-01-15-security-design.md) | Auth details, API key management |
| [E-commerce Design](./2026-01-15-ecommerce-design.md) | Shopify API integration |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-01-15 | Initial draft from API_REFERENCE.md |
