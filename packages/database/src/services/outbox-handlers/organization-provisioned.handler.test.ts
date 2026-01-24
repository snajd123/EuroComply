import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '../../test-utils.js';
import { OutboxEvent, OutboxStatus } from '../../entities/OutboxEvent.js';
import {
  organizationProvisionedHandler,
  organizationProvisionedPayloadSchema,
} from './organization-provisioned.handler.js';
import { validatePayload } from './types.js';
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
    const payload = {
      organizationId: 'org_123',
      schemaName: 'tenant_test',
      name: 'Test Org',
    };
    const event: OutboxEvent = {
      id: createId(),
      aggregateType: 'Organization',
      aggregateId: 'org_123',
      eventType: 'organization.provisioned',
      payload,
      status: OutboxStatus.PROCESSING,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as OutboxEvent;

    // Act & Assert - should not throw
    const validatedPayload = validatePayload(organizationProvisionedHandler, payload);
    await expect(
      organizationProvisionedHandler.handle(event, validatedPayload, { orm, schema: 'public' })
    ).resolves.not.toThrow();
  });

  it('should have correct eventType', () => {
    expect(organizationProvisionedHandler.eventType).toBe('organization.provisioned');
  });

  it('should have a payloadSchema', () => {
    expect(organizationProvisionedHandler.payloadSchema).toBe(organizationProvisionedPayloadSchema);
  });

  describe('payload validation', () => {
    it('should validate valid payload', () => {
      const payload = {
        organizationId: 'org_123',
        schemaName: 'tenant_test',
        name: 'Test Org',
      };

      const result = validatePayload(organizationProvisionedHandler, payload);
      expect(result).toEqual(payload);
    });

    it('should reject payload with missing organizationId', () => {
      const payload = {
        schemaName: 'tenant_test',
        name: 'Test Org',
      };

      expect(() => validatePayload(organizationProvisionedHandler, payload as Record<string, unknown>))
        .toThrow(/Invalid payload for organization.provisioned/);
    });

    it('should reject payload with missing schemaName', () => {
      const payload = {
        organizationId: 'org_123',
        name: 'Test Org',
      };

      expect(() => validatePayload(organizationProvisionedHandler, payload as Record<string, unknown>))
        .toThrow(/Invalid payload for organization.provisioned/);
    });

    it('should reject payload with empty strings', () => {
      const payload = {
        organizationId: '',
        schemaName: 'tenant_test',
        name: 'Test Org',
      };

      expect(() => validatePayload(organizationProvisionedHandler, payload))
        .toThrow(/Invalid payload for organization.provisioned/);
    });
  });
});
