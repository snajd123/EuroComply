# Testing Guide

## Scripts

| Command | Purpose |
|---------|---------|
| `pnpm test` | Run automated tests |
| `pnpm test:webhook` | Test real ZITADEL webhook (creates org, verifies DB) |
| `pnpm db:start` | Start database |
| `pnpm db:reset` | Reset database |
| `pnpm db:schema` | Show database structure |
| `pnpm db:cleanup` | Clean test data |

---

## Manual Testing

### 1. Start everything

```bash
# Terminal 1: Database
pnpm db:start

# Terminal 2: ngrok (for ZITADEL webhooks)
ngrok http 3001

# Terminal 3: Server
cd apps/api && pnpm dev
```

### 2. Configure ZITADEL Actions v2 webhook

- Go to ZITADEL Console → Actions → Webhooks
- Set endpoint URL to your ngrok URL + `/webhooks/zitadel`
- Enable `org.created` event
- Copy signing key to `.env` as `ZITADEL_WEBHOOK_SIGNING_KEY`

### 3. Test

**Option A:** Run automated webhook test
```bash
pnpm test:webhook
```

**Option B:** Manual - create organization in ZITADEL Console

### 4. Verify

```bash
# Check database
pnpm db:schema
```

---

## Postman Testing

### Setup

1. Start the server: `cd apps/api && pnpm dev`
2. Import or create a new collection in Postman

### Base URL

```
http://localhost:3001
```

### Available Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/webhooks/zitadel` | ZITADEL webhook (requires signature) |
| GET | `/api/v1/admin/organizations/:id/status` | Get org status by ID or ZITADEL ID |
| GET | `/api/v1/organizations` | List organizations |
| POST | `/api/v1/organizations` | Create organization |

### Example Requests

**Health Check:**
```
GET http://localhost:3001/health
```

**Get Organization Status:**
```
GET http://localhost:3001/api/v1/admin/organizations/org_xxxxx/status
```

**List Organizations:**
```
GET http://localhost:3001/api/v1/organizations
```

### Notes

- Webhook endpoint requires valid ZITADEL signature header
- Use `pnpm test:webhook` instead of manually testing webhooks
- Tenant-scoped endpoints (like `/api/v1/products`) require authentication

---

## Database Schema

```
public (shared):
├── organizations
└── outbox_event

tenant_org_xxx (per tenant):
├── category
├── product
├── product_version
├── attribute_template
├── unit_definition
└── audit_log
```
