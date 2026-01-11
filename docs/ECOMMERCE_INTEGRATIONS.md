# E-commerce Integrations

EuroComply provides Shopify integration for both brands creating DPPs and retailers displaying them.

## Overview

| Integration | User Type | Cost | Purpose |
|-------------|-----------|------|---------|
| Shopify Syndication | Brands, Manufacturers | Included in paid plans | Sync products and DPP data to Shopify |
| Shopify Retailer App | Retailers | Free | Display DPPs from other brands |
| Embeddable Widget | Any website | Free | Display DPPs on any product page |
| Public API | Developers | Free | Programmatic DPP lookup |

---

## Workspace Integration

Shopify data contains both technical and commercial information. The Import module intelligently routes incoming data to the appropriate workspaces and modules:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SHOPIFY IMPORT → SMART ROUTING                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SHOPIFY STORE                                                               │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         IMPORT MODULE                                    ││
│  │                    (Shared across workspaces)                            ││
│  │                                                                          ││
│  │  Analyzes incoming data and routes to appropriate modules:               ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│       │                              │                              │        │
│       ▼                              ▼                              ▼        │
│  ┌──────────────┐           ┌──────────────┐           ┌──────────────┐     │
│  │   REGISTRY   │           │     PIM      │           │   DAM-Media  │     │
│  │   (Design)   │           │  (Marketing) │           │  (Marketing) │     │
│  │              │           │              │           │              │     │
│  │  • SKU       │           │  • Title     │           │  • Images    │     │
│  │  • GTIN      │           │  • Desc      │           │  • Videos    │     │
│  │  • Vendor    │           │  • Price     │           │              │     │
│  │  • Type      │           │  • Tags      │           │              │     │
│  └──────────────┘           └──────────────┘           └──────────────┘     │
│                                                                              │
│  After import, user enriches in appropriate workspace:                       │
│  • Design: Add materials, BOMs, certifications, technical specs            │
│  • Marketing: Improve descriptions, add SEO content, localize              │
│  • Operations: Add EPCIS events, batch tracking                            │
│  • Compliance: Review completeness, approve DPP issuance                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

| Shopify Field | Routes To | Module | Workspace |
|---------------|-----------|--------|-----------|
| variants[].sku | Technical identity | Registry | Design |
| variants[].barcode | GTIN identifier | Registry | Design |
| vendor | Manufacturer info | Registry | Design |
| product_type | Product classification | Registry | Design |
| title | Commercial content | PIM | Marketing |
| body_html | Product description | PIM | Marketing |
| variants[].price | Pricing | PIM | Marketing |
| tags | Categorization | PIM | Marketing |
| images | Media assets | DAM-Media | Marketing |

**Key Insight**: Shopify is primarily a sales channel, so it contains mostly commercial data. After import, users typically need to enrich products in the Design workspace with sustainability data (materials, certifications, carbon footprint) before DPP issuance is possible.

---

## Integration Types

### For Brands and Manufacturers (Paid)

Brands and manufacturers who create DPPs can sync their product catalog with Shopify:

- Bi-directional product sync between EuroComply and Shopify
- DPP metadata pushed to Shopify product metafields
- QR codes available for product pages
- Rate-limited sync via BullMQ job queue

### For Retailers (Free)

Retailers who sell products from brands using EuroComply can display DPPs without a paid subscription:

- Shopify Retailer App automatically matches products by GTIN
- Embeddable widget for any e-commerce platform
- Public API for custom integrations
- No technical knowledge required

---

## Shopify Syndication (For Brands)

This integration is for brands, manufacturers, and distributors who create DPPs and want to sync them to their Shopify store.

### For Organizations

**Connection (2 minutes):**
1. Go to EuroComply Dashboard → Marketing → Channels → Add Shopify
2. Enter your Shopify store URL
3. Authorize the required permissions
4. Products are automatically imported and routed to appropriate modules

**What happens:**
- Import module routes data to Registry (Design) and PIM (Marketing)
- Technical identity (SKU, GTIN) → Registry
- Commercial content (title, description, price) → PIM
- Media assets (images) → DAM-Media
- User enriches products with sustainability data in Design workspace
- DPP data synced back to Shopify metafields after issuance
- QR codes available for product pages

### For Developers

#### OAuth Flow

```
GET /api/v1/syndication/shopify/auth?shop=mystore.myshopify.com
→ Redirects to Shopify OAuth
→ Returns to /api/v1/syndication/shopify/callback
→ Exchanges code for access token
→ Creates channel & imports products
→ Redirects to dashboard
```

#### Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/syndication/shopify/auth` | None | Start OAuth flow |
| GET | `/api/v1/syndication/shopify/callback` | None | OAuth callback |
| POST | `/api/v1/syndication/shopify/webhooks/:topic` | HMAC | Webhook handler |
| GET | `/api/v1/syndication/shopify/status` | API Key | Get connection status |
| POST | `/api/v1/syndication/shopify/sync` | API Key | Manual product sync |
| POST | `/api/v1/syndication/shopify/disconnect` | API Key | Disconnect store |

#### Environment Variables

```env
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
API_HOST=api.eurocomply.eu
DASHBOARD_URL=https://eurocomply.eu
```

#### Required Scopes

```
read_products
write_products    # For metafields (DPP data)
read_inventory
```

#### Webhooks

The app subscribes to these webhooks:
- `products/create` - Import new products
- `products/update` - Update existing products
- `products/delete` - Archive products
- `app/uninstalled` - Clean up on uninstall

---

## Product Sync Details

### What Gets Synced (By Workspace)

| Shopify Field | EuroComply Module | Workspace | Direction |
|---------------|-------------------|-----------|-----------|
| **REGISTRY (Technical Identity)** | | | |
| variants[].sku | Registry.sku | Design | ↔ Bi-directional |
| variants[].barcode | Registry.gtin | Design | ↔ Bi-directional |
| vendor | Registry.manufacturer | Design | → Import only |
| product_type | Registry.productType | Design | → Import only |
| **PIM (Commercial Content)** | | | |
| title | PIM.name | Marketing | ↔ Bi-directional |
| body_html | PIM.description | Marketing | ↔ Bi-directional |
| variants[].price | PIM.price | Marketing | ↔ Bi-directional |
| tags | PIM.tags | Marketing | ↔ Bi-directional |
| **DAM-Media (Assets)** | | | |
| images | DAM-Media.assets | Marketing | → Import only |
| **DPP (Compliance Output)** | | | |
| metafields.eurocomply.* | Compliance.dppData | Compliance | ← Export only |

### Sync Behavior

- **Initial Sync**: All active products imported on connection, routed to Registry + PIM
- **Ongoing Sync**: Webhooks keep products in sync automatically
- **Manual Sync**: Trigger via API or dashboard (Marketing workspace → Channels)
- **Rate Limiting**: BullMQ queue respects Shopify's 2 req/sec limit
- **Deletions**: Products are archived, not deleted (audit trail)

### Post-Import Enrichment

After Shopify import, products typically need enrichment before DPP issuance:

| Workspace | What to Add | Required for DPP? |
|-----------|-------------|-------------------|
| **Design** | Materials, BOMs, sustainability properties, certifications | Yes |
| **Operations** | EPCIS events, batch/lot tracking, serial numbers | Category-dependent |
| **Marketing** | Improved descriptions, SEO, localized content | Recommended |
| **Compliance** | Review and approve for DPP issuance | Yes |

---

## DPP Data in Shopify

### Metafields

DPP data is stored in product metafields (namespace: `eurocomply`):

| Metafield | Description |
|-----------|-------------|
| `eurocomply.dpp_id` | DPP identifier |
| `eurocomply.dpp_qr_url` | QR code image URL |
| `eurocomply.dpp_verify_url` | Public verification page URL |
| `eurocomply.dpp_status` | Status (ACTIVE, DRAFT, etc.) |
| `eurocomply.completeness` | Data completeness score (0-100) |

### Display in Theme

```liquid
{% if product.metafields.eurocomply.dpp_qr_url %}
  <div class="dpp-badge">
    <h4>Digital Product Passport</h4>
    <img
      src="{{ product.metafields.eurocomply.dpp_qr_url }}"
      alt="Scan for Digital Product Passport"
      width="120"
      height="120"
    >
    <a href="{{ product.metafields.eurocomply.dpp_verify_url }}" target="_blank">
      View Product Passport
    </a>
    <p>Completeness: {{ product.metafields.eurocomply.completeness }}%</p>
  </div>
{% endif %}
```

---

## API Response Examples

### Connection Status

```json
{
  "success": true,
  "data": {
    "id": "chan_xxx",
    "type": "SHOPIFY",
    "status": "ACTIVE",
    "shop": "mystore.myshopify.com",
    "connectedAt": "2026-01-06T10:00:00Z",
    "lastSyncAt": "2026-01-06T12:00:00Z",
    "stats": {
      "productCount": 150,
      "syncedCount": 145,
      "pendingCount": 5,
      "errorCount": 0
    }
  }
}
```

### Sync Result

```json
{
  "success": true,
  "data": {
    "jobId": "job_xxx",
    "status": "COMPLETED",
    "stats": {
      "total": 150,
      "created": 10,
      "updated": 140,
      "skipped": 0,
      "failed": 0
    },
    "duration": 45000
  }
}
```

---

## Rate Limiting

Shopify enforces strict API rate limits:
- **REST API**: 2 requests per second (burst bucket of 40)
- **GraphQL**: 50 points per second

### BullMQ Worker Configuration

```typescript
const shopifyWorker = new Worker('sync:shopify', processor, {
  limiter: {
    max: 2,
    duration: 1000
  },
  concurrency: 1
});
```

### Handling 429 Errors

The sync worker implements exponential backoff:
1. On 429 response, check `Retry-After` header
2. Pause processing for specified duration
3. Retry with exponential backoff (max 5 retries)

---

## Troubleshooting

### Common Issues

**"Invalid HMAC signature"**
- Check API secret is correct
- Ensure raw request body is used for webhook verification

**"App not authorized"**
- User may have revoked access
- Trigger re-authorization via OAuth flow

**"Rate limit exceeded"**
- Sync job will automatically retry
- Check BullMQ dashboard for job status

**"Product not syncing"**
- Check product status in Shopify (must be Active)
- Verify product has SKU set
- Check sync job logs for errors

### Debug Logging

Enable verbose logging for troubleshooting:

```env
LOG_LEVEL=debug
SHOPIFY_DEBUG=true
```

---

## Security Considerations

1. **Encrypt stored credentials** - Access tokens stored encrypted in database
2. **Verify all webhooks** - Check HMAC signatures before processing
3. **Use HTTPS only** - Reject HTTP callbacks
4. **Audit all access** - Log all sync operations to AuditLog
5. **Scope permissions** - Request minimum required OAuth scopes
6. **Token rotation** - Refresh tokens before expiration

---

## Shopify Retailer App (Free)

The Shopify Retailer App enables retailers to display DPPs for products they sell from brands using EuroComply. This app is provided free of charge in compliance with ESPR Article 31, which mandates free DPP access for all economic operators.

### Installation

Retailers install the app from the Shopify App Store. No EuroComply subscription is required.

### Automatic Product Matching

Once installed, the app automatically matches products in the retailer's store to available DPPs in the EuroComply database. Matching is performed using:

- **GTIN/EAN**: Primary identifier, matched against product barcodes
- **Brand + SKU**: Fallback when GTIN is not available
- **Serial Number**: For item-level tracking (luxury goods, electronics)

### What Retailers See

- Dashboard showing matched products and their DPP status
- List of products without available DPPs
- DPP preview for each matched product

### Theme Integration

The app automatically injects DPP information into product pages. Retailers can customize the display position and styling through the app settings.

### Webhooks

The app listens for product changes in the retailer's store and re-matches products when barcodes or SKUs are updated.

---

## Embeddable Widget

The embeddable widget allows any website to display DPPs without installing a Shopify app. This is suitable for retailers using WooCommerce, Magento, custom platforms, or static websites.

### Registration

Retailers register for a free EuroComply account to access the widget. Registration requires basic company information but no payment details.

### Widget Integration

After registration, retailers receive a JavaScript snippet to add to their product pages. The widget accepts a product identifier and displays the corresponding DPP information.

### Lookup Methods

The widget supports three lookup methods:

| Method | Parameter | Example |
|--------|-----------|---------|
| GTIN | `data-gtin` | `data-gtin="5901234123457"` |
| Brand + SKU | `data-brand` + `data-sku` | `data-brand="acme" data-sku="SHIRT-001"` |
| Serial Number | `data-serial` | `data-serial="SN123456789"` |

### Display Options

The widget renders DPP information including:

- Product name and brand
- Material composition
- Carbon footprint
- Certifications
- QR code linking to full DPP
- Verification status

Retailers can customize colors and styling to match their website design.

### Caching

Widget requests are cached at the CDN level to minimize latency and ensure fast page loads.

---

## Public API

The Public API provides programmatic access to DPP data for developers building custom integrations.

### Authentication

The Public API does not require API keys for read-only DPP lookups. Rate limiting is applied per IP address.

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/public/dpp/gtin/:gtin` | Lookup DPP by GTIN |
| GET | `/api/v1/public/dpp/brand/:brand/sku/:sku` | Lookup DPP by brand and SKU |
| GET | `/api/v1/public/dpp/serial/:serial` | Lookup DPP by serial number |
| GET | `/api/v1/public/dpp/search` | Search DPP catalog |
| POST | `/api/v1/public/dpp/batch` | Batch lookup (up to 100 identifiers) |

### Response Format

```json
{
  "success": true,
  "data": {
    "id": "dpp_xxx",
    "gtin": "5901234123457",
    "brand": "Acme Corp",
    "productName": "Organic Cotton T-Shirt",
    "materials": [...],
    "certifications": [...],
    "carbonFootprint": {...},
    "qrCodeUrl": "https://cdn.eurocomply.eu/qr/xxx.png",
    "verifyUrl": "https://eurocomply.eu/verify/xxx",
    "issuedAt": "2026-01-06T10:00:00Z",
    "status": "ACTIVE"
  }
}
```

### Rate Limits

| Tier | Requests per minute | Batch size |
|------|---------------------|------------|
| Anonymous | 60 | 10 |
| Registered | 300 | 100 |

Retailers who register for a free account receive higher rate limits.

### Search Parameters

The search endpoint accepts the following query parameters:

| Parameter | Description |
|-----------|-------------|
| `q` | Free text search |
| `brand` | Filter by brand name |
| `category` | Filter by product category |
| `page` | Page number (default: 1) |
| `limit` | Results per page (max: 50) |

### Error Responses

| Code | Description |
|------|-------------|
| 404 | DPP not found for the given identifier |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

*Last Updated: 2026-01-11*
