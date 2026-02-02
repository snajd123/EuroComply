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
 * Cosmetic restriction types per EU Cosmetics Regulation (EC) No 1223/2009.
 */
export enum CosmeticRestrictionType {
  /** Annex II - Prohibited substances */
  ANNEX_II = 'ANNEX_II',
  /** Annex III - Restricted substances (conditions apply) */
  ANNEX_III = 'ANNEX_III',
  /** Annex IV - Permitted colorants */
  ANNEX_IV = 'ANNEX_IV',
  /** Annex V - Permitted preservatives */
  ANNEX_V = 'ANNEX_V',
  /** Annex VI - Permitted UV filters */
  ANNEX_VI = 'ANNEX_VI',
}

/**
 * CosIng (Cosmetic Ingredients) persona for substances.
 *
 * Links to the golden record Substance entity and stores cosmetics-specific
 * data from the EU CosIng database including:
 * - INCI names (International Nomenclature of Cosmetic Ingredients)
 * - Cosmetic functions
 * - Restriction types (Annex II-VI)
 * - Concentration limits
 * - SCCS opinions
 *
 * Reference: https://ec.europa.eu/growth/tools-databases/cosing/
 */
@Entity({ tableName: 'substance_cosing', schema: 'public' })
export class SubstanceCosing extends BaseEntity {
  /** Link to the golden record substance */
  @ManyToOne(() => Substance, { fieldName: 'substance_id' })
  @Index()
  substance!: Rel<Substance>;

  /** CosIng reference number (unique identifier in CosIng database) */
  @Property({ type: 'varchar', length: 20 })
  @Index()
  cosingRef!: string;

  /** INCI name as registered in CosIng (original case) */
  @Property({ type: 'text' })
  inciName!: string;

  /** Normalized INCI name for fuzzy matching (lowercase) */
  @Property({ type: 'text', name: 'inci_name_normalized' })
  @Index()
  inciNameNormalized!: string;

  /** Cosmetic functions (e.g., HUMECTANT, EMULSIFIER, PRESERVATIVE) */
  @Property({ type: 'array', nullable: true })
  functions?: string[];

  /** EU Cosmetics Regulation annex classification */
  @Enum({ items: () => CosmeticRestrictionType, nullable: true, name: 'restriction_type' })
  @Index()
  restrictionType?: CosmeticRestrictionType;

  /** Human-readable restriction description */
  @Property({ type: 'text', nullable: true, name: 'restriction_text' })
  restrictionText?: string;

  /** Maximum allowed concentration */
  @Property({ type: 'decimal', precision: 10, scale: 4, nullable: true, name: 'max_concentration' })
  maxConcentration?: string;

  /** Unit for concentration (e.g., %, ppm) */
  @Property({ type: 'varchar', length: 20, nullable: true, name: 'concentration_unit' })
  concentrationUnit?: string;

  /** Additional restrictions/conditions as text */
  @Property({ type: 'text', nullable: true, name: 'other_restrictions' })
  otherRestrictions?: string;

  /** SCCS (Scientific Committee on Consumer Safety) opinions as JSON */
  @Property({ type: 'json', nullable: true, name: 'sccs_opinions' })
  sccsOpinions?: Record<string, unknown>;
}
