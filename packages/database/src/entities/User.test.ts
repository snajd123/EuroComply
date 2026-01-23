import { describe, it, expect } from 'vitest';
import { User } from './User.js';

describe('User Entity', () => {
  it('can be instantiated', () => {
    const user = new User();
    expect(user).toBeInstanceOf(User);
  });

  it('has required properties', () => {
    const user = new User();
    user.id = 'usr_123';
    user.clerkId = 'user_clerk456';
    user.email = 'test@example.com';
    user.name = 'Test User';
    user.avatarUrl = 'https://example.com/avatar.png';

    expect(user.id).toBe('usr_123');
    expect(user.clerkId).toBe('user_clerk456');
    expect(user.email).toBe('test@example.com');
    expect(user.name).toBe('Test User');
    expect(user.avatarUrl).toBe('https://example.com/avatar.png');
  });

  it('has optional deletedAt for soft delete', () => {
    const user = new User();
    expect(user.deletedAt).toBeUndefined();

    user.deletedAt = new Date();
    expect(user.deletedAt).toBeInstanceOf(Date);
  });

  it('has optional lastLoginAt', () => {
    const user = new User();
    expect(user.lastLoginAt).toBeUndefined();

    user.lastLoginAt = new Date();
    expect(user.lastLoginAt).toBeInstanceOf(Date);
  });
});
