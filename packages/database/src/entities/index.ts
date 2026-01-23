export { BaseEntity } from './BaseEntity.js';
export { UnitSystem } from './enums/index.js';
export {
  Organization,
  EnforcementMode,
  SubscriptionTier,
  SubscriptionStatus,
  ProvisioningStatus
} from './Organization.js';
export { ApiKey } from './ApiKey.js';
export { Category, CategoryType } from './Category.js';
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

// Import classes for entity arrays
import { Organization } from './Organization.js';
import { ApiKey } from './ApiKey.js';
import { OutboxEvent } from './OutboxEvent.js';
import { WebhookEvent } from './WebhookEvent.js';
import { Category } from './Category.js';
import { UnitDefinition } from './UnitDefinition.js';
import { AttributeTemplate } from './AttributeTemplate.js';
import { Product } from './Product.js';
import { ProductVersion } from './ProductVersion.js';
import { AuditLog } from './AuditLog.js';

/**
 * Entities that belong in the PUBLIC schema.
 * These are shared across all tenants.
 */
export const publicEntities = [
  Organization,
  ApiKey,
  OutboxEvent,
  WebhookEvent,
  UnitDefinition,
];

/**
 * Entities that belong in TENANT schemas.
 * Each tenant gets their own copy of these tables.
 */
export const tenantEntities = [
  Category,
  AttributeTemplate,
  Product,
  ProductVersion,
  AuditLog,
];
