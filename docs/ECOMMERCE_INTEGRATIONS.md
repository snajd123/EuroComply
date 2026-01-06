# E-commerce Integrations Guide

EuroComply provides native integrations for popular e-commerce platforms, enabling merchants to achieve DSA (Digital Services Act) compliance with minimal effort.

## Overview

| Platform | Integration Type | Auth Method | Status |
|----------|-----------------|-------------|--------|
| Shopify | App Store | OAuth 2.0 | Ready |
| WooCommerce | Plugin/API | REST API Keys | Ready |

---

## Shopify Integration

### For Merchants

**Installation (2 minutes):**
1. Visit the EuroComply app in Shopify App Store
2. Click "Add app"
3. Authorize the required permissions
4. Complete DSA compliance checklist in dashboard

**What happens:**
- Store data automatically synced
- Merchant profile created
- DSA compliance checklist generated
- Missing items identified

### For Developers

#### OAuth Flow

```
GET /api/shopify/auth?shop=mystore.myshopify.com
→ Redirects to Shopify OAuth
→ Returns to /api/shopify/callback
→ Exchanges code for access token
→ Creates organization & merchant
→ Redirects to dashboard
```

#### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/shopify/auth` | Start OAuth flow |
| GET | `/api/shopify/callback` | OAuth callback |
| POST | `/api/shopify/webhooks` | Webhook handler |
| GET | `/api/shopify/compliance/:shop` | Get DSA status |

#### Environment Variables

```env
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
API_HOST=api.eurocomply.io
DASHBOARD_URL=https://dashboard.eurocomply.io
```

#### Required Scopes

```
read_content
read_themes
read_products
read_orders
read_merchant_managed_fulfillment_orders
read_customers
```

#### Webhooks

The app subscribes to these webhooks:
- `shop/update` - Sync store changes
- `app/uninstalled` - Clean up on uninstall
- `customers/data_request` - GDPR data request
- `customers/redact` - GDPR customer deletion
- `shop/redact` - GDPR shop deletion

#### Code Example

```typescript
import { ShopifyClient, ShopifySyncService } from '@eurocomply/integrations';

// After OAuth callback
const syncService = new ShopifySyncService(config);
const { organizationId, merchantId } = await syncService.handleInstall(
  shopDomain,
  accessToken,
  scope
);

// Get DSA compliance status
const status = await syncService.getDsaStatus(shopDomain);
console.log(status);
// {
//   compliant: false,
//   score: 75,
//   missingItems: ['Bank account', 'Self-certification'],
//   merchant: { id: '...', legalName: '...', dsaStatus: 'IN_PROGRESS' }
// }
```

---

## WooCommerce Integration

### For Merchants

**Connection (5 minutes):**
1. Generate REST API keys in WooCommerce → Settings → Advanced → REST API
2. Enter credentials in EuroComply dashboard
3. Click "Connect Store"
4. Complete DSA compliance checklist

### For Developers

#### Connection Flow

```
POST /api/woocommerce/connect
Body: { siteUrl, consumerKey, consumerSecret }
→ Tests connection
→ Creates organization & merchant
→ Returns organizationId, merchantId
```

#### Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/woocommerce/connect` | API Key | Connect store |
| POST | `/api/woocommerce/disconnect` | API Key | Disconnect store |
| POST | `/api/woocommerce/sync` | API Key | Sync store data |
| POST | `/api/woocommerce/webhooks` | Webhook Secret | Webhook handler |
| GET | `/api/woocommerce/compliance` | API Key | Get DSA status |

#### Environment Variables

```env
WOOCOMMERCE_WEBHOOK_SECRET=your_webhook_secret
```

#### Required WooCommerce Permissions

- Read access to Settings
- Read access to System Status

#### Code Example

```typescript
import { WooCommerceSyncService } from '@eurocomply/integrations';

// Connect a WooCommerce store
const syncService = new WooCommerceSyncService(config);
const { organizationId, merchantId } = await syncService.connectStore(
  consumerKey,
  consumerSecret,
  'https://mystore.com'
);

// Sync latest store data
await syncService.syncStore(organizationId);
```

---

## DSA Compliance Flow

Both integrations follow the same compliance flow:

### 1. Store Connection
```
Store connected → Organization created → Merchant created
```

### 2. Data Sync
```
Shop name, address, email, phone → Merchant profile
```

### 3. Compliance Checklist

| Requirement | Auto-filled | Manual |
|-------------|-------------|--------|
| Legal name | ✅ (from store) | |
| Address | ✅ (from store) | |
| Email | ✅ (from store) | |
| Phone | ✅ (if available) | ✅ |
| Trade register | | ✅ |
| VAT number | | ✅ |
| Bank account | | ✅ |
| ID attestation | | ✅ |
| Self-certification | | ✅ |

### 4. Complete Missing Items

```typescript
// Add bank account
POST /v1/traders/:id/bank-accounts
{
  "accountHolder": "My Store Ltd",
  "iban": "DE89370400440532013000"
}

// Submit ID attestation
POST /v1/traders/:id/attestations
{
  "documentType": "PASSPORT",
  "documentCountry": "DE"
}

// Submit self-certification
POST /v1/traders/:id/self-certification
{
  "accepted": true
}
```

### 5. Compliance Complete

```
DSA Status: COMPLIANT
Score: 100%
All Article 30 requirements met
```

---

## Shopify App Store Submission

### Required Assets

1. **App Icon**: 1200x1200 PNG
2. **Screenshots**: 1600x900 PNG (min 3)
3. **Privacy Policy URL**
4. **Support URL**

### App Listing Copy

**Name:** EuroComply - DSA Compliance

**Tagline:** Get DSA compliant in 10 minutes

**Description:**
```
EuroComply helps EU merchants comply with the Digital Services Act (DSA) Article 30 requirements.

✓ Automatic compliance checklist
✓ IBAN validation
✓ Self-certification workflow
✓ Audit trail for regulators
✓ Multi-platform support

Required by EU law for all traders selling on online platforms.
```

### Review Checklist

- [ ] OAuth flow works correctly
- [ ] Webhooks handle all required events
- [ ] GDPR webhooks implemented
- [ ] Uninstall cleans up data
- [ ] Error handling for edge cases
- [ ] Rate limiting respected

---

## Pricing Integration

### Shopify Billing API

```typescript
// Create subscription charge
const charge = await shopifyClient.recurringApplicationCharge.create({
  name: 'DSA Compliance',
  price: 29.00,
  return_url: 'https://dashboard.eurocomply.io/billing/confirm',
  trial_days: 14,
  test: process.env.NODE_ENV !== 'production',
});
```

### Suggested Pricing

| Plan | Price | Features |
|------|-------|----------|
| Basic | €29/mo | Single store, DSA compliance |
| Pro | €79/mo | 3 stores, priority support |
| Agency | €199/mo | Unlimited stores, API access |

---

## Troubleshooting

### Shopify

**"Invalid HMAC signature"**
- Check API secret is correct
- Ensure raw body is used for verification

**"App not authorized"**
- User may have revoked access
- Trigger re-authorization flow

### WooCommerce

**"Failed to connect"**
- Verify consumer key/secret are correct
- Check store URL is accessible
- Ensure REST API is enabled

**"Permission denied"**
- API keys need read access to settings
- Check WooCommerce user permissions

---

## Security Considerations

1. **Never log access tokens** - Mask in all logs
2. **Encrypt stored credentials** - Use AES-256
3. **Verify all webhooks** - Check HMAC signatures
4. **Use HTTPS only** - Reject HTTP callbacks
5. **Rate limit OAuth** - Prevent brute force
6. **Audit all access** - Log to AuditLog table
