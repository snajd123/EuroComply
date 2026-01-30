import Anthropic from '@anthropic-ai/sdk';
import { ExtractionResultSchema, type ExtractionResult } from '../types/extraction.js';
import { SUBSTANCE_RESTRICTION_SYSTEM_PROMPT, createExtractionPrompt } from '../prompts/substance-restriction-prompt.js';

/** Maximum tokens for extraction response */
const MAX_EXTRACTION_TOKENS = 8192;

/** Default Claude model for extraction */
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

export interface ClaudeExtractorOptions {
  apiKey: string;
  model?: string;
}

export class ClaudeExtractor {
  private client: Anthropic;
  private model: string;

  constructor(options: ClaudeExtractorOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model ?? DEFAULT_MODEL;
  }

  /**
   * Extracts structured requirements from a legal document using Claude.
   */
  async extract(documentText: string, sourceUrl: string): Promise<ExtractionResult> {
    const userPrompt = createExtractionPrompt(documentText, sourceUrl);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_EXTRACTION_TOKENS,
      system: SUBSTANCE_RESTRICTION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    // Extract text content from the response
    const textContent = response.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in Claude response');
    }

    return this.parseExtractionResponse(textContent.text);
  }

  /**
   * Parses the extraction response from Claude, extracting JSON from XML tags.
   */
  parseExtractionResponse(response: string): ExtractionResult {
    // Extract content between <extraction_results> tags
    const regex = /<extraction_results>([\s\S]*?)<\/extraction_results>/;
    const match = regex.exec(response);

    if (!match?.[1]) {
      throw new Error('No <extraction_results> tags found in response');
    }

    const jsonContent = match[1].trim();

    // Parse the JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonContent);
    } catch {
      throw new Error('Failed to parse extraction JSON');
    }

    // Normalize snake_case keys to camelCase
    const normalized = this.normalizeKeys(parsed as Record<string, unknown>);

    // Validate with Zod schema
    const result = ExtractionResultSchema.safeParse(normalized);

    if (!result.success) {
      const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`Extraction validation failed: ${errors}`);
    }

    return result.data;
  }

  /**
   * Recursively converts snake_case keys to camelCase.
   */
  normalizeKeys(obj: Record<string, unknown>): Record<string, unknown> {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => {
        if (item !== null && typeof item === 'object') {
          return this.normalizeKeys(item as Record<string, unknown>);
        }
        return item;
      }) as unknown as Record<string, unknown>;
    }

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const camelKey = this.snakeToCamel(key);

      if (value !== null && typeof value === 'object') {
        result[camelKey] = this.normalizeKeys(value as Record<string, unknown>);
      } else {
        result[camelKey] = value;
      }
    }

    return result;
  }

  /**
   * Converts a snake_case string to camelCase.
   */
  private snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  }
}
