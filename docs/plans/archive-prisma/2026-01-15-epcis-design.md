# EPCIS Integration Design

**Status:** Draft
**Date:** 2026-01-15
**Source:** EPCIS_INTEGRATION.md

---

## 1. Overview

EuroComply uses GS1 EPCIS 2.0 for supply chain event tracking. Events are captured in the Operations workspace and included in issued DPPs.

### What EPCIS Provides

| Question | EPCIS Answer | DPP Use |
|----------|--------------|---------|
| **What** | Which products | Product identification |
| **Where** | At which location | Manufacturing origin |
| **When** | At what time | Timestamps |
| **Why** | What business process | Event context |

---

## 2. Supported Event Types

### MVP (Launch)

| Event Type | Description | DPP Relevance |
|------------|-------------|---------------|
| **ObjectEvent** | Events on products at locations | Manufacturing, shipping, receiving |

### Post-Launch

| Event Type | Description | DPP Relevance |
|------------|-------------|---------------|
| **AggregationEvent** | Packing/unpacking | Batch composition |
| **TransactionEvent** | Ownership transfers | Supply chain handoffs |
| **TransformationEvent** | Assembly/manufacturing | Bill of materials |
| **AssociationEvent** | IoT/sensor linking | Condition monitoring |

---

## 3. Event Capture Methods

```
┌─────────────────────────────────────────────────────────────────┐
│                    EVENT CAPTURE                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  METHOD 1: API Direct                                           │
│  POST /api/v1/epcis/events                                      │
│  → Customer systems send events directly                        │
│                                                                  │
│  METHOD 2: Webhook Receiver                                     │
│  POST /api/v1/epcis/webhook                                     │
│  → Receive from existing EPCIS repositories                     │
│                                                                  │
│  METHOD 3: Batch Import                                         │
│  POST /api/v1/epcis/import                                      │
│  → Upload EPCIS XML or JSON-LD files                           │
│                                                                  │
│  METHOD 4: QR Scan                                              │
│  → Automatic capture on GS1 Digital Link scan                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Data Model

### Event Storage

```typescript
interface EPCISEventRecord {
  id: string;                    // ev_abc123
  organizationId: string;
  productId: string;             // EuroComply product
  serialNumber: string;          // From SGTIN

  // EPCIS core
  eventType: 'ObjectEvent' | 'AggregationEvent' | 'TransactionEvent' |
             'TransformationEvent' | 'AssociationEvent';
  eventTime: Date;
  eventTimeZoneOffset: string;
  action: 'ADD' | 'OBSERVE' | 'DELETE';
  bizStep: string;
  disposition: string;

  // Location
  readPointId: string;           // Where scanned
  bizLocationId: string;         // Business location

  // Full payload (preserved for compliance)
  rawEvent: object;              // Original EPCIS JSON-LD

  // Metadata
  captureMethod: 'api' | 'webhook' | 'import' | 'scan';
  capturedAt: Date;
  capturedBy: string;
}
```

### Storage Split

| Data | Storage | Reason |
|------|---------|--------|
| Events | DynamoDB | High volume, time-series queries |
| Locations | PostgreSQL | Relational, referenced by events |
| Products | PostgreSQL | Master data |

---

## 5. Location Management

### Facility Hierarchy

```
Organization
├── Facility (SGLN - manufacturing)
│   ├── Zone (warehouse)
│   │   └── Station (packing line)
│   └── Zone (QC lab)
└── Facility (SGLN - distribution)
    └── Zone (cold storage)
```

### Location Schema

```typescript
interface Facility {
  id: string;
  organizationId: string;
  name: string;
  sgln: string;                  // GS1 location identifier
  type: 'manufacturing' | 'distribution' | 'retail' | 'other';
  address: {
    streetAddress: string;
    postalCode: string;
    city: string;
    country: string;             // ISO 3166-1 alpha-2
  };
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  certifications: Certification[];
}
```

---

## 6. DPP Integration

### Event History in VC

When a DPP is issued, EPCIS events are embedded:

```json
{
  "credentialSubject": {
    "productHistory": {
      "@type": "EPCISDocument",
      "eventList": [
        {
          "eventType": "ObjectEvent",
          "eventTime": "2026-01-10T08:00:00Z",
          "bizStep": "commissioning",
          "readPoint": "Factory Berlin"
        },
        {
          "eventType": "ObjectEvent",
          "eventTime": "2026-01-12T14:00:00Z",
          "bizStep": "shipping",
          "destination": "Distribution Center Munich"
        }
      ]
    }
  }
}
```

### Event Visibility Rules

```
┌─────────────────────────────────────────────────────────────────┐
│                    VISIBILITY RULES                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PUBLIC (Included in DPP):                                      │
│  ✅ commissioning - Manufacturing origin                        │
│  ✅ shipping/receiving - Supply chain milestones               │
│  ✅ inspecting - Quality certifications                        │
│  ✅ transforming - Bill of materials (if disclosed)            │
│                                                                  │
│  REDACTED (Generalized in DPP):                                 │
│  ⚠️  Specific addresses → Region/country only                  │
│  ⚠️  Internal transfers → Summarized                           │
│                                                                  │
│  PRIVATE (Operations workspace only):                           │
│  ❌ Internal logistics details                                  │
│  ❌ Pricing/transaction values                                  │
│  ❌ Business partner identities (unless consented)             │
│  ❌ Rejected/reworked events                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. API Endpoints

### Capture Event

```http
POST /api/v1/epcis/events
Authorization: Bearer {token}
Content-Type: application/json

{
  "eventType": "ObjectEvent",
  "eventTime": "2026-01-14T10:00:00Z",
  "epcList": ["urn:epc:id:sgtin:5901234.056789.001"],
  "action": "ADD",
  "bizStep": "urn:epcglobal:cbv:bizstep:commissioning",
  "readPoint": { "id": "urn:epc:id:sgln:5901234.00001.0" }
}
```

### Query Events

```http
GET /api/v1/epcis/events?productId={id}&eventType=ObjectEvent&from=2026-01-01
```

### Batch Import

```http
POST /api/v1/epcis/import
Content-Type: application/json

{
  "format": "json-ld",
  "events": [...],
  "options": {
    "skipDuplicates": true,
    "createMissingProducts": false
  }
}
```

---

## 8. Access Control

| Authority | Can Capture | Can View | Can Configure DPP Inclusion |
|-----------|:-----------:|:--------:|:---------------------------:|
| Operations MANAGER | ✅ All | ✅ All | ✅ |
| Operations EDITOR | ✅ Own facility | ✅ Own facility | ❌ |
| Operations CONTRIBUTOR | ✅ Own facility | ✅ Own facility | ❌ |
| Operations VIEWER | ❌ | ✅ Public | ❌ |
| Other workspace users | ❌ | ✅ Public | ❌ |

---

## 9. ESPR Compliance Mapping

| ESPR Requirement | EPCIS Event | bizStep |
|------------------|-------------|---------|
| Manufacturing origin | ObjectEvent | commissioning |
| Manufacturing date | ObjectEvent ILMD | - |
| Supply chain actors | TransactionEvent | shipping |
| Import/export | ObjectEvent | importing/exporting |
| Ownership transfers | TransactionEvent | - |
| Repairs/refurbishment | ObjectEvent | repairing |
| End-of-life | ObjectEvent | destroying/recycling |

---

## 10. Implementation Phases

### Phase 1: MVP

- ObjectEvent capture (API)
- Event storage (DynamoDB)
- Basic query
- DPP event inclusion
- Facility management

### Phase 2: Post-Launch

- AggregationEvent, TransactionEvent, TransformationEvent
- Webhook receiver
- EPCIS standard query interface
- Batch XML import

### Phase 3: Future

- AssociationEvent (IoT sensors)
- Real-time WebSocket streaming
- EPCIS repository federation

---

## 11. Related Documents

| Document | Purpose |
|----------|---------|
| [Architecture Design](./2026-01-15-architecture-design.md) | System architecture |
| [Data Sovereignty Design](./2026-01-15-data-sovereignty-design.md) | Event outbox pattern |
| [Verifiable Credentials Design](./2026-01-15-verifiable-credentials-design.md) | VC structure |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-01-15 | Initial draft from EPCIS_INTEGRATION.md |

