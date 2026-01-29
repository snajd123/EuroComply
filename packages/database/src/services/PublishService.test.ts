import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { PublishService } from './PublishService.js';
import { StagingService } from './StagingService.js';
import { StagingStatus } from '../entities/enums/StagingStatus.js';
import { ConsensusStatus } from '../entities/enums/ConsensusStatus.js';
import { RequirementType } from '../entities/enums/RequirementType.js';
import { RequirementSeverity } from '../entities/enums/RequirementSeverity.js';
import { Regulation } from '../entities/Regulation.js';
import { Requirement } from '../entities/Requirement.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';

describe('PublishService', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let dbAvailable = false;

  // Helper to clear tables
  const clearTables = async (manager: EntityManager): Promise<void> => {
    try {
      await manager.execute('DELETE FROM public.ingestion_audit_log');
      await manager.execute('DELETE FROM public.staging_requirement');
      await manager.execute('DELETE FROM public.staging_regulation');
      await manager.execute('DELETE FROM public.category_regulation');
      await manager.execute('DELETE FROM public.requirement');
      await manager.execute('DELETE FROM public.regulation');
    } catch {
      // Tables might not exist yet
    }
  };

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (dbAvailable) {
      orm = await setupTestDb();
    }
  });

  afterAll(async () => {
    if (dbAvailable && orm) {
      await teardownTestDb();
    }
  });

  beforeEach(async (context) => {
    if (!dbAvailable) {
      context.skip();
      return;
    }
    em = orm.em.fork();
    await clearTables(em);
  });

  describe('publish', () => {
    it('should_publish_staging_regulation_to_production', async () => {
      // Create staging regulation with approved requirements
      const stagingService = new StagingService(em);
      const regulation = await stagingService.createStagingRegulation({
        code: 'PUBLISH_TEST',
        name: 'Publish Test Regulation',
        sourceUrl: 'https://example.com',
        sourceType: 'EUR_LEX',
        primaryPayload: {},
        actorId: 'system',
        requirements: [
          {
            code: 'REQ_1',
            name: 'Requirement 1',
            type: RequirementType.SUBSTANCE_SCREEN,
            severity: RequirementSeverity.BLOCKER,
            confidenceScore: 0.99,
            consensusStatus: ConsensusStatus.MATCH,
          },
        ],
      });

      // Get the requirement and approve it
      const reqs = await em.find('StagingRequirement', { stagingRegulation: regulation });
      await stagingService.approveRequirement(reqs[0].id, 'test_admin');

      // Publish
      const publishService = new PublishService(em);
      const result = await publishService.publish(regulation.id, 'test_admin');

      expect(result.regulationId).toBeDefined();
      expect(result.requirementCount).toBe(1);

      // Verify production data
      const prodRegulation = await em.findOne(Regulation, { id: result.regulationId });
      expect(prodRegulation).toBeDefined();
      expect(prodRegulation?.code).toBe('PUBLISH_TEST');

      const prodRequirements = await em.find(Requirement, { regulation: result.regulationId });
      expect(prodRequirements).toHaveLength(1);
    });

    it('should_reject_publishing_with_unapproved_requirements', async () => {
      const stagingService = new StagingService(em);
      const regulation = await stagingService.createStagingRegulation({
        code: 'UNAPPROVED_TEST',
        name: 'Unapproved Test',
        sourceUrl: 'https://example.com',
        sourceType: 'EUR_LEX',
        primaryPayload: {},
        actorId: 'system',
        requirements: [
          {
            code: 'REQ_1',
            name: 'Requirement 1',
            type: RequirementType.DECLARATION,
            severity: RequirementSeverity.WARNING,
            confidenceScore: 0.95,
            consensusStatus: ConsensusStatus.CONFLICT, // Not approved
          },
        ],
      });

      const publishService = new PublishService(em);

      await expect(publishService.publish(regulation.id, 'test_admin')).rejects.toThrow(
        'Cannot publish: No approved requirements'
      );
    });

    it('should_support_partial_publishing_of_approved_requirements', async () => {
      const stagingService = new StagingService(em);
      const regulation = await stagingService.createStagingRegulation({
        code: 'PARTIAL_TEST',
        name: 'Partial Publish Test',
        sourceUrl: 'https://example.com',
        sourceType: 'EUR_LEX',
        primaryPayload: {},
        actorId: 'system',
        requirements: [
          {
            code: 'APPROVED_REQ',
            name: 'Approved Requirement',
            type: RequirementType.SUBSTANCE_SCREEN,
            severity: RequirementSeverity.BLOCKER,
            consensusStatus: ConsensusStatus.MATCH,
          },
          {
            code: 'CONFLICT_REQ',
            name: 'Conflict Requirement',
            type: RequirementType.ATTRIBUTE_CHECK,
            severity: RequirementSeverity.WARNING,
            consensusStatus: ConsensusStatus.CONFLICT, // Not approved
          },
        ],
      });

      // Only approve one requirement
      const reqs = await em.find('StagingRequirement', { stagingRegulation: regulation });
      const approvedReq = reqs.find((r: { code: string }) => r.code === 'APPROVED_REQ');
      await stagingService.approveRequirement(approvedReq!.id, 'test_admin');

      // Publish - should succeed with partial
      const publishService = new PublishService(em);
      const result = await publishService.publish(regulation.id, 'test_admin');

      expect(result.requirementCount).toBe(1);
      expect(result.skippedCount).toBe(1);

      // Verify staging status is PARTIALLY_APPROVED
      await em.refresh(regulation);
      expect(regulation.status).toBe(StagingStatus.PARTIALLY_APPROVED);
    });

    it('should_update_staging_status_to_published_when_all_approved', async () => {
      const stagingService = new StagingService(em);
      const regulation = await stagingService.createStagingRegulation({
        code: 'FULL_PUBLISH_TEST',
        name: 'Full Publish Test',
        sourceUrl: 'https://example.com',
        sourceType: 'EUR_LEX',
        primaryPayload: {},
        actorId: 'system',
        requirements: [
          {
            code: 'REQ_1',
            name: 'Requirement 1',
            type: RequirementType.SUBSTANCE_SCREEN,
            consensusStatus: ConsensusStatus.MATCH,
          },
        ],
      });

      // Approve the requirement
      const reqs = await em.find('StagingRequirement', { stagingRegulation: regulation });
      await stagingService.approveRequirement(reqs[0].id, 'test_admin');

      // Publish
      const publishService = new PublishService(em);
      await publishService.publish(regulation.id, 'test_admin');

      // Verify staging status is PUBLISHED
      await em.refresh(regulation);
      expect(regulation.status).toBe(StagingStatus.PUBLISHED);
    });

    it('should_throw_with_requireAll_option_when_unapproved_exist', async () => {
      const stagingService = new StagingService(em);
      const regulation = await stagingService.createStagingRegulation({
        code: 'REQUIRE_ALL_TEST',
        name: 'Require All Test',
        sourceUrl: 'https://example.com',
        sourceType: 'EUR_LEX',
        primaryPayload: {},
        actorId: 'system',
        requirements: [
          {
            code: 'APPROVED_REQ',
            name: 'Approved Requirement',
            type: RequirementType.SUBSTANCE_SCREEN,
            consensusStatus: ConsensusStatus.MATCH,
          },
          {
            code: 'UNAPPROVED_REQ',
            name: 'Unapproved Requirement',
            type: RequirementType.ATTRIBUTE_CHECK,
            consensusStatus: ConsensusStatus.CONFLICT,
          },
        ],
      });

      // Only approve one requirement
      const reqs = await em.find('StagingRequirement', { stagingRegulation: regulation });
      const approvedReq = reqs.find((r: { code: string }) => r.code === 'APPROVED_REQ');
      await stagingService.approveRequirement(approvedReq!.id, 'test_admin');

      // Publish with requireAll=true should fail
      const publishService = new PublishService(em);

      await expect(
        publishService.publish(regulation.id, 'test_admin', { requireAll: true })
      ).rejects.toThrow('Cannot publish: 1 requirements not approved');
    });
  });
});
