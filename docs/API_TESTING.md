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
  "success": true,
  "data": { "status": "healthy" },
  "meta": {
    "requestId": "req_abc123xyz",
    "timestamp": "2026-01-27T12:00:00.000Z"
  }
}
```

> **Note:** All responses include an `X-Request-Id` header matching `meta.requestId`.

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
  "success": true,
  "data": { "message": "EuroComply API v1" },
  "meta": {
    "requestId": "req_abc123xyz",
    "timestamp": "2026-01-27T12:00:00.000Z"
  }
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
  "data": {
    "organizationId": "abc123xyz",
    "schemaName": "tenant_org_abc123"
  },
  "meta": {
    "requestId": "req_abc123xyz",
    "timestamp": "2026-01-27T12:00:00.000Z"
  }
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": {
    "code": "WEBHOOK_HANDLER_ERROR",
    "message": "Provisioning failed: <error details>"
  },
  "meta": {
    "requestId": "req_abc123xyz",
    "timestamp": "2026-01-27T12:00:00.000Z"
  }
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
  "data": {
    "organizationId": "abc123xyz"
  },
  "meta": {
    "requestId": "req_abc123xyz",
    "timestamp": "2026-01-27T12:00:00.000Z"
  }
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
  "success": true,
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
  "meta": {
    "requestId": "req_abc123xyz",
    "timestamp": "2026-01-27T12:00:00.000Z",
    "total": 1
  }
}
```

**Error Response (401):**
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing X-Admin-Key header"
  },
  "meta": {
    "requestId": "req_abc123xyz",
    "timestamp": "2026-01-27T12:00:00.000Z"
  }
}
```

---

### GET /api/v1/admin/organizations/:id
Get organization by ID.

**Expected Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "abc123xyz",
    "name": "Test Organization",
    "slug": "test-organization",
    "schemaName": "tenant_org_abc123",
    "clerkOrgId": "org_postman_abc123",
    "provisioningStatus": "READY",
    ...
  },
  "meta": {
    "requestId": "req_abc123xyz",
    "timestamp": "2026-01-27T12:00:00.000Z"
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Organization not found"
  },
  "meta": {
    "requestId": "req_abc123xyz",
    "timestamp": "2026-01-27T12:00:00.000Z"
  }
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
  "success": true,
  "data": {
    "id": "abc123xyz",
    "name": "Test Organization",
    "schemaName": "tenant_org_abc123",
    "clerkOrgId": "org_postman_abc123",
    "provisioningStatus": "READY",
    "provisioningError": null
  },
  "meta": {
    "requestId": "req_abc123xyz",
    "timestamp": "2026-01-27T12:00:00.000Z"
  }
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
  "data": {
    "organizationId": "abc123xyz",
    "schemaName": "tenant_org_abc123",
    "provisioningStatus": "READY"
  },
  "meta": {
    "requestId": "req_abc123xyz",
    "timestamp": "2026-01-27T12:00:00.000Z"
  }
}
```

**Error Response (400)** - Already provisioned:
```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "This organization is already in READY state"
  },
  "meta": {
    "requestId": "req_abc123xyz",
    "timestamp": "2026-01-27T12:00:00.000Z"
  }
}
```

**Error Response (500)** - Provisioning failed:
```json
{
  "success": false,
  "error": {
    "code": "PROVISIONING_ERROR",
    "message": "Provisioning failed: <error details>"
  },
  "meta": {
    "requestId": "req_abc123xyz",
    "timestamp": "2026-01-27T12:00:00.000Z"
  }
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
  "data": {
    "organizationId": "abc123xyz",
    "clerkOrgId": "org_postman_abc123",
    "schemaName": "tenant_org_abc123",
    "message": "Organization and tenant schema deleted"
  },
  "meta": {
    "requestId": "req_abc123xyz",
    "timestamp": "2026-01-27T12:00:00.000Z"
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Organization not found"
  },
  "meta": {
    "requestId": "req_abc123xyz",
    "timestamp": "2026-01-27T12:00:00.000Z"
  }
}
```

**Error Response (500)** - Schema drop failed:
```json
{
  "success": false,
  "error": {
    "code": "SCHEMA_DROP_ERROR",
    "message": "Failed to drop schema: <error details>"
  },
  "meta": {
    "requestId": "req_abc123xyz",
    "timestamp": "2026-01-27T12:00:00.000Z"
  }
}
```

---

## 6. API Key Management

Tenants can create and manage API keys for programmatic access. API keys now support **workspace-level authorization** - each key can have different access levels for different workspaces, just like human users.

### Authentication
```
Authorization: Bearer <JWT_TOKEN>
```
or
```
X-API-Key: ek_live_xxxxxxxx...
```

> **Note:** API key management requires **Org Admin** privileges. Both JWT users with `isOrgAdmin: true` and API keys with `isOrgAdmin: true` can manage API keys.

---

### POST /api/v1/api-keys
Create a new API key with workspace-scoped permissions.

**Request Body:**
```json
{
  "name": "Production Key",
  "designAuthority": "EDITOR",
  "operationsAuthority": "VIEWER",
  "marketingAuthority": "NONE",
  "complianceAuthority": "NONE",
  "isOrgAdmin": false
}
```

**Workspace Authority Levels:**
| Level | Can View | Can Edit | Can Manage |
|-------|----------|----------|------------|
| `NONE` | No | No | No |
| `VIEWER` | Yes | No | No |
| `CONTRIBUTOR` | Yes | Yes | No |
| `EDITOR` | Yes | Yes | No |
| `MANAGER` | Yes | Yes | Yes |

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "key_abc123xyz",
    "keyPrefix": "ek_live_7fHj2kL",
    "name": "Production Key",
    "designAuthority": "EDITOR",
    "operationsAuthority": "VIEWER",
    "marketingAuthority": "NONE",
    "complianceAuthority": "NONE",
    "isOrgAdmin": false,
    "createdAt": "2026-01-23T12:00:00.000Z",
    "rawKey": "ek_live_7fHj2kLm9pQr5tUv8wXy1zAaBbCcDdEeFfGgHhIi"
  },
  "meta": {
    "requestId": "req_abc123xyz",
    "timestamp": "2026-01-27T12:00:00.000Z"
  }
}
```

> **Important:** The `rawKey` is only returned once at creation time. Store it securely.

**Validation Error (400):**
```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid designAuthority: must be one of NONE, VIEWER, CONTRIBUTOR, EDITOR, MANAGER"
  },
  "meta": {
    "requestId": "req_abc123xyz",
    "timestamp": "2026-01-27T12:00:00.000Z"
  }
}
```

---

### GET /api/v1/api-keys
List all API keys for the tenant, including their workspace authorities.

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "key_abc123xyz",
      "keyPrefix": "ek_live_7fHj2kL",
      "name": "Production Key",
      "designAuthority": "EDITOR",
      "operationsAuthority": "VIEWER",
      "marketingAuthority": "NONE",
      "complianceAuthority": "NONE",
      "isOrgAdmin": false,
      "createdAt": "2026-01-23T12:00:00.000Z",
      "lastUsedAt": "2026-01-23T14:30:00.000Z",
      "isActive": true
    }
  ],
  "meta": {
    "requestId": "req_abc123xyz",
    "timestamp": "2026-01-27T12:00:00.000Z",
    "total": 1
  }
}
```

---

### DELETE /api/v1/api-keys/:id
Revoke an API key.

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "API key revoked"
  },
  "meta": {
    "requestId": "req_abc123xyz",
    "timestamp": "2026-01-27T12:00:00.000Z"
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "API key not found"
  },
  "meta": {
    "requestId": "req_abc123xyz",
    "timestamp": "2026-01-27T12:00:00.000Z"
  }
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
  "success": true,
  "data": [],
  "meta": {
    "requestId": "req_abc123xyz",
    "timestamp": "2026-01-27T12:00:00.000Z",
    "total": 0
  }
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
  "success": true,
  "data": {
    "id": "prod_abc123",
    "name": "Widget Pro",
    "status": "DRAFT",
    ...
  },
  "meta": {
    "requestId": "req_abc123xyz",
    "timestamp": "2026-01-27T12:00:00.000Z"
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
1. Authenticate with JWT token (Org Admin)
   Authorization: Bearer <JWT_TOKEN>

2. Create API key with Design EDITOR access
   POST /api/v1/api-keys
   Body: {
     "name": "Design Editor Key",
     "designAuthority": "EDITOR",
     "operationsAuthority": "NONE",
     "marketingAuthority": "NONE",
     "complianceAuthority": "NONE",
     "isOrgAdmin": false
   }
   → Save the rawKey (only shown once!)

3. List API keys
   GET /api/v1/api-keys
   → Should show the new key with authorities

4. Test Design workspace access (should work)
   GET /api/v1/products
   Headers: X-API-Key: ek_live_xxx...
   → 200 OK (Design EDITOR can view products)

5. Test Compliance workspace access (should fail)
   GET /api/v1/compliance/reports
   Headers: X-API-Key: ek_live_xxx...
   → 403 Forbidden (key has NONE on compliance)
   Response includes: { "yourAuthority": "NONE", "workspace": "compliance" }

6. Verify non-admin API key can't manage keys
   POST /api/v1/api-keys
   Headers: X-API-Key: ek_live_xxx...
   → 403 Forbidden (isOrgAdmin: false)

7. Create API key with Org Admin access
   POST /api/v1/api-keys
   Body: {
     "name": "Admin Key",
     "designAuthority": "MANAGER",
     "operationsAuthority": "MANAGER",
     "marketingAuthority": "MANAGER",
     "complianceAuthority": "MANAGER",
     "isOrgAdmin": true
   }

8. Verify admin API key CAN manage keys
   GET /api/v1/api-keys
   Headers: X-API-Key: <admin_key>
   → 200 OK (isOrgAdmin: true allows key management)

9. Revoke API key
   DELETE /api/v1/api-keys/{keyId}
   → success: true

10. Verify revoked key doesn't work
    GET /api/v1/products
    Headers: X-API-Key: <revoked_key>
    → 401 Unauthorized
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
- **API key workspace scoping**: API keys have per-workspace authority levels (NONE, VIEWER, CONTRIBUTOR, EDITOR, MANAGER), just like human users
- **API key management**: Requires Org Admin privileges (JWT user with `isOrgAdmin: true` OR API key with `isOrgAdmin: true`)
