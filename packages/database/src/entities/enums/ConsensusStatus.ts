/**
 * Consensus status between primary (Claude) and shadow (Gemini) extraction.
 */
export enum ConsensusStatus {
  /** Both models agree on values */
  MATCH = 'MATCH',
  /** Models disagree - requires human review */
  CONFLICT = 'CONFLICT',
  /** Models agree but confidence < 95% */
  LOW_CONFIDENCE = 'LOW_CONFIDENCE',
  /** No shadow extraction performed (e.g., structured ECHA import) */
  SHADOW_MISSING = 'SHADOW_MISSING',
}
