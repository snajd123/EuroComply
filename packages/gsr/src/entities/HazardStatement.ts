import { Entity, PrimaryKey, Property, ManyToOne, Index } from '@mikro-orm/core';
import { HazardClass } from './HazardClass.js';

/**
 * CLP/GHS Hazard Statement (H-statement) with multi-language translations.
 *
 * H-statements are standardized phrases describing the nature and severity
 * of a hazard, as defined by CLP Regulation (EC) No 1272/2008 and GHS.
 *
 * Examples:
 * - H300: "Fatal if swallowed"
 * - H350: "May cause cancer"
 * - H350i: "May cause cancer by inhalation"
 * - H300+H310: "Fatal if swallowed or in contact with skin" (combined)
 * - EUH001: "Explosive when dry" (EU-specific supplemental)
 *
 * Uses `code` as the primary key since H-codes are standardized identifiers.
 *
 * Reference: CLP Regulation Annex III, ECHA guidance on labelling
 */
@Entity({ tableName: 'hazard_statement', schema: 'public' })
export class HazardStatement {
  /**
   * Standard H-code identifier.
   * Format: "H300", "H350", "H350i", "H300+H310", "EUH001"
   *
   * This is the primary key as H-codes are standardized.
   */
  @PrimaryKey({ length: 20 })
  code!: string;

  /**
   * Multi-language translations of the hazard statement text.
   * Keys are ISO 639-1 language codes, values are the translated text.
   *
   * Example:
   * {
   *   "en": "May cause cancer",
   *   "de": "Kann Krebs erzeugen",
   *   "fr": "Peut provoquer le cancer"
   * }
   */
  @Property({ type: 'jsonb' })
  translations!: Record<string, string>;

  /**
   * The primary hazard class this H-statement belongs to.
   * Optional because combined statements (H300+H310) or EUH statements
   * may not map cleanly to a single hazard class.
   *
   * Example: H350 -> Carcinogenicity (Carc.)
   */
  @ManyToOne(() => HazardClass, { nullable: true, name: 'primary_hazard_class_code' })
  @Index()
  primaryHazardClass?: HazardClass;
}
