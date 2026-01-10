# EPCIS 2.0 Integration

Full integration of GS1 EPCIS 2.0 (Electronic Product Code Information Services) for supply chain event tracking and product lifecycle visibility.

---

## Executive Summary

EPCIS 2.0 is the **GS1 standard for supply chain event data**. While DPPs contain static product information (materials, certifications, sustainability), EPCIS captures the **dynamic lifecycle** - where the product has been, what happened to it, and when.

| Aspect | Digital Product Passport | EPCIS 2.0 |
|--------|-------------------------|-----------|
| **Purpose** | Static product information | Dynamic lifecycle events |
| **Data Type** | Materials, certifications, sustainability | Manufacturing, shipping, repairs |
| **Changes** | Rarely (updates require new VC) | Constantly (new events added) |
| **Format** | W3C Verifiable Credential | GS1 EPCIS 2.0 JSON-LD |
| **Storage** | Pre-rendered static files | Event repository (queryable) |

**Why integrate from day one?**
- ESPR requires supply chain traceability
- Carbon footprint tracking needs transport events
- Repair/refurbishment history is mandatory for some categories
- Customers expect full product lifecycle visibility

---

## EPCIS 2.0 Overview

### What is EPCIS?

EPCIS (Electronic Product Code Information Services) is a GS1 standard that answers the "4 Ws" for any product event:

```
┌─────────────────────────────────────────────────────────────────┐
│  THE 4 Ws OF EPCIS                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WHAT?                                                          │
│  ──────                                                         │
│  Which products/items are involved?                             │
│  • GTIN + Serial number (SGTIN)                                 │
│  • Batch/Lot number                                             │
│  • Container/pallet IDs                                         │
│  Example: urn:epc:id:sgtin:0614141.107346.2017                  │
│                                                                  │
│  WHEN?                                                          │
│  ───────                                                        │
│  When did the event occur?                                      │
│  • ISO 8601 timestamp                                           │
│  • Timezone offset                                              │
│  Example: 2026-01-10T14:30:00.000+01:00                         │
│                                                                  │
│  WHERE?                                                         │
│  ───────                                                        │
│  Where did the event happen?                                    │
│  • GLN (Global Location Number)                                 │
│  • Geo-coordinates (optional)                                   │
│  Example: urn:epc:id:sgln:0614141.00001.0                       │
│                                                                  │
│  WHY?                                                           │
│  ─────                                                          │
│  What business context?                                         │
│  • Business step (commissioning, shipping, receiving)           │
│  • Disposition (in_transit, sellable_accessible)                │
│  • Business transaction (PO number, invoice)                    │
│  Example: urn:epcglobal:cbv:bizstep:shipping                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### EPCIS 2.0 vs 1.2

EPCIS 2.0 was released in **March 2023** with major improvements:

| Feature | EPCIS 1.2 | EPCIS 2.0 |
|---------|-----------|-----------|
| Data Format | XML only | JSON/JSON-LD + XML |
| API | SOAP | REST + SOAP |
| IoT Support | Limited | Native sensor data |
| Linked Data | No | JSON-LD compatible |
| GS1 Digital Link | No | Native support |
| Authentication | Basic | OAuth 2.0 |

**Key Insight:** EPCIS 2.0's JSON-LD format aligns perfectly with our DPP architecture (also JSON-LD).

---

## Event Types

EPCIS defines four core event types:

### 1. ObjectEvent

Tracks observations of objects at locations.

```typescript
interface ObjectEvent {
  type: 'ObjectEvent';
  eventTime: string;           // ISO 8601
  eventTimeZoneOffset: string; // e.g., '+01:00'
  epcList: string[];           // List of EPCs
  action: 'ADD' | 'OBSERVE' | 'DELETE';
  bizStep: string;             // Business step
  disposition?: string;        // Current state
  readPoint: string;           // Where event captured
  bizLocation?: string;        // Business location

  // ESPR extensions
  sensorElementList?: SensorElement[];
}

// Example: Product manufactured
const manufacturingEvent: ObjectEvent = {
  type: 'ObjectEvent',
  eventTime: '2026-01-10T08:00:00.000+01:00',
  eventTimeZoneOffset: '+01:00',
  epcList: ['urn:epc:id:sgtin:4012345.012345.1234567890'],
  action: 'ADD',
  bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
  disposition: 'urn:epcglobal:cbv:disp:active',
  readPoint: 'urn:epc:id:sgln:4012345.00001.0',
  bizLocation: 'urn:epc:id:sgln:4012345.00001.0',
};
```

### 2. AggregationEvent

Tracks packing/unpacking of items.

```typescript
interface AggregationEvent {
  type: 'AggregationEvent';
  eventTime: string;
  eventTimeZoneOffset: string;
  parentID: string;        // Container EPC
  childEPCs: string[];     // Items inside
  action: 'ADD' | 'DELETE';
  bizStep: string;
  readPoint: string;
}

// Example: Products packed into shipping container
const packingEvent: AggregationEvent = {
  type: 'AggregationEvent',
  eventTime: '2026-01-10T10:00:00.000+01:00',
  eventTimeZoneOffset: '+01:00',
  parentID: 'urn:epc:id:sscc:4012345.0000000001',
  childEPCs: [
    'urn:epc:id:sgtin:4012345.012345.1234567890',
    'urn:epc:id:sgtin:4012345.012345.1234567891',
    'urn:epc:id:sgtin:4012345.012345.1234567892',
  ],
  action: 'ADD',
  bizStep: 'urn:epcglobal:cbv:bizstep:packing',
  readPoint: 'urn:epc:id:sgln:4012345.00001.0',
};
```

### 3. TransformationEvent

Tracks conversion of inputs to outputs (manufacturing).

```typescript
interface TransformationEvent {
  type: 'TransformationEvent';
  eventTime: string;
  eventTimeZoneOffset: string;
  inputEPCList: string[];      // Raw materials consumed
  inputQuantityList?: QuantityElement[];
  outputEPCList: string[];     // Finished products created
  outputQuantityList?: QuantityElement[];
  bizStep: string;
  readPoint: string;
}

// Example: Fabric transformed into garment
const transformationEvent: TransformationEvent = {
  type: 'TransformationEvent',
  eventTime: '2026-01-10T09:00:00.000+01:00',
  eventTimeZoneOffset: '+01:00',
  inputEPCList: [
    'urn:epc:id:lgtin:4012345.054321.LOT001', // Cotton fabric batch
    'urn:epc:id:lgtin:4012345.054322.LOT002', // Polyester batch
  ],
  inputQuantityList: [
    { epcClass: 'urn:epc:class:lgtin:4012345.054321.LOT001', quantity: 50, uom: 'KGM' },
    { epcClass: 'urn:epc:class:lgtin:4012345.054322.LOT002', quantity: 20, uom: 'KGM' },
  ],
  outputEPCList: [
    'urn:epc:id:sgtin:4012345.012345.1234567890', // Finished t-shirt
  ],
  bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
  readPoint: 'urn:epc:id:sgln:4012345.00001.0',
};
```

### 4. TransactionEvent

Links products to business transactions.

```typescript
interface TransactionEvent {
  type: 'TransactionEvent';
  eventTime: string;
  eventTimeZoneOffset: string;
  bizTransactionList: BizTransaction[];
  epcList: string[];
  action: 'ADD' | 'DELETE';
  bizStep: string;
  readPoint: string;
}

// Example: Products sold (invoice reference)
const saleEvent: TransactionEvent = {
  type: 'TransactionEvent',
  eventTime: '2026-01-10T15:00:00.000+01:00',
  eventTimeZoneOffset: '+01:00',
  bizTransactionList: [
    { type: 'urn:epcglobal:cbv:btt:inv', bizTransaction: 'INV-2026-00123' },
    { type: 'urn:epcglobal:cbv:btt:po', bizTransaction: 'PO-2026-00456' },
  ],
  epcList: ['urn:epc:id:sgtin:4012345.012345.1234567890'],
  action: 'ADD',
  bizStep: 'urn:epcglobal:cbv:bizstep:shipping',
  readPoint: 'urn:epc:id:sgln:4012345.00002.0',
};
```

---

## Sensor Data (IoT Integration)

EPCIS 2.0 natively supports IoT sensor readings:

```typescript
interface SensorElement {
  sensorMetadata?: {
    time?: string;
    deviceID?: string;
    deviceMetadata?: string;
    rawData?: string;
  };
  sensorReport: SensorReport[];
}

interface SensorReport {
  type: string;      // gs1:Temperature, gs1:Humidity, etc.
  value?: number;
  stringValue?: string;
  booleanValue?: boolean;
  uom?: string;      // CEL (Celsius), FAH (Fahrenheit), P1 (%), etc.
  minValue?: number;
  maxValue?: number;
  meanValue?: number;
  sDev?: number;     // Standard deviation
}

// Example: Cold chain monitoring during transport
const coldChainEvent: ObjectEvent = {
  type: 'ObjectEvent',
  eventTime: '2026-01-10T12:00:00.000+01:00',
  eventTimeZoneOffset: '+01:00',
  epcList: ['urn:epc:id:sscc:4012345.0000000001'],
  action: 'OBSERVE',
  bizStep: 'urn:epcglobal:cbv:bizstep:transporting',
  disposition: 'urn:epcglobal:cbv:disp:in_transit',
  readPoint: 'geo:52.5200,13.4050', // Berlin coordinates
  sensorElementList: [
    {
      sensorMetadata: {
        time: '2026-01-10T12:00:00.000+01:00',
        deviceID: 'urn:epc:id:giai:4012345.SENSOR001',
      },
      sensorReport: [
        {
          type: 'gs1:Temperature',
          value: 4.2,
          uom: 'CEL',
          minValue: 2.0,
          maxValue: 8.0,
        },
        {
          type: 'gs1:Humidity',
          value: 65,
          uom: 'P1', // Percentage
        },
      ],
    },
  ],
};
```

---

## ESPR-Specific Extensions

For ESPR compliance, we extend EPCIS with sustainability data:

```typescript
// ESPR extension namespace
const ESPR_NAMESPACE = 'https://eurocomply.eu/epcis/espr';

interface EsprExtension {
  // Carbon footprint for this event
  carbonFootprint?: {
    value: number;      // kg CO2e
    scope: 1 | 2 | 3;   // GHG Protocol scope
    methodology: string;
  };

  // Energy consumption
  energyConsumption?: {
    value: number;
    uom: 'KWH' | 'MJ';
    source?: 'renewable' | 'grid' | 'mixed';
    renewablePercentage?: number;
  };

  // Transport details
  transport?: {
    mode: 'road' | 'rail' | 'sea' | 'air' | 'multimodal';
    distance?: number;  // km
    vehicleType?: string;
    fuelType?: string;
    emptyRunPercentage?: number;
  };

  // Repair/refurbishment details
  repair?: {
    type: 'repair' | 'refurbishment' | 'remanufacturing';
    componentsReplaced?: string[];
    originalCondition?: string;
    resultingCondition?: string;
  };

  // Recycling/end-of-life
  endOfLife?: {
    type: 'recycling' | 'incineration' | 'landfill' | 'reuse';
    materialsRecovered?: Array<{
      material: string;
      weight: number;
      uom: string;
    }>;
    recyclingFacility?: string;
  };
}

// Example: Shipping with carbon footprint
const shippingWithCarbon: ObjectEvent & { espr: EsprExtension } = {
  type: 'ObjectEvent',
  eventTime: '2026-01-10T14:00:00.000+01:00',
  eventTimeZoneOffset: '+01:00',
  epcList: ['urn:epc:id:sscc:4012345.0000000001'],
  action: 'OBSERVE',
  bizStep: 'urn:epcglobal:cbv:bizstep:shipping',
  readPoint: 'urn:epc:id:sgln:4012345.00002.0',
  espr: {
    carbonFootprint: {
      value: 12.5,
      scope: 3,
      methodology: 'GHG Protocol',
    },
    transport: {
      mode: 'road',
      distance: 450,
      vehicleType: 'truck_40t',
      fuelType: 'diesel',
    },
  },
};
```

---

## Architecture

### Integration Options

```
┌─────────────────────────────────────────────────────────────────┐
│  EPCIS INTEGRATION OPTIONS                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  OPTION A: EuroComply-Hosted EPCIS Repository (Recommended)     │
│  ─────────────────────────────────────────────────────────────  │
│  • We host EPCIS 2.0 compliant repository                       │
│  • Full lifecycle visibility in our UI                          │
│  • Automatic carbon footprint aggregation                       │
│  • Works out-of-box for customers                               │
│  • REST API for event capture                                   │
│                                                                  │
│  ┌─────────────┐     ┌─────────────────────┐                    │
│  │  Customer   │────▶│  EuroComply EPCIS   │                    │
│  │  ERP/WMS    │     │  Repository         │                    │
│  └─────────────┘     └──────────┬──────────┘                    │
│                                 │                                │
│                                 ▼                                │
│                      ┌─────────────────────┐                    │
│                      │  DPP with embedded  │                    │
│                      │  lifecycle link     │                    │
│                      └─────────────────────┘                    │
│                                                                  │
│  OPTION B: Link to External EPCIS Repository                    │
│  ─────────────────────────────────────────────                  │
│  • Customer has existing EPCIS (IBM, SAP, TraceLink)            │
│  • DPP links to their repository URL                            │
│  • We query on-demand for lifecycle display                     │
│  • No data duplication                                          │
│                                                                  │
│  ┌─────────────┐     ┌─────────────────────┐                    │
│  │  Customer   │────▶│  Customer's EPCIS   │                    │
│  │  ERP/WMS    │     │  (SAP, IBM, etc.)   │                    │
│  └─────────────┘     └──────────┬──────────┘                    │
│                                 │                                │
│                                 ▼                                │
│                      ┌─────────────────────┐                    │
│                      │  EuroComply DPP     │                    │
│                      │  links + queries    │                    │
│                      └─────────────────────┘                    │
│                                                                  │
│  OPTION C: Embedded Key Events (Hybrid)                         │
│  ─────────────────────────────────────────                      │
│  • Store essential events directly in DPP                       │
│  • Manufacturing, key milestones                                │
│  • Link to full EPCIS for detailed history                      │
│  • Works offline                                                │
│                                                                  │
│  RECOMMENDATION: Option A (hosted) as default                   │
│  with Option B for enterprise customers with existing EPCIS     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  EPCIS DATA FLOW                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                    EVENT SOURCES                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                                                           │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │  │
│  │  │   ERP   │  │   WMS   │  │   IoT   │  │  Manual │     │  │
│  │  │ System  │  │ System  │  │ Sensors │  │  Entry  │     │  │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘     │  │
│  │       │            │            │            │           │  │
│  └───────┼────────────┼────────────┼────────────┼───────────┘  │
│          │            │            │            │               │
│          └────────────┴─────┬──────┴────────────┘               │
│                             │                                   │
│                             ▼                                   │
│              ┌─────────────────────────────┐                   │
│              │   EUROCOMPLY EPCIS API      │                   │
│              │   /api/v1/epcis/capture     │                   │
│              └──────────────┬──────────────┘                   │
│                             │                                   │
│          ┌──────────────────┼──────────────────┐               │
│          │                  │                  │               │
│          ▼                  ▼                  ▼               │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐          │
│  │   Event     │   │   Carbon    │   │  Real-time  │          │
│  │   Store     │   │  Calculator │   │  Webhooks   │          │
│  │ (PostgreSQL)│   │  (Aggregate)│   │ (Partners)  │          │
│  └──────┬──────┘   └──────┬──────┘   └─────────────┘          │
│         │                 │                                    │
│         └────────┬────────┘                                    │
│                  │                                             │
│                  ▼                                             │
│         ┌─────────────────┐                                    │
│         │   DPP Lifecycle │                                    │
│         │   Display       │                                    │
│         └─────────────────┘                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Model

### Prisma Schema

```prisma
// EPCIS Event Types
enum EpcisEventType {
  OBJECT_EVENT
  AGGREGATION_EVENT
  TRANSFORMATION_EVENT
  TRANSACTION_EVENT
}

// Action types
enum EpcisAction {
  ADD
  OBSERVE
  DELETE
}

// Main EPCIS Event table
model EpcisEvent {
  id                    String          @id @default(cuid())
  organizationId        String
  organization          Organization    @relation(fields: [organizationId], references: [id])

  // Event identification
  eventId               String          @unique  // URN format
  eventType             EpcisEventType
  action                EpcisAction

  // Timing
  eventTime             DateTime
  eventTimeZoneOffset   String
  recordTime            DateTime        @default(now())

  // What
  epcList               String[]        // Array of EPC URNs
  parentId              String?         // For aggregation events
  childEpcs             String[]        // For aggregation events
  inputEpcList          String[]        // For transformation events
  outputEpcList         String[]        // For transformation events

  // Where
  readPoint             String?         // GLN or geo URI
  bizLocation           String?         // GLN

  // Why
  bizStep               String?         // CBV business step
  disposition           String?         // CBV disposition

  // Business transactions
  bizTransactions       Json?           // Array of {type, id}

  // Sensor data
  sensorData            Json?           // EPCIS 2.0 sensor elements

  // ESPR extensions
  carbonFootprint       Float?          // kg CO2e
  carbonScope           Int?            // 1, 2, or 3
  energyConsumption     Float?          // kWh
  transportMode         String?         // road, rail, sea, air
  transportDistance     Float?          // km

  // Full event in JSON-LD format
  rawEvent              Json

  // Indexing
  createdAt             DateTime        @default(now())
  updatedAt             DateTime        @updatedAt

  // Relations
  passportEvents        PassportEpcisEvent[]

  @@index([organizationId])
  @@index([eventTime])
  @@index([bizStep])
  @@index([epcList])
  @@index([readPoint])
}

// Link table: DPP <-> EPCIS Events
model PassportEpcisEvent {
  id            String      @id @default(cuid())
  passportId    String
  passport      Passport    @relation(fields: [passportId], references: [id])
  epcisEventId  String
  epcisEvent    EpcisEvent  @relation(fields: [epcisEventId], references: [id])

  // Linking metadata
  linkedAt      DateTime    @default(now())
  linkReason    String?     // 'auto_gtin_match', 'manual', 'batch_match'

  @@unique([passportId, epcisEventId])
  @@index([passportId])
  @@index([epcisEventId])
}

// Location master data
model EpcisLocation {
  id              String        @id @default(cuid())
  organizationId  String
  organization    Organization  @relation(fields: [organizationId], references: [id])

  gln             String        @unique  // Global Location Number
  name            String
  type            String        // warehouse, factory, store, etc.

  // Address
  streetAddress   String?
  city            String?
  postalCode      String?
  country         String        // ISO 3166-1 alpha-2

  // Coordinates
  latitude        Float?
  longitude       Float?

  // Metadata
  isActive        Boolean       @default(true)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  @@index([organizationId])
  @@index([gln])
  @@index([country])
}

// Extend Passport model
model Passport {
  // ... existing fields ...

  // EPCIS integration
  epcisEvents       PassportEpcisEvent[]

  // External EPCIS repository (if not using EuroComply's)
  externalEpcisUrl  String?  // e.g., https://epcis.customer.com
  externalEpcisAuth String?  // Encrypted auth token

  // Aggregated lifecycle data (cached)
  totalCarbonFootprint   Float?   // Sum of all event carbon footprints
  lastEventTime          DateTime?
  eventCount             Int      @default(0)
}
```

### GS1 CBV (Core Business Vocabulary)

```typescript
// Business Steps (urn:epcglobal:cbv:bizstep:*)
const BUSINESS_STEPS = {
  // Manufacturing
  commissioning: 'urn:epcglobal:cbv:bizstep:commissioning',      // Product created
  decommissioning: 'urn:epcglobal:cbv:bizstep:decommissioning',  // Product destroyed

  // Logistics
  shipping: 'urn:epcglobal:cbv:bizstep:shipping',
  receiving: 'urn:epcglobal:cbv:bizstep:receiving',
  packing: 'urn:epcglobal:cbv:bizstep:packing',
  unpacking: 'urn:epcglobal:cbv:bizstep:unpacking',
  loading: 'urn:epcglobal:cbv:bizstep:loading',
  unloading: 'urn:epcglobal:cbv:bizstep:unloading',
  transporting: 'urn:epcglobal:cbv:bizstep:transporting',

  // Warehousing
  storing: 'urn:epcglobal:cbv:bizstep:storing',
  picking: 'urn:epcglobal:cbv:bizstep:picking',

  // Retail
  retail_selling: 'urn:epcglobal:cbv:bizstep:retail_selling',

  // Quality
  inspecting: 'urn:epcglobal:cbv:bizstep:inspecting',

  // Circular economy
  repairing: 'urn:epcglobal:cbv:bizstep:repairing',
  recycling: 'urn:epcglobal:cbv:bizstep:recycling',

  // Other
  other: 'urn:epcglobal:cbv:bizstep:other',
} as const;

// Dispositions (urn:epcglobal:cbv:disp:*)
const DISPOSITIONS = {
  active: 'urn:epcglobal:cbv:disp:active',
  inactive: 'urn:epcglobal:cbv:disp:inactive',
  in_transit: 'urn:epcglobal:cbv:disp:in_transit',
  sellable_accessible: 'urn:epcglobal:cbv:disp:sellable_accessible',
  sellable_not_accessible: 'urn:epcglobal:cbv:disp:sellable_not_accessible',
  damaged: 'urn:epcglobal:cbv:disp:damaged',
  disposed: 'urn:epcglobal:cbv:disp:disposed',
  recalled: 'urn:epcglobal:cbv:disp:recalled',
  stolen: 'urn:epcglobal:cbv:disp:stolen',
  unknown: 'urn:epcglobal:cbv:disp:unknown',
} as const;
```

---

## API Design

### EPCIS 2.0 REST API

```typescript
// Base URL: /api/v1/epcis

// ===== CAPTURE INTERFACE =====

// POST /capture - Capture one or more events
interface CaptureRequest {
  '@context': string[];
  type: 'EPCISDocument';
  schemaVersion: '2.0';
  creationDate: string;
  epcisBody: {
    eventList: EpcisEvent[];
  };
}

// Response: 202 Accepted (async processing)
interface CaptureResponse {
  success: true;
  data: {
    captureId: string;
    eventsReceived: number;
    status: 'processing';
  };
}

// POST /capture/events - Capture single event (simplified)
// Accepts individual event without EPCIS document wrapper

// GET /capture/{captureId} - Get capture status
interface CaptureStatus {
  captureId: string;
  status: 'processing' | 'completed' | 'error';
  eventsProcessed: number;
  errors?: Array<{ eventId: string; error: string }>;
}


// ===== QUERY INTERFACE =====

// GET /events - Query events
interface EventQueryParams {
  // Time range
  eventTime_GE?: string;  // Greater than or equal
  eventTime_LT?: string;  // Less than
  recordTime_GE?: string;
  recordTime_LT?: string;

  // What
  match_epc?: string;           // Exact EPC match
  match_anyEPC?: string[];      // Any of these EPCs
  match_epcClass?: string;      // Class-level match

  // Where
  match_readPoint?: string;     // Exact location
  match_bizLocation?: string;

  // Why
  match_bizStep?: string;
  match_disposition?: string;

  // Event type
  eventType?: EpcisEventType[];
  action?: EpcisAction[];

  // Pagination
  perPage?: number;  // Default 30, max 100
  nextPageToken?: string;

  // Format
  format?: 'json' | 'json-ld';
}

// GET /events/{eventId} - Get single event
// Returns full EPCIS event in JSON-LD format

// GET /eventTypes - List supported event types

// GET /vocabularies - Get CBV vocabularies (bizSteps, dispositions)


// ===== EUROCOMPLY EXTENSIONS =====

// GET /products/{gtin}/lifecycle
// Get all events for a product (by GTIN)
interface ProductLifecycleResponse {
  success: true;
  data: {
    gtin: string;
    eventCount: number;
    firstEvent: string;  // ISO date
    lastEvent: string;
    totalCarbonFootprint: number;
    events: EpcisEvent[];
  };
}

// GET /products/{gtin}/carbon
// Get carbon footprint summary
interface CarbonSummaryResponse {
  success: true;
  data: {
    gtin: string;
    total: number;  // kg CO2e
    byScope: {
      scope1: number;
      scope2: number;
      scope3: number;
    };
    byTransportMode: {
      road: number;
      rail: number;
      sea: number;
      air: number;
    };
    events: Array<{
      eventId: string;
      eventTime: string;
      bizStep: string;
      carbonFootprint: number;
    }>;
  };
}

// POST /products/{gtin}/link-event
// Manually link an EPCIS event to a DPP
interface LinkEventRequest {
  eventId: string;
  reason?: string;
}
```

### Webhook Events

```typescript
// EPCIS webhooks for real-time notifications

interface EpcisWebhook {
  type: 'epcis.event.captured';
  timestamp: string;
  data: {
    eventId: string;
    eventType: EpcisEventType;
    epcList: string[];
    bizStep: string;
    organizationId: string;

    // Quick summary
    summary: string;  // e.g., "Product shipped from Berlin warehouse"
  };
}

// Webhook registration
// POST /webhooks
interface WebhookRegistration {
  url: string;
  events: string[];  // ['epcis.event.captured', 'epcis.carbon.threshold']
  filters?: {
    bizSteps?: string[];
    eventTypes?: EpcisEventType[];
    locations?: string[];
  };
}
```

---

## UI/UX Design

### Product Lifecycle Timeline

```
┌─────────────────────────────────────────────────────────────────┐
│  PRODUCT LIFECYCLE                                               │
│  GTIN: 4012345012345 | T-Shirt | Blue Cotton                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Total Carbon Footprint: 8.5 kg CO2e                            │
│  ███████████████████░░░░░░░░░░░░░░░░░░░░░ 42% of category avg   │
│                                                                  │
│  ──────────────────────────────────────────────────────────────│
│                                                                  │
│  ● Jan 10, 2026 08:00 - MANUFACTURED                           │
│  │ Factory: TextilCo GmbH, Berlin                               │
│  │ Carbon: 2.5 kg CO2e (Scope 1)                               │
│  │ Energy: 3.2 kWh (85% renewable)                             │
│  │                                                              │
│  ● Jan 10, 2026 10:00 - PACKED                                 │
│  │ Location: Berlin Warehouse                                   │
│  │ Container: SSCC 340123450000000001                          │
│  │                                                              │
│  ● Jan 10, 2026 14:00 - SHIPPED                                │
│  │ From: Berlin → To: Munich                                    │
│  │ Mode: Road (450 km)                                         │
│  │ Carbon: 4.2 kg CO2e (Scope 3)                               │
│  │ Temperature: 4°C - 8°C ✓                                    │
│  │                                                              │
│  ● Jan 11, 2026 09:00 - RECEIVED                               │
│  │ Location: Munich Distribution Center                        │
│  │ Condition: Good                                              │
│  │                                                              │
│  ● Jan 12, 2026 11:00 - SOLD                                   │
│  │ Retailer: EcoFashion Store                                  │
│  │ Invoice: INV-2026-00123                                     │
│  │ Carbon: 1.8 kg CO2e (Scope 3)                               │
│  │                                                              │
│  ○ Future: END OF LIFE                                         │
│    Recommended: Textile recycling                               │
│    Nearest facility: Munich Recycling GmbH (2.3 km)            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Event Entry Form

```
┌─────────────────────────────────────────────────────────────────┐
│  ADD LIFECYCLE EVENT                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Event Type:  ┌──────────────────────────┐                      │
│               │ ▼ Shipping              │                       │
│               └──────────────────────────┘                      │
│                                                                  │
│  Products:    ┌──────────────────────────────────────────────┐ │
│               │ GTIN: 4012345012345 - Blue Cotton T-Shirt    │ │
│               │ + Add more products                          │ │
│               └──────────────────────────────────────────────┘ │
│                                                                  │
│  Date & Time: ┌──────────────────────────┐                      │
│               │ 2026-01-10 14:00        │                       │
│               └──────────────────────────┘                      │
│                                                                  │
│  From:        ┌──────────────────────────────────────────────┐ │
│               │ ▼ Berlin Warehouse (GLN: 4012345000010)      │ │
│               └──────────────────────────────────────────────┘ │
│                                                                  │
│  To:          ┌──────────────────────────────────────────────┐ │
│               │ ▼ Munich Distribution (GLN: 4012345000020)   │ │
│               └──────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ TRANSPORT DETAILS ────────────────────────────────────────┐│
│  │                                                             ││
│  │  Mode:      ⚫ Road  ○ Rail  ○ Sea  ○ Air                  ││
│  │                                                             ││
│  │  Distance:  ┌──────┐ km                                    ││
│  │             │ 450  │                                       ││
│  │             └──────┘                                       ││
│  │                                                             ││
│  │  Vehicle:   ┌──────────────────────────┐                   ││
│  │             │ ▼ Truck (40t)            │                   ││
│  │             └──────────────────────────┘                   ││
│  │                                                             ││
│  │  ☑ Calculate carbon footprint automatically                ││
│  │    Estimated: 4.2 kg CO2e                                  ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─ SENSOR DATA (Optional) ───────────────────────────────────┐│
│  │                                                             ││
│  │  Temperature:  Min ┌────┐  Max ┌────┐  °C                  ││
│  │                    │ 4  │      │ 8  │                      ││
│  │                    └────┘      └────┘                      ││
│  │                                                             ││
│  │  Humidity:     ┌────┐ %                                    ││
│  │                │ 65 │                                      ││
│  │                └────┘                                      ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│                     ┌────────────┐  ┌────────────────┐         │
│                     │   Cancel   │  │  Record Event  │         │
│                     └────────────┘  └────────────────┘         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### DPP Public Page Integration

```
┌─────────────────────────────────────────────────────────────────┐
│  DIGITAL PRODUCT PASSPORT                                        │
│  ─────────────────────────                                      │
│                                                                  │
│  [Product Image]                                                │
│                                                                  │
│  Blue Cotton T-Shirt                                            │
│  GTIN: 4012345012345                                            │
│  Manufacturer: TextilCo GmbH                                    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  TABS: [Overview] [Materials] [Lifecycle] [Carbon] [Verify]│││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ═══════════════════════════════════════════════════════════   │
│                                                                  │
│  LIFECYCLE TAB:                                                 │
│  ──────────────                                                 │
│                                                                  │
│  This product's journey:                                        │
│                                                                  │
│  🏭 Manufactured in Berlin, Germany                             │
│     January 10, 2026                                            │
│                                                                  │
│  📦 Shipped to Munich Distribution Center                       │
│     450 km by road | 4.2 kg CO2e                               │
│                                                                  │
│  🏪 Sold at EcoFashion Store                                   │
│     January 12, 2026                                            │
│                                                                  │
│  ♻️ End of life recommendation:                                │
│     Textile recycling (90% recyclable)                         │
│                                                                  │
│  [View full timeline →]                                         │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  CARBON TAB:                                                    │
│  ───────────                                                    │
│                                                                  │
│  Total Carbon Footprint: 8.5 kg CO2e                           │
│                                                                  │
│  Breakdown:                                                     │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Manufacturing     ████████████░░░░░░░░░░░░░  29%        │    │
│  │ Transport         █████████████████████░░░░  51%        │    │
│  │ Retail            ████████░░░░░░░░░░░░░░░░░  20%        │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Compared to category average:                                  │
│  ██████████████████░░░░░░░░░░░░░░░░░░░░░ 42% lower             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Core EPCIS Repository (Now)

| Task | Priority | Complexity | Status |
|------|----------|------------|--------|
| Add EPCIS tables to Prisma schema | High | Low | Planned |
| Implement EPCIS event capture API | High | Medium | Planned |
| Build event query API (GS1 2.0 compatible) | High | Medium | Planned |
| Create GS1 CBV vocabulary constants | High | Low | Planned |
| Build EPC/GTIN converter utilities | High | Low | Planned |
| Implement automatic DPP-to-event linking | High | Medium | Planned |
| Add ESPR extension fields (carbon, transport) | High | Low | Planned |

### Phase 2: UI/UX

| Task | Priority | Complexity | Status |
|------|----------|------------|--------|
| Product lifecycle timeline component | High | Medium | Planned |
| Event entry form (manual entry) | High | Medium | Planned |
| Location management UI | Medium | Low | Planned |
| Add lifecycle tab to DPP public page | High | Medium | Planned |
| Carbon footprint visualization | High | Medium | Planned |
| Event history export (CSV, EPCIS XML/JSON) | Medium | Low | Planned |

### Phase 3: Integrations

| Task | Priority | Complexity | Status |
|------|----------|------------|--------|
| ERP integration guide (SAP, Oracle) | Medium | Low | Planned |
| Webhook system for real-time events | Medium | Medium | Planned |
| IoT sensor data ingestion API | Low | Medium | Planned |
| External EPCIS repository linking | Medium | Medium | Planned |
| Shopify fulfillment event sync | Medium | Medium | Planned |

### Phase 4: Advanced Features

| Task | Priority | Complexity | Status |
|------|----------|------------|--------|
| Automated carbon calculation | Medium | High | Planned |
| Transport route optimization suggestions | Low | High | Planned |
| Batch event upload (CSV/Excel) | Medium | Low | Planned |
| Event verification (attestation) | Low | High | Planned |
| Circular economy event types (repair, recycle) | Medium | Low | Planned |

---

## Integration Examples

### ERP Integration (SAP)

```typescript
// SAP SD/MM sends shipment events
// Typical integration via SAP BTP or middleware

// Webhook from SAP
const sapShipmentEvent = {
  header: {
    documentNumber: '0080000123',
    documentType: 'DELIVERY',
    createdAt: '2026-01-10T14:00:00+01:00',
  },
  items: [
    { material: '4012345012345', quantity: 100, unit: 'EA' },
  ],
  shipping: {
    shipFrom: { plant: '1000', name: 'Berlin Factory' },
    shipTo: { customer: '0000100001', name: 'Munich DC' },
    carrier: 'DHL',
    trackingNumber: '1234567890',
  },
};

// Transform to EPCIS
async function transformSapToEpcis(sapEvent: SapShipment): Promise<ObjectEvent> {
  return {
    type: 'ObjectEvent',
    eventTime: sapEvent.header.createdAt,
    eventTimeZoneOffset: '+01:00',
    epcList: sapEvent.items.map(item =>
      `urn:epc:id:sgtin:${gtinToSgtin(item.material)}`
    ),
    action: 'OBSERVE',
    bizStep: 'urn:epcglobal:cbv:bizstep:shipping',
    disposition: 'urn:epcglobal:cbv:disp:in_transit',
    readPoint: `urn:epc:id:sgln:${plantToGln(sapEvent.shipping.shipFrom.plant)}`,
    bizLocation: `urn:epc:id:sgln:${customerToGln(sapEvent.shipping.shipTo.customer)}`,
  };
}
```

### IoT Sensor Integration

```typescript
// IoT device sends sensor readings
// Typical: MQTT broker → EuroComply API

interface SensorReading {
  deviceId: string;
  timestamp: string;
  readings: {
    temperature?: number;
    humidity?: number;
    location?: { lat: number; lng: number };
    shock?: number;
  };
  containerId: string; // SSCC
}

// Transform to EPCIS with sensor data
async function createSensorEvent(reading: SensorReading): Promise<ObjectEvent> {
  return {
    type: 'ObjectEvent',
    eventTime: reading.timestamp,
    eventTimeZoneOffset: '+00:00',
    epcList: [`urn:epc:id:sscc:${reading.containerId}`],
    action: 'OBSERVE',
    bizStep: 'urn:epcglobal:cbv:bizstep:transporting',
    readPoint: reading.readings.location
      ? `geo:${reading.readings.location.lat},${reading.readings.location.lng}`
      : undefined,
    sensorElementList: [
      {
        sensorMetadata: {
          time: reading.timestamp,
          deviceID: `urn:epc:id:giai:0614141.${reading.deviceId}`,
        },
        sensorReport: [
          reading.readings.temperature !== undefined && {
            type: 'gs1:Temperature',
            value: reading.readings.temperature,
            uom: 'CEL',
          },
          reading.readings.humidity !== undefined && {
            type: 'gs1:Humidity',
            value: reading.readings.humidity,
            uom: 'P1',
          },
        ].filter(Boolean),
      },
    ],
  };
}
```

### Shopify Fulfillment Sync

```typescript
// Shopify sends fulfillment webhook
// Transform to EPCIS shipping event

interface ShopifyFulfillment {
  id: number;
  order_id: number;
  status: 'pending' | 'open' | 'success' | 'cancelled' | 'failure';
  created_at: string;
  tracking_number?: string;
  tracking_company?: string;
  line_items: Array<{
    sku: string;
    quantity: number;
    gtin?: string;
  }>;
  destination: {
    country_code: string;
    city: string;
  };
}

async function handleShopifyFulfillment(fulfillment: ShopifyFulfillment): Promise<void> {
  if (fulfillment.status !== 'success') return;

  // Find products with DPPs
  const productsWithDpp = fulfillment.line_items.filter(item => item.gtin);

  if (productsWithDpp.length === 0) return;

  // Create EPCIS event
  const event: ObjectEvent = {
    type: 'ObjectEvent',
    eventTime: fulfillment.created_at,
    eventTimeZoneOffset: '+00:00',
    epcList: productsWithDpp.map(item =>
      `urn:epc:id:sgtin:${gtinToEpc(item.gtin!)}`
    ),
    action: 'OBSERVE',
    bizStep: 'urn:epcglobal:cbv:bizstep:shipping',
    disposition: 'urn:epcglobal:cbv:disp:in_transit',
    readPoint: 'urn:eurocomply:shopify:fulfillment',
  };

  // Add tracking reference
  if (fulfillment.tracking_number) {
    event.bizTransactionList = [
      {
        type: 'urn:epcglobal:cbv:btt:desadv',
        bizTransaction: fulfillment.tracking_number,
      },
    ];
  }

  await epcisClient.capture([event]);
}
```

---

## Configuration

### Environment Variables

```bash
# .env

# ===========================================
# EPCIS Configuration
# ===========================================
EPCIS_ENABLED=true
EPCIS_AUTO_LINK=true               # Auto-link events to DPPs by GTIN

# Carbon calculation
CARBON_CALCULATION_ENABLED=true
CARBON_ROAD_KG_PER_KM=0.00012      # kg CO2e per km per kg
CARBON_RAIL_KG_PER_KM=0.00003
CARBON_SEA_KG_PER_KM=0.00001
CARBON_AIR_KG_PER_KM=0.00050

# External EPCIS (for linking to customer repositories)
EPCIS_EXTERNAL_ENABLED=true

# Webhooks
EPCIS_WEBHOOK_SECRET=whsec_...     # For signing webhook payloads
EPCIS_WEBHOOK_RETRY_COUNT=3
EPCIS_WEBHOOK_TIMEOUT_MS=5000
```

---

## GS1 Compliance

### EPCIS 2.0 Conformance

EuroComply's EPCIS implementation is designed for GS1 conformance:

| Requirement | Status |
|-------------|--------|
| JSON-LD format support | ✅ Planned |
| REST capture interface | ✅ Planned |
| REST query interface | ✅ Planned |
| All 4 event types | ✅ Planned |
| CBV 2.0 business vocabulary | ✅ Planned |
| Sensor data support | ✅ Planned |
| OAuth 2.0 authentication | ✅ Planned |
| GS1 Digital Link in events | ✅ Planned |

### EPC URN Formats

```typescript
// Supported EPC formats

// SGTIN (Serialized GTIN) - individual products
// urn:epc:id:sgtin:<company>.<item>.<serial>
const sgtin = 'urn:epc:id:sgtin:0614141.107346.2017';

// LGTIN (Lot/Batch GTIN) - batch tracking
// urn:epc:id:lgtin:<company>.<item>.<lot>
const lgtin = 'urn:epc:id:lgtin:0614141.107346.LOT001';

// SSCC (Serial Shipping Container Code) - logistics units
// urn:epc:id:sscc:<company>.<serial>
const sscc = 'urn:epc:id:sscc:0614141.1234567890';

// SGLN (Serialized GLN) - locations
// urn:epc:id:sgln:<company>.<location>.<extension>
const sgln = 'urn:epc:id:sgln:0614141.00001.0';

// GIAI (Global Individual Asset Identifier) - equipment/devices
// urn:epc:id:giai:<company>.<asset>
const giai = 'urn:epc:id:giai:0614141.SENSOR001';

// Conversion utilities
function gtinToSgtin(gtin: string, serial: string): string {
  const company = gtin.slice(1, 8);  // GS1 company prefix
  const item = gtin.slice(8, 13);    // Item reference
  return `urn:epc:id:sgtin:${company}.${item}.${serial}`;
}

function sgtinToGtin(sgtin: string): { gtin: string; serial: string } {
  const match = sgtin.match(/urn:epc:id:sgtin:(\d+)\.(\d+)\.(.+)/);
  if (!match) throw new Error('Invalid SGTIN');
  const [, company, item, serial] = match;
  const checkDigit = calculateGtinCheckDigit(company + item);
  return {
    gtin: '0' + company + item + checkDigit,
    serial,
  };
}
```

---

## Summary

```
┌─────────────────────────────────────────────────────────────────┐
│  EPCIS 2.0 INTEGRATION SUMMARY                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WHAT WE'RE BUILDING                                            │
│  ─────────────────────                                          │
│  Full EPCIS 2.0 repository integrated from day one              │
│  • GS1 compliant REST API                                       │
│  • All 4 event types                                            │
│  • IoT sensor data support                                      │
│  • ESPR carbon footprint extensions                             │
│  • Automatic DPP linking by GTIN                                │
│                                                                  │
│  WHY IT MATTERS                                                 │
│  ───────────────                                                │
│  • ESPR requires supply chain traceability                      │
│  • Carbon footprint needs transport events                      │
│  • Repair/refurbishment history mandatory                       │
│  • Customers expect lifecycle visibility                        │
│                                                                  │
│  INTEGRATION OPTIONS                                            │
│  ────────────────────                                           │
│  A. EuroComply-hosted (default)                                 │
│  B. Link to external EPCIS (SAP, IBM)                          │
│  C. Hybrid with key events embedded                             │
│                                                                  │
│  KEY DIFFERENTIATOR                                             │
│  ────────────────────                                           │
│  DPP + EPCIS in one platform                                    │
│  • Static product info (DPP)                                    │
│  • Dynamic lifecycle events (EPCIS)                             │
│  • Unified carbon footprint view                                │
│  • Single source of truth                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## References

- [GS1 EPCIS 2.0 Standard](https://www.gs1.org/standards/epcis)
- [EPCIS 2.0 Specification (PDF)](https://ref.gs1.org/standards/epcis/)
- [GS1 Core Business Vocabulary (CBV)](https://www.gs1.org/standards/epcis/cbv)
- [GS1 Digital Link Standard](https://www.gs1.org/standards/gs1-digital-link)
- [ESPR Regulation](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1781)
- [GHG Protocol](https://ghgprotocol.org/)

---

*Last Updated: January 10, 2026*
