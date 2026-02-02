# Global Substance Registry v2: Golden Record Architecture

> **Status:** PROPOSED
> **Created:** 2026-02-02
> **Supersedes:** 2026-01-31-global-substance-registry-design.md (v1)
> **Related:** 2026-02-01-clp-integration-design.md

---

## 1. Executive Summary

The **Golden Record Architecture** separates chemical identity from regulatory context. Instead of storing EC numbers, INCI names, and E-numbers as columns on a single substance table, we create one canonical "Golden Record" per unique chemical (keyed by InChIKey) and attach multiple "Personas" that represent how that chemical appears in different regulatory contexts.

**Why this matters:**
- **No more stubs**: A chemical without EU data isn't a "stub" - it's a Golden Record that happens to have zero EU personas (yet)
- **Cross-industry search**: Type "E211" and find Sodium Benzoate with its cosmetic restrictions, food ADI values, AND industrial hazard classifications
- **Context-aware UX**: In the Cosmetics workspace, show INCI names; in Food workspace, show E-numbers; in Electronics, show RoHS thresholds

**Foundation:** EPA CompTox DSSTox database (1,246,399 chemicals with pre-linked CAS → InChIKey → SMILES)

---

## 2. Problem Statement

### 2.1 Current State Analysis

| Aspect | Current (v1) | Problem |
|--------|--------------|---------|
| Total substances | 102,115 | Good coverage for EU, but US-centric products have gaps |
| Stub substances | 1,212 (1.2%) | Created during seeding when CAS found in CLP but not EC Inventory |
| Primary identifier | CAS number | Some chemicals share CAS (historical), some lack CAS entirely |
| EC number storage | Column on `substance` table | Mixes identity with EU-specific registry data |
| InChIKey | Not stored | Cannot deduplicate by actual chemical structure |
| CosIng/INCI names | Not supported | Cosmetics compliance impossible |
| E-numbers | Not supported | Food compliance impossible |
| TSCA status | Not supported | US market compliance impossible |

### 2.2 Requirements

1. **Full regulatory coverage** - EU + US markets
2. **Industry coverage** - Electronics, Textiles, Cosmetics, Food, Industrial chemicals
3. **Identity resolution** - Match by chemical fingerprint (InChIKey), not just CAS
4. **Context-aware personas** - Different identifiers for different regulatory contexts
5. **Backward compatible** - Existing CLP classifications and regulatory entries still work

---

## 3. Data Sources

### 3.1 EPA CompTox DSSTox (Foundation Layer)

**What it is:** The EPA's Distributed Structure-Searchable Toxicity database - a curated collection of all commercially and industrially relevant chemicals.

**Why it's the foundation:**
- Pre-linked mapping: CAS → InChIKey → SMILES (no API calls needed)
- 1.25 million chemicals (not just banned - ALL chemicals)
- Government-curated with quality control levels
- Freely available, no restrictions

**Data file:** `packages/gsr/data/DSSTox_CCD_dump_12092025/DSSToxCCDdump.csv`

**Statistics (verified):**

| Metric | Count | Coverage |
|--------|-------|----------|
| Total records | 1,246,399 | 100% |
| Has CAS number | 1,246,399 | 100% |
| Has InChIKey | 1,153,067 | 92.5% |
| Has SMILES | 1,156,096 | 92.8% |
| Has all three | 1,152,955 | 92.5% |

**Columns available:**

| Column | Type | Description | Maps To |
|--------|------|-------------|---------|
| `DTXSID` | String | EPA unique substance ID | `substance.dtxsid` |
| `PREFERRED_NAME` | String | Primary chemical name | `substance.canonical_name` |
| `CASRN` | String | CAS Registry Number | `substance.cas_number` |
| `DTXCID` | String | EPA compound ID | (reference only) |
| `INCHIKEY` | String | Chemical fingerprint (27 chars) | `substance.inchi_key` **PRIMARY KEY** |
| `IUPAC_NAME` | String | Systematic chemical name | `substance.iupac_name` |
| `SMILES` | String | Structure string | `substance.smiles` |
| `MOLECULAR_FORMULA` | String | e.g., "C8H9NO2" | `substance.molecular_formula` |
| `AVERAGE_MASS` | Decimal | Molecular weight | `substance.molecular_weight` |
| `MONOISOTOPIC_MASS` | Decimal | Exact mass | (optional) |
| `QSAR_READY_SMILES` | String | Standardized structure | (optional) |
| `MS_READY_SMILES` | String | Mass spec ready structure | (optional) |
| `IDENTIFIER` | String | Pipe-separated synonyms | Parsed into `substance_alias` |

**What the ~7.5% without InChIKey are:**
- Mixtures (e.g., "petroleum distillates")
- Polymers (no single molecular structure)
- UVCBs (Unknown or Variable composition, Complex reaction products, Biological materials)
- These are still usable - matched by CAS, just without structural fingerprint

---

### 3.2 ECHA EC Inventory (EU Identity Persona)

**What it is:** The European Chemicals Agency's inventory of substances on the European market.

**Purpose:** Provides EC numbers (EINECS, ELINCS, NLP) - the EU's chemical identity system.

**Data file:** Already seeded - `packages/gsr/data/` (existing EC Inventory CSV)

**Statistics:**
- ~106,000 substances
- Contains: EC number, CAS number, name, molecular formula

**Maps to:** `substance_echa` table

**Fields:**

| Column | Description |
|--------|-------------|
| `ec_number` | EU identifier (e.g., "200-001-8") |
| `inventory_type` | EINECS (pre-1981), ELINCS (post-1981), or NLP (No Longer Polymer) |
| `echa_url` | Link to ECHA substance information page |

---

### 3.3 CosIng (Cosmetics Persona)

**What it is:** The European Commission's database of cosmetic ingredients.

**Purpose:** Provides INCI names, cosmetic restrictions, and functional classifications.

**Regulatory basis:** Cosmetics Regulation (EC) No 1223/2009

**Data source:** https://ec.europa.eu/growth/tools-databases/cosing/ (official manual export)

**Data files (verified):** `packages/gsr/data/CosIng/`

| File | Rows | Content |
|------|------|---------|
| `COSING_Annex_II_v2.xls` | ~1,760 | Prohibited substances |
| `COSING_Annex_III_v2.xls` | ~380 | Restricted substances |
| `COSING_Annex_IV_v2.xls` | ~160 | Colorants |
| `COSING_Annex_V_v2.xls` | ~60 | Preservatives |
| `COSING_Annex_VI_v2.xls` | ~40 | UV Filters |

**Annex II Columns (Prohibited):**

| Column | Description | Example |
|--------|-------------|---------|
| `Reference Number` | Annex entry ID | "1", "2", "1a" |
| `Chemical name / INN` | Chemical name | "N-(5-Chlorobenzoxazol-2-yl)acetamide" |
| `CAS Number` | CAS Registry Number | "35783-57-4" |
| `EC Number` | EU EC number | "200-128-9" |
| `Regulation` | Legal reference | "(EC) 2009/1223" |
| `CMR` | CMR substance flag | "CMR" or empty |
| `SCCS opinions` | Scientific committee opinions | Reference list |
| `Identified INGREDIENTS` | Related INCI names | "ACETYLCHOLINE" |

**Annex III Columns (Restricted):**

| Column | Description | Example |
|--------|-------------|---------|
| `Reference Number` | Annex entry ID | "1" |
| `Chemical name / INN` | Chemical name | "Boric acid and borates" |
| `Name of Common Ingredients Glossary` | INCI name(s) | "BORIC ACID; SODIUM BORATE" |
| `CAS Number` | CAS (may be multiple) | "10043-35-3 / 1303-96-4" |
| `EC Number` | EC (may be multiple) | "233-139-2 / 215-540-4" |
| `Product Type, body parts` | Where allowed | "Oral products; Bath products" |
| `Maximum concentration in ready for use preparation` | Max % allowed | "0.5% (acid)" |
| `Wording of conditions of use and warnings` | Required warnings | "Not to be used for children under 3" |

**Annex IV Columns (Colorants):**

| Column | Description | Example |
|--------|-------------|---------|
| `Reference Number` | Annex entry ID | "1" |
| `Chemical name` | Chemical name | "Sodium tris(1,2-naphthoquinone...)ferrate" |
| `Colour index Number / Name` | CI number | "CI 10006" |
| `CAS Number` | CAS Registry Number | "16143-80-9" |
| `EC Number` | EU EC number | "240-299-7" |

**Annex V/VI Columns (Preservatives/UV Filters):**

| Column | Description | Example |
|--------|-------------|---------|
| `Reference Number` | Annex entry ID | "1" |
| `Chemical name / INN / XAN` | Chemical name | "Benzoic acid and its sodium salt" |
| `Name of Common Ingredients Glossary` | INCI name(s) | "BENZOIC ACID; SODIUM BENZOATE" |
| `CAS Number` | CAS (may be multiple) | "65-85-0 / 532-32-1" |
| `EC Number` | EC (may be multiple) | "200-618-2 / 208-534-8" |
| `Product Type, body parts` | Where/how allowed | "Rinse-off; Leave-on; Oral" |
| `Maximum concentration` | Max % per product type | "a) 2.5% b) 1.7% c) 0.5%" |

**Maps to:** `substance_cosing` table

---

### 3.4 EFSA Food Additives (Food Persona)

**What it is:** European Food Safety Authority's database of authorized food additives.

**Purpose:** Provides E-numbers, ADI values, and approved food categories.

**Regulatory basis:** Regulation (EC) No 1333/2008 on food additives

**Data source:** https://www.efsa.europa.eu/en/data-report/food-additive-re-evaluations (official)

**Data files (verified):** `packages/gsr/data/EFSA/`

| File | Records | Content |
|------|---------|---------|
| `ENumbers.txt` | 414 | E-number list with group flags |
| `OpenFoodToxTX22809_2023.xlsx` | 8,007 substances | Toxicology data with ADI values |
| `SubstanceCharacterisation_KJ_2023.xlsx` | 8,007 | CAS, EC, SMILES mappings |

**ENumbers.txt Columns (Tab-separated):**

| Column | Description | Example |
|--------|-------------|---------|
| `E no.` | E-number code | "E 211", "E 210 - 213" |
| `Is a group?` | Group indicator | "Yes" or "No" |
| `Additive/group name` | Additive name | "Sodium benzoate", "Benzoic acid - benzoates (BA)" |

**Sample E-number entries:**
```
E 586	No	4-Hexylresorcinol
E 950	No	Acesulfame K
E 210 - 213	Yes	Benzoic acid - benzoates (BA)
E 211	No	Sodium benzoate
E 160a(ii)	No	Beta-carotene
```

**OpenFoodTox Data Sheets:**

| Sheet | Purpose |
|-------|---------|
| `CHEM_ASSESS` | Risk assessments with ADI values (11,358 rows) |
| `COM_SYNONYM` | Synonyms including E-numbers (45,583 rows) |
| `COMPONENT` | Substance characterization with CAS, EC, SMILES |

**OpenFoodTox COM_SYNONYM Types:**
- `E number` - 184 entries linked to substances
- `CAS` - CAS Registry Numbers
- `EC name` - EC Inventory names
- `JECFA number` - FAO/WHO additive numbers

**Maps to:** `substance_efsa` table

**ADI (Acceptable Daily Intake):** The amount of a substance that can be consumed daily over a lifetime without appreciable health risk, expressed as mg per kg body weight per day.

---

### 3.5 US TSCA (US Industrial Persona)

**What it is:** The Toxic Substances Control Act Inventory - the US EPA's registry of chemicals in commerce.

**Purpose:** Determines if a chemical can be manufactured/imported in the US without notification.

**Regulatory basis:** Toxic Substances Control Act (15 U.S.C. §2601 et seq.)

**Data source:** https://www.epa.gov/tsca-inventory (official EPA download)

**Data file (verified):** `packages/gsr/data/tsca_inventory/TSCAINV_072025.csv`

**Statistics:**
- Total records: 70,754
- Active chemicals: ~42,578
- Inactive: ~28,176

**TSCA Inventory Columns:**

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `ID` | Integer | TSCA internal ID | 1, 2, 3... |
| `CASRN` | String | CAS Registry Number | "50-00-0" |
| `casregno` | String | CAS without dashes | "50000" |
| `UID` | String | Unique identifier | (often empty) |
| `EXP` | String | Experimental flag | (often empty) |
| `ChemName` | String | CA Index Name | "Formaldehyde" |
| `DEF` | String | Definition | (for complex substances) |
| `UVCB` | String | UVCB indicator | "UVCB" if applicable |
| `FLAG` | String | Special flags | "S", "P", "XU", etc. |
| `ACTIVITY` | String | Inventory status | "ACTIVE" or "INACTIVE" |

**Sample TSCA entries:**
```csv
ID,CASRN,casregno,UID,EXP,ChemName,DEF,UVCB,FLAG,ACTIVITY
1,50-00-0,50000,,,Formaldehyde,,,,ACTIVE
2,50-01-1,50011,,,"Guanidine, hydrochloride (1:1)",,,,ACTIVE
4,50-07-7,50077,,,"Azirino[2',3':3,4]pyrrolo...",,,S,ACTIVE
```

**TSCA Flags Explained:**

| Flag | Description |
|------|-------------|
| S | Substance has specific restrictions |
| P | Polymer |
| XU | Exempt from reporting under certain conditions |

**Maps to:** `substance_tsca` table

**TSCA Sections Explained:**

| Section | Description |
|---------|-------------|
| Section 4 | Testing requirements |
| Section 5 | Pre-manufacture Notification (PMN) - new chemicals must notify EPA |
| Section 6 | Risk evaluation and management - EPA can restrict/ban |
| Section 8 | Reporting and recordkeeping |
| SNUR | Significant New Use Rule - certain uses require notification |

---

### 3.6 EU Biocidal Products (Biocides Persona)

**What it is:** Active substances and suppliers for biocidal products in the EU (Article 95 list).

**Purpose:** Determines if a substance can be used as a disinfectant, preservative, pest control, etc.

**Regulatory basis:** Biocidal Products Regulation (EU) No 528/2012

**Data source:** https://echa.europa.eu/information-on-chemicals/biocidal-active-substances (official ECHA export)

**Data file (verified):** `packages/gsr/data/ECHA Biocides/art95_list_en.xlsx`

**Statistics:**
- Total entries: 5,265 (includes multiple suppliers per substance)
- Sheets: "Explanatory note", "Article 95 list", "Annex - Timely withdrawn AS"
- 22 product types

**Article 95 List Columns:**

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `Active Substance Name` | String | Full chemical name | "alpha-Cypermethrin" |
| `EC no.` | String | EC number | "214-619-0" or "Not allocated" |
| `CAS no.` | String | CAS Registry Number | "67375-30-8" |
| `PT` | Integer | Product Type (1-22) | 18 |
| `Entity Name` | String | Supplier company | "Sumitomo Chemical UK..." |
| `Country` | String | Supplier country | "Spain" |
| `Supplier Type` | String | Type of supplier | "Substance & Product Supplier" |
| `Inclusion Reason` | String | Why included | "RP Participant", "Art. 95 Submission" |
| `Inclusion Date AS-PT` | Date | When AS-PT was added | Excel date serial |
| `Inclusion Date Supplier` | Date | When supplier was added | Excel date serial |

**Sample Biocides entries:**
```
Active Substance Name: alpha-Cypermethrin
EC no.: Not allocated
CAS no.: 67375-30-8
PT: 18
Entity Name: Sharda Cropchem España S.L.
Country: Spain
Supplier Type: Substance & Product Supplier
Inclusion Reason: Art. 95 Submission
```

**Supplier Types:**
- `Substance Supplier` - Manufactures/imports the active substance
- `Product Supplier` - Manufactures/sells biocidal products
- `Substance & Product Supplier` - Both

**Inclusion Reasons:**
- `RP Participant` - Review Programme participant
- `Article 93` - Transitional measures support
- `AS not in the RP` - Active substance not in Review Programme
- `Third Party Dossier` - Alternative dossier submitter
- `Art. 95 Submission` - Direct Article 95 application

**Maps to:** `substance_biocide` table

**Biocidal Product Types (PT):**

| PT | Category | Examples |
|----|----------|----------|
| PT1 | Human hygiene | Hand sanitizers, soaps |
| PT2 | Disinfectants (private/public) | Surface disinfectants |
| PT3 | Veterinary hygiene | Animal housing disinfection |
| PT4 | Food/feed area | Food processing sanitizers |
| PT5 | Drinking water | Water treatment |
| PT6 | Preservatives (in-can) | Paint preservatives |
| PT7 | Film preservatives | Coating preservatives |
| PT8 | Wood preservatives | Timber treatment |
| PT9 | Fibre/leather preservatives | Textile treatment |
| PT10 | Construction preservatives | Masonry treatment |
| PT11 | Liquid cooling preservatives | Industrial cooling |
| PT12 | Slimicides | Paper mill biocides |
| PT13 | Metalworking preservatives | Cutting fluid biocides |
| PT14 | Rodenticides | Rat poison |
| PT15 | Avicides | Bird control |
| PT16 | Molluscicides | Snail/slug control |
| PT17 | Piscicides | Fish control |
| PT18 | Insecticides | Insect control |
| PT19 | Repellents/attractants | Mosquito repellent |
| PT20 | Other vertebrate control | Mole control |
| PT21 | Antifouling | Ship hull coatings |
| PT22 | Embalming/taxidermy | Preservation fluids |

---

### 3.7 Existing Sources (Retained from v1)

These sources remain unchanged but now link to Golden Records:

| Source | Records | Links To |
|--------|---------|----------|
| CLP Harmonised List | 4,762 substances | `substance_hazard_classification` |
| SVHC Candidate List | ~250 entries | `substance_regulatory_entry` |
| REACH Annex XVII | ~80 entries | `substance_regulatory_entry` |
| REACH Annex XIV | ~60 entries | `substance_regulatory_entry` |
| POP Regulation | ~30 entries | `substance_regulatory_entry` |
| RoHS Directive | 10 substances | `substance_regulatory_entry` |

---

## 4. Architecture

### 4.1 The Golden Record Pattern

```
                          ┌─────────────────────────────────────┐
                          │       GOLDEN RECORD (substance)     │
                          │                                     │
                          │  inchi_key: "RZVAJINKPMORJF-UH..."  │ ◄── Chemical DNA
                          │  cas_number: "103-90-2"             │
                          │  canonical_name: "Acetaminophen"    │
                          │  smiles: "CC(=O)NC1=CC=C(O)C=C1"    │
                          │  molecular_formula: "C8H9NO2"       │
                          │  molecular_weight: 151.165          │
                          │                                     │
                          └──────────────┬──────────────────────┘
                                         │
           ┌─────────────────────────────┼─────────────────────────────┐
           │                             │                             │
           ▼                             ▼                             ▼
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│    ECHA PERSONA     │     │   COSING PERSONA    │     │    EFSA PERSONA     │
│                     │     │                     │     │                     │
│ ec_number: 203-157-5│     │ inci_name: PARACETA │     │ (not a food additive│
│ inventory: EINECS   │     │   MOL               │     │  - no persona)      │
│ echa_url: https://..│     │ functions: [anal-   │     │                     │
│                     │     │   gesic]            │     │                     │
│                     │     │ restriction: none   │     │                     │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
           │                             │
           │                             │
           ▼                             ▼
┌─────────────────────┐     ┌─────────────────────┐
│   TSCA PERSONA      │     │  REGULATORY ENTRIES │
│                     │     │                     │
│ status: ACTIVE      │     │ (existing tables)   │
│ section_5: false    │     │ - SVHC: no          │
│ section_6: false    │     │ - CLP: classified   │
│ snur: false         │     │                     │
└─────────────────────┘     └─────────────────────┘
```

**Key Principle:** The Golden Record stores **what the chemical IS**. Personas store **how it's identified in different registries**. Regulatory entries store **what rules apply to it**.

### 4.2 Schema Design

#### 4.2.1 `substance` (Golden Record) - REVISED

```sql
CREATE TABLE public.substance (
    -- Identity
    id                  VARCHAR(30) PRIMARY KEY,
    inchi_key           VARCHAR(27) UNIQUE,           -- Chemical fingerprint (NULL for mixtures/polymers)
    cas_number          VARCHAR(20),                  -- CAS Registry Number (indexed, not unique - historical duplicates exist)
    dtxsid              VARCHAR(20) UNIQUE,           -- EPA CompTox ID (e.g., "DTXSID2020006")

    -- Names
    canonical_name      TEXT NOT NULL,                -- Primary name (from CompTox PREFERRED_NAME)
    iupac_name          TEXT,                         -- Systematic IUPAC name

    -- Structure
    smiles              TEXT,                         -- Chemical structure string
    molecular_formula   VARCHAR(500),                 -- e.g., "C8H9NO2"
    molecular_weight    DECIMAL(12, 4),               -- Average mass

    -- Data Quality
    qc_level            SMALLINT,                     -- CompTox QC level (1-5, higher = more curated)

    -- Status
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE UNIQUE INDEX idx_substance_inchi ON public.substance(inchi_key) WHERE inchi_key IS NOT NULL;
CREATE INDEX idx_substance_cas ON public.substance(cas_number) WHERE cas_number IS NOT NULL;
CREATE INDEX idx_substance_dtxsid ON public.substance(dtxsid) WHERE dtxsid IS NOT NULL;
CREATE INDEX idx_substance_name_trgm ON public.substance USING gin (canonical_name gin_trgm_ops);
CREATE INDEX idx_substance_name_lower ON public.substance(LOWER(canonical_name));
```

**Why InChIKey can be NULL:** Approximately 7.5% of chemicals in CompTox are mixtures, polymers, or UVCBs that don't have a single molecular structure. They still have CAS numbers and can be matched that way.

**Why CAS is not UNIQUE:** Historical CAS assignment errors mean some different chemicals were accidentally given the same CAS number. InChIKey is the true unique identifier.

#### 4.2.2 `substance_echa` (EU Identity)

**Note:** The existing `substance` table already stores EC numbers from the ECHA EC Inventory seeder. For v2, EC numbers remain on the `substance` table (not a separate persona table) since every EU chemical has exactly one EC number. The ECHA "persona" concept is implicit - if a substance has an EC number, it's in the EU registry.

Existing columns on `substance` table:
- `ec_number` - EU identifier (e.g., "200-001-8")
- `echa_url` - Link to ECHA substance information page

No separate `substance_echa` table is created - this simplifies the schema while maintaining the Golden Record pattern for the new registries (CosIng, EFSA, TSCA, Biocides) where a substance may have multiple entries or complex relationships.

**Inventory Types:**
- **EINECS** (European INventory of Existing Commercial chemical Substances): Chemicals on the market before September 18, 1981
- **ELINCS** (European LIst of Notified Chemical Substances): New chemicals notified after 1981
- **NLP** (No Longer Polymers): Substances that were once considered polymers but are now distinct substances

#### 4.2.3 `substance_cosing` (Cosmetics)

```sql
CREATE TABLE public.substance_cosing (
    id                      VARCHAR(30) PRIMARY KEY,
    substance_id            VARCHAR(30) NOT NULL REFERENCES public.substance(id) ON DELETE CASCADE,

    -- CosIng Identity
    cosing_ref              VARCHAR(20) NOT NULL,         -- CosIng reference number
    inci_name               TEXT NOT NULL,                -- e.g., "SODIUM BENZOATE"
    inci_name_normalized    TEXT NOT NULL,                -- Lowercase for search

    -- Classification
    functions               TEXT[],                       -- Array: ["preservative", "masking", "fragrance"]

    -- Restrictions (Cosmetics Regulation Annexes)
    restriction_type        VARCHAR(20),                  -- ANNEX_II, ANNEX_III, ANNEX_IV, ANNEX_V, ANNEX_VI, NULL
    restriction_text        TEXT,                         -- Full restriction description
    max_concentration       DECIMAL(10, 4),               -- Maximum % allowed
    concentration_unit      VARCHAR(20),                  -- Usually "PERCENT"

    -- Additional Info
    other_restrictions      TEXT,                         -- Other conditions
    sccs_opinions           JSONB,                        -- Scientific Committee opinions

    -- Metadata
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_persona_cosing_substance UNIQUE (substance_id),
    CONSTRAINT uq_persona_cosing_ref UNIQUE (cosing_ref)
);

CREATE INDEX idx_persona_cosing_inci ON public.substance_cosing USING gin (inci_name_normalized gin_trgm_ops);
CREATE INDEX idx_persona_cosing_substance ON public.substance_cosing(substance_id);
CREATE INDEX idx_persona_cosing_restriction ON public.substance_cosing(restriction_type) WHERE restriction_type IS NOT NULL;
```

**INCI Name Convention:** International Nomenclature of Cosmetic Ingredients - always UPPERCASE, Latin-based names (e.g., "AQUA" not "Water", "SODIUM BENZOATE" not "sodium benzoate").

#### 4.2.4 `substance_efsa` (Food)

```sql
CREATE TABLE public.substance_efsa (
    id                      VARCHAR(30) PRIMARY KEY,
    substance_id            VARCHAR(30) NOT NULL REFERENCES public.substance(id) ON DELETE CASCADE,

    -- EFSA Identity
    e_number                VARCHAR(10),                  -- e.g., "E211" (NULL for flavors without E-number)
    efsa_ref                VARCHAR(50),                  -- EFSA reference ID

    -- Classification
    functional_class        VARCHAR(50) NOT NULL,         -- Preservative, Emulsifier, Colorant, Sweetener, etc.

    -- Safety Assessment
    adi_value               DECIMAL(10, 4),               -- Acceptable Daily Intake value
    adi_unit                VARCHAR(20),                  -- "mg/kg bw/day" (milligrams per kilogram body weight per day)
    adi_note                TEXT,                         -- "not specified", "not limited", etc.

    -- Approved Uses
    approved_uses           TEXT[],                       -- Food categories where permitted
    conditions              TEXT,                         -- Usage conditions and maximum levels

    -- Re-evaluation
    re_evaluation_date      DATE,                         -- Last EFSA re-evaluation
    re_evaluation_outcome   VARCHAR(50),                  -- SAFE, SAFE_WITH_CONDITIONS, UNDER_REVIEW, etc.

    -- Metadata
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_persona_efsa_substance UNIQUE (substance_id)
);

CREATE INDEX idx_persona_efsa_e ON public.substance_efsa(e_number) WHERE e_number IS NOT NULL;
CREATE INDEX idx_persona_efsa_substance ON public.substance_efsa(substance_id);
CREATE INDEX idx_persona_efsa_class ON public.substance_efsa(functional_class);
```

**ADI Explained:** The Acceptable Daily Intake is expressed as mg/kg bw/day (milligrams per kilogram of body weight per day). For a 70kg adult, an ADI of 5 mg/kg bw/day means up to 350mg can be safely consumed daily for a lifetime.

**Special ADI Values:**
- `NULL` with note "not specified" = ADI not necessary (e.g., natural substances)
- `NULL` with note "not limited" = No safety concern at any reasonable level
- `0` = Substance should not be consumed (phased out)

#### 4.2.5 `substance_tsca` (US Industrial)

```sql
CREATE TABLE public.substance_tsca (
    id                      VARCHAR(30) PRIMARY KEY,
    substance_id            VARCHAR(30) NOT NULL REFERENCES public.substance(id) ON DELETE CASCADE,

    -- TSCA Identity
    tsca_cas                VARCHAR(20) NOT NULL,         -- CAS as listed on TSCA (may differ from primary CAS)

    -- Inventory Status
    inventory_status        VARCHAR(20) NOT NULL,         -- ACTIVE, INACTIVE

    -- Regulatory Flags
    is_section_5            BOOLEAN DEFAULT FALSE,        -- Pre-manufacture Notification required for new uses
    is_section_6            BOOLEAN DEFAULT FALSE,        -- Under EPA risk evaluation
    is_snur                 BOOLEAN DEFAULT FALSE,        -- Significant New Use Rule applies

    -- Chemical Data Reporting
    cdr_flags               JSONB,                        -- CDR requirements and exemptions

    -- Metadata
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_persona_tsca_substance UNIQUE (substance_id),
    CONSTRAINT uq_persona_tsca_cas UNIQUE (tsca_cas)
);

CREATE INDEX idx_persona_tsca_cas ON public.substance_tsca(tsca_cas);
CREATE INDEX idx_persona_tsca_substance ON public.substance_tsca(substance_id);
CREATE INDEX idx_persona_tsca_status ON public.substance_tsca(inventory_status);
CREATE INDEX idx_persona_tsca_section6 ON public.substance_tsca(is_section_6) WHERE is_section_6 = TRUE;
```

**TSCA Inventory Status:**
- **ACTIVE**: Currently manufactured or imported in the US
- **INACTIVE**: No manufacturing/import activity reported in recent CDR cycles

**Why TSCA CAS may differ:** TSCA was created in 1976 and some CAS assignments have since been corrected. The TSCA inventory preserves the original CAS for regulatory continuity.

#### 4.2.6 `substance_biocide` (EU Biocides)

```sql
CREATE TABLE public.substance_biocide (
    id                      VARCHAR(30) PRIMARY KEY,
    substance_id            VARCHAR(30) NOT NULL REFERENCES public.substance(id) ON DELETE CASCADE,

    -- Biocides Identity
    biocides_ref            VARCHAR(50) NOT NULL,         -- ECHA biocides reference
    substance_name          TEXT NOT NULL,                -- Name as listed in BPR

    -- Approval Status
    status                  VARCHAR(30) NOT NULL,         -- APPROVED, NOT_APPROVED, UNDER_REVIEW, PENDING

    -- Product Types (which PT categories the substance is approved for)
    product_types           INTEGER[],                    -- Array of PT numbers [1, 2, 4, 5]

    -- Approval Period
    approval_date           DATE,
    expiry_date             DATE,

    -- Conditions
    conditions              TEXT,                         -- Approval conditions
    supplier_requirements   TEXT,                         -- Specific supplier obligations

    -- Metadata
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_persona_biocides_substance UNIQUE (substance_id),
    CONSTRAINT uq_persona_biocides_ref UNIQUE (biocides_ref)
);

CREATE INDEX idx_persona_biocides_substance ON public.substance_biocide(substance_id);
CREATE INDEX idx_persona_biocides_status ON public.substance_biocide(status);
CREATE INDEX idx_persona_biocides_pt ON public.substance_biocide USING gin (product_types);
CREATE INDEX idx_persona_biocides_expiry ON public.substance_biocide(expiry_date) WHERE expiry_date IS NOT NULL;
```

---

### 4.3 Identity Ladder (Resolution Algorithm)

When a seeder or user query provides a chemical identifier, the Identity Ladder resolves it to a Golden Record:

```
┌─────────────────────────────────────────────────────────────────────┐
│  INPUT: Any of these identifiers                                    │
│  - CAS: "103-90-2"                                                  │
│  - InChIKey: "RZVAJINKPMORJF-UHFFFAOYSA-N"                          │
│  - EC: "203-157-5"                                                  │
│  - INCI: "PARACETAMOL"                                              │
│  - E-number: "E211"                                                 │
│  - Name: "Acetaminophen"                                            │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                   ┌────────────────────────┐
                   │ Step 1: Check InChIKey │
                   │ (exact match)          │
                   └───────────┬────────────┘
                               │
              ┌────────────────┴────────────────┐
              │ Found?                          │
              ▼                                 ▼
        ┌──────────┐                    ┌──────────────┐
        │ RETURN   │                    │ Step 2: CAS  │
        │ Golden   │                    │ (exact match)│
        │ Record   │                    └──────┬───────┘
        └──────────┘                           │
                                ┌──────────────┴──────────────┐
                                │ Found?                      │
                                ▼                             ▼
                          ┌──────────┐              ┌──────────────────┐
                          │ RETURN   │              │ Step 3: EC Number│
                          │ Golden   │              │ (via ECHA persona)│
                          │ Record   │              └────────┬─────────┘
                          └──────────┘                       │
                                              ┌──────────────┴──────────────┐
                                              │ Found?                      │
                                              ▼                             ▼
                                        ┌──────────┐              ┌──────────────────┐
                                        │ RETURN   │              │ Step 4: INCI Name│
                                        │ Golden   │              │ (via CosIng)     │
                                        │ Record   │              └────────┬─────────┘
                                        └──────────┘                       │
                                                            ┌──────────────┴──────────────┐
                                                            │ Found?                      │
                                                            ▼                             ▼
                                                      ┌──────────┐              ┌──────────────────┐
                                                      │ RETURN   │              │ Step 5: E-Number │
                                                      │ Golden   │              │ (via EFSA)       │
                                                      │ Record   │              └────────┬─────────┘
                                                      └──────────┘                       │
                                                                          ┌──────────────┴──────────────┐
                                                                          │ Found?                      │
                                                                          ▼                             ▼
                                                                    ┌──────────┐              ┌──────────────────┐
                                                                    │ RETURN   │              │ Step 6: Fuzzy    │
                                                                    │ Golden   │              │ Name Match       │
                                                                    │ Record   │              │ (pg_trgm > 0.8)  │
                                                                    └──────────┘              └────────┬─────────┘
                                                                                                       │
                                                                                        ┌──────────────┴──────────────┐
                                                                                        │ Found with high confidence? │
                                                                                        ▼                             ▼
                                                                                  ┌──────────┐              ┌──────────────────┐
                                                                                  │ RETURN   │              │ Step 7: Queue    │
                                                                                  │ Golden   │              │ for PubChem      │
                                                                                  │ Record   │              │ Healer           │
                                                                                  └──────────┘              └──────────────────┘
```

**Implementation:**

```typescript
// packages/gsr/src/services/IdentityLadder.ts

export interface ResolveInput {
  inchiKey?: string;
  casNumber?: string;
  ecNumber?: string;
  inciName?: string;
  eNumber?: string;
  name?: string;
}

export interface ResolveResult {
  status: 'FOUND' | 'NOT_FOUND';
  substance?: Substance;
  matchedVia?: 'INCHIKEY' | 'CAS' | 'EC' | 'INCI' | 'E_NUMBER' | 'NAME_FUZZY';
  confidence: number;  // 1.0 for exact matches, <1.0 for fuzzy
}

export class IdentityLadder {
  constructor(private readonly em: EntityManager) {}

  async resolve(input: ResolveInput): Promise<ResolveResult> {
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

    // Step 3: EC Number (via ECHA persona)
    if (input.ecNumber) {
      const persona = await this.em.findOne(SubstancePersonaEcha,
        { ecNumber: input.ecNumber },
        { populate: ['substance'] }
      );
      if (persona) {
        return { status: 'FOUND', substance: persona.substance, matchedVia: 'EC', confidence: 1.0 };
      }
    }

    // Step 4: INCI Name (via CosIng persona)
    if (input.inciName) {
      const normalized = input.inciName.toLowerCase().trim();
      const persona = await this.em.findOne(SubstancePersonaCosing,
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
      const persona = await this.em.findOne(SubstancePersonaEfsa,
        { eNumber: normalized },
        { populate: ['substance'] }
      );
      if (persona) {
        return { status: 'FOUND', substance: persona.substance, matchedVia: 'E_NUMBER', confidence: 1.0 };
      }
    }

    // Step 6: Fuzzy name match (pg_trgm)
    if (input.name) {
      const result = await this.em.execute(`
        SELECT s.*, similarity(LOWER(s.canonical_name), LOWER($1)) as sim
        FROM substance s
        WHERE similarity(LOWER(s.canonical_name), LOWER($1)) > 0.8
        ORDER BY sim DESC
        LIMIT 1
      `, [input.name]);

      if (result.length > 0) {
        const substance = await this.em.findOne(Substance, { id: result[0].id });
        return {
          status: 'FOUND',
          substance: substance!,
          matchedVia: 'NAME_FUZZY',
          confidence: result[0].sim
        };
      }
    }

    // Step 7: Not found - will be queued for PubChem healer
    return { status: 'NOT_FOUND', confidence: 0 };
  }
}
```

---

### 4.4 Relationship to Existing Tables

The Golden Record architecture integrates with existing v1 tables:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GOLDEN RECORD                                 │
│                        (substance)                                   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
       ┌───────────────────────┼───────────────────────┐
       │                       │                       │
       ▼                       ▼                       ▼
┌──────────────┐     ┌──────────────────┐    ┌─────────────────────┐
│ PERSONAS     │     │ CLASSIFICATIONS  │    │ REGULATORY ENTRIES  │
│              │     │                  │    │                     │
│ - ECHA       │     │ substance_hazard │    │ substance_          │
│ - CosIng     │     │ _classification  │    │ regulatory_entry    │
│ - EFSA       │     │                  │    │                     │
│ - TSCA       │     │ (CLP Annex VI)   │    │ - SVHC              │
│ - Biocides   │     │                  │    │ - Annex XVII        │
└──────────────┘     └──────────────────┘    │ - Annex XIV         │
                                             │ - POP               │
                                             │ - RoHS              │
                                             └─────────────────────┘
       │                       │                       │
       └───────────────────────┼───────────────────────┘
                               │
                               ▼
                     ┌─────────────────────┐
                     │   GROUPS            │
                     │                     │
                     │ substance_group     │
                     │ substance_group_    │
                     │   member            │
                     └─────────────────────┘
```

**Changes to existing tables:**

| Table | Change | Reason |
|-------|--------|--------|
| `substance` | Remove `ec_number`, `echa_url` | Moved to ECHA persona |
| `substance` | Add `inchi_key`, `dtxsid`, `qc_level` | Golden Record identity |
| `substance_hazard_classification` | No change | Already uses `substance_id` FK |
| `substance_regulatory_entry` | No change | Already uses `substance_id` FK |
| `substance_group_member` | No change | Already uses `substance_id` FK |
| `substance_alias` | No change | Already uses `substance_id` FK |

---

### 4.5 Index Strategy

```sql
-- Enable trigram extension for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Golden Record indexes
CREATE UNIQUE INDEX idx_substance_inchi ON public.substance(inchi_key) WHERE inchi_key IS NOT NULL;
CREATE INDEX idx_substance_cas ON public.substance(cas_number) WHERE cas_number IS NOT NULL;
CREATE INDEX idx_substance_dtxsid ON public.substance(dtxsid) WHERE dtxsid IS NOT NULL;
CREATE INDEX idx_substance_name_trgm ON public.substance USING gin (canonical_name gin_trgm_ops);
CREATE INDEX idx_substance_name_lower ON public.substance(LOWER(canonical_name));

-- ECHA persona indexes
CREATE INDEX idx_persona_echa_ec ON public.substance_echa(ec_number);
CREATE INDEX idx_persona_echa_substance ON public.substance_echa(substance_id);

-- CosIng persona indexes
CREATE INDEX idx_persona_cosing_inci ON public.substance_cosing USING gin (inci_name_normalized gin_trgm_ops);
CREATE INDEX idx_persona_cosing_substance ON public.substance_cosing(substance_id);
CREATE INDEX idx_persona_cosing_restriction ON public.substance_cosing(restriction_type)
    WHERE restriction_type IS NOT NULL;

-- EFSA persona indexes
CREATE INDEX idx_persona_efsa_e ON public.substance_efsa(e_number) WHERE e_number IS NOT NULL;
CREATE INDEX idx_persona_efsa_substance ON public.substance_efsa(substance_id);
CREATE INDEX idx_persona_efsa_class ON public.substance_efsa(functional_class);

-- TSCA persona indexes
CREATE INDEX idx_persona_tsca_cas ON public.substance_tsca(tsca_cas);
CREATE INDEX idx_persona_tsca_substance ON public.substance_tsca(substance_id);
CREATE INDEX idx_persona_tsca_status ON public.substance_tsca(inventory_status);
CREATE INDEX idx_persona_tsca_section6 ON public.substance_tsca(is_section_6) WHERE is_section_6 = TRUE;

-- Biocides persona indexes
CREATE INDEX idx_persona_biocides_substance ON public.substance_biocide(substance_id);
CREATE INDEX idx_persona_biocides_status ON public.substance_biocide(status);
CREATE INDEX idx_persona_biocides_pt ON public.substance_biocide USING gin (product_types);
CREATE INDEX idx_persona_biocides_expiry ON public.substance_biocide(expiry_date)
    WHERE expiry_date IS NOT NULL;
```

---

## 5. Seed Sequence

### 5.1 Order Matters

The seed sequence is critical. We must create Golden Records before attaching personas:

```
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 1: CompTox Foundation                                         │
│                                                                     │
│  - Load DSSToxCCDdump.csv (1,246,399 records)                       │
│  - Create Golden Records with InChIKey + CAS + SMILES               │
│  - Duration: ~5-10 minutes                                          │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 2: ECHA Persona                                               │
│                                                                     │
│  - Load EC Inventory (~106k records)                                │
│  - Use Identity Ladder to find Golden Record by CAS                 │
│  - Attach EC number as ECHA persona                                 │
│  - Expected: 99%+ match rate                                        │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 3: CLP Reference Data                                         │
│                                                                     │
│  - Seed hazard_class table (34 classes)                             │
│  - Seed hazard_statement table (91 H-codes, 24 languages)           │
│  - No substance linkage yet                                         │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 4: CLP Harmonised Classifications                             │
│                                                                     │
│  - Load CLP Annex VI XLSX (4,762 substances)                        │
│  - Use Identity Ladder to find Golden Record                        │
│  - Create substance_hazard_classification entries                   │
│  - Expected: 95%+ match rate                                        │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 5: CosIng Persona                                             │
│                                                                     │
│  - Load CosIng ingredients (~30k)                                   │
│  - Use Identity Ladder to find Golden Record                        │
│  - Attach INCI name, functions, restrictions as CosIng persona      │
│  - Expected: 90%+ match rate                                        │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 6: EFSA Persona                                               │
│                                                                     │
│  - Load food additives (~2k)                                        │
│  - Use Identity Ladder to find Golden Record                        │
│  - Attach E-number, ADI, functional class as EFSA persona           │
│  - Expected: 95%+ match rate                                        │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 7: TSCA Persona                                               │
│                                                                     │
│  - Load TSCA inventory (~86k active)                                │
│  - Use Identity Ladder to find Golden Record                        │
│  - Attach inventory status, section flags as TSCA persona           │
│  - Expected: 70%+ match rate (many US-only chemicals)               │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 8: Biocides Persona                                           │
│                                                                     │
│  - Load biocidal active substances (~1k)                            │
│  - Use Identity Ladder to find Golden Record                        │
│  - Attach approval status, product types as Biocides persona        │
│  - Expected: 90%+ match rate                                        │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 9: Regulatory Lists                                           │
│                                                                     │
│  - SVHC Candidate List                                              │
│  - REACH Annex XVII (Restrictions)                                  │
│  - REACH Annex XIV (Authorization)                                  │
│  - POP Regulation                                                   │
│  - RoHS Directive                                                   │
│  - All use Identity Ladder to link to Golden Records                │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 10: PubChem Healer                                            │
│                                                                     │
│  - Query unresolved_substance table                                 │
│  - For each unresolved: call PubChem API                            │
│  - If found: create Golden Record, attach persona                   │
│  - Rate limited: ~5 requests/second                                 │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 CLI Commands

```bash
# Full seed sequence (recommended for fresh database)
pnpm gsr seed all-golden

# Individual seeders (in order) - using verified file paths
pnpm gsr seed comptox data/DSSTox_CCD_dump_12092025/DSSToxCCDdump.csv
pnpm gsr seed echa-inventory data/EC_Inventory.i6z
pnpm gsr seed clp-reference
pnpm gsr seed clp-harmonised "data/Harmonised_List_2026-02-01 17_42_11.xlsx"
pnpm gsr seed cosing data/CosIng/                                    # All annexes
pnpm gsr seed efsa data/EFSA/                                        # ENumbers.txt + OpenFoodTox
pnpm gsr seed tsca data/tsca_inventory/TSCAINV_072025.csv
pnpm gsr seed biocides "data/ECHA Biocides/art95_list_en.xlsx"
pnpm gsr seed echa-svhc --entries "data/candidate_list_full-2026-01-30 (1).xlsx" --substances "data/candidate_list_2026-02-01 17_15_41.xlsx"
pnpm gsr seed echa-annex-xvii --entries "data/restriction_list_full-2025-09-12 (1).xlsx" --substances "data/restriction_list_2026-02-01 16_23_29.xlsx"
pnpm gsr seed echa-annex-xiv --entries "data/authorisation_list_full-2025-09-13.xlsx" --substances "data/authorisation_list_2026-02-01 17_04_46.xlsx"
pnpm gsr seed echa-pop --entries "data/pops_list_full-2025-09-12.xlsx" --substances "data/pops_list_2026-02-01 17_23_13.xlsx"
pnpm gsr seed rohs

# Healer (run after all seeders)
pnpm gsr enrich pubchem-healer --batch-size 100

# Validation
pnpm gsr validate-full
```

### 5.3 CompTox Seeder Implementation

```typescript
// packages/gsr/src/cli/seed.ts - comptox command

seedCommand
  .command('comptox <file>')
  .description('Seed Golden Records from EPA CompTox DSSTox CSV')
  .option('-d, --dry-run', 'Preview without writing to database', false)
  .option('--batch-size <size>', 'Records per batch', '10000')
  .action(async (file, options) => {
    const orm = await initOrm();
    const em = orm.em.fork();

    console.log(`[CompTox] Loading ${file}...`);

    // Stream the CSV to handle 600MB+ file
    const parser = fs.createReadStream(file)
      .pipe(stripBom())
      .pipe(csv.parse({ columns: true, skip_empty_lines: true }));

    let processed = 0;
    let created = 0;
    let batch: Substance[] = [];
    const batchSize = parseInt(options.batchSize);

    for await (const row of parser) {
      const substance = em.create(Substance, {
        dtxsid: row.DTXSID,
        canonicalName: row.PREFERRED_NAME,
        casNumber: sanitizeCas(row.CASRN) || null,
        inchiKey: row.INCHIKEY || null,
        iupacName: row.IUPAC_NAME || null,
        smiles: row.SMILES || null,
        molecularFormula: row.MOLECULAR_FORMULA || null,
        molecularWeight: row.AVERAGE_MASS ? parseFloat(row.AVERAGE_MASS) : null,
        qcLevel: null,  // Could parse from DTXCID if available
        isActive: true,
      });

      batch.push(substance);
      processed++;

      if (batch.length >= batchSize) {
        if (!options.dryRun) {
          await em.persistAndFlush(batch);
          em.clear();
        }
        console.log(`[CompTox] Processed ${processed.toLocaleString()} records...`);
        created += batch.length;
        batch = [];
      }
    }

    // Final batch
    if (batch.length > 0 && !options.dryRun) {
      await em.persistAndFlush(batch);
      created += batch.length;
    }

    console.log(`[CompTox] Complete: ${created.toLocaleString()} Golden Records created`);

    await orm.close();
  });
```

### 5.4 Persona Seeder Pattern

All persona seeders follow this pattern:

```typescript
// Generic persona seeder pattern

async function seedPersona<T>(
  file: string,
  parseRow: (row: any) => { identifier: ResolveInput; persona: Partial<T> },
  PersonaEntity: EntityClass<T>,
  options: { dryRun: boolean }
): Promise<SeedResult> {
  const identityLadder = new IdentityLadder(em);

  let attached = 0;
  let unresolved = 0;

  for await (const row of parser) {
    const { identifier, persona } = parseRow(row);

    // Use Identity Ladder to find Golden Record
    const result = await identityLadder.resolve(identifier);

    if (result.status === 'FOUND') {
      // Attach persona to existing Golden Record
      const entity = em.create(PersonaEntity, {
        ...persona,
        substanceId: result.substance!.id,
      });

      if (!options.dryRun) {
        await em.persistAndFlush(entity);
      }
      attached++;
    } else {
      // Queue for healer
      await em.create(UnresolvedSubstance, {
        rawName: identifier.name,
        rawCasNumber: identifier.casNumber,
        source: `${PersonaEntity.name}_SEEDER`,
        status: 'PENDING',
      });
      unresolved++;
    }
  }

  return { attached, unresolved };
}
```

### 5.5 Expected Coverage After Seeding

Based on verified source file counts:

| Source | Records | Expected Match | Notes |
|--------|---------|----------------|-------|
| CompTox (foundation) | 1,246,399 | 100% | Creates Golden Records |
| ECHA EC Inventory | 102,115 | 99%+ | Already in v1, updates existing |
| CLP Harmonised | 4,762 | 95%+ | 252 substances not in EC Inventory |
| CosIng Annexes | ~2,400 | 90%+ | Multiple annexes, some overlap |
| EFSA E-Numbers | 414 | 95%+ | Simple additive list |
| TSCA | 70,754 | 70%+ | Many US-only chemicals |
| Biocides Art 95 | 5,265 entries | 90%+ | Multiple suppliers per substance |

**Expected totals:**
- **Golden Records:** ~1,246,000 (from CompTox)
- **With InChIKey:** ~1,153,000 (92.5%)
- **With EC number:** ~102,000
- **CosIng entries:** ~2,400
- **EFSA entries:** ~400
- **TSCA entries:** ~70,000
- **Biocide entries:** ~1,000 unique substances

---

## 6. Migration from v1

### 6.1 Schema Changes

| Change Type | Table | Column | Action |
|-------------|-------|--------|--------|
| ADD | `substance` | `inchi_key` | New column (VARCHAR(27), UNIQUE) |
| ADD | `substance` | `dtxsid` | New column (VARCHAR(20), UNIQUE) |
| ADD | `substance` | `qc_level` | New column (SMALLINT) |
| REMOVE | `substance` | `ec_number` | Moved to `substance_echa` |
| REMOVE | `substance` | `echa_url` | Moved to `substance_echa` |
| NEW TABLE | `substance_echa` | - | EU identity persona |
| NEW TABLE | `substance_cosing` | - | Cosmetics persona |
| NEW TABLE | `substance_efsa` | - | Food persona |
| NEW TABLE | `substance_tsca` | - | US industrial persona |
| NEW TABLE | `substance_biocide` | - | Biocides persona |

### 6.2 Migration Steps (Local Dev per CLAUDE.md)

Per CLAUDE.md Section 7 - **single consolidated migration for local dev**:

```bash
# 1. Update the consolidated migration file
#    File: packages/database/src/migrations/Migration20260122000000.ts
#    Add: New persona tables, substance column changes

# 2. Reset database (drops all data)
pnpm db:reset

# 3. Run full seed sequence
pnpm gsr seed all-golden

# 4. Validate
pnpm gsr validate-full
```

**No data migration needed** - we wipe and re-seed.

### 6.3 Data Files Required (All Verified Present)

| File | Source | Size | Location |
|------|--------|------|----------|
| `DSSToxCCDdump.csv` | EPA CompTox | 664 MB | `data/DSSTox_CCD_dump_12092025/` |
| `EC_Inventory.i6z` | ECHA | 4 MB | `data/` |
| `Harmonised_List_2026-02-01.xlsx` | ECHA CLP | 371 KB | `data/` |
| `COSING_Annex_*.xls` (5 files) | EC CosIng | 1.5 MB total | `data/CosIng/` |
| `ENumbers.txt` | EC Official | 13 KB | `data/EFSA/` |
| `OpenFoodToxTX22809_2023.xlsx` | EFSA | 12 MB | `data/EFSA/` |
| `TSCAINV_072025.csv` | EPA TSCA | 9 MB | `data/tsca_inventory/` |
| `art95_list_en.xlsx` | ECHA Biocides | 363 KB | `data/ECHA Biocides/` |
| SVHC/Annex XIV/XVII/POP files | ECHA | various | `data/` |

**All files are from official government sources:**
- EPA (epa.gov) - CompTox, TSCA
- ECHA (echa.europa.eu) - EC Inventory, CLP, SVHC, Biocides
- European Commission (ec.europa.eu) - CosIng
- EFSA (efsa.europa.eu) - OpenFoodTox, E-numbers

---

## 7. API Changes

### 7.1 Substance Lookup Endpoint (Enhanced)

```
GET /api/v1/taxonomy/substances/:identifier

Accepts any of:
- CAS number: /api/v1/taxonomy/substances/103-90-2
- InChIKey: /api/v1/taxonomy/substances/RZVAJINKPMORJF-UHFFFAOYSA-N
- EC number: /api/v1/taxonomy/substances/203-157-5
- DTXSID: /api/v1/taxonomy/substances/DTXSID2020006

Returns: Golden Record with all attached personas
```

### 7.2 Response Shape

```typescript
interface SubstanceResponse {
  // Golden Record (always present)
  id: string;
  inchiKey: string | null;
  casNumber: string | null;
  dtxsid: string | null;
  canonicalName: string;
  iupacName: string | null;
  smiles: string | null;
  molecularFormula: string | null;
  molecularWeight: number | null;

  // Personas (present only if substance has that persona)
  personas: {
    echa?: {
      ecNumber: string;
      inventoryType: 'EINECS' | 'ELINCS' | 'NLP';
      echaUrl: string;
    };

    cosing?: {
      cosingRef: string;
      inciName: string;
      functions: string[];
      restrictionType: string | null;
      maxConcentration: number | null;
    };

    efsa?: {
      eNumber: string | null;
      functionalClass: string;
      adi: {
        value: number | null;
        unit: string;
        note: string | null;
      };
      approvedUses: string[];
    };

    tsca?: {
      tscaCas: string;
      inventoryStatus: 'ACTIVE' | 'INACTIVE';
      isSection5: boolean;
      isSection6: boolean;
      isSnur: boolean;
    };

    biocides?: {
      biocidesRef: string;
      status: string;
      productTypes: number[];
      approvalDate: string | null;
      expiryDate: string | null;
    };
  };

  // Regulatory status (from existing tables)
  regulatory: {
    isSvhc: boolean;
    svhcEntry?: {
      inclusionDate: string;
      reason: string;
    };

    clpClassifications: Array<{
      hazardClass: string;
      category: string;
      hCode: string;
      signalWord: string;
    }>;

    restrictions: Array<{
      list: string;
      scope: string;
      threshold: number | null;
      conditions: string | null;
    }>;
  };
}
```

### 7.3 Search Endpoint (New)

```
GET /api/v1/taxonomy/substances/search?q={query}&context={context}

Query parameters:
- q: Search term (CAS, name, INCI, E-number, etc.)
- context: Optional workspace context (cosmetics, food, electronics, industrial)

Examples:
GET /api/v1/taxonomy/substances/search?q=E211
GET /api/v1/taxonomy/substances/search?q=sodium%20benzoate&context=cosmetics
GET /api/v1/taxonomy/substances/search?q=532-32-1
```

**Context-aware behavior:**

| Context | Primary identifier shown | Additional fields |
|---------|-------------------------|-------------------|
| `cosmetics` | INCI name | Functions, restriction annex |
| `food` | E-number | ADI, approved uses |
| `electronics` | CAS number | RoHS threshold, CLP hazards |
| `industrial` | CAS number | SVHC status, TSCA status |
| (none) | CAS number | All available data |

---

## 8. Validation

### 8.1 Data Integrity Checks

```typescript
// packages/gsr/src/cli/validate.ts

const VALIDATION_CHECKS = [
  // Golden Record integrity
  {
    name: 'All Golden Records have canonical_name',
    query: `SELECT COUNT(*) FROM substance WHERE canonical_name IS NULL`,
    expected: 0,
  },
  {
    name: 'No duplicate InChIKeys',
    query: `SELECT inchi_key, COUNT(*) FROM substance
            WHERE inchi_key IS NOT NULL
            GROUP BY inchi_key HAVING COUNT(*) > 1`,
    expected: 0,
  },
  {
    name: 'No duplicate DTXSIDs',
    query: `SELECT dtxsid, COUNT(*) FROM substance
            WHERE dtxsid IS NOT NULL
            GROUP BY dtxsid HAVING COUNT(*) > 1`,
    expected: 0,
  },

  // Persona referential integrity
  {
    name: 'All ECHA personas link to valid substance',
    query: `SELECT COUNT(*) FROM substance_echa
            WHERE substance_id NOT IN (SELECT id FROM substance)`,
    expected: 0,
  },
  {
    name: 'All CosIng personas link to valid substance',
    query: `SELECT COUNT(*) FROM substance_cosing
            WHERE substance_id NOT IN (SELECT id FROM substance)`,
    expected: 0,
  },
  {
    name: 'All EFSA personas link to valid substance',
    query: `SELECT COUNT(*) FROM substance_efsa
            WHERE substance_id NOT IN (SELECT id FROM substance)`,
    expected: 0,
  },
  {
    name: 'All TSCA personas link to valid substance',
    query: `SELECT COUNT(*) FROM substance_tsca
            WHERE substance_id NOT IN (SELECT id FROM substance)`,
    expected: 0,
  },
  {
    name: 'All Biocides personas link to valid substance',
    query: `SELECT COUNT(*) FROM substance_biocide
            WHERE substance_id NOT IN (SELECT id FROM substance)`,
    expected: 0,
  },

  // Coverage checks
  {
    name: 'Golden Record count',
    query: `SELECT COUNT(*) FROM substance`,
    expectedMin: 1200000,
  },
  {
    name: 'ECHA persona coverage',
    query: `SELECT COUNT(*) FROM substance_echa`,
    expectedMin: 100000,
  },
  {
    name: 'CLP classification coverage',
    query: `SELECT COUNT(DISTINCT substance_id) FROM substance_hazard_classification`,
    expectedMin: 4000,
  },
];
```

### 8.2 Cross-Registry Validation

```sql
-- Substances with both CosIng and EFSA personas (e.g., sodium benzoate)
SELECT
  s.canonical_name,
  s.cas_number,
  c.inci_name,
  e.e_number
FROM substance s
JOIN substance_cosing c ON c.substance_id = s.id
JOIN substance_efsa e ON e.substance_id = s.id
LIMIT 20;

-- SVHC substances with CLP classifications
SELECT
  s.canonical_name,
  s.cas_number,
  sre.list_code,
  shc.hazard_class_code,
  shc.h_code
FROM substance s
JOIN substance_regulatory_entry sre ON sre.substance_id = s.id
JOIN substance_hazard_classification shc ON shc.substance_id = s.id
WHERE sre.list_code = 'SVHC'
LIMIT 20;

-- Unresolved substances by source
SELECT source, COUNT(*) as count
FROM unresolved_substance
WHERE status = 'PENDING'
GROUP BY source
ORDER BY count DESC;
```

---

## 9. Files to Create/Modify

### 9.1 New Files

| File | Description |
|------|-------------|
| **Entities** | |
| `packages/gsr/src/entities/SubstancePersonaEcha.ts` | ECHA persona entity |
| `packages/gsr/src/entities/SubstancePersonaCosing.ts` | CosIng persona entity |
| `packages/gsr/src/entities/SubstancePersonaEfsa.ts` | EFSA persona entity |
| `packages/gsr/src/entities/SubstancePersonaTsca.ts` | TSCA persona entity |
| `packages/gsr/src/entities/SubstancePersonaBiocides.ts` | Biocides persona entity |
| **Seeders** | |
| `packages/gsr/src/seeders/comptox.seeder.ts` | CompTox foundation seeder |
| `packages/gsr/src/seeders/echa-persona.seeder.ts` | ECHA persona seeder |
| `packages/gsr/src/seeders/cosing.seeder.ts` | CosIng persona seeder |
| `packages/gsr/src/seeders/efsa.seeder.ts` | EFSA persona seeder |
| `packages/gsr/src/seeders/tsca.seeder.ts` | TSCA persona seeder |
| `packages/gsr/src/seeders/biocides.seeder.ts` | Biocides persona seeder |
| **Services** | |
| `packages/gsr/src/services/IdentityLadder.ts` | Resolution algorithm |
| **Parsers** | |
| `packages/gsr/src/parsers/comptox.parser.ts` | DSSTox CSV parser |
| `packages/gsr/src/parsers/cosing.parser.ts` | CosIng data parser |
| `packages/gsr/src/parsers/efsa.parser.ts` | EFSA data parser |
| `packages/gsr/src/parsers/tsca.parser.ts` | TSCA inventory parser |
| `packages/gsr/src/parsers/biocides.parser.ts` | Biocides data parser |

### 9.2 Modified Files

| File | Changes |
|------|---------|
| `packages/gsr/src/entities/Substance.ts` | Add `inchi_key`, `dtxsid`, `qc_level`; remove `ec_number`, `echa_url` |
| `packages/gsr/src/entities/index.ts` | Export new persona entities |
| `packages/gsr/src/cli/index.ts` | Register new seed commands |
| `packages/gsr/src/cli/seed.ts` | Add comptox, persona seeder commands |
| `packages/gsr/src/utils/substance-finder.ts` | Implement Identity Ladder |
| `packages/database/src/migrations/Migration20260122000000.ts` | Add persona tables, update substance |

### 9.3 Documentation Updates

| File | Type | Changes |
|------|------|---------|
| `docs/plans/2026-02-02-gsr-golden-record-design.md` | NEW | This document |
| `docs/plans/2026-01-31-global-substance-registry-design.md` | UPDATE | Add "SUPERSEDED by v2" header |
| `docs/plans/02-data-model.md` | MAJOR | Update substance section, add persona tables |
| `docs/guides/GSR_EDUCATIONAL_GUIDE.md` | REWRITE | Golden Record architecture |
| `docs/guides/SUBSTANCE_TABLES.md` | REWRITE | New table documentation |
| `docs/GSR_DATA_SOURCES.md` | REWRITE | Add CompTox, CosIng, EFSA, TSCA, Biocides |
| `docs/TESTING.md` | UPDATE | New CLI commands |
| `docs/plans/2026-02-01-clp-integration-design.md` | UPDATE | Note Golden Record linkage |
| `docs/plans/2026-01-26-taxonomy-04-substance-registry.md` | UPDATE | Mark superseded |
| `docs/plans/2026-01-26-taxonomy-07-material-substances.md` | UPDATE | Golden Record FK |
| `docs/plans/2026-01-26-taxonomy-10-regulatory-list-registry.md` | UPDATE | Golden Record linkage |

---

## 10. Implementation Plan

### Phase 1: Schema (Day 1)

| Step | Task | Test |
|------|------|------|
| 1.1 | Create `SubstancePersonaEcha` entity | Build passes |
| 1.2 | Create `SubstancePersonaCosing` entity | Build passes |
| 1.3 | Create `SubstancePersonaEfsa` entity | Build passes |
| 1.4 | Create `SubstancePersonaTsca` entity | Build passes |
| 1.5 | Create `SubstancePersonaBiocides` entity | Build passes |
| 1.6 | Update `Substance` entity (add/remove columns) | Build passes |
| 1.7 | Update `Migration20260122000000.ts` | Build passes |
| 1.8 | Export new entities from `index.ts` | Build passes |
| 1.9 | Run `pnpm db:reset` | Tables created |
| 1.10 | Commit | "feat(gsr): add Golden Record schema with persona tables" |

### Phase 2: CompTox Foundation Seeder (Day 2)

| Step | Task | Test |
|------|------|------|
| 2.1 | Create `comptox.parser.ts` | Unit tests pass |
| 2.2 | Create `comptox.seeder.ts` | Unit tests pass |
| 2.3 | Add CLI command: `seed comptox` | `--help` works |
| 2.4 | Run seeder with DSSTox CSV | 1.2M+ records created |
| 2.5 | Verify InChIKey coverage | 92%+ have InChIKey |
| 2.6 | Commit | "feat(gsr): add CompTox foundation seeder" |

### Phase 3: ECHA Persona Seeder (Day 2)

| Step | Task | Test |
|------|------|------|
| 3.1 | Create `IdentityLadder.ts` service | Unit tests pass |
| 3.2 | Create `echa-persona.seeder.ts` | Unit tests pass |
| 3.3 | Refactor existing EC Inventory seeder to use Identity Ladder | Tests pass |
| 3.4 | Run seeder | 100k+ personas attached |
| 3.5 | Verify EC numbers linked correctly | Spot check passes |
| 3.6 | Commit | "feat(gsr): add ECHA persona seeder with Identity Ladder" |

### Phase 4: CLP Reconnection (Day 3)

| Step | Task | Test |
|------|------|------|
| 4.1 | Update `clp-harmonised.seeder.ts` to use Identity Ladder | Tests pass |
| 4.2 | Run CLP reference seeder | 34 classes, 91 H-codes |
| 4.3 | Run CLP harmonised seeder | 4,500+ classifications linked |
| 4.4 | Verify classifications linked to Golden Records | Spot check passes |
| 4.5 | Commit | "refactor(gsr): connect CLP seeder to Golden Records" |

### Phase 5: CosIng Persona Seeder (Day 3)

| Step | Task | Test |
|------|------|------|
| 5.1 | Research CosIng data download format | Document findings |
| 5.2 | Download CosIng data | File saved |
| 5.3 | Create `cosing.parser.ts` | Unit tests pass |
| 5.4 | Create `cosing.seeder.ts` | Unit tests pass |
| 5.5 | Add CLI command: `seed cosing-persona` | `--help` works |
| 5.6 | Run seeder | 25k+ personas attached |
| 5.7 | Verify INCI names correct | Spot check passes |
| 5.8 | Commit | "feat(gsr): add CosIng persona seeder" |

### Phase 6: EFSA Persona Seeder (Day 4)

| Step | Task | Test |
|------|------|------|
| 6.1 | Research EFSA data download format | Document findings |
| 6.2 | Download EFSA food additives data | File saved |
| 6.3 | Create `efsa.parser.ts` | Unit tests pass |
| 6.4 | Create `efsa.seeder.ts` | Unit tests pass |
| 6.5 | Add CLI command: `seed efsa-persona` | `--help` works |
| 6.6 | Run seeder | 1,500+ personas attached |
| 6.7 | Verify E-numbers correct | Spot check passes |
| 6.8 | Commit | "feat(gsr): add EFSA persona seeder" |

### Phase 7: TSCA Persona Seeder (Day 4)

| Step | Task | Test |
|------|------|------|
| 7.1 | Research TSCA inventory download format | Document findings |
| 7.2 | Download TSCA inventory | File saved |
| 7.3 | Create `tsca.parser.ts` | Unit tests pass |
| 7.4 | Create `tsca.seeder.ts` | Unit tests pass |
| 7.5 | Add CLI command: `seed tsca-persona` | `--help` works |
| 7.6 | Run seeder | 60k+ personas attached |
| 7.7 | Verify TSCA status correct | Spot check passes |
| 7.8 | Commit | "feat(gsr): add TSCA persona seeder" |

### Phase 8: Biocides Persona Seeder (Day 5)

| Step | Task | Test |
|------|------|------|
| 8.1 | Research ECHA Biocides download format | Document findings |
| 8.2 | Download biocides active substances | File saved |
| 8.3 | Create `biocides.parser.ts` | Unit tests pass |
| 8.4 | Create `biocides.seeder.ts` | Unit tests pass |
| 8.5 | Add CLI command: `seed biocides-persona` | `--help` works |
| 8.6 | Run seeder | 800+ personas attached |
| 8.7 | Verify product types correct | Spot check passes |
| 8.8 | Commit | "feat(gsr): add Biocides persona seeder" |

### Phase 9: Regulatory Lists Reconnection (Day 5)

| Step | Task | Test |
|------|------|------|
| 9.1 | Update SVHC seeder to use Identity Ladder | Tests pass |
| 9.2 | Update Annex XVII seeder to use Identity Ladder | Tests pass |
| 9.3 | Update Annex XIV seeder to use Identity Ladder | Tests pass |
| 9.4 | Update POP seeder to use Identity Ladder | Tests pass |
| 9.5 | Update RoHS seeder to use Identity Ladder | Tests pass |
| 9.6 | Run all regulatory seeders | Entries linked |
| 9.7 | Verify regulatory entries linked | Spot check passes |
| 9.8 | Commit | "refactor(gsr): connect all regulatory seeders to Golden Records" |

### Phase 10: Validation & Healer (Day 6)

| Step | Task | Test |
|------|------|------|
| 10.1 | Update `full-validate.ts` for new schema | Tests pass |
| 10.2 | Create `pubchem-healer` command | `--help` works |
| 10.3 | Run validation | All checks pass |
| 10.4 | Run healer for top 1000 unresolved | Resolves 50%+ |
| 10.5 | Commit | "feat(gsr): add validation and PubChem healer" |

### Phase 11: Documentation (Day 6-7)

| Step | Task | Test |
|------|------|------|
| 11.1 | Mark v1 design as superseded | File updated |
| 11.2 | Update `02-data-model.md` | Accurate to schema |
| 11.3 | Rewrite `GSR_EDUCATIONAL_GUIDE.md` | Complete guide |
| 11.4 | Rewrite `SUBSTANCE_TABLES.md` | All tables documented |
| 11.5 | Rewrite `GSR_DATA_SOURCES.md` | All sources documented |
| 11.6 | Update `TESTING.md` | All commands listed |
| 11.7 | Update taxonomy plan docs | Marked as superseded/updated |
| 11.8 | Commit | "docs: update all GSR documentation for Golden Record v2" |

---

## 11. Success Metrics

Based on verified source file counts:

| Metric | Target | Source | Verification Query |
|--------|--------|--------|-------------------|
| Golden Records | 1,150,000+ | CompTox (with InChIKey) | `SELECT COUNT(*) FROM substance WHERE inchi_key IS NOT NULL` |
| Total substances | 1,246,000+ | CompTox (all) | `SELECT COUNT(*) FROM substance` |
| InChIKey coverage | 92%+ | CompTox verified | `SELECT COUNT(*) FROM substance WHERE inchi_key IS NOT NULL` |
| CAS coverage | 99%+ | CompTox verified | `SELECT COUNT(*) FROM substance WHERE cas_number IS NOT NULL` |
| EC number coverage | 100,000+ | EC Inventory | `SELECT COUNT(*) FROM substance WHERE ec_number IS NOT NULL` |
| CosIng entries | 2,400+ | 5 Annex files (~2,400 total) | `SELECT COUNT(*) FROM substance_cosing` |
| EFSA entries | 400+ | ENumbers.txt (414) | `SELECT COUNT(*) FROM substance_efsa` |
| TSCA entries | 70,000+ | TSCAINV (70,754) | `SELECT COUNT(*) FROM substance_tsca` |
| Biocide entries | 1,000+ | Art 95 unique substances | `SELECT COUNT(DISTINCT substance_id) FROM substance_biocide` |
| CLP classifications | 4,500+ | Harmonised List | `SELECT COUNT(DISTINCT substance_id) FROM substance_hazard_classification` |
| Cross-registry search | Works | - | Search "E211" returns substance with CosIng + EFSA personas |

---

## 12. Open Questions (Updated)

1. ~~**CosIng download format**~~: **RESOLVED** - Manual export from ec.europa.eu provides 5 XLS files (Annexes II-VI). Files verified present.

2. ~~**EFSA data structure**~~: **RESOLVED** - ENumbers.txt provides clean E-number list (414 entries), OpenFoodTox provides ADI values. Files verified present.

3. **TSCA update automation**: EPA updates TSCA every 6 months (July/January). Manual refresh is sufficient for compliance - re-download and re-seed.

4. **Biocides product type mapping**: The 22 PT categories need mapping to industry workspaces. Proposal:
   - PT1-5 → Cosmetics/Personal Care workspace
   - PT6-13 → Industrial workspace
   - PT14-20 → Not typically relevant (pest control)
   - PT21 → Marine/Coatings
   - PT22 → Specialized

5. **PubChem healer rate limiting**: PubChem allows 5 requests/second. Batch size of 100 with 20-second delays should be safe.

6. **Persona uniqueness**:
   - CosIng: One substance can appear in multiple annexes (e.g., both III restricted AND IV colorant)
   - EFSA: One substance = one E-number (unique)
   - TSCA: One substance = one entry (unique by CAS)
   - Biocides: One substance can have multiple PT entries (one per product type)

---

## 13. Glossary

| Term | Definition |
|------|------------|
| **Golden Record** | The canonical representation of a chemical substance, keyed by InChIKey |
| **Persona** | A context-specific view of a substance in a particular regulatory system |
| **InChIKey** | A 27-character hash of the InChI (International Chemical Identifier) - the chemical's "fingerprint" |
| **DTXSID** | EPA's DSSTox Substance Identifier |
| **INCI** | International Nomenclature of Cosmetic Ingredients |
| **ADI** | Acceptable Daily Intake (mg/kg body weight/day) |
| **TSCA** | Toxic Substances Control Act (US) |
| **PMN** | Pre-Manufacture Notification (TSCA Section 5) |
| **SNUR** | Significant New Use Rule (TSCA) |
| **BPR** | Biocidal Products Regulation (EU 528/2012) |
| **PT** | Product Type (biocides classification 1-22) |
| **EINECS** | European Inventory of Existing Commercial Chemical Substances (pre-1981) |
| **ELINCS** | European List of Notified Chemical Substances (post-1981) |
| **NLP** | No Longer Polymers |

---

*Design created: 2026-02-02*
*Version: 2.1 (Golden Record Architecture - Data Verified)*
*Authors: Human + Claude (Brainstorming Skill)*

**Data sources verified:**
- CompTox DSSTox CCD dump 2025-12-09 (1,246,399 chemicals)
- CosIng Annexes II-VI (2,400 entries)
- EFSA ENumbers.txt (414 E-numbers)
- EFSA OpenFoodTox (8,007 substances)
- EPA TSCA Inventory July 2025 (70,754 chemicals)
- ECHA Biocides Article 95 list (5,265 entries)

All data files present in `packages/gsr/data/` from official government sources.
