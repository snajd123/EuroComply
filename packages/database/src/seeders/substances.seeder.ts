import type { EntityManager } from '@mikro-orm/core';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Substance } from '../entities/Substance.js';
import { SubstanceAlias } from '../entities/SubstanceAlias.js';
import { AliasType } from '../entities/enums/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface SubstanceSeederResult {
  seeded: boolean;
  skipped: boolean;
  substanceCount: number;
  aliasCount: number;
  version: string;
  message: string;
}

interface AliasData {
  name: string;
  type: string;
  language?: string;
}

interface SubstanceData {
  casNumber: string;
  ecNumber?: string;
  primaryName: string;
  description?: string;
  molecularWeight?: string;
  molecularFormula?: string;
  isSvhc?: boolean;
  requiresAuthorization?: boolean;
  isRestricted?: boolean;
  restrictionConditions?: string;
  sunsetDate?: string;
  latestApplicationDate?: string;
  echaUrl?: string;
  aliases?: AliasData[];
}

interface SubstanceBundle {
  version: string;
  generatedAt: string;
  totalSubstances: number;
  substances: SubstanceData[];
}

/**
 * Seeds substances from the ECHA data bundle.
 *
 * Idempotent: skips seeding if substances already exist in the database.
 */
export class SubstancesSeeder {
  constructor(private readonly em: EntityManager) {}

  async seed(): Promise<SubstanceSeederResult> {
    const em = this.em.fork();

    // Load data bundle
    const bundlePath = join(__dirname, '..', 'data', 'echa-substances.json');
    const raw = readFileSync(bundlePath, 'utf-8');
    const bundle: SubstanceBundle = JSON.parse(raw);
    const version = bundle.version;

    // Check if seeding needed (simple check: any substances exist?)
    const existingCount = await em.count(Substance);
    if (existingCount > 0) {
      return {
        seeded: false,
        skipped: true,
        substanceCount: existingCount,
        aliasCount: 0,
        version,
        message: `Substances already seeded (${existingCount} found), skipping.`,
      };
    }

    let substanceCount = 0;
    let aliasCount = 0;

    // Seed substances
    for (const s of bundle.substances) {
      const substance = em.create(Substance, {
        casNumber: s.casNumber,
        ecNumber: s.ecNumber,
        primaryName: s.primaryName,
        description: s.description,
        molecularWeight: s.molecularWeight,
        molecularFormula: s.molecularFormula,
        isSvhc: s.isSvhc ?? false,
        requiresAuthorization: s.requiresAuthorization ?? false,
        isRestricted: s.isRestricted ?? false,
        restrictionConditions: s.restrictionConditions,
        sunsetDate: s.sunsetDate ? new Date(s.sunsetDate) : undefined,
        latestApplicationDate: s.latestApplicationDate ? new Date(s.latestApplicationDate) : undefined,
        echaUrl: s.echaUrl,
        sourceVersion: version,
        isActive: true,
      });

      em.persist(substance);
      substanceCount++;

      // Seed aliases for this substance
      if (s.aliases && s.aliases.length > 0) {
        for (const a of s.aliases) {
          const alias = em.create(SubstanceAlias, {
            substance,
            name: a.name,
            type: a.type as AliasType,
            language: a.language ?? 'en',
          });
          em.persist(alias);
          aliasCount++;
        }
      }
    }

    await em.flush();

    return {
      seeded: true,
      skipped: false,
      substanceCount,
      aliasCount,
      version,
      message: `Seeded ${substanceCount} substances with ${aliasCount} aliases (${version}).`,
    };
  }
}
