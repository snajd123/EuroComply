import { Entity, Property, Unique, Index, ManyToOne, OneToMany, Collection, type Rel, Enum } from '@mikro-orm/core';
import { BaseEntity, Substance } from '@eurocomply/database';

export enum InheritanceType {
  EXPLICIT = 'EXPLICIT',
  DERIVED = 'DERIVED',
}

/**
 * Represents a chemical family/group (e.g., "Lead and its compounds").
 * Used for group-based regulatory restrictions.
 */
@Entity({ tableName: 'substance_group', schema: 'public' })
export class SubstanceGroup extends BaseEntity {
  /** Unique code, e.g., "LEAD_COMPOUNDS", "PFAS" */
  @Property({ length: 100 })
  @Unique()
  @Index()
  code!: string;

  /** Display name */
  @Property({ type: 'text' })
  name!: string;

  /** Optional description */
  @Property({ type: 'text', nullable: true })
  description?: string;

  /** Parent group for nested hierarchies (rare) */
  @ManyToOne(() => SubstanceGroup, { fieldName: 'parent_group_id', nullable: true })
  parentGroup?: Rel<SubstanceGroup>;

  /** Members of this group */
  @OneToMany(() => SubstanceGroupMember, (member) => member.group)
  members = new Collection<SubstanceGroupMember>(this);
}

/**
 * Junction table linking substances to groups.
 */
@Entity({ tableName: 'substance_group_member', schema: 'public' })
@Unique({ properties: ['group', 'substance'] })
export class SubstanceGroupMember extends BaseEntity {
  @ManyToOne(() => SubstanceGroup, { fieldName: 'group_id' })
  @Index()
  group!: Rel<SubstanceGroup>;

  @ManyToOne(() => Substance, { fieldName: 'substance_id' })
  @Index()
  substance!: Rel<Substance>;

  /** How this membership was determined */
  @Enum({ items: () => InheritanceType, name: 'inheritance_type' })
  inheritanceType!: InheritanceType;

  /** Optional notes about membership */
  @Property({ type: 'text', nullable: true })
  notes?: string;
}
