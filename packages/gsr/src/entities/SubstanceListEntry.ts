import { Entity, Property, Index, ManyToOne, Enum, Unique } from '@mikro-orm/core';
import { BaseEntity, Substance } from '@eurocomply/database';
import { RegulatoryList } from './RegulatoryList.js';
import { SubstanceGroup } from './SubstanceGroup.js';
import { ProductScope } from '../enums/ProductScope.js';
import { ThresholdUnit } from '../enums/ThresholdUnit.js';
import { ThresholdOperator } from '../enums/ThresholdOperator.js';
import { ListingStatus } from '../enums/ListingStatus.js';
import type { Rel } from '@mikro-orm/core';

/**
 * Links a substance (or group) to a regulatory list with specific conditions.
 * Same substance can appear in multiple lists with different thresholds/scopes.
 */
@Entity({ tableName: 'substance_list_entry', schema: 'public' })
@Unique({ properties: ['substance', 'regulatoryList', 'scopes'] })
export class SubstanceListEntry extends BaseEntity {
  /** Individual substance (nullable if using group) */
  @ManyToOne(() => Substance, { fieldName: 'substance_id', nullable: true })
  @Index()
  substance?: Rel<Substance>;

  /** Group reference for group-based restrictions (nullable if using substance) */
  @ManyToOne(() => SubstanceGroup, { fieldName: 'substance_group_id', nullable: true })
  @Index()
  substanceGroup?: Rel<SubstanceGroup>;

  /** Which regulatory list this entry belongs to */
  @ManyToOne(() => RegulatoryList, { fieldName: 'regulatory_list_id' })
  @Index()
  regulatoryList!: Rel<RegulatoryList>;

  /** Status on this list */
  @Enum({ items: () => ListingStatus })
  status!: ListingStatus;

  /** When added to the list */
  @Property({ type: 'date', name: 'listing_date', nullable: true })
  listingDate?: Date;

  /** When restriction becomes effective */
  @Property({ type: 'date', name: 'effective_date', nullable: true })
  effectiveDate?: Date;

  /** When authorization expires (for Annex XIV) */
  @Property({ type: 'date', name: 'sunset_date', nullable: true })
  sunsetDate?: Date;

  /** Concentration threshold value */
  @Property({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  threshold?: number;

  /** Unit for threshold */
  @Enum({ items: () => ThresholdUnit, name: 'threshold_unit', nullable: true })
  thresholdUnit?: ThresholdUnit;

  /** Comparison operator for threshold */
  @Enum({ items: () => ThresholdOperator, name: 'threshold_operator', nullable: true })
  thresholdOperator?: ThresholdOperator;

  /** Product scopes this restriction applies to */
  @Property({ type: 'array', name: 'scopes' })
  scopes!: ProductScope[];

  /** Original extracted scope text */
  @Property({ type: 'text', name: 'scope_raw', nullable: true })
  scopeRaw?: string;

  /** Structured conditions/exemptions (JSONB) */
  @Property({ type: 'json', nullable: true })
  conditions?: Record<string, unknown>;

  /** Reference to source (e.g., "Annex XVII Entry 63") */
  @Property({ type: 'text', name: 'source_reference', nullable: true })
  sourceReference?: string;

  /** URL to the legal document (e.g., EUR-Lex link) */
  @Property({ type: 'text', name: 'source_url', nullable: true })
  sourceUrl?: string;
}
