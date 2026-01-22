import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { initOrm, TenantProvisioner } from '@eurocomply/database';
import { createWebhooksRouter } from './routes/webhooks.js';
import { createOrganizationsAdminRouter } from './routes/organizations.js';

async function main() {
  const port = parseInt(process.env['PORT'] ?? '3001', 10);

  console.log('Initializing database connection...');
  const orm = await initOrm();

  console.log('Creating tenant provisioner...');
  const provisioner = new TenantProvisioner(orm);

  console.log('Creating webhooks router...');
  const webhooksRouter = createWebhooksRouter({
    orm,
    provisioner,
    webhookSecret: process.env['CLERK_WEBHOOK_SECRET'],
    // clerk: createClerkClient({ secretKey: process.env['CLERK_SECRET_KEY'] }), // Add when needed
  });

  console.log('Creating admin router...');
  const organizationsAdminRouter = createOrganizationsAdminRouter({
    orm,
    provisioner,
  });

  console.log('Creating app...');
  const app = createApp({ webhooksRouter, organizationsAdminRouter });

  console.log(`Starting server on port ${port}...`);

  serve({
    fetch: app.fetch,
    port,
  });

  console.log(`Server running at http://localhost:${port}`);
  console.log(`Webhook endpoint: http://localhost:${port}/webhooks/clerk`);
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
