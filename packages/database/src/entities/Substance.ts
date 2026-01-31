import { Entity, Property, Unique, Index, BeforeCreate, BeforeUpdate, Collection, OneToMany } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { isValidCasNumber } from '../utils/cas-validator.js';
import type { SubstanceAlias } from './SubstanceAlias.js';

@Entity({ tableName: 'substance', schema: 'public' })
export class Substance extends BaseEntity {
  @Property({ length: 20 })
  @Unique()
  @Index()
  casNumber!: string;  // "127-19-5" (validated with checksum)

  @Property({ length: 20, nullable: true, name: 'ec_number' })
  @Index()
  ecNumber?: string;  // "204-826-4" (EU EC/EINECS number)

  @Property({ type: 'text', name: 'primary_name' })
  @Index()
  primaryName!: string;  // IUPAC or most common name

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Property({ type: 'decimal', precision: 12, scale: 4, nullable: true, name: 'molecular_weight' })
  molecularWeight?: string;  // "87.1204"

  @Property({ length: 500, nullable: true, name: 'molecular_formula' })
  molecularFormula?: string;  // "C4H9NO"

  /** SMILES chemical structure string */
  @Property({ type: 'text', nullable: true })
  smiles?: string;

  /** InChIKey structure hash for matching */
  @Property({ length: 27, name: 'inchi_key', nullable: true })
  @Index()
  inchiKey?: string;

  /** IUPAC systematic name */
  @Property({ type: 'text', name: 'iupac_name', nullable: true })
  iupacName?: string;

  // Regulatory status from ECHA
  @Property({ type: 'boolean', default: false, name: 'is_svhc' })
  isSvhc: boolean = false;  // SVHC Candidate List

  @Property({ type: 'boolean', default: false, name: 'requires_authorization' })
  requiresAuthorization: boolean = false;  // Annex XIV

  @Property({ type: 'boolean', default: false, name: 'is_restricted' })
  isRestricted: boolean = false;  // Annex XVII

  @Property({ type: 'text', nullable: true, name: 'restriction_conditions' })
  restrictionConditions?: string;  // "Max 0.1% in consumer products"

  @Property({ type: 'date', nullable: true, name: 'sunset_date' })
  sunsetDate?: Date;  // Authorization deadline

  @Property({ type: 'date', nullable: true, name: 'latest_application_date' })
  latestApplicationDate?: Date;  // Last date to apply for authorization

  // Source tracking
  @Property({ type: 'text', nullable: true, name: 'echa_url' })
  echaUrl?: string;  // Link to ECHA substance page

  @Property({ nullable: true, name: 'source_version' })
  sourceVersion?: string;  // "SVHC-2024-01"

  @Property({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean = true;

  // Aliases relationship
  @OneToMany('SubstanceAlias', 'substance')
  aliases = new Collection<SubstanceAlias>(this);

  // Validation hook
  @BeforeCreate()
  @BeforeUpdate()
  validateCasNumber() {
    if (this.casNumber && !isValidCasNumber(this.casNumber)) {
      throw new Error(`Invalid CAS number: ${this.casNumber}`);
    }
  }
}
