export interface ParallelMigratorOptions {
  schemas: string[];
  concurrency: number;
  migrateFn: (schema: string) => Promise<void>;
}

export interface MigrationResults {
  successful: string[];
  failed: string[];
  errors: Map<string, Error>;
}

export class ParallelMigrator {
  private schemas: string[];
  private concurrency: number;
  private migrateFn: (schema: string) => Promise<void>;

  constructor(options: ParallelMigratorOptions) {
    this.schemas = options.schemas;
    this.concurrency = options.concurrency;
    this.migrateFn = options.migrateFn;
  }

  async run(): Promise<MigrationResults> {
    const results: MigrationResults = {
      successful: [],
      failed: [],
      errors: new Map(),
    };

    // Process schemas in batches
    const batches = this.chunk(this.schemas, this.concurrency);

    for (const batch of batches) {
      const batchResults = await Promise.allSettled(
        batch.map(async (schema) => {
          await this.migrateFn(schema);
          return schema;
        })
      );

      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i]!;
        const schema = batch[i]!;

        if (result.status === 'fulfilled') {
          results.successful.push(schema);
        } else {
          results.failed.push(schema);
          results.errors.set(schema, result.reason);
        }
      }
    }

    return results;
  }

  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
