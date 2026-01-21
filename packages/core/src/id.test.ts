import { describe, it, expect } from 'vitest';
import { createId, isCuid } from './id.js';

describe('id', () => {
  describe('createId', () => {
    it('generates a valid CUID2', () => {
      const id = createId();
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThanOrEqual(21);
      expect(id.length).toBeLessThanOrEqual(24);
    });

    it('generates unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        ids.add(createId());
      }
      expect(ids.size).toBe(1000);
    });
  });

  describe('isCuid', () => {
    it('returns true for valid CUID2', () => {
      const id = createId();
      expect(isCuid(id)).toBe(true);
    });

    it('returns false for invalid strings', () => {
      expect(isCuid('')).toBe(false);
      expect(isCuid('123')).toBe(false);
      expect(isCuid('not-a-cuid')).toBe(false);
    });
  });
});
