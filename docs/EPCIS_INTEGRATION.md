# EPCIS 2.0 Integration

> Event-based traceability for Digital Product Passports using the GS1 EPCIS 2.0 standard.

---

## 1. Overview

### What is EPCIS?

EPCIS (Electronic Product Code Information Services) is a GS1 standard for capturing and sharing supply chain events. EPCIS 2.0 provides a standardized way to answer four key questions about products:

- **What** - Which product(s) were involved?
- **Where** - At which location?
- **When** - At what time?
- **Why** - What business process triggered this event?

### Why EPCIS for DPPs?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EPCIS + DPP VALUE PROPOSITION                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ESPR REQUIREMENTS                         EPCIS ENABLES                    │
│  ─────────────────                         ─────────────                    │
│  Product origin transparency        ←──    ObjectEvent (commissioning)      │
│  Manufacturing location             ←──    ObjectEvent (location capture)   │
│  Transport chain visibility         ←──    ObjectEvent (shipping/receiving) │
│  Ownership transfers                ←──    TransactionEvent (ownership)     │
│  Transformation tracking            ←──    TransformationEvent (assembly)   │
│  Batch/lot traceability             ←──    AggregationEvent (packaging)     │
│                                                                              │
│  EUROCOMPLY APPROACH:                                                       │
│  ─────────────────────                                                      │
│  1. Capture EPCIS events at key supply chain points                         │
│  2. Store events in Operations workspace                                    │
│  3. Include event history in issued DPPs                                    │
│  4. Enable QR scan → full product journey view                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. EPCIS 2.0 Event Types

### 2.1 ObjectEvent

Tracks events occurring to objects (products) at specific locations.

```json
{
  "eventType": "ObjectEvent",
  "eventTime": "2026-01-14T10:00:00Z",
  "eventTimeZoneOffset": "+01:00",
  "epcList": [
    "urn:epc:id:sgtin:5901234.056789.001"
  ],
  "action": "ADD",
  "bizStep": "urn:epcglobal:cbv:bizstep:commissioning",
  "disposition": "urn:epcglobal:cbv:disp:active",
  "readPoint": {
    "id": "urn:epc:id:sgln:5901234.00001.0"
  },
  "bizLocation": {
    "id": "urn:epc:id:sgln:5901234.00001.0"
  }
}
```

**Common ObjectEvent Use Cases:**

| bizStep | Description | DPP Data |
|---------|-------------|----------|
| `commissioning` | Product created/serialized | Manufacturing date, location |
| `shipping` | Product shipped | Dispatch location, carrier |
| `receiving` | Product received | Receipt location, date |
| `inspecting` | Quality inspection | QC status, inspector |
| `destroying` | Product destroyed | Destruction reason, date |

### 2.2 AggregationEvent

Tracks packing/unpacking of products into containers.

```json
{
  "eventType": "AggregationEvent",
  "eventTime": "2026-01-14T11:00:00Z",
  "parentID": "urn:epc:id:sscc:5901234.0000000001",
  "childEPCs": [
    "urn:epc:id:sgtin:5901234.056789.001",
    "urn:epc:id:sgtin:5901234.056789.002",
    "urn:epc:id:sgtin:5901234.056789.003"
  ],
  "action": "ADD",
  "bizStep": "urn:epcglobal:cbv:bizstep:packing"
}
```

**DPP Relevance:** Track batch composition, case/pallet contents.

### 2.3 TransactionEvent

Links products to business transactions (orders, invoices, transfers).

```json
{
  "eventType": "TransactionEvent",
  "eventTime": "2026-01-14T12:00:00Z",
  "epcList": [
    "urn:epc:id:sgtin:5901234.056789.001"
  ],
  "action": "ADD",
  "bizStep": "urn:epcglobal:cbv:bizstep:shipping",
  "bizTransactionList": [
    {
      "type": "urn:epcglobal:cbv:btt:po",
      "bizTransaction": "urn:epc:id:gdti:5901234.000001.PO-2026-001"
    }
  ],
  "sourceList": [
    {
      "type": "urn:epcglobal:cbv:sdt:owning_party",
      "source": "urn:epc:id:pgln:5901234.00000"
    }
  ],
  "destinationList": [
    {
      "type": "urn:epcglobal:cbv:sdt:owning_party",
      "destination": "urn:epc:id:pgln:4012345.00000"
    }
  ]
}
```

**DPP Relevance:** Ownership transfers, supply chain handoffs.

### 2.4 TransformationEvent

Tracks transformation of input products into output products.

```json
{
  "eventType": "TransformationEvent",
  "eventTime": "2026-01-14T14:00:00Z",
  "inputEPCList": [
    "urn:epc:id:sgtin:5901234.011111.001",
    "urn:epc:id:sgtin:5901234.022222.001"
  ],
  "outputEPCList": [
    "urn:epc:id:sgtin:5901234.056789.001"
  ],
  "bizStep": "urn:epcglobal:cbv:bizstep:assembling",
  "ilmd": {
    "productionDate": "2026-01-14",
    "batchNumber": "BATCH-2026-001"
  }
}
```

**DPP Relevance:** Bill of materials, component traceability, recycled content.

### 2.5 AssociationEvent (EPCIS 2.0)

Links products to sensors, digital twins, or other digital artifacts.

```json
{
  "eventType": "AssociationEvent",
  "eventTime": "2026-01-14T15:00:00Z",
  "parentID": "urn:epc:id:sgtin:5901234.056789.001",
  "childEPCs": [
    "urn:epc:id:giai:5901234.SENSOR001"
  ],
  "action": "ADD",
  "bizStep": "urn:epcglobal:cbv:bizstep:sensor_association"
}
```

**DPP Relevance:** IoT sensor data, condition monitoring.

---

## 3. EuroComply EPCIS Architecture

### 3.1 Event Capture Methods

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EPCIS EVENT CAPTURE                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  METHOD 1: API Direct Capture                                               │
│  ─────────────────────────────                                              │
│  POST /api/v1/epcis/events                                                      │
│  • Customer systems send events directly to EuroComply                      │
│  • Best for: Custom integrations, existing ERP systems                      │
│                                                                              │
│  METHOD 2: Webhook Receiver                                                 │
│  ────────────────────────                                                   │
│  POST /api/v1/epcis/webhook                                                     │
│  • EuroComply receives events from EPCIS repositories                       │
│  • Best for: Customers using existing EPCIS infrastructure                  │
│                                                                              │
│  METHOD 3: Batch Import                                                     │
│  ────────────────────────                                                   │
│  POST /api/v1/epcis/import                                                      │
│  • Upload EPCIS XML or JSON-LD event files                                  │
│  • Best for: Historical data, periodic sync                                 │
│                                                                              │
│  METHOD 4: GS1 Digital Link Resolution                                      │
│  ─────────────────────────────────────                                      │
│  Automatic event capture when products are scanned via GS1 resolver         │
│  • Best for: Retail/consumer touchpoints                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Data Model Mapping

| EPCIS Concept | EuroComply Model | Storage |
|---------------|------------------|---------|
| EPC (SGTIN) | Product serial number | Item (DynamoDB) |
| SGLN (location) | Facility | PostgreSQL |
| bizStep | Event type | Event record |
| disposition | Product status | Item status |
| ILMD | Instance data | Design workspace |
| Master data | Product attributes | Design workspace |

### 3.3 Event Storage

```typescript
// EPCIS Event stored in Operations workspace
interface EPCISEventRecord {
  id: string;                    // ev_abc123
  organizationId: string;        // org_xyz
  productId: string;             // prod_123 (EuroComply product)
  serialNumber: string;          // Serial from SGTIN

  // EPCIS core fields
  eventType: EPCISEventType;
  eventTime: Date;
  eventTimeZoneOffset: string;
  action: 'ADD' | 'OBSERVE' | 'DELETE';
  bizStep: string;
  disposition: string;

  // Location
  readPointId: string;           // Where scanned
  bizLocationId: string;         // Business location

  // Full EPCIS payload (preserved for compliance)
  rawEvent: object;              // Original EPCIS JSON-LD

  // Metadata
  captureMethod: 'api' | 'webhook' | 'import' | 'scan';
  capturedAt: Date;
  capturedBy: string;            // User or system ID
}

type EPCISEventType =
  | 'ObjectEvent'
  | 'AggregationEvent'
  | 'TransactionEvent'
  | 'TransformationEvent'
  | 'AssociationEvent';
```

---

## 4. DPP Integration

### 4.1 Event History in DPP

When a DPP is issued, EPCIS events are included in the credential:

```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    "https://schema.org/",
    "https://ref.gs1.org/standards/epcis/2.0.0/epcis-context.jsonld"
  ],
  "type": ["VerifiableCredential", "DigitalProductPassport"],
  "credentialSubject": {
    "id": "urn:gtin:5901234567890:SN-001",
    "productName": "Organic Cotton T-Shirt",

    "productHistory": {
      "@type": "EPCISDocument",
      "eventList": [
        {
          "eventType": "ObjectEvent",
          "eventTime": "2026-01-10T08:00:00Z",
          "bizStep": "commissioning",
          "readPoint": "Factory Berlin",
          "bizLocation": "EcoTextiles Manufacturing Facility"
        },
        {
          "eventType": "ObjectEvent",
          "eventTime": "2026-01-12T14:00:00Z",
          "bizStep": "shipping",
          "readPoint": "Factory Berlin",
          "destination": "Distribution Center Munich"
        },
        {
          "eventType": "ObjectEvent",
          "eventTime": "2026-01-13T09:00:00Z",
          "bizStep": "receiving",
          "readPoint": "Distribution Center Munich"
        }
      ]
    }
  }
}
```

### 4.2 Event Visibility Rules

Not all EPCIS events should be in the public DPP:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EVENT VISIBILITY RULES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PUBLIC (Included in DPP):                                                  │
│  ✅ commissioning - Where/when product was made                             │
│  ✅ shipping/receiving - Major supply chain milestones                      │
│  ✅ inspecting - Quality certifications                                     │
│  ✅ transforming - Bill of materials (if disclosed)                         │
│                                                                              │
│  REDACTED (Location generalized):                                           │
│  ⚠️  Specific facility addresses → Region/country only                     │
│  ⚠️  Internal transfer events → Summarized                                 │
│                                                                              │
│  PRIVATE (Operations workspace only):                                       │
│  ❌ Internal logistics details                                              │
│  ❌ Pricing/transaction values                                              │
│  ❌ Business partner identities (unless consented)                          │
│  ❌ Rejected/reworked events                                                │
│                                                                              │
│  CONFIGURATION:                                                             │
│  Organization settings control default visibility.                          │
│  Per-event overrides available in Operations workspace.                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. API Endpoints

### 5.1 Capture Event

```http
POST /api/v1/epcis/events
Content-Type: application/json

{
  "eventType": "ObjectEvent",
  "eventTime": "2026-01-14T10:00:00Z",
  "eventTimeZoneOffset": "+01:00",
  "epcList": ["urn:epc:id:sgtin:5901234.056789.001"],
  "action": "ADD",
  "bizStep": "urn:epcglobal:cbv:bizstep:commissioning",
  "disposition": "urn:epcglobal:cbv:disp:active",
  "readPoint": { "id": "urn:epc:id:sgln:5901234.00001.0" },
  "bizLocation": { "id": "urn:epc:id:sgln:5901234.00001.0" }
}
```

Response:
```json
{
  "success": true,
  "data": {
    "eventId": "ev_abc123",
    "productId": "prod_xyz",
    "serialNumber": "001",
    "eventType": "ObjectEvent",
    "bizStep": "commissioning",
    "capturedAt": "2026-01-14T10:00:05Z"
  }
}
```

### 5.2 Query Events

```http
GET /api/v1/epcis/events?productId=prod_xyz&eventType=ObjectEvent&from=2026-01-01
```

Query Parameters:
| Parameter | Type | Description |
|-----------|------|-------------|
| `productId` | string | Filter by EuroComply product ID |
| `serialNumber` | string | Filter by serial number |
| `eventType` | string | Filter by EPCIS event type |
| `bizStep` | string | Filter by business step |
| `from` | ISO date | Events after this time |
| `to` | ISO date | Events before this time |
| `locationId` | string | Filter by location (SGLN) |

### 5.3 Batch Import

```http
POST /api/v1/epcis/import
Content-Type: application/json

{
  "format": "json-ld",
  "events": [
    { /* EPCIS event 1 */ },
    { /* EPCIS event 2 */ }
  ],
  "options": {
    "skipDuplicates": true,
    "createMissingProducts": false
  }
}
```

### 5.4 EPCIS Query Interface (Standard)

For compatibility with EPCIS 2.0 query clients:

```http
GET /api/v1/epcis/events/query?MATCH_epc=urn:epc:id:sgtin:5901234.*
```

Supports standard EPCIS query parameters per GS1 specification.

---

## 6. Location Master Data

### 6.1 Registering Locations

Before capturing events, register facility locations:

```http
POST /api/v1/facilities
Content-Type: application/json

{
  "name": "Berlin Manufacturing Facility",
  "sgln": "urn:epc:id:sgln:5901234.00001.0",
  "type": "manufacturing",
  "address": {
    "streetAddress": "Industriestraße 123",
    "postalCode": "10115",
    "city": "Berlin",
    "country": "DE"
  },
  "coordinates": {
    "latitude": 52.5200,
    "longitude": 13.4050
  },
  "certifications": [
    { "type": "ISO14001", "validUntil": "2027-06-30" }
  ]
}
```

### 6.2 Location Hierarchy

```
Organization
├── Facility (SGLN - manufacturing)
│   ├── Zone (sublocation - warehouse)
│   │   └── Station (sublocation - packing line)
│   └── Zone (sublocation - QC lab)
└── Facility (SGLN - distribution)
    └── Zone (sublocation - cold storage)
```

---

## 7. Implementation Roadmap

### 7.1 MVP (Launch)

| Feature | Status | Notes |
|---------|--------|-------|
| ObjectEvent capture | 📋 MVP | Core event type |
| API event capture | 📋 MVP | REST endpoint |
| Event storage | 📋 MVP | DynamoDB + PostgreSQL |
| Event query | 📋 MVP | Basic filtering |
| DPP event inclusion | 📋 MVP | Automatic in VC |
| Location management | 📋 MVP | Facility CRUD |

### 7.2 Post-Launch

| Feature | Status | Notes |
|---------|--------|-------|
| AggregationEvent | 📋 Post-Launch | Packing/unpacking |
| TransactionEvent | 📋 Post-Launch | Ownership transfer |
| TransformationEvent | 📋 Post-Launch | Assembly/manufacturing |
| EPCIS webhook receiver | 📋 Post-Launch | Integration |
| EPCIS standard query interface | 📋 Post-Launch | GS1 compatibility |
| Sensor data (AssociationEvent) | 📋 Post-Launch | IoT integration |
| Batch XML import | 📋 Post-Launch | Legacy system support |

### 7.3 Future

| Feature | Notes |
|---------|-------|
| EPCIS repository federation | Query across multiple EPCIS repos |
| Real-time event streaming | WebSocket event push |
| AI event enrichment | Auto-detect anomalies |
| Blockchain anchoring | Optional event immutability |

---

## 8. Compliance Mapping

### 8.1 ESPR Requirements → EPCIS Events

| ESPR Requirement | EPCIS Event | bizStep |
|------------------|-------------|---------|
| Manufacturing origin | ObjectEvent | commissioning |
| Manufacturing date | ObjectEvent ILMD | - |
| Supply chain actors | TransactionEvent | shipping |
| Transport modes | ObjectEvent extension | - |
| Import/export | ObjectEvent | importing/exporting |
| Ownership transfers | TransactionEvent | - |
| Repairs/refurbishment | ObjectEvent | repairing |
| End-of-life | ObjectEvent | destroying/recycling |

### 8.2 Textile-Specific Events

| Textile Requirement | EPCIS Approach |
|---------------------|----------------|
| Fiber origin | TransformationEvent (raw material → yarn) |
| Spinning location | ObjectEvent (commissioning) |
| Dyeing/finishing | ObjectEvent (custom bizStep) |
| Garment assembly | TransformationEvent |
| Chemical treatments | ObjectEvent ILMD extension |

---

## 9. Security & Privacy

### 9.1 Event Authentication

All captured events are authenticated:

```typescript
interface AuthenticatedEvent extends EPCISEventRecord {
  // Authentication
  capturedBy: string;           // User ID or API key ID
  captureMethod: string;        // api, webhook, import
  sourceIp: string;             // IP address

  // Integrity
  eventHash: string;            // SHA-256 of event content
  signedAt: Date;
  signedBy: string;             // EuroComply signing key
}
```

### 9.2 Access Control

| Role | Can Capture | Can View | Can Include in DPP |
|------|-------------|----------|-------------------|
| Operations Manager | ✅ All events | ✅ All events | ✅ Configure |
| Operations Editor | ✅ Own facility | ✅ Own facility | ❌ |
| Design Viewer | ❌ | ✅ Public events | ❌ |
| External (DPP) | ❌ | ✅ Public events | N/A |

---

## 10. Related Standards

| Standard | Relationship |
|----------|--------------|
| **GS1 EPCIS 2.0** | Core event model |
| **GS1 CBV 2.0** | Business vocabulary (bizStep, disposition) |
| **GS1 Digital Link** | Product identification |
| **W3C Verifiable Credentials** | DPP credential format |
| **JSON-LD** | Event serialization |
| **ISO/IEC 19987** | EPC Tag Data Standard |

---

## Related Documentation

- [README.md](../README.md) - Data model overview
- [API_REFERENCE.md](./API_REFERENCE.md) - API endpoints
- [DPP_CONTENT_PLAN.md](./DPP_CONTENT_PLAN.md) - DPP data requirements
- [GS1 EPCIS 2.0 Standard](https://www.gs1.org/standards/epcis)

---

*Last Updated: 2026-01-14*
