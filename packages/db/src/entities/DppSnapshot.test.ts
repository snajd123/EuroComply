import { describe, it, expect } from 'vitest';
import { DppSnapshot, DppStatus } from './DppSnapshot.js';
import { Product, ProductType, ProductStatus } from './Product.js';
import { ProductVersion, VersionStatus, Workspace } from './ProductVersion.js';

describe('DppSnapshot Entity', () => {
  describe('DppStatus enum', () => {
    it('should have ACTIVE status', () => {
      expect(DppStatus.ACTIVE).toBe('ACTIVE');
    });

    it('should have REVOKED status', () => {
      expect(DppStatus.REVOKED).toBe('REVOKED');
    });

    it('should only have two status values', () => {
      const statusValues = Object.values(DppStatus);
      expect(statusValues).toHaveLength(2);
      expect(statusValues).toContain('ACTIVE');
      expect(statusValues).toContain('REVOKED');
    });
  });

  describe('DppSnapshot class', () => {
    it('should be instantiable', () => {
      const snapshot = new DppSnapshot();
      expect(snapshot).toBeInstanceOf(DppSnapshot);
    });

    it('should have default status of ACTIVE', () => {
      const snapshot = new DppSnapshot();
      expect(snapshot.status).toBe(DppStatus.ACTIVE);
    });

    it('should have default createdAt timestamp', () => {
      const before = new Date();
      const snapshot = new DppSnapshot();
      const after = new Date();

      expect(snapshot.createdAt).toBeInstanceOf(Date);
      expect(snapshot.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(snapshot.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should allow setting required fields', () => {
      const snapshot = new DppSnapshot();
      const product = new Product();
      product.id = 'prod_123';
      product.name = 'Test Product';

      const designVersion = new ProductVersion();
      designVersion.id = 'ver_design_123';
      designVersion.product = product;
      designVersion.workspace = Workspace.DESIGN;
      designVersion.versionNumber = 1;

      snapshot.id = 'dpp_123';
      snapshot.product = product;
      snapshot.designVersion = designVersion;
      snapshot.credentialHash = 'a'.repeat(64);
      snapshot.issuerDid = 'did:web:example.com';
      snapshot.issuedAt = new Date('2024-01-15T10:00:00Z');
      snapshot.r2Path = '/bucket/path/to/credential.json';

      expect(snapshot.id).toBe('dpp_123');
      expect(snapshot.product).toBe(product);
      expect(snapshot.designVersion).toBe(designVersion);
      expect(snapshot.credentialHash).toHaveLength(64);
      expect(snapshot.issuerDid).toBe('did:web:example.com');
      expect(snapshot.issuedAt).toEqual(new Date('2024-01-15T10:00:00Z'));
      expect(snapshot.r2Path).toBe('/bucket/path/to/credential.json');
    });

    it('should allow setting optional marketingVersion', () => {
      const snapshot = new DppSnapshot();
      const product = new Product();
      product.id = 'prod_456';
      product.name = 'Test Product';

      const marketingVersion = new ProductVersion();
      marketingVersion.id = 'ver_marketing_456';
      marketingVersion.product = product;
      marketingVersion.workspace = Workspace.MARKETING;
      marketingVersion.versionNumber = 1;

      snapshot.marketingVersion = marketingVersion;

      expect(snapshot.marketingVersion).toBe(marketingVersion);
    });

    it('should allow optional marketingVersion to be undefined', () => {
      const snapshot = new DppSnapshot();
      expect(snapshot.marketingVersion).toBeUndefined();
    });

    it('should allow setting optional qrCodeUrl', () => {
      const snapshot = new DppSnapshot();
      snapshot.qrCodeUrl = 'https://example.com/qr/123.png';

      expect(snapshot.qrCodeUrl).toBe('https://example.com/qr/123.png');
    });

    it('should allow optional qrCodeUrl to be undefined', () => {
      const snapshot = new DppSnapshot();
      expect(snapshot.qrCodeUrl).toBeUndefined();
    });

    it('should allow changing status to REVOKED', () => {
      const snapshot = new DppSnapshot();
      expect(snapshot.status).toBe(DppStatus.ACTIVE);

      snapshot.status = DppStatus.REVOKED;
      expect(snapshot.status).toBe(DppStatus.REVOKED);
    });
  });
});
