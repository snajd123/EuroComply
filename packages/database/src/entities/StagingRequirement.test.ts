import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { StagingRegulation } from './StagingRegulation.js';
import { StagingRequirement } from './StagingRequirement.js';
import { StagingStatus } from './enums/StagingStatus.js';
import { ConsensusStatus } from './enums/ConsensusStatus.js';
import { RequirementType } from './enums/RequirementType.js';
import { RequirementSeverity } from './enums/RequirementSeverity.js';
import { ComparisonOperator } from './enums/ComparisonOperator.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';

describe('StagingRequirement', () => {
  let orm: MikroORM;
  let em: EntityManager;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) return;
    orm = await setupTestDb();
    em = orm.em.fork();
  });

  afterAll(async () => {
    if (orm) await teardownTestDb();
  });

  describe('entity creation', () => {
    it('should_create_staging_requirement_with_consensus_status', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      // Create parent staging regulation
      const stagingReg = em.create(StagingRegulation, {
        code: 'TEST-REG-REQ-001',
        name: 'Test Regulation for Requirements',
        sourceUrl: 'https://eur-lex.europa.eu/test',
        sourceType: 'EUR_LEX',
        primaryPayload: {},
        status: StagingStatus.PENDING,
      });
      await em.persistAndFlush(stagingReg);

      // Create staging requirement
      const stagingReq = em.create(StagingRequirement, {
        stagingRegulation: stagingReg,
        code: 'LEAD_LIMIT',
        name: 'Lead Content Limit',
        substanceName: 'Lead',
        casNumber: '7439-92-1',
        operator: ComparisonOperator.LT,
        thresholdValue: 0.05,
        unit: 'PERCENT_BY_WEIGHT',
        scope: ['Jewellery', 'Hair accessories'],
        legalReference: 'Entry 63, Paragraph 1',
        type: RequirementType.SUBSTANCE_SCREEN,
        severity: RequirementSeverity.BLOCKER,
        confidenceScore: 0.97,
        reasoning: 'Applied 2024 amendment',
        consensusStatus: ConsensusStatus.MATCH,
      });
      await em.persistAndFlush(stagingReq);

      expect(stagingReq.id).toBeDefined();
      expect(stagingReq.consensusStatus).toBe(ConsensusStatus.MATCH);
      expect(stagingReq.thresholdValue).toBe(0.05);
      expect(stagingReq.scope).toContain('Jewellery');

      // Cleanup
      await em.removeAndFlush([stagingReq, stagingReg]);
    });

    it('should_track_conflict_details_when_models_disagree', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      const stagingReg = em.create(StagingRegulation, {
        code: 'TEST-REG-CONFLICT-001',
        name: 'Test Regulation Conflict',
        sourceUrl: 'https://eur-lex.europa.eu/test',
        sourceType: 'EUR_LEX',
        primaryPayload: {},
      });
      await em.persistAndFlush(stagingReg);

      const stagingReq = em.create(StagingRequirement, {
        stagingRegulation: stagingReg,
        code: 'CADMIUM_LIMIT',
        name: 'Cadmium Content Limit',
        substanceName: 'Cadmium',
        casNumber: '7440-43-9',
        operator: ComparisonOperator.LT,
        thresholdValue: 0.01,
        unit: 'PERCENT_BY_WEIGHT',
        scope: ['Plastics'],
        legalReference: 'Entry 23',
        type: RequirementType.SUBSTANCE_SCREEN,
        severity: RequirementSeverity.BLOCKER,
        confidenceScore: 0.85,
        consensusStatus: ConsensusStatus.CONFLICT,
        conflictDetails: {
          claude: { threshold: 0.01, unit: 'PERCENT_BY_WEIGHT' },
          gemini: { threshold: 0.1, unit: 'PERCENT_BY_WEIGHT' },
        },
      });
      await em.persistAndFlush(stagingReq);

      expect(stagingReq.consensusStatus).toBe(ConsensusStatus.CONFLICT);
      expect(stagingReq.conflictDetails?.claude.threshold).toBe(0.01);
      expect(stagingReq.conflictDetails?.gemini.threshold).toBe(0.1);

      await em.removeAndFlush([stagingReq, stagingReg]);
    });
  });
});
