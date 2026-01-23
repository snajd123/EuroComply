import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { TenantContext } from '../middleware/tenant.js';

export interface JwtVerificationOptions {
  instanceUrl: string;
  clientId?: string;
}

export interface ZitadelTenantContext extends TenantContext {
  orgId?: string;
  tier?: string;
  cellId?: string;
}

interface ZitadelJwtPayload extends JWTPayload {
  'urn:zitadel:iam:org:id'?: string;
  'urn:eurocomply:schema_name'?: string;
  'urn:eurocomply:tier'?: string;
  'urn:eurocomply:cell_id'?: string;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(instanceUrl: string) {
  const cached = jwksCache.get(instanceUrl);
  if (cached) return cached;

  const jwksUrl = new URL('/.well-known/jwks.json', instanceUrl);
  const jwks = createRemoteJWKSet(jwksUrl);
  jwksCache.set(instanceUrl, jwks);
  return jwks;
}

export async function verifyAndExtractTenant(
  token: string,
  options: JwtVerificationOptions
): Promise<ZitadelTenantContext | null> {
  try {
    const jwks = getJWKS(options.instanceUrl);

    const { payload } = await jwtVerify(token, jwks, {
      audience: options.clientId,
      issuer: options.instanceUrl,
    });

    const zitadelPayload = payload as ZitadelJwtPayload;

    const userId = zitadelPayload.sub;
    if (!userId) {
      return null;
    }

    const schemaName = zitadelPayload['urn:eurocomply:schema_name'];
    if (!schemaName || typeof schemaName !== 'string') {
      return null;
    }

    return {
      schemaName,
      userId,
      orgId: zitadelPayload['urn:zitadel:iam:org:id'],
      tier: zitadelPayload['urn:eurocomply:tier'],
      cellId: zitadelPayload['urn:eurocomply:cell_id'],
    };
  } catch {
    return null;
  }
}

export function extractTenantFromJwtUnsafe(token: string): TenantContext | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = JSON.parse(atob(parts[1]!));

    const schemaName = payload['urn:eurocomply:schema_name'] ?? payload.schema_name;
    const userId = payload.sub;

    if (!schemaName || typeof schemaName !== 'string') {
      return null;
    }

    return { schemaName, userId: userId ?? 'anonymous' };
  } catch {
    return null;
  }
}
