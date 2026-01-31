# Global Substance Registry (GSR) Design

> **Status:** DESIGN
> **Supersedes:** taxonomy-04-substance-registry.md (partial)
> **Related:** taxonomy-10-regulatory-list-registry.md, ai-regulation-ingestor-design.md

**Goal:** Build a comprehensive substance registry seeded from authoritative public sources (ECHA, PubChem), with identity resolution that handles nomenclature variations, structured regulatory requirement linking, and conflict detection.

**Architecture:** PostgreSQL-only. Schema designed to accommodate graph-like queries via proper indexing and junction tables. Neo4j remains a future option if relationship traversal becomes a bottleneck.

**Tech Stack:** MikroORM, PostgreSQL, pg_trgm extension, TypeScript

---

## 1. Problem Statement

### Current State

| Aspect | Reality | Problem |
|--------|---------|---------|
| Seeded substances | 22 from `echa-substances.json` | Insufficient coverage |
| Unused data | 2,242-row CSV exists but never loaded | Wasted effort |
| Identity resolution | Exact CAS match only | No fuzzy matching for name variations |
| Regulatory status | Boolean flags on Substance | Can't represent same substance with different status across lists |
| Fallback behavior | Stores raw CAS string if lookup fails | Silent failures, no audit trail |

### Requirements

1. **Data quality** - Seed from authoritative sources (~106k substances from ECHA EC Inventory)
2. **Identity resolution** - Match extracted substances to master records via CAS, EC, aliases, or fuzzy matching
3. **Multi-list support** - Same substance can have different regulatory status across jurisdictions/lists
4. **Graceful unknowns** - Queue unresolved substances for review rather than silent failure
5. **Conflict detection** - Flag threshold/scope conflicts before publishing

---

## 2. Data Sources

### Phase 1: Free Sources (EU-focused)

| Source | Records | Identifier | What It Provides | Access Method |
|--------|---------|------------|------------------|---------------|
| ECHA EC Inventory | ~106k | EC Number | EU substance identity, CAS cross-reference | ECHA CHEM bulk download (CSV) |
| ECHA SVHC List | ~250 | EC/CAS | Candidate list status, inclusion dates | ECHA download (CSV/Excel) |
| ECHA Annex XVII | ~80 entries | EC/CAS | Restriction conditions, thresholds, scopes | ECHA download (CSV) |
| PubChem | Millions | CID/CAS | Synonyms, IUPAC names, molecular data | PUG-REST API (5 req/sec) |

### Future: Paid Sources

| Source | Records | Access |
|--------|---------|--------|
| GADSL | ~13k | Commercial license via GASG |
| IEC 62474 | ~200 groups | Standard purchase from IEC |
| ChemSpider | Curated synonyms | RSC negotiation |
| EPA TSCA | ~87k | Free (add when US market needed) |
| OEHHA Prop 65 | ~1k | Free (add when US market needed) |

---

## 3. Data Ingestion Strategy

### CLI Commands

```bash
# Substance registry seeding
pnpm gsr:seed:echa-inventory    # Downloads EC Inventory (~106k substances)
pnpm gsr:seed:echa-svhc         # Downloads SVHC Candidate List
pnpm gsr:seed:echa-annex-xvii   # Downloads Annex XVII restrictions

# Enrichment (run after base seeding)
pnpm gsr:enrich:pubchem         # Adds synonyms, IUPAC names, molecular data

# All-in-one
pnpm gsr:seed:all               # Runs all seeders in correct order
```

### Seeder Behavior

Each seeder:

1. **Download** - Fetch from official URL (CSV/Excel/XML)
2. **Parse** - Normalize to common internal format
3. **Upsert** - Insert new, update existing (by CAS/EC number)
4. **Track version** - Store `sourceVersion` and `lastSyncedAt` in RegistrySource

### Update Frequency

Manual/on-demand. Regulatory lists don't change frequently:
- SVHC: Every 6 months
- Annex XVII: Ad-hoc amendments
- EC Inventory: Periodic updates

---

## 4. Schema Design

### 4.1 Core Entities

```
┌─────────────────────────────────────────────────────────────────┐
│                         Substance                                │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)                                                          │
│ casNumber (unique, indexed) ──────── Primary identifier          │
│ ecNumber (unique, indexed)  ──────── EU identifier               │
│ primaryName (indexed)                                            │
│ iupacName                                                        │
│ molecularFormula                                                 │
│ molecularWeight                                                  │
│ smiles                       ──────── Chemical structure string  │
│ inchiKey                     ──────── Structure hash for matching│
│ isActive                                                         │
│ createdAt, updatedAt                                             │
└─────────────────────────────────────────────────────────────────┘
          │
          │ 1:many
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SubstanceAlias                              │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)                                                          │
│ substanceId (FK)                                                 │
│ name (indexed, trigram index) ────── For pg_trgm fuzzy search   │
│ nameNormalized (indexed)      ────── Lowercase, stripped         │
│ type (IUPAC|COMMON|TRADE|SYNONYM|INDEX_NAME)                     │
│ source (PUBCHEM|ECHA|EPA|MANUAL)                                 │
│ language                                                         │
│ unique(substanceId, nameNormalized)                              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     RegistrySource                               │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)                                                          │
│ name (ECHA_EC|ECHA_SVHC|TSCA|PROP65|PUBCHEM)                    │
│ version                      ──────── e.g., "2026-01"            │
│ lastSyncedAt                                                     │
│ recordCount                                                      │
│ sourceUrl                                                        │
└─────────────────────────────────────────────────────────────────┘
```

**Key Changes from Current:**
- Added `smiles`, `inchiKey` for structure-based matching
- Added `nameNormalized` to aliases for consistent lookups
- Added `source` to aliases for provenance tracking
- Added `RegistrySource` to track data lineage
- Added `parentSubstanceId` for group-to-individual inheritance
- **Removed** regulatory boolean flags (`isSvhc`, `requiresAuthorization`, `isRestricted`) - moved to SubstanceListEntry

### 4.2 Substance Groups (Chemical Families)

Many regulations restrict entire groups (e.g., "Lead and its compounds" in REACH Annex XVII Entry 63). We need group-to-individual inheritance.

```
┌─────────────────────────────────────────────────────────────────┐
│                      SubstanceGroup                              │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)                                                          │
│ code (unique)          ──────── "LEAD_COMPOUNDS", "PFAS"         │
│ name                   ──────── "Lead and its compounds"         │
│ description                                                      │
│ parentGroupId (FK, nullable) ── For nested groups (rare)         │
└─────────────────────────────────────────────────────────────────┘
          │
          │ many:many
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                   SubstanceGroupMember                           │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)                                                          │
│ groupId (FK, indexed)                                            │
│ substanceId (FK, indexed)                                        │
│ inheritanceType        ──────── "EXPLICIT" | "DERIVED"           │
│ notes                  ──────── e.g., "Inorganic lead compound"  │
│ unique(groupId, substanceId)                                     │
└─────────────────────────────────────────────────────────────────┘
```

**Inheritance Logic:**

When a `SubstanceListEntry` references a group (via new `substanceGroupId` field), the restriction applies to ALL member substances:

```typescript
// Check if substance is restricted (direct OR via group)
async function isSubstanceRestricted(
  substanceId: string,
  regulatoryListId: string
): Promise<SubstanceListEntry | null> {
  // 1. Check direct entry
  const direct = await em.findOne(SubstanceListEntry, {
    substanceId,
    regulatoryListId,
  });
  if (direct) return direct;

  // 2. Check group membership
  const groupMemberships = await em.find(SubstanceGroupMember, { substanceId });
  const groupIds = groupMemberships.map(m => m.groupId);

  const groupEntry = await em.findOne(SubstanceListEntry, {
    substanceGroupId: { $in: groupIds },
    regulatoryListId,
  });
  return groupEntry;
}
```

**SubstanceListEntry Update:**

```
┌─────────────────────────────────────────────────────────────────┐
│                   SubstanceListEntry                             │
├─────────────────────────────────────────────────────────────────┤
│ ...existing fields...                                            │
│ substanceId (FK, nullable)      ──── Individual substance        │
│ substanceGroupId (FK, nullable) ──── OR group reference          │
│ CHECK (substanceId IS NOT NULL OR substanceGroupId IS NOT NULL)  │
└─────────────────────────────────────────────────────────────────┘
```

**Seeding Groups:**

ECHA provides group definitions. The seeder will:
1. Create SubstanceGroup for "Lead and its compounds"
2. Query EC Inventory for substances with "lead" in name or matching formula patterns
3. Create SubstanceGroupMember links with `inheritanceType: 'DERIVED'`
4. Allow manual additions with `inheritanceType: 'EXPLICIT'`

### 4.3 Regulatory Linking

```
┌─────────────────────────────────────────────────────────────────┐
│                      RegulatoryList                              │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)                                                          │
│ code (unique)          ──────── "REACH_SVHC", "REACH_ANNEX_XVII" │
│ name                   ──────── "SVHC Candidate List"            │
│ jurisdiction           ──────── "EU", "US_CA", "US_FED"          │
│ publisher              ──────── "ECHA", "EPA", "OEHHA"           │
│ description                                                      │
│ sourceUrl                                                        │
│ version                                                          │
│ lastUpdatedAt                                                    │
└─────────────────────────────────────────────────────────────────┘
          │
          │ 1:many
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                   SubstanceListEntry                             │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)                                                          │
│ substanceId (FK, indexed)                                        │
│ regulatoryListId (FK, indexed)                                   │
│ status               ──────── "LISTED", "RESTRICTED", "BANNED"   │
│ listingDate                                                      │
│ effectiveDate                                                    │
│ sunsetDate                                                       │
│ threshold            ──────── 0.1                                │
│ thresholdUnit        ──────── "PERCENT_BY_WEIGHT"                │
│ thresholdOperator    ──────── "LT", "LTE"                        │
│ scopes (array)       ──────── ProductScope[] (enum array)        │
│ scopeRaw             ──────── Original extracted text            │
│ conditions (jsonb)   ──────── Structured exemptions/conditions   │
│ sourceReference      ──────── "Annex XVII Entry 63"              │
│ unique(substanceId, regulatoryListId, scopes)                    │
└─────────────────────────────────────────────────────────────────┘
```

**Benefits:**
- Same substance can have different status across jurisdictions/lists
- Thresholds and conditions are explicit, not buried in text
- Easy to query: "All substances restricted in EU with threshold < 0.1%"
- Conflict detection via SQL: same substance + overlapping scope + different thresholds

### 4.3 Product Scope Taxonomy

```typescript
enum ProductScope {
  // Top-level
  ALL_PRODUCTS = 'ALL_PRODUCTS',
  CONSUMER_GOODS = 'CONSUMER_GOODS',
  INDUSTRIAL = 'INDUSTRIAL',

  // Consumer sub-categories
  TOYS = 'TOYS',
  CHILDCARE_ARTICLES = 'CHILDCARE_ARTICLES',
  JEWELRY = 'JEWELRY',
  COSMETICS = 'COSMETICS',
  FOOD_CONTACT = 'FOOD_CONTACT',
  TEXTILES = 'TEXTILES',
  FURNITURE = 'FURNITURE',

  // Electronics
  EEE = 'EEE',                    // Electrical & Electronic Equipment
  BATTERIES = 'BATTERIES',
  CABLES = 'CABLES',

  // Automotive
  VEHICLES = 'VEHICLES',
  VEHICLE_COMPONENTS = 'VEHICLE_COMPONENTS',

  // Construction
  CONSTRUCTION_PRODUCTS = 'CONSTRUCTION_PRODUCTS',
  PAINTS_COATINGS = 'PAINTS_COATINGS',

  // Packaging
  PACKAGING = 'PACKAGING',
}

// Hierarchy for overlap detection
const SCOPE_HIERARCHY: Record<ProductScope, ProductScope[]> = {
  CONSUMER_GOODS: [TOYS, CHILDCARE_ARTICLES, JEWELRY, COSMETICS, TEXTILES, FURNITURE],
  TOYS: [CHILDCARE_ARTICLES],  // childcare is subset of toys for some regulations
  EEE: [BATTERIES, CABLES],
  // ...
};
```

### 4.6 Unresolved Substances Queue

```
┌─────────────────────────────────────────────────────────────────┐
│                    UnresolvedSubstance                           │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)                                                          │
│ rawName              ──────── What was extracted/submitted       │
│ rawCasNumber                                                     │
│ source               ──────── "EXTRACTION", "CUSTOMER_UPLOAD"    │
│ occurrenceCount      ──────── How often this comes up            │
│ status               ──────── See status enum below              │
│ resolutionType       ──────── See resolution type enum below     │
│ resolvedSubstanceId  ──────── FK if manually matched             │
│ supplierId           ──────── FK if disclosure requested         │
│ disclosureRequestId  ──────── FK to BlindDisclosureRequest       │
│ createdAt                                                        │
│ resolvedAt                                                       │
│ resolvedBy                                                       │
└─────────────────────────────────────────────────────────────────┘
```

**Status Enum:**

```typescript
enum UnresolvedStatus {
  PENDING = 'PENDING',                    // Awaiting review
  DISCLOSURE_REQUESTED = 'DISCLOSURE_REQUESTED',  // Supplier contacted
  RESOLVED = 'RESOLVED',                  // Matched to substance
  IGNORED = 'IGNORED',                    // Intentionally skipped
  NOT_APPLICABLE = 'NOT_APPLICABLE',      // Not a regulated substance type
}
```

**Resolution Type Enum:**

```typescript
enum ResolutionType {
  MANUAL_MATCH = 'MANUAL_MATCH',          // Admin matched to existing substance
  SUPPLIER_DISCLOSURE = 'SUPPLIER_DISCLOSURE',  // Supplier provided real CAS
  NEW_SUBSTANCE = 'NEW_SUBSTANCE',        // Added to registry as new
  PROPRIETARY_ACCEPTED = 'PROPRIETARY_ACCEPTED',  // Accepted as-is with supplier attestation
}
```

### 4.7 Proprietary Substance Handling (Blind Disclosure)

Suppliers often hide ingredients as "Proprietary" or "Trade Secret". We need a secure workflow to request the real CAS without exposing it to competitors.

```
┌─────────────────────────────────────────────────────────────────┐
│                   BlindDisclosureRequest                         │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)                                                          │
│ unresolvedSubstanceId (FK)                                       │
│ supplierId (FK)              ──────── Who to contact             │
│ productId (FK)               ──────── Which product uses it      │
│ requestedAt                                                      │
│ requestedBy                  ──────── User who initiated         │
│ status                       ──────── See status enum below      │
│ secureToken                  ──────── One-time access token      │
│ tokenExpiresAt                                                   │
│ disclosedCasNumber           ──────── Revealed only to system    │
│ disclosedAt                                                      │
│ attestationType              ──────── See attestation enum       │
│ attestationDocument          ──────── S3 key for signed doc      │
└─────────────────────────────────────────────────────────────────┘
```

**Disclosure Status Enum:**

```typescript
enum DisclosureStatus {
  PENDING = 'PENDING',           // Email sent, awaiting response
  LINK_ACCESSED = 'LINK_ACCESSED',  // Supplier clicked link
  DISCLOSED = 'DISCLOSED',       // CAS provided
  ATTESTED = 'ATTESTED',         // Supplier attested compliance without CAS
  EXPIRED = 'EXPIRED',           // Token expired, no response
  DECLINED = 'DECLINED',         // Supplier refused
}
```

**Attestation Types:**

```typescript
enum AttestationType {
  FULL_DISCLOSURE = 'FULL_DISCLOSURE',   // Supplier revealed CAS
  COMPLIANT_ATTESTATION = 'COMPLIANT_ATTESTATION',  // "We attest this substance complies with [list]"
  NON_REGULATED = 'NON_REGULATED',       // "This substance is not on any restricted list"
}
```

**Workflow:**

```
Customer uploads BOM with "Proprietary Ingredient X"
                    │
                    ▼
          UnresolvedSubstance created
          (status: PENDING)
                    │
                    ▼
      Admin clicks "Request Disclosure"
                    │
                    ▼
      BlindDisclosureRequest created
      Secure link emailed to supplier
      (status: DISCLOSURE_REQUESTED)
                    │
         ┌──────────┴──────────┐
         │                     │
         ▼                     ▼
   Supplier clicks      Token expires
   secure link          (status: EXPIRED)
         │
         ▼
   Supplier portal:
   ┌─────────────────────────────────┐
   │  Options:                       │
   │  1. Disclose CAS (encrypted)    │
   │  2. Attest compliance           │
   │  3. Decline                     │
   └─────────────────────────────────┘
         │
         ▼
   CAS stored encrypted
   Only system can decrypt for compliance check
   Customer sees: "Disclosed ✓" (not the CAS)
```

**Security:**
- CAS disclosed via blind portal is encrypted at rest
- Customer never sees the actual CAS - only compliance status
- Supplier can revoke disclosure at any time
- Audit log tracks all access

---

## 5. Identity Resolution

### 5.1 Sanitization (Step 0)

```typescript
function sanitizeCas(raw: string): string | null {
  // "1309- 60 -0" → "1309-60-0"
  // "1309600" → "1309-60-0" (reformat if valid)
  // "CAS: 1309-60-0" → "1309-60-0"
  // "N/A" → null

  const stripped = raw.replace(/[^0-9-]/g, '').replace(/-+/g, '-');
  const formatted = formatCasNumber(stripped);
  return isValidCasNumber(formatted) ? formatted : null;
}

function sanitizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, ' ')      // collapse whitespace
    .replace(/[^\w\s-]/g, '')  // remove special chars
    .trim();
}
```

### 5.2 Resolution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│          Input: "Lead dioxide" or "1309- 60 -0"                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ 0. SANITIZE     │
                    │ CAS, EC, Name   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ 1. Exact CAS?   │──── YES ───▶ MATCHED (1.0)
                    └────────┬────────┘
                             │ NO
                             ▼
                    ┌─────────────────┐
                    │ 2. Exact EC?    │──── YES ───▶ MATCHED (1.0)
                    └────────┬────────┘
                             │ NO
                             ▼
                    ┌─────────────────┐
                    │ 3. Exact alias? │──── YES ───▶ MATCHED (1.0)
                    └────────┬────────┘
                             │ NO
                             ▼
                    ┌──────────────────────┐
                    │ 4. Fuzzy (pg_trgm)   │
                    │ Return all > 0.6     │
                    │ Ranked by similarity │
                    └──────────┬───────────┘
                               │
              ┌────────────────┴────────────────┐
              │ 1 result ≥ 0.85                 │ Multiple or < 0.85
              ▼                                 ▼
        ┌──────────────┐              ┌─────────────────┐
        │ MATCHED      │              │ CANDIDATES      │
        │ (auto-accept)│              │ (human review)  │
        └──────────────┘              └─────────────────┘
                                               │
                                               │ 0 results
                                               ▼
                                      ┌─────────────────┐
                                      │ UNRESOLVED      │
                                      │ → Log & queue   │
                                      └─────────────────┘
```

### 5.3 ResolveResult Interface

```typescript
interface SubstanceCandidate {
  substanceId: string;
  casNumber: string;
  primaryName: string;
  matchedVia: 'CAS' | 'EC' | 'ALIAS_EXACT' | 'ALIAS_FUZZY';
  confidence: number;        // 1.0 for exact, <1.0 for fuzzy
  matchedAlias?: string;     // which alias matched
}

interface ResolveResult {
  status: 'MATCHED' | 'CANDIDATES' | 'UNRESOLVED';
  match?: SubstanceCandidate;           // when status = MATCHED (confidence = 1.0)
  candidates?: SubstanceCandidate[];    // when status = CANDIDATES (ranked by confidence)
  sanitizedInput: {                     // what we actually searched for
    casNumber: string | null;
    ecNumber: string | null;
    name: string | null;
  };
}
```

### 5.4 PostgreSQL Setup

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_alias_name_trgm ON substance_alias
  USING gin (name_normalized gin_trgm_ops);
```

---

## 6. Conflict Detection

### 6.1 Conflict Types

```typescript
type ConflictType =
  | 'THRESHOLD_MISMATCH'      // Same scope, different threshold
  | 'STATUS_CONTRADICTION'    // BANNED vs RESTRICTED
  | 'SCOPE_OVERLAP'           // Parent scope has different rule than child
  | 'SUPERSEDED';             // Newer version of same regulation

interface Conflict {
  type: ConflictType;
  severity: 'WARNING' | 'ERROR' | 'INFO';
  existingEntry: SubstanceListEntry;
  newEntry: Partial<SubstanceListEntry>;
  message: string;
  suggestedAction?: 'ARCHIVE_OLD' | 'REJECT_NEW' | 'MANUAL_REVIEW';
}
```

### 6.2 Detection Rules

| Rule | Condition | Severity | Example |
|------|-----------|----------|---------|
| **Threshold mismatch** | Same substance + same list + same scope + different threshold | ERROR | Lead in jewelry: 0.05% vs 0.1% |
| **Stricter exists** | Same substance + overlapping scope + new threshold is looser | WARNING | Annex XVII says 0.05%, new extraction says 0.1% |
| **Status contradiction** | Same substance + same scope + BANNED vs RESTRICTED | ERROR | Can't be both banned and conditionally allowed |
| **Date conflict** | Same substance + overlapping scope + conflicting effective dates | WARNING | Sunset 2025 vs Effective 2026 |
| **Superseded** | Same substance + same list + same scope + newer sourceReference | INFO | Entry 63 (2026) supersedes Entry 63 (2024) |

### 6.3 Scope Overlap Detection

```sql
-- Find entries where scopes overlap via hierarchy
SELECT * FROM substance_list_entry sle
WHERE sle.substance_id = $1
  AND sle.regulatory_list_id = $2
  AND (
    -- Direct match
    sle.scopes && $3::product_scope[]
    -- Or parent/child relationship
    OR EXISTS (
      SELECT 1 FROM unnest(sle.scopes) AS s
      WHERE is_scope_ancestor(s, ANY($3))
    )
  );
```

### 6.4 Superseding Logic

| Condition | Detection | Action |
|-----------|-----------|--------|
| Same substance + same list + same scope + newer `sourceReference` | Compare regulation version/date | `SUPERSEDED` + suggest archive old |
| Same substance + same list + same scope + same version | True conflict | `THRESHOLD_MISMATCH` |

### 6.5 Unit Normalization (UnitConversionService)

Thresholds are stored with their original units (`thresholdUnit` field), but conflict detection requires comparing apples to apples. The UnitConversionService normalizes all thresholds to a canonical unit before comparison.

**Supported Units:**

```typescript
enum ThresholdUnit {
  PERCENT_BY_WEIGHT = 'PERCENT_BY_WEIGHT',   // w/w %
  PPM = 'PPM',                               // parts per million (mg/kg)
  PPB = 'PPB',                               // parts per billion (µg/kg)
  MG_PER_KG = 'MG_PER_KG',                   // milligrams per kilogram
  MG_PER_CM2 = 'MG_PER_CM2',                 // migration limit (surface area)
  MG_PER_L = 'MG_PER_L',                     // concentration in liquid
}

// Canonical unit for comparison
const CANONICAL_UNIT = ThresholdUnit.PPM;
```

**Conversion Factors:**

```typescript
const CONVERSION_TO_PPM: Record<ThresholdUnit, number> = {
  PERCENT_BY_WEIGHT: 10_000,  // 1% = 10,000 ppm
  PPM: 1,
  PPB: 0.001,                 // 1 ppb = 0.001 ppm
  MG_PER_KG: 1,               // mg/kg ≡ ppm
  MG_PER_CM2: null,           // Not convertible (different dimension)
  MG_PER_L: null,             // Not directly convertible without density
};
```

**Service Interface:**

```typescript
interface UnitConversionService {
  /**
   * Convert threshold to canonical unit (ppm) for comparison
   * Returns null if units are incompatible (e.g., surface vs weight)
   */
  toCanonical(value: number, unit: ThresholdUnit): number | null;

  /**
   * Check if two thresholds can be compared
   */
  areComparable(unit1: ThresholdUnit, unit2: ThresholdUnit): boolean;

  /**
   * Compare two thresholds, accounting for unit conversion
   * Returns: -1 (a stricter), 0 (equal), 1 (b stricter), null (incomparable)
   */
  compareThresholds(
    a: { value: number; unit: ThresholdUnit },
    b: { value: number; unit: ThresholdUnit }
  ): -1 | 0 | 1 | null;
}
```

**Implementation:**

```typescript
class UnitConversionServiceImpl implements UnitConversionService {
  toCanonical(value: number, unit: ThresholdUnit): number | null {
    const factor = CONVERSION_TO_PPM[unit];
    if (factor === null) return null;
    return value * factor;
  }

  areComparable(unit1: ThresholdUnit, unit2: ThresholdUnit): boolean {
    return (
      CONVERSION_TO_PPM[unit1] !== null &&
      CONVERSION_TO_PPM[unit2] !== null
    );
  }

  compareThresholds(
    a: { value: number; unit: ThresholdUnit },
    b: { value: number; unit: ThresholdUnit }
  ): -1 | 0 | 1 | null {
    if (!this.areComparable(a.unit, b.unit)) return null;

    const aPpm = this.toCanonical(a.value, a.unit)!;
    const bPpm = this.toCanonical(b.value, b.unit)!;

    // Lower threshold = stricter
    if (aPpm < bPpm) return -1;
    if (aPpm > bPpm) return 1;
    return 0;
  }
}
```

**Usage in Conflict Detection:**

```typescript
// Before comparing thresholds
const comparison = unitConversion.compareThresholds(
  { value: existingEntry.threshold, unit: existingEntry.thresholdUnit },
  { value: newEntry.threshold, unit: newEntry.thresholdUnit }
);

if (comparison === null) {
  // Incompatible units - flag for manual review
  conflicts.push({
    type: 'THRESHOLD_MISMATCH',
    severity: 'WARNING',
    message: `Cannot compare thresholds: ${existingEntry.thresholdUnit} vs ${newEntry.thresholdUnit}`,
    suggestedAction: 'MANUAL_REVIEW',
  });
} else if (comparison !== 0) {
  // Thresholds differ
  conflicts.push({
    type: 'THRESHOLD_MISMATCH',
    severity: 'ERROR',
    message: `Threshold conflict: ${existingEntry.threshold} ${existingEntry.thresholdUnit} vs ${newEntry.threshold} ${newEntry.thresholdUnit}`,
  });
}
```

**Edge Cases:**

| Scenario | Handling |
|----------|----------|
| Surface area units (mg/cm²) vs weight (ppm) | Incomparable - flag for manual review |
| Concentration (mg/L) vs weight (ppm) | Incomparable without density - flag |
| No threshold specified | Treat as "any detectable amount" (0 ppm) |
| "Prohibited" status | Threshold = 0, interpret as banned |

---

## 7. Integration Points

### 7.1 Extraction Pipeline Updates

**Current flow:**
```
PDF → Claude extracts → Gemini validates → StagingRequirement → PublishService → Requirement
```

**Updated flow:**
```
PDF → Claude extracts → Gemini validates → StagingRequirement
                                                    ↓
                                           SubstanceResolver
                                                    ↓
                                    ┌───────────────┴───────────────┐
                                    │                               │
                              MATCHED/CANDIDATES              UNRESOLVED
                                    │                               │
                                    ↓                               ↓
                           ConflictDetector              UnresolvedSubstance queue
                                    │
                                    ↓
                              PublishService → SubstanceListEntry
```

### 7.2 Extraction Prompt Updates

Claude must map extracted scope to ProductScope enum:

```
When extracting scope, map to these standard categories:
- TOYS, CHILDCARE_ARTICLES, JEWELRY, COSMETICS, ...

Example:
  Raw: "shall not be used in toys or childcare articles"
  scopes: ["TOYS", "CHILDCARE_ARTICLES"]
  scopeRaw: "toys or childcare articles"
```

### 7.3 PublishService Updates

Replace direct CAS lookup with SubstanceResolver:

```typescript
// Before
const substance = await em.findOne(Substance, { casNumber });

// After
const result = await substanceResolver.resolve({
  casNumber: staging.casNumber,
  name: staging.substanceName,
});

if (result.status === 'UNRESOLVED') {
  await createUnresolvedSubstance(staging);
  return { status: 'UNRESOLVED' };
}

if (result.status === 'CANDIDATES') {
  return { status: 'REVIEW_NEEDED', candidates: result.candidates };
}

// result.status === 'MATCHED'
const conflicts = await conflictDetector.detect(result.match.substanceId, newEntry);
```

---

## 8. Package Structure

```
packages/gsr/
├── package.json
├── src/
│   ├── entities/
│   │   ├── RegistrySource.ts
│   │   ├── RegulatoryList.ts
│   │   ├── SubstanceListEntry.ts
│   │   ├── SubstanceGroup.ts
│   │   ├── SubstanceGroupMember.ts
│   │   ├── UnresolvedSubstance.ts
│   │   └── BlindDisclosureRequest.ts
│   ├── enums/
│   │   └── ProductScope.ts
│   ├── services/
│   │   ├── SubstanceResolver.ts
│   │   ├── ConflictDetector.ts
│   │   └── UnitConversionService.ts
│   ├── seeders/
│   │   ├── echa-inventory.seeder.ts
│   │   ├── echa-svhc.seeder.ts
│   │   ├── echa-annex-xvii.seeder.ts
│   │   └── pubchem.enricher.ts
│   ├── parsers/
│   │   ├── echa-inventory.parser.ts
│   │   ├── echa-svhc.parser.ts
│   │   └── pubchem.parser.ts
│   ├── utils/
│   │   ├── cas-sanitizer.ts
│   │   └── name-normalizer.ts
│   └── cli.ts
└── vitest.config.ts
```

---

## 9. Files to Modify

### Entities

| File | Change |
|------|--------|
| `packages/database/src/entities/Substance.ts` | Add `smiles`, `inchiKey`; **remove** `isSvhc`, `requiresAuthorization`, `isRestricted`, `restrictionConditions`, `sunsetDate`, `latestApplicationDate` |
| `packages/database/src/entities/SubstanceAlias.ts` | Add `nameNormalized`, `source` fields |
| `packages/database/src/entities/StagingRequirement.ts` | Add `scopes: ProductScope[]`, rename `scope` → `scopeRaw` |
| `packages/database/src/entities/Requirement.ts` | Change `substanceListId` to proper FK to SubstanceListEntry |

### Seeders (Delete)

| File | Action |
|------|--------|
| `packages/database/src/seeders/substances.seeder.ts` | **Delete** - replaced by GSR seeders |
| `packages/database/data/echa-substances.json` | **Delete** - replaced by live ECHA downloads |
| `packages/database/data/cleaned_substances.csv` | **Delete** - unused |

### Services

| File | Change |
|------|--------|
| `packages/database/src/services/PublishService.ts` | Replace CAS lookup with SubstanceResolver |
| `packages/ingestor/src/services/Comparator.ts` | Update for SubstanceResolver integration |
| `packages/ingestor/src/services/IngestionPipeline.ts` | Add scope mapping to ProductScope enum |

### Prompts

| File | Change |
|------|--------|
| `packages/ingestor/src/prompts/substance-restriction-prompt.ts` | Add ProductScope enum mapping requirement |

### Migration

| File | Change |
|------|--------|
| `packages/database/src/migrations/Migration20260122000000.ts` | Update substance table, add new tables, add pg_trgm extension |

---

## 10. Migration Strategy

### Phase 1: Schema Additions (Non-breaking)

- Add new entities: RegistrySource, RegulatoryList, SubstanceListEntry, UnresolvedSubstance
- Add new fields to Substance: `smiles`, `inchiKey`
- Add new fields to SubstanceAlias: `nameNormalized`, `source`
- Add pg_trgm extension + indexes

### Phase 2: Data Seeding

- Run ECHA EC Inventory seeder (~106k)
- Run ECHA SVHC seeder → creates RegulatoryList + SubstanceListEntry records
- Run ECHA Annex XVII seeder → creates RegulatoryList + SubstanceListEntry records
- Run PubChem enrichment
- Verify existing 22 substances merged correctly

### Phase 3: Migrate Regulatory Flags

- For each Substance with `isSvhc=true`: Create SubstanceListEntry → REACH_SVHC list
- For each Substance with `isRestricted=true`: Create SubstanceListEntry → REACH_ANNEX_XVII
- For each Substance with `requiresAuthorization=true`: Create SubstanceListEntry → REACH_ANNEX_XIV
- Mark old boolean fields as deprecated

### Phase 4: Update Pipeline

- Update prompts to extract ProductScope enum
- Integrate SubstanceResolver into PublishService
- Add conflict detection before publish
- Update UI to show resolution candidates

### Phase 5: Cleanup

- Remove deprecated boolean flags from Substance entity
- Update Requirement.substanceListId to proper FK
- Delete old seeder and data files

---

## 11. Success Metrics

| Metric | Target |
|--------|--------|
| Substance coverage | >100k (vs current 22) |
| Alias coverage | >500k (via PubChem) |
| Identity resolution rate | >95% of extractions resolve without human intervention |
| Fuzzy match accuracy | >90% of fuzzy matches are correct |
| Conflict detection | 100% of threshold conflicts flagged before publish |

---

## 12. Open Questions

1. **RoHS integration** - Should RoHS Annex II be a separate RegulatoryList or merged with REACH?
2. **Tenant-specific lists** - Will tenants be able to create custom substance lists?
3. **Versioning** - How to handle regulatory list version updates (full refresh vs incremental)?

---

*Design created: 2026-01-31*
*Authors: Human + Claude (Brainstorming Skill)*
