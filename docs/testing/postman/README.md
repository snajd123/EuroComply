# Postman Webhook & API Tests

## Quick Start (Recommended)

**Import the complete collection for a seamless experience:**

```
eurocomply-complete.postman_collection.json
```

### Required Variables

Set these in the **Variables** tab after importing:

| Variable | Value | Required |
|----------|-------|----------|
| `webhookSecret` | `whsec_Wx4vOyadXO+o3wbuEGcm4wLlsKGfkbmO` | Yes - for webhook tests |
| `adminApiKey` | `6fRoO4fpVQkVMsO39_9wvaZzPz1lF4ZSxCH3YPA3v_Q` | Optional - for admin tests |

### Run Order

1. Import `eurocomply-complete.postman_collection.json` into Postman
2. Go to **Variables** tab and set `webhookSecret` (and optionally `adminApiKey`)
3. Run folders in order: Setup → Public API → Admin API → API Keys → Products → Cleanup

All other variables are auto-generated and shared between requests.

---

## Individual Collections

For targeted testing, individual collections are also available.

### Setup

1. Import any file into Postman
2. Set `webhookSecret` in collection variables (your `CLERK_WEBHOOK_SECRET`)
3. For admin tests, set `adminApiKey` (your `ADMIN_API_KEY`)
4. Run requests in order

## Files

### Webhook Tests (1-6)

| File | Description |
|------|-------------|
| `1-organization-created.json` | Creates org + provisions tenant schema |
| `2-membership-created-first-user.json` | Adds first user (MANAGER + isOrgAdmin) |
| `3-membership-created-second-user.json` | Adds second user (NONE permissions) |
| `4-user-updated.json` | Updates user profile |
| `5-membership-deleted.json` | Removes second user (soft delete) |
| `6-organization-deleted.json` | Deletes org + drops schema |

### API Key Tests (7)

| File | Description |
|------|-------------|
| `7-api-key-workspace-authorization.json` | Tests API key workspace scoping |

**Prerequisite:** Run `1-organization-created` and `2-membership-created-first-user` first to set up the tenant.

### Public API Tests (8)

| File | Description |
|------|-------------|
| `8-public-api.json` | Health check, API version, taxonomy/units (no auth required) |

Tests endpoints that are publicly accessible without authentication:
- Health check (`/health`)
- API version (`/api/v1`)
- Unit listing and conversion (`/api/v1/taxonomy/units`)

### Admin API Tests (9)

| File | Description |
|------|-------------|
| `9-admin-api.json` | Organization management with X-Admin-Key |

**Prerequisite:** Set `adminApiKey` variable to your `ADMIN_API_KEY` from environment.

Tests admin-only endpoints:
- List organizations
- Get organization by ID or Clerk ID
- Get organization provisioning status
- Re-provision organization
- Delete organization and schema

### Products CRUD Tests (10)

| File | Description |
|------|-------------|
| `10-products-crud.json` | Product CRUD with workspace authorization |

**Prerequisite:** Run webhooks 1-2 to create org/user, then set `categoryId` for product creation.

Tests product endpoints with different authority levels:
- EDITOR can create/read/update/delete
- VIEWER can only read
- No auth returns 401

### E2E Integration Flow (11)

| File | Description |
|------|-------------|
| `11-e2e-integration-flow.json` | Complete end-to-end test flow |

Self-contained test that runs the entire flow:
1. **Phase 1:** Create organization and member via webhooks
2. **Phase 2:** Create API key and verify authentication
3. **Phase 3:** Create category and product
4. **Phase 4:** Verify tenant isolation and auth errors
5. **Phase 5:** Cleanup (delete product, category, API key, org)

**No prerequisites** - generates unique IDs for each run.

## Variable Passing

Each file stores variables that subsequent files need:

```
1-organization-created → sets clerkOrgId, schemaName
2-membership-first    → needs clerkOrgId, sets clerkUserId
3-membership-second   → needs clerkOrgId, sets clerkUserId2
4-user-updated        → needs clerkOrgId, clerkUserId
5-membership-deleted  → needs clerkOrgId, clerkUserId2
6-organization-deleted→ needs clerkOrgId
7-api-key-auth        → needs schemaName, clerkUserId
10-products-crud      → needs schemaName, clerkUserId, categoryId
```

**Important:** If you import files separately, you must manually copy variable values between collections, or import all files you need together.

## Quick Test Flows

### Basic Webhook Test
1. Import files 1-2
2. Set `webhookSecret`
3. Run in sequence

### Full API Test
1. Import files 1-2, then 7-10
2. Set `webhookSecret`
3. Run webhooks first
4. Copy `schemaName`, `clerkUserId` to API test collections
5. Run API tests

### Standalone E2E Test
1. Import file 11 only
2. Set `adminApiKey` (optional, for cleanup)
3. Run entire collection - fully self-contained

## Running with Newman (CLI)

```bash
# Install newman
npm install -g newman

# Run public API tests (no setup needed)
newman run docs/testing/postman/8-public-api.json

# Run E2E flow
newman run docs/testing/postman/11-e2e-integration-flow.json

# Run with environment variables
newman run docs/testing/postman/9-admin-api.json \
  --env-var "adminApiKey=your-admin-key"
```

## Test Coverage

| Category | Endpoints | Collection |
|----------|-----------|------------|
| Health | `/health` | 8 |
| Version | `/api/v1` | 8 |
| Units | `/api/v1/taxonomy/units/*` | 8 |
| Webhooks | `/webhooks/clerk` | 1-6 |
| API Keys | `/api/v1/api-keys/*` | 7 |
| Admin | `/api/v1/admin/*` | 9 |
| Products | `/api/v1/products/*` | 10 |
| Categories | `/api/v1/categories/*` | 10, 11 |
| E2E | All of the above | 11 |
