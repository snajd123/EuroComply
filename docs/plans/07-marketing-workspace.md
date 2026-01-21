# Marketing Workspace (PIM)

**Status:** Active
**Last Updated:** 2026-01-21

---

## 1. Overview

The Marketing Workspace is where products become **sellable** - it transforms technical specifications into consumer-facing content ready for omnichannel distribution. This implements PIM (Product Information Management) functionality using the same agnostic taxonomy as Design.

### Core Principles

| Principle | Implementation |
|-----------|----------------|
| **Design-Gated** | Only RELEASED design versions can be enriched |
| **Taxonomy-Driven** | Marketing attributes defined per category (not hard-coded fields) |
| **Multi-Version** | Enrich ANY released version (v1 in warehouse, v2 in production) |
| **Locale-First** | Every attribute value supports multiple languages with fallback |
| **Channel-Aware** | Content can be tailored per sales channel |
| **Asset-Managed** | Images/videos with automatic resizing and CDN |

### Ownership

| Owns | Description |
|------|-------------|
| Marketing versions | Per-design-version content lifecycle |
| Marketing attributes | Category-driven content (descriptions, features, claims) |
| Translations | Multi-language content management |
| Media assets | Images, videos, 360 views |
| Channel configs | Shopify, Amazon, website, print |
| Publishing jobs | Scheduled sync to external systems |

---

## 2. Authority Model

| Authority | Marketing Workspace Capabilities |
|-----------|--------------------------------|
| **MANAGER** | Full CRUD, publish to all channels, configure channels |
| **EDITOR** | Edit content, publish to configured channels |
| **CONTRIBUTOR** | Edit drafts, submit for review (needs approval to publish) |
| **VIEWER** | Read-only access |

---

## 3. Module Architecture

```
+-----------------------------------------------------------------------------+
|                       MARKETING WORKSPACE (PIM)                              |
+-----------------------------------------------------------------------------+
|                                                                              |
|  TAXONOMY ENGINE (Shared with Design)                                        |
|  +-------------+  +--------------------+  +-------------+                   |
|  | Categories  |  | AttributeTemplate  |  |   Units     |                   |
|  |   (LTREE)   |  | workspace=MARKETING|  |  (Systems)  |                   |
|  +------+------+  +----------+---------+  +------+------+                   |
|         |                    |                   |                           |
|         +--------------------+-------------------+                           |
|                              |                                               |
|  CORE MODULES                v                                               |
|  +-------------+  +----------------------+  +-------------+                 |
|  |  Marketing  |  | MarketingAttribute   |  |   Media     |                 |
|  |   Version   |  |      Values          |  |   Assets    |                 |
|  +------+------+  +----------+-----------+  +------+------+                 |
|         |                    |                     |                         |
|         +--------------------+---------------------+                         |
|                              |                                               |
|  OUTPUT MODULES              v                                               |
|  +-------------+  +-------------+  +-------------+  +-------------+         |
|  | Translation |  |  Channel    |  |  Shopify    |  |   Amazon    |         |
|  |   Manager   |  |  Publisher  |  |    Sync     |  |    Sync     |         |
|  +-------------+  +-------------+  +-------------+  +-------------+         |
|                                                                              |
+-----------------------------------------------------------------------------+
```

---

## 4. Agnostic Marketing Model

### 4.1 Why Agnostic?

Hard-coding fields like `careInstructions` or `sizeGuideRef` creates a rigid schema that only works for textiles. An agnostic model allows:

| Industry | Marketing Attributes |
|----------|---------------------|
| **Textiles** | Care Instructions, Size Guide, Fabric Benefits |
| **Electronics** | Voltage Specs, Safety Warnings, Compatibility |
| **Furniture** | Assembly Info, Room Styling Tips, Dimensions |
| **Food** | Nutritional Claims, Allergen Warnings, Recipe Ideas |

All stored in the same table structure, configured per category.

### 4.2 Marketing Version Entity

```typescript
// src/modules/marketing/entities/marketing-version.entity.ts
import { Entity, Property, ManyToOne, OneToMany, Enum, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { Organization } from '../../auth/entities/organization.entity';
import { Product } from '../../design/entities/product.entity';
import { WorkspaceVersion } from '../../design/entities/workspace-version.entity';
import { User } from '../../auth/entities/user.entity';
import { MarketingAttributeValue } from './marketing-attribute-value.entity';
import { MarketingAsset } from './marketing-asset.entity';

export enum MarketingStatus {
  DRAFT = 'DRAFT',
  ENRICHING = 'ENRICHING',
  REVIEW = 'REVIEW',
  LIVE = 'LIVE',
  ARCHIVED = 'ARCHIVED',
}

@Entity({ tableName: 'marketing_version' })
@Unique({ properties: ['product', 'designVersion'] })
export class MarketingVersion extends BaseEntity {
  @ManyToOne(() => Organization)
  @Index()
  organization!: Organization;

  @ManyToOne(() => Product)
  @Index()
  product!: Product;

  // Link to specific design version (not "latest")
  @ManyToOne(() => WorkspaceVersion)
  @Index()
  designVersion!: WorkspaceVersion;

  @Enum(() => MarketingStatus)
  @Index()
  status!: MarketingStatus;

  @Property({ type: 'text', nullable: true })
  statusReason?: string;

  @Property({ nullable: true })
  statusChangedAt?: Date;

  @ManyToOne(() => User, { nullable: true })
  statusChangedBy?: User;

  // Enrichment tracking (calculated from attribute values)
  @Property({ type: 'int', default: 0 })
  enrichmentScore!: number; // 0-100%

  @Property({ type: 'int', default: 0 })
  requiredAttributes!: number;

  @Property({ type: 'int', default: 0 })
  completedAttributes!: number;

  // Publishing
  @Property({ nullable: true })
  firstPublishedAt?: Date;

  @Property({ nullable: true })
  lastPublishedAt?: Date;

  @Property({ type: 'array', nullable: true })
  publishedChannels?: string[];

  @ManyToOne(() => User, { nullable: true })
  createdBy?: User;

  @OneToMany(() => MarketingAttributeValue, (v) => v.marketingVersion)
  attributeValues!: Collection<MarketingAttributeValue>;

  @OneToMany(() => MarketingAsset, (a) => a.marketingVersion)
  assets!: Collection<MarketingAsset>;
}
```

### 4.3 Marketing Attribute Value Entity (Agnostic)

```typescript
// src/modules/marketing/entities/marketing-attribute-value.entity.ts
import { Entity, Property, ManyToOne, Enum, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { MarketingVersion } from './marketing-version.entity';
import { AttributeTemplate } from '../../taxonomy/entities/attribute-template.entity';
import { User } from '../../auth/entities/user.entity';

export enum TranslationStatus {
  PENDING = 'PENDING',
  AI_DRAFT = 'AI_DRAFT',
  IN_PROGRESS = 'IN_PROGRESS',
  REVIEW = 'REVIEW',
  COMPLETE = 'COMPLETE',
}

@Entity({ tableName: 'marketing_attribute_value' })
@Unique({ properties: ['marketingVersion', 'template', 'locale'] })
export class MarketingAttributeValue extends BaseEntity {
  @ManyToOne(() => MarketingVersion, { onDelete: 'cascade' })
  @Index()
  marketingVersion!: MarketingVersion;

  @ManyToOne(() => AttributeTemplate)
  @Index()
  template!: AttributeTemplate; // Points to Taxonomy (workspace=MARKETING)

  @Property({ length: 10 })
  @Index()
  locale!: string; // BCP 47: 'en', 'de', 'fr'

  // The actual content - flexible JSONB for any type
  @Property({ type: 'jsonb' })
  value!: unknown;
  // Examples:
  // { "val": "Premium organic cotton for ultimate comfort" } - TEXT
  // { "val": ["Soft touch", "Breathable", "Eco-friendly"] } - SELECT_MULTI / features
  // { "val": "machine-wash-cold", "display": "Machine wash cold" } - SELECT_SINGLE
  // { "val": "<p>Our t-shirt is crafted from...</p>" } - RICH_TEXT

  // Translation tracking
  @Property({ length: 20, nullable: true })
  translationSource?: string; // 'MANUAL', 'AI', 'EXTERNAL'

  @Enum({ items: () => TranslationStatus, default: TranslationStatus.PENDING })
  translationStatus!: TranslationStatus;

  // Quality tracking
  @Property({ default: false })
  isComplete!: boolean;

  @ManyToOne(() => User, { nullable: true })
  reviewedBy?: User;

  @Property({ nullable: true })
  reviewedAt?: Date;
}
```

### 4.4 Marketing-Specific Attribute Templates

Marketing attributes are defined in the same `AttributeTemplate` table, with `workspace = 'MARKETING'`:

```typescript
// Example seed data for marketing attributes
const MARKETING_TEMPLATES = [
  // Universal marketing attributes (on root PRODUCTS category)
  { categoryCode: 'PRODUCTS', code: 'marketing_title', label: 'Product Title', type: 'TEXT', workspace: 'MARKETING', isRequired: true },
  { categoryCode: 'PRODUCTS', code: 'short_description', label: 'Short Description', type: 'TEXT', workspace: 'MARKETING', isRequired: true },
  { categoryCode: 'PRODUCTS', code: 'long_description', label: 'Long Description', type: 'RICH_TEXT', workspace: 'MARKETING', isRequired: true },
  { categoryCode: 'PRODUCTS', code: 'features', label: 'Key Features', type: 'SELECT_MULTI', workspace: 'MARKETING', isRequired: false },
  { categoryCode: 'PRODUCTS', code: 'benefits', label: 'Customer Benefits', type: 'SELECT_MULTI', workspace: 'MARKETING', isRequired: false },
  { categoryCode: 'PRODUCTS', code: 'meta_title', label: 'SEO Title', type: 'TEXT', workspace: 'MARKETING', isRequired: false },
  { categoryCode: 'PRODUCTS', code: 'meta_description', label: 'SEO Description', type: 'TEXT', workspace: 'MARKETING', isRequired: false },
  { categoryCode: 'PRODUCTS', code: 'url_slug', label: 'URL Slug', type: 'TEXT', workspace: 'MARKETING', isRequired: false },

  // Textile-specific (on APPAREL category - inherited by children)
  { categoryCode: 'APPAREL', code: 'care_instructions', label: 'Care Instructions', type: 'RICH_TEXT', workspace: 'MARKETING', isRequired: true },
  { categoryCode: 'APPAREL', code: 'size_guide_ref', label: 'Size Guide', type: 'REFERENCE', workspace: 'MARKETING', isRequired: false },
  { categoryCode: 'APPAREL', code: 'sustainability_claim', label: 'Sustainability Claim', type: 'TEXT', workspace: 'MARKETING', isRequired: false },

  // Electronics-specific (on ELECTRONICS category)
  { categoryCode: 'ELECTRONICS', code: 'voltage_info', label: 'Voltage Information', type: 'TEXT', workspace: 'MARKETING', isRequired: true },
  { categoryCode: 'ELECTRONICS', code: 'safety_warnings', label: 'Safety Warnings', type: 'RICH_TEXT', workspace: 'MARKETING', isRequired: true },
  { categoryCode: 'ELECTRONICS', code: 'compatibility_list', label: 'Compatibility', type: 'SELECT_MULTI', workspace: 'MARKETING', isRequired: false },
];
```

### 4.5 Design-to-Marketing Attribute Enrichment

Marketing attributes can **augment** Design facts:

| Design Attribute | Design Value | Marketing Attribute | Marketing Value |
|-----------------|--------------|---------------------|-----------------|
| `recycled_content_pct` | `90` | `sustainability_claim` | "Crafted from 90% recycled fibers" |
| `country_of_origin` | `PT` | `origin_statement` | "Proudly made in Portugal" |
| `weight` | `250g` | `product_benefits` | `["Lightweight comfort"]` |

The `rollupSource` field on `AttributeTemplate` can reference Design attributes for validation.

---

## 5. Compliance Guarantee

Because `MarketingVersion` is uniquely tied to `designVersion`:
- **Zero Greenwashing Drift**: Impossible to publish v2.0 "Organic" claims to a v1.0 "Non-Organic" SKU
- **DPP Alignment**: Consumer scanning v1.0 QR code sees v1.0 marketing story
- **Audit Trail**: Historical record of what content was live with each design
- **Validation**: Marketing claims validated against Design facts (e.g., can't claim "100% recycled" if Design says 90%)

---

## 6. Agnostic Clone Service

The clone service doesn't need to know specific fields - it copies all attribute values:

```typescript
// src/modules/marketing/services/marketing-clone.service.ts
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { MarketingVersion, MarketingStatus } from '../entities/marketing-version.entity';
import { MarketingAttributeValue, TranslationStatus } from '../entities/marketing-attribute-value.entity';
import { MarketingAsset } from '../entities/marketing-asset.entity';

@Injectable()
export class MarketingCloneService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Clone marketing content from one design version to another.
   * Completely agnostic - copies whatever attributes exist.
   */
  async cloneMarketingContent(
    productId: string,
    sourceDesignVersionId: string,
    targetDesignVersionId: string,
    userId: string
  ): Promise<MarketingVersion> {
    // 1. Find source marketing version
    const sourceVersion = await this.em.findOneOrFail(MarketingVersion, {
      product: productId,
      designVersion: sourceDesignVersionId,
    }, { populate: ['attributeValues', 'assets', 'product', 'organization'] });

    // 2. Create new marketing version for target design
    const newVersion = this.em.create(MarketingVersion, {
      organization: sourceVersion.organization,
      product: sourceVersion.product,
      designVersion: targetDesignVersionId,
      status: MarketingStatus.DRAFT,
      enrichmentScore: 0,
      requiredAttributes: sourceVersion.requiredAttributes,
      completedAttributes: 0,
      createdBy: userId,
    });
    await this.em.persistAndFlush(newVersion);

    // 3. Clone ALL attribute values (agnostic - no field knowledge needed)
    const sourceValues = await this.em.find(MarketingAttributeValue, {
      marketingVersion: sourceVersion.id,
    });

    for (const oldAttr of sourceValues) {
      const clonedValue = this.em.create(MarketingAttributeValue, {
        marketingVersion: newVersion,
        template: oldAttr.template, // Same attribute definition
        locale: oldAttr.locale,
        value: oldAttr.value, // Copy value regardless of type
        translationSource: oldAttr.translationSource,
        translationStatus: TranslationStatus.PENDING, // Reset for re-verification
        isComplete: false,
      });
      this.em.persist(clonedValue);
    }

    // 4. Clone media associations
    for (const oldAsset of sourceVersion.assets) {
      const clonedAsset = this.em.create(MarketingAsset, {
        marketingVersion: newVersion,
        asset: oldAsset.asset,
        role: oldAsset.role,
        position: oldAsset.position,
        channelVisibility: oldAsset.channelVisibility,
      });
      this.em.persist(clonedAsset);
    }

    await this.em.flush();
    return newVersion;
  }
}
```

---

## 7. Enrichment Validation Service

Reuses the same validation pattern as Design Workspace:

```typescript
// src/modules/marketing/services/enrichment-validation.service.ts
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { MarketingVersion } from '../entities/marketing-version.entity';
import { MarketingAttributeValue } from '../entities/marketing-attribute-value.entity';
import { AttributeTemplate, WorkspaceType } from '../../taxonomy/entities';
import { OrganizationLocale } from '../entities/organization-locale.entity';

export interface ValidationError {
  type: 'MISSING_ATTRIBUTE' | 'MISSING_TRANSLATION' | 'INCOMPLETE_LOCALE';
  severity: 'BLOCKER' | 'WARNING';
  attributeCode: string;
  locale?: string;
  message: string;
}

export interface EnrichmentValidation {
  isComplete: boolean;
  enrichmentScore: number;
  requiredAttributes: number;
  completedAttributes: number;
  errors: ValidationError[];
  canPublish: boolean;
}

@Injectable()
export class EnrichmentValidationService {
  constructor(private readonly em: EntityManager) {}

  async validateEnrichment(marketingVersionId: string): Promise<EnrichmentValidation> {
    const version = await this.em.findOneOrFail(MarketingVersion, marketingVersionId, {
      populate: ['product', 'product.category', 'organization'],
    });

    const errors: ValidationError[] = [];

    // 1. Get required marketing attributes for this category
    const requiredTemplates = await this.getRequiredMarketingAttributes(
      version.product.category.id
    );

    // 2. Get required locales for this organization
    const requiredLocales = await this.em.find(OrganizationLocale, {
      organization: version.organization.id,
      isRequired: true,
    });

    // 3. Get existing attribute values (bulk fetch)
    const existingValues = await this.em.find(MarketingAttributeValue, {
      marketingVersion: marketingVersionId,
    });

    // Build lookup: `${templateId}_${locale}` -> value
    const valueMap = new Map<string, MarketingAttributeValue>();
    for (const val of existingValues) {
      valueMap.set(`${val.template.id}_${val.locale}`, val);
    }

    // 4. Check each required attribute in each required locale
    let totalRequired = 0;
    let totalCompleted = 0;

    for (const template of requiredTemplates) {
      for (const locale of requiredLocales) {
        totalRequired++;
        const key = `${template.id}_${locale.locale}`;
        const value = valueMap.get(key);

        if (!value) {
          errors.push({
            type: 'MISSING_ATTRIBUTE',
            severity: template.validationSeverity as 'BLOCKER' | 'WARNING',
            attributeCode: template.code,
            locale: locale.locale,
            message: `"${template.label}" is missing for ${locale.languageName}`,
          });
        } else if (!value.isComplete) {
          errors.push({
            type: 'INCOMPLETE_LOCALE',
            severity: 'WARNING',
            attributeCode: template.code,
            locale: locale.locale,
            message: `"${template.label}" in ${locale.languageName} is incomplete`,
          });
        } else {
          totalCompleted++;
        }
      }
    }

    const blockers = errors.filter((e) => e.severity === 'BLOCKER');
    const enrichmentScore = totalRequired > 0
      ? Math.round((totalCompleted / totalRequired) * 100)
      : 100;

    return {
      isComplete: blockers.length === 0 && enrichmentScore === 100,
      enrichmentScore,
      requiredAttributes: totalRequired,
      completedAttributes: totalCompleted,
      errors,
      canPublish: blockers.length === 0,
    };
  }

  private async getRequiredMarketingAttributes(categoryId: string): Promise<AttributeTemplate[]> {
    // Get all marketing attributes for this category (including inherited)
    // Uses same inheritance logic as Design
    const category = await this.em.findOneOrFail('Category', categoryId);

    return this.em.find(AttributeTemplate, {
      workspace: WorkspaceType.MARKETING,
      isRequired: true,
      $or: [
        { category: categoryId },
        // Include inherited from ancestors (using path)
        { category: { path: { $ancestor: category.path } }, isInherited: true },
      ],
    });
  }
}
```

---

## 8. Localization System

### 8.1 Organization Locale Configuration

```typescript
// src/modules/marketing/entities/organization-locale.entity.ts
import { Entity, Property, ManyToOne, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { Organization } from '../../auth/entities/organization.entity';

@Entity({ tableName: 'organization_locale' })
@Unique({ properties: ['organization', 'locale'] })
export class OrganizationLocale extends BaseEntity {
  @ManyToOne(() => Organization)
  @Index()
  organization!: Organization;

  @Property({ length: 10 })
  locale!: string; // BCP 47: 'en', 'de', 'fr-BE'

  @Property({ length: 100 })
  languageName!: string; // "German", "French (Belgium)"

  @Property({ default: false })
  isDefault!: boolean;

  @Property({ default: false })
  isRequired!: boolean; // Must complete before publish

  // Translation config
  @Property({ default: false })
  autoTranslate!: boolean; // Use AI translation as draft

  @Property({ default: true })
  reviewRequired!: boolean; // Human review before publish

  @Property({ type: 'int', default: 0 })
  sortOrder!: number;
}
```

### 8.2 AI-Assisted Translation Service

```typescript
// src/modules/marketing/services/translation.service.ts
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { MarketingAttributeValue, TranslationStatus } from '../entities/marketing-attribute-value.entity';
import { AttributeTemplate, WorkspaceType } from '../../taxonomy/entities';

interface TranslationRequest {
  marketingVersionId: string;
  sourceLocale: string;
  targetLocales: string[];
  templateCodes?: string[]; // Optional: specific attributes to translate
}

@Injectable()
export class TranslationService {
  constructor(private readonly em: EntityManager) {}

  async generateAITranslations(req: TranslationRequest): Promise<void> {
    // 1. Get source values
    const sourceValues = await this.em.find(MarketingAttributeValue, {
      marketingVersion: req.marketingVersionId,
      locale: req.sourceLocale,
      ...(req.templateCodes && { template: { code: { $in: req.templateCodes } } }),
    }, { populate: ['template'] });

    // 2. For each target locale
    for (const targetLocale of req.targetLocales) {
      for (const sourceValue of sourceValues) {
        // Skip non-translatable types
        if (!this.isTranslatable(sourceValue.template.type)) {
          continue;
        }

        // Get or create target value
        let targetValue = await this.em.findOne(MarketingAttributeValue, {
          marketingVersion: req.marketingVersionId,
          template: sourceValue.template.id,
          locale: targetLocale,
        });

        if (!targetValue) {
          targetValue = this.em.create(MarketingAttributeValue, {
            marketingVersion: req.marketingVersionId,
            template: sourceValue.template,
            locale: targetLocale,
            value: {},
            translationStatus: TranslationStatus.PENDING,
          });
          this.em.persist(targetValue);
        }

        // Translate the value
        const translatedValue = await this.translateValue(
          sourceValue.value,
          sourceValue.template.type,
          req.sourceLocale,
          targetLocale
        );

        targetValue.value = translatedValue;
        targetValue.translationSource = 'AI';
        targetValue.translationStatus = TranslationStatus.AI_DRAFT;
        targetValue.isComplete = false;
      }
    }

    await this.em.flush();
  }

  private isTranslatable(attributeType: string): boolean {
    return ['TEXT', 'RICH_TEXT', 'SELECT_MULTI'].includes(attributeType);
  }

  private async translateValue(
    value: unknown,
    type: string,
    sourceLocale: string,
    targetLocale: string
  ): Promise<unknown> {
    // Handle different value structures
    if (typeof value === 'object' && value !== null && 'val' in value) {
      const val = (value as { val: unknown }).val;

      if (typeof val === 'string') {
        const translated = await this.callTranslationAPI(val, sourceLocale, targetLocale);
        return { val: translated };
      }

      if (Array.isArray(val)) {
        const translated = await Promise.all(
          val.map((item) =>
            typeof item === 'string'
              ? this.callTranslationAPI(item, sourceLocale, targetLocale)
              : item
          )
        );
        return { val: translated };
      }
    }

    return value;
  }

  private async callTranslationAPI(
    text: string,
    sourceLocale: string,
    targetLocale: string
  ): Promise<string> {
    // Integration with Claude/DeepL API
    // Placeholder for actual implementation
    return text;
  }
}
```

---

## 9. Media Asset Management

### 9.1 Media Asset Entity

```typescript
// src/modules/marketing/entities/media-asset.entity.ts
import { Entity, Property, ManyToOne, Enum, Index } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { Organization } from '../../auth/entities/organization.entity';
import { User } from '../../auth/entities/user.entity';

export enum AssetType {
  PRODUCT_IMAGE = 'PRODUCT_IMAGE',
  LIFESTYLE_IMAGE = 'LIFESTYLE_IMAGE',
  DETAIL_IMAGE = 'DETAIL_IMAGE',
  SIZE_CHART = 'SIZE_CHART',
  VIDEO = 'VIDEO',
  VIDEO_360 = 'VIDEO_360',
  DOCUMENT = 'DOCUMENT',
}

@Entity({ tableName: 'media_asset' })
export class MediaAsset extends BaseEntity {
  @ManyToOne(() => Organization)
  @Index()
  organization!: Organization;

  @Property({ length: 255 })
  filename!: string;

  @Property({ length: 100 })
  mimeType!: string;

  @Property({ type: 'bigint' })
  sizeBytes!: string;

  @Property({ length: 500 })
  r2Path!: string;

  @Property({ length: 64 })
  checksumSha256!: string;

  @Enum(() => AssetType)
  @Index()
  assetType!: AssetType;

  // Image metadata
  @Property({ type: 'int', nullable: true })
  width?: number;

  @Property({ type: 'int', nullable: true })
  height?: number;

  @Property({ length: 10, nullable: true })
  aspectRatio?: string;

  // Generated variants
  @Property({ type: 'jsonb', nullable: true })
  variants?: Record<string, string>;

  // Alt text (per locale for accessibility)
  @Property({ type: 'jsonb', nullable: true })
  altTexts?: Record<string, string>;

  @Property({ type: 'array', nullable: true })
  tags?: string[];

  @ManyToOne(() => User, { nullable: true })
  uploadedBy?: User;

  @Property()
  uploadedAt!: Date;
}
```

### 9.2 Marketing Asset Association

```typescript
// src/modules/marketing/entities/marketing-asset.entity.ts
import { Entity, Property, ManyToOne, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { MarketingVersion } from './marketing-version.entity';
import { MediaAsset } from './media-asset.entity';

@Entity({ tableName: 'marketing_asset' })
@Unique({ properties: ['marketingVersion', 'asset'] })
export class MarketingAsset extends BaseEntity {
  @ManyToOne(() => MarketingVersion, { onDelete: 'cascade' })
  @Index()
  marketingVersion!: MarketingVersion;

  @ManyToOne(() => MediaAsset)
  asset!: MediaAsset;

  @Property({ length: 50 })
  role!: string; // 'primary', 'gallery', 'thumbnail'

  @Property({ type: 'int', default: 0 })
  position!: number;

  @Property({ type: 'array', nullable: true })
  channelVisibility?: string[]; // NULL = all, or ['shopify', 'amazon']
}
```

---

## 10. Channel Publishing

### 10.1 Sales Channel Entity

```typescript
// src/modules/marketing/entities/sales-channel.entity.ts
import { Entity, Property, ManyToOne, Enum, Index } from '@mikro-orm/core';
import { BaseEntity } from '../../shared/entities/base.entity';
import { Organization } from '../../auth/entities/organization.entity';

export enum ChannelType {
  SHOPIFY = 'SHOPIFY',
  AMAZON = 'AMAZON',
  WEBSITE_API = 'WEBSITE_API',
  PRINT_CATALOG = 'PRINT_CATALOG',
  CUSTOM_FEED = 'CUSTOM_FEED',
}

@Entity({ tableName: 'sales_channel' })
export class SalesChannel extends BaseEntity {
  @ManyToOne(() => Organization)
  @Index()
  organization!: Organization;

  @Property({ length: 100 })
  name!: string;

  @Enum(() => ChannelType)
  @Index()
  channelType!: ChannelType;

  @Property({ default: true })
  isActive!: boolean;

  // Connection config (encrypted at rest)
  @Property({ type: 'jsonb' })
  config!: Record<string, unknown>;

  // Locale mapping
  @Property({ type: 'jsonb', nullable: true })
  localeMapping?: Record<string, string>;

  // Attribute mapping (which marketing attributes map to channel fields)
  @Property({ type: 'jsonb', nullable: true })
  attributeMapping?: Record<string, string>;
  // Example: { "marketing_title": "title", "long_description": "body_html" }

  // Image settings
  @Property({ type: 'jsonb', nullable: true })
  imageSettings?: {
    maxImages: number;
    preferredVariant: string;
    includeLifestyle: boolean;
  };

  @Property({ nullable: true })
  lastSyncAt?: Date;

  @Property({ length: 20, nullable: true })
  lastSyncStatus?: string;
}
```

### 10.2 Agnostic Channel Publisher with Locale Fallback

```typescript
// src/modules/marketing/services/channel-publisher.service.ts
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { MarketingVersion } from '../entities/marketing-version.entity';
import { MarketingAttributeValue } from '../entities/marketing-attribute-value.entity';
import { SalesChannel, ChannelType } from '../entities/sales-channel.entity';
import { OrganizationLocale } from '../entities/organization-locale.entity';

interface ChannelPayload {
  fields: Record<string, unknown>;
  fallbacksUsed: Array<{ field: string; requestedLocale: string; fallbackLocale: string }>;
}

@Injectable()
export class ChannelPublisherService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Build channel payload using attribute mapping with locale fallback.
   * If requested locale is missing, falls back to organization's default locale.
   */
  async buildChannelPayload(
    marketingVersionId: string,
    channelId: string,
    requestedLocale: string
  ): Promise<ChannelPayload> {
    const channel = await this.em.findOneOrFail(SalesChannel, channelId, {
      populate: ['organization'],
    });
    const attributeMapping = channel.attributeMapping || {};

    // Get default locale for fallback
    const defaultLocale = await this.em.findOne(OrganizationLocale, {
      organization: channel.organization.id,
      isDefault: true,
    });
    const fallbackLocale = defaultLocale?.locale || 'en';

    // Bulk fetch all attribute values for both locales
    const allValues = await this.em.find(MarketingAttributeValue, {
      marketingVersion: marketingVersionId,
      locale: { $in: [requestedLocale, fallbackLocale] },
    }, { populate: ['template'] });

    // Build lookup: `${attributeCode}_${locale}` -> value
    const valueMap = new Map<string, unknown>();
    for (const val of allValues) {
      valueMap.set(`${val.template.code}_${val.locale}`, val.value);
    }

    // Map to channel fields with fallback
    const payload: Record<string, unknown> = {};
    const fallbacksUsed: ChannelPayload['fallbacksUsed'] = [];

    for (const [attributeCode, channelField] of Object.entries(attributeMapping)) {
      // Try requested locale first
      let value = valueMap.get(`${attributeCode}_${requestedLocale}`);
      let usedFallback = false;

      // Fallback to default locale if missing or empty
      if (!this.hasValue(value) && requestedLocale !== fallbackLocale) {
        value = valueMap.get(`${attributeCode}_${fallbackLocale}`);
        if (this.hasValue(value)) {
          usedFallback = true;
          fallbacksUsed.push({
            field: channelField,
            requestedLocale,
            fallbackLocale,
          });
        }
      }

      if (this.hasValue(value)) {
        payload[channelField] = this.extractValue(value);
      }
    }

    return { fields: payload, fallbacksUsed };
  }

  /**
   * Get a single attribute value with locale fallback.
   */
  private async getAttributeValueWithFallback(
    versionId: string,
    attributeCode: string,
    requestedLocale: string,
    fallbackLocale: string
  ): Promise<{ value: unknown; locale: string; usedFallback: boolean } | null> {
    // Try requested locale first
    const preferred = await this.em.findOne(MarketingAttributeValue, {
      marketingVersion: versionId,
      template: { code: attributeCode },
      locale: requestedLocale,
    });

    if (preferred && this.hasValue(preferred.value)) {
      return { value: preferred.value, locale: requestedLocale, usedFallback: false };
    }

    // Fallback to default if preferred is missing or empty
    if (requestedLocale !== fallbackLocale) {
      const fallback = await this.em.findOne(MarketingAttributeValue, {
        marketingVersion: versionId,
        template: { code: attributeCode },
        locale: fallbackLocale,
      });

      if (fallback && this.hasValue(fallback.value)) {
        return { value: fallback.value, locale: fallbackLocale, usedFallback: true };
      }
    }

    return null;
  }

  /**
   * Check if a value is non-empty.
   */
  private hasValue(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'object' && 'val' in value) {
      const val = (value as { val: unknown }).val;
      if (val === null || val === undefined) return false;
      if (typeof val === 'string' && val.trim() === '') return false;
      if (Array.isArray(val) && val.length === 0) return false;
    }
    return true;
  }

  /**
   * Extract the actual value from JSONB structure.
   */
  private extractValue(value: unknown): unknown {
    if (typeof value === 'object' && value !== null && 'val' in value) {
      return (value as { val: unknown }).val;
    }
    return value;
  }

  /**
   * Publish to channel with full fallback support.
   */
  async publishToChannel(
    marketingVersionId: string,
    channelId: string,
    locale: string
  ): Promise<{
    success: boolean;
    externalId?: string;
    fallbacksUsed: ChannelPayload['fallbacksUsed'];
    errors?: string[];
  }> {
    const { fields, fallbacksUsed } = await this.buildChannelPayload(
      marketingVersionId,
      channelId,
      locale
    );

    const channel = await this.em.findOneOrFail(SalesChannel, channelId);

    // Log fallbacks for audit trail
    if (fallbacksUsed.length > 0) {
      console.log(
        `[Channel Publish] ${fallbacksUsed.length} field(s) used fallback locale:`,
        fallbacksUsed.map((f) => `${f.field}: ${f.requestedLocale} -> ${f.fallbackLocale}`)
      );
    }

    // Channel-specific sync
    switch (channel.channelType) {
      case ChannelType.SHOPIFY:
        return { ...await this.syncToShopify(fields, channel), fallbacksUsed };
      case ChannelType.AMAZON:
        return { ...await this.syncToAmazon(fields, channel), fallbacksUsed };
      default:
        return { success: false, errors: ['Unsupported channel type'], fallbacksUsed };
    }
  }

  private async syncToShopify(
    fields: Record<string, unknown>,
    channel: SalesChannel
  ): Promise<{ success: boolean; externalId?: string; errors?: string[] }> {
    // Shopify GraphQL API implementation
    return { success: true };
  }

  private async syncToAmazon(
    fields: Record<string, unknown>,
    channel: SalesChannel
  ): Promise<{ success: boolean; externalId?: string; errors?: string[] }> {
    // Amazon SP-API implementation
    return { success: true };
  }
}
```

### 10.3 Fallback Behavior Summary

| Scenario | Requested Locale | Fallback Locale | Result |
|----------|-----------------|-----------------|--------|
| `fr-BE` exists | `fr-BE` | `en` | Use `fr-BE` |
| `fr-BE` missing | `fr-BE` | `en` | Use `en`, log fallback |
| `fr-BE` empty string | `fr-BE` | `en` | Use `en`, log fallback |
| Both missing | `fr-BE` | `en` | Field omitted from payload |

---

## 11. API Endpoints

### Marketing Versions

```
GET    /api/v1/marketing/products/:id/versions       # List marketing versions for product
GET    /api/v1/marketing/versions/:id                # Get marketing version details
POST   /api/v1/marketing/products/:id/versions       # Create marketing version (for released design)
POST   /api/v1/marketing/versions/:id/clone          # Clone from another version
PUT    /api/v1/marketing/versions/:id/status         # Update status
GET    /api/v1/marketing/versions/:id/validate       # Validate enrichment completeness
```

### Attribute Values

```
GET    /api/v1/marketing/versions/:id/attributes           # Get all attribute values
GET    /api/v1/marketing/versions/:id/attributes/:locale   # Get values for locale
PUT    /api/v1/marketing/versions/:id/attributes/:locale   # Bulk update locale values
PUT    /api/v1/marketing/versions/:id/attributes/:locale/:code # Update single attribute
POST   /api/v1/marketing/versions/:id/translate            # Trigger AI translation
```

### Media Assets

```
GET    /api/v1/marketing/assets                      # List organization assets
POST   /api/v1/marketing/assets                      # Upload new asset
GET    /api/v1/marketing/versions/:id/assets         # Get version's assets
POST   /api/v1/marketing/versions/:id/assets         # Attach asset to version
PUT    /api/v1/marketing/versions/:id/assets/:assetId # Update position/role
DELETE /api/v1/marketing/versions/:id/assets/:assetId # Detach asset
```

### Channels

```
GET    /api/v1/marketing/channels                    # List configured channels
POST   /api/v1/marketing/channels                    # Add new channel
PUT    /api/v1/marketing/channels/:id                # Update channel config
DELETE /api/v1/marketing/channels/:id                # Remove channel
POST   /api/v1/marketing/channels/:id/test           # Test connection
```

### Publishing

```
GET    /api/v1/marketing/versions/:id/sync-status    # Get sync status per channel
POST   /api/v1/marketing/versions/:id/publish        # Publish to selected channels
GET    /api/v1/marketing/versions/:id/sync-history   # Get sync history
```

---

## 12. Related Documents

| Document | Relationship |
|----------|--------------|
| [Data Model](./02-data-model.md) | Core entities |
| [Design Workspace](./05-design-workspace.md) | Taxonomy Engine, RELEASED versions |
| [Security](./03-security.md) | RBAC model |
| [Compliance Workspace](./08-compliance-workspace.md) | DPP snapshots marketing data |
| [Integrations](./10-integrations.md) | Shopify, Amazon sync |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-21 | Consolidated from marketing-workspace-design; MikroORM entities; refactored to agnostic taxonomy model; added locale fallback logic |
