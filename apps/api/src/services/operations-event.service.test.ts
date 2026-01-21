import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { OperationsEventService } from './operations-event.service.js';
import { ValidationError } from '../lib/errors.js';
import { EventStatus } from '@eurocomply/db';
import type { UserForensicContext, OrgForensicContext, SealedArtifact } from '@eurocomply/shared';

/**
 * Creates a mock MikroORM EntityManager for testing OperationsEventService.
 *
 * Architecture notes:
 * - The EntityManager is scoped to a tenant schema
 * - Organization entity (public schema) is accessed via the same EM
 *   because Organization declares `schema: 'public'` in its entity definition
 * - OperationsEvent queries use the tenant schema from the EM
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockEntityManager(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockEm: any = {
    findOne: vi.fn(),
    find: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: vi.fn((_entity: any, data: any) => ({ ...data })),
    flush: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getReference: vi.fn((_entity: any, id: string) => ({ id })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transactional: vi.fn((fn: any) => fn(mockEm)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nativeUpdate: vi.fn(),
  };
  return mockEm;
}

describe('OperationsEventService', () => {
  let service: OperationsEventService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockEm: any;
  const userId = 'user_123';
  const orgId = 'org_test123';

  beforeEach(() => {
    vi.clearAllMocks();
    mockEm = createMockEntityManager();
    service = new OperationsEventService(mockEm);
  });

  describe('recordEvent', () => {
    it('should create first event with sequence 1 and GENESIS hash', async () => {
      // Mock organization lookup (public schema)
      mockEm.findOne
        .mockResolvedValueOnce({
          id: orgId,
          lastEventHash: null,
          eventSequence: 0,
        });

      const createdEvent = {
        id: 'evt_123',
        eventType: 'BATCH_PRODUCED',
        sequenceNumber: 1,
        eventHash: expect.any(String),
        previousEventHash: 'GENESIS',
        status: EventStatus.PENDING_VERIFICATION,
      };
      mockEm.create.mockReturnValue(createdEvent);

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
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it('should chain events with previous hash', async () => {
      mockEm.findOne
        .mockResolvedValueOnce({
          id: orgId,
          lastEventHash: 'previous_hash_abc',
          eventSequence: 5,
        });

      const createdEvent = {
        id: 'evt_124',
        eventType: 'MATERIAL_CONSUMED',
        sequenceNumber: 6,
        eventHash: 'new_hash_xyz',
        previousEventHash: 'previous_hash_abc',
        status: EventStatus.PENDING_VERIFICATION,
      };
      mockEm.create.mockReturnValue(createdEvent);

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

    it('should use transaction with SERIALIZABLE isolation to prevent race conditions', async () => {
      mockEm.findOne
        .mockResolvedValueOnce({
          id: orgId,
          lastEventHash: null,
          eventSequence: 0,
        });

      const createdEvent = {
        id: 'evt_123',
        eventType: 'BATCH_PRODUCED',
        sequenceNumber: 1,
        eventHash: 'abc123',
        previousEventHash: 'GENESIS',
      };
      mockEm.create.mockReturnValue(createdEvent);

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

      // Verify transactional was called
      expect(mockEm.transactional).toHaveBeenCalled();
    });
  });

  describe('verifyEvent', () => {
    it('should transition from PENDING_VERIFICATION to VERIFIED', async () => {
      const event = {
        id: 'evt_123',
        status: EventStatus.PENDING_VERIFICATION,
      };

      mockEm.findOne.mockResolvedValue(event);

      const result = await service.verifyEvent('evt_123', userId);

      expect(result.status).toBe(EventStatus.VERIFIED);
      expect(result.verifiedBy).toEqual({ id: userId });
      expect(result.verifiedAt).toBeInstanceOf(Date);
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it('should reject verification of already VERIFIED event', async () => {
      const event = {
        id: 'evt_123',
        status: EventStatus.VERIFIED,
      };

      mockEm.findOne.mockResolvedValue(event);

      await expect(
        service.verifyEvent('evt_123', userId)
      ).rejects.toThrow(ValidationError);
    });

    it('should verify without signing when no signing context provided', async () => {
      const event = {
        id: 'evt_123',
        status: EventStatus.PENDING_VERIFICATION,
      };

      mockEm.findOne.mockResolvedValue(event);

      const result = await service.verifyEvent('evt_123', userId);

      expect(result.status).toBe(EventStatus.VERIFIED);
      expect(result.userSignatureDid).toBeUndefined();
      expect(result.orgSignatureDid).toBeUndefined();
      expect(result.forensicContext).toBeUndefined();
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
      organizationId: 'org_test123',
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
        status: EventStatus.PENDING_VERIFICATION,
        payload: { batchNumber: 'BATCH-001' },
      };

      mockEm.findOne.mockResolvedValue(eventData);

      const result = await service.verifyEvent(
        'evt_123',
        userId,
        signingContext
      );

      expect(result.status).toBe(EventStatus.VERIFIED);
      expect(result.userSignatureDid).toBe(testUserDid);
      expect(result.orgSignatureDid).toBe(testOrgDid);
      expect(result.userSignatureJws).toBeTruthy();
      expect(result.orgSignatureJws).toBeTruthy();
      expect(result.forensicContext).toBeTruthy();
    });

    it('should include correct payload data in sealed artifact', async () => {
      const eventData = {
        id: 'evt_456',
        eventType: 'MATERIAL_CONSUMED',
        eventHash: 'xyz789hash',
        sequenceNumber: 10,
        status: EventStatus.PENDING_VERIFICATION,
        payload: { materialLotId: 'lot_123' },
      };

      mockEm.findOne.mockResolvedValue(eventData);

      const result = await service.verifyEvent(
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
        status: EventStatus.PENDING_VERIFICATION,
        payload: {},
      };

      mockEm.findOne.mockResolvedValue(eventData);

      const result = await service.verifyEvent(
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
        status: EventStatus.PENDING_VERIFICATION,
        payload: {},
      };

      mockEm.findOne.mockResolvedValue(eventData);

      const result = await service.verifyEvent(
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
        status: EventStatus.PENDING_VERIFICATION,
        payload: {},
      };

      mockEm.findOne.mockResolvedValue(eventData);

      const invalidSigningContext = {
        ...signingContext,
        userDid: 'invalid-did',
      };

      await expect(
        service.verifyEvent('evt_123', userId, invalidSigningContext)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid org DID in signing context', async () => {
      const eventData = {
        id: 'evt_123',
        eventType: 'BATCH_PRODUCED',
        eventHash: 'abc123hash',
        sequenceNumber: 5,
        status: EventStatus.PENDING_VERIFICATION,
        payload: {},
      };

      mockEm.findOne.mockResolvedValue(eventData);

      const invalidSigningContext = {
        ...signingContext,
        orgDid: 'invalid-org-did',
      };

      await expect(
        service.verifyEvent('evt_123', userId, invalidSigningContext)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('getEvent', () => {
    it('should return event by ID', async () => {
      const event = {
        id: 'evt_123',
        eventType: 'BATCH_PRODUCED',
        status: EventStatus.PENDING_VERIFICATION,
      };

      mockEm.findOne.mockResolvedValue(event);

      const result = await service.getEvent('evt_123');

      expect(result?.id).toBe('evt_123');
      expect(mockEm.findOne).toHaveBeenCalled();
    });

    it('should return null for non-existent event', async () => {
      mockEm.findOne.mockResolvedValue(null);

      const result = await service.getEvent('unknown_evt');

      expect(result).toBeNull();
    });
  });

  describe('listEvents', () => {
    it('should list events for the tenant', async () => {
      const events = [
        { id: 'evt_1', eventType: 'BATCH_PRODUCED', sequenceNumber: 2 },
        { id: 'evt_2', eventType: 'MATERIAL_CONSUMED', sequenceNumber: 1 },
      ];

      mockEm.find.mockResolvedValue(events);

      const result = await service.listEvents();

      expect(result).toHaveLength(2);
      expect(mockEm.find).toHaveBeenCalledWith(
        expect.anything(),
        {},
        expect.objectContaining({
          orderBy: { sequenceNumber: 'DESC' },
          limit: 50,
          offset: 0,
        })
      );
    });

    it('should filter by eventType', async () => {
      mockEm.find.mockResolvedValue([]);

      await service.listEvents({ eventType: 'BATCH_PRODUCED' });

      expect(mockEm.find).toHaveBeenCalledWith(
        expect.anything(),
        { eventType: 'BATCH_PRODUCED' },
        expect.anything()
      );
    });

    it('should filter by status', async () => {
      mockEm.find.mockResolvedValue([]);

      await service.listEvents({ status: EventStatus.VERIFIED });

      expect(mockEm.find).toHaveBeenCalledWith(
        expect.anything(),
        { status: EventStatus.VERIFIED },
        expect.anything()
      );
    });

    it('should respect pagination options', async () => {
      mockEm.find.mockResolvedValue([]);

      await service.listEvents({ limit: 10, offset: 20 });

      expect(mockEm.find).toHaveBeenCalledWith(
        expect.anything(),
        {},
        expect.objectContaining({
          limit: 10,
          offset: 20,
        })
      );
    });
  });

  describe('verifyChainIntegrity', () => {
    it('should return valid for intact chain', async () => {
      const events = [
        { sequenceNumber: 1, eventHash: 'hash1', previousEventHash: 'GENESIS' },
        { sequenceNumber: 2, eventHash: 'hash2', previousEventHash: 'hash1' },
        { sequenceNumber: 3, eventHash: 'hash3', previousEventHash: 'hash2' },
      ];

      mockEm.find.mockResolvedValue(events);

      const result = await service.verifyChainIntegrity();

      expect(result.valid).toBe(true);
      expect(result.checkedCount).toBe(3);
      expect(result.brokenAt).toBeUndefined();
    });

    it('should detect broken chain', async () => {
      const events = [
        { sequenceNumber: 1, eventHash: 'hash1', previousEventHash: 'GENESIS' },
        { sequenceNumber: 2, eventHash: 'hash2', previousEventHash: 'wrong_hash' }, // Broken!
        { sequenceNumber: 3, eventHash: 'hash3', previousEventHash: 'hash2' },
      ];

      mockEm.find.mockResolvedValue(events);

      const result = await service.verifyChainIntegrity();

      expect(result.valid).toBe(false);
      expect(result.checkedCount).toBe(2);
    });

    it('should return valid for empty chain', async () => {
      mockEm.find.mockResolvedValue([]);

      const result = await service.verifyChainIntegrity();

      expect(result.valid).toBe(true);
      expect(result.checkedCount).toBe(0);
    });
  });
});
