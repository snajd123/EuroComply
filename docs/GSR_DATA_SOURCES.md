# GSR Data Sources

This document describes all data sources used by the Global Substance Registry (GSR) package, their purpose, and how to obtain the data.

---

## Overview

The GSR aggregates chemical substance data from multiple regulatory sources to provide a unified view of substance restrictions across the EU.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATA PIPELINE                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ECHA EC Inventory ──────► Substance table (base chemical list)        │
│         │                                                                │
│         ▼                                                                │
│   PubChem API ────────────► Enrichment (SMILES, aliases, formulas)      │
│         │                                                                │
│         ├─────────────────► CLP Hazard Classification                   │
│         │                   • HazardClass (33 GHS classes)              │
│         │                   • HazardStatement (91 H-codes, 24 languages)│
│         │                   • SubstanceHazardClassification (~4,762)    │
│         │                                                                │
│         ▼                                                                │
│   Regulatory Lists ───────► SubstanceListEntry (restrictions/bans)      │
│   • SVHC Candidate List                                                  │
│   • REACH Annex XVII                                                     │
│   • REACH Annex XIV                                                      │
│   • POP Regulation                                                       │
│   • RoHS Directive                                                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. ECHA EC Inventory (Base Substance List)

### What It Is
The European Commission's inventory of chemical substances. Contains **106,213 substances** with EC numbers, CAS numbers, and names. This is our **base substance list** - all other regulatory data links to these substances.

### Why We Need It
- Provides the canonical list of chemical identifiers (CAS, EC numbers)
- Other regulatory lists reference substances by these identifiers
- Without this, we can't link restrictions to actual chemicals

### Data Contents
| Field | Description |
|-------|-------------|
| EC Number | European Community number (unique identifier) |
| CAS Number | Chemical Abstracts Service number (global standard) |
| Name | Official substance name |
| Molecular Formula | Chemical formula (when available) |

### How to Obtain

> **Warning:** The "Export" button on the ECHA table only exports **10,000 substances** (truncated). Use the IUCLID download to get the **full 106,213 substances**.

#### IUCLID Data Download (Recommended)
1. Visit: https://iuclid6.echa.europa.eu/get-iuclid-data
2. Download the "EC Inventory" file (`.i6z` format, ~75 MB)
3. Save as `packages/gsr/data/ec_inventory.i6z`
4. The seeder parses i6z files directly (no conversion needed)

#### Alternative: CSV Export (Truncated)
1. Visit: https://echa.europa.eu/information-on-chemicals/ec-inventory
2. Click "Export" at the bottom of the table
3. Save as `packages/gsr/data/ec_inventory.csv`
4. **Note:** This only exports ~10,000 substances (truncated)

### CLI Command
```bash
# Full list from i6z file (recommended)
pnpm gsr seed echa-inventory data/ec_inventory.i6z

# OR truncated CSV export
pnpm gsr seed echa-inventory data/ec_inventory.csv
```

The seeder automatically detects file format by extension (`.i6z` or `.csv`).

### Current Status
Use the i6z download from IUCLID to get all 106,213 substances. The web export is limited to ~10,000.

### Update Frequency
Rarely changes (inventory from JRC 2008, occasionally updated)

---

## 2. PubChem (Enrichment Data)

### What It Is
NIH's open chemistry database with molecular structures, synonyms, and properties for millions of compounds.

### Why We Need It
- Adds molecular structures (SMILES notation) for structure-based searching
- Provides 50,000+ synonyms/trade names for better search
- Adds molecular formulas and weights
- Enables chemical similarity searches

### Data Contents
| Field | Description |
|-------|-------------|
| SMILES | Molecular structure notation |
| InChIKey | Structure hash for exact matching |
| IUPAC Name | Systematic chemical name |
| Molecular Formula | Chemical formula |
| Molecular Weight | Mass in g/mol |
| Synonyms | Alternative names, trade names |

### How to Obtain
Fetched automatically via PubChem REST API. No manual download needed.

### CLI Command
```bash
pnpm gsr enrich pubchem           # Enrich substances missing data
pnpm gsr enrich pubchem --all     # Re-enrich all substances
```

### Update Frequency
Run after seeding new substances. PubChem updates continuously.

### Rate Limits
- 2 requests/second (conservative to avoid throttling)
- ~3 API calls per substance
- Full enrichment takes ~30 minutes for 10,000 substances

---

## 3. SVHC Candidate List

### What It Is
**Substances of Very High Concern** - chemicals identified under REACH Article 57 as:
- Carcinogenic, mutagenic, or toxic for reproduction (CMR)
- Persistent, bioaccumulative, and toxic (PBT)
- Very persistent and very bioaccumulative (vPvB)
- Equivalent concern (e.g., endocrine disruptors)

### Why We Need It
- Legal requirement: Companies must notify ECHA and inform customers if products contain >0.1% of any SVHC
- First step toward authorization or restriction
- ~240 substances currently listed

### Regulatory Impact
| Obligation | Threshold |
|------------|-----------|
| Notify ECHA | >1 tonne/year AND >0.1% in articles |
| Inform customers | >0.1% in articles (on request) |
| Inform consumers | >0.1% in articles (within 45 days) |

### Status in GSR
`ListingStatus.LISTED` - Indicates substance is on the candidate list

### How to Obtain
1. Visit: https://echa.europa.eu/candidate-list-table
2. Click "Export" at the bottom of the table
3. Select CSV/TSV format
4. Save as `packages/gsr/data/svhc_candidate_list.csv`

### CLI Command
```bash
pnpm gsr seed echa-svhc data/svhc_candidate_list.csv
```

### Update Frequency
Twice yearly (January and July updates)

---

## 4. REACH Annex XVII (Restrictions)

### What It Is
List of substances with **specific restrictions** on manufacturing, placing on market, or use. Each entry specifies conditions under which a substance is restricted.

### Why We Need It
- Contains ~75 entries with specific use restrictions
- Restrictions can apply to specific products (toys, textiles, jewelry)
- Includes concentration thresholds (e.g., "max 0.1% in toys")
- Non-compliance = illegal to sell in EU

### Regulatory Impact
| Example Entry | Restriction |
|---------------|-------------|
| Entry 23 (Cadmium) | Banned in plastics, paints, jewelry |
| Entry 27 (Nickel) | Max release rate in jewelry touching skin |
| Entry 63 (Lead) | Banned in jewelry, max 0.05% in consumer articles |
| Entry 72 (CMR substances) | Banned in clothing, textiles, footwear |

### Status in GSR
`ListingStatus.RESTRICTED` - Subject to conditional restrictions

### Data Contents
| Field | Description |
|-------|-------------|
| Entry Number | Annex XVII entry (groups related restrictions) |
| Substance Name | Chemical name |
| CAS/EC Number | Identifiers |
| Restriction Conditions | Free text describing the restriction |
| Scope | Product categories affected |
| Threshold | Concentration limit (when applicable) |
| EUR-Lex URL | Link to the official legal document |

### How to Obtain (Two-File Approach - Recommended)

ECHA provides two export options with different data:

1. **Entries file** (with EUR-Lex URLs):
   - Visit: https://echa.europa.eu/substances-restricted-under-reach
   - Click "Export" **without** checking "Show all substances in scope"
   - This gives Entry definitions with legal document links
   - Save as `packages/gsr/data/annex_xvii_entries.xlsx`

2. **Substances file** (all individual substances):
   - Visit: https://echa.europa.eu/substances-restricted-under-reach
   - Check **"Show all substances in scope"** then export
   - This gives all ~2,150 individual substances with CAS/EC numbers
   - Save as `packages/gsr/data/annex_xvii_substances.xlsx`

### CLI Command
```bash
# Two-file mode (recommended - includes EUR-Lex URLs)
pnpm gsr seed echa-annex-xvii \
  --entries data/annex_xvii_entries.xlsx \
  --substances data/annex_xvii_substances.xlsx

# Single-file mode (legacy - basic data only)
pnpm gsr seed echa-annex-xvii data/annex_xvii.xlsx
```

### Data Model
The two-file approach creates:
- **SubstanceGroup** for each Entry (e.g., "Lead and its compounds")
- **SubstanceGroupMember** linking individual substances to their Entry
- **SubstanceListEntry** with EUR-Lex URL for legal reference

### Stub Substances
When seeding regulatory lists, if a substance has a valid CAS number but isn't found in the EC Inventory, the seeder automatically creates a **stub substance** record. This ensures all regulated substances are available in the Substance table for users to select in the PLM.

Stub substances have:
- `sourceVersion` set to `STUB:{LIST_NAME}:{VERSION}` (e.g., `STUB:ANNEX_XVII:2026-01`)
- Minimal data (name, CAS, EC if available)
- Can be enriched later via PubChem to add SMILES, molecular formula, etc.

**Why stubs are needed:**
- Some restricted/banned substances were never registered in the EC Inventory
- Historical substances (banned before REACH) may not be in the inventory
- Users need to be able to select these substances in their product materials

**Substances that can't be stubbed (still skipped):**
- Substances without a CAS number (identifier required for uniqueness)
- Substances with invalid CAS numbers (fails checksum validation)
- Group headers in ECHA exports (not individual substances)

### Update Frequency
Irregular (when new restrictions are adopted, typically 1-3 per year)

---

## 5. REACH Annex XIV (Authorization List)

### What It Is
List of substances that **require authorization** before use. Companies must apply to ECHA, justify continued use, and demonstrate no safer alternatives exist.

### Why We Need It
- ~60 substances requiring explicit authorization
- Has "sunset dates" after which use is illegal without authorization
- Most restrictive status before an outright ban
- Authorization applications cost €50,000+ and take years

### Regulatory Impact
| Date Type | Meaning |
|-----------|---------|
| Sunset Date | After this date, cannot use without authorization |
| Latest Application Date | Deadline to submit authorization application |

### Status in GSR
`ListingStatus.AUTHORIZED` - Requires authorization to use

### Data Contents
| Field | Description |
|-------|-------------|
| Substance Name | Chemical name |
| CAS/EC Number | Identifiers |
| Intrinsic Properties | Why it's on the list (carcinogenic, etc.) |
| Sunset Date | When authorization becomes required |
| Latest Application Date | Deadline for applications |
| Exempted Uses | Specific uses that don't need authorization |

### How to Obtain (Two-File Approach - Recommended)

ECHA provides two export options with different data:

1. **Entries/Full file** (with regulatory data):
   - Visit: https://echa.europa.eu/authorisation-list
   - Click "Export" **without** checking "Show all substances in scope"
   - This gives entries with dates, reasons for inclusion, exempted uses
   - Save as `packages/gsr/data/authorisation_list_full.xlsx`

2. **Substances file** (all individual substances):
   - Visit: https://echa.europa.eu/authorisation-list
   - Check **"Show all substances in scope"** then export
   - This gives all ~140 individual substances with CAS/EC numbers
   - Save as `packages/gsr/data/authorisation_list_substances.xlsx`

### CLI Command
```bash
# Two-file mode (recommended - includes all regulatory data)
pnpm gsr seed echa-annex-xiv \
  --entries data/authorisation_list_full.xlsx \
  --substances data/authorisation_list_substances.xlsx

# Single-file mode (legacy - basic data only)
pnpm gsr seed echa-annex-xiv data/annex_xiv.xlsx
```

### Data Model
The two-file approach creates:
- **SubstanceGroup** for entries with multiple substances (e.g., "HBCDD and diastereoisomers")
- **SubstanceGroupMember** linking individual substances to their Entry
- **SubstanceListEntry** with complete regulatory data (sunset date, application date, reasons, exemptions)

### Update Frequency
1-2 times per year (when new substances added)

---

## 6. POP Regulation (Persistent Organic Pollutants)

### What It Is
Implementation of the Stockholm Convention on Persistent Organic Pollutants. These are chemicals that:
- Persist in the environment for years/decades
- Bioaccumulate in food chains
- Can travel long distances (global pollutants)
- Cause serious health/environmental effects

### Why We Need It
- Annex I substances are **completely banned** (most severe status)
- Annex II substances have strict restrictions
- International treaty obligations
- Includes notorious chemicals like DDT, PCBs, dioxins

### Regulatory Impact
| Annex | Status | Meaning |
|-------|--------|---------|
| Annex I | BANNED | Prohibited from manufacture, sale, use |
| Annex II | RESTRICTED | Allowed only with specific conditions |
| Annex III | Listed | Subject to release reduction |
| Annex IV | Listed | Waste management requirements |

### Status in GSR
- Annex I → `ListingStatus.BANNED`
- Annex II → `ListingStatus.RESTRICTED`
- Annex III/IV → `ListingStatus.LISTED`

### Data Contents
| Field | Description |
|-------|-------------|
| Substance Name | Chemical name |
| CAS/EC Number | Identifiers |
| Annex | Which annex(es) the substance appears in |
| Exemptions | Specific allowed uses |

### How to Obtain
1. Visit: https://echa.europa.eu/list-of-substances-subject-to-pops-regulation
2. Click "Export" at the bottom of the table
3. Select CSV/TSV format
4. Save as `packages/gsr/data/pop_regulation.csv`

### CLI Command
```bash
pnpm gsr seed echa-pop data/pop_regulation.csv
```

### Update Frequency
Irregular (when Stockholm Convention updates, typically every 2-3 years)

---

## 7. RoHS Directive (Electronics Restrictions)

### What It Is
**Restriction of Hazardous Substances** in electrical and electronic equipment (EEE). Limits specific substances to protect human health and enable recycling.

### Why We Need It
- Mandatory for all electronics sold in EU
- Fixed list of 10 substances with specific thresholds
- Applies to homogeneous materials (individual components)
- Non-compliance = cannot sell electronics in EU

### Regulatory Impact
| Substance | Threshold | Why Restricted |
|-----------|-----------|----------------|
| Lead (Pb) | 0.1% | Neurotoxic, environmental persistence |
| Mercury (Hg) | 0.1% | Neurotoxic, bioaccumulative |
| Cadmium (Cd) | 0.01% | Carcinogenic, more toxic than others |
| Hexavalent Chromium (Cr VI) | 0.1% | Carcinogenic |
| PBB (Polybrominated biphenyls) | 0.1% | Persistent, bioaccumulative |
| PBDE (Polybrominated diphenyl ethers) | 0.1% | Persistent, bioaccumulative |
| DEHP | 0.1% | Endocrine disruptor |
| BBP | 0.1% | Endocrine disruptor |
| DBP | 0.1% | Endocrine disruptor |
| DIBP | 0.1% | Endocrine disruptor |

### Status in GSR
`ListingStatus.RESTRICTED` - Subject to threshold limits in EEE

### Data Contents
**Hardcoded** - No CSV needed. The list is fixed in EU Directive 2011/65/EU.

| Field | Description |
|-------|-------------|
| CAS Number | Substance identifier |
| Name | Common name |
| Threshold | Maximum concentration (% by weight) |
| Scope | Always `ProductScope.EEE` |

### CLI Command
```bash
pnpm gsr seed rohs    # No CSV file needed
```

### Update Frequency
Rarely changes (last update added phthalates in 2015)

---

## 8. CLP Harmonised Classification List (CLP Annex VI)

### What It Is
The **CLP Harmonised Classification and Labelling List** (Annex VI to CLP Regulation EC 1272/2008) contains legally binding hazard classifications for ~4,762 substances. This is the authoritative source for hazard screening and CMR flagging.

### Why We Need It
- Legal requirement: Substances on this list MUST use the harmonised classification
- Provides hazard class, category, H-statements, pictograms, signal words
- CMR substances (Carcinogenic, Mutagenic, Reprotoxic) are flagged
- Required for professional product labeling in the EU

### Data Contents
| Field | Description |
|-------|-------------|
| Index Number | CLP Annex VI index (e.g., "650-017-00-8") |
| EC/CAS Number | Identifiers |
| Hazard Class | Classification (e.g., "Carc. 1A", "Acute Tox. 4") |
| H-statements | Hazard statements (e.g., "H350", "H302") |
| Pictograms | GHS pictogram codes (e.g., "GHS08") |
| Signal Word | "Danger" or "Warning" |
| SCL/M-factor | Specific concentration limits, M-factors for aquatic hazards |
| Notes | Regulatory notes (A, B, C, etc.) |

### How to Obtain
1. Visit: https://echa.europa.eu/information-on-chemicals/annex-vi-to-clp
2. Click "Export" to download the XLSX file
3. Save as `packages/gsr/data/clp_annex_vi.xlsx`

### CLI Commands
```bash
# Step 1: Seed hazard reference data (classes + H-statements)
pnpm gsr seed clp-reference

# Step 2: Seed substance classifications from ECHA XLSX
pnpm gsr seed clp-harmonised data/clp_annex_vi.xlsx --version ATP21
```

### Update Frequency
Updated with each ATP (Adaptation to Technical Progress), typically 1-2 per year.

---

## 9. H-Statement Translations (mhchem)

### What It Is
CLP/GHS hazard statements (H-codes) with official translations for all 24 EU languages. Sourced from the **mhchem/hpstatements** GitHub repository which extracts data from EUR-Lex.

### Why We Need It
- Professional labeling requires H-statements in local language
- 24 EU official languages supported
- Includes combined H-codes (e.g., "H300+H310") and variants (e.g., "H350i")

### Data Source
- **Primary:** https://mhchem.github.io/hpstatements/clp/
- **Repository:** https://github.com/mhchem/hpstatements
- **License:** CC BY 4.0 (© European Union)

### Data Contents
~91 H-statements with translations:
- H200-H299: Physical hazards
- H300-H399: Health hazards
- H400-H499: Environmental hazards

### Supported Languages
bg, cs, da, de, el, en, es, et, fi, fr, ga, hr, hu, it, lt, lv, mt, nl, pl, pt, ro, sk, sl, sv

### How It's Loaded
Automatically fetched when running `pnpm gsr seed clp-reference`. Falls back to English-only hardcoded data if fetch fails.

### Update Frequency
Updated with CLP regulation changes (rare).

---

## Summary: All Data Sources

| Source | Type | Substances | Status | Update Frequency |
|--------|------|------------|--------|------------------|
| ECHA EC Inventory | Base list | 106,213 (i6z format) | N/A | Rarely |
| PubChem | Enrichment | API | N/A | Continuous |
| SVHC Candidate List | Regulatory | ~240 | LISTED | Twice yearly |
| REACH Annex XVII | Regulatory | ~70 entries | RESTRICTED | 1-3/year |
| REACH Annex XIV | Regulatory | ~60 | AUTHORIZED | 1-2/year |
| POP Regulation | Regulatory | ~35 | BANNED/RESTRICTED | Every 2-3 years |
| RoHS Directive | Regulatory | 10 | RESTRICTED | Rarely |
| CLP Annex VI | Reference | ~4,762 | N/A | 1-2/year (ATP) |
| mhchem H-statements | Reference | ~91 | N/A | Rarely |

---

## Data Pipeline Commands

```bash
# Full setup from scratch
cd packages/gsr
pnpm build

# 1. Seed base substances (required first)
# Option A: Full list from i6z (106,213 substances) - RECOMMENDED
pnpm gsr seed echa-inventory data/ec_inventory.i6z

# Option B: Truncated CSV export (~10,000 substances)
pnpm gsr seed echa-inventory data/ec_inventory.csv

# 2. Enrich with PubChem (optional but recommended)
pnpm gsr enrich pubchem

# 3. Seed regulatory lists (in any order)
pnpm gsr seed echa-svhc data/svhc_candidate_list.xlsx

# Annex XVII with two-file approach (recommended)
pnpm gsr seed echa-annex-xvii \
  --entries data/annex_xvii_entries.xlsx \
  --substances data/annex_xvii_substances.xlsx

pnpm gsr seed echa-annex-xiv data/annex_xiv.xlsx
pnpm gsr seed echa-pop data/pop_regulation.xlsx
pnpm gsr seed rohs

# 4. Seed CLP hazard classifications
pnpm gsr seed clp-reference  # Hazard classes + H-statements (downloads from mhchem)
pnpm gsr seed clp-harmonised data/clp_annex_vi.xlsx --version ATP21

# Verify results
docker exec eurocomply-postgres psql -U postgres -d eurocomply -c "
  SELECT rl.code, rl.name, COUNT(sle.id) as entries
  FROM regulatory_list rl
  LEFT JOIN substance_list_entry sle ON sle.regulatory_list_id = rl.id
  GROUP BY rl.code, rl.name
  ORDER BY rl.code;
"
```

---

## Glossary

| Term | Definition |
|------|------------|
| **CAS Number** | Chemical Abstracts Service registry number - global unique identifier for chemicals |
| **EC Number** | European Community number - EU's chemical identifier system |
| **SMILES** | Simplified Molecular Input Line Entry System - text representation of molecular structure |
| **InChIKey** | International Chemical Identifier Key - hash of molecular structure for exact matching |
| **SVHC** | Substance of Very High Concern |
| **CMR** | Carcinogenic, Mutagenic, or toxic for Reproduction |
| **PBT** | Persistent, Bioaccumulative, and Toxic |
| **vPvB** | Very Persistent and Very Bioaccumulative |
| **EEE** | Electrical and Electronic Equipment |
| **Homogeneous Material** | Material that cannot be mechanically separated (for RoHS threshold calculation) |
| **CLP** | Classification, Labelling and Packaging (EU Regulation EC 1272/2008) |
| **GHS** | Globally Harmonized System of Classification and Labelling of Chemicals |
| **H-statement** | Hazard statement - standardized phrase describing the nature of a hazard (e.g., H350 = May cause cancer) |
| **ATP** | Adaptation to Technical Progress - periodic updates to CLP Annex VI |
| **SCL** | Specific Concentration Limit - threshold triggering a classification in mixtures |
| **M-factor** | Multiplier for aquatic hazard classification in mixtures |

---

## External Resources

- [ECHA Chemicals Database](https://echa.europa.eu/information-on-chemicals)
- [REACH Regulation Text](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02006R1907-20221217)
- [RoHS Directive Text](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32011L0065)
- [POP Regulation Text](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32019R1021)
- [PubChem API Documentation](https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest)
