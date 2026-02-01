import { Entity, Property, ManyToOne, Index, Unique, type Rel } from '@mikro-orm/core';
import { BaseEntity, Substance } from '@eurocomply/database';
import { HazardClass } from './HazardClass.js';

/**
 * Operator for Specific Concentration Limit (SCL) logic.
 * CLP uses concentration limits to determine when a classification applies.
 */
export enum SclOperator {
  /** Greater than or equal (C >= value) */
  GTE = 'gte',
  /** Greater than (C > value) */
  GT = 'gt',
  /** Less than or equal (C <= value) */
  LTE = 'lte',
  /** Less than (C < value) */
  LT = 'lt',
  /** Between two values (value <= C <= valueTo) */
  BETWEEN = 'between',
}

/**
 * Specific Concentration Limit (SCL) logic structure.
 * Captures the concentration threshold logic from CLP Annex VI.
 *
 * Examples:
 * - "C >= 0.1%" → { operator: 'gte', value: 0.1, unit: 'PERCENT' }
 * - "0.01% <= C < 0.1%" → { operator: 'between', value: 0.01, valueTo: 0.1, unit: 'PERCENT' }
 */
export interface SclLogic {
  /** Comparison operator */
  operator: SclOperator;
  /** Threshold value (lower bound for 'between') */
  value: number;
  /** Upper bound for 'between' operator */
  valueTo?: number;
  /** Unit of measurement */
  unit: 'PERCENT' | 'PPM';
}

/**
 * Links a Substance to a CLP Hazard Class with full classification details.
 *
 * This is the core junction table for CLP harmonised classifications from Annex VI
 * of Regulation (EC) No 1272/2008. Each entry represents one classification for
 * a substance under a specific hazard class.
 *
 * A substance may have multiple entries:
 * - Different hazard classes (e.g., Carc. 1B + Skin Sens. 1)
 * - Different routes/organs for same hazard class (e.g., Acute Tox. 3 oral + dermal)
 * - Historical vs current classifications (tracked via validFrom/validTo)
 *
 * Key fields:
 * - category: The severity category ("1A", "1B", "2", etc.)
 * - hCode: The hazard statement code ("H350", "H350i", etc.)
 * - sclLogic: Specific Concentration Limits when different from generic cutoffs
 * - mFactor: Multiplication factor for aquatic hazards
 * - isMinimumClassification: When asterisk (*) indicates minimum classification
 * - atpSource: Which ATP version introduced this classification
 * - validFrom/validTo: For regulatory time-travel queries
 *
 * Reference: ECHA CLP Regulation guidance, Annex VI Table 3
 */
@Entity({ tableName: 'substance_hazard_classification', schema: 'public' })
@Unique({ properties: ['substance', 'hazardClass', 'category', 'hCode'] })
export class SubstanceHazardClassification extends BaseEntity {
  /**
   * The substance being classified.
   */
  @ManyToOne(() => Substance, { fieldName: 'substance_id' })
  @Index()
  substance!: Rel<Substance>;

  /**
   * The hazard class for this classification (e.g., Carc., Muta., Skin Sens.).
   */
  @ManyToOne(() => HazardClass, { fieldName: 'hazard_class_code' })
  @Index()
  hazardClass!: Rel<HazardClass>;

  /**
   * Hazard category within the class: "1A", "1B", "2", "3", "4".
   * May be null for hazard classes without categories or incomplete data.
   */
  @Property({ length: 10, nullable: true })
  category?: string;

  /**
   * Hazard statement code: "H350", "H350i", "H317", etc.
   * The trailing letter (e.g., "i" for inhalation) indicates route of exposure.
   */
  @Property({ length: 20, nullable: true, name: 'h_code' })
  hCode?: string;

  /**
   * Notes from Annex VI (e.g., "Note A", "Note 10").
   * Stored as array since multiple notes may apply.
   */
  @Property({ type: 'array', nullable: true })
  notes?: string[];

  /**
   * Specific Concentration Limit logic when different from generic cutoffs.
   * Stored as JSONB for flexible operator/value combinations.
   */
  @Property({ type: 'jsonb', nullable: true, name: 'scl_logic' })
  sclLogic?: SclLogic;

  /**
   * M-factor (multiplication factor) for aquatic hazards.
   * Used to adjust generic concentration limits for very toxic substances.
   * Common values: 1, 10, 100, 1000, 10000.
   */
  @Property({ nullable: true, name: 'm_factor' })
  mFactor?: number;

  /**
   * When true, indicates this is a minimum classification (marked with *).
   * Suppliers may need to apply stricter classification based on data.
   */
  @Property({ default: false, name: 'is_minimum_classification' })
  isMinimumClassification: boolean = false;

  /**
   * ATP (Adaptation to Technical Progress) version that introduced this.
   * Examples: "CLP00" (original), "ATP01", "ATP21".
   */
  @Property({ length: 20, name: 'atp_source' })
  atpSource!: string;

  /**
   * Date from which this classification is valid.
   * Corresponds to ATP entry into force date.
   */
  @Property({ name: 'valid_from' })
  @Index()
  validFrom!: Date;

  /**
   * Date until which this classification was valid.
   * Null means currently active. Set when superseded by newer ATP.
   */
  @Property({ nullable: true, name: 'valid_to' })
  @Index()
  validTo?: Date;
}
