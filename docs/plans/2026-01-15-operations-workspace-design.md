# Operations Workspace (Evidence Engine) Design

**Status:** Draft
**Date:** 2026-01-15
**Source:** Brainstorming session - Operations Workspace

---

## 1. Overview

The Operations Workspace is the **chain of custody engine** - it answers "who made this, where, and can we prove it?" This is where EU geographic transparency and supply chain due diligence requirements are satisfied.

### Core Principles

| Principle | Implementation |
|-----------|----------------|
| **Facility-Centric** | Suppliers own facilities; materials come from facilities, not abstract suppliers |
| **Certification-Governed** | No facility enters BOM search until verified |
| **Expiry-Aware** | Dashboard alerts on expiring certs before they become blockers |
| **Audit-Ready** | Every verification has timestamp + verifier + evidence |

### Ownership

| Owns | Description |
|------|-------------|
| Supplier registry | Company-level supplier records (legal entities) |
| Facility registry | Physical locations with geo-coordinates |
| Certification ledger | Cert tracking with validity periods |
| Onboarding workflows | Verification process management |
| Compliance dashboards | Expiry alerts, risk scoring |

---

## 2. Authority Model

> **Reference:** See [User Management Design](./2026-01-15-user-management-design.md) for complete authority model.

| Authority | Operations Workspace Capabilities |
|-----------|----------------------------------|
| **MANAGER** | Full CRUD, verify facilities, workspace settings |
| **EDITOR** | Create/edit suppliers and facilities, verify contributor submissions |
| **CONTRIBUTOR** | Create suppliers, upload certs (needs verification) |
| **VIEWER** | Read-only access, browse facility database |

---

## 3. Module Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       OPERATIONS WORKSPACE (EVIDENCE ENGINE)                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CORE MODULES                                                               │
│  ────────────                                                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Supplier   │  │  Facility   │  │ Certificate │  │  Onboarding │        │
│  │  Registry   │  │  Registry   │  │   Ledger    │  │   Workflow  │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │                │
│         └────────────────┴────────────────┴────────────────┘                │
│                                   │                                          │
│  INTEGRITY MODULES                ▼                                          │
│  ─────────────────    ┌─────────────────────┐                               │
│  ┌─────────────┐      │   VERIFICATION      │                               │
│  │   Expiry    │      │     MANAGER         │                               │
│  │  Dashboard  │◄────►│                     │                               │
│  └─────────────┘      └──────────┬──────────┘                               │
│  ┌─────────────┐                 │                                          │
│  │    Risk     │                 │                                          │
│  │   Scoring   │◄────────────────┤                                          │
│  └─────────────┘                 │                                          │
│  ┌─────────────┐                 │                                          │
│  │   Audit     │                 │                                          │
│  │    Trail    │◄────────────────┘                                          │
│  └─────────────┘                                                            │
│                                                                              │
│  BRIDGE TO DESIGN                                                           │
│  ─────────────────                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Design Workspace BOM ──(facility_id)──► Facility Registry              ││
│  │  • Only VERIFIED facilities appear in BOM material search               ││
│  │  • Expiring certs trigger WARNINGs in Design release validation         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Supplier Registry (Legal Entities)

### 4.1 Data Model

```sql
CREATE TYPE supplier_status AS ENUM (
    'PENDING',        -- Awaiting initial verification
    'VERIFIED',       -- Verified and active
    'SUSPENDED',      -- Temporarily blocked (compliance issue)
    'INACTIVE'        -- No longer used
);

CREATE TABLE supplier (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization(id),

    -- Legal identity
    name                VARCHAR(255) NOT NULL,
    legal_name          VARCHAR(255),
    code                VARCHAR(50),           -- Internal supplier code
    tax_id              VARCHAR(100),          -- VAT number / Tax ID
    duns_number         VARCHAR(20),           -- D-U-N-S if available

    -- Primary location (headquarters)
    country_code        CHAR(2) NOT NULL,
    region              VARCHAR(100),
    city                VARCHAR(100),
    address             TEXT,
    postal_code         VARCHAR(20),

    -- Compliance status
    status              supplier_status NOT NULL DEFAULT 'PENDING',
    status_reason       TEXT,
    status_changed_at   TIMESTAMPTZ,
    status_changed_by   UUID REFERENCES users(id),

    -- Risk assessment
    risk_level          VARCHAR(20),           -- LOW, MEDIUM, HIGH, CRITICAL
    risk_score          DECIMAL,               -- 0-100
    last_risk_assessment TIMESTAMPTZ,

    -- ESG scoring
    esg_score           DECIMAL,               -- 0-100
    esg_source          VARCHAR(100),          -- Source of ESG data

    -- Contact
    primary_contact     VARCHAR(255),
    contact_email       VARCHAR(255),
    contact_phone       VARCHAR(50),

    -- Metadata
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    created_by          UUID REFERENCES users(id),

    UNIQUE(organization_id, code)
);

CREATE INDEX idx_supplier_org ON supplier (organization_id);
CREATE INDEX idx_supplier_status ON supplier (status);
CREATE INDEX idx_supplier_country ON supplier (country_code);
CREATE INDEX idx_supplier_risk ON supplier (risk_level);
```

### 4.2 UI: Supplier List

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SUPPLIER REGISTRY                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [🔍 Search suppliers...]              [+ Add Supplier]                      │
│                                                                              │
│  Filters: [All Statuses ▼] [All Countries ▼] [All Risk Levels ▼]           │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Supplier          │ Country │ Facilities │ Status   │ Risk  │ ESG     ││
│  ├───────────────────│─────────│────────────│──────────│───────│─────────┤│
│  │ ACME Textiles Ltd │ 🇮🇳 IN   │ 3          │ ✓ VERIFIED│ LOW   │ 72/100  ││
│  │ GreenFiber GmbH   │ 🇩🇪 DE   │ 1          │ ✓ VERIFIED│ LOW   │ 89/100  ││
│  │ Pacific Metals    │ 🇨🇳 CN   │ 2          │ ⏳ PENDING │ MED   │ --      ││
│  │ QuickParts Inc    │ 🇺🇸 US   │ 1          │ ⚠️ SUSPEND│ HIGH  │ 45/100  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Showing 4 of 23 suppliers                        [< 1 2 3 ... >]           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Country Risk Index (CSDDD Compliance)

Geographic risk auto-elevation based on external indices (Transparency International, UN reports).

```sql
CREATE TABLE country_risk_index (
    country_code        CHAR(2) PRIMARY KEY,
    country_name        VARCHAR(100) NOT NULL,

    -- Risk scores (0-100, higher = more risk)
    corruption_index    DECIMAL,               -- Transparency International CPI (inverted)
    labor_risk_index    DECIMAL,               -- ILO/ITUC labor rights
    environmental_risk  DECIMAL,               -- Environmental Performance Index (inverted)
    conflict_risk       DECIMAL,               -- Armed Conflict Location & Event Data

    -- Composite score
    composite_risk      DECIMAL GENERATED ALWAYS AS (
        COALESCE(corruption_index, 0) * 0.3 +
        COALESCE(labor_risk_index, 0) * 0.3 +
        COALESCE(environmental_risk, 0) * 0.25 +
        COALESCE(conflict_risk, 0) * 0.15
    ) STORED,

    -- Auto-elevation threshold
    min_risk_level      VARCHAR(20),           -- If set, facilities here can't go below this

    -- Metadata
    source_year         INT,
    last_updated        TIMESTAMPTZ DEFAULT now()
);

-- Seed with example high-risk countries (CSDDD focus)
INSERT INTO country_risk_index (country_code, country_name, corruption_index, labor_risk_index, min_risk_level) VALUES
    ('MM', 'Myanmar', 85, 90, 'CRITICAL'),
    ('CD', 'DR Congo', 80, 75, 'HIGH'),
    ('CN', 'China', 55, 65, 'MEDIUM'),
    ('BD', 'Bangladesh', 60, 70, 'MEDIUM'),
    ('VN', 'Vietnam', 50, 55, NULL),
    ('IN', 'India', 45, 50, NULL),
    ('DE', 'Germany', 10, 5, NULL),
    ('NL', 'Netherlands', 8, 5, NULL);
```

### 4.4 Risk Calculation Service

```typescript
interface FacilityRiskAssessment {
  facilityId: string;
  calculatedRisk: number;       // 0-100
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  factors: RiskFactor[];
  countryFloor: string | null;  // Min risk from country index
}

interface RiskFactor {
  factor: string;
  score: number;
  weight: number;
  source: string;
}

async function calculateFacilityRisk(facilityId: string): Promise<FacilityRiskAssessment> {
  const facility = await getFacility(facilityId);
  const countryRisk = await getCountryRisk(facility.country_code);
  const certs = await getFacilityCertifications(facilityId);

  const factors: RiskFactor[] = [];

  // Factor 1: Country risk (30% weight)
  if (countryRisk) {
    factors.push({
      factor: 'Country Risk',
      score: countryRisk.composite_risk,
      weight: 0.30,
      source: `${countryRisk.country_name} (${countryRisk.source_year})`
    });
  }

  // Factor 2: Certification coverage (25% weight)
  const certScore = calculateCertCoverage(certs);
  factors.push({
    factor: 'Certification Coverage',
    score: 100 - certScore,  // Invert: more certs = less risk
    weight: 0.25,
    source: `${certs.length} active certifications`
  });

  // Factor 3: Certification freshness (20% weight)
  const expiryRisk = calculateExpiryRisk(certs);
  factors.push({
    factor: 'Cert Expiry Risk',
    score: expiryRisk,
    weight: 0.20,
    source: 'Days until nearest expiry'
  });

  // Factor 4: Verification age (15% weight)
  const verificationAge = daysSince(facility.verified_at);
  const ageScore = Math.min(verificationAge / 365 * 100, 100);
  factors.push({
    factor: 'Verification Age',
    score: ageScore,
    weight: 0.15,
    source: `Verified ${verificationAge} days ago`
  });

  // Factor 5: Historical issues (10% weight)
  const issueScore = await calculateHistoricalIssueScore(facilityId);
  factors.push({
    factor: 'Historical Issues',
    score: issueScore,
    weight: 0.10,
    source: 'Past suspensions/rejections'
  });

  // Calculate weighted score
  const calculatedRisk = factors.reduce(
    (sum, f) => sum + (f.score * f.weight), 0
  );

  // Determine risk level
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  if (calculatedRisk >= 75) riskLevel = 'CRITICAL';
  else if (calculatedRisk >= 50) riskLevel = 'HIGH';
  else if (calculatedRisk >= 25) riskLevel = 'MEDIUM';
  else riskLevel = 'LOW';

  // Apply country floor (CSDDD requirement)
  const countryFloor = countryRisk?.min_risk_level;
  if (countryFloor) {
    const floorOrder = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
    if (floorOrder[riskLevel] < floorOrder[countryFloor]) {
      riskLevel = countryFloor as typeof riskLevel;
    }
  }

  return {
    facilityId,
    calculatedRisk,
    riskLevel,
    factors,
    countryFloor
  };
}
```

### 4.5 UI: Risk Indicator with Country Floor

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ FACILITY RISK ASSESSMENT                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ACME Textile Plant - Vietnam                                               │
│                                                                              │
│  RISK LEVEL: ██████████░░░░░░░░░░  MEDIUM (47/100)                         │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Factor               │ Score │ Weight │ Source                         ││
│  │──────────────────────│───────│────────│────────────────────────────────││
│  │ Country Risk         │ 55    │ 30%    │ Vietnam (2025 TI/ILO)          ││
│  │ Certification Coverage│ 20   │ 25%    │ 4 active certifications        ││
│  │ Cert Expiry Risk     │ 35    │ 20%    │ Nearest: 89 days               ││
│  │ Verification Age     │ 45    │ 15%    │ Verified 164 days ago          ││
│  │ Historical Issues    │ 10    │ 10%    │ No past suspensions            ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ⚠️ No country floor applied (Vietnam has no minimum risk level)            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ FACILITY RISK ASSESSMENT                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Pacific Metals - Myanmar                                                   │
│                                                                              │
│  RISK LEVEL: ████████████████████  CRITICAL (82/100)                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Factor               │ Score │ Weight │ Source                         ││
│  │──────────────────────│───────│────────│────────────────────────────────││
│  │ Country Risk         │ 88    │ 30%    │ Myanmar (2025 TI/ILO)          ││
│  │ Certification Coverage│ 70   │ 25%    │ 1 active certification         ││
│  │ Cert Expiry Risk     │ 85    │ 20%    │ Nearest: 12 days (!)           ││
│  │ Verification Age     │ 80    │ 15%    │ Verified 292 days ago          ││
│  │ Historical Issues    │ 50    │ 10%    │ 1 past suspension              ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  🚨 COUNTRY FLOOR APPLIED: Myanmar minimum risk = CRITICAL (CSDDD)          │
│     Even with perfect scores, this facility cannot drop below CRITICAL      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Facility Registry (Physical Sites)

### 5.1 Data Model

```sql
CREATE TYPE facility_type AS ENUM (
    'EXTRACTION',     -- Mining, farming, raw material source
    'PROCESSING',     -- Material processing/transformation
    'MANUFACTURING',  -- Component/product manufacturing
    'ASSEMBLY',       -- Final assembly
    'WAREHOUSE',      -- Storage/distribution
    'TESTING_LAB'     -- Quality/compliance testing
);

CREATE TYPE facility_status AS ENUM (
    'PENDING_VERIFICATION',
    'VERIFIED',
    'EXPIRED',        -- Certifications expired
    'SUSPENDED',
    'INACTIVE'
);

CREATE TABLE facility (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id         UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,

    -- Identity
    name                VARCHAR(255) NOT NULL,
    code                VARCHAR(50),           -- Facility code within supplier
    facility_type       facility_type NOT NULL,

    -- Location (REQUIRED for EU transparency)
    country_code        CHAR(2) NOT NULL,
    region              VARCHAR(100),
    city                VARCHAR(100),
    address             TEXT NOT NULL,
    postal_code         VARCHAR(20),

    -- Geographic coordinates (required for EUDR, some ESPR filings)
    latitude            DECIMAL(10, 7),
    longitude           DECIMAL(10, 7),
    geo_accuracy        VARCHAR(50),           -- GPS, Address lookup, Manual

    -- Verification status
    certification_status facility_status NOT NULL DEFAULT 'PENDING_VERIFICATION',
    status_reason        TEXT,
    verified_at          TIMESTAMPTZ,
    verified_by          UUID REFERENCES users(id),

    -- Capacity/capability
    product_types        TEXT[],               -- What they can produce
    annual_capacity      VARCHAR(100),         -- e.g., "50,000 units/year"

    -- Contact
    site_contact         VARCHAR(255),
    site_email           VARCHAR(255),
    site_phone           VARCHAR(50),

    -- Metadata
    notes                TEXT,
    created_at           TIMESTAMPTZ DEFAULT now(),
    updated_at           TIMESTAMPTZ DEFAULT now(),
    created_by           UUID REFERENCES users(id),

    UNIQUE(supplier_id, code)
);

CREATE INDEX idx_facility_supplier ON facility (supplier_id);
CREATE INDEX idx_facility_status ON facility (certification_status);
CREATE INDEX idx_facility_country ON facility (country_code);
CREATE INDEX idx_facility_type ON facility (facility_type);
CREATE INDEX idx_facility_geo ON facility USING gist (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
```

### 5.2 UI: Facility Detail

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ← Back to ACME Textiles Ltd                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ACME Main Textile Plant - North Wing                    [✓ VERIFIED]       │
│  ACME Textiles Ltd • Processing Facility                                    │
│                                                                              │
│  ┌─────────────────────────────────────┐  ┌─────────────────────────────────┐│
│  │ LOCATION                            │  │ MAP                             ││
│  ├─────────────────────────────────────┤  │ ┌─────────────────────────────┐││
│  │ 123 Industrial Zone                 │  │ │                             │││
│  │ Surat, Gujarat, India               │  │ │      📍                     │││
│  │ 394210                              │  │ │                             │││
│  │                                     │  │ │    [Google Maps View]       │││
│  │ 📍 21.1702° N, 72.8311° E           │  │ │                             │││
│  │ (GPS verified)                      │  │ └─────────────────────────────┘││
│  └─────────────────────────────────────┘  └─────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ CERTIFICATIONS                                          [+ Add Cert]    ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │ Certification    │ Number       │ Issuer    │ Valid Until │ Status     ││
│  │──────────────────│──────────────│───────────│─────────────│────────────││
│  │ GOTS 6.0         │ CU-123456    │ CERES     │ 2027-03-15  │ ✓ Verified ││
│  │ ISO 14001:2015   │ ISO-789012   │ TÜV SÜD   │ 2026-11-30  │ ⚠️ 45 days ││
│  │ OEKO-TEX 100     │ OT-345678    │ Hohenstein│ 2026-06-01  │ ✓ Verified ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Certification Ledger

### 6.1 Design Principle

Certifications attach to **facilities**, not suppliers. A company may claim "ISO certified" but only specific factories hold that certification.

### 6.2 Data Model

```sql
CREATE TYPE cert_status AS ENUM (
    'PENDING_REVIEW',     -- Uploaded, awaiting verification
    'VERIFIED',           -- Verified by Operations user
    'AUTO_VERIFIED',      -- Verified via API integration
    'REJECTED',           -- Verification failed
    'EXPIRED'             -- Past valid_until date
);

CREATE TYPE cert_category AS ENUM (
    'ENVIRONMENTAL',      -- ISO 14001, EMAS
    'QUALITY',            -- ISO 9001
    'SOCIAL',             -- SA8000, SMETA
    'MATERIAL',           -- GOTS, GRS, OEKO-TEX
    'SAFETY',             -- REACH, RoHS
    'CHAIN_OF_CUSTODY',   -- FSC, PEFC
    'CONFLICT_MINERALS',  -- RMI, LBMA
    'OTHER'
);

CREATE TABLE facility_certification (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id         UUID NOT NULL REFERENCES facility(id) ON DELETE CASCADE,

    -- Certificate identity
    cert_type           VARCHAR(100) NOT NULL,     -- e.g., "GOTS 6.0", "ISO 14001:2015"
    cert_category       cert_category NOT NULL,
    cert_number         VARCHAR(100),
    issuing_body        VARCHAR(255) NOT NULL,
    issuing_country     CHAR(2),

    -- Validity period
    valid_from          DATE NOT NULL,
    valid_until         DATE NOT NULL,

    -- Evidence
    document_id         UUID REFERENCES document(id),
    external_url        VARCHAR(500),              -- Link to issuer's verification page

    -- Verification status
    status              cert_status NOT NULL DEFAULT 'PENDING_REVIEW',
    verification_method VARCHAR(50),               -- MANUAL, API_CHECK, DOCUMENT_REVIEW
    verified_by         UUID REFERENCES users(id),
    verified_at         TIMESTAMPTZ,
    verification_notes  TEXT,

    -- Auto-verification support
    api_verification_id VARCHAR(255),              -- ID from external API
    last_api_check      TIMESTAMPTZ,

    -- Metadata
    created_at          TIMESTAMPTZ DEFAULT now(),
    created_by          UUID REFERENCES users(id),

    UNIQUE(facility_id, cert_type, cert_number)
);

-- Track certificate status changes (audit trail)
CREATE TABLE facility_certification_history (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certification_id    UUID NOT NULL REFERENCES facility_certification(id),
    previous_status     cert_status NOT NULL,
    new_status          cert_status NOT NULL,
    reason              TEXT,
    changed_by          UUID REFERENCES users(id),
    changed_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cert_facility ON facility_certification (facility_id);
CREATE INDEX idx_cert_status ON facility_certification (status);
CREATE INDEX idx_cert_expiry ON facility_certification (valid_until);
CREATE INDEX idx_cert_category ON facility_certification (cert_category);
CREATE INDEX idx_cert_type ON facility_certification (cert_type);
```

### 6.3 Standard Certificate Types

```sql
-- Seed common certificate types for easy selection
CREATE TABLE cert_type_template (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(50) UNIQUE NOT NULL,
    name            VARCHAR(255) NOT NULL,
    category        cert_category NOT NULL,
    issuing_bodies  TEXT[],                    -- Known issuers
    api_endpoint    VARCHAR(500),              -- For auto-verification
    description     TEXT
);

INSERT INTO cert_type_template (code, name, category, issuing_bodies) VALUES
    -- Environmental
    ('ISO_14001', 'ISO 14001:2015 Environmental Management', 'ENVIRONMENTAL', ARRAY['TÜV', 'DNV', 'BSI', 'SGS']),
    ('EMAS', 'EU Eco-Management and Audit Scheme', 'ENVIRONMENTAL', ARRAY['National Accreditation Bodies']),

    -- Quality
    ('ISO_9001', 'ISO 9001:2015 Quality Management', 'QUALITY', ARRAY['TÜV', 'DNV', 'BSI', 'SGS']),

    -- Social
    ('SA8000', 'SA8000 Social Accountability', 'SOCIAL', ARRAY['SAI']),
    ('SMETA', 'Sedex Members Ethical Trade Audit', 'SOCIAL', ARRAY['Sedex']),
    ('BSCI', 'Business Social Compliance Initiative', 'SOCIAL', ARRAY['amfori']),

    -- Material (Textiles)
    ('GOTS', 'Global Organic Textile Standard', 'MATERIAL', ARRAY['CERES', 'Control Union', 'Ecocert']),
    ('GRS', 'Global Recycled Standard', 'MATERIAL', ARRAY['CERES', 'Control Union', 'Ecocert']),
    ('OCS', 'Organic Content Standard', 'MATERIAL', ARRAY['CERES', 'Control Union']),
    ('OEKO_TEX_100', 'OEKO-TEX Standard 100', 'MATERIAL', ARRAY['Hohenstein', 'TESTEX']),
    ('OEKO_TEX_STeP', 'OEKO-TEX STeP', 'MATERIAL', ARRAY['Hohenstein', 'TESTEX']),

    -- Chain of Custody
    ('FSC', 'Forest Stewardship Council', 'CHAIN_OF_CUSTODY', ARRAY['FSC', 'SCS Global', 'SGS']),
    ('PEFC', 'Programme for Endorsement of Forest Certification', 'CHAIN_OF_CUSTODY', ARRAY['PEFC']),

    -- Safety
    ('REACH', 'REACH Compliance Declaration', 'SAFETY', ARRAY['Self-declaration']),
    ('ROHS', 'RoHS Compliance Declaration', 'SAFETY', ARRAY['Self-declaration']),

    -- Conflict Minerals
    ('RMI', 'Responsible Minerals Initiative', 'CONFLICT_MINERALS', ARRAY['RMI']),
    ('LBMA', 'London Bullion Market Association', 'CONFLICT_MINERALS', ARRAY['LBMA']);
```

---

## 7. Onboarding & Verification Workflow

### 7.1 Workflow States

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SUPPLIER/FACILITY ONBOARDING FLOW                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STEP 1: CREATE                    STEP 2: UPLOAD                           │
│  (Contributor+)                    (Contributor+)                           │
│  ┌─────────────┐                   ┌─────────────┐                          │
│  │   Supplier  │                   │   Facility  │                          │
│  │   Created   │──────────────────►│  + Certs    │                          │
│  │  (PENDING)  │                   │  Uploaded   │                          │
│  └─────────────┘                   └──────┬──────┘                          │
│                                           │                                  │
│                                           ▼                                  │
│                                   ┌─────────────┐                           │
│  STEP 3: VERIFY                   │  PENDING    │                           │
│  (Editor+ OR Auto-API)            │  REVIEW     │                           │
│                                   └──────┬──────┘                           │
│                          ┌───────────────┼───────────────┐                  │
│                          ▼               ▼               ▼                  │
│                   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│                   │ AUTO_VERIFY │ │   MANUAL    │ │  REJECTED   │          │
│                   │ (API check) │ │   VERIFY    │ │  (invalid)  │          │
│                   └──────┬──────┘ └──────┬──────┘ └─────────────┘          │
│                          │               │                                  │
│                          └───────┬───────┘                                  │
│                                  ▼                                          │
│                          ┌─────────────┐                                    │
│                          │  VERIFIED   │                                    │
│                          │  (active)   │◄─────────────────────┐            │
│                          └──────┬──────┘                      │            │
│                                 │                              │            │
│                                 │ (cert expires)               │ (renewed) │
│                                 ▼                              │            │
│                          ┌─────────────┐                       │            │
│                          │   EXPIRED   │───────────────────────┘            │
│                          └─────────────┘                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Verification Actions

```typescript
interface VerificationAction {
  certificationId: string;
  action: 'APPROVE' | 'REJECT' | 'REQUEST_INFO';
  method: 'MANUAL' | 'API_CHECK' | 'DOCUMENT_REVIEW';
  notes?: string;
  verifiedBy: string;  // user ID
}

async function verifyCertification(
  action: VerificationAction
): Promise<FacilityCertification> {
  const cert = await getCertification(action.certificationId);

  if (action.action === 'APPROVE') {
    // Update certification status
    await updateCertification(cert.id, {
      status: action.method === 'API_CHECK' ? 'AUTO_VERIFIED' : 'VERIFIED',
      verification_method: action.method,
      verified_by: action.verifiedBy,
      verified_at: new Date(),
      verification_notes: action.notes
    });

    // Log to history
    await logCertHistory(cert.id, cert.status, 'VERIFIED', action.notes, action.verifiedBy);

    // Update facility status if all required certs verified
    await updateFacilityStatusIfComplete(cert.facility_id);

  } else if (action.action === 'REJECT') {
    await updateCertification(cert.id, {
      status: 'REJECTED',
      verification_notes: action.notes,
      verified_by: action.verifiedBy,
      verified_at: new Date()
    });

    await logCertHistory(cert.id, cert.status, 'REJECTED', action.notes, action.verifiedBy);

    // Notify the uploader
    await notifyUser(cert.created_by, {
      type: 'CERT_REJECTED',
      message: `Certificate ${cert.cert_type} was rejected: ${action.notes}`
    });
  }

  return getCertification(action.certificationId);
}

async function updateFacilityStatusIfComplete(facilityId: string): Promise<void> {
  const facility = await getFacility(facilityId);
  const certs = await getFacilityCertifications(facilityId);

  // Check if all PENDING certs are now verified
  const pendingCerts = certs.filter(c => c.status === 'PENDING_REVIEW');

  if (pendingCerts.length === 0) {
    const hasExpired = certs.some(c => c.status === 'EXPIRED');

    await updateFacility(facilityId, {
      certification_status: hasExpired ? 'EXPIRED' : 'VERIFIED',
      verified_at: hasExpired ? null : new Date()
    });
  }
}
```

### 7.3 Auto-Verification (Trusted Sources)

```typescript
interface AutoVerifyConfig {
  certType: string;
  apiEndpoint: string;
  apiKey?: string;
  responseMapping: {
    statusField: string;
    validValues: string[];
    expiryField?: string;
  };
}

const AUTO_VERIFY_CONFIGS: AutoVerifyConfig[] = [
  {
    certType: 'GOTS',
    apiEndpoint: 'https://global-standard.org/api/v1/verify',
    responseMapping: {
      statusField: 'certification_status',
      validValues: ['VALID', 'ACTIVE'],
      expiryField: 'valid_until'
    }
  }
  // Add more as APIs become available
];

async function attemptAutoVerification(
  certificationId: string
): Promise<{ success: boolean; message: string }> {
  const cert = await getCertification(certificationId);
  const config = AUTO_VERIFY_CONFIGS.find(c => c.certType === cert.cert_type);

  if (!config) {
    return { success: false, message: 'No auto-verification available for this cert type' };
  }

  try {
    const response = await fetch(config.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey && { 'Authorization': `Bearer ${config.apiKey}` })
      },
      body: JSON.stringify({
        cert_number: cert.cert_number,
        issuing_body: cert.issuing_body
      })
    });

    const data = await response.json();
    const status = data[config.responseMapping.statusField];

    if (config.responseMapping.validValues.includes(status)) {
      await updateCertification(cert.id, {
        status: 'AUTO_VERIFIED',
        verification_method: 'API_CHECK',
        api_verification_id: data.id,
        last_api_check: new Date(),
        verification_notes: `Auto-verified via ${config.apiEndpoint}`
      });

      await updateFacilityStatusIfComplete(cert.facility_id);

      return { success: true, message: 'Certificate verified via API' };
    } else {
      return { success: false, message: `API returned status: ${status}` };
    }
  } catch (error) {
    return { success: false, message: `API error: ${error.message}` };
  }
}
```

---

## 8. Expiry Dashboard

### 8.1 UI: Compliance Dashboard

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      OPERATIONS COMPLIANCE DASHBOARD                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐             │
│  │   VERIFIED       │ │   EXPIRING       │ │    EXPIRED       │             │
│  │   FACILITIES     │ │   < 60 DAYS      │ │   FACILITIES     │             │
│  │                  │ │                  │ │                  │             │
│  │      47          │ │       5          │ │       2          │             │
│  │    ✓ Active      │ │    ⚠️ Warning    │ │    ❌ Blocked    │             │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘             │
│                                                                              │
│  EXPIRING CERTIFICATIONS                                    [Export CSV]    │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Facility              │ Cert Type     │ Expires    │ Days │ Action     ││
│  │───────────────────────│───────────────│────────────│──────│────────────││
│  │ ACME Plant A (India)  │ ISO 14001     │ 2026-02-28 │  44  │ [Renew]    ││
│  │ GreenFiber HQ (DE)    │ GOTS 6.0      │ 2026-03-05 │  49  │ [Renew]    ││
│  │ Pacific Metals (CN)   │ OEKO-TEX 100  │ 2026-03-10 │  54  │ [Renew]    ││
│  │ ...                                                                     ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  PENDING VERIFICATIONS                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Facility              │ Cert Type     │ Uploaded   │ By         │ Action││
│  │───────────────────────│───────────────│────────────│────────────│───────││
│  │ NewSupplier (Vietnam) │ GOTS 6.0      │ 2026-01-14 │ John D.    │ [Review]│
│  │ NewSupplier (Vietnam) │ ISO 9001      │ 2026-01-14 │ John D.    │ [Review]│
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Expiry Alert Service

```typescript
interface ExpiryAlert {
  facilityId: string;
  facilityName: string;
  supplierName: string;
  certType: string;
  expiresAt: Date;
  daysRemaining: number;
  severity: 'WARNING' | 'CRITICAL' | 'EXPIRED';
}

async function getExpiryAlerts(
  organizationId: string,
  thresholdDays: number = 60
): Promise<ExpiryAlert[]> {
  const alerts: ExpiryAlert[] = [];
  const today = new Date();

  const expiringCerts = await db.query(`
    SELECT
      fc.id,
      fc.cert_type,
      fc.valid_until,
      f.id as facility_id,
      f.name as facility_name,
      s.name as supplier_name,
      (fc.valid_until - CURRENT_DATE) as days_remaining
    FROM facility_certification fc
    JOIN facility f ON fc.facility_id = f.id
    JOIN supplier s ON f.supplier_id = s.id
    WHERE s.organization_id = $1
      AND fc.status IN ('VERIFIED', 'AUTO_VERIFIED')
      AND fc.valid_until <= CURRENT_DATE + INTERVAL '${thresholdDays} days'
    ORDER BY fc.valid_until ASC
  `, [organizationId]);

  for (const cert of expiringCerts) {
    const daysRemaining = cert.days_remaining;

    let severity: 'WARNING' | 'CRITICAL' | 'EXPIRED';
    if (daysRemaining <= 0) {
      severity = 'EXPIRED';
    } else if (daysRemaining <= 14) {
      severity = 'CRITICAL';
    } else {
      severity = 'WARNING';
    }

    alerts.push({
      facilityId: cert.facility_id,
      facilityName: cert.facility_name,
      supplierName: cert.supplier_name,
      certType: cert.cert_type,
      expiresAt: cert.valid_until,
      daysRemaining,
      severity
    });
  }

  return alerts;
}

// Scheduled job: Check expiries daily
async function dailyExpiryCheck(): Promise<void> {
  const organizations = await getAllOrganizations();

  for (const org of organizations) {
    const alerts = await getExpiryAlerts(org.id);

    // Mark expired certifications
    const expired = alerts.filter(a => a.severity === 'EXPIRED');
    for (const alert of expired) {
      await markCertificationExpired(alert);
    }

    // Send notifications for critical items
    const critical = alerts.filter(a => a.severity === 'CRITICAL');
    if (critical.length > 0) {
      await sendExpiryNotification(org.id, critical);
    }
  }
}
```

---

## 9. Agnostic Order Management (The Execution Kernel)

### 9.1 The SAP-Lite Approach

Every physical movement or transformation of goods starts with an **Order Entity**. Whether you are a producer or an importer, the system tracks the transition from Intent to Evidence using the same schema.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AGNOSTIC ORDER FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  UNIFIED CORE STATUS:                                                       │
│  DRAFT → SUBMITTED → APPROVED → IN_PROGRESS → COMPLETED → CLOSED           │
│                                                                              │
│  ORDER TYPE EXTENSIONS:                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ PURCHASE (PO)   │  │ WORK (WO)       │  │ SALES (SO)      │             │
│  │ Procurement     │  │ Production      │  │ Distribution    │             │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤             │
│  │ +SENT_TO_SUPPLIER│ │ +SCHEDULED      │  │ +PICKING        │             │
│  │ +ACKNOWLEDGED   │  │ +QC_PENDING     │  │ +PACKED         │             │
│  │ +CUSTOMS_CLEARED│  │ +QC_PASSED      │  │ +SHIPPED        │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                              │
│  IMPORTER uses: PO → Inbound Logistics → Inventory → SO                    │
│  PRODUCER uses: PO → Inventory → WO → Batch → SO                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Order Data Model

```sql
CREATE TYPE order_type AS ENUM (
    'PURCHASE',       -- Procurement: Buy from supplier
    'WORK',           -- Execution: Produce/transform
    'SALES',          -- Distribution: Sell to customer
    'TRANSFER'        -- Internal: Move between locations
);

CREATE TYPE order_status AS ENUM (
    -- Core lifecycle (all types)
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'IN_PROGRESS',
    'COMPLETED',
    'CLOSED',
    'CANCELLED'
);

CREATE TABLE operations_order (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization(id),

    -- Order identity
    order_type          order_type NOT NULL,
    order_number        VARCHAR(50) NOT NULL,

    -- Core lifecycle
    status              order_status NOT NULL DEFAULT 'DRAFT',
    status_changed_at   TIMESTAMPTZ,
    status_changed_by   UUID REFERENCES users(id),

    -- What (Design link - the "Compliance Contract")
    product_id          UUID REFERENCES product(id),
    design_version_id   UUID REFERENCES workspace_version(id),

    -- Quantities
    quantity_ordered    DECIMAL NOT NULL,
    quantity_fulfilled  DECIMAL DEFAULT 0,
    unit                VARCHAR(20) NOT NULL DEFAULT 'units',

    -- Timeline
    order_date          DATE NOT NULL DEFAULT CURRENT_DATE,
    required_date       DATE,
    actual_start        TIMESTAMPTZ,
    actual_end          TIMESTAMPTZ,

    -- Type-specific extensions (JSONB for flexibility)
    extensions          JSONB DEFAULT '{}',

    -- Notes & metadata
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    created_by          UUID REFERENCES users(id),

    UNIQUE(organization_id, order_type, order_number)
);

CREATE INDEX idx_order_org ON operations_order (organization_id);
CREATE INDEX idx_order_type ON operations_order (order_type);
CREATE INDEX idx_order_status ON operations_order (status);
CREATE INDEX idx_order_product ON operations_order (product_id);
```

### 9.3 Type-Specific Extensions

```typescript
// Purchase Order extensions
interface PurchaseOrderExtensions {
  supplier_id: string;
  facility_id: string;

  // Procurement states
  sent_to_supplier_at?: Date;
  acknowledged_at?: Date;

  // Shipment tracking
  shipment_ids?: string[];
  customs_cleared?: boolean;

  // Payment
  payment_terms?: string;
  currency?: string;
  total_amount?: number;
}

// Work Order extensions
interface WorkOrderExtensions {
  facility_id: string;

  // Scheduling
  scheduled_start?: Date;
  scheduled_end?: Date;

  // QC
  qc_status?: 'PENDING' | 'PASSED' | 'FAILED';
  qc_performed_by?: string;
  qc_performed_at?: Date;
  qc_results?: Record<string, any>;
}

// Sales Order extensions
interface SalesOrderExtensions {
  customer_id: string;
  shipping_address?: Address;

  // Fulfillment states
  picking_started_at?: Date;
  packed_at?: Date;
  shipped_at?: Date;
  delivered_at?: Date;

  // Carrier
  carrier?: string;
  tracking_number?: string;
}
```

### 9.4 Risk-Gated Procurement

```typescript
async function submitPurchaseOrder(orderId: string): Promise<SubmitResult> {
  const order = await getOrder(orderId);
  const ext = order.extensions as PurchaseOrderExtensions;

  // 1. Check facility compliance
  const facility = await getFacility(ext.facility_id);
  const riskAssessment = await calculateFacilityRisk(facility.id);

  // Block if CRITICAL risk floor
  if (riskAssessment.riskLevel === 'CRITICAL') {
    return {
      success: false,
      blocked: true,
      reason: `Facility "${facility.name}" has CRITICAL risk level. PO submission blocked.`
    };
  }

  // 2. Check certification status
  if (facility.certification_status === 'EXPIRED') {
    return {
      success: false,
      blocked: true,
      reason: `Facility "${facility.name}" has expired certifications.`
    };
  }

  // 3. Check design compliance requirements vs facility certs
  const designRequirements = await getDesignComplianceRequirements(order.design_version_id);
  const facilityCerts = await getFacilityCertifications(facility.id);

  for (const req of designRequirements) {
    const hasCert = facilityCerts.some(c =>
      c.cert_type === req.required_cert && c.status === 'VERIFIED'
    );
    if (!hasCert) {
      return {
        success: false,
        blocked: true,
        reason: `Design requires "${req.required_cert}" but facility lacks certification.`
      };
    }
  }

  // All checks passed - submit
  await updateOrder(orderId, { status: 'SUBMITTED', status_changed_at: new Date() });
  return { success: true, blocked: false };
}
```

---

## 10. Event Ledger (Digital Notary)

### 10.1 The Evidence Journal

Every physical action is recorded as a **Notary Event** with Who, When, Where, and cryptographic proof.

```sql
CREATE TYPE event_type AS ENUM (
    -- Attestations (human declarations)
    'ATTESTATION_START',
    'ATTESTATION_COMPLETE',
    'ATTESTATION_WITNESS',

    -- Material events
    'MATERIAL_RECEIVED',
    'MATERIAL_CONSUMED',
    'MATERIAL_REJECTED',

    -- Quality events
    'QC_INSPECTION',
    'QC_SAMPLE_TAKEN',
    'QC_RESULT_RECORDED',

    -- Logistics events
    'SHIPMENT_DISPATCHED',
    'SHIPMENT_IN_TRANSIT',
    'CUSTOMS_CLEARED',
    'GOODS_RECEIVED',

    -- Production events
    'PRODUCTION_STARTED',
    'PRODUCTION_PAUSED',
    'PRODUCTION_RESUMED',
    'PRODUCTION_COMPLETED',

    -- Identity events
    'BATCH_CREATED',
    'SERIAL_ASSIGNED',
    'LABEL_PRINTED',

    -- Document events
    'DOCUMENT_UPLOADED',
    'DOCUMENT_VERIFIED'
);

CREATE TABLE operations_event (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization(id),

    -- Link to order
    order_id            UUID NOT NULL REFERENCES operations_order(id),

    -- Event identity
    event_type          event_type NOT NULL,
    event_number        INT NOT NULL,

    -- When & Where (Spatiotemporal Anchor)
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    latitude            DECIMAL(10, 7),
    longitude           DECIMAL(10, 7),
    geo_accuracy_m      DECIMAL,
    location_name       VARCHAR(255),

    -- Who (The Attester)
    performed_by        UUID NOT NULL REFERENCES users(id),
    attester_role       VARCHAR(100),

    -- What (Event payload)
    payload             JSONB NOT NULL DEFAULT '{}',

    -- Evidence (Photos, Documents)
    evidence            JSONB DEFAULT '[]',

    -- Content hash (for integrity)
    content_hash        VARCHAR(64),
    previous_hash       VARCHAR(64),

    -- DIGITAL SEAL (Non-repudiation)
    signer_did          VARCHAR(255),
    signature_jws       TEXT,
    signature_alg       VARCHAR(20),

    -- Verification
    is_verified         BOOLEAN DEFAULT false,
    verified_by         UUID REFERENCES users(id),
    verified_at         TIMESTAMPTZ,

    created_at          TIMESTAMPTZ DEFAULT now(),

    UNIQUE(order_id, event_number)
);

CREATE INDEX idx_event_order ON operations_event (order_id);
CREATE INDEX idx_event_type ON operations_event (event_type);
CREATE INDEX idx_event_time ON operations_event (occurred_at);
```

### 10.2 Required Events per Order Type

```sql
CREATE TABLE order_type_required_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID REFERENCES organization(id),

    order_type          order_type NOT NULL,
    event_type          event_type NOT NULL,
    required_for_status order_status NOT NULL,

    requires_geo        BOOLEAN DEFAULT false,
    requires_photo      BOOLEAN DEFAULT false,
    requires_document   BOOLEAN DEFAULT false,
    is_mandatory        BOOLEAN DEFAULT true,

    UNIQUE(organization_id, order_type, event_type, required_for_status)
);

-- System defaults
INSERT INTO order_type_required_events
    (organization_id, order_type, event_type, required_for_status, requires_geo, requires_photo)
VALUES
    (NULL, 'PURCHASE', 'GOODS_RECEIVED', 'COMPLETED', true, true),
    (NULL, 'PURCHASE', 'QC_INSPECTION', 'COMPLETED', false, false),
    (NULL, 'WORK', 'PRODUCTION_STARTED', 'IN_PROGRESS', false, false),
    (NULL, 'WORK', 'MATERIAL_CONSUMED', 'COMPLETED', false, false),
    (NULL, 'WORK', 'PRODUCTION_COMPLETED', 'COMPLETED', false, true),
    (NULL, 'WORK', 'QC_INSPECTION', 'COMPLETED', false, false),
    (NULL, 'WORK', 'BATCH_CREATED', 'COMPLETED', false, false),
    (NULL, 'SALES', 'SHIPMENT_DISPATCHED', 'COMPLETED', false, false);
```

### 10.3 Digital Seal (JWS Non-Repudiation)

```typescript
async function createSignedEvent(
  input: SignedEventInput,
  userId: string
): Promise<OperationsEvent> {
  const user = await getUser(userId);

  // 1. Build the content to sign
  const content = {
    order_id: input.orderId,
    event_type: input.eventType,
    occurred_at: new Date().toISOString(),
    payload: input.payload,
    evidence: input.evidence || [],
    location: input.location
  };

  // 2. Hash the content
  const contentHash = sha256(JSON.stringify(content));

  // 3. Get previous event hash for chain integrity
  const previousEvent = await getLastEvent(input.orderId);
  const previousHash = previousEvent?.content_hash || null;

  // 4. Sign with user's private key (DID)
  const signature = await signWithUserKey(userId, {
    content_hash: contentHash,
    previous_hash: previousHash,
    timestamp: content.occurred_at
  });

  // 5. Store the event with digital seal
  return await db.insert('operations_event', {
    organization_id: user.organization_id,
    order_id: input.orderId,
    event_type: input.eventType,
    event_number: (previousEvent?.event_number || 0) + 1,
    occurred_at: content.occurred_at,
    latitude: input.location?.latitude,
    longitude: input.location?.longitude,
    performed_by: userId,
    payload: content.payload,
    evidence: content.evidence,
    content_hash: contentHash,
    previous_hash: previousHash,
    signer_did: user.did,
    signature_jws: signature.jws,
    signature_alg: signature.algorithm
  });
}
```

### 10.4 Evidence-Gated Status Transitions

```typescript
async function transitionOrderStatus(
  orderId: string,
  targetStatus: order_status,
  userId: string
): Promise<TransitionResult> {
  const order = await getOrder(orderId);
  const recordedEvents = await getOrderEvents(orderId);
  const requiredEvents = await getRequiredEvents(order.order_type, targetStatus);

  const missingEvents = [];

  for (const required of requiredEvents) {
    const matching = recordedEvents.find(e => e.event_type === required.event_type);

    if (!matching && required.is_mandatory) {
      missingEvents.push({
        eventType: required.event_type,
        requiresGeo: required.requires_geo,
        requiresPhoto: required.requires_photo
      });
    }
  }

  if (missingEvents.length > 0) {
    return {
      success: false,
      blocked: true,
      reason: 'Missing required notary events',
      missingEvents
    };
  }

  await updateOrder(orderId, { status: targetStatus, status_changed_at: new Date() });
  return { success: true, blocked: false };
}
```

---

## 11. Inventory Lots (Incoming Materials)

### 11.1 Lot Data Model

```sql
CREATE TYPE lot_status AS ENUM (
    'IN_TRANSIT',
    'RECEIVED',
    'QC_PENDING',
    'AVAILABLE',
    'QUARANTINED',
    'DEPLETED',
    'EXPIRED',
    'REJECTED'
);

CREATE TABLE inventory_lot (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization(id),

    -- Source tracking
    purchase_order_id   UUID REFERENCES operations_order(id),
    facility_id         UUID NOT NULL REFERENCES facility(id),

    -- Lot identity
    lot_number          VARCHAR(50) NOT NULL,
    supplier_lot_number VARCHAR(50),

    -- What is it?
    product_id          UUID NOT NULL REFERENCES product(id),
    design_version_id   UUID REFERENCES workspace_version(id),

    -- Quantities
    quantity_received   DECIMAL NOT NULL,
    quantity_available  DECIMAL NOT NULL,
    quantity_consumed   DECIMAL DEFAULT 0,
    quantity_rejected   DECIMAL DEFAULT 0,
    unit                VARCHAR(20) NOT NULL,

    -- Dates
    production_date     DATE,
    received_date       DATE NOT NULL,
    expiry_date         DATE,

    -- Status
    status              lot_status NOT NULL DEFAULT 'RECEIVED',

    -- Storage
    warehouse_id        UUID,
    location_code       VARCHAR(50),

    -- Compliance inheritance (snapshot at receipt)
    facility_risk_level VARCHAR(20),
    facility_certs      JSONB,

    -- Notary links
    received_event_id   UUID REFERENCES operations_event(id),
    qc_event_id         UUID REFERENCES operations_event(id),

    created_at          TIMESTAMPTZ DEFAULT now(),

    UNIQUE(organization_id, lot_number)
);

CREATE INDEX idx_lot_org ON inventory_lot (organization_id);
CREATE INDEX idx_lot_product ON inventory_lot (product_id);
CREATE INDEX idx_lot_facility ON inventory_lot (facility_id);
CREATE INDEX idx_lot_status ON inventory_lot (status);
```

---

## 12. Batches & Serial Numbers (Produced Goods)

### 12.1 Batch Data Model

```sql
CREATE TYPE batch_status AS ENUM (
    'OPEN',
    'CLOSED',
    'QC_PENDING',
    'QC_PASSED',
    'QC_FAILED',
    'RELEASED',
    'ON_HOLD',
    'RECALLED'
);

CREATE TABLE batch (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization(id),

    -- Source tracking
    work_order_id       UUID NOT NULL REFERENCES operations_order(id),
    facility_id         UUID NOT NULL REFERENCES facility(id),

    -- Batch identity
    batch_number        VARCHAR(50) NOT NULL,

    -- What was produced?
    product_id          UUID NOT NULL REFERENCES product(id),
    design_version_id   UUID NOT NULL REFERENCES workspace_version(id),

    -- Quantities
    quantity_produced   INT NOT NULL,
    quantity_passed_qc  INT DEFAULT 0,
    quantity_failed_qc  INT DEFAULT 0,
    quantity_allocated  INT DEFAULT 0,
    quantity_shipped    INT DEFAULT 0,
    quantity_available  INT GENERATED ALWAYS AS (
        quantity_passed_qc - quantity_allocated
    ) STORED,

    -- Timeline
    production_start    TIMESTAMPTZ NOT NULL,
    production_end      TIMESTAMPTZ,
    release_date        DATE,
    expiry_date         DATE,

    -- Status
    status              batch_status NOT NULL DEFAULT 'OPEN',

    -- Traceability: which lots went into this batch?
    consumed_lots       JSONB NOT NULL DEFAULT '[]',

    -- Notary links
    created_event_id    UUID REFERENCES operations_event(id),
    qc_event_id         UUID REFERENCES operations_event(id),
    released_event_id   UUID REFERENCES operations_event(id),

    created_at          TIMESTAMPTZ DEFAULT now(),

    UNIQUE(organization_id, batch_number)
);

CREATE INDEX idx_batch_org ON batch (organization_id);
CREATE INDEX idx_batch_product ON batch (product_id);
CREATE INDEX idx_batch_wo ON batch (work_order_id);
CREATE INDEX idx_batch_status ON batch (status);
```

### 12.2 Serial Number Data Model

```sql
CREATE TYPE serial_status AS ENUM (
    'GENERATED',
    'LABELED',
    'IN_STOCK',
    'ALLOCATED',
    'SHIPPED',
    'DELIVERED',
    'RETURNED',
    'SCRAPPED'
);

CREATE TABLE serial_number (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization(id),

    -- Parent batch
    batch_id            UUID NOT NULL REFERENCES batch(id),

    -- Serial identity
    serial_number       VARCHAR(100) NOT NULL,

    -- Inherited
    product_id          UUID NOT NULL REFERENCES product(id),
    design_version_id   UUID NOT NULL REFERENCES workspace_version(id),

    -- Status
    status              serial_status NOT NULL DEFAULT 'GENERATED',

    -- DPP link
    dpp_id              UUID,
    dpp_uri             VARCHAR(500),

    -- Sales tracking
    sales_order_id      UUID REFERENCES operations_order(id),
    shipped_at          TIMESTAMPTZ,
    customer_id         UUID,
    last_known_location VARCHAR(255),

    -- Notary links
    generated_event_id  UUID REFERENCES operations_event(id),
    shipped_event_id    UUID REFERENCES operations_event(id),

    created_at          TIMESTAMPTZ DEFAULT now(),

    UNIQUE(organization_id, serial_number)
);

CREATE INDEX idx_serial_batch ON serial_number (batch_id);
CREATE INDEX idx_serial_dpp ON serial_number (dpp_uri);
CREATE INDEX idx_serial_status ON serial_number (status);
```

### 12.3 Traceability Chain

```
LOT (Input)           BATCH (Output)         SERIAL (Unit)         DPP
───────────           ─────────────          ─────────────         ───
┌─────────┐           ┌─────────┐            ┌─────────┐          ┌─────────┐
│ LOT-001 │──┐        │ BATCH-  │──────┬────►│ SN-0001 │─────────►│ DPP-001 │
│ Cotton  │  │        │ 2026-   │      │     └─────────┘          └─────────┘
└─────────┘  │        │ 0042    │      │     ┌─────────┐          ┌─────────┐
┌─────────┐  ├───────►│         │      ├────►│ SN-0002 │─────────►│ DPP-002 │
│ LOT-002 │──┤        │ 500 pcs │      │     └─────────┘          └─────────┘
│ Polyester  │        └─────────┘      │          ...                  ...
└─────────┘  │                         │     ┌─────────┐          ┌─────────┐
┌─────────┐  │                         └────►│ SN-0500 │─────────►│ DPP-500 │
│ LOT-003 │──┘                               └─────────┘          └─────────┘
│ Buttons │
└─────────┘
```

---

## 13. Consumption Tracking & Mass Balance

### 13.1 Consumption Log

```sql
CREATE TABLE consumption_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization(id),

    -- What order/batch consumed this?
    work_order_id       UUID NOT NULL REFERENCES operations_order(id),
    batch_id            UUID REFERENCES batch(id),

    -- What was consumed?
    lot_id              UUID NOT NULL REFERENCES inventory_lot(id),
    material_product_id UUID NOT NULL REFERENCES product(id),
    material_name       VARCHAR(255) NOT NULL,

    -- Quantities
    quantity_consumed   DECIMAL NOT NULL,
    unit                VARCHAR(20) NOT NULL,

    -- BOM reference (Actual vs Planned)
    bom_entry_id        UUID,
    bom_quantity        DECIMAL,
    bom_unit            VARCHAR(20),

    -- Variance
    variance_qty        DECIMAL GENERATED ALWAYS AS (
        quantity_consumed - COALESCE(bom_quantity, 0)
    ) STORED,
    variance_pct        DECIMAL,
    variance_reason     TEXT,

    -- Notary link
    consumption_event_id UUID NOT NULL REFERENCES operations_event(id),

    consumed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    consumed_by         UUID NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_consumption_wo ON consumption_log (work_order_id);
CREATE INDEX idx_consumption_lot ON consumption_log (lot_id);
```

### 13.2 Mass Balance Ledger

Prevents "compliance leakage" - claiming more certified material than available.

```sql
CREATE TABLE mass_balance_ledger (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization(id),

    cert_type           VARCHAR(100) NOT NULL,
    material_product_id UUID NOT NULL REFERENCES product(id),

    balance_in          DECIMAL NOT NULL DEFAULT 0,
    balance_out         DECIMAL NOT NULL DEFAULT 0,
    balance_available   DECIMAL GENERATED ALWAYS AS (
        balance_in - balance_out
    ) STORED,

    period_start        DATE NOT NULL,
    period_end          DATE NOT NULL,
    last_updated        TIMESTAMPTZ DEFAULT now(),

    UNIQUE(organization_id, cert_type, material_product_id, period_start)
);

CREATE TABLE mass_balance_entry (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ledger_id           UUID NOT NULL REFERENCES mass_balance_ledger(id),

    entry_type          VARCHAR(20) NOT NULL,  -- 'IN' or 'OUT'
    quantity            DECIMAL NOT NULL,
    unit                VARCHAR(20) NOT NULL,

    lot_id              UUID REFERENCES inventory_lot(id),
    batch_id            UUID REFERENCES batch(id),
    event_id            UUID REFERENCES operations_event(id),

    running_balance     DECIMAL NOT NULL,
    entry_date          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 13.3 Variance Report Service

```typescript
interface VarianceReport {
  workOrderId: string;
  productName: string;
  quantityProduced: number;
  materials: MaterialVariance[];
  overallVariance: 'WITHIN_TOLERANCE' | 'WARNING' | 'EXCEEDED';
}

async function generateVarianceReport(workOrderId: string): Promise<VarianceReport> {
  const workOrder = await getOrder(workOrderId);
  const consumptions = await getConsumptionsByWorkOrder(workOrderId);
  const bomEntries = await getBomEntries(workOrder.design_version_id);

  const materials: MaterialVariance[] = [];
  const byMaterial = groupBy(consumptions, 'material_product_id');

  for (const [materialId, logs] of Object.entries(byMaterial)) {
    const bomEntry = bomEntries.find(b => b.child_product_id === materialId);
    const totalConsumed = logs.reduce((sum, l) => sum + l.quantity_consumed, 0);
    const bomExpected = bomEntry ? bomEntry.quantity * workOrder.quantity_ordered : 0;

    const varianceQty = totalConsumed - bomExpected;
    const variancePct = bomExpected > 0 ? (varianceQty / bomExpected) * 100 : null;

    let status: 'OK' | 'WARNING' | 'EXCEEDED' = 'OK';
    if (Math.abs(variancePct || 0) > 10) status = 'EXCEEDED';
    else if (Math.abs(variancePct || 0) > 5) status = 'WARNING';

    materials.push({
      materialName: logs[0].material_name,
      bomQuantity: bomExpected,
      actualQuantity: totalConsumed,
      varianceQty,
      variancePct: variancePct || 0,
      status,
      lots: logs.map(l => ({ lotNumber: l.lot_number, quantity: l.quantity_consumed }))
    });
  }

  return {
    workOrderId,
    productName: workOrder.product_name,
    quantityProduced: workOrder.quantity_fulfilled,
    materials,
    overallVariance: materials.some(m => m.status === 'EXCEEDED') ? 'EXCEEDED' :
                     materials.some(m => m.status === 'WARNING') ? 'WARNING' : 'WITHIN_TOLERANCE'
  };
}
```

---

## 14. UI: Mobile-First Execution

### 14.1 Work Order Event Recording

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WORK ORDER #WO-2026-0042                                  │
│                    Status: IN_PROGRESS                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  REQUIRED TO COMPLETE:                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ ✓ PRODUCTION_STARTED        Recorded 2 hrs ago by Maria S.             ││
│  │ ✓ MATERIAL_CONSUMED         Lot #COT-2026-089 consumed                 ││
│  │ ○ PRODUCTION_COMPLETED      📷 Photo required                          ││
│  │ ○ QC_INSPECTION             Pending                                    ││
│  │ ○ BATCH_CREATED             Pending                                    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │              [📷 RECORD PRODUCTION COMPLETE]                            ││
│  │         Tap to take photo and record completion                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  [Mark Complete]  ← Blocked until all required events recorded             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 14.2 Signed Event Display

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ EVENT #5: GOODS_RECEIVED                                     🔐 SEALED      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📦 LOT-2026-089 received                                                   │
│  Qty: 450 kg Organic Cotton                                                 │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ DIGITAL SEAL                                                 ✓ VALID   ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │ Signer:    Maria Santos                                                 ││
│  │ DID:       did:key:z6MkhaXgBZDvot...                                   ││
│  │ Signed:    2026-01-15 09:32:15 UTC                                      ││
│  │ Algorithm: EdDSA                                                        ││
│  │                                                                          ││
│  │ 📍 21.1702°N, 72.8311°E (ACME Plant A, Vietnam)                        ││
│  │ 📷 3 photos attached                                                    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  This event cannot be modified. Maria's signature provides legal proof.    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 14.3 Variance Report

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    VARIANCE REPORT: WO-2026-0042                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Quantity Produced: 500 units          Overall: ⚠️ WARNING                  │
│                                                                              │
│  MATERIAL CONSUMPTION vs BOM                                                │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Material         │ BOM      │ Actual   │ Variance │ Status             ││
│  │──────────────────│──────────│──────────│──────────│────────────────────││
│  │ Organic Cotton   │ 450.0 kg │ 463.2 kg │ +2.9%    │ ✓ OK               ││
│  │ Recycled Poly    │ 25.0 kg  │ 27.1 kg  │ +8.4%    │ ⚠️ WARNING         ││
│  │ Metal Buttons    │ 500 pcs  │ 512 pcs  │ +2.4%    │ ✓ OK               ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  MASS BALANCE CHECK                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ GOTS (Organic Cotton):  ✓ 463.2 kg consumed / 892.5 kg available       ││
│  │ GRS (Recycled Poly):    ✓ 27.1 kg consumed / 156.0 kg available        ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 15. API Endpoints

### Suppliers

```
GET    /api/v1/operations/suppliers                    # List suppliers
GET    /api/v1/operations/suppliers/:id                # Get supplier with facilities
POST   /api/v1/operations/suppliers                    # Create supplier
PUT    /api/v1/operations/suppliers/:id                # Update supplier
PUT    /api/v1/operations/suppliers/:id/status         # Update supplier status
DELETE /api/v1/operations/suppliers/:id                # Archive supplier
```

### Facilities

```
GET    /api/v1/operations/facilities                   # List all facilities
GET    /api/v1/operations/facilities/verified          # List only verified (for BOM search)
GET    /api/v1/operations/suppliers/:id/facilities     # List supplier's facilities
GET    /api/v1/operations/facilities/:id               # Get facility detail
POST   /api/v1/operations/suppliers/:id/facilities     # Create facility
PUT    /api/v1/operations/facilities/:id               # Update facility
PUT    /api/v1/operations/facilities/:id/verify        # Verify facility (Editor+)
```

### Certifications

```
GET    /api/v1/operations/facilities/:id/certifications  # List facility certs
POST   /api/v1/operations/facilities/:id/certifications  # Add certification
PUT    /api/v1/operations/certifications/:id             # Update certification
POST   /api/v1/operations/certifications/:id/verify      # Verify certification
POST   /api/v1/operations/certifications/:id/auto-verify # Attempt auto-verify
DELETE /api/v1/operations/certifications/:id             # Remove certification
```

### Dashboard

```
GET    /api/v1/operations/dashboard/expiring           # Get expiring certs
GET    /api/v1/operations/dashboard/pending            # Get pending verifications
GET    /api/v1/operations/dashboard/stats              # Get compliance stats
```

### Orders

```
GET    /api/v1/operations/orders                       # List orders (filter by type)
GET    /api/v1/operations/orders/:id                   # Get order with events
POST   /api/v1/operations/orders                       # Create order
PUT    /api/v1/operations/orders/:id                   # Update order
POST   /api/v1/operations/orders/:id/submit            # Submit for approval
POST   /api/v1/operations/orders/:id/approve           # Approve order
POST   /api/v1/operations/orders/:id/transition        # Transition status
```

### Events

```
GET    /api/v1/operations/orders/:id/events            # List order events
POST   /api/v1/operations/orders/:id/events            # Record new event (signed)
GET    /api/v1/operations/events/:id                   # Get event detail
POST   /api/v1/operations/events/:id/verify            # Verify event signature
```

### Inventory Lots

```
GET    /api/v1/operations/lots                         # List lots
GET    /api/v1/operations/lots/:id                     # Get lot detail
POST   /api/v1/operations/lots                         # Create lot (with receipt event)
PUT    /api/v1/operations/lots/:id                     # Update lot
POST   /api/v1/operations/lots/:id/qc                  # Record QC result
```

### Batches

```
GET    /api/v1/operations/batches                      # List batches
GET    /api/v1/operations/batches/:id                  # Get batch with traceability
POST   /api/v1/operations/batches                      # Create batch
PUT    /api/v1/operations/batches/:id                  # Update batch
POST   /api/v1/operations/batches/:id/close            # Close batch
POST   /api/v1/operations/batches/:id/release          # Release batch
GET    /api/v1/operations/batches/:id/serials          # List batch serials
```

### Serial Numbers

```
GET    /api/v1/operations/serials                      # List serials
GET    /api/v1/operations/serials/:id                  # Get serial detail
POST   /api/v1/operations/batches/:id/serials          # Generate serials for batch
PUT    /api/v1/operations/serials/:id                  # Update serial status
GET    /api/v1/operations/serials/by-dpp/:uri          # Lookup by DPP URI
```

### Consumption & Reports

```
GET    /api/v1/operations/orders/:id/consumption       # List consumption for order
POST   /api/v1/operations/orders/:id/consume           # Record consumption (with event)
GET    /api/v1/operations/orders/:id/variance          # Get variance report
GET    /api/v1/operations/mass-balance                 # Get mass balance summary
GET    /api/v1/operations/mass-balance/:certType       # Get cert-specific balance
```

---

## 16. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.2 | 2026-01-15 | Added Execution Engine: Orders, Events, Lots, Batches, Serials, Consumption |
| 0.1 | 2026-01-15 | Initial draft: Suppliers, Facilities, Certifications |

---

## 17. Related Documents

- [Design Workspace Design](./2026-01-15-design-workspace-design.md) - BOM facility links
- [Taxonomy Engine Design](./2026-01-15-taxonomy-engine-design.md) - Shared data model
- [User Management Design](./2026-01-15-user-management-design.md) - Authority model
- [Architecture Design](./2026-01-15-architecture-design.md) - System architecture
