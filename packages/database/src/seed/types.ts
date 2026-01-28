// packages/database/src/seed/types.ts
import { RegulationStatus, RequirementType, RequirementSeverity } from '../entities/enums/index.js';

export interface MigrationManifest {
  version: string;
  source?: string;
  regulations: ManifestRegulation[];
  categoryMappings?: ManifestCategoryMapping[];
}

export interface ManifestRegulation {
  code: string;
  name: string;
  description?: string;
  status: RegulationStatus;
  version?: string;
  effectiveDate?: string;
  metadata?: {
    jurisdiction?: string;
    type?: string;
    officialJournalRef?: string;
  };
  requirements: ManifestRequirement[];
}

export interface ManifestRequirement {
  code: string;
  name: string;
  description?: string;
  type: RequirementType;
  severity: RequirementSeverity;
  attributeTemplateKey?: string;
  substanceListCode?: string;  // Will be resolved to UUID
  calculationFormula?: string;
  handlerConfig?: Record<string, unknown>;
  legalReference?: string;
  allowTenantExemption?: boolean;
}

export interface ManifestCategoryMapping {
  categoryPath: string;
  regulationCode: string;
}
