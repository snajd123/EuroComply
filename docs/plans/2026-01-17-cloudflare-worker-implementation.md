# Cloudflare Worker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Status:** Draft
**Date:** 2026-01-17
**Goal:** Deploy Cloudflare R2 storage and Worker for public DPP access with content negotiation.

**Architecture:** Cloudflare R2 stores DPP files (credential.json, preview.html, qr.png). A Worker handles content negotiation based on Accept header, serving the appropriate format. Zero egress costs for public DPP access.

**Tech Stack:** Cloudflare Workers (TypeScript), Cloudflare R2, Wrangler CLI

---

## Overview

This plan has two parts:
1. **Infrastructure Setup** (Tasks 1-3): Interactive Cloudflare configuration
2. **Worker Code** (Tasks 4-8): TDD implementation of the dpp-serve worker

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DPP SERVING FLOW                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Request: GET https://dpp-staging.eurocomply.eu/{org_id}/{passport_id}      │
│                                                                              │
│           ┌──────────────────┐                                              │
│           │  Cloudflare      │                                              │
│           │  Worker          │                                              │
│           │  (dpp-serve)     │                                              │
│           └────────┬─────────┘                                              │
│                    │                                                         │
│       Accept header check                                                    │
│                    │                                                         │
│     ┌──────────────┼──────────────┐                                         │
│     ▼              ▼              ▼                                         │
│  vc+ld+json     text/html     image/png                                     │
│     │              │              │                                         │
│     ▼              ▼              ▼                                         │
│  credential.json  preview.html  qr.png                                      │
│     │              │              │                                         │
│     └──────────────┴──────────────┘                                         │
│                    │                                                         │
│                    ▼                                                         │
│           ┌──────────────────┐                                              │
│           │  Cloudflare R2   │                                              │
│           │  (DPP Storage)   │                                              │
│           └──────────────────┘                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Infrastructure Setup (Interactive)

### Task 1: Create R2 Bucket

**Where:** Cloudflare Dashboard → R2 → Create bucket

**Steps:**

1. Go to https://dash.cloudflare.com
2. Select the eurocomply.eu zone
3. Navigate to R2 → Overview → Create bucket
4. Create bucket with name: `eurocomply-dpps-staging`
5. Location hint: Western Europe (for EU data residency)

**Verification:**
```bash
# After creating, verify via Wrangler CLI
npx wrangler r2 bucket list
# Should show: eurocomply-dpps-staging
```

**Commit:** N/A (infrastructure configuration)

---

### Task 2: Generate R2 API Credentials

**Where:** Cloudflare Dashboard → R2 → Manage R2 API Tokens

**Steps:**

1. Go to R2 → Manage R2 API Tokens → Create API Token
2. Name: `eurocomply-api-staging`
3. Permissions: Object Read & Write
4. Specify bucket: `eurocomply-dpps-staging`
5. TTL: No expiration (or 1 year)
6. Save the Access Key ID and Secret Access Key

**Store credentials:**
- Add to AWS Secrets Manager: `eurocomply/staging/cloudflare-r2`
- Or add to `.env` for local development

```json
{
  "R2_ACCESS_KEY_ID": "<access-key>",
  "R2_SECRET_ACCESS_KEY": "<secret-key>",
  "R2_BUCKET": "eurocomply-dpps-staging",
  "R2_ENDPOINT": "https://<account-id>.r2.cloudflarestorage.com"
}
```

**Commit:** N/A (credentials stored externally)

---

### Task 3: Create Worker Project Structure

**Files:**
- Create: `apps/dpp-worker/package.json`
- Create: `apps/dpp-worker/tsconfig.json`
- Create: `apps/dpp-worker/wrangler.toml`
- Create: `apps/dpp-worker/src/index.ts`

**Step 1: Create directory structure**

```bash
mkdir -p apps/dpp-worker/src
```

**Step 2: Create apps/dpp-worker/package.json**

```json
{
  "name": "@eurocomply/dpp-worker",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "deploy:staging": "wrangler deploy --env staging",
    "deploy:production": "wrangler deploy --env production",
    "test": "vitest",
    "test:run": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240117.0",
    "typescript": "^5.3.0",
    "vitest": "^1.2.0",
    "wrangler": "^3.24.0"
  }
}
```

**Step 3: Create apps/dpp-worker/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["src/**/*"]
}
```

**Step 4: Create apps/dpp-worker/wrangler.toml**

```toml
name = "dpp-serve"
main = "src/index.ts"
compatibility_date = "2024-01-17"

# Staging environment (default)
[env.staging]
name = "dpp-serve-staging"
route = { pattern = "dpp-staging.eurocomply.eu/*", zone_name = "eurocomply.eu" }

[[env.staging.r2_buckets]]
binding = "DPP_BUCKET"
bucket_name = "eurocomply-dpps-staging"

# Production environment
[env.production]
name = "dpp-serve-production"
route = { pattern = "dpp.eurocomply.eu/*", zone_name = "eurocomply.eu" }

[[env.production.r2_buckets]]
binding = "DPP_BUCKET"
bucket_name = "eurocomply-dpps-production"
```

**Step 5: Create apps/dpp-worker/src/index.ts (minimal)**

```typescript
export interface Env {
  DPP_BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return new Response('DPP Worker - Coming Soon', {
      headers: { 'Content-Type': 'text/plain' },
    });
  },
};
```

**Step 6: Update pnpm-workspace.yaml**

Add to the workspace file if not already present:
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**Step 7: Install dependencies**

```bash
cd apps/dpp-worker && pnpm install
```

**Step 8: Verify worker runs locally**

```bash
cd apps/dpp-worker && pnpm dev
# Visit http://localhost:8787 - should see "DPP Worker - Coming Soon"
```

**Step 9: Commit**

```bash
git add apps/dpp-worker/
git commit -m "feat(dpp-worker): initialize Cloudflare Worker project structure"
```

---

## Part 2: Worker Code (TDD)

### Task 4: Content Negotiation Logic

**Files:**
- Create: `apps/dpp-worker/src/content-negotiation.ts`
- Create: `apps/dpp-worker/src/content-negotiation.test.ts`

**Step 1: Write the failing test**

Create `apps/dpp-worker/src/content-negotiation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { negotiateContentType, DPP_CONTENT_TYPES } from './content-negotiation.js';

describe('negotiateContentType', () => {
  it('returns credential.json for application/vc+ld+json', () => {
    const result = negotiateContentType('application/vc+ld+json');
    expect(result).toEqual({
      file: 'credential.json',
      contentType: 'application/vc+ld+json',
    });
  });

  it('returns credential.json for application/json', () => {
    const result = negotiateContentType('application/json');
    expect(result).toEqual({
      file: 'credential.json',
      contentType: 'application/json',
    });
  });

  it('returns preview.html for text/html', () => {
    const result = negotiateContentType('text/html');
    expect(result).toEqual({
      file: 'preview.html',
      contentType: 'text/html',
    });
  });

  it('returns qr.png for image/png', () => {
    const result = negotiateContentType('image/png');
    expect(result).toEqual({
      file: 'qr.png',
      contentType: 'image/png',
    });
  });

  it('returns preview.html as default for */*', () => {
    const result = negotiateContentType('*/*');
    expect(result).toEqual({
      file: 'preview.html',
      contentType: 'text/html',
    });
  });

  it('returns preview.html for browser Accept header', () => {
    const browserAccept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
    const result = negotiateContentType(browserAccept);
    expect(result).toEqual({
      file: 'preview.html',
      contentType: 'text/html',
    });
  });

  it('returns preview.html when no Accept header', () => {
    const result = negotiateContentType(undefined);
    expect(result).toEqual({
      file: 'preview.html',
      contentType: 'text/html',
    });
  });

  it('returns preview.html for empty Accept header', () => {
    const result = negotiateContentType('');
    expect(result).toEqual({
      file: 'preview.html',
      contentType: 'text/html',
    });
  });
});

describe('DPP_CONTENT_TYPES', () => {
  it('has all expected content types', () => {
    expect(DPP_CONTENT_TYPES).toHaveProperty('credential');
    expect(DPP_CONTENT_TYPES).toHaveProperty('preview');
    expect(DPP_CONTENT_TYPES).toHaveProperty('qr');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/dpp-worker && pnpm test:run
```

Expected: FAIL with "Cannot find module './content-negotiation.js'"

**Step 3: Write minimal implementation**

Create `apps/dpp-worker/src/content-negotiation.ts`:

```typescript
export const DPP_CONTENT_TYPES = {
  credential: {
    file: 'credential.json',
    mimeTypes: ['application/vc+ld+json', 'application/json'],
    contentType: 'application/vc+ld+json',
  },
  preview: {
    file: 'preview.html',
    mimeTypes: ['text/html', 'application/xhtml+xml'],
    contentType: 'text/html',
  },
  qr: {
    file: 'qr.png',
    mimeTypes: ['image/png'],
    contentType: 'image/png',
  },
} as const;

export interface ContentNegotiationResult {
  file: string;
  contentType: string;
}

/**
 * Parses Accept header and returns the best matching DPP content type.
 * Priority: explicit match > quality value > default (preview.html)
 */
export function negotiateContentType(
  acceptHeader: string | undefined | null
): ContentNegotiationResult {
  // Default to HTML preview for browsers
  const defaultResult: ContentNegotiationResult = {
    file: DPP_CONTENT_TYPES.preview.file,
    contentType: DPP_CONTENT_TYPES.preview.contentType,
  };

  if (!acceptHeader || acceptHeader.trim() === '') {
    return defaultResult;
  }

  // Parse Accept header into weighted types
  const acceptTypes = parseAcceptHeader(acceptHeader);

  // Check each type in priority order
  for (const { type } of acceptTypes) {
    // Check for VC credential request
    if (DPP_CONTENT_TYPES.credential.mimeTypes.includes(type)) {
      return {
        file: DPP_CONTENT_TYPES.credential.file,
        contentType: type === 'application/json' ? 'application/json' : DPP_CONTENT_TYPES.credential.contentType,
      };
    }

    // Check for HTML preview request
    if (DPP_CONTENT_TYPES.preview.mimeTypes.includes(type)) {
      return {
        file: DPP_CONTENT_TYPES.preview.file,
        contentType: DPP_CONTENT_TYPES.preview.contentType,
      };
    }

    // Check for QR code image request
    if (DPP_CONTENT_TYPES.qr.mimeTypes.includes(type)) {
      return {
        file: DPP_CONTENT_TYPES.qr.file,
        contentType: DPP_CONTENT_TYPES.qr.contentType,
      };
    }

    // Wildcard accepts anything - return default
    if (type === '*/*') {
      return defaultResult;
    }
  }

  return defaultResult;
}

interface AcceptType {
  type: string;
  quality: number;
}

/**
 * Parses Accept header into sorted list of types by quality.
 */
function parseAcceptHeader(header: string): AcceptType[] {
  const types: AcceptType[] = [];

  for (const part of header.split(',')) {
    const [type, ...params] = part.trim().split(';');
    let quality = 1;

    for (const param of params) {
      const [key, value] = param.trim().split('=');
      if (key === 'q' && value) {
        quality = parseFloat(value);
      }
    }

    if (type) {
      types.push({ type: type.trim(), quality });
    }
  }

  // Sort by quality descending
  return types.sort((a, b) => b.quality - a.quality);
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/dpp-worker && pnpm test:run
```

Expected: All tests PASS

**Step 5: Commit**

```bash
git add apps/dpp-worker/src/content-negotiation.ts apps/dpp-worker/src/content-negotiation.test.ts
git commit -m "feat(dpp-worker): add content negotiation logic with tests"
```

---

### Task 5: URL Parsing Logic

**Files:**
- Create: `apps/dpp-worker/src/url-parser.ts`
- Create: `apps/dpp-worker/src/url-parser.test.ts`

**Step 1: Write the failing test**

Create `apps/dpp-worker/src/url-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseDppUrl, DppUrlParams } from './url-parser.js';

describe('parseDppUrl', () => {
  it('parses org and passport from path', () => {
    const url = new URL('https://dpp.eurocomply.eu/org_abc123/pass_xyz789');
    const result = parseDppUrl(url);
    expect(result).toEqual({
      organizationId: 'org_abc123',
      passportId: 'pass_xyz789',
      file: null,
    });
  });

  it('parses org, passport, and specific file', () => {
    const url = new URL('https://dpp.eurocomply.eu/org_abc123/pass_xyz789/qr.png');
    const result = parseDppUrl(url);
    expect(result).toEqual({
      organizationId: 'org_abc123',
      passportId: 'pass_xyz789',
      file: 'qr.png',
    });
  });

  it('parses credential.json file request', () => {
    const url = new URL('https://dpp.eurocomply.eu/org_abc123/pass_xyz789/credential.json');
    const result = parseDppUrl(url);
    expect(result).toEqual({
      organizationId: 'org_abc123',
      passportId: 'pass_xyz789',
      file: 'credential.json',
    });
  });

  it('returns null for root path', () => {
    const url = new URL('https://dpp.eurocomply.eu/');
    const result = parseDppUrl(url);
    expect(result).toBeNull();
  });

  it('returns null for single segment path', () => {
    const url = new URL('https://dpp.eurocomply.eu/org_abc123');
    const result = parseDppUrl(url);
    expect(result).toBeNull();
  });

  it('handles trailing slash', () => {
    const url = new URL('https://dpp.eurocomply.eu/org_abc123/pass_xyz789/');
    const result = parseDppUrl(url);
    expect(result).toEqual({
      organizationId: 'org_abc123',
      passportId: 'pass_xyz789',
      file: null,
    });
  });

  it('validates org prefix', () => {
    const url = new URL('https://dpp.eurocomply.eu/invalid/pass_xyz789');
    const result = parseDppUrl(url);
    expect(result).toBeNull();
  });

  it('validates passport prefix', () => {
    const url = new URL('https://dpp.eurocomply.eu/org_abc123/invalid');
    const result = parseDppUrl(url);
    expect(result).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/dpp-worker && pnpm test:run
```

Expected: FAIL with "Cannot find module './url-parser.js'"

**Step 3: Write minimal implementation**

Create `apps/dpp-worker/src/url-parser.ts`:

```typescript
export interface DppUrlParams {
  organizationId: string;
  passportId: string;
  file: string | null;
}

/**
 * Parses a DPP URL into its components.
 *
 * Expected format: /{organizationId}/{passportId}[/{file}]
 *
 * Examples:
 *   /org_abc123/pass_xyz789 -> { organizationId, passportId, file: null }
 *   /org_abc123/pass_xyz789/qr.png -> { organizationId, passportId, file: 'qr.png' }
 */
export function parseDppUrl(url: URL): DppUrlParams | null {
  // Remove leading/trailing slashes and split
  const path = url.pathname.replace(/^\/|\/$/g, '');

  if (!path) {
    return null;
  }

  const segments = path.split('/');

  if (segments.length < 2) {
    return null;
  }

  const [organizationId, passportId, file] = segments;

  // Validate org prefix
  if (!organizationId || !organizationId.startsWith('org_')) {
    return null;
  }

  // Validate passport prefix
  if (!passportId || !passportId.startsWith('pass_')) {
    return null;
  }

  return {
    organizationId,
    passportId,
    file: file || null,
  };
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/dpp-worker && pnpm test:run
```

Expected: All tests PASS

**Step 5: Commit**

```bash
git add apps/dpp-worker/src/url-parser.ts apps/dpp-worker/src/url-parser.test.ts
git commit -m "feat(dpp-worker): add URL parsing logic with validation"
```

---

### Task 6: R2 Storage Handler

**Files:**
- Create: `apps/dpp-worker/src/storage.ts`
- Create: `apps/dpp-worker/src/storage.test.ts`

**Step 1: Write the failing test**

Create `apps/dpp-worker/src/storage.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { getDppFile, buildStorageKey } from './storage.js';

describe('buildStorageKey', () => {
  it('builds correct storage key', () => {
    const key = buildStorageKey('org_abc123', 'pass_xyz789', 'credential.json');
    expect(key).toBe('org_abc123/pass_xyz789/credential.json');
  });

  it('handles different files', () => {
    expect(buildStorageKey('org_1', 'pass_2', 'preview.html')).toBe('org_1/pass_2/preview.html');
    expect(buildStorageKey('org_1', 'pass_2', 'qr.png')).toBe('org_1/pass_2/qr.png');
  });
});

describe('getDppFile', () => {
  it('returns file when found', async () => {
    const mockBody = new ReadableStream();
    const mockBucket = {
      get: vi.fn().mockResolvedValue({
        body: mockBody,
        httpMetadata: { contentType: 'application/json' },
      }),
    } as unknown as R2Bucket;

    const result = await getDppFile(mockBucket, 'org_1', 'pass_2', 'credential.json');

    expect(mockBucket.get).toHaveBeenCalledWith('org_1/pass_2/credential.json');
    expect(result).not.toBeNull();
    expect(result?.body).toBe(mockBody);
  });

  it('returns null when file not found', async () => {
    const mockBucket = {
      get: vi.fn().mockResolvedValue(null),
    } as unknown as R2Bucket;

    const result = await getDppFile(mockBucket, 'org_1', 'pass_2', 'missing.json');

    expect(result).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/dpp-worker && pnpm test:run
```

Expected: FAIL with "Cannot find module './storage.js'"

**Step 3: Write minimal implementation**

Create `apps/dpp-worker/src/storage.ts`:

```typescript
export interface DppFileResult {
  body: ReadableStream;
  contentType: string | undefined;
  etag: string;
  size: number;
}

/**
 * Builds the R2 storage key for a DPP file.
 */
export function buildStorageKey(
  organizationId: string,
  passportId: string,
  file: string
): string {
  return `${organizationId}/${passportId}/${file}`;
}

/**
 * Retrieves a DPP file from R2 storage.
 */
export async function getDppFile(
  bucket: R2Bucket,
  organizationId: string,
  passportId: string,
  file: string
): Promise<DppFileResult | null> {
  const key = buildStorageKey(organizationId, passportId, file);
  const object = await bucket.get(key);

  if (!object) {
    return null;
  }

  return {
    body: object.body,
    contentType: object.httpMetadata?.contentType,
    etag: object.etag,
    size: object.size,
  };
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/dpp-worker && pnpm test:run
```

Expected: All tests PASS

**Step 5: Commit**

```bash
git add apps/dpp-worker/src/storage.ts apps/dpp-worker/src/storage.test.ts
git commit -m "feat(dpp-worker): add R2 storage handler"
```

---

### Task 7: Main Worker Handler

**Files:**
- Modify: `apps/dpp-worker/src/index.ts`
- Create: `apps/dpp-worker/src/index.test.ts`

**Step 1: Write the failing test**

Create `apps/dpp-worker/src/index.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the worker module
const mockBucket = {
  get: vi.fn(),
};

const mockEnv = {
  DPP_BUCKET: mockBucket,
};

describe('DPP Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 for root path', async () => {
    const { default: worker } = await import('./index.js');
    const request = new Request('https://dpp.eurocomply.eu/');
    const response = await worker.fetch(request, mockEnv as any);

    expect(response.status).toBe(404);
  });

  it('returns 404 for invalid path', async () => {
    const { default: worker } = await import('./index.js');
    const request = new Request('https://dpp.eurocomply.eu/invalid');
    const response = await worker.fetch(request, mockEnv as any);

    expect(response.status).toBe(404);
  });

  it('returns credential.json for vc+ld+json Accept header', async () => {
    const mockBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"test": true}'));
        controller.close();
      },
    });

    mockBucket.get.mockResolvedValue({
      body: mockBody,
      httpMetadata: { contentType: 'application/vc+ld+json' },
      etag: '"abc123"',
      size: 100,
    });

    const { default: worker } = await import('./index.js');
    const request = new Request('https://dpp.eurocomply.eu/org_abc/pass_xyz', {
      headers: { Accept: 'application/vc+ld+json' },
    });
    const response = await worker.fetch(request, mockEnv as any);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/vc+ld+json');
    expect(mockBucket.get).toHaveBeenCalledWith('org_abc/pass_xyz/credential.json');
  });

  it('returns preview.html for browser request', async () => {
    const mockBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('<html></html>'));
        controller.close();
      },
    });

    mockBucket.get.mockResolvedValue({
      body: mockBody,
      httpMetadata: { contentType: 'text/html' },
      etag: '"def456"',
      size: 200,
    });

    const { default: worker } = await import('./index.js');
    const request = new Request('https://dpp.eurocomply.eu/org_abc/pass_xyz', {
      headers: { Accept: 'text/html,*/*' },
    });
    const response = await worker.fetch(request, mockEnv as any);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html');
    expect(mockBucket.get).toHaveBeenCalledWith('org_abc/pass_xyz/preview.html');
  });

  it('returns 404 when DPP not found', async () => {
    mockBucket.get.mockResolvedValue(null);

    const { default: worker } = await import('./index.js');
    const request = new Request('https://dpp.eurocomply.eu/org_abc/pass_notfound');
    const response = await worker.fetch(request, mockEnv as any);

    expect(response.status).toBe(404);
  });

  it('includes cache headers', async () => {
    const mockBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('<html></html>'));
        controller.close();
      },
    });

    mockBucket.get.mockResolvedValue({
      body: mockBody,
      httpMetadata: { contentType: 'text/html' },
      etag: '"abc123"',
      size: 100,
    });

    const { default: worker } = await import('./index.js');
    const request = new Request('https://dpp.eurocomply.eu/org_abc/pass_xyz');
    const response = await worker.fetch(request, mockEnv as any);

    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect(response.headers.get('ETag')).toBe('"abc123"');
  });

  it('handles specific file requests', async () => {
    const mockBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([137, 80, 78, 71])); // PNG header
        controller.close();
      },
    });

    mockBucket.get.mockResolvedValue({
      body: mockBody,
      httpMetadata: { contentType: 'image/png' },
      etag: '"qr123"',
      size: 1000,
    });

    const { default: worker } = await import('./index.js');
    const request = new Request('https://dpp.eurocomply.eu/org_abc/pass_xyz/qr.png');
    const response = await worker.fetch(request, mockEnv as any);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(mockBucket.get).toHaveBeenCalledWith('org_abc/pass_xyz/qr.png');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/dpp-worker && pnpm test:run
```

Expected: Tests fail (current implementation returns placeholder response)

**Step 3: Write the full implementation**

Update `apps/dpp-worker/src/index.ts`:

```typescript
import { negotiateContentType } from './content-negotiation.js';
import { parseDppUrl } from './url-parser.js';
import { getDppFile } from './storage.js';

export interface Env {
  DPP_BUCKET: R2Bucket;
}

const CACHE_MAX_AGE = 3600; // 1 hour

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Only handle GET requests
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(request.url);

    // Parse the URL
    const params = parseDppUrl(url);
    if (!params) {
      return notFound('Invalid DPP URL format');
    }

    const { organizationId, passportId, file: requestedFile } = params;

    // Determine which file to serve
    let fileToServe: string;
    let contentType: string;

    if (requestedFile) {
      // Specific file requested
      fileToServe = requestedFile;
      contentType = getContentTypeForFile(requestedFile);
    } else {
      // Content negotiation based on Accept header
      const acceptHeader = request.headers.get('Accept');
      const negotiated = negotiateContentType(acceptHeader);
      fileToServe = negotiated.file;
      contentType = negotiated.contentType;
    }

    // Fetch from R2
    const dppFile = await getDppFile(env.DPP_BUCKET, organizationId, passportId, fileToServe);

    if (!dppFile) {
      return notFound(`DPP not found: ${organizationId}/${passportId}`);
    }

    // Return with appropriate headers
    return new Response(dppFile.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': dppFile.size.toString(),
        'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`,
        'ETag': dppFile.etag,
        'Access-Control-Allow-Origin': '*',
        'X-DPP-Organization': organizationId,
        'X-DPP-Passport': passportId,
      },
    });
  },
};

function notFound(message: string): Response {
  return new Response(JSON.stringify({ error: 'Not Found', message }), {
    status: 404,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
  });
}

function getContentTypeForFile(file: string): string {
  const ext = file.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'json':
      return 'application/json';
    case 'html':
      return 'text/html';
    case 'png':
      return 'image/png';
    default:
      return 'application/octet-stream';
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/dpp-worker && pnpm test:run
```

Expected: All tests PASS

**Step 5: Commit**

```bash
git add apps/dpp-worker/src/index.ts apps/dpp-worker/src/index.test.ts
git commit -m "feat(dpp-worker): implement main request handler with content negotiation"
```

---

### Task 8: Deploy to Staging

**Files:**
- None (deployment)

**Step 1: Verify Cloudflare authentication**

```bash
cd apps/dpp-worker
npx wrangler whoami
# Should show your Cloudflare account
```

If not authenticated:
```bash
npx wrangler login
```

**Step 2: Deploy to staging**

```bash
cd apps/dpp-worker
pnpm deploy:staging
```

Expected output:
```
Uploaded dpp-serve-staging
Published dpp-serve-staging
  https://dpp-staging.eurocomply.eu
```

**Step 3: Verify deployment**

```bash
curl -I https://dpp-staging.eurocomply.eu/
# Should return 404 (no DPPs uploaded yet)

curl -I https://dpp-staging.eurocomply.eu/org_test/pass_test
# Should return 404 (DPP not found)
```

**Step 4: Commit deployment config if changed**

```bash
git add apps/dpp-worker/wrangler.toml
git commit -m "chore(dpp-worker): configure staging deployment" --allow-empty
```

---

## Part 3: Integration (Interactive)

### Task 9: Configure DNS for Worker

**Where:** Cloudflare Dashboard → DNS

**Steps:**

1. Go to Cloudflare Dashboard → eurocomply.eu → DNS
2. The Worker route in wrangler.toml automatically creates the route
3. Verify: `dpp-staging.eurocomply.eu` resolves and routes to Worker

**Verification:**
```bash
curl https://dpp-staging.eurocomply.eu/org_test/pass_test
# Should return 404 JSON from Worker (not Cloudflare error page)
```

---

### Task 10: Configure WAF Rate Limiting

**Where:** Cloudflare Dashboard → Security → WAF

**Steps:**

1. Go to Security → WAF → Rate limiting rules
2. Create rule:
   - Name: `DPP Rate Limit`
   - Expression: `(http.host eq "dpp-staging.eurocomply.eu")`
   - Characteristics: IP
   - Rate: 1000 requests per minute
   - Action: Block for 60 seconds
3. Save and deploy

---

## Summary Checklist

After completing all tasks, verify:

- [ ] R2 bucket `eurocomply-dpps-staging` exists
- [ ] R2 API credentials stored securely
- [ ] Worker code passes all tests: `cd apps/dpp-worker && pnpm test:run`
- [ ] Worker deployed: `https://dpp-staging.eurocomply.eu`
- [ ] Content negotiation works (test with different Accept headers)
- [ ] WAF rate limiting configured
- [ ] All changes committed

---

## Test Commands

```bash
# Test content negotiation locally
cd apps/dpp-worker && pnpm dev

# In another terminal:
# Browser request (HTML)
curl -H "Accept: text/html" http://localhost:8787/org_test/pass_test

# API request (JSON/VC)
curl -H "Accept: application/vc+ld+json" http://localhost:8787/org_test/pass_test

# QR code
curl -H "Accept: image/png" http://localhost:8787/org_test/pass_test
```

---

## Related Documents

- [DevOps Infrastructure Design](./2026-01-16-devops-infrastructure-design.md) - Phase 4 overview
- [Verifiable Credentials Design](./2026-01-15-verifiable-credentials-design.md) - VC structure
- [Data Sovereignty Design](./2026-01-15-data-sovereignty-design.md) - EU data residency

---

*Document Control: v1.0 | 2026-01-17 | Initial implementation plan*
