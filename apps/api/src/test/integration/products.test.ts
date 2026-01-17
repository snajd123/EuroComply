/**
 * Integration tests for Product Routes.
 * Tests against a real PostgreSQL database.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  getTestContext,
  cleanupOutboxEvents,
  testPrisma,
} from './setup.js';
import { products } from '../../routes/products.js';
import { versions } from '../../routes/versions.js';
import { ok } from '@eurocomply/shared';
import type { AppVariables } from '../../types/context.js';
import { VersionService } from '../../services/version.service.js';

describe('Product Routes Integration Tests', () => {
  let app: Hono<{ Variables: AppVariables }>;

  beforeAll(async () => {
    await setupIntegrationTest();

    // Create a test app with the product routes
    app = new Hono<{ Variables: AppVariables }>();

    // Mock auth middleware that sets up test context
    app.use('*', async (c, next) => {
      const ctx = getTestContext();
      c.set('user', {
        id: ctx.userId,
        clerkId: `clerk_test_${ctx.schemaName}`,
        email: `test-${ctx.schemaName}@example.com`,
        name: 'Test User',
      });
      c.set('tenant', {
        organizationId: ctx.organizationId,
        schemaName: ctx.schemaName,
        name: 'Test Org',
        subscriptionTier: 'starter',
      });
      c.set('permissions', {
        role: 'owner',
        designAuthority: 'MANAGER',
        operationsAuthority: 'MANAGER',
        marketingAuthority: 'MANAGER',
        complianceAuthority: 'MANAGER',
      });
      await next();
    });

    // Mount product routes
    app.route('/api/v1/products', products);
    app.route('/api/v1/versions', versions);
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await cleanupOutboxEvents();
    // Clean up any products created in previous tests
    const ctx = getTestContext();
    // Must delete BOM entries before versions (foreign key constraint)
    await testPrisma.bomEntry.deleteMany({
      where: { version: { product: { organizationId: ctx.organizationId } } },
    });
    await testPrisma.productVersion.deleteMany({
      where: { product: { organizationId: ctx.organizationId } },
    });
    await testPrisma.productIdentifier.deleteMany({
      where: { product: { organizationId: ctx.organizationId } },
    });
    await testPrisma.product.deleteMany({
      where: { organizationId: ctx.organizationId },
    });
  });

  describe('POST /api/v1/products - create product', () => {
    it('should create a FINISHED_GOOD product successfully', async () => {
      const response = await app.request('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Product',
          description: 'A test product',
          productType: 'FINISHED_GOOD',
        }),
      });

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.name).toBe('Test Product');
      expect(json.data.description).toBe('A test product');
      expect(json.data.productType).toBe('FINISHED_GOOD');
      expect(json.data.status).toBe('ACTIVE');
      expect(json.data.id).toBeDefined();

      // Verify in database
      const ctx = getTestContext();
      const dbProduct = await testPrisma.product.findUnique({
        where: { id: json.data.id },
      });
      expect(dbProduct).not.toBeNull();
      expect(dbProduct?.organizationId).toBe(ctx.organizationId);
    });

    it('should create a RAW_MATERIAL product successfully', async () => {
      const response = await app.request('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Raw Material Test',
          productType: 'RAW_MATERIAL',
        }),
      });

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.productType).toBe('RAW_MATERIAL');
    });

    it('should create a product with identifiers', async () => {
      const response = await app.request('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Product with GTIN',
          productType: 'FINISHED_GOOD',
          identifiers: [
            { type: 'GTIN', value: '12345678901234' },
            { type: 'SKU', value: 'SKU-001' },
          ],
        }),
      });

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.identifiers).toHaveLength(2);
      expect(json.data.identifiers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'GTIN', value: '12345678901234' }),
          expect.objectContaining({ type: 'SKU', value: 'SKU-001' }),
        ])
      );
    });

    it('should reject invalid GTIN format', async () => {
      const response = await app.request('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Invalid GTIN Product',
          productType: 'FINISHED_GOOD',
          identifiers: [{ type: 'GTIN', value: '12345' }], // Invalid: not 8, 12, 13, or 14 digits
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/v1/products - VARIANT without parentId', () => {
    it('should reject VARIANT product without parentId', async () => {
      const response = await app.request('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Variant Without Parent',
          productType: 'VARIANT',
          // Missing parentId
        }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error.message).toContain('parentId');
    });

    it('should accept VARIANT product with valid parentId', async () => {
      // First create a parent product
      const parentResponse = await app.request('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Parent Product',
          productType: 'FINISHED_GOOD',
        }),
      });

      expect(parentResponse.status).toBe(201);
      const parentJson = await parentResponse.json();
      const parentId = parentJson.data.id;

      // Now create a variant
      const variantResponse = await app.request('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Variant Product',
          productType: 'VARIANT',
          parentId: parentId,
        }),
      });

      expect(variantResponse.status).toBe(201);
      const variantJson = await variantResponse.json();
      expect(variantJson.success).toBe(true);
      expect(variantJson.data.productType).toBe('VARIANT');
      expect(variantJson.data.parentId).toBe(parentId);
    });

    it('should reject non-VARIANT product with parentId', async () => {
      // First create a parent product
      const parentResponse = await app.request('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Parent Product',
          productType: 'FINISHED_GOOD',
        }),
      });

      const parentJson = await parentResponse.json();
      const parentId = parentJson.data.id;

      // Try to create a FINISHED_GOOD with parentId - should fail
      const response = await app.request('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Invalid Product',
          productType: 'FINISHED_GOOD',
          parentId: parentId,
        }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.success).toBe(false);
    });
  });

  describe('GET /api/v1/products - list with pagination', () => {
    beforeEach(async () => {
      // Create multiple products for pagination tests
      for (let i = 1; i <= 5; i++) {
        await app.request('/api/v1/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `Product ${i}`,
            productType: 'FINISHED_GOOD',
          }),
        });
      }
    });

    it('should list products with default pagination', async () => {
      const response = await app.request('/api/v1/products');

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.items).toHaveLength(5);
      expect(json.data.limit).toBe(20);
      expect(json.data.offset).toBe(0);
    });

    it('should respect limit parameter', async () => {
      const response = await app.request('/api/v1/products?limit=2');

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.items).toHaveLength(2);
      expect(json.data.limit).toBe(2);
    });

    it('should respect offset parameter', async () => {
      const response = await app.request('/api/v1/products?limit=2&offset=2');

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.items).toHaveLength(2);
      expect(json.data.offset).toBe(2);
    });

    it('should return empty array when offset exceeds total', async () => {
      const response = await app.request('/api/v1/products?offset=100');

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.items).toHaveLength(0);
    });
  });

  describe('GET /api/v1/products?productType=RAW_MATERIAL - filter by type', () => {
    beforeEach(async () => {
      // Create products of different types
      await app.request('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Finished Good 1', productType: 'FINISHED_GOOD' }),
      });
      await app.request('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Raw Material 1', productType: 'RAW_MATERIAL' }),
      });
      await app.request('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Raw Material 2', productType: 'RAW_MATERIAL' }),
      });
      await app.request('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Component 1', productType: 'COMPONENT' }),
      });
    });

    it('should filter by RAW_MATERIAL type', async () => {
      const response = await app.request('/api/v1/products?productType=RAW_MATERIAL');

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.items).toHaveLength(2);
      json.data.items.forEach((item: { productType: string }) => {
        expect(item.productType).toBe('RAW_MATERIAL');
      });
    });

    it('should filter by FINISHED_GOOD type', async () => {
      const response = await app.request('/api/v1/products?productType=FINISHED_GOOD');

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.items).toHaveLength(1);
      expect(json.data.items[0].productType).toBe('FINISHED_GOOD');
    });

    it('should filter by COMPONENT type', async () => {
      const response = await app.request('/api/v1/products?productType=COMPONENT');

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.items).toHaveLength(1);
      expect(json.data.items[0].productType).toBe('COMPONENT');
    });

    it('should return all products when no type filter', async () => {
      const response = await app.request('/api/v1/products');

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.items).toHaveLength(4);
    });
  });

  describe('POST /api/v1/products/:id/versions - create version', () => {
    let productId: string;

    beforeEach(async () => {
      // Create a product to add versions to
      const response = await app.request('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Product for Versioning',
          productType: 'FINISHED_GOOD',
        }),
      });
      const json = await response.json();
      productId = json.data.id;
    });

    it('should create a DESIGN workspace version', async () => {
      const response = await app.request(`/api/v1/products/${productId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: 'DESIGN' }),
      });

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.productId).toBe(productId);
      expect(json.data.workspace).toBe('DESIGN');
      expect(json.data.versionNumber).toBe(1);
      expect(json.data.status).toBe('DRAFT');
    });

    it('should create versions in different workspaces', async () => {
      // Create DESIGN version
      const designResponse = await app.request(`/api/v1/products/${productId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: 'DESIGN' }),
      });
      expect(designResponse.status).toBe(201);

      // Create OPERATIONS version
      const opsResponse = await app.request(`/api/v1/products/${productId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: 'OPERATIONS' }),
      });
      expect(opsResponse.status).toBe(201);
      const opsJson = await opsResponse.json();
      expect(opsJson.data.workspace).toBe('OPERATIONS');
      expect(opsJson.data.versionNumber).toBe(1);

      // Create MARKETING version
      const marketingResponse = await app.request(`/api/v1/products/${productId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: 'MARKETING' }),
      });
      expect(marketingResponse.status).toBe(201);
      const marketingJson = await marketingResponse.json();
      expect(marketingJson.data.workspace).toBe('MARKETING');
    });

    it('should increment version number in same workspace', async () => {
      // Create first DESIGN version
      const v1Response = await app.request(`/api/v1/products/${productId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: 'DESIGN' }),
      });
      expect(v1Response.status).toBe(201);
      const v1Json = await v1Response.json();
      expect(v1Json.data.versionNumber).toBe(1);

      // Create second DESIGN version
      const v2Response = await app.request(`/api/v1/products/${productId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: 'DESIGN' }),
      });
      expect(v2Response.status).toBe(201);
      const v2Json = await v2Response.json();
      expect(v2Json.data.versionNumber).toBe(2);
    });

    it('should return 404 for non-existent product', async () => {
      const response = await app.request('/api/v1/products/non-existent-id/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: 'DESIGN' }),
      });

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('NOT_FOUND');
    });

    it('should reject invalid workspace', async () => {
      const response = await app.request(`/api/v1/products/${productId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: 'INVALID_WORKSPACE' }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/products/:id - get single product', () => {
    it('should get a product by ID', async () => {
      // Create a product
      const createResponse = await app.request('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Get Test Product',
          description: 'Product to retrieve',
          productType: 'COMPONENT',
        }),
      });
      const createJson = await createResponse.json();
      const productId = createJson.data.id;

      // Get the product
      const response = await app.request(`/api/v1/products/${productId}`);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(productId);
      expect(json.data.name).toBe('Get Test Product');
      expect(json.data.productType).toBe('COMPONENT');
    });

    it('should return 404 for non-existent product', async () => {
      const response = await app.request('/api/v1/products/non-existent-id');

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('NOT_FOUND');
    });
  });

  describe('PATCH /api/v1/products/:id - update product', () => {
    it('should update product name and description', async () => {
      // Create a product
      const createResponse = await app.request('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Original Name',
          description: 'Original description',
          productType: 'FINISHED_GOOD',
        }),
      });
      const createJson = await createResponse.json();
      const productId = createJson.data.id;

      // Update the product
      const response = await app.request(`/api/v1/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated Name',
          description: 'Updated description',
        }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.name).toBe('Updated Name');
      expect(json.data.description).toBe('Updated description');
    });

    it('should return 404 for non-existent product', async () => {
      const response = await app.request('/api/v1/products/non-existent-id', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Name' }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/products/:id - archive product', () => {
    it('should archive a product (soft delete)', async () => {
      // Create a product
      const createResponse = await app.request('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Product to Archive',
          productType: 'FINISHED_GOOD',
        }),
      });
      const createJson = await createResponse.json();
      const productId = createJson.data.id;

      // Archive the product
      const response = await app.request(`/api/v1/products/${productId}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.message).toBe('Product archived');

      // Verify product is archived in database
      const dbProduct = await testPrisma.product.findUnique({
        where: { id: productId },
      });
      expect(dbProduct?.status).toBe('ARCHIVED');
    });

    it('should return 404 for non-existent product', async () => {
      const response = await app.request('/api/v1/products/non-existent-id', {
        method: 'DELETE',
      });

      expect(response.status).toBe(404);
    });
  });

  describe('FORENSIC GUARD A: Release Lock (BOM Immutability)', () => {
    it('should prevent BOM modification on RELEASED version via assertVersionEditable', async () => {
      const ctx = getTestContext();
      const versionService = new VersionService(testPrisma);

      // 1. Create a product
      const createResponse = await app.request('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Release Lock Test Product',
          productType: 'FINISHED_GOOD',
        }),
      });
      const productJson = await createResponse.json();
      const productId = productJson.data.id;

      // 2. Create a DESIGN version
      const versionResponse = await app.request(`/api/v1/products/${productId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: 'DESIGN' }),
      });
      const versionJson = await versionResponse.json();
      const versionId = versionJson.data.id;

      // 3. Transition version through workflow: DRAFT -> PENDING_REVIEW -> IN_REVIEW -> RELEASED
      await app.request(`/api/v1/versions/${versionId}/submit`, { method: 'POST' });
      await app.request(`/api/v1/versions/${versionId}/review`, { method: 'POST' });
      await app.request(`/api/v1/versions/${versionId}/release`, { method: 'POST' });

      // 4. Verify version is RELEASED
      const releasedVersion = await testPrisma.productVersion.findUnique({
        where: { id: versionId },
      });
      expect(releasedVersion?.status).toBe('RELEASED');

      // 5. FORENSIC GUARD A: assertVersionEditable should throw for RELEASED version
      await expect(
        versionService.assertVersionEditable(ctx.organizationId, versionId)
      ).rejects.toThrow('Cannot modify BOM: version is RELEASED (immutable)');
    });

    it('should allow assertVersionEditable for DRAFT version', async () => {
      const ctx = getTestContext();
      const versionService = new VersionService(testPrisma);

      // 1. Create a product
      const createResponse = await app.request('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Draft Editable Test Product',
          productType: 'FINISHED_GOOD',
        }),
      });
      const productJson = await createResponse.json();
      const productId = productJson.data.id;

      // 2. Create a DESIGN version (starts as DRAFT)
      const versionResponse = await app.request(`/api/v1/products/${productId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: 'DESIGN' }),
      });
      const versionJson = await versionResponse.json();
      const versionId = versionJson.data.id;

      // 3. Verify DRAFT version is editable (should not throw)
      await expect(
        versionService.assertVersionEditable(ctx.organizationId, versionId)
      ).resolves.toBeUndefined();
    });
  });

  describe('FORENSIC GUARD B: Variant Inheritance (BOM Cloning)', () => {
    it('should auto-clone parent RELEASED BOM when creating variant', async () => {
      const ctx = getTestContext();

      // 1. Create parent product
      const parentResponse = await app.request('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Parent for Variant Test',
          productType: 'FINISHED_GOOD',
        }),
      });
      const parentJson = await parentResponse.json();
      const parentId = parentJson.data.id;

      // 2. Create a raw material to use in BOM
      const materialResponse = await app.request('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Material',
          productType: 'RAW_MATERIAL',
        }),
      });
      const materialJson = await materialResponse.json();
      const materialId = materialJson.data.id;

      // 3. Create DESIGN version for parent
      const versionResponse = await app.request(`/api/v1/products/${parentId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: 'DESIGN' }),
      });
      const versionJson = await versionResponse.json();
      const parentVersionId = versionJson.data.id;

      // 4. Add BOM entry to parent version (direct DB insert since BOM API doesn't exist yet)
      await testPrisma.bomEntry.create({
        data: {
          parentProductId: parentId,
          childProductId: materialId,
          versionId: parentVersionId,
          quantity: 5.0,
          unit: 'kg',
          scrapRatePct: 2.5,
          yieldPct: 95.0,
          position: 1,
          notes: 'Test material for variant inheritance',
        },
      });

      // 5. Release the parent version
      await app.request(`/api/v1/versions/${parentVersionId}/submit`, { method: 'POST' });
      await app.request(`/api/v1/versions/${parentVersionId}/review`, { method: 'POST' });
      await app.request(`/api/v1/versions/${parentVersionId}/release`, { method: 'POST' });

      // 6. Create variant (should inherit BOM)
      const variantResponse = await app.request('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Variant with Inherited BOM',
          productType: 'VARIANT',
          parentId: parentId,
        }),
      });
      expect(variantResponse.status).toBe(201);
      const variantJson = await variantResponse.json();
      const variantId = variantJson.data.id;

      // 7. Verify variant has a DRAFT version created
      const variantVersions = await testPrisma.productVersion.findMany({
        where: { productId: variantId },
      });
      expect(variantVersions).toHaveLength(1);
      const variantVersion = variantVersions[0];
      expect(variantVersion).toBeDefined();
      expect(variantVersion!.workspace).toBe('DESIGN');
      expect(variantVersion!.status).toBe('DRAFT');
      expect(variantVersion!.versionNumber).toBe(1);

      // 8. Verify BOM entries were cloned to variant's version
      const variantBomEntries = await testPrisma.bomEntry.findMany({
        where: { versionId: variantVersion!.id },
      });
      expect(variantBomEntries).toHaveLength(1);
      const bomEntry = variantBomEntries[0];
      expect(bomEntry).toBeDefined();
      expect(bomEntry!.childProductId).toBe(materialId);
      expect(Number(bomEntry!.quantity)).toBe(5.0);
      expect(bomEntry!.unit).toBe('kg');
      expect(Number(bomEntry!.scrapRatePct)).toBe(2.5);
      expect(Number(bomEntry!.yieldPct)).toBe(95.0);
      expect(bomEntry!.notes).toBe('Test material for variant inheritance');
    });

    it('should NOT inherit BOM if parent has no RELEASED version', async () => {
      // 1. Create parent product
      const parentResponse = await app.request('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Parent without Released Version',
          productType: 'FINISHED_GOOD',
        }),
      });
      const parentJson = await parentResponse.json();
      const parentId = parentJson.data.id;

      // 2. Create DESIGN version but DON'T release it (stays DRAFT)
      const versionResponse = await app.request(`/api/v1/products/${parentId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: 'DESIGN' }),
      });
      const versionJson = await versionResponse.json();
      const parentVersionId = versionJson.data.id;

      // 3. Add BOM entry to parent's DRAFT version
      const materialResponse = await app.request('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Material for Non-Released',
          productType: 'RAW_MATERIAL',
        }),
      });
      const materialJson = await materialResponse.json();

      await testPrisma.bomEntry.create({
        data: {
          parentProductId: parentId,
          childProductId: materialJson.data.id,
          versionId: parentVersionId,
          quantity: 10.0,
          unit: 'pcs',
        },
      });

      // 4. Create variant (should NOT get BOM since parent isn't RELEASED)
      const variantResponse = await app.request('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Variant without BOM',
          productType: 'VARIANT',
          parentId: parentId,
        }),
      });
      expect(variantResponse.status).toBe(201);
      const variantJson = await variantResponse.json();
      const variantId = variantJson.data.id;

      // 5. Verify variant has NO versions created (since parent wasn't released)
      const variantVersions = await testPrisma.productVersion.findMany({
        where: { productId: variantId },
      });
      expect(variantVersions).toHaveLength(0);
    });
  });
});
