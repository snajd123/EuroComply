import { Entity, Property, Index, ManyToOne, Enum } from '@mikro-orm/core';
import { BaseEntity, Substance } from '@eurocomply/database';
import { UnresolvedStatus } from '../enums/UnresolvedStatus.js';
import { ResolutionType } from '../enums/ResolutionType.js';
import type { Rel } from '@mikro-orm/core';

export enum UnresolvedSource {
  EXTRACTION = 'EXTRACTION',
  CUSTOMER_UPLOAD = 'CUSTOMER_UPLOAD',
  BOM_IMPORT = 'BOM_IMPORT',
}

/**
 * Queue for substances that couldn't be resolved to master records.
 * Tracks raw input, occurrence count, and eventual resolution.
 */
@Entity({ tableName: 'unresolved_substance', schema: 'public' })
export class UnresolvedSubstance extends BaseEntity {
  /** What was extracted/submitted */
  @Property({ type: 'text', name: 'raw_name' })
  @Index()
  rawName!: string;

  /** Raw CAS number if provided (may be invalid/malformed) */
  @Property({ length: 50, name: 'raw_cas_number', nullable: true })
  @Index()
  rawCasNumber?: string;

  /** Where this came from */
  @Enum({ items: () => UnresolvedSource })
  source!: UnresolvedSource;

  /** How often this unresolved value appears */
  @Property({ type: 'int', name: 'occurrence_count', default: 1 })
  occurrenceCount: number = 1;

  /** Current status */
  @Enum({ items: () => UnresolvedStatus })
  @Index()
  status!: UnresolvedStatus;

  /** How it was resolved (if resolved) */
  @Enum({ items: () => ResolutionType, name: 'resolution_type', nullable: true })
  resolutionType?: ResolutionType;

  /** Linked substance if manually matched */
  @ManyToOne(() => Substance, { fieldName: 'resolved_substance_id', nullable: true })
  resolvedSubstance?: Rel<Substance>;

  /** When resolved */
  @Property({ type: 'timestamptz', name: 'resolved_at', nullable: true })
  resolvedAt?: Date;

  /** Who resolved it */
  @Property({ length: 255, name: 'resolved_by', nullable: true })
  resolvedBy?: string;
}
