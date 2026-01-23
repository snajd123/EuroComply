import { UnitDefinition, UnitSystem, type MikroORM } from '@eurocomply/database';
import type { UnitsRepository, UnitData } from './units.js';

export { createUnitsRouter, type UnitsRepository, type UnitData } from './units.js';

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
