import type { ExtractedRequirement, ShadowExtraction } from '../types/extraction.js';
import { ConsensusStatus } from '@eurocomply/database';

export interface ConflictDetails {
  claude: { threshold: number; unit: string };
  gemini: { threshold: number; unit: string };
}

export interface ComparisonResult {
  requirementIndex: number;
  status: 'MATCH' | 'CONFLICT' | 'LOW_CONFIDENCE' | 'SHADOW_MISSING';
  conflictDetails?: ConflictDetails;
}

export interface ComparatorOptions {
  confidenceThreshold?: number;
  thresholdTolerance?: number;
}

/**
 * Unit conversion factors to PPM (parts per million).
 * Used to normalize thresholds before comparison.
 */
const UNIT_TO_PPM: Record<string, number> = {
  'PERCENT_BY_WEIGHT': 10000,  // 1% = 10,000 ppm
  'PERCENT': 10000,
  'PPM': 1,
  'MG_KG': 1,                  // mg/kg = ppm (in mass terms)
  'MG_L': 1,                   // Approximately, for aqueous solutions
  'UG_KG': 0.001,              // 1 μg/kg = 0.001 ppm
};

/**
 * Compares Claude's primary extraction against Gemini's shadow extraction.
 *
 * Detects conflicts, low confidence, and missing shadow matches.
 * Normalizes units before comparison to prevent false conflicts.
 */
export class Comparator {
  private confidenceThreshold: number;
  private thresholdTolerance: number;

  constructor(options?: ComparatorOptions) {
    this.confidenceThreshold = options?.confidenceThreshold ?? 0.95;
    this.thresholdTolerance = options?.thresholdTolerance ?? 1; // 1 ppm tolerance after normalization
  }

  /**
   * Normalizes a threshold value to PPM for consistent comparison.
   */
  private toPpm(value: number, unit: string): number {
    const factor = UNIT_TO_PPM[unit] ?? 1;
    return value * factor;
  }

  /**
   * Compares primary extraction against shadow extraction.
   */
  compare(primary: ExtractedRequirement[], shadow: ShadowExtraction): ComparisonResult[] {
    return primary.map((req, index) => this.compareRequirement(index, req, shadow));
  }

  /**
   * Compares a single requirement against shadow data.
   */
  private compareRequirement(
    index: number,
    requirement: ExtractedRequirement,
    shadow: ShadowExtraction
  ): ComparisonResult {
    // Find matching shadow entry by CAS number
    const casNumber = requirement.casNumber;
    const shadowMatch = casNumber
      ? shadow.find(s => s.cas === casNumber)
      : undefined;

    // No shadow match found
    if (!shadowMatch) {
      return {
        requirementIndex: index,
        status: 'SHADOW_MISSING',
      };
    }

    // Check for threshold conflicts (with unit normalization)
    const claudeThreshold = requirement.thresholdValue;
    const geminiThreshold = shadowMatch.threshold;
    const claudeUnit = requirement.unit ?? 'PPM';
    const geminiUnit = shadowMatch.unit ?? 'PPM';

    if (claudeThreshold !== undefined && geminiThreshold !== undefined) {
      // Normalize both values to PPM before comparing
      const claudePpm = this.toPpm(claudeThreshold, claudeUnit);
      const geminiPpm = this.toPpm(geminiThreshold, geminiUnit);
      const difference = Math.abs(claudePpm - geminiPpm);

      if (difference > this.thresholdTolerance) {
        return {
          requirementIndex: index,
          status: 'CONFLICT',
          conflictDetails: {
            claude: {
              threshold: claudeThreshold,
              unit: claudeUnit,
            },
            gemini: {
              threshold: geminiThreshold,
              unit: geminiUnit,
            },
          },
        };
      }
    }

    // Check confidence level
    if (requirement.confidenceScore < this.confidenceThreshold) {
      return {
        requirementIndex: index,
        status: 'LOW_CONFIDENCE',
      };
    }

    // All checks passed
    return {
      requirementIndex: index,
      status: 'MATCH',
    };
  }

  /**
   * Converts comparison status to ConsensusStatus enum.
   */
  static toConsensusStatus(status: ComparisonResult['status']): ConsensusStatus {
    switch (status) {
      case 'MATCH':
        return ConsensusStatus.MATCH;
      case 'CONFLICT':
        return ConsensusStatus.CONFLICT;
      case 'LOW_CONFIDENCE':
        return ConsensusStatus.LOW_CONFIDENCE;
      case 'SHADOW_MISSING':
        return ConsensusStatus.SHADOW_MISSING;
    }
  }
}
