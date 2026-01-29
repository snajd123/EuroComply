import { ShadowExtractionSchema, type ShadowExtraction } from '../types/extraction.js';
import { createShadowPrompt } from '../prompts/gemini-shadow-prompt.js';

export interface GeminiShadowOptions {
  apiKey: string;
  model?: string;
}

/**
 * Gemini Flash-based shadow extractor for validation.
 *
 * Extracts simplified (CAS, threshold) pairs from legal documents
 * for comparison against Claude's primary extraction.
 */
export class GeminiShadow {
  private apiKey: string;
  private model: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';

  constructor(options: GeminiShadowOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? 'gemini-2.0-flash';
  }

  /**
   * Extracts simplified substance data from a legal document.
   */
  async extract(documentText: string): Promise<ShadowExtraction> {
    const prompt = createShadowPrompt(documentText);

    const response = await fetch(
      `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${error}`);
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('No text content in Gemini response');
    }

    return this.parseResponse(text);
  }

  /**
   * Parses the shadow extraction response.
   */
  parseResponse(response: string): ShadowExtraction {
    // Strip markdown code block if present
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      throw new Error(`Invalid JSON in Gemini response: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    const result = ShadowExtractionSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`Shadow extraction validation failed: ${result.error.message}`);
    }

    return result.data;
  }
}
