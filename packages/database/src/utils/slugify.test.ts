import { describe, it, expect } from 'vitest';
import { slugify } from './slugify.js';

describe('slugify', () => {
  it('should convert to lowercase with underscores when name has hyphens', () => {
    expect(slugify('T-Shirts')).toBe('t_shirts');
  });

  it('should replace spaces with underscores when name has spaces', () => {
    expect(slugify('Product Category')).toBe('product_category');
  });

  it('should collapse multiple special chars when name has symbols', () => {
    expect(slugify('Apparel & Accessories')).toBe('apparel_accessories');
  });

  it('should trim leading and trailing underscores when present', () => {
    expect(slugify('--Test--')).toBe('test');
  });

  it('should truncate to 50 chars when name exceeds limit', () => {
    const longName = 'A'.repeat(100);
    expect(slugify(longName).length).toBe(50);
  });

  it('should return empty string when input is empty', () => {
    expect(slugify('')).toBe('');
  });

  it('should strip unicode chars when name has non-ASCII', () => {
    expect(slugify('Möbel & Einrichtung')).toBe('m_bel_einrichtung');
  });
});
