import type { EntityManager, EntityClass, EntityData, FilterQuery, RequiredEntityData } from '@mikro-orm/core';
import { createId } from '@eurocomply/core';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

/**
 * Data for upsert operations. Allows omitting fields that have defaults
 * (like id, createdAt, updatedAt) while requiring entity-specific fields.
 */
export type UpsertData<T> = Partial<EntityData<T>> & Record<string, unknown>;

/**
 * Record type for copyLarge operations.
 */
export interface CopyRecord {
  [key: string]: unknown;
}

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

  /**
   * Import large datasets (>1000 records) using PostgreSQL COPY FROM STDIN.
   * Uses pg-copy-streams for cross-environment compatibility.
   *
   * Key design decisions:
   * - IDs are pre-generated in Node.js (not SQL) to ensure uniqueness
   * - Uses COPY FROM STDIN to stream data over connection (no file path needed)
   * - Explicitly sets search_path to prevent tenant schema cross-contamination
   *
   * @param tableName - Target table name (without schema)
   * @param records - Array of records to import (IDs will be generated)
   * @param columns - Column names matching record keys (snake_case for DB)
   * @param conflictColumn - Column for ON CONFLICT clause
   * @param schema - Target schema (default: 'public')
   */
  async copyLarge(
    tableName: string,
    records: CopyRecord[],
    columns: string[],
    conflictColumn: string,
    schema: string = 'public'
  ): Promise<number> {
    if (records.length === 0) return 0;

    const conn = this.em.getConnection();
    const stagingTable = `${tableName}_staging_${Date.now()}`;
    const fullTableName = `${schema}.${tableName}`;

    // Access the underlying knex client (conn.client is a QueryBuilder, conn.client.client is the Knex Client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const knexClient = (conn as any).client.client;

    // Get the raw pg client for COPY streams
    const client = await knexClient.acquireConnection();

    try {
      // 1. Explicitly set search_path to prevent tenant contamination
      await client.query(`SET search_path TO ${schema}`);

      // 2. Create temp staging table matching target structure
      await client.query(`
        CREATE TEMP TABLE ${stagingTable} (LIKE ${fullTableName} INCLUDING DEFAULTS)
      `);

      // 3. Pre-generate unique IDs for each record in Node.js
      const recordsWithIds = records.map(record => ({
        id: createId(), // Each record gets its own unique ID
        ...record,
        created_at: new Date(),
        updated_at: new Date(),
      }));

      // 4. Build CSV data in memory with proper escaping
      const csvColumns = ['id', ...columns, 'created_at', 'updated_at'];
      const csvData = this.buildCsvData(recordsWithIds, csvColumns);

      // 5. Stream CSV to PostgreSQL via COPY FROM STDIN
      const { from: copyFrom } = await import('pg-copy-streams');
      const copyStream = client.query(
        copyFrom(
          `COPY ${stagingTable} (${csvColumns.join(', ')}) FROM STDIN WITH (FORMAT csv, HEADER false, NULL '')`
        )
      );

      const readable = Readable.from([csvData]);
      await pipeline(readable, copyStream);

      // 6. Upsert from staging to target table
      const updateColumns = columns
        .filter(c => c !== conflictColumn)
        .map(c => `${c} = EXCLUDED.${c}`)
        .join(',\n        ');

      await client.query(`
        INSERT INTO ${fullTableName} (${csvColumns.join(', ')})
        SELECT ${csvColumns.join(', ')}
        FROM ${stagingTable}
        ON CONFLICT (${conflictColumn}) DO UPDATE SET
          ${updateColumns},
          updated_at = NOW()
      `);

      // 7. Drop staging table
      await client.query(`DROP TABLE IF EXISTS ${stagingTable}`);

      return records.length;
    } catch (error) {
      // Ensure staging table is cleaned up on error
      await client.query(`DROP TABLE IF EXISTS ${stagingTable}`).catch(() => {});
      throw error;
    } finally {
      // Release connection back to pool
      await knexClient.releaseConnection(client);
    }
  }

  /**
   * Build CSV data string with proper escaping.
   */
  private buildCsvData(records: CopyRecord[], columns: string[]): string {
    const rows: string[] = [];

    for (const record of records) {
      const values = columns.map(col => {
        const value = record[col];

        if (value === null || value === undefined) {
          return '';
        }

        if (value instanceof Date) {
          return value.toISOString();
        }

        const str = String(value);

        // Escape quotes and wrap in quotes if contains special chars
        if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
          return `"${str.replace(/"/g, '""')}"`;
        }

        return str;
      });

      rows.push(values.join(','));
    }

    return rows.join('\n');
  }
}
