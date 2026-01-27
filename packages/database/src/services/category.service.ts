import type { FilterQuery } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import { Category, CategoryType } from '../entities/Category.js';
import { CategoryAdoption, AdoptionMode } from '../entities/CategoryAdoption.js';
import { TargetType } from '../entities/enums/index.js';

/**
 * Input for creating a new category.
 */
export interface CreateCategoryInput {
  name: string;
  description?: string;
  parentId?: string;
  type: CategoryType;
  targetType: TargetType;
  defaultProfileId?: string;
}

/**
 * Input for updating an existing category.
 */
export interface UpdateCategoryInput {
  name?: string;
  description?: string;
  type?: CategoryType;
  defaultProfileId?: string;
  isActive?: boolean;
}

/**
 * Service for managing category hierarchy using PostgreSQL LTREE.
 *
 * Categories support hierarchical relationships using LTREE paths.
 * LTREE operators (@>, <@) enable efficient ancestor/descendant queries.
 *
 * IMPORTANT: For LTREE queries, we use explicit schema-qualified table names
 * to prevent multi-tenant ambiguity in search_path resolution.
 */
export class CategoryService {
  constructor(
    private readonly em: EntityManager,
    private readonly schema: string = 'public'
  ) {}

  /**
   * Slugify a name for use in LTREE path.
   * - Converts to lowercase
   * - Replaces non-alphanumeric characters with underscore
   * - Removes leading/trailing underscores
   * - Collapses multiple underscores
   */
  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_');
  }

  /**
   * Create a new category with auto-generated LTREE path.
   *
   * Path is generated from the slugified name, prefixed with parent path if provided.
   * Throws if a category with the same path already exists.
   */
  async create(input: CreateCategoryInput): Promise<Category> {
    const slug = this.slugify(input.name);
    if (!slug) {
      throw new Error('Category name must contain at least one alphanumeric character');
    }

    let path: string;
    let depth: number;
    let parent: Category | undefined;

    if (input.parentId) {
      const foundParent = await this.em.findOne(Category, { id: input.parentId });
      if (!foundParent) {
        throw new Error(`Parent category not found: ${input.parentId}`);
      }
      parent = foundParent;
      path = `${parent.path}.${slug}`;
      depth = parent.depth + 1;
    } else {
      path = slug;
      depth = 0;
    }

    // Check for path collision
    const existing = await this.em.findOne(Category, { path });
    if (existing) {
      throw new Error(`Category with path "${path}" already exists`);
    }

    const category = new Category();
    category.name = input.name;
    category.path = path;
    category.type = input.type;
    category.targetType = input.targetType;
    category.depth = depth;

    if (input.description) {
      category.description = input.description;
    }
    if (input.defaultProfileId) {
      category.defaultProfileId = input.defaultProfileId;
    }
    if (parent) {
      category.parent = parent;
    }

    this.em.persist(category);
    await this.em.flush();

    return category;
  }

  /**
   * Update category fields.
   *
   * NOTE: Path is NOT updated to avoid breaking references.
   * If you need to move a category, use a dedicated move operation.
   */
  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    const category = await this.em.findOne(Category, { id });
    if (!category) {
      throw new Error(`Category not found: ${id}`);
    }

    if (input.name !== undefined) {
      category.name = input.name;
    }
    if (input.description !== undefined) {
      category.description = input.description;
    }
    if (input.type !== undefined) {
      category.type = input.type;
    }
    if (input.defaultProfileId !== undefined) {
      category.defaultProfileId = input.defaultProfileId;
    }
    if (input.isActive !== undefined) {
      category.isActive = input.isActive;
    }

    await this.em.flush();
    return category;
  }

  /**
   * Find a category by its exact LTREE path.
   */
  async findByPath(path: string): Promise<Category | null> {
    return this.em.findOne(Category, { path });
  }

  /**
   * Get all ancestors of a category using LTREE @> operator.
   *
   * Uses explicit schema reference to prevent multi-tenant ambiguity.
   * Returns categories ordered from root to immediate parent.
   */
  async getAncestors(id: string): Promise<Category[]> {
    const category = await this.em.findOne(Category, { id });
    if (!category) {
      throw new Error(`Category not found: ${id}`);
    }

    if (category.depth === 0) {
      return [];
    }

    // Use LTREE @> operator: parent.path @> child.path means parent is ancestor of child
    // We exclude the category itself by adding path != condition
    const result = await this.em.execute<Array<{ id: string }>>(
      `SELECT id FROM "${this.schema}".category
       WHERE path @> ?::ltree AND path != ?::ltree
       ORDER BY depth ASC`,
      [category.path, category.path]
    );

    if (result.length === 0) {
      return [];
    }

    const ids = result.map((r: { id: string }) => r.id);
    const ancestors = await this.em.find(Category, { id: { $in: ids } });

    // Sort by depth to maintain order
    return ancestors.sort((a, b) => a.depth - b.depth);
  }

  /**
   * Get all descendants of a category using LTREE <@ operator.
   *
   * Uses explicit schema reference to prevent multi-tenant ambiguity.
   * Returns categories ordered by depth.
   */
  async getDescendants(id: string): Promise<Category[]> {
    const category = await this.em.findOne(Category, { id });
    if (!category) {
      throw new Error(`Category not found: ${id}`);
    }

    // Use LTREE <@ operator: child.path <@ parent.path means child is descendant of parent
    // We exclude the category itself by adding path != condition
    const result = await this.em.execute<Array<{ id: string }>>(
      `SELECT id FROM "${this.schema}".category
       WHERE path <@ ?::ltree AND path != ?::ltree
       ORDER BY depth ASC`,
      [category.path, category.path]
    );

    if (result.length === 0) {
      return [];
    }

    const ids = result.map((r: { id: string }) => r.id);
    const descendants = await this.em.find(Category, { id: { $in: ids } });

    // Sort by depth to maintain order
    return descendants.sort((a, b) => a.depth - b.depth);
  }

  /**
   * Get direct children of a category (one level deep).
   */
  async getChildren(id: string): Promise<Category[]> {
    return this.em.find(Category, { parent: { id } });
  }

  /**
   * Get root categories (depth = 0).
   *
   * @param targetType - Optional filter by target type
   */
  async getRoots(targetType?: TargetType): Promise<Category[]> {
    const filter: FilterQuery<Category> = { depth: 0 };
    if (targetType) {
      filter.targetType = targetType;
    }
    return this.em.find(Category, filter);
  }

  /**
   * Delete a category.
   *
   * Throws if the category has children to prevent orphaning.
   */
  async delete(id: string): Promise<void> {
    const category = await this.em.findOne(Category, { id });
    if (!category) {
      throw new Error(`Category not found: ${id}`);
    }

    // Check for children
    const children = await this.em.find(Category, { parent: { id } });
    if (children.length > 0) {
      throw new Error(`Cannot delete category "${category.name}": it has children`);
    }

    await this.em.removeAndFlush(category);
  }

  /**
   * Adopt a system category for a tenant.
   *
   * Creates a CategoryAdoption linking the tenant to the system category.
   * Throws if already adopted.
   *
   * @param tenantSchema - The tenant schema name (for context, adoptions stored in tenant schema)
   * @param categoryId - The system category ID to adopt
   */
  async adoptCategory(tenantSchema: string, categoryId: string): Promise<CategoryAdoption> {
    // Check if already adopted
    const existing = await this.em.findOne(CategoryAdoption, {
      systemCategoryId: categoryId,
    });

    if (existing) {
      throw new Error(`Category ${categoryId} is already adopted by tenant`);
    }

    const adoption = new CategoryAdoption();
    adoption.systemCategoryId = categoryId;
    adoption.mode = AdoptionMode.LIVE_LINK;
    adoption.adoptedAt = new Date();

    this.em.persist(adoption);
    await this.em.flush();

    return adoption;
  }

  /**
   * Get categories adopted by a tenant.
   *
   * Returns the Category data for all adopted categories.
   */
  async getAdoptedCategories(tenantSchema: string): Promise<Category[]> {
    const adoptions = await this.em.find(CategoryAdoption, {});

    if (adoptions.length === 0) {
      return [];
    }

    const categoryIds = adoptions.map(a => a.systemCategoryId);
    return this.em.find(Category, { id: { $in: categoryIds } });
  }

  /**
   * Remove adoption of a system category.
   *
   * Throws if the category is not adopted.
   */
  async unadoptCategory(tenantSchema: string, categoryId: string): Promise<void> {
    const adoption = await this.em.findOne(CategoryAdoption, {
      systemCategoryId: categoryId,
    });

    if (!adoption) {
      throw new Error(`Category ${categoryId} is not adopted by tenant`);
    }

    await this.em.removeAndFlush(adoption);
  }

  /**
   * Get categories available for adoption (not yet adopted by tenant).
   *
   * @param tenantSchema - The tenant schema name
   * @param targetType - Optional filter by target type
   */
  async getAvailableForAdoption(
    tenantSchema: string,
    targetType?: TargetType
  ): Promise<Category[]> {
    // Get already adopted category IDs
    const adoptions = await this.em.find(CategoryAdoption, {});
    const adoptedIds = new Set(adoptions.map(a => a.systemCategoryId));

    // Get all categories, optionally filtered by targetType
    const filter: FilterQuery<Category> = {};
    if (targetType) {
      filter.targetType = targetType;
    }

    const allCategories = await this.em.find(Category, filter);

    // Filter out already adopted
    return allCategories.filter(cat => !adoptedIds.has(cat.id));
  }
}
