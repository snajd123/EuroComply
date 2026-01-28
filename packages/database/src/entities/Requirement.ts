import {
  Entity,
  Property,
  Enum,
  ManyToOne,
  Index,
  Unique,
} from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity.js';
import { Regulation } from './Regulation.js';
import { RequirementType } from './enums/RequirementType.js';
import { RequirementSeverity } from './enums/RequirementSeverity.js';
import type { ComparisonOperator } from './enums/ComparisonOperator.js';

/**
 * Handler configuration for requirement evaluation.
 * Different requirement types use different subsets of these properties.
 */
export interface RequirementHandlerConfig {
  /** Comparison operator for threshold checks (ATTRIBUTE_CHECK, SUBSTANCE_SCREEN, CALCULATED_CHECK) */
  operator?: ComparisonOperator;
  /** Threshold value for numeric comparisons */
  threshold?: number;
  /** Unit of measurement for threshold */
  unit?: string;
  /** Regex pattern for string matching */
  pattern?: string;
  /** Default threshold percentage for substance screens */
  defaultThresholdPct?: number;
  /** Question text for DECLARATION requirements */
  question?: string;
  /** Accepted answers for DECLARATION requirements */
  acceptedAnswers?: string[];
  /** Whether a document is required */
  requiresDocument?: boolean;
  /** Accepted document types */
  acceptedDocumentTypes?: string[];
}

/**
 * Represents a compliance requirement within a regulation.
 *
 * Requirements define specific compliance checks that must be performed.
 * Four types are supported:
 * - ATTRIBUTE_CHECK: Validates a product attribute value
 * - SUBSTANCE_SCREEN: Screens against a substance list
 * - CALCULATED_CHECK: Evaluates a calculated formula
 * - DECLARATION: Requires user attestation/declaration
 *
 * Lives in the public schema as shared system data.
 * Unique code constraint is scoped per regulation.
 */
@Entity({ tableName: 'requirement', schema: 'public' })
@Unique({ properties: ['regulation', 'code'] })
export class Requirement extends BaseEntity {
  /**
   * Parent regulation this requirement belongs to
   */
  @ManyToOne(() => Regulation, { name: 'regulation_id' })
  @Index()
  regulation!: Regulation;

  /**
   * Unique code identifier within the regulation (e.g., 'VOLTAGE_CHECK', 'LEAD_SCREEN')
   */
  @Property({ type: 'text' })
  code!: string;

  /**
   * Human-readable name (e.g., 'Voltage Compliance Check')
   */
  @Property({ type: 'text' })
  name!: string;

  /**
   * Detailed description of the requirement
   */
  @Property({ type: 'text', nullable: true })
  description?: string;

  /**
   * Type of requirement: ATTRIBUTE_CHECK, SUBSTANCE_SCREEN, CALCULATED_CHECK, or DECLARATION
   */
  @Enum({ items: () => RequirementType })
  type!: RequirementType;

  /**
   * Severity level: BLOCKER, WARNING, or INFO
   * Defaults to WARNING
   */
  @Enum({ items: () => RequirementSeverity, default: RequirementSeverity.WARNING })
  severity: RequirementSeverity = RequirementSeverity.WARNING;

  /**
   * Key to look up the attribute template (for ATTRIBUTE_CHECK type)
   */
  @Property({ type: 'text', nullable: true, name: 'attribute_template_key' })
  attributeTemplateKey?: string | null;

  /**
   * ID of the substance list to screen against (for SUBSTANCE_SCREEN type)
   */
  @Property({ type: 'text', nullable: true, name: 'substance_list_id' })
  substanceListId?: string | null;

  /**
   * Formula expression to calculate (for CALCULATED_CHECK type)
   */
  @Property({ type: 'text', nullable: true, name: 'calculation_formula' })
  calculationFormula?: string | null;

  /**
   * Configuration for the requirement handler/evaluator
   * Contains operator, threshold, unit, question, acceptedAnswers, etc.
   */
  @Property({ type: 'jsonb', nullable: true, name: 'handler_config' })
  handlerConfig?: RequirementHandlerConfig | null;

  /**
   * Reference to the legal text/article (e.g., 'Article 33, REACH Regulation')
   */
  @Property({ type: 'text', nullable: true, name: 'legal_reference' })
  legalReference?: string | null;

  /**
   * Sort order for display purposes
   */
  @Property({ type: 'int', default: 0, name: 'sort_order' })
  sortOrder: number = 0;

  /**
   * Whether tenants can create exemptions for this requirement.
   * Some critical requirements cannot be exempted.
   * Defaults to true.
   */
  @Property({ type: 'boolean', default: true, name: 'allow_tenant_exemption' })
  allowTenantExemption: boolean = true;
}
