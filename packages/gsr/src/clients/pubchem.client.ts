// packages/gsr/src/clients/pubchem.client.ts

import type {
  PubChemCidResponse,
  PubChemPropertiesResponse,
  PubChemSynonymsResponse,
  SubstanceEnrichmentData,
} from './pubchem.types.js';

export interface PubChemClientOptions {
  /** Base URL for PubChem PUG REST API */
  baseUrl?: string;
  /** Maximum requests per second (default: 2 - conservative to avoid rate limits) */
  requestsPerSecond?: number;
  /** Maximum retry attempts (default: 5) */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms (default: 2000) */
  baseRetryDelay?: number;
  /** Enable verbose logging for debugging */
  verbose?: boolean;
}

interface CompoundProperties {
  smiles: string | null;
  inchiKey: string | null;
  iupacName: string | null;
  molecularWeight: number | null;
  molecularFormula: string | null;
}

/**
 * PubChem PUG REST API client with rate limiting.
 *
 * @see https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest
 * @see https://pubchem.ncbi.nlm.nih.gov/docs/programmatic-access
 */
export class PubChemClient {
  private readonly baseUrl: string;
  private readonly requestsPerSecond: number;
  private readonly maxRetries: number;
  private readonly baseRetryDelay: number;
  private readonly minRequestInterval: number;
  private readonly verbose: boolean;
  private lastRequestTime: number = 0;
  private requestQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue: boolean = false;
  private rateLimitHits: number = 0;

  constructor(options: PubChemClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
    // Conservative rate: 2 requests/sec (each enrichment = 3 calls, so ~0.67 substances/sec)
    this.requestsPerSecond = options.requestsPerSecond ?? 2;
    this.maxRetries = options.maxRetries ?? 5;
    this.baseRetryDelay = options.baseRetryDelay ?? 2000;
    this.minRequestInterval = 1000 / this.requestsPerSecond;
    this.verbose = options.verbose ?? false;
  }

  /**
   * Look up a PubChem CID by CAS number.
   *
   * @param casNumber - The CAS registry number (e.g., "50-00-0")
   * @returns The CID if found, null otherwise
   */
  async getCidByCas(casNumber: string): Promise<number | null> {
    const url = `${this.baseUrl}/compound/name/${encodeURIComponent(casNumber)}/cids/JSON`;

    const response = await this.makeRequest<PubChemCidResponse>(url);
    if (!response) {
      return null;
    }

    const cids = response.IdentifierList?.CID;
    if (cids && cids.length > 0) {
      const firstCid = cids[0];
      if (firstCid !== undefined) {
        return firstCid;
      }
    }

    return null;
  }

  /**
   * Get compound properties by CID.
   *
   * @param cid - The PubChem Compound ID
   * @returns Compound properties if found, null otherwise
   */
  async getCompoundProperties(cid: number): Promise<CompoundProperties | null> {
    const propertyNames = [
      'MolecularFormula',
      'MolecularWeight',
      'CanonicalSMILES',
      'InChIKey',
      'IUPACName',
    ].join(',');

    const url = `${this.baseUrl}/compound/cid/${cid}/property/${propertyNames}/JSON`;

    const response = await this.makeRequest<PubChemPropertiesResponse>(url);
    if (!response) {
      return null;
    }

    const propList = response.PropertyTable?.Properties;
    if (propList && propList.length > 0) {
      const prop = propList[0];
      if (!prop) {
        return null;
      }

      // PubChem returns SMILES in various field names depending on request
      const smiles = prop.SMILES ?? prop.CanonicalSMILES ?? prop.ConnectivitySMILES ?? null;

      // MolecularWeight can be returned as string or number
      const molecularWeight =
        prop.MolecularWeight !== undefined
          ? typeof prop.MolecularWeight === 'string'
            ? parseFloat(prop.MolecularWeight)
            : prop.MolecularWeight
          : null;

      // If we got a response but no actual data (just CID), return null
      if (!smiles && !prop.InChIKey && !prop.IUPACName && !prop.MolecularFormula) {
        return null;
      }

      return {
        smiles,
        inchiKey: prop.InChIKey ?? null,
        iupacName: prop.IUPACName ?? null,
        molecularWeight,
        molecularFormula: prop.MolecularFormula ?? null,
      };
    }

    return null;
  }

  /**
   * Get synonyms for a compound by CID.
   *
   * @param cid - The PubChem Compound ID
   * @returns Array of synonyms, empty array if not found
   */
  async getSynonyms(cid: number): Promise<string[]> {
    const url = `${this.baseUrl}/compound/cid/${cid}/synonyms/JSON`;

    const response = await this.makeRequest<PubChemSynonymsResponse>(url);
    if (!response) {
      return [];
    }

    const infoList = response.InformationList?.Information;
    if (infoList && infoList.length > 0) {
      const info = infoList[0];
      if (info?.Synonym) {
        return info.Synonym;
      }
    }

    return [];
  }

  /**
   * Get complete enrichment data for a CAS number.
   * Combines CID lookup, property retrieval, and synonym fetching.
   *
   * @param casNumber - The CAS registry number
   * @returns Enrichment data if found, null otherwise
   */
  async getEnrichmentData(casNumber: string): Promise<SubstanceEnrichmentData | null> {
    const cid = await this.getCidByCas(casNumber);
    if (!cid) {
      return null;
    }

    const properties = await this.getCompoundProperties(cid);
    if (!properties) {
      return null;
    }

    // Fetch synonyms in parallel with rate limiting
    const synonyms = await this.getSynonyms(cid);

    return {
      cid,
      ...properties,
      synonyms,
    };
  }

  /**
   * Make a rate-limited request to the PubChem API.
   */
  private async makeRequest<T>(url: string): Promise<T | null> {
    return new Promise((resolve, reject) => {
      const task = async (): Promise<void> => {
        try {
          const result = await this.executeWithRetry<T>(url);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };

      this.requestQueue.push(task);
      this.processQueue();
    });
  }

  /**
   * Process the request queue with rate limiting.
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      const waitTime = Math.max(0, this.minRequestInterval - timeSinceLastRequest);

      if (waitTime > 0) {
        await this.sleep(waitTime);
      }

      const task = this.requestQueue.shift();
      if (task) {
        this.lastRequestTime = Date.now();
        await task();
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Execute a request with exponential backoff retry.
   */
  private async executeWithRetry<T>(url: string): Promise<T | null> {
    let lastError: Error | null = null;
    const maxRateLimitRetries = 10; // Extra retries specifically for rate limits
    let rateLimitRetries = 0;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'EuroComply-GSR/1.0 (https://eurocomply.com)',
          },
        });

        // Handle 404 as "not found" - not an error
        if (response.status === 404) {
          return null;
        }

        // Handle 400 BadRequest (invalid IDs) as "not found"
        if (response.status === 400) {
          const text = await response.text();
          if (text.includes('PUGREST.BadRequest') || text.includes('Invalid ID')) {
            return null;
          }
          throw new Error(`PubChem API error: ${response.status} ${text}`);
        }

        // Handle rate limiting (429) and server overload (503)
        if (response.status === 429 || response.status === 503) {
          this.rateLimitHits++;
          rateLimitRetries++;

          if (rateLimitRetries > maxRateLimitRetries) {
            throw new Error(`PubChem rate limit exceeded after ${maxRateLimitRetries} retries`);
          }

          const retryAfter = response.headers.get('Retry-After');
          // Use longer backoff for rate limits: 5s, 10s, 20s, 40s...
          const waitTime = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : Math.min(5000 * Math.pow(2, rateLimitRetries - 1), 60000);

          if (this.verbose || rateLimitRetries > 2) {
            console.warn(
              `[PubChem] Rate limited (${response.status}), waiting ${waitTime}ms (retry ${rateLimitRetries}/${maxRateLimitRetries})`,
            );
          }

          await this.sleep(waitTime);
          attempt--; // Don't count rate limit retries against main retry count
          continue;
        }

        // Handle other errors
        if (!response.ok) {
          throw new Error(`PubChem API error: ${response.status} ${response.statusText}`);
        }

        const data = (await response.json()) as T;

        // Check for PubChem fault response (some endpoints return 200 with fault)
        const faultCheck = data as { Fault?: { Code: string; Message: string } };
        if (faultCheck.Fault) {
          if (faultCheck.Fault.Code === 'PUGREST.NotFound') {
            return null;
          }
          // ServerBusy is retryable
          if (faultCheck.Fault.Code === 'PUGREST.ServerBusy') {
            rateLimitRetries++;
            const waitTime = Math.min(5000 * Math.pow(2, rateLimitRetries - 1), 60000);
            if (this.verbose || rateLimitRetries > 2) {
              console.warn(`[PubChem] Server busy, waiting ${waitTime}ms`);
            }
            await this.sleep(waitTime);
            attempt--;
            continue;
          }
          throw new Error(`PubChem fault: ${faultCheck.Fault.Code} - ${faultCheck.Fault.Message}`);
        }

        return data;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on non-retryable errors
        if (
          lastError.message.includes('PubChem fault') &&
          !lastError.message.includes('ServerBusy')
        ) {
          throw lastError;
        }

        // Exponential backoff for other errors
        if (attempt < this.maxRetries - 1) {
          const waitTime = this.baseRetryDelay * Math.pow(2, attempt);
          await this.sleep(waitTime);
        }
      }
    }

    throw lastError ?? new Error('Request failed after retries');
  }

  /**
   * Sleep for the specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
