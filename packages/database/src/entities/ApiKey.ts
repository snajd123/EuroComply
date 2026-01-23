import { Entity, Property, ManyToOne, type Rel } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Organization } from './Organization.js';

/**
 * API Key entity for programmatic tenant access.
 *
 * Security notes:
 * - We store a hash of the key, never the raw key
 * - The raw key is only shown once at creation time
 * - key_prefix allows users to identify keys without exposing them
 */
@Entity({ tableName: 'api_keys', schema: 'public' })
export class ApiKey extends BaseEntity {
  /**
   * Organization this key belongs to.
   */
  @ManyToOne(() => Organization)
  organization!: Rel<Organization>;

  /**
   * SHA-256 hash of the API key.
   * Used for lookup - we never store the raw key.
   */
  @Property({ columnType: 'varchar(64)' })
  keyHash!: string;

  /**
   * Prefix of the key for identification (e.g., "sk_live_abc12345").
   * Shows first 12 chars so users can identify which key is which.
   */
  @Property({ columnType: 'varchar(20)' })
  keyPrefix!: string;

  /**
   * Human-readable name for the key (e.g., "Production", "CI/CD").
   */
  @Property({ columnType: 'varchar(255)' })
  name!: string;

  /**
   * Last time this key was used for authentication.
   */
  @Property({ type: 'datetime', nullable: true })
  lastUsedAt?: Date;

  /**
   * When the key was revoked. Null if still active.
   */
  @Property({ type: 'datetime', nullable: true })
  revokedAt?: Date;

  /**
   * Check if the key is active (not revoked).
   */
  get isActive(): boolean {
    return this.revokedAt === null || this.revokedAt === undefined;
  }
}
