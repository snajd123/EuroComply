import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeExtractor } from './ClaudeExtractor.js';

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn(),
      },
    })),
  };
});

describe('ClaudeExtractor', () => {
  let extractor: ClaudeExtractor;

  beforeEach(() => {
    vi.clearAllMocks();
    extractor = new ClaudeExtractor({ apiKey: 'test-api-key' });
  });

  describe('parseExtractionResponse', () => {
    it('parses valid response with XML tags', () => {
      const validResponse = `
Here is the extraction:

<extraction_results>
{
  "regulation_metadata": {
    "code": "REACH-2006",
    "name": "REACH Regulation",
    "source_url": "https://eur-lex.europa.eu/reach",
    "version": "2024.1",
    "effective_date": "2024-01-01",
    "jurisdiction": "EU"
  },
  "requirements": [
    {
      "substance_name": "Lead",
      "cas_number": "7439-92-1",
      "operator": "LT",
      "threshold_value": 0.05,
      "unit": "PERCENT_BY_WEIGHT",
      "scope": ["Jewelry", "Accessories"],
      "legal_reference": "Article 5, Entry 63",
      "confidence_score": 0.95,
      "reasoning": "Clear threshold specified in Annex XVII",
      "allows_exemption": true,
      "exemption_conditions": "Crystal glass allowed if labeled"
    }
  ],
  "category_mappings": [
    {
      "requirement_index": 0,
      "suggested_categories": [
        { "path": "apparel.accessories.jewelry", "confidence": 0.92 }
      ]
    }
  ],
  "extraction_metadata": {
    "model": "claude-sonnet-4-20250514",
    "extracted_at": "2024-01-15T10:30:00Z",
    "total_requirements": 1,
    "avg_confidence": 0.95
  }
}
</extraction_results>

That completes the extraction.
`;

      const result = extractor.parseExtractionResponse(validResponse);

      expect(result.regulationMetadata.code).toBe('REACH-2006');
      expect(result.regulationMetadata.name).toBe('REACH Regulation');
      expect(result.requirements).toHaveLength(1);
      expect(result.requirements[0]?.substanceName).toBe('Lead');
      expect(result.requirements[0]?.casNumber).toBe('7439-92-1');
      expect(result.requirements[0]?.operator).toBe('LT');
      expect(result.requirements[0]?.thresholdValue).toBe(0.05);
      expect(result.requirements[0]?.confidenceScore).toBe(0.95);
      expect(result.categoryMappings).toHaveLength(1);
      expect(result.extractionMetadata.totalRequirements).toBe(1);
    });

    it('throws on missing extraction tags', () => {
      const invalidResponse = `
Here is the extraction:

{
  "regulation_metadata": {
    "code": "REACH-2006"
  }
}

No XML tags here.
`;

      expect(() => extractor.parseExtractionResponse(invalidResponse)).toThrow(
        'No <extraction_results> tags found in response'
      );
    });

    it('throws on invalid JSON', () => {
      const invalidJsonResponse = `
<extraction_results>
{
  "regulation_metadata": {
    "code": "REACH-2006",
    invalid json here
  }
}
</extraction_results>
`;

      expect(() => extractor.parseExtractionResponse(invalidJsonResponse)).toThrow(
        'Failed to parse extraction JSON'
      );
    });

    it('throws on Zod validation failure', () => {
      const invalidSchemaResponse = `
<extraction_results>
{
  "regulation_metadata": {
    "code": "REACH-2006",
    "name": "REACH Regulation",
    "source_url": "not-a-valid-url"
  },
  "requirements": [],
  "extraction_metadata": {
    "model": "claude",
    "extracted_at": "2024-01-15",
    "total_requirements": 0,
    "avg_confidence": 0.5
  }
}
</extraction_results>
`;

      expect(() => extractor.parseExtractionResponse(invalidSchemaResponse)).toThrow(
        'Extraction validation failed'
      );
    });
  });

  describe('normalizeKeys', () => {
    it('converts snake_case to camelCase recursively', () => {
      const input = {
        regulation_metadata: {
          source_url: 'https://example.com',
          effective_date: '2024-01-01',
        },
        requirements: [
          {
            substance_name: 'Lead',
            cas_number: '7439-92-1',
            threshold_value: 0.05,
            confidence_score: 0.95,
            allows_exemption: true,
            exemption_conditions: 'Some conditions',
          },
        ],
        extraction_metadata: {
          total_requirements: 1,
          avg_confidence: 0.95,
        },
      };

      const result = extractor.normalizeKeys(input);

      expect(result).toEqual({
        regulationMetadata: {
          sourceUrl: 'https://example.com',
          effectiveDate: '2024-01-01',
        },
        requirements: [
          {
            substanceName: 'Lead',
            casNumber: '7439-92-1',
            thresholdValue: 0.05,
            confidenceScore: 0.95,
            allowsExemption: true,
            exemptionConditions: 'Some conditions',
          },
        ],
        extractionMetadata: {
          totalRequirements: 1,
          avgConfidence: 0.95,
        },
      });
    });

    it('handles arrays with mixed content', () => {
      const input = {
        items: [
          { item_name: 'first', nested_obj: { inner_value: 1 } },
          { item_name: 'second', nested_obj: { inner_value: 2 } },
        ],
        plain_array: ['string1', 'string2'],
      };

      const result = extractor.normalizeKeys(input);

      expect(result).toEqual({
        items: [
          { itemName: 'first', nestedObj: { innerValue: 1 } },
          { itemName: 'second', nestedObj: { innerValue: 2 } },
        ],
        plainArray: ['string1', 'string2'],
      });
    });

    it('handles null and primitive values', () => {
      const input = {
        null_value: null,
        number_value: 42,
        boolean_value: true,
        string_value: 'test',
      };

      const result = extractor.normalizeKeys(input);

      expect(result).toEqual({
        nullValue: null,
        numberValue: 42,
        booleanValue: true,
        stringValue: 'test',
      });
    });

    it('handles empty objects and arrays', () => {
      const input = {
        empty_object: {},
        empty_array: [],
      };

      const result = extractor.normalizeKeys(input);

      expect(result).toEqual({
        emptyObject: {},
        emptyArray: [],
      });
    });

    it('preserves already camelCase keys', () => {
      const input = {
        alreadyCamel: 'value',
        mixedCase_and_snake: 'mixed',
      };

      const result = extractor.normalizeKeys(input);

      expect(result).toEqual({
        alreadyCamel: 'value',
        mixedCaseAndSnake: 'mixed',
      });
    });
  });
});
