// packages/gsr/src/seeders/hazard-reference.seeder.ts
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { HazardClass } from '../entities/HazardClass.js';
import { HazardStatement } from '../entities/HazardStatement.js';
import { HAZARD_CLASSES } from '../reference-data/hazard-classes.js';
import {
  loadHStatementsFromMhchem,
  type HStatementWithTranslations,
  type EuLanguage,
} from '../reference-data/mhchem-loader.js';

/**
 * Result of a hazard reference seeding operation.
 */
export interface HazardReferenceSeederResult {
  /** Whether data was seeded */
  seeded: boolean;
  /** Whether seeding was skipped (already seeded) */
  skipped: boolean;
  /** Number of records seeded */
  count: number;
  /** Human-readable message */
  message: string;
  /** Languages loaded (for H-statements) */
  languagesLoaded?: string[];
  /** Whether fallback data was used */
  usedFallback?: boolean;
}

/**
 * Definition of an H-statement for fallback seeding.
 * Only used when mhchem data source is unavailable.
 */
export interface HazardStatementDefinition {
  /** H-code (e.g., H300, H350i) */
  code: string;
  /** English text of the statement */
  text: string;
}

/**
 * FALLBACK CLP/GHS H-statements - ONLY used when mhchem data source is unavailable.
 *
 * Primary source is mhchem/hpstatements (https://github.com/mhchem/hpstatements)
 * which provides translations for all 24 EU official languages.
 *
 * This fallback provides English-only data for critical H-statements.
 *
 * Reference: CLP Regulation (EC) No 1272/2008 Annex III
 */
const FALLBACK_HAZARD_STATEMENTS: HazardStatementDefinition[] = [
  // Physical hazards (H200-H299)
  { code: 'H200', text: 'Unstable explosive' },
  { code: 'H201', text: 'Explosive; mass explosion hazard' },
  { code: 'H202', text: 'Explosive; severe projection hazard' },
  { code: 'H203', text: 'Explosive; fire, blast or projection hazard' },
  { code: 'H204', text: 'Fire or projection hazard' },
  { code: 'H205', text: 'May mass explode in fire' },
  { code: 'H220', text: 'Extremely flammable gas' },
  { code: 'H221', text: 'Flammable gas' },
  { code: 'H224', text: 'Extremely flammable liquid and vapour' },
  { code: 'H225', text: 'Highly flammable liquid and vapour' },
  { code: 'H226', text: 'Flammable liquid and vapour' },
  { code: 'H228', text: 'Flammable solid' },
  { code: 'H240', text: 'Heating may cause an explosion' },
  { code: 'H241', text: 'Heating may cause a fire or explosion' },
  { code: 'H242', text: 'Heating may cause a fire' },
  { code: 'H270', text: 'May cause or intensify fire; oxidiser' },
  { code: 'H271', text: 'May cause fire or explosion; strong oxidiser' },
  { code: 'H272', text: 'May intensify fire; oxidiser' },
  { code: 'H280', text: 'Contains gas under pressure; may explode if heated' },
  { code: 'H281', text: 'Contains refrigerated gas; may cause cryogenic burns or injury' },
  { code: 'H290', text: 'May be corrosive to metals' },

  // Health hazards - Acute toxicity (H300-H312)
  { code: 'H300', text: 'Fatal if swallowed' },
  { code: 'H301', text: 'Toxic if swallowed' },
  { code: 'H302', text: 'Harmful if swallowed' },
  { code: 'H304', text: 'May be fatal if swallowed and enters airways' },
  { code: 'H310', text: 'Fatal in contact with skin' },
  { code: 'H311', text: 'Toxic in contact with skin' },
  { code: 'H312', text: 'Harmful in contact with skin' },
  { code: 'H314', text: 'Causes severe skin burns and eye damage' },
  { code: 'H315', text: 'Causes skin irritation' },
  { code: 'H317', text: 'May cause an allergic skin reaction' },
  { code: 'H318', text: 'Causes serious eye damage' },
  { code: 'H319', text: 'Causes serious eye irritation' },
  { code: 'H330', text: 'Fatal if inhaled' },
  { code: 'H331', text: 'Toxic if inhaled' },
  { code: 'H332', text: 'Harmful if inhaled' },
  { code: 'H334', text: 'May cause allergy or asthma symptoms or breathing difficulties if inhaled' },
  { code: 'H335', text: 'May cause respiratory irritation' },
  { code: 'H336', text: 'May cause drowsiness or dizziness' },

  // Health hazards - CMR (H340-H373)
  { code: 'H340', text: 'May cause genetic defects' },
  { code: 'H341', text: 'Suspected of causing genetic defects' },
  { code: 'H350', text: 'May cause cancer' },
  { code: 'H350i', text: 'May cause cancer by inhalation' },
  { code: 'H351', text: 'Suspected of causing cancer' },
  { code: 'H360', text: 'May damage fertility or the unborn child' },
  { code: 'H360F', text: 'May damage fertility' },
  { code: 'H360D', text: 'May damage the unborn child' },
  { code: 'H360FD', text: 'May damage fertility. May damage the unborn child' },
  { code: 'H360Fd', text: 'May damage fertility. Suspected of damaging the unborn child' },
  { code: 'H360Df', text: 'May damage the unborn child. Suspected of damaging fertility' },
  { code: 'H361', text: 'Suspected of damaging fertility or the unborn child' },
  { code: 'H361f', text: 'Suspected of damaging fertility' },
  { code: 'H361d', text: 'Suspected of damaging the unborn child' },
  { code: 'H361fd', text: 'Suspected of damaging fertility. Suspected of damaging the unborn child' },
  { code: 'H362', text: 'May cause harm to breast-fed children' },
  { code: 'H370', text: 'Causes damage to organs' },
  { code: 'H371', text: 'May cause damage to organs' },
  { code: 'H372', text: 'Causes damage to organs through prolonged or repeated exposure' },
  { code: 'H373', text: 'May cause damage to organs through prolonged or repeated exposure' },

  // Environmental hazards (H400-H420)
  { code: 'H400', text: 'Very toxic to aquatic life' },
  { code: 'H410', text: 'Very toxic to aquatic life with long lasting effects' },
  { code: 'H411', text: 'Toxic to aquatic life with long lasting effects' },
  { code: 'H412', text: 'Harmful to aquatic life with long lasting effects' },
  { code: 'H413', text: 'May cause long lasting harmful effects to aquatic life' },
  { code: 'H420', text: 'Harms public health and the environment by destroying ozone in the upper atmosphere' },
];

/**
 * Seeds verified CLP/GHS hazard reference data (hazard classes and H-statements).
 *
 * This seeder populates:
 * - HazardClass table: ~33 CLP hazard classes with CMR flags, pictograms, signal words
 * - HazardStatement table: ~90+ H-statements with translations for all 24 EU languages
 *
 * Data sources:
 * - Hazard classes: Hardcoded from CLP Regulation (EC) No 1272/2008, Annex I
 * - H-statements: mhchem/hpstatements (https://github.com/mhchem/hpstatements)
 *   - License: CC BY 4.0 (© European Union, https://eur-lex.europa.eu, 1998-2025)
 *   - Provides translations for all 24 EU official languages
 *
 * Key behaviors:
 * - Idempotent: checks if data exists before seeding, skips if already seeded
 * - Seeds classes before statements (for future FK support)
 * - Uses mhchem as primary source, falls back to hardcoded English-only if unavailable
 */
export class HazardReferenceSeeder {
  constructor(private readonly orm: MikroORM) {}

  /**
   * Seeds hazard classes from HAZARD_CLASSES reference data.
   *
   * @returns Seeder result with count and status
   */
  async seedHazardClasses(): Promise<HazardReferenceSeederResult> {
    const em = this.orm.em.fork();

    // Check if already seeded
    const existingCount = await em.count(HazardClass, {});
    if (existingCount > 0) {
      return {
        seeded: false,
        skipped: true,
        count: existingCount,
        message: `Hazard classes already seeded (${existingCount} records), skipping.`,
      };
    }

    // Seed all hazard classes
    return await em.transactional(async (txEm: EntityManager) => {
      for (const hc of HAZARD_CLASSES) {
        const entity = txEm.create(HazardClass, {
          code: hc.code,
          fullName: hc.fullName,
          hazardType: hc.hazardType,
          pictogram: hc.pictogram,
          signalWord: hc.signalWord,
          isCmr: hc.isCmr,
        });
        txEm.persist(entity);
      }

      await txEm.flush();

      return {
        seeded: true,
        skipped: false,
        count: HAZARD_CLASSES.length,
        message: `Seeded ${HAZARD_CLASSES.length} hazard classes.`,
      };
    });
  }

  /**
   * Seeds H-statements from mhchem data source (primary) or fallback (if unavailable).
   *
   * Primary source: mhchem/hpstatements (https://github.com/mhchem/hpstatements)
   * - Provides translations for all 24 EU official languages
   * - Licensed under CC BY 4.0
   *
   * Fallback: Hardcoded English-only data (FALLBACK_HAZARD_STATEMENTS)
   * - Only used when mhchem fetch fails
   *
   * @returns Seeder result with count, status, and languages loaded
   */
  async seedHazardStatements(): Promise<HazardReferenceSeederResult> {
    const em = this.orm.em.fork();

    // Check if already seeded
    const existingCount = await em.count(HazardStatement, {});
    if (existingCount > 0) {
      return {
        seeded: false,
        skipped: true,
        count: existingCount,
        message: `Hazard statements already seeded (${existingCount} records), skipping.`,
      };
    }

    // Try to load from mhchem (primary source)
    const mhchemResult = await loadHStatementsFromMhchem();

    if (mhchemResult.success && mhchemResult.statements.length > 0) {
      // Use mhchem data
      return await this.seedFromMhchem(em, mhchemResult.statements, mhchemResult.languagesLoaded);
    }

    // Fallback to hardcoded English-only data
    console.warn(
      'WARNING: mhchem data source unavailable, using fallback English-only H-statements.'
    );
    console.warn('Errors:', mhchemResult.errors.join(', '));

    return await this.seedFromFallback(em);
  }

  /**
   * Seeds H-statements from mhchem data with full translations.
   */
  private async seedFromMhchem(
    em: EntityManager,
    statements: HStatementWithTranslations[],
    languagesLoaded: EuLanguage[]
  ): Promise<HazardReferenceSeederResult> {
    return await em.transactional(async (txEm: EntityManager) => {
      for (const hs of statements) {
        const entity = txEm.create(HazardStatement, {
          code: hs.code,
          translations: hs.translations,
        });
        txEm.persist(entity);
      }

      await txEm.flush();

      return {
        seeded: true,
        skipped: false,
        count: statements.length,
        message: `Seeded ${statements.length} hazard statements with ${languagesLoaded.length} language translations from mhchem.`,
        languagesLoaded,
        usedFallback: false,
      };
    });
  }

  /**
   * Seeds H-statements from fallback hardcoded English-only data.
   */
  private async seedFromFallback(em: EntityManager): Promise<HazardReferenceSeederResult> {
    return await em.transactional(async (txEm: EntityManager) => {
      for (const hs of FALLBACK_HAZARD_STATEMENTS) {
        const entity = txEm.create(HazardStatement, {
          code: hs.code,
          translations: { en: hs.text },
        });
        txEm.persist(entity);
      }

      await txEm.flush();

      return {
        seeded: true,
        skipped: false,
        count: FALLBACK_HAZARD_STATEMENTS.length,
        message: `Seeded ${FALLBACK_HAZARD_STATEMENTS.length} hazard statements with English-only translations (fallback).`,
        languagesLoaded: ['en'],
        usedFallback: true,
      };
    });
  }

  /**
   * Seeds all hazard reference data (classes and statements).
   *
   * Seeds classes first, then statements.
   *
   * @returns Combined result for classes and statements
   */
  async seedAll(): Promise<{
    classes: HazardReferenceSeederResult;
    statements: HazardReferenceSeederResult;
  }> {
    const classes = await this.seedHazardClasses();
    const statements = await this.seedHazardStatements();

    return { classes, statements };
  }
}

// Re-export for backwards compatibility (now marked as fallback-only)
export { FALLBACK_HAZARD_STATEMENTS as HAZARD_STATEMENTS };
