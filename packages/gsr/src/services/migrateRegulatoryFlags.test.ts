// packages/gsr/src/services/migrateRegulatoryFlags.test.ts
import { describe, it, expect, vi } from 'vitest';
import { migrateRegulatoryFlags } from './migrateRegulatoryFlags.js';

/**
 * Tests for the deprecated migrateRegulatoryFlags function.
 *
 * The function was originally used to migrate legacy boolean regulatory flags
 * (isSvhc, isRestricted, requiresAuthorization) from Substance entity to
 * SubstanceListEntry records.
 *
 * Those fields have been removed from the Substance entity, so this function
 * is now a no-op that returns an empty result with a deprecation warning.
 */
describe('migrateRegulatoryFlags (deprecated)', () => {
  it('should_return_empty_result_when_called', async () => {
    // The function is deprecated and returns a no-op result
    // We don't need a real EntityManager since it's not used
    const mockEm = {} as any;

    // Suppress the deprecation warning during test
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await migrateRegulatoryFlags(mockEm);

    expect(result.migratedCount).toBe(0);
    expect(result.listsCreated).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('should_log_deprecation_warning_when_called', async () => {
    const mockEm = {} as any;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await migrateRegulatoryFlags(mockEm);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('deprecated')
    );

    warnSpy.mockRestore();
  });
});
