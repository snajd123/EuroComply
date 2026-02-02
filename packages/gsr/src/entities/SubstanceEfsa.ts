import {
  Entity,
  Property,
  ManyToOne,
  Enum,
  Index,
} from '@mikro-orm/core';
import { BaseEntity, Substance } from '@eurocomply/database';
import type { Rel } from '@mikro-orm/core';

/**
 * EFSA re-evaluation outcomes for food additives.
 * Per Regulation (EU) No 257/2010, all food additives permitted
 * before 2009 must be re-evaluated by EFSA.
 */
export enum EfsaReEvaluationOutcome {
  /** Safe at current use levels */
  SAFE = 'SAFE',
  /** Safe with specific conditions or restrictions */
  SAFE_WITH_CONDITIONS = 'SAFE_WITH_CONDITIONS',
  /** Currently under scientific review */
  UNDER_REVIEW = 'UNDER_REVIEW',
  /** Not safe - should be removed from permitted list */
  NOT_SAFE = 'NOT_SAFE',
  /** Withdrawn from use or removed from permitted list */
  WITHDRAWN = 'WITHDRAWN',
}

/**
 * EFSA (European Food Safety Authority) persona for substances.
 *
 * Links to the golden record Substance entity and stores food additive-specific
 * data from EFSA assessments including:
 * - E-numbers for approved food additives
 * - Functional classes (Preservative, Emulsifier, Colour, etc.)
 * - ADI (Acceptable Daily Intake) values and units
 * - Approved uses and conditions
 * - Re-evaluation status and outcomes
 *
 * Reference: https://www.efsa.europa.eu/en/topics/topic/food-additives
 * Regulation: (EC) No 1333/2008 on food additives
 */
@Entity({ tableName: 'substance_efsa', schema: 'public' })
export class SubstanceEfsa extends BaseEntity {
  /** Link to the golden record substance */
  @ManyToOne(() => Substance, { fieldName: 'substance_id' })
  @Index()
  substance!: Rel<Substance>;

  /**
   * E-number code (e.g., E200, E330, E160a).
   * Not all EFSA-evaluated substances have E-numbers.
   */
  @Property({ type: 'varchar', length: 10, nullable: true, name: 'e_number' })
  @Index()
  eNumber?: string;

  /** EFSA question/opinion reference number */
  @Property({ type: 'varchar', length: 50, nullable: true, name: 'efsa_ref' })
  efsaRef?: string;

  /**
   * Functional class per Regulation (EC) No 1333/2008 Annex I.
   * Examples: PRESERVATIVE, COLOUR, SWEETENER, EMULSIFIER, ANTIOXIDANT, etc.
   */
  @Property({ type: 'varchar', length: 50, name: 'functional_class' })
  @Index()
  functionalClass!: string;

  /**
   * Acceptable Daily Intake value.
   * The amount of a substance that can be consumed daily over a lifetime
   * without appreciable health risk.
   */
  @Property({ type: 'decimal', precision: 10, scale: 4, nullable: true, name: 'adi_value' })
  adiValue?: number;

  /** Unit for ADI value (typically mg/kg bw/day) */
  @Property({ type: 'varchar', length: 20, nullable: true, name: 'adi_unit' })
  adiUnit?: string;

  /**
   * Additional notes about the ADI.
   * Examples: "Group ADI", "Not specified", "Acceptable", etc.
   */
  @Property({ type: 'text', nullable: true, name: 'adi_note' })
  adiNote?: string;

  /** Food categories where the additive is approved for use */
  @Property({ type: 'array', nullable: true, name: 'approved_uses' })
  approvedUses?: string[];

  /** Specific conditions or restrictions on use */
  @Property({ type: 'text', nullable: true })
  conditions?: string;

  /** Date of EFSA re-evaluation (per Regulation (EU) No 257/2010) */
  @Property({ type: 'date', nullable: true, name: 're_evaluation_date' })
  reEvaluationDate?: Date;

  /** Outcome of EFSA re-evaluation */
  @Enum({ items: () => EfsaReEvaluationOutcome, nullable: true, name: 're_evaluation_outcome' })
  reEvaluationOutcome?: EfsaReEvaluationOutcome;
}
