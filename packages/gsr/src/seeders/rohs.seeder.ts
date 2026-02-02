// packages/gsr/src/seeders/rohs.seeder.ts
import type { EntityManager } from '@mikro-orm/postgresql';
import { createId } from '@paralleldrive/cuid2';
import { RegistrySource, RegistrySourceName } from '../entities/RegistrySource.js';
import { RegulatoryList } from '../entities/RegulatoryList.js';
import { SubstanceListEntry } from '../entities/SubstanceListEntry.js';
import { ListingStatus } from '../enums/ListingStatus.js';
import { ThresholdUnit } from '../enums/ThresholdUnit.js';
import { ThresholdOperator } from '../enums/ThresholdOperator.js';
import { ProductScope } from '../enums/ProductScope.js';
import { Substance } from '@eurocomply/database';

/**
 * RoHS Directive 2011/65/EU Annex II restricted substances.
 * These are fixed by the directive and rarely change.
 */
export const ROHS_SUBSTANCES = [
  { cas: '7439-92-1', name: 'Lead (Pb)', threshold: 0.1 },
  { cas: '7439-97-6', name: 'Mercury (Hg)', threshold: 0.1 },
  { cas: '7440-43-9', name: 'Cadmium (Cd)', threshold: 0.01 }, // Lower threshold
  { cas: '18540-29-9', name: 'Hexavalent chromium (Cr VI)', threshold: 0.1 },
  { cas: '1336-36-3', name: 'Polybrominated biphenyls (PBB)', threshold: 0.1 },
  // Note: PBDE is a group, will need special handling or use EC number
  { cas: '117-81-7', name: 'Bis(2-ethylhexyl) phthalate (DEHP)', threshold: 0.1 },
  { cas: '85-68-7', name: 'Butyl benzyl phthalate (BBP)', threshold: 0.1 },
  { cas: '84-74-2', name: 'Dibutyl phthalate (DBP)', threshold: 0.1 },
  { cas: '84-69-5', name: 'Diisobutyl phthalate (DIBP)', threshold: 0.1 },
] as const;

export interface RohsSeederResult {
  seeded: boolean;
  skipped: boolean;
  entryCount: number;
  skippedCount: number;
  version: string;
  message: string;
}

/**
 * Seeds RoHS Directive Annex II restricted substances.
 *
 * RoHS (Restriction of Hazardous Substances) restricts 10 substances
 * in electrical and electronic equipment (EEE). The list is hardcoded
 * because it rarely changes and has fixed thresholds.
 */
export class RohsSeeder {
  constructor(private readonly em: EntityManager) {}

  /**
   * Seeds RoHS substances to the database.
   *
   * @param version - Version identifier (default: current month YYYY-MM)
   * @returns RohsSeederResult with counts and status
   */
  async seed(version?: string): Promise<RohsSeederResult> {
    const effectiveVersion = version || this.getCurrentVersion();

    // Check if already seeded with same version
    const existingSource = await this.em.findOne(RegistrySource, {
      name: RegistrySourceName.ROHS,
    });

    if (existingSource?.version === effectiveVersion) {
      return {
        seeded: false,
        skipped: true,
        entryCount: existingSource.recordCount ?? 0,
        skippedCount: 0,
        version: effectiveVersion,
        message: `RoHS already seeded with version ${effectiveVersion}, skipping.`,
      };
    }

    return await this.em.transactional(async (txEm) => {
      const regulatoryList = await this.getOrCreateRegulatoryList(txEm);

      let entryCount = 0;
      let skippedCount = 0;

      for (const rohsSubstance of ROHS_SUBSTANCES) {
        const substance = await txEm.findOne(Substance, { casNumber: rohsSubstance.cas });

        if (!substance) {
          console.warn(`RoHS seeder: Substance not found - CAS: ${rohsSubstance.cas}, Name: ${rohsSubstance.name}`);
          skippedCount++;
          continue;
        }

        // Check if entry already exists
        const existingEntry = await txEm.findOne(SubstanceListEntry, {
          substance,
          regulatoryList,
        });

        if (existingEntry) {
          // Update existing entry
          existingEntry.threshold = rohsSubstance.threshold;
          existingEntry.thresholdUnit = ThresholdUnit.PERCENT_BY_WEIGHT;
          existingEntry.thresholdOperator = ThresholdOperator.LTE;
        } else {
          // Create new entry
          const entry = txEm.create(SubstanceListEntry, {
            id: createId(),
            substance,
            regulatoryList,
            status: ListingStatus.RESTRICTED,
            threshold: rohsSubstance.threshold,
            thresholdUnit: ThresholdUnit.PERCENT_BY_WEIGHT,
            thresholdOperator: ThresholdOperator.LTE,
            scopes: [ProductScope.EEE], // RoHS only applies to EEE
            sourceReference: 'RoHS Directive 2011/65/EU, Annex II',
            conditions: {
              evaluationScope: 'HOMOGENEOUS_MATERIAL',
              note: 'Maximum concentration value by weight in homogeneous materials',
            },
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          txEm.persist(entry);
        }

        entryCount++;
      }

      await txEm.flush();
      await this.updateRegistrySource(txEm, effectiveVersion, entryCount);

      return {
        seeded: true,
        skipped: false,
        entryCount,
        skippedCount,
        version: effectiveVersion,
        message: `Seeded ${entryCount} RoHS entries (${skippedCount} skipped).`,
      };
    });
  }

  /**
   * Gets or creates the RoHS regulatory list.
   */
  private async getOrCreateRegulatoryList(txEm: EntityManager): Promise<RegulatoryList> {
    let list = await txEm.findOne(RegulatoryList, { code: 'ROHS' });

    if (!list) {
      list = txEm.create(RegulatoryList, {
        id: createId(),
        code: 'ROHS',
        name: 'RoHS Directive Restricted Substances',
        jurisdiction: 'EU',
        publisher: 'European Commission',
        description:
          'Restriction of Hazardous Substances in Electrical and Electronic Equipment (Directive 2011/65/EU)',
        sourceUrl: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32011L0065',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await txEm.persistAndFlush(list);
    }

    return list;
  }

  /**
   * Updates or creates the registry source record.
   */
  private async updateRegistrySource(txEm: EntityManager, version: string, recordCount: number): Promise<void> {
    const existing = await txEm.findOne(RegistrySource, {
      name: RegistrySourceName.ROHS,
    });

    if (existing) {
      existing.version = version;
      existing.recordCount = recordCount;
      existing.lastSyncedAt = new Date();
      await txEm.persistAndFlush(existing);
    } else {
      const now = new Date();
      const source = txEm.create(RegistrySource, {
        name: RegistrySourceName.ROHS,
        version,
        recordCount,
        sourceUrl: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32011L0065',
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await txEm.persistAndFlush(source);
    }
  }

  /**
   * Gets current date in YYYY-MM format for default version.
   */
  private getCurrentVersion(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
