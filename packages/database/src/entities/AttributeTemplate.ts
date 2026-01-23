import { Entity, Property, ManyToOne, Enum, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Category } from './Category.js';
import { UnitDefinition } from './UnitDefinition.js';
import { TargetType, UnitSystem } from './enums/index.js';

export enum AttributeType {
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  NUMBER_UNIT = 'NUMBER_UNIT',
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

  @Enum({ items: () => TargetType, name: 'target_type', default: TargetType.PRODUCT })
  targetType: TargetType = TargetType.PRODUCT;

  @ManyToOne(() => UnitDefinition, { nullable: true, name: 'unit_id' })
  unit?: UnitDefinition;

  // Soft link to public.unit_definitions (for cell scaling)
  @Property({ type: 'text', nullable: true, name: 'default_unit_id' })
  defaultUnitId?: string;

  @Enum({ items: () => UnitSystem, nullable: true, name: 'unit_system' })
  unitSystem?: UnitSystem;

  @Property({ type: 'text', nullable: true, name: 'weight_basis_key' })
  weightBasisKey?: string;  // For WEIGHTED_AVG: attribute key to weight by

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
