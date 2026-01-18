import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { StatusList2021Service } from './status-list.service.js';
import type { CredentialStatus } from '@eurocomply/shared';
import { NotFoundError, ValidationError } from '../lib/errors.js';

interface MockPrismaClient {
  organization: {
    findUnique: Mock;
    update: Mock;
  };
  userDidHistory: {
    findFirst: Mock;
  };
  orgDidHistory: {
    findFirst: Mock;
  };
  $transaction: Mock;
}

describe('StatusList2021Service', () => {
  let service: StatusList2021Service;
  let mockPrisma: MockPrismaClient;

  // Test fixtures
  const testOrganizationId = 'org_test_123';
  const testBaseUrl = 'https://api.eurocomply.eu';

  const mockOrganization = {
    id: testOrganizationId,
    name: 'Test Org',
    slug: 'test-org',
    schemaName: 'tenant_test_org',
    statusListIndex: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = {
      organization: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      userDidHistory: {
        findFirst: vi.fn(),
      },
      orgDidHistory: {
        findFirst: vi.fn(),
      },
      $transaction: vi.fn((fn) => fn({
        organization: {
          findUnique: vi.fn(),
          update: vi.fn(),
        },
      })),
    };
    service = new StatusList2021Service(mockPrisma as any, testBaseUrl);
  });

  describe('allocateIndex', () => {
    it('should_allocate_next_index_when_organization_exists', async () => {
      // Arrange
      const mockTx = {
        organization: {
          findUnique: vi.fn().mockResolvedValue({ ...mockOrganization, statusListIndex: 5 }),
          update: vi.fn().mockResolvedValue({ ...mockOrganization, statusListIndex: 6 }),
        },
      };
      mockPrisma.$transaction.mockImplementation(async (fn: unknown) => {
        return (fn as (tx: typeof mockTx) => Promise<number>)(mockTx);
      });

      // Act
      const result = await service.allocateIndex(testOrganizationId);

      // Assert
      expect(result).toBe(5);
      expect(mockTx.organization.update).toHaveBeenCalledWith({
        where: { id: testOrganizationId },
        data: { statusListIndex: 6 },
      });
    });

    it('should_throw_not_found_error_when_organization_does_not_exist', async () => {
      // Arrange
      const mockTx = {
        organization: {
          findUnique: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
      };
      mockPrisma.$transaction.mockImplementation(async (fn: unknown) => {
        return (fn as (tx: typeof mockTx) => Promise<number>)(mockTx);
      });

      // Act & Assert
      await expect(service.allocateIndex(testOrganizationId)).rejects.toThrow(NotFoundError);
    });

    it('should_increment_index_atomically_within_transaction', async () => {
      // Arrange
      let transactionCalled = false;
      const mockTx = {
        organization: {
          findUnique: vi.fn().mockResolvedValue({ ...mockOrganization, statusListIndex: 10 }),
          update: vi.fn().mockResolvedValue({ ...mockOrganization, statusListIndex: 11 }),
        },
      };
      mockPrisma.$transaction.mockImplementation(async (fn: unknown) => {
        transactionCalled = true;
        return (fn as (tx: typeof mockTx) => Promise<number>)(mockTx);
      });

      // Act
      await service.allocateIndex(testOrganizationId);

      // Assert
      expect(transactionCalled).toBe(true);
    });

    it('should_return_zero_for_first_allocation', async () => {
      // Arrange
      const mockTx = {
        organization: {
          findUnique: vi.fn().mockResolvedValue({ ...mockOrganization, statusListIndex: 0 }),
          update: vi.fn().mockResolvedValue({ ...mockOrganization, statusListIndex: 1 }),
        },
      };
      mockPrisma.$transaction.mockImplementation(async (fn: unknown) => {
        return (fn as (tx: typeof mockTx) => Promise<number>)(mockTx);
      });

      // Act
      const result = await service.allocateIndex(testOrganizationId);

      // Assert
      expect(result).toBe(0);
    });
  });

  describe('revoke', () => {
    it('should_mark_index_as_revoked_when_found_in_user_did_history', async () => {
      // Arrange
      const mockUserDid = {
        id: 'udh_123',
        userId: 'user_123',
        statusListIndex: 5,
        revokedAt: null,
      };
      mockPrisma.userDidHistory.findFirst.mockResolvedValue(mockUserDid as never);
      mockPrisma.orgDidHistory.findFirst.mockResolvedValue(null);

      // Act & Assert - Should not throw since index is tracked
      await expect(
        service.revoke(testOrganizationId, 5, 'Key compromised')
      ).resolves.not.toThrow();
    });

    it('should_mark_index_as_revoked_when_found_in_org_did_history', async () => {
      // Arrange
      mockPrisma.userDidHistory.findFirst.mockResolvedValue(null);
      const mockOrgDid = {
        id: 'odh_123',
        organizationId: testOrganizationId,
        statusListIndex: 10,
        revokedAt: null,
      };
      mockPrisma.orgDidHistory.findFirst.mockResolvedValue(mockOrgDid as never);

      // Act & Assert
      await expect(
        service.revoke(testOrganizationId, 10, 'Key rotation')
      ).resolves.not.toThrow();
    });

    it('should_allow_revocation_of_index_not_in_did_history', async () => {
      // Arrange - Index exists in our tracking (e.g., for OperationsEvent)
      mockPrisma.userDidHistory.findFirst.mockResolvedValue(null);
      mockPrisma.orgDidHistory.findFirst.mockResolvedValue(null);

      // For MVP, we track revocations in memory for non-DID indices
      // Act & Assert - Should succeed (stores in internal tracking)
      await expect(
        service.revoke(testOrganizationId, 15, 'Event invalidated')
      ).resolves.not.toThrow();
    });

    it('should_throw_validation_error_for_negative_index', async () => {
      // Act & Assert
      await expect(
        service.revoke(testOrganizationId, -1, 'Invalid')
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('isRevoked', () => {
    it('should_return_true_when_user_did_is_revoked', async () => {
      // Arrange
      const mockRevokedUserDid = {
        id: 'udh_123',
        statusListIndex: 5,
        revokedAt: new Date('2026-01-15'),
      };
      mockPrisma.userDidHistory.findFirst.mockResolvedValue(mockRevokedUserDid as never);
      mockPrisma.orgDidHistory.findFirst.mockResolvedValue(null);

      // Act
      const result = await service.isRevoked(testOrganizationId, 5);

      // Assert
      expect(result).toBe(true);
    });

    it('should_return_true_when_org_did_is_revoked', async () => {
      // Arrange
      mockPrisma.userDidHistory.findFirst.mockResolvedValue(null);
      const mockRevokedOrgDid = {
        id: 'odh_123',
        statusListIndex: 10,
        revokedAt: new Date('2026-01-15'),
      };
      mockPrisma.orgDidHistory.findFirst.mockResolvedValue(mockRevokedOrgDid as never);

      // Act
      const result = await service.isRevoked(testOrganizationId, 10);

      // Assert
      expect(result).toBe(true);
    });

    it('should_return_false_when_user_did_exists_but_not_revoked', async () => {
      // Arrange
      const mockActiveUserDid = {
        id: 'udh_123',
        statusListIndex: 5,
        revokedAt: null,
      };
      mockPrisma.userDidHistory.findFirst.mockResolvedValue(mockActiveUserDid as never);
      mockPrisma.orgDidHistory.findFirst.mockResolvedValue(null);

      // Act
      const result = await service.isRevoked(testOrganizationId, 5);

      // Assert
      expect(result).toBe(false);
    });

    it('should_return_false_when_index_not_found_in_any_history', async () => {
      // Arrange
      mockPrisma.userDidHistory.findFirst.mockResolvedValue(null);
      mockPrisma.orgDidHistory.findFirst.mockResolvedValue(null);

      // Act - Index not tracked anywhere is considered not revoked (valid)
      const result = await service.isRevoked(testOrganizationId, 999);

      // Assert
      expect(result).toBe(false);
    });

    it('should_return_true_when_index_was_manually_revoked', async () => {
      // Arrange
      mockPrisma.userDidHistory.findFirst.mockResolvedValue(null);
      mockPrisma.orgDidHistory.findFirst.mockResolvedValue(null);

      // First revoke the index manually
      await service.revoke(testOrganizationId, 20, 'Manual revocation');

      // Act
      const result = await service.isRevoked(testOrganizationId, 20);

      // Assert
      expect(result).toBe(true);
    });

    it('should_throw_validation_error_for_negative_index', async () => {
      // Act & Assert
      await expect(
        service.isRevoked(testOrganizationId, -5)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('getCredentialStatus', () => {
    it('should_return_valid_credential_status_object', async () => {
      // Act
      const result = await service.getCredentialStatus(testOrganizationId, 42);

      // Assert
      expect(result).toEqual({
        type: 'StatusList2021Entry',
        statusPurpose: 'revocation',
        statusListIndex: '42',
        statusListCredential: `${testBaseUrl}/organizations/${testOrganizationId}/status-list`,
      });
    });

    it('should_have_correct_type_for_status_list_2021', async () => {
      // Act
      const result = await service.getCredentialStatus(testOrganizationId, 0);

      // Assert
      expect(result.type).toBe('StatusList2021Entry');
    });

    it('should_have_revocation_as_status_purpose', async () => {
      // Act
      const result = await service.getCredentialStatus(testOrganizationId, 0);

      // Assert
      expect(result.statusPurpose).toBe('revocation');
    });

    it('should_convert_index_to_string', async () => {
      // Act
      const result = await service.getCredentialStatus(testOrganizationId, 12345);

      // Assert
      expect(result.statusListIndex).toBe('12345');
      expect(typeof result.statusListIndex).toBe('string');
    });

    it('should_construct_valid_status_list_credential_url', async () => {
      // Act
      const result = await service.getCredentialStatus(testOrganizationId, 0);

      // Assert
      expect(result.statusListCredential).toBe(
        `${testBaseUrl}/organizations/${testOrganizationId}/status-list`
      );
    });

    it('should_throw_validation_error_for_negative_index', async () => {
      // Act & Assert
      await expect(
        service.getCredentialStatus(testOrganizationId, -1)
      ).rejects.toThrow(ValidationError);
    });

    it('should_conform_to_credential_status_schema', async () => {
      // Act
      const result = await service.getCredentialStatus(testOrganizationId, 100);

      // Assert - Check all required fields exist
      const credentialStatus: CredentialStatus = result;
      expect(credentialStatus.type).toBeDefined();
      expect(credentialStatus.statusPurpose).toBeDefined();
      expect(credentialStatus.statusListIndex).toBeDefined();
      expect(credentialStatus.statusListCredential).toBeDefined();
    });
  });

  describe('getRevocationInfo', () => {
    it('should_return_revocation_details_when_index_is_revoked', async () => {
      // Arrange
      mockPrisma.userDidHistory.findFirst.mockResolvedValue(null);
      mockPrisma.orgDidHistory.findFirst.mockResolvedValue(null);

      const reason = 'Key compromised';
      await service.revoke(testOrganizationId, 25, reason);

      // Act
      const result = await service.getRevocationInfo(testOrganizationId, 25);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.reason).toBe(reason);
      expect(result?.revokedAt).toBeInstanceOf(Date);
    });

    it('should_return_null_when_index_is_not_revoked', async () => {
      // Arrange
      mockPrisma.userDidHistory.findFirst.mockResolvedValue(null);
      mockPrisma.orgDidHistory.findFirst.mockResolvedValue(null);

      // Act
      const result = await service.getRevocationInfo(testOrganizationId, 999);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_revocation_info_from_user_did_history', async () => {
      // Arrange
      const revokedAt = new Date('2026-01-15T10:00:00Z');
      const mockRevokedUserDid = {
        id: 'udh_123',
        statusListIndex: 30,
        revokedAt,
        revocationReason: 'User left company',
      };
      mockPrisma.userDidHistory.findFirst.mockResolvedValue(mockRevokedUserDid as never);
      mockPrisma.orgDidHistory.findFirst.mockResolvedValue(null);

      // Act
      const result = await service.getRevocationInfo(testOrganizationId, 30);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.reason).toBe('User left company');
      expect(result?.revokedAt).toEqual(revokedAt);
    });

    it('should_return_revocation_info_from_org_did_history', async () => {
      // Arrange
      const revokedAt = new Date('2026-01-14T15:30:00Z');
      const mockRevokedOrgDid = {
        id: 'odh_456',
        statusListIndex: 35,
        revokedAt,
        revocationReason: 'Key rotation policy',
      };
      mockPrisma.userDidHistory.findFirst.mockResolvedValue(null);
      mockPrisma.orgDidHistory.findFirst.mockResolvedValue(mockRevokedOrgDid as never);

      // Act
      const result = await service.getRevocationInfo(testOrganizationId, 35);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.reason).toBe('Key rotation policy');
      expect(result?.revokedAt).toEqual(revokedAt);
    });

    it('should_throw_validation_error_for_negative_index', async () => {
      // Act & Assert
      await expect(
        service.getRevocationInfo(testOrganizationId, -1)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('constructor', () => {
    it('should_use_provided_base_url', async () => {
      // Arrange
      const customBaseUrl = 'https://custom.eurocomply.eu';
      const customService = new StatusList2021Service(mockPrisma as any, customBaseUrl);

      // Act
      const result = await customService.getCredentialStatus(testOrganizationId, 1);

      // Assert
      expect(result.statusListCredential.startsWith(customBaseUrl)).toBe(true);
    });

    it('should_default_to_standard_base_url_when_not_provided', async () => {
      // Arrange - use default baseUrl by passing only prisma
      const defaultService = new StatusList2021Service(mockPrisma as any);

      // Act
      const result = await defaultService.getCredentialStatus(testOrganizationId, 1);

      // Assert
      expect(result.statusListCredential).toContain('https://api.eurocomply.eu');
    });
  });
});
