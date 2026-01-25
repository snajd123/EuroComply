# EuroComply API - Postman Testing Guide

## Overview

This guide covers testing the EuroComply API with Postman. The API runs on `http://localhost:3001` by default.

## Prerequisites

1. Start infrastructure (PostgreSQL + Redis):
   ```bash
   docker-compose up -d postgres redis adminer
   ```

2. Run database migrations:
   ```bash
   pnpm db:migrate
   ```

3. Start the API server:
   ```bash
   pnpm --filter @eurocomply/api dev
   ```

4. Verify PostgreSQL is running:
   ```bash
   docker ps | grep postgres
   ```

5. (Optional) Access database admin UI at http://localhost:8080 (Adminer)

---

## Environment Variables

Create a Postman environment with these variables:

| Variable | Initial Value | Description |
|----------|---------------|-------------|
| `baseUrl` | `http://localhost:3001` | API base URL |
| `adminApiKey` | `your-admin-key` | Admin API key from ADMIN_API_KEY env (for /admin routes) |
| `clerkJwt` | `<your-clerk-jwt>` | JWT from Clerk (for tenant routes) |
| `clerkJwtSecondUser` | `<second-user-jwt>` | JWT for second user (to test authorization) |
| `tenantApiKey` | `<generated>` | Tenant API key with workspace-scoped access |
| `tenantAdminApiKey` | `<generated>` | Tenant API key with isOrgAdmin: true |
| `orgId` | `<auto>` | Organization ID |
| `schemaName` | `<auto>` | Tenant schema name |
| `clerkOrgId` | `<from-clerk>` | Clerk organization ID |

---

## Authentication Overview

The API uses multiple authentication methods:

| Route | Auth Method | Who Can Access |
|-------|-------------|----------------|
| `/health`, `/api/v1` | None | Everyone |
| `/api/v1/taxonomy/*` | None | Everyone |
| `/api/v1/admin/*` | Admin API Key | System admins only |
| `/api/v1/products/*` | JWT or API Key | Users with Design workspace access |
| `/api/v1/api-keys/*` | JWT or API Key | Org admins only |
| `/webhooks/clerk` | Svix signature | Clerk webhooks |

### User Authorization Levels

Users have workspace-specific authority levels:

| Level | Can View | Can Edit | Can Manage |
|-------|----------|----------|------------|
| `NONE` | No | No | No |
| `VIEWER` | Yes | No | No |
| `CONTRIBUTOR` | Yes | Yes | No |
| `EDITOR` | Yes | Yes | No |
| `MANAGER` | Yes | Yes | Yes |

**First user in an organization automatically gets MANAGER + isOrgAdmin.**

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
      "schemaName": "tenant_org_abc123",
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
  "schemaName": "tenant_org_abc123",
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
  "schemaName": "tenant_org_abc123",
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
  "schemaName": "tenant_org_abc123",
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

## 5. Tenant Routes (Products)

**Requires Clerk JWT or Tenant API Key + Design workspace access.**

### Authentication Options

**Option A: Clerk JWT**
```
Authorization: Bearer {{clerkJwt}}
```

**Option B: API Key (org-level access)**
```
X-API-Key: {{tenantApiKey}}
```

### Authorization Requirements

| Endpoint | Method | Required Authority |
|----------|--------|-------------------|
| `/products` | GET | Design VIEWER+ |
| `/products` | POST | Design CONTRIBUTOR+ (edit) |
| `/products/:id` | GET | Design VIEWER+ |

### 5.1 List Products

```
GET {{baseUrl}}/api/v1/products
Authorization: Bearer {{clerkJwt}}
```

**Response (200)** - User has Design VIEWER+ access
```json
{
  "data": [],
  "meta": { "total": 0 }
}
```

**Response (403)** - User/API key has insufficient authority
```json
{
  "error": "Forbidden",
  "message": "This action requires VIEWER access to the design workspace",
  "workspace": "design",
  "action": "view",
  "yourAuthority": "NONE",
  "requiredAuthority": "VIEWER"
}
```

**Response (202)** - User exists in Clerk but not yet synced
```json
{
  "error": "Provisioning",
  "message": "Setting up your account. Please retry in a moment.",
  "retryAfter": 2
}
```

### 5.2 Create Product

```
POST {{baseUrl}}/api/v1/products
Authorization: Bearer {{clerkJwt}}
Content-Type: application/json

{
  "name": "Test Product",
  "description": "A test product",
  "categoryId": "cat_abc123",
  "sku": "TEST-001"
}
```

**Note:** Requires Design CONTRIBUTOR+ authority. You need a valid `categoryId` from the tenant's categories table.

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

**Response (403)** - User/API key only has VIEWER authority
```json
{
  "error": "Forbidden",
  "message": "This action requires EDITOR access to the design workspace",
  "workspace": "design",
  "action": "edit",
  "yourAuthority": "VIEWER",
  "requiredAuthority": "EDITOR"
}
```

### 5.3 Get Product by ID

```
GET {{baseUrl}}/api/v1/products/{{productId}}
Authorization: Bearer {{clerkJwt}}
```

---

## 6. API Key Management

**Requires Org Admin status (JWT user or API key with `isOrgAdmin: true`).**

### Authorization
- Only **Org Admins** can manage API keys
- Both JWT users with `isOrgAdmin: true` AND API keys with `isOrgAdmin: true` can manage keys

### 6.1 Create API Key

API keys now support **workspace-level authorization**. Each key can have different access levels for different workspaces, just like human users.

```
POST {{baseUrl}}/api/v1/api-keys
Authorization: Bearer {{clerkJwt}}
Content-Type: application/json

{
  "name": "Design Integration Key",
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

**Response (201)**
```json
{
  "data": {
    "id": "key_abc123",
    "name": "Design Integration Key",
    "keyPrefix": "ek_live_7fHj2kL",
    "designAuthority": "EDITOR",
    "operationsAuthority": "VIEWER",
    "marketingAuthority": "NONE",
    "complianceAuthority": "NONE",
    "isOrgAdmin": false,
    "createdAt": "2026-01-24T10:00:00.000Z"
  },
  "rawKey": "ek_live_7fHj2kLm9pQr5tUv8wXy1zAaBbCcDdEeFfGgHhIi",
  "message": "API key created. Save the rawKey - it will not be shown again."
}
```

**Important:** The `rawKey` is only returned once. Save it immediately!

**Response (400)** - Invalid authority value
```json
{
  "error": "Bad Request",
  "message": "Invalid designAuthority: must be one of NONE, VIEWER, CONTRIBUTOR, EDITOR, MANAGER"
}
```

**Response (403)** - User is not Org Admin
```json
{
  "error": "Forbidden",
  "message": "This action requires Organization Admin privileges"
}
```

### 6.2 List API Keys

```
GET {{baseUrl}}/api/v1/api-keys
Authorization: Bearer {{clerkJwt}}
```

**Response (200)**
```json
{
  "data": [
    {
      "id": "key_abc123",
      "keyPrefix": "ek_live_7fHj2kL",
      "name": "Design Integration Key",
      "designAuthority": "EDITOR",
      "operationsAuthority": "VIEWER",
      "marketingAuthority": "NONE",
      "complianceAuthority": "NONE",
      "isOrgAdmin": false,
      "createdAt": "2026-01-24T10:00:00.000Z",
      "lastUsedAt": "2026-01-24T14:30:00.000Z",
      "isActive": true
    }
  ],
  "meta": { "total": 1 }
}
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
| `organization.created` | Creates org record, provisions tenant schema |
| `organization.updated` | Updates org name/slug |
| `organization.deleted` | Drops schema, deletes org record |
| `organizationMembership.created` | Creates User + OrganizationUser in tenant |
| `organizationMembership.deleted` | Soft-deletes user (sets deletedAt) |
| `user.updated` | Queues profile sync via outbox |

### Membership Created Response
```json
{
  "status": "created",
  "userId": "usr_abc123"
}
```

### Membership Created - First User
First user in an organization gets:
- `isOrgAdmin: true`
- All workspace authorities: `MANAGER`

### Membership Created - Subsequent Users
- `isOrgAdmin: false` (unless Clerk role is `org:admin`)
- All workspace authorities: `NONE`

### Membership Deleted Response
```json
{
  "status": "soft_deleted"
}
```

### Retryable Error (503)
If org is not yet provisioned when membership webhook arrives:
```json
{
  "error": "Organization not yet provisioned"
}
```
Clerk will retry automatically.

---

## 8. Database Verification

### 8.1 Connect to Database

**Via Adminer (UI):**
- URL: http://localhost:8080
- System: PostgreSQL
- Server: postgres
- Username: postgres
- Password: postgres
- Database: eurocomply

**Via psql:**
```bash
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d eurocomply
```

### 8.2 List Tenant Tables

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'tenant_org_abc123'
ORDER BY table_name;
```

**Expected Tables:**
```
 table_name
--------------------
 attribute_template
 audit_log
 category
 category_adoption
 organization_users
 product
 product_version
 unit_definition
 users
```

### 8.3 Inspect Users Table

```sql
SELECT id, clerk_id, email, name, deleted_at
FROM tenant_org_abc123.users;
```

### 8.4 Inspect Organization Users Table

```sql
SELECT
  ou.id,
  u.email,
  ou.is_org_admin,
  ou.design_authority,
  ou.operations_authority,
  ou.marketing_authority,
  ou.compliance_authority
FROM tenant_org_abc123.organization_users ou
JOIN tenant_org_abc123.users u ON u.id = ou.user_id;
```

### 8.5 Verify First User Permissions

First user should have:
```
is_org_admin: true
design_authority: MANAGER
operations_authority: MANAGER
marketing_authority: MANAGER
compliance_authority: MANAGER
```

---

## 9. Common Errors

### 401 Unauthorized
- Missing or invalid Authorization header
- Expired JWT or API key
- Invalid JWT signature

### 403 Forbidden
- User doesn't have required workspace authority
- User is not Org Admin (for API key management)
- User was soft-deleted from organization

### 202 Accepted (Provisioning)
- User exists in Clerk JWT but hasn't been synced yet
- Retry after a moment (webhook will create user)

### 404 Not Found
- Organization/Product/Resource doesn't exist
- Wrong tenant context

### 400 Bad Request
- Validation error (check response body for details)
- Organization already provisioned

### 500 Internal Server Error
- Database connection issue
- Provisioning failure (check logs)

### 503 Service Unavailable
- Organization not yet provisioned (webhook will retry)

---

## 10. Full Integration Testing Workflow

### Phase 1: Setup Clerk

1. **Create Clerk Application**
   - Go to https://dashboard.clerk.com
   - Create a new application
   - Enable Organizations feature
   - Get your API keys

2. **Configure Webhooks in Clerk**
   - Go to Webhooks section
   - Add endpoint: `https://your-api-url/webhooks/clerk`
   - Select events:
     - `organization.created`
     - `organization.updated`
     - `organization.deleted`
     - `organizationMembership.created`
     - `organizationMembership.deleted`
     - `user.updated`
   - Copy the signing secret

3. **Set Environment Variables**
   ```bash
   export CLERK_WEBHOOK_SECRET=whsec_xxx
   export CLERK_SECRET_KEY=sk_test_xxx
   export CLERK_PUBLISHABLE_KEY=pk_test_xxx
   ```

### Phase 2: Test Organization Flow

1. **Check Health**
   ```
   GET /health → 200
   ```

2. **Create Organization in Clerk Dashboard**
   - Go to Clerk Dashboard → Organizations
   - Create new organization
   - Wait for webhook to fire

3. **Verify Organization Created**
   ```
   GET /api/v1/admin/organizations → 200
   ```
   Should show your new organization with `provisioningStatus: "READY"`

4. **Verify Tenant Schema**
   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_schema LIKE 'tenant_org_%';
   ```

### Phase 3: Test User Flow

5. **Add Yourself to Organization in Clerk**
   - You'll be the first user → MANAGER + isOrgAdmin

6. **Verify User Created in Database**
   ```sql
   SELECT * FROM tenant_org_xxx.users;
   SELECT * FROM tenant_org_xxx.organization_users;
   ```
   Should show your user with full MANAGER access.

7. **Get JWT from Clerk**
   - Use Clerk's frontend SDK or API to get a session token
   - Or use Clerk Dashboard → Users → Get session token

8. **Test Products Access (First User)**
   ```
   GET /api/v1/products
   Authorization: Bearer {{clerkJwt}}
   → 200 (you have MANAGER access)
   ```

### Phase 4: Test Authorization

9. **Add Second User to Organization in Clerk**
   - New user gets NONE permissions by default

10. **Get Second User's JWT**

11. **Test Products Access (Second User)**
    ```
    GET /api/v1/products
    Authorization: Bearer {{clerkJwtSecondUser}}
    → 403 Forbidden (they have NONE authority)
    ```

12. **Test API Key Management (Second User)**
    ```
    GET /api/v1/api-keys
    Authorization: Bearer {{clerkJwtSecondUser}}
    → 403 Forbidden (not Org Admin)
    ```

### Phase 5: Test API Keys

13. **Create API Key with Design EDITOR access (First User - Org Admin)**
    ```
    POST /api/v1/api-keys
    Authorization: Bearer {{clerkJwt}}
    {
      "name": "Design Editor Key",
      "designAuthority": "EDITOR",
      "operationsAuthority": "NONE",
      "marketingAuthority": "NONE",
      "complianceAuthority": "NONE",
      "isOrgAdmin": false
    }
    → 201, save the rawKey!
    ```

14. **Test API Key Access to Design workspace (should work)**
    ```
    GET /api/v1/products
    X-API-Key: {{tenantApiKey}}
    → 200 (API key has EDITOR access to Design workspace)
    ```

15. **Test API Key Cross-Workspace Isolation**
    ```
    GET /api/v1/compliance/reports
    X-API-Key: {{tenantApiKey}}
    → 403 (API key has NONE on Compliance workspace)
    Response: {"yourAuthority": "NONE", "workspace": "compliance"}
    ```

16. **Test Non-Admin API Key Cannot Manage Keys**
    ```
    POST /api/v1/api-keys
    X-API-Key: {{tenantApiKey}}
    → 403 (isOrgAdmin: false)
    ```

17. **Create Admin API Key**
    ```
    POST /api/v1/api-keys
    Authorization: Bearer {{clerkJwt}}
    {
      "name": "Admin Key",
      "designAuthority": "MANAGER",
      "operationsAuthority": "MANAGER",
      "marketingAuthority": "MANAGER",
      "complianceAuthority": "MANAGER",
      "isOrgAdmin": true
    }
    → 201
    ```

18. **Verify Admin API Key CAN Manage Keys**
    ```
    GET /api/v1/api-keys
    X-API-Key: {{adminApiKey}}
    → 200 (isOrgAdmin: true allows key management)
    ```

### Phase 6: Test User Removal

19. **Remove Second User from Org in Clerk**

20. **Verify Soft Delete**
    ```sql
    SELECT id, email, deleted_at FROM tenant_org_xxx.users;
    ```
    Second user should have `deleted_at` set.

21. **Test Removed User Access**
    ```
    GET /api/v1/products
    Authorization: Bearer {{clerkJwtSecondUser}}
    → 403 Forbidden (no longer a member)
    ```

---

## 11. Simulating Webhooks Locally

For local testing without real Clerk webhooks, you can simulate them using either:
- **Postman Collection:** Import `eurocomply-webhooks.postman_collection.json` from this folder
- **curl commands:** Use the examples below

**Important:** Webhook simulation only works if `skipSignatureVerification: true` is set in test mode.

### Postman Collection

Import the collection file:
```
docs/testing/eurocomply-webhooks.postman_collection.json
```

**Collection Variables:**
| Variable | Default | Description |
|----------|---------|-------------|
| `baseUrl` | `http://localhost:3001` | API base URL |
| `clerkOrgId` | `org_test123` | Simulated Clerk org ID |
| `clerkUserId` | `user_test123` | First user's Clerk ID |
| `clerkUserId2` | `user_test456` | Second user's Clerk ID |

**Execution Order:**
1. `organization.created` - Provisions tenant schema
2. `organizationMembership.created (First User)` - Creates admin user
3. `organizationMembership.created (Second User)` - Creates regular user
4. `user.updated` - Sync profile changes
5. `organizationMembership.deleted` - Remove user

---

### curl Examples

#### 1. organization.created

Creates an organization record and provisions the tenant schema.

```bash
curl -X POST http://localhost:3001/webhooks/clerk \
  -H "Content-Type: application/json" \
  -H "svix-id: msg_$(date +%s)" \
  -H "svix-timestamp: $(date +%s)" \
  -H "svix-signature: v1,test" \
  -d '{
    "type": "organization.created",
    "data": {
      "id": "org_test123",
      "name": "Test Organization",
      "slug": "test-organization",
      "created_at": 1706097600
    }
  }'
```

**Response (200):**
```json
{
  "success": true,
  "organizationId": "org_xxx",
  "schemaName": "tenant_org_test123"
}
```

---

#### 2. organizationMembership.created (First User)

Adds the first user to an organization. Gets MANAGER + isOrgAdmin.

```bash
curl -X POST http://localhost:3001/webhooks/clerk \
  -H "Content-Type: application/json" \
  -H "svix-id: msg_$(date +%s)" \
  -H "svix-timestamp: $(date +%s)" \
  -H "svix-signature: v1,test" \
  -d '{
    "type": "organizationMembership.created",
    "data": {
      "id": "mem_first123",
      "organization": {"id": "org_test123"},
      "public_user_data": {
        "user_id": "user_test123",
        "identifier": "admin@example.com",
        "first_name": "Admin",
        "last_name": "User",
        "image_url": "https://example.com/avatar.png"
      },
      "role": "org:admin",
      "created_at": 1706097600
    }
  }'
```

**Response (200):**
```json
{
  "status": "created",
  "userId": "usr_xxx"
}
```

**First user permissions:**
```sql
SELECT ou.is_org_admin, ou.design_authority
FROM tenant_org_test123.organization_users ou
JOIN tenant_org_test123.users u ON u.id = ou.user_id;
-- is_org_admin: true, design_authority: MANAGER
```

---

#### 3. organizationMembership.created (Second User)

Adds a subsequent user. Gets NONE permissions by default.

```bash
curl -X POST http://localhost:3001/webhooks/clerk \
  -H "Content-Type: application/json" \
  -H "svix-id: msg_$(date +%s)" \
  -H "svix-timestamp: $(date +%s)" \
  -H "svix-signature: v1,test" \
  -d '{
    "type": "organizationMembership.created",
    "data": {
      "id": "mem_second456",
      "organization": {"id": "org_test123"},
      "public_user_data": {
        "user_id": "user_test456",
        "identifier": "member@example.com",
        "first_name": "Regular",
        "last_name": "Member",
        "image_url": null
      },
      "role": "org:member",
      "created_at": 1706097600
    }
  }'
```

**Response (200):**
```json
{
  "status": "created",
  "userId": "usr_xxx"
}
```

**Second user permissions:**
```sql
SELECT ou.is_org_admin, ou.design_authority
FROM tenant_org_test123.organization_users ou
JOIN tenant_org_test123.users u ON u.id = ou.user_id
WHERE u.clerk_id = 'user_test456';
-- is_org_admin: false, design_authority: NONE
```

This user will get **403 Forbidden** on protected routes until granted access.

---

#### 4. user.updated

Syncs user profile changes across all their organizations.

```bash
curl -X POST http://localhost:3001/webhooks/clerk \
  -H "Content-Type: application/json" \
  -H "svix-id: msg_$(date +%s)" \
  -H "svix-timestamp: $(date +%s)" \
  -H "svix-signature: v1,test" \
  -d '{
    "type": "user.updated",
    "data": {
      "id": "user_test123",
      "email_addresses": [
        {"email_address": "newemail@example.com", "id": "email_123"}
      ],
      "primary_email_address_id": "email_123",
      "first_name": "Updated",
      "last_name": "Name",
      "image_url": "https://example.com/new-avatar.png",
      "organization_memberships": [
        {"organization": {"id": "org_test123"}}
      ]
    }
  }'
```

**Response (200):**
```json
{
  "status": "queued",
  "count": 1
}
```

Creates outbox events for async processing. `count` = number of orgs the user belongs to.

---

#### 5. organizationMembership.deleted

Removes a user from an organization (soft delete for audit trail).

```bash
curl -X POST http://localhost:3001/webhooks/clerk \
  -H "Content-Type: application/json" \
  -H "svix-id: msg_$(date +%s)" \
  -H "svix-timestamp: $(date +%s)" \
  -H "svix-signature: v1,test" \
  -d '{
    "type": "organizationMembership.deleted",
    "data": {
      "id": "mem_deleted789",
      "organization": {"id": "org_test123"},
      "public_user_data": {
        "user_id": "user_test456",
        "identifier": "member@example.com",
        "first_name": "Regular",
        "last_name": "Member",
        "image_url": null
      },
      "role": "org:member",
      "created_at": 1706097600
    }
  }'
```

**Response (200):**
```json
{
  "status": "soft_deleted"
}
```

**Verify soft delete:**
```sql
SELECT id, email, deleted_at
FROM tenant_org_test123.users
WHERE clerk_id = 'user_test456';
-- deleted_at should be set
```

**Possible responses:**
| Response | Meaning |
|----------|---------|
| `{"status": "soft_deleted"}` | User was removed |
| `{"status": "user_not_found"}` | User doesn't exist or already deleted |
| `{"status": "org_not_found"}` | Organization doesn't exist |

---

#### 6. organization.deleted

Drops the tenant schema and deletes the organization record.

```bash
curl -X POST http://localhost:3001/webhooks/clerk \
  -H "Content-Type: application/json" \
  -H "svix-id: msg_$(date +%s)" \
  -H "svix-timestamp: $(date +%s)" \
  -H "svix-signature: v1,test" \
  -d '{
    "type": "organization.deleted",
    "data": {
      "id": "org_test123",
      "name": "Test Organization",
      "slug": "test-organization",
      "created_at": 1706097600
    }
  }'
```

**Response (200):**
```json
{
  "success": true,
  "organizationId": "org_xxx",
  "schemaName": "tenant_org_test123"
}
```

**Verify deletion:**
```sql
-- Schema should be gone
SELECT schema_name FROM information_schema.schemata
WHERE schema_name = 'tenant_org_test123';
-- Should return empty

-- Organization should be gone
SELECT * FROM public.organizations WHERE clerk_org_id = 'org_test123';
-- Should return empty
```

---

### Webhook Error Responses

| Status | Response | Meaning |
|--------|----------|---------|
| 200 | `{"success": true, ...}` | Webhook processed |
| 200 | `{"status": "created", ...}` | Resource created |
| 200 | `{"status": "already_exists", ...}` | Idempotent duplicate |
| 500 | `{"error": "MikroORM not configured..."}` | Server misconfiguration |
| 503 | `{"error": "Organization not yet provisioned"}` | Retry later (Clerk will auto-retry) |

---

## 12. Troubleshooting

### User gets 202 "Provisioning" on every request

**Cause:** User exists in Clerk JWT but the `organizationMembership.created` webhook hasn't fired/processed yet.

**Solutions:**
1. Check Clerk webhook logs for errors
2. Verify webhook endpoint is accessible
3. Manually check if user exists in database:
   ```sql
   SELECT * FROM tenant_org_xxx.users WHERE clerk_id = 'user_xxx';
   ```

### User gets 403 but should have access

**Cause:** User's workspace authority is NONE.

**Check authority:**
```sql
SELECT ou.*, u.email
FROM tenant_org_xxx.organization_users ou
JOIN tenant_org_xxx.users u ON u.id = ou.user_id
WHERE u.clerk_id = 'user_xxx';
```

**Solution:** Have an Org Admin update their permissions (API endpoint TBD).

### Webhook returns 503 "Organization not yet provisioned"

**Cause:** Membership webhook arrived before organization webhook finished.

**Solution:** Clerk will automatically retry. Check that organization provisioning completed:
```sql
SELECT id, schema_name, provisioning_status FROM public.organizations;
```

### API Key rejected with 401

**Check:**
1. Is key expired? Check `expires_at` in database
2. Is key revoked? Check `revoked_at` in database
3. Is the X-API-Key header correct format?

### API Key gets 403 on workspace route

**Cause:** The API key doesn't have sufficient authority for the requested workspace.

**Check authority:**
```sql
SELECT
  name,
  design_authority,
  operations_authority,
  marketing_authority,
  compliance_authority,
  is_org_admin
FROM public.api_keys
WHERE key_prefix = 'ek_live_xxx';
```

**The 403 response tells you exactly what's wrong:**
```json
{
  "error": "Forbidden",
  "message": "This action requires VIEWER access to the design workspace",
  "workspace": "design",
  "action": "view",
  "yourAuthority": "NONE",
  "requiredAuthority": "VIEWER"
}
```

**Solution:** Create a new API key with the appropriate workspace authorities, or use an existing key that has sufficient access.

### API Key can't manage other API keys

**Cause:** The API key has `isOrgAdmin: false`.

**Check:**
```sql
SELECT name, is_org_admin FROM public.api_keys WHERE key_prefix = 'ek_live_xxx';
```

**Solution:** Only API keys with `isOrgAdmin: true` can manage other API keys. Create a new key with org admin privileges, or use a JWT from an org admin user.

---

*Last Updated: 2026-01-25*
