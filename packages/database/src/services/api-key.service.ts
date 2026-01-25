import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { ApiKey, Organization } from '../entities/index.js';
import { WorkspaceAuthority } from '../entities/WorkspaceAuthority.js';
import type { EntityManager } from '@mikro-orm/postgresql';

/**
 * Result of creating a new API key.
 * The rawKey is only available at creation time - we don't store it.
 */
export interface CreateApiKeyResult {
  apiKey: ApiKey;
  rawKey: string;
}

/**
 * Result of validating an API key.
 */
export interface ValidateApiKeyResult {
  valid: boolean;
  organizationId?: string;
  schemaName?: string;
  error?: string;

  // API key ID for audit traceability (used in userId: `api-key:${apiKeyId}`)
  apiKeyId?: string;

  // Workspace authorities for authorization
  designAuthority?: WorkspaceAuthority;
  operationsAuthority?: WorkspaceAuthority;
  marketingAuthority?: WorkspaceAuthority;
  complianceAuthority?: WorkspaceAuthority;
  isOrgAdmin?: boolean;
}

/**
 * Generates a cryptographically secure API key.
 *
 * Format: ek_live_<32 random bytes as base64url>
 * Example: ek_live_7fHj2kLm9pQr5tUv8wXy1zAaBbCcDdEeFf
 */
export function generateRawApiKey(): string {
  const randomPart = randomBytes(32).toString('base64url');
  return `ek_live_${randomPart}`;
}

/**
 * Hashes an API key using SHA-256.
 * This is a one-way operation - the original key cannot be recovered.
 */
export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Extracts the prefix from a raw API key for identification.
 * Returns first 16 characters (e.g., "ek_live_abc12345").
 */
export function extractKeyPrefix(rawKey: string): string {
  return rawKey.substring(0, 16);
}

/**
 * API Key Service for managing tenant API keys.
 */
export class ApiKeyService {
  constructor(private em: EntityManager) {}

  /**
   * Creates a new API key for an organization.
   *
   * @param organizationId - The organization ID
   * @param name - Human-readable name for the key
   * @returns The created key entity AND the raw key (only time it's available)
   */
  async createKey(organizationId: string, name: string): Promise<CreateApiKeyResult> {
    const em = this.em.fork();

    // Generate the key material before transaction
    const rawKey = generateRawApiKey();
    const keyHash = hashApiKey(rawKey);
    const keyPrefix = extractKeyPrefix(rawKey);

    // All DML inside transactional block with explicit search_path
    const apiKey = await em.transactional(async (txEm) => {
      await txEm.execute('SET search_path TO public');

      const org = await txEm.findOne(Organization, { id: organizationId });
      if (!org) {
        throw new Error(`Organization not found: ${organizationId}`);
      }

      const key = new ApiKey();
      key.organization = org;
      key.keyHash = keyHash;
      key.keyPrefix = keyPrefix;
      key.name = name;

      txEm.persist(key);
      await txEm.flush();

      return key;
    });

    return { apiKey, rawKey };
  }

  /**
   * Validates an API key and returns the associated organization info.
   *
   * @param rawKey - The raw API key from the request
   * @returns Validation result with organization details if valid
   */
  async validateKey(rawKey: string): Promise<ValidateApiKeyResult> {
    if (!rawKey || !rawKey.startsWith('ek_live_')) {
      return { valid: false, error: 'Invalid key format' };
    }

    const keyHash = hashApiKey(rawKey);
    const em = this.em.fork();

    // All operations inside transactional block with explicit search_path
    // Prevents cross-talk if connection was left in tenant schema
    return em.transactional(async (txEm) => {
      await txEm.execute('SET search_path TO public');

      const apiKey = await txEm.findOne(
        ApiKey,
        { keyHash },
        { populate: ['organization'] }
      );

      if (!apiKey) {
        return { valid: false, error: 'API key not found' };
      }

      if (!apiKey.isActive) {
        return { valid: false, error: 'API key has been revoked' };
      }

      // Update last used timestamp (inside transaction)
      apiKey.lastUsedAt = new Date();
      await txEm.flush();

      return {
        valid: true,
        organizationId: apiKey.organization.id,
        schemaName: apiKey.organization.schemaName,
        // API key ID for audit traceability
        apiKeyId: apiKey.id,
        // Pass through authority fields
        designAuthority: apiKey.designAuthority,
        operationsAuthority: apiKey.operationsAuthority,
        marketingAuthority: apiKey.marketingAuthority,
        complianceAuthority: apiKey.complianceAuthority,
        isOrgAdmin: apiKey.isOrgAdmin,
      };
    });
  }

  /**
   * Lists all API keys for an organization (without exposing hashes).
   */
  async listKeys(organizationId: string): Promise<ApiKey[]> {
    const em = this.em.fork();

    // Explicitly set search_path to public
    return em.transactional(async (txEm) => {
      await txEm.execute('SET search_path TO public');
      return txEm.find(ApiKey, { organization: { id: organizationId } });
    });
  }

  /**
   * Revokes an API key.
   */
  async revokeKey(keyId: string, organizationId: string): Promise<boolean> {
    const em = this.em.fork();

    // All operations inside transactional block
    return em.transactional(async (txEm) => {
      await txEm.execute('SET search_path TO public');

      const apiKey = await txEm.findOne(ApiKey, {
        id: keyId,
        organization: { id: organizationId },
      });

      if (!apiKey) {
        return false;
      }

      apiKey.revokedAt = new Date();
      await txEm.flush();

      return true;
    });
  }
}
