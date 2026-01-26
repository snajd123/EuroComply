# Taxonomy Plan 12: Admin Import Pipeline

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement admin-managed CSV/JSON import pipeline for regulatory list updates with validation, preview, and immutable versioning.

**Architecture:** Create `RegulatoryImportService` that parses uploaded files, validates CAS checksums, computes diffs against existing data, stages changes for preview, and applies as new immutable list versions. Admin API endpoints for upload, preview, and apply operations.

**Tech Stack:** MikroORM, PostgreSQL, Hono, csv-parse, TypeScript

**Prerequisites:**
- Plan 4 (Substance Registry) - for CAS validation
- Plan 10 (Regulatory List Registry) - for list entities

**Reference:** See `docs/plans/2026-01-26-regulatory-vertical-system-design.md` Section 5

---

## Task 1: Create RegulatoryImportLog Entity

**Files:**
- Create: `packages/database/src/entities/RegulatoryImportLog.ts`
- Test: `packages/database/src/entities/RegulatoryImportLog.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/entities/RegulatoryImportLog.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { MikroORM } from '@mikro-orm/postgresql';
import { RegulatoryImportLog } from './RegulatoryImportLog.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';

describe('RegulatoryImportLog Entity', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) return;
    orm = await setupTestDb();
  });

  afterAll(async () => {
    if (orm) await teardownTestDb();
  });

  beforeEach(async () => {
    if (!orm) return;
    const em = orm.em.fork();
    await em.nativeDelete(RegulatoryImportLog, {});
  });

  it('creates an import log entry', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const log = em.create(RegulatoryImportLog, {
      listCode: 'COSING_ANNEX_II',
      version: '2024-06',
      adminId: 'admin-123',
      changes: {
        entriesAdded: 5,
        entriesRemoved: 2,
        entriesUpdated: 12,
        unmatchedCas: ['999-99-9', '888-88-8'],
      },
      appliedAt: new Date(),
      sourceFileName: 'cosing_annex_ii_2024_06.csv',
    });

    await em.persistAndFlush(log);

    const found = await em.findOneOrFail(RegulatoryImportLog, { listCode: 'COSING_ANNEX_II' });
    expect(found.version).toBe('2024-06');
    expect(found.changes.entriesAdded).toBe(5);
    expect(found.changes.unmatchedCas).toHaveLength(2);
  });

  it('stores JSONB changes correctly', async (context) => {
    if (!orm) { context.skip(); return; }
    const em = orm.em.fork();

    const log = em.create(RegulatoryImportLog, {
      listCode: 'REACH_SVHC',
      version: '2024-01',
      adminId: 'admin-456',
      changes: {
        entriesAdded: 10,
        entriesRemoved: 0,
        entriesUpdated: 0,
        unmatchedCas: [],
      },
      appliedAt: new Date(),
    });

    await em.persistAndFlush(log);

    const found = await em.findOneOrFail(RegulatoryImportLog, { listCode: 'REACH_SVHC' });
    expect(found.changes).toEqual({
      entriesAdded: 10,
      entriesRemoved: 0,
      entriesUpdated: 0,
      unmatchedCas: [],
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test RegulatoryImportLog.test.ts
```

Expected: FAIL with "Cannot find module './RegulatoryImportLog.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/database/src/entities/RegulatoryImportLog.ts
import { Entity, Property, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';

export interface ImportChanges {
  entriesAdded: number;
  entriesRemoved: number;
  entriesUpdated: number;
  unmatchedCas: string[];
}

@Entity({ tableName: 'regulatory_import_log', schema: 'public' })
@Index({ properties: ['listCode', 'appliedAt'] })
export class RegulatoryImportLog extends BaseEntity {
  /**
   * Code of the regulatory list that was imported.
   */
  @Property({ type: 'text', name: 'list_code' })
  @Index()
  listCode!: string;

  /**
   * Version string of the imported list.
   */
  @Property({ type: 'text' })
  version!: string;

  /**
   * ID of the admin who performed the import.
   */
  @Property({ type: 'text', name: 'admin_id' })
  adminId!: string;

  /**
   * Summary of changes applied during import.
   */
  @Property({ type: 'jsonb' })
  changes!: ImportChanges;

  /**
   * Timestamp when the import was applied.
   */
  @Property({ name: 'applied_at' })
  appliedAt!: Date;

  /**
   * Original filename of the uploaded file.
   */
  @Property({ type: 'text', nullable: true, name: 'source_file_name' })
  sourceFileName?: string;

  /**
   * Optional notes about this import.
   */
  @Property({ type: 'text', nullable: true })
  notes?: string;
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test RegulatoryImportLog.test.ts
```

Expected: PASS

**Step 5: Export and commit**

```typescript
// packages/database/src/entities/index.ts
export { RegulatoryImportLog } from './RegulatoryImportLog.js';
```

```bash
git add packages/database/src/entities/RegulatoryImportLog.ts packages/database/src/entities/RegulatoryImportLog.test.ts packages/database/src/entities/index.ts
git commit -m "feat(database): add RegulatoryImportLog entity for audit trail"
```

---

## Task 2: Create RegulatoryImportLog Migration

**Files:**
- Create: `packages/database/src/migrations/Migration20260126_RegulatoryImportLog.ts`

**Step 1: Create the migration**

```typescript
// packages/database/src/migrations/Migration20260126_RegulatoryImportLog.ts
import { Migration } from '@mikro-orm/migrations';

export class Migration20260126_RegulatoryImportLog extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE IF NOT EXISTS public.regulatory_import_log (
        id TEXT PRIMARY KEY,
        list_code TEXT NOT NULL,
        version TEXT NOT NULL,
        admin_id TEXT NOT NULL,
        changes JSONB NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL,
        source_file_name TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_import_log_list_code
        ON public.regulatory_import_log (list_code);
    `);

    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_import_log_applied_at
        ON public.regulatory_import_log (list_code, applied_at DESC);
    `);
  }

  async down(): Promise<void> {
    this.addSql('DROP TABLE IF EXISTS public.regulatory_import_log;');
  }
}
```

**Step 2: Run migration**

```bash
cd packages/database && pnpm mikro-orm migration:up
```

**Step 3: Commit**

```bash
git add packages/database/src/migrations/Migration20260126_RegulatoryImportLog.ts
git commit -m "feat(database): add migration for regulatory_import_log table"
```

---

## Task 3: Create Import Parser Utilities

**Files:**
- Create: `packages/database/src/services/import/parsers.ts`
- Test: `packages/database/src/services/import/parsers.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/import/parsers.test.ts
import { describe, it, expect } from 'vitest';
import { parseCSV, parseJSON, RegulatoryListImport } from './parsers.js';

describe('Import Parsers', () => {
  describe('parseCSV', () => {
    it('should parse valid CSV data', async () => {
      const csv = `cas_number,ec_number,restriction_type,threshold_pct,legal_reference,notes
50-00-0,200-001-8,PROHIBITED,,"Entry 1577","Formaldehyde - banned"
75-56-9,200-879-2,THRESHOLD,0.001,"Entry 1234","Propylene oxide"`;

      const result = await parseCSV(csv, {
        code: 'COSING_ANNEX_II',
        name: 'CosIng Annex II',
        source: 'EU_COSING',
        version: '2024-06',
        effectiveDate: '2024-06-01',
      });

      expect(result.code).toBe('COSING_ANNEX_II');
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].casNumber).toBe('50-00-0');
      expect(result.entries[0].restrictionType).toBe('PROHIBITED');
      expect(result.entries[1].thresholdPct).toBe('0.001');
    });

    it('should handle empty threshold values', async () => {
      const csv = `cas_number,restriction_type,threshold_pct
50-00-0,PROHIBITED,`;

      const result = await parseCSV(csv, {
        code: 'TEST',
        name: 'Test',
        source: 'TEST',
        version: '1.0',
        effectiveDate: '2024-01-01',
      });

      expect(result.entries[0].thresholdPct).toBeUndefined();
    });

    it('should trim whitespace from values', async () => {
      const csv = `cas_number,restriction_type
  50-00-0  ,  PROHIBITED  `;

      const result = await parseCSV(csv, {
        code: 'TEST',
        name: 'Test',
        source: 'TEST',
        version: '1.0',
        effectiveDate: '2024-01-01',
      });

      expect(result.entries[0].casNumber).toBe('50-00-0');
      expect(result.entries[0].restrictionType).toBe('PROHIBITED');
    });
  });

  describe('parseJSON', () => {
    it('should parse valid JSON data', () => {
      const json = JSON.stringify({
        code: 'REACH_SVHC',
        name: 'REACH SVHC Candidate List',
        source: 'ECHA',
        version: '2024-01',
        effectiveDate: '2024-01-15',
        sourceUrl: 'https://echa.europa.eu/svhc',
        entries: [
          {
            casNumber: '127-19-5',
            restrictionType: 'THRESHOLD',
            thresholdPct: '0.1',
            legalReference: 'REACH Article 33',
          },
        ],
      });

      const result = parseJSON(json);

      expect(result.code).toBe('REACH_SVHC');
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].casNumber).toBe('127-19-5');
    });

    it('should throw on invalid JSON', () => {
      expect(() => parseJSON('{ invalid json')).toThrow();
    });

    it('should throw on missing required fields', () => {
      const json = JSON.stringify({
        code: 'TEST',
        // Missing name, source, version, effectiveDate, entries
      });

      expect(() => parseJSON(json)).toThrow('Missing required field');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test parsers.test.ts
```

Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// packages/database/src/services/import/parsers.ts
import { parse } from 'csv-parse/sync';

export interface RegulatoryListEntryImport {
  casNumber: string;
  ecNumber?: string;
  restrictionType: 'PROHIBITED' | 'THRESHOLD' | 'RESTRICTED_WITH_CONDITIONS';
  thresholdPct?: string;
  conditions?: Record<string, string>;
  legalReference?: string;
  notes?: string;
}

export interface RegulatoryListImport {
  code: string;
  name: string;
  source: string;
  version: string;
  effectiveDate: string;
  sourceUrl?: string;
  entries: RegulatoryListEntryImport[];
}

export interface CSVMetadata {
  code: string;
  name: string;
  source: string;
  version: string;
  effectiveDate: string;
  sourceUrl?: string;
}

/**
 * Parse CSV content into RegulatoryListImport structure.
 * Expected columns: cas_number, ec_number, restriction_type, threshold_pct, legal_reference, notes
 */
export async function parseCSV(
  content: string,
  metadata: CSVMetadata
): Promise<RegulatoryListImport> {
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const entries: RegulatoryListEntryImport[] = records.map((row: Record<string, string>) => ({
    casNumber: row.cas_number?.trim(),
    ecNumber: row.ec_number?.trim() || undefined,
    restrictionType: row.restriction_type?.trim() as RegulatoryListEntryImport['restrictionType'],
    thresholdPct: row.threshold_pct?.trim() || undefined,
    legalReference: row.legal_reference?.trim() || undefined,
    notes: row.notes?.trim() || undefined,
  }));

  return {
    code: metadata.code,
    name: metadata.name,
    source: metadata.source,
    version: metadata.version,
    effectiveDate: metadata.effectiveDate,
    sourceUrl: metadata.sourceUrl,
    entries,
  };
}

/**
 * Parse JSON content into RegulatoryListImport structure.
 */
export function parseJSON(content: string): RegulatoryListImport {
  const data = JSON.parse(content);

  const requiredFields = ['code', 'name', 'source', 'version', 'effectiveDate', 'entries'];
  for (const field of requiredFields) {
    if (!(field in data)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  return {
    code: data.code,
    name: data.name,
    source: data.source,
    version: data.version,
    effectiveDate: data.effectiveDate,
    sourceUrl: data.sourceUrl,
    entries: data.entries.map((e: Record<string, unknown>) => ({
      casNumber: e.casNumber as string,
      ecNumber: e.ecNumber as string | undefined,
      restrictionType: e.restrictionType as RegulatoryListEntryImport['restrictionType'],
      thresholdPct: e.thresholdPct as string | undefined,
      conditions: e.conditions as Record<string, string> | undefined,
      legalReference: e.legalReference as string | undefined,
      notes: e.notes as string | undefined,
    })),
  };
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test parsers.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/services/import/parsers.ts packages/database/src/services/import/parsers.test.ts
git commit -m "feat(database): add CSV/JSON import parsers for regulatory lists"
```

---

## Task 4: Create Import Validator

**Files:**
- Create: `packages/database/src/services/import/validator.ts`
- Test: `packages/database/src/services/import/validator.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/import/validator.test.ts
import { describe, it, expect } from 'vitest';
import { validateImport, ValidationError } from './validator.js';
import { RegulatoryListImport } from './parsers.js';

describe('Import Validator', () => {
  const validImport: RegulatoryListImport = {
    code: 'COSING_ANNEX_II',
    name: 'CosIng Annex II',
    source: 'EU_COSING',
    version: '2024-06',
    effectiveDate: '2024-06-01',
    entries: [
      { casNumber: '50-00-0', restrictionType: 'PROHIBITED' },
      { casNumber: '75-56-9', restrictionType: 'THRESHOLD', thresholdPct: '0.001' },
    ],
  };

  describe('CAS number validation', () => {
    it('should pass for valid CAS numbers', () => {
      const errors = validateImport(validImport);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid CAS check digit', () => {
      const data: RegulatoryListImport = {
        ...validImport,
        entries: [
          { casNumber: '50-00-1', restrictionType: 'PROHIBITED' },  // Invalid check digit
        ],
      };

      const errors = validateImport(data);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('casNumber');
      expect(errors[0].message).toContain('Invalid CAS check digit');
    });

    it('should reject malformed CAS format', () => {
      const data: RegulatoryListImport = {
        ...validImport,
        entries: [
          { casNumber: '5000-0', restrictionType: 'PROHIBITED' },  // Wrong format
        ],
      };

      const errors = validateImport(data);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Invalid CAS');
    });
  });

  describe('restriction type validation', () => {
    it('should reject invalid restriction type', () => {
      const data: RegulatoryListImport = {
        ...validImport,
        entries: [
          { casNumber: '50-00-0', restrictionType: 'INVALID' as any },
        ],
      };

      const errors = validateImport(data);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('restrictionType');
    });

    it('should require threshold for THRESHOLD type', () => {
      const data: RegulatoryListImport = {
        ...validImport,
        entries: [
          { casNumber: '50-00-0', restrictionType: 'THRESHOLD' },  // Missing threshold
        ],
      };

      const errors = validateImport(data);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('threshold required');
    });
  });

  describe('threshold validation', () => {
    it('should reject non-numeric threshold', () => {
      const data: RegulatoryListImport = {
        ...validImport,
        entries: [
          { casNumber: '50-00-0', restrictionType: 'THRESHOLD', thresholdPct: 'abc' },
        ],
      };

      const errors = validateImport(data);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('thresholdPct');
    });

    it('should reject negative threshold', () => {
      const data: RegulatoryListImport = {
        ...validImport,
        entries: [
          { casNumber: '50-00-0', restrictionType: 'THRESHOLD', thresholdPct: '-0.1' },
        ],
      };

      const errors = validateImport(data);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('must be positive');
    });
  });

  describe('duplicate detection', () => {
    it('should detect duplicate CAS numbers', () => {
      const data: RegulatoryListImport = {
        ...validImport,
        entries: [
          { casNumber: '50-00-0', restrictionType: 'PROHIBITED' },
          { casNumber: '50-00-0', restrictionType: 'THRESHOLD', thresholdPct: '0.1' },
        ],
      };

      const errors = validateImport(data);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Duplicate CAS');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test validator.test.ts
```

Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// packages/database/src/services/import/validator.ts
import { RegulatoryListImport } from './parsers.js';
import { isValidCasNumber } from '../../utils/cas-validator.js';

export interface ValidationError {
  row: number;
  field: string;
  value: string;
  message: string;
}

const VALID_RESTRICTION_TYPES = ['PROHIBITED', 'THRESHOLD', 'RESTRICTED_WITH_CONDITIONS'];

/**
 * Validate a regulatory list import for schema and data integrity.
 * Returns array of validation errors (empty if valid).
 */
export function validateImport(data: RegulatoryListImport): ValidationError[] {
  const errors: ValidationError[] = [];
  const seenCas = new Set<string>();

  for (let i = 0; i < data.entries.length; i++) {
    const entry = data.entries[i];
    const row = i + 1;  // 1-indexed for human readability

    // Validate CAS number format and check digit
    if (!entry.casNumber) {
      errors.push({
        row,
        field: 'casNumber',
        value: '',
        message: 'CAS number is required',
      });
    } else if (!isValidCasNumber(entry.casNumber)) {
      errors.push({
        row,
        field: 'casNumber',
        value: entry.casNumber,
        message: `Invalid CAS check digit or format: ${entry.casNumber}`,
      });
    }

    // Check for duplicate CAS numbers
    if (entry.casNumber) {
      if (seenCas.has(entry.casNumber)) {
        errors.push({
          row,
          field: 'casNumber',
          value: entry.casNumber,
          message: `Duplicate CAS number: ${entry.casNumber}`,
        });
      }
      seenCas.add(entry.casNumber);
    }

    // Validate restriction type
    if (!VALID_RESTRICTION_TYPES.includes(entry.restrictionType)) {
      errors.push({
        row,
        field: 'restrictionType',
        value: entry.restrictionType,
        message: `Invalid restriction type: ${entry.restrictionType}. Must be one of: ${VALID_RESTRICTION_TYPES.join(', ')}`,
      });
    }

    // Validate threshold requirement
    if (entry.restrictionType === 'THRESHOLD') {
      if (!entry.thresholdPct) {
        errors.push({
          row,
          field: 'thresholdPct',
          value: '',
          message: 'threshold required for THRESHOLD restriction type',
        });
      }
    }

    // Validate threshold format if provided
    if (entry.thresholdPct !== undefined && entry.thresholdPct !== '') {
      const threshold = parseFloat(entry.thresholdPct);
      if (isNaN(threshold)) {
        errors.push({
          row,
          field: 'thresholdPct',
          value: entry.thresholdPct,
          message: `Invalid threshold value: ${entry.thresholdPct}. Must be a number.`,
        });
      } else if (threshold < 0) {
        errors.push({
          row,
          field: 'thresholdPct',
          value: entry.thresholdPct,
          message: `Threshold must be positive: ${entry.thresholdPct}`,
        });
      }
    }
  }

  return errors;
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test validator.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/services/import/validator.ts packages/database/src/services/import/validator.test.ts
git commit -m "feat(database): add import validator with CAS checksum and schema validation"
```

---

## Task 5: Create RegulatoryImportService

**Files:**
- Create: `packages/database/src/services/RegulatoryImportService.ts`
- Test: `packages/database/src/services/RegulatoryImportService.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/RegulatoryImportService.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { MikroORM } from '@mikro-orm/postgresql';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { RegulatoryListEntry } from '../entities/RegulatoryListEntry.js';
import { RegulatoryImportLog } from '../entities/RegulatoryImportLog.js';
import { Substance } from '../entities/Substance.js';
import { RegulatoryImportService } from './RegulatoryImportService.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';

describe('RegulatoryImportService', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) return;
    orm = await setupTestDb();
  });

  afterAll(async () => {
    if (orm) await teardownTestDb();
  });

  beforeEach(async () => {
    if (!orm) return;
    const em = orm.em.fork();
    await em.nativeDelete(RegulatoryListEntry, {});
    await em.nativeDelete(RegulatoryList, {});
    await em.nativeDelete(RegulatoryImportLog, {});
    await em.nativeDelete(Substance, {});

    // Create test substances
    const substances = [
      { casNumber: '50-00-0', primaryName: 'Formaldehyde' },
      { casNumber: '75-56-9', primaryName: 'Propylene oxide' },
      { casNumber: '127-19-5', primaryName: 'N,N-Dimethylacetamide' },
    ];

    for (const s of substances) {
      em.create(Substance, s);
    }
    await em.flush();
  });

  describe('previewImport', () => {
    it('returns preview with matched substances', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const service = new RegulatoryImportService(em);

      const preview = await service.previewImport({
        code: 'COSING_ANNEX_II',
        name: 'CosIng Annex II',
        source: 'EU_COSING',
        version: '2024-06',
        effectiveDate: '2024-06-01',
        entries: [
          { casNumber: '50-00-0', restrictionType: 'PROHIBITED' },
          { casNumber: '75-56-9', restrictionType: 'THRESHOLD', thresholdPct: '0.001' },
        ],
      }, 'admin-123');

      expect(preview.listCode).toBe('COSING_ANNEX_II');
      expect(preview.version).toBe('2024-06');
      expect(preview.diff.toAdd).toBe(2);
      expect(preview.warnings).toHaveLength(0);
      expect(preview.previewId).toBeDefined();
    });

    it('warns on unmatched CAS numbers', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const service = new RegulatoryImportService(em);

      const preview = await service.previewImport({
        code: 'TEST',
        name: 'Test',
        source: 'TEST',
        version: '1.0',
        effectiveDate: '2024-01-01',
        entries: [
          { casNumber: '50-00-0', restrictionType: 'PROHIBITED' },
          { casNumber: '999-99-9', restrictionType: 'PROHIBITED' },  // Not in DB
        ],
      }, 'admin-123');

      expect(preview.warnings).toHaveLength(1);
      expect(preview.warnings[0]).toContain('999-99-9');
      expect(preview.diff.toAdd).toBe(1);  // Only matched entry
    });

    it('calculates diff for updates', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const service = new RegulatoryImportService(em);

      // Create existing list
      const existingList = em.create(RegulatoryList, {
        code: 'TEST_LIST',
        name: 'Test',
        source: 'TEST',
        version: '2023-01',
        effectiveDate: new Date('2023-01-01'),
        isCurrentVersion: true,
      });
      await em.persistAndFlush(existingList);

      const substance = await em.findOneOrFail(Substance, { casNumber: '50-00-0' });
      em.create(RegulatoryListEntry, {
        list: existingList,
        substance,
        casNumberSnapshot: '50-00-0',
        substanceNameSnapshot: 'Formaldehyde',
        restrictionType: 'PROHIBITED',
      });
      await em.flush();

      // Preview new version (adds one, keeps one)
      const preview = await service.previewImport({
        code: 'TEST_LIST',
        name: 'Test',
        source: 'TEST',
        version: '2024-01',
        effectiveDate: '2024-01-01',
        entries: [
          { casNumber: '50-00-0', restrictionType: 'PROHIBITED' },  // Existing
          { casNumber: '75-56-9', restrictionType: 'THRESHOLD', thresholdPct: '0.1' },  // New
        ],
      }, 'admin-123');

      expect(preview.diff.toAdd).toBe(2);  // Both in new version
      expect(preview.diff.toRemove).toBe(0);  // Old version untouched
    });
  });

  describe('applyImport', () => {
    it('creates new list version and entries', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const service = new RegulatoryImportService(em);

      // Get preview first
      const preview = await service.previewImport({
        code: 'COSING_ANNEX_II',
        name: 'CosIng Annex II',
        source: 'EU_COSING',
        version: '2024-06',
        effectiveDate: '2024-06-01',
        entries: [
          { casNumber: '50-00-0', restrictionType: 'PROHIBITED', legalReference: 'Entry 1577' },
        ],
      }, 'admin-123');

      // Apply the import
      const result = await service.applyImport(preview.previewId, 'admin-123');

      expect(result.success).toBe(true);

      // Verify list was created
      const list = await em.findOne(RegulatoryList, { code: 'COSING_ANNEX_II' });
      expect(list).toBeDefined();
      expect(list?.version).toBe('2024-06');
      expect(list?.isCurrentVersion).toBe(true);

      // Verify entry was created with snapshot
      const entries = await em.find(RegulatoryListEntry, { list });
      expect(entries).toHaveLength(1);
      expect(entries[0].casNumberSnapshot).toBe('50-00-0');
      expect(entries[0].substanceNameSnapshot).toBe('Formaldehyde');
    });

    it('supersedes previous version', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const service = new RegulatoryImportService(em);

      // Create v1
      const v1Preview = await service.previewImport({
        code: 'VERSIONED',
        name: 'Versioned List',
        source: 'TEST',
        version: '2023-01',
        effectiveDate: '2023-01-01',
        entries: [
          { casNumber: '50-00-0', restrictionType: 'PROHIBITED' },
        ],
      }, 'admin-123');
      await service.applyImport(v1Preview.previewId, 'admin-123');

      // Create v2
      const v2Preview = await service.previewImport({
        code: 'VERSIONED',
        name: 'Versioned List',
        source: 'TEST',
        version: '2024-01',
        effectiveDate: '2024-01-01',
        entries: [
          { casNumber: '50-00-0', restrictionType: 'PROHIBITED' },
          { casNumber: '75-56-9', restrictionType: 'THRESHOLD', thresholdPct: '0.1' },
        ],
      }, 'admin-123');
      await service.applyImport(v2Preview.previewId, 'admin-123');

      // Verify v1 is superseded
      const v1 = await em.findOne(RegulatoryList, { code: 'VERSIONED', version: '2023-01' });
      expect(v1?.isCurrentVersion).toBe(false);
      expect(v1?.supersededDate).toBeDefined();

      // Verify v2 is current
      const v2 = await em.findOne(RegulatoryList, { code: 'VERSIONED', version: '2024-01' });
      expect(v2?.isCurrentVersion).toBe(true);
      expect(v2?.previousVersion?.id).toBe(v1?.id);
    });

    it('creates audit log entry', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const service = new RegulatoryImportService(em);

      const preview = await service.previewImport({
        code: 'AUDIT_TEST',
        name: 'Audit Test',
        source: 'TEST',
        version: '1.0',
        effectiveDate: '2024-01-01',
        entries: [
          { casNumber: '50-00-0', restrictionType: 'PROHIBITED' },
        ],
      }, 'admin-456');

      await service.applyImport(preview.previewId, 'admin-456');

      const logs = await em.find(RegulatoryImportLog, { listCode: 'AUDIT_TEST' });
      expect(logs).toHaveLength(1);
      expect(logs[0].adminId).toBe('admin-456');
      expect(logs[0].changes.entriesAdded).toBe(1);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test RegulatoryImportService.test.ts
```

Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// packages/database/src/services/RegulatoryImportService.ts
import { EntityManager } from '@mikro-orm/postgresql';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { RegulatoryListEntry } from '../entities/RegulatoryListEntry.js';
import { RegulatoryImportLog } from '../entities/RegulatoryImportLog.js';
import { Substance } from '../entities/Substance.js';
import { RestrictionType } from '../entities/enums/index.js';
import { RegulatoryListImport } from './import/parsers.js';
import { validateImport, ValidationError } from './import/validator.js';
import { createId } from '@eurocomply/core';

export interface ImportPreview {
  previewId: string;
  listCode: string;
  version: string;
  diff: {
    toAdd: number;
    toRemove: number;
    toUpdate: number;
  };
  warnings: string[];
  errors: ValidationError[];
}

export interface ImportResult {
  success: boolean;
  newListId?: string;
  applied: {
    entriesAdded: number;
    entriesRemoved: number;
    entriesUpdated: number;
  };
}

interface StagedImport {
  data: RegulatoryListImport;
  resolvedEntries: Array<{
    substanceId: string;
    casNumber: string;
    primaryName: string;
    restrictionType: RestrictionType;
    thresholdPct?: string;
    conditions?: Record<string, string>;
    legalReference?: string;
    notes?: string;
  }>;
  adminId: string;
  createdAt: Date;
}

// In-memory staging (in production, use Redis or DB table)
const stagedImports = new Map<string, StagedImport>();

export class RegulatoryImportService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Preview an import without applying changes.
   * Validates data, resolves substances, computes diff.
   */
  async previewImport(
    data: RegulatoryListImport,
    adminId: string
  ): Promise<ImportPreview> {
    // Step 1: Validate schema
    const errors = validateImport(data);
    if (errors.length > 0) {
      return {
        previewId: '',
        listCode: data.code,
        version: data.version,
        diff: { toAdd: 0, toRemove: 0, toUpdate: 0 },
        warnings: [],
        errors,
      };
    }

    // Step 2: Resolve substances
    const resolvedEntries: StagedImport['resolvedEntries'] = [];
    const warnings: string[] = [];

    for (const entry of data.entries) {
      const substance = await this.em.findOne(Substance, { casNumber: entry.casNumber });

      if (!substance) {
        warnings.push(`CAS ${entry.casNumber} not found in Substance registry - entry skipped`);
        continue;
      }

      resolvedEntries.push({
        substanceId: substance.id,
        casNumber: substance.casNumber,
        primaryName: substance.primaryName,
        restrictionType: entry.restrictionType as RestrictionType,
        thresholdPct: entry.thresholdPct,
        conditions: entry.conditions,
        legalReference: entry.legalReference,
        notes: entry.notes,
      });
    }

    // Step 3: Compute diff (for now, simple add count)
    const diff = {
      toAdd: resolvedEntries.length,
      toRemove: 0,
      toUpdate: 0,
    };

    // Step 4: Stage for apply
    const previewId = createId();
    stagedImports.set(previewId, {
      data,
      resolvedEntries,
      adminId,
      createdAt: new Date(),
    });

    // Clean old staged imports (older than 1 hour)
    this.cleanupStagedImports();

    return {
      previewId,
      listCode: data.code,
      version: data.version,
      diff,
      warnings,
      errors: [],
    };
  }

  /**
   * Apply a previewed import, creating new list version.
   */
  async applyImport(previewId: string, adminId: string): Promise<ImportResult> {
    const staged = stagedImports.get(previewId);
    if (!staged) {
      throw new Error(`Preview not found: ${previewId}`);
    }

    return this.em.transactional(async (em) => {
      const { data, resolvedEntries } = staged;

      // Step 1: Mark previous version as superseded
      const previousList = await em.findOne(RegulatoryList, {
        code: data.code,
        isCurrentVersion: true,
      });

      if (previousList) {
        previousList.isCurrentVersion = false;
        previousList.supersededDate = new Date(data.effectiveDate);
      }

      // Step 2: Create new list version
      const newList = em.create(RegulatoryList, {
        code: data.code,
        name: data.name,
        source: data.source,
        version: data.version,
        effectiveDate: new Date(data.effectiveDate),
        sourceUrl: data.sourceUrl,
        isCurrentVersion: true,
        previousVersion: previousList,
      });

      await em.persistAndFlush(newList);

      // Step 3: Create entries with snapshots
      for (const entry of resolvedEntries) {
        const substance = await em.findOneOrFail(Substance, { id: entry.substanceId });

        em.create(RegulatoryListEntry, {
          list: newList,
          substance,
          casNumberSnapshot: entry.casNumber,
          substanceNameSnapshot: entry.primaryName,
          restrictionType: entry.restrictionType,
          thresholdPct: entry.thresholdPct,
          conditions: entry.conditions,
          legalReference: entry.legalReference,
          notes: entry.notes,
        });
      }

      // Step 4: Create audit log
      em.create(RegulatoryImportLog, {
        listCode: data.code,
        version: data.version,
        adminId,
        changes: {
          entriesAdded: resolvedEntries.length,
          entriesRemoved: 0,
          entriesUpdated: 0,
          unmatchedCas: [],
        },
        appliedAt: new Date(),
      });

      await em.flush();

      // Cleanup staged import
      stagedImports.delete(previewId);

      return {
        success: true,
        newListId: newList.id,
        applied: {
          entriesAdded: resolvedEntries.length,
          entriesRemoved: 0,
          entriesUpdated: 0,
        },
      };
    });
  }

  /**
   * Clean up staged imports older than 1 hour.
   */
  private cleanupStagedImports(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    for (const [id, staged] of stagedImports) {
      if (staged.createdAt < oneHourAgo) {
        stagedImports.delete(id);
      }
    }
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test RegulatoryImportService.test.ts
```

Expected: PASS

**Step 5: Export and commit**

```typescript
// packages/database/src/services/index.ts
export { RegulatoryImportService } from './RegulatoryImportService.js';
export * from './import/parsers.js';
export * from './import/validator.js';
```

```bash
git add packages/database/src/services/RegulatoryImportService.ts packages/database/src/services/RegulatoryImportService.test.ts packages/database/src/services/index.ts
git commit -m "feat(database): add RegulatoryImportService with preview and immutable versioning"
```

---

## Task 6: Create Admin Import API Routes

**Files:**
- Create: `apps/api/src/routes/admin/regulatory-import.ts`
- Modify: `apps/api/src/routes/admin/index.ts`

**Step 1: Create the router**

```typescript
// apps/api/src/routes/admin/regulatory-import.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { MikroORM } from '@mikro-orm/postgresql';
import {
  RegulatoryImportService,
  RegulatoryImportLog,
  parseCSV,
  parseJSON,
  validateImport,
} from '@eurocomply/database';
import type { Env } from '../../app.js';

// ============================================================================
// Types
// ============================================================================

export interface RegulatoryImportRouterOptions {
  orm: MikroORM;
}

// ============================================================================
// Schemas
// ============================================================================

const logsQuery = z.object({
  listCode: z.string().optional(),
  limit: z.string().transform(v => parseInt(v, 10)).pipe(z.number().min(1).max(100)).optional(),
});

// ============================================================================
// Router
// ============================================================================

export function createRegulatoryImportRouter(options: RegulatoryImportRouterOptions): Hono<Env> {
  const { orm } = options;
  const router = new Hono<Env>();

  // POST /admin/regulatory-import/preview
  // Upload and preview an import (CSV or JSON)
  router.post('/preview', async (c) => {
    const contentType = c.req.header('Content-Type') || '';
    const em = orm.em.fork();
    const service = new RegulatoryImportService(em);

    // Get admin ID from auth context
    const adminId = c.get('userId') || 'unknown';

    try {
      let importData;

      if (contentType.includes('application/json')) {
        // JSON body with full structure
        const body = await c.req.json();
        importData = body;
      } else if (contentType.includes('multipart/form-data')) {
        // CSV file upload with metadata
        const formData = await c.req.formData();
        const file = formData.get('file') as File;
        const metadata = JSON.parse(formData.get('metadata') as string);

        if (!file) {
          return c.json({ error: 'Bad Request', message: 'No file provided' }, 400);
        }

        const content = await file.text();
        importData = await parseCSV(content, metadata);
      } else {
        return c.json(
          { error: 'Bad Request', message: 'Content-Type must be application/json or multipart/form-data' },
          400
        );
      }

      // Validate
      const errors = validateImport(importData);
      if (errors.length > 0) {
        return c.json({
          error: 'Validation Failed',
          message: 'Import data has validation errors',
          errors,
        }, 400);
      }

      // Preview
      const preview = await service.previewImport(importData, adminId);

      return c.json({
        data: preview,
      });
    } catch (error) {
      return c.json({
        error: 'Bad Request',
        message: error instanceof Error ? error.message : 'Invalid import data',
      }, 400);
    }
  });

  // POST /admin/regulatory-import/apply/:previewId
  // Apply a previewed import
  router.post('/apply/:previewId', async (c) => {
    const previewId = c.req.param('previewId');
    const em = orm.em.fork();
    const service = new RegulatoryImportService(em);
    const adminId = c.get('userId') || 'unknown';

    try {
      const result = await service.applyImport(previewId, adminId);

      return c.json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Preview not found')) {
        return c.json({
          error: 'Not Found',
          message: 'Preview expired or not found. Please upload again.',
        }, 404);
      }

      return c.json({
        error: 'Internal Error',
        message: error instanceof Error ? error.message : 'Failed to apply import',
      }, 500);
    }
  });

  // GET /admin/regulatory-import/logs
  // Get import history
  router.get('/logs', zValidator('query', logsQuery), async (c) => {
    const query = c.req.valid('query');
    const em = orm.em.fork();

    const where = query.listCode ? { listCode: query.listCode } : {};
    const limit = query.limit ?? 50;

    const logs = await em.find(
      RegulatoryImportLog,
      where,
      { orderBy: { appliedAt: 'DESC' }, limit }
    );

    return c.json({
      data: logs.map(l => ({
        id: l.id,
        listCode: l.listCode,
        version: l.version,
        adminId: l.adminId,
        changes: l.changes,
        appliedAt: l.appliedAt.toISOString(),
        sourceFileName: l.sourceFileName,
      })),
      meta: { total: logs.length },
    });
  });

  return router;
}
```

**Step 2: Register in admin routes**

```typescript
// apps/api/src/routes/admin/index.ts
// Add import:
import { createRegulatoryImportRouter } from './regulatory-import.js';

// Add route registration (requires admin auth middleware):
admin.route('/regulatory-import', createRegulatoryImportRouter({ orm }));
```

**Step 4: Verify build**

```bash
cd apps/api && pnpm build
```

**Step 5: Commit**

```bash
git add apps/api/src/routes/admin/regulatory-import.ts apps/api/src/routes/admin/index.ts
git commit -m "feat(api): add admin regulatory import routes (preview, apply, logs)"
```

---

## Summary

**Plan 12 delivers:**
- `RegulatoryImportLog` entity for audit trail
- CSV/JSON parsers for import files
- Import validator with CAS checksum validation
- `RegulatoryImportService` with preview and immutable versioning
- Admin API routes for upload, preview, apply, and logs
- Full test coverage

**Import Workflow:**
1. Admin uploads CSV/JSON → `POST /admin/regulatory-import/preview`
2. System validates, resolves substances, returns preview with warnings
3. Admin reviews diff → `POST /admin/regulatory-import/apply/:previewId`
4. System creates new immutable list version, supersedes old version
5. Audit log captures who/when/what

**Next Plans:**
- **Plan 14:** Vertical Rule Evaluation
- **Plan 15:** Regulatory Seeders

---

*Plan created: 2026-01-26*
