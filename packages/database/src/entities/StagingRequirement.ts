import {
  Entity,
  Property,
  Enum,
  ManyToOne,
  Index,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { StagingRegulation } from './StagingRegulation.js';
import { ConsensusStatus } from './enums/ConsensusStatus.js';
import { RequirementType } from './enums/RequirementType.js';
import { RequirementSeverity } from './enums/RequirementSeverity.js';
import { ComparisonOperator } from './enums/ComparisonOperator.js';

/**
 * Conflict details when Claude and Gemini disagree.
 */
export interface ConflictDetails {
  claude: { threshold: number; unit: string };
  gemini: { threshold: number; unit: string };
}

/**
 * Staging table for requirements pending review.
 *
 * Each requirement is extracted from a regulation document,
 * validated against a shadow model, and tracked with per-requirement
 * consensus status for granular review.
 *
 * Lives in the public schema.
 */
@Entity({ tableName: 'staging_requirement', schema: 'public' })
export class StagingRequirement extends BaseEntity {
  /**
   * Parent staging regulation
   */
  @ManyToOne(() => StagingRegulation, { name: 'staging_regulation_id' })
  @Index()
  stagingRegulation!: StagingRegulation;

  /**
   * Requirement code (e.g., 'SVHC_SCREEN', 'LEAD_LIMIT')
   */
  @Property({ type: 'text' })
  code!: string;

  /**
   * Human-readable name
   */
  @Property({ type: 'text' })
  name!: string;

  /**
   * Description of the requirement
   */
  @Property({ type: 'text', nullable: true })
  description?: string;

  /**
   * Substance name (for SUBSTANCE_SCREEN type)
   */
  @Property({ type: 'text', nullable: true, name: 'substance_name' })
  substanceName?: string;

  /**
   * CAS number of the substance
   */
  @Property({ type: 'text', nullable: true, name: 'cas_number' })
  casNumber?: string;

  /**
   * EC number of the substance
   */
  @Property({ type: 'text', nullable: true, name: 'ec_number' })
  ecNumber?: string;

  /**
   * Comparison operator (LT, LTE, GT, GTE, EQ, PRESENT, ABSENT)
   */
  @Enum({ items: () => ComparisonOperator, nullable: true })
  operator?: ComparisonOperator;

  /**
   * Threshold value for comparison
   */
  @Property({ type: 'decimal', precision: 20, scale: 10, nullable: true, name: 'threshold_value' })
  thresholdValue?: number;

  /**
   * Unit of measurement (e.g., 'PERCENT_BY_WEIGHT', 'PPM')
   */
  @Property({ type: 'text', nullable: true })
  unit?: string;

  /**
   * Scope/applicability (e.g., ['Jewellery', 'Hair accessories'])
   */
  @Property({ type: 'jsonb', nullable: true })
  scope?: string[];

  /**
   * Legal reference (e.g., 'Entry 63, Paragraph 1')
   */
  @Property({ type: 'text', nullable: true, name: 'legal_reference' })
  legalReference?: string;

  /**
   * PDF coordinates for citation anchoring
   */
  @Property({ type: 'jsonb', nullable: true, name: 'pdf_coordinates' })
  pdfCoordinates?: { page: number; bbox: number[] };

  /**
   * Requirement type
   */
  @Enum({ items: () => RequirementType })
  type!: RequirementType;

  /**
   * Severity level
   */
  @Enum({ items: () => RequirementSeverity, default: RequirementSeverity.WARNING })
  severity: RequirementSeverity = RequirementSeverity.WARNING;

  /**
   * Claude's confidence score (0.0 - 1.0)
   */
  @Property({ type: 'decimal', precision: 5, scale: 4, nullable: true, name: 'confidence_score' })
  confidenceScore?: number;

  /**
   * Claude's Chain-of-Thought reasoning
   */
  @Property({ type: 'text', nullable: true })
  reasoning?: string;

  /**
   * Whether tenants can exempt this requirement
   */
  @Property({ type: 'boolean', default: true, name: 'allows_exemption' })
  allowsExemption: boolean = true;

  /**
   * Conditions under which exemption is allowed
   */
  @Property({ type: 'text', nullable: true, name: 'exemption_conditions' })
  exemptionConditions?: string;

  /**
   * Consensus status between Claude and Gemini
   */
  @Enum({ items: () => ConsensusStatus })
  @Index()
  consensusStatus!: ConsensusStatus;

  /**
   * Details when models disagree
   */
  @Property({ type: 'jsonb', nullable: true, name: 'conflict_details' })
  conflictDetails?: ConflictDetails;

  /**
   * Suggested category mappings from AI
   */
  @Property({ type: 'jsonb', nullable: true, name: 'suggested_categories' })
  suggestedCategories?: { path: string; confidence: number }[];

  /**
   * Whether this specific requirement is approved
   */
  @Property({ type: 'boolean', default: false, name: 'is_approved' })
  isApproved: boolean = false;

  /**
   * User who approved this requirement
   */
  @Property({ type: 'text', nullable: true, name: 'approved_by' })
  approvedBy?: string;

  /**
   * Timestamp when approved
   */
  @Property({ type: 'timestamptz', nullable: true, name: 'approved_at' })
  approvedAt?: Date;
}
