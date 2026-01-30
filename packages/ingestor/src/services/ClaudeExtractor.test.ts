import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClaudeExtractor } from './ClaudeExtractor.js';
import { createPdfExtractionPrompt } from '../prompts/substance-restriction-prompt.js';

/**
 * Tests for ClaudeExtractor pure functions.
 *
 * NOTE: The `extract` method makes external API calls to Claude and cannot be
 * tested without API keys and incurring costs. The pure parsing functions
 * (parseExtractionResponse, normalizeKeys) are tested here per RULES.md
 * exception for "Pure function unit tests".
 *
 * For end-to-end testing of the extraction flow, see IngestionPipeline.integration.test.ts
 * which uses stub objects for external API clients.
 */
describe('ClaudeExtractor', () => {
  let extractor: ClaudeExtractor;

  beforeEach(() => {
    // Constructor doesn't call API - safe to instantiate for testing pure methods
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
      // Missing required field: regulation_metadata.name
      const invalidSchemaResponse = `
<extraction_results>
{
  "regulation_metadata": {
    "code": "REACH-2006"
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

  describe('extractFromPdf', () => {
    it('sends PDF as base64 document block to Claude API', async () => {
      // Create a mock PDF buffer (just test data - not a real PDF)
      const pdfBuffer = Buffer.from('fake-pdf-content');
      const expectedBase64 = pdfBuffer.toString('base64');
      const sourceIdentifier = 'REACH-2006-1907';

      // Mock the Anthropic client's messages.create method
      const mockCreate = vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: `<extraction_results>
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
      "scope": ["Jewelry"],
      "legal_reference": "Article 5, Entry 63",
      "pdf_coordinates": {
        "page": 5,
        "bbox": [72.0, 150.5, 520.0, 180.2]
      },
      "confidence_score": 0.95,
      "reasoning": "Clear threshold",
      "allows_exemption": false,
      "exemption_conditions": null
    }
  ],
  "category_mappings": [],
  "extraction_metadata": {
    "model": "claude-sonnet-4-20250514",
    "extracted_at": "2024-01-15T10:30:00Z",
    "total_requirements": 1,
    "avg_confidence": 0.95
  }
}
</extraction_results>`,
          },
        ],
      });

      // Access the private client and mock it
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (extractor as any).client = {
        messages: {
          create: mockCreate,
        },
      };

      const result = await extractor.extractFromPdf(pdfBuffer, sourceIdentifier);

      // Verify the API was called with correct structure
      expect(mockCreate).toHaveBeenCalledTimes(1);
      const callArgs = mockCreate.mock.calls[0][0];

      // Verify message structure includes document block
      expect(callArgs.messages).toHaveLength(1);
      expect(callArgs.messages[0].role).toBe('user');
      expect(callArgs.messages[0].content).toHaveLength(2);

      // Verify document block structure
      const documentBlock = callArgs.messages[0].content[0];
      expect(documentBlock.type).toBe('document');
      expect(documentBlock.source.type).toBe('base64');
      expect(documentBlock.source.media_type).toBe('application/pdf');
      expect(documentBlock.source.data).toBe(expectedBase64);

      // Verify text block with prompt
      const textBlock = callArgs.messages[0].content[1];
      expect(textBlock.type).toBe('text');
      expect(textBlock.text).toBe(createPdfExtractionPrompt(sourceIdentifier));

      // Verify result parsing worked
      expect(result.regulationMetadata.code).toBe('REACH-2006');
      expect(result.requirements).toHaveLength(1);
      expect(result.requirements[0]?.pdfCoordinates?.page).toBe(5);
      expect(result.requirements[0]?.pdfCoordinates?.bbox).toEqual([72.0, 150.5, 520.0, 180.2]);
    });

    it('throws error when Claude response has no text content', async () => {
      const pdfBuffer = Buffer.from('fake-pdf-content');

      const mockCreate = vi.fn().mockResolvedValue({
        content: [{ type: 'tool_use', id: 'test', name: 'test', input: {} }],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (extractor as any).client = {
        messages: {
          create: mockCreate,
        },
      };

      await expect(extractor.extractFromPdf(pdfBuffer, 'test-source')).rejects.toThrow(
        'No text content in Claude response'
      );
    });
  });
});
