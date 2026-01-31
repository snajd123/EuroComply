// packages/gsr/src/services/migrateRegulatoryFlags.ts
import type { EntityManager } from '@mikro-orm/postgresql';
import { Substance } from '@eurocomply/database';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { SubstanceListEntry } from '../entities/SubstanceListEntry.js';
import { ListingStatus } from '../enums/ListingStatus.js';
import { ProductScope } from '../enums/ProductScope.js';

/**
 * Regulatory list codes for REACH regulations.
 */
const REGULATORY_LIST_CODES = {
  SVHC: 'REACH_SVHC',
  ANNEX_XIV: 'REACH_ANNEX_XIV',
  ANNEX_XVII: 'REACH_ANNEX_XVII',
} as const;

type RegulatoryListCode = typeof REGULATORY_LIST_CODES[keyof typeof REGULATORY_LIST_CODES];

/**
 * Regulatory list metadata for creating list records.
 */
const REGULATORY_LIST_METADATA: Record<RegulatoryListCode, { name: string; jurisdiction: string; publisher: string; description: string }> = {
  [REGULATORY_LIST_CODES.SVHC]: {
    name: 'REACH SVHC Candidate List',
    jurisdiction: 'EU',
    publisher: 'ECHA',
    description: 'Substances of Very High Concern candidate list under REACH regulation',
  },
  [REGULATORY_LIST_CODES.ANNEX_XIV]: {
    name: 'REACH Annex XIV - Authorization List',
    jurisdiction: 'EU',
    publisher: 'ECHA',
    description: 'Substances requiring authorization under REACH Annex XIV',
  },
  [REGULATORY_LIST_CODES.ANNEX_XVII]: {
    name: 'REACH Annex XVII - Restriction List',
    jurisdiction: 'EU',
    publisher: 'ECHA',
    description: 'Restrictions on certain dangerous substances under REACH Annex XVII',
  },
};

export interface MigrateResult {
  migratedCount: number;
  listsCreated: string[];
  errors: Array<{ substanceId: string; error: string }>;
}

/**
 * Migrates boolean regulatory flags from Substance entity to SubstanceListEntry records.
 *
 * Maps:
 * - isSvhc: boolean -> SubstanceListEntry with REACH_SVHC list
 * - requiresAuthorization: boolean -> SubstanceListEntry with REACH_ANNEX_XIV list
 * - isRestricted: boolean -> SubstanceListEntry with REACH_ANNEX_XVII list
 *
 * Is idempotent: skips if entry already exists.
 */
export async function migrateRegulatoryFlags(em: EntityManager): Promise<MigrateResult> {
  const result: MigrateResult = {
    migratedCount: 0,
    listsCreated: [],
    errors: [],
  };

  // Get or create regulatory lists
  const regulatoryLists = await getOrCreateRegulatoryLists(em);
  result.listsCreated = [...regulatoryLists.created];

  // Find all substances with any regulatory flag set
  const substances = await em.find(Substance, {
    $or: [
      { isSvhc: true },
      { isRestricted: true },
      { requiresAuthorization: true },
    ],
  });

  for (const substance of substances) {
    // SVHC migration
    if (substance.isSvhc) {
      const svhcList = regulatoryLists.map[REGULATORY_LIST_CODES.SVHC];
      const created = await createEntryIfNotExists(em, {
        substance,
        regulatoryList: svhcList,
        status: ListingStatus.LISTED,
        scopes: [ProductScope.ALL_PRODUCTS],
      });
      if (created) result.migratedCount++;
    }

    // Authorization (Annex XIV) migration
    if (substance.requiresAuthorization) {
      const annexXivList = regulatoryLists.map[REGULATORY_LIST_CODES.ANNEX_XIV];
      const created = await createEntryIfNotExists(em, {
        substance,
        regulatoryList: annexXivList,
        status: ListingStatus.AUTHORIZED,
        scopes: [ProductScope.ALL_PRODUCTS],
        sunsetDate: substance.sunsetDate,
      });
      if (created) result.migratedCount++;
    }

    // Restriction (Annex XVII) migration
    if (substance.isRestricted) {
      const annexXviiList = regulatoryLists.map[REGULATORY_LIST_CODES.ANNEX_XVII];
      const conditions = substance.restrictionConditions
        ? { text: substance.restrictionConditions }
        : undefined;

      const created = await createEntryIfNotExists(em, {
        substance,
        regulatoryList: annexXviiList,
        status: ListingStatus.RESTRICTED,
        scopes: [ProductScope.ALL_PRODUCTS],
        conditions,
      });
      if (created) result.migratedCount++;
    }
  }

  return result;
}

interface CreateEntryParams {
  substance: Substance;
  regulatoryList: RegulatoryList;
  status: ListingStatus;
  scopes: ProductScope[];
  sunsetDate?: Date;
  conditions?: Record<string, unknown>;
}

/**
 * Creates a SubstanceListEntry if it doesn't already exist.
 * Returns true if a new entry was created, false if it already existed.
 *
 * Idempotency check is based on substance + regulatoryList since this migration
 * always uses ALL_PRODUCTS scope. The database unique constraint handles
 * the full (substance, regulatoryList, scopes) combination.
 */
async function createEntryIfNotExists(
  em: EntityManager,
  params: CreateEntryParams,
): Promise<boolean> {
  // Check if entry already exists (idempotency)
  // Note: We check by substance + regulatoryList only since querying array fields
  // directly is problematic in MikroORM. For this migration we always use ALL_PRODUCTS.
  const existing = await em.findOne(SubstanceListEntry, {
    substance: params.substance,
    regulatoryList: params.regulatoryList,
  });

  if (existing) {
    return false;
  }

  // Create new entry using em.create with properly typed data
  const entry = new SubstanceListEntry();
  entry.substance = params.substance;
  entry.regulatoryList = params.regulatoryList;
  entry.status = params.status;
  entry.scopes = params.scopes;
  if (params.sunsetDate) {
    entry.sunsetDate = params.sunsetDate;
  }
  if (params.conditions) {
    entry.conditions = params.conditions;
  }

  await em.persistAndFlush(entry);
  return true;
}

interface RegulatoryListsResult {
  map: Record<RegulatoryListCode, RegulatoryList>;
  created: string[];
}

/**
 * Gets or creates the three REACH regulatory lists.
 */
async function getOrCreateRegulatoryLists(em: EntityManager): Promise<RegulatoryListsResult> {
  const result: RegulatoryListsResult = {
    map: {} as Record<RegulatoryListCode, RegulatoryList>,
    created: [],
  };

  for (const code of Object.values(REGULATORY_LIST_CODES)) {
    let list = await em.findOne(RegulatoryList, { code });

    if (!list) {
      const metadata = REGULATORY_LIST_METADATA[code];
      list = new RegulatoryList();
      list.code = code;
      list.name = metadata.name;
      list.jurisdiction = metadata.jurisdiction;
      list.publisher = metadata.publisher;
      list.description = metadata.description;
      await em.persistAndFlush(list);
      result.created.push(code);
    }

    result.map[code] = list;
  }

  return result;
}
