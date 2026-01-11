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

## EuroComply's Role: Hybrid EPCIS Model

### The Key Insight

EuroComply operates a **Hybrid EPCIS Model**:
1. **Read from enterprise EPCIS** - Query existing SAP/IBM/TraceLink repositories
2. **Host OpenEPCIS for SMB** - Provide EPCIS hosting for customers/suppliers who don't have their own

```
┌─────────────────────────────────────────────────────────────────┐
│  HYBRID EPCIS ARCHITECTURE                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PATH A: ENTERPRISE CUSTOMERS (Have their own EPCIS)            │
│  ───────────────────────────────────────────────────            │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐                       │
│  │ SAP EPCIS       │  │ IBM Sterling    │  (Customer infra)     │
│  │ Repository      │  │ Repository      │                       │
│  └────────┬────────┘  └────────┬────────┘                       │
│           │                    │                                 │
│           └─────────┬──────────┘                                 │
│                     │ READ (EPCIS 2.0 REST API)                 │
│                     ▼                                           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   EUROCOMPLY PLATFORM                        ││
│  │         (Query Client + Story Builder + DPP Display)         ││
│  └─────────────────────────────────────────────────────────────┘│
│                     ▲                                           │
│                     │ READ + WRITE                              │
│           ┌─────────┴──────────┐                                 │
│           │                    │                                 │
│  ┌────────┴────────┐  ┌────────┴────────┐                       │
│  │ EuroComply      │  │ Manual Entry    │                       │
│  │ OpenEPCIS       │  │ Portal          │  (Our infra)          │
│  │ (Hosted)        │  │ (SMB Suppliers) │                       │
│  └─────────────────┘  └─────────────────┘                       │
│                                                                  │
│  PATH B: SMB CUSTOMERS/SUPPLIERS (Need hosted EPCIS)            │
│  ───────────────────────────────────────────────────            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Why Hybrid?

**The reality of our SMB/Mid-market target:**

Most SMB manufacturers and suppliers (our primary market) do NOT have:
- SAP, IBM Sterling, or TraceLink EPCIS repositories
- Internal IT teams to deploy OpenEPCIS themselves
- Budget for enterprise EPCIS solutions

**Without hosted EPCIS, the "manual entry portal" would have nowhere to store events.**

| Customer Type | Their EPCIS Situation | Our Solution |
|---------------|----------------------|--------------|
| Enterprise (Nestlé, H&M) | Have SAP/IBM EPCIS | Read from their systems |
| Mid-market manufacturer | No EPCIS, have ERP | Host OpenEPCIS for them |
| SMB supplier | No EPCIS, no ERP | Manual portal → our OpenEPCIS |

### What We Build

| Component | Description |
|-----------|-------------|
| ✅ EPCIS Query Client | Read from ANY EPCIS 2.0 repository (SAP, IBM, etc.) |
| ✅ Hosted OpenEPCIS | Multi-tenant EPCIS for SMB customers/suppliers |
| ✅ Story Builder | Transform JSON → beautiful timelines |
| ✅ Manual Entry Portal | Simple UI for suppliers without systems |
| ✅ DPP Lifecycle Display | Public-facing product journey visualization |

**Benefits of hybrid approach:**
- **Works with enterprise systems** - Don't force customers to migrate
- **Enables SMB participation** - Without requiring infrastructure investment
- **Data sovereignty options** - Enterprise keeps their data, SMB uses ours
- **Single visualization layer** - Unified view regardless of data source

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

## Architecture

### Hybrid EPCIS Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  EUROCOMPLY HYBRID EPCIS ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  EXTERNAL EPCIS REPOSITORIES (Enterprise customers)             │
│  ─────────────────────────────────────────────────              │
│                                                                  │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │ SAP EPCIS     │  │ IBM Sterling  │  │ TraceLink     │       │
│  │ (Customer A)  │  │ (Customer B)  │  │ (Customer C)  │       │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘       │
│          │                  │                  │                 │
│          │   EPCIS 2.0 REST API (READ)        │                 │
│          └──────────────────┼──────────────────┘                 │
│                             │                                    │
│                             ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   EUROCOMPLY PLATFORM                        ││
│  │                                                              ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │              EPCIS QUERY CLIENT                      │   ││
│  │  │  • Queries external repositories (SAP, IBM, etc.)    │   ││
│  │  │  • Queries our hosted OpenEPCIS                      │   ││
│  │  │  • Handles OAuth 2.0 / API key authentication        │   ││
│  │  │  • Merges events from all sources                    │   ││
│  │  └─────────────────────────┬───────────────────────────┘   ││
│  │                            │                                ││
│  │                            ▼                                ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │              STORY BUILDER (Our Value)               │   ││
│  │  │  • Transforms raw EPCIS JSON → beautiful timelines   │   ││
│  │  │  • Resolves GLN → human-readable location names      │   ││
│  │  │  • Aggregates carbon footprint from transport events │   ││
│  │  │  • Unified view across all data sources              │   ││
│  │  └─────────────────────────┬───────────────────────────┘   ││
│  │                            │                                ││
│  │                            ▼                                ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │              DPP LIFECYCLE DISPLAY                   │   ││
│  │  │  • Public DPP pages with lifecycle tab               │   ││
│  │  │  • Mobile-friendly timeline visualization            │   ││
│  │  │  • Carbon footprint summary                          │   ││
│  │  │  • Export to PDF/CSV                                 │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                              ││
│  └──────────────────────────────┬──────────────────────────────┘│
│                                 │                                │
│                                 ▼                                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              EUROCOMPLY HOSTED OPENEPCIS                     ││
│  │              (For SMB customers/suppliers)                   ││
│  │                                                              ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │  PostgreSQL (Multi-tenant, organization_id)          │   ││
│  │  │  • Single cluster, partitioned by organization       │   ││
│  │  │  • Year 1-2: Hot storage only (simple)               │   ││
│  │  │  • Future: Cold tier (R2/Parquet) when >500GB        │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                              ││
│  │  Event Sources:                                             ││
│  │  • Manual Entry Portal (SMB suppliers)                      ││
│  │  • ERP Integrations (Webhook/API push)                      ││
│  │  • CSV/Excel Upload                                         ││
│  │                                                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### OpenEPCIS Infrastructure (Year 1-2 Strategy)

**Keep it simple - PostgreSQL only:**

```
┌─────────────────────────────────────────────────────────────────┐
│  YEAR 1-2 STORAGE STRATEGY                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PostgreSQL (Single Multi-tenant Cluster)                       │
│  ─────────────────────────────────────────                      │
│                                                                  │
│  epcis_events table:                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ organization_id  │ event_id  │ event_time │ event_json  │   │
│  │ (partition key)  │ (PK)      │ (indexed)  │ (JSONB)     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Why PostgreSQL is enough:                                      │
│  • Large retailer (1M SKUs) = 50M events/year = ~100 GB/year   │
│  • 100 customers at this scale = 10 TB (still manageable)       │
│  • PostgreSQL handles 10+ TB comfortably                        │
│  • Cost: ~$500/month for managed Postgres                       │
│                                                                  │
│  Future (when approaching 500GB-1TB):                           │
│  • Add cold tier: R2/S3 + Parquet                               │
│  • Events older than 30 days → cold storage                     │
│  • 7-year retention total                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Capacity & Fair Use Policy

| Metric | Policy |
|--------|--------|
| Events per product | ~100 events/product/year (typical) |
| Storage per org | "Unlimited" with fair use |
| Fair use threshold | >500 events/product/year triggers review |
| Enterprise override | Custom limits for >500K products |
| Retention | 7 years total (regulatory requirement) |

### Repository Connection Model

Customers configure their EPCIS repository connection(s):

```
┌─────────────────────────────────────────────────────────────────┐
│  REPOSITORY CONNECTION SETUP                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Organization: TextilCo GmbH                                    │
│                                                                  │
│  EPCIS Repositories:                                            │
│  ─────────────────────                                          │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Repository 1: Factory EPCIS                             │   │
│  │  URL: https://epcis.factory.textilco.de                  │   │
│  │  Auth: OAuth 2.0 (client credentials)                    │   │
│  │  Events: Manufacturing, quality control                  │   │
│  │  Status: ● Connected                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Repository 2: Logistics Partner (DHL)                   │   │
│  │  URL: https://epcis-api.dhl.com/v2                       │   │
│  │  Auth: API Key                                           │   │
│  │  Events: Shipping, in-transit, delivery                  │   │
│  │  Status: ● Connected                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Repository 3: Supplier (Cotton Farm)                    │   │
│  │  URL: https://epcis.supplier.example.com                 │   │
│  │  Auth: OAuth 2.0                                         │   │
│  │  Events: Raw material sourcing                           │   │
│  │  Status: ○ Pending supplier setup                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  [+ Add Repository]                                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### EPCIS Query Client

The query interface is standardized across ALL EPCIS 2.0 repositories:

```typescript
// src/services/epcis-query-client.ts
// Simple HTTP client - no Kafka, no OpenSearch, no infrastructure

interface EpcisRepository {
  id: string;
  name: string;
  baseUrl: string;          // e.g., https://epcis.supplier.com
  authType: 'oauth2' | 'apikey' | 'basic';
  credentials: {
    clientId?: string;
    clientSecret?: string;
    apiKey?: string;
    username?: string;
    password?: string;
  };
}

interface EpcisQueryOptions {
  epc?: string;              // Filter by product EPC
  eventTimeGE?: Date;        // Events after this time
  eventTimeLT?: Date;        // Events before this time
  bizStep?: string;          // Filter by business step
  eventType?: string[];      // Filter by event type
  limit?: number;            // Max results
}

class EpcisQueryClient {
  /**
   * Query events from an EPCIS 2.0 repository
   *
   * The EPCIS 2.0 REST API is standardized - this same code works with:
   * - OpenEPCIS (open source)
   * - IBM Sterling Supply Chain
   * - SAP EPCIS
   * - TraceLink
   * - Any GS1-compliant repository
   */
  async queryEvents(
    repository: EpcisRepository,
    options: EpcisQueryOptions
  ): Promise<EpcisEvent[]> {
    // Build query parameters (standard EPCIS 2.0 query syntax)
    const params = new URLSearchParams();

    if (options.epc) {
      params.set('EQ_epc', options.epc);  // Exact match
      // Or use MATCH_anyEPC for flexible matching
    }

    if (options.eventTimeGE) {
      params.set('GE_eventTime', options.eventTimeGE.toISOString());
    }

    if (options.eventTimeLT) {
      params.set('LT_eventTime', options.eventTimeLT.toISOString());
    }

    if (options.bizStep) {
      params.set('EQ_bizStep', options.bizStep);
    }

    if (options.eventType?.length) {
      params.set('eventType', options.eventType.join(','));
    }

    params.set('perPage', String(options.limit || 100));
    params.set('orderBy', 'eventTime');
    params.set('orderDirection', 'DESC');

    // Get auth token
    const authHeader = await this.getAuthHeader(repository);

    // Standard EPCIS 2.0 REST endpoint
    const response = await fetch(
      `${repository.baseUrl}/epcis/events?${params}`,
      {
        headers: {
          'Accept': 'application/json',
          'GS1-EPCIS-Version': '2.0',
          'GS1-CBV-Version': '2.0',
          ...authHeader,
        },
      }
    );

    if (!response.ok) {
      throw new EpcisQueryError(
        `Query failed: ${response.status} ${response.statusText}`,
        repository.name
      );
    }

    const data = await response.json();
    return data.epcisBody?.eventList || [];
  }

  /**
   * Query events from multiple repositories and merge
   */
  async queryAllRepositories(
    repositories: EpcisRepository[],
    options: EpcisQueryOptions
  ): Promise<EpcisEvent[]> {
    // Query all repositories in parallel
    const results = await Promise.allSettled(
      repositories.map(repo => this.queryEvents(repo, options))
    );

    // Collect successful results
    const allEvents: EpcisEvent[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allEvents.push(...result.value);
      } else {
        // Log failed repository but continue
        console.warn('Repository query failed:', result.reason);
      }
    }

    // Sort by eventTime (merge from multiple sources)
    return allEvents.sort((a, b) =>
      new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime()
    );
  }

  /**
   * Get a single event by ID
   */
  async getEvent(
    repository: EpcisRepository,
    eventId: string
  ): Promise<EpcisEvent | null> {
    const authHeader = await this.getAuthHeader(repository);

    const response = await fetch(
      `${repository.baseUrl}/epcis/events/${encodeURIComponent(eventId)}`,
      {
        headers: {
          'Accept': 'application/json',
          'GS1-EPCIS-Version': '2.0',
          ...authHeader,
        },
      }
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new EpcisQueryError(`Get event failed: ${response.status}`);
    }

    return response.json();
  }

  private async getAuthHeader(
    repository: EpcisRepository
  ): Promise<Record<string, string>> {
    switch (repository.authType) {
      case 'apikey':
        return { 'X-API-Key': repository.credentials.apiKey! };

      case 'oauth2':
        const token = await this.getOAuthToken(repository);
        return { 'Authorization': `Bearer ${token}` };

      case 'basic':
        const creds = btoa(
          `${repository.credentials.username}:${repository.credentials.password}`
        );
        return { 'Authorization': `Basic ${creds}` };

      default:
        return {};
    }
  }

  private async getOAuthToken(repository: EpcisRepository): Promise<string> {
    // Implementation of OAuth 2.0 client credentials flow
    // Cache tokens to avoid unnecessary requests
    // ...
  }
}

export const epcisClient = new EpcisQueryClient();
```

### Story Builder: Our Value Proposition

The Story Builder transforms raw EPCIS JSON into human-readable stories:

```typescript
// src/services/story-builder.ts
// This is where EuroComply adds value!

interface LifecycleStory {
  product: {
    gtin: string;
    name: string;
    image?: string;
  };
  timeline: TimelineEntry[];
  summary: {
    totalEvents: number;
    firstEvent: Date;
    lastEvent: Date;
    carbonFootprint: number;
    countriesVisited: string[];
    distanceTraveled: number;
  };
}

interface TimelineEntry {
  id: string;
  timestamp: Date;
  title: string;           // Human-readable: "Manufactured in Berlin"
  description: string;     // "Product was created at TextilCo Factory"
  location: {
    name: string;          // "TextilCo Factory" (resolved from GLN)
    city?: string;
    country: string;
    coordinates?: { lat: number; lng: number };
  };
  icon: string;            // 🏭 📦 🚛 🏪 ♻️
  carbon?: {
    value: number;
    unit: 'kg CO2e';
    breakdown?: string;
  };
  details?: Record<string, unknown>;  // Additional event data
  rawEvent: EpcisEvent;    // Original EPCIS event
}

class StoryBuilder {
  /**
   * Transform raw EPCIS events into a beautiful product story
   */
  async buildStory(
    gtin: string,
    events: EpcisEvent[],
    locationMaster: Map<string, LocationInfo>
  ): Promise<LifecycleStory> {
    const timeline: TimelineEntry[] = [];
    let totalCarbon = 0;
    const countries = new Set<string>();
    let totalDistance = 0;

    for (const event of events) {
      // Transform each event into a timeline entry
      const entry = await this.transformEvent(event, locationMaster);
      timeline.push(entry);

      // Aggregate carbon
      if (entry.carbon?.value) {
        totalCarbon += entry.carbon.value;
      }

      // Track countries
      if (entry.location.country) {
        countries.add(entry.location.country);
      }

      // Track distance (from transport events)
      if (event.espr?.transport?.distance) {
        totalDistance += event.espr.transport.distance;
      }
    }

    // Sort timeline chronologically
    timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return {
      product: await this.getProductInfo(gtin),
      timeline,
      summary: {
        totalEvents: events.length,
        firstEvent: timeline[0]?.timestamp || new Date(),
        lastEvent: timeline[timeline.length - 1]?.timestamp || new Date(),
        carbonFootprint: totalCarbon,
        countriesVisited: Array.from(countries),
        distanceTraveled: totalDistance,
      },
    };
  }

  /**
   * Transform a raw EPCIS event into a human-readable timeline entry
   */
  private async transformEvent(
    event: EpcisEvent,
    locationMaster: Map<string, LocationInfo>
  ): Promise<TimelineEntry> {
    // Get the business step in human-readable form
    const { title, icon, description } = this.getBizStepInfo(event.bizStep);

    // Resolve location from GLN to human-readable
    const location = await this.resolveLocation(
      event.readPoint || event.bizLocation,
      locationMaster
    );

    // Build description
    const fullDescription = this.buildDescription(event, location, description);

    // Calculate carbon if transport data available
    const carbon = this.extractCarbon(event);

    return {
      id: event.eventId || crypto.randomUUID(),
      timestamp: new Date(event.eventTime),
      title: `${title} in ${location.city || location.country}`,
      description: fullDescription,
      location,
      icon,
      carbon,
      rawEvent: event,
    };
  }

  /**
   * Map EPCIS business steps to human-readable info
   */
  private getBizStepInfo(bizStep: string): {
    title: string;
    icon: string;
    description: string;
  } {
    const mapping: Record<string, { title: string; icon: string; description: string }> = {
      'urn:epcglobal:cbv:bizstep:commissioning': {
        title: 'Manufactured',
        icon: '🏭',
        description: 'Product was created',
      },
      'urn:epcglobal:cbv:bizstep:shipping': {
        title: 'Shipped',
        icon: '📦',
        description: 'Product was dispatched',
      },
      'urn:epcglobal:cbv:bizstep:transporting': {
        title: 'In Transit',
        icon: '🚛',
        description: 'Product is being transported',
      },
      'urn:epcglobal:cbv:bizstep:receiving': {
        title: 'Received',
        icon: '📥',
        description: 'Product arrived at destination',
      },
      'urn:epcglobal:cbv:bizstep:retail_selling': {
        title: 'Sold',
        icon: '🏪',
        description: 'Product was sold to consumer',
      },
      'urn:epcglobal:cbv:bizstep:repairing': {
        title: 'Repaired',
        icon: '🔧',
        description: 'Product was repaired',
      },
      'urn:epcglobal:cbv:bizstep:recycling': {
        title: 'Recycled',
        icon: '♻️',
        description: 'Product reached end of life',
      },
    };

    return mapping[bizStep] || {
      title: 'Event',
      icon: '📌',
      description: 'Lifecycle event recorded',
    };
  }

  /**
   * Resolve GLN to human-readable location
   */
  private async resolveLocation(
    gln: string | undefined,
    locationMaster: Map<string, LocationInfo>
  ): Promise<TimelineEntry['location']> {
    if (!gln) {
      return { name: 'Unknown Location', country: 'Unknown' };
    }

    // Check local master data first
    const known = locationMaster.get(gln);
    if (known) {
      return {
        name: known.name,
        city: known.city,
        country: known.country,
        coordinates: known.coordinates,
      };
    }

    // Could also query GS1 resolver service for unknown GLNs
    // For now, return the GLN as-is
    return {
      name: `Location ${gln}`,
      country: 'Unknown',
    };
  }

  private extractCarbon(event: EpcisEvent): TimelineEntry['carbon'] | undefined {
    // Check for ESPR carbon extension
    if (event.espr?.carbonFootprint) {
      return {
        value: event.espr.carbonFootprint.value,
        unit: 'kg CO2e',
        breakdown: `Scope ${event.espr.carbonFootprint.scope}`,
      };
    }

    // Calculate from transport data if available
    if (event.espr?.transport) {
      const distance = event.espr.transport.distance || 0;
      const mode = event.espr.transport.mode;
      const carbonFactor = this.getCarbonFactor(mode);
      const estimatedCarbon = distance * carbonFactor;

      if (estimatedCarbon > 0) {
        return {
          value: Math.round(estimatedCarbon * 100) / 100,
          unit: 'kg CO2e',
          breakdown: `${distance} km by ${mode}`,
        };
      }
    }

    return undefined;
  }

  private getCarbonFactor(mode: string): number {
    // kg CO2e per km (approximate averages)
    const factors: Record<string, number> = {
      'road': 0.0001,   // ~100g per km
      'rail': 0.00003,  // ~30g per km
      'sea': 0.00001,   // ~10g per km
      'air': 0.0005,    // ~500g per km
    };
    return factors[mode] || 0.0001;
  }
}

export const storyBuilder = new StoryBuilder();
```

---

## The "Empty Shell" Challenge

### The Problem

If suppliers don't write events to EPCIS repositories, we have nothing to display.

```
┌─────────────────────────────────────────────────────────────────┐
│  THE "EMPTY SHELL" RISK                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Scenario: Customer sets up DPP, connects EPCIS repository      │
│                                                                  │
│  Expected:                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  PRODUCT LIFECYCLE                                       │   │
│  │  ● Jan 8 - Raw materials sourced (Gujarat, India)       │   │
│  │  ● Jan 9 - Fabric woven (Textile Mill, Bangladesh)      │   │
│  │  ● Jan 10 - Manufactured (Berlin, Germany)              │   │
│  │  ● Jan 11 - Shipped to distribution                     │   │
│  │  ● Jan 12 - Received at warehouse                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Reality (if suppliers don't participate):                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  PRODUCT LIFECYCLE                                       │   │
│  │                                                          │   │
│  │  No lifecycle events found.                             │   │
│  │                                                          │   │
│  │  [?] Why is this empty?                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  THIS IS A BUSINESS PROBLEM, NOT A TECHNICAL ONE                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### The Solution: Supplier Onboarding

This is solved through **business processes**, not infrastructure:

```
┌─────────────────────────────────────────────────────────────────┐
│  SUPPLIER ONBOARDING STRATEGY                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TIER 1: Large Suppliers (Already have EPCIS)                   │
│  ─────────────────────────────────────────────                  │
│  • They already run SAP, IBM, or TraceLink EPCIS                │
│  • Just need to grant EuroComply read access                    │
│  • Setup: OAuth 2.0 client credentials                          │
│  • Effort: 1 hour configuration                                 │
│                                                                  │
│  TIER 2: Medium Suppliers (Have ERP, no EPCIS)                  │
│  ─────────────────────────────────────────────                  │
│  • They have SAP/Oracle/Dynamics but no EPCIS                   │
│  • Options:                                                     │
│    a) Deploy lightweight OpenEPCIS (open source, free)          │
│    b) Use cloud EPCIS service (GS1 Cloud, etc.)                │
│    c) Send events to customer's EPCIS via webhook               │
│  • Effort: 1-2 weeks integration                                │
│                                                                  │
│  TIER 3: Small Suppliers (Manual)                               │
│  ────────────────────────────────                               │
│  • No ERP or EPCIS capability                                   │
│  • Options:                                                     │
│    a) EuroComply provides simple web portal for manual entry    │
│    b) Events entered by customer based on delivery notes        │
│    c) Excel upload → EPCIS conversion                           │
│  • Effort: Training + manual process                            │
│                                                                  │
│  SUCCESS FACTORS                                                │
│  ───────────────                                                │
│  • Make it a procurement requirement                            │
│  • Start with Tier 1 suppliers (quick wins)                     │
│  • Provide templates and integration guides                     │
│  • ESPR deadline creates urgency                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Manual Event Capture (Hosted OpenEPCIS)

For suppliers who can't write to EPCIS, we provide a lightweight capture portal that writes to our hosted OpenEPCIS:

```
┌─────────────────────────────────────────────────────────────────┐
│  SUPPLIER EVENT ENTRY (Manual Portal → EuroComply OpenEPCIS)     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  You've been invited by TextileCo to record supply chain        │
│  events for: Cotton Fabric (GTIN: 4012345054321)                │
│                                                                  │
│  Event Type:  ┌──────────────────────────────────┐              │
│               │ ▼ Raw Material Received          │              │
│               └──────────────────────────────────┘              │
│                                                                  │
│  Date & Time: ┌──────────────────────────────────┐              │
│               │ 2026-01-08 09:30                 │              │
│               └──────────────────────────────────┘              │
│                                                                  │
│  Origin:      ┌──────────────────────────────────┐              │
│               │ Cotton Farm, Gujarat, India      │              │
│               └──────────────────────────────────┘              │
│                                                                  │
│  Quantity:    ┌────────┐                                        │
│               │ 500    │ kg                                     │
│               └────────┘                                        │
│                                                                  │
│  Certificate: [Upload] GOTS Organic Certificate.pdf             │
│                                                                  │
│                              ┌─────────────────┐                │
│                              │  Submit Event   │                │
│                              └─────────────────┘                │
│                                                                  │
│  Events are stored in EuroComply's hosted OpenEPCIS repository  │
│  and appear in the product's lifecycle timeline immediately.    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**How manual portal events flow:**

```
┌──────────────┐    ┌─────────────────┐    ┌─────────────────────┐
│   Supplier   │    │  Manual Entry   │    │  EuroComply         │
│   (no EPCIS) │───▶│  Portal         │───▶│  Hosted OpenEPCIS   │
└──────────────┘    └─────────────────┘    └──────────┬──────────┘
                                                      │
                                                      ▼
                                           ┌─────────────────────┐
                                           │  Story Builder      │
                                           │  (same as external) │
                                           └──────────┬──────────┘
                                                      │
                                                      ▼
                                           ┌─────────────────────┐
                                           │  DPP Lifecycle      │
                                           │  Timeline Display   │
                                           └─────────────────────┘
```

---

## Data Model

### Prisma Schema

```prisma
// Repository connection (customer configures their EPCIS endpoints)
model EpcisRepository {
  id              String        @id @default(cuid())
  organizationId  String
  organization    Organization  @relation(fields: [organizationId], references: [id])

  name            String        // "Factory EPCIS", "DHL Tracking", etc.
  baseUrl         String        // https://epcis.supplier.com
  authType        String        // 'oauth2', 'apikey', 'basic'

  // Encrypted credentials
  credentials     String        // Encrypted JSON

  // Connection status
  isActive        Boolean       @default(true)
  lastChecked     DateTime?
  lastError       String?

  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  @@index([organizationId])
}

// Location master data (for GLN resolution)
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

// Event cache (optional, for performance)
model EpcisEventCache {
  id              String        @id @default(cuid())
  organizationId  String

  // Event identification
  eventId         String        @unique  // Original EPCIS event ID
  repositoryId    String        // Which repository this came from

  // Cached data
  eventType       String
  eventTime       DateTime
  epcList         String[]      // Product identifiers
  bizStep         String?
  rawEvent        Json          // Full event JSON

  // Cache management
  cachedAt        DateTime      @default(now())
  expiresAt       DateTime      // When to refresh

  @@index([organizationId])
  @@index([eventTime])
  @@index([epcList])
}

// Extend Passport model
model Passport {
  // ... existing fields ...

  // EPCIS integration (no storage, just configuration)
  epcisEnabled          Boolean   @default(false)

  // Cached lifecycle summary (refreshed on demand)
  lastEventTime         DateTime?
  eventCount            Int       @default(0)
  totalCarbonFootprint  Float?
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

### EPCIS Query API (EuroComply Endpoints)

```typescript
// Base URL: /api/v1/epcis

// ===== REPOSITORY MANAGEMENT =====

// GET /repositories - List configured repositories
// POST /repositories - Add a new repository connection
// PUT /repositories/{id} - Update repository config
// DELETE /repositories/{id} - Remove repository
// POST /repositories/{id}/test - Test connection

// ===== QUERY INTERFACE =====

// GET /products/{gtin}/lifecycle
// Query events from all configured repositories
interface ProductLifecycleResponse {
  success: true;
  data: {
    gtin: string;
    product: {
      name: string;
      image?: string;
    };
    story: {
      timeline: TimelineEntry[];
      summary: {
        totalEvents: number;
        firstEvent: string;
        lastEvent: string;
        carbonFootprint: number;
        countriesVisited: string[];
        distanceTraveled: number;
      };
    };
    // Raw events (optional, for debugging)
    rawEvents?: EpcisEvent[];
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

// GET /events
// Query raw events (admin/debug)
interface EventQueryParams {
  repositoryId?: string;      // Filter by repository
  epc?: string;               // Filter by product
  eventTimeGE?: string;       // Events after
  eventTimeLT?: string;       // Events before
  bizStep?: string;           // Filter by business step
  limit?: number;             // Max results (default 100)
}

// ===== LOCATION MASTER =====

// GET /locations - List known locations
// POST /locations - Add location (GLN mapping)
// PUT /locations/{gln} - Update location
// DELETE /locations/{gln} - Remove location

interface LocationRequest {
  gln: string;
  name: string;
  type: 'factory' | 'warehouse' | 'store' | 'supplier' | 'other';
  streetAddress?: string;
  city?: string;
  postalCode?: string;
  country: string;  // ISO 3166-1 alpha-2
  latitude?: number;
  longitude?: number;
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
│  🏭 Jan 10, 2026 08:00 - MANUFACTURED                           │
│  │ Factory: TextilCo GmbH, Berlin                               │
│  │ Carbon: 2.5 kg CO2e (Scope 1)                               │
│  │ Energy: 3.2 kWh (85% renewable)                             │
│  │                                                              │
│  📦 Jan 10, 2026 10:00 - PACKED                                 │
│  │ Location: Berlin Warehouse                                   │
│  │ Container: SSCC 340123450000000001                          │
│  │                                                              │
│  🚛 Jan 10, 2026 14:00 - SHIPPED                                │
│  │ From: Berlin → To: Munich                                    │
│  │ Mode: Road (450 km)                                         │
│  │ Carbon: 4.2 kg CO2e (Scope 3)                               │
│  │ Temperature: 4°C - 8°C ✓                                    │
│  │                                                              │
│  📥 Jan 11, 2026 09:00 - RECEIVED                               │
│  │ Location: Munich Distribution Center                        │
│  │ Condition: Good                                              │
│  │                                                              │
│  🏪 Jan 12, 2026 11:00 - SOLD                                   │
│  │ Retailer: EcoFashion Store                                  │
│  │ Invoice: INV-2026-00123                                     │
│  │ Carbon: 1.8 kg CO2e (Scope 3)                               │
│  │                                                              │
│  ○ Future: END OF LIFE                                         │
│    Recommended: Textile recycling                               │
│    Nearest facility: Munich Recycling GmbH (2.3 km)            │
│                                                                  │
│  ──────────────────────────────────────────────────────────────│
│  Data sources: TextilCo EPCIS, DHL Tracking, Internal WMS      │
│  Last refreshed: 2 minutes ago  [↻ Refresh]                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Repository Connection Settings

```
┌─────────────────────────────────────────────────────────────────┐
│  EPCIS REPOSITORY CONNECTIONS                                    │
│  Settings > Integrations > EPCIS                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Connected Repositories                                         │
│  ─────────────────────────                                      │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ● Factory EPCIS                              [Edit] [×] │   │
│  │  URL: https://epcis.factory.textilco.de                  │   │
│  │  Auth: OAuth 2.0                                         │   │
│  │  Status: Connected (last check: 5 min ago)               │   │
│  │  Events: Manufacturing, Quality Control                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ● DHL Logistics                              [Edit] [×] │   │
│  │  URL: https://epcis-api.dhl.com/v2                       │   │
│  │  Auth: API Key                                           │   │
│  │  Status: Connected                                       │   │
│  │  Events: Shipping, In-Transit, Delivery                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ○ Supplier Portal (Cotton Farm)              [Edit] [×] │   │
│  │  URL: https://epcis.supplier.example.com                 │   │
│  │  Auth: OAuth 2.0                                         │   │
│  │  Status: Pending supplier setup                          │   │
│  │  Events: Raw Material Sourcing                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   [+ Add Repository]                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  Don't have an EPCIS repository?                               │
│  • Deploy OpenEPCIS (free, open source) [Learn more →]         │
│  • Use GS1 Cloud EPCIS service [Learn more →]                  │
│  • Enter events manually [Use simple portal →]                  │
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
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Hosted OpenEPCIS Infrastructure

| Task | Priority | Complexity | Status |
|------|----------|------------|--------|
| Deploy OpenEPCIS with PostgreSQL backend | High | Medium | 📋 Planned |
| Multi-tenant schema (organization_id partitioning) | High | Medium | 📋 Planned |
| EPCIS 2.0 REST API (capture + query) | High | Medium | 📋 Planned |
| Authentication layer (org-scoped API keys) | High | Low | 📋 Planned |
| Fair use monitoring (events/product tracking) | Medium | Low | 📋 Planned |

### Phase 2: EPCIS Query Client (Hybrid)

| Task | Priority | Complexity | Status |
|------|----------|------------|--------|
| Build unified query client (internal + external) | High | Medium | 📋 Planned |
| Support OAuth 2.0 and API key auth | High | Low | 📋 Planned |
| Repository connection management | High | Medium | 📋 Planned |
| Merge events from multiple sources | High | Medium | 📋 Planned |
| Handle query pagination | Medium | Low | 📋 Planned |

### Phase 3: Story Builder

| Task | Priority | Complexity | Status |
|------|----------|------------|--------|
| Build Story Builder service | High | Medium | 📋 Planned |
| Implement bizStep → human text mapping | High | Low | 📋 Planned |
| Add GLN → location resolution | High | Medium | 📋 Planned |
| Carbon footprint aggregation | High | Medium | 📋 Planned |
| Unified timeline from all sources | Medium | Medium | 📋 Planned |

### Phase 4: UI/UX

| Task | Priority | Complexity | Status |
|------|----------|------------|--------|
| Product lifecycle timeline component | High | Medium | 📋 Planned |
| Repository connection settings UI | High | Medium | 📋 Planned |
| Add lifecycle tab to DPP public page | High | Medium | 📋 Planned |
| Carbon footprint visualization | High | Medium | 📋 Planned |
| Location master data management | Medium | Low | 📋 Planned |

### Phase 5: Manual Entry Portal (SMB Suppliers)

| Task | Priority | Complexity | Status |
|------|----------|------------|--------|
| Simple event entry web UI | High | Medium | 📋 Planned |
| Supplier invitation workflow | High | Low | 📋 Planned |
| Events → hosted OpenEPCIS | High | Low | 📋 Planned |
| Excel/CSV bulk event upload | Medium | Medium | 📋 Planned |
| Certificate/document attachment | Medium | Medium | 📋 Planned |

### Phase 6: Advanced Features

| Task | Priority | Complexity | Status |
|------|----------|------------|--------|
| Event caching for external repos | Medium | Medium | 📋 Planned |
| Webhook notifications for new events | Low | Medium | 📋 Planned |
| Event export (EPCIS JSON, CSV) | Medium | Low | 📋 Planned |
| Cold tier migration (when >500GB) | Low | High | 📋 Planned |

---

## Configuration

### Environment Variables

```bash
# .env

# ===========================================
# EPCIS Query Configuration
# ===========================================

# Feature flag
EPCIS_ENABLED=true

# Query settings
EPCIS_QUERY_TIMEOUT_MS=30000
EPCIS_QUERY_RETRY_ATTEMPTS=3
EPCIS_DEFAULT_PAGE_SIZE=100

# Caching (optional, for performance)
EPCIS_CACHE_ENABLED=true
EPCIS_CACHE_TTL_SECONDS=300  # 5 minutes

# Carbon calculation factors (kg CO2e per km)
CARBON_ROAD_KG_PER_KM=0.0001
CARBON_RAIL_KG_PER_KM=0.00003
CARBON_SEA_KG_PER_KM=0.00001
CARBON_AIR_KG_PER_KM=0.0005
```

---

## GS1 Compliance

### EPCIS 2.0 Query Conformance

EuroComply as an Accessing Application supports:

| Requirement | Status |
|-------------|--------|
| JSON-LD format support | ✅ Planned |
| REST query interface | ✅ Planned |
| All 4 event types | ✅ Planned |
| CBV 2.0 business vocabulary | ✅ Planned |
| Sensor data display | ✅ Planned |
| OAuth 2.0 authentication | ✅ Planned |
| GS1 Digital Link in events | ✅ Planned |

### EPC URN Formats

```typescript
// Supported EPC formats for querying

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
│  EPCIS 2.0 INTEGRATION SUMMARY (Hybrid Model)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  OUR ROLE: HYBRID EPCIS PROVIDER                                │
│  ────────────────────────────────                               │
│  1. READ from enterprise EPCIS (SAP, IBM, TraceLink)            │
│  2. HOST OpenEPCIS for SMB customers/suppliers                  │
│                                                                  │
│  WHAT WE BUILD                                                  │
│  ─────────────                                                  │
│  • EPCIS 2.0 REST query client (read from any source)           │
│  • Hosted OpenEPCIS (multi-tenant PostgreSQL)                   │
│  • Manual entry portal (for suppliers without systems)          │
│  • Story Builder (JSON → beautiful timelines)                   │
│  • Carbon footprint aggregation                                 │
│  • GLN → location name resolution                               │
│                                                                  │
│  INFRASTRUCTURE (YEAR 1-2)                                      │
│  ─────────────────────────                                      │
│  • Single PostgreSQL cluster (multi-tenant)                     │
│  • Partitioned by organization_id                               │
│  • ~$500/month for managed Postgres                             │
│  • Add cold tier when >500GB                                    │
│                                                                  │
│  COMPATIBLE WITH                                                │
│  ───────────────                                                │
│  External:     │  Hosted:                                       │
│  • SAP EPCIS   │  • Manual entry portal                         │
│  • IBM Sterling│  • ERP webhook integrations                    │
│  • TraceLink   │  • CSV/Excel upload                            │
│  • GS1 Cloud   │  • API push from partner systems               │
│                                                                  │
│  OUR VALUE PROPOSITION                                          │
│  ──────────────────────                                         │
│  "Complete EPCIS solution for any customer size"                │
│  • Enterprise: Connect to your existing infrastructure          │
│  • SMB: We host everything, just enter your events              │
│  • Unified visualization regardless of data source              │
│  • Beautiful timeline in DPP pages                              │
│                                                                  │
│  STORAGE CAPACITY                                               │
│  ────────────────                                               │
│  • "Unlimited" events with fair use policy                      │
│  • ~100 events/product/year typical                             │
│  • 7-year retention (regulatory requirement)                    │
│  • Enterprise custom limits for >500K products                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## References

### EPCIS 2.0 Query API
- [GS1 EPCIS 2.0 Standard](https://www.gs1.org/standards/epcis)
- [EPCIS 2.0 REST Binding Specification](https://ref.gs1.org/standards/epcis/)
- [GS1 Core Business Vocabulary (CBV)](https://www.gs1.org/standards/epcis/cbv)

### EPCIS Repository Options (for customers/suppliers)
- [OpenEPCIS](https://github.com/openepcis/epcis-repository-ce) - Open source, Apache 2.0
- [GS1 Cloud EPCIS](https://www.gs1.org/services/gs1-cloud) - Managed service
- IBM Sterling Supply Chain - Enterprise
- SAP EPCIS - Enterprise
- TraceLink - Pharma focused

### Related Standards
- [GS1 Digital Link Standard](https://www.gs1.org/standards/gs1-digital-link)
- [ESPR Regulation](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1781)
- [GHG Protocol](https://ghgprotocol.org/)

---

*Last Updated: January 11, 2026*
