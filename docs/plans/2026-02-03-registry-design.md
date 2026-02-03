# The Registry

> **Status:** DRAFT
> **Created:** 2026-02-03
> **Authors:** Human + Claude (Brainstorming Session)
> **Depends On:** [Handler Standard Library Design](./2026-02-02-compliance-handler-vm.md), [Compliance Network Design](./2026-02-02-compliance-network-design.md)

---

## Executive Summary

The Registry is the package management layer of the EuroComply Compliance OS. It sits between the Handler VM (Layer 0) and the Applications (Layer 3), providing the infrastructure for publishing, discovering, installing, and version-locking compliance content.

```
Layer 3: Applications (Compliance Cockpit, Supplier Portal)
Layer 2: THE REGISTRY  <-- This document
Layer 1: A2A Protocol (Identity, Claims, Requests, Evidence, Subscriptions)
Layer 0: Handler VM (48 immutable primitives)
```

The Registry is the single point of truth for all executable compliance content. An AI agent building a new vertical fetches everything it needs -- schemas, rules, connectors, validation suites -- from one place.

What makes it different from npm or Docker Hub: every package is executable compliance logic backed by cryptographic guarantees. Installing a pack doesn't just add code -- it adds auditable, replayable, liability-traceable regulatory intelligence. The Simulator validates before install. The Compliance Lock pins exact versions at evaluation time. The Cascade resolves conflicts transparently. Together they create **Compliance Determinism** -- compliance as an immutable, reproducible state rather than an opinion.

### Core Insight

```
If the Handler VM is the kernel, the Registry is the unified repository
that houses the drivers, data models, and application logic.

- Handler VM = CPU (computation)
- Registry = Package Manager (programs, drivers, data)
- Simulator = Compiler (validates before deployment)
- Compliance Lock = Binary (the exact executable state)
```

---

## Table of Contents

1. [Package Hierarchy](#1-package-hierarchy)
2. [The Manifest](#2-the-manifest)
3. [Compliance Determinism & The Simulator](#3-compliance-determinism--the-simulator)
4. [The Rule Cascade & Conflict Resolution](#4-the-rule-cascade--conflict-resolution)
5. [The Trust Model](#5-the-trust-model)
6. [Registry Integration with the Compliance OS](#6-registry-integration-with-the-compliance-os)
7. [Implementation Roadmap](#7-implementation-roadmap)

---

## 1. Package Hierarchy

The Registry organizes content into four package types, each serving a distinct role in the OS metaphor.

### 1.1 Logic Packs -- "The Libraries"

The most common unit. A Logic Pack contains the Rule Logic ASTs -- the actual composed handler programs -- along with its mandatory Validation Suite. You cannot publish a rule without the tests that prove it works in the Simulator.

Examples: `@eu/reach-svhc-article-33`, `@eu/clp-classification-labeling`, `@us/tsca-inventory-check`

### 1.2 Environment Packs -- "The Distros"

Bundles that tell the OS how to set up the room for a specific industry. An Environment Pack groups multiple Logic Packs together with the Entity Schemas and Workspace configurations needed to run them.

- **Verticals:** High-level manifests grouping Logic Packs (e.g., `@eu/cosmetics-vertical`)
- **Entity Schemas:** Data blueprints the Graph must store for the rules to execute (e.g., `cosmetics:inci-listing`, `batteries:cell-chemistry`)
- **Workspaces:** Pre-configured UI layouts and role-based access controls

Examples: `@eu/biocides-vertical`, `@eu/batteries-regulation-vertical`

### 1.3 Driver Packs -- "The Connectors"

I/O modules that translate between external systems and EuroComply's Entity Schemas. SAP IDocs, Salesforce objects, EDI messages -- Driver Packs normalize them into the Graph.

Also includes Agent Templates: pre-tuned AI prompts for specific document types (e.g., a "German SDS Parser" agent).

Examples: `@connectors/sap-material-sync`, `@connectors/edi-edifact`, `@agents/sds-parser-de`

### 1.4 Intelligence Packs -- "The Oracles"

Reference data and analytical baselines. Registry Mappings provide official cross-walks between identifier systems. Benchmarking Data provides anonymized industry averages used by `ai:anomaly_detect` to flag suspicious claims.

Examples: `@data/sku-to-gsr-mapping`, `@data/cosmetics-industry-benchmarks`

### Summary

| Pack Type | OS Analogy | Contains |
|-----------|------------|----------|
| **Logic** | Libraries | Rule ASTs + Validation Suites |
| **Environment** | Distros | Verticals + Schemas + Workspaces |
| **Driver** | Device Drivers | Connectors + Agent Templates |
| **Intelligence** | Data Packages | Mappings + Benchmarks |

---

## 2. The Manifest

Every package in the Registry declares itself through a manifest (`pack.json`). This is the development-time contract -- what the pack is, what it needs, and what it's compatible with.

```json
{
  "name": "@eu/cosmetics-regulation-1223",
  "version": "2.1.0",
  "type": "logic",
  "author": {
    "name": "TUV SUD",
    "did": "did:web:tuvsud.com"
  },
  "trust_tier": "certified",

  "handler_vm_version": "^1.0.0",

  "dependencies": {
    "@eu/reach-svhc": "^1.4.0",
    "@eurocomply/clp-classification": "^3.0.0"
  },

  "required_schemas": [
    { "id": "core:product_composition", "version": "^1.0.0" },
    { "id": "cosmetics:inci_listing", "version": "^1.2.0" }
  ],

  "scope": {
    "verticals": ["cosmetics"],
    "markets": ["EU"],
    "entity_types": ["cosmetic_product"]
  },

  "regulation_ref": "gsr:reg:EU_1223_2009",

  "logic_root": "rules/main.ast.json",
  "validation_suite": "tests/validation_suite.json",
  "validation_hash": "sha256:a1b2c3...",
  "documentation_root": "docs/",

  "conflict_resolution": {
    "strategy": "most_restrictive",
    "overridable": true
  }
}
```

### Field Reference

| Field | Purpose |
|-------|---------|
| `type` | Which of the four pack types: `logic`, `environment`, `driver`, `intelligence` |
| `trust_tier` | `community`, `verified`, or `certified` |
| `handler_vm_version` | Semver range for VM compatibility. The Compliance Lock pins the exact version at evaluation time |
| `scope` | Defines where this pack's rules fire. Primary defense against conflicts -- rules only execute when vertical, market, and entity type match |
| `regulation_ref` | Links the pack to a specific regulation in the GSR. Enables the Graph to show exactly which law is automated. Enables `ai:explain` to cite the source regulation |
| `validation_hash` | Cryptographic hash of the validation suite. If tests are tampered with, the Simulator refuses to run the pack |
| `documentation_root` | Human-readable guidance the `ai:explain` handler draws from when generating failure explanations |
| `conflict_resolution` | The pack's default strategy when collisions occur. Tenants can override in their local policy |
| `logic_root` | Entry point to the Logic AST -- the composed handler tree |
| `required_schemas` | Entity Schemas the Graph must have for the rules to execute |

---

## 3. Compliance Determinism & The Simulator

The Registry transitions from a passive library to an active operating system through the Simulator. This is the process that converts the development-time Manifest into the runtime Compliance Lock.

### 3.1 The Two-Layer Versioning Model

| File | Purpose | Versions | Mutability | Audit Value |
|------|---------|----------|------------|-------------|
| **Manifest** (`pack.json`) | "What I'm compatible with" | Semver ranges | Mutable during development | Discovery: "Can I install this?" |
| **Compliance Lock** (`compliance-lock.json`) | "What actually ran" | Exact pins + content hashes | Immutable after evaluation | Replay: "Prove exactly why this passed" |

Without the exact pin in the Compliance Lock, the replay guarantee evaporates -- a minor patch in the Handler VM could theoretically change a rounding behavior or a unit conversion, altering the final result.

### 3.2 The Shadow Test Workflow

When an AI agent or admin initiates an install or update:

1. **Dependency Resolution** -- The Registry fetches pinned versions of all dependencies and required schemas.
2. **Shadow Schema Creation** -- The Simulator forks the tenant's data into a temporary shadow schema.
3. **Validation Playback** -- Runs the pack's validation suite against its own logic to verify it isn't broken on arrival.
4. **Portfolio Diff** -- Runs the new logic against the tenant's actual products. Generates an Impact Analysis: *"3 products will lose compliance status."*
5. **Human Approval** -- The diff report is presented. Only after explicit approval does the system proceed.
6. **Lock Commit** -- The `compliance-lock.json` is updated with exact pins and content hashes.

### 3.3 The Compliance Lock

The cryptographic root of trust for all future audits:

```json
{
  "evaluation_id": "eval_88231",
  "timestamp": "2026-03-15T10:00:00Z",
  "handler_vm_exact": "1.0.3-build.442",
  "root_pack": {
    "id": "@eu/cosmetics-regulation-1223",
    "version": "2.1.0",
    "cid": "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3..."
  },
  "packs": {
    "@eu/reach-svhc@1.4.2": {
      "cid": "bafybeihkoviema7g3gxyt6la7vd5ho32...",
      "signature": "z3FXQje...",
      "publisher_did": "did:web:echa.europa.eu",
      "trust_tier": "certified"
    },
    "@eurocomply/clp-classification@3.0.1": {
      "cid": "bafybeiemxf5abjwjbikoz4mc3a3dla6ual...",
      "signature": "y8KLMnp...",
      "publisher_did": "did:web:eurocomply.com",
      "trust_tier": "verified"
    }
  },
  "schemas": {
    "core:product_composition@1.0.0": {
      "cid": "bafybeif7ztnhq65lumvvqextoem3gkoi..."
    },
    "cosmetics:inci_listing@1.2.0": {
      "cid": "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3..."
    }
  }
}
```

### 3.4 Deterministic Replay

Because every handler is a pure function, any auditor with the same input data and the same Compliance Lock will arrive at the exact same pass/fail result, down to the last decimal.

**Transitive Integrity:** If `@eu/cosmetics` depends on `@eu/reach`, and the REACH pack is updated, the product's status doesn't change. It stays pinned to the version used for certification until the tenant chooses to "bump" the version and pass the Simulator again.

**The Evidence Chain:** The Explanation and ExecutionTrace generated by the handlers are hashed and attached to the Verifiable Credential (VC). The proof isn't a PDF -- it's a machine-readable map of every handler instruction executed to reach that decision.

### 3.5 Liability Proofing

If a regulator finds a banned substance in a product that EuroComply marked as "Compliant," the audit trail reveals exactly where the failure occurred:

| Failure Type | Root Cause | The Trace Points To |
|--------------|------------|---------------------|
| **Data Failure** | Input data from the supplier was wrong | The supplier's signed VC |
| **Logic Failure** | The Logic Pack's AST missed a check | The specific Rule Pack version and CID |
| **Platform Failure** | A handler computed incorrectly | The Handler VM version |

This turns an audit from a months-long investigation into a graph query that identifies the root cause in seconds:

```cypher
MATCH (p:Product {id: "X"})-[:EVALUATED_BY]->(lock:ComplianceLock)
RETURN lock.vm_version, lock.rule_pack_hash, lock.timestamp
```

---

## 4. The Rule Cascade & Conflict Resolution

A product can exist in multiple jurisdictions and industry categories, triggering rules from multiple Logic Packs simultaneously. The system resolves overlaps through a structured Cascade -- CSS for regulations.

### 4.1 Cascade Layers

When the Handler VM evaluates a product, it assembles a Rule Stack based on the product's metadata in the Graph. Lower layers provide the baseline; higher layers can override.

```
+---------------------------------------------------+
|  LOCAL POLICY (Highest Priority)                  |
|  Tenant-specific rules from Private Registry      |
|  "Our company bans X even if the law allows it"  |
+---------------------------------------------------+
|  REGIONAL OVERRIDES                               |
|  Market-specific restrictions                     |
|  "In Sweden, this substance is further limited"   |
+---------------------------------------------------+
|  ENVIRONMENT PACKS (Verticals)                    |
|  Industry-wide rules                              |
|  "EU Cosmetics 1223 standard checks"              |
+---------------------------------------------------+
|  SYSTEM BASE (Lowest Priority)                    |
|  Cross-cutting rules for all products             |
|  "Basic data completeness, format validation"     |
+---------------------------------------------------+
```

### 4.2 Scope Isolation (Primary Defense)

Every Rule Pack defines its Application Scope in the manifest. A rule is not a global variable; it is a function that only executes when the Entity Schema and Context match.

- **Vertical Tagging:** A product in the Graph is tagged by the user or an AI Agent (e.g., `type: "Cosmetic"` or `type: "Biocide"`).
- **Scoped Execution:** The Handler VM filters the active rules based on these tags. A hand sanitizer tagged as only a biocide will never trigger the cosmetics check.

This prevents 90% of accidental conflicts by design.

### 4.3 Conflict Detection at Install Time

For products that straddle verticals (like a cosmetic cream with biocidal claims), the Simulator performs a **Logic Overlap Analysis** during the Shadow Test -- static analysis of the installed Logic ASTs to find rules targeting the same GSR ID within overlapping scopes.

When a new Logic Pack introduces an overlap, the Simulator generates an **Interaction Map** in the Diff Report:

> *"Warning: Installing `@us/pfas-act` creates a collision with `@internal/green-policy` on 12 substances. Default strategy: Most Restrictive. 2 products affected."*

The tenant resolves the collision before the lock is committed.

### 4.4 Conflict Strategies

The `conflict_resolution` strategy in each manifest dictates behavior when two rules in the stack target the same substance or field. Tenants can override the default in their registry policy.

| Strategy | Logic | Audit Trace Example |
|----------|-------|---------------------|
| **Most Restrictive** | `min(threshold_a, threshold_b)` | "Applied 0.1% limit: Cosmetics Pack (0.1%) vs. Biocides Pack (0.2%)" |
| **Explicit Priority** | Weight defined in tenant policy | "Applied 0.2% limit: Biocides PT6 prioritized per Tenant Policy v2" |
| **Merge** | Aggregate results (rare, used for risk scores) | "Calculated mean risk score (3.5) from environmental and safety packs" |

**Most Restrictive** is the default -- in the absence of a manual override, the system defaults to the choice that minimizes liability.

### 4.5 Resolution Handler: `core:regulatory_conflict_resolve`

When a collision is detected, the system invokes the existing `core:regulatory_conflict_resolve` handler. The tenant configures their preferred strategy. The audit trace captures which rule won and why -- transparency is what makes it liability-proof.

### 4.6 Why the Cascade Matters

The cascade makes the system uniquely interoperable:

- A company adopts public EU rules today
- They layer private policies on top without breaking the public audit trail
- They share their Liability Trace through the A2A Protocol, and the recipient's Registry knows exactly how to interpret the cascade that produced the result

---

## 5. The Trust Model

The Registry must answer two questions for every package: **who published this**, and **should I trust them**?

### 5.1 Trust Tiers

Every package carries a trust tier that reflects its verification status.

| Tier | Who Can Publish | Verification | Use Case |
|------|----------------|--------------|----------|
| **`community`** | Anyone with a DID | None -- self-published, self-signed | Internal experiments, early-stage rules, niche verticals |
| **`verified`** | Verified organizations | EuroComply reviews the Logic AST and Validation Suite for correctness | Production-ready rules from known companies |
| **`certified`** | Accredited bodies | Independent third-party audit of logic against the source regulation (e.g., TUV, SGS, Bureau Veritas signs the pack) | Regulated industries where liability demands external validation |

### 5.2 Tenant Trust Policy

Tenants configure which tiers they accept:

```json
{
  "trust_policy": {
    "minimum_tier": "verified",
    "exceptions": [
      { "scope": "@internal/*", "tier": "community" },
      { "scope": "@eu/reach-*", "tier": "certified" }
    ]
  }
}
```

A pharmaceutical company might require `certified` for everything. A startup might accept `community` packs from their own private registry while requiring `verified` for public packs.

### 5.3 Identity: DIDs as Publisher Credentials

Every publisher is identified by a Decentralized Identifier (DID). The DID is the cryptographic root that links a package to its author.

```
Publisher: TUV SUD
DID:       did:web:tuvsud.com
Public Key: Registered in DID Document

Pack Signature Flow:
1. Author creates Logic Pack
2. Author signs pack.json with their DID's private key
3. Registry stores the signature
4. At install time, Simulator verifies signature against DID Document
5. If signature is invalid -> install blocked
```

Trust is not granted by EuroComply -- it is cryptographically proven by the publisher's own identity. EuroComply is a verifier, not a gatekeeper.

### 5.4 Public vs Private Registries

The Registry operates as a federated system. There is one public registry and any number of private registries.

```
+------------------------------------------------------+
|                   PUBLIC REGISTRY                     |
|                                                      |
|  @eu/reach-svhc           (certified, TUV)           |
|  @eu/cosmetics-1223       (certified, SGS)           |
|  @eu/biocides-528         (verified)                 |
|  @community/textile-oeko  (community)                |
|                                                      |
+---------------+--------------------------+-----------+
                |                          |
                v                          v
+----------------------+  +------------------------+
|  PRIVATE REGISTRY    |  |  PRIVATE REGISTRY      |
|  Acme Corp           |  |  ChemCo GmbH           |
|                      |  |                        |
|  @internal/green-    |  |  @internal/battery-    |
|    policy            |  |    chemistry-rules     |
|  @internal/supplier- |  |  @internal/de-market   |
|    overrides         |  |    overrides           |
|                      |  |                        |
|  Can depend on       |  |  Can depend on         |
|  public packs        |  |  public packs          |
|  Invisible to other  |  |  Invisible to other    |
|  registries          |  |  registries            |
+----------------------+  +------------------------+
```

**Key rules:**

- Private packs can depend on public packs (e.g., `@internal/green-policy` depends on `@eu/reach-svhc`)
- **Public packs can never depend on private CIDs** -- if a public rule depends on a private one, the audit trail goes dark for the entire industry. The `registry:publish` tool enforces that all dependencies are reachable at the same visibility level or higher
- Private packs are invisible to other registries -- proprietary logic stays proprietary
- The Compliance Lock records which registry each pack came from, so auditors can verify the full chain

### 5.5 Negotiated Disclosure in A2A

When a claim crosses company boundaries, total transparency is not realistic -- companies will never share their most valuable IP by default. The system uses a **Negotiated Disclosure** model aligned with the A2A Protocol's Evidence Primitive.

When Company B calls `a2a:request_claim` with a specific evidence depth, Company A's system checks each CID in the compliance lock:

| Pack Visibility | Disclosure Level | What Company B Receives |
|-----------------|------------------|-------------------------|
| **Public** | Automatic | CID reference only (Company B fetches it themselves) |
| **Private, Full** | Peer trust: high | Actual Logic AST JSON included in the response |
| **Private, Grant** | Peer trust: medium | Temporary DID-scoped access token to fetch from Company A's Registry |
| **Private, Opaque** | Peer trust: low | CID and signature only |

### 5.6 Reproducibility Score

The system calculates a `reproducibility_score` based on what was actually shared:

| Score | Meaning | Implication |
|-------|---------|-------------|
| **100%** | All CIDs are public or fully disclosed | Company B can replay the evaluation in their own Simulator. Zero trust required |
| **50%** | Some CIDs are private/opaque | Company B can verify the public rules but must trust the certified signature for private logic |
| **0%** | Logic is entirely hidden | Verification is a pure assertion |

The score is a functional constraint for the recipient's risk engine. A buyer's procurement policy can require "80%+ reproducibility from tier-1 suppliers" and the system enforces it automatically.

### 5.7 Trust Verification in A2A

When Company A shares a Liability Trace with Company B:

1. Read the `compliance-lock.json` from the trace
2. For each pack: resolve the publisher's DID, verify the signature
3. Check the trust tier against Company B's own Trust Policy
4. Calculate reproducibility score from what was disclosed
5. Result: *"This evaluation used 3 certified packs and 1 verified pack. All publishers verified. Reproducibility: 85%. Acceptable per procurement policy."*

---

## 6. Registry Integration with the Compliance OS

### 6.1 MCP as the Universal Interface

The Registry is exposed as first-class MCP tools alongside the existing `eurocomply:*` and `a2a:*` tool families. AI agents interact with the Registry through the same protocol they use for everything else.

```
+-------------------------------------------------------------+
|                    AI AGENT (Claude, GPT, etc.)              |
+-------------------------------------------------------------+
                              |
                              | MCP Protocol
                              v
+-------------------------------------------------------------+
|                    EUROCOMPLY MCP SERVER                     |
+-------------------------------------------------------------+
|                                                             |
|  +-----------+ +-----------+ +-----------+ +-----------+   |
|  | REGISTRY  | |   META    | |    OPS    | |    A2A    |   |
|  |   Tools   | |   Tools   | |   Tools   | |   Tools   |   |
|  +-----------+ +-----------+ +-----------+ +-----------+   |
|  |search     | |create_    | |get_product| |resolve_   |   |
|  |inspect    | |  vertical | |update_    | |  identity |   |
|  |install    | |create_rule| |  material | |issue_claim|   |
|  |publish    | |define_    | |evaluate_  | |verify_    |   |
|  |bump       | |  workspace| |  compliance|  claim    |   |
|  |lock       | |define_    | |trace_     | |request_  |   |
|  |diff       | |  entity   | |  substance| |  claim   |   |
|  +-----------+ +-----------+ +-----------+ +-----------+   |
|        |              |                                     |
|        | Registry     | Simulator                           |
|        | feeds -----> | validates                           |
|        v              v                                     |
|  +-----------------------------------------------------+   |
|  |                    SIMULATOR                         |   |
|  |  Shadow Schema -> Validate -> Diff -> Human Approve  |   |
|  +-----------------------------------------------------+   |
|                           |                                 |
|                           v                                 |
|  +-----------------------------------------------------+   |
|  |              HANDLER VM (48 primitives)              |   |
|  +-----------------------------------------------------+   |
|                           |                                 |
|                           v                                 |
|  +-----------------------------------------------------+   |
|  |                    THE GRAPH                         |   |
|  +-----------------------------------------------------+   |
|                                                             |
+-------------------------------------------------------------+
```

### 6.2 The Relationship: Registry -> META -> Simulator

Registry tools and META tools are connected but distinct:

- **Registry tools** manage packages as artifacts -- search, inspect, install, publish
- **META tools** manage the tenant's live configuration -- create verticals, define rules, configure workspaces
- **The Simulator** sits between them, validating before anything reaches production

Installing a pack is a batch META operation -- the pack's manifest declares the verticals, rules, schemas, and workspaces, and the Simulator validates them all as a single atomic change.

```
registry:search -> registry:inspect -> registry:install
                                            |
                                            v
                                      SIMULATOR
                                      (Shadow Test)
                                            |
                                            v
                                      META tools fire
                                      (create_vertical,
                                       create_rule, etc.)
                                            |
                                            v
                                      compliance-lock.json
                                      updated with CIDs
```

### 6.3 Registry MCP Tools

```typescript
// Discover packs
"registry:search": {
  input: {
    query?: string,                    // "cosmetics regulation EU"
    type?: "logic" | "environment" | "driver" | "intelligence",
    scope?: {
      vertical?: string,
      market?: string
    },
    trust_tier_minimum?: "community" | "verified" | "certified",
    limit?: number
  },
  output: {
    packs: Array<{
      name: string,
      version: string,
      type: string,
      trust_tier: string,
      publisher: { name: string, did: string },
      description: string,
      dependencies: string[],
      cid: string
    }>
  }
}

// Examine a pack before installing
"registry:inspect": {
  input: {
    pack: string,                      // "@eu/cosmetics-1223@2.1.0"
    include?: {
      manifest?: boolean,
      dependency_tree?: boolean,
      validation_suite_summary?: boolean,
      logic_ast_summary?: boolean,
      conflict_preview?: boolean       // Check against currently installed packs
    }
  },
  output: {
    manifest: PackManifest,
    dependency_tree?: DependencyNode[],
    validation_suite?: { test_count: number, pass_rate: number },
    logic_summary?: { rules: number, handlers_used: string[] },
    potential_conflicts?: Array<{
      installed_pack: string,
      overlap_type: string,
      affected_substances: number
    }>
  }
}

// Install a pack (triggers Simulator)
"registry:install": {
  input: {
    pack: string,                      // "@eu/cosmetics-1223@2.1.0"
    conflict_strategy?: "most_restrictive" | "explicit_priority" | "merge",
    auto_approve?: boolean             // false for META changes
  },
  output: {
    simulation_id: string,
    status: "simulating" | "awaiting_approval" | "failed",
    diff_preview?: {
      packs_to_install: number,
      schemas_to_create: number,
      rules_to_add: number,
      products_affected: number,
      compliance_status_changes: number
    }
  }
}

// Publish a pack to a registry
"registry:publish": {
  input: {
    registry: "public" | string,       // "public" or private registry DID
    manifest: PackManifest,
    content_root: string,              // Path to pack content
    sign_with: string                  // DID key reference for signing
  },
  output: {
    cid: string,                       // Content-addressed ID
    signature: string,
    published_to: string,
    trust_tier: string                 // Starts as "community" on public
  }
}

// Check for updates and preview impact
"registry:bump": {
  input: {
    pack?: string,                     // Specific pack, or omit for all
    target_version?: string,           // Specific version, or "latest"
    dry_run?: boolean                  // Preview only, don't trigger Simulator
  },
  output: {
    available_updates: Array<{
      pack: string,
      current_version: string,
      current_cid: string,
      available_version: string,
      available_cid: string,
      changelog_summary: string,
      breaking_changes: boolean
    }>,
    simulation_id?: string             // If dry_run is false
  }
}

// View, export, verify, or prove the current compliance lock
"registry:lock": {
  input: {
    action: "view" | "export" | "verify" | "prove",
    product_id?: string,               // Lock for specific product evaluation

    // For selective disclosure (Merkle proof)
    prove?: {
      substance_gsr_id?: string,       // Prove rules for specific substance
      rule_ids?: string[],             // Prove specific rules were applied
      pack_names?: string[]            // Prove specific packs were installed
    }
  },
  output: {
    lock: ComplianceLock,
    reproducibility_score: number,     // 0-1

    verification?: {
      all_cids_valid: boolean,
      all_signatures_valid: boolean,
      all_publishers_resolved: boolean
    }
  }
}

// Generate diff between two lock states
"registry:diff": {
  input: {
    lock_a: string,                    // evaluation_id or timestamp
    lock_b: string,
    include_impact?: boolean
  },
  output: {
    changes: Array<{
      pack: string,
      version_a: string,
      version_b: string,
      cid_a: string,
      cid_b: string,
      rules_added: number,
      rules_removed: number,
      rules_modified: number
    }>,
    impact?: {
      products_with_status_change: number,
      details: Array<{
        product_id: string,
        before: string,
        after: string
      }>
    }
  }
}
```

### 6.4 How A2A Uses the Registry

When Company A shares a Liability Trace with Company B via `a2a:verify_claim`, the verification path goes through the Registry:

```
Company B receives VC from Company A
        |
        v
a2a:verify_claim
        |
        +---> Signature check (DID verification)
        +---> Expiration check
        +---> Revocation check
        |
        +---> Evidence verification
                |
                v
            registry:lock (verify)
                |
                +---> Resolve each CID from the lock
                +---> Verify publisher signatures
                +---> Check trust tiers against
                |     Company B's Trust Policy
                +---> Calculate reproducibility score
                +---> Optionally: replay evaluation
                      with same inputs + same CIDs
                      to confirm deterministic result
```

The Registry is what makes A2A claims independently verifiable -- not just "Company A says this passed" but "here are the exact CIDs of every rule that ran, signed by their publishers, and you can replay it yourself."

---

## 7. Implementation Roadmap

The Registry builds on top of the Handler VM and integrates with the A2A Protocol. Implementation follows the existing v2 platform migration sequence.

### Phase 1: Core Registry Infrastructure

| Deliverable | Description |
|-------------|-------------|
| Pack manifest schema | Zod schema for `pack.json` with all fields (type, scope, integrity, conflict_resolution) |
| Pack storage layer | Content-addressed storage, index mapping `name@version` to CID |
| Pack validation | Manifest parsing, dependency resolution, signature verification |
| `registry:publish` | Publish to public or private registry with DID signing. Enforces: public packs cannot depend on private CIDs |
| `registry:search` | Discovery by type, scope, trust tier, keyword |
| `registry:inspect` | Full manifest view, dependency tree, conflict preview |

### Phase 2: Simulator Integration

| Deliverable | Description |
|-------------|-------------|
| `registry:install` | Triggers Simulator Shadow Test workflow |
| Shadow Test pipeline | Dependency fetch, shadow schema, validation playback, portfolio diff |
| Compliance Lock generation | Lock construction from resolved CIDs with exact version pins |
| `registry:bump` | Update detection, dry-run diff, Safe Bump workflow |
| Conflict detection | Static analysis of Logic ASTs for overlapping scope + same GSR ID |
| Rule Cascade engine | Layer resolution (System, Vertical, Regional, Local) with configurable strategy |

### Phase 3: Trust & Identity

| Deliverable | Description |
|-------------|-------------|
| DID integration | Publisher identity via `did:web`, signature verification against DID Documents |
| Trust tier system | `community` / `verified` / `certified` with tenant Trust Policy configuration |
| Trust Policy enforcement | Minimum tier checks at install time |
| `registry:lock` | View, export, verify, selective proof generation |
| Reproducibility score | Calculated from CID visibility (public vs private vs opaque) |

### Phase 4: A2A Integration & Federation

| Deliverable | Description |
|-------------|-------------|
| Negotiated disclosure | A2A verification bundles with full/grant/opaque per CID |
| Private registry federation | Sync protocol between public and private registries |
| Temporary access grants | DID-scoped tokens for private CID fetch |
| `registry:diff` | Compare two lock states, show rule and compliance status changes |
| Persistence guarantees | Immutable storage for certified tier, deprecation workflow for verified |

### Dependency on Existing Architecture

```
v2 Segment 01 (GSR Database)       --> Required: substance identity for scope resolution
v2 Segment 04 (Neo4j Graph)        --> Required: Graph storage for compliance state
v2 Segment 05 (Plugin System)      --> Registry REPLACES the plugin system design
Handler VM (compliance-handler-vm)  --> Required: the 48 primitives that packs compose
A2A Protocol (compliance-network)   --> Required for Phase 4 (federation + disclosure)
```

The Registry effectively subsumes v2 Segment 05 (Plugin System). The plugin system design becomes the Registry -- verticals, rules, and schemas are packs, not plugins.

---

## Invariants

These rules are enforced by the system at all times:

1. **Public packs cannot depend on private CIDs** -- audit trails must not go dark for the industry
2. **Certified CIDs are permanent** -- immutable storage, no deletion, only deprecation
3. **No lock update without Simulator approval** -- the Simulator is the only path to changing `compliance-lock.json`
4. **Every evaluation records its lock** -- no unversioned compliance decisions exist in the system
5. **Signatures are verified at install time** -- tampered packs are rejected before they reach the Simulator
6. **Most Restrictive is the default conflict strategy** -- in the absence of explicit configuration, the system minimizes liability

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-02-03 | Initial design from brainstorming session |

---

*The Registry transforms EuroComply from a compliance tool into a compliance operating system -- where regulatory logic is versioned, signed, composable, and deterministically reproducible. Compliance becomes an immutable state, not an opinion.*
