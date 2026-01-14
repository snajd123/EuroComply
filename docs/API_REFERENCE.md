# EuroComply API Reference

> REST API for Digital Product Passport management, credential issuance, and compliance operations.

---

## 1. Overview

### Base URL

| Environment | Base URL |
|-------------|----------|
| Production | `https://api.eurocomply.eu/v1` |
| Staging | `https://staging.api.eurocomply.eu/v1` |

### API Versioning

The API uses URL versioning (`/v1/`). Breaking changes will be introduced in new versions (`/v2/`). Deprecation notices will be provided 6 months before version sunset.

### Request Format

- All request bodies must be JSON (`Content-Type: application/json`)
- All dates use ISO 8601 format (`2026-01-14T12:00:00Z`)
- All IDs use prefixed format (`org_`, `prod_`, `pass_`, etc.)

---

## 2. Authentication

### 2.1 API Key Authentication

For server-to-server integrations:

```bash
curl -X GET https://api.eurocomply.eu/v1/products \
  -H "Authorization: Bearer ec_live_abc123..."
```

API keys:
- Prefixed with `ec_live_` (production) or `ec_test_` (staging)
- Scoped to specific permissions (see Section 2.3)
- Can be rotated without downtime

### 2.2 JWT Authentication

For user sessions (dashboard, mobile):

```bash
curl -X GET https://api.eurocomply.eu/v1/products \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..."
```

JWT tokens:
- Issued via `/auth/token` endpoint
- Access tokens expire in 1 hour
- Refresh tokens expire in 30 days
- RS256 signed, verifiable via JWKS at `/.well-known/jwks.json`

### 2.3 API Scopes

| Scope | Description | Endpoints |
|-------|-------------|-----------|
| `read:products` | View products and versions | GET /products/* |
| `write:products` | Create/update products | POST/PUT /products/* |
| `read:passports` | View issued passports | GET /passports/* |
| `write:passports` | Issue new passports | POST /passports/* |
| `read:credentials` | View credentials | GET /credentials/* |
| `write:credentials` | Issue credentials | POST /credentials/* |
| `admin:organization` | Organization settings | */organization/* |
| `admin:users` | User management | */users/* |
| `bulk:import` | Bulk import operations | POST /import/* |
| `bulk:export` | Bulk export operations | POST /export/* |

---

## 3. Rate Limiting

### 3.1 Rate Limit Tiers

Rate limits are applied per API key or user token:

| Tier | Requests/Minute | Requests/Hour | Burst (10s) | Applied To |
|------|-----------------|---------------|-------------|------------|
| **Free Trial** | 60 | 1,000 | 20 | Trial accounts |
| **Starter** | 100 | 3,000 | 30 | Starter plan |
| **Growth** | 500 | 15,000 | 100 | Growth plan |
| **Scale** | 2,000 | 60,000 | 400 | Scale plan |
| **Enterprise** | 10,000 | 300,000 | 2,000 | Enterprise plan |
| **Platform** | Custom | Custom | Custom | Platform plan |

### 3.2 Endpoint-Specific Limits

Some endpoints have additional limits to prevent abuse:

| Endpoint | Additional Limit | Reason |
|----------|------------------|--------|
| `POST /auth/token` | 10/min per IP | Prevent brute force |
| `POST /import/ai` | 10/hour per org | AI processing cost |
| `POST /passports/bulk` | 100/hour per org | Bulk generation load |
| `POST /export/full` | 5/day per org | Large data exports |
| `POST /webhooks/test` | 10/hour per org | Prevent webhook spam |

### 3.3 Rate Limit Headers

All responses include rate limit headers:

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 287
X-RateLimit-Reset: 1705234800
X-RateLimit-Retry-After: 45
```

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Requests allowed per window |
| `X-RateLimit-Remaining` | Requests remaining in window |
| `X-RateLimit-Reset` | Unix timestamp when window resets |
| `X-RateLimit-Retry-After` | Seconds until retry allowed (on 429) |

### 3.4 Rate Limit Exceeded Response

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Retry after 45 seconds.",
    "details": {
      "limit": 300,
      "window": "1m",
      "retryAfter": 45
    }
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2026-01-14T12:00:00Z"
  }
}
```

### 3.5 Best Practices

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RATE LIMITING BEST PRACTICES                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  DO:                                                                        │
│  ✅ Implement exponential backoff on 429 responses                          │
│  ✅ Cache responses where appropriate                                       │
│  ✅ Use bulk endpoints for batch operations                                 │
│  ✅ Monitor X-RateLimit-Remaining header                                    │
│  ✅ Spread requests evenly (avoid bursts at window boundaries)              │
│                                                                              │
│  DON'T:                                                                     │
│  ❌ Retry immediately on rate limit                                         │
│  ❌ Make parallel requests without coordination                             │
│  ❌ Poll frequently when webhooks are available                             │
│  ❌ Ignore rate limit headers                                               │
│                                                                              │
│  EXPONENTIAL BACKOFF EXAMPLE:                                               │
│  Attempt 1: Wait 1s                                                         │
│  Attempt 2: Wait 2s                                                         │
│  Attempt 3: Wait 4s                                                         │
│  Attempt 4: Wait 8s                                                         │
│  Max wait: 60s                                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Response Format

### 4.1 Success Response

```json
{
  "success": true,
  "data": {
    "id": "prod_abc123",
    "name": "Organic Cotton T-Shirt",
    "gtin": "5901234567890"
  },
  "meta": {
    "requestId": "req_xyz789",
    "timestamp": "2026-01-14T12:00:00Z"
  }
}
```

### 4.2 List Response (Paginated)

```json
{
  "success": true,
  "data": [
    { "id": "prod_abc123", "name": "Product 1" },
    { "id": "prod_def456", "name": "Product 2" }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 156,
    "totalPages": 8,
    "hasMore": true
  },
  "meta": {
    "requestId": "req_xyz789",
    "timestamp": "2026-01-14T12:00:00Z"
  }
}
```

### 4.3 Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "GTIN check digit is invalid",
    "details": {
      "field": "gtin",
      "value": "5901234567891",
      "expectedCheckDigit": "0",
      "actualCheckDigit": "1"
    }
  },
  "meta": {
    "requestId": "req_xyz789",
    "timestamp": "2026-01-14T12:00:00Z"
  }
}
```

---

## 5. Error Codes

### 5.1 HTTP Status Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| `200` | OK | Successful GET, PUT, PATCH |
| `201` | Created | Successful POST creating resource |
| `204` | No Content | Successful DELETE |
| `400` | Bad Request | Validation error, malformed request |
| `401` | Unauthorized | Missing or invalid authentication |
| `403` | Forbidden | Authenticated but insufficient permissions |
| `404` | Not Found | Resource doesn't exist |
| `409` | Conflict | Duplicate resource, state conflict |
| `422` | Unprocessable Entity | Valid JSON but semantic error |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Server-side error |
| `503` | Service Unavailable | Maintenance or overload |

### 5.2 Application Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request body failed validation |
| `INVALID_GTIN` | 400 | GTIN format or check digit invalid |
| `INVALID_JSON` | 400 | Request body is not valid JSON |
| `MISSING_REQUIRED_FIELD` | 400 | Required field not provided |
| `AUTHENTICATION_REQUIRED` | 401 | No authentication provided |
| `INVALID_TOKEN` | 401 | Token expired or malformed |
| `INVALID_API_KEY` | 401 | API key not found or revoked |
| `INSUFFICIENT_SCOPE` | 403 | API key lacks required scope |
| `WORKSPACE_ACCESS_DENIED` | 403 | User lacks workspace permission |
| `RESOURCE_NOT_FOUND` | 404 | Requested resource doesn't exist |
| `PRODUCT_NOT_FOUND` | 404 | Product ID not found |
| `DUPLICATE_GTIN` | 409 | GTIN already exists in organization |
| `VERSION_CONFLICT` | 409 | Concurrent edit detected |
| `PASSPORT_ALREADY_ISSUED` | 409 | Cannot modify issued passport |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit hit |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | System temporarily unavailable |

---

## 6. Common Endpoints

### 6.1 Products

#### List Products

```http
GET /v1/products?page=1&pageSize=20&workspace=design
```

Query Parameters:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number (1-indexed) |
| `pageSize` | integer | 20 | Items per page (max 100) |
| `workspace` | string | all | Filter by workspace |
| `status` | string | all | Filter by status (draft, active, archived) |
| `search` | string | - | Search in name, SKU, GTIN |
| `familyId` | string | - | Filter by product family |
| `sort` | string | -updatedAt | Sort field (prefix - for desc) |

#### Get Product

```http
GET /v1/products/{productId}
```

#### Create Product

```http
POST /v1/products
Content-Type: application/json

{
  "name": "Organic Cotton T-Shirt",
  "gtin": "5901234567890",
  "sku": "OCT-001",
  "familyId": "fam_textiles_apparel",
  "categoryId": "cat_tshirts"
}
```

#### Update Product

```http
PUT /v1/products/{productId}
Content-Type: application/json

{
  "name": "Organic Cotton T-Shirt (Updated)"
}
```

### 6.2 Passports

#### Issue Passport

```http
POST /v1/passports
Content-Type: application/json

{
  "productId": "prod_abc123",
  "serialNumber": "SN-2026-001",
  "expiresAt": "2036-01-14T00:00:00Z"
}
```

#### Get Passport

```http
GET /v1/passports/{passportId}
```

#### Revoke Passport

```http
POST /v1/passports/{passportId}/revoke
Content-Type: application/json

{
  "reason": "PRODUCT_RECALL",
  "notes": "Safety recall - batch contamination"
}
```

### 6.3 Credentials

#### Issue Credential

```http
POST /v1/credentials
Content-Type: application/json

{
  "type": "DigitalProductPassport",
  "subjectId": "urn:gtin:5901234567890",
  "claims": {
    "productName": "Organic Cotton T-Shirt",
    "manufacturer": "EcoTextiles GmbH"
  }
}
```

#### Verify Credential

```http
POST /v1/credentials/verify
Content-Type: application/json

{
  "credential": "eyJhbGciOiJFZERTQSIs..."
}
```

### 6.4 Bulk Operations

#### Bulk Import Products

```http
POST /v1/import/products
Content-Type: application/json

{
  "products": [
    { "name": "Product 1", "gtin": "5901234567890" },
    { "name": "Product 2", "gtin": "5901234567891" }
  ],
  "options": {
    "skipDuplicates": true,
    "validateOnly": false
  }
}
```

#### Bulk Issue Passports

```http
POST /v1/passports/bulk
Content-Type: application/json

{
  "productId": "prod_abc123",
  "serialNumbers": ["SN-001", "SN-002", "SN-003"],
  "options": {
    "async": true
  }
}
```

Response (async):
```json
{
  "success": true,
  "data": {
    "jobId": "job_xyz789",
    "status": "queued",
    "statusUrl": "/v1/jobs/job_xyz789"
  }
}
```

---

## 7. Webhooks

### 7.1 Webhook Events

| Event | Description | Payload |
|-------|-------------|---------|
| `product.created` | New product created | Product object |
| `product.updated` | Product updated | Product object + changes |
| `product.archived` | Product archived | Product ID |
| `passport.issued` | New passport issued | Passport object |
| `passport.revoked` | Passport revoked | Passport ID + reason |
| `credential.issued` | New credential issued | Credential metadata |
| `import.completed` | Bulk import finished | Job ID + summary |
| `export.ready` | Export file ready | Download URL |

### 7.2 Webhook Delivery

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WEBHOOK DELIVERY GUARANTEES                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  DELIVERY: At-least-once                                                    │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Webhooks may be delivered more than once. Use idempotency keys.           │
│                                                                              │
│  RETRY POLICY:                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Attempt 1: Immediate                                                       │
│  Attempt 2: 1 minute                                                        │
│  Attempt 3: 5 minutes                                                       │
│  Attempt 4: 30 minutes                                                      │
│  Attempt 5: 2 hours                                                         │
│  Attempt 6: 24 hours                                                        │
│  After 6 failures: Webhook endpoint disabled, email notification sent      │
│                                                                              │
│  SUCCESS CRITERIA:                                                          │
│  ─────────────────────────────────────────────────────────────────────────  │
│  HTTP 2xx response within 30 seconds = success                             │
│  HTTP 4xx response = permanent failure (no retry)                          │
│  HTTP 5xx or timeout = temporary failure (retry)                           │
│                                                                              │
│  SIGNATURE VERIFICATION:                                                    │
│  ─────────────────────────────────────────────────────────────────────────  │
│  All webhooks are signed with HMAC-SHA256.                                 │
│  Verify using: X-EuroComply-Signature header                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Webhook Payload

```json
{
  "id": "evt_abc123",
  "type": "passport.issued",
  "createdAt": "2026-01-14T12:00:00Z",
  "data": {
    "passportId": "pass_xyz789",
    "productId": "prod_abc123",
    "serialNumber": "SN-2026-001"
  },
  "meta": {
    "organizationId": "org_123",
    "webhookId": "wh_456",
    "attempt": 1
  }
}
```

---

## 8. Pagination

### 8.1 Page-Based Pagination

Default pagination method for list endpoints:

```http
GET /v1/products?page=2&pageSize=50
```

Response includes:
```json
{
  "pagination": {
    "page": 2,
    "pageSize": 50,
    "totalItems": 156,
    "totalPages": 4,
    "hasMore": true
  }
}
```

### 8.2 Cursor-Based Pagination

For large datasets or real-time data (webhooks, audit logs):

```http
GET /v1/audit/logs?cursor=eyJsYXN0SWQiOiJsb2dfMTIz&limit=100
```

Response includes:
```json
{
  "pagination": {
    "cursor": "eyJsYXN0SWQiOiJsb2dfNDU2",
    "hasMore": true,
    "limit": 100
  }
}
```

---

## 9. SDK Examples

### 9.1 TypeScript/JavaScript

```typescript
import { EuroComplyClient } from '@eurocomply/sdk';

const client = new EuroComplyClient({
  apiKey: process.env.EUROCOMPLY_API_KEY,
  environment: 'production',
});

// List products with pagination
const products = await client.products.list({
  page: 1,
  pageSize: 20,
  workspace: 'design',
});

// Issue passport
const passport = await client.passports.issue({
  productId: 'prod_abc123',
  serialNumber: 'SN-2026-001',
});

// Handle rate limits
try {
  const result = await client.products.create({ ... });
} catch (error) {
  if (error.code === 'RATE_LIMIT_EXCEEDED') {
    await sleep(error.retryAfter * 1000);
    // Retry
  }
}
```

### 9.2 Python

```python
from eurocomply import EuroComplyClient

client = EuroComplyClient(
    api_key=os.environ['EUROCOMPLY_API_KEY'],
    environment='production'
)

# List products
products = client.products.list(page=1, page_size=20)

# Issue passport
passport = client.passports.issue(
    product_id='prod_abc123',
    serial_number='SN-2026-001'
)
```

---

## 10. API Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-14 | v1.0.0 | Initial API release |

---

## Related Documentation

- [AUTHENTICATION.md](./AUTHENTICATION.md) - Detailed authentication guide
- [BILLING.md](./BILLING.md) - Pricing tiers and rate limit upgrades
- [OpenAPI Spec](/api/openapi.yaml) - Machine-readable API specification

---

*Last Updated: 2026-01-14*
