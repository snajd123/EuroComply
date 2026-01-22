#!/usr/bin/env npx tsx
/**
 * Test real Clerk webhook by creating an organization via Clerk API.
 * This triggers a real organization.created webhook from Clerk.
 *
 * Usage: pnpm test:webhook
 *
 * Prerequisites:
 * - Server running with ngrok tunnel (pnpm dev:tunnel)
 * - Clerk webhook endpoint configured to your ngrok URL
 * - CLERK_SECRET_KEY in .env
 */

import { createClerkClient } from '@clerk/backend';

async function main() {
  const secretKey = process.env['CLERK_SECRET_KEY'];

  if (!secretKey) {
    console.error('❌ CLERK_SECRET_KEY not found in environment');
    console.error('   Make sure .env file exists with CLERK_SECRET_KEY');
    process.exit(1);
  }

  const clerk = createClerkClient({ secretKey });
  const orgName = `Test Org ${Date.now()}`;

  console.log('🚀 Testing Clerk Webhook Integration\n');

  try {
    // Create organization via Clerk API
    console.log('📤 Creating organization via Clerk API...');
    console.log(`   Name: ${orgName}\n`);

    const org = await clerk.organizations.createOrganization({
      name: orgName,
    });

    console.log('✅ Organization created in Clerk:');
    console.log(`   ID: ${org.id}`);
    console.log(`   Name: ${org.name}\n`);

    console.log('⏳ Webhook should be sent to your server...');
    console.log('   Check your server logs for the webhook processing.\n');

    // Wait for webhook to be processed and tenant provisioned
    console.log('⏳ Waiting 5 seconds for provisioning to complete...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check if org was created in our database via admin endpoint
    console.log('🔍 Checking local database...');
    const response = await fetch(`http://localhost:3001/api/v1/admin/organizations/${org.id}/status`);

    if (response.ok) {
      const data = await response.json() as { name: string; schemaName: string; provisioningStatus: string };
      console.log('✅ Organization found in local database:');
      console.log(`   Name: ${data.name}`);
      console.log(`   Schema: ${data.schemaName}`);
      console.log(`   Status: ${data.provisioningStatus}\n`);

      if (data.provisioningStatus === 'READY') {
        console.log('🎉 Webhook integration working! Tenant fully provisioned.\n');
      } else {
        console.log(`⚠️  Provisioning status: ${data.provisioningStatus}\n`);
      }
    } else if (response.status === 404) {
      console.log('⚠️  Organization not found in local database yet.');
      console.log('   The webhook may still be processing, or there may be an issue.\n');
    } else {
      console.log('⚠️  Could not check local database (API returned error).\n');
    }

    // Cleanup - optionally delete the test organization
    const skipCleanup = process.argv.includes('--no-cleanup');
    if (skipCleanup) {
      console.log('⏭️  Skipping cleanup (--no-cleanup flag)');
      console.log(`   Org remains in Clerk: ${org.id}\n`);
    } else {
      console.log('🧹 Cleaning up test organization from Clerk...');
      await clerk.organizations.deleteOrganization(org.id);
      console.log('✅ Test organization deleted from Clerk.\n');
      console.log('📝 Note: Local database record remains for inspection.');
      console.log('   Run pnpm db:reset to clear all test data.\n');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
