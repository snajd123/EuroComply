import { EntityManager } from '@mikro-orm/core';
import * as crypto from 'crypto';
import { SeedVersion } from '../entities/SeedVersion.js';

/**
 * Service for managing seed version tracking and checksum-based change detection.
 *
 * Enables idempotent re-runs of seeders by tracking:
 * - Dataset name (e.g., 'unece-rec20', 'echa-svhc')
 * - Version string (e.g., 'Rev17', '2024-01')
 * - SHA-256 checksum for detecting file changes even with same version
 */
export class SeedService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Check if seeding is needed for a given dataset.
   *
   * Returns true if:
   * - No seed record exists, OR
   * - Existing seed record has different version, OR
   * - Existing seed record has different checksum (even with same version)
   *
   * @param name - Dataset identifier (e.g., 'unece-rec20')
   * @param version - Version string (e.g., 'Rev17')
   * @param checksum - Optional SHA-256 checksum for change detection
   */
  async needsSeeding(
    name: string,
    version: string,
    checksum?: string
  ): Promise<boolean> {
    const existing = await this.em.findOne(SeedVersion, { name });

    if (!existing) {
      return true;
    }

    // Version mismatch always triggers re-seed
    if (existing.version !== version) {
      return true;
    }

    // If checksum provided, compare (allows detecting file changes even with same version)
    if (checksum && existing.sourceChecksum && existing.sourceChecksum !== checksum) {
      return true;
    }

    return false;
  }

  /**
   * Record that a seed operation completed.
   * Creates or updates the SeedVersion record.
   *
   * @param name - Dataset identifier (e.g., 'unece-rec20')
   * @param version - Version string (e.g., 'Rev17')
   * @param recordCount - Number of records seeded
   * @param checksum - Optional SHA-256 checksum of source data
   * @returns The created or updated SeedVersion record
   */
  async recordSeeding(
    name: string,
    version: string,
    recordCount: number,
    checksum?: string
  ): Promise<SeedVersion> {
    let seedVersion = await this.em.findOne(SeedVersion, { name });

    if (seedVersion) {
      seedVersion.version = version;
      seedVersion.recordCount = recordCount;
      seedVersion.seededAt = new Date();
      if (checksum) {
        seedVersion.sourceChecksum = checksum;
      }
    } else {
      seedVersion = new SeedVersion();
      seedVersion.name = name;
      seedVersion.version = version;
      seedVersion.recordCount = recordCount;
      seedVersion.seededAt = new Date();
      if (checksum) {
        seedVersion.sourceChecksum = checksum;
      }
      this.em.persist(seedVersion);
    }

    await this.em.flush();
    return seedVersion;
  }

  /**
   * Get the current seeded version for a dataset.
   *
   * @param name - Dataset identifier (e.g., 'unece-rec20')
   * @returns The SeedVersion record or null if not found
   */
  async getSeededVersion(name: string): Promise<SeedVersion | null> {
    return this.em.findOne(SeedVersion, { name });
  }

  /**
   * Compute SHA-256 checksum of data for change detection.
   * Use this on the serialized source data (JSON or CSV content).
   *
   * @param data - String or Buffer to compute checksum for
   * @returns Checksum in format 'sha256:<hex>'
   */
  computeChecksum(data: string | Buffer): string {
    const hash = crypto.createHash('sha256');
    hash.update(data);
    return `sha256:${hash.digest('hex')}`;
  }
}
