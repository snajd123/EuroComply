import { Entity, Property, Unique, Index, Enum } from '@mikro-orm/core';
import { BaseEntity } from '@eurocomply/database';

export enum RegistrySourceName {
  ECHA_EC = 'ECHA_EC',
  ECHA_SVHC = 'ECHA_SVHC',
  ECHA_ANNEX_XVII = 'ECHA_ANNEX_XVII',
  ECHA_ANNEX_XIV = 'ECHA_ANNEX_XIV',
  ECHA_POP = 'ECHA_POP',
  ROHS = 'ROHS',
  PUBCHEM = 'PUBCHEM',
  TSCA = 'TSCA',
  PROP65 = 'PROP65',
  EPA_COMPTOX = 'EPA_COMPTOX',
  COSING = 'COSING',
  EFSA = 'EFSA',
}

/**
 * Tracks data sources for the substance registry.
 * Used to track version, sync date, and record counts for each source.
 */
@Entity({ tableName: 'registry_source', schema: 'public' })
export class RegistrySource extends BaseEntity {
  @Enum({ items: () => RegistrySourceName })
  @Unique()
  @Index()
  name!: RegistrySourceName;

  /** Version identifier, e.g., "2026-01" */
  @Property({ length: 50, nullable: true })
  version?: string;

  /** When this source was last synced */
  @Property({ type: 'timestamptz', name: 'last_synced_at', defaultRaw: 'NOW()' })
  lastSyncedAt: Date = new Date();

  /** Number of records from this source */
  @Property({ type: 'int', name: 'record_count', nullable: true })
  recordCount?: number;

  /** URL to the original data source */
  @Property({ type: 'text', name: 'source_url', nullable: true })
  sourceUrl?: string;
}
