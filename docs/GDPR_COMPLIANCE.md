# GDPR Compliance

> EuroComply's approach to GDPR compliance and data protection.

---

## 1. Overview

EuroComply processes personal data in compliance with the General Data Protection Regulation (GDPR - Regulation 2016/679). This document outlines our data protection practices, legal bases, and how we support data subject rights.

```
┌─────────────────────────────────────────────────────────────────┐
│                    GDPR COMPLIANCE SUMMARY                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DATA WE PROCESS                                                │
│  • User accounts (email, name, role)                           │
│  • Organization data (company name, VAT, address)              │
│  • Product data (may include employee names in some fields)    │
│  • Usage logs (IP addresses, timestamps)                       │
│                                                                  │
│  LEGAL BASES                                                    │
│  • Contract: User accounts, product management                 │
│  • Legitimate interest: Security logging, fraud prevention     │
│  • Consent: Marketing communications (optional)                │
│                                                                  │
│  DATA LOCATION                                                  │
│  • All data stored in EU (AWS eu-central-1, Hetzner Germany)  │
│  • No transfers outside EU without safeguards                  │
│                                                                  │
│  RETENTION                                                      │
│  • Account data: Until deletion requested + 30 days            │
│  • DPP data: 10 years (ESPR legal requirement)                │
│  • Logs: 30 days (application), 2 years (security)            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Processing Roles

### 2.1 When EuroComply is the Controller

EuroComply is the **data controller** for:

| Data Category | Examples | Purpose |
|---------------|----------|---------|
| User accounts | Email, name, role | Platform access |
| Billing data | Company name, VAT, payment method | Subscription management |
| Usage analytics | Feature usage, session duration | Product improvement |
| Support requests | Tickets, chat history | Customer support |

### 2.2 When EuroComply is the Processor

EuroComply is the **data processor** when customers store personal data in product records:

| Data Category | Examples | Customer Purpose |
|---------------|----------|------------------|
| Product data | Designer names, supplier contacts | DPP creation |
| Attestation data | Certifier names, auditor details | Third-party verification |
| Chain of custody | Editor signatures, approval history | Audit trail |

**Important**: Customers are controllers of their product data. We process it according to their instructions and our Data Processing Agreement (DPA).

### 2.3 Sub-processors

We use the following sub-processors:

| Sub-processor | Purpose | Location | DPA |
|---------------|---------|----------|-----|
| AWS (Amazon Web Services) | Infrastructure, database | EU (Frankfurt) | ✅ |
| Cloudflare | CDN, WAF, DDoS protection | Global (EU origin) | ✅ |
| Stripe | Payment processing | EU | ✅ |
| Resend | Transactional email | EU | ✅ |
| OpenAI | AI-powered data import | US (with DPA) | ✅ |
| Hetzner | DPP hosting (read path) | Germany | ✅ |

Customers are notified of sub-processor changes via email 30 days in advance.

---

## 3. Legal Basis for Processing

### 3.1 Legal Bases by Activity

| Activity | Legal Basis | GDPR Article |
|----------|-------------|--------------|
| User account creation | Contract | Art. 6(1)(b) |
| Product/DPP management | Contract | Art. 6(1)(b) |
| Payment processing | Contract | Art. 6(1)(b) |
| Security logging | Legitimate interest | Art. 6(1)(f) |
| Fraud prevention | Legitimate interest | Art. 6(1)(f) |
| Marketing emails | Consent | Art. 6(1)(a) |
| Analytics (aggregated) | Legitimate interest | Art. 6(1)(f) |
| DPP retention (10 years) | Legal obligation | Art. 6(1)(c) |

### 3.2 Legitimate Interest Assessments

For processing based on legitimate interest, we conduct balancing tests:

```
┌─────────────────────────────────────────────────────────────────┐
│                    SECURITY LOGGING LIA                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  OUR INTEREST                                                   │
│  • Detect and prevent unauthorized access                      │
│  • Investigate security incidents                               │
│  • Maintain service integrity                                   │
│                                                                  │
│  DATA PROCESSED                                                 │
│  • IP addresses                                                 │
│  • User agent strings                                          │
│  • Timestamps                                                   │
│  • Actions performed                                           │
│                                                                  │
│  IMPACT ON INDIVIDUALS                                          │
│  • Minimal: No sensitive data logged                           │
│  • Expected: Users reasonably expect security measures         │
│  • Limited retention: 2 years maximum                          │
│                                                                  │
│  SAFEGUARDS                                                     │
│  • Access restricted to security team                          │
│  • Encrypted at rest and in transit                            │
│  • Pseudonymization where possible                             │
│                                                                  │
│  CONCLUSION                                                     │
│  Our legitimate interest in security outweighs the minimal     │
│  impact on individuals. Processing is proportionate.           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Data Subject Rights

### 4.1 Rights Overview

| Right | GDPR Article | How We Support |
|-------|--------------|----------------|
| Access | Art. 15 | Self-service export + support request |
| Rectification | Art. 16 | Self-service editing in platform |
| Erasure | Art. 17 | Account deletion (with exceptions) |
| Restriction | Art. 18 | Support request |
| Portability | Art. 20 | Full data export (JSON, CSV) |
| Objection | Art. 21 | Unsubscribe links, support request |

### 4.2 Exercising Rights

**Self-Service (recommended):**
```
Settings → Privacy → Download My Data
Settings → Privacy → Delete Account
Settings → Notifications → Email Preferences
```

**Support Request:**
```
Email: privacy@eurocomply.eu
Subject: GDPR Request - [Right Type]

Include:
• Email address associated with account
• Specific request
• Any relevant details

Response time: Within 30 days
```

### 4.3 Right to Erasure (Special Considerations)

Deletion requests are honored **except** when data must be retained for:

| Retention Reason | Duration | Legal Basis |
|-----------------|----------|-------------|
| ESPR DPP requirement | 10 years | Legal obligation |
| Tax/accounting records | 7 years | Legal obligation |
| Active legal dispute | Duration of dispute | Legitimate interest |
| Fraud investigation | Until resolved | Legitimate interest |

**Pseudonymization Alternative:**

When full deletion isn't possible, we offer pseudonymization:

```typescript
// Example: User requests deletion but has issued DPPs

// Original data
{
  name: "John Smith",
  email: "john@example.com",
  organizationId: "org_123",
  issuedPassports: [...]  // 10-year retention required
}

// After pseudonymization
{
  name: "Deleted User",
  email: "deleted_a1b2c3@eurocomply.local",
  organizationId: "org_123",
  issuedPassports: [...]  // Preserved for ESPR compliance
  deletedAt: "2026-01-11T12:00:00Z",
  deletionMethod: "pseudonymization"
}
```

**Version Control Considerations:**

User actions are signed in the version history. On deletion:
- User DID remains (cryptographic identifier, not PII)
- Display name shows "Deleted User"
- Signature remains valid (non-repudiation preserved)

---

## 5. Data Retention

### 5.1 Retention Schedule

| Data Type | Retention Period | Justification |
|-----------|------------------|---------------|
| User account | Until deletion + 30 days | Contract + grace period |
| Organization data | Until deletion + 30 days | Contract + grace period |
| Product data | Until deletion + 30 days | Contract |
| **Issued DPPs** | **10 years** | **ESPR legal requirement** |
| **Attestation VCs** | **10 years** | **ESPR legal requirement** |
| Application logs | 30 days | Operations |
| Security logs | 2 years | Security investigations |
| Audit trail | 7 years | Legal/accounting |
| Backups | 90 days | Disaster recovery |
| Marketing preferences | Until consent withdrawn | Consent |

### 5.2 ESPR 10-Year Requirement

The EU Ecodesign for Sustainable Products Regulation (ESPR) mandates DPP data retention:

```
┌─────────────────────────────────────────────────────────────────┐
│                    ESPR RETENTION REQUIREMENT                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ESPR Article 12(2):                                            │
│  "The digital product passport shall be available for a period │
│   of at least 10 years after the last unit of the product      │
│   model has been placed on the market..."                       │
│                                                                  │
│  WHAT THIS MEANS FOR GDPR                                       │
│  ─────────────────────────                                      │
│  • DPP data retention is a LEGAL OBLIGATION                    │
│  • Takes precedence over erasure requests                       │
│  • We MUST retain even if customer cancels                     │
│                                                                  │
│  HOW WE HANDLE IT                                               │
│  ─────────────────                                              │
│  1. Subscription cancelled → Data enters "dormant" state       │
│  2. Dormant data: DPP accessible, no new edits                 │
│  3. After 10 years from last product placed on market → Delete │
│  4. Customer notified at each stage                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Deletion Procedures

```typescript
// Automated deletion jobs
const DELETION_JOBS = [
  {
    name: 'expire-magic-links',
    schedule: '*/15 * * * *',  // Every 15 minutes
    query: "DELETE FROM magic_links WHERE expires_at < NOW()",
  },
  {
    name: 'purge-application-logs',
    schedule: '0 2 * * *',      // Daily at 2 AM
    query: "DELETE FROM logs WHERE created_at < NOW() - INTERVAL '30 days'",
  },
  {
    name: 'archive-security-logs',
    schedule: '0 3 * * 0',      // Weekly
    action: 'Move logs older than 2 years to archive, delete from active',
  },
  {
    name: 'check-dpp-expiry',
    schedule: '0 4 1 * *',      // Monthly
    action: 'Flag DPPs where 10-year retention has elapsed for review',
  },
];
```

---

## 6. International Transfers

### 6.1 Transfer Mechanisms

| Destination | Mechanism | Safeguards |
|-------------|-----------|------------|
| **EU/EEA** | Adequacy (home) | Full GDPR applies |
| **UK** | Adequacy decision | EU-UK adequacy (2021) |
| **US (OpenAI)** | SCCs + DPA | Standard Contractual Clauses |

### 6.2 Transfer Impact Assessment (OpenAI)

```
┌─────────────────────────────────────────────────────────────────┐
│                    TIA: OPENAI DATA PROCESSING                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PURPOSE                                                        │
│  AI-powered import of product data from unstructured files     │
│                                                                  │
│  DATA TRANSFERRED                                               │
│  • Product descriptions                                         │
│  • Material compositions                                        │
│  • Supplier names (may include contact persons)                │
│                                                                  │
│  SAFEGUARDS                                                     │
│  • SCCs (Standard Contractual Clauses) in place               │
│  • DPA with OpenAI (data not used for training)               │
│  • API usage only (no stored data in OpenAI)                  │
│  • Data deleted from OpenAI within 30 days                    │
│  • Enterprise API tier (enhanced privacy controls)             │
│                                                                  │
│  RISK ASSESSMENT                                               │
│  • US surveillance laws (FISA 702): Potential risk            │
│  • Mitigation: SCCs, supplementary measures, encryption       │
│  • Residual risk: LOW (product data, minimal PII)             │
│                                                                  │
│  CONCLUSION                                                     │
│  Transfer permitted with safeguards. Regular review scheduled. │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.3 Customer Control

Customers can disable AI import if they prefer EU-only processing:

```
Settings → Privacy → AI Features → Disable AI Import
```

With AI disabled, all data processing remains within EU infrastructure.

---

## 7. Data Processing Agreement (DPA)

### 7.1 DPA Availability

All customers receive our DPA automatically:
- Included in Terms of Service (Annex)
- Standalone DPA available on request
- Enterprise customers: Custom DPA negotiation available

### 7.2 Key DPA Terms

| Clause | Summary |
|--------|---------|
| **Processing Scope** | Only as instructed by customer, for DPP purposes |
| **Sub-processors** | Listed, 30-day notice for changes |
| **Security** | Technical and organizational measures (see SECURITY.md) |
| **Audit Rights** | Annual audit report provided; on-site audit for Enterprise |
| **Breach Notification** | Within 48 hours of becoming aware |
| **Data Return/Deletion** | Export available anytime; deletion on request (ESPR excepted) |
| **Assistance** | Support for data subject requests |

### 7.3 Requesting the DPA

```
Email: legal@eurocomply.eu
Subject: DPA Request

We will provide:
• Standard DPA (PDF, signed by EuroComply)
• List of current sub-processors
• Technical and Organizational Measures (TOMs) document
```

---

## 8. Breach Notification

### 8.1 Internal Procedure

```
┌─────────────────────────────────────────────────────────────────┐
│                    BREACH RESPONSE TIMELINE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  T+0: Breach detected                                           │
│  └── Security team notified immediately                        │
│  └── Incident channel created                                  │
│                                                                  │
│  T+1h: Initial assessment                                       │
│  └── Scope determined (what data, how many affected)           │
│  └── Containment actions taken                                 │
│                                                                  │
│  T+24h: Risk assessment complete                                │
│  └── Likelihood of risk to individuals evaluated               │
│  └── Decision: notify DPA / notify individuals / document only │
│                                                                  │
│  T+48h: Customer notification (if processor breach)            │
│  └── Affected customers notified per DPA                       │
│                                                                  │
│  T+72h: DPA notification (if controller breach)                │
│  └── Relevant Data Protection Authority notified               │
│  └── Art. 33 notification form submitted                       │
│                                                                  │
│  T+72h+: Individual notification (if high risk)                │
│  └── Affected individuals notified without undue delay         │
│  └── Clear language, specific recommendations                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Breach Register

All breaches (including near-misses) are logged:

```typescript
interface BreachRecord {
  id: string;
  detectedAt: Date;
  reportedAt: Date;
  category: 'confidentiality' | 'integrity' | 'availability';

  // Scope
  dataCategories: string[];
  recordsAffected: number;
  individualsAffected: number;

  // Assessment
  riskLevel: 'none' | 'low' | 'high';
  riskAssessment: string;

  // Notifications
  dpaNotified: boolean;
  dpaNotificationDate?: Date;
  dpaReference?: string;

  customersNotified: boolean;
  customerNotificationDate?: Date;

  individualsNotified: boolean;
  individualNotificationDate?: Date;

  // Resolution
  rootCause: string;
  remediation: string;
  preventionMeasures: string;
  closedAt: Date;
}
```

---

## 9. Privacy by Design

### 9.1 Principles Applied

| Principle | Implementation |
|-----------|---------------|
| **Proactive** | Security built into architecture from day 1 |
| **Default** | Privacy-protective defaults (no marketing opt-in) |
| **Embedded** | Encryption, access control in all systems |
| **Positive-Sum** | Security enhances functionality (VCs = portability + integrity) |
| **End-to-End** | Protection throughout data lifecycle |
| **Visible** | This documentation, privacy dashboard |
| **User-Centric** | Self-service controls, clear language |

### 9.2 Data Minimization Examples

```typescript
// Example: User profile
interface UserProfile {
  // Required for service
  email: string;              // Authentication
  name: string;               // Display in UI
  organizationId: string;     // Access control

  // Optional
  timezone?: string;          // UX improvement
  language?: string;          // Localization

  // NOT collected
  // phoneNumber - not needed
  // dateOfBirth - not needed
  // physicalAddress - not needed
}

// Example: Logging
function logApiRequest(req: Request) {
  // Log WHAT happened
  logger.info('API request', {
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
    duration: ms,
  });

  // DON'T log
  // - Request body (may contain PII)
  // - Full headers (may contain tokens)
  // - Query parameters (may contain PII)
}
```

### 9.3 Pseudonymization in Analytics

```typescript
// Example: Usage analytics
interface AnalyticsEvent {
  // Pseudonymous identifier (hash of user ID + salt)
  pseudoId: string;  // NOT the actual user ID

  // Aggregatable data
  action: 'product.create' | 'passport.issue' | ...;
  timestamp: Date;
  organizationSize: 'small' | 'medium' | 'large';  // Bucketed

  // NOT included
  // userId - replaced with pseudoId
  // organizationId - replaced with size bucket
  // productName - not relevant for analytics
}
```

---

## 10. Cookies and Tracking

### 10.1 Cookie Categories

| Cookie | Purpose | Duration | Consent Required |
|--------|---------|----------|------------------|
| `session` | Authentication | 7 days | No (essential) |
| `csrf` | Security | Session | No (essential) |
| `preferences` | Language, timezone | 1 year | No (essential) |
| `analytics` | Usage analytics | 1 year | Yes |
| `marketing` | None used | - | - |

### 10.2 Consent Implementation

```typescript
// Cookie consent banner
const CONSENT_CONFIG = {
  categories: {
    essential: { required: true, description: 'Required for the service to work' },
    analytics: { required: false, description: 'Help us improve the product' },
  },

  // No marketing cookies
  // No third-party tracking

  storage: 'localStorage',  // Consent stored locally
  expiry: '1 year',         // Re-prompt after 1 year
};
```

### 10.3 Third-Party Tracking

**We do NOT use:**
- Google Analytics
- Facebook Pixel
- Any third-party ad trackers

**We use:**
- Self-hosted analytics (Plausible, privacy-focused)
- Essential third-party cookies only (Stripe for payments)

---

## 11. Children's Data

EuroComply is a B2B service. We do not knowingly collect data from children under 16.

If we discover that a user is under 16, we will:
1. Immediately restrict the account
2. Contact the organization administrator
3. Delete the account unless parental consent is provided

---

## 12. Data Protection Officer

For organizations requiring a DPO contact:

```
Data Protection Officer
EuroComply GmbH
Email: dpo@eurocomply.eu

Supervisory Authority (lead):
Berliner Beauftragte für Datenschutz und Informationsfreiheit
```

---

## 13. Privacy Policy Updates

When we update our privacy practices:

1. **Material changes**: Email notification 30 days in advance
2. **Minor changes**: Notice in product, no email
3. **Version history**: All versions archived and accessible

Current Privacy Policy version: 1.0 (2026-01-01)

---

## 14. GDPR Checklist for Product Development

```
┌─────────────────────────────────────────────────────────────────┐
│                    GDPR DEVELOPMENT CHECKLIST                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DATA COLLECTION                                                │
│  □ Is this data necessary? (Data minimization)                 │
│  □ What is the legal basis?                                    │
│  □ Is consent needed? If so, how collected?                    │
│  □ Is privacy notice updated?                                  │
│                                                                  │
│  DATA STORAGE                                                   │
│  □ Where will it be stored? (EU preferred)                     │
│  □ How long will it be retained?                               │
│  □ Is it encrypted at rest?                                    │
│  □ Who has access?                                             │
│                                                                  │
│  DATA PROCESSING                                                │
│  □ Is a third party involved? (Sub-processor)                  │
│  □ Is there international transfer? (SCCs needed?)             │
│  □ Is the DPA updated?                                         │
│                                                                  │
│  DATA SUBJECT RIGHTS                                            │
│  □ Can users access this data? (Export)                        │
│  □ Can users correct this data? (Edit)                         │
│  □ Can users delete this data? (Or pseudonymize)               │
│  □ Can users download this data? (Portability)                 │
│                                                                  │
│  SECURITY                                                       │
│  □ Is access logged?                                           │
│  □ Is the data protected in transit? (TLS)                     │
│  □ Have security risks been assessed?                          │
│                                                                  │
│  DOCUMENTATION                                                  │
│  □ Is the Record of Processing Activities updated?             │
│  □ Is this document updated?                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Related Documentation

- [SECURITY.md](./SECURITY.md) - Security architecture and controls
- [DATA_SOVEREIGNTY.md](./DATA_SOVEREIGNTY.md) - Data ownership and portability
- [USER_MANAGEMENT.md](./USER_MANAGEMENT.md) - User roles and access control
- [ARCHITECTURE_PORTABILITY.md](./ARCHITECTURE_PORTABILITY.md) - QR lifecycle options

---

*Last Updated: 2026-01-11*
