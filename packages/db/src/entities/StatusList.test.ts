import { describe, it, expect } from 'vitest';
import { StatusList } from './StatusList.js';
import { StatusListEntry } from './StatusListEntry.js';

describe('StatusList Entity', () => {
  describe('StatusList class', () => {
    it('should be instantiable', () => {
      const statusList = new StatusList();
      expect(statusList).toBeInstanceOf(StatusList);
    });

    it('should have default currentIndex of 0', () => {
      const statusList = new StatusList();
      expect(statusList.currentIndex).toBe(0);
    });

    it('should have default createdAt timestamp', () => {
      const before = new Date();
      const statusList = new StatusList();
      const after = new Date();

      expect(statusList.createdAt).toBeInstanceOf(Date);
      expect(statusList.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(statusList.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should have default updatedAt timestamp', () => {
      const before = new Date();
      const statusList = new StatusList();
      const after = new Date();

      expect(statusList.updatedAt).toBeInstanceOf(Date);
      expect(statusList.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(statusList.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should allow setting required fields', () => {
      const statusList = new StatusList();
      statusList.id = 'sl_123456789012345678901234';
      statusList.purpose = 'revocation';
      statusList.encodedList = 'H4sIAAAAAAAAA2NgGAWjYBSMglEwCkbBKBgFo2AUjIJRMAoGFQAAcCebdAAQAAA=';

      expect(statusList.id).toBe('sl_123456789012345678901234');
      expect(statusList.purpose).toBe('revocation');
      expect(statusList.encodedList).toBe('H4sIAAAAAAAAA2NgGAWjYBSMglEwCkbBKBgFo2AUjIJRMAoGFQAAcCebdAAQAAA=');
    });

    it('should allow setting currentIndex', () => {
      const statusList = new StatusList();
      statusList.currentIndex = 42;

      expect(statusList.currentIndex).toBe(42);
    });

    it('should have an entries collection', () => {
      const statusList = new StatusList();
      expect(statusList.entries).toBeDefined();
    });

    it('should support common purpose values', () => {
      const statusList = new StatusList();

      statusList.purpose = 'revocation';
      expect(statusList.purpose).toBe('revocation');

      statusList.purpose = 'suspension';
      expect(statusList.purpose).toBe('suspension');
    });
  });
});

describe('StatusListEntry Entity', () => {
  describe('StatusListEntry class', () => {
    it('should be instantiable', () => {
      const entry = new StatusListEntry();
      expect(entry).toBeInstanceOf(StatusListEntry);
    });

    it('should have default revoked value of false', () => {
      const entry = new StatusListEntry();
      expect(entry.revoked).toBe(false);
    });

    it('should have default createdAt timestamp', () => {
      const before = new Date();
      const entry = new StatusListEntry();
      const after = new Date();

      expect(entry.createdAt).toBeInstanceOf(Date);
      expect(entry.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(entry.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should allow setting required fields', () => {
      const statusList = new StatusList();
      statusList.id = 'sl_123456789012345678901234';
      statusList.purpose = 'revocation';
      statusList.encodedList = 'base64encodeddata';

      const entry = new StatusListEntry();
      entry.id = 'sle_12345678901234567890123';
      entry.statusList = statusList;
      entry.credentialId = 'cred_1234567890123456789012';
      entry.index = 0;

      expect(entry.id).toBe('sle_12345678901234567890123');
      expect(entry.statusList).toBe(statusList);
      expect(entry.credentialId).toBe('cred_1234567890123456789012');
      expect(entry.index).toBe(0);
    });

    it('should allow setting revoked to true', () => {
      const entry = new StatusListEntry();
      expect(entry.revoked).toBe(false);

      entry.revoked = true;
      expect(entry.revoked).toBe(true);
    });

    it('should allow optional revokedAt to be undefined by default', () => {
      const entry = new StatusListEntry();
      expect(entry.revokedAt).toBeUndefined();
    });

    it('should allow setting revokedAt timestamp', () => {
      const entry = new StatusListEntry();
      const revokedDate = new Date('2024-06-15T14:30:00Z');
      entry.revokedAt = revokedDate;

      expect(entry.revokedAt).toEqual(revokedDate);
    });

    it('should allow setting index to various values', () => {
      const entry = new StatusListEntry();

      entry.index = 0;
      expect(entry.index).toBe(0);

      entry.index = 1000;
      expect(entry.index).toBe(1000);

      entry.index = 131071;
      expect(entry.index).toBe(131071);
    });
  });
});
