import { UnitDefinition, UnitSystem, Substance, SubstanceAlias, type MikroORM } from '@eurocomply/database';
import type { UnitsRepository, UnitData } from './units.js';
import type { SubstancesRepository, SubstanceData, SubstanceAliasData } from './substances.js';

export { createUnitsRouter, type UnitsRepository, type UnitData } from './units.js';
export { createSubstancesRouter, type SubstancesRepository, type SubstanceData, type SubstanceAliasData } from './substances.js';

/**
 * Create a MikroORM-based units repository for production use.
 */
export function createUnitsRepository(orm: MikroORM): UnitsRepository {
  return {
    findAll: async (filter): Promise<UnitData[]> => {
      const em = orm.em.fork();
      const qb = em.createQueryBuilder(UnitDefinition);
      if (filter?.system) qb.andWhere({ system: filter.system });
      if (filter?.active !== undefined) qb.andWhere({ isActive: filter.active });
      const units = await qb.getResultList();
      return units.map((u: UnitDefinition) => ({
        id: u.id,
        code: u.code,
        name: u.name,
        symbol: u.symbol,
        system: u.system,
        factor: u.factor,
        isBase: u.isBase,
        isActive: u.isActive,
      }));
    },
    findByCode: async (code): Promise<UnitData | null> => {
      const em = orm.em.fork();
      const unit = await em.findOne(UnitDefinition, { code });
      if (!unit) return null;
      return {
        id: unit.id,
        code: unit.code,
        name: unit.name,
        symbol: unit.symbol,
        system: unit.system,
        factor: unit.factor,
        isBase: unit.isBase,
        isActive: unit.isActive,
      };
    },
    findBaseUnit: async (system): Promise<UnitData | null> => {
      const em = orm.em.fork();
      const unit = await em.findOne(UnitDefinition, { system, isBase: true });
      if (!unit) return null;
      return {
        id: unit.id,
        code: unit.code,
        name: unit.name,
        symbol: unit.symbol,
        system: unit.system,
        factor: unit.factor,
        isBase: unit.isBase,
        isActive: unit.isActive,
      };
    },
  };
}

/**
 * Create a MikroORM-based substances repository for production use.
 */
export function createSubstancesRepository(orm: MikroORM): SubstancesRepository {
  return {
    findAll: async (filter): Promise<SubstanceData[]> => {
      const em = orm.em.fork();
      const qb = em.createQueryBuilder(Substance);
      if (filter?.svhc !== undefined) qb.andWhere({ isSvhc: filter.svhc });
      if (filter?.restricted !== undefined) qb.andWhere({ isRestricted: filter.restricted });
      if (filter?.authorization !== undefined) qb.andWhere({ requiresAuthorization: filter.authorization });
      if (filter?.search) qb.andWhere({ primaryName: { $ilike: `%${filter.search}%` } });
      if (filter?.active !== undefined) qb.andWhere({ isActive: filter.active });
      const substances = await qb.getResultList();
      return substances.map(serializeSubstance);
    },
    findByCasNumber: async (cas): Promise<SubstanceData | null> => {
      const em = orm.em.fork();
      const substance = await em.findOne(Substance, { casNumber: cas });
      if (!substance) return null;
      return serializeSubstance(substance);
    },
    findAliases: async (substanceId): Promise<SubstanceAliasData[]> => {
      const em = orm.em.fork();
      const aliases = await em.find(SubstanceAlias, { substance: { id: substanceId } });
      return aliases.map(a => ({
        id: a.id,
        substanceId: a.substance.id,
        name: a.name,
        type: a.type,
        language: a.language,
      }));
    },
    findRegulated: async (): Promise<SubstanceData[]> => {
      const em = orm.em.fork();
      const substances = await em.find(Substance, {
        $or: [{ isSvhc: true }, { isRestricted: true }, { requiresAuthorization: true }],
      });
      return substances.map(serializeSubstance);
    },
  };
}

function serializeSubstance(s: Substance): SubstanceData {
  return {
    id: s.id,
    casNumber: s.casNumber,
    ecNumber: s.ecNumber,
    primaryName: s.primaryName,
    description: s.description,
    molecularWeight: s.molecularWeight,
    molecularFormula: s.molecularFormula,
    isSvhc: s.isSvhc,
    requiresAuthorization: s.requiresAuthorization,
    isRestricted: s.isRestricted,
    restrictionConditions: s.restrictionConditions,
    sunsetDate: s.sunsetDate,
    latestApplicationDate: s.latestApplicationDate,
    echaUrl: s.echaUrl,
    isActive: s.isActive,
  };
}
