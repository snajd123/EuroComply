// packages/gsr/src/utils/name-normalizer.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeName, sanitizeName } from './name-normalizer.js';

describe('name-normalizer', () => {
  describe('normalizeName', () => {
    it('should lowercase and trim', () => {
      expect(normalizeName('  Lead Dioxide  ')).toBe('lead dioxide');
      expect(normalizeName('FORMALDEHYDE')).toBe('formaldehyde');
    });

    it('should collapse multiple spaces', () => {
      expect(normalizeName('lead   dioxide')).toBe('lead dioxide');
      expect(normalizeName('lead\t\ndioxide')).toBe('lead dioxide');
    });

    it('should remove special characters but keep hyphens and numbers', () => {
      expect(normalizeName('Lead(II) oxide')).toBe('leadii oxide');
      expect(normalizeName('2,4-Dinitrotoluene')).toBe('24-dinitrotoluene');
      expect(normalizeName('N,N-Dimethylformamide')).toBe('nn-dimethylformamide');
    });

    it('should handle Greek letters by keeping them', () => {
      expect(normalizeName('α-Pinene')).toBe('α-pinene');
      expect(normalizeName('β-Naphthol')).toBe('β-naphthol');
    });

    it('should return empty string for null/undefined', () => {
      expect(normalizeName(null as unknown as string)).toBe('');
      expect(normalizeName(undefined as unknown as string)).toBe('');
      expect(normalizeName('')).toBe('');
    });
  });

  describe('sanitizeName', () => {
    it('should clean common prefixes/suffixes', () => {
      expect(sanitizeName('CAS 1309-60-0 Lead dioxide')).toBe('lead dioxide');
      expect(sanitizeName('Lead dioxide (CAS: 1309-60-0)')).toBe('lead dioxide');
    });

    it('should remove EC number annotations', () => {
      expect(sanitizeName('Lead dioxide [EC 215-174-5]')).toBe('lead dioxide');
      expect(sanitizeName('Lead dioxide EC:215-174-5')).toBe('lead dioxide');
    });

    it('should handle percentage annotations', () => {
      expect(sanitizeName('Lead dioxide ≥99%')).toBe('lead dioxide');
      expect(sanitizeName('Lead dioxide, 99.9%')).toBe('lead dioxide');
    });

    it('should normalize after sanitizing', () => {
      expect(sanitizeName('  LEAD DIOXIDE  ')).toBe('lead dioxide');
    });
  });
});
