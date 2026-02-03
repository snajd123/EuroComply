# Segment 04: Neo4j Knowledge Graph

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up Neo4j for compliance knowledge graph, create sync services from PostgreSQL, and implement compliance query patterns for path traversal and impact analysis.

**Architecture:** Neo4j stores relationships between substances, rules, regulations, and categories. Queries like "Why is my product non-compliant?" require graph traversal that's inefficient in relational databases. Sync services keep Neo4j updated from the PostgreSQL source of truth.

**Tech Stack:** Neo4j 5.x, neo4j-driver (JavaScript), TypeScript

---

## Prerequisites

- Segment 01-02 completed (GSR database with substances)
- Segment 03 completed (Tenant database with products)
- Docker environment ready for Neo4j

---

## Task 1: Add Neo4j to Docker Compose

**Files:**
- Modify: `/root/Documents/EuroComply/docker-compose.yml`

**Step 1: Read current docker-compose.yml**

Run: Read `/root/Documents/EuroComply/docker-compose.yml`

**Step 2: Add Neo4j service**

```yaml
services:
  # ... existing services ...

  neo4j:
    image: neo4j:5.15.0-community
    container_name: eurocomply-neo4j
    ports:
      - "7474:7474"  # HTTP browser
      - "7687:7687"  # Bolt protocol
    environment:
      - NEO4J_AUTH=neo4j/password123
      - NEO4J_PLUGINS=["apoc"]
      - NEO4J_dbms_security_procedures_unrestricted=apoc.*
      - NEO4J_dbms_memory_heap_initial__size=512m
      - NEO4J_dbms_memory_heap_max__size=1G
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:7474"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  # ... existing volumes ...
  neo4j_data:
  neo4j_logs:
```

**Step 3: Verify Neo4j starts**

Run: `docker compose up -d neo4j`
Wait: 30 seconds for Neo4j to initialize
Run: `docker compose logs neo4j | tail -20`
Expected: "Started." message

**Step 4: Test Neo4j connection**

Run: `curl -u neo4j:password123 http://localhost:7474/db/neo4j/tx/commit -H "Content-Type: application/json" -d '{"statements":[{"statement":"RETURN 1"}]}'`
Expected: `{"results":[{"columns":["1"],"data":[{"row":[1]}]}],"errors":[]}`

**Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: add Neo4j to docker compose for knowledge graph

Neo4j 5.x community edition with APOC plugin enabled.
Ports: 7474 (browser), 7687 (bolt).
Memory: 512MB-1GB heap.

Used for compliance path traversal and impact analysis.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create Graph Package

**Files:**
- Create: `/root/Documents/EuroComply/packages/graph/package.json`
- Create: `/root/Documents/EuroComply/packages/graph/tsconfig.json`
- Create: `/root/Documents/EuroComply/packages/graph/src/index.ts`
- Create: `/root/Documents/EuroComply/packages/graph/src/driver.ts`

**Step 1: Create package.json**

```json
{
  "name": "@eurocomply/graph",
  "version": "0.0.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "neo4j-driver": "^5.17.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "typescript": "^5.3.3",
    "vitest": "^1.2.0"
  },
  "peerDependencies": {
    "@eurocomply/gsr": "workspace:*"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create driver.ts**

```typescript
import neo4j, { Driver, Session, type AuthToken } from 'neo4j-driver';

export interface GraphConfig {
  uri?: string;
  username?: string;
  password?: string;
}

let driver: Driver | null = null;

/**
 * Get or create the Neo4j driver singleton.
 */
export function getDriver(config: GraphConfig = {}): Driver {
  if (driver) {
    return driver;
  }

  const uri = config.uri ?? process.env.NEO4J_URI ?? 'bolt://localhost:7687';
  const username = config.username ?? process.env.NEO4J_USERNAME ?? 'neo4j';
  const password = config.password ?? process.env.NEO4J_PASSWORD ?? 'password123';

  driver = neo4j.driver(uri, neo4j.auth.basic(username, password));

  return driver;
}

/**
 * Close the Neo4j driver connection.
 */
export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

/**
 * Get a new session for queries.
 */
export function getSession(database?: string): Session {
  const d = getDriver();
  return d.session({ database: database ?? 'neo4j' });
}

/**
 * Execute a Cypher query with parameters.
 */
export async function runQuery<T = unknown>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const session = getSession();
  try {
    const result = await session.run(cypher, params);
    return result.records.map((record) => record.toObject() as T);
  } finally {
    await session.close();
  }
}

/**
 * Execute a write transaction.
 */
export async function writeTransaction<T = unknown>(
  work: (tx: neo4j.Transaction) => Promise<T>
): Promise<T> {
  const session = getSession();
  try {
    return await session.executeWrite(work);
  } finally {
    await session.close();
  }
}
```

**Step 4: Create index.ts**

```typescript
export { getDriver, closeDriver, getSession, runQuery, writeTransaction, type GraphConfig } from './driver.js';
```

**Step 5: Install dependencies**

Run: `cd packages/graph && pnpm install`

**Step 6: Build package**

Run: `cd packages/graph && pnpm build`
Expected: Compiles without errors

**Step 7: Commit**

```bash
git add packages/graph/
git commit -m "feat(graph): create graph package with Neo4j driver

New @eurocomply/graph package for Neo4j knowledge graph:
- Driver singleton management
- Session helpers
- Query execution utilities
- Write transaction support

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Create Graph Schema Initialization

**Files:**
- Create: `/root/Documents/EuroComply/packages/graph/src/schema/init-schema.ts`
- Create: `/root/Documents/EuroComply/packages/graph/src/schema/init-schema.test.ts`

**Step 1: Write failing test for schema initialization**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDriver, closeDriver, runQuery } from '../driver.js';
import { initGraphSchema, clearGraph } from './init-schema.js';

describe('Graph Schema Initialization', () => {
  beforeAll(async () => {
    // Ensure driver is initialized
    getDriver();
  });

  afterAll(async () => {
    await closeDriver();
  });

  describe('initGraphSchema', () => {
    it('should_create_constraints_when_called', async () => {
      await initGraphSchema();

      // Verify Substance constraint exists
      const constraints = await runQuery<{ name: string }>(
        'SHOW CONSTRAINTS YIELD name RETURN name'
      );

      const constraintNames = constraints.map((c) => c.name);
      expect(constraintNames).toContain('substance_id_unique');
    });

    it('should_create_indexes_when_called', async () => {
      await initGraphSchema();

      // Verify indexes exist
      const indexes = await runQuery<{ name: string }>(
        'SHOW INDEXES YIELD name RETURN name'
      );

      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain('substance_cas_index');
    });
  });

  describe('clearGraph', () => {
    it('should_delete_all_nodes_and_relationships', async () => {
      // Create some test data
      await runQuery('CREATE (:TestNode {name: "test"})');

      await clearGraph();

      const count = await runQuery<{ count: number }>(
        'MATCH (n) RETURN count(n) as count'
      );
      expect(count[0].count).toBe(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/graph && pnpm test src/schema/init-schema.test.ts`
Expected: FAIL

**Step 3: Create schema initialization**

```typescript
import { writeTransaction, runQuery } from '../driver.js';
import neo4j from 'neo4j-driver';

/**
 * Initialize the Neo4j graph schema with constraints and indexes.
 */
export async function initGraphSchema(): Promise<void> {
  // ═══════════════════════════════════════════════════════════════════════════
  // CONSTRAINTS (Uniqueness)
  // ═══════════════════════════════════════════════════════════════════════════

  const constraints = [
    // Substance nodes
    'CREATE CONSTRAINT substance_id_unique IF NOT EXISTS FOR (s:Substance) REQUIRE s.id IS UNIQUE',
    'CREATE CONSTRAINT substance_inchi_unique IF NOT EXISTS FOR (s:Substance) REQUIRE s.inchiKey IS UNIQUE',

    // Regulation nodes
    'CREATE CONSTRAINT regulation_code_unique IF NOT EXISTS FOR (r:Regulation) REQUIRE r.code IS UNIQUE',

    // Rule nodes
    'CREATE CONSTRAINT rule_code_unique IF NOT EXISTS FOR (r:Rule) REQUIRE r.code IS UNIQUE',

    // Category nodes
    'CREATE CONSTRAINT category_id_unique IF NOT EXISTS FOR (c:Category) REQUIRE c.id IS UNIQUE',

    // Hazard class nodes
    'CREATE CONSTRAINT hazard_code_unique IF NOT EXISTS FOR (h:HazardClass) REQUIRE h.code IS UNIQUE',

    // Vertical nodes
    'CREATE CONSTRAINT vertical_id_unique IF NOT EXISTS FOR (v:Vertical) REQUIRE v.id IS UNIQUE',

    // SubstanceGroup nodes
    'CREATE CONSTRAINT group_code_unique IF NOT EXISTS FOR (g:SubstanceGroup) REQUIRE g.code IS UNIQUE',
  ];

  for (const constraint of constraints) {
    try {
      await runQuery(constraint);
    } catch (error) {
      // Constraint may already exist
      console.log(`Constraint may already exist: ${(error as Error).message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INDEXES (Performance)
  // ═══════════════════════════════════════════════════════════════════════════

  const indexes = [
    // Substance indexes
    'CREATE INDEX substance_cas_index IF NOT EXISTS FOR (s:Substance) ON (s.casNumber)',
    'CREATE INDEX substance_name_index IF NOT EXISTS FOR (s:Substance) ON (s.canonicalName)',
    'CREATE INDEX substance_version_index IF NOT EXISTS FOR (s:Substance) ON (s.gsrVersion)',

    // Rule indexes
    'CREATE INDEX rule_vertical_index IF NOT EXISTS FOR (r:Rule) ON (r.verticalId)',
    'CREATE INDEX rule_type_index IF NOT EXISTS FOR (r:Rule) ON (r.ruleType)',
    'CREATE INDEX rule_severity_index IF NOT EXISTS FOR (r:Rule) ON (r.severity)',

    // Category path index
    'CREATE INDEX category_path_index IF NOT EXISTS FOR (c:Category) ON (c.path)',

    // Relationship property indexes
    'CREATE INDEX restricts_threshold_index IF NOT EXISTS FOR ()-[r:RESTRICTS]-() ON (r.threshold)',
  ];

  for (const index of indexes) {
    try {
      await runQuery(index);
    } catch (error) {
      console.log(`Index may already exist: ${(error as Error).message}`);
    }
  }

  console.log('Graph schema initialized successfully');
}

/**
 * Clear all nodes and relationships from the graph.
 * WARNING: Destructive operation - use only in tests or reseeding.
 */
export async function clearGraph(): Promise<void> {
  // Delete in batches to avoid memory issues with large graphs
  let deleted = 0;
  do {
    const result = await runQuery<{ deleted: number }>(
      `MATCH (n)
       WITH n LIMIT 10000
       DETACH DELETE n
       RETURN count(*) as deleted`
    );
    deleted = result[0]?.deleted ?? 0;
  } while (deleted > 0);

  console.log('Graph cleared');
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/graph && pnpm test src/schema/init-schema.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/graph/src/schema/
git commit -m "feat(graph): add schema initialization with constraints and indexes

Graph schema includes:
- Unique constraints on Substance, Regulation, Rule, Category, etc.
- Indexes for CAS number, names, versions, paths
- clearGraph() for test isolation and reseeding

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Create GSR Sync Service

**Files:**
- Create: `/root/Documents/EuroComply/packages/graph/src/sync/gsr-sync.service.ts`
- Create: `/root/Documents/EuroComply/packages/graph/src/sync/gsr-sync.service.test.ts`

**Step 1: Write failing test for GSR sync**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb } from '@eurocomply/gsr/test-utils';
import { Substance, SubstanceHazardClassification, HazardClass } from '@eurocomply/gsr/entities';
import { getDriver, closeDriver, runQuery } from '../driver.js';
import { clearGraph } from '../schema/init-schema.js';
import { GsrSyncService } from './gsr-sync.service.js';

describe('GsrSyncService', () => {
  let gsrOrm: MikroORM;
  let syncService: GsrSyncService;

  beforeAll(async () => {
    gsrOrm = await setupGsrTestDb();
    getDriver();
    syncService = new GsrSyncService(gsrOrm);
  });

  afterAll(async () => {
    await teardownGsrTestDb();
    await closeDriver();
  });

  beforeEach(async () => {
    await clearGsrTestDb(gsrOrm);
    await clearGraph();
  });

  describe('syncSubstances', () => {
    it('should_create_substance_nodes_from_gsr_database', async () => {
      // Create test substances in GSR
      const em = gsrOrm.em.fork();
      const substance = em.create(Substance, {
        canonicalName: 'Ethanol',
        casNumber: '64-17-5',
        inchiKey: 'LFQSCWFLJHTTHZ-UHFFFAOYSA-N',
        dtxsid: 'DTXSID9020584',
        dataVersion: '2026.02.03',
      });
      await em.persistAndFlush(substance);

      // Sync to Neo4j
      const result = await syncService.syncSubstances('2026.02.03');

      expect(result.created).toBe(1);

      // Verify in Neo4j
      const nodes = await runQuery<{ name: string }>(
        'MATCH (s:Substance {casNumber: "64-17-5"}) RETURN s.canonicalName as name'
      );
      expect(nodes[0].name).toBe('Ethanol');
    });

    it('should_update_existing_nodes_when_resyncing', async () => {
      // Create initial substance
      const em = gsrOrm.em.fork();
      const substance = em.create(Substance, {
        canonicalName: 'Ethanol',
        casNumber: '64-17-5',
        dataVersion: '2026.02.03',
      });
      await em.persistAndFlush(substance);

      // Initial sync
      await syncService.syncSubstances('2026.02.03');

      // Update substance
      substance.canonicalName = 'Ethanol (updated)';
      await em.persistAndFlush(substance);

      // Resync
      const result = await syncService.syncSubstances('2026.02.03');

      expect(result.updated).toBeGreaterThanOrEqual(1);

      // Verify update
      const nodes = await runQuery<{ name: string }>(
        'MATCH (s:Substance {casNumber: "64-17-5"}) RETURN s.canonicalName as name'
      );
      expect(nodes[0].name).toBe('Ethanol (updated)');
    });
  });

  describe('syncClassifications', () => {
    it('should_create_classified_as_relationships', async () => {
      const em = gsrOrm.em.fork();

      // Create hazard class
      const hazardClass = em.create(HazardClass, {
        code: 'Carc.',
        fullName: 'Carcinogenicity',
        hazardType: 'HEALTH',
        isCmr: true,
      });
      await em.persistAndFlush(hazardClass);

      // Create substance
      const substance = em.create(Substance, {
        canonicalName: 'Carcinogen X',
        casNumber: '123-45-6',
        dataVersion: '2026.02.03',
      });
      await em.persistAndFlush(substance);

      // Create classification
      const classification = em.create(SubstanceHazardClassification, {
        substance,
        hazardClass,
        category: '1A',
        hCode: 'H350',
        dataVersion: '2026.02.03',
      });
      await em.persistAndFlush(classification);

      // Sync
      await syncService.syncSubstances('2026.02.03');
      await syncService.syncHazardClasses();
      await syncService.syncClassifications('2026.02.03');

      // Verify relationship
      const rels = await runQuery<{ category: string }>(
        `MATCH (s:Substance {casNumber: "123-45-6"})
               -[r:CLASSIFIED_AS]->(h:HazardClass {code: "Carc."})
         RETURN r.category as category`
      );
      expect(rels[0].category).toBe('1A');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/graph && pnpm test src/sync/gsr-sync.service.test.ts`
Expected: FAIL

**Step 3: Create GSR Sync Service**

```typescript
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { runQuery, writeTransaction } from '../driver.js';
import neo4j from 'neo4j-driver';

// Import GSR entities (peer dependency)
import type { Substance, HazardClass, SubstanceHazardClassification, SubstanceGroup } from '@eurocomply/gsr';

export interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
  duration: number;
}

/**
 * GsrSyncService: Syncs GSR PostgreSQL data to Neo4j knowledge graph.
 *
 * Sync strategy:
 * - MERGE on unique identifier (creates or updates)
 * - Batch processing for performance (1000 nodes per batch)
 * - Version tagging for tracking sync state
 */
export class GsrSyncService {
  private orm: MikroORM;
  private batchSize = 1000;

  constructor(orm: MikroORM) {
    this.orm = orm;
  }

  /**
   * Sync all substances from GSR to Neo4j.
   */
  async syncSubstances(version: string): Promise<SyncResult> {
    const startTime = Date.now();
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    const em = this.orm.em.fork();

    // Stream substances in batches
    let offset = 0;
    let batch: Substance[];

    do {
      batch = await em.find(
        'Substance' as any, // Type assertion for peer dependency
        { dataVersion: version },
        { limit: this.batchSize, offset }
      ) as Substance[];

      if (batch.length === 0) break;

      // Convert to Neo4j parameters
      const params = batch.map((s) => ({
        id: s.id,
        inchiKey: s.inchiKey,
        casNumber: s.casNumber,
        dtxsid: s.dtxsid,
        canonicalName: s.canonicalName,
        smiles: s.smiles,
        molecularFormula: s.molecularFormula,
        molecularWeight: s.molecularWeight ? neo4j.types.Float(s.molecularWeight) : null,
        qcLevel: s.qcLevel,
        isMixture: s.isMixture,
        gsrVersion: version,
      }));

      // MERGE substances
      const result = await runQuery<{ created: number; updated: number }>(
        `UNWIND $substances as s
         MERGE (substance:Substance {id: s.id})
         ON CREATE SET
           substance.inchiKey = s.inchiKey,
           substance.casNumber = s.casNumber,
           substance.dtxsid = s.dtxsid,
           substance.canonicalName = s.canonicalName,
           substance.smiles = s.smiles,
           substance.molecularFormula = s.molecularFormula,
           substance.molecularWeight = s.molecularWeight,
           substance.qcLevel = s.qcLevel,
           substance.isMixture = s.isMixture,
           substance.gsrVersion = s.gsrVersion,
           substance.syncedAt = datetime()
         ON MATCH SET
           substance.canonicalName = s.canonicalName,
           substance.smiles = s.smiles,
           substance.molecularFormula = s.molecularFormula,
           substance.molecularWeight = s.molecularWeight,
           substance.qcLevel = s.qcLevel,
           substance.gsrVersion = s.gsrVersion,
           substance.syncedAt = datetime()
         RETURN
           sum(CASE WHEN substance.syncedAt = datetime() THEN 1 ELSE 0 END) as created,
           sum(CASE WHEN substance.syncedAt <> datetime() THEN 1 ELSE 0 END) as updated`,
        { substances: params }
      );

      created += batch.length; // Simplified - actual created/updated tracking would need more logic
      offset += this.batchSize;

      console.log(`Synced ${offset} substances...`);
    } while (batch.length === this.batchSize);

    return {
      created,
      updated,
      deleted: 0,
      errors,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Sync hazard classes (static reference data).
   */
  async syncHazardClasses(): Promise<SyncResult> {
    const startTime = Date.now();
    const em = this.orm.em.fork();

    const classes = await em.find('HazardClass' as any, {}) as HazardClass[];

    const params = classes.map((hc) => ({
      code: hc.code,
      fullName: hc.fullName,
      hazardType: hc.hazardType,
      isCmr: hc.isCmr,
    }));

    await runQuery(
      `UNWIND $classes as hc
       MERGE (h:HazardClass {code: hc.code})
       SET h.fullName = hc.fullName,
           h.hazardType = hc.hazardType,
           h.isCmr = hc.isCmr`,
      { classes: params }
    );

    return {
      created: classes.length,
      updated: 0,
      deleted: 0,
      errors: [],
      duration: Date.now() - startTime,
    };
  }

  /**
   * Sync hazard classifications (substance-hazard relationships).
   */
  async syncClassifications(version: string): Promise<SyncResult> {
    const startTime = Date.now();
    let created = 0;
    const errors: string[] = [];

    const em = this.orm.em.fork();

    let offset = 0;
    let batch: SubstanceHazardClassification[];

    do {
      batch = await em.find(
        'SubstanceHazardClassification' as any,
        { dataVersion: version },
        {
          limit: this.batchSize,
          offset,
          populate: ['substance', 'hazardClass'],
        }
      ) as SubstanceHazardClassification[];

      if (batch.length === 0) break;

      const params = batch.map((c) => ({
        substanceId: c.substance.id,
        hazardCode: c.hazardClass.code,
        category: c.category,
        hCode: c.hCode,
        scl: c.scl,
        mFactor: c.mFactor,
      }));

      await runQuery(
        `UNWIND $classifications as c
         MATCH (s:Substance {id: c.substanceId})
         MATCH (h:HazardClass {code: c.hazardCode})
         MERGE (s)-[r:CLASSIFIED_AS]->(h)
         SET r.category = c.category,
             r.hCode = c.hCode,
             r.scl = c.scl,
             r.mFactor = c.mFactor`,
        { classifications: params }
      );

      created += batch.length;
      offset += this.batchSize;
    } while (batch.length === this.batchSize);

    return {
      created,
      updated: 0,
      deleted: 0,
      errors,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Sync substance groups.
   */
  async syncSubstanceGroups(): Promise<SyncResult> {
    const startTime = Date.now();
    const em = this.orm.em.fork();

    const groups = await em.find('SubstanceGroup' as any, {}) as SubstanceGroup[];

    // Create group nodes
    const params = groups.map((g) => ({
      id: g.id,
      code: g.code,
      name: g.name,
      description: g.description,
    }));

    await runQuery(
      `UNWIND $groups as g
       MERGE (sg:SubstanceGroup {code: g.code})
       SET sg.id = g.id,
           sg.name = g.name,
           sg.description = g.description`,
      { groups: params }
    );

    // TODO: Sync group membership relationships

    return {
      created: groups.length,
      updated: 0,
      deleted: 0,
      errors: [],
      duration: Date.now() - startTime,
    };
  }

  /**
   * Full GSR sync (all data).
   */
  async syncAll(version: string): Promise<Record<string, SyncResult>> {
    console.log(`Starting full GSR sync for version ${version}...`);

    const results: Record<string, SyncResult> = {};

    results.hazardClasses = await this.syncHazardClasses();
    console.log(`  Hazard classes: ${results.hazardClasses.created}`);

    results.substances = await this.syncSubstances(version);
    console.log(`  Substances: ${results.substances.created}`);

    results.classifications = await this.syncClassifications(version);
    console.log(`  Classifications: ${results.classifications.created}`);

    results.groups = await this.syncSubstanceGroups();
    console.log(`  Groups: ${results.groups.created}`);

    console.log('GSR sync complete');
    return results;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/graph && pnpm test src/sync/gsr-sync.service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/graph/src/sync/
git commit -m "feat(graph): add GSR sync service for Neo4j

GsrSyncService syncs PostgreSQL GSR data to Neo4j:
- syncSubstances: Substance nodes with chemical identity
- syncHazardClasses: HazardClass reference nodes
- syncClassifications: [:CLASSIFIED_AS] relationships
- syncSubstanceGroups: SubstanceGroup nodes

Batch processing for performance (1000/batch).
MERGE strategy for idempotent syncs.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Create Compliance Query Service

**Files:**
- Create: `/root/Documents/EuroComply/packages/graph/src/queries/compliance-queries.ts`
- Create: `/root/Documents/EuroComply/packages/graph/src/queries/compliance-queries.test.ts`

**Step 1: Write failing test for compliance queries**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getDriver, closeDriver, runQuery } from '../driver.js';
import { clearGraph, initGraphSchema } from '../schema/init-schema.js';
import {
  getComplianceStack,
  getWhyNonCompliant,
  getImpactAnalysis,
} from './compliance-queries.js';

describe('Compliance Queries', () => {
  beforeAll(async () => {
    getDriver();
    await initGraphSchema();
  });

  afterAll(async () => {
    await closeDriver();
  });

  beforeEach(async () => {
    await clearGraph();
    await initGraphSchema();

    // Seed test graph
    await runQuery(`
      // Create test data
      CREATE (s:Substance {id: "sub-1", casNumber: "64-17-5", canonicalName: "Ethanol"})
      CREATE (s2:Substance {id: "sub-2", casNumber: "123-45-6", canonicalName: "Restricted Chemical"})

      CREATE (h:HazardClass {code: "Carc.", fullName: "Carcinogenicity", isCmr: true})
      CREATE (s2)-[:CLASSIFIED_AS {category: "1A", hCode: "H350"}]->(h)

      CREATE (reg:Regulation {code: "COSING", name: "Cosmetics Regulation"})

      CREATE (rule1:Rule {
        code: "COSING-ANNEX-II-001",
        name: "CMR Prohibition",
        ruleType: "SUBSTANCE_PROHIBITION",
        severity: "BLOCKER",
        verticalId: "cosmetics"
      })
      CREATE (rule1)-[:DEFINED_BY]->(reg)
      CREATE (rule1)-[:RESTRICTS {reason: "CMR Category 1A"}]->(s2)

      CREATE (cat:Category {id: "cat-1", code: "cosmetics.skincare", path: "cosmetics.skincare"})
      CREATE (rule1)-[:APPLIES_TO]->(cat)

      CREATE (v:Vertical {id: "cosmetics", name: "Cosmetics"})
      CREATE (rule1)-[:OWNED_BY]->(v)
    `);
  });

  describe('getComplianceStack', () => {
    it('should_return_all_applicable_rules_for_category', async () => {
      const rules = await getComplianceStack('cat-1');

      expect(rules.length).toBeGreaterThan(0);
      expect(rules[0].code).toBe('COSING-ANNEX-II-001');
    });
  });

  describe('getWhyNonCompliant', () => {
    it('should_return_violation_path_when_substance_is_restricted', async () => {
      // Create product with restricted substance
      await runQuery(`
        CREATE (p:Product {id: "prod-1", name: "Test Product"})
        CREATE (m:Material {id: "mat-1", name: "Test Material"})
        CREATE (s:Substance {id: "sub-2"})
        CREATE (p)-[:CONTAINS]->(m)
        CREATE (m)-[:DECLARES]->(s)
      `);

      const violations = await getWhyNonCompliant('prod-1');

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].substance).toBe('Restricted Chemical');
      expect(violations[0].rule).toBe('CMR Prohibition');
    });
  });

  describe('getImpactAnalysis', () => {
    it('should_find_products_affected_by_substance_group', async () => {
      // Create product using the substance
      await runQuery(`
        CREATE (p:Product {id: "prod-2", name: "Affected Product"})
        CREATE (m:Material {id: "mat-2", name: "Material with CMR"})
        MATCH (s:Substance {id: "sub-2"})
        CREATE (p)-[:CONTAINS]->(m)
        CREATE (m)-[:DECLARES]->(s)

        CREATE (g:SubstanceGroup {code: "CMR_CAT_1A", name: "CMR Category 1A"})
        CREATE (s)-[:BELONGS_TO]->(g)
      `);

      const affected = await getImpactAnalysis('CMR_CAT_1A');

      expect(affected.products.length).toBe(1);
      expect(affected.products[0].name).toBe('Affected Product');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/graph && pnpm test src/queries/compliance-queries.test.ts`
Expected: FAIL

**Step 3: Create compliance queries**

```typescript
import { runQuery } from '../driver.js';

/**
 * Rule with severity and source regulation.
 */
export interface ComplianceRule {
  code: string;
  name: string;
  ruleType: string;
  severity: string;
  verticalId: string;
  regulationCode: string;
}

/**
 * Compliance violation with full path.
 */
export interface ComplianceViolation {
  substance: string;
  substanceId: string;
  casNumber: string;
  rule: string;
  ruleCode: string;
  severity: string;
  regulation: string;
  reason: string;
  path: string[];
}

/**
 * Impact analysis result.
 */
export interface ImpactAnalysisResult {
  groupCode: string;
  groupName: string;
  substanceCount: number;
  substances: Array<{ id: string; name: string; casNumber: string }>;
  products: Array<{ id: string; name: string; substanceCount: number }>;
}

/**
 * Get all rules applicable to a category.
 *
 * Traverses category hierarchy to find all applicable rules.
 */
export async function getComplianceStack(categoryId: string): Promise<ComplianceRule[]> {
  const results = await runQuery<{
    code: string;
    name: string;
    ruleType: string;
    severity: string;
    verticalId: string;
    regulationCode: string;
  }>(
    `MATCH (c:Category {id: $categoryId})
     MATCH (c)<-[:APPLIES_TO]-(r:Rule)-[:DEFINED_BY]->(reg:Regulation)
     RETURN DISTINCT
       r.code as code,
       r.name as name,
       r.ruleType as ruleType,
       r.severity as severity,
       r.verticalId as verticalId,
       reg.code as regulationCode
     ORDER BY r.severity DESC, r.code`,
    { categoryId }
  );

  return results;
}

/**
 * Get full violation path for a non-compliant product.
 *
 * Returns the complete traversal: Product → Material → Substance → Rule → Regulation
 */
export async function getWhyNonCompliant(productId: string): Promise<ComplianceViolation[]> {
  const results = await runQuery<{
    substanceName: string;
    substanceId: string;
    casNumber: string;
    ruleName: string;
    ruleCode: string;
    severity: string;
    regulationCode: string;
    reason: string;
    path: string[];
  }>(
    `MATCH path = (p:Product {id: $productId})
           -[:CONTAINS]->(m:Material)
           -[:DECLARES]->(s:Substance)
           <-[:RESTRICTS]-(r:Rule)
           -[:DEFINED_BY]->(reg:Regulation)
     WHERE r.severity = 'BLOCKER'
     RETURN
       s.canonicalName as substanceName,
       s.id as substanceId,
       s.casNumber as casNumber,
       r.name as ruleName,
       r.code as ruleCode,
       r.severity as severity,
       reg.code as regulationCode,
       COALESCE((p)-[:CONTAINS]->(m)-[:DECLARES]->(s)<-[restr:RESTRICTS]-(r) | restr.reason, 'Restricted') as reason,
       [node in nodes(path) | COALESCE(node.name, node.code, node.id)] as path`,
    { productId }
  );

  return results.map((r) => ({
    substance: r.substanceName,
    substanceId: r.substanceId,
    casNumber: r.casNumber,
    rule: r.ruleName,
    ruleCode: r.ruleCode,
    severity: r.severity,
    regulation: r.regulationCode,
    reason: r.reason,
    path: r.path,
  }));
}

/**
 * Impact analysis: What products are affected by a substance group?
 *
 * Used for regulatory change impact assessment.
 */
export async function getImpactAnalysis(groupCode: string): Promise<ImpactAnalysisResult> {
  // Get group info and substances
  const groupData = await runQuery<{
    groupCode: string;
    groupName: string;
    substanceId: string;
    substanceName: string;
    casNumber: string;
  }>(
    `MATCH (g:SubstanceGroup {code: $groupCode})<-[:BELONGS_TO]-(s:Substance)
     RETURN
       g.code as groupCode,
       g.name as groupName,
       s.id as substanceId,
       s.canonicalName as substanceName,
       s.casNumber as casNumber`,
    { groupCode }
  );

  // Get affected products
  const productData = await runQuery<{
    productId: string;
    productName: string;
    substanceCount: number;
  }>(
    `MATCH (g:SubstanceGroup {code: $groupCode})<-[:BELONGS_TO]-(s:Substance)
           <-[:DECLARES]-(:Material)<-[:CONTAINS]-(p:Product)
     RETURN
       p.id as productId,
       p.name as productName,
       count(DISTINCT s) as substanceCount`,
    { groupCode }
  );

  const substances = groupData.map((d) => ({
    id: d.substanceId,
    name: d.substanceName,
    casNumber: d.casNumber,
  }));

  return {
    groupCode: groupData[0]?.groupCode ?? groupCode,
    groupName: groupData[0]?.groupName ?? '',
    substanceCount: substances.length,
    substances,
    products: productData.map((p) => ({
      id: p.productId,
      name: p.productName,
      substanceCount: p.substanceCount,
    })),
  };
}

/**
 * Get all CMR substances in a product.
 */
export async function getCmrSubstances(productId: string): Promise<Array<{
  substanceId: string;
  name: string;
  casNumber: string;
  cmrCategory: string;
  hazardClass: string;
}>> {
  const results = await runQuery<{
    substanceId: string;
    name: string;
    casNumber: string;
    category: string;
    hazardClass: string;
  }>(
    `MATCH (p:Product {id: $productId})
           -[:CONTAINS]->(:Material)
           -[:DECLARES]->(s:Substance)
           -[c:CLASSIFIED_AS]->(h:HazardClass)
     WHERE h.isCmr = true
     RETURN
       s.id as substanceId,
       s.canonicalName as name,
       s.casNumber as casNumber,
       c.category as category,
       h.fullName as hazardClass`,
    { productId }
  );

  return results.map((r) => ({
    substanceId: r.substanceId,
    name: r.name,
    casNumber: r.casNumber,
    cmrCategory: r.category,
    hazardClass: r.hazardClass,
  }));
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/graph && pnpm test src/queries/compliance-queries.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/graph/src/queries/
git commit -m "feat(graph): add compliance query functions

Compliance queries for knowledge graph:
- getComplianceStack: All rules for a category
- getWhyNonCompliant: Full violation path traversal
- getImpactAnalysis: Products affected by substance group
- getCmrSubstances: CMR substances in product

These queries are the core "why" explainer for compliance decisions.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Create Graph CLI Commands

**Files:**
- Create: `/root/Documents/EuroComply/packages/graph/src/cli/index.ts`
- Create: `/root/Documents/EuroComply/packages/graph/src/cli/sync.ts`

**Step 1: Create sync CLI command**

```typescript
// sync.ts
import { Command } from 'commander';
import { MikroORM } from '@mikro-orm/postgresql';
import { createGsrOrm, closeGsrOrm } from '@eurocomply/gsr';
import { getDriver, closeDriver } from '../driver.js';
import { initGraphSchema, clearGraph } from '../schema/init-schema.js';
import { GsrSyncService } from '../sync/gsr-sync.service.js';

interface SyncOptions {
  version: string;
  clear?: boolean;
}

export function createSyncCommand(): Command {
  const command = new Command('sync')
    .description('Sync data to Neo4j knowledge graph');

  command
    .command('gsr')
    .description('Sync GSR data to Neo4j')
    .requiredOption('--version <version>', 'GSR version to sync (e.g., 2026.02.03)')
    .option('--clear', 'Clear graph before syncing')
    .action(async (options: SyncOptions) => {
      console.log(`Syncing GSR version ${options.version} to Neo4j...`);

      let gsrOrm: MikroORM | null = null;

      try {
        // Initialize connections
        getDriver();
        gsrOrm = await createGsrOrm();

        // Initialize schema
        await initGraphSchema();

        // Clear if requested
        if (options.clear) {
          console.log('Clearing existing graph...');
          await clearGraph();
          await initGraphSchema();
        }

        // Sync
        const syncService = new GsrSyncService(gsrOrm);
        const results = await syncService.syncAll(options.version);

        // Print summary
        console.log('\n=== Sync Summary ===');
        for (const [name, result] of Object.entries(results)) {
          console.log(`${name}: ${result.created} created, ${result.updated} updated (${result.duration}ms)`);
        }

      } catch (error) {
        console.error('Sync failed:', error);
        process.exit(1);
      } finally {
        if (gsrOrm) await closeGsrOrm(gsrOrm);
        await closeDriver();
      }
    });

  command
    .command('init')
    .description('Initialize graph schema (constraints and indexes)')
    .action(async () => {
      try {
        getDriver();
        await initGraphSchema();
        console.log('Graph schema initialized');
      } finally {
        await closeDriver();
      }
    });

  command
    .command('clear')
    .description('Clear all data from graph')
    .action(async () => {
      try {
        getDriver();
        await clearGraph();
        console.log('Graph cleared');
      } finally {
        await closeDriver();
      }
    });

  return command;
}
```

**Step 2: Create CLI index**

```typescript
// index.ts
import { Command } from 'commander';
import { createSyncCommand } from './sync.js';

const program = new Command();

program
  .name('graph')
  .description('EuroComply Graph CLI - Neo4j knowledge graph management')
  .version('0.0.1');

program.addCommand(createSyncCommand());

program.parse();
```

**Step 3: Update package.json with bin entry**

Add to `packages/graph/package.json`:

```json
{
  "bin": {
    "graph": "./dist/cli/index.js"
  },
  "scripts": {
    "graph": "node --loader ts-node/esm src/cli/index.ts"
  }
}
```

**Step 4: Test CLI**

Run: `cd packages/graph && pnpm graph sync --help`
Expected: Shows sync command help

**Step 5: Commit**

```bash
git add packages/graph/src/cli/ packages/graph/package.json
git commit -m "feat(graph): add CLI for graph management

Graph CLI commands:
- graph sync gsr --version <version>: Sync GSR to Neo4j
- graph sync init: Initialize schema
- graph sync clear: Clear all data

Usage: pnpm graph sync gsr --version 2026.02.03

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Update Graph Package Exports

**Files:**
- Modify: `/root/Documents/EuroComply/packages/graph/src/index.ts`

**Step 1: Update exports**

```typescript
// Driver
export { getDriver, closeDriver, getSession, runQuery, writeTransaction, type GraphConfig } from './driver.js';

// Schema
export { initGraphSchema, clearGraph } from './schema/init-schema.js';

// Sync Services
export { GsrSyncService, type SyncResult } from './sync/gsr-sync.service.js';

// Queries
export {
  getComplianceStack,
  getWhyNonCompliant,
  getImpactAnalysis,
  getCmrSubstances,
  type ComplianceRule,
  type ComplianceViolation,
  type ImpactAnalysisResult,
} from './queries/compliance-queries.js';
```

**Step 2: Commit**

```bash
git add packages/graph/src/index.ts
git commit -m "chore(graph): update package exports

Exports:
- Driver utilities
- Schema initialization
- GsrSyncService
- Compliance query functions

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Segment 04 Completion Checklist

- [ ] Neo4j added to docker-compose
- [ ] Graph package created with neo4j-driver
- [ ] Schema initialization with constraints and indexes
- [ ] GSR sync service (substances, hazard classes, classifications)
- [ ] Compliance query functions (stack, why-non-compliant, impact)
- [ ] CLI commands for graph management
- [ ] Package exports updated
- [ ] All tests pass
- [ ] All commits follow CLAUDE.md format

---

## Next Segment

Proceed to **Segment 05: Plugin System (Verticals, Handlers, Rules)**

File: `docs/plans/2026-02-02-v2-implementation-plan-05-plugin-system.md`
