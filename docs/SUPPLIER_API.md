# Supplier Portal API Reference

API endpoints for the EuroComply Supplier Marketplace. Suppliers can register, create DPPs, and earn revenue when merchants use their products.

## Base URL

```
https://api.eurocomply.io/api/suppliers
```

## Authentication

Most endpoints require a Bearer token obtained from login:

```bash
curl https://api.eurocomply.io/api/suppliers/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

---

## Authentication Endpoints

### Register Supplier

Create a new supplier account.

```
POST /api/suppliers/register
```

**Request Body:**
```json
{
  "email": "supplier@textiles.com",
  "password": "securepassword123",
  "companyName": "ABC Textiles GmbH",
  "country": "DE",
  "website": "https://abc-textiles.com",
  "description": "Premium organic cotton manufacturer"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "supplier": {
      "id": "sup_abc123",
      "email": "supplier@textiles.com",
      "companyName": "ABC Textiles GmbH",
      "country": "DE",
      "verificationStatus": "PENDING",
      "createdAt": "2025-01-07T10:00:00Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

### Login

Authenticate and receive a JWT token.

```
POST /api/suppliers/login
```

**Request Body:**
```json
{
  "email": "supplier@textiles.com",
  "password": "securepassword123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "supplier": {
      "id": "sup_abc123",
      "email": "supplier@textiles.com",
      "companyName": "ABC Textiles GmbH",
      "verificationStatus": "VERIFIED",
      "catalogVisibility": "PUBLIC"
    },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

---

## Profile Endpoints

### Get Profile

Get current supplier profile.

```
GET /api/suppliers/me
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "sup_abc123",
    "email": "supplier@textiles.com",
    "companyName": "ABC Textiles GmbH",
    "companyRegistration": "HRB 12345",
    "country": "DE",
    "website": "https://abc-textiles.com",
    "logoUrl": "https://...",
    "description": "Premium organic cotton manufacturer",
    "verificationStatus": "VERIFIED",
    "verifiedAt": "2025-01-05T14:00:00Z",
    "catalogVisibility": "PUBLIC",
    "stripeConnectAccountId": "acct_xxx",
    "payoutEnabled": true,
    "_count": {
      "products": 12
    }
  }
}
```

### Update Profile

Update supplier profile settings.

```
PATCH /api/suppliers/me
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "companyName": "ABC Textiles International GmbH",
  "website": "https://abc-textiles.eu",
  "description": "Updated description",
  "logoUrl": "https://new-logo-url.com/logo.png",
  "catalogVisibility": "PUBLIC"
}
```

---

## Verification Endpoints

### Get Verification Status

Check current verification status.

```
GET /api/suppliers/verification
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "verificationStatus": "VERIFIED",
    "verifiedAt": "2025-01-05T14:00:00Z",
    "verifiedBy": "admin_001",
    "companyRegistration": "HRB 12345",
    "verificationDocs": {
      "documents": [...],
      "submittedAt": "2025-01-04T10:00:00Z"
    }
  }
}
```

### Submit Verification

Submit documents for verification review.

```
POST /api/suppliers/verification
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "companyRegistration": "HRB 12345",
  "documents": [
    {
      "type": "BUSINESS_REGISTRATION",
      "name": "Handelsregister Auszug",
      "url": "https://storage.example.com/docs/registration.pdf",
      "mimeType": "application/pdf"
    },
    {
      "type": "TAX_CERTIFICATE",
      "name": "VAT Certificate",
      "url": "https://storage.example.com/docs/vat.pdf"
    }
  ],
  "notes": "Documents are from 2024"
}
```

**Document Types:**
- `BUSINESS_REGISTRATION` - Company registration document
- `TAX_CERTIFICATE` - VAT or tax registration
- `CERTIFICATION` - Industry certification (GOTS, OEKO-TEX, etc.)
- `OTHER` - Other supporting documents

---

## Product Endpoints

### List Products

Get all products for the authenticated supplier.

```
GET /api/suppliers/products
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "prod_001",
      "name": "Organic Cotton T-Shirt Base",
      "description": "100% GOTS certified organic cotton",
      "category": "TEXTILE",
      "visibility": "PUBLISHED",
      "timesLinked": 45,
      "timesForked": 12,
      "vcStatus": "ANCHORED",
      "_count": {
        "merchantLinks": 45,
        "usageEvents": 57
      }
    }
  ]
}
```

### Create Product

Create a new supplier product with DPP data.

```
POST /api/suppliers/products
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "name": "Organic Cotton T-Shirt Base",
  "description": "Premium GOTS certified organic cotton base product",
  "category": "TEXTILE",
  "imageUrls": ["https://..."],
  "dppData": {
    "category": "textile",
    "fiberComposition": [
      {
        "fiberType": "organic_cotton",
        "percentage": 100,
        "origin": "organic"
      }
    ],
    "countryOfManufacture": "PT",
    "manufacturer": {
      "name": "ABC Textiles GmbH",
      "country": "DE"
    },
    "careInstructions": {
      "maxWashTemperature": 40,
      "bleachAllowed": false,
      "tumbleDryAllowed": false,
      "ironTemperature": "medium",
      "dryCleanAllowed": false
    },
    "hazardousSubstances": {
      "reachCompliant": true,
      "substancesOfConcern": []
    },
    "certifications": [
      {
        "type": "GOTS",
        "certificateNumber": "GOTS-12345",
        "issuingBody": "Control Union",
        "validFrom": "2024-01-01",
        "validUntil": "2025-12-31"
      }
    ],
    "carbonFootprint": {
      "value": 3.2,
      "unit": "kgCO2e",
      "methodology": "Higg_MSI",
      "scope": "cradle_to_gate"
    }
  },
  "visibility": "PUBLISHED"
}
```

**Note:** Only verified suppliers can set `visibility: "PUBLISHED"`.

### Get Product

Get a specific product by ID.

```
GET /api/suppliers/products/:id
Authorization: Bearer <token>
```

### Update Product

Update an existing product.

```
PATCH /api/suppliers/products/:id
Authorization: Bearer <token>
```

### Delete Product

Delete a product. Will fail if merchants are currently linked.

```
DELETE /api/suppliers/products/:id
Authorization: Bearer <token>
```

---

## Earnings Endpoints

### Earnings Overview

Get current earnings summary.

```
GET /api/suppliers/earnings
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "thisMonth": {
      "earnings": 45.60,
      "links": 48,
      "forks": 9,
      "total": 57
    },
    "lastMonth": {
      "earnings": 38.40
    },
    "monthOverMonthGrowth": 18.8,
    "allTime": {
      "earnings": 324.80
    },
    "pendingPayout": {
      "amount": 45.60,
      "canWithdraw": true,
      "minimumAmount": 10.00
    }
  }
}
```

### Per-Product Earnings

Get earnings breakdown by product.

```
GET /api/suppliers/earnings/products
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "prod_001",
      "name": "Organic Cotton T-Shirt Base",
      "category": "TEXTILE",
      "visibility": "PUBLISHED",
      "stats": {
        "timesLinked": 45,
        "timesForked": 12,
        "totalUsage": 57
      },
      "earnings": {
        "fromLinks": 36.00,
        "fromForks": 9.60,
        "total": 45.60
      }
    }
  ]
}
```

### Earnings History

Get monthly earnings history.

```
GET /api/suppliers/earnings/history?page=1&limit=12
Authorization: Bearer <token>
```

### Recent Usage Events

Get recent usage activity.

```
GET /api/suppliers/earnings/recent?limit=20
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "evt_001",
      "type": "LINK_MONTHLY",
      "merchantShop": "fashion-store.myshopify.com",
      "productName": "Organic Cotton T-Shirt Base",
      "priceCharged": 1.00,
      "supplierShare": 0.80,
      "billingStatus": "PAID",
      "createdAt": "2025-01-07T08:00:00Z"
    }
  ]
}
```

---

## Payout Endpoints

### Get Payout Settings

Get current payout configuration.

```
GET /api/suppliers/payouts/settings
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "stripeConnected": true,
    "payoutEnabled": true,
    "minimumPayout": 10.00
  }
}
```

### Payout History

Get past payout records.

```
GET /api/suppliers/payouts/history?page=1&limit=20
Authorization: Bearer <token>
```

### Request Payout

Request a payout of pending earnings.

```
POST /api/suppliers/payouts/request
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "payoutId": "pay_001",
    "amount": 45.60,
    "status": "PROCESSING",
    "message": "Payout request submitted. Funds will be transferred within 2-3 business days."
  }
}
```

**Errors:**
- `Minimum payout amount is €10` - Balance below threshold
- `Please connect your Stripe account` - Stripe not connected
- `Payouts are not enabled` - Stripe onboarding incomplete

---

## Public Catalog Endpoints

These endpoints are public (for merchant access).

### Search Catalog

Browse published supplier products.

```
GET /api/suppliers/catalog?search=cotton&category=TEXTILE&page=1&limit=20
X-Merchant-Shop: fashion-store.myshopify.com
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| search | string | Search in name, description, supplier |
| category | enum | TEXTILE, ELECTRONICS, FURNITURE, BATTERY |
| supplierCountry | string | ISO 3166-1 alpha-2 country code |
| page | number | Page number (default: 1) |
| limit | number | Items per page (default: 20, max: 100) |

### Get Catalog Product

Get details of a published product.

```
GET /api/suppliers/catalog/:id
X-Merchant-Shop: fashion-store.myshopify.com
```

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [...]
  }
}
```

**Common Error Codes:**
| Code | HTTP Status | Description |
|------|-------------|-------------|
| UNAUTHORIZED | 401 | Missing or invalid token |
| VALIDATION_ERROR | 400 | Invalid request body |
| NOT_FOUND | 404 | Resource not found |
| REGISTRATION_FAILED | 400 | Email already exists |
| VERIFICATION_FAILED | 400 | Cannot submit verification |

---

## Rate Limits

- **Authentication endpoints**: 10 requests/minute
- **Catalog endpoints**: 100 requests/minute
- **Other endpoints**: 60 requests/minute

---

## Webhooks (Coming Soon)

Future webhook events:
- `supplier.verified` - Supplier verification approved
- `product.linked` - Merchant linked to product
- `product.forked` - Merchant forked product
- `payout.completed` - Payout successfully sent
