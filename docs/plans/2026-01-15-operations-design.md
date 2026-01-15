# Operations Design

**Status:** Draft
**Date:** 2026-01-15
**Source:** OPERATIONAL_PROCEDURES.md, DISASTER_RECOVERY.md

---

## 1. Overview

This document covers operational design: incident response, disaster recovery, monitoring, and customer support procedures.

### Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Automated recovery** | Self-healing where possible |
| **Clear escalation** | Defined severity levels |
| **Proactive monitoring** | Catch issues before customers |
| **Minimal RTO/RPO** | Fast recovery, minimal data loss |

---

## 2. Service Level Objectives

### Availability Targets

| Tier | Target | Monthly Downtime |
|------|--------|------------------|
| Starter | 99.5% | 3.6 hours |
| Growth | 99.9% | 43 minutes |
| Scale | 99.9% | 43 minutes |
| Enterprise | 99.95% | 22 minutes |
| Platform | 99.99% | 4.3 minutes |

### Performance Targets

| Metric | Target |
|--------|--------|
| API Response (p95) | < 200ms |
| API Response (p99) | < 500ms |
| DPP Page Load | < 1s (cached) |
| Webhook Delivery | < 5s |

---

## 3. Incident Response

### Severity Levels

| Severity | Definition | Response Time | Examples |
|----------|------------|---------------|----------|
| **SEV1** | Complete outage | 15 min | Platform down, data breach |
| **SEV2** | Major degradation | 30 min | API errors > 5%, payment failures |
| **SEV3** | Minor degradation | 2 hours | Single feature broken |
| **SEV4** | Cosmetic/minor | 24 hours | UI glitch, non-critical bug |

### SEV1 Response Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    SEV1 INCIDENT RESPONSE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  T+0:00  Alert fires                                            │
│          • PagerDuty notifies on-call engineer                  │
│          • Status page: "Investigating"                         │
│                                                                  │
│  T+0:15  Initial assessment                                     │
│          • Identify scope and impact                            │
│          • Assign incident commander                            │
│          • Status page: "Identified"                            │
│                                                                  │
│  T+0:30  Mitigation begins                                      │
│          • Implement workaround if available                    │
│          • Customer notification if impact > 30 min             │
│          • Status page: "Monitoring"                            │
│                                                                  │
│  T+?     Resolution                                             │
│          • Root cause fixed or mitigated                        │
│          • Status page: "Resolved"                              │
│          • Postmortem scheduled within 48 hours                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Disaster Recovery

### Recovery Objectives

| Metric | Target | Implementation |
|--------|--------|----------------|
| **RTO** (Recovery Time) | < 1 hour | Automated failover |
| **RPO** (Recovery Point) | < 5 minutes | Continuous replication |

### Backup Strategy

| Data Type | Backup Method | Retention | Location |
|-----------|---------------|-----------|----------|
| PostgreSQL | Continuous WAL + daily snapshot | 30 days | S3 eu-central-1 |
| DynamoDB | Point-in-time recovery | 35 days | AWS managed |
| R2/S3 files | Cross-region replication | Indefinite | eu-west-1 secondary |
| Secrets | AWS Secrets Manager | Versioned | Multi-AZ |

### Failover Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MULTI-REGION FAILOVER                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PRIMARY: eu-central-1 (Frankfurt)                              │
│  ─────────────────────────────────                              │
│  • All writes go here                                           │
│  • Primary database                                             │
│  • Active API servers                                           │
│                                                                  │
│  SECONDARY: eu-west-1 (Ireland)                                 │
│  ────────────────────────────────                               │
│  • Read replicas                                                │
│  • Warm standby API servers                                     │
│  • R2/S3 replication target                                     │
│                                                                  │
│  CLOUDFLARE (Global)                                            │
│  ────────────────────                                           │
│  • DNS failover (health checks)                                 │
│  • CDN caches DPP pages                                         │
│  • Auto-routes on primary failure                               │
│                                                                  │
│  FAILOVER TRIGGER:                                              │
│  • 3 consecutive health check failures (30 seconds)             │
│  • Cloudflare auto-switches DNS to secondary                    │
│  • Manual promotion of read replica to primary                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Recovery Procedures

| Scenario | RTO | Procedure |
|----------|-----|-----------|
| Single AZ failure | < 5 min | Auto-failover within region |
| Region failure | < 1 hour | Promote secondary, update DNS |
| Database corruption | < 30 min | Restore from WAL to point-in-time |
| Ransomware/breach | < 4 hours | Restore from offline backup |

---

## 5. Monitoring Stack

### Infrastructure Monitoring

| Component | Tool | Alerts |
|-----------|------|--------|
| Server metrics | CloudWatch / Datadog | CPU > 80%, Memory > 85% |
| Database | RDS Performance Insights | Connections, query latency |
| CDN | Cloudflare Analytics | Error rate, cache hit ratio |
| Containers | ECS metrics | Task health, restarts |

### Application Monitoring

| Metric | Tool | Alert Threshold |
|--------|------|-----------------|
| API errors | Sentry | Error rate > 1% |
| API latency | Custom + Datadog | p99 > 1s |
| Queue depth | CloudWatch | Outbox lag > 60s |
| Webhook failures | Custom | Failure rate > 5% |

### Business Metrics

| Metric | Purpose |
|--------|---------|
| DPPs issued/day | Product health |
| API calls/customer | Usage patterns |
| Onboarding completion | Conversion |
| Support ticket volume | Customer satisfaction |

---

## 6. On-Call Rotation

### Schedule

| Role | Coverage | Escalation |
|------|----------|------------|
| Primary on-call | 24/7, weekly rotation | First responder |
| Secondary on-call | Backup if primary unavailable | Escalation |
| Engineering lead | SEV1/SEV2 escalation | Decision authority |

### Responsibilities

```
┌─────────────────────────────────────────────────────────────────┐
│  ON-CALL RESPONSIBILITIES                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ACKNOWLEDGE:                                                   │
│  • Respond to page within 15 minutes                            │
│  • Acknowledge in PagerDuty                                     │
│                                                                  │
│  ASSESS:                                                        │
│  • Determine severity                                           │
│  • Check monitoring dashboards                                  │
│  • Review recent deployments                                    │
│                                                                  │
│  ACT:                                                           │
│  • Mitigate immediately if possible                             │
│  • Escalate if beyond capability                                │
│  • Update status page                                           │
│                                                                  │
│  COMMUNICATE:                                                   │
│  • Log actions in incident channel                              │
│  • Notify stakeholders for SEV1/SEV2                            │
│  • Hand off at rotation end                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Customer Support

### Support Tiers

| Tier | Channel | Response SLA |
|------|---------|--------------|
| Starter | Email | 48 hours |
| Growth | Email + Chat | 24 hours |
| Scale | Email + Chat + Priority | 8 hours |
| Enterprise | Dedicated + Phone | 2 hours |
| Platform | Dedicated + SLA | 1 hour |

### Escalation Path

```
L1 Support (Helpdesk)
    │
    ▼ (Cannot resolve in 24h)
L2 Support (Technical)
    │
    ▼ (Requires code change)
Engineering
    │
    ▼ (Product decision needed)
Product Team
```

---

## 8. Subscription Lifecycle

### Cancellation Handling

```
┌─────────────────────────────────────────────────────────────────┐
│                    SUBSCRIPTION END                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DAY 0: Subscription ends                                       │
│  • Platform access suspended                                    │
│  • Export tools remain accessible                               │
│  • DPPs continue working                                        │
│                                                                  │
│  DAYS 1-30: Grace period                                        │
│  • Export all data                                              │
│  • Download signing keys                                        │
│  • DPPs continue working                                        │
│                                                                  │
│  DAY 30+: Post-cancellation                                     │
│  • Product data archived (not deleted)                          │
│  • DPPs continue working (10-year hosting included)            │
│  • Status list frozen (no new revocations)                     │
│  • VCs remain valid (did:key is self-contained)                │
│                                                                  │
│  10-YEAR HOSTING INCLUDED:                                      │
│  • Status list hosted for 10 years                             │
│  • DPP pages served for 10 years                               │
│  • Cost already collected in per-DPP fee                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Retention

| Data | Active | After Cancel | ESPR Requirement |
|------|--------|--------------|------------------|
| Product data | Full access | Archived 90 days | N/A |
| Issued DPPs | Full access | Hosted 10 years | 10 years minimum |
| Audit logs | Full access | Retained 7 years | ESPR compliance |
| Status lists | Live updates | Frozen state | 10 years |

---

## 9. Deployment Process

### CI/CD Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT PIPELINE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. PR Merged to main                                           │
│     └─ Triggers: Lint, TypeScript, Unit tests                   │
│                                                                  │
│  2. Build                                                       │
│     └─ Docker image built and tagged                            │
│                                                                  │
│  3. Integration Tests                                           │
│     └─ Against ephemeral environment                            │
│                                                                  │
│  4. Staging Deploy                                              │
│     └─ Auto-deploy to staging                                   │
│     └─ Smoke tests run                                          │
│                                                                  │
│  5. Production Deploy (Manual approval)                         │
│     └─ Canary: 5% traffic for 10 min                            │
│     └─ If healthy: Roll out to 100%                             │
│     └─ Auto-rollback on error spike                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Rollback Procedure

| Trigger | Action | Time |
|---------|--------|------|
| Error rate > 5% | Auto-rollback | < 2 min |
| Latency p99 > 2s | Auto-rollback | < 2 min |
| Manual decision | One-click rollback | < 5 min |

---

## 10. Security Incident Response

### Classification

| Type | Examples | Response |
|------|----------|----------|
| **Data breach** | Unauthorized access to customer data | SEV1, notify DPA within 72h |
| **Key compromise** | Signing key exposed | Disable key, bulk revoke VCs |
| **Vulnerability** | Critical CVE in dependency | Patch within 24h |
| **Phishing** | Customer credentials compromised | Force password reset |

### Key Compromise Procedure

```
┌─────────────────────────────────────────────────────────────────┐
│                    KEY COMPROMISE RESPONSE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  T+0:00  Compromise confirmed                                   │
│          • Disable compromised key                              │
│          • Alert security team                                  │
│                                                                  │
│  T+0:15  Impact assessment                                      │
│          • Identify VCs signed during suspicious window         │
│          • Notify affected organization                         │
│                                                                  │
│  T+0:30  Bulk revocation                                        │
│          • Revoke suspicious VCs via Status List                │
│          • Update all status list endpoints                     │
│                                                                  │
│  T+2:00  New identity                                           │
│          • Generate new keypair (new did:key)                   │
│          • This IS a new identity (intentional)                 │
│                                                                  │
│  T+24:00 Re-issuance                                            │
│          • Re-issue affected DPPs with new key                  │
│          • Notify supply chain partners of new DID              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 11. Related Documents

| Document | Purpose |
|----------|---------|
| [Operational Procedures](../OPERATIONAL_PROCEDURES.md) | Detailed procedures |
| [Disaster Recovery](../DISASTER_RECOVERY.md) | DR runbooks |
| [Security Design](./2026-01-15-security-design.md) | Security architecture |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-01-15 | Initial draft from operational docs |
