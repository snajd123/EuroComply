# Global Substance Registry (GSR) Design

> **Status:** IMPLEMENTED (Core), CLP ADDED 2026-02-01
> **Supersedes:** taxonomy-04-substance-registry.md (partial)
> **Related:** taxonomy-10-regulatory-list-registry.md, ai-regulation-ingestor-design.md, 2026-02-01-clp-integration-design.md

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

### CLP Hazard Classification

See `2026-02-01-clp-integration-design.md` for:
- HazardClass, HazardStatement, SubstanceHazardClassification entities
- CLP Annex VI seeding workflow (~4,762 substances with harmonised classifications)
- mhchem H-statement translations (24 EU languages)
- CMR (Carcinogenic, Mutagenic, Reprotoxic) flagging

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

### 5.1.1 CAS Registry Number Checksum Validation

CAS Registry Numbers have a built-in checksum (the last digit) that detects typos. This is critical for catching errors in raw government spreadsheets before they pollute the registry.

**CAS Format:** `XXXXXXX-XX-X` where:
- First segment: 2-7 digits
- Second segment: 2 digits
- Third segment: 1 digit (checksum)

**Algorithm:**
1. Remove hyphens, read digits right-to-left (excluding checksum)
2. Multiply each digit by its position (1, 2, 3, ...)
3. Sum all products
4. Checksum = sum mod 10

**Example:** `1309-60-0` (Lead dioxide)
```
Digits (R→L, excluding check): 0, 6, 9, 0, 3, 1
Positions:                      1, 2, 3, 4, 5, 6
Products:                       0, 12, 27, 0, 15, 6
Sum: 0 + 12 + 27 + 0 + 15 + 6 = 60
Checksum: 60 mod 10 = 0 ✓
```

**Implementation:**

```typescript
/**
 * Validates CAS Registry Number format and checksum.
 * Catches typos in source data before import.
 */
function isValidCasNumber(cas: string | null): boolean {
  if (!cas) return false;

  // Must match format: 2-7 digits, hyphen, 2 digits, hyphen, 1 digit
  const pattern = /^(\d{2,7})-(\d{2})-(\d)$/;
  const match = cas.match(pattern);
  if (!match) return false;

  const [, first, second, checkDigit] = match;
  const digits = (first + second).split('').reverse();

  // Calculate checksum: sum of (digit × position), mod 10
  const sum = digits.reduce((acc, digit, index) => {
    return acc + parseInt(digit, 10) * (index + 1);
  }, 0);

  return (sum % 10) === parseInt(checkDigit, 10);
}

/**
 * Formats a raw CAS string into canonical format.
 * Handles missing hyphens, extra spaces, etc.
 */
function formatCasNumber(raw: string): string | null {
  // Extract only digits
  const digits = raw.replace(/\D/g, '');

  // CAS numbers have 5-10 digits total
  if (digits.length < 5 || digits.length > 10) return null;

  // Split: last digit is check, previous 2 are middle, rest is first
  const check = digits.slice(-1);
  const middle = digits.slice(-3, -1);
  const first = digits.slice(0, -3);

  return `${first}-${middle}-${check}`;
}
```

**Seeder Usage:**

```typescript
// In ECHA inventory seeder - reject invalid CAS numbers
for (const row of echaData) {
  const cas = sanitizeCas(row.casNumber);

  if (row.casNumber && !cas) {
    logger.warn(`Invalid CAS checksum: ${row.casNumber} for ${row.name}`);
    invalidCasCount++;
    continue; // Skip this record
  }

  await em.upsert(Substance, { casNumber: cas, ... });
}

logger.info(`Skipped ${invalidCasCount} records with invalid CAS checksums`);
```

**Test Cases:**

| Input | Expected | Reason |
|-------|----------|--------|
| `1309-60-0` | ✓ Valid | Checksum correct |
| `1309-60-1` | ✗ Invalid | Wrong checksum |
| `50-00-0` | ✓ Valid | Formaldehyde |
| `7440-43-9` | ✓ Valid | Cadmium |
| `12345-67-8` | ✗ Invalid | Checksum fails |
| `123456789012` | ✗ Invalid | Too many digits |
| `12-3-4` | ✗ Invalid | Segments too short |

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

### 6.3 Scope Overlap Detection (Recursive Inheritance)

When a rule applies to `CONSUMER_GOODS`, it must automatically apply to all children: `TOYS`, `JEWELRY`, `COSMETICS`, etc. This requires recursive traversal of the scope hierarchy.

**Scope Hierarchy Table:**

```sql
-- Store parent-child relationships for scopes
CREATE TABLE product_scope_hierarchy (
  parent_scope VARCHAR(50) NOT NULL,
  child_scope VARCHAR(50) NOT NULL,
  PRIMARY KEY (parent_scope, child_scope)
);

-- Seed the hierarchy
INSERT INTO product_scope_hierarchy (parent_scope, child_scope) VALUES
  ('ALL_PRODUCTS', 'CONSUMER_GOODS'),
  ('ALL_PRODUCTS', 'INDUSTRIAL'),
  ('CONSUMER_GOODS', 'TOYS'),
  ('CONSUMER_GOODS', 'CHILDCARE_ARTICLES'),
  ('CONSUMER_GOODS', 'JEWELRY'),
  ('CONSUMER_GOODS', 'COSMETICS'),
  ('CONSUMER_GOODS', 'FOOD_CONTACT'),
  ('CONSUMER_GOODS', 'TEXTILES'),
  ('CONSUMER_GOODS', 'FURNITURE'),
  ('TOYS', 'CHILDCARE_ARTICLES'),  -- childcare is subset of toys
  ('EEE', 'BATTERIES'),
  ('EEE', 'CABLES'),
  ('VEHICLES', 'VEHICLE_COMPONENTS');
```

**Recursive Ancestor Function:**

```sql
-- Returns true if 'ancestor' is an ancestor of 'descendant' (or equal)
CREATE OR REPLACE FUNCTION is_scope_ancestor(
  ancestor VARCHAR(50),
  descendant VARCHAR(50)
) RETURNS BOOLEAN AS $$
BEGIN
  -- Same scope = trivially true
  IF ancestor = descendant THEN
    RETURN TRUE;
  END IF;

  -- Recursive CTE to find all ancestors of the descendant
  RETURN EXISTS (
    WITH RECURSIVE ancestors AS (
      -- Base: direct parents of descendant
      SELECT parent_scope
      FROM product_scope_hierarchy
      WHERE child_scope = descendant

      UNION

      -- Recursive: parents of parents
      SELECT h.parent_scope
      FROM product_scope_hierarchy h
      INNER JOIN ancestors a ON h.child_scope = a.parent_scope
    )
    SELECT 1 FROM ancestors WHERE parent_scope = ancestor
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

**Get All Descendants Function:**

```sql
-- Returns all scopes that inherit from a parent (for expanding rules)
CREATE OR REPLACE FUNCTION get_scope_descendants(
  parent VARCHAR(50)
) RETURNS VARCHAR(50)[] AS $$
DECLARE
  result VARCHAR(50)[];
BEGIN
  WITH RECURSIVE descendants AS (
    -- Base: the parent itself
    SELECT parent::VARCHAR(50) AS scope

    UNION

    -- Recursive: all children
    SELECT h.child_scope
    FROM product_scope_hierarchy h
    INNER JOIN descendants d ON h.parent_scope = d.scope
  )
  SELECT array_agg(scope) INTO result FROM descendants;

  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

**Example:**

```sql
SELECT get_scope_descendants('CONSUMER_GOODS');
-- Returns: {CONSUMER_GOODS, TOYS, CHILDCARE_ARTICLES, JEWELRY, COSMETICS, FOOD_CONTACT, TEXTILES, FURNITURE}

SELECT is_scope_ancestor('CONSUMER_GOODS', 'JEWELRY');
-- Returns: TRUE

SELECT is_scope_ancestor('TOYS', 'JEWELRY');
-- Returns: FALSE (siblings, not ancestor)
```

**Conflict Detection Query (Updated):**

```sql
-- Find entries where scopes overlap via hierarchy
-- A rule on CONSUMER_GOODS conflicts with a rule on TOYS (child)
SELECT sle.* FROM substance_list_entry sle
WHERE sle.substance_id = $1
  AND sle.regulatory_list_id = $2
  AND (
    -- Direct scope match
    sle.scopes && $3::product_scope[]

    -- OR: existing entry's scope is ancestor of new scope
    -- (rule on CONSUMER_GOODS applies to new TOYS rule)
    OR EXISTS (
      SELECT 1 FROM unnest(sle.scopes) AS existing_scope
      CROSS JOIN unnest($3::product_scope[]) AS new_scope
      WHERE is_scope_ancestor(existing_scope, new_scope)
    )

    -- OR: new scope is ancestor of existing entry's scope
    -- (new rule on CONSUMER_GOODS conflicts with existing TOYS rule)
    OR EXISTS (
      SELECT 1 FROM unnest($3::product_scope[]) AS new_scope
      CROSS JOIN unnest(sle.scopes) AS existing_scope
      WHERE is_scope_ancestor(new_scope, existing_scope)
    )
  );
```

**TypeScript Helper:**

```typescript
// For application-level checks (mirrors SQL logic)
const SCOPE_HIERARCHY: Record<ProductScope, ProductScope[]> = {
  ALL_PRODUCTS: [ProductScope.CONSUMER_GOODS, ProductScope.INDUSTRIAL],
  CONSUMER_GOODS: [
    ProductScope.TOYS,
    ProductScope.CHILDCARE_ARTICLES,
    ProductScope.JEWELRY,
    ProductScope.COSMETICS,
    ProductScope.FOOD_CONTACT,
    ProductScope.TEXTILES,
    ProductScope.FURNITURE,
  ],
  TOYS: [ProductScope.CHILDCARE_ARTICLES],
  EEE: [ProductScope.BATTERIES, ProductScope.CABLES],
  VEHICLES: [ProductScope.VEHICLE_COMPONENTS],
  // Leaf nodes have no children
  INDUSTRIAL: [],
  CHILDCARE_ARTICLES: [],
  JEWELRY: [],
  COSMETICS: [],
  FOOD_CONTACT: [],
  TEXTILES: [],
  FURNITURE: [],
  BATTERIES: [],
  CABLES: [],
  VEHICLE_COMPONENTS: [],
  CONSTRUCTION_PRODUCTS: [],
  PAINTS_COATINGS: [],
  PACKAGING: [],
};

function getAllDescendants(scope: ProductScope): ProductScope[] {
  const result: ProductScope[] = [scope];
  const children = SCOPE_HIERARCHY[scope] || [];

  for (const child of children) {
    result.push(...getAllDescendants(child));
  }

  return result;
}

function isScopeAncestor(ancestor: ProductScope, descendant: ProductScope): boolean {
  if (ancestor === descendant) return true;
  return getAllDescendants(ancestor).includes(descendant);
}
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

## 10. Data Enrichment

### 10.1 PubChem Integration

Substances seeded from ECHA EC Inventory contain basic identification data (CAS, EC number, name, molecular formula). Chemical structure data is enriched from PubChem API:

| Field | Source | Coverage |
|-------|--------|----------|
| smiles | PubChem | ~80% of substances |
| inchiKey | PubChem | ~80% of substances |
| iupacName | PubChem | ~80% of substances |
| molecularWeight | PubChem | ~80% of substances |
| echaUrl | Generated | 100% (from EC number) |

**Why ~80%?** Some substances in the EC Inventory are polymers, mixtures, or proprietary formulations that don't have single chemical identities in PubChem.

### 10.2 Enrichment Commands

```bash
# Full enrichment pipeline
pnpm gsr:seed:inventory          # Seed base substances (~106k)
pnpm gsr:seed:svhc               # Add SVHC regulatory entries
pnpm gsr:enrich:pubchem          # Add chemical structure data from PubChem
pnpm gsr:enrich:echa-urls        # Generate ECHA links

# Enrichment options
pnpm gsr:enrich:pubchem --batch-size 50     # Smaller batches (default: 100)
pnpm gsr:enrich:pubchem --dry-run           # Preview without saving
pnpm gsr:enrich:pubchem --all               # Re-enrich all substances
```

### 10.3 Rate Limiting & Performance

PubChem API enforces strict rate limits:
- **5 requests/second** - Hard limit per IP
- **400 requests/minute** - Soft limit with throttling

The `PubChemClient` handles this via:
- Request throttling (200ms minimum interval)
- Exponential backoff on 429 errors
- Configurable batch sizes for memory management
- Progress reporting for long-running operations

**Estimated enrichment time:**
| Substances | Time (approx) |
|------------|---------------|
| 1,000 | ~5 minutes |
| 10,000 | ~30 minutes |
| 100,000 | ~6 hours |

### 10.4 ECHA URL Generation

Every substance with an EC number gets an ECHA URL pointing to the official substance information page:

```
https://echa.europa.eu/substance-information/-/substanceinfo/{ec_number}
```

Example: EC 200-001-8 (Formaldehyde) →
`https://echa.europa.eu/substance-information/-/substanceinfo/200-001-8`

This is generated locally (no API call required) and has 100% coverage for substances with EC numbers.

---

## 11. Migration Strategy

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

## 12. Success Metrics

| Metric | Target |
|--------|--------|
| Substance coverage | >100k (vs current 22) |
| Alias coverage | >500k (via PubChem) |
| Identity resolution rate | >95% of extractions resolve without human intervention |
| Fuzzy match accuracy | >90% of fuzzy matches are correct |
| Conflict detection | 100% of threshold conflicts flagged before publish |

---

## 13. Open Questions

1. **RoHS integration** - Should RoHS Annex II be a separate RegulatoryList or merged with REACH?
2. **Tenant-specific lists** - Will tenants be able to create custom substance lists?
3. **Versioning** - How to handle regulatory list version updates (full refresh vs incremental)?

---

*Design created: 2026-01-31*
*Authors: Human + Claude (Brainstorming Skill)*
