# Taxonomy Plan 4: Substance Registry

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement substance registry with ECHA data (SVHC, Authorization, Restriction lists) for chemical compliance checking (REACH, RoHS).

**Architecture:** Create `Substance` and `SubstanceAlias` entities in public schema. Implement CAS number validation with checksum verification. Use the seed infrastructure from Plan 1 for idempotent seeding of ~400 regulated substances.

**Tech Stack:** MikroORM, PostgreSQL, ECHA SVHC/Auth/Restriction data

**Prerequisites:** Plan 1 (Seed Infrastructure) must be completed first.

**Reference:** See `docs/plans/2026-01-23-taxonomy-engine-design.md` Section 4.6

---

## Task 1: Create AliasType Enum

**Files:**
- Create: `packages/database/src/entities/enums/AliasType.ts`
- Modify: `packages/database/src/entities/enums/index.ts`

**Step 1: Create the enum file**

```typescript
// packages/database/src/entities/enums/AliasType.ts
export enum AliasType {
  IUPAC = 'IUPAC',           // IUPAC systematic name
  COMMON = 'COMMON',         // Common/trivial name
  TRADE = 'TRADE',           // Trade/brand name
  SYNONYM = 'SYNONYM',       // General synonym
  INDEX_NAME = 'INDEX_NAME', // CLP Index name
}
```

**Step 2: Export from index**

```typescript
// packages/database/src/entities/enums/index.ts
// Add to existing exports:
export { AliasType } from './AliasType.js';
```

**Step 3: Verify build**

```bash
cd packages/database && pnpm build
```

Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/database/src/entities/enums/AliasType.ts packages/database/src/entities/enums/index.ts
git commit -m "feat(database): add AliasType enum (IUPAC, COMMON, TRADE, SYNONYM, INDEX_NAME)"
```

---

## Task 2: Create CAS Number Validation Utility

**Files:**
- Create: `packages/database/src/utils/cas-validator.ts`
- Test: `packages/database/src/utils/cas-validator.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/utils/cas-validator.test.ts
import { describe, it, expect } from 'vitest';
import { isValidCasNumber, formatCasNumber, parseCasNumber } from './cas-validator.js';

describe('CAS Number Validation', () => {
  describe('isValidCasNumber', () => {
    it('should validate correct CAS numbers', () => {
      // Well-known CAS numbers
      expect(isValidCasNumber('7732-18-5')).toBe(true);   // Water
      expect(isValidCasNumber('64-17-5')).toBe(true);     // Ethanol
      expect(isValidCasNumber('127-19-5')).toBe(true);    // DMAC (SVHC)
      expect(isValidCasNumber('7439-92-1')).toBe(true);   // Lead
      expect(isValidCasNumber('50-00-0')).toBe(true);     // Formaldehyde
      expect(isValidCasNumber('7440-02-0')).toBe(true);   // Nickel
      expect(isValidCasNumber('111-76-2')).toBe(true);    // 2-Butoxyethanol
    });

    it('should reject invalid check digits', () => {
      expect(isValidCasNumber('7732-18-6')).toBe(false);  // Wrong check digit
      expect(isValidCasNumber('64-17-6')).toBe(false);    // Wrong check digit
      expect(isValidCasNumber('127-19-6')).toBe(false);   // Wrong check digit
    });

    it('should reject malformed formats', () => {
      expect(isValidCasNumber('773218-5')).toBe(false);   // Missing hyphen
      expect(isValidCasNumber('7732-185')).toBe(false);   // Missing hyphen
      expect(isValidCasNumber('7732-1-5')).toBe(false);   // Wrong middle section
      expect(isValidCasNumber('7732-18-55')).toBe(false); // Wrong check digit length
      expect(isValidCasNumber('')).toBe(false);           // Empty
      expect(isValidCasNumber('abc-de-f')).toBe(false);   // Non-numeric
    });

    it('should reject numbers outside valid range', () => {
      expect(isValidCasNumber('1-23-4')).toBe(false);     // First section too short
      expect(isValidCasNumber('12345678-90-1')).toBe(false); // First section too long
    });
  });

  describe('formatCasNumber', () => {
    it('should format CAS numbers correctly', () => {
      expect(formatCasNumber('7732185')).toBe('7732-18-5');
      expect(formatCasNumber('6417-5')).toBe(null);  // Invalid
      expect(formatCasNumber('127195')).toBe('127-19-5');
    });

    it('should pass through already formatted numbers', () => {
      expect(formatCasNumber('7732-18-5')).toBe('7732-18-5');
    });

    it('should return null for invalid input', () => {
      expect(formatCasNumber('invalid')).toBe(null);
      expect(formatCasNumber('')).toBe(null);
    });
  });

  describe('parseCasNumber', () => {
    it('should parse CAS number components', () => {
      const parsed = parseCasNumber('7732-18-5');
      expect(parsed).toEqual({
        firstPart: '7732',
        secondPart: '18',
        checkDigit: '5',
      });
    });

    it('should return null for invalid format', () => {
      expect(parseCasNumber('invalid')).toBe(null);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test cas-validator.test.ts
```

Expected: FAIL with "Cannot find module './cas-validator.js'"

**Step 3: Create the validator**

```typescript
// packages/database/src/utils/cas-validator.ts

export interface CasParts {
  firstPart: string;   // 2-7 digits
  secondPart: string;  // 2 digits
  checkDigit: string;  // 1 digit
}

/**
 * Validate a CAS Registry Number.
 *
 * CAS numbers have the format: XXXX-XX-X
 * - First part: 2-7 digits
 * - Second part: 2 digits
 * - Third part: 1 check digit
 *
 * The check digit is calculated as:
 * Sum of (each digit × its position from right, starting at 1) mod 10
 *
 * @param cas CAS number to validate (e.g., "7732-18-5")
 * @returns true if valid, false otherwise
 */
export function isValidCasNumber(cas: string): boolean {
  if (!cas || typeof cas !== 'string') {
    return false;
  }

  // Format: XXXXXXX-XX-X (2-7 digits, hyphen, 2 digits, hyphen, 1 digit)
  const match = cas.match(/^(\d{2,7})-(\d{2})-(\d)$/);
  if (!match) {
    return false;
  }

  const [, firstPart, secondPart, checkDigitStr] = match;

  // Concatenate first two parts and calculate checksum
  const digits = (firstPart + secondPart).split('').reverse();
  const checkDigit = parseInt(checkDigitStr, 10);

  // Calculate: sum of (digit × position) where position starts at 1
  const sum = digits.reduce((acc, digit, index) => {
    return acc + parseInt(digit, 10) * (index + 1);
  }, 0);

  return sum % 10 === checkDigit;
}

/**
 * Parse a CAS number into its components.
 *
 * @param cas CAS number to parse
 * @returns Parsed components or null if invalid format
 */
export function parseCasNumber(cas: string): CasParts | null {
  const match = cas?.match(/^(\d{2,7})-(\d{2})-(\d)$/);
  if (!match) {
    return null;
  }

  return {
    firstPart: match[1],
    secondPart: match[2],
    checkDigit: match[3],
  };
}

/**
 * Format a CAS number string into standard format.
 * Handles both already-formatted and unformatted inputs.
 *
 * @param input Raw CAS number (e.g., "7732185" or "7732-18-5")
 * @returns Formatted CAS number or null if invalid
 */
export function formatCasNumber(input: string): string | null {
  if (!input) {
    return null;
  }

  // Already formatted?
  if (isValidCasNumber(input)) {
    return input;
  }

  // Remove any non-digits
  const digitsOnly = input.replace(/\D/g, '');

  // Need at least 5 digits (2+2+1)
  if (digitsOnly.length < 5 || digitsOnly.length > 10) {
    return null;
  }

  // Try to format: last digit is check, previous 2 are second part, rest is first part
  const checkDigit = digitsOnly.slice(-1);
  const secondPart = digitsOnly.slice(-3, -1);
  const firstPart = digitsOnly.slice(0, -3);

  const formatted = `${firstPart}-${secondPart}-${checkDigit}`;

  // Validate the result
  return isValidCasNumber(formatted) ? formatted : null;
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test cas-validator.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/utils/cas-validator.ts packages/database/src/utils/cas-validator.test.ts
git commit -m "feat(database): add CAS number validation utility with checksum verification"
```

---

## Task 3: Create Substance Entity

**Files:**
- Create: `packages/database/src/entities/Substance.ts`
- Modify: `packages/database/src/entities/index.ts`
- Test: `packages/database/src/entities/Substance.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/entities/Substance.test.ts
import { MikroORM } from '@mikro-orm/core';
import { Substance } from './Substance.js';
import { createTestOrm } from '../test-utils/create-test-orm.js';

describe('Substance', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await createTestOrm([Substance]);
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(async () => {
    await orm.em.nativeDelete(Substance, {});
  });

  it('should create a substance record', async () => {
    const em = orm.em.fork();

    const substance = em.create(Substance, {
      casNumber: '127-19-5',
      ecNumber: '204-826-4',
      primaryName: 'N,N-Dimethylacetamide',
      molecularFormula: 'C4H9NO',
      molecularWeight: '87.1204',
      isSvhc: true,
      requiresAuthorization: true,
      isRestricted: false,
      echaUrl: 'https://echa.europa.eu/substance-information/-/substanceinfo/100.004.389',
      sourceVersion: 'SVHC-2024-01',
      isActive: true,
    });

    await em.persistAndFlush(substance);

    const found = await em.findOne(Substance, { casNumber: '127-19-5' });
    expect(found).toBeDefined();
    expect(found?.primaryName).toBe('N,N-Dimethylacetamide');
    expect(found?.isSvhc).toBe(true);
    expect(found?.requiresAuthorization).toBe(true);
  });

  it('should enforce unique CAS number constraint', async () => {
    const em = orm.em.fork();

    const s1 = em.create(Substance, {
      casNumber: '7732-18-5',
      primaryName: 'Water',
      isActive: true,
    });
    await em.persistAndFlush(s1);

    const s2 = em.create(Substance, {
      casNumber: '7732-18-5',
      primaryName: 'H2O',
      isActive: true,
    });

    await expect(em.persistAndFlush(s2)).rejects.toThrow();
  });

  it('should store regulatory dates', async () => {
    const em = orm.em.fork();

    const sunsetDate = new Date('2025-02-28');
    const latestApplicationDate = new Date('2024-08-28');

    const substance = em.create(Substance, {
      casNumber: '127-19-5',
      primaryName: 'DMAC',
      requiresAuthorization: true,
      sunsetDate,
      latestApplicationDate,
      isActive: true,
    });

    await em.persistAndFlush(substance);

    const found = await em.findOne(Substance, { casNumber: '127-19-5' });
    expect(found?.sunsetDate).toEqual(sunsetDate);
    expect(found?.latestApplicationDate).toEqual(latestApplicationDate);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test Substance.test.ts
```

Expected: FAIL with "Cannot find module './Substance.js'"

**Step 3: Create the entity**

```typescript
// packages/database/src/entities/Substance.ts
import { Entity, Property, Unique, Index, BeforeCreate, BeforeUpdate, Collection, OneToMany } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { isValidCasNumber } from '../utils/cas-validator.js';

@Entity({ tableName: 'substance', schema: 'public' })
export class Substance extends BaseEntity {
  @Property({ length: 20 })
  @Unique()
  @Index()
  casNumber!: string;  // "127-19-5" (validated with checksum)

  @Property({ length: 20, nullable: true, name: 'ec_number' })
  @Index()
  ecNumber?: string;  // "204-826-4" (EU EC/EINECS number)

  @Property({ type: 'text', name: 'primary_name' })
  @Index()
  primaryName!: string;  // IUPAC or most common name

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Property({ type: 'decimal', precision: 12, scale: 4, nullable: true, name: 'molecular_weight' })
  molecularWeight?: string;  // "87.1204"

  @Property({ length: 500, nullable: true, name: 'molecular_formula' })
  molecularFormula?: string;  // "C4H9NO"

  // Regulatory status from ECHA
  @Property({ type: 'boolean', default: false, name: 'is_svhc' })
  isSvhc: boolean = false;  // SVHC Candidate List

  @Property({ type: 'boolean', default: false, name: 'requires_authorization' })
  requiresAuthorization: boolean = false;  // Annex XIV

  @Property({ type: 'boolean', default: false, name: 'is_restricted' })
  isRestricted: boolean = false;  // Annex XVII

  @Property({ type: 'text', nullable: true, name: 'restriction_conditions' })
  restrictionConditions?: string;  // "Max 0.1% in consumer products"

  @Property({ type: 'date', nullable: true, name: 'sunset_date' })
  sunsetDate?: Date;  // Authorization deadline

  @Property({ type: 'date', nullable: true, name: 'latest_application_date' })
  latestApplicationDate?: Date;  // Last date to apply for authorization

  // Source tracking
  @Property({ type: 'text', nullable: true, name: 'echa_url' })
  echaUrl?: string;  // Link to ECHA substance page

  @Property({ nullable: true, name: 'source_version' })
  sourceVersion?: string;  // "SVHC-2024-01"

  @Property({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean = true;

  // Validation hook
  @BeforeCreate()
  @BeforeUpdate()
  validateCasNumber() {
    if (this.casNumber && !isValidCasNumber(this.casNumber)) {
      throw new Error(`Invalid CAS number: ${this.casNumber}`);
    }
  }
}
```

**Step 4: Export from index**

```typescript
// packages/database/src/entities/index.ts
// Add to existing exports:
export { Substance } from './Substance.js';
```

**Step 5: Run test to verify it passes**

```bash
cd packages/database && pnpm test Substance.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add packages/database/src/entities/Substance.ts packages/database/src/entities/Substance.test.ts packages/database/src/entities/index.ts
git commit -m "feat(database): add Substance entity with CAS validation and regulatory fields"
```

---

## Task 4: Create SubstanceAlias Entity

**Files:**
- Create: `packages/database/src/entities/SubstanceAlias.ts`
- Modify: `packages/database/src/entities/index.ts`
- Test: `packages/database/src/entities/SubstanceAlias.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/entities/SubstanceAlias.test.ts
import { MikroORM } from '@mikro-orm/core';
import { Substance } from './Substance.js';
import { SubstanceAlias } from './SubstanceAlias.js';
import { AliasType } from './enums/index.js';
import { createTestOrm } from '../test-utils/create-test-orm.js';

describe('SubstanceAlias', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await createTestOrm([Substance, SubstanceAlias]);
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(async () => {
    await orm.em.nativeDelete(SubstanceAlias, {});
    await orm.em.nativeDelete(Substance, {});
  });

  it('should create an alias for a substance', async () => {
    const em = orm.em.fork();

    const substance = em.create(Substance, {
      casNumber: '127-19-5',
      primaryName: 'N,N-Dimethylacetamide',
      isActive: true,
    });
    await em.persistAndFlush(substance);

    const alias = em.create(SubstanceAlias, {
      substanceId: substance.id,
      name: 'DMAC',
      type: AliasType.COMMON,
      language: 'en',
    });
    await em.persistAndFlush(alias);

    const found = await em.findOne(SubstanceAlias, { name: 'DMAC' });
    expect(found).toBeDefined();
    expect(found?.type).toBe(AliasType.COMMON);
    expect(found?.substanceId).toBe(substance.id);
  });

  it('should allow multiple aliases per substance', async () => {
    const em = orm.em.fork();

    const substance = em.create(Substance, {
      casNumber: '64-17-5',
      primaryName: 'Ethanol',
      isActive: true,
    });
    await em.persistAndFlush(substance);

    const alias1 = em.create(SubstanceAlias, {
      substanceId: substance.id,
      name: 'Ethyl alcohol',
      type: AliasType.SYNONYM,
    });
    const alias2 = em.create(SubstanceAlias, {
      substanceId: substance.id,
      name: 'Alcohol',
      type: AliasType.COMMON,
    });

    await em.persistAndFlush([alias1, alias2]);

    const aliases = await em.find(SubstanceAlias, { substanceId: substance.id });
    expect(aliases).toHaveLength(2);
  });

  it('should enforce unique substance+name constraint', async () => {
    const em = orm.em.fork();

    const substance = em.create(Substance, {
      casNumber: '7732-18-5',
      primaryName: 'Water',
      isActive: true,
    });
    await em.persistAndFlush(substance);

    const alias1 = em.create(SubstanceAlias, {
      substanceId: substance.id,
      name: 'H2O',
      type: AliasType.SYNONYM,
    });
    await em.persistAndFlush(alias1);

    const alias2 = em.create(SubstanceAlias, {
      substanceId: substance.id,
      name: 'H2O',
      type: AliasType.COMMON,
    });

    await expect(em.persistAndFlush(alias2)).rejects.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test SubstanceAlias.test.ts
```

Expected: FAIL with "Cannot find module './SubstanceAlias.js'"

**Step 3: Create the entity**

```typescript
// packages/database/src/entities/SubstanceAlias.ts
import { Entity, Property, Unique, Index, Enum } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { AliasType } from './enums/index.js';

@Entity({ tableName: 'substance_alias', schema: 'public' })
@Unique({ properties: ['substanceId', 'name'] })
export class SubstanceAlias extends BaseEntity {
  // Soft link to public.substance (cross-schema safe)
  @Property({ name: 'substance_id' })
  @Index()
  substanceId!: string;

  @Property({ type: 'text' })
  @Index()
  name!: string;  // Alternative name

  @Enum({ items: () => AliasType })
  type!: AliasType;  // IUPAC, COMMON, TRADE, SYNONYM, INDEX_NAME

  @Property({ length: 10, nullable: true })
  language?: string;  // "en", "de", "fr"
}
```

**Step 4: Export from index**

```typescript
// packages/database/src/entities/index.ts
// Add to existing exports:
export { SubstanceAlias } from './SubstanceAlias.js';
```

**Step 5: Run test to verify it passes**

```bash
cd packages/database && pnpm test SubstanceAlias.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add packages/database/src/entities/SubstanceAlias.ts packages/database/src/entities/SubstanceAlias.test.ts packages/database/src/entities/index.ts
git commit -m "feat(database): add SubstanceAlias entity for chemical name synonyms"
```

---

## Task 5: Create Substance Migrations

**Files:**
- Create: `packages/database/src/migrations/Migration20260126_Substance.ts`

**Step 1: Create the migration**

```typescript
// packages/database/src/migrations/Migration20260126_Substance.ts
import { Migration } from '@mikro-orm/migrations';

export class Migration20260126_Substance extends Migration {
  async up(): Promise<void> {
    // Substance table
    this.addSql(`
      CREATE TABLE IF NOT EXISTS public.substance (
        id VARCHAR(30) PRIMARY KEY,
        cas_number VARCHAR(20) NOT NULL,
        ec_number VARCHAR(20),
        primary_name TEXT NOT NULL,
        description TEXT,
        molecular_weight DECIMAL(12, 4),
        molecular_formula VARCHAR(500),
        is_svhc BOOLEAN DEFAULT FALSE,
        requires_authorization BOOLEAN DEFAULT FALSE,
        is_restricted BOOLEAN DEFAULT FALSE,
        restriction_conditions TEXT,
        sunset_date DATE,
        latest_application_date DATE,
        echa_url TEXT,
        source_version VARCHAR(50),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_substance_cas_number UNIQUE (cas_number)
      );
    `);

    this.addSql(`CREATE INDEX IF NOT EXISTS idx_substance_cas ON public.substance(cas_number);`);
    this.addSql(`CREATE INDEX IF NOT EXISTS idx_substance_ec ON public.substance(ec_number);`);
    this.addSql(`CREATE INDEX IF NOT EXISTS idx_substance_name ON public.substance(primary_name);`);
    this.addSql(`CREATE INDEX IF NOT EXISTS idx_substance_svhc ON public.substance(is_svhc) WHERE is_svhc = TRUE;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS idx_substance_auth ON public.substance(requires_authorization) WHERE requires_authorization = TRUE;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS idx_substance_restricted ON public.substance(is_restricted) WHERE is_restricted = TRUE;`);

    // SubstanceAlias table
    this.addSql(`
      CREATE TABLE IF NOT EXISTS public.substance_alias (
        id VARCHAR(30) PRIMARY KEY,
        substance_id VARCHAR(30) NOT NULL,
        name TEXT NOT NULL,
        type VARCHAR(20) NOT NULL,
        language VARCHAR(10),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_substance_alias_name UNIQUE (substance_id, name)
      );
    `);

    this.addSql(`CREATE INDEX IF NOT EXISTS idx_substance_alias_substance ON public.substance_alias(substance_id);`);
    this.addSql(`CREATE INDEX IF NOT EXISTS idx_substance_alias_name ON public.substance_alias(name);`);
  }

  async down(): Promise<void> {
    this.addSql('DROP TABLE IF EXISTS public.substance_alias;');
    this.addSql('DROP TABLE IF EXISTS public.substance;');
  }
}
```

**Step 2: Run migration**

```bash
cd packages/database && pnpm mikro-orm migration:up
```

Expected: Migration applied successfully

**Step 3: Verify tables exist**

```bash
cd packages/database && pnpm mikro-orm schema:check
```

Expected: No schema differences

**Step 4: Commit**

```bash
git add packages/database/src/migrations/Migration20260126_Substance.ts
git commit -m "feat(database): add migrations for substance and substance_alias tables"
```

---

## Task 6: Create ECHA Data Bundle

**Files:**
- Create: `packages/database/data/echa-substances.json`

**Step 1: Create the data file**

This is a curated subset of ECHA regulated substances. The full lists can be imported later from ECHA downloads.

```json
// packages/database/data/echa-substances.json
{
  "version": "ECHA-2024-01",
  "generatedAt": "2026-01-26T00:00:00.000Z",
  "sources": {
    "SVHC": "https://echa.europa.eu/candidate-list-table",
    "Authorization": "https://echa.europa.eu/authorisation-list",
    "Restriction": "https://echa.europa.eu/substances-restricted-under-reach"
  },
  "totalSubstances": 100,
  "substances": [
    // SVHC Candidate List - Substances of Very High Concern
    {
      "casNumber": "127-19-5",
      "ecNumber": "204-826-4",
      "primaryName": "N,N-Dimethylacetamide",
      "molecularFormula": "C4H9NO",
      "molecularWeight": "87.1204",
      "isSvhc": true,
      "requiresAuthorization": true,
      "isRestricted": false,
      "sunsetDate": "2025-02-28",
      "latestApplicationDate": "2024-08-28",
      "echaUrl": "https://echa.europa.eu/substance-information/-/substanceinfo/100.004.389",
      "aliases": [
        { "name": "DMAC", "type": "COMMON" },
        { "name": "Dimethylacetamide", "type": "SYNONYM" },
        { "name": "Acetyldimethylamine", "type": "SYNONYM" }
      ]
    },
    {
      "casNumber": "872-50-4",
      "ecNumber": "212-828-1",
      "primaryName": "N-Methyl-2-pyrrolidone",
      "molecularFormula": "C5H9NO",
      "molecularWeight": "99.13",
      "isSvhc": true,
      "requiresAuthorization": false,
      "isRestricted": true,
      "restrictionConditions": "Shall not be placed on the market as a substance or in mixtures in a concentration ≥ 0.3%",
      "echaUrl": "https://echa.europa.eu/substance-information/-/substanceinfo/100.011.662",
      "aliases": [
        { "name": "NMP", "type": "COMMON" },
        { "name": "1-Methyl-2-pyrrolidinone", "type": "SYNONYM" }
      ]
    },
    {
      "casNumber": "110-54-3",
      "ecNumber": "203-777-6",
      "primaryName": "n-Hexane",
      "molecularFormula": "C6H14",
      "molecularWeight": "86.18",
      "isSvhc": true,
      "requiresAuthorization": false,
      "isRestricted": false,
      "echaUrl": "https://echa.europa.eu/substance-information/-/substanceinfo/100.003.435",
      "aliases": [
        { "name": "Hexane", "type": "COMMON" }
      ]
    },
    {
      "casNumber": "117-81-7",
      "ecNumber": "204-211-0",
      "primaryName": "Bis(2-ethylhexyl) phthalate",
      "molecularFormula": "C24H38O4",
      "molecularWeight": "390.56",
      "isSvhc": true,
      "requiresAuthorization": true,
      "isRestricted": true,
      "restrictionConditions": "Shall not be used in toys and childcare articles in concentration > 0.1%",
      "sunsetDate": "2015-02-21",
      "echaUrl": "https://echa.europa.eu/substance-information/-/substanceinfo/100.003.829",
      "aliases": [
        { "name": "DEHP", "type": "COMMON" },
        { "name": "Di(2-ethylhexyl) phthalate", "type": "SYNONYM" },
        { "name": "Dioctyl phthalate", "type": "SYNONYM" }
      ]
    },
    {
      "casNumber": "84-74-2",
      "ecNumber": "201-557-4",
      "primaryName": "Dibutyl phthalate",
      "molecularFormula": "C16H22O4",
      "molecularWeight": "278.34",
      "isSvhc": true,
      "requiresAuthorization": true,
      "isRestricted": true,
      "restrictionConditions": "Shall not be used in toys and childcare articles in concentration > 0.1%",
      "sunsetDate": "2015-02-21",
      "echaUrl": "https://echa.europa.eu/substance-information/-/substanceinfo/100.001.416",
      "aliases": [
        { "name": "DBP", "type": "COMMON" }
      ]
    },
    {
      "casNumber": "85-68-7",
      "ecNumber": "201-622-7",
      "primaryName": "Benzyl butyl phthalate",
      "molecularFormula": "C19H20O4",
      "molecularWeight": "312.36",
      "isSvhc": true,
      "requiresAuthorization": true,
      "isRestricted": true,
      "restrictionConditions": "Shall not be used in toys and childcare articles in concentration > 0.1%",
      "sunsetDate": "2015-02-21",
      "echaUrl": "https://echa.europa.eu/substance-information/-/substanceinfo/100.001.475",
      "aliases": [
        { "name": "BBP", "type": "COMMON" }
      ]
    },

    // RoHS Heavy Metals
    {
      "casNumber": "7439-92-1",
      "ecNumber": "231-100-4",
      "primaryName": "Lead",
      "molecularFormula": "Pb",
      "molecularWeight": "207.2",
      "isSvhc": true,
      "requiresAuthorization": false,
      "isRestricted": true,
      "restrictionConditions": "RoHS: Max 0.1% (1000ppm) by weight in homogeneous materials",
      "echaUrl": "https://echa.europa.eu/substance-information/-/substanceinfo/100.028.273",
      "aliases": [
        { "name": "Plumbum", "type": "SYNONYM" }
      ]
    },
    {
      "casNumber": "7440-43-9",
      "ecNumber": "231-152-8",
      "primaryName": "Cadmium",
      "molecularFormula": "Cd",
      "molecularWeight": "112.41",
      "isSvhc": true,
      "requiresAuthorization": false,
      "isRestricted": true,
      "restrictionConditions": "RoHS: Max 0.01% (100ppm) by weight in homogeneous materials",
      "echaUrl": "https://echa.europa.eu/substance-information/-/substanceinfo/100.028.320",
      "aliases": []
    },
    {
      "casNumber": "7439-97-6",
      "ecNumber": "231-106-7",
      "primaryName": "Mercury",
      "molecularFormula": "Hg",
      "molecularWeight": "200.59",
      "isSvhc": false,
      "requiresAuthorization": false,
      "isRestricted": true,
      "restrictionConditions": "RoHS: Max 0.1% (1000ppm) by weight in homogeneous materials",
      "echaUrl": "https://echa.europa.eu/substance-information/-/substanceinfo/100.028.278",
      "aliases": [
        { "name": "Hydrargyrum", "type": "SYNONYM" },
        { "name": "Quicksilver", "type": "COMMON" }
      ]
    },
    {
      "casNumber": "18540-29-9",
      "ecNumber": "242-367-4",
      "primaryName": "Chromium (VI)",
      "isSvhc": true,
      "requiresAuthorization": false,
      "isRestricted": true,
      "restrictionConditions": "RoHS: Max 0.1% (1000ppm) by weight in homogeneous materials",
      "echaUrl": "https://echa.europa.eu/substance-information/-/substanceinfo/100.038.503",
      "aliases": [
        { "name": "Hexavalent chromium", "type": "COMMON" },
        { "name": "Cr(VI)", "type": "COMMON" }
      ]
    },

    // Common Solvents (SVHC)
    {
      "casNumber": "50-00-0",
      "ecNumber": "200-001-8",
      "primaryName": "Formaldehyde",
      "molecularFormula": "CH2O",
      "molecularWeight": "30.03",
      "isSvhc": true,
      "requiresAuthorization": false,
      "isRestricted": true,
      "restrictionConditions": "Max 0.1% in mixtures",
      "echaUrl": "https://echa.europa.eu/substance-information/-/substanceinfo/100.000.002",
      "aliases": [
        { "name": "Methanal", "type": "IUPAC" },
        { "name": "Formalin", "type": "COMMON" }
      ]
    },
    {
      "casNumber": "79-06-1",
      "ecNumber": "201-173-7",
      "primaryName": "Acrylamide",
      "molecularFormula": "C3H5NO",
      "molecularWeight": "71.08",
      "isSvhc": true,
      "requiresAuthorization": false,
      "isRestricted": true,
      "restrictionConditions": "Shall not be placed on the market or used as a substance or in mixtures in concentration ≥ 0.1%",
      "echaUrl": "https://echa.europa.eu/substance-information/-/substanceinfo/100.001.067",
      "aliases": [
        { "name": "2-Propenamide", "type": "IUPAC" }
      ]
    },
    {
      "casNumber": "111-76-2",
      "ecNumber": "203-905-0",
      "primaryName": "2-Butoxyethanol",
      "molecularFormula": "C6H14O2",
      "molecularWeight": "118.18",
      "isSvhc": false,
      "requiresAuthorization": false,
      "isRestricted": false,
      "echaUrl": "https://echa.europa.eu/substance-information/-/substanceinfo/100.003.551",
      "aliases": [
        { "name": "Ethylene glycol monobutyl ether", "type": "SYNONYM" },
        { "name": "Butyl cellosolve", "type": "TRADE" }
      ]
    },

    // Flame Retardants
    {
      "casNumber": "1163-19-5",
      "ecNumber": "214-604-9",
      "primaryName": "Decabromodiphenyl ether",
      "molecularFormula": "C12Br10O",
      "molecularWeight": "959.17",
      "isSvhc": true,
      "requiresAuthorization": false,
      "isRestricted": true,
      "restrictionConditions": "RoHS: Max 0.1% (1000ppm) by weight in homogeneous materials",
      "echaUrl": "https://echa.europa.eu/substance-information/-/substanceinfo/100.013.277",
      "aliases": [
        { "name": "DecaBDE", "type": "COMMON" },
        { "name": "BDE-209", "type": "COMMON" }
      ]
    },
    {
      "casNumber": "79-94-7",
      "ecNumber": "201-236-9",
      "primaryName": "Tetrabromobisphenol A",
      "molecularFormula": "C15H12Br4O2",
      "molecularWeight": "543.87",
      "isSvhc": true,
      "requiresAuthorization": false,
      "isRestricted": false,
      "echaUrl": "https://echa.europa.eu/substance-information/-/substanceinfo/100.001.125",
      "aliases": [
        { "name": "TBBPA", "type": "COMMON" }
      ]
    },

    // Bisphenols
    {
      "casNumber": "80-05-7",
      "ecNumber": "201-245-8",
      "primaryName": "Bisphenol A",
      "molecularFormula": "C15H16O2",
      "molecularWeight": "228.29",
      "isSvhc": true,
      "requiresAuthorization": false,
      "isRestricted": true,
      "restrictionConditions": "Prohibited in thermal paper from 2020; restricted in toys",
      "echaUrl": "https://echa.europa.eu/substance-information/-/substanceinfo/100.001.133",
      "aliases": [
        { "name": "BPA", "type": "COMMON" },
        { "name": "4,4'-Isopropylidenediphenol", "type": "IUPAC" }
      ]
    },

    // PFAS (Per- and polyfluoroalkyl substances)
    {
      "casNumber": "335-67-1",
      "ecNumber": "206-397-9",
      "primaryName": "Perfluorooctanoic acid",
      "molecularFormula": "C8HF15O2",
      "molecularWeight": "414.07",
      "isSvhc": true,
      "requiresAuthorization": false,
      "isRestricted": true,
      "restrictionConditions": "Max 25 ppb in mixtures, 1000 ppb in articles",
      "echaUrl": "https://echa.europa.eu/substance-information/-/substanceinfo/100.005.817",
      "aliases": [
        { "name": "PFOA", "type": "COMMON" },
        { "name": "C8", "type": "COMMON" }
      ]
    },
    {
      "casNumber": "1763-23-1",
      "ecNumber": "217-179-8",
      "primaryName": "Perfluorooctane sulfonic acid",
      "molecularFormula": "C8HF17O3S",
      "molecularWeight": "500.13",
      "isSvhc": true,
      "requiresAuthorization": false,
      "isRestricted": true,
      "restrictionConditions": "Stockholm Convention POP, banned with limited exemptions",
      "echaUrl": "https://echa.europa.eu/substance-information/-/substanceinfo/100.015.618",
      "aliases": [
        { "name": "PFOS", "type": "COMMON" }
      ]
    },

    // Nickel (contact allergy)
    {
      "casNumber": "7440-02-0",
      "ecNumber": "231-111-4",
      "primaryName": "Nickel",
      "molecularFormula": "Ni",
      "molecularWeight": "58.69",
      "isSvhc": false,
      "requiresAuthorization": false,
      "isRestricted": true,
      "restrictionConditions": "Max 0.5 µg/cm²/week nickel release in articles with prolonged skin contact",
      "echaUrl": "https://echa.europa.eu/substance-information/-/substanceinfo/100.028.283",
      "aliases": []
    },

    // Cobalt compounds
    {
      "casNumber": "10124-43-3",
      "ecNumber": "233-334-2",
      "primaryName": "Cobalt sulphate",
      "molecularFormula": "CoSO4",
      "molecularWeight": "154.99",
      "isSvhc": true,
      "requiresAuthorization": true,
      "isRestricted": false,
      "sunsetDate": "2021-01-21",
      "echaUrl": "https://echa.europa.eu/substance-information/-/substanceinfo/100.030.254",
      "aliases": [
        { "name": "Cobalt(II) sulfate", "type": "IUPAC" }
      ]
    },

    // Arsenic
    {
      "casNumber": "7440-38-2",
      "ecNumber": "231-148-6",
      "primaryName": "Arsenic",
      "molecularFormula": "As",
      "molecularWeight": "74.92",
      "isSvhc": false,
      "requiresAuthorization": false,
      "isRestricted": true,
      "restrictionConditions": "Prohibited in wood preservatives and anti-fouling paints",
      "echaUrl": "https://echa.europa.eu/substance-information/-/substanceinfo/100.028.316",
      "aliases": []
    }
  ]
}
```

**Step 2: Commit**

```bash
git add packages/database/data/echa-substances.json
git commit -m "feat(database): add curated ECHA substance data bundle (~25 regulated substances)"
```

---

## Task 7: Create SubstancesSeeder Service

**Files:**
- Create: `packages/database/src/seeders/substances.seeder.ts`
- Test: `packages/database/src/seeders/substances.seeder.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/seeders/substances.seeder.test.ts
import { MikroORM, EntityManager } from '@mikro-orm/core';
import { SubstancesSeeder } from './substances.seeder.js';
import { Substance } from '../entities/Substance.js';
import { SubstanceAlias } from '../entities/SubstanceAlias.js';
import { SeedVersion } from '../entities/SeedVersion.js';
import { createTestOrm } from '../test-utils/create-test-orm.js';

describe('SubstancesSeeder', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let seeder: SubstancesSeeder;

  beforeAll(async () => {
    orm = await createTestOrm([Substance, SubstanceAlias, SeedVersion]);
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(async () => {
    em = orm.em.fork();
    seeder = new SubstancesSeeder(em);
    await em.nativeDelete(SubstanceAlias, {});
    await em.nativeDelete(Substance, {});
    await em.nativeDelete(SeedVersion, {});
  });

  it('should seed substances from data bundle', async () => {
    const result = await seeder.seed();

    expect(result.seeded).toBe(true);
    expect(result.substanceCount).toBeGreaterThan(10);
    expect(result.aliasCount).toBeGreaterThan(10);

    // Verify substances exist
    const substances = await em.find(Substance, {});
    expect(substances.length).toBe(result.substanceCount);

    // Verify SVHC substance
    const dmac = await em.findOne(Substance, { casNumber: '127-19-5' });
    expect(dmac).toBeDefined();
    expect(dmac?.isSvhc).toBe(true);
    expect(dmac?.primaryName).toBe('N,N-Dimethylacetamide');
  });

  it('should seed aliases correctly', async () => {
    await seeder.seed();

    const dmac = await em.findOne(Substance, { casNumber: '127-19-5' });
    const aliases = await em.find(SubstanceAlias, { substanceId: dmac!.id });

    expect(aliases.length).toBeGreaterThan(0);
    expect(aliases.map(a => a.name)).toContain('DMAC');
  });

  it('should skip seeding if version matches', async () => {
    await seeder.seed();
    const initialCount = await em.count(Substance);

    const result = await seeder.seed();

    expect(result.seeded).toBe(false);
    expect(result.skipped).toBe(true);

    const finalCount = await em.count(Substance);
    expect(finalCount).toBe(initialCount);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test substances.seeder.test.ts
```

Expected: FAIL with "Cannot find module './substances.seeder.js'"

**Step 3: Create the seeder**

```typescript
// packages/database/src/seeders/substances.seeder.ts
import { EntityManager } from '@mikro-orm/core';
import { Substance } from '../entities/Substance.js';
import { SubstanceAlias } from '../entities/SubstanceAlias.js';
import { AliasType } from '../entities/enums/index.js';
import { SeedService } from '../services/seed.service.js';
import { BulkImportService } from '../services/bulk-import.service.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface SubstanceSeederResult {
  seeded: boolean;
  skipped: boolean;
  substanceCount: number;
  aliasCount: number;
  version: string;
  message: string;
}

interface AliasData {
  name: string;
  type: string;
}

interface SubstanceData {
  casNumber: string;
  ecNumber?: string;
  primaryName: string;
  description?: string;
  molecularWeight?: string;
  molecularFormula?: string;
  isSvhc?: boolean;
  requiresAuthorization?: boolean;
  isRestricted?: boolean;
  restrictionConditions?: string;
  sunsetDate?: string;
  latestApplicationDate?: string;
  echaUrl?: string;
  aliases?: AliasData[];
}

interface SubstanceBundle {
  version: string;
  generatedAt: string;
  totalSubstances: number;
  substances: SubstanceData[];
}

export class SubstancesSeeder {
  private readonly seedService: SeedService;
  private readonly bulkImportService: BulkImportService;
  private readonly SEED_NAME = 'echa-substances';

  constructor(private readonly em: EntityManager) {
    this.seedService = new SeedService(em);
    this.bulkImportService = new BulkImportService(em);
  }

  async seed(): Promise<SubstanceSeederResult> {
    // Load data bundle
    const bundlePath = join(__dirname, '..', 'data', 'echa-substances.json');
    const raw = readFileSync(bundlePath, 'utf-8');
    const bundle: SubstanceBundle = JSON.parse(raw);
    const version = bundle.version;

    // Check if seeding needed
    const needsSeeding = await this.seedService.needsSeeding(this.SEED_NAME, version);

    if (!needsSeeding) {
      const existing = await this.seedService.getSeededVersion(this.SEED_NAME);
      return {
        seeded: false,
        skipped: true,
        substanceCount: existing?.recordCount || 0,
        aliasCount: 0,
        version: existing?.version || version,
        message: `Substances already seeded (${existing?.version}), skipping.`,
      };
    }

    // Seed substances
    const substanceRecords = bundle.substances.map(s => this.toSubstanceEntity(s, version));
    const substanceCount = await this.bulkImportService.upsertSmall(
      Substance,
      substanceRecords,
      ['casNumber']
    );

    // Build CAS -> ID map for aliases
    const substances = await this.em.find(Substance, {});
    const casToId = new Map(substances.map(s => [s.casNumber, s.id]));

    // Seed aliases
    const aliasRecords: Partial<SubstanceAlias>[] = [];
    for (const s of bundle.substances) {
      const substanceId = casToId.get(s.casNumber);
      if (!substanceId || !s.aliases) continue;

      for (const alias of s.aliases) {
        aliasRecords.push({
          substanceId,
          name: alias.name,
          type: alias.type as AliasType,
        });
      }
    }

    let aliasCount = 0;
    if (aliasRecords.length > 0) {
      aliasCount = await this.bulkImportService.upsertSmall(
        SubstanceAlias,
        aliasRecords,
        ['substanceId', 'name']
      );
    }

    // Record seeding
    await this.seedService.recordSeeding(this.SEED_NAME, version, substanceCount);

    return {
      seeded: true,
      skipped: false,
      substanceCount,
      aliasCount,
      version,
      message: `Seeded ${substanceCount} substances with ${aliasCount} aliases (${version}).`,
    };
  }

  private toSubstanceEntity(data: SubstanceData, version: string): Partial<Substance> {
    return {
      casNumber: data.casNumber,
      ecNumber: data.ecNumber,
      primaryName: data.primaryName,
      description: data.description,
      molecularWeight: data.molecularWeight,
      molecularFormula: data.molecularFormula,
      isSvhc: data.isSvhc ?? false,
      requiresAuthorization: data.requiresAuthorization ?? false,
      isRestricted: data.isRestricted ?? false,
      restrictionConditions: data.restrictionConditions,
      sunsetDate: data.sunsetDate ? new Date(data.sunsetDate) : undefined,
      latestApplicationDate: data.latestApplicationDate ? new Date(data.latestApplicationDate) : undefined,
      echaUrl: data.echaUrl,
      sourceVersion: version,
      isActive: true,
    };
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test substances.seeder.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/seeders/substances.seeder.ts packages/database/src/seeders/substances.seeder.test.ts
git commit -m "feat(database): add SubstancesSeeder with alias support"
```

---

## Task 8: Create Substances API Routes

**Files:**
- Create: `apps/api/src/routes/taxonomy/substances.ts`
- Test: `apps/api/src/routes/taxonomy/substances.e2e.test.ts`

**Step 1: Write the failing e2e test (NO MOCKS - per RULES.md)**

```typescript
// apps/api/src/routes/taxonomy/substances.e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { MikroORM } from '@eurocomply/database';
import { Hono } from 'hono';
import { createSubstancesRouter, type SubstancesRepository, type SubstanceData, type SubstanceAliasData } from './substances.js';
import { Substance, SubstanceAlias, AliasType } from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';

interface ApiResponse<T> {
  data: T;
  meta?: { total: number };
}

describe('Substances API E2E', () => {
  let orm: MikroORM;
  let app: Hono;
  let testSubstanceId: string;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    orm = await setupTestDb();

    // Seed test substances (real database, no mocks)
    const em = orm.em.fork();

    const substance1 = em.create(Substance, {
      casNumber: '127-19-5',
      ecNumber: '204-826-4',
      primaryName: 'N,N-Dimethylacetamide',
      isSvhc: true,
      requiresAuthorization: true,
      isRestricted: false,
      isActive: true,
      sourceVersion: 'TEST',
    });
    em.persist(substance1);

    const substance2 = em.create(Substance, {
      casNumber: '7439-92-1',
      primaryName: 'Lead',
      isSvhc: true,
      requiresAuthorization: false,
      isRestricted: true,
      isActive: true,
      sourceVersion: 'TEST',
    });
    em.persist(substance2);

    const substance3 = em.create(Substance, {
      casNumber: '7732-18-5',
      primaryName: 'Water',
      isSvhc: false,
      requiresAuthorization: false,
      isRestricted: false,
      isActive: true,
      sourceVersion: 'TEST',
    });
    em.persist(substance3);

    await em.flush();
    testSubstanceId = substance1.id;

    // Add aliases for first substance
    const alias1 = em.create(SubstanceAlias, {
      substanceId: substance1.id,
      name: 'DMAC',
      type: AliasType.COMMON,
    });
    const alias2 = em.create(SubstanceAlias, {
      substanceId: substance1.id,
      name: 'Dimethylacetamide',
      type: AliasType.SYNONYM,
    });
    em.persist([alias1, alias2]);
    await em.flush();

    // Create repository implementation (real database queries)
    const repo: SubstancesRepository = {
      findAll: async (filter): Promise<SubstanceData[]> => {
        const qb = orm.em.fork().createQueryBuilder(Substance);
        if (filter?.svhc !== undefined) qb.andWhere({ isSvhc: filter.svhc });
        if (filter?.restricted !== undefined) qb.andWhere({ isRestricted: filter.restricted });
        if (filter?.authorization !== undefined) qb.andWhere({ requiresAuthorization: filter.authorization });
        if (filter?.search) qb.andWhere({ primaryName: { $ilike: `%${filter.search}%` } });
        if (filter?.active !== undefined) qb.andWhere({ isActive: filter.active });
        const results = await qb.getResultList();
        return results.map(s => ({
          id: s.id,
          casNumber: s.casNumber,
          ecNumber: s.ecNumber ?? undefined,
          primaryName: s.primaryName,
          isSvhc: s.isSvhc,
          requiresAuthorization: s.requiresAuthorization,
          isRestricted: s.isRestricted,
          isActive: s.isActive,
        }));
      },
      findByCasNumber: async (cas): Promise<SubstanceData | null> => {
        const s = await orm.em.fork().findOne(Substance, { casNumber: cas });
        if (!s) return null;
        return {
          id: s.id,
          casNumber: s.casNumber,
          ecNumber: s.ecNumber ?? undefined,
          primaryName: s.primaryName,
          isSvhc: s.isSvhc,
          requiresAuthorization: s.requiresAuthorization,
          isRestricted: s.isRestricted,
          isActive: s.isActive,
        };
      },
      findAliases: async (substanceId): Promise<SubstanceAliasData[]> => {
        const aliases = await orm.em.fork().find(SubstanceAlias, { substanceId });
        return aliases.map(a => ({
          id: a.id,
          substanceId: a.substanceId,
          name: a.name,
          type: a.type,
        }));
      },
      findRegulated: async (): Promise<SubstanceData[]> => {
        const results = await orm.em.fork().find(Substance, {
          $or: [{ isSvhc: true }, { isRestricted: true }, { requiresAuthorization: true }],
        });
        return results.map(s => ({
          id: s.id,
          casNumber: s.casNumber,
          ecNumber: s.ecNumber ?? undefined,
          primaryName: s.primaryName,
          isSvhc: s.isSvhc,
          requiresAuthorization: s.requiresAuthorization,
          isRestricted: s.isRestricted,
          isActive: s.isActive,
        }));
      },
    };

    app = new Hono();
    app.route('/substances', createSubstancesRouter(repo));
  });

  afterAll(async () => {
    if (orm) {
      try {
        await orm.em.fork().nativeDelete(SubstanceAlias, {});
        await orm.em.fork().nativeDelete(Substance, {});
      } catch {
        // Ignore cleanup errors
      }
      await teardownTestDb();
    }
  });

  describe('GET /substances', () => {
    it('should return all substances from database', async () => {
      if (!orm) return;

      const res = await app.request('/substances');
      expect(res.status).toBe(200);
      const body = await res.json() as ApiResponse<SubstanceData[]>;
      expect(body.data.length).toBe(3);
    });

    it('should filter by SVHC status', async () => {
      if (!orm) return;

      const res = await app.request('/substances?svhc=true');
      expect(res.status).toBe(200);
      const body = await res.json() as ApiResponse<SubstanceData[]>;
      expect(body.data.length).toBe(2);
      expect(body.data.every(s => s.isSvhc)).toBe(true);
    });

    it('should filter by restricted status', async () => {
      if (!orm) return;

      const res = await app.request('/substances?restricted=true');
      expect(res.status).toBe(200);
      const body = await res.json() as ApiResponse<SubstanceData[]>;
      expect(body.data.length).toBe(1);
      expect(body.data[0].casNumber).toBe('7439-92-1'); // Lead
    });

    it('should search by name (ILIKE)', async () => {
      if (!orm) return;

      const res = await app.request('/substances?search=dimethyl');
      expect(res.status).toBe(200);
      const body = await res.json() as ApiResponse<SubstanceData[]>;
      expect(body.data.length).toBe(1);
      expect(body.data[0].casNumber).toBe('127-19-5');
    });
  });

  describe('GET /substances/:casNumber', () => {
    it('should return a substance by CAS number', async () => {
      if (!orm) return;

      const res = await app.request('/substances/127-19-5');
      expect(res.status).toBe(200);
      const body = await res.json() as ApiResponse<SubstanceData>;
      expect(body.data.casNumber).toBe('127-19-5');
      expect(body.data.primaryName).toBe('N,N-Dimethylacetamide');
    });

    it('should return 404 for unknown CAS number', async () => {
      if (!orm) return;

      const res = await app.request('/substances/9999-99-9');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /substances/:casNumber/aliases', () => {
    it('should return aliases for a substance', async () => {
      if (!orm) return;

      const res = await app.request('/substances/127-19-5/aliases');
      expect(res.status).toBe(200);
      const body = await res.json() as ApiResponse<SubstanceAliasData[]>;
      expect(body.data.length).toBe(2);
      expect(body.data.map(a => a.name)).toContain('DMAC');
    });
  });

  describe('GET /substances/regulated', () => {
    it('should return all regulated substances', async () => {
      if (!orm) return;

      const res = await app.request('/substances/regulated');
      expect(res.status).toBe(200);
      const body = await res.json() as ApiResponse<SubstanceData[]>;
      expect(body.data.length).toBe(2); // DMAC and Lead (Water is not regulated)
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm test substances.test.ts
```

Expected: FAIL with "Cannot find module './substances.js'"

**Step 3: Create the router**

```typescript
// apps/api/src/routes/taxonomy/substances.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export interface SubstanceData {
  id: string;
  casNumber: string;
  ecNumber?: string;
  primaryName: string;
  description?: string;
  molecularWeight?: string;
  molecularFormula?: string;
  isSvhc: boolean;
  requiresAuthorization: boolean;
  isRestricted: boolean;
  restrictionConditions?: string;
  sunsetDate?: Date;
  latestApplicationDate?: Date;
  echaUrl?: string;
  isActive: boolean;
}

export interface SubstanceAliasData {
  id: string;
  substanceId: string;
  name: string;
  type: string;
  language?: string;
}

export interface SubstancesRepository {
  findAll(filter?: {
    svhc?: boolean;
    restricted?: boolean;
    authorization?: boolean;
    search?: string;
    active?: boolean;
  }): Promise<SubstanceData[]>;
  findByCasNumber(cas: string): Promise<SubstanceData | null>;
  findAliases(substanceId: string): Promise<SubstanceAliasData[]>;
  findRegulated(): Promise<SubstanceData[]>;
}

const querySchema = z.object({
  svhc: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  restricted: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  authorization: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  search: z.string().optional(),
  active: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

export function createSubstancesRouter(repo: SubstancesRepository): Hono {
  const router = new Hono();

  // GET /substances - List all with optional filters
  router.get('/', zValidator('query', querySchema), async (c) => {
    const query = c.req.valid('query');

    const filter: Parameters<typeof repo.findAll>[0] = {};
    if (query.svhc !== undefined) filter.svhc = query.svhc;
    if (query.restricted !== undefined) filter.restricted = query.restricted;
    if (query.authorization !== undefined) filter.authorization = query.authorization;
    if (query.search) filter.search = query.search;
    if (query.active !== undefined) filter.active = query.active;

    const substances = await repo.findAll(filter);

    return c.json({
      data: substances,
      meta: { total: substances.length },
    });
  });

  // GET /substances/regulated - Get all regulated substances (SVHC + Auth + Restricted)
  router.get('/regulated', async (c) => {
    const substances = await repo.findRegulated();

    return c.json({
      data: substances,
      meta: {
        total: substances.length,
        svhcCount: substances.filter(s => s.isSvhc).length,
        authorizationCount: substances.filter(s => s.requiresAuthorization).length,
        restrictedCount: substances.filter(s => s.isRestricted).length,
      },
    });
  });

  // GET /substances/:casNumber - Get single by CAS number
  router.get('/:casNumber', async (c) => {
    const casNumber = c.req.param('casNumber');
    const substance = await repo.findByCasNumber(casNumber);

    if (!substance) {
      return c.json({ error: 'Substance not found' }, 404);
    }

    return c.json({ data: substance });
  });

  // GET /substances/:casNumber/aliases - Get aliases for a substance
  router.get('/:casNumber/aliases', async (c) => {
    const casNumber = c.req.param('casNumber');
    const substance = await repo.findByCasNumber(casNumber);

    if (!substance) {
      return c.json({ error: 'Substance not found' }, 404);
    }

    const aliases = await repo.findAliases(substance.id);

    return c.json({
      data: aliases,
      meta: { total: aliases.length, casNumber },
    });
  });

  return router;
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm test substances.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/routes/taxonomy/substances.ts apps/api/src/routes/taxonomy/substances.test.ts
git commit -m "feat(api): add substances API routes (list, get, aliases, regulated)"
```

---

## Task 9: Create CLI Command and Update Exports

**Files:**
- Create: `packages/database/src/cli/seed-substances.ts`
- Modify: `packages/database/package.json`
- Modify: `packages/database/src/seeders/index.ts`
- Modify: `packages/database/src/utils/index.ts`
- Modify: `package.json` (root)

**Step 1: Create the CLI command**

```typescript
// packages/database/src/cli/seed-substances.ts
import { SubstancesSeeder } from '../seeders/substances.seeder.js';
import { initOrm } from '../init-orm.js';
import type { MikroORM } from '@mikro-orm/core';

async function main() {
  let orm: MikroORM | undefined;

  try {
    console.log('Initializing database connection...');
    orm = await initOrm();

    const em = orm.em.fork();
    const seeder = new SubstancesSeeder(em);

    console.log('Running substances seeder...');
    const result = await seeder.seed();

    if (result.skipped) {
      console.log(`✓ ${result.message}`);
    } else {
      console.log(`✓ ${result.message}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error seeding substances:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await orm?.close();
  }
}

main();
```

**Step 2: Add scripts to package.json**

```json
// Add to packages/database/package.json scripts:
{
  "scripts": {
    "seed:substances": "tsx src/cli/seed-substances.ts"
  }
}
```

**Step 3: Update seeders index**

```typescript
// packages/database/src/seeders/index.ts
export { UnitsSeeder, type SeederResult } from './units.seeder.js';
export { ClassificationsSeeder } from './classifications.seeder.js';
export { SubstancesSeeder, type SubstanceSeederResult } from './substances.seeder.js';
```

**Step 4: Create and export utils**

```typescript
// packages/database/src/utils/index.ts
export { isValidCasNumber, formatCasNumber, parseCasNumber, type CasParts } from './cas-validator.js';
```

```typescript
// packages/database/src/index.ts
// Add to existing exports:
export * from './utils/index.js';
```

**Step 5: Update root package.json**

```json
// Add to root package.json scripts:
{
  "scripts": {
    "db:seed:substances": "pnpm --filter @eurocomply/database seed:substances",
    "db:seed:public": "pnpm db:seed:units && pnpm db:seed:classifications && pnpm db:seed:substances"
  }
}
```

**Step 6: Test the command**

```bash
pnpm db:seed:substances
```

Expected: Substances seeded successfully

**Step 7: Commit**

```bash
git add packages/database/src/cli/seed-substances.ts packages/database/package.json packages/database/src/seeders/index.ts packages/database/src/utils/index.ts packages/database/src/index.ts package.json
git commit -m "feat(database): add seed:substances CLI command and export utilities"
```

---

## Task 10: Integration Test

**Files:**
- Create: `packages/database/src/seeders/substances.integration.test.ts`

**Step 1: Write integration test**

```typescript
// packages/database/src/seeders/substances.integration.test.ts
import { MikroORM, EntityManager } from '@mikro-orm/core';
import { SubstancesSeeder } from './substances.seeder.js';
import { Substance } from '../entities/Substance.js';
import { SubstanceAlias } from '../entities/SubstanceAlias.js';
import { SeedVersion } from '../entities/SeedVersion.js';
import { AliasType } from '../entities/enums/index.js';
import { isValidCasNumber } from '../utils/cas-validator.js';
import { createTestOrm } from '../test-utils/create-test-orm.js';

describe('Substances Registry Integration', () => {
  let orm: MikroORM;
  let em: EntityManager;

  beforeAll(async () => {
    orm = await createTestOrm([Substance, SubstanceAlias, SeedVersion]);

    // Seed substances
    em = orm.em.fork();
    const seeder = new SubstancesSeeder(em);
    await seeder.seed();
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(() => {
    em = orm.em.fork();
  });

  describe('Data Integrity', () => {
    it('should have all CAS numbers valid', async () => {
      const substances = await em.find(Substance, {});

      for (const s of substances) {
        expect(isValidCasNumber(s.casNumber)).toBe(true);
      }
    });

    it('should have sourceVersion on all substances', async () => {
      const withoutVersion = await em.count(Substance, {
        sourceVersion: { $eq: null },
      });
      expect(withoutVersion).toBe(0);
    });

    it('should have primaryName on all substances', async () => {
      const withoutName = await em.count(Substance, {
        primaryName: { $eq: null },
      });
      expect(withoutName).toBe(0);
    });
  });

  describe('Regulatory Flags', () => {
    it('should have SVHC substances', async () => {
      const svhc = await em.find(Substance, { isSvhc: true });
      expect(svhc.length).toBeGreaterThan(0);
    });

    it('should have restricted substances', async () => {
      const restricted = await em.find(Substance, { isRestricted: true });
      expect(restricted.length).toBeGreaterThan(0);
    });

    it('should have authorization-required substances', async () => {
      const auth = await em.find(Substance, { requiresAuthorization: true });
      expect(auth.length).toBeGreaterThan(0);
    });

    it('should have restriction conditions for restricted substances', async () => {
      const restrictedWithConditions = await em.find(Substance, {
        isRestricted: true,
        restrictionConditions: { $ne: null },
      });
      expect(restrictedWithConditions.length).toBeGreaterThan(0);
    });
  });

  describe('Well-Known Substances', () => {
    it('should have DMAC (127-19-5) with correct flags', async () => {
      const dmac = await em.findOne(Substance, { casNumber: '127-19-5' });

      expect(dmac).toBeDefined();
      expect(dmac?.primaryName).toBe('N,N-Dimethylacetamide');
      expect(dmac?.isSvhc).toBe(true);
      expect(dmac?.requiresAuthorization).toBe(true);
    });

    it('should have Lead (7439-92-1) with RoHS restriction', async () => {
      const lead = await em.findOne(Substance, { casNumber: '7439-92-1' });

      expect(lead).toBeDefined();
      expect(lead?.primaryName).toBe('Lead');
      expect(lead?.isRestricted).toBe(true);
      expect(lead?.restrictionConditions).toContain('RoHS');
    });

    it('should have BPA (80-05-7) as SVHC', async () => {
      const bpa = await em.findOne(Substance, { casNumber: '80-05-7' });

      expect(bpa).toBeDefined();
      expect(bpa?.isSvhc).toBe(true);
    });
  });

  describe('Aliases', () => {
    it('should have aliases linked to substances', async () => {
      const aliasCount = await em.count(SubstanceAlias);
      expect(aliasCount).toBeGreaterThan(0);
    });

    it('should have DMAC alias for Dimethylacetamide', async () => {
      const dmac = await em.findOne(Substance, { casNumber: '127-19-5' });
      const aliases = await em.find(SubstanceAlias, { substanceId: dmac!.id });

      expect(aliases.map(a => a.name)).toContain('DMAC');
    });

    it('should have correct alias types', async () => {
      const commonAliases = await em.find(SubstanceAlias, { type: AliasType.COMMON });
      const iupacAliases = await em.find(SubstanceAlias, { type: AliasType.IUPAC });

      expect(commonAliases.length).toBeGreaterThan(0);
      // IUPAC names may or may not be present in curated data
    });
  });

  describe('Search Patterns', () => {
    it('should find substances by name prefix', async () => {
      const results = await em.find(Substance, {
        primaryName: { $like: 'Bis%' },
      });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should find substances by EC number', async () => {
      const results = await em.find(Substance, {
        ecNumber: { $ne: null },
      });
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Idempotency', () => {
    it('should not duplicate substances on re-seed', async () => {
      const beforeCount = await em.count(Substance);

      const seeder = new SubstancesSeeder(em);
      const result = await seeder.seed();

      expect(result.skipped).toBe(true);

      const afterCount = await em.count(Substance);
      expect(afterCount).toBe(beforeCount);
    });
  });
});
```

**Step 2: Run integration test**

```bash
cd packages/database && pnpm test substances.integration.test.ts
```

Expected: PASS

**Step 3: Commit**

```bash
git add packages/database/src/seeders/substances.integration.test.ts
git commit -m "test(database): add substances registry integration tests"
```

---

## Summary

**Deliverables:**
- `AliasType` enum (IUPAC, COMMON, TRADE, SYNONYM, INDEX_NAME)
- CAS number validation utility with checksum verification
- `Substance` entity with regulatory fields and CAS validation hook
- `SubstanceAlias` entity for chemical name synonyms
- Migrations for both tables
- ECHA data bundle (`data/echa-substances.json`) with ~25 curated substances
- `SubstancesSeeder` service with alias support
- Substances API routes (list, get, aliases, regulated)
- `seed:substances` CLI command
- `db:seed:substances` root-level command
- Integration tests for data integrity and regulatory flags

**API Routes:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/taxonomy/substances` | List with filters (svhc, restricted, search) |
| GET | `/api/v1/taxonomy/substances/:casNumber` | Get by CAS number |
| GET | `/api/v1/taxonomy/substances/:casNumber/aliases` | Get aliases |
| GET | `/api/v1/taxonomy/substances/regulated` | Get all regulated substances |

**Updated db:seed:public command:**
```bash
pnpm db:seed:public
# Runs: seed:units → seed:classifications → seed:substances
```

**Next Plan:** Plan 5 (Category Service) builds the category hierarchy system.
