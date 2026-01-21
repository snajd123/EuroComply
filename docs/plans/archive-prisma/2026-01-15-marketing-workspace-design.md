# Marketing Workspace (PIM) Design

**Status:** Draft
**Date:** 2026-01-15
**Source:** Brainstorming session - Marketing Workspace

---

## 1. Overview

The Marketing Workspace is where products become **sellable** - it transforms technical specifications into consumer-facing content ready for omnichannel distribution. This implements PIM (Product Information Management) functionality.

### Core Principles

| Principle | Implementation |
|-----------|----------------|
| **Design-Gated** | Only RELEASED design versions can be enriched |
| **Multi-Version** | Enrich ANY released version (v1 in warehouse, v2 in production) |
| **Locale-First** | Every text field supports multiple languages |
| **Channel-Aware** | Content can be tailored per sales channel |
| **Asset-Managed** | Images/videos with automatic resizing and CDN |
| **Sync-Ready** | Push to e-commerce, marketplaces, print catalogs |

### Ownership

| Owns | Description |
|------|-------------|
| Marketing versions | Per-design-version content lifecycle |
| Product content | Descriptions, features, benefits |
| Translations | Multi-language content management |
| Media assets | Images, videos, 360° views |
| Channel configs | Shopify, Amazon, website, print |
| Publishing jobs | Scheduled sync to external systems |

---

## 2. Authority Model

> **Reference:** See [User Management Design](./2026-01-15-user-management-design.md) for complete authority model.

| Authority | Marketing Workspace Capabilities |
|-----------|--------------------------------|
| **MANAGER** | Full CRUD, publish to all channels, configure channels |
| **EDITOR** | Edit content, publish to configured channels |
| **CONTRIBUTOR** | Edit drafts, submit for review (needs approval to publish) |
| **VIEWER** | Read-only access |

---

## 3. Module Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       MARKETING WORKSPACE (PIM)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CORE MODULES                                                               │
│  ────────────                                                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Content    │  │   Media     │  │ Translation │  │  Channel    │        │
│  │  Manager    │  │   Assets    │  │   Manager   │  │  Publisher  │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │                │
│         └────────────────┴────────────────┴────────────────┘                │
│                                   │                                          │
│  DATA FLOW                        ▼                                          │
│  ─────────────    ┌─────────────────────────────────────────────────────┐   │
│                   │                 MARKETING VERSION                    │   │
│  Design v1.0 ────►│ marketing_version (linked to design_version_id)     │   │
│  (RELEASED)       │                                                      │   │
│                   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  Design v2.0 ────►│  │ Content EN  │  │ Content DE  │  │ Content FR  │  │   │
│  (RELEASED)       │  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│                   └─────────────────────────────────────────────────────┘   │
│                                   │                                          │
│                                   ▼                                          │
│  CHANNEL OUTPUT   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  ──────────────   │ Shopify │ │ Amazon  │ │ Website │ │  Print  │          │
│                   └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Multi-Version Marketing Model

### 4.1 The Reality: Multiple Versions in Market

A company may have multiple design versions actively being sold:
- **v1.0**: Currently in warehouse/retail
- **v2.0**: In production, launching next month
- **v3.0**: Draft, not yet released

Marketing must enrich EACH released version independently.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MARKETING VERSION SELECTOR                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Product: Premium Cotton T-Shirt (SKU: PCT-001)                             │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Design Version │ Design Status │ Marketing Status │ Action             ││
│  │────────────────│───────────────│──────────────────│────────────────────││
│  │ v1.0           │ RELEASED      │ 🟢 LIVE          │ [Edit] [View DPP]  ││
│  │ v2.0           │ RELEASED      │ 🟡 ENRICHING     │ [Edit] [Preview]   ││
│  │ v3.0           │ DRAFT         │ ⏳ Not available │ --                 ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Legend: Marketing can only enrich RELEASED design versions                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Data Model

```sql
CREATE TYPE marketing_status AS ENUM (
    'DRAFT',          -- Initial state, being enriched
    'ENRICHING',      -- Active work in progress
    'REVIEW',         -- Pending approval
    'LIVE',           -- Published to channels
    'ARCHIVED'        -- No longer in production/sale
);

-- Marketing content version (tied to a specific design version)
CREATE TABLE marketing_version (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization(id),
    product_id          UUID NOT NULL REFERENCES product(id),

    -- Link to specific design version (not "latest")
    design_version_id   UUID NOT NULL REFERENCES workspace_version(id),

    -- Marketing's own status lifecycle
    status              marketing_status NOT NULL DEFAULT 'DRAFT',
    status_reason       TEXT,
    status_changed_at   TIMESTAMPTZ,
    status_changed_by   UUID REFERENCES users(id),

    -- Enrichment tracking
    enrichment_score    INT DEFAULT 0,         -- 0-100% complete
    required_fields     INT DEFAULT 0,
    completed_fields    INT DEFAULT 0,

    -- Publishing
    first_published_at  TIMESTAMPTZ,
    last_published_at   TIMESTAMPTZ,
    published_channels  TEXT[],

    -- Metadata
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    created_by          UUID REFERENCES users(id),

    -- One marketing version per design version
    UNIQUE(product_id, design_version_id)
);

-- Constraint: Can only create marketing for RELEASED design versions
CREATE OR REPLACE FUNCTION check_design_released()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM workspace_version
        WHERE id = NEW.design_version_id
        AND status = 'RELEASED'
    ) THEN
        RAISE EXCEPTION 'Cannot create marketing for non-released design version';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_design_released
    BEFORE INSERT ON marketing_version
    FOR EACH ROW EXECUTE FUNCTION check_design_released();

CREATE INDEX idx_mkt_version_product ON marketing_version (product_id);
CREATE INDEX idx_mkt_version_design ON marketing_version (design_version_id);
CREATE INDEX idx_mkt_version_status ON marketing_version (status);
```

### 4.3 Compliance Guarantee

Because `marketing_version` is uniquely tied to `design_version_id`:
- **Zero Greenwashing Drift**: Impossible to publish v2.0 "Organic" claims to a v1.0 "Non-Organic" SKU
- **DPP Alignment**: Consumer scanning v1.0 QR code sees v1.0 marketing story
- **Audit Trail**: Historical record of what content was live with each design

---

## 5. Content Storage (Locale-Aware)

### 5.1 Data Model

```sql
CREATE TYPE translation_status AS ENUM (
    'PENDING',        -- Not started
    'AI_DRAFT',       -- AI-generated, needs review
    'IN_PROGRESS',    -- Human editing
    'REVIEW',         -- Pending approval
    'COMPLETE'        -- Approved
);

-- Marketing content fields (per marketing version, per locale)
CREATE TABLE marketing_content (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    marketing_version_id UUID NOT NULL REFERENCES marketing_version(id) ON DELETE CASCADE,
    locale              VARCHAR(10) NOT NULL,  -- 'en', 'de', 'fr', 'nl', etc.

    -- Core marketing fields
    title               VARCHAR(255),
    short_description   TEXT,                  -- 1-2 sentences
    long_description    TEXT,                  -- Full marketing copy
    features            JSONB,                 -- Array of feature bullets
    benefits            JSONB,                 -- Array of benefit statements

    -- SEO
    meta_title          VARCHAR(70),
    meta_description    VARCHAR(160),
    keywords            TEXT[],
    url_slug            VARCHAR(255),

    -- E-commerce specific
    care_instructions   TEXT,
    size_guide_ref      VARCHAR(100),
    warranty_info       TEXT,

    -- Compliance-visible (pulled from Design, editable for marketing tone)
    sustainability_claim TEXT,
    origin_statement    TEXT,

    -- Translation tracking
    translation_source  VARCHAR(20),           -- 'MANUAL', 'AI', 'EXTERNAL'
    translation_status  translation_status DEFAULT 'PENDING',

    -- Quality tracking
    is_complete         BOOLEAN DEFAULT false,
    reviewed_by         UUID REFERENCES users(id),
    reviewed_at         TIMESTAMPTZ,

    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),

    UNIQUE(marketing_version_id, locale)
);

CREATE INDEX idx_mkt_content_version ON marketing_content (marketing_version_id);
CREATE INDEX idx_mkt_content_locale ON marketing_content (locale);
```

### 5.2 Clone-Forward Feature

When Design releases v2.0, Marketing can optionally clone from v1.0:

```typescript
async function cloneMarketingContent(
  productId: string,
  sourceDesignVersionId: string,
  targetDesignVersionId: string
): Promise<MarketingVersion> {
  // 1. Create new marketing version for target design
  const newMktVersion = await createMarketingVersion({
    product_id: productId,
    design_version_id: targetDesignVersionId,
    status: 'DRAFT'
  });

  // 2. Copy all locale content from source
  const sourceContent = await getMarketingContent(sourceDesignVersionId);
  for (const content of sourceContent) {
    await createMarketingContent({
      marketing_version_id: newMktVersion.id,
      locale: content.locale,
      title: content.title,
      short_description: content.short_description,
      long_description: content.long_description,
      features: content.features,
      benefits: content.benefits,
      // ... copy all fields
      is_complete: false  // Reset - needs review for new version
    });
  }

  // 3. Copy media associations (images carry forward)
  await cloneMediaAssociations(sourceDesignVersionId, newMktVersion.id);

  return newMktVersion;
}
```

### 5.3 UI: Clone Prompt

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    NEW DESIGN VERSION AVAILABLE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Design v2.0 has been released for "Premium Cotton T-Shirt"                 │
│                                                                              │
│  Would you like to:                                                          │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  [Clone from v1.0]                                                      ││
│  │  Copy all marketing content from v1.0 as a starting point.              ││
│  │  You can then update descriptions to reflect v2.0 changes.              ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  [Start Fresh]                                                          ││
│  │  Create blank marketing content for v2.0.                               ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Note: v1.0 marketing content remains unchanged and LIVE.                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Localization System

### 6.1 Organization Locale Configuration

```sql
-- Locales enabled per organization
CREATE TABLE organization_locale (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization(id),
    locale              VARCHAR(10) NOT NULL,  -- BCP 47: 'en', 'de', 'fr-BE'
    language_name       VARCHAR(100) NOT NULL, -- "German", "French (Belgium)"

    is_default          BOOLEAN DEFAULT false,
    is_required         BOOLEAN DEFAULT false, -- Must complete before publish

    -- Translation config
    auto_translate      BOOLEAN DEFAULT false, -- Use AI translation as draft
    review_required     BOOLEAN DEFAULT true,  -- Human review before publish

    sort_order          INT DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT now(),

    UNIQUE(organization_id, locale)
);

-- Ensure one default per organization
CREATE UNIQUE INDEX idx_org_locale_default
    ON organization_locale (organization_id)
    WHERE is_default = true;
```

### 6.2 Translation Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TRANSLATION STATUS DASHBOARD                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Product: Premium Cotton T-Shirt (v2.0)                                     │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Locale      │ Status       │ Completeness │ Reviewer   │ Action        ││
│  │─────────────│──────────────│──────────────│────────────│───────────────││
│  │ 🇬🇧 English  │ ✓ Complete   │ 100%         │ Sarah M.   │ [Edit]        ││
│  │ 🇩🇪 German   │ 🔄 AI Draft   │ 100%         │ --         │ [Review]      ││
│  │ 🇫🇷 French   │ ⏳ Pending    │ 0%           │ --         │ [Translate]   ││
│  │ 🇳🇱 Dutch    │ 🔄 AI Draft   │ 85%          │ --         │ [Review]      ││
│  │ 🇪🇸 Spanish  │ ⚠️ Incomplete │ 60%          │ --         │ [Continue]    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  [Generate AI Drafts for All]              [Export for External Translator] │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 AI-Assisted Translation

```typescript
interface TranslationRequest {
  marketingVersionId: string;
  sourceLocale: string;
  targetLocales: string[];
  fields: ('title' | 'short_description' | 'long_description' | 'features')[];
}

async function generateAITranslations(req: TranslationRequest): Promise<void> {
  const sourceContent = await getMarketingContent(req.marketingVersionId, req.sourceLocale);

  for (const targetLocale of req.targetLocales) {
    // Get or create target content record
    let targetContent = await getMarketingContent(req.marketingVersionId, targetLocale);
    if (!targetContent) {
      targetContent = await createMarketingContent({
        marketing_version_id: req.marketingVersionId,
        locale: targetLocale
      });
    }

    // Translate each requested field
    const updates: Partial<MarketingContent> = {};

    for (const field of req.fields) {
      if (sourceContent[field]) {
        const translated = await translateText({
          text: sourceContent[field],
          sourceLocale: req.sourceLocale,
          targetLocale,
          context: 'e-commerce product marketing',
          preserveFormatting: true
        });

        updates[field] = translated;
      }
    }

    // Mark as AI draft (requires human review)
    await updateMarketingContent(targetContent.id, {
      ...updates,
      translation_source: 'AI',
      translation_status: 'AI_DRAFT',
      is_complete: false
    });
  }
}
```

---

## 7. Media Asset Management

### 7.1 Asset Library

```sql
CREATE TYPE asset_type AS ENUM (
    'PRODUCT_IMAGE',      -- Main product shots
    'LIFESTYLE_IMAGE',    -- In-context usage
    'DETAIL_IMAGE',       -- Close-up/texture
    'SIZE_CHART',         -- Size guide graphics
    'VIDEO',              -- Product video
    'VIDEO_360',          -- 360° spin
    'DOCUMENT'            -- PDF (user manual, etc.)
);

CREATE TABLE media_asset (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization(id),

    -- File info
    filename            VARCHAR(255) NOT NULL,
    mime_type           VARCHAR(100) NOT NULL,
    size_bytes          BIGINT NOT NULL,
    r2_path             VARCHAR(500) NOT NULL,
    checksum_sha256     VARCHAR(64) NOT NULL,

    -- Classification
    asset_type          asset_type NOT NULL,

    -- Image metadata (if applicable)
    width               INT,
    height              INT,
    aspect_ratio        VARCHAR(10),           -- '1:1', '4:3', '16:9'

    -- Generated variants
    variants            JSONB,                 -- { "thumb": "path", "medium": "path", ... }

    -- Alt text (per locale for accessibility)
    alt_texts           JSONB,                 -- { "en": "...", "de": "..." }

    -- Metadata
    tags                TEXT[],
    uploaded_by         UUID REFERENCES users(id),
    uploaded_at         TIMESTAMPTZ DEFAULT now()
);

-- Link assets to marketing versions (with position/role)
CREATE TABLE marketing_asset (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    marketing_version_id UUID NOT NULL REFERENCES marketing_version(id) ON DELETE CASCADE,
    asset_id            UUID NOT NULL REFERENCES media_asset(id),

    role                VARCHAR(50) NOT NULL,  -- 'primary', 'gallery', 'thumbnail'
    position            INT DEFAULT 0,
    channel_visibility  TEXT[],                -- NULL = all, or ['shopify', 'amazon']

    UNIQUE(marketing_version_id, asset_id)
);

CREATE INDEX idx_asset_org ON media_asset (organization_id);
CREATE INDEX idx_asset_type ON media_asset (asset_type);
CREATE INDEX idx_mkt_asset_version ON marketing_asset (marketing_version_id);
```

### 7.2 Auto-Generated Variants

```typescript
interface ImageVariant {
  name: string;
  maxWidth: number;
  maxHeight: number;
  format: 'webp' | 'jpg' | 'png';
  quality: number;
}

const STANDARD_VARIANTS: ImageVariant[] = [
  { name: 'thumb', maxWidth: 150, maxHeight: 150, format: 'webp', quality: 80 },
  { name: 'small', maxWidth: 400, maxHeight: 400, format: 'webp', quality: 85 },
  { name: 'medium', maxWidth: 800, maxHeight: 800, format: 'webp', quality: 85 },
  { name: 'large', maxWidth: 1200, maxHeight: 1200, format: 'webp', quality: 90 },
  { name: 'zoom', maxWidth: 2400, maxHeight: 2400, format: 'jpg', quality: 95 }
];

async function processUploadedImage(assetId: string): Promise<void> {
  const asset = await getAsset(assetId);
  const variants: Record<string, string> = {};

  for (const variant of STANDARD_VARIANTS) {
    const resized = await resizeImage(asset.r2_path, variant);
    const variantPath = `${asset.organization_id}/variants/${assetId}/${variant.name}.${variant.format}`;
    await uploadToR2(resized, variantPath);
    variants[variant.name] = variantPath;
  }

  await updateAsset(assetId, { variants });
}
```

### 7.3 UI: Asset Gallery

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PRODUCT MEDIA - v2.0                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PRIMARY IMAGE                        GALLERY                                │
│  ┌───────────────────────┐            ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │
│  │                       │            │     │ │     │ │     │ │  +  │       │
│  │                       │            │ [2] │ │ [3] │ │ [4] │ │ Add │       │
│  │        [1]            │            │     │ │     │ │     │ │     │       │
│  │      Primary          │            └─────┘ └─────┘ └─────┘ └─────┘       │
│  │                       │                                                   │
│  │                       │            LIFESTYLE                              │
│  │   [Change Primary]    │            ┌─────┐ ┌─────┐                       │
│  └───────────────────────┘            │     │ │  +  │                       │
│                                       │ [5] │ │ Add │                       │
│  Drag to reorder gallery images       └─────┘ └─────┘                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ VIDEO                                                                    ││
│  │ ┌────────────────────────────────┐  ┌──────────────────────────────────┐││
│  │ │ ▶ Product Overview (0:45)      │  │ ▶ 360° Spin                      │││
│  │ └────────────────────────────────┘  └──────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Channel Publishing

### 8.1 Channel Configuration

```sql
CREATE TYPE channel_type AS ENUM (
    'SHOPIFY',
    'AMAZON',
    'WEBSITE_API',
    'PRINT_CATALOG',
    'CUSTOM_FEED'
);

CREATE TYPE sync_status AS ENUM (
    'PENDING',
    'SYNCING',
    'SUCCESS',
    'FAILED',
    'PARTIAL'
);

CREATE TABLE sales_channel (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization(id),

    -- Channel identity
    name                VARCHAR(100) NOT NULL,
    channel_type        channel_type NOT NULL,
    is_active           BOOLEAN DEFAULT true,

    -- Connection config (encrypted)
    config              JSONB NOT NULL,        -- API keys, store URL, etc.

    -- Locale mapping
    locale_mapping      JSONB,                 -- { "en": "en-US", "de": "de-DE" }

    -- Field mapping (which fields to sync)
    field_mapping       JSONB,                 -- { "title": "name", "long_description": "body_html" }

    -- Sync settings
    auto_sync           BOOLEAN DEFAULT false,
    sync_on_publish     BOOLEAN DEFAULT true,
    sync_schedule       VARCHAR(50),           -- Cron expression for scheduled sync

    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),

    UNIQUE(organization_id, name)
);

-- Track sync history per marketing version per channel
CREATE TABLE channel_sync (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    marketing_version_id UUID NOT NULL REFERENCES marketing_version(id),
    channel_id          UUID NOT NULL REFERENCES sales_channel(id),

    -- Sync status
    status              sync_status NOT NULL DEFAULT 'PENDING',
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,

    -- Results
    external_id         VARCHAR(255),          -- Product ID in external system
    external_url        VARCHAR(500),          -- Link to product in channel
    synced_locales      TEXT[],
    synced_fields       TEXT[],

    -- Error tracking
    error_message       TEXT,
    error_details       JSONB,

    -- Metadata
    triggered_by        UUID REFERENCES users(id),
    trigger_type        VARCHAR(20),           -- 'MANUAL', 'AUTO', 'SCHEDULED'

    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_channel_org ON sales_channel (organization_id);
CREATE INDEX idx_sync_version ON channel_sync (marketing_version_id);
CREATE INDEX idx_sync_channel ON channel_sync (channel_id);
CREATE INDEX idx_sync_status ON channel_sync (status);
```

### 8.2 Channel Adapters

```typescript
interface ChannelAdapter {
  channelType: channel_type;
  connect(config: ChannelConfig): Promise<void>;
  validateConnection(): Promise<boolean>;
  pushProduct(data: ProductSyncData): Promise<SyncResult>;
  pullProduct(externalId: string): Promise<ExternalProduct>;
  deleteProduct(externalId: string): Promise<void>;
}

interface ProductSyncData {
  marketingVersionId: string;
  externalId?: string;         // For updates
  content: MarketingContent[]; // All locales
  assets: MarketingAsset[];
  designAttributes: Record<string, any>;  // From linked design version
}

interface SyncResult {
  success: boolean;
  externalId: string;
  externalUrl: string;
  syncedLocales: string[];
  warnings?: string[];
  error?: string;
}

// Shopify adapter example
class ShopifyAdapter implements ChannelAdapter {
  channelType = 'SHOPIFY' as const;
  private client: ShopifyClient;

  async connect(config: ChannelConfig): Promise<void> {
    this.client = new ShopifyClient({
      store: config.store_url,
      accessToken: config.access_token
    });
  }

  async pushProduct(data: ProductSyncData): Promise<SyncResult> {
    const shopifyProduct = this.mapToShopify(data);

    try {
      let result;
      if (data.externalId) {
        result = await this.client.product.update(data.externalId, shopifyProduct);
      } else {
        result = await this.client.product.create(shopifyProduct);
      }

      return {
        success: true,
        externalId: result.id.toString(),
        externalUrl: `https://${this.client.store}/admin/products/${result.id}`,
        syncedLocales: data.content.map(c => c.locale)
      };
    } catch (error) {
      return {
        success: false,
        externalId: data.externalId || '',
        externalUrl: '',
        syncedLocales: [],
        error: error.message
      };
    }
  }

  private mapToShopify(data: ProductSyncData): ShopifyProduct {
    const defaultContent = data.content.find(c => c.locale === 'en') || data.content[0];

    return {
      title: defaultContent.title,
      body_html: defaultContent.long_description,
      vendor: data.designAttributes.brand,
      product_type: data.designAttributes.category,
      tags: defaultContent.keywords?.join(', '),
      images: data.assets
        .filter(a => a.role !== 'video')
        .map(a => ({ src: getCDNUrl(a.asset_id) })),
      metafields: [
        { namespace: 'eurocomply', key: 'dpp_uri', value: data.designAttributes.dpp_uri },
        { namespace: 'eurocomply', key: 'design_version', value: data.designAttributes.version }
      ]
    };
  }
}
```

### 8.3 UI: Channel Dashboard

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CHANNEL PUBLISHING                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CONFIGURED CHANNELS                                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Channel           │ Type     │ Status    │ Last Sync   │ Action        ││
│  │───────────────────│──────────│───────────│─────────────│───────────────││
│  │ Main Website      │ Shopify  │ ✓ Active  │ 2 hrs ago   │ [Sync] [Config]│
│  │ Amazon DE         │ Amazon   │ ✓ Active  │ 1 day ago   │ [Sync] [Config]│
│  │ B2B Portal        │ API      │ ✓ Active  │ Just now    │ [Sync] [Config]│
│  │ Spring Catalog    │ Print    │ ⏸ Paused  │ --          │ [Enable]       │
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  [+ Add Channel]                                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.4 UI: Publish Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PUBLISH v2.0 TO CHANNELS                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Product: Premium Cotton T-Shirt (v2.0)                                     │
│  Marketing Status: ENRICHING → Will change to LIVE after publish            │
│                                                                              │
│  PRE-PUBLISH CHECKLIST                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ ✓ English content complete (100%)                                       ││
│  │ ✓ German content complete (100%)                                        ││
│  │ ⚠️ French content incomplete (60%) - Required locale!                    ││
│  │ ✓ Primary image set                                                     ││
│  │ ✓ At least 3 gallery images                                             ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  SELECT CHANNELS                                                            │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ ☑️ Main Website (Shopify)     - Will sync: en, de                        ││
│  │ ☑️ Amazon DE                  - Will sync: de only                       ││
│  │ ☐ B2B Portal                 - Optional                                 ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ⚠️ WARNING: French (fr) is a required locale but incomplete.               │
│     Publishing will proceed without French content.                         │
│                                                                              │
│  [Cancel]                              [Publish to Selected Channels]       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.5 Sync Service

```typescript
async function publishToChannels(
  marketingVersionId: string,
  channelIds: string[],
  triggeredBy: string
): Promise<PublishResult[]> {
  const mktVersion = await getMarketingVersion(marketingVersionId);
  const content = await getAllMarketingContent(marketingVersionId);
  const assets = await getMarketingAssets(marketingVersionId);
  const designVersion = await getDesignVersion(mktVersion.design_version_id);
  const designAttributes = await getDesignAttributes(designVersion.id);

  const results: PublishResult[] = [];

  for (const channelId of channelIds) {
    const channel = await getChannel(channelId);

    // Create sync record
    const sync = await createChannelSync({
      marketing_version_id: marketingVersionId,
      channel_id: channelId,
      status: 'SYNCING',
      started_at: new Date(),
      triggered_by: triggeredBy,
      trigger_type: 'MANUAL'
    });

    try {
      // Get appropriate adapter
      const adapter = getChannelAdapter(channel.channel_type);
      await adapter.connect(channel.config);

      // Filter content by channel's locale mapping
      const channelLocales = Object.keys(channel.locale_mapping || {});
      const filteredContent = content.filter(c =>
        channelLocales.length === 0 || channelLocales.includes(c.locale)
      );

      // Get previous sync for this channel (for updates)
      const previousSync = await getLastSuccessfulSync(marketingVersionId, channelId);

      // Push to channel
      const result = await adapter.pushProduct({
        marketingVersionId,
        externalId: previousSync?.external_id,
        content: filteredContent,
        assets,
        designAttributes
      });

      // Update sync record
      await updateChannelSync(sync.id, {
        status: result.success ? 'SUCCESS' : 'FAILED',
        completed_at: new Date(),
        external_id: result.externalId,
        external_url: result.externalUrl,
        synced_locales: result.syncedLocales,
        error_message: result.error
      });

      results.push({ channelId, ...result });

    } catch (error) {
      await updateChannelSync(sync.id, {
        status: 'FAILED',
        completed_at: new Date(),
        error_message: error.message
      });

      results.push({
        channelId,
        success: false,
        externalId: '',
        externalUrl: '',
        syncedLocales: [],
        error: error.message
      });
    }
  }

  // Update marketing version status if all required channels succeeded
  const allSuccess = results.every(r => r.success);
  if (allSuccess) {
    await updateMarketingVersion(marketingVersionId, {
      status: 'LIVE',
      last_published_at: new Date(),
      published_channels: channelIds
    });
  }

  return results;
}
```

---

## 9. API Endpoints

### Marketing Versions

```
GET    /api/v1/marketing/products/:id/versions       # List marketing versions for product
GET    /api/v1/marketing/versions/:id                # Get marketing version details
POST   /api/v1/marketing/products/:id/versions       # Create marketing version (for released design)
POST   /api/v1/marketing/versions/:id/clone          # Clone from another version
PUT    /api/v1/marketing/versions/:id/status         # Update status
```

### Content

```
GET    /api/v1/marketing/versions/:id/content        # Get all locale content
GET    /api/v1/marketing/versions/:id/content/:locale # Get specific locale
PUT    /api/v1/marketing/versions/:id/content/:locale # Update locale content
POST   /api/v1/marketing/versions/:id/translate      # Trigger AI translation
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

## 10. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.2 | 2026-01-16 | Added cross-workspace flow and related documents table |
| 0.1 | 2026-01-15 | Initial draft from brainstorming session |

---

## 11. Related Documents

| Document | Relationship |
|----------|--------------|
| [Design Workspace Design](./2026-01-15-design-workspace-design.md) | Upstream: Marketing enriches RELEASED design versions |
| [Compliance Workspace Design](./2026-01-15-compliance-workspace-design.md) | Downstream: Compliance snapshots Marketing data into DPPs |
| [Taxonomy Engine Design](./2026-01-15-taxonomy-engine-design.md) | Shared data model |
| [User Management Design](./2026-01-15-user-management-design.md) | Authority model |
| [Architecture Design](./2026-01-15-architecture-design.md) | System architecture |

### Marketing Version → DPP Flow

When a Marketing version status is **LIVE**, it becomes available for:
1. **Channel Publishers** to sync to e-commerce platforms
2. **Compliance** to snapshot marketing content into DPPs (frozen at batch RELEASED)
