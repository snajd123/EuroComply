/**
 * Status of a staging regulation through the review workflow.
 */
export enum StagingStatus {
  /** Awaiting review */
  PENDING = 'PENDING',
  /** Approved and ready to publish */
  APPROVED = 'APPROVED',
  /** Rejected by reviewer */
  REJECTED = 'REJECTED',
  /** Some requirements approved, some pending */
  PARTIALLY_APPROVED = 'PARTIALLY_APPROVED',
  /** Published to production tables */
  PUBLISHED = 'PUBLISHED',
}
