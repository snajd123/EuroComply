# AI Regulation Ingestor Guide

> A comprehensive guide to EuroComply's AI-powered regulation extraction and review system.

## Overview

The AI Regulation Ingestor automates the extraction of compliance requirements from regulatory documents (EU REACH, ESPR, ECHA publications). It uses a dual-AI architecture for accuracy validation and provides a human-in-the-loop review workflow before publishing to production.

### Key Features

- **Dual-AI Extraction**: Claude (primary) + Gemini (shadow validation)
- **PDF-Aware Processing**: Native PDF support with citation coordinates
- **Consensus Detection**: Automatic flagging of disagreements between models
- **Per-Requirement Approval**: Granular review workflow
- **Full Audit Trail**: Legal defensibility for regulatory submissions
- **Citation Anchoring**: Click requirements to highlight source in PDF

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         EXTRACTION PIPELINE                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Source Document                                                        │
│   (PDF / Text / URL)                                                     │
│          │                                                               │
│          ▼                                                               │
│   ┌──────────────┐      ┌──────────────┐                                │
│   │    Claude    │      │    Gemini    │    Parallel Extraction         │
│   │  (Primary)   │      │   (Shadow)   │                                │
│   │              │      │              │                                │
│   │ • Full data  │      │ • CAS only   │                                │
│   │ • Reasoning  │      │ • Threshold  │                                │
│   │ • Coords     │      │ • Unit       │                                │
│   └──────┬───────┘      └──────┬───────┘                                │
│          │                     │                                         │
│          └─────────┬───────────┘                                         │
│                    ▼                                                     │
│             ┌─────────────┐                                              │
│             │  Comparator │    Unit normalization + threshold check     │
│             └──────┬──────┘                                              │
│                    │                                                     │
│                    ▼                                                     │
│   ┌────────────────────────────────────────────────────────────────┐    │
│   │                    Consensus Status                             │    │
│   ├────────────┬────────────┬─────────────────┬───────────────────┤    │
│   │   MATCH    │  CONFLICT  │ LOW_CONFIDENCE  │  SHADOW_MISSING   │    │
│   │  (green)   │   (red)    │    (yellow)     │      (gray)       │    │
│   └────────────┴────────────┴─────────────────┴───────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          STAGING TABLES                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   StagingRegulation              StagingRequirement                     │
│   ├─ code                        ├─ substanceName                       │
│   ├─ name                        ├─ casNumber                           │
│   ├─ sourceUrl                   ├─ thresholdValue                      │
│   ├─ sourceType                  ├─ operator (LT, LTE, EQ...)          │
│   ├─ pdfFileId ──────────────►   ├─ unit                                │
│   ├─ status                      ├─ pdfCoordinates {page, bbox}         │
│   └─ requirements[]              ├─ consensusStatus                     │
│                                  ├─ confidenceScore                     │
│                                  ├─ reasoning                           │
│                                  └─ isApproved                          │
│                                                                          │
│   IngestionAuditLog                                                     │
│   ├─ action (EXTRACTED, APPROVED, EDITED, PUBLISHED)                    │
│   ├─ actorId                                                            │
│   ├─ details {before, after}                                            │
│   └─ timestamp                                                          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         ADMIN REVIEW UI                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────────────────────┬─────────────────────────────────────┐     │
│   │      PDF Viewer         │       Requirements List             │     │
│   │                         │                                     │     │
│   │   [highlighted bbox]    │   [MATCH] Lead - CAS 7439-92-1     │     │
│   │                         │   < 0.05% by weight                 │     │
│   │   Page 5 of 12          │   Page 5  [Approve] [Edit]         │     │
│   │                         │                                     │     │
│   │                         │   [CONFLICT] Cadmium               │     │
│   │                         │   Claude: 0.01% | Gemini: 0.001%   │     │
│   │                         │   [View Reasoning] [Edit]          │     │
│   │                         │                                     │     │
│   └─────────────────────────┴─────────────────────────────────────┘     │
│                                                                          │
│   [Bulk Approve MATCH]                    [Publish to Production]       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Workflow

### 1. Extract Regulation

**Via Admin UI** (`/admin/ingestor`):

1. Click "New Extraction"
2. Choose input method:
   - **From URL**: Paste EUR-Lex or ECHA URL + document text
   - **Paste Text**: Manual text entry with source type selection
   - **Upload PDF**: Drag-and-drop or browse (max 32MB)
3. Click "Extract"

**Via API**:

```bash
# Upload PDF first
curl -X POST /api/v1/admin/ingestor/upload/pdf \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -F "file=@regulation.pdf"

# Response: { "data": { "fileId": "abc123..." } }

# Then extract
curl -X POST /api/v1/admin/ingestor/extract \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "fileId": "abc123...",
    "sourceType": "EUR_LEX"
  }'
```

### 2. Review Requirements

Navigate to the staging regulation detail page:

1. **Check Consensus Badges**:
   - **MATCH** (green): Both models agree, high confidence - safe to bulk approve
   - **CONFLICT** (red): Threshold disagreement - requires manual review
   - **LOW_CONFIDENCE** (yellow): Models agree but confidence < 95%
   - **SHADOW_MISSING** (gray): No Gemini validation (common for PDFs)

2. **Review Conflicts**:
   - Click requirement to see conflict details
   - View Claude's reasoning (Chain-of-Thought explanation)
   - Check PDF source by clicking to highlight

3. **Edit if Needed**:
   - Adjust threshold value
   - Change operator (LT, LTE, EQ, etc.)
   - Modify unit
   - Update scope

4. **Approve**:
   - Individual: Click "Approve" on each requirement
   - Bulk: Click "Bulk Approve MATCH" for all green items

### 3. Publish to Production

Once all requirements are approved:

1. Click "Publish to Production"
2. Confirm in modal
3. System:
   - Creates production `Regulation` and `Requirement` records
   - Links CAS numbers to existing `Substance` records
   - Updates staging status to `PUBLISHED`
   - Logs `PUBLISHED` audit action

---

## Consensus Status Explained

| Status | Color | Meaning | Action |
|--------|-------|---------|--------|
| MATCH | Green | Both models agree, confidence ≥ 95% | Safe to approve |
| CONFLICT | Red | Threshold values differ beyond tolerance (1 ppm) | Manual review required |
| LOW_CONFIDENCE | Yellow | Models agree but confidence < 95% | Review reasoning |
| SHADOW_MISSING | Gray | No Gemini validation (PDF or structured data) | Review manually |

### Unit Normalization

The comparator normalizes all units to PPM before comparison:

| Unit | Conversion |
|------|------------|
| PERCENT_BY_WEIGHT | × 10,000 |
| PPM | × 1 |
| MG_KG | × 1 |
| UG_KG | ÷ 1,000 |

Example: `0.01% by weight` = `100 ppm` = `100 mg/kg`

---

## API Reference

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/ingestor/upload/pdf` | Upload PDF file |
| GET | `/admin/ingestor/upload/pdf/:fileId` | Retrieve PDF |
| POST | `/admin/ingestor/extract` | Trigger extraction |
| GET | `/admin/ingestor/staging` | List staging regulations |
| GET | `/admin/ingestor/staging/:id` | Get regulation detail |
| PATCH | `/admin/ingestor/staging/:id/requirements/:reqId` | Edit requirement |
| POST | `/admin/ingestor/staging/:id/approve` | Approve requirements |
| POST | `/admin/ingestor/staging/:id/bulk-approve` | Bulk approve MATCH |
| POST | `/admin/ingestor/staging/:id/publish` | Publish to production |
| DELETE | `/admin/ingestor/staging/:id` | Reject regulation |

### Extract Request

```typescript
{
  // Text-based extraction
  sourceUrl?: string,           // Source document URL
  sourceType: 'EUR_LEX' | 'ECHA' | 'MANUAL',
  documentText?: string,        // Document text to extract

  // OR PDF-based extraction
  fileId?: string,              // Uploaded PDF file ID
  sourceType: 'EUR_LEX' | 'ECHA' | 'MANUAL',
}
```

### Extract Response

```typescript
{
  "success": true,
  "data": {
    "stagingRegulationId": "clx...",
    "regulationCode": "REACH_ANNEX_XVII_ENTRY_63",
    "regulationName": "REACH Annex XVII Entry 63 - Lead",
    "requirementCount": 15,
    "consensusSummary": {
      "match": 12,
      "conflict": 1,
      "lowConfidence": 1,
      "shadowMissing": 1
    }
  }
}
```

### Staging Regulation Response

```typescript
{
  "id": "clx...",
  "code": "REACH_ANNEX_XVII_ENTRY_63",
  "name": "REACH Annex XVII Entry 63 - Lead",
  "sourceUrl": "https://eur-lex.europa.eu/...",
  "sourceType": "EUR_LEX",
  "pdfFileId": "abc123...",
  "status": "PENDING",
  "requirements": [
    {
      "id": "req...",
      "code": "REQ_1",
      "substanceName": "Lead",
      "casNumber": "7439-92-1",
      "operator": "LT",
      "thresholdValue": 0.05,
      "unit": "PERCENT_BY_WEIGHT",
      "scope": ["Jewellery", "Hair accessories"],
      "legalReference": "Entry 63, paragraph 1",
      "pdfCoordinates": { "page": 5, "bbox": [100, 200, 400, 250] },
      "consensusStatus": "MATCH",
      "confidenceScore": 0.97,
      "reasoning": "The regulation states...",
      "isApproved": false
    }
  ]
}
```

---

## PDF Coordinate System

When extracting from PDFs, Claude returns `pdfCoordinates`:

```typescript
{
  page: number,    // 1-indexed page number
  bbox: [x1, y1, x2, y2]  // Bounding box in PDF points
}
```

**PDF Coordinate System**:
- Origin: Bottom-left corner of page
- Units: PDF points (72 points = 1 inch)
- `x1, y1`: Bottom-left of bounding box
- `x2, y2`: Top-right of bounding box

The PdfViewer component automatically converts these to canvas coordinates for highlighting.

---

## Comparison Operators

| Operator | Meaning | Example |
|----------|---------|---------|
| LT | Less than | `< 0.05%` |
| LTE | Less than or equal | `≤ 0.05%` |
| GT | Greater than | `> 10 ppm` |
| GTE | Greater than or equal | `≥ 10 ppm` |
| EQ | Equal to | `= 0` |
| PRESENT | Must be present | Labeling requirement |
| ABSENT | Must be absent | Banned substance |

---

## Audit Trail

Every action is logged with full details:

| Action | Details Logged |
|--------|---------------|
| EXTRACTED | Source URL, source type, requirement count |
| EDITED | Before/after values for each changed field |
| APPROVED | Requirement ID, approver ID |
| REJECTED | Rejection reason |
| PUBLISHED | Published regulation ID |

Example edit log:
```json
{
  "action": "EDITED",
  "actorId": "user_123",
  "details": {
    "before": { "thresholdValue": 0.05, "unit": "PERCENT_BY_WEIGHT" },
    "after": { "thresholdValue": 0.01, "unit": "PERCENT_BY_WEIGHT" }
  }
}
```

---

## Configuration

### Environment Variables

```bash
# Claude API
ANTHROPIC_API_KEY=sk-ant-...

# Gemini API
GEMINI_API_KEY=AIza...

# File uploads
UPLOADS_DIR=/path/to/uploads/pdfs  # Default: ./uploads/pdfs
```

### Limits

| Limit | Value |
|-------|-------|
| Max PDF size | 32 MB |
| Max token limit | ~200K (Claude's limit) |
| Confidence threshold | 95% |
| Comparison tolerance | 1 ppm |

---

## Troubleshooting

### Common Issues

**"Token limit exceeded"**
- PDF is too large (>100 pages or image-heavy)
- Solution: Split into smaller documents or extract text first

**"CONFLICT" on most requirements**
- Gemini may be misinterpreting the document
- Check if units are being parsed correctly
- Review Claude's reasoning for accuracy

**"SHADOW_MISSING" on all requirements**
- Normal for PDF extractions (Gemini doesn't support native PDF)
- Review requirements manually

**PDF viewer not highlighting**
- Check if `pdfCoordinates` exist on the requirement
- Verify page number is within document range
- Check bbox values are reasonable (not negative or huge)

### Debug Extraction

To see raw extraction results:

```bash
# Check staging regulation payload
curl /api/v1/admin/ingestor/staging/:id \
  -H "X-Admin-Key: $ADMIN_KEY"

# Look at primaryPayload (Claude) and shadowPayload (Gemini)
```

---

## Best Practices

1. **Review CONFLICT items first** - These are most likely to have errors
2. **Use bulk approve for MATCH** - Save time on verified extractions
3. **Check PDF citations** - Verify the highlighted text matches the requirement
4. **Read Claude's reasoning** - Understand why thresholds were interpreted
5. **Edit conservatively** - Document changes in the audit trail
6. **Publish incrementally** - You can publish approved requirements while conflicts remain in staging

---

## Related Documentation

- [Compliance Architecture](../architecture/compliance-architecture.md)
- [Compliance Evaluation System](../guides/compliance-evaluation-system.md)
- [API Reference](../api/ingestor-endpoints.md)
