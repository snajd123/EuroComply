export { BaseEntity } from './BaseEntity.js';
export { UnitSystem, TargetType, AliasType } from './enums/index.js';
export { Substance } from './Substance.js';
export {
  Organization,
  EnforcementMode,
  SubscriptionTier,
  SubscriptionStatus,
  ProvisioningStatus
} from './Organization.js';
export { ApiKey } from './ApiKey.js';
export { Category, CategoryType } from './Category.js';
export { CategoryAdoption, AdoptionMode } from './CategoryAdoption.js';
export { UnitDefinition } from './UnitDefinition.js';
export {
  AttributeTemplate,
  AttributeType,
  RollupMethod,
  InheritanceRule,
} from './AttributeTemplate.js';
export { Product, ProductStatus } from './Product.js';
export { ProductVersion, VersionStatus } from './ProductVersion.js';
export { OutboxEvent, OutboxStatus } from './OutboxEvent.js';
export { AuditLog, AuditAction } from './AuditLog.js';
export { WebhookEvent, WebhookStatus } from './WebhookEvent.js';
export { WorkspaceAuthority } from './WorkspaceAuthority.js';
export { User } from './User.js';
export { OrganizationUser } from './OrganizationUser.js';

// Import classes for entity arrays
import { Organization } from './Organization.js';
import { ApiKey } from './ApiKey.js';
import { OutboxEvent } from './OutboxEvent.js';
import { WebhookEvent } from './WebhookEvent.js';
import { Category } from './Category.js';
import { CategoryAdoption } from './CategoryAdoption.js';
import { UnitDefinition } from './UnitDefinition.js';
import { AttributeTemplate } from './AttributeTemplate.js';
import { Product } from './Product.js';
import { ProductVersion } from './ProductVersion.js';
import { AuditLog } from './AuditLog.js';
import { User } from './User.js';
import { OrganizationUser } from './OrganizationUser.js';
import { Substance } from './Substance.js';

/**
 * Entities that belong ONLY in the PUBLIC schema.
 * These are shared across all tenants.
 */
export const publicOnlyEntities = [
  Organization,
  ApiKey,
  WebhookEvent,
  UnitDefinition,
  Substance,
];

/**
 * Entities that belong ONLY in TENANT schemas.
 * Each tenant gets their own copy of these tables.
 */
export const tenantOnlyEntities = [
  Category,
  CategoryAdoption,
  AttributeTemplate,
  Product,
  ProductVersion,
  AuditLog,
  User,
  OrganizationUser,
];

/**
 * Entities that exist in BOTH public AND tenant schemas (dual-schema pattern).
 * - Public: system events (organization.provisioned, organization.deleted)
 * - Tenant: domain events (user.joined, product.created)
 */
export const sharedEntities = [
  OutboxEvent,
];

/**
 * Entities for PUBLIC schema generation (migrations, test setup).
 */
export const publicEntities = [...publicOnlyEntities, ...sharedEntities];

/**
 * Entities for TENANT schema generation (TenantProvisioner).
 */
export const tenantEntities = [...tenantOnlyEntities, ...sharedEntities];
