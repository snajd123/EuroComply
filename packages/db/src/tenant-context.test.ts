import { describe, it, expect } from 'vitest';
import { validateSchemaName, formatSchemaName } from './tenant-context.js';

describe('tenant-context', () => {
  describe('validateSchemaName', () => {
    it('accepts valid schema names', () => {
      expect(validateSchemaName('tenant_abc123')).toBe(true);
      expect(validateSchemaName('tenant_my_org')).toBe(true);
      expect(validateSchemaName('tenant_test123')).toBe(true);
    });

    it('rejects invalid schema names', () => {
      expect(validateSchemaName('abc123')).toBe(false); // missing prefix
      expect(validateSchemaName('tenant_')).toBe(false); // empty slug
      expect(validateSchemaName('tenant_ab')).toBe(false); // too short
      expect(validateSchemaName("tenant_abc'; DROP TABLE--")).toBe(false); // injection
      expect(validateSchemaName('tenant_ABC')).toBe(false); // uppercase
      expect(validateSchemaName('public')).toBe(false); // reserved
    });
  });

  describe('formatSchemaName', () => {
    it('formats organization slug to schema name', () => {
      expect(formatSchemaName('myorg')).toBe('tenant_myorg');
      expect(formatSchemaName('my-org-123')).toBe('tenant_my_org_123');
      expect(formatSchemaName('MyOrg')).toBe('tenant_myorg');
    });
  });
});
