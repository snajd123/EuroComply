import { Entity, Property, ManyToOne, Enum, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Category } from './Category.js';
import { UnitDefinition } from './UnitDefinition.js';

export enum AttributeType {
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  BOOLEAN = 'BOOLEAN',
  DATE = 'DATE',
  ENUM = 'ENUM',
  URL = 'URL',
  JSON = 'JSON',
}

export enum RollupMethod {
  SUM = 'SUM',
  WEIGHTED_AVG = 'WEIGHTED_AVG',
  MAX = 'MAX',
  MIN = 'MIN',
  BOOLEAN_OR = 'BOOLEAN_OR',
  BOOLEAN_AND = 'BOOLEAN_AND',
  CONCAT = 'CONCAT',
  NONE = 'NONE',
}

export enum InheritanceRule {
  INHERIT = 'INHERIT',
  OVERRIDE = 'OVERRIDE',
  ADDITIVE = 'ADDITIVE',
}

@Entity({ tableName: 'attribute_template' })
export class AttributeTemplate extends BaseEntity {
  @Property({ type: 'text' })
  @Index()
  key!: string;

  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Enum({ items: () => AttributeType })
  type!: AttributeType;

  @ManyToOne(() => Category, { name: 'category_id' })
  category!: Category;

  @ManyToOne(() => UnitDefinition, { nullable: true, name: 'unit_id' })
  unit?: UnitDefinition;

  @Enum({ items: () => RollupMethod, name: 'rollup_method', default: RollupMethod.NONE })
  rollupMethod: RollupMethod = RollupMethod.NONE;

  @Enum({ items: () => InheritanceRule, name: 'inheritance_rule', default: InheritanceRule.INHERIT })
  inheritanceRule: InheritanceRule = InheritanceRule.INHERIT;

  @Property({ type: 'json', nullable: true, name: 'validation_rules' })
  validationRules?: Record<string, unknown>;

  @Property({ type: 'json', nullable: true, name: 'enum_values' })
  enumValues?: string[];

  @Property({ type: 'json', nullable: true, name: 'default_value' })
  defaultValue?: unknown;

  @Property({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean = true;

  @Property({ type: 'int', default: 0, name: 'sort_order' })
  sortOrder: number = 0;
}
