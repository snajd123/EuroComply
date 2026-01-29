import {
  Entity,
  Property,
  Enum,
  OneToMany,
  Collection,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { StagingStatus } from './enums/StagingStatus.js';
import type { StagingRequirement } from './StagingRequirement.js';

/**
 * Source type for regulation ingestion.
 */
export type SourceType = 'EUR_LEX' | 'ECHA' | 'MANUAL';

/**
 * Staging table for regulations pending review.
 *
 * Regulations are extracted by AI (Claude) from legal documents,
 * validated against a shadow model (Gemini), then reviewed by
 * platform admins before publishing to production tables.
 *
 * Lives in the public schema.
 */
@Entity({ tableName: 'staging_regulation', schema: 'public' })
export class StagingRegulation extends BaseEntity {
  /**
   * Proposed regulation code (e.g., 'REACH_ANNEX_XVII')
   */
  @Property({ type: 'text' })
  code!: string;

  /**
   * Proposed regulation name
   */
  @Property({ type: 'text' })
  name!: string;

  /**
   * URL to the source document
   */
  @Property({ type: 'text', name: 'source_url' })
  sourceUrl!: string;

  /**
   * Type of source: EUR_LEX, ECHA, or MANUAL
   */
  @Property({ type: 'text', name: 'source_type' })
  sourceType!: SourceType;

  /**
   * Claude's full extraction payload (JSON)
   */
  @Property({ type: 'jsonb', name: 'primary_payload' })
  primaryPayload!: object;

  /**
   * Gemini's simplified extraction for validation (JSON)
   */
  @Property({ type: 'jsonb', nullable: true, name: 'shadow_payload' })
  shadowPayload?: object;

  /**
   * Additional metadata from extraction
   */
  @Property({ type: 'jsonb', nullable: true, name: 'regulation_metadata' })
  regulationMetadata?: {
    jurisdiction?: string;
    type?: string;
    officialJournalRef?: string;
    effectiveDate?: string;
    version?: string;
  };

  /**
   * Workflow status
   */
  @Enum({ items: () => StagingStatus, default: StagingStatus.PENDING })
  status: StagingStatus = StagingStatus.PENDING;

  /**
   * User who reviewed this staging regulation
   */
  @Property({ type: 'text', nullable: true, name: 'reviewed_by' })
  reviewedBy?: string;

  /**
   * Timestamp when review was completed
   */
  @Property({ type: 'timestamptz', nullable: true, name: 'approved_at' })
  approvedAt?: Date;

  /**
   * Reason for rejection (if rejected)
   */
  @Property({ type: 'text', nullable: true, name: 'rejection_reason' })
  rejectionReason?: string;

  /**
   * ID of the published regulation (after publishing)
   */
  @Property({ type: 'text', nullable: true, name: 'published_regulation_id' })
  publishedRegulationId?: string;

  /**
   * Requirements extracted for this regulation
   */
  @OneToMany('StagingRequirement', 'stagingRegulation')
  requirements = new Collection<StagingRequirement>(this);
}
