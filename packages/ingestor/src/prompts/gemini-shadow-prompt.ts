/**
 * Simplified prompt for Gemini Flash to extract (CAS, threshold) pairs.
 * Used for shadow validation against Claude's extraction.
 */
export const GEMINI_SHADOW_PROMPT = `Extract all substance restrictions from this legal text as a simple list.

For each substance found, extract:
1. CAS number (if mentioned)
2. Threshold percentage (if mentioned)
3. Unit (PERCENT_BY_WEIGHT, PPM, or MG_KG)

Return ONLY a JSON array, no explanation:

[
  {"cas": "7439-92-1", "threshold": 0.05, "unit": "PERCENT_BY_WEIGHT"},
  {"cas": "7440-43-9", "threshold": 0.01, "unit": "PERCENT_BY_WEIGHT"}
]

If no CAS number is given, omit the cas field.
If no threshold is given, omit the threshold field.

DOCUMENT:
`;

/**
 * Creates the full prompt for Gemini shadow extraction.
 */
export function createShadowPrompt(documentText: string): string {
  return `${GEMINI_SHADOW_PROMPT}

${documentText}`;
}
