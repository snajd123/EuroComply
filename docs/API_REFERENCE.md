# EuroComply API Reference

> REST API for Digital Product Passport management, credential issuance, and compliance operations.

---

## 1. Overview

### Base URL

| Environment | Base URL |
|-------------|----------|
| Production | `https://api.eurocomply.eu/api/v1` |
| Staging | `https://staging.api.eurocomply.eu/api/v1` |

### API Versioning

The API uses URL versioning (`/api/v1/`). Breaking changes will be introduced in new versions (`/api/v2/`). Deprecation notices will be provided 6 months before version sunset.

> **Terminology Note:**
> - **API version**: Compatibility level for the API itself (`/api/v1/`, `/api/v2/`)
> - **Product revision**: Data iterations within Design/Marketing workspaces (r1, r2, r3)
> - **DPP edition**: Published, immutable Digital Product Passport
>
> Legacy API responses use `version` and `versionNumber` for product revisions. This will be
> migrated to `revision` and `revisionNumber` in API v2. See
> [Architecture Document - Terminology](../EuroComply_Architecture_Document_v1.3.md#terminology-version-vs-revision-vs-edition).

### Request Format

- All request bodies must be JSON (`Content-Type: application/json`)
- All dates use ISO 8601 format (`2026-01-14T12:00:00Z`)
- All IDs use prefixed format (`org_`, `prod_`, `pass_`, etc.)

---

## 1.1 API Standards

This section defines the API conventions that ensure consistency across all endpoints.

### Naming Conventions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    API NAMING STANDARDS                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  JSON FIELDS: camelCase                                                     │
│  ─────────────────────────                                                  │
│  ✓ productId, createdAt, pageSize, totalItems                              │
│  ✗ product_id, created_at, page_size, total_items                          │
│                                                                              │
│  URL PATHS: kebab-case                                                      │
│  ────────────────────────                                                   │
│  ✓ /api/v1/products/{id}/status-history                                    │
│  ✗ /api/v1/products/{id}/statusHistory                                     │
│  ✗ /api/v1/products/{id}/status_history                                    │
│                                                                              │
│  QUERY PARAMETERS: camelCase                                                │
│  ───────────────────────────                                                │
│  ✓ ?pageSize=20&sortBy=createdAt                                           │
│  ✗ ?page_size=20&sort_by=created_at                                        │
│                                                                              │
│  RESOURCE IDS: prefixed                                                     │
│  ─────────────────────────                                                  │
│  ✓ prod_abc123, pass_xyz789, org_def456                                    │
│  ✗ abc123, 12345, uuid-without-prefix                                      │
│                                                                              │
│  HTTP HEADERS: X-Capitalized-Words                                         │
│  ──────────────────────────────────                                         │
│  ✓ X-RateLimit-Remaining, X-EuroComply-Signature                           │
│  ✗ x-ratelimit-remaining, X_RateLimit_Remaining                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### ID Prefixes

All resource IDs use consistent prefixes for easy identification:

| Resource | Prefix | Example |
|----------|--------|---------|
| Organization | `org_` | `org_abc123def456` |
| Product | `prod_` | `prod_xyz789ghi012` |
| Passport | `pass_` | `pass_mno345pqr678` |
| Credential | `cred_` | `cred_stu901vwx234` |
| User | `user_` | `user_yza567bcd890` |
| Webhook | `wh_` | `wh_efg123hij456` |
| Job | `job_` | `job_klm789nop012` |
| Event | `evt_` | `evt_qrs345tuv678` |
| API Key | `ec_live_` / `ec_test_` | `ec_live_abc123...` |

### Date/Time Format

All dates use ISO 8601 format in UTC:

```json
{
  "createdAt": "2026-01-14T12:00:00Z",
  "expiresAt": "2036-01-14T00:00:00Z",
  "updatedAt": "2026-01-14T15:30:45.123Z"
}
```

**Rules:**
- Always UTC timezone (suffix `Z`)
- Milliseconds optional but supported
- Date-only fields use `YYYY-MM-DD` format

### Boolean Fields

Boolean fields use affirmative naming:

```json
{
  "isActive": true,
  "hasMore": false,
  "enabled": true,
  "includeArchived": false
}
```

**Rules:**
- Prefer `is`, `has`, `can`, `should` prefixes for state
- Use bare adjectives for settings: `enabled`, `archived`
- Never use negatives: ✗ `isNotActive`, `disabled`

### Enum Values

Enum values use SCREAMING_SNAKE_CASE:

```json
{
  "status": "ACTIVE",
  "reason": "PRODUCT_RECALL",
  "type": "DIGITAL_PRODUCT_PASSPORT"
}
```

---

## 1.2 Deprecation Policy

EuroComply follows a structured deprecation process to ensure API stability while allowing evolution.

### Deprecation Timeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    12-MONTH DEPRECATION TIMELINE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  MONTH 0: Deprecation Announced                                             │
│  ─────────────────────────────────                                          │
│  • Changelog updated with deprecation notice                                │
│  • Email sent to all API key owners                                         │
│  • Dashboard notification for org admins                                    │
│  • Sunset header added to affected endpoints                                │
│                                                                              │
│  MONTHS 0-9: Deprecated but Fully Functional                                │
│  ────────────────────────────────────────────                               │
│  • Endpoint continues to work normally                                      │
│  • Warning header included in responses                                     │
│  • Usage logged for migration tracking                                      │
│  • Migration guide available in docs                                        │
│                                                                              │
│  MONTHS 9-12: Final Warning Period                                          │
│  ──────────────────────────────────                                         │
│  • Additional email reminders sent                                          │
│  • Dashboard warning becomes prominent                                      │
│  • Support contacts heavy users directly                                    │
│                                                                              │
│  MONTH 12: Sunset                                                           │
│  ─────────────────                                                          │
│  • Endpoint returns 410 Gone                                                │
│  • Response body includes migration instructions                            │
│  • Final email notification sent                                            │
│                                                                              │
│  POST-SUNSET: Grace Period (Optional, Case-by-Case)                        │
│  ──────────────────────────────────────────────────                         │
│  • Critical enterprise customers may request extension                      │
│  • Maximum 3-month extension with signed agreement                          │
│  • No extensions for security-related deprecations                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Sunset Headers

Deprecated endpoints include RFC 8594 sunset headers:

```http
HTTP/1.1 200 OK
Deprecation: true
Sunset: Sat, 14 Jan 2027 00:00:00 GMT
Link: <https://docs.eurocomply.eu/migration/v1-to-v2>; rel="successor-version"
X-EuroComply-Deprecation-Reason: Replaced by /v2/passports endpoint
```

| Header | Description |
|--------|-------------|
| `Deprecation: true` | Indicates endpoint is deprecated |
| `Sunset` | Date when endpoint will stop working (RFC 7231 date format) |
| `Link` | URL to migration guide or replacement endpoint |
| `X-EuroComply-Deprecation-Reason` | Human-readable explanation |

### Deprecated Response Example

After sunset date, deprecated endpoints return:

```http
HTTP/1.1 410 Gone
Content-Type: application/json

{
  "success": false,
  "error": {
    "code": "ENDPOINT_SUNSET",
    "message": "This endpoint was deprecated on 2026-01-14 and removed on 2027-01-14",
    "details": {
      "deprecatedEndpoint": "POST /api/v1/passports/generate",
      "replacementEndpoint": "POST /v2/passports",
      "migrationGuide": "https://docs.eurocomply.eu/migration/v1-to-v2",
      "sunsetDate": "2027-01-14T00:00:00Z"
    }
  },
  "meta": {
    "requestId": "req_xyz789",
    "timestamp": "2027-01-15T10:00:00Z"
  }
}
```

### What Gets Deprecated

| Change Type | Deprecation Required | Timeline |
|-------------|---------------------|----------|
| Removing endpoint | Yes | 12 months |
| Removing field from response | Yes | 12 months |
| Changing field type | Yes | 12 months |
| Renaming field | Yes | 12 months |
| Adding required field to request | Yes | 12 months |
| Adding optional field to request | No | Immediate |
| Adding field to response | No | Immediate |
| Adding new endpoint | No | Immediate |
| Bug fix (behavior change) | No | Immediate with notice |
| Security fix | No | Immediate (mandatory) |

### Version Sunset Schedule

| Version | Status | Sunset Date | Notes |
|---------|--------|-------------|-------|
| v1 | Active | TBD | Current stable version |
| v2 | Planned | - | Will be announced when ready |

### Monitoring Deprecated Endpoint Usage

Organizations can check their deprecated endpoint usage:

```http
GET /api/v1/usage/deprecated
Authorization: Bearer ec_live_...
```

Response:
```json
{
  "success": true,
  "data": {
    "organizationId": "org_abc123",
    "period": "last_30_days",
    "deprecatedEndpoints": [
      {
        "endpoint": "POST /api/v1/passports/generate",
        "calls": 1523,
        "lastUsed": "2026-01-14T11:30:00Z",
        "sunsetDate": "2027-01-14T00:00:00Z",
        "daysUntilSunset": 365,
        "migrationGuide": "https://docs.eurocomply.eu/migration/passport-generate"
      }
    ],
    "totalDeprecatedCalls": 1523,
    "recommendation": "Migrate to replacement endpoints before sunset dates"
  }
}
```

---

## 2. Authentication

### 2.1 API Key Authentication

For server-to-server integrations:

```bash
curl -X GET https://api.eurocomply.eu/api/v1/products \
  -H "Authorization: Bearer ec_live_abc123..."
```

API keys:
- Prefixed with `ec_live_` (production) or `ec_test_` (staging)
- Scoped to specific permissions (see Section 2.3)
- Can be rotated without downtime

### 2.2 JWT Authentication

For user sessions (dashboard, mobile):

```bash
curl -X GET https://api.eurocomply.eu/api/v1/products \
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

### 4.4 Storage Limit Error Response

When uploading files (images, PDFs, videos), the API returns this error if storage limit is reached:

```json
{
  "success": false,
  "error": {
    "code": "STORAGE_LIMIT_EXCEEDED",
    "message": "Storage limit reached for your plan",
    "details": {
      "currentUsage": "512 GB",
      "planLimit": "500 GB",
      "tier": "Starter",
      "upgradeUrl": "https://app.eurocomply.eu/settings/billing/upgrade"
    }
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2026-01-15T10:30:00Z"
  }
}
```

**Storage limits by tier:**
| Tier | Limit |
|------|-------|
| Starter | 500 GB |
| Growth | 1 TB |
| Scale | 2 TB |
| Enterprise | 5 TB |
| Platform | Custom |

**Notes:**
- Storage counts media files only (images, PDFs, videos)
- Product data records and DPP metadata are unlimited
- Existing data is never deleted - only new uploads are blocked
- Upgrade immediately unlocks additional storage

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
| `STORAGE_LIMIT_EXCEEDED` | 507 | Storage limit reached for plan |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | System temporarily unavailable |

### 5.3 Version Control Error Codes

Errors specific to checkout, checkin, and release workflows:

| Code | HTTP Status | Description | Resolution |
|------|-------------|-------------|------------|
| `CHECKOUT_CONFLICT` | 409 | Product is already checked out by another user | Wait for release or request checkout |
| `CHECKOUT_EXPIRED` | 409 | Your checkout has expired | Checkout again and restore from auto-save |
| `CHECKOUT_NOT_FOUND` | 404 | No active checkout for this product | Checkout the product first |
| `CHECKIN_NO_CHANGES` | 400 | No changes detected since checkout | Make changes or discard checkout |
| `VERSION_NOT_FOUND` | 404 | Specified version does not exist | Check version number |
| `VERSION_NOT_RELEASED` | 400 | Version must be released before use | Release the version first |
| `INVALID_STATE_TRANSITION` | 400 | Cannot transition from current state | Check state machine rules |
| `RELEASE_REQUIRES_CHECKIN` | 400 | Cannot release a checked-out version | Checkin first, then release |

### 5.4 Cross-Workspace Error Codes

Errors related to cross-workspace operations and dependencies:

| Code | HTTP Status | Description | Resolution |
|------|-------------|-------------|------------|
| `DESIGN_NOT_RELEASED` | 400 | Referenced Design version is not released | Release the Design version first |
| `MARKETING_DESIGN_MISMATCH` | 400 | Marketing version references different Design | Select correct Marketing version |
| `BATCH_DESIGN_NOT_FOUND` | 404 | Batch's referenced Design version not found | Check Design version exists |
| `CROSS_WORKSPACE_EDIT_DENIED` | 403 | Cannot edit content in another workspace | Use appropriate workspace |

### 5.5 Snapshot & DPP Error Codes

Errors during DPP snapshot creation and issuance:

| Code | HTTP Status | Description | Resolution |
|------|-------------|-------------|------------|
| `SNAPSHOT_MISSING_DESIGN` | 400 | No released Design version available | Release a Design version |
| `SNAPSHOT_MISSING_OPERATIONS` | 400 | No released batch available | Release a batch |
| `SNAPSHOT_MISSING_MARKETING` | 400 | No Marketing version selected | Select a Marketing version |
| `SNAPSHOT_BATCH_NOT_RELEASED` | 400 | Selected batch is not released for DPP | Release the batch first |
| `SNAPSHOT_VALIDATION_FAILED` | 422 | Snapshot content failed compliance validation | See `validationErrors` in response |
| `DPP_ALREADY_ISSUED` | 409 | DPP already issued for this batch | Use existing DPP or create new batch |
| `MANAGER_REQUIRED` | 403 | DPP issuance requires MANAGER role in Compliance workspace | Request MANAGER access |
| `SNAPSHOT_EXPIRED` | 400 | Snapshot too old for issuance (>30 days) | Create new snapshot |

#### Snapshot Validation Error Details

When `SNAPSHOT_VALIDATION_FAILED` occurs, the response includes detailed validation errors:

```json
{
  "error": "SNAPSHOT_VALIDATION_FAILED",
  "message": "Snapshot content failed compliance validation",
  "validationErrors": [
    {
      "field": "design.materials.primary.composition",
      "code": "COMPOSITION_INCOMPLETE",
      "message": "Material composition percentages must sum to 100%",
      "actual": 95,
      "expected": 100
    },
    {
      "field": "design.certifications",
      "code": "CERTIFICATION_EXPIRED",
      "message": "GOTS certification has expired",
      "expirationDate": "2025-12-31"
    },
    {
      "field": "marketing.description",
      "code": "CLAIM_UNSUPPORTED",
      "message": "Marketing claim 'carbon neutral' not supported by certifications",
      "claim": "carbon neutral"
    }
  ]
}
```

#### Validation Error Codes

| Code | Description |
|------|-------------|
| `REQUIRED_FIELD_MISSING` | Mandatory ESPR field not provided |
| `COMPOSITION_INCOMPLETE` | Material percentages don't sum to 100% |
| `CERTIFICATION_EXPIRED` | Referenced certification has expired |
| `CERTIFICATION_NOT_FOUND` | Referenced certification doesn't exist |
| `CLAIM_UNSUPPORTED` | Marketing claim lacks supporting evidence |
| `GTIN_MISMATCH` | GTIN doesn't match product record |
| `DATE_INVALID` | Date field in invalid format or future date |
| `QUANTITY_MISMATCH` | Batch quantity exceeds production capacity |

---

## 6. Common Endpoints

### 6.1 Products

#### List Products

```http
GET /api/v1/products?page=1&pageSize=20&workspace=design
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
GET /api/v1/products/{productId}
```

#### Create Product

```http
POST /api/v1/products
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
PUT /api/v1/products/{productId}
Content-Type: application/json

{
  "name": "Organic Cotton T-Shirt (Updated)"
}
```

#### Checkout Product Version (Design/Marketing)

Checkout a product version for editing. Creates an exclusive lock preventing other users from editing.

```http
POST /api/v1/products/{productId}/checkout
Content-Type: application/json

{
  "workspace": "design"
}
```

Response:
```json
{
  "checkoutId": "co_abc123",
  "expiresAt": "2026-01-14T13:00:00Z",
  "baseVersion": 3,
  "data": { ... }
}
```

#### Extend Checkout

```http
POST /api/v1/products/{productId}/checkout/extend
```

Response:
```json
{
  "expiresAt": "2026-01-14T13:30:00Z"
}
```

#### Checkin Product Version

Creates a new immutable version with the changes.

```http
POST /api/v1/products/{productId}/checkin
Content-Type: application/json

{
  "data": { ... },
  "changeDescription": "Updated material composition"
}
```

Response:
```json
{
  "version": 4,
  "versionId": "ver_xyz789"
}
```

#### Discard Checkout

Release the checkout lock without saving changes.

```http
DELETE /api/v1/products/{productId}/checkout
```

#### Request Checkout (Queue)

Request a checkout for a product that is currently checked out by another user. You will be notified when the checkout becomes available.

```http
POST /api/v1/products/{productId}/checkout/request
Content-Type: application/json

{
  "workspace": "design",
  "priority": "normal",
  "note": "Need to update material specs for compliance review"
}
```

Response (when product is checked out by another):
```json
{
  "requestId": "req_abc123",
  "status": "queued",
  "position": 2,
  "currentCheckout": {
    "userId": "user_456",
    "userName": "John Smith",
    "expiresAt": "2026-01-14T14:00:00Z"
  },
  "estimatedWaitMinutes": 35
}
```

Response (when product is available - immediate checkout):
```json
{
  "requestId": "req_abc123",
  "status": "granted",
  "checkout": {
    "checkoutId": "co_xyz789",
    "expiresAt": "2026-01-14T13:30:00Z",
    "baseVersion": 3
  }
}
```

**Priority Levels:**
| Priority | Description | Queue Behavior |
|----------|-------------|----------------|
| `low` | Non-urgent changes | Added to end of queue |
| `normal` | Standard priority | Added to end of queue (default) |
| `high` | Urgent updates | Added after other high-priority requests |

**Notifications:**
- User receives email when their request is next in queue
- User receives in-app notification when checkout becomes available
- Request expires after 24 hours if not fulfilled

#### Cancel Checkout Request

Cancel a pending checkout request.

```http
DELETE /api/v1/products/{productId}/checkout/request/{requestId}
```

Response:
```json
{
  "requestId": "req_abc123",
  "status": "cancelled"
}
```

#### Get Checkout Queue

View the current checkout queue for a product.

```http
GET /api/v1/products/{productId}/checkout/queue?workspace=design
```

Response:
```json
{
  "currentCheckout": {
    "userId": "user_456",
    "userName": "John Smith",
    "checkedOutAt": "2026-01-14T12:00:00Z",
    "expiresAt": "2026-01-14T14:00:00Z"
  },
  "queue": [
    {
      "requestId": "req_111",
      "userId": "user_789",
      "userName": "Jane Doe",
      "requestedAt": "2026-01-14T12:30:00Z",
      "priority": "high"
    },
    {
      "requestId": "req_222",
      "userId": "user_012",
      "userName": "Bob Wilson",
      "requestedAt": "2026-01-14T12:45:00Z",
      "priority": "normal"
    }
  ]
}
```

#### Release Design Version to Operations

Release a Design version for use by Operations batches. Released versions are frozen forever.

```http
POST /api/v1/products/{productId}/design/{version}/release
Content-Type: application/json

{
  "releaseNote": "Approved for Spring 2026 collection"
}
```

Response:
```json
{
  "version": 3,
  "state": "released_to_ops",
  "releasedAt": "2026-01-14T10:30:00Z",
  "releasedBy": "user_456"
}
```

#### List Released Design Versions

```http
GET /api/v1/products/{productId}/design/released
```

Response:
```json
{
  "versions": [
    {
      "version": 3,
      "releasedAt": "2026-01-14T10:30:00Z",
      "releaseNote": "Approved for Spring 2026 collection",
      "referencedByBatches": ["batch_123", "batch_456"]
    }
  ]
}
```

#### Release Marketing Version for DPP

Release a Marketing version for DPP inclusion. Released versions are frozen forever.

```http
POST /api/v1/products/{productId}/marketing/{version}/release
Content-Type: application/json

{
  "releaseNote": "Brand story approved for Q1 2026"
}
```

Response:
```json
{
  "version": 2,
  "state": "released_for_dpp",
  "releasedAt": "2026-01-14T11:00:00Z",
  "releasedBy": "user_789"
}
```

#### List Released Marketing Versions

```http
GET /api/v1/products/{productId}/marketing/released
```

#### Compare Version Diff

Compare two versions of a product (Design or Marketing) to see what changed.

```http
GET /api/v1/products/{productId}/{workspace}/versions/{v1}/diff/{v2}
```

**Path Parameters:**
| Parameter | Description |
|-----------|-------------|
| `productId` | Product identifier |
| `workspace` | `design` or `marketing` |
| `v1` | First version number (older) |
| `v2` | Second version number (newer) |

**Example:**
```http
GET /api/v1/products/prod_abc123/design/versions/2/diff/3
```

Response:
```json
{
  "productId": "prod_abc123",
  "workspace": "design",
  "fromVersion": 2,
  "toVersion": 3,
  "comparedAt": "2026-01-14T15:00:00Z",
  "summary": {
    "fieldsAdded": 1,
    "fieldsModified": 3,
    "fieldsRemoved": 0
  },
  "changes": [
    {
      "field": "materials.primary.composition",
      "type": "modified",
      "from": "90% organic cotton, 10% elastane",
      "to": "95% organic cotton, 5% elastane"
    },
    {
      "field": "materials.primary.weight",
      "type": "modified",
      "from": "180 gsm",
      "to": "175 gsm"
    },
    {
      "field": "certifications",
      "type": "modified",
      "from": ["GOTS"],
      "to": ["GOTS", "OEKO-TEX"]
    },
    {
      "field": "recycledContentPercentage",
      "type": "added",
      "to": 15
    }
  ],
  "metadata": {
    "v2ReleasedBy": "user_456",
    "v2ReleasedAt": "2026-01-10T09:00:00Z",
    "v3ReleasedBy": "user_789",
    "v3ReleasedAt": "2026-01-14T10:30:00Z"
  }
}
```

**Change Types:**
| Type | Description |
|------|-------------|
| `added` | Field exists in v2 but not in v1 |
| `modified` | Field exists in both but value changed |
| `removed` | Field exists in v1 but not in v2 |

**Error Responses:**
| Status | Error | Description |
|--------|-------|-------------|
| 404 | `VERSION_NOT_FOUND` | One or both versions don't exist |
| 400 | `INVALID_VERSION_ORDER` | v1 must be less than v2 |
| 400 | `SAME_VERSION` | Cannot compare a version to itself |

### 6.1.1 Batches

#### Create Batch

Create a new batch referencing a released Design version. Batch data is immutable from creation.

```http
POST /api/v1/products/{productId}/batches
Content-Type: application/json

{
  "designVersionNumber": 3,
  "quantity": 1000,
  "serialRange": { "start": "SN-001", "end": "SN-1000" },
  "productionDate": "2026-01-15",
  "facilityId": "fac_portugal_001"
}
```

Response:
```json
{
  "batchId": "batch_abc123",
  "batchNumber": "BATCH-2026-0001",
  "state": "created",
  "designVersionNumber": 3
}
```

#### Commit Batch

Record the Design version reference and proceed to production.

```http
POST /api/v1/products/{productId}/batches/{batchId}/commit
```

Response:
```json
{
  "batchId": "batch_abc123",
  "state": "committed",
  "designVersionNumber": 3
}
```

#### Release Batch for DPP

Mark batch as production complete and QA approved.

```http
POST /api/v1/products/{productId}/batches/{batchId}/release
Content-Type: application/json

{
  "qaApprovedBy": "qa_manager_123",
  "qaApprovedAt": "2026-01-20T14:00:00Z",
  "releaseNote": "QA passed, production complete"
}
```

Response:
```json
{
  "batchId": "batch_abc123",
  "state": "released_for_dpp",
  "releasedAt": "2026-01-20T15:00:00Z",
  "releasedBy": "user_ops_456"
}
```

#### List Batches Ready for DPP

```http
GET /api/v1/products/{productId}/batches/ready-for-dpp
```

Response:
```json
{
  "batches": [
    {
      "batchId": "batch_abc123",
      "batchNumber": "BATCH-2026-0001",
      "designVersionNumber": 3,
      "quantity": 1000,
      "releasedAt": "2026-01-20T15:00:00Z",
      "hasDpp": false
    }
  ]
}
```

#### Check DPP Readiness

Check if all prerequisites are met for DPP snapshot creation.

```http
GET /api/v1/products/{productId}/batches/{batchId}/dpp-readiness
```

Response:
```json
{
  "batchId": "batch_abc123",
  "batchNumber": "BATCH-2026-0001",
  "productId": "prod_xyz789",
  "isReady": true,
  "design": {
    "ready": true,
    "versionNumber": 3,
    "state": "released_to_ops",
    "releasedAt": "2026-01-14T10:30:00Z"
  },
  "operations": {
    "ready": true,
    "batchState": "released_for_dpp",
    "releasedAt": "2026-01-20T15:00:00Z",
    "qaApprovedAt": "2026-01-20T14:00:00Z"
  },
  "marketing": {
    "ready": true,
    "versionNumber": 2,
    "state": "released_for_dpp",
    "releasedAt": "2026-01-14T11:00:00Z"
  },
  "blockers": []
}
```

### 6.2 Passports

#### Issue Passport

```http
POST /api/v1/passports
Content-Type: application/json

{
  "productId": "prod_abc123",
  "serialNumber": "SN-2026-001",
  "expiresAt": "2036-01-14T00:00:00Z"
}
```

#### Get Passport

```http
GET /api/v1/passports/{passportId}
```

#### Revoke Passport

```http
POST /api/v1/passports/{passportId}/revoke
Content-Type: application/json

{
  "reason": "PRODUCT_RECALL",
  "notes": "Safety recall - batch contamination"
}
```

### 6.3 Credentials

#### Issue Credential

```http
POST /api/v1/credentials
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
POST /api/v1/credentials/verify
Content-Type: application/json

{
  "credential": "eyJhbGciOiJFZERTQSIs..."
}
```

### 6.4 Bulk Operations

#### Bulk Import Products

```http
POST /api/v1/import/products
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
POST /api/v1/passports/bulk
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

#### Bulk Operation Idempotency (Scale-Critical)

All bulk operations MUST include an idempotency key to prevent duplicate processing on retries. This is critical for:
- Network timeouts where client doesn't receive response
- Client-side retries
- Load balancer failovers

```http
POST /api/v1/passports/bulk
Content-Type: application/json
X-Idempotency-Key: bulk_2026-01-15_batch-12345_abc123

{
  "productId": "prod_abc123",
  "serialNumbers": ["SN-001", "SN-002", "SN-003"],
  "options": {
    "async": true
  }
}
```

**Idempotency Key Requirements:**

| Requirement | Details |
|-------------|---------|
| **Format** | String, 1-256 characters, alphanumeric + `-_` |
| **Uniqueness** | Must be unique per operation intent |
| **Reuse** | Same key + same payload = return cached result |
| **Conflict** | Same key + different payload = 409 Conflict |
| **TTL** | Keys stored for 24 hours |

**Idempotency Behavior:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    IDEMPOTENCY KEY HANDLING                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Request arrives with X-Idempotency-Key                                     │
│          │                                                                   │
│          ▼                                                                   │
│  ┌─────────────────┐                                                        │
│  │ Key exists in   │────── NO ─────▶ Execute operation                      │
│  │ cache?          │                  │                                      │
│  └────────┬────────┘                  │                                      │
│           │ YES                       │                                      │
│           ▼                           │                                      │
│  ┌─────────────────┐                  │                                      │
│  │ Payload hash    │                  │                                      │
│  │ matches?        │                  │                                      │
│  └────────┬────────┘                  │                                      │
│           │                           │                                      │
│      YES  │  NO                       │                                      │
│           │  │                        │                                      │
│           ▼  ▼                        ▼                                      │
│  Return   Return              Store key + hash + result                     │
│  cached   409                         │                                      │
│  result   Conflict                    │                                      │
│                                       ▼                                      │
│                               Return result                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Server Implementation:**

```typescript
// Idempotency middleware
async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  const idempotencyKey = req.headers['x-idempotency-key'];

  if (!idempotencyKey) {
    // Bulk operations require idempotency key
    if (BULK_OPERATION_PATHS.includes(req.path)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          message: 'Bulk operations require X-Idempotency-Key header',
        },
      });
    }
    return next();
  }

  // Check cache
  const cacheKey = `idempotency:${req.context.organizationId}:${idempotencyKey}`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    const { payloadHash, response, statusCode } = JSON.parse(cached);
    const currentHash = hash(JSON.stringify(req.body));

    if (payloadHash !== currentHash) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'IDEMPOTENCY_KEY_CONFLICT',
          message: 'Idempotency key already used with different payload',
        },
      });
    }

    // Return cached response
    return res.status(statusCode).json(response);
  }

  // Store result after operation completes
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    redis.setex(
      cacheKey,
      86400, // 24 hours
      JSON.stringify({
        payloadHash: hash(JSON.stringify(req.body)),
        response: body,
        statusCode: res.statusCode,
      })
    );
    return originalJson(body);
  };

  next();
}
```

**Client Best Practices:**

```typescript
// Generate idempotency key from operation context
function generateIdempotencyKey(context: {
  operation: string;
  date: string;
  batchId?: string;
  uniqueId: string;
}): string {
  return `${context.operation}_${context.date}_${context.batchId || 'na'}_${context.uniqueId}`;
}

// Example usage
const key = generateIdempotencyKey({
  operation: 'bulk_passport_issue',
  date: '2026-01-15',
  batchId: 'batch-12345',
  uniqueId: crypto.randomUUID(),
});

// Retry with same key
async function bulkIssueWithRetry(payload: BulkIssuePayload, idempotencyKey: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await api.post('/api/v1/passports/bulk', payload, {
        headers: { 'X-Idempotency-Key': idempotencyKey },
      });
    } catch (error) {
      if (error.status === 409) {
        throw new Error('Idempotency key conflict - operation may have changed');
      }
      if (attempt === 2) throw error;
      await sleep(1000 * Math.pow(2, attempt)); // Exponential backoff
    }
  }
}
```

**Partial Failure Handling:**

For bulk operations that partially succeed:

```json
{
  "success": false,
  "data": {
    "jobId": "job_xyz789",
    "status": "partial_failure",
    "results": {
      "total": 100,
      "succeeded": 95,
      "failed": 5,
      "failures": [
        { "index": 23, "serialNumber": "SN-023", "error": "Duplicate serial" },
        { "index": 45, "serialNumber": "SN-045", "error": "Invalid format" }
      ]
    }
  },
  "meta": {
    "idempotencyKey": "bulk_2026-01-15_batch-12345_abc123",
    "canRetry": true,
    "retryHint": "Retry with same key after fixing failed items"
  }
}
```

### 6.5 Bulk Export

#### Request Full Organization Export

```http
POST /api/v1/export/full
Content-Type: application/json
Authorization: Bearer ec_live_...

{
  "format": "zip",
  "include": {
    "products": true,
    "passports": true,
    "credentials": true,
    "media": true,
    "auditLogs": false
  },
  "filters": {
    "createdAfter": "2025-01-01T00:00:00Z",
    "workspace": "all"
  },
  "encryption": {
    "enabled": true,
    "publicKey": "-----BEGIN PUBLIC KEY-----\n..."
  }
}
```

Response:
```json
{
  "success": true,
  "data": {
    "jobId": "job_export_abc123",
    "status": "pending",
    "estimatedSize": "2.4 GB",
    "estimatedDuration": "15 minutes",
    "statusUrl": "/v1/jobs/job_export_abc123"
  }
}
```

#### Export Job Status

```http
GET /api/v1/jobs/job_export_abc123
```

Response:
```json
{
  "success": true,
  "data": {
    "jobId": "job_export_abc123",
    "type": "export",
    "status": "completed",
    "progress": {
      "percentage": 100,
      "itemsProcessed": 1523,
      "itemsTotal": 1523
    },
    "result": {
      "downloadUrl": "/v1/export/jobs/job_export_abc123/download",
      "expiresAt": "2026-01-15T12:00:00Z",
      "fileSize": 2415673344,
      "checksum": "sha256:e3b0c44298fc1c149afbf4c8996fb924..."
    },
    "createdAt": "2026-01-14T11:45:00Z",
    "completedAt": "2026-01-14T12:00:00Z"
  }
}
```

#### Download Export File

```http
GET /api/v1/export/jobs/job_export_abc123/download
```

Response: Binary file stream with headers:
```http
HTTP/1.1 200 OK
Content-Type: application/zip
Content-Disposition: attachment; filename="eurocomply-export-2026-01-14.zip"
Content-Length: 2415673344
X-Checksum-SHA256: e3b0c44298fc1c149afbf4c8996fb924...
```

### 6.6 Batch Credential Issuance

Issue multiple credentials in a single request (max 1000 per batch).

#### Issue Batch Credentials

```http
POST /api/v1/credentials/batch
Content-Type: application/json
Authorization: Bearer ec_live_...

{
  "credentials": [
    {
      "type": "DigitalProductPassport",
      "subjectId": "urn:gtin:5901234567890",
      "serialNumber": "SN-001",
      "claims": {
        "productName": "Organic Cotton T-Shirt",
        "batchId": "BATCH-2026-001"
      }
    },
    {
      "type": "DigitalProductPassport",
      "subjectId": "urn:gtin:5901234567890",
      "serialNumber": "SN-002",
      "claims": {
        "productName": "Organic Cotton T-Shirt",
        "batchId": "BATCH-2026-001"
      }
    }
  ],
  "options": {
    "async": true,
    "continueOnError": true
  }
}
```

Synchronous Response (small batches, ≤50):
```json
{
  "success": true,
  "data": {
    "issued": 2,
    "failed": 0,
    "credentials": [
      {
        "id": "cred_abc123",
        "serialNumber": "SN-001",
        "status": "issued"
      },
      {
        "id": "cred_def456",
        "serialNumber": "SN-002",
        "status": "issued"
      }
    ]
  }
}
```

Asynchronous Response (large batches, >50):
```json
{
  "success": true,
  "data": {
    "jobId": "job_cred_xyz789",
    "status": "processing",
    "statusUrl": "/v1/jobs/job_cred_xyz789"
  }
}
```

#### Batch Limits

| Plan | Max per Batch | Max per Hour |
|------|---------------|--------------|
| Starter | 50 | 200 |
| Growth | 200 | 1,000 |
| Scale | 500 | 5,000 |
| Enterprise | 1,000 | 50,000 |
| Platform | Custom | Custom |

### 6.7 Product Lifecycle

#### Archive Product

Archive a product to remove it from active listings while preserving data.

```http
POST /api/v1/products/prod_abc123/archive
Content-Type: application/json
Authorization: Bearer ec_live_...

{
  "reason": "discontinued",
  "notes": "Product line discontinued as of Q1 2026"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "prod_abc123",
    "status": "archived",
    "archivedAt": "2026-01-14T12:00:00Z",
    "archivedBy": "user_xyz789",
    "reason": "discontinued"
  }
}
```

**Archive Behavior:**
- Product no longer appears in default listings
- Existing DPPs remain accessible (QR codes still work)
- No new DPPs can be issued
- Product data preserved for compliance (10 years)

#### Restore Archived Product

```http
POST /api/v1/products/prod_abc123/restore
Content-Type: application/json
Authorization: Bearer ec_live_...

{
  "notes": "Reintroducing product for Spring 2026"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "prod_abc123",
    "status": "active",
    "restoredAt": "2026-01-14T12:00:00Z",
    "restoredBy": "user_xyz789"
  }
}
```

#### Transfer Product to Another Organization

Transfer ownership of a product to another organization (requires acceptance).

```http
POST /api/v1/products/prod_abc123/transfer
Content-Type: application/json
Authorization: Bearer ec_live_...

{
  "targetOrganizationId": "org_target456",
  "includePassports": true,
  "includeCredentials": true,
  "notes": "Transferring due to brand acquisition"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "transferId": "xfer_abc123",
    "status": "pending_acceptance",
    "sourceOrganization": "org_source123",
    "targetOrganization": "org_target456",
    "product": {
      "id": "prod_abc123",
      "name": "Organic Cotton T-Shirt"
    },
    "expiresAt": "2026-01-21T12:00:00Z"
  }
}
```

**Transfer Flow:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PRODUCT TRANSFER FLOW                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. SOURCE initiates transfer                                               │
│     POST /api/v1/products/{id}/transfer                                         │
│     └── Status: pending_acceptance                                          │
│                                                                              │
│  2. TARGET receives notification (webhook + email)                          │
│     └── 7-day window to accept or reject                                    │
│                                                                              │
│  3a. TARGET accepts                                                         │
│      POST /api/v1/transfers/{transferId}/accept                                 │
│      └── Product ownership changes                                          │
│      └── DPPs re-signed with target's did:key (if requested)               │
│      └── Source loses access                                                │
│                                                                              │
│  3b. TARGET rejects or timeout                                              │
│      POST /api/v1/transfers/{transferId}/reject                                 │
│      └── Transfer cancelled                                                 │
│      └── Product remains with source                                        │
│                                                                              │
│  POST-TRANSFER:                                                             │
│  • Issued credentials: Remain valid (original signature)                    │
│  • New credentials: Signed by target organization                          │
│  • Audit trail: Records transfer event                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Accept Transfer

```http
POST /api/v1/transfers/xfer_abc123/accept
Authorization: Bearer ec_live_... (target org's key)
```

#### Reject Transfer

```http
POST /api/v1/transfers/xfer_abc123/reject
Content-Type: application/json
Authorization: Bearer ec_live_... (target org's key)

{
  "reason": "Not ready to accept this product line"
}
```

### 6.8 Webhook Management

#### List Webhook Endpoints

```http
GET /api/v1/webhooks
Authorization: Bearer ec_live_...
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "wh_abc123",
      "url": "https://example.com/webhooks/eurocomply",
      "events": ["product.created", "passport.issued"],
      "status": "active",
      "createdAt": "2025-06-15T10:00:00Z",
      "lastDeliveryAt": "2026-01-14T11:30:00Z",
      "lastDeliveryStatus": "success"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

#### Create Webhook Endpoint

```http
POST /api/v1/webhooks
Content-Type: application/json
Authorization: Bearer ec_live_...

{
  "url": "https://example.com/webhooks/eurocomply",
  "events": ["product.created", "product.updated", "passport.issued"],
  "secret": "whsec_your_secret_key",
  "description": "Production webhook for inventory sync",
  "enabled": true
}
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "wh_xyz789",
    "url": "https://example.com/webhooks/eurocomply",
    "events": ["product.created", "product.updated", "passport.issued"],
    "status": "active",
    "createdAt": "2026-01-14T12:00:00Z",
    "signingSecret": "whsec_abc123..."
  }
}
```

**Note:** The `signingSecret` is only returned on creation. Store it securely.

#### Update Webhook Endpoint

```http
PUT /api/v1/webhooks/wh_xyz789
Content-Type: application/json
Authorization: Bearer ec_live_...

{
  "url": "https://example.com/webhooks/eurocomply-v2",
  "events": ["product.created", "passport.issued", "passport.revoked"],
  "enabled": true
}
```

#### Delete Webhook Endpoint

```http
DELETE /api/v1/webhooks/wh_xyz789
Authorization: Bearer ec_live_...
```

Response:
```http
HTTP/1.1 204 No Content
```

#### Rotate Webhook Secret

```http
POST /api/v1/webhooks/wh_xyz789/rotate-secret
Authorization: Bearer ec_live_...
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "wh_xyz789",
    "newSigningSecret": "whsec_new456...",
    "previousSecretValidUntil": "2026-01-15T12:00:00Z"
  }
}
```

**Secret Rotation:** Both old and new secrets are valid for 24 hours to allow deployment updates.

#### Test Webhook Delivery

```http
POST /api/v1/webhooks/wh_xyz789/test
Content-Type: application/json
Authorization: Bearer ec_live_...

{
  "eventType": "passport.issued"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "deliveryId": "del_test123",
    "status": "delivered",
    "responseCode": 200,
    "responseTime": 245,
    "responseBody": "{\"received\": true}"
  }
}
```

#### Get Webhook Delivery History

```http
GET /api/v1/webhooks/wh_xyz789/deliveries?page=1&pageSize=20
Authorization: Bearer ec_live_...
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "del_abc123",
      "eventId": "evt_xyz789",
      "eventType": "passport.issued",
      "status": "delivered",
      "httpStatus": 200,
      "responseTime": 156,
      "attempt": 1,
      "createdAt": "2026-01-14T11:30:00Z"
    },
    {
      "id": "del_def456",
      "eventId": "evt_uvw123",
      "eventType": "product.updated",
      "status": "failed",
      "httpStatus": 500,
      "responseTime": 30000,
      "attempt": 3,
      "nextRetryAt": "2026-01-14T12:30:00Z",
      "createdAt": "2026-01-14T11:00:00Z"
    }
  ]
}
```

### 6.9 Job Status API

All asynchronous operations (bulk import, export, batch credential issuance) return a job ID. Use these endpoints to track progress.

#### Get Job Status

```http
GET /api/v1/jobs/job_xyz789
Authorization: Bearer ec_live_...
```

Response:
```json
{
  "success": true,
  "data": {
    "jobId": "job_xyz789",
    "type": "credential_batch",
    "status": "processing",
    "progress": {
      "percentage": 45,
      "itemsProcessed": 450,
      "itemsTotal": 1000,
      "itemsFailed": 2
    },
    "errors": [
      {
        "index": 123,
        "serialNumber": "SN-INVALID",
        "error": "Duplicate serial number"
      },
      {
        "index": 456,
        "serialNumber": "SN-789",
        "error": "Product not found"
      }
    ],
    "createdAt": "2026-01-14T11:45:00Z",
    "updatedAt": "2026-01-14T11:47:30Z",
    "estimatedCompletion": "2026-01-14T11:50:00Z"
  }
}
```

#### Job Status Values

| Status | Description |
|--------|-------------|
| `pending` | Job created, waiting to start |
| `processing` | Job actively running |
| `completed` | Job finished successfully |
| `completed_with_errors` | Job finished but some items failed |
| `failed` | Job failed completely |
| `cancelled` | Job cancelled by user |

#### List Recent Jobs

```http
GET /api/v1/jobs?type=export&status=completed&page=1&pageSize=20
Authorization: Bearer ec_live_...
```

Query Parameters:
| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Filter by job type: `import`, `export`, `credential_batch` |
| `status` | string | Filter by status |
| `createdAfter` | ISO date | Filter by creation date |

#### Cancel Job

```http
POST /api/v1/jobs/job_xyz789/cancel
Authorization: Bearer ec_live_...
```

Response:
```json
{
  "success": true,
  "data": {
    "jobId": "job_xyz789",
    "status": "cancelled",
    "itemsProcessedBeforeCancel": 450,
    "cancelledAt": "2026-01-14T11:48:00Z"
  }
}
```

**Note:** Cancellation is best-effort. Items already processed are not rolled back.

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
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Webhook Signature Verification

All webhooks are signed using HMAC-SHA256 with a timestamp to prevent replay attacks (Stripe-style signature scheme).

#### Signature Header Format

```http
X-EuroComply-Signature: t=1705234800,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
```

| Component | Description |
|-----------|-------------|
| `t` | Unix timestamp (seconds) when signature was generated |
| `v1` | HMAC-SHA256 signature (hex-encoded) |

#### Signature Generation

The signature is computed over:
```
{timestamp}.{raw_request_body}
```

```
signature = HMAC-SHA256(
  key: webhook_signing_secret,
  message: "{timestamp}.{json_body}"
)
```

#### Verification Steps

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SIGNATURE VERIFICATION ALGORITHM                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STEP 1: Extract timestamp and signature from header                        │
│  ────────────────────────────────────────────────                           │
│  Header: X-EuroComply-Signature: t=1705234800,v1=5257a869...               │
│  Parse: timestamp = 1705234800, signature = "5257a869..."                  │
│                                                                              │
│  STEP 2: Check timestamp (replay protection)                                │
│  ───────────────────────────────────────────                                │
│  current_time = now()                                                       │
│  if |current_time - timestamp| > 300 seconds (5 minutes):                  │
│      REJECT (timestamp too old or too far in future)                       │
│                                                                              │
│  STEP 3: Compute expected signature                                         │
│  ──────────────────────────────────                                         │
│  signed_payload = "{timestamp}.{raw_request_body}"                         │
│  expected = HMAC-SHA256(signing_secret, signed_payload)                    │
│                                                                              │
│  STEP 4: Compare signatures (timing-safe)                                   │
│  ─────────────────────────────────────────                                  │
│  if timing_safe_equal(expected, signature):                                │
│      ACCEPT                                                                 │
│  else:                                                                      │
│      REJECT (signature mismatch)                                           │
│                                                                              │
│  IMPORTANT: Use timing-safe comparison to prevent timing attacks           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Verification Code Examples

**Node.js:**
```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, header, secret) {
  const parts = header.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=');
    acc[key] = value;
    return acc;
  }, {});

  const timestamp = parseInt(parts.t, 10);
  const signature = parts.v1;

  // Check timestamp (5-minute tolerance)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) {
    throw new Error('Webhook timestamp too old');
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  // Timing-safe comparison
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    throw new Error('Invalid webhook signature');
  }

  return JSON.parse(payload);
}
```

**Python:**
```python
import hmac
import hashlib
import time

def verify_webhook_signature(payload: bytes, header: str, secret: str) -> dict:
    parts = dict(part.split('=') for part in header.split(','))
    timestamp = int(parts['t'])
    signature = parts['v1']

    # Check timestamp (5-minute tolerance)
    now = int(time.time())
    if abs(now - timestamp) > 300:
        raise ValueError('Webhook timestamp too old')

    # Compute expected signature
    signed_payload = f"{timestamp}.{payload.decode()}"
    expected = hmac.new(
        secret.encode(),
        signed_payload.encode(),
        hashlib.sha256
    ).hexdigest()

    # Timing-safe comparison
    if not hmac.compare_digest(expected, signature):
        raise ValueError('Invalid webhook signature')

    return json.loads(payload)
```

### 7.4 Webhook Secret Rotation

Secrets can be rotated without downtime using the dual-secret window.

#### Rotation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SECRET ROTATION PROCEDURE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  T+0:00  │ Admin initiates rotation                                        │
│          │ POST /api/v1/webhooks/{id}/rotate-secret                            │
│          │                                                                   │
│  T+0:01  │ New secret generated                                            │
│          │ Response includes:                                               │
│          │ • newSigningSecret: "whsec_new..."                              │
│          │ • previousSecretValidUntil: "2026-01-15T12:00:00Z"              │
│          │                                                                   │
│  T+0:01  │ DUAL-SECRET WINDOW BEGINS                                       │
│  to      │ Both secrets valid for signature verification:                   │
│  T+24:00 │ • Old secret: Still works (for in-flight/retry deliveries)      │
│          │ • New secret: Works immediately                                  │
│          │                                                                   │
│  During  │ Deploy your webhook handler update:                             │
│  window  │ • Update WEBHOOK_SECRET env var to new secret                   │
│          │ • Deploy to all instances                                        │
│          │ • Verify new secret works                                        │
│          │                                                                   │
│  T+24:00 │ DUAL-SECRET WINDOW ENDS                                         │
│          │ Old secret automatically invalidated                             │
│          │ Only new secret works                                            │
│                                                                              │
│  VERIFICATION DURING ROTATION:                                              │
│  ─────────────────────────────                                              │
│  Your handler should try both secrets:                                      │
│                                                                              │
│  try:                                                                       │
│      verify(payload, header, NEW_SECRET)                                   │
│  except SignatureError:                                                     │
│      verify(payload, header, OLD_SECRET)  # Fallback during rotation       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Rotation API Response

```json
{
  "success": true,
  "data": {
    "id": "wh_xyz789",
    "newSigningSecret": "whsec_new_abc123...",
    "previousSecretValidUntil": "2026-01-15T12:00:00Z",
    "rotatedAt": "2026-01-14T12:00:00Z",
    "rotationReason": "scheduled"
  }
}
```

### 7.5 Idempotency Keys

Every webhook delivery includes an idempotency key to enable safe retry handling.

#### Idempotency Key Format

```
X-EuroComply-Idempotency-Key: evt_a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

| Component | Description |
|-----------|-------------|
| `evt_` | Prefix identifying event type |
| UUID | Unique identifier for this specific event |

#### Deduplication

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    IDEMPOTENCY HANDLING                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  DEDUPLICATION WINDOW: 24 hours                                             │
│  ───────────────────────────────                                            │
│  Store processed idempotency keys for 24 hours to detect duplicates.       │
│                                                                              │
│  RECOMMENDED IMPLEMENTATION:                                                │
│  ───────────────────────────                                                │
│                                                                              │
│  async function handleWebhook(req) {                                        │
│    const idempotencyKey = req.headers['x-eurocomply-idempotency-key'];     │
│                                                                              │
│    // Check if already processed                                            │
│    const exists = await redis.get(`webhook:processed:${idempotencyKey}`);  │
│    if (exists) {                                                            │
│      // Already processed - return success (don't process again)           │
│      return { status: 200, body: { duplicate: true } };                    │
│    }                                                                        │
│                                                                              │
│    // Process webhook                                                       │
│    await processWebhookEvent(req.body);                                    │
│                                                                              │
│    // Mark as processed (24-hour TTL)                                      │
│    await redis.setex(                                                       │
│      `webhook:processed:${idempotencyKey}`,                                │
│      86400, // 24 hours                                                    │
│      'processed'                                                            │
│    );                                                                       │
│                                                                              │
│    return { status: 200, body: { processed: true } };                      │
│  }                                                                          │
│                                                                              │
│  WHY RETURN 200 FOR DUPLICATES:                                            │
│  ─────────────────────────────                                              │
│  Returning 200 tells EuroComply the webhook was "handled" - even if you   │
│  didn't reprocess it. This prevents unnecessary retries.                   │
│                                                                              │
│  Returning 4xx/5xx would trigger retry attempts.                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.6 Retry Telemetry

Monitor webhook delivery health via metrics and dashboard.

#### Metrics per Webhook

| Metric | Description | Available Via |
|--------|-------------|---------------|
| `deliveries_total` | Total delivery attempts | API, Dashboard |
| `deliveries_success` | Successful deliveries (2xx) | API, Dashboard |
| `deliveries_failed` | Failed deliveries (4xx/5xx/timeout) | API, Dashboard |
| `deliveries_retried` | Deliveries that required retry | API, Dashboard |
| `avg_response_time_ms` | Average endpoint response time | API, Dashboard |
| `p99_response_time_ms` | 99th percentile response time | API, Dashboard |
| `current_retry_backlog` | Events waiting for retry | API, Dashboard |

#### Metrics API

```http
GET /api/v1/webhooks/wh_xyz789/metrics?period=24h
```

Response:
```json
{
  "success": true,
  "data": {
    "webhookId": "wh_xyz789",
    "period": "24h",
    "metrics": {
      "deliveries": {
        "total": 1523,
        "success": 1498,
        "failed": 25,
        "successRate": 98.36
      },
      "retries": {
        "total": 47,
        "recovered": 22,
        "exhausted": 3
      },
      "latency": {
        "avgMs": 156,
        "p50Ms": 120,
        "p95Ms": 350,
        "p99Ms": 890
      },
      "errors": {
        "timeout": 12,
        "connection_refused": 8,
        "http_5xx": 5,
        "http_4xx": 0
      },
      "backlog": {
        "pending": 2,
        "oldestPendingAge": "5m"
      }
    }
  }
}
```

#### Alerting Thresholds

| Condition | Alert Level | Notification |
|-----------|-------------|--------------|
| Success rate < 95% (1h window) | Warning | Email |
| Success rate < 80% (1h window) | Critical | Email + Dashboard banner |
| Avg response time > 5s | Warning | Email |
| Retry backlog > 100 events | Warning | Email |
| Retry backlog > 500 events | Critical | Email + Webhook disabled |
| 3 consecutive failures | Info | Dashboard indicator |
| Endpoint disabled (6 failures) | Critical | Email + Dashboard banner |

#### Dashboard Visibility

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  WEBHOOK HEALTH DASHBOARD                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Endpoint: https://example.com/webhooks/eurocomply                          │
│  Status: ● Healthy                                                          │
│                                                                              │
│  Last 24 Hours:                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ████████████████████████████████████████████████░░ 98.4% success   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Deliveries: 1,523 total │ 1,498 success │ 25 failed │ 22 recovered       │
│                                                                              │
│  Response Time:                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │     200ms ─────────────────────────────────────────────             │   │
│  │     avg   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░             │   │
│  │           00:00    06:00    12:00    18:00    24:00                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Recent Failures:                                                           │
│  │ Time       │ Event          │ Error              │ Retry Status │       │
│  │────────────│────────────────│────────────────────│──────────────│       │
│  │ 11:45:23   │ passport.issued│ Timeout (30s)      │ ⏳ Retry #2  │       │
│  │ 11:32:01   │ product.updated│ HTTP 503           │ ✓ Recovered  │       │
│  │ 10:15:44   │ import.complete│ Connection refused │ ✗ Exhausted  │       │
│                                                                              │
│  [View Full Delivery Log]  [Test Endpoint]  [Rotate Secret]                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.7 Webhook Payload

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

### 7.8 IP Allowlisting

For additional security, you can restrict webhook deliveries to specific IP addresses or verify the source IP.

#### EuroComply Webhook Source IPs

All webhook deliveries originate from these IP ranges:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WEBHOOK SOURCE IP RANGES                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PRODUCTION (eu-central-1):                                                 │
│  ─────────────────────────                                                  │
│  • 3.120.0.0/16      (AWS eu-central-1 range)                              │
│  • 18.184.0.0/15     (AWS eu-central-1 range)                              │
│  • 52.28.0.0/16      (AWS eu-central-1 range)                              │
│                                                                              │
│  STATIC EGRESS IPs (recommended for allowlisting):                          │
│  • 3.120.45.100                                                             │
│  • 3.120.45.101                                                             │
│  • 18.184.72.50                                                             │
│  • 18.184.72.51                                                             │
│                                                                              │
│  These static IPs are dedicated NAT gateway addresses for webhook           │
│  delivery. They will not change without 30-day advance notice.              │
│                                                                              │
│  SANDBOX/TESTING:                                                           │
│  ────────────────                                                           │
│  • 3.121.0.0/16      (AWS eu-central-1 sandbox)                            │
│  • Static: 3.121.88.10, 3.121.88.11                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Programmatic IP List

Retrieve current webhook IPs via API:

```http
GET /api/v1/webhooks/source-ips
```

Response:
```json
{
  "success": true,
  "data": {
    "production": {
      "static": ["3.120.45.100", "3.120.45.101", "18.184.72.50", "18.184.72.51"],
      "ranges": ["3.120.0.0/16", "18.184.0.0/15", "52.28.0.0/16"]
    },
    "sandbox": {
      "static": ["3.121.88.10", "3.121.88.11"],
      "ranges": ["3.121.0.0/16"]
    },
    "lastUpdated": "2026-01-01T00:00:00Z",
    "nextUpdate": null
  }
}
```

#### Configuring IP Restrictions on Your Endpoint

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RECOMMENDED SECURITY LAYERS                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LAYER 1: IP Allowlist (network level)                                      │
│  ─────────────────────────────────────                                      │
│  Configure your firewall/WAF to only accept requests from EuroComply IPs:  │
│                                                                              │
│  # nginx example                                                            │
│  location /webhooks/eurocomply {                                            │
│      allow 3.120.45.100;                                                    │
│      allow 3.120.45.101;                                                    │
│      allow 18.184.72.50;                                                    │
│      allow 18.184.72.51;                                                    │
│      deny all;                                                              │
│      proxy_pass http://backend;                                             │
│  }                                                                          │
│                                                                              │
│  # Cloudflare WAF rule                                                      │
│  (ip.src in {3.120.45.100 3.120.45.101 18.184.72.50 18.184.72.51})         │
│  → Allow                                                                    │
│                                                                              │
│  LAYER 2: Signature Verification (application level)                        │
│  ───────────────────────────────────────────────────                        │
│  ALWAYS verify HMAC-SHA256 signature regardless of IP filtering.           │
│  IP allowlisting is defense-in-depth, not a replacement for signatures.    │
│                                                                              │
│  LAYER 3: TLS Certificate Pinning (optional, advanced)                      │
│  ─────────────────────────────────────────────────────                      │
│  For highest security, pin the EuroComply TLS certificate.                 │
│  Contact enterprise support for certificate fingerprints.                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### IP Change Notifications

When webhook source IPs change:

| Notice Period | Change Type | Notification Method |
|---------------|-------------|---------------------|
| 30 days | New IP added | Email to org admins |
| 30 days | IP deprecated | Email + dashboard banner |
| 90 days | IP removed | Final removal after deprecation |
| Immediate | Security incident | Emergency notification |

Subscribe to IP change notifications:
```http
POST /api/v1/webhooks/ip-notifications
{
  "email": "security@yourcompany.com",
  "includeRanges": true
}
```

### 7.9 Timeout Handling

Understanding timeout behavior helps you design reliable webhook handlers.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WEBHOOK TIMEOUT BEHAVIOR                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TIMEOUT THRESHOLDS:                                                        │
│  ───────────────────                                                        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Connection timeout: 10 seconds                                      │   │
│  │ └── Time to establish TCP connection to your server                │   │
│  │                                                                      │   │
│  │ Response timeout: 30 seconds                                        │   │
│  │ └── Time from request sent to full response received               │   │
│  │                                                                      │   │
│  │ Total timeout: 30 seconds (includes connection time)               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  WHAT COUNTS AS SUCCESS:                                                    │
│  ────────────────────────                                                   │
│  ✓ HTTP 2xx within 30 seconds                                              │
│  ✓ Empty 200 response is valid                                             │
│  ✓ Response body is ignored (only status code matters)                     │
│                                                                              │
│  WHAT TRIGGERS RETRY:                                                       │
│  ────────────────────                                                       │
│  • Connection timeout (>10s to connect)                                    │
│  • Response timeout (>30s to respond)                                      │
│  • HTTP 5xx response                                                        │
│  • Network error (DNS failure, connection reset)                           │
│  • TLS handshake failure                                                    │
│                                                                              │
│  WHAT DOES NOT RETRY (permanent failure):                                  │
│  ─────────────────────────────────────────                                  │
│  • HTTP 4xx response (client error - fix your endpoint)                    │
│  • Invalid URL (malformed, unreachable domain)                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Best Practices for Timeout Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WEBHOOK HANDLER BEST PRACTICES                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  DO: Acknowledge quickly, process asynchronously                            │
│  ───────────────────────────────────────────────                            │
│                                                                              │
│  // ✓ GOOD: Fast acknowledgment                                            │
│  app.post('/webhooks/eurocomply', async (req, res) => {                    │
│    // 1. Verify signature (fast)                                           │
│    verifySignature(req);                                                    │
│                                                                              │
│    // 2. Queue for async processing                                         │
│    await queue.push({                                                       │
│      event: req.body,                                                       │
│      idempotencyKey: req.headers['x-eurocomply-idempotency-key']          │
│    });                                                                      │
│                                                                              │
│    // 3. Return 200 immediately (< 1 second)                               │
│    res.status(200).json({ received: true });                               │
│  });                                                                        │
│                                                                              │
│  // ✗ BAD: Slow synchronous processing                                     │
│  app.post('/webhooks/eurocomply', async (req, res) => {                    │
│    await updateDatabase(req.body);        // 5 seconds                     │
│    await notifyExternalService(req.body); // 10 seconds                    │
│    await generateReport(req.body);        // 20 seconds                    │
│    res.status(200).json({ done: true });  // TIMEOUT! 35 seconds total    │
│  });                                                                        │
│                                                                              │
│  RECOMMENDED ARCHITECTURE:                                                  │
│  ─────────────────────────                                                  │
│                                                                              │
│  EuroComply ──► Your Endpoint ──► Message Queue ──► Worker Process         │
│       │              │                                    │                 │
│       │         (< 1 second)                        (async, any duration)  │
│       │              │                                    │                 │
│       └──── 200 OK ──┘                                    │                 │
│                                                           ▼                 │
│                                                    Database, APIs, etc.    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Timeout Debugging

If your endpoint is timing out:

```http
GET /api/v1/webhooks/wh_xyz789/deliveries?status=timeout
```

Response includes timing details:
```json
{
  "deliveries": [
    {
      "id": "del_abc123",
      "status": "timeout",
      "timing": {
        "dnsLookup": 50,
        "tcpConnect": 120,
        "tlsHandshake": 200,
        "firstByte": null,
        "total": 30000
      },
      "error": "Response timeout after 30000ms (first byte never received)",
      "attemptedAt": "2026-01-14T12:00:00Z"
    }
  ]
}
```

---

## 8. Pagination

### 8.1 Page-Based Pagination

Default pagination method for list endpoints:

```http
GET /api/v1/products?page=2&pageSize=50
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
GET /api/v1/audit/logs?cursor=eyJsYXN0SWQiOiJsb2dfMTIz&limit=100
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

*Last Updated: 2026-01-15*
