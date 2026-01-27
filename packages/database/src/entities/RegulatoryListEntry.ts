import { Entity, Property, Unique, Index, Enum, ManyToOne, type Rel } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { ComparisonOperator, Severity } from './enums/index.js';
import { RegulatoryList } from './RegulatoryList.js';
import { Substance } from './Substance.js';

/**
 * Represents an entry linking a substance to a regulatory list with compliance rules.
 *
 * Lives in the public schema as shared system data.
 * Contains forensic snapshots of substance data for historical traceability.
 */
@Entity({ tableName: 'regulatory_list_entry', schema: 'public' })
@Unique({ properties: ['list', 'substance'] })
export class RegulatoryListEntry extends BaseEntity {
  /**
   * The regulatory list this entry belongs to
   */
  @ManyToOne(() => RegulatoryList, {
    fieldName: 'list_id',
    index: true,
  })
  list!: Rel<RegulatoryList>;

  /**
   * The substance this entry refers to
   */
  @ManyToOne(() => Substance, {
    fieldName: 'substance_id',
    index: true,
  })
  substance!: Rel<Substance>;

  /**
   * Snapshot of CAS number at time of entry creation (forensic purposes)
   */
  @Property({ type: 'text', name: 'cas_number_snapshot' })
  casNumberSnapshot!: string;

  /**
   * Snapshot of substance name at time of entry creation (forensic purposes)
   */
  @Property({ type: 'text', name: 'substance_name_snapshot' })
  substanceNameSnapshot!: string;

  /**
   * Comparison operator for threshold checks (GT, GTE, LT, LTE, EQ, PRESENT, ABSENT)
   */
  @Enum({ items: () => ComparisonOperator })
  operator!: ComparisonOperator;

  /**
   * Threshold value for comparison (nullable for PRESENT/ABSENT operators)
   */
  @Property({ type: 'decimal', precision: 18, scale: 6, nullable: true, name: 'compare_value' })
  compareValue?: string;

  /**
   * Type of issue this entry represents (e.g., 'SVHC_CANDIDATE', 'RESTRICTED', 'BANNED')
   */
  @Property({ type: 'text', name: 'issue_type' })
  @Index()
  issueType!: string;

  /**
   * Severity level (BLOCKER, WARNING, INFO)
   */
  @Enum({ items: () => Severity })
  severity!: Severity;

  /**
   * Stoichiometric factor for concentration calculations (e.g., metal content in compounds)
   */
  @Property({ type: 'decimal', precision: 10, scale: 6, nullable: true, name: 'stoichiometric_factor' })
  stoichiometricFactor?: string;

  /**
   * Additional conditions as JSONB (e.g., category restrictions, regional rules)
   */
  @Property({ type: 'jsonb', nullable: true })
  conditions?: Record<string, unknown>;

  /**
   * Reference to the legal basis (e.g., 'REACH Regulation (EC) No 1907/2006, Article 57(a)')
   */
  @Property({ type: 'text', nullable: true, name: 'legal_reference' })
  legalReference?: string;

  /**
   * Additional notes about this entry
   */
  @Property({ type: 'text', nullable: true })
  notes?: string;
}
