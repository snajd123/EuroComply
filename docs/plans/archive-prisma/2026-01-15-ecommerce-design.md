# E-commerce Integration Design

**Status:** Draft
**Date:** 2026-01-15
**Source:** ECOMMERCE_INTEGRATIONS.md

---

## 1. Overview

EuroComply provides e-commerce integration for both brands creating DPPs and retailers displaying them.

### Integration Types

| Integration | User Type | Cost | Purpose |
|-------------|-----------|------|---------|
| **Shopify Syndication** | Brands, Manufacturers | Included in paid plans | Sync products and DPP data to Shopify |
| **Shopify Retailer App** | Retailers | Free (ESPR Article 31) | Display DPPs from other brands |
| **Embeddable Widget** | Any website | Free | Display DPPs on any product page |
| **Public API** | Developers | Free | Programmatic DPP lookup |

---

## 2. Shopify Syndication (For Brands)

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
│     Products automatically imported and routed                  │
│     Technical data → Registry (Design)                          │
│     Commercial data → PIM (Marketing)                           │
│     Images → DAM-Media (Marketing)                              │
│                                                                  │
│  3. ENRICH                                                      │
│     User adds sustainability data in Design workspace           │
│     Materials, certifications, carbon footprint                 │
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
| variants[].sku | Registry | Design |
| variants[].barcode (GTIN) | Registry | Design |
| vendor | Registry | Design |
| product_type | Registry | Design |
| title | PIM | Marketing |
| body_html | PIM | Marketing |
| variants[].price | PIM | Marketing |
| tags | PIM | Marketing |
| images | DAM-Media | Marketing |

### OAuth Configuration

```
Required Scopes:
- read_products
- write_products (for metafields)
- read_inventory
```

### Webhooks

| Webhook | Action |
|---------|--------|
| products/create | Import new product |
| products/update | Update existing product |
| products/delete | Archive product |
| app/uninstalled | Clean up connection |

---

## 3. Conflict Resolution

### Strategy by Field Type

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONFLICT RESOLUTION                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  COMMERCIAL DATA (title, description, price, tags):             │
│  Winner: Shopify                                                │
│  Rationale: Sales channel is authoritative for commercial       │
│                                                                  │
│  COMPLIANCE DATA (materials, certifications, DPP):              │
│  Winner: EuroComply                                             │
│  Rationale: Compliance system is authoritative                  │
│                                                                  │
│  TECHNICAL IDENTITY (SKU, GTIN):                                │
│  Winner: Manual resolution required                             │
│  Rationale: Critical for product matching                       │
│                                                                  │
│  MEDIA (images):                                                │
│  Winner: Shopify (import only)                                  │
│  Rationale: One-way sync to DAM                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Conflict Modes

| Mode | Behavior |
|------|----------|
| AUTO_RESOLVE | Apply default strategy silently |
| ALERT_USER | Notify user, apply default after 24h (default) |
| REQUIRE_MANUAL | Block sync until user resolves |

---

## 4. Rate Limiting

### Shopify Limits

| API Type | Limit | Our Target |
|----------|-------|------------|
| REST API | 2 req/sec | 1.5 req/sec (75%) |
| GraphQL | 50 points/sec | 40 points/sec (80%) |

### Implementation

- BullMQ worker with rate limiter
- Exponential backoff on 429 responses
- Respect Retry-After header
- Adaptive throttling based on rate limit hits

---

## 5. Token Management

### Storage Security

- Access tokens encrypted at rest (AES-256-GCM)
- Encryption key per tenant
- Stored in shopify_connections table

### Invalidation Handling

| Scenario | Detection | Response |
|----------|-----------|----------|
| User revokes app | 401 response | Mark DISCONNECTED, notify user |
| Store ownership transfer | shop/update webhook | Validate token, re-auth if needed |
| Reinstall after uninstall | New OAuth | Link to existing org, preserve data |

### Retry Configuration

```
Max retries: 5
Backoff: 1s → 2s → 4s → 8s → 16s
On failure: Mark AUTH_REQUIRED, notify user
Grace period: 30 days before ABANDONED
```

---

## 6. Uninstall Handling

### Cleanup Procedure

| Action | Timing |
|--------|--------|
| Mark connection UNINSTALLED | Immediate |
| Delete access token | Immediate |
| Cancel pending sync jobs | Immediate |
| Log to audit trail | Immediate |
| Notify organization admin | Within 5 minutes |

### Data Retention

| Data Type | Retention | Rationale |
|-----------|-----------|-----------|
| Product data (Hub) | Permanent | Belongs to organization |
| Issued DPPs | 10 years minimum | ESPR compliance |
| Sync history | 7 years | Audit trail |
| Connection record | Permanent | Reinstall detection |
| Access tokens | Deleted immediately | Security |

### Reinstall Detection

When user reinstalls:
1. Check for existing connection by shop domain
2. Link to existing organization
3. Preserve all product data
4. Resume sync from previous state
5. Show "Welcome back" flow

---

## 7. DPP in Shopify

### Metafields (namespace: eurocomply)

| Metafield | Description |
|-----------|-------------|
| `dpp_id` | DPP identifier |
| `dpp_qr_url` | QR code image URL |
| `dpp_verify_url` | Public verification page |
| `dpp_status` | Status (ACTIVE, DRAFT, etc.) |
| `completeness` | Data completeness score (0-100) |

### Theme Integration

```liquid
{% if product.metafields.eurocomply.dpp_qr_url %}
  <div class="dpp-badge">
    <img src="{{ product.metafields.eurocomply.dpp_qr_url }}" />
    <a href="{{ product.metafields.eurocomply.dpp_verify_url }}">
      View Product Passport
    </a>
  </div>
{% endif %}
```

---

## 8. Retailer App (Free)

### ESPR Article 31 Compliance

The retailer app is free because ESPR Article 31 mandates free DPP access for all economic operators.

### Automatic Matching

| Method | Priority |
|--------|----------|
| GTIN/EAN | Primary |
| Brand + SKU | Fallback |
| Serial Number | Item-level |

### Features

- Dashboard showing matched products
- DPP preview for each product
- Auto-inject DPP into product pages
- Customizable display position and styling

---

## 9. Embeddable Widget

### Lookup Methods

| Method | Parameter | Example |
|--------|-----------|---------|
| GTIN | `data-gtin` | `data-gtin="5901234123457"` |
| Brand + SKU | `data-brand` + `data-sku` | `data-brand="acme" data-sku="SHIRT-001"` |
| Serial | `data-serial` | `data-serial="SN123456789"` |

### Display

- Product name and brand
- Material composition
- Carbon footprint
- Certifications
- QR code to full DPP
- Verification status
- Customizable styling

---

## 10. Public API

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/public/dpp/gtin/:gtin` | Lookup by GTIN |
| GET | `/api/v1/public/dpp/brand/:brand/sku/:sku` | Lookup by brand/SKU |
| GET | `/api/v1/public/dpp/serial/:serial` | Lookup by serial |
| GET | `/api/v1/public/dpp/search` | Search catalog |
| POST | `/api/v1/public/dpp/batch` | Batch lookup (max 100) |

### Rate Limits

| Tier | Requests/min | Batch size |
|------|--------------|------------|
| Anonymous | 60 | 10 |
| Registered (free) | 300 | 100 |

---

## 11. Inventory Sync

### Authority Model

| Data Type | Authority | Rationale |
|-----------|-----------|-----------|
| Stock quantities | Shopify | Sales system of record |
| Location mappings | Shopify | Fulfillment locations |
| Inventory policies | Shopify | Continue selling, etc. |
| Batch/lot numbers | EuroComply | Compliance tracking |
| Serial numbers | EuroComply | DPP issuance |

### Discrepancy Alerts

| Discrepancy | Threshold | Alert Level |
|-------------|-----------|-------------|
| Quantity mismatch | > 5% | Warning |
| Quantity mismatch | > 10% | Error |
| Missing batch | Any | Warning (auto-assign FIFO) |
| Unknown serial | Any | Error (block DPP) |
| Negative inventory | Any | Critical |

---

## 12. Security

| Concern | Mitigation |
|---------|------------|
| Stored credentials | AES-256-GCM encryption |
| Webhook authenticity | HMAC signature verification |
| Transport | HTTPS only |
| Audit | All sync operations logged |
| Permissions | Minimum required OAuth scopes |

---

## 13. Related Documents

| Document | Purpose |
|----------|---------|
| [Architecture Design](./2026-01-15-architecture-design.md) | System architecture |
| [Security Design](./2026-01-15-security-design.md) | API key management |
| [User Management Design](./2026-01-15-user-management-design.md) | Workspace authorities |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-01-15 | Initial draft from ECOMMERCE_INTEGRATIONS.md |
