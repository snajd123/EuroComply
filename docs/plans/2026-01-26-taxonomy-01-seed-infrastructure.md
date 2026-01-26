# Taxonomy Plan 1: Seed Infrastructure

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create the foundation for importing reference data (units, classifications, substances) with version tracking and efficient bulk operations.

**Architecture:** A `SeedVersion` entity tracks what data has been seeded and when (including source checksum for change detection), enabling idempotent re-runs. A `BulkImportService` provides two strategies: ORM-based upsert for small datasets (<1000 records) and PostgreSQL COPY via `pg-copy-streams` for large datasets (>1000 records). CLI commands allow seeding during deployment (not application startup).

**Tech Stack:** MikroORM, PostgreSQL COPY, pg-copy-streams, Commander.js CLI

**Reference:** See `docs/plans/2026-01-23-taxonomy-engine-design.md` Section 4.4

---

## Task 1: SeedVersion Entity

**Files:**
- Create: `packages/database/src/entities/SeedVersion.ts`
- Modify: `packages/database/src/entities/index.ts`
- Test: `packages/database/src/entities/SeedVersion.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/entities/SeedVersion.test.ts
import { MikroORM } from '@mikro-orm/core';
import { SeedVersion } from './SeedVersion.js';
import { createTestOrm } from '../test-utils/create-test-orm.js';

describe('SeedVersion', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await createTestOrm([SeedVersion]);
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(async () => {
    await orm.em.nativeDelete(SeedVersion, {});
  });

  it('should create a seed version record', async () => {
    const em = orm.em.fork();

    const seedVersion = em.create(SeedVersion, {
      name: 'unece-rec20',
      version: 'Rev17',
      sourceChecksum: 'sha256:abc123def456...',
      seededAt: new Date(),
      recordCount: 1800,
    });

    await em.persistAndFlush(seedVersion);

    const found = await em.findOne(SeedVersion, { name: 'unece-rec20' });
    expect(found).toBeDefined();
    expect(found?.version).toBe('Rev17');
    expect(found?.sourceChecksum).toBe('sha256:abc123def456...');
    expect(found?.recordCount).toBe(1800);
  });

  it('should enforce unique name constraint', async () => {
    const em = orm.em.fork();

    const v1 = em.create(SeedVersion, {
      name: 'echa-svhc',
      version: '2024-01',
      seededAt: new Date(),
      recordCount: 240,
    });
    await em.persistAndFlush(v1);

    const v2 = em.create(SeedVersion, {
      name: 'echa-svhc',
      version: '2024-02',
      seededAt: new Date(),
      recordCount: 245,
    });

    await expect(em.persistAndFlush(v2)).rejects.toThrow();
  });

  it('should detect version change via checksum', async () => {
    const em = orm.em.fork();

    const v1 = em.create(SeedVersion, {
      name: 'test-data',
      version: 'Rev17',
      sourceChecksum: 'sha256:original',
      seededAt: new Date(),
      recordCount: 100,
    });
    await em.persistAndFlush(v1);
    em.clear();

    // Same version string but different checksum = needs re-seeding
    const found = await em.findOne(SeedVersion, { name: 'test-data' });
    expect(found?.sourceChecksum).toBe('sha256:original');
    // Service layer will compare checksums
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test SeedVersion.test.ts
```

Expected: FAIL with "Cannot find module './SeedVersion.js'"

**Step 3: Write the entity**

```typescript
// packages/database/src/entities/SeedVersion.ts
import { Entity, Property, Unique, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';

@Entity({ tableName: 'seed_version', schema: 'public' })
export class SeedVersion extends BaseEntity {
  @Property({ length: 100 })
  @Unique()
  @Index()
  name!: string;

  @Property({ length: 50 })
  version!: string;

  // SHA-256 checksum of source file for change detection
  // Even if version string stays same, checksum change triggers re-seed
  @Property({ length: 100, nullable: true, name: 'source_checksum' })
  sourceChecksum?: string;

  @Property({ name: 'seeded_at' })
  seededAt!: Date;

  @Property({ type: 'int', default: 0, name: 'record_count' })
  recordCount!: number;
}
```

**Step 4: Export from index**

```typescript
// packages/database/src/entities/index.ts
// Add to existing exports:
export { SeedVersion } from './SeedVersion.js';
```

**Step 5: Run test to verify it passes**

```bash
cd packages/database && pnpm test SeedVersion.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add packages/database/src/entities/SeedVersion.ts packages/database/src/entities/SeedVersion.test.ts packages/database/src/entities/index.ts
git commit -m "feat(database): add SeedVersion entity for tracking seeded reference data"
```

---

## Task 2: SeedVersion Migration

**Files:**
- Create: `packages/database/src/migrations/Migration20260126_SeedVersion.ts`

**Step 1: Create the migration**

```typescript
// packages/database/src/migrations/Migration20260126_SeedVersion.ts
import { Migration } from '@mikro-orm/migrations';

export class Migration20260126_SeedVersion extends Migration {
  async up(): Promise<void> {
    // BaseEntity uses cuid2 (21-24 chars), VARCHAR(30) provides buffer
    this.addSql(`
      CREATE TABLE IF NOT EXISTS public.seed_version (
        id VARCHAR(30) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        version VARCHAR(50) NOT NULL,
        source_checksum VARCHAR(100),
        seeded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        record_count INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_seed_version_name UNIQUE (name)
      );
    `);

    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_seed_version_name
      ON public.seed_version(name);
    `);
  }

  async down(): Promise<void> {
    this.addSql('DROP TABLE IF EXISTS public.seed_version;');
  }
}
```

**Step 2: Run migration**

```bash
cd packages/database && pnpm mikro-orm migration:up
```

Expected: Migration applied successfully

**Step 3: Verify table exists**

```bash
cd packages/database && pnpm mikro-orm schema:check
```

Expected: No schema differences

**Step 4: Commit**

```bash
git add packages/database/src/migrations/Migration20260126_SeedVersion.ts
git commit -m "feat(database): add migration for seed_version table"
```

---

## Task 3: BulkImportService - Small Dataset (ORM Upsert)

**Files:**
- Create: `packages/database/src/services/bulk-import.service.ts`
- Test: `packages/database/src/services/bulk-import.service.test.ts`

**Step 1: Write the failing test for small dataset upsert**

```typescript
// packages/database/src/services/bulk-import.service.test.ts
import { MikroORM, EntityManager } from '@mikro-orm/core';
import { BulkImportService } from './bulk-import.service.js';
import { SeedVersion } from '../entities/SeedVersion.js';
import { createTestOrm } from '../test-utils/create-test-orm.js';

describe('BulkImportService', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let service: BulkImportService;

  beforeAll(async () => {
    orm = await createTestOrm([SeedVersion]);
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(async () => {
    em = orm.em.fork();
    service = new BulkImportService(em);
    await em.nativeDelete(SeedVersion, {});
  });

  describe('upsertSmall', () => {
    it('should insert new records', async () => {
      const records = [
        { name: 'test-1', version: 'v1', seededAt: new Date(), recordCount: 10 },
        { name: 'test-2', version: 'v1', seededAt: new Date(), recordCount: 20 },
      ];

      const count = await service.upsertSmall(SeedVersion, records, ['name']);

      expect(count).toBe(2);

      const all = await em.find(SeedVersion, {});
      expect(all).toHaveLength(2);
    });

    it('should update existing records on conflict', async () => {
      // Insert initial record
      const initial = em.create(SeedVersion, {
        name: 'test-1',
        version: 'v1',
        seededAt: new Date(),
        recordCount: 10,
      });
      await em.persistAndFlush(initial);
      em.clear();

      // Upsert with updated version
      const records = [
        { name: 'test-1', version: 'v2', seededAt: new Date(), recordCount: 15 },
      ];

      const count = await service.upsertSmall(SeedVersion, records, ['name']);

      expect(count).toBe(1);

      const found = await em.findOne(SeedVersion, { name: 'test-1' });
      expect(found?.version).toBe('v2');
      expect(found?.recordCount).toBe(15);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test bulk-import.service.test.ts
```

Expected: FAIL with "Cannot find module './bulk-import.service.js'"

**Step 3: Write the service (upsertSmall method)**

```typescript
// packages/database/src/services/bulk-import.service.ts
import { EntityManager, EntityClass, RequiredEntityData } from '@mikro-orm/core';

export class BulkImportService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Upsert small datasets (<1000 records) using MikroORM.
   * Safe for any data, handles escaping automatically.
   */
  async upsertSmall<T extends object>(
    entityClass: EntityClass<T>,
    records: RequiredEntityData<T>[],
    conflictFields: (keyof T)[]
  ): Promise<number> {
    let count = 0;

    for (const record of records) {
      await this.em.upsert(entityClass, record, {
        onConflictFields: conflictFields as string[],
        onConflictAction: 'merge',
        onConflictMergeFields: Object.keys(record).filter(
          k => !conflictFields.includes(k as keyof T)
        ) as (keyof T)[],
      });
      count++;
    }

    await this.em.flush();
    return count;
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test bulk-import.service.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/services/bulk-import.service.ts packages/database/src/services/bulk-import.service.test.ts
git commit -m "feat(database): add BulkImportService with upsertSmall method"
```

---

## Task 4: BulkImportService - Large Dataset (PostgreSQL COPY FROM STDIN)

**Files:**
- Modify: `packages/database/src/services/bulk-import.service.ts`
- Modify: `packages/database/src/services/bulk-import.service.test.ts`

> **Important Design Notes:**
> - Uses `pg-copy-streams` with `COPY FROM STDIN` (works in Docker/AWS environments)
> - Pre-generates unique IDs in Node.js before streaming (avoids the single-ID bug)
> - Explicitly sets `search_path TO public` to prevent tenant schema cross-contamination

**Step 1: Install pg-copy-streams dependency**

```bash
cd packages/database && pnpm add pg-copy-streams && pnpm add -D @types/pg-copy-streams
```

**Step 2: Write the failing test for large dataset COPY**

```typescript
// Add to packages/database/src/services/bulk-import.service.test.ts

describe('copyLarge', () => {
  it('should import records using COPY FROM STDIN', async () => {
    // Prepare data with pre-generated IDs
    const records = [
      { name: 'copy-test-1', version: 'v1', seededAt: new Date('2024-01-15T10:00:00Z'), recordCount: 100 },
      { name: 'copy-test-2', version: 'v1', seededAt: new Date('2024-01-15T10:00:00Z'), recordCount: 200 },
    ];

    const count = await service.copyLarge(
      'seed_version',
      records,
      ['name', 'version', 'seeded_at', 'record_count'],
      'name',
      'public'
    );

    expect(count).toBe(2);

    const all = await em.find(SeedVersion, {});
    expect(all).toHaveLength(2);
    expect(all.map(s => s.name).sort()).toEqual(['copy-test-1', 'copy-test-2']);
    // Verify each record has a unique ID
    expect(all[0].id).not.toBe(all[1].id);
  });

  it('should upsert on conflict when using COPY', async () => {
    // Insert initial record
    const initial = em.create(SeedVersion, {
      name: 'copy-existing',
      version: 'v1',
      seededAt: new Date(),
      recordCount: 50,
    });
    await em.persistAndFlush(initial);
    em.clear();

    // COPY with updated data
    const records = [
      { name: 'copy-existing', version: 'v2', seededAt: new Date('2024-01-16T10:00:00Z'), recordCount: 75 },
    ];

    await service.copyLarge(
      'seed_version',
      records,
      ['name', 'version', 'seeded_at', 'record_count'],
      'name',
      'public'
    );

    const found = await em.findOne(SeedVersion, { name: 'copy-existing' });
    expect(found?.version).toBe('v2');
    expect(found?.recordCount).toBe(75);
  });

  it('should generate unique IDs for each record', async () => {
    const records = Array.from({ length: 100 }, (_, i) => ({
      name: `bulk-${i}`,
      version: 'v1',
      seededAt: new Date(),
      recordCount: i,
    }));

    await service.copyLarge(
      'seed_version',
      records,
      ['name', 'version', 'seeded_at', 'record_count'],
      'name',
      'public'
    );

    const all = await em.find(SeedVersion, {});
    const ids = new Set(all.map(r => r.id));

    // All IDs should be unique
    expect(ids.size).toBe(100);
  });
});
```

**Step 3: Run test to verify it fails**

```bash
cd packages/database && pnpm test bulk-import.service.test.ts
```

Expected: FAIL with "copyLarge is not a function"

**Step 4: Add copyLarge method using pg-copy-streams**

```typescript
// packages/database/src/services/bulk-import.service.ts
import { EntityManager, EntityClass, RequiredEntityData } from '@mikro-orm/core';
import { createId } from '@eurocomply/core';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

export interface CopyRecord {
  [key: string]: unknown;
}

export class BulkImportService {
  constructor(private readonly em: EntityManager) {}

  // ... existing upsertSmall method ...

  /**
   * Import large datasets (>1000 records) using PostgreSQL COPY FROM STDIN.
   * Uses pg-copy-streams for cross-environment compatibility (Docker, AWS RDS, etc.)
   *
   * Key design decisions:
   * - IDs are pre-generated in Node.js (not SQL) to ensure uniqueness
   * - Uses COPY FROM STDIN to stream data over connection (no file path needed)
   * - Explicitly sets search_path to prevent tenant schema cross-contamination
   *
   * @param tableName - Target table name (without schema)
   * @param records - Array of records to import (IDs will be generated)
   * @param columns - Column names matching record keys (snake_case for DB)
   * @param conflictColumn - Column for ON CONFLICT clause
   * @param schema - Target schema (default: 'public')
   */
  async copyLarge(
    tableName: string,
    records: CopyRecord[],
    columns: string[],
    conflictColumn: string,
    schema: string = 'public'
  ): Promise<number> {
    if (records.length === 0) return 0;

    const conn = this.em.getConnection();
    const knex = conn.getKnex();
    const stagingTable = `${tableName}_staging_${Date.now()}`;
    const fullTableName = `${schema}.${tableName}`;

    // Get the raw pg client for COPY streams
    const client = await knex.client.acquireConnection();

    try {
      // 1. Explicitly set search_path to prevent tenant contamination
      await client.query(`SET search_path TO ${schema}`);

      // 2. Create temp staging table matching target structure
      await client.query(`
        CREATE TEMP TABLE ${stagingTable} (LIKE ${fullTableName} INCLUDING DEFAULTS)
      `);

      // 3. Pre-generate unique IDs for each record in Node.js
      const recordsWithIds = records.map(record => ({
        id: createId(),  // Each record gets its own unique ID
        ...record,
        created_at: new Date(),
        updated_at: new Date(),
      }));

      // 4. Build CSV data in memory with proper escaping
      const csvColumns = ['id', ...columns, 'created_at', 'updated_at'];
      const csvData = this.buildCsvData(recordsWithIds, csvColumns);

      // 5. Stream CSV to PostgreSQL via COPY FROM STDIN
      const { from: copyFrom } = await import('pg-copy-streams');
      const copyStream = client.query(copyFrom(
        `COPY ${stagingTable} (${csvColumns.join(', ')}) FROM STDIN WITH (FORMAT csv, HEADER false, NULL '')`
      ));

      const readable = Readable.from([csvData]);
      await pipeline(readable, copyStream);

      // 6. Upsert from staging to target table
      const updateColumns = columns
        .filter(c => c !== conflictColumn)
        .map(c => `${c} = EXCLUDED.${c}`)
        .join(',\n        ');

      await client.query(`
        INSERT INTO ${fullTableName} (${csvColumns.join(', ')})
        SELECT ${csvColumns.join(', ')}
        FROM ${stagingTable}
        ON CONFLICT (${conflictColumn}) DO UPDATE SET
          ${updateColumns},
          updated_at = NOW()
      `);

      // 7. Drop staging table (also auto-dropped at session end)
      await client.query(`DROP TABLE IF EXISTS ${stagingTable}`);

      return records.length;

    } catch (error) {
      // Ensure staging table is cleaned up on error
      await client.query(`DROP TABLE IF EXISTS ${stagingTable}`).catch(() => {});
      throw error;
    } finally {
      // Release connection back to pool
      await knex.client.releaseConnection(client);
    }
  }

  /**
   * Build CSV data string with proper escaping.
   * Handles quotes, newlines, and special characters.
   */
  private buildCsvData(records: CopyRecord[], columns: string[]): string {
    const rows: string[] = [];

    for (const record of records) {
      const values = columns.map(col => {
        const value = record[col];

        if (value === null || value === undefined) {
          return '';
        }

        if (value instanceof Date) {
          return value.toISOString();
        }

        const str = String(value);

        // Escape quotes and wrap in quotes if contains special chars
        if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
          return `"${str.replace(/"/g, '""')}"`;
        }

        return str;
      });

      rows.push(values.join(','));
    }

    return rows.join('\n');
  }
}
```

**Step 5: Run test to verify it passes**

```bash
cd packages/database && pnpm test bulk-import.service.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add packages/database/src/services/bulk-import.service.ts packages/database/src/services/bulk-import.service.test.ts package.json pnpm-lock.yaml
git commit -m "feat(database): add copyLarge method using pg-copy-streams for bulk imports"
```

---

## Task 5: SeedService - Version and Checksum Checking

**Files:**
- Create: `packages/database/src/services/seed.service.ts`
- Test: `packages/database/src/services/seed.service.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/seed.service.test.ts
import { MikroORM, EntityManager } from '@mikro-orm/core';
import { SeedService } from './seed.service.js';
import { SeedVersion } from '../entities/SeedVersion.js';
import { createTestOrm } from '../test-utils/create-test-orm.js';
import * as crypto from 'crypto';

describe('SeedService', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let service: SeedService;

  beforeAll(async () => {
    orm = await createTestOrm([SeedVersion]);
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(async () => {
    em = orm.em.fork();
    service = new SeedService(em);
    await em.nativeDelete(SeedVersion, {});
  });

  describe('needsSeeding', () => {
    it('should return true if seed does not exist', async () => {
      const result = await service.needsSeeding('unece-rec20', 'Rev17');
      expect(result).toBe(true);
    });

    it('should return true if version is different', async () => {
      const existing = em.create(SeedVersion, {
        name: 'unece-rec20',
        version: 'Rev16',
        seededAt: new Date(),
        recordCount: 1700,
      });
      await em.persistAndFlush(existing);
      em.clear();

      const result = await service.needsSeeding('unece-rec20', 'Rev17');
      expect(result).toBe(true);
    });

    it('should return false if same version exists', async () => {
      const existing = em.create(SeedVersion, {
        name: 'unece-rec20',
        version: 'Rev17',
        seededAt: new Date(),
        recordCount: 1800,
      });
      await em.persistAndFlush(existing);
      em.clear();

      const result = await service.needsSeeding('unece-rec20', 'Rev17');
      expect(result).toBe(false);
    });

    it('should return true if checksum differs (even with same version)', async () => {
      const existing = em.create(SeedVersion, {
        name: 'unece-rec20',
        version: 'Rev17',
        sourceChecksum: 'sha256:oldchecksum',
        seededAt: new Date(),
        recordCount: 1800,
      });
      await em.persistAndFlush(existing);
      em.clear();

      // Same version but different checksum = needs re-seeding
      const result = await service.needsSeeding('unece-rec20', 'Rev17', 'sha256:newchecksum');
      expect(result).toBe(true);
    });

    it('should return false if both version and checksum match', async () => {
      const checksum = 'sha256:abc123';
      const existing = em.create(SeedVersion, {
        name: 'unece-rec20',
        version: 'Rev17',
        sourceChecksum: checksum,
        seededAt: new Date(),
        recordCount: 1800,
      });
      await em.persistAndFlush(existing);
      em.clear();

      const result = await service.needsSeeding('unece-rec20', 'Rev17', checksum);
      expect(result).toBe(false);
    });
  });

  describe('recordSeeding', () => {
    it('should create new seed version record', async () => {
      await service.recordSeeding('echa-svhc', '2024-01', 240, 'sha256:abc');

      const found = await em.findOne(SeedVersion, { name: 'echa-svhc' });
      expect(found).toBeDefined();
      expect(found?.version).toBe('2024-01');
      expect(found?.sourceChecksum).toBe('sha256:abc');
      expect(found?.recordCount).toBe(240);
    });

    it('should update existing seed version record', async () => {
      const existing = em.create(SeedVersion, {
        name: 'echa-svhc',
        version: '2024-01',
        sourceChecksum: 'sha256:old',
        seededAt: new Date('2024-01-01'),
        recordCount: 240,
      });
      await em.persistAndFlush(existing);
      em.clear();

      await service.recordSeeding('echa-svhc', '2024-02', 245, 'sha256:new');

      const found = await em.findOne(SeedVersion, { name: 'echa-svhc' });
      expect(found?.version).toBe('2024-02');
      expect(found?.sourceChecksum).toBe('sha256:new');
      expect(found?.recordCount).toBe(245);
    });
  });

  describe('computeChecksum', () => {
    it('should compute SHA-256 checksum of data', () => {
      const data = JSON.stringify([{ name: 'test', value: 123 }]);
      const checksum = service.computeChecksum(data);

      expect(checksum).toMatch(/^sha256:[a-f0-9]{64}$/);

      // Same data should produce same checksum
      expect(service.computeChecksum(data)).toBe(checksum);

      // Different data should produce different checksum
      const differentData = JSON.stringify([{ name: 'test', value: 124 }]);
      expect(service.computeChecksum(differentData)).not.toBe(checksum);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test seed.service.test.ts
```

Expected: FAIL with "Cannot find module './seed.service.js'"

**Step 3: Write the service**

```typescript
// packages/database/src/services/seed.service.ts
import { EntityManager } from '@mikro-orm/core';
import * as crypto from 'crypto';
import { SeedVersion } from '../entities/SeedVersion.js';

export class SeedService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Check if seeding is needed for a given dataset.
   * Returns true if:
   * - No seed record exists, OR
   * - Existing seed record has different version, OR
   * - Existing seed record has different checksum (even with same version)
   */
  async needsSeeding(
    name: string,
    version: string,
    checksum?: string
  ): Promise<boolean> {
    const existing = await this.em.findOne(SeedVersion, { name });

    if (!existing) {
      return true;
    }

    // Version mismatch always triggers re-seed
    if (existing.version !== version) {
      return true;
    }

    // If checksum provided, compare (allows detecting file changes even with same version)
    if (checksum && existing.sourceChecksum && existing.sourceChecksum !== checksum) {
      return true;
    }

    return false;
  }

  /**
   * Record that a seed operation completed.
   * Creates or updates the SeedVersion record.
   */
  async recordSeeding(
    name: string,
    version: string,
    recordCount: number,
    checksum?: string
  ): Promise<SeedVersion> {
    let seedVersion = await this.em.findOne(SeedVersion, { name });

    if (seedVersion) {
      seedVersion.version = version;
      seedVersion.recordCount = recordCount;
      seedVersion.seededAt = new Date();
      if (checksum) {
        seedVersion.sourceChecksum = checksum;
      }
    } else {
      seedVersion = this.em.create(SeedVersion, {
        name,
        version,
        recordCount,
        sourceChecksum: checksum,
        seededAt: new Date(),
      });
    }

    await this.em.persistAndFlush(seedVersion);
    return seedVersion;
  }

  /**
   * Get the current seeded version for a dataset.
   */
  async getSeededVersion(name: string): Promise<SeedVersion | null> {
    return this.em.findOne(SeedVersion, { name });
  }

  /**
   * Compute SHA-256 checksum of data for change detection.
   * Use this on the serialized source data (JSON or CSV content).
   */
  computeChecksum(data: string | Buffer): string {
    const hash = crypto.createHash('sha256');
    hash.update(data);
    return `sha256:${hash.digest('hex')}`;
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test seed.service.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/services/seed.service.ts packages/database/src/services/seed.service.test.ts
git commit -m "feat(database): add SeedService with version and checksum checking"
```

---

## Task 6: Export Services

**Files:**
- Create: `packages/database/src/services/index.ts`
- Modify: `packages/database/src/index.ts`

**Step 1: Create services index**

```typescript
// packages/database/src/services/index.ts
export { BulkImportService } from './bulk-import.service.js';
export type { CopyRecord } from './bulk-import.service.js';
export { SeedService } from './seed.service.js';
```

**Step 2: Export from package root**

```typescript
// packages/database/src/index.ts
// Add to existing exports:
export * from './services/index.js';
```

**Step 3: Verify exports work**

```bash
cd packages/database && pnpm build
```

Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/database/src/services/index.ts packages/database/src/index.ts
git commit -m "feat(database): export BulkImportService and SeedService"
```

---

## Task 7: CLI Command - db:seed:check

**Files:**
- Create: `packages/database/src/cli/seed-check.ts`
- Modify: `packages/database/package.json`

**Step 1: Create the CLI command**

```typescript
// packages/database/src/cli/seed-check.ts
import { MikroORM } from '@mikro-orm/core';
import { SeedService } from '../services/seed.service.js';
import { SeedVersion } from '../entities/SeedVersion.js';
import { initOrm } from '../init-orm.js';

async function main() {
  const args = process.argv.slice(2);
  const nameIndex = args.indexOf('--name');
  const name = nameIndex !== -1 ? args[nameIndex + 1] : undefined;

  let orm: MikroORM | undefined;

  try {
    orm = await initOrm();
    const em = orm.em.fork();
    const seedService = new SeedService(em);

    if (name) {
      // Check specific seed
      const version = await seedService.getSeededVersion(name);
      if (version) {
        console.log(`${name}:`);
        console.log(`  Version:   ${version.version}`);
        console.log(`  Checksum:  ${version.sourceChecksum || '(none)'}`);
        console.log(`  Records:   ${version.recordCount}`);
        console.log(`  Seeded at: ${version.seededAt.toISOString()}`);
      } else {
        console.log(`${name}: NOT SEEDED`);
      }
    } else {
      // List all seeds
      const allSeeds = await em.find(SeedVersion, {}, { orderBy: { name: 'ASC' } });

      if (allSeeds.length === 0) {
        console.log('No seed data found.');
      } else {
        console.log('Seeded datasets:');
        console.log('─'.repeat(80));
        console.log(
          'Name'.padEnd(25) +
          'Version'.padEnd(15) +
          'Records'.padEnd(10) +
          'Checksum'
        );
        console.log('─'.repeat(80));
        for (const seed of allSeeds) {
          console.log(
            seed.name.padEnd(25) +
            seed.version.padEnd(15) +
            String(seed.recordCount).padEnd(10) +
            (seed.sourceChecksum?.slice(0, 20) || '-') + '...'
          );
        }
      }
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await orm?.close();
  }
}

main();
```

**Step 2: Add script to package.json**

```json
// Add to packages/database/package.json scripts:
{
  "scripts": {
    "seed:check": "tsx src/cli/seed-check.ts"
  }
}
```

**Step 3: Test the command**

```bash
cd packages/database && pnpm seed:check
```

Expected: "No seed data found." or list of existing seeds

**Step 4: Commit**

```bash
git add packages/database/src/cli/seed-check.ts packages/database/package.json
git commit -m "feat(database): add seed:check CLI command to view seeded datasets"
```

---

## Task 8: Integration Test

**Files:**
- Create: `packages/database/src/services/seed-infrastructure.integration.test.ts`

**Step 1: Write integration test**

```typescript
// packages/database/src/services/seed-infrastructure.integration.test.ts
import { MikroORM, EntityManager } from '@mikro-orm/core';
import { BulkImportService } from './bulk-import.service.js';
import { SeedService } from './seed.service.js';
import { SeedVersion } from '../entities/SeedVersion.js';
import { createTestOrm } from '../test-utils/create-test-orm.js';

describe('Seed Infrastructure Integration', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let bulkImportService: BulkImportService;
  let seedService: SeedService;

  beforeAll(async () => {
    orm = await createTestOrm([SeedVersion]);
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(async () => {
    em = orm.em.fork();
    bulkImportService = new BulkImportService(em);
    seedService = new SeedService(em);
    await em.nativeDelete(SeedVersion, {});
  });

  it('should perform idempotent seeding workflow', async () => {
    const seedName = 'test-dataset';
    const version1 = 'v1.0';
    const version2 = 'v2.0';

    // Simulate source data
    const sourceData = JSON.stringify([{ name: 'sub-seed-1', version: 'v1' }]);
    const checksum1 = seedService.computeChecksum(sourceData);

    // Step 1: Check if seeding needed (should be true)
    expect(await seedService.needsSeeding(seedName, version1, checksum1)).toBe(true);

    // Step 2: Prepare data for import
    const records = [
      { name: 'sub-seed-1', version: 'v1', seeded_at: new Date(), record_count: 10 },
    ];

    // Step 3: Import data using COPY
    const count = await bulkImportService.copyLarge(
      'seed_version',
      records,
      ['name', 'version', 'seeded_at', 'record_count'],
      'name',
      'public'
    );

    // Step 4: Record seeding with checksum
    await seedService.recordSeeding(seedName, version1, count, checksum1);

    // Step 5: Verify seeding recorded
    expect(await seedService.needsSeeding(seedName, version1, checksum1)).toBe(false);
    expect(await seedService.needsSeeding(seedName, version2)).toBe(true);

    // Step 6: Verify checksum change detection
    const newSourceData = JSON.stringify([{ name: 'sub-seed-1', version: 'v1-modified' }]);
    const checksum2 = seedService.computeChecksum(newSourceData);

    // Same version but different checksum = needs re-seeding
    expect(await seedService.needsSeeding(seedName, version1, checksum2)).toBe(true);

    // Step 7: Get seeded version
    const seeded = await seedService.getSeededVersion(seedName);
    expect(seeded?.version).toBe(version1);
    expect(seeded?.sourceChecksum).toBe(checksum1);
    expect(seeded?.recordCount).toBe(count);
  });

  it('should handle concurrent seeding attempts safely', async () => {
    const records = Array.from({ length: 50 }, (_, i) => ({
      name: `concurrent-${i}`,
      version: 'v1',
      seeded_at: new Date(),
      record_count: i,
    }));

    // Run two imports in parallel - should not conflict
    const [count1, count2] = await Promise.all([
      bulkImportService.copyLarge(
        'seed_version',
        records.slice(0, 25),
        ['name', 'version', 'seeded_at', 'record_count'],
        'name',
        'public'
      ),
      bulkImportService.copyLarge(
        'seed_version',
        records.slice(25),
        ['name', 'version', 'seeded_at', 'record_count'],
        'name',
        'public'
      ),
    ]);

    expect(count1).toBe(25);
    expect(count2).toBe(25);

    const all = await em.find(SeedVersion, {});
    expect(all).toHaveLength(50);
  });
});
```

**Step 2: Run integration test**

```bash
cd packages/database && pnpm test seed-infrastructure.integration.test.ts
```

Expected: PASS

**Step 3: Commit**

```bash
git add packages/database/src/services/seed-infrastructure.integration.test.ts
git commit -m "test(database): add seed infrastructure integration test"
```

---

## Summary

**Deliverables:**
- `SeedVersion` entity with migration (includes `source_checksum` field)
- `BulkImportService` with:
  - `upsertSmall` - ORM-based for <1000 records
  - `copyLarge` - pg-copy-streams COPY FROM STDIN for >1000 records
- `SeedService` for version + checksum checking and recording
- `seed:check` CLI command
- Full test coverage

**Key Design Decisions:**
1. **IDs pre-generated in Node.js** - Each record gets a unique `createId()` before streaming
2. **COPY FROM STDIN via pg-copy-streams** - Works in Docker/AWS environments (no file path needed)
3. **Explicit `SET search_path TO public`** - Prevents tenant schema cross-contamination
4. **Source checksum tracking** - Detects file changes even when version string unchanged

**Next Plan:** Plan 2 (Units Registry) uses this infrastructure to import full UNECE Rec 20 data.
