import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  verifyWebhookSignature,
  handleUserCreated,
  handleUserUpdated,
  handleUserDeleted,
  processWebhookEvent,
} from './clerk-webhook.service.js';
import { EntityManager } from '@mikro-orm/postgresql';
import { MikroOrm } from '@eurocomply/db';

const { User } = MikroOrm;

// Mock svix Webhook - must use function (not arrow) to be a valid constructor
vi.mock('svix', () => ({
  Webhook: vi.fn().mockImplementation(function(this: { verify: ReturnType<typeof vi.fn> }) {
    this.verify = vi.fn();
  }),
}));

import { Webhook } from 'svix';

const createMockEm = (): EntityManager => {
  return {
    findOne: vi.fn(),
    create: vi.fn(),
    persist: vi.fn(),
    flush: vi.fn(),
  } as unknown as EntityManager;
};

describe('clerk-webhook.service', () => {
  let mockEm: EntityManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEm = createMockEm();
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid webhook signature and return event', () => {
      const mockEvent = {
        type: 'user.created',
        data: { id: 'user_123', email_addresses: [] },
        object: 'event',
      };

      const mockVerify = vi.fn().mockReturnValue(mockEvent);
      (Webhook as unknown as Mock).mockImplementation(function(this: { verify: typeof mockVerify }) {
        this.verify = mockVerify;
      });

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
      (Webhook as unknown as Mock).mockImplementation(function(this: { verify: typeof mockVerify }) {
        this.verify = mockVerify;
      });

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

    it('should accept EntityManager as parameter', async () => {
      (mockEm.findOne as Mock).mockResolvedValue(null);
      (mockEm.create as Mock).mockReturnValue({ id: 'user_new' });

      // Should not throw - accepts EntityManager
      await expect(handleUserCreated(validUserData, mockEm)).resolves.not.toThrow();
    });

    it('should use em.findOne to check if user exists by clerkId', async () => {
      (mockEm.findOne as Mock).mockResolvedValue(null);
      (mockEm.create as Mock).mockReturnValue({ id: 'user_new' });

      await handleUserCreated(validUserData, mockEm);

      expect(mockEm.findOne).toHaveBeenCalledWith(
        User,
        { clerkId: validUserData.id }
      );
    });

    it('should use em.findOne to check if user exists by email', async () => {
      (mockEm.findOne as Mock).mockResolvedValueOnce(null); // Not found by clerkId
      (mockEm.findOne as Mock).mockResolvedValueOnce(null); // Not found by email
      (mockEm.create as Mock).mockReturnValue({ id: 'user_new' });

      await handleUserCreated(validUserData, mockEm);

      expect(mockEm.findOne).toHaveBeenCalledWith(
        User,
        { email: 'test@example.com' }
      );
    });

    it('should use em.create and em.persist for new user', async () => {
      (mockEm.findOne as Mock).mockResolvedValue(null);
      const newUser = { id: 'user_new' };
      (mockEm.create as Mock).mockReturnValue(newUser);

      await handleUserCreated(validUserData, mockEm);

      expect(mockEm.create).toHaveBeenCalledWith(
        User,
        expect.objectContaining({
          clerkId: validUserData.id,
          email: 'test@example.com',
          name: 'John Doe',
          avatarUrl: 'https://example.com/avatar.jpg',
        })
      );
      expect(mockEm.persist).toHaveBeenCalledWith(newUser);
    });

    it('should call em.flush after creating user', async () => {
      (mockEm.findOne as Mock).mockResolvedValue(null);
      (mockEm.create as Mock).mockReturnValue({ id: 'user_new' });

      await handleUserCreated(validUserData, mockEm);

      expect(mockEm.flush).toHaveBeenCalled();
    });

    it('should skip creation if user already exists by clerkId (idempotency)', async () => {
      (mockEm.findOne as Mock).mockResolvedValueOnce({
        id: 'db_user_1',
        clerkId: validUserData.id,
      });

      await handleUserCreated(validUserData, mockEm);

      expect(mockEm.create).not.toHaveBeenCalled();
      expect(mockEm.persist).not.toHaveBeenCalled();
    });

    it('should update existing user with clerkId if email already exists', async () => {
      const existingUser = {
        id: 'db_user_existing',
        email: 'test@example.com',
        name: 'Old Name',
        clerkId: undefined as string | undefined,
        avatarUrl: undefined as string | undefined,
      };

      (mockEm.findOne as Mock).mockResolvedValueOnce(null); // Not found by clerkId
      (mockEm.findOne as Mock).mockResolvedValueOnce(existingUser); // Found by email

      await handleUserCreated(validUserData, mockEm);

      // Should update the existing user's properties
      expect(existingUser.clerkId).toBe(validUserData.id);
      expect(existingUser.name).toBe('John Doe');
      expect(existingUser.avatarUrl).toBe('https://example.com/avatar.jpg');
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it('should handle user with no email addresses', async () => {
      const userWithNoEmail = {
        ...validUserData,
        email_addresses: [],
      };

      await handleUserCreated(userWithNoEmail, mockEm);

      expect(mockEm.findOne).not.toHaveBeenCalled();
      expect(mockEm.create).not.toHaveBeenCalled();
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

    it('should accept EntityManager as parameter', async () => {
      (mockEm.findOne as Mock).mockResolvedValue({
        id: 'db_user_1',
        clerkId: validUserData.id,
      });

      await expect(handleUserUpdated(validUserData, mockEm)).resolves.not.toThrow();
    });

    it('should use em.findOne to find user by clerkId', async () => {
      (mockEm.findOne as Mock).mockResolvedValue({
        id: 'db_user_1',
        clerkId: validUserData.id,
      });

      await handleUserUpdated(validUserData, mockEm);

      expect(mockEm.findOne).toHaveBeenCalledWith(
        User,
        { clerkId: validUserData.id }
      );
    });

    it('should update user properties directly and flush', async () => {
      const existingUser = {
        id: 'db_user_1',
        clerkId: validUserData.id,
        email: 'old@example.com',
        name: 'Old Name',
        avatarUrl: null as string | null,
      };
      (mockEm.findOne as Mock).mockResolvedValue(existingUser);

      await handleUserUpdated(validUserData, mockEm);

      expect(existingUser.email).toBe('updated@example.com');
      expect(existingUser.name).toBe('Jane Smith');
      expect(existingUser.avatarUrl).toBe('https://example.com/new-avatar.jpg');
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it('should create user if not found (handles out-of-order events)', async () => {
      (mockEm.findOne as Mock).mockResolvedValue(null);
      (mockEm.create as Mock).mockReturnValue({ id: 'db_user_1' });

      await handleUserUpdated(validUserData, mockEm);

      // Should fall through to create
      expect(mockEm.create).toHaveBeenCalled();
    });

    it('should handle user with no email addresses', async () => {
      const userWithNoEmail = {
        ...validUserData,
        email_addresses: [],
      };

      await handleUserUpdated(userWithNoEmail, mockEm);

      expect(mockEm.findOne).not.toHaveBeenCalled();
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

    it('should accept EntityManager as parameter', async () => {
      (mockEm.findOne as Mock).mockResolvedValue({
        id: 'db_user_1',
        clerkId: validUserData.id,
      });

      await expect(handleUserDeleted(validUserData, mockEm)).resolves.not.toThrow();
    });

    it('should use em.findOne to find user by clerkId', async () => {
      (mockEm.findOne as Mock).mockResolvedValue({
        id: 'db_user_1',
        clerkId: validUserData.id,
      });

      await handleUserDeleted(validUserData, mockEm);

      expect(mockEm.findOne).toHaveBeenCalledWith(
        User,
        { clerkId: validUserData.id }
      );
    });

    it('should handle deletion of non-existent user gracefully', async () => {
      (mockEm.findOne as Mock).mockResolvedValue(null);

      // Should complete without error
      await handleUserDeleted(validUserData, mockEm);

      expect(mockEm.findOne).toHaveBeenCalled();
    });
  });

  describe('processWebhookEvent', () => {
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

    it('should accept EntityManager as second parameter', async () => {
      (mockEm.findOne as Mock).mockResolvedValue(null);
      (mockEm.create as Mock).mockReturnValue({ id: 'db_user_1' });

      await expect(
        processWebhookEvent(createEvent('user.created', validUserData), mockEm)
      ).resolves.not.toThrow();
    });

    it('should route user.created event to handleUserCreated', async () => {
      (mockEm.findOne as Mock).mockResolvedValue(null);
      (mockEm.create as Mock).mockReturnValue({ id: 'db_user_1' });

      await processWebhookEvent(createEvent('user.created', validUserData), mockEm);

      expect(mockEm.create).toHaveBeenCalled();
    });

    it('should route user.updated event to handleUserUpdated', async () => {
      const existingUser = {
        id: 'db_user_1',
        clerkId: validUserData.id,
        email: 'old@example.com',
      };
      (mockEm.findOne as Mock).mockResolvedValue(existingUser);

      await processWebhookEvent(createEvent('user.updated', validUserData), mockEm);

      expect(existingUser.email).toBe('test@example.com');
    });

    it('should route user.deleted event to handleUserDeleted', async () => {
      (mockEm.findOne as Mock).mockResolvedValue({
        id: 'db_user_1',
        clerkId: validUserData.id,
      });

      await processWebhookEvent(createEvent('user.deleted', validUserData), mockEm);

      expect(mockEm.findOne).toHaveBeenCalledWith(
        User,
        { clerkId: validUserData.id }
      );
    });

    it('should handle unknown event types gracefully', async () => {
      await processWebhookEvent(createEvent('organization.created', { id: 'org_123' }), mockEm);

      expect(mockEm.findOne).not.toHaveBeenCalled();
      expect(mockEm.create).not.toHaveBeenCalled();
    });
  });
});
