# Understanding the Global Substance Registry (GSR)

## A Beginner's Guide to Chemical Substances, Regulatory Lists, and Hazard Classifications

> **Who is this for?** Anyone who wants to understand how EuroComply tracks chemical substances, their regulatory status, and hazards. No chemistry degree required.

---

## Table of Contents

**Part 1: Foundations**
1. [The Big Picture](#1-the-big-picture)
2. [What is a Chemical Substance?](#2-what-is-a-chemical-substance)
3. [How Do We Identify Substances?](#3-how-do-we-identify-substances)

**Part 2: Regulatory Lists**
4. [What Are Regulatory Lists?](#4-what-are-regulatory-lists)
5. [SVHC Candidate List](#5-svhc-candidate-list)
6. [REACH Annex XVII (Restrictions)](#6-reach-annex-xvii-restrictions)
7. [REACH Annex XIV (Authorization)](#7-reach-annex-xiv-authorization)
8. [POP Regulation](#8-pop-regulation)
9. [RoHS Directive](#9-rohs-directive)

**Part 3: Hazard Classifications**
10. [What Are Hazards?](#10-what-are-hazards)
11. [The CLP Classification System](#11-the-clp-classification-system)
12. [H-Statements: Hazard Warnings](#12-h-statements-hazard-warnings)

**Part 4: Technical Implementation**
13. [How Everything Connects](#13-how-everything-connects)
14. [Where Does the Data Come From?](#14-where-does-the-data-come-from)
15. [The Database Structure](#15-the-database-structure)
16. [CLI Commands Reference](#16-cli-commands-reference)

---

# Part 1: Foundations

## 1. The Big Picture

### Why Does This Exist?

Imagine you're a company that makes products. Your products contain chemicals - maybe paint, plastic, or metal alloys. The European Union has created many laws about chemicals:

- Some chemicals are **banned** entirely
- Some are **restricted** (only allowed in certain products or below certain concentrations)
- Some require **authorization** (you need permission to use them)
- Some must be **labeled** with hazard warnings

But here's the problem:
- There are **over 100,000 chemical substances** registered in Europe
- There are **at least 6 major regulatory lists** to check
- Each list has different rules, thresholds, and exemptions
- How do you know if YOUR product is compliant?

**That's where the Global Substance Registry comes in.**

The GSR is like a comprehensive database of chemicals. It knows:
- What every chemical is called (and its alternative names)
- How to identify it uniquely (CAS numbers, EC numbers)
- Which regulatory lists it appears on
- What restrictions, bans, or requirements apply
- What hazard classifications it has
- What warning labels are needed (in 24 languages!)

### A Real-World Example

Let's say your company makes electronics. You use **lead solder** in your circuit boards.

The GSR can tell you:
- Lead's unique ID numbers (CAS: 7439-92-1, EC: 231-100-4)
- Lead is on the **RoHS restricted list** (banned in electronics above 0.1%)
- Lead is on the **SVHC Candidate List** (Substance of Very High Concern)
- Lead is classified as **Repr. 1A** (reproductive toxicant) under CLP
- The hazard statement H360Df must appear in 24 European languages
- For toys, the threshold is even lower (specific migration limits)

Without the GSR, you'd have to check 6+ different government websites manually. The GSR does it automatically.

---

## 2. What is a Chemical Substance?

### The Simple Definition

A **chemical substance** is any unique type of matter with a specific chemical composition.

Think of it like this:
- **Water** is a substance (H₂O - two hydrogen atoms, one oxygen atom)
- **Table salt** is a substance (NaCl - sodium and chlorine)
- **Lead** is a substance (Pb - just lead atoms)

### Substances vs. Products

This is important:

| Thing | Is it a Substance? |
|-------|-------------------|
| Pure water | Yes |
| Bottled water with minerals | No, it's a mixture |
| Iron metal | Yes |
| Steel | No, it's a mixture of substances |
| Ethanol (alcohol) | Yes |
| Wine | No, it's a mixture |

The GSR tracks **pure substances**, not products or mixtures. But it helps you figure out what substances are IN your products.

### Substance Groups

Sometimes regulations don't target individual substances - they target whole **families** of chemicals:

- "Lead and its compounds" - includes lead, lead oxide, lead acetate, etc.
- "PFAS" - a family of thousands of fluorinated chemicals
- "Phthalates" - a group of plasticizers

The GSR handles this with **substance groups** - a parent group that contains member substances. If the group is restricted, all its members are restricted too.

---

## 3. How Do We Identify Substances?

### The Problem of Names

Here's a tricky thing about chemicals: they can have MANY names.

Take **ethanol** (the alcohol in beer and wine):
- Ethanol
- Ethyl alcohol
- Alcohol
- Grain alcohol
- Drinking alcohol
- C₂H₅OH
- EtOH

All these names mean the exact same substance! How do you avoid confusion?

### CAS Numbers: The Universal ID

In 1965, the Chemical Abstracts Service (CAS) created a numbering system. Every substance gets a unique number.

**Ethanol's CAS number is: 64-17-5**

No matter what language you speak or what you call it, 64-17-5 is always ethanol.

#### How CAS Numbers Work

A CAS number has three parts separated by dashes:
```
7439-92-1
│      │ └─ Check digit (single digit)
│      └─── Second part (2 digits)
└────────── First part (2-7 digits)
```

The **check digit** is calculated from the other digits using math. This catches typos!

```
Example: 7439-92-1 (Lead)

The formula: Sum of (digit × position from right, excluding check digit) mod 10

Position:  6  5  4  3  2  1  (from right, excluding the check digit)
Digits:    7  4  3  9  9  2

Calculation:
  1×2 + 2×9 + 3×9 + 4×3 + 5×4 + 6×7
= 2   + 18  + 27  + 12  + 20  + 42
= 121

121 mod 10 = 1 ✓ (matches the check digit!)
```

If someone types "7439-92-2" by mistake, the math won't work out, and we know it's wrong.

### EC Numbers: Europe's ID System

Europe has its own numbering system called **EC numbers** (European Community numbers).

**Ethanol's EC number is: 200-578-6**

EC numbers are assigned by ECHA (the European Chemicals Agency) and are used in European regulations.

#### Why Have Both?

- **CAS numbers** are international - used worldwide
- **EC numbers** are European - used in EU laws

Many substances have both. Some have only one. The GSR stores both when available.

---

# Part 2: Regulatory Lists

## 4. What Are Regulatory Lists?

### The Concept

A **regulatory list** is an official government-published list of substances that have special rules.

Think of it like this:
- A "no-fly list" for airports tells you who can't board planes
- A regulatory list tells you which chemicals have restrictions

### Why Multiple Lists?

Different laws have different purposes:

| List | Purpose | What Happens |
|------|---------|--------------|
| SVHC Candidate | Identify concerning substances | Must disclose to customers if >0.1% |
| Annex XIV | Control dangerous uses | Need authorization to use |
| Annex XVII | Restrict specific uses | Can't use in certain products |
| POP | Eliminate persistent pollutants | Mostly banned entirely |
| RoHS | Protect electronics users | Banned in electronics |

A single substance can appear on MULTIPLE lists with different restrictions!

### List Entries: The Details Matter

When a substance is on a list, there's more than just "yes it's listed." Each entry has:

| Field | What It Means | Example |
|-------|---------------|---------|
| **Status** | How it's regulated | LISTED, RESTRICTED, BANNED, AUTHORIZED |
| **Listing Date** | When it was added | 2024-01-15 |
| **Effective Date** | When rules kick in | 2025-01-15 |
| **Sunset Date** | When authorization expires | 2027-01-15 |
| **Threshold** | Concentration limit | 0.1% |
| **Scopes** | Which products | TOYS, ELECTRONICS, ALL_PRODUCTS |
| **Conditions** | Exemptions/details | "except for automotive uses" |

---

## 5. SVHC Candidate List

### What It Is

**SVHC** stands for **Substances of Very High Concern**. This is ECHA's "watch list" of the most dangerous chemicals.

The Candidate List currently has **~250 substances** (and growing).

### Why Substances Get Listed

A substance becomes an SVHC if it's:
- **CMR** (Carcinogenic, Mutagenic, or toxic for Reproduction)
- **PBT** (Persistent, Bioaccumulative, and Toxic)
- **vPvB** (very Persistent and very Bioaccumulative)
- **Equivalent concern** (endocrine disruptors, etc.)

### What It Means For Your Products

If your product contains an SVHC above **0.1% by weight**, you must:
1. **Tell your customers** (supply chain communication)
2. **Notify ECHA** (if producing >1 tonne/year)
3. **Respond to consumer requests** within 45 days

### Example Substances

| Substance | CAS | Why SVHC | Listed |
|-----------|-----|----------|--------|
| DEHP (phthalate) | 117-81-7 | Reproductive toxicity | 2008 |
| Lead | 7439-92-1 | Reproductive toxicity | 2018 |
| Bisphenol A | 80-05-7 | Endocrine disruptor | 2017 |

### CLI Command

```bash
pnpm gsr seed echa-svhc --entries svhc-full.xlsx --substances svhc-expanded.xlsx
```

---

## 6. REACH Annex XVII (Restrictions)

### What It Is

**Annex XVII** to the REACH regulation contains **restrictions** on dangerous substances. Unlike the Candidate List (which is just disclosure), Annex XVII entries are **legally binding restrictions**.

Currently has **~75 entries** covering hundreds of substances.

### How Restrictions Work

Each entry specifies:
- **What substance(s)** are restricted
- **What products** the restriction applies to
- **What concentration** is the limit
- **What uses** are exempt

### Example: Entry 63 (Lead)

```
Entry 63: Lead and its compounds

Shall not be placed on the market or used in:
- Jewelry: >0.05% by weight
- Articles intended for children: >0.05%
- Consumer articles that can be placed in mouth: >0.05%

Exemptions:
- Crystal glass
- Certain electrical components
```

### Scope Hierarchy

Restrictions use a **scope hierarchy** to specify which products:

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
├── INDUSTRIAL
├── EEE (Electrical & Electronic Equipment)
│   ├── BATTERIES
│   └── CABLES
├── VEHICLES
│   └── VEHICLE_COMPONENTS
├── CONSTRUCTION_PRODUCTS
│   └── PAINTS_COATINGS
└── PACKAGING
```

A restriction on `CONSUMER_GOODS` automatically applies to `TOYS`, `JEWELRY`, etc.

### CLI Command

```bash
pnpm gsr seed echa-annex-xvii --entries annex-xvii-entries.xlsx --substances annex-xvii-expanded.xlsx
```

---

## 7. REACH Annex XIV (Authorization)

### What It Is

**Annex XIV** is the **Authorization List**. Substances here are so dangerous that you need EXPLICIT PERMISSION from the European Commission to use them.

Currently has **~60 substances** requiring authorization.

### The Authorization Process

1. Substance is added to SVHC Candidate List
2. ECHA recommends it for Annex XIV
3. Commission adds it with a **sunset date**
4. After sunset date, you can ONLY use it if:
   - You applied for authorization AND
   - Authorization was granted OR
   - Your use is exempt

### Key Dates

| Date | What It Means |
|------|---------------|
| **Application Date** | Last day to submit authorization application |
| **Sunset Date** | After this, can't use without authorization |

If you miss the application date, you can't legally use the substance after sunset!

### Example: Chromium Trioxide

```
Chromium trioxide (CAS: 1333-82-0)

Use: Hard chrome plating

Application deadline: September 2017
Sunset date: September 2017

Status: Many companies have authorizations for limited time periods
```

### CLI Command

```bash
pnpm gsr seed echa-annex-xiv --entries annex-xiv-entries.xlsx --substances annex-xiv-expanded.xlsx
```

---

## 8. POP Regulation

### What It Is

**POP** stands for **Persistent Organic Pollutants**. These are chemicals that:
- **Persist** in the environment (don't break down)
- **Bioaccumulate** (build up in food chains)
- **Travel long distances** (end up in Arctic ice!)
- **Are toxic** to humans and wildlife

The POP Regulation implements the **Stockholm Convention** in the EU.

### How It Works

POP substances are mostly **BANNED** entirely, with very limited exemptions. The regulation has multiple annexes:

| Annex | Rule |
|-------|------|
| Annex I | Prohibited (banned) |
| Annex II | Restricted |
| Annex III | Unintentional release provisions |
| Annex IV | Waste management |

### Example Substances

| Substance | CAS | Why Banned |
|-----------|-----|------------|
| DDT | 50-29-3 | Persistent pesticide |
| PCBs | various | Transformer oil, extremely persistent |
| PFOS | 1763-23-1 | Firefighting foam, "forever chemical" |

### CLI Command

```bash
pnpm gsr seed echa-pop --entries pop-entries.xlsx --substances pop-expanded.xlsx
```

---

## 9. RoHS Directive

### What It Is

**RoHS** stands for **Restriction of Hazardous Substances** in electrical and electronic equipment.

The simplest regulatory list - it's a **hardcoded list of 10 substances** with **fixed thresholds**.

### The RoHS Substances

| # | Substance | CAS | Threshold |
|---|-----------|-----|-----------|
| 1 | Lead | 7439-92-1 | 0.1% |
| 2 | Mercury | 7439-97-6 | 0.1% |
| 3 | Cadmium | 7440-43-9 | 0.01% |
| 4 | Hexavalent chromium | 18540-29-9 | 0.1% |
| 5 | PBB (polybrominated biphenyls) | - | 0.1% |
| 6 | PBDE (polybrominated diphenyl ethers) | - | 0.1% |
| 7 | DEHP | 117-81-7 | 0.1% |
| 8 | BBP | 85-68-7 | 0.1% |
| 9 | DBP | 84-74-2 | 0.1% |
| 10 | DIBP | 84-69-5 | 0.1% |

### Scope

RoHS applies to **electrical and electronic equipment (EEE)** across 11 categories:
- Large/small household appliances
- IT equipment
- Consumer electronics
- Lighting
- Electrical tools
- Toys
- Medical devices
- Monitoring instruments
- Automatic dispensers
- Other EEE

### CLI Command

```bash
# No file needed - hardcoded list
pnpm gsr seed rohs
```

---

# Part 3: Hazard Classifications

## 10. What Are Hazards?

### The Concept

A **hazard** is a potential source of harm. For chemicals, hazards are the ways a substance could hurt you or the environment.

Not all chemicals are hazardous. Water isn't hazardous (well, you can drown, but that's not a chemical hazard).

### Types of Hazards

The world has agreed on three main categories:

#### 1. Physical Hazards (Can it explode, burn, or react dangerously?)

| Hazard | What It Means | Example |
|--------|---------------|---------|
| Explosive | Can explode | Dynamite (nitroglycerin) |
| Flammable | Catches fire easily | Gasoline |
| Oxidizing | Makes fires worse | Hydrogen peroxide |
| Compressed Gas | Under pressure | Oxygen tanks |
| Corrosive to Metals | Eats through metal | Strong acids |

#### 2. Health Hazards (Can it hurt your body?)

| Hazard | What It Means | Example |
|--------|---------------|---------|
| Acute Toxicity | Poisonous immediately | Cyanide |
| Skin Corrosion | Burns your skin | Sulfuric acid |
| Eye Damage | Damages eyes | Bleach |
| Respiratory Sensitization | Causes asthma | Isocyanates |
| Carcinogenicity | Can cause cancer | Benzene |
| Mutagenicity | Can damage DNA | Various |
| Reproductive Toxicity | Can harm fertility/babies | Lead |

#### 3. Environmental Hazards (Can it hurt nature?)

| Hazard | What It Means | Example |
|--------|---------------|---------|
| Aquatic Toxicity | Kills fish/water life | Many pesticides |
| Ozone Depletion | Damages ozone layer | CFCs (now banned) |

### CMR: The Really Dangerous Ones

Three hazard types are so serious they get a special name: **CMR**

- **C**arcinogenic (causes cancer)
- **M**utagenic (damages DNA)
- **R**eprotoxic (harms fertility or unborn children)

CMR substances have extra restrictions in European law. Products containing them need special warnings and sometimes can't be sold to consumers at all.

---

## 11. The CLP Classification System

### What is Classification?

**Classification** is the official process of saying "this substance has these specific hazards."

It's not just saying "this is dangerous" - it's precisely specifying:
- What type of hazard
- How severe (category)
- What warning to give

### The CLP Regulation

In Europe, classification follows the **CLP Regulation** (Classification, Labelling and Packaging).

CLP is based on a worldwide system called **GHS** (Globally Harmonized System). Whether you're in Germany, Japan, or Brazil, hazard warnings should look the same.

### Hazard Classes

A **hazard class** is a category of hazard. There are **34** in CLP:

```
Physical Hazards (16 classes):
  Expl.        - Explosives
  Flam. Gas    - Flammable gases
  Flam. Liq.   - Flammable liquids
  Flam. Sol.   - Flammable solids
  Ox. Gas      - Oxidising gases
  Ox. Liq.     - Oxidising liquids
  Ox. Sol.     - Oxidising solids
  Press. Gas   - Gases under pressure
  Self-react.  - Self-reactive substances
  Pyr. Liq.    - Pyrophoric liquids
  Pyr. Sol.    - Pyrophoric solids
  Self-heat.   - Self-heating substances
  Water-react. - Emit flammable gas with water
  Org. Perox.  - Organic peroxides
  Met. Corr.   - Corrosive to metals

Health Hazards (11 classes):
  Acute Tox.   - Acute toxicity
  Skin Corr.   - Skin corrosion
  Skin Irrit.  - Skin irritation
  Eye Dam.     - Serious eye damage
  Eye Irrit.   - Eye irritation
  Resp. Sens.  - Respiratory sensitisation
  Skin Sens.   - Skin sensitisation
  Muta.        - Germ cell mutagenicity (CMR)
  Carc.        - Carcinogenicity (CMR)
  Repr.        - Reproductive toxicity (CMR)
  Lact.        - Lactation effects
  STOT SE      - Specific target organ toxicity - single exposure
  STOT RE      - Specific target organ toxicity - repeated exposure
  Asp. Tox.    - Aspiration hazard

Environmental Hazards (3 classes):
  Aquatic Acute   - Hazardous to aquatic environment (acute)
  Aquatic Chronic - Hazardous to aquatic environment (chronic)
  Ozone           - Hazardous to the ozone layer
```

### Categories: Severity Levels

Within each hazard class, there are **categories** that indicate severity.

**Category 1 = Most severe**
**Category 2, 3, 4 = Less severe**

Some classes have sub-categories:
- **1A** = Highest certainty/severity
- **1B** = High certainty/severity
- **1C** = Lower but still significant

Example for Carcinogenicity:
| Category | Meaning |
|----------|---------|
| Carc. 1A | Known human carcinogen (proven in humans) |
| Carc. 1B | Presumed human carcinogen (proven in animals) |
| Carc. 2 | Suspected human carcinogen (some evidence) |

### Putting It Together: A Full Classification

A substance like **Benzene** (CAS: 71-43-2) has multiple classifications:

```
Benzene Classifications:
  - Flam. Liq. 2     (Flammable liquid, category 2)
  - Carc. 1A         (Carcinogenic, category 1A)
  - Muta. 1B         (Mutagenic, category 1B)
  - STOT RE 1        (Organ toxicity - repeated exposure, category 1)
  - Asp. Tox. 1      (Aspiration hazard, category 1)
  - Eye Irrit. 2     (Eye irritation, category 2)
  - Skin Irrit. 2    (Skin irritation, category 2)
```

Benzene is a CMR substance (carcinogenic + mutagenic) - 7 different hazard classifications!

---

## 12. H-Statements: Hazard Warnings

### What Are H-Statements?

**H-statements** (Hazard statements) are standardized warning phrases. Each classification has an associated H-statement that must appear on product labels.

The "H" stands for "Hazard."

### H-Statement Codes

H-statements have codes organized by type:
- **H2xx** = Physical hazards (200-299)
- **H3xx** = Health hazards (300-399)
- **H4xx** = Environmental hazards (400-499)

Examples:
| Code | Statement |
|------|-----------|
| H225 | Highly flammable liquid and vapour |
| H301 | Toxic if swallowed |
| H315 | Causes skin irritation |
| H350 | May cause cancer |
| H400 | Very toxic to aquatic life |

### Variant H-Statements

Some H-statements have variants that give more specific information:

| Code | Statement |
|------|-----------|
| H350 | May cause cancer |
| H350i | May cause cancer by inhalation |
| H360 | May damage fertility or the unborn child |
| H360D | May damage the unborn child |
| H360F | May damage fertility |
| H360FD | May damage fertility. May damage the unborn child. |
| H360Df | May damage the unborn child. Suspected of damaging fertility. |

### Combined H-Statements

When a substance is toxic through multiple routes, the codes get combined:

| Code | Meaning |
|------|---------|
| H300 | Fatal if swallowed |
| H310 | Fatal in contact with skin |
| H300+H310 | Fatal if swallowed or in contact with skin |
| H300+H310+H330 | Fatal if swallowed, in contact with skin or if inhaled |

### Translations: 24 Languages

Every H-statement must be available in all **24 official EU languages**.

H350 "May cause cancer" in different languages:
| Language | Translation |
|----------|-------------|
| English (en) | May cause cancer |
| German (de) | Kann Krebs erzeugen |
| French (fr) | Peut provoquer le cancer |
| Spanish (es) | Puede provocar cáncer |
| Italian (it) | Può provocare il cancro |
| Polish (pl) | Może powodować raka |
| Dutch (nl) | Kan kanker veroorzaken |
| ... | ... (17 more languages) |

The GSR stores all 24 translations so products can be labeled correctly for each EU country.

---

# Part 4: Technical Implementation

## 13. How Everything Connects

### The Complete Data Model

```
                                    ┌─────────────────────┐
                                    │     SUBSTANCE       │
                                    │                     │
                                    │ name: "Lead"        │
                                    │ cas: "7439-92-1"    │
                                    │ ec: "231-100-4"     │
                                    └──────────┬──────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          │                          │
                    ▼                          ▼                          ▼
    ┌───────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐
    │  SUBSTANCE_LIST_ENTRY     │ │ SUBSTANCE_HAZARD_       │ │ SUBSTANCE_GROUP_MEMBER  │
    │                           │ │ CLASSIFICATION          │ │                         │
    │ regulatory_list: SVHC     │ │                         │ │ group: "LEAD_COMPOUNDS" │
    │ status: LISTED            │ │ hazard_class: "Repr."   │ │ inheritance: EXPLICIT   │
    │ listing_date: 2018-06-27  │ │ category: "1A"          │ └─────────────────────────┘
    │ scopes: [ALL_PRODUCTS]    │ │ h_code: "H360Df"        │              │
    │ threshold: 0.1%           │ └─────────────────────────┘              │
    └───────────────────────────┘              │                          │
                │                              │                          ▼
                │                    ┌─────────┴─────────┐    ┌─────────────────────────┐
                │                    │                   │    │   SUBSTANCE_GROUP       │
                ▼                    ▼                   ▼    │                         │
    ┌───────────────────────┐ ┌──────────────┐ ┌─────────────┐│ code: "LEAD_COMPOUNDS"  │
    │   REGULATORY_LIST     │ │ HAZARD_CLASS │ │ HAZARD_     ││ name: "Lead & compounds"│
    │                       │ │              │ │ STATEMENT   │└─────────────────────────┘
    │ code: "REACH_SVHC"    │ │ code: "Repr."│ │             │
    │ name: "SVHC Candidate"│ │ is_cmr: true │ │ code: H360Df│
    │ jurisdiction: "EU"    │ │ pictogram:   │ │ translations│
    │ publisher: "ECHA"     │ │   "GHS08"    │ │  {en:...    │
    └───────────────────────┘ └──────────────┘ │   de:...}   │
                                               └─────────────┘
```

### Reading the Diagram

1. **Substance** (center top) - The chemical itself with its identifiers
2. **Substance List Entry** (left) - Links a substance to a regulatory list with conditions
3. **Substance Hazard Classification** (center) - Links a substance to a hazard class
4. **Substance Group Member** (right) - Links a substance to a chemical family
5. **Regulatory List** (bottom left) - The list definition (SVHC, Annex XVII, etc.)
6. **Hazard Class** (bottom center) - The type of hazard with metadata
7. **Hazard Statement** (bottom center-right) - The warning text in all languages
8. **Substance Group** (bottom right) - Chemical family definition

### Example: Lead's Full Data

```
SUBSTANCE: Lead (CAS: 7439-92-1, EC: 231-100-4)
│
├── REGULATORY LIST ENTRIES:
│   │
│   ├── SVHC Candidate List
│   │   ├── Status: LISTED
│   │   ├── Listed: 2018-06-27
│   │   ├── Reason: Reproductive toxicity (Article 57c)
│   │   └── Scope: ALL_PRODUCTS
│   │
│   ├── REACH Annex XVII (Entry 63)
│   │   ├── Status: RESTRICTED
│   │   ├── Threshold: 0.05%
│   │   ├── Scope: JEWELRY, TOYS, CHILDCARE_ARTICLES
│   │   └── Source: EUR-Lex 2015/628
│   │
│   └── RoHS Directive
│       ├── Status: RESTRICTED
│       ├── Threshold: 0.1%
│       └── Scope: EEE
│
├── CLP CLASSIFICATIONS:
│   │
│   ├── Repr. 1A → H360Df
│   │   └── "May damage the unborn child. Suspected of damaging fertility."
│   │
│   ├── Lact. → H362
│   │   └── "May cause harm to breast-fed children."
│   │
│   ├── STOT RE 2 → H373
│   │   └── "May cause damage to organs through prolonged exposure."
│   │
│   └── Aquatic Chronic 1 → H410
│       └── "Very toxic to aquatic life with long lasting effects."
│
└── GROUP MEMBERSHIPS:
    │
    └── LEAD_COMPOUNDS (explicit member)
        └── Restrictions on "lead and its compounds" apply to this substance
```

---

## 14. Where Does the Data Come From?

### The Data Sources

The GSR gets its data from official European sources:

| Source | What It Contains | Size | Format |
|--------|------------------|------|--------|
| **EC Inventory** | All registered substances | ~102,000 | CSV/I6Z |
| **SVHC Candidate List** | Substances of Very High Concern | ~250 | XLSX |
| **Annex XVII** | Restriction entries | ~75 entries | XLSX |
| **Annex XIV** | Authorization list | ~60 | XLSX |
| **POP Regulation** | Persistent organic pollutants | ~40 | XLSX |
| **RoHS Directive** | EEE restrictions | 10 | Hardcoded |
| **CLP Annex VI** | Harmonised classifications | ~4,700 | XLSX |
| **mhchem** | H-statement translations | ~91 | JSON |

### The Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DATA SOURCES                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  EC Inventory   SVHC List   Annex XVII   Annex XIV   POP    RoHS   CLP/mhchem  │
│       │            │            │            │        │       │        │        │
└───────┼────────────┼────────────┼────────────┼────────┼───────┼────────┼────────┘
        │            │            │            │        │       │        │
        ▼            ▼            ▼            ▼        ▼       ▼        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              GSR CLI SEEDERS                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  echa-inventory  echa-svhc   annex-xvii   annex-xiv  echa-pop  rohs  clp-*     │
│       │            │            │            │        │       │        │        │
└───────┼────────────┼────────────┼────────────┼────────┼───────┼────────┼────────┘
        │            │            │            │        │       │        │
        ▼            ▼            ▼            ▼        ▼       ▼        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            DATABASE (PostgreSQL)                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  substance (102K)    regulatory_list (6)      hazard_class (34)                │
│  substance_alias     substance_list_entry     hazard_statement (91)            │
│  substance_group     substance_group_member   substance_hazard_classification  │
│  registry_source     unresolved_substance     blind_disclosure_request         │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Seeding Order

```bash
# Step 1: Load the substance master list (102,000+ substances)
pnpm gsr seed echa-inventory data/ec_inventory.csv

# Step 2: Load hazard reference data (classes + H-statements)
pnpm gsr seed clp-reference

# Step 3: Load hazard classifications
pnpm gsr seed clp-harmonised data/clp_annex_vi.xlsx

# Step 4: Load regulatory lists (any order)
pnpm gsr seed echa-svhc --entries svhc-entries.xlsx --substances svhc-expanded.xlsx
pnpm gsr seed echa-annex-xvii --entries xvii-entries.xlsx --substances xvii-expanded.xlsx
pnpm gsr seed echa-annex-xiv --entries xiv-entries.xlsx --substances xiv-expanded.xlsx
pnpm gsr seed echa-pop --entries pop-entries.xlsx --substances pop-expanded.xlsx
pnpm gsr seed rohs

# Step 5: Optional enrichment
pnpm gsr enrich pubchem      # Add SMILES, formulas
pnpm gsr enrich echa-urls    # Add ECHA webpage links
```

---

## 15. The Database Structure

### Entity Overview

| Table | Purpose | Size |
|-------|---------|------|
| `substance` | Master list of chemicals | ~102,000 |
| `substance_alias` | Alternative names | ~200,000 |
| `regulatory_list` | List definitions | 6 |
| `substance_list_entry` | Substance-to-list links | ~500 |
| `substance_group` | Chemical family definitions | ~50 |
| `substance_group_member` | Substance-to-group links | ~500 |
| `hazard_class` | CLP hazard class definitions | 34 |
| `hazard_statement` | H-statements with translations | 91 |
| `substance_hazard_classification` | Substance classifications | ~12,600 |
| `registry_source` | Data source tracking | 9 |
| `unresolved_substance` | Unmatched substance queue | variable |
| `blind_disclosure_request` | Supplier disclosure tracking | variable |

### Key Tables Explained

#### `regulatory_list` - List Definitions

| Column | Type | Example |
|--------|------|---------|
| code | string | "REACH_SVHC" |
| name | string | "SVHC Candidate List" |
| jurisdiction | string | "EU" |
| publisher | string | "ECHA" |
| source_url | string | "https://echa.europa.eu/..." |
| version | string | "2026-02" |

#### `substance_list_entry` - List Entries

| Column | Type | Example |
|--------|------|---------|
| substance_id | FK | (link to substance) |
| substance_group_id | FK | (link to group, OR substance) |
| regulatory_list_id | FK | (link to list) |
| status | enum | LISTED, RESTRICTED, BANNED |
| listing_date | date | 2018-06-27 |
| effective_date | date | 2019-06-27 |
| sunset_date | date | null (or date for Annex XIV) |
| threshold | decimal | 0.1 |
| threshold_unit | enum | PERCENT, PPM, MG_KG |
| threshold_operator | enum | LT, LTE, GT, GTE |
| scopes | array | ["TOYS", "JEWELRY"] |
| source_reference | string | "Entry 63" |
| source_url | string | "https://eur-lex.europa.eu/..." |

#### `substance_group` - Chemical Families

| Column | Type | Example |
|--------|------|---------|
| code | string | "LEAD_COMPOUNDS" |
| name | string | "Lead and its compounds" |
| description | string | "Includes lead metal..." |
| parent_group_id | FK | null (or parent for hierarchies) |

#### Status Values (ListingStatus enum)

| Value | Meaning |
|-------|---------|
| LISTED | On list, information requirement (SVHC) |
| RESTRICTED | Can't use above threshold/scope (Annex XVII) |
| BANNED | Prohibited entirely (POP) |
| AUTHORIZED | Requires permission to use (Annex XIV) |

#### Scope Values (ProductScope enum)

| Value | Description |
|-------|-------------|
| ALL_PRODUCTS | Everything |
| CONSUMER_GOODS | Consumer products |
| TOYS | Toys for children |
| CHILDCARE_ARTICLES | Baby products |
| JEWELRY | Jewelry and accessories |
| COSMETICS | Cosmetic products |
| FOOD_CONTACT | Food contact materials |
| TEXTILES | Clothing, fabrics |
| EEE | Electrical/electronic equipment |
| BATTERIES | Batteries |
| VEHICLES | Automobiles |
| CONSTRUCTION_PRODUCTS | Building materials |
| PACKAGING | Packaging materials |
| INDUSTRIAL | Industrial use only |

---

## 16. CLI Commands Reference

### Seeding Commands

```bash
# Master substance list
pnpm gsr seed echa-inventory <file>
  # Supports: .csv, .i6z formats
  # Options: --data-version <version>, --dry-run

# Hazard reference data (run before clp-harmonised)
pnpm gsr seed clp-reference
  # Options: --dry-run

# CLP classifications
pnpm gsr seed clp-harmonised <xlsx-file>
  # Options: --atp-version <version>, --dry-run

# SVHC Candidate List
pnpm gsr seed echa-svhc --entries <file> --substances <file>
  # Or legacy: pnpm gsr seed echa-svhc <file>
  # Options: --data-version, --dry-run

# REACH Annex XVII (Restrictions)
pnpm gsr seed echa-annex-xvii --entries <file> --substances <file>
  # Options: --data-version, --dry-run

# REACH Annex XIV (Authorization)
pnpm gsr seed echa-annex-xiv --entries <file> --substances <file>
  # Options: --data-version, --dry-run

# POP Regulation
pnpm gsr seed echa-pop --entries <file> --substances <file>
  # Options: --data-version, --dry-run

# RoHS Directive (no file needed)
pnpm gsr seed rohs
  # Options: --data-version, --dry-run
```

### Enrichment Commands

```bash
# Add SMILES, formulas from PubChem
pnpm gsr enrich pubchem
  # Options: --batch-size, --dry-run, --only-missing, --all

# Add ECHA webpage links
pnpm gsr enrich echa-urls
  # Options: --dry-run
```

### Validation Commands

```bash
# Quick spot-checks
pnpm gsr validate

# Full source-to-database comparison
pnpm gsr validate-full
  # Options: --clp-xlsx <file>
```

---

## Glossary

| Term | Definition |
|------|------------|
| **ATP** | Adaptation to Technical Progress - updates to CLP regulation |
| **CAS Number** | Chemical Abstracts Service number - unique substance identifier |
| **CLP** | Classification, Labelling and Packaging regulation (EC 1272/2008) |
| **CMR** | Carcinogenic, Mutagenic, or toxic for Reproduction |
| **EC Number** | European Community number - EU's substance identifier |
| **ECHA** | European Chemicals Agency |
| **GHS** | Globally Harmonized System of Classification and Labelling |
| **GSR** | Global Substance Registry (this system) |
| **H-Statement** | Hazard statement - standardized warning phrase |
| **M-Factor** | Multiplication factor for aquatic toxicity classification |
| **PBT** | Persistent, Bioaccumulative, and Toxic |
| **POP** | Persistent Organic Pollutants |
| **REACH** | Registration, Evaluation, Authorisation of Chemicals regulation |
| **RoHS** | Restriction of Hazardous Substances directive |
| **SCL** | Specific Concentration Limit |
| **Seeding** | Loading data into the database |
| **Stub** | Minimal substance record created as a placeholder |
| **SVHC** | Substance of Very High Concern |
| **vPvB** | very Persistent and very Bioaccumulative |

---

## Further Reading

1. **REACH Regulation**: https://echa.europa.eu/regulations/reach
2. **CLP Regulation**: https://echa.europa.eu/regulations/clp
3. **SVHC Candidate List**: https://echa.europa.eu/candidate-list-table
4. **Annex XVII Restrictions**: https://echa.europa.eu/substances-restricted-under-reach
5. **Annex XIV Authorization**: https://echa.europa.eu/authorisation-list
6. **POP Regulation**: https://echa.europa.eu/persistent-organic-pollutants
7. **RoHS Directive**: https://environment.ec.europa.eu/topics/waste-and-recycling/rohs-directive_en
8. **GHS Purple Book (UN)**: https://unece.org/ghs-rev10-2023

---

*Last updated: 2026-02-02*
*Version: 2.0*
