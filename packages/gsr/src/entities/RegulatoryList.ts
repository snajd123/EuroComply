import { Entity, Property, Unique, Index } from '@mikro-orm/core';
import { BaseEntity } from '@eurocomply/database';

/**
 * Represents a regulatory substance list (SVHC, Annex XVII, etc.).
 * Substances link to this via SubstanceListEntry.
 */
@Entity({ tableName: 'regulatory_list', schema: 'public' })
export class RegulatoryList extends BaseEntity {
  /** Unique code, e.g., "REACH_SVHC", "REACH_ANNEX_XVII" */
  @Property({ length: 100 })
  @Unique()
  @Index()
  code!: string;

  /** Display name */
  @Property({ type: 'text' })
  name!: string;

  /** Jurisdiction code, e.g., "EU", "US_CA", "US_FED" */
  @Property({ length: 20 })
  @Index()
  jurisdiction!: string;

  /** Publishing authority, e.g., "ECHA", "EPA", "OEHHA" */
  @Property({ length: 50 })
  publisher!: string;

  /** Optional description */
  @Property({ type: 'text', nullable: true })
  description?: string;

  /** URL to official source */
  @Property({ type: 'text', name: 'source_url', nullable: true })
  sourceUrl?: string;

  /** Version identifier */
  @Property({ length: 50, nullable: true })
  version?: string;

  /** When this list was last updated */
  @Property({ type: 'timestamptz', name: 'last_updated_at', nullable: true })
  lastUpdatedAt?: Date;
}
