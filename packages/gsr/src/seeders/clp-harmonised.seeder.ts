// packages/gsr/src/seeders/clp-harmonised.seeder.ts
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { createId } from '@paralleldrive/cuid2';
import { Substance } from '@eurocomply/database';
import { HazardClass } from '../entities/HazardClass.js';
import { SubstanceHazardClassification } from '../entities/SubstanceHazardClassification.js';
import { UnresolvedSubstance, UnresolvedSource } from '../entities/UnresolvedSubstance.js';
import { UnresolvedStatus } from '../enums/UnresolvedStatus.js';
import { ClpClassificationParser } from '../parsers/clp-classification.parser.js';
import { buildHazardClassDictionary } from '../reference-data/hazard-classes.js';
import { sanitizeCas, readXlsxFile } from '../utils/index.js';

/**
 * Result of a CLP Harmonised List seeding operation.
 */
export interface ClpHarmonisedSeederResult {
  /** Whether data was seeded */
  seeded: boolean;
  /** Whether seeding was skipped (pre-check failed) */
  skipped: boolean;
  /** Total rows processed from XLSX */
  totalRows: number;
  /** Number of substances matched to existing records */
  substancesMatched: number;
  /** Number of substances not found in database */
  substancesNotFound: number;
  /** Number of unresolved entries logged */
  unresolvedLogged: number;
  /** Number of classifications created */
  classificationsCreated: number;
  /** Number of classifications skipped (duplicates, unknown classes) */
  classificationsSkipped: number;
  /** ATP version being seeded */
  version: string;
  /** Human-readable message */
  message: string;
}

/**
 * Interface for ECHA Harmonised List XLSX row structure.
 */
interface HarmonisedListRow {
  'Index number': string;
  'International chemical identification': string;
  'EC number'?: string;
  'CAS number'?: string;
  'Hazard class, category and statement code(s)'?: string;
  'Specific concentration limits and M-factors'?: string;
  'Notes'?: string;
  'ATP inserted/updated'?: string;
}

/**
 * Seeds substance hazard classifications from ECHA's Harmonised List XLSX.
 *
 * The ECHA Harmonised List contains legally binding CLP classifications
 * from Annex VI of Regulation (EC) No 1272/2008. This seeder:
 *
 * 1. Validates that hazard reference data is seeded
 * 2. Matches substances by CAS number (primary) or EC number (fallback)
 * 3. Parses multi-line hazard classification blocks using ClpClassificationParser
 * 4. Creates SubstanceHazardClassification records linking substances to hazard classes
 * 5. Logs unmatched substances to UnresolvedSubstance for admin review
 *
 * Key behaviors:
 * - Fails early with clear message if hazard classes not seeded
 * - Skips duplicates (same substance + hazardClass + category + hCode)
 * - Updates substance.indexNumber (if not set) and clpVersion
 * - Uses whitelist validation to filter garbage/unknown classifications
 *
 * Reference: ECHA CLP Annex VI Table 3
 * https://echa.europa.eu/regulations/clp/cl-inventory
 */
export class ClpHarmonisedSeeder {
  private readonly orm: MikroORM;

  constructor(orm: MikroORM) {
    this.orm = orm;
  }

  /**
   * Seeds classifications from an ECHA Harmonised List XLSX file.
   *
   * @param filePath - Path to the XLSX file
   * @param version - ATP version string (e.g., "ATP21")
   * @returns Seeder result with counts and status
   */
  async seedFromXlsx(filePath: string, version: string): Promise<ClpHarmonisedSeederResult> {
    const em = this.orm.em.fork();

    // Pre-check: Ensure hazard classes are seeded
    const hazardClassCount = await em.count(HazardClass, {});
    if (hazardClassCount === 0) {
      return {
        seeded: false,
        skipped: true,
        totalRows: 0,
        substancesMatched: 0,
        substancesNotFound: 0,
        unresolvedLogged: 0,
        classificationsCreated: 0,
        classificationsSkipped: 0,
        version,
        message: "No hazard classes found. Run 'pnpm gsr seed clp-reference' first.",
      };
    }

    // Build hazard class dictionary for parser
    const dictionary = buildHazardClassDictionary();
    const parser = new ClpClassificationParser(dictionary);

    // Read XLSX file
    let rows: HarmonisedListRow[];
    try {
      rows = readXlsxFile<HarmonisedListRow>(filePath);
    } catch (error) {
      return {
        seeded: false,
        skipped: false,
        totalRows: 0,
        substancesMatched: 0,
        substancesNotFound: 0,
        unresolvedLogged: 0,
        classificationsCreated: 0,
        classificationsSkipped: 0,
        version,
        message: `Failed to read XLSX file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    if (rows.length === 0) {
      return {
        seeded: false,
        skipped: false,
        totalRows: 0,
        substancesMatched: 0,
        substancesNotFound: 0,
        unresolvedLogged: 0,
        classificationsCreated: 0,
        classificationsSkipped: 0,
        version,
        message: 'XLSX file is empty or has no data rows.',
      };
    }

    // Process rows
    let substancesMatched = 0;
    let substancesNotFound = 0;
    let unresolvedLogged = 0;
    let classificationsCreated = 0;
    let classificationsSkipped = 0;

    // Load all hazard classes for lookup
    const hazardClasses = await em.find(HazardClass, {});
    const hazardClassMap = new Map(hazardClasses.map(hc => [hc.code, hc]));

    // Valid from date for this ATP version
    const validFrom = new Date();

    for (const row of rows) {
      const result = await this.processRow(
        em,
        row,
        parser,
        hazardClassMap,
        version,
        validFrom
      );

      if (result.matched) {
        substancesMatched++;
        classificationsCreated += result.classificationsCreated;
        classificationsSkipped += result.classificationsSkipped;
      } else {
        substancesNotFound++;
        if (result.unresolvedLogged) {
          unresolvedLogged++;
        }
      }
    }

    return {
      seeded: classificationsCreated > 0,
      skipped: false,
      totalRows: rows.length,
      substancesMatched,
      substancesNotFound,
      unresolvedLogged,
      classificationsCreated,
      classificationsSkipped,
      version,
      message: `Processed ${rows.length} rows: ${substancesMatched} matched, ${classificationsCreated} classifications created, ${substancesNotFound} not found (${unresolvedLogged} logged as unresolved).`,
    };
  }

  /**
   * Processes a single row from the harmonised list.
   */
  private async processRow(
    em: EntityManager,
    row: HarmonisedListRow,
    parser: ClpClassificationParser,
    hazardClassMap: Map<string, HazardClass>,
    version: string,
    validFrom: Date
  ): Promise<{
    matched: boolean;
    unresolvedLogged: boolean;
    classificationsCreated: number;
    classificationsSkipped: number;
  }> {
    const indexNumber = row['Index number']?.trim() || '';
    const chemicalName = row['International chemical identification']?.trim() || '';
    const rawCas = row['CAS number']?.trim() || '';
    const rawEc = row['EC number']?.trim() || '';
    const hazardBlock = row['Hazard class, category and statement code(s)'] || '';
    const rawNotes = row['Notes']?.trim() || '';

    // Try to match substance
    const substance = await this.findSubstance(em, rawCas, rawEc);

    if (!substance) {
      // Log as unresolved
      const unresolvedLogged = await this.logUnresolved(em, chemicalName, rawCas);
      return {
        matched: false,
        unresolvedLogged,
        classificationsCreated: 0,
        classificationsSkipped: 0,
      };
    }

    // Update substance metadata
    await this.updateSubstanceMetadata(em, substance, indexNumber, version);

    // Parse hazard classifications
    const classifications = parser.parseClassificationBlock(hazardBlock);

    // Parse notes
    const notes = rawNotes ? rawNotes.split(/[,;]/).map(n => n.trim()).filter(n => n.length > 0) : undefined;

    let classificationsCreated = 0;
    let classificationsSkipped = 0;

    for (const parsed of classifications) {
      const hazardClass = hazardClassMap.get(parsed.hazardClass);
      if (!hazardClass) {
        classificationsSkipped++;
        continue;
      }

      // Check for duplicate
      const existing = await em.findOne(SubstanceHazardClassification, {
        substance: substance,
        hazardClass: hazardClass,
        category: parsed.category || null,
        hCode: parsed.hCode || null,
      });

      if (existing) {
        classificationsSkipped++;
        continue;
      }

      // Create classification
      const now = new Date();
      const classification = em.create(SubstanceHazardClassification, {
        id: createId(),
        substance: substance,
        hazardClass: hazardClass,
        category: parsed.category,
        hCode: parsed.hCode,
        notes: notes,
        isMinimumClassification: parsed.isMinimumClassification,
        atpSource: version,
        validFrom: validFrom,
        createdAt: now,
        updatedAt: now,
      });

      em.persist(classification);
      classificationsCreated++;
    }

    if (classificationsCreated > 0) {
      await em.flush();
    }

    return {
      matched: true,
      unresolvedLogged: false,
      classificationsCreated,
      classificationsSkipped,
    };
  }

  /**
   * Finds a substance by CAS number (primary) or EC number (fallback).
   */
  private async findSubstance(
    em: EntityManager,
    rawCas: string,
    rawEc: string
  ): Promise<Substance | null> {
    // Try CAS first
    const validCas = sanitizeCas(rawCas);
    if (validCas) {
      const byCase = await em.findOne(Substance, { casNumber: validCas });
      if (byCase) {
        return byCase;
      }
    }

    // Fallback to EC number
    if (rawEc) {
      const cleanEc = rawEc.trim();
      if (cleanEc) {
        const byEc = await em.findOne(Substance, { ecNumber: cleanEc });
        if (byEc) {
          return byEc;
        }
      }
    }

    return null;
  }

  /**
   * Updates substance metadata (indexNumber and clpVersion).
   */
  private async updateSubstanceMetadata(
    em: EntityManager,
    substance: Substance,
    indexNumber: string,
    version: string
  ): Promise<void> {
    let updated = false;

    // Only set indexNumber if not already set
    if (indexNumber && !substance.indexNumber) {
      substance.indexNumber = indexNumber;
      updated = true;
    }

    // Always update clpVersion
    substance.clpVersion = version;
    updated = true;

    if (updated) {
      await em.persistAndFlush(substance);
    }
  }

  /**
   * Logs an unmatched substance to the UnresolvedSubstance table.
   */
  private async logUnresolved(
    em: EntityManager,
    rawName: string,
    rawCas: string
  ): Promise<boolean> {
    if (!rawName && !rawCas) {
      return false;
    }

    // Check for existing entry
    const existing = await em.findOne(UnresolvedSubstance, {
      rawName: rawName || '',
      rawCasNumber: rawCas || undefined,
      source: UnresolvedSource.REGULATORY_IMPORT,
    });

    if (existing) {
      existing.occurrenceCount += 1;
      await em.persistAndFlush(existing);
      return true;
    }

    // Create new entry
    const now = new Date();
    const unresolved = em.create(UnresolvedSubstance, {
      id: createId(),
      rawName: rawName || 'Unknown',
      rawCasNumber: rawCas || undefined,
      source: UnresolvedSource.REGULATORY_IMPORT,
      occurrenceCount: 1,
      status: UnresolvedStatus.PENDING,
      createdAt: now,
      updatedAt: now,
    });

    await em.persistAndFlush(unresolved);
    return true;
  }
}
