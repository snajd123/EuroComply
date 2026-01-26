import { Entity, Property, Unique, Index, Enum, ManyToOne, type Rel } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { AliasType } from './enums/index.js';
import { Substance } from './Substance.js';

@Entity({ tableName: 'substance_alias', schema: 'public' })
@Unique({ properties: ['substance', 'name'] })
export class SubstanceAlias extends BaseEntity {
  @ManyToOne(() => Substance, {
    fieldName: 'substance_id',
    index: true,
  })
  substance!: Rel<Substance>;

  @Property({ type: 'text' })
  @Index()
  name!: string;  // Alternative name

  @Enum({ items: () => AliasType })
  type!: AliasType;  // IUPAC, COMMON, TRADE, SYNONYM, INDEX_NAME

  @Property({ length: 10, default: 'en' })
  language: string = 'en';  // "en", "de", "fr"
}
