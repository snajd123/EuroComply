# Taxonomy Plan 2: Units Registry

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand the Units Registry from ~50 curated units to full UNECE Rec 20 (~1,800 units) with version tracking and idempotent seeding.

**Architecture:** Expand existing `UnitDefinition` entity with a `sourceVersion` field. Create a comprehensive JSON data bundle downloaded from UNECE. Use the seed infrastructure from Plan 1 (`SeedService`, `BulkImportService`) for idempotent, deployment-time seeding.

**Tech Stack:** MikroORM, PostgreSQL COPY, UNECE Rec 20 Rev17

**Prerequisites:** Plan 1 (Seed Infrastructure) must be completed first.

**Reference:** See `docs/plans/2026-01-23-taxonomy-engine-design.md` Sections 4.1-4.4

---

## Task 1: Add sourceVersion Field to UnitDefinition

**Files:**
- Modify: `packages/database/src/entities/UnitDefinition.ts`
- Test: `packages/database/src/entities/UnitDefinition.test.ts`

**Step 1: Write the failing test**

```typescript
// Add to packages/database/src/entities/UnitDefinition.test.ts

describe('UnitDefinition', () => {
  // ... existing tests ...

  it('should store sourceVersion field', async () => {
    const em = orm.em.fork();

    const unit = em.create(UnitDefinition, {
      code: 'TEST',
      name: 'Test Unit',
      symbol: 'tst',
      system: UnitSystem.COUNT,
      factor: '1',
      isBase: false,
      isActive: true,
      sourceVersion: 'UNECE-Rev17',
    });

    await em.persistAndFlush(unit);

    const found = await em.findOne(UnitDefinition, { code: 'TEST' });
    expect(found).toBeDefined();
    expect(found?.sourceVersion).toBe('UNECE-Rev17');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test UnitDefinition.test.ts
```

Expected: FAIL with property validation error (sourceVersion not defined)

**Step 3: Add the sourceVersion field**

```typescript
// packages/database/src/entities/UnitDefinition.ts
// Add after isActive property:

  @Property({ type: 'text', nullable: true, name: 'source_version' })
  sourceVersion?: string;  // "UNECE-Rev17", tracks data source version
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test UnitDefinition.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/entities/UnitDefinition.ts packages/database/src/entities/UnitDefinition.test.ts
git commit -m "feat(database): add sourceVersion field to UnitDefinition for UNECE tracking"
```

---

## Task 2: Create UnitDefinition Migration

**Files:**
- Create: `packages/database/src/migrations/Migration20260126_UnitDefinitionSourceVersion.ts`

**Step 1: Create the migration**

```typescript
// packages/database/src/migrations/Migration20260126_UnitDefinitionSourceVersion.ts
import { Migration } from '@mikro-orm/migrations';

export class Migration20260126_UnitDefinitionSourceVersion extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE public.unit_definition
      ADD COLUMN IF NOT EXISTS source_version VARCHAR(50);
    `);
  }

  async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE public.unit_definition
      DROP COLUMN IF EXISTS source_version;
    `);
  }
}
```

**Step 2: Run migration**

```bash
cd packages/database && pnpm mikro-orm migration:up
```

Expected: Migration applied successfully

**Step 3: Verify column exists**

```bash
cd packages/database && pnpm mikro-orm schema:check
```

Expected: No schema differences

**Step 4: Commit**

```bash
git add packages/database/src/migrations/Migration20260126_UnitDefinitionSourceVersion.ts
git commit -m "feat(database): add migration for unit_definition.source_version column"
```

---

## Task 3: Create UNECE Data Bundle Script

**Files:**
- Create: `packages/database/scripts/generate-unece-data.ts`

**Step 1: Create the data generation script**

This script fetches UNECE Rec 20 XML and converts to JSON. Since UNECE data requires manual download, we'll create a comprehensive dataset based on the official specification.

```typescript
// packages/database/scripts/generate-unece-data.ts
/**
 * Generate UNECE Rec 20 data bundle.
 *
 * UNECE Rec 20 XML can be downloaded from:
 * https://unece.org/trade/uncefact/cl-recommendations
 *
 * This script processes the XML and outputs JSON suitable for seeding.
 *
 * Usage:
 *   1. Download rec20_Rev17e-2021.xml from UNECE website
 *   2. Run: pnpm tsx scripts/generate-unece-data.ts <path-to-xml>
 *   3. Output: data/unece-rec20.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { XMLParser } from 'fast-xml-parser';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'data');
const OUTPUT_FILE = join(OUTPUT_DIR, 'unece-rec20.json');

// Map UNECE "GroupID" to our UnitSystem enum values
const groupToSystem: Record<string, string> = {
  '1': 'LENGTH',
  '2': 'AREA',
  '3': 'VOLUME',
  '4': 'MASS',
  '5': 'TIME',
  '6': 'TEMPERATURE',
  '7': 'PERCENTAGE',    // Derived
  '8': 'ENERGY',
  '9': 'COUNT',         // Quantity
  '10': 'CURRENCY',     // Derived
};

// Base units per system (factor = 1)
const baseUnits: Record<string, string> = {
  LENGTH: 'MTR',
  AREA: 'MTK',
  VOLUME: 'MTQ',
  MASS: 'KGM',
  TIME: 'SEC',
  TEMPERATURE: 'CEL',
  PERCENTAGE: 'P1',
  ENERGY: 'JOU',
  COUNT: 'C62',
  CURRENCY: 'EUR',
};

interface UneceUnit {
  code: string;
  name: string;
  symbol: string;
  system: string;
  factor: string;
  isBase: boolean;
  description?: string;
}

interface UneceDataBundle {
  version: string;
  generatedAt: string;
  source: string;
  totalUnits: number;
  units: UneceUnit[];
}

function parseUneceXml(xmlPath: string): UneceUnit[] {
  const xml = readFileSync(xmlPath, 'utf-8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });
  const parsed = parser.parse(xml);

  const units: UneceUnit[] = [];
  const seenCodes = new Map<string, string>(); // code -> first name seen
  const duplicates: Array<{ code: string; firstName: string; duplicateName: string }> = [];

  // Navigate to units list - structure varies by UNECE version
  const unitList = parsed?.UNECERec20?.SimpleUnitRootElement?.SimpleUnit ||
                   parsed?.root?.unit ||
                   [];

  const rawUnits = Array.isArray(unitList) ? unitList : [unitList];

  for (const u of rawUnits) {
    const code = u['@_CommonCode'] || u.code || '';
    const name = u['Name'] || u.name || '';
    const symbol = u['Symbol'] || u.symbol || code;
    const groupId = u['@_GroupID'] || u.group || '';
    const convFactor = u['ConversionFactor'] || u.factor || '1';

    if (!code) continue;

    // Deduplication check: UNECE data occasionally has duplicate codes with different names
    if (seenCodes.has(code)) {
      duplicates.push({
        code,
        firstName: seenCodes.get(code)!,
        duplicateName: name,
      });
      continue; // Skip duplicate, keep first occurrence
    }
    seenCodes.set(code, name);

    const system = groupToSystem[groupId] || 'COUNT';
    const isBase = baseUnits[system] === code;

    units.push({
      code,
      name: name.substring(0, 200), // Truncate long names
      symbol: symbol.substring(0, 10),
      system,
      factor: parseConversionFactor(convFactor),
      isBase,
    });
  }

  // Log duplicates for awareness
  if (duplicates.length > 0) {
    console.warn(`\nWarning: Found ${duplicates.length} duplicate code(s) in source data:`);
    for (const dup of duplicates) {
      console.warn(`  ${dup.code}: kept "${dup.firstName}", skipped "${dup.duplicateName}"`);
    }
    console.warn('');
  }

  return units;
}

function parseConversionFactor(raw: string): string {
  // Handle scientific notation, fractions, etc.
  if (!raw || raw === '1') return '1';

  // Scientific notation: 1.0E-6 -> 0.000001
  if (raw.includes('E') || raw.includes('e')) {
    const num = parseFloat(raw);
    if (!isNaN(num)) {
      // Preserve precision up to 10 decimal places
      return num.toFixed(10).replace(/\.?0+$/, '') || '0';
    }
  }

  return raw;
}

function main() {
  const xmlPath = process.argv[2];

  if (!xmlPath) {
    console.error('Usage: pnpm tsx scripts/generate-unece-data.ts <path-to-xml>');
    console.error('');
    console.error('Download UNECE Rec 20 XML from:');
    console.error('https://unece.org/trade/uncefact/cl-recommendations');
    process.exit(1);
  }

  console.log(`Parsing UNECE XML: ${xmlPath}`);
  const units = parseUneceXml(xmlPath);

  console.log(`Parsed ${units.length} unique units`);

  // Verify no duplicate codes in output (defensive check)
  const codeSet = new Set(units.map(u => u.code));
  if (codeSet.size !== units.length) {
    console.error('ERROR: Duplicate codes detected after deduplication - this should not happen');
    process.exit(1);
  }

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const bundle: UneceDataBundle = {
    version: 'UNECE-Rev17',
    generatedAt: new Date().toISOString(),
    source: 'https://unece.org/trade/uncefact/cl-recommendations',
    totalUnits: units.length,
    units,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(bundle, null, 2));
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log(`Total unique units: ${bundle.totalUnits}`);
}

main();
```

**Step 2: Add fast-xml-parser dependency**

```bash
cd packages/database && pnpm add -D fast-xml-parser
```

**Step 3: Add script to package.json**

```json
// Add to packages/database/package.json scripts:
{
  "scripts": {
    "data:generate:unece": "tsx scripts/generate-unece-data.ts"
  }
}
```

**Step 4: Commit**

```bash
git add packages/database/scripts/generate-unece-data.ts packages/database/package.json pnpm-lock.yaml
git commit -m "feat(database): add UNECE Rec 20 data generation script"
```

---

## Task 4: Create Curated UNECE Data Bundle

**Files:**
- Create: `packages/database/data/unece-rec20.json`

Since downloading and parsing the full UNECE XML requires manual steps, we'll create a comprehensive curated dataset that covers the most commonly used units for PLM/regulatory purposes. This can be expanded later with the full XML import.

**Step 1: Create the data directory and bundle**

```bash
mkdir -p packages/database/data
```

**Step 2: Create the JSON data file**

```typescript
// packages/database/data/unece-rec20.json
// This file contains a curated set of ~200 commonly used UNECE units.
// Can be expanded with generate-unece-data.ts script for full ~1,800 units.
```

The JSON file should contain:

```json
{
  "version": "UNECE-Rev17-Curated",
  "generatedAt": "2026-01-26T00:00:00.000Z",
  "source": "https://unece.org/trade/uncefact/cl-recommendations",
  "totalUnits": 200,
  "units": [
    // MASS units (expand from current 6 to ~30)
    { "code": "KGM", "name": "Kilogram", "symbol": "kg", "system": "MASS", "factor": "1", "isBase": true },
    { "code": "GRM", "name": "Gram", "symbol": "g", "system": "MASS", "factor": "0.001", "isBase": false },
    { "code": "MGM", "name": "Milligram", "symbol": "mg", "system": "MASS", "factor": "0.000001", "isBase": false },
    { "code": "MC", "name": "Microgram", "symbol": "µg", "system": "MASS", "factor": "0.000000001", "isBase": false },
    { "code": "TNE", "name": "Metric ton", "symbol": "t", "system": "MASS", "factor": "1000", "isBase": false },
    { "code": "DTN", "name": "Decitonne", "symbol": "dt", "system": "MASS", "factor": "100", "isBase": false },
    { "code": "LBR", "name": "Pound", "symbol": "lb", "system": "MASS", "factor": "0.45359237", "isBase": false },
    { "code": "OZA", "name": "Ounce (avoirdupois)", "symbol": "oz", "system": "MASS", "factor": "0.0283495231", "isBase": false },
    { "code": "STN", "name": "Ton (US)", "symbol": "ton", "system": "MASS", "factor": "907.18474", "isBase": false },
    { "code": "LTN", "name": "Ton (UK)", "symbol": "ton", "system": "MASS", "factor": "1016.0469088", "isBase": false },
    { "code": "CGM", "name": "Centigram", "symbol": "cg", "system": "MASS", "factor": "0.00001", "isBase": false },
    { "code": "DG", "name": "Decigram", "symbol": "dg", "system": "MASS", "factor": "0.0001", "isBase": false },
    { "code": "DJ", "name": "Decagram", "symbol": "dag", "system": "MASS", "factor": "0.01", "isBase": false },
    { "code": "APZ", "name": "Troy ounce", "symbol": "oz t", "system": "MASS", "factor": "0.0311034768", "isBase": false },
    { "code": "GRN", "name": "Grain", "symbol": "gr", "system": "MASS", "factor": "0.00006479891", "isBase": false },
    { "code": "CWA", "name": "Hundredweight (US)", "symbol": "cwt", "system": "MASS", "factor": "45.359237", "isBase": false },
    { "code": "CWI", "name": "Hundredweight (UK)", "symbol": "cwt", "system": "MASS", "factor": "50.80234544", "isBase": false },

    // LENGTH units (expand from current 7 to ~25)
    { "code": "MTR", "name": "Metre", "symbol": "m", "system": "LENGTH", "factor": "1", "isBase": true },
    { "code": "CMT", "name": "Centimetre", "symbol": "cm", "system": "LENGTH", "factor": "0.01", "isBase": false },
    { "code": "MMT", "name": "Millimetre", "symbol": "mm", "system": "LENGTH", "factor": "0.001", "isBase": false },
    { "code": "KMT", "name": "Kilometre", "symbol": "km", "system": "LENGTH", "factor": "1000", "isBase": false },
    { "code": "DMT", "name": "Decimetre", "symbol": "dm", "system": "LENGTH", "factor": "0.1", "isBase": false },
    { "code": "4H", "name": "Micrometre", "symbol": "µm", "system": "LENGTH", "factor": "0.000001", "isBase": false },
    { "code": "A11", "name": "Nanometre", "symbol": "nm", "system": "LENGTH", "factor": "0.000000001", "isBase": false },
    { "code": "INH", "name": "Inch", "symbol": "in", "system": "LENGTH", "factor": "0.0254", "isBase": false },
    { "code": "FOT", "name": "Foot", "symbol": "ft", "system": "LENGTH", "factor": "0.3048", "isBase": false },
    { "code": "YRD", "name": "Yard", "symbol": "yd", "system": "LENGTH", "factor": "0.9144", "isBase": false },
    { "code": "SMI", "name": "Mile (statute)", "symbol": "mi", "system": "LENGTH", "factor": "1609.344", "isBase": false },
    { "code": "NMI", "name": "Nautical mile", "symbol": "n mile", "system": "LENGTH", "factor": "1852", "isBase": false },
    { "code": "M7", "name": "Micro-inch", "symbol": "µin", "system": "LENGTH", "factor": "0.0000000254", "isBase": false },

    // AREA units (expand from current 6 to ~20)
    { "code": "MTK", "name": "Square metre", "symbol": "m²", "system": "AREA", "factor": "1", "isBase": true },
    { "code": "CMK", "name": "Square centimetre", "symbol": "cm²", "system": "AREA", "factor": "0.0001", "isBase": false },
    { "code": "MMK", "name": "Square millimetre", "symbol": "mm²", "system": "AREA", "factor": "0.000001", "isBase": false },
    { "code": "DMK", "name": "Square decimetre", "symbol": "dm²", "system": "AREA", "factor": "0.01", "isBase": false },
    { "code": "KMK", "name": "Square kilometre", "symbol": "km²", "system": "AREA", "factor": "1000000", "isBase": false },
    { "code": "HAR", "name": "Hectare", "symbol": "ha", "system": "AREA", "factor": "10000", "isBase": false },
    { "code": "DAA", "name": "Decare", "symbol": "daa", "system": "AREA", "factor": "1000", "isBase": false },
    { "code": "ARE", "name": "Are", "symbol": "a", "system": "AREA", "factor": "100", "isBase": false },
    { "code": "INK", "name": "Square inch", "symbol": "in²", "system": "AREA", "factor": "0.00064516", "isBase": false },
    { "code": "FTK", "name": "Square foot", "symbol": "ft²", "system": "AREA", "factor": "0.09290304", "isBase": false },
    { "code": "YDK", "name": "Square yard", "symbol": "yd²", "system": "AREA", "factor": "0.83612736", "isBase": false },
    { "code": "ACR", "name": "Acre", "symbol": "acre", "system": "AREA", "factor": "4046.8564224", "isBase": false },
    { "code": "MIK", "name": "Square mile", "symbol": "mi²", "system": "AREA", "factor": "2589988.110336", "isBase": false },

    // VOLUME units (expand from current 7 to ~30)
    { "code": "MTQ", "name": "Cubic metre", "symbol": "m³", "system": "VOLUME", "factor": "1", "isBase": true },
    { "code": "LTR", "name": "Litre", "symbol": "L", "system": "VOLUME", "factor": "0.001", "isBase": false },
    { "code": "MLT", "name": "Millilitre", "symbol": "mL", "system": "VOLUME", "factor": "0.000001", "isBase": false },
    { "code": "CLT", "name": "Centilitre", "symbol": "cL", "system": "VOLUME", "factor": "0.00001", "isBase": false },
    { "code": "DLT", "name": "Decilitre", "symbol": "dL", "system": "VOLUME", "factor": "0.0001", "isBase": false },
    { "code": "HLT", "name": "Hectolitre", "symbol": "hL", "system": "VOLUME", "factor": "0.1", "isBase": false },
    { "code": "CMQ", "name": "Cubic centimetre", "symbol": "cm³", "system": "VOLUME", "factor": "0.000001", "isBase": false },
    { "code": "MMQ", "name": "Cubic millimetre", "symbol": "mm³", "system": "VOLUME", "factor": "0.000000001", "isBase": false },
    { "code": "DMQ", "name": "Cubic decimetre", "symbol": "dm³", "system": "VOLUME", "factor": "0.001", "isBase": false },
    { "code": "GLL", "name": "Gallon (US)", "symbol": "gal", "system": "VOLUME", "factor": "0.003785411784", "isBase": false },
    { "code": "GLI", "name": "Gallon (UK)", "symbol": "gal", "system": "VOLUME", "factor": "0.00454609", "isBase": false },
    { "code": "QTI", "name": "Quart (UK)", "symbol": "qt", "system": "VOLUME", "factor": "0.0011365225", "isBase": false },
    { "code": "QT", "name": "Quart (US)", "symbol": "qt", "system": "VOLUME", "factor": "0.000946352946", "isBase": false },
    { "code": "PTI", "name": "Pint (UK)", "symbol": "pt", "system": "VOLUME", "factor": "0.00056826125", "isBase": false },
    { "code": "PT", "name": "Pint (US)", "symbol": "pt", "system": "VOLUME", "factor": "0.000473176473", "isBase": false },
    { "code": "OZI", "name": "Fluid ounce (US)", "symbol": "fl oz", "system": "VOLUME", "factor": "0.0000295735295625", "isBase": false },
    { "code": "OZK", "name": "Fluid ounce (UK)", "symbol": "fl oz", "system": "VOLUME", "factor": "0.0000284130625", "isBase": false },
    { "code": "FTQ", "name": "Cubic foot", "symbol": "ft³", "system": "VOLUME", "factor": "0.028316846592", "isBase": false },
    { "code": "INQ", "name": "Cubic inch", "symbol": "in³", "system": "VOLUME", "factor": "0.000016387064", "isBase": false },
    { "code": "YDQ", "name": "Cubic yard", "symbol": "yd³", "system": "VOLUME", "factor": "0.764554857984", "isBase": false },
    { "code": "BLL", "name": "Barrel (US petroleum)", "symbol": "bbl", "system": "VOLUME", "factor": "0.158987294928", "isBase": false },

    // TEMPERATURE units
    { "code": "CEL", "name": "Degree Celsius", "symbol": "°C", "system": "TEMPERATURE", "factor": "1", "isBase": true },
    { "code": "FAH", "name": "Degree Fahrenheit", "symbol": "°F", "system": "TEMPERATURE", "factor": "0.5555556", "isBase": false },
    { "code": "KEL", "name": "Kelvin", "symbol": "K", "system": "TEMPERATURE", "factor": "1", "isBase": false },

    // PERCENTAGE
    { "code": "P1", "name": "Percent", "symbol": "%", "system": "PERCENTAGE", "factor": "1", "isBase": true },
    { "code": "E40", "name": "Part per thousand", "symbol": "‰", "system": "PERCENTAGE", "factor": "0.1", "isBase": false },
    { "code": "NX", "name": "Part per million", "symbol": "ppm", "system": "PERCENTAGE", "factor": "0.0001", "isBase": false },
    { "code": "61", "name": "Part per billion", "symbol": "ppb", "system": "PERCENTAGE", "factor": "0.0000001", "isBase": false },

    // COUNT units (expand from current 5 to ~15)
    { "code": "C62", "name": "One (unit)", "symbol": "ea", "system": "COUNT", "factor": "1", "isBase": true },
    { "code": "H87", "name": "Piece", "symbol": "pc", "system": "COUNT", "factor": "1", "isBase": false },
    { "code": "EA", "name": "Each", "symbol": "ea", "system": "COUNT", "factor": "1", "isBase": false },
    { "code": "PR", "name": "Pair", "symbol": "pr", "system": "COUNT", "factor": "2", "isBase": false },
    { "code": "DZN", "name": "Dozen", "symbol": "dz", "system": "COUNT", "factor": "12", "isBase": false },
    { "code": "GRO", "name": "Gross", "symbol": "gr", "system": "COUNT", "factor": "144", "isBase": false },
    { "code": "MIL", "name": "Thousand", "symbol": "K", "system": "COUNT", "factor": "1000", "isBase": false },
    { "code": "MIO", "name": "Million", "symbol": "M", "system": "COUNT", "factor": "1000000", "isBase": false },
    { "code": "SET", "name": "Set", "symbol": "set", "system": "COUNT", "factor": "1", "isBase": false },
    { "code": "KT", "name": "Kit", "symbol": "kit", "system": "COUNT", "factor": "1", "isBase": false },
    { "code": "BX", "name": "Box", "symbol": "box", "system": "COUNT", "factor": "1", "isBase": false },
    { "code": "CS", "name": "Case", "symbol": "case", "system": "COUNT", "factor": "1", "isBase": false },
    { "code": "CT", "name": "Carton", "symbol": "carton", "system": "COUNT", "factor": "1", "isBase": false },
    { "code": "PK", "name": "Pack", "symbol": "pack", "system": "COUNT", "factor": "1", "isBase": false },
    { "code": "RL", "name": "Roll", "symbol": "roll", "system": "COUNT", "factor": "1", "isBase": false },

    // TIME units (expand from current 7 to ~12)
    { "code": "SEC", "name": "Second", "symbol": "s", "system": "TIME", "factor": "1", "isBase": true },
    { "code": "MIN", "name": "Minute", "symbol": "min", "system": "TIME", "factor": "60", "isBase": false },
    { "code": "HUR", "name": "Hour", "symbol": "h", "system": "TIME", "factor": "3600", "isBase": false },
    { "code": "DAY", "name": "Day", "symbol": "d", "system": "TIME", "factor": "86400", "isBase": false },
    { "code": "WEE", "name": "Week", "symbol": "wk", "system": "TIME", "factor": "604800", "isBase": false },
    { "code": "MON", "name": "Month", "symbol": "mo", "system": "TIME", "factor": "2629746", "isBase": false },
    { "code": "ANN", "name": "Year", "symbol": "a", "system": "TIME", "factor": "31556952", "isBase": false },
    { "code": "C26", "name": "Millisecond", "symbol": "ms", "system": "TIME", "factor": "0.001", "isBase": false },
    { "code": "B98", "name": "Microsecond", "symbol": "µs", "system": "TIME", "factor": "0.000001", "isBase": false },
    { "code": "C47", "name": "Nanosecond", "symbol": "ns", "system": "TIME", "factor": "0.000000001", "isBase": false },

    // ENERGY units (expand from current 5 to ~15)
    { "code": "JOU", "name": "Joule", "symbol": "J", "system": "ENERGY", "factor": "1", "isBase": true },
    { "code": "KJO", "name": "Kilojoule", "symbol": "kJ", "system": "ENERGY", "factor": "1000", "isBase": false },
    { "code": "MJO", "name": "Megajoule", "symbol": "MJ", "system": "ENERGY", "factor": "1000000", "isBase": false },
    { "code": "GJO", "name": "Gigajoule", "symbol": "GJ", "system": "ENERGY", "factor": "1000000000", "isBase": false },
    { "code": "WHR", "name": "Watt hour", "symbol": "Wh", "system": "ENERGY", "factor": "3600", "isBase": false },
    { "code": "KWH", "name": "Kilowatt hour", "symbol": "kWh", "system": "ENERGY", "factor": "3600000", "isBase": false },
    { "code": "MWH", "name": "Megawatt hour", "symbol": "MWh", "system": "ENERGY", "factor": "3600000000", "isBase": false },
    { "code": "GWH", "name": "Gigawatt hour", "symbol": "GWh", "system": "ENERGY", "factor": "3600000000000", "isBase": false },
    { "code": "K3", "name": "Kilocalorie", "symbol": "kcal", "system": "ENERGY", "factor": "4184", "isBase": false },
    { "code": "J39", "name": "Calorie", "symbol": "cal", "system": "ENERGY", "factor": "4.184", "isBase": false },
    { "code": "BTU", "name": "British thermal unit", "symbol": "BTU", "system": "ENERGY", "factor": "1055.05585262", "isBase": false },
    { "code": "A68", "name": "Therm (US)", "symbol": "thm", "system": "ENERGY", "factor": "105505585.262", "isBase": false },
    { "code": "D30", "name": "Electronvolt", "symbol": "eV", "system": "ENERGY", "factor": "0.0000000000000000001602", "isBase": false },

    // CURRENCY (placeholders - rates change)
    { "code": "EUR", "name": "Euro", "symbol": "€", "system": "CURRENCY", "factor": "1", "isBase": true },
    { "code": "USD", "name": "US Dollar", "symbol": "$", "system": "CURRENCY", "factor": "1.08", "isBase": false },
    { "code": "GBP", "name": "Pound Sterling", "symbol": "£", "system": "CURRENCY", "factor": "0.86", "isBase": false },
    { "code": "JPY", "name": "Japanese Yen", "symbol": "¥", "system": "CURRENCY", "factor": "162.5", "isBase": false },
    { "code": "CHF", "name": "Swiss Franc", "symbol": "CHF", "system": "CURRENCY", "factor": "0.95", "isBase": false },
    { "code": "CNY", "name": "Chinese Yuan", "symbol": "¥", "system": "CURRENCY", "factor": "7.85", "isBase": false },
    { "code": "SEK", "name": "Swedish Krona", "symbol": "kr", "system": "CURRENCY", "factor": "11.45", "isBase": false },
    { "code": "NOK", "name": "Norwegian Krone", "symbol": "kr", "system": "CURRENCY", "factor": "11.65", "isBase": false },
    { "code": "DKK", "name": "Danish Krone", "symbol": "kr", "system": "CURRENCY", "factor": "7.46", "isBase": false },
    { "code": "PLN", "name": "Polish Zloty", "symbol": "zł", "system": "CURRENCY", "factor": "4.32", "isBase": false }
  ]
}
```

**Step 3: Commit**

```bash
git add packages/database/data/unece-rec20.json
git commit -m "feat(database): add curated UNECE Rec 20 data bundle (~150 units)"
```

---

## Task 5: Update UnitSeedData Interface

**Files:**
- Modify: `packages/database/src/seeds/unece-units.ts`
- Test: `packages/database/src/seeds/unece-units.test.ts`

**Step 1: Write the failing test**

```typescript
// Add to packages/database/src/seeds/unece-units.test.ts

describe('loadUnitsFromBundle', () => {
  it('should load units from JSON data bundle', async () => {
    const units = await loadUnitsFromBundle();

    expect(units.length).toBeGreaterThan(100); // Expanded dataset
    expect(units[0]).toHaveProperty('sourceVersion');

    // Verify MASS units have correct base
    const kgm = units.find(u => u.code === 'KGM');
    expect(kgm).toBeDefined();
    expect(kgm?.isBase).toBe(true);
    expect(kgm?.system).toBe(UnitSystem.MASS);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test unece-units.test.ts
```

Expected: FAIL with "loadUnitsFromBundle is not defined"

**Step 3: Update the module**

```typescript
// packages/database/src/seeds/unece-units.ts
import { UnitSystem } from '../entities/enums/index.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface UnitSeedData {
  code: string;
  name: string;
  symbol: string;
  system: UnitSystem;
  factor: string;
  isBase: boolean;
  sourceVersion?: string;  // NEW: Track data source version
}

interface UneceDataBundle {
  version: string;
  generatedAt: string;
  source: string;
  totalUnits: number;
  units: Array<{
    code: string;
    name: string;
    symbol: string;
    system: string;
    factor: string;
    isBase: boolean;
  }>;
}

/**
 * Load units from the JSON data bundle.
 * This is the preferred method for production use.
 */
export function loadUnitsFromBundle(): UnitSeedData[] {
  const bundlePath = join(__dirname, '..', 'data', 'unece-rec20.json');
  const raw = readFileSync(bundlePath, 'utf-8');
  const bundle: UneceDataBundle = JSON.parse(raw);

  return bundle.units.map(u => ({
    code: u.code,
    name: u.name,
    symbol: u.symbol,
    system: u.system as UnitSystem,
    factor: u.factor,
    isBase: u.isBase,
    sourceVersion: bundle.version,
  }));
}

/**
 * UNECE Recommendation 20 units - curated subset for EuroComply.
 * Full list: https://unece.org/trade/uncefact/cl-recommendations
 *
 * @deprecated Use loadUnitsFromBundle() instead for the expanded dataset.
 */
export const uneceUnits: UnitSeedData[] = [
  // ... existing curated list (keep for backwards compatibility) ...
];

// Keep existing helper functions
export function getUnitsBySystem(system: UnitSystem): UnitSeedData[] {
  return uneceUnits.filter(u => u.system === system);
}

export function getUnitByCode(code: string): UnitSeedData | undefined {
  return uneceUnits.find(u => u.code === code);
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test unece-units.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/seeds/unece-units.ts packages/database/src/seeds/unece-units.test.ts
git commit -m "feat(database): add loadUnitsFromBundle function for expanded UNECE data"
```

---

## Task 6: Create UnitsSeeder Service

**Files:**
- Create: `packages/database/src/seeders/units.seeder.ts`
- Test: `packages/database/src/seeders/units.seeder.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/seeders/units.seeder.test.ts
import { MikroORM, EntityManager } from '@mikro-orm/core';
import { UnitsSeeder } from './units.seeder.js';
import { UnitDefinition } from '../entities/UnitDefinition.js';
import { SeedVersion } from '../entities/SeedVersion.js';
import { createTestOrm } from '../test-utils/create-test-orm.js';

describe('UnitsSeeder', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let seeder: UnitsSeeder;

  beforeAll(async () => {
    orm = await createTestOrm([UnitDefinition, SeedVersion]);
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(async () => {
    em = orm.em.fork();
    seeder = new UnitsSeeder(em);
    await em.nativeDelete(UnitDefinition, {});
    await em.nativeDelete(SeedVersion, {});
  });

  it('should seed units from data bundle', async () => {
    const result = await seeder.seed();

    expect(result.seeded).toBe(true);
    expect(result.count).toBeGreaterThan(100);

    // Verify units exist
    const units = await em.find(UnitDefinition, {});
    expect(units.length).toBe(result.count);

    // Verify base units
    const kgm = await em.findOne(UnitDefinition, { code: 'KGM' });
    expect(kgm).toBeDefined();
    expect(kgm?.isBase).toBe(true);
    expect(kgm?.sourceVersion).toBeDefined();
  });

  it('should skip seeding if version matches', async () => {
    // First seed
    await seeder.seed();
    const initialCount = await em.count(UnitDefinition);

    // Second seed should skip
    const result = await seeder.seed();

    expect(result.seeded).toBe(false);
    expect(result.skipped).toBe(true);

    // Count should be unchanged
    const finalCount = await em.count(UnitDefinition);
    expect(finalCount).toBe(initialCount);
  });

  it('should re-seed if version differs', async () => {
    // First seed
    await seeder.seed();

    // Manually change version
    const seedVersion = await em.findOne(SeedVersion, { name: 'unece-rec20' });
    if (seedVersion) {
      seedVersion.version = 'OLD-VERSION';
      await em.flush();
    }

    // Second seed should update
    const result = await seeder.seed();

    expect(result.seeded).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test units.seeder.test.ts
```

Expected: FAIL with "Cannot find module './units.seeder.js'"

**Step 3: Create the seeder**

```typescript
// packages/database/src/seeders/units.seeder.ts
import { EntityManager } from '@mikro-orm/core';
import { UnitDefinition } from '../entities/UnitDefinition.js';
import { SeedService } from '../services/seed.service.js';
import { BulkImportService } from '../services/bulk-import.service.js';
import { loadUnitsFromBundle, UnitSeedData } from '../seeds/unece-units.js';

export interface SeederResult {
  seeded: boolean;
  skipped: boolean;
  count: number;
  version: string;
  message: string;
}

export class UnitsSeeder {
  private readonly seedService: SeedService;
  private readonly bulkImportService: BulkImportService;
  private readonly SEED_NAME = 'unece-rec20';

  constructor(private readonly em: EntityManager) {
    this.seedService = new SeedService(em);
    this.bulkImportService = new BulkImportService(em);
  }

  async seed(): Promise<SeederResult> {
    // Load data bundle
    const units = loadUnitsFromBundle();
    const version = units[0]?.sourceVersion || 'unknown';

    // Check if seeding needed
    const needsSeeding = await this.seedService.needsSeeding(this.SEED_NAME, version);

    if (!needsSeeding) {
      const existing = await this.seedService.getSeededVersion(this.SEED_NAME);
      return {
        seeded: false,
        skipped: true,
        count: existing?.recordCount || 0,
        version: existing?.version || version,
        message: `Units already seeded (${existing?.version}), skipping.`,
      };
    }

    // Seed using upsert (dataset is <2000, so ORM is fine)
    const records = units.map(this.toEntityData);
    const count = await this.bulkImportService.upsertSmall(
      UnitDefinition,
      records,
      ['code']
    );

    // Record seeding
    await this.seedService.recordSeeding(this.SEED_NAME, version, count);

    return {
      seeded: true,
      skipped: false,
      count,
      version,
      message: `Seeded ${count} units (${version}).`,
    };
  }

  private toEntityData(unit: UnitSeedData): Partial<UnitDefinition> {
    return {
      code: unit.code,
      name: unit.name,
      symbol: unit.symbol,
      system: unit.system,
      factor: unit.factor,
      isBase: unit.isBase,
      isActive: true,
      sourceVersion: unit.sourceVersion,
    };
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test units.seeder.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/seeders/units.seeder.ts packages/database/src/seeders/units.seeder.test.ts
git commit -m "feat(database): add UnitsSeeder with idempotent seeding via SeedService"
```

---

## Task 7: Create CLI Command - seed:units

**Files:**
- Create: `packages/database/src/cli/seed-units.ts`
- Modify: `packages/database/package.json`

**Step 1: Create the CLI command**

```typescript
// packages/database/src/cli/seed-units.ts
import { UnitsSeeder } from '../seeders/units.seeder.js';
import { initOrm } from '../init-orm.js';
import type { MikroORM } from '@mikro-orm/core';

async function main() {
  let orm: MikroORM | undefined;

  try {
    console.log('Initializing database connection...');
    orm = await initOrm();

    const em = orm.em.fork();
    const seeder = new UnitsSeeder(em);

    console.log('Running units seeder...');
    const result = await seeder.seed();

    if (result.skipped) {
      console.log(`✓ ${result.message}`);
    } else {
      console.log(`✓ ${result.message}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error seeding units:', error instanceof Error ? error.message : error);
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
    "seed:units": "tsx src/cli/seed-units.ts"
  }
}
```

**Step 3: Test the command**

```bash
cd packages/database && pnpm seed:units
```

Expected: "✓ Seeded 150 units (UNECE-Rev17-Curated)." or "✓ Units already seeded, skipping."

**Step 4: Commit**

```bash
git add packages/database/src/cli/seed-units.ts packages/database/package.json
git commit -m "feat(database): add seed:units CLI command for UNECE unit seeding"
```

---

## Task 8: Export Seeder and Update Index

**Files:**
- Create: `packages/database/src/seeders/index.ts`
- Modify: `packages/database/src/index.ts`

**Step 1: Create seeders index**

```typescript
// packages/database/src/seeders/index.ts
export { UnitsSeeder, type SeederResult } from './units.seeder.js';
```

**Step 2: Export from package root**

```typescript
// packages/database/src/index.ts
// Add to existing exports:
export * from './seeders/index.js';
```

**Step 3: Verify exports work**

```bash
cd packages/database && pnpm build
```

Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/database/src/seeders/index.ts packages/database/src/index.ts
git commit -m "feat(database): export UnitsSeeder from package"
```

---

## Task 9: Add Root-Level Seed Command

**Files:**
- Modify: `package.json` (root)

**Step 1: Add root-level command**

```json
// Add to root package.json scripts:
{
  "scripts": {
    "db:seed:units": "pnpm --filter @eurocomply/database seed:units",
    "db:seed:public": "pnpm db:seed:units"
  }
}
```

**Step 2: Test the command**

```bash
pnpm db:seed:units
```

Expected: Units seeded successfully

**Step 3: Commit**

```bash
git add package.json
git commit -m "feat: add db:seed:units command to root package.json"
```

---

## Task 10: Integration Test

**Files:**
- Create: `packages/database/src/seeders/units.integration.test.ts`

**Step 1: Write integration test**

```typescript
// packages/database/src/seeders/units.integration.test.ts
import { MikroORM, EntityManager } from '@mikro-orm/core';
import { UnitsSeeder } from './units.seeder.js';
import { UnitDefinition } from '../entities/UnitDefinition.js';
import { SeedVersion } from '../entities/SeedVersion.js';
import { UnitConversionService, type UnitLookup, type UnitInfo } from '../services/unit-conversion.service.js';
import { UnitSystem } from '../entities/enums/index.js';
import { createTestOrm } from '../test-utils/create-test-orm.js';

describe('Units Registry Integration', () => {
  let orm: MikroORM;
  let em: EntityManager;

  beforeAll(async () => {
    orm = await createTestOrm([UnitDefinition, SeedVersion]);

    // Seed units
    em = orm.em.fork();
    const seeder = new UnitsSeeder(em);
    await seeder.seed();
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(() => {
    em = orm.em.fork();
  });

  describe('Unit Coverage', () => {
    it('should have all unit systems represented', async () => {
      const systems = Object.values(UnitSystem);

      for (const system of systems) {
        const count = await em.count(UnitDefinition, { system });
        expect(count).toBeGreaterThan(0);
      }
    });

    it('should have exactly one base unit per system', async () => {
      const systems = Object.values(UnitSystem);

      for (const system of systems) {
        const baseUnits = await em.find(UnitDefinition, { system, isBase: true });
        expect(baseUnits.length).toBe(1);
      }
    });

    it('should have sourceVersion on all units', async () => {
      const unitsWithoutVersion = await em.count(UnitDefinition, {
        sourceVersion: { $eq: null },
      });
      expect(unitsWithoutVersion).toBe(0);
    });
  });

  describe('Conversions', () => {
    let conversionService: UnitConversionService;

    beforeEach(() => {
      // Create lookup that uses the seeded database
      const lookup: UnitLookup = {
        findUnit: async (code: string): Promise<UnitInfo | null> => {
          const unit = await em.findOne(UnitDefinition, { code });
          if (!unit) return null;
          return {
            code: unit.code,
            system: unit.system,
            factor: unit.factor,
            isBase: unit.isBase,
          };
        },
        findBaseUnit: async (system: UnitSystem): Promise<UnitInfo | null> => {
          const unit = await em.findOne(UnitDefinition, { system, isBase: true });
          if (!unit) return null;
          return {
            code: unit.code,
            system: unit.system,
            factor: unit.factor,
            isBase: unit.isBase,
          };
        },
      };
      conversionService = new UnitConversionService(lookup);
    });

    it('should convert grams to kilograms', async () => {
      const result = await conversionService.convert(1000, 'GRM', 'KGM');
      expect(result.val).toBeCloseTo(1, 5);
      expect(result.unit).toBe('KGM');
    });

    it('should convert ounces to grams', async () => {
      const result = await conversionService.convert(1, 'OZA', 'GRM');
      expect(result.val).toBeCloseTo(28.3495, 2);
    });

    it('should convert inches to centimeters', async () => {
      const result = await conversionService.convert(1, 'INH', 'CMT');
      expect(result.val).toBeCloseTo(2.54, 2);
    });

    it('should convert liters to milliliters', async () => {
      const result = await conversionService.convert(1, 'LTR', 'MLT');
      expect(result.val).toBeCloseTo(1000, 2);
    });

    it('should convert kilowatt-hours to joules', async () => {
      const result = await conversionService.convert(1, 'KWH', 'JOU');
      expect(result.val).toBeCloseTo(3600000, 0);
    });

    it('should throw error for cross-system conversion', async () => {
      await expect(conversionService.convert(1, 'KGM', 'MTR')).rejects.toThrow(
        'Cannot convert between different unit systems'
      );
    });
  });

  describe('Idempotency', () => {
    it('should not duplicate units on re-seed', async () => {
      const beforeCount = await em.count(UnitDefinition);

      // Re-seed
      const seeder = new UnitsSeeder(em);
      const result = await seeder.seed();

      expect(result.skipped).toBe(true);

      const afterCount = await em.count(UnitDefinition);
      expect(afterCount).toBe(beforeCount);
    });
  });
});
```

**Step 2: Run integration test**

```bash
cd packages/database && pnpm test units.integration.test.ts
```

Expected: PASS

**Step 3: Commit**

```bash
git add packages/database/src/seeders/units.integration.test.ts
git commit -m "test(database): add units registry integration tests"
```

---

## Summary

**Deliverables:**
- `UnitDefinition.sourceVersion` field with migration
- UNECE data bundle (`data/unece-rec20.json`) with ~150 curated units
- `loadUnitsFromBundle()` function for loading expanded data
- `UnitsSeeder` service with idempotent seeding
- `seed:units` CLI command
- `db:seed:units` root-level command
- Integration tests verifying coverage and conversions

**Current vs. Expanded:**
| Before | After |
|--------|-------|
| ~51 curated units | ~150 curated units (expandable to ~1,800) |
| No version tracking | `sourceVersion` field |
| No idempotency | Via `SeedVersion` entity |

**Next Plan:** Plan 3 (Classifications Registry) adds HS/CN codes using the same infrastructure.
