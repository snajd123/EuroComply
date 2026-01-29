import {
  Entity,
  Property,
  Enum,
  ManyToOne,
  Index,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { StagingRegulation } from './StagingRegulation.js';
import { StagingRequirement } from './StagingRequirement.js';
import { IngestionAction } from './enums/IngestionAction.js';

/**
 * Audit log for regulation ingestion workflow.
 *
 * Tracks all actions taken on staging regulations and requirements
 * for legal defensibility and debugging.
 *
 * Lives in the public schema.
 */
@Entity({ tableName: 'ingestion_audit_log', schema: 'public' })
export class IngestionAuditLog extends BaseEntity {
  /**
   * Reference to the staging regulation
   */
  @ManyToOne(() => StagingRegulation, { name: 'staging_regulation_id' })
  @Index()
  stagingRegulation!: StagingRegulation;

  /**
   * Reference to specific requirement (optional)
   */
  @ManyToOne(() => StagingRequirement, { nullable: true, name: 'staging_requirement_id' })
  @Index()
  stagingRequirement?: StagingRequirement;

  /**
   * Type of action performed
   */
  @Enum({ items: () => IngestionAction })
  @Index()
  action!: IngestionAction;

  /**
   * User who performed the action (or 'system' for automated actions)
   */
  @Property({ type: 'text', nullable: true, name: 'actor_id' })
  actorId?: string;

  /**
   * Action-specific details (before/after state, model used, etc.)
   */
  @Property({ type: 'jsonb', nullable: true })
  details?: object;

  /**
   * Timestamp when action occurred
   */
  @Property({ type: 'timestamptz' })
  timestamp: Date = new Date();
}
