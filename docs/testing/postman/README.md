# Postman API Tests

## Available Collections

| Collection | Purpose | Authentication |
|------------|---------|----------------|
| `tenant-api.postman_collection.json` | Tenant-scoped endpoints (main collection) | JWT Bearer or `X-API-Key` |
| `admin-api.postman_collection.json` | Platform admin endpoints only | `X-Admin-Key` header |
| `public-api.postman_collection.json` | Public taxonomy endpoints | None required |
| `webhooks.postman_collection.json` | Clerk webhook simulation | HMAC signature |

## Quick Start

**Import the main collection:**

```
tenant-api.postman_collection.json
```

### Required Variables

Set these in the **Variables** tab after importing:

| Variable | Value | Required |
|----------|-------|----------|
| `webhookSecret` | `whsec_Wx4vOyadXO+o3wbuEGcm4wLlsKGfkbmO` | Yes |
| `adminApiKey` | `6fRoO4fpVQkVMsO39_9wvaZzPz1lF4ZSxCH3YPA3v_Q` | Optional |

### Prerequisites: Seed the Database

Before testing compliance features, seed the database:

```bash
cd packages/database
pnpm build
pnpm seed:all    # Seeds categories + regulations
```

### Run Order

1. Import `tenant-api.postman_collection.json` into Postman
2. Go to **Variables** tab and set `webhookSecret`
3. Run folders in order:
   - **0. Setup** → Creates org + user
   - **1. JWT Auth → API Key Management** → Creates API keys
   - **1. JWT Auth → Category Adoption** → Adopts system category
   - **1. JWT Auth → Compliance** → Tests compliance stack, exemptions, evidence

---

## Collection Structure

### 0. Setup (Webhooks)

Creates organization and users via Clerk webhook simulation.

| Request | Description |
|---------|-------------|
| 0.1 Create Organization | Creates org + provisions tenant schema |
| 0.2 Create User (Org Admin) | Adds first user with org admin rights |

### 1. JWT Auth (Human/UI)

#### API Key Management

| Request | Description |
|---------|-------------|
| Create Org Admin API Key | Full admin access key |
| Create Editor API Key | Design workspace editor |
| Create Viewer API Key | Design workspace viewer |
| List API Keys | List all keys (requires Org Admin) |

#### Category Adoption

| Request | Description | Variables Set |
|---------|-------------|---------------|
| List Available System Categories | Shows adoptable categories | `adoptedCategoryId` |
| Adopt a System Category | Links tenant to system category | `tenantCategoryId` |
| Change Mode to FROZEN | Lock to current version | — |
| Sync (Dry Run) | Preview sync without applying | — |
| Change Mode to LIVE | Resume auto-updates | — |
| Remove Category Adoption | Unlink from system category | — |

#### Compliance

| Request | Description | Variables Set |
|---------|-------------|---------------|
| Get Compliance Stack | Returns effective regulations | `requirementId` |
| Create Exemption | Exempt a requirement | `exemptionId` |
| List Exemptions | List all exemptions | — |
| Get Exemption | Get exemption details | — |
| Revoke Exemption | Revoke with reason | — |
| Record Evidence | Record evaluation result | — |
| Get Evidence for Product | List evidence records | — |

### 2. API Key Auth (Machine)

Permission tests using `X-API-Key` header.

---

## Variable Flow

Variables are automatically captured and passed between requests:

```
0.1 Create Organization       → clerkOrgId, orgId, schemaName
0.2 Create User               → clerkUserId, jwtToken

API Keys                      → editorApiKey, viewerApiKey, orgAdminApiKey

List Available Categories     → adoptedCategoryId (first available)
Adopt a System Category       → tenantCategoryId

Get Compliance Stack          → requirementId (first requirement)
Create Exemption              → exemptionId
```

---

## Compliance Testing Flow

### Full Compliance Test Sequence

1. **Setup** (0. Setup folder)
   - Create Organization
   - Create User

2. **Category Adoption** (1. JWT Auth → Category Adoption)
   - List Available System Categories
   - Adopt a System Category
   - (Optional) Test FROZEN/LIVE mode transitions

3. **Compliance Stack** (1. JWT Auth → Compliance)
   - Get Compliance Stack (captures `requirementId`)
   - Create Exemption (using captured `requirementId`)
   - Get Compliance Stack again (verify exemption shows)
   - Revoke Exemption
   - Get Compliance Stack again (verify exemption removed)

4. **Evidence** (requires `productVersionId`)
   - Set `productVersionId` manually OR create a product first
   - Record Evidence
   - Get Evidence for Product

### Manual Variable Setup

For evidence tests, you need a `productVersionId`. Either:

1. Create a product via Dashboard Operations → Create Product
2. Manually set `productVersionId` in Variables tab

---

## Test Coverage

| Category | Endpoints | Folder |
|----------|-----------|--------|
| Health | `/health` | — |
| Webhooks | `/webhooks/clerk` | 0 |
| API Keys | `/api/v1/api-keys/*` | 1 |
| Categories | `/api/v1/categories/*` | 1 |
| Products | `/api/v1/products/*` | 1, 2 |
| Category Adoption | `/api/v1/category-adoption/*` | 1 |
| Compliance Stack | `/api/v1/compliance-stack/*` | 1 |
| Exemptions | `/api/v1/exemptions/*` | 1 |
| Evidence | `/api/v1/evidence/*` | 1 |

---

## Running with Newman (CLI)

```bash
# Install newman
npm install -g newman

# Run tenant-api collection
newman run docs/testing/postman/tenant-api.postman_collection.json \
  --env-var "webhookSecret=whsec_Wx4vOyadXO+o3wbuEGcm4wLlsKGfkbmO" \
  --env-var "baseUrl=http://localhost:3000"

# Run specific folder
newman run docs/testing/postman/tenant-api.postman_collection.json \
  --folder "1. JWT Auth (Human/UI)"
```

---

## Related Documentation

- [Compliance Testing Guide](../../guides/compliance-testing-guide.md) - Detailed compliance system walkthrough
- [Compliance Architecture](../../compliance-architecture.md) - System design documentation
