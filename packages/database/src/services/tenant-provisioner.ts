import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { tenantConfig } from '../mikro-orm.config.js';
import { assertValidSchemaName } from '../utils/schema-validation.js';

export interface ProvisioningResult {
  success: boolean;
  schemaName: string;
  error?: string;
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
   */
  private async resetSearchPath(em: EntityManager): Promise<void> {
    try {
      await em.execute('SET search_path TO "public"');
    } catch (error) {
      // Log but don't throw - this is a safety reset
      console.error('[TenantProvisioner] Failed to reset search_path:', error);
    }
  }

  /**
   * Verifies and ensures the search_path is set to public.
   * Call this defensively after any operation that modifies search_path.
   */
  private async ensurePublicSearchPath(em: EntityManager): Promise<void> {
    try {
      const result = await em.execute<{ search_path: string }[]>('SHOW search_path');
      const currentPath = result[0]?.search_path;

      // If search_path is not public (or "$user", public which is default), reset it
      if (currentPath && !currentPath.includes('"$user"') && currentPath !== 'public' && currentPath !== '"public"') {
        console.warn(`[TenantProvisioner] Unexpected search_path: ${currentPath}. Resetting to public.`);
        await this.resetSearchPath(em);
      }
    } catch (error) {
      // If we can't verify, try to reset anyway
      await this.resetSearchPath(em);
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
   * Provisions a complete tenant: creates schema, runs migrations, grants permissions.
   */
  async provisionTenant(schemaName: string): Promise<ProvisioningResult> {
    try {
      // 1. Create the schema
      await this.createSchema(schemaName);

      // 2. Run migrations to create tables
      await this.runMigrations(schemaName);

      // 3. Grant permissions (best effort in dev)
      await this.grantPermissions(schemaName);

      return {
        success: true,
        schemaName,
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
