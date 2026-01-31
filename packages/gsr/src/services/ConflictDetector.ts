// packages/gsr/src/services/ConflictDetector.ts
import type { EntityManager } from '@mikro-orm/postgresql';
import { SubstanceListEntry } from '../entities/SubstanceListEntry.js';
import { ProductScope, isScopeAncestor } from '../enums/ProductScope.js';
import { ThresholdUnit } from '../enums/ThresholdUnit.js';
import { ListingStatus } from '../enums/ListingStatus.js';
import { UnitConversionService } from './UnitConversionService.js';

export enum ConflictType {
  THRESHOLD_MISMATCH = 'THRESHOLD_MISMATCH',
  STATUS_CONTRADICTION = 'STATUS_CONTRADICTION',
  SCOPE_OVERLAP = 'SCOPE_OVERLAP',
  STRICTER_EXISTS = 'STRICTER_EXISTS',
  SUPERSEDED = 'SUPERSEDED',
}

export enum ConflictSeverity {
  ERROR = 'ERROR',
  WARNING = 'WARNING',
  INFO = 'INFO',
}

export interface Conflict {
  type: ConflictType;
  severity: ConflictSeverity;
  existingEntryId: string;
  message: string;
  suggestedAction?: 'ARCHIVE_OLD' | 'REJECT_NEW' | 'MANUAL_REVIEW';
}

export interface NewEntryInput {
  substanceId: string;
  regulatoryListId: string;
  status?: ListingStatus;
  scopes: ProductScope[];
  threshold?: number;
  thresholdUnit?: ThresholdUnit;
}

/** Scope relationship types */
type ScopeRelation = 'EXACT' | 'PARENT_CHILD' | 'CHILD_PARENT' | null;

/**
 * Detects conflicts when adding new SubstanceListEntry records.
 * Checks for threshold mismatches, status contradictions, and scope overlaps.
 */
export class ConflictDetector {
  private readonly unitConversion = new UnitConversionService();

  constructor(private readonly em: EntityManager) {}

  /**
   * Detect conflicts between a new entry and existing entries.
   * @param newEntry The proposed new entry data
   * @returns Array of detected conflicts (empty if no conflicts)
   */
  async detect(newEntry: NewEntryInput): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];

    // Find all existing entries for same substance + regulatoryList
    const existingEntries = await this.em.find(SubstanceListEntry, {
      substance: { id: newEntry.substanceId },
      regulatoryList: { id: newEntry.regulatoryListId },
    });

    for (const existing of existingEntries) {
      // Check scope relationships for each scope pair
      const scopeRelations = this.getScopeRelations(newEntry.scopes, existing.scopes);

      for (const { newScope, existingScope, relation } of scopeRelations) {
        if (relation === null) {
          // No relationship, no conflict
          continue;
        }

        // Check status contradictions first
        const statusConflict = this.checkStatusContradiction(
          newEntry.status,
          existing.status,
          relation,
          existing.id,
        );
        if (statusConflict) {
          conflicts.push(statusConflict);
        }

        // Check threshold conflicts
        const thresholdConflicts = this.checkThresholdConflicts(
          newEntry,
          existing,
          relation,
          newScope,
          existingScope,
        );
        conflicts.push(...thresholdConflicts);
      }
    }

    // Deduplicate conflicts by existing entry ID and type
    return this.deduplicateConflicts(conflicts);
  }

  /**
   * Get scope relationships between new and existing scopes.
   */
  private getScopeRelations(
    newScopes: ProductScope[],
    existingScopes: ProductScope[],
  ): Array<{ newScope: ProductScope; existingScope: ProductScope; relation: ScopeRelation }> {
    const relations: Array<{
      newScope: ProductScope;
      existingScope: ProductScope;
      relation: ScopeRelation;
    }> = [];

    for (const newScope of newScopes) {
      for (const existingScope of existingScopes) {
        const relation = this.getScopeRelation(newScope, existingScope);
        if (relation !== null) {
          relations.push({ newScope, existingScope, relation });
        }
      }
    }

    return relations;
  }

  /**
   * Determine the relationship between two scopes.
   */
  private getScopeRelation(newScope: ProductScope, existingScope: ProductScope): ScopeRelation {
    if (newScope === existingScope) {
      return 'EXACT';
    }

    // Check if existing is an ancestor of new (parent -> child relationship)
    if (isScopeAncestor(existingScope, newScope)) {
      return 'PARENT_CHILD';
    }

    // Check if new is an ancestor of existing (child -> parent relationship)
    if (isScopeAncestor(newScope, existingScope)) {
      return 'CHILD_PARENT';
    }

    return null;
  }

  /**
   * Check for status contradictions (e.g., BANNED vs RESTRICTED).
   */
  private checkStatusContradiction(
    newStatus: ListingStatus | undefined,
    existingStatus: ListingStatus,
    relation: ScopeRelation,
    existingEntryId: string,
  ): Conflict | null {
    if (!newStatus) {
      return null;
    }

    // BANNED vs RESTRICTED is a contradiction for overlapping scopes
    const isBannedVsRestricted =
      (newStatus === ListingStatus.BANNED && existingStatus === ListingStatus.RESTRICTED) ||
      (newStatus === ListingStatus.RESTRICTED && existingStatus === ListingStatus.BANNED);

    if (isBannedVsRestricted && relation !== null) {
      return {
        type: ConflictType.STATUS_CONTRADICTION,
        severity: ConflictSeverity.ERROR,
        existingEntryId,
        message: `Status contradiction: new entry has ${newStatus} but existing entry has ${existingStatus}`,
        suggestedAction: 'MANUAL_REVIEW',
      };
    }

    return null;
  }

  /**
   * Check for threshold-related conflicts.
   */
  private checkThresholdConflicts(
    newEntry: NewEntryInput,
    existing: SubstanceListEntry,
    relation: ScopeRelation,
    newScope: ProductScope,
    existingScope: ProductScope,
  ): Conflict[] {
    const conflicts: Conflict[] = [];

    // If either entry has no threshold, only check for scope overlap (not threshold issues)
    if (
      newEntry.threshold === undefined ||
      newEntry.thresholdUnit === undefined ||
      existing.threshold === undefined ||
      existing.thresholdUnit === undefined
    ) {
      // Still report scope overlap if thresholds differ or one is missing
      if (relation === 'PARENT_CHILD' || relation === 'CHILD_PARENT') {
        conflicts.push({
          type: ConflictType.SCOPE_OVERLAP,
          severity: ConflictSeverity.WARNING,
          existingEntryId: existing.id,
          message:
            relation === 'PARENT_CHILD'
              ? `Scope overlap: existing entry for parent scope ${existingScope} affects child scope ${newScope}`
              : `Scope overlap: existing entry for child scope ${existingScope} exists under new parent scope ${newScope}`,
          suggestedAction: 'MANUAL_REVIEW',
        });
      }
      return conflicts;
    }

    // Check if units are comparable
    const areComparable = this.unitConversion.areComparable(
      newEntry.thresholdUnit,
      existing.thresholdUnit,
    );

    if (!areComparable) {
      // Incomparable units = warning
      conflicts.push({
        type: ConflictType.THRESHOLD_MISMATCH,
        severity: ConflictSeverity.WARNING,
        existingEntryId: existing.id,
        message: `Threshold units are incomparable: new entry uses ${newEntry.thresholdUnit}, existing uses ${existing.thresholdUnit}`,
        suggestedAction: 'MANUAL_REVIEW',
      });
      return conflicts;
    }

    // Compare thresholds
    const comparison = this.unitConversion.compareThresholds(
      { value: newEntry.threshold, unit: newEntry.thresholdUnit },
      { value: Number(existing.threshold), unit: existing.thresholdUnit },
    );

    if (relation === 'EXACT') {
      // Same scope - check for mismatch or stricter existing
      if (comparison !== 0) {
        if (comparison === 1) {
          // New is less strict than existing (existing is stricter)
          conflicts.push({
            type: ConflictType.STRICTER_EXISTS,
            severity: ConflictSeverity.WARNING,
            existingEntryId: existing.id,
            message: `Stricter threshold already exists: existing entry has ${existing.threshold} ${existing.thresholdUnit}, new entry proposes ${newEntry.threshold} ${newEntry.thresholdUnit}`,
            suggestedAction: 'REJECT_NEW',
          });
        } else {
          // Different thresholds for same scope = mismatch error
          conflicts.push({
            type: ConflictType.THRESHOLD_MISMATCH,
            severity: ConflictSeverity.ERROR,
            existingEntryId: existing.id,
            message: `Threshold mismatch for same scope: existing ${existing.threshold} ${existing.thresholdUnit} vs new ${newEntry.threshold} ${newEntry.thresholdUnit}`,
            suggestedAction: 'MANUAL_REVIEW',
          });
        }
      }
    } else if (relation === 'PARENT_CHILD' || relation === 'CHILD_PARENT') {
      // Scope overlap with different thresholds
      if (comparison !== 0) {
        conflicts.push({
          type: ConflictType.SCOPE_OVERLAP,
          severity: ConflictSeverity.WARNING,
          existingEntryId: existing.id,
          message:
            relation === 'PARENT_CHILD'
              ? `Scope overlap: existing parent scope ${existingScope} has threshold ${existing.threshold} ${existing.thresholdUnit}, new child scope ${newScope} has ${newEntry.threshold} ${newEntry.thresholdUnit}`
              : `Scope overlap: existing child scope ${existingScope} has threshold ${existing.threshold} ${existing.thresholdUnit}, new parent scope ${newScope} has ${newEntry.threshold} ${newEntry.thresholdUnit}`,
          suggestedAction: 'MANUAL_REVIEW',
        });
      }
    }

    return conflicts;
  }

  /**
   * Deduplicate conflicts by entry ID and type.
   */
  private deduplicateConflicts(conflicts: Conflict[]): Conflict[] {
    const seen = new Set<string>();
    const result: Conflict[] = [];

    for (const conflict of conflicts) {
      const key = `${conflict.existingEntryId}:${conflict.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(conflict);
      }
    }

    return result;
  }
}
