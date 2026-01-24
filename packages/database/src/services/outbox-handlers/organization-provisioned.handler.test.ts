import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '../../test-utils.js';
import { OutboxEvent, OutboxStatus } from '../../entities/OutboxEvent.js';
import { organizationProvisionedHandler } from './organization-provisioned.handler.js';
import { createId } from '@eurocomply/core';

describe('organizationProvisionedHandler', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }
    orm = await setupTestDb();
  });

  afterAll(async () => {
    if (orm) {
      await teardownTestDb();
    }
  });

  beforeEach(async () => {
    if (!orm) return;
    const em = orm.em.fork();
    await clearTestDb(em);
  });

  it('should handle organization.provisioned event without error', async (context) => {
    if (!(await isDatabaseAvailable())) {
      context.skip();
      return;
    }

    // Arrange
    const event: OutboxEvent = {
      id: createId(),
      aggregateType: 'Organization',
      aggregateId: 'org_123',
      eventType: 'organization.provisioned',
      payload: {
        organizationId: 'org_123',
        schemaName: 'tenant_test',
        name: 'Test Org',
      },
      status: OutboxStatus.PROCESSING,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as OutboxEvent;

    // Act & Assert - should not throw
    await expect(
      organizationProvisionedHandler.handle(event, { orm, schema: 'public' })
    ).resolves.not.toThrow();
  });

  it('should have correct eventType', () => {
    expect(organizationProvisionedHandler.eventType).toBe('organization.provisioned');
  });
});
