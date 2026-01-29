import { EntityManager } from '@mikro-orm/postgresql';
import { StagingRegulation, type SourceType } from '../entities/StagingRegulation.js';
import { StagingRequirement, type ConflictDetails } from '../entities/StagingRequirement.js';
import { IngestionAuditLog } from '../entities/IngestionAuditLog.js';
import { ConsensusStatus } from '../entities/enums/ConsensusStatus.js';
import { RequirementType } from '../entities/enums/RequirementType.js';
import { RequirementSeverity } from '../entities/enums/RequirementSeverity.js';
import { ComparisonOperator } from '../entities/enums/ComparisonOperator.js';
import { StagingStatus } from '../entities/enums/StagingStatus.js';
import { IngestionAction } from '../entities/enums/IngestionAction.js';

/**
 * Input for creating a staging requirement.
 */
export interface CreateStagingRequirementInput {
  code: string;
  name: string;
  description?: string;
  substanceName?: string;
  casNumber?: string;
  ecNumber?: string;
  operator?: ComparisonOperator;
  thresholdValue?: number;
  unit?: string;
  scope?: string[];
  legalReference?: string;
  pdfCoordinates?: { page: number; bbox: number[] };
  type: RequirementType;
  severity?: RequirementSeverity;
  confidenceScore?: number;
  reasoning?: string;
  allowsExemption?: boolean;
  exemptionConditions?: string;
  consensusStatus: ConsensusStatus;
  conflictDetails?: ConflictDetails;
  suggestedCategories?: { path: string; confidence: number }[];
}

/**
 * Input for creating a staging regulation with requirements.
 */
export interface CreateStagingRegulationInput {
  code: string;
  name: string;
  sourceUrl: string;
  sourceType: SourceType;
  primaryPayload: object;
  shadowPayload?: object;
  regulationMetadata?: {
    jurisdiction?: string;
    type?: string;
    officialJournalRef?: string;
    effectiveDate?: string;
    version?: string;
  };
  actorId: string;
  requirements: CreateStagingRequirementInput[];
}

/**
 * Filter options for listing staging regulations.
 */
export interface ListStagingRegulationsFilter {
  status?: StagingStatus;
  sourceType?: SourceType;
}

/**
 * Service for managing staging regulations and requirements.
 *
 * Provides CRUD operations for the regulation ingestion workflow,
 * with full audit logging for legal defensibility.
 */
export class StagingService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Creates a staging regulation with its requirements.
   * Logs EXTRACTED action to audit log.
   */
  async createStagingRegulation(input: CreateStagingRegulationInput): Promise<StagingRegulation> {
    const {
      code,
      name,
      sourceUrl,
      sourceType,
      primaryPayload,
      shadowPayload,
      regulationMetadata,
      actorId,
      requirements,
    } = input;

    // Create staging regulation
    const regulation = new StagingRegulation();
    regulation.code = code;
    regulation.name = name;
    regulation.sourceUrl = sourceUrl;
    regulation.sourceType = sourceType;
    regulation.primaryPayload = primaryPayload;
    regulation.shadowPayload = shadowPayload;
    regulation.regulationMetadata = regulationMetadata;
    regulation.status = StagingStatus.PENDING;

    this.em.persist(regulation);

    // Create staging requirements
    for (const reqInput of requirements) {
      const requirement = new StagingRequirement();
      requirement.stagingRegulation = regulation;
      requirement.code = reqInput.code;
      requirement.name = reqInput.name;
      requirement.description = reqInput.description;
      requirement.substanceName = reqInput.substanceName;
      requirement.casNumber = reqInput.casNumber;
      requirement.ecNumber = reqInput.ecNumber;
      requirement.operator = reqInput.operator;
      requirement.thresholdValue = reqInput.thresholdValue;
      requirement.unit = reqInput.unit;
      requirement.scope = reqInput.scope;
      requirement.legalReference = reqInput.legalReference;
      requirement.pdfCoordinates = reqInput.pdfCoordinates;
      requirement.type = reqInput.type;
      requirement.severity = reqInput.severity ?? RequirementSeverity.WARNING;
      requirement.confidenceScore = reqInput.confidenceScore;
      requirement.reasoning = reqInput.reasoning;
      requirement.allowsExemption = reqInput.allowsExemption ?? true;
      requirement.exemptionConditions = reqInput.exemptionConditions;
      requirement.consensusStatus = reqInput.consensusStatus;
      requirement.conflictDetails = reqInput.conflictDetails;
      requirement.suggestedCategories = reqInput.suggestedCategories;
      requirement.isApproved = false;

      this.em.persist(requirement);
    }

    // Create audit log entry
    const auditLog = new IngestionAuditLog();
    auditLog.stagingRegulation = regulation;
    auditLog.action = IngestionAction.EXTRACTED;
    auditLog.actorId = actorId;
    auditLog.details = {
      sourceUrl,
      sourceType,
      requirementCount: requirements.length,
    };
    auditLog.timestamp = new Date();

    this.em.persist(auditLog);

    await this.em.flush();

    return regulation;
  }

  /**
   * Lists staging regulations with optional filters.
   */
  async listStagingRegulations(filter: ListStagingRegulationsFilter): Promise<StagingRegulation[]> {
    const where: Record<string, unknown> = {};

    if (filter.status) {
      where['status'] = filter.status;
    }

    if (filter.sourceType) {
      where['sourceType'] = filter.sourceType;
    }

    return this.em.find(StagingRegulation, where, {
      orderBy: { createdAt: 'DESC' },
    });
  }

  /**
   * Gets a staging regulation by ID with requirements populated.
   */
  async getStagingRegulation(id: string): Promise<StagingRegulation | null> {
    return this.em.findOne(
      StagingRegulation,
      { id },
      { populate: ['requirements'] }
    );
  }

  /**
   * Approves a requirement.
   * Sets isApproved=true and logs APPROVED action.
   */
  async approveRequirement(requirementId: string, approvedBy: string): Promise<StagingRequirement> {
    const requirement = await this.em.findOneOrFail(StagingRequirement, { id: requirementId }, {
      populate: ['stagingRegulation'],
    });

    requirement.isApproved = true;
    requirement.approvedBy = approvedBy;
    requirement.approvedAt = new Date();

    // Create audit log entry
    const auditLog = new IngestionAuditLog();
    auditLog.stagingRegulation = requirement.stagingRegulation;
    auditLog.stagingRequirement = requirement;
    auditLog.action = IngestionAction.APPROVED;
    auditLog.actorId = approvedBy;
    auditLog.timestamp = new Date();

    this.em.persist(auditLog);
    await this.em.flush();

    return requirement;
  }

  /**
   * Rejects a requirement.
   * Logs REJECTED action with reason.
   */
  async rejectRequirement(
    requirementId: string,
    rejectedBy: string,
    reason: string
  ): Promise<void> {
    const requirement = await this.em.findOneOrFail(StagingRequirement, { id: requirementId }, {
      populate: ['stagingRegulation'],
    });

    // Create audit log entry
    const auditLog = new IngestionAuditLog();
    auditLog.stagingRegulation = requirement.stagingRegulation;
    auditLog.stagingRequirement = requirement;
    auditLog.action = IngestionAction.REJECTED;
    auditLog.actorId = rejectedBy;
    auditLog.details = { reason };
    auditLog.timestamp = new Date();

    this.em.persist(auditLog);
    await this.em.flush();
  }

  /**
   * Updates a requirement's editable fields.
   * Logs EDITED action with before/after diff for legal defensibility.
   */
  async updateRequirement(
    requirementId: string,
    updates: Partial<Pick<StagingRequirement, 'thresholdValue' | 'unit' | 'operator' | 'scope'>>,
    editedBy: string
  ): Promise<StagingRequirement> {
    const requirement = await this.em.findOneOrFail(StagingRequirement, { id: requirementId }, {
      populate: ['stagingRegulation'],
    });

    // Capture before state for audit diff
    const before = {
      thresholdValue: requirement.thresholdValue,
      unit: requirement.unit,
      operator: requirement.operator,
      scope: requirement.scope,
    };

    // Apply updates
    if (updates.thresholdValue !== undefined) {
      requirement.thresholdValue = updates.thresholdValue;
    }
    if (updates.unit !== undefined) {
      requirement.unit = updates.unit;
    }
    if (updates.operator !== undefined) {
      requirement.operator = updates.operator;
    }
    if (updates.scope !== undefined) {
      requirement.scope = updates.scope;
    }

    // Create audit log entry with before/after diff
    const auditLog = new IngestionAuditLog();
    auditLog.stagingRegulation = requirement.stagingRegulation;
    auditLog.stagingRequirement = requirement;
    auditLog.action = IngestionAction.EDITED;
    auditLog.actorId = editedBy;
    auditLog.details = { before, after: updates };
    auditLog.timestamp = new Date();

    this.em.persist(auditLog);
    await this.em.flush();

    return requirement;
  }

  /**
   * Bulk approves all MATCH requirements for a regulation.
   * Returns count of approved requirements.
   */
  async bulkApproveMatches(regulationId: string, approvedBy: string): Promise<number> {
    const regulation = await this.em.findOneOrFail(StagingRegulation, { id: regulationId });

    const matchRequirements = await this.em.find(StagingRequirement, {
      stagingRegulation: regulation,
      consensusStatus: ConsensusStatus.MATCH,
      isApproved: false,
    });

    const now = new Date();

    for (const requirement of matchRequirements) {
      requirement.isApproved = true;
      requirement.approvedBy = approvedBy;
      requirement.approvedAt = now;

      // Create audit log entry for each
      const auditLog = new IngestionAuditLog();
      auditLog.stagingRegulation = regulation;
      auditLog.stagingRequirement = requirement;
      auditLog.action = IngestionAction.APPROVED;
      auditLog.actorId = approvedBy;
      auditLog.details = { bulk: true };
      auditLog.timestamp = now;

      this.em.persist(auditLog);
    }

    await this.em.flush();

    return matchRequirements.length;
  }
}
