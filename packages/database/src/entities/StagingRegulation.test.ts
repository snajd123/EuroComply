import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { StagingRegulation } from './StagingRegulation.js';
import { StagingStatus } from './enums/StagingStatus.js';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '../test-utils.js';

describe('StagingRegulation', () => {
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
    it('should_create_staging_regulation_with_required_fields', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      const staging = em.create(StagingRegulation, {
        code: 'TEST-REG-001',
        name: 'Test Regulation',
        sourceUrl: 'https://eur-lex.europa.eu/test',
        sourceType: 'EUR_LEX',
        primaryPayload: { regulations: [] },
        status: StagingStatus.PENDING,
      });

      await em.persistAndFlush(staging);

      expect(staging.id).toBeDefined();
      expect(staging.code).toBe('TEST-REG-001');
      expect(staging.status).toBe(StagingStatus.PENDING);
      expect(staging.createdAt).toBeInstanceOf(Date);

      // Cleanup
      await em.removeAndFlush(staging);
    });

    it('should_default_status_to_pending', async (ctx) => {
      if (!(await isDatabaseAvailable())) {
        ctx.skip();
        return;
      }

      const staging = em.create(StagingRegulation, {
        code: 'TEST-REG-002',
        name: 'Test Regulation 2',
        sourceUrl: 'https://eur-lex.europa.eu/test2',
        sourceType: 'EUR_LEX',
        primaryPayload: {},
      });

      expect(staging.status).toBe(StagingStatus.PENDING);

      // No flush needed - just testing defaults
    });
  });
});
