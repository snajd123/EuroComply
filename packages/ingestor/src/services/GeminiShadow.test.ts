import { describe, it, expect } from 'vitest';
import { GeminiShadow } from './GeminiShadow.js';

describe('GeminiShadow', () => {
  describe('parseResponse', () => {
    it('should_parse_valid_json_array', () => {
      const shadow = new GeminiShadow({ apiKey: 'test-key' });

      const response = `[
        {"cas": "7439-92-1", "threshold": 0.05, "unit": "PERCENT_BY_WEIGHT"},
        {"cas": "7440-43-9", "threshold": 0.01, "unit": "PERCENT_BY_WEIGHT"}
      ]`;

      const result = shadow.parseResponse(response);

      expect(result).toHaveLength(2);
      expect(result[0]?.cas).toBe('7439-92-1');
      expect(result[0]?.threshold).toBe(0.05);
    });

    it('should_handle_response_with_markdown_code_block', () => {
      const shadow = new GeminiShadow({ apiKey: 'test-key' });

      const response = `\`\`\`json
[
  {"cas": "7439-92-1", "threshold": 0.05}
]
\`\`\``;

      const result = shadow.parseResponse(response);

      expect(result).toHaveLength(1);
      expect(result[0]?.cas).toBe('7439-92-1');
    });

    it('should_handle_missing_fields', () => {
      const shadow = new GeminiShadow({ apiKey: 'test-key' });

      const response = `[
        {"cas": "7439-92-1"},
        {"threshold": 0.05}
      ]`;

      const result = shadow.parseResponse(response);

      expect(result).toHaveLength(2);
      expect(result[0]?.cas).toBe('7439-92-1');
      expect(result[0]?.threshold).toBeUndefined();
      expect(result[1]?.cas).toBeUndefined();
      expect(result[1]?.threshold).toBe(0.05);
    });

    it('should_return_empty_array_for_empty_response', () => {
      const shadow = new GeminiShadow({ apiKey: 'test-key' });

      const result = shadow.parseResponse('[]');

      expect(result).toHaveLength(0);
    });

    it('should_throw_error_for_invalid_json', () => {
      const shadow = new GeminiShadow({ apiKey: 'test-key' });

      expect(() => shadow.parseResponse('not valid json')).toThrow('Invalid JSON in Gemini response');
    });
  });
});
