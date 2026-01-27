import type { EntityManager } from '@mikro-orm/postgresql';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { RegulatoryListEntry } from '../entities/RegulatoryListEntry.js';
import { Substance } from '../entities/Substance.js';
import type { ComparisonOperator, Severity } from '../entities/enums/index.js';

/**
 * Input for creating a new regulatory list.
 */
export interface CreateListInput {
  code: string;
  name: string;
  source: string;
  version: string;
  effectiveDate: Date;
  sourceUrl?: string;
  description?: string;
  isCurrentVersion?: boolean;
  allowTenantExemption?: boolean;
  previousVersionId?: string;
}

/**
 * Input for adding an entry to a regulatory list.
 */
export interface AddEntryInput {
  substanceId: string;
  operator: ComparisonOperator;
  compareValue?: string;
  issueType: string;
  severity: Severity;
  stoichiometricFactor?: string;
  conditions?: Record<string, unknown>;
  legalReference?: string;
  notes?: string;
}

/**
 * Options for retrieving entries.
 */
export interface GetEntriesOptions {
  populate?: Array<'substance' | 'list'>;
}

/**
 * Service for managing regulatory lists and their entries.
 *
 * Handles version management, entry creation, and substance-based lookups.
 */
export class RegulatoryListService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Create a new regulatory list version.
   *
   * @param input - The list creation input
   * @returns The created regulatory list
   * @throws If the code+version combination already exists (database constraint)
   */
  async createList(input: CreateListInput): Promise<RegulatoryList> {
    const list = new RegulatoryList();
    list.code = input.code;
    list.name = input.name;
    list.source = input.source;
    list.version = input.version;
    list.effectiveDate = input.effectiveDate;

    if (input.sourceUrl !== undefined) {
      list.sourceUrl = input.sourceUrl;
    }
    if (input.description !== undefined) {
      list.description = input.description;
    }
    if (input.isCurrentVersion !== undefined) {
      list.isCurrentVersion = input.isCurrentVersion;
    }
    if (input.allowTenantExemption !== undefined) {
      list.allowTenantExemption = input.allowTenantExemption;
    }
    if (input.previousVersionId !== undefined) {
      list.previousVersionId = input.previousVersionId;
    }

    this.em.persist(list);
    await this.em.flush();

    return list;
  }

  /**
   * Get the current (latest) version of a list by code.
   *
   * @param code - The list code (e.g., 'REACH_SVHC')
   * @returns The current version or null if not found
   */
  async getCurrentVersion(code: string): Promise<RegulatoryList | null> {
    return this.em.findOne(RegulatoryList, {
      code,
      isCurrentVersion: true,
    });
  }

  /**
   * Get current versions for multiple list codes.
   *
   * @param codes - Array of list codes
   * @returns Array of current versions (only found lists)
   */
  async getListsByCodes(codes: string[]): Promise<RegulatoryList[]> {
    if (codes.length === 0) {
      return [];
    }

    return this.em.find(RegulatoryList, {
      code: { $in: codes },
      isCurrentVersion: true,
    });
  }

  /**
   * Get all versions of a list, ordered by effective date (newest first).
   *
   * @param code - The list code
   * @returns Array of all versions
   */
  async getVersionHistory(code: string): Promise<RegulatoryList[]> {
    return this.em.find(
      RegulatoryList,
      { code },
      { orderBy: { effectiveDate: 'DESC' } }
    );
  }

  /**
   * Get the version effective at a specific date.
   *
   * Returns the most recent version whose effectiveDate is <= the given date.
   *
   * @param code - The list code
   * @param date - The date to check
   * @returns The version effective at that date or null
   */
  async getVersionAtDate(code: string, date: Date): Promise<RegulatoryList | null> {
    return this.em.findOne(
      RegulatoryList,
      {
        code,
        effectiveDate: { $lte: date },
      },
      { orderBy: { effectiveDate: 'DESC' } }
    );
  }

  /**
   * Add an entry (substance restriction) to a list.
   *
   * Captures a snapshot of the substance's CAS number and name for forensic purposes.
   *
   * @param listId - The regulatory list ID
   * @param input - The entry input
   * @returns The created entry
   * @throws If the list or substance is not found
   * @throws If the substance is already in the list (database constraint)
   */
  async addEntry(listId: string, input: AddEntryInput): Promise<RegulatoryListEntry> {
    const list = await this.em.findOne(RegulatoryList, { id: listId });
    if (!list) {
      throw new Error(`Regulatory list not found: ${listId}`);
    }

    const substance = await this.em.findOne(Substance, { id: input.substanceId });
    if (!substance) {
      throw new Error(`Substance not found: ${input.substanceId}`);
    }

    const entry = new RegulatoryListEntry();
    entry.list = list;
    entry.substance = substance;
    entry.operator = input.operator;
    entry.issueType = input.issueType;
    entry.severity = input.severity;

    // Capture forensic snapshots
    entry.casNumberSnapshot = substance.casNumber;
    entry.substanceNameSnapshot = substance.primaryName;

    // Optional fields
    if (input.compareValue !== undefined) {
      entry.compareValue = input.compareValue;
    }
    if (input.stoichiometricFactor !== undefined) {
      entry.stoichiometricFactor = input.stoichiometricFactor;
    }
    if (input.conditions !== undefined) {
      entry.conditions = input.conditions;
    }
    if (input.legalReference !== undefined) {
      entry.legalReference = input.legalReference;
    }
    if (input.notes !== undefined) {
      entry.notes = input.notes;
    }

    this.em.persist(entry);
    await this.em.flush();

    return entry;
  }

  /**
   * Get all entries for a list.
   *
   * @param listId - The regulatory list ID
   * @param options - Options for populating relations
   * @returns Array of entries
   */
  async getEntriesForList(
    listId: string,
    options?: GetEntriesOptions
  ): Promise<RegulatoryListEntry[]> {
    const populate = options?.populate ?? [];
    return this.em.find(
      RegulatoryListEntry,
      { list: { id: listId } },
      { populate: populate as never[] }
    );
  }

  /**
   * Get entries for multiple lists.
   *
   * @param listIds - Array of regulatory list IDs
   * @returns Array of entries from all lists
   */
  async getEntriesForLists(listIds: string[]): Promise<RegulatoryListEntry[]> {
    if (listIds.length === 0) {
      return [];
    }

    return this.em.find(RegulatoryListEntry, {
      list: { id: { $in: listIds } },
    });
  }

  /**
   * Find entries by CAS number across all current lists.
   *
   * Only searches in lists where isCurrentVersion = true.
   *
   * @param casNumber - The CAS number to search for
   * @returns Array of entries with populated list relation
   */
  async findEntriesByCas(casNumber: string): Promise<RegulatoryListEntry[]> {
    return this.em.find(
      RegulatoryListEntry,
      {
        casNumberSnapshot: casNumber,
        list: { isCurrentVersion: true },
      },
      { populate: ['list'] }
    );
  }

  /**
   * Update the isCurrentVersion flag on a list.
   *
   * Use this when a new version supersedes an old one.
   *
   * @param listId - The list ID to update
   * @param isCurrent - The new value for isCurrentVersion
   */
  async updateCurrentVersion(listId: string, isCurrent: boolean): Promise<void> {
    const list = await this.em.findOne(RegulatoryList, { id: listId });
    if (!list) {
      throw new Error(`Regulatory list not found: ${listId}`);
    }

    list.isCurrentVersion = isCurrent;
    await this.em.flush();
  }

  /**
   * Set the superseded date on a list version.
   *
   * Use this to mark when a version was replaced by a newer one.
   *
   * @param listId - The list ID to update
   * @param date - The date when this version was superseded
   */
  async setSupersededDate(listId: string, date: Date): Promise<void> {
    const list = await this.em.findOne(RegulatoryList, { id: listId });
    if (!list) {
      throw new Error(`Regulatory list not found: ${listId}`);
    }

    list.supersededDate = date;
    await this.em.flush();
  }
}
