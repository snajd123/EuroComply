// packages/database/src/seed/ManifestLoader.ts
import type { EntityManager } from '@mikro-orm/postgresql';
import { Regulation } from '../entities/Regulation.js';
import { Requirement } from '../entities/Requirement.js';
import { Category } from '../entities/Category.js';
import { CategoryRegulation } from '../entities/CategoryRegulation.js';
import type { RequirementHandlerConfig } from '../entities/Requirement.js';
import type { MigrationManifest, ManifestRegulation, ManifestRequirement, ManifestCategoryMapping } from './types.js';

/**
 * ManifestLoader loads regulatory content from JSON manifests into the database.
 *
 * This keeps the engine AGNOSTIC - the code knows HOW to load,
 * the manifest JSON defines WHAT to load.
 */
export class ManifestLoader {
  constructor(private readonly em: EntityManager) {}

  async loadManifest(manifest: MigrationManifest): Promise<LoadResult> {
    const result: LoadResult = {
      regulationsCreated: 0,
      regulationsSkipped: 0,
      requirementsCreated: 0,
      mappingsCreated: 0,
    };

    for (const regManifest of manifest.regulations) {
      const created = await this.loadRegulation(regManifest);
      if (created) {
        result.regulationsCreated++;
        result.requirementsCreated += regManifest.requirements.length;
      } else {
        result.regulationsSkipped++;
      }
    }

    if (manifest.categoryMappings) {
      for (const mapping of manifest.categoryMappings) {
        const created = await this.loadCategoryMapping(mapping);
        if (created) {
          result.mappingsCreated++;
        }
      }
    }

    return result;
  }

  private async loadRegulation(manifest: ManifestRegulation): Promise<boolean> {
    const existing = await this.em.findOne(Regulation, { code: manifest.code });
    if (existing) {
      return false;
    }

    const regulation = new Regulation();
    regulation.code = manifest.code;
    regulation.name = manifest.name;
    regulation.description = manifest.description;
    regulation.status = manifest.status;
    if (manifest.version) regulation.version = manifest.version;
    if (manifest.effectiveDate) regulation.effectiveDate = new Date(manifest.effectiveDate);
    if (manifest.metadata) regulation.metadata = manifest.metadata;
    this.em.persist(regulation);

    for (const reqManifest of manifest.requirements) {
      await this.loadRequirement(reqManifest, regulation);
    }

    await this.em.persistAndFlush(regulation);
    return true;
  }

  private async loadRequirement(manifest: ManifestRequirement, regulation: Regulation): Promise<void> {
    let substanceListId: string | undefined;
    if (manifest.substanceListCode) {
      const substanceList = await this.em.findOne(
        'RegulatoryList',
        { code: manifest.substanceListCode },
        { schema: 'public' }
      );
      if (substanceList) {
        substanceListId = (substanceList as { id: string }).id;
      }
    }

    const requirement = new Requirement();
    requirement.regulation = regulation;
    requirement.code = manifest.code;
    requirement.name = manifest.name;
    requirement.description = manifest.description;
    requirement.type = manifest.type;
    requirement.severity = manifest.severity;
    if (manifest.attributeTemplateKey) requirement.attributeTemplateKey = manifest.attributeTemplateKey;
    if (substanceListId) requirement.substanceListId = substanceListId;
    if (manifest.calculationFormula) requirement.calculationFormula = manifest.calculationFormula;
    if (manifest.handlerConfig) requirement.handlerConfig = manifest.handlerConfig as RequirementHandlerConfig;
    if (manifest.legalReference) requirement.legalReference = manifest.legalReference;
    requirement.allowTenantExemption = manifest.allowTenantExemption ?? true;

    this.em.persist(requirement);
  }

  private async loadCategoryMapping(manifest: ManifestCategoryMapping): Promise<boolean> {
    const category = await this.em.findOne(Category, { path: manifest.categoryPath });
    if (!category) {
      return false;
    }

    const regulation = await this.em.findOne(Regulation, { code: manifest.regulationCode });
    if (!regulation) {
      return false;
    }

    const existing = await this.em.findOne(CategoryRegulation, { category, regulation });
    if (existing) {
      return false;
    }

    const mapping = new CategoryRegulation();
    mapping.category = category;
    mapping.regulation = regulation;
    mapping.addedBy = 'manifest-loader';

    await this.em.persistAndFlush(mapping);
    return true;
  }
}

export interface LoadResult {
  regulationsCreated: number;
  regulationsSkipped: number;
  requirementsCreated: number;
  mappingsCreated: number;
}
