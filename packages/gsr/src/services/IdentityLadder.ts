// packages/gsr/src/services/IdentityLadder.ts
import { EntityManager } from '@mikro-orm/postgresql';
import { Substance } from '@eurocomply/database';
import { SubstanceCosing, SubstanceEfsa } from '../entities/index.js';
import { sanitizeCas } from '../utils/cas-sanitizer.js';

/**
 * Input for the 6-step Identity Ladder resolution algorithm.
 * Provide any combination of identifiers for substance matching.
 */
export interface ResolveInput {
  /** InChIKey structure hash (27 chars, e.g., LFQSCWFLJHTTHZ-UHFFFAOYSA-N) */
  inchiKey?: string;
  /** CAS Registry Number (e.g., 64-17-5) */
  casNumber?: string;
  /** EC/EINECS number (e.g., 200-578-6) */
  ecNumber?: string;
  /** INCI name from CosIng database */
  inciName?: string;
  /** E-Number from EFSA (e.g., E1510) */
  eNumber?: string;
  /** Name for fuzzy matching against primaryName */
  name?: string;
}

/**
 * How the substance was matched.
 * Listed in priority order (1-6).
 */
export type MatchType =
  | 'INCHIKEY'    // Step 1: Exact InChIKey match
  | 'CAS'         // Step 2: Exact CAS number match
  | 'EC'          // Step 3: Exact EC number match
  | 'INCI'        // Step 4: Exact INCI name match via SubstanceCosing
  | 'E_NUMBER'    // Step 5: Exact E-Number match via SubstanceEfsa
  | 'NAME_FUZZY'; // Step 6: Fuzzy name match using pg_trgm

/**
 * Result of Identity Ladder resolution.
 */
export interface ResolveResult {
  /** Resolution status */
  status: 'FOUND' | 'NOT_FOUND';
  /** The matched substance (when status is FOUND) */
  substance?: Substance;
  /** How the match was achieved */
  matchedVia?: MatchType;
  /** Confidence score (0 to 1.0) */
  confidence: number;
}

/**
 * Row returned from fuzzy match SQL query.
 */
interface FuzzyMatchRow {
  id: string;
  cas_number: string;
  primary_name: string;
  similarity: number;
}

/**
 * Minimum similarity threshold for fuzzy name matching (0.0 - 1.0).
 * Names with similarity below this threshold are not considered matches.
 */
const FUZZY_MIN_THRESHOLD = 0.8;

/**
 * Identity Ladder Service - 6-step resolution algorithm for finding Golden Record substances.
 *
 * The ladder tries identifiers in priority order:
 * 1. InChIKey - Exact match on substance.inchiKey (confidence: 1.0)
 * 2. CAS Number - Exact match on substance.casNumber (confidence: 1.0)
 * 3. EC Number - Exact match on substance.ecNumber (confidence: 1.0)
 * 4. INCI Name - Exact match via SubstanceCosing persona (confidence: 1.0)
 * 5. E-Number - Exact match via SubstanceEfsa persona (confidence: 1.0)
 * 6. Fuzzy Name - pg_trgm similarity > 0.8 on substance.primaryName (confidence: similarity score)
 *
 * The first successful match wins. If no match is found at any step,
 * returns { status: 'NOT_FOUND', confidence: 0 }.
 */
export class IdentityLadder {
  constructor(private readonly em: EntityManager) {}

  /**
   * Resolves substance identifiers to a Golden Record substance using the 6-step ladder.
   *
   * @param input - One or more substance identifiers
   * @returns Resolution result with matched substance or NOT_FOUND
   */
  async resolve(input: ResolveInput): Promise<ResolveResult> {
    // Step 1: InChIKey match (most specific chemical identifier)
    if (input.inchiKey) {
      const trimmedKey = input.inchiKey.trim();
      if (trimmedKey) {
        const substance = await this.em.findOne(Substance, { inchiKey: trimmedKey });
        if (substance) {
          return this.found(substance, 'INCHIKEY', 1.0);
        }
      }
    }

    // Step 2: CAS Number match
    if (input.casNumber) {
      // Sanitize CAS number (validates checksum and format)
      const sanitizedCas = sanitizeCas(input.casNumber);
      if (sanitizedCas) {
        const substance = await this.em.findOne(Substance, { casNumber: sanitizedCas });
        if (substance) {
          return this.found(substance, 'CAS', 1.0);
        }
      }
    }

    // Step 3: EC Number match
    if (input.ecNumber) {
      const trimmedEc = input.ecNumber.trim();
      if (trimmedEc) {
        const substance = await this.em.findOne(Substance, { ecNumber: trimmedEc });
        if (substance) {
          return this.found(substance, 'EC', 1.0);
        }
      }
    }

    // Step 4: INCI Name match via SubstanceCosing
    if (input.inciName) {
      const normalizedInci = input.inciName.trim().toLowerCase();
      if (normalizedInci) {
        const cosing = await this.em.findOne(
          SubstanceCosing,
          { inciNameNormalized: normalizedInci },
          { populate: ['substance'] }
        );
        if (cosing) {
          return this.found(cosing.substance, 'INCI', 1.0);
        }
      }
    }

    // Step 5: E-Number match via SubstanceEfsa
    if (input.eNumber) {
      const normalizedENumber = input.eNumber.trim().toUpperCase();
      if (normalizedENumber) {
        // Use case-insensitive match for E-Number
        const efsa = await this.em.findOne(
          SubstanceEfsa,
          { eNumber: { $ilike: normalizedENumber } },
          { populate: ['substance'] }
        );
        if (efsa) {
          return this.found(efsa.substance, 'E_NUMBER', 1.0);
        }
      }
    }

    // Step 6: Fuzzy name match using pg_trgm
    if (input.name) {
      const trimmedName = input.name.trim();
      if (trimmedName) {
        const fuzzyResult = await this.fuzzyMatch(trimmedName);
        if (fuzzyResult) {
          return fuzzyResult;
        }
      }
    }

    // No match found at any step
    return this.notFound();
  }

  /**
   * Helper to create a FOUND result.
   */
  private found(substance: Substance, matchedVia: MatchType, confidence: number): ResolveResult {
    return {
      status: 'FOUND',
      substance,
      matchedVia,
      confidence,
    };
  }

  /**
   * Helper to create a NOT_FOUND result.
   */
  private notFound(): ResolveResult {
    return {
      status: 'NOT_FOUND',
      confidence: 0,
    };
  }

  /**
   * Performs fuzzy matching using PostgreSQL pg_trgm extension.
   * Searches substance.primaryName for similar names.
   *
   * @param name - The name to search for
   * @returns ResolveResult if match found above threshold, null otherwise
   */
  private async fuzzyMatch(name: string): Promise<ResolveResult | null> {
    try {
      // Use pg_trgm's similarity() function for fuzzy matching
      // MikroORM uses Knex under the hood, so we use ? placeholders
      const rows = await this.em.getConnection().execute<FuzzyMatchRow[]>(`
        SELECT
          s.id,
          s.cas_number,
          s.primary_name,
          similarity(LOWER(s.primary_name), LOWER(?)) as similarity
        FROM substance s
        WHERE similarity(LOWER(s.primary_name), LOWER(?)) > ?
        ORDER BY similarity DESC
        LIMIT 1
      `, [name, name, FUZZY_MIN_THRESHOLD]);

      const topMatch = rows[0];
      if (!topMatch) {
        return null;
      }

      const substance = await this.em.findOne(Substance, { id: topMatch.id });

      if (!substance) {
        return null;
      }

      return {
        status: 'FOUND',
        substance,
        matchedVia: 'NAME_FUZZY',
        confidence: Number(topMatch.similarity),
      };
    } catch (error) {
      // Only silence pg_trgm-specific errors; let others propagate
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('function similarity') ||
          errorMessage.includes('pg_trgm')) {
        return null;
      }
      throw error;
    }
  }
}
