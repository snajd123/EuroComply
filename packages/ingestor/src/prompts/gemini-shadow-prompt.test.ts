import { describe, it, expect } from 'vitest';
import { GEMINI_SHADOW_PROMPT, createShadowPrompt } from './gemini-shadow-prompt.js';

/**
 * Tests for Gemini shadow prompt templates.
 * These are pure functions per RULES.md exception.
 */
describe('gemini-shadow-prompt', () => {
  describe('GEMINI_SHADOW_PROMPT', () => {
    it('should_request_json_array_format', () => {
      expect(GEMINI_SHADOW_PROMPT).toContain('JSON array');
      expect(GEMINI_SHADOW_PROMPT).toContain('[');
      expect(GEMINI_SHADOW_PROMPT).toContain(']');
    });

    it('should_specify_expected_fields', () => {
      expect(GEMINI_SHADOW_PROMPT).toContain('CAS number');
      expect(GEMINI_SHADOW_PROMPT).toContain('Threshold percentage');
      expect(GEMINI_SHADOW_PROMPT).toContain('"cas"');
      expect(GEMINI_SHADOW_PROMPT).toContain('"threshold"');
      expect(GEMINI_SHADOW_PROMPT).toContain('"unit"');
    });

    it('should_define_unit_options', () => {
      expect(GEMINI_SHADOW_PROMPT).toContain('PERCENT_BY_WEIGHT');
      expect(GEMINI_SHADOW_PROMPT).toContain('PPM');
      expect(GEMINI_SHADOW_PROMPT).toContain('MG_KG');
    });
  });

  describe('createShadowPrompt', () => {
    it('should_combine_base_prompt_with_document', () => {
      const documentText = 'Lead restriction in jewelry: 0.05% max.';

      const result = createShadowPrompt(documentText);

      expect(result).toContain(GEMINI_SHADOW_PROMPT);
      expect(result).toContain(documentText);
    });

    it('should_place_document_after_prompt', () => {
      const documentText = 'Test document content';

      const result = createShadowPrompt(documentText);

      const promptIndex = result.indexOf(GEMINI_SHADOW_PROMPT);
      const docIndex = result.indexOf(documentText);

      expect(docIndex).toBeGreaterThan(promptIndex);
    });

    it('should_handle_multiline_documents', () => {
      const documentText = `Line 1: Lead restriction
Line 2: Cadmium restriction
Line 3: Mercury restriction`;

      const result = createShadowPrompt(documentText);

      expect(result).toContain('Line 1: Lead restriction');
      expect(result).toContain('Line 2: Cadmium restriction');
      expect(result).toContain('Line 3: Mercury restriction');
    });
  });
});
