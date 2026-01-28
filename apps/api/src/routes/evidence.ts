/**
 * Evidence API Router
 *
 * Handles recording and retrieving compliance evidence for product versions.
 * Evidence includes a requirement snapshot for audit integrity.
 *
 * NOTE: This is a stub file created for TDD. Implementation pending in Task 38.
 */
import { Hono } from 'hono';
import type { MikroORM } from '@eurocomply/database';
import type { Env } from '../app.js';

export interface EvidenceRouterDependencies {
  orm: MikroORM;
}

/**
 * Creates the evidence router.
 *
 * TODO: Implement in Task 38
 * - POST /evidence - Record evidence with requirement snapshot
 * - GET /evidence/:productVersionId - Get all evidence for a product version
 */
export function createEvidenceRouter(_deps: EvidenceRouterDependencies): Hono<Env> {
  const router = new Hono<Env>();

  // Stub: routes will be implemented in Task 38
  // Tests should fail with 404 until implementation is complete

  return router;
}
