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
 * TSCA (Toxic Substances Control Act) inventory status.
 *
 * Substances on the TSCA Inventory can be either ACTIVE (currently manufactured
 * or imported) or INACTIVE (not manufactured or imported in recent reporting periods).
 *
 * @see https://www.epa.gov/tsca-inventory
 */
export enum TscaInventoryStatus {
  /** Substance is currently manufactured, imported, or processed in the US */
  ACTIVE = 'ACTIVE',
  /** Substance has not been manufactured, imported, or processed in recent years */
  INACTIVE = 'INACTIVE',
}

/**
 * TSCA (Toxic Substances Control Act) persona for substances.
 *
 * Links to the golden record Substance entity and stores US EPA TSCA-specific
 * data including:
 * - TSCA-specific CAS numbers (may differ from standard CAS)
 * - Inventory status (ACTIVE/INACTIVE per 2016 Lautenberg Chemical Safety Act)
 * - Section 5 status (new chemical notification requirements)
 * - Section 6 status (priority chemicals for risk evaluation)
 * - SNUR (Significant New Use Rule) applicability
 * - CDR (Chemical Data Reporting) requirements
 *
 * Reference: https://www.epa.gov/tsca-inventory
 * Regulation: 15 U.S.C. ch. 53 (Toxic Substances Control Act)
 */
@Entity({ tableName: 'substance_tsca', schema: 'public' })
export class SubstanceTsca extends BaseEntity {
  /** Link to the golden record substance */
  @ManyToOne(() => Substance, { fieldName: 'substance_id' })
  @Index()
  substance!: Rel<Substance>;

  /**
   * TSCA-specific CAS number.
   * May differ from the golden record CAS in some cases
   * due to TSCA inventory-specific identifiers.
   */
  @Property({ type: 'varchar', length: 20, name: 'tsca_cas' })
  @Index()
  tscaCas!: string;

  /**
   * TSCA Inventory status per the 2016 Lautenberg Chemical Safety Act.
   * ACTIVE substances are currently in commerce; INACTIVE substances
   * have not been manufactured/imported/processed in recent years.
   */
  @Enum({ items: () => TscaInventoryStatus, name: 'inventory_status' })
  @Index()
  inventoryStatus!: TscaInventoryStatus;

  /**
   * Section 5 (New Chemical) flag.
   * True if the substance requires premanufacture notification (PMN)
   * under TSCA Section 5 before manufacturing or importing.
   *
   * @default false
   */
  @Property({ type: 'boolean', default: false, name: 'is_section5' })
  isSection5: boolean = false;

  /**
   * Section 6 (Priority Chemical) flag.
   * True if EPA has designated this chemical for risk evaluation
   * and potential risk management under TSCA Section 6.
   *
   * @default false
   */
  @Property({ type: 'boolean', default: false, name: 'is_section6' })
  @Index()
  isSection6: boolean = false;

  /**
   * SNUR (Significant New Use Rule) flag.
   * True if EPA has issued a SNUR for this substance requiring
   * notification before significant new uses.
   *
   * @default false
   */
  @Property({ type: 'boolean', default: false, name: 'is_snur' })
  isSnur: boolean = false;

  /**
   * CDR (Chemical Data Reporting) flags.
   * JSON object containing CDR-specific requirements including:
   * - reportingRequired: Whether CDR reporting is mandatory
   * - lastReportingYear: Most recent CDR reporting year
   * - exemptions: Array of applicable exemptions
   *
   * @see https://www.epa.gov/chemical-data-reporting
   */
  @Property({ type: 'json', nullable: true, name: 'cdr_flags' })
  cdrFlags?: Record<string, unknown> | null;
}
