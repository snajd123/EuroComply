// packages/gsr/src/seeders/hazard-reference.seeder.ts
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { HazardClass, HazardType, SignalWord } from '../entities/HazardClass.js';
import { HazardStatement } from '../entities/HazardStatement.js';
import { HAZARD_CLASSES } from '../reference-data/hazard-classes.js';

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
}

/**
 * Definition of an H-statement for seeding.
 */
export interface HazardStatementDefinition {
  /** H-code (e.g., H300, H350i) */
  code: string;
  /** English text of the statement */
  text: string;
}

/**
 * CLP/GHS H-statements (hazard statements) for reference data seeding.
 *
 * Organized by hazard type:
 * - H200-H299: Physical hazards
 * - H300-H399: Health hazards
 * - H400-H499: Environmental hazards
 *
 * Reference: CLP Regulation (EC) No 1272/2008 Annex III
 */
export const HAZARD_STATEMENTS: HazardStatementDefinition[] = [
  // ============================================================================
  // PHYSICAL HAZARDS (H200-H299)
  // ============================================================================

  // Explosives
  { code: 'H200', text: 'Unstable explosive' },
  { code: 'H201', text: 'Explosive; mass explosion hazard' },
  { code: 'H202', text: 'Explosive; severe projection hazard' },
  { code: 'H203', text: 'Explosive; fire, blast or projection hazard' },
  { code: 'H204', text: 'Fire or projection hazard' },
  { code: 'H205', text: 'May mass explode in fire' },

  // Flammable gases
  { code: 'H220', text: 'Extremely flammable gas' },
  { code: 'H221', text: 'Flammable gas' },

  // Flammable liquids
  { code: 'H224', text: 'Extremely flammable liquid and vapour' },
  { code: 'H225', text: 'Highly flammable liquid and vapour' },
  { code: 'H226', text: 'Flammable liquid and vapour' },

  // Flammable solids
  { code: 'H228', text: 'Flammable solid' },

  // Self-reactive / heating hazards
  { code: 'H240', text: 'Heating may cause an explosion' },
  { code: 'H241', text: 'Heating may cause a fire or explosion' },
  { code: 'H242', text: 'Heating may cause a fire' },

  // Oxidising
  { code: 'H270', text: 'May cause or intensify fire; oxidiser' },
  { code: 'H271', text: 'May cause fire or explosion; strong oxidiser' },
  { code: 'H272', text: 'May intensify fire; oxidiser' },

  // Gases under pressure
  { code: 'H280', text: 'Contains gas under pressure; may explode if heated' },
  { code: 'H281', text: 'Contains refrigerated gas; may cause cryogenic burns or injury' },

  // Corrosive to metals
  { code: 'H290', text: 'May be corrosive to metals' },

  // ============================================================================
  // HEALTH HAZARDS - ACUTE TOXICITY (H300-H312)
  // ============================================================================

  // Oral
  { code: 'H300', text: 'Fatal if swallowed' },
  { code: 'H301', text: 'Toxic if swallowed' },
  { code: 'H302', text: 'Harmful if swallowed' },

  // Dermal
  { code: 'H310', text: 'Fatal in contact with skin' },
  { code: 'H311', text: 'Toxic in contact with skin' },
  { code: 'H312', text: 'Harmful in contact with skin' },

  // Skin corrosion/irritation
  { code: 'H314', text: 'Causes severe skin burns and eye damage' },
  { code: 'H315', text: 'Causes skin irritation' },

  // Sensitisation
  { code: 'H317', text: 'May cause an allergic skin reaction' },

  // Eye damage/irritation
  { code: 'H318', text: 'Causes serious eye damage' },
  { code: 'H319', text: 'Causes serious eye irritation' },

  // Inhalation
  { code: 'H330', text: 'Fatal if inhaled' },
  { code: 'H331', text: 'Toxic if inhaled' },
  { code: 'H332', text: 'Harmful if inhaled' },

  // Respiratory sensitisation
  { code: 'H334', text: 'May cause allergy or asthma symptoms or breathing difficulties if inhaled' },

  // Narcotic effects / respiratory irritation
  { code: 'H335', text: 'May cause respiratory irritation' },
  { code: 'H336', text: 'May cause drowsiness or dizziness' },

  // ============================================================================
  // HEALTH HAZARDS - CMR (H340-H373)
  // ============================================================================

  // Germ cell mutagenicity
  { code: 'H340', text: 'May cause genetic defects' },
  { code: 'H341', text: 'Suspected of causing genetic defects' },

  // Carcinogenicity
  { code: 'H350', text: 'May cause cancer' },
  { code: 'H350i', text: 'May cause cancer by inhalation' },
  { code: 'H351', text: 'Suspected of causing cancer' },

  // Reproductive toxicity - known effects
  { code: 'H360', text: 'May damage fertility or the unborn child' },
  { code: 'H360F', text: 'May damage fertility' },
  { code: 'H360D', text: 'May damage the unborn child' },
  { code: 'H360FD', text: 'May damage fertility. May damage the unborn child' },
  { code: 'H360Fd', text: 'May damage fertility. Suspected of damaging the unborn child' },
  { code: 'H360Df', text: 'May damage the unborn child. Suspected of damaging fertility' },

  // Reproductive toxicity - suspected effects
  { code: 'H361', text: 'Suspected of damaging fertility or the unborn child' },
  { code: 'H361f', text: 'Suspected of damaging fertility' },
  { code: 'H361d', text: 'Suspected of damaging the unborn child' },
  { code: 'H361fd', text: 'Suspected of damaging fertility. Suspected of damaging the unborn child' },

  // Lactation
  { code: 'H362', text: 'May cause harm to breast-fed children' },

  // STOT-SE (Specific Target Organ Toxicity - Single Exposure)
  { code: 'H370', text: 'Causes damage to organs' },
  { code: 'H371', text: 'May cause damage to organs' },

  // STOT-RE (Specific Target Organ Toxicity - Repeated Exposure)
  { code: 'H372', text: 'Causes damage to organs through prolonged or repeated exposure' },
  { code: 'H373', text: 'May cause damage to organs through prolonged or repeated exposure' },

  // Aspiration hazard
  { code: 'H304', text: 'May be fatal if swallowed and enters airways' },

  // ============================================================================
  // ENVIRONMENTAL HAZARDS (H400-H420)
  // ============================================================================

  // Aquatic acute
  { code: 'H400', text: 'Very toxic to aquatic life' },

  // Aquatic chronic
  { code: 'H410', text: 'Very toxic to aquatic life with long lasting effects' },
  { code: 'H411', text: 'Toxic to aquatic life with long lasting effects' },
  { code: 'H412', text: 'Harmful to aquatic life with long lasting effects' },
  { code: 'H413', text: 'May cause long lasting harmful effects to aquatic life' },

  // Ozone layer
  { code: 'H420', text: 'Harms public health and the environment by destroying ozone in the upper atmosphere' },
];

/**
 * Seeds verified CLP/GHS hazard reference data (hazard classes and H-statements).
 *
 * This seeder populates:
 * - HazardClass table: ~33 CLP hazard classes with CMR flags, pictograms, signal words
 * - HazardStatement table: ~50 H-statements with English translations
 *
 * Key behaviors:
 * - Idempotent: checks if data exists before seeding, skips if already seeded
 * - Seeds classes before statements (for future FK support)
 *
 * Reference: CLP Regulation (EC) No 1272/2008, Annex I & III
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
   * Seeds H-statements from HAZARD_STATEMENTS reference data.
   *
   * @returns Seeder result with count and status
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

    // Seed all H-statements
    return await em.transactional(async (txEm: EntityManager) => {
      for (const hs of HAZARD_STATEMENTS) {
        const entity = txEm.create(HazardStatement, {
          code: hs.code,
          translations: { en: hs.text },
          // primaryHazardClass is optional, not linking for now
        });
        txEm.persist(entity);
      }

      await txEm.flush();

      return {
        seeded: true,
        skipped: false,
        count: HAZARD_STATEMENTS.length,
        message: `Seeded ${HAZARD_STATEMENTS.length} hazard statements.`,
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
