# @eurocomply/db

Database client and Prisma schema for EuroComply.

## Installation

```bash
# Internal monorepo package
pnpm add @eurocomply/db
```

## Usage

### Initialize Database

Call at application startup:

```typescript
import { initializeDatabase } from '@eurocomply/db';

await initializeDatabase();
```

### Using the Prisma Client

```typescript
import { prisma } from '@eurocomply/db';

const products = await prisma.product.findMany({
  where: { organizationId },
});
```

### Prisma Types

All Prisma generated types are re-exported:

```typescript
import {
  type Product,
  type Organization,
  type User,
  Prisma,
} from '@eurocomply/db';
```

### Tenant Context

```typescript
import { createTenantContext, type TenantContext } from '@eurocomply/db';

const tenant = await createTenantContext(userId, organizationId);
```

### Database Events

```typescript
import { emitDatabaseEvent, type DatabaseEvent } from '@eurocomply/db';

await emitDatabaseEvent('PRODUCT_CREATED', { productId });
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | Full PostgreSQL connection string | No* |
| `DB_HOST` | Database host | Yes* |
| `DB_PORT` | Database port (default: 5432) | No |
| `DB_NAME` | Database name (default: eurocomply) | No |
| `DB_USER` | Database user | Yes* |
| `DB_PASSWORD` | Database password | Yes* |
| `DB_SSL` | Enable SSL (`true`/`false`) | No |

*Either `DATABASE_URL` or `DB_HOST`/`DB_USER`/`DB_PASSWORD` must be provided.

## Development

```bash
pnpm build        # Build TypeScript
pnpm db:generate  # Generate Prisma client
pnpm db:migrate   # Run migrations
pnpm db:push      # Push schema changes
```

## Schema Location

The Prisma schema is at `prisma/schema.prisma`.
