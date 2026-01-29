import { EntityManager } from '@mikro-orm/postgresql';
import { StagingRegulation } from '../entities/StagingRegulation.js';
import { StagingRequirement } from '../entities/StagingRequirement.js';
import { IngestionAuditLog } from '../entities/IngestionAuditLog.js';
import { Regulation } from '../entities/Regulation.js';
import { Requirement } from '../entities/Requirement.js';
import { Substance } from '../entities/Substance.js';
import { StagingStatus } from '../entities/enums/StagingStatus.js';
import { IngestionAction } from '../entities/enums/IngestionAction.js';
import { RegulationStatus } from '../entities/enums/RegulationStatus.js';

export interface PublishResult {
  regulationId: string;
  requirementCount: number;
  skippedCount: number; // Requirements not approved (for partial publish)
}

export interface PublishOptions {
  /** If true, throws if any requirements are unapproved. Default: false (partial publish allowed) */
  requireAll?: boolean;
}

/**
 * Service for publishing staging regulations to production tables.
 *
 * Features:
 * - CAS mapping: Links to existing Substance records in public.substance
 * - Partial publishing: Publishes approved requirements, leaves conflicts in staging
 */
export class PublishService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Maps a CAS number to an existing Substance record.
   * Returns the substance ID if found, undefined otherwise.
   */
  private async mapCasToSubstance(casNumber: string | undefined): Promise<string | undefined> {
    if (!casNumber) return undefined;

    const substance = await this.em.findOne(Substance, { casNumber });
    return substance?.id;
  }

  /**
   * Publishes a staging regulation to production.
   * Supports partial publishing - only approved requirements are published.
   *
   * @param stagingRegulationId - ID of the staging regulation to publish
   * @param publishedBy - User ID of the publisher
   * @param options - Optional settings for publishing behavior
   * @returns PublishResult with the new regulation ID and counts
   * @throws Error if no approved requirements exist
   * @throws Error if requireAll is true and unapproved requirements exist
   */
  async publish(
    stagingRegulationId: string,
    publishedBy: string,
    options?: PublishOptions
  ): Promise<PublishResult> {
    const staging = await this.em.findOneOrFail(
      StagingRegulation,
      { id: stagingRegulationId },
      { populate: ['requirements'] }
    );

    const allRequirements = staging.requirements.getItems() as StagingRequirement[];
    const approved = allRequirements.filter((r) => r.isApproved);
    const unapproved = allRequirements.filter((r) => !r.isApproved);

    // If requireAll is true and there are unapproved, reject
    if (options?.requireAll && unapproved.length > 0) {
      throw new Error(`Cannot publish: ${unapproved.length} requirements not approved`);
    }

    // Must have at least one approved requirement to publish
    if (approved.length === 0) {
      throw new Error('Cannot publish: No approved requirements');
    }

    // Create production regulation
    const regulation = new Regulation();
    regulation.code = staging.code;
    regulation.name = staging.name;
    regulation.description = `Imported from ${staging.sourceUrl}`;
    regulation.status = RegulationStatus.ACTIVE;
    regulation.version = staging.regulationMetadata?.version;
    regulation.effectiveDate = staging.regulationMetadata?.effectiveDate
      ? new Date(staging.regulationMetadata.effectiveDate)
      : undefined;
    regulation.sourceUrl = staging.sourceUrl;
    regulation.metadata = {
      jurisdiction: staging.regulationMetadata?.jurisdiction,
      type: staging.regulationMetadata?.type,
      officialJournalRef: staging.regulationMetadata?.officialJournalRef,
    };

    this.em.persist(regulation);
    await this.em.flush();

    // Create production requirements (approved only)
    let sortOrder = 0;
    for (const stagingReq of approved) {
      // Map CAS to existing Substance record
      const substanceId = await this.mapCasToSubstance(stagingReq.casNumber);

      const requirement = new Requirement();
      requirement.regulation = regulation;
      requirement.code = stagingReq.code;
      requirement.name = stagingReq.name;
      requirement.description = stagingReq.description ?? stagingReq.reasoning;
      requirement.type = stagingReq.type;
      requirement.severity = stagingReq.severity;
      requirement.substanceListId = substanceId ?? stagingReq.casNumber; // Use mapped ID or fallback to CAS
      requirement.handlerConfig = {
        operator: stagingReq.operator,
        threshold: stagingReq.thresholdValue,
        unit: stagingReq.unit,
      };
      requirement.legalReference = stagingReq.legalReference;
      requirement.allowTenantExemption = stagingReq.allowsExemption;
      requirement.sortOrder = sortOrder++;

      this.em.persist(requirement);
    }

    await this.em.flush();

    // Update staging status based on whether all were published
    staging.status = unapproved.length > 0 ? StagingStatus.PARTIALLY_APPROVED : StagingStatus.PUBLISHED;
    staging.publishedRegulationId = regulation.id;
    await this.em.flush();

    // Log the publish action
    const auditLog = new IngestionAuditLog();
    auditLog.stagingRegulation = staging;
    auditLog.action = IngestionAction.PUBLISHED;
    auditLog.actorId = publishedBy;
    auditLog.details = {
      productionRegulationId: regulation.id,
      publishedCount: approved.length,
      skippedCount: unapproved.length,
      skippedRequirementIds: unapproved.map((r) => r.id),
    };
    auditLog.timestamp = new Date();

    this.em.persist(auditLog);
    await this.em.flush();

    return {
      regulationId: regulation.id,
      requirementCount: approved.length,
      skippedCount: unapproved.length,
    };
  }
}
