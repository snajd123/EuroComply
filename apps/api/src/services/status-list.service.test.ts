import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { StatusList2021Service } from './status-list.service.js';
import type { CredentialStatus } from '@eurocomply/shared';
import { decodeBitstring, getBit } from '@eurocomply/shared';
import { NotFoundError, ValidationError } from '../lib/errors.js';

// Mock EntityManager
interface MockEntityManager {
  findOne: Mock;
  find: Mock;
  create: Mock;
  flush: Mock;
  transactional: Mock;
}

describe('StatusList2021Service', () => {
  let service: StatusList2021Service;
  let mockEm: MockEntityManager;

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
    mockEm = {
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
      create: vi.fn((Entity, data) => data),
      flush: vi.fn().mockResolvedValue(undefined),
      transactional: vi.fn((fn, _options) => fn({
        findOne: vi.fn(),
        flush: vi.fn(),
      })),
    };
    service = new StatusList2021Service(
      mockEm as unknown as ConstructorParameters<typeof StatusList2021Service>[0],
      testBaseUrl
    );
  });

  /**
   * Helper to setup mock responses for em.findOne based on entity type
   */
  function setupFindOneMock(responses: {
    organization?: typeof mockOrganization | null;
    statusListEntry?: { revokedAt?: Date; reason?: string } | null;
    userDidHistory?: { revokedAt?: Date; revocationReason?: string; userId?: string; statusListIndex?: number } | null;
    orgDidHistory?: { revokedAt?: Date; revocationReason?: string; statusListIndex?: number } | null;
    organizationUser?: { userId: string; organizationId: string } | null;
  }) {
    mockEm.findOne.mockImplementation((Entity: unknown, _filter: unknown) => {
      const entityName = (Entity as { name?: string })?.name;
      if (entityName === 'Organization') {
        return Promise.resolve(responses.organization);
      }
      if (entityName === 'StatusListEntry') {
        return Promise.resolve(responses.statusListEntry);
      }
      if (entityName === 'UserDidHistory') {
        return Promise.resolve(responses.userDidHistory);
      }
      if (entityName === 'OrgDidHistory') {
        return Promise.resolve(responses.orgDidHistory);
      }
      if (entityName === 'OrganizationUser') {
        return Promise.resolve(responses.organizationUser);
      }
      return Promise.resolve(null);
    });
  }

  /**
   * Helper to setup mock responses for em.find based on entity type
   */
  function setupFindMock(responses: {
    statusListEntry?: { statusIndex: number; revokedAt?: Date }[];
    userDidHistory?: { statusListIndex: number; revokedAt?: Date }[];
    orgDidHistory?: { statusListIndex: number; revokedAt?: Date }[];
    organizationUser?: { userId: string; organizationId: string }[];
  }) {
    mockEm.find.mockImplementation((Entity: unknown, _filter: unknown) => {
      const entityName = (Entity as { name?: string })?.name;
      if (entityName === 'StatusListEntry') {
        return Promise.resolve(responses.statusListEntry || []);
      }
      if (entityName === 'UserDidHistory') {
        return Promise.resolve(responses.userDidHistory || []);
      }
      if (entityName === 'OrgDidHistory') {
        return Promise.resolve(responses.orgDidHistory || []);
      }
      if (entityName === 'OrganizationUser') {
        return Promise.resolve(responses.organizationUser || []);
      }
      return Promise.resolve([]);
    });
  }

  describe('allocateIndex', () => {
    it('should_allocate_next_index_when_organization_exists', async () => {
      // Arrange
      const mockTxEm = {
        findOne: vi.fn().mockResolvedValue({ ...mockOrganization, statusListIndex: 5 }),
        flush: vi.fn().mockResolvedValue(undefined),
      };
      mockEm.transactional.mockImplementation(async (fn: unknown) => {
        return (fn as (em: typeof mockTxEm) => Promise<number>)(mockTxEm);
      });

      // Act
      const result = await service.allocateIndex(testOrganizationId);

      // Assert
      expect(result).toBe(5);
    });

    it('should_throw_not_found_error_when_organization_does_not_exist', async () => {
      // Arrange
      const mockTxEm = {
        findOne: vi.fn().mockResolvedValue(null),
        flush: vi.fn(),
      };
      mockEm.transactional.mockImplementation(async (fn: unknown) => {
        return (fn as (em: typeof mockTxEm) => Promise<number>)(mockTxEm);
      });

      // Act & Assert
      await expect(service.allocateIndex(testOrganizationId)).rejects.toThrow(NotFoundError);
    });

    it('should_increment_index_atomically_within_transaction', async () => {
      // Arrange
      let transactionCalled = false;
      const mockTxEm = {
        findOne: vi.fn().mockResolvedValue({ ...mockOrganization, statusListIndex: 10 }),
        flush: vi.fn().mockResolvedValue(undefined),
      };
      mockEm.transactional.mockImplementation(async (fn: unknown) => {
        transactionCalled = true;
        return (fn as (em: typeof mockTxEm) => Promise<number>)(mockTxEm);
      });

      // Act
      await service.allocateIndex(testOrganizationId);

      // Assert
      expect(transactionCalled).toBe(true);
    });

    it('should_return_zero_for_first_allocation', async () => {
      // Arrange
      const mockTxEm = {
        findOne: vi.fn().mockResolvedValue({ ...mockOrganization, statusListIndex: 0 }),
        flush: vi.fn().mockResolvedValue(undefined),
      };
      mockEm.transactional.mockImplementation(async (fn: unknown) => {
        return (fn as (em: typeof mockTxEm) => Promise<number>)(mockTxEm);
      });

      // Act
      const result = await service.allocateIndex(testOrganizationId);

      // Assert
      expect(result).toBe(0);
    });
  });

  describe('revoke', () => {
    it('should_mark_index_as_revoked_when_not_existing', async () => {
      // Arrange
      setupFindOneMock({
        statusListEntry: null,
      });

      // Act & Assert - Should not throw
      await expect(
        service.revoke(testOrganizationId, 5, 'Key compromised')
      ).resolves.not.toThrow();
      expect(mockEm.create).toHaveBeenCalled();
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it('should_update_existing_entry_when_revoking_again', async () => {
      // Arrange
      const existingEntry = {
        id: 'sle_123',
        organizationId: testOrganizationId,
        statusIndex: 10,
        revokedAt: new Date('2026-01-01'),
        reason: 'Old reason',
      };
      setupFindOneMock({
        statusListEntry: existingEntry,
      });

      // Act
      await service.revoke(testOrganizationId, 10, 'New reason');

      // Assert
      expect(existingEntry.reason).toBe('New reason');
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it('should_throw_validation_error_for_negative_index', async () => {
      // Act & Assert
      await expect(
        service.revoke(testOrganizationId, -1, 'Invalid')
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('isRevoked', () => {
    it('should_return_true_when_status_list_entry_is_revoked', async () => {
      // Arrange
      setupFindOneMock({
        statusListEntry: { revokedAt: new Date('2026-01-15') },
      });

      // Act
      const result = await service.isRevoked(testOrganizationId, 5);

      // Assert
      expect(result).toBe(true);
    });

    it('should_return_true_when_user_did_is_revoked_and_user_belongs_to_org', async () => {
      // Arrange
      let findOneCallCount = 0;
      mockEm.findOne.mockImplementation((Entity: unknown) => {
        const entityName = (Entity as { name?: string })?.name;
        findOneCallCount++;

        if (entityName === 'StatusListEntry') {
          return Promise.resolve(null);
        }
        if (entityName === 'UserDidHistory') {
          return Promise.resolve({
            statusListIndex: 5,
            revokedAt: new Date('2026-01-15'),
            userId: 'user_123',
          });
        }
        if (entityName === 'OrganizationUser') {
          return Promise.resolve({
            userId: 'user_123',
            organizationId: testOrganizationId,
          });
        }
        return Promise.resolve(null);
      });

      // Act
      const result = await service.isRevoked(testOrganizationId, 5);

      // Assert
      expect(result).toBe(true);
    });

    it('should_return_true_when_org_did_is_revoked', async () => {
      // Arrange
      mockEm.findOne.mockImplementation((Entity: unknown) => {
        const entityName = (Entity as { name?: string })?.name;
        if (entityName === 'StatusListEntry') {
          return Promise.resolve(null);
        }
        if (entityName === 'UserDidHistory') {
          return Promise.resolve(null);
        }
        if (entityName === 'OrgDidHistory') {
          return Promise.resolve({
            statusListIndex: 10,
            revokedAt: new Date('2026-01-15'),
          });
        }
        return Promise.resolve(null);
      });

      // Act
      const result = await service.isRevoked(testOrganizationId, 10);

      // Assert
      expect(result).toBe(true);
    });

    it('should_return_false_when_not_revoked', async () => {
      // Arrange
      setupFindOneMock({
        statusListEntry: null,
        userDidHistory: null,
        orgDidHistory: null,
      });

      // Act
      const result = await service.isRevoked(testOrganizationId, 999);

      // Assert
      expect(result).toBe(false);
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
    it('should_return_revocation_details_from_status_list_entry', async () => {
      // Arrange
      const reason = 'Key compromised';
      const revokedAt = new Date();
      setupFindOneMock({
        statusListEntry: { revokedAt, reason },
      });

      // Act
      const result = await service.getRevocationInfo(testOrganizationId, 25);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.reason).toBe(reason);
      expect(result?.revokedAt).toEqual(revokedAt);
    });

    it('should_return_null_when_index_is_not_revoked', async () => {
      // Arrange
      setupFindOneMock({
        statusListEntry: null,
        userDidHistory: null,
        orgDidHistory: null,
      });

      // Act
      const result = await service.getRevocationInfo(testOrganizationId, 999);

      // Assert
      expect(result).toBeNull();
    });

    it('should_return_revocation_info_from_user_did_history', async () => {
      // Arrange
      const revokedAt = new Date('2026-01-15T10:00:00Z');
      mockEm.findOne.mockImplementation((Entity: unknown) => {
        const entityName = (Entity as { name?: string })?.name;
        if (entityName === 'StatusListEntry') {
          return Promise.resolve(null);
        }
        if (entityName === 'UserDidHistory') {
          return Promise.resolve({
            statusListIndex: 30,
            revokedAt,
            revocationReason: 'User left company',
            userId: 'user_123',
          });
        }
        if (entityName === 'OrganizationUser') {
          return Promise.resolve({ userId: 'user_123', organizationId: testOrganizationId });
        }
        return Promise.resolve(null);
      });

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
      mockEm.findOne.mockImplementation((Entity: unknown) => {
        const entityName = (Entity as { name?: string })?.name;
        if (entityName === 'StatusListEntry') {
          return Promise.resolve(null);
        }
        if (entityName === 'UserDidHistory') {
          return Promise.resolve(null);
        }
        if (entityName === 'OrgDidHistory') {
          return Promise.resolve({
            statusListIndex: 35,
            revokedAt,
            revocationReason: 'Key rotation policy',
          });
        }
        return Promise.resolve(null);
      });

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
      const customService = new StatusList2021Service(
        mockEm as unknown as ConstructorParameters<typeof StatusList2021Service>[0],
        customBaseUrl
      );

      // Act
      const result = await customService.getCredentialStatus(testOrganizationId, 1);

      // Assert
      expect(result.statusListCredential.startsWith(customBaseUrl)).toBe(true);
    });

    it('should_default_to_standard_base_url_when_not_provided', async () => {
      // Arrange - use default baseUrl
      const defaultService = new StatusList2021Service(
        mockEm as unknown as ConstructorParameters<typeof StatusList2021Service>[0]
      );

      // Act
      const result = await defaultService.getCredentialStatus(testOrganizationId, 1);

      // Assert
      expect(result.statusListCredential).toContain('https://api.eurocomply.eu');
    });
  });

  describe('buildBitstring', () => {
    it('should_create_empty_bitstring_when_no_revocations', async () => {
      // Arrange
      setupFindMock({
        statusListEntry: [],
        userDidHistory: [],
        orgDidHistory: [],
        organizationUser: [],
      });

      // Act
      const bitstring = await service.buildBitstring(testOrganizationId);

      // Assert
      expect(bitstring.length).toBe(16384); // 131072 bits / 8
      expect(bitstring.every(byte => byte === 0)).toBe(true);
    });

    it('should_set_bits_from_status_list_entries', async () => {
      // Arrange
      setupFindMock({
        statusListEntry: [
          { statusIndex: 0, revokedAt: new Date() },
          { statusIndex: 100, revokedAt: new Date() },
        ],
        organizationUser: [],
      });

      // Act
      const bitstring = await service.buildBitstring(testOrganizationId);

      // Assert
      expect(getBit(bitstring, 0)).toBe(true);
      expect(getBit(bitstring, 100)).toBe(true);
      expect(getBit(bitstring, 1)).toBe(false);
    });

    it('should_set_bits_from_user_did_history', async () => {
      // Arrange
      setupFindMock({
        statusListEntry: [],
        organizationUser: [{ userId: 'user_1', organizationId: testOrganizationId }],
        userDidHistory: [
          { statusListIndex: 50, revokedAt: new Date() },
          { statusListIndex: 200, revokedAt: new Date() },
        ],
      });

      // Act
      const bitstring = await service.buildBitstring(testOrganizationId);

      // Assert
      expect(getBit(bitstring, 50)).toBe(true);
      expect(getBit(bitstring, 200)).toBe(true);
    });

    it('should_set_bits_from_org_did_history', async () => {
      // Arrange
      setupFindMock({
        statusListEntry: [],
        organizationUser: [],
        orgDidHistory: [{ statusListIndex: 300, revokedAt: new Date() }],
      });

      // Act
      const bitstring = await service.buildBitstring(testOrganizationId);

      // Assert
      expect(getBit(bitstring, 300)).toBe(true);
    });
  });

  describe('getEncodedList', () => {
    it('should_return_base64url_encoded_gzip_compressed_bitstring', async () => {
      // Arrange
      setupFindMock({
        statusListEntry: [{ statusIndex: 42, revokedAt: new Date() }],
        organizationUser: [],
      });

      // Act
      const encoded = await service.getEncodedList(testOrganizationId);

      // Assert
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should_produce_decodable_output', async () => {
      // Arrange
      setupFindMock({
        statusListEntry: [{ statusIndex: 123, revokedAt: new Date() }],
        organizationUser: [],
      });

      // Act
      const encoded = await service.getEncodedList(testOrganizationId);
      const decoded = decodeBitstring(encoded);

      // Assert
      expect(getBit(decoded, 123)).toBe(true);
      expect(getBit(decoded, 124)).toBe(false);
    });
  });

  describe('checkRevocationFromEncodedList', () => {
    it('should_return_true_for_revoked_index', async () => {
      // Arrange
      setupFindMock({
        statusListEntry: [{ statusIndex: 500, revokedAt: new Date() }],
        organizationUser: [],
      });
      const encoded = await service.getEncodedList(testOrganizationId);

      // Act
      const isRevoked = StatusList2021Service.checkRevocationFromEncodedList(encoded, 500);

      // Assert
      expect(isRevoked).toBe(true);
    });

    it('should_return_false_for_valid_index', async () => {
      // Arrange
      setupFindMock({
        statusListEntry: [],
        organizationUser: [],
      });
      const encoded = await service.getEncodedList(testOrganizationId);

      // Act
      const isRevoked = StatusList2021Service.checkRevocationFromEncodedList(encoded, 999);

      // Assert
      expect(isRevoked).toBe(false);
    });

    it('should_throw_for_out_of_bounds_index', () => {
      // Arrange
      const encoded = 'H4sIAAAAAAAAA2NgGAWjYBSMglEwCkbBKBgFowAAQnoG8QABAA';

      // Act & Assert
      expect(() => {
        StatusList2021Service.checkRevocationFromEncodedList(encoded, 200000);
      }).toThrow(ValidationError);
    });
  });

  describe('generateStatusListCredential', () => {
    it('should_generate_valid_status_list_credential_structure', async () => {
      // Arrange
      const issuerId = 'did:key:z6MkTest123';
      setupFindMock({
        statusListEntry: [],
        organizationUser: [],
      });

      // Act
      const credential = await service.generateStatusListCredential(testOrganizationId, issuerId);

      // Assert
      expect(credential['@context']).toContain('https://www.w3.org/2018/credentials/v1');
      expect(credential['@context']).toContain('https://w3id.org/vc/status-list/2021/v1');
      expect(credential.type).toContain('VerifiableCredential');
      expect(credential.type).toContain('StatusList2021Credential');
      expect(credential.issuer).toBe(issuerId);
      expect(credential.credentialSubject.type).toBe('StatusList2021');
      expect(credential.credentialSubject.statusPurpose).toBe('revocation');
      expect(credential.credentialSubject.encodedList).toBeDefined();
    });

    it('should_include_revoked_credentials_in_encoded_list', async () => {
      // Arrange
      const issuerId = 'did:key:z6MkTest123';
      setupFindMock({
        statusListEntry: [{ statusIndex: 777, revokedAt: new Date() }],
        organizationUser: [],
      });

      // Act
      const credential = await service.generateStatusListCredential(testOrganizationId, issuerId);

      // Assert
      const isRevoked = StatusList2021Service.checkRevocationFromEncodedList(
        credential.credentialSubject.encodedList,
        777
      );
      expect(isRevoked).toBe(true);
    });
  });
});
