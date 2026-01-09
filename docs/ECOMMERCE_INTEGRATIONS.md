# E-commerce Integrations

EuroComply provides native Shopify integration for syndicating product data and Digital Product Passports (DPPs) to e-commerce storefronts.

## Overview

| Platform | Integration Type | Auth Method | Status |
|----------|-----------------|-------------|--------|
| Shopify | OAuth App | OAuth 2.0 | Ready |

---

## What the Integration Does

1. **Bi-directional Product Sync** - Import products from Shopify, push updates back
2. **DPP Metadata Sync** - Push DPP data to Shopify product metafields
3. **QR Code Integration** - Add DPP QR codes to product pages
4. **Rate-Limited Sync** - BullMQ job queue respects Shopify API limits

---

## Shopify Integration

### For Organizations

**Connection (2 minutes):**
1. Go to EuroComply Dashboard → Channels → Add Shopify
2. Enter your Shopify store URL
3. Authorize the required permissions
4. Products are automatically imported

**What happens:**
- Products imported to EuroComply as Golden Records
- DPP data synced back to Shopify metafields
- QR codes available for product pages

### For Developers

#### OAuth Flow

```
GET /api/syndication/shopify/auth?shop=mystore.myshopify.com
→ Redirects to Shopify OAuth
→ Returns to /api/syndication/shopify/callback
→ Exchanges code for access token
→ Creates channel & imports products
→ Redirects to dashboard
```

#### Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/syndication/shopify/auth` | None | Start OAuth flow |
| GET | `/api/syndication/shopify/callback` | None | OAuth callback |
| POST | `/api/syndication/shopify/webhooks/:topic` | HMAC | Webhook handler |
| GET | `/api/syndication/shopify/status` | API Key | Get connection status |
| POST | `/api/syndication/shopify/sync` | API Key | Manual product sync |
| POST | `/api/syndication/shopify/disconnect` | API Key | Disconnect store |

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

### What Gets Synced

| Shopify Field | EuroComply Field | Direction |
|---------------|------------------|-----------|
| title | name | ↔ Bi-directional |
| body_html | description | ↔ Bi-directional |
| variants[].sku | sku | ↔ Bi-directional |
| variants[].barcode | gtin | ↔ Bi-directional |
| vendor | attributes.vendor | → Import only |
| product_type | attributes.productType | → Import only |
| tags | attributes.tags | ↔ Bi-directional |
| images | assets | → Import only |
| variants[].price | price | ↔ Bi-directional |
| metafields.eurocomply.* | dppData | ← Export only |

### Sync Behavior

- **Initial Sync**: All active products imported on connection
- **Ongoing Sync**: Webhooks keep products in sync automatically
- **Manual Sync**: Trigger via API or dashboard
- **Rate Limiting**: BullMQ queue respects Shopify's 2 req/sec limit
- **Deletions**: Products are archived, not deleted (audit trail)

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

*Last Updated: January 2026*
