# Segment 01: GSR Database Setup

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create separate `eurocomply_gsr` database with Golden Record schema, migrate substance entities from `packages/database` to `packages/gsr`, and build the Identity Ladder service.

**Architecture:** GSR is a read-only reference database containing 1.2M+ chemical substances with persona tables (EC, CosIng, EFSA, TSCA, Biocides). It uses InChIKey as the primary chemical fingerprint with the Identity Ladder providing resolution from any identifier.

**Tech Stack:** PostgreSQL 15, MikroORM, TypeScript, pg_trgm extension

---

## Task 1: Update Docker Compose for Multiple Databases

**Files:**
- Modify: `/root/Documents/EuroComply/docker-compose.yml`
- Modify: `/root/Documents/EuroComply/docker/init-db.sql`

**Step 1: Read current docker-compose.yml**

Run: `cat docker-compose.yml` (use Read tool)

**Step 2: Update docker-compose.yml to expose multiple databases**

The postgres service already exists. We need to update `init-db.sql` to create additional databases.

**IMPORTANT: Docker Image Requirement**

The `vector` extension used for pgvector (AI embeddings) is NOT included in the standard `postgres:15` image. You must use a pgvector-enabled image:

```yaml
# docker-compose.yml
services:
  postgres:
    image: ankane/pgvector:v0.5.1  # NOT postgres:15
    # or: pgvector/pgvector:pg15
```

The `ankane/pgvector` image includes both PostgreSQL and the vector extension pre-installed.

**Step 3: Update init-db.sql to create all required databases**

```sql
-- Create databases for EuroComply v2
-- Main development database (legacy, will be tenant DB)
CREATE DATABASE eurocomply;

-- GSR (Global Substance Registry) - read-only reference data
CREATE DATABASE eurocomply_gsr;

-- Test databases
CREATE DATABASE eurocomply_test;
CREATE DATABASE eurocomply_gsr_test;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE eurocomply TO postgres;
GRANT ALL PRIVILEGES ON DATABASE eurocomply_gsr TO postgres;
GRANT ALL PRIVILEGES ON DATABASE eurocomply_test TO postgres;
GRANT ALL PRIVILEGES ON DATABASE eurocomply_gsr_test TO postgres;

-- Connect to GSR and enable extensions
\c eurocomply_gsr
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Connect to tenant and enable extensions
\c eurocomply
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "ltree";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Test databases get same extensions
\c eurocomply_gsr_test
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

\c eurocomply_test
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "ltree";
CREATE EXTENSION IF NOT EXISTS "vector";
```

**Step 4: Run test to verify database creation**

Run: `docker compose down -v && docker compose up -d postgres`
Wait: 5 seconds for postgres to initialize
Run: `docker exec eurocomply-postgres psql -U postgres -c "\l"`
Expected: Should list eurocomply, eurocomply_gsr, eurocomply_test, eurocomply_gsr_test

**Step 5: Commit**

```bash
git add docker-compose.yml docker/init-db.sql
git commit -m "chore: add eurocomply_gsr database to docker setup

Adds separate database for Global Substance Registry (GSR) to support
polyglot persistence architecture. GSR is read-only reference data
that will be edge-replicated.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create GSR Package ORM Configuration

**Files:**
- Modify: `/root/Documents/EuroComply/packages/gsr/src/mikro-orm.config.ts` (or create if not exists)
- Create: `/root/Documents/EuroComply/packages/gsr/src/orm.ts`

**Step 1: Read existing GSR package structure**

Run: `ls -la packages/gsr/src/`

**Step 2: Write failing test for GSR ORM connection**

Create: `/root/Documents/EuroComply/packages/gsr/src/orm.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import { createGsrOrm, closeGsrOrm } from './orm.js';

describe('GSR ORM', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await createGsrOrm();
  });

  afterAll(async () => {
    await closeGsrOrm(orm);
  });

  describe('createGsrOrm', () => {
    it('should_connect_to_gsr_database_when_called', async () => {
      const result = await orm.em.execute('SELECT current_database()');
      expect(result[0].current_database).toBe('eurocomply_gsr_test');
    });

    it('should_have_pg_trgm_extension_enabled', async () => {
      const result = await orm.em.execute(
        "SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'"
      );
      expect(result.length).toBe(1);
    });
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/orm.test.ts`
Expected: FAIL with "Cannot find module './orm.js'"

**Step 4: Create GSR ORM module**

Create: `/root/Documents/EuroComply/packages/gsr/src/orm.ts`

```typescript
import { MikroORM, type Options } from '@mikro-orm/postgresql';
import { gsrEntities } from './entities/index.js';

export interface GsrOrmConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  dbName?: string;
  debug?: boolean;
}

function getGsrConfig(overrides: GsrOrmConfig = {}): Options {
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST;

  return {
    entities: gsrEntities,
    host: overrides.host ?? process.env.GSR_DATABASE_HOST ?? 'localhost',
    port: overrides.port ?? parseInt(process.env.GSR_DATABASE_PORT ?? '5432', 10),
    user: overrides.user ?? process.env.GSR_DATABASE_USER ?? 'postgres',
    password: overrides.password ?? process.env.GSR_DATABASE_PASSWORD ?? 'postgres',
    dbName: overrides.dbName ?? (isTest ? 'eurocomply_gsr_test' : (process.env.GSR_DATABASE_NAME ?? 'eurocomply_gsr')),
    debug: overrides.debug ?? process.env.GSR_DATABASE_DEBUG === 'true',
    allowGlobalContext: true,
  };
}

export async function createGsrOrm(overrides: GsrOrmConfig = {}): Promise<MikroORM> {
  const config = getGsrConfig(overrides);
  return MikroORM.init(config);
}

export async function closeGsrOrm(orm: MikroORM): Promise<void> {
  await orm.close(true);
}
```

**Step 5: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/orm.test.ts`
Expected: PASS (assuming gsrEntities exists and exports entities)

**Step 6: Commit**

```bash
git add packages/gsr/src/orm.ts packages/gsr/src/orm.test.ts
git commit -m "feat(gsr): add dedicated ORM configuration for GSR database

Creates separate MikroORM configuration for eurocomply_gsr database.
GSR database is read-only and will be edge-replicated for performance.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Migrate Substance Entity to GSR Package

**Files:**
- Modify: `/root/Documents/EuroComply/packages/gsr/src/entities/Substance.ts`
- Modify: `/root/Documents/EuroComply/packages/gsr/src/entities/index.ts`

**Step 1: Read current Substance entity**

Run: Read `/root/Documents/EuroComply/packages/database/src/entities/Substance.ts`

**Step 2: Write failing test for updated Substance entity**

Create: `/root/Documents/EuroComply/packages/gsr/src/entities/Substance.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { createGsrOrm, closeGsrOrm } from '../orm.js';
import { Substance } from './Substance.js';

describe('Substance Entity', () => {
  let orm: MikroORM;
  let em: EntityManager;

  beforeAll(async () => {
    orm = await createGsrOrm();
    // Ensure schema exists
    const generator = orm.getSchemaGenerator();
    await generator.refreshDatabase();
  });

  afterAll(async () => {
    await closeGsrOrm(orm);
  });

  beforeEach(() => {
    em = orm.em.fork();
  });

  describe('Golden Record fields', () => {
    it('should_create_substance_with_inchi_key_when_provided', async () => {
      const substance = em.create(Substance, {
        inchiKey: 'YXFVVABEGXRONW-UHFFFAOYSA-N',
        canonicalName: 'Ethanol',
        casNumber: '64-17-5',
        dataVersion: '2026.02.03',
      });

      await em.persistAndFlush(substance);

      expect(substance.id).toBeDefined();
      expect(substance.inchiKey).toBe('YXFVVABEGXRONW-UHFFFAOYSA-N');
    });

    it('should_allow_null_inchi_key_when_substance_is_mixture', async () => {
      const substance = em.create(Substance, {
        canonicalName: 'Petroleum distillates',
        casNumber: '64742-47-8',
        isMixture: true,
        dataVersion: '2026.02.03',
      });

      await em.persistAndFlush(substance);

      expect(substance.id).toBeDefined();
      expect(substance.inchiKey).toBeNull();
      expect(substance.isMixture).toBe(true);
    });

    it('should_enforce_unique_dtxsid_when_provided', async () => {
      const substance1 = em.create(Substance, {
        canonicalName: 'Substance 1',
        dtxsid: 'DTXSID7020405',
        dataVersion: '2026.02.03',
      });
      await em.persistAndFlush(substance1);

      const substance2 = em.create(Substance, {
        canonicalName: 'Substance 2',
        dtxsid: 'DTXSID7020405', // Same DTXSID
        dataVersion: '2026.02.03',
      });

      await expect(em.persistAndFlush(substance2)).rejects.toThrow(/unique/i);
    });
  });

  describe('dataVersion tracking', () => {
    it('should_require_data_version_for_compliance_pinning', async () => {
      const substance = em.create(Substance, {
        canonicalName: 'Test Substance',
        dataVersion: '2026.02.03',
      });

      await em.persistAndFlush(substance);

      expect(substance.dataVersion).toBe('2026.02.03');
    });
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/entities/Substance.test.ts`
Expected: FAIL (fields may be missing or different)

**Step 4: Update Substance entity to match v2 schema**

Modify: `/root/Documents/EuroComply/packages/gsr/src/entities/Substance.ts`

```typescript
import {
  Entity,
  Property,
  Unique,
  Index,
  OneToMany,
  Collection,
  BeforeCreate,
  BeforeUpdate,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { SubstanceAlias } from './SubstanceAlias.js';
import { SubstanceEc } from './SubstanceEc.js';
import { SubstanceCosing } from './SubstanceCosing.js';
import { SubstanceEfsa } from './SubstanceEfsa.js';
import { SubstanceTsca } from './SubstanceTsca.js';
import { SubstanceBiocide } from './SubstanceBiocide.js';
import { SubstanceHazardClassification } from './SubstanceHazardClassification.js';

/**
 * Golden Record: The canonical representation of a chemical substance.
 *
 * Key design decisions:
 * - InChIKey is the primary chemical fingerprint (27 chars, structure-derived)
 * - CAS number is indexed but NOT unique (historical errors exist)
 * - DTXSID (EPA CompTox ID) IS unique when present
 * - dataVersion enables compliance snapshot pinning
 */
@Entity({ tableName: 'substance' })
export class Substance extends BaseEntity {
  // ═══════════════════════════════════════════════════════════════════════════
  // CHEMICAL IDENTITY (the "DNA")
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * InChIKey: 27-character hash derived from molecular structure.
   * NULL for mixtures (no single structure).
   * Unique when present - this is the true chemical fingerprint.
   */
  @Property({ type: 'varchar', length: 27, nullable: true })
  @Index({ name: 'idx_substance_inchi' })
  @Unique({ name: 'uq_substance_inchi' })
  inchiKey?: string | null;

  /**
   * CAS Registry Number: "127-19-5" format.
   * NOT unique because historical EINECS errors created duplicates.
   * Use Identity Ladder for resolution.
   */
  @Property({ type: 'varchar', length: 20, nullable: true })
  @Index({ name: 'idx_substance_cas' })
  casNumber?: string | null;

  /**
   * EPA CompTox DSSTox ID: "DTXSID7020405" format.
   * Unique when present - authoritative for US regulatory data.
   */
  @Property({ type: 'varchar', length: 20, nullable: true })
  @Unique({ name: 'uq_substance_dtxsid' })
  @Index({ name: 'idx_substance_dtxsid' })
  dtxsid?: string | null;

  // ═══════════════════════════════════════════════════════════════════════════
  // NAMES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Canonical name from CompTox PREFERRED_NAME.
   * Required - every substance must have a display name.
   *
   * GIN trigram index note: For 1.2M rows, this index can grow large
   * (typically 200-400MB). Ensure your Docker volume has sufficient
   * IOPS for index maintenance during bulk inserts. On slow storage,
   * consider building the index AFTER seeding with CONCURRENTLY option.
   */
  @Property({ type: 'text' })
  @Index({ name: 'idx_substance_name_trgm', type: 'gin' })
  canonicalName!: string;

  /**
   * IUPAC systematic name (full chemical nomenclature).
   */
  @Property({ type: 'text', nullable: true })
  iupacName?: string | null;

  // ═══════════════════════════════════════════════════════════════════════════
  // STRUCTURE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * SMILES: Molecular structure string for rendering and searching.
   */
  @Property({ type: 'text', nullable: true })
  smiles?: string | null;

  /**
   * Molecular formula: "C2H6O" format.
   */
  @Property({ type: 'varchar', length: 500, nullable: true })
  molecularFormula?: string | null;

  /**
   * Molecular weight in g/mol.
   */
  @Property({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  molecularWeight?: number | null;

  // ═══════════════════════════════════════════════════════════════════════════
  // QUALITY & STATUS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * CompTox QC level (1-5): Higher = better data quality.
   * 1 = low confidence, 5 = high confidence.
   */
  @Property({ type: 'smallint', nullable: true })
  qcLevel?: number | null;

  /**
   * True if this represents a mixture/UVCB (no single molecular structure).
   * When true, inchiKey should be NULL.
   */
  @Property({ type: 'boolean', default: false })
  isMixture: boolean = false;

  /**
   * Soft delete flag. Inactive substances are excluded from searches.
   */
  @Property({ type: 'boolean', default: true })
  isActive: boolean = true;

  // ═══════════════════════════════════════════════════════════════════════════
  // VERSIONING (Critical for Compliance)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GSR version this record belongs to.
   * Format: "2026.02.03" (YYYY.MM.DD of seeding).
   * Used to pin compliance evidence to a specific data snapshot.
   */
  @Property({ type: 'varchar', length: 20 })
  @Index({ name: 'idx_substance_version' })
  dataVersion!: string;

  // ═══════════════════════════════════════════════════════════════════════════
  // RELATIONSHIPS (OneToMany to persona tables)
  // ═══════════════════════════════════════════════════════════════════════════

  @OneToMany(() => SubstanceAlias, (alias) => alias.substance)
  aliases = new Collection<SubstanceAlias>(this);

  @OneToMany(() => SubstanceEc, (ec) => ec.substance)
  ecNumbers = new Collection<SubstanceEc>(this);

  @OneToMany(() => SubstanceCosing, (cosing) => cosing.substance)
  cosingEntries = new Collection<SubstanceCosing>(this);

  @OneToMany(() => SubstanceEfsa, (efsa) => efsa.substance)
  efsaEntries = new Collection<SubstanceEfsa>(this);

  @OneToMany(() => SubstanceTsca, (tsca) => tsca.substance)
  tscaEntries = new Collection<SubstanceTsca>(this);

  @OneToMany(() => SubstanceBiocide, (biocide) => biocide.substance)
  biocideEntries = new Collection<SubstanceBiocide>(this);

  @OneToMany(() => SubstanceHazardClassification, (classification) => classification.substance)
  hazardClassifications = new Collection<SubstanceHazardClassification>(this);

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE HOOKS
  // ═══════════════════════════════════════════════════════════════════════════

  @BeforeCreate()
  @BeforeUpdate()
  validateCasNumber(): void {
    if (this.casNumber && !this.isValidCasNumber(this.casNumber)) {
      throw new Error(`Invalid CAS number checksum: ${this.casNumber}`);
    }
  }

  /**
   * Validates CAS number checksum digit.
   * CAS format: "127-19-5" where 5 is the check digit.
   */
  private isValidCasNumber(cas: string): boolean {
    // Remove dashes and validate format
    const match = cas.match(/^(\d{2,7})-(\d{2})-(\d)$/);
    if (!match) return false;

    const digits = cas.replace(/-/g, '');
    const checkDigit = parseInt(digits[digits.length - 1], 10);

    // Calculate checksum: multiply each digit by position (from right, excluding check digit)
    let sum = 0;
    const numDigits = digits.length - 1;
    for (let i = 0; i < numDigits; i++) {
      const position = numDigits - i;
      sum += parseInt(digits[i], 10) * position;
    }

    return sum % 10 === checkDigit;
  }
}
```

**Step 5: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/entities/Substance.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gsr/src/entities/Substance.ts packages/gsr/src/entities/Substance.test.ts
git commit -m "feat(gsr): update Substance entity to v2 Golden Record schema

- Add inchiKey as primary chemical fingerprint (unique when present)
- Add dtxsid as EPA CompTox identifier (unique)
- Add dataVersion for compliance snapshot pinning
- Add isMixture flag for UVCB substances
- Keep casNumber indexed but NOT unique (historical duplicates exist)
- Add relationships to all persona tables

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Create SubstanceEc Entity (EC Number Persona)

**Files:**
- Create: `/root/Documents/EuroComply/packages/gsr/src/entities/SubstanceEc.ts`
- Create: `/root/Documents/EuroComply/packages/gsr/src/entities/SubstanceEc.test.ts`
- Modify: `/root/Documents/EuroComply/packages/gsr/src/entities/index.ts`

**Step 1: Write failing test for SubstanceEc entity**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { createGsrOrm, closeGsrOrm } from '../orm.js';
import { Substance } from './Substance.js';
import { SubstanceEc, EcInventoryType } from './SubstanceEc.js';

describe('SubstanceEc Entity', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let testSubstance: Substance;

  beforeAll(async () => {
    orm = await createGsrOrm();
    const generator = orm.getSchemaGenerator();
    await generator.refreshDatabase();
  });

  afterAll(async () => {
    await closeGsrOrm(orm);
  });

  beforeEach(async () => {
    em = orm.em.fork();
    // Create a test substance
    testSubstance = em.create(Substance, {
      canonicalName: 'Ethanol',
      casNumber: '64-17-5',
      inchiKey: 'LFQSCWFLJHTTHZ-UHFFFAOYSA-N',
      dataVersion: '2026.02.03',
    });
    await em.persistAndFlush(testSubstance);
    em.clear();
    testSubstance = await em.findOneOrFail(Substance, { id: testSubstance.id });
  });

  describe('EC number mapping', () => {
    it('should_link_ec_number_to_substance_when_created', async () => {
      const ec = em.create(SubstanceEc, {
        substance: testSubstance,
        ecNumber: '200-578-6',
        ecName: 'ethanol',
        inventoryType: EcInventoryType.EINECS,
        isPrimary: true,
        dataVersion: '2026.02.03',
      });

      await em.persistAndFlush(ec);

      expect(ec.id).toBeDefined();
      expect(ec.ecNumber).toBe('200-578-6');
      expect(ec.substance.id).toBe(testSubstance.id);
    });

    it('should_allow_multiple_ec_numbers_for_same_substance', async () => {
      // This handles the historical EINECS error case
      const ec1 = em.create(SubstanceEc, {
        substance: testSubstance,
        ecNumber: '200-578-6',
        inventoryType: EcInventoryType.EINECS,
        isPrimary: true,
        dataVersion: '2026.02.03',
      });
      const ec2 = em.create(SubstanceEc, {
        substance: testSubstance,
        ecNumber: '603-002-00-5', // Different EC number
        inventoryType: EcInventoryType.EINECS,
        isPrimary: false,
        dataVersion: '2026.02.03',
      });

      await em.persistAndFlush([ec1, ec2]);

      const loaded = await em.findOneOrFail(Substance, { id: testSubstance.id }, {
        populate: ['ecNumbers'],
      });
      expect(loaded.ecNumbers.length).toBe(2);
    });

    it('should_enforce_unique_ec_number_constraint', async () => {
      const ec1 = em.create(SubstanceEc, {
        substance: testSubstance,
        ecNumber: '200-578-6',
        inventoryType: EcInventoryType.EINECS,
        dataVersion: '2026.02.03',
      });
      await em.persistAndFlush(ec1);
      em.clear();

      // Create another substance
      const substance2 = em.create(Substance, {
        canonicalName: 'Another substance',
        dataVersion: '2026.02.03',
      });
      await em.persistAndFlush(substance2);

      const ec2 = em.create(SubstanceEc, {
        substance: substance2,
        ecNumber: '200-578-6', // Same EC number!
        inventoryType: EcInventoryType.EINECS,
        dataVersion: '2026.02.03',
      });

      await expect(em.persistAndFlush(ec2)).rejects.toThrow(/unique/i);
    });
  });

  describe('inventory types', () => {
    it('should_support_einecs_elincs_nlp_types', async () => {
      const types = [EcInventoryType.EINECS, EcInventoryType.ELINCS, EcInventoryType.NLP];

      for (const inventoryType of types) {
        const ec = em.create(SubstanceEc, {
          substance: testSubstance,
          ecNumber: `${Math.random().toString().slice(2, 5)}-${Math.random().toString().slice(2, 5)}-${Math.floor(Math.random() * 10)}`,
          inventoryType,
          dataVersion: '2026.02.03',
        });
        await em.persistAndFlush(ec);
        expect(ec.inventoryType).toBe(inventoryType);
        await em.removeAndFlush(ec);
      }
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/entities/SubstanceEc.test.ts`
Expected: FAIL with "Cannot find module './SubstanceEc.js'"

**Step 3: Create SubstanceEc entity**

```typescript
import {
  Entity,
  Property,
  ManyToOne,
  Enum,
  Index,
  Unique,
  type Rel,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Substance } from './Substance.js';

/**
 * EC Inventory Type
 * EINECS: European Inventory of Existing Commercial Chemical Substances (pre-1981)
 * ELINCS: European List of Notified Chemical Substances (1981-2007)
 * NLP: No Longer Polymers (polymers reclassified as non-polymers)
 */
export enum EcInventoryType {
  EINECS = 'EINECS',
  ELINCS = 'ELINCS',
  NLP = 'NLP',
}

/**
 * EC Number Persona: ECHA European Community number.
 *
 * Separate table because:
 * - One substance can have multiple EC numbers (historical EINECS errors)
 * - EC numbers are unique globally (unlike CAS)
 * - Enables Identity Ladder lookup: EC → substance_id
 */
@Entity({ tableName: 'substance_ec' })
export class SubstanceEc extends BaseEntity {
  @ManyToOne(() => Substance, { onDelete: 'cascade' })
  @Index({ name: 'idx_ec_substance' })
  substance!: Rel<Substance>;

  /**
   * EC number in format "200-578-6".
   * Globally unique - the ECHA canonical identifier.
   */
  @Property({ type: 'varchar', length: 20 })
  @Unique({ name: 'uq_ec_number' })
  @Index({ name: 'idx_ec_number' })
  ecNumber!: string;

  /**
   * Name as listed in EC inventory.
   */
  @Property({ type: 'text', nullable: true })
  ecName?: string | null;

  /**
   * Which EC inventory this entry comes from.
   */
  @Enum(() => EcInventoryType)
  @Index({ name: 'idx_ec_inventory_type' })
  inventoryType!: EcInventoryType;

  /**
   * For display when substance has multiple EC numbers.
   * Only one should be primary per substance.
   */
  @Property({ type: 'boolean', default: true })
  isPrimary: boolean = true;

  /**
   * Link to ECHA substance page.
   */
  @Property({ type: 'text', nullable: true })
  echaUrl?: string | null;

  /**
   * GSR version for compliance pinning.
   */
  @Property({ type: 'varchar', length: 20 })
  dataVersion!: string;
}
```

**Step 4: Update entities index to export SubstanceEc**

Modify `/root/Documents/EuroComply/packages/gsr/src/entities/index.ts` to include:

```typescript
export { SubstanceEc, EcInventoryType } from './SubstanceEc.js';
```

And add to `gsrEntities` array.

**Step 5: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/entities/SubstanceEc.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gsr/src/entities/SubstanceEc.ts packages/gsr/src/entities/SubstanceEc.test.ts packages/gsr/src/entities/index.ts
git commit -m "feat(gsr): add SubstanceEc entity for EC number persona

EC numbers are ECHA's unique identifiers for chemicals. Separate table
because one substance can have multiple EC numbers (historical errors)
while EC numbers themselves are globally unique.

Supports Identity Ladder lookup: EC number → substance_id

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Update Existing Persona Entities for v2 Schema

**Files:**
- Modify: `/root/Documents/EuroComply/packages/gsr/src/entities/SubstanceCosing.ts`
- Modify: `/root/Documents/EuroComply/packages/gsr/src/entities/SubstanceEfsa.ts`
- Modify: `/root/Documents/EuroComply/packages/gsr/src/entities/SubstanceTsca.ts`
- Modify: `/root/Documents/EuroComply/packages/gsr/src/entities/SubstanceBiocide.ts`

**Step 1: Read current persona entities**

Run: Read all four entity files to understand current structure.

**Step 2: Verify each entity has dataVersion field**

Each persona entity MUST have:
- `dataVersion: string` property for compliance pinning
- Proper relationship to Substance

**Step 3: Write tests for each persona ensuring dataVersion requirement**

Add to each persona's test file:

```typescript
it('should_require_data_version_for_compliance_pinning', async () => {
  const entity = em.create(SubstanceCosing, {
    substance: testSubstance,
    cosingRef: 'COSING-123',
    inciName: 'ETHANOL',
    inciNameNormalized: 'ethanol',
    dataVersion: '2026.02.03',
  });

  await em.persistAndFlush(entity);
  expect(entity.dataVersion).toBe('2026.02.03');
});
```

**Step 4: Update entities if dataVersion is missing**

Add to each entity that doesn't have it:

```typescript
@Property({ type: 'varchar', length: 20 })
dataVersion!: string;
```

**Step 5: Run all persona tests**

Run: `cd packages/gsr && pnpm test src/entities/Substance*.test.ts`
Expected: All PASS

**Step 6: Commit**

```bash
git add packages/gsr/src/entities/Substance*.ts packages/gsr/src/entities/Substance*.test.ts
git commit -m "feat(gsr): ensure all persona entities have dataVersion for compliance pinning

All GSR persona entities (CosIng, EFSA, TSCA, Biocides) now require
dataVersion field. This enables compliance evidence to be pinned
to a specific GSR snapshot version.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Create Identity Ladder Service

**Files:**
- Create: `/root/Documents/EuroComply/packages/gsr/src/services/IdentityLadder.ts`
- Create: `/root/Documents/EuroComply/packages/gsr/src/services/IdentityLadder.test.ts`

**Step 1: Write failing test for Identity Ladder**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { createGsrOrm, closeGsrOrm } from '../orm.js';
import { Substance } from '../entities/Substance.js';
import { SubstanceEc, EcInventoryType } from '../entities/SubstanceEc.js';
import { SubstanceCosing } from '../entities/SubstanceCosing.js';
import { SubstanceAlias } from '../entities/SubstanceAlias.js';
import { IdentityLadder, IdentityType, ResolutionResult } from './IdentityLadder.js';

describe('IdentityLadder', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let ladder: IdentityLadder;
  let testSubstance: Substance;

  beforeAll(async () => {
    orm = await createGsrOrm();
    const generator = orm.getSchemaGenerator();
    await generator.refreshDatabase();
  });

  afterAll(async () => {
    await closeGsrOrm(orm);
  });

  beforeEach(async () => {
    em = orm.em.fork();
    ladder = new IdentityLadder(em);

    // Create test substance with multiple identifiers
    testSubstance = em.create(Substance, {
      canonicalName: 'Ethanol',
      casNumber: '64-17-5',
      inchiKey: 'LFQSCWFLJHTTHZ-UHFFFAOYSA-N',
      dtxsid: 'DTXSID9020584',
      dataVersion: '2026.02.03',
    });
    await em.persistAndFlush(testSubstance);

    // Add EC number
    const ec = em.create(SubstanceEc, {
      substance: testSubstance,
      ecNumber: '200-578-6',
      inventoryType: EcInventoryType.EINECS,
      dataVersion: '2026.02.03',
    });
    await em.persistAndFlush(ec);

    // Add INCI name
    const cosing = em.create(SubstanceCosing, {
      substance: testSubstance,
      cosingRef: 'COSING-32478',
      inciName: 'ALCOHOL',
      inciNameNormalized: 'alcohol',
      dataVersion: '2026.02.03',
    });
    await em.persistAndFlush(cosing);

    // Add alias
    const alias = em.create(SubstanceAlias, {
      substance: testSubstance,
      name: 'Ethyl alcohol',
      nameNormalized: 'ethyl alcohol',
      aliasType: 'SYNONYM',
      dataVersion: '2026.02.03',
    });
    await em.persistAndFlush(alias);

    em.clear();
  });

  describe('resolve', () => {
    it('should_resolve_inchi_key_to_substance_with_highest_confidence', async () => {
      const result = await ladder.resolve('LFQSCWFLJHTTHZ-UHFFFAOYSA-N');

      expect(result.found).toBe(true);
      expect(result.substance?.id).toBe(testSubstance.id);
      expect(result.matchedBy).toBe(IdentityType.INCHI_KEY);
      expect(result.confidence).toBe(1.0);
    });

    it('should_resolve_cas_number_to_substance', async () => {
      const result = await ladder.resolve('64-17-5');

      expect(result.found).toBe(true);
      expect(result.substance?.id).toBe(testSubstance.id);
      expect(result.matchedBy).toBe(IdentityType.CAS_NUMBER);
      expect(result.confidence).toBeGreaterThanOrEqual(0.95);
    });

    it('should_resolve_ec_number_to_substance', async () => {
      const result = await ladder.resolve('200-578-6');

      expect(result.found).toBe(true);
      expect(result.substance?.id).toBe(testSubstance.id);
      expect(result.matchedBy).toBe(IdentityType.EC_NUMBER);
    });

    it('should_resolve_inci_name_to_substance', async () => {
      const result = await ladder.resolve('ALCOHOL');

      expect(result.found).toBe(true);
      expect(result.substance?.id).toBe(testSubstance.id);
      expect(result.matchedBy).toBe(IdentityType.INCI_NAME);
    });

    it('should_resolve_dtxsid_to_substance', async () => {
      const result = await ladder.resolve('DTXSID9020584');

      expect(result.found).toBe(true);
      expect(result.substance?.id).toBe(testSubstance.id);
      expect(result.matchedBy).toBe(IdentityType.DTXSID);
    });

    it('should_resolve_name_with_fuzzy_match', async () => {
      const result = await ladder.resolve('Ethyl alcohol');

      expect(result.found).toBe(true);
      expect(result.substance?.id).toBe(testSubstance.id);
      expect(result.matchedBy).toBe(IdentityType.ALIAS_FUZZY);
      expect(result.confidence).toBeLessThan(1.0);
    });

    it('should_return_not_found_for_unknown_identifier', async () => {
      const result = await ladder.resolve('UNKNOWN-12345-X');

      expect(result.found).toBe(false);
      expect(result.substance).toBeUndefined();
    });
  });

  describe('resolveWithHint', () => {
    it('should_skip_ladder_when_identity_type_is_specified', async () => {
      const result = await ladder.resolveWithHint('64-17-5', IdentityType.CAS_NUMBER);

      expect(result.found).toBe(true);
      expect(result.matchedBy).toBe(IdentityType.CAS_NUMBER);
    });
  });

  describe('resolveBatch', () => {
    it('should_resolve_multiple_identifiers_efficiently', async () => {
      const results = await ladder.resolveBatch([
        '64-17-5',
        '200-578-6',
        'UNKNOWN-XYZ',
      ]);

      expect(results.length).toBe(3);
      expect(results[0].found).toBe(true);
      expect(results[1].found).toBe(true);
      expect(results[2].found).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/services/IdentityLadder.test.ts`
Expected: FAIL with "Cannot find module './IdentityLadder.js'"

**Step 3: Implement Identity Ladder service**

```typescript
import { type EntityManager } from '@mikro-orm/postgresql';
import { Substance } from '../entities/Substance.js';
import { SubstanceEc } from '../entities/SubstanceEc.js';
import { SubstanceCosing } from '../entities/SubstanceCosing.js';
import { SubstanceEfsa } from '../entities/SubstanceEfsa.js';
import { SubstanceAlias } from '../entities/SubstanceAlias.js';

/**
 * Identity types in resolution priority order.
 * Higher = more reliable identifier.
 */
export enum IdentityType {
  INCHI_KEY = 'INCHI_KEY',       // Confidence: 1.0 (structure-derived)
  DTXSID = 'DTXSID',             // Confidence: 0.99 (EPA authoritative)
  CAS_NUMBER = 'CAS_NUMBER',     // Confidence: 0.95 (historical dupes exist)
  EC_NUMBER = 'EC_NUMBER',       // Confidence: 0.95 (ECHA unique)
  INCI_NAME = 'INCI_NAME',       // Confidence: 0.90 (CosIng exact)
  E_NUMBER = 'E_NUMBER',         // Confidence: 0.90 (EFSA exact)
  NAME_EXACT = 'NAME_EXACT',     // Confidence: 0.85 (canonical name)
  ALIAS_EXACT = 'ALIAS_EXACT',   // Confidence: 0.80 (synonym exact)
  NAME_FUZZY = 'NAME_FUZZY',     // Confidence: 0.70 (trigram match)
  ALIAS_FUZZY = 'ALIAS_FUZZY',   // Confidence: 0.60 (alias trigram)
}

export interface ResolutionResult {
  found: boolean;
  substance?: Substance;
  matchedBy?: IdentityType;
  matchedValue?: string;
  confidence: number;
  alternativeMatches?: Substance[];
}

/**
 * Identity Ladder: Universal substance resolution service.
 *
 * Resolution priority (from most to least reliable):
 * 1. InChIKey (exact) → 100% confidence (structure-derived fingerprint)
 * 2. DTXSID (exact) → 99% confidence (EPA authoritative)
 * 3. CAS (exact) → 95% confidence (historical duplicates exist)
 * 4. EC (exact) → 95% confidence (ECHA unique)
 * 5. INCI (exact) → 90% confidence (CosIng)
 * 6. E-Number (exact) → 90% confidence (EFSA)
 * 7. Name (exact) → 85% confidence
 * 8. Alias (exact) → 80% confidence
 * 9. Name (fuzzy) → 70% confidence (pg_trgm)
 * 10. Alias (fuzzy) → 60% confidence (pg_trgm)
 */
export class IdentityLadder {
  private em: EntityManager;
  private readonly FUZZY_THRESHOLD = 0.3; // pg_trgm similarity threshold

  constructor(em: EntityManager) {
    this.em = em;
  }

  /**
   * Resolve any identifier to a substance using the Identity Ladder.
   * Tries each resolution method in priority order until a match is found.
   */
  async resolve(identifier: string): Promise<ResolutionResult> {
    const normalized = identifier.trim();

    // 1. InChIKey pattern: 27 chars, uppercase, specific format
    if (this.isInChIKeyFormat(normalized)) {
      const result = await this.resolveByInChIKey(normalized);
      if (result.found) return result;
    }

    // 2. DTXSID pattern: DTXSID followed by digits
    if (this.isDtxsidFormat(normalized)) {
      const result = await this.resolveByDtxsid(normalized);
      if (result.found) return result;
    }

    // 3. CAS pattern: digits-digits-digit
    if (this.isCasFormat(normalized)) {
      const result = await this.resolveByCas(normalized);
      if (result.found) return result;
    }

    // 4. EC pattern: digits-digits-digit (same as CAS but different range)
    if (this.isEcFormat(normalized)) {
      const result = await this.resolveByEcNumber(normalized);
      if (result.found) return result;
    }

    // 5. INCI name (uppercase convention)
    const inciResult = await this.resolveByInciName(normalized);
    if (inciResult.found) return inciResult;

    // 6. E-Number pattern: E followed by digits
    if (this.isENumberFormat(normalized)) {
      const result = await this.resolveByENumber(normalized);
      if (result.found) return result;
    }

    // 7. Exact name match
    const exactNameResult = await this.resolveByExactName(normalized);
    if (exactNameResult.found) return exactNameResult;

    // 8. Exact alias match
    const exactAliasResult = await this.resolveByExactAlias(normalized);
    if (exactAliasResult.found) return exactAliasResult;

    // 9. Fuzzy name match
    const fuzzyNameResult = await this.resolveByFuzzyName(normalized);
    if (fuzzyNameResult.found) return fuzzyNameResult;

    // 10. Fuzzy alias match
    const fuzzyAliasResult = await this.resolveByFuzzyAlias(normalized);
    if (fuzzyAliasResult.found) return fuzzyAliasResult;

    return { found: false, confidence: 0 };
  }

  /**
   * Resolve with a hint about the identifier type (skip ladder).
   */
  async resolveWithHint(identifier: string, type: IdentityType): Promise<ResolutionResult> {
    const normalized = identifier.trim();

    switch (type) {
      case IdentityType.INCHI_KEY:
        return this.resolveByInChIKey(normalized);
      case IdentityType.DTXSID:
        return this.resolveByDtxsid(normalized);
      case IdentityType.CAS_NUMBER:
        return this.resolveByCas(normalized);
      case IdentityType.EC_NUMBER:
        return this.resolveByEcNumber(normalized);
      case IdentityType.INCI_NAME:
        return this.resolveByInciName(normalized);
      case IdentityType.E_NUMBER:
        return this.resolveByENumber(normalized);
      default:
        return this.resolve(normalized);
    }
  }

  /**
   * Resolve multiple identifiers efficiently using batch queries.
   * Critical for performance: 500 chemicals from XLSX at once.
   */
  async resolveBatch(identifiers: string[]): Promise<ResolutionResult[]> {
    const normalized = identifiers.map((id) => id.trim());
    const results: Map<string, ResolutionResult> = new Map();

    // Initialize all as not found
    for (const id of normalized) {
      results.set(id, { found: false, confidence: 0 });
    }

    // Partition identifiers by detected type for efficient batch queries
    const inchiKeys = normalized.filter((id) => this.isInChIKeyFormat(id));
    const dtxsids = normalized.filter((id) => this.isDtxsidFormat(id));
    const casNumbers = normalized.filter((id) => this.isCasFormat(id));
    const ecNumbers = normalized.filter((id) => this.isEcFormat(id));
    const remaining = normalized.filter(
      (id) =>
        !this.isInChIKeyFormat(id) &&
        !this.isDtxsidFormat(id) &&
        !this.isCasFormat(id) &&
        !this.isEcFormat(id)
    );

    // Batch 1: InChIKeys (highest confidence)
    if (inchiKeys.length > 0) {
      const substances = await this.em.find(Substance, {
        inchiKey: { $in: inchiKeys.map((k) => k.toUpperCase()) },
      });
      for (const substance of substances) {
        if (substance.inchiKey) {
          const originalId = normalized.find(
            (id) => id.toUpperCase() === substance.inchiKey?.toUpperCase()
          );
          if (originalId) {
            results.set(originalId, {
              found: true,
              substance,
              matchedBy: IdentityType.INCHI_KEY,
              matchedValue: originalId,
              confidence: 1.0,
            });
          }
        }
      }
    }

    // Batch 2: DTXSIDs
    if (dtxsids.length > 0) {
      const substances = await this.em.find(Substance, {
        dtxsid: { $in: dtxsids.map((d) => d.toUpperCase()) },
      });
      for (const substance of substances) {
        if (substance.dtxsid) {
          const originalId = normalized.find(
            (id) => id.toUpperCase() === substance.dtxsid?.toUpperCase()
          );
          if (originalId && !results.get(originalId)?.found) {
            results.set(originalId, {
              found: true,
              substance,
              matchedBy: IdentityType.DTXSID,
              matchedValue: originalId,
              confidence: 0.99,
            });
          }
        }
      }
    }

    // Batch 3: CAS numbers
    if (casNumbers.length > 0) {
      const substances = await this.em.find(Substance, {
        casNumber: { $in: casNumbers },
      });
      for (const substance of substances) {
        if (substance.casNumber) {
          const originalId = normalized.find((id) => id === substance.casNumber);
          if (originalId && !results.get(originalId)?.found) {
            results.set(originalId, {
              found: true,
              substance,
              matchedBy: IdentityType.CAS_NUMBER,
              matchedValue: originalId,
              confidence: 0.95,
            });
          }
        }
      }
    }

    // Batch 4: EC numbers
    if (ecNumbers.length > 0) {
      const ecEntries = await this.em.find(
        SubstanceEc,
        { ecNumber: { $in: ecNumbers } },
        { populate: ['substance'] }
      );
      for (const ec of ecEntries) {
        const originalId = normalized.find((id) => id === ec.ecNumber);
        if (originalId && !results.get(originalId)?.found) {
          results.set(originalId, {
            found: true,
            substance: ec.substance,
            matchedBy: IdentityType.EC_NUMBER,
            matchedValue: originalId,
            confidence: 0.95,
          });
        }
      }
    }

    // Remaining identifiers: fall back to sequential resolution
    // (INCI names, E-numbers, fuzzy matches are harder to batch efficiently)
    for (const id of remaining) {
      if (!results.get(id)?.found) {
        const result = await this.resolve(id);
        results.set(id, result);
      }
    }

    // Return results in original order
    return normalized.map((id) => results.get(id)!);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESOLUTION METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  private async resolveByInChIKey(inchiKey: string): Promise<ResolutionResult> {
    const substance = await this.em.findOne(Substance, { inchiKey: inchiKey.toUpperCase() });
    if (substance) {
      return {
        found: true,
        substance,
        matchedBy: IdentityType.INCHI_KEY,
        matchedValue: inchiKey,
        confidence: 1.0,
      };
    }
    return { found: false, confidence: 0 };
  }

  private async resolveByDtxsid(dtxsid: string): Promise<ResolutionResult> {
    const substance = await this.em.findOne(Substance, { dtxsid: dtxsid.toUpperCase() });
    if (substance) {
      return {
        found: true,
        substance,
        matchedBy: IdentityType.DTXSID,
        matchedValue: dtxsid,
        confidence: 0.99,
      };
    }
    return { found: false, confidence: 0 };
  }

  private async resolveByCas(cas: string): Promise<ResolutionResult> {
    const substance = await this.em.findOne(Substance, { casNumber: cas });
    if (substance) {
      return {
        found: true,
        substance,
        matchedBy: IdentityType.CAS_NUMBER,
        matchedValue: cas,
        confidence: 0.95,
      };
    }
    return { found: false, confidence: 0 };
  }

  private async resolveByEcNumber(ec: string): Promise<ResolutionResult> {
    const ecEntry = await this.em.findOne(SubstanceEc, { ecNumber: ec }, { populate: ['substance'] });
    if (ecEntry) {
      return {
        found: true,
        substance: ecEntry.substance,
        matchedBy: IdentityType.EC_NUMBER,
        matchedValue: ec,
        confidence: 0.95,
      };
    }
    return { found: false, confidence: 0 };
  }

  private async resolveByInciName(name: string): Promise<ResolutionResult> {
    const cosing = await this.em.findOne(
      SubstanceCosing,
      { inciNameNormalized: name.toLowerCase() },
      { populate: ['substance'] }
    );
    if (cosing) {
      return {
        found: true,
        substance: cosing.substance,
        matchedBy: IdentityType.INCI_NAME,
        matchedValue: name,
        confidence: 0.90,
      };
    }
    return { found: false, confidence: 0 };
  }

  private async resolveByENumber(eNumber: string): Promise<ResolutionResult> {
    const efsa = await this.em.findOne(
      SubstanceEfsa,
      { eNumber: eNumber.toUpperCase() },
      { populate: ['substance'] }
    );
    if (efsa) {
      return {
        found: true,
        substance: efsa.substance,
        matchedBy: IdentityType.E_NUMBER,
        matchedValue: eNumber,
        confidence: 0.90,
      };
    }
    return { found: false, confidence: 0 };
  }

  private async resolveByExactName(name: string): Promise<ResolutionResult> {
    const substance = await this.em.findOne(Substance, {
      canonicalName: { $ilike: name },
    });
    if (substance) {
      return {
        found: true,
        substance,
        matchedBy: IdentityType.NAME_EXACT,
        matchedValue: name,
        confidence: 0.85,
      };
    }
    return { found: false, confidence: 0 };
  }

  private async resolveByExactAlias(name: string): Promise<ResolutionResult> {
    const alias = await this.em.findOne(
      SubstanceAlias,
      { nameNormalized: name.toLowerCase() },
      { populate: ['substance'] }
    );
    if (alias) {
      return {
        found: true,
        substance: alias.substance,
        matchedBy: IdentityType.ALIAS_EXACT,
        matchedValue: name,
        confidence: 0.80,
      };
    }
    return { found: false, confidence: 0 };
  }

  private async resolveByFuzzyName(name: string): Promise<ResolutionResult> {
    // Use pg_trgm similarity search
    const results = await this.em.execute<Array<{ id: string; similarity: number }>>(
      `SELECT id, similarity(canonical_name, ?) as similarity
       FROM substance
       WHERE similarity(canonical_name, ?) > ?
       ORDER BY similarity DESC
       LIMIT 1`,
      [name, name, this.FUZZY_THRESHOLD]
    );

    if (results.length > 0) {
      const substance = await this.em.findOne(Substance, { id: results[0].id });
      if (substance) {
        return {
          found: true,
          substance,
          matchedBy: IdentityType.NAME_FUZZY,
          matchedValue: name,
          confidence: 0.70 * results[0].similarity,
        };
      }
    }
    return { found: false, confidence: 0 };
  }

  private async resolveByFuzzyAlias(name: string): Promise<ResolutionResult> {
    const results = await this.em.execute<Array<{ substance_id: string; similarity: number }>>(
      `SELECT substance_id, similarity(name_normalized, ?) as similarity
       FROM substance_alias
       WHERE similarity(name_normalized, ?) > ?
       ORDER BY similarity DESC
       LIMIT 1`,
      [name.toLowerCase(), name.toLowerCase(), this.FUZZY_THRESHOLD]
    );

    if (results.length > 0) {
      const substance = await this.em.findOne(Substance, { id: results[0].substance_id });
      if (substance) {
        return {
          found: true,
          substance,
          matchedBy: IdentityType.ALIAS_FUZZY,
          matchedValue: name,
          confidence: 0.60 * results[0].similarity,
        };
      }
    }
    return { found: false, confidence: 0 };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FORMAT DETECTION
  // ═══════════════════════════════════════════════════════════════════════════

  private isInChIKeyFormat(value: string): boolean {
    // InChIKey: 27 chars, uppercase, format: XXXXXXXXXXXXXX-XXXXXXXXXX-X
    return /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/.test(value);
  }

  private isDtxsidFormat(value: string): boolean {
    // DTXSID followed by digits
    return /^DTXSID\d+$/i.test(value);
  }

  private isCasFormat(value: string): boolean {
    // CAS: 2-7 digits, dash, 2 digits, dash, 1 digit
    return /^\d{2,7}-\d{2}-\d$/.test(value);
  }

  private isEcFormat(value: string): boolean {
    // EC: 3 digits, dash, 3 digits, dash, 1 digit
    return /^\d{3}-\d{3}-\d$/.test(value);
  }

  private isENumberFormat(value: string): boolean {
    // E-Number: E followed by 3-4 digits, optional letter
    return /^E\d{3,4}[a-z]?(\([ivx]+\))?$/i.test(value);
  }
}
```

**Step 4: Create services index file**

Create: `/root/Documents/EuroComply/packages/gsr/src/services/index.ts`

```typescript
export { IdentityLadder, IdentityType, type ResolutionResult } from './IdentityLadder.js';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/services/IdentityLadder.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gsr/src/services/
git commit -m "feat(gsr): add Identity Ladder service for universal substance resolution

Identity Ladder resolves any chemical identifier to a substance_id:
1. InChIKey (100% confidence) - structure-derived fingerprint
2. DTXSID (99%) - EPA CompTox authoritative
3. CAS (95%) - historical duplicates exist
4. EC (95%) - ECHA unique
5. INCI (90%) - CosIng cosmetics
6. E-Number (90%) - EFSA food
7. Name exact (85%)
8. Alias exact (80%)
9. Name fuzzy (70%) - pg_trgm
10. Alias fuzzy (60%) - pg_trgm

Used by seeders to resolve identifiers during rule compilation.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Create GSR Version Tracking Entities

**Files:**
- Create: `/root/Documents/EuroComply/packages/gsr/src/entities/GsrVersion.ts`
- Create: `/root/Documents/EuroComply/packages/gsr/src/entities/GsrCurrent.ts`
- Create: `/root/Documents/EuroComply/packages/gsr/src/entities/GsrVersion.test.ts`

**Step 1: Write failing test for GSR version tracking**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { createGsrOrm, closeGsrOrm } from '../orm.js';
import { GsrVersion } from './GsrVersion.js';
import { GsrCurrent } from './GsrCurrent.js';

describe('GSR Version Tracking', () => {
  let orm: MikroORM;
  let em: EntityManager;

  beforeAll(async () => {
    orm = await createGsrOrm();
    const generator = orm.getSchemaGenerator();
    await generator.refreshDatabase();
  });

  afterAll(async () => {
    await closeGsrOrm(orm);
  });

  beforeEach(async () => {
    em = orm.em.fork();
    // Clear version tables
    await em.nativeDelete(GsrCurrent, {});
    await em.nativeDelete(GsrVersion, {});
  });

  describe('GsrVersion', () => {
    it('should_record_version_with_counts_when_seeding_completes', async () => {
      const version = em.create(GsrVersion, {
        version: '2026.02.03',
        substanceCount: 1200000,
        cosingCount: 35000,
        efsaCount: 2500,
        tscaCount: 86000,
        biocideCount: 800,
        classificationCount: 4762,
        seededAt: new Date(),
        notes: 'Full CompTox + CLP seeding',
      });

      await em.persistAndFlush(version);

      const loaded = await em.findOneOrFail(GsrVersion, { version: '2026.02.03' });
      expect(loaded.substanceCount).toBe(1200000);
    });
  });

  describe('GsrCurrent', () => {
    it('should_enforce_singleton_constraint', async () => {
      // Create version first
      const version = em.create(GsrVersion, {
        version: '2026.02.03',
        substanceCount: 100,
        seededAt: new Date(),
      });
      await em.persistAndFlush(version);

      // Set current version
      const current = em.create(GsrCurrent, {
        singleton: true,
        version: version,
      });
      await em.persistAndFlush(current);

      // Try to create another current - should fail
      const second = em.create(GsrCurrent, {
        singleton: true,
        version: version,
      });

      await expect(em.persistAndFlush(second)).rejects.toThrow(/unique|duplicate/i);
    });

    it('should_return_current_gsr_version_when_queried', async () => {
      const version = em.create(GsrVersion, {
        version: '2026.02.03',
        substanceCount: 100,
        seededAt: new Date(),
      });
      await em.persistAndFlush(version);

      const current = em.create(GsrCurrent, {
        singleton: true,
        version: version,
      });
      await em.persistAndFlush(current);

      const loaded = await em.findOneOrFail(GsrCurrent, { singleton: true }, { populate: ['version'] });
      expect(loaded.version.version).toBe('2026.02.03');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gsr && pnpm test src/entities/GsrVersion.test.ts`
Expected: FAIL

**Step 3: Create GsrVersion entity**

```typescript
import { Entity, Property, PrimaryKey, OneToMany, Collection } from '@mikro-orm/core';

/**
 * GSR Version: Records each seeding snapshot for compliance pinning.
 *
 * When a tenant creates compliance evidence, they pin to a specific
 * GSR version. This allows legal time-travel: "At the time of evaluation,
 * the chemical data was version X".
 */
@Entity({ tableName: 'gsr_version' })
export class GsrVersion {
  /**
   * Version string in YYYY.MM.DD format.
   * This is the PRIMARY KEY - no surrogate UUID.
   */
  @PrimaryKey({ type: 'varchar', length: 20 })
  version!: string;

  @Property({ type: 'integer' })
  substanceCount!: number;

  @Property({ type: 'integer', nullable: true })
  cosingCount?: number | null;

  @Property({ type: 'integer', nullable: true })
  efsaCount?: number | null;

  @Property({ type: 'integer', nullable: true })
  tscaCount?: number | null;

  @Property({ type: 'integer', nullable: true })
  biocideCount?: number | null;

  @Property({ type: 'integer', nullable: true })
  classificationCount?: number | null;

  @Property({ type: 'timestamptz' })
  seededAt!: Date;

  @Property({ type: 'text', nullable: true })
  notes?: string | null;
}
```

**Step 4: Create GsrCurrent entity**

```typescript
import { Entity, Property, PrimaryKey, ManyToOne, type Rel } from '@mikro-orm/core';
import { GsrVersion } from './GsrVersion.js';

/**
 * GsrCurrent: Singleton table pointing to the active GSR version.
 *
 * Uses a CHECK constraint to ensure only one row exists.
 * Query: SELECT * FROM gsr_current WHERE singleton = true
 */
@Entity({ tableName: 'gsr_current' })
export class GsrCurrent {
  /**
   * Always TRUE - enforced by CHECK constraint.
   * This makes the table a singleton (max 1 row).
   */
  @PrimaryKey({ type: 'boolean' })
  singleton: boolean = true;

  @ManyToOne(() => GsrVersion)
  version!: Rel<GsrVersion>;
}
```

**Step 5: Update entities index**

Add to `/root/Documents/EuroComply/packages/gsr/src/entities/index.ts`:

```typescript
export { GsrVersion } from './GsrVersion.js';
export { GsrCurrent } from './GsrCurrent.js';
```

**Step 6: Run test to verify it passes**

Run: `cd packages/gsr && pnpm test src/entities/GsrVersion.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/gsr/src/entities/GsrVersion.ts packages/gsr/src/entities/GsrCurrent.ts packages/gsr/src/entities/GsrVersion.test.ts packages/gsr/src/entities/index.ts
git commit -m "feat(gsr): add version tracking for compliance snapshot pinning

GsrVersion records each seeding snapshot with counts per persona.
GsrCurrent singleton points to the active version.

Enables legal time-travel: compliance evidence pins to specific
GSR version, allowing 'at the time of evaluation' audits.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Update GSR Test Utilities

**Files:**
- Modify: `/root/Documents/EuroComply/packages/gsr/src/test-utils.ts`

**Step 1: Read current test utilities**

Run: Read `/root/Documents/EuroComply/packages/gsr/src/test-utils.ts`

**Step 2: Update test utilities for dedicated GSR ORM**

```typescript
import { MikroORM } from '@mikro-orm/postgresql';
import { createGsrOrm, closeGsrOrm } from './orm.js';

let gsrOrm: MikroORM | null = null;

/**
 * Setup GSR test database connection.
 * Creates schema and returns ORM instance.
 */
export async function setupGsrTestDb(): Promise<MikroORM> {
  if (gsrOrm) {
    return gsrOrm;
  }

  gsrOrm = await createGsrOrm();

  // Refresh schema for tests
  const generator = gsrOrm.getSchemaGenerator();
  await generator.refreshDatabase();

  return gsrOrm;
}

/**
 * Teardown GSR test database connection.
 */
export async function teardownGsrTestDb(): Promise<void> {
  if (gsrOrm) {
    await closeGsrOrm(gsrOrm);
    gsrOrm = null;
  }
}

/**
 * Clear all data from GSR tables (for test isolation).
 * Respects foreign key constraints by clearing in correct order.
 */
export async function clearGsrTestDb(orm: MikroORM): Promise<void> {
  const em = orm.em.fork();

  // Order matters due to foreign keys
  const tablesToClear = [
    'gsr_current',
    'gsr_version',
    'substance_hazard_classification',
    'substance_list_entry',
    'substance_group_member',
    'substance_group',
    'substance_biocide',
    'substance_tsca',
    'substance_efsa',
    'substance_cosing',
    'substance_ec',
    'substance_alias',
    'substance',
    'hazard_statement',
    'hazard_class',
    'regulatory_list',
  ];

  for (const table of tablesToClear) {
    try {
      await em.execute(`TRUNCATE TABLE ${table} CASCADE`);
    } catch {
      // Table may not exist yet, ignore
    }
  }
}

/**
 * Check if GSR database is available (for CI/local dev).
 */
export async function isGsrDatabaseAvailable(): Promise<boolean> {
  try {
    const orm = await createGsrOrm();
    await orm.em.execute('SELECT 1');
    await closeGsrOrm(orm);
    return true;
  } catch {
    return false;
  }
}
```

**Step 3: Run all GSR tests to verify utilities work**

Run: `cd packages/gsr && pnpm test`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/gsr/src/test-utils.ts
git commit -m "chore(gsr): update test utilities for dedicated GSR database

- setupGsrTestDb() creates connection to eurocomply_gsr_test
- clearGsrTestDb() truncates tables in FK order
- isGsrDatabaseAvailable() for CI health checks

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Create GSR Database Migration

**Files:**
- Create: `/root/Documents/EuroComply/packages/gsr/src/migrations/Migration20260202000000_GsrSchema.ts`

**Step 1: Write failing test for migration**

We'll test that the schema generator produces the expected tables.

```typescript
// This is verified by running the schema generator
// No separate test needed - the entity tests validate the schema
```

**Step 2: Generate migration from entities**

Run: `cd packages/gsr && pnpm mikro-orm migration:create --initial`

Or create manually based on the v2 architecture design.

**Step 3: Verify migration creates all required tables**

The migration should create:
- `substance`
- `substance_alias`
- `substance_ec`
- `substance_cosing`
- `substance_efsa`
- `substance_tsca`
- `substance_biocide`
- `hazard_class`
- `hazard_statement`
- `substance_hazard_classification`
- `regulatory_list`
- `substance_group`
- `substance_group_member`
- `substance_list_entry`
- `gsr_version`
- `gsr_current`

**Step 4: Run migration**

Run: `cd packages/gsr && pnpm mikro-orm migration:up`
Expected: Migration completes successfully

**Step 5: Commit**

```bash
git add packages/gsr/src/migrations/
git commit -m "feat(gsr): add initial GSR database migration

Creates all Golden Record schema tables:
- substance (1.2M+ records target)
- Persona tables (EC, CosIng, EFSA, TSCA, Biocides)
- Hazard classifications (CLP)
- Regulatory lists
- Version tracking for compliance pinning

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Segment 01 Completion Checklist

- [ ] Docker compose updated with eurocomply_gsr database
- [ ] init-db.sql creates all required databases and extensions
- [ ] GSR ORM configuration created with separate connection
- [ ] Substance entity updated to v2 Golden Record schema
- [ ] SubstanceEc entity created for EC number persona
- [ ] All persona entities have dataVersion field
- [ ] Identity Ladder service implemented with 10-level resolution
- [ ] GSR version tracking entities created
- [ ] Test utilities updated for multi-database setup
- [ ] All tests pass
- [ ] All commits follow CLAUDE.md format

---

## Next Segment

Proceed to **Segment 02: GSR Seeding Pipeline**

File: `docs/plans/2026-02-02-v2-implementation-plan-02-gsr-seeding.md`
