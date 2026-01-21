import { Entity, Property, Unique } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';

@Entity({ tableName: 'unit_definition' })
export class UnitDefinition extends BaseEntity {
  @Property({ type: 'text' })
  @Unique()
  symbol!: string;

  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text', name: 'unit_system' })
  unitSystem!: string; // e.g., 'SI', 'IMPERIAL', 'CUSTOM'

  @Property({ type: 'text', nullable: true, name: 'base_unit' })
  baseUnit?: string;

  @Property({ type: 'float', nullable: true, name: 'conversion_factor' })
  conversionFactor?: number;

  @Property({ type: 'text', nullable: true })
  description?: string;
}
