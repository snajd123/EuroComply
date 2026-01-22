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

> **Note:** Organizations are created exclusively via Clerk webhooks. There is no public API endpoint to create organizations. This ensures Clerk is the single source of truth.

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
Get organization provisioning status. Accepts internal ID or Clerk org ID.

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
  "clerkOrgId": null,
  "provisioningStatus": "PENDING",
  "provisioningError": null
}
```

Possible `provisioningStatus` values:
- `PENDING` - Waiting to be provisioned
- `PROVISIONING` - Currently being provisioned
- `READY` - Successfully provisioned
- `FAILED` - Provisioning failed (check `provisioningError`)

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

## 5. Products (Tenant-Scoped Routes)

These routes require a JWT token with tenant information.

### Authentication Setup

**Header:**
```
Authorization: Bearer <JWT_TOKEN>
```

**For Testing (without Clerk):**
Create a mock JWT with this structure:
```
header.payload.signature
```

Where payload is base64-encoded JSON:
```json
{
  "sub": "user_123",
  "org_metadata": {
    "schema_name": "tenant_acme_corp"
  }
}
```

**Postman Pre-request Script to generate test token:**
```javascript
const payload = {
  sub: "user_123",
  org_metadata: {
    schema_name: "tenant_acme_corp"
  }
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

## 6. Webhooks (Clerk Integration)

### POST /webhooks/clerk
Receive Clerk organization events.

**Required Headers:**
```
Content-Type: application/json
svix-id: <webhook-id>
svix-timestamp: <unix-timestamp>
svix-signature: <signature>
```

**organization.created Event:**
```json
{
  "type": "organization.created",
  "data": {
    "id": "org_clerk123",
    "name": "New Company",
    "slug": "new-company",
    "created_at": 1705942800000
  }
}
```

**organization.deleted Event:**
```json
{
  "type": "organization.deleted",
  "data": {
    "id": "org_clerk123",
    "deleted": true
  }
}
```

**Expected Response (200):**
```json
{
  "success": true,
  "organizationId": "internal_id",
  "schemaName": "tenant_new_company"
}
```

---

## Testing Flow (Recommended Order)

1. **Health Check** - Verify API is running
2. **Create Organization via Clerk** - Use Clerk dashboard or webhook simulation
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
- **Schema name**: Auto-generated as `tenant_<slug_with_underscores>` (e.g., `tenant_acme_corp`)
- **Tenant isolation**: Products are isolated per tenant schema - one tenant cannot see another's products
- **JWT verification**: In production with `CLERK_SECRET_KEY` set, tokens are verified via Clerk JWKS
