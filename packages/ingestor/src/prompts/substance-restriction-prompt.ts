/**
 * System prompt for Claude to extract substance restrictions from EU legal text.
 */
export const SUBSTANCE_RESTRICTION_SYSTEM_PROMPT = `Role: You are a Legal Systems Architect specializing in EU REACH and ESPR compliance.

Task: Extract every distinct substance restriction from the provided EUR-Lex text.

Constraints:
1. For each restriction, identify: substance name, CAS number, threshold, operator, material scope
2. Map operators to these exact enums: GT, GTE, LT, LTE, EQ, PRESENT, ABSENT
3. Provide a confidence_score (0.0-1.0) for each extracted requirement
4. Include your reasoning for complex interpretations
5. Cite the exact legal reference (Article, Paragraph, Entry)
6. Extract PDF coordinates for citation anchoring:
   - Include page number and bounding box (bbox) for each requirement
   - bbox format: [left, top, right, bottom] in PDF coordinate space (points from bottom-left origin)
   - This enables citation highlighting in the admin UI
   - Set pdf_coordinates to null if processing plain text without PDF context

CRITICAL RULES:
- If threshold is "shall not exceed X%", use operator LT with value X
- If threshold is "not more than X%", use operator LTE with value X
- If threshold is "at least X%", use operator GTE with value X
- If substance is "banned" or "prohibited", use operator ABSENT
- When amendments exist, use the MOST RECENT threshold value
- If exemptions exist, set allowsExemption: true and describe conditions

Output Format: Return ONLY valid JSON wrapped in <extraction_results> tags. No preamble.`;

/**
 * User prompt template for extraction.
 */
export function createExtractionPrompt(documentText: string, sourceUrl: string): string {
  return `Extract all substance restrictions from the following EU legal document.

Source URL: ${sourceUrl}

<document>
${documentText}
</document>

Return the extraction in this exact JSON format wrapped in <extraction_results> tags:

<extraction_results>
{
  "regulation_metadata": {
    "code": "REGULATION_CODE",
    "name": "Full Regulation Name",
    "source_url": "${sourceUrl}",
    "version": "2024.1",
    "effective_date": "YYYY-MM-DD",
    "jurisdiction": "EU"
  },
  "requirements": [
    {
      "substance_name": "Name of substance",
      "cas_number": "XXXXX-XX-X",
      "ec_number": "XXX-XXX-X",
      "operator": "LT|LTE|GT|GTE|EQ|PRESENT|ABSENT",
      "threshold_value": 0.05,
      "unit": "PERCENT_BY_WEIGHT|PPM|MG_KG",
      "scope": ["Product type 1", "Product type 2"],
      "legal_reference": "Article X, Paragraph Y",
      "pdf_coordinates": {
        "page": 5,
        "bbox": [72.0, 150.5, 520.0, 180.2]
      },
      "confidence_score": 0.97,
      "reasoning": "Explain your interpretation and any amendments applied",
      "allows_exemption": true,
      "exemption_conditions": "Describe if exemption is conditional"
    }
  ],
  "category_mappings": [
    {
      "requirement_index": 0,
      "suggested_categories": [
        { "path": "apparel.accessories", "confidence": 0.92 }
      ]
    }
  ],
  "extraction_metadata": {
    "model": "claude-4.5-opus",
    "extracted_at": "ISO timestamp",
    "total_requirements": 1,
    "avg_confidence": 0.97
  }
}
</extraction_results>`;
}
