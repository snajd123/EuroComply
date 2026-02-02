# Handler Standard Library Design

> **Status:** DRAFT
> **Created:** 2026-02-02
> **Authors:** Human + Claude (Brainstorming Session)
> **Depends On:** [v2 Platform Architecture Design](./2026-02-02-v2-platform-architecture-design.md)

---

## Executive Summary

The Handler Standard Library is the **instruction set** of the EuroComply Compliance Virtual Machine. These ~48 handlers are the immutable, tested, audited primitives that:

- AI agents **compose** but cannot modify
- Form the rock-solid foundation that makes AI programming safe
- Provide detailed **explanations** alongside results for trust and auditability
- Enable the platform to be an **AI-Programmable Industrial Operating System**

### Core Principle

```
The Handler Standard Library is to EuroComply what CPU instructions are to a computer.

- Handlers are IMMUTABLE primitives (like ADD, MOV, CMP)
- Rules are PROGRAMS composed from handlers (like assembly code)
- The Seeder COMPILES rules into executable form
- AI agents PROGRAM the platform by composing handlers into rules
- The SIMULATOR validates AI-generated rules before deployment
```

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Handler Categories](#2-handler-categories)
3. [Computation Handlers](#3-computation-handlers)
4. [Validation Handlers](#4-validation-handlers)
5. [Logic Gate Handlers](#5-logic-gate-handlers)
6. [Graph Handlers](#6-graph-handlers)
7. [Resolution Handlers](#7-resolution-handlers)
8. [AI/Intelligence Handlers](#8-aiintelligence-handlers)
9. [**AI-Programmable Platform**](#9-ai-programmable-platform) *(Core Innovation)*
10. [MCP Tool Interface](#10-mcp-tool-interface)
11. [The Simulator](#11-the-simulator)
12. [Implementation Plan](#12-implementation-plan)

---

## 1. Design Principles

### 1.1 Every Handler is a Pure Function

```typescript
// Every handler implements this interface
interface Handler<TConfig, TInput, TOutput> {
  readonly id: string;           // e.g., "core:bom_sum"
  readonly version: string;      // e.g., "1.0.0"
  readonly category: HandlerCategory;

  readonly configSchema: JsonSchema;
  readonly inputSchema: JsonSchema;
  readonly outputSchema: JsonSchema;

  readonly description: string;
  readonly examples: HandlerExample[];

  execute(
    config: TConfig,
    input: TInput,
    context: ExecutionContext
  ): Promise<HandlerResult<TOutput>>;
}
```

### 1.2 Every Handler Returns Explanations

The **Explanation** interface is key to trust. Every handler result includes human-readable reasoning.

```typescript
interface HandlerResult<T> {
  success: boolean;
  value: T;
  explanation: Explanation;      // Human-readable breakdown
  trace: ExecutionTrace;         // For debugging/audit
  warnings?: Warning[];
}

interface Explanation {
  summary: string;               // One-line result
  steps: ExplanationStep[];      // Step-by-step reasoning
  references?: Reference[];      // Regulations, data sources cited
}

interface ExplanationStep {
  action: string;                // What was done
  result: string;                // What was found
  data?: Record<string, unknown>; // Supporting data
}

interface Reference {
  type: 'regulation' | 'gsr' | 'document' | 'calculation';
  id: string;
  title?: string;
  excerpt?: string;
}
```

### 1.3 Design Principles Summary

| Principle | Description |
|-----------|-------------|
| **Pure Functions** | Same input always produces same output |
| **Typed Contracts** | JSON Schema for config, input, output |
| **Self-Documenting** | Description, examples, explanation built-in |
| **Composable** | Output of one handler feeds input of another |
| **Versioned** | Breaking changes require new version |
| **Testable** | Every handler has comprehensive test suite |
| **Explainable** | Every result includes human-readable reasoning |

---

## 2. Handler Categories

| Category | Count | Purpose |
|----------|-------|---------|
| **Computation** | 9 | Calculate values from BOM and data |
| **Validation** | 10 | Pass/fail checks against requirements |
| **Logic Gates** | 5 | Compose validations (AND, OR, IF_THEN) |
| **Graph** | 8 | Traverse supply chain knowledge graph |
| **Resolution** | 8 | Resolve conflicts, find alternatives |
| **AI/Intelligence** | 8 | LLM-powered reasoning and generation |
| **Total** | **48** | |

---

## 3. Computation Handlers

These handlers calculate values from product data, BOMs, and materials.

### 3.1 `core:bom_sum`

Sum a field across all items in a Bill of Materials.

```typescript
interface BomSumConfig {
  source: {
    entity: 'materials' | 'components' | 'substances';
    path?: string;                 // Nested path: 'materials.substances'
  };
  field: string;                   // Field to sum: 'concentration', 'weight'
  filter?: {
    field: string;
    operator: 'eq' | 'ne' | 'in' | 'not_in' | 'gt' | 'lt';
    value: unknown;
  };
  normalize_to?: string;           // Target unit for normalization
}

interface BomSumOutput {
  total: number;
  unit: string;
  item_count: number;
  items_included: Array<{ id: string; name: string; value: number }>;
}
```

**Use Cases:**
- Total concentration of all substances in a material
- Sum of weights for shipping calculation
- Total recycled content percentage

### 3.2 `core:bom_max`

Find maximum value in BOM - identify worst-case component.

```typescript
interface BomMaxConfig {
  source: { entity: string; path?: string };
  field: string;
  filter?: { field: string; operator: string; value: unknown };
}

interface BomMaxOutput {
  max_value: number;
  max_item: { id: string; name: string; value: number };
  all_values: Array<{ id: string; name: string; value: number }>;
}
```

### 3.3 `core:bom_min`

Find minimum value in BOM - find lowest purity, earliest expiration.

### 3.4 `core:bom_weighted`

**Critical for chemical compliance.** Cascading weighted calculation through BOM hierarchy.

```typescript
interface BomWeightedConfig {
  source: { entity: string; path?: string };
  value_field: string;             // e.g., 'concentration'
  weight_field: string;            // e.g., 'percentage_in_parent'
  accumulation: 'multiply' | 'add';

  // For nested BOMs
  recurse?: boolean;
  max_depth?: number;
}

interface BomWeightedOutput {
  final_value: number;
  calculation_path: Array<{
    level: number;
    item: string;
    local_value: number;
    weight: number;
    cumulative: number;
  }>;
}
```

**Example:** A substance is 5% in a raw material, that raw material is 10% of the product.
Actual concentration = 5% × 10% = 0.5% in final product.

### 3.5 `core:count`

Count items matching criteria.

```typescript
interface CountConfig {
  source: { entity: string; path?: string };
  filter?: { field: string; operator: string; value: unknown };
  distinct_by?: string;            // Count unique values of this field
}

interface CountOutput {
  count: number;
  items: Array<{ id: string; name: string }>;
}
```

### 3.6 `core:rollup`

Aggregate values from children to parent - for hierarchical BOMs.

```typescript
interface RollupConfig {
  source: { entity: string };
  aggregation: 'sum' | 'max' | 'min' | 'avg' | 'count';
  field: string;
  group_by?: string;               // Create subtotals
}
```

### 3.7 `core:average`

Calculate mean value across items.

### 3.8 `core:ratio`

Calculate ratio between two values (e.g., water/oil phase ratio).

```typescript
interface RatioConfig {
  numerator: number | { handler: string; config: unknown };
  denominator: number | { handler: string; config: unknown };
  format?: 'decimal' | 'percentage' | 'fraction';
}
```

### 3.9 `core:unit_convert`

Convert between units - critical for normalizing data from different sources.

```typescript
interface UnitConvertConfig {
  source_value: number | { field: string };
  source_unit: string | { field: string };
  target_unit: string;
  decimal_places?: number;
  rounding?: 'floor' | 'ceil' | 'round';
}

interface UnitConvertOutput {
  converted_value: number;
  source_value: number;
  source_unit: string;
  target_unit: string;
  conversion_factor: number;
}
```

**Supported Dimensions:**

| Dimension | Base Unit | Supported Units |
|-----------|-----------|-----------------|
| Concentration | FRACTION | PERCENT, PPM, PPB, MG_KG, MG_L |
| Mass | KG | G, MG, UG, LB, OZ |
| Volume | L | ML, M3, GAL |
| Temperature | KELVIN | CELSIUS, FAHRENHEIT |
| Dose | MG_KG_BW_DAY | (for ADI values) |

---

## 4. Validation Handlers

These handlers return boolean pass/fail with detailed explanations. They output a standardized `ValidationResult` that logic gates can compose.

### Validation Result Contract

```typescript
// Every validation handler outputs this - enables composition
interface ValidationResult {
  pass: boolean;
  handler_id: string;
  handler_version: string;
  explanation: Explanation;
  trace: ExecutionTrace;
  details: Record<string, unknown>;
  confidence?: number;             // 0-1, only for AI handlers
  warnings?: Warning[];
}
```

### 4.1 `core:threshold_check`

Compare value against limit - the most fundamental compliance check.

```typescript
interface ThresholdCheckConfig {
  value: number | { handler: string; config: unknown };
  operator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'ne' | 'between' | 'outside';
  threshold: number | { field: string };
  threshold_upper?: number;        // For 'between' and 'outside'

  tolerance?: {
    type: 'absolute' | 'relative';
    value: number;
  };

  substance_name?: string;         // For explanation
  regulation_ref?: string;         // For explanation
}

interface ThresholdCheckOutput {
  pass: boolean;
  actual_value: number;
  threshold_value: number;
  margin: number;                  // Negative = failed by this much
  margin_percent: number;
}
```

### 4.2 `core:presence_check`

Verify required item exists.

```typescript
interface PresenceCheckConfig {
  source: { entity: string; path?: string };
  match: { field: string; operator: string; value: unknown };
  minimum_count?: number;
  item_description?: string;
  requirement_reason?: string;
}
```

### 4.3 `core:absence_check`

Verify prohibited item does NOT exist - critical for banned substance checking.

```typescript
interface AbsenceCheckConfig {
  source: { entity: string; path?: string };
  prohibited: { field: string; operator: string; value: unknown };

  unless?: {
    concentration_below?: number;  // Trace allowance
    has_exemption_code?: string[];
  };

  item_description?: string;
  regulation_ref?: string;
}

interface AbsenceCheckOutput {
  pass: boolean;
  found_prohibited: Array<{
    id: string;
    name: string;
    concentration?: number;
    exemption_applied?: string;
  }>;
  exemptions_applied: number;
}
```

### 4.4 `core:list_check`

Check against reference list (positive list, negative list, restricted list).

```typescript
interface ListCheckConfig {
  value: string | { field: string };
  list_type: 'positive' | 'negative' | 'restricted';
  list_source: {
    type: 'gsr_table' | 'inline' | 'external_api';
    table?: string;                // e.g., 'substance_reach_svhc'
    lookup_field?: string;
    inline_values?: string[];
  };
  restriction_fields?: string[];   // What to extract from restricted lists
}
```

### 4.5 `core:date_check`

Validate dates for expiration, effectiveness, compliance windows.

```typescript
interface DateCheckConfig {
  date: string | Date | { field: string };
  check_type: 'not_expired' | 'not_before' | 'not_after' | 'within_range' | 'age_max' | 'age_min';
  reference_date?: string | Date | { field: string };
  max_age?: { value: number; unit: 'days' | 'months' | 'years' };
  grace_period?: { value: number; unit: 'days' | 'months' };
}
```

### 4.6 `core:document_check`

Verify required documents are attached and valid.

```typescript
interface DocumentCheckConfig {
  required_documents: Array<{
    type: string;                  // 'sds', 'coa', 'test_report'
    description: string;
    must_be_current?: boolean;
    max_age?: { value: number; unit: string };
    required_fields?: string[];
    issuer_requirements?: {
      must_be_accredited?: boolean;
      accepted_issuers?: string[];
    };
  }>;
  source: { entity: string; documents_field: string };
}
```

### 4.7 `core:credential_check`

Validate verifiable credentials - signatures, expiration, revocation.

```typescript
interface CredentialCheckConfig {
  credential: { field: string } | string;
  checks: {
    signature?: boolean;
    expiration?: boolean;
    revocation?: boolean;
    issuer?: {
      trusted_issuers?: string[];
      issuer_type?: string[];
    };
    schema?: {
      required_type?: string;
      required_claims?: string[];
    };
  };
}
```

### 4.8 `core:enum_check`

Validate value is in allowed set.

### 4.9 `core:pattern_check`

Validate format (regex, GTIN, CAS number, EC number).

```typescript
interface PatternCheckConfig {
  value: string | { field: string };
  pattern_type: 'regex' | 'gtin' | 'cas' | 'ec_number' | 'email' | 'url' | 'custom';
  regex?: string;
  error_message?: string;
}
```

### 4.10 `core:completeness_check`

Verify all required fields are populated - critical for compliance dossiers.

```typescript
interface CompletenessCheckConfig {
  entity: string | { field: string };
  required_fields: Array<{
    path: string;                  // Dot notation: 'supplier.contact.email'
    description: string;
    condition?: {                  // Conditionally required
      if_field: string;
      operator: string;
      value?: unknown;
    };
    validation?: {
      not_empty?: boolean;
      min_length?: number;
      min_items?: number;
    };
  }>;
  minimum_completion?: number;     // 0-100, default 100
}
```

---

## 5. Logic Gate Handlers

These handlers compose validation results - the "glue" that builds complex rules from simple checks.

### 5.1 `core:and`

All conditions must pass.

```typescript
interface AndConfig {
  conditions: Array<{
    handler: string;
    config: unknown;
    label?: string;
  }>;
  short_circuit?: boolean;         // Stop on first failure (default true)
  minimum_pass?: number;           // For weighted AND: 3 of 4 must pass
}

interface AndOutput {
  pass: boolean;
  results: ValidationResult[];
  passed_count: number;
  failed_count: number;
  first_failure?: { index: number; label: string; reason: string };
}
```

### 5.2 `core:or`

At least one condition must pass - enables exemption patterns.

```typescript
interface OrConfig {
  conditions: Array<{
    handler: string;
    config: unknown;
    label?: string;
    priority?: number;             // Try higher priority first
  }>;
  short_circuit?: boolean;
  minimum_pass?: number;           // Default 1
}
```

**Example: Exemption Pattern**

```typescript
// Substance banned OR has exemption certificate
const rule = {
  handler: 'core:or',
  config: {
    conditions: [
      {
        handler: 'core:absence_check',
        config: { prohibited: { field: 'cas_number', operator: 'eq', value: '50-00-0' } },
        label: 'Substance not present',
        priority: 1
      },
      {
        handler: 'core:credential_check',
        config: { checks: { schema: { required_type: 'SubstanceExemptionCredential' } } },
        label: 'Valid exemption certificate',
        priority: 2
      }
    ]
  }
};
```

### 5.3 `core:not`

Invert a validation result.

### 5.4 `core:if_then`

Conditional validation - only check B if A is true.

```typescript
interface IfThenConfig {
  if: { handler: string; config: unknown; label?: string };
  then: { handler: string; config: unknown; label?: string };
  else?: { handler: string; config: unknown; label?: string };
  default_when_skipped?: boolean;  // Default true
}
```

**Example:** IF product contains nanomaterials THEN must have nano safety assessment.

### 5.5 `core:for_each`

Apply validation to every item in a collection.

```typescript
interface ForEachConfig {
  source: { entity: string; path?: string; filter?: object };
  validation: { handler: string; config: unknown };
  require: 'all' | 'any' | 'none' | { minimum: number } | { minimum_percent: number };
  parallel?: boolean;
  max_concurrency?: number;
}

interface ForEachOutput {
  pass: boolean;
  total_items: number;
  passed_items: number;
  failed_items: number;
  item_results: Array<{ item_id: string; item_name?: string; result: ValidationResult }>;
  failures?: Array<{ item_id: string; item_name: string; reason: string }>;
}
```

---

## 6. Graph Handlers

These handlers traverse the Neo4j knowledge graph for supply chain analysis.

### 6.1 `core:trace_upstream`

Trace substance/material back through supply chain to origins.

```typescript
interface TraceUpstreamConfig {
  start_node: { type: string; id: string | { field: string } };
  trace_target?: { type: string; filter?: object };
  max_depth?: number;
  relationships?: string[];        // 'CONTAINS', 'MADE_FROM', 'SUPPLIED_BY'
  include_quantities?: boolean;
  stop_at?: { node_type?: string[]; node_property?: object };
}

interface TraceUpstreamOutput {
  paths: Array<{
    nodes: Array<{ id: string; type: string; name: string; properties: object }>;
    relationships: Array<{ type: string; properties: object }>;
    cumulative_concentration?: number;
    total_depth: number;
  }>;
  origin_nodes: Array<{ id: string; type: string; name: string; path_count: number }>;
  suppliers_involved: Array<{ id: string; name: string; supplies: string[] }>;
}
```

### 6.2 `core:trace_downstream`

Find all products/customers affected by a substance, material, or supplier.

### 6.3 `core:find_path`

Find compliance paths - how does a certification satisfy a requirement?

```typescript
interface FindPathConfig {
  from_node: { type: string; id: string | { field: string } };
  to_node: { type: string; id?: string; filter?: object };
  relationship_types?: string[];
  max_depth?: number;
  prefer?: 'shortest' | 'most_recent' | 'highest_trust' | 'lowest_cost';
  waypoints?: Array<{ type: string; filter?: object }>;
  blocked_nodes?: Array<{ type: string; filter?: object }>;
}
```

### 6.4 `core:subgraph_extract`

Extract a subgraph for analysis - the product's "compliance universe."

### 6.5 `core:impact_analysis`

Calculate cascading impact of a change (substance ban, supplier loss).

```typescript
interface ImpactAnalysisConfig {
  change: {
    type: 'substance_ban' | 'supplier_loss' | 'regulation_change' | 'threshold_change';
    target_node?: { type: string; id: string };
    old_value?: unknown;
    new_value?: unknown;
  };
  scope: { node_types: string[]; max_depth?: number };
  suggest_alternatives?: boolean;
  include_financials?: boolean;
}

interface ImpactAnalysisOutput {
  impact_summary: {
    severity: 'critical' | 'high' | 'medium' | 'low';
    affected_products: number;
    affected_suppliers: number;
    compliance_gaps_created: number;
  };
  affected_entities: Array<{
    id: string; type: string; name: string;
    impact_type: 'direct' | 'indirect';
    impact_description: string;
  }>;
  alternatives?: Array<{
    type: string;
    description: string;
    feasibility: 'high' | 'medium' | 'low';
    affected_products: string[];
  }>;
  financials?: {
    revenue_at_risk: number;
    reformulation_cost_estimate: number;
  };
}
```

### 6.6 `core:shortest_path`

Simple shortest path between two nodes.

### 6.7 `core:neighbors`

Get immediate neighbors - for UI graph exploration.

### 6.8 `core:cycle_detect`

Detect circular dependencies - critical for BOM validation.

---

## 7. Resolution Handlers

These handlers resolve conflicts and make rule-based decisions. Deterministic but intelligent.

### 7.1 `core:data_conflict_resolve`

When multiple sources provide conflicting data, determine which to trust.

```typescript
interface DataConflictResolveConfig {
  values: Array<{
    value: unknown;
    source: string;
    timestamp?: string;
    confidence?: number;
  }>;
  strategy: 'most_recent' | 'highest_confidence' | 'source_hierarchy' |
            'most_conservative' | 'most_common' | 'weighted_average';
  source_priority?: string[];
  tolerance?: number;
  flag_threshold?: number;
}

interface DataConflictResolveOutput {
  resolved_value: unknown;
  resolution_method: string;
  confidence: number;
  conflict_detected: boolean;
  conflict_severity: 'none' | 'minor' | 'significant' | 'critical';
  requires_review?: boolean;
}
```

### 7.2 `core:find_substitute`

Find alternative substances/materials meeting functional requirements.

```typescript
interface FindSubstituteConfig {
  original: { type: string; id: string | { field: string } };
  required_functions: string[];
  constraints: {
    must_not_be_on_lists?: string[];
    must_be_on_lists?: string[];
    max_hazard_class?: string[];
    max_cost_increase_percent?: number;
    min_supplier_count?: number;
  };
  rank_by?: Array<{ factor: string; weight: number }>;
  max_results?: number;
}
```

### 7.3 `core:regulatory_conflict_resolve`

Harmonize requirements across multiple jurisdictions.

```typescript
interface RegulatoryConflictResolveConfig {
  substance_or_product: { type: string; id: string };
  target_markets: string[];
  analyze: {
    concentration_limits?: boolean;
    labeling_requirements?: boolean;
    documentation_requirements?: boolean;
  };
  resolution_strategy: 'most_restrictive' | 'market_specific' | 'hybrid';
}
```

### 7.4 `core:priority_rank`

Rank items by weighted criteria - for action prioritization.

### 7.5 `core:entity_match`

Match/deduplicate entities across sources - critical for data integration.

```typescript
interface EntityMatchConfig {
  source_entity: { type: string; data: object | { field: string } };
  target_pool: { type: string; source: 'gsr' | 'tenant'; table?: string };
  match_fields: Array<{
    source_field: string;
    target_field: string;
    match_type: 'exact' | 'fuzzy' | 'phonetic' | 'numeric_tolerance' | 'synonym';
    weight: number;
    required?: boolean;
    min_similarity?: number;
  }>;
  minimum_match_score: number;
}
```

### 7.6 `core:version_select`

Select appropriate version (regulations, documents, formulations).

### 7.7 `core:threshold_interpolate`

Calculate threshold when value falls between defined points.

### 7.8 `core:action_sequence`

Determine optimal sequence of actions considering dependencies.

---

## 8. AI/Intelligence Handlers

These handlers leverage LLMs. They return **confidence scores** and support **human-in-the-loop**.

### AI Handler Base Output

```typescript
interface AIHandlerOutput<T> {
  result: T;
  confidence: number;              // 0-1, REQUIRED

  reasoning: {
    chain: ReasoningStep[];
    evidence: Evidence[];
    alternatives_considered?: Alternative[];
  };

  requires_review: boolean;
  review_reason?: string;

  model_version: string;
  tokens_used: { input: number; output: number };
}
```

### 8.1 `ai:document_extract`

Extract structured data from unstructured documents (SDS, CoA, test reports).

```typescript
interface DocumentExtractConfig {
  document: {
    type: 'sds' | 'coa' | 'test_report' | 'declaration' | 'regulation';
    content: string | { file_path: string } | { url: string };
  };
  extraction_schema: {
    fields: Array<{
      name: string;
      description: string;
      type: string;
      required: boolean;
      section_hint?: string;
      pattern_hint?: string;
    }>;
  };
  min_confidence: number;
  source_language?: string;
  translate_to?: string;
}
```

### 8.2 `ai:compliance_interpret`

Interpret regulatory text and apply to specific product/substance.

```typescript
interface ComplianceInterpretConfig {
  regulation: { text: string | { regulation_id: string }; jurisdiction: string };
  context: { product?: object; substance?: object; use_case?: string };
  questions: Array<{
    id: string;
    question: string;
    answer_type: 'boolean' | 'threshold' | 'category' | 'action_required';
  }>;
  search_precedents?: boolean;
  min_confidence: number;
}
```

### 8.3 `ai:gap_analysis`

Identify what's missing for compliance.

```typescript
interface GapAnalysisConfig {
  current_state: { entity_type: string; entity_id: string; include_related?: boolean };
  target: { regulation?: string; certification?: string; market?: string };
  depth: 'summary' | 'detailed' | 'actionable';
  estimate_effort?: boolean;
  prioritize_by?: 'deadline' | 'effort' | 'risk' | 'cost';
}

interface GapAnalysisResult {
  overall_readiness: number;       // 0-100%
  overall_status: 'ready' | 'minor_gaps' | 'significant_gaps' | 'major_work_needed';
  gaps: Array<{
    id: string;
    category: string;
    severity: 'critical' | 'major' | 'minor';
    requirement: string;
    current_state: string;
    gap_description: string;
    remediation: { actions: string[]; estimated_effort: string };
  }>;
  strengths: Array<{ requirement: string; status: string; evidence: string }>;
}
```

### 8.4 `ai:natural_query`

Answer natural language questions about compliance.

### 8.5 `ai:document_generate`

Generate compliance documents from structured data.

### 8.6 `ai:classify`

Classify into regulatory categories (GHS hazard, customs HS code).

### 8.7 `ai:anomaly_detect`

Detect unusual patterns indicating data quality or compliance risks.

### 8.8 `ai:explain`

Generate human-readable explanations for compliance decisions.

```typescript
interface ExplainConfig {
  target: { type: string; data: object; handler_trace?: ExecutionTrace };
  audience: 'regulatory_expert' | 'product_manager' | 'executive' | 'consumer';
  depth: 'summary' | 'detailed' | 'technical';
  focus?: string[];
  language: string;
  avoid_jargon?: boolean;
}
```

---

## 9. AI-Programmable Platform

This is the **core innovation** of EuroComply v2: the platform is not fixed software - it's a **Generative Operating System** that AI agents can program at runtime.

### 9.1 The Vision: Software That Programs Itself

Traditional compliance software:
```
Developer writes code → Deploys → Users use fixed features
```

EuroComply v2:
```
Handlers are the instruction set (immutable, tested, audited)
     ↓
AI Agent composes handlers into rules/verticals/workflows
     ↓
Simulator validates the composition (shadow test)
     ↓
Human approves → Production deployment
     ↓
Platform gains new capability WITHOUT code deployment
```

**This means:**
- New regulation? AI reads it and creates rules.
- New industry vertical? AI defines it from existing handlers.
- Customer-specific workflow? AI configures it.
- No developer in the loop for capability expansion.

### 9.2 What AI Agents Can Program

| Programmable Element | What It Is | Example |
|---------------------|------------|---------|
| **Vertical** | Industry-specific configuration | "Biocides", "Medical Devices", "Batteries" |
| **Workspace** | Role-based view within vertical | "Formulation", "Regulatory Affairs", "QA" |
| **Rule** | Compliance check composed from handlers | "SVHC > 0.1% requires notification" |
| **Entity Schema** | Data structure for vertical-specific data | Cosmetic formulation fields, battery cell chemistry |
| **Workflow** | State machine for product lifecycle | Draft → Review → Approved → Published |
| **UI Configuration** | How data is displayed/edited | Field order, required fields, conditional visibility |

### 9.3 MCP as the Universal Interface

**MCP (Model Context Protocol)** is how AI agents interact with the platform. Every programmable action is an MCP tool.

```
┌─────────────────────────────────────────────────────────────────┐
│                     AI AGENT (Claude, GPT, etc.)                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ MCP Protocol
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EUROCOMPLY MCP SERVER                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   META      │  │    OPS      │  │ INTELLIGENCE│             │
│  │   Tools     │  │    Tools    │  │    Tools    │             │
│  ├─────────────┤  ├─────────────┤  ├─────────────┤             │
│  │create_      │  │get_product  │  │analyze_gap  │             │
│  │  vertical   │  │update_      │  │interpret_   │             │
│  │create_rule  │  │  material   │  │  regulation │             │
│  │define_      │  │evaluate_    │  │explain_     │             │
│  │  workspace  │  │  compliance │  │  decision   │             │
│  │define_      │  │trace_       │  │classify     │             │
│  │  entity     │  │  substance  │  │             │             │
│  └──────┬──────┘  └─────────────┘  └─────────────┘             │
│         │                                                       │
│         │ Requires Simulator Approval                           │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    SIMULATOR                             │   │
│  │  Shadow Schema → Validate → Diff Report → Human Approve  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  HANDLER STANDARD LIBRARY                       │
│            (48 immutable, tested, audited primitives)           │
└─────────────────────────────────────────────────────────────────┘
```

### 9.4 Example: AI Creates a "Biocides" Vertical

Here's the complete flow of an AI agent creating a new industry vertical:

**Step 1: AI Reads the Regulation**

```typescript
// AI uses intelligence tools to understand EU Biocidal Products Regulation
const interpretation = await mcp.call('eurocomply:interpret_regulation', {
  regulation: { id: 'EU_BPR_528_2012' },
  questions: [
    { id: 'product_types', question: 'What are the 22 biocidal product types?', answer_type: 'category' },
    { id: 'approval_requirements', question: 'What are the active substance approval requirements?', answer_type: 'action_required' },
    { id: 'efficacy_requirements', question: 'What efficacy data is required?', answer_type: 'freeform' }
  ]
});
```

**Step 2: AI Defines the Vertical**

```typescript
// AI composes a vertical definition
const verticalDefinition = await mcp.call('eurocomply:create_vertical', {
  vertical: {
    id: 'biocides',
    name: 'Biocidal Products',
    description: 'EU BPR 528/2012 compliance for biocidal products',

    // Which GSR personas does this vertical use?
    gsr_personas: ['substance_biocide', 'substance_hazard_classification'],

    // Vertical-specific configuration
    config: {
      product_types: [1, 2, 3, 4, 5, /* ... 22 types */],
      requires_active_substance_approval: true,
      efficacy_data_required: true
    }
  }
});
// Returns: { status: 'pending_simulation', simulation_id: 'sim_123' }
```

**Step 3: AI Defines Workspaces**

```typescript
// AI creates workspaces for different roles
await mcp.call('eurocomply:define_workspace', {
  vertical_id: 'biocides',
  workspaces: [
    {
      code: 'formulation',
      name: 'Product Formulation',
      description: 'Define biocidal product composition',
      available_roles: ['VIEWER', 'CONTRIBUTOR', 'EDITOR', 'MANAGER'],
      icon: 'flask',
      color: 'green'
    },
    {
      code: 'regulatory',
      name: 'Regulatory Dossier',
      description: 'Prepare and manage authorization dossiers',
      available_roles: ['VIEWER', 'CONTRIBUTOR', 'EDITOR', 'MANAGER'],
      icon: 'document',
      color: 'blue'
    },
    {
      code: 'efficacy',
      name: 'Efficacy Testing',
      description: 'Manage efficacy studies and claims',
      available_roles: ['VIEWER', 'CONTRIBUTOR', 'EDITOR'],
      icon: 'microscope',
      color: 'purple'
    }
  ]
});
```

**Step 4: AI Defines Entity Schemas**

```typescript
// AI creates vertical-specific data structures
await mcp.call('eurocomply:define_entity', {
  vertical_id: 'biocides',
  entities: [
    {
      code: 'biocidal_product',
      name: 'Biocidal Product',
      extends_entity: 'product',  // Extends base product

      data_schema: {
        type: 'object',
        properties: {
          product_type: {
            type: 'integer',
            enum: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
            description: 'BPR Product Type (PT1-PT22)'
          },
          active_substances: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                substance_id: { type: 'string', format: 'uuid' },
                concentration: { type: 'number' },
                concentration_unit: { type: 'string', enum: ['PERCENT', 'G_L', 'G_KG'] },
                function: { type: 'string', enum: ['BIOCIDAL', 'SYNERGIST'] }
              }
            }
          },
          target_organisms: {
            type: 'array',
            items: { type: 'string' },
            description: 'Target harmful organisms'
          },
          application_method: { type: 'string' },
          authorization_status: {
            type: 'string',
            enum: ['NOT_SUBMITTED', 'UNDER_REVIEW', 'AUTHORIZED', 'REFUSED', 'WITHDRAWN']
          },
          authorization_number: { type: 'string' },
          authorization_expiry: { type: 'string', format: 'date' }
        },
        required: ['product_type', 'active_substances', 'target_organisms']
      }
    }
  ]
});
```

**Step 5: AI Creates Rules by Composing Handlers**

```typescript
// AI creates compliance rules using handler composition
await mcp.call('eurocomply:create_rule', {
  vertical_id: 'biocides',
  rules: [
    {
      code: 'BPR_ACTIVE_SUBSTANCE_APPROVED',
      name: 'Active Substance Must Be Approved',
      description: 'All active substances must be on the Union list of approved substances',
      regulation_id: 'EU_BPR_528_2012',
      severity: 'BLOCKER',

      // Rule logic composed from handlers
      logic: {
        handler: 'core:for_each',
        config: {
          source: { entity: 'biocidal_product', path: 'active_substances' },
          validation: {
            handler: 'core:list_check',
            config: {
              value: { field: 'substance_id' },
              list_type: 'positive',
              list_source: {
                type: 'gsr_table',
                table: 'substance_biocide',
                lookup_field: 'substance_id'
              }
            }
          },
          require: 'all'
        }
      },

      applies_to: {
        entity_types: ['biocidal_product'],
        markets: ['EU']
      }
    },
    {
      code: 'BPR_PT_VALID',
      name: 'Product Type Must Be Valid',
      description: 'Product must declare a valid BPR product type (PT1-PT22)',
      severity: 'BLOCKER',

      logic: {
        handler: 'core:enum_check',
        config: {
          value: { field: 'product_type' },
          allowed_values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]
        }
      }
    },
    {
      code: 'BPR_CMR_PROHIBITION',
      name: 'CMR Substances Restricted',
      description: 'CMR 1A/1B substances not allowed unless essential use exemption',
      severity: 'BLOCKER',

      logic: {
        handler: 'core:for_each',
        config: {
          source: { entity: 'biocidal_product', path: 'active_substances' },
          validation: {
            handler: 'core:or',
            config: {
              conditions: [
                {
                  handler: 'core:absence_check',
                  config: {
                    source: { entity: 'substance_hazard_classification' },
                    prohibited: {
                      field: 'hazard_class_code',
                      operator: 'in',
                      value: ['Carc. 1A', 'Carc. 1B', 'Muta. 1A', 'Muta. 1B', 'Repr. 1A', 'Repr. 1B']
                    }
                  },
                  label: 'Substance is not CMR 1A/1B'
                },
                {
                  handler: 'core:document_check',
                  config: {
                    required_documents: [{ type: 'cmr_essential_use_exemption' }]
                  },
                  label: 'Has essential use exemption'
                }
              ]
            }
          },
          require: 'all'
        }
      }
    }
  ]
});
```

**Step 6: Simulator Validates**

The Simulator automatically:
1. Creates shadow schema with new vertical
2. Runs validation dataset (synthetic biocidal products)
3. Checks for conflicts with existing rules
4. Generates diff report

```typescript
// Simulator returns diff report
const simulationResult = await mcp.call('eurocomply:get_simulation_result', {
  simulation_id: 'sim_123'
});

// Result:
{
  status: 'ready_for_review',
  diff_report: {
    proposed_changes: [
      { type: 'vertical', action: 'create', id: 'biocides' },
      { type: 'workspace', action: 'create', count: 3 },
      { type: 'entity', action: 'create', count: 1 },
      { type: 'rule', action: 'create', count: 3 }
    ],
    validation_results: {
      test_products_evaluated: 50,
      expected_compliant: 35,
      actual_compliant: 35,
      expected_non_compliant: 15,
      actual_non_compliant: 15,
      accuracy: 1.0
    },
    conflict_check: {
      conflicts_found: 0
    },
    recommendation: 'approve',
    recommendation_reason: 'All validation tests passed, no conflicts with existing rules'
  }
}
```

**Step 7: Human Approves**

Human reviews the diff report in the admin UI and approves. The vertical goes live.

### 9.5 META vs OPS: The Safety Boundary

| Category | What It Changes | Approval Required | Rollback |
|----------|-----------------|-------------------|----------|
| **META** | Platform structure | Full Simulator + Human | Complex (migration) |
| **OPS** | Tenant data | Auto if within rules | Easy (event replay) |

**META Changes (Require Simulator):**
- Create/modify vertical
- Create/modify workspace
- Create/modify rule
- Create/modify entity schema
- Change workflow definition
- Modify UI configuration

**OPS Changes (Auto-Approve if Valid):**
- Create/update product
- Add/modify material
- Upload document
- Run compliance evaluation
- Generate report
- Request credential

### 9.6 The Four "God-Tier" User Stories

These user stories demonstrate the full power of the AI-Programmable Platform:

#### Story 1: "Read this PDF and make me compliant"

```
User uploads regulatory PDF
     ↓
AI: ai:document_extract → extracts requirements
     ↓
AI: eurocomply:create_rule → creates rules for each requirement
     ↓
Simulator validates rules against test products
     ↓
Human approves
     ↓
AI: eurocomply:analyze_gap → identifies gaps in user's products
     ↓
AI: ai:explain → explains what needs to change in plain language
```

#### Story 2: "What happens if the EU bans PFAS?"

```
User asks impact question
     ↓
AI: core:impact_analysis → graph traversal finds all affected products
     ↓
AI: core:find_substitute → identifies alternatives for each use case
     ↓
AI: core:action_sequence → optimal reformulation sequence
     ↓
AI: ai:document_generate → creates impact report for management
```

#### Story 3: "Get me proof my suppliers are compliant"

```
User requests supplier compliance verification
     ↓
AI: core:trace_upstream → identifies all suppliers in chain
     ↓
AI: eurocomply:request_credential → A2A: asks each supplier's AI for VCs
     ↓
AI: core:credential_check → validates received credentials
     ↓
AI: ai:document_generate → creates verified supplier compliance report
```

#### Story 4: "We're entering the medical devices market"

```
User declares new market entry
     ↓
AI: ai:compliance_interpret → reads MDR regulation
     ↓
AI: eurocomply:create_vertical → defines medical_devices vertical
     ↓
AI: eurocomply:define_workspace → creates Clinical, QMS, RA workspaces
     ↓
AI: eurocomply:create_rule → creates MDR compliance rules
     ↓
Simulator validates
     ↓
Human approves
     ↓
AI: eurocomply:analyze_gap → shows user what they need for certification
```

### 9.7 Why This Matters: The Competitive Moat

This architecture creates an **insurmountable competitive advantage**:

1. **Network Effects**: Every rule created by AI makes the platform smarter
2. **Data Flywheel**: More usage → better AI → more capability → more usage
3. **Composability**: 48 handlers combine into unlimited rules
4. **Safety**: Simulator ensures AI can't break production
5. **Trust**: Explanations make every decision auditable
6. **Speed**: New regulations → new rules in hours, not months
7. **Customization**: Each tenant gets AI-configured workflows

**The result:** EuroComply becomes an **industrial infrastructure** that gets better with every customer, every regulation, every AI interaction.

---

## 10. MCP Tool Interface

The Handler Standard Library is exposed via **MCP (Model Context Protocol)** as the Universal Interface.

### 10.1 MCP Tool Categories

```typescript
// MCP exposes handlers grouped by capability
const mcpTools = {
  // OPERATIONS - working with products, materials, compliance
  'eurocomply:evaluate_compliance': { /* invokes handler composition */ },
  'eurocomply:get_product': { /* read product data */ },
  'eurocomply:update_material': { /* modify material */ },
  'eurocomply:trace_substance': { /* graph traversal */ },

  // INTELLIGENCE - AI-powered analysis
  'eurocomply:analyze_gap': { /* ai:gap_analysis */ },
  'eurocomply:interpret_regulation': { /* ai:compliance_interpret */ },
  'eurocomply:explain_decision': { /* ai:explain */ },

  // META - programming the platform (requires Simulator)
  'eurocomply:create_rule': { /* compose handlers into rule */ },
  'eurocomply:create_vertical': { /* define new vertical */ },
  'eurocomply:define_workspace': { /* configure workspace */ },

  // INTEGRATION - external systems
  'eurocomply:fetch_sds': { /* retrieve from supplier */ },
  'eurocomply:submit_notification': { /* ECHA submission */ },
  'eurocomply:request_credential': { /* A2A credential exchange */ },
};
```

### 10.2 META vs OPS Changes

| Change Type | Examples | Approval Required |
|-------------|----------|-------------------|
| **META** | Create vertical, define rule, modify schema | Full Simulator approval |
| **OPS** | Update product, add material, run evaluation | Auto-approve if within rules |

---

## 11. The Simulator

The Simulator provides **human-in-the-loop safety** for META changes.

### 11.1 Simulator Flow

```
AI Agent proposes META change (e.g., new rule)
        ↓
┌─────────────────────────────────┐
│         SIMULATOR               │
├─────────────────────────────────┤
│ 1. Shadow Schema                │  ← Copy current state
│ 2. Apply Proposed Change        │  ← In shadow only
│ 3. Run Validation Dataset       │  ← Known products/scenarios
│ 4. Generate Diff Report         │  ← What changed?
│ 5. Risk Assessment              │  ← Impact analysis
└─────────────────────────────────┘
        ↓
Human Reviews Diff Report
        ↓
APPROVE → Apply to Production
REJECT  → Discard, AI learns why
```

### 11.2 Diff Report Contents

```typescript
interface SimulatorDiffReport {
  proposed_change: {
    type: 'rule' | 'vertical' | 'workspace' | 'handler_config';
    description: string;
    proposed_by: string;           // AI agent ID
  };

  validation_results: {
    products_tested: number;
    status_changes: Array<{
      product_id: string;
      product_name: string;
      before: 'compliant' | 'non_compliant' | 'unknown';
      after: 'compliant' | 'non_compliant' | 'unknown';
      reason: string;
    }>;
  };

  impact_assessment: {
    products_newly_non_compliant: number;
    products_newly_compliant: number;
    false_positive_risk: 'low' | 'medium' | 'high';
    false_negative_risk: 'low' | 'medium' | 'high';
  };

  recommendation: 'approve' | 'review_carefully' | 'reject';
  recommendation_reason: string;
}
```

### 11.3 Validation Dataset

Each vertical maintains a validation dataset:

```typescript
interface ValidationDataset {
  vertical_id: string;

  test_cases: Array<{
    id: string;
    description: string;
    product_data: object;          // Synthetic or anonymized real data
    expected_status: 'compliant' | 'non_compliant';
    expected_reasons?: string[];
    edge_case_type?: string;       // 'boundary', 'exemption', 'multi-rule'
  }>;

  coverage: {
    rules_covered: string[];
    scenarios_covered: string[];
  };
}
```

---

## 12. Implementation Plan

### Phase 1: Core Infrastructure (Week 1)

1. Handler base interfaces and types
2. Explanation/Trace system
3. Handler registry
4. Unit test framework for handlers

### Phase 2: Computation Handlers (Week 1)

1. `core:bom_sum`, `core:bom_max`, `core:bom_min`
2. `core:bom_weighted` (critical)
3. `core:count`, `core:rollup`, `core:average`, `core:ratio`
4. `core:unit_convert`

### Phase 3: Validation Handlers (Week 2)

1. `core:threshold_check`, `core:presence_check`, `core:absence_check`
2. `core:list_check`, `core:date_check`
3. `core:document_check`, `core:credential_check`
4. `core:enum_check`, `core:pattern_check`, `core:completeness_check`

### Phase 4: Logic Gates (Week 2)

1. `core:and`, `core:or`, `core:not`
2. `core:if_then`, `core:for_each`
3. Composition tests (complex rule scenarios)

### Phase 5: Graph Handlers (Week 3)

1. Neo4j connection and query builder
2. `core:trace_upstream`, `core:trace_downstream`
3. `core:find_path`, `core:impact_analysis`
4. `core:subgraph_extract`, `core:shortest_path`, `core:neighbors`, `core:cycle_detect`

### Phase 6: Resolution Handlers (Week 3)

1. `core:data_conflict_resolve`, `core:entity_match`
2. `core:find_substitute`, `core:regulatory_conflict_resolve`
3. `core:priority_rank`, `core:version_select`
4. `core:threshold_interpolate`, `core:action_sequence`

### Phase 7: AI Handlers (Week 4)

1. LLM integration infrastructure
2. `ai:document_extract`, `ai:classify`
3. `ai:compliance_interpret`, `ai:gap_analysis`
4. `ai:natural_query`, `ai:document_generate`
5. `ai:anomaly_detect`, `ai:explain`

### Phase 8: MCP & Simulator (Week 4-5)

1. MCP tool definitions
2. Simulator shadow schema
3. Validation dataset infrastructure
4. Diff report generation
5. Human approval workflow

---

## Appendix A: Complete Handler Reference

| ID | Category | Purpose |
|----|----------|---------|
| `core:bom_sum` | Computation | Sum field across BOM |
| `core:bom_max` | Computation | Find maximum value |
| `core:bom_min` | Computation | Find minimum value |
| `core:bom_weighted` | Computation | Cascading weighted calculation |
| `core:count` | Computation | Count items matching criteria |
| `core:rollup` | Computation | Aggregate children to parent |
| `core:average` | Computation | Calculate mean |
| `core:ratio` | Computation | Calculate ratio |
| `core:unit_convert` | Computation | Convert between units |
| `core:threshold_check` | Validation | Compare against limit |
| `core:presence_check` | Validation | Verify item exists |
| `core:absence_check` | Validation | Verify item NOT present |
| `core:list_check` | Validation | Check against reference list |
| `core:date_check` | Validation | Validate dates |
| `core:document_check` | Validation | Verify attachments |
| `core:credential_check` | Validation | Validate VCs |
| `core:enum_check` | Validation | Value in allowed set |
| `core:pattern_check` | Validation | Format validation |
| `core:completeness_check` | Validation | All fields populated |
| `core:and` | Logic | All conditions pass |
| `core:or` | Logic | At least one passes |
| `core:not` | Logic | Invert result |
| `core:if_then` | Logic | Conditional validation |
| `core:for_each` | Logic | Apply to collection |
| `core:trace_upstream` | Graph | Trace to origins |
| `core:trace_downstream` | Graph | Find all affected |
| `core:find_path` | Graph | Find compliance path |
| `core:subgraph_extract` | Graph | Extract for analysis |
| `core:impact_analysis` | Graph | Cascading change impact |
| `core:shortest_path` | Graph | Simple path finding |
| `core:neighbors` | Graph | Immediate connections |
| `core:cycle_detect` | Graph | Find circular refs |
| `core:data_conflict_resolve` | Resolution | Choose between conflicts |
| `core:find_substitute` | Resolution | Find replacements |
| `core:regulatory_conflict_resolve` | Resolution | Harmonize requirements |
| `core:priority_rank` | Resolution | Rank by criteria |
| `core:entity_match` | Resolution | Match/deduplicate |
| `core:version_select` | Resolution | Select version |
| `core:threshold_interpolate` | Resolution | Calculate between points |
| `core:action_sequence` | Resolution | Optimal ordering |
| `ai:document_extract` | AI | Extract from documents |
| `ai:compliance_interpret` | AI | Interpret regulations |
| `ai:gap_analysis` | AI | Identify gaps |
| `ai:natural_query` | AI | Answer questions |
| `ai:document_generate` | AI | Generate documents |
| `ai:classify` | AI | Classify categories |
| `ai:anomaly_detect` | AI | Find patterns |
| `ai:explain` | AI | Generate explanations |

---

## Appendix B: Example Rule Composition

### REACH Article 33: SVHC Communication Obligation

```typescript
const reachArticle33Rule = {
  id: 'REACH_ART33_SVHC',
  name: 'REACH Article 33 SVHC Communication',
  vertical_id: 'chemicals',
  regulation_id: 'REACH',

  logic: {
    handler: 'core:for_each',
    config: {
      source: {
        entity: 'materials',
        path: 'substances',
        filter: { field: 'on_svhc_list', operator: 'eq', value: true }
      },
      validation: {
        handler: 'core:or',
        config: {
          conditions: [
            // Path A: Below threshold
            {
              handler: 'core:threshold_check',
              config: {
                value: { handler: 'core:bom_weighted', config: { /* ... */ } },
                operator: 'lt',
                threshold: 0.001
              },
              label: 'Concentration below 0.1% w/w'
            },
            // Path B: Above threshold but obligations met
            {
              handler: 'core:and',
              config: {
                conditions: [
                  {
                    handler: 'core:document_check',
                    config: { required_documents: [{ type: 'echa_scip_notification' }] },
                    label: 'SCIP notification submitted'
                  },
                  {
                    handler: 'core:completeness_check',
                    config: {
                      required_fields: [{ path: 'svhc_safety_info', description: 'SVHC safety info' }]
                    },
                    label: 'Customer safety info provided'
                  }
                ]
              },
              label: 'Communication obligations met'
            }
          ]
        }
      },
      require: 'all'
    }
  }
};
```

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-02-02 | Initial design from brainstorming session |

---

*The Handler Standard Library transforms EuroComply from a "compliance checking tool" into an "AI-Programmable Compliance Operating System" - where AI agents can safely program regulatory logic while humans maintain oversight through the Simulator.*
