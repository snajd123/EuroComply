# Compliance OS: Breakthrough Evolution Layer

> **Status:** DRAFT
> **Created:** 2026-02-03
> **Authors:** Human + Claude (Brainstorming Session)
> **Depends On:** [Handler Standard Library](./2026-02-02-compliance-handler-vm.md), [Compliance Network](./2026-02-02-compliance-network-design.md), [The Registry](./2026-02-03-registry-design.md)

---

## Executive Summary

This document defines four breakthrough innovations that elevate the EuroComply Compliance OS from a reactive compliance tool to a self-healing, privacy-preserving, liability-isolating industrial operating system. These innovations treat the existing Handler VM, A2A Protocol, and Registry as the stable "v1 kernel" and build the "v2 evolution layer" on top.

### The Four Innovations

| Innovation | Core Breakthrough |
|------------|-------------------|
| **Hot-Swap Regulatory Kernel** | Temporal Compliance Branching — simulate risk against future or draft regulations in shadow mode |
| **Agentic Mesh / ZKR** | Privacy-preserving computation — verify compliance via Zero-Knowledge Requests without exposing trade secrets |
| **Compliance Hypervisor** | Digital Liability Isolation — sandbox third-party logic and generate Proof of Oversight for court-grade evidence |
| **Federated Sentinel** | Industrial Immune System — anonymized anomaly cross-pollination detects fraud and triggers network-wide defenses |

### How They Connect

```
+-------------------------------------------------------------+
|                    BREAKTHROUGH LAYER                        |
+-------------------------------------------------------------+
|                                                             |
|  SENTINEL                    HYPERVISOR                     |
|  (Immune System)             (Process Manager)              |
|  Detects threats     <--->   Enforces trust boundaries      |
|  across network              within tenant VM               |
|       |                           |                         |
|       v                           v                         |
|  REGISTRY                    HANDLER VM                     |
|  Threat Signatures           Context Switches               |
|  Logic Pack Patches          Sandbox Isolation              |
|  Probe Challenges            Proof of Oversight             |
|       |                           |                         |
|       v                           v                         |
|  HOT-SWAP KERNEL             AGENTIC MESH                   |
|  (Proactive Evaluation)      (Privacy-Preserving Compute)   |
|  Regulatory Interrupts       Zero-Knowledge Requests        |
|  Temporal Branching          Compute Challenges             |
|  core:future_cast            Liability Marketplace          |
|                                                             |
+-------------------------------------------------------------+
            |                           |
            v                           v
+-------------------------------------------------------------+
|                    STABLE KERNEL (v1)                        |
|  Handler VM | A2A Protocol | Registry | Graph               |
+-------------------------------------------------------------+
```

---

## Table of Contents

1. [Hot-Swap Regulatory Kernel](#1-hot-swap-regulatory-kernel)
2. [MCP Agentic Mesh & Zero-Knowledge Requests](#2-mcp-agentic-mesh--zero-knowledge-requests)
3. [The Compliance Hypervisor](#3-the-compliance-hypervisor)
4. [Federated Sentinel Intelligence](#4-federated-sentinel-intelligence)
5. [Cross-Innovation Integration](#5-cross-innovation-integration)
6. [Implementation Sequence](#6-implementation-sequence)

---

## 1. Hot-Swap Regulatory Kernel

The current VM model is reactive — a user or scheduled job triggers an evaluation, rules run, results come back. The Hot-Swap Kernel makes the VM proactive. Regulations become interrupts, not batch jobs.

### 1.1 Regulatory Interrupts

When the GSR updates a substance threshold or a new Logic Pack version is published, the VM doesn't just send a notification. It initiates a Hot-Swap cycle:

```
GSR Update: "Formaldehyde SVHC threshold changed from 0.1% to 0.05%"
        |
        v
Registry detects affected Logic Packs
        |
        v
VM initiates Shadow Hot-Swap:
  - Forks the entire tenant graph into shadow state
  - Applies the updated Logic Pack
  - Re-evaluates ALL products touching formaldehyde
  - Generates Impact Report BEFORE anyone asks
        |
        v
Tenant dashboard: "Alert: Regulatory change detected.
3 products will lose compliance. Review impact."
```

The tenant never had to click "evaluate." The OS detected the change, computed the impact, and presented the result — like an OS kernel handling a hardware interrupt without the user knowing the CPU switched context.

### 1.2 Temporal Compliance Branching

The breakthrough feature. The VM allows tenants to "boot" their entire product portfolio into a future regulatory state using the `core:future_cast` handler.

```typescript
"core:future_cast": {
  input: {
    // What future state to simulate
    scenario: {
      type: "draft_regulation" | "proposed_ban" | "threshold_change" | "custom",

      // Option A: Use a draft Logic Pack from the Registry
      draft_pack?: string,             // "@eu/pfas-restriction-draft@0.1.0"

      // Option B: Define a hypothetical change
      hypothetical?: {
        substance_gsr_ids?: string[],  // Substances affected
        change_type: "ban" | "restrict" | "reclassify",
        new_threshold?: number,
        effective_date?: string        // "2028-01-01"
      }
    },

    // What to evaluate
    scope: {
      products?: string[],             // Specific products, or...
      portfolio: boolean,              // ...entire portfolio
      include_supply_chain?: boolean   // Cascade upstream via graph
    }
  },
  output: {
    scenario_summary: string,
    timeline: {
      effective_date: string,
      days_until: number
    },

    impact: {
      total_products: number,
      currently_compliant: number,
      future_non_compliant: number,    // The "kernel panics"

      affected_products: Array<{
        product_id: string,
        product_name: string,
        current_status: "compliant",
        future_status: "non_compliant",
        failing_rules: Array<{
          rule_id: string,
          substance: string,
          current_value: number,
          future_threshold: number,
          gap: number
        }>,
        remediation_options?: Array<{
          type: "reformulate" | "substitute" | "exempt",
          description: string,
          feasibility: "high" | "medium" | "low"
        }>
      }>
    },

    supply_chain_cascade?: {
      suppliers_affected: number,
      materials_affected: number
    }
  }
}
```

### 1.3 The "Year 2028 Mode" Example

```
User: "What happens if the EU bans PFAS in 2028?"
        |
        v
core:future_cast({
  scenario: {
    draft_pack: "@eu/pfas-restriction-draft@0.1.0"
  },
  scope: { portfolio: true, include_supply_chain: true }
})
        |
        v
Result:
  "47 of 312 products will lose compliance.
   23 suppliers provide PFAS-containing materials.
   Estimated reformulation: 12 products have viable substitutes.
   35 products require R&D investment.
   Timeline: 698 days until effective date."
```

The tenant gets a complete risk profile against a law that doesn't exist yet — computed by running their real data against draft Logic Packs from the Registry.

### 1.4 Why This Matters

Traditional compliance is forensic — you discover non-compliance after the law takes effect. Temporal Branching makes compliance predictive. Combined with the Registry's versioning model, tenants can maintain multiple "branches" of their compliance state:

| Branch | Purpose |
|--------|---------|
| `main` | Current locked state — production compliance |
| `draft/pfas-2028` | Impact assessment against proposed PFAS ban |
| `draft/batteries-2027` | Impact assessment against EU Battery Regulation updates |
| `what-if/supplier-loss` | Scenario: key supplier exits market |

---

## 2. MCP Agentic Mesh & Zero-Knowledge Requests

The current A2A model exchanges data — Company A sends a Verifiable Credential, Company B verifies it. The Agentic Mesh elevates MCP from a data exchange protocol to a privacy-preserving computation substrate. Agents don't ask for data. They ask for proof of computation.

### 2.1 The Core Problem

Company B needs to know that Company A's formulation passes REACH SVHC checks. But Company A's formulation is a trade secret. Today, the options are:

- Share the formulation (IP leak)
- Share a signed assertion (trust me)

ZKR introduces a third option: **Compute Challenges**.

### 2.2 Zero-Knowledge Request Flow

```
Company B                                    Company A
    |                                            |
    |  "Run @eu/reach-svhc on your               |
    |   formulation for Material RM-42.           |
    |   Send me the signed Execution Trace.       |
    |   Redact all substance names                |
    |   and concentrations."                      |
    |                                             |
    |  a2a:compute_challenge                      |
    |--------------------------------------------->|
    |                                             |
    |                                     Company A's VM:
    |                                     1. Loads RM-42 data
    |                                     2. Runs @eu/reach-svhc
    |                                     3. Generates full trace
    |                                     4. Applies redaction mask
    |                                     5. Signs redacted trace
    |                                             |
    |  Signed redacted trace:                     |
    |  "14 substances evaluated.                  |
    |   All below threshold.                      |
    |   Handler: core:threshold_check x14         |
    |   Result: PASS                              |
    |   Substances: [REDACTED]                    |
    |   Concentrations: [REDACTED]                |
    |   Thresholds: 0.1% (visible, from law)      |
    |   Logic Pack: @eu/reach-svhc@1.4.2          |
    |   VM Version: 1.0.3-build.442"              |
    |<---------------------------------------------|
    |                                             |
    |  Company B verifies:                        |
    |  1. Signature valid (Company A's DID)       |
    |  2. Logic Pack is certified (TUV signed)    |
    |  3. VM version matches known good build     |
    |  4. Instruction Alignment: handler trace    |
    |     matches the Logic Pack AST exactly      |
    |     (14 threshold_checks in AST = 14        |
    |      in trace — no selective evaluation)    |
    |  5. Result: PASS                            |
    |                                             |
    |  Conclusion: "RM-42 passes REACH.           |
    |  I don't know what's in it.                 |
    |  I know the computation was correct."       |
```

Company B verified compliance without ever seeing the formulation. The trust comes from three independent anchors: the certified Logic Pack (audited by TUV), the deterministic VM (same version produces same results), and the cryptographic signature (Company A can't forge the trace).

### 2.3 Instruction Alignment Check

A critical integrity verification. Company B compares the `handlers_used` and `handler_executions` count in the redacted trace against the Logic Pack AST in the Registry.

If the public Logic Pack `@eu/reach-svhc@1.4.2` contains 14 `core:threshold_check` nodes, but the redacted trace only shows 12, the OS flags a **Trace Mismatch** — even if the signature is valid.

Without this check, Company A could run a subset of the rules, skip the ones their formulation fails, and still produce a valid-looking signed trace. The Instruction Alignment Check closes that gap.

Company A can redact the *values* but they cannot redact the *structure*. The trace must be structurally isomorphic to the AST.

```
If Instruction Alignment fails:

  "Trace Mismatch: Logic Pack @eu/reach-svhc@1.4.2
   defines 14 threshold_check nodes but trace
   contains only 12 executions.
   Possible selective evaluation. TRUST: REJECTED."
```

### 2.4 MCP Tools

```typescript
// Issue a compute challenge
"a2a:compute_challenge": {
  input: {
    to: string,                        // "did:web:supplier-corp.com"

    challenge: {
      logic_pack: string,             // "@eu/reach-svhc@1.4.2"
      target: {
        gsr_id?: string,              // Substance or material
        your_reference?: string       // "PO-2026-1234 line item 3"
      },

      // What must be visible in the trace
      required_visible: {
        result: boolean,              // Pass/fail — always true
        handler_ids: boolean,         // Which handlers ran
        handler_count: boolean,       // How many checks
        thresholds: boolean,          // Legal limits (public data)
        logic_pack_version: boolean,  // Pack CID
        vm_version: boolean           // VM build
      },

      // What the responder may redact
      allowed_redactions: [
        "substance_names",
        "substance_identifiers",
        "concentrations",
        "supplier_names",
        "formulation_ratios"
      ],

      context: {
        why_needed: string,
        your_use_case?: string
      }
    }
  },
  output: {
    challenge_id: string,
    status: "sent" | "accepted" | "declined",
    expected_response_time?: string
  }
}

// Respond to a compute challenge
"a2a:compute_response": {
  input: {
    challenge_id: string,

    response: {
      status: "fulfilled" | "declined" | "partial",

      execution_trace?: {
        result: "pass" | "fail",
        handler_executions: number,
        handlers_used: string[],

        // Redacted trace — structurally complete, values masked
        trace_steps: Array<{
          handler: string,
          result: "pass" | "fail",
          values: Record<string, string | "[REDACTED]">,
          explanation: string
        }>,

        logic_pack_cid: string,
        vm_version: string,
        timestamp: string
      },

      signature: string,
      decline_reason?: string
    }
  },
  output: {
    response_id: string,
    delivered: boolean
  }
}
```

### 2.5 ZKR as Evidence Level

ZKR extends the existing A2A Evidence Primitive. The current evidence levels are:

| Level | Description |
|-------|-------------|
| **Assertion only** | Just the claim, no evidence |
| **Summary** | Handler trace + document hashes |
| **Full** | Everything + retrievable documents |
| **Reproducible** | Full + raw input data |
| **Zero-Knowledge** | *(new)* Redacted trace + certified logic proof |

ZKR sits between Summary and Full — more verifiable than a summary (you can see the trace structure and verify instruction alignment) but more private than full disclosure (values are redacted).

### 2.6 The Automated Liability Marketplace

ZKR enables a second breakthrough: compliance as a real-time pricing signal.

When a supplier's AI agent cannot provide a high-confidence compute response — either declining the challenge, returning a low reproducibility score, or using uncertified logic packs — the system can automatically adjust the commercial relationship.

```
Buyer's AI Agent                         Supplier's AI Agent
      |                                        |
      |  a2a:compute_challenge                 |
      |  (@eu/reach-svhc on Material X)        |
      |---------------------------------------->|
      |                                        |
      |  Response: DECLINED                    |
      |  Reason: "Insufficient test data"      |
      |<----------------------------------------|
      |                                        |
      |  Buyer's Risk Engine:                  |
      |  1. Supplier can't prove compliance    |
      |  2. Trigger core:risk_premium          |
      |  3. Calculate cost of third-party      |
      |     testing to fill the gap            |
      |  4. Adjust procurement terms           |
      |                                        |
      v
Buyer's ERP: "Material X from Supplier Y:
  Base price: EUR 12.50/kg
  Risk premium: EUR 0.80/kg (unverified REACH status)
  Total: EUR 13.30/kg

  Note: Premium removed automatically when
  supplier provides certified compute response."
```

Compliance becomes an economic signal. Suppliers who invest in certification and automation get better pricing. The market rewards transparency without requiring anyone to reveal trade secrets.

---

## 3. The Compliance Hypervisor

The Simulator validates packs before installation. But once a pack is installed and running, what prevents a `community` tier Logic Pack from producing a false pass that exposes the tenant to legal liability?

The Compliance Hypervisor provides runtime isolation. If the Simulator is the compiler, the Hypervisor is the process manager — it knows which logic is trusted, which is sandboxed, and who was watching when decisions were made.

### 3.1 Sandboxed Legal Liability

When a Logic Pack runs during evaluation, the Hypervisor tags every handler execution with the trust tier of the pack that defined it.

```
Product evaluation: "Hand Sanitizer HS-200"
        |
        v
Rule Stack assembled (Cascade):
  [SYSTEM]     core:completeness_check     -> trust: platform
  [VERTICAL]   @eu/biocides-528@1.0.0      -> trust: verified
  [LOCAL]      @internal/green-policy@2.0   -> trust: community
        |
        v
Hypervisor wraps each execution:

  +-- TRUSTED ZONE (certified/verified) -----+
  |                                           |
  |  core:threshold_check (Biocides)          |
  |  Trust: verified                          |
  |  Result: PASS                             |
  |                                           |
  +-------------------------------------------+

  +-- SANDBOX (community) -------------------+
  |                                           |
  |  core:absence_check (Green Policy)        |
  |  Trust: community                         |
  |  Result: PASS                             |
  |                                           |
  |  WARNING: This result is backed by        |
  |  unaudited logic. Tenant assumes          |
  |  full liability.                          |
  |                                           |
  +-------------------------------------------+
```

### 3.2 Liability Attribution

The Execution Trace records which zone each handler ran in. If a product later fails in the real world, the trace shows exactly where the logic came from:

| Scenario | Liability | Trace Shows |
|----------|-----------|-------------|
| Certified pack produced false pass | Publisher + certifier liable | "Instruction pointer in TRUSTED ZONE, pack signed by TUV" |
| Community pack produced false pass | Tenant liable | "Instruction pointer in SANDBOX, community tier, no external audit" |
| Verified pack produced false pass | Shared liability | "Instruction pointer in TRUSTED ZONE, verified by EuroComply" |

### 3.3 Context Switches and Logic Isolation

The Execution Trace records the exact moment of context switching whenever the VM moves between trust zones. This prevents "Logic Leaking" — where a community-tier handler manipulates the inputs of a subsequent certified handler.

The Hypervisor treats trust zones as separate, non-overlapping memory spaces for the data being evaluated.

```
Execution Trace (with context switches):

  [ENTER TRUSTED ZONE -- @eu/biocides-528@1.0.0 (verified)]
    step_01: core:threshold_check -> PASS
    step_02: core:list_check -> PASS
    step_03: core:for_each -> PASS (3 substances)
  [EXIT TRUSTED ZONE -- snapshot state hash: sha256:aaa...]

  [CONTEXT SWITCH -- state hash verified: sha256:aaa...]

  [ENTER SANDBOX -- @internal/green-policy@2.0 (community)]
    step_04: core:absence_check -> PASS
    step_05: core:threshold_check -> PASS
  [EXIT SANDBOX -- snapshot state hash: sha256:bbb...]

  [CONTEXT SWITCH -- state hash verified: sha256:bbb...]
  [VERIFY: sandbox did NOT mutate trusted zone inputs]

  [ENTER TRUSTED ZONE -- @eu/reach-svhc@1.4.2 (certified)]
    step_06: core:threshold_check -> PASS
    input_hash: sha256:aaa...  <-- matches pre-sandbox state
  [EXIT TRUSTED ZONE]
```

The state hash at each boundary proves the sandbox operated on an isolated copy. If a community pack's output feeds into a certified pack's input, the Hypervisor flags it as a **cross-zone dependency** — the certified result's trust is downgraded because its inputs were influenced by unaudited logic.

### 3.4 Sandbox Constraints

The Hypervisor enforces runtime constraints on sandboxed packs:

```typescript
interface SandboxPolicy {
  // What sandboxed packs can do
  allowed_handlers: string[];          // Restrict to safe subset

  // What sandboxed packs cannot do
  deny_override_certified: boolean;    // Cannot override a certified result
  deny_weaken_threshold: boolean;      // Cannot set a less restrictive limit

  // Escalation
  require_human_review: boolean;       // Flag all sandbox results for review
  max_cascade_priority: number;        // Cap how high sandbox logic sits
}
```

A tenant can configure: "Community packs can add stricter rules (our green policy bans more than the law requires) but can never weaken a certified check." The Hypervisor enforces this at runtime — if a community pack tries to override a certified threshold with a less restrictive one, the execution is blocked.

### 3.5 Proof of Oversight (PoO)

When the Simulator presents a Diff Report and a human approves it, the Hypervisor generates a cryptographically signed Proof of Oversight — evidence that a human actually reviewed the change.

```typescript
interface ProofOfOversight {
  // What was reviewed
  simulation_id: string,
  diff_report_hash: string,

  // Who reviewed it
  reviewer: {
    user_id: string,
    did: string,                       // Reviewer's personal DID
    role: string,                      // "Compliance Manager"
    organization_did: string
  },

  // How they reviewed it
  review_evidence: {
    diff_report_viewed: boolean,
    time_spent_seconds: number,
    sections_viewed: string[],

    // Minimum review thresholds
    minimum_review_time_met: boolean,
    all_critical_sections_viewed: boolean
  },

  // The decision
  decision: "approved" | "rejected",
  decision_timestamp: string,
  justification?: string,

  // Cryptographic proof
  signature: string,                   // Reviewer signs the entire PoO

  // Continuous heartbeat
  heartbeat_chain: Array<{
    timestamp: string,
    session_active: boolean,
    signature: string
  }>
}
```

**Why the heartbeat matters:** In a legal dispute, "our AI reviewed and approved it" is not a defense. The PoO proves:

1. A specific human (identified by DID) reviewed the change
2. They spent a measurable amount of time on the review
3. They viewed the critical sections of the diff report
4. They were actively present during the review (heartbeat)
5. They explicitly approved with their personal cryptographic signature

The PoO is attached to the Compliance Lock. Every locked state has a chain of PoOs showing the human decisions that led to that configuration.

```json
{
  "compliance-lock": "...",
  "oversight": [
    {
      "simulation_id": "sim_123",
      "change": "Installed @eu/cosmetics-1223@2.1.0",
      "reviewer": "did:web:acme.com:users:jane-doe",
      "review_time_seconds": 340,
      "decision": "approved",
      "poo_signature": "z9ABCdef..."
    },
    {
      "simulation_id": "sim_456",
      "change": "Bumped @eu/reach-svhc 1.4.2 -> 1.5.0",
      "reviewer": "did:web:acme.com:users:john-smith",
      "review_time_seconds": 890,
      "decision": "approved",
      "poo_signature": "y7GHIjkl..."
    }
  ]
}
```

---

## 4. Federated Sentinel Intelligence

The Registry currently stores packs and serves them on request. The Sentinel transforms the Registry from a passive library into a federated immune system that detects threats across the network and responds automatically.

### 4.1 Anonymized Anomaly Cross-Pollination

Every tenant running `ai:anomaly_detect` generates signals — flagged SDS inconsistencies, suspicious purity levels, unusual concentration patterns. Today those signals stay local. The Sentinel aggregates them anonymously across the network.

```
Tenant A (Germany):
  ai:anomaly_detect flags Supplier X's SDS
  "Purity level 99.97% for industrial-grade solvent -- unusual"
  Signal: { supplier_hash: sha256(X), substance: gsr:12345,
            anomaly: "purity_outlier", confidence: 0.72 }

Tenant B (France):
  ai:anomaly_detect flags same supplier
  "Purity level 99.98% -- statistically improbable for this CAS"
  Signal: { supplier_hash: sha256(X), substance: gsr:12345,
            anomaly: "purity_outlier", confidence: 0.68 }

            ... 48 more tenants flag similar anomalies ...

Sentinel aggregates:
  "50 independent anomaly signals for supplier_hash:sha256(X)
   on substance gsr:12345. Pattern: systematic purity inflation.
   Confidence: 0.94 (corroborated across 50 sources).
   Action: Issue Threat Signature."
```

**Privacy guarantees:**

- Tenant identity is never shared — signals are anonymized
- Supplier identity is hashed — only the pattern matters, not the name
- Individual anomaly details stay local — only the signal type and confidence are aggregated
- No tenant can see another tenant's signals — only the Sentinel sees the aggregate

### 4.2 Trust-Weighted Signal Aggregation

To prevent "Sentinel Sabotage" — a supplier creating 50 fake community tenants to flag a competitor's materials — the Sentinel weights signals based on the reporter's trust profile.

| Reporter Profile | Signal Weight | Rationale |
|------------------|---------------|-----------|
| Tenant using certified packs, 2+ year history | 1.0x | Established, audited operations |
| Tenant using verified packs, 1+ year history | 0.7x | Known entity, standard operations |
| Tenant using community packs, <6 months | 0.2x | Unproven, potential sockpuppet |
| Tenant with previous false-positive flags | 0.1x | Track record of unreliable signals |

The corroboration confidence is calculated from weighted signals, not raw counts. 50 signals from low-weight tenants carry less weight than 5 signals from high-weight tenants. This makes Sentinel Sabotage economically impractical — an attacker would need to maintain dozens of certified-tier tenants with years of history to game the system.

### 4.3 Threat Signatures

When the Sentinel detects a corroborated pattern, it issues a Threat Signature — a structured alert pushed to all tenants through the Registry's subscription mechanism.

```typescript
interface ThreatSignature {
  id: string,
  severity: "advisory" | "warning" | "critical",

  pattern: {
    type: "purity_inflation" | "misclassification" | "certificate_forgery" |
          "threshold_gaming" | "identity_mismatch",
    description: string,

    // What to match against — no supplier names, only patterns
    match_criteria: {
      substance_gsr_ids?: string[],
      cas_numbers?: string[],
      region?: string[],
      document_type?: string,
      anomaly_indicators: Array<{
        field: string,
        condition: string,
        value: unknown
      }>
    }
  },

  // How many independent sources corroborated
  corroboration: {
    weighted_score: number,            // Trust-weighted confidence
    raw_source_count: number,          // Unweighted count
    effective_source_count: number,    // Weighted equivalent
    first_detected: string,
    pattern_stable_since: string
  },

  // What the OS should do
  recommended_action: {
    type: "flag_for_review" | "require_additional_evidence" |
          "block_until_verified" | "downgrade_trust",

    // For the Regulatory Firewall
    firewall_rule?: {
      block_vcs_matching: object,
      require_before_accept: string
    }
  },

  // Registry response
  auto_patch?: {
    logic_pack: string,
    patch_version: string,
    patch_description: string
  },

  signature: string
}
```

### 4.4 The Regulatory Firewall

The Sentinel doesn't just detect threats — it acts on them. The Regulatory Firewall intercepts incoming Verifiable Credentials that match active Threat Signatures.

```
Company B receives VC from Supplier X
        |
        v
A2A Protocol: a2a:verify_claim
        |
        v
Standard checks: signature, expiration, revocation
        |
        v
Regulatory Firewall:
  Check VC against active Threat Signatures
        |
        +--> Match found: Threat SIG-2026-0042
        |    "Systematic purity inflation for CAS 67-64-1
        |     in APAC region. 50 corroborated reports."
        |
        v
  FIREWALL ACTION:
  VC quarantined. Not rejected — held for deeper verification.

  Auto-triggered:
    a2a:request_evidence({
      to: supplier_x,
      depth: "reproducible",
      required: ["independent_lab_coa", "batch_specific_analysis"],
      reason: "Network-wide anomaly pattern detected for this substance.
               Additional evidence required before acceptance."
    })
        |
        v
  Supplier X must provide deeper evidence to clear the firewall.
  If they can: VC accepted, firewall exception logged.
  If they can't: VC remains quarantined, risk premium applied.
```

### 4.5 Sentinel-Triggered Logic Pack Patches

When a Threat Signature identifies a systematic gap in a Logic Pack, the Sentinel can issue an automatic patch.

```
Sentinel detects:
  "Suppliers are reporting 99.9%+ purity to avoid SVHC
   concentration thresholds. Current @eu/reach-svhc does
   not validate purity against industry baselines."
        |
        v
Sentinel issues patch:
  @eu/reach-svhc@1.4.3 (patch)
  Added: core:threshold_check for purity range validation
  Added: ai:anomaly_detect for statistical purity analysis
  Trust tier: verified (auto-generated, EuroComply reviewed)
        |
        v
Registry pushes update notification to all tenants:
  "Security patch available for @eu/reach-svhc.
   Addresses: Purity inflation attack vector.
   Impact: May flag 0-3 products for review.
   Recommended: Install via Safe Bump workflow."
```

The patch follows the standard Safe Bump workflow — the Simulator runs the Shadow Test, the tenant approves before anything changes. The Sentinel can detect and propose fixes, but it cannot force changes onto a tenant's locked state.

### 4.6 Sentinel Probes (Active Immune Response)

Instead of passively waiting for VCs to arrive at the firewall, the Sentinel can issue active probes when a threat reaches critical severity.

When a Threat Signature reaches `severity: critical`, the Sentinel instructs the Registry to automatically send `a2a:compute_challenge` requests to all suppliers matching the pattern — flushing out inconsistencies across the entire industry graph simultaneously.

```
Threat SIG-2026-0042 reaches CRITICAL
        |
        v
Sentinel issues Probe Directive:
  "All tenants with active supply relationships
   involving CAS 67-64-1 from APAC suppliers:
   Issue a2a:compute_challenge for @eu/reach-svhc"
        |
        v
Registry distributes to affected tenants:
  Tenant A --> a2a:compute_challenge to Supplier X
  Tenant B --> a2a:compute_challenge to Supplier X
  Tenant C --> a2a:compute_challenge to Supplier Y
  Tenant D --> a2a:compute_challenge to Supplier Z
        |
        v
Results aggregated (anonymized):
  Supplier X: 3 of 3 challenges DECLINED
  Supplier Y: 2 of 2 challenges PASSED (instruction aligned)
  Supplier Z: 1 PASSED, 1 TRACE MISMATCH
        |
        v
Sentinel updates Threat Signature:
  Supplier_hash(X): Confidence raised to 0.98
  Supplier_hash(Z): New pattern detected, secondary investigation
  Supplier_hash(Y): Cleared from threat pattern
```

The Probe turns the network from passive defense (wait for bad VCs) to active immune response (challenge suspicious suppliers in parallel).

### 4.7 Contribution Credits

Why would a tenant share their anomaly data? The Sentinel includes an incentive mechanism.

Tenants who contribute high-confidence signals that lead to a verified Threat Signature receive contribution credits via the `core:contribution_credit` handler:

| Contribution | Credit |
|--------------|--------|
| Signal that contributes to a verified Threat Signature | Registry credits (offset pack licensing costs) |
| Signal that leads to a critical-severity Threat | Early access to verified-tier Logic Packs |
| Consistently high-quality signals over time | Elevated signal weight (higher trust in future aggregation) |

The incentive is self-reinforcing: tenants who contribute good signals get better signal weight, which means their future contributions matter more, which incentivizes continued participation.

### 4.8 Sentinel + Hypervisor Integration

The Hypervisor enforces Threat Signatures at the VM level:

- The Hypervisor adds a `threat_check` step before any evaluation involving a flagged substance
- The Execution Trace records whether the product's data matched an active threat pattern
- If a match is found, the result is flagged but not automatically failed — the tenant decides how to respond based on their risk policy
- The PoO must explicitly acknowledge active threat signatures during review

---

## 5. Cross-Innovation Integration

The four innovations are not independent features. They form a unified defense-in-depth system.

### 5.1 Hot-Swap + Sentinel

When the Sentinel detects a new attack pattern (e.g., purity inflation), the Hot-Swap Kernel can automatically run `core:future_cast` against the proposed patch — showing tenants the impact of the security fix before they install it.

```
Sentinel: "Patch @eu/reach-svhc@1.4.3 available"
        |
        v
Hot-Swap: core:future_cast({
  scenario: { draft_pack: "@eu/reach-svhc@1.4.3" },
  scope: { portfolio: true }
})
        |
        v
Tenant sees: "Installing this patch will flag 2 products
for purity review. No compliance status changes."
```

### 5.2 ZKR + Hypervisor

When Company A responds to a Zero-Knowledge Compute Challenge, the Hypervisor metadata is included in the redacted trace:

```
Redacted Trace:
  Result: PASS
  Handlers: 14x core:threshold_check
  Values: [REDACTED]

  Hypervisor Report:
    Trusted Zone: 12 of 14 executions (certified packs)
    Sandbox: 2 of 14 executions (community pack)
    Context Switches: 2 (state hashes verified)

    PoO Chain: 2 approvals on record
    Latest PoO: 2026-03-01 by did:web:acme.com:users:jane-doe
```

Company B can make a nuanced trust decision: "12 of 14 checks used certified logic. 2 used community logic in a sandbox with verified isolation. A human reviewed this configuration 14 days ago. Acceptable."

### 5.3 Sentinel + ZKR (Probe Challenges)

The Sentinel's active probes use ZKR compute challenges. This means the Sentinel can investigate suppliers across the network without any tenant revealing their supply chain relationships or formulations to each other.

### 5.4 Hypervisor + Hot-Swap (Future Cast with Trust Zones)

When `core:future_cast` evaluates a draft regulation, the Hypervisor tags the draft Logic Pack as `sandbox` — ensuring the temporal branch is clearly separated from production trust zones in the trace.

---

## 6. Implementation Sequence

These innovations build on the stable kernel and on each other.

### Phase 1: Hypervisor (Foundation for Trust Isolation)

| Deliverable | Description |
|-------------|-------------|
| Trust zone tagging | Tag handler executions with pack trust tier |
| Context switch logging | State hash snapshots at trust zone boundaries |
| Sandbox constraints | Runtime enforcement of sandbox policy |
| Cross-zone dependency detection | Flag when sandbox output feeds certified input |

**Why first:** Every other innovation depends on trust isolation. ZKR traces need Hypervisor metadata. The Sentinel needs trust zones to weight signals. Hot-Swap needs sandbox tagging for draft packs.

### Phase 2: Hot-Swap Kernel

| Deliverable | Description |
|-------------|-------------|
| Regulatory interrupt pipeline | GSR/Registry change detection triggers shadow evaluation |
| `core:future_cast` handler | Temporal branching against draft Logic Packs |
| Shadow Hot-Swap engine | Fork graph, apply changes, compute impact, generate report |
| Branch management | Maintain multiple compliance branches per tenant |

### Phase 3: Zero-Knowledge Requests

| Deliverable | Description |
|-------------|-------------|
| `a2a:compute_challenge` | Issue redacted computation requests |
| `a2a:compute_response` | Generate and sign redacted execution traces |
| Instruction Alignment verification | Compare trace structure against Logic Pack AST |
| Redaction engine | Configurable redaction masks for execution traces |
| Liability Marketplace primitives | `core:risk_premium` handler for automated pricing signals |

### Phase 4: Federated Sentinel

| Deliverable | Description |
|-------------|-------------|
| Anonymized signal collection | Privacy-preserving anomaly signal aggregation |
| Trust-weighted correlation | Signal weighting by reporter trust profile |
| Threat Signature issuance | Pattern detection, signature generation, distribution |
| Regulatory Firewall | VC interception and quarantine based on active threats |
| Sentinel Probes | Active `a2a:compute_challenge` campaigns on critical threats |
| Contribution credits | `core:contribution_credit` handler and incentive tracking |
| Logic Pack patching | Automated patch generation and Safe Bump distribution |

### Phase 5: Proof of Oversight

| Deliverable | Description |
|-------------|-------------|
| PoO generation | Cryptographic proof of human review |
| Review evidence capture | Time tracking, section viewing, heartbeat chain |
| PoO attachment to Compliance Lock | Chain of oversight decisions in lock history |
| Minimum review thresholds | Configurable minimums for review time and coverage |

### Dependency on Stable Kernel

```
Handler VM (48 primitives)          --> Required: all innovations execute handlers
Registry (pack management)          --> Required: Hot-Swap, Sentinel, trust tiers
A2A Protocol (5 primitives)         --> Required: ZKR, Sentinel Probes
Compliance Lock (deterministic pin) --> Required: Hot-Swap branching, PoO chain
Simulator (Shadow Test)             --> Required: Hot-Swap, Sentinel patches
Graph (Neo4j)                       --> Required: future_cast traversal, Sentinel probes
```

---

## Invariants

These rules are enforced across all breakthrough innovations:

1. **Context switches are always logged** — the Hypervisor records every trust zone transition with state hashes
2. **Sandbox logic cannot weaken certified results** — the Hypervisor blocks any attempt to override a certified check with a less restrictive one
3. **Instruction Alignment is mandatory for ZKR** — a compute response with a trace mismatch is automatically rejected
4. **Sentinel cannot force lock changes** — threat patches follow the standard Safe Bump workflow with human approval
5. **PoO requires a real human** — automated approvals are not valid; the heartbeat chain must show active human presence
6. **Signals are always anonymized** — no tenant identity or raw anomaly data leaves the tenant boundary
7. **Trust-weighted aggregation prevents sabotage** — signal weight is earned through compliance history, not volume

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-02-03 | Initial design from brainstorming session |

---

*The Breakthrough Evolution Layer transforms EuroComply from a compliance management system into a self-healing, privacy-preserving, liability-isolating industrial operating system — where regulations are interrupts not batch jobs, verification happens without disclosure, trust boundaries are forensic-grade, and the network collectively immunizes against fraud.*
