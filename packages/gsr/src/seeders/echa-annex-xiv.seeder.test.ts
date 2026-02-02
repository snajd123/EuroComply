// packages/gsr/src/seeders/echa-annex-xiv.seeder.test.ts
import { describe, it, expect } from 'vitest';
import { extractArticle57Reason } from './echa-annex-xiv.seeder.js';

describe('EchaAnnexXivSeeder', () => {
  describe('extractArticle57Reason', () => {
    it('should_extract_carcinogenic_reason_when_article_57a', () => {
      const result = extractArticle57Reason('Carcinogenic (Article 57a)');
      expect(result).toBe('Carcinogenic (Article 57a)');
    });

    it('should_extract_mutagenic_reason_when_article_57b', () => {
      const result = extractArticle57Reason('Mutagenic (Article 57b)');
      expect(result).toBe('Mutagenic (Article 57b)');
    });

    it('should_extract_toxic_for_reproduction_reason_when_article_57c', () => {
      const result = extractArticle57Reason('Toxic for reproduction (Article 57c)');
      expect(result).toBe('Toxic for reproduction (Article 57c)');
    });

    it('should_extract_PBT_reason_when_article_57d', () => {
      const result = extractArticle57Reason('PBT (Article 57d)');
      expect(result).toBe('PBT (Article 57d)');
    });

    it('should_extract_vPvB_reason_when_article_57e', () => {
      const result = extractArticle57Reason('vPvB (Article 57e)');
      expect(result).toBe('vPvB (Article 57e)');
    });

    it('should_extract_equivalent_concern_reason_when_article_57f', () => {
      const result = extractArticle57Reason(
        'Equivalent level of concern having probable serious effects (Article 57f)'
      );
      expect(result).toBe('Equivalent level of concern having probable serious effects (Article 57f)');
    });

    it('should_handle_multiple_reasons_when_comma_separated', () => {
      const result = extractArticle57Reason(
        'Carcinogenic (Article 57a), Mutagenic (Article 57b)'
      );
      expect(result).toBe('Carcinogenic (Article 57a), Mutagenic (Article 57b)');
    });

    it('should_return_original_text_when_no_article_reference', () => {
      const result = extractArticle57Reason('Some hazardous property');
      expect(result).toBe('Some hazardous property');
    });

    it('should_trim_whitespace', () => {
      const result = extractArticle57Reason('  Carcinogenic (Article 57a)  ');
      expect(result).toBe('Carcinogenic (Article 57a)');
    });

    it('should_return_empty_string_when_input_empty', () => {
      const result = extractArticle57Reason('');
      expect(result).toBe('');
    });
  });
});
