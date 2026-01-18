import { PrismaClient, ReadinessProfile } from '@eurocomply/db';
import { NotFoundError } from '../lib/errors.js';

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
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a new readiness profile.
   */
  async create(input: CreateReadinessProfileInput): Promise<ReadinessProfile> {
    return this.prisma.readinessProfile.create({
      data: input,
    });
  }

  /**
   * Get a readiness profile by ID.
   */
  async getById(id: string): Promise<ReadinessProfile | null> {
    return this.prisma.readinessProfile.findUnique({
      where: { id },
    });
  }

  /**
   * Get a readiness profile by category.
   */
  async getByCategory(category: string): Promise<ReadinessProfile | null> {
    return this.prisma.readinessProfile.findUnique({
      where: { category },
    });
  }

  /**
   * List all readiness profiles.
   */
  async list(): Promise<ReadinessProfile[]> {
    return this.prisma.readinessProfile.findMany({
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Update a readiness profile.
   */
  async update(
    id: string,
    input: UpdateReadinessProfileInput
  ): Promise<ReadinessProfile> {
    const existing = await this.prisma.readinessProfile.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('ReadinessProfile', id);
    }

    return this.prisma.readinessProfile.update({
      where: { id },
      data: input,
    });
  }

  /**
   * Delete a readiness profile.
   */
  async delete(id: string): Promise<void> {
    const existing = await this.prisma.readinessProfile.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('ReadinessProfile', id);
    }

    await this.prisma.readinessProfile.delete({
      where: { id },
    });
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
