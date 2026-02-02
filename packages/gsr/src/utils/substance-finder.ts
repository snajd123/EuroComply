// packages/gsr/src/utils/substance-finder.ts
import type { EntityManager } from '@mikro-orm/postgresql';
import { createId } from '@paralleldrive/cuid2';
import { Substance } from '@eurocomply/database';
import { isValidCasNumber } from '@eurocomply/database';

/**
 * Options for finding or creating a substance.
 */
export interface SubstanceIdentifiers {
  casNumber?: string;
  ecNumber?: string;
  name: string;
  description?: string;
}

/**
 * Result of findOrCreateSubstance operation.
 */
export interface FindOrCreateResult {
  substance: Substance | null;
  created: boolean;
  skipped: boolean;
  skipReason?: string;
}

/**
 * Finds an existing substance or creates a stub substance from regulatory data.
 *
 * This function is used by regulatory list seeders to ensure all regulated substances
 * exist in the database, even if they weren't in the EC Inventory.
 *
 * Logic:
 * 1. Try to find by CAS number (if provided and valid)
 * 2. Try to find by EC number (if provided)
 * 3. If not found and CAS is valid, create a stub substance
 * 4. If CAS is invalid/missing, skip (return null with reason)
 *
 * Stub substances have:
 * - sourceVersion set to "STUB:{source}:{version}" to indicate origin
 * - Minimal data (name, CAS, EC if available)
 * - No SMILES/InChI (can be enriched later via PubChem)
 *
 * @param em - EntityManager to use for queries
 * @param identifiers - Substance identifiers from regulatory data
 * @param source - Source identifier (e.g., "ANNEX_XVII", "ANNEX_XIV", "POP")
 * @param version - Data version (e.g., "2026-01")
 * @returns FindOrCreateResult with the substance or skip reason
 */
export async function findOrCreateSubstance(
  em: EntityManager,
  identifiers: SubstanceIdentifiers,
  source: string,
  version: string
): Promise<FindOrCreateResult> {
  // Normalize CAS number
  const cas = identifiers.casNumber?.trim() || undefined;
  const ec = identifiers.ecNumber?.trim() || undefined;
  const name = identifiers.name.trim();

  // Try to find by CAS number first
  if (cas && isValidCasNumber(cas)) {
    const byCas = await em.findOne(Substance, { casNumber: cas });
    if (byCas) {
      return { substance: byCas, created: false, skipped: false };
    }
  }

  // Try to find by EC number
  if (ec) {
    const byEc = await em.findOne(Substance, { ecNumber: ec });
    if (byEc) {
      return { substance: byEc, created: false, skipped: false };
    }
  }

  // Not found - try to create a stub
  // We need a valid CAS number to create a substance (it's required and unique)
  if (!cas) {
    return {
      substance: null,
      created: false,
      skipped: true,
      skipReason: `No CAS number provided for "${name}"`,
    };
  }

  if (!isValidCasNumber(cas)) {
    return {
      substance: null,
      created: false,
      skipped: true,
      skipReason: `Invalid CAS number "${cas}" for "${name}"`,
    };
  }

  // Check again if CAS exists (in case we missed it above due to format differences)
  const existingByCas = await em.findOne(Substance, { casNumber: cas });
  if (existingByCas) {
    return { substance: existingByCas, created: false, skipped: false };
  }

  // Create stub substance
  const stubSubstance = em.create(Substance, {
    id: createId(),
    casNumber: cas,
    ecNumber: ec,
    primaryName: name,
    description: identifiers.description || `Stub substance created from ${source} regulatory data`,
    sourceVersion: `STUB:${source}:${version}`,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  em.persist(stubSubstance);

  return { substance: stubSubstance, created: true, skipped: false };
}

/**
 * Batch find or create substances.
 * Useful for processing multiple substances efficiently.
 *
 * @param em - EntityManager to use for queries
 * @param substances - Array of substance identifiers
 * @param source - Source identifier
 * @param version - Data version
 * @returns Array of results matching input order
 */
export async function findOrCreateSubstances(
  em: EntityManager,
  substances: SubstanceIdentifiers[],
  source: string,
  version: string
): Promise<FindOrCreateResult[]> {
  const results: FindOrCreateResult[] = [];

  for (const identifiers of substances) {
    const result = await findOrCreateSubstance(em, identifiers, source, version);
    results.push(result);
  }

  return results;
}
