# Event System Design

**Status:** Draft
**Date:** 2026-01-15
**Source:** EVENT_SCHEMA.md, DATA_SOVEREIGNTY.md

---

## 1. Overview

EuroComply uses domain events for async processing, cross-service communication, and maintaining eventually consistent views. Events are critical for decoupling services and enabling audit trails.

### Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Transactional outbox** | Events stored in same transaction as data |
| **At-least-once delivery** | Consumers must be idempotent |
| **Ordered per-aggregate** | Events for same entity in order |
| **Schema versioned** | Breaking changes get new version |
| **Auditable** | Every event traceable |

---

## 2. Why Transactional Outbox

### The Dual-Write Problem

```
BAD: Direct publishing
┌─────────────┐     ┌─────────────┐
│  Update DB  │────▶│ Publish Event│
└─────────────┘     └─────────────┘
       │                   │
       ▼                   ▼
   Success?             Success?

If DB succeeds but publish fails: INCONSISTENT STATE
```

### Our Solution: Outbox Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRANSACTIONAL OUTBOX                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SINGLE TRANSACTION:                                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  BEGIN TRANSACTION                                        │   │
│  │  1. UPDATE products SET name = 'New Name'                │   │
│  │  2. INSERT INTO outbox_events (type, payload, ...)       │   │
│  │  COMMIT                                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Both succeed or both fail. ATOMIC.                             │
│                                                                  │
│  ASYNC PROCESSOR:                                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Poll outbox_events WHERE processed_at IS NULL           │   │
│  │  Publish to consumers                                     │   │
│  │  Mark processed_at = NOW()                               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Why Not Kafka/SQS Direct?

| Approach | Consistency | Complexity | Our Choice |
|----------|-------------|------------|------------|
| Direct publish | Weak | Low | ❌ |
| Saga/2PC | Strong | High | ❌ Over-engineering |
| Outbox + polling | Strong | Medium | ✅ |
| CDC (Debezium) | Strong | High | 📋 Future option |

Outbox is the right balance for our scale and complexity.

---

## 3. Outbox Schema

```sql
CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Event identification
    aggregate VARCHAR(50) NOT NULL,      -- 'product', 'passport', 'batch'
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,    -- 'product.created', 'dpp.issued'
    version VARCHAR(10) NOT NULL,        -- '1.0', '1.1', '2.0'

    -- Payload
    payload JSONB NOT NULL,

    -- Tenant context
    organization_id UUID NOT NULL,

    -- Tracing
    correlation_id UUID,
    causation_id UUID,

    -- Processing state
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,

    -- Indexes
    INDEX idx_outbox_unprocessed (created_at)
        WHERE processed_at IS NULL,
    INDEX idx_outbox_aggregate (aggregate, aggregate_id, created_at)
);
```

---

## 4. Event Envelope

### Standard Structure

```typescript
interface DomainEvent<T = unknown> {
  // Envelope (all events)
  id: string;                    // UUID v7 (time-ordered)
  type: string;                  // 'product.created'
  version: string;               // '1.0'
  organizationId: string;
  timestamp: string;             // ISO 8601
  correlationId?: string;        // Request tracing
  causationId?: string;          // Event that caused this

  // Payload (event-specific)
  payload: T;

  // Metadata (optional)
  metadata?: {
    userId?: string;
    source?: string;
    ipAddress?: string;
  };
}
```

### Why UUID v7

- **Time-ordered** - Natural sorting by creation time
- **Unique** - No collision risk
- **K-sortable** - Efficient range queries
- **Standard** - RFC 9562

---

## 5. Event Categories

### Product Events

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `product.created` | New product | Search index, Analytics |
| `product.updated` | Product modified | Search index, Webhooks |
| `product.deleted` | Product archived | Search index, Cleanup |

### Version Control Events

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `version.checked_out` | User starts editing | Conflict detection |
| `version.checked_in` | User saves version | Audit, Notifications |
| `version.released` | Version approved | DPP eligibility |
| `checkout.expired` | Auto-release | Notifications |

### DPP Events

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `dpp.approved` | Compliance approval | VC issuer |
| `dpp.issued` | VC signed | R2 publisher, Webhooks |
| `dpp.revoked` | DPP revoked | Status list, Webhooks |

### Attestation Events

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `attestation.requested` | Request created | Email service |
| `attestation.submitted` | Contributor submits | Notifications |
| `attestation.approved` | Customer approves | Product enrichment |

---

## 6. Event Versioning Strategy

### Semantic Versioning for Events

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| New optional field | Minor (1.0 → 1.1) | Add `tags` field |
| Field rename | Major (1.x → 2.0) | `name` → `productName` |
| Field removal | Major (1.x → 2.0) | Remove `legacy` field |
| Type change | Major (1.x → 2.0) | `quantity: string` → `number` |

### Consumer Compatibility

```typescript
// Consumer handles multiple versions
function handleProductCreated(event: DomainEvent) {
  switch (event.version) {
    case '1.0':
      // Original schema
      processV1(event.payload);
      break;
    case '2.0':
      // New schema with renamed fields
      processV2(event.payload);
      break;
    default:
      // Unknown version - log and skip
      logger.warn(`Unknown event version: ${event.version}`);
  }
}
```

### Deprecation Timeline

| Phase | Duration | Action |
|-------|----------|--------|
| New version released | Day 0 | Both versions published |
| Migration period | 90 days | Consumers update |
| Old version deprecated | Day 90 | Warning logs |
| Old version removed | Day 180 | Only new version |

---

## 7. Event Processing

### Outbox Processor

```
┌─────────────────────────────────────────────────────────────────┐
│                    OUTBOX PROCESSOR                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  POLL INTERVAL: 100ms                                           │
│  BATCH SIZE: 100 events                                         │
│  ORDERING: Per aggregate (events for same product in order)     │
│                                                                  │
│  FLOW:                                                          │
│  1. SELECT * FROM outbox_events                                 │
│     WHERE processed_at IS NULL                                  │
│     ORDER BY aggregate, aggregate_id, created_at                │
│     LIMIT 100                                                   │
│                                                                  │
│  2. Group by aggregate_id (preserve order within group)         │
│                                                                  │
│  3. For each event:                                             │
│     - Dispatch to consumers                                     │
│     - On success: SET processed_at = NOW()                      │
│     - On failure: INCREMENT retry_count, SET last_error         │
│                                                                  │
│  4. Dead letter after 10 retries                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Retry Policy

| Attempt | Delay | Total Time |
|---------|-------|------------|
| 1 | Immediate | 0 |
| 2 | 1 min | 1 min |
| 3 | 5 min | 6 min |
| 4 | 15 min | 21 min |
| 5 | 30 min | 51 min |
| 6-10 | 1 hour each | ~6 hours |
| Dead letter | - | After 10 |

---

## 8. Consumer Patterns

### Idempotent Consumers

```typescript
// Consumers MUST be idempotent
async function handleProductCreated(event: DomainEvent) {
  // Check if already processed
  const existing = await redis.get(`processed:${event.id}`);
  if (existing) {
    return; // Already handled
  }

  // Process event
  await searchIndex.indexProduct(event.payload);

  // Mark as processed (24h TTL)
  await redis.setex(`processed:${event.id}`, 86400, 'done');
}
```

### Why Idempotency Required

- **At-least-once delivery** - Events may be delivered multiple times
- **Processor restarts** - May re-process after crash
- **Network issues** - Acknowledgment may fail

---

## 9. Event Consumers

| Consumer | Events | Purpose |
|----------|--------|---------|
| **Search Indexer** | product.*, dpp.* | Update PostgreSQL FTS |
| **Webhook Dispatcher** | All (filtered) | External notifications |
| **Analytics** | All | Usage tracking |
| **Notification Service** | attestation.*, checkout.* | User notifications |
| **R2 Publisher** | dpp.issued | Static file generation |
| **Status List Updater** | dpp.revoked | Update Status List 2021 |

---

## 10. Monitoring & Observability

### Key Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| `outbox_lag_seconds` | > 60s |
| `outbox_unprocessed_count` | > 1000 |
| `outbox_retry_rate` | > 5% |
| `outbox_dead_letter_count` | > 0 |
| `event_processing_duration_p99` | > 5s |

### Dead Letter Handling

```sql
-- Dead letter queue (separate table)
CREATE TABLE outbox_dead_letter (
    id UUID PRIMARY KEY,
    original_event JSONB NOT NULL,
    failed_at TIMESTAMPTZ NOT NULL,
    retry_count INTEGER NOT NULL,
    last_error TEXT NOT NULL,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID
);
```

---

## 11. Retention & Cleanup

| Data | Retention | Reason |
|------|-----------|--------|
| Processed events | 7 days | Replay capability |
| Dead letter | 90 days | Investigation |
| Event logs | 1 year | Audit |

### Cleanup Job

```sql
-- Daily cleanup of processed events
DELETE FROM outbox_events
WHERE processed_at < NOW() - INTERVAL '7 days';
```

---

## 12. Related Documents

| Document | Purpose |
|----------|---------|
| [Event Schema](../EVENT_SCHEMA.md) | Full event type definitions |
| [Data Sovereignty Design](./2026-01-15-data-sovereignty-design.md) | Outbox pattern context |
| [Service Layer](../SERVICE_LAYER.md) | Event emission in services |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-01-15 | Initial draft from EVENT_SCHEMA.md |
