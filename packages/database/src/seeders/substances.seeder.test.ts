import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubstancesSeeder, type SubstanceSeederResult } from './substances.seeder.js';

// Mock the file reading
vi.mock('fs', () => ({
  readFileSync: vi.fn(() => JSON.stringify({
    version: 'TEST-001',
    substances: [
      {
        casNumber: '127-19-5',
        primaryName: 'Test Substance',
        isSvhc: true,
        aliases: [
          { name: 'TS', type: 'COMMON' }
        ]
      }
    ]
  }))
}));

describe('SubstancesSeeder', () => {
  let mockEm: any;
  let seeder: SubstancesSeeder;

  beforeEach(() => {
    mockEm = {
      fork: vi.fn(() => mockEm),
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn((entity, data) => ({ ...data, id: 'test-id' })),
      persist: vi.fn(),
      persistAndFlush: vi.fn(),
      flush: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    };
    seeder = new SubstancesSeeder(mockEm);
  });

  it('should have a seed method', () => {
    expect(typeof seeder.seed).toBe('function');
  });

  it('should return a result object', async () => {
    const result = await seeder.seed();

    expect(result).toHaveProperty('seeded');
    expect(result).toHaveProperty('substanceCount');
    expect(result).toHaveProperty('aliasCount');
    expect(result).toHaveProperty('version');
    expect(result).toHaveProperty('message');
  });

  it('should skip seeding if substances already exist', async () => {
    mockEm.count.mockResolvedValue(10);

    const result = await seeder.seed();

    expect(result.seeded).toBe(false);
    expect(result.skipped).toBe(true);
  });

  it('should seed substances when database is empty', async () => {
    mockEm.count.mockResolvedValue(0);

    const result = await seeder.seed();

    expect(result.seeded).toBe(true);
    expect(result.substanceCount).toBeGreaterThan(0);
  });
});
