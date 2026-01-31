import { UnitDefinition, UnitSystem, Substance, SubstanceAlias, CategoryType, type MikroORM } from '@eurocomply/database';
import type { UnitsRepository, UnitData } from './units.js';
import type { SubstancesRepository, SubstanceData, SubstanceAliasData } from './substances.js';
import type { CategoriesRepository, CategoryData } from './categories.js';

export { createUnitsRouter, type UnitsRepository, type UnitData } from './units.js';
export { createSubstancesRouter, type SubstancesRepository, type SubstanceData, type SubstanceAliasData } from './substances.js';
export { createCategoriesRouter, type CategoriesRepository, type CategoryData } from './categories.js';

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
 * Uses raw SQL for regulatory list queries since GSR entities are in a separate package.
 */
export function createSubstancesRepository(orm: MikroORM): SubstancesRepository {
  return {
    findAll: async (filter): Promise<SubstanceData[]> => {
      const em = orm.em.fork();

      // If filtering by list, use a JOIN query
      if (filter?.listIdentifier) {
        const sql = `
          SELECT DISTINCT s.*
          FROM public.substance s
          JOIN public.substance_list_entry sle ON sle.substance_id = s.id
          JOIN public.regulatory_list rl ON rl.id = sle.list_id
          WHERE rl.identifier = $1
          ${filter.search ? "AND s.primary_name ILIKE $2" : ''}
          ${filter.active !== undefined ? `AND s.is_active = ${filter.active}` : ''}
          ORDER BY s.primary_name
        `;
        const params = filter.search
          ? [filter.listIdentifier, `%${filter.search}%`]
          : [filter.listIdentifier];
        const rows = await em.execute(sql, params) as SubstanceRow[];
        return Promise.all(rows.map((row) => serializeSubstanceRow(em, row)));
      }

      // Standard query without list filter
      const qb = em.createQueryBuilder(Substance);
      if (filter?.search) qb.andWhere({ primaryName: { $ilike: `%${filter.search}%` } });
      if (filter?.active !== undefined) qb.andWhere({ isActive: filter.active });
      const substances = await qb.getResultList();
      return Promise.all(substances.map((s) => serializeSubstanceWithLists(em, s)));
    },

    findByCasNumber: async (cas): Promise<SubstanceData | null> => {
      const em = orm.em.fork();
      const substance = await em.findOne(Substance, { casNumber: cas });
      if (!substance) return null;
      return serializeSubstanceWithLists(em, substance);
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
      // Find all substances that appear on any regulatory list
      const sql = `
        SELECT DISTINCT s.*, array_agg(DISTINCT rl.identifier) as list_identifiers
        FROM public.substance s
        JOIN public.substance_list_entry sle ON sle.substance_id = s.id
        JOIN public.regulatory_list rl ON rl.id = sle.list_id
        GROUP BY s.id
        ORDER BY s.primary_name
      `;
      const rows = await em.execute(sql) as SubstanceRowWithLists[];
      return rows.map((row) => ({
        id: row.id,
        casNumber: row.cas_number,
        ecNumber: row.ec_number ?? undefined,
        primaryName: row.primary_name,
        description: row.description ?? undefined,
        molecularWeight: row.molecular_weight ?? undefined,
        molecularFormula: row.molecular_formula ?? undefined,
        smiles: row.smiles ?? undefined,
        inchiKey: row.inchi_key ?? undefined,
        iupacName: row.iupac_name ?? undefined,
        echaUrl: row.echa_url ?? undefined,
        isActive: row.is_active,
        regulatoryLists: row.list_identifiers ?? [],
      }));
    },
  };
}

/** Raw substance row from SQL query */
interface SubstanceRow {
  id: string;
  cas_number: string;
  ec_number: string | null;
  primary_name: string;
  description: string | null;
  molecular_weight: string | null;
  molecular_formula: string | null;
  smiles: string | null;
  inchi_key: string | null;
  iupac_name: string | null;
  echa_url: string | null;
  is_active: boolean;
}

/** Raw substance row with aggregated list identifiers */
interface SubstanceRowWithLists extends SubstanceRow {
  list_identifiers: string[] | null;
}

/** Fetch regulatory list memberships for a substance */
async function getRegulatoryLists(em: { execute: (sql: string, params?: unknown[]) => Promise<unknown[]> }, substanceId: string): Promise<string[]> {
  const sql = `
    SELECT rl.identifier
    FROM public.substance_list_entry sle
    JOIN public.regulatory_list rl ON rl.id = sle.list_id
    WHERE sle.substance_id = $1
  `;
  const rows = await em.execute(sql, [substanceId]) as { identifier: string }[];
  return rows.map((r) => r.identifier);
}

/** Serialize a Substance entity with regulatory list lookups */
async function serializeSubstanceWithLists(em: { execute: (sql: string, params?: unknown[]) => Promise<unknown[]> }, s: Substance): Promise<SubstanceData> {
  const regulatoryLists = await getRegulatoryLists(em, s.id);
  return {
    id: s.id,
    casNumber: s.casNumber,
    ecNumber: s.ecNumber ?? undefined,
    primaryName: s.primaryName,
    description: s.description ?? undefined,
    molecularWeight: s.molecularWeight ?? undefined,
    molecularFormula: s.molecularFormula ?? undefined,
    smiles: s.smiles ?? undefined,
    inchiKey: s.inchiKey ?? undefined,
    iupacName: s.iupacName ?? undefined,
    echaUrl: s.echaUrl ?? undefined,
    isActive: s.isActive,
    regulatoryLists: regulatoryLists.length > 0 ? regulatoryLists : undefined,
  };
}

/** Serialize a raw substance row with regulatory list lookups */
async function serializeSubstanceRow(em: { execute: (sql: string, params?: unknown[]) => Promise<unknown[]> }, row: SubstanceRow): Promise<SubstanceData> {
  const regulatoryLists = await getRegulatoryLists(em, row.id);
  return {
    id: row.id,
    casNumber: row.cas_number,
    ecNumber: row.ec_number ?? undefined,
    primaryName: row.primary_name,
    description: row.description ?? undefined,
    molecularWeight: row.molecular_weight ?? undefined,
    molecularFormula: row.molecular_formula ?? undefined,
    smiles: row.smiles ?? undefined,
    inchiKey: row.inchi_key ?? undefined,
    iupacName: row.iupac_name ?? undefined,
    echaUrl: row.echa_url ?? undefined,
    isActive: row.is_active,
    regulatoryLists: regulatoryLists.length > 0 ? regulatoryLists : undefined,
  };
}

/**
 * Category row from raw SQL query.
 */
interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  path: string;
  type: string;
  target_type: string;
  depth: number;
  parent_id: string | null;
  is_active: boolean;
}

/**
 * Map raw database row to CategoryData interface.
 */
function mapRowToCategory(row: CategoryRow): CategoryData {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    path: row.path,
    type: row.type as CategoryType,
    targetType: row.target_type,
    depth: row.depth,
    parentId: row.parent_id ?? undefined,
    isActive: row.is_active,
  };
}

/**
 * Create a MikroORM-based categories repository for production use.
 *
 * Categories are stored in public.category for system-wide taxonomy.
 * Uses raw SQL with em.execute() for direct table access.
 */
export function createCategoriesRepository(orm: MikroORM): CategoriesRepository {
  return {
    findAll: async (filter): Promise<CategoryData[]> => {
      const em = orm.em.fork();
      let sql = 'SELECT * FROM public.category WHERE 1=1';
      const params: unknown[] = [];

      if (filter?.targetType) {
        sql += ' AND target_type = ?';
        params.push(filter.targetType);
      }
      if (filter?.depth !== undefined) {
        sql += ' AND depth = ?';
        params.push(filter.depth);
      }
      if (filter?.active !== undefined) {
        sql += ' AND is_active = ?';
        params.push(filter.active);
      }

      sql += ' ORDER BY path';

      const rows = await em.execute<CategoryRow[]>(sql, params);
      return rows.map(mapRowToCategory);
    },

    findById: async (id): Promise<CategoryData | null> => {
      const em = orm.em.fork();
      const rows = await em.execute<CategoryRow[]>(
        'SELECT * FROM public.category WHERE id = ?',
        [id]
      );
      const row = rows[0];
      return row ? mapRowToCategory(row) : null;
    },

    findByPath: async (path): Promise<CategoryData | null> => {
      const em = orm.em.fork();
      const rows = await em.execute<CategoryRow[]>(
        'SELECT * FROM public.category WHERE path::text = ?',
        [path]
      );
      const row = rows[0];
      return row ? mapRowToCategory(row) : null;
    },

    findRoots: async (targetType): Promise<CategoryData[]> => {
      const em = orm.em.fork();
      let sql = 'SELECT * FROM public.category WHERE depth = 0 AND is_active = true';
      const params: unknown[] = [];

      if (targetType) {
        sql += ' AND target_type = ?';
        params.push(targetType);
      }

      sql += ' ORDER BY name';

      const rows = await em.execute<CategoryRow[]>(sql, params);
      return rows.map(mapRowToCategory);
    },

    findChildren: async (parentId): Promise<CategoryData[]> => {
      const em = orm.em.fork();
      const rows = await em.execute<CategoryRow[]>(
        'SELECT * FROM public.category WHERE parent_id = ? AND is_active = true ORDER BY name',
        [parentId]
      );
      return rows.map(mapRowToCategory);
    },

    findAncestors: async (id): Promise<CategoryData[]> => {
      const em = orm.em.fork();

      // First get the category to get its path
      const catRows = await em.execute<CategoryRow[]>(
        'SELECT * FROM public.category WHERE id = ?',
        [id]
      );
      const category = catRows[0];
      if (!category) return [];
      if (category.depth === 0) return [];

      // Use LTREE @> operator to find ancestors (excluding self)
      const rows = await em.execute<CategoryRow[]>(
        `SELECT * FROM public.category
         WHERE path @> ?::ltree AND path != ?::ltree
         ORDER BY depth ASC`,
        [category.path, category.path]
      );
      return rows.map(mapRowToCategory);
    },
  };
}
