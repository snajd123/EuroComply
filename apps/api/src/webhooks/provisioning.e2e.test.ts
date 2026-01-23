import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { createWebhooksRouter } from '../routes/webhooks.js';
import {
  Organization,
  TenantProvisioner,
  ProvisioningStatus,
} from '@eurocomply/database';
import { setupTestDb, teardownTestDb, isDatabaseAvailable } from '@eurocomply/database/test-utils';

describe('Tenant Provisioning E2E', () => {
  let orm: Awaited<ReturnType<typeof setupTestDb>>;
  let provisioner: TenantProvisioner;
  let app: ReturnType<typeof createApp>;
  // Schema name derived from ZITADEL org ID: '123456789012345678' -> 'tenant_org_12345678'
  const testOrgId = '123456789012345678';
  const testSchema = 'tenant_org_12345678';

  beforeAll(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    orm = await setupTestDb();
    provisioner = new TenantProvisioner(orm);

    const webhooksRouter = createWebhooksRouter({
      orm,
      provisioner,
      webhookSigningKey: 'test-signing-key',
      skipSignatureVerification: true,
    });

    app = createApp({ webhooksRouter });
  });

  afterAll(async () => {
    if (orm) {
      // Cleanup test schema
      try {
        await orm.em.execute(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
      } catch {
        // Ignore
      }
      await teardownTestDb();
    }
  });

  beforeEach(async () => {
    if (!(await isDatabaseAvailable())) {
      return;
    }
    // Clean up test org if exists
    const em = orm.em.fork();
    const existingOrg = await em.findOne(Organization, { slug: 'e2e-test-org' });
    if (existingOrg) {
      em.remove(existingOrg);
      await em.flush();
    }
  });

  it('provisions tenant on org.created webhook', async (context) => {
    if (!(await isDatabaseAvailable())) {
      context.skip();
      return;
    }

    const res = await app.request('/webhooks/zitadel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': `req_e2e_test_${Date.now()}`,
      },
      body: JSON.stringify({
        type: 'org.created',
        data: {
          orgId: testOrgId,
          name: 'E2E Test Org',
        },
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json() as { success: boolean; schemaName: string };
    expect(data.success).toBe(true);
    expect(data.schemaName).toBe(testSchema);

    // Verify organization was created
    const em = orm.em.fork();
    const org = await em.findOne(Organization, { slug: 'e2e-test-org' });
    expect(org).not.toBeNull();
    expect(org!.provisioningStatus).toBe(ProvisioningStatus.READY);
    expect(org!.schemaName).toBe(testSchema);

    // Verify schema was created with tables
    const tables = await orm.em.execute<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = '${testSchema}'`
    );
    expect(tables.length).toBeGreaterThan(0);
  });
});
