# Event Schema & Versioning

## Overview

EuroComply uses domain events for async processing, cross-service communication, and maintaining eventually consistent views. This document defines the event schema standards and versioning strategy for scale.

---

## Event Structure

All events follow a standard envelope with versioning:

```typescript
/**
 * Base event envelope - all events extend this
 */
interface DomainEvent<T = unknown> {
  // ══════════════════════════════════════════════════════════════════════════
  // ENVELOPE (Standard for all events)
  // ══════════════════════════════════════════════════════════════════════════

  /** Unique event ID (UUID v7 for time-ordering) */
  id: string;

  /** Event type (e.g., 'product.created', 'dpp.issued') */
  type: string;

  /** Schema version (semver: '1.0', '1.1', '2.0') */
  version: string;

  /** Tenant context */
  organizationId: string;

  /** When the event occurred (ISO 8601) */
  timestamp: string;

  /** Correlation ID for request tracing */
  correlationId?: string;

  /** Causation ID (event that caused this event) */
  causationId?: string;

  // ══════════════════════════════════════════════════════════════════════════
  // PAYLOAD (Event-specific data)
  // ══════════════════════════════════════════════════════════════════════════

  /** Event-specific payload */
  payload: T;

  // ══════════════════════════════════════════════════════════════════════════
  // METADATA (Optional context)
  // ══════════════════════════════════════════════════════════════════════════

  metadata?: {
    /** User who triggered the event */
    userId?: string;

    /** Source service */
    source?: string;

    /** Request IP (for audit) */
    ipAddress?: string;
  };
}
```

---

## Event Categories

### Product Events

```typescript
// ══════════════════════════════════════════════════════════════════════════════
// PRODUCT LIFECYCLE EVENTS
// ══════════════════════════════════════════════════════════════════════════════

interface ProductCreatedEvent extends DomainEvent<{
  productId: string;
  name: string;
  gtin?: string;
  sku?: string;
  category?: string;
}> {
  type: 'product.created';
  version: '1.0';
}

interface ProductUpdatedEvent extends DomainEvent<{
  productId: string;
  changes: Array<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
}> {
  type: 'product.updated';
  version: '1.0';
}

interface ProductDeletedEvent extends DomainEvent<{
  productId: string;
  deletedBy: string;
  reason?: string;
}> {
  type: 'product.deleted';
  version: '1.0';
}
```

### Version Control Events

```typescript
// ══════════════════════════════════════════════════════════════════════════════
// VERSION CONTROL EVENTS
// ══════════════════════════════════════════════════════════════════════════════

interface VersionCheckedOutEvent extends DomainEvent<{
  productId: string;
  versionId: string;
  workspace: 'design' | 'marketing';
  checkedOutBy: string;
  expiresAt: string;
}> {
  type: 'version.checked_out';
  version: '1.0';
}

interface VersionCheckedInEvent extends DomainEvent<{
  productId: string;
  versionId: string;
  workspace: 'design' | 'marketing';
  versionNumber: number;
  checkedInBy: string;
  changeDescription?: string;
}> {
  type: 'version.checked_in';
  version: '1.0';
}

interface VersionReleasedEvent extends DomainEvent<{
  productId: string;
  versionId: string;
  workspace: 'design' | 'marketing';
  versionNumber: number;
  releasedBy: string;
  releaseType: 'released_to_ops' | 'released_for_dpp';
}> {
  type: 'version.released';
  version: '1.0';
}

interface CheckoutExpiredEvent extends DomainEvent<{
  productId: string;
  workspace: 'design' | 'marketing';
  previousHolder: string;
  expiredAt: string;
}> {
  type: 'checkout.expired';
  version: '1.0';
}
```

### Batch Events

```typescript
// ══════════════════════════════════════════════════════════════════════════════
// BATCH/OPERATIONS EVENTS
// ══════════════════════════════════════════════════════════════════════════════

interface BatchCreatedEvent extends DomainEvent<{
  batchId: string;
  batchNumber: string;
  productId: string;
  designVersionId: string;
  quantity: number;
}> {
  type: 'batch.created';
  version: '1.0';
}

interface BatchCommittedEvent extends DomainEvent<{
  batchId: string;
  committedBy: string;
  designVersionId: string;
  quantity: number;
}> {
  type: 'batch.committed';
  version: '1.0';
}

interface BatchStatusChangedEvent extends DomainEvent<{
  batchId: string;
  previousStatus: string;
  newStatus: string;
  changedBy: string;
}> {
  type: 'batch.status_changed';
  version: '1.0';
}
```

### DPP Events

```typescript
// ══════════════════════════════════════════════════════════════════════════════
// DPP/PASSPORT EVENTS
// ══════════════════════════════════════════════════════════════════════════════

interface DPPSnapshotCreatedEvent extends DomainEvent<{
  snapshotId: string;
  batchId: string;
  designVersionId: string;
  marketingVersionId?: string;
  attestationCount: number;
}> {
  type: 'dpp.snapshot_created';
  version: '1.0';
}

interface DPPIssuedEvent extends DomainEvent<{
  passportId: string;
  snapshotId: string;
  batchId: string;
  vcId: string;
  issuedBy: string;
  expiresAt: string;
}> {
  type: 'dpp.issued';
  version: '1.0';
}

interface DPPRevokedEvent extends DomainEvent<{
  passportId: string;
  vcId: string;
  revokedBy: string;
  reason: string;
  supersededBy?: string;  // New DPP ID if reissued
}> {
  type: 'dpp.revoked';
  version: '1.0';
}

interface DPPAccessedEvent extends DomainEvent<{
  passportId: string;
  accessType: 'qr_scan' | 'api_lookup' | 'widget_embed';
  accessorType: 'consumer' | 'retailer' | 'regulator' | 'anonymous';
  accessorId?: string;
}> {
  type: 'dpp.accessed';
  version: '1.0';
}
```

### Attestation Events

```typescript
// ══════════════════════════════════════════════════════════════════════════════
// ATTESTATION EVENTS
// ══════════════════════════════════════════════════════════════════════════════

interface AttestationRequestedEvent extends DomainEvent<{
  requestId: string;
  productId: string;
  contributorId: string;
  attestationType: string;
  requestedBy: string;
}> {
  type: 'attestation.requested';
  version: '1.0';
}

interface AttestationSubmittedEvent extends DomainEvent<{
  attestationId: string;
  requestId?: string;
  productId: string;
  contributorDid: string;
  attestationType: string;
  vcId: string;
}> {
  type: 'attestation.submitted';
  version: '1.0';
}

interface AttestationVerifiedEvent extends DomainEvent<{
  attestationId: string;
  vcId: string;
  signatureValid: boolean;
  verifiedAt: string;
}> {
  type: 'attestation.verified';
  version: '1.0';
}
```

---

## Schema Evolution Strategy

### Versioning Rules

| Change Type | Version Bump | Backwards Compatible |
|-------------|--------------|---------------------|
| Add optional field | Minor (1.0 → 1.1) | Yes |
| Rename field | Major (1.x → 2.0) | No |
| Remove field | Major (1.x → 2.0) | No |
| Change field type | Major (1.x → 2.0) | No |
| Add required field | Major (1.x → 2.0) | No |

### Evolution Examples

**Adding Optional Field (Backwards Compatible):**

```typescript
// Version 1.0
interface ProductCreatedEvent_v1_0 {
  type: 'product.created';
  version: '1.0';
  payload: {
    productId: string;
    name: string;
    gtin?: string;
  };
}

// Version 1.1 - Added optional 'category' field
interface ProductCreatedEvent_v1_1 {
  type: 'product.created';
  version: '1.1';
  payload: {
    productId: string;
    name: string;
    gtin?: string;
    category?: string;  // NEW: Optional, backwards compatible
  };
}

// Consumers of 1.0 continue to work - they ignore 'category'
```

**Breaking Change (Major Version):**

```typescript
// Version 1.x - Single batch ID
interface DPPIssuedEvent_v1 {
  type: 'dpp.issued';
  version: '1.0';
  payload: {
    passportId: string;
    batchId: string;  // Single batch
    vcId: string;
  };
}

// Version 2.0 - Multiple batches (breaking change)
interface DPPIssuedEvent_v2 {
  type: 'dpp.issued';
  version: '2.0';
  payload: {
    passportId: string;
    batchIds: string[];  // BREAKING: Changed from single to array
    vcId: string;
  };
}

// Requires migration: run both versions in parallel during transition
```

### Multi-Version Support

```typescript
// Event handler that supports multiple versions
class ProductEventHandler {
  async handle(event: DomainEvent): Promise<void> {
    if (event.type !== 'product.created') return;

    switch (event.version) {
      case '1.0':
        await this.handleV1_0(event as ProductCreatedEvent_v1_0);
        break;
      case '1.1':
        await this.handleV1_1(event as ProductCreatedEvent_v1_1);
        break;
      case '2.0':
        await this.handleV2_0(event as ProductCreatedEvent_v2_0);
        break;
      default:
        // Unknown version - log warning, don't crash
        logger.warn('Unknown event version', {
          type: event.type,
          version: event.version,
        });
    }
  }

  private async handleV1_0(event: ProductCreatedEvent_v1_0): Promise<void> {
    // Handle 1.0 format
  }

  private async handleV1_1(event: ProductCreatedEvent_v1_1): Promise<void> {
    // Handle 1.1 format (superset of 1.0)
  }
}
```

---

## Event Storage (Outbox Pattern)

Events are stored in the transactional outbox before publishing:

```sql
-- event_outbox table (in tenant schema)
CREATE TABLE event_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,

    -- Event envelope
    event_type TEXT NOT NULL,
    event_version TEXT NOT NULL,
    payload JSONB NOT NULL,

    -- Metadata
    correlation_id UUID,
    causation_id UUID,
    metadata JSONB DEFAULT '{}',

    -- Processing state
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending',    -- Waiting to be published
        'processing', -- Being published
        'published',  -- Successfully published to SQS
        'failed'      -- Publishing failed
    )),
    published_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for outbox processor
CREATE INDEX idx_event_outbox_pending
    ON event_outbox(created_at)
    WHERE status = 'pending';

CREATE INDEX idx_event_outbox_failed
    ON event_outbox(failed_at)
    WHERE status = 'failed' AND retry_count < max_retries;
```

### Outbox Processor

```typescript
// Background job: publish pending events to SQS
async function processOutbox(): Promise<void> {
  const events = await prisma.$queryRaw<OutboxEvent[]>`
    SELECT * FROM event_outbox
    WHERE status = 'pending'
    ORDER BY created_at
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  `;

  for (const event of events) {
    try {
      // Update to processing
      await prisma.eventOutbox.update({
        where: { id: event.id },
        data: { status: 'processing' },
      });

      // Publish to SQS
      await sqs.sendMessage({
        QueueUrl: EVENTS_QUEUE_URL,
        MessageBody: JSON.stringify({
          id: event.id,
          type: event.eventType,
          version: event.eventVersion,
          organizationId: event.organizationId,
          payload: event.payload,
          correlationId: event.correlationId,
          timestamp: event.createdAt.toISOString(),
          metadata: event.metadata,
        }),
        MessageGroupId: event.organizationId,  // FIFO ordering per tenant
        MessageDeduplicationId: event.id,
      });

      // Mark as published
      await prisma.eventOutbox.update({
        where: { id: event.id },
        data: {
          status: 'published',
          publishedAt: new Date(),
        },
      });
    } catch (error) {
      // Mark as failed
      await prisma.eventOutbox.update({
        where: { id: event.id },
        data: {
          status: 'failed',
          failedAt: new Date(),
          errorMessage: error.message,
          retryCount: { increment: 1 },
        },
      });
    }
  }
}
```

---

## Event Consumption

### Consumer Registration

```typescript
// Event consumer registry
class EventConsumerRegistry {
  private consumers: Map<string, EventConsumer[]> = new Map();

  register(eventType: string, consumer: EventConsumer): void {
    const existing = this.consumers.get(eventType) || [];
    this.consumers.set(eventType, [...existing, consumer]);
  }

  async dispatch(event: DomainEvent): Promise<void> {
    const consumers = this.consumers.get(event.type) || [];

    // All consumers process in parallel
    await Promise.all(
      consumers.map((consumer) =>
        consumer.handle(event).catch((error) => {
          // Log but don't fail other consumers
          logger.error('Consumer failed', {
            eventId: event.id,
            eventType: event.type,
            consumer: consumer.name,
            error: error.message,
          });
        })
      )
    );
  }
}

// Register consumers
registry.register('product.created', new ProductSearchIndexer());
registry.register('product.created', new ProductAnalyticsRecorder());
registry.register('dpp.issued', new DPPMetricsRecorder());
registry.register('dpp.issued', new WebhookNotifier());
```

### Idempotent Consumers

```typescript
// Consumer that tracks processed events to ensure idempotency
abstract class IdempotentConsumer implements EventConsumer {
  abstract name: string;

  async handle(event: DomainEvent): Promise<void> {
    const processedKey = `processed:${this.name}:${event.id}`;

    // Check if already processed
    const alreadyProcessed = await redis.get(processedKey);
    if (alreadyProcessed) {
      logger.info('Event already processed, skipping', {
        eventId: event.id,
        consumer: this.name,
      });
      return;
    }

    // Process the event
    await this.process(event);

    // Mark as processed (with TTL for cleanup)
    await redis.setex(processedKey, 86400 * 7, 'true'); // 7 days
  }

  abstract process(event: DomainEvent): Promise<void>;
}
```

---

## Event Schema Registry

For production, maintain a schema registry:

```typescript
// schemas/product.created.v1.0.json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://eurocomply.eu/schemas/events/product.created.v1.0.json",
  "type": "object",
  "required": ["id", "type", "version", "organizationId", "timestamp", "payload"],
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "type": { "const": "product.created" },
    "version": { "const": "1.0" },
    "organizationId": { "type": "string", "format": "uuid" },
    "timestamp": { "type": "string", "format": "date-time" },
    "payload": {
      "type": "object",
      "required": ["productId", "name"],
      "properties": {
        "productId": { "type": "string", "format": "uuid" },
        "name": { "type": "string", "minLength": 1 },
        "gtin": { "type": "string", "pattern": "^[0-9]{8,14}$" },
        "sku": { "type": "string" },
        "category": { "type": "string" }
      }
    }
  }
}
```

### Schema Validation

```typescript
// Validate events against schema before publishing
class EventValidator {
  private schemas: Map<string, JSONSchema> = new Map();

  async validate(event: DomainEvent): Promise<ValidationResult> {
    const schemaKey = `${event.type}.v${event.version}`;
    const schema = await this.getSchema(schemaKey);

    if (!schema) {
      return {
        valid: false,
        errors: [`No schema found for ${schemaKey}`],
      };
    }

    const ajv = new Ajv();
    const validate = ajv.compile(schema);
    const valid = validate(event);

    return {
      valid,
      errors: valid ? [] : validate.errors?.map((e) => e.message) || [],
    };
  }
}
```

---

## Dead Letter Queue

Failed events go to DLQ for investigation:

```typescript
// DLQ handler for manual review
async function processDLQ(): Promise<void> {
  const messages = await sqs.receiveMessage({
    QueueUrl: EVENTS_DLQ_URL,
    MaxNumberOfMessages: 10,
  });

  for (const message of messages.Messages || []) {
    const event = JSON.parse(message.Body!);

    // Log for investigation
    await prisma.dlqEvent.create({
      data: {
        eventId: event.id,
        eventType: event.type,
        eventVersion: event.version,
        organizationId: event.organizationId,
        payload: event.payload,
        failureReason: message.Attributes?.DeadLetterQueueSourceArn,
        receivedAt: new Date(),
      },
    });

    // Alert on-call if critical event
    if (CRITICAL_EVENT_TYPES.includes(event.type)) {
      await alerting.page({
        severity: 'high',
        message: `Critical event in DLQ: ${event.type}`,
        eventId: event.id,
      });
    }
  }
}
```

---

## Summary

| Aspect | Approach |
|--------|----------|
| **Envelope** | Standard structure with version field |
| **Versioning** | Semantic versioning (major.minor) |
| **Storage** | Transactional outbox pattern |
| **Delivery** | SQS FIFO for ordering guarantees |
| **Consumption** | Idempotent consumers with dedup tracking |
| **Evolution** | Multi-version handlers during migration |
| **Validation** | JSON Schema registry |
| **Failures** | DLQ with alerting for critical events |
