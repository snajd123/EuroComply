# Substance Tables Guide

This document explains the Global Substance Registry (GSR) database schema - what each table does and what each column means.

---

## Overview

The GSR manages chemical substance data for regulatory compliance. The tables are organized into three layers:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CORE REFERENCE DATA                                                        │
│  ┌─────────────┐    ┌─────────────────┐    ┌────────────────┐              │
│  │  substance  │◄───│ substance_alias │    │ registry_source│              │
│  │  (master)   │    │  (synonyms)     │    │  (provenance)  │              │
│  └──────┬──────┘    └─────────────────┘    └────────────────┘              │
│         │                                                                   │
├─────────┼───────────────────────────────────────────────────────────────────┤
│  CLP HAZARD CLASSIFICATION                                                  │
│         │                                                                   │
│  ┌──────▼──────────────────┐    ┌─────────────┐    ┌──────────────────┐    │
│  │ substance_hazard_       │───►│ hazard_class│    │ hazard_statement │    │
│  │ classification          │    │   (~33)     │    │  (~91 H-codes)   │    │
│  └─────────────────────────┘    └─────────────┘    └──────────────────┘    │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  GROUPING & REGULATORY LISTS                                                │
│         │                                                                   │
│  ┌──────▼──────┐    ┌───────────────────┐    ┌─────────────────┐           │
│  │ substance_  │◄───│ substance_list_   │───►│ regulatory_list │           │
│  │   group     │    │     entry         │    │                 │           │
│  └─────────────┘    └───────────────────┘    └─────────────────┘           │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  RESOLUTION QUEUE                                                           │
│  ┌─────────────────────┐                                                   │
│  │ unresolved_substance│  (substances that couldn't be matched)            │
│  └─────────────────────┘                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Tables

### `substance` - Master Chemical Records

The central table containing one record per unique chemical substance.

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `id` | string | CUID primary key | `"clx1abc..."` |
| `cas_number` | string(20) | **CAS Registry Number** - globally unique chemical identifier, validated with checksum | `"50-00-0"` (formaldehyde) |
| `ec_number` | string(20) | **EC/EINECS Number** - EU chemical inventory number | `"200-001-8"` |
| `primary_name` | text | Most common or IUPAC name | `"formaldehyde"` |
| `description` | text | Optional detailed description | |
| `molecular_weight` | decimal(12,4) | Molecular mass in g/mol | `"30.0260"` |
| `molecular_formula` | string(500) | Chemical formula | `"CH2O"` |
| `smiles` | text | **SMILES notation** - machine-readable structure | `"C=O"` |
| `inchi_key` | string(27) | **InChIKey** - structure hash for matching | `"WSFSSNUMVMOOMR-..."` |
| `iupac_name` | text | Systematic IUPAC name | `"methanal"` |
| `echa_url` | text | Link to ECHA substance page | `"https://echa.europa.eu/..."` |
| `index_number` | string(20) | CLP Annex VI index number | `"650-017-00-8"` |
| `clp_version` | string(20) | CLP data version (ATP number) | `"ATP21"` |
| `source_version` | string | Data version identifier | `"2026-01"` |
| `is_active` | boolean | Soft delete flag | `true` |
| `created_at` | timestamp | Record creation time | |
| `updated_at` | timestamp | Last modification time | |

**Key Identifiers Explained:**

- **CAS Number**: Chemical Abstracts Service registry number (e.g., `50-00-0`). The standard way to identify chemicals. Has a checksum digit for validation.
- **EC Number**: European Community number (e.g., `200-001-8`). Used in EU regulations.
- **SMILES**: Simplified Molecular Input Line Entry System. Text representation of chemical structure that software can parse.
- **InChIKey**: 27-character hash of the InChI (International Chemical Identifier). Used for exact structure matching.

---

### `substance_alias` - Alternative Names

Stores all alternative names, synonyms, and identifiers for substances.

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `id` | string | CUID primary key | |
| `substance_id` | string | FK to `substance` | |
| `name` | text | The alternative name | `"formalin"` |
| `type` | enum | Category of alias (see below) | `"COMMON"` |
| `language` | string(10) | ISO language code | `"en"` |
| `name_normalized` | text | Lowercase, cleaned for matching | `"formalin"` |
| `source` | enum | Where this alias came from | `"PUBCHEM"` |

**Alias Types (`type` column):**

| Value | Description | Example |
|-------|-------------|---------|
| `IUPAC` | Systematic IUPAC name | `"methanal"` |
| `COMMON` | Common/trivial name | `"formalin"` |
| `TRADE` | Trade/brand name, registry IDs | `"EINECS 200-001-8"` |
| `SYNONYM` | General synonym | `"formol"` |
| `INDEX_NAME` | CLP Annex VI index name | `"formaldehyde...%"` |

**Alias Sources (`source` column):**

| Value | Description |
|-------|-------------|
| `PUBCHEM` | Fetched from PubChem API |
| `ECHA` | From ECHA EC Inventory |
| `EPA` | From US EPA databases |
| `MANUAL` | Manually entered |

---

### `registry_source` - Data Provenance

Tracks which external sources have been synced and when.

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `id` | string | CUID primary key | |
| `name` | enum | Source identifier | `"PUBCHEM"` |
| `version` | string(50) | Data version | `"2026-01"` |
| `last_synced_at` | timestamp | When last updated | |
| `record_count` | int | Records from this source | `7476` |
| `source_url` | text | Original data URL | |

**Source Names:**

| Value | Description |
|-------|-------------|
| `ECHA_EC` | ECHA EC Inventory (base substance list) |
| `ECHA_SVHC` | ECHA SVHC Candidate List |
| `ECHA_ANNEX_XVII` | REACH Annex XVII restrictions |
| `ECHA_ANNEX_XIV` | REACH Annex XIV authorization list |
| `PUBCHEM` | PubChem enrichment data |
| `TSCA` | US EPA TSCA inventory |
| `PROP65` | California Proposition 65 |

---

## Grouping Tables

### `substance_group` - Chemical Families

Groups related substances (e.g., "Lead and its compounds", "PFAS").

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `id` | string | CUID primary key | |
| `code` | string(100) | Unique identifier | `"LEAD_COMPOUNDS"` |
| `name` | text | Display name | `"Lead and its compounds"` |
| `description` | text | Optional description | |
| `parent_group_id` | string | FK for nested groups | |

### `substance_group_member` - Group Membership

Junction table linking substances to groups.

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `id` | string | CUID primary key | |
| `group_id` | string | FK to `substance_group` | |
| `substance_id` | string | FK to `substance` | |
| `inheritance_type` | enum | How determined | `"EXPLICIT"` |
| `notes` | text | Optional notes | |

**Inheritance Types:**

| Value | Description |
|-------|-------------|
| `EXPLICIT` | Directly listed in source data |
| `DERIVED` | Inferred from chemical structure/properties |

---

## Regulatory List Tables

### `regulatory_list` - Regulation Definitions

Defines regulatory substance lists.

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `id` | string | CUID primary key | |
| `code` | string(100) | Unique identifier | `"REACH_SVHC"` |
| `name` | text | Display name | `"REACH SVHC Candidate List"` |
| `jurisdiction` | string(20) | Region code | `"EU"` |
| `publisher` | string(50) | Authority | `"ECHA"` |
| `description` | text | What this list covers | |
| `source_url` | text | Official source | |
| `version` | string(50) | List version | `"2026-01"` |
| `last_updated_at` | timestamp | When list was updated | |

### `substance_list_entry` - List Memberships

Links substances to regulatory lists with specific conditions.

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `id` | string | CUID primary key | |
| `substance_id` | string | FK to `substance` (nullable) | |
| `substance_group_id` | string | FK to `substance_group` (nullable) | |
| `regulatory_list_id` | string | FK to `regulatory_list` | |
| `status` | enum | Restriction level | `"RESTRICTED"` |
| `listing_date` | date | When added to list | |
| `effective_date` | date | When restriction applies | |
| `sunset_date` | date | Authorization expiry | |
| `threshold` | decimal | Concentration limit | `0.1` |
| `threshold_unit` | enum | Unit for threshold | `"PERCENT_WEIGHT"` |
| `threshold_operator` | enum | Comparison type | `"LESS_THAN_OR_EQUAL"` |
| `scopes` | array | Product categories affected | `["TOYS", "TEXTILES"]` |
| `scope_raw` | text | Original scope text | |
| `conditions` | jsonb | Additional conditions | `{"exemptions": [...]}` |
| `source_reference` | text | Regulation reference | `"Annex XVII Entry 63"` |

**Listing Status:**

| Value | Description |
|-------|-------------|
| `LISTED` | On a watchlist (SVHC candidate) |
| `RESTRICTED` | Use limited with conditions |
| `BANNED` | Prohibited |
| `AUTHORIZED` | Requires authorization to use |

**Product Scopes:**

Hierarchical product categories. Parent rules apply to children.

```
ALL_PRODUCTS
├── CONSUMER_GOODS
│   ├── TOYS
│   │   └── CHILDCARE_ARTICLES
│   ├── JEWELRY
│   ├── COSMETICS
│   ├── FOOD_CONTACT
│   ├── TEXTILES
│   └── FURNITURE
├── EEE (Electronics)
│   ├── BATTERIES
│   └── CABLES
├── VEHICLES
│   └── VEHICLE_COMPONENTS
├── CONSTRUCTION_PRODUCTS
│   └── PAINTS_COATINGS
├── PACKAGING
└── INDUSTRIAL
```

---

## Resolution Queue

### `unresolved_substance` - Matching Queue

Holds substances that couldn't be automatically matched to master records.

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `id` | string | CUID primary key | |
| `raw_name` | text | What was extracted | `"lead (Pb)"` |
| `raw_cas_number` | string(50) | CAS if provided (may be invalid) | `"7439-92-1"` |
| `source` | enum | Where it came from | `"EXTRACTION"` |
| `occurrence_count` | int | How often seen | `5` |
| `status` | enum | Current state | `"PENDING"` |
| `resolution_type` | enum | How resolved | `"MANUAL_MATCH"` |
| `resolved_substance_id` | string | FK to matched `substance` | |
| `resolved_at` | timestamp | When resolved | |
| `resolved_by` | string | Who resolved it | |

**Unresolved Sources:**

| Value | Description |
|-------|-------------|
| `EXTRACTION` | AI extracted from documents |
| `CUSTOMER_UPLOAD` | Customer-provided data |
| `BOM_IMPORT` | Bill of materials import |

**Resolution Statuses:**

| Value | Description |
|-------|-------------|
| `PENDING` | Awaiting review |
| `CANDIDATES` | Multiple possible matches found |
| `RESOLVED` | Successfully matched |
| `REJECTED` | Determined to be invalid |

---

## CLP Classification Tables

These tables store CLP (Classification, Labelling and Packaging) hazard data from EU Regulation EC 1272/2008.

### `hazard_class` - GHS Hazard Classes

Stores the ~33 CLP/GHS hazard classes with metadata.

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `code` | string(50) | **Primary Key** - CLP abbreviation | `"Carc."` |
| `full_name` | string(100) | Full hazard class name | `"Carcinogenicity"` |
| `hazard_type` | enum | Category (see below) | `"HEALTH"` |
| `pictogram` | string(10) | GHS pictogram code | `"GHS08"` |
| `signal_word` | enum | Warning level | `"DANGER"` |
| `is_cmr` | boolean | CMR substance flag | `true` |

**Hazard Types (`hazard_type`):**

| Value | Description | Examples |
|-------|-------------|----------|
| `PHYSICAL` | Physical hazards | Explosives, Flammable, Oxidising |
| `HEALTH` | Health hazards | Acute Toxicity, Carcinogenicity, Mutagenicity |
| `ENVIRONMENTAL` | Environmental hazards | Aquatic Acute/Chronic, Ozone |

**Signal Words (`signal_word`):**

| Value | Severity |
|-------|----------|
| `DANGER` | More severe hazards |
| `WARNING` | Less severe hazards |

---

### `hazard_statement` - H-Statements with Translations

Stores H-codes with translations for all 24 EU languages.

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `code` | string(20) | **Primary Key** - H-code | `"H350"` |
| `translations` | jsonb | Language → text mapping | `{"en": "May cause cancer.", "de": "Kann Krebs erzeugen."}` |
| `primary_hazard_class_code` | string(50) | FK to `hazard_class` (optional) | `"Carc."` |

**Supported Languages:** bg, cs, da, de, el, en, es, et, fi, fr, ga, hr, hu, it, lt, lv, mt, nl, pl, pt, ro, sk, sl, sv

**H-Code Ranges:**
- H200-H299: Physical hazards
- H300-H399: Health hazards
- H400-H499: Environmental hazards

---

### `substance_hazard_classification` - Substance Classifications

Junction table linking substances to their CLP Annex VI harmonised classifications.

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `id` | string | CUID primary key | |
| `substance_id` | string | FK to `substance` | |
| `hazard_class_code` | string(50) | FK to `hazard_class` | `"Carc."` |
| `category` | string(10) | Category within class | `"1A"` |
| `h_code` | string(20) | Associated H-statement | `"H350"` |
| `notes` | text[] | Regulatory notes | `["A", "C"]` |
| `scl_logic` | jsonb | Specific concentration limit | `{"operator": ">=", "value": 0.1, "unit": "%"}` |
| `m_factor` | int | Aquatic hazard multiplier | `10` |
| `is_minimum_classification` | boolean | Marked with asterisk (*) | `false` |
| `atp_source` | string(20) | ATP version | `"ATP21"` |
| `valid_from` | date | When classification became effective | |
| `valid_to` | date | When superseded (null if current) | |

**SCL Operators (`scl_logic.operator`):**

| Value | Meaning |
|-------|---------|
| `>=` | Greater than or equal |
| `>` | Greater than |
| `<=` | Less than or equal |
| `<` | Less than |

**Common Hazard Class Categories:**

| Class | Categories | Meaning |
|-------|------------|---------|
| Carc. (Carcinogenicity) | 1A, 1B, 2 | 1A=known, 1B=presumed, 2=suspected |
| Muta. (Mutagenicity) | 1A, 1B, 2 | Same as above |
| Repr. (Reproductive Toxicity) | 1A, 1B, 2 | Same as above |
| Acute Tox. | 1, 2, 3, 4 | 1=most severe |
| Skin Sens. | 1, 1A, 1B | A=strong, B=weak sensitizers |

---

## Data Flow

### 1. Initial Seeding
```
ECHA EC Inventory CSV → substance (9,841 records)
                      → substance_alias (INDEX_NAME aliases)
                      → registry_source (ECHA_EC record)
```

### 2. Enrichment
```
PubChem API → substance (adds SMILES, InChIKey, etc.)
            → substance_alias (adds PUBCHEM synonyms)
            → registry_source (PUBCHEM record)
```

### 3. Regulatory Lists
```
SVHC CSV → regulatory_list (REACH_SVHC)
         → substance_list_entry (links substances to list)
```

### 4. Runtime Matching
```
User input "lead oxide"
  → SubstanceResolver
  → matches substance_alias.name_normalized
  → returns Substance
  → or creates unresolved_substance if no match
```

---

## Common Queries

### Find substance by CAS
```sql
SELECT * FROM substance WHERE cas_number = '50-00-0';
```

### Get all aliases for a substance
```sql
SELECT sa.name, sa.type, sa.source
FROM substance_alias sa
JOIN substance s ON sa.substance_id = s.id
WHERE s.cas_number = '50-00-0';
```

### Find restricted substances for toys
```sql
SELECT s.cas_number, s.primary_name, sle.status, sle.threshold
FROM substance_list_entry sle
JOIN substance s ON sle.substance_id = s.id
WHERE 'TOYS' = ANY(sle.scopes)
  AND sle.status IN ('RESTRICTED', 'BANNED');
```

### Search by name (fuzzy)
```sql
SELECT * FROM substance_alias
WHERE name_normalized LIKE '%formaldehyde%';
```

### Count by enrichment status
```sql
SELECT
  COUNT(*) as total,
  COUNT(smiles) as enriched,
  COUNT(*) - COUNT(smiles) as unenriched
FROM substance;
```

### Alias distribution by source
```sql
SELECT source, type, COUNT(*)
FROM substance_alias
GROUP BY source, type
ORDER BY source, COUNT(*) DESC;
```

---

## Current Statistics (as of 2026-02-01)

| Table | Count |
|-------|-------|
| `substance` | 9,841 |
| `substance` (with SMILES) | 7,476 (76%) |
| `substance_alias` (ECHA) | 9,841 |
| `substance_alias` (PubChem) | 52,313 |
| **Total aliases** | **62,154** |
| `hazard_class` | 33 |
| `hazard_statement` | 91 |
| `substance_hazard_classification` | ~4,762* |

*\* Substance hazard classifications require seeding from CLP Annex VI XLSX file*

---

*Last Updated: 2026-02-01*
