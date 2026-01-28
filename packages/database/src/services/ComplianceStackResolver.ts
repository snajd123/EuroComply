import type { EntityManager } from '@mikro-orm/postgresql';
import { TenantCategory } from '../entities/TenantCategory.js';
import { TenantCategoryRegulatoryList } from '../entities/TenantCategoryRegulatoryList.js';
import { TenantRequirementExemption } from '../entities/TenantRequirementExemption.js';
import { ListRequirement, RegulationSource, RequirementType, RequirementSeverity } from '../entities/enums/index.js';

export interface EffectiveRegulation {
  regulatoryListId: string;
  regulatoryListCode: string;
  source: 'SYSTEM' | 'TENANT';
  requirement: ListRequirement;
  status: 'ACTIVE' | 'EXEMPTED';
  allowExemption: boolean;
  exemption?: {
    reason: string;
    legalRef?: string;
    exemptedBy: string;
    exemptedAt: Date;
  };
  overrideThreshold?: string;
}

export interface ComplianceStackResult {
  tenantCategoryId: string;
  tenantCategoryPath: string;
  systemCategoryId?: string;
  linkMode?: string;
  effectiveRegulations: EffectiveRegulation[];
}

/**
 * Result interface for the revised ComplianceStackResolver.
 * Uses CategoryRegulation junction table and returns regulations with nested requirements.
 */
export interface RequirementExemptionDetails {
  reason: string;
  legalRef?: string;
  exemptedBy: string;
  exemptedAt: Date;
}

export interface ComplianceStackResultRevised {
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
   * When provided, only include these specific regulatory list IDs.
   * Used for FROZEN mode to lock to point-in-time compliance snapshot.
   * These IDs may be historical versions (not necessarily is_current_version).
   */
  pinnedRegulatoryListIds?: string[];
}

/**
 * ComplianceStackResolver resolves effective compliance regulations for a TenantCategory
 * using a 3-layer resolution:
 *
 * Layer 1: System baseline from public.category_regulatory_list
 *   - Includes regulations linked to the system category that the tenant category adopts
 *   - Only includes current version regulatory lists
 *   - Excludes mappings marked as isExclusion: true
 *
 * Layer 2: Tenant additions from TenantCategoryRegulatoryList (source: TENANT_ADDED)
 *   - Tenant-specific regulations added beyond the system baseline
 *
 * Layer 3: Tenant exemptions from TenantCategoryRegulatoryList (isExempted: true)
 *   - Exemptions for system baseline regulations
 *   - Marks regulations as EXEMPTED with exemption details
 */
export class ComplianceStackResolver {
  constructor(private readonly em: EntityManager) {}

  /**
   * Resolves the effective compliance regulations for a tenant category.
   *
   * This revised implementation uses the CategoryRegulation junction table
   * and LTREE for hierarchical category inheritance. It returns regulations
   * with nested requirements.
   *
   * @param tenantCategoryId - The ID of the tenant category to resolve
   * @param _options - Optional resolve options (reserved for future use)
   * @returns ComplianceStackResultRevised with regulations and nested requirements
   */
  async resolve(tenantCategoryId: string, _options?: ResolveOptions): Promise<ComplianceStackResultRevised> {
    // 1. Get TenantCategory
    const tenantCategory = await this.em.findOneOrFail(TenantCategory, { id: tenantCategoryId });

    const result: ComplianceStackResultRevised = {
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
    const regulations = await this.getRegulationsWithLtreeInheritance(systemCategoryPath);

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
   * Legacy resolve method that returns the old ComplianceStackResult format.
   * Uses CategoryRegulatoryList (regulatory lists) instead of CategoryRegulation.
   *
   * @param tenantCategoryId - The ID of the tenant category to resolve
   * @param options - Optional resolve options (pinnedRegulatoryListIds for FROZEN mode)
   * @returns ComplianceStackResult with all effective regulations and their sources
   */
  async resolveLegacy(tenantCategoryId: string, options?: ResolveOptions): Promise<ComplianceStackResult> {
    // 1. Get TenantCategory
    const tenantCategory = await this.em.findOneOrFail(TenantCategory, { id: tenantCategoryId });

    const result: ComplianceStackResult = {
      tenantCategoryId,
      tenantCategoryPath: tenantCategory.path,
      systemCategoryId: tenantCategory.systemCategoryId ?? undefined,
      linkMode: tenantCategory.linkMode ?? undefined,
      effectiveRegulations: [],
    };

    // 2. Get system baseline (if adopted from system category)
    // For FROZEN mode, pass pinned IDs to filter to specific versions
    const systemBaseline = await this.getSystemBaseline(
      tenantCategory.systemCategoryId,
      options?.pinnedRegulatoryListIds
    );

    // 3. Get tenant records
    const tenantRecords = await this.em.find(TenantCategoryRegulatoryList, {
      tenantCategory: { id: tenantCategoryId }
    });

    // 4. Merge into effective regulations
    const effectiveMap = new Map<string, EffectiveRegulation>();

    // Add system baseline first
    for (const baseline of systemBaseline) {
      effectiveMap.set(baseline.regulatoryListId, {
        ...baseline,
        source: 'SYSTEM',
        status: 'ACTIVE',
      });
    }

    // Apply tenant records (additions and exemptions)
    for (const record of tenantRecords) {
      if (record.source === RegulationSource.TENANT_ADDED) {
        // Tenant addition
        const listCode = await this.getListCode(record.regulatoryListId);
        effectiveMap.set(record.regulatoryListId, {
          regulatoryListId: record.regulatoryListId,
          regulatoryListCode: listCode,
          source: 'TENANT',
          requirement: record.requirement,
          status: 'ACTIVE',
          allowExemption: true,
          overrideThreshold: record.overrideThreshold ?? undefined,
        });
      } else if (record.source === RegulationSource.INHERITED && record.isExempted) {
        // Exemption for system baseline
        const existing = effectiveMap.get(record.regulatoryListId);
        if (existing) {
          existing.status = 'EXEMPTED';
          existing.exemption = {
            reason: record.exemptionReason!,
            legalRef: record.exemptionLegalRef ?? undefined,
            exemptedBy: record.exemptedBy!,
            exemptedAt: record.exemptedAt!,
          };
        }
      }
    }

    result.effectiveRegulations = Array.from(effectiveMap.values());
    return result;
  }

  /**
   * Gets the LTREE path for a system category.
   */
  private async getSystemCategoryPath(systemCategoryId: string): Promise<string | null> {
    const escapedId = this.escapeId(systemCategoryId);
    const rows = await this.em.getConnection().execute<Array<{ path: string }>>(`
      SELECT path FROM public.category WHERE id = '${escapedId}'
    `);
    return rows[0]?.path ?? null;
  }

  /**
   * Gets regulations using LTREE hierarchical inheritance.
   * Returns all ACTIVE regulations from the category and all its ancestors.
   *
   * Uses LTREE <@ operator: $path <@ c.path means "path is descendant of or equal to c.path"
   * This finds all ancestor categories (including self) and their regulations.
   */
  private async getRegulationsWithLtreeInheritance(categoryPath: string): Promise<Array<{
    regulationId: string;
    regulationCode: string;
  }>> {
    // Escape the path for safe SQL interpolation
    const escapedPath = categoryPath.replace(/'/g, "''");

    const rows = await this.em.getConnection().execute<Array<{
      regulation_id: string;
      code: string;
    }>>(`
      SELECT DISTINCT cr.regulation_id, r.code
      FROM public.category_regulation cr
      JOIN public.category c ON c.id = cr.category_id
      JOIN public.regulation r ON r.id = cr.regulation_id
      WHERE '${escapedPath}'::ltree <@ c.path
        AND r.status = 'ACTIVE'
      ORDER BY r.code
    `);

    return rows.map(row => ({
      regulationId: row.regulation_id,
      regulationCode: row.code,
    }));
  }

  /**
   * Gets all requirements for a regulation.
   */
  private async getRequirementsForRegulation(regulationId: string): Promise<Array<{
    requirementId: string;
    requirementCode: string;
    type: RequirementType;
    severity: RequirementSeverity;
  }>> {
    const escapedId = this.escapeId(regulationId);
    const rows = await this.em.getConnection().execute<Array<{
      id: string;
      code: string;
      type: string;
      severity: string;
    }>>(`
      SELECT id, code, type, severity
      FROM public.requirement
      WHERE regulation_id = '${escapedId}'
      ORDER BY code
    `);

    return rows.map(row => ({
      requirementId: row.id,
      requirementCode: row.code,
      type: row.type as RequirementType,
      severity: row.severity as RequirementSeverity,
    }));
  }

  /**
   * Gets the system baseline regulations for a system category.
   *
   * For LIVE mode (pinnedIds undefined): includes current version regulatory lists
   * For FROZEN mode (pinnedIds provided): only includes specified regulatory list IDs
   *
   * @param systemCategoryId - The system category to get baseline for
   * @param pinnedIds - Optional list of specific regulatory list IDs (for FROZEN mode)
   */
  private async getSystemBaseline(
    systemCategoryId: string | null | undefined,
    pinnedIds?: string[]
  ): Promise<Array<{
    regulatoryListId: string;
    regulatoryListCode: string;
    requirement: ListRequirement;
    allowExemption: boolean;
    overrideThreshold?: string;
  }>> {
    if (!systemCategoryId) return [];

    // Using string interpolation for the ID since MikroORM's execute doesn't support $1 placeholders
    // The ID is a safe alphanumeric string generated by the ORM
    const escapedId = this.escapeId(systemCategoryId);

    // Build version filter based on mode
    let versionFilter: string;
    if (pinnedIds && pinnedIds.length > 0) {
      // FROZEN mode: filter to specific pinned IDs
      const escapedPinnedIds = pinnedIds.map(id => `'${this.escapeId(id)}'`).join(', ');
      versionFilter = `rl.id IN (${escapedPinnedIds})`;
    } else {
      // LIVE mode: use current versions only
      versionFilter = 'rl.is_current_version = true';
    }

    const rows = await this.em.getConnection().execute<Array<{
      regulatory_list_id: string;
      code: string;
      requirement: string;
      allow_tenant_exemption: boolean;
      compare_value_override: string | null;
    }>>(`
      SELECT crl.regulatory_list_id, rl.code, crl.requirement, crl.allow_tenant_exemption, crl.compare_value_override
      FROM public.category_regulatory_list crl
      JOIN public.regulatory_list rl ON rl.id = crl.regulatory_list_id
      WHERE crl.category_id = '${escapedId}'
        AND ${versionFilter}
        AND crl.is_exclusion = false
    `);

    return rows.map(row => ({
      regulatoryListId: row.regulatory_list_id,
      regulatoryListCode: row.code,
      requirement: row.requirement as ListRequirement,
      allowExemption: row.allow_tenant_exemption,
      overrideThreshold: row.compare_value_override ?? undefined,
    }));
  }

  /**
   * Gets the code for a regulatory list by ID.
   */
  private async getListCode(regulatoryListId: string): Promise<string> {
    const escapedId = this.escapeId(regulatoryListId);
    const [row] = await this.em.getConnection().execute<Array<{ code: string }>>(`
      SELECT code FROM public.regulatory_list WHERE id = '${escapedId}'
    `);
    return row?.code ?? 'UNKNOWN';
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
