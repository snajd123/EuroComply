# Postman API Tests

## Available Collections

| Collection | Purpose | Authentication |
|------------|---------|----------------|
| `eurocomply-complete.postman_collection.json` | Complete test suite | Various (see below) |
| `admin-api.postman_collection.json` | Platform admin endpoints only | `X-Admin-Key` header |
| `tenant-api.postman_collection.json` | Tenant-scoped endpoints only | JWT Bearer or `X-API-Key` |
| `public-api.postman_collection.json` | Public taxonomy endpoints | None required |

## Quick Start

**Import the collection:**

```
eurocomply-complete.postman_collection.json
```

### Required Variables

Set these in the **Variables** tab after importing:

| Variable | Value | Required |
|----------|-------|----------|
| `webhookSecret` | `whsec_Wx4vOyadXO+o3wbuEGcm4wLlsKGfkbmO` | Yes |
| `adminApiKey` | `6fRoO4fpVQkVMsO39_9wvaZzPz1lF4ZSxCH3YPA3v_Q` | Optional |

### Run Order

1. Import `eurocomply-complete.postman_collection.json` into Postman
2. Go to **Variables** tab and set `webhookSecret` (and optionally `adminApiKey`)
3. Run folders in order: Setup → Public API → Admin API → API Keys → Products → Cleanup

All other variables are auto-generated and shared between requests.

---

## Collection Structure

### 1. Setup (Webhooks)

Creates organization and users via Clerk webhook simulation.

| Request | Description |
|---------|-------------|
| 1.1 Create Organization | Creates org + provisions tenant schema |
| 1.2 Create First User | Adds first user (MANAGER + isOrgAdmin) |
| 1.3 Create Second User | Adds second user (NONE permissions) |

### 2. Public API (No Auth)

Endpoints accessible without authentication.

| Request | Description |
|---------|-------------|
| 2.1 Health Check | `/health` |
| 2.2 API Version | `/api/v1` |
| 2.3 List Units | `/api/v1/taxonomy/units` |
| 2.4 Get Unit (KGM) | `/api/v1/taxonomy/units/KGM` |
| 2.5 Convert Units | `/api/v1/taxonomy/units/convert` |

### 3. Admin API (X-Admin-Key)

Organization management endpoints. Requires `adminApiKey`.

| Request | Description |
|---------|-------------|
| 3.1 List Organizations | List all orgs |
| 3.2 Get Organization | Get org by ID |
| 3.3 Get Org Status | Check provisioning status |
| 3.4 Admin - No Auth | Verify 401 without key |

### 4. API Keys (JWT Auth)

Create and manage API keys with different authority levels.

| Request | Description |
|---------|-------------|
| 4.1 Create EDITOR API Key | Design workspace editor |
| 4.2 Create VIEWER API Key | Design workspace viewer |
| 4.3 Create Org Admin API Key | Full admin access |
| 4.4 List API Keys | List all keys (requires Org Admin) |
| 4.5 Non-Admin Cannot List | Verify 403 for non-admin |

### 5. Products (API Key Auth)

Test workspace authorization with products.

| Request | Description |
|---------|-------------|
| 5.1 Create Category | EDITOR creates category |
| 5.2 EDITOR Creates Product | 201 success |
| 5.3 VIEWER Lists Products | 200 success (read allowed) |
| 5.4 VIEWER Cannot Create | 403 forbidden |
| 5.5 No Auth | 401 unauthorized |
| 5.6 Get Product | Get by ID |
| 5.7 Product Not Found | 404 error |

### 6. Cleanup

Delete test data. Run last.

| Request | Description |
|---------|-------------|
| 6.1 Delete Product | Remove test product |
| 6.2 Delete Category | Remove test category |
| 6.3 Delete Member | Remove second user via webhook |
| 6.4 Delete Organization | Remove org and schema (requires adminApiKey) |

---

## Variable Flow

Variables are automatically passed between requests:

```
1.1 Create Organization  → sets clerkOrgId, orgId, schemaName
1.2 Create First User    → sets clerkUserId, membershipId
1.3 Create Second User   → sets clerkUserId2
4.1-4.3 API Keys         → sets editorApiKey, viewerApiKey, orgAdminApiKey
5.1 Create Category      → sets categoryId
5.2 Create Product       → sets productId
```

---

## Running with Newman (CLI)

```bash
# Install newman
npm install -g newman

# Run complete collection
newman run docs/testing/postman/eurocomply-complete.postman_collection.json \
  --env-var "webhookSecret=whsec_Wx4vOyadXO+o3wbuEGcm4wLlsKGfkbmO" \
  --env-var "adminApiKey=6fRoO4fpVQkVMsO39_9wvaZzPz1lF4ZSxCH3YPA3v_Q"

# Run specific folder
newman run docs/testing/postman/eurocomply-complete.postman_collection.json \
  --folder "2. Public API (No Auth)"
```

---

## Test Coverage

| Category | Endpoints | Folder |
|----------|-----------|--------|
| Health | `/health` | 2 |
| Version | `/api/v1` | 2 |
| Units | `/api/v1/taxonomy/units/*` | 2 |
| Webhooks | `/webhooks/clerk` | 1, 6 |
| API Keys | `/api/v1/api-keys/*` | 4 |
| Admin | `/api/v1/admin/*` | 3 |
| Products | `/api/v1/products/*` | 5 |
| Categories | `/api/v1/categories/*` | 5 |
