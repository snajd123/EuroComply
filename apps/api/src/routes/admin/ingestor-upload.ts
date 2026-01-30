/**
 * Admin Ingestor Upload API Routes
 *
 * Endpoints for PDF file upload management:
 * - POST /pdf: Upload a PDF file for extraction
 * - GET /pdf/:fileId: Retrieve an uploaded PDF
 */
import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createId } from '@eurocomply/core';
import type { Env } from '../../app.js';
import { success, error } from '../../utils/response.js';

/** Maximum file size in bytes (32MB) */
const MAX_FILE_SIZE = 32 * 1024 * 1024;

/** PDF magic bytes - %PDF */
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]);

/** Valid fileId pattern (CUID2 format - alphanumeric, 21-24 chars) */
const FILE_ID_PATTERN = /^[a-z0-9]{21,24}$/;

export interface IngestorUploadRouterOptions {
  /** Directory to store uploaded PDFs */
  uploadsDir: string;
}

/**
 * Validates that a buffer starts with PDF magic bytes.
 */
function isPdfContent(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  return buffer.subarray(0, 4).equals(PDF_MAGIC);
}

/**
 * Sanitizes filename by removing path components.
 */
function sanitizeFilename(filename: string): string {
  return path.basename(filename);
}

export function createIngestorUploadRouter(options: IngestorUploadRouterOptions): Hono<Env> {
  const { uploadsDir } = options;
  const router = new Hono<Env>();

  // Ensure uploads directory exists
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  /**
   * POST /pdf
   * Upload a PDF file for later extraction
   *
   * Request: multipart/form-data with 'file' field
   * Response: { fileId, filename, size }
   */
  router.post('/pdf', async (c) => {
    let formData: FormData;
    try {
      formData = await c.req.formData();
    } catch {
      return error(c, 'INVALID_REQUEST', 'Invalid form data', 400);
    }

    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return error(c, 'NO_FILE', 'No file provided in request', 400);
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return error(c, 'FILE_TOO_LARGE', 'File exceeds maximum size of 32MB', 400);
    }

    // Read file content
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate PDF content (magic bytes check)
    if (!isPdfContent(buffer)) {
      return error(c, 'INVALID_FILE_TYPE', 'File must be a valid PDF document', 400);
    }

    // Generate unique file ID
    const fileId = createId();
    const filename = sanitizeFilename(file.name || 'upload.pdf');
    const filePath = path.join(uploadsDir, `${fileId}.pdf`);

    // Write file to disk
    try {
      fs.writeFileSync(filePath, buffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return error(c, 'STORAGE_ERROR', `Failed to save file: ${message}`, 500);
    }

    return success(c, {
      fileId,
      filename,
      size: buffer.length,
    }, { status: 201 });
  });

  /**
   * GET /pdf/:fileId
   * Retrieve an uploaded PDF file
   *
   * Response: PDF file with application/pdf content type
   */
  router.get('/pdf/:fileId', async (c) => {
    const { fileId } = c.req.param();

    // Validate fileId format to prevent path traversal
    // Return 404 (not 400) for invalid formats to avoid information leakage
    if (!FILE_ID_PATTERN.test(fileId)) {
      return error(c, 'NOT_FOUND', 'File not found', 404);
    }

    const filePath = path.join(uploadsDir, `${fileId}.pdf`);

    // Verify the resolved path is still within uploads directory (defense in depth)
    const resolvedPath = path.resolve(filePath);
    const resolvedUploadsDir = path.resolve(uploadsDir);
    if (!resolvedPath.startsWith(resolvedUploadsDir)) {
      return error(c, 'NOT_FOUND', 'File not found', 404);
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return error(c, 'NOT_FOUND', 'File not found', 404);
    }

    // Read and return file
    const fileBuffer = fs.readFileSync(filePath);

    c.header('Content-Type', 'application/pdf');
    c.header('Content-Disposition', `inline; filename="${fileId}.pdf"`);
    c.header('Content-Length', String(fileBuffer.length));

    return c.body(fileBuffer);
  });

  return router;
}
