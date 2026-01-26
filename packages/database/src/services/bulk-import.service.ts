import type { EntityManager, EntityClass, EntityData, FilterQuery, RequiredEntityData } from '@mikro-orm/core';

/**
 * Data for upsert operations. Allows omitting fields that have defaults
 * (like id, createdAt, updatedAt) while requiring entity-specific fields.
 */
export type UpsertData<T> = Partial<EntityData<T>> & Record<string, unknown>;

/**
 * Service for bulk importing reference data into the database.
 *
 * Provides two strategies:
 * - upsertSmall: ORM-based upsert for small datasets (<1000 records)
 * - copyLarge: PostgreSQL COPY for large datasets (>1000 records) - implemented in Task 4
 */
export class BulkImportService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Upsert small datasets (<1000 records) using MikroORM.
   * Safe for any data, handles escaping automatically.
   *
   * Uses a find-then-update/insert pattern to handle entities with
   * auto-generated IDs and non-PK unique constraints.
   *
   * @param entityClass - The entity class to upsert into
   * @param records - Array of records to upsert (fields with defaults can be omitted)
   * @param conflictFields - Fields to use for conflict detection (typically the unique key)
   * @returns Number of records processed
   */
  async upsertSmall<T extends object>(
    entityClass: EntityClass<T>,
    records: UpsertData<T>[],
    conflictFields: (keyof T)[]
  ): Promise<number> {
    if (records.length === 0) {
      return 0;
    }

    let count = 0;

    for (const record of records) {
      // Build filter from conflict fields
      const filter: Record<string, unknown> = {};
      for (const field of conflictFields) {
        filter[field as string] = record[field as string];
      }

      // Check if record exists
      const existing = await this.em.findOne(entityClass, filter as FilterQuery<T>);

      if (existing) {
        // Update existing record with non-conflict fields
        for (const [key, value] of Object.entries(record)) {
          if (!conflictFields.includes(key as keyof T)) {
            (existing as Record<string, unknown>)[key] = value;
          }
        }
        this.em.persist(existing);
      } else {
        // Create new record
        const entity = this.em.create(entityClass, record as RequiredEntityData<T>);
        this.em.persist(entity);
      }

      count++;
    }

    await this.em.flush();
    return count;
  }
}
