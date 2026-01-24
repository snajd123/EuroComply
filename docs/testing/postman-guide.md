# EuroComply API - Postman Testing Guide

## Overview

This guide covers testing the EuroComply API with Postman. The API runs on `http://localhost:3001` by default.

## Prerequisites

1. Start the API server:
   ```bash
   pnpm dev
   ```

2. Ensure PostgreSQL is running (Docker):
   ```bash
   docker ps | grep postgres
   ```

3. Import this guide's requests into Postman as a collection.

---

## Environment Variables

Create a Postman environment with these variables:

| Variable | Initial Value | Description |
|----------|---------------|-------------|
| `baseUrl` | `http://localhost:3001` | API base URL |
| `adminApiKey` | `your-admin-key` | Admin API key from env |
| `clerkJwt` | `<your-clerk-jwt>` | JWT from Clerk (for tenant routes) |
| `tenantApiKey` | `<generated>` | API key created via /api-keys |
| `orgId` | `<auto>` | Organization ID |
| `schemaName` | `<auto>` | Tenant schema name |

---

## 1. Health Check

**No authentication required.**

### Request
```
GET {{baseUrl}}/health
```

### Expected Response (200)
```json
{
  "status": "healthy",
  "timestamp": "2026-01-24T10:00:00.000Z"
}
```

---

## 2. API Version

**No authentication required.**

### Request
```
GET {{baseUrl}}/api/v1
```

### Expected Response (200)
```json
{
  "message": "EuroComply API v1"
}
```

---

## 3. Admin Routes

**Requires Admin API Key in Authorization header.**

### Headers
```
Authorization: Bearer {{adminApiKey}}
```

### 3.1 List Organizations

```
GET {{baseUrl}}/api/v1/admin/organizations
```

**Response (200)**
```json
{
  "data": [
    {
      "id": "org_abc123",
      "name": "Acme Corp",
      "slug": "acme-corp",
      "schemaName": "tenant_org_x_abc123",
      "clerkOrgId": "org_clerk_xyz",
      "provisioningStatus": "READY",
      "createdAt": "2026-01-24T10:00:00.000Z",
      "updatedAt": "2026-01-24T10:00:00.000Z"
    }
  ],
  "meta": { "total": 1 }
}
```

### 3.2 Get Organization by ID

```
GET {{baseUrl}}/api/v1/admin/organizations/{{orgId}}
```

### 3.3 Get Organization Status

```
GET {{baseUrl}}/api/v1/admin/organizations/{{orgId}}/status
```

**Response (200)**
```json
{
  "id": "org_abc123",
  "name": "Acme Corp",
  "schemaName": "tenant_org_x_abc123",
  "clerkOrgId": "org_clerk_xyz",
  "provisioningStatus": "READY",
  "provisioningError": null
}
```

### 3.4 Provision Organization

Triggers tenant schema creation (creates tables including `users` and `organization_users`).

```
POST {{baseUrl}}/api/v1/admin/organizations/{{orgId}}/provision
```

**Response (200)**
```json
{
  "success": true,
  "organizationId": "org_abc123",
  "schemaName": "tenant_org_x_abc123",
  "provisioningStatus": "READY"
}
```

### 3.5 Delete Organization

```
DELETE {{baseUrl}}/api/v1/admin/organizations/{{orgId}}
```

**Response (200)**
```json
{
  "success": true,
  "organizationId": "org_abc123",
  "clerkOrgId": "org_clerk_xyz",
  "schemaName": "tenant_org_x_abc123",
  "message": "Organization and tenant schema deleted"
}
```

---

## 4. Taxonomy Routes (Public)

**No authentication required.**

### 4.1 List Units

```
GET {{baseUrl}}/api/v1/taxonomy/units
```

**Response (200)**
```json
{
  "data": [
    {
      "id": "unit_kg",
      "code": "KGM",
      "name": "Kilogram",
      "symbol": "kg",
      "system": "MASS",
      "factor": "1.0000000000",
      "isBase": true
    }
  ],
  "meta": { "total": 50 }
}
```

---

## 5. Tenant Routes

**Requires either Clerk JWT or Tenant API Key.**

### Authentication Options

**Option A: Clerk JWT**
```
Authorization: Bearer {{clerkJwt}}
```

**Option B: API Key**
```
X-API-Key: {{tenantApiKey}}
```

### 5.1 List Products

```
GET {{baseUrl}}/api/v1/products
```

**Response (200)**
```json
{
  "data": [],
  "meta": { "total": 0 }
}
```

### 5.2 Create Product

```
POST {{baseUrl}}/api/v1/products
Content-Type: application/json

{
  "name": "Test Product",
  "description": "A test product",
  "categoryId": "cat_abc123",
  "sku": "TEST-001"
}
```

**Note:** You need a valid `categoryId` from the tenant's categories table.

**Response (201)**
```json
{
  "data": {
    "id": "prod_xyz789",
    "name": "Test Product",
    "description": "A test product",
    "sku": "TEST-001",
    "categoryId": "cat_abc123",
    "status": "DRAFT",
    "createdAt": "2026-01-24T10:00:00.000Z",
    "updatedAt": "2026-01-24T10:00:00.000Z"
  }
}
```

### 5.3 Get Product by ID

```
GET {{baseUrl}}/api/v1/products/{{productId}}
```

---

## 6. API Key Management

**Requires Clerk JWT (not API Key).**

### 6.1 Create API Key

```
POST {{baseUrl}}/api/v1/api-keys
Authorization: Bearer {{clerkJwt}}
Content-Type: application/json

{
  "name": "My Integration Key",
  "expiresAt": "2027-01-24T00:00:00.000Z"
}
```

**Response (201)**
```json
{
  "data": {
    "id": "key_abc123",
    "name": "My Integration Key",
    "keyPreview": "ec_...xyz",
    "key": "ec_full_api_key_here",
    "expiresAt": "2027-01-24T00:00:00.000Z",
    "createdAt": "2026-01-24T10:00:00.000Z"
  }
}
```

**Important:** The full `key` is only returned once. Save it immediately!

### 6.2 List API Keys

```
GET {{baseUrl}}/api/v1/api-keys
Authorization: Bearer {{clerkJwt}}
```

### 6.3 Revoke API Key

```
DELETE {{baseUrl}}/api/v1/api-keys/{{keyId}}
Authorization: Bearer {{clerkJwt}}
```

---

## 7. Clerk Webhooks

**Signature-verified endpoint for Clerk events.**

### Endpoint
```
POST {{baseUrl}}/webhooks/clerk
```

### Headers
```
svix-id: msg_xxx
svix-timestamp: 1234567890
svix-signature: v1,base64signature
Content-Type: application/json
```

### Supported Events

| Event Type | Description |
|------------|-------------|
| `organization.created` | Creates org record, triggers provisioning |
| `organization.updated` | Updates org name/slug |
| `organization.deleted` | Drops schema, deletes org record |

---

## 8. Verify New User Tables

After provisioning an organization, verify the new `users` and `organization_users` tables exist:

### Via psql
```bash
PGPASSWORD=eurocomply psql -h localhost -p 5432 -U eurocomply -d eurocomply -c "
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'tenant_org_x_abc123'
ORDER BY table_name;
"
```

### Expected Tables
```
 table_name
--------------------
 attribute_template
 audit_log
 category
 organization_users   <-- NEW
 product
 product_version
 unit_definition
 users                <-- NEW
```

### Inspect User Table Schema
```sql
\d tenant_org_x_abc123.users
```

### Inspect OrganizationUser Table Schema
```sql
\d tenant_org_x_abc123.organization_users
```

---

## 9. Common Errors

### 401 Unauthorized
- Missing or invalid Authorization header
- Expired JWT or API key

### 403 Forbidden
- API key doesn't have access to this tenant
- JWT org doesn't match requested tenant

### 404 Not Found
- Organization/Product/Resource doesn't exist
- Wrong tenant context

### 400 Bad Request
- Validation error (check response body for details)
- Organization already provisioned

### 500 Internal Server Error
- Database connection issue
- Provisioning failure (check logs)

---

## 10. Testing Workflow

### Full Integration Test

1. **Check Health**
   ```
   GET /health → 200
   ```

2. **List Organizations (empty initially)**
   ```
   GET /api/v1/admin/organizations → 200, []
   ```

3. **Trigger Clerk Webhook** (or wait for real Clerk event)
   - Organization created via Clerk → webhook provisions tenant

4. **Verify Organization Provisioned**
   ```
   GET /api/v1/admin/organizations/{{orgId}}/status → provisioningStatus: "READY"
   ```

5. **Verify Tables Created**
   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = '{{schemaName}}';
   -- Should include: users, organization_users
   ```

6. **Create API Key**
   ```
   POST /api/v1/api-keys → 201, save the key
   ```

7. **Use API Key for Tenant Operations**
   ```
   GET /api/v1/products (X-API-Key header) → 200
   ```

---

## Notes

- **User/OrganizationUser entities** are created in the database but don't have API endpoints yet
- User sync happens via Clerk webhooks (Plan C - not yet implemented)
- User middleware and authorization (Plan B, D - not yet implemented)

---

*Last Updated: 2026-01-24*
