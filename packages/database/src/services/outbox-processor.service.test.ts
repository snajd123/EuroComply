import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupTestDb, teardownTestDb, clearTestDb, isDatabaseAvailable } from '../test-utils.js';
import { OutboxEvent, OutboxStatus } from '../entities/OutboxEvent.js';
import { OutboxProcessorService } from './outbox-processor.service.js';
import { createId } from '@eurocomply/core';

describe('OutboxProcessorService', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let service: OutboxProcessorService;

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
    em = orm.em.fork();
    await clearTestDb(em);
    service = new OutboxProcessorService(orm);
  });

  describe('claimNextEvent', () => {
    it('should claim a PENDING event and mark it PROCESSING', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Arrange
      const event = em.create(OutboxEvent, {
        id: createId(),
        aggregateType: 'Organization',
        aggregateId: 'org_123',
        eventType: 'organization.provisioned',
        payload: { test: true },
        status: OutboxStatus.PENDING,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.persistAndFlush(event);

      // Act
      const claimed = await service.claimNextEvent('public');

      // Assert
      expect(claimed).toBeDefined();
      expect(claimed!.id).toBe(event.id);
      expect(claimed!.status).toBe(OutboxStatus.PROCESSING);
    });

    it('should return null when no pending events exist', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Act
      const claimed = await service.claimNextEvent('public');

      // Assert
      expect(claimed).toBeNull();
    });

    it('should claim oldest pending event first', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Arrange - create two events with different timestamps
      const olderEvent = em.create(OutboxEvent, {
        id: createId(),
        aggregateType: 'Organization',
        aggregateId: 'org_1',
        eventType: 'organization.provisioned',
        payload: { order: 1 },
        status: OutboxStatus.PENDING,
        retryCount: 0,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      });

      const newerEvent = em.create(OutboxEvent, {
        id: createId(),
        aggregateType: 'Organization',
        aggregateId: 'org_2',
        eventType: 'organization.provisioned',
        payload: { order: 2 },
        status: OutboxStatus.PENDING,
        retryCount: 0,
        createdAt: new Date('2024-01-02T00:00:00Z'),
        updatedAt: new Date('2024-01-02T00:00:00Z'),
      });

      await em.persistAndFlush([olderEvent, newerEvent]);

      // Act
      const claimed = await service.claimNextEvent('public');

      // Assert
      expect(claimed).toBeDefined();
      expect(claimed!.id).toBe(olderEvent.id);
    });
  });

  describe('markCompleted', () => {
    it('should mark event as COMPLETED with processedAt timestamp', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Arrange
      const event = em.create(OutboxEvent, {
        id: createId(),
        aggregateType: 'Organization',
        aggregateId: 'org_123',
        eventType: 'organization.provisioned',
        payload: { test: true },
        status: OutboxStatus.PROCESSING,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.persistAndFlush(event);

      // Act
      await service.markCompleted('public', event.id);

      // Assert - need fresh em to see the changes
      const freshEm = orm.em.fork();
      const updated = await freshEm.findOneOrFail(OutboxEvent, event.id);
      expect(updated.status).toBe(OutboxStatus.COMPLETED);
      expect(updated.processedAt).toBeDefined();
    });
  });

  describe('markFailed', () => {
    it('should increment retryCount and return to PENDING when under max retries', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Arrange
      const event = em.create(OutboxEvent, {
        id: createId(),
        aggregateType: 'Organization',
        aggregateId: 'org_123',
        eventType: 'organization.provisioned',
        payload: { test: true },
        status: OutboxStatus.PROCESSING,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.persistAndFlush(event);

      // Act
      await service.markFailed('public', event.id, 'Test error', 5);

      // Assert - need fresh em to see the changes
      const freshEm = orm.em.fork();
      const updated = await freshEm.findOneOrFail(OutboxEvent, event.id);
      expect(updated.status).toBe(OutboxStatus.PENDING);
      expect(updated.retryCount).toBe(1);
      expect(updated.errorMessage).toBe('Test error');
    });

    it('should mark as FAILED when max retries exceeded', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Arrange
      const event = em.create(OutboxEvent, {
        id: createId(),
        aggregateType: 'Organization',
        aggregateId: 'org_123',
        eventType: 'organization.provisioned',
        payload: { test: true },
        status: OutboxStatus.PROCESSING,
        retryCount: 4,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.persistAndFlush(event);

      // Act
      await service.markFailed('public', event.id, 'Final error', 5);

      // Assert - need fresh em to see the changes
      const freshEm = orm.em.fork();
      const updated = await freshEm.findOneOrFail(OutboxEvent, event.id);
      expect(updated.status).toBe(OutboxStatus.FAILED);
      expect(updated.retryCount).toBe(5);
    });
  });

  describe('getActiveSchemas', () => {
    it('should return schema names for READY organizations', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Arrange - create an organization directly
      const { Organization, ProvisioningStatus, SubscriptionTier, SubscriptionStatus, EnforcementMode } = await import('../entities/Organization.js');
      const org = em.create(Organization, {
        id: createId(),
        name: 'Test Org',
        slug: 'test-org',
        schemaName: 'tenant_test_org',
        provisioningStatus: ProvisioningStatus.READY,
        clerkOrgId: 'clerk_123',
        cellId: 'cell_1',
        subscriptionTier: SubscriptionTier.STARTER,
        subscriptionStatus: SubscriptionStatus.TRIALING,
        regulatoryAdvisorEnabled: true,
        enforcementMode: EnforcementMode.SILENT,
        captureComplianceInSilentMode: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.persistAndFlush(org);

      // Act
      const schemas = await service.getActiveSchemas();

      // Assert
      expect(schemas).toContain('tenant_test_org');
    });

    it('should not return schemas for non-READY organizations', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Arrange
      const { Organization, ProvisioningStatus, SubscriptionTier, SubscriptionStatus, EnforcementMode } = await import('../entities/Organization.js');
      const org = em.create(Organization, {
        id: createId(),
        name: 'Pending Org',
        slug: 'pending-org',
        schemaName: 'tenant_pending_org',
        provisioningStatus: ProvisioningStatus.PENDING,
        clerkOrgId: 'clerk_456',
        cellId: 'cell_1',
        subscriptionTier: SubscriptionTier.STARTER,
        subscriptionStatus: SubscriptionStatus.TRIALING,
        regulatoryAdvisorEnabled: true,
        enforcementMode: EnforcementMode.SILENT,
        captureComplianceInSilentMode: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.persistAndFlush(org);

      // Act
      const schemas = await service.getActiveSchemas();

      // Assert
      expect(schemas).not.toContain('tenant_pending_org');
    });
  });

  describe('processEvent', () => {
    it('should process event and mark as COMPLETED when handler succeeds', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Arrange
      const event = em.create(OutboxEvent, {
        id: createId(),
        aggregateType: 'Organization',
        aggregateId: 'org_123',
        eventType: 'organization.provisioned',
        payload: { organizationId: 'org_123', schemaName: 'tenant_test', name: 'Test' },
        status: OutboxStatus.PENDING,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.persistAndFlush(event);

      // Act
      const result = await service.processEvent('public', event.id);

      // Assert
      expect(result.success).toBe(true);
      const updated = await em.findOneOrFail(OutboxEvent, event.id);
      expect(updated.status).toBe(OutboxStatus.COMPLETED);
    });

    it('should skip event with no registered handler and mark as COMPLETED', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Arrange
      const event = em.create(OutboxEvent, {
        id: createId(),
        aggregateType: 'Unknown',
        aggregateId: 'unknown_123',
        eventType: 'unknown.event.type',
        payload: {},
        status: OutboxStatus.PENDING,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.persistAndFlush(event);

      // Act
      const result = await service.processEvent('public', event.id);

      // Assert
      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      const updated = await em.findOneOrFail(OutboxEvent, event.id);
      expect(updated.status).toBe(OutboxStatus.COMPLETED);
    });
  });

  describe('processBatch', () => {
    it('should process multiple pending events in a schema', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Arrange - create 3 events
      for (let i = 0; i < 3; i++) {
        const event = em.create(OutboxEvent, {
          id: createId(),
          aggregateType: 'Organization',
          aggregateId: `org_${i}`,
          eventType: 'organization.provisioned',
          payload: { organizationId: `org_${i}`, schemaName: `tenant_${i}`, name: `Test ${i}` },
          status: OutboxStatus.PENDING,
          retryCount: 0,
          createdAt: new Date(Date.now() + i), // Ensure ordering
          updatedAt: new Date(),
        });
        await em.persistAndFlush(event);
      }

      // Act
      const results = await service.processBatch('public', 10);

      // Assert
      expect(results.processed).toBe(3);
      expect(results.failed).toBe(0);

      const remaining = await em.count(OutboxEvent, { status: OutboxStatus.PENDING });
      expect(remaining).toBe(0);
    });

    it('should respect batch size limit', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      // Arrange - create 5 events
      for (let i = 0; i < 5; i++) {
        const event = em.create(OutboxEvent, {
          id: createId(),
          aggregateType: 'Organization',
          aggregateId: `org_${i}`,
          eventType: 'organization.provisioned',
          payload: { organizationId: `org_${i}`, schemaName: `tenant_${i}`, name: `Test ${i}` },
          status: OutboxStatus.PENDING,
          retryCount: 0,
          createdAt: new Date(Date.now() + i),
          updatedAt: new Date(),
        });
        await em.persistAndFlush(event);
      }

      // Act - process only 2
      const results = await service.processBatch('public', 2);

      // Assert
      expect(results.processed).toBe(2);
      const remaining = await em.count(OutboxEvent, { status: OutboxStatus.PENDING });
      expect(remaining).toBe(3);
    });
  });

  describe('processAllSchemas', () => {
    it('should process public schema events', async (context) => {
      if (!(await isDatabaseAvailable())) {
        context.skip();
        return;
      }

      const event = em.create(OutboxEvent, {
        id: createId(),
        aggregateType: 'Organization',
        aggregateId: 'org_123',
        eventType: 'organization.provisioned',
        payload: { organizationId: 'org_123', schemaName: 'tenant_test', name: 'Test' },
        status: OutboxStatus.PENDING,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await em.persistAndFlush(event);

      const results = await service.processAllSchemas(10);

      expect(results.public.processed).toBe(1);
    });
  });
});
