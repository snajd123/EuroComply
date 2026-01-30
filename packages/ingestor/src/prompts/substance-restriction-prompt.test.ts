import { describe, it, expect } from 'vitest';
import {
  SUBSTANCE_RESTRICTION_SYSTEM_PROMPT,
  createExtractionPrompt,
} from './substance-restriction-prompt.js';

/**
 * Tests for substance restriction prompt templates.
 * These are pure functions per RULES.md exception.
 */
describe('substance-restriction-prompt', () => {
  describe('SUBSTANCE_RESTRICTION_SYSTEM_PROMPT', () => {
    it('should_contain_required_instructions', () => {
      expect(SUBSTANCE_RESTRICTION_SYSTEM_PROMPT).toContain('Legal Systems Architect');
      expect(SUBSTANCE_RESTRICTION_SYSTEM_PROMPT).toContain('REACH');
      expect(SUBSTANCE_RESTRICTION_SYSTEM_PROMPT).toContain('CAS number');
      expect(SUBSTANCE_RESTRICTION_SYSTEM_PROMPT).toContain('confidence_score');
      expect(SUBSTANCE_RESTRICTION_SYSTEM_PROMPT).toContain('<extraction_results>');
    });

    it('should_define_all_operator_enums', () => {
      expect(SUBSTANCE_RESTRICTION_SYSTEM_PROMPT).toContain('GT');
      expect(SUBSTANCE_RESTRICTION_SYSTEM_PROMPT).toContain('GTE');
      expect(SUBSTANCE_RESTRICTION_SYSTEM_PROMPT).toContain('LT');
      expect(SUBSTANCE_RESTRICTION_SYSTEM_PROMPT).toContain('LTE');
      expect(SUBSTANCE_RESTRICTION_SYSTEM_PROMPT).toContain('EQ');
      expect(SUBSTANCE_RESTRICTION_SYSTEM_PROMPT).toContain('PRESENT');
      expect(SUBSTANCE_RESTRICTION_SYSTEM_PROMPT).toContain('ABSENT');
    });

    it('should_include_pdf_coordinate_instructions', () => {
      expect(SUBSTANCE_RESTRICTION_SYSTEM_PROMPT).toContain('PDF coordinates');
      expect(SUBSTANCE_RESTRICTION_SYSTEM_PROMPT).toContain('page number');
      expect(SUBSTANCE_RESTRICTION_SYSTEM_PROMPT).toContain('bounding box');
      expect(SUBSTANCE_RESTRICTION_SYSTEM_PROMPT).toContain('bbox');
    });
  });

  describe('createExtractionPrompt', () => {
    it('should_embed_document_text_in_prompt', () => {
      const documentText = 'Lead shall not exceed 0.05% by weight in jewelry.';
      const sourceUrl = 'https://eur-lex.europa.eu/reach';

      const result = createExtractionPrompt(documentText, sourceUrl);

      expect(result).toContain('<document>');
      expect(result).toContain(documentText);
      expect(result).toContain('</document>');
    });

    it('should_embed_source_url_in_prompt', () => {
      const documentText = 'Sample text';
      const sourceUrl = 'https://eur-lex.europa.eu/test-regulation';

      const result = createExtractionPrompt(documentText, sourceUrl);

      expect(result).toContain(`Source URL: ${sourceUrl}`);
      expect(result).toContain(`"source_url": "${sourceUrl}"`);
    });

    it('should_include_json_schema_template', () => {
      const result = createExtractionPrompt('doc', 'https://example.com');

      expect(result).toContain('"regulation_metadata"');
      expect(result).toContain('"requirements"');
      expect(result).toContain('"extraction_metadata"');
      expect(result).toContain('"category_mappings"');
    });

    it('should_include_pdf_coordinates_in_template', () => {
      const result = createExtractionPrompt('doc', 'https://example.com');

      expect(result).toContain('"pdf_coordinates"');
      expect(result).toContain('"page"');
      expect(result).toContain('"bbox"');
    });
  });
});
