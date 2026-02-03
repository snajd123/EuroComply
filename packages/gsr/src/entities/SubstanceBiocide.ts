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
 * Biocide approval status per EU BPR (Biocidal Products Regulation) 528/2012.
 *
 * Active substances in biocidal products must be evaluated and approved
 * before products containing them can be authorized.
 *
 * @see https://echa.europa.eu/information-on-chemicals/biocidal-active-substances
 */
export enum BiocideStatus {
  /** Approved for use in biocidal products for specified product types */
  APPROVED = 'APPROVED',
  /** Evaluation complete - not approved for use */
  NOT_APPROVED = 'NOT_APPROVED',
  /** Currently under evaluation by ECHA/Member States */
  UNDER_REVIEW = 'UNDER_REVIEW',
  /** Dossier submitted, awaiting evaluation */
  PENDING = 'PENDING',
}

/**
 * EU Biocides persona for substances.
 *
 * Links to the golden record Substance entity and stores biocide-specific
 * data from the EU Biocidal Products Regulation (BPR) 528/2012 including:
 * - EU Biocides reference codes
 * - Approval status for active substances
 * - Product types (PT1-PT22) for which the substance is approved
 * - Approval and expiry dates
 * - Conditions and restrictions on use
 * - Article 95 supplier requirements
 *
 * Product Types (PT) per BPR Annex V:
 * - PT1-PT5: Disinfectants and general biocidal products
 * - PT6-PT13: Preservatives
 * - PT14-PT20: Pest control
 * - PT21-PT22: Other biocidal products
 *
 * Reference: https://echa.europa.eu/regulations/biocidal-products-regulation
 * Regulation: (EU) No 528/2012 (Biocidal Products Regulation)
 */
@Entity({ tableName: 'substance_biocide', schema: 'public' })
export class SubstanceBiocide extends BaseEntity {
  /** Link to the golden record substance */
  @ManyToOne(() => Substance, { fieldName: 'substance_id' })
  @Index()
  substance!: Rel<Substance>;

  /**
   * EU Biocides reference code (e.g., AS-1234).
   * Unique identifier in the EU biocides database.
   */
  @Property({ type: 'varchar', length: 50, name: 'biocides_ref' })
  @Index()
  biocidesRef!: string;

  /**
   * Substance name as registered in EU Biocides database.
   * May differ from the golden record primary name.
   */
  @Property({ type: 'text', name: 'substance_name' })
  substanceName!: string;

  /**
   * Approval status per BPR Article 4.
   * Active substances must be approved before biocidal products
   * containing them can be authorized.
   */
  @Enum({ items: () => BiocideStatus })
  @Index()
  status!: BiocideStatus;

  /**
   * Product types (PT1-PT22) for which the substance is approved.
   * Per BPR Annex V, biocidal products are classified into 22 product types
   * across 4 main groups: disinfectants, preservatives, pest control, and other.
   *
   * Stored as an integer array. A GIN index should be created for efficient
   * array containment queries:
   * ```sql
   * CREATE INDEX "substance_biocide_product_types_gin_idx"
   *   ON "public"."substance_biocide"
   *   USING gin ("product_types");
   * ```
   */
  @Property({ type: 'integer[]', name: 'product_types' })
  productTypes!: number[];

  /**
   * Date when the active substance was approved (BPR Article 9).
   * Approval is typically for a period of up to 10 years.
   */
  @Property({ type: 'date', nullable: true, name: 'approval_date' })
  approvalDate?: Date;

  /**
   * Date when the approval expires (BPR Article 12).
   * Renewal applications must be submitted at least 550 days
   * before expiry.
   */
  @Property({ type: 'date', nullable: true, name: 'expiry_date' })
  @Index()
  expiryDate?: Date;

  /**
   * Specific conditions or restrictions on the approval.
   * Examples: concentration limits, application methods,
   * required PPE, environmental restrictions.
   */
  @Property({ type: 'text', nullable: true })
  conditions?: string;

  /**
   * Article 95 supplier requirements.
   * Per BPR Article 95, biocidal products can only contain
   * active substances from suppliers listed in Article 95.
   * This field documents specific supplier requirements.
   */
  @Property({ type: 'text', nullable: true, name: 'supplier_requirements' })
  supplierRequirements?: string;
}
