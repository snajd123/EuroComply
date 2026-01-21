import { describe, it, expect } from 'vitest';
import { DppSnapshot, DppSnapshotStatus } from './DppSnapshot.js';
import { Product, ProductType, ProductStatus } from './Product.js';
import { ProductVersion, VersionStatus, Workspace } from './ProductVersion.js';
import { ReadinessProfile } from './ReadinessProfile.js';
import { User } from './User.js';

describe('DppSnapshot Entity', () => {
  describe('DppSnapshotStatus enum', () => {
    it('should have all workflow status values', () => {
      expect(DppSnapshotStatus.PENDING_REVIEW).toBe('PENDING_REVIEW');
      expect(DppSnapshotStatus.VERIFIED).toBe('VERIFIED');
      expect(DppSnapshotStatus.ATTESTED).toBe('ATTESTED');
      expect(DppSnapshotStatus.SEALED).toBe('SEALED');
      expect(DppSnapshotStatus.ISSUED).toBe('ISSUED');
      expect(DppSnapshotStatus.REVOKED).toBe('REVOKED');
    });

    it('should have exactly six status values', () => {
      const statusValues = Object.values(DppSnapshotStatus);
      expect(statusValues).toHaveLength(6);
    });
  });

  describe('DppSnapshot class', () => {
    it('should be instantiable', () => {
      const snapshot = new DppSnapshot();
      expect(snapshot).toBeInstanceOf(DppSnapshot);
    });

    it('should have default status of PENDING_REVIEW', () => {
      const snapshot = new DppSnapshot();
      expect(snapshot.status).toBe(DppSnapshotStatus.PENDING_REVIEW);
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

      const profile = new ReadinessProfile();
      profile.id = 'rp_123';
      profile.name = 'Test Profile';

      snapshot.id = 'dpp_123';
      snapshot.product = product;
      snapshot.designVersion = designVersion;
      snapshot.readinessProfile = profile;
      snapshot.data = { product: { name: 'Test' } };
      snapshot.dataHash = 'a'.repeat(64);
      snapshot.completionScore = 100;

      expect(snapshot.id).toBe('dpp_123');
      expect(snapshot.product).toBe(product);
      expect(snapshot.designVersion).toBe(designVersion);
      expect(snapshot.readinessProfile).toBe(profile);
      expect(snapshot.data).toEqual({ product: { name: 'Test' } });
      expect(snapshot.dataHash).toHaveLength(64);
      expect(snapshot.completionScore).toBe(100);
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

    it('should allow setting verification fields', () => {
      const snapshot = new DppSnapshot();
      const verifier = new User();
      verifier.id = 'usr_verifier';

      snapshot.verifiedAt = new Date('2024-01-15T10:00:00Z');
      snapshot.verifiedBy = verifier;

      expect(snapshot.verifiedAt).toEqual(new Date('2024-01-15T10:00:00Z'));
      expect(snapshot.verifiedBy).toBe(verifier);
    });

    it('should allow setting attestation fields', () => {
      const snapshot = new DppSnapshot();
      const attester = new User();
      attester.id = 'usr_attester';

      snapshot.attestedAt = new Date('2024-01-15T11:00:00Z');
      snapshot.attestedBy = attester;
      snapshot.userSignatureDid = 'did:key:z123';
      snapshot.userSignatureJws = 'eyJ...';
      snapshot.userForensicContext = { signerName: 'Test User' };

      expect(snapshot.attestedAt).toEqual(new Date('2024-01-15T11:00:00Z'));
      expect(snapshot.attestedBy).toBe(attester);
      expect(snapshot.userSignatureDid).toBe('did:key:z123');
      expect(snapshot.userSignatureJws).toBe('eyJ...');
      expect(snapshot.userForensicContext).toEqual({ signerName: 'Test User' });
    });

    it('should allow setting sealing fields', () => {
      const snapshot = new DppSnapshot();

      snapshot.sealedAt = new Date('2024-01-15T12:00:00Z');
      snapshot.orgSignatureDid = 'did:key:zOrg123';
      snapshot.orgSignatureJws = 'eyJ...org';
      snapshot.orgForensicContext = { organizationName: 'Test Org' };

      expect(snapshot.sealedAt).toEqual(new Date('2024-01-15T12:00:00Z'));
      expect(snapshot.orgSignatureDid).toBe('did:key:zOrg123');
      expect(snapshot.orgSignatureJws).toBe('eyJ...org');
      expect(snapshot.orgForensicContext).toEqual({ organizationName: 'Test Org' });
    });

    it('should allow setting issuance fields', () => {
      const snapshot = new DppSnapshot();

      snapshot.issuedAt = new Date('2024-01-15T13:00:00Z');
      snapshot.vcId = 'vc_123';
      snapshot.vcJwt = 'eyJ...vc';
      snapshot.dppUrl = 'https://dpp.eurocomply.eu/org/prod';
      snapshot.qrCodeUrl = 'https://dpp.eurocomply.eu/qr/123.png';

      expect(snapshot.issuedAt).toEqual(new Date('2024-01-15T13:00:00Z'));
      expect(snapshot.vcId).toBe('vc_123');
      expect(snapshot.vcJwt).toBe('eyJ...vc');
      expect(snapshot.dppUrl).toBe('https://dpp.eurocomply.eu/org/prod');
      expect(snapshot.qrCodeUrl).toBe('https://dpp.eurocomply.eu/qr/123.png');
    });

    it('should allow setting revocation fields', () => {
      const snapshot = new DppSnapshot();

      snapshot.credentialStatusIndex = 42;
      snapshot.timestampProof = { timestamp: '2024-01-15T14:00:00Z', proof: 'abc' };

      expect(snapshot.credentialStatusIndex).toBe(42);
      expect(snapshot.timestampProof).toEqual({ timestamp: '2024-01-15T14:00:00Z', proof: 'abc' });
    });

    it('should allow transitioning through all workflow statuses', () => {
      const snapshot = new DppSnapshot();
      expect(snapshot.status).toBe(DppSnapshotStatus.PENDING_REVIEW);

      snapshot.status = DppSnapshotStatus.VERIFIED;
      expect(snapshot.status).toBe(DppSnapshotStatus.VERIFIED);

      snapshot.status = DppSnapshotStatus.ATTESTED;
      expect(snapshot.status).toBe(DppSnapshotStatus.ATTESTED);

      snapshot.status = DppSnapshotStatus.SEALED;
      expect(snapshot.status).toBe(DppSnapshotStatus.SEALED);

      snapshot.status = DppSnapshotStatus.ISSUED;
      expect(snapshot.status).toBe(DppSnapshotStatus.ISSUED);

      snapshot.status = DppSnapshotStatus.REVOKED;
      expect(snapshot.status).toBe(DppSnapshotStatus.REVOKED);
    });
  });
});
