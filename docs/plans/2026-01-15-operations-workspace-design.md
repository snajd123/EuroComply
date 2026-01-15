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

## 9. API Endpoints

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

---

## 10. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-01-15 | Initial draft from brainstorming session |

---

## 11. Related Documents

- [Design Workspace Design](./2026-01-15-design-workspace-design.md) - BOM facility links
- [Taxonomy Engine Design](./2026-01-15-taxonomy-engine-design.md) - Shared data model
- [User Management Design](./2026-01-15-user-management-design.md) - Authority model
- [Architecture Design](./2026-01-15-architecture-design.md) - System architecture
