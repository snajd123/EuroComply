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
| `pnpm dev` | Start API + Worker (recommended) |
| `pnpm worker` | Start only worker (continuous) |
| `pnpm worker:once` | Run worker once (for testing/debugging) |

---

## Architecture Overview

```
┌─────────────┐     webhook      ┌─────────────┐
│   ZITADEL   │ ───────────────► │     API     │
└─────────────┘                  └──────┬──────┘
                                        │
                                        │ writes to
                                        ▼
                                 ┌─────────────┐
                                 │   Outbox    │
                                 │   (events)  │
                                 └──────┬──────┘
                                        │
                                        │ polls
                                        ▼
                                 ┌─────────────┐
                                 │   Worker    │
                                 └─────────────┘
```

- **API**: Handles HTTP requests, writes events to the outbox
- **Worker**: Polls the outbox and processes events asynchronously
- **Outbox**: Ensures events are processed reliably (transactional outbox pattern)

---

## Manual Testing

### 1. Start everything (Recommended)

```bash
# Terminal 1: Database
pnpm db:start

# Terminal 2: API + Worker (starts both via turbo)
pnpm dev
```

This starts both the API server and the outbox worker. The worker processes:
- Organization provisioned events (public schema)
- Tenant-specific events (per-tenant schemas)

### 1b. Alternative: Start components separately

```bash
# Terminal 1: Database
pnpm db:start

# Terminal 2: API only
cd apps/api && pnpm dev

# Terminal 3: Worker only (if needed separately)
pnpm worker
```

### 2. For webhook testing (ngrok)

```bash
# Terminal 1: Database
pnpm db:start

# Terminal 2: ngrok (for ZITADEL webhooks)
ngrok http 3001

# Terminal 3: API + Worker
pnpm dev
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
└── outbox_event      ← system events (org.provisioned, org.deleted)

tenant_org_xxx (per tenant):
├── category
├── product
├── product_version
├── attribute_template
├── unit_definition
├── audit_log
└── outbox_event      ← tenant events (future: product.created, etc.)
```

---

## Worker Details

### What the worker processes

| Event Type | Schema | Handler |
|------------|--------|---------|
| `organization.provisioned` | public | Logs event (placeholder for welcome emails, etc.) |
| (future events) | tenant | To be implemented |

### Environment variables

```env
WORKER_BATCH_SIZE=10       # Events per batch (default: 10)
WORKER_POLL_INTERVAL=5000  # Milliseconds between polls (default: 5000)
WORKER_MAX_RETRIES=5       # Retry attempts before marking FAILED (default: 5)
```

### Running once (for testing)

```bash
# Process all pending events once and exit
pnpm worker:once
```

This is useful for:
- Testing event handlers
- Debugging specific events
- Running as a cron job instead of continuous polling

### Checking outbox status

```sql
-- View pending events
SELECT * FROM outbox_event WHERE status = 'PENDING';

-- View failed events
SELECT * FROM outbox_event WHERE status = 'FAILED';

-- Check retry counts
SELECT event_type, status, retry_count, error_message
FROM outbox_event
ORDER BY created_at DESC
LIMIT 10;
```
