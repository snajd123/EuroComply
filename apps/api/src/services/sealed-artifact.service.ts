import { EntityManager } from '@mikro-orm/postgresql';
import { MikroOrm, Organization } from '@eurocomply/db';
import { type WaltIdClient } from '@eurocomply/walt-id';
import {
  type SealedArtifact,
  createUserForensicContext,
  createOrgForensicContext,
} from '@eurocomply/shared';
import { TimestampService } from './timestamp.service.js';
import { StatusList2021Service } from './status-list.service.js';
import { NotFoundError } from '../lib/errors.js';

const { UserDidHistory, OrgDidHistory } = MikroOrm;

/**
 * Input for creating a sealed artifact.
 */
export interface CreateSealedArtifactInput {
  organizationId: string;
  userId: string;
  payload: Record<string, unknown>;
  userContext: {
    name: string;
    email: string;
    role: string;
    workspaceAuthority: string;
  };
  /** Whether to require TSA timestamp (default: true) */
  requireTimestamp?: boolean;
}

/**
 * SealedArtifactService implements the Corporate Envelope pattern.
 *
 * A Sealed Artifact is an immutable record with:
 * - User signature (with forensic context)
 * - Organization signature (corporate endorsement)
 * - Status List 2021 entry (for revocation)
 * - RFC3161 timestamp (optional, for legal proof of signing time)
 *
 * Architecture notes:
 * - The EntityManager passed to the constructor is already scoped to the tenant schema
 * - UserDidHistory and OrgDidHistory live in the tenant schema
 * - Organization entity (public schema) is accessed for org details
 *   because Organization declares `schema: 'public'` in its entity definition
 *
 * Flow:
 * 1. User signs payload → userProof
 * 2. Organization wraps → corporateProof
 * 3. Allocate status list index → credentialStatus
 * 4. Request TSA timestamp → timestampProof
 */
export class SealedArtifactService {
  constructor(
    private readonly waltIdClient: WaltIdClient,
    private readonly timestampService: TimestampService,
    private readonly statusListService: StatusList2021Service,
    private readonly em: EntityManager
  ) {}

  /**
   * Create a complete Sealed Artifact with Corporate Envelope.
   *
   * @param input - The artifact creation input
   * @returns The complete sealed artifact
   * @throws NotFoundError if user DID, org DID, or organization not found
   * @throws Error if TSA fails and timestamp is required
   */
  async createSealedArtifact(
    input: CreateSealedArtifactInput
  ): Promise<SealedArtifact> {
    const {
      organizationId,
      userId,
      payload,
      userContext,
      requireTimestamp = true,
    } = input;

    // Get user's current DID (active: validTo is null and not revoked)
    const userDid = await this.em.findOne(
      UserDidHistory,
      { userId, validTo: null, revokedAt: null },
      { orderBy: { validFrom: 'DESC' } }
    );

    if (!userDid) {
      throw new NotFoundError('User DID', userId);
    }

    // Get organization's current DID (active: validTo is null and not revoked)
    const orgDid = await this.em.findOne(
      OrgDidHistory,
      { organizationId, validTo: null, revokedAt: null },
      { orderBy: { validFrom: 'DESC' } }
    );

    if (!orgDid) {
      throw new NotFoundError('Organization DID', organizationId);
    }

    // Get organization details for forensic context (public schema)
    // Organization entity declares schema: 'public', so MikroORM routes there
    const org = await this.em.findOne(Organization, { id: organizationId });

    if (!org) {
      throw new NotFoundError('Organization', organizationId);
    }

    // Add sealedAt to payload
    const sealedPayload = {
      ...payload,
      sealedAt: new Date().toISOString(),
    };

    // 1. User signs payload
    const userForensicContext = createUserForensicContext(
      { name: userContext.name, email: userContext.email },
      userContext.role,
      userContext.workspaceAuthority
    );

    const userSignResult = await this.waltIdClient.sign({
      keyId: userDid.waltIdKeyId,
      payload: sealedPayload,
      proofType: 'Ed25519Signature2020',
      proofPurpose: 'assertionMethod',
    });

    // 2. Organization wraps (signs the user proof)
    const orgForensicContext = createOrgForensicContext({
      id: org.id,
      name: org.name,
    });

    const orgSignResult = await this.waltIdClient.sign({
      keyId: orgDid.waltIdKeyId,
      payload: {
        userProof: {
          verificationMethod: userSignResult.verificationMethod,
          signatureValue: userSignResult.jws,
        },
      },
      proofType: 'Ed25519Signature2020',
      proofPurpose: 'authentication',
    });

    // 3. Allocate status list index
    const statusListIndex = await this.statusListService.allocateIndex(
      organizationId
    );
    const credentialStatus = await this.statusListService.getCredentialStatus(
      organizationId,
      statusListIndex
    );

    // 4. Get timestamp (optional)
    let timestampProof: SealedArtifact['timestampProof'] | undefined;

    try {
      const payloadHash = TimestampService.hashPayload(sealedPayload);
      timestampProof = await this.timestampService.createTimestamp(payloadHash);
    } catch (error) {
      if (requireTimestamp) {
        throw error;
      }
      // If timestamp is optional, continue without it
      console.warn(
        'TSA timestamp failed, continuing without timestamp:',
        error
      );
    }

    // Build sealed artifact
    const sealedArtifact: SealedArtifact = {
      payload: sealedPayload,

      userProof: {
        type: 'Ed25519Signature2020',
        verificationMethod: userSignResult.verificationMethod,
        signatureValue: userSignResult.jws,
        created: userSignResult.created,
        forensicContext: userForensicContext,
      },

      corporateProof: {
        type: 'Ed25519Signature2020',
        verificationMethod: orgSignResult.verificationMethod,
        signatureValue: orgSignResult.jws,
        created: orgSignResult.created,
        forensicContext: orgForensicContext,
      },

      credentialStatus,

      ...(timestampProof && { timestampProof }),
    };

    return sealedArtifact;
  }
}
