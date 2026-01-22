# Testing Guide

## Scripts

| Command | Purpose |
|---------|---------|
| `pnpm test` | Run automated tests |
| `pnpm test:webhook` | Test real Clerk webhook (creates org, verifies DB) |
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

# Terminal 2: ngrok (for Clerk webhooks)
ngrok http 3001

# Terminal 3: Server
cd apps/api && pnpm dev
```

### 2. Configure Clerk webhook

- Go to Clerk Dashboard → Webhooks
- Set endpoint URL to your ngrok URL + `/webhooks/clerk`
- Enable `organization.created` event
- Copy signing secret to `.env` as `CLERK_WEBHOOK_SECRET`

### 3. Test

**Option A:** Run automated webhook test
```bash
pnpm test:webhook
```

**Option B:** Manual - create organization in Clerk Dashboard

### 4. Verify

```bash
# Check database
pnpm db:schema
```

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
