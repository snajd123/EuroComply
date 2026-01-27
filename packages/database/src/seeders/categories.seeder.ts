import type { EntityManager } from '@mikro-orm/core';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Category, CategoryType } from '../entities/Category.js';
import { TargetType } from '../entities/enums/index.js';
import type { SeedService } from '../services/seed.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Data file is at package root: packages/database/data/
// From dist/seeders/ we need to go up 2 levels
const PACKAGE_ROOT = join(__dirname, '..', '..');

const SEED_NAME = 'system-categories';

export interface SeederResult {
  seeded: boolean;
  skipped: boolean;
  count: number;
  version: string;
  message: string;
}

interface CategoryData {
  path: string;
  name: string;
  description?: string;
  type: string;
  targetType: string;
}

interface CategoryBundle {
  version: string;
  generatedAt: string;
  totalCategories: number;
  categories: CategoryData[];
}

/**
 * Seeds system categories from the data bundle.
 *
 * Uses SeedService for version tracking to enable idempotent re-runs.
 * Categories are sorted by path to ensure parents are created before children.
 */
export class CategoriesSeeder {
  constructor(
    private readonly em: EntityManager,
    private readonly seedService: SeedService
  ) {}

  async seed(): Promise<SeederResult> {
    const em = this.em.fork();

    // Load data bundle
    const bundlePath = join(PACKAGE_ROOT, 'data', 'system-categories.json');
    const raw = readFileSync(bundlePath, 'utf-8');
    const bundle: CategoryBundle = JSON.parse(raw);
    const version = bundle.version;

    // Compute checksum for change detection
    const checksum = this.seedService.computeChecksum(raw);

    // Check if seeding needed
    const needsSeeding = await this.seedService.needsSeeding(SEED_NAME, version, checksum);
    if (!needsSeeding) {
      return {
        seeded: false,
        skipped: true,
        count: 0,
        version,
        message: `Categories already seeded (${version}), skipping.`,
      };
    }

    // Sort categories by path to ensure parents created before children
    const sortedCategories = [...bundle.categories].sort((a, b) => a.path.localeCompare(b.path));

    // Build path -> entity map for parent references
    const pathToCategory = new Map<string, Category>();

    let count = 0;
    const now = new Date();

    // Seed categories
    for (const c of sortedCategories) {
      // Calculate depth from path (number of dots)
      const depth = (c.path.match(/\./g) || []).length;

      // Find parent path (everything before the last dot)
      const lastDotIndex = c.path.lastIndexOf('.');
      const parentPath = lastDotIndex > 0 ? c.path.substring(0, lastDotIndex) : undefined;
      const parent = parentPath ? pathToCategory.get(parentPath) : undefined;

      const category = em.create(Category, {
        path: c.path,
        name: c.name,
        description: c.description,
        type: c.type as CategoryType,
        targetType: c.targetType as TargetType,
        depth,
        parent,
        isActive: true,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      em.persist(category);
      pathToCategory.set(c.path, category);
      count++;
    }

    await em.flush();

    // Record seeding
    await this.seedService.recordSeeding(SEED_NAME, version, count, checksum);

    return {
      seeded: true,
      skipped: false,
      count,
      version,
      message: `Seeded ${count} categories (${version}).`,
    };
  }
}
