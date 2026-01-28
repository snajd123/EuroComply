import {
  Entity,
  Property,
  Enum,
  ManyToOne,
  Unique,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { RegulationStatus } from './enums/RegulationStatus.js';

/**
 * Represents a regulation such as REACH, RoHS, CLP, etc.
 *
 * Lives in the public schema as shared system data.
 * Supports lifecycle states: DRAFT -> ACTIVE -> ARCHIVED
 * Supports succession via supersededBy for regulation versioning.
 */
@Entity({ tableName: 'regulation', schema: 'public' })
export class Regulation extends BaseEntity {
  /**
   * Unique code identifier for the regulation (e.g., 'REACH', 'ROHS', 'CLP')
   */
  @Property({ type: 'text' })
  @Unique()
  code!: string;

  /**
   * Human-readable name (e.g., 'REACH Regulation')
   */
  @Property({ type: 'text' })
  name!: string;

  /**
   * Detailed description of the regulation and its purpose
   */
  @Property({ type: 'text', nullable: true })
  description?: string;

  /**
   * Lifecycle status: DRAFT, ACTIVE, or ARCHIVED
   */
  @Enum({ items: () => RegulationStatus, default: RegulationStatus.DRAFT })
  status: RegulationStatus = RegulationStatus.DRAFT;

  /**
   * Version identifier (e.g., '2024-01')
   */
  @Property({ type: 'text', nullable: true })
  version?: string;

  /**
   * Date when this regulation became/becomes effective
   */
  @Property({ type: 'date', nullable: true, name: 'effective_date' })
  effectiveDate?: Date;

  /**
   * URL to the official source of this regulation
   */
  @Property({ type: 'text', nullable: true, name: 'source_url' })
  sourceUrl?: string;

  /**
   * Reference to the regulation that supersedes this one (when archived)
   */
  @ManyToOne(() => Regulation, { nullable: true, name: 'superseded_by_id' })
  supersededBy?: Regulation;

  /**
   * Timestamp when this regulation was archived
   */
  @Property({ type: 'timestamptz', nullable: true, name: 'archived_at' })
  archivedAt?: Date;

  /**
   * Reason for archiving this regulation
   */
  @Property({ type: 'text', nullable: true, name: 'archive_reason' })
  archiveReason?: string;

  /**
   * Additional metadata for jurisdiction, type, official journal refs, etc.
   */
  @Property({ type: 'jsonb', nullable: true })
  metadata?: {
    jurisdiction?: string;
    type?: string;
    officialJournalRef?: string;
  };
}
