import { Entity, Property, Unique, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';

/**
 * Tracks seeded reference data versions for idempotent re-seeding.
 *
 * Used to determine if reference data (e.g., UNECE units, ECHA substances)
 * needs to be re-seeded based on version or checksum changes.
 */
@Entity({ tableName: 'seed_version', schema: 'public' })
export class SeedVersion extends BaseEntity {
  /**
   * Unique identifier for the dataset (e.g., 'unece-rec20', 'echa-svhc')
   */
  @Property({ length: 100 })
  @Unique()
  @Index()
  name!: string;

  /**
   * Version string of the data source (e.g., 'Rev17', '2024-01')
   */
  @Property({ length: 50 })
  version!: string;

  /**
   * SHA-256 checksum of source file for change detection.
   * Even if version string stays same, checksum change triggers re-seed.
   */
  @Property({ length: 100, nullable: true, name: 'source_checksum' })
  sourceChecksum?: string;

  /**
   * Timestamp of last successful seeding
   */
  @Property({ name: 'seeded_at' })
  seededAt!: Date;

  /**
   * Number of records seeded
   */
  @Property({ type: 'int', default: 0, name: 'record_count' })
  recordCount: number = 0;
}
