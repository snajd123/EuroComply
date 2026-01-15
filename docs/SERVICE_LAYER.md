# Service Layer Architecture

## Overview

EuroComply uses a layered architecture that separates concerns and enables scale-critical patterns like caching, rate limiting, and audit logging without polluting business logic.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    LAYERED ARCHITECTURE                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  API Layer (Controllers)                                            │    │
│  │  • Request validation (Zod schemas)                                 │    │
│  │  • Authentication/Authorization middleware                          │    │
│  │  • Response formatting (standard envelope)                          │    │
│  │  • Rate limit headers                                               │    │
│  └──────────────────────────────┬──────────────────────────────────────┘    │
│                                 │                                            │
│                                 ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Service Layer                                                       │    │
│  │  • Business logic orchestration                                     │    │
│  │  • Cross-cutting concerns (caching, audit, events)                  │    │
│  │  • Transaction boundaries                                           │    │
│  │  • Domain event emission                                            │    │
│  └──────────────────────────────┬──────────────────────────────────────┘    │
│                                 │                                            │
│                                 ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Repository Layer                                                    │    │
│  │  • Data access abstraction                                          │    │
│  │  • Query optimization                                               │    │
│  │  • Tenant isolation enforcement                                     │    │
│  │  • Caching strategy (read-through, write-through)                   │    │
│  └──────────────────────────────┬──────────────────────────────────────┘    │
│                                 │                                            │
│                                 ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  ORM Layer (Prisma)                                                  │    │
│  │  • Type-safe database access                                        │    │
│  │  • Schema migrations                                                │    │
│  │  • Connection pooling (via PgBouncer)                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Layer Responsibilities

### API Layer (Controllers)

Controllers handle HTTP concerns only. No business logic.

```typescript
// src/api/controllers/products.controller.ts
import { ProductService } from '@/services/product.service';
import { CreateProductSchema, UpdateProductSchema } from '@/schemas/product.schema';

export class ProductsController {
  constructor(
    private readonly productService: ProductService,
    private readonly rateLimiter: RateLimiter
  ) {}

  async create(req: Request, res: Response): Promise<void> {
    // 1. Validate request
    const data = CreateProductSchema.parse(req.body);

    // 2. Extract context (populated by middleware)
    const { organizationId, userId } = req.context;

    // 3. Delegate to service (NO business logic here)
    const product = await this.productService.create({
      ...data,
      organizationId,
      createdBy: userId,
    });

    // 4. Format response
    res.status(201).json({
      success: true,
      data: product,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  async list(req: Request, res: Response): Promise<void> {
    const { organizationId } = req.context;
    const { page, limit, status } = ListProductsSchema.parse(req.query);

    const result = await this.productService.list({
      organizationId,
      filters: { status },
      pagination: { page, limit },
    });

    res.status(200).json({
      success: true,
      data: result.items,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  }
}
```

**Controller Rules:**
- No database calls
- No business logic
- No direct ORM access
- Only validation, delegation, and response formatting

---

### Service Layer

Services contain business logic and orchestrate cross-cutting concerns.

```typescript
// src/services/product.service.ts
import { ProductRepository } from '@/repositories/product.repository';
import { AuditService } from '@/services/audit.service';
import { EventBus } from '@/events/event-bus';
import { CacheService } from '@/services/cache.service';

export class ProductService {
  constructor(
    private readonly repository: ProductRepository,
    private readonly auditService: AuditService,
    private readonly eventBus: EventBus,
    private readonly cache: CacheService
  ) {}

  async create(input: CreateProductInput): Promise<Product> {
    // 1. Business validation (beyond schema validation)
    await this.validateGtinUniqueness(input.organizationId, input.gtin);

    // 2. Execute in transaction with audit
    const product = await this.repository.transaction(async (tx) => {
      // Create the product
      const created = await this.repository.create(input, tx);

      // Audit log (within same transaction)
      await this.auditService.log({
        organizationId: input.organizationId,
        resourceType: 'product',
        resourceId: created.id,
        action: 'PRODUCT_CREATED',
        actorId: input.createdBy,
        details: { gtin: input.gtin, name: input.name },
      }, tx);

      return created;
    });

    // 3. Emit domain event (after transaction commits)
    await this.eventBus.emit({
      type: 'product.created',
      version: '1.0',
      organizationId: input.organizationId,
      payload: { productId: product.id },
    });

    // 4. Invalidate related caches
    await this.cache.invalidate(`org:${input.organizationId}:products:*`);

    return product;
  }

  async getById(
    organizationId: string,
    productId: string
  ): Promise<Product | null> {
    // 1. Check cache first
    const cacheKey = `org:${organizationId}:product:${productId}`;
    const cached = await this.cache.get<Product>(cacheKey);
    if (cached) return cached;

    // 2. Fetch from database
    const product = await this.repository.findById(organizationId, productId);
    if (!product) return null;

    // 3. Cache for future requests
    await this.cache.set(cacheKey, product, { ttl: 300 }); // 5 minutes

    return product;
  }

  async checkout(
    organizationId: string,
    productId: string,
    userId: string,
    workspace: 'design' | 'marketing'
  ): Promise<CheckoutResult> {
    // Business logic: check-out/check-in workflow
    return await this.repository.transaction(async (tx) => {
      // Lock the row for this transaction
      const product = await this.repository.findByIdForUpdate(
        organizationId,
        productId,
        tx
      );

      if (!product) {
        throw new NotFoundError('Product not found');
      }

      // Check if already checked out
      const checkoutField = workspace === 'design'
        ? 'designCheckedOutBy'
        : 'marketingCheckedOutBy';

      if (product[checkoutField] && product[checkoutField] !== userId) {
        throw new ConflictError(
          `Product is checked out by another user`,
          { checkedOutBy: product[checkoutField] }
        );
      }

      // Perform checkout
      const updated = await this.repository.update(
        organizationId,
        productId,
        {
          [checkoutField]: userId,
          [`${workspace}CheckedOutAt`]: new Date(),
        },
        tx
      );

      // Audit
      await this.auditService.log({
        organizationId,
        resourceType: 'product',
        resourceId: productId,
        action: 'PRODUCT_CHECKED_OUT',
        actorId: userId,
        details: { workspace },
      }, tx);

      return {
        product: updated,
        checkoutExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000), // 72h
      };
    });
  }

  private async validateGtinUniqueness(
    organizationId: string,
    gtin?: string
  ): Promise<void> {
    if (!gtin) return;

    const existing = await this.repository.findByGtin(organizationId, gtin);
    if (existing) {
      throw new ConflictError('GTIN already exists', { gtin });
    }
  }
}
```

**Service Rules:**
- All business logic lives here
- Orchestrates transactions
- Emits domain events
- Manages caching
- Coordinates audit logging

---

### Repository Layer

Repositories abstract data access and enforce tenant isolation.

```typescript
// src/repositories/product.repository.ts
import { PrismaClient, Prisma } from '@prisma/client';
import { TenantContext } from '@/context/tenant.context';

export class ProductRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tenantContext: TenantContext
  ) {}

  async transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    return await this.prisma.$transaction(async (tx) => {
      // Set tenant context at transaction start
      await this.tenantContext.setSchemaContext(tx);
      return await operation(tx);
    });
  }

  async create(
    input: CreateProductInput,
    tx?: Prisma.TransactionClient
  ): Promise<Product> {
    const client = tx || this.prisma;

    return await client.product.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        gtin: input.gtin,
        sku: input.sku,
        category: input.category,
        status: 'draft',
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      },
    });
  }

  async findById(
    organizationId: string,
    productId: string,
    tx?: Prisma.TransactionClient
  ): Promise<Product | null> {
    const client = tx || this.prisma;

    return await client.product.findFirst({
      where: {
        id: productId,
        organizationId, // Enforced tenant isolation
        deletedAt: null,
      },
    });
  }

  async findByIdForUpdate(
    organizationId: string,
    productId: string,
    tx: Prisma.TransactionClient
  ): Promise<Product | null> {
    // Use raw query for SELECT ... FOR UPDATE
    const results = await tx.$queryRaw<Product[]>`
      SELECT * FROM products
      WHERE id = ${productId}
        AND organization_id = ${organizationId}
        AND deleted_at IS NULL
      FOR UPDATE
    `;

    return results[0] || null;
  }

  async findByGtin(
    organizationId: string,
    gtin: string
  ): Promise<Product | null> {
    return await this.prisma.product.findFirst({
      where: {
        organizationId,
        gtin,
        deletedAt: null,
      },
    });
  }

  async list(
    organizationId: string,
    options: ListOptions
  ): Promise<PaginatedResult<Product>> {
    const { filters, pagination } = options;
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      organizationId,
      deletedAt: null,
      ...(filters.status && { status: filters.status }),
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async update(
    organizationId: string,
    productId: string,
    data: Partial<Product>,
    tx?: Prisma.TransactionClient
  ): Promise<Product> {
    const client = tx || this.prisma;

    return await client.product.update({
      where: {
        id: productId,
        organizationId,
      },
      data: {
        ...data,
        updatedAt: new Date(),
        version: { increment: 1 }, // Optimistic locking
      },
    });
  }

  async softDelete(
    organizationId: string,
    productId: string,
    deletedBy: string,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const client = tx || this.prisma;

    await client.product.update({
      where: {
        id: productId,
        organizationId,
      },
      data: {
        deletedAt: new Date(),
        deletedBy,
        version: { increment: 1 },
      },
    });
  }
}
```

**Repository Rules:**
- Only data access operations
- Always enforce tenant isolation via `organizationId`
- Accept transaction client for participation in larger transactions
- No business logic

---

## Cross-Cutting Concerns

### Audit Service Integration

Every service method that modifies data logs to the audit trail:

```typescript
// src/services/audit.service.ts
export class AuditService {
  async log(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx || this.prisma;

    await client.auditLog.create({
      data: {
        organizationId: entry.organizationId,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        action: entry.action,
        actorId: entry.actorId,
        actorType: entry.actorType || 'user',
        details: entry.details || {},
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      },
    });
  }
}

// Integration pattern in services
async updateProduct(input: UpdateProductInput): Promise<Product> {
  return await this.repository.transaction(async (tx) => {
    const product = await this.repository.update(
      input.organizationId,
      input.productId,
      input.data,
      tx
    );

    // Audit happens in SAME transaction - all or nothing
    await this.auditService.log({
      organizationId: input.organizationId,
      resourceType: 'product',
      resourceId: input.productId,
      action: 'PRODUCT_UPDATED',
      actorId: input.updatedBy,
      details: {
        changes: input.data,
        previousVersion: input.previousVersion,
      },
    }, tx);

    return product;
  });
}
```

### Caching Strategy

```typescript
// src/services/cache.service.ts
export class CacheService {
  constructor(private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const ttl = options?.ttl || 300; // Default 5 minutes
    await this.redis.setex(key, ttl, JSON.stringify(value));
  }

  async invalidate(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  // Read-through cache helper
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached) return cached;

    const value = await factory();
    await this.set(key, value, options);
    return value;
  }
}

// Usage in service
async getProduct(orgId: string, productId: string): Promise<Product> {
  return await this.cache.getOrSet(
    `org:${orgId}:product:${productId}`,
    () => this.repository.findById(orgId, productId),
    { ttl: 300 }
  );
}
```

### Rate Limiting

Rate limiting is enforced at the API layer but configured per-tenant:

```typescript
// src/middleware/rate-limiter.ts
export class RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly config: RateLimitConfig
  ) {}

  middleware(): RequestHandler {
    return async (req, res, next) => {
      const { organizationId } = req.context;
      const tier = await this.getTenantTier(organizationId);

      const limits = this.config.tierLimits[tier];
      const key = `ratelimit:${organizationId}:${this.getWindow()}`;

      const current = await this.redis.incr(key);
      if (current === 1) {
        await this.redis.expire(key, 60); // 1-minute window
      }

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', limits.requestsPerMinute);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, limits.requestsPerMinute - current));
      res.setHeader('X-RateLimit-Reset', this.getWindowEnd());

      if (current > limits.requestsPerMinute) {
        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit exceeded. Try again in ${this.getRetryAfter()} seconds.`,
          },
        });
      }

      next();
    };
  }
}

// Configuration by tier
const rateLimitConfig = {
  tierLimits: {
    starter: { requestsPerMinute: 60, burstLimit: 100 },
    growth: { requestsPerMinute: 300, burstLimit: 500 },
    scale: { requestsPerMinute: 1000, burstLimit: 2000 },
    enterprise: { requestsPerMinute: 5000, burstLimit: 10000 },
    platform: { requestsPerMinute: 10000, burstLimit: 20000 },
  },
};
```

---

## Domain Events

Services emit domain events for async processing and cross-service communication:

```typescript
// src/events/event-bus.ts
export class EventBus {
  constructor(private readonly outboxRepository: OutboxRepository) {}

  async emit(event: DomainEvent): Promise<void> {
    // Store in outbox table (same transaction as business operation)
    await this.outboxRepository.create({
      eventType: event.type,
      eventVersion: event.version,
      organizationId: event.organizationId,
      payload: event.payload,
      status: 'pending',
    });

    // Outbox processor picks up and publishes to SQS
  }
}

// Event types
interface DomainEvent {
  type: string;
  version: string;
  organizationId: string;
  payload: Record<string, unknown>;
}

// Example events
type ProductEvents =
  | { type: 'product.created'; version: '1.0'; payload: { productId: string } }
  | { type: 'product.updated'; version: '1.0'; payload: { productId: string; changes: string[] } }
  | { type: 'product.checked_out'; version: '1.0'; payload: { productId: string; userId: string; workspace: string } }
  | { type: 'product.released'; version: '1.0'; payload: { productId: string; versionId: string } };
```

---

## Error Handling

Services throw typed errors that the API layer converts to HTTP responses:

```typescript
// src/errors/domain-errors.ts
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'NOT_FOUND', details);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFLICT', details);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', details);
  }
}

// API layer error handler
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof DomainError) {
    const statusMap: Record<string, number> = {
      NOT_FOUND: 404,
      CONFLICT: 409,
      VALIDATION_ERROR: 400,
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
    };

    res.status(statusMap[err.code] || 500).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // Unknown error - log and return generic message
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
```

---

## Testing Strategy

Each layer is tested independently:

```typescript
// Unit test: Service layer (mock repository)
describe('ProductService', () => {
  let service: ProductService;
  let mockRepository: MockProductRepository;
  let mockAuditService: MockAuditService;

  beforeEach(() => {
    mockRepository = new MockProductRepository();
    mockAuditService = new MockAuditService();
    service = new ProductService(mockRepository, mockAuditService, ...);
  });

  it('should create product with audit log', async () => {
    const input = { organizationId: 'org-1', name: 'Test', createdBy: 'user-1' };

    const result = await service.create(input);

    expect(result.name).toBe('Test');
    expect(mockAuditService.logs).toHaveLength(1);
    expect(mockAuditService.logs[0].action).toBe('PRODUCT_CREATED');
  });

  it('should throw ConflictError on duplicate GTIN', async () => {
    mockRepository.setExistingGtin('1234567890123');

    await expect(
      service.create({ organizationId: 'org-1', gtin: '1234567890123', ... })
    ).rejects.toThrow(ConflictError);
  });
});

// Integration test: Repository layer (real database)
describe('ProductRepository', () => {
  let repository: ProductRepository;
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await TestDatabase.create();
    repository = new ProductRepository(testDb.prisma, new TenantContext('test-org'));
  });

  it('should enforce tenant isolation', async () => {
    // Create product in org-1
    await repository.create({ organizationId: 'org-1', name: 'Product 1' });

    // Try to read from org-2 context - should return null
    const wrongTenant = new ProductRepository(testDb.prisma, new TenantContext('org-2'));
    const result = await wrongTenant.findById('org-2', 'product-id');

    expect(result).toBeNull();
  });
});
```

---

## Summary

| Layer | Responsibility | Can Call | Called By |
|-------|----------------|----------|-----------|
| **API (Controller)** | HTTP handling, validation, response formatting | Service | HTTP framework |
| **Service** | Business logic, transactions, events, caching | Repository, other Services | API, Background jobs |
| **Repository** | Data access, tenant isolation, query building | ORM (Prisma) | Service |
| **ORM (Prisma)** | Database operations, migrations | Database | Repository |

**Key Benefits:**
- Testability: Each layer can be unit tested with mocks
- Maintainability: Changes to one layer don't ripple through others
- Scalability: Caching, rate limiting, and audit can be added without touching business logic
- Security: Tenant isolation is enforced at repository level, not scattered everywhere
