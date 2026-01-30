/**
 * Ingestor Upload API Tests
 *
 * Tests for PDF upload endpoints:
 * - POST /upload/pdf: Upload a PDF file
 * - GET /upload/pdf/:fileId: Retrieve an uploaded PDF
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createIngestorUploadRouter } from './ingestor-upload.js';
import type { Env } from '../../app.js';

describe('Ingestor Upload API', () => {
  let tempDir: string;
  let testApp: Hono<Env>;

  beforeAll(() => {
    // Create a temp directory for test uploads
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingestor-upload-test-'));
  });

  afterAll(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Create fresh test app for each test
    testApp = new Hono<Env>();
    testApp.route('/upload', createIngestorUploadRouter({ uploadsDir: tempDir }));
  });

  afterEach(() => {
    // Clean uploaded files between tests
    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      fs.unlinkSync(path.join(tempDir, file));
    }
  });

  /**
   * Helper to create a minimal valid PDF buffer.
   * A valid PDF starts with %PDF-1.x and ends with %%EOF.
   */
  function createMinimalPdf(): Buffer {
    const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
trailer
<< /Size 4 /Root 1 0 R >>
startxref
196
%%EOF`;
    return Buffer.from(pdfContent);
  }

  /**
   * Helper to create multipart form data with a file.
   */
  function createFormData(file: Buffer, filename: string, contentType: string): FormData {
    const formData = new FormData();
    const blob = new Blob([file], { type: contentType });
    formData.append('file', blob, filename);
    return formData;
  }

  describe('POST /upload/pdf', () => {
    it('should_upload_valid_pdf_and_return_fileId', async () => {
      const pdfBuffer = createMinimalPdf();
      const formData = createFormData(pdfBuffer, 'test.pdf', 'application/pdf');

      const res = await testApp.request('/upload/pdf', {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.fileId).toBeDefined();
      expect(typeof data.data.fileId).toBe('string');
      expect(data.data.fileId.length).toBeGreaterThan(0);
      expect(data.data.filename).toBe('test.pdf');
      expect(data.data.size).toBe(pdfBuffer.length);

      // Verify file was actually saved
      const savedPath = path.join(tempDir, `${data.data.fileId}.pdf`);
      expect(fs.existsSync(savedPath)).toBe(true);
      const savedContent = fs.readFileSync(savedPath);
      expect(savedContent).toEqual(pdfBuffer);
    });

    it('should_reject_non_pdf_file', async () => {
      const textContent = Buffer.from('This is not a PDF');
      const formData = createFormData(textContent, 'test.txt', 'text/plain');

      const res = await testApp.request('/upload/pdf', {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_FILE_TYPE');
      expect(data.error.message).toContain('PDF');
    });

    it('should_reject_file_exceeding_32mb', async () => {
      // Create a file just over 32MB (32MB + 1 byte)
      const maxSize = 32 * 1024 * 1024;
      const largeBuffer = Buffer.alloc(maxSize + 1, 0);
      // Add PDF header to pass content-type check
      const pdfHeader = Buffer.from('%PDF-1.4');
      pdfHeader.copy(largeBuffer);

      const formData = createFormData(largeBuffer, 'large.pdf', 'application/pdf');

      const res = await testApp.request('/upload/pdf', {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('FILE_TOO_LARGE');
      expect(data.error.message).toContain('32MB');
    });

    it('should_reject_request_without_file', async () => {
      const formData = new FormData();

      const res = await testApp.request('/upload/pdf', {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NO_FILE');
    });

    it('should_reject_file_that_is_not_valid_pdf_content', async () => {
      // File with PDF mime type but not actual PDF content
      const fakeContent = Buffer.from('This claims to be a PDF but is not');
      const formData = createFormData(fakeContent, 'fake.pdf', 'application/pdf');

      const res = await testApp.request('/upload/pdf', {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_FILE_TYPE');
      expect(data.error.message).toContain('PDF');
    });
  });

  describe('GET /upload/pdf/:fileId', () => {
    it('should_return_uploaded_pdf', async () => {
      // First upload a file
      const pdfBuffer = createMinimalPdf();
      const formData = createFormData(pdfBuffer, 'test.pdf', 'application/pdf');

      const uploadRes = await testApp.request('/upload/pdf', {
        method: 'POST',
        body: formData,
      });

      expect(uploadRes.status).toBe(201);
      const uploadData = await uploadRes.json();
      const fileId = uploadData.data.fileId;

      // Now retrieve it
      const getRes = await testApp.request(`/upload/pdf/${fileId}`);

      expect(getRes.status).toBe(200);
      expect(getRes.headers.get('content-type')).toBe('application/pdf');
      expect(getRes.headers.get('content-disposition')).toContain('inline');

      const responseBuffer = Buffer.from(await getRes.arrayBuffer());
      expect(responseBuffer).toEqual(pdfBuffer);
    });

    it('should_return_404_for_nonexistent_fileId', async () => {
      const res = await testApp.request('/upload/pdf/nonexistent-file-id');

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('should_prevent_path_traversal_attacks', async () => {
      // Try to access files outside uploads directory using encoded path components
      // Hono doesn't match paths with slashes to :fileId parameter, so these should 404
      // Test with a path that could be URL-encoded
      const res = await testApp.request('/upload/pdf/..%2F..%2F..%2Fetc%2Fpasswd');

      // Should return 404 (not 200 with the file content)
      // Hono decodes the path and doesn't match the route
      expect(res.status).toBe(404);
    });

    it('should_return_404_for_invalid_fileId_format', async () => {
      // FileId should be alphanumeric only (CUID2 format)
      // Returns 404 (not 400) to avoid information leakage about valid formats
      const res = await testApp.request('/upload/pdf/invalid!@#$%');

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });
});
