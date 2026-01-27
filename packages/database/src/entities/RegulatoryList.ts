import { Entity, Property, Unique } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';

/**
 * Represents a regulatory list such as REACH_SVHC, ROHS_RESTRICTED, COSING_ANNEX_II.
 *
 * Lives in the public schema as shared system data.
 * Supports version tracking via previousVersionId and isCurrentVersion.
 */
@Entity({ tableName: 'regulatory_list', schema: 'public' })
@Unique({ properties: ['code', 'version'] })
export class RegulatoryList extends BaseEntity {
  /**
   * Code identifier for the regulatory list (e.g., 'REACH_SVHC', 'ROHS_RESTRICTED')
   */
  @Property({ type: 'text' })
  code!: string;

  /**
   * Human-readable name (e.g., 'REACH SVHC Candidate List')
   */
  @Property({ type: 'text' })
  name!: string;

  /**
   * Source authority (e.g., 'ECHA', 'EU_ROHS', 'EU_COSMETICS')
   */
  @Property({ type: 'text' })
  source!: string;

  /**
   * Version identifier (e.g., '2024-01')
   */
  @Property({ type: 'text' })
  version!: string;

  /**
   * Date when this version became effective
   */
  @Property({ type: 'timestamptz', name: 'effective_date' })
  effectiveDate!: Date;

  /**
   * Date when this version was superseded by a newer version
   */
  @Property({ type: 'timestamptz', nullable: true, name: 'superseded_date' })
  supersededDate?: Date;

  /**
   * Whether this is the current active version of the list
   */
  @Property({ type: 'boolean', default: true, name: 'is_current_version' })
  isCurrentVersion: boolean = true;

  /**
   * Whether tenants can create exemptions for entries on this list.
   * Some regulations (e.g., absolute bans) may not allow any exemptions.
   */
  @Property({ type: 'boolean', default: true, name: 'allow_tenant_exemption' })
  allowTenantExemption: boolean = true;

  /**
   * URL to the official source of this regulatory list
   */
  @Property({ type: 'text', nullable: true, name: 'source_url' })
  sourceUrl?: string;

  /**
   * Description of the regulatory list and its purpose
   */
  @Property({ type: 'text', nullable: true })
  description?: string;

  /**
   * Reference to the previous version of this regulatory list
   */
  @Property({ type: 'text', nullable: true, name: 'previous_version_id' })
  previousVersionId?: string;
}
