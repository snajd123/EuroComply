import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';
import { StagingService } from './StagingService.js';
import { StagingRegulation } from '../entities/StagingRegulation.js';
import { StagingRequirement } from '../entities/StagingRequirement.js';
import { IngestionAuditLog } from '../entities/IngestionAuditLog.js';
import { ConsensusStatus } from '../entities/enums/ConsensusStatus.js';
import { RequirementType } from '../entities/enums/RequirementType.js';
import { RequirementSeverity } from '../entities/enums/RequirementSeverity.js';
import { ComparisonOperator } from '../entities/enums/ComparisonOperator.js';
import { StagingStatus } from '../entities/enums/StagingStatus.js';
import { IngestionAction } from '../entities/enums/IngestionAction.js';

describe('StagingService', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let dbAvailable = false;

  // Helper to clear staging tables
  const clearStagingTables = async (manager: EntityManager): Promise<void> => {
    try {
      await manager.execute('TRUNCATE TABLE "ingestion_audit_log" CASCADE');
      await manager.execute('TRUNCATE TABLE "staging_requirement" CASCADE');
      await manager.execute('TRUNCATE TABLE "staging_regulation" CASCADE');
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
    await clearStagingTables(em);
  });

  describe('createStagingRegulation', () => {
    it('should create a staging regulation with requirements and log EXTRACTED action', async () => {
      const service = new StagingService(em);

      const result = await service.createStagingRegulation({
        code: 'REACH_ANNEX_XVII',
        name: 'REACH Annex XVII Restrictions',
        sourceUrl: 'https://eur-lex.europa.eu/reach-annex-xvii',
        sourceType: 'EUR_LEX',
        primaryPayload: { extractedAt: new Date().toISOString() },
        shadowPayload: { validated: true },
        regulationMetadata: {
          jurisdiction: 'EU',
          type: 'RESTRICTION',
        },
        actorId: 'system',
        requirements: [
          {
            code: 'LEAD_LIMIT',
            name: 'Lead Content Limit',
            description: 'Lead content must not exceed 0.05% by weight',
            substanceName: 'Lead',
            casNumber: '7439-92-1',
            operator: ComparisonOperator.LTE,
            thresholdValue: 0.05,
            unit: 'PERCENT_BY_WEIGHT',
            scope: ['Jewellery', 'Hair accessories'],
            legalReference: 'Entry 63, Paragraph 1',
            type: RequirementType.SUBSTANCE_SCREEN,
            severity: RequirementSeverity.BLOCKER,
            confidenceScore: 0.98,
            reasoning: 'Clear threshold stated in Entry 63',
            allowsExemption: true,
            exemptionConditions: 'Professional use only',
            consensusStatus: ConsensusStatus.MATCH,
          },
          {
            code: 'CADMIUM_LIMIT',
            name: 'Cadmium Content Limit',
            type: RequirementType.SUBSTANCE_SCREEN,
            consensusStatus: ConsensusStatus.CONFLICT,
            conflictDetails: {
              claude: { threshold: 0.01, unit: 'PERCENT_BY_WEIGHT' },
              gemini: { threshold: 100, unit: 'PPM' },
            },
          },
        ],
      });

      // Verify regulation created
      expect(result.id).toBeDefined();
      expect(result.code).toBe('REACH_ANNEX_XVII');
      expect(result.name).toBe('REACH Annex XVII Restrictions');
      expect(result.sourceType).toBe('EUR_LEX');
      expect(result.status).toBe(StagingStatus.PENDING);

      // Verify requirements created
      const requirements = await em.find(StagingRequirement, { stagingRegulation: result });
      expect(requirements).toHaveLength(2);

      const leadRequirement = requirements.find((r) => r.code === 'LEAD_LIMIT');
      expect(leadRequirement).toBeDefined();
      expect(Number(leadRequirement!.thresholdValue)).toBe(0.05);
      expect(leadRequirement!.consensusStatus).toBe(ConsensusStatus.MATCH);
      expect(leadRequirement!.isApproved).toBe(false);

      const cadmiumRequirement = requirements.find((r) => r.code === 'CADMIUM_LIMIT');
      expect(cadmiumRequirement).toBeDefined();
      expect(cadmiumRequirement!.consensusStatus).toBe(ConsensusStatus.CONFLICT);
      expect(cadmiumRequirement!.conflictDetails).toEqual({
        claude: { threshold: 0.01, unit: 'PERCENT_BY_WEIGHT' },
        gemini: { threshold: 100, unit: 'PPM' },
      });

      // Verify audit log created
      const auditLogs = await em.find(IngestionAuditLog, { stagingRegulation: result });
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toBe(IngestionAction.EXTRACTED);
      expect(auditLogs[0].actorId).toBe('system');
    });
  });

  describe('listStagingRegulations', () => {
    it('should list regulations with optional status and sourceType filters', async () => {
      const service = new StagingService(em);

      // Create multiple staging regulations
      await service.createStagingRegulation({
        code: 'ROHS',
        name: 'RoHS Directive',
        sourceUrl: 'https://eur-lex.europa.eu/rohs',
        sourceType: 'EUR_LEX',
        primaryPayload: {},
        actorId: 'system',
        requirements: [],
      });

      await service.createStagingRegulation({
        code: 'ECHA_SVHC',
        name: 'ECHA SVHC List',
        sourceUrl: 'https://echa.europa.eu/svhc',
        sourceType: 'ECHA',
        primaryPayload: {},
        actorId: 'system',
        requirements: [],
      });

      // List all
      const allResults = await service.listStagingRegulations({});
      expect(allResults).toHaveLength(2);

      // Filter by sourceType
      const echaResults = await service.listStagingRegulations({ sourceType: 'ECHA' });
      expect(echaResults).toHaveLength(1);
      expect(echaResults[0].code).toBe('ECHA_SVHC');

      // Filter by status (all should be PENDING)
      const pendingResults = await service.listStagingRegulations({ status: StagingStatus.PENDING });
      expect(pendingResults).toHaveLength(2);

      // Filter by non-matching status
      const approvedResults = await service.listStagingRegulations({ status: StagingStatus.APPROVED });
      expect(approvedResults).toHaveLength(0);
    });
  });

  describe('getStagingRegulation', () => {
    it('should get a staging regulation with requirements populated', async () => {
      const service = new StagingService(em);

      const created = await service.createStagingRegulation({
        code: 'TEST_REG',
        name: 'Test Regulation',
        sourceUrl: 'https://example.com/test',
        sourceType: 'MANUAL',
        primaryPayload: { test: true },
        actorId: 'admin',
        requirements: [
          {
            code: 'REQ_1',
            name: 'Requirement 1',
            type: RequirementType.ATTRIBUTE_CHECK,
            consensusStatus: ConsensusStatus.MATCH,
          },
        ],
      });

      const fetched = await service.getStagingRegulation(created.id);

      expect(fetched).toBeDefined();
      expect(fetched!.code).toBe('TEST_REG');
      expect(fetched!.requirements.isInitialized()).toBe(true);
      expect(fetched!.requirements.length).toBe(1);
      expect(fetched!.requirements[0].code).toBe('REQ_1');
    });

    it('should return null for non-existent regulation', async () => {
      const service = new StagingService(em);

      const fetched = await service.getStagingRegulation('non-existent-id');
      expect(fetched).toBeNull();
    });
  });

  describe('approveRequirement', () => {
    it('should set isApproved=true and log APPROVED action', async () => {
      const service = new StagingService(em);

      const regulation = await service.createStagingRegulation({
        code: 'APPROVE_TEST',
        name: 'Approval Test',
        sourceUrl: 'https://example.com',
        sourceType: 'MANUAL',
        primaryPayload: {},
        actorId: 'system',
        requirements: [
          {
            code: 'REQ_TO_APPROVE',
            name: 'Requirement to Approve',
            type: RequirementType.SUBSTANCE_SCREEN,
            consensusStatus: ConsensusStatus.MATCH,
          },
        ],
      });

      const requirements = await em.find(StagingRequirement, { stagingRegulation: regulation });
      const requirement = requirements[0];

      expect(requirement.isApproved).toBe(false);

      const approved = await service.approveRequirement(requirement.id, 'admin_user');

      expect(approved.isApproved).toBe(true);
      expect(approved.approvedBy).toBe('admin_user');
      expect(approved.approvedAt).toBeInstanceOf(Date);

      // Verify audit log
      const auditLogs = await em.find(IngestionAuditLog, {
        stagingRequirement: requirement,
        action: IngestionAction.APPROVED,
      });
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].actorId).toBe('admin_user');
    });
  });

  describe('rejectRequirement', () => {
    it('should log REJECTED action with reason', async () => {
      const service = new StagingService(em);

      const regulation = await service.createStagingRegulation({
        code: 'REJECT_TEST',
        name: 'Rejection Test',
        sourceUrl: 'https://example.com',
        sourceType: 'MANUAL',
        primaryPayload: {},
        actorId: 'system',
        requirements: [
          {
            code: 'REQ_TO_REJECT',
            name: 'Requirement to Reject',
            type: RequirementType.ATTRIBUTE_CHECK,
            consensusStatus: ConsensusStatus.CONFLICT,
          },
        ],
      });

      const requirements = await em.find(StagingRequirement, { stagingRegulation: regulation });
      const requirement = requirements[0];

      await service.rejectRequirement(
        requirement.id,
        'admin_user',
        'Incorrect threshold extracted - should be 0.1% not 1%'
      );

      // Verify audit log
      const auditLogs = await em.find(IngestionAuditLog, {
        stagingRequirement: requirement,
        action: IngestionAction.REJECTED,
      });
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].actorId).toBe('admin_user');
      expect((auditLogs[0].details as { reason: string }).reason).toBe(
        'Incorrect threshold extracted - should be 0.1% not 1%'
      );
    });
  });

  describe('updateRequirement', () => {
    it('should update fields and log EDITED with before/after diff', async () => {
      const service = new StagingService(em);

      const regulation = await service.createStagingRegulation({
        code: 'EDIT_TEST',
        name: 'Edit Test',
        sourceUrl: 'https://example.com',
        sourceType: 'MANUAL',
        primaryPayload: {},
        actorId: 'system',
        requirements: [
          {
            code: 'REQ_TO_EDIT',
            name: 'Requirement to Edit',
            type: RequirementType.SUBSTANCE_SCREEN,
            consensusStatus: ConsensusStatus.CONFLICT,
            thresholdValue: 1.0,
            unit: 'PERCENT_BY_WEIGHT',
            operator: ComparisonOperator.LTE,
            scope: ['Electronics'],
          },
        ],
      });

      const requirements = await em.find(StagingRequirement, { stagingRegulation: regulation });
      const requirement = requirements[0];

      const updated = await service.updateRequirement(
        requirement.id,
        {
          thresholdValue: 0.1,
          unit: 'PERCENT_BY_WEIGHT',
          scope: ['Electronics', 'Toys'],
        },
        'admin_user'
      );

      expect(Number(updated.thresholdValue)).toBe(0.1);
      expect(updated.scope).toEqual(['Electronics', 'Toys']);

      // Verify audit log with before/after diff
      const auditLogs = await em.find(IngestionAuditLog, {
        stagingRequirement: requirement,
        action: IngestionAction.EDITED,
      });
      expect(auditLogs).toHaveLength(1);

      const details = auditLogs[0].details as {
        before: Record<string, unknown>;
        after: Record<string, unknown>;
      };
      expect(Number(details.before.thresholdValue)).toBe(1); // Original value
      expect(Number(details.after.thresholdValue)).toBe(0.1); // New value
      expect(details.before.scope).toEqual(['Electronics']);
      expect(details.after.scope).toEqual(['Electronics', 'Toys']);
    });
  });

  describe('bulkApproveMatches', () => {
    it('should approve all MATCH requirements for a regulation', async () => {
      const service = new StagingService(em);

      const regulation = await service.createStagingRegulation({
        code: 'BULK_TEST',
        name: 'Bulk Approve Test',
        sourceUrl: 'https://example.com',
        sourceType: 'MANUAL',
        primaryPayload: {},
        actorId: 'system',
        requirements: [
          {
            code: 'MATCH_REQ_1',
            name: 'Match Requirement 1',
            type: RequirementType.SUBSTANCE_SCREEN,
            consensusStatus: ConsensusStatus.MATCH,
          },
          {
            code: 'MATCH_REQ_2',
            name: 'Match Requirement 2',
            type: RequirementType.ATTRIBUTE_CHECK,
            consensusStatus: ConsensusStatus.MATCH,
          },
          {
            code: 'CONFLICT_REQ',
            name: 'Conflict Requirement',
            type: RequirementType.SUBSTANCE_SCREEN,
            consensusStatus: ConsensusStatus.CONFLICT,
          },
        ],
      });

      const approvedCount = await service.bulkApproveMatches(regulation.id, 'admin_user');

      expect(approvedCount).toBe(2);

      // Verify only MATCH requirements were approved
      const requirements = await em.find(StagingRequirement, { stagingRegulation: regulation });

      const matchReqs = requirements.filter((r) => r.consensusStatus === ConsensusStatus.MATCH);
      expect(matchReqs.every((r) => r.isApproved === true)).toBe(true);

      const conflictReq = requirements.find((r) => r.consensusStatus === ConsensusStatus.CONFLICT);
      expect(conflictReq!.isApproved).toBe(false);

      // Verify audit logs
      const auditLogs = await em.find(IngestionAuditLog, {
        stagingRegulation: regulation,
        action: IngestionAction.APPROVED,
      });
      expect(auditLogs).toHaveLength(2);
    });
  });
});
