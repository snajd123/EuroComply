# Testing Guide

## Quick Start

```bash
# 1. Start database
pnpm db:start

# 2. Run migrations and seed reference data
pnpm db:setup

# 3. Start API server
pnpm dev:local
```

---

## Scripts

| Command | Purpose |
|---------|---------|
| `pnpm db:start` | Start PostgreSQL database (port 5432) |
| `pnpm db:setup` | Run migrations and seed reference data |
| `pnpm db:reset` | Reset database (drops all data) |
| `pnpm db:schema` | Show database structure |
| `pnpm dev:local` | Start API + Worker with hot-reload |
| `pnpm dev` | Start API + Worker via turbo |
| `pnpm test` | Run automated tests |
| `pnpm worker:once` | Run worker once (for testing/debugging) |

---

## Database Architecture

### Understanding the Setup

EuroComply uses a **single PostgreSQL container** with **two databases**:

```
┌─────────────────────────────────────────────────────────┐
│                 PostgreSQL (port 5432)                  │
├──────────────────────────┬──────────────────────────────┤
│   eurocomply             │   eurocomply_test            │
│   (development)          │   (automated tests)          │
├──────────────────────────┼──────────────────────────────┤
│  • Used by dev server    │  • Used by `npm test`        │
│  • Used by Postman       │  • Auto-created on startup   │
│  • Persistent data       │  • Wiped between test runs   │
│  • Run `pnpm db:setup`   │  • Tests handle own setup    │
└──────────────────────────┴──────────────────────────────┘
```

**Why two databases?**
- **Isolation**: Tests can freely create/drop data without affecting your development work
- **Speed**: Tests don't need to preserve data between runs
- **Safety**: No risk of accidentally testing against your dev data or vice versa

### How It Works

1. **Docker starts PostgreSQL** on port 5432 with database `eurocomply`
2. **init-db.sql runs automatically** on first container start, creating `eurocomply_test`
3. **Your `.env` file** points to `eurocomply` (for dev server, Postman)
4. **vitest.config.ts files** override to use `eurocomply_test` (for automated tests)

```
                     ┌─────────────────┐
                     │   .env file     │
                     │ DATABASE_NAME=  │
                     │   eurocomply    │
                     └────────┬────────┘
                              │
         ┌────────────────────┴────────────────────┐
         ▼                                         ▼
┌─────────────────┐                    ┌────────────────────┐
│  pnpm dev:local │                    │     npm test       │
│    (API server) │                    │    (vitest)        │
├─────────────────┤                    ├────────────────────┤
│ Uses: eurocomply│                    │ vitest.config.ts   │
│                 │                    │ overrides to:      │
│                 │                    │ eurocomply_test    │
└─────────────────┘                    └────────────────────┘
```

### Prerequisites

1. Docker running
2. `.env` file configured (copy from `.env.example`)

### Initial Setup

```bash
# Start PostgreSQL container (creates both databases)
pnpm db:start

# Run migrations and seed reference data (on eurocomply)
pnpm db:setup
```

The `db:setup` command:
1. Runs all pending migrations (creates tables)
2. Seeds reference data (substances, units, etc.)

**Note:** You only need to run `db:setup` for the development database. The test database schema is created automatically by the test setup helpers.

### Environment Variables

Your `.env` file should have:

```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=eurocomply      # Development database
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
```

**Important:** Always use `DATABASE_NAME=eurocomply` (not `eurocomply_test`). The test configuration handles test database selection automatically.

### Reset Database

```bash
# Stop and remove database container
pnpm db:reset

# Restart and setup
pnpm db:start
pnpm db:setup
```

### Common Pitfall: Multiple Database Ports

**Never run a second postgres container on a different port.** This project is designed for a single postgres instance on port 5432.

If you find yourself with databases on multiple ports (e.g., 5432 and 5433), you've likely:
- Started a separate test database container manually
- Have leftover containers from old configurations

**Solution:**
```bash
# Stop all postgres containers
docker stop eurocomply-postgres
docker ps -a | grep postgres | awk '{print $1}' | xargs docker rm

# Start fresh with the correct single-container setup
pnpm db:start
pnpm db:setup
```

---

## Architecture Overview

```
┌─────────────┐     webhook      ┌─────────────┐
│    Clerk    │ ───────────────► │     API     │
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

### 1. Start Everything (Recommended)

```bash
# Terminal 1: Start database and API with hot-reload
pnpm db:start
pnpm db:setup
pnpm dev:local
```

### 2. For Webhook Testing (ngrok)

```bash
# Terminal 1: Database + API
pnpm db:start && pnpm db:setup
pnpm dev:local --with-tunnel
```

This starts ngrok and displays the public URL for webhook configuration.

### 3. Start Frontend (Admin UI)

```bash
# Terminal 2: Frontend
cd apps/web && pnpm dev
```

Frontend runs on `http://localhost:3001` (or next available port).

**Environment:** Create `apps/web/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_ADMIN_KEY=<your-admin-api-key>
```

The `NEXT_PUBLIC_ADMIN_KEY` must match `ADMIN_API_KEY` in `apps/api/.env`.

### 4. Full Stack Testing

```bash
# Terminal 1: Database + API
pnpm db:start && pnpm db:setup
pnpm dev:local

# Terminal 2: Frontend
cd apps/web && pnpm dev
```

Then open:
- **API**: http://localhost:3000
- **Frontend**: http://localhost:3001
- **Admin Ingestor**: http://localhost:3001/admin/ingestor

### 3. Configure Clerk Webhook

- Go to Clerk Dashboard → Webhooks
- Set endpoint URL to your ngrok URL + `/webhooks/clerk`
- Enable `organization.created` event
- Copy signing secret to `.env` as `CLERK_WEBHOOK_SECRET`

---

## Postman Testing

### Collections

Two Postman collections are available in `docs/testing/postman/`:

1. **eurocomply-api.postman_collection.json** - Main API (requires auth)
2. **eurocomply-taxonomy.postman_collection.json** - Taxonomy API (public, no auth)

### Setup

1. Start the server: `pnpm dev:local`
2. Import collections into Postman
3. Set environment variable: `baseUrl = http://localhost:3001`

### Taxonomy API (Public)

No authentication required:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/taxonomy/substances` | List all substances |
| GET | `/api/v1/taxonomy/substances?svhc=true` | Filter by SVHC |
| GET | `/api/v1/taxonomy/substances?restricted=true` | Filter by restricted |
| GET | `/api/v1/taxonomy/substances?search=lead` | Search by name |
| GET | `/api/v1/taxonomy/substances/regulated` | Get all regulated substances |
| GET | `/api/v1/taxonomy/substances/:casNumber` | Get substance by CAS number |
| GET | `/api/v1/taxonomy/substances/:casNumber/aliases` | Get substance aliases |
| GET | `/api/v1/taxonomy/units` | List all units |
| GET | `/api/v1/taxonomy/units/:code` | Get unit by code |
| GET | `/api/v1/taxonomy/units/convert?from=KGM&to=LBR&value=10` | Convert units |

### Protected API

Requires JWT or API key authentication:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/v1/admin/organizations/:id/status` | Get org status |
| GET | `/api/v1/products` | List products (tenant-scoped) |
| POST | `/api/v1/api-keys` | Create API key |

---

## Database Schema

```
public (shared):
├── organizations        ← tenant registry
├── api_keys            ← API keys for tenants
├── webhook_events      ← webhook audit log
├── unit_definition     ← UNECE unit codes
├── substance           ← ECHA regulated substances
├── substance_alias     ← substance alternative names
├── outbox_event        ← system events
└── mikro_orm_migrations

tenant_org_xxx (per tenant):
├── users               ← tenant users
├── organization_users  ← user permissions
├── category            ← product categories
├── category_adoption   ← category usage tracking
├── product             ← products
├── product_version     ← product versions
├── attribute_template  ← category attributes
├── audit_log           ← audit trail
└── outbox_event        ← tenant events
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

---

## Troubleshooting

### Database Issues

**Tables missing after db:setup:**
```bash
# Reset and recreate
pnpm db:reset
pnpm db:start
pnpm db:setup
```

**Connection refused:**
- Check Docker is running: `docker ps`
- Check port 5432 is available: `lsof -i :5432`
- Verify .env DATABASE_PORT matches your setup

### Migration Issues

**"relation already exists" error:**
```bash
# Database has tables but no migration tracking
# Reset the database:
pnpm db:reset
pnpm db:start
pnpm db:setup
```

**"No pending migrations" but tables missing:**
- Ensure you're running from the project root directory
- Run `pnpm build` to compile latest migrations
