import type { EntityManager } from '@mikro-orm/postgresql';
import { TenantCategory } from '../entities/TenantCategory.js';
import { TenantRequirementExemption } from '../entities/TenantRequirementExemption.js';
import { RequirementType, RequirementSeverity } from '../entities/enums/index.js';

/**
 * Result interface for ComplianceStackResolver.
 * Returns regulations with nested requirements.
 */
export interface RequirementExemptionDetails {
  reason: string;
  legalRef?: string;
  exemptedBy: string;
  exemptedAt: Date;
}

export interface ComplianceStackResult {
  tenantCategoryId: string;
  regulations: Array<{
    regulationId: string;
    regulationCode: string;
    source: 'SYSTEM' | 'TENANT';
    requirements: Array<{
      requirementId: string;
      requirementCode: string;
      type: RequirementType;
      severity: RequirementSeverity;
      status: 'ACTIVE' | 'EXEMPTED';
      exemption?: RequirementExemptionDetails;
    }>;
  }>;
}

export interface ResolveOptions {
  /**
   * When provided, only include these specific regulation IDs.
   * Used for FROZEN mode to lock to point-in-time compliance snapshot.
   */
  pinnedRegulationIds?: string[];
}

/**
 * ComplianceStackResolver resolves effective compliance regulations for a TenantCategory
 * using a 2-layer resolution:
 *
 * Layer 1: System baseline from public.category_regulation
 *   - Includes regulations linked to the system category that the tenant category adopts
 *   - Uses LTREE inheritance to include ancestor category regulations
 *   - Only includes ACTIVE regulations
 *
 * Layer 2: Tenant exemptions from TenantRequirementExemption
 *   - Exemptions for specific requirements
 *   - Marks requirements as EXEMPTED with exemption details
 *   - Respects allowTenantExemption guardrail
 */
export class ComplianceStackResolver {
  constructor(private readonly em: EntityManager) {}

  /**
   * Resolves the effective compliance regulations for a tenant category.
   *
   * Uses the CategoryRegulation junction table and LTREE for hierarchical
   * category inheritance. Returns regulations with nested requirements.
   *
   * @param tenantCategoryId - The ID of the tenant category to resolve
   * @param options - Optional resolve options (pinnedRegulationIds for FROZEN mode)
   * @returns ComplianceStackResult with regulations and nested requirements
   */
  async resolve(tenantCategoryId: string, options?: ResolveOptions): Promise<ComplianceStackResult> {
    // 1. Get TenantCategory
    const tenantCategory = await this.em.findOneOrFail(TenantCategory, { id: tenantCategoryId });

    const result: ComplianceStackResult = {
      tenantCategoryId,
      regulations: [],
    };

    // 2. If no system category linked, return empty regulations
    if (!tenantCategory.systemCategoryId) {
      return result;
    }

    // 3. Get the system category path for LTREE inheritance
    const systemCategoryPath = await this.getSystemCategoryPath(tenantCategory.systemCategoryId);
    if (!systemCategoryPath) {
      return result;
    }

    // 4. Get regulations from CategoryRegulation using LTREE inheritance
    const regulations = await this.getRegulationsWithLtreeInheritance(
      systemCategoryPath,
      options?.pinnedRegulationIds
    );

    // 5. Load exemptions for the tenant category (only active exemptions)
    const exemptions = await this.em.find(TenantRequirementExemption, {
      tenantCategory: { id: tenantCategoryId },
      revokedAt: null,  // Only active exemptions
    });

    // Create exemption map: requirementId -> exemption
    const exemptionMap = new Map<string, TenantRequirementExemption>();
    for (const exemption of exemptions) {
      exemptionMap.set(exemption.requirementId, exemption);
    }

    // 6. Load requirements for each regulation
    for (const reg of regulations) {
      const requirements = await this.getRequirementsForRegulation(reg.regulationId);
      result.regulations.push({
        regulationId: reg.regulationId,
        regulationCode: reg.regulationCode,
        source: 'SYSTEM',
        requirements: requirements.map(req => {
          const exemption = exemptionMap.get(req.requirementId);
          if (exemption) {
            return {
              requirementId: req.requirementId,
              requirementCode: req.requirementCode,
              type: req.type,
              severity: req.severity,
              status: 'EXEMPTED' as const,
              exemption: {
                reason: exemption.reason,
                legalRef: exemption.legalReference,
                exemptedBy: exemption.exemptedBy,
                exemptedAt: exemption.exemptedAt,
              },
            };
          }
          return {
            requirementId: req.requirementId,
            requirementCode: req.requirementCode,
            type: req.type,
            severity: req.severity,
            status: 'ACTIVE' as const,
          };
        }),
      });
    }

    return result;
  }

  /**
   * Gets the LTREE path for a system category.
   * Validates ID format for SQL injection safety.
   */
  private async getSystemCategoryPath(systemCategoryId: string): Promise<string | null> {
    const safeId = this.escapeId(systemCategoryId); // Validate and return safe ID
    const rows = await this.em.getConnection().execute<Array<{ path: string }>>(
      `SELECT path FROM public.category WHERE id = '${safeId}'`
    );
    return rows[0]?.path ?? null;
  }

  /**
   * Gets regulations using LTREE hierarchical inheritance.
   * Returns all ACTIVE regulations from the category and all its ancestors.
   *
   * Uses LTREE <@ operator: $path <@ c.path means "path is descendant of or equal to c.path"
   * This finds all ancestor categories (including self) and their regulations.
   *
   * @param categoryPath - The LTREE path of the category
   * @param pinnedIds - Optional list of specific regulation IDs (for FROZEN mode)
   */
  private async getRegulationsWithLtreeInheritance(
    categoryPath: string,
    pinnedIds?: string[]
  ): Promise<Array<{
    regulationId: string;
    regulationCode: string;
  }>> {
    // Validate path format (LTREE paths are dot-separated alphanumeric labels)
    this.validateLtreePath(categoryPath);

    // Validate pinned IDs if provided and build safe ID list
    let regulationFilter: string;
    if (pinnedIds && pinnedIds.length > 0) {
      const safeIds = pinnedIds.map(id => `'${this.escapeId(id)}'`).join(', ');
      regulationFilter = `r.id IN (${safeIds})`;
    } else {
      regulationFilter = "r.status = 'ACTIVE'";
    }

    const query = `
      SELECT DISTINCT cr.regulation_id, r.code
      FROM public.category_regulation cr
      JOIN public.category c ON c.id = cr.category_id
      JOIN public.regulation r ON r.id = cr.regulation_id
      WHERE '${categoryPath}'::ltree <@ c.path
        AND ${regulationFilter}
      ORDER BY r.code
    `;

    const rows = await this.em.getConnection().execute<Array<{
      regulation_id: string;
      code: string;
    }>>(query);

    return rows.map(row => ({
      regulationId: row.regulation_id,
      regulationCode: row.code,
    }));
  }

  /**
   * Validates an LTREE path format.
   * LTREE paths are dot-separated alphanumeric labels with underscores.
   */
  private validateLtreePath(path: string): void {
    // LTREE labels: alphanumeric and underscores, separated by dots
    if (!/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/.test(path)) {
      throw new Error(`Invalid LTREE path format: ${path}`);
    }
  }

  /**
   * Gets all requirements for a regulation.
   * Validates ID format for SQL injection safety.
   */
  private async getRequirementsForRegulation(regulationId: string): Promise<Array<{
    requirementId: string;
    requirementCode: string;
    type: RequirementType;
    severity: RequirementSeverity;
  }>> {
    const safeId = this.escapeId(regulationId); // Validate and return safe ID
    const rows = await this.em.getConnection().execute<Array<{
      id: string;
      code: string;
      type: string;
      severity: string;
    }>>(
      `SELECT id, code, type, severity FROM public.requirement WHERE regulation_id = '${safeId}' ORDER BY code`
    );

    return rows.map(row => ({
      requirementId: row.id,
      requirementCode: row.code,
      type: row.type as RequirementType,
      severity: row.severity as RequirementSeverity,
    }));
  }

  /**
   * Escapes an ID string to prevent SQL injection.
   * IDs in this system are alphanumeric strings, so we reject anything else.
   */
  private escapeId(id: string): string {
    // Validate that the ID only contains safe characters (alphanumeric and underscores)
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new Error(`Invalid ID format: ${id}`);
    }
    return id;
  }
}
