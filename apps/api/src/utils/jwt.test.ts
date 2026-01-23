import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyAndExtractTenant, type JwtVerificationOptions } from './jwt.js';

// Mock jose module
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(),
  jwtVerify: vi.fn(),
}));

import { createRemoteJWKSet, jwtVerify } from 'jose';

describe('verifyAndExtractTenant', () => {
  const mockOptions: JwtVerificationOptions = {
    instanceUrl: 'https://test.zitadel.cloud',
    clientId: 'test-client-id',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns tenant context for valid token with custom claims', async () => {
    const mockPayload = {
      sub: 'user_123',
      'urn:zitadel:iam:org:id': 'org_456',
      'urn:eurocomply:schema_name': 'tenant_org_456',
      'urn:eurocomply:tier': 'starter',
      'urn:eurocomply:cell_id': 'cell_1',
    };

    vi.mocked(createRemoteJWKSet).mockReturnValue(vi.fn() as any);
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: mockPayload,
      protectedHeader: { alg: 'RS256' },
    } as any);

    const result = await verifyAndExtractTenant('valid.jwt.token', mockOptions);

    expect(result).toEqual({
      schemaName: 'tenant_org_456',
      userId: 'user_123',
      orgId: 'org_456',
      tier: 'starter',
      cellId: 'cell_1',
    });
  });

  it('returns null for token without schema_name claim', async () => {
    const mockPayload = {
      sub: 'user_123',
      'urn:zitadel:iam:org:id': 'org_456',
    };

    vi.mocked(createRemoteJWKSet).mockReturnValue(vi.fn() as any);
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: mockPayload,
      protectedHeader: { alg: 'RS256' },
    } as any);

    const result = await verifyAndExtractTenant('token.without.schema', mockOptions);

    expect(result).toBeNull();
  });

  it('returns null for invalid token', async () => {
    vi.mocked(createRemoteJWKSet).mockReturnValue(vi.fn() as any);
    vi.mocked(jwtVerify).mockRejectedValue(new Error('Invalid signature'));

    const result = await verifyAndExtractTenant('invalid.token', mockOptions);

    expect(result).toBeNull();
  });
});

describe('extractTenantFromJwtUnsafe', () => {
  it('extracts tenant from base64 payload without verification', async () => {
    const { extractTenantFromJwtUnsafe } = await import('./jwt.js');

    const payload = {
      sub: 'user_123',
      'urn:eurocomply:schema_name': 'tenant_test',
    };
    const base64Payload = btoa(JSON.stringify(payload));
    const mockToken = `header.${base64Payload}.signature`;

    const result = extractTenantFromJwtUnsafe(mockToken);

    expect(result).toEqual({
      schemaName: 'tenant_test',
      userId: 'user_123',
    });
  });
});
