# AI Data Sanitization Architecture

> PII detection and filtering for AI-powered document import.

---

## 1. Overview

EuroComply's AI Import feature uses Claude Haiku to extract product data from unstructured documents (PDFs, spreadsheets, images). Before any data is transmitted to Anthropic's API, it must pass through a sanitization layer to detect and handle personal data.

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI IMPORT DATA FLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CUSTOMER UPLOAD                                                │
│  ─────────────────                                              │
│  PDF catalog, Excel sheet, supplier docs, spec sheets           │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  STAGE 1: PII DETECTION                                 │    │
│  │  ─────────────────────────────────────────────────────  │    │
│  │  • Scan document text for PII patterns                  │    │
│  │  • Identify: names, emails, phones, addresses           │    │
│  │  • Flag detected PII with confidence scores             │    │
│  │  • Generate PII report for customer review              │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  STAGE 2: CUSTOMER DECISION                             │    │
│  │  ─────────────────────────────────────────────────────  │    │
│  │  • Show detected PII to customer                        │    │
│  │  • Options:                                             │    │
│  │    [Redact All] [Review Each] [Proceed Anyway] [Cancel] │    │
│  │  • Customer consent recorded if proceeding with PII     │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  STAGE 3: SANITIZATION                                  │    │
│  │  ─────────────────────────────────────────────────────  │    │
│  │  • Apply customer's redaction choices                   │    │
│  │  • Replace PII with tokens: [PERSON_1], [EMAIL_1]       │    │
│  │  • Store token mapping locally (never sent to AI)       │    │
│  │  • Preserve document structure for AI extraction        │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  STAGE 4: AI EXTRACTION (Claude Haiku)                  │    │
│  │  ─────────────────────────────────────────────────────  │    │
│  │  • Sanitized document sent to Anthropic API             │    │
│  │  • AI extracts product data fields                      │    │
│  │  • Returns structured product information               │    │
│  │  • No PII in transmitted content (redacted)             │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  STAGE 5: TOKEN RESTORATION (Optional)                  │    │
│  │  ─────────────────────────────────────────────────────  │    │
│  │  • If customer chose to preserve certain PII            │    │
│  │  • Restore tokens to original values locally            │    │
│  │  • PII never left EuroComply infrastructure             │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  EXTRACTED PRODUCT DATA → Stored in EuroComply database         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. PII Detection Patterns

### 2.1 Detection Categories

| Category | Pattern Type | Examples | Confidence |
|----------|-------------|----------|------------|
| **Person Names** | NER + Heuristics | "Maria Garcia", "John Smith" | Medium |
| **Email Addresses** | Regex | user@domain.com | High |
| **Phone Numbers** | Regex + Country codes | +49 30 12345678, (555) 123-4567 | High |
| **Physical Addresses** | NER + Patterns | "123 Main St, Berlin 10115" | Medium |
| **National IDs** | Country-specific regex | VAT numbers, passport numbers | High |
| **Credit Cards** | Luhn + Regex | 4111-1111-1111-1111 | High |

### 2.2 Detection Implementation

```typescript
// PII Detection Types
interface PIIMatch {
  type: PIICategory;
  value: string;
  startIndex: number;
  endIndex: number;
  confidence: number;  // 0.0 - 1.0
  context: string;     // Surrounding text for customer review
}

enum PIICategory {
  PERSON_NAME = 'PERSON_NAME',
  EMAIL = 'EMAIL',
  PHONE = 'PHONE',
  ADDRESS = 'ADDRESS',
  NATIONAL_ID = 'NATIONAL_ID',
  CREDIT_CARD = 'CREDIT_CARD',
  CUSTOM = 'CUSTOM',  // Customer-defined patterns
}

interface PIIDetectionResult {
  documentId: string;
  totalMatches: number;
  matchesByCategory: Record<PIICategory, PIIMatch[]>;
  scanDurationMs: number;
  detectorVersion: string;
}

// Detection Configuration
interface PIIDetectorConfig {
  // Which categories to detect
  enabledCategories: PIICategory[];

  // Minimum confidence to flag
  confidenceThreshold: number;  // Default: 0.7

  // Language hints for NER
  languages: string[];  // ['en', 'de', 'fr']

  // Custom patterns (organization-specific)
  customPatterns: CustomPattern[];

  // Performance limits
  maxDocumentSizeBytes: number;  // Default: 10MB
  timeoutMs: number;             // Default: 30000
}

interface CustomPattern {
  name: string;
  regex: string;
  category: PIICategory;
  description: string;
}
```

### 2.3 Regex Patterns

```typescript
// High-confidence regex patterns
const PII_PATTERNS = {
  // Email: Standard RFC 5322 simplified
  EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,

  // Phone: International format with various separators
  PHONE_INTERNATIONAL: /\+?[1-9]\d{0,2}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,

  // Credit Card: Major card formats with Luhn validation
  CREDIT_CARD: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,

  // EU VAT Numbers: Country-specific patterns
  VAT_EU: /\b(AT|BE|BG|CY|CZ|DE|DK|EE|EL|ES|FI|FR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK)[A-Z0-9]{8,12}\b/g,

  // German postal codes + city
  ADDRESS_DE: /\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+\b/g,

  // IBAN
  IBAN: /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/g,
};

// Name detection requires NER (not just regex)
// We use a lightweight approach combining:
// 1. Title prefixes: Mr., Mrs., Dr., etc.
// 2. Common name databases
// 3. Capitalization patterns
// 4. Context clues: "Contact:", "Manager:", "Signed by:"
```

---

## 3. Sanitization Strategies

### 3.1 Strategy Options

| Strategy | Description | Use When | Example |
|----------|-------------|----------|---------|
| **REDACT** | Remove entirely | Default for emails, phones | `[REDACTED]` |
| **TOKENIZE** | Replace with reversible token | Need to restore after AI | `[EMAIL_1]` → restore later |
| **GENERALIZE** | Replace with category | Preserve some context | "John Smith" → "[Person]" |
| **MASK** | Partial redaction | Show format, hide content | `j***@example.com` |
| **PRESERVE** | Keep original (with consent) | Business contacts, required data | No change |

### 3.2 Implementation

```typescript
// Sanitization Configuration
interface SanitizationConfig {
  defaultStrategy: SanitizationStrategy;
  strategyOverrides: Record<PIICategory, SanitizationStrategy>;

  // Token restoration settings
  enableTokenRestoration: boolean;
  tokenPrefix: string;  // Default: "["
  tokenSuffix: string;  // Default: "]"
}

enum SanitizationStrategy {
  REDACT = 'REDACT',
  TOKENIZE = 'TOKENIZE',
  GENERALIZE = 'GENERALIZE',
  MASK = 'MASK',
  PRESERVE = 'PRESERVE',
}

// Default configuration
const DEFAULT_SANITIZATION_CONFIG: SanitizationConfig = {
  defaultStrategy: SanitizationStrategy.TOKENIZE,
  strategyOverrides: {
    [PIICategory.EMAIL]: SanitizationStrategy.REDACT,
    [PIICategory.PHONE]: SanitizationStrategy.REDACT,
    [PIICategory.CREDIT_CARD]: SanitizationStrategy.REDACT,
    [PIICategory.NATIONAL_ID]: SanitizationStrategy.REDACT,
    [PIICategory.PERSON_NAME]: SanitizationStrategy.TOKENIZE,
    [PIICategory.ADDRESS]: SanitizationStrategy.GENERALIZE,
  },
  enableTokenRestoration: true,
  tokenPrefix: '[',
  tokenSuffix: ']',
};

// Sanitization Result
interface SanitizationResult {
  originalDocument: string;
  sanitizedDocument: string;
  tokenMap: Map<string, string>;  // [TOKEN] → original value
  appliedRedactions: RedactionRecord[];
  config: SanitizationConfig;
}

interface RedactionRecord {
  token: string;
  originalValue: string;
  category: PIICategory;
  strategy: SanitizationStrategy;
  position: { start: number; end: number };
}

// Sanitization Function
async function sanitizeDocument(
  document: string,
  detectionResult: PIIDetectionResult,
  config: SanitizationConfig,
  customerChoices: Map<string, SanitizationStrategy>  // Per-match overrides
): Promise<SanitizationResult> {
  const tokenMap = new Map<string, string>();
  const redactions: RedactionRecord[] = [];
  let sanitized = document;
  let offset = 0;  // Track position shifts from replacements

  // Sort matches by position (process in order)
  const allMatches = Object.values(detectionResult.matchesByCategory)
    .flat()
    .sort((a, b) => a.startIndex - b.startIndex);

  for (const match of allMatches) {
    // Determine strategy: customer choice > category override > default
    const strategy = customerChoices.get(match.value)
      ?? config.strategyOverrides[match.type]
      ?? config.defaultStrategy;

    const replacement = generateReplacement(match, strategy, tokenMap);

    // Apply replacement
    const adjustedStart = match.startIndex + offset;
    const adjustedEnd = match.endIndex + offset;
    sanitized = sanitized.slice(0, adjustedStart)
      + replacement
      + sanitized.slice(adjustedEnd);

    // Track offset change
    offset += replacement.length - (match.endIndex - match.startIndex);

    // Record redaction
    redactions.push({
      token: replacement,
      originalValue: match.value,
      category: match.type,
      strategy,
      position: { start: adjustedStart, end: adjustedStart + replacement.length },
    });
  }

  return {
    originalDocument: document,
    sanitizedDocument: sanitized,
    tokenMap,
    appliedRedactions: redactions,
    config,
  };
}

function generateReplacement(
  match: PIIMatch,
  strategy: SanitizationStrategy,
  tokenMap: Map<string, string>
): string {
  switch (strategy) {
    case SanitizationStrategy.REDACT:
      return '[REDACTED]';

    case SanitizationStrategy.TOKENIZE:
      const tokenId = `${match.type}_${tokenMap.size + 1}`;
      const token = `[${tokenId}]`;
      tokenMap.set(token, match.value);
      return token;

    case SanitizationStrategy.GENERALIZE:
      return `[${match.type}]`;

    case SanitizationStrategy.MASK:
      return maskValue(match.value, match.type);

    case SanitizationStrategy.PRESERVE:
      return match.value;
  }
}

function maskValue(value: string, category: PIICategory): string {
  switch (category) {
    case PIICategory.EMAIL:
      const [local, domain] = value.split('@');
      return `${local[0]}***@${domain}`;
    case PIICategory.PHONE:
      return value.slice(0, 4) + '****' + value.slice(-2);
    default:
      return value.slice(0, 2) + '***' + value.slice(-2);
  }
}
```

---

## 4. Customer Controls

### 4.1 Organization Settings

```typescript
// Organization-level AI settings
interface AIImportSettings {
  // Master toggle
  enabled: boolean;

  // PII handling
  piiDetection: {
    enabled: boolean;
    categories: PIICategory[];
    confidenceThreshold: number;
    customPatterns: CustomPattern[];
  };

  // Default sanitization behavior
  sanitization: {
    defaultStrategy: SanitizationStrategy;
    requireReviewBeforeSend: boolean;  // Force customer to review PII
    autoRedactHighConfidence: boolean; // Auto-redact >0.95 confidence
  };

  // Consent tracking
  consent: {
    requireExplicitConsent: boolean;
    consentExpiryDays: number;  // Re-prompt after N days
  };

  // Audit
  audit: {
    logAllTransmissions: boolean;
    retainSanitizedCopies: boolean;
    retentionDays: number;
  };
}

// Default settings (privacy-protective)
const DEFAULT_AI_IMPORT_SETTINGS: AIImportSettings = {
  enabled: false,  // Disabled by default - customer must opt-in
  piiDetection: {
    enabled: true,
    categories: Object.values(PIICategory),
    confidenceThreshold: 0.7,
    customPatterns: [],
  },
  sanitization: {
    defaultStrategy: SanitizationStrategy.TOKENIZE,
    requireReviewBeforeSend: true,
    autoRedactHighConfidence: true,
  },
  consent: {
    requireExplicitConsent: true,
    consentExpiryDays: 90,
  },
  audit: {
    logAllTransmissions: true,
    retainSanitizedCopies: true,
    retentionDays: 30,
  },
};
```

### 4.2 UI Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI IMPORT WIZARD                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STEP 1: Upload Document                                        │
│  ─────────────────────────                                      │
│  [Drag files here or click to browse]                          │
│  Supported: PDF, Excel, CSV, Images                            │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STEP 2: PII Detection Results                                  │
│  ─────────────────────────────                                  │
│                                                                  │
│  ⚠️  We detected 7 items that may contain personal data:       │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Type         │ Found              │ Action                │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │ 📧 Email     │ john@supplier.com  │ [Redact ▼]           │  │
│  │ 📧 Email     │ maria@factory.de   │ [Redact ▼]           │  │
│  │ 👤 Name      │ John Smith         │ [Tokenize ▼]         │  │
│  │ 👤 Name      │ Maria Garcia       │ [Tokenize ▼]         │  │
│  │ 📞 Phone     │ +49 30 123456      │ [Redact ▼]           │  │
│  │ 🏠 Address   │ 123 Factory St...  │ [Generalize ▼]       │  │
│  │ 🆔 VAT       │ DE123456789        │ [Preserve ▼]         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Actions: [Redact] [Tokenize] [Generalize] [Mask] [Preserve]   │
│                                                                  │
│  [Redact All]  [Apply Defaults]  [Review in Detail]            │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STEP 3: Consent & Confirmation                                 │
│  ─────────────────────────────                                  │
│                                                                  │
│  ☑️  I understand that the sanitized document will be sent to   │
│     Anthropic (US) for AI processing                           │
│                                                                  │
│  ☑️  I confirm that any preserved personal data has appropriate │
│     legal basis for transfer (consent/contract/legitimate int.) │
│                                                                  │
│  Preview sanitized document: [View Preview]                    │
│                                                                  │
│                         [Cancel]  [Process Document →]          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Audit Logging

### 5.1 Audit Record Schema

```typescript
interface AIImportAuditRecord {
  id: string;
  organizationId: string;
  userId: string;

  // Document info
  documentId: string;
  documentName: string;
  documentSizeBytes: number;
  documentHash: string;  // SHA-256 of original

  // PII Detection
  piiDetectionResult: {
    totalMatches: number;
    matchesByCategory: Record<PIICategory, number>;
    detectorVersion: string;
  };

  // Sanitization
  sanitizationApplied: {
    strategy: SanitizationStrategy;
    redactedCount: number;
    tokenizedCount: number;
    preservedCount: number;
    preservedCategories: PIICategory[];  // What PII was kept
  };

  // Consent
  consent: {
    explicitConsentGiven: boolean;
    consentTimestamp: Date;
    consentIpAddress: string;
  };

  // API Call
  apiCall: {
    provider: 'anthropic';
    model: 'claude-3-haiku';
    requestTimestamp: Date;
    responseTimestamp: Date;
    durationMs: number;
    inputTokens: number;
    outputTokens: number;
    sanitizedPayloadHash: string;  // SHA-256 of what was sent
  };

  // Result
  result: {
    success: boolean;
    productsExtracted: number;
    errorMessage?: string;
  };

  // Metadata
  createdAt: Date;
  retainUntil: Date;  // Deletion schedule
}
```

### 5.2 What We Log vs. Don't Log

| Logged | Not Logged |
|--------|------------|
| Document hash (SHA-256) | Original document content |
| PII match counts by category | Actual PII values detected |
| Sanitization strategies applied | Token-to-value mappings |
| Consent timestamp and IP | N/A |
| API call duration and token counts | Raw API request/response |
| Sanitized payload hash | Sanitized document content |

### 5.3 Retention & Deletion

```typescript
// Audit retention policy
const AUDIT_RETENTION = {
  // Audit metadata (hashes, counts, timestamps)
  auditRecords: {
    retentionDays: 365,  // 1 year
    deletionMethod: 'hard_delete',
  },

  // Sanitized document copies (if retained per org settings)
  sanitizedDocuments: {
    retentionDays: 30,  // Short retention
    deletionMethod: 'secure_delete',
  },

  // Token maps (for restoration)
  tokenMaps: {
    retentionDays: 7,  // Very short - only for immediate restoration
    deletionMethod: 'secure_delete',
  },

  // Original documents
  originalDocuments: {
    retentionDays: 0,  // Never stored by AI import service
    deletionMethod: 'not_applicable',
  },
};
```

---

## 6. API Integration

### 6.1 Anthropic API Call

```typescript
import Anthropic from '@anthropic-ai/sdk';

interface AIExtractionRequest {
  sanitizedDocument: string;
  extractionSchema: ProductExtractionSchema;
  organizationId: string;
}

interface ProductExtractionSchema {
  fields: Array<{
    name: string;
    type: 'string' | 'number' | 'array' | 'object';
    description: string;
    required: boolean;
  }>;
}

async function extractProductData(
  request: AIExtractionRequest,
  auditContext: AuditContext
): Promise<ExtractionResult> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const startTime = Date.now();

  // Build extraction prompt
  const systemPrompt = buildExtractionSystemPrompt(request.extractionSchema);
  const userPrompt = `Extract product information from the following document:\n\n${request.sanitizedDocument}`;

  try {
    const response = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const durationMs = Date.now() - startTime;

    // Log audit record (no PII)
    await logAIImportAudit({
      ...auditContext,
      apiCall: {
        provider: 'anthropic',
        model: 'claude-3-haiku',
        requestTimestamp: new Date(startTime),
        responseTimestamp: new Date(),
        durationMs,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        sanitizedPayloadHash: sha256(request.sanitizedDocument),
      },
      result: { success: true, productsExtracted: 0 },  // Updated after parsing
    });

    // Parse and return extracted data
    return parseExtractionResponse(response);

  } catch (error) {
    await logAIImportAudit({
      ...auditContext,
      result: {
        success: false,
        productsExtracted: 0,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      },
    });
    throw error;
  }
}

function buildExtractionSystemPrompt(schema: ProductExtractionSchema): string {
  return `You are a product data extraction assistant. Extract structured product information from documents.

Output format: JSON array of products matching this schema:
${JSON.stringify(schema.fields, null, 2)}

Rules:
- Extract only explicitly stated information
- Use null for missing fields
- Preserve original values (don't translate or convert units)
- If you see tokens like [PERSON_NAME_1] or [REDACTED], include them as-is
- Output valid JSON only`;
}
```

---

## 7. Implementation Plan

### 7.1 Technology Choices

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **PII Detection - Regex** | Custom TypeScript | High precision for structured patterns (email, phone, VAT) |
| **PII Detection - NER** | [Compromise.js](https://github.com/spencermountain/compromise) | Lightweight, browser-compatible, good name/place detection |
| **Document Parsing** | pdf-parse + xlsx | Extract text from common formats |
| **Image OCR** | Tesseract.js (client) or AWS Textract (server) | Text extraction from images |
| **Tokenization** | Custom TypeScript | Simple token replacement with position tracking |
| **AI Provider** | Anthropic Claude Haiku | Cost-effective, fast, good extraction quality |

### 7.2 MVP Scope vs. Future

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MVP (Launch) vs. POST-LAUNCH                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  MVP - Required for AI Import Launch:                                       │
│  ────────────────────────────────────                                       │
│  ✅ Email detection (regex)                                                 │
│  ✅ Phone detection (regex, international formats)                          │
│  ✅ Credit card detection (regex + Luhn validation)                         │
│  ✅ VAT/Tax ID detection (regex, EU formats)                                │
│  ✅ IBAN detection (regex)                                                  │
│  ✅ Basic name detection (Compromise.js NER + title prefixes)               │
│  ✅ Customer review UI (show detections, allow overrides)                   │
│  ✅ REDACT and TOKENIZE strategies                                          │
│  ✅ Explicit consent checkbox                                               │
│  ✅ Audit logging (hashes, counts, no PII values)                           │
│  ✅ Anthropic API integration                                               │
│                                                                              │
│  POST-LAUNCH - Enhancements:                                                │
│  ────────────────────────────                                               │
│  📋 Address detection (complex, requires country-specific NER)              │
│  📋 GENERALIZE and MASK strategies                                          │
│  📋 Token restoration (reverse tokenization after extraction)               │
│  📋 Custom organization patterns                                            │
│  📋 Multi-language NER (German, French, Spanish)                            │
│  📋 AWS Comprehend PII detection (more accurate, higher cost)               │
│  📋 EU-hosted model option (Mistral via AWS Bedrock EU)                     │
│  📋 Image/PDF OCR improvements                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| PII Detection - Email | 📋 MVP | Regex-based, high confidence |
| PII Detection - Phone | 📋 MVP | International format support |
| PII Detection - Credit Card | 📋 MVP | Luhn validation included |
| PII Detection - VAT/IBAN | 📋 MVP | EU format patterns |
| PII Detection - Names | 📋 MVP | Compromise.js NER |
| PII Detection - Addresses | 📋 Post-Launch | Complex, requires more NER work |
| Sanitization - REDACT | 📋 MVP | Simple replacement |
| Sanitization - TOKENIZE | 📋 MVP | Reversible tokens |
| Sanitization - GENERALIZE/MASK | 📋 Post-Launch | Lower priority strategies |
| Customer Review UI | 📋 MVP | React component |
| Consent Tracking | 📋 MVP | Database + checkbox |
| Audit Logging | 📋 MVP | PostgreSQL, no PII stored |
| Anthropic Integration | 📋 MVP | Claude Haiku |
| Token Restoration | 📋 Post-Launch | Nice-to-have |
| Organization Settings | 📋 Post-Launch | Use sensible defaults first |

### 7.4 NER Library Evaluation

We evaluated several NER options:

| Library | Size | Speed | Name Detection | EU Language Support | Decision |
|---------|------|-------|----------------|---------------------|----------|
| **Compromise.js** | 200KB | Fast | Good | English only | ✅ MVP |
| **spaCy (Python)** | 500MB | Medium | Excellent | Multi-language | ❌ Wrong stack |
| **AWS Comprehend** | API | Medium | Excellent | Multi-language | 📋 Post-Launch |
| **Google Cloud NLP** | API | Medium | Excellent | Multi-language | ❌ US jurisdiction |
| **Presidio (MS)** | 100MB | Medium | Excellent | Multi-language | 📋 Evaluate |

**MVP Decision:** Use Compromise.js for name detection with fallback to title-prefix heuristics ("Mr.", "Ms.", "Dr."). Good enough for English documents (majority of supplier docs). Add multi-language NER post-launch if customer demand exists.

### 7.5 Pre-Production Checklist

**Legal & Compliance:**
- [ ] Execute DPA with Anthropic (in progress)
- [ ] Update Terms of Service to cover AI processing
- [ ] Update Privacy Notice with AI data flow
- [ ] Document lawful basis for US transfer (SCCs + supplementary measures)

**Implementation:**
- [ ] Implement regex PII detectors (email, phone, CC, VAT, IBAN)
- [ ] Integrate Compromise.js for name detection
- [ ] Build sanitization engine (REDACT + TOKENIZE)
- [ ] Build customer review UI component
- [ ] Implement consent tracking (database + API)
- [ ] Implement audit logging
- [ ] Integrate Anthropic API with error handling

**Testing:**
- [ ] Unit tests for all PII detectors (>95% recall for MVP patterns)
- [ ] Integration tests with sample documents (PDF, Excel, CSV)
- [ ] False positive testing (product names vs. person names)
- [ ] Performance testing (< 5s for 10MB document)
- [ ] Security review of sanitization logic

**Documentation:**
- [ ] API reference for AI Import endpoints
- [ ] Customer-facing help docs
- [ ] Internal runbook for incident response

---

## 8. GDPR Compliance for AI Import

### 8.1 Legal Basis for Processing

AI Import involves two distinct processing activities:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PROCESSING ACTIVITIES                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ACTIVITY 1: PII Detection (EuroComply servers, EU)                         │
│  ─────────────────────────────────────────────────                          │
│  Controller: Customer (brand/manufacturer)                                  │
│  Processor: EuroComply                                                      │
│  Legal basis: Legitimate interest (security) + contract performance         │
│  Location: EU (Frankfurt AWS region)                                        │
│  GDPR compliance: ✅ Standard EU processing                                 │
│                                                                              │
│  ACTIVITY 2: AI Extraction (Anthropic, US)                                  │
│  ─────────────────────────────────────────────────                          │
│  Controller: Customer                                                       │
│  Processor: EuroComply                                                      │
│  Sub-processor: Anthropic                                                   │
│  Legal basis: Explicit consent (for any PII not redacted)                   │
│  Location: US                                                               │
│  GDPR compliance: Requires supplementary measures (see below)               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Transfer Impact Assessment (TIA) Summary

| Factor | Assessment | Mitigation |
|--------|------------|------------|
| **Data Type** | Product documents, may contain supplier PII | PII sanitization before transfer |
| **Recipient** | Anthropic (US company) | DPA executed, SOC 2 Type II |
| **US Laws** | FISA 702, EO 12333 exposure | SCCs + supplementary measures |
| **Data Minimization** | Only sanitized text sent | Tokenization replaces PII |
| **Residual Risk** | LOW if sanitization effective | Customer review catches edge cases |

### 8.3 Supplementary Measures

To achieve GDPR compliance for US transfer:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SUPPLEMENTARY MEASURES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TECHNICAL MEASURES:                                                        │
│  ✅ PII detection and sanitization before transfer                          │
│  ✅ Customer review and explicit consent                                    │
│  ✅ No storage of PII at Anthropic (stateless API)                          │
│  ✅ TLS 1.3 encryption in transit                                           │
│  ✅ Audit logging of all transfers                                          │
│                                                                              │
│  CONTRACTUAL MEASURES:                                                      │
│  ✅ Standard Contractual Clauses (SCCs) with Anthropic                      │
│  ✅ DPA specifying data handling requirements                               │
│  ✅ Prohibition of data retention beyond API call                           │
│  ✅ Commitment to notify of government access requests                      │
│                                                                              │
│  ORGANIZATIONAL MEASURES:                                                   │
│  ✅ Customer consent UI with clear disclosure                               │
│  ✅ Opt-in only (AI Import disabled by default)                             │
│  ✅ Customer can choose to redact all PII                                   │
│  ✅ Privacy notice updated with AI processing disclosure                    │
│                                                                              │
│  RESIDUAL RISK ASSESSMENT: LOW                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│  With sanitization, the data transferred typically contains no PII.        │
│  Edge cases (missed PII) are mitigated by customer review step.            │
│  Anthropic does not store data beyond the API call.                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.4 Customer Consent Requirements

Before any AI Import, customers must:

1. **Review detected PII** - See all flagged items with redaction options
2. **Choose sanitization** - Decide REDACT vs. PRESERVE for each item
3. **Explicit consent** - Check consent box acknowledging:
   - Data will be processed by Anthropic (US)
   - Any preserved PII has appropriate legal basis
   - They have authority to consent on behalf of data subjects (or have obtained consent)

```typescript
// Consent record structure
interface AIImportConsent {
  organizationId: string;
  userId: string;
  documentId: string;

  // What was consented to
  piiPreservedCount: number;
  piiPreservedCategories: PIICategory[];

  // Consent details
  consentText: string;  // Exact text shown to user
  consentVersion: string;  // For tracking consent text changes
  consentTimestamp: Date;
  consentIpAddress: string;
  consentUserAgent: string;

  // Retention
  expiresAt: Date;  // Re-consent required after 90 days
}
```

---

## 9. Security Considerations

### 9.1 Threat Model

| Threat | Mitigation |
|--------|------------|
| PII leaks to AI provider | Sanitization layer, customer review |
| Token maps exposed | Short retention, encrypted storage |
| Audit logs contain PII | Only hashes and counts logged |
| Customer bypasses review | `requireReviewBeforeSend` setting |
| False negatives (missed PII) | Multiple detection methods, customer review |
| Regex injection | Input validation, safe regex patterns |

### 9.2 Testing Requirements

```typescript
// Required test coverage
describe('PII Detection', () => {
  it('should detect emails with 99%+ recall');
  it('should detect phone numbers across international formats');
  it('should detect names with context clues');
  it('should not flag product names as person names');
  it('should handle mixed-language documents');
  it('should complete within timeout for large documents');
});

describe('Sanitization', () => {
  it('should tokenize without data loss');
  it('should restore tokens correctly');
  it('should preserve document structure');
  it('should handle overlapping PII matches');
  it('should apply customer overrides correctly');
});

describe('Audit', () => {
  it('should never log actual PII values');
  it('should log all API calls');
  it('should enforce retention limits');
});
```

---

## 10. Future Enhancements

### 10.1 EU-Hosted AI Alternative

To reduce transfer risk to LOW:

```
┌─────────────────────────────────────────────────────────────────┐
│                    EU-HOSTED AI OPTION                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Option A: Anthropic EU Deployment (when available)             │
│  • Same API, EU data residency                                  │
│  • No FISA 702 exposure                                         │
│  • Customer setting: "Prefer EU processing"                     │
│                                                                  │
│  Option B: Self-Hosted Open Source Model                        │
│  • Deploy Mistral/Llama on EU infrastructure                   │
│  • Full data sovereignty                                        │
│  • Higher operational cost                                      │
│                                                                  │
│  Option C: Hybrid Approach                                      │
│  • Documents with PII → EU-hosted model                        │
│  • Documents without PII → Claude (faster, cheaper)            │
│  • Automatic routing based on detection results                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 10.2 Enhanced Detection

- Integration with commercial PII detection APIs (Presidio, AWS Comprehend)
- Machine learning classifier for organization-specific PII patterns
- Document-type-specific detection rules (invoices vs. spec sheets)
- Confidence calibration based on customer feedback

---

## Related Documentation

- [GDPR_COMPLIANCE.md](./GDPR_COMPLIANCE.md) - Transfer Impact Assessment
- [SECURITY.md](./SECURITY.md) - Third-party vendor security
- [DATA_SOVEREIGNTY.md](./DATA_SOVEREIGNTY.md) - Data ownership principles

---

*Last Updated: 2026-01-14*
