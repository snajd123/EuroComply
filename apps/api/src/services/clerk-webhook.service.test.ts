import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  verifyWebhookSignature,
  handleUserCreated,
  handleUserUpdated,
  handleUserDeleted,
  processWebhookEvent,
} from './clerk-webhook.service.js';

// Mock prisma
vi.mock('@eurocomply/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock svix Webhook
vi.mock('svix', () => ({
  Webhook: vi.fn().mockImplementation(() => ({
    verify: vi.fn(),
  })),
}));

import { prisma } from '@eurocomply/db';
import { Webhook } from 'svix';

const mockPrisma = prisma as unknown as {
  user: {
    findUnique: Mock;
    create: Mock;
    update: Mock;
  };
};

describe('clerk-webhook.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid webhook signature and return event', () => {
      const mockEvent = {
        type: 'user.created',
        data: { id: 'user_123', email_addresses: [] },
        object: 'event',
      };

      const mockVerify = vi.fn().mockReturnValue(mockEvent);
      (Webhook as unknown as Mock).mockImplementation(() => ({
        verify: mockVerify,
      }));

      const payload = JSON.stringify(mockEvent);
      const headers = {
        'svix-id': 'msg_123',
        'svix-timestamp': '1234567890',
        'svix-signature': 'v1,signature123',
      };
      const secret = 'whsec_test123';

      const result = verifyWebhookSignature(payload, headers, secret);

      expect(Webhook).toHaveBeenCalledWith(secret);
      expect(mockVerify).toHaveBeenCalledWith(payload, headers);
      expect(result).toEqual(mockEvent);
    });

    it('should throw when signature verification fails', () => {
      const mockVerify = vi.fn().mockImplementation(() => {
        throw new Error('Invalid signature');
      });
      (Webhook as unknown as Mock).mockImplementation(() => ({
        verify: mockVerify,
      }));

      const payload = 'invalid';
      const headers = {
        'svix-id': 'msg_123',
        'svix-timestamp': '1234567890',
        'svix-signature': 'invalid',
      };

      expect(() => verifyWebhookSignature(payload, headers, 'secret')).toThrow(
        'Invalid signature'
      );
    });

    it('should throw when timestamp is too old', () => {
      const mockVerify = vi.fn().mockImplementation(() => {
        throw new Error('Message timestamp too old');
      });
      (Webhook as unknown as Mock).mockImplementation(() => ({
        verify: mockVerify,
      }));

      const payload = '{}';
      const headers = {
        'svix-id': 'msg_123',
        'svix-timestamp': '1000000000', // Very old timestamp
        'svix-signature': 'v1,sig',
      };

      expect(() => verifyWebhookSignature(payload, headers, 'secret')).toThrow(
        'Message timestamp too old'
      );
    });
  });

  describe('handleUserCreated', () => {
    const validUserData = {
      id: 'user_abc123def456',
      email_addresses: [{ email_address: 'test@example.com', id: 'email_1' }],
      first_name: 'John',
      last_name: 'Doe',
      image_url: 'https://example.com/avatar.jpg',
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    it('should create new user when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'db_user_1',
        clerkId: validUserData.id,
        email: 'test@example.com',
        name: 'John Doe',
      });

      await handleUserCreated(validUserData);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { clerkId: validUserData.id },
      });
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          clerkId: validUserData.id,
          email: 'test@example.com',
          name: 'John Doe',
          avatarUrl: 'https://example.com/avatar.jpg',
        },
      });
    });

    it('should skip creation if user already exists by clerkId (idempotency)', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'db_user_1',
        clerkId: validUserData.id,
      });

      await handleUserCreated(validUserData);

      expect(mockPrisma.user.create).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should update existing user with clerkId if email already exists', async () => {
      // No user by clerkId
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      // But user exists by email
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'db_user_existing',
        email: 'test@example.com',
        name: 'Old Name',
      });
      mockPrisma.user.update.mockResolvedValue({
        id: 'db_user_existing',
        clerkId: validUserData.id,
      });

      await handleUserCreated(validUserData);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        data: {
          clerkId: validUserData.id,
          name: 'John Doe',
          avatarUrl: 'https://example.com/avatar.jpg',
        },
      });
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('should handle user with no email addresses', async () => {
      const userWithNoEmail = {
        ...validUserData,
        email_addresses: [],
      };

      await handleUserCreated(userWithNoEmail);

      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('should handle user with only first name', async () => {
      const userFirstNameOnly = {
        ...validUserData,
        first_name: 'John',
        last_name: null,
      };
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'db_user_1' });

      await handleUserCreated(userFirstNameOnly);

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'John',
        }),
      });
    });

    it('should handle user with no name at all', async () => {
      const userNoName = {
        ...validUserData,
        first_name: null,
        last_name: null,
      };
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'db_user_1' });

      await handleUserCreated(userNoName);

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: null,
        }),
      });
    });

    it('should handle user with null avatar', async () => {
      const userNoAvatar = {
        ...validUserData,
        image_url: null,
      };
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'db_user_1' });

      await handleUserCreated(userNoAvatar);

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          avatarUrl: null,
        }),
      });
    });
  });

  describe('handleUserUpdated', () => {
    const validUserData = {
      id: 'user_abc123def456',
      email_addresses: [{ email_address: 'updated@example.com', id: 'email_1' }],
      first_name: 'Jane',
      last_name: 'Smith',
      image_url: 'https://example.com/new-avatar.jpg',
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    it('should update existing user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'db_user_1',
        clerkId: validUserData.id,
        email: 'old@example.com',
      });
      mockPrisma.user.update.mockResolvedValue({
        id: 'db_user_1',
        email: 'updated@example.com',
      });

      await handleUserUpdated(validUserData);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { clerkId: validUserData.id },
        data: {
          email: 'updated@example.com',
          name: 'Jane Smith',
          avatarUrl: 'https://example.com/new-avatar.jpg',
        },
      });
    });

    it('should create user if not found (handles out-of-order events)', async () => {
      // User doesn't exist yet
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'db_user_1' });

      await handleUserUpdated(validUserData);

      // Should fall through to handleUserCreated
      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it('should handle user with no email addresses', async () => {
      const userWithNoEmail = {
        ...validUserData,
        email_addresses: [],
      };

      await handleUserUpdated(userWithNoEmail);

      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('handleUserDeleted', () => {
    const validUserData = {
      id: 'user_abc123def456',
      email_addresses: [],
      first_name: null,
      last_name: null,
      image_url: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    it('should log when user exists (currently no-op)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'db_user_1',
        clerkId: validUserData.id,
      });

      // Should complete without error (currently just logs)
      await handleUserDeleted(validUserData);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { clerkId: validUserData.id },
      });
      // Currently doesn't delete - just logs
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should handle deletion of non-existent user gracefully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      // Should complete without error
      await handleUserDeleted(validUserData);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { clerkId: validUserData.id },
      });
    });
  });

  describe('processWebhookEvent', () => {
    // Helper to create test webhook events - uses type assertion for flexibility in tests
    const createEvent = <T extends Record<string, unknown>>(type: string, data: T) => ({
      type,
      data,
      object: 'event' as const,
    }) as unknown as Parameters<typeof processWebhookEvent>[0];

    const validUserData = {
      id: 'user_abc123def456',
      email_addresses: [{ email_address: 'test@example.com', id: 'email_1' }],
      first_name: 'Test',
      last_name: 'User',
      image_url: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    it('should route user.created event to handleUserCreated', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'db_user_1' });

      await processWebhookEvent(createEvent('user.created', validUserData));

      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it('should route user.updated event to handleUserUpdated', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'db_user_1',
        clerkId: validUserData.id,
      });
      mockPrisma.user.update.mockResolvedValue({ id: 'db_user_1' });

      await processWebhookEvent(createEvent('user.updated', validUserData));

      expect(mockPrisma.user.update).toHaveBeenCalled();
    });

    it('should route user.deleted event to handleUserDeleted', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'db_user_1',
        clerkId: validUserData.id,
      });

      await processWebhookEvent(createEvent('user.deleted', validUserData));

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { clerkId: validUserData.id },
      });
    });

    it('should handle unknown event types gracefully', async () => {
      // Should not throw for unknown events
      await processWebhookEvent(createEvent('organization.created', { id: 'org_123' }));

      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should handle session.created event gracefully (ignored)', async () => {
      await processWebhookEvent(createEvent('session.created', { user_id: 'user_123' }));

      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });
  });
});
