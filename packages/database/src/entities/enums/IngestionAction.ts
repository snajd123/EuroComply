/**
 * Actions tracked in the ingestion audit log.
 */
export enum IngestionAction {
  /** Initial extraction from source */
  EXTRACTED = 'EXTRACTED',
  /** Shadow validation completed */
  VALIDATED = 'VALIDATED',
  /** Conflict detected between models */
  CONFLICT_DETECTED = 'CONFLICT_DETECTED',
  /** Requirement approved by admin */
  APPROVED = 'APPROVED',
  /** Requirement rejected by admin */
  REJECTED = 'REJECTED',
  /** Requirement edited by admin */
  EDITED = 'EDITED',
  /** Published to production tables */
  PUBLISHED = 'PUBLISHED',
}
