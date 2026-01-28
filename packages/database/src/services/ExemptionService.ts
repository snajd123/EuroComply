import { EntityManager } from '@mikro-orm/postgresql';
import { TenantCategory } from '../entities/TenantCategory.js';
import { TenantRequirementExemption } from '../entities/TenantRequirementExemption.js';

export interface CreateExemptionInput {
  tenantCategoryId: string;
  requirementId: string;
  reason: string;
  legalReference?: string;
  exemptedBy: string;
}

export class ExemptionGuardrailError extends Error {
  constructor(
    message: string,
    public readonly requirementCode: string,
    public readonly requirementName: string
  ) {
    super(message);
    this.name = 'ExemptionGuardrailError';
  }
}

export class ExemptionService {
  constructor(private readonly em: EntityManager) {}

  async createExemption(input: CreateExemptionInput): Promise<TenantRequirementExemption> {
    const { tenantCategoryId, requirementId, reason, legalReference, exemptedBy } = input;

    // Load requirement from public schema to check guardrail
    // Use raw query since we need to access public schema from tenant context
    const [requirementRow] = await this.em.getConnection().execute<Array<{
      id: string;
      code: string;
      name: string;
      allow_tenant_exemption: boolean;
    }>>(`SELECT id, code, name, allow_tenant_exemption FROM public.requirement WHERE id = '${this.escapeId(requirementId)}'`);

    if (!requirementRow) {
      throw new Error(`Requirement not found: ${requirementId}`);
    }

    // GUARDRAIL: Check if exemption is allowed
    if (!requirementRow.allow_tenant_exemption) {
      throw new ExemptionGuardrailError(
        `Requirement "${requirementRow.code}" cannot be exempted. This is a mandatory compliance requirement. Contact platform administrator.`,
        requirementRow.code,
        requirementRow.name
      );
    }

    // Load tenant category
    const tenantCategory = await this.em.findOneOrFail(TenantCategory, { id: tenantCategoryId });

    // Create exemption
    const exemption = new TenantRequirementExemption();
    exemption.tenantCategory = tenantCategory;
    exemption.requirementId = requirementId;
    exemption.reason = reason;
    exemption.legalReference = legalReference;
    exemption.exemptedBy = exemptedBy;

    this.em.persist(exemption);
    await this.em.flush();
    return exemption;
  }

  async revokeExemption(
    exemptionId: string,
    revokedBy: string,
    revocationReason: string
  ): Promise<TenantRequirementExemption> {
    const exemption = await this.em.findOneOrFail(TenantRequirementExemption, { id: exemptionId });

    exemption.revokedAt = new Date();
    exemption.revokedBy = revokedBy;
    exemption.revocationReason = revocationReason;

    await this.em.flush();
    return exemption;
  }

  private escapeId(id: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new Error(`Invalid ID format: ${id}`);
    }
    return id;
  }
}
