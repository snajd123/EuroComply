import { Entity, Property, Unique, Enum, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { UnitSystem } from './enums/index.js';

@Entity({ tableName: 'unit_definition', schema: 'public' })
export class UnitDefinition extends BaseEntity {
  @Property({ type: 'text', length: 10 })
  @Unique()
  @Index()
  code!: string;  // UNECE Rec 20 code: "KGM", "GRM", "OZA"

  @Property({ type: 'text' })
  name!: string;  // "Kilogram"

  @Property({ type: 'text', length: 10 })
  symbol!: string;  // "kg"

  @Enum({ items: () => UnitSystem })
  system!: UnitSystem;  // MASS, LENGTH, VOLUME, etc.

  @Property({ type: 'decimal', precision: 20, scale: 10 })
  factor!: string;  // Conversion factor to base unit (stored as string for precision)

  @Property({ type: 'boolean', default: false, name: 'is_base' })
  isBase: boolean = false;  // Is this the base unit for its system?

  @Property({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean = true;  // Show in UI dropdowns?
}
