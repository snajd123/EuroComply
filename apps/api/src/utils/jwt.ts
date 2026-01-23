import { verifyToken } from '@clerk/backend';
import type { TenantContext } from '../middleware/tenant.js';

/**
 * Options for JWT verification
 */
export interface JwtVerificationOptions {
  /** Clerk secret key for API calls to fetch JWKS */
  secretKey: string;
  /** Optional: Clerk JWT public key for networkless verification */
  jwtKey?: string;
  /** Optional: List of authorized parties (origins) that can use this token */
  authorizedParties?: string[];
}

/**
 * Clerk JWT payload structure with organization metadata
 */
interface ClerkOrgMetadata {
  schema_name?: string;
  tier?: string;
  cell_id?: string;
}

/**
 * Verifies a Clerk JWT token and extracts tenant context.
 *
 * This function:
 * 1. Verifies the JWT signature against Clerk's JWKS
 * 2. Validates standard JWT claims (exp, iat, nbf)
 * 3. Extracts the tenant schema_name from org_metadata
 *
 * @param token - The JWT token to verify
 * @param options - Verification options including Clerk secret key
 * @returns TenantContext if valid, null otherwise
 */
export async function verifyAndExtractTenant(
  token: string,
  options: JwtVerificationOptions
): Promise<TenantContext | null> {
  try {
    const result = await verifyToken(token, {
      secretKey: options.secretKey,
      jwtKey: options.jwtKey,
      authorizedParties: options.authorizedParties,
    });

    // verifyToken returns { data, errors } discriminated union
    if (result.errors) {
      return null;
    }

    const payload = result.data;

    // Extract user ID from 'sub' claim
    const userId = payload.sub;
    if (!userId) {
      return null;
    }

    // Extract schema_name from org_metadata (custom claim configured in Clerk)
    // Clerk allows adding custom claims to JWTs via session token customization
    const orgMetadata = payload.org_metadata as ClerkOrgMetadata | undefined;
    const schemaName = orgMetadata?.schema_name;

    if (!schemaName || typeof schemaName !== 'string') {
      return null;
    }

    return { schemaName, userId };
  } catch {
    // Any unexpected errors during verification
    return null;
  }
}

/**
 * Extracts tenant context from a JWT token WITHOUT signature verification.
 *
 * WARNING: This is INSECURE and should only be used for:
 * - Unit tests with mock tokens
 * - Development environments without Clerk
 *
 * @deprecated Use verifyAndExtractTenant for production
 */
export function extractTenantFromJwtUnsafe(token: string): TenantContext | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // Base64 decode the payload (middle part)
    const payload = JSON.parse(atob(parts[1]!));

    // Support both direct schema_name and nested org_metadata.schema_name
    const schemaName = payload.schema_name ?? payload.org_metadata?.schema_name;
    const userId = payload.sub;

    if (!schemaName || typeof schemaName !== 'string') {
      return null;
    }

    return { schemaName, userId: userId ?? 'anonymous' };
  } catch {
    return null;
  }
}
