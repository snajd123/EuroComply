import { EntityManager } from '@mikro-orm/postgresql';
import { MikroOrm } from '@eurocomply/db';
import { NotFoundError } from '../lib/errors.js';

const { ReadinessProfile } = MikroOrm;

function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}${random}`;
}

export interface CreateReadinessProfileInput {
  name: string;
  category: string;
  description?: string;
  requiredFields: Record<string, string[]>;
  requiredAttestations?: string[];
}

export interface UpdateReadinessProfileInput {
  name?: string;
  description?: string;
  requiredFields?: Record<string, string[]>;
  requiredAttestations?: string[];
}

export class ReadinessProfileService {
  constructor(private em: EntityManager) {}

  /**
   * Create a new readiness profile.
   */
  async create(input: CreateReadinessProfileInput): Promise<InstanceType<typeof ReadinessProfile>> {
    const profile = this.em.create(ReadinessProfile, {
      id: generateId('rp'),
      name: input.name,
      category: input.category,
      description: input.description,
      requiredFields: input.requiredFields,
      requiredAttestations: input.requiredAttestations,
    });
    this.em.persist(profile);
    await this.em.flush();
    return profile;
  }

  /**
   * Get a readiness profile by ID.
   */
  async getById(id: string): Promise<InstanceType<typeof ReadinessProfile> | null> {
    return this.em.findOne(ReadinessProfile, { id });
  }

  /**
   * Get a readiness profile by category.
   */
  async getByCategory(category: string): Promise<InstanceType<typeof ReadinessProfile> | null> {
    return this.em.findOne(ReadinessProfile, { category });
  }

  /**
   * List all readiness profiles.
   */
  async list(): Promise<InstanceType<typeof ReadinessProfile>[]> {
    return this.em.find(ReadinessProfile, {}, { orderBy: { name: 'asc' } });
  }

  /**
   * Update a readiness profile.
   */
  async update(
    id: string,
    input: UpdateReadinessProfileInput
  ): Promise<InstanceType<typeof ReadinessProfile>> {
    const existing = await this.em.findOne(ReadinessProfile, { id });

    if (!existing) {
      throw new NotFoundError('ReadinessProfile', id);
    }

    if (input.name !== undefined) {
      existing.name = input.name;
    }
    if (input.description !== undefined) {
      existing.description = input.description;
    }
    if (input.requiredFields !== undefined) {
      existing.requiredFields = input.requiredFields;
    }
    if (input.requiredAttestations !== undefined) {
      existing.requiredAttestations = input.requiredAttestations;
    }

    await this.em.flush();
    return existing;
  }

  /**
   * Delete a readiness profile.
   */
  async delete(id: string): Promise<void> {
    const existing = await this.em.findOne(ReadinessProfile, { id });

    if (!existing) {
      throw new NotFoundError('ReadinessProfile', id);
    }

    this.em.remove(existing);
    await this.em.flush();
  }

  /**
   * Check if product data meets readiness requirements.
   * Returns a completion score (0-100) and list of missing fields.
   */
  async checkReadiness(
    profileId: string,
    productData: {
      design?: Record<string, unknown>;
      marketing?: Record<string, unknown>;
      attestations?: string[];
    }
  ): Promise<{
    score: number;
    missingFields: { workspace: string; field: string }[];
    missingAttestations: string[];
  }> {
    const profile = await this.getById(profileId);
    if (!profile) {
      throw new NotFoundError('ReadinessProfile', profileId);
    }

    const missingFields: { workspace: string; field: string }[] = [];
    const missingAttestations: string[] = [];

    const requiredFields = profile.requiredFields as Record<string, string[]>;
    let totalRequired = 0;
    let totalPresent = 0;

    // Check required fields per workspace
    for (const [workspace, fields] of Object.entries(requiredFields)) {
      const workspaceData = productData[workspace as keyof typeof productData] as Record<string, unknown> | undefined;

      for (const field of fields) {
        totalRequired++;
        if (workspaceData && workspaceData[field] !== undefined && workspaceData[field] !== null) {
          totalPresent++;
        } else {
          missingFields.push({ workspace, field });
        }
      }
    }

    // Check required attestations
    const requiredAttestations = (profile.requiredAttestations as string[]) || [];
    const providedAttestations = productData.attestations || [];

    for (const attestation of requiredAttestations) {
      totalRequired++;
      if (providedAttestations.includes(attestation)) {
        totalPresent++;
      } else {
        missingAttestations.push(attestation);
      }
    }

    const score = totalRequired > 0 ? Math.round((totalPresent / totalRequired) * 100) : 100;

    return { score, missingFields, missingAttestations };
  }
}
