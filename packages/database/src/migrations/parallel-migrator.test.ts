import { describe, it, expect, vi } from 'vitest';
import { ParallelMigrator } from './parallel-migrator.js';

describe('ParallelMigrator', () => {
  it('runs migrations in parallel batches', async () => {
    const migrateFn = vi.fn().mockResolvedValue(undefined);
    const schemas = ['tenant_a', 'tenant_b', 'tenant_c', 'tenant_d', 'tenant_e'];

    const migrator = new ParallelMigrator({
      schemas,
      concurrency: 2,
      migrateFn,
    });

    const results = await migrator.run();

    expect(migrateFn).toHaveBeenCalledTimes(5);
    expect(results.successful).toEqual(schemas);
    expect(results.failed).toEqual([]);
  });

  it('handles failures gracefully', async () => {
    const migrateFn = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Migration failed'))
      .mockResolvedValueOnce(undefined);

    const schemas = ['tenant_a', 'tenant_b', 'tenant_c'];

    const migrator = new ParallelMigrator({
      schemas,
      concurrency: 1,
      migrateFn,
    });

    const results = await migrator.run();

    expect(results.successful).toContain('tenant_a');
    expect(results.successful).toContain('tenant_c');
    expect(results.failed).toContain('tenant_b');
  });

  it('respects concurrency limit', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const migrateFn = vi.fn().mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 50));
      concurrent--;
    });

    const schemas = ['a', 'b', 'c', 'd', 'e', 'f'];

    const migrator = new ParallelMigrator({
      schemas,
      concurrency: 3,
      migrateFn,
    });

    await migrator.run();

    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });
});
