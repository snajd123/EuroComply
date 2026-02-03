# GSR Substance Enrichment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enrich Substance records with chemical structure data (SMILES, InChI, molecular weight, IUPAC name) from PubChem API and generate ECHA URLs.

**Architecture:** Create a PubChemClient service for API calls with rate limiting, a PubChemEnricher seeder for batch processing, and CLI commands to run enrichment. Uses exponential backoff for resilience and tracks enrichment progress via RegistrySource.

**Tech Stack:** Node.js fetch API, Commander.js CLI, MikroORM, PubChem PUG REST API

---

## Technical Refinements

### A. Testing Strategy (No Mocks vs API Limits)

Per CLAUDE.md "No Mocks" policy, tests use real API calls. However, hitting PubChem on every `pnpm test` run would:
- Slow dev cycle (network latency)
- Risk hitting 400 req/min rate limit

**Solution:**
1. Use 2-3 "canary" substances with stable, well-known data (Formaldehyde CAS 50-00-0, Ethanol CAS 64-17-5)
2. Mark PubChem tests with `describe.concurrent` to run in parallel
3. Add `timeout: 30000` to account for network latency
4. Skip rate-limit tests in CI (they take 20+ seconds)

```typescript
describe('PubChemClient', () => {
  // Fast canary tests - run on every test
  describe('canary substances', () => {
    it('should_fetch_formaldehyde_data', ...);  // ~2 seconds
  });

  // Slow rate-limit tests - skip in CI
  describe.skipIf(process.env.CI)('rate limiting', () => {
    it('should_not_exceed_5_requests_per_second', ...);  // ~20 seconds
  });
});
```

### B. Molecular Weight Type Fix

**Issue:** Database column is `decimal(12,4)` but entity property is `string`.

**Fix:** Update Substance entity to use numeric type for BOM calculations:

```typescript
// packages/database/src/entities/Substance.ts
@Property({ type: 'decimal', precision: 12, scale: 4, nullable: true })
molecularWeight?: string;  // MikroORM maps decimal to string to preserve precision
```

MikroORM represents decimals as strings to avoid JavaScript floating-point precision issues. This is correct. The enricher should store as string:

```typescript
if (data.molecularWeight) {
  substance.molecularWeight = data.molecularWeight.toFixed(4);
}
```

### C. Multi-CID Handling

PubChem may return multiple CIDs for one CAS (isomers, salts). Taking `CID[0]` is correct - it's the primary/neutral compound, which is appropriate for compliance registries.

---

## Phase 1: PubChem API Client

### Task 1.1: Create PubChem Client Types

**Files:**
- Create: `packages/gsr/src/clients/pubchem.types.ts`
- Test: N/A (type definitions only)

**Step 1: Create the types file**

```typescript
// packages/gsr/src/clients/pubchem.types.ts

/**
 * PubChem PUG REST API response types.
 * @see https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest
 */

/** Response from CAS number lookup */
export interface PubChemCidResponse {
  IdentifierList?: {
    CID: number[];
  };
  Fault?: {
    Code: string;
    Message: string;
  };
}

/** Single compound property record */
export interface PubChemCompoundProperty {
  CID: number;
  MolecularFormula?: string;
  MolecularWeight?: number;
  CanonicalSMILES?: string;
  IsomericSMILES?: string;
  InChI?: string;
  InChIKey?: string;
  IUPACName?: string;
}

/** Response from compound properties lookup */
export interface PubChemPropertiesResponse {
  PropertyTable?: {
    Properties: PubChemCompoundProperty[];
  };
  Fault?: {
    Code: string;
    Message: string;
  };
}

/** Normalized enrichment data for a substance */
export interface SubstanceEnrichmentData {
  cid: number;
  smiles: string | null;
  inchiKey: string | null;
  iupacName: string | null;
  molecularWeight: number | null;
  molecularFormula: string | null;
}

/** Rate limit info from PubChem headers */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: Date;
}
```

**Step 2: Commit**

```bash
git add packages/gsr/src/clients/pubchem.types.ts
git commit -m "feat(gsr): add PubChem API type definitions"
```

---

### Task 1.2: Create PubChem Client with Rate Limiting

**Files:**
- Create: `packages/gsr/src/clients/pubchem.client.ts`
- Test: `packages/gsr/src/clients/pubchem.client.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/clients/pubchem.client.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { PubChemClient } from './pubchem.client.js';

/**
 * PubChem API integration tests.
 *
 * Uses "canary" substances with stable, well-known data to minimize API calls.
 * Rate limiting tests are skipped in CI to avoid slow test runs.
 */
describe('PubChemClient', () => {
  let client: PubChemClient;

  beforeAll(() => {
    client = new PubChemClient();
  });

  // =========================================================================
  // Canary Tests - Fast, run on every test
  // Uses well-known substances: Formaldehyde (CAS 50-00-0, CID 712)
  // =========================================================================

  describe('getCidByCas', () => {
    it('should_return_cid_when_cas_number_is_valid', async () => {
      // Formaldehyde - stable, well-known compound
      const cid = await client.getCidByCas('50-00-0');

      expect(cid).toBe(712); // Known CID for Formaldehyde
    }, { timeout: 10000 });

    it('should_return_null_when_cas_number_not_found', async () => {
      const cid = await client.getCidByCas('999-99-9');

      expect(cid).toBeNull();
    }, { timeout: 10000 });
  });

  describe('getCompoundProperties', () => {
    it('should_return_properties_when_cid_is_valid', async () => {
      // CID 712 is Formaldehyde
      const props = await client.getCompoundProperties(712);

      expect(props).toBeDefined();
      expect(props?.smiles).toBe('C=O');
      expect(props?.inchiKey).toBe('WSFSSNUMVMOOMR-UHFFFAOYSA-N');
      expect(props?.molecularWeight).toBeCloseTo(30.03, 1);
    }, { timeout: 10000 });

    it('should_return_null_when_cid_not_found', async () => {
      const props = await client.getCompoundProperties(999999999999);

      expect(props).toBeNull();
    }, { timeout: 10000 });
  });

  describe('getEnrichmentData', () => {
    it('should_return_enrichment_data_for_valid_cas', async () => {
      // Formaldehyde - full enrichment flow
      const data = await client.getEnrichmentData('50-00-0');

      expect(data).toBeDefined();
      expect(data?.cid).toBe(712);
      expect(data?.smiles).toBe('C=O');
      expect(data?.inchiKey).toBe('WSFSSNUMVMOOMR-UHFFFAOYSA-N');
      expect(data?.molecularFormula).toBe('CH2O');
      expect(data?.molecularWeight).toBeCloseTo(30.03, 1);
    }, { timeout: 15000 }); // Two API calls
  });

  // =========================================================================
  // Rate Limiting Tests - Slow, skip in CI
  // =========================================================================

  describe.skipIf(process.env.CI)('rate limiting', () => {
    it('should_not_exceed_5_requests_per_second', async () => {
      const start = Date.now();

      // Make 10 requests - should take at least 2 seconds (5 req/sec limit)
      const promises = Array(10).fill(null).map(() =>
        client.getCidByCas('50-00-0')
      );
      await Promise.all(promises);

      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(1800); // 1.8s minimum with margin
    }, { timeout: 30000 });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/gsr && pnpm test src/clients/pubchem.client.test.ts
```

Expected: FAIL with "Cannot find module './pubchem.client.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/gsr/src/clients/pubchem.client.ts
import type {
  PubChemCidResponse,
  PubChemPropertiesResponse,
  SubstanceEnrichmentData,
  RateLimitInfo,
} from './pubchem.types.js';

const PUBCHEM_BASE_URL = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
const REQUESTS_PER_SECOND = 5;
const REQUEST_INTERVAL_MS = 1000 / REQUESTS_PER_SECOND; // 200ms between requests

/**
 * PubChem PUG REST API client with built-in rate limiting.
 *
 * Rate limits: 5 requests/second, 400 requests/minute
 * @see https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest
 */
export class PubChemClient {
  private lastRequestTime = 0;
  private requestQueue: Promise<void> = Promise.resolve();

  /**
   * Enforces rate limiting by queuing requests.
   */
  private async throttle(): Promise<void> {
    return new Promise((resolve) => {
      this.requestQueue = this.requestQueue.then(async () => {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (timeSinceLastRequest < REQUEST_INTERVAL_MS) {
          await this.sleep(REQUEST_INTERVAL_MS - timeSinceLastRequest);
        }

        this.lastRequestTime = Date.now();
        resolve();
      });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Makes a rate-limited fetch request with retry logic.
   */
  private async fetchWithRetry<T>(
    url: string,
    retries = 3,
    backoffMs = 1000
  ): Promise<T | null> {
    await this.throttle();

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(30000),
        });

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10);
          await this.sleep(retryAfter * 1000);
          continue;
        }

        // Not found is expected for some CAS numbers
        if (response.status === 404) {
          return null;
        }

        if (!response.ok) {
          throw new Error(`PubChem API error: ${response.status}`);
        }

        return await response.json() as T;
      } catch (error) {
        if (attempt === retries - 1) {
          console.error(`PubChem request failed after ${retries} attempts:`, error);
          return null;
        }
        await this.sleep(backoffMs * Math.pow(2, attempt));
      }
    }

    return null;
  }

  /**
   * Gets the PubChem CID for a CAS number.
   */
  async getCidByCas(casNumber: string): Promise<number | null> {
    const url = `${PUBCHEM_BASE_URL}/compound/name/${encodeURIComponent(casNumber)}/cids/JSON`;
    const data = await this.fetchWithRetry<PubChemCidResponse>(url);

    if (!data?.IdentifierList?.CID?.length) {
      return null;
    }

    // Return first CID (primary compound)
    return data.IdentifierList.CID[0];
  }

  /**
   * Gets compound properties by CID.
   */
  async getCompoundProperties(cid: number): Promise<SubstanceEnrichmentData | null> {
    const properties = [
      'MolecularFormula',
      'MolecularWeight',
      'CanonicalSMILES',
      'InChIKey',
      'IUPACName',
    ].join(',');

    const url = `${PUBCHEM_BASE_URL}/compound/cid/${cid}/property/${properties}/JSON`;
    const data = await this.fetchWithRetry<PubChemPropertiesResponse>(url);

    if (!data?.PropertyTable?.Properties?.length) {
      return null;
    }

    const props = data.PropertyTable.Properties[0];
    return {
      cid: props.CID,
      smiles: props.CanonicalSMILES ?? null,
      inchiKey: props.InChIKey ?? null,
      iupacName: props.IUPACName ?? null,
      molecularWeight: props.MolecularWeight ?? null,
      molecularFormula: props.MolecularFormula ?? null,
    };
  }

  /**
   * Gets enrichment data for a CAS number (combines CID lookup + properties).
   */
  async getEnrichmentData(casNumber: string): Promise<SubstanceEnrichmentData | null> {
    const cid = await this.getCidByCas(casNumber);
    if (!cid) {
      return null;
    }

    return this.getCompoundProperties(cid);
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/gsr && pnpm test src/clients/pubchem.client.test.ts
```

Expected: PASS (note: tests make real API calls, may be slow)

**Step 5: Export from clients index**

```typescript
// packages/gsr/src/clients/index.ts
export { PubChemClient } from './pubchem.client.js';
export type {
  PubChemCidResponse,
  PubChemPropertiesResponse,
  SubstanceEnrichmentData,
  RateLimitInfo,
} from './pubchem.types.js';
```

**Step 6: Commit**

```bash
git add packages/gsr/src/clients/
git commit -m "feat(gsr): add PubChem API client with rate limiting"
```

---

## Phase 2: PubChem Enricher

### Task 2.1: Create PubChem Enricher Service

**Files:**
- Create: `packages/gsr/src/seeders/pubchem.enricher.ts`
- Test: `packages/gsr/src/seeders/pubchem.enricher.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gsr/src/seeders/pubchem.enricher.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb } from '@eurocomply/database/test-utils';
import { Substance } from '@eurocomply/database';
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { gsrEntities } from '../entities/index.js';
import { PubChemEnricher, type EnricherResult } from './pubchem.enricher.js';

describe('PubChemEnricher', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let enricher: PubChemEnricher;

  beforeAll(async () => {
    orm = await setupTestDb({ additionalEntities: gsrEntities });
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    em = orm.em.fork();
    enricher = new PubChemEnricher(em);

    // Clean up test data
    await em.nativeDelete(Substance, {});
  });

  describe('enrichSubstance', () => {
    it('should_enrich_substance_with_pubchem_data_when_cas_valid', async () => {
      // Arrange: Create substance with known CAS (Formaldehyde)
      const substance = em.create(Substance, {
        casNumber: '50-00-0',
        ecNumber: '200-001-8',
        primaryName: 'formaldehyde',
        isActive: true,
      });
      await em.persistAndFlush(substance);

      // Act
      const result = await enricher.enrichSubstance(substance);

      // Assert
      expect(result).toBe(true);

      await em.refresh(substance);
      expect(substance.smiles).toBe('C=O');
      expect(substance.inchiKey).toBe('WSFSSNUMVMOOMR-UHFFFAOYSA-N');
      expect(substance.molecularWeight).toBeDefined();
      expect(parseFloat(substance.molecularWeight!)).toBeCloseTo(30.03, 1);
    });

    it('should_return_false_when_cas_not_found_in_pubchem', async () => {
      const substance = em.create(Substance, {
        casNumber: '999-99-9',
        ecNumber: '999-999-9',
        primaryName: 'unknown substance',
        isActive: true,
      });
      await em.persistAndFlush(substance);

      const result = await enricher.enrichSubstance(substance);

      expect(result).toBe(false);
      await em.refresh(substance);
      expect(substance.smiles).toBeNull();
    });

    it('should_skip_already_enriched_substances', async () => {
      const substance = em.create(Substance, {
        casNumber: '50-00-0',
        ecNumber: '200-001-8',
        primaryName: 'formaldehyde',
        smiles: 'ALREADY_SET',
        isActive: true,
      });
      await em.persistAndFlush(substance);

      const result = await enricher.enrichSubstance(substance);

      expect(result).toBe(false); // Skipped, not enriched
      await em.refresh(substance);
      expect(substance.smiles).toBe('ALREADY_SET'); // Unchanged
    });
  });

  describe('enrichBatch', () => {
    it('should_enrich_multiple_substances_with_progress', async () => {
      // Create test substances
      const substances = [
        em.create(Substance, {
          casNumber: '50-00-0', // Formaldehyde
          ecNumber: '200-001-8',
          primaryName: 'formaldehyde',
          isActive: true,
        }),
        em.create(Substance, {
          casNumber: '64-17-5', // Ethanol
          ecNumber: '200-578-6',
          primaryName: 'ethanol',
          isActive: true,
        }),
      ];
      await em.persistAndFlush(substances);

      // Act
      const result = await enricher.enrichBatch(substances);

      // Assert
      expect(result.enrichedCount).toBe(2);
      expect(result.failedCount).toBe(0);
    });
  });

  describe('run', () => {
    it('should_enrich_all_unenriched_substances', async () => {
      // Create mix of enriched and unenriched
      const substances = [
        em.create(Substance, {
          casNumber: '50-00-0',
          ecNumber: '200-001-8',
          primaryName: 'formaldehyde',
          isActive: true,
        }),
        em.create(Substance, {
          casNumber: '64-17-5',
          ecNumber: '200-578-6',
          primaryName: 'ethanol',
          smiles: 'CCO', // Already enriched
          isActive: true,
        }),
      ];
      await em.persistAndFlush(substances);

      // Act
      const result = await enricher.run({ batchSize: 10 });

      // Assert
      expect(result.enriched).toBe(true);
      expect(result.enrichedCount).toBe(1); // Only unenriched one
      expect(result.skippedCount).toBe(1); // Already enriched
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/gsr && pnpm test src/seeders/pubchem.enricher.test.ts
```

Expected: FAIL with "Cannot find module './pubchem.enricher.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/gsr/src/seeders/pubchem.enricher.ts
import type { EntityManager } from '@mikro-orm/postgresql';
import { Substance } from '@eurocomply/database';
import { PubChemClient } from '../clients/pubchem.client.js';
import { RegistrySource, RegistrySourceName } from '../entities/RegistrySource.js';

export interface EnricherResult {
  enriched: boolean;
  enrichedCount: number;
  failedCount: number;
  skippedCount: number;
  notFoundCount: number;
  totalProcessed: number;
  version: string;
  message: string;
}

export interface EnricherOptions {
  batchSize?: number;
  /** Only enrich substances missing SMILES data */
  onlyMissing?: boolean;
  /** Dry run - don't persist changes */
  dryRun?: boolean;
  /** Progress callback */
  onProgress?: (processed: number, total: number) => void;
}

const DEFAULT_BATCH_SIZE = 100;

/**
 * Enriches Substance records with chemical data from PubChem.
 *
 * Adds: SMILES, InChIKey, IUPAC name, molecular weight
 * Rate limited to respect PubChem API limits (5 req/sec).
 */
export class PubChemEnricher {
  private readonly client: PubChemClient;

  constructor(private readonly em: EntityManager) {
    this.client = new PubChemClient();
  }

  /**
   * Enriches a single substance with PubChem data.
   *
   * @returns true if enriched, false if skipped or not found
   */
  async enrichSubstance(substance: Substance): Promise<boolean> {
    // Skip if already enriched
    if (substance.smiles) {
      return false;
    }

    // Skip if no CAS number
    if (!substance.casNumber) {
      return false;
    }

    const data = await this.client.getEnrichmentData(substance.casNumber);
    if (!data) {
      return false;
    }

    // Update substance with PubChem data
    substance.smiles = data.smiles;
    substance.inchiKey = data.inchiKey;
    substance.iupacName = data.iupacName;
    if (data.molecularWeight) {
      // Use toFixed(4) to match decimal(12,4) precision in database
      substance.molecularWeight = data.molecularWeight.toFixed(4);
    }
    if (data.molecularFormula && !substance.molecularFormula) {
      substance.molecularFormula = data.molecularFormula;
    }

    return true;
  }

  /**
   * Enriches a batch of substances.
   */
  async enrichBatch(
    substances: Substance[],
    options?: { dryRun?: boolean }
  ): Promise<{ enrichedCount: number; failedCount: number; notFoundCount: number }> {
    let enrichedCount = 0;
    let failedCount = 0;
    let notFoundCount = 0;

    for (const substance of substances) {
      try {
        const wasEnriched = await this.enrichSubstance(substance);
        if (wasEnriched) {
          enrichedCount++;
        } else if (!substance.smiles && substance.casNumber) {
          notFoundCount++;
        }
      } catch (error) {
        console.error(`Failed to enrich ${substance.casNumber}:`, error);
        failedCount++;
      }
    }

    // Persist unless dry run
    if (!options?.dryRun && enrichedCount > 0) {
      await this.em.flush();
    }

    return { enrichedCount, failedCount, notFoundCount };
  }

  /**
   * Runs enrichment on all unenriched substances.
   */
  async run(options: EnricherOptions = {}): Promise<EnricherResult> {
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    const version = new Date().toISOString().slice(0, 10);

    // Find substances needing enrichment
    const query: Record<string, unknown> = {
      isActive: true,
      casNumber: { $ne: null },
    };

    if (options.onlyMissing !== false) {
      query.smiles = null;
    }

    const total = await this.em.count(Substance, query);

    if (total === 0) {
      return {
        enriched: false,
        enrichedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        notFoundCount: 0,
        totalProcessed: 0,
        version,
        message: 'No substances need enrichment.',
      };
    }

    console.log(`Found ${total} substances to enrich`);

    let enrichedCount = 0;
    let failedCount = 0;
    let notFoundCount = 0;
    let processed = 0;

    // Process in batches
    let offset = 0;
    while (offset < total) {
      const batch = await this.em.find(Substance, query, {
        limit: batchSize,
        offset,
        orderBy: { casNumber: 'ASC' },
      });

      if (batch.length === 0) break;

      const batchResult = await this.enrichBatch(batch, { dryRun: options.dryRun });

      enrichedCount += batchResult.enrichedCount;
      failedCount += batchResult.failedCount;
      notFoundCount += batchResult.notFoundCount;
      processed += batch.length;
      offset += batchSize;

      // Report progress
      if (options.onProgress) {
        options.onProgress(processed, total);
      } else {
        console.log(`Progress: ${processed}/${total} (${enrichedCount} enriched, ${notFoundCount} not found)`);
      }

      // Clear entity manager to prevent memory buildup
      this.em.clear();
    }

    // Update registry source
    if (!options.dryRun && enrichedCount > 0) {
      await this.updateRegistrySource(version, enrichedCount);
    }

    const skippedCount = total - enrichedCount - failedCount - notFoundCount;

    return {
      enriched: enrichedCount > 0,
      enrichedCount,
      failedCount,
      skippedCount,
      notFoundCount,
      totalProcessed: processed,
      version,
      message: `Enriched ${enrichedCount} substances from PubChem (${notFoundCount} not found, ${failedCount} failed).`,
    };
  }

  /**
   * Updates the registry source record for tracking.
   */
  private async updateRegistrySource(version: string, recordCount: number): Promise<void> {
    const existing = await this.em.findOne(RegistrySource, {
      name: RegistrySourceName.PUBCHEM,
    });

    if (existing) {
      existing.version = version;
      existing.recordCount = (existing.recordCount ?? 0) + recordCount;
      existing.lastSyncedAt = new Date();
      await this.em.persistAndFlush(existing);
    } else {
      const source = this.em.create(RegistrySource, {
        name: RegistrySourceName.PUBCHEM,
        version,
        recordCount,
        sourceUrl: 'https://pubchem.ncbi.nlm.nih.gov/',
        lastSyncedAt: new Date(),
      });
      await this.em.persistAndFlush(source);
    }
  }
}
```

**Step 4: Add PUBCHEM to RegistrySourceName enum**

Modify: `packages/gsr/src/entities/RegistrySource.ts`

```typescript
// Add to RegistrySourceName enum:
export enum RegistrySourceName {
  ECHA_EC = 'ECHA_EC',
  ECHA_SVHC = 'ECHA_SVHC',
  PUBCHEM = 'PUBCHEM',  // Add this line
}
```

**Step 5: Run test to verify it passes**

```bash
cd packages/gsr && pnpm test src/seeders/pubchem.enricher.test.ts
```

Expected: PASS (tests make real API calls, may take ~30s)

**Step 6: Export from seeders index**

```typescript
// packages/gsr/src/seeders/index.ts
export { EchaInventorySeeder, type SeederResult } from './echa-inventory.seeder.js';
export { EchaSvhcSeeder } from './echa-svhc.seeder.js';
export { PubChemEnricher, type EnricherResult, type EnricherOptions } from './pubchem.enricher.js';
```

**Step 7: Commit**

```bash
git add packages/gsr/src/seeders/pubchem.enricher.ts \
        packages/gsr/src/seeders/pubchem.enricher.test.ts \
        packages/gsr/src/seeders/index.ts \
        packages/gsr/src/entities/RegistrySource.ts
git commit -m "feat(gsr): add PubChem enricher for chemical structure data"
```

---

## Phase 3: ECHA URL Generator

### Task 3.1: Add ECHA URL Generation

**Files:**
- Modify: `packages/gsr/src/seeders/pubchem.enricher.ts`
- Test: Already covered by enricher tests

**Step 1: Add generateEchaUrl method to enricher**

Add this method to `PubChemEnricher` class:

```typescript
/**
 * Generates ECHA substance URL from EC number.
 * Format: https://echa.europa.eu/substance-information/-/substanceinfo/{ec_number_with_dashes}
 */
private generateEchaUrl(ecNumber: string): string | null {
  if (!ecNumber) return null;

  // EC number format: 200-001-8 (already has dashes)
  // URL uses the EC number directly
  return `https://echa.europa.eu/substance-information/-/substanceinfo/${encodeURIComponent(ecNumber)}`;
}
```

**Step 2: Update enrichSubstance to set ECHA URL**

```typescript
async enrichSubstance(substance: Substance): Promise<boolean> {
  // ... existing code ...

  // Always set ECHA URL if we have EC number (even if PubChem lookup fails)
  if (substance.ecNumber && !substance.echaUrl) {
    substance.echaUrl = this.generateEchaUrl(substance.ecNumber);
  }

  // Skip PubChem if already enriched
  if (substance.smiles) {
    return false;
  }

  // ... rest of existing code ...
}
```

**Step 3: Add test for ECHA URL generation**

Add to `pubchem.enricher.test.ts`:

```typescript
describe('ECHA URL generation', () => {
  it('should_set_echa_url_from_ec_number', async () => {
    const substance = em.create(Substance, {
      casNumber: '50-00-0',
      ecNumber: '200-001-8',
      primaryName: 'formaldehyde',
      isActive: true,
    });
    await em.persistAndFlush(substance);

    await enricher.enrichSubstance(substance);

    await em.refresh(substance);
    expect(substance.echaUrl).toBe(
      'https://echa.europa.eu/substance-information/-/substanceinfo/200-001-8'
    );
  });
});
```

**Step 4: Run tests**

```bash
cd packages/gsr && pnpm test src/seeders/pubchem.enricher.test.ts
```

**Step 5: Commit**

```bash
git add packages/gsr/src/seeders/pubchem.enricher.ts \
        packages/gsr/src/seeders/pubchem.enricher.test.ts
git commit -m "feat(gsr): add ECHA URL generation during enrichment"
```

---

## Phase 4: CLI Integration

### Task 4.1: Create Enrich CLI Command

**Files:**
- Create: `packages/gsr/src/cli/enrich.ts`
- Modify: `packages/gsr/src/cli/index.ts`

**Step 1: Create the enrich command module**

```typescript
// packages/gsr/src/cli/enrich.ts
import { Command } from 'commander';
import { initOrm, closeOrm } from '@eurocomply/database';
import { gsrEntities } from '../entities/index.js';
import { PubChemEnricher } from '../seeders/pubchem.enricher.js';

export function createEnrichCommand(): Command {
  const enrich = new Command('enrich')
    .description('Enrich substances with data from external sources');

  enrich
    .command('pubchem')
    .description('Enrich substances with chemical data from PubChem')
    .option('-b, --batch-size <size>', 'Number of substances per batch', '100')
    .option('-d, --dry-run', 'Preview changes without persisting', false)
    .option('--only-missing', 'Only enrich substances missing SMILES (default)', true)
    .action(async (options) => {
      console.log('\nPubChem Substance Enricher');
      console.log('==========================');
      console.log(`Batch size: ${options.batchSize}`);
      console.log(`Dry run: ${options.dryRun}`);
      console.log('');

      console.log('Connecting to database...');
      const orm = await initOrm({ additionalEntities: gsrEntities });

      try {
        const em = orm.em.fork();
        const enricher = new PubChemEnricher(em);

        console.log('Starting enrichment...\n');

        const result = await enricher.run({
          batchSize: parseInt(options.batchSize, 10),
          dryRun: options.dryRun,
          onlyMissing: options.onlyMissing,
          onProgress: (processed, total) => {
            const pct = Math.round((processed / total) * 100);
            process.stdout.write(`\rProgress: ${processed}/${total} (${pct}%)`);
          },
        });

        console.log('\n');

        if (result.enriched) {
          console.log(`[SUCCESS] ${result.message}`);
        } else {
          console.log(`[SKIPPED] ${result.message}`);
        }

        console.log(`\nSummary:`);
        console.log(`  Enriched: ${result.enrichedCount}`);
        console.log(`  Not found in PubChem: ${result.notFoundCount}`);
        console.log(`  Failed: ${result.failedCount}`);
        console.log(`  Skipped (already enriched): ${result.skippedCount}`);
        console.log(`  Total processed: ${result.totalProcessed}`);

      } finally {
        await closeOrm();
      }
    });

  enrich
    .command('echa-urls')
    .description('Generate ECHA URLs for all substances with EC numbers')
    .option('-d, --dry-run', 'Preview changes without persisting', false)
    .action(async (options) => {
      console.log('\nECHA URL Generator');
      console.log('==================');
      console.log(`Dry run: ${options.dryRun}`);
      console.log('');

      console.log('Connecting to database...');
      const orm = await initOrm({ additionalEntities: gsrEntities });

      try {
        const em = orm.em.fork();
        const { Substance } = await import('@eurocomply/database');

        // Find substances with EC number but no ECHA URL
        const substances = await em.find(Substance, {
          ecNumber: { $ne: null },
          echaUrl: null,
          isActive: true,
        });

        console.log(`Found ${substances.length} substances needing ECHA URLs\n`);

        let updated = 0;
        for (const substance of substances) {
          substance.echaUrl = `https://echa.europa.eu/substance-information/-/substanceinfo/${encodeURIComponent(substance.ecNumber!)}`;
          updated++;
        }

        if (!options.dryRun && updated > 0) {
          await em.flush();
        }

        console.log(`[SUCCESS] Generated ${updated} ECHA URLs`);

      } finally {
        await closeOrm();
      }
    });

  return enrich;
}
```

**Step 2: Register enrich command in main CLI**

Modify: `packages/gsr/src/cli/index.ts`

```typescript
// Add import at top:
import { createEnrichCommand } from './enrich.js';

// Add after seed command registration:
program.addCommand(createEnrichCommand());
```

**Step 3: Add npm scripts to root package.json**

Modify: `/root/Documents/EuroComply/package.json`

```json
{
  "scripts": {
    // ... existing scripts ...
    "gsr:enrich:pubchem": "node --env-file=.env packages/gsr/dist/cli/index.js enrich pubchem",
    "gsr:enrich:echa-urls": "node --env-file=.env packages/gsr/dist/cli/index.js enrich echa-urls"
  }
}
```

**Step 4: Build and test CLI**

```bash
pnpm build --filter=@eurocomply/gsr

# Test help
node --env-file=.env packages/gsr/dist/cli/index.js enrich --help

# Test dry run
pnpm gsr:enrich:pubchem --dry-run --batch-size 5
```

**Step 5: Commit**

```bash
git add packages/gsr/src/cli/enrich.ts \
        packages/gsr/src/cli/index.ts \
        package.json
git commit -m "feat(gsr): add enrich CLI commands for PubChem and ECHA URLs"
```

---

## Phase 5: Documentation & Verification

### Task 5.1: Update GSR Design Doc

**Files:**
- Modify: `docs/designs/global-substance-registry.md` (if exists)

**Step 1: Add enrichment section to design doc**

```markdown
## Data Enrichment

### PubChem Integration

Substances seeded from ECHA EC Inventory contain basic identification data (CAS, EC number, name, molecular formula). Chemical structure data is enriched from PubChem:

| Field | Source | Coverage |
|-------|--------|----------|
| smiles | PubChem | ~80% of substances |
| inchiKey | PubChem | ~80% of substances |
| iupacName | PubChem | ~80% of substances |
| molecularWeight | PubChem | ~80% of substances |
| echaUrl | Generated | 100% (from EC number) |

### Enrichment Commands

```bash
# Full enrichment pipeline
pnpm gsr:seed:inventory          # Seed base substances
pnpm gsr:seed:svhc               # Add regulatory entries
pnpm gsr:enrich:pubchem          # Add chemical structure data
pnpm gsr:enrich:echa-urls        # Generate ECHA links

# Options
pnpm gsr:enrich:pubchem --batch-size 50   # Smaller batches
pnpm gsr:enrich:pubchem --dry-run         # Preview without saving
```

### Rate Limiting

PubChem enforces rate limits (5 req/sec). The enricher:
- Throttles requests to 200ms intervals
- Uses exponential backoff on 429 errors
- Processes in configurable batch sizes
- Reports progress during long runs
```

**Step 2: Commit**

```bash
git add docs/
git commit -m "docs: add GSR enrichment documentation"
```

---

### Task 5.2: Verify Full Pipeline

**Step 1: Run complete enrichment pipeline**

```bash
# 1. Reset database
pnpm db:reset

# 2. Seed substances
pnpm gsr:seed:inventory
pnpm gsr:seed:svhc

# 3. Enrich with PubChem (start with small batch to test)
pnpm gsr:enrich:pubchem --batch-size 50

# 4. Generate ECHA URLs
pnpm gsr:enrich:echa-urls
```

**Step 2: Verify enrichment coverage**

```sql
-- Run in psql
SELECT
  COUNT(*) as total,
  COUNT(smiles) as has_smiles,
  COUNT(inchi_key) as has_inchi,
  COUNT(iupac_name) as has_iupac,
  COUNT(molecular_weight) as has_weight,
  COUNT(echa_url) as has_echa_url,
  ROUND(COUNT(smiles)::numeric / COUNT(*) * 100, 1) as pct_enriched
FROM substance;
```

Expected output (approximate):
```
 total | has_smiles | has_inchi | has_iupac | has_weight | has_echa_url | pct_enriched
-------+------------+-----------+-----------+------------+--------------+--------------
  9841 |       7800 |      7800 |      7500 |       7800 |         9841 |         79.3
```

**Step 3: Sample enriched data**

```sql
SELECT
  primary_name,
  cas_number,
  smiles,
  inchi_key,
  molecular_weight,
  echa_url
FROM substance
WHERE smiles IS NOT NULL
LIMIT 5;
```

**Step 4: Commit verification results**

```bash
git add -A
git commit -m "chore: verify GSR enrichment pipeline"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1.1-1.2 | PubChem API client with rate limiting |
| 2 | 2.1 | PubChem enricher service |
| 3 | 3.1 | ECHA URL generation |
| 4 | 4.1 | CLI integration |
| 5 | 5.1-5.2 | Documentation & verification |

**Total: 6 tasks across 5 phases**

**Estimated enrichment time:**
- 10K substances: ~30 minutes
- 100K substances: ~6 hours (can run overnight)
