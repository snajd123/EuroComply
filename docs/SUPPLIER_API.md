# Supplier Portal API Reference

API endpoints for the EuroComply Supplier Platform. Suppliers (producers, importers, brands) use this API to create and manage Digital Product Passports.

## Base URL

```
https://api.eurocomply.eu/api/suppliers
```

## Authentication

Most endpoints require a Bearer token obtained from login:

```bash
curl https://api.eurocomply.eu/api/suppliers/me \
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
  "description": "Premium organic cotton manufacturer",
  "supplierType": "PRODUCER"
}
```

**Supplier Types:**
- `PRODUCER` - Manufacturer with primary data
- `IMPORTER` - Brings non-EU products into EU market
- `BRAND` - Brand owner

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
      "supplierType": "PRODUCER",
      "verificationStatus": "PENDING",
      "plan": "STARTER",
      "createdAt": "2026-01-08T10:00:00Z"
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
      "supplierType": "PRODUCER",
      "verificationStatus": "VERIFIED",
      "plan": "GROWTH",
      "did": "did:key:z6MkhaXgBZDvvvRhta..."
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
    "supplierType": "PRODUCER",
    "verificationStatus": "VERIFIED",
    "verifiedAt": "2026-01-05T14:00:00Z",
    "plan": "GROWTH",
    "planLimits": {
      "maxDpps": 500,
      "usedDpps": 45
    },
    "did": "did:key:z6MkhaXgBZDvvvRhta...",
    "_count": {
      "products": 45
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
  "logoUrl": "https://new-logo-url.com/logo.png"
}
```

---

## Subscription & Plan Endpoints

### Get Plan Status

Get current subscription plan and usage.

```
GET /api/suppliers/plan
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "plan": "GROWTH",
    "price": 149.00,
    "currency": "EUR",
    "billingPeriod": "monthly",
    "limits": {
      "maxDpps": 500,
      "usedDpps": 45,
      "remainingDpps": 455
    },
    "features": {
      "csvImport": true,
      "templatesLibrary": true,
      "apiAccess": false,
      "whiteLabel": false,
      "prioritySupport": true
    },
    "currentPeriod": {
      "start": "2026-01-01T00:00:00Z",
      "end": "2026-01-31T23:59:59Z"
    },
    "nextBillingDate": "2026-02-01T00:00:00Z"
  }
}
```

### Upgrade Plan

Request plan upgrade.

```
POST /api/suppliers/plan/upgrade
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "newPlan": "PRO"
}
```

### Get Billing History

Get past invoices.

```
GET /api/suppliers/billing/history?page=1&limit=12
Authorization: Bearer <token>
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
    "verifiedAt": "2026-01-05T14:00:00Z",
    "verifiedBy": "admin_001",
    "companyRegistration": "HRB 12345",
    "verificationDocs": {
      "documents": [...],
      "submittedAt": "2026-01-04T10:00:00Z"
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

## Product (DPP) Endpoints

### List Products

Get all DPPs for the authenticated supplier.

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
      "gtin": "5901234567890",
      "description": "100% GOTS certified organic cotton",
      "category": "TEXTILE",
      "visibility": "PUBLISHED",
      "vcStatus": "ANCHORED",
      "vcId": "vc_abc123",
      "createdAt": "2026-01-01T10:00:00Z",
      "_count": {
        "retailerLinks": 45
      }
    }
  ]
}
```

### Create Product (DPP)

Create a new DPP. Requires verification and available plan quota.

```
POST /api/suppliers/products
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "name": "Organic Cotton T-Shirt Base",
  "gtin": "5901234567890",
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
      "methodology": "ISO_14067",
      "scope": "cradle_to_gate"
    }
  },
  "visibility": "PUBLISHED"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "prod_001",
    "name": "Organic Cotton T-Shirt Base",
    "gtin": "5901234567890",
    "category": "TEXTILE",
    "visibility": "PUBLISHED",
    "vcStatus": "ANCHORED",
    "vcId": "vc_abc123",
    "verifiableCredential": {
      "issuer": "did:key:z6MkhaXgBZDvvvRhta...",
      "issuanceDate": "2026-01-08T10:30:00Z"
    },
    "qrCodeUrl": "https://api.eurocomply.eu/qr/prod_001.svg"
  }
}
```

**Note:** Only verified suppliers can create DPPs. Plan quota is checked.

### Get Product

Get a specific product by ID.

```
GET /api/suppliers/products/:id
Authorization: Bearer <token>
```

### Update Product

Update an existing DPP. Issues a new VC with updated data.

```
PATCH /api/suppliers/products/:id
Authorization: Bearer <token>
```

### Delete Product

Delete a DPP. Retailers who linked this DPP will see it as unavailable.

```
DELETE /api/suppliers/products/:id
Authorization: Bearer <token>
```

---

## Verifiable Credential Endpoints

### Get VC for Product

Get the full Verifiable Credential for a product.

```
GET /api/suppliers/products/:id/credential
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "vcJwt": "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...",
    "vcJson": {
      "@context": [...],
      "type": ["VerifiableCredential", "DigitalProductPassport"],
      "issuer": "did:key:z6MkhaXgBZDvvvRhta...",
      "credentialSubject": {...},
      "proof": {...}
    },
    "issuanceDate": "2026-01-08T10:30:00Z",
    "expirationDate": "2036-01-08T10:30:00Z"
  }
}
```

### Reissue VC

Force reissue of Verifiable Credential (e.g., after data update).

```
POST /api/suppliers/products/:id/credential/reissue
Authorization: Bearer <token>
```

---

## Identity Endpoints

### Get DID

Get supplier's Decentralized Identifier.

```
GET /api/suppliers/identity
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "did": "did:key:z6MkhaXgBZDvvvRhta4LjXRJzLKNqVj3yQTpCFbRc8GwAdfS",
    "didDocument": {
      "@context": ["https://www.w3.org/ns/did/v1"],
      "id": "did:key:z6MkhaXgBZDvvvRhta...",
      "verificationMethod": [...],
      "authentication": [...],
      "assertionMethod": [...]
    },
    "createdAt": "2026-01-01T10:00:00Z"
  }
}
```

---

## Export Endpoints

### Export All Data

Export all DPPs, VCs, and identity for portability.

```
POST /api/suppliers/export
Authorization: Bearer <token>
```

**Request Body (optional):**
```json
{
  "includePrivateKey": true,
  "format": "zip"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "downloadUrl": "https://api.eurocomply.eu/exports/exp_abc123.zip",
    "expiresAt": "2026-01-09T10:00:00Z",
    "contents": {
      "credentials": 45,
      "includesPrivateKey": true
    }
  }
}
```

**Export Package Contents:**
```
export/
├── credentials/
│   ├── prod_001.vc.json
│   ├── prod_002.vc.json
│   └── ...
├── identity/
│   ├── did-document.json
│   └── private-key.jwk     (if requested)
└── manifest.json
```

### Export Single Product

Export a single DPP with its VC.

```
GET /api/suppliers/products/:id/export
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "product": {...},
    "verifiableCredential": {
      "vcJwt": "...",
      "vcJson": {...}
    },
    "qrCodeSvg": "..."
  }
}
```

---

## Public Catalog Endpoints

These endpoints are public (for retailer access via plugins). Retailers access DPPs for free.

### Search Catalog

Browse published supplier DPPs.

```
GET /api/suppliers/catalog?search=cotton&category=TEXTILE&page=1&limit=20
X-Retailer-Shop: fashion-store.myshopify.com
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| search | string | Search in name, description, supplier |
| category | enum | TEXTILE, ELECTRONICS, FURNITURE, BATTERY |
| gtin | string | Search by GTIN/barcode |
| supplierCountry | string | ISO 3166-1 alpha-2 country code |
| page | number | Page number (default: 1) |
| limit | number | Items per page (default: 20, max: 100) |

**Response:**
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "prod_001",
        "name": "Organic Cotton T-Shirt Base",
        "gtin": "5901234567890",
        "category": "TEXTILE",
        "supplier": {
          "id": "sup_abc123",
          "companyName": "ABC Textiles GmbH",
          "country": "DE",
          "verified": true,
          "supplierType": "PRODUCER"
        },
        "summary": {
          "certifications": ["GOTS", "OEKO-TEX"],
          "carbonFootprint": {"value": 3.2, "unit": "kgCO2e"}
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 156,
      "pages": 8
    }
  }
}
```

### Get Catalog Product

Get details of a published DPP. Free for retailers.

```
GET /api/suppliers/catalog/:id
X-Retailer-Shop: fashion-store.myshopify.com
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "prod_001",
    "name": "Organic Cotton T-Shirt Base",
    "gtin": "5901234567890",
    "description": "Premium GOTS certified organic cotton",
    "category": "TEXTILE",
    "supplier": {
      "id": "sup_abc123",
      "companyName": "ABC Textiles GmbH",
      "country": "DE",
      "verified": true,
      "supplierType": "PRODUCER",
      "did": "did:key:z6MkhaXgBZDvvvRhta..."
    },
    "dppData": {
      "fiberComposition": [...],
      "careInstructions": {...},
      "certifications": [...],
      "carbonFootprint": {...}
    },
    "verifiableCredential": {
      "issuer": "did:key:z6MkhaXgBZDvvvRhta...",
      "issuanceDate": "2026-01-08T10:30:00Z",
      "verificationUrl": "https://eurocomply.eu/verify/vc_abc123"
    },
    "qrCodeUrl": "https://api.eurocomply.eu/qr/prod_001.svg"
  }
}
```

### Link DPP to Retailer Product

Link a supplier DPP to a retailer's product. Free access per ESPR Article 31.

```
POST /api/suppliers/catalog/:id/link
X-Retailer-Shop: fashion-store.myshopify.com
```

**Request Body:**
```json
{
  "shopifyProductId": "gid://shopify/Product/123456789"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "linkId": "link_abc123",
    "supplierProductId": "prod_001",
    "shopifyProductId": "gid://shopify/Product/123456789",
    "linkedAt": "2026-01-08T10:30:00Z",
    "message": "DPP linked successfully. No charge - free access per ESPR Article 31."
  }
}
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
| PLAN_LIMIT_EXCEEDED | 403 | DPP quota exceeded for current plan |
| NOT_VERIFIED | 403 | Supplier not yet verified |
| REGISTRATION_FAILED | 400 | Email already exists |

---

## Rate Limits

- **Authentication endpoints**: 10 requests/minute
- **Catalog endpoints**: 100 requests/minute
- **Other endpoints**: 60 requests/minute

---

## Webhooks (Coming Soon)

Future webhook events:
- `supplier.verified` - Supplier verification approved
- `product.created` - New DPP created
- `product.updated` - DPP data updated
- `product.linked` - Retailer linked to DPP
- `subscription.upgraded` - Plan upgraded
- `subscription.cancelled` - Subscription cancelled

---

## Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    SUPPLIER API OVERVIEW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  AUTHENTICATION                                                 │
│  → POST /register - Create account                              │
│  → POST /login - Get JWT token                                  │
│                                                                  │
│  PROFILE & PLAN                                                 │
│  → GET /me - Get profile                                        │
│  → GET /plan - Get subscription status                          │
│  → POST /plan/upgrade - Upgrade plan                            │
│                                                                  │
│  VERIFICATION                                                   │
│  → GET /verification - Check status                             │
│  → POST /verification - Submit documents                        │
│                                                                  │
│  PRODUCTS (DPPs)                                                │
│  → GET /products - List all DPPs                                │
│  → POST /products - Create DPP                                  │
│  → GET /products/:id - Get DPP                                  │
│  → PATCH /products/:id - Update DPP                             │
│  → DELETE /products/:id - Delete DPP                            │
│                                                                  │
│  CREDENTIALS                                                    │
│  → GET /products/:id/credential - Get VC                        │
│  → POST /products/:id/credential/reissue - Reissue VC           │
│                                                                  │
│  IDENTITY                                                       │
│  → GET /identity - Get DID                                      │
│                                                                  │
│  EXPORT                                                         │
│  → POST /export - Export all data                               │
│  → GET /products/:id/export - Export single DPP                 │
│                                                                  │
│  PUBLIC CATALOG (Free for retailers)                            │
│  → GET /catalog - Browse DPPs                                   │
│  → GET /catalog/:id - Get DPP details                           │
│  → POST /catalog/:id/link - Link DPP to retailer product        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

*Last Updated: 2026-01-08*
