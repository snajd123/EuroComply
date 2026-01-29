import { describe, it, expect } from 'vitest';
import { Comparator, type ComparisonResult } from './Comparator.js';
import type { ExtractedRequirement, ShadowExtraction } from '../types/extraction.js';

describe('Comparator', () => {
  const comparator = new Comparator();

  describe('compare', () => {
    it('should_return_MATCH_when_thresholds_agree', () => {
      const primary: ExtractedRequirement[] = [
        {
          casNumber: '7439-92-1',
          thresholdValue: 0.05,
          unit: 'PERCENT_BY_WEIGHT',
          legalReference: 'Entry 63',
          confidenceScore: 0.97,
          reasoning: 'Lead restriction',
        },
      ];

      const shadow: ShadowExtraction = [
        { cas: '7439-92-1', threshold: 0.05, unit: 'PERCENT_BY_WEIGHT' },
      ];

      const results = comparator.compare(primary, shadow);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('MATCH');
      expect(results[0].conflictDetails).toBeUndefined();
    });

    it('should_return_CONFLICT_when_thresholds_disagree', () => {
      const primary: ExtractedRequirement[] = [
        {
          casNumber: '7439-92-1',
          thresholdValue: 0.05,
          unit: 'PERCENT_BY_WEIGHT',
          legalReference: 'Entry 63',
          confidenceScore: 0.97,
          reasoning: 'Lead restriction',
        },
      ];

      const shadow: ShadowExtraction = [
        { cas: '7439-92-1', threshold: 0.5, unit: 'PERCENT_BY_WEIGHT' },
      ];

      const results = comparator.compare(primary, shadow);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('CONFLICT');
      expect(results[0].conflictDetails).toBeDefined();
      expect(results[0].conflictDetails?.claude.threshold).toBe(0.05);
      expect(results[0].conflictDetails?.gemini.threshold).toBe(0.5);
    });

    it('should_return_LOW_CONFIDENCE_when_confidence_below_threshold', () => {
      const primary: ExtractedRequirement[] = [
        {
          casNumber: '7439-92-1',
          thresholdValue: 0.05,
          unit: 'PERCENT_BY_WEIGHT',
          legalReference: 'Entry 63',
          confidenceScore: 0.80, // Below 0.95 threshold
          reasoning: 'Lead restriction',
        },
      ];

      const shadow: ShadowExtraction = [
        { cas: '7439-92-1', threshold: 0.05, unit: 'PERCENT_BY_WEIGHT' },
      ];

      const results = comparator.compare(primary, shadow);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('LOW_CONFIDENCE');
    });

    it('should_return_SHADOW_MISSING_when_no_shadow_match', () => {
      const primary: ExtractedRequirement[] = [
        {
          casNumber: '7439-92-1',
          thresholdValue: 0.05,
          unit: 'PERCENT_BY_WEIGHT',
          legalReference: 'Entry 63',
          confidenceScore: 0.97,
          reasoning: 'Lead restriction',
        },
      ];

      const shadow: ShadowExtraction = [
        { cas: '9999-99-9', threshold: 0.1 }, // Different CAS
      ];

      const results = comparator.compare(primary, shadow);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('SHADOW_MISSING');
    });

    it('should_handle_requirements_without_CAS_numbers', () => {
      const primary: ExtractedRequirement[] = [
        {
          substanceName: 'Generic Chemical',
          thresholdValue: 0.1,
          unit: 'PERCENT_BY_WEIGHT',
          legalReference: 'Article 5',
          confidenceScore: 0.95,
          reasoning: 'No CAS provided',
        },
      ];

      const shadow: ShadowExtraction = [];

      const results = comparator.compare(primary, shadow);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('SHADOW_MISSING');
    });

    // UNIT NORMALIZATION TESTS
    it('should_return_MATCH_when_values_equal_after_unit_normalization', () => {
      const primary: ExtractedRequirement[] = [
        {
          casNumber: '7439-92-1',
          thresholdValue: 0.1,           // 0.1% = 1000 ppm
          unit: 'PERCENT_BY_WEIGHT',
          legalReference: 'Entry 63',
          confidenceScore: 0.97,
          reasoning: 'Lead restriction',
        },
      ];

      const shadow: ShadowExtraction = [
        { cas: '7439-92-1', threshold: 1000, unit: 'PPM' },  // 1000 ppm = 0.1%
      ];

      const results = comparator.compare(primary, shadow);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('MATCH');
    });

    it('should_return_MATCH_for_mg_kg_vs_ppm_equivalence', () => {
      const primary: ExtractedRequirement[] = [
        {
          casNumber: '7440-43-9',
          thresholdValue: 100,
          unit: 'MG_KG',                // 100 mg/kg = 100 ppm
          legalReference: 'Entry 23',
          confidenceScore: 0.95,
          reasoning: 'Cadmium restriction',
        },
      ];

      const shadow: ShadowExtraction = [
        { cas: '7440-43-9', threshold: 100, unit: 'PPM' },  // 100 ppm
      ];

      const results = comparator.compare(primary, shadow);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('MATCH');
    });
  });
});
