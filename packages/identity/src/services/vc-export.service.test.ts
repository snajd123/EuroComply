/**
 * VC Export Service Tests
 * TDD: Tests written FIRST before implementation
 *
 * Purpose: Enable data sovereignty through portable, self-contained VC exports
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VcExportService, getVcExportService, resetVcExportService } from './vc-export.service.js';
import { getDidKeyService, resetDidKeyService } from './did-key.service.js';
import type { VerifiableCredential } from '../types.js';

describe('VcExportService', () => {
  beforeEach(() => {
    resetVcExportService();
    resetDidKeyService();
  });

  const createSampleDPP = (): VerifiableCredential => ({
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://eurocomply.eu/contexts/dpp/v1',
    ],
    id: 'urn:uuid:12345678-1234-1234-1234-123456789012',
    type: ['VerifiableCredential', 'DigitalProductPassport'],
    issuer: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    issuanceDate: '2024-01-15T12:00:00Z',
    credentialSubject: {
      id: 'urn:gtin:1234567890123',
      productName: 'Organic Cotton T-Shirt',
      manufacturerName: 'EcoTextiles GmbH',
      gtin: '1234567890123',
      fiberComposition: [
        { material: 'Organic Cotton', percentage: 95 },
        { material: 'Elastane', percentage: 5 },
      ],
      certifications: ['GOTS', 'OEKO-TEX Standard 100'],
      carbonFootprint: { value: 5.2, unit: 'kg CO2e' },
      countryOfManufacture: 'DE',
      repairability: { score: 8, maxScore: 10 },
      durability: { expectedLifespan: 5, unit: 'years' },
    },
  });

  describe('createSelfContainedVC', () => {
    it('should_create_vc_with_all_dpp_data_embedded', async () => {
      // Arrange
      const service = getVcExportService();
      const didKeyService = getDidKeyService();
      const { did, keyId } = await didKeyService.createDidKey();
      const dppData = createSampleDPP().credentialSubject;

      // Act
      const vc = await service.createSelfContainedVC({
        issuerDid: did,
        issuerKeyId: keyId,
        subjectId: 'urn:gtin:1234567890123',
        dppData,
      });

      // Assert - VC contains all data, not just references
      expect(vc.credentialSubject.productName).toBe('Organic Cotton T-Shirt');
      expect(vc.credentialSubject.fiberComposition).toHaveLength(2);
      expect(vc.credentialSubject.certifications).toContain('GOTS');
      expect(vc.credentialSubject.carbonFootprint?.value).toBe(5.2);
    });

    it('should_sign_vc_with_did_key', async () => {
      // Arrange
      const service = getVcExportService();
      const didKeyService = getDidKeyService();
      const { did, keyId } = await didKeyService.createDidKey();
      const dppData = createSampleDPP().credentialSubject;

      // Act
      const vc = await service.createSelfContainedVC({
        issuerDid: did,
        issuerKeyId: keyId,
        subjectId: 'urn:gtin:1234567890123',
        dppData,
      });

      // Assert - VC has proof with did:key issuer
      expect(vc.issuer).toBe(did);
      expect(vc.proof).toBeDefined();
      expect(vc.proof?.verificationMethod).toContain(did);
    });

    it('should_include_embedded_images_as_base64', async () => {
      // Arrange
      const service = getVcExportService();
      const didKeyService = getDidKeyService();
      const { did, keyId } = await didKeyService.createDidKey();
      const dppData = createSampleDPP().credentialSubject;

      // Sample image data (tiny 1x1 PNG)
      const sampleImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      // Act
      const vc = await service.createSelfContainedVC({
        issuerDid: did,
        issuerKeyId: keyId,
        subjectId: 'urn:gtin:1234567890123',
        dppData,
        images: [{ name: 'product.png', data: sampleImage }],
      });

      // Assert - Images embedded as base64
      expect(vc.credentialSubject.images).toHaveLength(1);
      expect(vc.credentialSubject.images[0].data).toContain('data:image/png;base64');
    });
  });

  describe('exportPortablePackage', () => {
    it('should_create_zip_with_vc_and_viewer', async () => {
      // Arrange
      const service = getVcExportService();
      const didKeyService = getDidKeyService();
      const { did, keyId } = await didKeyService.createDidKey();
      const dppData = createSampleDPP().credentialSubject;

      // Act
      const packageData = await service.exportPortablePackage({
        issuerDid: did,
        issuerKeyId: keyId,
        subjectId: 'urn:gtin:1234567890123',
        dppData,
      });

      // Assert - Package contains required files
      expect(packageData.files).toContainEqual(expect.objectContaining({ name: 'credential.json' }));
      expect(packageData.files).toContainEqual(expect.objectContaining({ name: 'viewer.html' }));
      expect(packageData.manifest).toBeDefined();
    });

    it('should_include_private_key_for_signing_authority', async () => {
      // Arrange
      const service = getVcExportService();
      const didKeyService = getDidKeyService();
      const { did, keyId } = await didKeyService.createDidKey();
      const dppData = createSampleDPP().credentialSubject;

      // Act
      const packageData = await service.exportPortablePackage({
        issuerDid: did,
        issuerKeyId: keyId,
        subjectId: 'urn:gtin:1234567890123',
        dppData,
        includePrivateKey: true,
      });

      // Assert - Private key included for data ownership transfer
      const keyFile = packageData.files.find((f) => f.name === 'private-key.jwk');
      expect(keyFile).toBeDefined();
      expect(JSON.parse(keyFile!.content).d).toBeTruthy(); // Has private component
    });

    it('should_not_include_private_key_by_default', async () => {
      // Arrange
      const service = getVcExportService();
      const didKeyService = getDidKeyService();
      const { did, keyId } = await didKeyService.createDidKey();
      const dppData = createSampleDPP().credentialSubject;

      // Act
      const packageData = await service.exportPortablePackage({
        issuerDid: did,
        issuerKeyId: keyId,
        subjectId: 'urn:gtin:1234567890123',
        dppData,
      });

      // Assert - No private key by default
      const keyFile = packageData.files.find((f) => f.name === 'private-key.jwk');
      expect(keyFile).toBeUndefined();
    });
  });

  describe('verifyOffline', () => {
    it('should_verify_vc_without_network_using_embedded_did_key', async () => {
      // Arrange
      const service = getVcExportService();
      const didKeyService = getDidKeyService();
      const { did, keyId } = await didKeyService.createDidKey();
      const dppData = createSampleDPP().credentialSubject;

      const vc = await service.createSelfContainedVC({
        issuerDid: did,
        issuerKeyId: keyId,
        subjectId: 'urn:gtin:1234567890123',
        dppData,
      });

      // Simulate exporting and importing on different machine
      const vcJson = JSON.stringify(vc);

      // Create new service instance (simulating different machine)
      resetVcExportService();
      resetDidKeyService();
      const newService = getVcExportService();

      // Act - Verify using only the VC data (no network)
      const result = await newService.verifyOffline(JSON.parse(vcJson));

      // Assert
      expect(result.valid).toBe(true);
      expect(result.issuerDid).toBe(did);
      expect(result.issuerDid).toMatch(/^did:key:/);
    });

    it('should_reject_tampered_vc', async () => {
      // Arrange
      const service = getVcExportService();
      const didKeyService = getDidKeyService();
      const { did, keyId } = await didKeyService.createDidKey();
      const dppData = createSampleDPP().credentialSubject;

      const vc = await service.createSelfContainedVC({
        issuerDid: did,
        issuerKeyId: keyId,
        subjectId: 'urn:gtin:1234567890123',
        dppData,
      });

      // Tamper with the VC
      vc.credentialSubject.carbonFootprint = { value: 0.1, unit: 'kg CO2e' }; // Falsified!

      // Act
      const result = await service.verifyOffline(vc);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toContain('signature');
    });

    it('should_fail_for_non_did_key_issuer', async () => {
      // Arrange
      const service = getVcExportService();
      const vc = createSampleDPP();
      vc.issuer = 'did:web:example.com'; // Not a did:key

      // Act
      const result = await service.verifyOffline(vc);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toContain('did:key');
    });
  });

  describe('generateOfflineViewer', () => {
    it('should_generate_self_contained_html_viewer', async () => {
      // Arrange
      const service = getVcExportService();
      const vc = createSampleDPP();

      // Act
      const html = service.generateOfflineViewer(vc);

      // Assert - HTML is self-contained
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Organic Cotton T-Shirt'); // Product name
      expect(html).toContain('GOTS'); // Certification
      expect(html).toContain('5.2'); // Carbon footprint
      // Check no external script/link dependencies (XML namespaces like w3.org are OK)
      expect(html).not.toMatch(/<script[^>]*src=/); // No external scripts
      expect(html).not.toMatch(/<link[^>]*href=["']http/); // No external stylesheets
    });

    it('should_include_qr_code_in_viewer', async () => {
      // Arrange
      const service = getVcExportService();
      const vc = createSampleDPP();

      // Act
      const html = service.generateOfflineViewer(vc);

      // Assert - Has QR code (as SVG or data URI)
      expect(html).toMatch(/<svg|data:image/);
    });
  });
});
