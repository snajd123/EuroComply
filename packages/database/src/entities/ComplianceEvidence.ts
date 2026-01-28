// packages/database/src/entities/ComplianceEvidence.ts
import {
  Entity,
  Property,
  Enum,
  Index,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { EvidenceType, EvidenceResult, RequirementType, RequirementSeverity } from './enums/index.js';

/**
 * Requirement snapshot captured at evidence recording time.
 * This ensures historical audit reports remain accurate even if
 * requirements change or are deleted in the future.
 */
export interface RequirementSnapshot {
  code: string;
  name: string;
  type: RequirementType;
  severity: RequirementSeverity;
  regulationCode: string;
  regulationName: string;
  handlerConfig?: Record<string, unknown>;
  legalReference?: string;
  snapshotAt: Date;
}

/**
 * ComplianceEvidence records the result of evaluating a requirement
 * against a product version.
 *
 * CRITICAL: Contains requirementSnapshot for historical integrity.
 * Even if the Requirement entity is modified or deleted, this evidence
 * record remains self-contained and auditable.
 *
 * Lives in tenant schema.
 */
@Entity({ tableName: 'compliance_evidence' })
export class ComplianceEvidence extends BaseEntity {
  @Property({ type: 'uuid', name: 'product_version_id' })
  @Index()
  productVersionId!: string;

  @Property({ type: 'uuid', name: 'requirement_id', nullable: true })
  @Index()
  requirementId?: string;  // May be deleted in future

  /**
   * SNAPSHOT: Captures requirement state at time of evidence recording.
   * Ensures audit report remains readable even if requirement changes/deleted.
   * This is the ONLY way to generate a legally defensible audit trail.
   */
  @Property({ type: 'jsonb', name: 'requirement_snapshot' })
  requirementSnapshot!: RequirementSnapshot;

  @Enum({ items: () => EvidenceType })
  type!: EvidenceType;

  @Enum({ items: () => EvidenceResult })
  result!: EvidenceResult;

  /**
   * Evidence details vary by type:
   * - AUTO_CHECK: { actualValue, threshold, operator, message }
   * - DECLARATION: { answer, justification }
   * - DOCUMENT: { documentType, fileName }
   */
  @Property({ type: 'jsonb' })
  details!: Record<string, unknown>;

  @Property({ type: 'text', nullable: true, name: 'document_key' })
  documentKey?: string;  // R2/S3 file key for uploaded evidence

  @Property({ type: 'text', name: 'recorded_by' })
  recordedBy!: string;

  @Property({ type: 'timestamptz', name: 'recorded_at' })
  recordedAt: Date = new Date();
}
