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
  "timestamp": "2026-01-23T12:00:00.000Z"
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

## 3. Webhooks (Clerk Integration)

Organizations are created and deleted via Clerk webhooks. The webhook endpoint verifies Svix signatures.

### POST /webhooks/clerk

**Required Headers:**
```
Content-Type: application/json
svix-id: <webhook-id>
svix-timestamp: <unix-timestamp>
svix-signature: v1,<base64-signature>
```

### Postman Pre-request Script

Use this script to generate valid Svix signatures for testing:

```javascript
const secret = pm.environment.get("CLERK_WEBHOOK_SECRET");
const timestamp = Math.floor(Date.now() / 1000).toString();
const webhookId = "msg_" + Math.random().toString(36).substring(2, 15);

// Generate random suffix for unique org
const randomSuffix = Math.random().toString(36).substring(2, 8);

// Build the body - change "type" for different events
const body = JSON.stringify({
    type: "organization.created",  // or "organization.deleted"
    data: {
        id: `org_postman_${randomSuffix}`,
        name: `Postman Test Org ${randomSuffix}`,
        slug: `postman-test-org-${randomSuffix}`,
        created_at: Date.now()
    }
});

// Set the request body
pm.request.body.raw = body;

// Create the signed payload
const signedPayload = `${webhookId}.${timestamp}.${body}`;

// Decode the base64 secret (remove 'whsec_' prefix)
const secretKey = secret.replace('whsec_', '');
const secretBytes = CryptoJS.enc.Base64.parse(secretKey);

// Generate HMAC-SHA256 signature
const signature = CryptoJS.HmacSHA256(signedPayload, secretBytes);
const signatureBase64 = CryptoJS.enc.Base64.stringify(signature);

// Set headers
pm.request.headers.upsert({ key: "svix-id", value: webhookId });
pm.request.headers.upsert({ key: "svix-timestamp", value: timestamp });
pm.request.headers.upsert({ key: "svix-signature", value: `v1,${signatureBase64}` });

// Store clerkOrgId for later use (deletion)
pm.environment.set("CLERK_ORG_ID", `org_postman_${randomSuffix}`);
```

---

### organization.created Event

Creates an organization and provisions a tenant schema.

**Request Body:**
```json
{
  "type": "organization.created",
  "data": {
    "id": "org_postman_abc123",
    "name": "Test Organization",
    "slug": "test-organization",
    "created_at": 1705942800000
  }
}
```

**Success Response (200):**
```json
{
  "success": true,
  "idempotent": false,
  "organizationId": "abc123xyz",
  "clerkOrgId": "org_postman_abc123",
  "name": "Test Organization",
  "slug": "test-organization",
  "schemaName": "tenant_org_abc123",
  "provisioningStatus": "READY",
  "message": "Organization created and provisioned"
}
```

**Idempotent Response (200)** - if org already exists:
```json
{
  "success": true,
  "idempotent": true,
  "organizationId": "abc123xyz",
  "clerkOrgId": "org_postman_abc123",
  "name": "Test Organization",
  "slug": "test-organization",
  "schemaName": "tenant_org_abc123",
  "provisioningStatus": "EXISTING",
  "message": "Organization already exists"
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Provisioning failed: <error details>",
  "organizationId": "abc123xyz",
  "schemaName": "tenant_org_abc123"
}
```

---

### organization.deleted Event

Deletes an organization and drops its tenant schema.

**Request Body:**
```json
{
  "type": "organization.deleted",
  "data": {
    "id": "org_postman_abc123",
    "name": "Test Organization",
    "slug": "test-organization",
    "created_at": 1705942800000
  }
}
```

**Success Response (200):**
```json
{
  "success": true,
  "idempotent": false,
  "organizationId": "abc123xyz",
  "clerkOrgId": "org_postman_abc123",
  "schemaName": "tenant_org_abc123",
  "message": "Organization and tenant schema deleted"
}
```

**Idempotent Response (200)** - if org already deleted:
```json
{
  "success": true,
  "idempotent": true,
  "organizationId": null,
  "clerkOrgId": "org_postman_abc123",
  "schemaName": null,
  "message": "Organization already deleted"
}
```

---

## 4. Organizations (Admin-Only)

> **Note:** Organizations are created via Clerk webhooks. All organization endpoints require admin authentication.

> **Authentication Required:** All organization endpoints require the `X-Admin-Key` header.

```
X-Admin-Key: <ADMIN_API_KEY>
```

---

### GET /api/v1/admin/organizations
List all organizations.

**Expected Response (200):**
```json
{
  "data": [
    {
      "id": "abc123xyz",
      "name": "Test Organization",
      "slug": "test-organization",
      "schemaName": "tenant_org_abc123",
      "clerkOrgId": "org_postman_abc123",
      "provisioningStatus": "READY",
      "createdAt": "2026-01-23T12:00:00.000Z",
      "updatedAt": "2026-01-23T12:00:00.000Z"
    }
  ],
  "meta": { "total": 1 }
}
```

**Error Response (401):**
```json
{
  "error": "Unauthorized",
  "message": "Missing X-Admin-Key header"
}
```

---

### GET /api/v1/admin/organizations/:id
Get organization by ID.

**Expected Response (200):**
```json
{
  "data": {
    "id": "abc123xyz",
    "name": "Test Organization",
    "slug": "test-organization",
    "schemaName": "tenant_org_abc123",
    "clerkOrgId": "org_postman_abc123",
    "provisioningStatus": "READY",
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

## 5. Admin Operations (Additional)

> **Authentication Required:** All admin endpoints require the `X-Admin-Key` header.

```
X-Admin-Key: <ADMIN_API_KEY>
```

**Error Responses:**
- `401` - Missing or invalid API key
- `500` - `ADMIN_API_KEY` not configured on server

---

### GET /api/v1/admin/organizations/:id/status
Get organization provisioning status. Accepts internal ID or Clerk org ID.

**Expected Response (200):**
```json
{
  "id": "abc123xyz",
  "name": "Test Organization",
  "schemaName": "tenant_org_abc123",
  "clerkOrgId": "org_postman_abc123",
  "provisioningStatus": "READY",
  "provisioningError": null
}
```

**Provisioning Status Values:**
| Status | Description |
|--------|-------------|
| `PENDING` | Waiting to be provisioned |
| `PROVISIONING` | Currently being provisioned |
| `READY` | Successfully provisioned |
| `FAILED` | Failed (check `provisioningError`) |

---

### POST /api/v1/admin/organizations/:id/provision
Retry provisioning for PENDING or FAILED organizations.

**Success Response (200):**
```json
{
  "success": true,
  "organizationId": "abc123xyz",
  "schemaName": "tenant_org_abc123",
  "provisioningStatus": "READY"
}
```

**Error Response (400)** - Already provisioned:
```json
{
  "error": "Organization already provisioned",
  "message": "This organization is already in READY state"
}
```

**Error Response (500)** - Provisioning failed:
```json
{
  "success": false,
  "error": "Provisioning failed: <error details>"
}
```

---

### DELETE /api/v1/admin/organizations/:id
Delete an organization and drop its tenant schema. Use this to retry a failed deletion.

Accepts internal ID or Clerk org ID.

**Success Response (200):**
```json
{
  "success": true,
  "organizationId": "abc123xyz",
  "clerkOrgId": "org_postman_abc123",
  "schemaName": "tenant_org_abc123",
  "message": "Organization and tenant schema deleted"
}
```

**Error Response (404):**
```json
{
  "error": "Organization not found"
}
```

**Error Response (500)** - Schema drop failed:
```json
{
  "success": false,
  "error": "Failed to drop schema: <error details>",
  "organizationId": "abc123xyz",
  "schemaName": "tenant_org_abc123"
}
```

---

## 6. API Key Management (JWT-only)

Tenants can create and manage API keys for programmatic access. These endpoints **require JWT authentication** - you cannot manage API keys using an API key.

### Authentication
```
Authorization: Bearer <JWT_TOKEN>
```

> **Note:** API key management is restricted to JWT auth only. If you try to access these endpoints with an API key, you'll get a 403 Forbidden error.

---

### POST /api/v1/api-keys
Create a new API key.

**Request Body:**
```json
{
  "name": "Production Key"
}
```

**Success Response (201):**
```json
{
  "data": {
    "id": "key_abc123xyz",
    "keyPrefix": "ek_live_7fHj2kL",
    "name": "Production Key",
    "createdAt": "2026-01-23T12:00:00.000Z"
  },
  "rawKey": "ek_live_7fHj2kLm9pQr5tUv8wXy1zAaBbCcDdEeFfGgHhIi",
  "message": "API key created. Save the rawKey - it will not be shown again."
}
```

> **Important:** The `rawKey` is only returned once at creation time. Store it securely.

---

### GET /api/v1/api-keys
List all API keys for the tenant.

**Success Response (200):**
```json
{
  "data": [
    {
      "id": "key_abc123xyz",
      "keyPrefix": "ek_live_7fHj2kL",
      "name": "Production Key",
      "createdAt": "2026-01-23T12:00:00.000Z",
      "lastUsedAt": "2026-01-23T14:30:00.000Z",
      "isActive": true
    }
  ],
  "meta": { "total": 1 }
}
```

---

### DELETE /api/v1/api-keys/:id
Revoke an API key.

**Success Response (200):**
```json
{
  "success": true,
  "message": "API key revoked"
}
```

**Error Response (404):**
```json
{
  "error": "Not Found",
  "message": "API key not found"
}
```

---

## 7. Products (Tenant-Scoped)

These routes support **both JWT and API key** authentication.

### Authentication Headers

**Option 1: JWT Token**
```
Authorization: Bearer <JWT_TOKEN>
```

**Option 2: API Key**
```
X-API-Key: ek_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Postman Setup

**Option 1: Using JWT Token (with query param)**

URL:
```
{{BASE_URL}}/api/v1/products?schema_name=tenant_org_abc123
```

Pre-request Script:
```javascript
const schemaName = pm.request.url.query.get('schema_name');

const payload = {
    sub: "user_123",
    schema_name: schemaName
};
const token = "header." + btoa(JSON.stringify(payload)) + ".signature";
pm.environment.set("TEST_TOKEN", token);
```

Headers:
| Key | Value |
|-----|-------|
| Authorization | Bearer {{TEST_TOKEN}} |

**Option 2: Using API Key**

No script needed. Just add the header:

| Key | Value |
|-----|-------|
| X-API-Key | ek_live_xxxxxxxx... |

Copy the `rawKey` from your `POST /api/v1/api-keys` response.

---

### GET /api/v1/products
List all products for the authenticated tenant.

**Expected Response (200):**
```json
{
  "data": [],
  "meta": { "total": 0 }
}
```

---

### POST /api/v1/products
Create a new product.

**Request Body:**
```json
{
  "name": "Widget Pro",
  "description": "Professional-grade widget",
  "sku": "WGT-PRO-001",
  "gtin": "12345678901234",
  "categoryId": "category_id_here",
  "metadata": {
    "weight": "500g"
  }
}
```

**Expected Response (201):**
```json
{
  "data": {
    "id": "prod_abc123",
    "name": "Widget Pro",
    "status": "DRAFT",
    ...
  }
}
```

---

## 8. Testing Flow

### Complete Test Scenario

```
1. Health Check
   GET /health

2. Create Organization (webhook)
   POST /webhooks/clerk
   Body: { "type": "organization.created", ... }
   → Save organizationId and clerkOrgId

3. Verify in Adminer
   - Check "organizations" table
   - Check for new schema "tenant_org_xxx"

4. Check Status
   GET /api/v1/admin/organizations/{id}/status
   → Should show provisioningStatus: "READY"

5. List Organizations (admin auth required)
   GET /api/v1/admin/organizations
   Headers: X-Admin-Key: <ADMIN_API_KEY>
   → Should include new org

6. Test Idempotency (create same org again)
   POST /webhooks/clerk (same clerkOrgId)
   → Should return idempotent: true

7. Delete Organization (webhook)
   POST /webhooks/clerk
   Body: { "type": "organization.deleted", ... }
   → Org and schema removed

8. Verify Deletion
   GET /api/v1/admin/organizations
   Headers: X-Admin-Key: <ADMIN_API_KEY>
   → Org should be gone

9. Test Idempotency (delete again)
   POST /webhooks/clerk (same clerkOrgId)
   → Should return idempotent: true
```

### Failure Recovery Test

```
1. Create org that fails provisioning
   (simulate by breaking DB connection)

2. Check status
   GET /api/v1/admin/organizations/{id}/status
   → provisioningStatus: "FAILED"

3. Retry provisioning
   POST /api/v1/admin/organizations/{id}/provision
   → Should succeed now

4. For stuck deletions
   DELETE /api/v1/admin/organizations/{id}
   → Retries schema drop + deletes org
```

### API Key Test Flow

```
1. Authenticate with JWT token
   Authorization: Bearer <JWT_TOKEN>

2. Create API key
   POST /api/v1/api-keys
   Body: { "name": "Test Key" }
   → Save the rawKey (only shown once!)

3. List API keys
   GET /api/v1/api-keys
   → Should show the new key

4. Test programmatic access with API key
   GET /api/v1/products
   Headers: X-API-Key: ek_live_xxx...
   → Should work

5. Verify API key can't manage keys
   POST /api/v1/api-keys
   Headers: X-API-Key: ek_live_xxx...
   → Should return 403 Forbidden

6. Revoke API key
   DELETE /api/v1/api-keys/{keyId}
   → success: true

7. Verify revoked key doesn't work
   GET /api/v1/products
   Headers: X-API-Key: <revoked_key>
   → Should return 401
```

---

## 9. Environment Variables (Postman)

| Variable | Example Value |
|----------|---------------|
| `BASE_URL` | `http://localhost:3001` |
| `CLERK_WEBHOOK_SECRET` | `whsec_xxx...` |
| `ADMIN_API_KEY` | `6fRoO4fpVQkVMsO39_9wvaZzPz1lF4ZSxCH3YPA3v_Q` |
| `CLERK_ORG_ID` | (set by pre-request script) |
| `ORG_ID` | (from webhook response) |
| `TEST_TOKEN` | (generated for JWT auth) |
| `TENANT_API_KEY` | (from API key creation response) |

---

## 10. Notes

- **Schema naming**: Based on Clerk org ID (last 8 chars), e.g., `tenant_org_abc123`
- **Idempotency**: Duplicate webhooks are handled gracefully
- **Tenant isolation**: Each org has its own PostgreSQL schema
- **Signature verification**: All webhooks must have valid Svix signatures
- **API key security**: Keys are hashed (SHA-256), never stored raw. Only shown once at creation.
- **Admin vs Tenant auth**: Admin uses `X-Admin-Key`, tenants use `X-API-Key` or JWT Bearer token
- **API key management**: Requires JWT auth (not API key) to prevent unauthorized key creation
