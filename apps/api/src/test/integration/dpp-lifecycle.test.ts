/**
 * DPP Snapshot Lifecycle Tests
 *
 * Tests the complete DPP workflow:
 * PENDING_REVIEW → VERIFIED → ATTESTED → SEALED → ISSUED → REVOKED
 *
 * These tests use a mock EntityManager to test service logic without a database.
 */
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { EntityManager } from '@mikro-orm/postgresql';
import { DPPSnapshotService } from '../../services/dpp-snapshot.service.js';
import { ValidationError, NotFoundError } from '../../lib/errors.js';

// Mock snapshot data factory
function createMockSnapshot(overrides: Partial<{
  id: string;
  organizationId: string;
  productId: string;
  status: string;
  dataHash: string;
  data: Record<string, unknown>;
}> = {}) {
  return {
    id: 'snapshot-123',
    organizationId: 'org-456',
    productId: 'product-789',
    designVersionId: 'design-v1',
    marketingVersionId: null,
    data: { product: { name: 'Test Product' } },
    dataHash: 'abc123hash',
    readinessProfileId: 'profile-1',
    completionScore: 100,
    status: 'PENDING_REVIEW',
    verifiedAt: null,
    verifiedBy: null,
    attestedAt: null,
    attestedBy: null,
    userSignatureDid: null,
    userSignatureJws: null,
    userForensicContext: null,
    sealedAt: null,
    orgSignatureDid: null,
    orgSignatureJws: null,
    orgForensicContext: null,
    issuedAt: null,
    vcId: null,
    vcJwt: null,
    dppUrl: null,
    qrCodeUrl: null,
    credentialStatusIndex: null,
    timestampProof: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock EntityManager for MikroORM-based service testing.
 */
function createMockEm() {
  const mockSnapshot = createMockSnapshot();

  const em = {
    findOne: vi.fn().mockResolvedValue(mockSnapshot),
    find: vi.fn().mockResolvedValue([mockSnapshot]),
    create: vi.fn().mockImplementation((_entity, data) => ({ ...mockSnapshot, ...data })),
    persist: vi.fn(),
    flush: vi.fn(),
    remove: vi.fn(),
    getReference: vi.fn().mockImplementation((_entity, id) => ({ id })),
    transactional: vi.fn().mockImplementation(async (callback) => callback(em)),
    fork: vi.fn().mockReturnThis(),
    lock: vi.fn(),
  } as unknown as EntityManager;

  return em;
}

describe('DPP Snapshot Lifecycle', () => {
  let mockEm: EntityManager;
  let service: DPPSnapshotService;

  beforeEach(() => {
    mockEm = createMockEm();
    service = new DPPSnapshotService(mockEm);
  });

  describe('Status Transitions', () => {
    it('should verify a PENDING_REVIEW snapshot', async () => {
      const snapshot = createMockSnapshot({ status: 'PENDING_REVIEW' });
      (mockEm.findOne as Mock).mockResolvedValue(snapshot);

      const result = await service.verify('snapshot-123', 'user-1');

      expect(mockEm.findOne).toHaveBeenCalled();
      expect(mockEm.flush).toHaveBeenCalled();
      expect(result.status).toBe('VERIFIED');
    });

    it('should attest a VERIFIED snapshot', async () => {
      const snapshot = createMockSnapshot({ status: 'VERIFIED' });
      (mockEm.findOne as Mock).mockResolvedValue(snapshot);

      const attestInput = {
        userSignatureDid: 'did:key:z6MkTest123',
        userSignatureJws: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9...',
        userForensicContext: {
          userId: 'user-1',
          signedAt: '2026-01-19T12:00:00Z',
        },
      };

      const result = await service.attest('snapshot-123', 'user-1', attestInput);

      expect(result.status).toBe('ATTESTED');
      expect(result.userSignatureDid).toBe('did:key:z6MkTest123');
    });

    it('should seal an ATTESTED snapshot', async () => {
      const snapshot = createMockSnapshot({ status: 'ATTESTED' });
      (mockEm.findOne as Mock).mockResolvedValue(snapshot);

      const sealInput = {
        orgSignatureDid: 'did:key:z6MkOrg456',
        orgSignatureJws: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9...',
        orgForensicContext: {
          organizationId: 'org-456',
          signedAt: '2026-01-19T12:01:00Z',
        },
      };

      const result = await service.seal('snapshot-123', sealInput);

      expect(result.status).toBe('SEALED');
      expect(result.orgSignatureDid).toBe('did:key:z6MkOrg456');
    });

    it('should issue a SEALED snapshot', async () => {
      const snapshot = createMockSnapshot({ status: 'SEALED' });
      (mockEm.findOne as Mock).mockResolvedValue(snapshot);

      const issueInput = {
        vcId: 'urn:uuid:12345',
        vcJwt: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9...',
        dppUrl: 'https://dpp.eurocomply.eu/12345',
        qrCodeUrl: 'https://qr.eurocomply.eu/12345.png',
        credentialStatusIndex: 42,
        timestampProof: { tsa: 'freetsa.org', timestamp: '2026-01-19T12:02:00Z' },
      };

      const result = await service.issue('snapshot-123', issueInput);

      expect(result.status).toBe('ISSUED');
      expect(result.vcId).toBe('urn:uuid:12345');
      expect(result.dppUrl).toBe('https://dpp.eurocomply.eu/12345');
    });

    it('should revoke an ISSUED snapshot', async () => {
      const snapshot = createMockSnapshot({ status: 'ISSUED' });
      (mockEm.findOne as Mock).mockResolvedValue(snapshot);

      const result = await service.revoke('snapshot-123', 'No longer valid');

      expect(result.status).toBe('REVOKED');
    });
  });

  describe('Invalid Transitions', () => {
    it('should reject PENDING_REVIEW → ATTESTED (must verify first)', async () => {
      const snapshot = createMockSnapshot({ status: 'PENDING_REVIEW' });
      (mockEm.findOne as Mock).mockResolvedValue(snapshot);

      await expect(
        service.attest('snapshot-123', 'user-1', {
          userSignatureDid: 'did:key:test',
          userSignatureJws: 'jws',
          userForensicContext: {},
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should reject VERIFIED → SEALED (must attest first)', async () => {
      const snapshot = createMockSnapshot({ status: 'VERIFIED' });
      (mockEm.findOne as Mock).mockResolvedValue(snapshot);

      await expect(
        service.seal('snapshot-123', {
          orgSignatureDid: 'did:key:test',
          orgSignatureJws: 'jws',
          orgForensicContext: {},
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should reject ATTESTED → ISSUED (must seal first)', async () => {
      const snapshot = createMockSnapshot({ status: 'ATTESTED' });
      (mockEm.findOne as Mock).mockResolvedValue(snapshot);

      await expect(
        service.issue('snapshot-123', {
          vcId: 'urn:uuid:123',
          vcJwt: 'jwt',
          dppUrl: 'https://dpp.test',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should reject REVOKED → any transition', async () => {
      const snapshot = createMockSnapshot({ status: 'REVOKED' });
      (mockEm.findOne as Mock).mockResolvedValue(snapshot);

      await expect(service.verify('snapshot-123', 'user-1')).rejects.toThrow(ValidationError);
    });
  });

  describe('Error Handling', () => {
    it('should throw NotFoundError for non-existent snapshot', async () => {
      (mockEm.findOne as Mock).mockResolvedValue(null);

      await expect(service.verify('nonexistent', 'user-1')).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for wrong organization', async () => {
      (mockEm.findOne as Mock).mockResolvedValue(null);

      await expect(service.verify('snapshot-123', 'user-1')).rejects.toThrow(NotFoundError);
    });
  });

  describe('Complete Lifecycle Flow', () => {
    it('should progress through complete lifecycle', async () => {
      // Start with PENDING_REVIEW
      let snapshot = createMockSnapshot({ status: 'PENDING_REVIEW' });
      (mockEm.findOne as Mock).mockResolvedValue(snapshot);

      // Verify
      let result = await service.verify('snapshot-123', 'user-1');
      expect(result.status).toBe('VERIFIED');

      // Update mock for next state
      snapshot = { ...snapshot, status: 'VERIFIED', verifiedBy: { id: 'user-1' }, verifiedAt: new Date() };
      (mockEm.findOne as Mock).mockResolvedValue(snapshot);

      // Attest
      result = await service.attest('snapshot-123', 'user-1', {
        userSignatureDid: 'did:key:z6MkUser',
        userSignatureJws: 'user-jws',
        userForensicContext: { signedAt: new Date().toISOString() },
      });
      expect(result.status).toBe('ATTESTED');

      // Update mock for next state
      snapshot = { ...snapshot, status: 'ATTESTED', attestedBy: { id: 'user-1' }, attestedAt: new Date() };
      (mockEm.findOne as Mock).mockResolvedValue(snapshot);

      // Seal
      result = await service.seal('snapshot-123', {
        orgSignatureDid: 'did:key:z6MkOrg',
        orgSignatureJws: 'org-jws',
        orgForensicContext: { signedAt: new Date().toISOString() },
      });
      expect(result.status).toBe('SEALED');

      // Update mock for next state
      snapshot = { ...snapshot, status: 'SEALED', sealedAt: new Date() };
      (mockEm.findOne as Mock).mockResolvedValue(snapshot);

      // Issue
      result = await service.issue('snapshot-123', {
        vcId: 'urn:uuid:final',
        vcJwt: 'final-jwt',
        dppUrl: 'https://dpp.eurocomply.eu/final',
      });
      expect(result.status).toBe('ISSUED');

      // Update mock for next state
      snapshot = { ...snapshot, status: 'ISSUED', issuedAt: new Date() };
      (mockEm.findOne as Mock).mockResolvedValue(snapshot);

      // Revoke
      result = await service.revoke('snapshot-123', 'Product recalled');
      expect(result.status).toBe('REVOKED');
    });
  });
});
