import {
  Entity,
  Property,
  Enum,
  ManyToOne,
  Collection,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { ConsensusStatus } from './enums/ConsensusStatus.js';
import type { StagingRegulation } from './StagingRegulation.js';

/**
 * Staging table for requirements pending review.
 *
 * Requirements are extracted by AI from legal documents along with
 * their parent regulations. Each requirement has a consensus status
 * based on agreement between primary (Claude) and shadow (Gemini) extractions.
 *
 * Lives in the public schema.
 */
@Entity({ tableName: 'staging_requirement', schema: 'public' })
export class StagingRequirement extends BaseEntity {
  /**
   * Parent staging regulation
   */
  @ManyToOne('StagingRegulation', { name: 'staging_regulation_id' })
  stagingRegulation!: StagingRegulation;

  /**
   * Proposed requirement code
   */
  @Property({ type: 'text' })
  code!: string;

  /**
   * Proposed requirement name
   */
  @Property({ type: 'text' })
  name!: string;

  /**
   * Substance name this requirement applies to
   */
  @Property({ type: 'text', nullable: true, name: 'substance_name' })
  substanceName?: string;

  /**
   * CAS number for the substance
   */
  @Property({ type: 'text', nullable: true, name: 'cas_number' })
  casNumber?: string;

  /**
   * Comparison operator (e.g., '<', '<=', '=')
   */
  @Property({ type: 'text', nullable: true })
  operator?: string;

  /**
   * Threshold value
   */
  @Property({ type: 'decimal', nullable: true, name: 'threshold_value' })
  thresholdValue?: number;

  /**
   * Unit of measurement
   */
  @Property({ type: 'text', nullable: true })
  unit?: string;

  /**
   * Scope of the requirement
   */
  @Property({ type: 'text', nullable: true })
  scope?: string;

  /**
   * Legal reference in the source document
   */
  @Property({ type: 'text', nullable: true, name: 'legal_reference' })
  legalReference?: string;

  /**
   * PDF coordinates for highlighting the source text
   */
  @Property({ type: 'jsonb', nullable: true, name: 'pdf_coordinates' })
  pdfCoordinates?: {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  };

  /**
   * Type of requirement
   */
  @Property({ type: 'text', nullable: true })
  type?: string;

  /**
   * Severity level
   */
  @Property({ type: 'text', nullable: true })
  severity?: string;

  /**
   * AI confidence score (0-1)
   */
  @Property({ type: 'decimal', nullable: true, name: 'confidence_score' })
  confidenceScore?: number;

  /**
   * AI reasoning for this extraction
   */
  @Property({ type: 'text', nullable: true })
  reasoning?: string;

  /**
   * Consensus status between primary and shadow extractions
   */
  @Enum({ items: () => ConsensusStatus, default: ConsensusStatus.SHADOW_MISSING })
  consensusStatus: ConsensusStatus = ConsensusStatus.SHADOW_MISSING;

  /**
   * Details about conflicts between extractions
   */
  @Property({ type: 'jsonb', nullable: true, name: 'conflict_details' })
  conflictDetails?: object;

  /**
   * Whether this requirement has been approved by a reviewer
   */
  @Property({ type: 'boolean', default: false, name: 'is_approved' })
  isApproved: boolean = false;
}
