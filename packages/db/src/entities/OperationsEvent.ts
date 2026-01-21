import { Entity, PrimaryKey, Property, Index, Enum, ManyToOne } from '@mikro-orm/core';
import type { User } from './User.js';

/**
 * Operations event status for the Four-Eyes workflow.
 * CONTRIBUTOR creates → EDITOR verifies (seals)
 */
export enum EventStatus {
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  VERIFIED = 'VERIFIED',
}

/**
 * OperationsEvent represents an immutable fact in the forensic ledger.
 *
 * Architecture notes:
 * - Lives in TENANT schema (no organizationId needed - schema isolation handles it)
 * - Forms a hash chain with previousEventHash linking to prior events
 * - Organization.lastEventHash points to the chain head (in PUBLIC schema)
 * - Supports Corporate Envelope signing for verified events
 */
@Entity({ tableName: 'operations_events' })
export class OperationsEvent {
  @PrimaryKey({ type: 'varchar', length: 30 })
  id!: string;

  // Event type and payload
  @Property({ type: 'varchar', length: 50, fieldName: 'event_type' })
  @Index()
  eventType!: string;

  @Property({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  // Hash chain
  @Property({ type: 'varchar', length: 64, fieldName: 'event_hash' })
  @Index()
  eventHash!: string;

  @Property({ type: 'varchar', length: 64, fieldName: 'previous_event_hash', nullable: true })
  previousEventHash?: string;

  @Property({ type: 'int', fieldName: 'sequence_number' })
  @Index()
  sequenceNumber!: number;

  // Workflow status
  @Enum({ items: () => EventStatus, default: EventStatus.PENDING_VERIFICATION })
  @Index()
  status: EventStatus = EventStatus.PENDING_VERIFICATION;

  // Created by (CONTRIBUTOR)
  @ManyToOne('User', { fieldName: 'created_by' })
  createdBy!: User;

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  @Index()
  createdAt: Date = new Date();

  // Verified by (EDITOR) - The "Seal"
  @ManyToOne('User', { fieldName: 'verified_by', nullable: true })
  verifiedBy?: User;

  @Property({ type: 'timestamptz', fieldName: 'verified_at', nullable: true })
  verifiedAt?: Date;

  // User signature (EDITOR's DID signature)
  @Property({ type: 'varchar', length: 255, fieldName: 'user_signature_did', nullable: true })
  userSignatureDid?: string;

  @Property({ type: 'text', fieldName: 'user_signature_jws', nullable: true })
  userSignatureJws?: string;

  // Organization signature (Corporate Envelope)
  @Property({ type: 'varchar', length: 255, fieldName: 'org_signature_did', nullable: true })
  orgSignatureDid?: string;

  @Property({ type: 'text', fieldName: 'org_signature_jws', nullable: true })
  orgSignatureJws?: string;

  // Forensic context (embedded at sign-time for future verification)
  @Property({ type: 'jsonb', fieldName: 'forensic_context', nullable: true })
  forensicContext?: Record<string, unknown>;

  // Credential status for revocation support
  @Property({ type: 'int', fieldName: 'credential_status_index', nullable: true })
  credentialStatusIndex?: number;

  @Property({ type: 'jsonb', fieldName: 'timestamp_proof', nullable: true })
  timestampProof?: Record<string, unknown>;
}
