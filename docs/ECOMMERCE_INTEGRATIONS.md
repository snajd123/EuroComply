# E-commerce Integrations for ProductTrust

EuroComply provides native integrations for Shopify and WooCommerce to automatically sync products and generate Digital Product Passports (DPPs) for ESPR compliance.

## Overview

| Platform | Integration Type | Auth Method | Status |
|----------|-----------------|-------------|--------|
| Shopify | App Store | OAuth 2.0 | Ready |
| WooCommerce | Plugin/API | REST API Keys | Ready |

---

## What These Integrations Do

1. **Product Sync** - Automatically import products from your store
2. **DPP Generation** - Create Digital Product Passports for each product
3. **QR Code Integration** - Push DPP QR codes back to product pages
4. **Lifecycle Tracking** - Track product events through orders

---

## Shopify Integration

### For Merchants

**Installation (2 minutes):**
1. Visit the EuroComply app in Shopify App Store
2. Click "Add app"
3. Authorize the required permissions
4. Products are automatically synced

**What happens:**
- Products automatically imported to EuroComply
- Generate DPPs for products needing ESPR compliance
- QR codes added to product pages via metafields

### For Developers

#### OAuth Flow

```
GET /api/shopify/auth?shop=mystore.myshopify.com
→ Redirects to Shopify OAuth
→ Returns to /api/shopify/callback
→ Exchanges code for access token
→ Creates organization & syncs products
→ Redirects to dashboard
```

#### Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/shopify/auth` | None | Start OAuth flow |
| GET | `/api/shopify/callback` | None | OAuth callback |
| POST | `/api/shopify/webhooks/:topic` | HMAC | Webhook handler |
| GET | `/api/shopify/status` | API Key | Get connection status |
| POST | `/api/shopify/sync` | API Key | Manual product sync |
| POST | `/api/shopify/disconnect` | API Key | Disconnect store |

#### Environment Variables

```env
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
API_HOST=api.eurocomply.io
DASHBOARD_URL=https://dashboard.eurocomply.io
```

#### Required Scopes

```
read_products
write_products    # For metafields (DPP QR codes)
read_inventory
```

#### Webhooks

The app subscribes to these webhooks:
- `products/create` - Sync new products
- `products/update` - Update existing products
- `products/delete` - Archive products
- `app/uninstalled` - Clean up on uninstall

---

## WooCommerce Integration

### For Merchants

**Connection (5 minutes):**
1. Generate REST API keys in WooCommerce → Settings → Advanced → REST API
2. Enter credentials in EuroComply dashboard
3. Click "Connect Store"
4. Products are automatically synced

### For Developers

#### Connection Flow

```
POST /api/woocommerce/connect
Body: { siteUrl, consumerKey, consumerSecret }
→ Tests connection
→ Creates organization & syncs products
→ Returns organizationId, productsSynced
```

#### Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/woocommerce/connect` | API Key | Connect store |
| POST | `/api/woocommerce/disconnect` | API Key | Disconnect store |
| GET | `/api/woocommerce/status` | API Key | Get connection status |
| POST | `/api/woocommerce/sync` | API Key | Manual product sync |
| POST | `/api/woocommerce/webhooks` | Webhook Secret | Webhook handler |

#### Environment Variables

```env
WOOCOMMERCE_WEBHOOK_SECRET=your_webhook_secret
```

#### Required WooCommerce Permissions

- Read access to Products
- Read access to System Status

---

## Product Sync Details

### What Gets Synced

| Shopify Field | WooCommerce Field | EuroComply Field |
|---------------|-------------------|------------------|
| title | name | name |
| body_html | description | description |
| variants[0].sku | sku | sku |
| variants[0].barcode | - | gtin |
| vendor | - | attributes.vendor |
| product_type | type | attributes.productType |
| tags | tags | attributes.tags |
| images | images | attributes.images |

### Sync Behavior

- **Initial Sync**: All active/published products imported on connection
- **Ongoing Sync**: Webhooks keep products in sync automatically
- **Manual Sync**: Trigger via API or dashboard
- **Deletions**: Products are archived, not deleted (audit trail)

---

## Generating DPPs for Synced Products

Once products are synced, create Digital Product Passports:

```bash
# Create passport for a product
curl -X POST https://api.eurocomply.io/v1/passports \
  -H "Authorization: Bearer ec_live_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "prod_xxx",
    "data": {
      "manufacturerName": "Your Company",
      "manufacturerCountry": "DE",
      "carbonFootprint": { "value": 5.2, "unit": "kgCO2e" },
      "recyclability": { "percentage": 85 },
      "materials": [
        { "name": "Organic Cotton", "percentage": 95 },
        { "name": "Elastane", "percentage": 5 }
      ]
    }
  }'

# Generate QR code
curl -X POST https://api.eurocomply.io/v1/passports/pass_xxx/qr \
  -H "Authorization: Bearer ec_live_xxxxx"
```

The QR code URL is automatically pushed back to Shopify/WooCommerce product metafields.

---

## Pushing DPP to Product Pages

### Shopify

DPP data is stored in product metafields:
- `eurocomply.dpp_qr_url` - QR code image URL
- `eurocomply.dpp_verify_url` - Verification page URL

Display in your theme:
```liquid
{% if product.metafields.eurocomply.dpp_qr_url %}
  <div class="dpp-badge">
    <img src="{{ product.metafields.eurocomply.dpp_qr_url }}" alt="Digital Product Passport">
    <a href="{{ product.metafields.eurocomply.dpp_verify_url }}">Verify Product</a>
  </div>
{% endif %}
```

### WooCommerce

DPP data is stored in product meta:
- `_eurocomply_dpp_qr_url` - QR code image URL
- `_eurocomply_dpp_verify_url` - Verification page URL

Display in your theme:
```php
$qr_url = get_post_meta($product_id, '_eurocomply_dpp_qr_url', true);
$verify_url = get_post_meta($product_id, '_eurocomply_dpp_verify_url', true);

if ($qr_url) {
    echo '<div class="dpp-badge">';
    echo '<img src="' . esc_url($qr_url) . '" alt="Digital Product Passport">';
    echo '<a href="' . esc_url($verify_url) . '">Verify Product</a>';
    echo '</div>';
}
```

---

## API Response Examples

### Connection Status

```json
{
  "success": true,
  "data": {
    "connected": true,
    "shop": "mystore.myshopify.com",
    "installedAt": "2026-01-06T10:00:00Z",
    "lastSyncAt": "2026-01-06T12:00:00Z",
    "productCount": 150,
    "passportCount": 45
  }
}
```

### Sync Result

```json
{
  "success": true,
  "data": {
    "synced": 150,
    "created": 10,
    "updated": 140,
    "failed": 0
  }
}
```

---

## Troubleshooting

### Shopify

**"Invalid HMAC signature"**
- Check API secret is correct
- Ensure raw body is used for webhook verification

**"App not authorized"**
- User may have revoked access
- Trigger re-authorization via `/api/shopify/auth`

### WooCommerce

**"Failed to connect"**
- Verify consumer key/secret are correct
- Check store URL is accessible (no firewall blocking)
- Ensure REST API is enabled in WooCommerce

**"Permission denied"**
- API keys need read access to products
- Check WooCommerce user permissions

---

## Security Considerations

1. **Encrypt stored credentials** - Access tokens stored encrypted
2. **Verify all webhooks** - Check HMAC signatures
3. **Use HTTPS only** - Reject HTTP callbacks
4. **Audit all access** - Log to AuditLog table
5. **Scope permissions** - Request minimum required scopes
