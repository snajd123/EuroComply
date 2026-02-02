# PDF-Aware Extraction with Citation Anchoring

> **For Claude:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Fix the extraction pipeline to send actual PDFs to Claude (not extracted text), store PDFs for viewing, and build a PDF viewer with click-to-highlight citation anchoring.

**Architecture:** Frontend uploads PDF file to API → API stores PDF locally and sends base64 to Claude → Claude returns real page/bbox coordinates → Admin dashboard shows split-pane PDF viewer with requirement list → Click requirement to highlight source in PDF.

**Tech Stack:** Claude API (document content blocks with base64 PDF), Multer (file upload), PDF.js (viewer), React (components), local filesystem storage.

---

## Current State (Broken)

```
PDF → Frontend extracts text (PDF.js) → Plain text to API → Claude → Fake coordinates
                    ↑
            Coordinates lost here
```

## Target State (Fixed)

```
PDF → Frontend uploads file → API stores PDF → Base64 to Claude → Real coordinates
                                    ↓
                            PDF Viewer ← Click requirement → Highlight at bbox
```

---

## Constraints

| Constraint | Value |
|------------|-------|
| Max PDF size | 32MB |
| Max pages | 100 per request |
| Storage | Local filesystem (`uploads/pdfs/`) |
| Token limit | ~200K (large PDFs need chunking - out of scope) |

---

## Tasks

### Task 1: Add PDF Upload Endpoint

**Files:**
- Create: `apps/api/src/routes/admin/ingestor-upload.ts`
- Modify: `apps/api/src/routes/admin/ingestor.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/routes/admin/ingestor-upload.test.ts`

**Step 1: Install multer for file uploads**

```bash
cd /root/Documents/EuroComply/apps/api && pnpm add multer && pnpm add -D @types/multer
```

**Step 2: Create uploads directory**

```bash
mkdir -p /root/Documents/EuroComply/apps/api/uploads/pdfs
echo "uploads/" >> /root/Documents/EuroComply/apps/api/.gitignore
```

**Step 3: Write the failing test**

```typescript
// apps/api/src/routes/admin/ingestor-upload.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import fs from 'fs';
import path from 'path';
import { createUploadRouter } from './ingestor-upload.js';
import type { Env } from '../../app.js';

describe('PDF Upload Endpoint', () => {
  const testUploadsDir = '/tmp/test-uploads-pdfs';

  beforeAll(() => {
    fs.mkdirSync(testUploadsDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(testUploadsDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Clean uploads between tests
    const files = fs.readdirSync(testUploadsDir);
    for (const file of files) {
      fs.unlinkSync(path.join(testUploadsDir, file));
    }
  });

  function createTestApp() {
    const app = new Hono<Env>();
    app.route('/upload', createUploadRouter({ uploadsDir: testUploadsDir }));
    return app;
  }

  it('should_reject_non_pdf_files', async () => {
    const app = createTestApp();

    const formData = new FormData();
    formData.append('file', new Blob(['not a pdf'], { type: 'text/plain' }), 'test.txt');

    const res = await app.request('/upload/pdf', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('BAD_REQUEST');
  });

  it('should_accept_pdf_and_return_file_id', async () => {
    const app = createTestApp();

    // Create a minimal valid PDF
    const pdfContent = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
    const formData = new FormData();
    formData.append('file', new Blob([pdfContent], { type: 'application/pdf' }), 'test.pdf');

    const res = await app.request('/upload/pdf', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.fileId).toBeDefined();
    expect(data.data.filename).toContain('.pdf');
  });
});
```

**Step 4: Run test to verify it fails**

```bash
cd /root/Documents/EuroComply/apps/api && pnpm test -- --run src/routes/admin/ingestor-upload.test.ts
```

Expected: FAIL (module not found)

**Step 5: Implement the upload router**

```typescript
// apps/api/src/routes/admin/ingestor-upload.ts
import { Hono } from 'hono';
import { createId } from '@paralleldrive/cuid2';
import fs from 'fs';
import path from 'path';
import type { Env } from '../../app.js';
import { success, error } from '../../utils/response.js';

export interface UploadRouterOptions {
  uploadsDir: string;
}

const MAX_FILE_SIZE = 32 * 1024 * 1024; // 32MB (Claude's limit)

export function createUploadRouter(options: UploadRouterOptions): Hono<Env> {
  const { uploadsDir } = options;
  const router = new Hono<Env>();

  // Ensure uploads directory exists
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  /**
   * POST /pdf
   * Upload a PDF file for extraction
   */
  router.post('/pdf', async (c) => {
    const contentType = c.req.header('content-type') || '';

    if (!contentType.includes('multipart/form-data')) {
      return error(c, 'BAD_REQUEST', 'Expected multipart/form-data', 400);
    }

    const formData = await c.req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return error(c, 'BAD_REQUEST', 'No file provided', 400);
    }

    // Validate file type
    if (file.type !== 'application/pdf') {
      return error(c, 'BAD_REQUEST', 'Only PDF files are accepted', 400);
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return error(c, 'BAD_REQUEST', `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`, 400);
    }

    // Generate unique filename
    const fileId = createId();
    const filename = `${fileId}.pdf`;
    const filepath = path.join(uploadsDir, filename);

    // Save file
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(filepath, buffer);

    return success(c, {
      fileId,
      filename,
      size: file.size,
      originalName: file.name,
    }, { status: 201 });
  });

  /**
   * GET /pdf/:fileId
   * Get PDF file info or serve the file
   */
  router.get('/pdf/:fileId', async (c) => {
    const { fileId } = c.req.param();
    const filename = `${fileId}.pdf`;
    const filepath = path.join(uploadsDir, filename);

    if (!fs.existsSync(filepath)) {
      return error(c, 'NOT_FOUND', 'PDF not found', 404);
    }

    const stats = fs.statSync(filepath);

    // Check if requesting file content or metadata
    const accept = c.req.header('accept') || '';
    if (accept.includes('application/pdf')) {
      // Serve the actual PDF
      const content = fs.readFileSync(filepath);
      return new Response(content, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': stats.size.toString(),
        },
      });
    }

    // Return metadata
    return success(c, {
      fileId,
      filename,
      size: stats.size,
      createdAt: stats.birthtime.toISOString(),
    });
  });

  return router;
}
```

**Step 6: Run test to verify it passes**

```bash
cd /root/Documents/EuroComply/apps/api && pnpm test -- --run src/routes/admin/ingestor-upload.test.ts
```

**Step 7: Register the upload router in app.ts**

Add to `apps/api/src/app.ts` after other admin routes:

```typescript
import { createUploadRouter } from './routes/admin/ingestor-upload.js';

// In createApp function, add:
const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads/pdfs');
adminRouter.route('/ingestor/upload', createUploadRouter({ uploadsDir }));
```

**Step 8: Commit**

```bash
git add -A && git commit -m "feat(api): add PDF upload endpoint for ingestor"
```

---

### Task 2: Update ClaudeExtractor to Accept PDF Buffer

**Files:**
- Modify: `packages/ingestor/src/services/ClaudeExtractor.ts`
- Modify: `packages/ingestor/src/types/extraction.ts`
- Test: `packages/ingestor/src/services/ClaudeExtractor.test.ts`

**Step 1: Write the failing test**

```typescript
// Add to ClaudeExtractor.test.ts
describe('extractFromPdf', () => {
  it('should_send_pdf_as_base64_document_block', async () => {
    // This test verifies the API call structure, not actual extraction
    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{
            type: 'text',
            text: '<extraction_results>{"regulationMetadata":{"code":"TEST","name":"Test"},"requirements":[],"extractionMetadata":{}}</extraction_results>'
          }]
        })
      }
    };

    const extractor = new ClaudeExtractor({ apiKey: 'test-key' });
    // @ts-expect-error - accessing private for test
    extractor.client = mockClient;

    const pdfBuffer = Buffer.from('%PDF-1.4 test content');
    await extractor.extractFromPdf(pdfBuffer, 'test.pdf');

    expect(mockClient.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                type: 'document',
                source: expect.objectContaining({
                  type: 'base64',
                  media_type: 'application/pdf',
                })
              })
            ])
          })
        ])
      })
    );
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /root/Documents/EuroComply/packages/ingestor && pnpm test -- --run src/services/ClaudeExtractor.test.ts
```

**Step 3: Implement extractFromPdf method**

```typescript
// Add to ClaudeExtractor.ts

/**
 * Extracts structured requirements from a PDF document using Claude's native PDF support.
 *
 * Unlike extract(), this method sends the actual PDF to Claude, allowing it to
 * return accurate page numbers and bounding box coordinates for citations.
 */
async extractFromPdf(pdfBuffer: Buffer, sourceIdentifier: string): Promise<ExtractionResult> {
  const pdfBase64 = pdfBuffer.toString('base64');

  const response = await this.client.messages.create({
    model: this.model,
    max_tokens: MAX_EXTRACTION_TOKENS,
    system: SUBSTANCE_RESTRICTION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBase64,
            },
          },
          {
            type: 'text',
            text: createPdfExtractionPrompt(sourceIdentifier),
          },
        ],
      },
    ],
  });

  const textContent = response.content.find((block) => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text content in Claude response');
  }

  return this.parseExtractionResponse(textContent.text);
}
```

**Step 4: Add the PDF extraction prompt**

```typescript
// Add to packages/ingestor/src/prompts/substance-restriction-prompt.ts

export function createPdfExtractionPrompt(sourceIdentifier: string): string {
  return `Extract all substance restrictions from this PDF document.

Source identifier: ${sourceIdentifier}

IMPORTANT: For each requirement, provide accurate PDF coordinates:
- "page": The 1-indexed page number where this requirement appears
- "bbox": The bounding box [x1, y1, x2, y2] in PDF points (72 points = 1 inch)
  - x1, y1: top-left corner
  - x2, y2: bottom-right corner
  - Origin is bottom-left of page

These coordinates will be used to highlight the source text in a PDF viewer, so accuracy is critical.

Return the extraction in the same XML-wrapped JSON format as specified in your instructions.`;
}
```

**Step 5: Run test to verify it passes**

```bash
cd /root/Documents/EuroComply/packages/ingestor && pnpm test -- --run src/services/ClaudeExtractor.test.ts
```

**Step 6: Rebuild the package**

```bash
pnpm --filter @eurocomply/ingestor build
```

**Step 7: Commit**

```bash
git add -A && git commit -m "feat(ingestor): add extractFromPdf method using Claude's native PDF support"
```

---

### Task 3: Update Extract API Endpoint

**Files:**
- Modify: `apps/api/src/routes/admin/ingestor.ts`
- Modify: `apps/api/src/routes/admin/ingestor.integration.test.ts`

**Step 1: Update extract schema to accept fileId**

```typescript
// In ingestor.ts, update extractSchema:
const extractSchema = z.object({
  sourceUrl: z.string().min(1).optional(),
  sourceType: z.enum(['EUR_LEX', 'ECHA', 'MANUAL']),
  documentText: z.string().min(1).optional(),
  fileId: z.string().min(1).optional(),
}).refine(
  data => data.documentText || data.fileId,
  { message: 'Either documentText or fileId is required' }
);
```

**Step 2: Update the extract handler to support PDF files**

```typescript
// In the POST /extract handler, add fileId support:

// Check if using PDF file
if (body.fileId) {
  const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads/pdfs');
  const filepath = path.join(uploadsDir, `${body.fileId}.pdf`);

  if (!fs.existsSync(filepath)) {
    return error(c, 'NOT_FOUND', 'PDF file not found', 404);
  }

  const pdfBuffer = fs.readFileSync(filepath);

  // Use PDF extraction
  const { result, stagingRegulationId } = await pipeline.ingestFromPdf(
    pdfBuffer,
    body.sourceUrl || body.fileId,
    body.sourceType,
    userId
  );

  // ... rest of response handling
}
```

**Step 3: Write integration test**

```typescript
// Add to ingestor.integration.test.ts
it('should_extract_from_uploaded_pdf_file', async (ctx) => {
  if (!(await isDatabaseAvailable())) {
    ctx.skip();
    return;
  }

  // Create a test PDF file
  const testUploadsDir = '/tmp/test-ingestor-uploads';
  fs.mkdirSync(testUploadsDir, { recursive: true });
  const fileId = 'test-pdf-123';
  const pdfContent = Buffer.from('%PDF-1.4 test');
  fs.writeFileSync(path.join(testUploadsDir, `${fileId}.pdf`), pdfContent);

  // Create stub extractors
  const stubClaudeExtractor = {
    extractFromPdf: async () => ({
      regulationMetadata: {
        code: 'PDF-TEST',
        name: 'PDF Test Regulation',
        sourceUrl: null,
      },
      requirements: [{
        substanceName: 'Lead',
        casNumber: '7439-92-1',
        thresholdValue: 0.05,
        unit: 'PERCENT_BY_WEIGHT',
        operator: 'LT',
        legalReference: 'Entry 63',
        pdfCoordinates: { page: 1, bbox: [100, 200, 400, 250] },
        confidenceScore: 0.97,
        reasoning: 'Test',
      }],
      extractionMetadata: {},
    }),
  } as unknown as ClaudeExtractor;

  // ... test the endpoint with fileId
});
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat(api): support PDF file extraction via fileId"
```

---

### Task 4: Update IngestionPipeline for PDF

**Files:**
- Modify: `packages/ingestor/src/services/IngestionPipeline.ts`
- Test: `packages/ingestor/src/services/IngestionPipeline.integration.test.ts`

**Step 1: Add ingestFromPdf method**

```typescript
// Add to IngestionPipeline.ts

/**
 * Runs ingestion from a PDF file and saves to staging tables.
 * Uses Claude's native PDF support for accurate coordinate extraction.
 */
async ingestFromPdf(
  pdfBuffer: Buffer,
  sourceIdentifier: string,
  sourceType: 'EUR_LEX' | 'ECHA' | 'MANUAL',
  actorId: string
): Promise<{
  result: IngestionResult;
  stagingRegulationId: string;
}> {
  if (!this.em) {
    throw new Error('EntityManager required for staging');
  }

  // Extract from PDF (Claude sees actual pages)
  const extraction = await this.claudeExtractor.extractFromPdf(pdfBuffer, sourceIdentifier);

  // Shadow extraction still uses text (Gemini doesn't have PDF support)
  // Extract text from PDF for shadow validation
  const documentText = await this.extractTextFromPdf(pdfBuffer);
  const shadow = await this.geminiShadow.extract(documentText);

  // Compare results
  const comparisons = this.comparator.compare(extraction.requirements, shadow);

  const result: IngestionResult = { extraction, shadow, comparisons };

  // ... rest of staging logic (same as ingestAndStage)
}

/**
 * Extracts text from PDF for shadow validation.
 * Uses pdf-parse library.
 */
private async extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  const pdfParse = await import('pdf-parse');
  const data = await pdfParse.default(pdfBuffer);
  return data.text;
}
```

**Step 2: Add pdf-parse dependency**

```bash
cd /root/Documents/EuroComply/packages/ingestor && pnpm add pdf-parse && pnpm add -D @types/pdf-parse
```

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(ingestor): add ingestFromPdf pipeline method"
```

---

### Task 5: Update StagingRegulation to Store PDF Reference

**Files:**
- Modify: `packages/database/src/entities/StagingRegulation.ts`
- Create migration or update existing

**Step 1: Add pdfFileId column**

```typescript
// Add to StagingRegulation.ts

/**
 * File ID of the uploaded PDF (for citation viewing)
 */
@Property({ type: 'text', nullable: true, name: 'pdf_file_id' })
pdfFileId?: string;
```

**Step 2: Update migration**

```sql
ALTER TABLE staging_regulation ADD COLUMN pdf_file_id TEXT;
```

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(database): add pdfFileId to StagingRegulation"
```

---

### Task 6: Update Frontend Extract Modal

**Files:**
- Modify: `apps/web/src/components/ingestor/ExtractModal.tsx`
- Modify: `apps/web/src/lib/api.ts`

**Step 1: Change PDF tab to upload file instead of extracting text**

```typescript
// In ExtractModal.tsx, update the PDF handling:

const handlePdfFile = async (file: File) => {
  if (!file.type.includes('pdf')) {
    setPdfError('Please select a PDF file');
    return;
  }

  setPdfFile(file);
  setPdfLoading(true);
  setPdfError(null);

  try {
    // Upload PDF to server instead of extracting text locally
    const result = await ingestorApi.uploadPdf(file);
    setPdfFileId(result.fileId);
    setPdfLoading(false);
  } catch (err) {
    setPdfError(err instanceof Error ? err.message : 'Failed to upload PDF');
    setPdfFile(null);
    setPdfLoading(false);
  }
};

// Update handleExtract to use fileId:
const handleExtract = async () => {
  // ... validation

  if (activeTab === 'pdf') {
    params = {
      fileId: pdfFileId,
      sourceType: 'MANUAL',
    };
  }

  // ... rest of extract logic
};
```

**Step 2: Add uploadPdf to API client**

```typescript
// In apps/web/src/lib/api.ts

uploadPdf: async (file: File): Promise<{ fileId: string }> => {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/admin/ingestor/upload/pdf`, {
    method: 'POST',
    headers: {
      'X-Admin-Key': getAdminKey(),
    },
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error?.message || 'Upload failed');
  }

  const data = await res.json();
  return data.data;
},
```

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(web): upload PDF files instead of client-side text extraction"
```

---

### Task 7: Build PDF Viewer Component

**Files:**
- Create: `apps/web/src/components/ingestor/PdfViewer.tsx`
- Modify: `apps/web/src/app/admin/ingestor/page.tsx`

**Step 1: Create PDF viewer with highlight support**

```typescript
// apps/web/src/components/ingestor/PdfViewer.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface PdfCoordinates {
  page: number;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
}

interface PdfViewerProps {
  fileId: string;
  highlightCoordinates?: PdfCoordinates;
  onPageChange?: (page: number) => void;
}

export function PdfViewer({ fileId, highlightCoordinates, onPageChange }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.5);

  // Load PDF
  useEffect(() => {
    const loadPdf = async () => {
      const url = `/api/v1/admin/ingestor/upload/pdf/${fileId}`;
      const loadingTask = pdfjs.getDocument(url);
      const pdfDoc = await loadingTask.promise;
      setPdf(pdfDoc);
      setTotalPages(pdfDoc.numPages);
    };

    loadPdf();
  }, [fileId]);

  // Render page with highlight
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;

    const renderPage = async () => {
      const page = await pdf.getPage(currentPage);
      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current!;
      const context = canvas.getContext('2d')!;
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({
        canvasContext: context,
        viewport,
      }).promise;

      // Draw highlight if on this page
      if (highlightCoordinates && highlightCoordinates.page === currentPage) {
        const [x1, y1, x2, y2] = highlightCoordinates.bbox;

        // Convert PDF coordinates to canvas coordinates
        // PDF origin is bottom-left, canvas is top-left
        const canvasX1 = x1 * scale;
        const canvasY1 = (viewport.height / scale - y2) * scale;
        const width = (x2 - x1) * scale;
        const height = (y2 - y1) * scale;

        context.fillStyle = 'rgba(255, 255, 0, 0.3)';
        context.fillRect(canvasX1, canvasY1, width, height);
        context.strokeStyle = 'rgba(255, 200, 0, 0.8)';
        context.lineWidth = 2;
        context.strokeRect(canvasX1, canvasY1, width, height);
      }
    };

    renderPage();
  }, [pdf, currentPage, scale, highlightCoordinates]);

  // Jump to highlight page when coordinates change
  useEffect(() => {
    if (highlightCoordinates) {
      setCurrentPage(highlightCoordinates.page);
    }
  }, [highlightCoordinates]);

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center gap-4 p-2 bg-gray-100 border-b">
        <button
          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          disabled={currentPage <= 1}
          className="px-2 py-1 bg-white border rounded disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-sm">
          Page {currentPage} of {totalPages}
        </span>
        <button
          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          disabled={currentPage >= totalPages}
          className="px-2 py-1 bg-white border rounded disabled:opacity-50"
        >
          Next
        </button>
        <select
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
          className="px-2 py-1 border rounded"
        >
          <option value={1}>100%</option>
          <option value={1.5}>150%</option>
          <option value={2}>200%</option>
        </select>
      </div>

      {/* PDF Canvas */}
      <div className="flex-1 overflow-auto p-4 bg-gray-200">
        <canvas ref={canvasRef} className="mx-auto shadow-lg" />
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat(web): add PdfViewer component with highlight support"
```

---

### Task 8: Build Split-Pane Review Layout

**Files:**
- Modify: `apps/web/src/app/admin/ingestor/[id]/page.tsx`

**Step 1: Create split-pane review page**

```typescript
// apps/web/src/app/admin/ingestor/[id]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { PdfViewer } from '@/components/ingestor/PdfViewer';
import { ingestorApi, StagingRegulation, StagingRequirement } from '@/lib/api';

export default function ReviewPage() {
  const params = useParams();
  const id = params.id as string;

  const [regulation, setRegulation] = useState<StagingRegulation | null>(null);
  const [selectedRequirement, setSelectedRequirement] = useState<StagingRequirement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const data = await ingestorApi.getStagingRegulation(id);
      setRegulation(data);
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) return <div className="p-8">Loading...</div>;
  if (!regulation) return <div className="p-8">Not found</div>;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="p-4 border-b bg-white">
        <h1 className="text-xl font-bold">{regulation.name}</h1>
        <p className="text-gray-600">{regulation.code}</p>
      </div>

      {/* Split pane */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: PDF Viewer */}
        <div className="w-1/2 border-r">
          {regulation.pdfFileId ? (
            <PdfViewer
              fileId={regulation.pdfFileId}
              highlightCoordinates={selectedRequirement?.pdfCoordinates}
            />
          ) : (
            <div className="p-8 text-gray-500">No PDF available</div>
          )}
        </div>

        {/* Right: Requirements List */}
        <div className="w-1/2 overflow-auto">
          <div className="p-4">
            <h2 className="text-lg font-semibold mb-4">
              Requirements ({regulation.requirements.length})
            </h2>

            <div className="space-y-3">
              {regulation.requirements.map((req) => (
                <div
                  key={req.id}
                  onClick={() => setSelectedRequirement(req)}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedRequirement?.id === req.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ConsensusStatusBadge status={req.consensusStatus} />
                    <span className="font-medium">{req.substanceName || req.name}</span>
                  </div>
                  {req.casNumber && (
                    <p className="text-sm text-gray-600 mt-1">CAS: {req.casNumber}</p>
                  )}
                  {req.thresholdValue && (
                    <p className="text-sm text-gray-600">
                      {req.operator} {req.thresholdValue} {req.unit}
                    </p>
                  )}
                  {req.pdfCoordinates && (
                    <p className="text-xs text-gray-400 mt-1">
                      Page {req.pdfCoordinates.page}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 mt-3">
                    {!req.isApproved && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApprove(req.id);
                        }}
                        className="px-3 py-1 text-sm bg-green-500 text-white rounded"
                      >
                        Approve
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingRequirement(req);
                      }}
                      className="px-3 py-1 text-sm bg-gray-200 rounded"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConsensusStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    MATCH: 'bg-green-100 text-green-800',
    CONFLICT: 'bg-red-100 text-red-800',
    LOW_CONFIDENCE: 'bg-yellow-100 text-yellow-800',
    SHADOW_MISSING: 'bg-gray-100 text-gray-800',
  };

  return (
    <span className={`px-2 py-0.5 text-xs rounded ${colors[status] || colors.SHADOW_MISSING}`}>
      {status}
    </span>
  );
}
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat(web): add split-pane review page with citation anchoring"
```

---

### Task 9: Integration Testing

**Files:**
- Test: `apps/api/src/routes/admin/ingestor.e2e.test.ts`

**Step 1: Write end-to-end test for the full flow**

```typescript
// apps/api/src/routes/admin/ingestor.e2e.test.ts
describe('PDF Extraction E2E Flow', () => {
  it('should_upload_pdf_extract_and_show_coordinates', async (ctx) => {
    // 1. Upload PDF
    // 2. Trigger extraction with fileId
    // 3. Verify staging regulation created with pdfFileId
    // 4. Verify requirements have pdfCoordinates
    // 5. Verify PDF can be retrieved for viewer
  });
});
```

**Step 2: Commit**

```bash
git add -A && git commit -m "test: add E2E test for PDF extraction flow"
```

---

## Verification Checklist

After implementation, verify:

1. [ ] PDF upload endpoint accepts files up to 32MB
2. [ ] ClaudeExtractor.extractFromPdf sends base64 PDF to Claude API
3. [ ] Extraction returns real page numbers and bbox coordinates
4. [ ] StagingRegulation stores pdfFileId
5. [ ] PDF viewer loads and renders PDF
6. [ ] Clicking requirement highlights correct location in PDF
7. [ ] Coordinates scroll PDF to correct page

---

## Notes

- **Token limits**: Large PDFs (>100 pages or >200K tokens) will fail. Document chunking is out of scope for this plan.
- **Gemini shadow**: Still uses text extraction since Gemini's PDF support differs. This is acceptable for validation purposes.
- **Storage cleanup**: No automatic cleanup of uploaded PDFs. Add a cleanup job later if needed.
