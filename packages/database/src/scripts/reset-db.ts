/**
 * Database reset script - recreates public schema tables.
 * Tenant schemas are created dynamically via TenantProvisioner.
 *
 * Usage: npx tsx src/scripts/reset-db.ts
 */
import { MikroORM } from '@mikro-orm/postgresql';
import config from '../mikro-orm.config.js';
import { TenantProvisioner } from '../services/tenant-provisioner.js';

async function main() {
  const dbName = process.env['DATABASE_NAME'] ?? 'eurocomply_test';
  const port = parseInt(process.env['DATABASE_PORT'] ?? '5433', 10);

  console.log(`Connecting to ${dbName} on port ${port}...`);

  const orm = await MikroORM.init({
    ...config,
    dbName,
    port,
    user: process.env['DATABASE_USER'] ?? 'postgres',
    password: process.env['DATABASE_PASSWORD'] ?? 'postgres',
    allowGlobalContext: true,
  });

  const generator = orm.getSchemaGenerator();

  // Ensure database exists
  await generator.ensureDatabase();

  // Install ltree extension
  console.log('Installing ltree extension...');
  await orm.em.execute('CREATE EXTENSION IF NOT EXISTS ltree');

  // Create/update public schema tables
  console.log('Creating/updating public schema tables...');
  await generator.updateSchema({ schema: 'public' });

  // Show what was created
  const tables = await orm.em.execute<{ table_name: string }[]>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);

  console.log('\nPublic schema tables:');
  tables.forEach((t) => console.log(`  - ${t.table_name}`));

  // Test tenant provisioning
  console.log('\n--- Testing Tenant Provisioning ---');
  const provisioner = new TenantProvisioner(orm);

  const testSchema = 'tenant_test_verify';
  console.log(`Provisioning test tenant: ${testSchema}`);

  const result = await provisioner.provisionTenant(testSchema);

  if (result.success) {
    console.log('✓ Tenant provisioning successful!');

    const status = await provisioner.getSchemaStatus(testSchema);
    console.log(`  Tables created: ${status.tableCount}/${status.expectedTableCount}`);

    if (status.missingTables.length > 0) {
      console.log(`  Missing: ${status.missingTables.join(', ')}`);
    }

    // Clean up test tenant
    console.log(`Dropping test tenant: ${testSchema}`);
    await provisioner.dropSchema(testSchema);
    console.log('✓ Test tenant dropped');
  } else {
    console.error('✗ Tenant provisioning failed:', result.error);
  }

  await orm.close();
  console.log('\n✓ Database ready!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
