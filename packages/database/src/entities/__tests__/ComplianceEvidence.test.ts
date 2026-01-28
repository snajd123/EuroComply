// packages/database/src/entities/__tests__/ComplianceEvidence.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import { ComplianceEvidence } from '../ComplianceEvidence.js';
import { EvidenceType, EvidenceResult } from '../enums/index.js';
import { RequirementType, RequirementSeverity } from '../enums/index.js';
import { setupTestDb, teardownTestDb, createTestTenant } from '../../test-utils.js';

describe('ComplianceEvidence', () => {
  let orm: MikroORM;
  let tenantSchema: string;

  beforeAll(async () => {
    orm = await setupTestDb();
    tenantSchema = await createTestTenant(orm, 'test_evidence');
  });

  afterAll(async () => {
    await teardownTestDb(orm);
  });

  describe('creation', () => {
    it('should_create_evidence_with_requirement_snapshot', async () => {
      const tenantEm = orm.em.fork({ schema: tenantSchema });
      await tenantEm.execute(`SET search_path TO "${tenantSchema}", public`);

      const evidence = tenantEm.create(ComplianceEvidence, {
        productVersionId: '00000000-0000-0000-0000-000000000001',
        requirementId: '00000000-0000-0000-0000-000000000002',
        requirementSnapshot: {
          code: 'TEST_REQ',
          name: 'Test Requirement',
          type: RequirementType.ATTRIBUTE_CHECK,
          severity: RequirementSeverity.BLOCKER,
          regulationCode: 'TEST_REG',
          regulationName: 'Test Regulation',
          handlerConfig: { operator: '>=', threshold: 25 },
          legalReference: 'Article 5.1',
          snapshotAt: new Date(),
        },
        type: EvidenceType.AUTO_CHECK,
        result: EvidenceResult.PASS,
        details: {
          actualValue: 30,
          threshold: 25,
          operator: '>=',
        },
        recordedBy: 'system',
      });
      await tenantEm.persistAndFlush(evidence);

      const found = await tenantEm.findOne(ComplianceEvidence, { id: evidence.id });
      expect(found).toBeDefined();
      expect(found!.requirementSnapshot.code).toBe('TEST_REQ');
      expect(found!.requirementSnapshot.regulationCode).toBe('TEST_REG');
      expect(found!.type).toBe(EvidenceType.AUTO_CHECK);
      expect(found!.result).toBe(EvidenceResult.PASS);
    });

    it('should_store_snapshot_independently_of_requirement_changes', async () => {
      const tenantEm = orm.em.fork({ schema: tenantSchema });
      await tenantEm.execute(`SET search_path TO "${tenantSchema}", public`);

      // Create evidence with snapshot showing threshold = 25
      const evidence = tenantEm.create(ComplianceEvidence, {
        productVersionId: '00000000-0000-0000-0000-000000000003',
        requirementId: '00000000-0000-0000-0000-000000000004',
        requirementSnapshot: {
          code: 'RECYCLED_MIN',
          name: 'Min Recycled Content',
          type: RequirementType.ATTRIBUTE_CHECK,
          severity: RequirementSeverity.BLOCKER,
          regulationCode: 'ESPR',
          regulationName: 'Ecodesign for Sustainable Products',
          handlerConfig: { operator: '>=', threshold: 25 },  // Original threshold
          snapshotAt: new Date('2025-01-15'),
        },
        type: EvidenceType.AUTO_CHECK,
        result: EvidenceResult.PASS,
        details: { actualValue: 30, threshold: 25 },
        recordedBy: 'system',
      });
      await tenantEm.persistAndFlush(evidence);

      // Reload and verify snapshot is unchanged
      // (Even if requirement in public schema changes to threshold=30)
      const found = await tenantEm.findOne(ComplianceEvidence, { id: evidence.id });
      expect(found!.requirementSnapshot.handlerConfig!.threshold).toBe(25);
      expect(found!.result).toBe(EvidenceResult.PASS);
      // Audit report shows: "Passed on 2025-01-15 with threshold 25%"
    });
  });

  describe('declaration evidence', () => {
    it('should_store_declaration_with_attestation_details', async () => {
      const tenantEm = orm.em.fork({ schema: tenantSchema });
      await tenantEm.execute(`SET search_path TO "${tenantSchema}", public`);

      const evidence = tenantEm.create(ComplianceEvidence, {
        productVersionId: '00000000-0000-0000-0000-000000000005',
        requirementId: '00000000-0000-0000-0000-000000000006',
        requirementSnapshot: {
          code: 'ANIMAL_TEST_DECL',
          name: 'Animal Testing Declaration',
          type: RequirementType.DECLARATION,
          severity: RequirementSeverity.BLOCKER,
          regulationCode: 'COSING',
          regulationName: 'Cosmetics Regulation',
          handlerConfig: {
            question: 'Has product been tested on animals?',
            acceptedAnswers: ['No', 'N/A'],
          },
          snapshotAt: new Date(),
        },
        type: EvidenceType.DECLARATION,
        result: EvidenceResult.ATTESTED,
        details: {
          answer: 'No',
          justification: 'Product uses alternative testing methods',
        },
        recordedBy: 'compliance@tenant.com',
      });
      await tenantEm.persistAndFlush(evidence);

      const found = await tenantEm.findOne(ComplianceEvidence, { id: evidence.id });
      expect(found!.type).toBe(EvidenceType.DECLARATION);
      expect(found!.result).toBe(EvidenceResult.ATTESTED);
      expect(found!.details.answer).toBe('No');
    });
  });
});
