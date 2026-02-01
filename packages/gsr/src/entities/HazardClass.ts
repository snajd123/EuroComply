import { Entity, PrimaryKey, Property, Enum, Index } from '@mikro-orm/core';

/**
 * CLP/GHS hazard type classification.
 */
export enum HazardType {
  /** Physical hazards: explosives, flammables, oxidisers, gases, etc. */
  PHYSICAL = 'PHYSICAL',
  /** Health hazards: acute toxicity, skin/eye damage, CMR, STOT, etc. */
  HEALTH = 'HEALTH',
  /** Environmental hazards: aquatic toxicity, ozone layer depletion */
  ENVIRONMENTAL = 'ENVIRONMENTAL',
}

/**
 * CLP signal word indicating hazard severity.
 */
export enum SignalWord {
  /** Indicates more severe hazards */
  DANGER = 'DANGER',
  /** Indicates less severe hazards */
  WARNING = 'WARNING',
}

/**
 * CLP/GHS Hazard Class - a type of hazard per CLP Regulation (EC) No 1272/2008.
 *
 * Each hazard class represents a category of hazard (e.g., "Carcinogenicity",
 * "Flammable Liquids") with its associated pictogram and signal word.
 *
 * Uses `code` as the primary key since hazard classes are standardized
 * abbreviations defined by the CLP Regulation.
 *
 * Reference: ECHA CLP Regulation guidance, Annex I
 */
@Entity({ tableName: 'hazard_class', schema: 'public' })
export class HazardClass {
  /**
   * Standard CLP abbreviation, e.g., "Carc.", "Muta.", "Flam. Liq.", "Acute Tox."
   * This is the primary key as hazard class codes are standardized.
   */
  @PrimaryKey({ length: 50 })
  code!: string;

  /**
   * Full name of the hazard class, e.g., "Carcinogenicity", "Flammable Liquids"
   */
  @Property({ length: 100, name: 'full_name' })
  fullName!: string;

  /**
   * Type of hazard: PHYSICAL, HEALTH, or ENVIRONMENTAL
   */
  @Enum(() => HazardType)
  @Index()
  @Property({ name: 'hazard_type' })
  hazardType!: HazardType;

  /**
   * GHS pictogram code, e.g., "GHS01" (exploding bomb), "GHS08" (health hazard)
   * Null for hazard classes without pictograms (e.g., some gases under pressure categories)
   */
  @Property({ length: 10, nullable: true })
  pictogram?: string;

  /**
   * Signal word: "DANGER" (severe) or "WARNING" (less severe)
   * Null for hazard classes where no signal word is assigned.
   */
  @Enum({ items: () => SignalWord, nullable: true })
  @Property({ name: 'signal_word', nullable: true })
  signalWord?: SignalWord;

  /**
   * Quick flag indicating if this is a CMR hazard class:
   * - Carcinogenicity (Carc.)
   * - Germ Cell Mutagenicity (Muta.)
   * - Reproductive Toxicity (Repr.)
   *
   * Useful for efficient filtering in substance screening operations.
   */
  @Property({ name: 'is_cmr' })
  @Index()
  isCmr!: boolean;
}
