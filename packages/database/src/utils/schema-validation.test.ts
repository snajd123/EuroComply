import { describe, it, expect } from 'vitest';
import {
  SCHEMA_NAME_PATTERN,
  SCHEMA_NAME_MAX_LENGTH,
  SCHEMA_NAME_MIN_LENGTH,
  isValidSchemaName,
  assertValidSchemaName,
  generateSchemaName,
  schemaNameSchema,
} from './schema-validation.js';

describe('schema-validation', () => {
  describe('SCHEMA_NAME_PATTERN', () => {
    it('matches valid schema names', () => {
      expect(SCHEMA_NAME_PATTERN.test('tenant_acme')).toBe(true);
      expect(SCHEMA_NAME_PATTERN.test('tenant_org_123')).toBe(true);
      expect(SCHEMA_NAME_PATTERN.test('tenant_my_company_2024')).toBe(true);
      expect(SCHEMA_NAME_PATTERN.test('tenant_a')).toBe(true);
      expect(SCHEMA_NAME_PATTERN.test('tenant_1')).toBe(true);
      expect(SCHEMA_NAME_PATTERN.test('tenant_abc_def_ghi')).toBe(true);
    });

    it('rejects invalid schema names', () => {
      expect(SCHEMA_NAME_PATTERN.test('acme')).toBe(false); // Missing prefix
      expect(SCHEMA_NAME_PATTERN.test('tenant_')).toBe(false); // Nothing after prefix
      expect(SCHEMA_NAME_PATTERN.test('tenant_ACME')).toBe(false); // Uppercase
      expect(SCHEMA_NAME_PATTERN.test('tenant_acme-corp')).toBe(false); // Hyphen
      expect(SCHEMA_NAME_PATTERN.test('tenant_acme.corp')).toBe(false); // Dot
      expect(SCHEMA_NAME_PATTERN.test('public')).toBe(false); // Reserved
      expect(SCHEMA_NAME_PATTERN.test('TENANT_acme')).toBe(false); // Uppercase prefix
      expect(SCHEMA_NAME_PATTERN.test('tenant_acme corp')).toBe(false); // Space
      expect(SCHEMA_NAME_PATTERN.test('')).toBe(false); // Empty
      expect(SCHEMA_NAME_PATTERN.test('tenant_acme; DROP TABLE users;')).toBe(false); // SQL injection
    });
  });

  describe('isValidSchemaName', () => {
    it('returns true for valid schema names', () => {
      expect(isValidSchemaName('tenant_acme')).toBe(true);
      expect(isValidSchemaName('tenant_org_123')).toBe(true);
      expect(isValidSchemaName('tenant_my_company')).toBe(true);
    });

    it('returns false for invalid schema names', () => {
      expect(isValidSchemaName('')).toBe(false);
      expect(isValidSchemaName('acme')).toBe(false);
      expect(isValidSchemaName('tenant_')).toBe(false);
      expect(isValidSchemaName('tenant_ACME')).toBe(false);
      expect(isValidSchemaName('public')).toBe(false);
    });

    it('returns false for non-string inputs', () => {
      expect(isValidSchemaName(null as any)).toBe(false);
      expect(isValidSchemaName(undefined as any)).toBe(false);
      expect(isValidSchemaName(123 as any)).toBe(false);
      expect(isValidSchemaName({} as any)).toBe(false);
    });

    it('returns false for names exceeding max length', () => {
      const longName = 'tenant_' + 'a'.repeat(SCHEMA_NAME_MAX_LENGTH);
      expect(isValidSchemaName(longName)).toBe(false);
    });

    it('returns true for names at max length', () => {
      // Max length is 63, "tenant_" is 7 chars, so we can have 56 more chars
      const maxName = 'tenant_' + 'a'.repeat(56);
      expect(maxName.length).toBe(63);
      expect(isValidSchemaName(maxName)).toBe(true);
    });
  });

  describe('assertValidSchemaName', () => {
    it('does not throw for valid schema names', () => {
      expect(() => assertValidSchemaName('tenant_acme')).not.toThrow();
      expect(() => assertValidSchemaName('tenant_org_123')).not.toThrow();
    });

    it('throws for empty or non-string input', () => {
      expect(() => assertValidSchemaName('')).toThrow('non-empty string');
      expect(() => assertValidSchemaName(null as any)).toThrow('non-empty string');
      expect(() => assertValidSchemaName(undefined as any)).toThrow('non-empty string');
    });

    it('throws for names exceeding max length', () => {
      const longName = 'tenant_' + 'a'.repeat(SCHEMA_NAME_MAX_LENGTH);
      expect(() => assertValidSchemaName(longName)).toThrow('maximum length');
    });

    it('throws with descriptive message for invalid pattern', () => {
      expect(() => assertValidSchemaName('acme')).toThrow('Invalid schema name');
      expect(() => assertValidSchemaName('acme')).toThrow('tenant_[a-z0-9_]+');
    });

    it('includes the invalid name in error message', () => {
      expect(() => assertValidSchemaName('invalid_name')).toThrow('"invalid_name"');
    });
  });

  describe('generateSchemaName', () => {
    it('generates valid schema names from simple identifiers', () => {
      expect(generateSchemaName('acme')).toBe('tenant_acme');
      expect(generateSchemaName('corp')).toBe('tenant_corp');
      expect(generateSchemaName('test123')).toBe('tenant_test123');
    });

    it('converts uppercase to lowercase', () => {
      expect(generateSchemaName('ACME')).toBe('tenant_acme');
      expect(generateSchemaName('AcMe')).toBe('tenant_acme');
    });

    it('replaces hyphens with underscores', () => {
      expect(generateSchemaName('acme-corp')).toBe('tenant_acme_corp');
      expect(generateSchemaName('my-company-name')).toBe('tenant_my_company_name');
    });

    it('replaces spaces with underscores', () => {
      expect(generateSchemaName('Acme Corp')).toBe('tenant_acme_corp');
      expect(generateSchemaName('My Company')).toBe('tenant_my_company');
    });

    it('collapses multiple underscores', () => {
      expect(generateSchemaName('acme--corp')).toBe('tenant_acme_corp');
      expect(generateSchemaName('acme___corp')).toBe('tenant_acme_corp');
    });

    it('removes leading and trailing underscores', () => {
      expect(generateSchemaName('_acme_')).toBe('tenant_acme');
      expect(generateSchemaName('-acme-')).toBe('tenant_acme');
    });

    it('handles special characters', () => {
      expect(generateSchemaName('acme@corp.com')).toBe('tenant_acme_corp_com');
      expect(generateSchemaName("acme's company")).toBe('tenant_acme_s_company');
    });

    it('truncates long identifiers', () => {
      const longIdentifier = 'a'.repeat(100);
      const result = generateSchemaName(longIdentifier);
      expect(result.length).toBe(SCHEMA_NAME_MAX_LENGTH);
      expect(result.startsWith('tenant_')).toBe(true);
    });

    it('throws for empty identifier', () => {
      expect(() => generateSchemaName('')).toThrow('non-empty string');
      expect(() => generateSchemaName(null as any)).toThrow('non-empty string');
    });

    it('throws when identifier becomes empty after sanitization', () => {
      expect(() => generateSchemaName('!!!')).toThrow('Cannot generate schema name');
      expect(() => generateSchemaName('---')).toThrow('Cannot generate schema name');
    });
  });

  describe('schemaNameSchema (Zod)', () => {
    it('parses valid schema names', () => {
      expect(schemaNameSchema.parse('tenant_acme')).toBe('tenant_acme');
      expect(schemaNameSchema.parse('tenant_org_123')).toBe('tenant_org_123');
    });

    it('throws for names below minimum length', () => {
      expect(() => schemaNameSchema.parse('tenant_')).toThrow();
      expect(() => schemaNameSchema.parse('abc')).toThrow();
    });

    it('throws for names above maximum length', () => {
      const longName = 'tenant_' + 'a'.repeat(SCHEMA_NAME_MAX_LENGTH);
      expect(() => schemaNameSchema.parse(longName)).toThrow();
    });

    it('throws for invalid pattern', () => {
      expect(() => schemaNameSchema.parse('acme')).toThrow();
      expect(() => schemaNameSchema.parse('tenant_ACME')).toThrow();
      expect(() => schemaNameSchema.parse('tenant_acme-corp')).toThrow();
    });

    it('provides meaningful error messages for pattern violations', () => {
      // Use a string that passes length check but fails pattern
      const result = schemaNameSchema.safeParse('invalid_schema_name');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('tenant_[a-z0-9_]+');
      }
    });

    it('provides meaningful error messages for length violations', () => {
      const result = schemaNameSchema.safeParse('acme');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('at least 8 characters');
      }
    });
  });

  describe('constants', () => {
    it('has correct minimum length', () => {
      // "tenant_" is 7 chars + at least 1 char = 8
      expect(SCHEMA_NAME_MIN_LENGTH).toBe(8);
    });

    it('has correct maximum length', () => {
      // PostgreSQL identifier limit
      expect(SCHEMA_NAME_MAX_LENGTH).toBe(63);
    });
  });
});
