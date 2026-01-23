# EuroComply API Testing Guide

Base URL: `http://localhost:3001`

---

## 1. Health Check

### GET /health
Check if the API is running.

**Request:**
```
GET /health
```

**Expected Response (200):**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-22T19:00:00.000Z"
}
```

---

## 2. API Info

### GET /api/v1
Get API version info.

**Request:**
```
GET /api/v1
```

**Expected Response (200):**
```json
{
  "message": "EuroComply API v1"
}
```

---

## 3. Organizations (Read-Only Routes)

> **Note:** Organizations are created exclusively via ZITADEL Actions v2 webhooks. There is no public API endpoint to create organizations. This ensures ZITADEL is the single source of truth.

### GET /api/v1/organizations
List all organizations.

**Request:**
```
GET /api/v1/organizations
```

**Expected Response (200):**
```json
{
  "data": [],
  "meta": { "total": 0 }
}
```

---

### GET /api/v1/organizations/:id
Get organization by ID.

**Request:**
```
GET /api/v1/organizations/abc123xyz
```

**Expected Response (200):**
```json
{
  "data": {
    "id": "abc123xyz",
    "name": "Acme Corporation",
    "slug": "acme-corp",
    "schemaName": "tenant_acme_corp",
    ...
  }
}
```

**Error Response (404):**
```json
{
  "error": "Not Found",
  "message": "Organization not found"
}
```

---

## 4. Admin Operations

### GET /api/v1/admin/organizations/:id/status
Get organization provisioning status. Accepts internal ID or ZITADEL org ID.

**Request:**
```
GET /api/v1/admin/organizations/abc123xyz/status
```

**Expected Response (200):**
```json
{
  "id": "abc123xyz",
  "name": "Acme Corporation",
  "schemaName": "tenant_acme_corp",
  "zitadelOrgId": null,
  "provisioningStatus": "PENDING",
  "provisioningError": null
}
```

Possible `provisioningStatus` values:
- `PENDING` - Waiting to be provisioned
- `PROVISIONING` - Currently being provisioned
- `READY` - Successfully provisioned
- `FAILED` - Provisioning failed (check `provisioningError`)
- `DELETING` - Deletion in progress
- `DELETE_FAILED` - Deletion failed (check `provisioningError`)

---

### POST /api/v1/admin/organizations/:id/provision
Provision an organization (handles both PENDING and FAILED statuses).

Use this endpoint to:
- Provision a PENDING organization (e.g., if webhook didn't auto-provision)
- Retry a FAILED organization after transient errors

**Request:**
```
POST /api/v1/admin/organizations/abc123xyz/provision
```

**Expected Response (200) - Success:**
```json
{
  "success": true,
  "organizationId": "abc123xyz",
  "schemaName": "tenant_acme_corp",
  "provisioningStatus": "READY"
}
```

**Error Response (400) - Already provisioned:**
```json
{
  "error": "Organization already provisioned",
  "message": "This organization is already in READY state"
}
```

**Error Response (500) - Provisioning failed:**
```json
{
  "success": false,
  "error": "Provisioning failed: <error details>"
}
```

---

### POST /api/v1/admin/organizations/:id/retry-deletion
Retry deletion for organizations stuck in `DELETE_FAILED` or `DELETING` status.

Use this endpoint when:
- Schema drop failed during deletion
- Deletion process was interrupted

**Request:**
```
POST /api/v1/admin/organizations/abc123xyz/retry-deletion
```

**Expected Response (200) - Success:**
```json
{
  "success": true,
  "message": "Organization and tenant schema deleted",
  "organizationId": "abc123xyz",
  "schemaName": "tenant_acme_corp"
}
```

**Error Response (400) - Invalid state:**
```json
{
  "error": "Invalid state for retry deletion",
  "message": "Organization is in READY state. Only DELETE_FAILED or DELETING orgs can be retried."
}
```

**Error Response (500) - Deletion failed:**
```json
{
  "success": false,
  "error": "Deletion failed: <error details>"
}
```

---

### POST /api/v1/admin/organizations/:id/sync-zitadel-metadata
Manually sync organization metadata to ZITADEL. Useful when ZITADEL API update failed during provisioning.

**Request:**
```
POST /api/v1/admin/organizations/abc123xyz/sync-zitadel-metadata
```

**Expected Response (200) - Success:**
```json
{
  "success": true,
  "message": "ZITADEL metadata synced successfully",
  "organizationId": "abc123xyz",
  "zitadelOrgId": "org_zitadel123"
}
```

**Error Response (400) - No ZITADEL ID:**
```json
{
  "error": "Organization has no ZITADEL ID"
}
```

**Error Response (500) - Sync failed:**
```json
{
  "success": false,
  "error": "ZITADEL sync failed: <error details>"
}
```

---

## 5. Products (Tenant-Scoped Routes)

These routes require a JWT token with tenant information.

### Authentication Setup

**Header:**
```
Authorization: Bearer <JWT_TOKEN>
```

**For Testing (without ZITADEL):**
Create a mock JWT with this structure:
```
header.payload.signature
```

Where payload is base64-encoded JSON:
```json
{
  "sub": "user_123",
  "urn:eurocomply:schema_name": "tenant_acme_corp"
}
```

**Postman Pre-request Script to generate test token:**
```javascript
const payload = {
  sub: "user_123",
  "urn:eurocomply:schema_name": "tenant_acme_corp"
};
const token = "header." + btoa(JSON.stringify(payload)) + ".signature";
pm.environment.set("TEST_TOKEN", token);
```

Then use `{{TEST_TOKEN}}` in the Authorization header.

---

### GET /api/v1/products
List all products for the authenticated tenant.

**Request:**
```
GET /api/v1/products
Authorization: Bearer {{TEST_TOKEN}}
```

**Expected Response (200):**
```json
{
  "data": [],
  "meta": { "total": 0 }
}
```

**Error Response (401) - Missing token:**
```json
{
  "error": "Unauthorized",
  "message": "Missing or invalid authorization header"
}
```

---

### POST /api/v1/products
Create a new product (requires category to exist first).

**Request:**
```
POST /api/v1/products
Authorization: Bearer {{TEST_TOKEN}}
Content-Type: application/json
```

**Body:**
```json
{
  "name": "Widget Pro",
  "categoryId": "category_id_here"
}
```

**Full Body (with all options):**
```json
{
  "name": "Widget Pro",
  "description": "Professional-grade widget for enterprise use",
  "sku": "WGT-PRO-001",
  "gtin": "12345678901234",
  "categoryId": "category_id_here",
  "metadata": {
    "weight": "500g",
    "dimensions": "10x10x5cm"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Product name (1-255 chars) |
| description | string | No | Product description (max 2000 chars) |
| sku | string | No | Stock keeping unit (max 100 chars) |
| gtin | string | No | Global Trade Item Number (max 14 chars) |
| categoryId | string | Yes | ID of existing category |
| metadata | object | No | Custom key-value pairs |

**Expected Response (201):**
```json
{
  "data": {
    "id": "prod_abc123",
    "name": "Widget Pro",
    "description": "Professional-grade widget for enterprise use",
    "sku": "WGT-PRO-001",
    "gtin": "12345678901234",
    "categoryId": "category_id_here",
    "status": "DRAFT",
    "metadata": { ... },
    "createdAt": "2026-01-22T19:00:00.000Z",
    "updatedAt": "2026-01-22T19:00:00.000Z"
  }
}
```

**Error Response (400) - Category not found:**
```json
{
  "error": "Bad Request",
  "message": "Category not found"
}
```

---

### GET /api/v1/products/:id
Get product by ID.

**Request:**
```
GET /api/v1/products/prod_abc123
Authorization: Bearer {{TEST_TOKEN}}
```

**Expected Response (200):**
```json
{
  "data": {
    "id": "prod_abc123",
    "name": "Widget Pro",
    ...
  }
}
```

**Error Response (404):**
```json
{
  "error": "Not Found",
  "message": "Product not found"
}
```

---

## 6. Webhooks (ZITADEL Integration)

### POST /webhooks/zitadel
Receive ZITADEL organization events.

**Required Headers:**
```
Content-Type: application/json
x-request-id: <webhook-id>     # Optional, for idempotency
zitadel-signature: <signature>
```

### Idempotency

Webhooks are tracked by `x-request-id` to ensure idempotent processing:

- **Duplicate webhook (already completed):** Returns 200 with `idempotent: true`
- **Webhook still processing:** Returns 409 Conflict
- **Failed webhook retry:** Processes again

**Idempotent Response (200):**
```json
{
  "success": true,
  "idempotent": true,
  "message": "Webhook already processed"
}
```

**Conflict Response (409):**
```json
{
  "error": "Webhook already processing"
}
```

**org.created Event:**
```json
{
  "type": "org.created",
  "data": {
    "id": "org_zitadel123",
    "name": "New Company",
    "slug": "new-company",
    "created_at": 1705942800000
  }
}
```

**org.removed Event:**
```json
{
  "type": "org.removed",
  "data": {
    "id": "org_zitadel123",
    "name": "Company Name",
    "slug": "company-name",
    "created_at": 1705942800000
  }
}
```

**Expected Response (200) - Success:**
```json
{
  "success": true,
  "organizationId": "internal_id",
  "schemaName": "tenant_org_zitadel123",
  "zitadelOrgId": "org_zitadel123"
}
```

### org.created - Race Condition Handling

The webhook handler includes race condition guards:

| Existing Org Status | Behavior |
|---------------------|----------|
| `READY` | Returns success (idempotent) |
| `PROVISIONING` (< 5 min) | Returns 409 conflict |
| `PROVISIONING` (> 5 min) | Treats as timed out, retries |
| `PENDING` / `FAILED` | Retries provisioning |

**Idempotent Response (200) - Already provisioned:**
```json
{
  "success": true,
  "organizationId": "internal_id",
  "schemaName": "tenant_org_zitadel123",
  "zitadelOrgId": "org_zitadel123",
  "idempotent": true
}
```

### org.removed - Two-Phase Deletion

Deletion uses a two-phase approach for reliability:

1. **Phase 1:** Mark organization as `DELETING`, create audit event
2. **Phase 2:** Drop schema, delete organization record

If schema drop fails, the organization is marked as `DELETE_FAILED` for retry via admin endpoint.

**Success Response (200):**
```json
{
  "success": true,
  "organizationId": "internal_id",
  "schemaName": "tenant_org_zitadel123",
  "message": "Organization and tenant schema deleted"
}
```

**Idempotent Response (200) - Already deleted:**
```json
{
  "success": true,
  "message": "Already deleted"
}
```

**Error Response (500) - Schema drop failed:**
```json
{
  "success": false,
  "error": "Schema drop failed: <error details>"
}
```

The organization will be in `DELETE_FAILED` status and can be retried via `POST /api/v1/admin/organizations/:id/retry-deletion`.

> **Warning:** Organization deletion is a destructive operation. The tenant schema and all data within it are permanently deleted.

---

## Testing Flow (Recommended Order)

1. **Health Check** - Verify API is running
2. **Create Organization via ZITADEL** - Use ZITADEL Console or webhook simulation
3. **Check Status** - GET /api/v1/admin/organizations/:id/status
4. **Provision** - POST /api/v1/admin/organizations/:id/provision (if PENDING/FAILED)
5. **Create Category** - (via database or future API endpoint)
6. **List Products** - GET /api/v1/products (with JWT)
7. **Create Product** - POST /api/v1/products (with JWT)
8. **Get Product** - GET /api/v1/products/:id (with JWT)

---

## Environment Variables (Postman)

| Variable | Example Value |
|----------|---------------|
| BASE_URL | http://localhost:3001 |
| TEST_TOKEN | (generated via pre-request script) |
| ORG_ID | (from create organization response) |
| PRODUCT_ID | (from create product response) |

---

## Notes

- **Slug format**: lowercase letters, numbers, and hyphens only (e.g., `acme-corp`)
- **Schema name**: Auto-generated from ZITADEL org ID (e.g., `tenant_org_abc12345`)
- **Tenant isolation**: Products are isolated per tenant schema - one tenant cannot see another's products
- **JWT verification**: In production with `ZITADEL_ISSUER` set, tokens are verified via ZITADEL JWKS
- **Webhook idempotency**: Webhooks are tracked by `x-request-id` header to prevent duplicate processing
- **Best-effort ZITADEL updates**: ZITADEL metadata sync failures don't fail provisioning - use sync-zitadel-metadata endpoint to retry
- **Provisioning timeout**: Stuck `PROVISIONING` status (> 5 minutes) is treated as failed and allows retry

## Error Recovery

| Problem | Solution |
|---------|----------|
| Provisioning failed | `POST /admin/organizations/:id/provision` |
| Deletion failed | `POST /admin/organizations/:id/retry-deletion` |
| ZITADEL metadata out of sync | `POST /admin/organizations/:id/sync-zitadel-metadata` |
| Duplicate webhook received | Automatic - returns idempotent response |
| Webhook stuck processing | Wait or check webhook_events table |
