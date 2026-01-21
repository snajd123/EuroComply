import { EntityManager, IsolationLevel } from '@mikro-orm/postgresql';
import { MikroOrm, EventStatus, Organization } from '@eurocomply/db';
import { createHash, randomUUID } from 'crypto';
import {
  validateEventPayloadOrThrow,
  type UserForensicContext,
  type OrgForensicContext,
} from '@eurocomply/shared';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { SigningService } from './signing.service.js';

const { OperationsEvent, User } = MikroOrm;

export interface RecordEventInput {
  eventType: string;
  payload: unknown;
}

/**
 * Optional signing context for verifying an event with Corporate Envelope signing.
 * When provided, creates a dual-signed SealedArtifact for forensic traceability.
 */
export interface VerifyEventSigningContext {
  userDid: string;
  userForensicContext: UserForensicContext;
  orgDid: string;
  orgForensicContext: OrgForensicContext;
}

/**
 * Generates a unique ID with the given prefix.
 */
function generateId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

/**
 * OperationsEventService manages the forensic ledger with hash chain integrity.
 *
 * Architecture notes:
 * - The EntityManager passed to the constructor is already scoped to the tenant schema
 * - Organization entity (public schema) is accessed for hash chain state
 *   because Organization declares `schema: 'public'` in its entity definition
 * - OperationsEvent records live in the tenant schema
 * - No organizationId filtering needed for tenant data - schema isolation handles it
 */
export class OperationsEventService {
  private signingService: SigningService;

  constructor(private em: EntityManager, signingService?: SigningService) {
    this.signingService = signingService ?? new SigningService();
  }

  /**
   * Record a new operations event with hash chain integrity.
   * Creates event in PENDING_VERIFICATION status.
   *
   * @param organizationId - The organization ID (needed for hash chain state in public schema)
   * @param createdBy - User ID who created the event
   * @param input - Event type and payload
   */
  async recordEvent(
    organizationId: string,
    createdBy: string,
    input: RecordEventInput
  ): Promise<MikroOrm.OperationsEvent> {
    // Validate payload against schema (throws on invalid)
    validateEventPayloadOrThrow({
      eventType: input.eventType,
      payload: input.payload,
    });

    return this.em.transactional(
      async (em) => {
        // Query organization for hash chain state (public schema)
        // Organization entity declares schema: 'public', so MikroORM routes there
        const org = await em.findOne(Organization, { id: organizationId });

        if (!org) {
          throw new NotFoundError('Organization', organizationId);
        }

        const nextSequence = (org.eventSequence || 0) + 1;
        const previousHash = org.lastEventHash || 'GENESIS';
        // Generate timestamp once for both hash and createdAt (ensures deterministic hash verification)
        const createdAt = new Date();

        // Generate deterministic hash (timestamp included and stored for verification)
        const hashPayload = JSON.stringify({
          payload: input.payload,
          eventType: input.eventType,
          previousHash,
          sequence: nextSequence,
          orgId: organizationId,
          timestamp: createdAt.toISOString(),
        });

        const currentHash = createHash('sha256')
          .update(hashPayload)
          .digest('hex');

        // Create event in tenant schema
        const event = em.create(OperationsEvent, {
          id: generateId('evt'),
          eventType: input.eventType,
          payload: input.payload as Record<string, unknown>,
          eventHash: currentHash,
          previousEventHash: previousHash,
          sequenceNumber: nextSequence,
          status: EventStatus.PENDING_VERIFICATION,
          createdBy: em.getReference(User, createdBy),
          createdAt,
        });

        // Update organization head pointer (public schema)
        org.lastEventHash = currentHash;
        org.eventSequence = nextSequence;

        await em.flush();
        return event;
      },
      { isolationLevel: IsolationLevel.SERIALIZABLE }
    );
  }

  /**
   * Verify (seal) an event. Transitions to VERIFIED status.
   * Only callable by EDITOR authority.
   *
   * When signingContext is provided, creates a Corporate Envelope (SealedArtifact)
   * with dual signatures (user + organization) for forensic traceability.
   *
   * @param eventId - The event to verify
   * @param verifiedBy - The user verifying the event
   * @param signingContext - Optional signing context for Corporate Envelope creation
   */
  async verifyEvent(
    eventId: string,
    verifiedBy: string,
    signingContext?: VerifyEventSigningContext
  ): Promise<MikroOrm.OperationsEvent> {
    // Wrap in transaction to ensure atomicity (signing + DB update)
    return this.em.transactional(async (em) => {
      const event = await em.findOne(OperationsEvent, { id: eventId });

      if (!event) {
        throw new NotFoundError('OperationsEvent', eventId);
      }

      if (event.status !== EventStatus.PENDING_VERIFICATION) {
        throw new ValidationError(
          `Cannot verify event: status is ${event.status}, expected PENDING_VERIFICATION`
        );
      }

      const verifiedAt = new Date();

      // Update basic verification fields
      event.status = EventStatus.VERIFIED;
      event.verifiedBy = em.getReference(User, verifiedBy);
      event.verifiedAt = verifiedAt;

      // If no signing context, just update status without signatures
      if (!signingContext) {
        await em.flush();
        return event;
      }

      // Note: DID validation is handled by SigningService.createCorporateEnvelope()
      // which performs proper Ed25519 format validation

      // Build payload from event data for signing
      const payload: Record<string, unknown> = {
        id: event.id,
        eventType: event.eventType,
        eventHash: event.eventHash,
        sequenceNumber: event.sequenceNumber,
        status: 'VERIFIED',
        verifiedAt: verifiedAt.toISOString(),
        verifiedBy,
      };

      // Create corporate envelope with dual signatures
      // SigningService validates DIDs and throws ValidationError if invalid
      const sealedArtifact = await this.signingService.createCorporateEnvelope(
        payload,
        {
          did: signingContext.userDid,
          forensicContext: signingContext.userForensicContext,
        },
        {
          did: signingContext.orgDid,
          forensicContext: signingContext.orgForensicContext,
        }
      );

      // Update with all signature data
      event.userSignatureDid = signingContext.userDid;
      event.userSignatureJws = JSON.stringify(sealedArtifact.userProof);
      event.orgSignatureDid = signingContext.orgDid;
      event.orgSignatureJws = JSON.stringify(sealedArtifact);
      event.forensicContext = {
        user: signingContext.userForensicContext,
        org: signingContext.orgForensicContext,
      };

      await em.flush();
      return event;
    });
  }

  /**
   * Get an event by ID.
   * No organizationId needed - schema isolation handles tenant separation.
   */
  async getEvent(eventId: string): Promise<MikroOrm.OperationsEvent | null> {
    return this.em.findOne(OperationsEvent, { id: eventId });
  }

  /**
   * List events for the tenant.
   * No organizationId needed - schema isolation handles tenant separation.
   */
  async listEvents(options?: {
    eventType?: string;
    status?: EventStatus;
    limit?: number;
    offset?: number;
  }): Promise<MikroOrm.OperationsEvent[]> {
    return this.em.find(
      OperationsEvent,
      {
        ...(options?.eventType && { eventType: options.eventType }),
        ...(options?.status && { status: options.status }),
      },
      {
        orderBy: { sequenceNumber: 'DESC' },
        limit: options?.limit ?? 50,
        offset: options?.offset ?? 0,
      }
    );
  }

  /**
   * Verify hash chain integrity for the tenant.
   * Returns true if chain is intact, false if tampered.
   * No organizationId needed - schema isolation handles tenant separation.
   */
  async verifyChainIntegrity(): Promise<{
    valid: boolean;
    checkedCount: number;
    brokenAt?: number;
  }> {
    const events = await this.em.find(
      OperationsEvent,
      {},
      {
        orderBy: { sequenceNumber: 'ASC' },
        fields: ['sequenceNumber', 'eventHash', 'previousEventHash'],
      }
    );

    let previousHash = 'GENESIS';

    for (const event of events) {
      if (event.previousEventHash !== previousHash) {
        // Security: Only expose break location in development
        return {
          valid: false,
          checkedCount: event.sequenceNumber,
          ...(process.env['NODE_ENV'] === 'development' && {
            brokenAt: event.sequenceNumber,
          }),
        };
      }
      previousHash = event.eventHash;
    }

    return { valid: true, checkedCount: events.length };
  }
}
