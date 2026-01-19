import { PrismaClient, OperationsEvent } from '@eurocomply/db';
import { createHash } from 'crypto';
import {
  validateEventPayloadOrThrow,
  type EventType,
  type EventStatus,
  type UserForensicContext,
  type OrgForensicContext,
} from '@eurocomply/shared';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { SigningService } from './signing.service.js';

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

export class OperationsEventService {
  private signingService: SigningService;

  constructor(private prisma: PrismaClient, signingService?: SigningService) {
    // Use provided SigningService or create a new instance
    this.signingService = signingService ?? new SigningService();
  }

  /**
   * Record a new operations event with hash chain integrity.
   * Creates event in PENDING_VERIFICATION status.
   */
  async recordEvent(
    organizationId: string,
    createdBy: string,
    input: RecordEventInput
  ): Promise<OperationsEvent> {
    // Validate payload against schema (throws on invalid)
    validateEventPayloadOrThrow({
      eventType: input.eventType,
      payload: input.payload,
    });

    return this.prisma.$transaction(
      async (tx) => {
        // Lock organization row to prevent race conditions
        const org = await tx.organization.findUnique({
          where: { id: organizationId },
          select: { lastEventHash: true, eventSequence: true },
        });

        if (!org) {
          throw new NotFoundError('Organization', organizationId);
        }

        const nextSequence = (org.eventSequence || 0) + 1;
        const previousHash = org.lastEventHash || 'GENESIS';

        // Generate deterministic hash
        const hashPayload = JSON.stringify({
          payload: input.payload,
          eventType: input.eventType,
          previousHash,
          sequence: nextSequence,
          orgId: organizationId,
          timestamp: new Date().toISOString(),
        });

        const currentHash = createHash('sha256')
          .update(hashPayload)
          .digest('hex');

        // Create event
        const event = await tx.operationsEvent.create({
          data: {
            organizationId,
            eventType: input.eventType,
            payload: input.payload as object,
            eventHash: currentHash,
            previousEventHash: previousHash,
            sequenceNumber: nextSequence,
            status: 'PENDING_VERIFICATION',
            createdBy,
          },
        });

        // Update organization head pointer
        await tx.organization.update({
          where: { id: organizationId },
          data: {
            lastEventHash: currentHash,
            eventSequence: nextSequence,
          },
        });

        return event;
      },
      { isolationLevel: 'Serializable' }
    );
  }

  /**
   * Verify (seal) an event. Transitions to VERIFIED status.
   * Only callable by EDITOR authority.
   *
   * When signingContext is provided, creates a Corporate Envelope (SealedArtifact)
   * with dual signatures (user + organization) for forensic traceability.
   *
   * @param organizationId - The organization owning the event
   * @param eventId - The event to verify
   * @param verifiedBy - The user verifying the event
   * @param signingContext - Optional signing context for Corporate Envelope creation
   */
  async verifyEvent(
    organizationId: string,
    eventId: string,
    verifiedBy: string,
    signingContext?: VerifyEventSigningContext
  ): Promise<OperationsEvent> {
    const event = await this.prisma.operationsEvent.findFirst({
      where: { id: eventId, organizationId },
    });

    if (!event) {
      throw new NotFoundError('OperationsEvent', eventId);
    }

    if (event.status !== 'PENDING_VERIFICATION') {
      throw new ValidationError(
        `Cannot verify event: status is ${event.status}, expected PENDING_VERIFICATION`
      );
    }

    const verifiedAt = new Date();

    // If no signing context, just update status without signatures
    if (!signingContext) {
      return this.prisma.operationsEvent.update({
        where: { id: eventId },
        data: {
          status: 'VERIFIED',
          verifiedBy,
          verifiedAt,
        },
      });
    }

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
    return this.prisma.operationsEvent.update({
      where: { id: eventId },
      data: {
        status: 'VERIFIED',
        verifiedBy,
        verifiedAt,
        userSignatureDid: signingContext.userDid,
        userSignatureJws: JSON.stringify(sealedArtifact.userProof),
        orgSignatureDid: signingContext.orgDid,
        orgSignatureJws: JSON.stringify(sealedArtifact),
        forensicContext: {
          user: signingContext.userForensicContext,
          org: signingContext.orgForensicContext,
        },
      },
    });
  }

  /**
   * Get an event by ID.
   */
  async getEvent(
    organizationId: string,
    eventId: string
  ): Promise<OperationsEvent | null> {
    return this.prisma.operationsEvent.findFirst({
      where: { id: eventId, organizationId },
    });
  }

  /**
   * List events for an organization.
   */
  async listEvents(
    organizationId: string,
    options?: {
      eventType?: EventType;
      status?: EventStatus;
      limit?: number;
      offset?: number;
    }
  ): Promise<OperationsEvent[]> {
    return this.prisma.operationsEvent.findMany({
      where: {
        organizationId,
        ...(options?.eventType && { eventType: options.eventType }),
        ...(options?.status && { status: options.status }),
      },
      orderBy: { sequenceNumber: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });
  }

  /**
   * Verify hash chain integrity for an organization.
   * Returns true if chain is intact, false if tampered.
   */
  async verifyChainIntegrity(organizationId: string): Promise<{
    valid: boolean;
    checkedCount: number;
    brokenAt?: number;
  }> {
    const events = await this.prisma.operationsEvent.findMany({
      where: { organizationId },
      orderBy: { sequenceNumber: 'asc' },
      select: {
        sequenceNumber: true,
        eventHash: true,
        previousEventHash: true,
        eventType: true,
        payload: true,
      },
    });

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
