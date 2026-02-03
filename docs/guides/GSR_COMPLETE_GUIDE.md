# GSR (Global Substance Registry) Complete Guide

This document provides a comprehensive overview of the GSR package - how substances, hazard classifications, and regulatory lists work together.

---

## Overview

The GSR manages chemical substance data for EU regulatory compliance. It has **three layers**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 1: BASE SUBSTANCES (106k chemicals)                              │
│  ┌─────────────┐    ┌─────────────────┐                                │
│  │  substance  │───►│ substance_alias │  (PubChem synonyms, etc.)      │
│  └──────┬──────┘    └─────────────────┘                                │
│         │                                                               │
├─────────┼───────────────────────────────────────────────────────────────┤
│  LAYER 2: HAZARD CLASSIFICATION (CLP/GHS)                               │
│         │                                                               │
│  ┌──────▼───────────────────┐    ┌─────────────┐    ┌────────────────┐ │
│  │ substance_hazard_        │───►│ hazard_class│◄───│hazard_statement│ │
│  │ classification (~4,762)  │    │   (33)      │    │   (91 × 24 lang)│ │
│  └──────────────────────────┘    └─────────────┘    └────────────────┘ │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  LAYER 3: REGULATORY LISTS (SVHC, REACH, POP, RoHS)                     │
│         │                                                               │
│  ┌──────▼──────┐    ┌───────────────────┐    ┌─────────────────┐       │
│  │ substance_  │◄───│ substance_list_   │───►│ regulatory_list │       │
│  │   group     │    │     entry         │    │                 │       │
│  └─────────────┘    └───────────────────┘    └─────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Sources

| Source | What It Is | Records | CLI Command |
|--------|------------|---------|-------------|
| **ECHA EC Inventory** | Base chemical list (CAS, EC numbers) | 106,213 | `seed echa-inventory` |
| **PubChem API** | Enrichment (SMILES, synonyms) | Variable | `enrich pubchem` |
| **mhchem** | H-statement translations (24 EU languages) | 91 × 24 | `seed clp-reference` |
| **CLP Annex VI** | Harmonised hazard classifications | ~4,762 | `seed clp-harmonised` |
| **SVHC List** | Substances of Very High Concern | ~240 | `seed echa-svhc` |
| **REACH Annex XVII** | Restrictions | ~2,150 | `seed echa-annex-xvii` |
| **REACH Annex XIV** | Authorization required | ~60 | `seed echa-annex-xiv` |
| **POP Regulation** | Persistent Organic Pollutants (banned) | ~35 | `seed echa-pop` |
| **RoHS Directive** | Electronics restrictions | 10 | `seed rohs` |

### Where to Download Data Files

| Source | URL |
|--------|-----|
| ECHA EC Inventory (i6z) | https://iuclid6.echa.europa.eu/get-iuclid-data |
| CLP Annex VI | https://echa.europa.eu/information-on-chemicals/annex-vi-to-clp |
| SVHC Candidate List | https://echa.europa.eu/candidate-list-table |
| REACH Annex XVII | https://echa.europa.eu/substances-restricted-under-reach |
| REACH Annex XIV | https://echa.europa.eu/authorisation-list |
| POP Regulation | https://echa.europa.eu/list-of-substances-subject-to-pops-regulation |

---

## Entity Relationships

### Layer 1: Substance Identity

```
Substance (106k records)
├── casNumber (unique, validated checksum)
├── ecNumber
├── primaryName
├── smiles, inchiKey (from PubChem)
├── indexNumber, clpVersion (from CLP)
└── aliases[] ──► SubstanceAlias (60k+ names)
                  ├── name, nameNormalized
                  ├── type: IUPAC|COMMON|TRADE|SYNONYM|INDEX_NAME
                  └── source: ECHA|PUBCHEM|MANUAL
```

**Key Fields:**
- `casNumber` - CAS Registry Number with checksum validation (e.g., "50-00-0")
- `ecNumber` - European Community number (e.g., "200-001-8")
- `smiles` - Molecular structure notation (from PubChem)
- `inchiKey` - 27-character structure hash for exact matching
- `indexNumber` - CLP Annex VI index (e.g., "605-001-00-5")
- `clpVersion` - ATP version applied (e.g., "ATP21")

### Layer 2: Hazard Classification (CLP/GHS)

```
HazardClass (33 records)                 HazardStatement (91 records)
├── code: "Carc.", "Muta.", "Repr."      ├── code: "H350", "H340", "H360"
├── fullName: "Carcinogenicity"          ├── translations: {en: "May cause cancer", de: "..."}
├── hazardType: PHYSICAL|HEALTH|ENV      └── primaryHazardClass ──► HazardClass
├── pictogram: "GHS08"
├── signalWord: DANGER|WARNING
└── isCmr: true (for Carc/Muta/Repr)

SubstanceHazardClassification (~4,762 junction records)
├── substance ──► Substance
├── hazardClass ──► HazardClass
├── category: "1A", "1B", "2"     (severity within class)
├── hCode: "H350"                 (H-statement reference)
├── notes: ["Note A", "Note 10"]  (regulatory modifiers)
├── sclLogic: {operator, value}   (specific concentration limit)
├── mFactor: 10                   (aquatic hazard multiplier)
├── atpSource: "ATP21"            (regulatory version)
└── validFrom/validTo             (temporal validity)
```

### Layer 3: Regulatory Lists

```
RegulatoryList
├── code: "REACH_SVHC", "REACH_ANNEX_XVII", "ROHS"
├── name, jurisdiction, publisher
└── entries[] ──► SubstanceListEntry

SubstanceGroup (chemical families)
├── code: "LEAD_COMPOUNDS", "PFAS"
├── name, description
└── members[] ──► SubstanceGroupMember ──► Substance

SubstanceListEntry (junction)
├── substance ──► Substance (or null if group-level)
├── substanceGroup ──► SubstanceGroup (or null if substance-level)
├── regulatoryList ──► RegulatoryList
├── status: LISTED|RESTRICTED|BANNED|AUTHORIZED
├── threshold: 0.1
├── thresholdUnit: PERCENT_BY_WEIGHT|PPM|...
├── scopes: [TOYS, TEXTILES, EEE]
├── sunsetDate (Annex XIV only)
└── conditions (JSON exemptions)
```

---

## CLI Commands

All commands from `packages/gsr` after `pnpm build`:

### Seeding (Data Loading)

```bash
# Step 1: Base substances (run first)
pnpm gsr seed echa-inventory data/ec_inventory.i6z

# Step 2: Enrichment (optional but recommended)
pnpm gsr enrich pubchem

# Step 3: CLP hazard data (two-step process)
pnpm gsr seed clp-reference                          # 33 classes + 91 H-statements
pnpm gsr seed clp-harmonised data/clp_annex_vi.xlsx  # ~4,762 classifications

# Step 4: Regulatory lists (any order)
pnpm gsr seed echa-svhc --entries data/svhc_entries.xlsx --substances data/svhc_substances.xlsx
pnpm gsr seed echa-annex-xvii --entries data/xvii_entries.xlsx --substances data/xvii_substances.xlsx
pnpm gsr seed echa-annex-xiv --entries data/xiv_entries.xlsx --substances data/xiv_substances.xlsx
pnpm gsr seed echa-pop --entries data/pop_entries.xlsx --substances data/pop_substances.xlsx
pnpm gsr seed rohs  # No file needed - hardcoded
```

### Enrichment

```bash
# Add SMILES, InChI, IUPAC names, synonyms from PubChem
pnpm gsr enrich pubchem
pnpm gsr enrich pubchem --batch-size 50   # Smaller batches
pnpm gsr enrich pubchem --all             # Re-enrich everything

# Set ECHA URLs for substances with EC numbers
pnpm gsr enrich echa-urls
```

### Dry Run (Preview)

All seed commands support `--dry-run` to preview without database changes:

```bash
pnpm gsr seed clp-reference --dry-run
pnpm gsr seed clp-harmonised data/clp_annex_vi.xlsx --dry-run
```

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 1: ECHA EC Inventory ─────────────────────────► substance table    │
│         (106k chemicals)                              substance_alias   │
│                                                                         │
│ STEP 2: PubChem API ───────────────────────────────► substance (enrich) │
│         (SMILES, InChI, synonyms)                     substance_alias + │
│                                                                         │
│ STEP 3a: mhchem (H-statement translations) ────────► hazard_class       │
│                                                       hazard_statement  │
│                                                                         │
│ STEP 3b: ECHA CLP Annex VI XLSX ───────────────────► substance_hazard_  │
│          (~4,762 substances)                          classification    │
│          Matches by CAS/EC number                                       │
│                                                                         │
│ STEP 4: Regulatory lists (SVHC, Annex XVII, etc) ──► regulatory_list    │
│         Creates groups for chemical families           substance_group  │
│         Links substances to lists with status          substance_list_  │
│         Creates "stub" substances if CAS not found     entry            │
│         Logs unmatched to unresolved_substance                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Key Concepts

### Hazard Types (HazardClass.hazardType)

| Type | Examples | H-code Range |
|------|----------|--------------|
| **PHYSICAL** | Explosives, Flammable, Oxidising | H200-H299 |
| **HEALTH** | Acute Toxicity, Carcinogenicity, Mutagenicity | H300-H399 |
| **ENVIRONMENTAL** | Aquatic Toxicity, Ozone | H400-H499 |

### CMR Substances

**CMR = Carcinogenic, Mutagenic, Reprotoxic** - The most serious health hazards.

| Class | Code | H-statements |
|-------|------|--------------|
| Carcinogenicity | `Carc.` | H350, H350i, H351 |
| Mutagenicity | `Muta.` | H340, H341 |
| Reproductive Toxicity | `Repr.` | H360, H361, H362 |

```typescript
// Quick query for CMR substances
HazardClass.isCmr = true  // Carc., Muta., Repr. classes
```

### Hazard Categories (Severity)

| Category | Meaning |
|----------|---------|
| 1A | Known to cause effect (human evidence) |
| 1B | Presumed to cause effect (animal evidence) |
| 2 | Suspected to cause effect |
| 3, 4 | Less severe (acute toxicity only) |

### Listing Status (Regulatory Lists)

| Status | Meaning | Example |
|--------|---------|---------|
| `LISTED` | On watchlist, notification required | SVHC Candidate List |
| `RESTRICTED` | Use limited with conditions | REACH Annex XVII, RoHS |
| `AUTHORIZED` | Requires authorization to use | REACH Annex XIV |
| `BANNED` | Prohibited completely | POP Regulation Annex I |

### Product Scopes

Hierarchical product categories for restrictions:

```
ALL_PRODUCTS
├── CONSUMER_GOODS
│   ├── TOYS
│   ├── CHILDCARE_ARTICLES
│   ├── JEWELRY
│   ├── COSMETICS
│   ├── FOOD_CONTACT
│   ├── TEXTILES
│   └── FURNITURE
├── EEE (Electrical/Electronic Equipment)
│   ├── BATTERIES
│   └── CABLES
├── VEHICLES
│   └── VEHICLE_COMPONENTS
├── CONSTRUCTION_PRODUCTS
├── PAINTS_COATINGS
├── PACKAGING
└── INDUSTRIAL
```

### Stub Substances

When regulatory lists reference substances not in EC Inventory:
- Seeder creates "stub" with minimal data
- `sourceVersion = "STUB:ANNEX_XVII:2026-01"`
- Can be enriched later via PubChem

### Specific Concentration Limits (SCL)

Some hazard classifications include concentration thresholds:

```json
{
  "operator": "gte",  // >=, >, <=, <, between
  "value": 0.1,
  "valueTo": 1.0,     // For "between" operator
  "unit": "PERCENT"   // or "PPM"
}
```

### M-Factors

Multipliers for aquatic hazard classification in mixtures. Higher M-factor = more toxic.

---

## Verification Queries

```bash
# Substance counts
docker exec eurocomply-postgres psql -U postgres -d eurocomply -c "
  SELECT COUNT(*) as total, COUNT(smiles) as enriched FROM substance;
"

# CLP classification counts
docker exec eurocomply-postgres psql -U postgres -d eurocomply -c "
  SELECT
    (SELECT COUNT(*) FROM hazard_class) as classes,
    (SELECT COUNT(*) FROM hazard_statement) as statements,
    (SELECT COUNT(*) FROM substance_hazard_classification) as classifications;
"

# CMR substances
docker exec eurocomply-postgres psql -U postgres -d eurocomply -c "
  SELECT hc.code, hc.full_name, COUNT(shc.id) as substances
  FROM hazard_class hc
  JOIN substance_hazard_classification shc ON shc.hazard_class_code = hc.code
  WHERE hc.is_cmr = true
  GROUP BY hc.code, hc.full_name;
"

# Regulatory list summary
docker exec eurocomply-postgres psql -U postgres -d eurocomply -c "
  SELECT rl.code, rl.name, COUNT(sle.id) as entries
  FROM regulatory_list rl
  LEFT JOIN substance_list_entry sle ON sle.regulatory_list_id = rl.id
  GROUP BY rl.code, rl.name;
"

# Alias distribution by source
docker exec eurocomply-postgres psql -U postgres -d eurocomply -c "
  SELECT source, COUNT(*) FROM substance_alias GROUP BY source;
"
```

---

## Complete Seeding Workflow

```bash
cd packages/gsr && pnpm build

# 1. Base substances (required)
pnpm gsr seed echa-inventory data/ec_inventory.i6z

# 2. Enrichment (recommended)
pnpm gsr enrich pubchem
pnpm gsr enrich echa-urls

# 3. CLP hazard classification
pnpm gsr seed clp-reference
pnpm gsr seed clp-harmonised data/clp_annex_vi.xlsx --atp-version ATP21

# 4. Regulatory lists
pnpm gsr seed echa-svhc --entries data/svhc_entries.xlsx --substances data/svhc_substances.xlsx
pnpm gsr seed echa-annex-xvii --entries data/xvii_entries.xlsx --substances data/xvii_substances.xlsx
pnpm gsr seed echa-annex-xiv --entries data/xiv_entries.xlsx --substances data/xiv_substances.xlsx
pnpm gsr seed echa-pop --entries data/pop_entries.xlsx --substances data/pop_substances.xlsx
pnpm gsr seed rohs
```

---

## File Locations

| Type | Location |
|------|----------|
| Entities (database package) | `packages/database/src/entities/` |
| Entities (GSR package) | `packages/gsr/src/entities/` |
| Seeders | `packages/gsr/src/seeders/` |
| Parsers | `packages/gsr/src/parsers/` |
| Reference Data | `packages/gsr/src/reference-data/` |
| CLI | `packages/gsr/src/cli/` |
| Data Files | `packages/gsr/data/` |

---

## Related Documentation

- [GSR Data Sources](../GSR_DATA_SOURCES.md) - Detailed data source descriptions
- [Substance Tables](./SUBSTANCE_TABLES.md) - Database schema documentation
- [CLP Integration Design](../plans/2026-02-01-clp-integration-design.md) - CLP implementation details
- [GSR Design](../plans/2026-01-31-global-substance-registry-design.md) - Original GSR design

---

*Last Updated: 2026-02-01*
