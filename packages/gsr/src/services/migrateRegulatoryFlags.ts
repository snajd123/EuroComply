// packages/gsr/src/services/migrateRegulatoryFlags.ts
import type { EntityManager } from '@mikro-orm/postgresql';

export interface MigrateResult {
  migratedCount: number;
  listsCreated: string[];
  errors: Array<{ substanceId: string; error: string }>;
}

/**
 * @deprecated This function was used to migrate legacy boolean regulatory flags
 * (isSvhc, isRestricted, requiresAuthorization) from Substance entity to
 * SubstanceListEntry records. Those fields have been removed from the Substance
 * entity as part of the GSR refactoring.
 *
 * New installations should use the EchaSvhcSeeder and SubstanceListEntry
 * entities directly for regulatory data.
 *
 * This function is now a no-op and returns an empty result.
 */
export async function migrateRegulatoryFlags(_em: EntityManager): Promise<MigrateResult> {
  console.warn(
    'migrateRegulatoryFlags is deprecated. The legacy regulatory flag fields ' +
    '(isSvhc, isRestricted, requiresAuthorization) have been removed from the ' +
    'Substance entity. Use SubstanceListEntry and EchaSvhcSeeder instead.'
  );

  return {
    migratedCount: 0,
    listsCreated: [],
    errors: [],
  };
}
