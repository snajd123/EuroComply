# AI Regulation Ingestor Design

> **For Claude:** Use superpowers:executing-plans to implement this design task-by-task.

**Goal:** Build a hybrid AI-powered pipeline that ingests EU regulations 100x faster than manual mapping, transforming EuroComply from a "tool" into a "knowledge platform."

**Architecture:** Dual-path ingestion (structured APIs for ECHA, LLM for EUR-Lex) with multi-model validation (Claude primary, Gemini shadow) and human-in-the-loop review dashboard.

**Tech Stack:** Claude 4.5 API, Gemini 2.0 Flash API, TypeScript, React (Admin UI), PostgreSQL staging tables.

---

## 1. Problem Statement

Manual regulation mapping doesn't scale:

| Metric | Manual Approach | Impact |
|--------|-----------------|--------|
| Time per regulation | 3-4 weeks | Slow market entry |
| Required expertise | Legal + Developer | Expensive, bottlenecked |
| Error rate | ~12% | Legal liability |
| Update cycle | Manual tracking | Missed amendments |

**The insight:** A startup cannot hire 50 legal analysts. The platform must transform legal text into structured data automatically.

---

## 2. Solution Overview

### The "Knowledge Platform" Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AI REGULATION INGESTOR                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STRUCTURED PATH (Fast)                 UNSTRUCTURED PATH (LLM)             │
│  ──────────────────────                 ───────────────────────             │
│                                                                              │
│  ECHA API ──► XML Parser ──┐            EUR-Lex PDF ──► Claude 4.5 ──┐     │
│  (SVHC, Annex XVII lists)  │            (Legal text)     (Primary)   │     │
│                            │                                │         │     │
│                            │                    Gemini Flash ──┘      │     │
│                            │                    (Shadow check)        │     │
│                            │                           │              │     │
│                            │                    ┌──────▼──────┐       │     │
│                            │                    │  COMPARATOR │       │     │
│                            │                    │  ✓ Consensus│       │     │
│                            │                    │  ⚠ Conflict │       │     │
│                            │                    └──────┬──────┘       │     │
│                            │                           │              │     │
│                            ▼                           ▼              │     │
│                    ┌───────────────────────────────────────────┐     │     │
│                    │           STAGING QUEUE                    │     │     │
│                    │                                            │     │     │
│                    │  staging_regulation + staging_requirement  │     │     │
│                    └─────────────────┬──────────────────────────┘     │     │
│                                      │                                │     │
│                                      ▼                                │     │
│                    ┌───────────────────────────────────────────┐     │     │
│                    │        ADMIN REVIEW DASHBOARD              │     │     │
│                    │                                            │     │     │
│                    │  PDF Viewer ◄──► Extracted Rules           │     │     │
│                    │  [Approve] [Edit] [Reject]                 │     │     │
│                    └─────────────────┬──────────────────────────┘     │     │
│                                      │                                │     │
│                                      ▼                                │     │
│                    ┌───────────────────────────────────────────┐     │     │
│                    │         PRODUCTION TABLES                  │     │     │
│                    │                                            │     │     │
│                    │  public.regulation                         │     │     │
│                    │  public.requirement                        │     │     │
│                    │  public.category_regulation                │     │     │
│                    └───────────────────────────────────────────┘     │     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Value Proposition

| Metric | Manual | AI Ingestor |
|--------|--------|-------------|
| Time to add regulation | 3-4 weeks | 2-3 hours |
| Error rate | ~12% | <1% (dual-model check) |
| Legal defensibility | "Bob mapped this" | Audit trail + model trace |
| Vertical expansion | Months | Days |

---

## 3. Detailed Architecture

### 3.1 Structured Path (ECHA API)

For data already available via API, skip the LLM entirely:

**Sources:**
- ECHA SVHC Candidate List (XML)
- ECHA Annex XVII Restricted Substances (XML)
- ECHA Biocidal Products (XML)

**Flow:**
```
ECHA API ──► Fetch XML ──► Parse to StagingRequirement ──► Auto-approve (high confidence)
```

**Why separate?** Using an LLM for structured data is expensive and prone to hallucination. The ECHA data becomes the "source of truth" that the LLM can reference.

### 3.2 Unstructured Path (LLM Extraction)

For legal text (EUR-Lex PDFs, Official Journal):

**Primary extraction (Claude 4.5):**
- Full JSON extraction with Chain-of-Thought reasoning
- Confidence scores per requirement
- Legal reference citations with document coordinates

**Shadow validation (Gemini 2.0 Flash):**
- Simplified extraction: (CAS number, threshold) pairs only
- Fast and cheap - used purely for cross-validation

**Comparator service:**
- Diffs Claude vs Gemini outputs
- Flags conflicts for human review
- Auto-approves consensus items

### 3.3 Multi-Model Validation ("Team of Rivals")

```
Claude 4.5                          Gemini Flash
───────────                         ────────────
{                                   [
  "substance": "Lead",                { "cas": "7439-92-1", "threshold": 0.05 },
  "cas": "7439-92-1",                 { "cas": "7440-43-9", "threshold": 0.01 }
  "threshold": 0.05,                ]
  "confidence": 0.97,
  "reasoning": "..."
}
                    │
                    ▼
            ┌───────────────┐
            │  COMPARATOR   │
            │               │
            │  Match? ──► ✓ Auto-approve
            │  Differ? ──► ⚠ Human review
            └───────────────┘
```

**Conflict example:**
```
Property: Threshold Value (Lead in Jewelry)
Claude 4.5: 0.05%
Gemini Flash: 0.5%
Claude Reasoning: "Applied 2024 amendment lowering threshold from 0.5% to 0.05%"
Action: [Accept Claude] [Accept Gemini] [Manual Edit]
```

---

## 4. Prompt Engineering Schema

### 4.1 System Prompt

```
Role: You are a Legal Systems Architect specializing in EU REACH and ESPR compliance.

Task: Extract every distinct substance restriction from the provided EUR-Lex text.

Constraints:
1. For each restriction, identify: substance name, CAS number, threshold, operator, material scope
2. Map operators to these exact enums: GT, GTE, LT, LTE, EQ, PRESENT, ABSENT
3. Provide a confidence_score (0.0-1.0) for each extracted requirement
4. Include your reasoning for complex interpretations
5. Cite the exact legal reference (Article, Paragraph, Entry)
6. Note PDF coordinates for citation anchoring where possible

Output Format: XML-wrapped JSON (prevents preamble parsing errors)
```

### 4.2 Output Schema

```xml
<extraction_results>
{
  "regulation_metadata": {
    "code": "REACH_ANNEX_XVII",
    "name": "REACH Annex XVII Restrictions",
    "source_url": "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02006R1907",
    "version": "2024.1",
    "effective_date": "2024-07-01",
    "jurisdiction": "EU"
  },
  "requirements": [
    {
      "substance_name": "Lead and its compounds",
      "cas_number": "7439-92-1",
      "ec_number": "231-100-4",
      "operator": "LT",
      "threshold_value": 0.05,
      "unit": "PERCENT_BY_WEIGHT",
      "scope": ["Jewellery", "Hair accessories", "Wristwatches for children"],
      "legal_reference": "Entry 63, Paragraph 1",
      "pdf_coordinates": { "page": 47, "bbox": [100, 200, 500, 250] },
      "confidence_score": 0.97,
      "reasoning": "Applied 2024 amendment (EU 2024/1328) which lowered the threshold from 0.5% to 0.05% for consumer-facing jewelry components accessible to children.",
      "allows_exemption": false,
      "exemption_conditions": null
    },
    {
      "substance_name": "Cadmium and its compounds",
      "cas_number": "7440-43-9",
      "ec_number": "231-152-8",
      "operator": "LT",
      "threshold_value": 0.01,
      "unit": "PERCENT_BY_WEIGHT",
      "scope": ["Plastic materials", "Paints"],
      "legal_reference": "Entry 23, Paragraph 1(a)",
      "pdf_coordinates": { "page": 31, "bbox": [100, 300, 500, 350] },
      "confidence_score": 0.95,
      "reasoning": "Standard cadmium restriction for plastics. Note: Exemption exists for safety applications per Paragraph 4.",
      "allows_exemption": true,
      "exemption_conditions": "Safety applications requiring specific color coding"
    }
  ],
  "category_mappings": [
    {
      "requirement_index": 0,
      "suggested_categories": ["apparel.accessories", "toys.jewelry"],
      "mapping_confidence": 0.92
    },
    {
      "requirement_index": 1,
      "suggested_categories": ["plastics", "coatings"],
      "mapping_confidence": 0.88
    }
  ],
  "extraction_metadata": {
    "model": "claude-4.5-opus",
    "extracted_at": "2026-01-29T10:00:00Z",
    "total_requirements": 2,
    "avg_confidence": 0.96
  }
}
</extraction_results>
```

### 4.3 Shadow Prompt (Gemini Flash)

Simplified extraction for validation only:

```
Extract all substance restrictions as (CAS number, threshold percentage) pairs.
Return JSON array: [{"cas": "...", "threshold": 0.05}, ...]
```

---

## 5. Data Model Extensions

### 5.1 Staging Tables

```typescript
// packages/database/src/entities/StagingRegulation.ts

enum StagingStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PARTIALLY_APPROVED = 'PARTIALLY_APPROVED'
}

@Entity({ tableName: 'staging_regulation', schema: 'public' })
class StagingRegulation extends BaseEntity {
  @Property()
  code!: string;

  @Property()
  name!: string;

  @Property()
  sourceUrl!: string;

  @Property({ type: 'jsonb' })
  primaryPayload!: object;        // Claude's full extraction

  @Property({ type: 'jsonb', nullable: true })
  shadowPayload?: object;         // Gemini's simplified extraction

  @Property({ type: 'jsonb', nullable: true })
  regulationMetadata?: object;

  @Enum(() => StagingStatus)
  status: StagingStatus = StagingStatus.PENDING;

  @Property({ type: 'timestamptz' })
  createdAt: Date = new Date();

  @Property({ nullable: true })
  reviewedBy?: string;

  @Property({ type: 'timestamptz', nullable: true })
  approvedAt?: Date;

  @Property({ nullable: true })
  rejectionReason?: string;

  @OneToMany(() => StagingRequirement, r => r.stagingRegulation)
  requirements = new Collection<StagingRequirement>(this);
}
```

```typescript
// packages/database/src/entities/StagingRequirement.ts

enum ConsensusStatus {
  MATCH = 'MATCH',              // Both models agree
  CONFLICT = 'CONFLICT',        // Models disagree
  LOW_CONFIDENCE = 'LOW_CONFIDENCE',  // Agreement but <95% confidence
  SHADOW_MISSING = 'SHADOW_MISSING'   // No shadow data (structured path)
}

@Entity({ tableName: 'staging_requirement', schema: 'public' })
class StagingRequirement extends BaseEntity {
  @ManyToOne(() => StagingRegulation)
  stagingRegulation!: StagingRegulation;

  @Property()
  substanceName!: string;

  @Property({ nullable: true })
  casNumber?: string;

  @Property({ nullable: true })
  ecNumber?: string;

  @Enum(() => ComparisonOperator)
  operator!: ComparisonOperator;

  @Property({ type: 'decimal' })
  thresholdValue!: number;

  @Property()
  unit!: string;

  @Property({ type: 'jsonb' })
  scope!: string[];

  @Property()
  legalReference!: string;

  @Property({ type: 'jsonb', nullable: true })
  pdfCoordinates?: { page: number; bbox: number[] };

  @Property({ type: 'decimal' })
  confidenceScore!: number;

  @Property({ type: 'text', nullable: true })
  reasoning?: string;

  @Property()
  allowsExemption: boolean = false;

  @Property({ type: 'text', nullable: true })
  exemptionConditions?: string;

  // Consensus tracking (per-requirement, not per-regulation)
  @Enum(() => ConsensusStatus)
  consensusStatus!: ConsensusStatus;

  @Property({ type: 'jsonb', nullable: true })
  conflictDetails?: {
    claude: { threshold: number; unit: string };
    gemini: { threshold: number; unit: string };
  };

  // Category suggestions from AI
  @Property({ type: 'jsonb', nullable: true })
  suggestedCategories?: { path: string; confidence: number }[];

  // Review state
  @Property()
  isApproved: boolean = false;

  @Property({ nullable: true })
  approvedBy?: string;

  @Property({ type: 'timestamptz', nullable: true })
  approvedAt?: Date;
}
```

### 5.2 Audit Trail

```typescript
// packages/database/src/entities/IngestionAuditLog.ts

enum IngestionAction {
  EXTRACTED = 'EXTRACTED',
  VALIDATED = 'VALIDATED',
  CONFLICT_DETECTED = 'CONFLICT_DETECTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PUBLISHED = 'PUBLISHED'
}

@Entity({ tableName: 'ingestion_audit_log', schema: 'public' })
class IngestionAuditLog extends BaseEntity {
  @ManyToOne(() => StagingRegulation)
  stagingRegulation!: StagingRegulation;

  @ManyToOne(() => StagingRequirement, { nullable: true })
  stagingRequirement?: StagingRequirement;

  @Enum(() => IngestionAction)
  action!: IngestionAction;

  @Property({ nullable: true })
  actorId?: string;              // User or 'system'

  @Property({ type: 'jsonb', nullable: true })
  details?: object;              // Action-specific data

  @Property({ type: 'timestamptz' })
  timestamp: Date = new Date();
}
```

---

## 6. Approval Workflow

### 6.1 Approval Tiers

| Status | Condition | Approval Required |
|--------|-----------|-------------------|
| ✓ MATCH | Both models agree, confidence ≥95% | Single admin |
| ⚠ LOW_CONFIDENCE | Models agree, confidence <95% | Single admin (flagged review) |
| ✗ CONFLICT | Models disagree on threshold/operator | Dual admin sign-off |

### 6.2 Workflow States

```
┌─────────────┐     Extract      ┌─────────────┐
│   SOURCE    │ ───────────────► │   PENDING   │
│  (URL/PDF)  │                  │  (Staging)  │
└─────────────┘                  └──────┬──────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
            ┌───────────┐       ┌───────────┐       ┌───────────┐
            │   MATCH   │       │ LOW_CONF  │       │ CONFLICT  │
            │ (Auto-OK) │       │ (Review)  │       │ (Dual)    │
            └─────┬─────┘       └─────┬─────┘       └─────┬─────┘
                  │                   │                   │
                  │              Single Admin         Dual Admin
                  │                   │                   │
                  ▼                   ▼                   ▼
            ┌─────────────────────────────────────────────────┐
            │                    APPROVED                      │
            └──────────────────────┬──────────────────────────┘
                                   │
                                   ▼ Publish
            ┌─────────────────────────────────────────────────┐
            │              PRODUCTION TABLES                   │
            │  public.regulation + requirement + category_reg  │
            └─────────────────────────────────────────────────┘
```

### 6.3 Bulk Operations

- **Bulk Approve (MATCH only):** One-click approve all consensus items
- **Bulk Reject:** Remove entire regulation from staging
- **Partial Publish:** Approve 49/50 requirements, flag 1 for later

---

## 7. Admin Review Dashboard

### 7.1 Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  AI Regulation Ingestor                              [Queue: 3 pending]     │
├────────────────────────────────────┬────────────────────────────────────────┤
│                                    │                                        │
│  PDF VIEWER                        │  EXTRACTED REQUIREMENTS                │
│  ────────────                      │  ──────────────────────                │
│                                    │                                        │
│  ┌──────────────────────────────┐  │  ┌────────────────────────────────┐   │
│  │                              │  │  │ ✓ Lead (Entry 63)              │   │
│  │  [EUR-Lex REACH Annex XVII]  │  │  │   CAS: 7439-92-1               │   │
│  │                              │  │  │   Threshold: < 0.05%           │   │
│  │  Entry 63.                   │  │  │   Confidence: 97%              │   │
│  │  ┌─────────────────────────┐ │  │  │   [Approve] [Edit]             │   │
│  │  │ Lead and its compounds  │ │  │  └────────────────────────────────┘   │
│  │  │ shall not be used in    │ │  │                                        │
│  │  │ jewellery articles if   │ │  │  ┌────────────────────────────────┐   │
│  │  │ concentration ≥ 0.05%   │◄├──┤  │ ⚠ Cadmium (Entry 23)           │   │
│  │  │ by weight.              │ │  │  │   CONFLICT DETECTED            │   │
│  │  └─────────────────────────┘ │  │  │   Claude: 0.01%                │   │
│  │                              │  │  │   Gemini: 0.1%                 │   │
│  │                              │  │  │   [Accept Claude] [Accept Gemini]│  │
│  └──────────────────────────────┘  │  └────────────────────────────────┘   │
│                                    │                                        │
├────────────────────────────────────┴────────────────────────────────────────┤
│  REASONING DRAWER                                                           │
│  ────────────────                                                           │
│  "Applied 2024 amendment (EU 2024/1328) which lowered the threshold from   │
│   0.5% to 0.05% for consumer-facing jewelry components accessible to       │
│   children. The previous 0.5% limit in Entry 63 was superseded."           │
│                                                                             │
│  Source: Entry 63, Paragraph 1 (Page 47, highlighted above)                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  [Bulk Approve All ✓] [Publish to Production] [Reject Regulation]           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Key Features

| Feature | Purpose |
|---------|---------|
| **Citation Anchoring** | Click requirement → PDF highlights source paragraph |
| **Conflict Badge** | Red indicator when models disagree |
| **Reasoning Drawer** | Show Claude's Chain-of-Thought for complex interpretations |
| **Bulk Approve** | One-click approve all consensus items |
| **Edit Mode** | Inline editing of threshold, operator, scope |

### 7.3 Citation Anchoring (P4 - Critical)

Claude provides PDF coordinates in extraction. The dashboard:
1. Loads PDF.js viewer
2. On requirement click, scrolls to `page` and draws highlight at `bbox`
3. Enables "Where did the AI find this?" verification

**Without this:** Legal team spends 80% of time searching for citations.
**With this:** Verification becomes a glance.

---

## 8. Implementation Phases

### Phase 0: ECHA Structured Import (Week 1)

**Goal:** Import SVHC and Annex XVII substance lists via API.

**Deliverables:**
- [ ] ECHA API client (XML fetch + parse)
- [ ] Direct mapping to StagingRequirement
- [ ] Auto-approve flow (no LLM validation needed)
- [ ] Basic admin list view

**Files:**
- `packages/ingestor/src/sources/echa-client.ts`
- `packages/ingestor/src/parsers/echa-xml-parser.ts`
- `packages/database/src/entities/StagingRegulation.ts`
- `packages/database/src/entities/StagingRequirement.ts`

### Phase 1: Claude Extraction Service (Week 2-3)

**Goal:** Extract requirements from EUR-Lex PDFs using Claude 4.5.

**Deliverables:**
- [ ] PDF fetcher + text extractor
- [ ] Claude prompt schema implementation
- [ ] Extraction service with retry logic
- [ ] Confidence scoring
- [ ] Category suggestion extraction

**Files:**
- `packages/ingestor/src/services/claude-extractor.ts`
- `packages/ingestor/src/prompts/substance-restriction-prompt.ts`
- `packages/ingestor/src/services/pdf-processor.ts`

### Phase 2: Gemini Shadow + Comparator (Week 3-4)

**Goal:** Dual-model validation pipeline.

**Deliverables:**
- [ ] Gemini Flash extraction client
- [ ] Comparator service (diff logic)
- [ ] Consensus status assignment
- [ ] Conflict flagging

**Files:**
- `packages/ingestor/src/services/gemini-shadow.ts`
- `packages/ingestor/src/services/comparator.ts`

### Phase 3: Admin Review Dashboard (Week 4-5)

**Goal:** Human-in-the-loop review interface.

**Deliverables:**
- [ ] Staging queue list view
- [ ] Dual-pane layout (PDF + requirements)
- [ ] Approve/Edit/Reject actions
- [ ] Bulk approve for consensus items
- [ ] Reasoning drawer

**Files:**
- `apps/web/src/app/admin/ingestor/page.tsx`
- `apps/web/src/components/ingestor/staging-queue.tsx`
- `apps/web/src/components/ingestor/review-panel.tsx`

### Phase 4: Citation Anchoring (Week 5-6) - CRITICAL

**Goal:** Click-to-highlight source citations in PDF.

**Deliverables:**
- [ ] PDF.js integration
- [ ] Coordinate extraction from Claude
- [ ] Highlight overlay rendering
- [ ] Scroll-to-citation on click

**Files:**
- `apps/web/src/components/ingestor/pdf-viewer.tsx`
- `packages/ingestor/src/services/pdf-coordinates.ts`

---

## 9. API Endpoints

### Ingestor Service

```
POST   /api/v1/admin/ingestor/extract
       Body: { sourceUrl: string, sourceType: 'EUR_LEX' | 'ECHA' }
       → Triggers extraction pipeline, returns stagingRegulationId

GET    /api/v1/admin/ingestor/staging
       → List all staging regulations with status counts

GET    /api/v1/admin/ingestor/staging/:id
       → Get staging regulation with all requirements

PATCH  /api/v1/admin/ingestor/staging/:id/requirements/:reqId
       → Edit requirement (threshold, operator, scope)

POST   /api/v1/admin/ingestor/staging/:id/approve
       Body: { requirementIds: string[] }
       → Approve specific requirements

POST   /api/v1/admin/ingestor/staging/:id/publish
       → Move approved requirements to production tables

DELETE /api/v1/admin/ingestor/staging/:id
       → Reject and remove from staging
```

---

## 10. Security & Compliance

### Access Control

- Ingestor endpoints require `platform:admin` role
- Dual approval for conflicts requires two distinct admin users
- All actions logged to `ingestion_audit_log`

### Audit Trail

Every action is logged with:
- Actor (user ID or 'system')
- Timestamp
- Action type (EXTRACTED, VALIDATED, APPROVED, etc.)
- Before/after state for edits

### Legal Defensibility

The audit trail provides:
- **Provenance:** Which model extracted, which user approved
- **Reasoning:** Claude's Chain-of-Thought preserved
- **Citation:** Exact PDF coordinates for source text
- **Timestamps:** Full timeline of extraction → approval → publish

---

## 11. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to ingest regulation | <3 hours (vs 3 weeks) | Extraction start → publish |
| Auto-approval rate | >80% | MATCH / total requirements |
| Conflict rate | <5% | CONFLICT / total requirements |
| Human review time | <10 min per regulation | Dashboard session duration |
| Error rate post-publish | <0.5% | Corrections needed / published |

---

## 12. Future Extensions

### Tag Engine Integration

Once requirements have `suggestedCategories`, the Tag Engine can:
- Auto-suggest regulations to tenants based on their adopted categories
- Notify tenants: "New regulation detected for your products"

### Tenant Self-Service

The same extraction pipeline can power tenant custom rules:
- Tenant uploads internal policy PDF
- Claude extracts requirements
- Tenant reviews and approves to their schema

### Crowdsource Promotion

Track tenant-created requirements:
- If 10+ tenants create similar rules, flag for platform promotion
- One-click promote to system standard

---

## Appendix: Comparison Operators

```typescript
enum ComparisonOperator {
  GT = 'GT',           // Greater than
  GTE = 'GTE',         // Greater than or equal
  LT = 'LT',           // Less than
  LTE = 'LTE',         // Less than or equal
  EQ = 'EQ',           // Equal to
  PRESENT = 'PRESENT', // Substance must be present
  ABSENT = 'ABSENT'    // Substance must be absent (banned)
}
```

---

*Design validated: 2026-01-29*
*Authors: PM + Claude (Brainstorming Skill)*
