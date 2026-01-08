/**
 * Export Service Tests
 * TDD: Tests written FIRST before implementation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as exportService from './export.service.js';

// Mock singletons (must be defined before vi.mock)
const mockDidKeyService = {
  createDidKey: vi.fn().mockResolvedValue({
    did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    keyId: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK#key-1',
    didDocument: { id: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' },
  }),
  exportPrivateKey: vi.fn().mockResolvedValue({
    kty: 'OKP',
    crv: 'Ed25519',
    x: 'test-public-key',
    d: 'test-private-key',
  }),
  extractPublicKey: vi.fn().mockResolvedValue({
    kty: 'OKP',
    crv: 'Ed25519',
    x: 'test-public-key',
  }),
};

const mockVcExportService = {
  createSelfContainedVC: vi.fn().mockResolvedValue({
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential', 'DigitalProductPassport'],
    issuer: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    issuanceDate: '2026-01-08T12:00:00Z',
    credentialSubject: {
      id: 'urn:gtin:1234567890123',
      productName: 'Test Product',
    },
    proof: {
      type: 'JsonWebSignature2020',
      jws: 'test-signature',
    },
  }),
  exportPortablePackage: vi.fn().mockResolvedValue({
    files: [
      { name: 'credential.json', content: '{}' },
      { name: 'viewer.html', content: '<html></html>' },
      { name: 'public-key.jwk', content: '{}' },
    ],
    manifest: {
      version: '1.0.0',
      createdAt: '2026-01-08T12:00:00Z',
      issuerDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      subjectId: 'urn:gtin:1234567890123',
      hasPrivateKey: false,
    },
  }),
  generateOfflineViewer: vi.fn().mockReturnValue('<html>Viewer</html>'),
};

// Mock the identity package
vi.mock('@eurocomply/identity', () => ({
  getDidKeyService: vi.fn(() => mockDidKeyService),
  getVcExportService: vi.fn(() => mockVcExportService),
}));

describe('ExportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exportService.resetExportService();
  });

  describe('getOrCreateSupplierDid', () => {
    it('should_create_new_did_key_for_supplier_without_one', async () => {
      const result = await exportService.getOrCreateSupplierDid('supplier-123');

      expect(result.did).toMatch(/^did:key:/);
      expect(result.keyId).toBeTruthy();
      expect(result.isNew).toBe(true);
    });

    it('should_return_existing_did_if_supplier_has_one', async () => {
      // First call creates
      await exportService.getOrCreateSupplierDid('supplier-456');

      // Second call should return existing
      const result = await exportService.getOrCreateSupplierDid('supplier-456');

      expect(result.did).toMatch(/^did:key:/);
      expect(result.isNew).toBe(false);
    });
  });

  describe('exportProductDpp', () => {
    it('should_export_dpp_as_portable_package', async () => {
      const result = await exportService.exportProductDpp('supplier-123', 'product-456', {
        productName: 'Organic Cotton T-Shirt',
        gtin: '1234567890123',
        manufacturerName: 'EcoTextiles GmbH',
      });

      expect(result.files).toContainEqual(expect.objectContaining({ name: 'credential.json' }));
      expect(result.files).toContainEqual(expect.objectContaining({ name: 'viewer.html' }));
      expect(result.manifest).toBeDefined();
      expect(result.manifest.subjectId).toContain('1234567890123');
    });

    it('should_include_private_key_when_requested', async () => {
      mockVcExportService.exportPortablePackage.mockResolvedValueOnce({
        files: [
          { name: 'credential.json', content: '{}' },
          { name: 'viewer.html', content: '<html></html>' },
          { name: 'public-key.jwk', content: '{}' },
          { name: 'private-key.jwk', content: '{"d":"secret"}' },
        ],
        manifest: {
          version: '1.0.0',
          createdAt: '2026-01-08T12:00:00Z',
          issuerDid: 'did:key:z6Mk...',
          subjectId: 'urn:gtin:1234567890123',
          hasPrivateKey: true,
        },
      });

      const result = await exportService.exportProductDpp(
        'supplier-123',
        'product-456',
        { productName: 'Test', gtin: '1234567890123' },
        { includePrivateKey: true }
      );

      expect(result.manifest.hasPrivateKey).toBe(true);
      expect(result.files).toContainEqual(expect.objectContaining({ name: 'private-key.jwk' }));
    });
  });

  describe('exportSupplierKeys', () => {
    it('should_export_supplier_private_key', async () => {
      const result = await exportService.exportSupplierKeys('supplier-123');

      expect(result.did).toMatch(/^did:key:/);
      expect(result.privateKey).toBeDefined();
      expect(result.privateKey.d).toBeTruthy(); // Has private component
      expect(result.publicKey).toBeDefined();
    });

    it('should_include_warning_about_key_security', async () => {
      const result = await exportService.exportSupplierKeys('supplier-123');

      expect(result.warning).toContain('private');
      expect(result.warning).toContain('secure');
    });
  });

  describe('generateProductViewer', () => {
    it('should_generate_offline_html_viewer', async () => {
      const result = await exportService.generateProductViewer('supplier-123', 'product-456', {
        productName: 'Test Product',
        gtin: '1234567890123',
      });

      expect(result).toContain('<html');
      expect(result).toContain('Viewer');
    });
  });
});
