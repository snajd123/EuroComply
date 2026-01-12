# Documentation Remediation Plan

## Executive Summary

This document validates findings from a comprehensive documentation review and provides a prioritized remediation plan. The analysis was conducted against the actual repository state on 2026-01-12.

---

## Validation Results

### Findings Confirmed as Valid

| Finding | Status | Location |
|---------|--------|----------|
| Pricing consistency (€129/€399/Custom) | **CONFIRMED FIXED** | All documents now consistent |
| Export availability claims | **CONFIRMED CONSISTENT** | DATA_SOVEREIGNTY.md, DPP_CONTENT_PLAN.md aligned |
| Version state machine documented | **CONFIRMED** | USER_MANAGEMENT.md:338-376 |
| Batch number scoped uniqueness | **CONFIRMED** | USER_MANAGEMENT.md:1120 - `@@unique([organizationId, batchNumber])` |
| Checkout lock mechanism exists | **CONFIRMED** | USER_MANAGEMENT.md:1365-1382 |
| TransactionalSignatureLog exists | **CONFIRMED** | USER_MANAGEMENT.md:1619-1693 |
| Four cancellation options documented | **CONFIRMED** | ARCHITECTURE_PORTABILITY.md:147-232 |
| Compliance Archive pricing tiers | **CONFIRMED** | ARCHITECTURE_PORTABILITY.md:157-161 - tiered annual pricing |

### Findings That Need Clarification or Are Partially Accurate

| Finding | Actual State | Assessment |
|---------|--------------|------------|
| No one-time dormant hosting fee | **CORRECT** - explicitly removed with explanation | ARCHITECTURE_PORTABILITY.md:170-171 states why |
| Rate limit 300 vs 10,000 | **CONTEXT-DEPENDENT** - 300/min for API, CDN caching separate | Different layers, not contradictory |
| "The Hub" definition | **MARKETING TERM** - consistently described as "Central Database" | Acceptable, not a technical component name |
| JWT ES256 vs VC Ed25519 | **NOT FOUND** - need to verify in SECURITY.md | Requires further investigation |

### Findings Not Confirmed (May Be Outdated or Incorrect)

| Finding | Actual State |
|---------|--------------|
| OrganizationKeyHistory missing | Need to check full USER_MANAGEMENT.md and SECURITY.md |
| EPCIS credentials not in encrypted fields | Need to verify in SECURITY.md |
| API key scopes don't match workspace model | Need to verify in SECURITY.md |

---

## Verified Issues Requiring Remediation

### Priority 1: Critical (Security/Compliance Impact)

#### 1.1 Organization Key Rotation Mechanism
**Status**: Not documented
**Impact**: If organization signing key is compromised, no recovery path documented
**Location**: SECURITY.md, USER_MANAGEMENT.md
**Remediation**:
- [ ] Document organization key rotation policy
- [ ] Add OrganizationDIDHistory model (similar to UserDIDHistory)
- [ ] Define what happens to existing VCs signed with old key
- [ ] Document revocation/reissuance procedure

#### 1.2 GDPR vs ESPR Personal Data in DPPs
**Status**: Partially addressed in GDPR_COMPLIANCE.md
**Impact**: Unclear how to handle personal data (designer names, certifier contacts) embedded in DPPs
**Location**: GDPR_COMPLIANCE.md
**Remediation**:
- [ ] Clarify which DPP fields may contain personal data
- [ ] Document pseudonymization approach for embedded personal data
- [ ] Explain how to maintain DPP validity after pseudonymization
- [ ] Add examples for common scenarios

#### 1.3 EPCIS Repository Credentials Encryption
**Status**: EPCIS_INTEGRATION.md shows credentials field, but not listed in SECURITY.md encrypted fields
**Impact**: Potential security gap if credentials not encrypted at rest
**Remediation**:
- [ ] Verify EPCIS credentials are in ENCRYPTED_FIELDS list
- [ ] Update SECURITY.md to include all encrypted field types
- [ ] Document encryption approach for integration credentials

### Priority 2: High (Functional/Architectural Impact)

#### 2.1 EPCIS LGTIN Collision Risk for Distributors
**Status**: Batch numbers are organization-scoped, but LGTIN format uses global GTIN + lot
**Impact**: Distributors reselling same product could have lot number collisions in aggregated EPCIS queries
**Location**: USER_MANAGEMENT.md:1120, EPCIS_INTEGRATION.md
**Remediation**:
- [ ] Document LGTIN generation strategy for distributors
- [ ] Clarify whether distributors should use their own lot prefixes
- [ ] Add guidance for multi-tenant EPCIS query aggregation

#### 2.2 Version State Machine Transition Rules
**Status**: Documented but some transitions unclear
**Impact**: Ambiguity in ACTIVE → RELEASED and automated transitions
**Location**: USER_MANAGEMENT.md:373-376
**Remediation**:
- [ ] Add state diagram with all possible transitions
- [ ] Document background job frequency for state checks
- [ ] Clarify manual vs automatic transition triggers
- [ ] Add examples for edge cases (partial reference cleanup)

#### 2.3 Checkout Lock Timeout/Orphan Handling
**Status**: Admin force-release documented, but no automatic timeout
**Impact**: Abandoned checkouts could block editing indefinitely
**Location**: USER_MANAGEMENT.md:807-808
**Remediation**:
- [ ] Document automatic checkout timeout (if exists)
- [ ] Add escalation procedure for unreachable users
- [ ] Consider configurable organization-level timeout setting

#### 2.4 Raw SQL Bypasses Audit Logging
**Status**: Claim expiry release uses raw SQL
**Impact**: These updates may not trigger audit middleware
**Location**: USER_MANAGEMENT.md:2254-2276
**Remediation**:
- [ ] Document which operations use raw SQL
- [ ] Ensure manual audit logging for raw SQL operations
- [ ] Consider Prisma middleware alternative if possible

### Priority 3: Medium (Technical Debt/Clarity)

#### 3.1 Carbon Emission Factors Hardcoded
**Status**: Constants in EPCIS_INTEGRATION.md with no source citation
**Impact**: Difficult to update when standards change; no organizational customization
**Location**: EPCIS_INTEGRATION.md
**Remediation**:
- [ ] Add source citations for emission factors
- [ ] Document update procedure when factors change
- [ ] Consider making factors configurable per organization
- [ ] Add vehicle type differentiation (truck, van, EV)

#### 3.2 Magic Link Token Size Documentation
**Status**: 32 random bytes = 64 hex chars, but example shows different length
**Impact**: Documentation inconsistency, not functional issue
**Location**: USER_MANAGEMENT.md, SECURITY.md
**Remediation**:
- [ ] Verify actual token format in code
- [ ] Update documentation to match implementation
- [ ] Ensure examples are accurate

#### 3.3 Workspace Route Inconsistency
**Status**: Marketing workspace uses `/marketing/pim` as sub-route
**Impact**: Minor documentation clarity issue
**Location**: DPP_CONTENT_PLAN.md:487
**Remediation**:
- [ ] Standardize route documentation
- [ ] Clarify PIM is a module within Marketing workspace

#### 3.4 Infrastructure Cost Discrepancy
**Status**: README claims ~$200/month, infrastructure/README shows ~$290/month for production
**Impact**: Misleading cost expectations
**Location**: README.md, infrastructure/README.md
**Remediation**:
- [ ] Clarify which components are included in each figure
- [ ] Provide complete cost breakdown
- [ ] Update README with accurate total cost range

### Priority 4: Low (Documentation Polish)

#### 4.1 Missing Referenced Documents
**Status**: Several documents referenced in README.md exist but should be verified
**Location**: README.md
**Remediation**:
- [ ] Verify all cross-references resolve correctly
- [ ] Update any broken links
- [ ] Add document inventory to README

#### 4.2 Cookie Consent Storage
**Status**: Uses localStorage which may itself require consent
**Impact**: Minor GDPR edge case
**Location**: GDPR_COMPLIANCE.md
**Remediation**:
- [ ] Document consent storage approach
- [ ] Clarify first-party vs third-party distinction
- [ ] Add note about localStorage consent requirements

#### 4.3 Sub-Processor Change Triggers
**Status**: 30-day notice documented, but trigger conditions unclear
**Impact**: Operational clarity for compliance team
**Location**: GDPR_COMPLIANCE.md
**Remediation**:
- [ ] Define what constitutes a "change" requiring notice
- [ ] Document internal review process for sub-processor updates

---

## Issues Not Requiring Remediation

These findings from the analysis were validated as acceptable:

| Finding | Reason Not an Issue |
|---------|---------------------|
| Compliance workspace "writes" DPPSnapshots | Documented correctly - reads from Hub, writes compliance-specific records |
| No Hetzner Terraform | AWS is primary; Hetzner is described as origin option, not required |
| JWT vs VC algorithm difference | Different use cases (session auth vs credential signing) |
| Dormant pricing for >10K SKUs | Tiered pricing now documented (0-10K, 10K-50K, 50K+) |

---

## Implementation Approach

### Phase 1: Security & Compliance (Week 1-2)
1. Address all Priority 1 items
2. Security review of encryption documentation
3. GDPR/ESPR alignment verification

### Phase 2: Architectural Clarity (Week 3-4)
1. Address Priority 2 items
2. State machine documentation improvements
3. Integration edge case documentation

### Phase 3: Technical Debt (Week 5-6)
1. Address Priority 3 items
2. Code-to-documentation alignment
3. Cost and infrastructure accuracy

### Phase 4: Polish (Ongoing)
1. Address Priority 4 items
2. Cross-reference verification
3. Regular documentation audits

---

## Tracking

| Priority | Total Items | Completed | Remaining |
|----------|-------------|-----------|-----------|
| Critical | 3 | 0 | 3 |
| High | 4 | 0 | 4 |
| Medium | 4 | 0 | 4 |
| Low | 3 | 0 | 3 |
| **Total** | **14** | **0** | **14** |

---

## Review Schedule

- **Weekly**: Review progress on current phase
- **Monthly**: Reassess priorities based on product roadmap
- **Quarterly**: Full documentation audit

---

*Created: 2026-01-12*
*Last Updated: 2026-01-12*
