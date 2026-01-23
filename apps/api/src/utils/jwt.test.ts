import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyAndExtractTenant, extractTenantFromJwtUnsafe } from './jwt.js';

// Mock @clerk/backend
vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(),
}));

import { verifyToken } from '@clerk/backend';

const mockVerifyToken = vi.mocked(verifyToken);

describe('jwt utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractTenantFromJwtUnsafe', () => {
    it('extracts schema_name from direct claim', () => {
      const payload = btoa(JSON.stringify({ schema_name: 'tenant_acme', sub: 'user123' }));
      const token = `header.${payload}.signature`;

      const result = extractTenantFromJwtUnsafe(token);
      expect(result).toEqual({ schemaName: 'tenant_acme', userId: 'user123' });
    });

    it('extracts schema_name from org_metadata', () => {
      const payload = btoa(
        JSON.stringify({
          sub: 'user456',
          org_metadata: { schema_name: 'tenant_corp', tier: 'growth' },
        })
      );
      const token = `header.${payload}.signature`;

      const result = extractTenantFromJwtUnsafe(token);
      expect(result).toEqual({ schemaName: 'tenant_corp', userId: 'user456' });
    });

    it('prefers direct schema_name over org_metadata', () => {
      const payload = btoa(
        JSON.stringify({
          sub: 'user789',
          schema_name: 'tenant_direct',
          org_metadata: { schema_name: 'tenant_nested' },
        })
      );
      const token = `header.${payload}.signature`;

      const result = extractTenantFromJwtUnsafe(token);
      expect(result).toEqual({ schemaName: 'tenant_direct', userId: 'user789' });
    });

    it('returns null for invalid token format', () => {
      expect(extractTenantFromJwtUnsafe('')).toBeNull();
      expect(extractTenantFromJwtUnsafe('invalid')).toBeNull();
      expect(extractTenantFromJwtUnsafe('a.b')).toBeNull();
      expect(extractTenantFromJwtUnsafe('a.b.c.d')).toBeNull();
    });

    it('returns null if schema_name is missing', () => {
      const payload = btoa(JSON.stringify({ sub: 'user123' }));
      const token = `header.${payload}.signature`;

      expect(extractTenantFromJwtUnsafe(token)).toBeNull();
    });

    it('returns null for invalid base64', () => {
      const token = 'header.!!!invalid-base64!!!.signature';
      expect(extractTenantFromJwtUnsafe(token)).toBeNull();
    });

    it('returns anonymous userId when sub is missing', () => {
      const payload = btoa(JSON.stringify({ schema_name: 'tenant_test' }));
      const token = `header.${payload}.signature`;

      const result = extractTenantFromJwtUnsafe(token);
      expect(result).toEqual({ schemaName: 'tenant_test', userId: 'anonymous' });
    });
  });

  describe('verifyAndExtractTenant', () => {
    const secretKey = 'sk_test_xxxxx';

    it('returns tenant context for valid verified token', async () => {
      mockVerifyToken.mockResolvedValue({
        data: {
          sub: 'user_abc123',
          org_id: 'org_def456',
          org_metadata: { schema_name: 'tenant_acme', tier: 'growth' },
          iss: 'https://clerk.example.com',
          iat: Date.now() / 1000,
          exp: Date.now() / 1000 + 3600,
        },
        errors: undefined,
      } as any);

      const result = await verifyAndExtractTenant('valid.token.here', { secretKey });

      expect(result).toEqual({ schemaName: 'tenant_acme', userId: 'user_abc123' });
      expect(mockVerifyToken).toHaveBeenCalledWith('valid.token.here', {
        secretKey,
        jwtKey: undefined,
        authorizedParties: undefined,
      });
    });

    it('returns null when verification fails', async () => {
      mockVerifyToken.mockResolvedValue({
        data: undefined,
        errors: [new Error('Token expired')],
      } as any);

      const result = await verifyAndExtractTenant('expired.token.here', { secretKey });

      expect(result).toBeNull();
    });

    it('returns null when sub claim is missing', async () => {
      mockVerifyToken.mockResolvedValue({
        data: {
          org_metadata: { schema_name: 'tenant_acme' },
          iss: 'https://clerk.example.com',
        },
        errors: undefined,
      } as any);

      const result = await verifyAndExtractTenant('missing.sub.token', { secretKey });

      expect(result).toBeNull();
    });

    it('returns null when schema_name is missing', async () => {
      mockVerifyToken.mockResolvedValue({
        data: {
          sub: 'user_abc123',
          org_id: 'org_def456',
          // No org_metadata
        },
        errors: undefined,
      } as any);

      const result = await verifyAndExtractTenant('missing.schema.token', { secretKey });

      expect(result).toBeNull();
    });

    it('handles exceptions gracefully', async () => {
      mockVerifyToken.mockRejectedValue(new Error('Network error'));

      const result = await verifyAndExtractTenant('network.error.token', { secretKey });

      expect(result).toBeNull();
    });

    it('passes optional parameters to verifyToken', async () => {
      mockVerifyToken.mockResolvedValue({
        data: {
          sub: 'user_xyz',
          org_metadata: { schema_name: 'tenant_test' },
        },
        errors: undefined,
      } as any);

      await verifyAndExtractTenant('test.token', {
        secretKey,
        jwtKey: 'pk_test_xxxxx',
        authorizedParties: ['https://app.example.com'],
      });

      expect(mockVerifyToken).toHaveBeenCalledWith('test.token', {
        secretKey,
        jwtKey: 'pk_test_xxxxx',
        authorizedParties: ['https://app.example.com'],
      });
    });
  });
});
