# Segment 06: AI Infrastructure

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement AI-native infrastructure with pgvector embeddings for semantic search, RAG document processing, AI interaction logging, agent sessions, and usage limits for cost control.

**Architecture:** pgvector extension in tenant database stores embeddings. AI interactions are logged for audit and cost tracking. Agent sessions persist memory across turns. Usage limits enforce per-tenant quotas for freemium model.

**Tech Stack:** PostgreSQL 15 + pgvector, OpenAI embeddings API, TypeScript

---

## Prerequisites

- Segment 03 completed (Tenant database with pgvector extension)
- OpenAI API key for embedding generation
- Understanding of RAG (Retrieval Augmented Generation) patterns

---

## Task 1: Create Embedding Entity

**Files:**
- Create: `/root/Documents/EuroComply/packages/database/src/entities/Embedding.ts`
- Create: `/root/Documents/EuroComply/packages/database/src/entities/Embedding.test.ts`

**Step 1: Write failing test for Embedding entity**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb } from '../test-utils.js';
import { Tenant } from './Tenant.js';
import { Embedding } from './Embedding.js';

describe('Embedding Entity', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let testTenant: Tenant;

  beforeAll(async () => {
    orm = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    em = orm.em.fork();
    await em.nativeDelete(Embedding, {});
    await em.nativeDelete(Tenant, {});

    testTenant = em.create(Tenant, {
      externalId: 'org_test',
      name: 'Test',
      slug: 'test',
    });
    await em.persistAndFlush(testTenant);
    em.clear();
  });

  describe('embedding storage', () => {
    it('should_store_vector_embedding_for_entity', async () => {
      testTenant = await em.findOneOrFail(Tenant, { id: testTenant.id });

      // Create a mock 1536-dimensional vector (OpenAI ada-002 size)
      const mockVector = Array(1536).fill(0).map(() => Math.random());

      const embedding = em.create(Embedding, {
        tenant: testTenant,
        entityType: 'product',
        entityId: 'product-uuid-here',
        embedding: mockVector,
        contentHash: 'sha256-of-content',
        contentPreview: 'Test product description...',
        model: 'text-embedding-ada-002',
        modelVersion: '2',
      });

      await em.persistAndFlush(embedding);

      expect(embedding.id).toBeDefined();
      expect(embedding.embedding).toHaveLength(1536);
    });

    it('should_allow_null_tenant_for_gsr_embeddings', async () => {
      const mockVector = Array(1536).fill(0.1);

      const embedding = em.create(Embedding, {
        tenant: null, // GSR embedding - no tenant
        entityType: 'substance',
        entityId: 'substance-uuid',
        embedding: mockVector,
        contentHash: 'hash123',
        model: 'text-embedding-ada-002',
      });

      await em.persistAndFlush(embedding);

      expect(embedding.id).toBeDefined();
    });

    it('should_support_chunked_embeddings', async () => {
      testTenant = await em.findOneOrFail(Tenant, { id: testTenant.id });
      const mockVector = Array(1536).fill(0.5);

      // Create multiple chunks for same entity
      const chunk0 = em.create(Embedding, {
        tenant: testTenant,
        entityType: 'document',
        entityId: 'doc-uuid',
        embedding: mockVector,
        contentHash: 'hash-0',
        model: 'text-embedding-ada-002',
        chunkIndex: 0,
        chunkTotal: 3,
      });

      const chunk1 = em.create(Embedding, {
        tenant: testTenant,
        entityType: 'document',
        entityId: 'doc-uuid',
        embedding: mockVector,
        contentHash: 'hash-1',
        model: 'text-embedding-ada-002',
        chunkIndex: 1,
        chunkTotal: 3,
      });

      await em.persistAndFlush([chunk0, chunk1]);

      expect(chunk0.chunkIndex).toBe(0);
      expect(chunk1.chunkIndex).toBe(1);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/database && pnpm test src/entities/Embedding.test.ts`
Expected: FAIL

**Step 3: Create Embedding entity**

```typescript
import {
  Entity,
  Property,
  PrimaryKey,
  ManyToOne,
  Index,
  Unique,
  type Rel,
} from '@mikro-orm/core';
import { Tenant } from './Tenant.js';

/**
 * Embedding: Vector embedding for semantic search and RAG.
 *
 * Stores:
 * - Tenant-scoped embeddings (products, materials, documents)
 * - GSR embeddings (substances, regulations) - tenant = null
 *
 * Uses pgvector for efficient similarity search.
 */
@Entity({ tableName: 'embeddings' })
@Unique({
  properties: ['tenant', 'entityType', 'entityId', 'chunkIndex'],
  name: 'uq_embedding',
})
export class Embedding {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  /**
   * NULL for GSR embeddings (shared across tenants).
   */
  @ManyToOne(() => Tenant, { nullable: true, onDelete: 'cascade' })
  @Index({ name: 'idx_embedding_tenant' })
  tenant?: Rel<Tenant> | null;

  /**
   * Type of entity this embedding represents.
   * e.g., 'product', 'material', 'substance', 'document', 'regulation'
   */
  @Property({ type: 'varchar', length: 50 })
  @Index({ name: 'idx_embedding_entity_type' })
  entityType!: string;

  /**
   * ID of the source entity.
   */
  @Property({ type: 'uuid' })
  @Index({ name: 'idx_embedding_entity' })
  entityId!: string;

  /**
   * The vector embedding (1536 dimensions for ada-002).
   * Uses pgvector type.
   *
   * Note: MikroORM doesn't have native pgvector support,
   * so we store as raw type and handle in migrations/queries.
   */
  @Property({ type: 'json' }) // Will be vector(1536) in migration
  embedding!: number[];

  /**
   * SHA256 hash of the content that was embedded.
   * Used to detect when re-embedding is needed.
   */
  @Property({ type: 'varchar', length: 64 })
  contentHash!: string;

  /**
   * Preview of the embedded content for debugging.
   */
  @Property({ type: 'text', nullable: true })
  contentPreview?: string | null;

  /**
   * Model used to generate embedding.
   */
  @Property({ type: 'varchar', length: 50 })
  model!: string;

  /**
   * Model version for reproducibility.
   */
  @Property({ type: 'varchar', length: 20, nullable: true })
  modelVersion?: string | null;

  /**
   * For chunked documents, which chunk this is (0-indexed).
   */
  @Property({ type: 'integer', nullable: true })
  chunkIndex?: number | null;

  /**
   * Total number of chunks for this entity.
   */
  @Property({ type: 'integer', nullable: true })
  chunkTotal?: number | null;

  @Property({ type: 'timestamptz', defaultRaw: 'NOW()' })
  createdAt: Date = new Date();
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/database && pnpm test src/entities/Embedding.test.ts`
Expected: PASS (may need migration with vector type)

**Step 5: Commit**

```bash
git add packages/database/src/entities/Embedding.ts packages/database/src/entities/Embedding.test.ts
git commit -m "feat(database): add Embedding entity for vector storage

Embedding stores pgvector embeddings for semantic search:
- Tenant-scoped (products, documents)
- GSR-scoped (substances, regulations) when tenant is null
- Chunked embeddings for long documents
- Content hash for change detection

Uses OpenAI ada-002 (1536 dimensions).

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create RAG Document Entities

**Files:**
- Create: `/root/Documents/EuroComply/packages/database/src/entities/RagDocument.ts`
- Create: `/root/Documents/EuroComply/packages/database/src/entities/RagChunk.ts`
- Create: `/root/Documents/EuroComply/packages/database/src/entities/RagDocument.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb } from '../test-utils.js';
import { Tenant } from './Tenant.js';
import { RagDocument, RagDocumentStatus, ContentType } from './RagDocument.js';
import { RagChunk } from './RagChunk.js';

describe('RagDocument Entity', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let testTenant: Tenant;

  beforeAll(async () => {
    orm = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    em = orm.em.fork();
    await em.nativeDelete(RagChunk, {});
    await em.nativeDelete(RagDocument, {});
    await em.nativeDelete(Tenant, {});

    testTenant = em.create(Tenant, {
      externalId: 'org_test',
      name: 'Test',
      slug: 'test',
    });
    await em.persistAndFlush(testTenant);
    em.clear();
  });

  describe('document processing', () => {
    it('should_create_document_with_pending_status', async () => {
      testTenant = await em.findOneOrFail(Tenant, { id: testTenant.id });

      const doc = em.create(RagDocument, {
        tenant: testTenant,
        sourceType: 'upload',
        sourceId: 'upload-123',
        title: 'Product Safety Report.pdf',
        contentType: ContentType.PDF,
        storagePath: 'tenants/test/documents/report.pdf',
        contentHash: 'sha256-of-file',
      });

      await em.persistAndFlush(doc);

      expect(doc.id).toBeDefined();
      expect(doc.processingStatus).toBe(RagDocumentStatus.PENDING);
    });

    it('should_allow_chunks_linked_to_document', async () => {
      testTenant = await em.findOneOrFail(Tenant, { id: testTenant.id });

      const doc = em.create(RagDocument, {
        tenant: testTenant,
        sourceType: 'regulation',
        title: 'EU Cosmetics Regulation',
        contentType: ContentType.PDF,
        contentHash: 'hash123',
        processingStatus: RagDocumentStatus.COMPLETED,
      });
      await em.persistAndFlush(doc);

      const chunk = em.create(RagChunk, {
        document: doc,
        content: 'Article 14: Safety assessment...',
        chunkIndex: 0,
        startPage: 1,
        endPage: 1,
      });
      await em.persistAndFlush(chunk);

      const loaded = await em.findOneOrFail(RagDocument, { id: doc.id }, { populate: ['chunks'] });
      expect(loaded.chunks.length).toBe(1);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/database && pnpm test src/entities/RagDocument.test.ts`
Expected: FAIL

**Step 3: Create RagDocument entity**

```typescript
import {
  Entity,
  Property,
  PrimaryKey,
  ManyToOne,
  Enum,
  Index,
  OneToMany,
  Collection,
  type Rel,
} from '@mikro-orm/core';
import { Tenant } from './Tenant.js';
import { RagChunk } from './RagChunk.js';

export enum RagDocumentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum ContentType {
  PDF = 'PDF',
  HTML = 'HTML',
  TEXT = 'TEXT',
  MARKDOWN = 'MARKDOWN',
}

/**
 * RagDocument: A document for Retrieval Augmented Generation.
 *
 * Documents are:
 * - Uploaded by users (SDS, specifications)
 * - Regulations and guidance
 * - Knowledge base articles
 *
 * Processing pipeline:
 * PENDING → PROCESSING → COMPLETED/FAILED
 */
@Entity({ tableName: 'rag_documents' })
export class RagDocument {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  /**
   * NULL for shared documents (regulations).
   */
  @ManyToOne(() => Tenant, { nullable: true, onDelete: 'cascade' })
  @Index({ name: 'idx_rag_doc_tenant' })
  tenant?: Rel<Tenant> | null;

  /**
   * Source type (upload, regulation, external).
   */
  @Property({ type: 'varchar', length: 50 })
  sourceType!: string;

  /**
   * External source ID for deduplication.
   */
  @Property({ type: 'varchar', length: 100, nullable: true })
  sourceId?: string | null;

  @Property({ type: 'text' })
  title!: string;

  @Enum(() => ContentType)
  contentType!: ContentType;

  /**
   * Path in storage (R2, S3, etc.).
   */
  @Property({ type: 'text', nullable: true })
  storagePath?: string | null;

  /**
   * SHA256 hash of content for change detection.
   */
  @Property({ type: 'varchar', length: 64 })
  contentHash!: string;

  @Enum(() => RagDocumentStatus)
  @Index({ name: 'idx_rag_doc_status' })
  processingStatus: RagDocumentStatus = RagDocumentStatus.PENDING;

  @Property({ type: 'timestamptz', nullable: true })
  processedAt?: Date | null;

  @Property({ type: 'text', nullable: true })
  errorMessage?: string | null;

  @Property({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null;

  @Property({ type: 'timestamptz', defaultRaw: 'NOW()' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', defaultRaw: 'NOW()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  @OneToMany(() => RagChunk, (chunk) => chunk.document)
  chunks = new Collection<RagChunk>(this);
}
```

**Step 4: Create RagChunk entity**

```typescript
import {
  Entity,
  Property,
  PrimaryKey,
  ManyToOne,
  Index,
  type Rel,
} from '@mikro-orm/core';
import { RagDocument } from './RagDocument.js';
import { Embedding } from './Embedding.js';

/**
 * RagChunk: A chunk of a document for embedding.
 *
 * Documents are split into chunks for:
 * - Token limit compliance
 * - Granular retrieval
 * - Better context windows
 */
@Entity({ tableName: 'rag_chunks' })
export class RagChunk {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => RagDocument, { onDelete: 'cascade' })
  @Index({ name: 'idx_rag_chunk_doc' })
  document!: Rel<RagDocument>;

  /**
   * The chunk text content.
   */
  @Property({ type: 'text' })
  content!: string;

  @Property({ type: 'integer' })
  chunkIndex!: number;

  @Property({ type: 'integer', nullable: true })
  startPage?: number | null;

  @Property({ type: 'integer', nullable: true })
  endPage?: number | null;

  @Property({ type: 'integer', nullable: true })
  startChar?: number | null;

  @Property({ type: 'integer', nullable: true })
  endChar?: number | null;

  /**
   * Reference to the embedding for this chunk.
   */
  @ManyToOne(() => Embedding, { nullable: true })
  embedding?: Rel<Embedding> | null;

  @Property({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null;

  @Property({ type: 'timestamptz', defaultRaw: 'NOW()' })
  createdAt: Date = new Date();
}
```

**Step 5: Run test to verify it passes**

Run: `cd packages/database && pnpm test src/entities/RagDocument.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/database/src/entities/RagDocument.ts packages/database/src/entities/RagChunk.ts packages/database/src/entities/RagDocument.test.ts
git commit -m "feat(database): add RagDocument and RagChunk for RAG pipeline

RAG document processing:
- RagDocument: Source documents (PDFs, regulations)
- RagChunk: Document chunks for embedding
- Processing status: PENDING → PROCESSING → COMPLETED

Enables context-aware AI responses with cited sources.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Create AI Interaction Logging

**Files:**
- Create: `/root/Documents/EuroComply/packages/database/src/entities/AiInteraction.ts`
- Create: `/root/Documents/EuroComply/packages/database/src/entities/AiInteraction.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb } from '../test-utils.js';
import { Tenant } from './Tenant.js';
import { AiInteraction, InteractionType, InteractionStatus } from './AiInteraction.js';

describe('AiInteraction Entity', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let testTenant: Tenant;

  beforeAll(async () => {
    orm = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    em = orm.em.fork();
    await em.nativeDelete(AiInteraction, {});
    await em.nativeDelete(Tenant, {});

    testTenant = em.create(Tenant, {
      externalId: 'org_test',
      name: 'Test',
      slug: 'test',
    });
    await em.persistAndFlush(testTenant);
    em.clear();
  });

  describe('interaction logging', () => {
    it('should_log_ai_interaction_with_token_counts', async () => {
      testTenant = await em.findOneOrFail(Tenant, { id: testTenant.id });

      const interaction = em.create(AiInteraction, {
        tenant: testTenant,
        interactionType: InteractionType.CHAT,
        model: 'gpt-4-turbo',
        modelVersion: '2024-01-25',
        requestHash: 'sha256-of-request',
        requestPreview: 'What substances are prohibited...',
        responsePreview: 'According to Annex II...',
        inputTokens: 150,
        outputTokens: 350,
        costMillicents: 25,
        latencyMs: 1200,
        status: InteractionStatus.SUCCESS,
      });

      await em.persistAndFlush(interaction);

      expect(interaction.id).toBeDefined();
      expect(interaction.totalTokens).toBe(500);
    });

    it('should_track_interaction_context', async () => {
      testTenant = await em.findOneOrFail(Tenant, { id: testTenant.id });

      const interaction = em.create(AiInteraction, {
        tenant: testTenant,
        interactionType: InteractionType.COMPLIANCE_CHECK,
        model: 'gpt-4-turbo',
        requestHash: 'hash123',
        inputTokens: 1000,
        outputTokens: 500,
        status: InteractionStatus.SUCCESS,
        context: {
          productId: 'product-uuid',
          verticalId: 'cosmetics',
          action: 'substance_analysis',
        },
      });

      await em.persistAndFlush(interaction);

      const loaded = await em.findOneOrFail(AiInteraction, { id: interaction.id });
      expect(loaded.context?.productId).toBe('product-uuid');
    });

    it('should_log_failed_interactions_with_error', async () => {
      testTenant = await em.findOneOrFail(Tenant, { id: testTenant.id });

      const interaction = em.create(AiInteraction, {
        tenant: testTenant,
        interactionType: InteractionType.CHAT,
        model: 'gpt-4-turbo',
        requestHash: 'hash456',
        inputTokens: 100,
        outputTokens: 0,
        status: InteractionStatus.ERROR,
        errorMessage: 'Rate limit exceeded',
      });

      await em.persistAndFlush(interaction);

      expect(interaction.status).toBe(InteractionStatus.ERROR);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/database && pnpm test src/entities/AiInteraction.test.ts`
Expected: FAIL

**Step 3: Create AiInteraction entity**

```typescript
import {
  Entity,
  Property,
  PrimaryKey,
  ManyToOne,
  Enum,
  Index,
  type Rel,
} from '@mikro-orm/core';
import { Tenant } from './Tenant.js';
import { User } from './User.js';
import { ComplianceEvidence } from './ComplianceEvidence.js';

export enum InteractionType {
  CHAT = 'CHAT',
  COMPLIANCE_CHECK = 'COMPLIANCE_CHECK',
  SUBSTANCE_LOOKUP = 'SUBSTANCE_LOOKUP',
  DOCUMENT_ANALYSIS = 'DOCUMENT_ANALYSIS',
  EMBEDDING = 'EMBEDDING',
  SUMMARIZATION = 'SUMMARIZATION',
}

export enum InteractionStatus {
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  CANCELLED = 'CANCELLED',
}

/**
 * AiInteraction: Log of AI API calls for audit and cost tracking.
 *
 * Every AI call is logged with:
 * - Token counts (for billing)
 * - Latency (for performance)
 * - Context (for debugging)
 * - Cost (for budget tracking)
 */
@Entity({ tableName: 'ai_interactions' })
export class AiInteraction {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Tenant, { onDelete: 'cascade' })
  @Index({ name: 'idx_ai_interaction_tenant' })
  tenant!: Rel<Tenant>;

  @ManyToOne(() => User, { nullable: true })
  user?: Rel<User> | null;

  @Property({ type: 'uuid', nullable: true })
  apiKeyId?: string | null;

  @Enum(() => InteractionType)
  @Index({ name: 'idx_ai_interaction_type' })
  interactionType!: InteractionType;

  @Property({ type: 'varchar', length: 50 })
  model!: string;

  @Property({ type: 'varchar', length: 20, nullable: true })
  modelVersion?: string | null;

  /**
   * Hash of request for deduplication.
   */
  @Property({ type: 'varchar', length: 64 })
  requestHash!: string;

  /**
   * First N chars of request for debugging.
   */
  @Property({ type: 'text', nullable: true })
  requestPreview?: string | null;

  /**
   * First N chars of response for debugging.
   */
  @Property({ type: 'text', nullable: true })
  responsePreview?: string | null;

  @Property({ type: 'integer' })
  inputTokens!: number;

  @Property({ type: 'integer' })
  outputTokens!: number;

  /**
   * Computed total tokens (stored for query efficiency).
   */
  get totalTokens(): number {
    return this.inputTokens + this.outputTokens;
  }

  /**
   * Cost in millicents (1/1000 of a cent).
   * Enables tracking fractional costs.
   */
  @Property({ type: 'integer', nullable: true })
  costMillicents?: number | null;

  @Property({ type: 'integer', nullable: true })
  latencyMs?: number | null;

  /**
   * Arbitrary context for the interaction.
   */
  @Property({ type: 'jsonb', nullable: true })
  context?: Record<string, unknown> | null;

  /**
   * Link to compliance evidence if this was part of evaluation.
   */
  @ManyToOne(() => ComplianceEvidence, { nullable: true })
  @Index({ name: 'idx_ai_interaction_evidence' })
  complianceEvidence?: Rel<ComplianceEvidence> | null;

  @Enum(() => InteractionStatus)
  status!: InteractionStatus;

  @Property({ type: 'text', nullable: true })
  errorMessage?: string | null;

  @Property({ type: 'timestamptz', defaultRaw: 'NOW()' })
  createdAt: Date = new Date();
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/database && pnpm test src/entities/AiInteraction.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/entities/AiInteraction.ts packages/database/src/entities/AiInteraction.test.ts
git commit -m "feat(database): add AiInteraction for AI call logging

AiInteraction logs every AI API call:
- Token counts for billing
- Cost in millicents for precise tracking
- Latency for performance monitoring
- Context for debugging and audit
- Link to ComplianceEvidence when applicable

Enables usage dashboards and cost control.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Create Agent Session Entities

**Files:**
- Create: `/root/Documents/EuroComply/packages/database/src/entities/AiAgentSession.ts`
- Create: `/root/Documents/EuroComply/packages/database/src/entities/AiAgentTurn.ts`
- Create: `/root/Documents/EuroComply/packages/database/src/entities/AiAgentSession.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb } from '../test-utils.js';
import { Tenant } from './Tenant.js';
import { AiAgentSession, SessionStatus, AgentType } from './AiAgentSession.js';
import { AiAgentTurn } from './AiAgentTurn.js';

describe('AiAgentSession Entity', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let testTenant: Tenant;

  beforeAll(async () => {
    orm = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    em = orm.em.fork();
    await em.nativeDelete(AiAgentTurn, {});
    await em.nativeDelete(AiAgentSession, {});
    await em.nativeDelete(Tenant, {});

    testTenant = em.create(Tenant, {
      externalId: 'org_test',
      name: 'Test',
      slug: 'test',
    });
    await em.persistAndFlush(testTenant);
    em.clear();
  });

  describe('session management', () => {
    it('should_create_agent_session_with_memory', async () => {
      testTenant = await em.findOneOrFail(Tenant, { id: testTenant.id });

      const session = em.create(AiAgentSession, {
        tenant: testTenant,
        agentType: AgentType.COMPLIANCE_ADVISOR,
        verticalId: 'cosmetics',
        memory: {
          productContext: { name: 'Face Cream', sku: 'FC-001' },
          previousFindings: [],
        },
      });

      await em.persistAndFlush(session);

      expect(session.id).toBeDefined();
      expect(session.status).toBe(SessionStatus.ACTIVE);
    });

    it('should_track_turns_with_tool_calls', async () => {
      testTenant = await em.findOneOrFail(Tenant, { id: testTenant.id });

      const session = em.create(AiAgentSession, {
        tenant: testTenant,
        agentType: AgentType.COMPLIANCE_ADVISOR,
      });
      await em.persistAndFlush(session);

      const turn = em.create(AiAgentTurn, {
        session,
        turnNumber: 1,
        userMessage: 'Is this product compliant with EU regulations?',
        thinking: 'I need to check the substances against Annex II...',
        toolCalls: [
          { tool: 'getProductSubstances', args: { productId: 'prod-123' } },
          { tool: 'checkAnnexII', args: { substanceIds: ['sub-1'] } },
        ],
        assistantMessage: 'Based on my analysis...',
        inputTokens: 200,
        outputTokens: 400,
        latencyMs: 2500,
      });
      await em.persistAndFlush(turn);

      // Update session totals
      session.totalTurns = 1;
      session.totalTokens = 600;
      await em.persistAndFlush(session);

      const loaded = await em.findOneOrFail(AiAgentSession, { id: session.id }, { populate: ['turns'] });
      expect(loaded.turns.length).toBe(1);
      expect(loaded.totalTokens).toBe(600);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/database && pnpm test src/entities/AiAgentSession.test.ts`
Expected: FAIL

**Step 3: Create AiAgentSession entity**

```typescript
import {
  Entity,
  Property,
  PrimaryKey,
  ManyToOne,
  Enum,
  Index,
  OneToMany,
  Collection,
  type Rel,
} from '@mikro-orm/core';
import { Tenant } from './Tenant.js';
import { User } from './User.js';
import { AiAgentTurn } from './AiAgentTurn.js';

export enum SessionStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  ABANDONED = 'ABANDONED',
  ERROR = 'ERROR',
}

export enum AgentType {
  COMPLIANCE_ADVISOR = 'COMPLIANCE_ADVISOR',
  SUBSTANCE_EXPERT = 'SUBSTANCE_EXPERT',
  DOCUMENT_ANALYST = 'DOCUMENT_ANALYST',
  GENERAL = 'GENERAL',
}

/**
 * AiAgentSession: Persistent agent session with memory.
 *
 * Agents maintain state across turns, enabling:
 * - Context-aware responses
 * - Multi-turn reasoning
 * - Tool use tracking
 */
@Entity({ tableName: 'ai_agent_sessions' })
export class AiAgentSession {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Tenant, { onDelete: 'cascade' })
  @Index({ name: 'idx_agent_session_tenant' })
  tenant!: Rel<Tenant>;

  @ManyToOne(() => User, { nullable: true })
  user?: Rel<User> | null;

  @Enum(() => AgentType)
  agentType!: AgentType;

  @Property({ type: 'varchar', length: 50, nullable: true })
  verticalId?: string | null;

  @Enum(() => SessionStatus)
  status: SessionStatus = SessionStatus.ACTIVE;

  /**
   * Agent memory persisted across turns.
   */
  @Property({ type: 'jsonb', nullable: true })
  memory?: Record<string, unknown> | null;

  /**
   * Tools that have been used in this session.
   */
  @Property({ type: 'text[]', nullable: true })
  toolsUsed?: string[] | null;

  @Property({ type: 'integer', default: 0 })
  totalTurns: number = 0;

  @Property({ type: 'integer', default: 0 })
  totalTokens: number = 0;

  @Property({ type: 'integer', default: 0 })
  totalCostMillicents: number = 0;

  @Property({ type: 'timestamptz', defaultRaw: 'NOW()' })
  startedAt: Date = new Date();

  @Property({ type: 'timestamptz', defaultRaw: 'NOW()', onUpdate: () => new Date() })
  lastActivityAt: Date = new Date();

  @Property({ type: 'timestamptz', nullable: true })
  endedAt?: Date | null;

  @OneToMany(() => AiAgentTurn, (turn) => turn.session)
  turns = new Collection<AiAgentTurn>(this);
}
```

**Step 4: Create AiAgentTurn entity**

```typescript
import {
  Entity,
  Property,
  PrimaryKey,
  ManyToOne,
  Index,
  type Rel,
} from '@mikro-orm/core';
import { AiAgentSession } from './AiAgentSession.js';

/**
 * AiAgentTurn: A single turn in an agent conversation.
 *
 * Captures:
 * - User message
 * - Agent thinking (chain of thought)
 * - Tool calls made
 * - Final response
 */
@Entity({ tableName: 'ai_agent_turns' })
export class AiAgentTurn {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => AiAgentSession, { onDelete: 'cascade' })
  @Index({ name: 'idx_agent_turn_session' })
  session!: Rel<AiAgentSession>;

  @Property({ type: 'integer' })
  turnNumber!: number;

  @Property({ type: 'text', nullable: true })
  userMessage?: string | null;

  /**
   * Agent's reasoning/thinking (if using chain-of-thought).
   */
  @Property({ type: 'text', nullable: true })
  thinking?: string | null;

  /**
   * Tool calls made during this turn.
   * Array of { tool: string, args: object, result?: object }
   */
  @Property({ type: 'jsonb', nullable: true })
  toolCalls?: Array<{
    tool: string;
    args: Record<string, unknown>;
    result?: unknown;
  }> | null;

  @Property({ type: 'text', nullable: true })
  assistantMessage?: string | null;

  @Property({ type: 'integer', nullable: true })
  inputTokens?: number | null;

  @Property({ type: 'integer', nullable: true })
  outputTokens?: number | null;

  @Property({ type: 'integer', nullable: true })
  latencyMs?: number | null;

  @Property({ type: 'timestamptz', defaultRaw: 'NOW()' })
  createdAt: Date = new Date();
}
```

**Step 5: Run test to verify it passes**

Run: `cd packages/database && pnpm test src/entities/AiAgentSession.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/database/src/entities/AiAgentSession.ts packages/database/src/entities/AiAgentTurn.ts packages/database/src/entities/AiAgentSession.test.ts
git commit -m "feat(database): add AiAgentSession and AiAgentTurn for persistent agents

Agent sessions enable multi-turn conversations:
- Memory persists across turns
- Tool calls are tracked
- Token/cost aggregation per session
- Session lifecycle: ACTIVE → COMPLETED

Supports compliance advisor, substance expert agents.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Create AI Usage Limits Entity

**Files:**
- Create: `/root/Documents/EuroComply/packages/database/src/entities/AiUsageLimit.ts`
- Create: `/root/Documents/EuroComply/packages/database/src/entities/AiUsageLimit.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb } from '../test-utils.js';
import { Tenant } from './Tenant.js';
import { AiUsageLimit } from './AiUsageLimit.js';

describe('AiUsageLimit Entity', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let testTenant: Tenant;

  beforeAll(async () => {
    orm = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    em = orm.em.fork();
    await em.nativeDelete(AiUsageLimit, {});
    await em.nativeDelete(Tenant, {});

    testTenant = em.create(Tenant, {
      externalId: 'org_test',
      name: 'Test',
      slug: 'test',
    });
    await em.persistAndFlush(testTenant);
    em.clear();
  });

  describe('usage tracking', () => {
    it('should_track_monthly_usage_against_limits', async () => {
      testTenant = await em.findOneOrFail(Tenant, { id: testTenant.id });

      const limit = em.create(AiUsageLimit, {
        tenant: testTenant,
        monthlyTokenLimit: 1000000n,
        monthlyCostLimit: 10000, // $100 in millicents
        periodStart: new Date('2026-02-01'),
        tokensUsed: 50000n,
        costUsed: 500,
      });

      await em.persistAndFlush(limit);

      expect(limit.tokensUsed).toBe(50000n);
    });

    it('should_calculate_usage_percentage', async () => {
      testTenant = await em.findOneOrFail(Tenant, { id: testTenant.id });

      const limit = em.create(AiUsageLimit, {
        tenant: testTenant,
        monthlyTokenLimit: 1000000n,
        periodStart: new Date('2026-02-01'),
        tokensUsed: 800000n,
        alertThreshold: 0.8, // 80%
      });

      await em.persistAndFlush(limit);

      // Usage is 80%, at threshold
      const percentage = Number(limit.tokensUsed) / Number(limit.monthlyTokenLimit);
      expect(percentage).toBe(0.8);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/database && pnpm test src/entities/AiUsageLimit.test.ts`
Expected: FAIL

**Step 3: Create AiUsageLimit entity**

```typescript
import {
  Entity,
  Property,
  ManyToOne,
  PrimaryKeyProp,
  type Rel,
} from '@mikro-orm/core';
import { Tenant } from './Tenant.js';

/**
 * AiUsageLimit: Per-tenant AI usage quotas and tracking.
 *
 * Enables:
 * - Monthly token/cost limits (freemium model)
 * - Usage alerts at configurable thresholds
 * - Overage prevention
 */
@Entity({ tableName: 'ai_usage_limits' })
export class AiUsageLimit {
  [PrimaryKeyProp]?: 'tenant';

  @ManyToOne(() => Tenant, { primary: true, onDelete: 'cascade' })
  tenant!: Rel<Tenant>;

  /**
   * Maximum tokens per month. NULL = unlimited.
   */
  @Property({ type: 'bigint', nullable: true })
  monthlyTokenLimit?: bigint | null;

  /**
   * Maximum cost per month in millicents. NULL = unlimited.
   */
  @Property({ type: 'integer', nullable: true })
  monthlyCostLimit?: number | null;

  /**
   * Start of current billing period.
   */
  @Property({ type: 'date' })
  periodStart!: Date;

  /**
   * Tokens used in current period.
   */
  @Property({ type: 'bigint', default: 0n })
  tokensUsed: bigint = 0n;

  /**
   * Cost used in current period (millicents).
   */
  @Property({ type: 'integer', default: 0 })
  costUsed: number = 0;

  /**
   * Percentage at which to send alert (0.0 - 1.0).
   */
  @Property({ type: 'decimal', precision: 3, scale: 2, default: 0.8 })
  alertThreshold: number = 0.8;

  /**
   * When alert was last sent (to prevent spam).
   */
  @Property({ type: 'timestamptz', nullable: true })
  alertSentAt?: Date | null;

  @Property({ type: 'timestamptz', defaultRaw: 'NOW()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/database && pnpm test src/entities/AiUsageLimit.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/entities/AiUsageLimit.ts packages/database/src/entities/AiUsageLimit.test.ts
git commit -m "feat(database): add AiUsageLimit for per-tenant AI quotas

AiUsageLimit enables freemium AI model:
- Monthly token and cost limits
- Usage tracking per period
- Alert threshold for notifications
- Overage prevention

Supports tiered pricing with different AI allowances.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Update Entity Index with AI Entities

**Files:**
- Modify: `/root/Documents/EuroComply/packages/database/src/entities/index.ts`

**Step 1: Add AI entities to exports**

```typescript
// ... existing exports ...

// AI Infrastructure
export { Embedding } from './Embedding.js';
export { RagDocument, RagDocumentStatus, ContentType } from './RagDocument.js';
export { RagChunk } from './RagChunk.js';
export { AiInteraction, InteractionType, InteractionStatus } from './AiInteraction.js';
export { AiAgentSession, SessionStatus, AgentType } from './AiAgentSession.js';
export { AiAgentTurn } from './AiAgentTurn.js';
export { AiUsageLimit } from './AiUsageLimit.js';

// Update entity arrays
export const tenantEntities = [
  // ... existing entities ...
  Embedding,
  RagDocument,
  RagChunk,
  AiInteraction,
  AiAgentSession,
  AiAgentTurn,
  AiUsageLimit,
];
```

**Step 2: Commit**

```bash
git add packages/database/src/entities/index.ts
git commit -m "chore(database): add AI entities to exports

Exports: Embedding, RagDocument, RagChunk, AiInteraction,
AiAgentSession, AiAgentTurn, AiUsageLimit

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Segment 06 Completion Checklist

- [ ] Embedding entity for pgvector storage
- [ ] RagDocument and RagChunk for document processing
- [ ] AiInteraction for API call logging
- [ ] AiAgentSession and AiAgentTurn for persistent agents
- [ ] AiUsageLimit for per-tenant quotas
- [ ] Entity index updated with AI entities
- [ ] All tests pass
- [ ] All commits follow CLAUDE.md format

---

## Implementation Plan Complete

All six segments are now documented:

1. **Segment 01**: GSR Database Setup - Separate GSR database, Identity Ladder
2. **Segment 02**: GSR Seeding - CompTox, personas, version tracking
3. **Segment 03**: Tenant Database - Row-level tenancy, event sourcing
4. **Segment 04**: Neo4j Graph - Compliance knowledge graph, sync services
5. **Segment 05**: Plugin System - Verticals, handlers, rules
6. **Segment 06**: AI Infrastructure - Embeddings, RAG, agents, usage limits

**Total Tasks**: ~50 tasks across 6 segments
**Estimated Duration**: 12 working days (segments can parallelize)

---

## Next Steps

1. Create git worktree for implementation: `git worktree add ../eurocomply-v2 -b v2-architecture`
2. Execute Segment 01 using `superpowers:executing-plans`
3. Review and commit after each task
4. Proceed through segments in order (01 → 02 → [03, 04 parallel] → 05 → 06)

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-02 | Complete implementation plan - all 6 segments |
