import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { OperationsEventService } from './operations-event.service.js';
import { SigningService } from './signing.service.js';
import { ValidationError } from '../lib/errors.js';
import type { UserForensicContext, OrgForensicContext, SealedArtifact } from '@eurocomply/shared';

interface MockPrismaClient {
  operationsEvent: {
    create: Mock;
    findFirst: Mock;
    findMany: Mock;
    update: Mock;
  };
  organization: {
    findUnique: Mock;
    update: Mock;
  };
  $transaction: Mock;
}

const mockPrisma: MockPrismaClient = {
  operationsEvent: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  organization: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn((fn) => fn(mockPrisma)),
};

describe('OperationsEventService', () => {
  let service: OperationsEventService;
  const orgId = 'org_test123';
  const userId = 'user_123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OperationsEventService(mockPrisma as any);
  });

  describe('recordEvent', () => {
    it('should create first event with sequence 1 and GENESIS hash', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        lastEventHash: null,
        eventSequence: 0,
      });
      mockPrisma.operationsEvent.create.mockResolvedValue({
        id: 'evt_123',
        eventType: 'BATCH_PRODUCED',
        sequenceNumber: 1,
        eventHash: 'abc123',
        previousEventHash: 'GENESIS',
      });
      mockPrisma.organization.update.mockResolvedValue({});

      const result = await service.recordEvent(orgId, userId, {
        eventType: 'BATCH_PRODUCED',
        payload: {
          productId: 'prod_123',
          designVersionId: 'ver_456',
          batchNumber: 'BATCH-001',
          quantity: 100,
          unit: 'PCS',
          facilityId: 'fac_789',
          startedAt: '2026-01-18T08:00:00Z',
          completedAt: '2026-01-18T16:00:00Z',
        },
      });

      expect(result.sequenceNumber).toBe(1);
      expect(result.previousEventHash).toBe('GENESIS');
    });

    it('should chain events with previous hash', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        lastEventHash: 'previous_hash_abc',
        eventSequence: 5,
      });
      mockPrisma.operationsEvent.create.mockResolvedValue({
        id: 'evt_124',
        eventType: 'MATERIAL_CONSUMED',
        sequenceNumber: 6,
        eventHash: 'new_hash_xyz',
        previousEventHash: 'previous_hash_abc',
      });
      mockPrisma.organization.update.mockResolvedValue({});

      const result = await service.recordEvent(orgId, userId, {
        eventType: 'MATERIAL_CONSUMED',
        payload: {
          batchId: 'batch_123',
          materialLotId: 'lot_456',
          quantity: 50,
          unit: 'KG',
          wasteQuantity: 2,
        },
      });

      expect(result.sequenceNumber).toBe(6);
      expect(result.previousEventHash).toBe('previous_hash_abc');
    });

    it('should reject invalid payload', async () => {
      await expect(
        service.recordEvent(orgId, userId, {
          eventType: 'BATCH_PRODUCED',
          payload: { invalid: 'data' },
        })
      ).rejects.toThrow();
    });

    it('should use SERIALIZABLE isolation level to prevent race conditions', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        lastEventHash: null,
        eventSequence: 0,
      });
      mockPrisma.operationsEvent.create.mockResolvedValue({
        id: 'evt_123',
        eventType: 'BATCH_PRODUCED',
        sequenceNumber: 1,
        eventHash: 'abc123',
        previousEventHash: 'GENESIS',
      });
      mockPrisma.organization.update.mockResolvedValue({});

      await service.recordEvent(orgId, userId, {
        eventType: 'BATCH_PRODUCED',
        payload: {
          productId: 'prod_123',
          designVersionId: 'ver_456',
          batchNumber: 'BATCH-001',
          quantity: 100,
          unit: 'PCS',
          facilityId: 'fac_789',
          startedAt: '2026-01-18T08:00:00Z',
          completedAt: '2026-01-18T16:00:00Z',
        },
      });

      // Verify transaction was called with SERIALIZABLE isolation
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { isolationLevel: 'Serializable' }
      );
    });
  });

  describe('verifyEvent', () => {
    it('should seal event with EDITOR signature', async () => {
      mockPrisma.operationsEvent.findFirst.mockResolvedValue({
        id: 'evt_123',
        status: 'PENDING_VERIFICATION',
        organizationId: orgId,
      });
      mockPrisma.operationsEvent.update.mockResolvedValue({
        id: 'evt_123',
        status: 'VERIFIED',
        verifiedBy: userId,
        verifiedAt: new Date(),
      });

      const result = await service.verifyEvent(orgId, 'evt_123', userId);

      expect(result.status).toBe('VERIFIED');
      expect(result.verifiedBy).toBe(userId);
    });

    it('should reject already verified event', async () => {
      mockPrisma.operationsEvent.findFirst.mockResolvedValue({
        id: 'evt_123',
        status: 'VERIFIED',
        organizationId: orgId,
      });

      await expect(
        service.verifyEvent(orgId, 'evt_123', userId)
      ).rejects.toThrow(ValidationError);
    });

    it('should verify without signing when no signing context provided (backward compatibility)', async () => {
      mockPrisma.operationsEvent.findFirst.mockResolvedValue({
        id: 'evt_123',
        status: 'PENDING_VERIFICATION',
        organizationId: orgId,
      });
      mockPrisma.operationsEvent.update.mockResolvedValue({
        id: 'evt_123',
        status: 'VERIFIED',
        verifiedBy: userId,
        verifiedAt: new Date(),
        userSignatureDid: null,
        userSignatureJws: null,
        orgSignatureDid: null,
        orgSignatureJws: null,
        forensicContext: null,
      });

      const result = await service.verifyEvent(orgId, 'evt_123', userId);

      expect(result.status).toBe('VERIFIED');
      expect(result.userSignatureDid).toBeNull();
      expect(result.orgSignatureDid).toBeNull();
      expect(result.forensicContext).toBeNull();
    });
  });

  describe('verifyEvent with signing', () => {
    const testUserDid = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
    const testOrgDid = 'did:key:z6MkoHWsmSZnHisAxnVGGCEkAWqPCNMTEjYNvzKmSFUpShHe';

    const testUserForensicContext: UserForensicContext = {
      signerName: 'John Doe',
      signerEmail: 'john@example.com',
      signerRole: 'Production Manager',
      workspaceAuthority: 'OPERATIONS',
      signedAt: '2026-01-18T10:00:00.000Z',
    };

    const testOrgForensicContext: OrgForensicContext = {
      organizationName: 'Acme Corporation',
      organizationId: orgId,
      vatNumber: 'DE123456789',
      certifications: ['ISO9001'],
      signedAt: '2026-01-18T10:00:00.000Z',
    };

    const signingContext = {
      userDid: testUserDid,
      userForensicContext: testUserForensicContext,
      orgDid: testOrgDid,
      orgForensicContext: testOrgForensicContext,
    };

    it('should create Corporate Envelope when signing context is provided', async () => {
      const eventData = {
        id: 'evt_123',
        eventType: 'BATCH_PRODUCED',
        eventHash: 'abc123hash',
        sequenceNumber: 5,
        status: 'PENDING_VERIFICATION',
        organizationId: orgId,
        payload: { batchNumber: 'BATCH-001' },
      };

      mockPrisma.operationsEvent.findFirst.mockResolvedValue(eventData);
      mockPrisma.operationsEvent.update.mockImplementation(async ({ data }) => ({
        id: 'evt_123',
        eventType: 'BATCH_PRODUCED',
        eventHash: 'abc123hash',
        sequenceNumber: 5,
        status: 'VERIFIED',
        organizationId: orgId,
        verifiedAt: data.verifiedAt,
        verifiedBy: data.verifiedBy,
        userSignatureDid: data.userSignatureDid,
        userSignatureJws: data.userSignatureJws,
        orgSignatureDid: data.orgSignatureDid,
        orgSignatureJws: data.orgSignatureJws,
        forensicContext: data.forensicContext,
      }));

      const result = await service.verifyEvent(
        orgId,
        'evt_123',
        userId,
        signingContext
      );

      expect(result.status).toBe('VERIFIED');
      expect(result.userSignatureDid).toBe(testUserDid);
      expect(result.orgSignatureDid).toBe(testOrgDid);
      expect(result.userSignatureJws).toBeTruthy();
      expect(result.orgSignatureJws).toBeTruthy();
      expect(result.forensicContext).toBeTruthy();
    });

    it('should include correct payload data in user and org JWS', async () => {
      const eventData = {
        id: 'evt_456',
        eventType: 'MATERIAL_CONSUMED',
        eventHash: 'xyz789hash',
        sequenceNumber: 10,
        status: 'PENDING_VERIFICATION',
        organizationId: orgId,
        payload: { materialLotId: 'lot_123' },
      };

      mockPrisma.operationsEvent.findFirst.mockResolvedValue(eventData);
      mockPrisma.operationsEvent.update.mockImplementation(async ({ data }) => ({
        ...eventData,
        status: 'VERIFIED',
        verifiedAt: data.verifiedAt,
        verifiedBy: data.verifiedBy,
        userSignatureDid: data.userSignatureDid,
        userSignatureJws: data.userSignatureJws,
        orgSignatureDid: data.orgSignatureDid,
        orgSignatureJws: data.orgSignatureJws,
        forensicContext: data.forensicContext,
      }));

      const result = await service.verifyEvent(
        orgId,
        'evt_456',
        userId,
        signingContext
      );

      // Parse the stored JWS to verify it's a valid SealedArtifact
      const storedArtifact = JSON.parse(result.orgSignatureJws as string) as SealedArtifact;

      // Verify payload contains expected event data
      expect(storedArtifact.payload).toMatchObject({
        id: 'evt_456',
        eventType: 'MATERIAL_CONSUMED',
        eventHash: 'xyz789hash',
        sequenceNumber: 10,
        status: 'VERIFIED',
      });
    });

    it('should store user and corporate proofs in SealedArtifact', async () => {
      const eventData = {
        id: 'evt_789',
        eventType: 'BATCH_PRODUCED',
        eventHash: 'def456hash',
        sequenceNumber: 3,
        status: 'PENDING_VERIFICATION',
        organizationId: orgId,
        payload: {},
      };

      mockPrisma.operationsEvent.findFirst.mockResolvedValue(eventData);
      mockPrisma.operationsEvent.update.mockImplementation(async ({ data }) => ({
        ...eventData,
        status: 'VERIFIED',
        verifiedAt: data.verifiedAt,
        verifiedBy: data.verifiedBy,
        userSignatureDid: data.userSignatureDid,
        userSignatureJws: data.userSignatureJws,
        orgSignatureDid: data.orgSignatureDid,
        orgSignatureJws: data.orgSignatureJws,
        forensicContext: data.forensicContext,
      }));

      const result = await service.verifyEvent(
        orgId,
        'evt_789',
        userId,
        signingContext
      );

      const storedArtifact = JSON.parse(result.orgSignatureJws as string) as SealedArtifact;

      // Verify user proof
      expect(storedArtifact.userProof.type).toBe('Ed25519Signature2020');
      expect(storedArtifact.userProof.verificationMethod).toContain(testUserDid);
      expect(storedArtifact.userProof.forensicContext).toEqual(testUserForensicContext);

      // Verify corporate proof
      expect(storedArtifact.corporateProof.type).toBe('Ed25519Signature2020');
      expect(storedArtifact.corporateProof.verificationMethod).toContain(testOrgDid);
      expect(storedArtifact.corporateProof.forensicContext).toEqual(testOrgForensicContext);
    });

    it('should store combined forensic context', async () => {
      const eventData = {
        id: 'evt_999',
        eventType: 'BATCH_PRODUCED',
        eventHash: 'ghi789hash',
        sequenceNumber: 7,
        status: 'PENDING_VERIFICATION',
        organizationId: orgId,
        payload: {},
      };

      mockPrisma.operationsEvent.findFirst.mockResolvedValue(eventData);
      mockPrisma.operationsEvent.update.mockImplementation(async ({ data }) => ({
        ...eventData,
        status: 'VERIFIED',
        verifiedAt: data.verifiedAt,
        verifiedBy: data.verifiedBy,
        userSignatureDid: data.userSignatureDid,
        userSignatureJws: data.userSignatureJws,
        orgSignatureDid: data.orgSignatureDid,
        orgSignatureJws: data.orgSignatureJws,
        forensicContext: data.forensicContext,
      }));

      const result = await service.verifyEvent(
        orgId,
        'evt_999',
        userId,
        signingContext
      );

      // Verify forensicContext contains both user and org context
      const forensicContext = result.forensicContext as {
        user: UserForensicContext;
        org: OrgForensicContext;
      };

      expect(forensicContext.user).toEqual(testUserForensicContext);
      expect(forensicContext.org).toEqual(testOrgForensicContext);
    });

    it('should throw ValidationError for invalid user DID in signing context', async () => {
      const eventData = {
        id: 'evt_123',
        eventType: 'BATCH_PRODUCED',
        eventHash: 'abc123hash',
        sequenceNumber: 5,
        status: 'PENDING_VERIFICATION',
        organizationId: orgId,
        payload: {},
      };

      mockPrisma.operationsEvent.findFirst.mockResolvedValue(eventData);

      const invalidSigningContext = {
        ...signingContext,
        userDid: 'invalid-did',
      };

      await expect(
        service.verifyEvent(orgId, 'evt_123', userId, invalidSigningContext)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid org DID in signing context', async () => {
      const eventData = {
        id: 'evt_123',
        eventType: 'BATCH_PRODUCED',
        eventHash: 'abc123hash',
        sequenceNumber: 5,
        status: 'PENDING_VERIFICATION',
        organizationId: orgId,
        payload: {},
      };

      mockPrisma.operationsEvent.findFirst.mockResolvedValue(eventData);

      const invalidSigningContext = {
        ...signingContext,
        orgDid: 'invalid-org-did',
      };

      await expect(
        service.verifyEvent(orgId, 'evt_123', userId, invalidSigningContext)
      ).rejects.toThrow(ValidationError);
    });
  });
});
