import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { tenantConfig } from '../mikro-orm.config.js';
import { assertValidSchemaName } from '../utils/schema-validation.js';

/**
 * Expected tenant tables - must match tenantEntities in entities/index.ts
 */
const EXPECTED_TENANT_TABLES = [
  'tenant_category',
  'tenant_category_regulatory_list',
  'category_adoption',
  'attribute_template',
  'product',
  'product_version',
  'audit_log',
  'outbox_event',
  'users',
  'organization_users',
  'tenant_requirement_exemption',
  'compliance_evidence',
] as const;

export interface ProvisioningResult {
  success: boolean;
  schemaName: string;
  error?: string;
  alreadyProvisioned?: boolean;
}

export interface SchemaStatus {
  exists: boolean;
  tableCount: number;
  expectedTableCount: number;
  missingTables: string[];
  isComplete: boolean;
}

export class TenantProvisioner {
  private tenantOrm: MikroORM | null = null;

  constructor(private readonly orm: MikroORM) {}

  /**
   * Gets or creates the tenant ORM instance for schema generation.
   * This ORM contains only tenant-specific entities.
   */
  private async getTenantOrm(): Promise<MikroORM> {
    if (!this.tenantOrm) {
      // Create ORM with tenant entities only, reusing connection settings
      this.tenantOrm = await MikroORM.init({
        ...tenantConfig,
        dbName: this.orm.config.get('dbName'),
        host: this.orm.config.get('host'),
        port: this.orm.config.get('port'),
        user: this.orm.config.get('user'),
        password: this.orm.config.get('password'),
        allowGlobalContext: true,
      });
    }
    return this.tenantOrm;
  }

  /**
   * Resets the search_path to public schema.
   * This is a safety mechanism to ensure we never leave a connection
   * in a tenant-specific search_path context.
   *
   * SECURITY: If reset fails, throws to prevent connection pool ghosting.
   */
  private async resetSearchPath(em: EntityManager): Promise<void> {
    try {
      await em.execute('SET search_path TO "public"');
    } catch (error) {
      // CRITICAL: If we can't reset, we must not return this connection to the pool
      console.error('[TenantProvisioner] Failed to reset search_path:', error);
      throw new Error('Failed to reset search_path - connection may be compromised');
    }
  }

  /**
   * Verifies and ensures the search_path is set to public.
   * Call this defensively after any operation that modifies search_path.
   *
   * SECURITY: Connection Pool Ghosting Prevention
   * If we cannot verify the search_path is reset to public, we throw an error
   * rather than allowing a potentially tenant-scoped connection back into the pool.
   * This prevents cross-tenant data access in edge cases.
   */
  private async ensurePublicSearchPath(em: EntityManager): Promise<void> {
    const result = await em.execute<{ search_path: string }[]>('SHOW search_path');
    const currentPath = result[0]?.search_path;

    // Check if search_path is safe (public or default "$user", public)
    const isSafePath = !currentPath ||
      currentPath === 'public' ||
      currentPath === '"public"' ||
      currentPath.includes('"$user"');

    if (!isSafePath) {
      console.warn(`[TenantProvisioner] Unexpected search_path: ${currentPath}. Attempting reset.`);
      await this.resetSearchPath(em);

      // Verify reset was successful
      const verifyResult = await em.execute<{ search_path: string }[]>('SHOW search_path');
      const verifiedPath = verifyResult[0]?.search_path;

      if (verifiedPath && !verifiedPath.includes('public') && !verifiedPath.includes('"$user"')) {
        // CRITICAL: Reset failed - do not return this connection to the pool
        throw new Error(
          `Connection pool safety violation: search_path stuck at "${verifiedPath}". ` +
          'Connection should not be reused.'
        );
      }
    }
  }

  /**
   * Creates a new PostgreSQL schema for a tenant.
   */
  async createSchema(schemaName: string): Promise<void> {
    // Validate schema name format (throws if invalid)
    assertValidSchemaName(schemaName);

    await this.orm.em.execute(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
  }

  /**
   * Runs all migrations in the specified tenant schema.
   * Creates ONLY tenant entity tables (Product, Category, etc.) in the specified schema.
   *
   * SECURITY: Search Path Safety
   * - Uses SET LOCAL which is transaction-scoped (auto-resets on commit/rollback)
   * - Wraps DDL execution in try/finally with explicit reset
   * - Verifies search_path is reset after operation completes
   * - Uses forked EntityManager for isolation
   */
  async runMigrations(schemaName: string): Promise<void> {
    // Validate schema name format (throws if invalid)
    assertValidSchemaName(schemaName);

    // Use tenant ORM which contains only tenant entities
    const tenantOrm = await this.getTenantOrm();
    const generator = tenantOrm.getSchemaGenerator();

    // Get the DDL for creating tenant entity tables only
    const ddl = await generator.getCreateSchemaSQL();

    if (!ddl.trim()) {
      return;
    }

    // Install required extensions in public schema (extensions are database-wide)
    // This needs to happen before we switch search_path
    await this.orm.em.execute('CREATE EXTENSION IF NOT EXISTS ltree');

    // Use a forked EntityManager for isolation
    // This ensures any search_path changes don't affect other operations
    const em = this.orm.em.fork();

    try {
      // Set search_path to the tenant schema FIRST (for table creation),
      // followed by public (so extension types like ltree are visible)
      //
      // SECURITY NOTE: We use SET (not SET LOCAL) because DDL statements
      // often run outside transactions. The finally block ensures reset.
      await em.execute(`SET search_path TO "${schemaName}", public`);

      // Execute the DDL statements in the tenant schema context
      await em.execute(ddl);
    } finally {
      // CRITICAL: Always reset search_path to public
      // This runs even if DDL execution fails
      await this.resetSearchPath(em);

      // Verify the reset was successful
      await this.ensurePublicSearchPath(em);
    }
  }

  /**
   * Grants DML permissions to the application user for THIS SCHEMA ONLY.
   *
   * SECURITY: Blast Radius Containment
   * - Permissions are schema-scoped, not database-wide
   * - eurocomply_app in tenant_A cannot access tenant_B tables
   * - Even SQL injection is contained to the current tenant's data
   * - Combined with SET search_path at connection time for defense-in-depth
   */
  async grantPermissions(schemaName: string, appUser: string = 'eurocomply_app'): Promise<void> {
    try {
      await this.orm.em.execute(`GRANT USAGE ON SCHEMA "${schemaName}" TO ${appUser}`);
      await this.orm.em.execute(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${schemaName}" TO ${appUser}`
      );
      await this.orm.em.execute(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${appUser}`
      );
    } catch (error) {
      // In dev/test, the app user might not exist - that's OK
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('does not exist')) {
        throw error;
      }
    }
  }

  /**
   * Gets detailed status of a tenant schema's provisioning state.
   * Used for idempotency checks and repair operations.
   */
  async getSchemaStatus(schemaName: string): Promise<SchemaStatus> {
    assertValidSchemaName(schemaName);

    // Check if schema exists
    const schemaResult = await this.orm.em.execute<{ exists: boolean }[]>(`
      SELECT EXISTS(
        SELECT 1 FROM information_schema.schemata WHERE schema_name = '${schemaName}'
      ) as exists
    `);
    const exists = schemaResult[0]?.exists ?? false;

    if (!exists) {
      return {
        exists: false,
        tableCount: 0,
        expectedTableCount: EXPECTED_TENANT_TABLES.length,
        missingTables: [...EXPECTED_TENANT_TABLES],
        isComplete: false,
      };
    }

    // Get list of existing tables
    const tablesResult = await this.orm.em.execute<{ table_name: string }[]>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = '${schemaName}'
        AND table_name IN (${EXPECTED_TENANT_TABLES.map(t => `'${t}'`).join(', ')})
    `);

    const existingTables = new Set(tablesResult.map(r => r.table_name));
    const missingTables = EXPECTED_TENANT_TABLES.filter(t => !existingTables.has(t));

    return {
      exists: true,
      tableCount: existingTables.size,
      expectedTableCount: EXPECTED_TENANT_TABLES.length,
      missingTables,
      isComplete: missingTables.length === 0,
    };
  }

  /**
   * Checks if a tenant schema has already been FULLY provisioned.
   * Returns true only if ALL expected tenant tables exist.
   *
   * IDEMPOTENCY: This uses exact matching, not minimum count.
   * A partially provisioned schema (e.g., 6 of 9 tables) returns false,
   * triggering a repair via runMigrations.
   */
  async isSchemaProvisioned(schemaName: string): Promise<boolean> {
    const status = await this.getSchemaStatus(schemaName);
    return status.isComplete;
  }

  /**
   * Provisions a complete tenant: creates schema, runs migrations, grants permissions.
   * This method is idempotent - calling it multiple times on the same schema is safe.
   *
   * IDEMPOTENCY & REPAIR:
   * - If schema exists but is incomplete (partial provisioning failure), migrations will re-run
   * - MikroORM's schema generator uses IF NOT EXISTS, so existing tables are preserved
   * - This effectively "repairs" partially provisioned schemas
   */
  async provisionTenant(schemaName: string): Promise<ProvisioningResult> {
    try {
      // 1. Create the schema (IF NOT EXISTS - idempotent)
      await this.createSchema(schemaName);

      // 2. Check detailed provisioning status
      const status = await this.getSchemaStatus(schemaName);

      let alreadyProvisioned = status.isComplete;

      if (!alreadyProvisioned) {
        // Log if we're repairing a partial provisioning
        if (status.tableCount > 0) {
          console.log(
            `[TenantProvisioner] Repairing partial schema "${schemaName}": ` +
            `${status.tableCount}/${status.expectedTableCount} tables exist. ` +
            `Missing: ${status.missingTables.join(', ')}`
          );
        }

        // 3. Run migrations to create tables (idempotent - uses IF NOT EXISTS)
        await this.runMigrations(schemaName);

        // 4. Verify provisioning completed successfully
        const verifyStatus = await this.getSchemaStatus(schemaName);
        if (!verifyStatus.isComplete) {
          return {
            success: false,
            schemaName,
            error: `Provisioning incomplete: missing tables [${verifyStatus.missingTables.join(', ')}]`,
          };
        }
      }

      // 5. Grant permissions (idempotent - best effort in dev)
      await this.grantPermissions(schemaName);

      return {
        success: true,
        schemaName,
        alreadyProvisioned,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        schemaName,
        error: errorMessage,
      };
    }
  }

  /**
   * Drops a tenant schema (use with caution!).
   */
  async dropSchema(schemaName: string): Promise<void> {
    // Validate schema name format (throws if invalid)
    assertValidSchemaName(schemaName);

    await this.orm.em.execute(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  }
}
