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

### 12.4 DPP Lifecycle Integration

Operations events trigger DPP state transitions in the Compliance Workspace. This is the **bridge** between logistics statuses and compliance statuses.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    OPERATIONS → COMPLIANCE BRIDGE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  OPERATIONS EVENT              COMPLIANCE ACTION              BILLING       │
│  ═══════════════════════════   ══════════════════════════   ═════════════  │
│                                                                              │
│  Serial Created (GENERATED)                                                 │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • serial_number record created                                             │
│  • DPP URI reserved in Compliance                                           │
│  • dpp_snapshot created in COMMISSIONED state                               │
│  • QR label can be printed immediately                                      │
│  • ❌ NO CHARGE - just URI reservation                                       │
│                                                                              │
│  Batch Released (RELEASED)                                                  │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • batch.status → RELEASED                                                  │
│  • Triggers Snapshot Engine for ALL batch serials                           │
│  • Each DPP transitions COMMISSIONED → PROVISIONED                          │
│  • Design + Marketing + Operations data frozen                              │
│  • ✅ PER-DPP FEE CHARGED (billing event)                                    │
│                                                                              │
│  Serial Delivered (DELIVERED)                                               │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • serial_number.status → DELIVERED                                         │
│  • DPP transitions PROVISIONED → ACTIVE                                     │
│  • Public landing page fully visible                                        │
│  • ❌ NO CHARGE                                                              │
│                                                                              │
│  Batch Recalled (RECALLED)                                                  │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • batch.status → RECALLED                                                  │
│  • ALL batch DPPs transition to RECALLED                                    │
│  • Recall overlay injected on landing pages                                 │
│  • Status List 2021 updated (revocation)                                    │
│  • ✅ RECALL FEE CHARGED (€0.001/item)                                       │
│                                                                              │
│  Serial Scrapped (SCRAPPED)                                                 │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • serial_number.status → SCRAPPED                                          │
│  • DPP transitions to DECOMMISSIONED                                        │
│  • Landing page shows "Product Retired"                                     │
│  • ❌ NO CHARGE                                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.5 DPP Trigger Service

```typescript
// This service listens to Operations events and triggers Compliance actions

interface DPPTriggerService {
  // Called when serials are generated for a batch
  onSerialsGenerated(batchId: string, serialIds: string[]): Promise<void>;

  // Called when batch status changes to RELEASED
  onBatchReleased(batchId: string): Promise<SnapshotResult>;

  // Called when serial delivery is confirmed
  onSerialDelivered(serialId: string): Promise<void>;

  // Called when batch is recalled
  onBatchRecalled(batchId: string, recallId: string): Promise<void>;

  // Called when serial is scrapped
  onSerialScrapped(serialId: string, reason: string): Promise<void>;
}

// Implementation
async function onSerialsGenerated(batchId: string, serialIds: string[]): Promise<void> {
  const batch = await getBatch(batchId);

  for (const serialId of serialIds) {
    const serial = await getSerial(serialId);

    // Reserve DPP URI (Birth Certificate Model)
    const dppUri = generateDigitalLinkURI(batch.gtin, serial.serial_number);

    // Create DPP in COMMISSIONED state (empty shell)
    const dpp = await createDPPSnapshot({
      serial_id: serialId,
      organization_id: batch.organization_id,
      dpp_uri: dppUri,
      gtin: batch.gtin,
      serial_number: serial.serial_number,
      status: 'COMMISSIONED',
      // Data fields empty until PROVISIONED
      design_data: {},
      marketing_data: {},
      operations_data: {},
    });

    // Link serial to DPP
    await updateSerial(serialId, {
      dpp_id: dpp.id,
      dpp_uri: dppUri
    });
  }
}

async function onBatchReleased(batchId: string): Promise<SnapshotResult> {
  // This triggers the Compliance Workspace's Snapshot Engine
  // See: compliance-workspace-design.md Section 5

  const batch = await getBatch(batchId);
  const serials = await getBatchSerials(batchId);

  const results = {
    success: true,
    dpps_created: 0,
    dpps_failed: 0,
    errors: []
  };

  for (const serial of serials) {
    try {
      // Trigger full snapshot (freezes Design + Marketing + Operations data)
      await snapshotEngine.createDPPSnapshot(serial.id);
      results.dpps_created++;
    } catch (error) {
      results.dpps_failed++;
      results.errors.push({ serialId: serial.id, error: error.message });
    }
  }

  // Record billing event
  await recordDPPUsage({
    organization_id: batch.organization_id,
    batch_id: batchId,
    dpps_provisioned: results.dpps_created,
    billing_triggered: true
  });

  return results;
}

async function onSerialDelivered(serialId: string): Promise<void> {
  const serial = await getSerial(serialId);

  if (serial.dpp_id) {
    await transitionDPPStatus(serial.dpp_id, 'ACTIVE', {
      trigger: 'DELIVERY_CONFIRMED',
      triggered_by: 'SYSTEM'
    });
  }
}

async function onBatchRecalled(batchId: string, recallId: string): Promise<void> {
  const serials = await getBatchSerials(batchId);
  const recall = await getRecall(recallId);

  for (const serial of serials) {
    if (serial.dpp_id) {
      await transitionDPPStatus(serial.dpp_id, 'RECALLED', {
        trigger: 'RECALL_ISSUED',
        triggered_by: 'USER',
        recall_id: recallId,
        recall_overlay: {
          severity: recall.severity,
          title: recall.title,
          consumer_action: recall.consumer_action
        }
      });
    }
  }

  // Record recall billing event
  await recordRecallUsage({
    organization_id: recall.organization_id,
    recall_id: recallId,
    items_affected: serials.length
  });
}

async function onSerialScrapped(serialId: string, reason: string): Promise<void> {
  const serial = await getSerial(serialId);

  if (serial.dpp_id) {
    await transitionDPPStatus(serial.dpp_id, 'DECOMMISSIONED', {
      trigger: 'END_OF_LIFE',
      triggered_by: 'USER',
      reason_code: reason
    });
  }
}
```

### 12.6 Status Mapping Reference

| Operations Status | Context | DPP Status | Trigger |
|-------------------|---------|------------|---------|
| serial `GENERATED` | Serial created | `COMMISSIONED` | `onSerialsGenerated()` |
| batch `RELEASED` | Batch released | `PROVISIONED` | `onBatchReleased()` |
| serial `DELIVERED` | Delivery confirmed | `ACTIVE` | `onSerialDelivered()` |
| batch `RECALLED` | Quality issue | `RECALLED` | `onBatchRecalled()` |
| serial `SCRAPPED` | End of life | `DECOMMISSIONED` | `onSerialScrapped()` |

> **Reference:** See [Compliance Workspace Design](./2026-01-15-compliance-workspace-design.md#4-dpp-lifecycle-birth-certificate-model) for complete DPP lifecycle details.

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

## 16. Shipping & Logistics Module

### 16.1 Strategic Overview

EuroComply acts as a **Logistics Broker** - we don't just record that a product is compliant; we notarize the movement of goods across borders. The shipping label becomes the **"Seal of Compliance"**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    THE "COMPLIANT HIGHWAY" MODEL                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TRADITIONAL SHIPPING                   EUROCOMPLY SHIPPING                 │
│  ────────────────────                   ────────────────────                │
│  Ship first, prove later                Prove first, then ship             │
│  Compliance is paperwork                Compliance is built-in             │
│  Labels are just logistics              Labels are "Sealed Evidence"       │
│                                                                              │
│  THE COMPLIANCE GATE:                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  1. STAGE    │ User selects Batch/Serials to ship                   │   │
│  │  2. VERIFY   │ System runs Compliance Scan (notary events, certs)   │   │
│  │  3. BUY      │ User selects carrier, sees rate + Compliance Fee     │   │
│  │  4. SEAL     │ Label generated, EPCIS AggregationEvent minted       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  KEY INSIGHT: If we don't control the label, we can't guarantee that       │
│  the physical goods match the digital notary chain.                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 16.2 Carrier Integration (Aggregator Model)

We use **EasyPost** (or similar aggregator) as our single integration point. This provides access to 100+ carriers while focusing engineering on our differentiator: the Compliance Gate.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CARRIER INTEGRATION ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐       │
│  │   EuroComply    │     │    EasyPost     │     │    Carriers     │       │
│  │  Compliance     │────►│   Aggregator    │────►│  DHL, UPS, etc  │       │
│  │     Gate        │     │                 │     │                 │       │
│  └─────────────────┘     └─────────────────┘     └─────────────────┘       │
│          │                       │                       │                  │
│          │                       │                       │                  │
│   Verify serials          Get rates             Generate label             │
│   Check certs             Create shipment       Track package              │
│   Mint EPCIS event        Void label            Delivery webhook           │
│                                                                              │
│  COST MODEL:                                                                │
│  ─────────────                                                              │
│  EasyPost fee:        ~€0.05/label                                         │
│  Carrier rate:        €15.00 (passed through)                              │
│  Our markup:          €1.50 (10%)                                          │
│  Compliance Unlock:   €15.00 (Evidence Package)                            │
│  EPCIS Events:        €0.03 × 500 EPCs = €15.00                           │
│  ──────────────────────────────────────                                    │
│  Customer pays:       €46.55                                               │
│  Our revenue:         €31.45                                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 16.3 Shipping Consignment Data Model

```sql
CREATE TYPE consignment_status AS ENUM (
    'STAGED',           -- Serials selected, not yet verified
    'VERIFIED',         -- Compliance scan passed
    'PAID',             -- Payment collected
    'LABEL_GENERATED',  -- Label created, EPCIS minted
    'IN_TRANSIT',       -- Carrier has package
    'DELIVERED',        -- Confirmed delivery
    'CANCELLED',        -- Cancelled before shipment
    'EXCEPTION'         -- Delivery exception
);

CREATE TYPE consignment_direction AS ENUM (
    'INBOUND',          -- Procurement (PO receiving)
    'OUTBOUND'          -- Distribution (SO fulfillment)
);

CREATE TABLE shipping_consignment (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization(id),

    -- Link to order
    order_id            UUID REFERENCES operations_order(id),
    direction           consignment_direction NOT NULL,

    -- Consignment identity
    consignment_number  VARCHAR(50) NOT NULL,

    -- What's being shipped (EPC binding)
    serial_ids          UUID[] NOT NULL,
    epc_list            TEXT[] NOT NULL,
    epc_merkle_root     VARCHAR(64) NOT NULL,   -- Cryptographic binding
    unit_count          INT NOT NULL,

    -- Origin (with EUDR/ESPR spatiotemporal proof)
    origin_facility_id  UUID REFERENCES facility(id),
    origin_gln          VARCHAR(20),
    origin_latitude     DECIMAL(10, 7),
    origin_longitude    DECIMAL(10, 7),
    origin_captured_at  TIMESTAMPTZ,
    origin_event_id     UUID REFERENCES operations_event(id),

    -- Destination
    destination_name    VARCHAR(255) NOT NULL,
    destination_address TEXT NOT NULL,
    destination_city    VARCHAR(100),
    destination_country CHAR(2) NOT NULL,
    destination_postal  VARCHAR(20),

    -- Carrier/Aggregator data
    aggregator          VARCHAR(50) DEFAULT 'EASYPOST',
    aggregator_shipment_id VARCHAR(255),
    carrier_code        VARCHAR(50),
    carrier_name        VARCHAR(100),
    service_level       VARCHAR(100),
    tracking_number     VARCHAR(255),
    label_url           TEXT,
    label_format        VARCHAR(20) DEFAULT 'PDF',

    -- GS1 / EPCIS data
    sscc                VARCHAR(30),            -- Serial Shipping Container Code
    epcis_event_id      UUID REFERENCES epcis_event(id),

    -- Compliance verification
    compliance_status   VARCHAR(20),            -- PASSED, FAILED, PENDING
    compliance_checked_at TIMESTAMPTZ,
    compliance_issues   JSONB DEFAULT '[]',

    -- Evidence Package
    evidence_package_id UUID,
    evidence_generated_at TIMESTAMPTZ,

    -- Costs & Monetization
    carrier_rate        DECIMAL(10, 2),
    carrier_currency    CHAR(3) DEFAULT 'EUR',
    logistics_markup    DECIMAL(10, 2),
    compliance_fee      DECIMAL(10, 2),
    epcis_fee           DECIMAL(10, 2),
    total_charged       DECIMAL(10, 2),

    -- Status tracking
    status              consignment_status NOT NULL DEFAULT 'STAGED',
    status_changed_at   TIMESTAMPTZ,

    -- Timestamps
    estimated_delivery  DATE,
    shipped_at          TIMESTAMPTZ,
    delivered_at        TIMESTAMPTZ,

    created_at          TIMESTAMPTZ DEFAULT now(),
    created_by          UUID REFERENCES users(id),

    UNIQUE(organization_id, consignment_number)
);

CREATE INDEX idx_consignment_org ON shipping_consignment (organization_id);
CREATE INDEX idx_consignment_order ON shipping_consignment (order_id);
CREATE INDEX idx_consignment_status ON shipping_consignment (status);
CREATE INDEX idx_consignment_tracking ON shipping_consignment (tracking_number);
CREATE INDEX idx_consignment_sscc ON shipping_consignment (sscc);
```

### 16.4 Compliance Gate Service

```typescript
interface ComplianceGateResult {
  passed: boolean;
  canShip: boolean;
  issues: ComplianceIssue[];
  evidencePackageReady: boolean;
}

interface ComplianceIssue {
  severity: 'BLOCKER' | 'WARNING' | 'INFO';
  code: string;
  message: string;
  serialId?: string;
  facilityId?: string;
}

async function runComplianceGate(
  consignmentId: string
): Promise<ComplianceGateResult> {
  const consignment = await getConsignment(consignmentId);
  const issues: ComplianceIssue[] = [];

  // 1. Verify all serials have signed notary events
  for (const serialId of consignment.serial_ids) {
    const serial = await getSerial(serialId);
    const batch = await getBatch(serial.batch_id);
    const events = await getOrderEvents(batch.work_order_id);

    // Check required events are signed
    const requiredTypes = ['PRODUCTION_COMPLETED', 'QC_INSPECTION', 'BATCH_CREATED'];
    for (const type of requiredTypes) {
      const event = events.find(e => e.event_type === type);
      if (!event) {
        issues.push({
          severity: 'BLOCKER',
          code: 'MISSING_NOTARY_EVENT',
          message: `Serial ${serial.serial_number} missing ${type} event`,
          serialId,
        });
      } else if (!event.signature_jws) {
        issues.push({
          severity: 'BLOCKER',
          code: 'UNSIGNED_EVENT',
          message: `Event ${type} for serial ${serial.serial_number} is not signed`,
          serialId,
        });
      }
    }
  }

  // 2. Check facility risk levels
  const facilityId = consignment.origin_facility_id;
  const riskAssessment = await calculateFacilityRisk(facilityId);

  if (riskAssessment.riskLevel === 'CRITICAL') {
    issues.push({
      severity: 'BLOCKER',
      code: 'FACILITY_CRITICAL_RISK',
      message: `Origin facility has CRITICAL risk level`,
      facilityId,
    });
  } else if (riskAssessment.riskLevel === 'HIGH') {
    issues.push({
      severity: 'WARNING',
      code: 'FACILITY_HIGH_RISK',
      message: `Origin facility has HIGH risk level - additional scrutiny may apply`,
      facilityId,
    });
  }

  // 3. Check facility certifications
  const facility = await getFacility(facilityId);
  if (facility.certification_status === 'EXPIRED') {
    issues.push({
      severity: 'BLOCKER',
      code: 'FACILITY_CERTS_EXPIRED',
      message: `Origin facility has expired certifications`,
      facilityId,
    });
  }

  // 4. Verify mass balance (no compliance leakage)
  const massBalanceOk = await checkMassBalance(consignment.serial_ids);
  if (!massBalanceOk) {
    issues.push({
      severity: 'BLOCKER',
      code: 'MASS_BALANCE_VIOLATION',
      message: 'Mass balance check failed - certified material insufficient',
    });
  }

  // 5. Verify EPC Merkle root matches serials
  const computedRoot = computeMerkleRoot(consignment.epc_list);
  if (computedRoot !== consignment.epc_merkle_root) {
    issues.push({
      severity: 'BLOCKER',
      code: 'EPC_INTEGRITY_FAILED',
      message: 'EPC list has been tampered with',
    });
  }

  const blockers = issues.filter(i => i.severity === 'BLOCKER');
  const passed = blockers.length === 0;

  // Update consignment
  await updateConsignment(consignmentId, {
    compliance_status: passed ? 'PASSED' : 'FAILED',
    compliance_checked_at: new Date(),
    compliance_issues: issues,
    status: passed ? 'VERIFIED' : 'STAGED',
  });

  return {
    passed,
    canShip: passed,
    issues,
    evidencePackageReady: passed,
  };
}
```

### 16.5 Label Generation Flow

```typescript
async function generateShippingLabel(
  consignmentId: string,
  carrierSelection: CarrierSelection,
  paymentMethodId: string
): Promise<LabelGenerationResult> {
  const consignment = await getConsignment(consignmentId);
  const org = await getOrganization(consignment.organization_id);

  // 1. Verify compliance gate passed
  if (consignment.compliance_status !== 'PASSED') {
    throw new Error('Compliance gate must pass before label generation');
  }

  // 2. Calculate costs
  const carrierRate = carrierSelection.rate;
  const logisticsMarkup = carrierRate * 0.10;  // 10% markup
  const complianceFee = getComplianceFee(org.plan);
  const epcisRate = getEpcisRate(org.plan);
  const epcisFee = consignment.unit_count * epcisRate;
  const totalCharged = carrierRate + logisticsMarkup + complianceFee + epcisFee;

  // 3. Charge payment
  const payment = await stripe.paymentIntents.create({
    amount: Math.round(totalCharged * 100),
    currency: 'eur',
    customer: org.stripeCustomerId,
    payment_method: paymentMethodId,
    confirm: true,
    metadata: {
      consignment_id: consignmentId,
      type: 'SHIPPING_LABEL',
    },
  });

  if (payment.status !== 'succeeded') {
    throw new Error('Payment failed');
  }

  // 4. Update consignment with costs
  await updateConsignment(consignmentId, {
    status: 'PAID',
    carrier_rate: carrierRate,
    logistics_markup: logisticsMarkup,
    compliance_fee: complianceFee,
    epcis_fee: epcisFee,
    total_charged: totalCharged,
  });

  // 5. Generate SSCC (Serial Shipping Container Code)
  const sscc = generateSSCC(org.gs1_company_prefix, consignment.consignment_number);

  // 6. Create shipment with aggregator
  const easypostShipment = await easypost.Shipment.create({
    from_address: await getFromAddress(consignment),
    to_address: {
      name: consignment.destination_name,
      street1: consignment.destination_address,
      city: consignment.destination_city,
      country: consignment.destination_country,
      zip: consignment.destination_postal,
    },
    parcel: carrierSelection.parcel,
    carrier_accounts: [carrierSelection.carrier_account_id],
    service: carrierSelection.service,
  });

  // 7. Buy the label
  const boughtShipment = await easypost.Shipment.buy(
    easypostShipment.id,
    { rate: carrierSelection.rate_id }
  );

  // 8. Mint EPCIS AggregationEvent (THE SEAL)
  const epcisEvent = await mintEpcisAggregationEvent({
    parentId: sscc,
    childEpcs: consignment.epc_list,
    bizStep: 'urn:epcglobal:cbv:bizstep:packing',
    disposition: 'urn:epcglobal:cbv:disp:in_progress',
    readPoint: consignment.origin_gln,
    bizLocation: consignment.origin_gln,
  });

  // 9. Generate Evidence Package
  const evidencePackage = await generateEvidencePackage(consignmentId);

  // 10. Update consignment with label data
  await updateConsignment(consignmentId, {
    status: 'LABEL_GENERATED',
    sscc,
    aggregator_shipment_id: boughtShipment.id,
    carrier_code: boughtShipment.selected_rate.carrier,
    carrier_name: boughtShipment.selected_rate.carrier,
    service_level: boughtShipment.selected_rate.service,
    tracking_number: boughtShipment.tracking_code,
    label_url: boughtShipment.postage_label.label_url,
    epcis_event_id: epcisEvent.id,
    evidence_package_id: evidencePackage.package_id,
    evidence_generated_at: new Date(),
    shipped_at: new Date(),
  });

  // 11. Record billing
  await recordShippingTransaction({
    organizationId: org.id,
    consignmentId,
    carrierCost: carrierRate,
    epcCount: consignment.unit_count,
  });

  // 12. Update serial statuses
  for (const serialId of consignment.serial_ids) {
    await updateSerial(serialId, {
      status: 'SHIPPED',
      shipped_at: new Date(),
      shipped_event_id: epcisEvent.operations_event_id,
    });
  }

  return {
    success: true,
    consignmentId,
    sscc,
    trackingNumber: boughtShipment.tracking_code,
    labelUrl: boughtShipment.postage_label.label_url,
    evidencePackageId: evidencePackage.package_id,
    totalCharged,
  };
}
```

### 16.6 UI: Shipping Console

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SHIPPING CONSOLE                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CREATE SHIPMENT                                           [+ New Shipment]  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Step 1: SELECT ITEMS                                     [COMPLETED ✓] ││
│  │                                                                          ││
│  │ Batch: BATCH-2026-0042 (500 units)                                      ││
│  │ Serials selected: 500 of 500                                            ││
│  │ EPC Merkle Root: 8f3a2b1c...                                           ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Step 2: COMPLIANCE GATE                                  [PASSED ✓]    ││
│  │                                                                          ││
│  │ ✓ All 500 serials have signed notary events                            ││
│  │ ✓ Origin facility: ACME Plant A (Vietnam) - VERIFIED                   ││
│  │ ✓ Facility risk: MEDIUM (acceptable)                                   ││
│  │ ✓ Certifications: GOTS 6.0 (valid), ISO 14001 (valid)                 ││
│  │ ✓ Mass balance: GOTS cotton sufficient (463kg available)              ││
│  │ ✓ EPC integrity verified                                               ││
│  │                                                                          ││
│  │ ⚠️ 1 Warning: Facility ISO 14001 expires in 45 days                    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Step 3: SELECT CARRIER                                   [IN PROGRESS] ││
│  │                                                                          ││
│  │ Destination: Zalando GmbH, Berlin, Germany                             ││
│  │                                                                          ││
│  │ Available Rates:                                                        ││
│  │ ┌─────────────────────────────────────────────────────────────────────┐││
│  │ │ ○ DHL Express     │ 2-3 days │ €24.50          │ [Select]          │││
│  │ │ ● DHL Economy     │ 5-7 days │ €15.00          │ [Selected]        │││
│  │ │ ○ UPS Standard    │ 4-5 days │ €18.00          │ [Select]          │││
│  │ └─────────────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Step 4: PAYMENT SUMMARY                                                 ││
│  │                                                                          ││
│  │ ┌─────────────────────────────────────────────────────────────────────┐││
│  │ │ Carrier Rate (DHL Economy)              €15.00                      │││
│  │ │ Logistics Markup (10%)                  €1.50                       │││
│  │ │ Compliance Unlock                       €15.00                      │││
│  │ │ EPCIS Events (500 EPCs × €0.03)         €15.00                      │││
│  │ │ ─────────────────────────────────────────────────                   │││
│  │ │ Subtotal                                €46.50                      │││
│  │ │ VAT (19%)                               €8.84                       │││
│  │ │ ─────────────────────────────────────────────────                   │││
│  │ │ TOTAL                                   €55.34                      │││
│  │ └─────────────────────────────────────────────────────────────────────┘││
│  │                                                                          ││
│  │ Payment Method: Visa •••• 4242                          [Change]        ││
│  │                                                                          ││
│  │ ┌─────────────────────────────────────────────────────────────────────┐││
│  │ │           [GENERATE LABEL & EVIDENCE PACKAGE]                       │││
│  │ │                                                                      │││
│  │ │   This will:                                                        │││
│  │ │   • Charge €55.34 to your payment method                            │││
│  │ │   • Generate a shipping label with SSCC barcode                     │││
│  │ │   • Mint an EPCIS AggregationEvent (permanent record)               │││
│  │ │   • Create a signed Evidence Package for customs                    │││
│  │ └─────────────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 17. EPCIS 2.0 Integration

### 17.1 Overview

EPCIS (Electronic Product Code Information Services) is the GS1 standard for supply chain visibility. EuroComply acts as an **EPCIS Repository**, bridging our internal "Human Truth" (Notary Events) to the "Global Standard" (EPCIS machine-readable data).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EPCIS 2.0 BRIDGE ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  INTERNAL (Human Truth)              EXTERNAL (Global Standard)             │
│  ──────────────────────              ──────────────────────────             │
│                                                                              │
│  ┌─────────────────────┐            ┌─────────────────────┐                 │
│  │  operations_event   │───────────►│   epcis_event       │                 │
│  │  (Notary Ledger)    │  BRIDGE    │   (GS1 Format)      │                 │
│  │                     │            │                     │                 │
│  │  • Who did it       │            │  • What (EPC list)  │                 │
│  │  • When (timestamp) │            │  • When (eventTime) │                 │
│  │  • Where (GPS)      │            │  • Where (GLN)      │                 │
│  │  • Why (attestation)│            │  • Why (bizStep)    │                 │
│  │  • Digital seal     │            │  • JSON-LD payload  │                 │
│  └─────────────────────┘            └─────────────────────┘                 │
│                                              │                               │
│                                              ▼                               │
│                              ┌───────────────────────────┐                  │
│                              │  EPCIS Repository API      │                  │
│                              │  (Standards-Compliant)     │                  │
│                              │                           │                  │
│                              │  • Retailers (Zalando)    │                  │
│                              │  • Customs (EU Single Win)│                  │
│                              │  • ERPs (SAP, Oracle)     │                  │
│                              └───────────────────────────┘                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 17.2 EPCIS Event Data Model

```sql
CREATE TYPE epcis_event_type AS ENUM (
    'ObjectEvent',       -- State change of objects
    'AggregationEvent',  -- Packing/unpacking
    'TransactionEvent',  -- Business transaction linkage
    'TransformationEvent' -- Input→Output transformation
);

CREATE TYPE epcis_action AS ENUM (
    'ADD',      -- Add to parent (aggregation)
    'OBSERVE',  -- Record observation
    'DELETE'    -- Remove from parent
);

CREATE TABLE epcis_event (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization(id),

    -- Bridge to internal notary
    operations_event_id UUID REFERENCES operations_event(id),

    -- GS1 EPCIS 2.0 Core
    event_type          epcis_event_type NOT NULL,
    event_time          TIMESTAMPTZ NOT NULL,
    event_timezone      VARCHAR(10) DEFAULT '+00:00',
    record_time         TIMESTAMPTZ DEFAULT now(),

    -- Action (for Aggregation/Transaction events)
    action              epcis_action,

    -- Business Context (CBV - Core Business Vocabulary)
    biz_step            VARCHAR(255),     -- urn:epcglobal:cbv:bizstep:shipping
    disposition         VARCHAR(255),     -- urn:epcglobal:cbv:disp:in_transit

    -- Location (GS1 GLN - Global Location Number)
    read_point_gln      VARCHAR(20),
    biz_location_gln    VARCHAR(20),

    -- Source/Destination (for TransactionEvent)
    source_list         JSONB DEFAULT '[]',
    destination_list    JSONB DEFAULT '[]',

    -- The "What" - EPC identifiers
    epc_list            JSONB NOT NULL DEFAULT '[]',   -- Array of EPCs (SGTINs)
    parent_id           VARCHAR(255),                   -- SSCC for aggregation
    child_epc_list      JSONB DEFAULT '[]',            -- For aggregation events

    -- Quantity list (for class-level visibility)
    quantity_list       JSONB DEFAULT '[]',

    -- Business Transaction Links
    biz_transaction_list JSONB DEFAULT '[]',

    -- ILMD (Instance/Lot Master Data)
    ilmd                JSONB DEFAULT '{}',

    -- Extensions
    extensions          JSONB DEFAULT '{}',

    -- Full JSON-LD payload (for external consumption)
    json_ld_payload     JSONB NOT NULL,

    -- Signature (mirrors operations_event seal)
    content_hash        VARCHAR(64),
    signer_did          VARCHAR(255),
    signature_jws       TEXT,

    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_epcis_org ON epcis_event (organization_id);
CREATE INDEX idx_epcis_type ON epcis_event (event_type);
CREATE INDEX idx_epcis_time ON epcis_event (event_time);
CREATE INDEX idx_epcis_bizstep ON epcis_event (biz_step);
CREATE INDEX idx_epcis_parent ON epcis_event (parent_id);
CREATE INDEX idx_epcis_ops_event ON epcis_event (operations_event_id);
-- GIN index for EPC list searches
CREATE INDEX idx_epcis_epcs ON epcis_event USING gin (epc_list);
```

### 17.3 EPCIS Event Generator

```typescript
interface EpcisEventInput {
  eventType: 'ObjectEvent' | 'AggregationEvent' | 'TransactionEvent' | 'TransformationEvent';
  action?: 'ADD' | 'OBSERVE' | 'DELETE';
  bizStep: string;
  disposition: string;
  readPoint: string;       // GLN
  bizLocation: string;     // GLN
  epcList?: string[];      // For ObjectEvent
  parentId?: string;       // SSCC for AggregationEvent
  childEpcList?: string[]; // For AggregationEvent
  operationsEventId?: string;
}

async function mintEpcisAggregationEvent(input: {
  parentId: string;       // SSCC
  childEpcs: string[];    // Individual EPCs
  bizStep: string;
  disposition: string;
  readPoint: string;
  bizLocation: string;
  operationsEventId?: string;
}): Promise<EpcisEvent> {
  const org = await getCurrentOrganization();
  const eventTime = new Date();

  // Build EPCIS 2.0 JSON-LD payload
  const jsonLdPayload = {
    '@context': [
      'https://ref.gs1.org/standards/epcis/2.0.0/epcis-context.jsonld',
      { 'eurocomply': 'https://eurocomply.io/ns/' }
    ],
    'type': 'AggregationEvent',
    'eventTime': eventTime.toISOString(),
    'eventTimeZoneOffset': '+00:00',
    'action': 'ADD',
    'parentID': input.parentId,
    'childEPCs': input.childEpcs,
    'bizStep': input.bizStep,
    'disposition': input.disposition,
    'readPoint': { 'id': `urn:epc:id:sgln:${input.readPoint}` },
    'bizLocation': { 'id': `urn:epc:id:sgln:${input.bizLocation}` },
    // EuroComply extension: link to our notary event
    'eurocomply:operationsEventId': input.operationsEventId,
    'eurocomply:organizationId': org.id,
  };

  // Hash and sign
  const contentHash = sha256(JSON.stringify(jsonLdPayload));
  const signature = await signWithOrganizationKey(org.id, contentHash);

  // Store EPCIS event
  const epcisEvent = await db.insert('epcis_event', {
    organization_id: org.id,
    operations_event_id: input.operationsEventId,
    event_type: 'AggregationEvent',
    event_time: eventTime,
    action: 'ADD',
    biz_step: input.bizStep,
    disposition: input.disposition,
    read_point_gln: input.readPoint,
    biz_location_gln: input.bizLocation,
    parent_id: input.parentId,
    child_epc_list: input.childEpcs,
    json_ld_payload: jsonLdPayload,
    content_hash: contentHash,
    signer_did: org.did,
    signature_jws: signature.jws,
  });

  return epcisEvent;
}
```

### 17.4 EPCIS CBV (Core Business Vocabulary) Mapping

```typescript
// Map internal event types to GS1 CBV
const BIZSTEP_MAPPING: Record<string, string> = {
  // Receiving
  'GOODS_RECEIVED': 'urn:epcglobal:cbv:bizstep:receiving',
  'MATERIAL_RECEIVED': 'urn:epcglobal:cbv:bizstep:receiving',

  // Production
  'PRODUCTION_STARTED': 'urn:epcglobal:cbv:bizstep:commissioning',
  'PRODUCTION_COMPLETED': 'urn:epcglobal:cbv:bizstep:commissioning',
  'BATCH_CREATED': 'urn:epcglobal:cbv:bizstep:commissioning',

  // Quality
  'QC_INSPECTION': 'urn:epcglobal:cbv:bizstep:inspecting',
  'QC_RESULT_RECORDED': 'urn:epcglobal:cbv:bizstep:inspecting',

  // Shipping
  'SHIPMENT_DISPATCHED': 'urn:epcglobal:cbv:bizstep:shipping',
  'SHIPMENT_IN_TRANSIT': 'urn:epcglobal:cbv:bizstep:shipping',
  'LABEL_PRINTED': 'urn:epcglobal:cbv:bizstep:packing',

  // Customs
  'CUSTOMS_CLEARED': 'urn:epcglobal:cbv:bizstep:customs_cleared',
};

const DISPOSITION_MAPPING: Record<string, string> = {
  'AVAILABLE': 'urn:epcglobal:cbv:disp:available',
  'IN_TRANSIT': 'urn:epcglobal:cbv:disp:in_transit',
  'SELLABLE': 'urn:epcglobal:cbv:disp:sellable_accessible',
  'QC_PASSED': 'urn:epcglobal:cbv:disp:conformant',
  'QC_FAILED': 'urn:epcglobal:cbv:disp:non_conformant',
  'SHIPPED': 'urn:epcglobal:cbv:disp:in_transit',
  'DELIVERED': 'urn:epcglobal:cbv:disp:retail_sold',
};
```

---

## 18. Evidence Package (Customs Green Lane)

### 18.1 Overview

The Evidence Package is a **cryptographically sealed, self-contained document** that proves a shipment is compliant. It's the payload that justifies the Compliance Unlock fee and enables the "Customs Green Lane" premium service.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EVIDENCE PACKAGE STRUCTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                       EVIDENCE PACKAGE v1.1                           │  │
│  │                                                                        │  │
│  │  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌───────────┐ │  │
│  │  │ CONSIGNMENT │   │   ORIGIN    │   │    FOUR     │   │ INTEGRITY │ │  │
│  │  │   + EPCs    │   │ (EUDR GPS)  │   │   PILLARS   │   │   SEAL    │ │  │
│  │  │ + Merkle    │   │   + GLN     │   │   OF PROOF  │   │   (JWS)   │ │  │
│  │  └─────────────┘   └─────────────┘   └─────────────┘   └───────────┘ │  │
│  │                                              │                        │  │
│  │                                              ▼                        │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │  │
│  │  │                    THE FOUR PILLARS                              │ │  │
│  │  │                                                                  │ │  │
│  │  │  1. DESIGN COMPLIANCE                                           │ │  │
│  │  │     └─ BOM snapshot, regulatory declarations, version           │ │  │
│  │  │                                                                  │ │  │
│  │  │  2. SUPPLY CHAIN INTEGRITY                                      │ │  │
│  │  │     └─ Facility snapshots, certifications, risk at production   │ │  │
│  │  │                                                                  │ │  │
│  │  │  3. PRODUCTION EVIDENCE                                         │ │  │
│  │  │     └─ Notary chain, consumption, mass balance, variance        │ │  │
│  │  │                                                                  │ │  │
│  │  │  4. IDENTITY CHAIN                                              │ │  │
│  │  │     └─ Lot → Batch → Serial → DPP traceability                  │ │  │
│  │  └─────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                        │  │
│  │  SECURITY BINDING:                                                    │  │
│  │  binding_hash = SHA-256(pillars_hash + epc_merkle_root)              │  │
│  │  signature_jws = sign(binding_hash, organization_did)                 │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 18.2 Evidence Package Schema

```typescript
interface EvidencePackage {
  // Identity
  package_id: string;
  package_version: '1.1';
  generated_at: string;

  // What's being shipped (with cryptographic binding)
  consignment: {
    consignment_id: string;
    sscc: string;
    carrier: string;
    tracking_number: string;
    unit_count: number;
    epc_list: string[];
    epc_merkle_root: string;    // SHA-256 Merkle root of sorted EPCs
  };

  // Spatiotemporal Origin (EUDR/ESPR compliant)
  origin: {
    facility_id: string;
    facility_name: string;
    gln: string;                         // GS1 Global Location Number
    coordinates: {
      latitude: number;
      longitude: number;
      accuracy_meters: number;
      capture_method: 'GPS' | 'VERIFIED_ADDRESS' | 'MANUAL';
    };
    captured_at: string;                 // When GPS was recorded
    captured_event_id: string;           // Link to GOODS_RECEIVED event
    country_code: string;
    address: string;
  };

  destination: {
    name: string;
    address: string;
    city: string;
    country_code: string;
    postal_code: string;
  };

  // The Four Pillars of Proof
  pillars: {
    design_compliance: DesignProof;
    supply_chain_integrity: ChainProof;
    production_evidence: ProductionProof;
    identity_chain: IdentityProof;
  };

  // The Seal (with EPC binding)
  integrity: {
    // What we're signing
    pillars_hash: string;           // SHA-256 of pillars JSON
    epc_merkle_root: string;        // Duplicate for verification
    binding_hash: string;           // SHA-256(pillars_hash + epc_merkle_root)

    // The signature
    signer_did: string;
    signature_jws: string;          // Signs the binding_hash
    signature_alg: 'EdDSA';

    // Timestamp authority (optional but recommended)
    timestamp_proof?: {
      tsa_url: string;
      rfc3161_token: string;
    };
  };

  // Standards Export
  epcis_events: EpcisEventSummary[];
}

interface DesignProof {
  // What product
  product_id: string;
  product_name: string;
  product_sku: string;

  // Which design version (frozen at production)
  design_version_id: string;
  design_version_number: string;
  design_released_at: string;
  design_released_by: string;

  // Regulatory requirements declared at design time
  declared_regulations: {
    regulation_code: string;        // 'ESPR', 'EUDR', 'REACH'
    requirement_ids: string[];      // Specific articles/annexes
    compliance_declared_at: string;
    declared_by: string;
  }[];

  // BOM snapshot (what SHOULD go into this product)
  bom_snapshot: {
    entry_id: string;
    material_name: string;
    material_product_id: string;
    quantity_per_unit: number;
    unit: string;
    required_certifications: string[];  // ['GOTS', 'GRS']
    facility_id: string;
    facility_name: string;
  }[];

  // Design document hash (proves BOM wasn't altered)
  bom_content_hash: string;
}

interface ChainProof {
  // All facilities in the supply chain for this shipment
  facilities: {
    facility_id: string;
    facility_name: string;
    facility_type: 'EXTRACTION' | 'PROCESSING' | 'MANUFACTURING' | 'ASSEMBLY';

    // Location (EUDR requirement)
    gln: string;
    coordinates: {
      latitude: number;
      longitude: number;
    };
    country_code: string;

    // Supplier
    supplier_id: string;
    supplier_name: string;

    // Verification status AT TIME OF PRODUCTION
    verification_snapshot: {
      status: 'VERIFIED';
      verified_at: string;
      verified_by: string;
      risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
      risk_score: number;
      country_floor_applied: boolean;
    };

    // Active certifications AT TIME OF PRODUCTION
    certifications_snapshot: {
      cert_type: string;          // 'GOTS 6.0'
      cert_number: string;
      issuing_body: string;
      valid_from: string;
      valid_until: string;
      status: 'VERIFIED' | 'AUTO_VERIFIED';
      days_until_expiry: number;  // Calculated at snapshot time
    }[];
  }[];

  // Country risk assessment
  country_risk_snapshot: {
    country_code: string;
    composite_risk: number;
    min_risk_level: string | null;
    source_year: number;
  }[];
}

interface ProductionProof {
  // The work order that produced this batch
  work_order: {
    order_id: string;
    order_number: string;
    order_type: 'WORK';
    status: 'COMPLETED';
    quantity_ordered: number;
    quantity_produced: number;
    started_at: string;
    completed_at: string;
  };

  // The batch these serials came from
  batch: {
    batch_id: string;
    batch_number: string;
    production_start: string;
    production_end: string;
    quantity_produced: number;
    status: 'RELEASED';
    release_date: string;
  };

  // Actual material consumption (vs BOM)
  consumption: {
    material_name: string;
    lot_id: string;
    lot_number: string;
    source_facility_id: string;
    source_facility_name: string;

    // Quantities
    bom_expected: number;
    actual_consumed: number;
    variance_pct: number;
    variance_status: 'OK' | 'WARNING' | 'EXCEEDED';

    // Lot certifications (inherited)
    lot_certifications: string[];
  }[];

  // Mass balance proof (anti-leakage)
  mass_balance: {
    cert_type: string;
    material: string;
    balance_before: number;
    consumed: number;
    balance_after: number;
    sufficient: boolean;
  }[];

  // The notary chain (digitally sealed events)
  notary_events: {
    event_id: string;
    event_type: string;
    event_number: number;
    occurred_at: string;

    // Who
    performed_by_name: string;
    performed_by_did: string;

    // Where
    location: {
      latitude: number;
      longitude: number;
      facility_name: string;
    } | null;

    // Evidence
    evidence_count: number;
    photo_hashes: string[];

    // Digital seal
    content_hash: string;
    previous_hash: string;
    signature_jws: string;
    signature_valid: boolean;
  }[];

  // Chain integrity
  chain_integrity: {
    total_events: number;
    all_signatures_valid: boolean;
    hash_chain_intact: boolean;
    first_event_hash: string;
    last_event_hash: string;
  };
}

interface IdentityProof {
  // Lot → Batch → Serial chain for each unit
  traceability: {
    serial_number: string;
    serial_epc: string;           // GS1 SGTIN

    // Parent batch
    batch_id: string;
    batch_number: string;

    // Source lots (what went into the batch)
    source_lots: {
      lot_id: string;
      lot_number: string;
      material_name: string;
      facility_id: string;
      facility_name: string;
      facility_gln: string;
      purchase_order_number: string;
    }[];

    // DPP linkage
    dpp_id: string;
    dpp_uri: string;
    dpp_status: 'PENDING' | 'ACTIVE';
  }[];

  // Merkle proof (for selective disclosure)
  merkle_tree: {
    root: string;
    leaf_count: number;
    tree_depth: number;
  };
}
```

### 18.3 Evidence Package Generator

```typescript
async function generateEvidencePackage(
  consignmentId: string
): Promise<EvidencePackage> {
  const consignment = await getConsignment(consignmentId);
  const org = await getOrganization(consignment.organization_id);

  // 1. Build consignment section
  const consignmentSection = {
    consignment_id: consignment.id,
    sscc: consignment.sscc,
    carrier: consignment.carrier_name,
    tracking_number: consignment.tracking_number,
    unit_count: consignment.unit_count,
    epc_list: consignment.epc_list,
    epc_merkle_root: consignment.epc_merkle_root,
  };

  // 2. Build origin section (EUDR/ESPR spatiotemporal)
  const originSection = await buildOriginSection(consignment);

  // 3. Build the four pillars
  const pillars = {
    design_compliance: await buildDesignProof(consignment),
    supply_chain_integrity: await buildChainProof(consignment),
    production_evidence: await buildProductionProof(consignment),
    identity_chain: await buildIdentityProof(consignment),
  };

  // 4. Compute hashes
  const pillarsHash = sha256(JSON.stringify(pillars));
  const bindingHash = sha256(pillarsHash + consignment.epc_merkle_root);

  // 5. Sign with organization key
  const signature = await signWithOrganizationKey(org.id, bindingHash);

  // 6. Optional: Get timestamp proof from TSA
  let timestampProof = undefined;
  if (org.features.includes('TIMESTAMP_AUTHORITY')) {
    timestampProof = await getTimestampProof(bindingHash);
  }

  // 7. Build integrity section
  const integrity = {
    pillars_hash: pillarsHash,
    epc_merkle_root: consignment.epc_merkle_root,
    binding_hash: bindingHash,
    signer_did: org.did,
    signature_jws: signature.jws,
    signature_alg: 'EdDSA' as const,
    timestamp_proof: timestampProof,
  };

  // 8. Get EPCIS events
  const epcisEvents = await getEpcisEventsForConsignment(consignmentId);

  const evidencePackage: EvidencePackage = {
    package_id: generateUUID(),
    package_version: '1.1',
    generated_at: new Date().toISOString(),
    consignment: consignmentSection,
    origin: originSection,
    destination: {
      name: consignment.destination_name,
      address: consignment.destination_address,
      city: consignment.destination_city,
      country_code: consignment.destination_country,
      postal_code: consignment.destination_postal,
    },
    pillars,
    integrity,
    epcis_events: epcisEvents.map(summarizeEpcisEvent),
  };

  // 9. Store the package
  await storeEvidencePackage(evidencePackage);

  return evidencePackage;
}

// Merkle tree utilities for EPC binding
function computeMerkleRoot(epcList: string[]): string {
  const sortedEpcs = [...epcList].sort();
  const leaves = sortedEpcs.map(epc => sha256(epc));
  return buildMerkleTree(leaves).root;
}

function buildMerkleTree(leaves: string[]): { root: string; depth: number } {
  if (leaves.length === 0) {
    return { root: sha256(''), depth: 0 };
  }

  if (leaves.length === 1) {
    return { root: leaves[0], depth: 0 };
  }

  const nextLevel: string[] = [];
  for (let i = 0; i < leaves.length; i += 2) {
    const left = leaves[i];
    const right = leaves[i + 1] || left; // Duplicate last if odd
    nextLevel.push(sha256(left + right));
  }

  const result = buildMerkleTree(nextLevel);
  return { root: result.root, depth: result.depth + 1 };
}
```

### 18.4 Evidence Package Verification

```typescript
async function verifyEvidencePackage(
  pkg: EvidencePackage
): Promise<VerificationResult> {
  const issues: VerificationIssue[] = [];

  // 1. Verify EPC Merkle root
  const computedRoot = computeMerkleRoot(pkg.consignment.epc_list);
  if (computedRoot !== pkg.consignment.epc_merkle_root) {
    issues.push({
      severity: 'CRITICAL',
      code: 'EPC_MERKLE_MISMATCH',
      message: 'EPC list has been tampered with',
    });
  }

  // 2. Verify pillars hash
  const computedPillarsHash = sha256(JSON.stringify(pkg.pillars));
  if (computedPillarsHash !== pkg.integrity.pillars_hash) {
    issues.push({
      severity: 'CRITICAL',
      code: 'PILLARS_HASH_MISMATCH',
      message: 'Evidence pillars have been tampered with',
    });
  }

  // 3. Verify binding hash
  const computedBindingHash = sha256(
    pkg.integrity.pillars_hash + pkg.integrity.epc_merkle_root
  );
  if (computedBindingHash !== pkg.integrity.binding_hash) {
    issues.push({
      severity: 'CRITICAL',
      code: 'BINDING_HASH_MISMATCH',
      message: 'Integrity binding has been tampered with',
    });
  }

  // 4. Verify JWS signature
  const signatureValid = await verifyJWS(
    pkg.integrity.signature_jws,
    pkg.integrity.binding_hash,
    pkg.integrity.signer_did
  );
  if (!signatureValid) {
    issues.push({
      severity: 'CRITICAL',
      code: 'SIGNATURE_INVALID',
      message: 'Digital signature verification failed',
    });
  }

  // 5. Verify notary chain integrity
  const chainIntegrity = pkg.pillars.production_evidence.chain_integrity;
  if (!chainIntegrity.all_signatures_valid) {
    issues.push({
      severity: 'CRITICAL',
      code: 'NOTARY_SIGNATURES_INVALID',
      message: 'One or more notary event signatures are invalid',
    });
  }
  if (!chainIntegrity.hash_chain_intact) {
    issues.push({
      severity: 'CRITICAL',
      code: 'NOTARY_CHAIN_BROKEN',
      message: 'Notary event hash chain is broken',
    });
  }

  // 6. Verify timestamp proof (if present)
  if (pkg.integrity.timestamp_proof) {
    const tsValid = await verifyRFC3161Timestamp(
      pkg.integrity.timestamp_proof.rfc3161_token,
      pkg.integrity.binding_hash
    );
    if (!tsValid) {
      issues.push({
        severity: 'WARNING',
        code: 'TIMESTAMP_INVALID',
        message: 'Timestamp proof verification failed',
      });
    }
  }

  const criticalIssues = issues.filter(i => i.severity === 'CRITICAL');

  return {
    valid: criticalIssues.length === 0,
    issues,
    verified_at: new Date().toISOString(),
    package_id: pkg.package_id,
  };
}
```

### 18.5 Selective Disclosure Resolver

The same DPP Digital Link (QR code URL) must serve different audiences with different views. A consumer should see the "Story" (sustainability narrative); a Customs Officer should see the full "Evidence Package."

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SELECTIVE DISCLOSURE RESOLVER                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SAME QR CODE → DIFFERENT VIEWS BY AUDIENCE                                 │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  URL: https://dpp.eurocomply.eu/01/04012345678901/21/ABC123             ││
│  │                                                                          ││
│  │  Consumer Scan (no auth):                                               ││
│  │  ┌─────────────────────────────────────────────────────────────────┐   ││
│  │  │  🌿 THE STORY                                                    │   ││
│  │  │  ├── Brand name, product name, hero image                        │   ││
│  │  │  ├── Sustainability score, carbon footprint                      │   ││
│  │  │  ├── "Made in Italy from organic cotton"                         │   ││
│  │  │  ├── Care instructions, recyclability                            │   ││
│  │  │  └── Repair/return/resale options                                │   ││
│  │  └─────────────────────────────────────────────────────────────────┘   ││
│  │                                                                          ││
│  │  Customs Officer (authenticated via eIDAS/EORI):                        ││
│  │  ┌─────────────────────────────────────────────────────────────────┐   ││
│  │  │  📋 FULL EVIDENCE PACKAGE                                        │   ││
│  │  │  ├── Consignment details + SSCC                                  │   ││
│  │  │  ├── All Four Pillars (Design, Supply Chain, Production, ID)     │   ││
│  │  │  ├── EPCIS event history                                         │   ││
│  │  │  ├── Facility GPS coordinates (EUDR)                             │   ││
│  │  │  ├── Certificate snapshots + validity                            │   ││
│  │  │  ├── Cryptographic proof verification                            │   ││
│  │  │  └── [Download Official PDF] button                              │   ││
│  │  └─────────────────────────────────────────────────────────────────┘   ││
│  │                                                                          ││
│  │  Supply Chain Partner (authenticated via shared link/API):              ││
│  │  ┌─────────────────────────────────────────────────────────────────┐   ││
│  │  │  🔗 PARTNER VIEW                                                 │   ││
│  │  │  ├── EPCIS events (ObjectEvent, AggregationEvent)                │   ││
│  │  │  ├── Product specifications + BOM (read-only)                    │   ││
│  │  │  ├── Their facility's certification status                       │   ││
│  │  │  └── [Export EPCIS JSON-LD] button                               │   ││
│  │  └─────────────────────────────────────────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Authentication for Customs Access

```typescript
// DPP Resolver request handler
async function resolveDPP(
  digitalLink: GS1DigitalLink,
  authContext: AuthContext | null
): Promise<DPPView> {
  const { gtin, serial } = parseDigitalLink(digitalLink);
  const dpp = await getDPP(gtin, serial);

  // No auth → Consumer Story view
  if (!authContext) {
    return renderConsumerStory(dpp);
  }

  // Check auth type
  switch (authContext.type) {
    case 'CUSTOMS_EIDAS':
      // EU Customs using eIDAS certificate or EORI verification
      await validateEidasCertificate(authContext.certificate);
      return renderFullEvidencePackage(dpp, {
        includeGPS: true,
        includeAllPillars: true,
        includePDFDownload: true,
      });

    case 'SUPPLY_CHAIN_TOKEN':
      // Partner with shared access token
      const partner = await validatePartnerToken(authContext.token);
      return renderPartnerView(dpp, partner.permissions);

    case 'ORGANIZATION_API_KEY':
      // Organization accessing their own DPPs
      return renderFullEvidencePackage(dpp, { includePDFDownload: true });

    default:
      return renderConsumerStory(dpp);
  }
}

interface AuthContext {
  type: 'CUSTOMS_EIDAS' | 'SUPPLY_CHAIN_TOKEN' | 'ORGANIZATION_API_KEY';
  certificate?: X509Certificate;  // For eIDAS
  token?: string;                 // For partner access
  apiKey?: string;                // For organization API
  eoriNumber?: string;            // EU Economic Operator Registration
}
```

#### Digital Link with View Parameter

```
# Consumer view (default)
https://dpp.eurocomply.eu/01/04012345678901/21/ABC123

# Request full evidence (requires auth header)
https://dpp.eurocomply.eu/01/04012345678901/21/ABC123?view=evidence
Authorization: Bearer <customs_token>

# EPCIS export for supply chain systems
https://dpp.eurocomply.eu/01/04012345678901/21/ABC123?view=epcis
Accept: application/ld+json
```

### 18.6 RFC 3161 Timestamp Authority Integration

A database timestamp can be altered by an admin; an RFC 3161 timestamp from a third-party Timestamp Authority (TSA) is **legally undeniable in EU court**. This is essential for Enterprise+ tiers.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TIMESTAMP AUTHORITY ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WHY RFC 3161?                                                              │
│  ─────────────                                                               │
│  • Database timestamps: Mutable (admin can change)                          │
│  • Blockchain timestamps: Slow, expensive, overkill                         │
│  • RFC 3161 TSA: Legally binding, fast, affordable, EU-recognized          │
│                                                                              │
│  LEGAL BASIS:                                                               │
│  • eIDAS Regulation (EU 910/2014) recognizes qualified timestamps           │
│  • An RFC 3161 timestamp from a qualified TSA is legal evidence             │
│  • "The timestamp SHALL be presumed accurate" (eIDAS Article 41)            │
│                                                                              │
│  WHEN TO TIMESTAMP:                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Event Type                    │ Starter/Growth │ Scale │ Enterprise+ ││
│  │────────────────────────────────┼────────────────┼───────┼─────────────││
│  │  Evidence Package generation   │      ❌        │  ❌   │     ✅      ││
│  │  DPP Issuance                  │      ❌        │  ❌   │     ✅      ││
│  │  Critical compliance events    │      ❌        │  ❌   │     ✅      ││
│  │  Customs filing submission     │      ❌        │  ❌   │     ✅      ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### TSA Integration Implementation

```typescript
// RFC 3161 Timestamp Authority service
interface TimestampService {
  // Request timestamp from qualified TSA
  requestTimestamp(hash: Buffer): Promise<TimestampToken>;

  // Verify a timestamp token
  verifyTimestamp(token: TimestampToken, originalHash: Buffer): Promise<boolean>;
}

interface TimestampToken {
  // The RFC 3161 response
  rfc3161_response: Buffer;

  // Parsed metadata
  timestamp: Date;
  tsa_name: string;
  tsa_certificate: string;
  hash_algorithm: 'SHA-256' | 'SHA-384' | 'SHA-512';
  serial_number: string;

  // eIDAS qualification
  qualified: boolean;
  trust_service_provider: string;
}

// Qualified TSA providers (EU Trusted List)
const QUALIFIED_TSA_PROVIDERS = [
  {
    name: 'DigiCert Timestamp Authority',
    url: 'http://timestamp.digicert.com',
    qualified: true,
    region: 'EU',
  },
  {
    name: 'Sectigo Timestamp Authority',
    url: 'http://timestamp.sectigo.com',
    qualified: true,
    region: 'EU',
  },
  {
    name: 'GlobalSign TSA',
    url: 'http://timestamp.globalsign.com/tsa/r6advanced1',
    qualified: true,
    region: 'EU',
  },
];

// Request RFC 3161 timestamp for Evidence Package
async function timestampEvidencePackage(
  pkg: EvidencePackage,
  tier: PricingTier
): Promise<EvidencePackage> {
  // Only Enterprise+ gets qualified timestamps
  if (tier !== 'ENTERPRISE' && tier !== 'PLATFORM') {
    return pkg;
  }

  const hashToTimestamp = Buffer.from(pkg.integrity.binding_hash, 'hex');

  // Build RFC 3161 TimeStampReq
  const tsRequest = createTimeStampRequest(hashToTimestamp, {
    hashAlgorithm: 'SHA-256',
    certReq: true,  // Request TSA certificate in response
    nonce: crypto.randomBytes(8),
  });

  // Send to qualified TSA
  const tsa = QUALIFIED_TSA_PROVIDERS[0];
  const response = await fetch(tsa.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/timestamp-query' },
    body: tsRequest,
  });

  const tsResponse = await response.arrayBuffer();
  const token = parseTimeStampResponse(Buffer.from(tsResponse));

  // Verify the timestamp is valid
  if (!await verifyTimestampToken(token, hashToTimestamp)) {
    throw new Error('TSA returned invalid timestamp');
  }

  // Add to Evidence Package
  return {
    ...pkg,
    integrity: {
      ...pkg.integrity,
      timestamp_proof: {
        tsa_url: tsa.url,
        tsa_name: tsa.name,
        rfc3161_token: token.rfc3161_response.toString('base64'),
        timestamp: token.timestamp.toISOString(),
        qualified: token.qualified,
        trust_service_provider: tsa.name,
      },
    },
  };
}

// Verify timestamp in court-admissible manner
async function verifyTimestampForCourt(
  pkg: EvidencePackage
): Promise<TimestampVerification> {
  if (!pkg.integrity.timestamp_proof) {
    return {
      verified: false,
      court_admissible: false,
      reason: 'No timestamp proof present',
    };
  }

  const token = Buffer.from(pkg.integrity.timestamp_proof.rfc3161_token, 'base64');
  const originalHash = Buffer.from(pkg.integrity.binding_hash, 'hex');

  // 1. Verify cryptographic integrity
  const cryptoValid = await verifyTimestampToken(
    parseTimeStampResponse(token),
    originalHash
  );

  // 2. Verify TSA is on EU Trusted List (for qualified status)
  const tsaOnTrustedList = await checkEUTrustedList(
    pkg.integrity.timestamp_proof.tsa_url
  );

  return {
    verified: cryptoValid,
    court_admissible: cryptoValid && tsaOnTrustedList,
    timestamp: pkg.integrity.timestamp_proof.timestamp,
    tsa_qualified: pkg.integrity.timestamp_proof.qualified,
    trust_service_provider: pkg.integrity.timestamp_proof.trust_service_provider,
    legal_basis: 'eIDAS Regulation (EU) 910/2014, Article 41',
  };
}
```

#### Pricing: TSA Timestamps

| Tier | TSA Timestamps | Cost per Timestamp |
|------|----------------|-------------------|
| Starter | Not available | - |
| Growth | Not available | - |
| Scale | Not available | - |
| Enterprise | Included | ~€0.01 (bundled) |
| Platform | Included | ~€0.005 (volume) |

*TSA costs are bundled into Evidence Package generation fee for Enterprise+ tiers.*

### 18.7 Customs Evidence PDF Template

Importers will pay premium for the **"Download as PDF"** button. The PDF must look official, be verifiable offline, and withstand customs agent scrutiny.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CUSTOMS EVIDENCE PDF SPECIFICATION                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  ╔═══════════════════════════════════════════════════════════════════╗ ││
│  │  ║           COMPLIANCE EVIDENCE CERTIFICATE                         ║ ││
│  │  ║                     EuroComply GmbH                               ║ ││
│  │  ╠═══════════════════════════════════════════════════════════════════╣ ││
│  │  ║                                                                   ║ ││
│  │  ║  Certificate ID: EVD-2026-0001234                                 ║ ││
│  │  ║  Generated: 2026-01-15T14:32:00Z                                  ║ ││
│  │  ║  Valid Until: Perpetual (ESPR 10-year retention)                  ║ ││
│  │  ║                                                                   ║ ││
│  │  ║  ┌─────────────┐    CONSIGNMENT DETAILS                          ║ ││
│  │  ║  │ [QR CODE 1] │    SSCC: 340123456789012345                      ║ ││
│  │  ║  │  VERIFY     │    Carrier: DHL Express                         ║ ││
│  │  ║  │  PACKAGE    │    Tracking: 1234567890                          ║ ││
│  │  ║  └─────────────┘    Units: 500                                   ║ ││
│  │  ║                      EPCs: 500 serialized items                   ║ ││
│  │  ║                                                                   ║ ││
│  │  ║  ─────────────────────────────────────────────────────────────   ║ ││
│  │  ║                                                                   ║ ││
│  │  ║  ORIGIN VERIFICATION (EUDR/ESPR Compliant)                       ║ ││
│  │  ║  Facility: Organic Cotton Mill, Bergamo                          ║ ││
│  │  ║  GLN: 4012345000015                                              ║ ││
│  │  ║  GPS: 45.6983° N, 9.6773° E                                      ║ ││
│  │  ║  Country: IT (Italy)                                             ║ ││
│  │  ║                                                                   ║ ││
│  │  ║  ─────────────────────────────────────────────────────────────   ║ ││
│  │  ║                                                                   ║ ││
│  │  ║  COMPLIANCE SUMMARY                                              ║ ││
│  │  ║  ☑ Design Compliance: ESPR, REACH verified                      ║ ││
│  │  ║  ☑ Supply Chain: All facilities verified, certs valid           ║ ││
│  │  ║  ☑ Production Evidence: 47 notarized events, chain intact       ║ ││
│  │  ║  ☑ Identity Chain: Lot → Batch → Serial → DPP complete          ║ ││
│  │  ║                                                                   ║ ││
│  │  ║  ─────────────────────────────────────────────────────────────   ║ ││
│  │  ║                                                                   ║ ││
│  │  ║  ┌─────────────┐    CRYPTOGRAPHIC VERIFICATION                   ║ ││
│  │  ║  │ [QR CODE 2] │                                                 ║ ││
│  │  ║  │  VERIFY     │    Binding Hash: 7a3f2c1b...                    ║ ││
│  │  ║  │  SIGNATURE  │    Signer DID: did:key:z6Mkh...                 ║ ││
│  │  ║  └─────────────┘    Algorithm: EdDSA (Ed25519)                   ║ ││
│  │  ║                                                                   ║ ││
│  │  ║                      RFC 3161 TIMESTAMP                          ║ ││
│  │  ║                      TSA: DigiCert (Qualified)                   ║ ││
│  │  ║                      Time: 2026-01-15T14:32:01Z                  ║ ││
│  │  ║                      Legal: eIDAS Art. 41 compliant              ║ ││
│  │  ║                                                                   ║ ││
│  │  ║  ─────────────────────────────────────────────────────────────   ║ ││
│  │  ║                                                                   ║ ││
│  │  ║           SCAN QR CODES TO VERIFY THIS CERTIFICATE               ║ ││
│  │  ║                                                                   ║ ││
│  │  ║  QR Code 1: Full Evidence Package (Digital Link)                 ║ ││
│  │  ║  QR Code 2: Signature Verification (cryptographic proof)         ║ ││
│  │  ║                                                                   ║ ││
│  │  ╠═══════════════════════════════════════════════════════════════════╣ ││
│  │  ║  Page 1 of 5                           EuroComply Evidence v1.0  ║ ││
│  │  ╚═══════════════════════════════════════════════════════════════════╝ ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  SUBSEQUENT PAGES:                                                          │
│  • Page 2: Detailed Design Compliance (BOM snapshot, regulations)           │
│  • Page 3: Supply Chain Facilities (with GPS, certs, risk scores)           │
│  • Page 4: Production Evidence (notary chain summary)                       │
│  • Page 5: Full EPC List + Merkle Tree visualization                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### PDF Template Requirements

```typescript
interface EvidencePDFConfig {
  // Official branding
  header: {
    logo: 'eurocomply_seal.png';     // Official seal
    title: 'COMPLIANCE EVIDENCE CERTIFICATE';
    document_id: string;              // EVD-YYYY-XXXXXXX
  };

  // QR Codes for verification
  qr_codes: {
    // QR 1: Digital Link to full Evidence Package
    package_verification: {
      url: string;                    // https://dpp.eurocomply.eu/evidence/EVD-2026-...
      label: 'VERIFY PACKAGE';
      purpose: 'Customs agent scans to see full digital evidence';
    };
    // QR 2: Cryptographic signature verification
    signature_verification: {
      url: string;                    // https://verify.eurocomply.eu/sig/...
      label: 'VERIFY SIGNATURE';
      purpose: 'Proves PDF hasn\'t been tampered with';
      embedded_data: {
        binding_hash: string;
        signature_jws: string;
        signer_did: string;
      };
    };
  };

  // Visual compliance indicators
  compliance_badges: {
    espr: boolean;
    eudr: boolean;
    reach: boolean;
    custom: string[];
  };

  // Timestamp authority seal (Enterprise+ only)
  tsa_seal?: {
    provider: string;
    timestamp: string;
    qualified: boolean;
    legal_reference: 'eIDAS Regulation (EU) 910/2014, Article 41';
  };

  // Multi-language support
  language: 'en' | 'de' | 'fr' | 'it' | 'es';
}

// Generate official PDF
async function generateEvidencePDF(
  pkg: EvidencePackage,
  config: EvidencePDFConfig
): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  // Page 1: Summary + QR Codes
  await renderCoverPage(doc, pkg, config);

  // Page 2: Design Compliance details
  doc.addPage();
  await renderDesignCompliancePage(doc, pkg.pillars.design_compliance);

  // Page 3: Supply Chain Facilities
  doc.addPage();
  await renderSupplyChainPage(doc, pkg.pillars.supply_chain_integrity);

  // Page 4: Production Evidence
  doc.addPage();
  await renderProductionEvidencePage(doc, pkg.pillars.production_evidence);

  // Page 5: EPC List + Merkle Proof
  doc.addPage();
  await renderEPCListPage(doc, pkg.consignment.epc_list, pkg.consignment.epc_merkle_root);

  doc.end();
  return doc.buffer;
}

// QR Code 2: Embedded signature for offline verification
function generateSignatureQR(pkg: EvidencePackage): string {
  // Compact payload for QR code (fits in ~500 bytes)
  const payload = {
    v: 1,                                    // Version
    h: pkg.integrity.binding_hash.slice(0, 16), // Truncated hash (verifiable)
    s: pkg.integrity.signature_jws.split('.')[2].slice(0, 64), // Signature excerpt
    d: pkg.integrity.signer_did.slice(-20),  // DID suffix
    t: pkg.integrity.timestamp_proof?.timestamp || null,
    u: `https://verify.eurocomply.eu/pkg/${pkg.package_id}`,
  };

  return `eurocomply://verify?data=${base64url(JSON.stringify(payload))}`;
}
```

#### Customs Agent Verification Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CUSTOMS VERIFICATION FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. AGENT RECEIVES PDF (email, printed, or forwarding system)               │
│                                                                              │
│  2. SCAN QR CODE 1 (Package Verification)                                   │
│     └─► Opens EuroComply Evidence Page (authenticated view)                 │
│     └─► Full digital evidence, EPCIS events, facility details               │
│     └─► Real-time verification: "This package is VALID"                     │
│                                                                              │
│  3. SCAN QR CODE 2 (Signature Verification)                                 │
│     └─► Opens signature verifier                                            │
│     └─► Cryptographically proves PDF hasn't been altered                    │
│     └─► Shows: "Signature valid, signed by [Organization] on [Date]"        │
│                                                                              │
│  4. CHECK TIMESTAMP (Enterprise+ PDF)                                       │
│     └─► TSA seal visible: "DigiCert Qualified Timestamp"                    │
│     └─► Legal reference: eIDAS Article 41                                   │
│     └─► Court-admissible proof of when evidence was sealed                  │
│                                                                              │
│  5. DECISION                                                                │
│     └─► GREEN LANE: All verifications pass → expedited clearance            │
│     └─► HOLD: Any verification fails → manual inspection                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 19. Shipping Billing Integration

### 19.1 Overview

Shipping revenue integrates with the existing Base + Per-DPP billing model as additional metered line items on the same invoice.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SHIPPING BILLING ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  EXISTING MODEL                        NEW SHIPPING ITEMS                   │
│  ──────────────                        ────────────────────                 │
│  • Base Subscription                   • Label Markup (% of carrier)        │
│  • Per-DPP Usage                       • Compliance Unlock (per shipment)   │
│                                        • EPCIS Events (per EPC)             │
│                                        • Customs Green Lane (per filing)    │
│                                                                              │
│  ONE INVOICE:                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Base fee (Scale):              €749.00                               │   │
│  │ DPP usage (750K):              €12,500.00                            │   │
│  │ Shipping & Logistics:          €5,775.00                             │   │
│  │ Premium Services:              €105.00                               │   │
│  │ ─────────────────────────────────────────────                        │   │
│  │ Subtotal:                      €19,129.00                            │   │
│  │ VAT (19%):                     €3,634.51                             │   │
│  │ TOTAL:                         €22,763.51                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 19.2 Shipping Pricing by Tier

```typescript
const SHIPPING_PRICING = {
  // Compliance Unlock - per shipment
  COMPLIANCE_UNLOCK: {
    STARTER: 25.00,      // €25 per shipment
    GROWTH: 20.00,       // €20 per shipment
    SCALE: 15.00,        // €15 per shipment
    ENTERPRISE: 10.00,   // €10 per shipment
    PLATFORM: 5.00,      // €5 per shipment (negotiable)
  },

  // EPCIS Event Hosting - per EPC in aggregation
  EPCIS_EVENT: {
    STARTER: 0.05,       // €0.05 per EPC
    GROWTH: 0.04,        // €0.04 per EPC
    SCALE: 0.03,         // €0.03 per EPC
    ENTERPRISE: 0.02,    // €0.02 per EPC
    PLATFORM: 0.01,      // €0.01 per EPC (negotiable)
  },

  // Customs Green Lane - per filing
  CUSTOMS_FILING: {
    STARTER: 50.00,      // €50 per filing
    GROWTH: 40.00,       // €40 per filing
    SCALE: 35.00,        // €35 per filing
    ENTERPRISE: 25.00,   // €25 per filing
    PLATFORM: 15.00,     // €15 per filing (negotiable)
  },

  // Label Markup - percentage on carrier rate (not tiered)
  LABEL_MARKUP_PERCENT: 0.10,  // 10% markup on all tiers
};
```

### 19.3 Usage Tracking Schema

```sql
-- Shipping usage tracking (extends existing billing model)
CREATE TABLE shipping_usage (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization(id),

    -- Billing period
    period_start        DATE NOT NULL,
    period_end          DATE NOT NULL,

    -- Compliance Unlock (per shipment)
    shipments_count     INT DEFAULT 0,
    compliance_fee_rate DECIMAL(10,2),
    compliance_total    DECIMAL(10,2) GENERATED ALWAYS AS (
        shipments_count * compliance_fee_rate
    ) STORED,

    -- Label Markup (carrier pass-through + margin)
    carrier_costs       DECIMAL(10,2) DEFAULT 0,
    label_markup_rate   DECIMAL(5,4) DEFAULT 0.10,
    label_markup_total  DECIMAL(10,2) GENERATED ALWAYS AS (
        carrier_costs * label_markup_rate
    ) STORED,

    -- EPCIS Events (per EPC aggregated)
    epcis_epc_count     INT DEFAULT 0,
    epcis_fee_rate      DECIMAL(10,4),
    epcis_total         DECIMAL(10,2) GENERATED ALWAYS AS (
        epcis_epc_count * epcis_fee_rate
    ) STORED,

    -- Customs Filings
    customs_filings     INT DEFAULT 0,
    customs_fee_rate    DECIMAL(10,2),
    customs_total       DECIMAL(10,2) GENERATED ALWAYS AS (
        customs_filings * customs_fee_rate
    ) STORED,

    -- Grand total for shipping
    shipping_total      DECIMAL(10,2) GENERATED ALWAYS AS (
        COALESCE(compliance_total, 0) +
        COALESCE(label_markup_total, 0) +
        COALESCE(epcis_total, 0) +
        COALESCE(customs_total, 0)
    ) STORED,

    -- Stripe reporting
    reported_to_stripe  BOOLEAN DEFAULT false,
    reported_at         TIMESTAMPTZ,

    created_at          TIMESTAMPTZ DEFAULT now(),

    UNIQUE(organization_id, period_start)
);

-- Individual shipping transaction log (for audit)
CREATE TABLE shipping_transaction (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization(id),
    consignment_id      UUID NOT NULL REFERENCES shipping_consignment(id),

    -- Transaction details
    transaction_type    VARCHAR(50) NOT NULL,  -- 'COMPLIANCE_UNLOCK', 'LABEL', 'EPCIS', 'CUSTOMS'

    -- Amounts
    carrier_cost        DECIMAL(10,2),         -- For labels
    markup_amount       DECIMAL(10,2),         -- Our margin
    fee_amount          DECIMAL(10,2),         -- Fixed fees
    epc_count           INT,                   -- For EPCIS events

    -- Totals
    total_charged       DECIMAL(10,2) NOT NULL,

    -- Timestamps
    transaction_at      TIMESTAMPTZ DEFAULT now(),

    -- Link to billing period
    billing_period      DATE NOT NULL
);

CREATE INDEX idx_shipping_usage_org ON shipping_usage (organization_id);
CREATE INDEX idx_shipping_tx_org ON shipping_transaction (organization_id);
CREATE INDEX idx_shipping_tx_period ON shipping_transaction (billing_period);
CREATE INDEX idx_shipping_tx_consignment ON shipping_transaction (consignment_id);
```

### 19.4 Stripe Metered Billing Integration

```typescript
// Report shipping usage to Stripe (called at month-end alongside DPP reporting)
async function reportShippingUsageToStripe(orgId: string): Promise<void> {
  const org = await getOrganization(orgId);
  const periodStart = getCurrentBillingPeriodStart();

  const usage = await db.query(`
    SELECT * FROM shipping_usage
    WHERE organization_id = $1 AND period_start = $2
  `, [orgId, periodStart]);

  if (!usage || usage.reported_to_stripe) return;

  const subscription = await stripe.subscriptions.retrieve(org.subscriptionId);

  // Report each metered component
  const components = [
    {
      priceId: getShippingPriceId('COMPLIANCE_UNLOCK', org.plan),
      quantity: usage.shipments_count,
    },
    {
      priceId: getShippingPriceId('LABEL_MARKUP', org.plan),
      quantity: Math.round(usage.label_markup_total * 100), // cents
    },
    {
      priceId: getShippingPriceId('EPCIS_EVENT', org.plan),
      quantity: usage.epcis_epc_count,
    },
    {
      priceId: getShippingPriceId('CUSTOMS_FILING', org.plan),
      quantity: usage.customs_filings,
    },
  ];

  for (const component of components) {
    if (component.quantity === 0) continue;

    const item = subscription.items.data.find(
      i => i.price.id === component.priceId
    );

    if (item) {
      await stripe.subscriptionItems.createUsageRecord(item.id, {
        quantity: component.quantity,
        timestamp: Math.floor(Date.now() / 1000),
        action: 'set',
      });
    }
  }

  // Mark as reported
  await db.update('shipping_usage',
    { reported_to_stripe: true, reported_at: new Date() },
    { where: { id: usage.id } }
  );
}

// Record shipping transaction when label is generated
async function recordShippingTransaction(input: {
  organizationId: string;
  consignmentId: string;
  carrierCost: number;
  epcCount: number;
}): Promise<void> {
  const org = await getOrganization(input.organizationId);
  const pricing = SHIPPING_PRICING;
  const tier = org.plan;
  const billingPeriod = getCurrentBillingPeriodStart();

  // Calculate charges
  const labelMarkup = input.carrierCost * pricing.LABEL_MARKUP_PERCENT;
  const complianceFee = pricing.COMPLIANCE_UNLOCK[tier];
  const epcisFee = input.epcCount * pricing.EPCIS_EVENT[tier];

  await db.transaction(async (tx) => {
    // 1. Record individual transactions
    await tx.insert('shipping_transaction', {
      organization_id: input.organizationId,
      consignment_id: input.consignmentId,
      transaction_type: 'COMPLIANCE_UNLOCK',
      fee_amount: complianceFee,
      total_charged: complianceFee,
      billing_period: billingPeriod,
    });

    await tx.insert('shipping_transaction', {
      organization_id: input.organizationId,
      consignment_id: input.consignmentId,
      transaction_type: 'LABEL',
      carrier_cost: input.carrierCost,
      markup_amount: labelMarkup,
      total_charged: labelMarkup,
      billing_period: billingPeriod,
    });

    await tx.insert('shipping_transaction', {
      organization_id: input.organizationId,
      consignment_id: input.consignmentId,
      transaction_type: 'EPCIS',
      epc_count: input.epcCount,
      total_charged: epcisFee,
      billing_period: billingPeriod,
    });

    // 2. Update or create period usage
    await tx.upsert('shipping_usage', {
      organization_id: input.organizationId,
      period_start: billingPeriod,
      period_end: getEndOfBillingPeriod(billingPeriod),
      compliance_fee_rate: complianceFee,
      epcis_fee_rate: pricing.EPCIS_EVENT[tier],
      customs_fee_rate: pricing.CUSTOMS_FILING[tier],
    }, {
      shipments_count: { increment: 1 },
      carrier_costs: { increment: input.carrierCost },
      epcis_epc_count: { increment: input.epcCount },
    });
  });
}
```

### 19.5 Storage Cost Analysis

> **Cost Analysis:** See [BILLING.md](../../BILLING.md#shipping-storage-costs-10-year-tco) for detailed 10-year TCO calculations and [BUSINESS_MODEL.md](../../BUSINESS_MODEL.md#dpp-vs-evidence-package-economics) for margin analysis.

**Summary:** Evidence Packages are unique per consignment (~1.3MB each, no deduplication possible). 10-year TCO is €0.02-0.05 depending on features. All shipping fees maintain 99%+ gross margins even at Platform floor pricing.

---

## 20. Shipping API Endpoints

### Consignments

```
GET    /api/v1/operations/shipping/consignments              # List consignments
GET    /api/v1/operations/shipping/consignments/:id          # Get consignment detail
POST   /api/v1/operations/shipping/consignments              # Create consignment (stage serials)
PUT    /api/v1/operations/shipping/consignments/:id          # Update consignment
DELETE /api/v1/operations/shipping/consignments/:id          # Cancel consignment
```

### Compliance Gate

```
POST   /api/v1/operations/shipping/consignments/:id/verify   # Run compliance gate
GET    /api/v1/operations/shipping/consignments/:id/issues   # Get compliance issues
```

### Carrier & Rates

```
POST   /api/v1/operations/shipping/rates                     # Get carrier rates
GET    /api/v1/operations/shipping/carriers                  # List available carriers
```

### Label Generation

```
POST   /api/v1/operations/shipping/consignments/:id/label    # Generate label (charges, mints EPCIS)
GET    /api/v1/operations/shipping/consignments/:id/label    # Get label URL
POST   /api/v1/operations/shipping/consignments/:id/void     # Void label
```

### Evidence Package

```
GET    /api/v1/operations/shipping/consignments/:id/evidence # Get evidence package
POST   /api/v1/operations/shipping/evidence/:id/verify       # Verify evidence package
GET    /api/v1/operations/shipping/evidence/:id/download     # Download as PDF/JSON
```

### EPCIS

```
GET    /api/v1/operations/epcis/events                       # List EPCIS events
GET    /api/v1/operations/epcis/events/:id                   # Get EPCIS event (JSON-LD)
GET    /api/v1/operations/epcis/events/by-epc/:epc           # Query by EPC
GET    /api/v1/operations/epcis/events/by-sscc/:sscc         # Query by SSCC
```

### Tracking

```
GET    /api/v1/operations/shipping/consignments/:id/tracking # Get tracking status
POST   /api/v1/operations/shipping/webhooks/carrier          # Carrier webhook (delivery updates)
```

### Customs Green Lane

```
POST   /api/v1/operations/shipping/consignments/:id/customs  # Submit customs filing
GET    /api/v1/operations/shipping/customs/:id               # Get filing status
```

---

## 21. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.7 | 2026-01-16 | Added DPP Lifecycle Integration (Section 12.4-12.6): Operations→Compliance bridge, trigger service, status mapping |
| 0.6 | 2026-01-15 | Moved storage cost analysis to BILLING.md and BUSINESS_MODEL.md (kept reference) |
| 0.5 | 2026-01-15 | Added Shipping Storage Cost Analysis (10-year TCO, gross margin analysis by tier) |
| 0.4 | 2026-01-15 | Added Selective Disclosure Resolver, RFC 3161 TSA Integration, Customs PDF Template |
| 0.3 | 2026-01-15 | Added Shipping & Logistics: Consignments, EPCIS, Evidence Package, Billing |
| 0.2 | 2026-01-15 | Added Execution Engine: Orders, Events, Lots, Batches, Serials, Consumption |
| 0.1 | 2026-01-15 | Initial draft: Suppliers, Facilities, Certifications |

---

## 22. Related Documents

- [Design Workspace Design](./2026-01-15-design-workspace-design.md) - BOM facility links
- [Taxonomy Engine Design](./2026-01-15-taxonomy-engine-design.md) - Shared data model
- [User Management Design](./2026-01-15-user-management-design.md) - Authority model
- [Architecture Design](./2026-01-15-architecture-design.md) - System architecture
- [Billing Design](../BILLING.md) - Payment processing
- [Business Model](../BUSINESS_MODEL.md) - Pricing strategy
