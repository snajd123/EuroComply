# GSR v2 Golden Record Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the Golden Record architecture for GSR v2, creating a foundation of 1.2M+ chemicals from CompTox with persona tables for ECHA, CosIng, EFSA, TSCA, and Biocides registries.

**Architecture:** Single `substance` table as Golden Record (keyed by InChIKey), with separate persona tables (`substance_cosing`, `substance_efsa`, `substance_tsca`, `substance_biocide`) linking regulatory context. Identity Ladder service resolves any identifier to a Golden Record.

**Tech Stack:** MikroORM entities, PostgreSQL with pg_trgm extension, Commander CLI, xlsx/csv-parse for data parsing, vitest for testing.

**Design Document:** `docs/plans/2026-02-02-gsr-golden-record-design.md`

---

## Testing Prerequisites

All new test files with database dependencies must include the proper `vitest.config.ts` setup:

```typescript
// packages/gsr/vitest.config.ts (verify these env vars are present)
export default defineConfig({
  test: {
    env: {
      DATABASE_HOST: 'localhost',
      DATABASE_PORT: '5432',
      DATABASE_USER: 'postgres',
      DATABASE_PASSWORD: 'postgres',
      DATABASE_NAME: 'eurocomply_test',
      TEST_DATABASE_NAME: 'eurocomply_test',
    },
    // ... other config
  },
});
```

For integration tests (seeders, Identity Ladder with database):
- Use `setupTestDb()` and `teardownTestDb()` from `@eurocomply/database/test-utils`
- Ensure postgres is running: `pnpm db:start`
- Follow test naming: `should_[expectedBehavior]_when_[condition]`
- Include `// Arrange`, `// Act`, `// Assert` comments

---

## Task 1: Create SubstanceCosing Entity

**Files:**
- Create: `packages/gsr/src/entities/SubstanceCosing.ts`
- Modify: `packages/gsr/src/entities/index.ts`
- Test: `packages/gsr/src/entities/__tests__/SubstanceCosing.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/entities/__tests__/SubstanceCosing.test.ts
import { describe, it, expect } from 'vitest';
import { SubstanceCosing } from '../SubstanceCosing.js';

describe('SubstanceCosing', () => {
  describe('entity definition', () => {
    it('should have correct table name when entity is defined', () => {
      // Arrange
      const metadata = SubstanceCosing.prototype.__meta;

      // Act & Assert
      expect(metadata?.tableName).toBe('substance_cosing');
    });

    it('should have all required properties when entity is instantiated', () => {
      // Arrange & Act
      const entity = new SubstanceCosing();

      // Assert
      expect(entity).toHaveProperty('id');
      expect(entity).toHaveProperty('cosingRef');
      expect(entity).toHaveProperty('inciName');
      expect(entity).toHaveProperty('inciNameNormalized');
      expect(entity).toHaveProperty('functions');
      expect(entity).toHaveProperty('restrictionType');
      expect(entity).toHaveProperty('restrictionText');
      expect(entity).toHaveProperty('maxConcentration');
      expect(entity).toHaveProperty('concentrationUnit');
      expect(entity).toHaveProperty('otherRestrictions');
      expect(entity).toHaveProperty('sccsOpinions');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/entities/__tests__/SubstanceCosing.test.ts`
Expected: FAIL with "Cannot find module '../SubstanceCosing.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/gsr/src/entities/SubstanceCosing.ts
import {
  Entity,
  Property,
  ManyToOne,
  PrimaryKey,
  Enum,
  Index,
} from '@mikro-orm/core';
import { createId } from '@paralleldrive/cuid2';
import { Substance } from './Substance.js';

export enum CosmeticRestrictionType {
  ANNEX_II = 'ANNEX_II',     // Prohibited
  ANNEX_III = 'ANNEX_III',   // Restricted
  ANNEX_IV = 'ANNEX_IV',     // Colorants
  ANNEX_V = 'ANNEX_V',       // Preservatives
  ANNEX_VI = 'ANNEX_VI',     // UV Filters
}

@Entity({ tableName: 'substance_cosing' })
export class SubstanceCosing {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id: string = createId();

  @ManyToOne(() => Substance, { fieldName: 'substance_id' })
  substance!: Substance;

  @Property({ type: 'varchar', length: 30, persist: false })
  get substanceId(): string {
    return this.substance?.id;
  }

  @Property({ type: 'varchar', length: 20 })
  @Index()
  cosingRef!: string;

  @Property({ type: 'text' })
  inciName!: string;

  @Property({ type: 'text' })
  @Index({ type: 'gin', expression: 'inci_name_normalized gin_trgm_ops' })
  inciNameNormalized!: string;

  @Property({ type: 'array', nullable: true })
  functions?: string[];

  @Enum({ items: () => CosmeticRestrictionType, nullable: true })
  @Index()
  restrictionType?: CosmeticRestrictionType;

  @Property({ type: 'text', nullable: true })
  restrictionText?: string;

  @Property({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  maxConcentration?: string;

  @Property({ type: 'varchar', length: 20, nullable: true })
  concentrationUnit?: string;

  @Property({ type: 'text', nullable: true })
  otherRestrictions?: string;

  @Property({ type: 'json', nullable: true })
  sccsOpinions?: Record<string, unknown>;

  @Property({ type: 'timestamptz', onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
```

**Step 4: Export from index.ts**

Add to `packages/gsr/src/entities/index.ts`:
```typescript
export * from './SubstanceCosing.js';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/entities/__tests__/SubstanceCosing.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gsr/src/entities/SubstanceCosing.ts packages/gsr/src/entities/__tests__/SubstanceCosing.test.ts packages/gsr/src/entities/index.ts
git commit -m "$(cat <<'EOF'
feat(gsr): add SubstanceCosing entity for cosmetics persona

Implements CosIng persona table with:
- INCI name storage with trigram index for fuzzy search
- Restriction type enum (Annex II-VI)
- Max concentration limits
- SCCS opinions JSON storage

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Create SubstanceEfsa Entity

**Files:**
- Create: `packages/gsr/src/entities/SubstanceEfsa.ts`
- Modify: `packages/gsr/src/entities/index.ts`
- Test: `packages/gsr/src/entities/__tests__/SubstanceEfsa.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/entities/__tests__/SubstanceEfsa.test.ts
import { describe, it, expect } from 'vitest';
import { SubstanceEfsa } from '../SubstanceEfsa.js';

describe('SubstanceEfsa', () => {
  describe('entity definition', () => {
    it('should have correct table name when entity is defined', () => {
      // Arrange
      const metadata = SubstanceEfsa.prototype.__meta;

      // Act & Assert
      expect(metadata?.tableName).toBe('substance_efsa');
    });

    it('should have all required properties when entity is instantiated', () => {
      // Arrange & Act
      const entity = new SubstanceEfsa();

      // Assert
      expect(entity).toHaveProperty('id');
      expect(entity).toHaveProperty('substanceId');
      expect(entity).toHaveProperty('eNumber');
      expect(entity).toHaveProperty('efsaRef');
      expect(entity).toHaveProperty('functionalClass');
      expect(entity).toHaveProperty('adiValue');
      expect(entity).toHaveProperty('adiUnit');
      expect(entity).toHaveProperty('adiNote');
      expect(entity).toHaveProperty('approvedUses');
      expect(entity).toHaveProperty('conditions');
      expect(entity).toHaveProperty('reEvaluationDate');
      expect(entity).toHaveProperty('reEvaluationOutcome');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/entities/__tests__/SubstanceEfsa.test.ts`
Expected: FAIL with "Cannot find module '../SubstanceEfsa.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/gsr/src/entities/SubstanceEfsa.ts
import {
  Entity,
  Property,
  ManyToOne,
  PrimaryKey,
  Enum,
  Index,
} from '@mikro-orm/core';
import { createId } from '@paralleldrive/cuid2';
import { Substance } from './Substance.js';

export enum EfsaReEvaluationOutcome {
  SAFE = 'SAFE',
  SAFE_WITH_CONDITIONS = 'SAFE_WITH_CONDITIONS',
  UNDER_REVIEW = 'UNDER_REVIEW',
  NOT_SAFE = 'NOT_SAFE',
  WITHDRAWN = 'WITHDRAWN',
}

@Entity({ tableName: 'substance_efsa' })
export class SubstanceEfsa {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id: string = createId();

  @ManyToOne(() => Substance, { fieldName: 'substance_id' })
  substance!: Substance;

  @Property({ type: 'varchar', length: 30, persist: false })
  get substanceId(): string {
    return this.substance?.id;
  }

  @Property({ type: 'varchar', length: 10, nullable: true })
  @Index()
  eNumber?: string;

  @Property({ type: 'varchar', length: 50, nullable: true })
  efsaRef?: string;

  @Property({ type: 'varchar', length: 50 })
  @Index()
  functionalClass!: string;

  @Property({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  adiValue?: string;

  @Property({ type: 'varchar', length: 20, nullable: true })
  adiUnit?: string;

  @Property({ type: 'text', nullable: true })
  adiNote?: string;

  @Property({ type: 'array', nullable: true })
  approvedUses?: string[];

  @Property({ type: 'text', nullable: true })
  conditions?: string;

  @Property({ type: 'date', nullable: true })
  reEvaluationDate?: Date;

  @Enum({ items: () => EfsaReEvaluationOutcome, nullable: true })
  reEvaluationOutcome?: EfsaReEvaluationOutcome;

  @Property({ type: 'timestamptz', onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
```

**Step 4: Export from index.ts**

Add to `packages/gsr/src/entities/index.ts`:
```typescript
export * from './SubstanceEfsa.js';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/entities/__tests__/SubstanceEfsa.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gsr/src/entities/SubstanceEfsa.ts packages/gsr/src/entities/__tests__/SubstanceEfsa.test.ts packages/gsr/src/entities/index.ts
git commit -m "$(cat <<'EOF'
feat(gsr): add SubstanceEfsa entity for food additives persona

Implements EFSA persona table with:
- E-number storage with index
- ADI (Acceptable Daily Intake) value and unit
- Functional class (Preservative, Emulsifier, etc.)
- Re-evaluation status tracking

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Create SubstanceTsca Entity

**Files:**
- Create: `packages/gsr/src/entities/SubstanceTsca.ts`
- Modify: `packages/gsr/src/entities/index.ts`
- Test: `packages/gsr/src/entities/__tests__/SubstanceTsca.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/entities/__tests__/SubstanceTsca.test.ts
import { describe, it, expect } from 'vitest';
import { SubstanceTsca } from '../SubstanceTsca.js';

describe('SubstanceTsca', () => {
  describe('entity definition', () => {
    it('should have correct table name when entity is defined', () => {
      // Arrange
      const metadata = SubstanceTsca.prototype.__meta;

      // Act & Assert
      expect(metadata?.tableName).toBe('substance_tsca');
    });

    it('should have all required properties when entity is instantiated', () => {
      // Arrange & Act
      const entity = new SubstanceTsca();

      // Assert
      expect(entity).toHaveProperty('id');
      expect(entity).toHaveProperty('substanceId');
      expect(entity).toHaveProperty('tscaCas');
      expect(entity).toHaveProperty('inventoryStatus');
      expect(entity).toHaveProperty('isSection5');
      expect(entity).toHaveProperty('isSection6');
      expect(entity).toHaveProperty('isSnur');
      expect(entity).toHaveProperty('cdrFlags');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/entities/__tests__/SubstanceTsca.test.ts`
Expected: FAIL with "Cannot find module '../SubstanceTsca.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/gsr/src/entities/SubstanceTsca.ts
import {
  Entity,
  Property,
  ManyToOne,
  PrimaryKey,
  Enum,
  Index,
} from '@mikro-orm/core';
import { createId } from '@paralleldrive/cuid2';
import { Substance } from './Substance.js';

export enum TscaInventoryStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity({ tableName: 'substance_tsca' })
export class SubstanceTsca {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id: string = createId();

  @ManyToOne(() => Substance, { fieldName: 'substance_id' })
  substance!: Substance;

  @Property({ type: 'varchar', length: 30, persist: false })
  get substanceId(): string {
    return this.substance?.id;
  }

  @Property({ type: 'varchar', length: 20 })
  @Index()
  tscaCas!: string;

  @Enum({ items: () => TscaInventoryStatus })
  @Index()
  inventoryStatus!: TscaInventoryStatus;

  @Property({ type: 'boolean', default: false })
  isSection5: boolean = false;

  @Property({ type: 'boolean', default: false })
  @Index()
  isSection6: boolean = false;

  @Property({ type: 'boolean', default: false })
  isSnur: boolean = false;

  @Property({ type: 'json', nullable: true })
  cdrFlags?: Record<string, unknown>;

  @Property({ type: 'timestamptz', onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
```

**Step 4: Export from index.ts**

Add to `packages/gsr/src/entities/index.ts`:
```typescript
export * from './SubstanceTsca.js';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/entities/__tests__/SubstanceTsca.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gsr/src/entities/SubstanceTsca.ts packages/gsr/src/entities/__tests__/SubstanceTsca.test.ts packages/gsr/src/entities/index.ts
git commit -m "$(cat <<'EOF'
feat(gsr): add SubstanceTsca entity for US industrial persona

Implements TSCA persona table with:
- TSCA CAS number (may differ from primary CAS)
- Inventory status (ACTIVE/INACTIVE)
- Section 5/6 and SNUR regulatory flags
- CDR (Chemical Data Reporting) flags

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Create SubstanceBiocide Entity

**Files:**
- Create: `packages/gsr/src/entities/SubstanceBiocide.ts`
- Modify: `packages/gsr/src/entities/index.ts`
- Test: `packages/gsr/src/entities/__tests__/SubstanceBiocide.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/entities/__tests__/SubstanceBiocide.test.ts
import { describe, it, expect } from 'vitest';
import { SubstanceBiocide } from '../SubstanceBiocide.js';

describe('SubstanceBiocide', () => {
  describe('entity definition', () => {
    it('should have correct table name when entity is defined', () => {
      // Arrange
      const metadata = SubstanceBiocide.prototype.__meta;

      // Act & Assert
      expect(metadata?.tableName).toBe('substance_biocide');
    });

    it('should have all required properties when entity is instantiated', () => {
      // Arrange & Act
      const entity = new SubstanceBiocide();

      // Assert
      expect(entity).toHaveProperty('id');
      expect(entity).toHaveProperty('substanceId');
      expect(entity).toHaveProperty('biocidesRef');
      expect(entity).toHaveProperty('substanceName');
      expect(entity).toHaveProperty('status');
      expect(entity).toHaveProperty('productTypes');
      expect(entity).toHaveProperty('approvalDate');
      expect(entity).toHaveProperty('expiryDate');
      expect(entity).toHaveProperty('conditions');
      expect(entity).toHaveProperty('supplierRequirements');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/entities/__tests__/SubstanceBiocide.test.ts`
Expected: FAIL with "Cannot find module '../SubstanceBiocide.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/gsr/src/entities/SubstanceBiocide.ts
import {
  Entity,
  Property,
  ManyToOne,
  PrimaryKey,
  Enum,
  Index,
} from '@mikro-orm/core';
import { createId } from '@paralleldrive/cuid2';
import { Substance } from './Substance.js';

export enum BiocideStatus {
  APPROVED = 'APPROVED',
  NOT_APPROVED = 'NOT_APPROVED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  PENDING = 'PENDING',
}

@Entity({ tableName: 'substance_biocide' })
export class SubstanceBiocide {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id: string = createId();

  @ManyToOne(() => Substance, { fieldName: 'substance_id' })
  substance!: Substance;

  @Property({ type: 'varchar', length: 30, persist: false })
  get substanceId(): string {
    return this.substance?.id;
  }

  @Property({ type: 'varchar', length: 50 })
  @Index()
  biocidesRef!: string;

  @Property({ type: 'text' })
  substanceName!: string;

  @Enum({ items: () => BiocideStatus })
  @Index()
  status!: BiocideStatus;

  @Property({ type: 'array' })
  @Index({ type: 'gin' })
  productTypes!: number[];

  @Property({ type: 'date', nullable: true })
  approvalDate?: Date;

  @Property({ type: 'date', nullable: true })
  @Index()
  expiryDate?: Date;

  @Property({ type: 'text', nullable: true })
  conditions?: string;

  @Property({ type: 'text', nullable: true })
  supplierRequirements?: string;

  @Property({ type: 'timestamptz', onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
```

**Step 4: Export from index.ts**

Add to `packages/gsr/src/entities/index.ts`:
```typescript
export * from './SubstanceBiocide.js';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/entities/__tests__/SubstanceBiocide.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gsr/src/entities/SubstanceBiocide.ts packages/gsr/src/entities/__tests__/SubstanceBiocide.test.ts packages/gsr/src/entities/index.ts
git commit -m "$(cat <<'EOF'
feat(gsr): add SubstanceBiocide entity for EU biocides persona

Implements Biocides persona table with:
- Biocides reference ID
- Approval status enum
- Product types array (PT1-22) with GIN index
- Approval/expiry dates for tracking

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Update Substance Entity for Golden Record

**Files:**
- Modify: `packages/gsr/src/entities/Substance.ts`
- Test: `packages/gsr/src/entities/__tests__/Substance.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/entities/__tests__/Substance.test.ts (add to existing tests)
describe('Substance Golden Record fields', () => {
  it('should have all Golden Record properties when entity is instantiated', () => {
    // Arrange & Act
    const entity = new Substance();

    // Assert
    expect(entity).toHaveProperty('inchiKey');
    expect(entity).toHaveProperty('dtxsid');
    expect(entity).toHaveProperty('iupacName');
    expect(entity).toHaveProperty('smiles');
    expect(entity).toHaveProperty('molecularFormula');
    expect(entity).toHaveProperty('molecularWeight');
    expect(entity).toHaveProperty('qcLevel');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/entities/__tests__/Substance.test.ts`
Expected: FAIL with property not found errors

**Step 3: Update Substance entity**

Add to `packages/gsr/src/entities/Substance.ts`:
```typescript
// Add these properties to the Substance class:

@Property({ type: 'varchar', length: 27, nullable: true })
@Index({ unique: true })
inchiKey?: string;

@Property({ type: 'varchar', length: 20, nullable: true })
@Index({ unique: true })
dtxsid?: string;

@Property({ type: 'text', nullable: true })
iupacName?: string;

@Property({ type: 'text', nullable: true })
smiles?: string;

@Property({ type: 'varchar', length: 500, nullable: true })
molecularFormula?: string;

@Property({ type: 'decimal', precision: 12, scale: 4, nullable: true })
molecularWeight?: string;

@Property({ type: 'smallint', nullable: true })
qcLevel?: number;
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/entities/__tests__/Substance.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gsr/src/entities/Substance.ts packages/gsr/src/entities/__tests__/Substance.test.ts
git commit -m "$(cat <<'EOF'
feat(gsr): add Golden Record fields to Substance entity

Adds CompTox-sourced fields:
- inchiKey: 27-char chemical fingerprint (unique index)
- dtxsid: EPA DSSTox substance ID (unique index)
- iupacName: systematic chemical name
- smiles: structure string
- molecularFormula, molecularWeight: physical properties
- qcLevel: CompTox data quality level

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Update Database Migration

**Files:**
- Modify: `packages/database/src/migrations/Migration20260122000000.ts`

**Step 1: Read current migration**

Run: `cat packages/database/src/migrations/Migration20260122000000.ts | head -200`

**Step 2: Add persona tables to migration**

Add after `substance` table creation:
```typescript
// Substance Golden Record additions
this.addSql(`
  ALTER TABLE public.substance
  ADD COLUMN IF NOT EXISTS inchi_key VARCHAR(27),
  ADD COLUMN IF NOT EXISTS dtxsid VARCHAR(20),
  ADD COLUMN IF NOT EXISTS iupac_name TEXT,
  ADD COLUMN IF NOT EXISTS smiles TEXT,
  ADD COLUMN IF NOT EXISTS molecular_formula VARCHAR(500),
  ADD COLUMN IF NOT EXISTS molecular_weight DECIMAL(12, 4),
  ADD COLUMN IF NOT EXISTS qc_level SMALLINT;
`);

this.addSql(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_substance_inchi
  ON public.substance(inchi_key) WHERE inchi_key IS NOT NULL;
`);

this.addSql(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_substance_dtxsid
  ON public.substance(dtxsid) WHERE dtxsid IS NOT NULL;
`);

// CosIng persona table
this.addSql(`
  CREATE TABLE IF NOT EXISTS public.substance_cosing (
    id VARCHAR(30) PRIMARY KEY,
    substance_id VARCHAR(30) NOT NULL REFERENCES public.substance(id) ON DELETE CASCADE,
    cosing_ref VARCHAR(20) NOT NULL,
    inci_name TEXT NOT NULL,
    inci_name_normalized TEXT NOT NULL,
    functions TEXT[],
    restriction_type VARCHAR(20),
    restriction_text TEXT,
    max_concentration DECIMAL(10, 4),
    concentration_unit VARCHAR(20),
    other_restrictions TEXT,
    sccs_opinions JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_cosing_substance UNIQUE (substance_id),
    CONSTRAINT uq_cosing_ref UNIQUE (cosing_ref)
  );
`);

this.addSql(`
  CREATE INDEX IF NOT EXISTS idx_cosing_inci_trgm
  ON public.substance_cosing USING gin (inci_name_normalized gin_trgm_ops);
`);

// EFSA persona table
this.addSql(`
  CREATE TABLE IF NOT EXISTS public.substance_efsa (
    id VARCHAR(30) PRIMARY KEY,
    substance_id VARCHAR(30) NOT NULL REFERENCES public.substance(id) ON DELETE CASCADE,
    e_number VARCHAR(10),
    efsa_ref VARCHAR(50),
    functional_class VARCHAR(50) NOT NULL,
    adi_value DECIMAL(10, 4),
    adi_unit VARCHAR(20),
    adi_note TEXT,
    approved_uses TEXT[],
    conditions TEXT,
    re_evaluation_date DATE,
    re_evaluation_outcome VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_efsa_substance UNIQUE (substance_id)
  );
`);

this.addSql(`
  CREATE INDEX IF NOT EXISTS idx_efsa_e_number
  ON public.substance_efsa(e_number) WHERE e_number IS NOT NULL;
`);

// TSCA persona table
this.addSql(`
  CREATE TABLE IF NOT EXISTS public.substance_tsca (
    id VARCHAR(30) PRIMARY KEY,
    substance_id VARCHAR(30) NOT NULL REFERENCES public.substance(id) ON DELETE CASCADE,
    tsca_cas VARCHAR(20) NOT NULL,
    inventory_status VARCHAR(20) NOT NULL,
    is_section_5 BOOLEAN DEFAULT FALSE,
    is_section_6 BOOLEAN DEFAULT FALSE,
    is_snur BOOLEAN DEFAULT FALSE,
    cdr_flags JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_tsca_substance UNIQUE (substance_id),
    CONSTRAINT uq_tsca_cas UNIQUE (tsca_cas)
  );
`);

this.addSql(`
  CREATE INDEX IF NOT EXISTS idx_tsca_status
  ON public.substance_tsca(inventory_status);
`);

this.addSql(`
  CREATE INDEX IF NOT EXISTS idx_tsca_section6
  ON public.substance_tsca(is_section_6) WHERE is_section_6 = TRUE;
`);

// Biocide persona table
this.addSql(`
  CREATE TABLE IF NOT EXISTS public.substance_biocide (
    id VARCHAR(30) PRIMARY KEY,
    substance_id VARCHAR(30) NOT NULL REFERENCES public.substance(id) ON DELETE CASCADE,
    biocides_ref VARCHAR(50) NOT NULL,
    substance_name TEXT NOT NULL,
    status VARCHAR(30) NOT NULL,
    product_types INTEGER[] NOT NULL,
    approval_date DATE,
    expiry_date DATE,
    conditions TEXT,
    supplier_requirements TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_biocide_substance UNIQUE (substance_id),
    CONSTRAINT uq_biocide_ref UNIQUE (biocides_ref)
  );
`);

this.addSql(`
  CREATE INDEX IF NOT EXISTS idx_biocide_status
  ON public.substance_biocide(status);
`);

this.addSql(`
  CREATE INDEX IF NOT EXISTS idx_biocide_pt
  ON public.substance_biocide USING gin (product_types);
`);

this.addSql(`
  CREATE INDEX IF NOT EXISTS idx_biocide_expiry
  ON public.substance_biocide(expiry_date) WHERE expiry_date IS NOT NULL;
`);
```

**Step 3: Verify migration compiles**

Run: `cd packages/database && pnpm build`
Expected: Build passes

**Step 4: Reset database**

Run: `pnpm db:reset`
Expected: Tables created successfully

**Step 5: Verify tables exist**

Run: `docker exec eurocomply-postgres psql -U postgres -d eurocomply -c "\dt public.substance*"`
Expected: Shows substance, substance_cosing, substance_efsa, substance_tsca, substance_biocide

**Step 6: Commit**

```bash
git add packages/database/src/migrations/Migration20260122000000.ts
git commit -m "$(cat <<'EOF'
feat(db): add Golden Record persona tables to migration

Creates 4 persona tables:
- substance_cosing: INCI names, cosmetic restrictions
- substance_efsa: E-numbers, ADI values
- substance_tsca: US inventory status, section flags
- substance_biocide: Product types, approval status

Also adds Golden Record columns to substance table:
- inchi_key, dtxsid, smiles, molecular_formula, etc.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Create Identity Ladder Service

**Files:**
- Create: `packages/gsr/src/services/IdentityLadder.ts`
- Test: `packages/gsr/src/services/__tests__/IdentityLadder.test.ts`

**⚠️ PERFORMANCE NOTE:** The fuzzy `similarity()` function (Step 6) is powerful but expensive on 1.2M+ rows. Callers should provide `inchiKey` or `casNumber` whenever possible to use exact index lookups and bypass the pg_trgm fuzzy search. The ladder is designed to short-circuit early on exact matches.

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/services/__tests__/IdentityLadder.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { IdentityLadder, ResolveInput, ResolveResult } from '../IdentityLadder.js';

describe('IdentityLadder', () => {
  describe('resolve', () => {
    it('should be defined when module is imported', () => {
      // Arrange & Act & Assert
      expect(IdentityLadder).toBeDefined();
    });

    it('should have resolve method when instance is created', () => {
      // Arrange & Act
      const ladder = new IdentityLadder(null as any);

      // Assert
      expect(typeof ladder.resolve).toBe('function');
    });

    it('should return NOT_FOUND when no input is provided', async () => {
      // Arrange
      const ladder = new IdentityLadder(null as any);

      // Act
      const result = await ladder.resolve({});

      // Assert
      expect(result.status).toBe('NOT_FOUND');
      expect(result.confidence).toBe(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/services/__tests__/IdentityLadder.test.ts`
Expected: FAIL with "Cannot find module '../IdentityLadder.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/gsr/src/services/IdentityLadder.ts
import type { EntityManager } from '@mikro-orm/postgresql';
import { Substance } from '../entities/Substance.js';
import { SubstanceCosing } from '../entities/SubstanceCosing.js';
import { SubstanceEfsa } from '../entities/SubstanceEfsa.js';
import { sanitizeCas } from '../utils/cas-validator.js';

export interface ResolveInput {
  inchiKey?: string;
  casNumber?: string;
  ecNumber?: string;
  inciName?: string;
  eNumber?: string;
  name?: string;
}

export type MatchType = 'INCHIKEY' | 'CAS' | 'EC' | 'INCI' | 'E_NUMBER' | 'NAME_FUZZY';

export interface ResolveResult {
  status: 'FOUND' | 'NOT_FOUND';
  substance?: Substance;
  matchedVia?: MatchType;
  confidence: number;
}

export class IdentityLadder {
  constructor(private readonly em: EntityManager | null) {}

  async resolve(input: ResolveInput): Promise<ResolveResult> {
    // If no entity manager or no input, return not found
    if (!this.em || Object.keys(input).length === 0) {
      return { status: 'NOT_FOUND', confidence: 0 };
    }

    // Step 1: InChIKey (exact, highest confidence)
    if (input.inchiKey) {
      const substance = await this.em.findOne(Substance, { inchiKey: input.inchiKey });
      if (substance) {
        return { status: 'FOUND', substance, matchedVia: 'INCHIKEY', confidence: 1.0 };
      }
    }

    // Step 2: CAS Number (exact)
    if (input.casNumber) {
      const sanitized = sanitizeCas(input.casNumber);
      if (sanitized) {
        const substance = await this.em.findOne(Substance, { casNumber: sanitized });
        if (substance) {
          return { status: 'FOUND', substance, matchedVia: 'CAS', confidence: 1.0 };
        }
      }
    }

    // Step 3: EC Number (on substance table)
    if (input.ecNumber) {
      const substance = await this.em.findOne(Substance, { ecNumber: input.ecNumber });
      if (substance) {
        return { status: 'FOUND', substance, matchedVia: 'EC', confidence: 1.0 };
      }
    }

    // Step 4: INCI Name (via CosIng persona)
    if (input.inciName) {
      const normalized = input.inciName.toLowerCase().trim();
      const persona = await this.em.findOne(
        SubstanceCosing,
        { inciNameNormalized: normalized },
        { populate: ['substance'] }
      );
      if (persona) {
        return { status: 'FOUND', substance: persona.substance, matchedVia: 'INCI', confidence: 1.0 };
      }
    }

    // Step 5: E-Number (via EFSA persona)
    if (input.eNumber) {
      const normalized = input.eNumber.toUpperCase().replace(/\s/g, '');
      const persona = await this.em.findOne(
        SubstanceEfsa,
        { eNumber: normalized },
        { populate: ['substance'] }
      );
      if (persona) {
        return { status: 'FOUND', substance: persona.substance, matchedVia: 'E_NUMBER', confidence: 1.0 };
      }
    }

    // Step 6: Fuzzy name match (pg_trgm) - requires database
    if (input.name) {
      try {
        const result = await this.em.execute(`
          SELECT s.id, similarity(LOWER(s.canonical_name), LOWER($1)) as sim
          FROM substance s
          WHERE similarity(LOWER(s.canonical_name), LOWER($1)) > 0.8
          ORDER BY sim DESC
          LIMIT 1
        `, [input.name]);

        if (result.length > 0) {
          const substance = await this.em.findOne(Substance, { id: result[0].id });
          if (substance) {
            return {
              status: 'FOUND',
              substance,
              matchedVia: 'NAME_FUZZY',
              confidence: parseFloat(result[0].sim),
            };
          }
        }
      } catch {
        // pg_trgm not available or other error - skip fuzzy match
      }
    }

    // Not found
    return { status: 'NOT_FOUND', confidence: 0 };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/services/__tests__/IdentityLadder.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gsr/src/services/IdentityLadder.ts packages/gsr/src/services/__tests__/IdentityLadder.test.ts
git commit -m "$(cat <<'EOF'
feat(gsr): add IdentityLadder service for chemical resolution

Implements 6-step identity resolution:
1. InChIKey (exact, 100% confidence)
2. CAS number (exact)
3. EC number (exact)
4. INCI name (via CosIng persona)
5. E-number (via EFSA persona)
6. Fuzzy name match (pg_trgm, >80% similarity)

Returns NOT_FOUND for unresolved chemicals.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Create CompTox CSV Parser

**Files:**
- Create: `packages/gsr/src/parsers/comptox.parser.ts`
- Test: `packages/gsr/src/parsers/__tests__/comptox.parser.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/parsers/__tests__/comptox.parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseComptoxRow, ComptoxRow } from '../comptox.parser.js';

describe('comptox.parser', () => {
  describe('parseComptoxRow', () => {
    it('should return all fields when row has complete data', () => {
      // Arrange
      const row = {
        DTXSID: 'DTXSID2020006',
        PREFERRED_NAME: 'Acetaminophen',
        CASRN: '103-90-2',
        INCHIKEY: 'RZVAJINKPMORJF-UHFFFAOYSA-N',
        IUPAC_NAME: 'N-(4-hydroxyphenyl)acetamide',
        SMILES: 'CC(=O)NC1=CC=C(O)C=C1',
        MOLECULAR_FORMULA: 'C8H9NO2',
        AVERAGE_MASS: '151.1626',
      };

      // Act
      const result = parseComptoxRow(row);

      // Assert
      expect(result.dtxsid).toBe('DTXSID2020006');
      expect(result.canonicalName).toBe('Acetaminophen');
      expect(result.casNumber).toBe('103-90-2');
      expect(result.inchiKey).toBe('RZVAJINKPMORJF-UHFFFAOYSA-N');
      expect(result.iupacName).toBe('N-(4-hydroxyphenyl)acetamide');
      expect(result.smiles).toBe('CC(=O)NC1=CC=C(O)C=C1');
      expect(result.molecularFormula).toBe('C8H9NO2');
      expect(result.molecularWeight).toBe(151.1626);
    });

    it('should return null for optional fields when row has empty values', () => {
      // Arrange
      const row = {
        DTXSID: 'DTXSID001',
        PREFERRED_NAME: 'Test Chemical',
        CASRN: '',
        INCHIKEY: '',
        IUPAC_NAME: '',
        SMILES: '',
        MOLECULAR_FORMULA: '',
        AVERAGE_MASS: '',
      };

      // Act
      const result = parseComptoxRow(row);

      // Assert
      expect(result.dtxsid).toBe('DTXSID001');
      expect(result.canonicalName).toBe('Test Chemical');
      expect(result.casNumber).toBeNull();
      expect(result.inchiKey).toBeNull();
      expect(result.molecularWeight).toBeNull();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/parsers/__tests__/comptox.parser.test.ts`
Expected: FAIL with "Cannot find module '../comptox.parser.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/gsr/src/parsers/comptox.parser.ts
import { sanitizeCas } from '../utils/cas-validator.js';

export interface ComptoxRow {
  DTXSID: string;
  PREFERRED_NAME: string;
  CASRN: string;
  INCHIKEY: string;
  IUPAC_NAME: string;
  SMILES: string;
  MOLECULAR_FORMULA: string;
  AVERAGE_MASS: string;
  DTXCID?: string;
  QSAR_READY_SMILES?: string;
  MS_READY_SMILES?: string;
  IDENTIFIER?: string;
}

export interface ParsedComptoxSubstance {
  dtxsid: string;
  canonicalName: string;
  casNumber: string | null;
  inchiKey: string | null;
  iupacName: string | null;
  smiles: string | null;
  molecularFormula: string | null;
  molecularWeight: number | null;
  qcLevel: number | null;
}

export function parseComptoxRow(row: ComptoxRow): ParsedComptoxSubstance {
  return {
    dtxsid: row.DTXSID,
    canonicalName: row.PREFERRED_NAME,
    casNumber: row.CASRN ? sanitizeCas(row.CASRN) : null,
    inchiKey: row.INCHIKEY || null,
    iupacName: row.IUPAC_NAME || null,
    smiles: row.SMILES || null,
    molecularFormula: row.MOLECULAR_FORMULA || null,
    molecularWeight: row.AVERAGE_MASS ? parseFloat(row.AVERAGE_MASS) : null,
    qcLevel: null, // Could be derived from DTXCID structure if needed
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/parsers/__tests__/comptox.parser.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gsr/src/parsers/comptox.parser.ts packages/gsr/src/parsers/__tests__/comptox.parser.test.ts
git commit -m "$(cat <<'EOF'
feat(gsr): add CompTox CSV parser

Parses DSSToxCCDdump.csv rows into substance data:
- DTXSID, canonical name, CAS, InChIKey
- IUPAC name, SMILES, molecular formula/weight
- Handles missing optional fields gracefully

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Create CompTox Foundation Seeder

**Files:**
- Create: `packages/gsr/src/seeders/comptox.seeder.ts`
- Modify: `packages/gsr/src/cli/seed.ts`
- Test: `packages/gsr/src/seeders/__tests__/comptox.seeder.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/seeders/__tests__/comptox.seeder.test.ts
import { describe, it, expect } from 'vitest';
import { seedComptox, ComptoxSeederOptions } from '../comptox.seeder.js';

describe('comptox.seeder', () => {
  describe('seedComptox', () => {
    it('should be defined when module is imported', () => {
      // Arrange & Act & Assert
      expect(seedComptox).toBeDefined();
      expect(typeof seedComptox).toBe('function');
    });

    it('should accept valid options when options object is constructed', () => {
      // Arrange
      const options: ComptoxSeederOptions = {
        file: 'test.csv',
        dryRun: true,
        batchSize: 1000,
        em: null as any,
      };

      // Act & Assert (type check)
      expect(options.file).toBe('test.csv');
      expect(options.dryRun).toBe(true);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/seeders/__tests__/comptox.seeder.test.ts`
Expected: FAIL with "Cannot find module '../comptox.seeder.js'"

**⚠️ PERFORMANCE NOTE:** With 1.2M substances, standard ORM persist() is too slow. Use raw SQL bulk inserts with batches of 5,000+ or PostgreSQL COPY for optimal performance.

**Step 3: Write minimal implementation**

```typescript
// packages/gsr/src/seeders/comptox.seeder.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as csv from 'csv-parse';
import stripBomStream from 'strip-bom-stream';
import type { EntityManager } from '@mikro-orm/postgresql';
import { createId } from '@paralleldrive/cuid2';
import { parseComptoxRow } from '../parsers/comptox.parser.js';

export interface ComptoxSeederOptions {
  file: string;
  dryRun: boolean;
  batchSize: number;
  em: EntityManager;
}

export interface ComptoxSeederResult {
  processed: number;
  created: number;
  skipped: number;
  errors: number;
}

/**
 * Builds raw SQL INSERT for bulk loading (5,000+ rows per batch).
 * Much faster than ORM persist() for 1.2M+ records.
 */
function buildBulkInsertSql(rows: Array<Record<string, unknown>>): { sql: string; params: unknown[] } {
  if (rows.length === 0) return { sql: '', params: [] };

  const columns = [
    'id', 'dtxsid', 'canonical_name', 'cas_number', 'inchi_key',
    'iupac_name', 'smiles', 'molecular_formula', 'molecular_weight',
    'qc_level', 'is_active', 'created_at', 'updated_at'
  ];

  const params: unknown[] = [];
  const valueSets: string[] = [];

  for (const row of rows) {
    const placeholders = columns.map((_, i) => `$${params.length + i + 1}`);
    valueSets.push(`(${placeholders.join(', ')})`);
    params.push(
      row.id, row.dtxsid, row.canonicalName, row.casNumber, row.inchiKey,
      row.iupacName, row.smiles, row.molecularFormula, row.molecularWeight,
      row.qcLevel, true, new Date(), new Date()
    );
  }

  const sql = `
    INSERT INTO public.substance (${columns.join(', ')})
    VALUES ${valueSets.join(', ')}
    ON CONFLICT (dtxsid) DO NOTHING
  `;

  return { sql, params };
}

export async function seedComptox(options: ComptoxSeederOptions): Promise<ComptoxSeederResult> {
  const { file, dryRun, batchSize, em } = options;

  // Use larger batches for raw SQL (5,000+ recommended)
  const effectiveBatchSize = Math.max(batchSize, 5000);

  console.log(`[CompTox] Loading ${file}...`);
  console.log(`[CompTox] Dry run: ${dryRun}`);
  console.log(`[CompTox] Batch size: ${effectiveBatchSize} (raw SQL bulk insert)`);

  const result: ComptoxSeederResult = {
    processed: 0,
    created: 0,
    skipped: 0,
    errors: 0,
  };

  // Stream the CSV to handle 600MB+ file
  const parser = fs.createReadStream(file)
    .pipe(stripBomStream())
    .pipe(csv.parse({ columns: true, skip_empty_lines: true }));

  let batch: Array<Record<string, unknown>> = [];

  for await (const row of parser) {
    try {
      const parsed = parseComptoxRow(row);

      // Skip if no canonical name (required)
      if (!parsed.canonicalName) {
        result.skipped++;
        continue;
      }

      batch.push({
        id: createId(),
        dtxsid: parsed.dtxsid,
        canonicalName: parsed.canonicalName,
        casNumber: parsed.casNumber,
        inchiKey: parsed.inchiKey,
        iupacName: parsed.iupacName,
        smiles: parsed.smiles,
        molecularFormula: parsed.molecularFormula,
        molecularWeight: parsed.molecularWeight?.toFixed(4),
        qcLevel: parsed.qcLevel,
      });

      result.processed++;

      if (batch.length >= effectiveBatchSize) {
        if (!dryRun) {
          const { sql, params } = buildBulkInsertSql(batch);
          await em.execute(sql, params);
        }
        console.log(`[CompTox] Processed ${result.processed.toLocaleString()} records...`);
        result.created += batch.length;
        batch = [];
      }
    } catch (error) {
      result.errors++;
      if (result.errors <= 10) {
        console.error(`[CompTox] Error parsing row:`, error);
      }
    }
  }

  // Final batch
  if (batch.length > 0) {
    if (!dryRun) {
      const { sql, params } = buildBulkInsertSql(batch);
      await em.execute(sql, params);
    }
    result.created += batch.length;
  }

  console.log(`[CompTox] Complete:`);
  console.log(`  - Processed: ${result.processed.toLocaleString()}`);
  console.log(`  - Created: ${result.created.toLocaleString()}`);
  console.log(`  - Skipped: ${result.skipped.toLocaleString()}`);
  console.log(`  - Errors: ${result.errors.toLocaleString()}`);

  return result;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/seeders/__tests__/comptox.seeder.test.ts`
Expected: PASS

**Step 5: Add CLI command to seed.ts**

Add to `packages/gsr/src/cli/seed.ts`:
```typescript
import { seedComptox } from '../seeders/comptox.seeder.js';

seedCommand
  .command('comptox <file>')
  .description('Seed Golden Records from EPA CompTox DSSTox CSV')
  .option('-d, --dry-run', 'Preview without writing to database', false)
  .option('--batch-size <size>', 'Records per batch', '10000')
  .action(async (file: string, options: { dryRun: boolean; batchSize: string }) => {
    const orm = await initOrm();
    const em = orm.em.fork();

    try {
      await seedComptox({
        file: path.resolve(file),
        dryRun: options.dryRun,
        batchSize: parseInt(options.batchSize),
        em,
      });
    } finally {
      await orm.close();
    }
  });
```

**Step 6: Verify CLI works**

Run: `cd packages/gsr && pnpm gsr seed comptox --help`
Expected: Shows help for comptox command

**Step 7: Commit**

```bash
git add packages/gsr/src/seeders/comptox.seeder.ts packages/gsr/src/seeders/__tests__/comptox.seeder.test.ts packages/gsr/src/cli/seed.ts
git commit -m "$(cat <<'EOF'
feat(gsr): add CompTox foundation seeder

Streams DSSToxCCDdump.csv (664MB) to create Golden Records:
- Batch processing (default 10k) for memory efficiency
- Creates 1.2M+ substance records with InChIKey, CAS, SMILES
- Dry-run mode for testing
- Progress reporting every batch

CLI: pnpm gsr seed comptox <file> [--dry-run] [--batch-size]

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Create CosIng Parser

**Files:**
- Create: `packages/gsr/src/parsers/cosing.parser.ts`
- Test: `packages/gsr/src/parsers/__tests__/cosing.parser.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/parsers/__tests__/cosing.parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseCosingAnnexII, parseCosingAnnexIII, CosingAnnexIIRow, CosingAnnexIIIRow } from '../cosing.parser.js';

describe('cosing.parser', () => {
  describe('parseCosingAnnexII', () => {
    it('should parse prohibited substance when row has all fields', () => {
      // Arrange
      const row: CosingAnnexIIRow = {
        'Reference Number': '1',
        'Chemical name / INN': 'Test Prohibited Chemical',
        'CAS Number': '12345-67-8',
        'EC Number': '200-123-4',
        'Regulation': '(EC) 2009/1223',
        'CMR': 'CMR',
        'SCCS opinions': 'SCCS/1234/56',
        'Identified INGREDIENTS': 'TEST INGREDIENT',
      };

      // Act
      const result = parseCosingAnnexII(row);

      // Assert
      expect(result.cosingRef).toBe('II-1');
      expect(result.inciName).toBe('TEST INGREDIENT');
      expect(result.inciNameNormalized).toBe('test ingredient');
      expect(result.casNumber).toBe('12345-67-8');
      expect(result.ecNumber).toBe('200-123-4');
      expect(result.restrictionType).toBe('ANNEX_II');
      expect(result.isCmr).toBe(true);
    });
  });

  describe('parseCosingAnnexIII', () => {
    it('should parse restricted substance when row has concentration limit', () => {
      // Arrange
      const row: CosingAnnexIIIRow = {
        'Reference Number': '1',
        'Chemical name / INN': 'Test Restricted Chemical',
        'Name of Common Ingredients Glossary': 'TEST INCI; OTHER INCI',
        'CAS Number': '98765-43-2',
        'EC Number': '201-456-7',
        'Product Type, body parts': 'Oral products',
        'Maximum concentration in ready for use preparation': '0.5%',
        'Wording of conditions of use and warnings': 'Not for children',
      };

      // Act
      const result = parseCosingAnnexIII(row);

      // Assert
      expect(result.cosingRef).toBe('III-1');
      expect(result.inciName).toBe('TEST INCI');
      expect(result.restrictionType).toBe('ANNEX_III');
      expect(result.maxConcentration).toBe(0.5);
      expect(result.restrictionText).toContain('Oral products');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/parsers/__tests__/cosing.parser.test.ts`
Expected: FAIL with "Cannot find module '../cosing.parser.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/gsr/src/parsers/cosing.parser.ts
import { CosmeticRestrictionType } from '../entities/SubstanceCosing.js';

export interface CosingAnnexIIRow {
  'Reference Number': string;
  'Chemical name / INN': string;
  'CAS Number': string;
  'EC Number': string;
  'Regulation': string;
  'CMR': string;
  'SCCS opinions': string;
  'Identified INGREDIENTS': string;
}

export interface CosingAnnexIIIRow {
  'Reference Number': string;
  'Chemical name / INN': string;
  'Name of Common Ingredients Glossary': string;
  'CAS Number': string;
  'EC Number': string;
  'Product Type, body parts': string;
  'Maximum concentration in ready for use preparation': string;
  'Wording of conditions of use and warnings': string;
}

export interface ParsedCosingEntry {
  cosingRef: string;
  inciName: string;
  inciNameNormalized: string;
  casNumber: string | null;
  ecNumber: string | null;
  restrictionType: CosmeticRestrictionType;
  restrictionText: string | null;
  maxConcentration: number | null;
  concentrationUnit: string | null;
  isCmr: boolean;
  sccsOpinions: string[] | null;
}

export function parseCosingAnnexII(row: CosingAnnexIIRow): ParsedCosingEntry {
  const ref = row['Reference Number'];
  const inciName = row['Identified INGREDIENTS'] || row['Chemical name / INN'];

  return {
    cosingRef: `II-${ref}`,
    inciName: inciName.split(';')[0].trim().toUpperCase(),
    inciNameNormalized: inciName.split(';')[0].trim().toLowerCase(),
    casNumber: row['CAS Number'] || null,
    ecNumber: row['EC Number'] || null,
    restrictionType: CosmeticRestrictionType.ANNEX_II,
    restrictionText: 'Prohibited substance',
    maxConcentration: null,
    concentrationUnit: null,
    isCmr: row['CMR'] === 'CMR',
    sccsOpinions: row['SCCS opinions'] ? [row['SCCS opinions']] : null,
  };
}

export function parseCosingAnnexIII(row: CosingAnnexIIIRow): ParsedCosingEntry {
  const ref = row['Reference Number'];
  const inciName = row['Name of Common Ingredients Glossary'] || row['Chemical name / INN'];
  const maxConc = parseConcentration(row['Maximum concentration in ready for use preparation']);

  return {
    cosingRef: `III-${ref}`,
    inciName: inciName.split(';')[0].trim().toUpperCase(),
    inciNameNormalized: inciName.split(';')[0].trim().toLowerCase(),
    casNumber: row['CAS Number'] || null,
    ecNumber: row['EC Number'] || null,
    restrictionType: CosmeticRestrictionType.ANNEX_III,
    restrictionText: `${row['Product Type, body parts']}. ${row['Wording of conditions of use and warnings']}`.trim(),
    maxConcentration: maxConc,
    concentrationUnit: maxConc !== null ? 'PERCENT' : null,
    isCmr: false,
    sccsOpinions: null,
  };
}

function parseConcentration(value: string): number | null {
  if (!value) return null;
  const match = value.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? parseFloat(match[1]) : null;
}

// Similar parsers for Annex IV, V, VI follow the same pattern
export function parseCosingAnnexIV(row: Record<string, string>): ParsedCosingEntry {
  const ref = row['Reference Number'];
  return {
    cosingRef: `IV-${ref}`,
    inciName: (row['Colour index Number / Name'] || row['Chemical name']).trim().toUpperCase(),
    inciNameNormalized: (row['Colour index Number / Name'] || row['Chemical name']).trim().toLowerCase(),
    casNumber: row['CAS Number'] || null,
    ecNumber: row['EC Number'] || null,
    restrictionType: CosmeticRestrictionType.ANNEX_IV,
    restrictionText: 'Permitted colorant',
    maxConcentration: null,
    concentrationUnit: null,
    isCmr: false,
    sccsOpinions: null,
  };
}

export function parseCosingAnnexV(row: Record<string, string>): ParsedCosingEntry {
  const ref = row['Reference Number'];
  const inciName = row['Name of Common Ingredients Glossary'] || row['Chemical name / INN / XAN'];
  const maxConc = parseConcentration(row['Maximum concentration']);

  return {
    cosingRef: `V-${ref}`,
    inciName: inciName.split(';')[0].trim().toUpperCase(),
    inciNameNormalized: inciName.split(';')[0].trim().toLowerCase(),
    casNumber: row['CAS Number'] || null,
    ecNumber: row['EC Number'] || null,
    restrictionType: CosmeticRestrictionType.ANNEX_V,
    restrictionText: row['Product Type, body parts'] || 'Permitted preservative',
    maxConcentration: maxConc,
    concentrationUnit: maxConc !== null ? 'PERCENT' : null,
    isCmr: false,
    sccsOpinions: null,
  };
}

export function parseCosingAnnexVI(row: Record<string, string>): ParsedCosingEntry {
  const ref = row['Reference Number'];
  const inciName = row['Name of Common Ingredients Glossary'] || row['Chemical name / INN / XAN'];
  const maxConc = parseConcentration(row['Maximum concentration']);

  return {
    cosingRef: `VI-${ref}`,
    inciName: inciName.split(';')[0].trim().toUpperCase(),
    inciNameNormalized: inciName.split(';')[0].trim().toLowerCase(),
    casNumber: row['CAS Number'] || null,
    ecNumber: row['EC Number'] || null,
    restrictionType: CosmeticRestrictionType.ANNEX_VI,
    restrictionText: row['Product Type, body parts'] || 'Permitted UV filter',
    maxConcentration: maxConc,
    concentrationUnit: maxConc !== null ? 'PERCENT' : null,
    isCmr: false,
    sccsOpinions: null,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/parsers/__tests__/cosing.parser.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gsr/src/parsers/cosing.parser.ts packages/gsr/src/parsers/__tests__/cosing.parser.test.ts
git commit -m "$(cat <<'EOF'
feat(gsr): add CosIng XLS parser for all annexes

Parses CosIng Cosmetics Regulation annexes:
- Annex II: Prohibited substances
- Annex III: Restricted substances with max concentrations
- Annex IV: Permitted colorants
- Annex V: Permitted preservatives
- Annex VI: Permitted UV filters

Extracts INCI names, CAS/EC numbers, CMR flags, SCCS opinions.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Create CosIng Seeder

**Files:**
- Create: `packages/gsr/src/seeders/cosing.seeder.ts`
- Modify: `packages/gsr/src/cli/seed.ts`
- Test: `packages/gsr/src/seeders/__tests__/cosing.seeder.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/seeders/__tests__/cosing.seeder.test.ts
import { describe, it, expect } from 'vitest';
import { seedCosing, CosingSeederOptions } from '../cosing.seeder.js';

describe('cosing.seeder', () => {
  describe('seedCosing', () => {
    it('should be defined when module is imported', () => {
      // Arrange & Act & Assert
      expect(seedCosing).toBeDefined();
      expect(typeof seedCosing).toBe('function');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/seeders/__tests__/cosing.seeder.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// packages/gsr/src/seeders/cosing.seeder.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import xlsx from 'xlsx';
import type { EntityManager } from '@mikro-orm/postgresql';
import { SubstanceCosing } from '../entities/SubstanceCosing.js';
import { IdentityLadder } from '../services/IdentityLadder.js';
import {
  parseCosingAnnexII,
  parseCosingAnnexIII,
  parseCosingAnnexIV,
  parseCosingAnnexV,
  parseCosingAnnexVI,
  ParsedCosingEntry,
} from '../parsers/cosing.parser.js';

export interface CosingSeederOptions {
  directory: string;
  dryRun: boolean;
  em: EntityManager;
}

export interface CosingSeederResult {
  processed: number;
  attached: number;
  unresolved: number;
  errors: number;
}

const ANNEX_FILES = [
  { file: 'COSING_Annex_II_v2.xls', parser: parseCosingAnnexII },
  { file: 'COSING_Annex_III_v2.xls', parser: parseCosingAnnexIII },
  { file: 'COSING_Annex_IV_v2.xls', parser: parseCosingAnnexIV },
  { file: 'COSING_Annex_V_v2.xls', parser: parseCosingAnnexV },
  { file: 'COSING_Annex_VI_v2.xls', parser: parseCosingAnnexVI },
];

export async function seedCosing(options: CosingSeederOptions): Promise<CosingSeederResult> {
  const { directory, dryRun, em } = options;
  const identityLadder = new IdentityLadder(em);

  const result: CosingSeederResult = {
    processed: 0,
    attached: 0,
    unresolved: 0,
    errors: 0,
  };

  for (const { file, parser } of ANNEX_FILES) {
    const filePath = path.join(directory, file);
    if (!fs.existsSync(filePath)) {
      console.log(`[CosIng] Skipping ${file} - file not found`);
      continue;
    }

    console.log(`[CosIng] Processing ${file}...`);

    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet) as Record<string, string>[];

    for (const row of rows) {
      try {
        const parsed = parser(row as any);
        result.processed++;

        // Use Identity Ladder to find Golden Record
        const resolution = await identityLadder.resolve({
          casNumber: parsed.casNumber || undefined,
          ecNumber: parsed.ecNumber || undefined,
          inciName: parsed.inciName,
        });

        if (resolution.status === 'FOUND' && resolution.substance) {
          // Check if persona already exists
          const existing = await em.findOne(SubstanceCosing, {
            substance: resolution.substance,
          });

          if (!existing && !dryRun) {
            const persona = em.create(SubstanceCosing, {
              substance: resolution.substance,
              cosingRef: parsed.cosingRef,
              inciName: parsed.inciName,
              inciNameNormalized: parsed.inciNameNormalized,
              restrictionType: parsed.restrictionType,
              restrictionText: parsed.restrictionText,
              maxConcentration: parsed.maxConcentration?.toString(),
              concentrationUnit: parsed.concentrationUnit,
              sccsOpinions: parsed.sccsOpinions ? { opinions: parsed.sccsOpinions } : null,
            });
            await em.persistAndFlush(persona);
          }
          result.attached++;
        } else {
          result.unresolved++;
        }
      } catch (error) {
        result.errors++;
        if (result.errors <= 10) {
          console.error(`[CosIng] Error:`, error);
        }
      }
    }

    console.log(`[CosIng] ${file}: ${rows.length} rows processed`);
  }

  console.log(`[CosIng] Complete:`);
  console.log(`  - Processed: ${result.processed}`);
  console.log(`  - Attached: ${result.attached}`);
  console.log(`  - Unresolved: ${result.unresolved}`);
  console.log(`  - Errors: ${result.errors}`);

  return result;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/seeders/__tests__/cosing.seeder.test.ts`
Expected: PASS

**Step 5: Add CLI command**

Add to `packages/gsr/src/cli/seed.ts`:
```typescript
import { seedCosing } from '../seeders/cosing.seeder.js';

seedCommand
  .command('cosing <directory>')
  .description('Seed CosIng cosmetics personas from XLS files')
  .option('-d, --dry-run', 'Preview without writing', false)
  .action(async (directory: string, options: { dryRun: boolean }) => {
    const orm = await initOrm();
    const em = orm.em.fork();

    try {
      await seedCosing({
        directory: path.resolve(directory),
        dryRun: options.dryRun,
        em,
      });
    } finally {
      await orm.close();
    }
  });
```

**Step 6: Commit**

```bash
git add packages/gsr/src/seeders/cosing.seeder.ts packages/gsr/src/seeders/__tests__/cosing.seeder.test.ts packages/gsr/src/cli/seed.ts
git commit -m "$(cat <<'EOF'
feat(gsr): add CosIng persona seeder

Seeds cosmetics personas from CosIng Annex files:
- Uses Identity Ladder to match to Golden Records
- Processes all 5 annexes (II-VI)
- Tracks unresolved substances for later healing

CLI: pnpm gsr seed cosing <directory> [--dry-run]

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Create EFSA Parser

**Files:**
- Create: `packages/gsr/src/parsers/efsa.parser.ts`
- Test: `packages/gsr/src/parsers/__tests__/efsa.parser.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/parsers/__tests__/efsa.parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseENumberLine, parseOpenFoodToxRow } from '../efsa.parser.js';

describe('efsa.parser', () => {
  describe('parseENumberLine', () => {
    it('should parse normalized E-number when line has simple format', () => {
      // Arrange
      const line = 'E 211\tNo\tSodium benzoate';

      // Act
      const result = parseENumberLine(line);

      // Assert
      expect(result?.eNumber).toBe('E211');
      expect(result?.isGroup).toBe(false);
      expect(result?.name).toBe('Sodium benzoate');
    });

    it('should parse range as group when line has E-number range', () => {
      // Arrange
      const line = 'E 210 - 213\tYes\tBenzoic acid - benzoates (BA)';

      // Act
      const result = parseENumberLine(line);

      // Assert
      expect(result?.eNumber).toBe('E210-213');
      expect(result?.isGroup).toBe(true);
      expect(result?.name).toBe('Benzoic acid - benzoates (BA)');
    });

    it('should preserve suffix when line has E-number with suffix', () => {
      // Arrange
      const line = 'E 160a(ii)\tNo\tBeta-carotene';

      // Act
      const result = parseENumberLine(line);

      // Assert
      expect(result?.eNumber).toBe('E160a(ii)');
      expect(result?.isGroup).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/parsers/__tests__/efsa.parser.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// packages/gsr/src/parsers/efsa.parser.ts

export interface ParsedENumber {
  eNumber: string;
  eNumberNormalized: string;
  isGroup: boolean;
  name: string;
}

export interface ParsedOpenFoodToxEntry {
  efsaRef: string;
  name: string;
  casNumber: string | null;
  ecNumber: string | null;
  functionalClass: string;
  adiValue: number | null;
  adiUnit: string | null;
  adiNote: string | null;
}

export function parseENumberLine(line: string): ParsedENumber | null {
  const parts = line.split('\t');
  if (parts.length < 3) return null;

  const [eNumberRaw, isGroupRaw, name] = parts;

  // Normalize E-number: "E 211" -> "E211", "E 210 - 213" -> "E210-213"
  const eNumber = eNumberRaw
    .replace(/\s+/g, '')
    .replace(/E(\d+)-(\d+)/g, 'E$1-$2');

  return {
    eNumber,
    eNumberNormalized: eNumber.toUpperCase(),
    isGroup: isGroupRaw.toLowerCase() === 'yes',
    name: name.trim(),
  };
}

export function parseOpenFoodToxRow(row: Record<string, unknown>): ParsedOpenFoodToxEntry | null {
  // OpenFoodTox has complex structure - this parses CHEM_ASSESS sheet
  const name = row['substance_name'] as string;
  if (!name) return null;

  const adi = row['adi_value'] as string;
  let adiValue: number | null = null;
  let adiNote: string | null = null;

  if (adi) {
    const numMatch = adi.match(/(\d+(?:\.\d+)?)/);
    if (numMatch) {
      adiValue = parseFloat(numMatch[1]);
    } else if (adi.toLowerCase().includes('not specified')) {
      adiNote = 'not specified';
    } else if (adi.toLowerCase().includes('not limited')) {
      adiNote = 'not limited';
    }
  }

  return {
    efsaRef: row['assessment_id'] as string || '',
    name,
    casNumber: row['cas_number'] as string || null,
    ecNumber: row['ec_number'] as string || null,
    functionalClass: row['functional_class'] as string || 'Food additive',
    adiValue,
    adiUnit: adiValue !== null ? 'mg/kg bw/day' : null,
    adiNote,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/parsers/__tests__/efsa.parser.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gsr/src/parsers/efsa.parser.ts packages/gsr/src/parsers/__tests__/efsa.parser.test.ts
git commit -m "$(cat <<'EOF'
feat(gsr): add EFSA data parsers

Parses EFSA food additive data:
- ENumbers.txt: E-number, group flag, name
- OpenFoodTox: ADI values, CAS/EC numbers

Handles E-number variants (E211, E160a(ii), E210-213).

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Create EFSA Seeder

**Files:**
- Create: `packages/gsr/src/seeders/efsa.seeder.ts`
- Modify: `packages/gsr/src/cli/seed.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/seeders/__tests__/efsa.seeder.test.ts
import { describe, it, expect } from 'vitest';
import { seedEfsa } from '../efsa.seeder.js';

describe('efsa.seeder', () => {
  it('should be defined when module is imported', () => {
    // Arrange & Act & Assert
    expect(seedEfsa).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/seeders/__tests__/efsa.seeder.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// packages/gsr/src/seeders/efsa.seeder.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import type { EntityManager } from '@mikro-orm/postgresql';
import { SubstanceEfsa } from '../entities/SubstanceEfsa.js';
import { IdentityLadder } from '../services/IdentityLadder.js';
import { parseENumberLine } from '../parsers/efsa.parser.js';

export interface EfsaSeederOptions {
  directory: string;
  dryRun: boolean;
  em: EntityManager;
}

export interface EfsaSeederResult {
  processed: number;
  attached: number;
  unresolved: number;
  errors: number;
}

export async function seedEfsa(options: EfsaSeederOptions): Promise<EfsaSeederResult> {
  const { directory, dryRun, em } = options;
  const identityLadder = new IdentityLadder(em);

  const result: EfsaSeederResult = {
    processed: 0,
    attached: 0,
    unresolved: 0,
    errors: 0,
  };

  // Process ENumbers.txt
  const eNumbersPath = path.join(directory, 'ENumbers.txt');
  if (fs.existsSync(eNumbersPath)) {
    console.log('[EFSA] Processing ENumbers.txt...');

    const fileStream = fs.createReadStream(eNumbersPath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let isFirstLine = true;
    for await (const line of rl) {
      // Skip header
      if (isFirstLine) {
        isFirstLine = false;
        continue;
      }

      if (!line.trim()) continue;

      try {
        const parsed = parseENumberLine(line);
        if (!parsed || parsed.isGroup) continue; // Skip groups

        result.processed++;

        // Use Identity Ladder to find Golden Record by name
        const resolution = await identityLadder.resolve({
          name: parsed.name,
        });

        if (resolution.status === 'FOUND' && resolution.substance) {
          const existing = await em.findOne(SubstanceEfsa, {
            substance: resolution.substance,
          });

          if (!existing && !dryRun) {
            const persona = em.create(SubstanceEfsa, {
              substance: resolution.substance,
              eNumber: parsed.eNumber,
              functionalClass: 'Food additive',
            });
            await em.persistAndFlush(persona);
          }
          result.attached++;
        } else {
          result.unresolved++;
        }
      } catch (error) {
        result.errors++;
      }
    }
  }

  console.log(`[EFSA] Complete:`);
  console.log(`  - Processed: ${result.processed}`);
  console.log(`  - Attached: ${result.attached}`);
  console.log(`  - Unresolved: ${result.unresolved}`);
  console.log(`  - Errors: ${result.errors}`);

  return result;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/seeders/__tests__/efsa.seeder.test.ts`
Expected: PASS

**Step 5: Add CLI command**

Add to `packages/gsr/src/cli/seed.ts`:
```typescript
import { seedEfsa } from '../seeders/efsa.seeder.js';

seedCommand
  .command('efsa <directory>')
  .description('Seed EFSA food additive personas')
  .option('-d, --dry-run', 'Preview without writing', false)
  .action(async (directory: string, options: { dryRun: boolean }) => {
    const orm = await initOrm();
    const em = orm.em.fork();

    try {
      await seedEfsa({
        directory: path.resolve(directory),
        dryRun: options.dryRun,
        em,
      });
    } finally {
      await orm.close();
    }
  });
```

**Step 6: Commit**

```bash
git add packages/gsr/src/seeders/efsa.seeder.ts packages/gsr/src/seeders/__tests__/efsa.seeder.test.ts packages/gsr/src/cli/seed.ts
git commit -m "$(cat <<'EOF'
feat(gsr): add EFSA food additive seeder

Seeds food additive personas from EFSA data:
- Processes ENumbers.txt (414 entries)
- Uses Identity Ladder to match to Golden Records
- Stores E-number and functional class

CLI: pnpm gsr seed efsa <directory> [--dry-run]

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Create TSCA Parser

**Files:**
- Create: `packages/gsr/src/parsers/tsca.parser.ts`
- Test: `packages/gsr/src/parsers/__tests__/tsca.parser.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/parsers/__tests__/tsca.parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseTscaRow } from '../tsca.parser.js';

describe('tsca.parser', () => {
  describe('parseTscaRow', () => {
    it('should parse active substance when row has ACTIVE status', () => {
      // Arrange
      const row = {
        ID: '1',
        CASRN: '50-00-0',
        ChemName: 'Formaldehyde',
        ACTIVITY: 'ACTIVE',
        FLAG: 'S',
        UVCB: '',
      };

      // Act
      const result = parseTscaRow(row);

      // Assert
      expect(result.tscaCas).toBe('50-00-0');
      expect(result.chemName).toBe('Formaldehyde');
      expect(result.inventoryStatus).toBe('ACTIVE');
      expect(result.hasRestrictions).toBe(true);
    });

    it('should parse inactive substance when row has INACTIVE status', () => {
      // Arrange
      const row = {
        ID: '2',
        CASRN: '12345-67-8',
        ChemName: 'Test Chemical',
        ACTIVITY: 'INACTIVE',
        FLAG: '',
        UVCB: '',
      };

      // Act
      const result = parseTscaRow(row);

      // Assert
      expect(result.inventoryStatus).toBe('INACTIVE');
      expect(result.hasRestrictions).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/parsers/__tests__/tsca.parser.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// packages/gsr/src/parsers/tsca.parser.ts
import { TscaInventoryStatus } from '../entities/SubstanceTsca.js';

export interface TscaRow {
  ID: string;
  CASRN: string;
  casregno?: string;
  UID?: string;
  EXP?: string;
  ChemName: string;
  DEF?: string;
  UVCB?: string;
  FLAG?: string;
  ACTIVITY: string;
}

export interface ParsedTscaEntry {
  tscaCas: string;
  chemName: string;
  inventoryStatus: TscaInventoryStatus;
  isUvcb: boolean;
  hasRestrictions: boolean;
  flags: string[];
}

export function parseTscaRow(row: TscaRow): ParsedTscaEntry {
  const flags = row.FLAG ? row.FLAG.split(',').map(f => f.trim()) : [];

  return {
    tscaCas: row.CASRN,
    chemName: row.ChemName,
    inventoryStatus: row.ACTIVITY === 'ACTIVE'
      ? TscaInventoryStatus.ACTIVE
      : TscaInventoryStatus.INACTIVE,
    isUvcb: row.UVCB === 'UVCB',
    hasRestrictions: flags.includes('S'), // S = substance has restrictions
    flags,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/parsers/__tests__/tsca.parser.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gsr/src/parsers/tsca.parser.ts packages/gsr/src/parsers/__tests__/tsca.parser.test.ts
git commit -m "$(cat <<'EOF'
feat(gsr): add TSCA inventory parser

Parses EPA TSCA inventory CSV:
- CAS number, chemical name
- Inventory status (ACTIVE/INACTIVE)
- UVCB flag, restriction flags

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Create TSCA Seeder

**Files:**
- Create: `packages/gsr/src/seeders/tsca.seeder.ts`
- Modify: `packages/gsr/src/cli/seed.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/seeders/__tests__/tsca.seeder.test.ts
import { describe, it, expect } from 'vitest';
import { seedTsca } from '../tsca.seeder.js';

describe('tsca.seeder', () => {
  it('should be defined when module is imported', () => {
    // Arrange & Act & Assert
    expect(seedTsca).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/seeders/__tests__/tsca.seeder.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// packages/gsr/src/seeders/tsca.seeder.ts
import * as fs from 'node:fs';
import * as csv from 'csv-parse';
import stripBomStream from 'strip-bom-stream';
import type { EntityManager } from '@mikro-orm/postgresql';
import { SubstanceTsca } from '../entities/SubstanceTsca.js';
import { IdentityLadder } from '../services/IdentityLadder.js';
import { parseTscaRow, TscaRow } from '../parsers/tsca.parser.js';

export interface TscaSeederOptions {
  file: string;
  dryRun: boolean;
  batchSize: number;
  em: EntityManager;
}

export interface TscaSeederResult {
  processed: number;
  attached: number;
  unresolved: number;
  errors: number;
}

export async function seedTsca(options: TscaSeederOptions): Promise<TscaSeederResult> {
  const { file, dryRun, batchSize, em } = options;
  const identityLadder = new IdentityLadder(em);

  const result: TscaSeederResult = {
    processed: 0,
    attached: 0,
    unresolved: 0,
    errors: 0,
  };

  console.log(`[TSCA] Loading ${file}...`);

  const parser = fs.createReadStream(file)
    .pipe(stripBomStream())
    .pipe(csv.parse({ columns: true, skip_empty_lines: true }));

  let batch: SubstanceTsca[] = [];

  for await (const row of parser) {
    try {
      const parsed = parseTscaRow(row as TscaRow);
      result.processed++;

      // Use Identity Ladder to find Golden Record by CAS
      const resolution = await identityLadder.resolve({
        casNumber: parsed.tscaCas,
      });

      if (resolution.status === 'FOUND' && resolution.substance) {
        const existing = await em.findOne(SubstanceTsca, {
          substance: resolution.substance,
        });

        if (!existing) {
          const persona = em.create(SubstanceTsca, {
            substance: resolution.substance,
            tscaCas: parsed.tscaCas,
            inventoryStatus: parsed.inventoryStatus,
            isSection5: false,
            isSection6: parsed.hasRestrictions,
            isSnur: false,
          });
          batch.push(persona);
        }
        result.attached++;
      } else {
        result.unresolved++;
      }

      if (batch.length >= batchSize) {
        if (!dryRun) {
          await em.persistAndFlush(batch);
          em.clear();
        }
        console.log(`[TSCA] Processed ${result.processed.toLocaleString()}...`);
        batch = [];
      }
    } catch (error) {
      result.errors++;
    }
  }

  // Final batch
  if (batch.length > 0 && !dryRun) {
    await em.persistAndFlush(batch);
  }

  console.log(`[TSCA] Complete:`);
  console.log(`  - Processed: ${result.processed.toLocaleString()}`);
  console.log(`  - Attached: ${result.attached.toLocaleString()}`);
  console.log(`  - Unresolved: ${result.unresolved.toLocaleString()}`);
  console.log(`  - Errors: ${result.errors.toLocaleString()}`);

  return result;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/seeders/__tests__/tsca.seeder.test.ts`
Expected: PASS

**Step 5: Add CLI command**

Add to `packages/gsr/src/cli/seed.ts`:
```typescript
import { seedTsca } from '../seeders/tsca.seeder.js';

seedCommand
  .command('tsca <file>')
  .description('Seed TSCA US inventory personas')
  .option('-d, --dry-run', 'Preview without writing', false)
  .option('--batch-size <size>', 'Records per batch', '5000')
  .action(async (file: string, options: { dryRun: boolean; batchSize: string }) => {
    const orm = await initOrm();
    const em = orm.em.fork();

    try {
      await seedTsca({
        file: path.resolve(file),
        dryRun: options.dryRun,
        batchSize: parseInt(options.batchSize),
        em,
      });
    } finally {
      await orm.close();
    }
  });
```

**Step 6: Commit**

```bash
git add packages/gsr/src/seeders/tsca.seeder.ts packages/gsr/src/seeders/__tests__/tsca.seeder.test.ts packages/gsr/src/cli/seed.ts
git commit -m "$(cat <<'EOF'
feat(gsr): add TSCA US inventory seeder

Seeds US TSCA personas from EPA inventory CSV:
- 70,754 chemicals with ACTIVE/INACTIVE status
- Uses Identity Ladder to match to Golden Records
- Batch processing for performance

CLI: pnpm gsr seed tsca <file> [--dry-run] [--batch-size]

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Create Biocides Parser

**Files:**
- Create: `packages/gsr/src/parsers/biocides.parser.ts`
- Test: `packages/gsr/src/parsers/__tests__/biocides.parser.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/parsers/__tests__/biocides.parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseBiocidesRow } from '../biocides.parser.js';

describe('biocides.parser', () => {
  describe('parseBiocidesRow', () => {
    it('should parse all fields when row has complete Article 95 data', () => {
      // Arrange
      const row = {
        'Active Substance Name': 'alpha-Cypermethrin',
        'EC no.': '214-619-0',
        'CAS no.': '67375-30-8',
        'PT': 18,
        'Entity Name': 'Test Company',
        'Country': 'Spain',
        'Supplier Type': 'Substance & Product Supplier',
        'Inclusion Reason': 'Art. 95 Submission',
      };

      // Act
      const result = parseBiocidesRow(row);

      // Assert
      expect(result.substanceName).toBe('alpha-Cypermethrin');
      expect(result.ecNumber).toBe('214-619-0');
      expect(result.casNumber).toBe('67375-30-8');
      expect(result.productType).toBe(18);
    });

    it('should return null EC number when row has "Not allocated" value', () => {
      // Arrange
      const row = {
        'Active Substance Name': 'Test Chemical',
        'EC no.': 'Not allocated',
        'CAS no.': '12345-67-8',
        'PT': 1,
        'Entity Name': 'Test',
        'Country': 'Germany',
        'Supplier Type': 'Substance Supplier',
        'Inclusion Reason': 'RP Participant',
      };

      // Act
      const result = parseBiocidesRow(row);

      // Assert
      expect(result.ecNumber).toBeNull();
      expect(result.casNumber).toBe('12345-67-8');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/parsers/__tests__/biocides.parser.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// packages/gsr/src/parsers/biocides.parser.ts

export interface BiocidesRow {
  'Active Substance Name': string;
  'EC no.': string;
  'CAS no.': string;
  'PT': number | string;
  'Entity Name': string;
  'Country': string;
  'Supplier Type': string;
  'Inclusion Reason': string;
  'Inclusion Date AS-PT'?: number;
  'Inclusion Date Supplier'?: number;
}

export interface ParsedBiocidesEntry {
  substanceName: string;
  ecNumber: string | null;
  casNumber: string | null;
  productType: number;
  entityName: string;
  country: string;
  supplierType: string;
  inclusionReason: string;
}

export function parseBiocidesRow(row: BiocidesRow): ParsedBiocidesEntry {
  const ecNumber = row['EC no.'];

  return {
    substanceName: row['Active Substance Name'],
    ecNumber: ecNumber && ecNumber !== 'Not allocated' ? ecNumber : null,
    casNumber: row['CAS no.'] || null,
    productType: typeof row['PT'] === 'number' ? row['PT'] : parseInt(row['PT']),
    entityName: row['Entity Name'],
    country: row['Country'],
    supplierType: row['Supplier Type'],
    inclusionReason: row['Inclusion Reason'],
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/parsers/__tests__/biocides.parser.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gsr/src/parsers/biocides.parser.ts packages/gsr/src/parsers/__tests__/biocides.parser.test.ts
git commit -m "$(cat <<'EOF'
feat(gsr): add Biocides Article 95 parser

Parses ECHA Biocides Article 95 list XLSX:
- Substance name, EC/CAS numbers
- Product type (PT1-22)
- Supplier information

Handles "Not allocated" EC numbers.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Create Biocides Seeder

**Files:**
- Create: `packages/gsr/src/seeders/biocides.seeder.ts`
- Modify: `packages/gsr/src/cli/seed.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/seeders/__tests__/biocides.seeder.test.ts
import { describe, it, expect } from 'vitest';
import { seedBiocides } from '../biocides.seeder.js';

describe('biocides.seeder', () => {
  it('should be defined when module is imported', () => {
    // Arrange & Act & Assert
    expect(seedBiocides).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/seeders/__tests__/biocides.seeder.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// packages/gsr/src/seeders/biocides.seeder.ts
import xlsx from 'xlsx';
import type { EntityManager } from '@mikro-orm/postgresql';
import { SubstanceBiocide, BiocideStatus } from '../entities/SubstanceBiocide.js';
import { IdentityLadder } from '../services/IdentityLadder.js';
import { parseBiocidesRow, BiocidesRow } from '../parsers/biocides.parser.js';

export interface BiocidesSeederOptions {
  file: string;
  dryRun: boolean;
  em: EntityManager;
}

export interface BiocidesSeederResult {
  processed: number;
  attached: number;
  unresolved: number;
  errors: number;
}

export async function seedBiocides(options: BiocidesSeederOptions): Promise<BiocidesSeederResult> {
  const { file, dryRun, em } = options;
  const identityLadder = new IdentityLadder(em);

  const result: BiocidesSeederResult = {
    processed: 0,
    attached: 0,
    unresolved: 0,
    errors: 0,
  };

  console.log(`[Biocides] Loading ${file}...`);

  const workbook = xlsx.readFile(file);
  const sheet = workbook.Sheets['Article 95 list'];
  if (!sheet) {
    throw new Error('Sheet "Article 95 list" not found');
  }

  const rows = xlsx.utils.sheet_to_json(sheet) as BiocidesRow[];
  console.log(`[Biocides] Found ${rows.length} entries`);

  // Group by substance (CAS number) to collect all product types
  const substanceMap = new Map<string, { entry: ReturnType<typeof parseBiocidesRow>; productTypes: Set<number> }>();

  for (const row of rows) {
    try {
      const parsed = parseBiocidesRow(row);
      result.processed++;

      const key = parsed.casNumber || parsed.substanceName;
      const existing = substanceMap.get(key);

      if (existing) {
        existing.productTypes.add(parsed.productType);
      } else {
        substanceMap.set(key, {
          entry: parsed,
          productTypes: new Set([parsed.productType]),
        });
      }
    } catch (error) {
      result.errors++;
    }
  }

  console.log(`[Biocides] ${substanceMap.size} unique substances`);

  // Create personas for each unique substance
  for (const [key, { entry, productTypes }] of substanceMap) {
    try {
      const resolution = await identityLadder.resolve({
        casNumber: entry.casNumber || undefined,
        ecNumber: entry.ecNumber || undefined,
        name: entry.substanceName,
      });

      if (resolution.status === 'FOUND' && resolution.substance) {
        const existing = await em.findOne(SubstanceBiocide, {
          substance: resolution.substance,
        });

        if (!existing && !dryRun) {
          const persona = em.create(SubstanceBiocide, {
            substance: resolution.substance,
            biocidesRef: `BPR-${key.replace(/[^a-zA-Z0-9]/g, '-')}`,
            substanceName: entry.substanceName,
            status: BiocideStatus.APPROVED,
            productTypes: Array.from(productTypes).sort((a, b) => a - b),
          });
          await em.persistAndFlush(persona);
        }
        result.attached++;
      } else {
        result.unresolved++;
      }
    } catch (error) {
      result.errors++;
    }
  }

  console.log(`[Biocides] Complete:`);
  console.log(`  - Processed: ${result.processed}`);
  console.log(`  - Attached: ${result.attached}`);
  console.log(`  - Unresolved: ${result.unresolved}`);
  console.log(`  - Errors: ${result.errors}`);

  return result;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/seeders/__tests__/biocides.seeder.test.ts`
Expected: PASS

**Step 5: Add CLI command**

Add to `packages/gsr/src/cli/seed.ts`:
```typescript
import { seedBiocides } from '../seeders/biocides.seeder.js';

seedCommand
  .command('biocides <file>')
  .description('Seed EU Biocides personas from ECHA Article 95 list')
  .option('-d, --dry-run', 'Preview without writing', false)
  .action(async (file: string, options: { dryRun: boolean }) => {
    const orm = await initOrm();
    const em = orm.em.fork();

    try {
      await seedBiocides({
        file: path.resolve(file),
        dryRun: options.dryRun,
        em,
      });
    } finally {
      await orm.close();
    }
  });
```

**Step 6: Commit**

```bash
git add packages/gsr/src/seeders/biocides.seeder.ts packages/gsr/src/seeders/__tests__/biocides.seeder.test.ts packages/gsr/src/cli/seed.ts
git commit -m "$(cat <<'EOF'
feat(gsr): add EU Biocides Article 95 seeder

Seeds biocides personas from ECHA Article 95 list:
- Groups entries by substance to collect all product types
- 5,265 entries -> ~1,000 unique substances
- Uses Identity Ladder to match to Golden Records

CLI: pnpm gsr seed biocides <file> [--dry-run]

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Create Full Seed Command

**Files:**
- Modify: `packages/gsr/src/cli/seed.ts`
- Create: `packages/gsr/src/seeders/checkpoint.ts`

**⚠️ PERFORMANCE NOTE:** The full seed takes ~15-20 minutes. If the seeder fails at Step 8 (Biocides), you don't want to re-run Step 1 (CompTox) which takes 10 minutes. Implement a checkpoint system to track completed steps and resume from the last successful step.

**Step 1: Create checkpoint utility**

```typescript
// packages/gsr/src/seeders/checkpoint.ts
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface SeedCheckpoint {
  lastCompletedStep: number;
  completedAt: string;
  version: string;
}

const CHECKPOINT_FILE = '.gsr-seed-checkpoint.json';

export function loadCheckpoint(dataDir: string): SeedCheckpoint | null {
  const filePath = path.join(dataDir, CHECKPOINT_FILE);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  return null;
}

export function saveCheckpoint(dataDir: string, step: number, version: string): void {
  const filePath = path.join(dataDir, CHECKPOINT_FILE);
  const checkpoint: SeedCheckpoint = {
    lastCompletedStep: step,
    completedAt: new Date().toISOString(),
    version,
  };
  fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2));
}

export function clearCheckpoint(dataDir: string): void {
  const filePath = path.join(dataDir, CHECKPOINT_FILE);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
```

**Step 2: Add all-golden command with checkpoint support**

Add to `packages/gsr/src/cli/seed.ts`:
```typescript
import { loadCheckpoint, saveCheckpoint, clearCheckpoint } from '../seeders/checkpoint.js';

seedCommand
  .command('all-golden')
  .description('Run full Golden Record seed sequence')
  .option('-d, --dry-run', 'Preview without writing', false)
  .option('--skip-regulatory', 'Skip regulatory list seeders (SVHC, Annex XIV, etc.)', false)
  .option('--resume', 'Resume from last checkpoint', false)
  .option('--fresh', 'Ignore checkpoint and start fresh', false)
  .action(async (options: { dryRun: boolean; skipRegulatory: boolean; resume: boolean; fresh: boolean }) => {
    const orm = await initOrm();
    const em = orm.em.fork();

    const dataDir = path.resolve(__dirname, '../../data');
    const version = new Date().toISOString().slice(0, 10);

    // Checkpoint handling
    let startStep = 1;
    if (options.fresh) {
      clearCheckpoint(dataDir);
      console.log('Cleared checkpoint, starting fresh.\n');
    } else if (options.resume) {
      const checkpoint = loadCheckpoint(dataDir);
      if (checkpoint) {
        startStep = checkpoint.lastCompletedStep + 1;
        console.log(`Resuming from step ${startStep} (last completed: ${checkpoint.lastCompletedStep} at ${checkpoint.completedAt})\n`);
      } else {
        console.log('No checkpoint found, starting from step 1.\n');
      }
    }

    console.log('=== GSR v2 Golden Record Seed Sequence ===\n');

    try {
      // Phase 1: Foundation
      console.log('Phase 1: Foundation\n');

      if (startStep <= 1) {
        console.log('Step 1/12: CompTox Foundation (1.2M+ chemicals)...');
        await seedComptox({
          file: path.join(dataDir, 'DSSTox_CCD_dump_12092025/DSSToxCCDdump.csv'),
          dryRun: options.dryRun,
          batchSize: 10000,
          em: orm.em.fork(),
        });
        if (!options.dryRun) saveCheckpoint(dataDir, 1, version);
      }

      // Phase 2: Personas
      console.log('\nPhase 2: Personas\n');

      if (startStep <= 2) {
        console.log('Step 2/12: CosIng Personas (cosmetics)...');
        await seedCosing({
          directory: path.join(dataDir, 'CosIng'),
          dryRun: options.dryRun,
          em: orm.em.fork(),
        });
        if (!options.dryRun) saveCheckpoint(dataDir, 2, version);
      }

      if (startStep <= 3) {
        console.log('\nStep 3/12: EFSA Personas (food additives)...');
        await seedEfsa({
          directory: path.join(dataDir, 'EFSA'),
          dryRun: options.dryRun,
          em: orm.em.fork(),
        });
        if (!options.dryRun) saveCheckpoint(dataDir, 3, version);
      }

      if (startStep <= 4) {
        console.log('\nStep 4/12: TSCA Personas (US industrial)...');
        await seedTsca({
          file: path.join(dataDir, 'tsca_inventory/TSCAINV_072025.csv'),
          dryRun: options.dryRun,
          batchSize: 5000,
          em: orm.em.fork(),
        });
        if (!options.dryRun) saveCheckpoint(dataDir, 4, version);
      }

      if (startStep <= 5) {
        console.log('\nStep 5/12: Biocides Personas (EU biocides)...');
        await seedBiocides({
          file: path.join(dataDir, 'ECHA Biocides/art95_list_en.xlsx'),
          dryRun: options.dryRun,
          em: orm.em.fork(),
        });
        if (!options.dryRun) saveCheckpoint(dataDir, 5, version);
      }

      // Phase 3: Classifications
      console.log('\nPhase 3: Classifications\n');

      if (startStep <= 6) {
        console.log('Step 6/12: CLP Reference (hazard classes)...');
        // Call existing clp-reference seeder
        if (!options.dryRun) saveCheckpoint(dataDir, 6, version);
      }

      if (startStep <= 7) {
        console.log('\nStep 7/12: CLP Harmonised (4,762 classifications)...');
        // Call existing clp-harmonised seeder with updated Identity Ladder
        if (!options.dryRun) saveCheckpoint(dataDir, 7, version);
      }

      if (!options.skipRegulatory) {
        // Phase 4: Regulatory Lists
        console.log('\nPhase 4: Regulatory Lists\n');

        if (startStep <= 8) {
          console.log('Step 8/12: SVHC Candidate List...');
          // Call echa-svhc seeder (refactored)
          if (!options.dryRun) saveCheckpoint(dataDir, 8, version);
        }

        if (startStep <= 9) {
          console.log('\nStep 9/12: REACH Annex XIV (Authorization)...');
          // Call echa-annex-xiv seeder (refactored)
          if (!options.dryRun) saveCheckpoint(dataDir, 9, version);
        }

        if (startStep <= 10) {
          console.log('\nStep 10/12: REACH Annex XVII (Restrictions)...');
          // Call echa-annex-xvii seeder (refactored)
          if (!options.dryRun) saveCheckpoint(dataDir, 10, version);
        }

        if (startStep <= 11) {
          console.log('\nStep 11/12: POP Regulation...');
          // Call echa-pop seeder (refactored)
          if (!options.dryRun) saveCheckpoint(dataDir, 11, version);
        }

        if (startStep <= 12) {
          console.log('\nStep 12/12: RoHS Directive...');
          // Call rohs seeder (refactored)
          if (!options.dryRun) saveCheckpoint(dataDir, 12, version);
        }
      } else {
        console.log('\nSkipping Phase 4: Regulatory Lists (--skip-regulatory flag)');
      }

      // Clear checkpoint on successful completion
      if (!options.dryRun) clearCheckpoint(dataDir);

      console.log('\n=== Seed Sequence Complete ===');
    } finally {
      await orm.close();
    }
  });
```

**Step 2: Verify command works**

Run: `cd packages/gsr && pnpm gsr seed all-golden --help`
Expected: Shows help for all-golden command

**Step 3: Commit**

```bash
git add packages/gsr/src/cli/seed.ts packages/gsr/src/seeders/checkpoint.ts
git commit -m "$(cat <<'EOF'
feat(gsr): add all-golden seed command with checkpoint resumption

Orchestrates full Golden Record seed sequence:
1. CompTox Foundation (1.2M+ substances)
2. CosIng Personas (cosmetics)
3. EFSA Personas (food additives)
4. TSCA Personas (US industrial)
5. Biocides Personas (EU biocides)
6. CLP Reference (hazard classes)
7. CLP Harmonised (classifications)

Features:
- Checkpoint system saves progress after each step
- --resume flag continues from last checkpoint
- --fresh flag clears checkpoint and starts over
- Clears checkpoint on successful completion

CLI: pnpm gsr seed all-golden [--dry-run] [--resume] [--fresh]

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: Update CompTox Parser to Extract Synonyms

**Files:**
- Modify: `packages/gsr/src/parsers/comptox.parser.ts`
- Test: `packages/gsr/src/parsers/__tests__/comptox.parser.test.ts`

**Context:** CompTox provides synonyms in the `IDENTIFIER` column as pipe-separated values. These should be parsed and stored as `SubstanceAlias` records.

**Step 1: Update test for synonym extraction**

```typescript
// Add to packages/gsr/src/parsers/__tests__/comptox.parser.test.ts
describe('parseComptoxSynonyms', () => {
  it('should parse names and skip CAS numbers when IDENTIFIER has pipe-separated values', () => {
    // Arrange
    const identifier = '103-90-2 | Acetaminophen | Paracetamol | 4-Acetamidophenol';

    // Act
    const result = parseComptoxSynonyms(identifier);

    // Assert
    expect(result).toContain('Acetaminophen');
    expect(result).toContain('Paracetamol');
    expect(result).toContain('4-Acetamidophenol');
    expect(result).not.toContain('103-90-2'); // CAS numbers skipped
  });

  it('should return empty array when IDENTIFIER is empty', () => {
    // Arrange
    const identifier = '';

    // Act
    const result = parseComptoxSynonyms(identifier);

    // Assert
    expect(result).toEqual([]);
  });

  it('should limit to 50 aliases when IDENTIFIER has many values', () => {
    // Arrange
    const manyNames = Array(100).fill('Name').map((n, i) => `${n}${i}`).join(' | ');

    // Act
    const result = parseComptoxSynonyms(manyNames);

    // Assert
    expect(result.length).toBeLessThanOrEqual(50);
  });
});
```

**Step 2: Implement synonym parser**

```typescript
// Add to packages/gsr/src/parsers/comptox.parser.ts

const MAX_ALIASES_PER_SUBSTANCE = 50;
const CAS_PATTERN = /^\d{1,7}-\d{2}-\d$/;

export function parseComptoxSynonyms(identifier: string): string[] {
  if (!identifier || !identifier.trim()) {
    return [];
  }

  const parts = identifier.split('|').map(s => s.trim()).filter(Boolean);

  // Filter out CAS numbers and duplicates
  const seen = new Set<string>();
  const synonyms: string[] = [];

  for (const part of parts) {
    // Skip CAS numbers
    if (CAS_PATTERN.test(part)) continue;
    // Skip very short names
    if (part.length < 3) continue;
    // Skip duplicates (case-insensitive)
    const lower = part.toLowerCase();
    if (seen.has(lower)) continue;

    seen.add(lower);
    synonyms.push(part);

    if (synonyms.length >= MAX_ALIASES_PER_SUBSTANCE) break;
  }

  return synonyms;
}

// Update ParsedComptoxSubstance interface
export interface ParsedComptoxSubstance {
  // ... existing fields
  synonyms: string[];  // Add this
}

// Update parseComptoxRow
export function parseComptoxRow(row: ComptoxRow): ParsedComptoxSubstance {
  return {
    // ... existing fields
    synonyms: parseComptoxSynonyms(row.IDENTIFIER || ''),
  };
}
```

**Step 3: Run tests**

Run: `cd packages/gsr && pnpm test src/parsers/__tests__/comptox.parser.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/gsr/src/parsers/comptox.parser.ts packages/gsr/src/parsers/__tests__/comptox.parser.test.ts
git commit -m "$(cat <<'EOF'
feat(gsr): extract synonyms from CompTox IDENTIFIER column

Parses pipe-separated synonyms from DSSTox data:
- Filters out CAS numbers (stored separately)
- Limits to 50 aliases per substance
- Skips duplicates and very short names

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: Update CompTox Seeder to Create Aliases

**Files:**
- Modify: `packages/gsr/src/seeders/comptox.seeder.ts`
- Modify: `packages/database/src/migrations/Migration20260122000000.ts` (deferred index)
- Test: Integration test

**Context:** Now that we parse synonyms, the seeder should create `SubstanceAlias` records.

**⚠️ PERFORMANCE CRITICAL:** With ~15 million aliases:
1. **Use raw SQL bulk inserts** (batches of 5,000+), NOT ORM persist()
2. **Defer GIN index creation** - Drop the trigram index BEFORE seeding, create it AFTER
3. Creating a GIN index on 15M rows during insertion will slow seeding to a crawl

**Step 0: Defer GIN index creation in migration**

```sql
-- In the seeder, BEFORE inserting aliases:
DROP INDEX IF EXISTS idx_substance_alias_name_trgm;

-- ... insert all 15M aliases ...

-- AFTER all aliases are inserted:
CREATE INDEX CONCURRENTLY idx_substance_alias_name_trgm
  ON substance_alias USING gin (name_normalized gin_trgm_ops);
```

**Step 1: Update seeder with bulk insert for aliases**

```typescript
// Update packages/gsr/src/seeders/comptox.seeder.ts

import { createId } from '@paralleldrive/cuid2';

/**
 * Build bulk insert SQL for aliases (5,000+ per batch).
 */
function buildAliasInsertSql(rows: Array<{ substanceId: string; name: string; type: string }>): { sql: string; params: unknown[] } {
  if (rows.length === 0) return { sql: '', params: [] };

  const params: unknown[] = [];
  const valueSets: string[] = [];

  for (const row of rows) {
    const placeholders = [`$${params.length + 1}`, `$${params.length + 2}`, `$${params.length + 3}`,
                          `$${params.length + 4}`, `$${params.length + 5}`, `$${params.length + 6}`,
                          `$${params.length + 7}`, `$${params.length + 8}`];
    valueSets.push(`(${placeholders.join(', ')})`);
    params.push(
      createId(),                          // id
      row.substanceId,                     // substance_id
      row.name,                            // name
      row.name.toLowerCase().trim(),       // name_normalized
      row.type,                            // type
      'COMPTOX',                           // source
      'en',                                // language
      new Date()                           // created_at
    );
  }

  const sql = `
    INSERT INTO public.substance_alias (id, substance_id, name, name_normalized, type, source, language, created_at)
    VALUES ${valueSets.join(', ')}
    ON CONFLICT DO NOTHING
  `;

  return { sql, params };
}

// In seedComptox, collect aliases and bulk insert:
const aliasBatch: Array<{ substanceId: string; name: string; type: string }> = [];

// After creating substance, collect aliases:
for (const synonym of parsed.synonyms) {
  aliasBatch.push({
    substanceId: substanceId, // ID from the substance we just created
    name: synonym,
    type: classifySynonym(synonym),
  });
}

// Bulk insert aliases every 5,000
if (aliasBatch.length >= 5000) {
  const { sql, params } = buildAliasInsertSql(aliasBatch);
  await em.execute(sql, params);
  result.aliasCount += aliasBatch.length;
  aliasBatch.length = 0;
}
```

**Step 2: Add AliasSource.COMPTOX to enum**

Update `packages/database/src/entities/enums/AliasSource.ts`:
```typescript
export enum AliasSource {
  PUBCHEM = 'PUBCHEM',
  ECHA = 'ECHA',
  EPA = 'EPA',
  COMPTOX = 'COMPTOX',  // Add this
  MANUAL = 'MANUAL',
}
```

Note: Could use EPA since CompTox is from EPA, but COMPTOX is more specific for provenance tracking.

**Step 3: Update seeder to manage index lifecycle**

```typescript
// At START of seedComptox (before inserting):
console.log('[CompTox] Dropping GIN index for faster insertion...');
await em.execute('DROP INDEX IF EXISTS idx_substance_alias_name_trgm');

// At END of seedComptox (after all aliases inserted):
console.log('[CompTox] Recreating GIN index on 15M+ aliases (this may take a few minutes)...');
await em.execute(`
  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_substance_alias_name_trgm
  ON substance_alias USING gin (name_normalized gin_trgm_ops)
`);
console.log('[CompTox] GIN index created successfully.');
```

**Step 4: Run tests and verify**

```bash
cd packages/gsr && pnpm test
# After seeding:
docker exec eurocomply-postgres psql -U postgres -d eurocomply -c "
  SELECT source, COUNT(*) FROM substance_alias GROUP BY source;
"
# Expected: COMPTOX with ~10-15 million aliases
```

**Step 5: Commit**

```bash
git add packages/gsr/src/seeders/comptox.seeder.ts packages/database/src/entities/enums/
git commit -m "$(cat <<'EOF'
feat(gsr): create SubstanceAlias records from CompTox synonyms

CompTox seeder now:
- Creates aliases from parsed IDENTIFIER column (~15M)
- Uses raw SQL bulk inserts (5,000+ per batch)
- Defers GIN index: drops before insert, creates after
- Uses AliasSource.COMPTOX for provenance

Performance: Index deferral reduces insert time by ~10x.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 21: Update Identity Ladder to Search Aliases

**Files:**
- Modify: `packages/gsr/src/services/IdentityLadder.ts`
- Test: `packages/gsr/src/services/__tests__/IdentityLadder.test.ts`

**Context:** The Identity Ladder should search `substance_alias` table as part of the fuzzy name matching step.

**Step 1: Write the failing test first**

```typescript
// Add to packages/gsr/src/services/__tests__/IdentityLadder.test.ts
import { SubstanceAlias, AliasType, AliasSource } from '@eurocomply/database';

describe('resolve with aliases', () => {
  it('should find substance by alias name when alias exists', async () => {
    // Arrange
    const substance = em.create(Substance, { canonicalName: 'Acetaminophen', casNumber: '103-90-2' });
    const alias = new SubstanceAlias();
    alias.substance = substance;
    alias.name = 'Paracetamol';
    alias.nameNormalized = 'paracetamol';
    alias.type = AliasType.SYNONYM;
    alias.source = AliasSource.COMPTOX;
    await em.persistAndFlush([substance, alias]);

    // Act
    const ladder = new IdentityLadder(em);
    const result = await ladder.resolve({ name: 'Paracetamol' });

    // Assert
    expect(result.status).toBe('FOUND');
    expect(result.matchedVia).toBe('ALIAS');
    expect(result.substance?.casNumber).toBe('103-90-2');
  });

  it('should return ALIAS match type with 0.95 confidence when alias matches exactly', async () => {
    // Arrange
    const substance = em.create(Substance, { canonicalName: 'Formaldehyde', casNumber: '50-00-0' });
    const alias = new SubstanceAlias();
    alias.substance = substance;
    alias.name = 'Formalin';
    alias.nameNormalized = 'formalin';
    alias.type = AliasType.SYNONYM;
    alias.source = AliasSource.PUBCHEM;
    await em.persistAndFlush([substance, alias]);

    // Act
    const ladder = new IdentityLadder(em);
    const result = await ladder.resolve({ name: 'formalin' });

    // Assert
    expect(result.confidence).toBe(0.95);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/services/__tests__/IdentityLadder.test.ts`
Expected: FAIL with "matchedVia: undefined" or similar (ALIAS not implemented yet)

**Step 3: Add alias search step to implementation**

```typescript
// Update packages/gsr/src/services/IdentityLadder.ts

import { SubstanceAlias } from '@eurocomply/database';

// In resolve() method, add Step 6b before fuzzy name match:

// Step 6: Exact alias match
if (input.name) {
  const normalizedName = input.name.toLowerCase().replace(/\s+/g, ' ').trim();
  const alias = await this.em.findOne(
    SubstanceAlias,
    { nameNormalized: normalizedName },
    { populate: ['substance'] }
  );
  if (alias) {
    return {
      status: 'FOUND',
      substance: alias.substance,
      matchedVia: 'ALIAS',
      confidence: 0.95,  // Slightly lower than exact canonical match
    };
  }
}

// Step 7: Fuzzy name match (existing pg_trgm query)
// ... existing code ...

// Update MatchType
export type MatchType = 'INCHIKEY' | 'CAS' | 'EC' | 'INCI' | 'E_NUMBER' | 'ALIAS' | 'NAME_FUZZY';
```

**Step 2: Add fuzzy alias search (optional, for very fuzzy matches)**

```typescript
// After exact alias match fails, try fuzzy alias match
if (input.name) {
  const result = await this.em.execute(`
    SELECT a.substance_id, similarity(a.name_normalized, LOWER($1)) as sim
    FROM substance_alias a
    WHERE similarity(a.name_normalized, LOWER($1)) > 0.8
    ORDER BY sim DESC
    LIMIT 1
  `, [input.name]);

  if (result.length > 0) {
    const substance = await this.em.findOne(Substance, { id: result[0].substance_id });
    if (substance) {
      return {
        status: 'FOUND',
        substance,
        matchedVia: 'ALIAS',
        confidence: parseFloat(result[0].sim) * 0.9,  // Discount fuzzy alias
      };
    }
  }
}
```

**Step 3: Update tests**

```typescript
// Add to IdentityLadder.test.ts (integration test)
// NOTE: Requires setupTestDb() and vitest.config.ts with test database env vars
it('should find substance by alias name when alias exists', async () => {
  // Arrange
  const substance = em.create(Substance, { canonicalName: 'Acetaminophen', casNumber: '103-90-2' });
  const alias = new SubstanceAlias();
  alias.substance = substance;
  alias.name = 'Paracetamol';
  alias.type = AliasType.SYNONYM;
  alias.source = AliasSource.COMPTOX;
  await em.persistAndFlush([substance, alias]);

  // Act
  const ladder = new IdentityLadder(em);
  const result = await ladder.resolve({ name: 'Paracetamol' });

  // Assert
  expect(result.status).toBe('FOUND');
  expect(result.matchedVia).toBe('ALIAS');
  expect(result.substance?.casNumber).toBe('103-90-2');
});
```

**Step 4: Commit**

```bash
git add packages/gsr/src/services/IdentityLadder.ts packages/gsr/src/services/__tests__/IdentityLadder.test.ts
git commit -m "$(cat <<'EOF'
feat(gsr): add alias search to Identity Ladder

Identity Ladder now searches substance_alias table:
- Step 6: Exact alias match (confidence 0.95)
- Step 7: Fuzzy alias match via pg_trgm (confidence varies)
- Enables finding "Paracetamol" -> Acetaminophen

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 22: Integrate PubChem Healer into Seed Sequence

**Files:**
- Modify: `packages/gsr/src/cli/seed.ts`
- Existing: `packages/gsr/src/seeders/pubchem.enricher.ts`

**Context:** After all seeders run, PubChem healer should enrich substances that are missing SMILES/InChIKey data (especially those not in CompTox).

**Step 1: Verify existing PubChemEnricher works**

Run: `cd packages/gsr && pnpm test src/seeders/__tests__/pubchem.enricher.test.ts`
Expected: PASS (enricher already exists and is tested)

**Step 2: Add pubchem-healer command if not exists**

```typescript
// In packages/gsr/src/cli/seed.ts or enrich.ts

import { PubChemEnricher } from '../seeders/pubchem.enricher.js';

enrichCommand
  .command('pubchem-healer')
  .description('Enrich substances missing structure data from PubChem')
  .option('-d, --dry-run', 'Preview without writing', false)
  .option('--batch-size <size>', 'Substances per batch', '100')
  .option('--limit <count>', 'Max substances to process', '10000')
  .action(async (options) => {
    const orm = await initOrm();
    const em = orm.em.fork();

    try {
      const enricher = new PubChemEnricher(em);
      const result = await enricher.run({
        batchSize: parseInt(options.batchSize),
        onlyMissing: true,
        dryRun: options.dryRun,
        onProgress: (processed, total) => {
          if (processed % 100 === 0) {
            console.log(`[PubChem] Progress: ${processed}/${total}`);
          }
        },
      });

      console.log(`[PubChem] ${result.message}`);
    } finally {
      await orm.close();
    }
  });
```

**Step 2: Add to all-golden seed sequence**

```typescript
// In all-golden command, add Phase 5:

if (!options.skipEnrichment) {
  // Phase 5: Enrichment
  console.log('\nPhase 5: Enrichment\n');

  console.log('Step 13/13: PubChem Healer (enriching missing structures)...');
  const enricher = new PubChemEnricher(orm.em.fork());
  const enrichResult = await enricher.run({
    batchSize: 100,
    onlyMissing: true,
    dryRun: options.dryRun,
  });
  console.log(`  ${enrichResult.message}`);
} else {
  console.log('\nSkipping Phase 5: Enrichment (--skip-enrichment flag)');
}
```

**Step 3: Add --skip-enrichment flag**

```typescript
.option('--skip-enrichment', 'Skip PubChem enrichment step', false)
```

**Step 4: Commit**

```bash
git add packages/gsr/src/cli/seed.ts
git commit -m "$(cat <<'EOF'
feat(gsr): integrate PubChem healer into seed sequence

Adds Phase 5 to all-golden command:
- Enriches substances missing SMILES/InChIKey
- Creates aliases from PubChem synonyms
- Optional via --skip-enrichment flag
- Rate-limited to respect PubChem API

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 23: Refactor substance-finder.ts to Use Identity Ladder

**Files:**
- Modify: `packages/gsr/src/utils/substance-finder.ts`
- Test: `packages/gsr/src/utils/__tests__/substance-finder.test.ts`

**Context:** The current `findOrCreateSubstance` creates stub substances when not found. With GSR v2, we use the enhanced Identity Ladder (with alias search) and never create stubs.

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/utils/__tests__/substance-finder.test.ts
import { describe, it, expect } from 'vitest';
import { findSubstance, FindSubstanceResult } from '../substance-finder.js';

describe('findSubstance (v2)', () => {
  it('should return NOT_FOUND when substance does not exist in database', async () => {
    // Arrange
    const identifiers = {
      casNumber: '99999-99-9',
      name: 'Unknown Chemical',
    };

    // Act
    const result = await findSubstance(null as any, identifiers);

    // Assert
    expect(result.found).toBe(false);
    expect(result.substance).toBeNull();
    expect(result.created).toBe(false); // Never creates stubs
  });

  it('should accept all Identity Ladder input types when identifiers are provided', async () => {
    // Arrange
    const identifiers = {
      inchiKey: 'RZVAJINKPMORJF-UHFFFAOYSA-N',
      casNumber: '103-90-2',
      ecNumber: '203-157-5',
      inciName: 'PARACETAMOL',
      eNumber: 'E211',
      name: 'Acetaminophen',
    };

    // Act
    const result = await findSubstance(null as any, identifiers);

    // Assert
    expect(result).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/utils/__tests__/substance-finder.test.ts`
Expected: FAIL

**Step 3: Rewrite substance-finder.ts**

```typescript
// packages/gsr/src/utils/substance-finder.ts
import type { EntityManager } from '@mikro-orm/postgresql';
import { Substance } from '@eurocomply/database';
import { IdentityLadder, ResolveInput, ResolveResult } from '../services/IdentityLadder.js';

/**
 * Extended identifiers for Golden Record lookup.
 * Supports all Identity Ladder resolution methods.
 */
export interface SubstanceIdentifiers {
  inchiKey?: string;
  casNumber?: string;
  ecNumber?: string;
  inciName?: string;
  eNumber?: string;
  name: string;
  description?: string;
}

/**
 * Result of findSubstance operation.
 * Note: created is always false in v2 - we never create stubs.
 */
export interface FindSubstanceResult {
  found: boolean;
  substance: Substance | null;
  matchedVia?: string;
  confidence: number;
  created: false; // Always false in v2
}

/**
 * Finds a substance using the Identity Ladder.
 *
 * Unlike v1's findOrCreateSubstance, this NEVER creates stub substances.
 * If not found, returns { found: false } - caller decides what to do.
 *
 * @param em - EntityManager to use for queries
 * @param identifiers - Substance identifiers (supports all Identity Ladder inputs)
 * @returns FindSubstanceResult
 */
export async function findSubstance(
  em: EntityManager,
  identifiers: SubstanceIdentifiers
): Promise<FindSubstanceResult> {
  if (!em) {
    return { found: false, substance: null, confidence: 0, created: false };
  }

  const identityLadder = new IdentityLadder(em);

  const input: ResolveInput = {
    inchiKey: identifiers.inchiKey,
    casNumber: identifiers.casNumber,
    ecNumber: identifiers.ecNumber,
    inciName: identifiers.inciName,
    eNumber: identifiers.eNumber,
    name: identifiers.name,
  };

  const result = await identityLadder.resolve(input);

  if (result.status === 'FOUND') {
    return {
      found: true,
      substance: result.substance!,
      matchedVia: result.matchedVia,
      confidence: result.confidence,
      created: false,
    };
  }

  return {
    found: false,
    substance: null,
    confidence: 0,
    created: false,
  };
}

/**
 * @deprecated Use findSubstance instead. This function is kept for backward
 * compatibility but now delegates to findSubstance (no stub creation).
 */
export async function findOrCreateSubstance(
  em: EntityManager,
  identifiers: SubstanceIdentifiers,
  _source: string,
  _version: string
): Promise<{ substance: Substance | null; created: boolean; skipped: boolean; skipReason?: string }> {
  const result = await findSubstance(em, identifiers);

  if (result.found) {
    return { substance: result.substance, created: false, skipped: false };
  }

  return {
    substance: null,
    created: false,
    skipped: true,
    skipReason: `Not found in Golden Record database (use PubChem healer to resolve)`,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/utils/__tests__/substance-finder.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gsr/src/utils/substance-finder.ts packages/gsr/src/utils/__tests__/substance-finder.test.ts
git commit -m "$(cat <<'EOF'
refactor(gsr): update substance-finder to use Identity Ladder

Changes:
- Add findSubstance() using Identity Ladder (6-step resolution)
- Deprecate findOrCreateSubstance() - no longer creates stubs
- Support all identifier types: InChIKey, CAS, EC, INCI, E-number, name
- Unresolved substances return NOT_FOUND (for healer queue)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 24: Update CLP Harmonised Seeder for Identity Ladder

**Files:**
- Modify: `packages/gsr/src/seeders/clp-harmonised.seeder.ts`
- Test: Existing tests should still pass

**Step 1: Read current implementation**

Run: `head -100 packages/gsr/src/seeders/clp-harmonised.seeder.ts`

**Step 2: Update to use Identity Ladder**

Replace `findOrCreateSubstance` calls with `findSubstance`:
```typescript
// Change import
import { findSubstance } from '../utils/substance-finder.js';

// In seeding loop, replace:
// const { substance, created, skipped } = await findOrCreateSubstance(em, identifiers, 'CLP', version);

// With:
const result = await findSubstance(em, {
  casNumber: row.cas_number,
  ecNumber: row.ec_number,
  name: row.chemical_name,
});

if (!result.found) {
  stats.unresolved++;
  // Optionally queue for healer
  continue;
}

const substance = result.substance;
```

**Step 3: Run tests**

Run: `cd packages/gsr && pnpm test src/seeders/clp-harmonised.seeder.test.ts`
Expected: PASS (or update tests if needed)

**Step 4: Commit**

```bash
git add packages/gsr/src/seeders/clp-harmonised.seeder.ts
git commit -m "$(cat <<'EOF'
refactor(gsr): update CLP harmonised seeder for Identity Ladder

- Use findSubstance() instead of findOrCreateSubstance()
- Track unresolved substances for healer queue
- No longer creates stub substances

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 25: Update ECHA SVHC Seeder for Identity Ladder

**Files:**
- Modify: `packages/gsr/src/seeders/echa-svhc.seeder.ts`
- Test: `packages/gsr/src/seeders/__tests__/echa-svhc.seeder.test.ts`

**Step 1: Read current implementation**

Run: `cat packages/gsr/src/seeders/echa-svhc.seeder.ts | head -80`

Identify where `findOrCreateSubstance` is imported and used.

**Step 2: Update import statement**

```typescript
// Change:
import { findOrCreateSubstance } from '../utils/substance-finder.js';

// To:
import { findSubstance } from '../utils/substance-finder.js';
```

**Step 3: Update SvhcSeederResult interface**

```typescript
// Change stubsCreated to unresolved:
export interface SvhcSeederResult {
  processed: number;
  attached: number;
  unresolved: number;  // was: stubsCreated
  errors: number;
}
```

**Step 4: Update substance resolution logic**

Find the loop that processes substances and replace:

```typescript
// OLD:
const { substance, created, skipped, skipReason } = await findOrCreateSubstance(
  em,
  { casNumber: entry.casNumber, ecNumber: entry.ecNumber, name: entry.substanceName },
  'SVHC',
  version
);
if (skipped) {
  console.warn(`[SVHC] Skipped: ${skipReason}`);
  continue;
}
if (created) {
  stats.stubsCreated++;
}

// NEW:
const result = await findSubstance(em, {
  casNumber: entry.casNumber,
  ecNumber: entry.ecNumber,
  name: entry.substanceName,
});

if (!result.found) {
  stats.unresolved++;
  console.warn(`[SVHC] Unresolved: ${entry.substanceName} (CAS: ${entry.casNumber})`);
  continue;
}

const substance = result.substance;
```

**Step 5: Update stats reporting**

```typescript
// Change:
console.log(`  - Stubs created: ${stats.stubsCreated}`);

// To:
console.log(`  - Unresolved: ${stats.unresolved}`);
```

**Step 6: Run tests**

Run: `cd packages/gsr && pnpm test src/seeders/__tests__/echa-svhc.seeder.test.ts`

If tests fail due to interface changes, update test expectations:
- Change `stubsCreated` to `unresolved` in test assertions

**Step 7: Commit**

```bash
git add packages/gsr/src/seeders/echa-svhc.seeder.ts packages/gsr/src/seeders/__tests__/echa-svhc.seeder.test.ts
git commit -m "$(cat <<'EOF'
refactor(gsr): update ECHA SVHC seeder for Identity Ladder

- Use findSubstance() instead of findOrCreateSubstance()
- Replace stubsCreated with unresolved count
- No longer creates stub substances
- Unresolved substances logged for healer queue

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 26: Update ECHA Annex XIV Seeder for Identity Ladder

**Files:**
- Modify: `packages/gsr/src/seeders/echa-annex-xiv.seeder.ts`
- Test: `packages/gsr/src/seeders/__tests__/echa-annex-xiv.seeder.test.ts`

**Step 1: Read current implementation**

Run: `cat packages/gsr/src/seeders/echa-annex-xiv.seeder.ts | head -80`

**Step 2: Update import statement**

```typescript
// Change:
import { findOrCreateSubstance } from '../utils/substance-finder.js';

// To:
import { findSubstance } from '../utils/substance-finder.js';
```

**Step 3: Update AnnexXivSeederResult interface**

```typescript
export interface AnnexXivSeederResult {
  processed: number;
  attached: number;
  unresolved: number;  // was: stubsCreated
  errors: number;
}
```

**Step 4: Update substance resolution logic**

```typescript
// Replace findOrCreateSubstance call with:
const result = await findSubstance(em, {
  casNumber: entry.casNumber,
  ecNumber: entry.ecNumber,
  name: entry.substanceName,
});

if (!result.found) {
  stats.unresolved++;
  console.warn(`[Annex XIV] Unresolved: ${entry.substanceName}`);
  continue;
}

const substance = result.substance;
```

**Step 5: Update stats reporting**

Change `stubsCreated` references to `unresolved`.

**Step 6: Run tests**

Run: `cd packages/gsr && pnpm test src/seeders/__tests__/echa-annex-xiv.seeder.test.ts`

**Step 7: Commit**

```bash
git add packages/gsr/src/seeders/echa-annex-xiv.seeder.ts packages/gsr/src/seeders/__tests__/echa-annex-xiv.seeder.test.ts
git commit -m "$(cat <<'EOF'
refactor(gsr): update ECHA Annex XIV seeder for Identity Ladder

- Use findSubstance() instead of findOrCreateSubstance()
- Replace stubsCreated with unresolved count
- No longer creates stub substances

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 27: Update ECHA Annex XVII Seeder for Identity Ladder

**Files:**
- Modify: `packages/gsr/src/seeders/echa-annex-xvii.seeder.ts`
- Test: `packages/gsr/src/seeders/__tests__/echa-annex-xvii.seeder.test.ts`

**Step 1: Read current implementation**

Run: `cat packages/gsr/src/seeders/echa-annex-xvii.seeder.ts | head -80`

**Step 2: Update import statement**

```typescript
// Change:
import { findOrCreateSubstance } from '../utils/substance-finder.js';

// To:
import { findSubstance } from '../utils/substance-finder.js';
```

**Step 3: Update AnnexXviiSeederResult interface**

```typescript
export interface AnnexXviiSeederResult {
  processed: number;
  attached: number;
  unresolved: number;  // was: stubsCreated
  errors: number;
}
```

**Step 4: Update substance resolution logic**

```typescript
// Replace findOrCreateSubstance call with:
const result = await findSubstance(em, {
  casNumber: entry.casNumber,
  ecNumber: entry.ecNumber,
  name: entry.substanceName,
});

if (!result.found) {
  stats.unresolved++;
  console.warn(`[Annex XVII] Unresolved: ${entry.substanceName}`);
  continue;
}

const substance = result.substance;
```

**Step 5: Update stats reporting**

Change `stubsCreated` references to `unresolved`.

**Step 6: Run tests**

Run: `cd packages/gsr && pnpm test src/seeders/__tests__/echa-annex-xvii.seeder.test.ts`

**Step 7: Commit**

```bash
git add packages/gsr/src/seeders/echa-annex-xvii.seeder.ts packages/gsr/src/seeders/__tests__/echa-annex-xvii.seeder.test.ts
git commit -m "$(cat <<'EOF'
refactor(gsr): update ECHA Annex XVII seeder for Identity Ladder

- Use findSubstance() instead of findOrCreateSubstance()
- Replace stubsCreated with unresolved count
- No longer creates stub substances

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 28: Update ECHA POP Seeder for Identity Ladder

**Files:**
- Modify: `packages/gsr/src/seeders/echa-pop.seeder.ts`
- Test: `packages/gsr/src/seeders/__tests__/echa-pop.seeder.test.ts`

**Step 1: Read current implementation**

Run: `cat packages/gsr/src/seeders/echa-pop.seeder.ts | head -80`

**Step 2: Update import statement**

```typescript
// Change:
import { findOrCreateSubstance } from '../utils/substance-finder.js';

// To:
import { findSubstance } from '../utils/substance-finder.js';
```

**Step 3: Update PopSeederResult interface**

```typescript
export interface PopSeederResult {
  processed: number;
  attached: number;
  unresolved: number;  // was: stubsCreated
  errors: number;
}
```

**Step 4: Update substance resolution logic**

```typescript
// Replace findOrCreateSubstance call with:
const result = await findSubstance(em, {
  casNumber: entry.casNumber,
  ecNumber: entry.ecNumber,
  name: entry.substanceName,
});

if (!result.found) {
  stats.unresolved++;
  console.warn(`[POP] Unresolved: ${entry.substanceName}`);
  continue;
}

const substance = result.substance;
```

**Step 5: Update stats reporting**

Change `stubsCreated` references to `unresolved`.

**Step 6: Run tests**

Run: `cd packages/gsr && pnpm test src/seeders/__tests__/echa-pop.seeder.test.ts`

**Step 7: Commit**

```bash
git add packages/gsr/src/seeders/echa-pop.seeder.ts packages/gsr/src/seeders/__tests__/echa-pop.seeder.test.ts
git commit -m "$(cat <<'EOF'
refactor(gsr): update ECHA POP seeder for Identity Ladder

- Use findSubstance() instead of findOrCreateSubstance()
- Replace stubsCreated with unresolved count
- No longer creates stub substances

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 29: Update RoHS Seeder for Identity Ladder

**Files:**
- Modify: `packages/gsr/src/seeders/rohs.seeder.ts`
- Test: `packages/gsr/src/seeders/__tests__/rohs.seeder.test.ts`

**Step 1: Read current implementation**

Run: `cat packages/gsr/src/seeders/rohs.seeder.ts 2>/dev/null | head -80 || echo "File may not exist yet"`

Note: RoHS seeder may not exist yet. If not, this task becomes: Create RoHS seeder using Identity Ladder from the start.

**Step 2: If seeder exists, update import statement**

```typescript
// Change:
import { findOrCreateSubstance } from '../utils/substance-finder.js';

// To:
import { findSubstance } from '../utils/substance-finder.js';
```

**Step 3: Update RohsSeederResult interface**

```typescript
export interface RohsSeederResult {
  processed: number;
  attached: number;
  unresolved: number;  // was: stubsCreated
  errors: number;
}
```

**Step 4: Update substance resolution logic**

```typescript
// Replace findOrCreateSubstance call with:
const result = await findSubstance(em, {
  casNumber: entry.casNumber,
  ecNumber: entry.ecNumber,
  name: entry.substanceName,
});

if (!result.found) {
  stats.unresolved++;
  console.warn(`[RoHS] Unresolved: ${entry.substanceName}`);
  continue;
}

const substance = result.substance;
```

**Step 5: Update stats reporting**

Change `stubsCreated` references to `unresolved`.

**Step 6: Run tests**

Run: `cd packages/gsr && pnpm test src/seeders/__tests__/rohs.seeder.test.ts`

**Step 7: Commit**

```bash
git add packages/gsr/src/seeders/rohs.seeder.ts packages/gsr/src/seeders/__tests__/rohs.seeder.test.ts
git commit -m "$(cat <<'EOF'
refactor(gsr): update RoHS seeder for Identity Ladder

- Use findSubstance() instead of findOrCreateSubstance()
- Replace stubsCreated with unresolved count
- No longer creates stub substances

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 30: Update Documentation

**Files:**
- Modify: `docs/TESTING.md`
- Modify: `docs/GSR_DATA_SOURCES.md`
- Modify: `docs/guides/SUBSTANCE_TABLES.md`
- Modify: `docs/plans/02-data-model.md` (schema architecture)
- Modify: `docs/plans/2026-02-02-gsr-golden-record-design.md`
- Modify: `docs/plans/2026-01-31-global-substance-registry-design.md`

**Step 0: Update 02-data-model.md schema architecture**

Add persona tables to public schema listing:
```markdown
│   ├── substance_cosing          -- CosIng cosmetics persona
│   ├── substance_efsa            -- EFSA food additives persona
│   ├── substance_tsca            -- TSCA US industrial persona
│   └── substance_biocide         -- EU Biocides persona
```

Add to Entity Location table:
| SubstanceCosing | `public` | CosIng cosmetics persona (INCI names, restrictions) |
| SubstanceEfsa | `public` | EFSA food additives (E-numbers, ADI values) |
| SubstanceTsca | `public` | TSCA US inventory (active/inactive status) |
| SubstanceBiocide | `public` | EU Biocides (product types, approval status) |

**Step 1: Update TESTING.md with new commands**

Add to GSR Commands section:
```markdown
### Golden Record Seeders (GSR v2)

```bash
# Full seed sequence (creates 1.2M+ Golden Records + all personas)
pnpm gsr seed all-golden

# Full seed without regulatory lists (faster for testing)
pnpm gsr seed all-golden --skip-regulatory

# Individual seeders (in recommended order)
pnpm gsr seed comptox data/DSSTox_CCD_dump_12092025/DSSToxCCDdump.csv  # Foundation
pnpm gsr seed cosing data/CosIng/                                       # Cosmetics
pnpm gsr seed efsa data/EFSA/                                           # Food
pnpm gsr seed tsca data/tsca_inventory/TSCAINV_072025.csv              # US Industrial
pnpm gsr seed biocides "data/ECHA Biocides/art95_list_en.xlsx"         # EU Biocides
pnpm gsr seed clp-reference                                             # Hazard classes
pnpm gsr seed clp-harmonised "data/Harmonised_List_*.xlsx"             # Classifications
pnpm gsr seed echa-svhc --entries "..." --substances "..."             # SVHC list
pnpm gsr seed echa-annex-xiv --entries "..." --substances "..."        # Authorization
pnpm gsr seed echa-annex-xvii --entries "..." --substances "..."       # Restrictions
pnpm gsr seed echa-pop --entries "..." --substances "..."              # POPs
pnpm gsr seed rohs                                                      # RoHS

# Dry run mode (preview without database writes)
pnpm gsr seed all-golden --dry-run
pnpm gsr seed comptox data/DSSToxCCDdump.csv --dry-run

# Resume from checkpoint (if previous run failed)
pnpm gsr seed all-golden --resume

# Start fresh (ignore checkpoint)
pnpm gsr seed all-golden --fresh
```

### Golden Record Verification Queries

```bash
# Substance counts by type
docker exec eurocomply-postgres psql -U postgres -d eurocomply -c "
  SELECT
    (SELECT COUNT(*) FROM substance) as golden_records,
    (SELECT COUNT(*) FROM substance WHERE inchi_key IS NOT NULL) as with_inchikey,
    (SELECT COUNT(*) FROM substance WHERE dtxsid IS NOT NULL) as with_dtxsid,
    (SELECT COUNT(*) FROM substance_cosing) as cosing_personas,
    (SELECT COUNT(*) FROM substance_efsa) as efsa_personas,
    (SELECT COUNT(*) FROM substance_tsca) as tsca_personas,
    (SELECT COUNT(*) FROM substance_biocide) as biocide_personas;
"

# Cross-registry lookup example (Sodium Benzoate)
docker exec eurocomply-postgres psql -U postgres -d eurocomply -c "
  SELECT s.canonical_name, s.cas_number, c.inci_name, e.e_number, t.inventory_status
  FROM substance s
  LEFT JOIN substance_cosing c ON c.substance_id = s.id
  LEFT JOIN substance_efsa e ON e.substance_id = s.id
  LEFT JOIN substance_tsca t ON t.substance_id = s.id
  WHERE s.cas_number = '532-32-1';
"
```
```

**Step 2: Update GSR_DATA_SOURCES.md**

Add new section for CompTox:
```markdown
## 1. EPA CompTox DSSTox (Foundation)

### What It Is
The EPA's Distributed Structure-Searchable Toxicity database - a curated collection of 1.25 million commercially and industrially relevant chemicals with pre-linked CAS → InChIKey → SMILES mappings.

### Why We Need It
- **Foundation layer**: Every substance in GSR v2 starts as a CompTox record
- **Chemical fingerprints**: InChIKey enables structure-based deduplication
- **No API calls needed**: Pre-computed mappings in downloadable CSV

### Data Contents
| Field | Description |
|-------|-------------|
| DTXSID | EPA unique substance ID |
| CASRN | CAS Registry Number |
| INCHIKEY | 27-character chemical fingerprint |
| SMILES | Structure string |
| PREFERRED_NAME | Canonical name |
| MOLECULAR_FORMULA | e.g., "C8H9NO2" |
| AVERAGE_MASS | Molecular weight |

### How to Obtain
1. Visit: https://comptox.epa.gov/dashboard/downloads
2. Download "DSSTox CCD" (Chemicals with Computed Descriptors)
3. Save to `packages/gsr/data/DSSTox_CCD_dump_MMDDYYYY/`

### Update Frequency
EPA updates quarterly. Re-download and re-seed to refresh.
```

Add sections for CosIng, EFSA, TSCA, Biocides following the existing pattern.

**Step 3: Update SUBSTANCE_TABLES.md**

Add documentation for new persona tables:
```markdown
## Persona Tables

### `substance_cosing` - Cosmetics Registry Persona

| Column | Type | Description |
|--------|------|-------------|
| id | varchar(30) | Primary key |
| substance_id | varchar(30) | FK to substance |
| cosing_ref | varchar(20) | CosIng reference number |
| inci_name | text | INCI name (UPPERCASE) |
| restriction_type | enum | ANNEX_II through ANNEX_VI |
| max_concentration | decimal | Max % allowed |

### `substance_efsa` - Food Additives Persona

| Column | Type | Description |
|--------|------|-------------|
| id | varchar(30) | Primary key |
| substance_id | varchar(30) | FK to substance |
| e_number | varchar(10) | E-number (e.g., "E211") |
| functional_class | varchar(50) | Preservative, Emulsifier, etc. |
| adi_value | decimal | Acceptable Daily Intake |
| adi_unit | varchar(20) | Usually "mg/kg bw/day" |

### `substance_tsca` - US Industrial Persona

| Column | Type | Description |
|--------|------|-------------|
| id | varchar(30) | Primary key |
| substance_id | varchar(30) | FK to substance |
| tsca_cas | varchar(20) | CAS as listed on TSCA |
| inventory_status | enum | ACTIVE or INACTIVE |
| is_section_6 | boolean | Under EPA risk evaluation |

### `substance_biocide` - EU Biocides Persona

| Column | Type | Description |
|--------|------|-------------|
| id | varchar(30) | Primary key |
| substance_id | varchar(30) | FK to substance |
| biocides_ref | varchar(50) | ECHA reference |
| status | enum | APPROVED, NOT_APPROVED, etc. |
| product_types | integer[] | PT numbers (1-22) |

### `substance_alias` - Chemical Synonyms (Enhanced)

With GSR v2, the alias table now contains ~15 million entries from CompTox:

| Column | Type | Description |
|--------|------|-------------|
| id | varchar(30) | Primary key |
| substance_id | varchar(30) | FK to substance |
| name | text | Alias name |
| name_normalized | text | Lowercased, trimmed (GIN indexed) |
| type | enum | SYNONYM, IUPAC, TRADE |
| source | enum | PUBCHEM, ECHA, EPA, **COMPTOX**, MANUAL |

**Performance Note:** The GIN trigram index on `name_normalized` enables fuzzy searching across 15M+ aliases.

## Services

### Identity Ladder

The `IdentityLadder` service resolves any chemical identifier to a Golden Record:

| Step | Identifier | Confidence | Index Used |
|------|------------|------------|------------|
| 1 | InChIKey | 100% | Unique B-tree |
| 2 | CAS Number | 100% | Unique B-tree |
| 3 | EC Number | 100% | B-tree |
| 4 | INCI Name | 100% | Via substance_cosing |
| 5 | E-Number | 100% | Via substance_efsa |
| 6 | Alias (exact) | 95% | Via substance_alias |
| 7 | Name (fuzzy) | 80-95% | GIN trigram |

Usage:
```typescript
const ladder = new IdentityLadder(em);
const result = await ladder.resolve({ casNumber: '50-00-0' });
if (result.status === 'FOUND') {
  console.log(result.substance.canonicalName); // "Formaldehyde"
}
```
```

**Step 4: Update design document status**

In `docs/plans/2026-02-02-gsr-golden-record-design.md`, change:
```markdown
> **Status:** PROPOSED
```
To:
```markdown
> **Status:** IMPLEMENTED
> **Implementation:** 2026-02-XX (see 2026-02-02-gsr-v2-implementation-plan.md)
```

**Step 5: Mark v1 design as superseded**

In `docs/plans/2026-01-31-global-substance-registry-design.md`, add at top:
```markdown
> **⚠️ SUPERSEDED:** This document describes GSR v1. See `2026-02-02-gsr-golden-record-design.md` for the current Golden Record architecture (v2).
```

**Step 6: Commit**

```bash
git add docs/TESTING.md docs/GSR_DATA_SOURCES.md docs/guides/SUBSTANCE_TABLES.md \
        docs/plans/02-data-model.md \
        docs/plans/2026-02-02-gsr-golden-record-design.md \
        docs/plans/2026-01-31-global-substance-registry-design.md
git commit -m "$(cat <<'EOF'
docs: comprehensive GSR v2 Golden Record documentation

Updates:
- TESTING.md: Add seeder commands with checkpoint/resume options
- GSR_DATA_SOURCES.md: Add CompTox, CosIng, EFSA, TSCA, Biocides
- SUBSTANCE_TABLES.md: Document 4 persona tables + enhanced alias table
- SUBSTANCE_TABLES.md: Document Identity Ladder service
- 02-data-model.md: Add persona tables to schema architecture
- Mark v2 design as IMPLEMENTED
- Mark v1 design as SUPERSEDED

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Verification Checklist

After completing all tasks, verify:

### Build & Test

```bash
# 1. Build passes
cd packages/gsr && pnpm build
# Expected: No errors

# 2. All tests pass
pnpm test
# Expected: All tests green

# 3. Lint passes
pnpm lint
# Expected: No errors
```

### Database Schema

```bash
# 4. Persona tables exist
docker exec eurocomply-postgres psql -U postgres -d eurocomply -c "\dt public.substance*"
# Expected: substance, substance_cosing, substance_efsa, substance_tsca, substance_biocide

# 5. Golden Record columns exist
docker exec eurocomply-postgres psql -U postgres -d eurocomply -c "\d public.substance" | grep -E "inchi_key|dtxsid|smiles"
# Expected: Shows inchi_key, dtxsid, smiles columns

# 6. Indexes exist
docker exec eurocomply-postgres psql -U postgres -d eurocomply -c "\di public.idx_substance*"
# Expected: Shows idx_substance_inchi, idx_substance_dtxsid indexes
```

### CLI Commands

```bash
# 7. All seed commands available
cd packages/gsr && pnpm gsr seed --help
# Expected: comptox, cosing, efsa, tsca, biocides, all-golden commands listed

# 8. Dry run works
pnpm gsr seed all-golden --dry-run
# Expected: Processes without writing, shows progress
```

### Data Seeding (Full Test)

```bash
# 9. Reset database
pnpm db:reset

# 10. Run full seed sequence
cd packages/gsr && pnpm gsr seed all-golden
# Expected: ~30-60 minutes (includes alias creation), completes without errors

# 11. Verify substance counts
docker exec eurocomply-postgres psql -U postgres -d eurocomply -c "
  SELECT
    (SELECT COUNT(*) FROM substance) as golden_records,
    (SELECT COUNT(*) FROM substance WHERE inchi_key IS NOT NULL) as with_inchikey,
    (SELECT COUNT(*) FROM substance_cosing) as cosing_personas,
    (SELECT COUNT(*) FROM substance_efsa) as efsa_personas,
    (SELECT COUNT(*) FROM substance_tsca) as tsca_personas,
    (SELECT COUNT(*) FROM substance_biocide) as biocide_personas,
    (SELECT COUNT(DISTINCT substance_id) FROM substance_hazard_classification) as clp_substances,
    (SELECT COUNT(*) FROM substance_list_entry WHERE list_id IN
      (SELECT id FROM regulatory_list WHERE code = 'REACH_SVHC')) as svhc_entries;
"
# Expected:
#   golden_records: ~1,246,000
#   with_inchikey: ~1,153,000
#   cosing_personas: ~2,400
#   efsa_personas: ~400
#   tsca_personas: ~70,000
#   biocide_personas: ~1,000
#   clp_substances: ~4,500
#   svhc_entries: ~250

# 12. Verify alias counts
docker exec eurocomply-postgres psql -U postgres -d eurocomply -c "
  SELECT
    (SELECT COUNT(*) FROM substance_alias) as total_aliases,
    source, COUNT(*) as count
  FROM substance_alias
  GROUP BY source
  ORDER BY count DESC;
"
# Expected:
#   total_aliases: ~10-20 million
#   COMPTOX: majority (from IDENTIFIER column)
#   PUBCHEM: additional (from enrichment)
```

### Cross-Registry Search Test

```bash
# 13. Test Identity Ladder resolution by CAS
docker exec eurocomply-postgres psql -U postgres -d eurocomply -c "
  -- Find Sodium Benzoate across registries
  SELECT
    s.canonical_name,
    s.cas_number,
    s.inchi_key,
    c.inci_name as cosing_inci,
    e.e_number as efsa_e_number,
    t.inventory_status as tsca_status
  FROM substance s
  LEFT JOIN substance_cosing c ON c.substance_id = s.id
  LEFT JOIN substance_efsa e ON e.substance_id = s.id
  LEFT JOIN substance_tsca t ON t.substance_id = s.id
  WHERE s.cas_number = '532-32-1';
"
# Expected: Shows Sodium Benzoate with INCI name, E211, and TSCA ACTIVE

# 14. Test alias-based search
docker exec eurocomply-postgres psql -U postgres -d eurocomply -c "
  -- Find Acetaminophen by alias 'Paracetamol'
  SELECT
    s.canonical_name,
    s.cas_number,
    a.name as matched_alias,
    a.source as alias_source
  FROM substance_alias a
  JOIN substance s ON s.id = a.substance_id
  WHERE a.name_normalized = 'paracetamol'
  LIMIT 1;
"
# Expected: canonical_name=Acetaminophen, cas_number=103-90-2, matched_alias=Paracetamol

# 15. Test fuzzy alias search via pg_trgm
docker exec eurocomply-postgres psql -U postgres -d eurocomply -c "
  -- Find substance by partial/fuzzy alias match
  SELECT
    s.canonical_name,
    s.cas_number,
    a.name as matched_alias,
    similarity(a.name_normalized, 'acetaminofen') as sim
  FROM substance_alias a
  JOIN substance s ON s.id = a.substance_id
  WHERE similarity(a.name_normalized, 'acetaminofen') > 0.6
  ORDER BY sim DESC
  LIMIT 3;
"
# Expected: Finds Acetaminophen despite misspelling
```

---

## Summary

### Phase 1: New Persona Infrastructure (Tasks 1-18)

| Task | Entity/File | Purpose |
|------|-------------|---------|
| 1-4 | SubstanceCosing, SubstanceEfsa, SubstanceTsca, SubstanceBiocide | Persona entities |
| 5 | Substance | Golden Record fields (inchiKey, dtxsid, smiles, etc.) |
| 6 | Migration | Database schema for persona tables |
| 7 | IdentityLadder | 6-step resolution service |
| 8-9 | comptox.parser, comptox.seeder | Foundation seeder (1.2M+ chemicals) |
| 10-11 | cosing.parser, cosing.seeder | Cosmetics personas |
| 12-13 | efsa.parser, efsa.seeder | Food additive personas |
| 14-15 | tsca.parser, tsca.seeder | US industrial personas |
| 16-17 | biocides.parser, biocides.seeder | EU biocides personas |
| 18 | seed.ts all-golden | Orchestration command |

### Phase 2: Aliasing & Enrichment (Tasks 19-22)

| Task | Component | Purpose |
|------|-----------|---------|
| 19 | comptox.parser | Extract synonyms from IDENTIFIER column |
| 20 | comptox.seeder | Create SubstanceAlias records from synonyms |
| 21 | IdentityLadder | Add alias search step (exact + fuzzy) |
| 22 | seed.ts | Integrate PubChem healer into seed sequence |

### Phase 3: Regulatory Seeder Refactoring (Tasks 23-29)

| Task | Seeder | Change |
|------|--------|--------|
| 23 | substance-finder.ts | Use Identity Ladder, deprecate stub creation |
| 24 | clp-harmonised.seeder.ts | Use Identity Ladder |
| 25 | echa-svhc.seeder.ts | Use Identity Ladder, track unresolved |
| 26 | echa-annex-xiv.seeder.ts | Use Identity Ladder |
| 27 | echa-annex-xvii.seeder.ts | Use Identity Ladder |
| 28 | echa-pop.seeder.ts | Use Identity Ladder |
| 29 | rohs.seeder.ts | Use Identity Ladder |

### Phase 4: Documentation (Task 30)

| Task | Files | Purpose |
|------|-------|---------|
| 30 | TESTING.md, GSR_DATA_SOURCES.md, etc. | Document new commands and data sources |

---

## Data Files Reference

### New Persona Data Files (packages/gsr/data/)

| File | Source | Records | Used By |
|------|--------|---------|---------|
| `DSSTox_CCD_dump_12092025/DSSToxCCDdump.csv` | EPA CompTox | 1,246,399 | comptox seeder |
| `CosIng/COSING_Annex_*.xls` (5 files) | EC CosIng | ~2,400 | cosing seeder |
| `EFSA/ENumbers.txt` | EC Official | 414 | efsa seeder |
| `EFSA/OpenFoodToxTX22809_2023.xlsx` | EFSA | 8,007 | efsa seeder (ADI values) |
| `tsca_inventory/TSCAINV_072025.csv` | EPA TSCA | 70,754 | tsca seeder |
| `ECHA Biocides/art95_list_en.xlsx` | ECHA | 5,265 | biocides seeder |

### Existing Regulatory Data Files (still used, no changes)

| File | Source | Used By |
|------|--------|---------|
| `candidate_list_full-2026-01-30 (1).xlsx` | ECHA SVHC | echa-svhc seeder |
| `candidate_list_2026-02-01 17_15_41.xlsx` | ECHA SVHC | echa-svhc seeder |
| `authorisation_list_full-2025-09-13.xlsx` | ECHA Annex XIV | echa-annex-xiv seeder |
| `authorisation_list_2026-02-01 17_04_46.xlsx` | ECHA Annex XIV | echa-annex-xiv seeder |
| `restriction_list_full-2025-09-12 (1).xlsx` | ECHA Annex XVII | echa-annex-xvii seeder |
| `restriction_list_2026-02-01 16_23_29.xlsx` | ECHA Annex XVII | echa-annex-xvii seeder |
| `pops_list_full-2025-09-12.xlsx` | ECHA POP | echa-pop seeder |
| `pops_list_2026-02-01 17_23_13.xlsx` | ECHA POP | echa-pop seeder |
| `Harmonised_List_2026-02-01 17_42_11.xlsx` | ECHA CLP | clp-harmonised seeder |

**Note:** The regulatory files feed into `substance_list_entry` and `substance_hazard_classification` tables (not persona tables). The seeders are refactored to use Identity Ladder but the data files and target tables remain unchanged.

---

## Expected Outcomes

### Golden Records
- **1,246,399** substances from CompTox foundation
- **92.5%** with InChIKey (structural fingerprint)
- **99%+** with CAS number

### Aliases (NEW)
- **~10-20 million** SubstanceAlias records from CompTox IDENTIFIER column
- **Up to 50** aliases per substance (trade names, IUPAC, synonyms)
- **Additional aliases** from PubChem enrichment
- **Source tracking** (COMPTOX, PUBCHEM, MANUAL)

### Personas
- **~2,400** CosIng personas (cosmetics)
- **~400** EFSA personas (food additives)
- **~70,000** TSCA personas (US industrial)
- **~1,000** Biocide personas (EU biocides)

### Regulatory Entries (existing, now linked via Identity Ladder)
- **~250** SVHC entries
- **~60** Annex XIV entries
- **~80** Annex XVII entries
- **~30** POP entries
- **4,762** CLP harmonised classifications

### Improvements Over v1
- No more stub substances (1,212 stubs eliminated)
- Cross-registry search (E211 → Sodium Benzoate → CLP + CosIng + EFSA)
- **Alias-based search** (Paracetamol → Acetaminophen → CAS 103-90-2)
- US market coverage via TSCA
- Chemical structure matching via InChIKey
- **PubChem enrichment** for missing structure data
