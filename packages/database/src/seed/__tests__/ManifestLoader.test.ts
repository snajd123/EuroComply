// packages/database/src/seed/__tests__/ManifestLoader.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { ManifestLoader } from '../ManifestLoader.js';
import { Regulation } from '../../entities/Regulation.js';
import { Requirement } from '../../entities/Requirement.js';
import { CategoryRegulation } from '../../entities/CategoryRegulation.js';
import { Category } from '../../entities/Category.js';
import { RegulationStatus } from '../../entities/enums/RegulationStatus.js';
import { RequirementType } from '../../entities/enums/RequirementType.js';
import { RequirementSeverity } from '../../entities/enums/RequirementSeverity.js';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '../../test-utils.js';
import type { MigrationManifest } from '../types.js';

describe('ManifestLoader', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let dbAvailable = false;

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (dbAvailable) {
      orm = await setupTestDb();
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await teardownTestDb();
    }
  });

  beforeEach(async (context) => {
    if (!dbAvailable) {
      context.skip();
      return;
    }
    em = orm.em.fork();
    await clearTestDb(em);
  });

  describe('loadManifest', () => {
    it('should_create_regulations_from_manifest', async () => {
      const loader = new ManifestLoader(em);

      const manifest: MigrationManifest = {
        version: '1.0',
        regulations: [
          {
            code: 'TEST_REG_MANIFEST',
            name: 'Test Regulation from Manifest',
            status: RegulationStatus.ACTIVE,
            requirements: [
              {
                code: 'TEST_REQ_1',
                name: 'Test Requirement 1',
                type: RequirementType.ATTRIBUTE_CHECK,
                severity: RequirementSeverity.BLOCKER,
                attributeTemplateKey: 'test_attr',
                handlerConfig: { operator: '>=', threshold: 10 },
              },
            ],
          },
        ],
      };

      await loader.loadManifest(manifest);

      const regulation = await em.findOne(Regulation, { code: 'TEST_REG_MANIFEST' });
      expect(regulation).toBeDefined();
      expect(regulation!.name).toBe('Test Regulation from Manifest');

      const requirements = await em.find(Requirement, { regulation });
      expect(requirements).toHaveLength(1);
      expect(requirements[0].code).toBe('TEST_REQ_1');
    });

    it('should_create_category_mappings_from_manifest', async () => {
      const loader = new ManifestLoader(em);

      // Create category first
      const category = em.create(Category, {
        name: 'Manifest Test Category',
        path: 'manifest_test',
      });
      await em.persistAndFlush(category);

      const manifest: MigrationManifest = {
        version: '1.0',
        regulations: [
          {
            code: 'MAPPED_REG',
            name: 'Mapped Regulation',
            status: RegulationStatus.ACTIVE,
            requirements: [],
          },
        ],
        categoryMappings: [
          {
            categoryPath: 'manifest_test',
            regulationCode: 'MAPPED_REG',
          },
        ],
      };

      await loader.loadManifest(manifest);

      const mapping = await em.findOne(CategoryRegulation, {
        category: { path: 'manifest_test' },
        regulation: { code: 'MAPPED_REG' },
      });
      expect(mapping).toBeDefined();
    });

    it('should_skip_existing_regulations_on_reload', async () => {
      const loader = new ManifestLoader(em);

      const manifest: MigrationManifest = {
        version: '1.0',
        regulations: [
          {
            code: 'IDEMPOTENT_REG',
            name: 'Idempotent Regulation',
            status: RegulationStatus.ACTIVE,
            requirements: [],
          },
        ],
      };

      // Load twice
      await loader.loadManifest(manifest);
      await loader.loadManifest(manifest);

      const regulations = await em.find(Regulation, { code: 'IDEMPOTENT_REG' });
      expect(regulations).toHaveLength(1);  // Not duplicated
    });

    it('should_return_load_result_with_counts', async () => {
      const loader = new ManifestLoader(em);

      const manifest: MigrationManifest = {
        version: '1.0',
        regulations: [
          {
            code: 'RESULT_TEST_REG',
            name: 'Result Test Regulation',
            status: RegulationStatus.ACTIVE,
            requirements: [
              {
                code: 'RESULT_REQ_1',
                name: 'Result Requirement 1',
                type: RequirementType.ATTRIBUTE_CHECK,
                severity: RequirementSeverity.WARNING,
              },
              {
                code: 'RESULT_REQ_2',
                name: 'Result Requirement 2',
                type: RequirementType.DECLARATION,
                severity: RequirementSeverity.INFO,
              },
            ],
          },
        ],
      };

      const result = await loader.loadManifest(manifest);

      expect(result.regulationsCreated).toBe(1);
      expect(result.requirementsCreated).toBe(2);
      expect(result.regulationsSkipped).toBe(0);
    });

    it('should_count_skipped_regulations_on_reload', async () => {
      const loader = new ManifestLoader(em);

      const manifest: MigrationManifest = {
        version: '1.0',
        regulations: [
          {
            code: 'SKIP_COUNT_REG',
            name: 'Skip Count Regulation',
            status: RegulationStatus.ACTIVE,
            requirements: [],
          },
        ],
      };

      // First load
      const firstResult = await loader.loadManifest(manifest);
      expect(firstResult.regulationsCreated).toBe(1);
      expect(firstResult.regulationsSkipped).toBe(0);

      // Second load - should skip
      const secondResult = await loader.loadManifest(manifest);
      expect(secondResult.regulationsCreated).toBe(0);
      expect(secondResult.regulationsSkipped).toBe(1);
    });

    it('should_store_regulation_metadata', async () => {
      const loader = new ManifestLoader(em);

      const manifest: MigrationManifest = {
        version: '1.0',
        regulations: [
          {
            code: 'METADATA_REG',
            name: 'Metadata Regulation',
            status: RegulationStatus.ACTIVE,
            metadata: {
              jurisdiction: 'EU',
              type: 'DIRECTIVE',
              officialJournalRef: 'OJ L 197/1',
            },
            requirements: [],
          },
        ],
      };

      await loader.loadManifest(manifest);

      const regulation = await em.findOne(Regulation, { code: 'METADATA_REG' });
      expect(regulation).toBeDefined();
      expect(regulation!.metadata).toEqual({
        jurisdiction: 'EU',
        type: 'DIRECTIVE',
        officialJournalRef: 'OJ L 197/1',
      });
    });

    it('should_store_requirement_handler_config', async () => {
      const loader = new ManifestLoader(em);

      const manifest: MigrationManifest = {
        version: '1.0',
        regulations: [
          {
            code: 'HANDLER_CONFIG_REG',
            name: 'Handler Config Regulation',
            status: RegulationStatus.ACTIVE,
            requirements: [
              {
                code: 'HANDLER_REQ',
                name: 'Handler Requirement',
                type: RequirementType.ATTRIBUTE_CHECK,
                severity: RequirementSeverity.BLOCKER,
                handlerConfig: {
                  operator: '<=',
                  threshold: 0.1,
                  unit: 'ppm',
                },
              },
            ],
          },
        ],
      };

      await loader.loadManifest(manifest);

      const requirement = await em.findOne(Requirement, { code: 'HANDLER_REQ' });
      expect(requirement).toBeDefined();
      expect(requirement!.handlerConfig).toEqual({
        operator: '<=',
        threshold: 0.1,
        unit: 'ppm',
      });
    });

    it('should_skip_category_mapping_when_category_not_found', async () => {
      const loader = new ManifestLoader(em);

      const manifest: MigrationManifest = {
        version: '1.0',
        regulations: [
          {
            code: 'MISSING_CAT_REG',
            name: 'Missing Category Regulation',
            status: RegulationStatus.ACTIVE,
            requirements: [],
          },
        ],
        categoryMappings: [
          {
            categoryPath: 'nonexistent_category',
            regulationCode: 'MISSING_CAT_REG',
          },
        ],
      };

      const result = await loader.loadManifest(manifest);

      // Regulation should be created
      const regulation = await em.findOne(Regulation, { code: 'MISSING_CAT_REG' });
      expect(regulation).toBeDefined();

      // Mapping should not be created (category doesn't exist)
      expect(result.mappingsCreated).toBe(0);
    });

    it('should_skip_category_mapping_when_regulation_not_found', async () => {
      const loader = new ManifestLoader(em);

      // Create category
      const category = em.create(Category, {
        name: 'Orphan Category',
        path: 'orphan_category',
      });
      await em.persistAndFlush(category);

      const manifest: MigrationManifest = {
        version: '1.0',
        regulations: [],
        categoryMappings: [
          {
            categoryPath: 'orphan_category',
            regulationCode: 'NONEXISTENT_REG',
          },
        ],
      };

      const result = await loader.loadManifest(manifest);

      // Mapping should not be created (regulation doesn't exist)
      expect(result.mappingsCreated).toBe(0);
    });
  });
});
