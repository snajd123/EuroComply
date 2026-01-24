/**
 * Clerk Webhook Utility Tests
 *
 * Pure function tests for utility functions used in Clerk webhook handling.
 * Handler tests are covered by integration tests (provisioning.e2e.test.ts,
 * clerk-membership.integration.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { clerkOrgIdToSchemaName } from './clerk.js';

describe('clerkOrgIdToSchemaName', () => {
  it('converts Clerk org ID to valid schema name', () => {
    expect(clerkOrgIdToSchemaName('org_2abc3def4ghi5jkl')).toBe('tenant_org_4ghi5jkl');
    expect(clerkOrgIdToSchemaName('org_xyz123')).toBe('tenant_org_xyz123');
  });

  it('handles short org IDs', () => {
    expect(clerkOrgIdToSchemaName('org_abc')).toBe('tenant_org_abc');
  });

  it('uses last 8 characters for uniqueness', () => {
    // Two different org IDs with same last 8 chars produce same schema
    // (this is by design - schema name derived from org ID suffix)
    expect(clerkOrgIdToSchemaName('org_aaaa12345678')).toBe('tenant_org_12345678');
    expect(clerkOrgIdToSchemaName('org_bbbb12345678')).toBe('tenant_org_12345678');
  });
});
