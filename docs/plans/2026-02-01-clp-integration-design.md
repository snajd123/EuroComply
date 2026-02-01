# CLP Annex VI Integration Design

> **For Claude:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Integrate EU CLP (Classification, Labelling and Packaging) Annex VI harmonised classifications into the GSR, enabling hazard screening, CMR flagging, and professional labeling support.

**Architecture:** Three-layer approach - Reference Data (static hazard classes + H-statements), Substance Classifications (parsed from ECHA), Validation Layer (whitelist-only ingestion).

**Tech Stack:** TypeScript, MikroORM, XLSX parser, mhchem/hpstatements for H-statement translations.

---

## Data Sources

| Source | Purpose | Format |
|--------|---------|--------|
| [mhchem/hpstatements](https://github.com/mhchem/hpstatements) | H-statement text in 24 EU languages | JSON |
| [UNECE GHS Rev 7 Annex 3](https://unece.org/DAM/trans/danger/publi/ghs/ghs_rev07/English/06e_annex3.pdf) | Official hazard class definitions | PDF (manual extraction) |
| ECHA Harmonised List (4,762 substances) | Substance → Classification mappings | XLSX |

---

## Entity Design

### 1. HazardClass (Reference Table - ~35 entries)

The "Engineering Dictionary" that maps cryptic codes to professional metadata.

```typescript
@Entity({ tableName: 'hazard_class', schema: 'public' })
export class HazardClass {
  @PrimaryKey()
  code!: string;  // "Carc.", "Muta.", "Acute Tox."

  @Property()
  fullName!: string;  // "Carcinogenicity"

  @Enum(() => HazardType)
  hazardType!: HazardType;  // PHYSICAL | HEALTH | ENVIRONMENTAL

  @Property({ nullable: true })
  pictogram?: string;  // "GHS08"

  @Enum(() => SignalWord)
  @Property({ nullable: true })
  signalWord?: SignalWord;  // DANGER | WARNING

  @Property()
  isCmr!: boolean;  // Quick filter for Carcinogenic/Mutagenic/Reprotoxic
}

export enum HazardType {
  PHYSICAL = 'PHYSICAL',
  HEALTH = 'HEALTH',
  ENVIRONMENTAL = 'ENVIRONMENTAL',
}

export enum SignalWord {
  DANGER = 'DANGER',
  WARNING = 'WARNING',
}
```

### 2. HazardStatement (Reference Table - ~120 entries)

Multi-language H-statement text from mhchem repository.

```typescript
@Entity({ tableName: 'hazard_statement', schema: 'public' })
export class HazardStatement {
  @PrimaryKey()
  code!: string;  // "H350", "H340", "H300"

  @Property({ type: 'jsonb' })
  translations!: Record<string, string>;  // { "en": "May cause cancer", "de": "Kann Krebs erzeugen" }

  @ManyToOne(() => HazardClass, { nullable: true })
  primaryHazardClass?: HazardClass;  // The main class this H-code belongs to
}
```

### 3. SubstanceHazardClassification (Junction Table)

Links substances to their harmonised classifications with full regulatory context.

```typescript
@Entity({ tableName: 'substance_hazard_classification', schema: 'public' })
export class SubstanceHazardClassification extends BaseEntity {
  @ManyToOne(() => Substance)
  substance!: Substance;

  @ManyToOne(() => HazardClass)
  hazardClass!: HazardClass;

  @Property()
  category!: string;  // "1A", "1B", "2", "3", "4"

  @Property()
  hCode!: string;  // "H350", "H350i"

  @Property({ type: 'array', nullable: true })
  notes?: string[];  // ["Note A", "Note 10"] - legal context modifiers

  @Property({ type: 'jsonb', nullable: true })
  sclLogic?: {  // Specific Concentration Limit for mixture math
    operator: 'gte' | 'gt' | 'lte' | 'lt' | 'between';
    value: number;
    valueTo?: number;  // For 'between' operator
    unit: 'PERCENT' | 'PPM';
  };

  @Property({ nullable: true })
  mFactor?: number;  // M-factor for aquatic hazards

  @Property()
  atpSource!: string;  // "ATP21", "CLP00" - regulatory traceability

  @Property()
  validFrom!: Date;

  @Property({ nullable: true })
  validTo?: Date;  // null = still active
}
```

### 4. Substance Entity Extension

Add CLP identity fields to existing Substance entity.

```typescript
// Add to packages/database/src/entities/Substance.ts

@Property({ length: 20, nullable: true, name: 'index_number' })
@Index()
indexNumber?: string;  // "001-001-00-9" - CLP Index (legal stability anchor)

@Property({ length: 20, nullable: true, name: 'clp_version' })
clpVersion?: string;  // "ATP21" - last ATP applied to this substance
```

---

## Parser Design

### Hazard String Transformation Pipeline

```
Input: "Carc. 1B, H350\nMuta. 1B, H340\nAcute Tox. 4*, H302"

Step 1: Split by newline
  → ["Carc. 1B, H350", "Muta. 1B, H340", "Acute Tox. 4*, H302"]

Step 2: Regex parse each statement
  Pattern: /^([A-Za-z\.\s]+?)\s*(\d[A-Z]?)(\**)?(?:,\s*)?(H\d+\w*)?(.*)$/
  Groups: [classPrefix] [category] [asterisks] [hCode] [extras]

Step 3: Validate against HazardClass whitelist
  ✓ "Carc." → found in dictionary
  ✗ "." → NOT found, skip with warning

Step 4: Normalize and output
  {
    hazardClass: "Carc.",
    category: "1B",
    hCode: "H350",
    notes: [],
    isMinimumClassification: false
  }
```

### Edge Cases

| Raw Format | Challenge | Solution |
|------------|-----------|----------|
| `Acute Tox. 4*` | Asterisk = minimum classification | Store flag, don't include `*` in category |
| `Press. Gas` | No category, no H-code | Allow null category and hCode |
| `H350i` | Suffix on H-code (route) | Store full code including suffix |
| `Skin Sens. 1A` | Letter suffix on category | Category = "1A" (string, not int) |
| `Repr. 1B, H360FD` | Combined codes | Store as-is, H360FD is valid |
| `.` or whitespace | Garbage data | Whitelist validation rejects |

### Validation Whitelist

```typescript
// Only accept hazard classes that exist in our verified dictionary
function parseHazardClassification(raw: string, dictionary: Map<string, HazardClass>): ParsedClassification | null {
  const match = raw.match(HAZARD_REGEX);
  if (!match) return null;

  const classPrefix = normalizeClassPrefix(match[1]);

  if (!dictionary.has(classPrefix)) {
    logger.warn(`Unknown hazard class ignored: "${classPrefix}" from "${raw}"`);
    return null;  // Whitelist validation - skip unknown classes
  }

  return {
    hazardClass: classPrefix,
    category: match[2] || null,
    isMinimumClassification: (match[3] || '').includes('*'),
    hCode: match[4] || null,
    additionalInfo: match[5]?.trim() || null,
  };
}
```

---

## Implementation Tasks

### Task 7.1: Extend Substance Entity

**Files:**
- Modify: `packages/database/src/entities/Substance.ts`

Add `indexNumber` and `clpVersion` fields with proper indexes.

---

### Task 7.2: Create HazardClass Entity + Seed Data

**Files:**
- Create: `packages/gsr/src/entities/HazardClass.ts`
- Create: `packages/gsr/src/reference-data/hazard-classes.ts`
- Create: `packages/gsr/src/seeders/hazard-class.seeder.ts`
- Update: `packages/gsr/src/entities/index.ts`

Seed ~35 hazard classes with verified data from UNECE GHS.

**Reference data structure:**
```typescript
export const HAZARD_CLASSES: HazardClassDefinition[] = [
  // Physical Hazards
  { code: 'Expl.', fullName: 'Explosives', hazardType: 'PHYSICAL', pictogram: 'GHS01', signalWord: 'DANGER', isCmr: false },
  { code: 'Flam. Gas', fullName: 'Flammable Gases', hazardType: 'PHYSICAL', pictogram: 'GHS02', signalWord: 'DANGER', isCmr: false },
  // ... etc

  // Health Hazards (CMR)
  { code: 'Carc.', fullName: 'Carcinogenicity', hazardType: 'HEALTH', pictogram: 'GHS08', signalWord: 'DANGER', isCmr: true },
  { code: 'Muta.', fullName: 'Germ Cell Mutagenicity', hazardType: 'HEALTH', pictogram: 'GHS08', signalWord: 'DANGER', isCmr: true },
  { code: 'Repr.', fullName: 'Reproductive Toxicity', hazardType: 'HEALTH', pictogram: 'GHS08', signalWord: 'DANGER', isCmr: true },
  // ... etc
];
```

---

### Task 7.3: Create HazardStatement Entity + Ingest mhchem Data

**Files:**
- Create: `packages/gsr/src/entities/HazardStatement.ts`
- Create: `packages/gsr/src/parsers/h-statement.parser.ts`
- Create: `packages/gsr/src/seeders/hazard-statement.seeder.ts`
- Download: `packages/gsr/data/hpstatements-en-latest.json` (from mhchem repo)

Ingest H-statements with multi-language support.

---

### Task 7.4: Create SubstanceHazardClassification Entity

**Files:**
- Create: `packages/gsr/src/entities/SubstanceHazardClassification.ts`
- Update: `packages/gsr/src/entities/index.ts`

Junction table linking substances to their classifications.

---

### Task 7.5: Build CLP Parser

**Files:**
- Create: `packages/gsr/src/parsers/clp-classification.parser.ts`
- Create: `packages/gsr/src/parsers/clp-classification.parser.test.ts`

Parse the "Hazard class, category and statement code(s)" column with:
- Regex extraction
- Whitelist validation against HazardClass dictionary
- Edge case handling (asterisks, suffixes, missing data)

---

### Task 7.6: Build CLP Seeder

**Files:**
- Create: `packages/gsr/src/seeders/clp-harmonised.seeder.ts`
- Create: `packages/gsr/src/seeders/clp-harmonised.seeder.test.ts`

Ingest Harmonised List XLSX:
- Link to existing substances by CAS/EC number
- Create SubstanceHazardClassification records
- Update Substance.indexNumber and Substance.clpVersion

---

### Task 7.7: CLI Commands

**Files:**
- Update: `packages/gsr/src/cli/seed.ts`
- Update: `packages/gsr/src/cli/index.ts`

Add commands:
```bash
pnpm gsr seed clp-reference      # Seeds HazardClass + HazardStatement
pnpm gsr seed clp-harmonised <file>  # Seeds SubstanceHazardClassification
```

---

## Verification

After implementation:

```bash
# Build
cd packages/gsr && pnpm build

# Seed reference data
pnpm gsr seed clp-reference

# Seed harmonised classifications
pnpm gsr seed clp-harmonised ./data/Harmonised_List_2026-02-01\ 17_42_11.xlsx

# Verify
docker exec eurocomply-postgres psql -U postgres -d eurocomply -c "
  SELECT hc.code, hc.full_name, hc.is_cmr, COUNT(shc.id) as substances
  FROM hazard_class hc
  LEFT JOIN substance_hazard_classification shc ON shc.hazard_class_code = hc.code
  GROUP BY hc.code, hc.full_name, hc.is_cmr
  ORDER BY substances DESC
  LIMIT 20;
"
```

---

## Future Enhancements

1. **SCL Parser**: Extract Specific Concentration Limits from Annex VI notes
2. **M-Factor Parser**: Extract aquatic M-factors from classification text
3. **Time Machine**: Query classifications as of a specific ATP version
4. **Label Generator**: Generate GHS labels using pictograms and H-statements
5. **Mixture Calculator**: Apply SCLs to calculate mixture classifications

---

**Last Updated:** 2026-02-01
