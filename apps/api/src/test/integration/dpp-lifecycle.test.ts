/**
 * DPP Snapshot Lifecycle Tests
 *
 * Tests the complete DPP workflow:
 * PENDING_REVIEW → VERIFIED → ATTESTED → SEALED → ISSUED → REVOKED
 *
 * These tests use a mock Prisma client to test service logic without a database.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

describe('DPP Snapshot Lifecycle', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let service: DPPSnapshotService;

  function createMockPrisma() {
    const mockSnapshot = createMockSnapshot();

    return {
      dPPSnapshot: {
        findFirst: vi.fn().mockResolvedValue(mockSnapshot),
        findMany: vi.fn().mockResolvedValue([mockSnapshot]),
        create: vi.fn().mockResolvedValue(mockSnapshot),
        update: vi.fn().mockImplementation(async ({ data }) => ({
          ...mockSnapshot,
          ...data,
        })),
      },
      product: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'product-789',
          organizationId: 'org-456',
          name: 'Test Product',
          identifiers: [],
          bomEntriesAsParent: [],
        }),
      },
      productVersion: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'design-v1',
          productId: 'product-789',
          workspace: 'DESIGN',
          status: 'RELEASED',
          versionNumber: 1,
          bomEntries: [],
        }),
      },
      readinessProfile: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'profile-1',
          name: 'EU ESPR',
          requiredFields: {},
        }),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        return callback(mockPrisma);
      }),
    };
  }

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new DPPSnapshotService(mockPrisma as never);
  });

  describe('Status Transitions', () => {
    it('should verify a PENDING_REVIEW snapshot', async () => {
      const snapshot = createMockSnapshot({ status: 'PENDING_REVIEW' });
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue(snapshot);

      const result = await service.verify('org-456', 'snapshot-123', 'user-1');

      expect(mockPrisma.dPPSnapshot.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'snapshot-123' },
          data: expect.objectContaining({
            status: 'VERIFIED',
            verifiedBy: 'user-1',
          }),
        })
      );
      expect(result.status).toBe('VERIFIED');
    });

    it('should attest a VERIFIED snapshot', async () => {
      const snapshot = createMockSnapshot({ status: 'VERIFIED' });
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue(snapshot);

      const attestInput = {
        userSignatureDid: 'did:key:z6MkTest123',
        userSignatureJws: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9...',
        userForensicContext: {
          userId: 'user-1',
          signedAt: '2026-01-19T12:00:00Z',
        },
      };

      const result = await service.attest('org-456', 'snapshot-123', 'user-1', attestInput);

      expect(mockPrisma.dPPSnapshot.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ATTESTED',
            attestedBy: 'user-1',
            userSignatureDid: 'did:key:z6MkTest123',
          }),
        })
      );
      expect(result.status).toBe('ATTESTED');
    });

    it('should seal an ATTESTED snapshot', async () => {
      const snapshot = createMockSnapshot({ status: 'ATTESTED' });
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue(snapshot);

      const sealInput = {
        orgSignatureDid: 'did:key:z6MkOrg456',
        orgSignatureJws: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9...',
        orgForensicContext: {
          organizationId: 'org-456',
          signedAt: '2026-01-19T12:01:00Z',
        },
      };

      const result = await service.seal('org-456', 'snapshot-123', sealInput);

      expect(mockPrisma.dPPSnapshot.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'SEALED',
            orgSignatureDid: 'did:key:z6MkOrg456',
          }),
        })
      );
      expect(result.status).toBe('SEALED');
    });

    it('should issue a SEALED snapshot', async () => {
      const snapshot = createMockSnapshot({ status: 'SEALED' });
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue(snapshot);

      const issueInput = {
        vcId: 'vc-uuid-123',
        vcJwt: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9...',
        dppUrl: 'https://dpp.eurocomply.eu/org-456/product-789',
        qrCodeUrl: 'https://api.eurocomply.eu/qr/abc123',
        credentialStatusIndex: 42,
      };

      const result = await service.issue('org-456', 'snapshot-123', issueInput);

      expect(mockPrisma.dPPSnapshot.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ISSUED',
            vcId: 'vc-uuid-123',
            dppUrl: 'https://dpp.eurocomply.eu/org-456/product-789',
            credentialStatusIndex: 42,
          }),
        })
      );
      expect(result.status).toBe('ISSUED');
    });

    it('should revoke an ISSUED snapshot', async () => {
      const snapshot = createMockSnapshot({ status: 'ISSUED' });
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue(snapshot);

      const result = await service.revoke('org-456', 'snapshot-123');

      expect(mockPrisma.dPPSnapshot.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'REVOKED',
          }),
        })
      );
      expect(result.status).toBe('REVOKED');
    });
  });

  describe('Invalid Transitions', () => {
    it('should reject PENDING_REVIEW → ATTESTED (must verify first)', async () => {
      const snapshot = createMockSnapshot({ status: 'PENDING_REVIEW' });
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue(snapshot);

      await expect(
        service.attest('org-456', 'snapshot-123', 'user-1', {
          userSignatureDid: 'did:key:z6MkTest123',
          userSignatureJws: 'sig...',
          userForensicContext: {},
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should reject VERIFIED → SEALED (must attest first)', async () => {
      const snapshot = createMockSnapshot({ status: 'VERIFIED' });
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue(snapshot);

      await expect(
        service.seal('org-456', 'snapshot-123', {
          orgSignatureDid: 'did:key:z6MkOrg456',
          orgSignatureJws: 'sig...',
          orgForensicContext: {},
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should reject ATTESTED → ISSUED (must seal first)', async () => {
      const snapshot = createMockSnapshot({ status: 'ATTESTED' });
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue(snapshot);

      await expect(
        service.issue('org-456', 'snapshot-123', {
          vcId: 'vc-123',
          vcJwt: 'jwt...',
          dppUrl: 'https://example.com',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should reject REVOKED → any transition', async () => {
      const snapshot = createMockSnapshot({ status: 'REVOKED' });
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue(snapshot);

      // Cannot verify a revoked snapshot
      await expect(
        service.verify('org-456', 'snapshot-123', 'user-1')
      ).rejects.toThrow(ValidationError);

      // Cannot issue a revoked snapshot
      await expect(
        service.issue('org-456', 'snapshot-123', {
          vcId: 'vc-123',
          vcJwt: 'jwt...',
          dppUrl: 'https://example.com',
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('Not Found Handling', () => {
    it('should throw NotFoundError for non-existent snapshot', async () => {
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue(null);

      await expect(
        service.verify('org-456', 'nonexistent', 'user-1')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for wrong organization', async () => {
      // Simulates snapshot belonging to different org (query returns null)
      mockPrisma.dPPSnapshot.findFirst.mockResolvedValue(null);

      await expect(
        service.verify('wrong-org', 'snapshot-123', 'user-1')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('Complete Lifecycle Flow', () => {
    it('should progress through complete lifecycle', async () => {
      // This test demonstrates the expected sequence
      const states = [
        'PENDING_REVIEW',
        'VERIFIED',
        'ATTESTED',
        'SEALED',
        'ISSUED',
        'REVOKED',
      ];

      // Track state transitions
      let currentState = 'PENDING_REVIEW';
      mockPrisma.dPPSnapshot.findFirst.mockImplementation(() =>
        Promise.resolve(createMockSnapshot({ status: currentState }))
      );
      mockPrisma.dPPSnapshot.update.mockImplementation(({ data }) => {
        currentState = data.status as string;
        return Promise.resolve(createMockSnapshot({ status: currentState }));
      });

      // 1. Verify
      await service.verify('org-456', 'snapshot-123', 'user-1');
      expect(currentState).toBe('VERIFIED');

      // 2. Attest
      await service.attest('org-456', 'snapshot-123', 'user-1', {
        userSignatureDid: 'did:key:z6MkUser',
        userSignatureJws: 'sig...',
        userForensicContext: { signedAt: new Date().toISOString() },
      });
      expect(currentState).toBe('ATTESTED');

      // 3. Seal
      await service.seal('org-456', 'snapshot-123', {
        orgSignatureDid: 'did:key:z6MkOrg',
        orgSignatureJws: 'sig...',
        orgForensicContext: { signedAt: new Date().toISOString() },
      });
      expect(currentState).toBe('SEALED');

      // 4. Issue
      await service.issue('org-456', 'snapshot-123', {
        vcId: 'vc-123',
        vcJwt: 'jwt...',
        dppUrl: 'https://dpp.eurocomply.eu/test',
      });
      expect(currentState).toBe('ISSUED');

      // 5. Revoke
      await service.revoke('org-456', 'snapshot-123');
      expect(currentState).toBe('REVOKED');
    });
  });
});
