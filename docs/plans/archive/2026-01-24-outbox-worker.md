# Outbox Worker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build outbox workers to process events from the dual-schema outbox pattern (public schema for system events, tenant schemas for domain events).

**Architecture:** Single worker process with two processing modes - system worker polls public.outbox_event, tenant worker iterates through active tenant schemas. Events are processed with exponential backoff retry, marked COMPLETED on success or FAILED after max retries.

**Tech Stack:** MikroORM, Vitest, TypeScript, Node.js CLI

**Current State:** App is early stage - only users, tenant provisioning, and webhook handlers exist. OutboxEvents are being created but not processed.

---

## Task 1: Create OutboxProcessorService (Core Logic)

**Files:**
- Create: `packages/database/src/services/outbox-processor.service.ts`
- Create: `packages/database/src/services/outbox-processor.service.test.ts`
- Modify: `packages/database/src/services/index.ts`

### Step 1.1: Write the failing test for claiming an event

```typescript
// packages/database/src/services/outbox-processor.service.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb, clearTestDb } from '../test-utils.js';
import { OutboxEvent, OutboxStatus } from '../entities/OutboxEvent.js';
import { OutboxProcessorService } from './outbox-processor.service.js';
import { createId } from '@paralleldrive/cuid2';

describe('OutboxProcessorService', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let service: OutboxProcessorService;

  beforeAll(async () => {
    orm = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    em = orm.em.fork();
    await clearTestDb(em);
    service = new OutboxProcessorService(orm);
  });

  describe('claimNextEvent', () => {
    it('should claim a PENDING event and mark it PROCESSING', async () => {
      // Arrange
      const event = em.create(OutboxEvent, {
        id: createId(),
        aggregateType: 'Organization',
        aggregateId: 'org_123',
        eventType: 'organization.provisioned',
        payload: { test: true },
        status: OutboxStatus.PENDING,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.persistAndFlush(event);

      // Act
      const claimed = await service.claimNextEvent('public');

      // Assert
      expect(claimed).toBeDefined();
      expect(claimed!.id).toBe(event.id);
      expect(claimed!.status).toBe(OutboxStatus.PROCESSING);
    });
  });
});
```

### Step 1.2: Run test to verify it fails

Run: `cd packages/database && npm run test -- --run outbox-processor.service.test.ts`

Expected: FAIL - module not found

### Step 1.3: Write minimal implementation for claimNextEvent

```typescript
// packages/database/src/services/outbox-processor.service.ts
import { MikroORM, EntityManager, LockMode } from '@mikro-orm/postgresql';
import { OutboxEvent, OutboxStatus } from '../entities/OutboxEvent.js';

export class OutboxProcessorService {
  constructor(private orm: MikroORM) {}

  /**
   * Claim the next pending event from a schema.
   * Uses SELECT FOR UPDATE SKIP LOCKED for safe concurrent access.
   */
  async claimNextEvent(schema: string): Promise<OutboxEvent | null> {
    const em = this.orm.em.fork({ schema });

    return await em.transactional(async (txEm) => {
      const event = await txEm.findOne(
        OutboxEvent,
        { status: OutboxStatus.PENDING },
        {
          orderBy: { createdAt: 'ASC' },
          lockMode: LockMode.PESSIMISTIC_WRITE_OR_FAIL,
        }
      );

      if (!event) return null;

      event.status = OutboxStatus.PROCESSING;
      event.updatedAt = new Date();
      await txEm.flush();

      return event;
    });
  }
}
```

### Step 1.4: Run test to verify it passes

Run: `cd packages/database && npm run test -- --run outbox-processor.service.test.ts`

Expected: PASS

### Step 1.5: Write test for markCompleted

Add to the test file:

```typescript
  describe('markCompleted', () => {
    it('should mark event as COMPLETED with processedAt timestamp', async () => {
      // Arrange
      const event = em.create(OutboxEvent, {
        id: createId(),
        aggregateType: 'Organization',
        aggregateId: 'org_123',
        eventType: 'organization.provisioned',
        payload: { test: true },
        status: OutboxStatus.PROCESSING,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.persistAndFlush(event);

      // Act
      await service.markCompleted('public', event.id);

      // Assert
      const updated = await em.findOneOrFail(OutboxEvent, event.id);
      expect(updated.status).toBe(OutboxStatus.COMPLETED);
      expect(updated.processedAt).toBeDefined();
    });
  });
```

### Step 1.6: Run test to verify it fails

Run: `cd packages/database && npm run test -- --run outbox-processor.service.test.ts`

Expected: FAIL - markCompleted not defined

### Step 1.7: Implement markCompleted

Add to `outbox-processor.service.ts`:

```typescript
  /**
   * Mark an event as successfully processed.
   */
  async markCompleted(schema: string, eventId: string): Promise<void> {
    const em = this.orm.em.fork({ schema });
    const event = await em.findOneOrFail(OutboxEvent, eventId);
    event.status = OutboxStatus.COMPLETED;
    event.processedAt = new Date();
    event.updatedAt = new Date();
    await em.flush();
  }
```

### Step 1.8: Run test to verify it passes

Run: `cd packages/database && npm run test -- --run outbox-processor.service.test.ts`

Expected: PASS

### Step 1.9: Write test for markFailed with retry

Add to the test file:

```typescript
  describe('markFailed', () => {
    it('should increment retryCount and return to PENDING when under max retries', async () => {
      // Arrange
      const event = em.create(OutboxEvent, {
        id: createId(),
        aggregateType: 'Organization',
        aggregateId: 'org_123',
        eventType: 'organization.provisioned',
        payload: { test: true },
        status: OutboxStatus.PROCESSING,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.persistAndFlush(event);

      // Act
      await service.markFailed('public', event.id, 'Test error', 5);

      // Assert
      const updated = await em.findOneOrFail(OutboxEvent, event.id);
      expect(updated.status).toBe(OutboxStatus.PENDING);
      expect(updated.retryCount).toBe(1);
      expect(updated.errorMessage).toBe('Test error');
    });

    it('should mark as FAILED when max retries exceeded', async () => {
      // Arrange
      const event = em.create(OutboxEvent, {
        id: createId(),
        aggregateType: 'Organization',
        aggregateId: 'org_123',
        eventType: 'organization.provisioned',
        payload: { test: true },
        status: OutboxStatus.PROCESSING,
        retryCount: 4, // Already at 4, next will be 5 (max)
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.persistAndFlush(event);

      // Act
      await service.markFailed('public', event.id, 'Final error', 5);

      // Assert
      const updated = await em.findOneOrFail(OutboxEvent, event.id);
      expect(updated.status).toBe(OutboxStatus.FAILED);
      expect(updated.retryCount).toBe(5);
    });
  });
```

### Step 1.10: Run test to verify it fails

Run: `cd packages/database && npm run test -- --run outbox-processor.service.test.ts`

Expected: FAIL - markFailed not defined

### Step 1.11: Implement markFailed

Add to `outbox-processor.service.ts`:

```typescript
  /**
   * Mark an event as failed. Returns to PENDING if under max retries,
   * otherwise marks as permanently FAILED.
   */
  async markFailed(
    schema: string,
    eventId: string,
    errorMessage: string,
    maxRetries: number
  ): Promise<void> {
    const em = this.orm.em.fork({ schema });
    const event = await em.findOneOrFail(OutboxEvent, eventId);

    event.retryCount += 1;
    event.errorMessage = errorMessage;
    event.updatedAt = new Date();

    if (event.retryCount >= maxRetries) {
      event.status = OutboxStatus.FAILED;
    } else {
      event.status = OutboxStatus.PENDING;
    }

    await em.flush();
  }
```

### Step 1.12: Run test to verify it passes

Run: `cd packages/database && npm run test -- --run outbox-processor.service.test.ts`

Expected: PASS

### Step 1.13: Export the service

```typescript
// packages/database/src/services/index.ts
// Add to existing exports:
export { OutboxProcessorService } from './outbox-processor.service.js';
```

### Step 1.14: Run all tests

Run: `cd packages/database && npm run test`

Expected: All tests pass

### Step 1.15: Commit

```bash
git add packages/database/src/services/outbox-processor.service.ts \
        packages/database/src/services/outbox-processor.service.test.ts \
        packages/database/src/services/index.ts
git commit -m "feat(database): add OutboxProcessorService for event claim/complete/fail

Implements core outbox processing logic:
- claimNextEvent with SELECT FOR UPDATE SKIP LOCKED
- markCompleted for successful processing
- markFailed with retry count and max retry handling

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Add Tenant Schema Discovery

**Files:**
- Modify: `packages/database/src/services/outbox-processor.service.ts`
- Modify: `packages/database/src/services/outbox-processor.service.test.ts`

### Step 2.1: Write test for getActiveSchemas

Add to the test file:

```typescript
  describe('getActiveSchemas', () => {
    it('should return schema names for READY organizations', async () => {
      // Arrange - create an organization directly
      const { Organization } = await import('../entities/Organization.js');
      const org = em.create(Organization, {
        id: createId(),
        name: 'Test Org',
        slug: 'test-org',
        schemaName: 'tenant_test_org',
        status: 'READY',
        clerkOrgId: 'clerk_123',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.persistAndFlush(org);

      // Act
      const schemas = await service.getActiveSchemas();

      // Assert
      expect(schemas).toContain('tenant_test_org');
    });

    it('should not return schemas for non-READY organizations', async () => {
      // Arrange
      const { Organization } = await import('../entities/Organization.js');
      const org = em.create(Organization, {
        id: createId(),
        name: 'Pending Org',
        slug: 'pending-org',
        schemaName: 'tenant_pending_org',
        status: 'PENDING',
        clerkOrgId: 'clerk_456',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.persistAndFlush(org);

      // Act
      const schemas = await service.getActiveSchemas();

      // Assert
      expect(schemas).not.toContain('tenant_pending_org');
    });
  });
```

### Step 2.2: Run test to verify it fails

Run: `cd packages/database && npm run test -- --run outbox-processor.service.test.ts`

Expected: FAIL - getActiveSchemas not defined

### Step 2.3: Implement getActiveSchemas

Add to `outbox-processor.service.ts`:

```typescript
import { Organization } from '../entities/Organization.js';

// Add to class:
  /**
   * Get all active tenant schemas that need processing.
   */
  async getActiveSchemas(): Promise<string[]> {
    const em = this.orm.em.fork({ schema: 'public' });
    const orgs = await em.find(Organization, { status: 'READY' });
    return orgs.map((org) => org.schemaName);
  }
```

### Step 2.4: Run test to verify it passes

Run: `cd packages/database && npm run test -- --run outbox-processor.service.test.ts`

Expected: PASS

### Step 2.5: Commit

```bash
git add packages/database/src/services/outbox-processor.service.ts \
        packages/database/src/services/outbox-processor.service.test.ts
git commit -m "feat(database): add tenant schema discovery to OutboxProcessorService

Adds getActiveSchemas() to find all READY organizations
for tenant worker polling.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Add Event Handlers Registry

**Files:**
- Create: `packages/database/src/services/outbox-handlers/index.ts`
- Create: `packages/database/src/services/outbox-handlers/types.ts`
- Create: `packages/database/src/services/outbox-handlers/organization-provisioned.handler.ts`
- Create: `packages/database/src/services/outbox-handlers/organization-provisioned.handler.test.ts`

### Step 3.1: Create the types file

```typescript
// packages/database/src/services/outbox-handlers/types.ts
import { OutboxEvent } from '../../entities/OutboxEvent.js';
import { MikroORM } from '@mikro-orm/postgresql';

export interface OutboxHandlerContext {
  orm: MikroORM;
  schema: string;
}

export interface OutboxHandler {
  eventType: string;
  handle(event: OutboxEvent, context: OutboxHandlerContext): Promise<void>;
}
```

### Step 3.2: Write test for organization.provisioned handler

```typescript
// packages/database/src/services/outbox-handlers/organization-provisioned.handler.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb, clearTestDb } from '../../test-utils.js';
import { OutboxEvent, OutboxStatus } from '../../entities/OutboxEvent.js';
import { organizationProvisionedHandler } from './organization-provisioned.handler.js';
import { createId } from '@paralleldrive/cuid2';

describe('organizationProvisionedHandler', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    const em = orm.em.fork();
    await clearTestDb(em);
  });

  it('should handle organization.provisioned event without error', async () => {
    // Arrange
    const event: OutboxEvent = {
      id: createId(),
      aggregateType: 'Organization',
      aggregateId: 'org_123',
      eventType: 'organization.provisioned',
      payload: {
        organizationId: 'org_123',
        schemaName: 'tenant_test',
        name: 'Test Org',
      },
      status: OutboxStatus.PROCESSING,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as OutboxEvent;

    // Act & Assert - should not throw
    await expect(
      organizationProvisionedHandler.handle(event, { orm, schema: 'public' })
    ).resolves.not.toThrow();
  });

  it('should have correct eventType', () => {
    expect(organizationProvisionedHandler.eventType).toBe('organization.provisioned');
  });
});
```

### Step 3.3: Run test to verify it fails

Run: `cd packages/database && npm run test -- --run organization-provisioned.handler.test.ts`

Expected: FAIL - module not found

### Step 3.4: Implement organization.provisioned handler

```typescript
// packages/database/src/services/outbox-handlers/organization-provisioned.handler.ts
import { OutboxHandler, OutboxHandlerContext } from './types.js';
import { OutboxEvent } from '../../entities/OutboxEvent.js';

/**
 * Handler for organization.provisioned events.
 *
 * Currently a no-op - the organization is already provisioned.
 * Future uses:
 * - Send welcome email
 * - Initialize default data
 * - Notify external systems
 */
export const organizationProvisionedHandler: OutboxHandler = {
  eventType: 'organization.provisioned',

  async handle(event: OutboxEvent, context: OutboxHandlerContext): Promise<void> {
    const { organizationId, schemaName, name } = event.payload as {
      organizationId: string;
      schemaName: string;
      name: string;
    };

    // Log for now - actual side effects to be added later
    console.log(
      `[OutboxHandler] organization.provisioned: ${name} (${organizationId}) -> ${schemaName}`
    );
  },
};
```

### Step 3.5: Run test to verify it passes

Run: `cd packages/database && npm run test -- --run organization-provisioned.handler.test.ts`

Expected: PASS

### Step 3.6: Create handler registry

```typescript
// packages/database/src/services/outbox-handlers/index.ts
import { OutboxHandler } from './types.js';
import { organizationProvisionedHandler } from './organization-provisioned.handler.js';

export * from './types.js';

/**
 * Registry of all outbox event handlers.
 * Add new handlers here as they are implemented.
 */
const handlers: OutboxHandler[] = [
  organizationProvisionedHandler,
];

const handlerMap = new Map<string, OutboxHandler>(
  handlers.map((h) => [h.eventType, h])
);

export function getHandler(eventType: string): OutboxHandler | undefined {
  return handlerMap.get(eventType);
}

export function getRegisteredEventTypes(): string[] {
  return Array.from(handlerMap.keys());
}
```

### Step 3.7: Commit

```bash
git add packages/database/src/services/outbox-handlers/
git commit -m "feat(database): add outbox event handler registry

Creates handler architecture with:
- OutboxHandler interface
- Handler registry with getHandler/getRegisteredEventTypes
- organization.provisioned handler (logging only for now)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Add processEvent Method

**Files:**
- Modify: `packages/database/src/services/outbox-processor.service.ts`
- Modify: `packages/database/src/services/outbox-processor.service.test.ts`

### Step 4.1: Write test for processEvent

Add to the test file:

```typescript
  describe('processEvent', () => {
    it('should process event and mark as COMPLETED when handler succeeds', async () => {
      // Arrange
      const event = em.create(OutboxEvent, {
        id: createId(),
        aggregateType: 'Organization',
        aggregateId: 'org_123',
        eventType: 'organization.provisioned',
        payload: { organizationId: 'org_123', schemaName: 'tenant_test', name: 'Test' },
        status: OutboxStatus.PENDING,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.persistAndFlush(event);

      // Act
      const result = await service.processEvent('public', event.id);

      // Assert
      expect(result.success).toBe(true);
      const updated = await em.findOneOrFail(OutboxEvent, event.id);
      expect(updated.status).toBe(OutboxStatus.COMPLETED);
    });

    it('should skip event with no registered handler and mark as COMPLETED', async () => {
      // Arrange
      const event = em.create(OutboxEvent, {
        id: createId(),
        aggregateType: 'Unknown',
        aggregateId: 'unknown_123',
        eventType: 'unknown.event.type',
        payload: {},
        status: OutboxStatus.PENDING,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.persistAndFlush(event);

      // Act
      const result = await service.processEvent('public', event.id);

      // Assert
      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      const updated = await em.findOneOrFail(OutboxEvent, event.id);
      expect(updated.status).toBe(OutboxStatus.COMPLETED);
    });
  });
```

### Step 4.2: Run test to verify it fails

Run: `cd packages/database && npm run test -- --run outbox-processor.service.test.ts`

Expected: FAIL - processEvent not defined

### Step 4.3: Implement processEvent

Add to `outbox-processor.service.ts`:

```typescript
import { getHandler } from './outbox-handlers/index.js';

export interface ProcessEventResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
}

// Add to class:
  /**
   * Process a single event by ID.
   * Claims the event, runs the handler, and updates status.
   */
  async processEvent(
    schema: string,
    eventId: string,
    maxRetries: number = 5
  ): Promise<ProcessEventResult> {
    const em = this.orm.em.fork({ schema });
    const event = await em.findOneOrFail(OutboxEvent, eventId);

    // Mark as processing
    event.status = OutboxStatus.PROCESSING;
    event.updatedAt = new Date();
    await em.flush();

    // Find handler
    const handler = getHandler(event.eventType);
    if (!handler) {
      // No handler registered - skip but mark as completed
      console.log(`[OutboxProcessor] No handler for ${event.eventType}, skipping`);
      await this.markCompleted(schema, eventId);
      return { success: true, skipped: true };
    }

    try {
      await handler.handle(event, { orm: this.orm, schema });
      await this.markCompleted(schema, eventId);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.markFailed(schema, eventId, errorMessage, maxRetries);
      return { success: false, error: errorMessage };
    }
  }
```

### Step 4.4: Run test to verify it passes

Run: `cd packages/database && npm run test -- --run outbox-processor.service.test.ts`

Expected: PASS

### Step 4.5: Commit

```bash
git add packages/database/src/services/outbox-processor.service.ts \
        packages/database/src/services/outbox-processor.service.test.ts
git commit -m "feat(database): add processEvent method to OutboxProcessorService

Implements full event processing flow:
- Claims event, runs handler, updates status
- Handles missing handlers gracefully (skip and complete)
- Captures and stores errors on failure

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Add Polling Loop Methods

**Files:**
- Modify: `packages/database/src/services/outbox-processor.service.ts`
- Modify: `packages/database/src/services/outbox-processor.service.test.ts`

### Step 5.1: Write test for processBatch

Add to the test file:

```typescript
  describe('processBatch', () => {
    it('should process multiple pending events in a schema', async () => {
      // Arrange - create 3 events
      for (let i = 0; i < 3; i++) {
        const event = em.create(OutboxEvent, {
          id: createId(),
          aggregateType: 'Organization',
          aggregateId: `org_${i}`,
          eventType: 'organization.provisioned',
          payload: { organizationId: `org_${i}`, schemaName: `tenant_${i}`, name: `Test ${i}` },
          status: OutboxStatus.PENDING,
          retryCount: 0,
          createdAt: new Date(Date.now() + i), // Ensure ordering
          updatedAt: new Date(),
        });
        await em.persistAndFlush(event);
      }

      // Act
      const results = await service.processBatch('public', 10);

      // Assert
      expect(results.processed).toBe(3);
      expect(results.failed).toBe(0);

      const remaining = await em.count(OutboxEvent, { status: OutboxStatus.PENDING });
      expect(remaining).toBe(0);
    });

    it('should respect batch size limit', async () => {
      // Arrange - create 5 events
      for (let i = 0; i < 5; i++) {
        const event = em.create(OutboxEvent, {
          id: createId(),
          aggregateType: 'Organization',
          aggregateId: `org_${i}`,
          eventType: 'organization.provisioned',
          payload: { organizationId: `org_${i}`, schemaName: `tenant_${i}`, name: `Test ${i}` },
          status: OutboxStatus.PENDING,
          retryCount: 0,
          createdAt: new Date(Date.now() + i),
          updatedAt: new Date(),
        });
        await em.persistAndFlush(event);
      }

      // Act - process only 2
      const results = await service.processBatch('public', 2);

      // Assert
      expect(results.processed).toBe(2);

      const remaining = await em.count(OutboxEvent, { status: OutboxStatus.PENDING });
      expect(remaining).toBe(3);
    });
  });
```

### Step 5.2: Run test to verify it fails

Run: `cd packages/database && npm run test -- --run outbox-processor.service.test.ts`

Expected: FAIL - processBatch not defined

### Step 5.3: Implement processBatch

Add to `outbox-processor.service.ts`:

```typescript
export interface BatchResult {
  processed: number;
  failed: number;
  skipped: number;
}

// Add to class:
  /**
   * Process a batch of pending events from a schema.
   */
  async processBatch(schema: string, batchSize: number): Promise<BatchResult> {
    const em = this.orm.em.fork({ schema });
    const events = await em.find(
      OutboxEvent,
      { status: OutboxStatus.PENDING },
      { orderBy: { createdAt: 'ASC' }, limit: batchSize }
    );

    const result: BatchResult = { processed: 0, failed: 0, skipped: 0 };

    for (const event of events) {
      const processResult = await this.processEvent(schema, event.id);
      if (processResult.success) {
        result.processed++;
        if (processResult.skipped) {
          result.skipped++;
        }
      } else {
        result.failed++;
      }
    }

    return result;
  }
```

### Step 5.4: Run test to verify it passes

Run: `cd packages/database && npm run test -- --run outbox-processor.service.test.ts`

Expected: PASS

### Step 5.5: Write test for processAllSchemas

Add to the test file:

```typescript
  describe('processAllSchemas', () => {
    it('should process public schema events', async () => {
      // Arrange
      const event = em.create(OutboxEvent, {
        id: createId(),
        aggregateType: 'Organization',
        aggregateId: 'org_123',
        eventType: 'organization.provisioned',
        payload: { organizationId: 'org_123', schemaName: 'tenant_test', name: 'Test' },
        status: OutboxStatus.PENDING,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.persistAndFlush(event);

      // Act
      const results = await service.processAllSchemas(10);

      // Assert
      expect(results.public.processed).toBe(1);
    });
  });
```

### Step 5.6: Run test to verify it fails

Run: `cd packages/database && npm run test -- --run outbox-processor.service.test.ts`

Expected: FAIL - processAllSchemas not defined

### Step 5.7: Implement processAllSchemas

Add to `outbox-processor.service.ts`:

```typescript
export interface AllSchemasResult {
  public: BatchResult;
  tenants: Map<string, BatchResult>;
  totalProcessed: number;
  totalFailed: number;
}

// Add to class:
  /**
   * Process events from public schema and all active tenant schemas.
   */
  async processAllSchemas(batchSize: number): Promise<AllSchemasResult> {
    const result: AllSchemasResult = {
      public: { processed: 0, failed: 0, skipped: 0 },
      tenants: new Map(),
      totalProcessed: 0,
      totalFailed: 0,
    };

    // 1. Process public schema (system events)
    result.public = await this.processBatch('public', batchSize);
    result.totalProcessed += result.public.processed;
    result.totalFailed += result.public.failed;

    // 2. Process all tenant schemas
    const schemas = await this.getActiveSchemas();
    for (const schema of schemas) {
      try {
        const tenantResult = await this.processBatch(schema, batchSize);
        result.tenants.set(schema, tenantResult);
        result.totalProcessed += tenantResult.processed;
        result.totalFailed += tenantResult.failed;
      } catch (error) {
        console.error(`[OutboxProcessor] Error processing schema ${schema}:`, error);
        result.tenants.set(schema, { processed: 0, failed: 1, skipped: 0 });
        result.totalFailed++;
      }
    }

    return result;
  }
```

### Step 5.8: Run test to verify it passes

Run: `cd packages/database && npm run test -- --run outbox-processor.service.test.ts`

Expected: PASS

### Step 5.9: Commit

```bash
git add packages/database/src/services/outbox-processor.service.ts \
        packages/database/src/services/outbox-processor.service.test.ts
git commit -m "feat(database): add batch processing to OutboxProcessorService

Implements polling methods:
- processBatch for single schema with batch size limit
- processAllSchemas for public + all tenant schemas

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Create Worker CLI Entry Point

**Files:**
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/src/index.ts`
- Create: `apps/worker/src/commands/process-outbox.ts`

### Step 6.1: Create package.json

```json
{
  "name": "@eurocomply/worker",
  "version": "0.0.1",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "node --env-file=../../.env --import tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@eurocomply/database": "workspace:*"
  },
  "devDependencies": {
    "@swc/core": "^1.4.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.7.0",
    "unplugin-swc": "^1.5.0",
    "vitest": "^2.1.0"
  }
}
```

### Step 6.2: Create tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Step 6.3: Create the process-outbox command

```typescript
// apps/worker/src/commands/process-outbox.ts
import { initOrm, closeOrm } from '@eurocomply/database';
import { OutboxProcessorService } from '@eurocomply/database';

export interface ProcessOutboxOptions {
  batchSize: number;
  pollInterval: number; // ms
  maxRetries: number;
  once: boolean; // Run once and exit vs continuous polling
}

const defaultOptions: ProcessOutboxOptions = {
  batchSize: 10,
  pollInterval: 5000,
  maxRetries: 5,
  once: false,
};

export async function processOutbox(options: Partial<ProcessOutboxOptions> = {}): Promise<void> {
  const opts = { ...defaultOptions, ...options };
  console.log('[Worker] Starting outbox processor with options:', opts);

  const orm = await initOrm();
  const processor = new OutboxProcessorService(orm);

  let running = true;

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('[Worker] Shutting down...');
    running = false;
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    while (running) {
      const results = await processor.processAllSchemas(opts.batchSize);

      if (results.totalProcessed > 0 || results.totalFailed > 0) {
        console.log(
          `[Worker] Processed: ${results.totalProcessed}, Failed: ${results.totalFailed}`
        );
      }

      if (opts.once) {
        break;
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, opts.pollInterval));
    }
  } finally {
    await closeOrm();
    console.log('[Worker] Shutdown complete');
  }
}
```

### Step 6.4: Create the entry point

```typescript
// apps/worker/src/index.ts
import { processOutbox } from './commands/process-outbox.js';

const command = process.argv[2];

async function main(): Promise<void> {
  switch (command) {
    case 'outbox':
    case undefined:
      await processOutbox({
        batchSize: parseInt(process.env['WORKER_BATCH_SIZE'] ?? '10', 10),
        pollInterval: parseInt(process.env['WORKER_POLL_INTERVAL'] ?? '5000', 10),
        maxRetries: parseInt(process.env['WORKER_MAX_RETRIES'] ?? '5', 10),
        once: process.argv.includes('--once'),
      });
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log('Usage: npm run dev [outbox] [--once]');
      process.exit(1);
  }
}

main().catch((error) => {
  console.error('[Worker] Fatal error:', error);
  process.exit(1);
});
```

### Step 6.5: Install dependencies

Run: `cd apps/worker && pnpm install`

### Step 6.6: Test the worker builds

Run: `cd apps/worker && pnpm build`

Expected: No TypeScript errors

### Step 6.7: Commit

```bash
git add apps/worker/
git commit -m "feat(worker): create outbox worker CLI app

Adds new worker app with:
- process-outbox command for continuous polling
- --once flag for single-run mode
- Environment variable configuration
- Graceful shutdown handling

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Add Integration Test

**Files:**
- Create: `apps/worker/src/commands/process-outbox.integration.test.ts`
- Create: `apps/worker/vitest.config.ts`

### Step 7.1: Create vitest config

```typescript
// apps/worker/vitest.config.ts
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2022',
      },
    }),
  ],
  test: {
    globals: false,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ['src/**/*.test.ts'],
    env: {
      DATABASE_HOST: 'localhost',
      DATABASE_PORT: '5433',
      DATABASE_USER: 'postgres',
      DATABASE_PASSWORD: 'postgres',
      DATABASE_NAME: 'eurocomply_test',
    },
  },
});
```

### Step 7.2: Write integration test

```typescript
// apps/worker/src/commands/process-outbox.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import {
  setupTestDb,
  teardownTestDb,
  clearTestDb,
  isDatabaseAvailable,
} from '@eurocomply/database';
import { OutboxEvent, OutboxStatus, Organization } from '@eurocomply/database';
import { processOutbox } from './process-outbox.js';
import { createId } from '@paralleldrive/cuid2';

describe('processOutbox integration', () => {
  let orm: MikroORM;
  let dbAvailable: boolean;

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (!dbAvailable) {
      console.log('Database not available, skipping integration tests');
      return;
    }
    orm = await setupTestDb();
  });

  afterAll(async () => {
    if (orm) {
      await teardownTestDb();
    }
  });

  beforeEach(async () => {
    if (!dbAvailable) return;
    const em = orm.em.fork();
    await clearTestDb(em);
  });

  it('should process pending events in public schema', async () => {
    if (!dbAvailable) return;

    // Arrange
    const em = orm.em.fork();
    const event = em.create(OutboxEvent, {
      id: createId(),
      aggregateType: 'Organization',
      aggregateId: 'org_123',
      eventType: 'organization.provisioned',
      payload: { organizationId: 'org_123', schemaName: 'tenant_test', name: 'Test' },
      status: OutboxStatus.PENDING,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await em.persistAndFlush(event);

    // Act - run once
    await processOutbox({ once: true });

    // Assert
    em.clear();
    const processed = await em.findOneOrFail(OutboxEvent, event.id);
    expect(processed.status).toBe(OutboxStatus.COMPLETED);
    expect(processed.processedAt).toBeDefined();
  });

  it('should process events across multiple organizations', async () => {
    if (!dbAvailable) return;

    // Arrange - create org with tenant schema
    const em = orm.em.fork();
    const org = em.create(Organization, {
      id: createId(),
      name: 'Test Org',
      slug: 'test-org-' + Date.now(),
      schemaName: 'tenant_integration_test',
      status: 'READY',
      clerkOrgId: 'clerk_' + createId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await em.persistAndFlush(org);

    // Create tenant schema
    await em.execute(`CREATE SCHEMA IF NOT EXISTS "${org.schemaName}"`);
    await em.execute(`
      CREATE TABLE IF NOT EXISTS "${org.schemaName}".outbox_event (
        id TEXT PRIMARY KEY,
        aggregate_type TEXT NOT NULL,
        aggregate_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        retry_count INTEGER NOT NULL DEFAULT 0,
        processed_at TIMESTAMPTZ,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Create event in tenant schema
    const tenantEm = orm.em.fork({ schema: org.schemaName });
    const tenantEvent = tenantEm.create(OutboxEvent, {
      id: createId(),
      aggregateType: 'User',
      aggregateId: 'user_123',
      eventType: 'user.joined_organization',
      payload: { userId: 'user_123', organizationId: org.id },
      status: OutboxStatus.PENDING,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await tenantEm.persistAndFlush(tenantEvent);

    // Act
    await processOutbox({ once: true });

    // Assert
    tenantEm.clear();
    const processed = await tenantEm.findOneOrFail(OutboxEvent, tenantEvent.id);
    expect(processed.status).toBe(OutboxStatus.COMPLETED);

    // Cleanup
    await em.execute(`DROP SCHEMA IF EXISTS "${org.schemaName}" CASCADE`);
  });
});
```

### Step 7.3: Run integration test

Run: `cd apps/worker && npm run test`

Expected: PASS (or skip if DB not available)

### Step 7.4: Commit

```bash
git add apps/worker/vitest.config.ts \
        apps/worker/src/commands/process-outbox.integration.test.ts
git commit -m "test(worker): add integration tests for outbox processing

Tests end-to-end flow:
- Processing public schema events
- Processing events across multiple tenant schemas

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Update Root Package and Documentation

**Files:**
- Modify: `package.json` (root)
- Modify: `turbo.json`

### Step 8.1: Update root package.json

Add to scripts:

```json
"worker": "turbo run dev --filter=@eurocomply/worker",
"worker:once": "cd apps/worker && node --env-file=../../.env --import tsx src/index.ts outbox --once"
```

### Step 8.2: Update turbo.json

Add worker to the pipeline if needed (check existing config first).

### Step 8.3: Run full test suite

Run: `npm run test`

Expected: All tests pass

### Step 8.4: Commit

```bash
git add package.json turbo.json
git commit -m "chore: add worker scripts to root package.json

Adds convenience scripts:
- npm run worker: start continuous polling
- npm run worker:once: single processing run

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Summary

| Task | Description | Estimated Steps |
|------|-------------|-----------------|
| 1 | OutboxProcessorService core methods | 15 |
| 2 | Tenant schema discovery | 5 |
| 3 | Event handler registry | 7 |
| 4 | processEvent method | 5 |
| 5 | Batch processing methods | 9 |
| 6 | Worker CLI app | 7 |
| 7 | Integration tests | 4 |
| 8 | Root config updates | 4 |

**Total commits:** 8
**Key files created:** 12
**Key files modified:** 4

---

Plan complete and saved to `docs/plans/2026-01-24-outbox-worker.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
