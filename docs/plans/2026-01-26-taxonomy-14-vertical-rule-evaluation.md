# Taxonomy Plan 14: Vertical Rule Evaluation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend RuleTemplate validationLogic schema and PreFlightAuditService to support data-driven vertical compliance checks using RegulatoryLists.

**Architecture:** Add new validationLogic types (`regulatory_list_check`, `aggregate_metric_threshold`) to RuleTemplate. Create evaluator services that cross-reference rolled-up substances against RegulatoryListEntries. Enrich AuditFinding with traceability and legal references.

**Tech Stack:** MikroORM, PostgreSQL, TypeScript, Decimal.js

**Prerequisites:**
- Plan 8 (Substance Rollup)
- Plan 9 (Raw Material Rollup)
- Plan 10 (Regulatory List Registry)
- Plan 11 (Category-List Scoping)

**Reference:** See `docs/plans/2026-01-26-regulatory-vertical-system-design.md` Sections 2, 4, 6

---

## Task 1: Extend ValidationLogic Types

**Files:**
- Create: `packages/database/src/types/validation-logic.ts`
- Test: `packages/database/src/types/validation-logic.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/types/validation-logic.test.ts
import { describe, it, expect } from 'vitest';
import {
  ValidationLogic,
  RegulatoryListCheckConfig,
  AggregateMetricThresholdConfig,
  isRegulatoryListCheck,
  isAggregateMetricThreshold,
} from './validation-logic.js';

describe('ValidationLogic Types', () => {
  describe('RegulatoryListCheck', () => {
    it('should validate a regulatory_list_check config', () => {
      const logic: ValidationLogic = {
        type: 'regulatory_list_check',
        config: {
          listCodes: ['COSING_ANNEX_II'],
          checkType: 'PROHIBITED',
          scope: 'ARTICLE',
        },
      };

      expect(isRegulatoryListCheck(logic)).toBe(true);
      const config = logic.config as RegulatoryListCheckConfig;
      expect(config.listCodes).toEqual(['COSING_ANNEX_II']);
      expect(config.scope).toBe('ARTICLE');
    });

    it('should support null listCodes for category inheritance', () => {
      const logic: ValidationLogic = {
        type: 'regulatory_list_check',
        config: {
          listCodes: null,
          checkType: 'THRESHOLD',
          scope: 'HOMOGENEOUS_MATERIAL',
          thresholdOverridePct: '0.01',
        },
      };

      expect(isRegulatoryListCheck(logic)).toBe(true);
      const config = logic.config as RegulatoryListCheckConfig;
      expect(config.listCodes).toBeNull();
    });

    it('should support conditionKey for restricted_with_conditions', () => {
      const logic: ValidationLogic = {
        type: 'regulatory_list_check',
        config: {
          listCodes: ['COSING_ANNEX_III'],
          checkType: 'RESTRICTED_WITH_CONDITIONS',
          scope: 'ARTICLE',
          conditionKey: 'application_area',
        },
      };

      const config = logic.config as RegulatoryListCheckConfig;
      expect(config.conditionKey).toBe('application_area');
    });
  });

  describe('AggregateMetricThreshold', () => {
    it('should validate an aggregate_metric_threshold config', () => {
      const logic: ValidationLogic = {
        type: 'aggregate_metric_threshold',
        config: {
          metric: 'weightedSupplyRisk',
          operator: 'GREATER_THAN',
          threshold: 4.0,
          message: 'Supply chain risk exceeds limit',
        },
      };

      expect(isAggregateMetricThreshold(logic)).toBe(true);
      const config = logic.config as AggregateMetricThresholdConfig;
      expect(config.metric).toBe('weightedSupplyRisk');
      expect(config.threshold).toBe(4.0);
    });

    it('should support totalStrategicContentPct metric', () => {
      const logic: ValidationLogic = {
        type: 'aggregate_metric_threshold',
        config: {
          metric: 'totalStrategicContentPct',
          operator: 'GREATER_THAN',
          threshold: 5.0,
          message: 'Strategic material content exceeds 5%',
        },
      };

      const config = logic.config as AggregateMetricThresholdConfig;
      expect(config.metric).toBe('totalStrategicContentPct');
    });
  });

  describe('Type Guards', () => {
    it('should correctly identify non-matching types', () => {
      const required: ValidationLogic = { type: 'required', config: {} };
      expect(isRegulatoryListCheck(required)).toBe(false);
      expect(isAggregateMetricThreshold(required)).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test validation-logic.test.ts
```

Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// packages/database/src/types/validation-logic.ts

// ─────────────────────────────────────────────────────────────
// Existing Types (unchanged)
// ─────────────────────────────────────────────────────────────

export interface RequiredConfig {
  message?: string;
}

export interface PatternConfig {
  pattern: string;
  flags?: string;
  message?: string;
}

export interface RangeConfig {
  min?: number;
  max?: number;
  message?: string;
}

export interface CustomConfig {
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────
// New Types for Vertical Compliance
// ─────────────────────────────────────────────────────────────

/**
 * Configuration for regulatory list compliance checks.
 * Used with type: 'regulatory_list_check'
 */
export interface RegulatoryListCheckConfig {
  /**
   * Explicit list codes to check against.
   * If null, inherits from CategoryRegulatoryList based on product category.
   */
  listCodes: string[] | null;

  /**
   * Type of check to perform.
   */
  checkType: 'PROHIBITED' | 'THRESHOLD' | 'RESTRICTED_WITH_CONDITIONS';

  /**
   * Evaluation scope.
   * ARTICLE: Check rolled-up concentration (whole product) - used by REACH
   * HOMOGENEOUS_MATERIAL: Check each material individually - used by RoHS
   */
  scope: 'ARTICLE' | 'HOMOGENEOUS_MATERIAL';

  /**
   * Override the threshold from RegulatoryListEntry.
   * If null, uses the threshold defined in the list entry.
   */
  thresholdOverridePct?: string | null;

  /**
   * For RESTRICTED_WITH_CONDITIONS: key to check in entry.conditions
   */
  conditionKey?: string;
}

/**
 * Configuration for aggregate metric threshold checks.
 * Used with type: 'aggregate_metric_threshold'
 */
export interface AggregateMetricThresholdConfig {
  /**
   * Metric name from rollup service output.
   */
  metric: 'weightedSupplyRisk' | 'totalStrategicContentPct' | string;

  /**
   * Comparison operator.
   */
  operator: 'GREATER_THAN' | 'LESS_THAN' | 'EQUALS';

  /**
   * Threshold value for comparison.
   */
  threshold: number;

  /**
   * Human-readable message for violation.
   */
  message: string;
}

// ─────────────────────────────────────────────────────────────
// Union Type
// ─────────────────────────────────────────────────────────────

export type ValidationLogicType =
  | 'required'
  | 'pattern'
  | 'range'
  | 'custom'
  | 'substance_threshold'      // Legacy - Plan 8
  | 'substance_presence'       // Legacy - Plan 8
  | 'substance_authorization'  // Legacy - Plan 8
  | 'regulatory_list_check'    // New - data-driven
  | 'aggregate_metric_threshold';  // New - rollup metrics

export type ValidationLogicConfig =
  | RequiredConfig
  | PatternConfig
  | RangeConfig
  | CustomConfig
  | RegulatoryListCheckConfig
  | AggregateMetricThresholdConfig;

export interface ValidationLogic {
  type: ValidationLogicType;
  config: ValidationLogicConfig;
}

// ─────────────────────────────────────────────────────────────
// Type Guards
// ─────────────────────────────────────────────────────────────

export function isRegulatoryListCheck(
  logic: ValidationLogic
): logic is ValidationLogic & { config: RegulatoryListCheckConfig } {
  return logic.type === 'regulatory_list_check';
}

export function isAggregateMetricThreshold(
  logic: ValidationLogic
): logic is ValidationLogic & { config: AggregateMetricThresholdConfig } {
  return logic.type === 'aggregate_metric_threshold';
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test validation-logic.test.ts
```

Expected: PASS

**Step 5: Export and commit**

```typescript
// packages/database/src/types/index.ts
export * from './validation-logic.js';
```

```bash
git add packages/database/src/types/validation-logic.ts packages/database/src/types/validation-logic.test.ts packages/database/src/types/index.ts
git commit -m "feat(database): add ValidationLogic types for regulatory_list_check and aggregate_metric_threshold"
```

---

## Task 2: Create SubstanceFinding Interface

**Files:**
- Create: `packages/database/src/types/audit-finding.ts`
- Test: `packages/database/src/types/audit-finding.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/types/audit-finding.test.ts
import { describe, it, expect } from 'vitest';
import {
  SubstanceFinding,
  MetricFinding,
  IssueType,
  isSubstanceFinding,
  isMetricFinding,
} from './audit-finding.js';

describe('AuditFinding Types', () => {
  describe('SubstanceFinding', () => {
    it('should create a valid substance finding', () => {
      const finding: SubstanceFinding = {
        ruleCode: 'COSING_PROHIBITION_CHECK',
        ruleName: 'CosIng Prohibited Substances',
        severity: 'BLOCKER',
        status: 'FAILED',
        effectiveMode: 'ENFORCING',
        issueType: 'PROHIBITED_SUBSTANCE',
        substance: {
          casNumber: '50-00-0',
          primaryName: 'Formaldehyde',
          effectiveConcentrationPct: '0.15',
          scope: 'ARTICLE',
        },
        evaluationContext: {
          appliedList: {
            code: 'COSING_ANNEX_II',
            name: 'CosIng Annex II',
            version: '2024-06',
            sourceUrl: 'https://ec.europa.eu/cosing/',
          },
          legalReference: 'Entry 1577',
          categoryTrigger: 'products.cosmetics.skincare',
          reason: 'Formaldehyde is prohibited in cosmetics',
          traceability: [
            {
              materialName: 'Preservative Blend',
              materialVersionId: 'abc-123',
              supplier: 'Acme Chemicals',
              concentrationInMaterial: '2.5',
              contributionToProduct: '0.15',
            },
          ],
        },
        remediation: {
          suggestion: 'Remove formaldehyde or use approved alternative',
          alternativeCas: ['107-22-2'],
        },
      };

      expect(isSubstanceFinding(finding)).toBe(true);
      expect(finding.issueType).toBe('PROHIBITED_SUBSTANCE');
      expect(finding.evaluationContext.traceability).toHaveLength(1);
    });
  });

  describe('MetricFinding', () => {
    it('should create a valid metric finding', () => {
      const finding: MetricFinding = {
        ruleCode: 'CRMA_RISK_LIMIT',
        ruleName: 'CRMA Supply Risk Limit',
        severity: 'WARNING',
        status: 'FAILED',
        effectiveMode: 'ENFORCING',
        issueType: 'SUPPLY_RISK_EXCEEDED',
        metricName: 'weightedSupplyRisk',
        metricValue: '4.2',
        threshold: '4.0',
        operator: 'GREATER_THAN',
        evaluationContext: {
          topDrivers: [
            { material: 'Cobalt', riskScore: '6.2', contributionPct: '0.76' },
            { material: 'Lithium', riskScore: '5.8', contributionPct: '1.2' },
          ],
          remediation: 'Review sourcing for top risk drivers',
        },
      };

      expect(isMetricFinding(finding)).toBe(true);
      expect(finding.metricValue).toBe('4.2');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test audit-finding.test.ts
```

Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// packages/database/src/types/audit-finding.ts

// ─────────────────────────────────────────────────────────────
// Issue Types
// ─────────────────────────────────────────────────────────────

export type IssueType =
  | 'PROHIBITED_SUBSTANCE'
  | 'CHEMICAL_LIMIT_EXCEEDED'
  | 'RESTRICTED_CONDITIONS'
  | 'MISSING_DOCUMENTATION'
  | 'SUPPLY_RISK_EXCEEDED';

// ─────────────────────────────────────────────────────────────
// Base Finding
// ─────────────────────────────────────────────────────────────

export interface AuditFindingBase {
  ruleCode: string;
  ruleName: string;
  severity: 'BLOCKER' | 'WARNING' | 'INFO';
  status: 'PASSED' | 'FAILED' | 'NOT_APPLICABLE';
  effectiveMode: 'ENFORCING' | 'SILENT' | 'DISABLED';
  existingDeviation?: {
    id: string;
    reasonCode: string;
    narrative?: string;
    acknowledgedBy: string;
    acknowledgedAt: Date;
  };
}

// ─────────────────────────────────────────────────────────────
// Substance Finding
// ─────────────────────────────────────────────────────────────

export interface SubstanceTraceability {
  materialName: string;
  materialVersionId: string;
  supplier?: string;
  concentrationInMaterial: string;
  contributionToProduct: string;
}

export interface SubstanceFinding extends AuditFindingBase {
  issueType: IssueType;

  substance?: {
    casNumber: string;
    primaryName: string;
    effectiveConcentrationPct: string;
    scope: 'ARTICLE' | 'HOMOGENEOUS_MATERIAL';
  };

  evaluationContext: {
    appliedList: {
      code: string;
      name: string;
      version: string;
      sourceUrl: string;
    };
    legalReference: string;
    categoryTrigger: string;
    reason: string;
    traceability: SubstanceTraceability[];
  };

  remediation: {
    suggestion: string;
    alternativeCas?: string[];
    documentationRequired?: string[];
  };
}

// ─────────────────────────────────────────────────────────────
// Metric Finding
// ─────────────────────────────────────────────────────────────

export interface MetricFinding extends AuditFindingBase {
  issueType: 'SUPPLY_RISK_EXCEEDED';
  metricName: string;
  metricValue: string;
  threshold: string;
  operator: string;

  evaluationContext: {
    topDrivers: Array<{
      material: string;
      riskScore: string;
      contributionPct: string;
    }>;
    remediation: string;
  };
}

// ─────────────────────────────────────────────────────────────
// Union Type
// ─────────────────────────────────────────────────────────────

export type AuditFinding = SubstanceFinding | MetricFinding | AuditFindingBase;

// ─────────────────────────────────────────────────────────────
// Type Guards
// ─────────────────────────────────────────────────────────────

export function isSubstanceFinding(finding: AuditFinding): finding is SubstanceFinding {
  return 'evaluationContext' in finding && 'appliedList' in (finding as SubstanceFinding).evaluationContext;
}

export function isMetricFinding(finding: AuditFinding): finding is MetricFinding {
  return 'metricName' in finding && 'metricValue' in finding;
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test audit-finding.test.ts
```

Expected: PASS

**Step 5: Export and commit**

```typescript
// packages/database/src/types/index.ts
export * from './audit-finding.js';
```

```bash
git add packages/database/src/types/audit-finding.ts packages/database/src/types/audit-finding.test.ts packages/database/src/types/index.ts
git commit -m "feat(database): add SubstanceFinding and MetricFinding types with traceability"
```

---

## Task 3: Create RegulatoryListCheckEvaluator

**Files:**
- Create: `packages/database/src/services/evaluators/RegulatoryListCheckEvaluator.ts`
- Test: `packages/database/src/services/evaluators/RegulatoryListCheckEvaluator.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/evaluators/RegulatoryListCheckEvaluator.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { MikroORM } from '@mikro-orm/postgresql';
import { RegulatoryList } from '../../entities/RegulatoryList.js';
import { RegulatoryListEntry } from '../../entities/RegulatoryListEntry.js';
import { Substance } from '../../entities/Substance.js';
import { Category, CategoryType } from '../../entities/Category.js';
import { CategoryRegulatoryList } from '../../entities/CategoryRegulatoryList.js';
import {
  RegulatoryListCheckEvaluator,
  EvaluatorInput,
} from './RegulatoryListCheckEvaluator.js';
import { RestrictionType, ListRequirement } from '../../entities/enums/index.js';
import { RegulatoryListCheckConfig } from '../../types/validation-logic.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../../test-utils.js';

describe('RegulatoryListCheckEvaluator', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) return;
    orm = await setupTestDb();
  });

  afterAll(async () => {
    if (orm) await teardownTestDb();
  });

  beforeEach(async () => {
    if (!orm) return;
    const em = orm.em.fork();
    await em.nativeDelete(CategoryRegulatoryList, {});
    await em.nativeDelete(RegulatoryListEntry, {});
    await em.nativeDelete(RegulatoryList, {});
    await em.nativeDelete(Category, {});
    await em.nativeDelete(Substance, {});

    // Create substances
    const formaldehyde = em.create(Substance, { casNumber: '50-00-0', primaryName: 'Formaldehyde' });
    const lead = em.create(Substance, { casNumber: '7439-92-1', primaryName: 'Lead' });
    const zinc = em.create(Substance, { casNumber: '7440-66-6', primaryName: 'Zinc' });

    // Create category
    const cosmetics = em.create(Category, {
      name: 'Cosmetics',
      path: 'products.cosmetics',
      type: CategoryType.BRANCH,
      depth: 1,
    });

    // Create regulatory list
    const cosingII = em.create(RegulatoryList, {
      code: 'COSING_ANNEX_II',
      name: 'CosIng Annex II',
      source: 'EU_COSING',
      version: '2024-06',
      effectiveDate: new Date('2024-06-01'),
    });

    await em.persistAndFlush([formaldehyde, lead, zinc, cosmetics, cosingII]);

    // Create list entries
    em.create(RegulatoryListEntry, {
      list: cosingII,
      substance: formaldehyde,
      casNumberSnapshot: '50-00-0',
      substanceNameSnapshot: 'Formaldehyde',
      restrictionType: RestrictionType.PROHIBITED,
      legalReference: 'Entry 1577',
    });

    em.create(RegulatoryListEntry, {
      list: cosingII,
      substance: lead,
      casNumberSnapshot: '7439-92-1',
      substanceNameSnapshot: 'Lead',
      restrictionType: RestrictionType.THRESHOLD,
      thresholdPct: '0.001',
      legalReference: 'Entry 1234',
    });

    // Link category to list
    em.create(CategoryRegulatoryList, {
      category: cosmetics,
      regulatoryList: cosingII,
      requirement: ListRequirement.PROHIBITION,
    });

    await em.flush();
  });

  describe('evaluate with PROHIBITED check (ARTICLE scope)', () => {
    it('fails when prohibited substance is present', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const evaluator = new RegulatoryListCheckEvaluator(em);

      const config: RegulatoryListCheckConfig = {
        listCodes: ['COSING_ANNEX_II'],
        checkType: 'PROHIBITED',
        scope: 'ARTICLE',
      };

      const input: EvaluatorInput = {
        scope: 'ARTICLE',
        substances: [
          {
            casNumber: '50-00-0',
            primaryName: 'Formaldehyde',
            effectiveConcentrationPct: '0.05',
            traceability: [
              { materialName: 'Preservative', materialVersionId: 'abc', concentrationInMaterial: '0.5', contributionToProduct: '0.05' },
            ],
          },
        ],
      };

      const findings = await evaluator.evaluate(config, input, 'products.cosmetics');

      expect(findings).toHaveLength(1);
      expect(findings[0].status).toBe('FAILED');
      expect(findings[0].issueType).toBe('PROHIBITED_SUBSTANCE');
      expect(findings[0].substance?.casNumber).toBe('50-00-0');
    });

    it('passes when no prohibited substances present', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const evaluator = new RegulatoryListCheckEvaluator(em);

      const config: RegulatoryListCheckConfig = {
        listCodes: ['COSING_ANNEX_II'],
        checkType: 'PROHIBITED',
        scope: 'ARTICLE',
      };

      const input: EvaluatorInput = {
        scope: 'ARTICLE',
        substances: [
          {
            casNumber: '7440-66-6',  // Zinc - not in list
            primaryName: 'Zinc',
            effectiveConcentrationPct: '1.0',
            traceability: [],
          },
        ],
      };

      const findings = await evaluator.evaluate(config, input, 'products.cosmetics');

      expect(findings).toHaveLength(0);  // No violations
    });
  });

  describe('evaluate with THRESHOLD check (ARTICLE scope)', () => {
    it('fails when concentration exceeds threshold', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const evaluator = new RegulatoryListCheckEvaluator(em);

      const config: RegulatoryListCheckConfig = {
        listCodes: ['COSING_ANNEX_II'],
        checkType: 'THRESHOLD',
        scope: 'ARTICLE',
      };

      const input: EvaluatorInput = {
        scope: 'ARTICLE',
        substances: [
          {
            casNumber: '7439-92-1',  // Lead - threshold 0.001%
            primaryName: 'Lead',
            effectiveConcentrationPct: '0.01',  // Above threshold
            traceability: [],
          },
        ],
      };

      const findings = await evaluator.evaluate(config, input, 'products.cosmetics');

      expect(findings).toHaveLength(1);
      expect(findings[0].status).toBe('FAILED');
      expect(findings[0].issueType).toBe('CHEMICAL_LIMIT_EXCEEDED');
    });

    it('passes when concentration below threshold', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const evaluator = new RegulatoryListCheckEvaluator(em);

      const config: RegulatoryListCheckConfig = {
        listCodes: ['COSING_ANNEX_II'],
        checkType: 'THRESHOLD',
        scope: 'ARTICLE',
      };

      const input: EvaluatorInput = {
        scope: 'ARTICLE',
        substances: [
          {
            casNumber: '7439-92-1',  // Lead - threshold 0.001%
            primaryName: 'Lead',
            effectiveConcentrationPct: '0.0005',  // Below threshold
            traceability: [],
          },
        ],
      };

      const findings = await evaluator.evaluate(config, input, 'products.cosmetics');

      expect(findings).toHaveLength(0);
    });
  });

  describe('evaluate with null listCodes (category inheritance)', () => {
    it('uses lists from category when listCodes is null', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const evaluator = new RegulatoryListCheckEvaluator(em);

      const config: RegulatoryListCheckConfig = {
        listCodes: null,  // Inherit from category
        checkType: 'PROHIBITED',
        scope: 'ARTICLE',
      };

      const input: EvaluatorInput = {
        scope: 'ARTICLE',
        substances: [
          {
            casNumber: '50-00-0',
            primaryName: 'Formaldehyde',
            effectiveConcentrationPct: '0.05',
            traceability: [],
          },
        ],
      };

      const findings = await evaluator.evaluate(config, input, 'products.cosmetics');

      expect(findings).toHaveLength(1);
      expect(findings[0].evaluationContext.appliedList.code).toBe('COSING_ANNEX_II');
    });
  });

  describe('evaluate with HOMOGENEOUS_MATERIAL scope', () => {
    it('fails when ANY individual material exceeds threshold (RoHS pattern)', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const evaluator = new RegulatoryListCheckEvaluator(em);

      const config: RegulatoryListCheckConfig = {
        listCodes: ['COSING_ANNEX_II'],
        checkType: 'THRESHOLD',
        scope: 'HOMOGENEOUS_MATERIAL',
      };

      // Laptop with 500 components: only the M3 screw has high Lead
      const input: EvaluatorInput = {
        scope: 'HOMOGENEOUS_MATERIAL',
        materials: [
          {
            materialName: 'Main PCB',
            materialVersionId: 'pcb-001',
            supplier: 'PCB Corp',
            substances: [
              { casNumber: '7439-92-1', primaryName: 'Lead', concentrationPct: '0.0001' },  // Below threshold
            ],
          },
          {
            materialName: 'M3 Screw',
            materialVersionId: 'screw-abc-123',
            supplier: 'Fastener Co',
            substances: [
              { casNumber: '7439-92-1', primaryName: 'Lead', concentrationPct: '0.2' },  // 0.2% - ABOVE 0.001% threshold!
            ],
          },
          {
            materialName: 'Housing',
            materialVersionId: 'housing-001',
            supplier: 'Plastics Inc',
            substances: [
              { casNumber: '7440-66-6', primaryName: 'Zinc', concentrationPct: '0.5' },  // Not in list
            ],
          },
        ],
      };

      const findings = await evaluator.evaluate(config, input, 'products.electronics');

      // Only the M3 Screw should fail (0.2% > 0.001% threshold)
      expect(findings).toHaveLength(1);
      expect(findings[0].status).toBe('FAILED');
      expect(findings[0].issueType).toBe('CHEMICAL_LIMIT_EXCEEDED');
      expect(findings[0].evaluationContext.traceability[0].materialName).toBe('M3 Screw');
      expect(findings[0].evaluationContext.traceability[0].supplier).toBe('Fastener Co');
      expect(findings[0].evaluationContext.reason).toContain('M3 Screw');
      expect(findings[0].evaluationContext.reason).toContain('Fastener Co');
    });

    it('passes when all individual materials are below threshold', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const evaluator = new RegulatoryListCheckEvaluator(em);

      const config: RegulatoryListCheckConfig = {
        listCodes: ['COSING_ANNEX_II'],
        checkType: 'THRESHOLD',
        scope: 'HOMOGENEOUS_MATERIAL',
      };

      const input: EvaluatorInput = {
        scope: 'HOMOGENEOUS_MATERIAL',
        materials: [
          {
            materialName: 'Main PCB',
            materialVersionId: 'pcb-001',
            supplier: 'PCB Corp',
            substances: [
              { casNumber: '7439-92-1', primaryName: 'Lead', concentrationPct: '0.0005' },  // Below 0.001%
            ],
          },
          {
            materialName: 'M3 Screw',
            materialVersionId: 'screw-abc-123',
            supplier: 'Fastener Co',
            substances: [
              { casNumber: '7439-92-1', primaryName: 'Lead', concentrationPct: '0.0008' },  // Below 0.001%
            ],
          },
        ],
      };

      const findings = await evaluator.evaluate(config, input, 'products.electronics');

      expect(findings).toHaveLength(0);
    });

    it('returns multiple findings when multiple materials violate', async (context) => {
      if (!orm) { context.skip(); return; }
      const em = orm.em.fork();
      const evaluator = new RegulatoryListCheckEvaluator(em);

      const config: RegulatoryListCheckConfig = {
        listCodes: ['COSING_ANNEX_II'],
        checkType: 'PROHIBITED',
        scope: 'HOMOGENEOUS_MATERIAL',
      };

      const input: EvaluatorInput = {
        scope: 'HOMOGENEOUS_MATERIAL',
        materials: [
          {
            materialName: 'Preservative A',
            materialVersionId: 'pres-001',
            supplier: 'ChemCo',
            substances: [
              { casNumber: '50-00-0', primaryName: 'Formaldehyde', concentrationPct: '0.1' },
            ],
          },
          {
            materialName: 'Preservative B',
            materialVersionId: 'pres-002',
            supplier: 'ChemCo',
            substances: [
              { casNumber: '50-00-0', primaryName: 'Formaldehyde', concentrationPct: '0.2' },
            ],
          },
        ],
      };

      const findings = await evaluator.evaluate(config, input, 'products.cosmetics');

      // Both materials contain prohibited Formaldehyde
      expect(findings).toHaveLength(2);
      expect(findings[0].evaluationContext.traceability[0].materialName).toBe('Preservative A');
      expect(findings[1].evaluationContext.traceability[0].materialName).toBe('Preservative B');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test RegulatoryListCheckEvaluator.test.ts
```

Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// packages/database/src/services/evaluators/RegulatoryListCheckEvaluator.ts
import { EntityManager } from '@mikro-orm/postgresql';
import Decimal from 'decimal.js';
import { RegulatoryList } from '../../entities/RegulatoryList.js';
import { RegulatoryListEntry } from '../../entities/RegulatoryListEntry.js';
import { CategoryRegulatoryListService } from '../CategoryRegulatoryListService.js';
import { RegulatoryListService } from '../RegulatoryListService.js';
import { RegulatoryListCheckConfig } from '../../types/validation-logic.js';
import { SubstanceFinding, IssueType, SubstanceTraceability } from '../../types/audit-finding.js';
import { RestrictionType } from '../../entities/enums/index.js';

/**
 * For ARTICLE scope: pre-rolled substance totals for the whole product
 */
export interface RolledUpSubstance {
  casNumber: string;
  primaryName: string;
  effectiveConcentrationPct: string;
  traceability: Array<{
    materialName: string;
    materialVersionId: string;
    supplier?: string;
    concentrationInMaterial: string;
    contributionToProduct: string;
  }>;
}

/**
 * For HOMOGENEOUS_MATERIAL scope: individual material with its substances
 * Each material is evaluated independently (RoHS requirement)
 */
export interface MaterialSubstanceData {
  materialName: string;
  materialVersionId: string;
  supplier?: string;
  substances: Array<{
    casNumber: string;
    primaryName: string;
    concentrationPct: string;  // Concentration within THIS material
  }>;
}

/**
 * Union input type - caller provides appropriate structure based on scope
 */
export type EvaluatorInput =
  | { scope: 'ARTICLE'; substances: RolledUpSubstance[] }
  | { scope: 'HOMOGENEOUS_MATERIAL'; materials: MaterialSubstanceData[] };

export class RegulatoryListCheckEvaluator {
  private readonly categoryListService: CategoryRegulatoryListService;
  private readonly listService: RegulatoryListService;

  constructor(private readonly em: EntityManager) {
    this.categoryListService = new CategoryRegulatoryListService(em);
    this.listService = new RegulatoryListService(em);
  }

  /**
   * Evaluate substances against regulatory lists.
   *
   * For ARTICLE scope: receives pre-rolled totals, checks product-level concentrations
   * For HOMOGENEOUS_MATERIAL scope: receives flattened materials list, checks EACH material independently
   *
   * @param config - Validation configuration including scope
   * @param input - Either rolled-up substances (ARTICLE) or individual materials (HOMOGENEOUS_MATERIAL)
   * @param categoryPath - Product category for list inheritance
   */
  async evaluate(
    config: RegulatoryListCheckConfig,
    input: EvaluatorInput,
    categoryPath: string
  ): Promise<SubstanceFinding[]> {
    // Step 1: Resolve which lists to check
    const lists = await this.resolveLists(config, categoryPath);
    if (lists.length === 0) return [];

    // Step 2: Get all entries for these lists
    const entries = await this.listService.getEntriesForLists(lists.map(l => l.id));

    // Step 3: Build lookup map by CAS
    const entryByCas = new Map<string, { entry: RegulatoryListEntry; list: RegulatoryList }>();
    for (const entry of entries) {
      const list = lists.find(l => l.id === entry.list.id);
      if (list) {
        entryByCas.set(entry.casNumberSnapshot, { entry, list });
      }
    }

    // Step 4: Evaluate based on scope
    if (input.scope === 'ARTICLE') {
      return this.evaluateArticleScope(input.substances, entryByCas, config);
    } else {
      return this.evaluateHomogeneousMaterialScope(input.materials, entryByCas, config);
    }
  }

  /**
   * ARTICLE scope: Check rolled-up totals (whole product concentration)
   */
  private evaluateArticleScope(
    substances: RolledUpSubstance[],
    entryByCas: Map<string, { entry: RegulatoryListEntry; list: RegulatoryList }>,
    config: RegulatoryListCheckConfig
  ): SubstanceFinding[] {
    const findings: SubstanceFinding[] = [];

    for (const substance of substances) {
      const match = entryByCas.get(substance.casNumber);
      if (!match) continue;

      const { entry, list } = match;
      const violation = this.checkViolation(substance.effectiveConcentrationPct, entry, config);

      if (violation) {
        findings.push(this.buildFinding(substance, entry, list, config, violation));
      }
    }

    return findings;
  }

  /**
   * HOMOGENEOUS_MATERIAL scope: Check EACH material independently
   *
   * Critical for RoHS: A laptop with 500 components where 1 screw has 0.2% Lead
   * is a violation, even if total laptop concentration is 0.000001% Lead.
   */
  private evaluateHomogeneousMaterialScope(
    materials: MaterialSubstanceData[],
    entryByCas: Map<string, { entry: RegulatoryListEntry; list: RegulatoryList }>,
    config: RegulatoryListCheckConfig
  ): SubstanceFinding[] {
    const findings: SubstanceFinding[] = [];

    // Check EVERY material independently
    for (const material of materials) {
      for (const substance of material.substances) {
        const match = entryByCas.get(substance.casNumber);
        if (!match) continue;

        const { entry, list } = match;
        // Check concentration WITHIN THIS MATERIAL, not product total
        const violation = this.checkViolation(substance.concentrationPct, entry, config);

        if (violation) {
          // Build finding with material-specific traceability
          findings.push(this.buildHomogeneousMaterialFinding(
            substance,
            material,
            entry,
            list,
            config,
            violation
          ));
        }
      }
    }

    return findings;
  }

  private async resolveLists(
    config: RegulatoryListCheckConfig,
    categoryPath: string
  ): Promise<RegulatoryList[]> {
    if (config.listCodes) {
      return this.listService.getListsByCodes(config.listCodes);
    }

    // Inherit from category
    const mappings = await this.categoryListService.getListsForCategory(categoryPath);
    return mappings.map(m => m.regulatoryList);
  }

  /**
   * Check if a concentration violates the regulatory entry.
   *
   * @param concentrationPct - The concentration to check (string for precision)
   * @param entry - The regulatory list entry with thresholds
   * @param config - Validation config with checkType
   */
  private checkViolation(
    concentrationPct: string,
    entry: RegulatoryListEntry,
    config: RegulatoryListCheckConfig
  ): IssueType | null {
    const rawConcentration = new Decimal(concentrationPct);

    // Apply stoichiometric factor if present (element-based regulations)
    // Example: If law limits Cobalt but user declared Cobalt Sulfate,
    // multiply concentration by factor (e.g., 0.38) before comparison
    const concentration = entry.stoichiometricFactor
      ? rawConcentration.mul(entry.stoichiometricFactor)
      : rawConcentration;

    switch (config.checkType) {
      case 'PROHIBITED':
        if (entry.restrictionType === RestrictionType.PROHIBITED && concentration.gt(0)) {
          return 'PROHIBITED_SUBSTANCE';
        }
        break;

      case 'THRESHOLD':
        if (entry.restrictionType === RestrictionType.THRESHOLD && entry.thresholdPct) {
          const threshold = config.thresholdOverridePct
            ? new Decimal(config.thresholdOverridePct)
            : new Decimal(entry.thresholdPct);

          if (concentration.gt(threshold)) {
            return 'CHEMICAL_LIMIT_EXCEEDED';
          }
        }
        break;

      case 'RESTRICTED_WITH_CONDITIONS':
        if (entry.restrictionType === RestrictionType.RESTRICTED_WITH_CONDITIONS) {
          // Check conditions - simplified for now
          // In full implementation, check substance metadata against entry.conditions
          if (concentration.gt(0)) {
            return 'RESTRICTED_CONDITIONS';
          }
        }
        break;
    }

    return null;
  }

  private buildFinding(
    substance: RolledUpSubstance,
    entry: RegulatoryListEntry,
    list: RegulatoryList,
    config: RegulatoryListCheckConfig,
    issueType: IssueType
  ): SubstanceFinding {
    return {
      ruleCode: `VERTICAL_${config.checkType}_CHECK`,
      ruleName: `${list.name} Compliance Check`,
      severity: issueType === 'PROHIBITED_SUBSTANCE' ? 'BLOCKER' : 'WARNING',
      status: 'FAILED',
      effectiveMode: 'ENFORCING',
      issueType,
      substance: {
        casNumber: substance.casNumber,
        primaryName: substance.primaryName,
        effectiveConcentrationPct: substance.effectiveConcentrationPct,
        scope: config.scope,
      },
      evaluationContext: {
        appliedList: {
          code: list.code,
          name: list.name,
          version: list.version,
          sourceUrl: list.sourceUrl || '',
        },
        legalReference: entry.legalReference || '',
        categoryTrigger: '', // Set by caller
        reason: this.buildReason(issueType, substance, entry),
        traceability: substance.traceability.map(t => ({
          materialName: t.materialName,
          materialVersionId: t.materialVersionId,
          supplier: t.supplier,
          concentrationInMaterial: t.concentrationInMaterial,
          contributionToProduct: t.contributionToProduct,
        })),
      },
      remediation: {
        suggestion: this.buildSuggestion(issueType, substance.primaryName),
        alternativeCas: entry.alternativeCas || [],
      },
    };
  }

  /**
   * Build finding for HOMOGENEOUS_MATERIAL scope violations.
   * The traceability pinpoints the EXACT material causing the violation.
   */
  private buildHomogeneousMaterialFinding(
    substance: { casNumber: string; primaryName: string; concentrationPct: string },
    material: MaterialSubstanceData,
    entry: RegulatoryListEntry,
    list: RegulatoryList,
    config: RegulatoryListCheckConfig,
    issueType: IssueType
  ): SubstanceFinding {
    return {
      ruleCode: `VERTICAL_${config.checkType}_CHECK`,
      ruleName: `${list.name} Compliance Check`,
      severity: issueType === 'PROHIBITED_SUBSTANCE' ? 'BLOCKER' : 'WARNING',
      status: 'FAILED',
      effectiveMode: 'ENFORCING',
      issueType,
      substance: {
        casNumber: substance.casNumber,
        primaryName: substance.primaryName,
        effectiveConcentrationPct: substance.concentrationPct,
        scope: 'HOMOGENEOUS_MATERIAL',
      },
      evaluationContext: {
        appliedList: {
          code: list.code,
          name: list.name,
          version: list.version,
          sourceUrl: list.sourceUrl || '',
        },
        legalReference: entry.legalReference || '',
        categoryTrigger: '',
        // Pinpoint the EXACT material causing the violation
        reason: `Product blocked because ${substance.primaryName} in '${material.materialName}' from '${material.supplier || 'Unknown Supplier'}' ${
          issueType === 'PROHIBITED_SUBSTANCE'
            ? 'is prohibited'
            : `exceeds ${entry.thresholdPct}% threshold (found ${substance.concentrationPct}%)`
        }.`,
        traceability: [{
          materialName: material.materialName,
          materialVersionId: material.materialVersionId,
          supplier: material.supplier,
          concentrationInMaterial: substance.concentrationPct,
          contributionToProduct: substance.concentrationPct,  // Same for homogeneous material
        }],
      },
      remediation: {
        suggestion: `Replace or remove '${material.materialName}' from ${material.supplier || 'supplier'}, or request reformulation without ${substance.primaryName}.`,
        alternativeCas: entry.alternativeCas || [],
      },
    };
  }

  private buildReason(issueType: IssueType, substance: RolledUpSubstance, entry: RegulatoryListEntry): string {
    switch (issueType) {
      case 'PROHIBITED_SUBSTANCE':
        return `${substance.primaryName} is prohibited.`;
      case 'CHEMICAL_LIMIT_EXCEEDED':
        return `${substance.primaryName} exceeds threshold of ${entry.thresholdPct}%.`;
      case 'RESTRICTED_CONDITIONS':
        return `${substance.primaryName} is restricted under specific conditions.`;
      default:
        return 'Compliance violation detected.';
    }
  }

  private buildSuggestion(issueType: IssueType, substanceName: string): string {
    switch (issueType) {
      case 'PROHIBITED_SUBSTANCE':
        return `Remove ${substanceName} or use an approved alternative.`;
      case 'CHEMICAL_LIMIT_EXCEEDED':
        return `Reduce concentration of ${substanceName} below threshold.`;
      default:
        return 'Review compliance requirements.';
    }
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test RegulatoryListCheckEvaluator.test.ts
```

Expected: PASS

**Step 5: Export and commit**

```typescript
// packages/database/src/services/evaluators/index.ts
export { RegulatoryListCheckEvaluator } from './RegulatoryListCheckEvaluator.js';
```

```bash
git add packages/database/src/services/evaluators/RegulatoryListCheckEvaluator.ts packages/database/src/services/evaluators/RegulatoryListCheckEvaluator.test.ts packages/database/src/services/evaluators/index.ts
git commit -m "feat(database): add RegulatoryListCheckEvaluator for vertical compliance checks"
```

---

## Task 4: Create MetricThresholdEvaluator

**Files:**
- Create: `packages/database/src/services/evaluators/MetricThresholdEvaluator.ts`
- Test: `packages/database/src/services/evaluators/MetricThresholdEvaluator.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/database/src/services/evaluators/MetricThresholdEvaluator.test.ts
import { describe, it, expect } from 'vitest';
import { MetricThresholdEvaluator } from './MetricThresholdEvaluator.js';
import { AggregateMetricThresholdConfig } from '../../types/validation-logic.js';

describe('MetricThresholdEvaluator', () => {
  const evaluator = new MetricThresholdEvaluator();

  describe('evaluate GREATER_THAN', () => {
    it('should fail when metric exceeds threshold', () => {
      const config: AggregateMetricThresholdConfig = {
        metric: 'weightedSupplyRisk',
        operator: 'GREATER_THAN',
        threshold: 4.0,
        message: 'Supply risk too high',
      };

      const rollupResult = {
        weightedSupplyRisk: 4.5,
        topRiskDrivers: [
          { material: 'Cobalt', riskScore: 6.2, contributionPct: 0.76 },
        ],
      };

      const finding = evaluator.evaluate(config, rollupResult);

      expect(finding).toBeDefined();
      expect(finding!.status).toBe('FAILED');
      expect(finding!.metricValue).toBe('4.5');
      expect(finding!.issueType).toBe('SUPPLY_RISK_EXCEEDED');
    });

    it('should pass when metric below threshold', () => {
      const config: AggregateMetricThresholdConfig = {
        metric: 'weightedSupplyRisk',
        operator: 'GREATER_THAN',
        threshold: 4.0,
        message: 'Supply risk too high',
      };

      const rollupResult = {
        weightedSupplyRisk: 3.5,
        topRiskDrivers: [],
      };

      const finding = evaluator.evaluate(config, rollupResult);

      expect(finding).toBeNull();
    });

    it('should pass when metric equals threshold (not greater)', () => {
      const config: AggregateMetricThresholdConfig = {
        metric: 'weightedSupplyRisk',
        operator: 'GREATER_THAN',
        threshold: 4.0,
        message: 'Supply risk too high',
      };

      const rollupResult = {
        weightedSupplyRisk: 4.0,
        topRiskDrivers: [],
      };

      const finding = evaluator.evaluate(config, rollupResult);

      expect(finding).toBeNull();
    });
  });

  describe('evaluate LESS_THAN', () => {
    it('should fail when metric below threshold', () => {
      const config: AggregateMetricThresholdConfig = {
        metric: 'totalStrategicContentPct',
        operator: 'LESS_THAN',
        threshold: 1.0,
        message: 'Strategic content too low for compliance',
      };

      const rollupResult = {
        totalStrategicContentPct: 0.5,
        topRiskDrivers: [],
      };

      const finding = evaluator.evaluate(config, rollupResult);

      expect(finding).toBeDefined();
      expect(finding!.status).toBe('FAILED');
    });
  });

  describe('missing metric handling', () => {
    it('should return null when metric not present', () => {
      const config: AggregateMetricThresholdConfig = {
        metric: 'nonexistentMetric',
        operator: 'GREATER_THAN',
        threshold: 4.0,
        message: 'Test',
      };

      const rollupResult = {
        weightedSupplyRisk: 4.5,
        topRiskDrivers: [],
      };

      const finding = evaluator.evaluate(config, rollupResult);

      expect(finding).toBeNull();
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/database && pnpm test MetricThresholdEvaluator.test.ts
```

Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// packages/database/src/services/evaluators/MetricThresholdEvaluator.ts
import { AggregateMetricThresholdConfig } from '../../types/validation-logic.js';
import { MetricFinding } from '../../types/audit-finding.js';

export interface RollupMetrics {
  weightedSupplyRisk?: number;
  totalStrategicContentPct?: number;
  topRiskDrivers?: Array<{
    material: string;
    riskScore: number;
    contributionPct: number;
  }>;
  [key: string]: unknown;
}

export class MetricThresholdEvaluator {
  /**
   * Evaluate a rollup metric against a threshold.
   * Returns a finding if threshold is violated, null otherwise.
   */
  evaluate(
    config: AggregateMetricThresholdConfig,
    rollupResult: RollupMetrics
  ): MetricFinding | null {
    const metricValue = rollupResult[config.metric];

    if (metricValue === undefined || metricValue === null) {
      return null;
    }

    const numericValue = typeof metricValue === 'number' ? metricValue : parseFloat(String(metricValue));
    if (isNaN(numericValue)) {
      return null;
    }

    const isViolation = this.checkThreshold(numericValue, config.threshold, config.operator);

    if (!isViolation) {
      return null;
    }

    return {
      ruleCode: `METRIC_${config.metric.toUpperCase()}`,
      ruleName: config.message,
      severity: 'WARNING',
      status: 'FAILED',
      effectiveMode: 'ENFORCING',
      issueType: 'SUPPLY_RISK_EXCEEDED',
      metricName: config.metric,
      metricValue: numericValue.toString(),
      threshold: config.threshold.toString(),
      operator: config.operator,
      evaluationContext: {
        topDrivers: (rollupResult.topRiskDrivers || []).map(d => ({
          material: d.material,
          riskScore: d.riskScore.toString(),
          contributionPct: d.contributionPct.toString(),
        })),
        remediation: 'Review sourcing for top risk drivers or evaluate substitution.',
      },
    };
  }

  private checkThreshold(value: number, threshold: number, operator: string): boolean {
    switch (operator) {
      case 'GREATER_THAN':
        return value > threshold;
      case 'LESS_THAN':
        return value < threshold;
      case 'EQUALS':
        return value === threshold;
      default:
        return false;
    }
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/database && pnpm test MetricThresholdEvaluator.test.ts
```

Expected: PASS

**Step 5: Export and commit**

```typescript
// packages/database/src/services/evaluators/index.ts
export { MetricThresholdEvaluator } from './MetricThresholdEvaluator.js';
```

```bash
git add packages/database/src/services/evaluators/MetricThresholdEvaluator.ts packages/database/src/services/evaluators/MetricThresholdEvaluator.test.ts packages/database/src/services/evaluators/index.ts
git commit -m "feat(database): add MetricThresholdEvaluator for supply risk checks"
```

---

## Summary

**Plan 14 delivers:**
- Extended `ValidationLogic` types with `regulatory_list_check` and `aggregate_metric_threshold`
- `SubstanceFinding` and `MetricFinding` interfaces with traceability
- `RegulatoryListCheckEvaluator` for vertical compliance checks with dual-scope support
- `MetricThresholdEvaluator` for supply risk threshold checks
- Full test coverage including HOMOGENEOUS_MATERIAL scenarios

**Scope-Aware Evaluation:**

| Scope | Evaluation Strategy | Input Type |
|-------|---------------------|------------|
| `ARTICLE` | Check rolled-up totals (whole product) | `RolledUpSubstance[]` |
| `HOMOGENEOUS_MATERIAL` | Check **each material independently** | `MaterialSubstanceData[]` |

**RoHS Example:** A laptop with 500 components where one M3 screw has 0.2% Lead is a violation, even if total laptop is 0.000001% Lead. The traceability array pinpoints the exact violating component.

**Stoichiometry Support:**
When `RegulatoryListEntry.stoichiometricFactor` is present (from Plan 10), the evaluator applies it before threshold comparison. Example: Cobalt Sulfate at 1% with factor 0.38 → effective 0.38% Cobalt.

**Threshold Resolution Hierarchy:**
1. `CategoryRegulatoryList.thresholdOverridePct` (category-specific stricter threshold from Plan 11)
2. `RegulatoryListEntry.thresholdPct` (default list entry threshold from Plan 10)

**Integration Points:**
- Evaluators receive input from Plan 8 (SubstanceRollupService) - caller decides scope
- Evaluators query lists from Plan 10 (RegulatoryListService)
- Category inheritance from Plan 11 (CategoryRegulatoryListService)

**Audit Defensibility:**
- `appliedList.version` and `sourceUrl` enable reports linking to EU Official Journal
- `alternativeCas` moves tool from "Police Officer" to "Engineer" (suggesting fixes)

**Next Plan:**
- **Plan 15:** Regulatory Seeders (initial data for REACH, RoHS, CosIng, CRM)

---

*Plan created: 2026-01-26*
