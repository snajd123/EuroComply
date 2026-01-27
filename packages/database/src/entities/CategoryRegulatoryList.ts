import { Entity, Property, Index, ManyToOne, Enum, Unique } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Category } from './Category.js';
import { RegulatoryList } from './RegulatoryList.js';
import { ListRequirement } from './enums/index.js';

/**
 * Links system Categories to RegulatoryLists with additional fields for scoping behavior.
 *
 * This entity defines which regulatory lists apply to which categories in the system taxonomy.
 * It supports:
 * - Priority ordering for same-depth categories
 * - Exclusion flags to remove inherited list requirements
 * - Compare value overrides for stricter thresholds
 * - Per-mapping tenant exemption control
 *
 * Lives in the public schema as shared system data.
 */
@Entity({ tableName: 'category_regulatory_list', schema: 'public' })
@Unique({ properties: ['category', 'regulatoryList'] })
export class CategoryRegulatoryList extends BaseEntity {
  /**
   * The category this mapping applies to
   */
  @ManyToOne(() => Category, { name: 'category_id' })
  @Index()
  category!: Category;

  /**
   * The regulatory list linked to this category
   */
  @ManyToOne(() => RegulatoryList, { name: 'regulatory_list_id' })
  @Index()
  regulatoryList!: RegulatoryList;

  /**
   * How this list requirement applies: MANDATORY, RECOMMENDED, or INFORMATIONAL
   */
  @Enum({ items: () => ListRequirement })
  requirement!: ListRequirement;

  /**
   * Priority for ordering when multiple lists are at the same depth.
   * Higher values = higher priority.
   */
  @Property({ type: 'smallint', default: 0 })
  priority: number = 0;

  /**
   * When true, this mapping excludes the list from the category
   * (overrides inherited list requirements from parent categories)
   */
  @Property({ type: 'boolean', default: false, name: 'is_exclusion' })
  isExclusion: boolean = false;

  /**
   * Optional override for the compare value threshold.
   * Use this to apply stricter limits than the list default (e.g., 0.0001 instead of 0.1).
   * Stored as decimal(5,4) to support precision up to 4 decimal places.
   */
  @Property({ type: 'decimal', precision: 5, scale: 4, nullable: true, name: 'compare_value_override' })
  compareValueOverride?: string;

  /**
   * Whether tenants can create exemptions for this specific category-list mapping.
   * This allows per-mapping control beyond the list-level allowTenantExemption setting.
   */
  @Property({ type: 'boolean', default: true, name: 'allow_tenant_exemption' })
  allowTenantExemption: boolean = true;
}
