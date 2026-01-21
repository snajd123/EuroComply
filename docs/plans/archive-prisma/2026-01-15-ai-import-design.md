# AI Import Design

**Status:** Draft
**Date:** 2026-01-15
**Source:** AI_DATA_SANITIZATION.md

---

## 1. Overview

AI Import allows customers to upload unstructured documents (PDFs, spreadsheets, images) and have product data automatically extracted using AI. This feature must balance usability with GDPR compliance.

### Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Privacy first** | PII detection before any AI processing |
| **Customer control** | Review and consent before transmission |
| **Data minimization** | Only send sanitized content to AI |
| **Transparency** | Clear disclosure of data flow |
| **Opt-in** | Disabled by default |

---

## 2. Why Anthropic Claude

| Factor | Claude Haiku | GPT-4 | Open Source |
|--------|--------------|-------|-------------|
| **Extraction quality** | Excellent | Excellent | Good |
| **Cost** | Low ($0.25/1M tokens) | High | Infrastructure cost |
| **Speed** | Fast | Medium | Depends |
| **Data handling** | No training on inputs | No training | Full control |
| **EU hosting** | Not yet | Not yet | Yes |

**Decision:** Claude Haiku for MVP. Best quality/cost ratio. Add EU-hosted option later.

---

## 3. Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI IMPORT DATA FLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CUSTOMER UPLOAD                                                │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  STAGE 1: PII DETECTION (EU - EuroComply servers)      │    │
│  │  • Regex patterns (email, phone, VAT, IBAN)            │    │
│  │  • NER for names (Compromise.js)                       │    │
│  │  • Confidence scoring                                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  STAGE 2: CUSTOMER REVIEW                               │    │
│  │  • Show detected PII                                    │    │
│  │  • Per-item: Redact / Tokenize / Preserve               │    │
│  │  • Preview sanitized document                           │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  STAGE 3: EXPLICIT CONSENT                              │    │
│  │  • Checkbox acknowledging US transfer                   │    │
│  │  • Legal basis confirmation                             │    │
│  │  • Consent recorded with timestamp                      │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  STAGE 4: SANITIZATION                                  │    │
│  │  • Apply redaction choices                              │    │
│  │  • Replace PII with tokens: [EMAIL_1], [PERSON_2]       │    │
│  │  • Token map stored locally (never sent to AI)          │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  STAGE 5: AI EXTRACTION (US - Anthropic)                │    │
│  │  • Sanitized document only                              │    │
│  │  • No PII in transmitted content                        │    │
│  │  • Structured product data returned                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  STAGE 6: TOKEN RESTORATION (Optional)                  │    │
│  │  • Restore preserved tokens locally                     │    │
│  │  • PII never left EU infrastructure                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  EXTRACTED PRODUCT DATA → EuroComply database (EU)             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. PII Detection Strategy

### Detection Methods

| PII Type | Method | Confidence |
|----------|--------|------------|
| Email | Regex | High (99%+) |
| Phone | Regex + country codes | High (95%+) |
| Credit Card | Regex + Luhn | High (99%+) |
| VAT/Tax ID | Country-specific regex | High (95%+) |
| IBAN | Regex | High (99%+) |
| Person Names | NER (Compromise.js) | Medium (80%+) |
| Addresses | NER + patterns | Medium (75%+) |

### Why This Approach

- **Regex for structured PII** - High precision, fast, no false positives
- **NER for names** - Best available without heavy ML
- **Customer review catches edge cases** - Human in the loop

### False Positive Handling

Product names can look like person names. Mitigation:
- Context analysis ("Contact: John" vs "Product: John Deere")
- Customer review step
- Low confidence threshold (show more, let customer decide)

---

## 5. Sanitization Strategies

| Strategy | Use Case | Example |
|----------|----------|---------|
| **REDACT** | Remove completely | `john@example.com` → `[REDACTED]` |
| **TOKENIZE** | Reversible replacement | `John Smith` → `[PERSON_1]` |
| **GENERALIZE** | Category replacement | `123 Main St` → `[ADDRESS]` |
| **PRESERVE** | Keep original (with consent) | No change |

### Default Strategy by PII Type

| PII Type | Default | Rationale |
|----------|---------|-----------|
| Email | REDACT | Rarely needed for product data |
| Phone | REDACT | Rarely needed for product data |
| Credit Card | REDACT | Never needed, security risk |
| Person Name | TOKENIZE | May need to restore (contact names) |
| Address | GENERALIZE | May need general location context |
| VAT | PRESERVE | Often needed for supplier identification |

---

## 6. GDPR Compliance

### Legal Basis

```
┌─────────────────────────────────────────────────────────────────┐
│  PROCESSING ACTIVITIES                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ACTIVITY 1: PII Detection (EU)                                 │
│  Controller: Customer                                           │
│  Processor: EuroComply                                          │
│  Legal basis: Legitimate interest (security)                    │
│  Location: EU (Frankfurt)                                       │
│  GDPR: Standard EU processing                                   │
│                                                                  │
│  ACTIVITY 2: AI Extraction (US)                                 │
│  Controller: Customer                                           │
│  Processor: EuroComply                                          │
│  Sub-processor: Anthropic                                       │
│  Legal basis: Explicit consent (for any preserved PII)          │
│  Location: US                                                   │
│  GDPR: SCCs + supplementary measures                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Supplementary Measures for US Transfer

| Measure Type | Implementation |
|--------------|----------------|
| **Technical** | PII sanitization before transfer |
| **Technical** | No storage at Anthropic (stateless API) |
| **Technical** | TLS 1.3 encryption in transit |
| **Contractual** | SCCs with Anthropic |
| **Contractual** | DPA prohibiting data retention |
| **Organizational** | Customer consent UI |
| **Organizational** | Opt-in only (disabled by default) |

### Residual Risk Assessment: LOW

With effective sanitization, transferred data typically contains no PII. Edge cases mitigated by customer review.

---

## 7. Consent Requirements

### Consent UI

```
┌─────────────────────────────────────────────────────────────────┐
│  CONSENT CONFIRMATION                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ☑️  I understand that the sanitized document will be sent to   │
│      Anthropic (US) for AI processing                           │
│                                                                  │
│  ☑️  I confirm that any preserved personal data has appropriate │
│      legal basis for transfer                                   │
│                                                                  │
│  ☑️  I have authority to consent on behalf of data subjects     │
│      (or have obtained their consent)                           │
│                                                                  │
│                         [Cancel]  [Process Document →]          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Consent Record

| Field | Purpose |
|-------|---------|
| `userId` | Who consented |
| `timestamp` | When |
| `ipAddress` | Verification |
| `consentText` | Exact text shown |
| `piiPreservedCount` | How much PII was kept |
| `expiresAt` | Re-consent after 90 days |

---

## 8. Audit Logging

### What We Log

| Logged | Not Logged |
|--------|------------|
| Document hash (SHA-256) | Original document content |
| PII match counts | Actual PII values |
| Sanitization strategies applied | Token-to-value mappings |
| API call duration, token counts | Raw API request/response |
| Consent timestamp | N/A |

### Retention

| Data | Retention | Reason |
|------|-----------|--------|
| Audit records | 1 year | Compliance |
| Sanitized documents | 30 days | Debugging |
| Token maps | 7 days | Immediate restoration only |
| Original documents | Never stored | Privacy |

---

## 9. Technology Choices

| Component | Technology | Rationale |
|-----------|------------|-----------|
| PII Detection - Regex | TypeScript | Fast, precise for patterns |
| PII Detection - NER | Compromise.js | Lightweight, browser-compatible |
| Document Parsing | pdf-parse, xlsx | Standard formats |
| Image OCR | Tesseract.js / AWS Textract | Text from images |
| AI Provider | Anthropic Claude Haiku | Best cost/quality |

### Why Compromise.js for NER

| Library | Size | Decision |
|---------|------|----------|
| Compromise.js | 200KB | ✅ MVP - lightweight |
| spaCy | 500MB | ❌ Wrong stack (Python) |
| AWS Comprehend | API | 📋 Post-launch option |

---

## 10. Future Enhancements

### EU-Hosted AI Option

```
┌─────────────────────────────────────────────────────────────────┐
│  FUTURE: EU-HOSTED AI                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Option A: Anthropic EU (when available)                        │
│  • Same API, EU data residency                                  │
│  • No FISA 702 exposure                                         │
│                                                                  │
│  Option B: Self-hosted Mistral/Llama                            │
│  • Full data sovereignty                                        │
│  • Higher operational cost                                      │
│                                                                  │
│  Option C: Hybrid routing                                       │
│  • Documents with PII → EU model                                │
│  • Documents without PII → Claude (faster)                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 11. Related Documents

| Document | Purpose |
|----------|---------|
| [AI Data Sanitization](../AI_DATA_SANITIZATION.md) | Technical implementation details |
| [GDPR Compliance](../GDPR_COMPLIANCE.md) | Transfer Impact Assessment |
| [Security Design](./2026-01-15-security-design.md) | Third-party vendor security |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-01-15 | Initial draft from AI_DATA_SANITIZATION.md |
