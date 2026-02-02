# GSR v2: Golden Record Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the Golden Record architecture for GSR v2, enabling cross-registry substance lookup with InChIKey-based deduplication and separate persona tables for each regulatory context.

**Architecture:** CompTox/DSSTox as foundation (1.25M chemicals with InChIKey), persona tables per registry (ECHA, CosIng, EFSA, TSCA, Biocides), Identity Ladder for resolution.

**Tech Stack:** MikroORM, PostgreSQL, TypeScript, xlsx library for parsing

---

## Data Sources Verified (Official Government Sources)

| Source | File Path | Records | Key Fields |
|--------|-----------|---------|------------|
| **CompTox/DSSTox** | `data/DSSTox_CCD_dump_12092025/DSSToxCCDdump.csv` | 1,246,399 | DTXSID, CASRN, INCHIKEY, SMILES, PREFERRED_NAME |
| **TSCA** | `data/tsca_inventory/TSCAINV_072025.csv` | 70,754 | ID, CASRN, ChemName, ACTIVITY |
| **CosIng Annex II** | `data/CosIng/COSING_Annex_II_v2.xls` | ~1,760 | CAS, EC, Name, CMR (Prohibited) |
| **CosIng Annex III** | `data/CosIng/COSING_Annex_III_v2.xls` | ~380 | CAS, EC, Max conc. (Restricted) |
| **CosIng Annex IV** | `data/CosIng/COSING_Annex_IV_v2.xls` | ~160 | CAS, EC, CI Number (Colorants) |
| **CosIng Annex V** | `data/CosIng/COSING_Annex_V_v2.xls` | ~60 | CAS, EC, Max conc. (Preservatives) |
| **CosIng Annex VI** | `data/CosIng/COSING_Annex_VI_v2.xls` | ~40 | CAS, EC, Max conc. (UV Filters) |
| **EFSA E-Numbers** | `data/EFSA/ENumbers.txt` | 414 | E-number, Name, Is group? |
| **EFSA OpenFoodTox** | `data/EFSA/OpenFoodToxTX22809_2023.xlsx` | 8,007 | CAS, EC, SMILES, ADI values |
| **ECHA Biocides** | `data/ECHA Biocides/art95_list_en.xlsx` | 5,265 | CAS, EC, Product Type, Supplier |

**All files verified present in `packages/gsr/data/`**

---

## Phase 1: Schema Changes

### Task 1.1: Update Substance Entity for Golden Record

**Files:**
- Modify: `packages/gsr/src/entities/Substance.ts`

**Step 1: Read current Substance entity**

Read the file to understand current structure.

**Step 2: Add Golden Record fields**

Add these new columns to the Substance entity:

```typescript
// New Golden Record fields
@Property({ type: 'varchar', length: 27, nullable: true, unique: true })
inchiKey?: string;

@Property({ type: 'varchar', length: 20, nullable: true })
dtxsid?: string;  // EPA CompTox ID

@Property({ type: 'text', nullable: true })
smiles?: string;

@Property({ type: 'text', nullable: true })
inchi?: string;

@Property({ type: 'varchar', length: 200, nullable: true })
molecularFormula?: string;

@Property({ type: 'decimal', precision: 12, scale: 4, nullable: true })
molecularWeight?: number;

@Property({ type: 'boolean', default: false })
isGoldenRecord: boolean = false;  // True if from CompTox foundation

@Property({ type: 'varchar', length: 20, nullable: true })
goldenRecordSource?: string;  // 'COMPTOX', 'PUBCHEM', 'MANUAL'
```

**Step 3: Commit**

```bash
git add packages/gsr/src/entities/Substance.ts
git commit -m "feat(gsr): add Golden Record fields to Substance entity

- Add inchiKey as unique chemical fingerprint
- Add dtxsid for EPA CompTox reference
- Add smiles, inchi, molecularFormula, molecularWeight
- Add isGoldenRecord and goldenRecordSource flags

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 1.2: Create TSCA Persona Entity

**Files:**
- Create: `packages/gsr/src/entities/SubstanceTsca.ts`
- Modify: `packages/gsr/src/entities/index.ts`

**Step 1: Create SubstanceTsca entity**

```typescript
// packages/gsr/src/entities/SubstanceTsca.ts
import { Entity, Property, ManyToOne, Unique } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Substance } from './Substance.js';

export enum TscaActivity {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity({ tableName: 'substance_tsca' })
@Unique({ properties: ['substance', 'tscaId'] })
export class SubstanceTsca extends BaseEntity {
  @ManyToOne(() => Substance)
  substance!: Substance;

  @Property({ type: 'int' })
  tscaId!: number;  // ID from TSCA inventory

  @Property({ type: 'varchar', length: 20, nullable: true })
  casRegNo?: string;  // Formatted CAS without dashes

  @Property({ type: 'varchar', length: 20, nullable: true })
  uid?: string;

  @Property({ type: 'varchar', length: 20, nullable: true })
  exp?: string;

  @Property({ type: 'text', nullable: true })
  chemName?: string;  // CA Index Name

  @Property({ type: 'text', nullable: true })
  definition?: string;

  @Property({ type: 'boolean', default: false })
  isUvcb: boolean = false;  // Unknown or Variable Composition

  @Property({ type: 'varchar', length: 10, nullable: true })
  flag?: string;  // S, P, XU, etc.

  @Property({ type: 'varchar', length: 10, enumItems: () => TscaActivity })
  activity!: TscaActivity;

  @Property({ type: 'varchar', length: 20, nullable: true })
  dataVersion?: string;
}
```

**Step 2: Export from index.ts**

Add to `packages/gsr/src/entities/index.ts`:
```typescript
export { SubstanceTsca, TscaActivity } from './SubstanceTsca.js';
```

**Step 3: Commit**

```bash
git add packages/gsr/src/entities/SubstanceTsca.ts packages/gsr/src/entities/index.ts
git commit -m "feat(gsr): add SubstanceTsca persona entity for US TSCA inventory

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 1.3: Create CosIng Persona Entity

**Files:**
- Create: `packages/gsr/src/entities/SubstanceCosing.ts`
- Modify: `packages/gsr/src/entities/index.ts`

**Step 1: Create SubstanceCosing entity**

```typescript
// packages/gsr/src/entities/SubstanceCosing.ts
import { Entity, Property, ManyToOne, Unique, Enum } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Substance } from './Substance.js';

export enum CosingAnnex {
  II = 'II',      // Prohibited
  III = 'III',    // Restricted
  IV = 'IV',      // Colorants
  V = 'V',        // Preservatives
  VI = 'VI',      // UV Filters
}

export enum CosingProductType {
  RINSE_OFF = 'RINSE_OFF',
  LEAVE_ON = 'LEAVE_ON',
  ORAL = 'ORAL',
  EYE = 'EYE',
  MUCOUS = 'MUCOUS',
  ALL = 'ALL',
}

@Entity({ tableName: 'substance_cosing' })
@Unique({ properties: ['substance', 'annex', 'refNumber'] })
export class SubstanceCosing extends BaseEntity {
  @ManyToOne(() => Substance)
  substance!: Substance;

  @Enum(() => CosingAnnex)
  annex!: CosingAnnex;

  @Property({ type: 'varchar', length: 10 })
  refNumber!: string;  // Reference number in annex (e.g., "1", "1a", "2")

  @Property({ type: 'text', nullable: true })
  chemicalName?: string;

  @Property({ type: 'varchar', length: 500, nullable: true })
  inciName?: string;  // INCI name(s), may be multiple separated by ;

  @Property({ type: 'varchar', length: 20, nullable: true })
  ciNumber?: string;  // Color Index number (Annex IV only)

  @Property({ type: 'jsonb', nullable: true })
  productTypes?: CosingProductType[];  // Which product types allowed

  @Property({ type: 'varchar', length: 50, nullable: true })
  maxConcentration?: string;  // e.g., "0.5%", "2.5% (acid)"

  @Property({ type: 'text', nullable: true })
  restrictions?: string;  // Free text restrictions

  @Property({ type: 'text', nullable: true })
  warningText?: string;  // Required warning labels

  @Property({ type: 'boolean', default: false })
  isCmr: boolean = false;  // Carcinogenic, Mutagenic, Reprotoxic

  @Property({ type: 'varchar', length: 50, nullable: true })
  regulation?: string;  // e.g., "(EC) 2009/1223"

  @Property({ type: 'text', nullable: true })
  sccsOpinions?: string;  // SCCS opinion references

  @Property({ type: 'date', nullable: true })
  updateDate?: Date;

  @Property({ type: 'varchar', length: 20, nullable: true })
  dataVersion?: string;
}
```

**Step 2: Export from index.ts**

Add to exports.

**Step 3: Commit**

```bash
git add packages/gsr/src/entities/SubstanceCosing.ts packages/gsr/src/entities/index.ts
git commit -m "feat(gsr): add SubstanceCosing persona entity for EU cosmetics regulation

- Supports all 5 annexes (II-VI)
- Tracks INCI names, CI numbers, max concentrations
- Includes CMR flags and SCCS opinions

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 1.4: Create EFSA Food Additive Persona Entity

**Files:**
- Create: `packages/gsr/src/entities/SubstanceEfsa.ts`
- Modify: `packages/gsr/src/entities/index.ts`

**Step 1: Create SubstanceEfsa entity**

```typescript
// packages/gsr/src/entities/SubstanceEfsa.ts
import { Entity, Property, ManyToOne, Unique } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Substance } from './Substance.js';

@Entity({ tableName: 'substance_efsa' })
@Unique({ properties: ['substance', 'eNumber'] })
export class SubstanceEfsa extends BaseEntity {
  @ManyToOne(() => Substance)
  substance!: Substance;

  @Property({ type: 'varchar', length: 20 })
  eNumber!: string;  // E.g., "E 211", "E 160a(ii)"

  @Property({ type: 'varchar', length: 255 })
  additiveName!: string;

  @Property({ type: 'boolean', default: false })
  isGroup: boolean = false;  // E.g., "E 210 - 213" is a group

  @Property({ type: 'varchar', length: 20, nullable: true })
  groupParent?: string;  // Parent E-number if part of group

  // From OpenFoodTox (if linked)
  @Property({ type: 'int', nullable: true })
  openFoodToxId?: number;  // TRX_ID from OpenFoodTox

  @Property({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  adiValue?: number;  // Acceptable Daily Intake

  @Property({ type: 'varchar', length: 20, nullable: true })
  adiUnit?: string;  // e.g., "mg/kg bw/day"

  @Property({ type: 'varchar', length: 10, nullable: true })
  adiQualifier?: string;  // e.g., "<=", "not specified"

  @Property({ type: 'text', nullable: true })
  safetyRemarks?: string;

  @Property({ type: 'varchar', length: 20, nullable: true })
  dataVersion?: string;
}
```

**Step 2: Export from index.ts**

**Step 3: Commit**

```bash
git add packages/gsr/src/entities/SubstanceEfsa.ts packages/gsr/src/entities/index.ts
git commit -m "feat(gsr): add SubstanceEfsa persona entity for EU food additives

- Stores E-numbers with group hierarchy
- Links to OpenFoodTox for ADI values
- Tracks safety assessments

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 1.5: Create Biocides Persona Entity

**Files:**
- Create: `packages/gsr/src/entities/SubstanceBiocide.ts`
- Modify: `packages/gsr/src/entities/index.ts`

**Step 1: Create SubstanceBiocide entity**

```typescript
// packages/gsr/src/entities/SubstanceBiocide.ts
import { Entity, Property, ManyToOne, Unique } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Substance } from './Substance.js';

// EU Biocidal Products Regulation Product Types
export enum BiocideProductType {
  PT1 = 'PT1',    // Human hygiene
  PT2 = 'PT2',    // Disinfectants (private/public health)
  PT3 = 'PT3',    // Veterinary hygiene
  PT4 = 'PT4',    // Food and feed area
  PT5 = 'PT5',    // Drinking water
  PT6 = 'PT6',    // Preservatives (in-can)
  PT7 = 'PT7',    // Film preservatives
  PT8 = 'PT8',    // Wood preservatives
  PT9 = 'PT9',    // Fibre/leather/rubber preservatives
  PT10 = 'PT10',  // Construction material preservatives
  PT11 = 'PT11',  // Liquid-cooling system preservatives
  PT12 = 'PT12',  // Slimicides
  PT13 = 'PT13',  // Working/cutting fluid preservatives
  PT14 = 'PT14',  // Rodenticides
  PT15 = 'PT15',  // Avicides
  PT16 = 'PT16',  // Molluscicides
  PT17 = 'PT17',  // Piscicides
  PT18 = 'PT18',  // Insecticides
  PT19 = 'PT19',  // Repellents/attractants
  PT20 = 'PT20',  // Control of other vertebrates
  PT21 = 'PT21',  // Antifouling products
  PT22 = 'PT22',  // Embalming/taxidermist fluids
}

export enum BiocideSupplierType {
  SUBSTANCE = 'SUBSTANCE',
  PRODUCT = 'PRODUCT',
  BOTH = 'BOTH',
}

export enum BiocideInclusionReason {
  RP_PARTICIPANT = 'RP_PARTICIPANT',
  ARTICLE_93 = 'ARTICLE_93',
  AS_NOT_IN_RP = 'AS_NOT_IN_RP',
  THIRD_PARTY_DOSSIER = 'THIRD_PARTY_DOSSIER',
  ART95_SUBMISSION = 'ART95_SUBMISSION',
}

@Entity({ tableName: 'substance_biocide' })
export class SubstanceBiocide extends BaseEntity {
  @ManyToOne(() => Substance)
  substance!: Substance;

  @Property({ type: 'varchar', length: 20 })
  productType!: string;  // PT1-PT22 or special values

  @Property({ type: 'varchar', length: 255 })
  activeSubstanceName!: string;

  @Property({ type: 'varchar', length: 255, nullable: true })
  entityName?: string;  // Supplier company name

  @Property({ type: 'varchar', length: 100, nullable: true })
  country?: string;

  @Property({ type: 'varchar', length: 50, nullable: true })
  supplierType?: string;  // Substance & Product Supplier, etc.

  @Property({ type: 'varchar', length: 50, nullable: true })
  inclusionReason?: string;

  @Property({ type: 'date', nullable: true })
  inclusionDateAsPt?: Date;  // When AS-PT was added

  @Property({ type: 'date', nullable: true })
  inclusionDateSupplier?: Date;  // When supplier was added

  @Property({ type: 'varchar', length: 20, nullable: true })
  dataVersion?: string;
}
```

**Step 2: Export from index.ts**

**Step 3: Commit**

```bash
git add packages/gsr/src/entities/SubstanceBiocide.ts packages/gsr/src/entities/index.ts
git commit -m "feat(gsr): add SubstanceBiocide persona entity for EU BPR Article 95 list

- Supports all 22 product types (PT1-PT22)
- Tracks suppliers and inclusion reasons
- Links to Article 95 list entries

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 1.6: Update Migration

**Files:**
- Modify: `packages/database/src/migrations/Migration20260122000000.ts`

**Step 1: Read current migration**

**Step 2: Add new tables to migration**

Add the following tables to the `up()` method:

```typescript
// After existing substance table modifications, add:

// TSCA persona table
this.addSql(`
  CREATE TABLE IF NOT EXISTS "substance_tsca" (
    "id" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "substance_id" VARCHAR(30) NOT NULL REFERENCES "substance"("id") ON DELETE CASCADE,
    "tsca_id" INT NOT NULL,
    "cas_reg_no" VARCHAR(20),
    "uid" VARCHAR(20),
    "exp" VARCHAR(20),
    "chem_name" TEXT,
    "definition" TEXT,
    "is_uvcb" BOOLEAN NOT NULL DEFAULT false,
    "flag" VARCHAR(10),
    "activity" VARCHAR(10) NOT NULL,
    "data_version" VARCHAR(20),
    PRIMARY KEY ("id"),
    UNIQUE ("substance_id", "tsca_id")
  );
  CREATE INDEX "idx_substance_tsca_substance" ON "substance_tsca" ("substance_id");
  CREATE INDEX "idx_substance_tsca_activity" ON "substance_tsca" ("activity");
`);

// CosIng persona table
this.addSql(`
  CREATE TABLE IF NOT EXISTS "substance_cosing" (
    "id" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "substance_id" VARCHAR(30) NOT NULL REFERENCES "substance"("id") ON DELETE CASCADE,
    "annex" VARCHAR(10) NOT NULL,
    "ref_number" VARCHAR(10) NOT NULL,
    "chemical_name" TEXT,
    "inci_name" VARCHAR(500),
    "ci_number" VARCHAR(20),
    "product_types" JSONB,
    "max_concentration" VARCHAR(50),
    "restrictions" TEXT,
    "warning_text" TEXT,
    "is_cmr" BOOLEAN NOT NULL DEFAULT false,
    "regulation" VARCHAR(50),
    "sccs_opinions" TEXT,
    "update_date" DATE,
    "data_version" VARCHAR(20),
    PRIMARY KEY ("id"),
    UNIQUE ("substance_id", "annex", "ref_number")
  );
  CREATE INDEX "idx_substance_cosing_substance" ON "substance_cosing" ("substance_id");
  CREATE INDEX "idx_substance_cosing_annex" ON "substance_cosing" ("annex");
  CREATE INDEX "idx_substance_cosing_inci" ON "substance_cosing" ("inci_name");
`);

// EFSA food additive persona table
this.addSql(`
  CREATE TABLE IF NOT EXISTS "substance_efsa" (
    "id" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "substance_id" VARCHAR(30) NOT NULL REFERENCES "substance"("id") ON DELETE CASCADE,
    "e_number" VARCHAR(20) NOT NULL,
    "additive_name" VARCHAR(255) NOT NULL,
    "is_group" BOOLEAN NOT NULL DEFAULT false,
    "group_parent" VARCHAR(20),
    "open_food_tox_id" INT,
    "adi_value" DECIMAL(10, 4),
    "adi_unit" VARCHAR(20),
    "adi_qualifier" VARCHAR(10),
    "safety_remarks" TEXT,
    "data_version" VARCHAR(20),
    PRIMARY KEY ("id"),
    UNIQUE ("substance_id", "e_number")
  );
  CREATE INDEX "idx_substance_efsa_substance" ON "substance_efsa" ("substance_id");
  CREATE INDEX "idx_substance_efsa_enumber" ON "substance_efsa" ("e_number");
`);

// Biocide persona table
this.addSql(`
  CREATE TABLE IF NOT EXISTS "substance_biocide" (
    "id" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "substance_id" VARCHAR(30) NOT NULL REFERENCES "substance"("id") ON DELETE CASCADE,
    "product_type" VARCHAR(20) NOT NULL,
    "active_substance_name" VARCHAR(255) NOT NULL,
    "entity_name" VARCHAR(255),
    "country" VARCHAR(100),
    "supplier_type" VARCHAR(50),
    "inclusion_reason" VARCHAR(50),
    "inclusion_date_as_pt" DATE,
    "inclusion_date_supplier" DATE,
    "data_version" VARCHAR(20),
    PRIMARY KEY ("id")
  );
  CREATE INDEX "idx_substance_biocide_substance" ON "substance_biocide" ("substance_id");
  CREATE INDEX "idx_substance_biocide_pt" ON "substance_biocide" ("product_type");
`);

// Add Golden Record columns to substance table
this.addSql(`
  ALTER TABLE "substance"
    ADD COLUMN IF NOT EXISTS "inchi_key" VARCHAR(27) UNIQUE,
    ADD COLUMN IF NOT EXISTS "dtxsid" VARCHAR(20),
    ADD COLUMN IF NOT EXISTS "smiles" TEXT,
    ADD COLUMN IF NOT EXISTS "inchi" TEXT,
    ADD COLUMN IF NOT EXISTS "molecular_formula" VARCHAR(200),
    ADD COLUMN IF NOT EXISTS "molecular_weight" DECIMAL(12, 4),
    ADD COLUMN IF NOT EXISTS "is_golden_record" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "golden_record_source" VARCHAR(20);

  CREATE INDEX IF NOT EXISTS "idx_substance_inchi_key" ON "substance" ("inchi_key");
  CREATE INDEX IF NOT EXISTS "idx_substance_dtxsid" ON "substance" ("dtxsid");
  CREATE INDEX IF NOT EXISTS "idx_substance_is_golden" ON "substance" ("is_golden_record");
`);
```

**Step 3: Run db:reset to apply**

```bash
cd /root/Documents/EuroComply && pnpm db:reset
```

**Step 4: Commit**

```bash
git add packages/database/src/migrations/Migration20260122000000.ts
git commit -m "feat(db): add Golden Record columns and persona tables for GSR v2

- Add inchi_key, dtxsid, smiles, inchi to substance table
- Add substance_tsca for US TSCA inventory
- Add substance_cosing for EU cosmetics (Annexes II-VI)
- Add substance_efsa for EU food additives (E-numbers)
- Add substance_biocide for EU BPR Article 95

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 2: CompTox Foundation Seeder

### Task 2.1: Create CompTox Parser

**Files:**
- Create: `packages/gsr/src/parsers/comptox-parser.ts`

**Step 1: Create parser for DSSTox CSV**

```typescript
// packages/gsr/src/parsers/comptox-parser.ts
import * as fs from 'fs';
import * as readline from 'readline';

export interface CompToxRecord {
  dtxsid: string;
  preferredName: string;
  casrn: string;
  dtxcid: string;
  inchiKey: string;
  iupacName: string;
  smiles: string;
  molecularFormula: string;
  averageMass: number | null;
  monoisotopicMass: number | null;
  qsarReadySmiles: string;
  msReadySmiles: string;
  identifier: string;
}

export async function* parseCompToxCsv(
  filePath: string
): AsyncGenerator<CompToxRecord> {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let isFirstLine = true;
  let headers: string[] = [];

  for await (const line of rl) {
    if (isFirstLine) {
      headers = line.split(',');
      isFirstLine = false;
      continue;
    }

    // Parse CSV line (handles quoted fields)
    const values = parseCSVLine(line);

    const record: CompToxRecord = {
      dtxsid: values[0] || '',
      preferredName: values[1] || '',
      casrn: values[2] || '',
      dtxcid: values[3] || '',
      inchiKey: values[4] || '',
      iupacName: values[5] || '',
      smiles: values[6] || '',
      molecularFormula: values[7] || '',
      averageMass: values[8] ? parseFloat(values[8]) : null,
      monoisotopicMass: values[9] ? parseFloat(values[9]) : null,
      qsarReadySmiles: values[10] || '',
      msReadySmiles: values[11] || '',
      identifier: values[12] || '',
    };

    // Only yield records with InChIKey (our primary identifier)
    if (record.inchiKey && record.inchiKey.length === 27) {
      yield record;
    }
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

export function countCompToxRecords(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let count = 0;
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    rl.on('line', () => count++);
    rl.on('close', () => resolve(count - 1)); // Subtract header
    rl.on('error', reject);
  });
}
```

**Step 2: Commit**

```bash
git add packages/gsr/src/parsers/comptox-parser.ts
git commit -m "feat(gsr): add CompTox/DSSTox CSV parser

- Stream-based parsing for 1.25M records
- Handles quoted CSV fields
- Filters to records with valid InChIKey

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 2.2: Create CompTox Seeder

**Files:**
- Create: `packages/gsr/src/cli/seed-comptox.ts`
- Modify: `packages/gsr/src/cli/seed.ts`

**Step 1: Create seeder implementation**

```typescript
// packages/gsr/src/cli/seed-comptox.ts
import { MikroORM } from '@mikro-orm/postgresql';
import { createId } from '@paralleldrive/cuid2';
import { parseCompToxCsv, countCompToxRecords } from '../parsers/comptox-parser.js';
import { Substance } from '../entities/index.js';
import { sanitizeCas, isValidCasChecksum } from '../utils/index.js';

interface SeedOptions {
  version: string;
  dryRun: boolean;
  batchSize?: number;
}

export async function seedCompTox(
  filePath: string,
  options: SeedOptions
): Promise<void> {
  const { version, dryRun, batchSize = 5000 } = options;

  console.log('\n[CompTox] Seeding Golden Records from DSSTox...');
  console.log(`  File: ${filePath}`);
  console.log(`  Version: ${version || 'default'}`);
  console.log(`  Dry run: ${dryRun}`);
  console.log(`  Batch size: ${batchSize}`);

  // Count total records
  console.log('\n[CompTox] Counting records...');
  const totalRecords = await countCompToxRecords(filePath);
  console.log(`  Total records in file: ${totalRecords.toLocaleString()}`);

  if (dryRun) {
    console.log('\n[DRY RUN] Would create Golden Records. Exiting.');
    return;
  }

  const orm = await MikroORM.init();
  const em = orm.em.fork();

  let processed = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let batch: Substance[] = [];

  const startTime = Date.now();

  try {
    for await (const record of parseCompToxCsv(filePath)) {
      processed++;

      // Sanitize CAS number
      const sanitizedCas = record.casrn ? sanitizeCas(record.casrn) : null;

      // Skip invalid CAS checksums
      if (sanitizedCas && !isValidCasChecksum(sanitizedCas)) {
        skipped++;
        continue;
      }

      // Check if substance exists by InChIKey
      let substance = await em.findOne(Substance, { inchiKey: record.inchiKey });

      if (substance) {
        // Update existing with CompTox data
        substance.dtxsid = record.dtxsid;
        substance.smiles = record.smiles || substance.smiles;
        substance.molecularFormula = record.molecularFormula || substance.molecularFormula;
        substance.molecularWeight = record.averageMass ?? substance.molecularWeight;
        substance.isGoldenRecord = true;
        substance.goldenRecordSource = 'COMPTOX';
        updated++;
      } else {
        // Check by CAS
        if (sanitizedCas) {
          substance = await em.findOne(Substance, { casNumber: sanitizedCas });
        }

        if (substance) {
          // Found by CAS, update with InChIKey
          substance.inchiKey = record.inchiKey;
          substance.dtxsid = record.dtxsid;
          substance.smiles = record.smiles || substance.smiles;
          substance.molecularFormula = record.molecularFormula || substance.molecularFormula;
          substance.molecularWeight = record.averageMass ?? substance.molecularWeight;
          substance.isGoldenRecord = true;
          substance.goldenRecordSource = 'COMPTOX';
          updated++;
        } else {
          // Create new Golden Record
          substance = em.create(Substance, {
            id: createId(),
            casNumber: sanitizedCas,
            primaryName: record.preferredName,
            inchiKey: record.inchiKey,
            dtxsid: record.dtxsid,
            smiles: record.smiles,
            molecularFormula: record.molecularFormula,
            molecularWeight: record.averageMass,
            isGoldenRecord: true,
            goldenRecordSource: 'COMPTOX',
            isStub: false,
          });
          created++;
        }
      }

      batch.push(substance);

      // Flush batch
      if (batch.length >= batchSize) {
        await em.persistAndFlush(batch);
        batch = [];
        em.clear();

        const elapsed = (Date.now() - startTime) / 1000;
        const rate = Math.round(processed / elapsed);
        const pct = ((processed / totalRecords) * 100).toFixed(1);
        console.log(
          `  [${pct}%] Processed ${processed.toLocaleString()} | ` +
          `Created: ${created.toLocaleString()} | Updated: ${updated.toLocaleString()} | ` +
          `Rate: ${rate}/sec`
        );
      }
    }

    // Flush remaining
    if (batch.length > 0) {
      await em.persistAndFlush(batch);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n[CompTox] Seeding complete!');
    console.log(`  Created: ${created.toLocaleString()}`);
    console.log(`  Updated: ${updated.toLocaleString()}`);
    console.log(`  Skipped (invalid CAS): ${skipped.toLocaleString()}`);
    console.log(`  Total time: ${elapsed}s`);
  } finally {
    await orm.close();
  }
}
```

**Step 2: Add CLI command in seed.ts**

Add import and command registration.

**Step 3: Commit**

```bash
git add packages/gsr/src/cli/seed-comptox.ts packages/gsr/src/cli/seed.ts
git commit -m "feat(gsr): add CompTox seeder for Golden Record foundation

- Batch processing of 1.25M records
- Identity resolution by InChIKey then CAS
- Progress reporting with rate tracking

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 3: TSCA Seeder

### Task 3.1: Create TSCA Parser and Seeder

**Files:**
- Create: `packages/gsr/src/parsers/tsca-parser.ts`
- Create: `packages/gsr/src/cli/seed-tsca.ts`
- Modify: `packages/gsr/src/cli/seed.ts`

**Step 1: Create TSCA parser**

Parse the TSCAINV CSV with columns: ID, CASRN, casregno, UID, EXP, ChemName, DEF, UVCB, FLAG, ACTIVITY

**Step 2: Create TSCA seeder**

Link to Golden Records by CAS, create SubstanceTsca persona entries.

**Step 3: Commit**

---

## Phase 4: CosIng Seeder

### Task 4.1: Create CosIng Parser

**Files:**
- Create: `packages/gsr/src/parsers/cosing-parser.ts`

Parse XLS files for each Annex with their specific column structures.

### Task 4.2: Create CosIng Seeder

**Files:**
- Create: `packages/gsr/src/cli/seed-cosing.ts`
- Modify: `packages/gsr/src/cli/seed.ts`

Link to Golden Records by CAS/EC, create SubstanceCosing persona entries for each Annex.

---

## Phase 5: EFSA Seeder

### Task 5.1: Create EFSA E-Numbers Parser

**Files:**
- Create: `packages/gsr/src/parsers/efsa-parser.ts`

Parse ENumbers.txt (tab-separated) and link to OpenFoodTox for ADI values.

### Task 5.2: Create EFSA Seeder

**Files:**
- Create: `packages/gsr/src/cli/seed-efsa.ts`
- Modify: `packages/gsr/src/cli/seed.ts`

---

## Phase 6: Biocides Seeder

### Task 6.1: Create Biocides Parser and Seeder

**Files:**
- Create: `packages/gsr/src/parsers/biocides-parser.ts`
- Create: `packages/gsr/src/cli/seed-biocides.ts`
- Modify: `packages/gsr/src/cli/seed.ts`

Parse art95_list_en.xlsx, link to Golden Records, create SubstanceBiocide entries.

---

## Phase 7: Identity Ladder

### Task 7.1: Create Identity Resolution Service

**Files:**
- Create: `packages/gsr/src/services/identity-ladder.ts`

Implement the resolution algorithm:
1. InChIKey exact match
2. CAS exact match
3. EC number match
4. INCI name match (CosIng)
5. E-number match (EFSA)
6. Fuzzy name match (pg_trgm)
7. PubChem healer (API fallback)

---

## Phase 8: Validation

### Task 8.1: Update Validation for Persona Tables

**Files:**
- Modify: `packages/gsr/src/cli/full-validate.ts`

Add validation checks for:
- Golden Record coverage (% with InChIKey)
- Persona table counts per registry
- Cross-references between personas and substances

---

## Phase 9: CLI Updates

### Task 9.1: Add All New CLI Commands

**Files:**
- Modify: `packages/gsr/src/cli/index.ts`

Add commands:
- `gsr seed comptox <file>` - Seed Golden Records from CompTox
- `gsr seed tsca <file>` - Seed TSCA persona
- `gsr seed cosing <dir>` - Seed CosIng personas from all annexes
- `gsr seed efsa <dir>` - Seed EFSA personas
- `gsr seed biocides <file>` - Seed Biocides personas

---

## Phase 10: Documentation

### Task 10.1: Update Design Document

**Files:**
- Modify: `docs/plans/2026-02-02-gsr-golden-record-design.md`

Update status to IMPLEMENTED, add actual record counts.

### Task 10.2: Update Data Sources Guide

**Files:**
- Modify: `docs/GSR_DATA_SOURCES.md`

Add sections for all new data sources with download instructions.

---

## Seed Sequence

After implementing all phases, the complete seed sequence is:

```bash
# 1. Reset database
pnpm db:reset

# 2. Seed CLP reference data (hazard classes, H-statements)
pnpm gsr seed clp-reference

# 3. Seed Golden Records foundation (CompTox - 1.25M chemicals)
pnpm gsr seed comptox data/DSSTox_CCD_dump_12092025/DSSToxCCDdump.csv

# 4. Seed ECHA EC Inventory (adds EC numbers to Golden Records)
pnpm gsr seed echa-inventory data/EC_Inventory.i6z

# 5. Seed CLP Harmonised Classifications
pnpm gsr seed clp-harmonised data/Harmonised_List_2026-02-01\ 17_42_11.xlsx

# 6. Seed ECHA regulatory lists (SVHC, Annex XVII, etc.)
pnpm gsr seed echa-svhc --entries data/candidate_list_full-2026-01-30.xlsx --substances data/candidate_list_2026-02-01.xlsx
pnpm gsr seed echa-annex-xvii --entries data/restriction_list_full-2025-09-12.xlsx --substances data/restriction_list_2026-02-01.xlsx
pnpm gsr seed echa-annex-xiv --entries data/authorisation_list_full-2025-09-13.xlsx --substances data/authorisation_list_2026-02-01.xlsx
pnpm gsr seed echa-pop --entries data/pops_list_full-2025-09-12.xlsx --substances data/pops_list_2026-02-01.xlsx
pnpm gsr seed rohs

# 7. Seed TSCA persona (US market)
pnpm gsr seed tsca data/tsca_inventory/TSCAINV_072025.csv

# 8. Seed CosIng personas (cosmetics)
pnpm gsr seed cosing data/CosIng/

# 9. Seed EFSA personas (food additives)
pnpm gsr seed efsa data/EFSA/

# 10. Seed Biocides personas
pnpm gsr seed biocides "data/ECHA Biocides/art95_list_en.xlsx"

# 11. Validate
pnpm gsr validate-full
```

---

## Success Metrics

After full seeding:

| Table | Expected Count |
|-------|----------------|
| `substance` (Golden Records) | ~1,200,000 |
| `substance` (with InChIKey) | ~1,150,000 (92%+) |
| `substance_tsca` | ~70,000 |
| `substance_cosing` | ~2,400 |
| `substance_efsa` | ~400 |
| `substance_biocide` | ~5,000 |
| `substance_hazard_classification` | ~12,000 |

---

## Notes

- All parsers use streaming to handle large files efficiently
- Batch sizes are configurable for memory management
- Each seeder is idempotent (can re-run safely)
- Identity Ladder tries multiple resolution strategies before creating stubs
