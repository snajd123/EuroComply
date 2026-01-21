# Integrations

**Status:** Active
**Last Updated:** 2026-01-21

---

## 1. Overview

EuroComply provides a comprehensive integration layer connecting internal workspaces with external systems: e-commerce platforms, EU infrastructure, digital wallets, and third-party applications.

### Integration Categories

| Category | Components | Direction |
|----------|------------|-----------|
| **REST API** | Public API, Private API, Webhooks | Bidirectional |
| **E-commerce** | Shopify Syndication, Retailer App, Widget | Bidirectional |
| **EU Infrastructure** | EBSI, EU DPP Registry | Outbound |
| **Digital Wallets** | EUDI Wallet (OID4VCI/OID4VP) | Outbound |

### Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Standards-first** | W3C VCs, GS1 Digital Link, OID4VCI, JSON-LD |
| **Additive integration** | EU systems add trust anchors, not new formats |
| **Graceful degradation** | Services work without external dependencies |
| **Tenant isolation** | All integrations scoped to organization |

---

## 2. MikroORM Entities

### API Key Management

```typescript
import { Entity, Property, ManyToOne, Enum, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity';
import { Organization } from './Organization';

export enum ApiKeyStatus {
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
  EXPIRED = 'EXPIRED',
}

@Entity({ tableName: 'api_key' })
export class ApiKey extends BaseEntity {
  @ManyToOne(() => Organization)
  organization!: Organization;

  @Property()
  name!: string;

  @Property()
  @Index()
  @Unique()
  keyPrefix!: string; // ec_live_abc12345 (first 16 chars, for identification)

  @Property()
  keyHash!: string; // SHA-256 hash of full key

  @Property({ type: 'jsonb' })
  scopes!: string[]; // ['products:read', 'passports:write']

  @Enum(() => ApiKeyStatus)
  status: ApiKeyStatus = ApiKeyStatus.ACTIVE;

  @Property({ nullable: true })
  lastUsedAt?: Date;

  @Property({ nullable: true })
  expiresAt?: Date;

  @Property({ nullable: true })
  revokedAt?: Date;

  @Property({ nullable: true })
  revokedBy?: string;

  @Property({ type: 'jsonb', nullable: true })
  ipAllowlist?: string[];

  @Property({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;
}
```

### Webhook Configuration

```typescript
import { Entity, Property, ManyToOne, Enum, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity';
import { Organization } from './Organization';

export enum WebhookStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  FAILED = 'FAILED',
}

@Entity({ tableName: 'webhook_endpoint' })
export class WebhookEndpoint extends BaseEntity {
  @ManyToOne(() => Organization)
  organization!: Organization;

  @Property()
  url!: string;

  @Property()
  secret!: string; // HMAC signing secret (encrypted)

  @Property({ type: 'jsonb' })
  events!: string[]; // ['product.created', 'passport.issued']

  @Enum(() => WebhookStatus)
  status: WebhookStatus = WebhookStatus.ACTIVE;

  @Property({ default: 0 })
  failureCount!: number;

  @Property({ nullable: true })
  lastSuccessAt?: Date;

  @Property({ nullable: true })
  lastFailureAt?: Date;

  @Property({ nullable: true })
  disabledAt?: Date;

  @Property({ type: 'jsonb', nullable: true })
  headers?: Record<string, string>; // Custom headers
}

@Entity({ tableName: 'webhook_delivery' })
export class WebhookDelivery extends BaseEntity {
  @ManyToOne(() => WebhookEndpoint)
  endpoint!: WebhookEndpoint;

  @Property()
  @Index()
  eventType!: string;

  @Property({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Property()
  @Index()
  status!: 'pending' | 'success' | 'failed' | 'dead_letter';

  @Property({ default: 0 })
  attemptCount!: number;

  @Property({ nullable: true })
  lastAttemptAt?: Date;

  @Property({ nullable: true })
  nextAttemptAt?: Date;

  @Property({ nullable: true })
  responseStatus?: number;

  @Property({ type: 'text', nullable: true })
  responseBody?: string;

  @Property({ nullable: true })
  errorMessage?: string;
}
```

### Shopify Integration

```typescript
import { Entity, Property, ManyToOne, OneToMany, Enum, Index, Unique, Collection } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity';
import { Organization } from './Organization';

export enum ShopifyConnectionStatus {
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  SYNCING = 'SYNCING',
  ERROR = 'ERROR',
}

export enum ConflictResolutionMode {
  AUTO_RESOLVE = 'AUTO_RESOLVE',
  ALERT_USER = 'ALERT_USER',
  REQUIRE_MANUAL = 'REQUIRE_MANUAL',
}

@Entity({ tableName: 'shopify_connection' })
export class ShopifyConnection extends BaseEntity {
  @ManyToOne(() => Organization)
  organization!: Organization;

  @Property()
  @Index()
  @Unique()
  shopDomain!: string; // my-store.myshopify.com

  @Property()
  shopName!: string;

  @Property()
  accessToken!: string; // AES-256-GCM encrypted

  @Property({ type: 'jsonb' })
  scopes!: string[]; // ['read_products', 'write_products']

  @Enum(() => ShopifyConnectionStatus)
  status: ShopifyConnectionStatus = ShopifyConnectionStatus.CONNECTED;

  @Enum(() => ConflictResolutionMode)
  conflictMode: ConflictResolutionMode = ConflictResolutionMode.ALERT_USER;

  @Property({ nullable: true })
  lastSyncAt?: Date;

  @Property({ nullable: true })
  lastErrorAt?: Date;

  @Property({ nullable: true })
  lastErrorMessage?: string;

  @Property({ default: 0 })
  productCount!: number;

  @Property({ default: 0 })
  syncedCount!: number;

  @OneToMany(() => ShopifyProductMapping, (m) => m.connection)
  productMappings = new Collection<ShopifyProductMapping>(this);
}

@Entity({ tableName: 'shopify_product_mapping' })
export class ShopifyProductMapping extends BaseEntity {
  @ManyToOne(() => ShopifyConnection)
  connection!: ShopifyConnection;

  @Property()
  @Index()
  shopifyProductId!: string;

  @Property({ nullable: true })
  @Index()
  shopifyVariantId?: string;

  @Property()
  @Index()
  eurocomplyProductId!: string;

  @Property({ nullable: true })
  shopifyGtin?: string;

  @Property({ nullable: true })
  shopifySku?: string;

  @Property({ nullable: true })
  lastSyncedAt?: Date;

  @Property({ type: 'jsonb', nullable: true })
  syncState?: {
    commercialDataHash?: string;
    complianceDataHash?: string;
    lastConflict?: {
      field: string;
      shopifyValue: unknown;
      eurocomplyValue: unknown;
      resolvedAt?: Date;
      resolution?: 'shopify' | 'eurocomply' | 'manual';
    };
  };
}
```

### EU Registry Integration

```typescript
import { Entity, Property, ManyToOne, Enum, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity';
import { Organization } from './Organization';
import { DPPSnapshot } from './DPPSnapshot';

export enum EuRegistryStatus {
  NOT_REGISTERED = 'NOT_REGISTERED',
  PENDING = 'PENDING',
  REGISTERED = 'REGISTERED',
  FAILED = 'FAILED',
  REVOKED = 'REVOKED',
}

@Entity({ tableName: 'eu_registry_record' })
export class EuRegistryRecord extends BaseEntity {
  @ManyToOne(() => Organization)
  organization!: Organization;

  @ManyToOne(() => DPPSnapshot)
  snapshot!: DPPSnapshot;

  @Property()
  @Index()
  gtin!: string;

  @Property({ nullable: true })
  @Index()
  euRegistryId?: string; // ID assigned by EU Registry

  @Enum(() => EuRegistryStatus)
  status: EuRegistryStatus = EuRegistryStatus.NOT_REGISTERED;

  @Property({ nullable: true })
  registeredAt?: Date;

  @Property({ nullable: true })
  lastCheckedAt?: Date;

  @Property({ nullable: true })
  errorMessage?: string;

  @Property({ type: 'jsonb', nullable: true })
  registryResponse?: Record<string, unknown>;
}
```

### EBSI DID Registration

```typescript
import { Entity, Property, OneToOne, Index } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity';
import { OrganizationDID } from './OrganizationDID';

@Entity({ tableName: 'ebsi_registration' })
export class EbsiRegistration extends BaseEntity {
  @OneToOne(() => OrganizationDID)
  organizationDid!: OrganizationDID;

  @Property()
  @Index()
  didEbsi!: string; // did:ebsi:z23abc...

  @Property()
  tirEntry!: string; // Trusted Issuers Registry entry

  @Property()
  accreditedBy!: string; // TAO that accredited

  @Property()
  registeredAt!: Date;

  @Property({ nullable: true })
  expiresAt?: Date;

  @Property({ type: 'jsonb' })
  accreditations!: string[]; // ['DigitalProductPassport', ...]

  @Property({ type: 'jsonb', nullable: true })
  attributes?: Record<string, unknown>; // Public TIR attributes
}
```

### EUDI Wallet Holders

```typescript
import { Entity, Property, ManyToOne, Index, Unique } from '@mikro-orm/core';
import { BaseEntity } from './BaseEntity';
import { Organization } from './Organization';
import { IssuedCredential } from './IssuedCredential';

@Entity({ tableName: 'wallet_holder' })
@Unique({ properties: ['gtin', 'serialNumber', 'holderDid'] })
export class WalletHolder extends BaseEntity {
  @ManyToOne(() => Organization)
  organization!: Organization;

  @ManyToOne(() => IssuedCredential)
  credential!: IssuedCredential;

  @Property()
  @Index()
  gtin!: string;

  @Property({ nullable: true })
  @Index()
  serialNumber?: string;

  @Property()
  @Index()
  holderDid!: string; // Wallet's DID

  @Property()
  credentialHash!: string; // For revocation tracking

  @Property()
  issuedAt!: Date;

  @Property({ nullable: true })
  revokedAt?: Date;

  @Property({ nullable: true })
  transferFromId?: string; // Previous holder's WalletHolder.id
}

@Entity({ tableName: 'wallet_transfer_code' })
export class WalletTransferCode extends BaseEntity {
  @ManyToOne(() => WalletHolder)
  holder!: WalletHolder;

  @Property()
  @Index()
  @Unique()
  code!: string; // 6-digit transfer code

  @Property()
  expiresAt!: Date;

  @Property({ nullable: true })
  claimedAt?: Date;

  @Property({ nullable: true })
  claimedByDid?: string;
}

@Entity({ tableName: 'disclosure_policy' })
export class DisclosurePolicy extends BaseEntity {
  @ManyToOne(() => Organization)
  organization!: Organization;

  @Property()
  @Index()
  productFamilyId!: string;

  @Property({ default: 1 })
  version!: number;

  @Property({ type: 'jsonb' })
  mandatoryClaims!: string[]; // Always disclosed

  @Property({ type: 'jsonb' })
  disclosableClaims!: string[]; // Holder controls

  @Property({ nullable: true })
  preset?: 'maximum_transparency' | 'sustainability_focus' | 'privacy_balanced' | 'custom';
}
```

---

## 3. REST API Design

### Authentication Methods

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION METHODS                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  METHOD 1: Session (Dashboard Users)                            │
│  ───────────────────────────────────                            │
│  • Clerk-managed JWT tokens                                     │
│  • HttpOnly secure cookies                                      │
│  • Automatic refresh                                            │
│  • Used by: Web dashboard                                       │
│                                                                  │
│  METHOD 2: API Keys (Integrations)                              │
│  ─────────────────────────────────                              │
│  • Format: ec_live_<32-hex-chars>                               │
│  • Scoped permissions                                           │
│  • SHA-256 hashed storage                                       │
│  • Used by: Shopify, external systems, automation               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### API Key Scopes

| Scope | Description | Endpoints |
|-------|-------------|-----------|
| `products:read` | Read product data | GET /products/* |
| `products:write` | Create/update products | POST, PUT /products/* |
| `passports:read` | Read DPPs | GET /passports/* |
| `passports:write` | Issue DPPs | POST /passports/* |
| `attestations:read` | Read attestations | GET /attestations/* |
| `attestations:write` | Manage attestation requests | POST /attestations/* |
| `admin:organization` | Organization settings | /organization/* |
| `admin:users` | User management | /users/* |

### Response Envelope

```typescript
// Success response
interface ApiResponse<T> {
  success: true;
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
  };
}

// Error response
interface ApiErrorResponse {
  success: false;
  error: {
    code: string;           // VALIDATION_ERROR, AUTH_EXPIRED, etc.
    message: string;        // Human-readable
    details?: Record<string, unknown>;
  };
  meta: {
    requestId: string;
    timestamp: string;
  };
}
```

### Pagination

```typescript
// Request
GET /api/v1/products?page=2&pageSize=20

// Response meta
interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
```

### Rate Limiting by Tier

| Tier | Requests/min | Burst | Headers |
|------|--------------|-------|---------|
| Starter | 100 | 150 | `X-RateLimit-*` |
| Growth | 500 | 750 | `X-RateLimit-*` |
| Scale | 2,000 | 3,000 | `X-RateLimit-*` |
| Enterprise | 10,000 | 15,000 | `X-RateLimit-*` |

```http
X-RateLimit-Limit: 500
X-RateLimit-Remaining: 450
X-RateLimit-Reset: 1705312800
Retry-After: 30  (only on 429)
```

### Idempotency

```http
POST /api/v1/products
Idempotency-Key: client-generated-uuid
```

Same key within 24h returns cached response, preventing duplicate creation on retry.

---

## 4. Webhook System

### Event Types

| Event | Trigger | Payload |
|-------|---------|---------|
| `product.created` | New product | Product data |
| `product.updated` | Product modified | Changed fields |
| `product.released` | Product released | Product + status |
| `passport.issued` | DPP issued | Credential metadata |
| `passport.revoked` | DPP revoked | Revocation details |
| `attestation.requested` | Attestation requested | Request details |
| `attestation.completed` | Attestation signed | Signed credential |

### Delivery Guarantees

| Guarantee | Implementation |
|-----------|----------------|
| **At-least-once** | Retry on failure |
| **Ordered per-resource** | Events for same entity in order |
| **Signed** | HMAC-SHA256 signature |
| **Idempotent** | Include event ID for deduplication |

### Retry Schedule

```
Attempt 1: Immediate
Attempt 2: 1 minute
Attempt 3: 5 minutes
Attempt 4: 30 minutes
Attempt 5: 2 hours
Attempt 6: 8 hours
(max 6 attempts, then dead letter)
```

### Signature Verification

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const sig = signature.replace('sha256=', '');

  return timingSafeEqual(
    Buffer.from(sig, 'hex'),
    Buffer.from(expected, 'hex'),
  );
}
```

### Webhook Service

```typescript
import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHmac, randomBytes } from 'crypto';
import { WebhookEndpoint, WebhookDelivery } from '../entities';

@Injectable()
export class WebhookService {
  constructor(
    private readonly em: EntityManager,
    @InjectQueue('webhooks') private readonly webhookQueue: Queue,
  ) {}

  async dispatchEvent(
    organizationId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const endpoints = await this.em.find(WebhookEndpoint, {
      organization: { id: organizationId },
      status: 'ACTIVE',
      events: { $contains: [eventType] },
    });

    for (const endpoint of endpoints) {
      const delivery = this.em.create(WebhookDelivery, {
        endpoint,
        eventType,
        payload,
        status: 'pending',
        attemptCount: 0,
      });

      await this.em.persistAndFlush(delivery);

      await this.webhookQueue.add('deliver', {
        deliveryId: delivery.id,
      }, {
        attempts: 6,
        backoff: {
          type: 'custom',
        },
      });
    }
  }

  async deliverWebhook(deliveryId: string): Promise<void> {
    const delivery = await this.em.findOneOrFail(WebhookDelivery, deliveryId, {
      populate: ['endpoint'],
    });

    const payloadString = JSON.stringify({
      id: delivery.id,
      type: delivery.eventType,
      timestamp: new Date().toISOString(),
      data: delivery.payload,
    });

    const signature = createHmac('sha256', delivery.endpoint.secret)
      .update(payloadString)
      .digest('hex');

    try {
      const response = await fetch(delivery.endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EuroComply-Signature': `sha256=${signature}`,
          'X-EuroComply-Event': delivery.eventType,
          'X-EuroComply-Delivery-Id': delivery.id,
          ...delivery.endpoint.headers,
        },
        body: payloadString,
        signal: AbortSignal.timeout(30_000),
      });

      delivery.attemptCount += 1;
      delivery.lastAttemptAt = new Date();
      delivery.responseStatus = response.status;

      if (response.ok) {
        delivery.status = 'success';
        delivery.endpoint.lastSuccessAt = new Date();
        delivery.endpoint.failureCount = 0;
      } else {
        delivery.responseBody = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      delivery.attemptCount += 1;
      delivery.lastAttemptAt = new Date();
      delivery.errorMessage = error instanceof Error ? error.message : 'Unknown error';
      delivery.endpoint.lastFailureAt = new Date();
      delivery.endpoint.failureCount += 1;

      if (delivery.attemptCount >= 6) {
        delivery.status = 'dead_letter';
      }

      // Disable endpoint after 10 consecutive failures
      if (delivery.endpoint.failureCount >= 10) {
        delivery.endpoint.status = 'FAILED';
        delivery.endpoint.disabledAt = new Date();
      }

      throw error; // Trigger BullMQ retry
    } finally {
      await this.em.flush();
    }
  }
}
```

---

## 5. Shopify Integration

### Connection Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    SHOPIFY SYNDICATION FLOW                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. CONNECT                                                     │
│     Dashboard → Marketing → Channels → Add Shopify              │
│     OAuth flow with Shopify                                     │
│                                                                  │
│  2. IMPORT                                                      │
│     Products automatically imported and routed:                 │
│     • Technical data → Product Registry (Design)                │
│     • Commercial data → PIM (Marketing)                         │
│     • Images → DAM-Media (Marketing)                            │
│                                                                  │
│  3. ENRICH                                                      │
│     User adds compliance data in Design workspace               │
│     Materials, certifications, sustainability attributes        │
│                                                                  │
│  4. ISSUE DPP                                                   │
│     Compliance workspace reviews and approves                   │
│                                                                  │
│  5. SYNC BACK                                                   │
│     DPP data pushed to Shopify metafields                       │
│     QR codes available for product pages                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Workspace Routing

| Shopify Field | Routes To | Workspace |
|---------------|-----------|-----------|
| `variants[].barcode` (GTIN) | Product Registry | Design |
| `variants[].sku` | Product Registry | Design |
| `vendor` | Product Registry | Design |
| `product_type` | Product Registry | Design |
| `title` | PIM | Marketing |
| `body_html` | PIM | Marketing |
| `variants[].price` | PIM | Marketing |
| `tags` | PIM | Marketing |
| `images` | DAM-Media | Marketing |

### Conflict Resolution Strategy

| Data Type | Authority | Rationale |
|-----------|-----------|-----------|
| **Commercial** (title, price, tags) | Shopify | Sales channel is authoritative |
| **Compliance** (materials, certs, DPP) | EuroComply | Compliance system is authoritative |
| **Technical identity** (SKU, GTIN) | Manual resolution | Critical for product matching |
| **Media** (images) | Shopify → EuroComply | One-way import to DAM |

### Shopify Sync Service

```typescript
import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { ShopifyConnection, ShopifyProductMapping, ShopifyConnectionStatus } from '../entities';

interface ShopifyProduct {
  id: string;
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  tags: string;
  variants: Array<{
    id: string;
    sku: string;
    barcode: string;
    price: string;
  }>;
  images: Array<{
    id: string;
    src: string;
    position: number;
  }>;
}

@Injectable()
export class ShopifySyncService {
  private readonly logger = new Logger(ShopifySyncService.name);

  constructor(
    private readonly em: EntityManager,
    @InjectQueue('shopify-sync') private readonly syncQueue: Queue,
  ) {}

  async importProducts(connectionId: string): Promise<void> {
    const connection = await this.em.findOneOrFail(ShopifyConnection, connectionId);

    connection.status = ShopifyConnectionStatus.SYNCING;
    await this.em.flush();

    try {
      const products = await this.fetchAllProducts(connection);

      for (const product of products) {
        await this.syncQueue.add('import-product', {
          connectionId,
          product,
        }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        });
      }

      connection.productCount = products.length;
      connection.lastSyncAt = new Date();
      connection.status = ShopifyConnectionStatus.CONNECTED;
    } catch (error) {
      connection.status = ShopifyConnectionStatus.ERROR;
      connection.lastErrorAt = new Date();
      connection.lastErrorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    } finally {
      await this.em.flush();
    }
  }

  async processProductImport(
    connectionId: string,
    shopifyProduct: ShopifyProduct,
  ): Promise<void> {
    const connection = await this.em.findOneOrFail(ShopifyConnection, connectionId, {
      populate: ['organization'],
    });

    for (const variant of shopifyProduct.variants) {
      // Check for existing mapping
      let mapping = await this.em.findOne(ShopifyProductMapping, {
        connection,
        shopifyProductId: shopifyProduct.id,
        shopifyVariantId: variant.id,
      });

      if (mapping) {
        // Update existing product
        await this.updateExistingProduct(connection, mapping, shopifyProduct, variant);
      } else {
        // Create new product and mapping
        const eurocomplyProductId = await this.createProduct(
          connection.organization.id,
          shopifyProduct,
          variant,
        );

        mapping = this.em.create(ShopifyProductMapping, {
          connection,
          shopifyProductId: shopifyProduct.id,
          shopifyVariantId: variant.id,
          eurocomplyProductId,
          shopifyGtin: variant.barcode || undefined,
          shopifySku: variant.sku || undefined,
          lastSyncedAt: new Date(),
        });

        this.em.persist(mapping);
      }
    }

    connection.syncedCount += 1;
    await this.em.flush();
  }

  private async fetchAllProducts(connection: ShopifyConnection): Promise<ShopifyProduct[]> {
    const accessToken = this.decryptToken(connection.accessToken);
    const products: ShopifyProduct[] = [];
    let pageInfo: string | null = null;

    do {
      const url = new URL(`https://${connection.shopDomain}/admin/api/2024-01/products.json`);
      url.searchParams.set('limit', '250');
      if (pageInfo) {
        url.searchParams.set('page_info', pageInfo);
      }

      const response = await fetch(url.toString(), {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '2', 10);
        await this.sleep(retryAfter * 1000);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.status}`);
      }

      const data = await response.json();
      products.push(...data.products);

      // Extract next page from Link header
      const linkHeader = response.headers.get('Link');
      pageInfo = this.extractNextPageInfo(linkHeader);
    } while (pageInfo);

    return products;
  }

  async syncDppToShopify(
    connectionId: string,
    eurocomplyProductId: string,
    dppData: {
      dppId: string;
      qrUrl: string;
      verifyUrl: string;
      status: string;
      completeness: number;
    },
  ): Promise<void> {
    const mapping = await this.em.findOneOrFail(ShopifyProductMapping, {
      connection: { id: connectionId },
      eurocomplyProductId,
    }, { populate: ['connection'] });

    const accessToken = this.decryptToken(mapping.connection.accessToken);

    // Update Shopify metafields
    const metafields = [
      { namespace: 'eurocomply', key: 'dpp_id', value: dppData.dppId, type: 'single_line_text_field' },
      { namespace: 'eurocomply', key: 'dpp_qr_url', value: dppData.qrUrl, type: 'url' },
      { namespace: 'eurocomply', key: 'dpp_verify_url', value: dppData.verifyUrl, type: 'url' },
      { namespace: 'eurocomply', key: 'dpp_status', value: dppData.status, type: 'single_line_text_field' },
      { namespace: 'eurocomply', key: 'completeness', value: String(dppData.completeness), type: 'number_integer' },
    ];

    for (const metafield of metafields) {
      await fetch(
        `https://${mapping.connection.shopDomain}/admin/api/2024-01/products/${mapping.shopifyProductId}/metafields.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ metafield }),
        },
      );
    }

    mapping.lastSyncedAt = new Date();
    await this.em.flush();
  }

  private decryptToken(encryptedToken: string): string {
    // Implementation uses tenant-specific encryption key
    const [iv, encrypted] = encryptedToken.split(':');
    const key = Buffer.from(process.env.SHOPIFY_TOKEN_KEY!, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
    return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
  }

  private extractNextPageInfo(linkHeader: string | null): string | null {
    if (!linkHeader) return null;
    const match = linkHeader.match(/page_info=([^>&]+).*rel="next"/);
    return match ? match[1] : null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async createProduct(
    organizationId: string,
    shopifyProduct: ShopifyProduct,
    variant: ShopifyProduct['variants'][0],
  ): Promise<string> {
    // Creates product in Design workspace (Product Registry)
    // Implementation delegates to ProductService
    throw new Error('Implemented in ProductService');
  }

  private async updateExistingProduct(
    connection: ShopifyConnection,
    mapping: ShopifyProductMapping,
    shopifyProduct: ShopifyProduct,
    variant: ShopifyProduct['variants'][0],
  ): Promise<void> {
    // Updates product based on conflict resolution mode
    // Implementation delegates to ProductService
    throw new Error('Implemented in ProductService');
  }
}
```

### Shopify Metafields (DPP Display)

```liquid
{% comment %} Shopify theme integration {% endcomment %}
{% if product.metafields.eurocomply.dpp_qr_url %}
  <div class="dpp-badge">
    <img
      src="{{ product.metafields.eurocomply.dpp_qr_url }}"
      alt="Digital Product Passport QR Code"
      width="120"
      height="120"
    />
    <a href="{{ product.metafields.eurocomply.dpp_verify_url }}" target="_blank">
      View Product Passport
    </a>
    {% if product.metafields.eurocomply.completeness %}
      <span class="completeness">
        {{ product.metafields.eurocomply.completeness }}% Complete
      </span>
    {% endif %}
  </div>
{% endif %}
```

---

## 6. EU Infrastructure Integration

### Standards Alignment

| Component | EuroComply | EU Requirement | Gap |
|-----------|------------|----------------|-----|
| Credentials | W3C Verifiable Credentials | W3C VCs | None |
| Product IDs | GS1 GTIN | GS1 GTIN | None |
| URLs | GS1 Digital Link | GS1 Digital Link | None |
| Data Format | JSON-LD | JSON-LD | None |
| Identity | did:key | did:ebsi preferred | Add EBSI registration |

### Identity Strategy: did:key → did:ebsi

```
┌─────────────────────────────────────────────────────────────────┐
│                    DID METHOD COMPARISON                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  did:key (Default)                                              │
│  ─────────────────                                              │
│  • Self-contained (public key in DID)                           │
│  • Works offline                                                │
│  • Instant creation                                             │
│  • Free                                                         │
│  • Trust: Cryptographic ("signature is valid")                  │
│                                                                  │
│  did:ebsi (Optional Upgrade)                                    │
│  ──────────────────────────                                     │
│  • Same cryptographic key                                       │
│  • Registered on EBSI blockchain                                │
│  • Listed in Trusted Issuers Registry                           │
│  • Trust: EU Government + Cryptographic                         │
│  • Useful for: EU customs, market surveillance                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### EBSI Trust Hierarchy

```
                    ┌─────────────────────┐
                    │   Root TAO          │
                    │   (EU Commission)   │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
     │    TAO      │  │    TAO      │  │ (EuroComply │
     │  (Member    │  │  (Member    │  │  optional)  │
     │   State)    │  │   State)    │  └──────┬──────┘
     └──────┬──────┘  └──────┬──────┘         ▼
            ▼                ▼         ┌─────────────┐
     ┌─────────────┐  ┌─────────────┐  │   Trusted   │
     │   Trusted   │  │   Trusted   │  │   Issuer    │
     │   Issuer    │  │   Issuer    │  │ (Customer)  │
     │ (Customer)  │  │ (Customer)  │  └─────────────┘
     └─────────────┘  └─────────────┘

TAO = Trusted Accreditation Organization
```

### EBSI Registration Service

```typescript
import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import { OrganizationDID, EbsiRegistration } from '../entities';

interface EbsiTirEntry {
  did: string;
  accreditations: string[];
  attributes: Record<string, unknown>;
}

@Injectable()
export class EbsiIntegrationService {
  private readonly logger = new Logger(EbsiIntegrationService.name);
  private readonly ebsiApiUrl = process.env.EBSI_API_URL || 'https://api.ebsi.eu';

  constructor(private readonly em: EntityManager) {}

  /**
   * Register organization's did:key as did:ebsi
   * Requires prior TAO accreditation
   */
  async registerDidEbsi(
    organizationDidId: string,
    accreditationVc: string,
  ): Promise<EbsiRegistration> {
    const orgDid = await this.em.findOneOrFail(OrganizationDID, organizationDidId, {
      populate: ['organization'],
    });

    // Same key, new identifier format
    const didEbsi = await this.deriveEbsiDid(orgDid.did, orgDid.publicKeyJwk);

    // Register on EBSI ledger
    const tirEntry = await this.registerOnLedger(didEbsi, accreditationVc);

    const registration = this.em.create(EbsiRegistration, {
      organizationDid: orgDid,
      didEbsi,
      tirEntry: tirEntry.did,
      accreditedBy: this.extractAccreditor(accreditationVc),
      registeredAt: new Date(),
      accreditations: tirEntry.accreditations,
      attributes: tirEntry.attributes,
    });

    await this.em.persistAndFlush(registration);

    this.logger.log(`Registered did:ebsi for organization ${orgDid.organization.id}: ${didEbsi}`);

    return registration;
  }

  /**
   * Verify credential with EBSI trust anchor
   */
  async verifyWithEbsiTrust(issuerDid: string): Promise<{
    signatureValid: boolean;
    trustedIssuer: boolean;
    accreditedForDpp: boolean;
    issuerInfo?: Record<string, unknown>;
  }> {
    // did:key is always cryptographically valid but not EU-anchored
    if (!issuerDid.startsWith('did:ebsi:')) {
      return {
        signatureValid: true,
        trustedIssuer: false,
        accreditedForDpp: false,
      };
    }

    // Check Trusted Issuers Registry
    const tirEntry = await this.getTrustedIssuer(issuerDid);

    return {
      signatureValid: true,
      trustedIssuer: !!tirEntry,
      accreditedForDpp: tirEntry?.accreditations.includes('DigitalProductPassport') ?? false,
      issuerInfo: tirEntry?.attributes,
    };
  }

  private async getTrustedIssuer(didEbsi: string): Promise<EbsiTirEntry | null> {
    const response = await fetch(
      `${this.ebsiApiUrl}/trusted-issuers-registry/v4/issuers/${encodeURIComponent(didEbsi)}`,
    );

    if (!response.ok) {
      return null;
    }

    return response.json();
  }

  private async deriveEbsiDid(
    didKey: string,
    publicKeyJwk: Record<string, unknown>,
  ): Promise<string> {
    // EBSI uses the same key but different identifier format
    // Implementation follows EBSI DID method specification
    throw new Error('Implemented using @cef-ebsi/did library');
  }

  private async registerOnLedger(
    didEbsi: string,
    accreditationVc: string,
  ): Promise<EbsiTirEntry> {
    // Calls EBSI APIs to register DID on ledger
    throw new Error('Implemented using EBSI conformance library');
  }

  private extractAccreditor(accreditationVc: string): string {
    // Extract TAO DID from accreditation VC
    throw new Error('Implemented using VC parsing');
  }
}
```

### EU DPP Registry Integration

```
┌─────────────────────────────────────────────────────────────────┐
│  WHO HOSTS WHAT                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  EU REGISTRY (Index only):                                      │
│  • Product GTIN                                                 │
│  • DPP URL (points to us)                                       │
│  • Operator information                                         │
│  • Registration timestamp                                       │
│  • Status (active, revoked)                                     │
│                                                                  │
│  EUROCOMPLY (Full content):                                     │
│  • Verifiable Credential (signed)                               │
│  • Product attributes (taxonomy-driven)                         │
│  • Attestations                                                 │
│  • Human-readable page                                          │
│  • QR code                                                      │
│                                                                  │
│  RESULT: EU provides discovery, we provide content              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### EU Registry Service

```typescript
import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EuRegistryRecord, EuRegistryStatus, DPPSnapshot } from '../entities';

interface EuRegistrySubmission {
  gtin: string;
  dppUrl: string;
  operatorId: string;
  operatorName: string;
  productCategory: string; // Taxonomy ID (e.g., "APPAREL.SHIRTS") - EU maps to their nomenclature
  issueDate: string;
}

@Injectable()
export class EuRegistryService {
  private readonly logger = new Logger(EuRegistryService.name);
  private readonly registryApiUrl = process.env.EU_REGISTRY_API_URL;

  constructor(
    private readonly em: EntityManager,
    @InjectQueue('eu-registry') private readonly registryQueue: Queue,
  ) {}

  /**
   * Register DPP with EU Registry (called after DPP issuance)
   */
  async registerDpp(snapshotId: string): Promise<EuRegistryRecord> {
    const snapshot = await this.em.findOneOrFail(DPPSnapshot, snapshotId, {
      populate: ['product', 'product.organization'],
    });

    // Check if already registered
    let record = await this.em.findOne(EuRegistryRecord, {
      snapshot,
    });

    if (!record) {
      record = this.em.create(EuRegistryRecord, {
        organization: snapshot.product.organization,
        snapshot,
        gtin: snapshot.gtin,
        status: EuRegistryStatus.PENDING,
      });
      this.em.persist(record);
    }

    // Queue async registration
    await this.registryQueue.add('register', {
      recordId: record.id,
    }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 60_000 },
    });

    await this.em.flush();
    return record;
  }

  async processRegistration(recordId: string): Promise<void> {
    const record = await this.em.findOneOrFail(EuRegistryRecord, recordId, {
      populate: ['snapshot', 'organization'],
    });

    const submission: EuRegistrySubmission = {
      gtin: record.gtin,
      dppUrl: `https://dpp.eurocomply.eu/01/${record.gtin}`,
      operatorId: record.organization.euOperatorId || record.organization.id,
      operatorName: record.organization.name,
      productCategory: record.snapshot.designData.category,
      issueDate: record.snapshot.issuedAt?.toISOString() || new Date().toISOString(),
    };

    try {
      const response = await fetch(`${this.registryApiUrl}/v1/registrations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.EU_REGISTRY_API_KEY}`,
        },
        body: JSON.stringify(submission),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`EU Registry API error: ${response.status} - ${errorBody}`);
      }

      const result = await response.json();

      record.euRegistryId = result.registrationId;
      record.status = EuRegistryStatus.REGISTERED;
      record.registeredAt = new Date();
      record.registryResponse = result;

      this.logger.log(`DPP registered with EU Registry: ${record.gtin} -> ${result.registrationId}`);
    } catch (error) {
      record.status = EuRegistryStatus.FAILED;
      record.errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    } finally {
      await this.em.flush();
    }
  }

  /**
   * Batch-register existing DPPs (migration use case)
   */
  async batchRegisterExisting(organizationId: string): Promise<number> {
    const unregisteredSnapshots = await this.em.find(DPPSnapshot, {
      product: { organization: { id: organizationId } },
      status: 'ISSUED',
    });

    // Filter to those without EU Registry records
    const snapshotIds = unregisteredSnapshots.map((s) => s.id);
    const existingRecords = await this.em.find(EuRegistryRecord, {
      snapshot: { id: { $in: snapshotIds } },
    });
    const registeredIds = new Set(existingRecords.map((r) => r.snapshot.id));

    let queued = 0;
    for (const snapshot of unregisteredSnapshots) {
      if (!registeredIds.has(snapshot.id)) {
        await this.registerDpp(snapshot.id);
        queued++;
      }
    }

    return queued;
  }
}
```

---

## 7. EUDI Wallet Integration

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     EXISTING EUROCOMPLY                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PostgreSQL              DynamoDB            Cloudflare R2      │
│  ┌──────────────┐       ┌──────────────┐    ┌──────────────┐   │
│  │ Product Data │       │ EPCIS Events │    │ DPP Templates│   │
│  │ (immutable)  │       │ (lifecycle)  │    │ (rendering)  │   │
│  └──────┬───────┘       └──────┬───────┘    └──────────────┘   │
│         │                      │                                 │
│         ▼                      ▼                                 │
│  ┌─────────────────────────────────────┐                        │
│  │         W3C VC Issuance             │                        │
│  │         (did:key signing)           │                        │
│  └──────────────────┬──────────────────┘                        │
│                     │                                            │
└─────────────────────┼────────────────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
┌──────────────────┐    ┌─────────────────────┐
│   QR/DPP Page    │    │   NEW: Wallet       │
│   (existing)     │    │   Integration       │
└──────────────────┘    │   (OID4VCI)         │
                        └─────────────────────┘
```

### SD-JWT-VC Format

The wallet receives credentials in SD-JWT-VC format, converted on-the-fly from W3C VCs:

```json
{
  "iss": "did:key:z6Mkh...",
  "iat": 1705312800,
  "exp": 2020672800,
  "vct": "https://eurocomply.eu/dpp/v1",
  "credentialSubject": {
    "id": "urn:epc:id:sgtin:5901234.123457.ABC123",
    "type": "DigitalProductPassport",
    "category": "apparel.tops.tshirts",
    "productId": "5901234123457",
    "_sd": ["..."]
  },
  "holderDid": "did:key:z6Mkw...",
  "eventsEndpoint": "https://api.eurocomply.eu/epcis/5901234123457/ABC123",
  "transferable": true,
  "disclosurePolicy": "urn:eurocomply:policy:abc123"
}
```

### Issuance Flow (QR Scan)

```
Consumer scans product QR
         │
         ▼
┌─────────────────────────┐
│   DPP Page loads        │
│   [Add to Wallet] button│
└───────────┬─────────────┘
            │ click
            ▼
┌─────────────────────────┐
│  OID4VCI offer created  │
│  (credential_offer URI) │
└───────────┬─────────────┘
            │ deep link
            ▼
┌─────────────────────────┐
│  EUDI Wallet opens      │
│  Shows credential preview│
│  User confirms          │
└───────────┬─────────────┘
            │ accept
            ▼
┌─────────────────────────┐
│  Wallet calls EuroComply│
│  OID4VCI token endpoint │
│  Receives SD-JWT-VC     │
└───────────┬─────────────┘
            │
            ▼
    DPP now in wallet
    Holder DID registered
```

### Wallet Issuance Service

```typescript
import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  WalletHolder,
  WalletTransferCode,
  DisclosurePolicy,
  IssuedCredential,
  DPPSnapshot,
} from '../entities';

interface CredentialOffer {
  credential_issuer: string;
  credentials: string[];
  grants: {
    'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
      'pre-authorized_code': string;
    };
  };
}

interface SdJwtVc {
  iss: string;
  iat: number;
  exp: number;
  vct: string;
  credentialSubject: Record<string, unknown>;
  holderDid: string;
  eventsEndpoint: string;
  transferable: boolean;
  disclosurePolicy: string;
  _sd: string[];
}

@Injectable()
export class WalletIssuanceService {
  private readonly logger = new Logger(WalletIssuanceService.name);
  private readonly issuerUrl = process.env.CREDENTIAL_ISSUER_URL || 'https://api.eurocomply.eu';

  constructor(private readonly em: EntityManager) {}

  /**
   * Create OID4VCI credential offer for "Add to Wallet" button
   */
  async createCredentialOffer(
    credentialId: string,
    serialNumber?: string,
  ): Promise<{ offer: CredentialOffer; offerUri: string }> {
    const credential = await this.em.findOneOrFail(IssuedCredential, credentialId, {
      populate: ['snapshot', 'organization'],
    });

    const preAuthCode = randomBytes(32).toString('base64url');

    // Store pre-auth code for exchange
    await this.storePreAuthCode(preAuthCode, credentialId, serialNumber);

    const offer: CredentialOffer = {
      credential_issuer: this.issuerUrl,
      credentials: ['DigitalProductPassport'],
      grants: {
        'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
          'pre-authorized_code': preAuthCode,
        },
      },
    };

    const offerUri = `openid-credential-offer://?credential_offer=${encodeURIComponent(
      JSON.stringify(offer),
    )}`;

    return { offer, offerUri };
  }

  /**
   * Issue SD-JWT-VC to wallet (called by wallet after OID4VCI flow)
   */
  async issueToWallet(
    preAuthCode: string,
    holderDid: string,
  ): Promise<{ sdJwtVc: string; holder: WalletHolder }> {
    const { credentialId, serialNumber } = await this.retrievePreAuthCode(preAuthCode);

    const credential = await this.em.findOneOrFail(IssuedCredential, credentialId, {
      populate: ['snapshot', 'organization', 'statusList'],
    });

    // Get disclosure policy for product family
    const policy = await this.getDisclosurePolicy(
      credential.organization.id,
      credential.snapshot.designData.productFamilyId,
    );

    // Convert W3C VC to SD-JWT-VC
    const sdJwtVc = await this.convertToSdJwtVc(
      credential,
      serialNumber,
      holderDid,
      policy,
    );

    // Register holder
    const holder = this.em.create(WalletHolder, {
      organization: credential.organization,
      credential,
      gtin: credential.snapshot.gtin,
      serialNumber,
      holderDid,
      credentialHash: this.hashCredential(sdJwtVc),
      issuedAt: new Date(),
    });

    await this.em.persistAndFlush(holder);

    this.logger.log(`Issued DPP to wallet: ${credential.id} -> ${holderDid.substring(0, 20)}...`);

    return { sdJwtVc, holder };
  }

  /**
   * Initiate ownership transfer
   */
  async initiateTransfer(holderId: string): Promise<WalletTransferCode> {
    const holder = await this.em.findOneOrFail(WalletHolder, holderId);

    if (holder.revokedAt) {
      throw new Error('Credential already revoked');
    }

    const code = this.generateTransferCode();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const transferCode = this.em.create(WalletTransferCode, {
      holder,
      code,
      expiresAt,
    });

    await this.em.persistAndFlush(transferCode);

    return transferCode;
  }

  /**
   * Claim transferred credential
   */
  async claimTransfer(
    code: string,
    newHolderDid: string,
  ): Promise<{ sdJwtVc: string; newHolder: WalletHolder }> {
    const transferCode = await this.em.findOneOrFail(
      WalletTransferCode,
      { code },
      { populate: ['holder', 'holder.credential', 'holder.organization'] },
    );

    if (transferCode.expiresAt < new Date()) {
      throw new Error('Transfer code expired');
    }

    if (transferCode.claimedAt) {
      throw new Error('Transfer code already claimed');
    }

    const oldHolder = transferCode.holder;
    const credential = oldHolder.credential;

    // Revoke old holder's credential
    oldHolder.revokedAt = new Date();

    // Mark transfer code as claimed
    transferCode.claimedAt = new Date();
    transferCode.claimedByDid = newHolderDid;

    // Get disclosure policy
    const policy = await this.getDisclosurePolicy(
      credential.organization.id,
      credential.snapshot.designData.productFamilyId,
    );

    // Issue new credential to new holder
    const sdJwtVc = await this.convertToSdJwtVc(
      credential,
      oldHolder.serialNumber,
      newHolderDid,
      policy,
    );

    // Create new holder record
    const newHolder = this.em.create(WalletHolder, {
      organization: credential.organization,
      credential,
      gtin: oldHolder.gtin,
      serialNumber: oldHolder.serialNumber,
      holderDid: newHolderDid,
      credentialHash: this.hashCredential(sdJwtVc),
      issuedAt: new Date(),
      transferFromId: oldHolder.id,
    });

    await this.em.persistAndFlush(newHolder);

    // Record EPCIS ownership_transfer event
    await this.recordTransferEvent(oldHolder, newHolder);

    this.logger.log(
      `Ownership transferred: ${oldHolder.holderDid.substring(0, 20)}... -> ${newHolderDid.substring(0, 20)}...`,
    );

    return { sdJwtVc, newHolder };
  }

  private async convertToSdJwtVc(
    credential: IssuedCredential,
    serialNumber: string | undefined,
    holderDid: string,
    policy: DisclosurePolicy | null,
  ): Promise<string> {
    const snapshot = credential.snapshot;

    // Build credential subject with selective disclosure
    const mandatoryClaims = policy?.mandatoryClaims ?? ['id', 'type', 'category', 'productId'];
    const disclosableClaims = policy?.disclosableClaims ?? [];

    const credentialSubject: Record<string, unknown> = {
      id: `urn:epc:id:sgtin:${snapshot.gtin}${serialNumber ? `.${serialNumber}` : ''}`,
      type: 'DigitalProductPassport',
      category: snapshot.designData.category,
      productId: snapshot.gtin,
    };

    // Add all product attributes as selectively disclosable
    const allAttributes = {
      ...snapshot.designData.specifications,
      ...snapshot.marketingData,
      ...snapshot.operationsData,
    };

    const sdClaims: string[] = [];
    for (const [key, value] of Object.entries(allAttributes)) {
      if (!mandatoryClaims.includes(key)) {
        // This becomes a selectively disclosable claim
        sdClaims.push(this.createSdClaim(key, value));
      } else {
        credentialSubject[key] = value;
      }
    }

    const sdJwtPayload: SdJwtVc = {
      iss: credential.issuerDid,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 60 * 60, // 10 years
      vct: 'https://eurocomply.eu/dpp/v1',
      credentialSubject,
      holderDid,
      eventsEndpoint: `${this.issuerUrl}/epcis/${snapshot.gtin}${serialNumber ? `/${serialNumber}` : ''}`,
      transferable: true,
      disclosurePolicy: policy ? `urn:eurocomply:policy:${policy.id}` : 'urn:eurocomply:policy:default',
      _sd: sdClaims,
    };

    // Sign as SD-JWT
    return this.signSdJwt(sdJwtPayload, credential.issuerDid);
  }

  private async getDisclosurePolicy(
    organizationId: string,
    productFamilyId: string,
  ): Promise<DisclosurePolicy | null> {
    return this.em.findOne(DisclosurePolicy, {
      organization: { id: organizationId },
      productFamilyId,
    }, {
      orderBy: { version: 'DESC' },
    });
  }

  private generateTransferCode(): string {
    // 6-digit alphanumeric code
    return randomBytes(4).toString('hex').substring(0, 6).toUpperCase();
  }

  private createSdClaim(key: string, value: unknown): string {
    // SD-JWT claim creation - implementation uses @sd-jwt/core
    throw new Error('Implemented using @sd-jwt/core');
  }

  private signSdJwt(payload: SdJwtVc, issuerDid: string): Promise<string> {
    // Sign SD-JWT-VC - implementation uses @sd-jwt/core
    throw new Error('Implemented using @sd-jwt/core');
  }

  private hashCredential(sdJwtVc: string): string {
    // SHA-256 hash of credential for revocation tracking
    throw new Error('Implemented using crypto');
  }

  private async storePreAuthCode(
    code: string,
    credentialId: string,
    serialNumber?: string,
  ): Promise<void> {
    // Store in Redis with 10-minute TTL
    throw new Error('Implemented using Redis');
  }

  private async retrievePreAuthCode(
    code: string,
  ): Promise<{ credentialId: string; serialNumber?: string }> {
    // Retrieve from Redis and delete
    throw new Error('Implemented using Redis');
  }

  private async recordTransferEvent(
    oldHolder: WalletHolder,
    newHolder: WalletHolder,
  ): Promise<void> {
    // Record EPCIS ownership_transfer event
    throw new Error('Implemented using EPCIS service');
  }
}
```

### Verification Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    VERIFICATION FLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  VERIFIER (retailer, customs, recycler)                         │
│                                                                  │
│  1. Requests presentation from holder's wallet                  │
│     (OID4VP protocol)                                           │
│            │                                                     │
│            ▼                                                     │
│  2. Wallet shows holder which claims will be shared             │
│     Holder approves selective disclosure                        │
│            │                                                     │
│            ▼                                                     │
│  3. Verifier receives SD-JWT-VC with disclosed claims           │
│                                                                  │
│  4. Verifier checks:                                            │
│     ✓ Signature valid (EuroComply issuer DID)                   │
│     ✓ Credential not expired                                    │
│     ✓ Not revoked (check status list)                           │
│     ✓ Holder DID matches presenter                              │
│            │                                                     │
│            ▼                                                     │
│  5. OPTIONAL: Fetch live lifecycle data                         │
│     GET {eventsEndpoint}                                        │
│     Authorization: Bearer {credential_hash}                     │
│            │                                                     │
│            ▼                                                     │
│     Returns: EPCIS events (manufactured, shipped, sold...)      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Public API (Unauthenticated)

### ESPR Article 31 Compliance

Free DPP access is mandated by ESPR Article 31 for all economic operators.

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/public/dpp/gtin/{gtin}` | Lookup by GTIN |
| GET | `/api/v1/public/dpp/gtin/{gtin}/serial/{serial}` | Item-level lookup |
| GET | `/api/v1/public/dpp/brand/{brand}/sku/{sku}` | Lookup by brand/SKU |
| POST | `/api/v1/public/dpp/batch` | Batch lookup (max 100) |
| GET | `/api/v1/public/dpp/search` | Search catalog |

### Rate Limits

| Client | Limit | Batch Size |
|--------|-------|------------|
| Anonymous | 60/min | 10 |
| Registered (free API key) | 300/min | 100 |

### Embeddable Widget

```html
<!-- Lookup by GTIN -->
<div
  id="eurocomply-dpp"
  data-gtin="5901234123457"
></div>
<script src="https://cdn.eurocomply.eu/widget.js" async></script>

<!-- Lookup by brand + SKU -->
<div
  id="eurocomply-dpp"
  data-brand="acme"
  data-sku="SHIRT-001"
></div>
<script src="https://cdn.eurocomply.eu/widget.js" async></script>
```

---

## 9. Retailer App (Free)

### ESPR Article 31 Mandate

Retailers need free access to display DPPs on their product pages.

### Automatic Matching

| Method | Priority |
|--------|----------|
| GTIN/EAN | Primary |
| Brand + SKU | Fallback |
| Serial Number | Item-level |

### Features

- Dashboard showing matched products
- DPP preview for each product
- Auto-inject DPP widget into product pages
- Customizable display position and styling
- No EuroComply account required for customers

---

## 10. Integration Testing

### Shopify Test Matrix

| Scenario | Test |
|----------|------|
| OAuth flow | Connect, disconnect, reconnect |
| Product import | New products, variants, images |
| Conflict resolution | Each mode, each field type |
| Webhook processing | All event types |
| Rate limiting | Throttle compliance |
| Token refresh | Expiry, revocation |

### EUDI Wallet Test Matrix

| Scenario | Test |
|----------|------|
| Credential offer | QR scan, deep link |
| Issuance | Full OID4VCI flow |
| Ownership transfer | Code generation, claim, revocation |
| Verification | OID4VP presentation |
| Events endpoint | Auth, rate limiting |

### EU Registry Test Matrix

| Scenario | Test |
|----------|------|
| Registration | Single DPP, batch |
| Error handling | API failures, retries |
| Status sync | Updates, revocations |

---

## 11. Related Documents

| Document | Purpose |
|----------|---------|
| [Architecture](./01-architecture.md) | System architecture |
| [Security](./03-security.md) | Auth, API keys, encryption |
| [Compliance Workspace](./08-compliance-workspace.md) | DPP issuance |
| [Verifiable Credentials](./09-verifiable-credentials.md) | VC structure, signing |
| [Billing](./12-billing.md) | API usage metering |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-21 | Consolidated from API, EU Integration, EUDI Wallet, E-commerce designs |
