import {
  Entity,
  Property,
  ManyToOne,
  Index,
  Unique,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Category } from './Category.js';
import { Regulation } from './Regulation.js';

/**
 * Maps Categories to Regulations (M:N junction table).
 *
 * This entity tracks which regulations apply to which product categories.
 * For example, the "Electronics" category might be linked to ROHS, REACH, and WEEE regulations.
 *
 * Lives in the public schema as shared system data.
 */
@Entity({ tableName: 'category_regulation', schema: 'public' })
@Unique({ properties: ['category', 'regulation'] })
export class CategoryRegulation extends BaseEntity {
  /**
   * Reference to the category
   */
  @ManyToOne(() => Category, { name: 'category_id' })
  @Index()
  category!: Category;

  /**
   * Reference to the regulation
   */
  @ManyToOne(() => Regulation, { name: 'regulation_id' })
  @Index()
  regulation!: Regulation;

  /**
   * Timestamp when this mapping was created
   */
  @Property({ type: 'timestamptz', name: 'added_at' })
  addedAt: Date = new Date();

  /**
   * User or system that created this mapping
   */
  @Property({ type: 'text', nullable: true, name: 'added_by' })
  addedBy?: string;
}
