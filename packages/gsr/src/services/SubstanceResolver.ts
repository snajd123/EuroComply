// packages/gsr/src/services/SubstanceResolver.ts
import { EntityManager } from '@mikro-orm/postgresql';
import { Substance, SubstanceAlias } from '@eurocomply/database';
import { sanitizeCas } from '../utils/cas-sanitizer.js';
import { normalizeName } from '../utils/name-normalizer.js';

/**
 * Resolution status indicating the outcome of a substance lookup.
 */
export enum ResolveStatus {
  /** Single definitive match found */
  MATCHED = 'MATCHED',
  /** Multiple potential matches found (requires human review) */
  CANDIDATES = 'CANDIDATES',
  /** No match found */
  UNRESOLVED = 'UNRESOLVED',
}

/**
 * How the substance was matched.
 */
export type MatchedVia = 'CAS' | 'EC' | 'ALIAS_EXACT' | 'ALIAS_FUZZY';

/**
 * A candidate substance match with confidence information.
 */
export interface SubstanceCandidate {
  /** ID of the matched substance */
  substanceId: string;
  /** CAS number of the matched substance */
  casNumber: string;
  /** Primary name of the matched substance */
  primaryName: string;
  /** How this match was achieved */
  matchedVia: MatchedVia;
  /** Confidence score (0.0 - 1.0) */
  confidence: number;
  /** The alias that matched (if matchedVia is ALIAS_EXACT or ALIAS_FUZZY) */
  matchedAlias?: string;
}

/**
 * Input for substance resolution.
 */
export interface ResolveInput {
  /** CAS Registry Number (will be sanitized and validated) */
  casNumber?: string | null;
  /** EC/EINECS number */
  ecNumber?: string | null;
  /** Substance name or alias */
  name?: string | null;
}

/**
 * Result of substance resolution.
 */
export interface ResolveResult {
  /** Status of the resolution attempt */
  status: ResolveStatus;
  /** The matched substance (when status is MATCHED) */
  match?: SubstanceCandidate;
  /** Potential matches (when status is CANDIDATES) */
  candidates?: SubstanceCandidate[];
  /** Sanitized/normalized input values */
  sanitizedInput: {
    casNumber: string | null;
    ecNumber: string | null;
    name: string | null;
  };
}

/**
 * Service for resolving substance references to master records.
 *
 * Resolution priority:
 * 1. CAS number (exact match with checksum validation)
 * 2. EC number (exact match)
 * 3. Alias exact match (case-insensitive)
 *
 * Future enhancements will add fuzzy matching for CANDIDATES status.
 */
export class SubstanceResolver {
  constructor(private readonly em: EntityManager) {}

  /**
   * Resolves a substance reference to a master record.
   *
   * @param input - The substance reference to resolve
   * @returns Resolution result with status and match information
   */
  async resolve(input: ResolveInput): Promise<ResolveResult> {
    // Sanitize inputs
    const sanitizedCas = sanitizeCas(input.casNumber);
    const sanitizedEc = input.ecNumber?.trim() || null;
    const sanitizedName = input.name ? normalizeName(input.name) : null;

    const sanitizedInput = {
      casNumber: sanitizedCas,
      ecNumber: sanitizedEc,
      name: sanitizedName,
    };

    // Priority 1: CAS number match
    if (sanitizedCas) {
      const substance = await this.em.findOne(Substance, { casNumber: sanitizedCas });
      if (substance) {
        return {
          status: ResolveStatus.MATCHED,
          match: this.toCandidate(substance, 'CAS', 1.0),
          sanitizedInput,
        };
      }
    }

    // Priority 2: EC number match
    if (sanitizedEc) {
      const substance = await this.em.findOne(Substance, { ecNumber: sanitizedEc });
      if (substance) {
        return {
          status: ResolveStatus.MATCHED,
          match: this.toCandidate(substance, 'EC', 1.0),
          sanitizedInput,
        };
      }
    }

    // Priority 3: Alias exact match (case-insensitive)
    if (sanitizedName) {
      // First try to match by name directly (case-insensitive)
      const alias = await this.em.findOne(
        SubstanceAlias,
        { name: { $ilike: sanitizedName } },
        { populate: ['substance'] }
      );
      if (alias) {
        return {
          status: ResolveStatus.MATCHED,
          match: this.toCandidate(alias.substance, 'ALIAS_EXACT', 1.0, alias.name),
          sanitizedInput,
        };
      }

      // Also try matching with the original trimmed input (before normalization)
      // to handle cases like "  PbO2  " matching "PbO2"
      const trimmedName = input.name?.trim() || '';
      if (trimmedName !== sanitizedName) {
        const aliasFromTrimmed = await this.em.findOne(
          SubstanceAlias,
          { name: { $ilike: trimmedName } },
          { populate: ['substance'] }
        );
        if (aliasFromTrimmed) {
          return {
            status: ResolveStatus.MATCHED,
            match: this.toCandidate(aliasFromTrimmed.substance, 'ALIAS_EXACT', 1.0, aliasFromTrimmed.name),
            sanitizedInput,
          };
        }
      }
    }

    // No match found
    return {
      status: ResolveStatus.UNRESOLVED,
      sanitizedInput,
    };
  }

  /**
   * Converts a Substance entity to a SubstanceCandidate.
   */
  private toCandidate(
    substance: Substance,
    matchedVia: MatchedVia,
    confidence: number,
    matchedAlias?: string
  ): SubstanceCandidate {
    const candidate: SubstanceCandidate = {
      substanceId: substance.id,
      casNumber: substance.casNumber,
      primaryName: substance.primaryName,
      matchedVia,
      confidence,
    };

    if (matchedAlias) {
      candidate.matchedAlias = matchedAlias;
    }

    return candidate;
  }
}
