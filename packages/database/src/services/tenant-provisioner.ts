import { MikroORM } from '@mikro-orm/postgresql';
import { tenantConfig } from '../mikro-orm.config.js';

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
   * Creates a new PostgreSQL schema for a tenant.
   */
  async createSchema(schemaName: string): Promise<void> {
    // Validate schema name format
    if (!this.isValidSchemaName(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}. Must match tenant_[a-z0-9_]+`);
    }

    await this.orm.em.execute(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
  }

  /**
   * Runs all migrations in the specified tenant schema.
   * Creates ONLY tenant entity tables (Product, Category, etc.) in the specified schema.
   */
  async runMigrations(schemaName: string): Promise<void> {
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

    // Set search_path to the tenant schema FIRST (for table creation),
    // followed by public (so extension types like ltree are visible)
    await this.orm.em.execute(`SET search_path TO "${schemaName}", public`);

    try {
      // Execute the DDL statements in the tenant schema context
      await this.orm.em.execute(ddl);
    } finally {
      // Always reset search_path to public
      await this.orm.em.execute('SET search_path TO "public"');
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
    if (!this.isValidSchemaName(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    await this.orm.em.execute(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  }

  /**
   * Validates that a schema name follows the tenant naming convention.
   */
  private isValidSchemaName(schemaName: string): boolean {
    return /^tenant_[a-z0-9_]+$/.test(schemaName);
  }
}
